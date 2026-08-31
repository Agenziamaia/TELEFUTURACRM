-- REGISTRARE BENE I CONSUMI DELL'AI (Luca 31/08).
--
-- «Devo vedere chi la sta utilizzando, in che modalità, in quale sezione, i
--  token, quanto stiamo spendendo diviso per categorie — email spende questo,
--  WhatsApp questo, l'assistente questo — e poterlo filtrare per utenza.»
--
-- ⚠️ QUESTO PEZZO VIENE PRIMA DEL PANNELLO, e non è una scelta di comodo: la
-- tabella dei consumi esiste da luglio, ma NON HA la colonna che dice da dove
-- viene la spesa. Il triage delle chat e quello della posta scrivono tutti e
-- due `user_id: null` e sono indistinguibili — «quanto spende l'email» oggi è
-- un dato che non esiste, per quanto lo si guardi. L'Omnichat non registra
-- affatto. Ogni giorno che passa senza queste colonne è storia che non torna:
-- un pannello costruito la settimana prossima su tre giorni di dati non fa
-- decidere, fa indovinare.
--
-- Si ALLARGA la tabella esistente invece di farne una nuova: le righe di
-- luglio e agosto, per povere che siano, raccontano già l'ordine di grandezza.

-- ── CHI, DOVE, PER COSA ───────────────────────────────────────────────────
alter table ai_usage add column if not exists sezione text not null default 'assistente';
alter table ai_usage add column if not exists funzione text;
alter table ai_usage add column if not exists automatica boolean not null default false;

comment on column ai_usage.sezione is
  'Da dove viene la spesa: assistente | triage_whatsapp | triage_email | omnichat | motore_storico. È LA COLONNA CHE MANCAVA e che rende possibile il pannello.';
comment on column ai_usage.automatica is
  'true = è girata da sola (i triage), false = qualcuno l''ha chiesta. ⭐ È la divisione più importante di tutte: sono due budget diversi e due decisioni diverse. La spesa chiesta da una persona non si taglia — è il prodotto; quella che gira da sola sì.';

/* Le righe vecchie senza utente sono triage mischiati: non si può dire di
   quale. Etichettarle 'assistente' sarebbe una bugia comoda. */
update ai_usage set sezione = 'motore_storico', automatica = true
 where user_id is null and sezione = 'assistente';

-- ── L'UTENZA: la chiave per aggregare come chiede Luca ────────────────────
alter table ai_usage add column if not exists utenza_tipo text;    -- utente | numero_wa | casella_email
alter table ai_usage add column if not exists utenza_id text;
alter table ai_usage add column if not exists utenza_label text;
comment on column ai_usage.utenza_label is
  'Il nome leggibile, DENORMALIZZATO di proposito: se domani si stacca un numero o si elimina una casella, la spesa storica deve restare leggibile. Un report che dice «(eliminata) 4.312 €» non serve a nessuno.';

alter table ai_usage add column if not exists negozio text;
alter table ai_usage add column if not exists ruolo text;

-- ── IL CONSUMO ────────────────────────────────────────────────────────────
alter table ai_usage add column if not exists chiamate int not null default 1;
comment on column ai_usage.chiamate is
  'Quante chiamate al modello stanno in questa riga. Il triage ne accorpa fino a 60 e nessuno lo sapeva: senza questa colonna, «quante volte abbiamo parlato col modello» è falso di due ordini di grandezza.';

alter table ai_usage add column if not exists token_in_cache int;
alter table ai_usage add column if not exists token_ragionamento int;
comment on column ai_usage.token_in_cache is
  'I token di domanda già visti, che il fornitore fattura una frazione. Sul triage, dove il preambolo è identico per sessanta chat di fila, ignorarli vuol dire SOVRASTIMARE il costo.';
comment on column ai_usage.token_ragionamento is
  'Il pensiero, che è già dentro completion_tokens: si tiene a parte per poter dire «paghiamo più pensiero che risposta» — spia di un prompt scritto male, non di un utente che esagera.';

