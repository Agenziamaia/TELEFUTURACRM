# TrackingPDA — Developer Specification

**Component:** `TrackingPDA`  
**File:** `TrackingPDA_v1.jsx`  
**Stack:** React (no JSX transpiler — pure `React.createElement`), no external dependencies  
**Purpose:** Post-registration contract monitoring dashboard for Telefutura CRM (multi-brand telecom/energy reseller, ~13 stores in Rome area)

---

## 1. Integration

The component is self-contained and exports a single default:

```js
export default TrackingPDA;
```

Mount it as a full-page route inside the existing Next.js app (e.g. `/tracking-pda`). It requires no props. All state is internal.

**Required globals at mount time:** `React`, `useState`, `useMemo` (already available in the Next.js bundle).

---

## 2. File Structure

```
TrackingPDA_v1.jsx
├── makeSampleData()          — 41 hardcoded sample records (replace with API call)
├── STATI_* arrays            — state definitions per category
├── MALUS_SOGLIE / MALUS_IMPORTO — malus threshold config objects
├── Helper functions
│   ├── giorniLavorativiDa()  — counts working days (Mon–Sat) from a date string
│   ├── giorniDaUltimoAggiornamento() — days since last storia event
│   ├── getStatoN/A/etc.      — state lookup helpers
│   ├── isAttenzioneRow()     — Warning filter logic
│   ├── isDaLavorareRow()     — Da Lavorare filter logic
│   ├── isMalusRow()          — Malus filter logic
│   └── calcolaMalus()        — computes accrued malus amount in €
├── UI Components
│   ├── StatoBadge            — colored pill badge for negozio/admin states
│   ├── CatBadge              — category chip
│   ├── KpiBar                — top KPI cards + toggle checkboxes
│   ├── FilterBar             — category/brand/stato/period filters
│   ├── Tabella               — main data table
│   ├── Drawer                — side panel detail view (3 tabs)
│   └── TrackingPDA           — root component
```

---

## 3. Data Model

Each contract record (`row`) has this shape:

```js
{
  id:               Number,
  categoria:        "mnp" | "fisso" | "finanziamento" | "piva" | "energia" | "sky",
  brand:            "Vodafone" | "Fastweb" | "WindTre" | "Iliad" | "Tim" | "S4 Energy" | "Sky",
  negozio:          String,          // store name
  venditore:        String,          // seller name
  nominativo:       String,          // customer full name
  telefono:         String,
  numContratto:     String,          // "CNT-XXXX"
  numAttivazione:   String,          // brand-prefixed activation code
  dataInserimento:  String,          // "DD/MM/YYYY" — contract registration date
  statoNegozio:     String,          // current negozio state id
  statoAdmin:       String,          // current admin state id
  storia:           Array<StoricoEvent>,
  cf:               String,          // codice fiscale
  indirizzo:        String,

  // Category-specific optional fields:
  // MNP
  codiceNegozio?:         String,
  numProvvisorio?:        String,
  iccid?:                 String,
  hasPda?:                Boolean,
  hasDocumenti?:          Boolean,
  // Fisso
  gnp?:                   Boolean,   // has number portability
  numFissoProvvisorio?:   String,
  numFissoDefinitivo?:    String,
  // Finanziamento
  tipoFinanziamento?:     "Findomestic" | "Compass",
  modelloTelefono?:       String,
  numeroPratica?:         String | null,  // Vodafone only
  // P.IVA
  followup?:              Array<FollowupSlot>,  // 3 fixed slots
  // Energia
  tipoEnergia?:           "Luce" | "Gas",
  pod?:                   String | null,
  pdr?:                   String | null,
}
```

```js
// StoricoEvent
{
  data:    String,   // "DD/MM/YYYY"
  tipo:    "inserimento" | "cambio_stato" | "nota" | "nota_admin",
  testo:   String,
  utente:  String,
  ruolo:   "sistema" | "negozio" | "admin",
}

// FollowupSlot (P.IVA only, always 3 items)
{
  label:  "Follow-up 1" | "Follow-up 2" | "Follow-up 3",
  data:   String,   // "DD/MM/YYYY" or ""
  esito:  String,
  note:   String,
}
```

---

## 4. State Definitions

### Negozio states per category

| Constant | Category |
|---|---|
| `STATI_NEGOZIO` | base (fallback) |
| `STATI_NEGOZIO_MNP` | MNP — inherits base, removes doc_mancante/contattare_supporto, adds re_inserita |
| `STATI_NEGOZIO_FISSO` | Fisso — custom set with KO variants |
| `STATI_NEGOZIO_FINANZIAMENTO` | Finanziamento — dedicated set |
| `STATI_NEGOZIO_PIVA` | P.IVA — dedicated set |
| `STATI_NEGOZIO_ENERGIA` | Energia — custom set |
| `STATI_NEGOZIO_SKY` | Sky — fully custom set |

Each state object: `{ id: String, label: String, color: String, bg: String }`

### Admin states

`STATI_ADMIN` — universal 6-state set used by all categories:

