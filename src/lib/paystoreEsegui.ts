import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { ricaricaTelefonica, operazione, listini, prodotti, nuovaChiaveIdempotenza, inCollaudo } from "@/lib/paystore";
import type { Credenziale } from "@/lib/paystore";
import { credenzialeDi } from "@/lib/paystoreCredenziali";

/* ═══ ESEGUIRE UNA RICARICA ════════════════════════════════════════════════
   Il gesto che eroga il credito, in un posto solo. Lo usano il pulsante
   «rifai» del pannello e il motore automatico.

   ⚠️ PERCHÉ NON DUE COPIE. Qui dentro c'è la regola su quando ritentare e
   quando no, su quando una ricarica è «fatta» e su quando l'esito è ignoto:
   sono le tre cose che, sbagliate, erogano un credito due volte o ne dichiarano
   erogato uno che non è partito. Due copie di questa logica divergono al primo
   ritocco, e la seconda la corregge solo chi si ricorda che esiste.

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

export type RigaRicarica = {
    id: string; operatore: string; numero: string; importo: number;
    stato: string; idempotency_key: string | null; tentativi: number;
    rif_fornitore: string | null; negozio: string | null; azienda: string | null;
    /* ⚠️ SERVONO A DECIDERE SE SI PUÒ PARTIRE, e mancavano. Le regole di
       ammissibilità vivevano solo nella presa in SQL: dal pulsante «rifai» si
       poteva quindi erogare credito su una ricarica il cui scontrino non è mai
       uscito (l'incasso non è provato) o su un conto tenuto in sospeso, cioè
       merce non pagata. «Le regole in un posto solo» valeva per l'idempotenza,
       non per chi ha diritto di partire. */
    scontrino_stato?: string | null; nota?: string | null; ambiente?: string | null;
};

/** Le colonne che servono a eseguire: una sola lista, così il pulsante e il
 *  motore non possono leggerne due diverse. */
export const COLONNE_ESEGUI =
    "id, operatore, numero, importo, stato, idempotency_key, tentativi, rif_fornitore, negozio, azienda, scontrino_stato, nota, ambiente";

export type EsitoEsecuzione =
    | { ok: true; gia?: true; collaudo: boolean; replay: boolean; operationId?: number; receiptId?: string | null; saldo?: number }
    | { ok: false; errore: string; definitivo: boolean; stato: number; correlationId?: string };

/** Il listino di PayStore per quell'operatore e quell'importo.
 *  ⚠️ Si legge dal catalogo, mai scritto nel codice: i `priceListId` cambiano
 *  nel tempo e sono diversi da cliente a cliente — lo dice il loro manuale. */
async function trovaListino(operatore: string, importo: number, cred: Credenziale): Promise<{ id: number } | { errore: string }> {
    const { data: voce } = await supabase.from("marg_items")
        .select("paystore_product_id").eq("paystore_operatore", operatore).maybeSingle();
    const productId = (voce as { paystore_product_id?: number } | null)?.paystore_product_id;

    if (productId) {
        const l = await listini(productId, cred);
        if (l.ok) {
            const t = (l.dati || []).find((x) => Math.abs(Number(x.faceAmount) - importo) < 0.005);
            if (t) return { id: t.priceListId };
            return { errore: `PayStore non ha un taglio da ${importo} € per questo operatore` };
        }
        return { errore: l.descrizione || l.errore };
    }

    /* il prodotto non è ancora agganciato: si cerca per nome fra quelli del
       servizio delle ricariche telefoniche */
    const p = await prodotti(1, cred);
    if (!p.ok) return { errore: p.descrizione || p.errore };
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const cand = (p.dati || []).find((x) => norm(String(x.name || "")).startsWith(norm(operatore).slice(0, 4)));
    if (!cand) return { errore: `non trovo l'operatore «${operatore}» nel catalogo PayStore` };
    const l = await listini(cand.productId, cred);
    if (!l.ok) return { errore: l.descrizione || l.errore };
    const t = (l.dati || []).find((x) => Math.abs(Number(x.faceAmount) - importo) < 0.005);
    if (!t) return { errore: `PayStore non ha un taglio da ${importo} € per ${cand.name}` };
    return { id: t.priceListId };
}

