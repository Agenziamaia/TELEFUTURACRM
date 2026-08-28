// Client email server-side per il CRM (webmail). Gira SOLO nei route handler:
// le credenziali delle caselle non arrivano mai al browser. IMAP per leggere,
// SMTP per inviare. La password e' cifrata a riposo (AES-256-GCM).
import crypto from "crypto";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

// ── cifratura password casella ────────────────────────────────────────
function chiave(): Buffer {
    return crypto.createHash("sha256").update(process.env.EMAIL_ENC_KEY || "").digest();
}
export function cifra(plain: string): string {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", chiave(), iv);
    const enc = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}
export function decifra(b64: string): string {
    const buf = Buffer.from(String(b64), "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", chiave(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

// ── impostazioni provider (auto dall'indirizzo) ───────────────────────
const PRESET: Record<string, { imap_host: string; imap_port: number; smtp_host: string; smtp_port: number }> = {
    // Caselle dei negozi (impostazioni Luca 28/07): host = dominio nudo, IMAP 993.
    // SMTP su 587 con STARTTLS: dal VPS la 465 e' bloccata in uscita (anti-spam
    // Hetzner), la 587 e' aperta. NB: host = telefuturasrl.com, NON mail.*.
    "telefuturasrl.com": { imap_host: "telefuturasrl.com", imap_port: 993, smtp_host: "telefuturasrl.com", smtp_port: 587 },
    "gmail.com": { imap_host: "imap.gmail.com", imap_port: 993, smtp_host: "smtp.gmail.com", smtp_port: 587 },
    "googlemail.com": { imap_host: "imap.gmail.com", imap_port: 993, smtp_host: "smtp.gmail.com", smtp_port: 587 },
    "outlook.com": { imap_host: "outlook.office365.com", imap_port: 993, smtp_host: "smtp.office365.com", smtp_port: 587 },
    "hotmail.com": { imap_host: "outlook.office365.com", imap_port: 993, smtp_host: "smtp.office365.com", smtp_port: 587 },
    // Microsoft ha anche i domini italiani: senza queste righe finivano nella
    // convenzione «mail.<dominio>» e la connessione non partiva (28/08: la
    // casella dei codici Fastweb è una @hotmail.it)
    "hotmail.it": { imap_host: "outlook.office365.com", imap_port: 993, smtp_host: "smtp.office365.com", smtp_port: 587 },
    "outlook.it": { imap_host: "outlook.office365.com", imap_port: 993, smtp_host: "smtp.office365.com", smtp_port: 587 },
    "live.it": { imap_host: "outlook.office365.com", imap_port: 993, smtp_host: "smtp.office365.com", smtp_port: 587 },
    "live.com": { imap_host: "outlook.office365.com", imap_port: 993, smtp_host: "smtp.office365.com", smtp_port: 587 },
    "aruba.it": { imap_host: "imaps.aruba.it", imap_port: 993, smtp_host: "smtps.aruba.it", smtp_port: 587 },
    "libero.it": { imap_host: "imapmail.libero.it", imap_port: 993, smtp_host: "smtp.libero.it", smtp_port: 587 },
    "virgilio.it": { imap_host: "in.virgilio.it", imap_port: 993, smtp_host: "out.virgilio.it", smtp_port: 587 },
};
/** IMAP/SMTP consigliati per un indirizzo. Domini noti -> preset; altrimenti la
 *  convenzione cPanel/SiteGround `mail.<dominio>` (che copre @telefuturasrl.com). */
export function impostazioniPer(email: string): { imap_host: string; imap_port: number; smtp_host: string; smtp_port: number } {
    const dom = (String(email).split("@")[1] || "").toLowerCase().trim();
    if (PRESET[dom]) return PRESET[dom];
    return { imap_host: `mail.${dom}`, imap_port: 993, smtp_host: `mail.${dom}`, smtp_port: 587 };
}

type Account = {
    email_address: string; display_name?: string | null; username: string; pass_enc: string;
    imap_host: string; imap_port: number; smtp_host: string; smtp_port: number;
    last_uid?: number;
    // cursori sync v2 (mig. 20260804120000): cartella Sent + invalidazione UID
    sent_last_uid?: number;
    inbox_uidvalidity?: number | null;
    sent_uidvalidity?: number | null;
};

function imapClient(a: Account): ImapFlow {
    return new ImapFlow({
        host: a.imap_host, port: a.imap_port, secure: a.imap_port === 993,
        auth: { user: a.username, pass: decifra(a.pass_enc) }, logger: false,
        // alcuni host cPanel usano certificati self-signed
        tls: { rejectUnauthorized: false },
    } as any);
}
function smtpTransport(a: Account) {
    const secure = a.smtp_port === 465;
    return nodemailer.createTransport({
        host: a.smtp_host, port: a.smtp_port, secure,
        requireTLS: !secure,   // 587 -> STARTTLS obbligatorio
        auth: { user: a.username, pass: decifra(a.pass_enc) },
        tls: { rejectUnauthorized: false },
    });
}

/** Verifica login IMAP + SMTP. Lancia con un messaggio leggibile se fallisce.
 *  `soloLettura`: per le caselle di SERVIZIO (codici usa e getta) da cui non
 *  spediremo mai nulla — inutile pretendere anche l'invio, e sarebbe l'unico
 *  motivo per cui il collegamento fallirebbe su certe caselle personali. */
export async function testConnessione(a: Account, opts?: { soloLettura?: boolean }): Promise<void> {
    const c = imapClient(a);
    try { await c.connect(); await c.logout(); }
    catch (e: any) {
        try { await c.logout(); } catch { }
        /* LA RISPOSTA DEL SERVER NON SI BUTTA (Luca 28/08 sera).
           Google dice ESATTAMENTE cosa non va — «Application-specific password
           required», «Invalid credentials», «IMAP access is disabled» — e noi
           la sostituivamo con un consiglio generico. Chi legge non sa se ha
           sbagliato password, se manca la verifica in due passaggi o se è IMAP
           spento: tre problemi diversi, tre soluzioni diverse. */
        const risposta = String(e?.responseText || e?.response || e?.message || "");
        let consiglio = "";
        if (/application-specific|app password|app-specific/i.test(risposta)) {
            consiglio = " → Serve la «password per le app»: quella normale Google non l'accetta. Su myaccount.google.com → Sicurezza, attiva la verifica in due passaggi, poi cerca «Password per le app» e creane una.";
        } else if (/imap.*(disabled|not enabled)|not enabled for imap/i.test(risposta)) {
            consiglio = " → IMAP è spento su questa casella. In Gmail: ⚙️ → Visualizza tutte le impostazioni → Inoltro e POP/IMAP → Attiva IMAP.";
        } else if (/invalid credentials|authentication fail|login failed|bad username/i.test(risposta)) {
            consiglio = " → Utente o password non accettati. Se è Gmail o Outlook, dev'essere la «password per le app» di 16 lettere, non quella con cui entri nella posta.";
        } else if (e?.authenticationFailed) {
            consiglio = " → Credenziali rifiutate. Per Gmail/Outlook serve una «password per le app» e IMAP attivo; per le caselle @telefuturasrl.com la password della casella.";
        }
        throw new Error("IMAP: " + (risposta || "connessione non riuscita") + consiglio);
    }
    if (opts?.soloLettura) return;
    try { await smtpTransport(a).verify(); }
    catch (e: any) {
        const d = /invalid|auth|credential|username|password|5\.7\.8/i.test(String(e?.message || ""))
            ? "credenziali rifiutate (per Gmail/Outlook serve una 'password per le app')."
            : (e?.response || e?.message || String(e));
        throw new Error("SMTP: " + d);
    }
}

export type EmailInAtt = { name: string; mime: string; size: number; content: Buffer };
export type EmailIn = { uid: number; messageId: string | null; inReplyTo: string | null; fromAddr: string; fromName: string; to: string; toFirstAddr: string; toFirstName: string; cc: string; subject: string; text: string; html: string | null; date: Date | null; attachments: EmailInAtt[] };

/** Parse del sorgente RFC822 nel formato interno (usato da INBOX, Sent e backfill). */
async function parsaGrezzo(uid: number, source: Buffer): Promise<EmailIn | null> {
    let parsed: any;
    try { parsed = await simpleParser(source); } catch { return null; }
    const fromV = parsed.from?.value?.[0] || {};
    const toV = parsed.to?.value?.[0] || {};
    return {
        uid,
        messageId: parsed.messageId || null,
        inReplyTo: parsed.inReplyTo || null,
        fromAddr: String(fromV.address || "").toLowerCase(),
        fromName: fromV.name || "",
        to: parsed.to?.text || "",
        // primo destinatario: e' la chiave-conversazione per le mail INVIATE
        toFirstAddr: String(toV.address || "").toLowerCase(),
        toFirstName: toV.name || "",
        cc: parsed.cc?.text || "",
        subject: parsed.subject || "(senza oggetto)",
        text: parsed.text || "",
        html: parsed.html || null,
        date: parsed.date || null,
        attachments: (parsed.attachments || []).filter((x: any) => x.content).map((x: any) => ({ name: x.filename || "allegato", mime: x.contentType || "application/octet-stream", size: x.size || 0, content: x.content as Buffer })),
    };
}

/** Legge i messaggi INBOX piu' recenti (o solo i nuovi dopo last_uid). Ritorna
 *  i messaggi + il nuovo last_uid per il fetch incrementale successivo, piu'
 *  la UIDVALIDITY corrente: se il server ha ricostruito la mailbox (UIDVALIDITY
 *  diversa da quella memorizzata) gli UID salvati non valgono piu' e si riparte
 *  come prima sincronizzazione (le righe gia' a DB non si duplicano: upsert). */
export async function leggiNuove(a: Account, maxCount = 30): Promise<{ messages: EmailIn[]; lastUid: number; uidValidity: number }> {
    const client = imapClient(a);
    const out: EmailIn[] = [];
    let lastUid = a.last_uid || 0;
    let uidValidity = 0;
    await client.connect();
    try {
        const lock = await client.getMailboxLock("INBOX");
        try {
            const box: any = client.mailbox;
            uidValidity = Number(box?.uidValidity || 0);
            const cambiata = !!(a.inbox_uidvalidity && uidValidity && Number(a.inbox_uidvalidity) !== uidValidity);
            const noto = cambiata ? 0 : (a.last_uid || 0);
            lastUid = noto;
            const exists = box?.exists || 0;
            if (exists === 0) return { messages: [], lastUid, uidValidity };
            // prima sincronizzazione: le ultime N per sequenza; poi: solo UID nuovi
            const first = !noto;
            const query: any = first ? `${Math.max(1, exists - (maxCount - 1))}:${exists}` : { uid: `${noto + 1}:*` };
            const opts: any = first ? {} : { uid: true };
            for await (const msg of client.fetch(query, { uid: true, source: true }, opts)) {
                const uid = Number(msg.uid);
                if (uid <= noto) continue;
                if (uid > lastUid) lastUid = uid;
                const m = await parsaGrezzo(uid, msg.source as Buffer);
                if (m) out.push(m);
                if (out.length >= maxCount) break;
            }
        } finally { lock.release(); }
    } finally { try { await client.logout(); } catch { } }
    // ordina dal piu' vecchio al piu' recente
    out.sort((x, y) => (x.date?.getTime() || 0) - (y.date?.getTime() || 0));
    return { messages: out, lastUid, uidValidity };
}

// ── threading (Luca 05/08): una conversazione = un THREAD ─────────────
/** Radice dell'oggetto: via i prefissi di risposta/inoltro, anche ripetuti
 *  ("Re: R: Fattura" → "fattura"). Normalizzata per il confronto. */
export function oggettoRadice(s: string | null | undefined): string {
    let t = String(s || "").trim();
    for (let i = 0; i < 6; i++) {
        const m = /^(re|r|fw|fwd|i|rif)\s*:\s*/i.exec(t);
        if (!m) break;
        t = t.slice(m[0].length).trim();
    }
    return t.toLowerCase().replace(/\s+/g, " ");
}
/** true se l'oggetto pare una risposta/inoltro (Re:, R:, Fwd:, I:…). */
export function pareRisposta(s: string | null | undefined): boolean {
    return /^\s*(re|r|fw|fwd|i|rif)\s*:/i.test(String(s || ""));
}

// ── non lette allineate alla webmail (EML-05, Luca 05/08) ─────────────
/** Message-ID delle mail ANCORA NON LETTE (senza \Seen) nella INBOX IMAP.
 *  Con `limite`, oltre quel numero si prendono solo le più recenti e si
 *  segnala il troncamento (il chiamante evita di azzerare al buio). */
export async function nonLetteInbox(a: Account, limite = 800): Promise<{ ids: string[]; troncate: boolean }> {
    const client = imapClient(a);
    const out: string[] = [];
    let troncate = false;
    await client.connect();
    try {
        const lock = await client.getMailboxLock("INBOX");
        try {
            let uids = (await client.search({ seen: false }, { uid: true })) || [];
            if (!Array.isArray(uids)) uids = [];
            if (uids.length > limite) { troncate = true; uids = uids.slice(-limite); }
            if (uids.length) {
                for await (const msg of client.fetch(uids, { uid: true, envelope: true }, { uid: true } as any)) {
                    const id = (msg.envelope as any)?.messageId;
                    if (id) out.push(String(id));
                }
            }
        } finally { lock.release(); }
    } finally { try { await client.logout(); } catch { } }
    return { ids: out, troncate };
}

/** Aggiunge o toglie \Seen sull'IMAP per i Message-ID dati: quello che leggi
 *  (o rimetti da leggere) nel CRM vale anche in webmail, e il riallineamento
 *  del poll non lo ribalta. Ritorna quanti messaggi ha toccato. */
export async function flagLetteImap(a: Account, messageIds: string[], lette: boolean): Promise<number> {
    const ids = messageIds.map((s) => String(s || "").trim()).filter(Boolean);
    if (!ids.length) return 0;
    const client = imapClient(a);
    let fatte = 0;
    await client.connect();
    try {
        const lock = await client.getMailboxLock("INBOX");
        try {
            for (const id of ids) {
                // HEADER cerca per sottostringa: meglio senza parentesi angolari
                const nudo = id.replace(/^</, "").replace(/>$/, "");
                if (!nudo) continue;
                try {
                    const uids = await client.search({ header: { "message-id": nudo } }, { uid: true });
                    if (uids && uids.length) {
                        if (lette) await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true } as any);
                        else await client.messageFlagsRemove(uids, ["\\Seen"], { uid: true } as any);
                        fatte += uids.length;
                    }
                } catch { /* singolo id saltato */ }
            }
        } finally { lock.release(); }
    } finally { try { await client.logout(); } catch { } }
    return fatte;
}

// ── cartelle speciali: Sent (EML-01) e Trash (EML-03) ─────────────────
// Individuazione: prima lo special-use IMAP, poi i nomi comuni dei server
// che non lo espongono (cPanel, Outlook, client italiani).
const NOMI_SENT = ["Sent", "INBOX.Sent", "Sent Items", "INBOX.Sent Items", "Sent Messages", "Posta inviata", "INBOX.Posta inviata"];
const NOMI_TRASH = ["Trash", "INBOX.Trash", "Deleted Items", "INBOX.Deleted Items", "Deleted Messages", "INBOX.Deleted Messages", "Cestino", "INBOX.Cestino", "Posta eliminata", "INBOX.Posta eliminata"];
async function trovaCartellaSpeciale(client: ImapFlow, specialUse: string, nomi: string[]): Promise<string | null> {
    try {
        const boxes: any[] = await client.list();
        const special = boxes.find(b => b.specialUse === specialUse);
        if (special) return special.path;
        for (const nome of nomi) {
            const hit = boxes.find(b => String(b.path).toLowerCase() === nome.toLowerCase());
            if (hit) return hit.path;
        }
    } catch { /* list non disponibile */ }
    return null;
}
const trovaCartellaSent = (client: ImapFlow) => trovaCartellaSpeciale(client, "\\Sent", NOMI_SENT);
const trovaCartellaTrash = (client: ImapFlow) => trovaCartellaSpeciale(client, "\\Trash", NOMI_TRASH);

/** Legge le email NUOVE dalla cartella Sent IMAP (inviate da webmail/telefono,
 *  fuori dal CRM). Al PRIMO aggancio non importa lo storico: posiziona il
 *  cursore a fine cartella e da li' in poi prende solo il nuovo (decisione
 *  Luca 04/08: sync Sent "da ora in poi" per tutte le caselle). */
export async function leggiSentNuove(a: Account, maxCount = 30): Promise<{ messages: EmailIn[]; lastUid: number; uidValidity: number; folder: string | null }> {
    const client = imapClient(a);
    const out: EmailIn[] = [];
    let lastUid = a.sent_last_uid || 0;
    let uidValidity = 0;
    let folder: string | null = null;
    await client.connect();
    try {
        folder = await trovaCartellaSent(client);
        if (!folder) return { messages: [], lastUid, uidValidity, folder: null };
        const lock = await client.getMailboxLock(folder);
        try {
            const box: any = client.mailbox;
            uidValidity = Number(box?.uidValidity || 0);
            const cambiata = !!(a.sent_uidvalidity && uidValidity && Number(a.sent_uidvalidity) !== uidValidity);
            const noto = cambiata ? 0 : (a.sent_last_uid || 0);
            if (!noto) {
                // primo aggancio (o mailbox ricostruita): niente storico, solo cursore
                lastUid = Math.max(0, Number(box?.uidNext || 1) - 1);
                return { messages: [], lastUid, uidValidity, folder };
            }
            lastUid = noto;
            for await (const msg of client.fetch({ uid: `${noto + 1}:*` }, { uid: true, source: true }, { uid: true } as any)) {
                const uid = Number(msg.uid);
                if (uid <= noto) continue;
                if (uid > lastUid) lastUid = uid;
                const m = await parsaGrezzo(uid, msg.source as Buffer);
                if (m) out.push(m);
                if (out.length >= maxCount) break;
            }
        } finally { lock.release(); }
    } finally { try { await client.logout(); } catch { } }
    out.sort((x, y) => (x.date?.getTime() || 0) - (y.date?.getTime() || 0));
    return { messages: out, lastUid, uidValidity, folder };
}

/** Backfill storico (EML-01/EML-03): legge UN blocco di una cartella per numero
 *  di SEQUENZA, andando all'indietro. cartella: "inbox" (default), "sent" o
 *  "trash" — Sent e Trash vengono individuate via special-use + nomi comuni;
 *  se la cartella non esiste sul server torna folder=null (il chiamante chiude
 *  la fase). belowSeq = limite superiore ESCLUSO (null = si parte dal fondo).
 *  Il chiamante pagina coi blocchi successivi e si ferma al limite temporale;
 *  il cursore per seq resta valido tra invocazioni (con la tolleranza di
 *  qualche slittamento se nel frattempo si cancellano mail dal server:
 *  l'eventuale sovrapposizione viene deduplicata dall'upsert). */
export type CartellaBackfill = "inbox" | "sent" | "trash";
export async function leggiBloccoStorico(a: Account, opts: { belowSeq: number | null; block: number; cartella?: CartellaBackfill }): Promise<{ messages: EmailIn[]; lo: number; hi: number; exists: number; folder: string | null }> {
    const client = imapClient(a);
    const out: EmailIn[] = [];
    await client.connect();
    try {
        const cart = opts.cartella || "inbox";
        const folder = cart === "inbox" ? "INBOX"
            : cart === "sent" ? await trovaCartellaSent(client)
                : await trovaCartellaTrash(client);
        if (!folder) return { messages: [], lo: 1, hi: 0, exists: 0, folder: null };
        const lock = await client.getMailboxLock(folder);
        try {
            const exists = (client.mailbox as any)?.exists || 0;
            const hi = opts.belowSeq == null ? exists : Math.min(opts.belowSeq - 1, exists);
            if (hi < 1) return { messages: [], lo: 1, hi: 0, exists, folder };
            const lo = Math.max(1, hi - Math.max(1, opts.block) + 1);
            for await (const msg of client.fetch(`${lo}:${hi}`, { uid: true, source: true })) {
                const m = await parsaGrezzo(Number(msg.uid), msg.source as Buffer);
                if (m) out.push(m);
            }
            return { messages: out, lo, hi, exists, folder };
        } finally { lock.release(); }
    } finally { try { await client.logout(); } catch { } }
}

/** Copia (APPEND) una mail gia' spedita nella cartella Sent IMAP della casella:
 *  cosi' l'inviata dal CRM compare anche in webmail (EML-01, causa C).
 *  Ritorna false se la cartella Sent non esiste sul server. */
export async function appendSuSent(a: Account, raw: Buffer): Promise<boolean> {
    const client = imapClient(a);
    await client.connect();
    try {
        const folder = await trovaCartellaSent(client);
        if (!folder) return false;
        await client.append(folder, raw, ["\\Seen"], new Date());
        return true;
    } finally { try { await client.logout(); } catch { } }
}

/** Invia (o risponde a) un'email via SMTP. Il sorgente RFC822 viene costruito
 *  UNA volta (MailComposer, con Message-ID nostro) e riusato dal chiamante per
 *  l'APPEND sulla cartella Sent IMAP: la copia in webmail e' identica a quella
 *  spedita. Ritorna messageId + raw. */
// ── I CODICI USA E GETTA (Luca 28/08 sera) ────────────────────────────
/* Il collaboratore prova ad accedere, l'operatore manda il codice via mail, e
   il CRM va a prenderlo — senza che nessuno debba avere in mano la casella.
   Tutto in UNA connessione: aprirne una per cercare e una per spostare
   raddoppierebbe l'attesa davanti a chi sta guardando lo schermo.

   Lo spostamento nella cartella dedicata è la richiesta di Luca: tre di queste
   caselle sono di negozio e i colleghi le aprono tutti i giorni; portando via
   la mail appena la si vede, il codice non resta lì in chiaro per nessuno. */

export type MailOtp = { uid: number; cartella: string; fromAddr: string; subject: string; text: string; html: string | null; date: Date | null };

export async function cercaESpostaMailOtp(
    a: Account,
    opts: { mittenteOk: (from: string) => boolean; cartellaOtp: string; daMinuti?: number; max?: number },
): Promise<{ trovate: MailOtp[]; spostate: number; nonSpostate: number; motivoMancatoSpostamento: string | null; errore: string | null }> {
    const daMinuti = opts.daMinuti ?? 20;
    const max = opts.max ?? 15;
    const since = new Date(Date.now() - daMinuti * 60_000);
    const client = imapClient(a);
    const trovate: MailOtp[] = [];
    let spostate = 0;
    let nonSpostate = 0;
    let motivoMancatoSpostamento: string | null = null;
    try {
        await client.connect();
    } catch (e: unknown) {
        const err = e as { authenticationFailed?: boolean; responseText?: string; message?: string };
        return {
            trovate: [], spostate: 0, nonSpostate: 0, motivoMancatoSpostamento: null,
            errore: err?.authenticationFailed
                ? "la casella non accetta più la password salvata (per Gmail/Outlook serve una «password per le app»)"
                : (err?.responseText || err?.message || "connessione alla casella non riuscita"),
        };
    }
    try {
        // la cartella dei codici va creata la prima volta; se c'è già, l'errore
        // è atteso e si ignora
        try { await client.mailboxCreate(opts.cartellaOtp); } catch { /* esiste */ }

        for (const cartella of ["INBOX", opts.cartellaOtp]) {
            let lock: { release: () => void } | null = null;
            try { lock = await client.getMailboxLock(cartella); } catch { continue; }
            try {
                /* ⚠️ IL «SINCE» DI IMAP RAGIONA A GIORNI, NON A MINUTI.
                   Chiedendo le mail degli ultimi 3 minuti il server restituisce
                   TUTTE QUELLE DI OGGI: la finestra non veniva applicata, e il
                   CRM consegnava tranquillamente un codice di ore prima — che
                   è sempre presente, sempre plausibile e sempre sbagliato.
                   (Luca 28/08 sera: «me lo ha generato comunque, ma l'ha
                   pescato dall'ultima mail»)
                   Il taglio vero si fa QUI, sulla data del messaggio. */
                const trovati = await client.search({ since }, { uid: true });
                const uids = (Array.isArray(trovati) ? trovati : []).slice(-max);
                if (!uids.length) continue;
                const daSpostare: number[] = [];
                const limite = since.getTime();
                for await (const msg of client.fetch(uids, { uid: true, source: true }, { uid: true })) {
                    const m = await parsaGrezzo(Number(msg.uid), msg.source as Buffer);
                    if (!m || !opts.mittenteOk(m.fromAddr)) continue;
                    // fuori finestra: non è il codice di adesso, e consegnarlo
                    // farebbe fallire l'accesso facendo credere che funzioni
                    const quando = m.date ? new Date(m.date).getTime() : 0;
                    if (!quando || quando < limite) {
                        // vecchia ma del mittente giusto: la si porta comunque
                        // via dalla posta, così non resta lì in chiaro
                        if (cartella === "INBOX") daSpostare.push(m.uid);
                        continue;
                    }
                    trovate.push({ uid: m.uid, cartella, fromAddr: m.fromAddr, subject: m.subject, text: m.text, html: m.html, date: m.date });
                    if (cartella === "INBOX") daSpostare.push(m.uid);
                }
                // via dalla posta del negozio: il codice si prende dal CRM
                if (cartella === "INBOX" && daSpostare.length) {
                    try {
                        await client.messageMove(daSpostare.join(","), opts.cartellaOtp, { uid: true });
                        spostate = daSpostare.length;
                    } catch (e) {
                        /* NON SI INGOIA (28/08 sera): se lo spostamento fallisce
                           il codice si legge lo stesso, ma la mail RESTA nella
                           posta — e su una casella di negozio quello è
                           esattamente il problema che volevamo togliere. Deve
                           risultare, o un giorno smette di funzionare e nessuno
                           se ne accorge. */
                        nonSpostate = daSpostare.length;
                        motivoMancatoSpostamento = String((e as Error)?.message || e).slice(0, 140);
                    }
                }
            } finally { lock?.release(); }
        }
    } finally { try { await client.logout(); } catch { /* già chiusa */ } }
    // la più recente per prima: è quella che l'utente sta aspettando
    trovate.sort((x, y) => (y.date?.getTime() || 0) - (x.date?.getTime() || 0));
    return { trovate, spostate, nonSpostate, motivoMancatoSpostamento, errore: null };
}

export async function inviaEmail(a: Account, opts: { to: string; subject: string; text?: string; html?: string; inReplyTo?: string | null; attachments?: { filename: string; content: Buffer; contentType?: string }[] }): Promise<{ messageId: string; raw: Buffer }> {
    const dominio = String(a.email_address).split("@")[1] || "crm.local";
    const messageId = `<${crypto.randomBytes(16).toString("hex")}@${dominio}>`;
    const mail = new MailComposer({
        from: a.display_name ? `"${a.display_name}" <${a.email_address}>` : a.email_address,
        to: opts.to,
        subject: opts.subject,
        text: opts.text || undefined,
        html: opts.html || undefined,
        inReplyTo: opts.inReplyTo || undefined,
        references: opts.inReplyTo || undefined,
        attachments: opts.attachments,
        messageId,
        date: new Date(),
    });
    const raw = await mail.compile().build();
    // col raw pronto l'envelope va dichiarato a mano (nodemailer non lo estrae)
    await smtpTransport(a).sendMail({ envelope: { from: a.email_address, to: opts.to }, raw });
    return { messageId, raw };
}
