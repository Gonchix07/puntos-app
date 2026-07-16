-- ============================================================
--  Migración: ajuste de puntos (ingreso/egreso justificado)
--  - Nuevo origen 'ajuste' en cargas: un ajuste es una carga con
--    puntos con signo (+/-), sin factura, con motivo obligatorio.
--    Así impacta solo en saldos_por_comercio y en la Auditoría.
--  - RPC ajustar_puntos (solo admin): valida saldo del comercio y
--    remanentes en egresos, actualiza la tarjeta y registra el mov.
--  Ejecutar en Supabase SQL Editor.
-- ============================================================

-- La factura pasa a ser opcional (los ajustes no tienen factura)
alter table public.cargas alter column factura_pesos drop not null;
alter table public.cargas drop constraint if exists cargas_factura_pesos_check;
alter table public.cargas
  add constraint cargas_factura_pesos_check
  check (factura_pesos is null or factura_pesos > 0);

-- Nuevo origen 'ajuste'
alter table public.cargas drop constraint if exists cargas_origen_check;
alter table public.cargas
  add constraint cargas_origen_check
  check (origen in ('manual', 'api', 'ajuste'));

-- Motivo del ajuste
alter table public.cargas add column if not exists motivo text;

-- ---------- RPC: ajustar puntos de un cliente en un comercio ----------
create or replace function public.ajustar_puntos(
  p_cliente_id uuid,
  p_comercio_id uuid,
  p_tipo text,
  p_puntos numeric,
  p_motivo text,
  p_usuario_email text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_card public.tarjetas%rowtype;
  v_nombre text;
  v_com text;
  v_saldo numeric;
  v_delta numeric;
  v_cfg numeric;
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ajustar puntos';
  end if;
  if p_tipo not in ('ingreso', 'egreso') then
    raise exception 'Tipo de ajuste inválido (ingreso o egreso)';
  end if;
  if p_puntos is null or p_puntos <= 0 then
    raise exception 'Los puntos deben ser mayores a cero';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indicá el motivo del ajuste';
  end if;

  select * into v_card from public.tarjetas where cliente_id = p_cliente_id for update;
  if not found then raise exception 'El cliente no tiene una tarjeta emitida'; end if;

  select nombre into v_com from public.comercios where id = p_comercio_id;
  if v_com is null then raise exception 'Comercio no encontrado'; end if;
  select nombre into v_nombre from public.clientes where id = p_cliente_id;

  if p_tipo = 'egreso' then
    select coalesce(sum(puntos), 0) into v_saldo from public.saldos_por_comercio
      where cliente_id = p_cliente_id and comercio_id = p_comercio_id;
    if v_saldo < p_puntos then
      raise exception 'Saldo insuficiente en %: disponible %, querés egresar %', v_com, v_saldo, p_puntos;
    end if;
    if v_card.puntos_remanentes < p_puntos then
      raise exception 'Remanentes insuficientes: hay % (descontando canjes pendientes)', v_card.puntos_remanentes;
    end if;
  end if;

  v_delta := case when p_tipo = 'ingreso' then p_puntos else -p_puntos end;
  select pesos_por_punto into v_cfg from public.config where id = 1;
  v_email := coalesce(p_usuario_email, (select email from public.profiles where id = auth.uid()));

  insert into public.cargas (
    tarjeta_id, cliente_id, numero_tarjeta, cliente_nombre,
    comercio_id, comercio_nombre, factura_numero, factura_pesos,
    pesos_por_punto, puntos, origen, motivo, usuario_email
  ) values (
    v_card.id, p_cliente_id, v_card.numero, v_nombre,
    p_comercio_id, v_com, null, null,
    coalesce(v_cfg, 0), v_delta, 'ajuste', trim(p_motivo), v_email
  );

  update public.tarjetas
    set puntos = puntos + v_delta,
        puntos_remanentes = puntos_remanentes + v_delta
    where id = v_card.id;

  return json_build_object(
    'cliente', v_nombre,
    'comercio', v_com,
    'puntos', v_delta,
    'total', v_card.puntos + v_delta
  );
end;
$$;

grant execute on function public.ajustar_puntos(uuid, uuid, text, numeric, text, text) to authenticated;
