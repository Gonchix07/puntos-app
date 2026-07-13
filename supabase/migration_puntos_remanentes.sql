-- ============================================================
--  Migración: Puntos Remanentes (reserva de canjes pendientes)
--  Ejecutar en Supabase SQL Editor. DESPUÉS de migration_solicitudes.sql.
--
--  puntos            = puntos ACUMULADOS (reales; solo bajan al confirmar)
--  puntos_remanentes = disponibles = acumulados − canjes pendientes
--  Al crear una solicitud se reserva (remanentes -= costo). Al rechazar se
--  libera. Al confirmar, se descuentan los acumulados (canjear_premio) y la
--  reserva queda aplicada.
-- ============================================================

alter table public.tarjetas
  add column if not exists puntos_remanentes numeric(14,2) not null default 0;

-- Inicializa remanentes = acumulados − pendientes actuales
update public.tarjetas t set puntos_remanentes = t.puntos - coalesce((
  select sum(s.puntos) from public.solicitudes s
  where s.cliente_id = t.cliente_id and s.estado in ('pendiente', 'revision')
), 0);

-- ---------- cargar_puntos: suma también a remanentes ----------
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
  if v_comercio_nombre is null then raise exception 'Comercio no encontrado'; end if;

  v_factura := nullif(trim(coalesce(p_factura_numero, '')), '');
  if v_factura is not null and exists (select 1 from public.cargas where factura_numero = v_factura) then
    raise exception 'Ya existe una carga registrada con la factura %', v_factura;
  end if;

  v_numero := regexp_replace(coalesce(p_numero, ''), '\s', '', 'g');
  select * into v_card from public.tarjetas where numero = v_numero for update;
  if not found then raise exception 'Tarjeta no encontrada: %', p_numero; end if;
  if v_card.activa = false then raise exception 'La tarjeta está inactiva'; end if;

  select pesos_por_punto, max_factura_pesos into v_pxp, v_max from public.config where id = 1;
  if v_pxp is null or v_pxp <= 0 then v_pxp := 1000; end if;
  if v_max is not null and p_factura_pesos > v_max then
    raise exception 'El importe supera el máximo permitido por factura (%)', v_max;
  end if;

  v_puntos := floor(p_factura_pesos / v_pxp);

  update public.tarjetas
    set puntos = puntos + v_puntos,
        puntos_remanentes = puntos_remanentes + v_puntos
    where id = v_card.id;

  v_email := coalesce(p_usuario_email, (select email from public.profiles where id = auth.uid()));
  select nombre into v_nombre from public.clientes where id = v_card.cliente_id;

  insert into public.cargas (
    tarjeta_id, cliente_id, numero_tarjeta, cliente_nombre, comercio_id, comercio_nombre,
    factura_numero, factura_pesos, pesos_por_punto, puntos, origen, usuario_email
  ) values (
    v_card.id, v_card.cliente_id, v_card.numero, v_nombre, p_comercio_id, v_comercio_nombre,
    v_factura, p_factura_pesos, v_pxp, v_puntos, coalesce(p_origen, 'manual'), v_email
  ) returning * into v_carga;

  return json_build_object(
    'carga_id', v_carga.id, 'numero_tarjeta', v_card.numero, 'cliente', v_nombre,
    'comercio', v_comercio_nombre, 'factura_numero', v_carga.factura_numero,
    'factura_pesos', p_factura_pesos, 'pesos_por_punto', v_pxp,
    'puntos_otorgados', v_puntos, 'puntos_totales', v_card.puntos + v_puntos
  );
end;
$$;
grant execute on function public.cargar_puntos(text, numeric, text, text, text, uuid) to authenticated;

-- ---------- saldos_cliente: saldo, pendiente y remanente por comercio ----------
drop function if exists public.saldos_cliente(uuid);
create or replace function public.saldos_cliente(p_cliente_id uuid)
returns table(comercio_id uuid, comercio_nombre text, saldo numeric, pendiente numeric, remanente numeric)
language sql
security definer set search_path = public
as $$
  select s.comercio_id, co.nombre,
         s.puntos as saldo,
         coalesce(p.pend, 0) as pendiente,
         s.puntos - coalesce(p.pend, 0) as remanente
  from public.saldos_por_comercio s
  join public.comercios co on co.id = s.comercio_id
  left join (
    select comercio_id, sum(puntos) as pend
    from public.solicitudes
    where cliente_id = p_cliente_id and comercio_id is not null and estado in ('pendiente', 'revision')
    group by comercio_id
  ) p on p.comercio_id = s.comercio_id
  where s.cliente_id = p_cliente_id
  order by co.nombre;
$$;
grant execute on function public.saldos_cliente(uuid) to authenticated;

