import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminOrAbove } from "@/lib/roles";
import { annota, nomeDi } from "@/lib/paystoreEventi";
import { NOMI_OPERATORE, nomeOperatoreCorto } from "@/lib/paystore";
import { stessoMagazzino } from "@/lib/negoziNomi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ UNA RICARICA, PER INTERO ═════════════════════════════════════════════
   Luca 03/09: «la possibilità di cliccare su ogni riga e vedere tutte le
   informazioni: la vendita collegata nel caso non fosse una semplice ricarica,
   il cliente collegato coi suoi dati, eventuali cambiamenti, eventuali errori
   generati e risottomissioni, con l'utente, il giorno e l'orario».

   GET  → tutto quello che sta intorno a una ricarica
   PATCH → correggere operatore e numero, dall'amministrativo in su

   ⚠️ CORREGGERE L'OPERATORE È PIÙ SERIO DI CORREGGERE IL NUMERO. Il numero
   sbagliato manda il credito a una persona sbagliata; l'operatore sbagliato lo
   manda a un GESTORE sbagliato, e PayStore lo rifiuta o — peggio — lo accetta
   sul gestore giusto di quel numero e il taglio non esiste. Per questo si può
   toccare solo finché la ricarica NON è partita: su una già eseguita
   cambierebbe la storia di un movimento di denaro già avvenuto. */

/** Chi sta guardando: il lucchetto vero — `accesso` — sta scritto per esteso
 *  dentro ogni verbo, perché la guardia di sicurezza lo cerca lì e perché un
 *  lucchetto nascosto dentro un aiutante è un lucchetto che il prossimo si
 *  dimentica. Qui resta solo il ruolo. */
async function chiGuarda(userId: string) {
    const { data } = await supabaseAdmin.from("app_users").select("role, full_name").eq("id", userId).maybeSingle();
    const u = data as { role?: string; full_name?: string } | null;
    return { ruolo: String(u?.role || ""), nome: u?.full_name || userId };
}

