/* ⚠️ LA CHIAVE DEL SERVER, NON QUELLA DEL BROWSER (31/08).
   Questo modulo gira SOLO lato server — lo chiamano il webhook di Evolution e
   il recupero dello storico — ma usava `supabaseClient`, cioè la chiave
   pubblica. Ha funzionato finché scrivere nei depositi era libero.
   Poi, il 28/08, la blindatura ha preteso un'identità per scrivere: sul
   server il lasciapassare non c'è (è di una persona, e qui non c'è nessuna
   persona), quindi da quel giorno OGNI upload è fallito. La funzione
   restituisce `null` in silenzio, `media_url` resta vuoto, e nella chat il
   negozio vede «[Immagine]» al posto della foto del cliente.
   Misurato: dal 29/08 in poi, 142 media su 142 senza indirizzo. */
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

// Salvataggio degli allegati WhatsApp nel deposito "whatsapp-media" e ritorno
// dell'indirizzo (che poi finisce in wa_messages.media_url).

function estensione(mime?: string): string {
    const m = String(mime || "").toLowerCase().split(";")[0];
    const map: Record<string, string> = {
        "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
        "video/mp4": "mp4", "video/3gpp": "3gp", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
        "application/pdf": "pdf",
    };
    if (map[m]) return map[m];
    const sub = (m.split("/")[1] || "bin").replace(/[^a-z0-9]/g, "");
    return sub || "bin";
}

/** Carica un base64 nel bucket e ritorna l'URL pubblico (null in caso di errore). */
export async function salvaMediaBase64(base64: string, mimetype: string | undefined, convId: string, waMsgId: string): Promise<string | null> {
    if (!base64) return null;
    try {
        const bytes = Buffer.from(base64, "base64");
        const path = `${convId}/${waMsgId}.${estensione(mimetype)}`;
        const { error } = await supabase.storage.from("whatsapp-media").upload(path, bytes, {
            contentType: mimetype || "application/octet-stream", upsert: true,
        });
        /* ⚠️ E SE FALLISCE, SI DEVE SAPERE. Prima tornava `null` in silenzio:
           per tre giorni ogni foto è andata persa senza una riga da nessuna
           parte, e ce ne siamo accorti perché l'ha notato Francesco. */
        if (error) { console.error("[wa-media] upload non riuscito:", error.message, "→", path); return null; }
        const { data } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
        return data?.publicUrl || null;
    } catch {
        return null;
    }
}
