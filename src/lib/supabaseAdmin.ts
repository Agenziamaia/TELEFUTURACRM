import { createClient } from "@supabase/supabase-js";
import { fileUrlDa } from "@/lib/fileUrl";

// IL CLIENT DEL SERVER (Blindatura fase B, Luca 28/08).
//
// Usa la chiave `service_role`, che vive SOLO sul server (mai nel browser) e
// scavalca le policy: è così che il server continua a leggere e scrivere
// quando le tabelle saranno chiuse al pubblico. Chi lo usa ha il DOVERE di
// applicare i permessi dell'utente PRIMA di restituire i dati: qui non c'è
// nessuna rete di protezione automatica.
//
// Senza la chiave configurata si ripiega sulla anon key: il comportamento
// resta quello di oggi e nulla si rompe.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const serviceRolePresente = () => !!service;

export const supabaseAdmin = createClient(url, service || anon, {
    auth: { persistSession: false, autoRefreshToken: false },
});

/* GLI INDIRIZZI DEI FILE PASSANO DAL CUSTODE anche quando li scrive il
   server (31/08). Il poll della posta e il recupero dello storico salvano
   l'indirizzo dell'allegato DENTRO `email_messages.attachments`: se lo
   salvassero pubblico, ogni email che arriva da adesso in poi rimetterebbe
   in giro un indirizzo scaricabile da chiunque — e domani sarebbero altre
   migliaia da correggere. Nascono già protetti.
   Stesso ragionamento del client: si cambia dove punta, non chi lo chiama. */
const _fromA = supabaseAdmin.storage.from.bind(supabaseAdmin.storage);
supabaseAdmin.storage.from = ((deposito: string) => {
    const s = _fromA(deposito);
    const _pub = s.getPublicUrl.bind(s);
    s.getPublicUrl = ((percorso: string, opzioni?: unknown) => {
        const vero = _pub(percorso, opzioni as never);
        return { data: { publicUrl: fileUrlDa(deposito, percorso) }, error: (vero as { error?: unknown })?.error ?? null };
    }) as typeof s.getPublicUrl;
    return s;
}) as typeof supabaseAdmin.storage.from;
