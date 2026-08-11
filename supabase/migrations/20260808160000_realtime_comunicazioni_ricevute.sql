-- CAMPANELLA COMUNICAZIONI — fix realtime (mig. 196, Luca 08/08)
--
-- Il conteggio "da leggere" in sidebar si aggiorna via una sottoscrizione
-- realtime su comunicazioni_ricevute (Sidebar.tsx), ma la tabella NON era nella
-- publication supabase_realtime → l'evento non arrivava mai e, restando sulla
-- pagina Comunicazioni, la campanella non si azzerava dopo la lettura (caso
-- direttore commerciale). Aggiungiamo la tabella alla publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comunicazioni_ricevute'
  ) then
    alter publication supabase_realtime add table public.comunicazioni_ricevute;
  end if;
end $$;
