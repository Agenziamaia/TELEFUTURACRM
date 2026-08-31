-- ═══════════════════════════════════════════════════════════════════════════
-- IL REGISTRO DEGLI EVENTI NON SI SCRIVE DA FUORI (revisore 31/08)
--
-- `mag_eventi` era nata con `insert with check (true)` e il permesso di
-- INSERT ad anon e authenticated. La anon key viaggia dentro il bundle del
-- browser: il registro di audit di un magazzino fiscale era scrivibile da
-- chiunque avesse aperto gli strumenti per sviluppatori. Un registro in cui
-- si possono inserire eventi falsi non è un registro.
--
-- A riempirlo è il TRIGGER, che gira col ruolo del proprietario della
-- funzione e non ha bisogno di quel permesso — verificato dopo la revoca:
-- l'evento della vendita esce lo stesso.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists mag_eventi_scrittura on mag_eventi;
revoke insert on mag_eventi from anon, authenticated;
alter function mag_registra_evento() security definer;

-- e la società di Donna: dice T1 perché è di T1 la merce che ci sta dentro
-- (135 pezzi con seriale su 139, 1.229 a quantità su 1.652), non perché lo
-- dica il registratore predefinito
update stores set azienda = 'T1' where name = 'Donna';
