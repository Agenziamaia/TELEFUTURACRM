-- ARCHIVIO LETTERE DI GARA (Luca 19/08): un solo posto per le lettere mensili
-- degli operatori. I file vivono nel bucket contracts sotto lettere/<brand>/.
create table if not exists gare_lettere (
    id uuid primary key default gen_random_uuid(),
    brand text not null,
    month date not null,
    filename text not null,
    path text not null,
    note text,
    created_by text,
    created_at timestamptz not null default now()
);
create index if not exists gare_lettere_brand_month on gare_lettere (brand, month desc);
