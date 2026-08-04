-- Mig. — BACKFILL STORICO SENT + TRASH (EML-03, Luca 04/08/2026 pomeriggio).
-- Il backfill INBOX di amministrazione@ e' completo (backfill_done=true) ma
-- Inviati e Cestino nel CRM restano vuoti: il sync Sent e' partito col cursore
-- a fine cartella ("da ora in poi") e il Trash non veniva importato affatto.
-- Il route /api/email/backfill guadagna due fasi (Sent poi Trash) che girano
-- DOPO l'INBOX, con cursori e flag di fine DEDICATI — stessa meccanica a
-- blocchi ripristinabili per sequenza, stop a 12 mesi.
--
-- Idempotente per costruzione. NB: va applicata PRIMA del deploy del codice
-- (il route filtra sui nuovi flag); se il codice arriva prima, il route
-- ripiega da solo sul filtro storico e le fasi nuove restano ferme.

alter table public.email_accounts
    add column if not exists backfill_sent_seq   bigint,                        -- cursore Sent: seq piu' BASSA gia' lavorata (null = mai partito)
    add column if not exists backfill_sent_done  boolean not null default false, -- storico Sent completato (12 mesi o inizio cartella)
    add column if not exists backfill_trash_seq  bigint,                        -- cursore Trash: idem
    add column if not exists backfill_trash_done boolean not null default false; -- storico Trash completato

-- Le fasi nuove valgono SOLO per le caselle con backfill_enabled=true (oggi:
-- amministrazione@): i default false bastano, il cron le fa partire da soli.

notify pgrst, 'reload schema';
