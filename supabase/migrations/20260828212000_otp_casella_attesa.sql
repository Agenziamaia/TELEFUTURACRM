-- «SI AGGANCIA DA SOLA APPENA LA COLLEGHI» (Luca 28/08 sera).
--
-- La mappa utenza → casella arriva dall'operatore ed è nota da subito; le
-- caselle invece si collegano una alla volta, quando si hanno le credenziali.
-- Senza questa colonna bisognerebbe ricordarsi di tornare su ogni utenza dopo
-- aver collegato la casella — e uno se ne scorda, e il pulsante non funziona
-- senza che nessuno capisca perché.
--
-- Qui l'attesa è scritta: il giorno che quella casella entra nel CRM, le
-- utenze che l'aspettano si agganciano da sole.
alter table password_credentials
  add column if not exists otp_email_attesa text;

comment on column password_credentials.otp_email_attesa is
  'Indirizzo su cui questa utenza aspetta i codici, finché la casella non è collegata: al collegamento l''aggancio è automatico e questo campo si svuota.';

create index if not exists password_credentials_otp_attesa
  on password_credentials (lower(otp_email_attesa))
  where otp_email_attesa is not null;
