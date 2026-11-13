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

-- Les politiques d'accès à l'inventaire et aux profils sont créées par
-- enable-multiple-restaurants.sql pour limiter les données à chaque restaurant.

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
