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
import { fileUrlDa, eliminaFileMulti } from "@/lib/fileUrl";
import { caricaDirezione, type DirBrandId } from "@/lib/direzioneTargets";

export type RigaUfficiale = { cod_gara: string; pista: string; punti: number | null; pezzi: number | null };
export type ScartoPista = {
    cod_gara: string; pista: string;
    ufficiale: number;   // quanto dice l'operatore alla sua data
    nostro: number;      // quanto contiamo noi ALLA STESSA data
    /** la data della fotografia DI QUESTA PISTA: i tre file di WindTre non
     *  arrivano lo stesso giorno */
    al: string;
    /** UFFICIALE − NOSTRO: quanto va CORRETTO il nostro numero (Luca 31/08).
     *  Il verso è quello dell'azione, non del confronto: «se mi dai un più
     *  vuol dire che devo sommare quei punti al mio attuale; se mi dai un meno
     *  dev'essere in rosso e devo sottrarli». Quindi il MENO è il caso che
     *  preoccupa — sono punti che abbiamo contato e che non pagano. */
    scarto: number;
};
export type ConfrontoUfficiale = {
    /** la data più recente fra le fotografie in vigore (per la testata) */
    al: string; file: string | null;
    /** che cosa è in vigore, pista per pista: con tre file separati le date
     *  possono essere diverse, e ognuna vale per la sua pista */
    fonti: { pista: string; al: string; file: string | null }[];
    scarti: Map<string, ScartoPista>;
    /** i codici che stanno nel file dell'operatore e NON fra i nostri: le loro
     *  righe non entrano in nessun confronto, e senza dirlo sparirebbero in
     *  silenzio facendo credere di aver visto tutto (revisore 31/08) */
    ignorati: string[];
    nRighe: number;
};

const ymd = (v: unknown) => String(v || "").slice(0, 10);

/** LE FOTOGRAFIE IN VIGORE, UNA PER PISTA (Luca 31/08).
 *  WindTre manda tre file e non arrivano lo stesso giorno: il mobile e il
 *  fisso al 26, la partnership al 25. Prendendo solo la data più recente — com'era —
 *  la partnership spariva dal confronto senza dire niente. Per ogni pista vale
 *  la SUA fotografia più recente, con la SUA data. */
export async function fotografieVigenti(brand: string, monthISO: string): Promise<Map<string, { al: string; file: string | null; righe: RigaUfficiale[] }> | null> {
    const { data, error } = await supabase.from("avanzamenti_ufficiali")
        .select("al, cod_gara, pista, punti, pezzi, file_name")
        .eq("brand", brand).eq("month", monthISO);
    if (error || !data?.length) return null;
    const righe = data as { al: string; cod_gara: string; pista: string; punti: number | null; pezzi: number | null; file_name: string | null }[];
    const per = new Map<string, { al: string; file: string | null; righe: RigaUfficiale[] }>();
    for (const r of righe) {
        const al = ymd(r.al);
        const cur = per.get(r.pista);
        if (!cur || al > cur.al) per.set(r.pista, { al, file: r.file_name, righe: [] });
    }
    for (const r of righe) {
        const cur = per.get(r.pista);
        if (!cur || ymd(r.al) !== cur.al) continue;
        cur.righe.push({ cod_gara: r.cod_gara, pista: r.pista, punti: r.punti, pezzi: r.pezzi });
        if (!cur.file) cur.file = r.file_name;
    }
    return per;
}

/* IL CONFRONTO SI RICALCOLA UNA VOLTA SOLA (revisore 31/08): la produzione
   fermata alla data della fotografia NON cambia passando da «Adesso» a «Ieri
   sera», né riaprendo la sezione — è ferma per definizione. Senza questa
   memoria la query pesante girava a ogni giro di pagina e lo scarto compariva
   in ritardo rispetto alle barre. Si azzera quando si carica o si butta via
   una fotografia. */
const memoria = new Map<string, Promise<ConfrontoUfficiale | null>>();
const scordaConfronto = (brand: string, monthISO: string) => memoria.delete(`${brand}|${monthISO}`);
/** Il tasto ↻ della pagina rifà anche questo conto: la produzione fermata alla
 *  data non cambia da sola, ma cambia se qualcuno annulla o corregge un
 *  contratto vecchio — e allora il modo di riallinearsi dev'esserci. */
