-- ═══ IL MOTORE DELLE RICARICHE: LA PRESA ══════════════════════════════════
-- Fino a oggi il credito lo carica una persona al terminale PayStore e poi
-- segna la riga come «ok manuale». Con le credenziali arrivate (una per
-- negozio e società) la ricarica può partire da sola.
--
-- ⚠️ IL RISCHIO NON È CHE NON PARTA: È CHE PARTA DUE VOLTE. Ogni ricarica è
-- denaro erogato a un numero di telefono, e non si torna indietro. Due corse
-- del motore che prendono la stessa riga nello stesso istante erogherebbero
-- due crediti — la chiave di idempotenza di PayStore protegge solo se le due
-- chiamate usano la STESSA chiave, e due corse che non si vedono ne
-- genererebbero due diverse.
-- Per questo la riga si PRENDE, in una transazione, con `for update skip
-- locked`: chi arriva secondo non la vede nemmeno.
--
-- ⚠️ E IL MOTORE NON EREDITA L'ARRETRATO. Misurato il 02/09: 37 ricariche in
-- sospeso per 426 € su dieci negozi, tutte di oggi. Una parte è già stata
-- caricata a mano al terminale senza che nessuno l'abbia segnata nel CRM:
-- accendere il motore su quelle vorrebbe dire erogare il credito una seconda
-- volta, a spese nostre. La finestra temporale è il modo di dirlo in codice —
-- il motore vede solo quello che è nato dopo, e l'arretrato resta a chi lo
-- stava già facendo.

alter table public.paystore_ricariche
    add column if not exists motore_preso_il timestamptz;

comment on column public.paystore_ricariche.motore_preso_il is
  'Quando il motore ha preso in carico questa riga. ⚠️ Serve a impedire che due corse eroghino due crediti sullo stesso numero: la presa avviene con `for update skip locked` dentro tf_paystore_prendi().';

create index if not exists paystore_motore_coda
    on public.paystore_ricariche (creata_il)
    where stato = 'sospeso';

-- ── LA PRESA ──────────────────────────────────────────────────────────────
-- Restituisce le righe che il motore può eseguire ADESSO, marcandole prese
-- nella stessa transazione. Chi chiama esegue e poi scrive l'esito.
--
-- I filtri, e perché ognuno c'è:
--   · stato «sospeso»            → le altre o sono fatte o sono state annullate
--   · scontrino emesso           → il cliente ha pagato davvero. Su uno
--                                  scontrino in errore l'incasso non è provato
--   · nota senza «SOSPESO»       → il conto in sospeso è merce non pagata:
--                                  caricarne il credito è regalarlo
--   · numero da 7 a 11 cifre     → senza numero non è eseguibile da nessuno
--   · negozio e società presenti → senza, non si sa quale plafond usare
--   · importo entro il tetto     → un tetto basso è la rete sotto il trapezio
--                                  nei primi giorni
--   · presa scaduta o mai presa  → una corsa morta a metà non blocca la riga
--                                  per sempre: dopo il lasso torna prendibile
create or replace function public.tf_paystore_prendi(
    p_max int,
    p_finestra_minuti int,
    p_tetto numeric,
    p_lasso_minuti int default 10
)
returns setof public.paystore_ricariche
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    with presi as (
        select r.id
          from public.paystore_ricariche r
         where r.stato = 'sospeso'
           and r.scontrino_stato = 'emesso'
           and coalesce(r.nota, '') not ilike '%SOSPESO%'
           and r.numero is not null
           and length(regexp_replace(r.numero, '\D', '', 'g')) between 7 and 11
           and r.negozio is not null
           and r.azienda is not null
           and r.importo > 0
           and r.importo <= p_tetto
           and r.creata_il >= now() - make_interval(mins => p_finestra_minuti)
           and (r.motore_preso_il is null
                or r.motore_preso_il < now() - make_interval(mins => p_lasso_minuti))
         order by r.creata_il
         limit p_max
         for update skip locked
    )
    update public.paystore_ricariche r
       set motore_preso_il = now()
      from presi
     where r.id = presi.id
    returning r.*;
end $$;

revoke all on function public.tf_paystore_prendi(int, int, numeric, int) from public, anon, authenticated;

comment on function public.tf_paystore_prendi(int, int, numeric, int) is
  '⚠️ EROGA DENARO A VALLE. Prende le ricariche eseguibili marcandole nella stessa transazione (for update skip locked), così due corse non possono erogare due crediti sullo stesso numero. Revocata a tutti: la chiama solo il server con la chiave di servizio.';

-- prova
do $$
declare c int; f int; n int;
begin
    select count(*) into c from information_schema.columns
     where table_name = 'paystore_ricariche' and column_name = 'motore_preso_il';
    select count(*) into f from pg_proc where proname = 'tf_paystore_prendi';
    -- quante prenderebbe con i valori di fabbrica (finestra 60', tetto 50 €)
    select count(*) into n from public.paystore_ricariche r
     where r.stato = 'sospeso' and r.scontrino_stato = 'emesso'
       and coalesce(r.nota,'') not ilike '%SOSPESO%'
       and r.creata_il >= now() - interval '60 minutes'
       and r.importo <= 50;
    raise notice 'colonna: % · funzione: % · prenderebbe adesso: %', c, f, n;
    if c <> 1 or f <> 1 then raise exception 'colonna o funzione mancanti: col=% fn=%', c, f; end if;
end $$;
