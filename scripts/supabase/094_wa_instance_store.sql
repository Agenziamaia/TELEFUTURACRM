-- Modello "un numero per caller": ogni numero (istanza) appartiene a un utente
-- (owner_user_id). Per far vedere allo store manager i numeri del PROPRIO negozio
-- senza join costosi lato client, denormalizziamo qui il negozio del proprietario.
-- Alla creazione del numero lo impostiamo dal primary_store dell'owner (route).

alter table wa_instances add column if not exists negozio text;
comment on column wa_instances.negozio is 'Negozio del proprietario del numero (visibilita'' store manager). Denormalizzato da app_users.primary_store alla creazione.';

-- backfill per i numeri gia' esistenti
update wa_instances wi
   set negozio = au.primary_store
  from app_users au
 where au.id = wi.owner_user_id
   and wi.negozio is null;
