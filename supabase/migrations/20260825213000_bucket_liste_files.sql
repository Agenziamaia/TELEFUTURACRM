-- Bucket per i file delle liste caller (Assegna Liste, step 5): il wizard
-- carica il file su liste-files e lo rilegge con createSignedUrl → il bucket
-- nasce PRIVATO (niente URL pubblici: le liste contengono dati personali dei
-- clienti; unico bucket non-public del progetto, ed è giusto così).
-- Causa: prima assegnazione in produzione (25/08) fallita con
-- "Errore upload file: Bucket not found" — il bucket non era mai stato creato.
insert into storage.buckets (id, name, public)
values ('liste-files', 'liste-files', false)
on conflict (id) do nothing;

-- policy permissive per la chiave anon (pattern 20260805020000_avatar_utenti):
-- select serve anche a createSignedUrl; niente update/delete finché nessun
-- flusso li usa (il cestino liste oggi non rimuove il file).
do $$ begin
    create policy "liste_files_select" on storage.objects
        for select using (bucket_id = 'liste-files');
exception when duplicate_object then null;
          when insufficient_privilege then null; end $$;

do $$ begin
    create policy "liste_files_insert" on storage.objects
        for insert with check (bucket_id = 'liste-files');
exception when duplicate_object then null;
          when insufficient_privilege then null; end $$;
