-- ═══════════════════════════════════════════════════════════════════════════
-- LA NUMERAZIONE DEL DDT (Luca 31/08: «organizza le DDT, a prescindere va
-- fatto un documento di trasporto»)
--
-- `mag_ddt.numero` era una sequenza SOLA per tutte e due le società. Ma un
-- documento di trasporto lo emette un SOGGETTO: Telefutura e Telefutura 2
-- sono due contribuenti diversi, e ognuno deve avere la propria numerazione
-- progressiva, che riparte da 1 ogni anno. Con una sequenza condivisa il
-- registro di Telefutura avrebbe avuto buchi (i numeri usati dall'altra) —
-- e un progressivo con i buchi non è un progressivo.
--
-- Si può rifare senza paura: di DDT non ne è ancora stato emesso nessuno.
--
-- Il numero lo assegna un TRIGGER, non il codice dell'applicazione: due
-- trasferimenti fatti nello stesso istante da due negozi diversi avrebbero
-- letto lo stesso «ultimo numero» e ne avrebbero scritto uno uguale. Il
-- lock sulla riga della sequenza è l'unica cosa che lo impedisce davvero.
--
-- E le due SOCIETÀ si ricavano dai negozi: chi spedisce e chi riceve non li
-- deve digitare nessuno, sono già scritti in `pos_rt`.
-- ═══════════════════════════════════════════════════════════════════════════

alter table mag_ddt add column if not exists anno integer;

create table if not exists mag_ddt_progressivo (
    azienda text not null,
    anno    integer not null,
    ultimo  integer not null default 0,
    primary key (azienda, anno)
);

create or replace function mag_ddt_numera() returns trigger as $$
declare
    az_da text; az_a text; y integer; n integer;
begin
    y := extract(year from coalesce(new.creato_il, now()))::int;

    -- di chi è il negozio che spedisce, e di chi quello che riceve
    if new.azienda_da is null then
        select r.azienda into az_da from pos_rt r
         where r.negozio = new.da_negozio order by r.is_default desc nulls last limit 1;
        new.azienda_da := coalesce(az_da, 'T1');
    end if;
    /* LA MERCE RESTA DI CHI È. Un negozio può avere DUE società — Donna ha sia
       Telefutura sia Telefutura 2 — e un pezzo di Telefutura che si sposta a
       Donna **resta di Telefutura**: cambia scaffale, non proprietario.
       Solo se il negozio di arrivo quella società non ce l'ha si tratta di una
       cessione vera, e allora si prende la sua. Prendere sempre la
       predefinita del destinatario avrebbe trasformato ogni trasferimento
       verso Donna in una cessione fra società, con la fattura al seguito. */
    if new.azienda_a is null then
        select r.azienda into az_a from pos_rt r
         where r.negozio = new.a_negozio and r.azienda = new.azienda_da limit 1;
        if az_a is null then
            select r.azienda into az_a from pos_rt r
             where r.negozio = new.a_negozio order by r.is_default desc nulls last limit 1;
        end if;
        new.azienda_a := coalesce(az_a, new.azienda_da, 'T1');
    end if;

    /* LA CAUSALE LA DICONO LE SOCIETÀ, non l'operatore. Fra due punti vendita
       della stessa società è un trasferimento di beni propri; fra società
       diverse è una cessione fra due soggetti, e il DDT va seguito da fattura.
       Il CRM lo sa da sé: è l'unico che ha sotto gli occhi tutte e due le
       cose. (La dicitura esatta va confermata col commercialista.) */
    if new.causale is null or new.causale = '' or new.causale = 'Trasferimento tra punti vendita' then
        new.causale := case when new.azienda_da = new.azienda_a
            then 'Trasferimento tra sedi — beni propri'
            else 'Cessione tra società del gruppo' end;
    end if;

    new.anno := y;
    -- il lock: due trasferimenti nello stesso istante non prendono lo stesso numero
    insert into mag_ddt_progressivo (azienda, anno, ultimo)
    values (new.azienda_da, y, 1)
    on conflict (azienda, anno) do update set ultimo = mag_ddt_progressivo.ultimo + 1
    returning ultimo into n;

    new.numero := n;
    if new.inizio_trasporto is null then new.inizio_trasporto := now(); end if;
    return new;
end $$ language plpgsql;

drop trigger if exists trg_mag_ddt_numera on mag_ddt;
create trigger trg_mag_ddt_numera before insert on mag_ddt
    for each row execute function mag_ddt_numera();

-- un numero non si ripete dentro la stessa società e lo stesso anno
create unique index if not exists mag_ddt_numero_unico on mag_ddt (azienda_da, anno, numero);

alter table mag_ddt_progressivo enable row level security;
drop policy if exists mag_ddt_prog_lettura on mag_ddt_progressivo;
create policy mag_ddt_prog_lettura on mag_ddt_progressivo for select using (true);
grant select on mag_ddt_progressivo to anon, authenticated;
