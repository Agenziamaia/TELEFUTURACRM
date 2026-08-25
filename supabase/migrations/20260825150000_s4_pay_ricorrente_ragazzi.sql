-- Gare S4 (25/08/2026, terminal S4): due colonne su pay_righe.
-- · ricorrente: €/pezzo/mese informativo (S4: dall'8° mese dal contratto,
--   ≈ 6° di fornitura — il POD entra in fornitura dopo ~2 mesi). Il motore
--   NON lo paga: vive nella colonna dedicata del tabellare e nel Calcolatore.
-- · pay_ragazzi_tiers: override manuale in € del pay ragazzi per soglia
--   (Luca 25/08: «non solo in percentuale — se voglio definire anche un
--   fisso»). Se valorizzato VINCE su pay_mappa_soglie e perc_ragazzi.
alter table pay_righe add column if not exists ricorrente numeric;
alter table pay_righe add column if not exists pay_ragazzi_tiers numeric[];
