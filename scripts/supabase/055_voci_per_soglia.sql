-- 055: voci "per soglia" — la tabella remunerazione della lettera di gara.
-- Una voce con tier valorizzato è una CELLA della matrice componente × soglia
-- (es. GA base: 0,5 in 1ª / 1,0 in 2ª / 1,5 in 3ª — moltiplicatori del canone).
-- Le voci con tier NULL restano compensi on top (gettoni secchi in €).
ALTER TABLE public.gare_azienda_voci ADD COLUMN IF NOT EXISTS tier INT CHECK (tier IS NULL OR tier >= 1);

-- RPC copy-forward aggiornata: porta anche tier
CREATE OR REPLACE FUNCTION public.gare_copy_month(p_brand TEXT, p_from DATE, p_to DATE, p_livello TEXT DEFAULT 'tutto')
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE res JSONB := '{}'::jsonb;
BEGIN
  IF p_livello IN ('azienda','tutto') THEN
    IF EXISTS (SELECT 1 FROM gare_azienda_piste WHERE brand=p_brand AND month=p_to)
       OR EXISTS (SELECT 1 FROM gare_azienda_negozi WHERE brand=p_brand AND month=p_to) THEN
      res := res || '{"azienda":"saltato: mese destinazione non vuoto"}'::jsonb;
    ELSE
      INSERT INTO gare_azienda_negozi (brand, month, gara, store_name, cluster, note)
        SELECT brand, p_to, gara, store_name, cluster, note FROM gare_azienda_negozi WHERE brand=p_brand AND month=p_from;
      INSERT INTO gare_azienda_piste (brand, month, gara, codice, nome, descrizione, sort_order)
        SELECT brand, p_to, gara, codice, nome, descrizione, sort_order FROM gare_azienda_piste WHERE brand=p_brand AND month=p_from;
      INSERT INTO gare_azienda_soglie (brand, month, pista, scope, cluster, store_name, tier, soglia_valore, soglia_um,
                                       reward_tipo, reward_valore, reward_um, reward_descr, girata_ai_ragazzi, note, sort_order)
        SELECT brand, p_to, pista, scope, cluster, store_name, tier, soglia_valore, soglia_um,
               reward_tipo, reward_valore, reward_um, reward_descr, girata_ai_ragazzi, note, sort_order
        FROM gare_azienda_soglie WHERE brand=p_brand AND month=p_from;
      INSERT INTO gare_azienda_voci (brand, month, pista, nome, tipo, valore, um, condizione, scope, girata_ai_ragazzi, note, sort_order, tier)
        SELECT brand, p_to, pista, nome, tipo, valore, um, condizione, scope, girata_ai_ragazzi, note, sort_order, tier
        FROM gare_azienda_voci WHERE brand=p_brand AND month=p_from;
      INSERT INTO gare_azienda_regole (brand, month, pista, tipo, condizione, effetto, valore, um, bersaglio, scope, girata_ai_ragazzi, note, sort_order)
        SELECT brand, p_to, pista, tipo, condizione, effetto, valore, um, bersaglio, scope, girata_ai_ragazzi, note, sort_order
        FROM gare_azienda_regole WHERE brand=p_brand AND month=p_from;
      res := res || '{"azienda":"copiato"}'::jsonb;
    END IF;
  END IF;
  IF p_livello IN ('ragazzi','tutto') THEN
    IF EXISTS (SELECT 1 FROM gare_ragazzi_soglie WHERE brand=p_brand AND month=p_to)
       OR EXISTS (SELECT 1 FROM gare_ragazzi_pay WHERE brand=p_brand AND month=p_to) THEN
      res := res || '{"ragazzi":"saltato: mese destinazione non vuoto"}'::jsonb;
    ELSE
      INSERT INTO gare_ragazzi_soglie (brand, month, tier, nome, soglia_valore, soglia_um, reward_tipo, reward_valore,
                                       reward_um, reward_descr, descrizione, premio_note, metric_id, sort_order)
        SELECT brand, p_to, tier, nome, soglia_valore, soglia_um, reward_tipo, reward_valore,
               reward_um, reward_descr, descrizione, premio_note, metric_id, sort_order
        FROM gare_ragazzi_soglie WHERE brand=p_brand AND month=p_from;
      INSERT INTO gare_ragazzi_pay (brand, month, attivazione, importo, retroattivo, tier_min, metric_id, note, sort_order)
        SELECT brand, p_to, attivazione, importo, retroattivo, tier_min, metric_id, note, sort_order
        FROM gare_ragazzi_pay WHERE brand=p_brand AND month=p_from;
      res := res || '{"ragazzi":"copiato"}'::jsonb;
    END IF;
  END IF;
  RETURN res;
END $$;

NOTIFY pgrst, 'reload schema';
