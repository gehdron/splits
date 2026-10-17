-- Run this once in the Supabase SQL editor if groups already exist.
-- Replaces add_group_member so an owner can add someone by phone or email.

drop function if exists public.add_group_member(uuid, text);

create function public.add_group_member(
  target_group uuid,
  member_phone text default null,
  member_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found_user uuid;
  new_member uuid;
  clean_email text := nullif(lower(trim(member_email)), '');
begin
  if not public.is_group_owner(target_group) then
    raise exception 'Only a group owner can add members';
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

  insert into public.group_members (group_id, user_id, role)
  values (target_group, found_user, 'member')
  on conflict (group_id, user_id) do nothing
  returning id into new_member;

  return new_member;
end;
$$;

revoke all on function public.add_group_member(uuid, text, text) from public, anon;
grant execute on function public.add_group_member(uuid, text, text) to authenticated;
