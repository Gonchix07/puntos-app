-- ============================================================
--  Migración: campanias_cliente_portal (informativa, para el Portal)
--  Ejecutar en Supabase SQL Editor. Requiere
--  migration_campanias_dias_periodicidad.sql ya aplicada.
--
--  campanias_vigentes_cliente (la que consulta el sistema de
--  facturación / POS y registrar_uso_campania) NO se toca — sigue
--  siendo estricta: solo devuelve lo que se puede usar AHORA MISMO.
--
--  Esta función nueva es solo para el Portal de clientes: devuelve
--  TODAS las campañas asignadas al cliente, vigentes por fecha y con
--  el mínimo de puntos cumplido — incluidas las que hoy no se pueden
--  usar por día de la semana o porque ya se consumió la periodicidad
--  — para mostrarlas igual, deshabilitadas, con el motivo.
-- ============================================================

create or replace function public.campanias_cliente_portal(p_cliente_id uuid)
returns table(
  campania_id uuid,
  nombre text,
  descripcion text,
  descuento_porcentaje numeric,
  local_id uuid,
  local_nombre text,
  fecha_desde date,
  fecha_hasta date,
  puntos_minimos numeric,
  dias_semana int[],
  periodicidad text,
  dia_habilitado boolean,
  periodicidad_disponible boolean
)
language sql
security definer set search_path = public
as $$
  select distinct c.id, c.nombre, c.descripcion, c.descuento_porcentaje,
         c.local_id, l.nombre, c.fecha_desde, c.fecha_hasta, c.puntos_minimos,
         c.dias_semana, c.periodicidad,
         (
           c.dias_semana is null or array_length(c.dias_semana, 1) is null
           or extract(dow from current_date)::int = any(c.dias_semana)
         ) as dia_habilitado,
         not exists (
           select 1 from public.campania_usos u
           where u.campania_id = c.id and u.cliente_id = p_cliente_id
             and (
               (c.periodicidad = 'diaria' and u.usado_en::date = current_date)
               or (c.periodicidad = 'semanal' and date_trunc('week', u.usado_en) = date_trunc('week', now()))
               or (c.periodicidad = 'mensual' and date_trunc('month', u.usado_en) = date_trunc('month', now()))
             )
         ) as periodicidad_disponible
  from public.campanias c
  left join public.locales l on l.id = c.local_id
  left join public.tarjetas t on t.cliente_id = p_cliente_id
  where c.activa = true
    and c.fecha_desde <= current_date
    and (c.fecha_hasta is null or c.fecha_hasta >= current_date)
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
grant execute on function public.campanias_cliente_portal(uuid) to authenticated;
grant execute on function public.campanias_cliente_portal(uuid) to service_role;
