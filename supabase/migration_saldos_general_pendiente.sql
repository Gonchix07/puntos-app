-- ============================================================
--  Migración: corrige saldos_cliente para reflejar los premios
--  GENERALES pendientes en el desglose por comercio.
--
--  Bug: la versión anterior solo restaba del "pendiente" por comercio
--  las solicitudes de premios ESPECÍFICOS de ese comercio
--  (comercio_id is not null). Las solicitudes de premios GENERALES
--  (comercio_id null) sí descuentan puntos_remanentes global (en
--  crear_solicitud) pero no se reflejaban en ningún comercio del
--  desglose de saldos_cliente. Efecto observado: la suma de los
--  remanentes por comercio (ej. Hergo + Menor Coste) daba MÁS que el
--  total disponible de la tarjeta, si el cliente tenía una solicitud
--  pendiente de un premio general.
--
--  Fix: se reparte lo pendiente de premios generales entre los
--  comercios con más saldo disponible primero, igual criterio que usa
--  canjear_premio al confirmar un canje general. Así el desglose por
--  comercio siempre suma exactamente el remanente total de la tarjeta.
-- ============================================================

drop function if exists public.saldos_cliente(uuid);
create or replace function public.saldos_cliente(p_cliente_id uuid)
returns table(comercio_id uuid, comercio_nombre text, saldo numeric, pendiente numeric, remanente numeric)
language plpgsql
security definer set search_path = public
as $$
declare
  v_general_pend numeric;
  v_restante numeric;
  v_take numeric;
  v_rec record;
  v_ids uuid[] := '{}';
  v_nombres text[] := '{}';
  v_saldos numeric[] := '{}';
  v_pendientes numeric[] := '{}';
  v_n int;
  v_i int;
  v_j int;
begin
  -- Saldo real y pendiente específico (solicitudes de premios de ESE
  -- comercio) por cada comercio donde el cliente tiene puntos.
  for v_rec in
    select s.comercio_id as cid, co.nombre as nom, s.puntos as sal,
           coalesce((
             select sum(sol.puntos) from public.solicitudes sol
             where sol.cliente_id = p_cliente_id and sol.comercio_id = s.comercio_id
               and sol.estado in ('pendiente', 'revision')
           ), 0) as pend
    from public.saldos_por_comercio s
    join public.comercios co on co.id = s.comercio_id
    where s.cliente_id = p_cliente_id
    order by co.nombre
  loop
    v_ids := array_append(v_ids, v_rec.cid);
    v_nombres := array_append(v_nombres, v_rec.nom);
    v_saldos := array_append(v_saldos, v_rec.sal);
    v_pendientes := array_append(v_pendientes, v_rec.pend);
  end loop;
  v_n := coalesce(array_length(v_ids, 1), 0);

  -- Puntos reservados por solicitudes de premios GENERALES (sin comercio propio)
  select coalesce(sum(puntos), 0) into v_general_pend
  from public.solicitudes
  where cliente_id = p_cliente_id and comercio_id is null and estado in ('pendiente', 'revision');

  -- Reparte lo general entre los comercios con más remanente disponible
  -- primero (drena el más grande antes de pasar al siguiente).
  v_restante := v_general_pend;
  while v_restante > 0 and v_n > 0 loop
    v_i := 1;
    for v_j in 2..v_n loop
      if (v_saldos[v_j] - v_pendientes[v_j]) > (v_saldos[v_i] - v_pendientes[v_i]) then
        v_i := v_j;
      end if;
    end loop;
    exit when (v_saldos[v_i] - v_pendientes[v_i]) <= 0;
    v_take := least(v_saldos[v_i] - v_pendientes[v_i], v_restante);
    v_pendientes[v_i] := v_pendientes[v_i] + v_take;
    v_restante := v_restante - v_take;
  end loop;

  for v_i in 1..v_n loop
    comercio_id := v_ids[v_i];
    comercio_nombre := v_nombres[v_i];
    saldo := v_saldos[v_i];
    pendiente := v_pendientes[v_i];
    remanente := v_saldos[v_i] - v_pendientes[v_i];
    return next;
  end loop;
end;
$$;
grant execute on function public.saldos_cliente(uuid) to authenticated;
grant execute on function public.saldos_cliente(uuid) to service_role;
