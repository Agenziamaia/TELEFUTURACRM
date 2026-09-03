import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { stessoMagazzino } from "@/lib/negoziNomi";
import { isAdminOrAbove } from "@/lib/roles";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { leggiRicaricaDaProdotto, eRicaricaSenzaNumero, nomeOperatoreCorto, NOMI_OPERATORE, eStatoValido } from "@/lib/paystore";
import { percheNonParte, type RigaDaPesare } from "@/lib/paystorePerche";
import { parametriAutomatismo } from "@/lib/automatismiConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ IL REGISTRO PAYSTORE, LATO AMMINISTRAZIONE ═══════════════════════════
   Due cose che dal browser non si possono fare da sole:
   • LEGGERE le ricariche vendute — la tabella è revocata ad anon e
     authenticated perché contiene i numeri di cellulare dei clienti;
   • CAMBIARE i tagli — sono configurazione, e dal browser sono in sola
     lettura (un utente qualunque non deve poter svuotare il listino).

   ⚠️ IL PERIODO E IL CONFRONTO SI CALCOLANO QUI, come per la spesa dell'AI:
   la schermata mostra numeri, non li costruisce. */

type Riga = {
    id: string; creata_il: string; negozio: string | null; venditore: string | null;
    operatore: string; operatore_nome: string | null; numero: string;
    taglio: string | null; importo: number; stato: string; errore: string | null;
    /* con quale partita IVA è stata fatturata. Vuota quando il carrello era
       misto: lì la società la decide la merce, e la sa solo lo scontrino. */
    azienda: string | null;
    /* nata con una SIM o venduta da sola */
    con_attivazione: boolean | null;
    /* lo scontrino è uscito davvero? e con quale reparto? */
    scontrino_emesso: boolean | null; scontrino_errore: string | null; reparto_usato: number | null;
    /* emesso · errore · in_pausa · null (non lo sappiamo) */
    scontrino_stato: string | null;
    /* servono per dire PERCHÉ una sospesa non parte: il contratto identifica lo
       scontrino (e quindi le righe gemelle), la presa dice se il motore la sta
       già lavorando proprio adesso */
    contract_id: string | null; nota: string | null; motore_preso_il: string | null;
};

const giorno = (iso: string) => iso.slice(0, 10);

function giorniFra(da: string, a: string): string[] {
    const out: string[] = [];
    const d = new Date(da + "T00:00:00Z"), fine = new Date(a + "T00:00:00Z");
    while (d <= fine) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
    return out.slice(-186);
}

