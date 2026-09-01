import { NextResponse } from "next/server";
import { isAdminOrAbove } from "@/lib/roles";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/* ═══ CANCELLARE UNA PRATICA, SUL SERVER ══════════════════════════════════
   Prima lo faceva il browser, e non poteva funzionare del tutto: i depositi
   sono chiusi (dal 31/08 si passa solo dal custode), quindi la rimozione dei
   file dal secchio veniva negata in silenzio e restavano documenti d'identità
   orfani — cioè proprio la cosa che la cancellazione doveva evitare.

   E l'ORDINE contava: si distruggevano i file PRIMA della riga. Se l'ultima
   chiamata falliva, restava una pratica viva con i bottoni «documento
   d'identità» che aprivano il vuoto, per sempre. Qui la pratica muore per
   prima: è l'unica operazione che, fallendo, non lascia macerie.

   ⚠️ E si guardano i SOLDI. Un acconto già incassato ha uno scontrino
   battuto e una riga in contabilità che non nomina la pratica: cancellarla
   vuol dire lasciare del denaro senza il suo motivo. Un buono emesso vive
   solo dentro la pratica: cancellarla è cancellare il credito di un cliente
   che ha il codice in mano. In tutti e due i casi ci si ferma, e lo si dice. */

export async function POST(req: Request) {
    /* la sezione può essere l'una o l'altra: il cancello vero è il RUOLO,
       qui sotto — non si nega la cancellazione di un'assistenza a chi non ha
       anche gli ordini */
    const g = await accesso(req, "pratiche/cancella");
    const g2 = g.ok ? g : await accesso(req, "usati/firma");
    if (!g2.ok) return g.risposta;

    const body = await req.json().catch(() => ({})) as { id?: string; forza?: boolean };
    if (!body.id) return NextResponse.json({ error: "manca la pratica da cancellare" }, { status: 400 });

    const { data: me } = await supabaseAdmin.from("app_users").select("role").eq("id", g2.ok ? g2.sess.id : "").maybeSingle();
    const ruolo = String((me as { role?: string } | null)?.role || "");
    /* L'AIUTANTE DI CASA, NON UNA LISTA QUI DENTRO. La guardia di sicurezza
       vieta gli elenchi di ruoli scritti dentro una route, e faceva fallire il
       build: nessuno poteva più consegnare. `isAdminOrAbove` copre esattamente
       gli stessi quattro ruoli — amministrativo, direttore generale, admin,
       dev — quindi chi può cancellare una pratica non cambia di una virgola. */
    if (!isAdminOrAbove(ruolo)) {
        return NextResponse.json({ error: "solo la direzione può cancellare una pratica." }, { status: 403 });
    }

    const { data: p } = await supabaseAdmin.from("pratiche")
        .select("id, protocollo, client_id, firma, acconto, buono").eq("id", body.id).maybeSingle();
    const pr = p as { protocollo?: string; client_id?: string | null; firma?: Record<string, { path?: string }>; acconto?: { stato?: string; importo?: number }; buono?: { codice?: string; valore?: number } } | null;
    if (!pr) return NextResponse.json({ error: "questa pratica non esiste più." }, { status: 404 });

    const trattieni: string[] = [];
    if (pr.acconto && pr.acconto.stato === "incassato") {
        trattieni.push(`c'è un acconto di ${pr.acconto.importo} € già incassato: lo scontrino resterebbe senza il suo motivo`);
    }
    if (pr.buono && pr.buono.codice) {
        trattieni.push(`è stato emesso il buono ${pr.buono.codice} da ${pr.buono.valore} €: cancellandola sparisce il credito del cliente`);
    }
    if (trattieni.length && !body.forza) {
        return NextResponse.json({ error: null, ferma: trattieni, protocollo: pr.protocollo }, { status: 200 });
    }

    // ① la riga per prima: è l'unica che fallendo non lascia macerie
    const { error } = await supabaseAdmin.from("pratiche").delete().eq("id", body.id);
    if (error) return NextResponse.json({ error: "non sono riuscito a cancellarla: " + error.message }, { status: 500 });

    // ② poi quello che le apparteneva. Se qui qualcosa non va, restano dei file
    //    senza padrone: fastidioso, non pericoloso — e lo diciamo.
    const percorsi = [pr.firma?.firmato?.path, pr.firma?.modulo?.path, pr.firma?.registro?.path, pr.firma?.identita?.path]
        .filter(Boolean) as string[];
    let avanzi: string | null = null;
    if (percorsi.length) {
        const { error: e1 } = await supabaseAdmin.storage.from("pratiche-allegati").remove(percorsi);
        if (e1) avanzi = "i documenti sono rimasti in archivio (" + e1.message + ")";
        const { error: e2 } = await supabaseAdmin.from("contract_attachments")
            .delete().eq("client_id", pr.client_id || "")
            .in("file_url", percorsi.map((x) => `/api/file/pratiche-allegati/${x}`));
        if (e2 && !avanzi) avanzi = "le righe nella scheda cliente sono rimaste (" + e2.message + ")";
    }

    return NextResponse.json({ ok: true, protocollo: pr.protocollo, avanzi });
}
