-- IL FILE DELL'OPERATORE SI TIENE (Luca 31/08: «nello storico tienimi anche
-- traccia del file Excel qualora io volessi riscaricarlo»).
--
-- Finora della fotografia restava il NOME del file, non il file: se qualcuno
-- avesse voluto ricontrollare una riga, o rimandarla all'operatore, avrebbe
-- dovuto ritrovarla nella posta. Adesso il foglio viene depositato e dallo
-- storico si riscarica.
--
-- Deposito CHIUSO come quello delle liste caller: dentro ci sono i numeri di
-- gara di tutti i punti vendita. Si legge solo con un lasciapassare valido
-- (tf_uid), e si scarica con un link firmato che scade.

insert into storage.buckets (id, name, public)
values ('avanzamenti-files', 'avanzamenti-files', false)
on conflict (id) do nothing;

drop policy if exists "tf_avanzamenti-files_read" on storage.objects;
drop policy if exists "tf_avanzamenti-files_write" on storage.objects;
drop policy if exists "tf_avanzamenti-files_update" on storage.objects;
drop policy if exists "tf_avanzamenti-files_del" on storage.objects;

create policy "tf_avanzamenti-files_read" on storage.objects for select
  using (bucket_id = 'avanzamenti-files' and public.tf_uid() is not null);
create policy "tf_avanzamenti-files_write" on storage.objects for insert
  with check (bucket_id = 'avanzamenti-files' and public.tf_uid() is not null);
create policy "tf_avanzamenti-files_update" on storage.objects for update
  using (bucket_id = 'avanzamenti-files' and public.tf_uid() is not null);
create policy "tf_avanzamenti-files_del" on storage.objects for delete
  using (bucket_id = 'avanzamenti-files' and public.tf_uid() is not null);

alter table avanzamenti_ufficiali add column if not exists file_path text;
comment on column avanzamenti_ufficiali.file_path is
  'Percorso nel deposito avanzamenti-files: il foglio originale, per riscaricarlo dallo storico.';