async function recuperaScontrinate(da: string, a: string) {
    try {
        const { data: vendite } = await supabase.from("contracts")
            .select("id, prodotto, negozio, venditore, created_at, dettagli")
            .ilike("prodotto", "Ricarica%")
            .gte("created_at", da + "T00:00:00Z").lte("created_at", a + "T23:59:59Z")
            .order("creata_il", { ascending: false }).limit(5000);
        if (!vendite?.length) return;

        const ids = vendite.map((v) => v.id);
        /* ⚠️ NON BASTA IL `contract_id`. Quando la ricarica è venduta insieme
           a una SIM, la riga del registro nasceva legata all'id del CONTRATTO
           (CTR-) invece che alla sua riga di vendita (EXT-): il recupero non
           la riconosceva e ne creava una seconda, con l'importo totale invece
           dei singoli tagli. Sei doppioni in mezza giornata.
           Il legame è stato corretto alla fonte, ma qui serve comunque una
           rete: si guarda anche se per quel NUMERO, in quel momento, il
           registro ha già righe che coprono l'importo. Una ricarica registrata
           due volte è peggio di una registrata una volta sola in modo
           imperfetto — la seconda la si nota, la prima no. */
        const { data: gia } = await supabase.from("paystore_ricariche")
            .select("contract_id, numero, importo, creata_il, negozio")
            .gte("creata_il", da + "T00:00:00Z").lte("creata_il", a + "T23:59:59Z")
            .order("creata_il", { ascending: false }).limit(20000);
        const visti = new Set((gia || []).map((r) => r.contract_id).filter(Boolean));
        /* quanto risulta già registrato per quel numero (o per quel negozio,
           se il numero manca) attorno a quel momento: tre minuti bastano —
           le righe del flusso normale nascono nello stesso secondo */
        const giaPer = (numero: string, negozio: string | null, quando: string, importo: number) => {
            const t = new Date(quando).getTime();
            const somma = (gia || [])
                .filter((r) => Math.abs(new Date(r.creata_il).getTime() - t) < 180000)
                /* ⚠️ SENZA NUMERO SI GUARDA TUTTO IL NEGOZIO. Prima, quando
                   la vendita non portava il numero, si cercavano solo le righe
                   che a loro volta non ce l'avevano — e la stessa vendita
                   poteva già essere registrata da una riga CON il numero,
                   scritta dal flusso normale. Il recupero non la vedeva e ne
                   creava una seconda, senza taglio: è tornata anche dopo che
                   l'avevamo cancellata a mano. */
                .filter((r) => (numero ? String(r.numero || "") === numero : r.negozio === negozio))
                .reduce((s, r) => s + Number(r.importo || 0), 0);
            return somma >= importo - 0.005;
        };

        const nuove = [];
        for (const v of vendite) {
            if (visti.has(v.id)) continue;
            /* ⚠️ PRIMA I DATI SCRITTI, POI QUELLI LETTI. Dal 01/09 la vendita
               si porta dentro operatore e numero (`dettagli.paystore`): è un
               dato, non una deduzione. La lettura della descrizione resta per
               le righe di prima e per le ricariche sciolte, dove il numero sta
               nel nome del prodotto. */
            const dettP = ((v.dettagli || {}) as { paystore?: { operatore?: string; numero?: string; importo?: number; pezzi?: { n: number; valore: number; etichetta: string }[] } }).paystore;
            const d = dettP?.operatore
                ? { operatore: dettP.operatore, operatoreNome: nomeOperatoreCorto(dettP.operatore), numero: String(dettP.numero || ""), importo: Number(dettP.importo || 0) }
                : leggiRicaricaDaProdotto(v.prodotto);
            /* ⚠️ ANCHE QUELLE SENZA NUMERO. «Ricarica Vodafone» venduta dal
               listino invece che dal pannello è una ricarica pagata di cui
               nessuno sa il numero: nasconderla non la fa sparire, la lascia
               solo senza nessuno che se ne occupi. Entra con il numero vuoto,
               e nella schermata si vede che è da completare. */
            const senzaNum = d ? null : eRicaricaSenzaNumero(v.prodotto);
            if (!d && !senzaNum) continue;                 // un caricatore da muro non è una ricarica
            const dett = (v.dettagli || {}) as { importo?: number; price?: number };
            const importo = Number(dett.importo ?? dett.price ?? d?.importo ?? 0);
            if (!(importo > 0)) continue;
            if (giaPer(d?.numero || "", v.negozio, v.created_at, importo)) continue;
            const base = {
                creata_il: v.created_at, negozio: v.negozio, venditore: v.venditore,
                operatore: d?.operatore || senzaNum, operatore_nome: d?.operatoreNome || nomeOperatoreCorto(senzaNum || ""),
                numero: d?.numero || "", stato: "sospeso", contract_id: v.id,
            };
            /* ⚠️ UNA RIGA PER PEZZO, come fa la vendita. Quaranta euro composti
               da due tagli da venti sono DUE ricariche che il fornitore deve
               eseguire, non una da quaranta: è la regola scritta in
               `registraRicariche`, e il recupero non la seguiva — sommava tutto
               in una riga sola col totale.
               Il dato per farlo bene è già sul contratto (`dettagli.paystore.pezzi`,
               con l'etichetta esatta di ogni taglio): bastava leggerlo.
               Effetto collaterale che il recupero produceva: una riga da 10 €
               ricostruita da due da 5 prendeva l'etichetta «10 euro» dal listino
               e diventava indistinguibile da una vera — cioè una ricarica da
               fare in meno, senza che si vedesse. */
            const pezzi = (dettP?.pezzi || []).filter((x) => Number(x.valore) > 0 && Number(x.n) > 0);
            const quadra = pezzi.length > 0
                && Math.abs(pezzi.reduce((t, x) => t + Number(x.valore) * Number(x.n), 0) - importo) < 0.005;
            if (quadra) {
                for (const pz of pezzi) {
                    for (let k = 0; k < Number(pz.n); k++) {
                        nuove.push({ ...base, importo: Number(pz.valore), taglio: pz.etichetta || null,
                            nota: pezzi.length > 1 || Number(pz.n) > 1
                                ? "ripresa dalla vendita scontrinata (una riga per taglio)"
                                : "ripresa dalla vendita scontrinata" });
                    }
                }
            } else {
                nuove.push({ ...base, importo,
                    nota: d ? "ripresa dalla vendita scontrinata" : "venduta senza numero: da completare a mano" });
            }
        }
        /* ⚠️ IL TAGLIO SI RITROVA DAL LISTINO. Una riga ricostruita conosce
           l'importo ma non il tasto che il negozio ha premuto: se in listino
           c'è UN SOLO taglio attivo di quell'importo per quell'operatore, è
           per forza quello. Senza questo passaggio ogni riga recuperata
           nasceva con la colonna TAGLIO vuota — e a Luca sembrava che le
           ricariche si vendessero senza sceglierlo. */
        if (nuove.length) {
            const { data: listino } = await supabase.from("paystore_tagli")
                .select("operatore, etichetta, valore").eq("attivo", true);
            const L = (listino || []) as { operatore: string; etichetta: string; valore: number }[];
            for (const r of nuove) {
                const c = L.filter((g) => g.operatore === r.operatore && Math.abs(Number(g.valore) - r.importo) < 0.005);
                if (c.length === 1) (r as { taglio?: string }).taglio = c[0].etichetta;
            }
            await supabase.from("paystore_ricariche").insert(nuove);
        }
    } catch (e) {
        // il recupero è un aiuto, non un prerequisito: se non riesce, la
        // schermata mostra quello che c'è invece di non aprirsi
        console.error("[paystore] recupero delle scontrinate non riuscito:", String((e as Error)?.message || e));
    }
}

