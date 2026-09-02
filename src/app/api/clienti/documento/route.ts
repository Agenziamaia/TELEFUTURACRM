import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminOrAbove } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ TOGLIERE UN DOCUMENTO DAL FASCICOLO DI UN CLIENTE ═══════════════════
   Luca 02/09: «io come admin devo poter cancellare dei documenti all'interno
   del fascicolo documenti dentro clienti».

   ⚠️ TRE COSE CHE NON SI POSSONO SBAGLIARE:

   1. UN FILE, NON UNA RIGA. Lo stesso documento d'identità viene agganciato a
      OGNI pratica della vendita: a database sono righe distinte di
      `contract_attachments` che puntano allo STESSO `file_url` — il caso
      D'Atria, dove 4 file sembravano 20. Il fascicolo infatti raggruppa per
      indirizzo del file. Cancellarne una sola lascerebbe il documento a
      schermo: chi ha premuto crede di averlo tolto, e invece è ancora lì.

   2. NON BASTA TOGLIERE LA RIGA. Il file resta in magazzino, e chi si è
      salvato l'indirizzo continua ad aprirlo dal custode: per il custode è un
      file come un altro, e non sa che quella riga non c'è più. Spostandolo in
      «cestino/» l'indirizzo vecchio smette di rispondere.

   3. SI TOGLIE DAL FASCICOLO, NON DAL MONDO. Un contratto firmato cancellato
      per sbaglio è un danno che non si ripara. Prima di togliere, tutto quello
      che serve a rimetterlo a posto viene copiato in
      `contract_attachments_cestino`: le righe, il percorso vecchio, quello
      nuovo, chi ha premuto e perché.

   E il cancello è il RUOLO, non solo la sezione: la scheda cliente la aprono
   in tanti, e chi la apre non deve poter svuotare un fascicolo. */

/** Il percorso dentro il magazzino, ricavato dall'indirizzo salvato.
 *  ⚠️ DUE FORME. Oggi tutte le 7.401 righe passano dal custode dei file
 *  (`/api/file/<deposito>/<percorso>`), che è la porta con cui i depositi sono
 *  stati chiusi al pubblico. Ma i vecchi indirizzi diretti
 *  (`.../storage/v1/object/public/...`) restano validi per il custode, quindi
 *  si riconoscono tutti e due: se qui non si riconoscesse il percorso, il file
 *  resterebbe in magazzino e la riga sparirebbe lo stesso — cioè il documento
 *  diventerebbe irraggiungibile anche per rimetterlo a posto. */
function percorsoDa(url: string): { bucket: string; path: string } | null {
    const pulisci = (b: string, p: string) => {
        try { return { bucket: b, path: decodeURIComponent(p.split("?")[0]) }; }
        catch { return { bucket: b, path: p.split("?")[0] }; }
    };
    const custode = url.match(/^\/api\/file\/([^/]+)\/(.+)$/);
    if (custode) return pulisci(custode[1], custode[2]);
    const diretto = url.match(/\/storage\/v1\/object\/(?:public\/|sign\/)?([^/]+)\/(.+)$/);
    return diretto ? pulisci(diretto[1], diretto[2]) : null;
}