-- ── IL COSTO, CONGELATO ───────────────────────────────────────────────────
alter table ai_usage add column if not exists prezzo_in_mtok  numeric(10,5);
alter table ai_usage add column if not exists prezzo_out_mtok numeric(10,5);
alter table ai_usage add column if not exists cambio_eur numeric(10,5);
alter table ai_usage add column if not exists costo_eur  numeric(12,6);
comment on column ai_usage.prezzo_in_mtok is
  'Il listino usato IN QUEL MOMENTO. Si salva anche se il costo è già calcolato: senza, il giorno che il listino cambia nessuno riesce più a verificare un conto vecchio — e un numero che non si può verificare, in azienda, diventa un numero di cui non ci si fida.';

-- ── COM'È ANDATA ──────────────────────────────────────────────────────────
alter table ai_usage add column if not exists passaggi int;
alter table ai_usage add column if not exists esito text;          -- ok | errore | troncata | senza_credito
alter table ai_usage add column if not exists codice_errore text;
comment on column ai_usage.esito is
  '⭐ «troncata» vale oro: la risposta si è interrotta per il tetto dei token, cioè abbiamo pagato e all''utente è arrivata una frase di scuse.';
comment on column ai_usage.codice_errore is
  '⚠️ CODICE, NON MESSAGGIO. Prima si salvava String(e.message) troncato a 500: e il messaggio del fornitore contiene 300 caratteri del corpo della richiesta, cioè della DOMANDA dell''utente. Un pezzo di domanda finiva in una tabella leggibile da chiunque.';

update ai_usage set esito = case when ok then 'ok' else 'errore' end where esito is null;

-- ── PER CONTARE SENZA GUARDARE ────────────────────────────────────────────
alter table ai_usage add column if not exists conversazione_hash text;
comment on column ai_usage.conversazione_hash is
  '⭐ NON l''id della conversazione: un''impronta. Permette di contare «quante conversazioni distinte» e «quante domande per conversazione», e NON permette a nessuno — nemmeno con la chiave amministratore — di risalire alla chat e aprirla. Costa una riga e toglie per sempre la tentazione.';

-- ── GLI INDICI, perché il pannello interroga sempre per periodo ───────────
create index if not exists ai_usage_quando_idx   on ai_usage (created_at desc);
create index if not exists ai_usage_sezione_idx  on ai_usage (sezione, created_at desc);
create index if not exists ai_usage_utenza_idx   on ai_usage (utenza_tipo, utenza_id, created_at desc);

-- ── E SI CHIUDE LA PORTA, che era spalancata ──────────────────────────────
/* La policy era `for all using (true) with check (true)`: con la chiave
   pubblica del browser chiunque leggeva i consumi di tutti — e presto ci sarà
   scritto quanto spende ogni persona. Ci scrive e ci legge solo il server. */
alter table ai_usage enable row level security;
/* ⚠️ SI TOLGONO TUTTE, non se ne aggiunge una che nega. In Postgres le regole
   di questo tipo si sommano in OR: una che dice «no» accanto a una che dice
   «sì» non chiude niente. Qui accanto alla vecchia `ai_usage_all` c'era anche
   `tf_blindata` con «basta essere collegati» — e con quella viva il divieto
   sarebbe stato decorativo. Misurato aggiungendo il divieto e ritrovandosi
   due regole in tabella. */
do $$ declare r record; begin
  for r in select policyname from pg_policies where tablename = 'ai_usage'
  loop execute format('drop policy if exists %I on ai_usage', r.policyname); end loop;
end $$;
create policy ai_usage_nessuno on ai_usage for all to public using (false) with check (false);

comment on table ai_usage is
  'Il registro dei consumi dell''AI. ⚠️ SI MISURA IL GESTO, MAI IL CONTENUTO: chi ha chiesto, quando, quanto spesso, da quale sezione, quanto è costato. Mai il testo della domanda, della risposta, del titolo o degli appunti — e mai «l''argomento», che per produrlo bisogna leggere. L''assistente vale quello che vale perché la gente ci mette dentro le cose vere, e le mette solo se è sicura che nessuno le legge.';
