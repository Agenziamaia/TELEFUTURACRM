import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { ricaricaTelefonica, operazione, listini, prodotti, nuovaChiaveIdempotenza, inCollaudo, configurato } from "@/lib/paystore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ RIFARE UNA RICARICA, DAL PANNELLO ════════════════════════════════════
   Luca 02/09: «un pulsante che di fatto la rinvia, perché magari ho verificato
   che dal sospeso ora la ricarica va fatta: devo poter cliccare lì e la
   ricarica si collega direttamente all'API di PayStore e la rifà».

   È il motore, azionato a mano. Quando le credenziali di produzione
   arriveranno, la stessa funzione la userà anche il lavoro automatico: la
   differenza sarà solo chi preme il pulsante.

   ⚠️ TRE COSE CHE NON SI POSSONO SBAGLIARE, in ordine di gravità:

   1. LA CHIAVE DI IDEMPOTENZA SI SCRIVE PRIMA DI PARTIRE. Se il server cade
      fra la chiamata e la risposta, il tentativo successivo deve usare la
      STESSA chiave: PayStore restituisce l'esito originale invece di erogare
      un secondo credito. Generarla al momento della chiamata e tenerla in
      memoria non basta — un riavvio la perde, e il cliente riceve due
      ricariche.

   2. UN 422 È DEFINITIVO, UN 503 NO. Sul primo la ricarica non avverrà mai e
      ritentare è solo un modo per sporcare il registro. Sul secondo — e su
      qualunque errore di rete — l'esito è IGNOTO: la ricarica potrebbe essere
      partita, quindi si riconcilia con GET /operations/{id} prima di dire che
      è fallita. Chiamare «fallita» una ricarica partita è il modo di erogarne
      due.

   3. IN COLLAUDO NON SI SCRIVE «OK». Con le credenziali `ps_test_` nessun
      credito parte davvero: segnare la riga come eseguita sarebbe un dato
      falso su una ricarica che il cliente ha pagato. Si dice che è stata una
      prova e lo stato resta quello che era. */

type Riga = {
    id: string; operatore: string; numero: string; importo: number;
    stato: string; idempotency_key: string | null; tentativi: number;
    rif_fornitore: string | null;
};

/** Il listino di PayStore per quell'operatore e quell'importo.
 *  ⚠️ Si legge dal catalogo, mai scritto nel codice: i `priceListId` cambiano
 *  nel tempo e sono diversi da cliente a cliente — lo dice il loro manuale. */
async function trovaListino(operatore: string, importo: number): Promise<{ id: number } | { errore: string }> {
    const { data: voce } = await supabase.from("marg_items")
        .select("paystore_product_id").eq("paystore_operatore", operatore).maybeSingle();
    const productId = (voce as { paystore_product_id?: number } | null)?.paystore_product_id;

    if (productId) {
        const l = await listini(productId);
        if (l.ok) {
            const t = (l.dati || []).find((x) => Math.abs(Number(x.faceAmount) - importo) < 0.005);
            if (t) return { id: t.priceListId };
            return { errore: `PayStore non ha un taglio da ${importo} € per questo operatore` };
        }
        return { errore: l.descrizione || l.errore };
    }

    /* il prodotto non è ancora agganciato: si cerca per nome fra quelli del
       servizio delle ricariche telefoniche */
    const p = await prodotti(1);
    if (!p.ok) return { errore: p.descrizione || p.errore };
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const cand = (p.dati || []).find((x) => norm(String(x.name || "")).startsWith(norm(operatore).slice(0, 4)));
    if (!cand) return { errore: `non trovo l'operatore «${operatore}» nel catalogo PayStore` };
    const l = await listini(cand.productId);
    if (!l.ok) return { errore: l.descrizione || l.errore };
    const t = (l.dati || []).find((x) => Math.abs(Number(x.faceAmount) - importo) < 0.005);
    if (!t) return { errore: `PayStore non ha un taglio da ${importo} € per ${cand.name}` };
    return { id: t.priceListId };
}

