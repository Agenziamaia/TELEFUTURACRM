# TECHNICAL SPECIFICATION — Dashboard / Homepage

**Reference JSX:** `Dashboard_v1_3.jsx` (1382 lines)
**Priority:** Core section — first page every user sees after login
**UI Language:** Italian (all labels, buttons, placeholders)
**Prerequisite:** "Gestione Target" admin section must be built first (see §11)

---

## 1. OVERVIEW

The Dashboard is the CRM homepage. It is a **read-only operational panel** (not analytical — Analytics is a future section). It answers three questions in 10 seconds: "How is the company doing? How is my store doing? What do I need to do?"

The page renders different blocks depending on the user's role. There are three organizational areas — **Punti Vendita (PV)**, **Call Center (CC)**, and **Outbound (OB)** — plus **Admin**, each with distinct dashboard layouts.

---

## 2. ROLE → VIEW MAPPING

| Role | Area | Blocco A | Blocco D+E | Blocco B | Blocco C | Blocco OB |
|------|------|----------|------------|----------|----------|-----------|
| Venditore | PV | ✅ | — | — | Full | — |
| Store Manager | PV | ✅ + store contrib | — | ✅ own store | Full | — |
| Supervisore | PV | ✅ + store contrib | — | ✅ store selector | Full | — |
| Admin | Admin | ✅ | ✅ | ✅ any store | Admin view | — |
| Caller (CC Operator) | CC | ✅ | — | — | No monitoraggio, no appuntamenti | — |
| Dir. Call Center | CC | ✅ | — | — | CC team + personal, no monitoraggio | — |
| Agente (OB Agent) | OB | — | — | — | — | ✅ |
| Dir. Outbound | OB | — | — | — | — | ✅ + team |

**Key:** Every role that belongs to PV — including Store Manager, Supervisore — is also a vendor with individual production. They always see their personal data (Blocco C).

---

## 3. BLOCCO A — Target Aziendale (PV + CC + Admin)

Visible to all PV roles, all CC roles, and Admin. **NOT visible to OB roles.**

5 cards in a row, one per brand with active targets: **WindTre, Vodafone, Sky, Fastweb, Energia**.

Each brand card shows:
- Brand icon + name
- **Main number: average percentage** across all sub-categories (capped at 100% per category before averaging). E.g., if Fisso is at 130% and Luce-Gas at 60%, the average is (100+60)/2 = 80%, not (130+60)/2.
- Label: "media N categorie · X/N in target"
- **Dual progress bar** (actual = solid, projection = semi-transparent on same track)
- Below bar: actual count → projection / target
- Ritmo richiesto/giorno
- For Store Manager / Supervisore: "Il tuo negozio: X su Y" showing the store's contribution

**Sub-categories per brand (expanded by default, collapsible):**

| Brand | Aziendale Categories |
|-------|---------------------|
| WindTre | Fisso, Luce-Gas, Assicurazioni |
| Vodafone | Fisso, Energy |
| Sky | 3P, TV |
| Fastweb | Mobile, Energy |
| Energia | S4 |

Each sub-category row shows: name, actual → projection/target, dual progress bar.

**Header displays:** "X giorni lavorati" + "Y rimasti" (two separate badges).

Working days are calculated as Lun-Sab for the aziendale-level view.

---

## 4. BLOCCO B — Target Negozio (Store Manager, Supervisore, Admin)

Shows the selected store's performance. Same 5 brands but with **more granular sub-categories** per brand:

| Brand | Negozio Categories |
|-------|-------------------|
| WindTre | Mobile GA, Mobile CB, Fisso, Luce-Gas, Assicurazioni, Multi-Servizi |
| Vodafone | Mobile GA, Mobile CB, Fisso, Energy, Multi-Servizi |
| Sky | 3P, TV, Sport, Bundle |
| Fastweb | Mobile, Fisso, Energy |
| Energia | S4, Barton |

Each brand card shows:
- **Average % across all its categories** (capped at 100% per category)
- Expanded by default — all categories visible with dual bars
- Working days are per-store (some stores are Lun-Sab, others Lun-Ven)

**Store selector:**
- Supervisore: toggle buttons for assigned stores
- Admin: dropdown with all stores

**Team sub-section (B2):**
- Table of all sellers in the store, sorted by projection % (worst first)
- Each row: status dot (green/yellow/red) + name + actual → proj/target + %
- Expandable: click shows "Target raggiunti: X/5" summary + per-brand detail with icon, actual, projection/target, status emoji
- Sellers below 80% projection are highlighted red

