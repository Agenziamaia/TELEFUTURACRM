import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { scaricaMedia } from "@/lib/evolution";
import { salvaMediaBase64 } from "@/lib/whatsappMedia";
import { contenutoMessaggio } from "@/lib/waContenuto";

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
    const { data } = await supabase.from("wa_instances").select("id, owner_user_id, status").eq("instance_name", instanceName).maybeSingle();
    return data;
}

// upsert conversazione (istanza + numero/gruppo). Aggancio cliente per numero
// solo per le chat 1-a-1: un gruppo non corrisponde a un singolo cliente.
async function upsertConversazione(instanceId: string, numero: string, nome: string | null, isGroup = false, chatJid: string | null = null) {
    // NOME VERO dall'anagrafica (Luca 31/07): se il numero corrisponde a un
    // cliente, la conversazione porta nome e cognome (o ragione sociale) — non
    // il nickname WhatsApp ne' il numero nudo. Il profilo WhatsApp resta il
    // ripiego quando il cliente non esiste in anagrafica.
    let clientId: string | null = null;
    let nomeAnagrafica: string | null = null;
    if (!isGroup) {
        const coda = codaNumero(numero);
        if (coda.length >= 6) {
            // coppia consumer+business stesso cellulare: si preferisce la
            // scheda persona (deterministico — rilievo del revisore 25/08)
            const { data: cli } = await supabase.from("clients").select("id, nome, cognome, ragione_sociale").ilike("cellulare", `%${coda}%`).order("tipo", { ascending: false }).limit(1);
            if (cli && cli[0]) {
                clientId = cli[0].id;
                nomeAnagrafica = (cli[0].ragione_sociale as string) || `${cli[0].nome || ""} ${cli[0].cognome || ""}`.trim() || null;
            }
        }
    }
    const soloNumero = (s: string | null | undefined) => !s || !String(s).trim() || /^[+\d\s]+$/.test(String(s).trim());
    const { data: existing } = await supabase.from("wa_conversations")
        .select("id, client_id, customer_name, chat_jid").eq("instance_id", instanceId).eq("customer_number", numero).maybeSingle();
    if (existing) {
        const patch: Record<string, unknown> = {};
        if (clientId && !existing.client_id) patch.client_id = clientId;
        // il nome anagrafica RIMPIAZZA un nome vuoto o fatto solo di cifre;
        // un nome scritto a mano (rinomina admin) non si tocca mai
        if (nomeAnagrafica && soloNumero(existing.customer_name)) patch.customer_name = nomeAnagrafica;
        else if (nome && !existing.customer_name) patch.customer_name = nome;
        if (chatJid && !existing.chat_jid) patch.chat_jid = chatJid;
        if (Object.keys(patch).length) await supabase.from("wa_conversations").update(patch).eq("id", existing.id);
        return existing.id as string;
    }
    const { data: created } = await supabase.from("wa_conversations")
        .insert({ instance_id: instanceId, customer_number: numero, customer_name: nomeAnagrafica || nome, client_id: clientId, is_group: isGroup, chat_jid: chatJid })
        .select("id").single();
    return created?.id as string;
}

