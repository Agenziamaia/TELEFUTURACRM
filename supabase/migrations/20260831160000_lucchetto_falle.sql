-- LE FALLE DEL LUCCHETTO, CHIUSE (31/08, revisione ostile).
--
-- Ho fatto verificare il lavoro di stamattina da un revisore con il compito di
-- ROMPERLO, non di confermarlo. Ha trovato tre strade che restituiscono la
-- posta protetta per intero, e due le ha percorse davvero. Il commento del
-- commit diceva «la protezione sta in tf_mie_caselle()»: la funzione fa quello
-- che promette, ma intorno le passano accanto.
--
-- Qui si chiudono le due che ho aperto io stamattina e quella che ho aperto
-- venerdì con l'AI. Le altre (bucket pubblico, rotte con la chiave di
-- servizio, tabelle di governo scrivibili) sono più vecchie e stanno in
-- migrazioni separate, perché toccano parti che vanno provate una per una.

-- ═══ ① LE FUNZIONI DEL CODICE ERANO APERTE A CHI NON HA NEMMENO FATTO LOGIN
--
-- Stamattina ho ricalcato il `grant … to anon` che c'era sulle vecchie
-- wa_codice_*. Era sbagliato allora e l'ho peggiorato: `create function` dà
-- già EXECUTE a PUBLIC, e nessuno l'aveva mai revocato.
--
-- Il revisore, con la sola chiave pubblica e SENZA login, ha:
--   · censito chi ha il lucchetto acceso  (codice_stato → {"impostato": true})
--   · CANCELLATO il codice di una persona (codice_azzera → ok, riga sparita)
--   · IMPOSTATO il codice della posta di un'altra (codice_imposta → ok)
-- e con codice_verifica poteva tenere il lucchetto bloccato all'infinito:
-- cinque tentativi sbagliati bloccano cinque minuti, ripetibili.
revoke all on function public.codice_stato(uuid, text)              from public, anon;
revoke all on function public.codice_imposta(uuid, text, text, text) from public, anon;
revoke all on function public.codice_verifica(uuid, text, text)     from public, anon;
revoke all on function public.codice_azzera(uuid, uuid, text)       from public, anon;
revoke all on function public.wa_codice_stato(uuid)                 from public, anon;
revoke all on function public.wa_codice_imposta(uuid, text, text)   from public, anon;
revoke all on function public.wa_codice_verifica(uuid, text)        from public, anon;
revoke all on function public.wa_codice_azzera(uuid, uuid)          from public, anon;

