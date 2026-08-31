-- ═══════════════════════════════════════════════════════════════════════════
-- IL VETTORE — 31/08/2026
--
-- Luca: «come società che effettua i trasporti metti questa». Il vettore non
-- è una costante da scrivere nel codice: è un fornitore, e i fornitori
-- cambiano. Sta in tabella, con lo stesso taglio di `aziende`, e il documento
-- lo legge da lì.
--
-- Il documento ne stampa UNO. Il modulo cartaceo ne prevede due perché un
-- trasporto può passare di mano — primo vettore e secondo vettore — ma qui il
-- corriere è uno solo, e una casella che nessuno riempirà mai è spazio rubato
-- all'area dove alla consegna si scrive a mano.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.vettori (
    codice          text primary key,
    ragione_sociale text not null,
    piva            text,
    codice_fiscale  text,
    sede            text,
    cap             text,
    citta           text,
    provincia       text,
    telefono        text,
    -- quello che il documento propone quando nessuno sceglie
    predefinito     boolean not null default false,
    attivo          boolean not null default true,
    aggiornato_il   timestamptz not null default now()
);

-- UNO SOLO può essere il predefinito: se no il documento sceglierebbe a caso,
-- che è lo stesso difetto del listino con due prezzi.
create unique index if not exists vettori_un_predefinito
    on public.vettori ((true)) where predefinito and attivo;

insert into public.vettori (codice, ragione_sociale, piva, codice_fiscale, sede, cap, citta, provincia, predefinito)
values ('ALEMAR', 'ALEMAR TRASPORTI S.R.L.S.', '16431571005', '16431571005',
        'Circonvallazione Clodia, 163/16', '00195', 'Roma', 'RM', true)
on conflict (codice) do update set
    ragione_sociale = excluded.ragione_sociale, piva = excluded.piva,
    codice_fiscale = excluded.codice_fiscale, sede = excluded.sede,
    cap = excluded.cap, citta = excluded.citta, provincia = excluded.provincia,
    predefinito = excluded.predefinito, aggiornato_il = now();

-- la regola di casa: si legge solo da dentro il CRM
alter table public.vettori enable row level security;
drop policy if exists tf_blindata on public.vettori;
create policy tf_blindata on public.vettori for all
  using      (((current_setting('request.jwt.claims', true))::json ->> 'tf_uid') is not null)
  with check (((current_setting('request.jwt.claims', true))::json ->> 'tf_uid') is not null);
grant select on public.vettori to anon, authenticated;
-- non si scrive dal browser: un vettore lo cambia l'amministrazione
