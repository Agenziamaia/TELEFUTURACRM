-- ═══ PAYSTORE — LE RICARICHE TELEFONICHE ═══════════════════════════════════
-- Luca 01/09: «creiamo il brand PayStore in catalogo, associandolo al reparto 1
-- della cassa per emettere scontrini esente IVA. Ora aggiungiamo solo il brand
-- per fare gli scontrini come ricariche; da domani aggiungiamo anche l'API —
-- e con l'API collegata, una volta che il cliente ha pagato, dobbiamo usarla
-- per far partire davvero la ricarica.»
--
-- ⚠️ IL FISCALE È IL PUNTO. Una ricarica telefonica non è una vendita di
-- merce: è un'operazione ESENTE ex art. 74 DPR 633/72, quindi va sul
-- REPARTO 1 del registratore («Non soggetta», natura N2) — lo stesso dove il
-- 29/08 sono finite le SIM. Il reparto la riga se lo porta da `marg_items`,
-- che è la fonte autoritativa per l'API dello scontrino: per questo le voci
-- delle ricariche stanno lì e non in una tabella a parte.
--
-- ⚠️ E IL PASSO DI DOMANI STA GIÀ SCRITTO OGGI. `paystore_ricariche` nasce
-- adesso, quando la ricarica la si fa ancora a mano sul terminale del
-- fornitore: registra numero, operatore, taglio e soprattutto lo STATO. Senza
-- questa riga, domani l'API non avrebbe dove attaccarsi e le ricariche di
-- oggi resterebbero fuori da ogni riconciliazione. Oggi lo stato nasce
-- 'manuale'; da domani nascerà 'da_inviare' e sarà il fornitore a chiuderlo.

-- ── 1. IL BRAND ────────────────────────────────────────────────────────────
insert into public.catalog_brands (id, nome, colore1, colore2, ordine, attivo, default_abilitato, contratto_richiesto)
values ('paystore', 'PayStore', '#f8b516', '#d99a05', 13, true, true, 'assente')
on conflict (id) do update set
    nome = excluded.nome, colore1 = excluded.colore1, colore2 = excluded.colore2,
    contratto_richiesto = 'assente';

-- ── 2. LA CATEGORIA DI CATALOGO ────────────────────────────────────────────
-- 'servizi' e non 'prodotti': una ricarica non ha magazzino, non ha un pezzo
-- da scaricare e non ha un seriale.
insert into public.marg_categories (name, kind, sort_order, active, icon)
select 'Ricariche', 'servizi', 90, true, '📲'
where not exists (select 1 from public.marg_categories where name = 'Ricariche');

-- ── 3. UNA VOCE PER OPERATORE ──────────────────────────────────────────────
-- ⚠️ UNA PER OPERATORE, NON UNA PER TAGLIO. I tagli sono un centinaio e
-- cambiano quando vuole il fornitore: metterli a catalogo vorrebbe dire
-- rifare il catalogo a ogni listino. Quello che deve stare fermo è il dato
-- FISCALE — reparto 1, esente — e quello è uguale per tutti i tagli dello
-- stesso operatore. L'importo lo porta la riga (`prezzo_modificabile`), il
-- taglio finisce nella descrizione dello scontrino.
--
-- ⚠️ `mostra_in_cassa = false`: la voce NON è un pulsante di Prodotti &
-- Marginalità. Se lo fosse, si potrebbe vendere una ricarica senza dire quale
-- numero ricaricare — e domani, con l'API accesa, sarebbe una riga incassata
-- che nessuno può eseguire. Si vende dal pannello PayStore, dove il numero è
-- obbligatorio.
insert into public.marg_items
    (category_id, name, brand, vat_rate, cost_mode, margin_percent, default_price,
     prezzo_modificabile, mostra_in_cassa, va_in_scontrino, reparto, auto_link, active, sort_order, icon)
select c.id, v.nome, 'PayStore', 0, 'percent_margine', 0, null,
       true, false, true, 1, false, true, v.ord, '📲'
from public.marg_categories c,
     (values
        ('Ricarica TIM', 1), ('Ricarica Vodafone', 2), ('Ricarica WindTre', 3),
        ('Ricarica Iliad', 4), ('Ricarica Fastweb Mobile', 5), ('Ricarica ho. Mobile', 6),
        ('Ricarica Very Mobile', 7), ('Ricarica Kena Mobile', 8), ('Ricarica PosteMobile', 9),
        ('Ricarica CoopVoce', 10), ('Ricarica Lycamobile', 11), ('Ricarica Spusu', 12),
        ('Ricarica Tiscali Mobile', 13), ('Ricarica 1Mobile', 14), ('Ricarica Digi Mobil', 15),
        ('Ricarica Optima Mobile', 16), ('Ricarica WithU Mobile', 17), ('Ricarica Daily Telecom', 18)
     ) as v(nome, ord)
where c.name = 'Ricariche'
  and not exists (select 1 from public.marg_items m where m.name = v.nome);

-- ── 4. IL LISTINO DEI TAGLI ────────────────────────────────────────────────
-- Provvisorio per costruzione: oggi lo riempiamo a mano con i tagli che il
-- fornitore espone, domani l'API lo riscrive da sola. Sta in tabella e non nel
-- codice proprio per questo — e perché un taglio che cambia non deve
-- richiedere un rilascio.
create table if not exists public.paystore_tagli (
    id           uuid primary key default gen_random_uuid(),
    operatore    text not null,               -- 'tim', 'vodafone', … (chiave interna)
    etichetta    text not null,               -- come la chiama il fornitore: «TIM 20+»
    valore       numeric(10,2) not null check (valore > 0),
    ordine       int not null default 0,
    attivo       boolean not null default true,
    -- da dove viene questa riga: 'manuale' finché non c'è l'API
    origine      text not null default 'manuale',
    aggiornato_il timestamptz not null default now(),
    unique (operatore, etichetta)
);
comment on table public.paystore_tagli is
  'Tagli di ricarica per operatore. Oggi a mano; con l''API PayStore li riscrive il fornitore (origine=api).';

