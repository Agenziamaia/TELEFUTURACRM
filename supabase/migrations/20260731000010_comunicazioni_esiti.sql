-- Mig. 116 — Comunicazioni con ESITI cliccabili (Luca 31/07/2026): chi crea
-- la comunicazione puo' definire una lista di risposte (es. "Parteciperò",
-- "Non parteciperò"); il destinatario ne clicca una e la scelta finisce nella
-- ricevuta, visibile nel dettaglio (chi ha cliccato cosa). Senza esiti resta
-- la semplice conferma di lettura.
alter table public.comunicazioni
  add column if not exists esiti text[];
alter table public.comunicazioni_ricevute
  add column if not exists esito text;
