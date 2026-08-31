// L'AVANZAMENTO UFFICIALE DELL'OPERATORE (Luca 29/08).
//
// «Magari i nostri ragazzi hanno registrato male qualche attivazione, hanno
// messo un codice sbagliato, e abbiamo un disallineamento sulle produzioni.
// Caricando il file ufficiale dell'azienda tu lo leggi, lo confronti col
// nostro e mi dici: guarda che sul mobile di Magliana ci sono tre punti in
// meno di quello che hanno registrato i ragazzi. E dal giorno dopo continui a
// contare come hanno registrato loro.»
//
// DUE REGOLE, ed è tutto il senso della cosa:
//  • fino alla data della fotografia comanda il numero dell'operatore — è
//    quello che poi paga;
//  • dopo quella data comanda il nostro, perché l'operatore non l'ha ancora
//    visto. Così un errore di inserimento resta confinato a pochi giorni
//    invece di sporcare tutto il mese.
//
// PERCHÉ IL FILE SI LEGGE COL CODICE E NON CON L'INTELLIGENZA ARTIFICIALE.
// Luca l'ha chiesto: «se pensi che DeepSeek possa commettere degli errori,
// codifichiamola». Qui si muovono numeri che decidono dove si carica una
// vendita e quanto vale un premio: un modello che sbaglia una cifra non lo
// scopre nessuno. Il foglio si legge riga per riga, e a dire quale colonna è
// quale pista è una persona, davanti all'anteprima — lo stesso gesto
// dell'import delle liste caller, che funziona da un mese.
//
// LO SCARTO NON SI SALVA: si ricalcola ogni volta contro la produzione viva.
// Salvarlo vorrebbe dire tenersi una fotografia che invecchia da sola.

import { supabase } from "@/lib/supabaseClient";
import { caricaDirezione, type DirBrandId } from "@/lib/direzioneTargets";

export type RigaUfficiale = { cod_gara: string; pista: string; punti: number | null; pezzi: number | null };
export type ScartoPista = {
    cod_gara: string; pista: string;
    ufficiale: number;   // quanto dice l'operatore alla sua data
    nostro: number;      // quanto contiamo noi ALLA STESSA data
    scarto: number;      // nostro − ufficiale: positivo = ne contiamo di più
};
export type ConfrontoUfficiale = {
    al: string; file: string | null;
    scarti: Map<string, ScartoPista>;
    /** i codici che stanno nel file dell'operatore e NON fra i nostri: le loro
     *  righe non entrano in nessun confronto, e senza dirlo sparirebbero in
     *  silenzio facendo credere di aver visto tutto (revisore 31/08) */
    ignorati: string[];
    nRighe: number;
};

const ymd = (v: unknown) => String(v || "").slice(0, 10);

/** L'ultima fotografia caricata per brand+mese: la sua data e le sue righe. */
export async function ultimoAvanzamento(brand: string, monthISO: string): Promise<{ al: string; file: string | null; righe: RigaUfficiale[] } | null> {
    const { data, error } = await supabase.from("avanzamenti_ufficiali")
        .select("al, cod_gara, pista, punti, pezzi, file_name")
        .eq("brand", brand).eq("month", monthISO)
        .order("al", { ascending: false });
    if (error || !data?.length) return null;
    const righe = data as { al: string; cod_gara: string; pista: string; punti: number | null; pezzi: number | null; file_name: string | null }[];
    const al = ymd(righe[0].al);
    const sole = righe.filter((r) => ymd(r.al) === al);
    return { al, file: sole[0]?.file_name ?? null, righe: sole.map((r) => ({ cod_gara: r.cod_gara, pista: r.pista, punti: r.punti, pezzi: r.pezzi })) };
}

/** Il confronto pronto da mostrare: chiave «codice|pista» → scarto.
 *  La nostra produzione alla data si ottiene dallo STESSO motore che disegna
 *  la pagina (caricaDirezione con `fino`): due conteggi diversi non sarebbero
 *  paragonabili. */
