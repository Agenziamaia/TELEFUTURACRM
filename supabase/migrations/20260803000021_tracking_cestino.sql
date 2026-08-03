-- Cestino del Tracking PDA (Luca 03/08): una pratica puo' essere nascosta
-- SOLO dal tracking (resta in Ricerca Vendite). L'eliminazione totale invece
-- cancella proprio la riga di contracts, quindi non serve una colonna.
alter table contracts add column if not exists tracking_nascosto boolean not null default false;
