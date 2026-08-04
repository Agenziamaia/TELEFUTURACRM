-- AIR-01a/e (Luca 04/08/2026) — AIRCALL: UTENZE DEI PUNTI VENDITA + CODA ANAGRAFIZZAZIONE.
-- (a) stores.aircall_user_id = l'UTENZA Aircall del negozio. Sul numero unico
--     06 5528 0153 (number_id 1196846) il number_id è IDENTICO per tutti i punti
--     vendita: il negozio che ha gestito la chiamata si riconosce SOLO
--     dall'utenza (data.user.id del webhook). Seed CONFERMATO da Luca 04/08;
--     Ufficio, Ufficio Commerciale e Agenzia restano SENZA utenza.
--     WHERE ... IS NULL = rieseguibile senza sovrascrivere modifiche successive.
-- (b) stores.aircall_number_id per i due numeri DIRETTI (Ext Collatina 1196848,
--     Ext Merulana 1196849): fallback quando l'evento non porta l'utenza.
--     Il numero unico 1196846 "Ext Telefutura" NON si assegna a nessun negozio.
-- (c) call_events: archiviato + anagrafizzato_da/il per la coda "Da
--     anagrafizzare" del Registro Chiamate (inbound senza cliente) — [Ignora]
--     alza archiviato, l'aggancio a un cliente lascia traccia di chi/quando.
-- (d) indice (negozio, started_at desc) per la vista registro per negozio.

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS aircall_user_id BIGINT;

UPDATE public.stores SET aircall_user_id = v.uid
FROM (VALUES
    ('Magliana Multi',  1860503),
    ('Magliana W3',     1860504),  -- utenza Aircall "Magliana Wind3"
    ('Donna',           1860505),  -- utenza Aircall "Donna Olimpia"
    ('Promontori',      1860506),
    ('Baleniere',       1860508),
    ('Libia',           1860509),
    ('Garbatella',      1860510),
    ('Mazzini',         1860511),
    ('Acilia VS',       1860512),  -- utenza Aircall "Acilia Vodafone"
    ('Acilia Multi',    1860514),
    ('Castani',         1860515),
    ('San Paolo',       1860517),
    ('Merulana',        1860519),
    -- Aircall ha UN'unica utenza "Collatina" per la sede doppia (Multi + W3):
    -- assegnata al Multi in attesa della conferma di Luca su quale dei due
    -- gemelli la usa (unico abbinamento NON esplicito nel mapping confermato).
    ('Collatina Multi', 1860520)
) AS v(name, uid)
WHERE public.stores.name = v.name AND public.stores.aircall_user_id IS NULL;

-- numeri DIRETTI come fallback (stessa riserva su Collatina Multi/W3)
UPDATE public.stores SET aircall_number_id = 1196848
 WHERE name = 'Collatina Multi' AND aircall_number_id IS NULL;
UPDATE public.stores SET aircall_number_id = 1196849
 WHERE name = 'Merulana' AND aircall_number_id IS NULL;

ALTER TABLE public.call_events ADD COLUMN IF NOT EXISTS archiviato BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.call_events ADD COLUMN IF NOT EXISTS anagrafizzato_da TEXT;
ALTER TABLE public.call_events ADD COLUMN IF NOT EXISTS anagrafizzato_il TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_call_events_negozio_started
    ON public.call_events (negozio, started_at DESC);

NOTIFY pgrst, 'reload schema';
