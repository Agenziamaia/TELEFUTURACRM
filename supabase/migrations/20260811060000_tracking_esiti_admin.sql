-- TRACKING ESITI LATO AMMINISTRAZIONE (segnalazione Luca 10/08 via Verifiche):
-- il pannello deve amministrare ANCHE gli esiti della verifica amministrativa,
-- per categoria, col flag "definitiva" = chiude completamente il cerchio della
-- pratica (esce dalla coda ⚡ Da lavorare). Colonna `lato`:
--   'negozio' (default, le righe esistenti) — esiti del punto vendita
--   'admin'                                 — esiti della verifica amministrativa
-- La chiave puo' coincidere tra i due lati (es. in_lavorazione): l'unicita'
-- diventa (categoria, chiave, lato).
ALTER TABLE public.tracking_esiti ADD COLUMN IF NOT EXISTS lato text NOT NULL DEFAULT 'negozio' CHECK (lato IN ('negozio','admin'));
ALTER TABLE public.tracking_esiti DROP CONSTRAINT IF EXISTS tracking_esiti_categoria_chiave_key;
DO $$ BEGIN
  ALTER TABLE public.tracking_esiti ADD CONSTRAINT tracking_esiti_cat_chiave_lato_key UNIQUE (categoria, chiave, lato);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

-- ── SEED lato ADMIN: fotografa STATI_ADMIN per le 10 categorie del tracking;
-- completata = esito DEFINITIVO (confermato/pagato/stornato — la lista che la
-- coda ⚡ Da lavorare escludeva hardcoded). non_conforme NON e' definitivo:
-- riapre la pratica. Idempotente.
INSERT INTO public.tracking_esiti (categoria, chiave, etichetta, colore, bg, ordine, completata, lato)
SELECT c.cat, v.chiave, v.etichetta, v.colore, v.bg, v.ordine, v.completata, 'admin'
FROM (VALUES
  ('da_verificare',  'Da Verificare',  'var(--tf-64748b)', 'var(--tf-1e293b)', 10, false),
  ('in_lavorazione', 'In Lavorazione', 'var(--tf-3b82f6)', 'var(--tf-172554)', 20, false),
  ('non_conforme',   'Non Conforme',   'var(--tf-f97316)', 'var(--tf-431407)', 30, false),
  ('confermato',     'Confermato',     'var(--tf-22c55e)', 'var(--tf-052e16)', 40, true),
  ('pagato',         'Pagato',         'var(--tf-a78bfa)', 'var(--tf-2e1065)', 50, true),
  ('stornato',       'Stornato',       'var(--tf-ef4444)', 'var(--tf-450a0a)', 60, true)
) AS v(chiave, etichetta, colore, bg, ordine, completata)
CROSS JOIN (VALUES ('mnp'),('fisso'),('finanziamento'),('piva'),('energia'),('sky'),('mobile'),('digitale'),('multi_servizi'),('pos')) AS c(cat)
ON CONFLICT (categoria, chiave, lato) DO NOTHING;

-- extra del FINANZIAMENTO (ripagato = definitivo; stornato_da_ripagare no)
INSERT INTO public.tracking_esiti (categoria, chiave, etichetta, colore, bg, ordine, completata, lato) VALUES
  ('finanziamento', 'stornato_da_ripagare', 'Stornato, Da Ripagare', 'var(--tf-fb923c)', 'var(--tf-431407)', 70, false, 'admin'),
  ('finanziamento', 'ripagato',             'Ripagato',              'var(--tf-4ade80)', 'var(--tf-052e16)', 80, true,  'admin')
ON CONFLICT (categoria, chiave, lato) DO NOTHING;

NOTIFY pgrst, 'reload schema';