export const scordaConfronti = () => memoria.clear();

export function confrontoUfficiale(brand: DirBrandId, monthISO: string): Promise<ConfrontoUfficiale | null> {
    const ch = `${brand}|${monthISO}`;
    const gia = memoria.get(ch);
    if (gia) return gia;
    const p = calcolaConfronto(brand, monthISO).catch((e) => { memoria.delete(ch); throw e; });
    memoria.set(ch, p);
    return p;
}

async function calcolaConfronto(brand: DirBrandId, monthISO: string): Promise<ConfrontoUfficiale | null> {
    const per = await fotografieVigenti(brand, monthISO);
    if (!per || !per.size) return null;
    // una lettura della produzione per ogni DATA distinta: di solito una o due
    const date = [...new Set([...per.values()].map((v) => v.al))];
    const alData = new Map<string, Awaited<ReturnType<typeof caricaDirezione>>>();
    await Promise.all(date.map(async (al) => { alData.set(al, await caricaDirezione(brand, monthISO, { fino: al })); }));

    const scarti = new Map<string, ScartoPista>();
    const ignorati = new Set<string>();
    let nRighe = 0;
    for (const [pista, foto] of per) {
        const dati = alData.get(foto.al);
        if (!dati) continue;
        for (const r of foto.righe) {
            nRighe++;
            const k = dati.codici.find((x) => x.cod_gara === r.cod_gara);
            if (!k) { ignorati.add(r.cod_gara); continue; }
            /* LA CB DI WINDTRE VA A PUNTI DELLA GARA PARALLELA (Luca 26/08): la
               barra della pagina mostra `cbPunti`, non i punti di tabellare. Se il
               confronto usasse l'altra somma, a due centimetri di distanza la barra
               direbbe «noi 126» e lo scarto «noi 118». */
            const cbW3 = brand === "windtre" && pista === "cb";
            const mio = k.piste[pista] || { punti: 0, pezzi: 0 };
            const nostro = cbW3 ? (k.cbPunti || 0) : mio.punti;
            const ufficiale = r.punti != null ? Number(r.punti) : Number(r.pezzi || 0);
            scarti.set(`${r.cod_gara}|${pista}`, {
                cod_gara: r.cod_gara, pista, al: foto.al, ufficiale, nostro,
                scarto: Math.round((ufficiale - nostro) * 100) / 100,
            });
        }
    }
    const fonti = [...per.entries()].map(([pista, f]) => ({ pista, al: f.al, file: f.file })).sort((a, b) => b.al.localeCompare(a.al));
    return { al: fonti[0]?.al || date.sort().reverse()[0], file: fonti[0]?.file ?? null, fonti, scarti, ignorati: [...ignorati], nRighe };
}

/** Il riepilogo per la striscia in testa: quanto e dove va corretto.
 *  I due gruppi sono separati per AZIONE:
 *   • «−» (rosso) = DA TOGLIERE. Sono punti che noi abbiamo contato e che
 *     l'operatore non ci riconosce: la soglia che crediamo presa può non
 *     esserlo, e la Bussola sta mandando le vendite altrove credendo pieno un
 *     codice che pieno non è. È il caso che rende falsa la decisione;
 *   • «+» = DA AGGIUNGERE. L'operatore ce li conta e da noi non risultano:
 *     pagano lo stesso, sono solo registrati altrove. */
export function riepilogoScarti(conf: ConfrontoUfficiale | null): {
    daTogliere: ScartoPista[]; daAggiungere: ScartoPista[]; puntiDaTogliere: number; puntiDaAggiungere: number; allineate: number;
} | null {
    if (!conf) return null;
    const tutti = [...conf.scarti.values()];
    const daTogliere = tutti.filter((s) => s.scarto <= -0.01).sort((a, b) => a.scarto - b.scarto);
    const daAggiungere = tutti.filter((s) => s.scarto >= 0.01).sort((a, b) => b.scarto - a.scarto);
    return {
        daTogliere, daAggiungere,
        puntiDaTogliere: Math.round(daTogliere.reduce((t, s) => t + s.scarto, 0) * 100) / 100,
        puntiDaAggiungere: Math.round(daAggiungere.reduce((t, s) => t + s.scarto, 0) * 100) / 100,
        allineate: tutti.length - daTogliere.length - daAggiungere.length,
    };
}

