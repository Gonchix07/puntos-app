-- ============================================================
--  Esquema de base de datos — App de Puntos (fidelización)
--  Ejecutar en Supabase: SQL Editor -> New query -> pegar -> Run
-- ============================================================

-- ---------- Perfiles de usuario (rol) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nombre text,
  role text not null default 'operador' check (role in ('admin', 'operador')),
  created_at timestamptz not null default now()
);

-- ---------- Clientes ----------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  dni text not null unique,
  email text,
  telefono text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Secuencia para el número de tarjeta ----------
-- 16 dígitos, arrancando en 0000 0000 1000 0100 (= entero 10000100).
create sequence if not exists public.tarjeta_numero_seq start with 10000100;

-- ---------- Tarjetas de puntos (una por cliente) ----------
create table if not exists public.tarjetas (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique
    default lpad(nextval('public.tarjeta_numero_seq')::text, 16, '0')
    check (numero ~ '^[0-9]{16}$'),
  cliente_id uuid not null unique references public.clientes(id) on delete cascade,
  puntos numeric(14,2) not null default 0 check (puntos >= 0),
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Configuración (fila única) ----------
-- pesos_por_punto: cuántos $ equivalen a 1 punto. Arranca en 1 punto / $1000.
create table if not exists public.config (
  id int primary key default 1,
  pesos_por_punto numeric(12,2) not null default 1000 check (pesos_por_punto > 0),
  updated_at timestamptz not null default now(),
  constraint config_unica check (id = 1)
);
insert into public.config (id) values (1) on conflict (id) do nothing;

-- ---------- Auditoría de carga de puntos ----------
-- Cada carga (manual o por API) queda registrada acá. Es la fuente de la
-- auditoría total y por cliente. No se permite update/delete (por RLS).
create table if not exists public.cargas (
  id uuid primary key default gen_random_uuid(),
  tarjeta_id uuid references public.tarjetas(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  numero_tarjeta text,
  cliente_nombre text,
  factura_numero text,
  factura_pesos numeric(14,2) not null check (factura_pesos > 0),
  pesos_por_punto numeric(12,2) not null,     -- snapshot de la config al momento
  puntos numeric(14,2) not null,              -- puntos otorgados en esta carga
  origen text not null default 'manual' check (origen in ('manual', 'api')),
  usuario_email text,
  created_at timestamptz not null default now()
);
create index if not exists idx_cargas_cliente on public.cargas(cliente_id);
create index if not exists idx_cargas_fecha on public.cargas(created_at);

-- ============================================================
--  Trigger: crear perfil automáticamente al registrarse
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'role', 'operador'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
--  Trigger: al crear un cliente se le emite su tarjeta única
-- ============================================================
create or replace function public.crear_tarjeta_cliente()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.tarjetas (cliente_id) values (new.id)
  on conflict (cliente_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_crear_tarjeta_cliente on public.clientes;
create trigger trg_crear_tarjeta_cliente
  after insert on public.clientes
  for each row execute procedure public.crear_tarjeta_cliente();

-- ============================================================
--  Helper: ¿el usuario actual es admin?
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ============================================================
--  Función RPC: cargar puntos de forma atómica
--  - Busca la tarjeta por número (acepta espacios y los ignora)
--  - Convierte $ -> puntos según config.pesos_por_punto
--  - Suma los puntos a la tarjeta y registra la carga (auditoría)
--  p_usuario_email: se usa cuando la llamada viene por API (service role,
--  sin auth.uid). En el front queda null y se resuelve por auth.uid().
-- ============================================================
create or replace function public.cargar_puntos(
  p_numero text,
  p_factura_pesos numeric,
  p_factura_numero text default null,
  p_origen text default 'manual',
  p_usuario_email text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_card public.tarjetas%rowtype;
  v_pxp numeric;
  v_puntos numeric;
  v_email text;
  v_nombre text;
  v_carga public.cargas%rowtype;
  v_numero text;
begin
  if p_factura_pesos is null or p_factura_pesos <= 0 then
    raise exception 'El importe de la factura debe ser mayor a cero';
  end if;

  v_numero := regexp_replace(coalesce(p_numero, ''), '\s', '', 'g');
  select * into v_card from public.tarjetas where numero = v_numero for update;
  if not found then
    raise exception 'Tarjeta no encontrada: %', p_numero;
  end if;
  if v_card.activa = false then
    raise exception 'La tarjeta está inactiva';
  end if;

  select pesos_por_punto into v_pxp from public.config where id = 1;
  if v_pxp is null or v_pxp <= 0 then v_pxp := 1000; end if;

  -- Puntos = parte entera de (pesos / pesos_por_punto)
  v_puntos := floor(p_factura_pesos / v_pxp);

  update public.tarjetas set puntos = puntos + v_puntos where id = v_card.id;

  v_email := coalesce(p_usuario_email, (select email from public.profiles where id = auth.uid()));
  select nombre into v_nombre from public.clientes where id = v_card.cliente_id;

  insert into public.cargas (
    tarjeta_id, cliente_id, numero_tarjeta, cliente_nombre,
    factura_numero, factura_pesos, pesos_por_punto, puntos, origen, usuario_email
  ) values (
    v_card.id, v_card.cliente_id, v_card.numero, v_nombre,
    nullif(trim(coalesce(p_factura_numero, '')), ''), p_factura_pesos, v_pxp, v_puntos,
    coalesce(p_origen, 'manual'), v_email
  )
  returning * into v_carga;

  return json_build_object(
    'carga_id', v_carga.id,
    'numero_tarjeta', v_card.numero,
    'cliente', v_nombre,
    'factura_numero', v_carga.factura_numero,
    'factura_pesos', p_factura_pesos,
    'pesos_por_punto', v_pxp,
    'puntos_otorgados', v_puntos,
    'puntos_totales', v_card.puntos + v_puntos
  );
end;
$$;

-- ============================================================
--  Trigger: proteger la secuencia/creación de clientes con card
--  No se puede eliminar un cliente con cargas registradas (histórico).
-- ============================================================
create or replace function public.prevenir_borrado_cliente()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.cargas where cliente_id = old.id) then
    raise exception 'No se puede eliminar un cliente con cargas de puntos registradas';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevenir_borrado_cliente on public.clientes;
create trigger trg_prevenir_borrado_cliente
  before delete on public.clientes
  for each row execute procedure public.prevenir_borrado_cliente();

-- ============================================================
--  Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.clientes enable row level security;
alter table public.tarjetas enable row level security;
alter table public.config   enable row level security;
alter table public.cargas   enable row level security;

-- profiles: cada uno ve el suyo; admin ve todos y puede modificar rol
drop policy if exists "perfil propio" on public.profiles;
create policy "perfil propio" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists "perfiles admin update" on public.profiles;
create policy "perfiles admin update" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- clientes: lectura para autenticados; escritura solo admin
drop policy if exists "clientes select" on public.clientes;
create policy "clientes select" on public.clientes
  for select to authenticated using (true);
drop policy if exists "clientes admin" on public.clientes;
create policy "clientes admin" on public.clientes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- tarjetas: lectura para autenticados; escritura solo admin (los puntos los
-- mueve la función cargar_puntos, que es security definer y omite RLS)
drop policy if exists "tarjetas select" on public.tarjetas;
create policy "tarjetas select" on public.tarjetas
  for select to authenticated using (true);
drop policy if exists "tarjetas admin" on public.tarjetas;
create policy "tarjetas admin" on public.tarjetas
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- config: lectura para autenticados; escritura solo admin
drop policy if exists "config select" on public.config;
create policy "config select" on public.config
  for select to authenticated using (true);
drop policy if exists "config admin" on public.config;
create policy "config admin" on public.config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- cargas: lectura para autenticados; la inserción la hace cargar_puntos
-- (security definer). Sin políticas de update/delete -> quedan prohibidas.
drop policy if exists "cargas select" on public.cargas;
create policy "cargas select" on public.cargas
  for select to authenticated using (true);

-- ============================================================
--  Permisos de ejecución de la función RPC para usuarios logueados
-- ============================================================
grant execute on function public.cargar_puntos(text, numeric, text, text, text) to authenticated;
