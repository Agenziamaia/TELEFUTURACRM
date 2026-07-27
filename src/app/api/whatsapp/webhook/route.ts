import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { scaricaMedia } from "@/lib/evolution";
import { salvaMediaBase64 } from "@/lib/whatsappMedia";

export const dynamic = "force-dynamic";

// Riceve gli eventi da Evolution API (WhatsApp) e li registra nel modello wa_*,
// collegando il thread al cliente per numero. Sicurezza: l'URL che Evolution
// chiama porta ?t=<WHATSAPP_WEBHOOK_TOKEN>.

function codaNumero(s: string | null | undefined, n = 9): string {
    const d = String(s || "").replace(/\D/g, "");
    return d.length >= n ? d.slice(-n) : d;
}
// identita' della conversazione a partire dalla key del messaggio Baileys:
// gruppo (@g.us), chat singola (@s.whatsapp.net) o modalita' @lid (numero reale
// in remoteJidAlt). Ritorna anche il JID completo per poter poi rispondere.
function datiDaKey(key: any): { numero: string; isGroup: boolean; chatJid: string } | null {
    const jid = String(key?.remoteJid || "");
    if (!jid) return null;
    if (jid.endsWith("@g.us")) {
        const id = jid.split("@")[0].replace(/\D/g, "");
        return id ? { numero: id, isGroup: true, chatJid: jid } : null;
    }
    if (jid.endsWith("@lid")) {
        const alt = String(key?.remoteJidAlt || "");
        if (alt.endsWith("@s.whatsapp.net")) {
            const n = alt.split("@")[0].replace(/\D/g, "");
            return n ? { numero: n, isGroup: false, chatJid: `${n}@s.whatsapp.net` } : null;
        }
        const n = jid.split("@")[0].replace(/\D/g, "");
        return n ? { numero: n, isGroup: false, chatJid: jid } : null;
    }
    const n = jid.split("@")[0].replace(/\D/g, "");
    return n ? { numero: n, isGroup: false, chatJid: `${n}@s.whatsapp.net` } : null;
}
function toIsoMs(v: unknown): string | null {
    if (v == null) return null;
    const n = Number(v);
    // Evolution manda messageTimestamp in secondi
    if (!Number.isNaN(n) && n > 1e9 && n < 1e11) return new Date(n * 1000).toISOString();
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d.toISOString();
}

async function trovaIstanza(instanceName: string) {
    const { data } = await supabase.from("wa_instances").select("id, owner_user_id").eq("instance_name", instanceName).maybeSingle();
    return data;
}

// upsert conversazione (istanza + numero/gruppo). Aggancio cliente per numero
// solo per le chat 1-a-1: un gruppo non corrisponde a un singolo cliente.
async function upsertConversazione(instanceId: string, numero: string, nome: string | null, isGroup = false, chatJid: string | null = null) {
    let clientId: string | null = null;
    if (!isGroup) {
        const coda = codaNumero(numero);
        if (coda.length >= 6) {
            const { data: cli } = await supabase.from("clients").select("id").ilike("cellulare", `%${coda}%`).limit(1);
            if (cli && cli[0]) clientId = cli[0].id;
        }
    }
    const { data: existing } = await supabase.from("wa_conversations")
        .select("id, client_id, customer_name, chat_jid").eq("instance_id", instanceId).eq("customer_number", numero).maybeSingle();
    if (existing) {
        const patch: Record<string, unknown> = {};
        if (clientId && !existing.client_id) patch.client_id = clientId;
        if (nome && !existing.customer_name) patch.customer_name = nome;
        if (chatJid && !existing.chat_jid) patch.chat_jid = chatJid;
        if (Object.keys(patch).length) await supabase.from("wa_conversations").update(patch).eq("id", existing.id);
        return existing.id as string;
    }
    const { data: created } = await supabase.from("wa_conversations")
        .insert({ instance_id: instanceId, customer_number: numero, customer_name: nome, client_id: clientId, is_group: isGroup, chat_jid: chatJid })
        .select("id").single();
    return created?.id as string;
}

