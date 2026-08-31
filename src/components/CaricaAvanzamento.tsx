"use client";

// CARICA L'AVANZAMENTO UFFICIALE (Luca 29/08).
//
// Il file che manda l'operatore è quasi sempre fatto così: una riga per codice
// di inserimento, una colonna per pista. Quindi si chiede solo due cose — a
// quale data è fermo, e che cosa c'è in ogni colonna — e si mostra che cosa
// verrà salvato prima di salvarlo.
//
// LA MAPPATURA STA IN VERTICALE, non in una fila di tendine sopra le colonne.
// È aritmetica: 15 colonne per una tendina leggibile fanno 2.250 px, e la
// finestra ne ha 768 — le tendine venivano larghe 15 px, cioè la sola
// freccetta, e per giunta le colonne IGNORATE erano le più larghe e leggibili
// della fila, perché «— ignora —» è l'etichetta più lunga (misure del revisore
// 31/08). In verticale ogni riga ha tutto lo spazio che le serve, e il file di
// righe ne ha quindici, non duemila.
//
// Il foglio si legge col codice, non con l'intelligenza artificiale: qui si
// muovono numeri che decidono dove si carica una vendita e quanto vale un
// premio, e un modello che sbaglia una cifra non lo scopre nessuno. Ma proprio
// perché la scelta è umana, la finestra deve rendere IMPOSSIBILE salvare senza
// aver visto: gli avvisi stanno in cima, non in fondo.

import { useEffect, useState } from "react";
import { Upload, X, Check, Loader2, Trash2 } from "lucide-react";
import {
    salvaAvanzamento, storicoAvanzamenti, eliminaAvanzamento,
    pulisciGriglia, trovaIntestazione, proponiMappa, righeDaGriglia, diagnosiMappa, celleScartate,
    COL_CODICE, COL_IGNORA, type RigaUfficiale, type FotoAvanzamento,
} from "@/lib/avanzamentoUfficiale";
import { cn } from "@/utils";

