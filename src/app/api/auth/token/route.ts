import { NextResponse } from "next/server";
import { richiedeSessione } from "@/lib/sessioneServer";
import { firmaTokenTf, jwtSecretPresente, DURATA_TOKEN_ORE } from "@/lib/jwtTf";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rilascia il LASCIAPASSARE personale al browser (Blindatura fase B).
// Si passa solo con la sessione firmata del login: nessun cookie, nessun
// token. Se il JWT secret non è configurato risponde { attivo:false } e il
// CRM continua come prima — nessuna rottura.
export async function GET(request: Request) {
    const sess = richiedeSessione(request);
    if (!sess) return NextResponse.json({ attivo: false, motivo: "sessione" });
    if (!jwtSecretPresente()) return NextResponse.json({ attivo: false, motivo: "secret" });

    // il ruolo si rilegge dal DB: quello nel cookie potrebbe essere vecchio
    let role = sess.role || "";
    try {
        const { data } = await supabase.from("app_users").select("role, active, session_epoch").eq("id", sess.id).maybeSingle();
        if (data && data.active === false) return NextResponse.json({ attivo: false, motivo: "disattivato" });
        // uscita, licenziamento o sospensione: il permesso vecchio non vale più
        if (data && Number(data.session_epoch || 0) !== Number(sess.ep || 0)) {
            return NextResponse.json({ attivo: false, motivo: "sessione" });
        }
        if (data?.role) role = String(data.role);
    } catch {
        // se non riusciamo a verificare che l'utente sia ancora attivo, NON
        // si rilascia niente: un licenziato non deve passare per un intoppo
        return NextResponse.json({ attivo: false, motivo: "verifica" });
    }

    const token = firmaTokenTf({
        uid: sess.id,
        role,
        admin: ["admin", "dev"].includes(role),
        stores: [],
    });
    if (!token) return NextResponse.json({ attivo: false, motivo: "secret" });
    return NextResponse.json({ attivo: true, token, scadeTra: DURATA_TOKEN_ORE * 3600 });
}
