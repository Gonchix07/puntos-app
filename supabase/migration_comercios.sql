-- ============================================================
--  Migración: Comercios (origen de la factura en cada carga)
--  Ejecutar en Supabase SQL Editor. Debe correrse DESPUÉS de las
--  migraciones anteriores (esta re-crea cargar_puntos con la firma final).
-- ============================================================

-- ---------- Tabla de comercios ----------
create table if not exists public.comercios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Columnas de comercio en cargas ----------
alter table public.cargas
  add column if not exists comercio_id uuid references public.comercios(id) on delete set null;
alter table public.cargas
  add column if not exists comercio_nombre text;
create index if not exists idx_cargas_comercio on public.cargas(comercio_id);

-- ---------- RLS de comercios ----------
alter table public.comercios enable row level security;
drop policy if exists "comercios select" on public.comercios;
create policy "comercios select" on public.comercios
  for select to authenticated using (true);
drop policy if exists "comercios admin" on public.comercios;
create policy "comercios admin" on public.comercios
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- cargar_puntos con comercio (firma final) ----------
drop function if exists public.cargar_puntos(text, numeric, text, text, text);
create or replace function public.cargar_puntos(
  p_numero text,
  p_factura_pesos numeric,
  p_factura_numero text default null,
  p_origen text default 'manual',
  p_usuario_email text default null,
  p_comercio_id uuid default null
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
  v_factura text;
  v_max numeric;
  v_comercio_nombre text;
begin
  if p_factura_pesos is null or p_factura_pesos <= 0 then
    raise exception 'El importe de la factura debe ser mayor a cero';
  end if;

  v_factura := nullif(trim(coalesce(p_factura_numero, '')), '');
  if v_factura is not null and exists (
    select 1 from public.cargas where factura_numero = v_factura
  ) then
    raise exception 'Ya existe una carga registrada con la factura %', v_factura;
  end if;

  v_numero := regexp_replace(coalesce(p_numero, ''), '\s', '', 'g');
  select * into v_card from public.tarjetas where numero = v_numero for update;
  if not found then
    raise exception 'Tarjeta no encontrada: %', p_numero;
  end if;
  if v_card.activa = false then
    raise exception 'La tarjeta está inactiva';
  end if;

  select pesos_por_punto, max_factura_pesos into v_pxp, v_max from public.config where id = 1;
  if v_pxp is null or v_pxp <= 0 then v_pxp := 1000; end if;
  if v_max is not null and p_factura_pesos > v_max then
    raise exception 'El importe supera el máximo permitido por factura (%)', v_max;
  end if;

  v_puntos := floor(p_factura_pesos / v_pxp);

  update public.tarjetas set puntos = puntos + v_puntos where id = v_card.id;

  v_email := coalesce(p_usuario_email, (select email from public.profiles where id = auth.uid()));
  select nombre into v_nombre from public.clientes where id = v_card.cliente_id;
  if p_comercio_id is not null then
    select nombre into v_comercio_nombre from public.comercios where id = p_comercio_id;
    if v_comercio_nombre is null then
      raise exception 'Comercio no encontrado';
    end if;
  end if;

  insert into public.cargas (
    tarjeta_id, cliente_id, numero_tarjeta, cliente_nombre, comercio_id, comercio_nombre,
    factura_numero, factura_pesos, pesos_por_punto, puntos, origen, usuario_email
  ) values (
    v_card.id, v_card.cliente_id, v_card.numero, v_nombre, p_comercio_id, v_comercio_nombre,
    v_factura, p_factura_pesos, v_pxp, v_puntos,
    coalesce(p_origen, 'manual'), v_email
  )
  returning * into v_carga;

  return json_build_object(
    'carga_id', v_carga.id,
    'numero_tarjeta', v_card.numero,
    'cliente', v_nombre,
    'comercio', v_comercio_nombre,
    'factura_numero', v_carga.factura_numero,
    'factura_pesos', p_factura_pesos,
    'pesos_por_punto', v_pxp,
    'puntos_otorgados', v_puntos,
    'puntos_totales', v_card.puntos + v_puntos
  );
end;
$$;

grant execute on function public.cargar_puntos(text, numeric, text, text, text, uuid) to authenticated;