export async function POST(request: Request) {
    try {
        const url = new URL(request.url);
        const expected = process.env.WHATSAPP_WEBHOOK_TOKEN || "";
        if (!expected || url.searchParams.get("t") !== expected) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }
        const payload = await request.json();
        // Evolution manda { event, instance, data, ... }
        const event: string = String(payload?.event || "").toLowerCase();
        const instanceName: string = payload?.instance || payload?.instanceName || "";
        const data = payload?.data;
        const inst = instanceName ? await trovaIstanza(instanceName) : null;

        // ── aggiornamento stato connessione / QR ──
        if (event.includes("connection.update") && inst) {
            const state = data?.state || data?.connection || null;
            const nuovo = state === "open" ? "connessa" : state === "close" ? "disconnessa" : "qr";
            await supabase.from("wa_instances").update({ status: nuovo }).eq("id", inst.id);
            return NextResponse.json({ ok: true, event, state });
        }

        // ── nuovo messaggio ──
        if (event.includes("messages.upsert") && inst && data) {
            const messages = Array.isArray(data) ? data : [data];
            for (const m of messages) {
                const key = m?.key || {};
                const ident = datiDaKey(key);
                if (!ident) continue;
                const { numero, isGroup, chatJid } = ident;
                const fromMe = !!key.fromMe;
                // in un gruppo il pushName e' il MITTENTE, non il nome del gruppo:
                // non usarlo come titolo della conversazione (lo mette la sync).
                const convNome = isGroup ? null : (m?.pushName || null);
                const convId = await upsertConversazione(inst.id, numero, convNome, isGroup, chatJid);
                const msg = m?.message || {};
                const body = msg.conversation || msg.extendedTextMessage?.text
                    || msg.imageMessage?.caption || msg.videoMessage?.caption
                    || (msg.imageMessage ? "[Immagine]" : msg.documentMessage ? "[Documento]" : msg.audioMessage ? "[Audio]" : msg.videoMessage ? "[Video]" : "") || "";
                const mime = msg.imageMessage?.mimetype || msg.documentMessage?.mimetype || msg.audioMessage?.mimetype || msg.videoMessage?.mimetype || null;
                const ts = toIsoMs(m?.messageTimestamp);
                // media in ARRIVO (o inviato da un altro dispositivo): scaricalo e
                // salvalo subito, ora che il file cifrato e' ancora sul CDN.
                let mediaUrl: string | null = null;
                if (mime && instanceName && key.id) {
                    try {
                        const md = await scaricaMedia(instanceName, m);
                        if (md.base64) mediaUrl = await salvaMediaBase64(md.base64, md.mimetype || mime, convId, key.id);
                    } catch { /* non scaricabile */ }
                }
                await supabase.from("wa_messages").upsert({
                    conversation_id: convId,
                    wa_message_id: key.id || null,
                    direction: fromMe ? "out" : "in",
                    body, media_mime: mime, media_url: mediaUrl,
                    status: fromMe ? "sent" : null,
                    sender_name: fromMe ? null : (m?.pushName || null),
                    wa_timestamp: ts,
                }, { onConflict: "wa_message_id" });
                // aggiorna anteprima / non letti sulla conversazione
                const patch: Record<string, unknown> = { last_message_at: ts || new Date().toISOString(), last_preview: (body || "").slice(0, 120) };
                if (!fromMe) {
                    const { data: conv } = await supabase.from("wa_conversations").select("unread").eq("id", convId).maybeSingle();
                    patch.unread = (conv?.unread || 0) + 1;
                }
                await supabase.from("wa_conversations").update(patch).eq("id", convId);
            }
            return NextResponse.json({ ok: true, event, n: messages.length });
        }

        // ── aggiornamento stato consegna (delivered/read) ──
        if (event.includes("messages.update") && data) {
            const updates = Array.isArray(data) ? data : [data];
            for (const u of updates) {
                const id = u?.key?.id || u?.keyId;
                const st = u?.update?.status || u?.status;
                if (!id) continue;
                const map: Record<string, string> = { "2": "sent", "3": "delivered", "4": "read", DELIVERY_ACK: "delivered", READ: "read", PLAYED: "read" };
                const nuovo = map[String(st)] || null;
                if (nuovo) await supabase.from("wa_messages").update({ status: nuovo }).eq("wa_message_id", id);
            }
            return NextResponse.json({ ok: true, event });
        }

        return NextResponse.json({ ok: true, ignored: event });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ ok: true, service: "whatsapp-webhook" });
}
