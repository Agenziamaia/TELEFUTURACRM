import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminOrAbove } from "@/lib/roles";
import { capAllowed, capKey, CAP_CLIENTI_ALLEGATI } from "@/lib/capabilities";

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

/** Lo stesso oggetto di magazzino serve anche a un'altra sezione del CRM?
 *  Restituisce il nome della sezione, o `null`.
 *  ⚠️ IL CONTROLLO STA NEL DATABASE (`documento_in_uso_altrove`), non qui:
 *  `pratiche.firma` è `jsonb` e da questa parte non si può cercarci dentro —
 *  una ricerca sbagliata avrebbe risposto «nessuno lo usa» proprio nel caso da
 *  proteggere, cioè il registro firme di una pratica viva.
 *  Se la funzione non risponde si dice che il file è in uso: davanti al dubbio,
 *  non si sposta niente. */
async function serveAncheAltrove(bucket: string, path: string): Promise<string | null> {
    if (bucket !== "usati_attachments" && bucket !== "pratiche-allegati") return null;
    const { data, error } = await supabaseAdmin.rpc("documento_in_uso_altrove", { p_bucket: bucket, p_path: path });
    if (error) return "un'altra sezione (non sono riuscito a verificarlo)";
    return (data as string | null) || null;
}

export async function POST(req: Request) {
    const g = await accesso(req, "clienti/documento");
    if (!g.ok) return g.risposta;

    const b = await req.json().catch(() => ({})) as { clientId?: string; fileUrl?: string; motivo?: string };
    if (!b.clientId || !b.fileUrl) {
        return NextResponse.json({ error: "manca il cliente o il documento da togliere" }, { status: 400 });
    }

    const { data: me } = await supabaseAdmin.from("app_users")
        .select("role, full_name, grade").eq("id", g.sess.id).maybeSingle();
    const chi = me as { role?: string; full_name?: string; grade?: string | null } | null;
    const ruolo = String(chi?.role || "");
    if (!isAdminOrAbove(ruolo)) {
        return NextResponse.json({ error: "solo la direzione può togliere un documento dal fascicolo di un cliente." }, { status: 403 });
    }
    /* ⚠️ E SE GLI HANNO TOLTO IL FASCICOLO DALLA ROTELLINA, non lo può
       svuotare. La schermata nasconde tutto il pannello dietro questa
       capacità; la rotta non la guardava, quindi a chi era stata tolta
       restava aperta la strada dell'indirizzo diretto. */
    if (ruolo !== "admin" && ruolo !== "dev") {
        const chiave = capKey("/clienti", CAP_CLIENTI_ALLEGATI.id);
        const { data: perms } = await supabaseAdmin.from("role_permissions")
            .select("role, perm_key, allowed").eq("perm_key", chiave);
        const righe = (perms || []) as { role: string; perm_key: string; allowed: boolean }[];
        const m = new Map<string, boolean>();
        righe.filter((r) => r.role === ruolo).forEach((r) => m.set(r.perm_key, r.allowed));
        if (chi?.grade) righe.filter((r) => r.role === `${ruolo}@${chi.grade}`).forEach((r) => m.set(r.perm_key, r.allowed));
        righe.filter((r) => r.role === `user:${g.sess.id}`).forEach((r) => m.set(r.perm_key, r.allowed));
        if (!capAllowed(ruolo, "/clienti", CAP_CLIENTI_ALLEGATI, m)) {
            return NextResponse.json({ error: "non hai il fascicolo documenti di questo cliente." }, { status: 403 });
        }
    }

    /* ── TUTTE LE RIGHE DI QUEL FILE, E SOLO QUELLE DI QUESTO CLIENTE ───
       Si cercano per `file_url` e non per id: è lo stesso documento replicato
       su più pratiche. Poi si guarda a chi appartengono davvero.

       ⚠️ IL PONTE DEL CONTRATTO VALE SOLO PER LE RIGHE SENZA PADRONE. Prima
       bastava che una riga citasse un contratto di questo cliente, ANCHE se
       la riga dichiarava un altro `client_id`: e in archivio ce ne sono tre —
       due carte d'identità e un contratto firmato — che appartengono a un
       cliente e citano il contratto di un altro. Aprendo la scheda del
       secondo si cancellava la roba del primo, e si spostava un file che sta
       nella sua cartella. Ora il contratto fa da ponte solo dove il
       `client_id` non c'è, che è il caso per cui il ponte era nato.

       ⚠️ E I CONTRATTI SI CHIEDONO PER ID, NON TUTTI QUELLI DEL CLIENTE: uno
       ne ha 1.036, e sopra il tetto di righe del database la lista sarebbe
       stata troncata in silenzio — cancellazione parziale, senza che niente
       lo dicesse. Qui gli id sono quelli citati dalle poche righe di questo
       file, cioè sempre una manciata. */
    const { data: righeTutte, error: eLeggi } = await supabaseAdmin.from("contract_attachments")
        .select("id, client_id, contract_id, file_url, file_name, file_type, created_at")
        .eq("file_url", b.fileUrl);
    if (eLeggi) return NextResponse.json({ error: "non riesco a leggere il fascicolo: " + eLeggi.message }, { status: 500 });
    type Riga = { id: string; client_id: string | null; contract_id: string | null; file_url: string; file_name: string | null; file_type: string | null; created_at: string | null };
    const tutte = (righeTutte || []) as Riga[];

    const ctrCitati = [...new Set(tutte.map((r) => r.contract_id).filter(Boolean))] as string[];
    const { data: ctr } = ctrCitati.length
        ? await supabaseAdmin.from("contracts").select("id, client_id").in("id", ctrCitati)
        : { data: [] };
    const clienteDelContratto = new Map(((ctr || []) as { id: string; client_id: string | null }[])
        .map((c) => [c.id, c.client_id]));

    const righe = tutte.filter((r) => r.client_id
        ? r.client_id === b.clientId
        : !!r.contract_id && clienteDelContratto.get(r.contract_id) === b.clientId);

    if (!righe.length) {
        return NextResponse.json({ error: "questo documento non risulta nel fascicolo di questo cliente." }, { status: 404 });
    }
    /* ⚠️ SE LO STESSO FILE È ANCHE DI UN ALTRO CLIENTE, il file in magazzino
       NON si tocca: si tolgono solo le righe di questo fascicolo. Non dovrebbe
       capitare (il percorso contiene l'id del cliente), ma «non dovrebbe» non
       è una garanzia quando dall'altra parte c'è il documento di qualcuno. */
    const anchePerAltri = tutte.length > righe.length;

    /* ⚠️ PRIMA SI SCRIVE, POI SI TOCCA, POI SI CANCELLA — in quest'ordine.
       Spostare il file e scrivere il cestino dopo vuol dire che, se quella
       scrittura fallisce, il file è già sparito dal suo posto e la riga è
       ancora lì: un documento in elenco che non si apre più, e nessuna traccia
       di dove sia finito. Scrivendo per primo, il caso peggiore è una riga di
       cestino di troppo — che non fa male a nessuno. */
    /* ⚠️ LO STESSO FILE PUÒ SERVIRE A UN'ALTRA SEZIONE, con un indirizzo
       scritto in un altro modo. Gli Usati salvano il percorso nudo
       («documenti/178…pdf»), le Pratiche lo tengono dentro il JSON della
       firma: `anchePerAltri`, che confronta solo le stringhe di
       `contract_attachments`, non li vedeva. Misurato: 116 allegati degli
       Usati e 5 delle Pratiche puntano a file che compaiono anche qui — fra
       cui un registro firme di una pratica viva. Spostandoli, quelle
       schermate smettevano di aprire il documento, in silenzio. */
    const luogo = percorsoDa(b.fileUrl);
    const altroUso = luogo ? await serveAncheAltrove(luogo.bucket, luogo.path) : null;
    /* ⚠️ IL NOME NEL CESTINO NON DEVE ESSERE INDOVINABILE. Mettendo lo stesso
       nome del file sotto «cestino/<data>/», chi si era salvato il vecchio
       indirizzo lo ricostruiva cambiando una data: e il custode dei file, per
       questo deposito, chiede solo di essere dentro il CRM — cioè quarantotto
       persone, non le sei che possono cancellare. */
    const dest = luogo && !anchePerAltri && !altroUso
        ? `cestino/${new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" })}/${crypto.randomUUID().slice(0, 8)}-${luogo.path.split("/").pop()}`
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
                .update({ storage_cestino: null, motivo: [(b.motivo || "").trim(), "il file non era in magazzino: spostamento non riuscito"].filter(Boolean).join(" · ") })
                .in("id", ((messe || []) as { id: string }[]).map((x) => x.id));
        }
    }

    const { error: eDel } = await supabaseAdmin.from("contract_attachments")
        .delete().in("id", righe.map((r) => r.id));
    if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 });

    return NextResponse.json({
        ok: true, quante: righe.length, spostato: !!spostato,
        /* ⚠️ SE IL FILE NON SI È MOSSO, LO SI DICE. Togliere la riga e lasciare
           il file dov'è vuol dire che l'indirizzo continua a funzionare: chi
           ha premuto deve saperlo, se no crede di aver chiuso una cosa che è
           ancora aperta. */
        nota: anchePerAltri
            ? "Il file resta in magazzino: lo stesso documento è agganciato anche a un altro cliente."
            : altroUso
                ? `Il file resta in magazzino: serve anche a ${altroUso}. La riga è stata tolta da questo fascicolo, ma il documento si apre ancora da lì.`
                : !spostato
                    ? "Il file non era al suo posto in magazzino, quindi non l'ho spostato: se qualcuno ha l'indirizzo vecchio, potrebbe ancora aprirlo."
                    : null,
    });
}
