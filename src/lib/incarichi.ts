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
