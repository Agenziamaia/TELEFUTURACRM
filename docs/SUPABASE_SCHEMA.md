# LUCA CRM — Supabase Schema

This document defines the full database schema to replace all mock data and support every page and flow in the project. Designed for **Supabase (PostgreSQL)** with RLS and Storage.

---

## 1. Overview: Pages → Data

| Page / Flow | Data sources (current mock) | Main tables |
|-------------|-----------------------------|-------------|
| **Login / Auth** | `MOCK_USERS` (AuthContext) | `profiles` (Supabase Auth + public.profiles) |
| **Dashboard** | `mockDashboardData`, summaryStats | Aggregates from `pda_submissions` |
| **Gestione PDA** | `mockGestioneData` | `pda_submissions`, `pda_items`, `brands`, `stores`, `profiles` |
| **PDA Invia** | Cart, ALL_BRANDS, PRODOTTI, NEGOZI, VENDITORI, anConsumer/anBusiness | `pda_submissions`, `pda_items`, `clients`, `brands`, `brand_products`, `stores`, `profiles` |
| **PDA Tracking** | `mockTrackingData` | `pda_submissions`, `pda_items` (same as Gestione, filtered by agent) |
| **Ricerca Contratto** | `mockContrattiData` | `contracts`, `clients`, `stores`, `profiles`, `brands` |
| **Registra Contratto** | BRANDS, client lookup, cart, sales/emS, allegati, attribuzione | `contracts`, `contract_items`, `contract_attachments`, `clients`, `brands`, `stores`, `profiles` |
| **Clienti** | `mockClienti`, `getMockContratti` | `clients`, `contracts` |
| **Chiusura Negozio** | `MOCK_HISTORY`, `NEGOZI`, `SOCIETA`, DOC_TYPES, attachments | `store_closures`, `closure_attachments`, `companies`, `stores`, `profiles` |
| **Vista Fatture** (Chiusura) | Derived from MOCK_HISTORY attachments | `closure_attachments` (type = fatture), optional `invoices` |
| **Usati (Gestione Usati)** | `MOCK_DEVICES`, NEGOZI, VENDITORI, PHONE_BRANDS_MODELS, ricambi | `used_devices`, `device_status_history`, `device_ricambi`, `device_payments`, `device_extra_margins`, `stores`, `phone_models` |
| **Documentazione** | `MOCK_DOCS`, BRANDS, CATEGORIES | `doc_categories`, `documentation_files`, `brands` |
| **Calendario** | `MOCK_APPOINTMENTS`, `MOCK_TASKS`, MOCK_AGENTS, MOCK_STORES | `appointments`, `calendar_tasks`, `profiles`, `stores` |
| **Comunicazioni** | `comunicazioni` array | `communications`, `communication_reads` |
| **API /api/smartphones** | `src/data/smartphones.json` | `phone_brands`, `phone_models` (optional; can keep JSON or migrate) |

---

## 2. Enums

```sql
-- Roles (align with app: admin, agente, venditore, store_manager, supervisore, back_office)
CREATE TYPE app_role AS ENUM (
  'admin', 'agente', 'venditore', 'store_manager', 'supervisore', 'back_office'
);

-- Client type
CREATE TYPE client_type AS ENUM ('consumer', 'business');

-- PDA submission status (Gestione / Tracking)
CREATE TYPE pda_status AS ENUM (
  'Assegnata', 'Ricevuta', 'Attivato', 'Inserito',
  'Sospeso', 'Sospeso Dati Errati', 'Sospeso Mancanza di Documento',
  'KO', 'KO Credito', 'KO Doc Mai Arrivata'
);

-- Contract status
CREATE TYPE contract_status AS ENUM (
  'In lavorazione', 'Attivo', 'Sospeso', 'Annullato', 'In attivazione'
);

-- Chiusura document type
CREATE TYPE closure_doc_type AS ENUM ('cassa', 'pos', 'ddt_w3', 'ddt_vf', 'fatture');

-- Used device status (Gestione Usati)
CREATE TYPE usato_status AS ENUM (
  'acquistato', 'in_transito', 'ricevuto', 'in_lavorazione',
  'pronto', 'invio_in_negozio', 'in_vendita', 'venduto', 'ko'
);

CREATE TYPE ricambio_state AS ENUM ('in_magazzino', 'da_ordinare', 'ordinato', 'arrivato');
CREATE TYPE payment_method AS ENUM ('contanti', 'buono', 'bonifico');

-- Calendario
CREATE TYPE appointment_type AS ENUM ('incoming', 'outgoing', 'self_generated');
CREATE TYPE appointment_status AS ENUM (
  'scheduled', 'attivato', 'ko', 'in_gestione', 'da_richiamare', 'da_rifissare', 'annullato'
);
CREATE TYPE task_status AS ENUM ('da_fare', 'fatta', 'sospesa');

-- Comunicazioni
CREATE TYPE communication_type AS ENUM ('info', 'warning', 'success');
```

---

## 3. Core Tables

### 3.1 Profiles (extends Supabase Auth)

