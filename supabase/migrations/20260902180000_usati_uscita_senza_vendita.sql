-- ═══ IL TELEFONO USCITO SENZA VENDITA: DUE ERRORI DA CORREGGERE ═══════════
-- Revisione ostile del commit `6dbadd60`.

-- ── 1 · IL MARCHIO NON POTEVA STARE DENTRO `status_history` ───────────────
-- L'avevo scritto lì: `status_history.venduto.forzato = true`. Ma la pagina
-- degli Usati legge e riscrive quella colonna tenendo SOLO `{date, operatore}`
-- (`parseHistory` e `deviceToRow`): tutto il resto viene buttato via.
--
-- Misurato: tutte e 687 le voci delle 281 righe in archivio hanno esattamente
-- due chiavi. Il marchio era l'unico dato fuori sagoma — e spariva al primo
-- salvataggio del pannello, cioè bastava scrivere una nota sul telefono. Fra
-- un anno quella riga sarebbe stata una vendita vera che non è mai esistita:
-- esattamente la cosa che il marchio doveva impedire.
--
-- Le colonne vere invece sopravvivono, perché `deviceToRow` elenca le colonne
-- che scrive e queste non ci sono: il salvataggio del pannello non le tocca.

alter table public.usati
    add column if not exists uscita_forzata boolean not null default false,
    add column if not exists uscita_motivo  text,
    add column if not exists uscita_da      text,
    add column if not exists uscita_il      timestamptz,
    -- ── 2 · IL DESTINATARIO NON PUÒ ANDARE IN `client_id` ────────────────
    -- `usati.client_id` è il cliente DA CUI il telefono è stato comprato: la
    -- scheda lo etichetta «Acquistato da (cliente)» e la Timeline 360° del
    -- cliente lo rende come «♻️ Ritirato usato — modello · prezzo».
    -- Scrivendoci il destinatario, chi RICEVE il telefono se lo ritrova nella
    -- propria scheda come se ce l'avesse VENDUTO, al prezzo d'acquisto; e chi
    -- ce l'ha davvero venduto — quello di cui teniamo il documento d'identità
    -- in `allegato_documento` — sparisce dalla sua timeline.
    -- Misurato: 61 dei 247 telefoni consegnabili hanno un `client_id` che
    -- sarebbe stato distrutto.
    add column if not exists consegnato_a   text;

comment on column public.usati.uscita_forzata is
  'Il telefono è uscito dal magazzino SENZA vendita registrata: niente scontrino, niente contratto, niente commissioning. Chi conta i venduti deve togliere queste righe.';
comment on column public.usati.consegnato_a is
  'Il cliente a cui il telefono è stato CONSEGNATO senza vendita. ⚠️ Non confonderlo con `client_id`, che è il cliente da cui il telefono è stato COMPRATO.';
comment on column public.usati.uscita_motivo is
  'Perché è uscito senza vendita. Obbligatorio: fra sei mesi, davanti a un telefono che manca senza uno scontrino, è l''unica risposta che resta.';

create index if not exists usati_uscita_forzata on public.usati (uscita_forzata) where uscita_forzata;

-- prova: le colonne ci sono, nessuna riga è marchiata, e `client_id` è intatto
do $$
declare n int; forzate int; conCliente int;
begin
    select count(*) into n from information_schema.columns
     where table_name = 'usati' and column_name in ('uscita_forzata','uscita_motivo','uscita_da','uscita_il','consegnato_a');
    select count(*) into forzate from public.usati where uscita_forzata;
    select count(*) into conCliente from public.usati where client_id is not null;
    raise notice 'colonne nuove: %/5 · righe marchiate: % (devono essere 0) · telefoni col cliente di ACQUISTO: %', n, forzate, conCliente;
    if n <> 5 then raise exception 'mancano colonne: solo % su 5', n; end if;
    if forzate <> 0 then raise exception 'ci sono già % righe marchiate: non doveva essercene nessuna', forzate; end if;
end $$;
