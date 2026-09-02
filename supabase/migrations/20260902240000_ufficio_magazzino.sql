-- ═══ L'UFFICIO È IL MAGAZZINO CENTRALE ════════════════════════════════════
-- Luca 02/09: «l'ufficio è il nostro magazzino principale. È dove vive il
-- reparto amministrativo e il reparto logistico, e dove vive anche il
-- magazzino — tanto è che lo trovi già dentro i costi per negozio. Gli unici
-- ruoli a poter accedere a questo magazzino, anche in termini di
-- trasferimento, devono essere dall'amministrazione in su. Deve però essere un
-- posto che risulta dentro il magazzino quando seleziono tutti, perché se
-- qualcuno non ha un telefono deve poter vedere che quel telefono esiste in
-- ufficio e quindi fare richiesta all'amministrazione per l'invio.»
--
-- ── LA SOCIETÀ ────────────────────────────────────────────────────────────
-- Luca: «l'informazione sulla provenienza della merce non ce l'ho, però tutta
-- la merce di Wind3 è di Telefutura e tutta la merce di Vodafone è di
-- Telefutura: grossolanamente puoi attribuire il magazzino tutto su
-- Telefutura». Quindi T1, e al momento del carico la società si chiederà voce
-- per voce — è la prossima cosa da costruire.
--
-- ⚠️ SERVE DAVVERO, non è un dettaglio: la società del posto di partenza è
-- quella che decide se un trasferimento verso un negozio è uno spostamento o
-- una CESSIONE con fattura al seguito. Lasciandola nulla, il trigger la
-- deduce dal magazzino (che qui è vuoto) e ripiega su un valore fisso — è
-- esattamente l'errore che oggi ha fatto uscire cessioni inventate dal
-- laboratorio.

update public.stores set azienda = 'T1' where name = 'Ufficio' and azienda is null;

comment on column public.stores.is_ufficio is
  'Non è un punto vendita. ⚠️ «Ufficio» è però anche il MAGAZZINO CENTRALE: compare in Magazzino (tutti lo vedono), ma spedisce solo l''amministrazione.';

do $$
declare az text; n int;
begin
    select azienda into az from public.stores where name = 'Ufficio';
    select count(*) into n from public.stores where is_ufficio;
    raise notice 'Ufficio · società %, uffici in anagrafica: %', coalesce(az, 'NESSUNA'), n;
    if az is distinct from 'T1' then raise exception 'la società dell''ufficio non è T1 ma %', coalesce(az, 'nulla'); end if;
end $$;