Supabase Auth provides `auth.users`. Mirror needed fields into `public.profiles` for role and store assignment.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role app_role NOT NULL DEFAULT 'agente',
  store_id UUID REFERENCES stores(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_store ON profiles(store_id);
```

---

### 3.2 Companies (Società)

Used in Chiusura (Telefutura, Telefutura 2SRL) and optionally for contracts.

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  piva TEXT,
  accent_color TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 3.3 Stores (Negozi)

Used everywhere: Chiusura, Usati, Calendario, Ricerca Contratto, PDA, Registra Contratto.

```sql
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT,
  company_id UUID REFERENCES companies(id),
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_stores_company ON stores(company_id);
CREATE UNIQUE INDEX idx_stores_name_code ON stores(name, code);
```

---

### 3.4 Brands

Single source for WindTre, Sky, Fastweb, Energy, Dojo, Vodafone, Iliad, etc. Used in Documentazione, PDA Invia, Registra Contratto, Dashboard stats.

```sql
CREATE TABLE brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  label TEXT,
  badge TEXT,
  only_business BOOLEAN DEFAULT false,
  logo_url TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 3.5 Brand products (catalog)

Products per brand and segment (consumer/business). Replaces hardcoded `PRODOTTI` in invia PDA.

```sql
CREATE TABLE product_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE brand_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL REFERENCES brands(id),
  category_id TEXT NOT NULL REFERENCES product_categories(id),
  product_name TEXT NOT NULL,
  segment client_type NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(brand_id, category_id, product_name, segment)
);

CREATE INDEX idx_brand_products_brand ON brand_products(brand_id);
CREATE INDEX idx_brand_products_category ON brand_products(category_id);
```

---

### 3.6 Clients (Clienti)

Consumer and business. Used in Clienti page, Registra Contratto, PDA Invia (anagrafica / lookup by CF or PIVA).

```sql
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo client_type NOT NULL,
  -- Consumer
  nome TEXT,
  cognome TEXT,
  cf TEXT,
  -- Business
  ragione_sociale TEXT,
  piva TEXT,
  referente TEXT,
  pec TEXT,
  codice_univoco TEXT,
  sede_legale TEXT,
  -- Common
  cellulare TEXT NOT NULL,
  email TEXT,
  numero_fisso TEXT,
  indirizzo TEXT,
  citta TEXT,
  iban TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_clients_tipo ON clients(tipo);
CREATE INDEX idx_clients_cf ON clients(cf) WHERE cf IS NOT NULL;
CREATE INDEX idx_clients_piva ON clients(piva) WHERE piva IS NOT NULL;
CREATE INDEX idx_clients_cellulare ON clients(cellulare);
CREATE INDEX idx_clients_email ON clients(email);
```

---

### 3.7 Contracts (Contratti) — header only

One row per contract registration (one client, one store, one venditore, one date). All product lines live in contract_items. Supports Ricerca Contratto, Clienti detail, and Registra Contratto (insert header plus items plus attachments).

```sql
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  store_id UUID NOT NULL REFERENCES stores(id),
  venditore_id UUID NOT NULL REFERENCES profiles(id),
  data_registrazione DATE NOT NULL,
  data_attivazione DATE,
  stato contract_status NOT NULL DEFAULT 'In lavorazione',
  codice_attivazione TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contracts_client ON contracts(client_id);
CREATE INDEX idx_contracts_store ON contracts(store_id);
CREATE INDEX idx_contracts_venditore ON contracts(venditore_id);
CREATE INDEX idx_contracts_stato ON contracts(stato);
CREATE INDEX idx_contracts_dates ON contracts(data_registrazione, data_attivazione);
```

---

### 3.8 Contract items (Registra Contratto — product lines)

One row per product line in the cart. Each line can be WindTre (mobile GA/CB, fisso, energia, multi-servizi), Sky (selected products), or other brands. The full form state (all Step 4 fields) is stored in `payload JSONB` so no field is lost and the UI can restore/edit.

```sql
CREATE TABLE contract_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL REFERENCES brands(id),
  category TEXT NOT NULL,
  sub_product_id TEXT NOT NULL,
  line_index INT NOT NULL DEFAULT 0,
  display_label TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contract_items_contract ON contract_items(contract_id);
CREATE INDEX idx_contract_items_brand ON contract_items(brand_id);
CREATE INDEX idx_contract_items_category ON contract_items(category);
```

See **§ 3.8.1 Registra Contratto — full field list** for the shape of `payload`.

---

### 3.9 Contract attachments (Step 5 — Allegati)

```sql
CREATE TYPE contract_attachment_type AS ENUM ('documento', 'contratti', 'altro');

CREATE TABLE contract_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  attachment_type contract_attachment_type NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contract_attachments_contract ON contract_attachments(contract_id);
```

---

### 3.8.1 Registra Contratto — full field list and payload shape

Registra Contratto is the most complex form. Below is the complete list of data so the schema and app can handle every field.

**Step 1 — Brand**  
- `brand_id` (WindTre, Sky, Vodafone, Fastweb, Iliad, Energy, …).

**Step 2 — Tipo Cliente**  
- `tipo_cliente`: `privato` | `business`.

**Step 3 — Anagrafica (clients table)**  
- Consumer: `nome`, `cognome`, `cellulare`, `email`, `via`, `cap`, `citta`; lookup by CF.  
- Business: `ragioneSociale`, `nomeRef`, `cognomeRef`, `recapito`, `email`, `via`, `cap`, `citta`; lookup by PIVA.  
- Stored in `clients`; contract links via `contracts.client_id`.

**Step 4 — Prodotti e Contratto (per brand / per line)**  
- Stored per line in `contract_items.payload`.  
- Structure: keyed by category (`mobile`, `fisso`, `energia`, `multi-servizi`), then by sub-product (`ga`, `cb`, `fisso_std`, `fisso_cb`, `fwa_indoor`, `fwa_outdoor`, Sky products).  
- Each sub has the full **emS** state. Store the entire `sales` tree (and for Sky, `skyS`, `sesCode`) in `payload` so the form can be restored exactly.

**emS / payload shape (per product line)** — all keys below can appear in `payload`:

| Group | Fields |
|-------|--------|
| **Generic** | `active`, `fields` (key-value), `contract` (key-value) |
| **GNP / Fisso** | `gnp`, `gnpNum`, `gnpOp`, `secondaLinea`, `gnp2L`, `gnp2LBrand`, `gnp2LNum` |
| **Domiciliazione** | `domiciliazione`, `opProvenienza`, `codiceOverride`, `domiciliato`, `convergente` |
| **Add-ons** | `addons` (object: addon name → boolean) |
| **Mobile (GA)** | `tipMob` (Underground/Mass Market), `mnp`, `easyPay`, `offerta` (in fields) |
| **TNP GA** | `tnpGa`, `tnpTipo`, `tnpModello`, `tnpImei`, `tnpCount`, `tnpModelli[]`, `tnpImeis[]`, `packAccessori`, `packAccessoriVal`, `packAccessoriQta`, `tnpGaReload`, `tnpGaReloadSel` (object), `reloadForever`, `securitySel` (object) |
| **CB** | `cbTnp`, `cbTnpTipo`, `cbTnpModello`, `cbTnpImei`, `cbTnpCount`, `cbTnpModelli[]`, `cbTnpImeis[]`, `cbPackAccessori`, `cbPackAccessoriVal`, `cbPackAccessoriQta`, `cbTnpCell`, `cbTnpCC`, `cbTnpCodIns`, `cbTnpReload`, `cbTnpReloadSel`, `cbCambio`, `cbCambioVal`, `cbCambioCell`, `cbCambioCC`, `cbCambioCodIns`, `cbAddonSel`, `rfModello`, `rfImei`, `cbRf`, `cbAddonCodIns`, `cbRfCodIns`, `voceCasaCb` |
| **Fisso / Protecta / Assicurazioni** | `protectaKit`, `assicBizSel`, and other category-specific keys in `fields` / `contract` |
| **Sky** | `skyS` = array of `{ selected: string[] }`, `sesCode`; store in contract-level JSON or first contract_item for Sky. |

**Step 5 — Allegati**  
- Types: Documento, Contratti, Altro. Stored in `contract_attachments`.

**Step 6 — Attribuzione**  
- Venditore → `contracts.venditore_id`. Negozio → `contracts.store_id`. Data → `contracts.data_registrazione`.

**Step 7 — Note**  
- Free text → `contracts.note`.

**Submit shape**  
- One `contracts` row; multiple `contract_items` (one per line, with `payload`); multiple `contract_attachments`.  
- Ricerca Contratto: one row per contract (header); list view can use first item or aggregate by brand/category.

---

### 3.10 PDA submissions (Gestione PDA / Tracking / Invia)

One submission = one “invio” (one client snapshot, one store, one venditore, one or more products). Status is at submission level; operatore is back office.

```sql
CREATE TABLE pda_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  venditore_id UUID NOT NULL REFERENCES profiles(id),
  negozio_id UUID NOT NULL REFERENCES stores(id),
  client_id UUID REFERENCES clients(id),
  tipo_cliente client_type NOT NULL,
  -- Snapshot anagrafica (if no client_id or override)
  anagrafica_snapshot JSONB,
  brand_id TEXT NOT NULL REFERENCES brands(id),
  status pda_status NOT NULL DEFAULT 'Assegnata',
  operatore_id UUID REFERENCES profiles(id),
  codice_contratto TEXT,
  codice_ordine TEXT,
  categoria TEXT,
  societa TEXT,
  piva TEXT,
  referente TEXT,
  recapito TEXT,
  tipologia TEXT,
  segmento TEXT,
  pod TEXT,
  pdr TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pda_submissions_venditore ON pda_submissions(venditore_id);
CREATE INDEX idx_pda_submissions_negozio ON pda_submissions(negozio_id);
CREATE INDEX idx_pda_submissions_brand ON pda_submissions(brand_id);
CREATE INDEX idx_pda_submissions_status ON pda_submissions(status);
CREATE INDEX idx_pda_submissions_submitted ON pda_submissions(submitted_at);
```

---

### 3.11 PDA items (cart items per submission)

One row per product line in the cart (category, product name, dynamic fields).

```sql
CREATE TABLE pda_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pda_id UUID NOT NULL REFERENCES pda_submissions(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  product_name TEXT NOT NULL,
  fields JSONB DEFAULT '{}',
  sky_pkt TEXT[],
  sky_tech TEXT,
  sky_dec TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pda_items_pda ON pda_items(pda_id);
```

---

### 3.12 Store closures (Chiusura Negozio)

One row per store + company + date + operator (closure event). Attachments in next table.

```sql
CREATE TABLE store_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  closure_date DATE NOT NULL,
  closure_time TIME,
  user_id UUID NOT NULL REFERENCES profiles(id),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_store_closures_store ON store_closures(store_id);
CREATE INDEX idx_store_closures_company ON store_closures(company_id);
CREATE INDEX idx_store_closures_date ON store_closures(closure_date);
CREATE UNIQUE INDEX idx_store_closures_unique ON store_closures(store_id, company_id, closure_date);
```

---

### 3.13 Closure attachments (Chiusura documents)

Files uploaded per closure and doc type (cassa, pos, ddt_w3, ddt_vf, fatture). Store file in Supabase Storage; keep path and metadata here.

```sql
CREATE TABLE closure_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_closure_id UUID NOT NULL REFERENCES store_closures(id) ON DELETE CASCADE,
  doc_type closure_doc_type NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_closure_attachments_closure ON closure_attachments(store_closure_id);
CREATE INDEX idx_closure_attachments_type ON closure_attachments(doc_type);
```

Optional: `invoices` table if you need extra fields (numero_fattura, emessa, etc.) derived from fatture attachments.

---

### 3.14 Used devices (Usati)

Single table for device; status history and ricambi in separate tables.

```sql
CREATE TABLE used_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model TEXT NOT NULL,
  imei TEXT NOT NULL,
  status usato_status NOT NULL DEFAULT 'acquistato',
  store_id UUID NOT NULL REFERENCES stores(id),
  target_store_id UUID REFERENCES stores(id),
  sale_price NUMERIC(10,2) DEFAULT 0,
  purchase_price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  purchase_date DATE,
  listed_date DATE,
  sold_date DATE,
  note_tecnico TEXT,
  provenienza_subito BOOLEAN DEFAULT false,
  grado_usura TEXT,
  created_by_id UUID REFERENCES profiles(id),
  UNIQUE(imei)
);

CREATE INDEX idx_used_devices_status ON used_devices(status);
CREATE INDEX idx_used_devices_store ON used_devices(store_id);
CREATE INDEX idx_used_devices_imei ON used_devices(imei);
CREATE INDEX idx_used_devices_dates ON used_devices(created_at, purchase_date, listed_date, sold_date);
```

---

### 3.15 Device status history

```sql
CREATE TABLE device_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES used_devices(id) ON DELETE CASCADE,
  status usato_status NOT NULL,
  set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  operatore_id UUID REFERENCES profiles(id)
);

CREATE INDEX idx_device_status_history_device ON device_status_history(device_id);
```

---

### 3.16 Device ricambi (parts)

```sql
CREATE TABLE device_ricambi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES used_devices(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stato ricambio_state NOT NULL,
  cost NUMERIC(10,2),
  data_consegna_prevista DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_device_ricambi_device ON device_ricambi(device_id);
```

---

### 3.17 Device payment (pagamento)

One row per device (1:1 with used_devices for payment info).

```sql
CREATE TABLE device_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES used_devices(id) ON DELETE CASCADE UNIQUE,
  metodo payment_method NOT NULL,
  iban TEXT,
  bonifico_effettuato BOOLEAN,
  bonifico_operatore_id UUID REFERENCES profiles(id),
  bonifico_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 3.18 Device extra margin

```sql
CREATE TABLE device_extra_margins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES used_devices(id) ON DELETE CASCADE,
  importo NUMERIC(10,2) NOT NULL,
  venditore_id UUID REFERENCES profiles(id),
  confermato BOOLEAN DEFAULT false,
  conferma_operatore_id UUID REFERENCES profiles(id),
  conferma_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_device_extra_margins_device ON device_extra_margins(device_id);
```

---

### 3.19 Phone brands & models (catalog for Usati / API)

Can replace `smartphones.json` and Usati `PHONE_BRANDS_MODELS`.

```sql
CREATE TABLE phone_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE phone_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES phone_brands(id),
  name TEXT NOT NULL,
  UNIQUE(brand_id, name)
);

