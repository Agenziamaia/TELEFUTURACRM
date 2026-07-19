-- 057: fondamenta dell'assistente AI (DeepSeek).
--  * ai_usage       : log di ogni chiamata (token, costo, latenza) per controllo spesa
--  * ai_insights    : risultati cache delle automazioni (anomalie, insight dashboard, ...)
--  * document_chunks: testo estratto dai PDF per la ricerca full-text (RAG documenti)
-- NB: niente pgvector/embedding — DeepSeek non espone un endpoint di embedding, e per dati
-- cosi' strutturati la ricerca esatta via tool e' piu' precisa. Per i documenti si usa la
-- full-text search di Postgres (config 'italian', gia' disponibile).

create extension if not exists pg_trgm;

-- ── Log consumi ─────────────────────────────────────────────────────────────
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete set null,
  model text not null,
  prompt_tokens int default 0,
  completion_tokens int default 0,
  cost_usd numeric(10,6) default 0,
  latency_ms int,
  tool_calls int default 0,
  ok boolean default true,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_usage_user on public.ai_usage(user_id, created_at desc);

-- ── Insight/automazioni in cache ────────────────────────────────────────────
create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  kind text not null,             -- 'anomaly' | 'store_summary' | 'upsell' | 'comunicazione_tag'
  subject text,                   -- id/chiave dell'oggetto (contract id, nome negozio, ...)
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_insights_kind on public.ai_insights(kind, subject, created_at desc);

-- ── Testo dei documenti per la ricerca (RAG) ────────────────────────────────
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id bigint not null references public.documentation(id) on delete cascade,
  page int,
  content text not null,
  tsv tsvector generated always as (to_tsvector('italian'::regconfig, content)) stored,
  created_at timestamptz not null default now()
);
create index if not exists idx_document_chunks_tsv on public.document_chunks using gin(tsv);
create index if not exists idx_document_chunks_doc on public.document_chunks(document_id);
create index if not exists idx_document_chunks_trgm on public.document_chunks using gin(content gin_trgm_ops);

-- ── RLS: coerente col resto del progetto (anon allow-all; i limiti veri sono
--    applicati lato server nel tool layer, non qui) ───────────────────────────
alter table public.ai_usage        enable row level security;
alter table public.ai_insights     enable row level security;
alter table public.document_chunks enable row level security;
drop policy if exists "ai_usage_all" on public.ai_usage;
create policy "ai_usage_all" on public.ai_usage for all using (true) with check (true);
drop policy if exists "ai_insights_all" on public.ai_insights;
create policy "ai_insights_all" on public.ai_insights for all using (true) with check (true);
drop policy if exists "document_chunks_all" on public.document_chunks;
create policy "document_chunks_all" on public.document_chunks for all using (true) with check (true);

notify pgrst, 'reload schema';
