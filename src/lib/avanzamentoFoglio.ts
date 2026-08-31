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

/** Una PROPOSTA di mappatura leggendo i titoli: chi carica la conferma o la
 *  corregge davanti all'anteprima — non la subisce.
 *  Il riconoscimento del codice è STRETTO: `/ins/` nudo prendeva anche
 *  «Insegna», e tre colonne finivano a dire di essere il codice (rilievo del
 *  revisore 31/08). Meglio proporre «ignora» e farsi correggere, che proporre
 *  la colonna sbagliata e non farsi correggere. */
export function proponiMappa(head: string[], piste: { chiave: string; nome: string }[]): string[] {
    return head.map((h) => {
        const n = String(h || "").toLowerCase().trim();
        if (/(^|\b)cod(ice|\.)?\b|cod\.?\s*ins|c\.?\s*ins\b|codins/.test(n) && !/prod/.test(n)) return COL_CODICE;
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

/** Numero all'italiana: «1.234,5» → 1234.5.
 *  NULL, non zero, quando il numero non c'è: la cella vuota, un trattino o un
 *  «n.d.» significano «non me l'hanno mandato», e trattarli come zero
 *  inventerebbe uno scarto che non esiste (la prova lo aveva colto: «n.d.»
 *  diventava 0 e faceva comparire un −33 finto).
 *  Il punto si toglie solo quando separa le migliaia — «1.5» resta 1,5. */
export function numeroIt(v: unknown): number | null {
    const t = String(v ?? "").trim();
    if (!t) return null;
    const pulito = t.replace(/[.\s](?=\d{3}(\D|$))/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    if (!/\d/.test(pulito)) return null;
    const n = Number(pulito);
    return Number.isFinite(n) ? n : null;
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