export async function POST(req: Request) {
    const g = await accesso(req, "clienti/documento");
    if (!g.ok) return g.risposta;

    const b = await req.json().catch(() => ({})) as { clientId?: string; fileUrl?: string; motivo?: string };
    if (!b.clientId || !b.fileUrl) {
        return NextResponse.json({ error: "manca il cliente o il documento da togliere" }, { status: 400 });
    }

    const { data: me } = await supabaseAdmin.from("app_users")
        .select("role, full_name").eq("id", g.sess.id).maybeSingle();
    const chi = me as { role?: string; full_name?: string } | null;
    if (!isAdminOrAbove(String(chi?.role || ""))) {
        return NextResponse.json({ error: "solo la direzione può togliere un documento dal fascicolo di un cliente." }, { status: 403 });
    }

    /* ── TUTTE LE RIGHE DI QUEL FILE ────────────────────────────────────
       ⚠️ Si cercano per `file_url`, non per id: è lo stesso documento
       replicato su più pratiche. E si restringe al cliente — per client_id
       oppure attraverso i suoi contratti, perché le righe più vecchie hanno
       solo il contract_id. Senza questo vincolo, un indirizzo passato a mano
       cancellerebbe il documento di un altro cliente. */
    const { data: contratti } = await supabaseAdmin.from("contracts")
        .select("id").eq("client_id", b.clientId);
    const idContratti = ((contratti || []) as { id: string }[]).map((c) => c.id);

    const { data: righeTutte } = await supabaseAdmin.from("contract_attachments")
        .select("id, client_id, contract_id, file_url, file_name, file_type, created_at")
        .eq("file_url", b.fileUrl);
    type Riga = { id: string; client_id: string | null; contract_id: string | null; file_url: string; file_name: string | null; file_type: string | null; created_at: string | null };
    const righe = ((righeTutte || []) as Riga[])
        .filter((r) => r.client_id === b.clientId || (r.contract_id && idContratti.includes(r.contract_id)));

    if (!righe.length) {
        return NextResponse.json({ error: "questo documento non risulta nel fascicolo di questo cliente." }, { status: 404 });
    }
    /* ⚠️ SE LO STESSO FILE È ANCHE DI UN ALTRO CLIENTE, il file in magazzino
       NON si tocca: si tolgono solo le righe di questo fascicolo. Non dovrebbe
       capitare (il percorso contiene l'id del cliente), ma «non dovrebbe» non
       è una garanzia quando dall'altra parte c'è il documento di qualcuno. */
    const anchePerAltri = ((righeTutte || []) as Riga[]).length > righe.length;

    /* ⚠️ PRIMA SI SCRIVE, POI SI TOCCA, POI SI CANCELLA — in quest'ordine.
       Spostare il file e scrivere il cestino dopo vuol dire che, se quella
       scrittura fallisce, il file è già sparito dal suo posto e la riga è
       ancora lì: un documento in elenco che non si apre più, e nessuna traccia
       di dove sia finito. Scrivendo per primo, il caso peggiore è una riga di
       cestino di troppo — che non fa male a nessuno. */
    const luogo = percorsoDa(b.fileUrl);
    const dest = luogo && !anchePerAltri
        ? `cestino/${new Date().toISOString().slice(0, 10)}/${luogo.path.split("/").pop()}`
        : null;

    const { data: messe, error: eCestino } = await supabaseAdmin.from("contract_attachments_cestino").insert(
        righe.map((r) => ({
            attachment_id: r.id,
            client_id: r.client_id, contract_id: r.contract_id,
            file_url: r.file_url, file_name: r.file_name, file_type: r.file_type,
            creato_il: r.created_at,
            storage_path: luogo?.path || null, storage_cestino: dest,
            eliminato_da: g.sess.id, eliminato_da_nome: chi?.full_name || null,
            motivo: (b.motivo || "").trim() || null,
        })),
    ).select("id");
    if (eCestino) {
        return NextResponse.json({ error: "non sono riuscito a mettere il documento nel cestino, quindi non l'ho tolto: " + eCestino.message }, { status: 500 });
    }

    let spostato: string | null = null;
    if (luogo && dest) {
        const { error } = await supabaseAdmin.storage.from(luogo.bucket).move(luogo.path, dest);
        if (!error) spostato = dest;
        else {
            /* il file non c'è più, o si chiama in un altro modo. Non ci si
               ferma — la riga va tolta lo stesso, se no il fascicolo resta con
               un documento che non si apre e nessun modo di levarlo — ma il
               cestino non deve dire che sta in un posto dove non è. */
            await supabaseAdmin.from("contract_attachments_cestino")
                .update({ storage_cestino: null, motivo: ((b.motivo || "").trim() + " · il file non era in magazzino: spostamento non riuscito").trim() })
                .in("id", ((messe || []) as { id: string }[]).map((x) => x.id));
        }
    }

    const { error: eDel } = await supabaseAdmin.from("contract_attachments")
        .delete().in("id", righe.map((r) => r.id));
    if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 });

    return NextResponse.json({
        ok: true, quante: righe.length, spostato: !!spostato,
        nota: anchePerAltri ? "il file resta in magazzino perché è agganciato anche a un altro cliente" : null,
    });
}
