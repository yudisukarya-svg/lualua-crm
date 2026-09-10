-- =====================================================================
-- Migration 0004: Storage bucket + policies
-- =====================================================================
-- A single private bucket 'crm-files'. Files are reachable only by
-- authenticated users (via signed URLs generated in the app).
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('crm-files', 'crm-files', false)
on conflict (id) do nothing;

-- Authenticated users can read every object in the bucket.
drop policy if exists "crm_files_read" on storage.objects;
create policy "crm_files_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'crm-files');

-- Authenticated users can upload.
drop policy if exists "crm_files_insert" on storage.objects;
create policy "crm_files_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'crm-files');

-- Authenticated users can overwrite (used for re-upload / version flows).
drop policy if exists "crm_files_update" on storage.objects;
create policy "crm_files_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'crm-files');

-- Only admins may permanently delete underlying objects.
drop policy if exists "crm_files_delete" on storage.objects;
create policy "crm_files_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'crm-files' and public.is_admin());
