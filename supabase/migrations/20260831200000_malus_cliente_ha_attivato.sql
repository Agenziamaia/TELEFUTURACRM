-- «QUESTO HA ATTIVATO» (Tommaso via Luca, 31/08).
--
-- La segnalazione: MSSPRD64R05H501E è in malus da giorni, ma quel cliente ha
-- comprato — tre contratti attivi il 25/08. E non è un caso isolato:
-- RSUPLA57B43H501I (Paola Urso) ha due contratti attivi lo stesso giorno e
-- porta 40 € di malus vivo. In tutto 45 €, tutti sullo stesso caller.
--
-- PERCHÉ SUCCEDE. Il ponte fra la vendita e la pratica del caller passa
-- SOLO dall'appuntamento, e si attraversa una volta sola: nel momento in cui
-- la vendita viene registrata. Basta che l'appuntamento non ci sia (Paride:
-- la pratica è ferma su «Da richiamare», nessun appuntamento valido — quello
-- che c'è porta l'anno digitato male, 2024), o che nasca DOPO la vendita
-- (Paola: vendita alle 08:47, appuntamento creato alle 09:49), e il ponte non
-- si attraversa mai più. Da lì in poi la pratica resta aperta e matura penale
-- su un cliente che ha già comprato.
--
-- LA REGOLA, che non dipende più dall'appuntamento: se la persona di quella
-- pratica ha una ATTIVAZIONE nostra da quando la pratica esiste, quella
-- pratica non è un lavoro mancato. Il malus non è dovuto — comunque sia
-- andata la trafila degli appuntamenti.
--
-- La finestra parte 7 giorni PRIMA della creazione della pratica: un cliente
-- che ha comprato pochi giorni prima di finire in una lista non è un lavoro
-- mancato, è una lista da ripulire (il controllo doppioni all'assegnazione).

-- ① la vista: le pratiche il cui cliente ha attivato
create or replace view caller_pratiche_vendute as
select distinct c.id as call_id, c.caller, c.cf,
       min(k.data) over (partition by c.id) as data_vendita
  from calls c
  join clients cl on upper(coalesce(cl.cf_piva, cl.intestatario_cf, cl.cf_ref)) = upper(c.cf)
  join contracts k on k.client_id = cl.id and k.stato ilike '%attiv%'
 where coalesce(c.cf, '') <> ''
   and coalesce(c.assorbita_da, '') = ''
   and k.data >= to_char(c.created_at - interval '7 days', 'YYYY-MM-DD');

comment on view caller_pratiche_vendute is
  'Pratiche caller il cui cliente ha una attivazione nostra da quando la pratica esiste (finestra: 7 giorni prima della creazione). Su queste il malus non è dovuto: il cliente ha comprato.';

-- ② il rimedio sugli episodi già maturati. Tombstone, non cancellazione:
--    la riga resta e dice perché è stata annullata (prassi del 25/08 dopo
--    l'incidente dei malus Sky retroattivi).
update caller_malus m
   set eliminato = true,
       eliminato_il = now(),
       eliminato_da = 'il cliente ha attivato: la pratica non è un lavoro mancato'
 where coalesce(m.eliminato, false) = false
   and m.stato in ('in_corso', 'attivo')
   and exists (select 1 from caller_pratiche_vendute v where v.call_id::text = m.call_id);
