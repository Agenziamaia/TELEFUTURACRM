// LETTURA DEL FOGLIO DELL'AVANZAMENTO UFFICIALE — funzioni pure.
//
// Sta a parte, senza un solo import, per una ragione precisa: qui si decide
// che numero entra nel confronto con la nostra produzione, e un errore qui non
// lo vede nessuno. Senza dipendenze si prova a mano, con un file finto, in
// mezzo secondo (scripts/prova_avanzamento.mjs).
//
// Il file dell'operatore è quasi sempre «largo»: una riga per codice di
// inserimento, una colonna per pista.

export type RigaFoglio = { cod_gara: string; pista: string; punti: number | null; pezzi: number | null };

export const COL_IGNORA = "— ignora —";
export const COL_CODICE = "🎯 Codice di inserimento";

/** Toglie righe e celle vuote da quello che esce da SheetJS. */
export function pulisciGriglia(righe: unknown[][]): string[][] {
    return (righe || []).map((r) => (r || []).map((c) => String(c ?? "").trim())).filter((r) => r.some(Boolean));
}

/** L'intestazione è la prima riga con almeno due celle NON numeriche: sopra ci
 *  sono quasi sempre titoli, loghi e date messi dall'operatore. */
export function trovaIntestazione(pulite: string[][]): { i: number; head: string[]; corpo: string[][] } {
    const iHead = pulite.findIndex((r) => r.filter((c) => c && isNaN(Number(c.replace(",", ".")))).length >= 2);
    const i = iHead >= 0 ? iHead : 0;
    return { i, head: pulite[i] || [], corpo: pulite.slice(i + 1) };
}

/** Le cifre di un codice, per confrontarlo con i nostri: «9.000.721.835» e
 *  «9000721835» sono lo stesso codice scritto da due Excel diversi. */
export const soloCifre = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Quante celle di questa colonna sono UN CODICE CHE CONOSCIAMO.
 *  È il riconoscimento che vale più di ogni titolo: il file di WindTre ha una
 *  colonna «COD_GARA» (che sono i nostri codici) e una «COD Lettera di Gara»
 *  (che sono altri numeri), e dal nome vinceva la seconda — perché «COD_GARA»
 *  non ha lo stacco fra «cod» e «gara», e «COD Lettera» sì (Luca 31/08). */
export function quotaCodiciNoti(colonna: string[], noti: string[]): number {
    if (!noti.length) return 0;
    const set = new Set(noti.map(soloCifre).filter(Boolean));
    if (!set.size) return 0;
    const celle = colonna.map((c) => soloCifre(c)).filter(Boolean);
    if (!celle.length) return 0;
    return celle.filter((c) => set.has(c)).length / celle.length;
}

/** Una PROPOSTA di mappatura leggendo i titoli: chi carica la conferma o la
 *  corregge davanti all'anteprima — non la subisce.
 *  Il riconoscimento del codice è STRETTO: `/ins/` nudo prendeva anche
 *  «Insegna», e tre colonne finivano a dire di essere il codice (rilievo del
 *  revisore 31/08). Meglio proporre «ignora» e farsi correggere, che proporre
 *  la colonna sbagliata e non farsi correggere. */
export function proponiMappa(head: string[], piste: { chiave: string; nome: string }[], corpo: string[][] = [], codiciNoti: string[] = []): string[] {
    // PRIMA I NUMERI, POI I TITOLI: se una colonna contiene i codici che
    // abbiamo in anagrafica, è quella, comunque si chiami.
    let iCod = -1, meglio = 0.3;
    if (codiciNoti.length && corpo.length) {
        for (let i = 0; i < head.length; i++) {
            const q = quotaCodiciNoti(corpo.map((r) => r[i]), codiciNoti);
            if (q > meglio) { meglio = q; iCod = i; }
        }
    }
    const perTitolo = (n: string) => /(^|\b)cod(ice|\.)?\b|cod\.?\s*ins|c\.?\s*ins\b|codins|cod_/.test(n) && !/prod/.test(n);
    return head.map((h, i) => {
        const n = String(h || "").toLowerCase().trim();
        if (iCod >= 0) { if (i === iCod) return COL_CODICE; }
        else if (perTitolo(n)) return COL_CODICE;
        const p = piste.find((x) => n.includes(x.chiave) || n.includes(String(x.nome || "").toLowerCase().split(" ")[0]));
        return p ? p.nome : COL_IGNORA;
    });
}

