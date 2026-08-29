// ═══════════════════════════════════════════════════════════════════════════
// IL CATALOGO DI CASSA (Luca 28/08 notte, «da CRM a software di cassa»)
//
// Dal 1° settembre il CRM è anche la cassa del negozio. Cambia la domanda che
// il software si sente fare: non più «quanto ci guadagniamo su questa voce»
// (la marginalità, che era un listino di REGOLE scritto a mano) ma «cosa
// vendo, quanto mi è costato, cosa resta a scaffale».
//
// Due nature, come le vuole Luca:
//   · PRODOTTO — l'hai comprato, ha un costo, e venderlo lo toglie dal
//     magazzino. Il margine è prezzo − costo: un numero, non una stima.
//   · SERVIZIO — assistenza, backup, installazione. Ha un prezzo e un
//     margine, ma non c'è niente da scaricare.
//
// La terza natura — SIM, sostituzioni, gettoni degli operatori — NON sta qui
// apposta: quelle voci il CRM le genera già da sé quando si registra la
// vendita del brand (computeAutoMarg). Il venditore non deve cercarle: le
// trova nel carrello. È il motivo per cui la cassa può restare a due schede.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from "@/lib/supabaseClient";

export type NaturaCassa = "prodotto" | "servizio";

export type VoceCassa = {
    id: string;              // "p:<codice>" oppure "s:<uuid>"
    natura: NaturaCassa;
    codice: string | null;   // codice articolo (solo prodotti)
    barcode: string | null;
    nome: string;
    famiglia: string;        // il filtro rapido: sottogruppo o categoria
    marca: string | null;
    gruppo: string | null;   // il listino di provenienza (WIND3, Accessori, USATO…)
    prezzo: number | null;
    costo: number | null;
    iva: number | null;
    reparto: number | null;
    scarica_magazzino: boolean;
    /** falso = il prezzo è quello e basta: si vede, non si tocca (Luca 29/08) */
    prezzo_modificabile: boolean;
};

/** Un pezzo con un seriale: un telefono, un modem. In cassa si spara l'IMEI
 *  e deve uscire QUEL pezzo — non l'articolo generico, il pezzo. */
export type PezzoSeriale = {
    seriale: string;
    provenienza: "nuovo" | "usato";
    codice: string | null;
    nome: string;
    negozio: string | null;
    stato: string | null;
    prezzo: number | null;
    costo: number | null;
    prezzo_modificabile: boolean;
    riferimento: string;
};

export type Giacenza = { codice: string; quantita: number; soglia_min: number | null };

/** Il margine di una riga, in euro. `null` quando non lo sappiamo: un margine
 *  inventato è peggio di un margine assente — su questo si decidono i premi. */
export function margineEuro(prezzo: number | null | undefined, costo: number | null | undefined, qta = 1): number | null {
    if (prezzo == null || costo == null) return null;
    return (Number(prezzo) - Number(costo)) * (Number(qta) || 1);
}

/** Lo stesso in percentuale sul prezzo. */
export function marginePct(prezzo: number | null | undefined, costo: number | null | undefined): number | null {
    const p = Number(prezzo);
    if (!p || costo == null) return null;
    return ((p - Number(costo)) / p) * 100;
}

/** Perché di questa riga non sappiamo il margine — da mostrare al posto del
 *  numero, così chi vende capisce cosa manca invece di vedere un trattino. */
export function perchéSenzaMargine(v: { prezzo: number | null; costo: number | null }): string | null {
    if (v.costo != null && v.prezzo != null) return null;
    if (v.costo == null && v.prezzo == null) return "senza costo né prezzo a listino";
    if (v.costo == null) return "manca il costo d'acquisto";
    return "manca il prezzo di listino";
}

const PAGINA = 1000;   // il server taglia OGNI risposta a 1000 righe

