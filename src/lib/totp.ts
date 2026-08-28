// Verifica in due passaggi (2FA) — TOTP compatibile con Google Authenticator,
// Microsoft Authenticator, Authy, ecc. Gira SOLO lato server (route handler):
// il segreto e' cifrato a riposo e non arriva mai al browser (tranne l'otpauth
// durante l'iscrizione, che serve a generare il QR da scansionare).
import crypto from "crypto";
import { authenticator } from "otplib";

// tolleranza di ±1 finestra (30s prima/dopo) per gli orologi non perfettamente allineati
authenticator.options = { window: 1 };

function chiave(): Buffer {
    return crypto.createHash("sha256").update(process.env.EMAIL_ENC_KEY || "").digest();
}
export function cifraSegreto(plain: string): string {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", chiave(), iv);
    const enc = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}
export function decifraSegreto(b64: string): string {
    const buf = Buffer.from(String(b64), "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", chiave(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

export function generaSegreto(): string {
    return authenticator.generateSecret();
}
/** URI otpauth:// da mettere nel QR (l'app authenticator la legge). */
export function otpauthUri(email: string, secret: string): string {
    return authenticator.keyuri(email || "utente", "Telefutura CRM", secret);
}
/* ══ GENERARE il codice, non solo verificarlo (Luca 28/08 sera) ═════════
   Alcune utenze — Vodafone — vogliono il codice dell'app Authenticator, che
   oggi vive sul telefono di una persona: se quella è in ferie o cambia
   telefono, al portale non entra nessuno.
   L'app non fa niente di magico: applica un algoritmo pubblico a una chiave
   che il portale mostra una volta sola. Con quella chiave il codice lo sa
   calcolare anche il CRM — è la stessa cosa che fa già per la propria verifica
   in due passaggi, solo dall'altro lato. */

/** Il codice a 6 cifre di adesso, dalla chiave dell'autenticatore. */
export function generaCodice(secret: string): string | null {
    try { return authenticator.generate(String(secret || "").replace(/\s+/g, "").toUpperCase()); }
    catch { return null; }
}

/** Quanti secondi restano prima che il codice cambi (il passo è 30 secondi:
 *  serve a mostrare il tempo vero, non un conto alla rovescia inventato). */
export function secondiResidui(): number {
    const passo = 30;
    return passo - (Math.floor(Date.now() / 1000) % passo);
}

/** La chiave è scritta bene? Le chiavi degli autenticatori sono base32:
 *  lettere A-Z e cifre 2-7, spesso mostrate a gruppi di quattro. */
export function chiaveValida(secret: string): boolean {
    const s = String(secret || "").replace(/\s+/g, "").toUpperCase();
    return s.length >= 16 && /^[A-Z2-7]+=*$/.test(s) && !!generaCodice(s);
}

/** true se il codice a 6 cifre corrisponde al segreto (con tolleranza ±30s). */
export function verificaCodice(code: string, secret: string): boolean {
    try { return authenticator.verify({ token: String(code || "").replace(/\D/g, ""), secret }); }
    catch { return false; }
}
