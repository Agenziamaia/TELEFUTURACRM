-- QR upload: supporto a PIU' file per sessione (Documenti puo' avere piu' foto).
-- Prima la sessione portava un solo file (file_url/file_name/file_mime); ora usa
-- un array files=[{url,name,mime}]. I vecchi campi restano per retrocompatibilita'.

alter table qr_uploads add column if not exists files jsonb not null default '[]'::jsonb;
comment on column qr_uploads.files is 'Allegati caricati dal telefono: [{url,name,mime}]. Sostituisce i campi file_* singoli.';
