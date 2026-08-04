// Elenchi "anagrafici" (negozi e collaboratori) letti dal DB invece che hardcoded.
// Prima ogni pagina aveva la propria lista scritta a mano: erano disallineate fra loro,
// non corrispondevano ai negozi reali (es. "Acilia" invece di "Acilia VS"/"Acilia Multi")
// e contenevano ancora "Telefonico", negozio eliminato dalla migration 033.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ROLES } from "@/lib/roles";

// cache a livello di modulo: una fetch sola condivisa da tutte le pagine
let storesCache: string[] | null = null;
let sellersCache: string[] | null = null;
let callersCache: string[] | null = null;
let storesPromise: Promise<string[]> | null = null;
let sellersPromise: Promise<string[]> | null = null;
let callersPromise: Promise<string[]> | null = null;

async function loadStores(): Promise<string[]> {
  if (storesCache) return storesCache;
  if (!storesPromise) {
    storesPromise = (async () => {
      const { data } = await supabase.from("stores").select("name").order("name");
      storesCache = (data || []).map((r: any) => r.name).filter(Boolean) as string[];
      return storesCache;
    })();
  }
  return storesPromise;
}

async function loadSellers(): Promise<string[]> {
  if (sellersCache) return sellersCache;
  if (!sellersPromise) {
    sellersPromise = (async () => {
      const { data } = await supabase
        .from("app_users").select("full_name").eq("active", true).order("full_name");
      sellersCache = (data || []).map((r: any) => r.full_name).filter(Boolean) as string[];
      return sellersCache;
    })();
  }
  return sellersPromise;
}

/** Nomi dei negozi reali (tabella stores). */
export function useStores(): string[] {
  const [v, setV] = useState<string[]>(storesCache || []);
  useEffect(() => { let ok = true; loadStores().then((s) => ok && setV(s)).catch(() => {}); return () => { ok = false; }; }, []);
  return v;
}

// Negozi ATTIVI (stores.active = true), uffici COMPRESI: e' la lista per le
// tendine di ATTRIBUZIONE (es. il Negozio nel modale di Ricerca Vendite), dove
// deve comparire anche un punto vendita appena creato e ancora senza vendite —
// caso "Agenzia" (is_ufficio = true), nato apposta per le vendite outbound:
// qui is_ufficio NON va filtrato. useStores resta com'e' (tutti i negozi).
let activeStoresCache: string[] | null = null;
let activeStoresPromise: Promise<string[]> | null = null;

async function loadActiveStores(): Promise<string[]> {
  if (activeStoresCache) return activeStoresCache;
  if (!activeStoresPromise) {
    activeStoresPromise = (async () => {
      const { data } = await supabase
        .from("stores").select("name").eq("active", true).order("name");
      activeStoresCache = (data || []).map((r: any) => r.name).filter(Boolean) as string[];
      return activeStoresCache;
    })();
  }
  return activeStoresPromise;
}

/** Nomi dei negozi ATTIVI (uffici inclusi), per le tendine di attribuzione. */
export function useActiveStores(): string[] {
  const [v, setV] = useState<string[]>(activeStoresCache || []);
  useEffect(() => { let ok = true; loadActiveStores().then((s) => ok && setV(s)).catch(() => {}); return () => { ok = false; }; }, []);
  return v;
}

export interface StoreRec { id: string; name: string; code: string | null }
let storeRecsCache: StoreRec[] | null = null;
let storeRecsPromise: Promise<StoreRec[]> | null = null;

/** Negozi con id/nome/codice (per le pagine che ne hanno bisogno, es. password vault). */
export function useStoreRecords(): StoreRec[] {
  const [v, setV] = useState<StoreRec[]>(storeRecsCache || []);
  useEffect(() => {
    let ok = true;
    if (!storeRecsPromise) {
      storeRecsPromise = (async () => {
        const { data } = await supabase.from("stores").select("id, name, code").order("name");
        storeRecsCache = (data || []).map((r: any) => ({ id: String(r.id), name: r.name, code: r.code ?? null }));
        return storeRecsCache;
      })();
    }
    storeRecsPromise.then((s) => ok && setV(s)).catch(() => {});
    return () => { ok = false; };
  }, []);
  return v;
}

/** Nomi dei collaboratori attivi (tabella app_users). */
export function useSellers(): string[] {
  const [v, setV] = useState<string[]>(sellersCache || []);
  useEffect(() => { let ok = true; loadSellers().then((s) => ok && setV(s)).catch(() => {}); return () => { ok = false; }; }, []);
  return v;
}

// Il filtro Caller proponeva TUTTI gli utenti attivi (CALLERS = VENDITORI):
// qui si caricano solo i ruoli dell'area Call Center, dalla fonte unica
// roles.ts (caller, back office/caller, direzione CC). Segnalazione Luca 30/07.
async function loadCallers(): Promise<string[]> {
  if (callersCache) return callersCache;
  if (!callersPromise) {
    callersPromise = (async () => {
      const ruoliCc = ROLES.filter((r) => r.area === "cc").map((r) => r.id);
      const { data } = await supabase
        .from("app_users").select("full_name")
        .in("role", ruoliCc).eq("active", true).order("full_name");
      callersCache = (data || []).map((r: any) => r.full_name).filter(Boolean) as string[];
      return callersCache;
    })();
  }
  return callersPromise;
}

/** Nomi del personale del call center (ruoli area "cc"). */
export function useCallers(): string[] {
  const [v, setV] = useState<string[]>(callersCache || []);
  useEffect(() => { let ok = true; loadCallers().then((s) => ok && setV(s)).catch(() => {}); return () => { ok = false; }; }, []);
  return v;
}

/** Svuota la cache (utile dopo aver creato/rinominato un negozio o un utente). */
export function invalidateOrgCache() {
  storesCache = sellersCache = callersCache = activeStoresCache = null;
  storesPromise = sellersPromise = callersPromise = activeStoresPromise = null;
}
