# Caller — Integration Spec

This document explains how to integrate the new **Caller** section into the existing Telefutura CRM (Next.js + Supabase).

## 1. File Placement

Place the file at:

```
src/app/(dashboard)/caller/page.tsx
```

The page is fully autonomous: it uses `@/lib/supabaseClient`, `@/lib/pageView`, Tailwind utility classes, and `lucide-react` icons — same conventions as the existing `clienti/page.tsx`.

No additional npm dependencies are required.

## 2. Sidebar Entry

Add a new entry to `src/components/Sidebar.tsx` in the navigation array:

```tsx
import { Phone } from "lucide-react";

// In the NAV_ITEMS / sidebarLinks array, add:
{ type: "link", name: "Caller", href: "/caller", icon: Phone, roles: ["admin", "back_office", "supervisore"] },
```

The page itself enforces a finer-grained role check: a `caller` role only sees their own calls; `direttore` and `admin` see everything plus the lists management. **Replace the placeholder role-switcher in the page with the actual session role from your auth context** (search for `// TODO: replace with real session role from auth context`).

## 3. Supabase Schema

Add the following tables to Supabase. SQL ready to run:

```sql
-- ─────────────────────────────────────────────────────────────────────
-- CALLS TABLE
-- ─────────────────────────────────────────────────────────────────────
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  tipo_cliente text not null check (tipo_cliente in ('consumer','business')),
  nome text default '',
  cognome text default '',
  ragione_sociale text default '',
  cf text default '',
  piva text default '',
  numero text default '',
  cellulare text default '',
  brand text default '',
  provenienza text default '',
  tipologia text default '',
  obiettivo text default '',
  stato text not null default '',
  data_chiamata timestamptz not null default now(),
  caller text not null,
  negozio_appuntamento text default '',
  data_appuntamento timestamptz,
  indirizzo text default '',
  agente text default '',
  segnalatore text default '',
  campagna text default '',
  negozio_provenienza text default '',
  mese_provenienza text default '',
  anno_provenienza text default '',
  whatsapp text default '',
  note text default '',
  data_richiamo timestamptz,
  lista_origine text,
  storico jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_calls_caller on public.calls(caller);
create index idx_calls_stato on public.calls(stato);
create index idx_calls_data_chiamata on public.calls(data_chiamata desc);
create index idx_calls_lista_origine on public.calls(lista_origine);
create index idx_calls_cf_piva on public.calls(cf, piva);

-- ─────────────────────────────────────────────────────────────────────
-- LISTE TABLE
-- ─────────────────────────────────────────────────────────────────────
create table public.liste (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  data timestamptz not null default now(),
  tipo text not null check (tipo in ('consumer','business')),
  provenienza text not null,
  segnalatore text default '',
  campagna text default '',
  brand_acq text default '',
  obiettivo_mkt text default '',
  interno_rows jsonb default '[]'::jsonb,
  file_name text default '',
  file_path text default '',
  num_cols int default 0,
  mappa jsonb default '{}'::jsonb,
  totale int not null default 0,
  splits jsonb not null default '[]'::jsonb,
  lavorate int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_liste_data on public.liste(data desc);
create index idx_liste_provenienza on public.liste(provenienza);

-- ─────────────────────────────────────────────────────────────────────
-- STORAGE BUCKET FOR EXCEL FILES
-- ─────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('liste-files', 'liste-files', false)
on conflict do nothing;

-- Storage policies (adjust roles to your auth setup)
create policy "Admins can upload liste files"
  on storage.objects for insert
  with check (bucket_id = 'liste-files' and auth.role() = 'authenticated');

create policy "Admins can read liste files"
  on storage.objects for select
  using (bucket_id = 'liste-files' and auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────────────────
alter table public.calls enable row level security;
alter table public.liste enable row level security;

-- Calls: callers see only their own; admin/direttore see all
-- (Adjust the role check to match your existing user_metadata convention)
create policy "Callers see own calls"
  on public.calls for select
  using (
    auth.jwt() ->> 'role' in ('admin','direttore_cc','back_office','supervisore')
    or caller = (auth.jwt() ->> 'name')
  );

create policy "Authenticated can insert calls"
  on public.calls for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated can update calls"
  on public.calls for update
  using (auth.role() = 'authenticated');

-- Liste: only direttore/admin
create policy "Direttori see liste"
  on public.liste for select
  using (auth.jwt() ->> 'role' in ('admin','direttore_cc'));

create policy "Direttori manage liste"
  on public.liste for all
  using (auth.jwt() ->> 'role' in ('admin','direttore_cc'));
```

