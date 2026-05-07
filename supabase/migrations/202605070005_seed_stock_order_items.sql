insert into public.stock_order_items (item_name, is_active)
values
  ('Heavy duty wash chemical', true),
  ('Spray lance trigger', true),
  ('Pressure hose', true),
  ('Gloves', true),
  ('Tyre shine bottles', true),
  ('Pony batteries', true)
on conflict (item_name) do update
set is_active = excluded.is_active;
