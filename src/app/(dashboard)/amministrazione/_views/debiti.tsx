"use client";

/* DEBITI COLLABORATORI (Luca 01/08, rifatto 02/08) — il "blackbook" dei
   debiti dei collaboratori, dentro Amministrazione → Utenti → Debiti
   (amministrativo in su). QUATTRO nature (Luca 02/08):
   - UNA TANTUM: importo secco su un mese di competenza;
   - RATEIZZATO: importo TOTALE diviso in N rate mensili dalla prima rata
     (N righe 'rata' legate da gruppo_id, centesimi di resto sull'ultima);
   - RICORRENZA (es. auto 350/mese): si definisce UNA VOLTA con mese di
     inizio e mese di fine FACOLTATIVO (vuoto = per sempre, mig. 134); il
     maturato si calcola a video mese dopo mese, niente righe manuali.
     Le vecchie righe mensili tipo 'ricorrente' restano valide come sono.
   - CREDITO: segno +1 — soldi resi o importi da scalare, con motivazione;
     abbatte il cumulato del collaboratore.
   Tabella user_movimenti = LIBRO MASTRO per utente (origine debito|gara|
   malus, segno ±): il futuro calderone commissioni/malus scrivera' qui.
   Lo stato debito compare anche nella scheda utente (DebitiUtenteBox). */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { Archive, Check, Loader2, Plus, Timer, Trash2, Undo2, Wallet, RotateCw } from "lucide-react";
import { notify, dbError } from "./toast";
import { SelectPersona, SelectMulti } from "@/components/SelectPersona";

type Movimento = {
    id: string; user_id: string; origine: string; tipo: "one_shot" | "rata" | "ricorrente" | "ricorrenza";
    gruppo_id: string | null; titolo: string; note: string; importo: number; segno: number;
    competenza: string; ricorrenza_fine: string | null; rata_n: number | null; rate_totali: number | null;
    stato: "aperto" | "saldato"; saldato_il: string | null; saldato_da: string | null;
    creato_da: string; created_at: string;
};
type Persona = { id: string; full_name: string; role: string };

const eur = (n: number) => "€ " + Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const meseYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const meseLabel = (ymd: string) => {
    const [y, m] = String(ymd).split("-");
    const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
    return `${MESI[(Number(m) || 1) - 1]} ${y}`;
};
const piuMesi = (ymd: string, n: number) => {
    const [y, m] = ymd.split("-").map(Number);
    const d = new Date(y, (m - 1) + n, 1);
    return meseYmd(d);
};
const mesiTra = (a: string, b: string) => {
    const [y1, m1] = a.split("-").map(Number); const [y2, m2] = b.split("-").map(Number);
    return (y2 - y1) * 12 + (m2 - m1);
};
/** Mensilita' MATURATE a oggi di una regola di ricorrenza (0 se parte nel futuro). */
const mesiMaturati = (r: Movimento) => {
    if (r.tipo !== "ricorrenza") return 1;
    const oggi = meseYmd(new Date());
    const fine = r.ricorrenza_fine && r.ricorrenza_fine < oggi ? r.ricorrenza_fine : oggi;
    if (r.competenza > fine) return 0;
    return mesiTra(r.competenza.slice(0, 7) + "-01", fine.slice(0, 7) + "-01") + 1;
};
/** Contributo della riga al calderone: debiti positivi, CREDITI negativi.
 *  Col filtro mese attivo la ricorrenza vale UNA mensilita'. */
const valoreRiga = (r: Movimento, meseFiltro?: string) => {
    const base = r.tipo === "ricorrenza" ? (meseFiltro ? Number(r.importo) : Number(r.importo) * mesiMaturati(r)) : Number(r.importo);
    return Number(r.segno) === 1 ? -base : base;
};
const periodoRicorrenza = (r: Movimento) =>
    r.ricorrenza_fine ? `${meseLabel(r.competenza)} → ${meseLabel(r.ricorrenza_fine)}` : `dal ${meseLabel(r.competenza)} · per sempre`;

