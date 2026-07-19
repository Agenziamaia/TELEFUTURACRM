-- 054: gli allegati chat accettavano solo pdf/jpeg/png/webp/gif -> l'upload di HEIC
-- (foto iPhone), documenti, ecc. falliva con 415. Rimuovo il vincolo di mime (qualsiasi
-- file) e alzo il limite a 50MB.
update storage.buckets
   set allowed_mime_types = null,
       file_size_limit = 52428800
 where id = 'chat-attachments';
