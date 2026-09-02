-- ============================================================
--  Migración: fecha de vencimiento + puntos mínimos en Campañas
--  Ejecutar en Supabase SQL Editor. Requiere migration_campanias.sql
--  (y migration_campanias_sin_vencimiento.sql, si se corrió) ya aplicadas.
--
--  - fecha_hasta: vuelve a existir (null = sin vencimiento). Antes se
--    había quitado; ahora se pide explícitamente poder fijar un cierre.
--  - puntos_minimos: cantidad mínima de puntos ACUMULADOS
--    (tarjetas.puntos, no el remanente) que el cliente debe tener para
--    que la campaña le aplique. Default 0 = sin mínimo.
-- ============================================================

alter table public.campanias add column if not exists fecha_hasta date;
alter table public.campanias
  add column if not exists puntos_minimos numeric(14,2) not null default 0;
alter table public.campanias drop constraint if exists campanias_puntos_minimos_check;
alter table public.campanias
  add constraint campanias_puntos_minimos_check check (puntos_minimos >= 0);

alter table public.campanias drop constraint if exists campanias_vigencia_valida;
alter table public.campanias
  add constraint campanias_vigencia_valida check (fecha_hasta is null or fecha_hasta >= fecha_desde);

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
  fecha_desde date,
  fecha_hasta date,
  puntos_minimos numeric
)
language sql
security definer set search_path = public
as $$
  select distinct c.id, c.nombre, c.descripcion, c.descuento_porcentaje,
         c.local_id, l.nombre, c.fecha_desde, c.fecha_hasta, c.puntos_minimos
  from public.campanias c
  left join public.locales l on l.id = c.local_id
  left join public.tarjetas t on t.cliente_id = p_cliente_id
  where c.activa = true
    and c.fecha_desde <= current_date
    and (c.fecha_hasta is null or c.fecha_hasta >= current_date)
    and (p_local_id is null or c.local_id is null or c.local_id = p_local_id)
    and coalesce(t.puntos, 0) >= c.puntos_minimos
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
