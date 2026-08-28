-- I CODICI USA E GETTA (Luca 28/08 sera).
--
-- Fastweb non si accontenta di utente e password: manda un codice via email, a
-- caselle diverse per ogni utenza. Oggi il collaboratore dovrebbe avere accesso
-- a QUELLA casella per leggerselo — cioè avere in mano molto più di un codice.
--
-- Da qui: il CRM tiene le caselle, e il codice lo consegna su richiesta, uno
-- alla volta, a chi ha diritto di vedere quella credenziale. Il codice non si
-- salva da nessuna parte: si legge dalla posta al momento e si mostra per un
-- minuto. Nel registro resta CHI l'ha chiesto e QUANDO, mai il codice.

-- ── LE CASELLE DI SERVIZIO ───────────────────────────────────────────────
-- Caselle che non appartengono a nessuno e non sono di nessun negozio:
-- esistono solo perché ci arrivano i codici. Non devono comparire nella posta
-- di nessuno — nemmeno dell'admin, che le governa dal pannello.
alter table email_accounts
  add column if not exists uso_sistema boolean not null default false;

comment on column email_accounts.uso_sistema is
  'Casella di servizio (codici OTP): niente inbox, niente contatori, niente storico messaggi. Si governa dal pannello Amministrazione → Email.';

-- ── DOVE ARRIVA IL CODICE DI QUESTA UTENZA ───────────────────────────────
-- Una credenziale sa da quale casella arriva il suo codice e con che formato
-- è scritto (il profilo: mittente atteso + come si riconosce il numero).
alter table password_credentials
  add column if not exists otp_account_id uuid references email_accounts (id) on delete set null;
alter table password_credentials
  add column if not exists otp_profilo text;

comment on column password_credentials.otp_account_id is
  'Casella email su cui arriva il codice usa e getta di questa utenza.';
comment on column password_credentials.otp_profilo is
  'Formato della mail del codice (vedi src/lib/otpProfili.ts): fastweb_core, fastweb_energia, …';

create index if not exists password_credentials_otp on password_credentials (otp_account_id)
  where otp_account_id is not null;

-- ── LA CASSAFORTE RESTA CHIUSA ───────────────────────────────────────────
-- password_credentials è già `using(false)`: ci si passa solo dal server. Le
-- colonne nuove non cambiano nulla — nessuno le legge dal browser.
