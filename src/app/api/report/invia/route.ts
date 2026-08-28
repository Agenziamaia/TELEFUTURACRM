import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { puoVedereNegozio } from "@/lib/visibleStoresServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* L'INVIO DEL REPORT SERALE (Luca 28/08).
   L'immagine la scatta il browser del negozio — il report è già a schermo, non
   serve un secondo computer che lo ridisegni — e arriva qui come PNG. Il server
   la inoltra al canale, e soprattutto TIENE L'INDIRIZZO DEL CANALE: un webhook
   Discord è una chiave d'accesso, chi ce l'ha può scrivere nel canale. Nel
   browser non ci va mai. */

const MAX_MB = 8;                     // Discord rifiuta gli allegati più grandi

export async function POST(request: Request) {
    const _g = await accesso(request, "report/invia");
    if (!_g.ok) return _g.risposta;
    const _s = _g.sess;

    const url = process.env.DISCORD_REPORT_WEBHOOK || "";
    if (!url) {
        return NextResponse.json({
            error: "Il canale non è ancora configurato: manca DISCORD_REPORT_WEBHOOK nelle variabili del server.",
        });
    }

    const b = await request.json().catch(() => ({}));
    const png = String(b?.png || "");
    const negozio = String(b?.negozio || "").trim();
    const data = String(b?.data || "").trim();
    // il browser manda PNG; se lo sfondo lo rende troppo pesante ripiega sul
    // JPEG, che per un'immagine da guardare sul canale è indistinguibile
    const jpeg = png.startsWith("data:image/jpeg;base64,");
    if (!jpeg && !png.startsWith("data:image/png;base64,")) {
        return NextResponse.json({ error: "L'immagine non è arrivata: riprova a generare il report." });
    }

    /* Anche qui il negozio arriva dal browser, e qui pesa il doppio: finisce
       scritto nel messaggio che tutta l'azienda legge. Mandare un report a nome
       di un negozio che non è il proprio non deve essere possibile. */
    if (!negozio) return NextResponse.json({ error: "Manca il negozio." });
    if (!(await puoVedereNegozio(_s.id, negozio))) {
        return NextResponse.json({ error: "Questo negozio non è fra quelli che vedi." }, { status: 403 });
    }

    const bytes = Buffer.from(png.split(",")[1] || "", "base64");
    if (!bytes.length) return NextResponse.json({ error: "L'immagine è vuota." });
    if (bytes.length > MAX_MB * 1024 * 1024) {
        return NextResponse.json({ error: `L'immagine pesa ${(bytes.length / 1048576).toFixed(1)} MB: oltre il limite di ${MAX_MB} MB del canale.` });
    }

    // il messaggio dice il negozio e il giorno: nel canale ne arrivano molti,
    // e una foto senza didascalia costringe ad aprirla per sapere di chi è
    const form = new FormData();
    form.append("payload_json", JSON.stringify({
        content: `**${negozio}** — ${data}`,
        allowed_mentions: { parse: [] },     // niente menzioni involontarie
    }));
    form.append("files[0]",
        new Blob([new Uint8Array(bytes)], { type: jpeg ? "image/jpeg" : "image/png" }),
        `report-${negozio.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.${jpeg ? "jpg" : "png"}`);

    let esito: Response;
    try {
        esito = await fetch(url, { method: "POST", body: form });
    } catch (e) {
        return NextResponse.json({ error: "Il canale non risponde: " + ((e as Error)?.message || "rete") });
    }
    if (!esito.ok) {
        const t = await esito.text().catch(() => "");
        return NextResponse.json({ error: `Il canale ha rifiutato l'invio (${esito.status}). ${t.slice(0, 140)}` });
    }

    /* Chi ha mandato cosa resta nei log del server: `dev_updates` non si usa
       più da agosto (decisione di Luca) e non aggiungo una tabella per una
       riga. Se servirà un registro vero, si fa quando serve. */
    console.log(`[report] inviato ${negozio} ${data} da ${_s.id} · ${(bytes.length / 1024).toFixed(0)} KB`);

    return NextResponse.json({ ok: true, peso: `${(bytes.length / 1024).toFixed(0)} KB` });
}
