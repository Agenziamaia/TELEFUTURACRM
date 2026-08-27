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

/** Eventi webhook che il CRM vuole ricevere. UNICA lista: la usano sia la
 *  creazione istanza sia il refresh sulle istanze esistenti (aggiornaWebhook),
 *  cosi' non possono divergere. MESSAGES_EDITED/MESSAGES_DELETE portano al CRM
 *  le modifiche/cancellazioni fatte anche dal telefono (CHT-02). */
export const WEBHOOK_EVENTS = [
    "MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_EDITED", "MESSAGES_DELETE",
    "CONNECTION_UPDATE", "QRCODE_UPDATED", "SEND_MESSAGE",
];

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
            events: WEBHOOK_EVENTS,
        },
    };
    return call("POST", "/instance/create", body);
}

/** Riallinea la config webhook di un'istanza ESISTENTE alla lista eventi
 *  corrente. Serve perche' Evolution scrive la config solo alla creazione:
 *  senza questo refresh le istanze gia' collegate non ricevono mai gli eventi
 *  aggiunti dopo (es. MESSAGES_EDITED/MESSAGES_DELETE). */
export async function aggiornaWebhook(instanceName: string): Promise<any> {
    return call("POST", `/webhook/set/${encodeURIComponent(instanceName)}`, {
        webhook: { enabled: true, url: webhookUrl(), byEvents: false, base64: true, events: WEBHOOK_EVENTS },
    });
}

/** Stato/QR per collegare il numero (scan). Ritorna il base64 del QR se in attesa. */
export async function statoConnessione(instanceName: string): Promise<any> {
    return call("GET", `/instance/connect/${encodeURIComponent(instanceName)}`);
}

export async function statoIstanza(instanceName: string): Promise<any> {
    return call("GET", `/instance/connectionState/${encodeURIComponent(instanceName)}`);
}

/** Tutte le istanze note a Evolution — serve per rilevare il NUMERO vero
 *  (ownerJid) dei collegamenti: nessuno lo aveva mai scritto in wa_number
 *  (Luca 25/08 notte: «i numeri non sono visibili, c'è scritto in arrivo»). */
export async function elencoIstanze(): Promise<any[]> {
    const res = await call("GET", "/instance/fetchInstances");
    if (Array.isArray(res)) return res;
    return res?.instances || res?.records || [];
}

/** Numero (sole cifre) da un record istanza di Evolution, tollerante alle
 *  versioni: ownerJid "39333…@s.whatsapp.net" o campi equivalenti. */
export function numeroDaIstanza(rec: any): string | null {
    const i = rec?.instance || rec;
    const raw = i?.ownerJid || i?.owner || i?.wid || i?.number || null;
    if (!raw) return null;
    const dig = String(raw).split("@")[0].replace(/\D/g, "");
    return dig.length >= 6 ? dig : null;
}

/** Nome col quale l'istanza è registrata su Evolution (varia per versione). */
export function nomeDaIstanza(rec: any): string | null {
    const i = rec?.instance || rec;
    return i?.instanceName || i?.name || null;
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

/** LA RUBRICA DEL NUMERO COLLEGATO (Luca 27/08). Non serve nessun QR nuovo:
 *  WhatsApp tiene sincronizzata la rubrica del telefono dentro la sessione,
 *  e qui la si chiede al ponte. Torna i contatti salvati (nome in rubrica) e
 *  quelli visti (pushName): chi ha un nome vero viene prima. */
export async function elencoContatti(instanceName: string): Promise<any[]> {
    const res = await call("POST", `/chat/findContacts/${encodeURIComponent(instanceName)}`, {});
    if (Array.isArray(res)) return res;
    return res?.contacts || res?.records || [];
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

/** Modifica il testo di un messaggio GIA' inviato (CHT-02). Vincoli WhatsApp:
 *  solo messaggi PROPRI di testo, entro ~15 minuti — le guardie stanno nella
 *  route /api/whatsapp/message, qui solo la chiamata. Contratto doc Evolution v2
 *  (rotta presente sulla 2.3.7 del VPS, verificata a probe). */
export async function modificaTesto(instanceName: string, remoteJid: string, waMessageId: string, testo: string): Promise<any> {
    return call("POST", `/chat/updateMessage/${encodeURIComponent(instanceName)}`, {
        number: remoteJid,
        text: testo,
        key: { remoteJid, fromMe: true, id: waMessageId },
    });
}

/** "Elimina per tutti" un messaggio inviato (CHT-02). Finestra WhatsApp ~2,5
 *  giorni; sui messaggi vecchi l'esito e' best-effort, come sull'app. */
export async function cancellaMessaggio(instanceName: string, remoteJid: string, waMessageId: string): Promise<any> {
    return call("DELETE", `/chat/deleteMessageForEveryone/${encodeURIComponent(instanceName)}`, {
        id: waMessageId, remoteJid, fromMe: true,
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