/* ═══ QUELLO CHE SI SA DALLO SCONTRINO ══════════════════════════════════════
   Luca 01/09: «non capisco perché ci sono ancora dei numeri dove c'è scritto
   metti il numero. Ma che numero metto? Manca il numero, come faccio a
   scriverlo? Devi riprenderlo tutto dallo scontrino chiaramente. C'è anche da
   capire se poi effettivamente quei soldi sono stati incassati.»

   Il lavoro di stampa contiene tutto quello che serve, e nessuno lo stava
   leggendo:
   • il NUMERO — è dentro la descrizione della riga, perché è quello che il
     cliente legge sullo scontrino: «RICARICA VODAFONE 23 3445676400»;
   • la SOCIETÀ che ha emesso (`meta.azienda`);
   • se lo scontrino è USCITO DAVVERO (`status`): il CRM registra la vendita,
     ma a stampare è il registratore, e a volte non ci riesce — agente spento,
     stampante muta. Oggi è successo su tre ricariche vere;
   • il REPARTO con cui la riga è uscita, che deve essere 1: se è un altro,
     quella ricarica è stata assoggettata a IVA per sbaglio.

   ⚠️ Chiedere all'amministrazione di scrivere a mano un numero che nessuno
   conosce non è un campo da compilare: è un vicolo cieco. Il campo resta per
   i casi che qui non si risolvono, ma prima si guarda dove il dato c'è. */
