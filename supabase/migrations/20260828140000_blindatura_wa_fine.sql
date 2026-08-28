-- BLINDATURA FASE C (Luca 28/08) — «non solo gli estranei: anche tra colleghi».
--
-- Fin qui le tabelle WhatsApp erano chiuse a chi non ha fatto login. Restava
-- che un dipendente loggato, interrogando il database, vedesse le chat di
-- tutti — e la linea del tempo reale consegnava a chiunque i messaggi altrui
-- (notifica di un numero non suo, segnalata da Francesco).
--
-- Qui la regola diventa quella VERA: ognuno vede solo le conversazioni dei
-- numeri che gli spettano, con le stesse regole dell'interfaccia:
--   · il numero PERSONALE lo vede solo il titolare (e l'admin)
--   · il numero di NEGOZIO lo vedono quelli di quel negozio
--   · i perimetri della rotellina (tutti / call center / agenti / tutti i
--     negozi) allargano, ma NON aprono mai i numeri protetti da lucchetto
--   · lo store manager vede i numeri del suo negozio, come da sempre

-- ── chi sta chiedendo (dal lasciapassare) ────────────────────────────────
-- robusta per costruzione: qualunque cosa non torni (claim assente, testo
-- non valido, id malformato) → NULL, cioè «nessuno» — mai un'apertura
create or replace function tf_uid() returns uuid
language plpgsql stable as $$
declare v text; begin
  v := nullif(current_setting('request.jwt.claims', true), '');
  if v is null then return null; end if;
  return nullif(v::json ->> 'tf_uid', '')::uuid;
exception when others then return null;
end $$;

-- ── il reparto di un ruolo (specchio di roles.ts; i ruoli creati da UI
--    hanno la loro area in role_defs) ─────────────────────────────────────
create or replace function tf_area(p_role text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select rd.area from role_defs rd where rd.id = p_role limit 1),
    case p_role
      when 'venditore' then 'pv' when 'store_manager' then 'pv'
      when 'direttore_commerciale' then 'pv' when 'tecnico' then 'pv'
      when 'caller' then 'cc' when 'back_office_caller' then 'cc'
      when 'direttore_cc' then 'cc'
      when 'agente' then 'ob' when 'direttore_ob' then 'ob'
      when 'amministrativo' then 'sede' when 'direttore_generale' then 'sede'
      when 'admin' then 'sede' when 'dev' then 'sede'
      else 'pv' end)
$$;

-- ── una scelta della rotellina, per l'utente corrente: prima l'override
--    personale, poi quello del ruolo, poi il valore di partenza ───────────
create or replace function tf_cap(p_uid uuid, p_role text, p_key text, p_default boolean)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select rp.allowed from role_permissions rp where rp.role = 'user:' || p_uid::text and rp.perm_key = p_key limit 1),
    (select rp.allowed from role_permissions rp where rp.role = p_role and rp.perm_key = p_key limit 1),
    p_default)
$$;

-- ── I NUMERI WHATSAPP CHE L'UTENTE CORRENTE PUÒ VEDERE ───────────────────
create or replace function tf_wa_istanze() returns setof uuid
language sql stable security definer set search_path = public as $$
  with me as (
    select u.id, u.role, u.primary_store
    from app_users u where u.id = tf_uid() and coalesce(u.active, true)
  ),
  -- i negozi della persona: quello principale più quelli in visibilità
  miei as (
    select lower(trim(m.primary_store)) n from me m where coalesce(m.primary_store,'') <> ''
    union
    select lower(trim(us.store_name)) from user_stores us join me m on us.user_id = m.id
  ),
  -- i titolari con il LUCCHETTO acceso: i loro numeri personali non li vede
  -- nessun altro, per nessun motivo (salvo admin)
  protetti as (
    select u.id from app_users u
    where tf_cap(u.id, u.role, 'cap:/chat:codice', false)
  ),
  scelte as (
    select
      (select id from me) uid,
      (select role from me) role,
      tf_cap((select id from me), (select role from me), 'cap:/chat:wa_tutti', false) tutti,
      tf_cap((select id from me), (select role from me), 'cap:/chat:wa_negozi_tutti', false) neg_tutti,
      tf_cap((select id from me), (select role from me), 'cap:/chat:wa_cc', false) cc,
      tf_cap((select id from me), (select role from me), 'cap:/chat:wa_agenti', false) agenti
  )
  select i.id
  from wa_instances i, scelte s
  where s.uid is not null and (
      -- admin e dev: tutto, lucchetti compresi (sono loro a governarli)
      s.role in ('admin','dev')
      or (
        -- il lucchetto batte qualunque perimetro
        (i.owner_user_id is null or i.owner_user_id = s.uid
         or i.owner_user_id not in (select id from protetti))
        and (
          -- il mio numero personale
          i.owner_user_id = s.uid
          -- un numero di negozio, se quel negozio è tra i miei
          or (i.owner_user_id is null and exists (
                select 1 from miei mm
                where mm.n = any (string_to_array(lower(replace(coalesce(i.negozio,''), ', ', ',')), ','))
                   or mm.n = lower(trim(coalesce(i.display_name,'')))
                   -- gemelli della stessa sede (Magliana W3 / Magliana Multi)
                   or split_part(mm.n, ' ', 1) = split_part(lower(trim(coalesce(i.negozio,''))), ' ', 1)
              ))
          -- store manager: tutti i numeri del suo negozio, anche personali dei suoi
          or (s.role = 'store_manager' and exists (
                select 1 from miei mm
                where split_part(mm.n, ' ', 1) = split_part(lower(trim(coalesce(i.negozio,''))), ' ', 1)
              ))
          -- i perimetri allargati della rotellina
          or s.tutti
          or (s.neg_tutti and i.owner_user_id is null)
          or (s.cc and tf_area((select role from app_users where id = i.owner_user_id)) = 'cc')
          or (s.agenti and tf_area((select role from app_users where id = i.owner_user_id)) = 'ob')
        )
      )
  )
$$;

-- ── LE REGOLE VERE sulle due tabelle ─────────────────────────────────────
drop policy if exists tf_blindata on wa_conversations;
create policy tf_blindata on wa_conversations for all
  using (instance_id in (select tf_wa_istanze()))
  with check (instance_id in (select tf_wa_istanze()));

drop policy if exists tf_blindata on wa_messages;
create policy tf_blindata on wa_messages for all
  using (conversation_id in (select id from wa_conversations where instance_id in (select tf_wa_istanze())))
  with check (conversation_id in (select id from wa_conversations where instance_id in (select tf_wa_istanze())));
