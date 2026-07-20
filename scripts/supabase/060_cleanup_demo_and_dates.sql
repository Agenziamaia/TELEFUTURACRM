-- 060: pulizia dati demo + normalizzazione date dei contratti.
-- (gia' eseguita in produzione il 2026-07-20; qui per tracciabilita' e altri ambienti)
--
-- 1) DATI DEMO: l'86% delle righe era seed di prova (is_demo). Rimosse.
--    Attenzione: contracts.client_id -> clients.id e' ON DELETE CASCADE, quindi
--    cancellare un cliente demo si porta via i suoi contratti. Verificato prima
--    che NESSUN contratto reale puntasse a un cliente demo (0 casi).
delete from public.contracts        where is_demo;
delete from public.clients          where is_demo;
delete from public.documentation    where is_demo;
delete from public.appointments     where is_demo;
delete from public.calendar_tasks   where is_demo;
delete from public.calendar_meetings where is_demo;

-- 2) DATE: le colonne data/data_registrazione/data_attivazione sono TEXT, quindi il DB
--    ordina e filtra ALFABETICAMENTE. Convivevano due formati:
--      - "2026-06-27" (ISO)  scritto da registra-contratto
--      - "21/03/2026" (IT)   scritto da pda/invia
--    Risultato: "21/03/2026" finiva PRIMA di "2026-06-27" nell'ordinamento, quindi il
--    contratto piu' recente mostrato era sbagliato e i filtri per intervallo non
--    funzionavano. Normalizzo tutto a ISO.
update public.contracts set data = to_char(to_date(data,'DD/MM/YYYY'),'YYYY-MM-DD')
  where data ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$';
update public.contracts set data_registrazione = to_char(to_date(data_registrazione,'DD/MM/YYYY'),'YYYY-MM-DD')
  where data_registrazione ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$';
update public.contracts set data_attivazione = to_char(to_date(data_attivazione,'DD/MM/YYYY'),'YYYY-MM-DD')
  where data_attivazione ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$';

-- Il fix lato app (pda/invia scriveva in formato italiano) e' nel commit che accompagna
-- questa migration: ora scrive ISO come registra-contratto.

notify pgrst, 'reload schema';
