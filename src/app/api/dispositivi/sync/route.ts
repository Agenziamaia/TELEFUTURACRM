import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// SYNC CATALOGO DISPOSITIVI (Luca 02/08) — due fonti ufficiali:
//  * Apple: api.ipsw.me/v4/devices (tutti i device, aggiornata il giorno
//    stesso delle uscite; categoria dal prefisso dell'identifier)
//  * Android: CSV ufficiale dei dispositivi CERTIFICATI Google Play
//    (storage.googleapis.com/play_public/supported_devices.csv, ~4.7MB,
//    aggiornato piu' volte a settimana; ATTENZIONE: codifica UTF-16LE)
// Idempotente: upsert con ignoreDuplicates sulla chiave (categoria, brand,
// modello). Si lancia dal bottone in Amministrazione → Catalogo.

const BATCH = 1000;

function categoriaApple(identifier: string): "smartphone" | "tablet" | "watch" | "computer" | null {
    if (identifier.startsWith("iPhone")) return "smartphone";
    if (identifier.startsWith("iPad")) return "tablet";
    if (identifier.startsWith("Watch")) return "watch";
    if (identifier.startsWith("Mac") || identifier.startsWith("iMac")) return "computer";
    if (identifier.startsWith("iPod")) return "smartphone";
    return null;   // AppleTV, HomePod, AirPods…: fuori ambito
}

// parser CSV minimale ma con virgolette (i nomi possono contenere virgole)
function rigaCsv(line: string): string[] {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
            if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
            else cur += ch;
        } else {
            if (ch === '"') q = true;
            else if (ch === ",") { out.push(cur); cur = ""; }
            else cur += ch;
        }
    }
    out.push(cur);
    return out;
}

async function upsertBatch(rows: { categoria: string; brand: string; modello: string; fonte: string }[]) {
    let inseriti = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
        const fetta = rows.slice(i, i + BATCH);
        const { error } = await supabase.from("dispositivi_catalogo")
            .upsert(fetta, { onConflict: "categoria,brand,modello", ignoreDuplicates: true });
        if (error) throw new Error("upsert: " + error.message);
        inseriti += fetta.length;
    }
    return inseriti;
}

export async function POST() {
    try {
        const esito: Record<string, number | string> = {};

        // ── APPLE ──
        const ra = await fetch("https://api.ipsw.me/v4/devices", { cache: "no-store" });
        if (!ra.ok) throw new Error("ipsw.me: HTTP " + ra.status);
        const apple = (await ra.json()) as { name: string; identifier: string }[];
        const righeApple = apple
            .map((d) => ({ categoria: categoriaApple(d.identifier || ""), brand: "Apple", modello: String(d.name || "").trim(), fonte: "apple" }))
            .filter((r): r is { categoria: "smartphone" | "tablet" | "watch" | "computer"; brand: string; modello: string; fonte: string } => !!r.categoria && !!r.modello);
        // dedup (piu' identifier per lo stesso nome commerciale)
        const vistiA = new Set<string>();
        const appleUniq = righeApple.filter((r) => { const k = r.categoria + "|" + r.modello.toLowerCase(); if (vistiA.has(k)) return false; vistiA.add(k); return true; });
        await upsertBatch(appleUniq);
        esito.apple = appleUniq.length;

        // ── ANDROID (Google Play certified) ──
        const rg = await fetch("https://storage.googleapis.com/play_public/supported_devices.csv", { cache: "no-store" });
        if (!rg.ok) throw new Error("Google CSV: HTTP " + rg.status);
        const buf = Buffer.from(await rg.arrayBuffer());
        const testo = buf.toString("utf16le");                    // il CSV di Google e' UTF-16LE
        const righe = testo.split(/\r?\n/);
        const visti = new Set<string>();
        const android: { categoria: string; brand: string; modello: string; fonte: string }[] = [];
        for (let i = 1; i < righe.length; i++) {                  // salta l'intestazione
            if (!righe[i]) continue;
            const [branding, marketing] = rigaCsv(righe[i]);
            const brand = String(branding || "").trim();
            const modello = String(marketing || "").trim();
            if (!brand || !modello) continue;                     // dispositivi white-label senza brand retail
            const k = brand.toLowerCase() + "|" + modello.toLowerCase();
            if (visti.has(k)) continue;
            visti.add(k);
            // il CSV non distingue tablet/watch: nascono "smartphone", i piu'
            // rilevanti (Galaxy Tab, Pixel Tablet, Watch…) si riconoscono dal nome
            const low = modello.toLowerCase();
            const categoria = /watch/.test(low) ? "watch" : /\btab\b|tablet|\bpad\b/.test(low) ? "tablet" : "smartphone";
            android.push({ categoria, brand, modello, fonte: "google" });
        }
        await upsertBatch(android);
        esito.android = android.length;

        const { count } = await supabase.from("dispositivi_catalogo").select("id", { count: "exact", head: true });
        esito.totale_catalogo = count ?? 0;
        return NextResponse.json({ ok: true, ...esito });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Errore sync" }, { status: 500 });
    }
}
