-- Shared lists opened at /list. Run once in the Supabase SQL editor, after schema.sql.
-- On Vercel the app writes these with SUPABASE_SERVICE_ROLE_KEY. A local run keeps using data/store.json.
-- These are separate from public.lists, which are bills inside a group.

create table if not exists public.bill_lists (
  id uuid primary key,
  name text not null,
  owner_id uuid,
  merchant text,
  receipt_subtotal_cents integer check (receipt_subtotal_cents is null or receipt_subtotal_cents >= 0),
  tax_cents integer check (tax_cents is null or tax_cents >= 0),
  tip_cents integer check (tip_cents is null or tip_cents >= 0),
  receipt_total_cents integer check (receipt_total_cents is null or receipt_total_cents >= 0),
  created_at timestamptz not null default now()
);

alter table public.bill_lists
  add column if not exists merchant text,
  add column if not exists receipt_subtotal_cents integer,
  add column if not exists tax_cents integer,
  add column if not exists tip_cents integer,
  add column if not exists receipt_total_cents integer;

create table if not exists public.bill_list_members (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.bill_lists (id) on delete cascade,
  name text not null,
  user_id uuid,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create index if not exists bill_list_members_list_id on public.bill_list_members (list_id);

create table if not exists public.bill_items (
  id uuid primary key,
  list_id uuid not null references public.bill_lists (id) on delete cascade,
  name text not null,
  quantity integer not null default 1 check (quantity >= 1),
  price_cents integer not null default 0 check (price_cents >= 0),
  claimed_by text,
  purchased boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists bill_items_list_id on public.bill_items (list_id);

alter table public.bill_lists enable row level security;
alter table public.bill_list_members enable row level security;
alter table public.bill_items enable row level security;

-- No policies for signed-in users. The service role bypasses row level security, and the
-- browser only reaches these rows through the app's API, which strips phone numbers and emails.
