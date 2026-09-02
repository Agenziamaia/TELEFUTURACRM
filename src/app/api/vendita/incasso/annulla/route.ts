import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ FERMA UN INCASSO CHE NON È MAI PARTITO ═════════════════════════════════
 *
 * Quando l'operatore annulla l'attesa dei contanti, o quando il CRM smette di
 * aspettare dopo quattro minuti, il lavoro in coda restava lì: **vivo**. Il
 * server lo scade solo dopo cinque minuti, e `/api/print/next` serve i lavori
 * dal più vecchio — quindi il tentativo successivo finiva DIETRO a quello
 * abbandonato, e la macchina eseguiva prima il vecchio: il cliente chiamato a
 * pagare due volte, in una finestra fra uno e sei minuti (revisione ostile
 * 02/09).
 *
 * SI ANNULLA SOLO SE È ANCORA IN CODA. Se l'agente l'ha già ritirato (`sent`)
 * la macchina potrebbe avere i soldi in bocca: lì non si tocca niente e si
 * lascia che l'esito arrivi, perché cancellare un incasso che sta avvenendo è
 * peggio del problema che risolve.
 *
 * POST { jobId }
 * ═══════════════════════════════════════════════════════════════════════════ */
export async function POST(req: Request) {
    const g = await accesso(req, "vendita/scontrino");
    if (!g.ok) return g.risposta;

    const b = await req.json().catch(() => ({})) as { jobId?: string };
    if (!b.jobId) return NextResponse.json({ error: "manca il lavoro da fermare" }, { status: 400 });

    const { data, error } = await supabase.from("print_jobs")
        .update({
            status: "error",
            result: JSON.stringify({ ok: false, incassato: 0, resto: 0, errore: true,
                msg: "attesa interrotta dal CRM: il lavoro non era ancora stato ritirato dalla cassa" }),
        })
        .eq("id", b.jobId).eq("kind", "cash_collect").eq("status", "pending")
        .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    /* NIENTE RIGHE = l'agente se l'era già preso: si dice, non si finge. */
    return NextResponse.json({ ok: true, fermato: (data || []).length > 0 });
}
