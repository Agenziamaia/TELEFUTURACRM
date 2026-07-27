-- Segnalazione 104: sotto-cartelle dentro una sezione (brand + categoria) della
-- Documentazione, per organizzare i PDF. Le cartelle sono annidabili (parent_id).
-- Un documento senza folder_id sta nella radice della categoria.

create table if not exists doc_folders (
    id          bigint generated always as identity primary key,
    brand_id    text,
    category_id text not null,                 -- cat_key (come documentation.category_id)
    parent_id   bigint references doc_folders(id) on delete cascade,
    name        text not null,
    sort        int not null default 0,
    archived    boolean not null default false,
    created_at  timestamptz not null default now()
);
create index if not exists doc_folders_bcp_idx on doc_folders(brand_id, category_id, parent_id);

alter table doc_folders enable row level security;
do $$ begin
    if not exists (select 1 from pg_policies where tablename='doc_folders' and policyname='doc_folders_all') then
        create policy doc_folders_all on doc_folders for all to public using (true) with check (true);
    end if;
end $$;

alter table documentation add column if not exists folder_id bigint references doc_folders(id) on delete set null;
