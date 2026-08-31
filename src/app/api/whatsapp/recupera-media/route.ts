import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { eUnLavoroAutomatico } from "@/lib/cronParola";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { elencoMessaggi, scaricaMedia } from "@/lib/evolution";
import { contenutoMessaggio } from "@/lib/waContenuto";
import { salvaMediaBase64 } from "@/lib/whatsappMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ RIPRENDERSI LE FOTO PERSE ═══════════════════════════════════════════
   Dal 28 al 31 agosto ogni media ricevuto su WhatsApp è finito nel database
   SENZA il suo file: il modulo che li salva usava la chiave del browser e,
   dopo la blindatura, ogni caricamento falliva in silenzio. Sono 236 fra
   foto, vocali e PDF — quelli che nella chat il negozio vede come
   «[Immagine]» e «[Documento] contratto.pdf».
   Riparato il flusso, il contenuto non è perduto: WhatsApp lo tiene ancora, e
   il CRM sa già ripescarlo — è quello che fa aprendo una chat. Qui si fa la
   stessa cosa per tutte insieme, invece di chiedere a qualcuno di aprire
   ottanta conversazioni a mano.

   ⚠️ È BEST-EFFORT, e non è un difetto: i media di WhatsApp scadono sul loro
   CDN dopo qualche giorno. Quello che si recupera si recupera; il resto resta
   com'è, e il messaggio conserva comunque il suo testo e la sua ora.

   Si chiama con la parola dei lavori automatici, o da un amministratore.
   POST { max?: numero di conversazioni per giro (default 15) } */

const TETTO_MS = 55000;      // sotto il tempo massimo di una richiesta
const MEDIA_PER_CHAT = 30;

export async function POST(request: Request) {
    if (!(await eUnLavoroAutomatico(request))) {
        const g = await accesso(request, "whatsapp/recupera-media");
        if (!g.ok) return g.risposta;
        const { data: u } = await supabase.from("app_users").select("role").eq("id", g.sess.id).maybeSingle();
        if (!["admin", "dev"].includes(String(u?.role || ""))) {
            return NextResponse.json({ error: "Solo un amministratore può lanciare il recupero." }, { status: 403 });
        }
    }

    const b = await request.json().catch(() => ({} as { max?: number }));
    const maxChat = Math.min(60, Math.max(1, Number(b?.max) || 15));
    const scadenza = Date.now() + TETTO_MS;

    /* le conversazioni che hanno almeno un media senza file, le più recenti
       per prime: sono quelle che qualcuno sta ancora guardando */
    const { data: buchi } = await supabase.from("wa_messages")
        .select("conversation_id, created_at")
        .is("media_url", null).not("media_mime", "is", null)
        .order("created_at", { ascending: false }).limit(500);

    const conv: string[] = [];
    for (const r of buchi || []) {
        const id = String(r.conversation_id);
        if (!conv.includes(id)) conv.push(id);
        if (conv.length >= maxChat) break;
    }
    if (!conv.length) return NextResponse.json({ ok: true, nota: "niente da recuperare" });

    const esiti: { conv: string; recuperati: number; scaduti: number }[] = [];
    for (const convId of conv) {
        if (Date.now() >= scadenza) break;
        try {
            const { data: c } = await supabase.from("wa_conversations")
                .select("id, chat_jid, customer_number, is_group, instance_id").eq("id", convId).maybeSingle();
            if (!c) continue;
            const { data: inst } = await supabase.from("wa_instances")
                .select("instance_name").eq("id", c.instance_id).maybeSingle();
            if (!inst?.instance_name) continue;

            const jid = c.chat_jid || (c.is_group ? `${c.customer_number}@g.us` : `${c.customer_number}@s.whatsapp.net`);
            const recs = await elencoMessaggi(inst.instance_name, jid, 50);

            // solo i messaggi che nel CRM sono senza file
            const { data: senza } = await supabase.from("wa_messages")
                .select("wa_message_id").eq("conversation_id", convId)
                .is("media_url", null).not("media_mime", "is", null);
            const daFare = new Set((senza || []).map((r) => String(r.wa_message_id)));
            if (!daFare.size) continue;

            let presi = 0, scaduti = 0, fatti = 0;
            for (const m of recs) {
                if (Date.now() >= scadenza || fatti >= MEDIA_PER_CHAT) break;
                const key = m?.key || {};
                if (!key.id || !daFare.has(String(key.id))) continue;
                const { mime } = contenutoMessaggio(m?.message);
                if (!mime) continue;
                fatti++;
                try {
                    const md = await scaricaMedia(inst.instance_name, m);
                    const url = md.base64 ? await salvaMediaBase64(md.base64, md.mimetype || mime, convId, key.id) : null;
                    if (url) {
                        await supabase.from("wa_messages").update({ media_url: url }).eq("wa_message_id", key.id);
                        presi++;
                    } else scaduti++;
                } catch { scaduti++; }
            }
            if (presi || scaduti) esiti.push({ conv: convId, recuperati: presi, scaduti });
        } catch { /* una conversazione che non risponde non ferma le altre */ }
    }

    const tot = esiti.reduce((s, e) => s + e.recuperati, 0);
    const persi = esiti.reduce((s, e) => s + e.scaduti, 0);
    const { count } = await supabase.from("wa_messages")
        .select("id", { count: "exact", head: true })
        .is("media_url", null).not("media_mime", "is", null);
    return NextResponse.json({ ok: true, chat: esiti.length, recuperati: tot, scaduti: persi, restano: count ?? null });
}
