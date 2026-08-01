-- 128: USATO — comprato per pezzi di ricambio + stato "smontato" (Luca 01/08)
-- Il flag si sceglie in fase di ACQUISTO nel wizard di Registra Usato; quando
-- il telefono arriva in laboratorio l'amministrazione (o il tecnico senior)
-- trova il bottone rosso "Smonta e usa per pezzi di ricambio". Lo stato
-- "smontato" e' terminale e resta tracciato (usati.status e' TEXT senza
-- vincolo: nessuna DDL sullo stato, serve solo la colonna del flag).
alter table public.usati add column if not exists acquisto_per_ricambi boolean not null default false;
notify pgrst, 'reload schema';
