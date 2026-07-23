-- 072: integrita' strutturale — stato utente unico e persone collegate per FK.
--
-- Due problemi risolti a livello di database, cosi' valgono qualunque sia il
-- codice che scrive:
--
-- 1. app_users aveva due colonne per lo stesso concetto: `status`
--    ('attivo'/'licenziato') e `active` (booleano). Potevano divergere —
--    licenziare qualcuno via status lasciava active=true, e la persona restava
--    nelle liste operative (chat, contratti). Ora `status` e' la fonte unica e
--    un trigger tiene `active` sempre allineato.
--
-- 2. In presenze, ritardi, malattie, ferie e calendario la persona era testo
--    libero (employee_name, assigned_to, agente). Un nome scritto in due modi
--    -> dati che non si trovano piu' (e' il motivo dei casini "Alberto" /
--    "Ben Aziza" nei contratti). Ora ogni tabella ha un user_id collegato ad
--    app_users, popolato da un resolver condiviso e mantenuto da un trigger.
--    I nomi restano come etichetta di visualizzazione.

-- ── 1. Stato utente: fonte unica ────────────────────────────────────────────
create or replace function public.sync_user_active() returns trigger
language plpgsql as $$
begin
  new.active := (coalesce(new.status, 'attivo') = 'attivo');
  return new;
end $$;

drop trigger if exists trg_sync_user_active on public.app_users;
create trigger trg_sync_user_active
  before insert or update on public.app_users
  for each row execute function public.sync_user_active();

-- riallinea lo storico (gia' coerente, ma per sicurezza)
update public.app_users set active = (coalesce(status,'attivo') = 'attivo')
  where active is distinct from (coalesce(status,'attivo') = 'attivo');

-- ── 2. Resolver nome -> account ─────────────────────────────────────────────
-- Stessa logica del CRM: match esatto, poi prefisso nei due sensi.
create or replace function public.match_user_id(p_name text) returns uuid
language plpgsql stable as $$
declare v_id uuid; k text;
begin
  if p_name is null or btrim(p_name) = '' then return null; end if;
  k := lower(btrim(p_name));
  select id into v_id from public.app_users where lower(btrim(full_name)) = k limit 1;
  if v_id is not null then return v_id; end if;
  select id into v_id from public.app_users
    where lower(btrim(full_name)) like k || '%' or k like lower(btrim(full_name)) || '%'
    order by length(full_name) limit 1;
  return v_id;
end $$;

-- fabbrica un trigger che popola <col_id> da <col_name> su una tabella
create or replace function public.make_person_fk_trigger(p_table text, p_name_col text, p_id_col text)
returns void language plpgsql as $$
declare fn text := format('resolve_%s_%s', p_table, p_id_col);
begin
  execute format($f$
    create or replace function public.%1$I() returns trigger language plpgsql as $body$
    begin
      if new.%2$I is not null and btrim(new.%2$I) <> '' then
        new.%3$I := public.match_user_id(new.%2$I);
      end if;
      return new;
    end $body$;
  $f$, fn, p_name_col, p_id_col);
  execute format('drop trigger if exists trg_%1$s on public.%2$I', p_id_col, p_table);
  execute format('create trigger trg_%1$s before insert or update on public.%2$I for each row execute function public.%3$I()',
                 p_id_col, p_table, fn);
end $$;

-- ── 3. Colonne FK + trigger + backfill, tabella per tabella ─────────────────
do $$
declare
  r record;
  targets text[][] := array[
    ['shifts',            'employee_name', 'user_id'],
    ['ritardi',           'employee_name', 'user_id'],
    ['sickness_absences', 'employee_name', 'user_id'],
    ['vacation_requests', 'employee_name', 'user_id'],
    ['calendar_tasks',    'assigned_to',   'assigned_user_id'],
    ['calendar_tasks',    'created_by',    'created_by_user_id'],
    ['appointments',      'agente',        'agente_user_id']
  ];
  t text[];
begin
  foreach t slice 1 in array targets loop
    execute format('alter table public.%1$I add column if not exists %2$I uuid references public.app_users(id) on delete set null', t[1], t[3]);
    perform public.make_person_fk_trigger(t[1], t[2], t[3]);
    execute format('update public.%1$I set %3$I = public.match_user_id(%2$I) where %2$I is not null', t[1], t[2], t[3]);
    execute format('create index if not exists %1$I on public.%2$I(%3$I)', 'idx_' || t[1] || '_' || t[3], t[1], t[3]);
  end loop;
end $$;

notify pgrst, 'reload schema';
