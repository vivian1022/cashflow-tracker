-- ============================================================
-- Cashflow Tracker schema
-- Run this ONCE in Supabase: Dashboard -> SQL Editor -> paste & run
-- ============================================================

create table if not exists categories (
  id serial primary key,
  name text unique not null,
  direction text not null check (direction in ('in', 'out')),
  is_preset boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  tx_date date not null,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  direction text not null check (direction in ('in', 'out')),
  category_id int references categories(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists transactions_tx_date_idx on transactions (tx_date);
create index if not exists transactions_category_idx on transactions (category_id);

-- Block all access from the public anon key.
-- The server uses the service-role key, which bypasses RLS.
alter table categories enable row level security;
alter table transactions enable row level security;

-- ============================================================
-- Preset SME categories
-- ============================================================
insert into categories (name, direction) values
  ('Product Sales', 'in'),
  ('Service Revenue', 'in'),
  ('Other Income', 'in'),
  ('Rent', 'out'),
  ('Salary & Wages', 'out'),
  ('Utilities', 'out'),
  ('Supplies & Inventory', 'out'),
  ('Marketing', 'out'),
  ('Equipment', 'out'),
  ('Taxes & Licenses', 'out'),
  ('Transport & Delivery', 'out'),
  ('Other Expense', 'out')
on conflict (name) do nothing;
