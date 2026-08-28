import { NextResponse } from "next/server";
import { richiedeSessione, rispostaSessioneNonValida } from "@/lib/sessioneServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { buildRequestXml } from "@/lib/fiscalprint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_RT = process.env.RT_DEVICE_URL || "http://192.168.1.219";

// Chiusura fiscale giornaliera — Report Z (spec Francesco #4). Mette in coda un
// comando zReport per OGNI RT del negozio (multi-societario: una chiusura per P.IVA),
// o per un singolo RT se si passa azienda/deviceUrl.
// ⚠️ AZIONE FISCALE IRREVERSIBILE: stampa la chiusura e trasmette i corrispettivi
// all'Agenzia delle Entrate. Va protetta lato UI (admin + conferma esplicita).
//   POST { negozio, azienda?, deviceUrl? }
export async function POST(req: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        const _s = richiedeSessione(req);
        if (!_s) return rispostaSessioneNonValida();
    }

    const b: any = await req.json().catch(() => ({}));
    const negozio = b.negozio ?? null;
    if (!negozio && !b.deviceUrl) return NextResponse.json({ error: "negozio o deviceUrl richiesto" }, { status: 400 });

    // RT da chiudere.
    let targets: { azienda: string | null; rt_url: string }[] = [];
    if (b.deviceUrl) {
        targets = [{ azienda: b.azienda || null, rt_url: b.deviceUrl }];
    } else {
        let q = supabase.from("pos_rt").select("azienda, rt_url").eq("negozio", negozio);
        if (b.azienda) q = q.eq("azienda", b.azienda);
        const { data } = await q;
        targets = (data || []).map((r: any) => ({ azienda: r.azienda, rt_url: r.rt_url }));
        if (!targets.length) targets = [{ azienda: null, rt_url: DEFAULT_RT }];
    }

    const xml = buildRequestXml("z_report");
    if (!xml) return NextResponse.json({ error: "impossibile costruire la chiusura Z" }, { status: 500 });

    const chiusure: any[] = [];
    for (const t of targets) {
        const { data, error } = await supabase.from("print_jobs").insert({
            negozio,
            device_url: t.rt_url,
            kind: "z_report",
            request_xml: xml,
            status: "pending",
            meta: { azienda: t.azienda },
        }).select("id").single();
        if (error) return NextResponse.json({ error: error.message, chiusure }, { status: 500 });
        chiusure.push({ azienda: t.azienda, rt: t.rt_url, jobId: data.id });
    }
    return NextResponse.json({ ok: true, chiusure });
}
