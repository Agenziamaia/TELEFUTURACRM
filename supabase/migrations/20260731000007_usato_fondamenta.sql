-- Mig. 113 — GESTIONE USATO, fondamenta (Luca 31/07/2026).
-- Prima di ogni modifica UI si sistemano i dati:
--  1) l'anagrafica del venditore-cliente raccolta nel Registra Usato veniva
--     BUTTATA VIA: ora ogni usato si aggancia al cliente (client_id) e
--     ricorda chi l'ha registrato (venditore);
--  2) regole del laboratorio (tecnico senior) amministrabili: giorni concessi
--     per fase e malus €/giorno — stile regole PDA;
--  3) storico malus persistente per il laboratorio (episodi, come mig. 103):
--     il telefono sanato smette di maturare ma l'episodio resta, in attesa
--     di compensazione nella gara di commissioning dedicata.

-- 1) collegamento cliente + chi ha registrato
alter table public.usati
  add column if not exists client_id text references public.clients(id) on delete set null,
  add column if not exists venditore text not null default '';
create index if not exists idx_usati_client on public.usati(client_id);

-- 2) regole del laboratorio (modificabili SOLO dall'admin, pannello dedicato)
create table if not exists public.usati_regole (
  fase text primary key,             -- 'lavorazione' | 'riparazione'
  etichetta text not null default '',
  giorni int not null default 3,     -- giorni lavorativi concessi (lun-sab)
  malus_giorno numeric not null default 5,
  updated_at timestamptz not null default now()
);
alter table public.usati_regole enable row level security;
drop policy if exists "Allow anon usati_regole" on public.usati_regole;
create policy "Allow anon usati_regole" on public.usati_regole for all using (true) with check (true);
insert into public.usati_regole (fase, etichetta, giorni, malus_giorno) values
  ('lavorazione', 'Presa in carico: dal telefono IN LAVORAZIONE deve esitarlo PRONTO oppure ordinare il ricambio', 3, 5),
  ('riparazione', 'Riparazione: dal ricambio ARRIVATO deve portare il telefono in PRONTO', 4, 5)
on conflict (fase) do nothing;

-- 3) episodi malus del laboratorio (mai cancellati: il sanato chiude, non azzera)
create table if not exists public.usati_malus (
  id uuid primary key default gen_random_uuid(),
  usato_id bigint not null references public.usati(id) on delete cascade,
  imei text not null default '',
  model text not null default '',
  tecnico text not null default '',
  fase text not null,                -- 'lavorazione' | 'riparazione'
  data_inizio date not null,         -- primo giorno OLTRE la soglia
  data_fine date,                    -- null = sta ancora maturando
  giorni int not null default 1,
  malus_giorno numeric not null default 5,
  importo numeric not null default 0,
  stato text not null default 'in_corso',   -- in_corso | attivo | compensato
  compensato_il date,
  compensato_da text,
  compensato_note text,
  created_at timestamptz not null default now(),
  unique (usato_id, fase, data_inizio)
);
create index if not exists idx_usati_malus_stato on public.usati_malus(stato);
create index if not exists idx_usati_malus_usato on public.usati_malus(usato_id);
alter table public.usati_malus enable row level security;
drop policy if exists "Allow anon usati_malus" on public.usati_malus;
create policy "Allow anon usati_malus" on public.usati_malus for all using (true) with check (true);

notify pgrst, 'reload schema';
