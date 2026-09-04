/* ═══ GLI ALLEGATI DELL'ASSISTENTE ════════════════════════════════════════
   Richiesta di Luca (28/08): «dammi la possibilità nell'assistenza AI di
   mettere degli allegati».

   Il modello che risponde (DeepSeek) legge TESTO, non immagini: quindi il
   file non si "manda" al modello — si legge qui nel browser e se ne passa
   il contenuto come contesto della domanda. Vale per PDF, Excel, CSV e
   testo. Per le immagini si dice chiaramente che non si possono leggere,
   invece di far finta e rispondere a vuoto.

   Tutto lato client: il file non viene caricato da nessuna parte, esce
   dal CRM solo il testo che serve a rispondere. */

/** quanto testo si porta dentro al massimo per file: oltre, il prompt
 *  esplode e il modello perde il filo (il tetto del giro è 1500 token) */
const MAX_CARATTERI = 12000;

export type Allegato = {
    nome: string;
    tipo: string;
    kb: number;
    testo: string;          // vuoto se non leggibile
    problema?: string;      // perché non si può leggere
};

function taglia(t: string, nome: string, max: number = MAX_CARATTERI): string {
    const pulito = t.replace(/\x00/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (pulito.length <= max) return pulito;
    return pulito.slice(0, max) + `\n\n[…«${nome}» continua: mostrati i primi ${max} caratteri]`;
}

async function daPdf(file: File): Promise<string> {
    const pdfjs = await import("pdfjs-dist");
    // il worker sta nel pacchetto: senza, pdfjs prova a scaricarlo da un CDN
    // e in produzione fallisce. `new URL(..., import.meta.url)` lo fa
    // risolvere al bundler, che se lo porta dietro.
    const g = pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } };
    if (!g.GlobalWorkerOptions.workerSrc) {
        g.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    }
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pagine: string[] = [];
    const quante = Math.min(doc.numPages, 40);
    for (let i = 1; i <= quante; i++) {
        const p = await doc.getPage(i);
        const c = await p.getTextContent();
        pagine.push(c.items.map((it) => (it as { str?: string }).str || "").join(" "));
    }
    const testo = pagine.join("\n\n");
    return doc.numPages > quante ? `${testo}\n\n[il documento ha ${doc.numPages} pagine: lette le prime ${quante}]` : testo;
}

async function daExcel(file: File): Promise<string> {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const fogli = wb.SheetNames.slice(0, 8).map((n) => {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false });
        return `### Foglio «${n}»\n${csv.split("\n").slice(0, 300).join("\n")}`;
    });
    return fogli.join("\n\n");
}


/* ═══ LE PRESENTAZIONI (.pptx) ═════════════════════════════════════════════
   Le lettere di gara di WindTre arrivano in PowerPoint, non in PDF: senza
   questo, l'unica lettera che conta di più resterebbe illeggibile.

   Un .pptx è uno ZIP di XML. Non serve una libreria: lo ZIP lo apriamo a mano
   (è un formato semplice) e i pezzi compressi li passa `DecompressionStream`,
   che sta nel browser e in Node da anni. Si prende il testo di ogni slide
   nell'ordine giusto, comprese le tabelle — che nelle lettere di gara sono
   dove stanno i numeri. */
