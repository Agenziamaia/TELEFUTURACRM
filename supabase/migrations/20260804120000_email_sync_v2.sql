-- Mig. — EMAIL SYNC V2 (Luca 04/08/2026, EML-01).
-- Tre pezzi: (1) cursori per il sync della cartella Sent IMAP e per il backfill
-- dello storico a blocchi ripristinabili; (2) backfill abilitato SOLO per
-- amministrazione@ (decisione Luca: 12 mesi, allegati inclusi; le altre caselle
-- niente storico); (3) il vincolo unique su email_messages.message_id passa da
-- GLOBALE a per-casella (account_id, message_id): con il sync della Sent la
-- stessa mail puo' legittimamente stare in DUE caselle (inviata da A, ricevuta
-- da B) e l'unique globale + upsert la faceva "migrare" tra gli account.
-- Idempotente per costruzione. NB: va applicata PRIMA del deploy del codice
-- (le route usano onConflict account_id,message_id e i nuovi cursori).

alter table public.email_accounts
    add column if not exists sent_last_uid     bigint  not null default 0,  -- ultimo UID importato dalla cartella Sent
    add column if not exists inbox_uidvalidity bigint,                      -- UIDVALIDITY INBOX: se cambia, last_uid non vale piu'
    add column if not exists sent_uidvalidity  bigint,                      -- UIDVALIDITY Sent: idem per sent_last_uid
    add column if not exists backfill_enabled  boolean not null default false, -- casella con backfill storico attivo
    add column if not exists backfill_seq      bigint,                      -- cursore backfill: seq piu' BASSA gia' lavorata (null = mai partito)
    add column if not exists backfill_done     boolean not null default false; -- storico completato (12 mesi o inizio casella)

-- Backfill SOLO per amministrazione@ (Luca 04/08). Per abilitare in futuro
-- un'altra casella basta: update email_accounts set backfill_enabled=true,
-- backfill_seq=null, backfill_done=false where email_address='...'.
update public.email_accounts
   set backfill_enabled = true
 where email_address = 'amministrazione@telefuturasrl.com'
   and backfill_enabled = false;

-- Vincolo unique: da message_id globale a (account_id, message_id).
do $$
declare
    c record;
begin
    -- 1) dedup DIFENSIVO per (account_id, message_id): finche' l'unique globale
    --    e' in piedi non puo' esserci nulla da togliere (verificato a DB il
    --    04/08: 1140 message_id valorizzati, zero duplicati possibili per
    --    costruzione); se il vincolo fosse gia' stato tolto a mano si tiene la
    --    riga piu' recente per coppia.
    delete from public.email_messages
     where id in (
        select id from (
            select id,
                   row_number() over (partition by account_id, message_id
                                      order by created_at desc, id desc) as rn
              from public.email_messages
             where message_id is not null) t
         where t.rn > 1);

    -- 2) drop di OGNI vincolo unique che copre il SOLO message_id (il nome
    --    storico e' email_messages_message_id_key, ma non ci si fida del nome).
    for c in
        select con.conname
          from pg_constraint con
          join pg_class rel on rel.oid = con.conrelid
          join pg_namespace ns on ns.oid = rel.relnamespace
         where ns.nspname = 'public' and rel.relname = 'email_messages'
           and con.contype = 'u'
           and con.conkey = (select array[att.attnum]
                               from pg_attribute att
                              where att.attrelid = rel.oid
                                and att.attname = 'message_id')
    loop
        execute format('alter table public.email_messages drop constraint %I', c.conname);
    end loop;
end $$;

-- 3) il nuovo unique per-casella: e' quello che fa funzionare l'upsert
--    onConflict "account_id,message_id" di poll/backfill (i message_id null,
--    es. invii falliti, non confliggono mai: piu' righe null sono ammesse).
create unique index if not exists email_messages_account_message_uidx
    on public.email_messages (account_id, message_id);

-- Col backfill i volumi per casella salgono (decine di migliaia di righe):
-- indice per la cartella "Inviati" della UI (filtra per account + direction).
create index if not exists email_msg_acc_dir_idx
    on public.email_messages (account_id, direction);

notify pgrst, 'reload schema';
