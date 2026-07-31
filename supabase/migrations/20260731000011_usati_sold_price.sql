-- Mig. 117 — Prezzo EFFETTIVO di vendita dell'usato (Luca 31/07/2026, sera):
-- sale_price resta il listino in vetrina; sold_price e' il prezzo al quale il
-- telefono e' stato DAVVERO venduto (chiesto all'esito Venduto e archiviato).
-- Backfill: per i gia' venduti si assume il listino (miglior dato disponibile).
alter table public.usati
  add column if not exists sold_price numeric(12,2);

update public.usati
set sold_price = sale_price
where status = 'venduto' and sold_price is null and sale_price > 0;