**Monitoraggio Pratiche Negozio (B3):**
- "Da Lavorare + Warning" card with count → click links to Tracking PDA filtered on store
- "Pratiche Perse — Ultimo Bimestre" expandable card (KO + Non Pagate breakdown)

---

## 5. BLOCCO C — Personal Data (All PV + CC roles)

Everyone is a vendor — managers included. This block shows individual performance.

**C1 — I Miei Target:**
- Summary: "X in linea · Y a rischio · Z sotto tono" (3 colored boxes)
- Per-brand rows: icon + name + actual → projection/target + dual bar
- **All numbers use projection as primary, actual as secondary**
- "👀 Guarda chi sta facendo meglio di te" expandable button — shows only brands where user is below 100%, with the name of a peer (same store type for PV, same group for CC) who projects better

**C2 — Classifica:**
- **PV roles see only PV leaderboard**
- **CC roles see only CC leaderboard**
- **Admin sees 3 tabs: 🏪 PV / 📞 CC / 🚗 OB**
- Toggle: 💰 Fatturato (projection) / 🎯 % Target
- "La tua posizione: X° su Y"
- **Scrollable list** (fixed height container ~240px, overflow-y auto) — all sellers visible by scrolling
- Medals 🥇🥈🥉 for top 3, numbers for rest
- Current user highlighted in blue

**C3 — Monitoraggio Pratiche (PV only, hidden for CC/OB):**
- Renamed from "Le Mie Criticità" — it's a document tracking section, not a performance judgment
- "Da Lavorare + Warning" count → link to Tracking PDA
- "Pratiche Perse — Ultimo Bimestre" expandable (KO vs Non Pagate)
- **"Pratiche Perse" = KO + Non Pagate shown as single number, expandable to breakdown**
- KO = contract never activated
- Non Pagate = contract activated but commission lost (client churned/cancelled within operator-specific timeframes). Status set by Back Office in Gestione PDA.
- **Bimestre = last 2 months**, not last month (current month data is unreliable)

**C4 — Appuntamenti Oggi (PV only, hidden for CC):**
- PV vendors in-store: show store appointments for today (all appointments assigned to the store)
- Outbound agents: show individual appointments
- Link: "Vedi calendario →" → deep-link to Calendario with today's date

---

## 6. BLOCCO D+E — Admin Only

**D — Piste (stores under target):**
- 5 cards (one per brand), each listing stores projecting below 80%
- Sorted by worst first
- Shows: store name, projection %, proj/target

**E — Mappa Criticità Globale (Ultimo Bimestre):**
- Table: one row per store, columns = Da Lavorare, Warning, Pratiche Perse, Totale
- Sorted by total descending (worst stores first)

---

## 7. ADMIN DASHBOARD — Panoramica Operativa (replaces Blocco C)

Admin does NOT have personal production. Instead of Blocco C, Admin sees:

**Appuntamenti Oggi (left card):**
- Total count across all stores
- Toggle: 🏪 Punti Vendita (bar chart per store) / 👤 Agenti (bar chart per agent)

**Monitoraggio Pratiche — Tutti i Negozi (right card):**
- Toggle: 📋 Da Lavorare + Warning / 🔴 Pratiche Perse
- Each view shows horizontal stacked/single bars per store, sorted by severity
- Legend at bottom

---

## 8. BLOCCO OB — Outbound Dashboard (Agente + Dir. Outbound)

Completely different layout. OB agents do NOT see Blocco A, B, or C.

**Fatturato (left card):**
- **3 numbers equally visible:** TARGET | ATTUALE | PROIEZIONE
- Motivational message based on projection vs target:
  - 🔥 ≥100%: "Stai spaccando!"
  - 💪 ≥85%: "Quasi! Mancano €X — spingi!"
  - ⚡ ≥60%: "Sveglia! Servono €X/gg per chiudere."
  - 🚨 <60%: "Allarme rosso. €X/gg da oggi o non chiudi."
- Dual progress bar + gap from target
- Border-left color matches mood

**Punti & Soglie (right card):**
- Current points + current threshold
- Projected points + projected threshold
- **Next threshold incentive:** "🎯 Ti mancano X pt per Soglia Y — saliresti a €Z/pt retroattivo: +€N in più!"
- The money shift is calculated as: `(projected_points × next_threshold_pay) - (projected_points × current_threshold_pay)` — because pay-per-point is retroactive across ALL points
- 5 thresholds visualized with dot indicators (passed = green, current = yellow, future = gray)
- Projected earnings at bottom

**Pay-per-point thresholds (retroactive):**

