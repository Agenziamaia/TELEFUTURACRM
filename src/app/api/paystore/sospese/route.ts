import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ QUANTE RICARICHE ASPETTANO UNA MANO ══════════════════════════════════
   Luca 02/09: «per quanto riguarda l'amministrativa deve dargli anche un
   pop-up alla destra della scritta PayStore sul menu di sinistra, come per le
   chat, con il numero di ricariche che sono in sospeso e che sono quindi da
   gestire manualmente».

   ⚠️ SOLO IL NUMERO. Il conteggio lo fa il server perché `paystore_ricariche`
   è revocata al browser — lì dentro ci sono i numeri di cellulare dei
   clienti — ma per un pallino nel menu non serve altro che una cifra, e una
   cifra non racconta niente di nessuno. */
export async function GET(request: Request) {
    const g = await accesso(request, "paystore");
    if (!g.ok) return g.risposta;
    const { count } = await supabase.from("paystore_ricariche")
        .select("id", { count: "exact", head: true })
        .eq("stato", "sospeso");
    return NextResponse.json({ ok: true, sospese: count ?? 0 });
}
