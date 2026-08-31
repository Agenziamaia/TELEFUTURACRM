-- IL GUARDIANO DELLE TABELLE CHE DECIDONO CHI SEI (31/08).
--
-- Il revisore l'ha fatto davvero, con la sola chiave pubblica del browser:
--
--   update app_users set role='admin' where id='<il mio>'   → 1 riga
--   → e da lì: 18 caselle, 7.080 messaggi, tutto.
--
--   delete from role_permissions where perm_key='cap:/chat:codice_email'
--   insert into email_account_users (account_id, user_id) values (…)
--   → e la casella protetta si riapre.
--
-- Il muro l'avevamo messo nel posto giusto — `tf_mie_caselle()` — ma
-- l'INTERRUTTORE che lo accende era appeso fuori dalla porta: cinque tabelle
-- con la policy «basta essere loggati» e i permessi di scrittura dati a tutti.
--
-- ⚠️ PERCHÉ UN GUARDIANO E NON UNA POLICY PIÙ STRETTA. Perché dal browser
-- queste tabelle le scrivono 35 punti diversi del CRM — creare un utente,
-- assegnare un negozio, spostare un permesso, iscrivere qualcuno a una
-- casella. Chiudere la scrittura e basta vorrebbe dire riscrivere trentacinque
-- operazioni come rotte del server: settimane, e ogni riscrittura è
-- un'occasione di rompere qualcosa che oggi funziona. Il guardiano invece
-- lascia passare il lavoro di sempre e ferma solo quello che nessuno dovrebbe
-- fare — e lo fa nell'unico punto che il browser non può scavalcare.
--
-- ⚠️ E NON DECIDE DAL RUOLO DICHIARATO. Legge `tf_uid()`, cioè il
-- lasciapassare firmato dal server al login, e va a vedere nel database che
-- ruolo ha VERAMENTE quella persona. Un browser può dire quello che vuole.

-- ── chi sta scrivendo governa il CRM? ─────────────────────────────────────
/* ⚠️ NON SOLO admin e dev: nel CRM gli utenti li crea anche Franca, che è
   direttore generale, e l'amministrazione assegna negozi e permessi tutti i
   giorni. Sono esattamente i quattro ruoli che entrano in Amministrazione
   (`ADMINS + amministrativo` in nav.ts): fermarne uno significherebbe
   bloccare il lavoro di ogni giorno per chiudere una porta che per loro è
   già aperta dall'interfaccia.
   Il buco vero che si chiude è un altro: un venditore, un caller, un tecnico,
   un agente o uno store manager NON possono più promuoversi. */
create or replace function public.tf_e_governo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_users u
    where u.id = tf_uid() and coalesce(u.active, true)
      and u.role in ('admin', 'dev', 'direttore_generale', 'amministrativo'))
$$;

-- ── il server passa sempre ────────────────────────────────────────────────
/* Le rotte del CRM girano con la chiave di servizio (o, finché non è
   configurata, con quella pubblica ma FUORI dal browser). Là i controlli li
   fa il codice della rotta, che sa chi ha chiesto cosa: qui non si può
   distinguere e non si deve bloccare, altrimenti si ferma il CRM stesso. */
/* ⚠️ E LE DUE GUARDIE QUI SOTTO NON SONO `security definer`, che è la cosa
   meno ovvia di tutto il file. Dentro una funzione definer `current_user` è
   il PROPRIETARIO della funzione, non chi sta scrivendo: questa domanda
   avrebbe risposto «sì, sono il server» sempre, e il guardiano avrebbe
   lasciato passare ogni cosa. Provato: con definer, tutte e otto le scalate
   passavano lisce. */
create or replace function public.tf_e_il_server() returns boolean
language sql stable as $$ select current_user in ('service_role', 'postgres', 'supabase_admin') $$;

-- ═══ app_users — la scalata ═══════════════════════════════════════════════
create or replace function public.tf_guardia_utenti() returns trigger
language plpgsql set search_path = public as $$
begin
  if tf_e_il_server() or tf_e_governo() then return coalesce(new, old); end if;

  if tg_op = 'INSERT' then
    raise exception 'Solo un amministratore può creare un utente.';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Solo un amministratore può eliminare un utente.';
  end if;

  /* Restare si può — un collaboratore aggiorna il PROPRIO profilo (il nome
     che si vede in chat, l'immagine, il tema). Quello che non si può è
     toccare la propria posizione in azienda, o la riga di qualcun altro. */
  if old.id is distinct from tf_uid() then
    raise exception 'Puoi modificare solo il tuo profilo.';
  end if;
  if new.role      is distinct from old.role
     or new.grade  is distinct from old.grade
     or new.active is distinct from old.active
     or new.id     is distinct from old.id
     or new.primary_store is distinct from old.primary_store then
    raise exception 'Ruolo, grado, negozio e stato li cambia solo un amministratore.';
  end if;
  return new;
end $$;

drop trigger if exists tf_guardia on app_users;
create trigger tf_guardia before insert or update or delete on app_users
  for each row execute function tf_guardia_utenti();

-- ═══ role_permissions, user_stores, role_defs — gli interruttori ══════════
/* Qui non c'è niente che un non-admin debba poter scrivere: sono le tabelle
   che dicono chi vede cosa. Le tocca l'amministrazione dal pannello, e basta. */
create or replace function public.tf_guardia_permessi() returns trigger
language plpgsql set search_path = public as $$
begin
  if tf_e_il_server() or tf_e_governo() then return coalesce(new, old); end if;
  raise exception 'Questa impostazione la cambia solo un amministratore.';
end $$;

drop trigger if exists tf_guardia on role_permissions;
create trigger tf_guardia before insert or update or delete on role_permissions
  for each row execute function tf_guardia_permessi();

drop trigger if exists tf_guardia on user_stores;
create trigger tf_guardia before insert or update or delete on user_stores
  for each row execute function tf_guardia_permessi();

drop trigger if exists tf_guardia on role_defs;
create trigger tf_guardia before insert or update or delete on role_defs
  for each row execute function tf_guardia_permessi();

-- ═══ email_account_users — chi entra in una casella ═══════════════════════
/* È la terza gamba della scalata: iscrivendosi a una casella si aggirava il
   lucchetto senza toccare niente altro. */
drop trigger if exists tf_guardia on email_account_users;
create trigger tf_guardia before insert or update or delete on email_account_users
  for each row execute function tf_guardia_permessi();

comment on function public.tf_guardia_utenti() is
  'Impedisce dal browser di crearsi, cancellarsi o promuoversi: chi non governa il CRM può aggiornare solo il proprio profilo, e mai ruolo/grado/negozio/stato. Il server e i quattro ruoli di Amministrazione passano.';
comment on function public.tf_guardia_permessi() is
  'Le tabelle che decidono chi vede cosa le scrive solo un amministratore (o il server). Provato il 31/08: senza, un venditore cancellava il lucchetto della posta e si iscriveva alla casella protetta.';
