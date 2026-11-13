-- Schéma de base de l'inventaire.
-- Exécuter ensuite admin-users.sql puis enable-multiple-restaurants.sql.
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

create index if not exists inventory_items_name_idx on public.inventory_items (name);
