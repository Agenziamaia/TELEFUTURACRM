-- ═══ RIFARE UNA RICARICA DAL PANNELLO ══════════════════════════════════════
-- Luca 02/09: «alla destra dello stato un pulsante per rifare la ricarica, con
-- un pop-up di conferma. Un pulsante che di fatto la rinvia, perché magari ho
-- verificato che dal sospeso ora la ricarica va fatta: devo poter cliccare lì
-- e la ricarica si collega direttamente all'API di PayStore e la rifà».
--
-- ⚠️ LA CHIAVE DI IDEMPOTENZA SI SALVA PRIMA DI PARTIRE, e resta la stessa a
-- ogni ritentativo. È l'unica cosa che impedisce di ricaricare due volte lo
-- stesso numero quando una risposta si perde per strada: se il server va giù
-- fra la chiamata e la risposta, il tentativo successivo con la stessa chiave
-- riceve l'esito originale invece di erogare un secondo credito. PayStore lo
-- chiede esplicitamente, ed è il punto su cui mette più attenzione.
alter table public.paystore_ricariche
    add column if not exists idempotency_key uuid,
    add column if not exists tentata_il timestamptz,
    add column if not exists tentativi smallint not null default 0,
    add column if not exists ambiente text;

comment on column public.paystore_ricariche.idempotency_key is
  'La chiave mandata a PayStore. Si scrive PRIMA della chiamata e non cambia mai: un ritentativo con la stessa chiave riceve l''esito originale invece di erogare un secondo credito.';
comment on column public.paystore_ricariche.ambiente is
  'collaudo = la chiamata è andata sulla sandbox (nessun credito vero) · produzione = erogazione reale. Serve a non confondere una prova con una ricarica.';
comment on column public.paystore_ricariche.tentativi is
  'Quante volte si è provato a eseguirla. Serve a non insistere su una che rifiuta sempre.';

create index if not exists paystore_ricariche_idem
    on public.paystore_ricariche (idempotency_key) where idempotency_key is not null;