/** Che cosa non torna nella mappatura, PRIMA di salvare. Sono i due modi in
 *  cui il file dell'operatore fa entrare un numero sbagliato senza che nessuno
 *  se ne accorga (revisore 31/08):
 *   • due colonne che dicono di essere il codice → ne vince una a caso;
 *   • due colonne sulla stessa pista («Mobile Consumer» e «Mobile Business»)
 *     → prima ne restava una sola, adesso si SOMMANO, ma va detto. */
export function diagnosiMappa(head: string[], mappa: string[], piste: { chiave: string; nome: string }[]): {
    codici: number[];               // indici delle colonne che dicono di essere il codice
    sommate: { pista: string; colonne: string[] }[];
    senzaCodice: boolean; senzaPiste: boolean;
} {
    const codici = mappa.map((m, i) => (m === COL_CODICE ? i : -1)).filter((i) => i >= 0);
    const per = new Map<string, string[]>();
    mappa.forEach((m, i) => {
        const p = piste.find((x) => x.nome === m);
        if (!p) return;
        const l = per.get(p.nome) || []; l.push(head[i] || `colonna ${i + 1}`); per.set(p.nome, l);
    });
    return {
        codici,
        sommate: [...per.entries()].filter(([, c]) => c.length > 1).map(([pista, colonne]) => ({ pista, colonne })),
        senzaCodice: codici.length === 0,
        senzaPiste: per.size === 0,
    };
}

/** IL NUMERO DELLA CELLA, o niente.
 *
 *  La prima versione teneva le cifre e buttava via tutto il resto, e quindi
 *  INVENTAVA numeri dove non ce n'erano (misure del revisore 31/08):
 *    «30/40» (fatto su target) → 3040 · «12,5 pt su 20» → 12,52
 *    «3 (di cui 1 biz)» → 31 · «25/08/2026» → 25082026
 *  Nessuno se ne accorgeva, perché l'anteprima mostra il FILE, non il numero
 *  che ne esce. Qui invece la cella o è un numero pulito, o è `null` — e la
 *  finestra dice quante celle ha scartato.
 *
 *  NULL non è zero: la cella vuota, un trattino, un «n.d.» significano «non
 *  me l'hanno mandato», e trattarli come zero inventerebbe uno scarto.
 *
 *  Separatori: la VIRGOLA in un file italiano è sempre decimale; il PUNTO è
 *  decimale solo se non separa un gruppo di tre cifre — così «1.234» fa 1234 e
 *  «30.5» resta 30,5 (le SIM Sky valgono mezzo punto l'una). */
