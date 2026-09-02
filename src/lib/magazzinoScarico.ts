// ═══════════════════════════════════════════════════════════════════════════
// LO SCARICO DAL MAGAZZINO (Luca 28/08 notte)
//
// «Vai a scaricare il prodotto»: è la frase che separa un CRM da un software
// di cassa. Finché la vendita registra solo quanto abbiamo guadagnato, il
// magazzino resta un foglio a parte; da qui in poi vendere TOGLIE il pezzo.
//
// Due regole che vengono dal negozio, non dal codice:
//
//  1. QUELLO CHE NON C'È NON SI VENDE (Luca 29/08, decisione secca). Da qui
//     esce uno scontrino fiscale: un pezzo che a magazzino non esiste non si
//     può battere. Il rifiuto avviene PRIMA, in cassa, con un pop-up — qui
//     arriva solo roba già controllata. Se una giacenza va comunque in
//     negativo è il segno che qualcosa è sfuggito al controllo: si registra,
//     non si nasconde.
//
//  2. LA SOCIETÀ SEGUE LA MERCE (revisore 29/08). Il magazzino Wind3 è di
//     Telefutura, il Multi di Telefutura 2. Qui `azienda` non veniva passata
//     e la colonna ha `default 'T1'`: vendere una SIM Fastweb — 109 pezzi,
//     tutti di Telefutura 2 — lasciava T2 ferma a 109 e faceva nascere a T1
//     una riga a −1 che nessuno vedeva (la sezione Magazzino mostra solo le
//     quantità sopra zero). Misurato in rollback su 60A001. Merce che esce da
//     un inventario e ricavo che entra nella fattura dell'altra società.
//
//  3. UN PEZZO CON SERIALE NON È UNA QUANTITÀ. Un telefono sta in `mag_unita`
//     come oggetto singolo, non in `mag_giacenze` come numero: venderlo vuol
//     dire marcarlo `venduto`, non decrementare un contatore che per lui non
//     esiste. Prima non lo si marcava MAI — lo stesso IMEI si poteva battere
//     all'infinito, e ogni giro scavava una quantità fantasma sotto zero.
//
//  4. LO SCARICO NON PUÒ FAR FALLIRE IL SALVATAGGIO. La vendita è già scritta
//     e lo scontrino può essere già stampato: se il movimento non parte si
//     annota e si va avanti. Un magazzino disallineato si sistema; una vendita
//     persa no.
// ═══════════════════════════════════════════════════════════════════════════

import { stessoMagazzino } from "@/lib/negoziNomi";
import { supabase } from "@/lib/supabaseClient";

export type RigaDaScaricare = {
    codice?: string | null;
    scaricaMagazzino?: boolean;
    qty?: number | null;
    costo?: number | null;
    price?: number | null;
    importo?: number | null;
    product?: string | null;
    /** LA SOCIETÀ DI QUESTA MERCE (revisore 29/08). Vedi la regola 3 in testa
     *  al file: senza, si scaricava sempre Telefutura 1. */
    azienda?: string | null;
    /** IL PEZZO PRECISO. Quando c'è, non si tocca la quantità: si marca
     *  venduto QUEL pezzo. Vedi la regola 4. */
    seriale?: string | null;
};

export type EsitoScarico = {
    scaricate: number;
    saltate: number;
    /** le righe che hanno portato la giacenza sotto zero: il negozio le deve
     *  contare. Non è un errore del software, è un conto che non torna. */
    sottoZero: { prodotto: string; codice: string; restano: number }[];
    /** pezzi da scaricare che non hanno un codice articolo: non si possono
     *  togliere da nessuna giacenza, e va detto invece che ingoiarlo */
    senzaCodice?: string[];
    /** i pezzi con seriale portati a «venduto» (telefoni, modem) */
    pezziVenduti?: number;
    /** questo negozio non ha ancora un magazzino caricato: non c'è niente da
     *  scaricare e non c'è niente da segnalare */
    senzaMagazzino?: boolean;
    errore?: string;
};

/** Tutto quello che il negozio deve SAPERE di uno scarico, in una riga sola.
 *  Vuoto = è filato liscio. (revisore 29/08: `sottoZero` e `senzaCodice`
 *  venivano costruiti con cura e finivano in `console.error` — su un monitor
 *  da negozio la console non esiste, e una giacenza andata sotto zero è
 *  esattamente la prova che qualcosa è sfuggito al controllo.) */
