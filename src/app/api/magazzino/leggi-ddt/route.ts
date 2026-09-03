import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { isAdminOrAbove } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ═══ L'OCCHIO CHE LEGGE IL DOCUMENTO DI TRASPORTO ═══════════════════════════
 *
 * Luca 03/09: «dobbiamo introdurre la possibilità di caricare anche la merce
 * con una DDT, che semplicemente deve aggiungere le varie quantità a carrello…
 * dopo averlo caricato dobbiamo integrare l'AI che legge, rileva gli articoli,
 * eventuali IMEI e compila il carrello… Se ci sono dei campi non leggibili
 * perché la foto è fatta male, devo dirlo, e deve chiedere una nuova foto».
 *
 * ── QUELLO CHE IL MODELLO LEGGE NON È QUELLO CHE SI CARICA ──────────────────
 * Misurato su un DDT vero il 03/09: il modello legge benissimo, ma il CODICE
 * ARTICOLO no — ha restituito `OTH060SMOU7004` dove sul foglio c'è
 * `0THO60SMOU7004`. Lo ZERO letto come una O: è l'errore classico di
 * chi legge caratteri, e su un codice alfanumerico non c'è contesto che lo
 * corregga.
 *
 * Per questo il codice del modello NON entra mai a magazzino. Serve solo a
 * TROVARE l'articolo in anagrafica, e si cerca in quest'ordine:
 *   ① il CODICE A BARRE, che è tutto cifre e infatti l'ha letto giusto;
 *   ② il codice esatto;
 *   ③ il codice ripulito degli scambi tipici (O↔0, I↔1, S↔5, B↔8);
 *   ④ la descrizione.
 * Quello che entra nel carrello è SEMPRE l'articolo trovato in anagrafica,
 * col suo codice vero. Quello che non si trova, si dice.
 *
 * E LA QUANTITÀ È QUELLA DEL FOGLIO, mai dedotta: se il modello non la legge,
 * la riga arriva a zero e la mette l'operatore.
 * ═══════════════════════════════════════════════════════════════════════════ */

const MODELLO = "deepseek-v4-flash-vision-exp";
const FORMATI = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const ISTRUZIONI = [
    "Sei l'occhio del magazzino di una catena di negozi di telefonia. Ti do la foto di un DOCUMENTO DI TRASPORTO (DDT) o di una bolla di consegna.",
    "",
    "Estrai SOLO la merce, riga per riga. Rispondi in JSON con questa forma esatta:",
    '{"righe":[{"codice":"","barcode":"","descrizione":"","quantita":0,"seriali":[],"sicurezza":"alta|media|bassa"}],',
    ' "illeggibili":["cosa non sei riuscito a leggere e perche"],',
    ' "documento":{"numero":"","data":"","mittente":""}}',
    "",
    "REGOLE:",
    "- codice e il codice articolo del fornitore; barcode e l'EAN, solo cifre, 8-14. Se una colonna non c'e, lascia la stringa vuota.",
    "- quantita e il numero di pezzi di QUELLA riga. Se non la leggi, metti 0 e scrivilo in illeggibili.",
    "- seriali: se il documento elenca IMEI o matricole, associali alla riga giusta. Se non si capisce a quale riga appartengono, mettili in illeggibili invece di indovinare.",
    "- sicurezza: bassa se il testo e sfocato, tagliato o ambiguo; alta solo se lo leggi senza dubbi.",
    "- NON INVENTARE NIENTE. Meglio un campo vuoto in illeggibili che un campo pieno e sbagliato: qui si carica merce vera a magazzino.",
    "- Ignora intestazioni, indirizzi, totali, IVA, condizioni di trasporto e firme.",
].join("\n");

/** Gli scambi tipici di chi legge caratteri: la lettera che somiglia alla
 *  cifra. Serve solo a CERCARE, mai a scrivere. */
const smagrisci = (v: string) => String(v || "").toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0").replace(/I/g, "1").replace(/L/g, "1")
    .replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2");

/** Le parole che contano di una descrizione, per confrontarla con l'anagrafica. */
const parole = (v: string) => String(v || "").toLowerCase()
    .replace(/[^a-z0-9+ ]/g, " ").split(/\s+/).filter(w => w.length > 2);