| ID | Label IT |
|---|---|
| `da_verificare` | Da Verificare |
| `in_lavorazione` | In Lavorazione |
| `non_conforme` | Non Conforme |
| `confermato` | Confermato |
| `pagato` | Pagato |
| `stornato` | Stornato |

**Exception — Finanziamento:** uses `STATI_ADMIN_FINANZIAMENTO`, which extends the base 6 states with:

| ID | Label IT |
|---|---|
| `stornato_da_ripagare` | Stornato, Da Ripagare |
| `ripagato` | Ripagato |

The Drawer admin tab selects the correct set via:
```js
row.categoria === "finanziamento" ? STATI_ADMIN_FINANZIAMENTO : STATI_ADMIN
```

---

## 5. Filter Logic

All three alert filters are **mutually exclusive** (Malus wins over Warning, Warning wins over Da Lavorare). A completed contract is excluded from all three.

**Completed states per category:**

| Category | Completed state IDs |
|---|---|
| MNP | `attivato`, `re_inserita` |
| Fisso | `attivato` |
| Finanziamento | `liquidato` |
| P.IVA | `attivato` |
| Energia | `attivato` |
| Sky | `completo_sky`, `attivo_sky` |

### `isMalusRow(row)` — checked first

| Category | Trigger | €/working day |
|---|---|---|
| MNP | `ggAgg >= 6` | €5 |
| Fisso | `ggAgg >= 15` | €10 |
| Finanziamento | `ggAgg >= 6` | €10 |
| P.IVA | not active (returns false) | €5 (future) |
| Energia | `ggAgg >= 15` | €10 |
| Sky | Sky Warning conditions AND `ggAgg >= 2` | €5 |

`ggAgg` = working days since last `storia` event.

Malus amount: `Math.max(0, ggAgg − soglia + 1) × importo`

### `isAttenzioneRow(row)` — Warning, checked second

Returns false immediately if `isMalusRow(row)` is true.

| Category | Triggers |
|---|---|
| MNP | `ggAgg >= 5` OR `giorni_dall_inserimento >= 5` (not completed) |
| Fisso | `ggAgg >= 10` OR `giorni_dall_inserimento >= 20` |
| Finanziamento | `ggAgg >= 4` |
| P.IVA | `ggAgg >= 4` OR `giorni >= 10` OR `(stato == cliente_irreperibile AND ggAgg >= 2)` |
| Energia | `ggAgg >= 10` |
| Sky | `(stato == nuovo AND giorni >= 4)` OR `ggAgg >= 10` |

### `isDaLavorareRow(row)` — checked last

Returns false if `isAttenzioneRow` or `isMalusRow` is true.

| Category | Triggers |
|---|---|
| MNP | `ggAgg >= 2` |
| Fisso | `ggAgg >= 5` |
| Finanziamento | `ggAgg >= 2` |
| P.IVA | `ggAgg >= 2` OR `stato == cliente_irreperibile` |
| Energia | `ggAgg >= 5` |
| Sky | `(stato == nuovo AND giorni >= 2)` OR `stato == wm_sospetta` OR `(stato == attesa_matricola AND ggAgg >= 5)` OR `(stato == aperto_sparks AND ggAgg >= 3)` |

---

## 6. Component: KpiBar

**Props:**

| Prop | Type | Description |
|---|---|---|
| `data` | Array | Pass `filteredPerKpi` (all filters active except kpiFilter) |
| `onFilter` | Function | `(filterKey) => void` |
| `activeFilter` | String\|null | Current active KPI filter |
| `escludiConfermati` | Boolean | Toggle |
| `setEscludiConfermati` | Function | |
| `escludiCompletati` | Boolean | Toggle |
| `setEscludiCompletati` | Function | |

**KPI filter keys:**

| Key | Filters for |
|---|---|
| `null` | all records |
| `"nuovo"` | `statoNegozio === "nuovo"` |
| `"__da_lavorare__"` | `isDaLavorareRow && !isMalusRow` |
| `"__attenzione__"` | `isAttenzioneRow && !isMalusRow` |
| `"__malus__"` | `isMalusRow` |
| `"__non_conforme__"` | `statoAdmin === "non_conforme"` |

The KpiBar also renders two checkbox toggles below the cards:
- **Escludi pratiche confermate o superiori** — hides `statoAdmin ∈ {confermato, pagato, stornato}`
- **Escludi pratiche completate** — hides `statoNegozio ∈ {attivato, liquidato, completo_sky, attivo_sky}`

---

## 7. Component: FilterBar

**Props:** `catSel`, `setCatSel`, `brandSel`, `setBrandSel`, `search`, `setSearch`, `statoSel` (Array), `setStatoSel`, `periodoDA`, `setPeriodoDA`, `periodoA`, `setPeriodoA`

Three rows of filters:
1. **CATEGORIA** — multi-select chips (6 categories). Changing selection resets `statoSel`.
2. **BRAND** — multi-select chips, always shows all 6 brands: Vodafone, Fastweb, WindTre, Iliad, Tim, S4 Energy. (Sky contracts use brand "Sky" and category "sky" — the Sky brand chip is not shown; filter by categoria "Sky" instead.)
3. **Row 3:** search input + stato dropdown (custom multi-select with checkboxes) + period date pickers.

