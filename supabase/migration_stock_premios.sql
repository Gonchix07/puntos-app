-- ============================================================
--  Migración: control de stock de premios por movimientos
--  - El stock inicial se registra al alta del premio (trigger) y
--    después SOLO cambia por movimientos:
--      · ajustes manuales justificados (RPC ajustar_stock_premio)
--      · canjes confirmados (canjear_premio registra el egreso)
--  - Cada movimiento guarda tipo, cantidad, motivo, usuario y el
--    stock resultante.
--  Ejecutar en Supabase SQL Editor. Requiere migration_premios.sql.
-- ============================================================

create table if not exists public.premio_stock_mov (
  id uuid primary key default gen_random_uuid(),
  premio_id uuid not null references public.premios(id) on delete cascade,
  premio_titulo text,
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  cantidad integer not null check (cantidad > 0),
  motivo text not null,
  stock_resultante integer not null,
  usuario_email text,
  created_at timestamptz not null default now()
);
create index if not exists idx_stock_mov_premio on public.premio_stock_mov(premio_id, created_at);

alter table public.premio_stock_mov enable row level security;
drop policy if exists "stock_mov select" on public.premio_stock_mov;
create policy "stock_mov select" on public.premio_stock_mov
  for select to authenticated using (true);
-- Sin política de insert: solo escriben las funciones security definer.

-- ---------- Alta del premio: registra el stock inicial ----------
create or replace function public.log_stock_inicial()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.stock > 0 then
    insert into public.premio_stock_mov
      (premio_id, premio_titulo, tipo, cantidad, motivo, stock_resultante, usuario_email)
    values
      (new.id, new.titulo, 'ingreso', new.stock, 'Stock inicial', new.stock,
       (select email from public.profiles where id = auth.uid()));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_stock_inicial on public.premios;
create trigger trg_log_stock_inicial
  after insert on public.premios
  for each row execute procedure public.log_stock_inicial();

