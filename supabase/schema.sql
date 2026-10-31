-- Inventaire partagé unique : tous les utilisateurs authentifiés ont accès aux articles.
-- Exécuter ce fichier dans Supabase > SQL Editor. Les politiques RLS protègent l'API.
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  category text not null default 'Nourritures',
  quantity numeric(12, 2) not null default 0 check (quantity >= 0),
  unit text not null default 'unités',
  min_quantity numeric(12, 2) not null default 0 check (min_quantity >= 0),
  location text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.inventory_items alter column category set default 'Nourritures';

update public.inventory_items
set category = case
  when category = 'Boissons' then 'Boisson'
  when category = 'Épicerie' then 'Nourritures'
  when category in ('Emballages', 'Équipement', 'Autre') then 'Consommable'
  else category
end
where category in ('Boissons', 'Épicerie', 'Emballages', 'Équipement', 'Autre');

alter table public.inventory_items enable row level security;

drop policy if exists "Authenticated users can read inventory" on public.inventory_items;
create policy "Authenticated users can read inventory"
on public.inventory_items for select to authenticated using (true);

drop policy if exists "Authenticated users can add inventory items" on public.inventory_items;
create policy "Authenticated users can add inventory items"
on public.inventory_items for insert to authenticated with check (true);

drop policy if exists "Authenticated users can update inventory items" on public.inventory_items;
create policy "Authenticated users can update inventory items"
on public.inventory_items for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can delete inventory items" on public.inventory_items;
create policy "Authenticated users can delete inventory items"
on public.inventory_items for delete to authenticated using (true);

create index if not exists inventory_items_name_idx on public.inventory_items (name);