type Letta = { codice?: string; barcode?: string; descrizione?: string; quantita?: number; seriali?: string[]; sicurezza?: string };
type Articolo = { codice: string; barcode: string | null; descrizione: string; ha_imei: boolean; costo_ultimo: number | null; prezzo: number | null; usato: boolean };

export async function POST(req: Request) {
    let _s: { id: string; role: string; exp: number };
    {
        const _g = await accesso(req, "magazzino");
        if (!_g.ok) return _g.risposta;
        _s = _g.sess;
    }
    const { data: io } = await supabase.from("app_users").select("id, role, active").eq("id", _s.id).maybeSingle();
    if (!io || io.active === false) return NextResponse.json({ error: "utente non attivo" }, { status: 403 });
    /* LO STESSO CANCELLO DEL CARICO: leggere un DDT è il primo passo del
       carico, non una funzione a parte. */
    if (!isAdminOrAbove(String(io.role || "")))
        return NextResponse.json({ error: "il carico merce lo fa l'amministrazione" }, { status: 403 });

    if (!process.env.DEEPSEEK_API_KEY)
        return NextResponse.json({ error: "la lettura dei documenti non è configurata su questo server" }, { status: 503 });

    const b = await req.json().catch(() => ({})) as { immagine?: string };
    const dataUrl = String(b.immagine || "");
    const m = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!m) return NextResponse.json({ error: "immagine mancante o in un formato che non riconosco" }, { status: 400 });
    if (!FORMATI.includes(m[1]))
        return NextResponse.json({ error: `i ${m[1].replace("application/", "").toUpperCase()} non li so leggere: mandami una foto (JPG, PNG o WEBP)` }, { status: 400 });
    /* IL TETTO È QUELLO DEL FORNITORE, non una precauzione nostra: una foto da
       telefono moderna supera i 10 MB, e senza tetto l'errore arriverebbe da
       lui, in inglese, dopo trenta secondi di attesa. */
    if (m[2].length > 14_000_000)
        return NextResponse.json({ error: "la foto è troppo grande: rifalla, o riducila" }, { status: 400 });

    // ── ① IL MODELLO GUARDA ────────────────────────────────────────────────
    let letto: { righe?: Letta[]; illeggibili?: string[]; documento?: Record<string, string> };
    try {
        const r = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: MODELLO,
                messages: [{ role: "user", content: [{ type: "text", text: ISTRUZIONI }, { type: "image_url", image_url: { url: dataUrl } }] }],
                response_format: { type: "json_object" },
                max_tokens: 6000, temperature: 0,
            }),
            signal: AbortSignal.timeout(55_000),
        });
        const j = await r.json();
        if (!r.ok) return NextResponse.json({ error: "il lettore non ha risposto: " + (j?.error?.message || r.status) }, { status: 502 });
        const testo = j?.choices?.[0]?.message?.content;
        if (!testo) return NextResponse.json({ error: "il lettore ha risposto a vuoto: riprova" }, { status: 502 });
        letto = JSON.parse(testo);
    } catch (e) {
        const msg = (e as Error)?.name === "TimeoutError"
            ? "il lettore ci ha messo troppo: riprova, o scatta una foto più piccola"
            : "non sono riuscito a leggere il documento: " + ((e as Error)?.message || "");
        return NextResponse.json({ error: msg }, { status: 502 });
    }

    const righe = Array.isArray(letto.righe) ? letto.righe : [];
    const illeggibili = (Array.isArray(letto.illeggibili) ? letto.illeggibili : []).map(String).filter(Boolean);

    // ── ② SI CERCA L'ARTICOLO VERO ─────────────────────────────────────────
    const barcodes = righe.map(r => String(r.barcode || "").trim()).filter(Boolean);
    const codici = righe.map(r => String(r.codice || "").trim()).filter(Boolean);
    const trovati: Articolo[] = [];
    const campi = "codice,barcode,descrizione,ha_imei,costo_ultimo,prezzo,usato";
    if (barcodes.length) {
        const { data } = await supabase.from("mag_articoli").select(campi).in("barcode", barcodes).eq("attivo", true);
        trovati.push(...((data ?? []) as Articolo[]));
    }
    if (codici.length) {
        const { data } = await supabase.from("mag_articoli").select(campi).in("codice", codici).eq("attivo", true);
        trovati.push(...((data ?? []) as Articolo[]));
    }
    /* IL RIPIEGO SUGLI SCAMBI DI CARATTERE non si può fare con una `in`: si
       carica l'anagrafica una volta sola e si confronta smagrita. 17.000 righe
       di tre colonne sono ~1,5 MB, e questa strada la si fa una volta per
       documento — non a ogni tasto. */
    const senzaRiscontro = righe.filter(r => !scegli(trovati, r).articolo && (r.codice || r.descrizione));
    let catalogo: Articolo[] = [];
    if (senzaRiscontro.length) {
        for (let da = 0; da < 20000; da += 1000) {
            const { data } = await supabase.from("mag_articoli").select(campi).eq("attivo", true).range(da, da + 999);
            const p = (data ?? []) as Articolo[];
            catalogo.push(...p);
            if (p.length < 1000) break;
        }
        catalogo = catalogo.filter(a => !a.usato);
    }

    const esito = righe.map(r => {
        const q = Math.max(0, Math.round(Number(r.quantita) || 0));
        const seriali = (Array.isArray(r.seriali) ? r.seriali : []).map(s => String(s).replace(/\s/g, "")).filter(Boolean);
        const a = scegli(trovati, r) || cerca(catalogo, r);
        return {
            letto: {
                codice: String(r.codice || ""), barcode: String(r.barcode || ""),
                descrizione: String(r.descrizione || ""), quantita: q, seriali,
                sicurezza: ["alta", "media", "bassa"].includes(String(r.sicurezza)) ? String(r.sicurezza) : "media",
            },
            articolo: a.articolo,
            come: a.come,     // barcode | codice | somiglianza | descrizione | nessuno
        };
    });

    /* ③ LA FOTO È INUTILIZZABILE? Lo si dice chiaro, invece di consegnare un
       carrello vuoto e lasciare che l'operatore si chieda perché. */
    const nulla = esito.length === 0 || esito.every(e => !e.letto.descrizione && !e.letto.codice && !e.letto.barcode);
    const dubbie = esito.filter(e => e.letto.sicurezza === "bassa").length;

    return NextResponse.json({
        ok: true,
        rifai: nulla || (esito.length > 0 && dubbie === esito.length),
        righe: esito,
        illeggibili,
        documento: letto.documento || {},
        trovate: esito.filter(e => e.articolo).length,
        totali: esito.length,
    });
}

