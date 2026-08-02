-- 134: DEBITI — ricorrenza a REGOLA + crediti (Luca 02/08)
-- La ricorrenza si definisce UNA volta: mese di inizio e mese di fine
-- FACOLTATIVO (vuoto = per sempre); il maturato si calcola a video, niente
-- piu' righe mese-per-mese. Il nuovo tipo 'ricorrenza' distingue le regole
-- dalle vecchie righe mensili 'ricorrente' (che restano valide come sono).
-- I CREDITI sono righe segno +1 (il check c'era gia'): scalano il calderone.
alter table public.user_movimenti add column if not exists ricorrenza_fine date;
alter table public.user_movimenti drop constraint if exists user_movimenti_tipo_check;
alter table public.user_movimenti add constraint user_movimenti_tipo_check
  check (tipo in ('one_shot','rata','ricorrente','ricorrenza'));
notify pgrst, 'reload schema';
