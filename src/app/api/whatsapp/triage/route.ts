import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { corsaTriage, TRIAGE_VERSIONE } from "@/lib/ai/waTriage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * TRIAGE AI delle chat WhatsApp — vedi lib/ai/waTriage.
 * POST {} → un giro di classificazione (lock+debounce dentro la lib: widget,
 * cron pg_cron e curl possono chiamarla insieme senza doppioni; il costo per
 * giro è centesimi ed è comunque loggato in ai_usage). body.force=true salta
 * il debounce, body.max abbassa il tetto di chat per giro.
 * GET → stato dell'ultimo giro + censimento per stato (diagnosi).
 */
export async function POST(req: Request) {
    let body: any = {};
    try { body = await req.json(); } catch { }
    const esito = await corsaTriage({ force: !!body?.force, max: Number(body?.max) || undefined });
    return NextResponse.json(esito);
}

export async function GET() {
    const [{ data: stato }, { data: righe }] = await Promise.all([
        supabase.from("wa_triage_stato").select("in_corsa_da, ultima_corsa, ultimo_esito").eq("id", 1).maybeSingle(),
        supabase.from("wa_triage").select("stato, versione"),
    ]);
    const conteggi: Record<string, number> = {};
    (righe || []).forEach((r) => { conteggi[r.stato] = (conteggi[r.stato] || 0) + 1; });
    return NextResponse.json({
        versione: TRIAGE_VERSIONE,
        ultima_corsa: stato?.ultima_corsa || null,
        in_corsa_da: stato?.in_corsa_da || null,
        ultimo_esito: stato?.ultimo_esito || null,
        classificate_totali: (righe || []).length,
        di_versione_corrente: (righe || []).filter((r) => r.versione === TRIAGE_VERSIONE).length,
        conteggi,
    });
}
