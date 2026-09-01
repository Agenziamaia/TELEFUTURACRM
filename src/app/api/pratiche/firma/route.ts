import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { accesso } from "@/lib/permessiServer";
import { moduloHtml, type DatiModulo } from "@/lib/moduloPratica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ LA FIRMA COL CODICE ═════════════════════════════════════════════════
 *
 * DocuSeal, host EUROPEO. Il `.com` risponde 401 con questa chiave: i documenti
 * dei clienti restano in Europa, ed è la sola ragione per cui l'indirizzo è
 * scritto qui e non indovinato.
 *
 * ⚠️ IL CODICE VA AL CLIENTE, NON A UN NUMERO A CASO (Luca 01/09). Il
 * firmatario È il cliente: l'email che passiamo è quella della sua anagrafica —
 * la stessa che il CRM ha reso obbligatoria all'apertura della pratica — e
 * `require_email_2fa` fa arrivare il codice lì. Nessun altro indirizzo entra in
 * questa rotta.
 *
 * ⚠️ LA CHIAVE NON ESCE MAI VERSO IL BROWSER: sta in `impostazioni_servizio`,
 * tabella con RLS e nessuna policy — la legge solo il server.
 *
 * Si manda l'HTML, non un modello: il documento è già pieno dei dati della
 * pratica, e i due campi firma sono dentro il testo. Un modello a parte
 * avrebbe voluto dire tenere allineate due copie dello stesso contratto.
 */
const DOCUSEAL = "https://api.docuseal.eu";

async function chiave(): Promise<string | null> {
    const { data } = await supabaseAdmin.from("impostazioni_servizio").select("docuseal_api_key").eq("id", 1).maybeSingle();
    const k = (data?.docuseal_api_key as string) || "";
    return k.trim() || null;
}

export async function POST(req: Request) {
    const g = await accesso(req, "pratiche/firma");
    if (!g.ok) return g.risposta;

    const body = await req.json().catch(() => ({})) as { azione?: string; dati?: DatiModulo; nome?: string; submissionId?: number };
    const k = await chiave();
    if (!k) return NextResponse.json({ error: "la chiave DocuSeal non è configurata: si mette da Amministrazione." }, { status: 503 });

    /* ── com'è andata ────────────────────────────────────────────────── */
    if (body.azione === "stato") {
        if (!body.submissionId) return NextResponse.json({ error: "manca la richiesta da controllare" }, { status: 400 });
        const r = await fetch(`${DOCUSEAL}/submissions/${body.submissionId}`, { headers: { "X-Auth-Token": k } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return NextResponse.json({ error: j?.error || `DocuSeal ha risposto ${r.status}` }, { status: 502 });
        const submitters = (j?.submitters || []) as { status?: string; completed_at?: string }[];
        const finito = submitters.length > 0 && submitters.every((s) => s.status === "completed");
        return NextResponse.json({
            ok: true, firmato: finito,
            stato: submitters[0]?.status || "in attesa",
            completatoIl: submitters[0]?.completed_at || null,
            documenti: (j?.documents || []).map((d: { url?: string; name?: string }) => ({ url: d.url, nome: d.name })),
        });
    }

    /* ── manda la richiesta ──────────────────────────────────────────── */
    const d = body.dati;
    if (!d) return NextResponse.json({ error: "mancano i dati della pratica" }, { status: 400 });
    const email = String(d.cliente?.email || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(email)) {
        return NextResponse.json({ error: "il cliente non ha un'email valida in anagrafica: il codice non avrebbe dove arrivare." }, { status: 400 });
    }

    const r = await fetch(`${DOCUSEAL}/submissions/html`, {
        method: "POST",
        headers: { "X-Auth-Token": k, "Content-Type": "application/json" },
        body: JSON.stringify({
            name: `Modulo di accettazione ${d.protocollo}`,
            documents: [{ name: `modulo-${d.protocollo}`, html: moduloHtml(d, true), size: "A4" }],
            submitters: [{
                role: "Cliente",
                name: String(d.cliente?.etichetta || "Cliente"),
                email,
                // ⬇️ IL CODICE: arriva sull'email del cliente, non altrove
                require_email_2fa: true,
                send_email: true,
                message: {
                    subject: `Telefutura — firma il modulo della pratica ${d.protocollo}`,
                    body: "Buongiorno,\n\nper completare la pratica aperta oggi nel punto vendita serve la sua firma.\n\nAprendo il link riceverà un codice di verifica sulla sua email: lo digiti e potrà leggere e firmare il documento. Le firme richieste sono DUE — la seconda riguarda le clausole della sezione 7, che la legge vuole approvate a parte.\n\nGrazie,\nTelefutura",
                },
            }],
        }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ error: j?.error || `DocuSeal ha risposto ${r.status}` }, { status: 502 });

    const primo = Array.isArray(j) ? j[0] : (j?.submitters || [])[0];
    return NextResponse.json({
        ok: true,
        submissionId: primo?.submission_id || j?.id || null,
        slug: primo?.slug || null,
        link: primo?.embed_src || null,
        email,
    });
}
