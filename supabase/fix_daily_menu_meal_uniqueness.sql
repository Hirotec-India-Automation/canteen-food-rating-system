-- Fixes the legacy one-menu-per-date constraint that prevents saving lunch
-- and dinner as separate rows. Safe to run more than once.
begin;

alter table public.daily_menu
  add column if not exists meal_type text;

update public.daily_menu
set meal_type = 'lunch'
where meal_type is null;

alter table public.daily_menu
  alter column meal_type set default 'lunch',
  alter column meal_type set not null;

alter table public.daily_menu
  drop constraint if exists daily_menu_menu_date_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_menu'::regclass
      and conname = 'daily_menu_menu_date_meal_type_key'
  ) then
    alter table public.daily_menu
      add constraint daily_menu_menu_date_meal_type_key
      unique (menu_date, meal_type);
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
