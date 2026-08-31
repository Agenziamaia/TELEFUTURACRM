import { NextResponse } from "next/server";
import { richiedeSessione, rispostaSessioneNonValida } from "@/lib/sessioneServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { inviaCredenziali } from "@/lib/emailCredenziali";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AZIONI SENSIBILI SULL'ACCOUNT (Blindatura 28/08).
// Queste tre operazioni erano funzioni di database chiamabili da CHIUNQUE
// conoscesse l'indirizzo del sito: bastava la chiave pubblica per cambiare
// la password di tutti i dipendenti. Ora si passa solo da qui, con la
// sessione firmata, e i poteri sono verificati sul server.
//   cambia_password → la PROPRIA (serve la vecchia)
//   reset_password  → quella di un altro: solo admin/dev/direzione, e la
//                     password parte per email all'interessato
//   alias           → l'alias privacy di una persona: solo admin/dev/direzione
const PUO_AMMINISTRARE = ["admin", "dev", "direttore_generale"];

export async function POST(request: Request) {
    const sess = richiedeSessione(request);
    if (!sess) return rispostaSessioneNonValida();
    const { azione, email, vecchia, nuova, userId: bersaglio, alias, benvenuto } = await request.json().catch(() => ({}));
    // `bersaglio` è la persona SU CUI si agisce: chi agisce è sempre la sessione

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
        if (!bersaglio || !nuova) return NextResponse.json({ error: "Dati mancanti" });
        const { data, error } = await supabase.rpc("admin_set_password", { p_user_id: bersaglio, p_new: nuova });
        if (error) return NextResponse.json({ error: error.message });
        // …E LA PASSWORD ARRIVA ALL'INTERESSATO (Luca 31/08). Prima restava a
        // video sulla scheda dell'amministrazione, che doveva dettarla. Adesso
        // parte dalla casella aziendale — amministrazione@, la stessa via del
        // reset che l'utente si fa da solo dal login.
        // L'invio viene DOPO il cambio password, non prima: qui è un admin che
        // ha deciso di resettare, quindi la password nuova vale comunque e
        // resta a video se la posta non parte. (Nel reset self-service è il
        // contrario: lì si spedisce prima, perché se la mail non arriva
        // l'utente resterebbe chiuso fuori con una password che non conosce.)
        const { data: chi } = await supabase.from("app_users").select("email, full_name").eq("id", bersaglio).maybeSingle();
        const esito = await inviaCredenziali({ a: chi?.email || "", nome: chi?.full_name, password: String(nuova), benvenuto: !!benvenuto });
        return NextResponse.json({ ok: true, risultato: data, email: esito.ok ? esito.da : null, emailErrore: esito.ok ? null : esito.errore });
    }
    if (azione === "alias") {
        if (!amministra) return NextResponse.json({ error: "Non hai i permessi per questa operazione" });
        if (!bersaglio) return NextResponse.json({ error: "Dati mancanti" });
        const { data, error } = await supabase.rpc("applica_alias", { p_user_id: bersaglio, p_alias: alias || "" });
        if (error) return NextResponse.json({ error: error.message });
        return NextResponse.json({ ok: true, risultato: data });
    }
    // email è accettata solo per compatibilità: non decide nulla
    void email;
    return NextResponse.json({ error: "Azione non riconosciuta" });
}