export async function eseguiRicarica(riga: RigaRicarica, opz?: { tetto?: number }): Promise<EsitoEsecuzione> {
    if (riga.stato === "ok_automatico" || riga.stato === "ok_manuale") {
        return { ok: false, errore: "questa ricarica risulta già fatta: se serve rifarla, rimettila prima in sospeso", definitivo: true, stato: 400 };
    }
    const numero = String(riga.numero || "").replace(/\D/g, "");
    if (numero.length < 7 || numero.length > 11) {
        return { ok: false, errore: "manca il numero da ricaricare: scrivilo prima di eseguire", definitivo: true, stato: 400 };
    }
    /* ── SI PUÒ PARTIRE? Le stesse regole della presa automatica, qui, così
       valgono anche per il pulsante. Erano solo in SQL. ─────────────────── */
    if (riga.scontrino_stato !== undefined && riga.scontrino_stato !== "emesso") {
        return {
            ok: false, definitivo: true, stato: 409,
            errore: `lo scontrino di questa ricarica non è stato emesso (${riga.scontrino_stato || "nessuno"}): l'incasso non è provato. Sistema prima lo scontrino.`,
        };
    }
    if (String(riga.nota || "").toUpperCase().includes("SOSPESO")) {
        return {
            ok: false, definitivo: true, stato: 409,
            errore: "questa ricarica è su un CONTO IN SOSPESO: il cliente non ha ancora pagato. Non si carica il credito finché la vendita non è chiusa.",
        };
    }
    if (!(Number(riga.importo) > 0)) {
        return { ok: false, definitivo: true, stato: 400, errore: "l'importo della ricarica non è valido" };
    }
    if (opz?.tetto != null && Number(riga.importo) > opz.tetto) {
        return { ok: false, definitivo: true, stato: 409, errore: `${riga.importo} € supera il tetto di ${opz.tetto} € per ricarica.` };
    }

    /* ⚠️ LA CREDENZIALE PRIMA DI TOCCARE LA RIGA. Si sceglie sul negozio che ha
       venduto e sulla società della cassa; se non c'è ci si ferma, perché
       l'unica alternativa sarebbe scaricare il credito di un altro punto
       vendita. E si sceglie prima, così un tentativo che non può partire non
       lascia dietro di sé un contatore incrementato. */
    const cr = await credenzialeDi(riga.negozio, riga.azienda);
    if (!cr.ok) return { ok: false, errore: cr.errore, definitivo: true, stato: 503 };
    const cred = cr.cred;

    /* ⚠️ SE C'È GIÀ UN'OPERAZIONE, PRIMA SI GUARDA COM'È ANDATA. Un tentativo
       precedente può essere partito senza che la risposta ci sia arrivata:
       rilanciarlo alla cieca è il modo di erogare due crediti. */
    /* ⚠️ E SOLO DENTRO LO STESSO AMBIENTE. In collaudo si scrive comunque il
       `rif_fornitore`, che è un numero dello spazio di prova. Riletto in
       produzione, dove gli id sono progressivi, poteva combaciare con
       un'operazione VERA di qualcun altro: la riga sarebbe stata marcata «già
       eseguita» e il credito non sarebbe partito mai. Il cliente ha pagato e
       non ha niente — l'errore peggiore dei due. */
    const ambienteOra = inCollaudo(cred);
    const stessoAmbiente = !riga.ambiente || riga.ambiente === (ambienteOra ? "collaudo" : "produzione");
    if (riga.rif_fornitore && stessoAmbiente) {
        const op = await operazione(Number(riga.rif_fornitore), cred);
        if (op.ok && String(op.dati?.status || "").toLowerCase() === "success") {
            await supabase.from("paystore_ricariche").update({
                stato: "ok_automatico", inviata_il: new Date().toISOString(),
                nota: "risultava già eseguita da PayStore: riconciliata",
            }).eq("id", riga.id);
            return { ok: true, gia: true, collaudo: false, replay: false, operationId: op.dati?.operationId };
        }
    }

    // la chiave si scrive PRIMA di partire, e non cambia più
    const chiave = riga.idempotency_key || nuovaChiaveIdempotenza();
    const collaudo = ambienteOra;
    const { error: eChiave } = await supabase.from("paystore_ricariche").update({
        idempotency_key: chiave,
        tentata_il: new Date().toISOString(),
        tentativi: (riga.tentativi || 0) + 1,
        ambiente: collaudo ? "collaudo" : "produzione",
    }).eq("id", riga.id);
    /* ⚠️ SE LA CHIAVE NON SI È SCRITTA, NON SI PARTE. Su questa unica scrittura
       poggia tutta la difesa contro il doppio credito: se resta solo in memoria
       e il server muore fra la chiamata e la risposta, il tentativo successivo
       ne genera una nuova e PayStore eroga una seconda volta. E il client di
       Supabase non solleva eccezioni: un errore di rete torna dentro `error`,
       che qui veniva buttato via. */
    if (eChiave) {
        return {
            ok: false, definitivo: true, stato: 500,
            errore: `non riesco a salvare la chiave di sicurezza della ricarica (${eChiave.message}): non parto, se no rischio di erogarla due volte.`,
        };
    }

    const listino = await trovaListino(riga.operatore, Number(riga.importo), cred);
    if ("errore" in listino) {
        await supabase.from("paystore_ricariche").update({ errore: listino.errore }).eq("id", riga.id);
        return { ok: false, errore: listino.errore, definitivo: true, stato: 422 };
    }

    const esito = await ricaricaTelefonica({
        priceListId: listino.id, phoneNumber: numero,
        externalReference: "TF-" + riga.id.slice(0, 8).toUpperCase(),
        idempotencyKey: chiave, cred,
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
                : `eseguita via API con il plafond di ${cr.identificativo}${esito.replay ? " (risposta già ricevuta, non è stata rifatta)" : ""}`,
        }).eq("id", riga.id);
        return { ok: true, collaudo, replay: !!esito.replay, operationId: d.operationId, receiptId: d.receiptId, saldo: d.balanceAfter };
    }

    /* ── NON È ANDATA. Definitivo o ignoto? ─────────────────────────────── */
    if (esito.definitivo) {
        await supabase.from("paystore_ricariche").update({
            stato: "fallita",
            errore: `${esito.errore}${esito.descrizione ? ": " + esito.descrizione : ""}`,
        }).eq("id", riga.id);
        return { ok: false, errore: esito.descrizione || esito.errore, definitivo: true, stato: 422, correlationId: esito.correlationId };
    }

    /* esito IGNOTO: la ricarica può essere partita. Non si marca fallita — si
       lascia in sospeso con l'errore scritto, e il prossimo tentativo userà la
       stessa chiave. */
    await supabase.from("paystore_ricariche").update({
        errore: `esito non ricevuto (${esito.errore}): riprovare o riconciliare`,
    }).eq("id", riga.id);
    return {
        ok: false, definitivo: false, stato: 503, correlationId: esito.correlationId,
        errore: "Non ho ricevuto l'esito da PayStore. La ricarica POTREBBE essere partita: riprova fra poco — il secondo tentativo usa la stessa chiave e non ne fa una seconda.",
    };
}
