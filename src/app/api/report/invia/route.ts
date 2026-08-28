import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { puoVedereNegozio } from "@/lib/visibleStoresServer";
import { dataItaliana } from "@/lib/report/datiGiornata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* L'INVIO DEL REPORT SERALE (Luca 28/08).
   L'immagine la scatta il browser del negozio — il report è già a schermo, non
   serve un secondo computer che lo ridisegni — e arriva qui come file JPEG. Il
   server la inoltra al canale, e soprattutto TIENE L'INDIRIZZO DEL CANALE: un
   webhook Discord è una chiave d'accesso, chi ce l'ha può scrivere nel canale.
   Nel browser non ci va mai. */

const MAX_MB = 8;                     // Discord rifiuta gli allegati più grandi
const TETTO_AL_GIORNO = 12;           // vedi `troppiOggi`

/* QUANTI NE HA GIÀ MANDATI OGGI. La rotta pubblica su un canale che legge tutta
   l'azienda: senza un tetto, chi ha la Chiusura (cioè chiunque) può riempirlo.
   Dodici al giorno lasciano spazio a un errore, a un ripensamento e a qualche
   prova, e chiudono il rubinetto molto prima che diventi un problema.
   Il conto sta in memoria: si azzera a ogni riavvio, e va bene così — serve a
   fermare un incidente, non un attacco determinato. */
const inviiOggi = new Map<string, { giorno: string; n: number }>();
function troppiOggi(userId: string): boolean {
    const oggi = new Date().toISOString().slice(0, 10);
    const r = inviiOggi.get(userId);
    if (!r || r.giorno !== oggi) { inviiOggi.set(userId, { giorno: oggi, n: 1 }); return false; }
    r.n += 1;
    return r.n > TETTO_AL_GIORNO;
}

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

    /* Il file arriva come FILE, non come testo dentro un JSON: una data-url
       base64 gonfia di un terzo e sbatteva contro il `client_max_body_size` da
       1 MB che nginx ha di default — con una pagina d'errore HTML che il
       browser avrebbe provato a leggere come JSON. */
    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return NextResponse.json({ error: "L'immagine non è arrivata: riprova a generare il report." });
    }
    const file = form.get("immagine");
    const negozio = String(form.get("negozio") || "").trim();
    if (!(file instanceof Blob) || file.size === 0) {
        return NextResponse.json({ error: "L'immagine non è arrivata: riprova a generare il report." });
    }
    if (file.size > MAX_MB * 1024 * 1024) {
        return NextResponse.json({ error: `L'immagine pesa ${(file.size / 1048576).toFixed(1)} MB: oltre il limite di ${MAX_MB} MB del canale.` });
    }

    /* Il negozio arriva dal browser, e qui pesa il doppio: finisce scritto nel
       messaggio che tutta l'azienda legge. Mandare un report a nome di un
       negozio che non è il proprio non deve essere possibile. */
    if (!negozio) return NextResponse.json({ error: "Manca il negozio." });
    if (!(await puoVedereNegozio(_s.id, negozio))) {
        return NextResponse.json({ error: "Questo negozio non è fra quelli che vedi." }, { status: 403 });
    }
    if (troppiOggi(_s.id)) {
        return NextResponse.json({ error: `Hai già mandato ${TETTO_AL_GIORNO} report oggi: se ne serve un altro, chiedi all'amministrazione.` });
    }

    /* LA DIDASCALIA LA SCRIVE IL SERVER. Se il testo arrivasse dal browser,
       chiunque potrebbe pubblicare sul canale aziendale una frase qualsiasi
       sotto un'immagine qualsiasi. Negozio verificato e data: nient'altro. */
    const oggi = new Date().toISOString().slice(0, 10);
    const fuori = new FormData();
    fuori.append("payload_json", JSON.stringify({
        content: `**${negozio}** — ${dataItaliana(oggi)}`,
        allowed_mentions: { parse: [] },     // niente menzioni involontarie
    }));
    fuori.append("files[0]", file,
        `report-${negozio.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${oggi}.jpg`);

    let esito: Response;
    try {
        esito = await fetch(url, { method: "POST", body: fuori });
    } catch (e) {
        console.error("[report] il canale non risponde:", (e as Error)?.message);
        return NextResponse.json({ error: "Il canale non risponde: " + ((e as Error)?.message || "rete") });
    }
    if (!esito.ok) {
        const t = await esito.text().catch(() => "");
        /* Il fallimento finisce anche nei log del server: la risposta all'utente
           è un 200 con `{error}` (è la convenzione del CRM, i client mostrano
           `j.error`), quindi senza questa riga nessun monitoraggio si
           accorgerebbe mai che la funzione ha smesso di funzionare. */
        console.error(`[report] il canale ha rifiutato (${esito.status}):`, t.slice(0, 300));
        return NextResponse.json({ error: `Il canale ha rifiutato l'invio (${esito.status}). ${t.slice(0, 140)}` });
    }

    console.log(`[report] inviato ${negozio} ${oggi} da ${_s.id} · ${(file.size / 1024).toFixed(0)} KB`);
    return NextResponse.json({ ok: true, peso: `${(file.size / 1024).toFixed(0)} KB` });
}
