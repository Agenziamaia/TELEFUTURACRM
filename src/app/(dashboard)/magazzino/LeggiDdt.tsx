"use client";

/* ═══ CARICARE LA MERCE DA UN DOCUMENTO ══════════════════════════════════════
 *
 * Luca 03/09: «dobbiamo introdurre la possibilità di caricare anche la merce
 * con una DDT, che semplicemente deve aggiungere le varie quantità a carrello…
 * una sorta di flag che mi apre una scelta, se caricare un file o farlo
 * tramite un QR; dopo averlo caricato dobbiamo integrare l'AI che legge,
 * rileva gli articoli, eventuali IMEI e compila il carrello. A quel punto
 * posso decidere se aggiungere altri articoli come avrei fatto scrivendo
 * l'articolo nella barra di ricerca, se no vado avanti… Se ci sono dei campi
 * non leggibili perché la foto è fatta male, devo dirlo, e deve chiedere una
 * nuova foto rinquadrando».
 *
 * LE DUE STRADE SONO LO STESSO GESTO: dal computer si prende il file che è
 * arrivato per email, dal telefono si fotografa il foglio che è arrivato col
 * corriere. Il QR è quello che il CRM usa già in altri quattro punti.
 *
 * ── NIENTE ENTRA A MAGAZZINO SENZA CHE QUALCUNO L'ABBIA VISTO ───────────────
 * Il documento riempie il CARRELLO, non il magazzino: dopo la lettura si
 * guarda, si corregge, e si va avanti col percorso di sempre. Un lettore
 * automatico che scrive dritto a scaffale è un lettore che, il giorno che
 * sbaglia una cifra, non lo scopre nessuno.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useRef, useState } from "react";
import { useQrUpload, QrUploadModal } from "@/lib/useQrUpload";
import { FileText, Smartphone, Loader2, RefreshCw, Check, AlertTriangle } from "lucide-react";

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export type ArticoloDdt = {
    codice: string; barcode: string | null; descrizione: string;
    ha_imei: boolean; costo_ultimo: number | null; prezzo: number | null;
};
export type RigaDdt = {
    letto: { codice: string; barcode: string; descrizione: string; quantita: number; seriali: string[]; sicurezza: string };
    articolo: ArticoloDdt | null;
    come: string;
};

/** Quanto è largo al massimo quello che si manda a leggere. Una foto da
 *  telefono è 12 milioni di pixel e 8 MB: ridotta a 2000 px si legge uguale —
 *  il testo di un DDT sta in un decimo di quella risoluzione — e viaggia in un
 *  decimo del tempo. */
const LATO_MAX = 2000;

/** Il PDF diventa un'immagine QUI, nel browser. Il lettore accetta solo
 *  jpeg/png/webp/gif — provato: un PDF lo rifiuta — ma un DDT arrivato per
 *  email è quasi sempre un PDF, e dire «convertilo tu» vorrebbe dire non aver
 *  fatto la funzione. `pdfjs` è già in casa: lo porta `react-pdf`. */
async function pdfInImmagine(file: File): Promise<string> {
    const pdfjs = await import("pdfjs-dist");
    /* IL WORKER VA INDICATO A MANO, se no `getDocument` resta appeso in
       silenzio — non dà errore, semplicemente non finisce mai. `new URL(…,
       import.meta.url)` è la forma che Turbopack sa impacchettare: il file
       finisce fra gli asset e l'indirizzo lo scrive lui. */
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pagina = await doc.getPage(1);
    const base = pagina.getViewport({ scale: 1 });
    const scala = Math.min(LATO_MAX / Math.max(base.width, base.height), 3);
    const vp = pagina.getViewport({ scale: Math.max(scala, 1) });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await pagina.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise;
    return c.toDataURL("image/jpeg", 0.88);
}

