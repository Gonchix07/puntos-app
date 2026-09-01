-- ============================================================
--  Migración: quitar el vencimiento (fecha_hasta) de las campañas
--  Ejecutar en Supabase SQL Editor. Requiere migration_campanias.sql ya aplicada.
--
--  Motivo: puede haber múltiples campañas superpuestas en el tiempo para
--  distintos clientes/grupos; el vencimiento por fecha no aporta valor acá
--  y las campañas se dan de baja manualmente con el flag "activa". Se
--  mantiene "fecha_desde" (permite programar campañas a futuro).
-- ============================================================

alter table public.campanias drop constraint if exists campanias_vigencia_valida;
alter table public.campanias drop column if exists fecha_hasta;

drop function if exists public.campanias_vigentes_cliente(uuid, uuid);
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
  fecha_desde date
)
language sql
security definer set search_path = public
as $$
  select distinct c.id, c.nombre, c.descripcion, c.descuento_porcentaje,
         c.local_id, l.nombre, c.fecha_desde
  from public.campanias c
  left join public.locales l on l.id = c.local_id
  where c.activa = true
    and c.fecha_desde <= current_date
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