grant execute on function public.codice_stato(uuid, text)              to authenticated, service_role;
grant execute on function public.codice_imposta(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.codice_verifica(uuid, text, text)     to authenticated, service_role;
grant execute on function public.codice_azzera(uuid, uuid, text)       to authenticated, service_role;
/* ⚠️ E queste QUATTRO SERVONO: un browser aperto da stamattina chiama ancora
   i nomi vecchi. wa_codice_azzera in particolare non aveva mai avuto il grant
   ad authenticated — cioè l'inoltro tenuto apposta per non rompere nessuno
   dava «permission denied» proprio a chi doveva servire. */
grant execute on function public.wa_codice_stato(uuid)               to authenticated, service_role;
grant execute on function public.wa_codice_imposta(uuid, text, text) to authenticated, service_role;
grant execute on function public.wa_codice_verifica(uuid, text)      to authenticated, service_role;
grant execute on function public.wa_codice_azzera(uuid, uuid)        to authenticated, service_role;

-- ═══ ② «LA PROVA LA FA IL DATABASE» — NON ERA VERO
--
-- Il commento di codice_azzera diceva: «la prova che chi clicca è un admin la
-- fa il DATABASE, non il browser che lo dichiara». Ma controllava il ruolo di
-- `p_admin`, che è un PARAMETRO passato dal browser: bastava passare l'uuid di
-- un admin — che chiunque legge da app_users — per azzerare il codice di
-- chiunque. Adesso l'identità viene dal lasciapassare firmato e basta.
--
-- Stessa cosa per gli altri tre: `p_user` diceva su CHI si opera, e nessuno
-- verificava che fosse chi sta chiedendo. Il codice della posta di un collega
-- si poteva impostare, verificare e bloccare.
create or replace function public.codice_stato(p_user uuid, p_canale text default 'whatsapp')
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  if tf_uid() is null or p_user is distinct from tf_uid() then
    return json_build_object('impostato', false, 'errore', 'Non sei tu.');
  end if;
  select * into r from codice_accesso where user_id = p_user and canale = p_canale;
  return json_build_object(
    'impostato', r.user_id is not null,
    'bloccato_fino', case when r.bloccato_fino > now() then r.bloccato_fino else null end);
end $$;

create or replace function public.codice_imposta(p_user uuid, p_codice text,
                                                 p_canale text default 'whatsapp',
                                                 p_vecchio text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  if tf_uid() is null or p_user is distinct from tf_uid() then
    return json_build_object('ok', false, 'errore', 'Il codice lo può scegliere solo il diretto interessato.');
  end if;
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
       set impronta = crypt(btrim(p_codice), gen_salt('bf', 10)),
           aggiornato_il = now(), tentativi = 0, bloccato_fino = null
     where user_id = p_user and canale = p_canale;
  else
    /* ⚠️ COSTO 10, non il 6 di prima. Il revisore ha portato via un'impronta
       dal database e ha fatto notare che bcrypt a costo 6 su un codice di
       quattro cifre si rompe offline in pochi secondi. La strada per portarla
       via è chiusa qui sotto, ma un'impronta debole è debole comunque. */
    insert into codice_accesso (user_id, canale, impronta, sale)
    values (p_user, p_canale, crypt(btrim(p_codice), gen_salt('bf', 10)), null);
  end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.codice_verifica(p_user uuid, p_codice text,
                                                  p_canale text default 'whatsapp')
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r record; buono boolean;
begin
  if tf_uid() is null or p_user is distinct from tf_uid() then
    return json_build_object('ok', false, 'errore', 'Non sei tu.');
  end if;
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

create or replace function public.codice_azzera(p_user uuid, p_admin uuid default null,
                                                p_canale text default 'whatsapp')
returns json language plpgsql security definer set search_path = public, extensions as $$
declare ruolo text;
begin
  /* `p_admin` resta nella firma perché il browser lo manda ancora, ma NON si
     usa più: l'identità si legge dal lasciapassare. Un parametro che dichiara
     chi sei non è una prova di niente. */
  select role into ruolo from app_users where id = tf_uid() and active;
  if ruolo is null or ruolo not in ('admin', 'dev') then
    return json_build_object('ok', false, 'errore', 'Solo un amministratore può azzerare il codice.');
  end if;
  delete from codice_accesso where user_id = p_user and canale = p_canale;
  return json_build_object('ok', true);
end $$;

-- gli inoltri si riallineano alle firme nuove
create or replace function public.wa_codice_azzera(p_user uuid, p_admin uuid)
returns json language sql security definer set search_path = public
as $$ select public.codice_azzera(p_user, p_admin, 'whatsapp') $$;

-- ═══ ③ L'AI LEGGEVA LA POSTA PROTETTA SCAVALCANDO OGNI REGOLA
--
-- Questa è la peggiore, ed è mia, di venerdì. `ai.interroga` gira come
-- `ai_lettore`, e quel ruolo ha `bypassrls`: dentro quella funzione le regole
-- delle tabelle non esistono proprio, e tf_mie_caselle() non viene nemmeno
-- consultata. Avevo chiuso `email_accounts` — e infatti quella era negata —
-- ma non i MESSAGGI. Il revisore ha chiesto all'assistente gli ultimi
-- messaggi e si è portato via la posta di amministrazione@, il WhatsApp
-- protetto (3.371 messaggi) e perfino le impronte dei codici.
--
-- Chiunque abbia l'Assistente AI poteva farlo scrivendo una frase in italiano.
revoke all on table
  public.email_messages, public.email_conversations, public.email_drafts,
  public.email_triage, public.email_regole_utente, public.email_mittenti_bloccati,
  public.email_account_users,
  public.wa_messages, public.wa_conversations, public.wa_instances, public.wa_triage,
  public.codice_accesso
  from ai_lettore, ai_lettore_admin;

/* ⚠️ E ANCHE ALL'ADMIN. Sembra una limitazione eccessiva — l'admin la posta
   la vede dall'Inbox — ma è il punto: la vede DALL'INBOX, dove è posta di
   qualcuno. Un assistente che riassume «di cosa parlano» le caselle di tutti
   è esattamente la cosa che il lucchetto doveva impedire, e la porta
   dell'admin non deve essere una porta senza limiti (già imparato il 31/08
   con le password). */

/* E che non tornino dalla finestra: senza questo, una tabella email creata
   domani nascerebbe leggibile, perché `alter default privileges` di venerdì
   dà select su tutto il nuovo. */
alter default privileges in schema public revoke select on tables from ai_lettore_admin;
