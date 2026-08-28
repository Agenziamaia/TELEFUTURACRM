-- La vista del collo di bottiglia mostrava anche gli episodi ANNULLATI
-- (revisore 28/08): i 9 malus tolti dalle spalle dei venditori il 27/08 ci
-- comparivano dentro. Oggi non la legge ancora nessuno, ma è il punto in cui
-- domani atterrano commissioni e compensazioni: chi la collega per primo si
-- porterebbe dentro i tombstone.
--
-- Un annullamento deve valere OVUNQUE, non solo nelle schermate che si
-- ricordano di filtrare.
create or replace view partita_persona as
    select 'tracking'::text as fonte, m.id::text as episodio_id,
           u.id as user_id, m.venditore as persona,
           m.data_inizio::date as dal, m.data_fine::date as al,
           m.giorni, m.importo, m.stato,
           m.contract_id as riferimento, m.negozio,
           m.created_at, false as eliminato
      from malus_storico m
      left join app_users u on lower(btrim(u.full_name)) = lower(btrim(m.venditore))
     where coalesce(m.eliminato, false) = false
    union all
    select 'caller', c.id::text,
           u.id, c.caller,
           c.dal, c.al, c.giorni, c.importo, c.stato,
           c.call_id, null,
           c.created_at, false
      from caller_malus c
      left join app_users u on lower(btrim(u.full_name)) = lower(btrim(c.caller))
     where coalesce(c.eliminato, false) = false
    union all
    select 'usato', s.id::text,
           u.id, s.tecnico,
           s.data_inizio, s.data_fine, s.giorni, s.importo, s.stato,
           s.imei, null,
           s.created_at, false
      from usati_malus s
      left join app_users u on lower(btrim(u.full_name)) = lower(btrim(s.tecnico))
    union all
    select 'task', t.id::text,
           t.user_id, t.persona,
           t.scadenza, t.data_fine, t.giorni, t.importo, t.stato,
           t.task_id::text, null,
           t.created_at, false
      from task_malus t
     where coalesce(t.eliminato, false) = false;