export function avvisiScarico(e: EsitoScarico | null | undefined): string[] {
    if (!e || e.senzaMagazzino) return [];
    const a: string[] = [];
    if (e.errore) a.push("magazzino non aggiornato: " + e.errore);
    (e.sottoZero || []).forEach((s) => a.push(s.restano === 0
        ? `«${s.prodotto}» (${s.codice}) non risulta mai entrato in questo magazzino: venduto ma NON scaricato`
        : `«${s.prodotto}» è andato sotto zero (restano ${s.restano}): il conto non torna, va contato`));
    (e.senzaCodice || []).forEach((n) => a.push(`«${n}» non ha un codice articolo: venduto ma NON scaricato`));
    return a;
}

/** Toglie dal magazzino i prodotti di una vendita.
 *  Da chiamare DOPO che la vendita è salvata, mai prima. */
/** I negozi che condividono il magazzino con questo: lui più il gemello. */
let _nomiNegozi: string[] | null = null;
async function _sede(negozio: string): Promise<string[]> {
    if (!_nomiNegozi) {
        const { data, error } = await supabase.from("stores").select("name");
        /* NON SO ≠ È SOLO. Se la lettura fallisce non si mette in cache una
           lista vuota: si risponde col negozio e basta, e la volta dopo si
           riprova — se no per tutta la sessione il gemello sparisce in
           silenzio (regola del repo, violata dal primo giro). */
        if (error || !data) return [negozio];
        _nomiNegozi = data.map((r: { name: string }) => String(r.name));
    }
    const suoi = _nomiNegozi.filter((n) => stessoMagazzino(n, negozio));
    return suoi.length ? suoi : [negozio];
}

