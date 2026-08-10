-- CONTESTI VF/FW (mappa di Luca 10/08, "dropzone (1).pdf"): Vodafone e
-- Fastweb hanno DUE lettere di gara ciascuno (T1 = Telefutura / Vodafone
-- Store, T2 = Telefutura 2 / multibrand VND) e le attivazioni si allocano
-- col CODICE DI INSERIMENTO. La tabella pay di un CONTESTO può quindi
-- contenere righe per vendite di brand diversi (es. la lettera A dei
-- Vodafone Store paga anche le attivazioni Fastweb fatte coi codici VS).
-- brand_vendita distingue: NULL = qualsiasi brand; valorizzato = la riga
-- vale solo per le vendite di quel brand. I cataloghi VF e FW condividono
-- nomi (Casa Start/Pro/Ultra) → le righe esistenti vengono backfillate col
-- brand del proprio tabellare, così un pezzo Fastweb non aggancia mai una
-- riga Vodafone.
ALTER TABLE public.pay_righe ADD COLUMN IF NOT EXISTS brand_vendita TEXT;
UPDATE public.pay_righe SET brand_vendita = brand WHERE brand_vendita IS NULL;
