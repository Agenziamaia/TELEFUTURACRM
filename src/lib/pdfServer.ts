/* ═══ LEGGERE UN PDF SUL SERVER ═══════════════════════════════════════════
 *
 * pdfjs, quando non gli si dice dove sta il suo «worker», prova a caricarlo da
 * solo con un percorso che dentro il pacchetto di Vercel non esiste:
 *
 *   Setting up fake worker failed: "Cannot find module
 *   '/root/TELEFUTURACRM/.next/server/chunks/pdf.worker.mjs'"
 *
 * È l'errore che Luca ha visto provando la firma — e con ogprobabilità è anche
 * il motivo per cui le 24 buste paga di luglio non si leggevano: là l'errore
 * finiva dentro un «PDF non leggibile» e non lo vedeva nessuno.
 *
 * La cura è importare il worker ESPLICITAMENTE, così finisce nel pacchetto, e
 * poi dire a pdfjs che è quello. Da qui in poi ci passa chiunque debba leggere
 * un PDF sul server: una volta sola, non una per ogni chiamante.
 */
type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let _pdfjs: Pdfjs | null = null;

export async function pdfjsServer(): Promise<Pdfjs> {
    if (_pdfjs) return _pdfjs;
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    try {
        // l'import serve a farlo entrare nel pacchetto: senza, il percorso qui
        // sotto punterebbe a un file che in produzione non c'è
        // @ts-expect-error — il worker non ha dichiarazioni di tipo: si importa
        // solo perche' finisca nel pacchetto, non lo si usa direttamente
        await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist/legacy/build/pdf.worker.mjs";
    } catch { /* senza worker pdfjs lavora comunque, più lentamente */ }
    _pdfjs = pdfjs;
    return pdfjs;
}

/** Quante pagine ha, senza aprire niente: si legge dai byte.
 *  È la rete di sicurezza per quando pdfjs non parte. */
export function paginePdf(buf: Buffer | Uint8Array): number {
    const testo = Buffer.from(buf).toString("latin1");
    const m = testo.match(/\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/);
    if (m) return Number(m[1]) || 1;
    const n = (testo.match(/\/Type\s*\/Page[^s]/g) || []).length;
    return n > 0 ? n : 1;
}