async function completaDalloScontrino(da: string, a: string) {
    try {
        const { data: righe } = await supabase.from("paystore_ricariche")
            .select("id, negozio, creata_il, importo, numero, azienda, scontrino_stato")
            .gte("creata_il", da + "T00:00:00Z").lte("creata_il", a + "T23:59:59Z")
            .order("creata_il", { ascending: false }).limit(5000);
        const daFare = (righe || []).filter((r) => !r.numero || !r.azienda || !r.scontrino_stato);
        if (!daFare.length) return;

        const { data: job } = await supabase.from("print_jobs")
            .select("negozio, created_at, meta, status, request_xml")
            .eq("kind", "fiscal_receipt")
            .gte("created_at", new Date(new Date(da + "T00:00:00Z").getTime() - 3600000).toISOString())
            .lte("created_at", new Date(new Date(a + "T23:59:59Z").getTime() + 3600000).toISOString())
            .limit(20000);
        if (!job?.length) return;

        /* ogni riga di ricarica stampata, con il suo scontrino: importo e
           numero vengono dalla descrizione, che è quella che il cliente legge */
        /* i conti messi da parte: servono a distinguere «lo scontrino non è
           ancora uscito perché la vendita è in pausa» da «il registratore ha
           fallito» */
        const { data: sosp } = await supabase.from("pos_sospesi")
            .select("negozio, created_at, stato")
            .gte("created_at", new Date(new Date(da + "T00:00:00Z").getTime() - 3600000).toISOString())
            .lte("created_at", new Date(new Date(a + "T23:59:59Z").getTime() + 3600000).toISOString())
            .order("creata_il", { ascending: false }).limit(5000);
        const sospesiPerNegozio: Record<string, { t: number }[]> = {};
        for (const x of sosp || []) (sospesiPerNegozio[String(x.negozio || "")] ||= []).push({ t: new Date(x.created_at).getTime() });

        /* ⚠️ E LE VENDITE FATTURATE (04/09). Quando il cliente chiede fattura
           non esce nessuno scontrino: la ricarica restava senza stato, la
           scheda mostrava «lo scontrino non risulta agganciato» e il credito
           non partiva mai da solo — andava sempre forzato a mano, con lo
           storico che diceva il falso. Non è un guasto: è il documento giusto. */
        const { data: fatt } = await supabase.from("fatture_richieste")
            .select("negozio, created_at")
            .gte("created_at", new Date(new Date(da + "T00:00:00Z").getTime() - 3600000).toISOString())
            .lte("created_at", new Date(new Date(a + "T23:59:59Z").getTime() + 3600000).toISOString())
            .neq("stato", "annullata").limit(5000);
        const fatturePerNegozio: Record<string, { t: number }[]> = {};
        for (const x of fatt || []) (fatturePerNegozio[String(x.negozio || "")] ||= []).push({ t: new Date(x.created_at).getTime() });

        type RigaStampata = { negozio: string; t: number; importo: number; numero: string; reparto: number; emesso: boolean; azienda: string | null; errore: string | null };
        const stampate: RigaStampata[] = [];
        const scontriniPerNegozio: Record<string, { t: number; emesso: boolean; azienda: string | null }[]> = {};
        for (const j of job) {
            const az = (j.meta as { azienda?: string } | null)?.azienda || null;
            const t = new Date(j.created_at).getTime();
            const emesso = j.status === "done";
            const neg = String(j.negozio || "");
            (scontriniPerNegozio[neg] ||= []).push({ t, emesso, azienda: az });
            const xml = String(j.request_xml || "");
            /* la descrizione può essere «RICARICA <NOME> <imp> <num>» oppure,
               quando il nome era troppo lungo per i 38 caratteri, senza la
               parola RICARICA davanti */
            for (const m of xml.matchAll(/description="([^"]*?)"[^>]*?unitPrice="([\d.]+)"[^>]*?department="(\d+)"/g)) {
                const desc = m[1];
                const num = desc.match(/\b(\d{7,11})\s*$/)?.[1];
                if (!num) continue;
                if (!/ricarica/i.test(desc) && !NOMI_OPERATORE.some(([n]) => desc.toUpperCase().startsWith(n))) continue;
                /* ⚠️ QUESTO È IL REPARTO **FISICO**, NON QUELLO DEL CATALOGO (03/09/2026).
                   Il numero si rilegge dall'XML già mandato, cioè DOPO la traduzione di
                   `posRepartoMap`: sulle macchine programmate fuori standard i due numeri
                   NON coincidono. Su Magliana Multi (192.168.1.106) una ricarica — reparto
                   logico 1, non soggetta — qui si registra come **4**, che su QUELLA cassa
                   è appunto «non soggetta».
                   Quindi la regola scritta nel commento della colonna
                   (`20260901220000_paystore_dallo_scontrino.sql`: «deve essere 1, se è un
                   altro la ricarica è stata assoggettata a IVA per errore») vale solo per i
                   registratori NON mappati: applicata così com'è a Magliana Multi darebbe
                   solo falsi allarmi. Chi un giorno rimetterà quel controllo deve
                   confrontare la NATURA, non il numero — o ritradurre all'indietro. */
                stampate.push({ negozio: neg, t, importo: Number(m[2]), numero: num, reparto: Number(m[3]), emesso, azienda: az, errore: emesso ? null : String(j.status) });
            }
        }

        const aggiornamenti: { id: string; patch: Record<string, unknown> }[] = [];
        for (const r of daFare) {
            const t = new Date(r.creata_il).getTime();
            const vicino = (x: { t: number }) => x.t <= t + 60000 && x.t >= t - 300000;
            /* ⚠️ IL NEGOZIO NON SI CONFRONTA A LETTERE. Lo scontrino porta
               l'INSEGNA — «Magliana W3», «Collatina Multi», «Acilia VS» —
               mentre la ricarica porta il nome corto del punto vendita:
               «Magliana». Il confronto esatto non trovava mai niente.
               Misurato il 03/09: 44 righe su 46 dicevano «scontrino non
               risulta» avendone uno emesso tre secondi prima, e una cliente si
               è presentata in negozio con lo scontrino in mano.
               `stessoMagazzino` è la regola che il resto del CRM usa già per
               riconoscere le due insegne dello stesso bancone. */
            const stessoPosto = (nome: string) => stessoMagazzino(nome, String(r.negozio || ""));
            const patch: Record<string, unknown> = {};

            /* 1. IL NUMERO E IL REPARTO: dalla riga stampata dello stesso
                  negozio, con lo stesso importo, nell'intorno */
            if (!r.numero) {
                const cand = stampate.filter((x) => stessoPosto(x.negozio) && vicino(x) && Math.abs(x.importo - Number(r.importo)) < 0.005);
                const numeri = [...new Set(cand.map((x) => x.numero))];
                if (numeri.length === 1) {                       // uno solo: è quello
                    patch.numero = numeri[0];
                    patch.reparto_usato = cand[0].reparto;
                }
            } else {
                const suo = stampate.find((x) => stessoPosto(x.negozio) && vicino(x) && x.numero === r.numero);
                if (suo) patch.reparto_usato = suo.reparto;
            }

            /* 2. LO SCONTRINO È USCITO? e con quale società. Se nella finestra
                  c'è un solo scontrino la risposta è certa; se ce ne sono due
                  con esiti o società diversi non si indovina. */
            /* ⚠️ E NON SI PESCA PIÙ DA UNA CASELLA COL NOME ESATTO: si guardano
               tutte le insegne dello stesso posto. */
            const sc = Object.entries(scontriniPerNegozio)
                .filter(([nome]) => stessoPosto(nome))
                .flatMap(([, v]) => v).filter(vicino);
            if (sc.length) {
                const esiti = [...new Set(sc.map((x) => x.emesso))];
                if (esiti.length === 1 && !r.scontrino_stato) {
                    patch.scontrino_stato = esiti[0] ? "emesso" : "errore";
                    patch.scontrino_emesso = esiti[0];
                    if (!esiti[0]) patch.scontrino_errore = "il registratore non ha stampato";
                }
                const soc = [...new Set(sc.map((x) => x.azienda).filter(Boolean))];
                if (!r.azienda && soc.length === 1) patch.azienda = soc[0];
            } else if (!r.scontrino_stato && fatturePerNegozio[String(r.negozio || "")]?.some(vicino)) {
                patch.scontrino_stato = "fatturata";
                patch.scontrino_emesso = true;   // il documento c'è, è una fattura
            } else if (!r.scontrino_stato && sospesiPerNegozio[String(r.negozio || "")]?.some(vicino)) {
                /* ⚠️ NESSUNO SCONTRINO, MA UN CONTO MESSO DA PARTE. «Tieni in
                   sospeso» scrive la vendita e rimanda l'incasso: la ricarica
                   c'è, lo scontrino no, e non è un guasto — è una vendita che
                   il cliente deve ancora chiudere. Va distinta da quella dove
                   il registratore ha fallito, perché la prima si aspetta e la
                   seconda si va a controllare (Luca 02/09). */
                patch.scontrino_stato = "in_pausa";
            }
            if (Object.keys(patch).length) aggiornamenti.push({ id: r.id, patch });
        }

        for (const u of aggiornamenti) await supabase.from("paystore_ricariche").update(u.patch).eq("id", u.id);
    } catch (e) {
        // è un aiuto, non un prerequisito: la schermata deve aprirsi comunque
        console.error("[paystore] lettura dallo scontrino non riuscita:", String((e as Error)?.message || e));
    }
}

