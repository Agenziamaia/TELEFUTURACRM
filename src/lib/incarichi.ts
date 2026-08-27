/**
 * DESIGNATI di un incarico — FONTE UNICA (Luca 03/08).
 *
 * Un incarico ora designa PERSONE SINGOLE (assegnatari, uuid[]) e/o RUOLI
 * INTERI (ruoli, text[], mig. 156). I ruoli si risolvono in persone QUI, AL
 * MOMENTO DELL'EVENTO: chi viene assunto domani con un ruolo designato è
 * dentro l'incarico da solo, senza toccare nulla (richiesta esplicita).
 *
 * Tutti i punti che notificano (ferie, ricambi, bonifici, chiusura linea,
 * ordine merce, PDA, pallino sidebar) passano da qui: mai piu' letture
 * dirette di `assegnatari` sparse per le pagine.
 */
import { supabase } from "@/lib/supabaseClient";

export interface DesignatiIncarico {
    /** utenti designati: singoli + tutti gli attivi dei ruoli designati */
    ids: string[];
    fulmine: boolean;
    whatsapp: string | null;
}

/**
 * IL MESSAGGIO WHATSAPP DELL'INCARICO (Luca 27/08).
 *
 * Il numero si metteva nel pannello e non succedeva niente: solo i bonifici
 * istantanei chiamavano davvero la route di invio, tutti gli altri incarichi
 * leggevano `designatiIncarico` e buttavano via il campo `whatsapp`. Ferie
 * comprese, che infatti il numero ce l'avevano scritto da giorni.
 *
 * Da qui in poi si passa TUTTI da questa funzione: chi vuole avvisare su
 * WhatsApp la chiama e basta. Se il numero non c'è, non succede niente — è
 * il modo per dire «questo incarico non avvisa su WhatsApp».
 *
 * Best-effort per scelta: un messaggio che non parte non deve MAI far fallire
 * la richiesta di ferie o la registrazione che l'ha scatenato.
 */
export async function avvisaIncaricoSuWhatsApp(numero: string | null | undefined, testo: string): Promise<boolean> {
    const dig = String(numero || "").replace(/\D/g, "");
    const corpo = String(testo || "").trim();
    if (dig.length < 6 || !corpo) return false;
    try {
        const res = await fetch("/api/whatsapp/notify", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ number: dig, text: corpo }),
        }).then((r) => r.json()).catch(() => null);
        return !!res?.ok;
    } catch {
        return false;
    }
}

export async function designatiIncarico(chiave: string): Promise<DesignatiIncarico> {
    try {
        interface RigaIncarico { assegnatari?: string[] | null; ruoli?: string[] | null; fulmine?: boolean | null; whatsapp?: string | null }
        let inc: RigaIncarico | null = null;
        const conRuoli = await supabase.from("incarichi").select("assegnatari,ruoli,fulmine,whatsapp").eq("chiave", chiave).maybeSingle();
        if (conRuoli.error) {
            // mig. 156 non ancora applicata: si legge senza i ruoli
            const legacy = await supabase.from("incarichi").select("assegnatari,fulmine,whatsapp").eq("chiave", chiave).maybeSingle();
            inc = (legacy.data ?? null) as RigaIncarico | null;
        } else inc = (conRuoli.data ?? null) as RigaIncarico | null;
        if (!inc) return { ids: [], fulmine: false, whatsapp: null };
        let ids = [...((inc.assegnatari ?? []) as string[])];
        const ruoli = (inc.ruoli ?? []) as string[];
        if (ruoli.length) {
            const { data: utenti } = await supabase.from("app_users").select("id").in("role", ruoli).eq("active", true);
            ids = [...new Set([...ids, ...((utenti ?? []) as { id: string }[]).map((u) => u.id)])];
        }
        return { ids, fulmine: !!inc.fulmine, whatsapp: inc.whatsapp ?? null };
    } catch {
        return { ids: [], fulmine: false, whatsapp: null };
    }
}
