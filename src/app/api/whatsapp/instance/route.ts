import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { creaIstanza, statoConnessione, statoIstanza, eliminaIstanza, logoutIstanza, elencoChat, elencoMessaggi, scaricaMedia } from "@/lib/evolution";
import { salvaMediaBase64 } from "@/lib/whatsappMedia";

export const dynamic = "force-dynamic";

// ultime N cifre, per agganciare la conversazione al cliente per numero
function codaNumero(s: string | null | undefined, n = 9): string {
    const d = String(s || "").replace(/\D/g, "");
    return d.length >= n ? d.slice(-n) : d;
}
// testo leggibile dal messaggio Baileys (o placeholder per gli allegati)
function estraiCorpo(msg: any): string {
    if (!msg) return "";
    return msg.conversation || msg.extendedTextMessage?.text
        || msg.imageMessage?.caption || msg.videoMessage?.caption
        || (msg.imageMessage ? "[Immagine]" : msg.documentMessage ? "[Documento]" : msg.audioMessage ? "[Audio]" : msg.videoMessage ? "[Video]" : msg.stickerMessage ? "[Sticker]" : "") || "";
}
// nome del contatto: mai il "se stesso". Quando l'ultimo messaggio e' in uscita,
// il pushName e' il MIO nome (Evolution lo mette "Voce'"/"You"): da ignorare.
function nomeContatto(ch: any): string | null {
    const lmFromMe = !!ch?.lastMessage?.key?.fromMe;
    let n = ch?.pushName || (lmFromMe ? null : ch?.lastMessage?.pushName) || null;
    if (n && /^(voc[eê]|you|tu|io|me)$/i.test(String(n).trim())) n = null;
    return n;
}
// identita' della chat: id (numero o id gruppo), se e' un gruppo, e il JID
// completo per l'invio. Gestisce @s.whatsapp.net, i gruppi @g.us e la nuova
// modalita' @lid (dove il vero numero e' in lastMessage.key.remoteJidAlt).
function datiChat(ch: any): { numero: string; isGroup: boolean; chatJid: string } | null {
    const jid = String(ch?.remoteJid || ch?.id || "");
    if (!jid) return null;
    if (jid.endsWith("@g.us")) {
        const id = jid.split("@")[0].replace(/\D/g, "");
        return id ? { numero: id, isGroup: true, chatJid: jid } : null;
    }
    if (jid.endsWith("@s.whatsapp.net")) {
        const n = jid.split("@")[0].replace(/\D/g, "");
        return n.length >= 6 ? { numero: n, isGroup: false, chatJid: `${n}@s.whatsapp.net` } : null;
    }
    if (jid.endsWith("@lid")) {
        const alt = String(ch?.lastMessage?.key?.remoteJidAlt || "");
        if (alt.endsWith("@s.whatsapp.net")) {
            const n = alt.split("@")[0].replace(/\D/g, "");
            return n.length >= 6 ? { numero: n, isGroup: false, chatJid: `${n}@s.whatsapp.net` } : null;
        }
    }
    return null;
}

// Gestione istanze WhatsApp (un numero = un'istanza). Amministrazione:
//  POST   { action:"create", displayName, ownerUserId }  -> crea + registra
//  POST   { action:"qr", instanceName }                  -> QR/stato per collegare
//  POST   { action:"state", instanceName }               -> stato connessione
//  POST   { action:"delete", instanceName }              -> elimina

export async function GET() {
    // elenco istanze registrate nel CRM (per il pannello admin)
    const { data } = await supabase.from("wa_instances")
        .select("id, instance_name, display_name, owner_user_id, wa_number, status, created_at")
        .order("created_at", { ascending: false });
    return NextResponse.json({ instances: data ?? [] });
}

