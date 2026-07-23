-- Segnalazione 50 (NON RISOLTO, lato Password): "mancano dei brand".
-- Aggiunti Iliad, Kena e Ho alla pagina Password; qui semino le loro categorie
-- in password_categories cosi sono gestibili (rinominabili/eliminabili) come le
-- altre gia dalla prima apertura. Idempotente.

insert into public.password_categories (brand_id, cat_key, name, sort) values
  ('iliad', 'iliad-partner',   'Iliad Partner',   10),
  ('iliad', 'admin-dashboard', 'Admin Dashboard', 20),
  ('kena',  'kena-partner',    'Kena Partner',    10),
  ('kena',  'admin-dashboard', 'Admin Dashboard', 20),
  ('ho',    'ho-partner',      'Ho Partner',      10),
  ('ho',    'admin-dashboard', 'Admin Dashboard', 20)
on conflict (brand_id, cat_key) do nothing;
