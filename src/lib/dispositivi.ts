"use client";

// CATALOGO DISPOSITIVI UNIVERSALE (Luca 02/08, mig. 133) — la fonte UNICA
// delle tendine brand/modello. Lettura con cache di modulo e RIPIEGO alle
// liste cablate del chiamante quando la tabella e' vuota o assente: nessuna
// tendina resta mai senza voci. Il refresh dei dati e' il bottone
// "Aggiorna catalogo dispositivi" in Amministrazione → Catalogo.

import { supabase } from "@/lib/supabaseClient";

export type CategoriaDispositivo = "smartphone" | "tablet" | "watch" | "computer";

const _cacheBrands = new Map<string, string[]>();
const _cacheModelli = new Map<string, string[]>();

/** Brand disponibili per categoria (ordinati; i brand "grossi" prima). */
export async function brandsDispositivi(categoria: CategoriaDispositivo, fallback: string[] = []): Promise<string[]> {
    const k = categoria;
    if (_cacheBrands.has(k)) return _cacheBrands.get(k)!;
    try {
        // distinct via aggregazione client: i brand sono poche centinaia
        const { data, error } = await supabase.from("dispositivi_catalogo")
            .select("brand").eq("categoria", categoria).eq("attivo", true).limit(20000);
        if (error || !data || !data.length) return fallback;
        const conteggio = new Map<string, number>();
        data.forEach((r: { brand: string }) => conteggio.set(r.brand, (conteggio.get(r.brand) || 0) + 1));
        const brands = [...conteggio.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([b]) => b);
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
        const { data, error } = await supabase.from("dispositivi_catalogo")
            .select("modello").eq("categoria", categoria).eq("attivo", true).ilike("brand", brand)
            .order("modello").limit(3000);
        if (error || !data || !data.length) return fallback;
        const modelli = data.map((r: { modello: string }) => r.modello);
        _cacheModelli.set(k, modelli);
        return modelli;
    } catch { return fallback; }
}

/** Svuota le cache (dopo una sync). */
export function invalidaCatalogoDispositivi() { _cacheBrands.clear(); _cacheModelli.clear(); }
