-- ═══ QUELLO CHE SI SA DALLO SCONTRINO ══════════════════════════════════════
-- Luca 01/09, guardando il registro: «non capisco perché ci sono ancora dei
-- numeri dove c'è scritto metti il numero. Ma che numero metto? Manca il
-- numero, come faccio a scriverlo? Non posso scriverlo, devi riprenderlo
-- tutto dallo scontrino chiaramente. C'è anche da capire se poi effettivamente
-- quei soldi sono stati incassati.»
--
-- Ha ragione due volte. Chiedere all'amministrazione di scrivere un numero
-- che nessuno conosce non è un campo da compilare, è un vicolo cieco: quel
-- numero è STAMPATO sullo scontrino, dentro la descrizione della riga
-- («RICARICA VODAFONE 23 3445676400»), e va letto da lì.
-- E la seconda: il CRM registra la vendita, ma lo scontrino lo emette il
-- registratore — e a volte non ci riesce (agente spento, stampante muta).
-- Oggi è successo su tre ricariche vere. Una ricarica senza scontrino è una
-- cosa che qualcuno deve sapere.
alter table public.paystore_ricariche
    add column if not exists scontrino_emesso boolean,
    add column if not exists scontrino_errore text,
    add column if not exists reparto_usato smallint;

comment on column public.paystore_ricariche.scontrino_emesso is
  'true = il registratore ha stampato · false = il lavoro di stampa è fallito (i soldi possono essere stati incassati senza documento) · null = non abbiamo trovato lo scontrino.';
comment on column public.paystore_ricariche.reparto_usato is
  'Il reparto con cui la riga è USCITA sullo scontrino. Deve essere 1 (non soggetta): se è un altro, la ricarica è stata assoggettata a IVA per errore.';

create index if not exists paystore_ricariche_senza_scontrino
    on public.paystore_ricariche (creata_il) where scontrino_emesso is false;
