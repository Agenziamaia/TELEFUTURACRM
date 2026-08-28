"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Send, Download, RefreshCw } from "lucide-react";
import ReportGiornaliero from "./ReportGiornaliero";
import { SelectOpzioni } from "@/components/SelectPersona";
import type { DatiReport } from "@/lib/report/datiGiornata";

/* ============================================================================
   IL REPORT DELLA SERA (Luca 28/08)
   ----------------------------------------------------------------------------
   Il negozio chiude, preme «Report», vede la sua giornata e la manda sul canale.
   Tre gesti, nessuna scelta da fare.

   LA FOTO LA SCATTA QUESTO BROWSER, non un computer a parte. Il report è già
   disegnato qui sotto, a grandezza vera (1080x1620) e solo rimpicciolito per
   stare a schermo: fotografarlo qui vuol dire che quello che il negozio VEDE è
   esattamente quello che parte. Un servizio di cattura sul server avrebbe
   voluto dire un secondo Chrome da installare, tenere aggiornato e da far
   entrare nel CRM con una password sua — per riottenere un'immagine che era
   già davanti agli occhi di chi preme il pulsante.
   ========================================================================== */

const W = 1080;
const H = 1620;
const MAX_BYTES = 7 * 1024 * 1024;   // sotto il tetto del canale, con margine

type Props = { negozio: string; giorno: string; negozi?: string[]; onClose: () => void };

