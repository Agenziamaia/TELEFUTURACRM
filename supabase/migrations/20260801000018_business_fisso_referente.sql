-- 124: BUSINESS — telefono fisso in anagrafica + riallineamento referente (Luca 01/08)
--
-- (a) clients.telefono_fisso: recapito FISSO facoltativo delle anagrafiche
--     business (uffici/negozi hanno spesso solo il fisso).
--
-- (b) Backfill referente: nel DB convivevano DUE convenzioni per le business —
--     Registra Vendita scrive il referente in nome_ref/cognome_ref (nome vuoto),
--     il caller lo scriveva in nome/cognome (nome_ref sempre vuoto). Ogni
--     schermata legge una colonna diversa, quindi meta' delle anagrafiche
--     sembrava "senza referente" pur avendolo. Da oggi il codice scrive
--     ENTRAMBE le coppie allineate; qui si allinea lo storico nei due versi.
--     Nessuna riga con entrambe le coppie piene viene toccata.

alter table public.clients add column if not exists telefono_fisso text;

-- caso caller: referente solo in nome/cognome -> copiato nel campo canonico
update public.clients
   set nome_ref = nome, cognome_ref = coalesce(cognome, '')
 where tipo = 'business'
   and coalesce(trim(nome_ref), '') = ''
   and coalesce(trim(nome), '') <> '';

-- caso Registra Vendita: nome vuoto -> allineato al referente, cosi' le
-- schermate che leggono nome/cognome (modale Modifica Cliente, filtri lista)
-- non mostrano piu' il referente vuoto
update public.clients
   set nome = nome_ref, cognome = coalesce(cognome_ref, '')
 where tipo = 'business'
   and coalesce(trim(nome), '') = ''
   and coalesce(trim(nome_ref), '') <> '';