export async function POST(request: Request) {
    try {
        const b = await request.json();
        const action = b?.action;

        if (action === "create") {
            const display = String(b.displayName || "").trim() || "WhatsApp";
            // nome istanza tecnico: solo lettere/numeri, univoco
            const slug = display.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "wa";
            const instanceName = `tf-${slug}-${Math.random().toString(36).slice(2, 6)}`;
            // negozio del proprietario (per la visibilita' dello store manager)
            let negozio: string | null = null;
            if (b.ownerUserId) {
                const { data: ow } = await supabase.from("app_users").select("primary_store").eq("id", b.ownerUserId).maybeSingle();
                negozio = ow?.primary_store || null;
            }
            const res = await creaIstanza(instanceName);
            await supabase.from("wa_instances").insert({
                instance_name: instanceName, display_name: display,
                owner_user_id: b.ownerUserId || null, status: "qr", negozio,
            });
            const qr = res?.qrcode?.base64 || res?.qrcode?.code || null;
            return NextResponse.json({ ok: true, instanceName, qr });
        }

        if (action === "qr") {
            const res = await statoConnessione(b.instanceName);
            const qr = res?.base64 || res?.qrcode?.base64 || res?.code || null;
            return NextResponse.json({ ok: true, qr, raw: res });
        }

        if (action === "state") {
            const res = await statoIstanza(b.instanceName);
            const state = res?.instance?.state || res?.state || null;
            if (state === "open") {
                await supabase.from("wa_instances").update({ status: "connessa" }).eq("instance_name", b.instanceName);
            }
            return NextResponse.json({ ok: true, state });
        }

        if (action === "sync") {
            // importa le conversazioni gia' esistenti (history-sync di WhatsApp)
            const instanceName = b.instanceName;
            const { data: inst } = await supabase.from("wa_instances").select("id").eq("instance_name", instanceName).maybeSingle();
            if (!inst) return NextResponse.json({ error: "istanza non trovata" }, { status: 404 });
            const chats = await elencoChat(instanceName);
            let importate = 0, saltate = 0;
            for (const ch of chats) {
                const d = datiChat(ch);
                if (!d) { saltate++; continue; }
                const { numero, isGroup, chatJid } = d;
                const nome = nomeContatto(ch);   // per i gruppi = oggetto/nome del gruppo
                // aggancio cliente solo per le chat 1-a-1 (un gruppo non e' un cliente)
                let clientId: string | null = null;
                if (!isGroup) {
                    const coda = codaNumero(numero);
                    if (coda.length >= 6) {
                        const { data: cli } = await supabase.from("clients").select("id").ilike("cellulare", `%${coda}%`).limit(1);
                        if (cli && cli[0]) clientId = cli[0].id;
                    }
                }
                const lm = ch?.lastMessage;
                const body = estraiCorpo(lm?.message);
                const tsSec = Number(lm?.messageTimestamp);
                const ts = (!Number.isNaN(tsSec) && tsSec > 1e9) ? new Date(tsSec * 1000).toISOString() : (ch?.updatedAt || null);
                // upsert conversazione
                const { data: existing } = await supabase.from("wa_conversations")
                    .select("id").eq("instance_id", inst.id).eq("customer_number", numero).maybeSingle();
                let convId: string | undefined;
                const patch: Record<string, unknown> = {
                    last_preview: (body || "").slice(0, 120) || null, last_message_at: ts,
                    is_group: isGroup, chat_jid: chatJid,
                };
                if (nome) patch.customer_name = nome;
                if (clientId) patch.client_id = clientId;
                if (existing) {
                    convId = existing.id;
                    await supabase.from("wa_conversations").update(patch).eq("id", convId);
                } else {
                    const { data: created } = await supabase.from("wa_conversations")
                        .insert({ instance_id: inst.id, customer_number: numero, ...patch }).select("id").single();
                    convId = created?.id;
                }
                // seed dell'ultimo messaggio, cosi' il thread non e' vuoto.
                // In un gruppo il mittente dell'ultimo messaggio e' lm.pushName.
                if (convId && lm?.key?.id && body) {
                    await supabase.from("wa_messages").upsert({
                        conversation_id: convId, wa_message_id: lm.key.id,
                        direction: lm.key.fromMe ? "out" : "in", body,
                        status: lm.key.fromMe ? "sent" : null,
                        sender_name: lm.key.fromMe ? null : (lm?.pushName || null),
                        wa_timestamp: ts,
                    }, { onConflict: "wa_message_id" });
                }
                importate++;
            }
            return NextResponse.json({ ok: true, importate, saltate, totale: chats.length });
        }

        if (action === "history") {
            // backfill dello storico recente di UNA conversazione (all'apertura).
            // Evolution restituisce una pagina di ~50 messaggi piu' recenti: e'
            // gia' la "giornata o poco piu'" che serve, non tutto lo storico.
            const instanceName = b.instanceName;
            const conversationId = b.conversationId;
            if (!conversationId) return NextResponse.json({ error: "conversationId obbligatorio" }, { status: 400 });
            const { data: conv } = await supabase.from("wa_conversations")
                .select("id, chat_jid, customer_number, is_group").eq("id", conversationId).maybeSingle();
            if (!conv) return NextResponse.json({ error: "conversazione non trovata" }, { status: 404 });
            const jid = conv.chat_jid || (conv.is_group ? `${conv.customer_number}@g.us` : `${conv.customer_number}@s.whatsapp.net`);
            const recs = await elencoMessaggi(instanceName, jid, 50);
            // messaggi gia' presenti: NON ri-scriverli (eviterei di sovrascrivere lo
            // stato di lettura degli inviati) e non ri-scaricare i media gia' salvati.
            const { data: esistenti } = await supabase.from("wa_messages").select("wa_message_id, media_url").eq("conversation_id", conversationId);
            const idSet = new Set((esistenti ?? []).map((r: any) => r.wa_message_id));
            const mediaSet = new Set((esistenti ?? []).filter((r: any) => r.media_url).map((r: any) => r.wa_message_id));
            const nuovi: Record<string, unknown>[] = [];
            const mediaUpdate: { id: string; url: string }[] = [];
            let mediaScaricati = 0;
            const MAX_MEDIA = 20;   // best-effort: i piu' recenti (recs e' dal piu' nuovo)
            for (const m of recs) {
                const key = m?.key || {};
                if (!key.id) continue;
                const msg = m?.message || {};
                const body = estraiCorpo(msg);
                const mime = msg.imageMessage?.mimetype || msg.documentMessage?.mimetype || msg.audioMessage?.mimetype || msg.videoMessage?.mimetype || null;
                if (!body && !mime) continue;   // salta reazioni / protocolMessage senza contenuto
                const tsSec = Number(m?.messageTimestamp);
                const ts = (!Number.isNaN(tsSec) && tsSec > 1e9) ? new Date(tsSec * 1000).toISOString() : null;
                // scarica e decifra il media (best-effort: i vecchi falliscono, restano placeholder)
                let mediaUrl: string | null = null;
                if (mime && !mediaSet.has(key.id) && mediaScaricati < MAX_MEDIA) {
                    mediaScaricati++;
                    try {
                        const md = await scaricaMedia(instanceName, m);
                        if (md.base64) mediaUrl = await salvaMediaBase64(md.base64, md.mimetype || mime, conversationId, key.id);
                    } catch { /* media scaduto sul CDN di WhatsApp */ }
                }
                if (!idSet.has(key.id)) {
                    nuovi.push({
                        conversation_id: conversationId, wa_message_id: key.id,
                        direction: key.fromMe ? "out" : "in", body: body || null, media_mime: mime, media_url: mediaUrl,
                        status: key.fromMe ? "sent" : null,
                        sender_name: key.fromMe ? null : (m?.pushName || null),
                        wa_timestamp: ts,
                    });
                } else if (mediaUrl) {
                    mediaUpdate.push({ id: key.id, url: mediaUrl });   // gia' presente, ma ora ho il media
                }
            }
            if (nuovi.length) await supabase.from("wa_messages").insert(nuovi);
            for (const u of mediaUpdate) await supabase.from("wa_messages").update({ media_url: u.url }).eq("wa_message_id", u.id);
            return NextResponse.json({ ok: true, importati: nuovi.length, media: mediaScaricati });
        }

        if (action === "logout") {
            // disconnessione volontaria: chiude la sessione WhatsApp ma tiene
            // l'istanza e le conversazioni. Si ricollega riscansionando il QR.
            try { await logoutIstanza(b.instanceName); } catch { /* forse gia' disconnessa */ }
            await supabase.from("wa_instances").update({ status: "disconnessa" }).eq("instance_name", b.instanceName);
            return NextResponse.json({ ok: true });
        }

        if (action === "delete") {
            try { await eliminaIstanza(b.instanceName); } catch { /* forse gia' via */ }
            await supabase.from("wa_instances").delete().eq("instance_name", b.instanceName);
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: "action non valida" }, { status: 400 });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
