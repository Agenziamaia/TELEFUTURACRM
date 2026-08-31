-- ═══════════════════════════════════════════════════════════════════════════
-- DI CHI È IL DDT LO DICE LA MERCE, NON IL NEGOZIO (revisore 31/08)
--
-- `mag_ddt_numera` ricavava `azienda_da` da `stores.azienda`. Funziona finché
-- un negozio ha UNA società — ma Donna Olimpia ne ha due, e la sua
-- `stores.azienda` dice T2 perché il backfill ha preso il registratore
-- predefinito. La merce che ci sta dentro invece è per il 90% di T1: 135 pezzi
-- con seriale su 139, e 1.229 pezzi a quantità su 1.652.
--
-- Conseguenza misurata: spostare un telefono di Telefutura da Donna a
-- Magliana W3 — che è Telefutura anche lui — produceva `T2 → T1` e la causale
-- «Cessione tra società del gruppo». Cioè un documento che dichiara una
-- vendita fra due soggetti giuridici, con fattura al seguito, IVA e ricavo
-- che non esistono: un trasferimento interno raccontato come una cessione.
--
-- La società di un documento di trasporto è quella di CHI POSSIEDE LA MERCE.
-- Il negozio resta come ripiego, per quando i pezzi non sono ancora agganciati
-- al DDT — ma appena ci sono, comanda la merce.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function mag_ddt_numera() returns trigger as $$
declare
    az_da text; az_a text; y integer; n integer;
begin
    y := extract(year from coalesce(new.creato_il, now()))::int;

    if new.azienda_da is null then
        /* PRIMA LA MERCE. I pezzi si agganciano al DDT dopo averlo creato,
           quindi qui di solito non ce ne sono ancora: la società che si trova
           è quella dei pezzi che il negozio di partenza ha in casa. Dove ce
           n'è una sola non c'è dubbio; dove sono due (Donna) vince quella che
           possiede più merce, che è la risposta giusta nella quasi totalità
           dei casi — e il campo resta correggibile a mano. */
        select u.azienda into az_da
          from mag_unita u
         where u.negozio = new.da_negozio and u.stato = 'disponibile' and u.azienda is not null
         group by u.azienda order by count(*) desc limit 1;

        if az_da is null then
            select g.azienda into az_da
              from mag_giacenze g
             where g.negozio = new.da_negozio and g.quantita > 0
             group by g.azienda order by sum(g.quantita) desc limit 1;
        end if;

        -- e se il magazzino è vuoto, allora sì: lo dice il negozio
        if az_da is null then
            select coalesce(s.azienda, (select r.azienda from pos_rt r where r.negozio = s.name
                                         order by r.is_default desc nulls last limit 1))
              into az_da from stores s where s.name = new.da_negozio;
        end if;
        new.azienda_da := coalesce(az_da, 'T1');
    end if;

    /* LA MERCE RESTA DI CHI È: se il negozio di arrivo ha anche lui quella
       società, il pezzo cambia scaffale e non proprietario. */
    if new.azienda_a is null then
        select r.azienda into az_a from pos_rt r
         where r.negozio = new.a_negozio and r.azienda = new.azienda_da limit 1;
        if az_a is null then
            select u.azienda into az_a from mag_unita u
             where u.negozio = new.a_negozio and u.azienda = new.azienda_da limit 1;
        end if;
        if az_a is null then
            select coalesce(s.azienda, (select r.azienda from pos_rt r where r.negozio = s.name
                                         order by r.is_default desc nulls last limit 1))
              into az_a from stores s where s.name = new.a_negozio;
        end if;
        new.azienda_a := coalesce(az_a, new.azienda_da, 'T1');
    end if;

    if new.causale is null or new.causale = '' or new.causale = 'Trasferimento tra punti vendita' then
        new.causale := case when new.azienda_da = new.azienda_a
            then 'Trasferimento tra sedi — beni propri'
            else 'Cessione tra società del gruppo' end;
    end if;

    new.anno := y;
    insert into mag_ddt_progressivo (azienda, anno, ultimo)
    values (new.azienda_da, y, 1)
    on conflict (azienda, anno) do update set ultimo = mag_ddt_progressivo.ultimo + 1
    returning ultimo into n;

    new.numero := n;
    if new.inizio_trasporto is null then new.inizio_trasporto := now(); end if;
    return new;
end $$ language plpgsql;
