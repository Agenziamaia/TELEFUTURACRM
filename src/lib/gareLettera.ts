/* ═══ IL SETACCIO DELLA LETTERA DI GARA ════════════════════════════════════
   Quello che il modello propone leggendo la lettera dell'operatore NON entra
   nella proposta così com'è: passa da qui. Sono le regole che decidono se una
   riga è verificabile, se è davvero un cambiamento, e come si legge in
   italiano — e stanno FUORI dalla route perché su tabelle che pagano le
   persone questa parte deve poter essere riletta e provata da sola, senza
   rete e senza modello: qui dentro non si chiama niente.

   Luca 04/09/2026, dopo la prima lettura vera: «mi ha proposto 334 modifiche
   quando in realtà non c'è bisogno. Lui mi deve proporre delle modifiche
   chiare e chiave, mi deve fare anche un riassunto veloce: cioè mi deve dire
   come sono cambiate le soglie e me lo deve dire magari step by step — mi dice
   "il mobile, sono cambiati i target del negozio di Mazzini della soglia 1 da
   questo a quest'altro". Altrimenti così è impossibile verificare quello che
   mi dice e non posso nemmeno andare avanti, altrimenti rischio di fare
   danni.» */

export const TAB = {
    piste: "gare_azienda_piste",
    soglie: "gare_azienda_soglie",
    voci: "gare_azienda_voci",
    regole: "gare_azienda_regole",
} as const;
export type NomeTab = keyof typeof TAB;
export const TABELLE: NomeTab[] = ["piste", "soglie", "voci", "regole"];

export const CAMPI: Record<NomeTab, string[]> = {
    piste: ["gara", "codice", "nome", "descrizione", "sort_order"],
    soglie: ["pista", "scope", "cluster", "store_name", "tier", "soglia_valore", "soglia_um",
             "reward_tipo", "reward_valore", "reward_um", "reward_descr", "note"],
    voci: ["pista", "nome", "tipo", "valore", "um", "condizione", "scope", "tier", "note"],
    regole: ["pista", "tipo", "condizione", "effetto", "valore", "um", "bersaglio", "scope", "note"],
};

/* I CAMPI CHE VALGONO SOLDI. Una descrizione riscritta meglio e un target che
   passa da 39 a 42 punti non sono la stessa cosa: il primo è cosmesi, il
   secondo è lo stipendio di chi lavora in quel negozio. Da qui la card spunta
   di default solo il primo gruppo, e l'altro resta chiuso e spento. */
export const CAMPI_CHIAVE: Record<NomeTab, string[]> = {
    piste: [],                                   // una pista in sé non porta numeri
    soglie: ["soglia_valore", "reward_valore", "soglia_um", "reward_um", "reward_tipo", "tier"],
    voci: ["valore", "tipo", "um"],
    regole: ["valore", "effetto", "um"],
};

/* ── COM'È FATTA DAVVERO LA TABELLA NEL DATABASE ──────────────────────────
   Il modello scrive JSON: per lui «42», «42.0» e «quarantadue» si somigliano.
   Il database no. Questi tre elenchi ricalcano lo schema vero (verificato su
   information_schema il 04/09) e servono a NON far arrivare al `insert`/`update`
   qualcosa che la colonna non accetta:

   - NUMERICI: colonne `numeric`/`integer`. Un testo che non è un numero qui
     dentro non si scrive: si scarta e lo si dice. E il valore buono ci arriva
     GIÀ come numero, non come stringa — «1.000» scritto all'italiana verrebbe
     letto da Postgres come UNO, non come mille.
   - INTERI: dentro i numerici, quelli che non ammettono decimali (tier).
   - OBBLIGATORI: le colonne NOT NULL SENZA valore di default. Un'aggiunta a cui
     manca una di queste non si può scrivere: meglio un avviso adesso che un
     errore rosso in fondo all'elenco.
   Le NOT NULL che un default ce l'hanno (scope, soglia_um, gara) si lasciano
   fuori: se il modello non le scrive, ci pensa il database. */
