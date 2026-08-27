-- COPERTURE (Luca 27/08): quando un negozio ha una ferie/malattia ma la
-- squadra ha retto senza collaboratori extra, l'amministrazione lo flagga
-- «coperto così» — il widget di Sandra smette di segnarlo rosso.
-- Chiave a livello di SEDE (il primo negozio del gruppo) + giorno.
-- RLS OFF come le tabelle operative gemelle (P0 censito).
create table if not exists coperture_ok (
  store text not null,
  data text not null,
  creato_da text,
  created_at timestamptz not null default now(),
  primary key (store, data)
);