export default function ModaleReport({ negozio, giorno, negozi = [], onClose }: Props) {
    /* CHI VEDE PIÙ NEGOZI DEVE SCEGLIERE. Per un venditore il negozio è uno solo
       e non c'è niente da decidere; per l'amministrazione, che li vede tutti,
       partire dal primo della lista vorrebbe dire mandare sul canale il report
       di un negozio a caso — e nel canale ci finisce col suo nome sopra. */
    const [scelto, setScelto] = useState(negozio);
    const negoziVeri = negozi.length > 1 ? negozi : [];
    // il tipo vero, non `unknown`: il giorno che cambia una chiave dei dati il
    // foglio uscirebbe sbagliato senza che niente se ne accorga
    const [dati, setDati] = useState<DatiReport | null>(null);
    const [errore, setErrore] = useState<string | null>(null);
    const [commento, setCommento] = useState("");
    const [stato, setStato] = useState<"pronto" | "invio" | "inviato">("pronto");
    const [esito, setEsito] = useState<string | null>(null);

    const tela = useRef<HTMLDivElement>(null);
    const box = useRef<HTMLDivElement>(null);
    const [scala, setScala] = useState(0.3);
    const suggerito = useRef("");
    const invioInCorso = useRef<AbortController | null>(null);

    /* CHIUDERE DURANTE L'INVIO ANNULLA L'INVIO. Prima la richiesta finiva
       comunque sul canale, ma l'esito arrivava a una finestra che non c'era
       più: il negozio, non vedendo conferma, riapriva e rimandava — due foto
       identiche sul canale. */
    const chiudi = useCallback(() => {
        invioInCorso.current?.abort();
        invioInCorso.current = null;
        onClose();
    }, [onClose]);

    /* ── i numeri ─────────────────────────────────────────────────────── */
    const carica = useCallback(async () => {
        setErrore(null);
        setDati(null);
        try {
            const r = await fetch(`/api/report/giornaliero?negozio=${encodeURIComponent(scelto)}&giorno=${giorno}`);
            const j = await r.json();
            if (j?.error) { setErrore(j.error); return; }
            setDati(j.dati);
            // il commento suggerito si mette SOLO se la casella e' ancora quella
            // che ha proposto il CRM: chi ha scritto la sua frase non se la vede
            // cancellare premendo «ricarica»
            setCommento((c) => (c === "" || c === suggerito.current ? String(j.dati?.commento || "") : c));
            suggerito.current = String(j.dati?.commento || "");
        } catch (e) {
            setErrore("Non riesco a leggere la giornata: " + ((e as Error)?.message || "rete"));
        }
    }, [scelto, giorno]);

    useEffect(() => { void carica(); setStato("pronto"); setEsito(null); }, [carica]);

    /* ── il rimpicciolimento: il foglio è 1080x1620, lo schermo no ────────
       Si misura lo spazio disponibile e si scala, invece di fissare una
       percentuale: sul telefono del negozio e sul monitor dell'ufficio il
       report deve entrare tutto, senza tagli e senza barre di scorrimento. */
    useEffect(() => {
        const misura = () => {
            const b = box.current;
            if (!b) return;
            const s = Math.min(b.clientWidth / W, b.clientHeight / H);
            setScala(Math.max(0.12, Math.min(1, s)));
        };
        misura();
        const ro = new ResizeObserver(misura);
        if (box.current) ro.observe(box.current);
        return () => ro.disconnect();
    }, [dati]);

    /* ── esc per chiudere: è una finestra, si comporta da finestra ────── */
    useEffect(() => {
        const k = (e: KeyboardEvent) => { if (e.key === "Escape") chiudi(); };
        window.addEventListener("keydown", k);
        return () => window.removeEventListener("keydown", k);
    }, [chiudi]);

    /* ── la fotografia ────────────────────────────────────────────────── */
    const scatta = useCallback(async (): Promise<string> => {
        const nodo = tela.current?.querySelector("#report-canvas") as HTMLElement | null;
        if (!nodo) throw new Error("Il report non è ancora pronto.");

        // i caratteri devono essere già a posto: fotografare prima vuol dire
        // catturare il ripiego di sistema e accorgersene solo sul canale
        if (document.fonts?.ready) await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        const { toJpeg } = await import("html-to-image");

        /* JPEG, NON PNG — misurato sullo stesso identico foglio:
             PNG   4.162 KB
             JPEG    729 KB   (qualità 0,95)
           Cinque volte e mezzo più leggero, e affiancate a schermo non si
           distinguono: il fondale è una fotografia, e il PNG le fotografie non
           le comprime. Da un negozio con la linea lenta, alle otto di sera,
           quei tre megabyte e mezzo sono l'unica cosa che si sente. */
        const out = await toJpeg(nodo, {
            width: W, height: H, pixelRatio: 2,
            backgroundColor: "#0f111a",
            quality: 0.95,
            // niente caratteri da scaricare: il CRM usa quelli di sistema e
            // l'inseguimento dei fogli di stile esterni faceva solo aspettare
            skipFonts: true,
            cacheBust: false,
        });
        if (peso(out) > MAX_BYTES) throw new Error("L'immagine è troppo pesante per il canale.");
        return out;
    }, []);

    const invia = async () => {
        setStato("invio");
        setEsito(null);
        try {
            const url = await scatta();

            /* IL FILE VA COME FILE, non come testo dentro un JSON. Una data-url
               base64 gonfia di un terzo — 729 KB di foto diventano ~1 MB di
               corpo — e il `client_max_body_size` di nginx vale 1 MB di
               default: il negozio avrebbe letto «Unexpected token '<'», che e'
               la pagina d'errore del proxy interpretata come JSON. */
            const blob = await (await fetch(url)).blob();
            const form = new FormData();
            form.append("immagine", blob, "report.jpg");
            form.append("negozio", scelto);

            const ac = new AbortController();
            invioInCorso.current = ac;
            const r = await fetch("/api/report/invia", { method: "POST", body: form, signal: ac.signal });
            const j = await r.json();
            invioInCorso.current = null;
            if (j?.error) { setEsito(j.error); setStato("pronto"); return; }
            setStato("inviato");
        } catch (e) {
            invioInCorso.current = null;
            if ((e as Error)?.name === "AbortError") return;
            setEsito((e as Error)?.message || "Invio non riuscito.");
            setStato("pronto");
        }
    };


    const scarica = async () => {
        setEsito(null);
        try {
            const url = await scatta();
            const a = document.createElement("a");
            a.href = url;
            a.download = `report-${scelto.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${giorno}.jpg`;
            a.click();
        } catch (e) {
            setEsito((e as Error)?.message || "Non riesco a salvare l'immagine.");
        }
    };

    /* il commento entra nel disegno mentre lo si scrive: è l'unica parte del
       report che una persona decide, e va vista al suo posto prima di partire */
    const datiVivi: DatiReport | null = dati ? { ...dati, commento } : null;

    return (
        <div className="fixed inset-0 z-[120] bg-[#07080d]/95 backdrop-blur-md flex flex-col">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-white/5 shrink-0">
                <div className="min-w-0 flex items-center gap-3">
                    <div className="min-w-0">
                        <h2 className="text-base sm:text-lg font-bold text-white truncate">Report della giornata</h2>
                        <p className="text-xs text-slate-500 truncate">
                            {negoziVeri.length ? String(dati?.data || giorno) : `${scelto} · ${String(dati?.data || giorno)}`}
                        </p>
                    </div>
                    {negoziVeri.length ? (
                        <div className="w-48 shrink-0">
                            <SelectOpzioni value={scelto} onChange={setScelto} opzioni={negoziVeri}
                                placeholder="Negozio" disabled={stato !== "pronto"} />
                        </div>
                    ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => void carica()} title="Ricarica i numeri"
                        className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                        <RefreshCw size={15} />
                    </button>
                    <button onClick={chiudi} title="Chiudi"
                        className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                        <X size={16} />
                    </button>
                </div>
            </div>

            <div ref={box} className="flex-1 min-h-0 flex items-center justify-center p-3 sm:p-5 overflow-hidden">
                {errore ? (
                    <div className="text-center max-w-md">
                        <p className="text-sm text-rose-300 mb-3">{errore}</p>
                        <button onClick={() => void carica()}
                            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-300 hover:text-white">
                            Riprova
                        </button>
                    </div>
                ) : !datiVivi ? (
                    <div className="text-sm text-slate-500">Sto leggendo la giornata…</div>
                ) : (
                    <div style={{ width: W * scala, height: H * scala }} className="shrink-0">
                        {/* il foglio vive a grandezza vera: si rimpicciolisce
                            solo per guardarlo, e si fotografa com'è */}
                        <div ref={tela} style={{ transform: `scale(${scala})`, transformOrigin: "top left" }}>
                            <ReportGiornaliero dati={datiVivi} />
                        </div>
                    </div>
                )}
            </div>

            <div className="shrink-0 border-t border-white/5 px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                    <input
                        value={commento}
                        onChange={(e) => setCommento(e.target.value.slice(0, 200))}
                        placeholder="Commento della giornata (facoltativo)"
                        disabled={stato === "inviato"}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-indigo-500/40 transition-colors disabled:opacity-50"
                    />
                    {esito ? <p className="text-xs text-rose-300 mt-1.5">{esito}</p> : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => void scarica()} disabled={!dati}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:text-white disabled:opacity-40 transition-colors">
                        <Download size={15} /> <span className="hidden sm:inline">Salva</span>
                    </button>
                    <button onClick={() => void invia()} disabled={!dati || stato !== "pronto"}
                        className={"flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all " +
                            (stato === "inviato"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default"
                                : !dati || stato === "invio"
                                    ? "bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed"
                                    : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30")}>
                        <Send size={15} />
                        {stato === "inviato" ? "Inviato" : stato === "invio" ? "Invio…" : "Invia al canale"}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Quanto pesa davvero una data-url: il base64 gonfia di un terzo. */
function peso(dataUrl: string): number {
    const i = dataUrl.indexOf(",");
    return Math.floor((dataUrl.length - i - 1) * 0.75);
}
