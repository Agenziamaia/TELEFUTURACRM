/* LA PAROLA D'ORDINE DEI LAVORI AUTOMATICI.
 *
 * Due lavori girano da soli ogni dieci minuti (il triage delle chat e quello
 * della posta) e non hanno una sessione da presentare: nessuno li ha
 * «aperti», non c'è un browser dietro. Prima le loro rotte erano aperte a
 * chiunque — e ogni corsa costa denaro vero.
 *
 * Da qui in avanti quelle rotte accettano O una sessione firmata (una
 * persona) O questa parola (un lavoro). La parola vive nel database, così si
 * cambia senza entrare nella macchina.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

let _parola: string | null = null;
let _letta = 0;

/** La richiesta arriva da un lavoro automatico riconosciuto? */
export async function eUnLavoroAutomatico(request: Request): Promise<boolean> {
    const dato = request.headers.get("x-cron");
    if (!dato) return false;
    // si rilegge di rado: è un segreto che cambia quasi mai, e questa
    // funzione sta sul percorso di ogni chiamata
    if (!_parola || Date.now() - _letta > 5 * 60000) {
        const { data } = await supabaseAdmin.from("impostazioni_servizio")
            .select("parola_cron").eq("id", 1).maybeSingle();
        _parola = (data?.parola_cron as string) || null;
        _letta = Date.now();
    }
    if (!_parola) return false;
    /* confronto a lunghezza costante: su un segreto che si può provare a
       tentativi, un confronto normale racconta quanti caratteri sono giusti */
    if (dato.length !== _parola.length) return false;
    let diff = 0;
    for (let i = 0; i < dato.length; i++) diff |= dato.charCodeAt(i) ^ _parola.charCodeAt(i);
    return diff === 0;
}
