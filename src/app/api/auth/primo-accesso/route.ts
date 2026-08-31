import { NextResponse } from "next/server";
import { SESSIONE_COOKIE } from "@/lib/sessioneServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// IL PRIMO ACCESSO NON PUÒ CHIEDERE UNA SESSIONE CHE NON ESISTE (Luca 31/08).
//
// Il guasto: dalla blindatura del 28/08 il cambio password passava da
// /api/auth/azioni, che riconosce chi chiama dal cookie di sessione. Ma al
// primo accesso quel cookie NON c'è: il login, vedendo `must_change_password`,
// si ferma prima di emetterlo. Quindi:
//   • su un browser pulito → «Sessione non valida: esci e rientra»;
//   • su un PC di negozio dove un collega era già entrato → il cookie c'era ma
//     era DEL COLLEGA: il server provava a cambiare la password di QUELLO, con
//     la temporanea del nuovo arrivato, e rispondeva «Password attuale non
//     valida». È la schermata che ha fotografato Jacopo.
// Il secondo caso è anche il più pericoloso: bastava che le due password
// coincidessero per riscrivere quella del collega.
//
// La riparazione: qui l'identità la prova la PASSWORD, non il cookie — la
// stessa verifica del login (verify_login), sulla stessa email con cui si è
// appena entrati. E il cookie del collega, se c'era, viene buttato: su quel
// browser adesso c'è un'altra persona.
export async function POST(request: Request) {
    const { email, vecchia, nuova } = await request.json().catch(() => ({}));
    const em = String(email || "").trim();
    const old = String(vecchia || "");
    const nw = String(nuova || "");
    if (!em || !old) return NextResponse.json({ error: "Email e password temporanea sono obbligatorie." });
    if (nw.length < 8) return NextResponse.json({ error: "La password deve avere almeno 8 caratteri." });
    if (nw === old) return NextResponse.json({ error: "La nuova password deve essere diversa da quella temporanea." });

    const { data, error } = await supabase.rpc("verify_login", { p_email: em, p_password: old });
    if (error) return NextResponse.json({ error: error.message });
    const row = Array.isArray(data) ? data[0] : data;
    // stesso messaggio del login: non si dice mai QUALE dei due è sbagliato
    if (!row) return NextResponse.json({ error: "Email o password temporanea non validi." });
    if (!row.must_change_password) return NextResponse.json({ error: "Questa password è già personale: entra normalmente dal login." });

    const { data: fatto, error: e2 } = await supabase.rpc("change_password", { p_email: row.email, p_old: old, p_new: nw });
    if (e2) return NextResponse.json({ error: e2.message });
    if (fatto !== true && fatto !== "ok") return NextResponse.json({ error: "Cambio password non riuscito: riprova." });

    const res = NextResponse.json({ ok: true });
    // il permesso di chi c'era prima su questo browser non sopravvive
    res.cookies.set(SESSIONE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
    return res;
}
