// ═══════════════════════════════════════════════════════════════════════════
// LO SCARICO DAL MAGAZZINO (Luca 28/08 notte)
//
// «Vai a scaricare il prodotto»: è la frase che separa un CRM da un software
// di cassa. Finché la vendita registra solo quanto abbiamo guadagnato, il
// magazzino resta un foglio a parte; da qui in poi vendere TOGLIE il pezzo.
//
// Due regole che vengono dal negozio, non dal codice:
//
//  1. UNA VENDITA NON SI FERMA PER UN DATO INDIETRO. Se la giacenza dice zero
//     ma il pezzo è lì in mano al cliente, si vende lo stesso e la giacenza va
//     in negativo: il negativo è un'informazione («qui il conto non torna»),
//     il blocco sarebbe un incasso perso.
//
//  2. LO SCARICO NON PUÒ FAR FALLIRE IL SALVATAGGIO. La vendita è già scritta
//     e lo scontrino può essere già stampato: se il movimento non parte si
//     annota e si va avanti. Un magazzino disallineato si sistema; una vendita
//     persa no.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from "@/lib/supabaseClient";

export type RigaDaScaricare = {
    codice?: string | null;
    scaricaMagazzino?: boolean;
    qty?: number | null;
    costo?: number | null;
    price?: number | null;
    importo?: number | null;
    product?: string | null;
};

export type EsitoScarico = {
    scaricate: number;
    saltate: number;
    /** le righe che hanno portato la giacenza sotto zero: il negozio le deve
     *  contare. Non è un errore del software, è un conto che non torna. */
    sottoZero: { prodotto: string; codice: string; restano: number }[];
    errore?: string;
};

/** Toglie dal magazzino i prodotti di una vendita.
 *  Da chiamare DOPO che la vendita è salvata, mai prima. */
export async function scaricaVendita(
    righe: RigaDaScaricare[],
    negozio: string,
    contractId: string | null,
    operatore?: string | null,
): Promise<EsitoScarico> {
    const esito: EsitoScarico = { scaricate: 0, saltate: 0, sottoZero: [] };
    const daFare = (righe || []).filter((r) => r.scaricaMagazzino && r.codice);
    esito.saltate = (righe || []).length - daFare.length;
    if (!daFare.length || !negozio) return esito;

    try {
        // le giacenze PRIMA, per sapere quali righe andranno sotto zero: il
        // trigger somma da sé, ma il conto di «quanto restava» va fatto qui
        const codici = [...new Set(daFare.map((r) => String(r.codice)))];
        const { data: prima } = await supabase.from("mag_giacenze")
            .select("codice,quantita").eq("negozio", negozio).in("codice", codici);
        const avevo = new Map<string, number>((prima || []).map((g: { codice: string; quantita: number }) => [g.codice, Number(g.quantita) || 0]));

        const movimenti = daFare.map((r) => {
            const n = Math.max(1, Number(r.qty) || 1);
            const cod = String(r.codice);
            const resta = (avevo.get(cod) ?? 0) - n;
            if (resta < 0) esito.sottoZero.push({ prodotto: String(r.product || cod), codice: cod, restano: resta });
            avevo.set(cod, resta);
            return {
                codice: cod, negozio, tipo: "scarico", quantita: n,
                // il costo di OGGI: il listino cambia, il margine di questa
                // vendita va calcolato col costo che aveva quando è uscita
                costo_unitario: r.costo ?? null,
                prezzo_unitario: r.price ?? r.importo ?? null,
                contract_id: contractId, operatore: operatore || null,
            };
        });

        const { error } = await supabase.from("mag_movimenti").insert(movimenti);
        if (error) return { ...esito, scaricate: 0, errore: error.message };
        esito.scaricate = movimenti.length;
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
): Promise<{ ok: boolean; delta: number; errore?: string }> {
    const { data } = await supabase.from("mag_giacenze")
        .select("quantita").eq("negozio", negozio).eq("codice", codice).maybeSingle();
    const attuale = Number(data?.quantita) || 0;
    const delta = Number(contati) - attuale;
    if (delta === 0) {
        await supabase.from("mag_giacenze").update({ contata_il: new Date().toISOString(), contata_da: operatore || null })
            .eq("negozio", negozio).eq("codice", codice);
        return { ok: true, delta: 0 };
    }
    const { error } = await supabase.from("mag_movimenti").insert({
        codice, negozio, tipo: "rettifica", quantita: delta, operatore: operatore || null,
        nota: nota || `inventario: contati ${contati}, il sistema diceva ${attuale}`,
    });
    if (error) return { ok: false, delta, errore: error.message };
    await supabase.from("mag_giacenze").update({ contata_il: new Date().toISOString(), contata_da: operatore || null })
        .eq("negozio", negozio).eq("codice", codice);
    return { ok: true, delta };
}
