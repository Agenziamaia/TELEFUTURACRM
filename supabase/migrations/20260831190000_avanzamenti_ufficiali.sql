-- L'AVANZAMENTO UFFICIALE DELL'OPERATORE (Luca 29/08).
--
-- Il problema: i ragazzi registrano le attivazioni nel CRM, e ogni tanto
-- sbagliano codice di inserimento. Da lì in poi la produzione per codice è
-- disallineata, e chi decide dove caricare la prossima vendita decide su un
-- numero che non è quello vero. Gli operatori però ci mandano un avanzamento
-- ufficiale, di solito ogni settimana: quello è il dato certo, fino alla sua
-- data.
--
-- L'idea, con le parole di Luca: «c'è un riallineamento fino al 25 agosto, con
-- mobile su Magliana 30 punti; noi fino al 25 compreso ne avevamo contati 33 →
-- ci sono 3 punti che non esistono. Dal 26 in poi continui a contare come
-- hanno registrato i ragazzi. Così il dato è molto più preciso e l'errore
-- resta confinato a pochi giorni invece che a tutto il mese.»
--
-- Quindi qui si conserva SOLO la fotografia ufficiale: brand, mese, codice,
-- pista, valore e la data a cui è ferma. Lo scarto non si salva — si calcola
-- ogni volta contro la produzione viva, altrimenti invecchia da solo.

create table if not exists avanzamenti_ufficiali (
    id           bigserial primary key,
    brand        text not null,
    month        date not null,               -- il mese di gara
    al           date not null,               -- l'avanzamento è aggiornato A questa data (compresa)
    cod_gara     text not null,               -- il codice di inserimento dell'operatore
    pista        text not null,               -- mobile, fisso, lucegas, cb…
    punti        numeric,                     -- come li conta l'operatore
    pezzi        integer,
    file_name    text,
    caricato_da  text,
    created_at   timestamptz default now(),
    unique (brand, month, al, cod_gara, pista)
);

comment on table avanzamenti_ufficiali is
  'Fotografie di avanzamento mandate dagli operatori telefonici. Valgono come verità FINO alla data `al`; dopo quella data conta la produzione registrata nel CRM.';

create index if not exists idx_avanz_uff_mese on avanzamenti_ufficiali (brand, month, al desc);

-- si legge da tutto il CRM (serve alla Direzione Inserimento), si scrive solo
-- passando dalla pagina: la tabella non contiene dati personali
alter table avanzamenti_ufficiali enable row level security;
drop policy if exists tf_blindata on avanzamenti_ufficiali;
create policy tf_blindata on avanzamenti_ufficiali for all
  using (public.tf_uid() is not null) with check (public.tf_uid() is not null);
