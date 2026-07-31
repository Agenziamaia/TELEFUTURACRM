import { NextResponse } from "next/server";
import { aircallGet } from "@/lib/aircall";

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
        const id = new URL(request.url).searchParams.get("call");
        if (!id || !/^\d+$/.test(id)) {
            return NextResponse.json({ error: "id chiamata Aircall mancante o non valido" }, { status: 400 });
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