/** Salva una fotografia. Ricaricare lo stesso giorno SOSTITUISCE: correggere
 *  un file sbagliato non deve sommarsi a quello vecchio. */
export async function salvaAvanzamento(opts: {
    brand: string; monthISO: string; al: string; righe: RigaUfficiale[]; fileName?: string; chi?: string;
    /** il foglio originale: si deposita, così dallo storico si riscarica */
    file?: File | null;
}): Promise<{ ok: true; n: number; avviso?: string } | { ok: false; errore: string }> {
    const righe = opts.righe.filter((r) => r.cod_gara && r.pista && (r.punti != null || r.pezzi != null));
    if (!righe.length) return { ok: false, errore: "nessuna riga da salvare" };
    /* IL FOGLIO SI TIENE (Luca 31/08). Se il deposito rifiuta non si blocca il
       salvataggio: i numeri valgono comunque, e il file è una comodità — al
       massimo lo storico non avrà il tasto per riscaricarlo. */
    let filePath: string | null = null;
    let avviso: string | undefined;
    if (opts.file) {
        const nome = String(opts.file.name || "foglio.xlsx").replace(/[^a-zA-Z0-9._-]+/g, "_");
        const p = `${opts.brand}/${opts.monthISO.slice(0, 7)}/${opts.al}_${Date.now()}_${nome}`;
        const { error } = await supabase.storage.from("avanzamenti-files").upload(p, opts.file, { upsert: false });
        if (!error) filePath = p; else avviso = "i numeri sono salvati, ma il foglio non si è depositato: dallo storico non si potrà riscaricare";
    }
    /* LA PULIZIA TOCCA SOLO LE PISTE DI QUESTO FILE (Luca 31/08). WindTre non
       manda un foglio: ne manda tre, uno per il mobile, uno per il fisso e uno
       per la partnership, tutti con la stessa data. Ripulendo per (brand,
       mese, data) senza guardare la pista, il secondo file avrebbe cancellato
       le righe del primo — e nessuno se ne sarebbe accorto, perché lo scarto
       sarebbe semplicemente sparito da quella pista.
       PRIMA SI SCRIVE, POI SI RIPULISCE. Cancellare in testa e inserire dopo
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
        file_name: opts.fileName || null, file_path: filePath, caricato_da: opts.chi || null, created_at: adesso,
    })), { onConflict: "brand,month,al,cod_gara,pista" });
    if (error) return { ok: false, errore: error.message };
    // i resti della fotografia precedente per la STESSA data
    const pisteToccate = [...new Set(righe.map((r) => r.pista))];
    /* I FOGLI CHE STIAMO PER SOSTITUIRE (revisore 31/08): ricaricando la stessa
       data e la stessa pista, la riga vecchia sparisce e il suo file restava
       nel deposito per sempre, senza che niente lo nominasse più. */
    const { data: vecchi } = await supabase.from("avanzamenti_ufficiali")
        .select("file_path").eq("brand", opts.brand).eq("month", opts.monthISO).eq("al", opts.al)
        .in("pista", pisteToccate).not("file_path", "is", null);
    const daButtare = [...new Set(((vecchi ?? []) as { file_path: string }[]).map((r) => r.file_path))].filter((x) => x && x !== filePath);
    const { error: ePul } = await supabase.from("avanzamenti_ufficiali")
        .delete().eq("brand", opts.brand).eq("month", opts.monthISO).eq("al", opts.al)
        .in("pista", pisteToccate).lt("created_at", adesso);
    if (daButtare.length) await eliminaFileMulti("avanzamenti-files", daButtare);
    scordaConfronto(opts.brand, opts.monthISO);
    // i numeri nuovi ci sono comunque: della pulizia mancata si avvisa e basta
    if (ePul) return { ok: true, n: righe.length, avviso: "salvati, ma non ho potuto togliere i resti del caricamento precedente: ricontrolla lo storico" };
    return { ok: true, n: righe.length, avviso };
}

