-- Splits schema. Run this in the Supabase SQL editor.
-- If an earlier version of this file was already applied, drop those public tables first.
-- Money is integer cents. Who owes what is the view at the bottom, not a stored total.
-- The Photon agent should use the service role key, which bypasses these policies.
-- The browser uses the publishable key, so row level security applies there.
--
-- A signed-in user sees items only after they are a member of that item's group.
-- Creating a group adds the creator. Everyone else is added by the group owner, by phone or email.

create extension if not exists pgcrypto;

-- A profile row is created for every auth account. Phone is required.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  phone text not null unique check (phone ~ '^\+[1-9][0-9]{9,14}$'),
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_phone text := nullif(trim(new.raw_user_meta_data ->> 'phone'), '');
begin
  if user_phone is null or user_phone !~ '^\+[1-9][0-9]{9,14}$' then
    raise exception 'A phone number is required';
  end if;

  insert into public.profiles (id, display_name, phone)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    user_phone
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- People who share bills. Membership is the only way to see the group's items.
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create unique index group_members_one_owner on public.group_members (group_id) where role = 'owner';
create index group_members_user_id on public.group_members (user_id);

-- One list is one bill inside a group.
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'Shared list',
  share_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index lists_group_id on public.lists (group_id);

-- Receipt totals are what the scan read. The app checks that item prices agree with them.
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  merchant text,
  subtotal_cents integer check (subtotal_cents is null or subtotal_cents >= 0),
  tax_cents integer check (tax_cents is null or tax_cents >= 0),
  tip_cents integer check (tip_cents is null or tip_cents >= 0),
  total_cents integer check (total_cents is null or total_cents >= 0),
  created_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  receipt_id uuid references public.receipts (id) on delete set null,
  name text not null check (char_length(trim(name)) > 0),
  quantity integer not null default 1 check (quantity >= 1),
  price_cents integer not null default 0 check (price_cents >= 0),
  purchased boolean not null default false,
  created_at timestamptz not null default now()
);

create index items_list_id on public.items (list_id);

-- Several rows mean a shared plate. The price is split evenly across these claims.
create table public.item_claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  member_id uuid not null references public.group_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (item_id, member_id)
);

create index item_claims_member_id on public.item_claims (member_id);

-- Stops the iMessage agent from adding the same text twice. Service role only.
create table public.text_events (
  message_id text primary key,
  list_id uuid not null references public.lists (id) on delete cascade,
  item_id uuid references public.items (id) on delete set null,
  created_at timestamptz not null default now()
);

create function public.add_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_group_created
  after insert on public.groups
  for each row execute function public.add_owner_member();

-- A claim has to belong to the same group as the item.
create function public.claim_matches_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_group uuid;
  member_group uuid;
begin
  select l.group_id into item_group
  from public.items i
  join public.lists l on l.id = i.list_id
  where i.id = new.item_id;

  select group_id into member_group
  from public.group_members
  where id = new.member_id;

  if item_group is null or member_group is null or item_group <> member_group then
    raise exception 'That person is not in this item''s group';
  end if;

  return new;
end;
$$;

create trigger on_item_claim
  before insert or update of item_id, member_id on public.item_claims
  for each row execute function public.claim_matches_group();

-- Each claim gets an even share of price_cents * quantity.
-- Leftover cents go to the earliest claims, so the shares add back to the line price.
create view public.who_owes_what
with (security_invoker = true) as
with claims as (
  select
    l.group_id,
    i.list_id,
    c.member_id,
    i.price_cents * i.quantity as line_cents,
    count(*) over (partition by i.id) as claim_count,
    row_number() over (partition by i.id order by c.created_at, c.id) as claim_index
  from public.item_claims c
  join public.items i on i.id = c.item_id
  join public.lists l on l.id = i.list_id
),
shares as (
  select
    group_id,
    list_id,
    member_id,
    (line_cents / claim_count)
      + case when claim_index <= (line_cents % claim_count) then 1 else 0 end as share_cents
  from claims
)
select
  s.group_id,
  s.list_id,
  s.member_id,
  m.user_id,
  p.display_name as name,
  p.phone,
  sum(s.share_cents)::integer as total_cents
from shares s
join public.group_members m on m.id = s.member_id
join public.profiles p on p.id = m.user_id
group by s.group_id, s.list_id, s.member_id, m.user_id, p.display_name, p.phone;

create function public.is_group_member(target_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = target_group and user_id = auth.uid()
  );
$$;

create function public.is_group_owner(target_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = target_group and user_id = auth.uid() and role = 'owner'
  );
$$;

-- Owners add an existing account by the phone or email from sign-up.
-- There is no insert policy on group_members, so users cannot add themselves.
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

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.lists enable row level security;
alter table public.receipts enable row level security;
alter table public.items enable row level security;
alter table public.item_claims enable row level security;
alter table public.text_events enable row level security;

