create policy "org files read" on storage.objects for select to authenticated
  using (bucket_id = 'org-files' and public.can_access_org(((storage.foldername(name))[1])::uuid));
create policy "org files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'org-files' and public.can_edit_org(((storage.foldername(name))[1])::uuid));
create policy "org files update" on storage.objects for update to authenticated
  using (bucket_id = 'org-files' and public.can_edit_org(((storage.foldername(name))[1])::uuid));
create policy "org files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'org-files' and public.can_edit_org(((storage.foldername(name))[1])::uuid));