/* IL CONFRONTO SI RICALCOLA UNA VOLTA SOLA (revisore 31/08): la produzione
   fermata alla data della fotografia NON cambia passando da «Adesso» a «Ieri
   sera», né riaprendo la sezione — è ferma per definizione. Senza questa
   memoria la query pesante girava a ogni giro di pagina e lo scarto compariva
   in ritardo rispetto alle barre. Si azzera quando si carica o si butta via
   una fotografia. */
const memoria = new Map<string, Promise<ConfrontoUfficiale | null>>();
const scordaConfronto = (brand: string, monthISO: string) => memoria.delete(`${brand}|${monthISO}`);

export function confrontoUfficiale(brand: DirBrandId, monthISO: string): Promise<ConfrontoUfficiale | null> {
    const ch = `${brand}|${monthISO}`;
    const gia = memoria.get(ch);
    if (gia) return gia;
    const p = calcolaConfronto(brand, monthISO).catch((e) => { memoria.delete(ch); throw e; });
    memoria.set(ch, p);
    return p;
}

async function calcolaConfronto(brand: DirBrandId, monthISO: string): Promise<ConfrontoUfficiale | null> {
    const uff = await ultimoAvanzamento(brand, monthISO);
    if (!uff) return null;
    const alData = await caricaDirezione(brand, monthISO, { fino: uff.al });
    const scarti = new Map<string, ScartoPista>();
    const ignorati = new Set<string>();
    for (const r of uff.righe) {
        const k = alData.codici.find((x) => x.cod_gara === r.cod_gara);
        if (!k) { ignorati.add(r.cod_gara); continue; }
        /* LA CB DI WINDTRE VA A PUNTI DELLA GARA PARALLELA (Luca 26/08): la
           barra della pagina mostra `cbPunti`, non i punti di tabellare. Se il
           confronto usasse l'altra somma, a due centimetri di distanza la barra
           direbbe «noi 126» e lo scarto «noi 118» — due grandezze diverse
           presentate come la stessa (revisore 31/08). */
        const cbW3 = brand === "windtre" && r.pista === "cb";
        const mio = k.piste[r.pista] || { punti: 0, pezzi: 0 };
        const nostro = cbW3 ? (k.cbPunti || 0) : mio.punti;
        // il foglio porta sempre un valore solo per casella: si confronta quello
        const ufficiale = r.punti != null ? Number(r.punti) : Number(r.pezzi || 0);
        scarti.set(`${r.cod_gara}|${r.pista}`, {
            cod_gara: r.cod_gara, pista: r.pista, ufficiale, nostro,
            scarto: Math.round((nostro - ufficiale) * 100) / 100,
        });
    }
    return { al: uff.al, file: uff.file, scarti, ignorati: [...ignorati], nRighe: uff.righe.length };
}

/** Il riepilogo per la striscia in testa: quanto e dove non torna.
 *  I due gruppi sono separati per CONSEGUENZA, non per segno:
 *   • «+» = contiamo punti che l'operatore non ci riconosce → la soglia che
 *     crediamo presa NON è presa, e la Bussola sta mandando le vendite altrove
 *     perché crede quel codice pieno. È l'unico caso che rende falsa la
 *     decisione della pagina;
 *   • «−» = punti nostri che l'operatore conta e noi no: pagano lo stesso,
 *     sono solo registrati su un altro codice. */
export function riepilogoScarti(conf: ConfrontoUfficiale | null): {
    inPiu: ScartoPista[]; inMeno: ScartoPista[]; puntiInPiu: number; puntiInMeno: number; allineate: number;
} | null {
    if (!conf) return null;
    const tutti = [...conf.scarti.values()];
    const inPiu = tutti.filter((s) => s.scarto >= 0.01).sort((a, b) => b.scarto - a.scarto);
    const inMeno = tutti.filter((s) => s.scarto <= -0.01).sort((a, b) => a.scarto - b.scarto);
    return {
        inPiu, inMeno,
        puntiInPiu: Math.round(inPiu.reduce((t, s) => t + s.scarto, 0) * 100) / 100,
        puntiInMeno: Math.round(inMeno.reduce((t, s) => t + s.scarto, 0) * 100) / 100,
        allineate: tutti.length - inPiu.length - inMeno.length,
    };
}

/** Salva una fotografia. Ricaricare lo stesso giorno SOSTITUISCE: correggere
 *  un file sbagliato non deve sommarsi a quello vecchio. */
