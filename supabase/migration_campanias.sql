-- ============================================================
--  Migración: Campañas (ofertas con % de descuento por cliente/grupo)
--  Ejecutar en Supabase SQL Editor. Requiere el schema base ya instalado.
--
--  - Grupos de clientes (para asignar campañas a un grupo completo)
--  - Locales comerciales (nombre, logo, dirección) — entidad nueva,
--    distinta de "comercios" (que se usa para la acumulación de puntos)
--  - Campañas: % de descuento, vigencia (desde/hasta), alcance General o
--    restringida a UN local, y destinatarios: clientes individuales y/o
--    grupos completos (se pueden combinar en la misma campaña)
--  - RPC campanias_vigentes_cliente(cliente, local?) para la API externa
-- ============================================================

-- ---------- Grupos de clientes ----------
create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

alter table public.clientes add column if not exists grupo_id uuid references public.grupos(id) on delete set null;
create index if not exists idx_clientes_grupo on public.clientes(grupo_id);

-- ---------- Locales comerciales ----------
create table if not exists public.locales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  logo_url text,
  direccion text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Campañas ----------
create table if not exists public.campanias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  descuento_porcentaje numeric(5,2) not null check (descuento_porcentaje > 0 and descuento_porcentaje <= 100),
  local_id uuid references public.locales(id) on delete set null,  -- null = general (todos los locales)
  fecha_desde date not null,
  fecha_hasta date,                                                 -- null = sin vencimiento
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  constraint campanias_vigencia_valida check (fecha_hasta is null or fecha_hasta >= fecha_desde)
);
create index if not exists idx_campanias_local on public.campanias(local_id);
create index if not exists idx_campanias_vigencia on public.campanias(fecha_desde, fecha_hasta);

-- Destinatarios: clientes individuales y grupos (se pueden combinar)
create table if not exists public.campania_clientes (
  campania_id uuid not null references public.campanias(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  primary key (campania_id, cliente_id)
);
create index if not exists idx_campania_clientes_cliente on public.campania_clientes(cliente_id);

create table if not exists public.campania_grupos (
  campania_id uuid not null references public.campanias(id) on delete cascade,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  primary key (campania_id, grupo_id)
);
create index if not exists idx_campania_grupos_grupo on public.campania_grupos(grupo_id);

-- ============================================================
--  RPC: campañas vigentes de un cliente, opcionalmente filtradas
--  por local (usada por la API externa de facturación)
--  - Sin p_local_id: devuelve TODAS las vigentes del cliente.
--  - Con p_local_id: devuelve las generales + las de ESE local.
-- ============================================================
create or replace function public.campanias_vigentes_cliente(
  p_cliente_id uuid,
  p_local_id uuid default null
)
returns table(
  campania_id uuid,
  nombre text,
  descripcion text,
  descuento_porcentaje numeric,
  local_id uuid,
  local_nombre text,
  fecha_desde date,
  fecha_hasta date
)
language sql
security definer set search_path = public
as $$
  select distinct c.id, c.nombre, c.descripcion, c.descuento_porcentaje,
         c.local_id, l.nombre, c.fecha_desde, c.fecha_hasta
  from public.campanias c
  left join public.locales l on l.id = c.local_id
  where c.activa = true
    and c.fecha_desde <= current_date
    and (c.fecha_hasta is null or c.fecha_hasta >= current_date)
    and (p_local_id is null or c.local_id is null or c.local_id = p_local_id)
    and (
      exists (
        select 1 from public.campania_clientes cc
        where cc.campania_id = c.id and cc.cliente_id = p_cliente_id
      )
      or exists (
        select 1 from public.campania_grupos cg
        join public.clientes cl on cl.grupo_id = cg.grupo_id
        where cg.campania_id = c.id and cl.id = p_cliente_id
      )
    )
  order by c.descuento_porcentaje desc;
$$;
grant execute on function public.campanias_vigentes_cliente(uuid, uuid) to authenticated;
grant execute on function public.campanias_vigentes_cliente(uuid, uuid) to service_role;

-- ============================================================
--  Row Level Security
-- ============================================================
alter table public.grupos enable row level security;
drop policy if exists "grupos select" on public.grupos;
create policy "grupos select" on public.grupos for select to authenticated using (true);
drop policy if exists "grupos admin" on public.grupos;
create policy "grupos admin" on public.grupos for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.locales enable row level security;
drop policy if exists "locales select" on public.locales;
create policy "locales select" on public.locales for select to authenticated using (true);
drop policy if exists "locales admin" on public.locales;
create policy "locales admin" on public.locales for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.campanias enable row level security;
drop policy if exists "campanias select" on public.campanias;
create policy "campanias select" on public.campanias for select to authenticated using (true);
drop policy if exists "campanias admin" on public.campanias;
create policy "campanias admin" on public.campanias for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.campania_clientes enable row level security;
drop policy if exists "campania_clientes select" on public.campania_clientes;
create policy "campania_clientes select" on public.campania_clientes for select to authenticated using (true);
drop policy if exists "campania_clientes admin" on public.campania_clientes;
create policy "campania_clientes admin" on public.campania_clientes for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.campania_grupos enable row level security;
drop policy if exists "campania_grupos select" on public.campania_grupos;
create policy "campania_grupos select" on public.campania_grupos for select to authenticated using (true);
drop policy if exists "campania_grupos admin" on public.campania_grupos;
create policy "campania_grupos admin" on public.campania_grupos for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================
--  Storage: bucket público para los logos de locales
-- ============================================================
insert into storage.buckets (id, name, public)
values ('locales', 'locales', true)
on conflict (id) do nothing;

drop policy if exists "locales logo lectura" on storage.objects;
create policy "locales logo lectura" on storage.objects
  for select using (bucket_id = 'locales');
drop policy if exists "locales logo insert" on storage.objects;
create policy "locales logo insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'locales' and public.is_admin());
drop policy if exists "locales logo update" on storage.objects;
create policy "locales logo update" on storage.objects
  for update to authenticated using (bucket_id = 'locales' and public.is_admin());
drop policy if exists "locales logo delete" on storage.objects;
create policy "locales logo delete" on storage.objects
  for delete to authenticated using (bucket_id = 'locales' and public.is_admin());
