"use client";

// SEZIONE VERIFICHE (MOD-36, Luca 10/08) — il registro degli update di
// sviluppo e delle questioni in sospeso, cosi' il terminal resta pulito:
//   · UPDATE fatti da Claude → l'admin li prova e li marca ✓ Verificata,
//     oppure ⚠️ Da sistemare (scrive cosa non va → Claude la lavora)
//   · SOSPESI (serve una risposta) → l'admin risponde nel box
//   · DELEGA (MOD-38): l'admin puo' delegare singole verifiche a un utente
//     (es. Francesco Latina). Il delegato vede SOLO le sue: puo' verificarle
//     o SEGNALARE — la segnalazione NON va a Claude, torna all'ADMIN che la
//     corregge/approva ("Inoltra a Claude") o la chiude come verificata.
// Claude aggiorna dev_updates A OGNI SESSIONE e rilegge stati/risposte.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, ExternalLink, Loader2, Send, UserRound, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";

type Voce = {
    id: string; tipo: "update" | "sospeso"; titolo: string;
    dettaglio: string | null; domanda: string | null; link: string | null;
    stato: "da_verificare" | "risposta_data" | "da_sistemare" | "segnalazione_delegato" | "verificata";
    risposta: string | null; sessione: string | null;
    creato_il: string; verificato_il: string | null; verificato_da: string | null;
    delegato_a: string | null; delegato_nome: string | null;
    segnalazione_delegato: string | null; segnalato_da: string | null;
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
    const [bozze, setBozze] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [mostraChiuse, setMostraChiuse] = useState(false);
    const [segnalaId, setSegnalaId] = useState<string | null>(null);
    // utenti attivi per la tendina di delega (solo admin)
    const [utenti, setUtenti] = useState<{ id: string; full_name: string }[]>([]);

    const carica = useCallback(async () => {
        const { data, error } = await supabase.from("dev_updates").select("*").order("creato_il", { ascending: false });
        if (error) { setErr(error.message); setLoading(false); return; }
        setErr(null);
        setVoci((data ?? []) as Voce[]);
        setLoading(false);
    }, []);
    useEffect(() => { carica(); }, [carica]);
    useEffect(() => {
        if (!isAdmin) return;
        let vivo = true;
        supabase.from("app_users").select("id, full_name").or("status.is.null,status.neq.licenziato").order("full_name")
            .then(({ data }) => { if (vivo) setUtenti((data ?? []) as { id: string; full_name: string }[]); });
        return () => { vivo = false; };
    }, [isAdmin]);

    const aggiorna = async (id: string, payload: Record<string, unknown>) => {
        if (busy) return;
        setBusy(id);
        await supabase.from("dev_updates").update(payload).eq("id", id);
        setBusy(null);
        setBozze((p) => ({ ...p, [id]: "" }));
        setSegnalaId(null);
        carica();
    };
    const verifica = (v: Voce) => aggiorna(v.id, { stato: "verificata", verificato_il: new Date().toISOString(), verificato_da: user?.name || "admin" });
    const rispondi = (v: Voce) => { const r = (bozze[v.id] || "").trim(); if (r) aggiorna(v.id, { risposta: r, stato: "risposta_data" }); };
    // admin: "da sistemare" diretto a Claude
    const segnalaAdmin = (v: Voce) => { const r = (bozze[v.id] || "").trim(); if (r) aggiorna(v.id, { risposta: r, stato: "da_sistemare" }); };
    // delegato: la segnalazione TORNA all'admin, mai a Claude
    const segnalaDelegato = (v: Voce) => {
        const r = (bozze[v.id] || "").trim();
        if (r) aggiorna(v.id, { segnalazione_delegato: r, segnalato_da: user?.name || "delegato", stato: "segnalazione_delegato" });
    };
    // admin approva la segnalazione del delegato (eventualmente corretta) → Claude
    const inoltra = (v: Voce) => {
        const r = (bozze[v.id] ?? v.segnalazione_delegato ?? "").trim();
        if (r) aggiorna(v.id, { risposta: r, stato: "da_sistemare" });
    };
    const delega = (v: Voce, uid: string) => {
        const u = utenti.find((x) => x.id === uid);
        aggiorna(v.id, { delegato_a: uid || null, delegato_nome: u?.full_name || null });
    };

    // il DELEGATO vede solo le voci sue; l'admin tutto
    const mie = useMemo(() => isAdmin ? voci : voci.filter((v) => v.delegato_a === user?.id), [voci, isAdmin, user?.id]);
    const sospesi = useMemo(() => mie.filter((v) => v.tipo === "sospeso" && v.stato === "da_verificare"), [mie]);
    const risposte = useMemo(() => mie.filter((v) => v.tipo === "sospeso" && v.stato === "risposta_data"), [mie]);
    const daVerificare = useMemo(() => mie.filter((v) => v.tipo === "update" && v.stato === "da_verificare"), [mie]);
    const daApprovare = useMemo(() => mie.filter((v) => v.stato === "segnalazione_delegato"), [mie]);
    const daSistemare = useMemo(() => mie.filter((v) => v.stato === "da_sistemare"), [mie]);
    const chiuse = useMemo(() => mie.filter((v) => v.stato === "verificata"), [mie]);

    if (user && !isAdmin && !loading && mie.length === 0) {
        return <div className="glass-panel p-10 text-center max-w-lg mx-auto mt-10 text-slate-400">Nessuna verifica ti è stata delegata.</div>;
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
                    <p className="text-sm text-slate-400">
                        {isAdmin
                            ? <>Gli update da esitare e le questioni in sospeso. <b className="text-emerald-400">✓ Verificata</b> = ok, <b className="text-orange-300">⚠️ Da sistemare</b> = scrivi cosa non va e lo lavoro. Puoi delegare una verifica a un collaboratore: la sua segnalazione torna a te per l&apos;approvazione.</>
                            : <>Le verifiche che ti sono state delegate: prova la funzione e marca <b className="text-emerald-400">✓ Verificata</b>, oppure <b className="text-orange-300">⚠️ Segnala</b> cosa non va — la segnalazione va all&apos;amministrazione.</>}
                    </p>
                </div>
            </div>

            {err && <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{err}</div>}
            {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : (<>
                {/* ── ADMIN: segnalazioni del DELEGATO da approvare ── */}
                {isAdmin && daApprovare.length > 0 && (
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold text-violet-300 uppercase tracking-widest">📨 Segnalazioni del delegato — decidi tu <span className="text-slate-500 font-normal normal-case">· {daApprovare.length}</span></h2>
                        {daApprovare.map((v) => (
                            <Card key={v.id} v={v}>
                                <p className="text-[13px] text-violet-200 bg-violet-500/10 border border-violet-500/40 rounded-lg px-3 py-2">👤 <b>{v.segnalato_da || v.delegato_nome}</b> segnala: «{v.segnalazione_delegato}»</p>
                                <textarea value={bozze[v.id] ?? v.segnalazione_delegato ?? ""} onChange={(e) => setBozze((p) => ({ ...p, [v.id]: e.target.value }))}
                                    rows={2} className="glass-input w-full text-sm !h-auto py-2 resize-y"
                                    placeholder="Correggi o riscrivi la segnalazione prima di inoltrarla…" />
                                <div className="flex gap-2 flex-wrap">
                                    <button onClick={() => inoltra(v)} disabled={busy === v.id}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-700 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50">
                                        <Send className="w-4 h-4" /> Inoltra a Claude (da sistemare)
                                    </button>
                                    <button onClick={() => verifica(v)} disabled={busy === v.id}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50">
                                        ✓ Chiudi come verificata
                                    </button>
                                </div>
                            </Card>
                        ))}
                    </section>
                )}

                {/* ── SOSPESI (solo admin: servono le sue risposte) ── */}
                {isAdmin && (
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold text-amber-300 uppercase tracking-widest">❓ In sospeso — mi serve una tua risposta <span className="text-slate-500 font-normal normal-case">· {sospesi.length}</span></h2>
                        {sospesi.length === 0 && <p className="text-sm text-slate-600 px-1">Niente in sospeso 🎉</p>}
                        {sospesi.map((v) => (
                            <Card key={v.id} v={v}>
                                <div className="flex gap-2 items-start">
                                    <textarea value={bozze[v.id] || ""} onChange={(e) => setBozze((p) => ({ ...p, [v.id]: e.target.value }))}
                                        placeholder="Scrivi qui la risposta…" rows={2}
                                        className="glass-input flex-1 text-sm !h-auto py-2 resize-y" />
                                    <button onClick={() => rispondi(v)} disabled={busy === v.id || !(bozze[v.id] || "").trim()}
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
                )}

                {/* ── UPDATE da verificare ── */}
                <section className="space-y-3">
                    <h2 className="text-sm font-bold text-sky-300 uppercase tracking-widest">🕐 {isAdmin ? "Update da verificare" : "Verifiche delegate a te"} <span className="text-slate-500 font-normal normal-case">· {daVerificare.length}</span></h2>
                    {daVerificare.length === 0 && <p className="text-sm text-slate-600 px-1">Tutto verificato ✓</p>}
                    {daVerificare.map((v) => (
                        <Card key={v.id} v={v}>
                            <div className="flex gap-2 flex-wrap items-center">
                                <button onClick={() => verifica(v)} disabled={busy === v.id}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50">
                                    ✓ Verificata
                                </button>
                                <button onClick={() => setSegnalaId(segnalaId === v.id ? null : v.id)} disabled={busy === v.id}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-700 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50">
                                    ⚠️ {isAdmin ? "Da sistemare" : "Segnala"}
                                </button>
                                {/* DELEGA (solo admin): tendina utente + badge/revoca */}
                                {isAdmin && (v.delegato_a ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-300 bg-violet-500/10 border border-violet-500/40 rounded-full px-3 py-1.5">
                                        <UserRound className="w-3.5 h-3.5" /> delegata a {v.delegato_nome}
                                        <button onClick={() => delega(v, "")} title="Revoca la delega" className="text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                                    </span>
                                ) : (
                                    <select value="" onChange={(e) => { if (e.target.value) delega(v, e.target.value); }}
                                        className="glass-input !h-9 text-xs w-auto pr-7" title="Delega questa verifica a un collaboratore">
                                        <option value="">👤 Delega a…</option>
                                        {utenti.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                                    </select>
                                ))}
                            </div>
                            {segnalaId === v.id && (
                                <div className="flex gap-2 items-start pt-1">
                                    <textarea value={bozze[v.id] || ""} onChange={(e) => setBozze((p) => ({ ...p, [v.id]: e.target.value }))}
                                        placeholder={isAdmin ? "Scrivi cosa non va o cosa manca: Claude lo sistema alla prossima sessione…" : "Scrivi cosa non va: la segnalazione arriva all'amministrazione…"} rows={2} autoFocus
                                        className="glass-input flex-1 text-sm !h-auto py-2 resize-y" />
                                    <button onClick={() => (isAdmin ? segnalaAdmin(v) : segnalaDelegato(v))} disabled={busy === v.id || !(bozze[v.id] || "").trim()}
                                        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-700 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-40">
                                        <Send className="w-4 h-4" /> {isAdmin ? "Segnala" : "Invia all'amministrazione"}
                                    </button>
                                </div>
                            )}
                        </Card>
                    ))}
                    {/* delegato: le sue segnalazioni in attesa dell'admin */}
                    {!isAdmin && daApprovare.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs text-slate-500 px-1">Segnalazioni inviate (in attesa dell&apos;amministrazione):</p>
                            {daApprovare.map((v) => (
                                <Card key={v.id} v={v}>
                                    <p className="text-[13px] text-violet-200 bg-violet-500/10 border border-violet-500/40 rounded-lg px-3 py-2">📨 «{v.segnalazione_delegato}»</p>
                                </Card>
                            ))}
                        </div>
                    )}
                </section>

                {/* ── segnalate DA SISTEMARE (in carico a Claude) ── */}
                {isAdmin && daSistemare.length > 0 && (
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
                            <div className="text-[11px] text-slate-500">verificata {fmtQuando(v.verificato_il)}{v.verificato_da ? ` da ${v.verificato_da}` : ""}{v.risposta ? ` · nota: ${v.risposta}` : ""}</div>
                        </div>
                    ))}
                </section>
            </>)}
        </div>
    );
}
