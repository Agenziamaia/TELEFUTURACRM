-- Segnalazione 73 (lato Password): categorie della sezione Password gestibili
-- dal Direttore Commerciale in su, come per la Documentazione. Prima erano fisse
-- nel codice. Ogni categoria appartiene a un brand.
--
-- cat_key = chiave stabile usata da password_credentials.category_id.

create table if not exists public.password_categories (
  id         bigint generated always as identity primary key,
  brand_id   text not null,
  cat_key    text not null,
  name       text not null,
  sort       int  not null default 100,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists password_categories_brand_key_uq
  on public.password_categories (brand_id, cat_key);

-- Seed dalle categorie storiche (idempotente).
insert into public.password_categories (brand_id, cat_key, name, sort) values
  ('windtre', 'ngpos',           'NGPOS',            10),
  ('windtre', 'ask',             'ASK',              20),
  ('windtre', 'findomestic',     'FINDOMESTIC',      30),
  ('windtre', 'compass',         'COMPASS',          40),
  ('vodafone','vodafone-one',    'Vodafone One',     10),
  ('vodafone','mnp-portal',      'MNP Portal',       20),
  ('vodafone','admin-dashboard', 'Admin Dashboard',  30),
  ('tim',     'tim-partner',     'TIM Partner',      10),
  ('tim',     'admin-dashboard', 'Admin Dashboard',  20),
  ('sky',     'sky-agent',       'Sky Agent',        10),
  ('sky',     'sky-business',    'Sky Business',      20),
  ('sky',     'admin-dashboard', 'Admin Dashboard',  30),
  ('fastweb', 'partner-portal',  'Partner Portal',   10),
  ('fastweb', 'admin-dashboard', 'Admin Dashboard',  20),
  ('energia', 's4-energy',       'S4 Energy Portal', 10),
  ('energia', 'barton',          'Barton Portal',    20),
  ('energia', 'admin-dashboard', 'Admin Dashboard',  30)
on conflict (brand_id, cat_key) do nothing;

alter table public.password_categories enable row level security;
drop policy if exists password_categories_all on public.password_categories;
create policy password_categories_all on public.password_categories for all using (true) with check (true);
