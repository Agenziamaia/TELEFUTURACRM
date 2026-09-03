-- ═══ LA PORTA: UN USATO NON RIENTRA IN MAGAZZINO ═════════════════════════════
-- La pulizia di poco fa ha tolto 149 telefoni usati dallo stock. Ma toglierli
-- una volta non basta: c'erano finiti da soli, con l'importazione del vecchio
-- gestionale, e un'altra importazione ce li rimetterebbe domani mattina senza
-- che nessuno se ne accorga — di nuovo per giorni, come è appena successo.
--
-- ⚠️ LA REGOLA STA SUL DATABASE, NON SULLA SCHERMATA. Le unità di magazzino le
-- creano l'importazione, il carico merce e i documenti di trasporto — tre
-- strade diverse, e domani ce ne sarà una quarta. Un controllo scritto in una
-- di esse protegge una strada sola. Qui la porta è una: chi passa, passa da qui.
--
-- ⚠️ SI BLOCCA L'INGRESSO, NON L'USCITA. Le due unità già VENDUTE restano
-- toccabili (una vendita avvenuta si può correggere), e chiunque può portare
-- una riga a «annullato»: se no, la pulizia stessa non si potrebbe rifare.
-- Quello che non si può fare è rimettere un usato a scaffale.
--
-- Cosa vede chi sbaglia: un messaggio che dice DOVE va, non solo che ha
-- sbagliato. È la differenza fra una porta chiusa e un cartello.

create or replace function public.mag_usato_fuori()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_usato boolean;
begin
    /* solo gli stati che mettono merce a disposizione: annullato e venduto
       passano sempre, se no non si potrebbe più correggere niente */
    if new.stato not in ('disponibile', 'in_arrivo', 'in_transito') then
        return new;
    end if;
    /* su un aggiornamento che NON cambia lo stato non c'è niente di nuovo da
       impedire: bloccarlo vorrebbe dire congelare righe storiche legittime */
    if TG_OP = 'UPDATE' and new.stato is not distinct from old.stato then
        return new;
    end if;

    select a.usato into v_usato from mag_articoli a where a.codice = new.codice;
    if coalesce(v_usato, false) then
        raise exception
            'Il telefono usato «%» non va in magazzino: vive in Gestione Usati, ed è da lì che si trasferisce e si vende. Se devi spostarlo, cambiagli stato nella sua scheda: il documento di trasporto lo fa il sistema.',
            coalesce(new.seriale, new.codice)
            using errcode = 'P0001';
    end if;
    return new;
end $$;

drop trigger if exists trg_mag_usato_fuori on public.mag_unita;
create trigger trg_mag_usato_fuori
    before insert or update on public.mag_unita
    for each row execute function public.mag_usato_fuori();

-- ── e la stessa porta sulle giacenze a quantità ────────────────────────────
-- Dieci dei telefoni tolti stavano lì: un usato contato «a pezzi» invece che
-- per numero di serie. È la stessa merce, dalla porta accanto.
create or replace function public.mag_usato_fuori_giacenze()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_usato boolean;
begin
    if coalesce(new.quantita, 0) <= 0 and coalesce(new.in_arrivo, 0) <= 0 then
        return new;   -- azzerare è sempre permesso
    end if;
    select a.usato into v_usato from mag_articoli a where a.codice = new.codice;
    if coalesce(v_usato, false) then
        raise exception
            'L''articolo «%» è un usato: non tiene giacenza di magazzino. I telefoni usati si contano uno per uno in Gestione Usati.',
            new.codice
            using errcode = 'P0001';
    end if;
    return new;
end $$;

drop trigger if exists trg_mag_usato_fuori_giacenze on public.mag_giacenze;
create trigger trg_mag_usato_fuori_giacenze
    before insert or update on public.mag_giacenze
    for each row execute function public.mag_usato_fuori_giacenze();
