import { NextResponse } from "next/server";
import { richiedeSessione, SESSIONE_COOKIE } from "@/lib/sessioneServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// USCIRE DAVVERO (Luca 28/08 sera).
// Prima il logout ripuliva solo il browser: il permesso di sessione restava
// tecnicamente valido fino a 7 giorni — un problema sulle postazioni condivise
// dei negozi e, soprattutto, per chi lascia l'azienda.
// Qui si cancella il cookie E si fa avanzare il contatore della persona: da
// quel momento nessun permesso emesso prima vale più, nemmeno se qualcuno ne
// avesse una copia.
export async function POST(request: Request) {
    const sess = richiedeSessione(request);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSIONE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
    if (sess?.id) {
        try {
            const { data } = await supabase.from("app_users").select("session_epoch").eq("id", sess.id).maybeSingle();
            await supabase.from("app_users").update({ session_epoch: (Number(data?.session_epoch) || 0) + 1 }).eq("id", sess.id);
        } catch { /* il cookie è comunque cancellato */ }
    }
    return res;
}
