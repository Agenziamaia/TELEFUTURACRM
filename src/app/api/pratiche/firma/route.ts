import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { accesso } from "@/lib/permessiServer";
import { moduloHtml, type DatiModulo } from "@/lib/moduloPratica";
import { contrattoUsatoHtml, type DatiUsato } from "@/lib/moduloUsato";
import { inviaEmail } from "@/lib/email";
import { pdfjsServer, paginePdf } from "@/lib/pdfServer";
import { leggiRegistro, dispositivoDaUA } from "@/lib/dispositivoFirma";

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
/* ⚠️ L'HOST NON SI INDOVINA, SI CHIEDE. DocuSeal ha due case — quella europea
   e quella globale — e una chiave vale su UNA sola: sull'altra risponde 401,
   che si legge come «chiave sbagliata» e fa perdere mezza giornata (successo).
   Cambiando account cambia anche la casa, quindi la si prova e la si ricorda:
   una volta per avvio, non a ogni chiamata. */
const CASE = ["https://api.docuseal.eu", "https://api.docuseal.com"];
let _host: string | null = null;

async function chiave(): Promise<string | null> {
    const { data } = await supabaseAdmin.from("impostazioni_servizio").select("docuseal_api_key").eq("id", 1).maybeSingle();
    const k = (data?.docuseal_api_key as string) || "";
    return k.trim() || null;
}

