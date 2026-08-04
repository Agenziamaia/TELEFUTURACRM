import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { aircallGet, puoAscoltareRegistrazioni } from "@/lib/aircall";

export const dynamic = "force-dynamic";

// REGISTRAZIONI: gli URL che Aircall manda col webhook sono link S3 FIRMATI che
// scadono dopo ~45-55 minuti — il recording_url salvato in call_events smette
// di suonare entro un'ora (S3 risponde 403 e il player resta muto: segnalazione
// Luca 31/07). Qui si chiede ad Aircall un URL fresco AD OGNI ascolto e si fa
// redirect: il player <audio> lo segue da solo. Credenziali SOLO server.
export async function GET(request: Request) {
    try {
        if (!process.env.AIRCALL_API_ID || !process.env.AIRCALL_API_TOKEN) {
            return NextResponse.json({ error: "Credenziali Aircall non configurate sul server" }, { status: 500 });
        }
        const params = new URL(request.url).searchParams;
        const id = params.get("call");
        if (!id || !/^\d+$/.test(id)) {
            return NextResponse.json({ error: "id chiamata Aircall mancante o non valido" }, { status: 400 });
        }
        // GATE PER RUOLO (decisione Luca 04/08): prima l'endpoint era SENZA
        // login — chiunque col link scaricava l'audio. Ora serve ?u=<app_users.id>
        // e il ruolo si verifica A DB (pattern del progetto, come /api/aircall/dial):
        // l'audio delle registrazioni si ascolta da store manager in su.
        const uid = params.get("u");
        if (!uid) return NextResponse.json({ error: "Utente non riconosciuto" }, { status: 401 });
        const { data: u } = await supabase.from("app_users").select("role, active").eq("id", uid).maybeSingle();
        if (!u || u.active === false || !puoAscoltareRegistrazioni(u.role)) {
            return NextResponse.json({ error: "Le registrazioni si ascoltano da store manager in su" }, { status: 403 });
        }
        const info = await aircallGet(`/calls/${id}`);
        const url: string | null = info?.call?.recording || info?.call?.asset || null;
        if (!url) return NextResponse.json({ error: "Nessuna registrazione disponibile per questa chiamata" }, { status: 404 });
        return NextResponse.redirect(url, 302);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Errore";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
