-- ═══ NIENTE DOCUMENTI DOPPI NELLA SCHEDA CLIENTE ═════════════════════════
-- Il controllo anti-doppione sugli allegati era «leggi, e se non c'è scrivi»:
-- due giri di controllo sovrapposti (il PDF si scarica, si carica, si spedisce
-- per email: può superare l'intervallo del controllo) passavano tutti e due e
-- inserivano la stessa riga due volte.
-- Con l'indice unico il doppione lo rifiuta il database, e l'upsert lo
-- assorbe senza far fallire niente.
delete from public.contract_attachments a
 using public.contract_attachments b
 where a.client_id is not null
   and a.client_id = b.client_id and a.file_url = b.file_url and a.id > b.id;

create unique index if not exists contract_attachments_cliente_file_uniq
    on public.contract_attachments (client_id, file_url)
    where client_id is not null;
