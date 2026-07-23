-- 070: tassonomia unica dei contratti.
--
-- Prima la "categoria" di un contratto era il titolo del menu del singolo brand,
-- salvato tale e quale: lo stesso servizio prendeva nomi diversi
-- ("LUCE E GAS" / "ENERGIA" / "S4 ENERGIA"; "FISSO" / "SKY FIBRA"), quindi
-- chiedere "tutta la fibra casa" non era possibile senza codice per ogni brand.
--
-- Si aggiungono due colonne derivate, uguali per tutti i brand:
--
--   categoria_macro   mobile | fisso | energia | tv | assicurazioni | digitale | extra
--   controlli         array: mnp, finanziamento, rata  (piu' d'uno per pratica)
--
-- `categoria` (nome del brand) e `prodotto` (nome commerciale) restano: servono
-- a mostrare la dicitura giusta all'operatore. La regola di derivazione vive in
-- src/lib/tassonomia.ts ed e' quella applicata anche qui nel backfill.

alter table public.contracts add column if not exists categoria_macro text;
alter table public.contracts add column if not exists controlli text[] not null default '{}';

create index if not exists idx_contracts_categoria_macro on public.contracts (categoria_macro);
create index if not exists idx_contracts_brand_macro on public.contracts (brand, categoria_macro);
create index if not exists idx_contracts_controlli on public.contracts using gin (controlli);

comment on column public.contracts.categoria_macro is
  'Categoria di servizio condivisa da tutti i brand: mobile, fisso, energia, tv, assicurazioni, digitale, extra. Derivata da brand+categoria+prodotto secondo src/lib/tassonomia.ts.';
comment on column public.contracts.controlli is
  'Verifiche richieste dalla pratica: mnp, finanziamento, rata. Ortogonali alla categoria: una vendita mobile puo'' essere insieme portabilita'' e finanziamento.';

notify pgrst, 'reload schema';
