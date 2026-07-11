-- ============================================================
--  Migración: premios por comercio o generales + saldos por comercio
--  Ejecutar en Supabase SQL Editor. DESPUÉS de migration_comercios.sql.
--
--  Modelo: los puntos se acumulan POR COMERCIO (cada carga tiene su comercio).
--   - Premio de un comercio: se paga con el saldo de ESE comercio.
--   - Premio general: se paga con el TOTAL, descontando de los comercios
--     con más saldo primero (el detalle queda en canje_detalle).
-- ============================================================

-- 1) Premio: comercio_id null = general (para todos)
alter table public.premios
  add column if not exists comercio_id uuid references public.comercios(id) on delete set null;

-- 2) Canje: comercio del premio (null = general) + snapshot del nombre
alter table public.canjes add column if not exists comercio_id uuid references public.comercios(id) on delete set null;
alter table public.canjes add column if not exists comercio_nombre text;

-- 3) Detalle del canje: de qué comercio(s) salieron los puntos
create table if not exists public.canje_detalle (
  id uuid primary key default gen_random_uuid(),
  canje_id uuid not null references public.canjes(id) on delete cascade,
  comercio_id uuid references public.comercios(id) on delete set null,
  puntos numeric(14,2) not null check (puntos > 0)
);
create index if not exists idx_canje_detalle_canje on public.canje_detalle(canje_id);
create index if not exists idx_canje_detalle_comercio on public.canje_detalle(comercio_id);

alter table public.canje_detalle enable row level security;
drop policy if exists "canje_detalle select" on public.canje_detalle;
create policy "canje_detalle select" on public.canje_detalle
  for select to authenticated using (true);

-- 4) Vista: saldo neto por (cliente, comercio) = cargas(+) − detalle de canjes(−)
create or replace view public.saldos_por_comercio as
select m.cliente_id, m.comercio_id, sum(m.puntos)::numeric as puntos
from (
  select cliente_id, comercio_id, puntos from public.cargas where comercio_id is not null
  union all
  select k.cliente_id, d.comercio_id, -d.puntos
  from public.canje_detalle d
  join public.canjes k on k.id = d.canje_id
) m
group by m.cliente_id, m.comercio_id;

-- 5) Saldos por comercio de un cliente (para el front)
create or replace function public.saldos_cliente(p_cliente_id uuid)
returns table(comercio_id uuid, comercio_nombre text, puntos numeric)
language sql
security definer set search_path = public
as $$
  select s.comercio_id, co.nombre, s.puntos
  from public.saldos_por_comercio s
  join public.comercios co on co.id = s.comercio_id
  where s.cliente_id = p_cliente_id
  order by co.nombre;
$$;
grant execute on function public.saldos_cliente(uuid) to authenticated;

-- 6) cargar_puntos: el comercio pasa a ser OBLIGATORIO (puntos por comercio)
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
  if p_comercio_id is null then
    raise exception 'Debe indicarse el comercio de la factura';
  end if;
  select nombre into v_comercio_nombre from public.comercios where id = p_comercio_id;
  if v_comercio_nombre is null then
    raise exception 'Comercio no encontrado';
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

-- 7) canjear_premio: valida y descuenta según el tipo de premio
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
  v_costo numeric;
  v_saldo numeric;
  v_restante numeric;
  v_take numeric;
  v_rec record;
  v_com_nombre text;
begin
  -- Serializa cargas/canjes del cliente
  select * into v_card from public.tarjetas where cliente_id = p_cliente_id for update;
  if not found then raise exception 'El cliente no tiene una tarjeta emitida'; end if;
  if v_card.activa = false then raise exception 'La tarjeta del cliente está inactiva'; end if;

  select * into v_premio from public.premios where id = p_premio_id for update;
  if not found then raise exception 'Premio no encontrado'; end if;
  if v_premio.activo = false then raise exception 'El premio no está disponible'; end if;
  if v_premio.stock <= 0 then raise exception 'No hay stock disponible del premio'; end if;

  v_costo := v_premio.puntos_necesarios;
  select nombre into v_nombre from public.clientes where id = p_cliente_id;
  v_email := coalesce(p_usuario_email, (select email from public.profiles where id = auth.uid()));

  if v_premio.comercio_id is not null then
    -- Premio de comercio: solo el saldo de ese comercio
    select coalesce(sum(puntos), 0) into v_saldo from public.saldos_por_comercio
      where cliente_id = p_cliente_id and comercio_id = v_premio.comercio_id;
    if v_saldo < v_costo then
      raise exception 'Puntos insuficientes en el comercio: disponibles %, se requieren %', v_saldo, v_costo;
    end if;
    select nombre into v_com_nombre from public.comercios where id = v_premio.comercio_id;
  else
    -- Premio general: total acumulado
    select coalesce(sum(puntos), 0) into v_saldo from public.saldos_por_comercio
      where cliente_id = p_cliente_id;
    if v_saldo < v_costo then
      raise exception 'Puntos insuficientes: disponibles %, se requieren %', v_saldo, v_costo;
    end if;
  end if;

  insert into public.canjes (
    premio_id, premio_titulo, cliente_id, cliente_nombre, tarjeta_id, numero_tarjeta,
    puntos, comercio_id, comercio_nombre, usuario_email
  ) values (
    v_premio.id, v_premio.titulo, p_cliente_id, v_nombre, v_card.id, v_card.numero,
    v_costo, v_premio.comercio_id, v_com_nombre, v_email
  )
  returning * into v_canje;

  if v_premio.comercio_id is not null then
    insert into public.canje_detalle (canje_id, comercio_id, puntos)
      values (v_canje.id, v_premio.comercio_id, v_costo);
  else
    -- Reparte el costo entre comercios, del que más saldo tiene primero
    v_restante := v_costo;
    for v_rec in
      select comercio_id, puntos from public.saldos_por_comercio
      where cliente_id = p_cliente_id and puntos > 0
      order by puntos desc
    loop
      exit when v_restante <= 0;
      v_take := least(v_rec.puntos, v_restante);
      insert into public.canje_detalle (canje_id, comercio_id, puntos)
        values (v_canje.id, v_rec.comercio_id, v_take);
      v_restante := v_restante - v_take;
    end loop;
  end if;

  update public.tarjetas set puntos = puntos - v_costo where id = v_card.id;
  update public.premios set stock = stock - 1 where id = v_premio.id;

  return json_build_object(
    'canje_id', v_canje.id,
    'premio', v_premio.titulo,
    'cliente', v_nombre,
    'general', v_premio.comercio_id is null,
    'comercio', v_com_nombre,
    'puntos_usados', v_costo,
    'puntos_restantes', v_card.puntos - v_costo,
    'stock_restante', v_premio.stock - 1
  );
end;
$$;
grant execute on function public.canjear_premio(uuid, uuid, text) to authenticated;
