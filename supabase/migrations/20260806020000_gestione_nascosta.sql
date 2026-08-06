-- NUOVO DISEGNO ELIMINAZIONI (Luca 06/08): il cestino di Gestione PDA non
-- elimina più niente — NASCONDE la pratica dalla sola scrivania Gestione,
-- la vendita resta intatta in Ricerca Vendite (e ovunque altrove).
-- Stesso pattern del cestino Tracking (tracking_nascosto, mig. 20260803000021):
-- un flag sulla riga contratto, la vista lo filtra.
alter table public.contracts
  add column if not exists nascosta_gestione boolean not null default false;

notify pgrst, 'reload schema';
