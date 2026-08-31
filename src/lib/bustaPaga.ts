// IL SALDO FERIE DENTRO LA BUSTA PAGA (Luca 31/08).
//
// In fondo al cedolino c'è il riquadro RATEI, fatto così:
//
//     RATEI
//                    Residuo AP   Maturato   Goduto   Saldo
//     FERIE                        4,33333             4,33333   GG.
//     Perm.Ex-Fs                   5,33333             5,33333   ORE
//
// Quello che serve è il SALDO della riga FERIE, in GIORNI. Le colonne vuote
// non lasciano segno nel testo estratto, quindi non si può contare «la quarta
// colonna»: si prende l'ULTIMO numero della riga prima dell'unità. È la
// lettura che regge anche quando Residuo AP e Goduto sono valorizzati, perché
// il saldo è sempre l'ultimo.
//
// I permessi (Perm.Ex-Fs) NON sono ferie e sono in ORE: la riga si riconosce e
// si scarta, altrimenti un giorno ci si ritrova cinque ore contate come cinque
// giorni.

export type SaldoBusta = { giorni: number | null; riga: string | null; motivo?: string };

const numero = (s: string): number | null => {
    const n = Number(String(s).replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
};

/** Cerca il saldo ferie nel testo di un cedolino. */
export function saldoFerieDaTesto(testo: string): SaldoBusta {
    const righe = String(testo || "").split(/\r?\n/).map((r) => r.replace(/\s+/g, " ").trim()).filter(Boolean);
    // la riga giusta comincia per FERIE (non «Perm.», non «Ferie godute» di
    // altri riquadri) e porta i numeri con la virgola
    const candidate = righe.filter((r) => /^ferie\b/i.test(r) && /\d+[.,]\d/.test(r));
    if (!candidate.length) {
        const forse = righe.find((r) => /ferie/i.test(r) && /\d+[.,]\d/.test(r));
        return { giorni: null, riga: forse ?? null, motivo: forse ? "riga FERIE non riconosciuta" : "nessuna riga FERIE con numeri" };
    }
    // se ce n'è più d'una vince l'ultima: il riquadro RATEI sta in fondo
    const riga = candidate[candidate.length - 1];
    // niente ORE: quella è la riga dei permessi, non delle ferie
    if (/\bore\b/i.test(riga) && !/\bgg\b/i.test(riga)) return { giorni: null, riga, motivo: "la riga è in ore, non in giorni" };
    const numeri = (riga.match(/\d{1,4}(?:\.\d{3})*,\d+|\d{1,4},\d+|\b\d{1,4}\b/g) || []).map(numero).filter((x): x is number => x != null);
    if (!numeri.length) return { giorni: null, riga, motivo: "nessun numero nella riga" };
    return { giorni: numeri[numeri.length - 1], riga };
}

/** Il testo di un PDF, con pdfjs. Ogni riga del cedolino torna una riga di
 *  testo: gli elementi si raggruppano per altezza, perché pdfjs li restituisce
 *  come frammenti sparsi e senza questo «FERIE» e «4,33333» finirebbero
 *  separati. */
export async function testoPdf(dati: Uint8Array): Promise<string> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: dati, isEvalSupported: false, useSystemFonts: false }).promise;
    const fuori: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
        const pagina = await doc.getPage(p);
        const cont = await pagina.getTextContent();
        const per = new Map<number, { x: number; t: string }[]>();
        for (const it of cont.items as { str: string; transform: number[] }[]) {
            if (!it.str) continue;
            const y = Math.round(it.transform[5]);
            const riga = per.get(y) || [];
            riga.push({ x: it.transform[4], t: it.str });
            per.set(y, riga);
        }
        [...per.entries()].sort((a, b) => b[0] - a[0]).forEach(([, pezzi]) => {
            fuori.push(pezzi.sort((a, b) => a.x - b.x).map((z) => z.t).join(" "));
        });
    }
    return fuori.join("\n");
}
