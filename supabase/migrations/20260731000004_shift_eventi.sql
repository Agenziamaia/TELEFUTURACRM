-- Mig. 110 — Timeline badgiatura (Luca 31/07/2026): prima si salvava solo il
-- TOTALE dei minuti di pausa; i singoli passaggi (quando in pausa, quando ha
-- ripreso) andavano persi. Ora ogni azione badge lascia un evento in
-- shifts.eventi: [{t, tipo: inizio|pausa|ripresa|fine|correzione, note?}].
-- Nessun backfill: i turni vecchi mostrano entrata/uscita + pausa totale.
alter table public.shifts
  add column if not exists eventi jsonb not null default '[]'::jsonb;
