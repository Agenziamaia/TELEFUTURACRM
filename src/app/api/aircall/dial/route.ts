import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { aircallGet, aircallPost } from "@/lib/aircall";
import { normalizzaE164, msgNumeroNonValido } from "@/lib/telefono";

export const dynamic = "force-dynamic";

// CLICK-TO-CALL: AVVIA la chiamata sul telefono Aircall del caller
// (POST /users/:id/calls con number_id + to). Se non si puo' — utente offline,
// gia' al telefono, numero non attivo — si ripiega sul dial che pre-compila e
// il tasto verde lo preme lui. (Richiesta Luca 30/07: prima c'era solo il
// pre-compila, conferma 26/07 superata.) Credenziali SOLO server.
export async function POST(request: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(request, "aircall/dial");
        if (!_g.ok) return _g.risposta;
        const _s = _g.sess;
    }

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
        // 1) AVVIO vero della chiamata: serve il number_id del numero Aircall
        //    da cui chiamare (il default dell'utente, o il primo associato).
        // 2) Fallback: dial, che pre-compila soltanto. NB: il body del dial
        //    vuole "to" (docs Aircall), NON "number" — con la chiave sbagliata
        //    Aircall rispondeva 400 "Invalid number to call" su tutto.
        let via: "avviata" | "composta" = "avviata";
        try {
            const info = await aircallGet(`/users/${u.aircall_user_id}`);
            const numberId = info?.user?.default_number_id || info?.user?.numbers?.[0]?.id;
            if (!numberId) throw new Error("nessun numero Aircall associato");
            await aircallPost(`/users/${u.aircall_user_id}/calls`, { number_id: numberId, to: e164 });
        } catch {
            via = "composta";
            await aircallPost(`/users/${u.aircall_user_id}/dial`, { to: e164 });
        }
        return NextResponse.json({ ok: true, number: e164, via });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Errore";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
