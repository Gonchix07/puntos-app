-- ============================================================
--  Migración: historial de estados de solicitudes
--  - Registra cada paso del flujo de canje: solicitud creada
--    (pendiente), a revisión, canje confirmado, premio entregado
--    y rechazada. Lo completa un trigger automáticamente.
--  - Se muestra en Auditoría como movimientos de tipo "estado".
--  Ejecutar en Supabase SQL Editor. Requiere migration_solicitudes.sql.
-- ============================================================

create table if not exists public.solicitudes_historial (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes(id) on delete cascade,
  cliente_id uuid,
  cliente_nombre text,
  numero_tarjeta text,
  premio_titulo text,
  comercio_id uuid,
  comercio_nombre text,
  puntos numeric(14,2),
  estado_anterior text,
  estado_nuevo text not null,
  usuario_email text,
  created_at timestamptz not null default now()
);
create index if not exists idx_sol_hist_fecha on public.solicitudes_historial(created_at);
create index if not exists idx_sol_hist_cliente on public.solicitudes_historial(cliente_id);

alter table public.solicitudes_historial enable row level security;
drop policy if exists "sol_historial select" on public.solicitudes_historial;
create policy "sol_historial select" on public.solicitudes_historial
  for select to authenticated using (true);

-- Trigger: al crear la solicitud registra el alta (pendiente); en cada
-- cambio de estado registra la transición con quién la hizo.
create or replace function public.log_estado_solicitud()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.solicitudes_historial
      (solicitud_id, cliente_id, cliente_nombre, numero_tarjeta, premio_titulo,
       comercio_id, comercio_nombre, puntos, estado_anterior, estado_nuevo, usuario_email)
    values
      (new.id, new.cliente_id, new.cliente_nombre, new.numero_tarjeta, new.premio_titulo,
       new.comercio_id, new.comercio_nombre, new.puntos, null, new.estado, new.solicitado_por);
  elsif tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    insert into public.solicitudes_historial
      (solicitud_id, cliente_id, cliente_nombre, numero_tarjeta, premio_titulo,
       comercio_id, comercio_nombre, puntos, estado_anterior, estado_nuevo, usuario_email)
    values
      (new.id, new.cliente_id, new.cliente_nombre, new.numero_tarjeta, new.premio_titulo,
       new.comercio_id, new.comercio_nombre, new.puntos, old.estado, new.estado, new.actualizado_por);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_estado_solicitud on public.solicitudes;
create trigger trg_log_estado_solicitud
  after insert or update on public.solicitudes
  for each row execute procedure public.log_estado_solicitud();

-- Semilla: reconstruye lo que se puede de las solicitudes ya existentes
-- (el alta con created_at, y el estado actual con updated_at si avanzó).
-- Las transiciones intermedias anteriores a esta migración no se pueden recuperar.
insert into public.solicitudes_historial
  (solicitud_id, cliente_id, cliente_nombre, numero_tarjeta, premio_titulo,
   comercio_id, comercio_nombre, puntos, estado_anterior, estado_nuevo, usuario_email, created_at)
select s.id, s.cliente_id, s.cliente_nombre, s.numero_tarjeta, s.premio_titulo,
       s.comercio_id, s.comercio_nombre, s.puntos, null, 'pendiente', s.solicitado_por, s.created_at
from public.solicitudes s
where not exists (select 1 from public.solicitudes_historial h where h.solicitud_id = s.id);

insert into public.solicitudes_historial
  (solicitud_id, cliente_id, cliente_nombre, numero_tarjeta, premio_titulo,
   comercio_id, comercio_nombre, puntos, estado_anterior, estado_nuevo, usuario_email, created_at)
select s.id, s.cliente_id, s.cliente_nombre, s.numero_tarjeta, s.premio_titulo,
       s.comercio_id, s.comercio_nombre, s.puntos, 'pendiente', s.estado, s.actualizado_por, s.updated_at
from public.solicitudes s
where s.estado <> 'pendiente'
  and not exists (
    select 1 from public.solicitudes_historial h
    where h.solicitud_id = s.id and h.estado_nuevo = s.estado
  );
