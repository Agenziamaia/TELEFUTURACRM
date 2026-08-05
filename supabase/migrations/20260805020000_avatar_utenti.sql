-- FOTO PROFILO UTENTI (Luca 05/08): dal profilo l'iconcina a sinistra del nome
-- diventa cliccabile e ognuno carica la propria foto. Il file vive nel bucket
-- PUBBLICO "avatars" (path <user_id>.jpg, upsert) e la public URL si salva in
-- app_users.avatar_url (con ?v=timestamp per bustare la cache).
-- IDEMPOTENTE: si puo' rieseguire senza danni.

-- (a) colonna sull'anagrafica utenti
alter table public.app_users add column if not exists avatar_url text;

-- (b) bucket storage PUBBLICO per le foto profilo
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- (c) policy permissive sul bucket: servono SOLO se la RLS su storage.objects
--     e' attiva (il CRM usa la chiave anon). Ogni blocco ingoia sia il
--     duplicato (rilancio) sia la mancanza di ownership sul catalogo storage
--     (in quel caso le policy si creano a mano dal dashboard, come per gli
--     altri bucket gia' esistenti: contracts, email-attachments, ...).
do $$ begin
    create policy "avatars_select" on storage.objects
        for select using (bucket_id = 'avatars');
exception when duplicate_object then null;
          when insufficient_privilege then null; end $$;

do $$ begin
    create policy "avatars_insert" on storage.objects
        for insert with check (bucket_id = 'avatars');
exception when duplicate_object then null;
          when insufficient_privilege then null; end $$;

do $$ begin
    create policy "avatars_update" on storage.objects
        for update using (bucket_id = 'avatars') with check (bucket_id = 'avatars');
exception when duplicate_object then null;
          when insufficient_privilege then null; end $$;

do $$ begin
    create policy "avatars_delete" on storage.objects
        for delete using (bucket_id = 'avatars');
exception when duplicate_object then null;
          when insufficient_privilege then null; end $$;