export async function GET(request: Request) {
    const _g = await accesso(request, "paystore/ricarica");
    if (!_g.ok) return _g.risposta;
    const g = await chiGuarda(_g.sess.id);

    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });

    const { data: r } = await supabaseAdmin.from("paystore_ricariche").select("*").eq("id", id).maybeSingle();
    if (!r) return NextResponse.json({ error: "ricarica non trovata" }, { status: 404 });
    const ric = r as Record<string, unknown>;

    /* ── LA VENDITA CHE L'HA GENERATA. Una ricarica quasi mai è sola: esce
          insieme a una SIM, a un telefono, a un accessorio, e capire cosa c'era
          intorno è metà del lavoro quando qualcosa non torna. */
    let vendita: unknown = null;
    let insieme: unknown[] = [];
    let cliente: unknown = null;
    /* come si è arrivati alle compagne, perché chi guarda deve poterlo pesare */
    let comeTrovate = "";
    const contractId = String(ric.contract_id || "");
    /* ⚠️ «NON LO SO» NON SI SCRIVE «ERA SOLA». Una riga senza vendita collegata
       — caricata a mano, o arrivata prima che il legame esistesse — non ha
       compagne perché non ha una vendita, non perché è stata venduta da sola. */
    if (!contractId) comeTrovate = "questa riga non è agganciata a nessuna vendita";
    if (contractId) {
        const { data: c } = await supabaseAdmin.from("contracts")
            .select("id, data, brand, categoria, prodotto, stato, negozio, venditore, client_id, data_registrazione, dettagli, created_at")
            .eq("id", contractId).maybeSingle();
        vendita = c || null;
        const cli = (c as { client_id?: string } | null)?.client_id;
        if (cli) {
            /* ⚠️ SOLO I CAMPI CHE SERVONO A RICONOSCERE UNA PERSONA. Da qui non
               escono documenti, IBAN o note: chi guarda una ricarica non ha
               bisogno del fascicolo del cliente. */
            const { data: cl } = await supabaseAdmin.from("clients")
                .select("id, nome, cognome, ragione_sociale, cf_piva, cellulare, email")
                .eq("id", cli).maybeSingle();
            cliente = cl || null;
        }
        /* ═══ COSA C'ERA NELLO STESSO SCONTRINO ════════════════════════════
           ⚠️ NON BASTA IL CLIENTE. Prima si cercavano le righe con lo stesso
           `client_id` e la stessa data: ma le vendite al banco senza anagrafica
           portano TUTTE lo stesso cliente finto — misurato, `CL-VENDITA-DIRETTA`
           ha 1.183 righe su 35 giorni — così una ricarica venduta DA SOLA si
           ritrovava accanto tutte le vendite anonime della giornata. Luca 03/09:
           «non è possibile che questa ricarica sia stata venduta insieme ad
           altre trecentomila cose».

           Ma nemmeno l'orario basta da solo: misurato, solo l'88% delle vendite
           a più righe le scrive entro quindici secondi, e il resto ha code
           lunghe fino a ore. Quindi si usa il segnale che c'è:
             · cliente VERO → cliente e data, com'era: è la vendita, per davvero;
             · cliente finto → stesso negozio e quindici secondi, l'unico
               appiglio rimasto quando l'anagrafica non c'è.
           E sopra tutto vale il conteggio dello scontrino, più in basso: se il
           documento dice «una riga», compagne non ce ne sono e basta. */
        const anonima = /DIRETTA|ANONIM/i.test(String(cli || ""));
        const q = supabaseAdmin.from("contracts")
            .select("id, brand, categoria, prodotto, stato, created_at, negozio")
            .neq("id", contractId).limit(30);
        if (!anonima && cli) {
            const { data: altre } = await q
                .eq("client_id", cli)
                .eq("data_registrazione", String((c as { data_registrazione?: string } | null)?.data_registrazione || "1970-01-01"));
            insieme = altre || [];
            comeTrovate = insieme.length ? "stessa vendita: stesso cliente, stesso giorno" : "niente: su questa vendita c'era solo la ricarica";
        } else {
            const nato = new Date(String((c as { created_at?: string } | null)?.created_at || ric.creata_il)).getTime();
            const { data: altre } = await q
                .eq("negozio", String((c as { negozio?: string } | null)?.negozio || "__nessuno__"))
                .gte("created_at", new Date(nato - 15000).toISOString())
                .lte("created_at", new Date(nato + 15000).toISOString());
            insieme = altre || [];
            /* ⚠️ IL METODO NON È UNA RISPOSTA. Scrivere «righe battute nello
               stesso momento» dentro la casella del valore, quando di righe non
               ce n'è nessuna, fa leggere «venduta insieme a → righe battute nello
               stesso momento»: una frase che non dice niente. Quando la risposta
               è «niente», si scrive niente. */
            comeTrovate = insieme.length
                ? "vendita al banco senza anagrafica: righe battute nello stesso momento"
                : (c ? "niente: è stata battuta da sola" : "la vendita collegata non si trova più");
        }
    }

    /* le altre ricariche battute nello stesso scontrino */
    const { data: sorelle } = await supabaseAdmin.from("paystore_ricariche")
        .select("id, operatore, operatore_nome, numero, importo, stato")
        .eq("contract_id", contractId || "__nessuno__").neq("id", id).limit(20);

    /* ⚠️ E IL DOCUMENTO SI DEVE POTER APRIRE (Luca 03/09: «ti avevo chiesto la
       possibilità di andare direttamente allo scontrino, e non vedo nessun
       pulsante»). Si cerca come lo cerca il registro: stessa SEDE — l'insegna
       sullo scontrino è «Magliana W3», la ricarica dice «Magliana» — e la
       finestra fra cinque minuti prima e uno dopo. */
    type Job = { id: string; created_at: string; status: string; negozio: string; kind: string; meta: Record<string, unknown> | null };
    let scontrino: (Job & { certo: boolean; quanti: number }) | null = null;
    {
        /* ⚠️ SE IL DOCUMENTO PORTA IL CONTRATTO, non si indovina niente. È il
           caso migliore e va provato per primo. */
        if (contractId) {
            const { data: dritto } = await supabaseAdmin.from("print_jobs")
                .select("id, created_at, status, negozio, kind, meta")
                .eq("meta->>contrattoId", contractId)
                /* solo documenti fiscali: un incasso o un annullo non è «lo
                   scontrino di questa vendita» */
                .in("kind", ["fiscal_receipt", "fiscal"])
                /* ⚠️ L'ULTIMO, NON IL PRIMO. Quando una stampa fallisce e viene
                   rifatta, il primo tentativo è quello andato male: dandolo per
                   buono la scheda scriverebbe «NON uscito» su uno scontrino
                   uscito benissimo. Si preferisce quello riuscito, e a parità
                   il più recente. */
                .order("created_at", { ascending: false });
            const tutti = (dritto || []) as Job[];
            const d = tutti.find((x) => x.status === "done") || tutti[0];
            if (d) scontrino = { ...d, certo: true, quanti: tutti.length };
        }
        if (!scontrino) {
            const t = new Date(String(ric.creata_il)).getTime();
            const { data: jobs } = await supabaseAdmin.from("print_jobs")
                .select("id, created_at, status, negozio, kind, meta")
                .in("kind", ["fiscal_receipt", "fiscal"])
                .gte("created_at", new Date(t - 300000).toISOString())
                .lte("created_at", new Date(t + 60000).toISOString());
            /* ⚠️ E LA SOCIETÀ FA PARTE DELL'INDIRIZZO. «Collatina W3» e
               «Collatina Multi» sono lo stesso bancone ma DUE partite IVA:
               `stessoMagazzino` li fonde apposta, e senza questo filtro una
               ricarica di Telefutura poteva finire agganciata allo scontrino
               fiscale di Telefutura 2 — un altro documento, di un altro
               cliente, di un'altra società. Misurato: col filtro gli agganci
               unici salgono da 250 a 270 e gli ambigui scendono da 75 a 53. */
            const miaAz = String(ric.azienda || "");
            const miei = ((jobs || []) as Job[])
                .filter((j) => stessoMagazzino(j.negozio, String(ric.negozio || "")))
                .filter((j) => !miaAz || String(j.meta?.azienda || "") === miaAz);
            /* più d'uno non si sceglie a caso: si dà il più vicino nel tempo, e
               si dice che è un accostamento, non una certezza */
            const ordinati = miei.sort((a, b) =>
                Math.abs(new Date(a.created_at).getTime() - t) - Math.abs(new Date(b.created_at).getTime() - t));
            if (ordinati[0]) scontrino = { ...ordinati[0], certo: false, quanti: ordinati.length };
        }
    }

    /* ⚠️ `meta.items` NON È «QUANTE COSE C'ERANO SULLO SCONTRINO». È il numero
       di righe di CARRELLO di quel gruppo società — e tre ricariche battute
       insieme viaggiano dentro una riga sola. Misurato: Baleniere 03/09, tre
       ricariche per 23 € totali, un solo scontrino con `items: 1`.
       C'era qui una regola che ne faceva un verdetto («una riga → venduta da
       sola, cancella le compagne»): oggi non scatta mai, perché nessuno
       scontrino porta il contratto di una ricarica; il giorno che lo portasse,
       cancellerebbe compagne vere. Una regola che o dorme o sbaglia si toglie:
       il conteggio resta, ma come informazione, chiamata col suo nome. */
    const righeScontrino = Number(scontrino?.meta?.items ?? NaN);

    const { data: eventi } = await supabaseAdmin.from("paystore_eventi")
        .select("quando, chi, tipo, testo").eq("ricarica_id", id).order("quando", { ascending: false }).limit(100);

    return NextResponse.json({
        ok: true, ricarica: ric, vendita, cliente, scontrino,
        insieme, comeTrovate, righeScontrino: Number.isFinite(righeScontrino) ? righeScontrino : null, sorelle: sorelle || [], eventi: eventi || [],
        /* chi guarda deve sapere se può correggere, se no vede campi che non
           rispondono */
        puoCorreggere: isAdminOrAbove(g.ruolo),
    });
}