// CHT-02: se il messaggio toccato (modifica/cancellazione) era l'ULTIMO della
// conversazione, l'anteprima in elenco va riallineata — altrimenti la lista
// chat mostrerebbe un testo che su WhatsApp non esiste piu'.
async function aggiornaAnteprimaSeUltimo(conversationId: string, messageId: string, anteprima: string) {
    const { data: ultimo } = await supabase.from("wa_messages")
        .select("id").eq("conversation_id", conversationId)
        .order("wa_timestamp", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
    if (ultimo?.id === messageId) {
        await supabase.from("wa_conversations").update({ last_preview: anteprima.slice(0, 120) }).eq("id", conversationId);
    }
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
            // ⚠️ NON OGNI «close» È UNA DISCONNESSIONE (Luca 27/08, numero di
            // Claudia: «appena dopo che inquadra il QR e fa la connessione, gli
            // salta tra il connesso e il non collegato»).
            //
            // Subito dopo l'accoppiamento WhatsApp CHIUDE il socket e lo
            // riapre: è la procedura normale (codice 515, «restart required»).
            // Scrivendo «disconnessa» a ogni close, il pannello faceva
            // avanti-indietro sotto gli occhi di chi stava collegando il
            // numero — e se l'ultimo «open» si perdeva per strada, restava
            // fermo su «qr» col numero vuoto, che è come l'abbiamo trovato.
            //
            // Quindi: solo un'USCITA VERA (sessione chiusa dal telefono o
            // credenziali rifiutate) declassa; il resto lo conferma il prossimo
            // «open», o il tasto Verifica del pannello, che chiede la verità a
            // Evolution.
            const codice = Number(
                data?.statusCode ?? data?.lastDisconnect?.error?.output?.statusCode
                ?? data?.lastDisconnect?.statusCode ?? 0);
            const motivo = String(data?.reason || data?.lastDisconnect?.error?.message || "");
            let nuovo: string | null = null;
            if (state === "open") {
                nuovo = "connessa";
            } else if (state === "close") {
                const uscitaVera = [401, 403, 440].includes(codice) || /logged.?out|unauthorized/i.test(motivo);
                nuovo = uscitaVera ? "disconnessa" : null;
            } else if (inst.status !== "connessa") {
                // «connecting» e «qr» non devono MAI declassare una connessa
                nuovo = "qr";
            }
            if (nuovo && nuovo !== inst.status) {
                await supabase.from("wa_instances").update({ status: nuovo }).eq("id", inst.id);
            }
            return NextResponse.json({ ok: true, event, state, codice, applicato: nuovo });
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
                // estrazione UNICA (waContenuto): svolge effimeri/view-once/
                // documento+didascalia e dà un'etichetta a contatti, posizioni,
                // sondaggi… Resta vuota SOLO la roba di servizio (reazioni,
                // protocolMessage, voti) → scartata: salvarla creava bolle
                // vuote, falsi «senza risposta» e non-letti fantasma (caso
                // Elvira, 14 righe in 9 chat trovate il 25/08)
                const { body, mime } = contenutoMessaggio(m?.message);
                if (!body && !mime) continue;
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
                    // un messaggio vero del cliente riapre una chat conclusa
                    patch.chiusa_il = null;
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

        // ── CHT-02: messaggio MODIFICATO (dal telefono o da altro dispositivo).
        //    Il testo nuovo puo' arrivare in forme diverse a seconda della build:
        //    si prova in ordine, e se non si trova si marca comunque edited_at. ──
        if (event.includes("messages.edited") && data) {
            const edits = Array.isArray(data) ? data : [data];
            for (const u of edits) {
                const id = u?.key?.id || u?.keyId || u?.id;
                if (!id) continue;
                const em = u?.message || u?.editedMessage || {};
                const nuovo = em?.conversation || em?.extendedTextMessage?.text
                    || em?.editedMessage?.conversation || em?.editedMessage?.extendedTextMessage?.text
                    || u?.text || null;
                const { data: riga } = await supabase.from("wa_messages")
                    .select("id, conversation_id, body, body_prev").eq("wa_message_id", id).maybeSingle();
                if (!riga) continue;
                const patch: Record<string, unknown> = { edited_at: new Date().toISOString() };
                if (nuovo) {
                    patch.body = nuovo;
                    // body_prev conserva la versione ORIGINALE (audit): non si sovrascrive
                    if (!riga.body_prev) patch.body_prev = riga.body;
                }
                await supabase.from("wa_messages").update(patch).eq("id", riga.id);
                if (nuovo) await aggiornaAnteprimaSeUltimo(riga.conversation_id, riga.id, nuovo);
            }
            return NextResponse.json({ ok: true, event });
        }

        // ── CHT-02: messaggio ELIMINATO PER TUTTI (dal telefono). La riga resta
        //    a DB con deleted_at: la UI mostra il segnaposto, mai il testo. ──
        if (event.includes("messages.delete") && data) {
            const dels = Array.isArray(data) ? data : [data];
            for (const u of dels) {
                const id = u?.key?.id || u?.keyId || u?.id;
                if (!id) continue;
                const { data: riga } = await supabase.from("wa_messages")
                    .select("id, conversation_id").eq("wa_message_id", id).maybeSingle();
                if (!riga) continue;
                await supabase.from("wa_messages").update({ deleted_at: new Date().toISOString() }).eq("id", riga.id);
                await aggiornaAnteprimaSeUltimo(riga.conversation_id, riga.id, "Messaggio eliminato");
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
