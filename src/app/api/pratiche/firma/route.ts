import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { accesso } from "@/lib/permessiServer";
import { moduloHtml, type DatiModulo } from "@/lib/moduloPratica";
import { inviaEmail } from "@/lib/email";
import { pdfjsServer, paginePdf } from "@/lib/pdfServer";

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

/* ⚠️ DA AMMINISTRAZIONE, SEMPRE (Luca 01/09: «tutte queste email devono
   arrivare da parte di amministrazione, che è la mail ufficiale per le
   comunicazioni»).
   Prima cercavo la casella del negozio che apre la pratica. Due errori in uno:
   la regola era un'altra, e il codice sbagliava pure — con il negozio vuoto
   («» per un utente di direzione) il confronto pescava la prima casella senza
   negozio, e al cliente è arrivata una richiesta di firma dalla posta
   personale di un collega.
   Adesso c'è un mittente solo, e se non c'è NON si manda: meglio dirlo che
   spedire un contratto dall'indirizzo sbagliato. */
async function mittentePratiche() {
    const { data } = await supabaseAdmin.from("email_accounts")
        .select("*").eq("status", "attiva").ilike("email_address", "amministrazione@%").limit(1);
    return ((data ?? [])[0] as Record<string, unknown> | undefined) || null;
}

function testoInvito(d: DatiModulo, link: string, email: string): string {
    return [
        `Buongiorno,`, ``,
        `per completare la pratica ${d.protocollo} aperta oggi presso il punto vendita ${d.negozio} serve la sua firma.`,
        ``,
        `Firma qui: ${link}`,
        ``,
        `Aprendo il link riceverà un codice di verifica all'indirizzo ${email}: lo digiti e potrà leggere e firmare il documento.`,
        `Le firme richieste sono DUE: la seconda riguarda le clausole della sezione 7, che la legge vuole approvate a parte.`,
        ``,
        `Se qualcosa non torna, risponda pure a questa email, oppure passi in negozio.`,
        ``, `Grazie,`, `Telefutura — ${d.negozio}`,
    ].join("\n");
}

