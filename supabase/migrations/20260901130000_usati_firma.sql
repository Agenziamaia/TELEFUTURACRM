-- ═══ COME È STATA FIRMATA LA DICHIARAZIONE ═══════════════════════════════
-- Fino a ieri della dichiarazione di vendita restava solo il PDF caricato a
-- mano: nessuno sapeva se quella firma fosse stata raccolta al banco o in
-- digitale, né quando. Con DocuSeal la firma porta con sé una prova — data,
-- ora, canale del codice, identificativo della richiesta — e quella prova
-- vale quanto il documento: senza, in una contestazione, il PDF è solo
-- un'immagine.
alter table public.usati add column if not exists firma jsonb;

comment on column public.usati.firma is
  'come è stata raccolta la firma della dichiarazione: {via: otp|cartacea, canale, submissionId, firmata_il, registro}';
