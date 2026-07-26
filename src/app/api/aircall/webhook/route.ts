import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { codaNumero } from "@/lib/aircall";

export const dynamic = "force-dynamic";

// Riceve gli eventi chiamata da Aircall e li registra in call_events, collegandoli
// al cliente (per numero) e al negozio/utente (per numero Aircall).
// Sicurezza: l'URL registrato su Aircall porta ?t=<AIRCALL_WEBHOOK_TOKEN>; senza
// il token giusto la richiesta viene rifiutata.

function toIso(v: unknown): string | null {
    if (v == null) return null;
    const n = Number(v);
    if (!Number.isNaN(n) && n > 1e9) return new Date(n * 1000).toISOString(); // epoch secondi
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function POST(request: Request) {
    try {
        const url = new URL(request.url);
        const expected = process.env.AIRCALL_WEBHOOK_TOKEN || "";
        if (!expected || url.searchParams.get("t") !== expected) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }

        const payload = await request.json();
        const event: string = payload?.event || "";
        const d = payload?.data || {};
        // Ci interessano solo gli eventi chiamata (call.*). Gli altri li ignoriamo ok.
        if (!event.startsWith("call.") || !d?.id) {
            return NextResponse.json({ ok: true, ignored: event });
        }

        const direction = d.direction || null;                 // inbound | outbound
        const clienteNum = d.raw_digits || d.to || d.from || null; // l'altro capo
        const aircallUserId = d.user?.id ?? null;
        const agente = d.user?.name ?? null;
        const numberId = d.number?.id ?? null;
        const started = toIso(d.started_at);
        const answered = toIso(d.answered_at);
        const ended = toIso(d.ended_at);
        const durata = typeof d.duration === "number" ? d.duration : null;
        const registrazione = d.recording || d.asset || null;   // link registrazione se presente
        const answeredBool = !!d.answered_at;
        const missed = direction === "inbound" && !d.answered_at && (event === "call.hungup" || event === "call.ended");

        // negozio dal numero Aircall (se mappato in stores.aircall_number_id)
        let negozio: string | null = null;
        if (numberId) {
            const { data: st } = await supabase.from("stores").select("name").eq("aircall_number_id", numberId).maybeSingle();
            negozio = st?.name ?? null;
        }

        // cliente dal numero (ultime 9 cifre)
        let clientId: string | null = null;
        if (clienteNum) {
            const coda = codaNumero(clienteNum);
            if (coda.length >= 6) {
                const { data: cli } = await supabase
                    .from("clients").select("id, cellulare").ilike("cellulare", `%${coda}%`).limit(1);
                if (cli && cli[0]) clientId = cli[0].id;
            }
        }

        const row: Record<string, unknown> = {
            aircall_call_id: d.id,
            direction, status: d.status || event.replace("call.", ""),
            from_number: d.from ?? null, to_number: d.to ?? null,
            cliente_num: clienteNum,
            aircall_user_id: aircallUserId, agente_nome: agente,
            aircall_number_id: numberId, negozio,
            answered: answeredBool, duration_sec: durata,
            recording_url: registrazione, missed,
            started_at: started, answered_at: answered, ended_at: ended,
            client_id: clientId, raw: payload,
        };

        // upsert per aircall_call_id: gli eventi successivi (answered -> ended)
        // aggiornano la stessa riga invece di duplicarla.
        const { error } = await supabase.from("call_events").upsert(row, { onConflict: "aircall_call_id" });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ ok: true, event, matched_client: clientId });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// Aircall non manda GET, ma un 200 aiuta a verificare che la rotta e' viva.
export async function GET() {
    return NextResponse.json({ ok: true, service: "aircall-webhook" });
}