async function sgonfia(dati: Uint8Array, metodo: number): Promise<Uint8Array> {
    if (metodo === 0) return dati;                       // memorizzato, non compresso
    const ds = new DecompressionStream("deflate-raw");
    // `dati.slice()` stacca una copia con il proprio buffer: senza, TypeScript
    // non accetta la Uint8Array come pezzo di Blob.
    const blob = new Blob([dati.slice().buffer as ArrayBuffer]);
    const buf = await new Response(blob.stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
}

async function daPptx(file: File): Promise<string> {
    const buf = new Uint8Array(await file.arrayBuffer());
    const dv = new DataView(buf.buffer);
    // si legge la coda dello ZIP (End Of Central Directory) e da lì l'indice
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("non sembra un file PowerPoint valido");
    const nFile = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);

    const dec = new TextDecoder();
    const slide: { nome: string; testo: string }[] = [];
    for (let i = 0; i < nFile; i++) {
        if (dv.getUint32(p, true) !== 0x02014b50) break;   // header dell'indice
        const metodo = dv.getUint16(p + 10, true);
        const dimCompressa = dv.getUint32(p + 20, true);
        const lnNome = dv.getUint16(p + 28, true);
        const lnExtra = dv.getUint16(p + 30, true);
        const lnComm = dv.getUint16(p + 32, true);
        const offLocale = dv.getUint32(p + 42, true);
        const nome = dec.decode(buf.slice(p + 46, p + 46 + lnNome));
        p += 46 + lnNome + lnExtra + lnComm;
        if (!/^ppt\/slides\/slide\d+\.xml$/.test(nome)) continue;
        // dall'header locale si ricava dove comincia davvero il contenuto
        const lnNomeL = dv.getUint16(offLocale + 26, true);
        const lnExtraL = dv.getUint16(offLocale + 28, true);
        const inizio = offLocale + 30 + lnNomeL + lnExtraL;
        const xml = dec.decode(await sgonfia(buf.slice(inizio, inizio + dimCompressa), metodo));
        /* Il testo sta dentro <a:t>. I separatori (fine cella, fine riga, fine
           paragrafo) stanno FUORI, quindi si marcano prima con due caratteri di
           servizio e si raccolgono nello stesso passaggio: così l'ordine resta
           quello della slide e le tabelle non diventano una parola sola.
           ⚠️ la regex deve chiedere <a:t> seguito da spazio o da '>': con
           `<a:t[^>]*>` si prenderebbe anche <a:tblPr> e <a:tr>, e tornerebbe XML. */
        const marcato = xml.replace(/<\/a:tc>/g, "\u0001").replace(/<\/a:tr>/g, "\u0002").replace(/<\/a:p>/g, "\u0002");
        const pezzi = marcato.match(/<a:t(?=[\s>])[^>]*>[\s\S]*?<\/a:t>|[\u0001\u0002]/g) || [];
        const testo = pezzi
            .map((x) => (x === "\u0001" ? " | " : x === "\u0002" ? "\n" : x.replace(/<[^>]*>/g, "")))
            .join("")
            .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/[ \t]*\|[ \t]*(?=\n)/g, "").replace(/\n{3,}/g, "\n\n");
        slide.push({ nome, testo });
    }
    if (!slide.length) throw new Error("nessuna slide leggibile");
    slide.sort((a, b) => Number(a.nome.match(/\d+/)![0]) - Number(b.nome.match(/\d+/)![0]));
    return slide.map((s, i) => `### Slide ${i + 1}\n${s.testo.replace(/[ \t]{2,}/g, " ").trim()}`).join("\n\n");
}

/** Legge un file e ne restituisce il testo utilizzabile come contesto. */
/** `max` alza il tetto del testo estratto: le lettere di gara sono lunghe e
 *  vanno lette intere, il tetto piccolo serve solo alla chat. */
export async function leggiAllegato(file: File, max: number = MAX_CARATTERI): Promise<Allegato> {
    const base: Allegato = { nome: file.name, tipo: file.type || "", kb: Math.round(file.size / 1024), testo: "" };
    const n = file.name.toLowerCase();
    try {
        if (file.size > 15 * 1024 * 1024) return { ...base, problema: "più di 15 MB: troppo grande" };
        if (/\.(png|jpe?g|gif|webp|heic|bmp|svg)$/.test(n) || file.type.startsWith("image/")) {
            return { ...base, problema: "è un'immagine: l'assistente legge testo, non figure" };
        }
        if (n.endsWith(".pdf") || file.type === "application/pdf") return { ...base, testo: taglia(await daPdf(file), file.name, max) };
        if (/\.(xlsx|xlsm|xls|ods)$/.test(n)) return { ...base, testo: taglia(await daExcel(file), file.name, max) };
        if (/\.pptx$/.test(n)) return { ...base, testo: taglia(await daPptx(file), file.name, max) };
        if (/\.(txt|csv|md|json|log|xml|html?|tsv|eml)$/.test(n) || file.type.startsWith("text/")) {
            return { ...base, testo: taglia(await file.text(), file.name, max) };
        }
        if (/\.(docx?|ppt|pages|key|zip|rar)$/.test(n)) return { ...base, problema: "formato che non so aprire: salvalo in PDF o incolla il testo" };
        // ultimo tentativo: se è testo mascherato, si legge lo stesso
        const t = await file.text();
        if (/[\x00-\x08\x0e-\x1f]/.test(t.slice(0, 400))) return { ...base, problema: "non è un file di testo" };
        return { ...base, testo: taglia(t, file.name, max) };
    } catch (e) {
        return { ...base, problema: `non sono riuscito a leggerlo (${(e as Error)?.message || "errore"})` };
    }
}

/** Il blocco di contesto da accodare alla domanda. */
export function contestoAllegati(all: Allegato[]): string {
    const buoni = all.filter((a) => a.testo);
    if (!buoni.length) return "";
    return "\n\n---\nDOCUMENTI ALLEGATI DALL'UTENTE (usali per rispondere; se la risposta non c'è dentro, dillo):\n"
        + buoni.map((a) => `\n### ${a.nome}\n${a.testo}`).join("\n");
}
