-- UN CODICE PER CANALE (Luca 31/08).
--
-- «Come il WhatsApp Protetto, ma per l'email. Un codice per canale,
--  accendibili separatamente: posso volere l'email sotto codice e il
--  WhatsApp no, o il contrario.»
--
-- Fin qui il lucchetto era cablato su WhatsApp: `wa_codice_accesso` aveva
-- `user_id` come chiave primaria, cioè UN codice a testa e uno solo. Qui la
-- tabella impara che i canali sono più d'uno.
--
-- ⚠️ PERCHÉ DUE CODICI DIVERSI E NON UNO SOLO PER PERSONA. Perché sono due
-- decisioni diverse: si accendono, si spengono e si azzerano una per una.
-- Un codice unico avrebbe legato le due cose per sempre — spegnere il
-- lucchetto di WhatsApp avrebbe aperto anche la posta.
--
-- Il resto non cambia: il codice se lo sceglie la persona, nel database c'è
-- solo l'impronta bcrypt, la tabella è chiusa anche alla chiave pubblica, il
-- confronto lo fa il database, cinque tentativi sbagliati = cinque minuti di
-- stop. Se lo dimentica, un admin lo azzera — su QUEL canale.

-- ── la tabella impara il canale ────────────────────────────────────────────
alter table if exists wa_codice_accesso rename to codice_accesso;

alter table codice_accesso add column if not exists canale text not null default 'whatsapp';

do $$ begin
  /* la vecchia chiave era solo user_id: adesso una persona può avere una riga
     per canale. Le righe che già esistono sono di WhatsApp — il default della
     colonna le ha già etichettate. */
  if exists (select 1 from pg_constraint
             where conname = 'wa_codice_accesso_pkey' and conrelid = 'codice_accesso'::regclass) then
    alter table codice_accesso drop constraint wa_codice_accesso_pkey;
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'codice_accesso_pkey' and conrelid = 'codice_accesso'::regclass) then
    alter table codice_accesso add constraint codice_accesso_pkey primary key (user_id, canale);
  end if;
end $$;

/* ⚠️ CON LA GUARDIA: era l'unica istruzione del file senza, e alla seconda
   passata la migrazione si piantava qui — dopo aver già fatto il rename e la
   colonna. Una migrazione che non si può rieseguire è una migrazione che, il
   giorno che serve, non gira. */
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname = 'codice_accesso_canale_noto' and conrelid = 'codice_accesso'::regclass) then
    alter table codice_accesso add constraint codice_accesso_canale_noto
      check (canale in ('whatsapp', 'email')) not valid;
    alter table codice_accesso validate constraint codice_accesso_canale_noto;
  end if;
end $$;

-- la porta resta chiusa a chiave: l'impronta non si legge dal browser
alter table codice_accesso enable row level security;
drop policy if exists wa_codice_nessuno on codice_accesso;
drop policy if exists codice_nessuno on codice_accesso;
create policy codice_nessuno on codice_accesso for all to public using (false) with check (false);

-- ── le funzioni, ora con il canale ─────────────────────────────────────────
create or replace function public.codice_stato(p_user uuid, p_canale text default 'whatsapp')
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  select * into r from codice_accesso where user_id = p_user and canale = p_canale;
  return json_build_object(
    'impostato', r.user_id is not null,
    'bloccato_fino', case when r.bloccato_fino > now() then r.bloccato_fino else null end);
end $$;

/* SI IMPOSTA UNA VOLTA SOLA: se c'è già, si cambia solo conoscendo il vecchio
   (o dopo che l'admin l'ha azzerato). Minimo quattro caratteri. */