const CODA_UNITA = /\s*(?:%|pt|punti|pz|pezzi|€|eur)\.?$/i;
export function numeroIt(v: unknown): number | null {
    let t = String(v ?? "").trim();
    if (!t) return null;
    let neg = false;
    const par = /^\((.*)\)$/.exec(t);            // (12,5) = negativo contabile
    if (par) { neg = true; t = par[1].trim(); }
    t = t.replace(CODA_UNITA, "").trim();
    if (t.startsWith("-")) { neg = !neg; t = t.slice(1).trim(); }
    // da qui in poi deve restare SOLO un numero: se avanza altro, non è un numero
    if (!/^[\d.,'\u2019\s]+$/.test(t)) return null;
    const ultimo = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
    let intero = t, dec = "";
    if (ultimo >= 0) {
        const dopo = t.slice(ultimo + 1).replace(/\D/g, "");
        const decimale = t[ultimo] === "," || dopo.length !== 3;
        if (decimale) { intero = t.slice(0, ultimo); dec = dopo; }
    }
    const ci = intero.replace(/\D/g, "");
    if (!ci && !dec) return null;
    const n = Number((ci || "0") + (dec ? "." + dec : ""));
    if (!Number.isFinite(n)) return null;
    return neg ? -n : n;
}

/** Le celle che AVEVANO qualcosa scritto e non erano numeri: la finestra le
 *  dichiara, invece di lasciarle cadere in silenzio. */
export function celleScartate(griglia: string[][], mappa: string[], piste: { chiave: string; nome: string }[]): { valore: string; colonna: number }[] {
    const colonne = mappa.map((m, i) => ({ i, ok: piste.some((p) => p.nome === m) })).filter((x) => x.ok);
    const out: { valore: string; colonna: number }[] = [];
    for (const r of griglia) for (const { i } of colonne) {
        const v = String(r[i] ?? "").trim();
        if (v && numeroIt(v) == null) out.push({ valore: v, colonna: i });
    }
    return out;
}

/** UN FOGLIO PER UNA PISTA SOLA (Luca 31/08: «WindTre ci manda tre file
 *  diversi: uno per il mobile, uno per il fisso e uno per la partnership»).
 *  Qui la pista non è una colonna, è il FILE: si sceglie prima, e del foglio
 *  servono solo due colonne — il codice e il valore.
 *
 *  La proposta guarda il CONTENUTO, non i titoli: la colonna del valore in
 *  questi file si chiama «Punti», «Totale», «Progressivo», «Agosto»… e non
 *  c'è verso di indovinarla dal nome. Vince quella con più celle numeriche;
 *  il codice è la prima colonna che di numeri non ne ha quasi. */
/** Quanto una colonna «sembra» la colonna dei valori di una pista.
 *  Serve perché nei file veri il titolo non aiuta: nel foglio Partnership
 *  Rewards di WindTre la colonna giusta si chiama «Somma di …» come altre
 *  quaranta, e la scelta a occhio prendeva una colonna di zeri e uni (Luca
 *  31/08). Allora si guarda che cosa c'è dentro: le colonne di bandierine
 *  (solo 0 e 1) valgono poco, quelle con numeri veri e diversi fra loro
 *  valgono di più, e il titolo che nomina la pista vale un bonus. */
export function punteggioColonnaValore(celle: string[], titolo: string, nomePista: string): number {
    const vivi = celle.map((c) => String(c ?? "").trim()).filter(Boolean);
    if (!vivi.length) return -1;
    const num = vivi.map((c) => numeroIt(c)).filter((n): n is number => n != null);
    const quota = num.length / vivi.length;
    if (quota < 0.5) return -1;                       // non è una colonna di numeri
    const distinti = new Set(num).size;
    const somma = num.reduce((t, n) => t + Math.abs(n), 0);
    const bandierine = num.every((n) => n === 0 || n === 1);
    const t = String(titolo || "").toLowerCase();
    const parole = [...String(nomePista || "").toLowerCase().split(/\s+/).filter((w) => w.length > 2), ...SINONIMI_PISTA[String(nomePista || "").toLowerCase()] || []];
    const generiche = ["progress", "totale", "punti", "pezzi", "avanz", "valore", "reward"];
    let p = 0;
    if (parole.some((w) => t.includes(w))) p += 100;
    if (generiche.some((w) => t.includes(w))) p += 40;
    if (bandierine) p -= 60;                          // 0/1: è un flag, non un punteggio
    if (somma === 0) p -= 80;                         // tutta a zero: non dice niente
    p += Math.min(20, distinti * 2) + Math.min(20, Math.log10(1 + somma) * 8);
    return p;
}

/** Sinonimi con cui gli operatori chiamano le nostre piste nei loro fogli. */
const SINONIMI_PISTA: Record<string, string[]> = {
    "customer base": ["partnership", "reward", "cb"],
    "mobile": ["sim", "mnp", "linee"],
    "fisso": ["fibra", "wireline", "fwa"],
    "luce & gas": ["energia", "luce", "gas", "commodity"],
    "protetti": ["kit", "protezione"],
};

export function proponiMappaUnaPista(head: string[], corpo: string[][], nomePista: string, codiciNoti: string[] = []): string[] {
    const n = head.length;
    // ① la colonna che contiene i NOSTRI codici, comunque si chiami
    let iCod = -1, mCod = 0.3;
    for (let i = 0; i < n; i++) {
        const q = quotaCodiciNoti(corpo.map((r) => r[i]), codiciNoti);
        if (q > mCod) { mCod = q; iCod = i; }
    }
    // ② altrimenti il titolo, ③ altrimenti la prima colonna che di numeri non ne ha
    if (iCod < 0) iCod = head.findIndex((h) => /(^|\b)cod(ice|\.)?\b|cod\.?\s*ins|c\.?\s*ins\b|codins|cod_/i.test(String(h || "")));
    if (iCod < 0) {
        for (let i = 0; i < n; i++) {
            const celle = corpo.map((r) => String(r[i] ?? "").trim()).filter(Boolean);
            const q = celle.length ? celle.filter((c) => numeroIt(c) != null).length / celle.length : 0;
            if (q < 0.5) { iCod = i; break; }
        }
    }
    // la colonna del valore: vince il punteggio, non l'ordine
    const classifica = classificaColonneValore(head, corpo, nomePista, iCod);
    const iVal = classifica.length ? classifica[0].i : -1;
    return head.map((_, i) => (i === iCod ? COL_CODICE : i === iVal ? nomePista : COL_IGNORA));
}

/** Le colonne candidate a portare i numeri della pista, dalla più probabile.
 *  La finestra la mostra come elenco: su un foglio da 47 colonne indovinare
 *  non basta, bisogna far scegliere in fretta. */
export function classificaColonneValore(head: string[], corpo: string[][], nomePista: string, escludi = -1): { i: number; titolo: string; punteggio: number; esempio: string; totale: number }[] {
    const out: { i: number; titolo: string; punteggio: number; esempio: string; totale: number }[] = [];
    for (let i = 0; i < head.length; i++) {
        if (i === escludi) continue;
        const celle = corpo.map((r) => String(r[i] ?? ""));
        const p = punteggioColonnaValore(celle, head[i] || "", nomePista);
        if (p < 0) continue;
        const num = celle.map((c) => numeroIt(c)).filter((x): x is number => x != null);
        out.push({
            i, titolo: head[i] || `colonna ${i + 1}`, punteggio: p,
            esempio: celle.filter(Boolean).slice(0, 3).join(" · "),
            totale: Math.round(num.reduce((t, x) => t + x, 0) * 100) / 100,
        });
    }
    return out.sort((a, b) => b.punteggio - a.punteggio);
}

/** Dalla griglia + mappatura alle righe da salvare.
 *  Se due colonne puntano alla stessa pista si SOMMANO: «Mobile Consumer» e
 *  «Mobile Business» sono due colonne di un mobile solo. Prima uscivano due
 *  righe con la stessa chiave e il salvataggio ne teneva UNA (l'ultima): il
 *  mobile ufficiale di Magliana diventava 5 invece di 33, e il contatore a
 *  video diceva pure un numero diverso da quello salvato (revisore 31/08). */
export function righeDaGriglia(griglia: string[][], mappa: string[], piste: { chiave: string; nome: string }[]): RigaFoglio[] {
    const iCodice = mappa.indexOf(COL_CODICE);
    if (iCodice < 0) return [];
    const colonne = mappa.map((m, i) => ({ i, chiave: piste.find((p) => p.nome === m)?.chiave || null }))
        .filter((x): x is { i: number; chiave: string } => !!x.chiave);
    const somme = new Map<string, { cod_gara: string; pista: string; punti: number }>();
    for (const r of griglia) {
        const cod = String(r[iCodice] || "").trim();
        if (!cod) continue;
        for (const { i, chiave } of colonne) {
            const punti = numeroIt(r[i]);
            if (punti == null) continue;
            const k = `${cod}|${chiave}`;
            const cur = somme.get(k);
            if (cur) cur.punti = Math.round((cur.punti + punti) * 100) / 100;
            else somme.set(k, { cod_gara: cod, pista: chiave, punti });
        }
    }
    return [...somme.values()].map((x) => ({ ...x, pezzi: null }));
}
