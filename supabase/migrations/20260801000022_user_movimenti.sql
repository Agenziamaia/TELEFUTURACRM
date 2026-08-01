-- 127: DEBITI COLLABORATORI — libro mastro per utente (Luca 01/08)
-- Blackbook dei debiti dei collaboratori verso l'azienda (telefono pagato a
-- rate, accessori da scalare dalle gare, costi ricorrenti come l'auto).
-- Modellato come LIBRO MASTRO unico per utente: la colonna origine e' pronta
-- ad accogliere anche le commissioni gare (segno +1) e i malus quando
-- arriveranno — il "calderone" per collaboratore. Un debito one-shot
-- rateizzato genera N righe tipo 'rata' legate da gruppo_id; i ricorrenti
-- si popolano mese per mese dalla sezione (scelta esplicita di Luca).

create table if not exists public.user_movimenti (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  origine text not null default 'debito' check (origine in ('debito','gara','malus','altro')),
  tipo text not null default 'one_shot' check (tipo in ('one_shot','rata','ricorrente')),
  gruppo_id uuid,
  titolo text not null,
  note text not null default '',
  importo numeric(10,2) not null,
  segno int not null default -1 check (segno in (-1, 1)),
  competenza date not null,
  rata_n int,
  rate_totali int,
  stato text not null default 'aperto' check (stato in ('aperto','saldato')),
  saldato_il timestamptz,
  saldato_da text,
  creato_da text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_user_movimenti_user on public.user_movimenti (user_id);
create index if not exists idx_user_movimenti_comp on public.user_movimenti (competenza);

-- LEZIONE mig. 119: su questo Supabase le CREATE TABLE nascono con RLS ON
alter table public.user_movimenti disable row level security;

notify pgrst, 'reload schema';
