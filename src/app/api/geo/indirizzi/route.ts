import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";

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
 *
 * CAP AMBIGUI (Luca 31/07, caso via della Magliana 263 → 00146, non 00149):
 * le vie lunghe attraversano piu' zone postali e OSM le spezza in tratti con
 * CAP diversi — e spesso NON ha i civici, quindi non si puo' sapere il tratto
 * giusto. Regola: se la stessa via compare con CAP DIVERSI (o il tratto porta
 * piu' CAP tipo "00146;00148") e il risultato non e' a livello di civico, il
 * CAP NON si autocompila — meglio vuoto e scritto a mano che sbagliato in
 * anagrafica. Coi risultati a livello di CIVICO il CAP resta affidabile.
 */
export async function GET(request: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(request, "geo/indirizzi");
        if (!_g.ok) return _g.risposta;
        const _s = _g.sess;
    }

    const q = new URL(request.url).searchParams.get("q")?.trim() || "";
    if (q.length < 4) return NextResponse.json({ risultati: [] });
    try {
        const url = "https://photon.komoot.io/api/?" + new URLSearchParams({
            q, limit: "8", lat: "41.9", lon: "12.5",
        }).toString();
        const res = await fetch(url, { headers: { "User-Agent": "TelefuturaCRM/1.0 (crm.telefuturasrl.com)" }, signal: AbortSignal.timeout(6000) });
        if (!res.ok) return NextResponse.json({ risultati: [] });
        const data = await res.json();
        type Voce = { via: string; civico: string; cap: string; citta: string; civicoOsm: boolean; capMultiplo: boolean };
        const voci: Voce[] = [];
        for (const f of (data?.features ?? [])) {
            const p = f?.properties ?? {};
            if (p.countrycode !== "IT") continue;
            const via = String(p.street || p.name || "").trim();
            if (!via) continue;
            const civico = String(p.housenumber || "").trim();
            const capRaw = String(p.postcode || "").trim();
            voci.push({
                via, civico, citta: String(p.city || p.county || "").trim(),
                cap: capRaw.split(";")[0],
                civicoOsm: !!civico,
                capMultiplo: capRaw.includes(";"),
            });
            if (voci.length >= 8) break;
        }
        // stessa via con CAP diversi tra i tratti = zona postale incerta
        const capPerVia = new Map<string, Set<string>>();
        for (const v of voci) {
            if (!v.cap) continue;
            const k = `${v.via.toLowerCase()}|${v.citta.toLowerCase()}`;
            if (!capPerVia.has(k)) capPerVia.set(k, new Set());
            capPerVia.get(k)!.add(v.cap);
        }
        const visti = new Set<string>();
        const risultati: { label: string; via: string; civico: string; cap: string; citta: string }[] = [];
        for (const v of voci) {
            const k = `${v.via.toLowerCase()}|${v.citta.toLowerCase()}`;
            const ambiguo = !v.civicoOsm && (v.capMultiplo || (capPerVia.get(k)?.size ?? 0) > 1);
            const cap = ambiguo ? "" : v.cap;
            const label = `${v.via}${v.civico ? " " + v.civico : ""} — ${[cap || (ambiguo ? "CAP da inserire" : ""), v.citta].filter(Boolean).join(" ")}`;
            if (visti.has(label)) continue;   // OSM spezza le vie in tratti: doppioni identici
            visti.add(label);
            risultati.push({ label, via: v.via, civico: v.civico, cap, citta: v.citta });
            if (risultati.length >= 6) break;
        }
        return NextResponse.json({ risultati });
    } catch {
        return NextResponse.json({ risultati: [] });   // motore giù = si scrive a mano
    }
}
