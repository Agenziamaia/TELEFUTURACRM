-- ═══════════════════════════════════════════════════════════════════════════
-- I DATI CHE UN DDT ESIGE PER ESSERE VALIDO (Luca 31/08)
--
-- «Nel momento in cui andiamo a fare un trasferimento, la sezione deve
--  generarmi un DDT: deve essere un PDF ben fatto… ricordati che abbiamo due
--  società, per cui devono poter essere da una all'altra o dall'altra
--  all'altra, citando i nomi dei punti vendita. È un documento di trasporto
--  completo e valido anche ai fini fiscali.»
--
-- Un DDT (DPR 472/96) senza mittente, destinatario e luogo di consegna non è
-- un documento: è un foglio. E oggi il CRM non li ha — `stores.address` è
-- NULL su tutti i negozi, e la sede legale delle due società non è scritta
-- da nessuna parte. Le partite IVA ci sono, ma stanno appese a `pos_rt`,
-- cioè alla tabella dei registratori di cassa: un dato societario che vive
-- dentro la configurazione di una stampante.
--
-- Qui si fa il posto dove quei dati stanno. NON li invento: le vie dei
-- negozi si leggono nelle intestazioni degli export («Wind3 - Via della
-- Magliana 263»), ma senza civico, CAP e città non sono un indirizzo, e un
-- indirizzo sbagliato su un documento fiscale è peggio di un campo vuoto.
-- Il generatore del DDT dirà cosa manca invece di stampare un buco.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists aziende (
    codice          text primary key,          -- T1 · T2
    ragione_sociale text not null,
    piva            text,
    codice_fiscale  text,
    sede            text,                      -- via e civico della sede legale
    cap             text,
    citta           text,
    provincia       text,
    rea             text,
    capitale        text,
    telefono        text,
    email           text,
    logo_url        text,                      -- l'intestazione del documento
    aggiornato_il   timestamptz not null default now()
);
alter table aziende enable row level security;
drop policy if exists aziende_lettura on aziende;
create policy aziende_lettura on aziende for select using (true);
grant select on aziende to anon, authenticated;

-- quello che già sappiamo, e viene da `pos_rt`: nome e partita IVA
insert into aziende (codice, ragione_sociale, piva)
values ('T1', 'Telefutura S.R.L.',   '06457391008'),
       ('T2', 'Telefutura 2 S.R.L.', '10916221004')
on conflict (codice) do update set
    ragione_sociale = excluded.ragione_sociale,
    piva = coalesce(aziende.piva, excluded.piva);

-- ── l'indirizzo del punto vendita: è il luogo di consegna del DDT ─────────
alter table stores add column if not exists cap       text;
alter table stores add column if not exists citta     text;
alter table stores add column if not exists provincia text;
comment on column stores.address is
  'Via e civico del punto vendita. Con cap/citta/provincia forma il LUOGO DI CONSEGNA del DDT: senza, il documento non è valido.';

-- ── il DDT ha bisogno di sapere fra quali società viaggia ────────────────
alter table mag_ddt add column if not exists azienda_da text;
alter table mag_ddt add column if not exists azienda_a  text;
alter table mag_ddt add column if not exists causale    text not null default 'Trasferimento tra punti vendita';
alter table mag_ddt add column if not exists aspetto    text not null default 'A vista';
alter table mag_ddt add column if not exists colli      integer;
alter table mag_ddt add column if not exists trasporto  text not null default 'A cura del mittente';
alter table mag_ddt add column if not exists inizio_trasporto timestamptz;
comment on column mag_ddt.causale is
  'Causale del trasporto. Fra punti vendita della STESSA società: «Trasferimento tra sedi» (beni propri). Fra società DIVERSE è una cessione, e il DDT va seguito da fattura.';
