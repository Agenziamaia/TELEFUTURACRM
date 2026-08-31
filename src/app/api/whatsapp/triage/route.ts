import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { eUnLavoroAutomatico } from "@/lib/cronParola";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { corsaTriage, TRIAGE_VERSIONE } from "@/lib/ai/waTriage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * TRIAGE AI delle chat WhatsApp — vedi lib/ai/waTriage.
 * POST {} → un giro di classificazione (lock+debounce dentro la lib: widget,
 * cron pg_cron e curl possono chiamarla insieme senza doppioni; il costo per
 * giro è centesimi ed è comunque loggato in ai_usage). body.max abbassa il
 * tetto di chat per giro. body.force (salta il debounce e la memoria-402) è
 * onorato SOLO con header x-triage-token = env TRIAGE_ADMIN_TOKEN: la route
 * è ad anon key come il resto del CRM, ma qui una chiamata costa denaro vivo
 * (rilievo revisore F1) — senza env configurata force è semplicemente
 * ignorato e la chiamata vale come una normale.
 * GET → stato dell'ultimo giro + censimento per stato (diagnosi).
 */
export async function POST(req: Request) {
    /* ⚠️ NON C'ERA NESSUNA GUARDIA (31/08): chiunque su Internet faceva
       partire un giro di classificazione — che costa denaro vero a ogni
       chiamata — e poteva far cestinare chat in automatico. */
    /* ⚠️ O UNA PERSONA, O IL LAVORO AUTOMATICO. Il triage lo fa partire anche
       un cron ogni dieci minuti, che una sessione non ce l'ha: chiudere con
       la sola sessione avrebbe spento il motore invece di proteggerlo. */
    if (!(await eUnLavoroAutomatico(req))) {
        const _g = await accesso(req, "whatsapp/triage");
        if (!_g.ok) return _g.risposta;
    }
    let body: any = {};
    try { body = await req.json(); } catch { }
    const tokenOk = !!process.env.TRIAGE_ADMIN_TOKEN
        && req.headers.get("x-triage-token") === process.env.TRIAGE_ADMIN_TOKEN;
    const esito = await corsaTriage({ force: !!body?.force && tokenOk, max: Number(body?.max) || undefined });
    return NextResponse.json(esito);
}

// conteggi a COUNT head (mai la lista): il select pieno mentiva oltre il cap
// PostgREST di 1000 righe (rilievo revisore)
async function conta(filtro?: (q: any) => any): Promise<number> {
    let q: any = supabase.from("wa_triage").select("*", { count: "exact", head: true });
    if (filtro) q = filtro(q);
    const { count } = await q;
    return count || 0;
}

export async function GET(request: Request) {
    const _g = await accesso(request, "whatsapp/triage");
    if (!_g.ok) return _g.risposta;
    const [{ data: stato }, totale, diVersione, rispondere, attesa, programmate, niente] = await Promise.all([
        supabase.from("wa_triage_stato").select("in_corsa_da, ultima_corsa, ultimo_esito").eq("id", 1).maybeSingle(),
        conta(),
        conta((q) => q.eq("versione", TRIAGE_VERSIONE)),
        conta((q) => q.eq("stato", "rispondere")),
        conta((q) => q.eq("stato", "attesa_cliente")),
        conta((q) => q.eq("stato", "programmata")),
        conta((q) => q.eq("stato", "niente")),
    ]);
    return NextResponse.json({
        versione: TRIAGE_VERSIONE,
        ultima_corsa: stato?.ultima_corsa || null,
        in_corsa_da: stato?.in_corsa_da || null,
        ultimo_esito: stato?.ultimo_esito || null,
        classificate_totali: totale,
        di_versione_corrente: diVersione,
        conteggi: { rispondere, attesa_cliente: attesa, programmata: programmate, niente },
    });
}
