import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ IL REGISTRO DELLE RICARICHE PAYSTORE ═════════════════════════════════
   Una riga per ricarica venduta, scritta quando la vendita si scrive davvero
   (a scontrino emesso, non al clic).

   ⚠️ PERCHÉ ESISTE GIÀ OGGI, che l'API del fornitore non c'è ancora. Oggi il
   credito lo carica una persona sul terminale PayStore, e senza questa riga
   una ricarica incassata e non erogata sarebbe invisibile: il cliente ha
   pagato, la cassa ha battuto, e da nessuna parte risulta che il credito
   doveva partire. Da domani, con l'API, questa stessa riga nasce
   `da_inviare` e il lavoro automatico la porta a `inviata` o `fallita` —
   nessuno deve rifare il giro.

   ⚠️ NON PASSA DAL BROWSER. `paystore_ricariche` è revocata ad anon e
   authenticated: qui dentro ci sono i numeri di cellulare dei clienti, e il
   browser non ha motivo di poterli leggere tutti. */

type Voce = {
    operatore?: string; operatoreNome?: string; numero?: string;
    taglio?: string; importo?: number; contractId?: string | null;
};

/* Lo stato con cui nasce una ricarica. Oggi 'manuale': la si esegue a mano.
   Quando l'API sarà collegata, questa costante diventa 'da_inviare' e il
   resto del flusso è già al suo posto. */
const STATO_INIZIALE = "manuale";

export async function POST(request: Request) {
    const g = await accesso(request, "vendita/paystore");
    if (!g.ok) return g.risposta;

    let body: { negozio?: string; venditore?: string; azienda?: string | null; voci?: Voce[] };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "corpo non valido" }, { status: 400 }); }

    const voci = Array.isArray(body.voci) ? body.voci : [];
    if (!voci.length) return NextResponse.json({ ok: true, scritte: 0 });

    const righe = [];
    const scartate: { perche: string; voce: Voce }[] = [];
    for (const v of voci) {
        const numero = String(v.numero || "").replace(/\D/g, "");
        const importo = Number(v.importo);
        /* ⚠️ SI SCARTA, NON SI AGGIUSTA. Una ricarica senza numero o senza
           importo non è eseguibile da nessuno — né da una persona né
           dall'API. Scriverla comunque vorrebbe dire mettere in coda un
           lavoro impossibile, e domani il motore ci sbatterebbe la testa a
           ogni giro. Si dice a chi chiama, e quello lo mostra. */
        if (!v.operatore || numero.length < 7 || numero.length > 11 || !(importo > 0)) {
            scartate.push({ perche: !v.operatore ? "operatore mancante" : numero.length < 7 || numero.length > 11 ? "numero non valido" : "importo non valido", voce: v });
            continue;
        }
        righe.push({
            negozio: body.negozio || null,
            venditore: body.venditore || null,
            user_id: g.sess.id,
            operatore: String(v.operatore),
            operatore_nome: v.operatoreNome || null,
            numero,
            taglio: v.taglio || null,
            importo,
            stato: STATO_INIZIALE,
            contract_id: v.contractId || null,
            azienda: body.azienda || null,
        });
    }

    if (!righe.length) return NextResponse.json({ ok: false, scritte: 0, scartate }, { status: 400 });

    const { error } = await supabase.from("paystore_ricariche").insert(righe);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, scritte: righe.length, scartate });
}
