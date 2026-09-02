-- ═══ `client_id` È TESTO, NON UUID ════════════════════════════════════════
-- Nella tabella del cestino l'avevo dichiarato `uuid`. Ma gli id dei clienti
-- di questo CRM sono TESTO — «CL-SCRFRC91R65H501C-1786031787341» — e
-- `contract_attachments.client_id` è `text`.
--
-- ⚠️ È LO STESSO IDENTICO ERRORE del primo giorno di PayStore, dove
-- `contract_id` dichiarato `uuid` faceva morire ogni inserimento su «invalid
-- input syntax for type uuid» e il registro restava vuoto mentre i negozi
-- vendevano. Lì l'avevo scoperto dai negozi aperti; qui l'ho trovato
-- guardando i tipi veri PRIMA di consegnare, e la differenza fra le due
-- volte è tutta lì: si guardano le colonne, non ci si fida di com'è
-- ragionevole che si chiamino.
--
-- Se non si correggesse, il primo documento tolto davvero non finirebbe nel
-- cestino — e la rotta si ferma prima di cancellare, quindi nessuno potrebbe
-- togliere niente: il difetto si vedrebbe subito. Ma «si vede subito» non è
-- una scusa per consegnarlo.

alter table public.contract_attachments_cestino
    alter column client_id type text using client_id::text;

comment on column public.contract_attachments_cestino.client_id is
  'L''id del cliente. È TESTO, come in `contract_attachments`: gli id sono «CL-…», non uuid.';

-- prova: il tipo è quello di contract_attachments
do $$
declare t1 text; t2 text;
begin
    select data_type into t1 from information_schema.columns
     where table_name = 'contract_attachments_cestino' and column_name = 'client_id';
    select data_type into t2 from information_schema.columns
     where table_name = 'contract_attachments' and column_name = 'client_id';
    raise notice 'client_id · cestino: % · originale: %', t1, t2;
    if t1 is distinct from t2 then
        raise exception 'i due client_id non hanno lo stesso tipo: % contro %', t1, t2;
    end if;
end $$;