function TipoBadge({ r }: { r: Movimento }) {
    if (Number(r.segno) === 1) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">CREDITO</span>;
    if (r.tipo === "rata") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/30">RATA {r.rata_n}/{r.rate_totali}</span>;
    if (r.tipo === "ricorrenza") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/30">RICORRENTE</span>;
    if (r.tipo === "ricorrente") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/30">RICORRENTE (mese)</span>;
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">UNA TANTUM</span>;
}

export function DebitiView({ gestore }: { gestore: string }) {
    const [loading, setLoading] = useState(true);
    const [righe, setRighe] = useState<Movimento[]>([]);
    const [persone, setPersone] = useState<Persona[]>([]);
    const [busy, setBusy] = useState(false);

    // filtri (deep-link ?du=<user_id> dalla scheda utente); collaboratori
    // MULTI-selezione con la tendina standard del CRM (Luca 01/08 sera)
    const [fUtenti, setFUtenti] = useState<string[]>([]);          // nomi
    const [fMese, setFMese] = useState("");
    const [duPending, setDuPending] = useState<string | null>(null);
    useEffect(() => {
        const du = new URLSearchParams(window.location.search).get("du");
        if (du) setDuPending(du);
    }, []);
    // il deep-link porta l'ID: appena i nomi sono caricati diventa selezione;
    // chi arriva dal box della scheda utente vuole il DETTAGLIO, quindi il suo
    // gruppo si auto-espande (gli altri restano collassati — Luca 04/08)
    useEffect(() => {
        if (!duPending || !persone.length) return;
        const p = persone.find(x => x.id === duPending);
        if (p) { setFUtenti([p.full_name]); setAperti(new Set([p.id])); }
        setDuPending(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [duPending, persone]);

    // form nuovo debito — collaboratore dalla TENDINA STANDARD (SelectPersona):
    // niente testo libero, si salva solo un utente reale (Luca 01/08 sera)
    const [showForm, setShowForm] = useState(false);
    const [nUtenteNome, setNUtenteNome] = useState("");
    const [nTipo, setNTipo] = useState<"one_shot" | "rata" | "ricorrenza" | "credito">("one_shot");
    const [nFine, setNFine] = useState("");   // mese fine ricorrenza ("" = per sempre)
    const [nTitolo, setNTitolo] = useState("");
    const [nImporto, setNImporto] = useState("");
    const [nRate, setNRate] = useState("1");
    const [nMese, setNMese] = useState(meseYmd(new Date()).slice(0, 7));
    const [nNote, setNNote] = useState("");
    // un credito, di norma, SALDA i debiti piu' vecchi (FIFO) e li manda in storico
    const [nCompensa, setNCompensa] = useState(true);
    // vista: lista viva (aperti) oppure ARCHIVIO delle voci gia' compensate
    const [vistaStorico, setVistaStorico] = useState(false);

    const carica = useCallback(async () => {
        const [mov, pers] = await Promise.all([
            supabase.from("user_movimenti").select("*").order("competenza", { ascending: false }).order("created_at", { ascending: false }).limit(2000),
            supabase.from("app_users").select("id, full_name, role").eq("active", true).order("full_name"),
        ]);
        if (dbError("Caricamento debiti", mov.error)) return;
        setRighe((mov.data ?? []) as Movimento[]);
        setPersone((pers.data ?? []) as Persona[]);
        setLoading(false);
    }, []);
    useEffect(() => { carica(); }, [carica]);

    const nomeDi = useCallback((id: string) => persone.find(p => p.id === id)?.full_name || id, [persone]);


    const salvaNuovo = async () => {
        if (busy) return;
        const imp = parseFloat(String(nImporto).replace(",", "."));
        const rate = Math.max(1, parseInt(nRate, 10) || 1);
        const scelto = persone.find(p => p.full_name === nUtenteNome);
        const miss = [!scelto && "Collaboratore (scegli dalla lista)", !nTitolo.trim() && (nTipo === "credito" ? "Motivazione" : "Titolo"), (!imp || imp <= 0) && "Importo", !nMese && "Mese",
            nTipo === "rata" && rate < 2 && "Numero rate (almeno 2)",
            nTipo === "ricorrenza" && nFine && (nFine < nMese) && "Mese di fine (non puo' precedere l'inizio)"].filter(Boolean);
        if (miss.length) { notify("Campi mancanti: " + miss.join(", "), "error"); return; }
        setBusy(true);
        try {
            const base = { user_id: scelto!.id, origine: "debito", note: nNote.trim(), segno: nTipo === "credito" ? 1 : -1, creato_da: gestore };
            const comp = nMese + "-01";
            let rows: Record<string, unknown>[];
            if (nTipo === "credito") {
                rows = [{ ...base, tipo: "one_shot", titolo: nTitolo.trim(), importo: imp, competenza: comp }];
            } else if (nTipo === "ricorrenza") {
                rows = [{ ...base, tipo: "ricorrenza", titolo: nTitolo.trim(), importo: imp, competenza: comp, ricorrenza_fine: nFine ? nFine + "-01" : null }];
            } else if (nTipo === "one_shot") {
                rows = [{ ...base, tipo: "one_shot", titolo: nTitolo.trim(), importo: imp, competenza: comp }];
            } else {
                // rateizzato: quote uguali al centesimo, il resto sull'ultima rata
                const gruppo = crypto.randomUUID();
                const quota = Math.floor((imp / rate) * 100) / 100;
                const ultima = Math.round((imp - quota * (rate - 1)) * 100) / 100;
                rows = Array.from({ length: rate }, (_, i) => ({
                    ...base, tipo: "rata", gruppo_id: gruppo,
                    titolo: nTitolo.trim(), importo: i === rate - 1 ? ultima : quota,
                    competenza: piuMesi(comp, i), rata_n: i + 1, rate_totali: rate,
                }));
            }
            const { error } = await supabase.from("user_movimenti").insert(rows);
            if (dbError("Salvataggio debito", error)) return;
            let extra = "";
            if (nTipo === "credito" && nCompensa) {
                const esito = await compensaFIFO(scelto!.id, imp, `Credito: ${nTitolo.trim()}`);
                extra = esito.saldate
                    ? ` — compensate ${esito.saldate} voci${esito.avanzo > 0 ? `, avanzo ${eur(esito.avanzo)}` : ""}`
                    : " — nessuna voce interamente coperta: resta a scalare";
            }
            notify((rows.length > 1 ? `Debito registrato in ${rows.length} rate ✓` : nTipo === "credito" ? "Credito registrato ✓" : "Debito registrato ✓") + extra, "ok");
            setShowForm(false); setNUtenteNome(""); setNTitolo(""); setNImporto(""); setNRate("1"); setNNote(""); setNFine("");
            await carica();
        } finally { setBusy(false); }
    };

    /** Compensazione FIFO: un credito salda i debiti APERTI piu' vecchi finche'
     *  ha capienza; le voci coperte per intero vanno in storico. Le voci coperte
     *  solo in parte restano aperte (non si spezzano a mano: il residuo si vede
     *  dal cumulato) e il credito avanzato resta a disposizione. */
    const compensaFIFO = async (userId: string, credito: number, etichetta: string) => {
        const aperti = righe
            .filter(r => r.user_id === userId && r.origine === "debito" && r.stato !== "saldato"
                && Number(r.segno) !== 1 && r.tipo !== "ricorrenza")
            .sort((a, b) => a.competenza.localeCompare(b.competenza) || a.created_at.localeCompare(b.created_at));
        let resta = credito; const ids: string[] = [];
        for (const d of aperti) {
            const v = Number(d.importo);
            if (resta >= v - 0.001) { resta = Math.round((resta - v) * 100) / 100; ids.push(d.id); }
            else break;
        }
        if (!ids.length) return { saldate: 0, avanzo: credito };
        const { error } = await supabase.from("user_movimenti")
            .update({ stato: "saldato", saldato_il: new Date().toISOString(), saldato_da: etichetta })
            .in("id", ids);
        if (error) { dbError("Compensazione", error); return { saldate: 0, avanzo: credito }; }
        return { saldate: ids.length, avanzo: Math.round(resta * 100) / 100 };
    };

    /** Segna una singola voce come compensata (finisce in storico) o la riapre. */
    const cambiaStato = async (r: Movimento, saldato: boolean) => {
        const { error } = await supabase.from("user_movimenti").update(saldato
            ? { stato: "saldato", saldato_il: new Date().toISOString(), saldato_da: gestore }
            : { stato: "aperto", saldato_il: null, saldato_da: null }).eq("id", r.id);
        if (dbError(saldato ? "Compensazione" : "Riapertura", error)) return;
        notify(saldato ? `"${r.titolo}" compensata → storico ✓` : `"${r.titolo}" riaperta ✓`, "ok");
        await carica();
    };

    // ricorrente: duplica al mese corrente (se non c'e' gia')
    const ripetiMese = async (r: Movimento) => {
        const comp = meseYmd(new Date());
        if (righe.some(x => x.user_id === r.user_id && x.tipo === "ricorrente" && x.titolo === r.titolo && x.competenza.slice(0, 7) === comp.slice(0, 7))) {
            notify("C'è già una riga di " + meseLabel(comp) + " per questa voce", "error"); return;
        }
        const { error } = await supabase.from("user_movimenti").insert({
            user_id: r.user_id, origine: "debito", tipo: "ricorrente", titolo: r.titolo,
            note: r.note, importo: r.importo, segno: -1, competenza: comp, creato_da: gestore,
        });
        if (dbError("Ripetizione mese", error)) return;
        notify("Aggiunta la riga di " + meseLabel(comp) + " ✓", "ok");
        await carica();
    };

    const elimina = async (r: Movimento) => {
        if (!window.confirm(`Eliminare "${r.titolo}" (${eur(r.importo)}) di ${nomeDi(r.user_id)}?${r.gruppo_id ? "\nSi elimina SOLO questa rata, non tutto il piano." : ""}`)) return;
        const { error } = await supabase.from("user_movimenti").delete().eq("id", r.id);
        if (dbError("Eliminazione", error)) return;
        await carica();
    };

    const filtrate = useMemo(() => righe.filter(r => {
        if (r.origine !== "debito") return false;   // il mastro ospitera' anche gare/malus: qui solo debiti
        // STORICO (Luca 02/08): le voci compensate escono dalla lista viva e si
        // consultano nell'archivio — niente liste chilometriche.
        if ((r.stato === "saldato") !== vistaStorico) return false;
        if (fUtenti.length && !fUtenti.includes(nomeDi(r.user_id))) return false;
        if (fMese) {
            if (r.tipo === "ricorrenza") {
                const m = fMese + "-01";
                if (m < r.competenza.slice(0, 7) + "-01") return false;
                if (r.ricorrenza_fine && m > r.ricorrenza_fine.slice(0, 7) + "-01") return false;
            } else if (r.competenza.slice(0, 7) !== fMese) return false;
        }
        return true;
    }), [righe, fUtenti, fMese, nomeDi, vistaStorico]);

    // raggruppo per collaboratore, ordinato per debito aperto decrescente
    const gruppi = useMemo(() => {
        const m = new Map<string, Movimento[]>();
        filtrate.forEach(r => { const a = m.get(r.user_id) || []; a.push(r); m.set(r.user_id, a); });
        return [...m.entries()]
            .map(([uid, rows]) => ({ uid, rows, totale: rows.reduce((s, r) => s + valoreRiga(r, fMese || undefined), 0) }))
            .sort((a, b) => b.totale - a.totale);
    }, [filtrate]);
    const totaleDebiti = useMemo(() => filtrate.reduce((s, r) => s + valoreRiga(r, fMese || undefined), 0), [filtrate, fMese]);
    // CLICK SUL NOME = mostra/nascondi le righe del collaboratore. Semantica
    // INVERTITA (Luca 04/08): si tengono gli uid APERTI, default vuoto = tutti
    // COLLASSATI alla prima apertura; il cumulato resta sempre visibile e i
    // gruppi nuovi (cambio filtri/archivio) nascono chiusi da soli.
    const [aperti, setAperti] = useState<Set<string>>(new Set());
    const togAperto = (uid: string) => setAperti(p => { const n = new Set(p); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });
    const nStorico = useMemo(() => righe.filter(r => r.origine === "debito" && r.stato === "saldato"
        && (!fUtenti.length || fUtenti.includes(nomeDi(r.user_id)))).length, [righe, fUtenti, nomeDi]);

    if (loading) return <div className="flex items-center gap-3 text-slate-400 py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Caricamento debiti…</div>;

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <p className="text-sm text-slate-400 max-w-2xl">
                    Il <b className="text-slate-200">blackbook</b> dei collaboratori: una tantum, rateizzati,
                    <b className="text-slate-200"> ricorrenze</b> (si definiscono una volta: inizio → fine, o per
                    sempre; il maturato cresce da solo mese dopo mese) e <b className="text-emerald-300">crediti</b> che
                    scalano il cumulato.
                </p>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{vistaStorico ? "Totale archiviato (filtrato)" : "Totale aperto (filtrato)"}</p>
                        <p className={cn("text-xl font-black", vistaStorico ? "text-slate-400" : "text-rose-400")}>{eur(totaleDebiti)}</p>
                    </div>
                    <button onClick={() => setVistaStorico(v => !v)} title="Le voci compensate finiscono qui"
                        className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all",
                            vistaStorico ? "border-sky-400/60 bg-sky-500/15 text-sky-200" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10")}>
                        <Archive className="w-4 h-4" /> {vistaStorico ? "Torna agli aperti" : `Storico${nStorico ? ` (${nStorico})` : ""}`}
                    </button>
                    <button onClick={() => setShowForm(v => !v)}
                        className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all",
                            showForm ? "border-white/20 bg-white/5 text-slate-300" : "border-rose-400/60 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25")}>
                        <Plus className="w-4 h-4" /> {showForm ? "Chiudi" : "Nuovo debito"}
                    </button>
                </div>
            </div>

            {showForm && (
                <div className="glass-card p-5 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Collaboratore *</p>
                            <SelectPersona value={nUtenteNome} onChange={setNUtenteNome} opzioni={persone.map(p => p.full_name)} placeholder="Scegli il collaboratore…" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Natura *</p>
                            <div className="flex gap-2 flex-wrap">
                                {([["one_shot", "💶 Una tantum"], ["rata", "📅 Rateizzato"], ["ricorrenza", "🔁 Ricorrente"], ["credito", "💚 Credito"]] as const).map(([k, l]) => (
                                    <button key={k} onClick={() => setNTipo(k)}
                                        className={cn("flex-1 min-w-[110px] py-2 rounded-xl text-xs font-bold border", nTipo === k ? (k === "credito" ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-200" : "border-rose-400/70 bg-rose-500/15 text-rose-200") : "border-white/10 text-slate-400")}>{l}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="col-span-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{nTipo === "credito" ? "Motivazione *" : "Titolo *"}</p>
                            <input value={nTitolo} onChange={e => setNTitolo(e.target.value)} placeholder={nTipo === "ricorrenza" ? "Es. Auto aziendale" : nTipo === "credito" ? "Es. Restituzione contanti" : "Es. iPhone 15"} className="glass-input w-full text-sm" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{nTipo === "ricorrenza" ? "Importo mensile *" : "Importo totale *"}</p>
                            <input value={nImporto} onChange={e => setNImporto(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="es. 350" inputMode="decimal" className="glass-input w-full text-sm font-mono" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{nTipo === "ricorrenza" ? "Mese di inizio *" : nTipo === "rata" ? "Mese prima rata *" : "Mese di competenza *"}</p>
                            <input type="month" value={nMese} onChange={e => setNMese(e.target.value)} className="glass-input w-full text-sm" />
                        </div>
                    </div>
                    {nTipo === "rata" && (
                        <div className="flex items-end gap-3 flex-wrap">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Numero di rate (mesi) *</p>
                                <input value={nRate} onChange={e => setNRate(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" className="glass-input w-28 text-sm font-mono" />
                            </div>
                            {parseInt(nRate, 10) > 1 && parseFloat(String(nImporto).replace(",", ".")) > 0 && (
                                <p className="text-xs text-slate-400 pb-2.5">
                                    → {nRate} rate da ~{eur(parseFloat(String(nImporto).replace(",", ".")) / (parseInt(nRate, 10) || 1))} da {meseLabel(nMese + "-01")}
                                </p>
                            )}
                        </div>
                    )}
                    {nTipo === "ricorrenza" && (
                        <div className="flex items-end gap-3 flex-wrap">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Mese di fine (facoltativo)</p>
                                <input type="month" value={nFine} min={nMese} onChange={e => setNFine(e.target.value)} className="glass-input w-44 text-sm" />
                            </div>
                            <p className="text-xs text-slate-400 pb-2.5">
                                {nFine ? `→ ${eur(parseFloat(String(nImporto).replace(",", ".")) || 0)}/mese da ${meseLabel(nMese + "-01")} a ${meseLabel(nFine + "-01")} (${mesiTra(nMese + "-01", nFine + "-01") + 1} mensilita')` : "Vuoto = PER SEMPRE: matura ogni mese finche' non la elimini"}
                            </p>
                        </div>
                    )}
                    {nTipo === "credito" && (
                        <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 cursor-pointer">
                            <input type="checkbox" checked={nCompensa} onChange={e => setNCompensa(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                            <span className="text-xs text-slate-300">
                                <b className="text-emerald-300">Compensa i debiti più vecchi</b> — le voci coperte per intero finiscono in storico; quello che avanza resta a scalare.
                            </span>
                        </label>
                    )}
                    <textarea value={nNote} onChange={e => setNNote(e.target.value)} rows={2} placeholder="Note (facoltative)…" className="glass-input w-full text-sm resize-none" />
                    <button onClick={salvaNuovo} disabled={busy}
                        className={cn("w-full py-3 rounded-xl font-bold text-sm text-white hover:brightness-110 disabled:opacity-50 bg-gradient-to-r", nTipo === "credito" ? "from-emerald-600 to-green-600" : "from-rose-600 to-red-600")}>
                        {busy ? "Salvataggio…" : nTipo === "credito" ? "Registra il credito" : "Registra il debito"}
                    </button>
                </div>
            )}

            {/* filtri — tendine STANDARD del CRM (SelectMulti/SelectOpzioni) */}
            <div className="glass-panel p-3.5 flex flex-wrap gap-2 items-center">
                <div className="w-56"><SelectMulti values={fUtenti} onChange={setFUtenti} opzioni={persone.map(p => p.full_name)} placeholder="Collaboratori — scrivi per filtrare" /></div>
                <input type="month" value={fMese} onChange={e => setFMese(e.target.value)} className="glass-input !h-9 text-xs" title="Mese di competenza" />
                {(fUtenti.length > 0 || fMese) && (
                    <button onClick={() => { setFUtenti([]); setFMese(""); }} className="text-xs text-slate-400 hover:text-white px-2">↺ azzera</button>
                )}
            </div>

            {/* elenco per collaboratore */}
            {gruppi.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">{vistaStorico ? "Nessuna voce archiviata con questi filtri." : "Nessun debito aperto con questi filtri."}</p>
            ) : gruppi.map(g => (
                <div key={g.uid} className="glass-card overflow-hidden">
                    <div className="px-4 py-3 bg-white/[0.03] border-b border-white/5 flex items-center justify-between gap-3 flex-wrap">
                        <button onClick={() => togAperto(g.uid)} title={aperti.has(g.uid) ? "Nascondi il dettaglio delle righe" : "Mostra il dettaglio delle righe"}
                            className="text-sm font-bold text-white flex items-center gap-2 hover:text-rose-200 transition-colors">
                            <Wallet className="w-4 h-4 text-rose-400" /> {nomeDi(g.uid)}
                            <span className="text-xs font-normal text-slate-500">{aperti.has(g.uid) ? "▾" : `▸ ${g.rows.length} voc${g.rows.length === 1 ? "e" : "i"}`}</span>
                        </button>
                        <p className={cn("text-sm font-black", g.totale > 0 ? "text-rose-400" : "text-emerald-400")}>{g.totale > 0 ? `cumulato ${eur(g.totale)}` : g.totale < 0 ? `in credito ${eur(-g.totale)}` : "in pari"}</p>
                    </div>
                    {aperti.has(g.uid) && <div className="divide-y divide-white/5">
                        {g.rows.map(r => (
                            <div key={r.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
                                <div className="flex-1 min-w-[220px]">
                                    <p className="text-sm text-slate-100 font-semibold">{r.titolo} <TipoBadge r={r} /></p>
                                    <p className="text-[11px] text-slate-500">
                                        {r.tipo === "ricorrenza" ? `${periodoRicorrenza(r)} · ${mesiMaturati(r)} mensilita' maturate` : meseLabel(r.competenza)}
                                        {r.note ? ` · ${r.note}` : ""} · inserito da {r.creato_da || "—"}
                                        {r.stato === "saldato" && r.saldato_il ? ` · compensata il ${new Date(r.saldato_il).toLocaleDateString("it-IT")}${r.saldato_da ? ` (${r.saldato_da})` : ""}` : ""}
                                    </p>
                                </div>
                                <p className={cn("text-sm font-black font-mono", Number(r.segno) === 1 ? "text-emerald-400" : "text-slate-100")}>
                                    {Number(r.segno) === 1 ? "− " : ""}{r.tipo === "ricorrenza" ? `${eur(r.importo)}/mese${fMese ? "" : ` = ${eur(Number(r.importo) * mesiMaturati(r))}`}` : eur(r.importo)}
                                </p>
                                {r.tipo === "ricorrente" && r.stato !== "saldato" && (
                                    <button onClick={() => ripetiMese(r)} title="Aggiungi la stessa voce sul mese corrente"
                                        className="p-1.5 rounded-lg text-slate-500 hover:text-violet-300 hover:bg-violet-500/10"><RotateCw className="w-4 h-4" /></button>
                                )}
                                {r.stato === "saldato" ? (
                                    <button onClick={() => cambiaStato(r, false)} title="Riporta la voce tra gli aperti"
                                        className="p-1.5 rounded-lg text-slate-600 hover:text-sky-300 hover:bg-sky-500/10"><Undo2 className="w-4 h-4" /></button>
                                ) : r.tipo !== "ricorrenza" && (
                                    <button onClick={() => cambiaStato(r, true)} title="Segna compensata: finisce in storico"
                                        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-300 hover:bg-emerald-500/10"><Check className="w-4 h-4" /></button>
                                )}
                                <button onClick={() => elimina(r)} title="Elimina la voce"
                                    className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>}
                </div>
            ))}
        </div>
    );
}

/** Riquadro nella SCHEDA UTENTE: malus del collaboratore — pratiche PDA
 *  (malus_storico, campo venditore) + laboratorio usati (usati_malus,
 *  campo tecnico). Da scalare = tutto cio' che non e' compensato. */
export function MalusUtenteBox({ nome }: { nome: string }) {
    const [dati, setDati] = useState<null | { pratiche: number; lab: number; disdette: number; attivi: number; compensati: number }>(null);
    useEffect(() => {
        (async () => {
            const [p, l, d] = await Promise.all([
                supabase.from("malus_storico").select("importo,stato").eq("venditore", nome).limit(500),
                supabase.from("usati_malus").select("importo,stato").eq("tecnico", nome).limit(500),
                // disdette (Luca 06/08): 5€/gg oltre i 3gg di franchigia in "da_verificare";
                // calcolato LIVE dalle date del ciclo (vivo se ancora da verificare,
                // congelato a verificata_il se conclusa in ritardo)
                supabase.from("richieste_disdette").select("status,verifica_dal,verificata_il")
                    .eq("consulente", nome).in("status", ["da_verificare", "conclusa"]).limit(500),
            ]);
            const pr = (p.data ?? []) as { importo: number; stato: string }[];
            const lb = (l.data ?? []) as { importo: number; stato: string }[];
            const GG = 24 * 60 * 60 * 1000;
            const dsMalus = ((d.data ?? []) as { status: string; verifica_dal: string | null; verificata_il: string | null }[])
                .reduce((s2, r) => {
                    if (!r.verifica_dal) return s2;
                    const fine = r.status === "conclusa" ? (r.verificata_il ? new Date(r.verificata_il).getTime() : null) : Date.now();
                    if (fine === null) return s2;
                    const gg = Math.floor((fine - new Date(r.verifica_dal).getTime()) / GG);
                    return s2 + Math.max(0, gg - 3) * 5;
                }, 0);
            const aperti = [...pr, ...lb].filter(r => r.stato !== "compensato");
            setDati({
                pratiche: pr.filter(r => r.stato !== "compensato").reduce((s2, r) => s2 + Number(r.importo || 0), 0),
                lab: lb.filter(r => r.stato !== "compensato").reduce((s2, r) => s2 + Number(r.importo || 0), 0),
                disdette: dsMalus,
                attivi: aperti.length + (dsMalus > 0 ? 1 : 0),
                compensati: pr.length + lb.length - aperti.length,
            });
        })();
    }, [nome]);
    if (!dati) return null;
    const tot = dati.pratiche + dati.lab + dati.disdette;
    return (
        <a href={`/pda/tracking?malus=${encodeURIComponent(nome)}`} title="Apri il dettaglio dei suoi malus nel Tracking PDA"
            className="block glass-card p-4 rounded-xl border-l-4 border-l-amber-500/70 hover:bg-white/[0.04] transition-colors cursor-pointer">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-bold text-white flex items-center gap-2"><Timer className="w-4 h-4 text-amber-400" /> Malus</p>
                <p className={cn("text-base font-black", tot > 0 ? "text-amber-400" : "text-emerald-400")}>{tot > 0 ? eur(tot) + " da scalare" : "nessun malus"}</p>
            </div>
            {(tot > 0 || dati.compensati > 0) && (
                <p className="text-[11px] text-slate-400 mt-1">
                    {dati.pratiche > 0 ? `• pratiche ${eur(dati.pratiche)} ` : ""}
                    {dati.lab > 0 ? `• laboratorio ${eur(dati.lab)} ` : ""}
                    {dati.disdette > 0 ? `• disdette ${eur(dati.disdette)} ` : ""}
                    {dati.attivi > 0 ? `· ${dati.attivi} episodi attivi` : ""}
                    {dati.compensati > 0 ? ` · ${dati.compensati} gia' compensati` : ""}
                </p>
            )}
            <span className="inline-block mt-2 text-[11px] font-bold text-amber-300">Apri il dettaglio nel Tracking →</span>
        </a>
    );
}

/** Riquadro compatto nella SCHEDA UTENTE: stato debito del collaboratore. */
export function DebitiUtenteBox({ userId }: { userId: string }) {
    const [righe, setRighe] = useState<Movimento[] | null>(null);
    useEffect(() => {
        (async () => {
            const { data, error } = await supabase.from("user_movimenti").select("*")
                .eq("user_id", userId).eq("origine", "debito").order("competenza", { ascending: false }).limit(500);
            setRighe(error ? [] : (data ?? []) as Movimento[]);   // tabella assente pre-mig. 127: box vuoto
        })();
    }, [userId]);
    if (!righe) return null;
    const aperte = righe.filter(r => r.stato !== "saldato");        // lo storico non pesa sul saldo
    const nArch = righe.length - aperte.length;
    const tot = aperte.reduce((s, r) => s + valoreRiga(r), 0);
    return (
        <div className="glass-card p-4 rounded-xl border-l-4 border-l-rose-500/70">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-bold text-white flex items-center gap-2"><Wallet className="w-4 h-4 text-rose-400" /> Debiti verso l&apos;azienda</p>
                <p className={cn("text-base font-black", tot > 0 ? "text-rose-400" : "text-emerald-400")}>{tot > 0 ? eur(tot) + " cumulati" : "nessun debito"}</p>
            </div>
            {aperte.slice(0, 3).map(r => (
                <p key={r.id} className="text-[11px] text-slate-400 mt-1">• {r.titolo} <TipoBadge r={r} /> — {r.tipo === "ricorrenza" ? `${eur(r.importo)}/mese (${periodoRicorrenza(r)})` : `${eur(r.importo)} (${meseLabel(r.competenza)})`}</p>
            ))}
            {aperte.length > 3 && <p className="text-[11px] text-slate-500 mt-1">…e altre {aperte.length - 3} voci</p>}
            {nArch > 0 && <p className="text-[11px] text-slate-600 mt-1">{nArch} voci già compensate in storico</p>}
            <a href={`/amministrazione?sez=utenti&tab=debiti&du=${userId}`} className="inline-block mt-2 text-[11px] font-bold text-rose-300 hover:text-rose-200">Apri il registro completo →</a>
        </div>
    );
}
