-- 091: CATALOGO OPERATORI A 6 LIVELLI — LA BASE DEL DATABASE (artifatto Luca 27/07).
-- Gerarchia: Brand > Tipo Cliente > Categoria > Prodotto > Offerta > Opzioni.
-- Livelli 1-5 a selezione singola (una sola offerta per categoria per vendita);
-- le Opzioni sono a selezione MULTIPLA, tranne quelle con gruppo_singolo
-- valorizzato (es. 'reload'): tra loro se ne sceglie UNA sola per offerta.
-- Perimetro chiuso: se una combinazione non è a catalogo, non è vendibile.
--
-- Tabelle SOLO ADDITIVE: nessuna modifica a contracts né alle liste esistenti.
-- Il Registra Vendita continua a usare i flussi attuali finché non verrà
-- agganciato esplicitamente (dopo verifica del catalogo dall'admin).

CREATE TABLE IF NOT EXISTS public.catalog_categorie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  ordine INT NOT NULL DEFAULT 0,
  attivo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.catalog_brands (
  id TEXT PRIMARY KEY,                 -- slug dell'artifatto: windtre, vodafone, s4, ...
  nome TEXT NOT NULL,
  colore1 TEXT DEFAULT '',
  colore2 TEXT DEFAULT '',
  ordine INT NOT NULL DEFAULT 0,
  attivo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.catalog_prodotti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL REFERENCES public.catalog_brands(id) ON DELETE CASCADE,
  tipo_cliente TEXT NOT NULL CHECK (tipo_cliente IN ('Consumer','Business')),
  categoria_id UUID NOT NULL REFERENCES public.catalog_categorie(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordine INT NOT NULL DEFAULT 0,
  attivo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (brand_id, tipo_cliente, categoria_id, nome)
);

CREATE TABLE IF NOT EXISTS public.catalog_offerte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prodotto_id UUID NOT NULL REFERENCES public.catalog_prodotti(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordine INT NOT NULL DEFAULT 0,
  attivo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (prodotto_id, nome)
);

CREATE TABLE IF NOT EXISTS public.catalog_opzioni (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offerta_id UUID NOT NULL REFERENCES public.catalog_offerte(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT,                           -- NULL = flag; 'numero' = chiede una quantità
  gruppo_singolo TEXT,                 -- es. 'reload': nel gruppo se ne sceglie UNA sola
  ordine INT NOT NULL DEFAULT 0,
  attivo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (offerta_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_catalog_prodotti_brand ON public.catalog_prodotti(brand_id, tipo_cliente);
CREATE INDEX IF NOT EXISTS idx_catalog_offerte_prod ON public.catalog_offerte(prodotto_id);
CREATE INDEX IF NOT EXISTS idx_catalog_opzioni_off ON public.catalog_opzioni(offerta_id);

ALTER TABLE public.catalog_categorie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_prodotti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_offerte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_opzioni ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon catalog_categorie" ON public.catalog_categorie;
CREATE POLICY "Allow anon catalog_categorie" ON public.catalog_categorie FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon catalog_brands" ON public.catalog_brands;
CREATE POLICY "Allow anon catalog_brands" ON public.catalog_brands FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon catalog_prodotti" ON public.catalog_prodotti;
CREATE POLICY "Allow anon catalog_prodotti" ON public.catalog_prodotti FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon catalog_offerte" ON public.catalog_offerte;
CREATE POLICY "Allow anon catalog_offerte" ON public.catalog_offerte FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon catalog_opzioni" ON public.catalog_opzioni;
CREATE POLICY "Allow anon catalog_opzioni" ON public.catalog_opzioni FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
