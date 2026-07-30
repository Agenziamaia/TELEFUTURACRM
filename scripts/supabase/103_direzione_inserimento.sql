-- 103: Direzione Inserimento — mappa (per NEGOZIO) su quale CODICE inserire ogni
-- brand/categoria. La configura l'Admin (Amministrazione > Direzione Inserimento);
-- il widget "bussola" della Home la mostra in SOLA LETTURA per il negozio dell'utente.
create table if not exists public.direzione_inserimento (
  id        uuid primary key default gen_random_uuid(),
  negozio   text not null,
  brand     text not null,               -- windtre, vodafone, fastweb, tim, iliad, sky, very, ho, kena, s4, dojo
  categoria text not null,               -- es. "Mobili/MNP", "Fissi", "Luce e Gas"
  codice    text,                         -- codice di inserimento (dove va inserito)
  attivo    boolean not null default true,
  ordine    int not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_dir_ins_negozio on public.direzione_inserimento(negozio);

alter table public.direzione_inserimento enable row level security;
drop policy if exists dir_ins_all on public.direzione_inserimento;
create policy dir_ins_all on public.direzione_inserimento for all using (true) with check (true);

notify pgrst, 'reload schema';