CREATE INDEX idx_phone_models_brand ON phone_models(brand_id);
```

---

### 3.20 Ricambi catalog (Usati)

Static list of part names (Display LCD, Batteria, etc.).

```sql
CREATE TABLE ricambi_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);
```

---

### 3.21 Documentazione (Documentation files)

Categories: Canvass, Modulistica, Operativa. Files per brand + category.

```sql
CREATE TABLE doc_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0
);

CREATE TABLE documentation_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT NOT NULL REFERENCES brands(id),
  category_id TEXT NOT NULL REFERENCES doc_categories(id),
  name TEXT NOT NULL,
  file_type TEXT DEFAULT 'pdf',
  size_bytes BIGINT,
  storage_path TEXT NOT NULL,
  fillable BOOLEAN DEFAULT false,
  published_at DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_documentation_files_brand ON documentation_files(brand_id);
CREATE INDEX idx_documentation_files_category ON documentation_files(category_id);
```

---

### 3.22 Appointments (Calendario)

```sql
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  time TIME,
  type appointment_type NOT NULL,
  agente_id UUID NOT NULL REFERENCES profiles(id),
  store_id UUID REFERENCES stores(id),
  customer_address TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  cf_piva TEXT,
  notes TEXT,
  esito_note TEXT,
  status appointment_status NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_appointments_date ON appointments(date);
