// Ambito dati dell'utente che interroga l'assistente: quali negozi puo' vedere.
// Riusa la logica ruoli esistente (src/lib/roles.ts) per restare coerente col resto del CRM.
import { supabase } from "@/lib/supabaseClient";

export interface Scope {
  userId: string;
  fullName: string;
  role: string;
  seesAll: boolean;
  /** Negozi visibili. Vuoto + seesAll=true => tutti. */
  stores: string[];
  /**
   * Valori REALI di contracts.negozio che l'utente puo' vedere.
   * Serve perche' i dati storici non usano i nomi esatti dei negozi
   * (es. contratti marcati "Magliana" mentre i negozi sono "Magliana Multi"/"Magliana W3"):
   * con un confronto esatto lo staff non vedrebbe nulla.
   */
  negozi: string[];
}

const norm = (s: string) => s.trim().toLowerCase();
/** Stesso punto vendita se uno dei due nomi e' prefisso dell'altro. */
function sameStore(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  return x === y || x.startsWith(y) || y.startsWith(x);
}

/**
 * Risolve l'ambito a partire dall'id di app_users. STESSA regola del client
 * (src/lib/visibleStores.ts — tenerli allineati):
 * - admin / dev / direttore_generale => tutti i negozi, sempre
 * - amministrativo => tutti i negozi DI DEFAULT; se l'admin gli ha messo righe
 *   esplicite in user_store_visibility, vale solo quella lista
 * - altrimenti: primary_store + user_stores + user_store_visibility
 */
export async function getScope(userId: string): Promise<Scope | null> {
  const { data: u, error } = await supabase
    .from("app_users")
    .select("id, full_name, role, primary_store, active")
    .eq("id", userId)
    .maybeSingle();
  if (error || !u || !u.active) return null;

  const roleAll = u.role === "admin" || u.role === "dev" || u.role === "direttore_generale";
  if (roleAll) {
    return { userId: u.id, fullName: u.full_name, role: u.role, seesAll: true, stores: [], negozi: [] };
  }

  const [{ data: us }, { data: vis }] = await Promise.all([
    supabase.from("user_stores").select("store_name").eq("user_id", userId),
    supabase.from("user_store_visibility").select("store_name").eq("user_id", userId),
  ]);

  if (u.role === "amministrativo" && (vis || []).length === 0) {
    // amministrativo senza restrizioni esplicite: vede tutto
    return { userId: u.id, fullName: u.full_name, role: u.role, seesAll: true, stores: [], negozi: [] };
  }

  const set = new Set<string>();
  if (u.primary_store) set.add(u.primary_store);
  (us || []).forEach((r: any) => r.store_name && set.add(r.store_name));
  (vis || []).forEach((r: any) => r.store_name && set.add(r.store_name));

  const stores = Array.from(set);

  // Risolvi i valori realmente presenti in contracts.negozio che corrispondono ai negozi
  // dell'utente (match per prefisso, vedi sameStore).
  const { data: cn } = await supabase
    .from("contracts").select("negozio").not("negozio", "is", null).limit(5000);
  const distinct = Array.from(new Set((cn || []).map((r: any) => r.negozio).filter(Boolean)));
  const negozi = distinct.filter((n: string) => stores.some((s) => sameStore(n, s)));

  return {
    userId: u.id,
    fullName: u.full_name,
    role: u.role,
    seesAll: false,
    stores,
    negozi,
  };
}

/** Applica il filtro negozio a una query Supabase, se l'utente non vede tutto. */
export function applyStoreScope(query: any, scope: Scope, column = "negozio") {
  if (scope.seesAll) return query;
  // Fail-closed: se non risolviamo nessun negozio, l'utente non vede nulla.
  if (scope.negozi.length === 0) return query.eq(column, "__none__");
  return query.in(column, scope.negozi);
}
