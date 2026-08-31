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
// colonna»: si prende il numero ATTACCATO ALL'UNITÀ (GG.), che è il saldo.
// Prendere l'ultimo numero della riga — come faceva la prima versione —
// bastava finché la riga finiva lì; con una colonna in più dopo l'unità
// scriveva un numero a caso senza dare errore.
//
// E il SEGNO MENO conta: chi ha le ferie in rosso non ha giorni da prendere.
//
// I permessi (Perm.Ex-Fs) NON sono ferie e sono in ORE: la riga si riconosce e
// si scarta, altrimenti un giorno ci si ritrova cinque ore contate come cinque
// giorni.

export type SaldoBusta = { giorni: number | null; riga: string | null; motivo?: string; contesto?: string[] };

/* Quando non si trova il saldo, serve VEDERE com'è fatto il cedolino: si
   riportano le righe attorno a RATEI (o a FERIE). Senza questo si resta a
   indovinare, ed è quello che è successo con le buste di luglio. */
function intorno(righe: string[]): string[] {
    let i = righe.findIndex((r) => /\bratei\b/i.test(r));
    if (i < 0) i = righe.findIndex((r) => /ferie/i.test(r));
    if (i < 0) return righe.slice(-8);
    return righe.slice(Math.max(0, i - 1), i + 8);
}

const numero = (s: string): number | null => {
    const t = String(s).trim();
    // formato italiano: il punto separa le migliaia, la virgola i decimali.
    // Ma «4.33333» esiste (esportazioni con il punto decimale): un gruppo di
    // cifre dopo il punto diverso da 3 NON è una migliaia.
    let corpo = t.replace(/^[-−–]/, "");
    corpo = /,/.test(corpo)
        ? corpo.replace(/\./g, "").replace(",", ".")
        : (/\.\d{3}(?!\d)/.test(corpo) ? corpo.replace(/\./g, "") : corpo);
    const n = Number(corpo);
    if (!Number.isFinite(n)) return null;
    return /^[-−–]/.test(t) ? -n : n;   // IL SEGNO MENO NON SI PERDE
};

/* i numeri di una riga, col loro segno e con quello che li segue: serve a
   capire QUALE numero è il saldo, non a prendere l'ultimo e sperare */
/* l'ordine delle alternative È la regola: prima l'italiano con i decimali,
   poi le migliaia col punto (gruppi di TRE, non seguiti da altre cifre), e
   solo in fondo il numero semplice — che così si prende «4.33333» intero
   invece di spezzarlo in «4.333» e «33» */
const NUM = /([-−–]?)(\d{1,4}(?:\.\d{3})*,\d+|\d{1,3}(?:\.\d{3})+(?!\d)|\d+(?:\.\d+)?)/g;

