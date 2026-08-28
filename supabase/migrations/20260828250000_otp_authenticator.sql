-- IL CODICE DELL'AUTENTICATORE (Luca 28/08 sera).
--
-- Alcune utenze — Vodafone — non mandano il codice via mail: lo genera l'app
-- Microsoft Authenticator sul telefono di qualcuno. Che vuol dire: se quel
-- qualcuno è in ferie, ha cambiato telefono o ha lasciato l'azienda, al portale
-- non entra più nessuno.
--
-- L'app non fa magie: applica un algoritmo pubblico (TOTP, RFC 6238) a una
-- CHIAVE che il portale mostra una volta sola, al momento della
-- configurazione. Con quella chiave il codice lo sa calcolare chiunque — CRM
-- compreso. È esattamente la stessa cosa che il CRM fa già per la propria
-- verifica in due passaggi.
--
-- ⚠️ SCELTA CONSAPEVOLE DI LUCA: tenendo la chiave qui, chi può vedere la
-- password vede anche il secondo fattore — che quindi smette di essere un
-- secondo fattore. È lo stesso principio dei codici via mail: il CRM tiene il
-- fattore al posto della persona, protetto dal permesso della sezione Password
-- e con ogni richiesta annotata nel registro.

alter table password_credentials
  add column if not exists totp_secret_enc text;

comment on column password_credentials.totp_secret_enc is
  'Chiave dell''autenticatore (TOTP), CIFRATA con la stessa chiave della 2FA del CRM. Da qui il CRM genera il codice a 6 cifre invece di chiederlo a un telefono. Non esce mai dal server.';

-- password_credentials è già chiusa in lettura (using(false)): ci si passa solo
-- dal server. La chiave nuova non cambia nulla — nessuno la legge dal browser.
