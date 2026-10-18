-- Pay links. Run once in the Supabase SQL editor, after schema.sql.
-- The server writes these tables with SUPABASE_SERVICE_ROLE_KEY (the Stripe webhook and the public
-- /pay page have no signed-in user). Signed-in organizers can read their own rows.

-- Where an organizer's money goes: a Stripe Connect Express account, plus the Plaid-linked bank.
create table if not exists public.payout_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_account_id text unique,
  plaid_item_id text,
  bank_name text,
  bank_last4 text,
  -- Stripe lets the platform set an Express account's bank only before onboarding starts.
  onboarding_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payout_accounts enable row level security;

drop policy if exists "read own payout account" on public.payout_accounts;
create policy "read own payout account" on public.payout_accounts
  for select using (user_id = auth.uid());

-- One person's share of a bill. The id is the opaque part of https://splits.select/pay/sh_...
create table if not exists public.shares (
  id text primary key check (id ~ '^sh_[A-Za-z0-9]{22}$'),
  amount_cents integer not null check (amount_cents >= 50),
  currency text not null default 'usd',
  person_name text not null,
  title text not null,
  status text not null default 'unpaid' check (status in ('unpaid', 'sent', 'paid', 'void')),
  recipient_handle text,
  organizer_id uuid references public.profiles (id) on delete set null,
  organizer_name text,
  stripe_connect_account_id text,
  stripe_session_id text,
  stripe_payment_intent_id text,
  source text not null check (source in ('list')),
  source_ref text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  paid_at timestamptz
);

create index if not exists shares_source on public.shares (source, source_ref);
create index if not exists shares_organizer on public.shares (organizer_id);
-- At most one payable link per person per list, so two clicks at once can't make two charge pages.
create unique index if not exists shares_one_open_link on public.shares (source, source_ref, person_name)
  where status in ('unpaid', 'sent');

alter table public.shares enable row level security;

drop policy if exists "organizers read their shares" on public.shares;
create policy "organizers read their shares" on public.shares
  for select using (organizer_id = auth.uid());

-- If you ran an earlier version of this file, these bring it up to date.
alter table public.payout_accounts add column if not exists onboarding_started_at timestamptz;
alter table public.shares drop constraint if exists shares_status_check;
alter table public.shares add constraint shares_status_check check (status in ('unpaid', 'sent', 'paid', 'void'));
