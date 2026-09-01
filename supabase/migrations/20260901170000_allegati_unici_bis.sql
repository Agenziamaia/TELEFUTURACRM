-- ═══ L'INDICE PARZIALE NON SERVIVA A NIENTE ══════════════════════════════
-- Ieri ho messo un indice unico su (client_id, file_url) CON un predicato
-- «where client_id is not null», per non contare i NULL. Inutile — in un
-- indice unico i NULL sono già distinti fra loro — e soprattutto DANNOSO:
-- Postgres non riconosce un indice parziale in una ON CONFLICT che non
-- ripete lo stesso predicato, e risponde 42P10 «no unique or exclusion
-- constraint matching» a OGNI upsert, anche quando non c'è nessun conflitto.
--
-- Risultato: i documenti delle pratiche NON arrivavano nella scheda del
-- cliente, in silenzio, esattamente come prima del rimedio. Provato sul
-- database vero prima e dopo, non dedotto.
drop index if exists contract_attachments_cliente_file_uniq;

delete from public.contract_attachments a
 using public.contract_attachments b
 where a.client_id = b.client_id and a.file_url = b.file_url and a.id > b.id;

create unique index if not exists contract_attachments_cliente_file_uniq
    on public.contract_attachments (client_id, file_url);