CREATE INDEX idx_appointments_agente ON appointments(agente_id);
CREATE INDEX idx_appointments_store ON appointments(store_id);
CREATE INDEX idx_appointments_status ON appointments(status);
```

---

### 3.23 Calendar tasks

```sql
CREATE TABLE calendar_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  date DATE NOT NULL,
  time TIME,
  status task_status NOT NULL DEFAULT 'da_fare',
  notes TEXT,
  client_ref TEXT,
  created_by_id UUID NOT NULL REFERENCES profiles(id),
  assigned_to_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_calendar_tasks_date ON calendar_tasks(date);
CREATE INDEX idx_calendar_tasks_assigned ON calendar_tasks(assigned_to_id);
CREATE INDEX idx_calendar_tasks_status ON calendar_tasks(status);
```

---

### 3.24 Communications (Comunicazioni)

```sql
CREATE TABLE communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type communication_type NOT NULL DEFAULT 'info',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE communication_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id UUID NOT NULL REFERENCES communications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(communication_id, user_id)
);

CREATE INDEX idx_communication_reads_user ON communication_reads(user_id);
CREATE INDEX idx_communication_reads_comm ON communication_reads(communication_id);
```

---

## 4. Row Level Security (RLS)

- Enable RLS on all tables. Policies depend on `profiles.role` and `profiles.store_id`.
- **Admin / supervisore / back_office**: can read/write (or only read) across all stores.
- **Agente / venditore / store_manager**: restrict to `store_id` (or stores they are allowed to see).
- **Auth**: use `auth.uid()` in policies and keep `profiles.id = auth.uid()`.

Example for `contracts`:

```sql
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access" ON contracts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisore', 'back_office'))
  );

