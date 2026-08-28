import { createClient } from "@supabase/supabase-js";

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
