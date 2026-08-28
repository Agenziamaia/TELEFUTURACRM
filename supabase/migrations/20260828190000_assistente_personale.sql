-- L'ASSISTENTE PERSONALE (Luca 28/08 sera): «come l'applicazione di Claude,
-- dentro il CRM — ognuno con le sue chat, i suoi progetti, il suo contesto».
--
-- La regola che tiene in piedi tutto: LA ROBA DI UNO NON SI MESCOLA CON
-- QUELLA DI UN ALTRO. Non per educazione della schermata: è il database che
-- non la consegna. Ogni tabella qui sotto è filtrata su chi sta chiedendo.

-- ── PROGETTI: un contenitore con un contesto suo ─────────────────────────
-- «Marketing agenzie», «Gare Wind3», «Note personali»: dentro ci stanno le
-- conversazioni, e le istruzioni del progetto valgono per tutte.
create table if not exists ai_progetti (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  nome text not null,
  emoji text,
  colore text,
  -- il contesto del progetto: cosa deve sapere l'assistente quando lavoro qui
  istruzioni text,
  archiviato boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_progetti_user on ai_progetti (user_id, archiviato, updated_at desc);

-- ── CONVERSAZIONI ────────────────────────────────────────────────────────
create table if not exists ai_conversazioni (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  progetto_id uuid references ai_progetti (id) on delete set null,
  titolo text,                      -- si scrive da sé dal primo messaggio
  archiviata boolean not null default false,
  fissata boolean not null default false,
  ultimo_messaggio_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists ai_conv_user on ai_conversazioni (user_id, archiviata, ultimo_messaggio_at desc);
create index if not exists ai_conv_progetto on ai_conversazioni (progetto_id);

-- ── MESSAGGI ─────────────────────────────────────────────────────────────
create table if not exists ai_messaggi (
  id uuid primary key default gen_random_uuid(),
  conversazione_id uuid not null references ai_conversazioni (id) on delete cascade,
  user_id uuid not null,            -- ridondante ma comodo: filtra senza join
  ruolo text not null,              -- user | assistant | tool
  contenuto text,
  allegati jsonb,
  meta jsonb,                       -- token, strumenti usati, costo
  created_at timestamptz not null default now()
);
create index if not exists ai_msg_conv on ai_messaggi (conversazione_id, created_at);

-- ── LE PREFERENZE DI CIASCUNO: personalità, memorie, istruzioni ──────────
create table if not exists ai_preferenze (
  user_id uuid primary key,
  -- come voglio che mi parli: tono, lunghezza, lingua, abitudini
  personalita text,
  -- cosa deve ricordarsi sempre di me (il mio ruolo, i miei negozi, come
  -- lavoro, le mie sigle): vale in ogni conversazione
  memorie text,
  -- il nome con cui lo chiamo, se gliene voglio dare uno
  nome_assistente text,
  aggiornato_at timestamptz not null default now()
);

-- ── ISOLAMENTO: ognuno vede SOLO la sua roba ─────────────────────────────
-- Nemmeno l'admin entra nelle conversazioni altrui: un assistente personale
-- su cui qualcuno può affacciarsi non è un assistente personale.
do $$
declare t text;
  chiave text := '(current_setting(''request.jwt.claims'', true)::json ->> ''tf_uid'')::uuid';
begin
  foreach t in array array['ai_progetti', 'ai_conversazioni', 'ai_messaggi', 'ai_preferenze'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tf_mio on %I', t);
    execute format('create policy tf_mio on %I for all using (user_id = %s) with check (user_id = %s)',
                   t, chiave, chiave);
  end loop;
end $$;
