-- ═══════════════════════════════════════════════════════════════════════════
-- IL REGISTRO SI RIEMPIE DA SOLO — 01/09/2026
--
-- Luca: «metti in piedi anche un sistema dove possiamo controllare chi fa cosa
-- anche su comunicazioni».
--
-- La CANCELLAZIONE la scrive già l'API (`/api/comunicazioni/elimina`), che ha
-- in mano titolo, testo, destinatari e letture. Mancano CREAZIONE e MODIFICA,
-- e quelle avvengono ancora dal browser: se le facesse annotare al codice
-- della pagina, basterebbe una strada nuova — o una chiamata diretta dalla
-- console — per non finire nel registro.
--
-- Quindi lo fa il DATABASE, sotto: qualunque cosa scriva su `comunicazioni`,
-- da qualunque parte arrivi, lascia la sua riga. Chi è stato si legge dal
-- `tf_uid` della sessione firmata, lo stesso che usano le policy: dal browser
-- non si può mentire.
--
-- PERCHÉ IL TITOLO E IL TESTO SONO COPIATI DENTRO: una riga di registro che
-- rimanda a una comunicazione cancellata non serve a niente. Il registro deve
-- reggere in piedi da solo, ed è tutto il punto — stamattina di tre
-- comunicazioni sparite non è rimasto nemmeno il titolo.
-- ═══════════════════════════════════════════════════════════════════════════

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
  -- chi sta scrivendo: l'id della sessione firmata, se c'è
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
    new.content
  );
  return new;
end;
$$;

drop trigger if exists trg_comunicazioni_registra on public.comunicazioni;
create trigger trg_comunicazioni_registra
  after insert or update on public.comunicazioni
  for each row execute function public.comunicazioni_registra();

-- IL TRIGGER SCRIVE COI PROPRI PERMESSI (`security definer`): senza, la
-- revoca dell'INSERT sul registro fatta un attimo fa lo farebbe fallire, e
-- fallendo lui fallirebbe anche la creazione della comunicazione. È lo stesso
-- inciampo che il 31/08 ha fermato le vendite per un'ora.
