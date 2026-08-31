// LE ASSENZE: come si contano i giorni, e come si costruiscono i due fogli.
//
// Sta qui, e non dentro la pagina, perché gli stessi numeri escono da due
// posti: il bottone Excel che preme l'amministrazione e l'email automatica del
// primo del mese. Due copie della stessa regola divergono sempre — è già
// successo con `giorniEffettivi`, che era una seconda scrittura della stessa
// aritmetica.

export type CellaFoglio = string | number | null | undefined;

/** Un giorno di assenza vale otto ore: la giornata piena del tempo pieno.
 *  Sta scritto anche nell'intestazione della colonna, così chi legge il file
 *  sa da dove esce il numero. */
export const ORE_AL_GIORNO = 8;

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const dataIt = (s: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");

/** UN DECIMALE SOLO, SEMPRE PER ECCESSO (Luca 31/08): «se è 7,15 deve
 *  arrotondarlo a 7,2; anche se fosse 7,12, arrotondalo a 7,2».
 *  Per eccesso e non al più vicino: sulle ore di assenza l'errore deve
 *  cadere a favore di chi è stato assente, non dell'azienda — e comunque il
 *  numero che va al consulente dev'essere sempre lo stesso, non dipendere da
 *  quante cifre si porta dietro una somma di mezze giornate.
 *  Il ×10 passa da un intero per non incappare nei decimali del binario:
 *  7,15 × 10 in virgola mobile fa 71,49999… e `ceil` darebbe 7,2 per caso. */
export const arrotondaGiorni = (n: number): number => {
    if (!Number.isFinite(n)) return 0;
    const decimi = Math.round(n * 1000) / 100;      // decimi, con la coda ripulita
    return Math.ceil(decimi - 1e-9) / 10;
};

export type Giornata = { giorno: string; quota: number };

/** I giorni di un'assenza che cadono DENTRO il periodo, al netto di domeniche
 *  e festivi. Il sabato è lavorativo (deciso da Luca il 31/08).
 *  `mezza` = mezza giornata: vale 0,5 e riguarda un giorno solo. */
export function giornateAssenza(
    dal0: string, al0: string, da: string, a: string,
    festivi: Set<string>, mezza = false,
): Giornata[] {
    const dal = dal0 < da ? da : dal0;
    const al = al0 > a ? a : al0;
    if (!dal || !al || dal > al) return [];
    const out: Giornata[] = [];
    const d = new Date(dal + "T12:00");
    const fine = new Date(al + "T12:00");
    let guardia = 0;
    while (d <= fine && guardia++ < 800) {
        const g = ymd(d);
        if (d.getDay() !== 0 && !festivi.has(g)) out.push({ giorno: g, quota: mezza ? 0.5 : 1 });
        d.setDate(d.getDate() + 1);
    }
    // la mezza giornata riguarda un giorno solo: il primo che cade nel periodo
    return mezza ? out.slice(0, 1) : out;
}

export type RigaAssenza = {
    persona: string;
    negozio: string;
    /** le date VERE dell'assenza, non quelle tagliate al periodo */
    dal: string;
    al: string;
    giorni: number;
    giornate?: Giornata[];
    extra?: Record<string, CellaFoglio>;
};

export type FoglioExcel = { nome: string; intestazioni: string[]; righe: CellaFoglio[][] };

/** I DUE FOGLI: dettaglio e riepilogo.
 *  Nel riepilogo i giorni si UNISCONO, non si sommano: due certificati
 *  sovrapposti dello stesso collaboratore davano 36 giorni in un mese che ne
 *  ha 25 lavorativi. */
export function fogliAssenze(righe: RigaAssenza[], colonneExtra: string[] = []): FoglioExcel[] {
    const dettaglio: CellaFoglio[][] = righe.map((r) => {
        const g = arrotondaGiorni(r.giorni);
        return [r.persona, r.negozio, dataIt(r.dal), dataIt(r.al), g, arrotondaGiorni(g * ORE_AL_GIORNO), ...colonneExtra.map((c) => r.extra?.[c] ?? "")];
    });

    const per = new Map<string, { persona: string; negozii: Set<string>; giorni: Map<string, number>; righe: number }>();
    for (const r of righe) {
        const v = per.get(r.persona) || { persona: r.persona, negozii: new Set<string>(), giorni: new Map<string, number>(), righe: 0 };
        v.righe++;
        if (r.negozio) v.negozii.add(r.negozio);
        for (const g of r.giornate || []) v.giorni.set(g.giorno, Math.max(v.giorni.get(g.giorno) ?? 0, g.quota));
        per.set(r.persona, v);
    }
    const riepilogo: CellaFoglio[][] = [...per.values()]
        .map((v) => ({
            persona: v.persona,
            negozio: [...v.negozii].sort().join(" · "),
            righe: v.righe,
            giorni: arrotondaGiorni([...v.giorni.values()].reduce((t, q) => t + q, 0)),
        }))
        .sort((x, y) => y.giorni - x.giorni || x.persona.localeCompare(y.persona))
        .map((v) => [v.persona, v.negozio, v.righe, v.giorni, arrotondaGiorni(v.giorni * ORE_AL_GIORNO)]);

    return [
        { nome: "Dettaglio", intestazioni: ["Collaboratore", "Negozio", "Dal", "Al", "Giorni", `Ore (${ORE_AL_GIORNO}h/giorno)`, ...colonneExtra], righe: dettaglio },
        { nome: "Riepilogo", intestazioni: ["Collaboratore", "Negozio", "Assenze", "Giorni totali", `Ore totali (${ORE_AL_GIORNO}h/giorno)`], righe: riepilogo },
    ];
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export const nomeMese = (iso: string) => `${MESI[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** Il mese PRECEDENTE a una data, come primo e ultimo giorno. */
export function mesePrecedente(rif = new Date()): { da: string; a: string; iso: string } {
    const primo = new Date(rif.getFullYear(), rif.getMonth() - 1, 1);
    const ultimo = new Date(primo.getFullYear(), primo.getMonth() + 1, 0);
    return { da: ymd(primo), a: ymd(ultimo), iso: `${primo.getFullYear()}-${String(primo.getMonth() + 1).padStart(2, "0")}-01` };
}
