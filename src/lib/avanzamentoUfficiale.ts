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
export type ConfrontoUfficiale = { al: string; file: string | null; scarti: Map<string, ScartoPista> };

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
export async function confrontoUfficiale(brand: DirBrandId, monthISO: string): Promise<ConfrontoUfficiale | null> {
    const uff = await ultimoAvanzamento(brand, monthISO);
    if (!uff) return null;
    const alData = await caricaDirezione(brand, monthISO, { fino: uff.al });
    const scarti = new Map<string, ScartoPista>();
    for (const r of uff.righe) {
        const k = alData.codici.find((x) => x.cod_gara === r.cod_gara);
        const mio = k?.piste[r.pista] || { punti: 0, pezzi: 0 };
        // si confronta sull'unità con cui l'operatore ha mandato il dato
        const aPunti = r.punti != null;
        const ufficiale = aPunti ? Number(r.punti) : Number(r.pezzi || 0);
        const nostro = aPunti ? mio.punti : mio.pezzi;
        scarti.set(`${r.cod_gara}|${r.pista}`, {
            cod_gara: r.cod_gara, pista: r.pista, ufficiale, nostro,
            scarto: Math.round((nostro - ufficiale) * 100) / 100,
        });
    }
    return { al: uff.al, file: uff.file, scarti };
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
    return { ok: true, n: righe.length };
}

/** Elenco delle fotografie caricate (per il pannello: date + file). */
export async function storicoAvanzamenti(brand: string, monthISO: string): Promise<{ al: string; file: string | null; n: number }[]> {
    const { data } = await supabase.from("avanzamenti_ufficiali")
        .select("al, file_name").eq("brand", brand).eq("month", monthISO).order("al", { ascending: false });
    const per = new Map<string, { al: string; file: string | null; n: number }>();
    (data || []).forEach((r) => {
        const al = ymd((r as { al: string }).al);
        const v = per.get(al) || { al, file: (r as { file_name: string | null }).file_name, n: 0 };
        v.n++; per.set(al, v);
    });
    return [...per.values()];
}

// La lettura del foglio vive in un file suo, senza dipendenze: si prova a
// mano, senza browser e senza database (test in scripts/prova_avanzamento.mjs).
export { COL_IGNORA, COL_CODICE, pulisciGriglia, trovaIntestazione, proponiMappa, numeroIt, righeDaGriglia } from "@/lib/avanzamentoFoglio";
