-- ============================================================
--  Migración: logo de comercios
--  Ejecutar en Supabase SQL Editor.
-- ============================================================

alter table public.comercios
  add column if not exists logo_url text;

-- Bucket público para los logos
insert into storage.buckets (id, name, public)
values ('comercios', 'comercios', true)
on conflict (id) do nothing;

drop policy if exists "comercios logo lectura" on storage.objects;
create policy "comercios logo lectura" on storage.objects
  for select using (bucket_id = 'comercios');
drop policy if exists "comercios logo insert" on storage.objects;
create policy "comercios logo insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'comercios' and public.is_admin());
drop policy if exists "comercios logo update" on storage.objects;
create policy "comercios logo update" on storage.objects
  for update to authenticated using (bucket_id = 'comercios' and public.is_admin());
drop policy if exists "comercios logo delete" on storage.objects;
create policy "comercios logo delete" on storage.objects
  for delete to authenticated using (bucket_id = 'comercios' and public.is_admin());
