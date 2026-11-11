-- Storage for AI-generated card illustrations.
-- Kept in its own bucket so lecture payloads and the sync queue stay untouched.

insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', false)
on conflict (id) do update set public = false;

drop policy if exists "Users can read their own card images" on storage.objects;
create policy "Users can read their own card images" on storage.objects
  for select to authenticated
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can upload their own card images" on storage.objects;
create policy "Users can upload their own card images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can update their own card images" on storage.objects;
create policy "Users can update their own card images" on storage.objects
  for update to authenticated
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
