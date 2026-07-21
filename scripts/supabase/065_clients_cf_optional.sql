-- 065: il codice fiscale / P.IVA diventa facoltativo in anagrafica clienti.
--
-- Richiesta Luca: "Se il codice fiscale non esiste deve essere comunque
-- possibile andare avanti senza compilare tutti i dati. Pero' nome, cognome e
-- cellulare sono obbligatori."
--
-- Il vincolo attuale lo impedisce: cf_piva e' NOT NULL + UNIQUE, quindi il
-- primo cliente salvato senza CF passerebbe con cf_piva = '' e TUTTI quelli
-- successivi fallirebbero con violazione di unicita'. Rendiamo la colonna
-- nullable e l'unicita' parziale: due clienti senza CF convivono, due clienti
-- con lo STESSO CF restano vietati.

alter table public.clients alter column cf_piva drop not null;

-- normalizza gli eventuali '' gia' presenti prima di creare l'indice parziale
update public.clients set cf_piva = null where cf_piva = '';

alter table public.clients drop constraint if exists uq_clients_cf_piva;
drop index if exists public.uq_clients_cf_piva;

create unique index if not exists uq_clients_cf_piva
  on public.clients (cf_piva)
  where cf_piva is not null and cf_piva <> '';

notify pgrst, 'reload schema';