export async function scaricaVendita(
    righe: RigaDaScaricare[],
    negozio: string,
    contractId: string | null,
    operatore?: string | null,
): Promise<EsitoScarico> {
    const esito: EsitoScarico = { scaricate: 0, saltate: 0, sottoZero: [] };
    /* BASTA IL SERIALE (revisore 29/08). Prima si richiedeva il codice
       articolo, e i quattro telefoni caricati senza codice — due Xiaomi Redmi
       Note 17, un S24, un iPhone 15 Pro — restavano fuori da qualsiasi
       scarico: vendibili all'infinito e mai tolti dall'inventario. Un pezzo
       con un seriale si marca venduto per il seriale, il codice non serve. */
    const daFare = (righe || []).filter((r) => r.scaricaMagazzino && (r.codice || r.seriale));
    esito.saltate = (righe || []).length - daFare.length;
    /* Un pezzo che DOVEVA scaricare e non ha NÉ codice NÉ seriale: non si può
       togliere da nessuna parte, e va detto invece che ingoiarlo. */
    const senzaCodice = (righe || []).filter((r) => r.scaricaMagazzino && !r.codice && !r.seriale);
    if (senzaCodice.length) esito.senzaCodice = senzaCodice.map((r) => String(r.product || "senza nome"));
    if (!negozio) return esito;

    try {
        /* UN NEGOZIO SENZA MAGAZZINO NON HA CONTI DA FAR TORNARE (Luca 29/08,
           domanda giusta: «gli altri negozi possono ancora metterli?»).
           Oggi il magazzino è caricato SOLO a Donna Olimpia: negli altri 14
           negozi non esiste una sola riga di giacenza. Senza questo controllo,
           ogni SIM venduta a Magliana o ad Acilia — la voce arriva col codice
           articolo, ora che scorciatoie e voci automatiche sono collegate —
           finirebbe fra i «venduto ma NON scaricato» e farebbe comparire il
           pannello d'allarme a ogni vendita. Un allarme che suona sempre non
           è un allarme: è rumore, e insegna a ignorarlo.
           Quando il magazzino di quel negozio verrà caricato, il controllo si
           spegne da sé e lo scarico riprende — senza toccare niente. */
        const { data: haMagazzino, error: erroreSonda } = await supabase.from("mag_disponibilita")
            // la sonda guarda la SEDE, come il resto: un'insegna senza righe
            // ma col gemello pieno non è «un negozio senza magazzino»
            .select("codice").in("negozio", await _sede(negozio)).limit(1);
        /* NON SO ≠ NON C'È (revisore 29/08): se la sonda FALLISCE non si può
           dichiarare «questo negozio non ha magazzino» — sarebbe saltare lo
           scarico in silenzio proprio quando qualcosa non va. Si prosegue e,
           se lo scarico non riesce, lo si dice. */
        if (!erroreSonda && !haMagazzino?.length) {
            esito.saltate = (righe || []).length;
            esito.senzaCodice = undefined;
            return { ...esito, scaricate: 0, senzaMagazzino: true };
        }
        // la sonda sta PRIMA di questa uscita: se no, in un negozio senza
        // magazzino un articolo senza codice faceva comparire l'allarme
        if (!daFare.length) return esito;

        const falliti: string[] = [];
        const adesso = new Date().toISOString();

        /* ── I PEZZI: si marcano venduti, non si contano ────────────────────
           Un telefono con IMEI vive in `mag_unita`, dove di lui non c'è una
           quantità ma un oggetto con uno stato. `cassa_seriali` filtra
           `stato <> 'venduto'`, quindi è questo passaggio — e solo questo —
           che lo toglie dalla vendita. L'indice unico `mag_unita_seriale_viva`
           è già fatto apposta. */
        const conSeriale = daFare.filter((r) => r.seriale);
        for (const r of conSeriale) {
            const { data, error } = await supabase.from("mag_unita")
                /* IL PREZZO DI VENDITA, non il valore di carico (Luca 31/08):
                   `valore` dice quanto costava entrando, e sono due numeri
                   diversi — è la differenza fra i due che è il margine. */
                .update({ stato: "venduto", venduto_il: adesso, venduto_da: operatore || null,
                          contract_id: contractId, prezzo_vendita: r.price ?? r.importo ?? null })
                /* SOLO SE È ANCORA DISPONIBILE (revisore 31/08). Era
                   `neq('venduto')`, che lasciava passare anche «annullato» e
                   «in_transito»: una bozza ripresa poteva vendere un pezzo
                   cestinato nel frattempo, cancellando il cestino senza
                   lasciare traccia. Il carrello si autosalva coi seriali e
                   non li rilegge al ritorno. */
                .eq("seriale", String(r.seriale)).eq("stato", "disponibile").select("id");
            if (error) falliti.push(`${r.seriale} (${error.message})`);
            else if (!data?.length) falliti.push(`${r.seriale} (non più disponibile: venduto, trasferito o tolto dal magazzino)`);
            else { esito.scaricate++; esito.pezziVenduti = (esito.pezziVenduti || 0) + 1; }
        }

        /* ── LE QUANTITÀ: qui sì, si decrementa ─────────────────────────────
           Solo le righe SENZA seriale: per un pezzo appena marcato venduto un
           movimento a quantità sarebbe una doppia uscita (e `mag_giacenze`
           per lui non ha nemmeno una riga: nascerebbe a −1). */
        const aQuantita = daFare.filter((r) => !r.seriale);
        if (aQuantita.length) {
            // le giacenze PRIMA, per sapere quali righe andranno sotto zero: il
            // trigger somma da sé, ma il conto di «quanto restava» va fatto qui.
            // Si legge PER SOCIETÀ: la giacenza di T1 non copre una vendita di T2.
            const codici = [...new Set(aQuantita.map((r) => String(r.codice)))];
            /* SI GUARDA ANCHE IL GEMELLO (Luca 31/08, misurato dal revisore
               01/09). Da oggi la cassa lascia vendere la merce dell'altra
               insegna dello stesso locale — è un magazzino solo, a tre metri —
               e allora anche lo scarico deve togliere DA DOVE LA MERCE STA.
               Guardando solo il negozio dove si batte, un codice del gemello
               non risultava da nessuna parte e il movimento non veniva
               scritto: vendita fatta, magazzino fermo. */
            const { data: prima } = await supabase.from("mag_giacenze")
                .select("codice,quantita,azienda,negozio").in("negozio", await _sede(negozio)).in("codice", codici);
            const chiave = (cod: string, az: string | null | undefined) => cod + "\u0000" + (az || "T1");
            /* quanto ce n'è, sommando le due insegne: sono un magazzino solo */
            const avevo = new Map<string, number>();
            (prima || []).forEach((g: { codice: string; quantita: number; azienda: string | null }) => {
                const k = chiave(g.codice, g.azienda);
                avevo.set(k, (avevo.get(k) || 0) + (Number(g.quantita) || 0));
            });

            /* CHI CE L'HA, CE L'HA. Se la riga non porta la società — è il
               caso delle scorciatoie, che sono un listino di margine e di
               magazzini non sanno niente — non si può lasciar decidere al
               `default 'T1'` della colonna: la SIM Fastweb è di Telefutura 2,
               e scaricarla a Telefutura 1 è esattamente il difetto che
               stiamo chiudendo. Si guarda chi i pezzi ce li ha davvero. */
            const diChiE = new Map<string, string>();
            /* E IN QUALE MAGAZZINO STA: fra le due insegne vince quella che i
               pezzi ce li ha davvero, e a parità quella dove si sta battendo. */
            const doveSta = new Map<string, string>();
            /* IL PAREGGIO SI DECIDE (revisore 01/09). La versione di prima si
               riduceva a «vince l'ultima riga con pezzi», e la query non ha un
               ordinamento: con lo stesso codice in tutte e due le insegne — a
               Magliana esiste, è CN15, due pezzi a W3 e uno al Multi — lo
               scarico poteva togliere il pezzo del gemello lasciando a
               scaffale quelli di qui, e la società del movimento seguiva la
               stessa casualità.
               La regola, in ordine: chi ha pezzi vince su chi non ne ha; a
               parità vince IL NEGOZIO DOVE SI STA BATTENDO — è il posto da cui
               la merce esce fisicamente. */
            const meglioDi = (g: { quantita: number; negozio: string }, altro: { quantita: number; negozio: string } | undefined) => {
                if (!altro) return true;
                const ha = Number(g.quantita) > 0, haAltro = Number(altro.quantita) > 0;
                if (ha !== haAltro) return ha;
                if (g.negozio === negozio) return true;
                if (altro.negozio === negozio) return false;
                return Number(g.quantita) > Number(altro.quantita);
            };
            const vincente = new Map<string, { quantita: number; negozio: string; azienda: string | null }>();
            (prima || []).forEach((g: { codice: string; quantita: number; azienda: string | null; negozio: string }) => {
                if (meglioDi(g, vincente.get(g.codice))) vincente.set(g.codice, g);
            });
            vincente.forEach((g, cod) => {
                doveSta.set(cod, g.negozio);
                if (g.azienda) diChiE.set(cod, g.azienda);
            });

            /* NIENTE GIACENZE FANTASMA (revisore 29/08). Se di quel codice il
               negozio non ha NESSUNA riga — è il caso delle scorciatoie legate
               a un articolo che lì non è mai entrato — non si può inventare un
               movimento: finirebbe sul `default 'T1'` creando una giacenza a
               −1 su una società scelta a caso. Si dice che non si è scaricato
               e lo si mette fra le cose da guardare. */
            const noteQ = aQuantita.filter((r) => !(prima || []).some((g: { codice: string }) => g.codice === String(r.codice)));
            noteQ.forEach((r) => esito.sottoZero.push({ prodotto: String(r.product || r.codice), codice: String(r.codice), restano: 0 }));
            const movimenti = aQuantita.filter((r) => (prima || []).some((g: { codice: string }) => g.codice === String(r.codice))).map((r) => {
                const n = Math.max(1, Number(r.qty) || 1);
                const cod = String(r.codice);
                const az = r.azienda || diChiE.get(cod) || null;
                const k = chiave(cod, az);
                const resta = (avevo.get(k) ?? 0) - n;
                if (resta < 0) esito.sottoZero.push({ prodotto: String(r.product || cod), codice: cod, restano: resta });
                avevo.set(k, resta);
                return {
                    // il movimento va sul magazzino che la merce ce l'ha
                    codice: cod, negozio: doveSta.get(cod) || negozio, tipo: "scarico", quantita: n,
                    // il costo di OGGI: il listino cambia, il margine di questa
                    // vendita va calcolato col costo che aveva quando è uscita
                    costo_unitario: r.costo ?? null,
                    prezzo_unitario: r.price ?? r.importo ?? null,
                    contract_id: contractId, operatore: operatore || null,
                    // e la società di CHI ha la merce: senza, il default 'T1'
                    ...(az ? { azienda: az } : {}),
                };
            });

            /* UNA RIGA PER VOLTA, non un blocco solo: con l'insert in blocco un
               codice sbagliato faceva fallire TUTTO il lotto per violazione della
               chiave esterna, e quattro articoli su cinque restavano non
               scaricati senza che nessuno lo sapesse (revisore 29/08). */
            for (const m of movimenti) {
                const { error } = await supabase.from("mag_movimenti").insert(m);
                if (error) falliti.push(`${m.codice} (${error.message})`);
                else esito.scaricate++;
            }
        }
        if (falliti.length) esito.errore = "non scaricati: " + falliti.join(" · ");
    } catch (e) {
        return { ...esito, scaricate: 0, errore: (e as Error)?.message || "scarico non riuscito" };
    }
    return esito;
}