const NUMERICI: Record<NomeTab, string[]> = {
    piste: ["sort_order"],
    soglie: ["tier", "soglia_valore", "reward_valore"],
    voci: ["valore", "tier"],
    regole: ["valore"],
};
const INTERI = new Set(["tier", "sort_order"]);
/* ⚠️ ANCHE I CHECK NUMERICI SONO REGOLE, non dettagli. `gare_azienda_soglie`
   pretende `tier >= 1`: uno zero passava tutti i controlli, entrava nel
   riassunto, nasceva spuntato e moriva solo alla scrittura — cioè nel momento
   peggiore, a metà di un'applicazione già cominciata. Si ferma prima. */
const MINIMI: Record<string, number> = { tier: 1, sort_order: 0 };
const OBBLIGATORI: Record<NomeTab, string[]> = {
    piste: ["codice", "nome"],
    soglie: ["pista", "tier", "soglia_valore"],
    voci: ["pista", "nome", "tipo"],
    regole: ["tipo", "condizione", "effetto"],
};
/* le NOT NULL con default: se arrivano a null vanno TOLTE, così il default
   fa il suo lavoro invece di far fallire l'inserimento */
const CON_DEFAULT: Record<NomeTab, string[]> = {
    piste: ["gara"],
    soglie: ["scope", "soglia_um"],
    voci: ["scope"],
    regole: ["scope"],
};
/* ⚠️ LE PAROLE AMMESSE, quelle del CHECK vero (lette da pg_constraint il
   04/09). Il modello scrive quello che gli sembra sensato — «euro», «cluster»,
   «cap» — e la riga passava tutti i controlli, entrava nel riassunto, veniva
   spuntata, e falliva SOLO al momento della scrittura, in fondo all'elenco,
   come errore rosso. Meglio scartarla subito dicendo perché. */
const AMMESSI: Record<NomeTab, Record<string, string[]>> = {
    piste: { gara: ["franchising", "multibrand", "multibrand_t2"] },
    soglie: {
        scope: ["pdv", "ragione_sociale"],
        reward_tipo: ["bonus", "moltiplicatore", "pay", "sblocco"],
    },
    voci: {
        scope: ["pdv", "ragione_sociale"],
        tipo: ["punti", "gettone", "bonus", "moltiplicatore", "pay_ricorrente"],
    },
    regole: {
        scope: ["pdv", "ragione_sociale"],
        tipo: ["malus", "gate", "storno"],
    },
};
/* la sola colonna che può restare senza pista: una regola vale anche per
   tutta la gara (lo schema la tiene nullable, la chiave esterna non scatta) */
const SENZA_PISTA: NomeTab[] = ["regole"];

export type Riga = Record<string, unknown>;
export type Foto = Record<NomeTab, Riga[]>;

/* ── CONFRONTI ROBUSTI ────────────────────────────────────────────────────
   Il gestionale tiene i numeri come `numeric`: dal database «1.00» torna
   stringa, e il modello scrive «1.0». Confrontandoli come testo sono diversi,
   e il 04/09 sono usciti VENTUNO «aggiorna» su valori identici (1.00 → 1.0):
   righe da spuntare che non cambiano niente ma che tolgono ogni fiducia
   all'elenco. Si confronta da numero quando entrambi lo sono, da testo
   normalizzato — minuscole, senza accenti, senza doppi spazi — altrimenti. */
const senzaAccenti = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export const norm = (v: unknown) => senzaAccenti(v).toLowerCase().replace(/\s+/g, " ").trim();
/* ⚠️ SEVERO DI PROPOSITO. `Number()` accetta molto più di un numero: " " vale
   ZERO, "1e3" vale mille, "0x20" vale trentadue, e "1.000" scritto
   all'italiana vale UNO — e in una tabella di compensi ognuno di questi è un
   modo silenzioso di scrivere la cifra sbagliata. Qui passa solo la forma di
   un numero scritto per intero, con UN solo separatore decimale. Tutto il
   resto torna null e chi chiama decide: per un campo numerico è uno scarto,
   per un campo di testo si confronta come testo. */