function htmlInvito(d: DatiModulo, link: string, email: string): string {
    const e = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;font-size:15px;line-height:1.6;max-width:560px">
  <p style="margin:0 0 14px">Buongiorno,</p>
  <p style="margin:0 0 14px">per completare la pratica <b>${e(d.protocollo)}</b> aperta oggi presso il punto vendita
    <b>${e(d.negozio)}</b> serve la sua firma.</p>
  <p style="margin:0 0 22px"><a href="${e(link)}"
     style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:10px">
     Firma il modulo</a></p>
  <p style="margin:0 0 14px">Aprendo il link riceverà un <b>codice di verifica</b> all'indirizzo ${e(email)}:
    lo digiti e potrà leggere e firmare il documento.</p>
  <p style="margin:0 0 14px">Le firme richieste sono <b>due</b>: la seconda riguarda le clausole della sezione 7,
    che la legge vuole approvate a parte.</p>
  <p style="margin:0 0 20px;color:#555;font-size:13.5px">Se qualcosa non torna, risponda pure a questa email, oppure passi in negozio.</p>
  <p style="margin:0;color:#555;font-size:13.5px">Grazie,<br><b style="color:#111">Telefutura</b> — ${e(d.negozio)}</p>
</div>`;
}

/* Trova nel PDF appena generato i tre marcatori e ci mette sopra i campi.
   Le coordinate di DocuSeal sono RELATIVE (0-1) con l'origine in alto a
   sinistra; pdfjs le dà in punti con l'origine in basso, quindi la y si
   ribalta. */
async function posizionaCampi(k: string, tpl: Record<string, unknown>): Promise<{ errore?: string }> {
    try {
        const doc = ((tpl.documents as { url?: string; uuid?: string }[]) || [])[0];
        const campi = (tpl.fields as Record<string, unknown>[]) || [];
        if (!doc?.url || campi.length === 0) return { errore: "il modello non ha documento o campi" };

        const res = await fetch(doc.url);
        if (!res.ok) return { errore: `PDF non scaricabile (${res.status})` };
        const byte = Buffer.from(await res.arrayBuffer());

        /* I MARCATORI, se pdfjs parte. Se non parte — succede: dentro il
           pacchetto di produzione il suo worker può non esserci — non si
           rinuncia alla firma: si contano le pagine leggendo i byte e si
           mettono i campi dove il modulo li disegna sempre, cioè in fondo
           all'ultima pagina. Meno preciso, ma la firma finisce sul foglio. */
        const trovati: Record<string, { page: number; x: number; y: number }> = {};
        let ultima = Math.max(0, paginePdf(byte) - 1);
        try {
            const pdfjs = await pdfjsServer();
            const pdf = await pdfjs.getDocument({ data: new Uint8Array(byte), isEvalSupported: false, useSystemFonts: false }).promise;
            ultima = Math.max(0, pdf.numPages - 1);
            for (let p = 1; p <= pdf.numPages; p++) {
                const pagina = await pdf.getPage(p);
                const vp = pagina.getViewport({ scale: 1 });
                const cont = await pagina.getTextContent();
                for (const it of cont.items as { str: string; transform: number[] }[]) {
                    const m = String(it.str || "").match(/@@(FIRMA1|FIRMA2|DATA)@@/);
                    if (!m || trovati[m[1]]) continue;
                    trovati[m[1]] = { page: p - 1, x: it.transform[4] / vp.width, y: 1 - it.transform[5] / vp.height };
                }
            }
        } catch { /* si va di ripiego */ }

        if (!trovati.FIRMA1 || !trovati.FIRMA2) {
            /* ripiego: il blocco firme sta in fondo, affiancato — sinistra e
               destra, sopra il piè di pagina */
            trovati.FIRMA1 = { page: ultima, x: 0.09, y: 0.86 };
            trovati.FIRMA2 = { page: ultima, x: 0.55, y: 0.86 };
            trovati.DATA = { page: ultima, x: 0.13, y: 0.91 };
        }

        const uuid = doc.uuid;
        const area = (t: { page: number; x: number; y: number }, w: number, h: number) => ([{
            page: t.page, attachment_uuid: uuid,
            x: Math.max(0, Math.min(0.95, t.x)),
            // il marcatore sta sulla riga della firma: il riquadro va SOPRA
            y: Math.max(0, Math.min(0.95, t.y - h)),
            w, h,
        }]);
        const conAree = campi.map((c) => {
            const nome = String(c.name || "");
            if (/^Firma del Cliente$/i.test(nome)) return { ...c, areas: area(trovati.FIRMA1, 0.34, 0.075) };
            if (/^Seconda/i.test(nome)) return { ...c, areas: area(trovati.FIRMA2, 0.34, 0.075) };
            if (/^Data/i.test(nome) && trovati.DATA) return { ...c, areas: area(trovati.DATA, 0.16, 0.022) };
            return c;
        });

        const patch = await fetch(`${DOCUSEAL}/templates/${tpl.id}`, {
            method: "PATCH", headers: { "X-Auth-Token": k, "Content-Type": "application/json" },
            body: JSON.stringify({ fields: conAree }),
        });
        if (!patch.ok) return { errore: `DocuSeal ha rifiutato le posizioni (${patch.status})` };
        return {};
    } catch (e) { return { errore: e instanceof Error ? e.message : "posizionamento non riuscito" }; }
}

export async function POST(req: Request) {
    const g = await accesso(req, "pratiche/firma");
    if (!g.ok) return g.risposta;

    const body = await req.json().catch(() => ({})) as { azione?: string; dati?: DatiModulo; nome?: string; submissionId?: number; canale?: string; protocollo?: string };
    const k = await chiave();
    if (!k) return NextResponse.json({ error: "la chiave DocuSeal non è configurata: si mette da Amministrazione." }, { status: 503 });

    /* ── com'è andata, e SI PORTA A CASA IL DOCUMENTO ─────────────────
       Il PDF firmato e il registro delle firme vivevano solo da DocuSeal:
       il giorno che l'abbonamento scade, o che si cambia fornitore, il
       documento che regge l'acconto trattenuto e i novanta giorni non è più
       nostro. Appena la firma è completa si scaricano tutti e due e si
       mettono nel nostro secchio, accanto al documento d'identità. */
    if (body.azione === "stato") {
        if (!body.submissionId) return NextResponse.json({ error: "manca la richiesta da controllare" }, { status: 400 });
        const r = await fetch(`${DOCUSEAL}/submissions/${body.submissionId}`, { headers: { "X-Auth-Token": k } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return NextResponse.json({ error: j?.error || `DocuSeal ha risposto ${r.status}` }, { status: 502 });
        const submitters = (j?.submitters || []) as { status?: string; completed_at?: string; documents?: { url?: string; name?: string }[] }[];
        const finito = submitters.length > 0 && submitters.every((s) => s.status === "completed");

        let archiviato: { nome: string; path: string } | null = null;
        let registro: { nome: string; path: string } | null = null;
        let archivioErrore: string | null = null;
        if (finito) {
            const proto = String(body.protocollo || "senza-protocollo").replace(/[^A-Za-z0-9._-]+/g, "_");
            const docUrl = (j?.documents || [])[0]?.url || (submitters[0]?.documents || [])[0]?.url || null;
            const auditUrl = j?.audit_log_url || null;
            const porta = async (url: string, nome: string) => {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`scaricamento non riuscito (${res.status})`);
                const buf = Buffer.from(await res.arrayBuffer());
                const path = `pratiche/${proto}/${nome}`;
                const { error } = await supabaseAdmin.storage.from("pratiche-allegati")
                    .upload(path, buf, { contentType: "application/pdf", upsert: true });
                if (error) throw new Error(error.message);
                return { nome, path };
            };
            try {
                if (docUrl) archiviato = await porta(docUrl, `modulo-firmato-${proto}.pdf`);
                if (auditUrl) registro = await porta(auditUrl, `registro-firme-${proto}.pdf`);
            } catch (e) { archivioErrore = e instanceof Error ? e.message : "archiviazione non riuscita"; }
        }

        return NextResponse.json({
            ok: true, firmato: finito,
            stato: submitters[0]?.status || "in attesa",
            completatoIl: submitters[0]?.completed_at || null,
            archiviato, registro, archivioErrore,
        });
    }

    /* ── manda la richiesta ──────────────────────────────────────────── */
    const d = body.dati;
    if (!d) return NextResponse.json({ error: "mancano i dati della pratica" }, { status: 400 });
    const email = String(d.cliente?.email || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(email)) {
        return NextResponse.json({ error: "il cliente non ha un'email valida in anagrafica: il codice non avrebbe dove arrivare." }, { status: 400 });
    }
    /* ── DOVE ARRIVA (Luca 01/09: «possiamo mandarlo solo per email? non sul
       cellulare? né su WhatsApp dal numero del negozio?»).
       Il LINK può viaggiare su tre strade; il CODICE su due, perché DocuSeal
       manda il suo codice solo per email o per SMS — WhatsApp non è un suo
       canale. Quindi:
         email    → link e codice sulla sua email
         sms      → link e codice sul suo cellulare
         whatsapp → link su WhatsApp dal numero del negozio, codice sull'email
       In tutti e tre i casi i recapiti sono quelli dell'ANAGRAFICA: nessun
       indirizzo e nessun numero si sceglie qui. */
    const canale = body.canale === "sms" ? "sms" : body.canale === "whatsapp" ? "whatsapp" : "email";
    const cell = String(d.cliente?.cellulare || "").replace(/\D/g, "");
    const telE164 = cell ? (cell.startsWith("39") ? "+" + cell : "+39" + cell) : "";
    if ((canale === "sms" || canale === "whatsapp") && cell.length < 8) {
        return NextResponse.json({ error: "il cliente non ha un cellulare in anagrafica: scegli l'email, o aggiungilo." }, { status: 400 });
    }

    /* ═══ TRE PASSI, NON UNO ═══════════════════════════════════════════
       ① si crea il MODELLO dall'HTML: DocuSeal ci mette dentro il documento,
          ma i campi firma nascono senza posizione (provato: `areas: []` sia
          coi tag <signature-field> sia coi text tag). Senza posizione la firma
          viene raccolta e non stampata: il cliente riceve un PDF vuoto.
       ② si scarica il PDF appena generato e si CERCANO I MARCATORI che il
          modulo porta scritti in bianco (@@FIRMA1@@, @@DATA@@, @@FIRMA2@@):
          da lì escono le coordinate vere, qualunque impaginazione abbia fatto
          DocuSeal e su qualunque pagina siano finite.
       ③ si dice a DocuSeal dove stanno i campi, e solo allora si manda.
       Un giro in più, ma è la differenza fra un contratto e un foglio bianco. */
    const tpl = await fetch(`${DOCUSEAL}/templates/html`, {
        method: "POST",
        headers: { "X-Auth-Token": k, "Content-Type": "application/json" },
        body: JSON.stringify({
            name: `Modulo di accettazione ${d.protocollo}`,
            documents: [{ name: `modulo-${d.protocollo}`, html: moduloHtml(d, true), size: "A4" }],
        }),
    });
    const tj = await tpl.json().catch(() => ({}));
    if (!tpl.ok) return NextResponse.json({ error: tj?.error || `DocuSeal ha risposto ${tpl.status} creando il modello` }, { status: 502 });

    const posato = await posizionaCampi(k, tj);
    if (posato.errore) {
        return NextResponse.json({ error: "non sono riuscito a mettere i campi firma sul documento (" + posato.errore + "): la richiesta NON è partita, meglio far firmare su carta." }, { status: 502 });
    }

    const r = await fetch(`${DOCUSEAL}/submissions`, {
        method: "POST",
        headers: { "X-Auth-Token": k, "Content-Type": "application/json" },
        body: JSON.stringify({
            template_id: tj.id,
            submitters: [{
                role: "Cliente",
                name: String(d.cliente?.etichetta || "Cliente"),
                email,
                ...(telE164 ? { phone: telE164 } : {}),
                // ⬇️ IL CODICE: sull'email o sul suo cellulare — mai altrove
                require_email_2fa: canale !== "sms",
                require_phone_2fa: canale === "sms",
                /* ⚠️ L'EMAIL LA MANDIAMO NOI, non DocuSeal.
                   Due ragioni, tutte e due viste sul telefono di Luca:
                   ① il LOGO. Il piè di pagina di DocuSeal porta il marchio
                      dell'account, che qui è AstaRadar — e il marchio in
                      DocuSeal è per ACCOUNT, non per invio: cambiarlo
                      rimarchierebbe anche i contratti di AstaRadar. L'unico
                      modo di avere Telefutura solo in questo processo è
                      spedire dalla nostra posta.
                   ② il REPLY. Se il cliente risponde deve rispondere al
                      negozio, non a una casella di DocuSeal.
                   Resta di DocuSeal la sola mail col codice: quella è la
                   verifica, e non la si può spedire da fuori. */
                send_email: false,
                send_sms: canale === "sms",
            }],
        }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ error: j?.error || `DocuSeal ha risposto ${r.status}` }, { status: 502 });

    const primo = Array.isArray(j) ? j[0] : (j?.submitters || [])[0];
    const link = primo?.embed_src || null;

    /* ── la mail di invito, con la nostra faccia ─────────────────────── */
    let mailInviata = false;
    let mailErrore: string | null = null;
    if (canale === "email") {
        if (!link) mailErrore = "DocuSeal non ha restituito il link da mandare";
        else {
            const mittente = await mittentePratiche();
            if (!mittente) mailErrore = "la casella amministrazione@ non è collegata al CRM: il link non è stato spedito. Le richieste di firma escono solo da lì.";
            else {
                try {
                    await inviaEmail(mittente as never, {
                        to: email,
                        subject: `Telefutura — firma il modulo della pratica ${d.protocollo}`,
                        text: testoInvito(d, link, email),
                        html: htmlInvito(d, link, email),
                    });
                    mailInviata = true;
                } catch (e) { mailErrore = e instanceof Error ? e.message : "invio non riuscito"; }
            }
        }
    }
    return NextResponse.json({
        ok: true, canale,
        submissionId: primo?.submission_id || j?.id || null,
        slug: primo?.slug || null,
        link, email, cellulare: telE164 || null,
        mailInviata, mailErrore,
        /* per WhatsApp il messaggio lo manda il browser con la macchina del
           CRM (/api/whatsapp/notify), così esce dal numero del negozio e
           finisce nello storico delle chat come ogni altro messaggio */
        whatsapp: canale === "whatsapp" ? {
            numero: cell,
            testo: `Buongiorno, sono ${d.negozio} di Telefutura.\n\nPer completare la pratica ${d.protocollo} serve la sua firma:\n${link || ""}\n\nAprendo il link riceverà un codice di verifica sulla sua email (${email}): lo digiti e potrà leggere e firmare. Le firme sono DUE — la seconda riguarda le clausole della sezione 7.\n\nGrazie!`,
        } : null,
    });
}
