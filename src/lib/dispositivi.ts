"use client";

// CATALOGO DISPOSITIVI UNIVERSALE (Luca 02/08, mig. 133) — la fonte UNICA
// delle tendine brand/modello. Lettura con cache di modulo e RIPIEGO alle
// liste cablate del chiamante quando la tabella e' vuota o assente: nessuna
// tendina resta mai senza voci. Il refresh dei dati e' il bottone
// "Aggiorna catalogo dispositivi" in Amministrazione → Catalogo.

import { supabase } from "@/lib/supabaseClient";

export type CategoriaDispositivo = "smartphone" | "tablet" | "watch" | "computer";

/** Brand COMUNI in Italia (Luca 04/08): in testa alle tendine brand, prima
 *  del resto del catalogo in ordine alfabetico. Nomi verificati IDENTICI
 *  a DB su dispositivi_catalogo (categoria smartphone). */
export const BRAND_COMUNI = [
    "Apple", "Samsung", "Xiaomi", "Honor", "Motorola", "Google",
    "ZTE", "TCL", "Huawei", "Oppo", "OnePlus", "Realme",
] as const;

const _cacheBrands = new Map<string, string[]>();
const _cacheModelli = new Map<string, string[]>();

const PAGINA = 1000; // max-rows del PostgREST: ogni risposta e' tagliata qui

/** Brand disponibili per categoria, in ordine alfabetico.
 *  ATTENZIONE (bug 04/08): il server taglia OGNI risposta a 1000 righe anche
 *  con .limit() piu' alto — su smartphone (38.790 righe / 3.761 brand) la
 *  vecchia select singola vedeva solo i brand fino ad "Azza". La via maestra
 *  e' la RPC brands_dispositivi (mig. 158): aggrega i distinct in UNA riga
 *  jsonb, fuori dal tetto; se la RPC non c'e' ancora, ripiego con paginazione
 *  .range() ordinata (piu' lenta ma completa). */
export async function brandsDispositivi(categoria: CategoriaDispositivo, fallback: string[] = []): Promise<string[]> {
    const k = categoria;
    if (_cacheBrands.has(k)) return _cacheBrands.get(k)!;
    try {
        let brands: string[] = [];
        const { data, error } = await supabase.rpc("brands_dispositivi", { cat: categoria });
        if (!error && Array.isArray(data)) brands = (data as string[]).filter(Boolean);
        if (!brands.length) {
            // RPC assente o vuota: pagine da 1000 con ORDINE ESPLICITO
            // (obbligatorio: senza .order() le pagine si sovrappongono)
            const visti = new Set<string>();
            for (let da = 0; ; da += PAGINA) {
                const { data: pag, error: e2 } = await supabase.from("dispositivi_catalogo")
                    .select("brand").eq("categoria", categoria).eq("attivo", true)
                    .order("brand").order("modello").range(da, da + PAGINA - 1);
                if (e2 || !pag) break;
                pag.forEach((r: { brand: string }) => visti.add(r.brand));
                if (pag.length < PAGINA) break;
            }
            brands = [...visti];
        }
        if (!brands.length) return fallback;
        // ordinamento ALFABETICO (Luca 04/08): quello per conteggio metteva
        // ZTE davanti ad Apple; i "comuni" li mette in testa il chiamante
        brands.sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
        _cacheBrands.set(k, brands);
        return brands;
    } catch { return fallback; }
}

/** Modelli di un brand per categoria (ordinati per nome, piu' recenti su in
 *  genere per via del nome; ricerca lato client sul chiamante). */
export async function modelliDispositivi(categoria: CategoriaDispositivo, brand: string, fallback: string[] = []): Promise<string[]> {
    const k = categoria + "|" + brand.toLowerCase();
    if (_cacheModelli.has(k)) return _cacheModelli.get(k)!;
    try {
        // il tetto max-rows=1000 vale anche qui: .limit(3000) tagliava lo
        // stesso a 1000 (ZTE ha 1120 modelli — spariva la coda alfabetica);
        // paginazione .range() ordinata, id come spareggio deterministico
        const modelli: string[] = [];
        for (let da = 0; ; da += PAGINA) {
            const { data, error } = await supabase.from("dispositivi_catalogo")
                .select("modello").eq("categoria", categoria).eq("attivo", true).ilike("brand", brand)
                .order("modello").order("id").range(da, da + PAGINA - 1);
            if (error || !data) break;
            data.forEach((r: { modello: string }) => modelli.push(r.modello));
            if (data.length < PAGINA) break;
        }
        if (!modelli.length) return fallback;
        _cacheModelli.set(k, modelli);
        return modelli;
    } catch { return fallback; }
}

/** Svuota le cache (dopo una sync). */
export function invalidaCatalogoDispositivi() { _cacheBrands.clear(); _cacheModelli.clear(); }