CREATE POLICY "Agente own store" ON contracts
  FOR ALL USING (
    store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid())
  );
```

Repeat pattern for `pda_submissions`, `store_closures`, `used_devices`, `appointments`, `calendar_tasks`, etc. Adjust FOR SELECT/INSERT/UPDATE/DELETE as needed.

---

## 5. Storage buckets (Supabase Storage)

| Bucket | Purpose | RLS |
|--------|---------|-----|
| `chiusura-attachments` | Closure docs (cassa, pos, ddt_w3, ddt_vf, fatture) | Only authenticated; restrict by store_closure_id if needed |
| `documentation` | Documentation files (PDFs per brand/category) | Authenticated read; admin write |
| `contract-attachments` | Optional: attachments for contracts | By contract/store |

---

## 6. Data flows (summary)

- **Auth**: Supabase Auth → `profiles` (trigger on signup to insert profile with role/store).
- **Dashboard**: Aggregate `pda_submissions` by status, brand, segment; optionally cache in materialized view.
- **Gestione PDA**: List `pda_submissions` with filters (brand, venditore, status, date); join `pda_items`, `profiles`, `stores`, `brands`.
- **PDA Invia**: Insert `clients` or use existing; insert `pda_submissions` + `pda_items` (cart).
- **PDA Tracking**: Same as Gestione, filter by `venditore_id = auth.uid()` (or current user’s store).
- **Ricerca Contratto**: Query `contracts` with filters; join `clients`, `stores`, `profiles`, `brands`.
- **Registra Contratto**: Client lookup → insert/update `clients`; insert one `contracts` (header); insert multiple `contract_items` (one per cart line, with full `payload` JSONB); insert `contract_attachments` (Step 5). Ricerca shows contract header; expand/detail loads items.
- **Clienti**: List `clients`; detail modal: client + `contracts` for that client.
- **Chiusura**: List `store_closures` with `closure_attachments`; insert closure + upload files to Storage + insert `closure_attachments`. Vista Fatture: filter attachments by `doc_type = 'fatture'`.
- **Usati**: CRUD `used_devices`, `device_status_history`, `device_ricambi`, `device_payments`, `device_extra_margins`. Filters by store, status, dates. Add device form → insert device + initial status history.
- **Documentazione**: List `documentation_files` by `brand_id` and `category_id`; serve from Storage.
- **Calendario**: CRUD `appointments`, `calendar_tasks`; filter by agente/store/date.
- **Comunicazioni**: List `communications`; mark read via `communication_reads`.
- **API /api/smartphones**: Replace with Supabase query from `phone_brands` + `phone_models`, or keep static JSON and sync from DB.

---

## 7. Migration order

1. Enums  
2. `companies` → `stores` → `profiles` (after Auth ready)  
3. `brands` → `product_categories` → `brand_products`  
4. `clients` → `contracts` → `contract_items`, `contract_attachments`  
5. `pda_submissions` → `pda_items`  
6. `store_closures` → `closure_attachments`  
7. `phone_brands` → `phone_models`; `ricambi_catalog`  
8. `used_devices` → `device_status_history`, `device_ricambi`, `device_payments`, `device_extra_margins`  
9. `doc_categories` → `documentation_files`  
10. `appointments` → `calendar_tasks`  
11. `communications` → `communication_reads`  
12. RLS policies and Storage buckets  

---

## 8. Seed data to migrate from mocks

- **NEGOZI** → `stores` (name, code; link to `companies` if needed)  
- **SOCIETA** / Telefutura, Telefutura 2SRL → `companies`  
- **ALL_BRANDS** / BRANDS (windtre, sky, fastweb, …) → `brands`  
- **PRODOTTI** (invia) → `product_categories` + `brand_products`  
- **DOC_TYPES** (cassa, pos, ddt_w3, ddt_vf, fatture) → use enum only; no table  
- **STATUS_OPTIONS** (PDA) → use enum `pda_status`  
- **MOCK_AGENTS** / VENDITORI → `profiles` (after Auth)  
- **RICAMBI_CATALOG** → `ricambi_catalog`  
- **CATEGORIES** (documentazione) → `doc_categories` (canvass, modulistica, operativa)  
- **smartphones.json** → `phone_brands` + `phone_models` (optional)  

---

## 9. Appendix A — Page-by-page data and fields (full reference)

Every page, filter, table column, form field, and flow is listed below so nothing is missed when wiring to Supabase.

---

### 9.1 Login / Auth (`/`)

| Item | Source (mock) | DB / Notes |
|------|----------------|------------|
| **User** | `MOCK_USERS` by email | `profiles` (id, full_name, email, role, store_id). Replace with Supabase Auth + `profiles`. |
| **Fields** | id, name, email, role, negozio (optional) | profiles.id = auth.uid(), negozio → store_id FK |
| **Session** | localStorage `crm_session` | Use Supabase session; optional mirror in profiles. |
| **Route protection** | Agente cannot access `/gestione` | RLS + app redirect by role. |

---

### 9.2 Dashboard (`/dashboard`)

| Item | Source (mock) | DB / Notes |
|------|----------------|------------|
| **KPI cards** | summaryStats: label, value, trend, icon, color | Aggregate from `pda_submissions`: Totale PDA, In Lavorazione, Approvate (OK), Respinte (KO). Store trend in app or materialized view. |
| **Filters** | Da Data, A Data (date inputs), Aggiorna Grafici, Pulisci | Filter aggregates by submitted_at range. |
| **Table** | mockDashboardData: brand, segmento, ricevute, assegnate, ok, sospesi, ko | Aggregate `pda_submissions` (+ items) by brand_id and segment (consumer/business). Columns: Brand, Segmento, Ricevute, Assegnate, OK, Sospesi, KO. |

---

### 9.3 Gestione PDA (`/gestione`) — Admin only

| Item | Source (mock) | DB / Notes |
|------|----------------|------------|
| **List row** | mockGestioneData: id, logo, categoria, brand, venditore, inviato_il, operatore, stato, societa, piva, referente, recapito, tipologia, segmento, pod, pdr, note | `pda_submissions` (+ anagrafica_snapshot / client). operatore = operatore_id (profile). |
| **Filters** | Prodotto (Mobile, Fisso, Luce & Gas, Assicurazioni, Protecta, POS), Brand, Venditore, Stato (STATUS_OPTIONS), Da data invio, A data invio, Operatore Back Office (admin only) | Map to pda_submissions + pda_items (categoria, brand_id, venditore_id, status, submitted_at, operatore_id). |
| **Table columns** | Checkbox, Brand, Venditore, Inviato il, Azioni (Apri pratica, Allegati, Archivia), Operatore BO (dropdown), Stato (StatusDropdown), Note (icon → modal), Ragione Sociale, P. IVA, Segmento | pda_submissions + clients or anagrafica_snapshot. |
| **Note modal** | selectedNote: id, text; Salva Note | Add `pda_notes` table or `note` column on pda_submissions; save on Salva. |
| **Search** | "Cerca..." in table toolbar | Filter list by text on brand, venditore, societa, etc. |

---

### 9.4 PDA Invia (`/pda/invia`)

| Item | Source (mock) | DB / Notes |
|------|----------------|------------|
| **Constants** | VENDITORI, NEGOZI, ALL_BRANDS, PRODOTTI (per brand/segment), CAT_FIELDS, DONOR_*, SKY_*, STEP_LABELS | profiles (venditore), stores (negozio), brands, brand_products, product_categories. |
| **Step 1** | venditore, negozio | venditore_id → profiles, negozio_id → stores. |
| **Step 2** | tipoCliente (privato/business), lookupValue (CF/PIVA), clienteFound, anConsumer (nome, cognome, cf, email, numeroFisso, cellulare, iban, domicilio, note), anBusiness (ragioneSociale, piva, referente, numeroFisso, mobile, email, pec, codiceUnivoco, iban, sedeLegale, note) | clients lookup; anagrafica_snapshot JSONB on pda_submissions if no client_id. |
| **Step 3–4** | brand, allSales (per category: product, fields, skyPkt, skyTech, skyDec, …) | pda_submissions.brand_id; pda_items per line: category, product_name, fields JSONB, sky_pkt, sky_tech, sky_dec. |
| **Cart** | cart[]: brandId, brandLabel, items[] (macro, sub, saleNum, details), sv (snapshot) | On submit: one pda_submissions + N pda_items. |
| **Submit** | finalSubmit: build payload from cart + current colItems | Insert pda_submissions, then pda_items with fields from each item. |

---

### 9.5 PDA Tracking (`/pda/tracking`) — Agent view

| Item | Source (mock) | DB / Notes |
|------|----------------|------------|
| **List row** | mockTrackingData: avatar, categoria, brand, venditore, inviato_il, stato, nominativo | Same as Gestione but filtered by venditore_id = current user (or store). |
| **Filters** | Ragione sociale / Nominativo, Codice contratto, Codice ordine, Tipo (e.g. ENERGIA), Venditore, Stato attivazione, Da/A data importazione, creazione, firma, gestione, attivazione | pda_submissions + optional columns (codice_contratto, codice_ordine, dates). Add columns if needed for “data importazione”, “data firma”, etc. |
| **Table columns** | Avatar, Categoria, Brand, Venditore, Inviato il, Stato, Nominativo | From pda_submissions + client or anagrafica_snapshot. |
| **Actions** | Filtra, Esporta CSV | Query with same filters; export CSV from result set. |

---

### 9.6 Ricerca Contratto (`/ricerca-contratto`)

| Item | Source (mock) | DB / Notes |
|------|----------------|------------|
| **RBAC** | isGlobalView (admin, supervisore, back_office); lockedStore, lockedVenditore for others | RLS: non-global users see only their store / themselves as venditore. |
| **List row** | mockContrattiData: id, venditore, brand, prodotto, cliente, negozio, codice_attivazione, data_registrazione, data_attivazione, stato | contracts (header) + first contract_items row or aggregate for brand/prodotto; cliente from clients. |
| **Filters** | Venditore (disabled if !isGlobalView), Codice contratto, IMEI, Brand, Prodotto, Negozio di attivazione (disabled if !isGlobalView), Codice di attivazione, Cliente (Nome/CF/P.IVA), Numero di cellulare, Da/A data attivazione, Da/A data registrazione | contracts + contract_items + clients. IMEI: store in contract_items.payload or add column if needed. |
| **Table columns** | Venditore, Brand, Prodotto, Cliente, Negozio, Codice Attivazione, Data Registrazione, Data Attivazione, Stato, Azioni (Visualizza, Modifica) | contracts + join clients, stores, profiles; prodotto from first contract_items or display_label. |

---

### 9.7 Registra Contratto (`/registra-contratto`)

Documented in **§ 3.7, 3.8, 3.9, 3.8.1**. Summary:

- **Steps 1–7**: Brand, Tipo Cliente, Anagrafica (clients), Prodotti (sales/emS → contract_items.payload), Allegati (contract_attachments), Attribuzione (venditore_id, store_id, data_registrazione), Note (contracts.note).
- **Filters / table**: None (form-only). Cart view shows brand groups and items with details.
- **Submit**: One `contracts` row; N `contract_items` with full payload; N `contract_attachments`.

---

### 9.8 Clienti (`/clienti`)

| Item | Source (mock) | DB / Notes |
|------|----------------|------------|
| **List row** | Cliente: id, tipo, nome, cognome?, ragioneSociale?, cellulare, email, cf_piva, indirizzo, citta | `clients` table. |
| **Filters** | quickSearch (full-text), filterTipo (tutti/consumer/business), filterNome, filterCognome, filterRagione, filterCellulare, filterEmail, filterIdentifier (CF/P.IVA) | Query clients with filters. |
| **Pagination** | itemsPerPage (25), currentPage | DB: LIMIT/OFFSET or Supabase range. |
| **Detail modal** | Cliente + Contratti (id, data, brand, categoria, stato) | clients by id; contracts where client_id = id. |
| **Contratto in modal** | getMockContratti: id, data, brand, categoria, stato | contracts + contract_items (brand, category); data = data_registrazione. |

---

### 9.9 Chiusura Negozio (`/chiusura`)

| Item | Source (mock) | DB / Notes |
|------|----------------|------------|
| **Overlays** | invio (upload), fatture (Vista Fatture), gestione (Vista Gestione) | store_closures + closure_attachments; Vista Fatture from attachments where doc_type = fatture. |
| **Invio Chiusura** | Data, Negozio, Operatore; per società: active, files (cassa, pos, ddt_w3, ddt_vf, fatture), note; handleSend | store_closures (store_id, company_id, closure_date, closure_time, user_id); closure_attachments (doc_type, file_name, storage_path). Upload files to Storage. |
| **Vista Gestione** | history = Chiusura[]: id, store, societa, date, user, docs (counts per type), time, attachments[] | store_closures + closure_attachments (counts). Filters: Negozio (admin), Società, Da/A date. Table: Data, Ora, Negozio (admin), Società, Operatore (admin), Cassa, POS, DDT W3, DDT VF, Fatture, expand row → allegati per type. |
| **Vista Fatture** | Fattura: id, filename, store, societa, date, user, closureId, emessa | From closure_attachments where doc_type = 'fatture'; optionally `invoices` table with emessa, numero_fattura. Filters: Negozio, Società, Da/A date. Tabs: Da Emettere / Emesse. Toggle emessa on save. |

---

### 9.10 Usati — Gestione Usati (`/usati`)

| Item | Source (mock) | DB / Notes |
|------|----------------|------------|
| **List row** | Device: id, model, imei, status, sale_price, purchase_price, store, target_store, created_at, purchase_date, listed_date, sold_date, ricambi[], note_tecnico, status_history, provenienza_subito, extra_margine, pagamento, grado_usura | used_devices + device_status_history, device_ricambi, device_payments, device_extra_margins. |
| **Filters** | Status (STATUS_LIST), Store (NEGOZI), Date (created_at, purchase_date, listed_date, sold_date), Cerca Modello/IMEI, Venditori, Operatori | used_devices + filters. |
| **KPI cards** | Totale, Acquistato, Arrivo in Negozio, In Vendita, Venduto | Count by status. |
| **Add device form** | venditore, negozio, provenienzaSubito, tipoCliente, anagrafica (nome, cognome, cf, email, cellulare, via, cap, citta, ragioneSociale, nomeRef, cognomeRef, recapito), tipoProdotto, brand, model, capacita, colore, imei, prezzoAcquisto, gradoUsura, extraMargine (importo, venditore), metodoPagamento, iban, allegati (documento_id, dichiarazione_vendita) | New used_devices row; optional client link; device_status_history first row; device_payments; device_extra_margins; attachments in Storage + optional table. |
| **Device panel (edit)** | Same fields + ricambi, status change, pagamento (bonifico_effettuato, operatore, date), extra_margine (confermato, conferma_operatore, conferma_date), note_tecnico | Update used_devices, device_status_history, device_ricambi, device_payments, device_extra_margins. |
| **Constants** | NEGOZI, PHONE_BRANDS_MODELS, RICAMBI_CATALOG, VENDITORI, OPERATORI, GRADI_USURA, CAPACITA_OPTIONS, COLORI_OPTIONS | stores, phone_brands + phone_models, ricambi_catalog, profiles. |

---

### 9.11 Documentazione (`/documentazione`)

| Item | Source (mock) | DB / Notes |
|------|----------------|------------|
| **Brands** | BRANDS: id, name, color, borderColor, text, bg, icon, logo | brands (id, name, logo_url, etc.). |
| **Categories** | CATEGORIES: id, name, icon, desc (Canvass, Modulistica, Operativa) | doc_categories. |
| **Docs** | MOCK_DOCS[brandId][catId]: id, name, type, size, date, fillable | documentation_files (brand_id, category_id, name, file_type, size_bytes, storage_path, fillable, published_at). |
| **UI** | Brand selection → Category selection → List of files; Admin: upload, edit, delete; Preview / fillable | CRUD on documentation_files; serve files from Storage. |

---

### 9.12 Calendario (`/calendario`)

| Item | Source (mock) | DB / Notes |
|------|----------------|------------|
| **Appointments** | id, date, time, type (incoming/outgoing/self_generated), agente, store?, customerAddress?, customerName, customerPhone, cfPiva?, notes, esitoNote?, status | appointments table. Filters: store (MOCK_STORES), agent (MOCK_AGENTS). |
| **Tasks** | id, title, date, time?, status (da_fare, fatta, sospesa), notes, clientRef, createdBy, assignedTo | calendar_tasks. |
| **Create appointment** | time, type, agente, store, customerAddress, customerName, customerPhone, cfPiva, notes | Insert appointments. |
| **Create task** | title, date, time, status, notes, clientRef, assignedTo | Insert calendar_tasks (created_by_id = current user). |
| **Search** | searchQuery, searchCfPiva, searchPhone, searchAgent | Filter appointments/tasks. |
| **Grid filters** | filterStore, filterAgent (admin) | Filter by store_id, agente_id. |

---

### 9.13 Comunicazioni (`/comunicazioni`)

| Item | Source (mock) | DB / Notes |
|------|----------------|------------|
| **List row** | id, title, date, type (info/warning/success), content, read | communications + communication_reads (per user). |
| **Read state** | read: boolean per item per user | communication_reads (communication_id, user_id, read_at). |
| **Badge** | Unread count (e.g. bell with dot) | Count where no communication_reads for current user. |

---

### 9.14 API `/api/smartphones`

| Item | Source (mock) | DB / Notes |
|------|----------------|------------|
| **Response** | JSON: { Apple: ["iPhone 17 Pro Max", ...], Samsung: [...], ... } | Query phone_brands + phone_models; or keep static JSON and sync from DB. |

---

This schema and appendix leave no flow behind: every page, filter, column, and form field has a clear mapping to tables and policies. Next step is to run migrations in Supabase and then replace each mock in the app with Supabase client calls (and, where needed, Storage for files).
