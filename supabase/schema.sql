-- Canteen Food Rating System - Supabase schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).

create extension if not exists "pgcrypto";

-- Master catalog of every food item the admin has ever added
create table if not exists food_items (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

-- One row per calendar day + meal type holding the list of items
create table if not exists daily_menu (
  id uuid primary key default gen_random_uuid(),
  menu_date date not null,
  meal_type text not null default 'lunch' check (meal_type in ('lunch','dinner')),
  items text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (menu_date, meal_type)
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

-- Migration: add meal_type to existing daily_menu tables
alter table daily_menu add column if not exists meal_type text not null default 'lunch'
  check (meal_type in ('lunch','dinner'));
-- Replace the old unique-on-date constraint with unique-on-(date,meal_type)
alter table daily_menu drop constraint if exists daily_menu_menu_date_key;
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'daily_menu_menu_date_meal_type_key'
  ) then
    alter table daily_menu add constraint daily_menu_menu_date_meal_type_key
      unique (menu_date, meal_type);
  end if;
end $$;

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

