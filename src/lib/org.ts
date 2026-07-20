// Elenchi "anagrafici" (negozi e collaboratori) letti dal DB invece che hardcoded.
// Prima ogni pagina aveva la propria lista scritta a mano: erano disallineate fra loro,
// non corrispondevano ai negozi reali (es. "Acilia" invece di "Acilia VS"/"Acilia Multi")
// e contenevano ancora "Telefonico", negozio eliminato dalla migration 033.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// cache a livello di modulo: una fetch sola condivisa da tutte le pagine
let storesCache: string[] | null = null;
let sellersCache: string[] | null = null;
let storesPromise: Promise<string[]> | null = null;
let sellersPromise: Promise<string[]> | null = null;

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

/** Nomi dei collaboratori attivi (tabella app_users). */
export function useSellers(): string[] {
  const [v, setV] = useState<string[]>(sellersCache || []);
  useEffect(() => { let ok = true; loadSellers().then((s) => ok && setV(s)).catch(() => {}); return () => { ok = false; }; }, []);
  return v;
}

/** Svuota la cache (utile dopo aver creato/rinominato un negozio o un utente). */
export function invalidateOrgCache() {
  storesCache = sellersCache = null;
  storesPromise = sellersPromise = null;
}
