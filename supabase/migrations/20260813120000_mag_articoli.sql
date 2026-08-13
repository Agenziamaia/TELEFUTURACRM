-- ANAGRAFICA ARTICOLI del Magazzino (task Luca 13/08): dall'export giacenze
-- del gestionale si prendono SOLO i riferimenti degli articoli (niente
-- disponibilità) per cominciare a popolarli e dividerli per brand.
-- Divisione: gruppo = listino/famiglia del gestionale (LISTINO WIND3,
-- LISTINO VODAFONE, Accessori, USATO...), sottogruppo = merceologia
-- (SMARTPHONE, Custodie...), marca = brand del produttore (SAMSUNG, APPLE...).
create table if not exists public.mag_articoli (
  codice text primary key,
  barcode text,
  descrizione text not null,
  gruppo text,
  sottogruppo text,
  marca text,
  iva_acquisto text,
  iva_vendita text,
  costo_ultimo numeric,
  prezzo numeric,
  attivo boolean not null default true,
  fonte text,
  created_at timestamptz not null default now()
);
-- REGOLA post-cerotto RLS (11/08): ogni CREATE TABLE crea SUBITO le policy,
-- altrimenti rls_auto_enable la chiude e le scritture falliscono in silenzio.
alter table public.mag_articoli enable row level security;
drop policy if exists mag_articoli_allow_all on public.mag_articoli;
create policy mag_articoli_allow_all on public.mag_articoli
  for all using (true) with check (true);
notify pgrst, 'reload schema';