The stato dropdown (`statoSel` is an Array) dynamically builds its option list from `statiDisponibili`, which is derived from the active `catSel`. If no category is selected, all states across all categories are shown (deduplicated).

---

## 8. Component: Tabella

**Props:** `rows` (Array), `onSelect` (Function)

Columns: Categoria · Brand · Nominativo · Negozio · Venditore · Data · Esito Negozio · Esito Admin · Malus · Stato Pratica

**Malus column:** shows `€ X` badge + `(€Y/gg)` label for rows where `isMalusRow === true`, otherwise `—`. Row background is `#2d0a0a` (dark red tint) for Malus rows.

**Stato Pratica column:** shows a colored pill — 🔴 Malus / ⚠️ Warning / ⚡ Da Lavorare / `—`. Entire row is clickable and calls `onSelect(row)`.

**Footer:** shows row count + aggregate malus badge (`N in Malus — € X maturati`) if any Malus rows are visible.

---

## 9. Component: Drawer

Side panel mounted at `position: fixed, right: 0` with `z-index: 1000`. Closed by clicking the backdrop overlay.

**Props:** `row`, `onClose`, `onUpdate`, `ruolo` (`"negozio"` | `"admin"`)

Three tabs:

### Tab 1 — Esito Negozio
- Contract summary fields (nominativo, CF, telefono, indirizzo, brand, categoria, data)
- Category-specific panel (conditional on `row.categoria`):
  - **MNP:** codice negozio, numero provvisorio, ICCID, PDA download, documents download
  - **Fisso + GNP:** N. Fisso Provvisorio + N. Fisso Definitivo (shown only if `row.gnp === true`)
  - **Finanziamento:** tipo finanziamento badge, codice negozio, modello telefono, numero pratica (Vodafone only), PDA/docs buttons
  - **Energia:** tipo fornitura badge (Luce/Gas), POD or PDR code in monospace
  - **P.IVA + Cliente Irreperibile:** 3 fixed follow-up slots (each with date, esito, note fields)
- Negozio state selector (pills) — uses `getStatiNegozioPerCategoria(row.categoria)`
- Nota negozio textarea
- "Salva Esito Negozio" button → calls `onUpdate` with updated row + new storia event

### Tab 2 — Esito Admin
- Reference display of current negozio esito
- Admin state selector — uses `STATI_ADMIN_FINANZIAMENTO` if `categoria === "finanziamento"`, else `STATI_ADMIN`
- Nota admin textarea
- "Salva Esito Admin" button (violet) → calls `onUpdate` + storia event

### Tab 3 — Storico
- **Malus panel** (shown only if `isMalusRow(row)`): 3-cell grid showing entry date, days in malus, total amount + formula
- Reverse-chronological event timeline, unified negozio+admin events. Each event tagged with origin label (NEGOZIO indigo / ADMIN violet / SISTEMA gray).

---

## 10. Replacing Sample Data with Real API

Replace `makeSampleData()` (called in `useState` initializers) with an async fetch. Since `useState` doesn't accept a Promise directly, initialize with `[]` and populate via `useEffect`:

```js
// In TrackingPDA(), replace:
var [data, setData] = useState(makeSampleData);

// With:
var [data, setData] = useState([]);
useEffect(function() {
  fetch("/api/tracking-pda/contracts")
    .then(function(r) { return r.json(); })
    .then(function(rows) { setData(rows); });
}, []);
```

The API must return an array of objects matching the data model in §3. The `storia` array must be sorted chronologically (oldest first). The `dataInserimento` field must be `"DD/MM/YYYY"` format — the date arithmetic functions parse this format directly.

---

## 11. Saving Changes

When the user clicks "Salva Esito Negozio" or "Salva Esito Admin", the Drawer calls `onUpdate(updatedRow)`. In the current prototype this updates local React state only. In production, add a `PATCH /api/tracking-pda/contracts/:id` call inside the save handler before calling `onUpdate`.

The save handler appends a new event to `row.storia` before saving — the API should persist this new event alongside the updated `statoNegozio` / `statoAdmin`.

---

## 12. Key Constraints

- **No optional chaining (`?.`)** — the codebase avoids this syntax for transpiler compatibility. Use explicit null checks.
- **No `var` hoisting issues** — all variables use `var` (not `const`/`let`) as required by the project's transpiler config.
- **No Babel standalone** — the file is transpiled at build time by the Next.js pipeline.
- **No IIFEs in JSX** — immediately invoked functions inside `React.createElement` are avoided; logic is extracted to named variables or functions before the return statement.
- **Date format:** always `"DD/MM/YYYY"` — the working-day calculators parse this format. Do not change to ISO format without updating `giorniLavorativiDa()` and `giorniDaUltimoAggiornamento()`.
- **Working days:** Monday–Saturday. Sundays are excluded. Public holidays are not currently excluded.
