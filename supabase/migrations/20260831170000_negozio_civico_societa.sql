-- ═══════════════════════════════════════════════════════════════════════════
-- IL CIVICO HA IL SUO POSTO, E LA SOCIETÀ SI SCEGLIE ANCHE SENZA CASSA
-- (Luca 31/08)
--
-- «Creami uno spazio dedicato per il civico, così siamo sicuri che è sempre
--  tutto bello preciso e ordinato. E sui negozi dove non c'è registratore
--  fiscale dammi comunque la possibilità di selezionare la società, così poi
--  avrai il dato già pronto quando andremo a configurare i registratori.»
--
-- IL CIVICO. In un campo solo con la via, prima o poi qualcuno scrive «via
-- della Magliana 263/263A», qualcun altro «Via della Magliana, 263» e un
-- terzo dimentica il numero. Su un documento di trasporto l'indirizzo è il
-- luogo di consegna: separato, o è preciso o si vede che manca.
--
-- LA SOCIETÀ. Finora stava SOLO su `pos_rt`, la tabella dei registratori di
-- cassa: un negozio senza registratore non poteva averne una — eppure la
-- società ce l'ha lo stesso, ed è quella che possiede la merce a magazzino e
-- che firma i documenti di trasporto. Ora sta sul negozio, dove appartiene.
-- `pos_rt` continua a dire quale società EMETTE lo scontrino: quando il
-- registratore si configura, le due devono combaciare.
-- ═══════════════════════════════════════════════════════════════════════════

alter table stores add column if not exists civico  text;
alter table stores add column if not exists azienda text references aziende(codice);

comment on column stores.azienda is
  'La società a cui appartiene il punto vendita (T1/T2). È indipendente da pos_rt, che dice invece quale società emette lo scontrino: un negozio ha una società anche prima di avere un registratore.';
comment on column stores.civico is
  'Numero civico, separato dalla via: sul DDT l''indirizzo è il luogo di consegna e deve essere preciso.';

-- quello che già sappiamo lo prendiamo dai registratori configurati
update stores s set azienda = (
    select r.azienda from pos_rt r
     where r.negozio = s.name
     order by r.is_default desc nulls last limit 1)
 where s.azienda is null
   and exists (select 1 from pos_rt r where r.negozio = s.name);

-- ── e il DDT, dove il registratore non c'è, chiede al negozio ─────────────
create or replace function mag_ddt_numera() returns trigger as $$
declare
    az_da text; az_a text; y integer; n integer;
begin
    y := extract(year from coalesce(new.creato_il, now()))::int;

    /* DI CHI È IL NEGOZIO. Prima si guardava solo `pos_rt`: un punto vendita
       senza registratore ricadeva su 'T1' per difetto — cioè su una società a
       caso. Ora la prima risposta la dà il negozio stesso. */
    if new.azienda_da is null then
        select coalesce(s.azienda, (select r.azienda from pos_rt r where r.negozio = s.name
                                     order by r.is_default desc nulls last limit 1))
          into az_da from stores s where s.name = new.da_negozio;
        new.azienda_da := coalesce(az_da, 'T1');
    end if;

    /* LA MERCE RESTA DI CHI È: un negozio può avere due società (Donna), e un
       pezzo che si sposta lì cambia scaffale, non proprietario. */
    if new.azienda_a is null then
        select r.azienda into az_a from pos_rt r
         where r.negozio = new.a_negozio and r.azienda = new.azienda_da limit 1;
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
