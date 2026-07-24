-- Segnalazione 51: "ieri sera ho lasciato un ordine non completato, stamattina
-- non c'era piu' la bozza". Il carrello viveva solo nel localStorage del browser,
-- quindi si perdeva cambiando dispositivo/browser (o svuotando i dati del sito).
-- Ora la bozza vive anche a database, una per utente, cosi' si riprende sempre.

create table if not exists public.merchandise_order_drafts (
  user_id     uuid primary key,
  user_name   text,
  store       text,
  cart        jsonb not null default '[]'::jsonb,
  note        text,
  updated_at  timestamptz not null default now()
);

alter table public.merchandise_order_drafts enable row level security;
drop policy if exists merchandise_order_drafts_all on public.merchandise_order_drafts;
create policy merchandise_order_drafts_all on public.merchandise_order_drafts
  for all using (true) with check (true);
