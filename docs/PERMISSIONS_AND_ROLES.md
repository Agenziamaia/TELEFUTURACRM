# Permissions, Roles & Section Behaviors — READ BEFORE TOUCHING VISIBILITY

> **TL;DR for every developer:** who sees what, and how a section behaves per
> role, is **configured by the admin from the CRM UI** (Amministrazione →
> Utenti → Permessi / Ruoli), backed by Supabase. **Never hardcode a role
> check for visibility or for a configurable behavior again.** Hardcoded
> checks escape the admin panel and create two sources of truth.

## The three building blocks

### 1. Menu & page visibility — `src/lib/nav.ts` + table `role_permissions`
- The **entire menu structure lives in `src/lib/nav.ts`** (`NAVIGATION`):
  links, groups (with `group:<label>` master key), hubs, hub sections
  (`/amministrazione?sez=X`) and sub-functions (`...&tab=Y`), each with its
  **default roles**.
- The Sidebar renders from it, **AuthContext blocks routes from it**
  (`routeBases()`), and the Permessi page administers it.
- Table `role_permissions (role, perm_key, allowed)` stores **overrides
  only**; `perm_key` = the item's href/key as written in nav.ts. No row =
  code default. Resolution: `effectiveAllowed()` — admin/dev always true →
  explicit row → outbound rule → code default.
- **Rule:** to add a menu item or change who sees a section by default, edit
  `nav.ts`. Do **not** add role checks in Sidebar, AuthContext or pages.

### 2. Section behaviors ("capabilities") — `src/lib/capabilities.ts`
- When a section behaves **differently per role** (e.g. Clienti scope:
  all / visible-stores / own-only; Badge: punch-in vs supervision), that is a
  **capability**: registered in the `CAPABILITIES` catalog and resolved with
  `capAllowed()` / `capChoice()`.
- Stored in the **same table** with keys `cap:<section>:<capability>`; no row
  = the code default **predicate** (which snapshots historical behavior).
  Admin is *not* forced to true here (a capability selects behavior, it does
  not gate access).
- The Permessi page shows a ⚙️ gear on the section's row; options expand
  inline. **Anything registered in the catalog is automatically
  administrable — zero UI work.**
- **Rule:** if you're about to write `if (role === "...")` inside a page to
  change what it shows/does, **stop** — register a capability instead and
  resolve it via the catalog. Ask Luca/Claude if unsure.

### 3. Roles — `src/lib/roles.ts` + table `role_defs`
- Built-in roles stay in `roles.ts` (they're load-bearing). Table `role_defs`
  holds **custom roles created from the UI** and **overrides** (label / area
  / grades) of built-in ones.
- `src/lib/useRoles.ts` merges code + DB (shared cache). **Use `useRoles()`
  for any list of roles** (selects, filters). The sync helpers
  `roleLabel/gradeLabel/areaOf` are safe everywhere: they consult a dynamic
  registry hydrated at login, so custom roles resolve correctly.
- **Rules:** never rename/delete a built-in role id; never read `ROLES`
  directly for user-facing lists; custom roles must keep working after your
  changes (they exist only in the DB).

## Practical implications
- A change like "store managers shouldn't see X" is **not a code change**:
  Luca does it from the panel. If a ticket asks for it, the answer is either
  "already possible from Permessi" or "register the missing capability".
- Defaults in code matter only until the admin overrides them in the UI.
  Don't "fix" behavior by editing `role_permissions`/`role_defs` rows by
  hand — that's the admin's surface; coordinate instead.
- Tables: `role_permissions` (visibility + `cap:` behaviors),
  `role_defs` (roles). Both RLS-anon like the rest of the project.