create or replace function public.codice_imposta(p_user uuid, p_codice text,
                                                 p_canale text default 'whatsapp',
                                                 p_vecchio text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  if p_codice is null or length(btrim(p_codice)) < 4 then
    return json_build_object('ok', false, 'errore', 'Il codice deve avere almeno 4 caratteri.');
  end if;
  if p_canale not in ('whatsapp', 'email') then
    return json_build_object('ok', false, 'errore', 'Canale non riconosciuto.');
  end if;
  select * into r from codice_accesso where user_id = p_user and canale = p_canale;
  if r.user_id is not null then
    if p_vecchio is null or r.impronta <> crypt(p_vecchio, r.impronta) then
      return json_build_object('ok', false, 'errore', 'Codice attuale sbagliato.');
    end if;
    update codice_accesso
       set impronta = crypt(btrim(p_codice), gen_salt('bf')),
           aggiornato_il = now(), tentativi = 0, bloccato_fino = null
     where user_id = p_user and canale = p_canale;
  else
    insert into codice_accesso (user_id, canale, impronta, sale)
    values (p_user, p_canale, crypt(btrim(p_codice), gen_salt('bf')), null);
  end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.codice_verifica(p_user uuid, p_codice text,
                                                  p_canale text default 'whatsapp')
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r record; buono boolean;
begin
  select * into r from codice_accesso where user_id = p_user and canale = p_canale;
  if r.user_id is null then
    return json_build_object('ok', false, 'errore', 'Nessun codice impostato.');
  end if;
  if r.bloccato_fino is not null and r.bloccato_fino > now() then
    return json_build_object('ok', false, 'bloccato_fino', r.bloccato_fino,
                             'errore', 'Troppi tentativi: riprova fra qualche minuto.');
  end if;
  buono := r.impronta = crypt(coalesce(btrim(p_codice), ''), r.impronta);
  if buono then
    update codice_accesso set tentativi = 0, bloccato_fino = null, ultimo_ok_il = now()
     where user_id = p_user and canale = p_canale;
    return json_build_object('ok', true);
  end if;
  update codice_accesso
     set tentativi = r.tentativi + 1,
         bloccato_fino = case when r.tentativi + 1 >= 5 then now() + interval '5 minutes' else null end
   where user_id = p_user and canale = p_canale;
  return json_build_object('ok', false,
    'rimasti', greatest(0, 5 - (r.tentativi + 1)),
    'bloccato_fino', case when r.tentativi + 1 >= 5 then now() + interval '5 minutes' else null end,
    'errore', 'Codice sbagliato.');
end $$;

/* AZZERAMENTO: solo admin o dev, e la prova la fa il database — non il
   browser che lo dichiara. Azzera UN canale per volta: chi dimentica il
   codice della posta non perde anche quello di WhatsApp. */
create or replace function public.codice_azzera(p_user uuid, p_admin uuid,
                                                p_canale text default 'whatsapp')
returns json language plpgsql security definer set search_path = public, extensions as $$
declare ruolo text;
begin
  select role into ruolo from app_users where id = p_admin and active;
  if ruolo is null or ruolo not in ('admin', 'dev') then
    return json_build_object('ok', false, 'errore', 'Solo un amministratore può azzerare il codice.');
  end if;
  delete from codice_accesso where user_id = p_user and canale = p_canale;
  return json_build_object('ok', true);
end $$;

-- ── i vecchi nomi restano, e inoltrano ─────────────────────────────────────
/* Un browser con la pagina aperta da stamattina chiama ancora `wa_codice_*`.
   Cancellarle voleva dire romperlo a metà giornata: restano, e passano dalle
   nuove col canale 'whatsapp'. */
create or replace function public.wa_codice_stato(p_user uuid)
returns json language sql security definer set search_path = public
as $$ select public.codice_stato(p_user, 'whatsapp') $$;

create or replace function public.wa_codice_imposta(p_user uuid, p_codice text, p_vecchio text default null)
returns json language sql security definer set search_path = public
as $$ select public.codice_imposta(p_user, p_codice, 'whatsapp', p_vecchio) $$;

create or replace function public.wa_codice_verifica(p_user uuid, p_codice text)
returns json language sql security definer set search_path = public
as $$ select public.codice_verifica(p_user, p_codice, 'whatsapp') $$;

create or replace function public.wa_codice_azzera(p_user uuid, p_admin uuid)
returns json language sql security definer set search_path = public
as $$ select public.codice_azzera(p_user, p_admin, 'whatsapp') $$;

grant execute on function public.codice_stato(uuid, text)            to anon, authenticated;
grant execute on function public.codice_imposta(uuid, text, text, text) to anon, authenticated;
grant execute on function public.codice_verifica(uuid, text, text)   to anon, authenticated;
grant execute on function public.codice_azzera(uuid, uuid, text)     to anon, authenticated;

comment on table codice_accesso is
  'Il lucchetto davanti a un canale personale (WhatsApp, Email). Una riga per persona E per canale: si accendono e si azzerano separatamente. Contiene solo l''impronta bcrypt — il codice non è rileggibile da nessuno, admin compreso.';
