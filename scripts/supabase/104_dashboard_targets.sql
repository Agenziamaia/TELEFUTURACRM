-- 104: Obiettivi Home (dashboard fase 2b). Target CONTRATTI per ambito, gestiti
-- dall'Admin (Amministrazione > Obiettivi Home) — separati dai target Gare.
-- Il widget "Obiettivo" della Home mostra la barra reale: contratti del periodo
-- vs il valore qui configurato per l'ambito dell'utente.
create table if not exists public.dashboard_targets (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null,                 -- 'rete' | 'negozio' | 'venditore'
  riferimento text,                          -- nome negozio / nome venditore (null per 'rete')
  valore      int  not null default 0,       -- obiettivo contratti nel mese
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (tipo, riferimento)
);
alter table public.dashboard_targets enable row level security;
drop policy if exists dash_targets_all on public.dashboard_targets;
create policy dash_targets_all on public.dashboard_targets for all using (true) with check (true);

notify pgrst, 'reload schema';
