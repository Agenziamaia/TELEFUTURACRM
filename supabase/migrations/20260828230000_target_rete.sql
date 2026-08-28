-- TARGET DI RETE (Luca 28/08): «dentro gare, nella sezione target, esistono
-- personale, categoria risorse, negozio, categoria negozio e paletti: ti devi
-- creare un'altra sezione dedicata proprio alla RETE, dove io andrò a
-- impostare quelli che sono i target che poi si vedranno nella Rete».
--
-- PERCHÉ UNA TABELLA SUA E NON `targets`. In `targets` il soggetto è una
-- persona/un negozio e la metrica è una riga di `target_metrics` scritta a
-- mano: per portare quel numero dentro Analisi → Rete servirebbe una mappa
-- metrica → brand+pista da tenere allineata a mano, e alla prima rinomina si
-- romperebbe in silenzio. Qui la chiave È il fatto: brand + pista + mese, le
-- stesse chiavi con cui il motore delle gare legge i tabellari. Nessuna mappa
-- da mantenere, nessun disallineamento possibile.
--
-- Il target di rete è MENSILE come le soglie, non per gara: la gara è il
-- contenitore dei premi ai ragazzi, questo è l'obiettivo dell'azienda sul mese.
create table if not exists target_rete (
  id uuid primary key default gen_random_uuid(),
  brand text not null,                   -- w3 | vf | sky | fw | s4 (id di GARA/altri)
  pista text not null,                   -- chiave pista del tabellare, oppure t2 | luce | gas
  month date not null,                   -- primo del mese
  target numeric not null default 0,     -- punti, o pezzi per le piste che non hanno punti
  unita text not null default 'punti',   -- punti | pezzi
  note text,
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (brand, pista, month)
);

-- Supabase accende la RLS da sola sulle tabelle nuove e il CRM lavora ad anon
-- key (il riordino RLS è il cantiere P0 già censito): senza questo il pannello
-- non scrive e l'Analisi non legge. Nessun dato sensibile: obiettivi di
-- produzione, gli stessi che stanno già in direzione_targets.
alter table target_rete disable row level security;

create index if not exists idx_target_rete_mese on target_rete (month, brand);
