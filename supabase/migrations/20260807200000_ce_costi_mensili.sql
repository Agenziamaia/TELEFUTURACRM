-- CONTO ECONOMICO PER PUNTO VENDITA — fondamenta (mig. 188, cantiere 07/08)
--
-- Replica del foglio 'Costi & Ricavi' dell'Excel mensile dentro il CRM:
-- per ogni RADICE di negozio (gemelli sommati: Magliana = Multi+W3,
-- Acilia = Multi+VS, Collatina = Multi+W3) e per ogni mese si registrano
-- le voci di costo del foglio; il TELEFONICO NON si salva: è ripartito in
-- automatico dal motore (src/lib/contoEconomico.ts) pro-quota sugli
-- appuntamenti presi dal reparto — chiave verificata sulle formule del
-- foglio: telefonico(pv) = appuntamenti(pv) × costo_reparto / Σ appuntamenti.
--
-- 1) ce_costi_mensili — le voci editabili (direzione, pagina /conto-economico)
create table if not exists public.ce_costi_mensili (
  month      date not null,           -- primo del mese
  store_root text not null,           -- radice negozio: 'Magliana', 'Donna', ...
  voce       text not null,
  importo    numeric not null default 0,
  note       text,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (month, store_root, voce),
  constraint ce_voce_chk check (voce in (
    -- 11 voci del "Parz. Struttura" del foglio
    'affitto','luce','utenze','materiali','assicurazione','allarme','sicurezza',
    'immondizia','commercialista','consulente','insegna',
    -- lump-sum mensili
    'collaboratori','condivisi','formazione',
    -- partnership (tipicamente negativa = contributo) + segnaposto malus
    'partnership_w3','malus_partnership'
  ))
);
alter table public.ce_costi_mensili disable row level security;

-- 2) ce_telefonico_appuntamenti — input del riparto automatico
create table if not exists public.ce_telefonico_appuntamenti (
  month        date not null,
  store_root   text not null,
  appuntamenti integer not null default 0,
  fonte        text default 'manuale',   -- 'manuale' | 'vdl_import' | futuro aggancio caller
  updated_at   timestamptz not null default now(),
  primary key (month, store_root)
);
alter table public.ce_telefonico_appuntamenti disable row level security;

-- 3) ce_parametri — default globali (month null) con override per mese
create table if not exists public.ce_parametri (
  chiave      text not null,
  month       date,
  valore_num  numeric,
  valore_text text,
  updated_at  timestamptz not null default now()
);
alter table public.ce_parametri disable row level security;
-- unicità: (chiave, mese) per gli override, chiave sola per i default
create unique index if not exists ce_parametri_mese_uniq on public.ce_parametri (chiave, month) where month is not null;
create unique index if not exists ce_parametri_default_uniq on public.ce_parametri (chiave) where month is null;

insert into public.ce_parametri (chiave, month, valore_num)
select v.chiave, null, v.valore
  from (values ('telefonico_costo_reparto', 11400::numeric),
               ('bundle_coeff_default', 0.60::numeric)) as v(chiave, valore)
 where not exists (select 1 from public.ce_parametri p where p.chiave = v.chiave and p.month is null);

notify pgrst, 'reload schema';
