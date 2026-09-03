-- ═══ LA PORTA DEGLI USATI, CORRETTA ══════════════════════════════════════════
-- Dalla revisione indipendente della porta messa un'ora fa. Tre difetti veri,
-- e il primo era il contrario di quello che la migrazione dichiarava.
--
-- ⚠️ 1. BLOCCAVO ANCHE L'USCITA. La migrazione diceva «si blocca l'ingresso,
-- non l'uscita» — e poi guardava il LIVELLO della giacenza, non la direzione:
-- `new.quantita <= 0` è vero solo quando la giacenza finisce. Uno scarico da 5
-- a 4 pezzi su un articolo marcato usato veniva RIFIUTATO, e con lui la conta
-- d'inventario (che scrive `contata_il` sulla stessa riga) e ogni rettifica.
-- Cioè: un articolo marcato usato per sbaglio si congelava del tutto, e non si
-- poteva nemmeno più correggere.
-- Peggio: contraddiceva alla lettera la migrazione delle quattro ore prima
-- (20260903170000_articoli_usato.sql), che aveva deciso apposta di NON mettere
-- un divieto secco «perché dieci pezzi usati hanno GIÀ una giacenza, e un
-- divieto impedirebbe anche di correggerli».
-- Adesso si guarda il DELTA: cresce → no; cala, resta uguale o non cambia →
-- passa. È la differenza fra chiudere una porta e murare una stanza.
--
-- ⚠️ 2. UN'UNITÀ SENZA CODICE ENTRAVA LO STESSO. Il controllo risolve
-- l'articolo per codice: con `codice` nullo il join non trova niente,
-- `coalesce(v_usato,false)` è falso e il pezzo entra a scaffale. Provato: una
-- unità senza codice da 500 € passava. Adesso senza codice non si entra —
-- un'unità di magazzino senza articolo non è merce, è una riga smarrita.
--
-- ⚠️ 3. IL MESSAGGIO DICEVA UN NUMERO. Un IMEI a un commesso non dice niente,
-- e «se devi spostarlo cambiagli stato nella sua scheda» è un consiglio giusto
-- per un trasferimento e sbagliato per chi sta accettando un carico. Adesso
-- dice cos'è il pezzo e resta più asciutto su cosa fare.

begin;

create or replace function public.mag_usato_fuori()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_usato boolean;
begin
    /* annullato e venduto passano sempre: se no non si potrebbe più correggere
       niente, nemmeno la pulizia stessa */
    if new.stato not in ('disponibile', 'in_arrivo', 'in_transito') then
        return new;
    end if;
    if TG_OP = 'UPDATE' and new.stato is not distinct from old.stato then
        return new;
    end if;

    /* ⚠️ SENZA CODICE NON SI ENTRA. Non è pignoleria: era il buco della porta. */
    if new.codice is null or btrim(new.codice) = '' then
        raise exception
            'Questo pezzo non ha un codice articolo: senza, non si sa nemmeno se è merce nuova o un usato. Caricalo da Carico Merce, che il codice lo chiede.'
            using errcode = 'P0001';
    end if;

    select a.usato into v_usato from mag_articoli a where a.codice = new.codice;
    if coalesce(v_usato, false) then
        raise exception
            'Usato: «%» (%). Non va in magazzino — i telefoni usati vivono in Gestione Usati, e da lì si trasferiscono e si vendono.',
            coalesce(nullif(btrim(new.descrizione), ''), new.codice),
            coalesce(new.seriale, 'senza seriale')
            using errcode = 'P0001';
    end if;
    return new;
end $$;

create or replace function public.mag_usato_fuori_giacenze()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_usato boolean;
    v_prima numeric;
    v_dopo  numeric;
begin
    /* ⚠️ IL DELTA, NON IL LIVELLO. Su un inserimento la giacenza precedente è
       zero; su un aggiornamento è quella che c'era. Se non cresce, non è un
       ingresso: è una vendita, una rettifica in meno, o una conta — e nessuna
       delle tre va impedita. */
    v_dopo  := coalesce(new.quantita, 0) + coalesce(new.in_arrivo, 0);
    v_prima := case when TG_OP = 'UPDATE'
                    then coalesce(old.quantita, 0) + coalesce(old.in_arrivo, 0)
                    else 0 end;
    if v_dopo <= v_prima then
        return new;
    end if;

    select a.usato into v_usato from mag_articoli a where a.codice = new.codice;
    if coalesce(v_usato, false) then
        raise exception
            'Usato: «%». Non tiene giacenza di magazzino — i telefoni usati si contano uno per uno in Gestione Usati.',
            coalesce((select nullif(btrim(a2.descrizione), '') from mag_articoli a2 where a2.codice = new.codice), new.codice)
            using errcode = 'P0001';
    end if;
    return new;
end $$;

-- ── 4. IL REGISTRO DICEVA CHE ERA STATA L'IMPORTAZIONE ────────────────────
-- `mag_registra_evento` attribuisce l'evento a `coalesce(venduto_da,
-- caricato_da)`: sulle 149 righe stornate ha scritto «importazione Suite
-- Mobile» (123), «allineamento gestionale» (25) e «riconciliazione» (1), cioè
-- ha dato la correzione a chi aveva fatto il danno. `mag_eventi` è il registro
-- che legge l'app: fra sei mesi risulterebbe che l'importazione ha stornato
-- 4.076 € di merce. Si corregge l'operatore e si scrive la nota vera.
--
-- ⚠️ E LA NOTA ERA IMPRECISA: «entrata con l'importazione del vecchio
-- gestionale» è falso per 26 righe su 149, che vengono dall'allineamento del
-- 02/09 e dalla riconciliazione dell'01/09. Qui si dice il fatto, non la causa.
update public.mag_eventi
   set operatore = 'correzione 03/09 — usati fuori dal magazzino',
       note = 'un telefono usato non sta in magazzino: vive in Gestione Usati'
 where evento = 'annullato'
   and note = 'tolto dal magazzino'
   and quando >= '2026-09-03T16:00:00Z'
   and operatore in ('importazione Suite Mobile', 'allineamento gestionale',
                     'riconciliazione 01/09 export Suite Mobile');

-- ── 5. UNA PAROLA CHE IL CRM NON CONOSCE ───────────────────────────────────
-- La riga del DDT annullato era stata messa a `annullata`, che non esiste nel
-- vocabolario di `src/lib/trasferimenti.ts`: la schermata cadeva sul ripiego e
-- disegnava una pastiglia grezza. La parola giusta — quella che usa il codice
-- stesso — è `annullata_in_viaggio`.
update public.mag_ddt_righe set stato = 'annullata_in_viaggio' where stato = 'annullata';

commit;
