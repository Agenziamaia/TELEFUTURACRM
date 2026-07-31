-- Mig. 121 (Luca 31/07): NUMERI MULTIPLI per cliente. Il PRINCIPALE resta
-- clients.cellulare (univoco come oggi); i numeri aggiuntivi (moglie, figlio,
-- lavoro...) vivono qui con un'etichetta libera. Dal Caller, chiamando un
-- numero diverso dal principale di un cliente esistente, si propone
-- l'associazione automatica.

create table if not exists public.client_numeri (
    id bigserial primary key,
    client_id text not null,
    numero text not null,
    etichetta text,
    created_at timestamptz default now(),
    unique (client_id, numero)
);

-- LEZIONE mig. 119/120: su questo Supabase le tabelle nuove nascono con RLS
-- attiva senza policy → per l'app risultano vuote. Si spegne subito.
alter table public.client_numeri disable row level security;