const numero = (v: unknown): number | null => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (v === null || v === undefined) return null;
    const t = String(v).trim();
    if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(t)) return null;
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : null;
};
/** Sono lo stesso valore? Il confronto NUMERICO vale solo sulle colonne
 *  numeriche: su un testo «01» e «1» sono due codici diversi, e trattarli da
 *  numeri faceva sparire dall'elenco una modifica vera. */
export function stessoValore(a: unknown, b: unknown, numerico = false): boolean {
    if (numerico) {
        const na = numero(a), nb = numero(b);
        if (na !== null && nb !== null) return Math.abs(na - nb) < 1e-9;
    }
    return norm(a) === norm(b);
}

const vuoto = (v: unknown) => v === null || v === undefined || v === "";

/** il valore per una colonna numerica: numero vero, null se la casella va
 *  svuotata, `undefined` se quello che è arrivato non è un numero (e allora la
 *  modifica si scarta, non si scrive) */
export function valoreNumerico(campo: string, v: unknown): number | null | undefined {
    if (vuoto(v)) return null;
    /* ⚠️ «1.000» NON SI PUÒ LEGGERE. Le colonne sono numeric(12,2): oltre il
       secondo decimale Postgres arrotonda, quindi tre cifre dopo il separatore
       non possono essere decimali — o è il punto delle MIGLIAIA all'italiana,
       e allora mille diventerebbe UNO, o è un errore. In un tabellone di
       compensi una cifra ambigua non si indovina: si scarta e si rilegge. */
    if (typeof v === "string" && /^[+-]?\d+[.,]\d{3,}$/.test(v.trim())) return undefined;
    const n = numero(v);
    if (n === null) return undefined;
    if (INTERI.has(campo) && !Number.isInteger(n)) return undefined;
    if (campo in MINIMI && n < MINIMI[campo]) return undefined;
    return n;
}

/** l'identità di una riga secondo il gestionale: serve a capire se una
 *  "aggiunta" è in realtà una riga che c'è già, scritta un po' diversa.
 *
 *  ⚠️ LE VOCI NON SONO UN ELENCO, SONO UNA MATRICE: la stessa voce esiste una
 *  volta per SOGLIA («GA base» vale 0,5 in 1ª, 1,0 in 2ª, 1,5 in 3ª — venti
 *  gruppi così nel mese di settembre). Con la chiave «pista + nome» le celle
 *  dalla seconda in poi sarebbero state scartate come «già presente» o
 *  «proposta due volte»: la voce nuova sarebbe nata solo con la 1ª soglia, e
 *  dalla 2ª in poi avrebbe pagato ZERO senza che nessuno lo vedesse. Il `tier`
 *  fa parte dell'identità, e con lui la condizione e lo scope. */
export function chiaveRiga(tab: NomeTab, r: Riga): string {
    if (tab === "piste") return norm(r.codice);
    if (tab === "soglie") return [norm(r.pista), norm(r.scope), norm(r.cluster), norm(r.store_name), norm(r.tier)].join("|");
    if (tab === "voci") return [norm(r.pista), norm(r.nome), norm(r.tier), norm(r.scope), norm(r.condizione)].join("|");
    return [norm(r.pista), norm(r.tipo), norm(r.condizione), norm(r.bersaglio), norm(r.effetto), norm(r.scope)].join("|");
}

/** come si chiama questa riga per una persona: «Mazzini — soglia 1» */
export function etichetta(tab: NomeTab, r: Riga): string {
    if (tab === "piste") return String(r.nome || r.codice || "pista");
    const t = vuoto(r.tier) ? "" : `soglia ${r.tier}`;
    if (tab === "soglie") {
        const dove = String(r.store_name || r.cluster || (r.scope === "ragione_sociale" ? "Ragione Sociale" : "rete"));
        return [dove, t].filter(Boolean).join(" — ") || "soglia";
    }
    /* ⚠️ IL TIER VA SCRITTO. «GA base» esiste tre volte, una per soglia: senza
       il tier il riassunto stampa tre righe identiche e non si capisce quale
       cella cambia — cioè proprio quello che Luca deve poter verificare. */
    if (tab === "voci") return [String(r.nome || "voce"), t].filter(Boolean).join(" — ");
    return [String(r.tipo || "regola"), String(r.bersaglio || r.condizione || "")].filter(Boolean).join(" — ").slice(0, 80);
}

