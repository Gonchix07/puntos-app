-- ============================================================
--  Migración: Código Cliente Interno (opcional)
--  - Nueva columna codigo_interno: 5 caracteres alfanuméricos
--  Ejecutar en Supabase SQL Editor.
-- ============================================================

alter table public.clientes
  add column if not exists codigo_interno text;

alter table public.clientes drop constraint if exists clientes_codigo_interno_valido;
alter table public.clientes
  add constraint clientes_codigo_interno_valido
  check (codigo_interno is null or codigo_interno ~ '^[A-Za-z0-9]{5}$');