/** Cerca il saldo ferie nel riquadro RATEI di un cedolino. */
export function saldoFerieDaTesto(testo: string): SaldoBusta {
    const righe = String(testo || "").split(/\r?\n/).map((r) => r.replace(/\s+/g, " ").trim()).filter(Boolean);
    /* LA RIGA GIUSTA. «FERIE» da sola, non «FERIE GODUTE», non «FERIE RESIDUE
       ANNI PREC.», non «Perm.Ex-Fs»: quelle sono altre voci, e prendendole si
       scrive un residuo che non esiste. Il commento di prima diceva di
       escluderle ma la condizione (^ferie\b) le accettava tutte. */
    const escluse = /\b(godut|matur|residu|anni?\s+prec|anno\s+precedente|spettant|liquidat|pagat)/i;
    // «FERIE» a inizio riga, anche dopo un codice di voce («01 FERIE»), e non
    // una delle altre voci che contengono la stessa parola
    const eFerieRatei = (r: string) => /^(?:[0-9]{1,4}[.)\-]?\s+)?ferie\b/i.test(r) && !escluse.test(r);
    const conNumeri = (r: string) => /\d/.test(r);
    let candidate = righe.filter((r) => eFerieRatei(r) && conNumeri(r));
    /* SECONDO TENTATIVO: la parola FERIE in mezzo alla riga. Succede quando il
       riquadro RATEI viene estratto insieme alla colonna di sinistra e la riga
       comincia con un'altra voce. */
    if (!candidate.length) candidate = righe.filter((r) => /\bferie\b/i.test(r) && !escluse.test(r) && /\bgg\b|\bgiorni\b/i.test(r) && conNumeri(r));
    /* TERZO TENTATIVO: l'etichetta è sola sulla sua riga e i numeri stanno
       nelle due righe dopo (colonne composte come blocchi separati). */
    if (!candidate.length) {
        for (let i = 0; i < righe.length; i++) {
            if (!/^ferie\b/i.test(righe[i]) || escluse.test(righe[i])) continue;
            const unito = righe.slice(i, i + 3).join(" ");
            if (/\d/.test(unito)) { candidate = [unito]; break; }
        }
    }
    if (!candidate.length) {
        const forse = righe.find((r) => /ferie/i.test(r) && conNumeri(r));
        return { giorni: null, riga: forse ?? null, contesto: intorno(righe), motivo: forse ? "riga FERIE non riconosciuta (forse è «ferie godute» o «residue anni prec.»)" : "nessuna riga FERIE con numeri" };
    }
    /* se ce n'è più d'una si prova dall'ULTIMA (il riquadro RATEI sta in fondo)
       ma senza arrendersi alla prima che non va: una riga in ore non deve
       oscurare quella in giorni che sta più su */
    let ultimoMotivo = "riga non interpretabile";
    let ultimaRiga: string | null = null;
    for (let i = candidate.length - 1; i >= 0; i--) {
        const riga = candidate[i];
        ultimaRiga = ultimaRiga ?? riga;
        const inGiorni = /\bgg\b|\bgiorni\b/i.test(riga);
        const inOre = /\bore\b|\bhh\b/i.test(riga);
        // in ore e non in giorni: sono permessi, cinque ore non sono cinque giorni
        if (inOre && !inGiorni) { ultimoMotivo = "la riga è in ore, non in giorni"; continue; }
        const trovati: { v: number; dopo: string }[] = [];
        NUM.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = NUM.exec(riga))) {
            const v = numero(m[1] + m[2]);
            if (v != null) trovati.push({ v, dopo: riga.slice(m.index + m[0].length, m.index + m[0].length + 12) });
        }
        if (!trovati.length) { ultimoMotivo = "nessun numero nella riga"; continue; }
        /* IL SALDO È IL NUMERO ATTACCATO ALL'UNITÀ, non l'ultimo della riga.
           Prendere l'ultimo bastava finché la riga finiva col saldo; ma se dopo
           «GG.» c'è un'altra colonna (un progressivo, un importo, delle ore),
           l'ultimo numero è quello sbagliato e nessuno se ne accorge. */
        const conUnita = trovati.filter((t) => /^\s*(gg\.?|giorni)\b/i.test(t.dopo));
        const scelto = conUnita.length ? conUnita[conUnita.length - 1] : (inGiorni ? null : trovati[trovati.length - 1]);
        if (!scelto) { ultimoMotivo = "non capisco quale numero sia il saldo in giorni"; continue; }
        // un saldo ferie fuori scala è un numero letto male (un importo, un
        // progressivo): meglio dirlo che scriverlo
        if (Math.abs(scelto.v) > 200) { ultimoMotivo = `il numero letto (${scelto.v}) non è un saldo ferie plausibile`; continue; }
        return { giorni: scelto.v, riga };
    }
    return { giorni: null, riga: ultimaRiga, contesto: intorno(righe), motivo: ultimoMotivo };
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
        /* ⚠️ LE RIGHE NON SI RAGGRUPPANO PER ALTEZZA ESATTA. Prima si faceva
           Math.round(y): in un cedolino vero l'etichetta e i numeri sono
           composti con font diversi e le loro basi stanno a 245,6 e 244,9 —
           che arrotondati sono DUE righe. Risultato: «FERIE» su una riga e
           «4,33333» su un'altra, e il saldo non si trovava mai. (È quello che
           è successo su tutte e 24 le buste di luglio: zero lette.)
           Si raggruppa per vicinanza, con la tolleranza presa dall'altezza
           del carattere: mezza riga di testo. */
        const pezziPag = (cont.items as { str: string; transform: number[]; height?: number }[])
            .filter((it) => it.str && it.str.trim())
            .map((it) => ({ x: it.transform[4], y: it.transform[5], t: it.str, h: Math.abs(it.transform[3]) || it.height || 8 }))
            .sort((a, b) => b.y - a.y || a.x - b.x);
        let gruppo: typeof pezziPag = [];
        let yRif = Number.NaN;
        let tol = 3;
        const chiudi = () => {
            if (!gruppo.length) return;
            fuori.push(gruppo.sort((a, b) => a.x - b.x).map((z) => z.t).join(" ").replace(/\s+/g, " ").trim());
            gruppo = [];
        };
        for (const z of pezziPag) {
            if (!gruppo.length || Math.abs(z.y - yRif) <= tol) {
                if (!gruppo.length) { yRif = z.y; tol = Math.max(2, z.h * 0.6); }
                gruppo.push(z);
            } else { chiudi(); yRif = z.y; tol = Math.max(2, z.h * 0.6); gruppo.push(z); }
        }
        chiudi();
    }
    return fuori.join("\n");
}