/** Il link per riscaricare il foglio — dal CUSTODE, non firmato qui.
 *  Il deposito è chiuso e dentro ci sono i numeri di gara di tutti i punti
 *  vendita. ⚠️ Firmarselo dal browser sembrava prudente ed era il contrario:
 *  per poterlo fare, il deposito deve lasciar LEGGERE a chiunque sia
 *  collegato — e allora chiunque si firma qualunque file, di qualunque
 *  deposito. Il permesso di leggere resta al solo server (31/08). */
export function linkFoglio(filePath: string): string {
    return fileUrlDa("avanzamenti-files", filePath);
}

export type FotoAvanzamento = {
    al: string; file: string | null; filePath: string | null; n: number; chi: string | null; quando: string | null; piste: string[];
    /* UN FOGLIO PER PISTA (Luca 31/08: «non mi fa scaricare il file del fisso e
       del mobile»). WindTre manda tre file e possono avere la stessa data:
       tenendo un solo `file` per fotografia, due depositi su tre restavano
       irraggiungibili. */
    fogli: { pista: string; file: string | null; filePath: string | null }[];
};

/** Le fotografie caricate: data, file, quanti valori, CHI e QUANDO.
 *  «Vale come verità fino alla sua data» è una regola che cambia i numeri su
 *  cui si decide dove caricare: una regola così dev'essere revocabile e
 *  attribuibile, altrimenti un file sbagliato resta lì per sempre senza firma
 *  (revisore 31/08). */
export async function storicoAvanzamenti(brand: string, monthISO: string): Promise<FotoAvanzamento[]> {
    const { data } = await supabase.from("avanzamenti_ufficiali")
        .select("al, pista, file_name, file_path, caricato_da, created_at").eq("brand", brand).eq("month", monthISO).order("al", { ascending: false });
    const per = new Map<string, FotoAvanzamento & { _p: Map<string, { file: string | null; filePath: string | null }> }>();
    (data || []).forEach((r0) => {
        const r = r0 as { al: string; pista: string; file_name: string | null; file_path: string | null; caricato_da: string | null; created_at: string | null };
        const al = ymd(r.al);
        const v = per.get(al) || { al, file: r.file_name, filePath: r.file_path, n: 0, chi: r.caricato_da, quando: r.created_at, piste: [], fogli: [], _p: new Map() };
        v.n++;
        if (!v._p.has(r.pista)) v._p.set(r.pista, { file: r.file_name, filePath: r.file_path });
        if (r.created_at && (!v.quando || r.created_at > v.quando)) { v.quando = r.created_at; v.chi = r.caricato_da; v.file = r.file_name; v.filePath = r.file_path; }
        per.set(al, v);
    });
    // le piste che quella fotografia copre, ognuna col SUO foglio: con tre file
    // separati serve sapere che cosa è arrivato, e poterselo riprendere
    return [...per.values()].map(({ _p, ...v }) => ({
        ...v, piste: [..._p.keys()],
        fogli: [..._p.entries()].map(([pista, f]) => ({ pista, ...f })),
    }));
}

/** Butta via una fotografia sbagliata. */
export async function eliminaAvanzamento(brand: string, monthISO: string, al: string): Promise<{ ok: boolean; errore?: string }> {
    // prima si prende il percorso, poi si cancellano le righe: dopo non c'è più
    const { data: fogli } = await supabase.from("avanzamenti_ufficiali")
        .select("file_path").eq("brand", brand).eq("month", monthISO).eq("al", al).not("file_path", "is", null);
    const percorsi = [...new Set(((fogli ?? []) as { file_path: string }[]).map((r) => r.file_path))];
    const { error } = await supabase.from("avanzamenti_ufficiali")
        .delete().eq("brand", brand).eq("month", monthISO).eq("al", al);
    if (!error && percorsi.length) await eliminaFileMulti("avanzamenti-files", percorsi);
    scordaConfronto(brand, monthISO);
    return error ? { ok: false, errore: error.message } : { ok: true };
}

// La lettura del foglio vive in un file suo, senza dipendenze: si prova a
// mano, senza browser e senza database (test in scripts/prova_avanzamento.mjs).
export { COL_IGNORA, COL_CODICE, pulisciGriglia, trovaIntestazione, proponiMappa, proponiMappaUnaPista, numeroIt, righeDaGriglia, diagnosiMappa, celleScartate, soloCifre, quotaCodiciNoti, classificaColonneValore, punteggioColonnaValore } from "@/lib/avanzamentoFoglio";
