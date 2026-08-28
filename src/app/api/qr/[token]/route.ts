import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// UPLOAD DA TELEFONO COL QR — il varco pubblico, ma STRETTO (28/08).
//
// La pagina /m/u/<token> funziona senza login: è il cliente in negozio che
// inquadra il QR. Prima, per farla funzionare, l'intera tabella qr_uploads
// era aperta a chiunque: bastava chiedere l'elenco per avere TUTTE le
// sessioni mai create, e da lì i link ai documenti d'identità caricati.
//
// Ora si passa da qui: si può leggere e aggiornare UNA sola sessione, quella
// del token che si ha in mano, e solo se non è scaduta.
const seScaduta = (r: { expires_at?: string | null }) =>
    !!r?.expires_at && new Date(String(r.expires_at)).getTime() < Date.now();

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
    const { token } = await ctx.params;
    if (!token || token.length < 12) return NextResponse.json({ error: "Sessione non valida" });
    const { data } = await supabase.from("qr_uploads").select("*").eq("token", token).maybeSingle();
    if (!data || seScaduta(data)) return NextResponse.json({ error: "Sessione scaduta o inesistente" });
    return NextResponse.json({ sessione: data });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ token: string }> }) {
    const { token } = await ctx.params;
    if (!token || token.length < 12) return NextResponse.json({ error: "Sessione non valida" });
    const { files, status } = await request.json().catch(() => ({}));
    const { data: pre } = await supabase.from("qr_uploads").select("expires_at").eq("token", token).maybeSingle();
    if (!pre || seScaduta(pre)) return NextResponse.json({ error: "Sessione scaduta o inesistente" });
    const patch: Record<string, unknown> = {};
    if (files !== undefined) patch.files = files;
    if (status !== undefined) patch.status = String(status).slice(0, 30);
    const { error } = await supabase.from("qr_uploads").update(patch).eq("token", token);
    if (error) return NextResponse.json({ error: error.message });
    return NextResponse.json({ ok: true });
}
