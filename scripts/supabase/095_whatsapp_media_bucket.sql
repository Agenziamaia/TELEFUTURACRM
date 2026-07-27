-- Bucket per gli allegati WhatsApp (immagini/documenti/audio/video). Pubblico
-- come chat-attachments: Evolution (sul VPS) deve poter scaricare l'URL per
-- inviare, e la Uo lo mostra direttamente. Stesse policy di chat-attachments.

insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', true)
on conflict (id) do nothing;

do $$
begin
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='wa_media_insert') then
        create policy wa_media_insert on storage.objects for insert to public with check (bucket_id = 'whatsapp-media');
    end if;
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='wa_media_select') then
        create policy wa_media_select on storage.objects for select to public using (bucket_id = 'whatsapp-media');
    end if;
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='wa_media_update') then
        create policy wa_media_update on storage.objects for update to public with check (bucket_id = 'whatsapp-media');
    end if;
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='wa_media_delete') then
        create policy wa_media_delete on storage.objects for delete to public using (bucket_id = 'whatsapp-media');
    end if;
end $$;
