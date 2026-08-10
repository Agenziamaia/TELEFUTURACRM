"use client";

// SEZIONE VERIFICHE (MOD-36, Luca 10/08) — solo admin, "momentanea".
// Il registro degli update di sviluppo e delle questioni in sospeso, cosi' il
// terminal resta pulito per lavorare e il recap vive qui:
//   · UPDATE fatti da Claude → Luca li prova e li marca ✓ Verificata
//   · SOSPESI (serve una risposta) → Luca scrive la risposta nel box; Claude
//     la rilegge a inizio sessione e chiude la voce quando la lavora.
// Claude aggiorna la tabella dev_updates A OGNI SESSIONE (regola in memoria).
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, ExternalLink, Loader2, Send } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";

type Voce = {
    id: string; tipo: "update" | "sospeso"; titolo: string;
    dettaglio: string | null; domanda: string | null; link: string | null;
    stato: "da_verificare" | "risposta_data" | "da_sistemare" | "verificata";
    risposta: string | null; sessione: string | null;
    creato_il: string; verificato_il: string | null; verificato_da: string | null;
};

const fmtQuando = (s: string | null) => {
    if (!s) return "";
    const d = new Date(s);
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString("it-IT") + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
};

export default function VerifichePage() {
    const { user } = useAuth();
    const isAdmin = ["admin", "dev"].includes(user?.role || "");
    const [voci, setVoci] = useState<Voce[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [bozzeRisposta, setBozzeRisposta] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [mostraChiuse, setMostraChiuse] = useState(false);

    const carica = useCallback(async () => {
        const { data, error } = await supabase.from("dev_updates").select("*").order("creato_il", { ascending: false });
        if (error) { setErr(error.message); setLoading(false); return; }
        setErr(null);
        setVoci((data ?? []) as Voce[]);
        setLoading(false);
    }, []);
    useEffect(() => { carica(); }, [carica]);

    const verifica = async (v: Voce) => {
        if (busy) return;
        setBusy(v.id);
        await supabase.from("dev_updates").update({ stato: "verificata", verificato_il: new Date().toISOString(), verificato_da: user?.name || "admin" }).eq("id", v.id);
        setBusy(null);
        carica();
    };
    const rispondi = async (v: Voce) => {
        const r = (bozzeRisposta[v.id] || "").trim();
        if (!r || busy) return;
        setBusy(v.id);
        await supabase.from("dev_updates").update({ risposta: r, stato: "risposta_data" }).eq("id", v.id);
        setBusy(null);
        setBozzeRisposta((p) => ({ ...p, [v.id]: "" }));
        carica();
    };
    // MOD-36b: "⚠️ Da sistemare" — l'admin scrive cosa non va; Claude la
    // rilegge a inizio sessione, sistema e riporta la voce a 'da_verificare'
    const [segnalaId, setSegnalaId] = useState<string | null>(null);
    const segnala = async (v: Voce) => {
        const r = (bozzeRisposta[v.id] || "").trim();
        if (!r || busy) return;
        setBusy(v.id);
        await supabase.from("dev_updates").update({ risposta: r, stato: "da_sistemare" }).eq("id", v.id);
        setBusy(null);
        setBozzeRisposta((p) => ({ ...p, [v.id]: "" }));
        setSegnalaId(null);
        carica();
    };

    const sospesi = useMemo(() => voci.filter((v) => v.tipo === "sospeso" && v.stato === "da_verificare"), [voci]);
    const risposte = useMemo(() => voci.filter((v) => v.tipo === "sospeso" && v.stato === "risposta_data"), [voci]);
    const daVerificare = useMemo(() => voci.filter((v) => v.tipo === "update" && v.stato === "da_verificare"), [voci]);
    const daSistemare = useMemo(() => voci.filter((v) => v.stato === "da_sistemare"), [voci]);
    const chiuse = useMemo(() => voci.filter((v) => v.stato === "verificata"), [voci]);

    if (user && !isAdmin) {
        return <div className="glass-panel p-10 text-center max-w-lg mx-auto mt-10 text-slate-400">Sezione riservata all&apos;admin.</div>;
    }

    const Card = ({ v, children }: { v: Voce; children?: React.ReactNode }) => (
        <div className="glass-panel p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-bold text-white">{v.titolo}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">sessione {v.sessione || "—"} · {fmtQuando(v.creato_il)}</div>
                </div>
                {v.link && (
                    <a href={v.link} target={v.link.startsWith("http") ? "_blank" : undefined} rel="noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-sky-300 hover:text-sky-200 px-2.5 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30">
                        Apri <ExternalLink className="w-3 h-3" />
                    </a>
                )}
            </div>
            {v.dettaglio && <p className="text-[13px] text-slate-300 leading-relaxed">{v.dettaglio}</p>}
            {v.domanda && <p className="text-[13px] text-amber-200/90 leading-relaxed bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">❓ {v.domanda}</p>}
            {children}
        </div>
    );

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                    <ClipboardCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-white">Verifiche</h1>
                    <p className="text-sm text-slate-400">Gli update di sviluppo da esitare e le questioni in sospeso. Marca <b className="text-emerald-400">✓ Verificata</b> quando hai controllato; per i sospesi scrivi la risposta: la leggo alla sessione dopo.</p>
                </div>
            </div>

            {err && <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{err}</div>}
            {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : (<>
                {/* ── SOSPESI: serve una risposta ── */}
                <section className="space-y-3">
                    <h2 className="text-sm font-bold text-amber-300 uppercase tracking-widest">❓ In sospeso — mi serve una tua risposta <span className="text-slate-500 font-normal normal-case">· {sospesi.length}</span></h2>
                    {sospesi.length === 0 && <p className="text-sm text-slate-600 px-1">Niente in sospeso 🎉</p>}
                    {sospesi.map((v) => (
                        <Card key={v.id} v={v}>
                            <div className="flex gap-2 items-start">
                                <textarea value={bozzeRisposta[v.id] || ""} onChange={(e) => setBozzeRisposta((p) => ({ ...p, [v.id]: e.target.value }))}
                                    placeholder="Scrivi qui la risposta…" rows={2}
                                    className="glass-input flex-1 text-sm !h-auto py-2 resize-y" />
                                <button onClick={() => rispondi(v)} disabled={busy === v.id || !(bozzeRisposta[v.id] || "").trim()}
                                    className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold disabled:opacity-40">
                                    <Send className="w-4 h-4" /> Invia
                                </button>
                            </div>
                        </Card>
                    ))}
                    {risposte.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs text-slate-500 px-1">Risposte date (in attesa che le lavori Claude):</p>
                            {risposte.map((v) => (
                                <Card key={v.id} v={v}>
                                    <p className="text-[13px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">💬 {v.risposta}</p>
                                </Card>
                            ))}
                        </div>
                    )}
                </section>

                {/* ── UPDATE da verificare ── */}
                <section className="space-y-3">
                    <h2 className="text-sm font-bold text-sky-300 uppercase tracking-widest">🕐 Update da verificare <span className="text-slate-500 font-normal normal-case">· {daVerificare.length}</span></h2>
                    {daVerificare.length === 0 && <p className="text-sm text-slate-600 px-1">Tutto verificato ✓</p>}
                    {daVerificare.map((v) => (
                        <Card key={v.id} v={v}>
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => verifica(v)} disabled={busy === v.id}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50">
                                    ✓ Verificata
                                </button>
                                <button onClick={() => setSegnalaId(segnalaId === v.id ? null : v.id)} disabled={busy === v.id}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-700 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50">
                                    ⚠️ Da sistemare
                                </button>
                            </div>
                            {segnalaId === v.id && (
                                <div className="flex gap-2 items-start pt-1">
                                    <textarea value={bozzeRisposta[v.id] || ""} onChange={(e) => setBozzeRisposta((p) => ({ ...p, [v.id]: e.target.value }))}
                                        placeholder="Scrivi cosa non va o cosa manca: Claude lo sistema alla prossima sessione…" rows={2} autoFocus
                                        className="glass-input flex-1 text-sm !h-auto py-2 resize-y" />
                                    <button onClick={() => segnala(v)} disabled={busy === v.id || !(bozzeRisposta[v.id] || "").trim()}
                                        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-700 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-40">
                                        <Send className="w-4 h-4" /> Segnala
                                    </button>
                                </div>
                            )}
                        </Card>
                    ))}
                </section>

                {/* ── segnalate DA SISTEMARE (in carico a Claude) ── */}
                {daSistemare.length > 0 && (
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold text-orange-300 uppercase tracking-widest">🛠️ Da sistemare — in carico a Claude <span className="text-slate-500 font-normal normal-case">· {daSistemare.length}</span></h2>
                        {daSistemare.map((v) => (
                            <Card key={v.id} v={v}>
                                <p className="text-[13px] text-orange-200 bg-orange-500/10 border border-orange-500/40 rounded-lg px-3 py-2">⚠️ {v.risposta}</p>
                                <p className="text-[11px] text-slate-500">Claude la lavora alla prossima sessione e la rimette qui &quot;da verificare&quot; con la nota di cosa ha corretto.</p>
                            </Card>
                        ))}
                    </section>
                )}

                {/* ── storico chiuse ── */}
                <section className="space-y-3">
                    <button onClick={() => setMostraChiuse((x) => !x)} className="text-sm font-bold text-slate-500 uppercase tracking-widest hover:text-slate-300">
                        ✅ Verificate e chiuse · {chiuse.length} {mostraChiuse ? "▾" : "▸"}
                    </button>
                    {mostraChiuse && chiuse.map((v) => (
                        <div key={v.id} className="glass-panel p-3 opacity-70">
                            <div className="text-sm text-slate-300 font-semibold">{v.titolo}</div>
                            <div className="text-[11px] text-slate-500">verificata {fmtQuando(v.verificato_il)}{v.verificato_da ? ` da ${v.verificato_da}` : ""}{v.risposta ? ` · risposta: ${v.risposta}` : ""}</div>
                        </div>
                    ))}
                </section>
            </>)}
        </div>
    );
}
