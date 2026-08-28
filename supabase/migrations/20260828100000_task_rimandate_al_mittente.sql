-- RIMANDATE AL MITTENTE (Luca 28/08/2026)
-- «Quell'esito deve essere una categoria sempre attiva sulla visualizzazione
--  giornaliera, come le arretrate; ognuno vede le sue, solo l'admin le vede
--  tutte. Finché non vengono lavorate dal mittente non generano malus e
--  restano sospese; poi lui la riassegna o la chiude direttamente.»
--
-- Il malus era già fermo (lo stato `problema` sta fra le LAVORATE). Qui manca
-- una cosa sola: quando il mittente la RILANCIA, i due giorni devono ripartire
-- da quel momento, non dalla creazione — altrimenti la task rinasce già in
-- ritardo per colpa del tempo passato in mano al mittente.
alter table calendar_tasks add column if not exists assegnata_il timestamptz;
comment on column calendar_tasks.assegnata_il is
  'Quando la task è stata (ri)messa in mano a chi la deve fare: da qui parte il patto dei due giorni. NULL = vale created_at.';

-- l'etichetta dell'esito, come la chiama Luca
update calendario_esiti set etichetta = 'Rimandata al mittente'
 where tipo = 'task' and chiave = 'problema' and etichetta <> 'Rimandata al mittente';
