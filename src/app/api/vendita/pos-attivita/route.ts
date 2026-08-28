import { NextResponse } from "next/server";
import { richiedeSessione, rispostaSessioneNonValida } from "@/lib/sessioneServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Attività POS per Amministrazione (Luca): tutti gli scontrini/fatture emessi dai
// negozi + gli incassi della cassa automatica + la chiusura Z, con importi e stato,
// più i dispositivi configurati (RT per negozio/azienda da pos_rt). Sola lettura.
//   GET ?negozio=&kind=&limit=
export async function GET(req: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        const _s = richiedeSessione(req);
        if (!_s) return rispostaSessioneNonValida();
    }

    const { searchParams } = new URL(req.url);
    const negozio = searchParams.get("negozio");
    const kind = searchParams.get("kind");
    const limit = Math.min(Number(searchParams.get("limit")) || 300, 1000);

    let q = supabase.from("print_jobs")
        .select("id, negozio, device_url, kind, status, result, request_xml, meta, created_at, updated_at")
        .order("created_at", { ascending: false }).limit(limit);
    if (negozio) q = q.eq("negozio", negozio);
    if (kind) q = q.eq("kind", kind);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const jobs = (data || []).map((j: any) => {
        const meta = j.meta || {};
        let cassa: { richiesto: number | null; incassato: number | null; resto: number | null } | null = null;
        if (j.kind === "cash_collect") {
            let reqAmount: number | null = null;
            try { reqAmount = Number(JSON.parse(j.request_xml || "{}").amount); } catch { /* noop */ }
            let res: any = {};
            try { res = JSON.parse(j.result || "{}"); } catch { /* noop */ }
            cassa = {
                richiesto: reqAmount ?? (meta.amount ?? null),
                incassato: res.incassato != null ? Number(res.incassato) : null,
                resto: res.resto != null ? Number(res.resto) : null,
            };
        }
        return {
            id: j.id, negozio: j.negozio, kind: j.kind, status: j.status,
            created_at: j.created_at, updated_at: j.updated_at, device_url: j.device_url,
            total: meta.total ?? null, sconto: meta.sconto ?? null, azienda: meta.azienda ?? null,
            testMode: meta.testMode ?? null, coupon: meta.coupon ?? null, cassa,
        };
    });

    const { data: dispositivi } = await supabase.from("pos_rt")
        .select("negozio, azienda, rt_url, piva, ragione_sociale, is_default").order("negozio");

    return NextResponse.json({ ok: true, jobs, dispositivi: dispositivi || [] });
}
