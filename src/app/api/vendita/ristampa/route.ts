import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RISTAMPA / riemissione di un documento che NON è uscito (Luca 01/09 sera:
// «in Documenti, quando c'è scritto NON USCITO in rosso, un tasto per rifare lo
// scontrino se non è uscito»). Rimette in coda LA STESSA richiesta ePOS verso lo
// STESSO registratore, come NUOVO job — l'originale in errore RESTA come storico,
// così un'eventuale doppia emissione resta VISIBILE e correggibile (non si nasconde
// riscrivendo la riga vecchia).
//   POST { jobId }
// ⚠️ Solo su documenti in stato "error": un documento "done" è già uscito e NON si
// rifà da qui (si annulla). La responsabilità di «non è davvero uscito» resta di chi
// preme: sugli esiti ignoti / rimasti aperti la carta può essere uscita lo stesso —
// la UI lo avvisa.
export async function POST(req: Request) {
    {
        // 🔒 sessione firmata + permesso della sezione (come annullo/scontrino)
        const _g = await accesso(req, "vendita/scontrino");
        if (!_g.ok) return _g.risposta;
    }
    const b: any = await req.json().catch(() => ({}));
    if (!b.jobId) return NextResponse.json({ error: "jobId mancante" }, { status: 400 });

    const { data: orig, error } = await supabase.from("print_jobs")
        .select("negozio, device_url, kind, status, request_xml, meta").eq("id", b.jobId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!orig) return NextResponse.json({ error: "documento non trovato" }, { status: 404 });
    if (!orig.request_xml) return NextResponse.json({ error: "questo documento non ha una richiesta da rifare" }, { status: 400 });
    if (orig.status !== "error") {
        return NextResponse.json({
            error: orig.status === "done"
                ? "questo documento è già uscito: se è sbagliato si annulla, non si rifà"
                : `il documento non è in errore (stato: ${orig.status}) — non c'è niente da rifare`,
        }, { status: 400 });
    }

    // nuovo job = copia della stessa richiesta verso lo stesso registratore,
    // con il riferimento all'originale nel meta (tracciabilità della ristampa).
    const meta = { ...(orig.meta && typeof orig.meta === "object" ? orig.meta : {}), ristampaDi: b.jobId };
    const { data, error: e2 } = await supabase.from("print_jobs")
        .insert({
            negozio: orig.negozio,
            device_url: orig.device_url,
            kind: orig.kind,
            request_xml: orig.request_xml,
            status: "pending",
            meta,
        }).select("id").single();
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

    return NextResponse.json({ ok: true, jobId: data.id });
}