/** Tutto il catalogo vendibile. Il tetto di 1000 righe per risposta è una
 *  trappola nota del PostgREST (già costata i brand «fino ad Azza» sui
 *  dispositivi): qui si pagina fino in fondo. */
export async function caricaCatalogo(): Promise<VoceCassa[]> {
    const out: VoceCassa[] = [];
    for (let da = 0; ; da += PAGINA) {
        const { data, error } = await supabase.from("cassa_catalogo")
            .select("id,natura,codice,barcode,nome,famiglia,marca,gruppo,prezzo,costo,iva,reparto,scarica_magazzino,prezzo_modificabile")
            .order("nome").range(da, da + PAGINA - 1);
        if (error || !data?.length) break;
        out.push(...(data as VoceCassa[]));
        if (data.length < PAGINA) break;
    }
    return out;
}

/** Le giacenze di UN negozio, come mappa codice → quantità. */
export async function caricaGiacenze(negozio: string): Promise<Map<string, Giacenza>> {
    const m = new Map<string, Giacenza>();
    if (!negozio) return m;
    for (let da = 0; ; da += PAGINA) {
        const { data, error } = await supabase.from("mag_giacenze")
            .select("codice,quantita,soglia_min").eq("negozio", negozio).range(da, da + PAGINA - 1);
        if (error || !data?.length) break;
        (data as Giacenza[]).forEach((g) => m.set(g.codice, g));
        if (data.length < PAGINA) break;
    }
    return m;
}

/** I filtri rapidi di una natura: le famiglie che hanno davvero qualcosa
 *  dentro, in ordine di quante voci contengono (le più usate prima). */
export function famiglieDi(voci: VoceCassa[], natura: NaturaCassa): { nome: string; n: number }[] {
    const c = new Map<string, number>();
    voci.filter((v) => v.natura === natura).forEach((v) => c.set(v.famiglia || "Altro", (c.get(v.famiglia || "Altro") || 0) + 1));
    return [...c.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome));
}

/** La ricerca: nome, codice, barcode e marca. Le parole si cercano TUTTE
 *  («cover iphone» non deve tirare fuori ogni cover e ogni iPhone). */
export function cerca(voci: VoceCassa[], testo: string): VoceCassa[] {
    const q = testo.trim().toLowerCase();
    if (!q) return voci;
    // un codice a barre si incolla intero: se combacia, è quello e basta
    const soloCifre = q.replace(/\D/g, "");
    if (soloCifre.length >= 8) {
        const esatto = voci.filter((v) => (v.barcode || "").replace(/\D/g, "") === soloCifre);
        if (esatto.length) return esatto;
    }
    const parole = q.split(/\s+/).filter(Boolean);
    return voci.filter((v) => {
        const testo = `${v.nome} ${v.codice || ""} ${v.barcode || ""} ${v.marca || ""}`.toLowerCase();
        return parole.every((p) => testo.includes(p));
    });
}

/** Cerca un pezzo dal suo seriale (IMEI). Restituisce null se non esiste da
 *  nessuna parte: in quel caso il pezzo NON è in magazzino, e chi vende deve
 *  saperlo prima di battere lo scontrino. */
export async function cercaSeriale(seriale: string): Promise<PezzoSeriale | null> {
    const s = String(seriale || "").replace(/\s+/g, "");
    if (s.length < 6) return null;
    const { data } = await supabase.from("cassa_seriali")
        .select("seriale,provenienza,codice,nome,negozio,stato,prezzo,costo,prezzo_modificabile,riferimento")
        .eq("seriale", s).limit(1);
    return (data && data[0]) ? (data[0] as PezzoSeriale) : null;
}

/** Un IMEI ha 15 cifre, un ICCID 19: quando quello che si è digitato ha
 *  l'aria di un seriale si cerca prima lì, poi nel catalogo. */
export function sembraSeriale(testo: string): boolean {
    const d = String(testo || "").replace(/\D/g, "");
    return d.length === 15 || d.length === 19;
}
