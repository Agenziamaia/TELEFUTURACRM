import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { eseguiRicarica } from "@/lib/paystoreEsegui";
import type { RigaRicarica } from "@/lib/paystoreEsegui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ RIFARE UNA RICARICA, DAL PANNELLO ════════════════════════════════════
   Luca 02/09: «un pulsante che di fatto la rinvia, perché magari ho verificato
   che dal sospeso ora la ricarica va fatta: devo poter cliccare lì e la
   ricarica si collega direttamente all'API di PayStore e la rifà».

   È il motore azionato a mano. Le regole — la chiave di idempotenza scritta
   prima di partire, cosa è definitivo e cosa no, il collaudo che non scrive
   «ok» — stanno in `src/lib/paystoreEsegui.ts`: le stesse identiche che usa il
   lavoro automatico. Qui dentro c'è solo chi può premere il pulsante.

   ⚠️ ERANO SCRITTE QUI, E IL MOTORE AUTOMATICO NE AVREBBE FATTA UNA COPIA.
   Due copie di una logica che eroga denaro divergono al primo ritocco, e la
   seconda la corregge solo chi si ricorda che esiste. */

export async function POST(request: Request) {
    const g = await accesso(request, "paystore");
    if (!g.ok) return g.risposta;

    let b: { id?: string };
    try { b = await request.json(); } catch { return NextResponse.json({ error: "corpo non valido" }, { status: 400 }); }
    if (!b.id) return NextResponse.json({ error: "id mancante" }, { status: 400 });

    const { data: r } = await supabase.from("paystore_ricariche")
        .select("id, operatore, numero, importo, stato, idempotency_key, tentativi, rif_fornitore, negozio, azienda")
        .eq("id", b.id).maybeSingle();
    if (!r) return NextResponse.json({ error: "ricarica non trovata" }, { status: 404 });

    const esito = await eseguiRicarica(r as RigaRicarica);
    if (!esito.ok) {
        return NextResponse.json(
            { error: esito.errore, definitivo: esito.definitivo, correlationId: esito.correlationId },
            { status: esito.stato });
    }
    return NextResponse.json({
        ok: true, gia: esito.gia, collaudo: esito.collaudo, replay: esito.replay,
        operationId: esito.operationId, receiptId: esito.receiptId, saldo: esito.saldo,
    });
}
