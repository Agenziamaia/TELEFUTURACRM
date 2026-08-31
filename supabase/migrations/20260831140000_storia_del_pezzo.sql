-- ═══════════════════════════════════════════════════════════════════════════
-- LA STORIA DI OGNI PEZZO (Luca 31/08)
--
-- «Dalla ricerca seriale devo poter verificare TUTTA la storia di quel
--  seriale: se è stato trasferito da un negozio all'altro, quando è stato
--  comprato, da quale utente è stato caricato, da quale utente è stato
--  inviato il trasferimento, quale utente l'ha accettato e in quale punto
--  vendita, se è stato venduto qual è l'utente che ha fatto la vendita. E
--  devo poter cliccare su ogni step: mi dà il dettaglio, ci clicco di nuovo e
--  mi porta al documento — lo scontrino, il DDT.»
--
-- COSA C'ERA, E PERCHÉ NON BASTAVA:
--   · `mag_unita.storia` (jsonb) esisteva ma era VUOTA su tutti i 587 pezzi:
--     l'import non ci scriveva niente, e nessun trasferimento è ancora
--     avvenuto. La storia sarebbe cominciata a metà.
--   · peggio: `mag_unita.ddt_id` tiene UN solo DDT e viene AZZERATO
--     all'accettazione. Un pezzo che gira fra tre negozi non lascia traccia
--     di dove è stato: resta solo l'ultimo posto in cui si trova.
--
-- COSA SI FA: un registro di eventi, e un TRIGGER che li scrive da sé.
-- Non una funzione che ogni pezzo di codice deve ricordarsi di chiamare —
-- quella è la strada per cui una strada su cinque non registra niente e
-- nessuno se ne accorge per mesi. Il trigger guarda cosa CAMBIA nella riga:
-- qualunque strada la tocchi, l'evento esce.
--
-- Luca: «la storicità del magazzino nascerà da oggi» — quindi il carico
-- iniziale dei quattro negozi diventa il primo evento di ogni pezzo, con la
-- data e l'utente veri dell'import.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists mag_eventi (
    id            uuid primary key default gen_random_uuid(),
    seriale       text not null,
    unita_id      uuid,
    quando        timestamptz not null default now(),
    -- carico · trasferimento_inviato · trasferimento_accettato · vendita
    -- · annullato · rientro · correzione
    evento        text not null,
    negozio       text,
    negozio_da    text,          -- solo per i trasferimenti
    azienda       text,
    operatore     text,
    -- a quale documento porta il clic: ddt · contratto · import · —
    documento     text,
    documento_id  text,
    note          text,
    creato_il     timestamptz not null default now()
);
create index if not exists mag_eventi_seriale on mag_eventi (seriale, quando);
create index if not exists mag_eventi_unita   on mag_eventi (unita_id, quando);
alter table mag_eventi enable row level security;
drop policy if exists mag_eventi_lettura on mag_eventi;
create policy mag_eventi_lettura on mag_eventi for select using (true);
drop policy if exists mag_eventi_scrittura on mag_eventi;
create policy mag_eventi_scrittura on mag_eventi for insert with check (true);
grant select, insert on mag_eventi to anon, authenticated;

/* IL TRIGGER: la riga cambia, l'evento esce. Nessuna strada può dimenticarsi
   di registrare, perché non è lei a registrare. */
create or replace function mag_registra_evento() returns trigger as $$
declare
    ev text; da text; doc text; docid text; nota text;
begin
    if TG_OP = 'INSERT' then
        insert into mag_eventi (seriale, unita_id, quando, evento, negozio, azienda, operatore, documento, note)
        values (new.seriale, new.id, coalesce(new.caricato_il, now()), 'carico',
                new.negozio, new.azienda, new.caricato_da, 'import',
                'entrato a magazzino');
        return new;
    end if;

    -- lo stato racconta quasi tutto
    if new.stato is distinct from old.stato then
        if new.stato = 'venduto' then
            ev := 'vendita'; doc := 'contratto'; docid := new.contract_id::text;
            nota := 'venduto';
        elsif new.stato = 'annullato' then
            ev := 'annullato'; nota := 'tolto dal magazzino';
        elsif new.stato = 'in_transito' then
            ev := 'trasferimento_inviato'; doc := 'ddt'; docid := new.ddt_id::text;
            da := old.negozio; nota := 'partito con un DDT';
        elsif old.stato = 'in_transito' and new.stato = 'disponibile' then
            ev := 'trasferimento_accettato'; doc := 'ddt'; docid := old.ddt_id::text;
            da := old.negozio; nota := 'accettato e messo a scaffale';
        else
            ev := 'correzione'; nota := old.stato || ' → ' || new.stato;
        end if;
    elsif new.negozio is distinct from old.negozio then
        ev := 'trasferimento_accettato'; da := old.negozio; doc := 'ddt';
        docid := coalesce(new.ddt_id, old.ddt_id)::text;
        nota := 'cambiato punto vendita';
    elsif new.azienda is distinct from old.azienda then
        ev := 'correzione'; nota := 'società: ' || coalesce(old.azienda,'—') || ' → ' || coalesce(new.azienda,'—');
    else
        return new;   -- niente che valga la pena raccontare
    end if;

    insert into mag_eventi (seriale, unita_id, evento, negozio, negozio_da, azienda, operatore, documento, documento_id, note)
    values (new.seriale, new.id, ev, new.negozio, da, new.azienda,
            coalesce(new.venduto_da, new.caricato_da), doc, nullif(docid,''), nota);
    return new;
end $$ language plpgsql;

drop trigger if exists trg_mag_registra_evento on mag_unita;
create trigger trg_mag_registra_evento
    after insert or update on mag_unita
    for each row execute function mag_registra_evento();

-- ── LA STORIA COMINCIA DA QUI: il carico dei quattro negozi ───────────────
insert into mag_eventi (seriale, unita_id, quando, evento, negozio, azienda, operatore, documento, note)
select u.seriale, u.id, coalesce(u.caricato_il, u.created_at, now()), 'carico',
       u.negozio, u.azienda, u.caricato_da, 'import',
       coalesce(u.caricato_da, 'importazione') || ' — primo carico del magazzino'
  from mag_unita u
 where not exists (select 1 from mag_eventi e where e.unita_id = u.id and e.evento = 'carico');
