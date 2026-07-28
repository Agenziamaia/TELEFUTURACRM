// Client email server-side per il CRM (webmail). Gira SOLO nei route handler:
// le credenziali delle caselle non arrivano mai al browser. IMAP per leggere,
// SMTP per inviare. La password e' cifrata a riposo (AES-256-GCM).
import crypto from "crypto";
import nodemailer from "nodemailer";
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
    "gmail.com": { imap_host: "imap.gmail.com", imap_port: 993, smtp_host: "smtp.gmail.com", smtp_port: 465 },
    "googlemail.com": { imap_host: "imap.gmail.com", imap_port: 993, smtp_host: "smtp.gmail.com", smtp_port: 465 },
    "outlook.com": { imap_host: "outlook.office365.com", imap_port: 993, smtp_host: "smtp.office365.com", smtp_port: 587 },
    "hotmail.com": { imap_host: "outlook.office365.com", imap_port: 993, smtp_host: "smtp.office365.com", smtp_port: 587 },
    "aruba.it": { imap_host: "imaps.aruba.it", imap_port: 993, smtp_host: "smtps.aruba.it", smtp_port: 465 },
    "libero.it": { imap_host: "imapmail.libero.it", imap_port: 993, smtp_host: "smtp.libero.it", smtp_port: 465 },
    "virgilio.it": { imap_host: "in.virgilio.it", imap_port: 993, smtp_host: "out.virgilio.it", smtp_port: 465 },
};
/** IMAP/SMTP consigliati per un indirizzo. Domini noti -> preset; altrimenti la
 *  convenzione cPanel/SiteGround `mail.<dominio>` (che copre @telefuturasrl.com). */
export function impostazioniPer(email: string): { imap_host: string; imap_port: number; smtp_host: string; smtp_port: number } {
    const dom = (String(email).split("@")[1] || "").toLowerCase().trim();
    if (PRESET[dom]) return PRESET[dom];
    return { imap_host: `mail.${dom}`, imap_port: 993, smtp_host: `mail.${dom}`, smtp_port: 465 };
}

type Account = { email_address: string; display_name?: string | null; username: string; pass_enc: string; imap_host: string; imap_port: number; smtp_host: string; smtp_port: number; last_uid?: number };

function imapClient(a: Account): ImapFlow {
    return new ImapFlow({
        host: a.imap_host, port: a.imap_port, secure: a.imap_port === 993,
        auth: { user: a.username, pass: decifra(a.pass_enc) }, logger: false,
        // alcuni host cPanel usano certificati self-signed
        tls: { rejectUnauthorized: false },
    } as any);
}
function smtpTransport(a: Account) {
    return nodemailer.createTransport({
        host: a.smtp_host, port: a.smtp_port, secure: a.smtp_port === 465,
        auth: { user: a.username, pass: decifra(a.pass_enc) },
        tls: { rejectUnauthorized: false },
    });
}

/** Verifica login IMAP + SMTP. Lancia con un messaggio leggibile se fallisce. */
export async function testConnessione(a: Account): Promise<void> {
    const c = imapClient(a);
    try { await c.connect(); await c.logout(); }
    catch (e: any) { try { await c.logout(); } catch { } throw new Error("IMAP: " + (e?.message || e)); }
    try { await smtpTransport(a).verify(); }
    catch (e: any) { throw new Error("SMTP: " + (e?.message || e)); }
}

export type EmailInAtt = { name: string; mime: string; size: number; content: Buffer };
export type EmailIn = { uid: number; messageId: string | null; inReplyTo: string | null; fromAddr: string; fromName: string; to: string; cc: string; subject: string; text: string; html: string | null; date: Date | null; attachments: EmailInAtt[] };

/** Legge i messaggi INBOX piu' recenti (o solo i nuovi dopo last_uid). Ritorna
 *  i messaggi + il nuovo last_uid per il fetch incrementale successivo. */
export async function leggiNuove(a: Account, maxCount = 30): Promise<{ messages: EmailIn[]; lastUid: number }> {
    const client = imapClient(a);
    const out: EmailIn[] = [];
    let lastUid = a.last_uid || 0;
    await client.connect();
    try {
        const lock = await client.getMailboxLock("INBOX");
        try {
            const exists = (client.mailbox as any)?.exists || 0;
            if (exists === 0) return { messages: [], lastUid };
            // prima sincronizzazione: le ultime N per sequenza; poi: solo UID nuovi
            const first = !a.last_uid;
            const query: any = first ? `${Math.max(1, exists - (maxCount - 1))}:${exists}` : { uid: `${(a.last_uid || 0) + 1}:*` };
            const opts: any = first ? {} : { uid: true };
            for await (const msg of client.fetch(query, { uid: true, source: true }, opts)) {
                const uid = Number(msg.uid);
                if (uid <= (a.last_uid || 0)) continue;
                if (uid > lastUid) lastUid = uid;
                let parsed: any;
                try { parsed = await simpleParser(msg.source as Buffer); } catch { continue; }
                const fromV = parsed.from?.value?.[0] || {};
                out.push({
                    uid,
                    messageId: parsed.messageId || null,
                    inReplyTo: parsed.inReplyTo || null,
                    fromAddr: String(fromV.address || "").toLowerCase(),
                    fromName: fromV.name || "",
                    to: parsed.to?.text || "",
                    cc: parsed.cc?.text || "",
                    subject: parsed.subject || "(senza oggetto)",
                    text: parsed.text || "",
                    html: parsed.html || null,
                    date: parsed.date || null,
                    attachments: (parsed.attachments || []).filter((x: any) => x.content).map((x: any) => ({ name: x.filename || "allegato", mime: x.contentType || "application/octet-stream", size: x.size || 0, content: x.content as Buffer })),
                });
                if (out.length >= maxCount) break;
            }
        } finally { lock.release(); }
    } finally { try { await client.logout(); } catch { } }
    // ordina dal piu' vecchio al piu' recente
    out.sort((x, y) => (x.date?.getTime() || 0) - (y.date?.getTime() || 0));
    return { messages: out, lastUid };
}

/** Invia (o risponde a) un'email via SMTP. Ritorna il messageId assegnato. */
export async function inviaEmail(a: Account, opts: { to: string; subject: string; text?: string; html?: string; inReplyTo?: string | null; attachments?: { filename: string; content: Buffer; contentType?: string }[] }): Promise<{ messageId: string }> {
    const info = await smtpTransport(a).sendMail({
        from: a.display_name ? `"${a.display_name}" <${a.email_address}>` : a.email_address,
        to: opts.to,
        subject: opts.subject,
        text: opts.text || undefined,
        html: opts.html || undefined,
        inReplyTo: opts.inReplyTo || undefined,
        references: opts.inReplyTo || undefined,
        attachments: opts.attachments,
    });
    return { messageId: info.messageId || "" };
}
