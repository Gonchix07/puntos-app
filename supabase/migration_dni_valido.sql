-- ============================================================
--  Migración: validar el DNI (número entre 1.000.000 y 99.999.999)
--  Ejecutar en Supabase SQL Editor.
--
--  Si ya tenés clientes con DNI fuera de rango, la creación del
--  constraint va a fallar. Para detectarlos:
--    select id, nombre, dni from public.clientes
--    where dni !~ '^[1-9][0-9]{6,7}$';
-- ============================================================

alter table public.clientes drop constraint if exists clientes_dni_valido;
alter table public.clientes
  add constraint clientes_dni_valido check (dni ~ '^[1-9][0-9]{6,7}$');
