import { supabase } from "@/lib/supabaseClient";

// Salvataggio degli allegati WhatsApp nel bucket pubblico "whatsapp-media" e
// ritorno dell'URL pubblico (che poi finisce in wa_messages.media_url).

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
        if (error) return null;
        const { data } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
        return data?.publicUrl || null;
    } catch {
        return null;
    }
}
