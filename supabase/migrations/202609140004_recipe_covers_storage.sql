-- Ensure the recipe-covers storage bucket exists and is public
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-covers',
  'recipe-covers',
  true,
  10485760, -- 10MB max limit (client compresses to ~60-80KB WebP)
  array['image/webp', 'image/jpeg', 'image/png', 'image/avif', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/avif', 'image/gif'];

-- Storage RLS policies
-- 1. Anyone can view public recipe covers
drop policy if exists "Recipe covers are publicly accessible" on storage.objects;
create policy "Recipe covers are publicly accessible"
  on storage.objects for select
  using ( bucket_id = 'recipe-covers' );

-- 2. Authenticated users can upload recipe covers under their user folder
drop policy if exists "Authenticated users can upload recipe covers" on storage.objects;
create policy "Authenticated users can upload recipe covers"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recipe-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- 3. Users can update their own recipe covers
drop policy if exists "Users can update their own recipe covers" on storage.objects;
create policy "Users can update their own recipe covers"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'recipe-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- 4. Users can delete their own recipe covers
drop policy if exists "Users can delete their own recipe covers" on storage.objects;
create policy "Users can delete their own recipe covers"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'recipe-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