export const mostra = (v: unknown, um?: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    const n = numero(v);
    const testo = n !== null ? String(Number(n.toFixed(4))).replace(".", ",") : String(v);
    const corto = testo.length > 70 ? testo.slice(0, 68) + "…" : testo;
    return um ? `${corto} ${um}` : corto;
};

/* IL CAMPO PRINCIPALE DI OGNI TABELLA, e l'unità che gli sta accanto: sono
   quelli che vanno letti come «39 → 42 punti» invece che «soglia_valore: 39 →
   42». La riga deve leggersi senza sapere come si chiamano le colonne. */
const PRINCIPALE: Record<NomeTab, { campo: string; um?: string; come?: string }[]> = {
    piste: [],
    soglie: [{ campo: "soglia_valore", um: "soglia_um" }, { campo: "reward_valore", um: "reward_um", come: "premio" }],
    voci: [{ campo: "valore", um: "um" }],
    regole: [{ campo: "valore", um: "um" }],
};

/** la riga così come la legge una persona */
export function rigaLeggibile(tab: NomeTab, riga: Riga, campo: string, da: unknown, a: unknown): string {
    const p = PRINCIPALE[tab].find((x) => x.campo === campo);
    const testa = etichetta(tab, riga) + (p?.come ? ` — ${p.come}` : p ? "" : ` — ${campo}`);
    // l'unità si scrive UNA volta sola, in fondo: «39 → 42 punti»
    const um = p?.um ? riga[p.um] : undefined;
    return `${testa}: ${mostra(da)} → ${mostra(a, um)}`;
}

/* ⚠️ QUANDO LA RISPOSTA È MONCA, SI SALVA QUEL CHE C'È. Un JSON tagliato a
   metà non si può leggere, ma le modifiche complete che stanno prima del
   taglio sì: si tagliano gli oggetti interi dell'array `modifiche` e si tiene
   solo quelli. Nulla viene applicato senza spunta, e l'avviso dice a chiare
   lettere che la coda è andata persa e va riletta a mano. Meglio dodici righe
   vere più un avviso, che zero righe e lo stesso avviso. */
export function recuperaTroncato(testo: string): Riga[] {
    const i = testo.indexOf('"modifiche"');
    if (i < 0) return [];
    const inizio = testo.indexOf("[", i);
    if (inizio < 0) return [];
    const fuori: Riga[] = [];
    let liv = 0, dentroStringa = false, fuga = false, partenza = -1;
    for (let k = inizio + 1; k < testo.length; k++) {
        const c = testo[k];
        if (fuga) { fuga = false; continue; }
        if (c === "\\") { fuga = true; continue; }
        if (c === '"') { dentroStringa = !dentroStringa; continue; }
        if (dentroStringa) continue;
        if (c === "{") { if (liv === 0) partenza = k; liv++; }
        else if (c === "}") {
            liv--;
            if (liv === 0 && partenza >= 0) {
                try { fuori.push(JSON.parse(testo.slice(partenza, k + 1))); } catch { /* pezzo rotto: si lascia */ }
                partenza = -1;
            }
        } else if (c === "]" && liv === 0) break;
    }
    return fuori;
}

export type Grezza = { tab: NomeTab; div: string; m: Riga };

/* ═══ IL SETACCIO ═══════════════════════════════════════════════════════════
   Quello che arriva dal modello non entra nella proposta finché non ha
   passato, nell'ordine: (1) esiste davvero la riga che dice di toccare, (2) il
   valore nuovo è DIVERSO da quello di adesso, (3) l'aggiunta non è una riga
   che c'è già né la copia di un'altra aggiunta, (4) la pista a cui si aggancia
   esiste. Ogni scarto viene contato: il totale si dice, così si vede quanto
   rumore è stato tolto. */