/** Carico di merce in arrivo (bolla del fornitore o inventario iniziale). */
export async function caricaMerce(
    righe: { codice: string; quantita: number; costo?: number | null }[],
    negozio: string, operatore?: string | null, nota?: string,
): Promise<{ ok: number; errore?: string }> {
    const buone = (righe || []).filter((r) => r.codice && Number(r.quantita) > 0);
    if (!buone.length) return { ok: 0 };
    const { error } = await supabase.from("mag_movimenti").insert(
        buone.map((r) => ({
            codice: r.codice, negozio, tipo: "carico", quantita: Number(r.quantita),
            costo_unitario: r.costo ?? null, operatore: operatore || null, nota: nota || null,
        })),
    );
    return error ? { ok: 0, errore: error.message } : { ok: buone.length };
}

/** L'INVENTARIO: «contati, sono 7». Scrive la differenza come rettifica, così
 *  la giacenza arriva a 7 SENZA cancellare la storia di come ci era arrivata. */
export async function rettificaConteggio(
    codice: string, negozio: string, contati: number, operatore?: string | null, nota?: string,
    azienda?: string | null,
): Promise<{ ok: boolean; delta: number; errore?: string }> {
    /* ⚠️ DUE TRAPPOLE, tutte e due chiuse qui (revisione 02/09; la funzione oggi
       non è ancora chiamata da nessuno, e va sistemata PRIMA che lo sia).
       ① LA GIACENZA È PER ARTICOLO × NEGOZIO × SOCIETÀ, non per articolo ×
          negozio: in 186 casi lo stesso codice nello stesso negozio ha due
          righe. `maybeSingle()` su due righe non torna la prima — torna un
          ERRORE e `data` nullo, quindi `attuale` finiva a 0 e la rettifica
          scriveva un delta pari all'intero conteggio: una duplicazione secca.
       ② IL MAGAZZINO È DEL LOCALE. Con `.eq("negozio")` un inventario fatto a
          «Collatina Multi» non vedeva i pezzi, che stanno sotto «Collatina W3»:
          `attuale = 0`, delta sbagliato, e nasceva una SECONDA riga di giacenza
          sull'insegna che non ha quella merce. */
    const { data: righeGiac } = await supabase.from("mag_giacenze")
        .select("negozio, azienda, quantita").eq("codice", codice);
    const nelLocale = ((righeGiac ?? []) as { negozio: string; azienda: string | null; quantita: number }[])
        .filter((r) => stessoMagazzino(r.negozio, negozio) && (!azienda || r.azienda === azienda));
    if (nelLocale.length > 1) {
        return { ok: false, delta: 0, errore: `«${codice}» in questo punto vendita esiste per ${nelLocale.length} società `
            + `(${nelLocale.map((r) => r.azienda || "senza società").join(", ")}): dimmi di quale stai contando i pezzi.` };
    }
    /* SI RETTIFICA LA RIGA CHE ESISTE DAVVERO: se la merce sta sotto l'insegna
       gemella, il movimento va scritto lì, se no il conteggio giusto crea una
       giacenza nel posto sbagliato e ne restano due. */
    const riga = nelLocale[0];
    if (riga) { negozio = riga.negozio; azienda = riga.azienda; }
    const attuale = Number(riga?.quantita) || 0;
    const delta = Number(contati) - attuale;
    if (delta === 0) {
        await supabase.from("mag_giacenze").update({ contata_il: new Date().toISOString(), contata_da: operatore || null })
            .eq("negozio", negozio).eq("codice", codice);
        return { ok: true, delta: 0 };
    }
    const { error } = await supabase.from("mag_movimenti").insert({
        codice, negozio, azienda: azienda ?? null, tipo: "rettifica", quantita: delta, operatore: operatore || null,
        nota: nota || `inventario: contati ${contati}, il sistema diceva ${attuale}`,
    });
    if (error) return { ok: false, delta, errore: error.message };
    await supabase.from("mag_giacenze").update({ contata_il: new Date().toISOString(), contata_da: operatore || null })
        .eq("negozio", negozio).eq("codice", codice);
    return { ok: true, delta };
}
