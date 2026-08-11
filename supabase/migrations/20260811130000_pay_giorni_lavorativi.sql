-- PROSPECT del Calcolatore (task Luca 11/08): la soglia si preseleziona sulla
-- PROIEZIONE a fine mese, calcolata sui GIORNI LAVORATIVI (lun-sab meno i
-- giorni_festivi). Questa tabellina tiene l'eventuale OVERRIDE del conteggio
-- per mese (impostazione generale per tutti i negozi, editabile dal
-- Calcolatore); senza riga vale il calcolo automatico dal calendario.
CREATE TABLE IF NOT EXISTS public.pay_giorni_lavorativi (
  month DATE PRIMARY KEY CHECK (month = date_trunc('month', month)::date),
  giorni INT NOT NULL CHECK (giorni BETWEEN 1 AND 31)
);
