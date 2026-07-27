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

/** Numero -> JID WhatsApp (numero@s.whatsapp.net). Solo cifre. */
export function toJid(numero: string): string {
    const digits = String(numero || "").replace(/\D/g, "");
    return `${digits}@s.whatsapp.net`;
}

/** Invia un messaggio di testo da una certa istanza. */
export async function inviaTesto(instanceName: string, numero: string, testo: string): Promise<any> {
    return call("POST", `/message/sendText/${encodeURIComponent(instanceName)}`, {
        number: String(numero || "").replace(/\D/g, ""),
        text: testo,
    });
}
