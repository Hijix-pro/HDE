-- Harmonise les anciennes catégories avec la nouvelle liste de HDE-Inventaire.
alter table public.inventory_items
  alter column category set default 'Nourritures';

update public.inventory_items
set category = case
  when category = 'Boissons' then 'Boisson'
  when category = 'Épicerie' then 'Nourritures'
  when category in ('Emballages', 'Équipement', 'Autre') then 'Consommable'
  else category
end
where category in ('Boissons', 'Épicerie', 'Emballages', 'Équipement', 'Autre');