## 4. Excel Parsing (Server-Side)

**Important:** the page currently inserts placeholder rows when the wizard is confirmed. The actual Excel parsing must happen server-side. Recommended approach:

1. Create an API route at `src/app/api/liste/process/route.ts`.
2. After the file is uploaded to storage and the lista record is created, the client `POST`s the lista ID to that route.
3. The route reads the file from storage, uses `xlsx` (already in package.json — verify) to parse rows, applies the column mapping, and bulk-inserts calls with the correct splits and `lista_origine`.
4. Update `lavorate` count via a database trigger or background job that counts calls where `lista_origine = liste.nome AND stato != 'Nuovo'`.

In `page.tsx` look for the comment `NOTE: in production, the Excel parsing should happen server-side via an API route` — replace the manual `callsPayloads` block with a `fetch` to your processing endpoint.

## 5. Cliente Lookup Integration

The function `lookupCliente()` already queries the existing `clients` table. Verify the column names match:
- `cf_piva` is used as the lookup key for both consumer (CF) and business (P.IVA)
- `tipo`, `nome`, `cognome`, `ragione_sociale`, `cellulare` are read

If your schema differs, adjust the field mapping inside `lookupCliente()`.

## 6. Calendar Integration

When a call is saved with `tipologia = DTS`/`Outbound` and `data_appuntamento` is set, the existing Calendar module should display it on:
- the **store calendar** (matching `negozio_appuntamento`) for DTS
- the **agent calendar** (matching `agente`) for Outbound

Hook this via:
- a database trigger on `calls` insert/update that creates a row in the calendar events table, OR
- an API route called from `saveCall()` after the supabase insert resolves

Reference the call ID so users can navigate from the calendar event back to the call detail.

## 7. Role-based UI

The page currently exposes a **role switcher in the header** (Caller / Direttore / Admin) for development purposes. Before going to production:

1. Read the current user's role from your auth context.
2. Replace `const [currentRole, setCurrentRole] = useState<Role>("caller");` with the actual role.
3. Remove the role-switcher buttons in the header (clearly marked with a `TODO` comment).

## 8. Status Color Customization

The function `statoBadgeClasses()` maps each status to Tailwind classes. If you want different colors, edit it in one place. The new statuses **Archiviato** and **Non ricontattare** are already covered.

## 9. Quick Test Checklist

After deploying:

- [ ] Caller link visible in sidebar to authorized roles
- [ ] Empty board renders with "Nessuna call trovata"
- [ ] Direttore/Admin can switch view to "Storico Liste"
- [ ] "Nuova Call" modal opens, all fields work, save creates a row
- [ ] CF lookup auto-fills name/numero when an existing client is found
- [ ] Click on a row opens detail view, status update appends to storico
- [ ] "Assegna Liste" wizard 5 steps work, file uploads to storage
- [ ] After confirming a list, the calls appear in the calls board with `Nuovo` status
- [ ] Caller filter "Lista Origine" finds calls from a specific list
- [ ] Storico Liste detail modal shows file download button

## 10. Known TODOs Inside the File

Search the file for `// TODO:` to find:
- Real session role wiring
- Server-side Excel parsing endpoint
- Real row count from server after upload

That's all — the page is fully self-contained and follows the existing CRM patterns.
