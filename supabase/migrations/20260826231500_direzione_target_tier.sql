-- DIREZIONE — il target ricorda la SOGLIA di provenienza (Luca 26/08
-- notte-7: «imposto lo sfrido e non mi ricalcola il target dal click»):
-- tier = numero della soglia cliccata (NULL = target scritto a mano).
-- Al cambio di sfrido, i target con tier si ricalcolano da soli.
alter table direzione_targets add column if not exists tier int;
