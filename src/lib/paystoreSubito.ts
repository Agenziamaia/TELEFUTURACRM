import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { eseguiRicarica, COLONNE_ESEGUI, type RigaRicarica } from "@/lib/paystoreEsegui";
import { stessoMagazzino } from "@/lib/negoziNomi";
import { parametriAutomatismo } from "@/lib/automatismiConfig";

/* ═══ IL CREDITO PARTE QUANDO ESCE LO SCONTRINO ════════════════════════════
   Luca 04/09: «aspettiamo veramente troppo tempo per farle queste ricariche,
   dovremmo implementare un processo un po' più veloce».

   Aveva ragione, ed era per costruzione: il motore gira ogni cinque minuti e
   prende al massimo dieci righe per giro. Fra lo scontrino e il credito
   potevano passare cinque minuti — con il cliente al banco che aspetta, o che
   se ne va e scopre dopo se il credito è arrivato.

   Adesso il momento giusto è quello vero: quando il registratore risponde «ho
   stampato», la ricarica di quello scontrino parte subito. Il giro dei cinque
   minuti resta, ma cambia mestiere: da unico modo di eseguire diventa la rete
   di sicurezza per quelle che qui sfuggono.

   ⚠️ LE PROTEZIONI SONO LE STESSE, TUTTE. Non si passa accanto al motore, si
   passa dentro la sua stessa funzione: `eseguiRicarica` continua a fare il
   controllo della riga doppia, la chiave di idempotenza scritta prima di
   partire, il tetto per singola ricarica, il rifiuto se lo scontrino non
   risulta. Qui cambia solo QUANDO viene chiamata.

   ⚠️ E NON DEVE MAI FAR FALLIRE LA STAMPA. Se qualcosa qui va storto, lo
   scontrino resta stampato e la ricarica torna a essere lavoro del motore: per
   questo tutto è dentro un try, e chi chiama non aspetta la risposta. Una cassa
   che si blocca perché PayStore è lento sarebbe un guaio molto peggiore di una
   ricarica che parte cinque minuti dopo. */

/** I numeri di telefono stampati su uno scontrino: la descrizione delle righe
 *  di ricarica finisce con il numero, ed è quello che il cliente legge. */
function numeriSulloScontrino(xml: string): Set<string> {
    const out = new Set<string>();
    for (const m of String(xml || "").matchAll(/description="([^"]*?)"/g)) {
        const n = m[1].match(/\b(\d{7,11})\s*$/)?.[1];
        if (n) out.add(n);
    }
    return out;
}

/** Fa partire le ricariche dello scontrino appena stampato.
 *  Non solleva mai: al peggio non fa niente e resta il motore. */
export async function ricaricheDelloScontrino(jobId: string): Promise<void> {
    try {
        const { data: j } = await supabase.from("print_jobs")
            .select("id, negozio, created_at, kind, status, meta, request_xml").eq("id", jobId).maybeSingle();
        const job = j as { negozio: string; created_at: string; kind: string; status: string; meta: Record<string, unknown> | null; request_xml: string } | null;
        if (!job || job.status !== "done") return;
        if (job.kind !== "fiscal_receipt" && job.kind !== "fiscal") return;

        const numeri = numeriSulloScontrino(job.request_xml);
        if (!numeri.size) return;                       // niente ricariche su questo scontrino

        /* ⚠️ IL TETTO PER SINGOLA RICARICA È QUELLO DEL MOTORE, non un numero
           scritto qui: due tetti diversi per la stessa cosa è il modo più
           semplice di ritrovarsi con una regola che nessuno sa più quale sia. */
        const p = await parametriAutomatismo("paystore-motore");
        const acceso = p.acceso === true || p.acceso === "true";
        if (!acceso) return;                            // motore spento: non si eroga niente
        const n = Number((p as Record<string, unknown>).tetto);
        const tetto = Number.isFinite(n) && n >= 1 && n <= 500 ? Math.round(n) : 50;

        const t = new Date(job.created_at).getTime();
        const { data: righe } = await supabase.from("paystore_ricariche")
            .select(COLONNE_ESEGUI + ", creata_il")
            .eq("stato", "sospeso")
            .gte("creata_il", new Date(t - 15 * 60000).toISOString())
            .lte("creata_il", new Date(t + 5 * 60000).toISOString())
            .limit(20);

        const mie = ((righe || []) as unknown as (RigaRicarica & { negozio: string | null; nota: string | null })[])
            .filter((r) => stessoMagazzino(String(r.negozio || ""), job.negozio))
            .filter((r) => numeri.has(String(r.numero || "").replace(/\D/g, "")))
            .filter((r) => !String(r.nota || "").toUpperCase().includes("SOSPESO"));
        if (!mie.length) return;

        for (const r of mie) {
            /* ⚠️ LO SCONTRINO LO SAPPIAMO ADESSO, e va scritto PRIMA di
               eseguire: `eseguiRicarica` rifiuta le righe senza scontrino
               emesso, e qui la prova ce l'abbiamo in mano — l'ha appena detto
               il registratore. Senza questa riga la ricarica verrebbe rifiutata
               da sé stessa. */
            await supabase.from("paystore_ricariche")
                .update({ scontrino_stato: "emesso", scontrino_emesso: true })
                .eq("id", r.id).eq("stato", "sospeso");
            await eseguiRicarica({ ...r, scontrino_stato: "emesso" }, { tetto });
        }
    } catch {
        /* vedi sopra: la stampa non si tocca. Il motore ripasserà. */
    }
}