-- ---------- Ajuste manual justificado (solo admin) ----------
create or replace function public.ajustar_stock_premio(
  p_premio_id uuid,
  p_tipo text,
  p_cantidad integer,
  p_motivo text,
  p_usuario_email text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_premio public.premios%rowtype;
  v_nuevo integer;
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ajustar el stock';
  end if;
  if p_tipo not in ('ingreso', 'egreso') then
    raise exception 'Tipo de movimiento inválido (ingreso o egreso)';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser un entero mayor a cero';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indicá el motivo del ajuste';
  end if;

  select * into v_premio from public.premios where id = p_premio_id for update;
  if not found then raise exception 'Premio no encontrado'; end if;

  if p_tipo = 'egreso' and v_premio.stock < p_cantidad then
    raise exception 'Stock insuficiente: hay % unidad(es) y querés egresar %', v_premio.stock, p_cantidad;
  end if;

  v_nuevo := v_premio.stock + case when p_tipo = 'ingreso' then p_cantidad else -p_cantidad end;
  update public.premios set stock = v_nuevo where id = p_premio_id;

  v_email := coalesce(p_usuario_email, (select email from public.profiles where id = auth.uid()));
  insert into public.premio_stock_mov
    (premio_id, premio_titulo, tipo, cantidad, motivo, stock_resultante, usuario_email)
  values
    (p_premio_id, v_premio.titulo, p_tipo, p_cantidad, trim(p_motivo), v_nuevo, v_email);

  return json_build_object('premio', v_premio.titulo, 'stock', v_nuevo);
end;
$$;

grant execute on function public.ajustar_stock_premio(uuid, text, integer, text, text) to authenticated;

-- ---------- El canje registra su egreso de stock ----------
-- Reemplaza canjear_premio agregando el registro del movimiento.
create or replace function public.canjear_premio(
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
  v_email text;
  v_nombre text;
  v_canje public.canjes%rowtype;
  v_costo numeric;
  v_saldo numeric;
  v_restante numeric;
  v_take numeric;
  v_rec record;
  v_com_nombre text;
begin
  -- Serializa cargas/canjes del cliente
  select * into v_card from public.tarjetas where cliente_id = p_cliente_id for update;
  if not found then raise exception 'El cliente no tiene una tarjeta emitida'; end if;
  if v_card.activa = false then raise exception 'La tarjeta del cliente está inactiva'; end if;

  select * into v_premio from public.premios where id = p_premio_id for update;
  if not found then raise exception 'Premio no encontrado'; end if;
  if v_premio.activo = false then raise exception 'El premio no está disponible'; end if;
  if v_premio.stock <= 0 then raise exception 'No hay stock disponible del premio'; end if;

  v_costo := v_premio.puntos_necesarios;
  select nombre into v_nombre from public.clientes where id = p_cliente_id;
  v_email := coalesce(p_usuario_email, (select email from public.profiles where id = auth.uid()));

  if v_premio.comercio_id is not null then
    -- Premio de comercio: solo el saldo de ese comercio
    select coalesce(sum(puntos), 0) into v_saldo from public.saldos_por_comercio
      where cliente_id = p_cliente_id and comercio_id = v_premio.comercio_id;
    if v_saldo < v_costo then
      raise exception 'Puntos insuficientes en el comercio: disponibles %, se requieren %', v_saldo, v_costo;
    end if;
    select nombre into v_com_nombre from public.comercios where id = v_premio.comercio_id;
  else
    -- Premio general: total acumulado
    select coalesce(sum(puntos), 0) into v_saldo from public.saldos_por_comercio
      where cliente_id = p_cliente_id;
    if v_saldo < v_costo then
      raise exception 'Puntos insuficientes: disponibles %, se requieren %', v_saldo, v_costo;
    end if;
  end if;

  insert into public.canjes (
    premio_id, premio_titulo, cliente_id, cliente_nombre, tarjeta_id, numero_tarjeta,
    puntos, comercio_id, comercio_nombre, usuario_email
  ) values (
    v_premio.id, v_premio.titulo, p_cliente_id, v_nombre, v_card.id, v_card.numero,
    v_costo, v_premio.comercio_id, v_com_nombre, v_email
  )
  returning * into v_canje;

  if v_premio.comercio_id is not null then
    insert into public.canje_detalle (canje_id, comercio_id, puntos)
      values (v_canje.id, v_premio.comercio_id, v_costo);
  else
    -- Reparte el costo entre comercios, del que más saldo tiene primero
    v_restante := v_costo;
    for v_rec in
      select comercio_id, puntos from public.saldos_por_comercio
      where cliente_id = p_cliente_id and puntos > 0
      order by puntos desc
    loop
      exit when v_restante <= 0;
      v_take := least(v_rec.puntos, v_restante);
      insert into public.canje_detalle (canje_id, comercio_id, puntos)
        values (v_canje.id, v_rec.comercio_id, v_take);
      v_restante := v_restante - v_take;
    end loop;
  end if;

  update public.tarjetas set puntos = puntos - v_costo where id = v_card.id;
  update public.premios set stock = stock - 1 where id = v_premio.id;

  -- Movimiento de stock del canje
  insert into public.premio_stock_mov
    (premio_id, premio_titulo, tipo, cantidad, motivo, stock_resultante, usuario_email)
  values
    (v_premio.id, v_premio.titulo, 'egreso', 1, 'Canje de premio', v_premio.stock - 1, v_email);

  return json_build_object(
    'canje_id', v_canje.id,
    'premio', v_premio.titulo,
    'cliente', v_nombre,
    'general', v_premio.comercio_id is null,
    'comercio', v_com_nombre,
    'puntos_usados', v_costo,
    'puntos_restantes', v_card.puntos - v_costo,
    'stock_restante', v_premio.stock - 1
  );
end;
$$;

grant execute on function public.canjear_premio(uuid, uuid, text) to authenticated;

-- ---------- Semilla: punto de partida del ledger para premios existentes ----------
-- El stock inicial real de los premios ya creados no se puede reconstruir;
-- se registra el saldo actual como punto de partida del control.
insert into public.premio_stock_mov
  (premio_id, premio_titulo, tipo, cantidad, motivo, stock_resultante, usuario_email, created_at)
select p.id, p.titulo, 'ingreso', p.stock, 'Saldo al activar el control de stock', p.stock, null, now()
from public.premios p
where p.stock > 0
  and not exists (select 1 from public.premio_stock_mov m where m.premio_id = p.id);
