-- BLINDATURA GENERALE (Luca 28/08) — la porta si chiude per tutti.
--
-- Fotografia di com'era: 128 tabelle avevano una regola «lascia passare
-- tutti» e 27 non ne avevano affatto. Siccome la chiave pubblica del sito è
-- visibile a chiunque apra la pagina, chiunque nel mondo poteva leggere
-- rubrica clienti, contratti, chat, password aziendali, anagrafiche.
--
-- Da qui: per leggere qualunque cosa serve il LASCIAPASSARE personale che il
-- server rilascia al login (vedi src/lib/jwtTf.ts). Le funzioni del server
-- usano la chiave amministratore e non passano da qui.
--
-- UNICA ESCLUSA: qr_uploads — le pagine /m/* (upload da telefono col QR)
-- devono funzionare SENZA login, per definizione.
--
-- Applicata dal vivo il 28/08 su 154 tabelle; questo file è la memoria di
-- quella operazione e il modo di rifarla su un ambiente nuovo.
do $$
declare t record;
  chiave text := '(current_setting(''request.jwt.claims'', true)::json ->> ''tf_uid'') is not null';
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename not in ('qr_uploads', '_blindatura_prova')
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    -- via le regole «aperte a tutti», dentro quella che pretende il lasciapassare
    declare p record; begin
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t.tablename loop
        execute format('drop policy if exists %I on public.%I', p.policyname, t.tablename);
      end loop;
    end;
    execute format('create policy tf_blindata on public.%I for all using (%s) with check (%s)',
                   t.tablename, chiave, chiave);
  end loop;
end $$;