export async function PATCH(request: Request) {
    const _g = await accesso(request, "paystore/ricarica");
    if (!_g.ok) return _g.risposta;
    const g = await chiGuarda(_g.sess.id);
    if (!isAdminOrAbove(g.ruolo)) {
        return NextResponse.json({ error: "correggere una ricarica venduta è cosa dell'amministrazione." }, { status: 403 });
    }

    const b = await request.json().catch(() => ({})) as { id?: string; operatore?: string; numero?: string };
    if (!b.id) return NextResponse.json({ error: "id mancante" }, { status: 400 });

    const { data: prima } = await supabaseAdmin.from("paystore_ricariche")
        .select("id, stato, operatore, operatore_nome, numero, tentativi, errore").eq("id", b.id).maybeSingle();
    if (!prima) return NextResponse.json({ error: "ricarica non trovata" }, { status: 404 });
    const p = prima as { stato: string; operatore: string; operatore_nome: string | null; numero: string };

    /* ⚠️ SU UNA GIÀ PARTITA NON SI TOCCA NIENTE. Il credito è uscito su quel
       numero e su quel gestore: cambiarli qui non sposta il credito, cambia
       soltanto il racconto — e il racconto sbagliato è peggio del silenzio. */
    if (p.stato === "ok_automatico" || p.stato === "ok_manuale") {
        return NextResponse.json({
            error: "questa ricarica è già stata erogata: correggerla adesso cambierebbe il racconto, non il credito. Se serve rifarla, rimettila prima in sospeso.",
        }, { status: 409 });
    }

    const campi: Record<string, unknown> = {};
    const righe: string[] = [];

    if (b.operatore !== undefined && b.operatore !== p.operatore) {
        const noto = NOMI_OPERATORE.some(([, id]) => id === b.operatore);
        if (!noto) return NextResponse.json({ error: `«${b.operatore}» non è un operatore conosciuto` }, { status: 400 });
        campi.operatore = b.operatore;
        campi.operatore_nome = nomeOperatoreCorto(b.operatore);
        righe.push(`operatore: ${nomeOperatoreCorto(p.operatore)} → ${nomeOperatoreCorto(b.operatore)}`);
    }
    if (b.numero !== undefined) {
        const num = String(b.numero).replace(/\D/g, "");
        if (num.length < 7 || num.length > 11) return NextResponse.json({ error: "il numero deve avere da 7 a 11 cifre" }, { status: 400 });
        if (num !== String(p.numero || "")) {
            campi.numero = num;
            righe.push(`numero: ${p.numero || "—"} → ${num}`);
        }
    }
    if (!righe.length) return NextResponse.json({ error: "niente da cambiare" }, { status: 400 });

    /* ⚠️ MA NON SE C'È UN TENTATIVO DI CUI NON SAPPIAMO L'ESITO. Azzerare la
       chiave su una riga che ha già bussato a PayStore senza risposta vuol dire
       ripartire da capo su una ricarica che POTREBBE essere partita: è un
       doppio pagamento deciso a tavolino. Prima si guarda com'è andata. */
    if (Number((prima as { tentativi?: number }).tentativi || 0) > 0
        && /esito non ricevuto/i.test(String((prima as { errore?: string }).errore || ""))) {
        return NextResponse.json({
            error: "questa ricarica ha un tentativo di cui non conosciamo l'esito: potrebbe essere partita. Prima usa «Quali ha già fatto PayStore», poi correggila.",
        }, { status: 409 });
    }

    /* ⚠️ E LA CHIAVE DI IDEMPOTENZA SI BUTTA VIA. È legata a QUELLA ricarica:
       tenendola, il tentativo dopo la correzione riceverebbe da PayStore
       l'esito del tentativo vecchio — quello sul numero sbagliato — e la riga
       direbbe «fatta» su una ricarica mai erogata al nuovo numero. */
    campi.idempotency_key = null;
    campi.errore = null;

    const { error } = await supabaseAdmin.from("paystore_ricariche").update(campi).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await annota(b.id, "modifica", righe.join(" · "), g.nome, { prima: p, dopo: campi });
    return NextResponse.json({ ok: true, cambiato: righe });
}
