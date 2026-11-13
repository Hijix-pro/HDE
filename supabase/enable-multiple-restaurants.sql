-- Active la séparation des données entre restaurants.
-- À exécuter une seule fois après schema.sql et admin-users.sql.
begin;

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_members (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);

-- Le contenu déjà présent est conservé dans un espace de démonstration.
insert into public.restaurants (name, slug)
values ('Restaurant pilote', 'restaurant-pilote')
on conflict (slug) do nothing;

alter table public.inventory_items
  add column if not exists restaurant_id uuid references public.restaurants(id) on delete cascade;

update public.inventory_items
set restaurant_id = (select id from public.restaurants where slug = 'restaurant-pilote')
where restaurant_id is null;

insert into public.restaurant_members (restaurant_id, user_id, role)
select
  restaurant.id,
  profile.id,
  case
    when profile.role = 'super_admin' then 'owner'
    when profile.role = 'admin' then 'admin'
    else 'member'
  end
from public.profiles as profile
cross join public.restaurants as restaurant
where restaurant.slug = 'restaurant-pilote'
on conflict (restaurant_id, user_id) do nothing;

alter table public.inventory_items alter column restaurant_id set not null;
create index if not exists inventory_items_restaurant_name_idx
  on public.inventory_items (restaurant_id, name);
create index if not exists restaurant_members_user_idx
  on public.restaurant_members (user_id);

create or replace function public.is_restaurant_member(target_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.restaurant_members as membership
    where membership.restaurant_id = target_restaurant_id
      and membership.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_manage_restaurant(target_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.restaurant_members as membership
    where membership.restaurant_id = target_restaurant_id
      and membership.user_id = (select auth.uid())
      and membership.role in ('owner', 'admin')
  );
$$;

create or replace function public.can_view_restaurant_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.restaurant_members as actor
    join public.restaurant_members as target
      on target.restaurant_id = actor.restaurant_id
    where actor.user_id = (select auth.uid())
      and actor.role in ('owner', 'admin')
      and target.user_id = target_user_id
  );
$$;

revoke all on function public.is_restaurant_member(uuid) from public;
revoke all on function public.can_manage_restaurant(uuid) from public;
revoke all on function public.can_view_restaurant_profile(uuid) from public;
grant execute on function public.is_restaurant_member(uuid) to authenticated;
grant execute on function public.can_manage_restaurant(uuid) to authenticated;
grant execute on function public.can_view_restaurant_profile(uuid) to authenticated;

alter table public.restaurants enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.inventory_items enable row level security;
alter table public.profiles enable row level security;

grant select on public.restaurants, public.restaurant_members to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.inventory_items to authenticated;
revoke all on public.restaurants, public.restaurant_members from anon, public;
revoke all on public.inventory_items from anon;
revoke all on public.profiles from anon;

-- Supprime les anciennes règles permissives avant d'installer les règles par restaurant.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('restaurants', 'restaurant_members', 'inventory_items', 'profiles')
  loop
    execute format('drop policy %I on %I.%I', existing_policy.policyname, existing_policy.schemaname, existing_policy.tablename);
  end loop;
end;
$$;

create policy "Members can view their restaurants"
on public.restaurants for select to authenticated
using ((select public.is_restaurant_member(id)));

create policy "Users can view memberships in their restaurants"
on public.restaurant_members for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.can_manage_restaurant(restaurant_id))
);

create policy "Restaurant members can view inventory"
on public.inventory_items for select to authenticated
using ((select public.is_restaurant_member(restaurant_id)));

create policy "Restaurant admins can add inventory"
on public.inventory_items for insert to authenticated
with check ((select public.can_manage_restaurant(restaurant_id)));

create policy "Restaurant admins can update inventory"
on public.inventory_items for update to authenticated
using ((select public.can_manage_restaurant(restaurant_id)))
with check ((select public.can_manage_restaurant(restaurant_id)));

create policy "Restaurant admins can delete inventory"
on public.inventory_items for delete to authenticated
using ((select public.can_manage_restaurant(restaurant_id)));

create policy "Users can view their own profile and restaurant teammates"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (select public.can_view_restaurant_profile(id))
);

commit;
