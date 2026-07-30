-- 102: verifica in due passaggi (2FA) con app authenticator (TOTP).
-- Segreto TOTP cifrato a riposo (AES-256-GCM, stessa chiave delle caselle email).
-- totp_enabled=false finche' l'utente non completa l'iscrizione scansionando il QR
-- e confermando un codice. Reset (telefono perso) = admin rimette enabled=false.
alter table public.app_users
  add column if not exists totp_secret  text,
  add column if not exists totp_enabled boolean not null default false;

notify pgrst, 'reload schema';