export function setaccia(grezze: Grezza[], foto: Foto, nomePista: Record<string, string>, gaDi: Record<string, string>) {
    const perId = new Map<string, { tab: NomeTab; r: Riga }>();
    TABELLE.forEach((t) => (foto[t] || []).forEach((r) => perId.set(String(r.id), { tab: t, r })));
    const chiaviBase = new Map<NomeTab, Set<string>>();
    TABELLE.forEach((t) => chiaviBase.set(t, new Set((foto[t] || []).map((r) => chiaveRiga(t, r)))));
    const pisteEsistenti = new Set((foto.piste || []).map((p) => norm(p.codice)));

    const scarti: Record<string, number> = {};
    const scarta = (perche: string) => { scarti[perche] = (scarti[perche] || 0) + 1; };
    const vistiAdd = new Map<NomeTab, Set<string>>();
    TABELLE.forEach((t) => vistiAdd.set(t, new Set()));
    // le piste che la proposta stessa crea: le loro righe figlie sono lecite
    const pisteNuove = new Set<string>();
    grezze.forEach(({ tab, m }) => {
        if (tab === "piste" && (m.op === "new" || m.operazione === "aggiungi")) {
            const d = (m.dati || {}) as Riga;
            if (d.codice) pisteNuove.add(norm(d.codice));
        }
    });

    /* UNA RIGA, UNA MODIFICA PER CAMPO. Con i pezzi che si spaccano quando la
       risposta sfora, lo stesso campo può tornare due volte con due valori
       diversi: nell'elenco si leggerebbero due righe «39 → 42» e «39 → 45» e
       ad applicarle vincerebbe l'ultima, a caso. Si tiene la prima e si conta
       l'altra fra gli scarti. */
    const vistiMod = new Set<string>();
    const vistiDel = new Set<string>();

    const buone: Riga[] = [];
    for (const { tab, div, m } of grezze) {
        const op = String(m.op || m.operazione || "");
        const perche = String(m.perche || m.motivo || "").split(/\s+/).slice(0, 14).join(" ");

        if (op === "mod" || op === "aggiorna") {
            const rif = perId.get(String(m.id || ""));
            if (!rif || rif.tab !== tab) { scarta("aggiorna con id che non esiste nel mese base"); continue; }
            const campo = String(m.campo || "");
            const marchio = `${tab}|${m.id}|${campo}`;
            if (vistiMod.has(marchio)) { scarta("stesso campo proposto due volte"); continue; }
            vistiMod.add(marchio);
            if (!CAMPI[tab].includes(campo)) { scarta(`campo non modificabile: ${campo || "(vuoto)"}`); continue; }
            const da = rif.r[campo];
            /* SU UNA COLONNA NUMERICA SI SCRIVE UN NUMERO, non il testo che il
               modello ha battuto. «1.000» all'italiana diventerebbe UNO nel
               database, e nessuno se ne accorgerebbe fino al cedolino. */
            let a = m.a;
            if (NUMERICI[tab].includes(campo)) {
                const n = valoreNumerico(campo, m.a);
                if (n === undefined) { scarta(`${campo}: «${m.a}» non è un numero leggibile senza ambiguità`); continue; }
                if (n === null && OBBLIGATORI[tab].includes(campo)) { scarta(`${campo} non può restare vuoto`); continue; }
                a = n;
            }
            const ammessi = AMMESSI[tab][campo];
            if (ammessi && !vuoto(a) && !ammessi.includes(String(a))) {
                scarta(`${campo}: «${a}» non è un valore ammesso (${ammessi.join(", ")})`); continue;
            }
            if (stessoValore(da, a, NUMERICI[tab].includes(campo))) { scarta("valore già uguale a quello del gestionale"); continue; }
            const pista = String(rif.r.pista || rif.r.codice || "");
            buone.push({
                tabella: tab, operazione: "aggiorna", id: String(m.id), campo, da, a, motivo: perche,
                pista, gara: gaDi[pista] || div, gruppo: nomePista[pista] || pista,
                dove: etichetta(tab, rif.r),
                chiave: CAMPI_CHIAVE[tab].includes(campo),
                riga: rigaLeggibile(tab, rif.r, campo, da, a),
            });
        } else if (op === "del" || op === "rimuovi") {
            const rif = perId.get(String(m.id || ""));
            if (!rif || rif.tab !== tab) { scarta("rimuovi con id che non esiste nel mese base"); continue; }
            const marchio = `${tab}|${m.id}`;
            if (vistiDel.has(marchio)) { scarta("stessa riga da rimuovere due volte"); continue; }
            vistiDel.add(marchio);
            const pista = String(rif.r.pista || rif.r.codice || "");
            /* ⚠️ TOGLIERE UNA PISTA TOGLIE TUTTO QUELLO CHE CI STA SOTTO: le
               chiavi esterne di soglie, voci e regole sono ON DELETE CASCADE.
               Una casella sola cancella decine di righe, e il registro
               `applicato` ne segna UNA: da lì non si torna indietro. Quindi la
               riga resta nel gruppo dei numeri — è la modifica più grossa che
               esista — ma NON nasce spuntata: la accende una persona. */
            const pericolosa = tab === "piste";
            buone.push({
                tabella: tab, operazione: "rimuovi", id: String(m.id), motivo: perche,
                pista, gara: gaDi[pista] || div, gruppo: nomePista[pista] || pista,
                dove: etichetta(tab, rif.r), chiave: true, pericolosa,
                riga: `${etichetta(tab, rif.r)}: da RIMUOVERE${pericolosa ? " — l'INTERA pista, con tutte le sue soglie, voci e regole" : ""}`,
            });
        } else if (op === "new" || op === "aggiungi") {
            const arrivati = (m.dati || {}) as Riga;
            if (!arrivati || typeof arrivati !== "object" || !Object.keys(arrivati).length) { scarta("aggiunta senza dati"); continue; }
            /* LA RIGA NUOVA SI RIPULISCE PRIMA DI PROPORLA: solo le colonne che
               esistono, i numeri come numeri, e via le NOT NULL messe a null —
               che il database rifiuterebbe mentre il default farebbe da sé. */
            const dati: Riga = {};
            let scartaPer = "";
            for (const c of CAMPI[tab]) {
                const v = arrivati[c];
                if (v === undefined) continue;
                if (NUMERICI[tab].includes(c)) {
                    const n = valoreNumerico(c, v);
                    if (n === undefined) { scartaPer = `${c}: «${v}» non è un numero leggibile senza ambiguità`; break; }
                    if (n !== null) dati[c] = n;
                    continue;
                }
                if (vuoto(v) && CON_DEFAULT[tab].includes(c)) continue;   // ci pensa il database
                const ammessi = AMMESSI[tab][c];
                if (ammessi && !vuoto(v) && !ammessi.includes(String(v))) {
                    scartaPer = `${c}: «${v}» non è un valore ammesso (${ammessi.join(", ")})`; break;
                }
                dati[c] = v;
            }
            if (scartaPer) { scarta(scartaPer); continue; }
            /* UNA PISTA NUOVA NASCE NELLA DIVISIONE CHE STIAMO LEGGENDO. Se il
               modello non scrive `gara`, il default del database è
               «principale»: la pista finirebbe in una divisione che nessuno
               guarda, e le sue soglie con lei. */
            if (tab === "piste" && vuoto(dati.gara)) dati.gara = div;
            const manca = OBBLIGATORI[tab].find((c) => vuoto(dati[c]));
            if (manca) { scarta(`aggiunta senza ${manca}: il database la rifiuterebbe`); continue; }
            const pista = String(tab === "piste" ? dati.codice || "" : dati.pista || "");
            // una REGOLA può valere per tutta la gara: lo schema le lascia la pista vuota
            const senzaPista = !pista && SENZA_PISTA.includes(tab);
            if (tab !== "piste" && !senzaPista && !pisteEsistenti.has(norm(pista)) && !pisteNuove.has(norm(pista))) {
                /* il 04/09: 69 aggiunte agganciate a piste che nel mese non
                   esistono (mb_assicurazioni, mb2_extra_piva…) — righe orfane
                   che il motore non troverebbe mai, ma che restano nelle
                   tabelle a sporcare il conto */
                scarta(`aggiunta su una pista che non esiste: ${pista || "(vuota)"}`); continue;
            }
            const k = chiaveRiga(tab, dati);
            if (chiaviBase.get(tab)!.has(k)) { scarta("aggiunta di una riga che c'è già"); continue; }
            if (vistiAdd.get(tab)!.has(k)) { scarta("aggiunta proposta due volte"); continue; }
            vistiAdd.get(tab)!.add(k);
            /* UN'AGGIUNTA È «CHIAVE» SOLO SE PORTA UN NUMERO. Le righe nuove
               senza importo — «Extra Gara P.IVA con Business Promoter Plus»,
               senza valore — sono proprio quelle che non si possono verificare
               a colpo d'occhio: stanno nel gruppo chiuso, si leggono e si
               spuntano a mano. */
            const chiaveNum = tab === "piste" ? true
                : PRINCIPALE[tab].some((x) => dati[x.campo] !== null && dati[x.campo] !== undefined && dati[x.campo] !== "");
            /* cosa si legge accanto a «da AGGIUNGERE»: il valore se c'è,
               altrimenti almeno il tipo e la condizione — una riga nuova senza
               niente accanto non si può né verificare né rifiutare */
            const pezzi = PRINCIPALE[tab]
                .filter((x) => dati[x.campo] !== null && dati[x.campo] !== undefined && dati[x.campo] !== "")
                .map((x) => `${x.come ? x.come + " " : ""}${mostra(dati[x.campo], x.um ? dati[x.um] : undefined)}`);
            if (!pezzi.length && dati.tipo) pezzi.push(String(dati.tipo));
            if (dati.condizione) pezzi.push(mostra(dati.condizione));
            const valori = pezzi.join(" · ");
            buone.push({
                tabella: tab, operazione: "aggiungi", dati, motivo: perche,
                pista, gara: gaDi[pista] || div,
                // una pista nuova non sta ancora nell'elenco dei nomi: si legge il suo
                gruppo: nomePista[pista] || (tab === "piste" ? String(dati.nome || pista) : pista),
                dove: etichetta(tab, dati), chiave: chiaveNum,
                riga: `${etichetta(tab, dati)}: da AGGIUNGERE${valori ? ` — ${valori}` : ""}`,
            });
        } else { scarta(`operazione sconosciuta: ${op}`); continue; }
    }

    /* CORREGGERE UNA RIGA CHE SI STA CANCELLANDO non ha senso: applicate
       insieme, la seconda scriverebbe nel vuoto («riga non trovata») o la
       prima verrebbe buttata subito dopo. Vince la rimozione, che è la
       decisione più grossa, e la correzione si conta fra gli scarti. */
    const daTogliere = new Set(buone.filter((m) => m.operazione === "rimuovi").map((m) => `${m.tabella}|${m.id}`));
    const nette = buone.filter((m) => {
        if (m.operazione !== "aggiorna" || !daTogliere.has(`${m.tabella}|${m.id}`)) return true;
        scarta("correzione su una riga che viene rimossa");
        return false;
    });
    return { buone: nette, scarti };
}