| Threshold | Points Range | Pay/Point |
|-----------|-------------|-----------|
| Soglia 1 | 0–200 | €6 |
| Soglia 2 | 200–300 | €7 |
| Soglia 3 | 300–400 | €8.50 |
| Soglia 4 | 400–500 | €10 |
| Soglia 5 | 500+ | €12 |

**Distribuzione Punti per Brand (left, row 2):**
- Horizontal bars showing which brands contribute points
- Per brand: icon + name + bar + points + percentage

**Classifica Agenti (right, row 2):**
- OB-only leaderboard (not mixed with PV or CC)
- Toggle: 💰 Fatturato / 🎯 % Target
- **Scrollable** (fixed height ~200px)
- Position indicator + medals for top 3

**Gestione Pratiche (row 3, full width):**
- 4 cards in a row: Inviate | In Lavorazione | Attesa Inserimento | Con Problema
- Click → deep-link to **Gestione PDA** (NOT Tracking PDA)

---

## 9. DIR. OUTBOUND — Team View

Same as Agente but with **team overview at the top:**
- Ranked list of all OB agents: position, name, projected points + threshold, projected revenue
- **Clickable:** expanding an agent reveals two panels:
  - **Punti per Brand:** bar chart showing point distribution by brand
  - **Consumer vs Business:** split bars (blue/orange) per brand showing client type mix

---

## 10. DIR. CALL CENTER — Team View

Same as Caller but with **team overview card** above personal data:
- Ranked list of all CC operators: position, status dot, name, actual → proj/target, percentage
- Shows all operators in the call center

---

## 11. PREREQUISITE: "Gestione Target" Admin Section

**Must be built before the Dashboard can use real data.**

This is a separate admin-only section in the sidebar where targets are configured:

**Per store:**
- Working days (checkboxes Lun–Sab, configurable per store)
- Monthly target per brand per sub-category (using BRAND_CATS_NEG structure)

**Per seller:**
- Monthly target per brand + total target
- For OB agents: revenue target + points target (instead of brand targets)

**Per company (aziendale):**
- Monthly target per brand per sub-category (using BRAND_CATS_AZ structure)

**Historicization:** Targets must be stored month-by-month. Setting March targets does not overwrite February. Consider a "copy from previous month" feature as starting point.

---

## 12. DATA SOURCES

| Dashboard element | Source |
|-------------------|--------|
| "Vendita fatta" (contract count) | Registra Contratto entries, excluding status = KO or Annullata |
| KO count | Gestione PDA, admin status = KO Credito / KO Doc / KO |
| Non Pagate count | Gestione PDA, specific BO-set status (to be defined per operator) |
| Da Lavorare / Warning | Tracking PDA filters (existing rules) |
| Appointments | Calendario section |
| Targets | Gestione Target (to be built) |
| Working days | Per-store config in Gestione Target |
| Store type (multibrand/franchising) | Store registry (field to be added) |

---

## 13. DUAL PROGRESS BAR

Used throughout the dashboard. Two overlapping bars on the same track:
- **Solid bar (foreground):** actual production
- **Semi-transparent bar (background, 25% opacity):** projected production
- Both use the same color (determined by projection percentage)
- Micro-legend below: solid square = "attuale", transparent square = "proiezione"

---

## 14. DEEP-LINK PARAMETERS

The dashboard links to other sections with pre-set filters:
- "Vai al Tracking PDA →" must pass: `?filter=warning&seller={id}` or `?filter=warning&store={id}`
- "Vedi calendario →" must pass: `?date=today`
- "Vai a Gestione PDA →" (OB only) must pass: `?seller={id}`

Exact URL parameter format to be aligned with the existing routing structure.

---

## 15. CALCULATIONS

**Projection:** `(actual / working_days_passed) × total_working_days_in_month`

**Ritmo richiesto:** `(target - actual) / working_days_remaining`

**Average % (brand level):** `average of min(category_projection_%, 100) for each category` — each category is capped at 100% before averaging to prevent overperformers from masking underperformers.

**OB earnings projection:** `projected_points × threshold_pay_rate` where threshold is determined by projected points (retroactive — the rate applies to ALL points, not just those in the threshold range).

---

## 16. EXCLUDED FROM DASHBOARD (future sections)

- Trend charts and historical graphs → Analytics
- Full seller rankings with detailed stats → Analytics
- Conversion rates per brand → Analytics
- Malus system → stays in Tracking PDA only
- Communications → parked (Discord replacement TBD)
- Badge/timekeeping widgets → not needed, dashboard stays lean
- Pending orders indicator → not needed
- Missing store closures indicator → not needed
