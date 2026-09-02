import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ IL REGISTRO DELLE RICARICHE PAYSTORE ═════════════════════════════════
   Una riga per ricarica venduta, scritta quando la vendita si scrive davvero
   (a scontrino emesso, non al clic).

   ⚠️ PERCHÉ ESISTE GIÀ OGGI, che l'API del fornitore non c'è ancora. Il
   credito lo carica una persona sul terminale PayStore, e senza questa riga
   una ricarica incassata e non erogata sarebbe invisibile: il cliente ha
   pagato, la cassa ha battuto, e da nessuna parte risulterebbe che il credito
   deve ancora partire. Ogni ricarica nasce «DA FARE» e ci resta finché
   qualcuno non dice il contrario — a mano oggi, dal motore quando l'API sarà
   collegata.

   ⚠️ E QUESTA SCRITTURA PUÒ FALLIRE. È successo il primo giorno: la colonna
   `contract_id` era dichiarata `uuid` mentre gli id dei contratti sono testo,
   quindi ogni inserimento moriva e il registro restava vuoto mentre i negozi
   vendevano. Da allora il registro si ripara da solo leggendo le vendite
   scontrinate (`recuperaScontrinate` in /api/paystore/registro): questa
   rotta è la strada normale, non l'unica.

   ⚠️ NON PASSA DAL BROWSER. `paystore_ricariche` è revocata ad anon e
   authenticated: qui dentro ci sono i numeri di cellulare dei clienti, e il
   browser non ha motivo di poterli leggere tutti. */

type Voce = {
    operatore?: string; operatoreNome?: string; numero?: string;
    taglio?: string; importo?: number; contractId?: string | null; conAttivazione?: boolean;
};

/* Ogni ricarica nasce IN SOSPESO: scontrinata e incassata, credito non ancora
   caricato. Diventa «ok automatico» quando l'API la esegue, «ok manuale»
   quando la carica una persona.
   ⚠️ Questo valore deve stare nella lista di `STATI_RICARICA`: il database ha
   un CHECK, e uno stato fuori lista fa fallire l'inserimento — cioè fa
   sparire la ricarica dal registro, in silenzio. */
const STATO_INIZIALE = "sospeso";

export async function POST(request: Request) {
    const g = await accesso(request, "vendita/paystore");
    if (!g.ok) return g.risposta;

    let body: { negozio?: string; venditore?: string; azienda?: string | null; soleRicariche?: boolean; voci?: Voce[] };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "corpo non valido" }, { status: 400 }); }

    const voci = Array.isArray(body.voci) ? body.voci : [];
    if (!voci.length) return NextResponse.json({ ok: true, scritte: 0 });

    /* ⚠️ LA SOCIETÀ LA DECIDE QUI, non il browser. `marg_items.azienda` è
       NULL su tutte le voci PayStore — di proposito, perché la ricarica segue
       l'attivazione — quindi il client non ha niente da mandare e la colonna
       restava sempre vuota: il registro non poteva dire con quale partita IVA
       era stata fatturata una ricarica, che è esattamente il dato per cui la
       regola di Donna esiste.
       È la STESSA regola dello scontrino: sole ricariche + negozio con due
       registratori PROPRI (uno solo ce l'ha: Donna) → Telefutura SRL;
       altrimenti la società del negozio. */
    let azienda: string | null = body.azienda || null;
    /* ⚠️ SOLO SE IL CARRELLO ERA DI SOLE RICARICHE. Con un carrello misto la
       società la decide la MERCE, e quella la sa solo lo scontrino: scrivere
       qui il default del negozio darebbe un registro che dice T2 mentre il
       documento dice T1. Meglio lasciare vuoto: «non lo so» è un dato onesto,
       una società sbagliata no. */
    if (!azienda && body.negozio && body.soleRicariche) {
        const { data: rt } = await supabase.from("pos_rt").select("azienda, is_default").eq("negozio", body.negozio);
        const proprie = [...new Set((rt || []).map((r: { azienda: string }) => r.azienda))];
        const def = (rt || []).find((r: { is_default: boolean }) => r.is_default)?.azienda || proprie[0] || null;
        azienda = proprie.length > 1 && proprie.includes("T1") ? "T1" : def;
    }

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
            con_attivazione: v.conAttivazione ?? null,
            azienda,
        });
    }

    if (!righe.length) return NextResponse.json({ ok: false, scritte: 0, scartate }, { status: 400 });

    const { error } = await supabase.from("paystore_ricariche").insert(righe);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, scritte: righe.length, scartate });
}
