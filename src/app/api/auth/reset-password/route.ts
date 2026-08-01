import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { decifraSegreto, verificaCodice } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RESET PASSWORD IN AUTONOMIA (Luca 01/08): niente piu' autorizzazione
// dell'amministrazione — l'utente si verifica col codice dell'authenticator
// (2FA obbligatoria dal 31/07, quindi chiunque abbia fatto un accesso ce l'ha)
// e imposta subito la nuova password. Chi NON ha ancora la 2FA attiva ricade
// nella vecchia richiesta all'amministrazione (fallback:true, risposta neutra:
// non si rivela se un'email esiste o ha la 2FA).
// La verifica del codice sta QUI lato server: il segreto non lascia mai il DB.

// anti forza-bruta sul codice a 6 cifre: max 5 tentativi per email ogni 10'
const tentativi = new Map<string, { n: number; t: number }>();
const FINESTRA_MS = 10 * 60 * 1000;
const MAX_TENTATIVI = 5;
function bloccato(em: string): boolean {
    const r = tentativi.get(em);
    if (!r || Date.now() - r.t > FINESTRA_MS) return false;
    return r.n >= MAX_TENTATIVI;
}
function segnaTentativo(em: string) {
    const r = tentativi.get(em);
    if (!r || Date.now() - r.t > FINESTRA_MS) tentativi.set(em, { n: 1, t: Date.now() });
    else r.n += 1;
}

export async function POST(request: Request) {
    try {
        const { email, code, newPassword } = await request.json();
        const em = String(email || "").trim().toLowerCase();
        const codice = String(code || "").trim();
        const nuova = String(newPassword || "");
        if (!em || !codice || !nuova) return NextResponse.json({ ok: false, error: "Compila email, codice e nuova password." });
        if (nuova.length < 8) return NextResponse.json({ ok: false, error: "La nuova password deve avere almeno 8 caratteri." });
        if (bloccato(em)) return NextResponse.json({ ok: false, error: "Troppi tentativi: riprova tra qualche minuto." });

        const { data: row } = await supabase.from("app_users")
            .select("id, totp_secret, totp_enabled").eq("active", true).ilike("email", em).limit(1).maybeSingle();

        let secret = "";
        try { secret = row?.totp_secret ? decifraSegreto(row.totp_secret) : ""; } catch { secret = ""; }
        if (!row || !row.totp_enabled || !secret) {
            // email inesistente O 2FA non attiva: stessa risposta (neutra)
            return NextResponse.json({ ok: false, fallback: true, error: "Su questo account la verifica in due passaggi non risulta attiva: usa la richiesta all'amministrazione qui sotto." });
        }

        if (!verificaCodice(codice, secret)) {
            segnaTentativo(em);
            return NextResponse.json({ ok: false, error: "Codice non valido: controlla l'app authenticator." });
        }

        // password nuova con lo stesso hashing del pannello (RPC bcrypt);
        // scelta dall'utente => niente cambio obbligatorio al prossimo accesso
        const { error: e1 } = await supabase.rpc("admin_set_password", { p_user_id: row.id, p_new: nuova });
        if (e1) return NextResponse.json({ ok: false, error: "Salvataggio non riuscito: " + e1.message });
        await supabase.from("app_users").update({ must_change_password: false }).eq("id", row.id);

        tentativi.delete(em);
        return NextResponse.json({ ok: true });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Errore interno" }, { status: 500 });
    }
}
