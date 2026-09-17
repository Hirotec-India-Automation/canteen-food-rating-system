-- Canteen Food Rating System - Supabase schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).

create extension if not exists "pgcrypto";

-- Master catalog of every food item the admin has ever added
create table if not exists food_items (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

-- One row per calendar day holding the list of items on that day's menu
create table if not exists daily_menu (
  id uuid primary key default gen_random_uuid(),
  menu_date date unique not null,
  items text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- One row per feedback event submitted by an employee
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  feedback_date date not null default current_date,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

-- Add columns individually (idempotent) in case an older version of this
-- table already existed without them — "create table if not exists" above
-- is a no-op on an existing table, so it would never add missing columns.
alter table feedback add column if not exists feedback_type text;
alter table feedback add column if not exists food_item text;
alter table feedback add column if not exists reason text;

alter table feedback drop constraint if exists feedback_feedback_type_check;
alter table feedback add constraint feedback_feedback_type_check
  check (feedback_type in ('good_food', 'reason', 'rating_only'));
alter table feedback alter column feedback_type set not null;

create index if not exists feedback_date_idx on feedback (feedback_date);
create index if not exists daily_menu_date_idx on daily_menu (menu_date);

-- Row Level Security: this is a public/internal tool with no server-side auth,
-- so the anon key is allowed to read/write directly. Do not reuse this schema
-- for data that needs real access control without adding proper auth policies.
alter table food_items enable row level security;
alter table daily_menu enable row level security;
alter table feedback enable row level security;

drop policy if exists "food_items anon all" on food_items;
create policy "food_items anon all" on food_items
  for all using (true) with check (true);

drop policy if exists "daily_menu anon all" on daily_menu;
create policy "daily_menu anon all" on daily_menu
  for all using (true) with check (true);

drop policy if exists "feedback anon all" on feedback;
create policy "feedback anon all" on feedback
  for all using (true) with check (true);

-- Force PostgREST to pick up the schema changes immediately instead of
-- waiting for its next periodic cache refresh (this is what caused PGRST204).
notify pgrst, 'reload schema';

