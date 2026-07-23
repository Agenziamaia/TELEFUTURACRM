-- 067: allinea `stato` dei contratti gia' esistenti a `stato_negozio`.
--
-- Segnalazione 37 (marcata NON RISOLTO): i contratti nuovi nascono "Nuovo" e lo
-- stato si propaga dal Tracking PDA, ma le 108 righe inserite PRIMA di quella
-- modifica erano rimaste "Attivo" a prescindere. In Ricerca Contratto si vedeva
-- ancora una colonna piena di "Attivo", quindi la correzione sembrava non aver
-- funzionato.
--
-- Stessa mappatura di statoContrattoDa() in trackingHelpers.ts:
--   attivato / re_inserita / liquidato -> Attivo
--   nuovo                              -> Nuovo
--   ko* / annullato                    -> Annullato
--   tutto il resto                     -> In lavorazione
--
-- NB: non si tocca data_attivazione (indicazione di Luca: e' la data di
-- registrazione e resta com'e').

update public.contracts
set stato = case
    when lower(coalesce(stato_negozio, 'nuovo')) in ('attivato', 're_inserita', 'liquidato') then 'Attivo'
    when lower(coalesce(stato_negozio, 'nuovo')) = 'nuovo' then 'Nuovo'
    when lower(coalesce(stato_negozio, '')) like 'ko%'
      or lower(coalesce(stato_negozio, '')) = 'annullato' then 'Annullato'
    else 'In lavorazione'
end
where stato is distinct from (case
    when lower(coalesce(stato_negozio, 'nuovo')) in ('attivato', 're_inserita', 'liquidato') then 'Attivo'
    when lower(coalesce(stato_negozio, 'nuovo')) = 'nuovo' then 'Nuovo'
    when lower(coalesce(stato_negozio, '')) like 'ko%'
      or lower(coalesce(stato_negozio, '')) = 'annullato' then 'Annullato'
    else 'In lavorazione'
end);

notify pgrst, 'reload schema';
