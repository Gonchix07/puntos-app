-- ============================================================
--  Migración: portal de clientes (usuarios_web)
--  - Tabla de cuentas del portal: autenticación propia (scrypt),
--    SIN usar Supabase Auth. Solo accede el service_role desde
--    las funciones serverless /api/portal-*.
--  - Requiere la columna clientes.cliente_web (migration_cliente_web.sql).
--  Ejecutar en Supabase SQL Editor.
-- ============================================================

create table if not exists public.usuarios_web (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null unique references public.clientes(id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  activo boolean not null default true,
  -- Recupero de contraseña: se guarda el hash SHA-256 del token enviado por mail
  reset_token_hash text,
  reset_token_expira timestamptz,
  ultimo_login timestamptz,
  created_at timestamptz not null default now()
);

-- RLS habilitado SIN políticas: ni anon ni authenticated pueden tocarla;
-- solo el service_role (API del portal) tiene acceso.
alter table public.usuarios_web enable row level security;
