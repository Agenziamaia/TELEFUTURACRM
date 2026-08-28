-- IL MODELLO SCELTO DALL'UTENTE (Luca 28/08 sera).
-- L'admin decide il modello di ciascuno dal pannello Permessi; a chi ha il
-- permesso «può cambiare il proprio modello» si lascia scegliere qui. Vuoto =
-- vale quello deciso dall'amministrazione (e in mancanza, quello di sistema).
alter table ai_preferenze add column if not exists modello text;
comment on column ai_preferenze.modello is 'Modello AI scelto dall''utente, se autorizzato. Vuoto = quello impostato dall''amministrazione.';