/** Il riscontro sicuro: prima il codice a barre, poi il codice esatto. */
function scegli(pool: Articolo[], r: Letta): { articolo: Articolo | null; come: string } {
    const bc = String(r.barcode || "").trim();
    if (bc) { const a = pool.find(x => x.barcode === bc); if (a) return { articolo: a, come: "barcode" }; }
    const cod = String(r.codice || "").trim();
    if (cod) { const a = pool.find(x => x.codice === cod); if (a) return { articolo: a, come: "codice" }; }
    return { articolo: null, come: "nessuno" };
}

/** Il ripiego: il codice smagrito, poi la descrizione. Sono riscontri DEBOLI —
 *  vanno mostrati come tali, perché è qui che si sbaglia articolo. */
function cerca(catalogo: Articolo[], r: Letta): { articolo: Articolo | null; come: string } {
    if (!catalogo.length) return { articolo: null, come: "nessuno" };
    const cod = smagrisci(r.codice || "");
    if (cod.length >= 5) {
        const a = catalogo.find(x => smagrisci(x.codice) === cod);
        if (a) return { articolo: a, come: "somiglianza" };
    }
    const p = parole(r.descrizione || "");
    if (p.length >= 2) {
        let meglio: Articolo | null = null, punti = 0;
        for (const a of catalogo) {
            const q = parole(a.descrizione);
            if (!q.length) continue;
            const n = p.filter(w => q.includes(w)).length;
            if (n > punti) { punti = n; meglio = a; }
        }
        /* almeno due parole in comune E almeno metà di quelle lette: «Cavo USB»
           dentro un catalogo di cavi troverebbe qualunque cosa */
        if (meglio && punti >= 2 && punti >= Math.ceil(p.length / 2)) return { articolo: meglio, come: "descrizione" };
    }
    return { articolo: null, come: "nessuno" };
}
