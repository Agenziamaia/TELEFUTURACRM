/* AVVISO WhatsApp DA UN LAVORO AUTOMATICO.
 *
 * Manda un testo a un NUMERO, senza che ci sia una persona dietro: sceglie il
 * mittente designato, trova o crea la conversazione e registra il messaggio
 * nello storico come ogni altro. È il cuore che stava dentro
 * /api/whatsapp/notify — spostato qui perché ora lo usa anche il guardiano
 * delle casse (/api/pos/watchdog), e due copie della stessa euristica
 * finiscono sempre per divergere.
 */
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { inviaTesto } from "@/lib/evolution";
import { trovaOCreaConversazione } from "@/lib/waConversazioni";
import { scegliMittente } from "@/lib/waMittente";

export type EsitoAvviso = {
    ok: boolean;
    errore?: string;
    conversationId?: string;
    /** true se è partito da un numero diverso da quello designato */
    ripiegato?: boolean;
    mittente?: string;
};

/* ⚠️ NON `includes("conness")`: «disconnessa» lo contiene, quindi un numero
   caduto risulterebbe collegato e il ripiego non scatterebbe mai (rilievo del
   revisore, 27/08). Confronto esatto. */
const connessa = (i: { status?: string | null }) => String(i.status || "").toLowerCase() === "connessa";

/**
 * @param numero destinatario, in qualunque formato (si tengono le sole cifre)
 * @param testo  il messaggio
 */
export async function avvisaSuWhatsApp(numero: string, testo: string, negozio?: string | null): Promise<EsitoAvviso> {
    const dig = String(numero || "").replace(/\D/g, "");
    const msg = String(testo || "").trim();
    if (dig.length < 6 || !msg) return { ok: false, errore: "numero o testo mancanti" };

    /* DA QUALE NUMERO ESCE (Luca 27/08): c'è un MITTENTE DESIGNATO scelto dal
       pannello WhatsApp; la scelta a caso resta solo come rete di sicurezza, e
       viene detta a chi chiama. */
    /* ⚠️ LA STESSA REGOLA DELLA ROTTA, e da un posto solo. Questa copia
       serviva i lavori automatici (l'allarme delle casse) e aveva la sua
       euristica di ripiego incollata: cambiando solo la rotta, il cron avrebbe
       continuato a spedire da un numero a caso. Ora la scelta del mittente
       vive in `lib/waMittente.ts` e la usano tutti e due. */
    const { data: insts } = await supabase.from("wa_instances")
        .select("id, instance_name, status, mittente_notifiche, display_name, negozio, owner_user_id")
        .order("created_at", { ascending: false });
    const scelta = scegliMittente((insts ?? []) as never[], negozio);
    if ("errore" in scelta) return { ok: false, errore: scelta.errore };
    const inst = scelta.inst;

    const { conv, error: convErr } = await trovaOCreaConversazione(inst.id, dig);
    if (convErr || !conv) return { ok: false, errore: "conversazione non creata: " + (convErr || "?") };

    let waId: string | null = null;
    let stato = "sent";
    try {
        const res = await inviaTesto(inst.instance_name, conv.chat_jid || conv.customer_number, msg);
        waId = res?.key?.id || null;
    } catch {
        stato = "failed";
    }
    await supabase.from("wa_messages").insert({
        conversation_id: conv.id, direction: "out", body: msg,
        status: stato, wa_message_id: waId, wa_timestamp: new Date().toISOString(),
    });
    await supabase.from("wa_conversations").update({
        last_preview: msg.slice(0, 120), last_message_at: new Date().toISOString(),
    }).eq("id", conv.id);

    if (stato === "failed") return { ok: false, errore: "invio non riuscito (istanza disconnessa?)" };
    return {
        ok: true, conversationId: conv.id,
        // niente più ripiego: o esce dal numero giusto, o non esce
        ripiegato: false,
        mittente: inst.display_name || inst.instance_name,
    };
}