const IGNORA = COL_IGNORA;
const CODICE = COL_CODICE;
const gg = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const quando = (t: string | null) => {
    if (!t) return "";
    const d = new Date(t);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} alle ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function CaricaAvanzamento({ brand, brandLabel, monthISO, piste, chi, onFatto, onChiudi }: {
    brand: string; brandLabel?: string; monthISO: string;
    piste: { chiave: string; nome: string }[];
    chi?: string | null;
    onFatto: () => void; onChiudi: () => void;
}) {
    const [nomeFile, setNomeFile] = useState("");
    const [griglia, setGriglia] = useState<string[][]>([]);
    const [intestazioni, setIntestazioni] = useState<string[]>([]);
    const [mappa, setMappa] = useState<string[]>([]);      // colonna → CODICE | nome pista | IGNORA
    const [al, setAl] = useState("");
    const [busy, setBusy] = useState(false);
    const [errore, setErrore] = useState<string | null>(null);
    const [fatto, setFatto] = useState<number | null>(null);
    const [ignorateAperte, setIgnorateAperte] = useState(false);
    const [storico, setStorico] = useState<FotoAvanzamento[] | null>(null);
    const [pannello, setPannello] = useState<"carica" | "storico">("carica");

    const opzioni = [IGNORA, CODICE, ...piste.map((p) => p.nome)];

    // se una fotografia c'è già, la finestra si apre su QUELLA: riaprirsi
    // vuota mentre un avanzamento è in vigore era il modo più sicuro per
    // ricaricarlo due volte senza sapere che c'era (revisore 31/08)
    useEffect(() => {
        storicoAvanzamenti(brand, monthISO).then((st) => {
            setStorico(st);
            if (st.length) setPannello("storico");
        }).catch(() => setStorico([]));
    }, [brand, monthISO]);

    // ESC chiude, come ogni altra finestra del CRM
    useEffect(() => {
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") chiudi(); };
        document.addEventListener("keydown", esc);
        return () => document.removeEventListener("keydown", esc);
    });

    const chiudi = () => {
        // mappare quindici colonne a mano e perderle per un click sfiorato
        // fuori dal riquadro non è un rischio che valga la pena correre
        if (intestazioni.length && fatto == null && !confirm("Esci senza salvare? La mappatura si perde.")) return;
        onChiudi();
    };

    const leggi = async (f: File) => {
        /* IL FILE PRECEDENTE SI AZZERA SUBITO (revisore 31/08): se il secondo
           file non si legge, prima restavano in piedi griglia e mappatura del
           primo con il NOME del secondo — e si salvavano i numeri di uno sotto
           il nome dell'altro. */
        setErrore(null); setFatto(null); setNomeFile(f.name);
        setGriglia([]); setIntestazioni([]); setMappa([]);
        try {
            const XLSX = await import("xlsx");
            const buf = await f.arrayBuffer();
            const wb = XLSX.read(buf, { type: "array" });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const righe = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
            const pulite = pulisciGriglia(righe);
            if (!pulite.length) { setErrore("Il foglio è vuoto."); return; }
            const { head, corpo } = trovaIntestazione(pulite);
            setIntestazioni(head);
            setGriglia(corpo);
            setMappa(proponiMappa(head, piste));
            setPannello("carica");
        } catch (e) {
            setErrore("File non leggibile: " + (e instanceof Error ? e.message : "formato non riconosciuto") + ". Serve un Excel (.xlsx) o un CSV.");
        }
    };

    const righeUfficiali: RigaUfficiale[] = righeDaGriglia(griglia, mappa, piste);
    const diag = intestazioni.length ? diagnosiMappa(intestazioni, mappa, piste) : null;
    const scartate = intestazioni.length ? celleScartate(griglia, mappa, piste) : [];
    const esempio = (i: number) => griglia.slice(0, 3).map((r) => r[i]).filter(Boolean).join(" · ") || "—";
    const mappate = mappa.map((m, i) => ({ i, m })).filter((x) => x.m !== IGNORA);
    const ignorate = mappa.map((m, i) => ({ i, m })).filter((x) => x.m === IGNORA);
    const fineMese = (() => { const d = new Date(monthISO); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().slice(0, 10); })();

    const salva = async () => {
        if (!al) { setErrore("Serve la data a cui è fermo l'avanzamento."); return; }
        if (diag?.senzaCodice) { setErrore("⛔ Manca la colonna del codice di inserimento: senza quella non so a quale negozio attribuire i numeri."); return; }
        /* DUE COLONNE «CODICE» NON SI SALVANO (revisore 31/08). Avvisare non
           bastava: con «Cod. PDV» prima di «Cod. Ins.» vinceva quella
           sbagliata e finivano a database righe su codici che non esistono —
           in un caso misurato il numero del mobile diventava il codice. */
        if (diag && diag.codici.length > 1) { setErrore("⛔ Due colonne dicono di essere il codice di inserimento: lasciane una sola e metti l'altra su «— ignora —»."); return; }
        if (diag?.senzaPiste) { setErrore("⛔ Nessuna colonna è associata a una pista: dimmi almeno quale colonna è il mobile."); return; }
        if (!righeUfficiali.length) { setErrore("Non c'è nessun numero da salvare: controlla la mappatura."); return; }
        setBusy(true); setErrore(null);
        const r = await salvaAvanzamento({ brand, monthISO, al, righe: righeUfficiali, fileName: nomeFile, chi: chi || undefined });
        setBusy(false);
        if (!r.ok) { setErrore(r.errore); return; }
        setFatto(r.n);
        storicoAvanzamenti(brand, monthISO).then(setStorico).catch(() => { });
        onFatto();
    };

    const elimina = async (foto: FotoAvanzamento) => {
        const altre = (storico || []).filter((s) => s.al !== foto.al);
        const piuRecente = (storico || [])[0]?.al === foto.al;
        const cosaSuccede = !altre.length
            ? "Resti senza avanzamento ufficiale: gli scarti spariscono dalla pagina."
            : piuRecente ? `Torni a confrontarti con quella del ${gg(altre[0].al)}.` : "Non cambia niente: non è quella in vigore.";
        if (!confirm(`Elimini la fotografia del ${gg(foto.al)}?\n\n${cosaSuccede}`)) return;
        const r = await eliminaAvanzamento(brand, monthISO, foto.al);
        if (!r.ok) { setErrore(r.errore || "eliminazione non riuscita"); return; }
        storicoAvanzamenti(brand, monthISO).then(setStorico).catch(() => { });
        onFatto();
    };

    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={chiudi}>
            <div role="dialog" aria-modal="true" aria-label="Avanzamento ufficiale dell'operatore"
                className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl border border-white/10 bg-[#141824] shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between px-5 pt-4 pb-2 gap-3">
                    <div className="min-w-0">
                        <h3 className="text-white font-semibold truncate">📊 Avanzamento ufficiale{brandLabel ? ` — ${brandLabel}` : ""}</h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">Fino alla sua data comanda il numero dell&apos;operatore; dopo, quello che registrano i ragazzi.</p>
                    </div>
                    <button onClick={chiudi} aria-label="Chiudi" className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 shrink-0"><X className="w-5 h-5" /></button>
                </div>

                {storico && storico.length > 0 && (
                    <div className="px-5 flex gap-1 border-b border-white/5">
                        {([["carica", "Carica una nuova fotografia"], ["storico", `Le fotografie caricate · ${storico.length}`]] as const).map(([k, l]) => (
                            <button key={k} onClick={() => setPannello(k)}
                                className={cn("px-3 py-2 text-xs font-bold border-b-2 -mb-px transition-colors",
                                    pannello === k ? "border-indigo-400 text-white" : "border-transparent text-slate-500 hover:text-slate-300")}>
                                {l}
                            </button>
                        ))}
                    </div>
                )}

                {errore && <p className="mx-5 mt-3 text-[11px] text-rose-200 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{errore}</p>}
                {fatto != null && <p className="mx-5 mt-3 text-[11px] text-emerald-200 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2">✅ Salvati {fatto} valori al {gg(al)}. Lo scarto compare sulle piste dei codici.</p>}

                {pannello === "storico" ? (
                    <div className="flex-1 overflow-auto px-5 py-3 space-y-2">
                        {(storico || []).map((s, i) => (
                            <div key={s.al} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5",
                                i === 0 ? "border-indigo-400/40 bg-indigo-500/10" : "border-white/10 bg-white/[0.03]")}>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-white">al {gg(s.al)} <span className="text-[11px] font-normal text-slate-400">· {s.n} valori</span></p>
                                    <p className="text-[11px] text-slate-500 truncate">{s.file || "file senza nome"}{s.chi ? ` · ${s.chi}` : ""}{s.quando ? ` · ${quando(s.quando)}` : ""}</p>
                                    {i === 0 && <p className="text-[11px] text-indigo-200 mt-0.5">↑ è questa che comanda: fino al {gg(s.al)} valgono i suoi numeri</p>}
                                </div>
                                <button onClick={() => elimina(s)} title="Elimina questa fotografia"
                                    className="p-2 rounded-lg text-slate-500 hover:text-rose-200 hover:bg-rose-500/10 shrink-0"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        ))}
                        <p className="text-[10px] text-slate-600 pt-1">Vale sempre la più recente. Ricaricare la stessa data la sostituisce.</p>
                    </div>
                ) : (
                    <>
                        <div className="px-5 py-3 flex flex-wrap items-end gap-3 border-b border-white/5">
                            <label className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">File dell&apos;operatore</span>
                                <span className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-300 cursor-pointer hover:bg-white/10 flex items-center gap-2 focus-within:ring-2 focus-within:ring-indigo-400/60">
                                    <Upload className="w-4 h-4" /> {nomeFile || "Scegli un Excel"}
                                    <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) leggi(f); }} />
                                </span>
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Aggiornato al</span>
                                {/* la data deve stare DENTRO il mese che si sta guardando: una
                                    fotografia di luglio confrontata con agosto non vuol dire niente */}
                                <input type="date" value={al} min={monthISO} max={fineMese} onChange={(e) => setAl(e.target.value)} className="glass-input !h-9 text-sm" />
                            </label>
                            {intestazioni.length > 0 && (
                                <span className="text-[11px] text-slate-400 pb-2">
                                    {griglia.length} righe · {intestazioni.length} colonne · <b className="text-emerald-300">{righeUfficiali.length} valori pronti</b>
                                </span>
                            )}
                        </div>

                        <div className="flex-1 overflow-auto px-5 py-3">
                            {!intestazioni.length ? (
                                <p className="text-[12px] text-slate-500 py-6 text-center">Scegli il file che ti ha mandato l&apos;operatore: te lo leggo e ti chiedo solo che cosa c&apos;è in ogni colonna.</p>
                            ) : (
                                <>
                                    {/* GLI AVVISI STANNO IN CIMA: sono la causa numero uno di
                                        numero sbagliato, e vanno letti prima di premere Salva */}
                                    {diag && diag.codici.length > 1 && (
                                        <p className="mb-2 text-[11px] text-rose-200 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">
                                            ⛔ {diag.codici.length} colonne dicono di essere il codice di inserimento ({diag.codici.map((i) => `«${intestazioni[i] || `col. ${i + 1}`}»`).join(", ")}): uso la prima. Metti le altre su «— ignora —».
                                        </p>
                                    )}
                                    {scartate.length > 0 && (
                                        <p className="mb-2 text-[11px] text-amber-100 bg-amber-500/10 border border-amber-400/30 rounded-lg px-3 py-2">
                                            ⚠️ {scartate.length} {scartate.length === 1 ? "cella non è un numero e la salto" : "celle non sono numeri e le salto"}: {[...new Set(scartate.map((x) => x.valore))].slice(0, 5).map((v) => `«${v}»`).join(", ")}{new Set(scartate.map((x) => x.valore)).size > 5 ? "…" : ""}. Se dovevano contare, sistemale nel file.
                                        </p>
                                    )}
                                    {diag?.sommate.map((s) => (
                                        <p key={s.pista} className="mb-2 text-[11px] text-amber-100 bg-amber-500/10 border border-amber-400/30 rounded-lg px-3 py-2">
                                            ➕ {s.colonne.map((c) => `«${c}»`).join(" e ")} finiscono tutte sulla pista <b>{s.pista}</b>: le <b>sommo</b>{(() => {
                                                const ch = piste.find((p) => p.nome === s.pista)?.chiave;
                                                const r = righeUfficiali.find((x) => x.pista === ch);
                                                return r ? ` (${r.cod_gara}: ${r.punti})` : "";
                                            })()}. Se non va bene, metti una delle due su «— ignora —».
                                        </p>
                                    ))}
                                    {diag?.senzaCodice && (
                                        <p className="mb-2 text-[11px] text-rose-200 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">
                                            ⛔ Manca la colonna del codice di inserimento: senza quella non so a quale negozio attribuire i numeri. Scegline una qui sotto.
                                        </p>
                                    )}
                                    {diag && !diag.senzaCodice && diag.senzaPiste && (
                                        <p className="mb-2 text-[11px] text-rose-200 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">
                                            ⛔ Nessuna colonna è associata a una pista: dimmi almeno quale colonna è il mobile.
                                        </p>
                                    )}

                                    <div className="space-y-1">
                                        {mappate.map(({ i, m }) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <span className="w-[30%] min-w-0 text-[11px] text-slate-300 truncate" title={intestazioni[i]}>
                                                    <span className="text-emerald-400">✅</span> {intestazioni[i] || `colonna ${i + 1}`}
                                                </span>
                                                <select value={m} onChange={(e) => setMappa((mm) => mm.map((v, j) => (j === i ? e.target.value : v)))}
                                                    className="glass-input !h-8 text-[11px] w-[220px] shrink-0 !border-indigo-400/50">
                                                    {opzioni.map((o) => <option key={o} value={o}>{o}</option>)}
                                                </select>
                                                <span className="flex-1 min-w-0 text-[10px] text-slate-500 truncate" title={esempio(i)}>{esempio(i)}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {ignorate.length > 0 && (
                                        <div className="mt-3">
                                            <button type="button" onClick={() => setIgnorateAperte((v) => !v)} className="text-[11px] text-slate-500 hover:text-slate-300">
                                                ⚪ {ignorate.length} colonne che sto ignorando ({ignorate.slice(0, 3).map((x) => intestazioni[x.i] || "senza titolo").join(", ")}{ignorate.length > 3 ? "…" : ""}) {ignorateAperte ? "▴" : "▾"}
                                            </button>
                                            {ignorateAperte && (
                                                <div className="mt-1 space-y-1">
                                                    {ignorate.map(({ i, m }) => (
                                                        <div key={i} className="flex items-center gap-2 opacity-70">
                                                            <span className="w-[30%] min-w-0 text-[11px] text-slate-400 truncate" title={intestazioni[i]}>{intestazioni[i] || `colonna ${i + 1}`}</span>
                                                            <select value={m} onChange={(e) => setMappa((mm) => mm.map((v, j) => (j === i ? e.target.value : v)))}
                                                                className="glass-input !h-8 text-[11px] w-[220px] shrink-0">
                                                                {opzioni.map((o) => <option key={o} value={o}>{o}</option>)}
                                                            </select>
                                                            <span className="flex-1 min-w-0 text-[10px] text-slate-600 truncate" title={esempio(i)}>{esempio(i)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-slate-600">
                                {intestazioni.length ? `${mappate.length} colonne su ${intestazioni.length} riconosciute · ${new Set(righeUfficiali.map((r) => r.cod_gara)).size} codici` : ""}
                            </span>
                            <div className="flex items-center gap-2">
                                <button onClick={chiudi} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white">Annulla</button>
                                {/* il bottone resta CLICCABILE: uno spento e basta non dice
                                    perché, e chi lo guarda esce e chiama qualcuno */}
                                <button onClick={fatto != null ? onChiudi : salva} disabled={busy || !intestazioni.length}
                                    className="primary-btn text-xs px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40">
                                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                    {fatto != null ? "Salvato — chiudi" : "Salva l'avanzamento"}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
