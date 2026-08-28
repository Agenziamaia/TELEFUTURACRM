-- LAYOUT CONDIVISO (Luca 28/08): «questa pagina non deve essere modificabile —
-- ora l'ho impostata in questo modo e sono l'unico a poterla modificare in
-- termini di layout e di grafica, quindi deve rimanere così com'è».
-- L'area Rete smette di essere una griglia personale: la disposizione dei
-- widget è UNA per tutta l'azienda, la scrivono gli admin e gli altri la
-- vedono e basta. Tabella generica a chiave, così serve anche alle prossime.
create table if not exists layout_condiviso (
  chiave text primary key,
  valore jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table layout_condiviso disable row level security;
