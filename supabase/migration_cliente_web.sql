-- ============================================================
--  Migración: tilde "Cliente Web" en clientes
--  - Nueva columna booleana cliente_web (default false)
--  Ejecutar en Supabase SQL Editor.
-- ============================================================

alter table public.clientes
  add column if not exists cliente_web boolean not null default false;
