-- ============================================================
--  Migración: Solicitudes de canje (flujo de estados)
--  Ejecutar en Supabase SQL Editor. DESPUÉS de migration_premios_comercio.sql.
--
--  Flujo: pendiente -> revision -> confirmado -> entregado  (+ rechazada)
--  El descuento de puntos y stock ocurre al CONFIRMAR (llama a canjear_premio).
-- ============================================================

create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  premio_id uuid references public.premios(id) on delete set null,
  premio_titulo text,
  cliente_id uuid references public.clientes(id) on delete set null,
  cliente_nombre text,
  tarjeta_id uuid references public.tarjetas(id) on delete set null,
  numero_tarjeta text,
  comercio_id uuid references public.comercios(id) on delete set null,
  comercio_nombre text,
  puntos numeric(14,2) not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'revision', 'confirmado', 'entregado', 'rechazada')),
  canje_id uuid references public.canjes(id) on delete set null,
  solicitado_por text,
  actualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_solicitudes_estado on public.solicitudes(estado);
create index if not exists idx_solicitudes_cliente on public.solicitudes(cliente_id);
create index if not exists idx_solicitudes_fecha on public.solicitudes(created_at);

alter table public.solicitudes enable row level security;
drop policy if exists "solicitudes select" on public.solicitudes;
create policy "solicitudes select" on public.solicitudes
  for select to authenticated using (true);

-- ---------- Crear una solicitud (estado pendiente, sin descontar) ----------
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
  v_saldo numeric;
  v_costo numeric;
  v_com_nombre text;
  v_sol public.solicitudes%rowtype;
begin
  select * into v_card from public.tarjetas where cliente_id = p_cliente_id;
  if not found then raise exception 'El cliente no tiene una tarjeta emitida'; end if;
  if v_card.activa = false then raise exception 'La tarjeta del cliente está inactiva'; end if;

  select * into v_premio from public.premios where id = p_premio_id;
  if not found then raise exception 'Premio no encontrado'; end if;
  if v_premio.activo = false then raise exception 'El premio no está disponible'; end if;
  if v_premio.stock <= 0 then raise exception 'No hay stock disponible del premio'; end if;

  v_costo := v_premio.puntos_necesarios;

  -- Validación de saldo (mismo criterio que el canje; los puntos NO se reservan)
  if v_premio.comercio_id is not null then
    select coalesce(sum(puntos), 0) into v_saldo from public.saldos_por_comercio
      where cliente_id = p_cliente_id and comercio_id = v_premio.comercio_id;
    select nombre into v_com_nombre from public.comercios where id = v_premio.comercio_id;
  else
    select coalesce(sum(puntos), 0) into v_saldo from public.saldos_por_comercio
      where cliente_id = p_cliente_id;
  end if;
  if v_saldo < v_costo then
    raise exception 'Puntos insuficientes: disponibles %, se requieren %', v_saldo, v_costo;
  end if;

  v_email := coalesce(p_usuario_email, (select email from public.profiles where id = auth.uid()));
  select nombre into v_nombre from public.clientes where id = p_cliente_id;

  insert into public.solicitudes (
    premio_id, premio_titulo, cliente_id, cliente_nombre, tarjeta_id, numero_tarjeta,
    comercio_id, comercio_nombre, puntos, estado, solicitado_por
  ) values (
    v_premio.id, v_premio.titulo, p_cliente_id, v_nombre, v_card.id, v_card.numero,
    v_premio.comercio_id, v_com_nombre, v_costo, 'pendiente', v_email
  )
  returning * into v_sol;

  return json_build_object(
    'solicitud_id', v_sol.id,
    'estado', 'pendiente',
    'premio', v_premio.titulo,
    'cliente', v_nombre,
    'puntos', v_costo
  );
end;
$$;
grant execute on function public.crear_solicitud(uuid, uuid, text) to authenticated;

-- ---------- Cambiar el estado de una solicitud ----------
create or replace function public.cambiar_estado_solicitud(
  p_solicitud_id uuid,
  p_nuevo_estado text,
  p_usuario_email text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_sol public.solicitudes%rowtype;
  v_email text;
  v_res json;
  v_canje_id uuid;
begin
  select * into v_sol from public.solicitudes where id = p_solicitud_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;

  if p_nuevo_estado not in ('pendiente', 'revision', 'confirmado', 'entregado', 'rechazada') then
    raise exception 'Estado inválido';
  end if;

  -- Reglas de flujo
  if p_nuevo_estado = 'confirmado' and v_sol.estado not in ('pendiente', 'revision') then
    raise exception 'Solo se puede confirmar una solicitud pendiente o en revisión';
  end if;
  if p_nuevo_estado = 'entregado' and v_sol.estado <> 'confirmado' then
    raise exception 'Solo se puede entregar un premio con el canje confirmado';
  end if;
  if p_nuevo_estado = 'rechazada' and v_sol.estado not in ('pendiente', 'revision') then
    raise exception 'Solo se puede rechazar una solicitud pendiente o en revisión';
  end if;

  v_email := coalesce(p_usuario_email, (select email from public.profiles where id = auth.uid()));

  if p_nuevo_estado = 'confirmado' and v_sol.canje_id is null then
    -- Ejecuta el canje real (descuenta puntos y stock de forma atómica)
    if v_sol.premio_id is null then raise exception 'El premio de la solicitud ya no existe'; end if;
    v_res := public.canjear_premio(v_sol.cliente_id, v_sol.premio_id, v_email);
    v_canje_id := (v_res->>'canje_id')::uuid;
    update public.solicitudes
      set estado = 'confirmado', canje_id = v_canje_id, actualizado_por = v_email, updated_at = now()
      where id = p_solicitud_id;
  else
    update public.solicitudes
      set estado = p_nuevo_estado, actualizado_por = v_email, updated_at = now()
      where id = p_solicitud_id;
  end if;

  return json_build_object('id', p_solicitud_id, 'estado', p_nuevo_estado);
end;
$$;
grant execute on function public.cambiar_estado_solicitud(uuid, text, text) to authenticated;
