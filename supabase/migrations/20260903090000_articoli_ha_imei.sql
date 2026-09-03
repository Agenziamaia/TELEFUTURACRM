-- ═══════════════════════════════════════════════════════════════════════════
-- L'ARTICOLO DICE SE VUOLE L'IMEI — 03/09/2026
--
-- Serve al nuovo carico merce: «qualora l'articolo preveda un campo IMEI, a
-- quel punto deve essere richiesto anche l'IMEI» (Luca).
--
-- PERCHÉ UN CAMPO E NON UNA DEDUZIONE. Oggi l'anagrafica non lo dice da
-- nessuna parte, e dedurlo dalla categoria non regge: sugli SMARTPHONE il
-- segnale è netto (167 articoli su 168 hanno pezzi con seriale), ma **1.440
-- articoli non hanno sottogruppo** e lì la deduzione sbaglia — 165 di quelli
-- i seriali ce li hanno, 1.281 no. Su un articolo nuovo, poi, di storia non
-- ce n'è affatto.
--
-- COME NASCE IL VALORE. Acceso su ogni articolo che nella storia ha almeno un
-- pezzo con seriale: è il fatto più solido che abbiamo. Da lì in poi si
-- corregge a mano dalla scheda dell'articolo, e i nuovi lo dichiarano quando
-- vengono creati.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.mag_articoli add column if not exists ha_imei boolean not null default false;

comment on column public.mag_articoli.ha_imei is
  'true = ogni pezzo di questo articolo ha un suo seriale (IMEI/ICCID) e si carica uno per uno in mag_unita; false = si carica a quantità in mag_giacenze.';

-- si accende dove la storia lo dimostra
update public.mag_articoli a set ha_imei = true
 where exists (select 1 from public.mag_unita u where u.codice = a.codice);

create index if not exists mag_articoli_ha_imei on public.mag_articoli (ha_imei) where ha_imei;
