-- Profil et rôles pour la gestion des comptes par un administrateur.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  role text not null default 'member' check (role in ('member', 'admin', 'super_admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('member', 'admin', 'super_admin'));

create or replace function public.is_inventory_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('admin', 'super_admin')
  );
$$;

revoke all on function public.is_inventory_admin() from public;
grant execute on function public.is_inventory_admin() to authenticated;

drop policy if exists "Authenticated users can add inventory items" on public.inventory_items;
drop policy if exists "Admins can add inventory items" on public.inventory_items;
create policy "Admins can add inventory items"
on public.inventory_items for insert to authenticated
with check ((select public.is_inventory_admin()));

drop policy if exists "Authenticated users can update inventory items" on public.inventory_items;
drop policy if exists "Admins can update inventory items" on public.inventory_items;
create policy "Admins can update inventory items"
on public.inventory_items for update to authenticated
using ((select public.is_inventory_admin()))
with check ((select public.is_inventory_admin()));

drop policy if exists "Authenticated users can delete inventory items" on public.inventory_items;
drop policy if exists "Admins can delete inventory items" on public.inventory_items;
create policy "Admins can delete inventory items"
on public.inventory_items for delete to authenticated
using ((select public.is_inventory_admin()));

drop policy if exists "Users can view own profile or admins can view all" on public.profiles;
create policy "Users can view own profile or admins can view all"
on public.profiles for select to authenticated
using ((select auth.uid()) = id or (select public.is_inventory_admin()));

create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name;
  return new;
end;
$$;

drop trigger if exists "sync profile after auth user created" on auth.users;
create trigger "sync profile after auth user created"
after insert on auth.users
for each row execute function public.sync_profile_from_auth_user();

drop trigger if exists "sync profile after auth metadata updated" on auth.users;
create trigger "sync profile after auth metadata updated"
after update of raw_user_meta_data on auth.users
for each row execute function public.sync_profile_from_auth_user();

insert into public.profiles (id, first_name, last_name)
select
  id,
  coalesce(raw_user_meta_data ->> 'first_name', ''),
  coalesce(raw_user_meta_data ->> 'last_name', '')
from auth.users
on conflict (id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name;
