import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { aircallPost } from "@/lib/aircall";
import { normalizzaE164, msgNumeroNonValido } from "@/lib/telefono";

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
        // Validazione VERA prima di Aircall: sui numeri malformati (es.
        // cellulare a 9 cifre per refuso) Aircall risponde 400 "Invalid number
        // to call" e all'utente arrivava il JSON grezzo. Meglio fermarli qui
        // dicendo qual e' il numero da correggere in anagrafica.
        const e164 = normalizzaE164(number);
        if (!e164) return NextResponse.json({ error: msgNumeroNonValido(number) }, { status: 400 });
        if (!appUserId) return NextResponse.json({ error: "Utente non riconosciuto" }, { status: 400 });
        const { data: u } = await supabase.from("app_users")
            .select("aircall_user_id, full_name").eq("id", appUserId).maybeSingle();
        if (!u?.aircall_user_id) {
            return NextResponse.json({ error: "Il tuo utente non è collegato ad Aircall: l'amministrazione deve mappare il tuo interno" }, { status: 400 });
        }
        await aircallPost(`/users/${u.aircall_user_id}/dial`, { number: e164 });
        return NextResponse.json({ ok: true, number: e164 });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Errore";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
