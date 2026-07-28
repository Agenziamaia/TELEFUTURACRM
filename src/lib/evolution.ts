// Client server-side per Evolution API (WhatsApp self-hosted). Gira SOLO sul
// server (route handler): l'URL e la chiave stanno nelle env del server e non
// finiscono mai nel browser. Evolution ascolta solo su localhost del VPS.

const BASE = process.env.EVOLUTION_API_URL || "http://127.0.0.1:8080";
const KEY = process.env.EVOLUTION_API_KEY || "";

function headers(): Record<string, string> {
    return { "Content-Type": "application/json", apikey: KEY };
}

async function call(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(BASE + path, {
        method,
        headers: headers(),
        body: body != null ? JSON.stringify(body) : undefined,
        // Evolution e' su localhost, nessuna cache
        cache: "no-store",
    });
    const txt = await res.text();
    let json: any = null;
    try { json = txt ? JSON.parse(txt) : null; } catch { json = { raw: txt }; }
    if (!res.ok) {
        const msg = json?.message || json?.error || txt || res.statusText;
        throw new Error(`Evolution ${method} ${path} -> ${res.status}: ${String(msg).slice(0, 300)}`);
    }
    return json;
}

/** URL del webhook del CRM che Evolution deve chiamare, col token segreto. */
export function webhookUrl(): string {
    const base = process.env.CRM_PUBLIC_URL || "https://crm.telefuturasrl.com";
    const t = process.env.WHATSAPP_WEBHOOK_TOKEN || "";
    return `${base}/api/whatsapp/webhook?t=${encodeURIComponent(t)}`;
}

/** Crea (o riusa) un'istanza e imposta il webhook sugli eventi che ci servono. */
export async function creaIstanza(instanceName: string): Promise<any> {
    const body = {
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        webhook: {
            url: webhookUrl(),
            byEvents: false,
            base64: true,
            events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED", "SEND_MESSAGE"],
        },
    };
    return call("POST", "/instance/create", body);
}

/** Stato/QR per collegare il numero (scan). Ritorna il base64 del QR se in attesa. */
export async function statoConnessione(instanceName: string): Promise<any> {
    return call("GET", `/instance/connect/${encodeURIComponent(instanceName)}`);
}

export async function statoIstanza(instanceName: string): Promise<any> {
    return call("GET", `/instance/connectionState/${encodeURIComponent(instanceName)}`);
}

export async function eliminaIstanza(instanceName: string): Promise<any> {
    return call("DELETE", `/instance/delete/${encodeURIComponent(instanceName)}`);
}

/** Disconnette (logout) la sessione WhatsApp SENZA eliminare l'istanza: le
 *  conversazioni restano e si puo' ricollegare riscansionando il QR. */
export async function logoutIstanza(instanceName: string): Promise<any> {
    return call("DELETE", `/instance/logout/${encodeURIComponent(instanceName)}`);
}

/** Elenca le chat note all'istanza. WhatsApp, al collegamento, invia una
 *  history-sync (chat/messaggi recenti) che Evolution conserva: qui la leggiamo
 *  per popolare le conversazioni gia' esistenti (i webhook portano solo i nuovi). */
export async function elencoChat(instanceName: string): Promise<any[]> {
    const res = await call("POST", `/chat/findChats/${encodeURIComponent(instanceName)}`, {});
    if (Array.isArray(res)) return res;
    return res?.chats || res?.records || [];
}

/** Messaggi di una chat (per lo storico quando si apre la conversazione). */
export async function elencoMessaggi(instanceName: string, remoteJid: string, limit = 50): Promise<any[]> {
    const res = await call("POST", `/chat/findMessages/${encodeURIComponent(instanceName)}`, {
        where: { key: { remoteJid } }, limit,
    });
    if (Array.isArray(res)) return res;
    return res?.messages?.records || res?.records || res?.messages || [];
}

/** Numero -> JID WhatsApp (numero@s.whatsapp.net). Solo cifre. */
export function toJid(numero: string): string {
    const digits = String(numero || "").replace(/\D/g, "");
    return `${digits}@s.whatsapp.net`;
}

/** Invia un messaggio di testo da una certa istanza. `destinatario` puo' essere
 *  un numero (solo cifre -> chat singola) oppure un JID completo, tipo un gruppo
 *  <id>@g.us: in quel caso NON si tolgono i caratteri, si passa il JID tale quale. */
export async function inviaTesto(instanceName: string, destinatario: string, testo: string): Promise<any> {
    const d = String(destinatario || "");
    const number = d.includes("@") ? d : d.replace(/\D/g, "");
    return call("POST", `/message/sendText/${encodeURIComponent(instanceName)}`, {
        number,
        text: testo,
    });
}

/** Scarica e DECIFRA il media di un messaggio (Baileys). Richiede l'oggetto
 *  messaggio COMPLETO (le chiavi di decifratura stanno nel body). Funziona solo
 *  finche' WhatsApp conserva il file cifrato sul suo CDN: per i media vecchi il
 *  fetch fallisce (URL .enc scaduto) e qui si propaga l'errore (best-effort). */
export async function scaricaMedia(instanceName: string, message: any): Promise<{ base64: string; mimetype?: string; fileName?: string }> {
    const res = await call("POST", `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
        message, convertToMp4: false,
    });
    return { base64: res?.base64 || "", mimetype: res?.mimetype, fileName: res?.fileName };
}

/** mimetype -> tipo media per Evolution sendMedia. */
export function tipoMedia(mime: string | null | undefined): "image" | "video" | "audio" | "document" {
    const m = String(mime || "").toLowerCase();
    if (m.startsWith("image/")) return "image";
    if (m.startsWith("video/")) return "video";
    if (m.startsWith("audio/")) return "audio";
    return "document";
}

/** Invia un allegato. `media` puo' essere un URL pubblico (Evolution lo scarica)
 *  o base64. `destinatario` come in inviaTesto (numero o JID gruppo). */
export async function inviaMedia(instanceName: string, destinatario: string, opts: { media: string; mimetype?: string; fileName?: string; caption?: string }): Promise<any> {
    const d = String(destinatario || "");
    const number = d.includes("@") ? d : d.replace(/\D/g, "");
    const mediatype = tipoMedia(opts.mimetype);
    return call("POST", `/message/sendMedia/${encodeURIComponent(instanceName)}`, {
        number, mediatype,
        mimetype: opts.mimetype || undefined,
        caption: opts.caption || undefined,
        media: opts.media,
        fileName: opts.fileName || "file",
    });
}
