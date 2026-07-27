-- "Carica dal telefono via QR": sessioni di upload effimere.
-- Il desktop crea una sessione (token) e mostra un QR; il telefono apre la
-- pagina pubblica /m/u/<token>, carica il file nel bucket qr-uploads e registra
-- qui la riga; il desktop fa polling e tira il file dentro il form.
-- Sicurezza: token casuale + scadenza (10 min). RLS allow-all come nel resto CRM.

create table if not exists qr_uploads (
    id           uuid primary key default gen_random_uuid(),
    token        text unique not null,
    box_type     text not null,               -- documento | contratti | altro | fattura
    kind         text not null,               -- 'foto' (immagine) | 'pdf'
    status       text not null default 'attesa',  -- attesa | caricato
    file_url     text,
    file_name    text,
    file_mime    text,
    created_at   timestamptz not null default now(),
    expires_at   timestamptz not null default (now() + interval '15 minutes')
);
create index if not exists qr_uploads_token_idx on qr_uploads(token);

alter table qr_uploads enable row level security;
do $$ begin
    if not exists (select 1 from pg_policies where tablename='qr_uploads' and policyname='qr_uploads_all') then
        create policy qr_uploads_all on qr_uploads for all to public using (true) with check (true);
    end if;
end $$;

-- bucket di staging per gli upload da telefono (pubblico come chat-attachments)
insert into storage.buckets (id, name, public) values ('qr-uploads','qr-uploads',true)
on conflict (id) do nothing;
do $$ begin
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='qr_up_insert') then
        create policy qr_up_insert on storage.objects for insert to public with check (bucket_id='qr-uploads');
    end if;
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='qr_up_select') then
        create policy qr_up_select on storage.objects for select to public using (bucket_id='qr-uploads');
    end if;
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='qr_up_delete') then
        create policy qr_up_delete on storage.objects for delete to public using (bucket_id='qr-uploads');
    end if;
end $$;
