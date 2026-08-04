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

/** Verifica login IMAP + SMTP. Lancia con un messaggio leggibile se fallisce. */
export async function testConnessione(a: Account): Promise<void> {
    const c = imapClient(a);
    try { await c.connect(); await c.logout(); }
    catch (e: any) {
        try { await c.logout(); } catch { }
        const d = e?.authenticationFailed
            ? "credenziali rifiutate. Se e' Gmail/Outlook serve una 'password per le app' (non quella normale) e IMAP attivo. Per le caselle @telefuturasrl.com usa la password della casella."
            : (e?.responseText || e?.message || String(e));
        throw new Error("IMAP: " + d);
    }
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

// ── cartella Sent (EML-01) ────────────────────────────────────────────
// Nomi comuni della "Posta inviata" quando il server non espone \Sent.
const NOMI_SENT = ["Sent", "INBOX.Sent", "Sent Items", "INBOX.Sent Items", "Sent Messages", "Posta inviata", "INBOX.Posta inviata"];
async function trovaCartellaSent(client: ImapFlow): Promise<string | null> {
    try {
        const boxes: any[] = await client.list();
        const special = boxes.find(b => b.specialUse === "\\Sent");
        if (special) return special.path;
        for (const nome of NOMI_SENT) {
            const hit = boxes.find(b => String(b.path).toLowerCase() === nome.toLowerCase());
            if (hit) return hit.path;
        }
    } catch { /* list non disponibile */ }
    return null;
}

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

/** Backfill storico (EML-01): legge UN blocco di INBOX per numero di SEQUENZA,
 *  andando all'indietro. belowSeq = limite superiore ESCLUSO (null = si parte
 *  dal fondo della casella). Il chiamante pagina coi blocchi successivi e si
 *  ferma al limite temporale; il cursore per seq resta valido tra invocazioni
 *  (con la tolleranza di qualche slittamento se nel frattempo si cancellano
 *  mail dal server: l'eventuale sovrapposizione viene deduplicata dall'upsert). */
export async function leggiBloccoStorico(a: Account, opts: { belowSeq: number | null; block: number }): Promise<{ messages: EmailIn[]; lo: number; hi: number; exists: number }> {
    const client = imapClient(a);
    const out: EmailIn[] = [];
    await client.connect();
    try {
        const lock = await client.getMailboxLock("INBOX");
        try {
            const exists = (client.mailbox as any)?.exists || 0;
            const hi = opts.belowSeq == null ? exists : Math.min(opts.belowSeq - 1, exists);
            if (hi < 1) return { messages: [], lo: 1, hi: 0, exists };
            const lo = Math.max(1, hi - Math.max(1, opts.block) + 1);
            for await (const msg of client.fetch(`${lo}:${hi}`, { uid: true, source: true })) {
                const m = await parsaGrezzo(Number(msg.uid), msg.source as Buffer);
                if (m) out.push(m);
            }
            return { messages: out, lo, hi, exists };
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
