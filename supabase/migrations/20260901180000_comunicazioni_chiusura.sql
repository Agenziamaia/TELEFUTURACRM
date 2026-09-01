-- ═══════════════════════════════════════════════════════════════════════════
-- LA PORTA ERA CHIUSA, LA FINESTRA NO — 01/09/2026, sera
--
-- Stamattina ho tolto il diritto di CANCELLARE le comunicazioni dal browser e
-- messo la regola dell'admin + dieci minuti. La revisione di fine giornata ha
-- mostrato che la si aggirava in due modi, senza toccare la cancellazione:
--
--  ① RISCRIVENDOSI AUTORE. `anon` e `authenticated` avevano UPDATE su TUTTE le
--     colonne, comprese `created_by` e `created_at`. Bastava, dalla console:
--     mettersi il proprio id come autore e la data a adesso, e poi chiamare
--     l'API — che a quel punto vede «è tua» ed «è appena scritta» e la
--     cancella. La regola c'era e si scavalcava in due mosse.
--  ② SVUOTANDOLA. Senza cancellare niente: `update` su `title` e `content` e
--     la comunicazione resta lì, vuota. Per chi la legge è sparita lo stesso.
--
--  ③ E LE CANCELLAZIONI NON FINIVANO TUTTE NEL REGISTRO. Il trigger era su
--     INSERT e UPDATE soltanto: una DELETE fatta fuori dall'API — con la
--     chiave di servizio, o da una strada che scriveremo domani — non lasciava
--     traccia. La prova sta nei dati: la comunicazione 73, creata e cancellata
--     oggi, nel registro ha solo la riga «creata».
--
-- QUI SI CHIUDONO TUTTI E TRE. L'autore e la data di nascita di una
-- comunicazione diventano immutabili; il registro annota anche le
-- cancellazioni, da qualunque parte arrivino, tenendo dentro di sé il testo
-- che c'era; e su UPDATE si annota il testo PRIMA della modifica, che è
-- l'unico utile per ricostruire.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① e ② L'AUTORE E LA DATA NON SI RISCRIVONO ─────────────────────────────
create or replace function public.comunicazioni_immutabili()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  begin
    v_uid := nullif((current_setting('request.jwt.claims', true)::json ->> 'tf_uid'), '')::uuid;
  exception when others then
    v_uid := null;
  end;

  -- il server (chiave di servizio) non ha tf_uid: a lui non si mette il
  -- bavaglio, perché è la strada che deve poter riparare.
  if v_uid is null then return new; end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'l''autore di una comunicazione non si cambia';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'la data di una comunicazione non si cambia';
  end if;
  /* SVUOTARE UNA COMUNICAZIONE È CANCELLARLA, e passa dalla stessa porta:
     se non si è più padroni di toglierla, non lo si è nemmeno di azzerarla. */
  if coalesce(btrim(new.title), '') = '' and coalesce(btrim(old.title), '') <> '' then
    raise exception 'per togliere una comunicazione si usa il cestino, non si svuota il titolo';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_comunicazioni_immutabili on public.comunicazioni;
create trigger trg_comunicazioni_immutabili
  before update on public.comunicazioni
  for each row execute function public.comunicazioni_immutabili();

-- ── ③ IL REGISTRO ANNOTA ANCHE LE CANCELLAZIONI ────────────────────────────
create or replace function public.comunicazioni_registra_uscita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid;
  v_nome text;
  v_let  integer;
begin
  begin
    v_uid := nullif((current_setting('request.jwt.claims', true)::json ->> 'tf_uid'), '')::uuid;
  exception when others then
    v_uid := null;
  end;
  if v_uid is not null then
    select full_name into v_nome from app_users where id = v_uid;
  end if;

  /* QUANTE L'AVEVANO LETTA: si conta adesso, perché fra un istante le ricevute
     non ci saranno più e il numero non si potrebbe più sapere. */
  select count(*) into v_let from comunicazioni_ricevute
   where comunicazione_id = old.id and letto_il is not null;

  /* NIENTE DOPPIONI CON L'API: se la cancellazione è passata di là, la riga
     l'ha già scritta lei, con più dettagli. Qui si copre tutto il resto. */
  if not exists (
    select 1 from comunicazioni_log
     where comunicazione_id = old.id and azione = 'eliminata'
       and quando > now() - interval '30 seconds')
  then
    insert into comunicazioni_log
      (comunicazione_id, azione, chi, chi_nome, titolo, kind, autore_nome, creata_il, destinatari, letture, contenuto, motivo)
    values (old.id, 'eliminata', v_uid, coalesce(v_nome, '(dal server)'), old.title, old.kind,
            old.created_by_name, old.created_at,
            coalesce(array_length(old.target_users, 1), 0), v_let, old.content,
            case when v_uid is null then 'cancellata senza sessione (chiave di servizio)' else null end);
  end if;
  return old;
end;
$$;

drop trigger if exists trg_comunicazioni_registra_uscita on public.comunicazioni;
create trigger trg_comunicazioni_registra_uscita
  before delete on public.comunicazioni
  for each row execute function public.comunicazioni_registra_uscita();

-- ── E SU UPDATE SI TIENE IL TESTO DI PRIMA ─────────────────────────────────
-- Il trigger di stamattina annotava `NEW`: cioè il testo GIÀ modificato, che
-- per ricostruire non serve a niente. Quello che serve è com'era prima.
create or replace function public.comunicazioni_registra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid;
  v_nome text;
begin
  begin
    v_uid := nullif((current_setting('request.jwt.claims', true)::json ->> 'tf_uid'), '')::uuid;
  exception when others then
    v_uid := null;
  end;
  if v_uid is not null then
    select full_name into v_nome from app_users where id = v_uid;
  end if;

  insert into comunicazioni_log
    (comunicazione_id, azione, chi, chi_nome, titolo, kind, autore_nome, creata_il, destinatari, contenuto)
  values (
    new.id,
    case when tg_op = 'INSERT' then 'creata' else 'modificata' end,
    v_uid,
    coalesce(v_nome, new.created_by_name),
    new.title,
    new.kind,
    new.created_by_name,
    new.created_at,
    coalesce(array_length(new.target_users, 1), 0),
    -- su una modifica si tiene il testo PRIMA: è l'unico che permette di
    -- tornare indietro. Su una creazione il «prima» è il testo stesso.
    case when tg_op = 'INSERT' then new.content else old.content end
  );
  return new;
end;
$$;
