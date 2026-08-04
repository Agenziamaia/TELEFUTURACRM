-- 158: RPC BRAND CATALOGO (Luca 04/08, USA-01). Il PostgREST di Supabase
-- taglia OGNI risposta a max-rows=1000, qualunque .limit() chieda il client:
-- la select dei brand su dispositivi_catalogo (38.790 righe smartphone,
-- 3.761 brand distinti) tornava solo le prime ~1000 righe in ordine d'indice
-- e la tendina Brand degli usati "si fermava ad Azza". La RPC aggrega i
-- brand distinti in UNA sola riga jsonb (il tetto max-rows non si applica)
-- sfruttando l'indice idx_dispositivi_cat_brand esistente (mig. 133).
-- Nessuna modifica a tabelle o dati: funzione additiva, in sola lettura.

CREATE OR REPLACE FUNCTION public.brands_dispositivi(cat text)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(brand ORDER BY brand), '[]'::jsonb)
    FROM (
      SELECT brand
        FROM public.dispositivi_catalogo
       WHERE categoria = cat AND attivo
       GROUP BY brand
    ) b;
$$;

GRANT EXECUTE ON FUNCTION public.brands_dispositivi(text) TO anon;

NOTIFY pgrst, 'reload schema';
