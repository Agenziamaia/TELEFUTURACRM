-- ═══════════════════════════════════════════════════════════════════════════
-- IL QUINTO REGISTRO ENTRA NELLA PARTITA DELLA PERSONA
--
-- `mag_ddt_malus` nasceva già con la forma dei quattro fratelli (tracking,
-- caller, usato, task) ma NON era agganciato a `partita_persona`: il malus del
-- ritardo si sarebbe accumulato senza comparire da nessuna parte nel conto di
-- chi lo paga. Un debito invisibile è peggio di nessun debito — te lo trovi
-- addosso il giorno della busta e non sai da dove viene.
--
-- `riferimento` porta il numero del DDT, perché è quello che la persona può
-- andare a cercare: «trasferimento n. 20».
-- ═══════════════════════════════════════════════════════════════════════════
create or replace view public.partita_persona as
 SELECT 'tracking'::text AS fonte, m.id::text AS episodio_id, u.id AS user_id,
        m.venditore AS persona, m.data_inizio AS dal, m.data_fine AS al,
        m.giorni, m.importo, m.stato, m.contract_id AS riferimento, m.negozio,
        m.created_at, false AS eliminato
   FROM malus_storico m
   LEFT JOIN app_users u ON lower(btrim(u.full_name)) = lower(btrim(m.venditore))
  WHERE COALESCE(m.eliminato, false) = false
UNION ALL
 SELECT 'caller'::text, c.id::text, u.id, c.caller, c.dal, c.al, c.giorni,
        c.importo, c.stato, c.call_id, NULL::text, c.created_at, false
   FROM caller_malus c
   LEFT JOIN app_users u ON lower(btrim(u.full_name)) = lower(btrim(c.caller))
  WHERE COALESCE(c.eliminato, false) = false
UNION ALL
 SELECT 'usato'::text, s.id::text, u.id, s.tecnico, s.data_inizio, s.data_fine,
        s.giorni, s.importo, s.stato, s.imei, NULL::text, s.created_at, false
   FROM usati_malus s
   LEFT JOIN app_users u ON lower(btrim(u.full_name)) = lower(btrim(s.tecnico))
UNION ALL
 SELECT 'task'::text, t.id::text, t.user_id, t.persona, t.scadenza, t.data_fine,
        t.giorni, t.importo, t.stato, t.task_id::text, NULL::text, t.created_at, false
   FROM task_malus t
  WHERE COALESCE(t.eliminato, false) = false
UNION ALL
 /* IL RITARDO NELL'ACCETTARE UN TRASFERIMENTO.
    `user_id` è già scritto sulla riga quando la persona è riconosciuta; il
    LEFT JOIN sul nome è la rete per le righe vecchie, come negli altri quattro. */
 SELECT 'trasferimento'::text, d.id::text, COALESCE(d.user_id, u.id), d.persona,
        d.scadenza, d.data_fine, d.giorni, d.importo, d.stato,
        ('DDT n. ' || d.numero)::text, d.negozio, d.created_at, false
   FROM mag_ddt_malus d
   LEFT JOIN app_users u ON lower(btrim(u.full_name)) = lower(btrim(d.persona))
  WHERE COALESCE(d.eliminato, false) = false
    AND d.stato <> 'archiviato';
