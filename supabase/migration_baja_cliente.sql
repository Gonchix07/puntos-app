-- ============================================================
--  Migración: baja lógica de clientes
--  - No se puede eliminar un cliente con movimientos (cargas o canjes)
--  - Al dar de baja/alta, la tarjeta se sincroniza (activa/inactiva)
--  Ejecutar en Supabase SQL Editor. Requiere las tablas cargas y canjes.
-- ============================================================

-- Por si la columna no existiera (instalaciones muy viejas)
alter table public.clientes
  add column if not exists activo boolean not null default true;

-- Bloqueo de borrado: ahora contempla cargas Y canjes
create or replace function public.prevenir_borrado_cliente()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.cargas where cliente_id = old.id)
     or exists (select 1 from public.canjes where cliente_id = old.id) then
    raise exception 'No se puede eliminar un cliente con movimientos registrados (cargas o canjes). Solo se puede darlo de baja.';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevenir_borrado_cliente on public.clientes;
create trigger trg_prevenir_borrado_cliente
  before delete on public.clientes
  for each row execute procedure public.prevenir_borrado_cliente();

-- Sincroniza el estado de la tarjeta con el del cliente
create or replace function public.sync_tarjeta_activa()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.activo is distinct from old.activo then
    update public.tarjetas set activa = new.activo where cliente_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_tarjeta_activa on public.clientes;
create trigger trg_sync_tarjeta_activa
  after update of activo on public.clientes
  for each row execute procedure public.sync_tarjeta_activa();
