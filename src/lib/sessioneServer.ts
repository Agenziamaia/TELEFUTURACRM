// SESSIONE FIRMATA (Blindatura fase A, Luca 28/08): al login il server emette
// un cookie HttpOnly firmato con HMAC — da lì in poi le route API sanno CHI
// chiama in modo non falsificabile (il localStorage non fa fede). La chiave
// deriva da EMAIL_ENC_KEY, che sul VPS c'è già (la usa la 2FA).
import crypto from "crypto";

const chiave = () => crypto.createHash("sha256").update("tf-sessione:" + (process.env.EMAIL_ENC_KEY || "")).digest();

export type SessioneTf = { id: string; role: string; exp: number };

export const SESSIONE_COOKIE = "tf_s";
export const SESSIONE_GIORNI = 7;

export function firmaSessione(s: SessioneTf): string {
    const corpo = Buffer.from(JSON.stringify(s)).toString("base64url");
    const mac = crypto.createHmac("sha256", chiave()).update(corpo).digest("base64url");
    return `${corpo}.${mac}`;
}

export function leggiSessione(cookieHeader: string | null | undefined): SessioneTf | null {
    if (!process.env.EMAIL_ENC_KEY) {
        // niente chiave = ambiente di SVILUPPO: aperto per non bloccare i
        // terminal locali. In produzione la chiave c'è (sonda 28/08) e se
        // mai sparisse il fail è CHIUSO, non aperto.
        if (process.env.NODE_ENV !== "production") return { id: "dev", role: "dev", exp: Number.MAX_SAFE_INTEGER };
        return null;
    }
    const m = /(?:^|;\s*)tf_s=([^;]+)/.exec(String(cookieHeader || ""));
    if (!m) return null;
    const [corpo, mac] = m[1].split(".");
    if (!corpo || !mac) return null;
    try {
        const atteso = crypto.createHmac("sha256", chiave()).update(corpo).digest("base64url");
        const a = Buffer.from(mac), b = Buffer.from(atteso);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
        const s = JSON.parse(Buffer.from(corpo, "base64url").toString()) as SessioneTf;
        if (!s?.id || !s?.exp || Date.now() > s.exp) return null;
        return s;
    } catch { return null; }
}

/** Il varco per le route API: sessione valida o niente. */
export function richiedeSessione(request: Request): SessioneTf | null {
    return leggiSessione(request.headers.get("cookie"));
}

/** Risposta 200 col messaggio d'errore che i client già mostrano. */
export const rispostaSessioneNonValida = () =>
    Response.json({ error: "Sessione non valida: esci e rientra nel CRM." });
