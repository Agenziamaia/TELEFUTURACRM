import { NextResponse } from "next/server";
import { richiedeSessione, rispostaSessioneNonValida } from "@/lib/sessioneServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AZIONI SENSIBILI SULL'ACCOUNT (Blindatura 28/08).
// Queste tre operazioni erano funzioni di database chiamabili da CHIUNQUE
// conoscesse l'indirizzo del sito: bastava la chiave pubblica per cambiare
// la password di tutti i dipendenti. Ora si passa solo da qui, con la
// sessione firmata, e i poteri sono verificati sul server.
//   cambia_password → la PROPRIA (serve la vecchia)
//   reset_password  → quella di un altro: solo admin/dev/direzione
//   alias           → l'alias privacy di una persona: solo admin/dev/direzione
const PUO_AMMINISTRARE = ["admin", "dev", "direttore_generale"];

export async function POST(request: Request) {
    const sess = richiedeSessione(request);
    if (!sess) return rispostaSessioneNonValida();
    const { azione, email, vecchia, nuova, userId, alias } = await request.json().catch(() => ({}));

    // il ruolo si rilegge dal DB: quello del cookie potrebbe essere vecchio
    const { data: io } = await supabase.from("app_users").select("id, role, email, active").eq("id", sess.id).maybeSingle();
    if (!io || io.active === false) return NextResponse.json({ error: "Utente non attivo" });
    const amministra = PUO_AMMINISTRARE.includes(String(io.role || ""));

    if (azione === "cambia_password") {
        // solo la propria: l'email della sessione, non quella che arriva dal client
        if (!nuova || String(nuova).length < 8) return NextResponse.json({ error: "La password deve avere almeno 8 caratteri" });
        const { data, error } = await supabase.rpc("change_password", { p_email: io.email, p_old: vecchia, p_new: nuova });
        if (error) return NextResponse.json({ error: error.message });
        return NextResponse.json({ ok: data === true || data === "ok", risultato: data });
    }
    if (azione === "reset_password") {
        if (!amministra) return NextResponse.json({ error: "Non hai i permessi per questa operazione" });
        if (!userId || !nuova) return NextResponse.json({ error: "Dati mancanti" });
        const { data, error } = await supabase.rpc("admin_set_password", { p_user_id: userId, p_new: nuova });
        if (error) return NextResponse.json({ error: error.message });
        return NextResponse.json({ ok: true, risultato: data });
    }
    if (azione === "alias") {
        if (!amministra) return NextResponse.json({ error: "Non hai i permessi per questa operazione" });
        if (!userId) return NextResponse.json({ error: "Dati mancanti" });
        const { data, error } = await supabase.rpc("applica_alias", { p_user_id: userId, p_alias: alias || "" });
        if (error) return NextResponse.json({ error: error.message });
        return NextResponse.json({ ok: true, risultato: data });
    }
    // email è accettata solo per compatibilità: non decide nulla
    void email;
    return NextResponse.json({ error: "Azione non riconosciuta" });
}
