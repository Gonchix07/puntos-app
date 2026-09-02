-- ============================================================
--  Migración: días de la semana + periodicidad de uso en Campañas
--  Ejecutar en Supabase SQL Editor. Requiere migration_campanias.sql y
--  migration_campanias_hasta_minimo.sql ya aplicadas.
--
--  - dias_semana int[]: días habilitados (0=domingo…6=sábado, igual
--    que extract(dow) en Postgres y Date.getDay() en JS). null/vacío
--    = todos los días.
--  - periodicidad: 'ilimitado' | 'diaria' | 'semanal' | 'mensual' —
--    cuántas veces puede usarse por cliente en el período vigente.
--  - campania_usos: registro de cada vez que el sistema de
--    facturación aplicó el descuento (lo llama vía la nueva acción
--    POST de /api/campanias). campanias_vigentes_cliente lo consulta
--    para dejar de ofrecer la campaña hasta que pase el período.
-- ============================================================

alter table public.campanias add column if not exists dias_semana int[];
alter table public.campanias drop constraint if exists campanias_dias_semana_valida;
alter table public.campanias
  add constraint campanias_dias_semana_valida check (
    dias_semana is null or dias_semana <@ array[0,1,2,3,4,5,6]
  );

alter table public.campanias add column if not exists periodicidad text not null default 'ilimitado';
alter table public.campanias drop constraint if exists campanias_periodicidad_check;
alter table public.campanias
  add constraint campanias_periodicidad_check
  check (periodicidad in ('ilimitado', 'diaria', 'semanal', 'mensual'));

create table if not exists public.campania_usos (
  id uuid primary key default gen_random_uuid(),
  campania_id uuid not null references public.campanias(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  local_id uuid references public.locales(id) on delete set null,
  usuario_email text,
  usado_en timestamptz not null default now()
);
create index if not exists idx_campania_usos_campania_cliente on public.campania_usos(campania_id, cliente_id);

alter table public.campania_usos enable row level security;
drop policy if exists "campania_usos select" on public.campania_usos;
create policy "campania_usos select" on public.campania_usos for select to authenticated using (true);

-- ---------- campanias_vigentes_cliente: agrega día de la semana y periodicidad ----------
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
  puntos_minimos numeric,
  dias_semana int[],
  periodicidad text
)
language sql
security definer set search_path = public
as $$
  select distinct c.id, c.nombre, c.descripcion, c.descuento_porcentaje,
         c.local_id, l.nombre, c.fecha_desde, c.fecha_hasta, c.puntos_minimos,
         c.dias_semana, c.periodicidad
  from public.campanias c
  left join public.locales l on l.id = c.local_id
  left join public.tarjetas t on t.cliente_id = p_cliente_id
  where c.activa = true
    and c.fecha_desde <= current_date
    and (c.fecha_hasta is null or c.fecha_hasta >= current_date)
    and (p_local_id is null or c.local_id is null or c.local_id = p_local_id)
    and coalesce(t.puntos, 0) >= c.puntos_minimos
    and (
      c.dias_semana is null or array_length(c.dias_semana, 1) is null
      or extract(dow from current_date)::int = any(c.dias_semana)
    )
    and not exists (
      select 1 from public.campania_usos u
      where u.campania_id = c.id and u.cliente_id = p_cliente_id
        and (
          (c.periodicidad = 'diaria' and u.usado_en::date = current_date)
          or (c.periodicidad = 'semanal' and date_trunc('week', u.usado_en) = date_trunc('week', now()))
          or (c.periodicidad = 'mensual' and date_trunc('month', u.usado_en) = date_trunc('month', now()))
        )
    )
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

-- ---------- registrar_uso_campania: registra el uso, re-validando todo ----------
create or replace function public.registrar_uso_campania(
  p_campania_id uuid,
  p_cliente_id uuid,
  p_local_id uuid default null,
  p_usuario_email text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_campania public.campanias%rowtype;
  v_email text;
  v_uso public.campania_usos%rowtype;
begin
  select * into v_campania from public.campanias where id = p_campania_id for update;
  if not found then raise exception 'Campaña no encontrada'; end if;

  if not exists (
    select 1 from public.campanias_vigentes_cliente(p_cliente_id, p_local_id) v
    where v.campania_id = p_campania_id
  ) then
    raise exception 'La campaña no está disponible para este cliente en este momento (vigencia, día habilitado, mínimo de puntos o periodicidad ya usada)';
  end if;

  v_email := coalesce(p_usuario_email, (select email from public.profiles where id = auth.uid()));

  insert into public.campania_usos (campania_id, cliente_id, local_id, usuario_email)
  values (p_campania_id, p_cliente_id, p_local_id, v_email)
  returning * into v_uso;

  return json_build_object(
    'uso_id', v_uso.id,
    'campania', v_campania.nombre,
    'cliente_id', p_cliente_id,
    'usado_en', v_uso.usado_en
  );
end;
$$;
grant execute on function public.registrar_uso_campania(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.registrar_uso_campania(uuid, uuid, uuid, text) to service_role;
