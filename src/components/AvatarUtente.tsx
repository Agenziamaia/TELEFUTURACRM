"use client";

// AVATAR UTENTE (Luca 05/08): pallina rotonda con la FOTO del profilo
// (app_users.avatar_url — mig. 20260805020000) e fallback alle INIZIALI del
// nome, identico allo stile storico (indaco). Usato nell'header, in chat e nel
// profilo, cosi' la faccia dell'utente e' la stessa ovunque.
//
// FUNZIONA ANCHE SENZA MIGRAZIONE: se la colonna avatar_url non esiste la
// select fallisce in silenzio e restano le iniziali di sempre.
//
// Come si usa:
//   <AvatarUtente userId={id} nome={nome} className="w-9 h-9 text-xs" />
// - userId → la foto arriva dalla cache condivisa (una sola query per pagina);
// - url (opzionale) → salta la cache e mostra quella URL (usato dal profilo);
// - className → SOLO dimensioni/extra (w-*, h-*, text-*): lo stile base e' qui.
import { useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { User as UserIcon } from "lucide-react";

export const inizialiNome = (nome?: string | null) =>
    String(nome || "").trim().split(/\s+/).filter(Boolean)
        .map((w) => w[0]).join("").toUpperCase().slice(0, 2);

// ─── Cache di modulo: UNA lettura di app_users.avatar_url per sessione di
//     pagina; il profilo la aggiorna al volo via notificaAvatarAggiornato. ───
const EVENTO_AVATAR = "crm-avatar-aggiornato";
let cacheAvatar: Map<string, string> | null = null;
let promessaAvatar: Promise<Map<string, string>> | null = null;

function caricaCacheAvatar(): Promise<Map<string, string>> {
    if (cacheAvatar) return Promise.resolve(cacheAvatar);
    if (!promessaAvatar) {
        promessaAvatar = (async () => {
            const m = new Map<string, string>();
            try {
                const { data, error } = await supabase
                    .from("app_users").select("id, avatar_url").not("avatar_url", "is", null);
                if (!error) {
                    (data ?? []).forEach((r: { id: string; avatar_url: string | null }) => {
                        if (r.avatar_url) m.set(r.id, r.avatar_url);
                    });
                }
                // error (colonna assente, mig. non applicata) → mappa vuota: iniziali
            } catch { /* rete giu': restano le iniziali */ }
            cacheAvatar = m;
            avvisaAbbonati();
            return m;
        })();
    }
    return promessaAvatar;
}

function avvisaAbbonati() {
    try { window.dispatchEvent(new CustomEvent(EVENTO_AVATAR)); } catch { /* SSR/no window */ }
}

/** Chiamata dal profilo dopo upload/rimozione: aggiorna la cache e avvisa
 *  tutti gli avatar montati (header compreso) senza ricaricare la pagina. */
export function notificaAvatarAggiornato(userId: string, url: string | null) {
    if (!cacheAvatar) cacheAvatar = new Map();
    if (url) cacheAvatar.set(userId, url); else cacheAvatar.delete(userId);
    avvisaAbbonati();
}

// store esterno per useSyncExternalStore: il primo abbonato fa partire la
// lettura; al termine (o a ogni upload) l'evento fa rileggere lo snapshot
function sottoscriviAvatar(cb: () => void) {
    window.addEventListener(EVENTO_AVATAR, cb);
    caricaCacheAvatar();
    return () => window.removeEventListener(EVENTO_AVATAR, cb);
}

/** URL della foto di un utente (null = nessuna foto → iniziali). */
export function useAvatarUrl(userId?: string | null): string | null {
    return useSyncExternalStore(
        sottoscriviAvatar,
        () => (userId ? cacheAvatar?.get(userId) ?? null : null),
        () => null,   // SSR: mai foto, sempre iniziali
    );
}

export function AvatarUtente({ userId, url, nome, className }: {
    userId?: string | null;
    /** se PASSATA (anche null) vince sulla cache: il profilo la usa per l'anteprima immediata */
    url?: string | null;
    nome?: string | null;
    className?: string;
}) {
    const daCache = useAvatarUrl(url === undefined ? userId : null);
    const src = url !== undefined ? url : daCache;
    // immagine rotta (file cancellato dal bucket): si torna alle iniziali
    const [rotta, setRotta] = useState<string | null>(null);
    const mostraFoto = !!src && rotta !== src;
    const iniziali = inizialiNome(nome);
    return (
        <span className={cn(
            "rounded-full overflow-hidden flex items-center justify-center font-bold border shrink-0 select-none",
            "bg-indigo-500/20 text-indigo-200 border-indigo-500/30",
            className || "w-9 h-9 text-xs",
        )}>
            {mostraFoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src!} alt={nome || "Foto profilo"} onError={() => setRotta(src!)}
                    className="w-full h-full object-cover" />
            ) : iniziali ? iniziali : <UserIcon className="w-[55%] h-[55%]" />}
        </span>
    );
}
