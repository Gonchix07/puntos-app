-- ============================================================
--  Migración: fix de saldos_cliente (reescrita en SQL puro, sin
--  loops/arrays) + crear_solicitud usa ese mismo cálculo para validar
--  premios de un comercio puntual.
--
--  Reemplaza a migration_saldos_general_pendiente.sql. Corre DESPUÉS
--  de esa (o en su lugar si todavía no se aplicó ninguna).
--
--  Motivos:
--  1) La versión anterior de saldos_cliente (PL/pgSQL con arrays) podía
--     fallar/devolver vacío en algunos casos, haciendo desaparecer el
--     desglose de puntos por comercio en el Catálogo del portal.
--  2) crear_solicitud validaba el saldo de un comercio puntual con su
--     propio cálculo (solo restaba pendientes de ESE comercio), sin
--     considerar la porción de premios Generales pendientes — por eso
--     el botón "Solicitar canje" no se bloqueaba aunque el comercio no
--     alcanzara, y el mensaje de error mostraba el número viejo/sin
--     corregir. Ahora reutiliza saldos_cliente (una sola fuente de
--     verdad) para ambos casos.
-- ============================================================

-- ---------- saldos_cliente: reescrita en SQL puro (sin loops) ----------
drop function if exists public.saldos_cliente(uuid);
create or replace function public.saldos_cliente(p_cliente_id uuid)
returns table(comercio_id uuid, comercio_nombre text, saldo numeric, pendiente numeric, remanente numeric)
language sql
security definer set search_path = public
as $$
  with base as (
    select s.comercio_id, co.nombre as comercio_nombre, s.puntos as saldo,
           coalesce(pc.pend, 0) as pendiente_propio
    from public.saldos_por_comercio s
    join public.comercios co on co.id = s.comercio_id
    left join (
      select comercio_id, sum(puntos) as pend
      from public.solicitudes
      where cliente_id = p_cliente_id and comercio_id is not null and estado in ('pendiente', 'revision')
      group by comercio_id
    ) pc on pc.comercio_id = s.comercio_id
    where s.cliente_id = p_cliente_id
  ),
  general as (
    select coalesce(sum(puntos), 0) as monto
    from public.solicitudes
    where cliente_id = p_cliente_id and comercio_id is null and estado in ('pendiente', 'revision')
  ),
  ranked as (
    select b.*,
           greatest(b.saldo - b.pendiente_propio, 0) as disponible_propio,
           sum(greatest(b.saldo - b.pendiente_propio, 0)) over (
             order by (b.saldo - b.pendiente_propio) desc, b.comercio_id
             rows between unbounded preceding and 1 preceding
           ) as acumulado_antes
    from base b
  )
  select
    r.comercio_id,
    r.comercio_nombre,
    r.saldo,
    r.pendiente_propio
      + greatest(least(r.disponible_propio, g.monto - coalesce(r.acumulado_antes, 0)), 0) as pendiente,
    r.saldo
      - (r.pendiente_propio + greatest(least(r.disponible_propio, g.monto - coalesce(r.acumulado_antes, 0)), 0))
      as remanente
  from ranked r
  cross join general g
  order by r.comercio_nombre;
$$;
grant execute on function public.saldos_cliente(uuid) to authenticated;
grant execute on function public.saldos_cliente(uuid) to service_role;

-- ---------- crear_solicitud: reutiliza saldos_cliente para validar ----------
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
  v_remanente_comercio numeric;
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

  if v_card.puntos_remanentes < v_costo then
    raise exception 'Puntos remanentes insuficientes: disponibles %, se requieren % (hay canjes pendientes)',
      v_card.puntos_remanentes, v_costo;
  end if;

  if v_premio.comercio_id is not null then
    select sc.remanente into v_remanente_comercio
    from public.saldos_cliente(p_cliente_id) sc
    where sc.comercio_id = v_premio.comercio_id;
    if coalesce(v_remanente_comercio, 0) < v_costo then
      raise exception 'Puntos insuficientes en el comercio (considerando pendientes): disponibles %, se requieren %',
        coalesce(v_remanente_comercio, 0), v_costo;
    end if;
    select nombre into v_com_nombre from public.comercios where id = v_premio.comercio_id;
  end if;

  v_email := coalesce(p_usuario_email, (select email from public.profiles where id = auth.uid()));
  select nombre into v_nombre from public.clientes where id = p_cliente_id;

  update public.tarjetas set puntos_remanentes = puntos_remanentes - v_costo where id = v_card.id;

  insert into public.solicitudes (
    premio_id, premio_titulo, cliente_id, cliente_nombre, tarjeta_id, numero_tarjeta,
    comercio_id, comercio_nombre, puntos, estado, solicitado_por
  ) values (
    v_premio.id, v_premio.titulo, p_cliente_id, v_nombre, v_card.id, v_card.numero,
    v_premio.comercio_id, v_com_nombre, v_costo, 'pendiente', v_email
  )
  returning * into v_sol;

  return json_build_object(
    'solicitud_id', v_sol.id, 'estado', 'pendiente',
    'premio', v_premio.titulo, 'cliente', v_nombre, 'puntos', v_costo,
    'remanentes', v_card.puntos_remanentes - v_costo
  );
end;
$$;
grant execute on function public.crear_solicitud(uuid, uuid, text) to authenticated;