-- ---------- crear_solicitud: valida y reserva remanentes ----------
create or replace function public.crear_solicitud(
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
  v_nombre text;
  v_email text;
  v_saldo numeric;
  v_pend_com numeric;
  v_costo numeric;
  v_com_nombre text;
  v_sol public.solicitudes%rowtype;
begin
  select * into v_card from public.tarjetas where cliente_id = p_cliente_id for update;
  if not found then raise exception 'El cliente no tiene una tarjeta emitida'; end if;
  if v_card.activa = false then raise exception 'La tarjeta del cliente está inactiva'; end if;

  select * into v_premio from public.premios where id = p_premio_id;
  if not found then raise exception 'Premio no encontrado'; end if;
  if v_premio.activo = false then raise exception 'El premio no está disponible'; end if;
  if v_premio.stock <= 0 then raise exception 'No hay stock disponible del premio'; end if;

  v_costo := v_premio.puntos_necesarios;

  -- Guarda por remanentes totales (evita pedir más de lo disponible con pendientes)
  if v_card.puntos_remanentes < v_costo then
    raise exception 'Puntos remanentes insuficientes: disponibles %, se requieren % (hay canjes pendientes)',
      v_card.puntos_remanentes, v_costo;
  end if;

  -- Guarda por comercio (saldo real del comercio − pendientes de ese comercio)
  if v_premio.comercio_id is not null then
    select coalesce(sum(puntos), 0) into v_saldo from public.saldos_por_comercio
      where cliente_id = p_cliente_id and comercio_id = v_premio.comercio_id;
    select coalesce(sum(puntos), 0) into v_pend_com from public.solicitudes
      where cliente_id = p_cliente_id and comercio_id = v_premio.comercio_id and estado in ('pendiente', 'revision');
    if (v_saldo - v_pend_com) < v_costo then
      raise exception 'Puntos insuficientes en el comercio (considerando pendientes): disponibles %, se requieren %',
        (v_saldo - v_pend_com), v_costo;
    end if;
    select nombre into v_com_nombre from public.comercios where id = v_premio.comercio_id;
  end if;

  v_email := coalesce(p_usuario_email, (select email from public.profiles where id = auth.uid()));
  select nombre into v_nombre from public.clientes where id = p_cliente_id;

  -- Reserva: baja remanentes, NO toca acumulados
  update public.tarjetas set puntos_remanentes = puntos_remanentes - v_costo where id = v_card.id;

  insert into public.solicitudes (
    premio_id, premio_titulo, cliente_id, cliente_nombre, tarjeta_id, numero_tarjeta,
    comercio_id, comercio_nombre, puntos, estado, solicitado_por
  ) values (
    v_premio.id, v_premio.titulo, p_cliente_id, v_nombre, v_card.id, v_card.numero,
    v_premio.comercio_id, v_com_nombre, v_costo, 'pendiente', v_email
  ) returning * into v_sol;

  return json_build_object(
    'solicitud_id', v_sol.id, 'estado', 'pendiente',
    'premio', v_premio.titulo, 'cliente', v_nombre, 'puntos', v_costo,
    'remanentes', v_card.puntos_remanentes - v_costo
  );
end;
$$;
grant execute on function public.crear_solicitud(uuid, uuid, text) to authenticated;

-- ---------- cambiar_estado_solicitud: rechazar libera remanentes ----------
create or replace function public.cambiar_estado_solicitud(
  p_solicitud_id uuid,
  p_nuevo_estado text,
  p_usuario_email text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_sol public.solicitudes%rowtype;
  v_email text;
  v_res json;
  v_canje_id uuid;
begin
  select * into v_sol from public.solicitudes where id = p_solicitud_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;

  if p_nuevo_estado not in ('pendiente', 'revision', 'confirmado', 'entregado', 'rechazada') then
    raise exception 'Estado inválido';
  end if;
  if p_nuevo_estado = 'confirmado' and v_sol.estado not in ('pendiente', 'revision') then
    raise exception 'Solo se puede confirmar una solicitud pendiente o en revisión';
  end if;
  if p_nuevo_estado = 'entregado' and v_sol.estado <> 'confirmado' then
    raise exception 'Solo se puede entregar un premio con el canje confirmado';
  end if;
  if p_nuevo_estado = 'rechazada' and v_sol.estado not in ('pendiente', 'revision') then
    raise exception 'Solo se puede rechazar una solicitud pendiente o en revisión';
  end if;

  v_email := coalesce(p_usuario_email, (select email from public.profiles where id = auth.uid()));

  if p_nuevo_estado = 'confirmado' and v_sol.canje_id is null then
    -- Se hace efectivo: descuenta acumulados y stock (la reserva de remanentes queda aplicada)
    if v_sol.premio_id is null then raise exception 'El premio de la solicitud ya no existe'; end if;
    v_res := public.canjear_premio(v_sol.cliente_id, v_sol.premio_id, v_email);
    v_canje_id := (v_res->>'canje_id')::uuid;
    update public.solicitudes
      set estado = 'confirmado', canje_id = v_canje_id, actualizado_por = v_email, updated_at = now()
      where id = p_solicitud_id;
  else
    -- Al rechazar una pendiente/revisión, se libera la reserva de remanentes
    if p_nuevo_estado = 'rechazada' and v_sol.estado in ('pendiente', 'revision') then
      update public.tarjetas set puntos_remanentes = puntos_remanentes + v_sol.puntos
        where cliente_id = v_sol.cliente_id;
    end if;
    update public.solicitudes
      set estado = p_nuevo_estado, actualizado_por = v_email, updated_at = now()
      where id = p_solicitud_id;
  end if;

  return json_build_object('id', p_solicitud_id, 'estado', p_nuevo_estado);
end;
$$;
grant execute on function public.cambiar_estado_solicitud(uuid, text, text) to authenticated;
