import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { inviaTesto } from "@/lib/evolution";
import { scegliMittente } from "@/lib/waMittente";
import { trovaOCreaConversazione } from "@/lib/waConversazioni";

export const dynamic = "force-dynamic";

/**
 * NOTIFICA WhatsApp AUTOMATICA verso un NUMERO (Luca 29/07) — per le
 * automazioni del CRM (primo uso: bonifico ISTANTANEO dell'usato).
 * A differenza di /send (che vuole una conversazione già aperta), qui si
 * passa { number, text }: la route sceglie un'istanza CONNESSA, trova o
 * crea la conversazione per quel numero e invia, registrando il messaggio
 * nello storico come ogni altro. Best-effort: gli errori tornano al
 * chiamante senza far fallire il flusso che l'ha invocata.
 */
export async function POST(request: Request) {
    // 🔒 BLINDATURA fase A (28/08): senza sessione firmata non si passa
    // 🔒 sessione firmata + permesso della sezione, come nel pannello
    const _g = await accesso(request, "whatsapp/notify");
    if (!_g.ok) return _g.risposta;
    const _s = _g.sess;

    try {
        const { number, text, negozio } = await request.json();
        const dig = String(number || "").replace(/\D/g, "");
        const testo = String(text || "").trim();
        if (dig.length < 6 || !testo) {
            return NextResponse.json({ error: "number e text obbligatori" }, { status: 400 });
        }
        // ── DA QUALE NUMERO ESCE (Luca 27/08) ─────────────────────────────
        // Prima si prendeva «una connessa qualsiasi, la più recente»: il
        // messaggio poteva partire dal numero personale di un collega o da
        // quello di un negozio, a caso, e nessuno sapeva quale. Ora c'è un
        // MITTENTE DESIGNATO, scelto dal pannello WhatsApp; la scelta a caso
        // resta solo come rete di sicurezza, e viene detta nella risposta.
        const { data: insts } = await supabase.from("wa_instances")
            .select("id, instance_name, status, mittente_notifiche, display_name, negozio, owner_user_id")
            .order("created_at", { ascending: false });
        /* ⚠️ IL RIPIEGO NON C'È PIÙ, ed è il punto (Luca 05/09). Prima, se il
           numero designato era caduto, si prendeva «una connessa qualsiasi, la
           più recente» — che oggi sarebbe il cellulare personale di un
           collega. Il cliente riceveva da un numero sconosciuto, rispondeva
           là, e chi aveva fatto il lavoro non vedeva più niente.
           Adesso: col negozio si esce dal numero DI QUEL NEGOZIO o non si esce
           affatto. Senza negozio (avvisi interni, allarmi cassa) vale il
           designato, e se è caduto si dice. */
        const scelta = scegliMittente((insts ?? []) as never[], negozio);
        if ("errore" in scelta) return NextResponse.json({ error: scelta.errore }, { status: 400 });
        const inst = scelta.inst;
        const ripiegato = false;

        // trova o crea la conversazione per il numero — helper CONDIVISO con
        // send-template: un'unica euristica coda-cifre, mai piu' copie divergenti
        const { conv, error: convErr } = await trovaOCreaConversazione(inst.id, dig);
        if (convErr || !conv) return NextResponse.json({ error: "conversazione non creata: " + (convErr || "?") }, { status: 500 });

        let waId: string | null = null;
        let stato = "sent";
        try {
            const res = await inviaTesto(inst.instance_name, conv.chat_jid || conv.customer_number, testo);
            waId = res?.key?.id || null;
        } catch (e) {
            stato = "failed";
        }
        await supabase.from("wa_messages").insert({
            conversation_id: conv.id, direction: "out", body: testo,
            status: stato, wa_message_id: waId, wa_timestamp: new Date().toISOString(),
        });
        await supabase.from("wa_conversations").update({
            last_preview: testo.slice(0, 120), last_message_at: new Date().toISOString(),
        }).eq("id", conv.id);

        if (stato === "failed") return NextResponse.json({ error: "invio non riuscito (istanza disconnessa?)" }, { status: 502 });
        return NextResponse.json({
            ok: true, conversationId: conv.id,
            da: inst.display_name || inst.instance_name,
            // chi legge la risposta deve sapere se è uscito dal numero giusto
            ripiego: ripiegato || undefined,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "errore interno";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