export async function salvaAvanzamento(opts: {
    brand: string; monthISO: string; al: string; righe: RigaUfficiale[]; fileName?: string; chi?: string;
}): Promise<{ ok: true; n: number } | { ok: false; errore: string }> {
    const righe = opts.righe.filter((r) => r.cod_gara && r.pista && (r.punti != null || r.pezzi != null));
    if (!righe.length) return { ok: false, errore: "nessuna riga da salvare" };
    /* PRIMA SI SCRIVE, POI SI RIPULISCE. Cancellare in testa e inserire dopo
       — com'era — vuol dire che se l'inserimento fallisce (rete che cade, una
       riga malformata) la fotografia precedente è già persa e non si torna
       indietro: qui non c'è una transazione, le due chiamate sono due viaggi
       separati (revisore 31/08).
       Il vincolo unique c'è già, quindi l'upsert riscrive le righe che
       tornano; le vecchie che il nuovo file non ha più si tolgono in coda, e
       si riconoscono dall'ora di scrittura. */
    const adesso = new Date().toISOString();
    const { error } = await supabase.from("avanzamenti_ufficiali").upsert(righe.map((r) => ({
        brand: opts.brand, month: opts.monthISO, al: opts.al,
        cod_gara: r.cod_gara, pista: r.pista, punti: r.punti, pezzi: r.pezzi,
        file_name: opts.fileName || null, caricato_da: opts.chi || null, created_at: adesso,
    })), { onConflict: "brand,month,al,cod_gara,pista" });
    if (error) return { ok: false, errore: error.message };
    // i resti della fotografia precedente per la STESSA data
    await supabase.from("avanzamenti_ufficiali")
        .delete().eq("brand", opts.brand).eq("month", opts.monthISO).eq("al", opts.al).lt("created_at", adesso);
    scordaConfronto(opts.brand, opts.monthISO);
    return { ok: true, n: righe.length };
}

export type FotoAvanzamento = { al: string; file: string | null; n: number; chi: string | null; quando: string | null };

/** Le fotografie caricate: data, file, quanti valori, CHI e QUANDO.
 *  «Vale come verità fino alla sua data» è una regola che cambia i numeri su
 *  cui si decide dove caricare: una regola così dev'essere revocabile e
 *  attribuibile, altrimenti un file sbagliato resta lì per sempre senza firma
 *  (revisore 31/08). */
export async function storicoAvanzamenti(brand: string, monthISO: string): Promise<FotoAvanzamento[]> {
    const { data } = await supabase.from("avanzamenti_ufficiali")
        .select("al, file_name, caricato_da, created_at").eq("brand", brand).eq("month", monthISO).order("al", { ascending: false });
    const per = new Map<string, FotoAvanzamento>();
    (data || []).forEach((r0) => {
        const r = r0 as { al: string; file_name: string | null; caricato_da: string | null; created_at: string | null };
        const al = ymd(r.al);
        const v = per.get(al) || { al, file: r.file_name, n: 0, chi: r.caricato_da, quando: r.created_at };
        v.n++;
        if (r.created_at && (!v.quando || r.created_at > v.quando)) { v.quando = r.created_at; v.chi = r.caricato_da; v.file = r.file_name; }
        per.set(al, v);
    });
    return [...per.values()];
}

/** Butta via una fotografia sbagliata. */
export async function eliminaAvanzamento(brand: string, monthISO: string, al: string): Promise<{ ok: boolean; errore?: string }> {
    const { error } = await supabase.from("avanzamenti_ufficiali")
        .delete().eq("brand", brand).eq("month", monthISO).eq("al", al);
    scordaConfronto(brand, monthISO);
    return error ? { ok: false, errore: error.message } : { ok: true };
}

// La lettura del foglio vive in un file suo, senza dipendenze: si prova a
// mano, senza browser e senza database (test in scripts/prova_avanzamento.mjs).
export { COL_IGNORA, COL_CODICE, pulisciGriglia, trovaIntestazione, proponiMappa, numeroIt, righeDaGriglia, diagnosiMappa } from "@/lib/avanzamentoFoglio";