create policy "read your profile and profiles in your groups"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.group_members mine
      join public.group_members theirs on theirs.group_id = mine.group_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

create policy "update your profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and phone ~ '^\+[1-9][0-9]{9,14}$');

create policy "read groups you belong to"
  on public.groups for select to authenticated
  using (created_by = auth.uid() or public.is_group_member(id));

create policy "create a group"
  on public.groups for insert to authenticated
  with check (created_by = auth.uid());

create policy "owners rename groups"
  on public.groups for update to authenticated
  using (public.is_group_owner(id))
  with check (public.is_group_owner(id) and created_by = auth.uid());

create policy "owners delete groups"
  on public.groups for delete to authenticated
  using (public.is_group_owner(id));

create policy "read members of your groups"
  on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

create policy "owners remove members"
  on public.group_members for delete to authenticated
  using (public.is_group_owner(group_id) and role = 'member');

create policy "members leave a group"
  on public.group_members for delete to authenticated
  using (user_id = auth.uid() and role = 'member');

create policy "read lists in your groups"
  on public.lists for select to authenticated
  using (public.is_group_member(group_id));

create policy "owners create lists"
  on public.lists for insert to authenticated
  with check (created_by = auth.uid() and public.is_group_owner(group_id));

create policy "owners rename lists"
  on public.lists for update to authenticated
  using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id));

create policy "owners delete lists"
  on public.lists for delete to authenticated
  using (public.is_group_owner(group_id));

create policy "read receipts in your groups"
  on public.receipts for select to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = receipts.list_id and public.is_group_member(l.group_id)
    )
  );

create policy "owners add receipts"
  on public.receipts for insert to authenticated
  with check (
    exists (
      select 1 from public.lists l
      where l.id = receipts.list_id and public.is_group_owner(l.group_id)
    )
  );

create policy "owners edit receipts"
  on public.receipts for update to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = receipts.list_id and public.is_group_owner(l.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.lists l
      where l.id = receipts.list_id and public.is_group_owner(l.group_id)
    )
  );

create policy "owners delete receipts"
  on public.receipts for delete to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = receipts.list_id and public.is_group_owner(l.group_id)
    )
  );

create policy "members read items"
  on public.items for select to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = items.list_id and public.is_group_member(l.group_id)
    )
  );

create policy "owners add items"
  on public.items for insert to authenticated
  with check (
    exists (
      select 1 from public.lists l
      where l.id = items.list_id and public.is_group_owner(l.group_id)
    )
  );

create policy "owners edit items"
  on public.items for update to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = items.list_id and public.is_group_owner(l.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.lists l
      where l.id = items.list_id and public.is_group_owner(l.group_id)
    )
  );

create policy "owners delete items"
  on public.items for delete to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = items.list_id and public.is_group_owner(l.group_id)
    )
  );

create policy "members read claims"
  on public.item_claims for select to authenticated
  using (
    exists (
      select 1
      from public.items i
      join public.lists l on l.id = i.list_id
      where i.id = item_claims.item_id and public.is_group_member(l.group_id)
    )
  );

create policy "claim for yourself or the owner assigns"
  on public.item_claims for insert to authenticated
  with check (
    exists (
      select 1
      from public.items i
      join public.lists l on l.id = i.list_id
      join public.group_members m on m.id = item_claims.member_id and m.group_id = l.group_id
      where i.id = item_claims.item_id
        and public.is_group_member(l.group_id)
        and (m.user_id = auth.uid() or public.is_group_owner(l.group_id))
    )
  );

create policy "drop your claim or the owner unassigns"
  on public.item_claims for delete to authenticated
  using (
    exists (
      select 1
      from public.items i
      join public.lists l on l.id = i.list_id
      join public.group_members m on m.id = item_claims.member_id and m.group_id = l.group_id
      where i.id = item_claims.item_id
        and (m.user_id = auth.uid() or public.is_group_owner(l.group_id))
    )
  );

-- text_events has no policies, so only the service role can read or write it.

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.add_owner_member() from public, anon, authenticated;
revoke all on function public.claim_matches_group() from public, anon, authenticated;
revoke all on function public.is_group_member(uuid) from public, anon;
revoke all on function public.is_group_owner(uuid) from public, anon;
revoke all on function public.add_group_member(uuid, text, text) from public, anon;

grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.add_group_member(uuid, text, text) to authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.lists to authenticated;
grant select, insert, update, delete on public.receipts to authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select, insert, delete on public.item_claims to authenticated;
grant select on public.who_owes_what to authenticated;

-- Accounts created before this trigger get a profile only when they already have a valid phone.
insert into public.profiles (id, display_name, phone)
select
  id,
  coalesce(nullif(trim(raw_user_meta_data ->> 'name'), ''), split_part(email, '@', 1)),
  raw_user_meta_data ->> 'phone'
from auth.users
where raw_user_meta_data ->> 'phone' ~ '^\+[1-9][0-9]{9,14}$'
on conflict (id) do nothing;
