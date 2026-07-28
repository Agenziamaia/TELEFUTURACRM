import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * RICERCA INDIRIZZI (Luca 28/07) — motore dietro IndirizzoAutocomplete:
 * ovunque nel CRM si compila un indirizzo, si sceglie da una lista e
 * CAP + comune si compilano da soli (a mano solo se non trovato).
 *
 * Provider: Photon (photon.komoot.io, dati OpenStreetMap) — gratuito, senza
 * chiave API. Passare da questa route (e non dal browser) evita CORS, mette
 * un User-Agent onesto e permette di cambiare motore senza toccare le pagine.
 * Bias geografico su Roma: i negozi e i clienti sono quasi tutti lì.
 * NB niente `lang`: Photon supporta solo en/de/fr; senza parametro usa i
 * nomi locali (per l'Italia = italiano). Con lang=it risponde 400.
 */
export async function GET(request: Request) {
    const q = new URL(request.url).searchParams.get("q")?.trim() || "";
    if (q.length < 4) return NextResponse.json({ risultati: [] });
    try {
        const url = "https://photon.komoot.io/api/?" + new URLSearchParams({
            q, limit: "8", lat: "41.9", lon: "12.5",
        }).toString();
        const res = await fetch(url, { headers: { "User-Agent": "TelefuturaCRM/1.0 (crm.telefuturasrl.com)" }, signal: AbortSignal.timeout(6000) });
        if (!res.ok) return NextResponse.json({ risultati: [] });
        const data = await res.json();
        const visti = new Set<string>();
        const risultati: { label: string; via: string; civico: string; cap: string; citta: string }[] = [];
        for (const f of (data?.features ?? [])) {
            const p = f?.properties ?? {};
            if (p.countrycode !== "IT") continue;
            const via = String(p.street || p.name || "").trim();
            if (!via) continue;
            const civico = String(p.housenumber || "").trim();
            const cap = String(p.postcode || "").trim().split(";")[0];
            const citta = String(p.city || p.county || "").trim();
            const label = `${via}${civico ? " " + civico : ""}${cap || citta ? ` — ${[cap, citta].filter(Boolean).join(" ")}` : ""}`;
            if (visti.has(label)) continue;   // OSM spezza le vie in tratti: doppioni identici
            visti.add(label);
            risultati.push({ label, via, civico, cap, citta });
            if (risultati.length >= 6) break;
        }
        return NextResponse.json({ risultati });
    } catch {
        return NextResponse.json({ risultati: [] });   // motore giù = si scrive a mano
    }
}
