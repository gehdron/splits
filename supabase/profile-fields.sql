-- Apply once to an existing database to enable editable profile details and photos.
alter table public.profiles
  add column if not exists bio text not null default '',
  add column if not exists avatar_url text;

alter table public.profiles
  drop constraint if exists profiles_bio_length;

alter table public.profiles
  add constraint profiles_bio_length check (char_length(bio) <= 280);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view profile photos" on storage.objects;
create policy "Public can view profile photos"
  on storage.objects for select
  using (bucket_id = 'profile-photos');

drop policy if exists "Users manage their own profile photos" on storage.objects;
create policy "Users manage their own profile photos"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
