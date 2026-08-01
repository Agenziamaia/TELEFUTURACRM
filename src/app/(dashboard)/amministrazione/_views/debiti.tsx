"use client";

/* DEBITI COLLABORATORI (Luca 01/08) — il "blackbook" dei debiti dei
   collaboratori verso l'azienda, dentro Amministrazione → Utenti → Debiti
   (amministrativo in su). Due nature:
   - ONE SHOT, rateizzabile in N mesi: N righe 'rata' legate da gruppo_id,
     centesimi di resto sull'ultima rata;
   - RICORRENTE (es. auto): una riga per mese di competenza — la popolazione
     mensile e' VOLUTAMENTE manuale ("ogni mese vado li' ad aggiungerlo"),
     col bottone rapido "ripeti questo mese" sull'ultima ricorrenza.
   Tabella user_movimenti = LIBRO MASTRO per utente (origine debito|gara|
   malus, segno ±): il futuro calderone commissioni/malus scrivera' qui.
   Lo stato debito compare anche nella scheda utente (DebitiUtenteBox). */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { Loader2, Plus, Trash2, Wallet, RotateCw, CheckCircle2 } from "lucide-react";
import { notify, dbError } from "./toast";

type Movimento = {
    id: string; user_id: string; origine: string; tipo: "one_shot" | "rata" | "ricorrente";
    gruppo_id: string | null; titolo: string; note: string; importo: number; segno: number;
    competenza: string; rata_n: number | null; rate_totali: number | null;
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

function TipoBadge({ r }: { r: Movimento }) {
    if (r.tipo === "rata") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/30">RATA {r.rata_n}/{r.rate_totali}</span>;
    if (r.tipo === "ricorrente") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/30">RICORRENTE</span>;
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">ONE SHOT</span>;
}

export function DebitiView({ gestore }: { gestore: string }) {
    const [loading, setLoading] = useState(true);
    const [righe, setRighe] = useState<Movimento[]>([]);
    const [persone, setPersone] = useState<Persona[]>([]);
    const [busy, setBusy] = useState(false);

    // filtri (deep-link ?du=<user_id> dalla scheda utente)
    const [fUtente, setFUtente] = useState("");
    const [fTipo, setFTipo] = useState("");
    const [fStato, setFStato] = useState<"aperto" | "saldato" | "">("aperto");
    const [fMese, setFMese] = useState("");
    useEffect(() => {
        const du = new URLSearchParams(window.location.search).get("du");
        if (du) setFUtente(du);
    }, []);

    // form nuovo debito
    const [showForm, setShowForm] = useState(false);
    const [nUtente, setNUtente] = useState("");
    const [nCerca, setNCerca] = useState("");
    const [nTipo, setNTipo] = useState<"one_shot" | "ricorrente">("one_shot");
    const [nTitolo, setNTitolo] = useState("");
    const [nImporto, setNImporto] = useState("");
    const [nRate, setNRate] = useState("1");
    const [nMese, setNMese] = useState(meseYmd(new Date()).slice(0, 7));
    const [nNote, setNNote] = useState("");

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
        const miss = [!nUtente && "Collaboratore", !nTitolo.trim() && "Titolo", (!imp || imp <= 0) && "Importo", !nMese && "Mese"].filter(Boolean);
        if (miss.length) { notify("Campi mancanti: " + miss.join(", "), "error"); return; }
        setBusy(true);
        try {
            const base = { user_id: nUtente, origine: "debito", note: nNote.trim(), segno: -1, creato_da: gestore };
            const comp = nMese + "-01";
            let rows: Record<string, unknown>[];
            if (nTipo === "ricorrente") {
                rows = [{ ...base, tipo: "ricorrente", titolo: nTitolo.trim(), importo: imp, competenza: comp }];
            } else if (rate <= 1) {
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
            notify(rows.length > 1 ? `Debito registrato in ${rows.length} rate ✓` : "Debito registrato ✓", "ok");
            setShowForm(false); setNUtente(""); setNCerca(""); setNTitolo(""); setNImporto(""); setNRate("1"); setNNote("");
            await carica();
        } finally { setBusy(false); }
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

    const cambiaStato = async (r: Movimento) => {
        const nuovo = r.stato === "aperto" ? "saldato" : "aperto";
        const { error } = await supabase.from("user_movimenti").update({
            stato: nuovo,
            saldato_il: nuovo === "saldato" ? new Date().toISOString() : null,
            saldato_da: nuovo === "saldato" ? gestore : null,
            updated_at: new Date().toISOString(),
        }).eq("id", r.id);
        if (dbError("Cambio stato", error)) return;
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
        if (fUtente && r.user_id !== fUtente && !nomeDi(r.user_id).toLowerCase().includes(fUtente.toLowerCase())) return false;
        if (fTipo && r.tipo !== fTipo) return false;
        if (fStato && r.stato !== fStato) return false;
        if (fMese && r.competenza.slice(0, 7) !== fMese) return false;
        return true;
    }), [righe, fUtente, fTipo, fStato, fMese, nomeDi]);

    // raggruppo per collaboratore, ordinato per debito aperto decrescente
    const gruppi = useMemo(() => {
        const m = new Map<string, Movimento[]>();
        filtrate.forEach(r => { const a = m.get(r.user_id) || []; a.push(r); m.set(r.user_id, a); });
        return [...m.entries()]
            .map(([uid, rows]) => ({ uid, rows, aperto: rows.filter(r => r.stato === "aperto").reduce((s, r) => s + Number(r.importo), 0) }))
            .sort((a, b) => b.aperto - a.aperto);
    }, [filtrate]);
    const totaleAperto = useMemo(() => filtrate.filter(r => r.stato === "aperto").reduce((s, r) => s + Number(r.importo), 0), [filtrate]);

    const personeFiltrate = nCerca.trim()
        ? persone.filter(p => p.full_name.toLowerCase().includes(nCerca.trim().toLowerCase())).slice(0, 8)
        : [];

    if (loading) return <div className="flex items-center gap-3 text-slate-400 py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Caricamento debiti…</div>;

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <p className="text-sm text-slate-400 max-w-2xl">
                    Il <b className="text-slate-200">blackbook</b> dei debiti dei collaboratori: acquisti da
                    trattenere, rate e costi ricorrenti. I ricorrenti si aggiungono <b className="text-slate-200">mese
                    per mese</b> (bottone <RotateCw className="w-3 h-3 inline" /> sull&apos;ultima riga).
                </p>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Totale aperto (filtrato)</p>
                        <p className="text-xl font-black text-rose-400">{eur(totaleAperto)}</p>
                    </div>
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
                        <div className="relative">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Collaboratore *</p>
                            {nUtente ? (
                                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border-2 border-rose-400/50 bg-rose-500/10">
                                    <span className="text-sm font-bold text-rose-200">{nomeDi(nUtente)}</span>
                                    <button onClick={() => { setNUtente(""); setNCerca(""); }} className="text-xs text-slate-400 hover:text-white">✕</button>
                                </div>
                            ) : (
                                <>
                                    <input value={nCerca} onChange={e => setNCerca(e.target.value)} placeholder="Scrivi il nome…" className="glass-input w-full text-sm" />
                                    {personeFiltrate.length > 0 && (
                                        <div className="absolute z-40 mt-1 w-full rounded-lg border border-white/10 bg-[#0f111a] shadow-2xl overflow-hidden">
                                            {personeFiltrate.map(p => (
                                                <button key={p.id} onClick={() => { setNUtente(p.id); setNCerca(""); }}
                                                    className="block w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-rose-500/15">
                                                    {p.full_name} <span className="text-slate-500">· {p.role}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Natura *</p>
                            <div className="flex gap-2">
                                {([["one_shot", "💶 One shot (rateizzabile)"], ["ricorrente", "🔁 Ricorrente (mensile)"]] as const).map(([k, l]) => (
                                    <button key={k} onClick={() => setNTipo(k)}
                                        className={cn("flex-1 py-2 rounded-xl text-xs font-bold border", nTipo === k ? "border-rose-400/70 bg-rose-500/15 text-rose-200" : "border-white/10 text-slate-400")}>{l}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="col-span-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Titolo *</p>
                            <input value={nTitolo} onChange={e => setNTitolo(e.target.value)} placeholder={nTipo === "ricorrente" ? "Es. Auto aziendale" : "Es. iPhone 15 a rate"} className="glass-input w-full text-sm" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{nTipo === "ricorrente" ? "Importo mensile *" : "Importo totale *"}</p>
                            <input value={nImporto} onChange={e => setNImporto(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="es. 450" inputMode="decimal" className="glass-input w-full text-sm font-mono" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{nTipo === "ricorrente" ? "Mese di competenza *" : "Mese prima rata *"}</p>
                            <input type="month" value={nMese} onChange={e => setNMese(e.target.value)} className="glass-input w-full text-sm" />
                        </div>
                    </div>
                    {nTipo === "one_shot" && (
                        <div className="flex items-end gap-3 flex-wrap">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Numero di rate (mesi)</p>
                                <input value={nRate} onChange={e => setNRate(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" className="glass-input w-28 text-sm font-mono" />
                            </div>
                            {parseInt(nRate, 10) > 1 && parseFloat(String(nImporto).replace(",", ".")) > 0 && (
                                <p className="text-xs text-slate-400 pb-2.5">
                                    → {nRate} rate da ~{eur(parseFloat(String(nImporto).replace(",", ".")) / (parseInt(nRate, 10) || 1))} da {meseLabel(nMese + "-01")}
                                </p>
                            )}
                        </div>
                    )}
                    <textarea value={nNote} onChange={e => setNNote(e.target.value)} rows={2} placeholder="Note (facoltative)…" className="glass-input w-full text-sm resize-none" />
                    <button onClick={salvaNuovo} disabled={busy}
                        className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-rose-600 to-red-600 hover:brightness-110 disabled:opacity-50">
                        {busy ? "Salvataggio…" : "Registra il debito"}
                    </button>
                </div>
            )}

            {/* filtri */}
            <div className="glass-panel p-3.5 flex flex-wrap gap-2 items-center">
                <input value={fUtente} onChange={e => setFUtente(e.target.value)} placeholder="🔍 Collaboratore…" className="glass-input !h-9 text-xs w-48" />
                <select value={fTipo} onChange={e => setFTipo(e.target.value)} className="glass-input !h-9 text-xs">
                    <option value="">Tutte le nature</option><option value="one_shot">One shot</option><option value="rata">Rate</option><option value="ricorrente">Ricorrenti</option>
                </select>
                <select value={fStato} onChange={e => setFStato(e.target.value as typeof fStato)} className="glass-input !h-9 text-xs">
                    <option value="aperto">Aperti</option><option value="saldato">Saldati</option><option value="">Tutti</option>
                </select>
                <input type="month" value={fMese} onChange={e => setFMese(e.target.value)} className="glass-input !h-9 text-xs" title="Mese di competenza" />
                {(fUtente || fTipo || fStato !== "aperto" || fMese) && (
                    <button onClick={() => { setFUtente(""); setFTipo(""); setFStato("aperto"); setFMese(""); }} className="text-xs text-slate-400 hover:text-white px-2">↺ azzera</button>
                )}
            </div>

            {/* elenco per collaboratore */}
            {gruppi.length === 0 ? (
                <p className="text-sm text-slate-500 py-10 text-center">Nessun debito con questi filtri.</p>
            ) : gruppi.map(g => (
                <div key={g.uid} className="glass-card overflow-hidden">
                    <div className="px-4 py-3 bg-white/[0.03] border-b border-white/5 flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-sm font-bold text-white flex items-center gap-2"><Wallet className="w-4 h-4 text-rose-400" /> {nomeDi(g.uid)}</p>
                        <p className="text-sm font-black text-rose-400">{g.aperto > 0 ? `deve ${eur(g.aperto)}` : "nessun debito aperto"}</p>
                    </div>
                    <div className="divide-y divide-white/5">
                        {g.rows.map(r => (
                            <div key={r.id} className={cn("px-4 py-2.5 flex items-center gap-3 flex-wrap", r.stato === "saldato" && "opacity-50")}>
                                <div className="flex-1 min-w-[220px]">
                                    <p className="text-sm text-slate-100 font-semibold">{r.titolo} <TipoBadge r={r} /></p>
                                    <p className="text-[11px] text-slate-500">{meseLabel(r.competenza)}{r.note ? ` · ${r.note}` : ""} · inserito da {r.creato_da || "—"}</p>
                                </div>
                                <p className="text-sm font-black text-slate-100 font-mono">{eur(r.importo)}</p>
                                {r.tipo === "ricorrente" && r.stato === "aperto" && (
                                    <button onClick={() => ripetiMese(r)} title="Aggiungi la stessa voce sul mese corrente"
                                        className="p-1.5 rounded-lg text-slate-500 hover:text-violet-300 hover:bg-violet-500/10"><RotateCw className="w-4 h-4" /></button>
                                )}
                                <button onClick={() => cambiaStato(r)}
                                    className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold",
                                        r.stato === "aperto" ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10" : "border-white/15 text-slate-400 hover:bg-white/5")}>
                                    <CheckCircle2 className="w-3.5 h-3.5" /> {r.stato === "aperto" ? "Salda" : "Riapri"}
                                </button>
                                <button onClick={() => elimina(r)} title="Elimina la voce"
                                    className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Riquadro compatto nella SCHEDA UTENTE: stato debito del collaboratore. */
export function DebitiUtenteBox({ userId }: { userId: string }) {
    const [righe, setRighe] = useState<Movimento[] | null>(null);
    useEffect(() => {
        (async () => {
            const { data, error } = await supabase.from("user_movimenti").select("*")
                .eq("user_id", userId).eq("origine", "debito").order("competenza", { ascending: false }).limit(200);
            setRighe(error ? [] : (data ?? []) as Movimento[]);   // tabella assente pre-mig. 127: box vuoto
        })();
    }, [userId]);
    if (!righe) return null;
    const aperte = righe.filter(r => r.stato === "aperto");
    const tot = aperte.reduce((s, r) => s + Number(r.importo), 0);
    return (
        <div className="glass-card p-4 rounded-xl border-l-4 border-l-rose-500/70">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-bold text-white flex items-center gap-2"><Wallet className="w-4 h-4 text-rose-400" /> Debiti verso l&apos;azienda</p>
                <p className={cn("text-base font-black", tot > 0 ? "text-rose-400" : "text-emerald-400")}>{tot > 0 ? eur(tot) + " aperti" : "nessuno aperto"}</p>
            </div>
            {aperte.slice(0, 3).map(r => (
                <p key={r.id} className="text-[11px] text-slate-400 mt-1">• {r.titolo} <TipoBadge r={r} /> — {eur(r.importo)} ({meseLabel(r.competenza)})</p>
            ))}
            {aperte.length > 3 && <p className="text-[11px] text-slate-500 mt-1">…e altre {aperte.length - 3} voci</p>}
            <a href={`/amministrazione?sez=utenti&tab=debiti&du=${userId}`} className="inline-block mt-2 text-[11px] font-bold text-rose-300 hover:text-rose-200">Apri il registro completo →</a>
        </div>
    );
}