-- ── 5. IL REGISTRO DELLE RICARICHE ─────────────────────────────────────────
-- Una riga per ricarica venduta. È il gancio dell'API di domani: lo stato dice
-- se il credito è partito davvero, e senza questa riga una ricarica incassata
-- e non erogata sarebbe invisibile.
create table if not exists public.paystore_ricariche (
    id            uuid primary key default gen_random_uuid(),
    creata_il     timestamptz not null default now(),
    negozio       text,
    venditore     text,
    user_id       uuid,
    operatore     text not null,
    operatore_nome text,
    numero        text not null,
    taglio        text,
    importo       numeric(10,2) not null check (importo > 0),
    /* ⚠️ LO STATO È IL CUORE.
       manuale    = venduta e incassata dal CRM, ricarica fatta a mano sul
                    terminale del fornitore (è il mondo di oggi)
       da_inviare = incassata, l'API non l'ha ancora eseguita
       inviata    = il fornitore ha accettato
       fallita    = il fornitore ha rifiutato: qui i soldi sono già incassati,
                    quindi qualcuno DEVE vederla
       annullata  = storno */
    stato         text not null default 'manuale'
                  check (stato in ('manuale','da_inviare','inviata','fallita','annullata')),
    -- il riferimento del fornitore, quando ci sarà
    rif_fornitore text,
    errore        text,
    inviata_il    timestamptz,
    -- a quale vendita appartiene (riga EXT- in contracts, o lo scontrino)
    contract_id   uuid,
    scontrino_id  text,
    azienda       text
);
create index if not exists paystore_ricariche_giorno on public.paystore_ricariche (creata_il desc);
create index if not exists paystore_ricariche_stato  on public.paystore_ricariche (stato) where stato in ('da_inviare','fallita');
create index if not exists paystore_ricariche_numero on public.paystore_ricariche (numero);
comment on table public.paystore_ricariche is
  'Ogni ricarica venduta. `stato` distingue quelle fatte a mano da quelle che l''API dovrà eseguire: una incassata e non erogata deve poter essere trovata.';

-- ── 6. IL LOCKDOWN ─────────────────────────────────────────────────────────
-- Stesse regole del resto del CRM: dal browser non si scrive niente, si passa
-- dal server. Qui dentro ci sono numeri di telefono dei clienti.
alter table public.paystore_tagli     enable row level security;
alter table public.paystore_ricariche enable row level security;

drop policy if exists paystore_tagli_lettura on public.paystore_tagli;
create policy paystore_tagli_lettura on public.paystore_tagli
    for select to authenticated using (true);

-- le ricariche NON si leggono dal browser: il pannello di controllo passerà
-- da una rotta server, come per i consumi dell'AI
revoke all on public.paystore_ricariche from anon, authenticated;
grant select on public.paystore_tagli to anon, authenticated;

-- ── 7. I TAGLI CHE CONOSCIAMO ──────────────────────────────────────────────
-- I cinque operatori censiti nella demo. Gli altri tredici restano a importo
-- libero finché non arriva il listino vero: meglio un campo aperto che tagli
-- inventati, perché un taglio che il fornitore non ha è una ricarica che non
-- parte.
insert into public.paystore_tagli (operatore, etichetta, valore, ordine) values
    ('tim','TIM 4 euro',4,1),('tim','TIM 5+',5,2),('tim','TIM 6 euro',6,3),
    ('tim','TIM 10+',10,4),('tim','TIM 12 euro',12,5),('tim','TIM 15+',15,6),
    ('tim','TIM 17 euro',17,7),('tim','TIM 20+',20,8),('tim','TIM 22 euro',22,9),
    ('tim','TIM 25 euro',25,10),('tim','TIM 30+',30,11),('tim','TIM 50 euro',50,12),
    ('vodafone','VODAFONE 5 euro',5,1),('vodafone','VODAFONE 8 euro',8,2),
    ('vodafone','VODAFONE 10 euro',10,3),('vodafone','VODAFONE 20 euro',20,4),
    ('vodafone','VODAFONE 30 euro',30,5),('vodafone','VODAFONE 50 euro',50,6),
    ('vodafone','VODAFONE 60 euro',60,7),('vodafone','VODA 100 euro',100,8),
    ('windtre','WIND3 Special 5',5,1),('windtre','WIND3 6 euro',6,2),
    ('windtre','WIND3 Special 10',10,3),('windtre','WIND3 11 euro',11,4),
    ('windtre','WIND3 15 euro',15,5),('windtre','WIND3 20 euro',20,6),
    ('windtre','WIND3 25 euro',25,7),('windtre','WIND3 50 euro',50,8),
    ('iliad','ILIAD 5 euro',5,1),('iliad','ILIAD 10 euro',10,2),('iliad','ILIAD 15 euro',15,3),
    ('iliad','ILIAD 20 euro',20,4),('iliad','ILIAD 30 euro',30,5),('iliad','ILIAD 50 euro',50,6),
    ('fastweb','FASTWEB 5 euro',5,1),('fastweb','FASTWEB 10 euro',10,2),
    ('fastweb','FASTWEB 15 euro',15,3),('fastweb','FASTWEB 25 euro',25,4),
    ('fastweb','FASTWEB 50 euro',50,5),('fastweb','FASTWEB 100 euro',100,6)
on conflict (operatore, etichetta) do nothing;