async function casa(k: string): Promise<string | null> {
    if (_host) return _host;
    for (const h of CASE) {
        try {
            const r = await fetch(`${h}/templates?limit=1`, { headers: { "X-Auth-Token": k } });
            if (r.ok) { _host = h; return h; }
        } catch { /* si prova l'altra */ }
    }
    return null;
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

/* il documento da far firmare, qualunque sia: la pratica di un ordine, la
   scheda di un'assistenza o il contratto con cui compriamo un usato. Il giro
   con DocuSeal è lo stesso — e quel giro è costato troppo per riscriverlo. */
type Doc = {
    protocollo: string; negozio: string; nomeModello: string; html: string; ruolo: string;
    apertura: string; aperturaHtml: string;
    cliente: { etichetta: string; email: string; cellulare: string };
};

function testoInvito(d: Doc, link: string, email: string): string {
    return [
        `Buongiorno,`, ``,
        d.apertura,
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

function htmlInvito(d: Doc, link: string, email: string): string {
    const e = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;font-size:15px;line-height:1.6;max-width:560px">
  <p style="margin:0 0 14px">Buongiorno,</p>
  <p style="margin:0 0 14px">${d.aperturaHtml}</p>
  <p style="margin:0 0 22px"><a href="${e(link)}"
     style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:10px">
     Firma il documento</a></p>
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
async function posizionaCampi(k: string, tpl: Record<string, unknown>, DOCUSEAL: string): Promise<{ errore?: string }> {
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

        /* ⚠️ il ripiego riempie SOLO i buchi: prima, se pdfjs trovava la prima
           firma e non la seconda, si buttava via anche quella buona. */
        if (!trovati.FIRMA1 || !trovati.FIRMA2) {
            /* ripiego: il blocco firme sta in fondo, affiancato — sinistra e
               destra, sopra il piè di pagina */
            if (!trovati.FIRMA1) trovati.FIRMA1 = { page: ultima, x: 0.06, y: 0.845 };
            if (!trovati.FIRMA2) trovati.FIRMA2 = { page: ultima, x: 0.52, y: 0.845 };
        }
        if (!trovati.DATA) {
            /* la data non trovata non deve restare senza posizione: verrebbe
               raccolta e mai stampata sul documento */
            trovati.DATA = { page: ultima, x: 0.24, y: 0.81 };
        }

        const uuid = doc.uuid;
        /* ⚠️ DOVE VA IL RIQUADRO RISPETTO AL MARCATORE.
           Misurato sul PDF che genera DocuSeal, non dedotto: il marcatore
           della firma è scritto in cima al riquadro alto 15-16 mm che ha la
           riga sul fondo, quindi la firma va MESSA SOTTO il marcatore e
           arriva a posarsi sulla riga (≈ 13 mm più giù = 0.043 di pagina).
           Il marcatore della data invece è la data stessa, che sta GIÀ sulla
           sua riga: lì il riquadro va sopra.
           Prima si alzava tutto di un'altezza intera, e la firma usciva
           dodici millimetri sopra la riga, addosso al testo delle clausole. */
        const area = (t: { page: number; x: number; y: number }, w: number, h: number, verso: "sotto" | "sopra") => ([{
            page: t.page, attachment_uuid: uuid,
            x: Math.max(0, Math.min(0.95, t.x)),
            y: Math.max(0, Math.min(0.95, verso === "sotto" ? t.y : t.y - h)),
            w, h,
        }]);
        const conAree = campi.map((c) => {
            const nome = String(c.name || "");
            /* «Firma del Cliente» sulla pratica, «Firma del Venditore» sul contratto
               dell'usato: si guarda il prefisso, non il nome intero — un campo che
               non trova la sua posizione è una firma raccolta e mai stampata. */
            if (/^Firma del /i.test(nome)) return { ...c, areas: area(trovati.FIRMA1, 0.34, 0.043, "sotto") };
            if (/^Seconda/i.test(nome)) return { ...c, areas: area(trovati.FIRMA2, 0.34, 0.043, "sotto") };
            if (/^Data/i.test(nome) && trovati.DATA) return { ...c, areas: area(trovati.DATA, 0.16, 0.022, "sopra") };
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
    const body = await req.json().catch(() => ({})) as { azione?: string; dati?: DatiModulo; datiUsato?: DatiUsato; tipo?: string; nome?: string; submissionId?: number; canale?: string; protocollo?: string;
    clienteId?: string; email?: string };

    /* ⚠️ IL PERMESSO SEGUE LA SEZIONE DA CUI SI FIRMA.
       Questa rotta serviva solo gli ordini clienti, e il permesso era
       incollato a `/ordini-clienti`. Ora firma anche i ritiri dell'usato: un
       addetto che ha Usati ma non Ordini si sarebbe visto negare la firma di
       un acquisto, con un messaggio che parla di una sezione che per lui non
       esiste. Chi controlla lo stato di una richiesta gia' partita puo' avere
       l'uno o l'altro: la richiesta e' comunque legata alla sua riga. */
    const dallUsato = body.tipo === "usato" || (body.azione === "stato" && !body.dati);
    const g = await accesso(req, dallUsato ? "usati/firma" : "pratiche/firma");
    const g2 = g.ok ? g : await accesso(req, dallUsato ? "pratiche/firma" : "usati/firma");
    if (!g2.ok) return g.risposta;
    const k = await chiave();
    if (!k) return NextResponse.json({ error: "la chiave DocuSeal non è configurata: si mette da Amministrazione." }, { status: 503 });
    const DOCUSEAL = await casa(k);
    if (!DOCUSEAL) return NextResponse.json({ error: "la chiave DocuSeal non è valida su nessuna delle due case (europea e globale): controllala." }, { status: 503 });

    /* ── com'è andata, e SI PORTA A CASA IL DOCUMENTO ─────────────────
       Il PDF firmato e il registro delle firme vivevano solo da DocuSeal:
       il giorno che l'abbonamento scade, o che si cambia fornitore, il
       documento che regge l'acconto trattenuto e i novanta giorni non è più
       nostro. Appena la firma è completa si scaricano tutti e due e si
       mettono nel nostro secchio, accanto al documento d'identità. */
    if (body.azione === "stato") {
        if (!body.submissionId) return NextResponse.json({ error: "manca la richiesta da controllare" }, { status: 400 });
        /* ⚠️ IL NUMERO DA SOLO NON APRE NIENTE (revisore 01/09).
           Prima protocollo, email e cliente arrivavano dal browser insieme al
           numero della richiesta: bastava cambiarli per farsi mandare il PDF
           firmato di una pratica qualsiasi — anche di un'altra azienda, visto
           che l'account DocuSeal e' condiviso — all'indirizzo che si voleva.
           Ora il numero si cerca nel registro, e tutto il resto si legge da
           li'. Se la richiesta non e' nostra, non esiste. */
        const { data: reg } = await supabaseAdmin.from("firme_richieste")
            .select("*").eq("submission_id", body.submissionId).maybeSingle();
        const rich = reg as { protocollo?: string; email?: string; cliente_id?: string | null; tipo?: string; archiviata_il?: string | null } | null;
        if (!rich) return NextResponse.json({ error: "questa richiesta di firma non risulta al CRM." }, { status: 404 });
        const r = await fetch(`${DOCUSEAL}/submissions/${body.submissionId}`, { headers: { "X-Auth-Token": k } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return NextResponse.json({ error: j?.error || `DocuSeal ha risposto ${r.status}` }, { status: 502 });
        const submitters = (j?.submitters || []) as { status?: string; completed_at?: string; documents?: { url?: string; name?: string }[] }[];
        const finito = submitters.length > 0 && submitters.every((s) => s.status === "completed");

        let archiviato: { nome: string; path: string } | null = null;
        let registro: { nome: string; path: string } | null = null;
        let archivioErrore: string | null = null;
        let copiaInviata = false;
        let dispositivo: string | null = null;
        let daComputer = false;
        if (finito) {
            const proto = String(rich.protocollo || "senza-protocollo").replace(/[^A-Za-z0-9._-]+/g, "_");
            const docUrl = (j?.documents || [])[0]?.url || (submitters[0]?.documents || [])[0]?.url || null;
            const auditUrl = j?.audit_log_url || null;
            const metti = async (buf: Buffer, nome: string) => {
                const path = `pratiche/${proto}/${nome}`;
                const { error } = await supabaseAdmin.storage.from("pratiche-allegati")
                    .upload(path, buf, { contentType: "application/pdf", upsert: true });
                if (error) throw new Error(error.message);
                return { nome, path };
            };
            const porta = async (url: string, nome: string) => {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`scaricamento non riuscito (${res.status})`);
                return metti(Buffer.from(await res.arrayBuffer()), nome);
            };
            let pdfFirmato: Buffer | null = null;
            try {
                if (docUrl) {
                    const res2 = await fetch(docUrl);
                    if (res2.ok) pdfFirmato = Buffer.from(await res2.arrayBuffer());
                }
                if (pdfFirmato) archiviato = await metti(pdfFirmato, `modulo-firmato-${proto}.pdf`);
                if (auditUrl) {
                    const res3 = await fetch(auditUrl);
                    if (!res3.ok) throw new Error(`scaricamento non riuscito (${res3.status})`);
                    const bufReg = Buffer.from(await res3.arrayBuffer());
                    registro = await metti(bufReg, `registro-firme-${proto}.pdf`);
                    /* ⚠️ DA QUALE DISPOSITIVO. L'API di DocuSeal non dà né IP né
                       browser: stanno solo qui dentro. Ce l'abbiamo già in mano,
                       tanto vale leggerlo — un computer, quando il link è partito
                       per SMS verso un telefono, vuol dire che ha firmato il
                       banco. */
                    try {
                        const pdfjs = await pdfjsServer();
                        const d2 = await pdfjs.getDocument({ data: new Uint8Array(bufReg) }).promise;
                        let testo = "";
                        for (let pg = 1; pg <= Math.min(d2.numPages, 3); pg++) {
                            const tc = await (await d2.getPage(pg)).getTextContent();
                            testo += " " + (tc.items as { str?: string }[]).map((it) => it.str || "").join(" ");
                        }
                        const letto = leggiRegistro(testo);
                        const dev = dispositivoDaUA(letto.ua);
                        if (dev || letto.ip) {
                            dispositivo = dev ? dev.etichetta : null;
                            daComputer = dev ? dev.daComputer : false;
                            await supabaseAdmin.from("firme_richieste")
                                .update({ dispositivo, indirizzo_ip: letto.ip || null })
                                .eq("submission_id", body.submissionId);
                        }
                    } catch { /* il registro è archiviato lo stesso */ }
                }
            } catch (e) { archivioErrore = e instanceof Error ? e.message : "archiviazione non riuscita"; }

            /* ⚠️ LE RIGHE NELLA SCHEDA DEL CLIENTE NON SI SCRIVONO QUI.
               Ci ho provato, e sbagliava momento: la firma arriva PRIMA che la
               pratica sia salvata, quindi un giro abbandonato avrebbe lasciato
               nella scheda del cliente i documenti di una pratica che non
               esiste. Le scrive chi salva — PraticheSezione per ordini e
               assistenze, la sezione Usati per i ritiri — che ha cliente,
               protocollo e percorsi tutti insieme, e le etichette giuste. */

            /* ⚠️ LA COPIA AL CLIENTE. Con `send_email: false` DocuSeal non manda
               niente al firmatario — è così che ci siamo tolti il marchio di
               un'altra azienda dalle mail — ma questo vuol dire che la copia
               firmata non gli arrivava da nessuno: col foglio di carta se la
               portava a casa, col digitale restava a mani vuote.
               Gliela mandiamo noi, da amministrazione@, col PDF allegato. */
            if (pdfFirmato && rich.email && !rich.archiviata_il) {
                try {
                    const mitt = await mittentePratiche();
                    if (mitt) {
                        await inviaEmail(mitt as never, {
                            to: String(rich.email),
                            subject: `Telefutura — copia firmata del documento ${rich.protocollo || ""}`.trim(),
                            text: [
                                "Buongiorno,", "",
                                "in allegato la copia firmata del documento.",
                                "La conservi: è la sua copia, e serve se un domani ci fosse qualcosa da chiarire.",
                                "", "Per qualsiasi cosa può rispondere a questa email o passare in negozio.",
                                "", "Grazie,", "Telefutura",
                            ].join("\n"),
                            html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;font-size:15px;line-height:1.6;max-width:560px">
  <p style="margin:0 0 14px">Buongiorno,</p>
  <p style="margin:0 0 14px">in allegato la <b>copia firmata</b> del documento.</p>
  <p style="margin:0 0 14px">La conservi: è la sua copia, e serve se un domani ci fosse qualcosa da chiarire.</p>
  <p style="margin:0 0 20px;color:#555;font-size:13.5px">Per qualsiasi cosa può rispondere a questa email, oppure passare in negozio.</p>
  <p style="margin:0;color:#555;font-size:13.5px">Grazie,<br><b style="color:#111">Telefutura</b></p>
</div>`,
                            attachments: [{ filename: `documento-firmato-${proto}.pdf`, content: pdfFirmato, contentType: "application/pdf" }],
                        });
                        copiaInviata = true;
                    }
                } catch { /* la firma è salva: la copia si può rimandare */ }
            }
        }

        if (finito) {
            await supabaseAdmin.from("firme_richieste").update({
                firmata_il: submitters[0]?.completed_at || new Date().toISOString(),
                ...(archiviato ? { archiviata_il: new Date().toISOString() } : {}),
            }).eq("submission_id", body.submissionId);
        }

        return NextResponse.json({
            ok: true, firmato: finito, copiaInviata, dispositivo, daComputer,
            stato: submitters[0]?.status || "in attesa",
            completatoIl: submitters[0]?.completed_at || null,
            archiviato, registro, archivioErrore,
        });
    }

    /* ── manda la richiesta ──────────────────────────────────────────── */
    const esc = (x: unknown) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const u = body.tipo === "usato" ? body.datiUsato : null;
    /* ⚠️ la società di chi compra non è un dettaglio grafico: senza, il
       contratto non dice CHI ha acquistato. E il prezzo a zero non è un
       acquisto. Si controlla QUI perché la regola del browser vale solo per
       chi passa dal browser. */
    if (u) {
        if (!u.societa || !u.societa.nome) return NextResponse.json({ error: "manca la società del punto vendita: si assegna da Amministrazione → Negozi." }, { status: 400 });
        if (!u.protocollo) return NextResponse.json({ error: "manca il numero di protocollo del contratto." }, { status: 400 });
        if (!(Number(u.prezzo) > 0)) return NextResponse.json({ error: "il prezzo di acquisto non può essere zero." }, { status: 400 });
    }
    if (body.dati && !body.dati.protocollo) return NextResponse.json({ error: "manca il numero di protocollo della pratica." }, { status: 400 });
    const d: Doc | null = u ? {
        protocollo: u.protocollo, negozio: u.negozio,
        nomeModello: `Contratto di acquisto usato ${u.protocollo}`,
        html: contrattoUsatoHtml(u, true), ruolo: "Venditore",
        apertura: `per l'acquisto del suo ${[u.dispositivo?.marca, u.dispositivo?.modello].filter(Boolean).join(" ") || "dispositivo"} da parte del punto vendita ${u.negozio} serve la sua firma sul contratto.`,
        aperturaHtml: `per l'<b>acquisto del suo ${esc([u.dispositivo?.marca, u.dispositivo?.modello].filter(Boolean).join(" ") || "dispositivo")}</b> da parte del punto vendita <b>${esc(u.negozio)}</b> serve la sua firma sul contratto.`,
        cliente: { etichetta: u.venditore?.etichetta || "Venditore", email: u.venditore?.email || "", cellulare: u.venditore?.cellulare || "" },
    } : body.dati ? {
        protocollo: body.dati.protocollo, negozio: body.dati.negozio,
        nomeModello: `Modulo di accettazione ${body.dati.protocollo}`,
        html: moduloHtml(body.dati, true), ruolo: "Cliente",
        apertura: `per completare la pratica ${body.dati.protocollo} aperta oggi presso il punto vendita ${body.dati.negozio} serve la sua firma.`,
        aperturaHtml: `per completare la pratica <b>${esc(body.dati.protocollo)}</b> aperta oggi presso il punto vendita <b>${esc(body.dati.negozio)}</b> serve la sua firma.`,
        cliente: { etichetta: body.dati.cliente?.etichetta || "Cliente", email: body.dati.cliente?.email || "", cellulare: body.dati.cliente?.cellulare || "" },
    } : null;
    if (!d) return NextResponse.json({ error: "mancano i dati del documento da firmare" }, { status: 400 });
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
            name: d.nomeModello,
            documents: [{ name: `documento-${d.protocollo}`, html: d.html, size: "A4" }],
        }),
    });
    const tj = await tpl.json().catch(() => ({}));
    if (!tpl.ok) return NextResponse.json({ error: tj?.error || `DocuSeal ha risposto ${tpl.status} creando il modello` }, { status: 502 });

    const posato = await posizionaCampi(k, tj, DOCUSEAL);
    if (posato.errore) {
        return NextResponse.json({ error: "non sono riuscito a mettere i campi firma sul documento (" + posato.errore + "): la richiesta NON è partita, meglio far firmare su carta." }, { status: 502 });
    }

    const r = await fetch(`${DOCUSEAL}/submissions`, {
        method: "POST",
        headers: { "X-Auth-Token": k, "Content-Type": "application/json" },
        body: JSON.stringify({
            template_id: tj.id,
            submitters: [{
                role: d.ruolo,
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
    const idRichiesta = primo?.submission_id || j?.id || null;
    if (!idRichiesta) {
        return NextResponse.json({ error: "DocuSeal non ha restituito il numero della richiesta: la firma NON è partita, riprova." }, { status: 502 });
    }
    /* La richiesta lascia una traccia PRIMA di dire al browser che è partita:
       è quella riga che poi autorizza a leggerne lo stato, e che la fa
       sopravvivere alla finestra chiusa a metà. */
    await supabaseAdmin.from("firme_richieste").upsert({
        submission_id: idRichiesta,
        tipo: u ? "usato" : "pratica",
        protocollo: d.protocollo, cliente_id: body.clienteId || null,
        email, negozio: d.negozio, canale, creata_da: g.ok ? g.sess.id : null,
    }, { onConflict: "submission_id" });

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
                        subject: u ? `Telefutura — firma il contratto di acquisto ${d.protocollo}` : `Telefutura — firma il modulo della pratica ${d.protocollo}`,
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
        submissionId: idRichiesta,
        slug: primo?.slug || null,
        link, email, cellulare: telE164 || null,
        mailInviata, mailErrore,
        /* per WhatsApp il messaggio lo manda il browser con la macchina del
           CRM (/api/whatsapp/notify), così esce dal numero del negozio e
           finisce nello storico delle chat come ogni altro messaggio */
        whatsapp: canale === "whatsapp" ? {
            numero: cell,
            testo: `Buongiorno, sono ${d.negozio} di Telefutura.\n\n${d.apertura.charAt(0).toUpperCase() + d.apertura.slice(1)}\n${link || ""}\n\nAprendo il link riceverà un codice di verifica sulla sua email (${email}): lo digiti e potrà leggere e firmare. Le firme sono DUE — la seconda riguarda le clausole della sezione 7.\n\nGrazie!`,
        } : null,
    });
}