/** Un'immagine si rimpicciolisce prima di partire. */
function immagineRidotta(file: File): Promise<string> {
    return new Promise((ok, ko) => {
        const url = URL.createObjectURL(file);
        const im = new Image();
        im.onload = () => {
            const s = Math.min(1, LATO_MAX / Math.max(im.width, im.height));
            const c = document.createElement("canvas");
            c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
            const ctx = c.getContext("2d")!;
            ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(im, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            ok(c.toDataURL("image/jpeg", 0.88));
        };
        im.onerror = () => { URL.revokeObjectURL(url); ko(new Error("questo file non è un'immagine che so aprire")); };
        im.src = url;
    });
}

const COME: Record<string, { et: string; tono: string; nota: string }> = {
    barcode: { et: "codice a barre", tono: "rvBadge-acc", nota: "trovato dal codice a barre: è il riscontro più sicuro" },
    codice: { et: "codice", tono: "rvBadge-acc", nota: "trovato dal codice articolo, uguale identico" },
    somiglianza: { et: "codice simile", tono: "rvBadge-warn", nota: "il codice letto somigliava a questo: controllalo" },
    descrizione: { et: "dalla descrizione", tono: "rvBadge-warn", nota: "trovato dalle parole della descrizione: controllalo" },
    nessuno: { et: "non trovato", tono: "rvBadge-ko", nota: "questo articolo in anagrafica non c'è" },
};

export default function LeggiDdt({ chiudi, dopo }: { chiudi: () => void; dopo: (righe: RigaDdt[]) => void }) {
    const [fase, setFase] = useState<"scelta" | "leggo" | "esito">("scelta");
    const [errore, setErrore] = useState("");
    const [esito, setEsito] = useState<{ righe: RigaDdt[]; illeggibili: string[]; documento: Record<string, string>; rifai: boolean } | null>(null);
    const [scarta, setScarta] = useState<Set<number>>(new Set());
    const [anteprima, setAnteprima] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

    const leggi = useCallback(async (file: File) => {
        setErrore(""); setFase("leggo"); setEsito(null);
        try {
            const dataUrl = file.type === "application/pdf" || /\.pdf$/i.test(file.name)
                ? await pdfInImmagine(file)
                : await immagineRidotta(file);
            setAnteprima(dataUrl);
            const r = await fetch("/api/magazzino/leggi-ddt", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ immagine: dataUrl }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j.ok) throw new Error(j.error || "il documento non si è lasciato leggere");
            setEsito({ righe: j.righe || [], illeggibili: j.illeggibili || [], documento: j.documento || {}, rifai: !!j.rifai });
            setScarta(new Set());
            setFase("esito");
        } catch (e) {
            setErrore((e as Error)?.message || "non ci sono riuscito");
            setFase("scelta");
        }
    }, []);

    const qr = useQrUpload(files => { if (files[0]) leggi(files[0]); });

    const tenute = (esito?.righe || []).filter((_, i) => !scarta.has(i));
    const daMettere = tenute.filter(r => r.articolo);

    /* ── LA SCELTA ─────────────────────────────────────────────────────── */
    if (fase === "scelta") return (
        <div className="rvDdt">
            <div className="rvDdt-t">
                <b><FileText size={16} className="inline-block align-[-3px] mr-2" />Carica da un documento di trasporto</b>
                <span>Il documento riempie il <b>carrello</b>, non il magazzino: dopo la lettura lo guardi,
                    lo correggi e vai avanti col percorso di sempre.</span>
            </div>
            {errore && <div className="rvNota rvNota-ko mb-3"><div className="rvNota-s">{errore}</div></div>}
            <div className="rvDdt-due">
                <button type="button" className="rvDdt-via" onClick={() => fileRef.current?.click()}>
                    <FileText size={26} />
                    <b>Carica un file</b>
                    <span>Il PDF o la foto che è arrivata per email. Il PDF lo converto io.</span>
                </button>
                <button type="button" className="rvDdt-via" onClick={() => qr.openQr("ddt_magazzino", "foto")}>
                    <Smartphone size={26} />
                    <b>Fai la foto col telefono</b>
                    <span>Inquadri il QR, scatti il foglio che ti ha lasciato il corriere.</span>
                </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) leggi(f); }} />
            <div className="rvDdt-p">
                <span className="rvSpazio" />
                <button type="button" onClick={chiudi} className="rvPill rvPill-sm">Chiudi</button>
            </div>
            <QrUploadModal qr={qr} hint="Inquadra il QR col telefono e scatta la foto del documento di trasporto: tieni il foglio dritto e dentro l'inquadratura." esito={() => "Foto ricevuta: la sto leggendo."} />
        </div>
    );

    /* ── STO LEGGENDO ──────────────────────────────────────────────────── */
    if (fase === "leggo") return (
        <div className="rvDdt">
            <div className="rvDdt-att">
                <Loader2 size={30} className="animate-spin" />
                <b>Sto leggendo il documento…</b>
                <span>Ci vogliono una decina di secondi. Cerco gli articoli, le quantità e gli eventuali IMEI.</span>
            </div>
        </div>
    );

    /* ── QUELLO CHE HO LETTO ───────────────────────────────────────────── */
    const d = esito?.documento || {};
    return (
        <div className="rvDdt">
            {esito?.rifai ? (
                /* LA FOTO NON SI LEGGE, E LO SI DICE: consegnare un carrello vuoto
                   e lasciare che l'operatore si chieda perché è il modo più
                   veloce per fargli credere che la funzione non funziona. */
                <div className="rvNota rvNota-ko">
                    <div className="rvNota-t"><AlertTriangle size={15} className="inline-block align-[-3px] mr-1.5" />Questa foto non si legge</div>
                    <div className="rvNota-s">
                        {esito.illeggibili.length
                            ? <>Non sono riuscito a leggere: {esito.illeggibili.slice(0, 4).join(" · ")}.</>
                            : <>Il documento non si distingue abbastanza.</>}
                        {" "}Rifalla tenendo il foglio dritto, con tutta la tabella dentro l&apos;inquadratura e senza ombre sopra.
                    </div>
                </div>
            ) : (
                <>
                    <div className="rvDdt-t">
                        <b>Ho letto il documento</b>
                        <span>
                            {d.numero ? <>Documento <b>n.{d.numero}</b>{d.data ? ` del ${d.data}` : ""}{d.mittente ? ` — ${d.mittente}` : ""}. </> : null}
                            {esito!.righe.length} rig{esito!.righe.length === 1 ? "a" : "he"},
                            di cui <b>{esito!.righe.filter(r => r.articolo).length}</b> con l&apos;articolo trovato in anagrafica.
                            Controlla e togli quello che non ti serve.
                        </span>
                    </div>
                    {!!esito!.illeggibili.length && (
                        <div className="rvNota rvNota-att mb-3">
                            <div className="rvNota-t">Qualcosa non l&apos;ho letto</div>
                            <div className="rvNota-s">{esito!.illeggibili.slice(0, 5).join(" · ")}</div>
                        </div>
                    )}
                    <div className="rvDdt-righe">
                        {esito!.righe.map((r, i) => {
                            const c = COME[r.come] || COME.nessuno;
                            const fuori = scarta.has(i);
                            return (
                                <div key={i} className={cn("rvDdt-r", fuori && "rvDdt-r-no")}>
                                    <label className="rvDdt-r-x">
                                        <input type="checkbox" checked={!fuori}
                                            onChange={() => setScarta(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                                    </label>
                                    <div className="rvDdt-r-c">
                                        <div className="rvDdt-r-1">
                                            <span className="rvTab-nome">{r.articolo?.descrizione || r.letto.descrizione || "—"}</span>
                                            <span className={cn("rvBadge", c.tono)} title={c.nota}>{c.et}</span>
                                            {r.letto.sicurezza === "bassa" && <span className="rvBadge rvBadge-ko" title="il modello dice di non essere sicuro di questa riga">letta a fatica</span>}
                                        </div>
                                        <div className="rvDdt-r-2">
                                            {r.articolo
                                                ? <>codice <b className="font-mono">{r.articolo.codice}</b>
                                                    {r.articolo.barcode ? <> · <span className="font-mono">{r.articolo.barcode}</span></> : null}</>
                                                : <>sul documento: <span className="font-mono">{r.letto.codice || "—"}</span>
                                                    {r.letto.barcode ? <> · <span className="font-mono">{r.letto.barcode}</span></> : null}
                                                    {" "}— <b>in anagrafica non c&apos;è</b>: cercalo o crealo dalla barra qui sopra</>}
                                        </div>
                                    </div>
                                    <div className="rvDdt-r-q">
                                        <b>{r.letto.quantita || (r.letto.seriali.length || 0) || "?"}</b>
                                        <span>{r.letto.seriali.length ? `${r.letto.seriali.length} numeri` : "pezzi"}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            <div className="rvDdt-p">
                {anteprima && <img src={anteprima} alt="il documento" className="rvDdt-mini" />}
                <span className="rvSpazio" />
                <button type="button" onClick={() => { setFase("scelta"); setEsito(null); setAnteprima(""); }} className="rvPill rvPill-sm">
                    <RefreshCw size={13} className="inline-block align-[-2px] mr-1.5" />{esito?.rifai ? "Rifai la foto" : "Un altro documento"}
                </button>
                <button type="button" onClick={chiudi} className="rvPill rvPill-sm">Chiudi</button>
                {!esito?.rifai && (
                    <button type="button" onClick={() => dopo(daMettere)} disabled={!daMettere.length} className="rvAzione rvAzione-sm">
                        <Check size={14} className="inline-block align-[-2px] mr-1.5" />
                        Metti nel carico ({daMettere.length})
                    </button>
                )}
            </div>
        </div>
    );
}
