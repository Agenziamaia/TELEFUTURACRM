-- % SCOSTAMENTO SOGLIE azienda→ragazzi (risposta Luca 13/08, Vodafone):
-- sul lato RAGAZZI ogni pista può dichiarare soglie_pct — le sue soglie si
-- DERIVANO da quelle azienda × pct/100 (arrotondate) a lettura, così quando
-- arriva la lettera nuova basta aggiornare le soglie azienda e i ragazzi
-- si aggiornano da soli. Vuoto = soglie manuali come prima (le righe manuali
-- restano a DB come ripiego se l'azienda manca).
-- Scostamenti VF misurati sui numeri di Luca (riproducono TUTTE le 34 soglie
-- al pezzo): mobile 135 · fisso 170 · business mobile/fisso 120 · luce 120 ·
-- gas 100 · soluzioni digitali 100 (appaiata a "vas" azienda per posizione).
alter table public.pay_piste add column if not exists soglie_pct numeric;
comment on column public.pay_piste.soglie_pct is
  'Solo lato ragazzi: % di scostamento dalle soglie azienda (es. 135 = azienda ×1,35, arrotondato). NULL = soglie manuali.';
notify pgrst, 'reload schema';
