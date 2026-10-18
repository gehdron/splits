-- Run this once in the Supabase SQL editor if groups already exist.
-- Saves people you split with as contacts, and lets an owner add a contact to a group.

create table if not exists public.friends (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

alter table public.friends enable row level security;

drop policy if exists "read your friends" on public.friends;
create policy "read your friends"
  on public.friends for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "remove a friend" on public.friends;
create policy "remove a friend"
  on public.friends for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.save_friend(member_phone text default null, member_email text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found_user uuid;
  clean_email text := nullif(lower(trim(member_email)), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in to save a friend';
  end if;

  if member_phone is not null and btrim(member_phone) <> '' and member_phone ~ '^\+[1-9][0-9]{9,14}$' then
    select id into found_user from public.profiles where phone = member_phone;
    if found_user is null then
      raise exception 'No account uses that phone number';
    end if;
  elsif clean_email is not null and clean_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    select id into found_user from auth.users where lower(email) = clean_email;
    if found_user is null then
      raise exception 'No account uses that email';
    end if;
  else
    raise exception 'Enter the phone number or email they used to sign up';
  end if;

  if found_user = auth.uid() then
    raise exception 'You are already on your own account';
  end if;

  insert into public.friends (user_id, friend_id)
  values (auth.uid(), found_user)
  on conflict (user_id, friend_id) do nothing;

  return found_user;
end;
$$;

create or replace function public.list_friends()
returns table (friend_id uuid, display_name text, phone text)
language sql
stable
security definer
set search_path = public
as $$
  select f.friend_id, p.display_name, p.phone
  from public.friends f
  join public.profiles p on p.id = f.friend_id
  where f.user_id = auth.uid()
  order by p.display_name;
$$;

create or replace function public.add_friend_to_group(target_group uuid, friend_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_member uuid;
begin
  if not public.is_group_owner(target_group) then
    raise exception 'Only a group owner can add members';
  end if;

  if not exists (
    select 1 from public.friends where user_id = auth.uid() and friend_id = friend_user
  ) then
    raise exception 'That person is not in your contacts';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (target_group, friend_user, 'member')
  on conflict (group_id, user_id) do nothing
  returning id into new_member;

  return new_member;
end;
$$;

revoke all on function public.save_friend(text, text) from public, anon;
revoke all on function public.list_friends() from public, anon;
revoke all on function public.add_friend_to_group(uuid, uuid) from public, anon;
grant execute on function public.save_friend(text, text) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.add_friend_to_group(uuid, uuid) to authenticated;
grant select, delete on public.friends to authenticated;
