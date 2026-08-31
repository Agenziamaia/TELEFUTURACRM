-- LE TRE CODE SCOPERTE (31/08, revisione ostile).
--
-- Il lucchetto sulla posta reggeva, e intorno restavano tre fessure. Nessuna
-- delle tre è spettacolare come le altre: sono esattamente il genere di cosa
-- che si dimentica, e che fra sei mesi rende inutile tutto il resto.

-- ═══ ① IL RIASSUNTO DELLA POSTA ERA SCOPERTO ══════════════════════════════
--
-- `email_triage.azione` è la frase con cui l'AI riassume ogni email:
--   «Cliente invia modulo e fatture per disdetta Sky/utenze»
--   «Massimo chiede indicazioni su fattura Vodafone allegata»
--   «Da leggere: OTP Fastweb per accesso ai sistemi»
-- Sono 1.398 righe, e la policy era «basta essere loggati». Provato dal
-- revisore: con il lucchetto acceso la casella dava 0 messaggi, e leggendo
-- QUESTA tabella si avevano lo stesso i riassunti di quelle conversazioni.
--
-- Il lucchetto copriva la posta e lasciava scoperto il riassunto della posta.
-- Passano dalla stessa funzione di tutto il resto.

drop policy if exists tf_blindata on email_triage;
create policy tf_blindata on email_triage for all
  using (conversation_id in (select id from email_conversations where account_id in (select tf_mie_caselle())))
  with check (conversation_id in (select id from email_conversations where account_id in (select tf_mie_caselle())));

/* Le bozze: oggi la tabella è vuota, ma è la mail che uno sta ancora
   scrivendo — cioè la cosa più privata che ci sia in una casella. */
drop policy if exists tf_blindata on email_drafts;
create policy tf_blindata on email_drafts for all
  using (account_id in (select tf_mie_caselle()))
  with check (account_id in (select tf_mie_caselle()));

/* Le regole personali: portano fuori quali mittenti una casella filtra. */
drop policy if exists tf_blindata on email_regole_utente;
create policy tf_blindata on email_regole_utente for all
  using (account_id in (select tf_mie_caselle()))
  with check (account_id in (select tf_mie_caselle()));

/* `email_mittenti_bloccati` NON si tocca: non ha una casella: è l'elenco
   aziendale dei mittenti indesiderati, uguale per tutti. Sapere che
   «newsletter@qualcosa» è bloccata non dice niente della posta di nessuno. */

-- ═══ ② `tf_cap` NON CONOSCEVA I GRADI ═════════════════════════════════════
--
-- Il browser risolve un permesso a tre livelli — ruolo, poi `ruolo@grado`,
-- poi la persona — e in `role_permissions` ci sono già 27 righe scritte su un
-- grado. Il database ne guardava due: saltava il grado.
--
-- Conseguenza silenziosa, e per questo brutta: accendendo «Posta Protetta»
-- su un GRADO, il browser mostrava il lucchetto e il database non nascondeva
-- niente. Nessun errore da nessuna parte: solo due opinioni diverse sulla
-- stessa domanda.

create or replace function public.tf_cap(p_uid uuid, p_role text, p_key text, p_default boolean)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    -- la PERSONA vince su tutto
    (select rp.allowed from role_permissions rp
      where rp.role = 'user:' || p_uid::text and rp.perm_key = p_key limit 1),
    -- poi il GRADO — il livello che mancava, e che il browser usa da sempre
    (select rp.allowed from role_permissions rp
      where rp.role = p_role || '@' || (select u.grade from app_users u where u.id = p_uid)
        and rp.perm_key = p_key limit 1),
    -- poi il RUOLO
    (select rp.allowed from role_permissions rp
      where rp.role = p_role and rp.perm_key = p_key limit 1),
    p_default)
$$;

comment on function public.tf_cap(uuid, text, text, boolean) is
  'Il valore di una capacità per una persona: PERSONA > GRADO > RUOLO > valore di fabbrica. Stessa precedenza di usePermissions nel browser — il grado è stato aggiunto il 31/08, prima il database lo saltava e schermo e dati potevano dire cose diverse.';

-- ═══ ③ SE IL TITOLARE SPARISCE, IL LUCCHETTO SI APRE DA SOLO ══════════════
--
-- `email_accounts.owner_user_id` è ON DELETE SET NULL: cancellato l'utente,
-- la casella resta senza titolare, il primo ramo di `tf_mie_caselle` passa, e
-- la posta protetta torna visibile a direzione e amministrazione. È lo
-- scenario «la persona se ne va», cioè proprio quello in cui la sua casella
-- andrebbe trattata con più cura, non con meno.
--
-- (Disattivare un utente invece va già bene: `protetti` non guarda `active`,
--  e la casella resta chiusa. Era la scelta prudente giusta.)
--
-- Qui non si cambia la chiave esterna — cambiarla vorrebbe dire un errore
-- incomprensibile in faccia a chi cancella. Si aggiunge una riga alla guardia
-- che già esiste su app_users, con un messaggio che dice cosa fare.

create or replace function public.tf_guardia_utenti() returns trigger
language plpgsql set search_path = public as $$
declare quante int;
begin
  if tg_op = 'DELETE' then
    /* ⚠️ prima di tutto, e anche per gli admin: una casella orfana torna
       visibile a chi il lucchetto doveva escludere. Si riassegna, poi si
       cancella. */
    select count(*) into quante from email_accounts where owner_user_id = old.id;
    if quante > 0 then
      raise exception 'Questa persona è titolare di % casella/e email: riassegnale dal pannello Email prima di eliminarla.', quante;
    end if;
  end if;

  if tf_e_il_server() or tf_e_governo() then return coalesce(new, old); end if;

  if tg_op = 'INSERT' then
    raise exception 'Solo un amministratore può creare un utente.';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Solo un amministratore può eliminare un utente.';
  end if;

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