/* ═══ IL RIASSUNTO, RICAVATO DALLE MODIFICHE VERE ═══════════════════════════
   Non lo si chiede al modello — il suo racconto e le sue righe divergono — lo
   si SCRIVE da qui, dalle righe che verranno davvero applicate, coi nomi presi
   dalla fotografia del mese base. Quello che si legge è esattamente quello che
   si scriverà. Il formato è fisso e lo sanno sia la card sia il PDF: riga di
   intestazione, poi un blocco per pista (titolo in maiuscolo) con le sue righe
   che cominciano per «·», in fondo l'elenco di ciò che non cambia. */
export function riassuntoDa(buone: Riga[], foto: Foto, nomePista: Record<string, string>, intestazione: string): string {
    const perPista = new Map<string, Riga[]>();
    buone.forEach((m) => {
        const k = String(m.pista || "");
        if (!perPista.has(k)) perPista.set(k, []);
        perPista.get(k)!.push(m);
    });
    const out: string[] = [intestazione, ""];
    const ordine = (foto.piste || []).map((p) => String(p.codice));
    /* ⚠️ QUANDO SI LEGGONO TUTTE LE DIVISIONI i nomi delle piste si ripetono —
       «Fisso» esiste nel franchising e nel multibrand — e il riassunto usciva
       con due FISSO e tre LUCE & GAS, senza modo di capire quale fosse quale.
       La divisione entra nel titolo solo quando ce n'è più di una: se stai
       leggendo una lettera sola sarebbe rumore. */
    const gaDiPista: Record<string, string> = {};
    (foto.piste || []).forEach((p) => { gaDiPista[String(p.codice)] = String(p.gara || ""); });
    const piuDivisioni = new Set(Object.values(gaDiPista).filter(Boolean)).size > 1;
    const titolo = (cod: string) => {
        const base = (nomePista[cod] || cod).toUpperCase();
        return piuDivisioni && gaDiPista[cod] ? `${base}  ·  ${gaDiPista[cod]}` : base;
    };
    const senza: string[] = [];
    for (const cod of ordine) {
        const mm = perPista.get(cod) || [];
        if (!mm.length) { senza.push(titolo(cod)); continue; }
        out.push(titolo(cod));
        const chiave = mm.filter((m) => m.chiave);
        const resto = mm.filter((m) => !m.chiave);
        /* la pista che sparisce si dice in UNA riga, non in sei: «non c'è più
           nella lettera → da rimuovere, con 5 soglie». È il caso di Luca. */
        const viaTutta = mm.some((m) => m.tabella === "piste" && m.operazione === "rimuovi");
        if (viaTutta && mm.every((m) => m.operazione === "rimuovi")) {
            const conteggio = TABELLE.filter((t) => t !== "piste")
                .map((t) => ({ t, n: mm.filter((m) => m.tabella === t).length }))
                .filter((x) => x.n).map((x) => `${x.n} ${x.t}`).join(", ");
            out.push(`· pista non più presente nella lettera → da rimuovere${conteggio ? `, con ${conteggio}` : ""}`);
            out.push("");
            continue;
        }
        chiave.forEach((m) => out.push(`· ${m.riga}`));
        if (!chiave.length) out.push("· nessun numero cambia");
        if (resto.length) out.push(`· e ${resto.length} ${resto.length === 1 ? "modifica accessoria" : "modifiche accessorie"} (descrizioni, note, righe senza importo) — da leggere a mano`);
        out.push("");
    }
    // le righe su piste che nascono adesso non hanno un gruppo nell'ordine;
    // quelle senza pista (regole di gara) stanno per conto loro
    const fuori = buone.filter((m) => !ordine.includes(String(m.pista)));
    const nuove = fuori.filter((m) => m.pista);
    const globali = fuori.filter((m) => !m.pista);
    if (nuove.length) {
        out.push("PISTE NUOVE");
        nuove.forEach((m) => out.push(`· ${m.riga}`));
        out.push("");
    }
    if (globali.length) {
        out.push("REGOLE SENZA PISTA");
        globali.forEach((m) => out.push(`· ${m.riga}`));
        out.push("");
    }
    if (senza.length) out.push(`NESSUN CAMBIO: ${senza.join(", ")}`);
    if (!buone.length) out.push("Nessuna modifica proposta: la lettera non cambia nulla di quello che è già impostato.");
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
