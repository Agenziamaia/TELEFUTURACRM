import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { aircallPost, soloCifre } from "@/lib/aircall";

export const dynamic = "force-dynamic";

// CLICK-TO-CALL (Fase 2, conferma Luca 26/07): mette il numero nel telefono
// Aircall del caller (POST /users/:id/dial — il tasto verde lo preme lui, come
// da handout: il dial pre-compila, non avvia da solo). Credenziali SOLO server.
export async function POST(request: Request) {
    try {
        if (!process.env.AIRCALL_API_ID || !process.env.AIRCALL_API_TOKEN) {
            return NextResponse.json({ error: "Credenziali Aircall non configurate sul server" }, { status: 500 });
        }
        const { number, appUserId } = await request.json();
        const cifre = soloCifre(number);
        if (cifre.length < 6) return NextResponse.json({ error: "Numero non valido" }, { status: 400 });
        if (!appUserId) return NextResponse.json({ error: "Utente non riconosciuto" }, { status: 400 });
        const { data: u } = await supabase.from("app_users")
            .select("aircall_user_id, full_name").eq("id", appUserId).maybeSingle();
        if (!u?.aircall_user_id) {
            return NextResponse.json({ error: "Il tuo utente non è collegato ad Aircall: l'amministrazione deve mappare il tuo interno" }, { status: 400 });
        }
        // E.164: numeri italiani -> +39; gia' col 39 davanti -> +
        const e164 = cifre.startsWith("39") && cifre.length >= 11 ? `+${cifre}` : `+39${cifre}`;
        await aircallPost(`/users/${u.aircall_user_id}/dial`, { number: e164 });
        return NextResponse.json({ ok: true, number: e164 });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Errore";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
