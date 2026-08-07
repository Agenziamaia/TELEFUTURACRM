-- DECK BUILDER RIUNIONI — fase 0 (mig. 191, piano docs/PIANO_DECK_BUILDER_RIUNIONI.md)
--
-- Archivio dei deck delle riunioni mensili: ogni deck CONGELA il dataset del
-- mese (snapshot, non live — come le % gara comunicate in riunione) e i suoi
-- blocchi tipizzati (cover, kpi, tabella, testo…) renderizzati dai componenti
-- della pagina /riunioni. "🔄 Aggiorna dati" è un'azione esplicita che
-- rigenera dataset+blocchi. Il dataset nasce da GET /api/riunione/dataset
-- (stesse funzioni delle pagine: conto economico PV incluso).
create table if not exists public.riunione_deck (
  id uuid primary key default gen_random_uuid(),
  mese date not null,                 -- primo del mese della riunione
  titolo text not null,
  stato text not null default 'bozza' check (stato in ('bozza','congelato')),
  dataset jsonb not null,             -- snapshot del pacchetto riunione
  blocchi jsonb not null default '[]',-- slide = blocchi tipizzati in ordine
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.riunione_deck disable row level security;

notify pgrst, 'reload schema';