export async function POST(request: Request) {
    const g = await accesso(request, "paystore");
    if (!g.ok) return g.risposta;
    if (!configurato()) return NextResponse.json({ error: "PayStore non è configurato su questo server" }, { status: 503 });

    let b: { id?: string };
    try { b = await request.json(); } catch { return NextResponse.json({ error: "corpo non valido" }, { status: 400 }); }
    if (!b.id) return NextResponse.json({ error: "id mancante" }, { status: 400 });

    const { data: r } = await supabase.from("paystore_ricariche")
        .select("id, operatore, numero, importo, stato, idempotency_key, tentativi, rif_fornitore")
        .eq("id", b.id).maybeSingle();
    if (!r) return NextResponse.json({ error: "ricarica non trovata" }, { status: 404 });
    const riga = r as Riga;

    if (riga.stato === "ok_automatico" || riga.stato === "ok_manuale")
        return NextResponse.json({ error: "questa ricarica risulta già fatta: se serve rifarla, rimettila prima in sospeso" }, { status: 400 });
    const numero = String(riga.numero || "").replace(/\D/g, "");
    if (numero.length < 7 || numero.length > 11)
        return NextResponse.json({ error: "manca il numero da ricaricare: scrivilo prima di eseguire" }, { status: 400 });

    /* ⚠️ SE C'È GIÀ UN'OPERAZIONE, PRIMA SI GUARDA COM'È ANDATA. Un tentativo
       precedente può essere partito senza che la risposta ci sia arrivata:
       rilanciarlo alla cieca è il modo di erogare due crediti. */
    if (riga.rif_fornitore) {
        const op = await operazione(Number(riga.rif_fornitore));
        if (op.ok && String(op.dati?.status || "").toLowerCase() === "success") {
            await supabase.from("paystore_ricariche").update({
                stato: "ok_automatico", inviata_il: new Date().toISOString(),
                nota: "risultava già eseguita da PayStore: riconciliata",
            }).eq("id", riga.id);
            return NextResponse.json({ ok: true, gia: true, operationId: op.dati?.operationId });
        }
    }

    // la chiave si scrive PRIMA di partire, e non cambia più
    const chiave = riga.idempotency_key || nuovaChiaveIdempotenza();
    const collaudo = inCollaudo();
    await supabase.from("paystore_ricariche").update({
        idempotency_key: chiave,
        tentata_il: new Date().toISOString(),
        tentativi: (riga.tentativi || 0) + 1,
        ambiente: collaudo ? "collaudo" : "produzione",
    }).eq("id", riga.id);

    const listino = await trovaListino(riga.operatore, Number(riga.importo));
    if ("errore" in listino) {
        await supabase.from("paystore_ricariche").update({ errore: listino.errore }).eq("id", riga.id);
        return NextResponse.json({ error: listino.errore }, { status: 422 });
    }

    const esito = await ricaricaTelefonica({
        priceListId: listino.id, phoneNumber: numero,
        externalReference: "TF-" + riga.id.slice(0, 8).toUpperCase(),
        idempotencyKey: chiave,
    });

    if (esito.ok) {
        const d = esito.dati;
        /* in collaudo NON si scrive «fatta»: nessun credito è partito davvero,
           e una riga verde su una ricarica non erogata è peggio di una riga
           gialla su una eseguita */
        await supabase.from("paystore_ricariche").update({
            ...(collaudo ? {} : { stato: "ok_automatico", inviata_il: new Date().toISOString() }),
            rif_fornitore: String(d.operationId),
            errore: null,
            nota: collaudo
                ? `PROVA in collaudo: operazione ${d.operationId}, ricevuta ${d.receiptId}. Nessun credito erogato.`
                : `eseguita via API${esito.replay ? " (risposta già ricevuta, non è stata rifatta)" : ""}`,
        }).eq("id", riga.id);
        return NextResponse.json({
            ok: true, collaudo, replay: !!esito.replay,
            operationId: d.operationId, receiptId: d.receiptId, saldo: d.balanceAfter,
        });
    }

    /* ── NON È ANDATA. Definitivo o ignoto? ─────────────────────────────── */
    if (esito.definitivo) {
        await supabase.from("paystore_ricariche").update({
            stato: "fallita",
            errore: `${esito.errore}${esito.descrizione ? ": " + esito.descrizione : ""}`,
        }).eq("id", riga.id);
        return NextResponse.json({ error: esito.descrizione || esito.errore, definitivo: true, correlationId: esito.correlationId }, { status: 422 });
    }

    /* esito IGNOTO: la ricarica può essere partita. Non si marca fallita — si
       lascia in sospeso con l'errore scritto, e il prossimo tentativo userà la
       stessa chiave. */
    await supabase.from("paystore_ricariche").update({
        errore: `esito non ricevuto (${esito.errore}): riprovare o riconciliare`,
    }).eq("id", riga.id);
    return NextResponse.json({
        error: "Non ho ricevuto l'esito da PayStore. La ricarica POTREBBE essere partita: riprova fra poco — il secondo tentativo usa la stessa chiave e non ne fa una seconda.",
        definitivo: false, correlationId: esito.correlationId,
    }, { status: 503 });
}
