-- ============================================================
--  Migración: Canjes de premios (catálogo + canje atómico)
--  Ejecutar en Supabase SQL Editor sobre la base de puntos-app.
--  Requiere que ya exista el schema base (tablas tarjetas, clientes,
--  profiles y la función is_admin()).
-- ============================================================

-- ---------- Catálogo de premios ----------
create table if not exists public.premios (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  foto_url text,
  puntos_necesarios numeric(14,2) not null check (puntos_necesarios > 0),
  stock integer not null default 0 check (stock >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Historial de canjes (auditoría de canjes) ----------
create table if not exists public.canjes (
  id uuid primary key default gen_random_uuid(),
  premio_id uuid references public.premios(id) on delete set null,
  premio_titulo text,
  cliente_id uuid references public.clientes(id) on delete set null,
  cliente_nombre text,
  tarjeta_id uuid references public.tarjetas(id) on delete set null,
  numero_tarjeta text,
  puntos numeric(14,2) not null,          -- puntos gastados en el canje
  usuario_email text,
  created_at timestamptz not null default now()
);
create index if not exists idx_canjes_cliente on public.canjes(cliente_id);
create index if not exists idx_canjes_fecha on public.canjes(created_at);

-- ============================================================
--  Función RPC: canjear un premio de forma atómica
--  - Bloquea la tarjeta del cliente y el premio (for update)
--  - Valida: tarjeta activa, premio activo, stock > 0, puntos suficientes
--  - Descuenta puntos al cliente y stock al premio
--  - Registra el canje
-- ============================================================
create or replace function public.canjear_premio(
  p_cliente_id uuid,
  p_premio_id uuid,
  p_usuario_email text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_card public.tarjetas%rowtype;
  v_premio public.premios%rowtype;
  v_email text;
  v_nombre text;
  v_canje public.canjes%rowtype;
begin
  -- Tarjeta del cliente (bloqueada para evitar canjes concurrentes)
  select * into v_card from public.tarjetas where cliente_id = p_cliente_id for update;
  if not found then
    raise exception 'El cliente no tiene una tarjeta emitida';
  end if;
  if v_card.activa = false then
    raise exception 'La tarjeta del cliente está inactiva';
  end if;

  -- Premio (bloqueado para descontar stock de forma segura)
  select * into v_premio from public.premios where id = p_premio_id for update;
  if not found then
    raise exception 'Premio no encontrado';
  end if;
  if v_premio.activo = false then
    raise exception 'El premio no está disponible';
  end if;
  if v_premio.stock <= 0 then
    raise exception 'No hay stock disponible del premio';
  end if;
  if v_card.puntos < v_premio.puntos_necesarios then
    raise exception 'Puntos insuficientes: la tarjeta tiene % y el premio requiere %',
      v_card.puntos, v_premio.puntos_necesarios;
  end if;

  update public.tarjetas set puntos = puntos - v_premio.puntos_necesarios where id = v_card.id;
  update public.premios set stock = stock - 1 where id = v_premio.id;

  v_email := coalesce(p_usuario_email, (select email from public.profiles where id = auth.uid()));
  select nombre into v_nombre from public.clientes where id = p_cliente_id;

  insert into public.canjes (
    premio_id, premio_titulo, cliente_id, cliente_nombre, tarjeta_id, numero_tarjeta, puntos, usuario_email
  ) values (
    v_premio.id, v_premio.titulo, p_cliente_id, v_nombre, v_card.id, v_card.numero,
    v_premio.puntos_necesarios, v_email
  )
  returning * into v_canje;

  return json_build_object(
    'canje_id', v_canje.id,
    'premio', v_premio.titulo,
    'cliente', v_nombre,
    'puntos_usados', v_premio.puntos_necesarios,
    'puntos_restantes', v_card.puntos - v_premio.puntos_necesarios,
    'stock_restante', v_premio.stock - 1
  );
end;
$$;

grant execute on function public.canjear_premio(uuid, uuid, text) to authenticated;

-- ============================================================
--  Row Level Security
-- ============================================================
alter table public.premios enable row level security;
alter table public.canjes  enable row level security;

-- premios: lectura para autenticados (catálogo); escritura solo admin
drop policy if exists "premios select" on public.premios;
create policy "premios select" on public.premios
  for select to authenticated using (true);
drop policy if exists "premios admin" on public.premios;
create policy "premios admin" on public.premios
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- canjes: lectura para autenticados; la inserción la hace canjear_premio
-- (security definer). Sin update/delete -> quedan prohibidas por RLS.
drop policy if exists "canjes select" on public.canjes;
create policy "canjes select" on public.canjes
  for select to authenticated using (true);

-- ============================================================
--  Storage: bucket público para las fotos de los premios
-- ============================================================
insert into storage.buckets (id, name, public)
values ('premios', 'premios', true)
on conflict (id) do nothing;

-- Lectura pública de las imágenes
drop policy if exists "premios foto lectura" on storage.objects;
create policy "premios foto lectura" on storage.objects
  for select using (bucket_id = 'premios');

-- Escritura/borrado de imágenes solo para admin
drop policy if exists "premios foto insert" on storage.objects;
create policy "premios foto insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'premios' and public.is_admin());
drop policy if exists "premios foto update" on storage.objects;
create policy "premios foto update" on storage.objects
  for update to authenticated using (bucket_id = 'premios' and public.is_admin());
drop policy if exists "premios foto delete" on storage.objects;
create policy "premios foto delete" on storage.objects
  for delete to authenticated using (bucket_id = 'premios' and public.is_admin());