export async function GET(request: Request) {
    const g = await accesso(request, "paystore");
    if (!g.ok) return g.risposta;

    const q = new URL(request.url).searchParams;
    const oggi = new Date().toISOString().slice(0, 10);
    const oggiRoma = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
    const da = (q.get("da") || oggi.slice(0, 8) + "01").slice(0, 10);
    const a = (q.get("a") || oggi).slice(0, 10);
    /* ⚠️ IL NEGOZIO NON ARRIVA PIÙ DA QUI. Da quando la tendina è a
       multiselezione il filtro si applica sulle righe, nel browser: il
       parametro resta accettato per non rompere un indirizzo salvato, ma non
       serve più a nessuno. */
    const negozio = q.get("negozio") || "";
    const operatore = q.get("operatore") || "";

    /* il periodo PRECEDENTE di pari lunghezza: «quante ne facevamo prima» è
       metà della risposta a «quante ne facciamo» */
    const nGiorni = Math.max(1, giorniFra(da, a).length);
    const primaFine = new Date(new Date(da + "T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
    const primaInizio = new Date(new Date(primaFine + "T00:00:00Z").getTime() - (nGiorni - 1) * 86400000).toISOString().slice(0, 10);

    /* ═══ IL REGISTRO SI RIPARA DA SOLO ═════════════════════════════════
       Luca, primo giorno di vendite: «devo vedere TUTTE le ricariche che
       vengono scontrinate. E invece non ce le ho.»

       La fonte certa di cosa è stato scontrinato è `contracts`: quella riga
       si scrive nella stessa operazione della vendita. Il registro è una
       scrittura IN PIÙ, fatta da una seconda chiamata — e una seconda
       chiamata può fallire: il primo giorno è successo davvero, per una
       colonna dichiarata `uuid` quando gli id dei contratti sono testo, e il
       registro è rimasto vuoto mentre i negozi vendevano.

       Perciò qui, prima di leggere, si guarda se c'è qualcosa di scontrinato
       che non ha la sua riga, e gliela si dà. Costa una query e toglie di
       mezzo per sempre la domanda «perché manca?». */
    await recuperaScontrinate(da, a);
    await completaDalloScontrino(da, a);

    /* ⚠️ ANCHE LE COLONNE DEL MOTORE. Senza, una ricarica che l'API ha GIÀ
       tentato e di cui non si conosce l'esito era indistinguibile a occhio da
       una mai toccata: il ragazzo al terminale la vedeva «da fare», la caricava
       a mano, e il cliente riceveva il credito due volte. È la strada più
       probabile verso il doppio credito, e non aveva nessun argine. */
    const campi = "id, creata_il, negozio, venditore, operatore, operatore_nome, numero, taglio, importo, stato, errore, azienda, nota, stato_da, stato_il, con_attivazione, scontrino_emesso, scontrino_errore, reparto_usato, scontrino_stato, tentativi, tentata_il, rif_fornitore, ambiente, inviata_il, contract_id, motore_preso_il";
    const [{ data: righe }, { data: prima }, { data: tagli }] = await Promise.all([
        supabase.from("paystore_ricariche").select(campi)
            .gte("creata_il", da + "T00:00:00Z").lte("creata_il", a + "T23:59:59Z")
            .order("creata_il", { ascending: false }).limit(20000),
        supabase.from("paystore_ricariche").select("importo")
            .gte("creata_il", primaInizio + "T00:00:00Z").lte("creata_il", primaFine + "T23:59:59Z").limit(20000),
        supabase.from("paystore_tagli").select("id, operatore, etichetta, valore, ordine, attivo, origine").order("operatore").order("ordine"),
    ]);

    /* ⚠️ SE IL TETTO SI TOCCA, LA PAGINA LO DEVE DIRE. Ventimila righe sono
       nove mesi al ritmo di oggi, ma un «Periodo» su un anno intero le supera —
       e un elenco che si taglia in silenzio è peggio di un elenco lungo. */
    const troncato = (righe || []).length >= 20000;
    let R = (righe || []) as Riga[];
    if (negozio) R = R.filter((r) => r.negozio === negozio);
    if (operatore) R = R.filter((r) => r.operatore === operatore);

    const somma = (l: { importo: number }[]) => l.reduce((s, r) => s + Number(r.importo || 0), 0);

    const perGiorno = giorniFra(da, a).map((gg) => {
        const d = R.filter((r) => giorno(r.creata_il) === gg);
        const ops = [...new Set(d.map((r) => r.operatore))];
        return {
            giorno: gg, quante: d.length, euro: somma(d),
            parti: ops.map((o) => ({
                operatore: o,
                nome: d.find((r) => r.operatore === o)?.operatore_nome || o,
                quante: d.filter((r) => r.operatore === o).length,
                euro: somma(d.filter((r) => r.operatore === o)),
            })).sort((x, y) => y.euro - x.euro),
        };
    });

    const perOperatore = [...new Set(R.map((r) => r.operatore))].map((o) => {
        const d = R.filter((r) => r.operatore === o);
        return { operatore: o, nome: d[0]?.operatore_nome || o, quante: d.length, euro: somma(d) };
    }).sort((x, y) => y.euro - x.euro);

    const perNegozio = [...new Set(R.map((r) => r.negozio || "—"))].map((n) => {
        const d = R.filter((r) => (r.negozio || "—") === n);
        return { negozio: n, quante: d.length, euro: somma(d) };
    }).sort((x, y) => y.euro - x.euro);

    /* ═══ PERCHÉ OGNI SOSPESA È FERMA ══════════════════════════════════════
       Luca 03/09: «sembrano a tutto ok, non capisco perché non sono state
       fatte in automatico». Il motivo c'era già — ma dentro la riga, dove
       nessuno guarda. Qui si calcola con LE STESSE regole del motore, e la
       riga se lo porta dietro.

       ⚠️ LE GEMELLE SI CONTANO PRIMA, in una passata sola: chiedere al
       database una volta per riga vorrebbe dire trecento interrogazioni per
       disegnare una schermata. */
    const impMotore = await (async () => {
        const p = await parametriAutomatismo("paystore-motore");
        const n = (k: string, d: number, min: number, max: number) => {
            const v = Number((p as Record<string, unknown>)[k]);
            return Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : d;
        };
        return {
            acceso: p.acceso === true || p.acceso === "true",
            max: n("max", 10, 1, 50), finestra: n("finestra", 60, 5, 1440),
            tetto: n("tetto", 50, 1, 500), tettoCorsa: n("tettoCorsa", 200, 10, 5000),
            lasso: n("lasso", 10, 2, 60),
        };
    })();
    const quanteGemelle = new Map<string, number>();
    for (const r of R) {
        const k = `${r.contract_id || r.id}|${String(r.numero || "").replace(/\D/g, "")}|${Number(r.importo || 0).toFixed(2)}`;
        quanteGemelle.set(k, (quanteGemelle.get(k) || 0) + 1);
    }
    const adesso = Date.now();
    const conPerche = R.map((r) => {
        if (r.stato !== "sospeso") return r;
        const k = `${r.contract_id || r.id}|${String(r.numero || "").replace(/\D/g, "")}|${Number(r.importo || 0).toFixed(2)}`;
        return { ...r, perche: percheNonParte({ ...r, gemelle: quanteGemelle.get(k) || 1 } as unknown as RigaDaPesare, impMotore, adesso) };
    });

    return NextResponse.json({
        ok: true, da, a, negozio, operatore, troncato,
        /* così il pannello può dire «il motore è spento» invece di lasciare
           indovinare perché non parte niente */
        motoreAcceso: impMotore.acceso, finestraMotore: impMotore.finestra,
        totale: { quante: R.length, euro: somma(R), euroPrima: somma((prima || []) as { importo: number }[]) },
        /* ⚠️ QUELLE DA GUARDARE, in cima e contate a parte: una ricarica
           incassata e non erogata è l'unica ragione per cui uno apre questa
           schermata di fretta. */
        /* ⚠️ UN NUMERO, NON UN ELENCO. Di questo il pannello usava solo la
           lunghezza, e intanto la risposta portava una seconda copia integrale
           delle righe — numeri di cellulare dei clienti compresi — per il 43%
           del peso totale. A trenta giorni erano 1,7 MB a ogni apertura, e
           `carica()` riparte a ogni cambio di stato di una riga. */
        daGuardare: R.filter((r) => r.stato === "sospeso" || r.stato === "fallita").length,
        /* «rimaste indietro» = non partite, o incassate in un giorno GIÀ CHIUSO.
           ⚠️ Il giorno è quello di Roma: `toISOString()` è UTC, e fra mezzanotte
           e le due il giorno appena chiuso non risulterebbe ancora chiuso —
           proprio nelle ore in cui uno va a guardare cosa è rimasto indietro. */
        rimasteIndietro: R.filter((r) => r.stato === "fallita"
            || (r.stato === "sospeso" && giorno(r.creata_il) < oggiRoma)).length,
        perStato: [...new Set(R.map((r) => r.stato))].map((s) => ({ stato: s, quante: R.filter((r) => r.stato === s).length })),
        perGiorno, perOperatore, perNegozio,
        /* quante nascono da un'attivazione e quante si vendono da sole: dice
           se le ricariche sono un servizio a sé o la coda di una vendita */
        /* ⚠️ `con_attivazione` NULL STA CON LE SCIOLTE. Le righe più vecchie —
           e quelle recuperate dallo scontrino quando il collegamento alla
           vendita non c'è — hanno il campo vuoto: confrontandolo con `false`
           non entravano in nessuno dei due gruppi, e i due pulsanti sommati
           davano meno del totale. «Non risulta attaccata a un'attivazione» è
           esattamente quello che vuol dire una ricarica sciolta. */
        perOrigine: [true, false].map((v) => {
            const d = R.filter((r) => (r.con_attivazione === true) === v);
            return { conAttivazione: v, quante: d.length, euro: somma(d) };
        }).filter((x) => x.quante > 0),
        /* ⚠️ TUTTE, NON LE ULTIME DUECENTO. Il taglio a 200 era nato quando il
           negozio si filtrava QUI: si tagliava dopo aver ristretto, e duecento
           righe di un negozio erano tutte le sue. Da quando la tendina è a
           multiselezione il filtro si applica nel browser, quindi tagliare
           prima vuol dire nascondere: al ritmo misurato (72 ricariche il primo
           giorno) il tetto scattava al TERZO giorno sulla vista Mese, e a
           trenta giorni la pagina avrebbe taciuto 461 righe — 5.855 € di
           ricariche incassate — mostrando comunque il contatore giusto nella
           tendina. Un elenco che tace in silenzio è peggio di un elenco lungo:
           quante ne disegna è una decisione del browser, non del server. */
        ultime: conPerche,
        /* i negozi che si possono scegliere sono quelli che HANNO righe fra
           quelle mostrate: con un marchio attivo, elencare i negozi che non
           vendono quel marchio significa offrire dodici scelte di cui sei
           danno lista vuota */
        /* IN ORDINE ALFABETICO (Luca 02/09): «la casella del filtro dei punti
           vendita deve essere in ordine alfabetico, per lo meno me li trovo
           tutti». Arrivavano nell'ordine delle righe, cioè dall'ultima vendita
           — che in una tendina di quattordici voci vuol dire cercarli a uno a
           uno ogni volta. */
        negozi: [...new Set(R.map((r) => r.negozio).filter(Boolean))].sort((x, y) => String(x).localeCompare(String(y), "it")),
        operatori: [...new Set((righe || []).map((r) => r.operatore))],
        /* ⚠️ I CONTATORI DEI DUE ALLARMI SI CALCOLANO QUI, sul periodo intero.
           Contarli nel browser sulle righe caricate voleva dire, col tetto,
           un allarme che si RIMPICCIOLISCE quando il problema cresce: «4 senza
           scontrino» dove in archivio erano 60, cioè 56 clienti che hanno
           pagato e non hanno il documento. */
        senzaScontrino: R.filter((r) => r.scontrino_stato === "errore").length,
        tagli: tagli || [],
    });
}

/* ── I TAGLI ────────────────────────────────────────────────────────────────
   Si cambiano da qui e non dal browser. `origine` resta 'manuale': quando
   arriverà l'API del fornitore, le righe che riscrive lei nasceranno 'api' e
   si vedrà a colpo d'occhio quali sono state messe a mano. */
export async function POST(request: Request) {
    const g = await accesso(request, "paystore");
    if (!g.ok) return g.risposta;
    /* ⚠️ QUI DENTRO SI CAMBIA LO STATO DI UNA RICARICA E IL NUMERO DEL CLIENTE,
       e si riscrive il listino che il banco usa per vendere. Vedere la sezione
       non basta: misurato, `direttore_cc` ha `/amministrazione` fra i permessi
       e arrivava fin qui. Luca 03/09: «assicurati che queste modifiche in
       PayStore è possibile farle solo dall'amministrativo in su».
       ⚠️ Vale per la SCRITTURA: il registro si LEGGE (GET) da chiunque veda la
       sezione, che è il modo in cui l'amministrazione lo guarda in due. */
    const { data: chiSono } = await supabase.from("app_users").select("role").eq("id", g.sess.id).maybeSingle();
    if (!isAdminOrAbove(String((chiSono as { role?: string } | null)?.role || ""))) {
        return NextResponse.json({ error: "queste modifiche le fa l'amministrazione." }, { status: 403 });
    }

    let b: { azione?: string; id?: string; operatore?: string; etichetta?: string; valore?: number; ordine?: number; attivo?: boolean; stato?: string; nota?: string; numero?: string };
    try { b = await request.json(); } catch { return NextResponse.json({ error: "corpo non valido" }, { status: 400 }); }

    if (b.azione === "spegni" || b.azione === "accendi") {
        if (!b.id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
        const { error } = await supabase.from("paystore_tagli")
            .update({ attivo: b.azione === "accendi", aggiornato_il: new Date().toISOString() }).eq("id", b.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    }

    if (b.azione === "salva") {
        const valore = Number(b.valore);
        if (!b.operatore || !String(b.etichetta || "").trim() || !(valore > 0))
            return NextResponse.json({ error: "servono operatore, etichetta e un importo maggiore di zero" }, { status: 400 });
        const riga = {
            operatore: String(b.operatore), etichetta: String(b.etichetta).trim(),
            valore, ordine: Number(b.ordine) || 0, attivo: b.attivo !== false,
            origine: "manuale", aggiornato_il: new Date().toISOString(),
        };
        const { error } = b.id
            ? await supabase.from("paystore_tagli").update(riga).eq("id", b.id)
            : await supabase.from("paystore_tagli").upsert(riga, { onConflict: "operatore,etichetta" });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    }

    /* ⚠️ LO STATO SI CAMBIA A MANO, e finché le ricariche si fanno sul
       terminale del fornitore è l'unico modo che c'è: «fatta» è la parola di
       una persona, quindi resta scritto chi l'ha detta e quando. Con l'API
       collegata lo scriverà il motore, e questi pulsanti resteranno per i
       casi che l'API non copre. */
    if (b.azione === "stato") {
        if (!b.id || !eStatoValido(b.stato))
            return NextResponse.json({ error: "stato non valido" }, { status: 400 });
        const { data: chi } = await supabase.from("app_users").select("full_name").eq("id", g.sess.id).maybeSingle();
        const { error } = await supabase.from("paystore_ricariche").update({
            stato: b.stato, stato_da: chi?.full_name || g.sess.id, stato_il: new Date().toISOString(),
            ...(b.nota !== undefined ? { nota: b.nota || null } : {}),
        }).eq("id", b.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    }

    /* il numero mancante si può scrivere qui: una ricarica venduta dal
       listino non ce l'ha, e senza numero nessuno la può eseguire */
    if (b.azione === "numero") {
        const num = String(b.numero || "").replace(/\D/g, "");
        if (!b.id || num.length < 7 || num.length > 11) return NextResponse.json({ error: "numero non valido" }, { status: 400 });
        /* ⚠️ E AZZERA LA CHIAVE DI IDEMPOTENZA, come fa la scheda. È legata a
           QUELLA ricarica: tenendola, il tentativo dopo la correzione
           riceverebbe da PayStore l'esito del tentativo VECCHIO — quello sul
           numero sbagliato — e la riga direbbe «fatta» mentre il numero nuovo
           non ha ricevuto niente. Erano due strade per la stessa correzione, e
           questa si comportava al contrario dell'altra. */
        const { error } = await supabase.from("paystore_ricariche")
            .update({ numero: num, idempotency_key: null, errore: null }).eq("id", b.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    }

    if (b.azione === "elimina") {
        if (!b.id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
        const { error } = await supabase.from("paystore_tagli").delete().eq("id", b.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "azione sconosciuta" }, { status: 400 });
}
