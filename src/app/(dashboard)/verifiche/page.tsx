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
import { SelectPersona } from "@/components/SelectPersona";
import { effectiveAllowed } from "@/lib/nav";
import { useRolePermissions } from "@/lib/usePermissions";

type Allegato = { url: string; name: string };
type Voce = {
    id: string; tipo: "update" | "sospeso" | "task"; titolo: string;
    dettaglio: string | null; domanda: string | null; link: string | null;
    stato: "da_verificare" | "risposta_data" | "da_sistemare" | "segnalazione_delegato" | "verificata";
    risposta: string | null; sessione: string | null;
    creato_il: string; verificato_il: string | null; verificato_da: string | null;
    delegato_a: string | null; delegato_nome: string | null;
    segnalazione_delegato: string | null; segnalato_da: string | null;
    allegati?: Allegato[] | null;
};

// MOD-42: allegati (screenshot!) su task, proposte, segnalazioni e approvazioni
// — upload sul bucket contracts (path verifiche/), stesso giro delle comunicazioni
function AllegatiPicker({ value, onChange }: { value: Allegato[]; onChange: (v: Allegato[]) => void }) {
    const [caricando, setCaricando] = useState(false);
    const carica = async (files: FileList | null) => {
        if (!files?.length || caricando) return;
        setCaricando(true);
        try {
            for (const f of Array.from(files)) {
                const path = `verifiche/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${f.name.replace(/[^\w.\-]/g, "_")}`;
                const { error } = await supabase.storage.from("contracts").upload(path, f);
                if (error) continue;
                const { data: pu } = supabase.storage.from("contracts").getPublicUrl(path);
                onChange([...value, { url: pu.publicUrl, name: f.name }]);
            }
        } finally { setCaricando(false); }
    };
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <label className={`px-3 py-1.5 rounded-lg border border-white/15 text-slate-300 text-xs font-bold cursor-pointer hover:bg-white/5 ${caricando ? "opacity-50 pointer-events-none" : ""}`}>
                📎 {caricando ? "Carico…" : "Allega file"}
                <input type="file" multiple className="hidden" onChange={(e) => { carica(e.target.files); e.target.value = ""; }} />
            </label>
            {value.map((a) => (
                <span key={a.url} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/15 bg-white/[0.04] text-slate-200 text-xs">
                    📎 {a.name}
                    <button type="button" onClick={() => onChange(value.filter((x) => x.url !== a.url))} className="text-slate-500 hover:text-white text-[10px]">✕</button>
                </span>
            ))}
        </div>
    );
}

const fmtQuando = (s: string | null) => {
    if (!s) return "";
    const d = new Date(s);
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString("it-IT") + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
};

// MOD-39/40: form "nuova task / proponi modifica" — componente TOP-LEVEL con
// stato suo (mai annidato nel componente pagina: perderebbe il focus).
function FormNuova({ titolo, sotto, bottone, onInvia }: { titolo: string; sotto: string; bottone: string; onInvia: (tit: string, det: string, allegati: Allegato[]) => Promise<void> }) {
    const [aperto, setAperto] = useState(false);
    const [tit, setTit] = useState("");
    const [det, setDet] = useState("");
    const [alleg, setAlleg] = useState<Allegato[]>([]);
    const [inCorso, setInCorso] = useState(false);
    const invia = async () => {
        if (!tit.trim() || inCorso) return;
        setInCorso(true);
        await onInvia(tit.trim(), det.trim(), alleg);
        setInCorso(false);
        setTit(""); setDet(""); setAlleg([]); setAperto(false);
    };
    if (!aperto) return (
        <button onClick={() => setAperto(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold">
            ➕ {titolo}
        </button>
    );
    return (
        <div className="glass-panel p-4 space-y-2">
            <div className="text-sm font-bold text-white">➕ {titolo}</div>
            <p className="text-[11px] text-slate-500">{sotto}</p>
            <input value={tit} onChange={(e) => setTit(e.target.value)} placeholder="Titolo breve…" autoFocus
                className="glass-input w-full text-sm" />
            <textarea value={det} onChange={(e) => setDet(e.target.value)} rows={3}
                placeholder="Descrivi bene cosa serve (più dettagli dai, meglio viene): pagina interessata, comportamento atteso, esempi…"
                className="glass-input w-full text-sm !h-auto py-2 resize-y" />
            <AllegatiPicker value={alleg} onChange={setAlleg} />
            <div className="flex gap-2">
                <button onClick={invia} disabled={inCorso || !tit.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold disabled:opacity-40">
                    <Send className="w-4 h-4" /> {bottone}
                </button>
                <button onClick={() => setAperto(false)} disabled={inCorso}
                    className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/10 text-slate-300 text-sm font-bold">Annulla</button>
            </div>
        </div>
    );
}

// FIX 10/08 (Luca: "scrive al contrario"): la Card deve stare FUORI dal
// componente pagina — definita dentro, React la ricreava a ogni tasto e la
// textarea si smontava/rimontava perdendo il cursore (che tornava all'inizio).
function CardVoce({ v, children }: { v: Voce; children?: React.ReactNode }) {
    return (
        <div className="glass-panel p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-bold text-white">
                        {v.tipo === "task" && <span className="mr-1.5 text-[10px] font-black uppercase text-indigo-300 bg-indigo-500/10 border border-indigo-500/40 rounded-full px-2 py-0.5 align-middle">📥 task</span>}
                        {v.titolo}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">sessione {v.sessione || "—"} · {fmtQuando(v.creato_il)}{v.tipo === "task" && v.segnalato_da ? <span className="text-violet-300"> · proposta da {v.segnalato_da}</span> : null}</div>
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
            {Array.isArray(v.allegati) && v.allegati.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    {v.allegati.map((a) => (
                        <a key={a.url} href={a.url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-200 text-xs font-semibold hover:bg-sky-500/20">
                            📎 {a.name}
                        </a>
                    ))}
                </div>
            )}
            {children}
        </div>
    );
}

export default function VerifichePage() {
    const { user } = useAuth();
    const isAdmin = ["admin", "dev"].includes(user?.role || "");
    const [voci, setVoci] = useState<Voce[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [bozze, setBozze] = useState<Record<string, string>>({});
    const [bozzeAll, setBozzeAll] = useState<Record<string, Allegato[]>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [mostraChiuse, setMostraChiuse] = useState(false);
    const [segnalaId, setSegnalaId] = useState<string | null>(null);
    // rifiuto di una PROPOSTA con nota facoltativa (Luca 10/08): la nota resta
    // nello storico della voce, visibile anche a chi l'ha proposta
    const [rifiutoId, setRifiutoId] = useState<string | null>(null);
    const [noteRifiuto, setNoteRifiuto] = useState<Record<string, string>>({});
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
        setBozzeAll((p) => ({ ...p, [id]: [] }));
        setSegnalaId(null);
        carica();
        // il badge in header si aggiorna al volo (senza aspettare la navigazione)
        try { window.dispatchEvent(new Event("verifiche-cambiate")); } catch { /* no-op */ }
    };
    // allegati nuovi della voce + quelli già presenti (per segnala/approva)
    const conAllegati = (v: Voce) => {
        const nuovi = bozzeAll[v.id] || [];
        return nuovi.length ? { allegati: [...(v.allegati || []), ...nuovi] } : {};
    };
    const verifica = (v: Voce) => aggiorna(v.id, { stato: "verificata", verificato_il: new Date().toISOString(), verificato_da: user?.name || "admin" });
    const rispondi = (v: Voce) => { const r = (bozze[v.id] || "").trim(); if (r) aggiorna(v.id, { risposta: r, stato: "risposta_data" }); };
    // admin: "da sistemare" diretto a Claude
    const segnalaAdmin = (v: Voce) => { const r = (bozze[v.id] || "").trim(); if (r) aggiorna(v.id, { risposta: r, stato: "da_sistemare", ...conAllegati(v) }); };
    // delegato: la segnalazione TORNA all'admin, mai a Claude
    const segnalaDelegato = (v: Voce) => {
        const r = (bozze[v.id] || "").trim();
        if (r) aggiorna(v.id, { segnalazione_delegato: r, segnalato_da: user?.name || "delegato", stato: "segnalazione_delegato", ...conAllegati(v) });
    };
    const rifiuta = (v: Voce) => {
        const nota = (noteRifiuto[v.id] || "").trim();
        setRifiutoId(null);
        aggiorna(v.id, { stato: "verificata", verificato_il: new Date().toISOString(), verificato_da: user?.name || "admin", risposta: nota ? `Rifiutata: ${nota}` : "Rifiutata" });
    };
    // admin approva la segnalazione del delegato (eventualmente corretta) → Claude
    const inoltra = (v: Voce) => {
        const r = (bozze[v.id] ?? v.segnalazione_delegato ?? "").trim();
        if (r) aggiorna(v.id, { risposta: r, stato: "da_sistemare", ...conAllegati(v) });
    };
    const delega = (v: Voce, uid: string) => {
        const u = utenti.find((x) => x.id === uid);
        aggiorna(v.id, { delegato_a: uid || null, delegato_nome: u?.full_name || null });
    };
    // MOD-39: task dell'ADMIN → dritta in carico a Claude ('da_sistemare')
    const oggiSessione = new Date().toLocaleDateString("it-IT");
    const creaTaskAdmin = async (tit: string, det: string, alleg: Allegato[]) => {
        await supabase.from("dev_updates").insert({ tipo: "task", titolo: tit, dettaglio: det || null, stato: "da_sistemare", sessione: oggiSessione, allegati: alleg });
        carica();
    };
    // MOD-40: PROPOSTA del delegato → passa da Luca ('segnalazione_delegato')
    const proponiTask = async (tit: string, det: string, alleg: Allegato[]) => {
        await supabase.from("dev_updates").insert({
            tipo: "task", titolo: tit, dettaglio: null, stato: "segnalazione_delegato",
            segnalazione_delegato: det || tit, segnalato_da: user?.name || "collaboratore",
            delegato_a: user?.id || null, delegato_nome: user?.name || null, sessione: oggiSessione, allegati: alleg,
        });
        carica();
    };

    // il DELEGATO vede solo le voci sue; l'admin tutto
    const mie = useMemo(() => isAdmin ? voci : voci.filter((v) => v.delegato_a === user?.id), [voci, isAdmin, user?.id]);
    const sospesi = useMemo(() => mie.filter((v) => v.tipo === "sospeso" && v.stato === "da_verificare"), [mie]);
    const risposte = useMemo(() => mie.filter((v) => v.tipo === "sospeso" && v.stato === "risposta_data"), [mie]);
    const daVerificare = useMemo(() => mie.filter((v) => (v.tipo === "update" || v.tipo === "task") && v.stato === "da_verificare"), [mie]);
    // colonna SINISTRA = da verificare tue; colonna DESTRA (admin) = delegate
    const daVerificareMie = useMemo(() => isAdmin ? daVerificare.filter((v) => !v.delegato_a) : daVerificare, [daVerificare, isAdmin]);
    const delegateAperte = useMemo(() => isAdmin ? daVerificare.filter((v) => !!v.delegato_a) : [], [daVerificare, isAdmin]);
    const daApprovare = useMemo(() => mie.filter((v) => v.stato === "segnalazione_delegato"), [mie]);
    const daSistemare = useMemo(() => mie.filter((v) => v.stato === "da_sistemare"), [mie]);
    const chiuse = useMemo(() => mie.filter((v) => v.stato === "verificata"), [mie]);

    // MOD-43: l'accesso si CONCEDE dai permessi (/verifiche: grado senior o
    // singole persone) — chi ha deleghe ricevute entra comunque
    const { perms: permsPagina, loaded: permsPronti } = useRolePermissions(user?.role, user?.grade, user?.id);
    const abilitato = isAdmin || effectiveAllowed(user?.role, "/verifiche", ["admin", "dev"], permsPagina) || mie.length > 0;
    if (user && !loading && permsPronti && !abilitato) {
        return <div className="glass-panel p-10 text-center max-w-lg mx-auto mt-10 text-slate-400">Sezione non abilitata per il tuo utente.</div>;
    }

    return (
        <div className="space-y-6 max-w-[1500px]">
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
                {/* ── NUOVA TASK (MOD-39/40): l'admin la manda dritta a Claude;
                    il collaboratore la PROPONE e passa dall'approvazione admin ── */}
                {isAdmin ? (
                    <FormNuova titolo="Nuova task per Claude"
                        sotto="La scrivi qui in qualsiasi momento (anche da telefono): Claude la legge alla prossima sessione, la svolge e la sposta tra gli update 'da verificare' con la nota di cosa ha fatto."
                        bottone="Aggiungi la task" onInvia={creaTaskAdmin} />
                ) : (
                    <FormNuova titolo="Proponi una modifica"
                        sotto="La proposta arriva all'amministrazione: se la conferma, viene lavorata da Claude (resta firmata col tuo nome)."
                        bottone="Invia la proposta" onInvia={proponiTask} />
                )}

                {/* ── ADMIN: segnalazioni del DELEGATO da approvare ── */}
                {isAdmin && daApprovare.length > 0 && (
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold text-violet-300 uppercase tracking-widest">📨 Segnalazioni del delegato — decidi tu <span className="text-slate-500 font-normal normal-case">· {daApprovare.length}</span></h2>
                        {daApprovare.map((v) => (
                            <CardVoce key={v.id} v={v}>
                                <p className="text-[13px] text-violet-200 bg-violet-500/10 border border-violet-500/40 rounded-lg px-3 py-2">👤 <b>{v.segnalato_da || v.delegato_nome}</b> {v.tipo === "task" ? "propone" : "segnala"}: «{v.segnalazione_delegato}»</p>
                                <textarea value={bozze[v.id] ?? v.segnalazione_delegato ?? ""} onChange={(e) => setBozze((p) => ({ ...p, [v.id]: e.target.value }))}
                                    rows={2} className="glass-input w-full text-sm !h-auto py-2 resize-y"
                                    placeholder="Correggi o riscrivi il testo prima di inoltrarlo…" />
                                <AllegatiPicker value={bozzeAll[v.id] || []} onChange={(a) => setBozzeAll((p) => ({ ...p, [v.id]: a }))} />
                                <div className="flex gap-2 flex-wrap">
                                    <button onClick={() => inoltra(v)} disabled={busy === v.id}
                                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50 ${v.tipo === "task" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-orange-700 hover:bg-orange-600"}`}>
                                        <Send className="w-4 h-4" /> {v.tipo === "task" ? "✓ Conferma e invia a Claude" : "Inoltra a Claude (da sistemare)"}
                                    </button>
                                    {v.tipo === "task" ? (
                                        <button onClick={() => setRifiutoId(rifiutoId === v.id ? null : v.id)} disabled={busy === v.id}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold disabled:opacity-50">
                                            ✕ Rifiuta
                                        </button>
                                    ) : (
                                        <button onClick={() => verifica(v)} disabled={busy === v.id}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50">
                                            ✓ Chiudi come verificata
                                        </button>
                                    )}
                                </div>
                                {rifiutoId === v.id && (
                                    <div className="flex gap-2 items-start pt-1">
                                        <textarea value={noteRifiuto[v.id] || ""} onChange={(e) => setNoteRifiuto((p) => ({ ...p, [v.id]: e.target.value }))}
                                            placeholder="Nota per chi ha proposto (facoltativa): perché la rifiuti…" rows={2} autoFocus
                                            className="glass-input flex-1 text-sm !h-auto py-2 resize-y" />
                                        <button onClick={() => rifiuta(v)} disabled={busy === v.id}
                                            className="shrink-0 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold disabled:opacity-50">
                                            ✕ Conferma rifiuto
                                        </button>
                                    </div>
                                )}
                            </CardVoce>
                        ))}
                    </section>
                )}

                {/* ── SOSPESI (solo admin: servono le sue risposte) ── */}
                {isAdmin && (
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold text-amber-300 uppercase tracking-widest">❓ In sospeso — mi serve una tua risposta <span className="text-slate-500 font-normal normal-case">· {sospesi.length}</span></h2>
                        {sospesi.length === 0 && <p className="text-sm text-slate-600 px-1">Niente in sospeso 🎉</p>}
                        {sospesi.map((v) => (
                            <CardVoce key={v.id} v={v}>
                                <div className="flex gap-2 items-start">
                                    <textarea value={bozze[v.id] || ""} onChange={(e) => setBozze((p) => ({ ...p, [v.id]: e.target.value }))}
                                        placeholder="Scrivi qui la risposta…" rows={2}
                                        className="glass-input flex-1 text-sm !h-auto py-2 resize-y" />
                                    <button onClick={() => rispondi(v)} disabled={busy === v.id || !(bozze[v.id] || "").trim()}
                                        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold disabled:opacity-40">
                                        <Send className="w-4 h-4" /> Invia
                                    </button>
                                </div>
                            </CardVoce>
                        ))}
                        {risposte.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs text-slate-500 px-1">Risposte date (in attesa che le lavori Claude):</p>
                                {risposte.map((v) => (
                                    <CardVoce key={v.id} v={v}>
                                        <p className="text-[13px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">💬 {v.risposta}</p>
                                    </CardVoce>
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* ── UPDATE: colonna sinistra = da verificare, colonna destra
                    (admin) = DELEGATE in attesa del collaboratore (Luca 10/08:
                    "mettimi le delegate alla destra, c'è tantissimo spazio") ── */}
                {(() => {
                    // funzione di render (MAI componente annidato: perderebbe il
                    // focus della textarea a ogni tasto — lezione 'scrive al contrario')
                    const cardUpdate = (v: Voce) => (
                        <CardVoce key={v.id} v={v}>
                            <div className="flex gap-2 flex-wrap items-center">
                                <button onClick={() => verifica(v)} disabled={busy === v.id}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50">
                                    ✓ Verificata
                                </button>
                                <button onClick={() => setSegnalaId(segnalaId === v.id ? null : v.id)} disabled={busy === v.id}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-700 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50">
                                    ⚠️ {isAdmin ? "Da sistemare" : "Segnala"}
                                </button>
                                {/* DELEGA (solo admin): tendina standard CRM + badge/revoca */}
                                {isAdmin && (v.delegato_a ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-300 bg-violet-500/10 border border-violet-500/40 rounded-full px-3 py-1.5">
                                        <UserRound className="w-3.5 h-3.5" /> delegata a {v.delegato_nome}
                                        <button onClick={() => delega(v, "")} title="Revoca la delega" className="text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                                    </span>
                                ) : (
                                    <span className="w-56">
                                        <SelectPersona value="" placeholder="👤 Delega a…"
                                            opzioni={utenti.map((u) => u.full_name)}
                                            onChange={(nome: string) => { const u = utenti.find((x) => x.full_name === nome); if (u) delega(v, u.id); }}
                                            className="glass-input w-full !h-9 text-xs" />
                                    </span>
                                ))}
                            </div>
                            {segnalaId === v.id && (
                                <div className="space-y-2 pt-1">
                                    <div className="flex gap-2 items-start">
                                        <textarea value={bozze[v.id] || ""} onChange={(e) => setBozze((p) => ({ ...p, [v.id]: e.target.value }))}
                                            placeholder={isAdmin ? "Scrivi cosa non va o cosa manca: Claude lo sistema alla prossima sessione…" : "Scrivi cosa non va: la segnalazione arriva all'amministrazione…"} rows={2} autoFocus
                                            className="glass-input flex-1 text-sm !h-auto py-2 resize-y" />
                                        <button onClick={() => (isAdmin ? segnalaAdmin(v) : segnalaDelegato(v))} disabled={busy === v.id || !(bozze[v.id] || "").trim()}
                                            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-700 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-40">
                                            <Send className="w-4 h-4" /> {isAdmin ? "Segnala" : "Invia all'amministrazione"}
                                        </button>
                                    </div>
                                    <AllegatiPicker value={bozzeAll[v.id] || []} onChange={(a) => setBozzeAll((p) => ({ ...p, [v.id]: a }))} />
                                </div>
                            )}
                        </CardVoce>
                    );
                    return (
                        <div className={isAdmin ? "grid grid-cols-1 xl:grid-cols-2 gap-6 items-start" : ""}>
                            <section className="space-y-3">
                                <h2 className="text-sm font-bold text-sky-300 uppercase tracking-widest">🕐 {isAdmin ? "Update da verificare" : "Verifiche delegate a te"} <span className="text-slate-500 font-normal normal-case">· {daVerificareMie.length}</span></h2>
                                {daVerificareMie.length === 0 && <p className="text-sm text-slate-600 px-1">Tutto verificato ✓</p>}
                                {daVerificareMie.map(cardUpdate)}
                                {/* delegato: le sue segnalazioni in attesa dell'admin */}
                                {!isAdmin && daApprovare.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-slate-500 px-1">Segnalazioni inviate (in attesa dell&apos;amministrazione):</p>
                                        {daApprovare.map((v) => (
                                            <CardVoce key={v.id} v={v}>
                                                <p className="text-[13px] text-violet-200 bg-violet-500/10 border border-violet-500/40 rounded-lg px-3 py-2">📨 «{v.segnalazione_delegato}»</p>
                                            </CardVoce>
                                        ))}
                                    </div>
                                )}
                            </section>
                            {isAdmin && (
                                <section className="space-y-3">
                                    <h2 className="text-sm font-bold text-violet-300 uppercase tracking-widest">👤 Delegate — in attesa del collaboratore <span className="text-slate-500 font-normal normal-case">· {delegateAperte.length}</span></h2>
                                    {delegateAperte.length === 0 && <p className="text-sm text-slate-600 px-1">Nessuna verifica delegata al momento: usa &quot;👤 Delega a…&quot; su una card a sinistra.</p>}
                                    {delegateAperte.map(cardUpdate)}
                                </section>
                            )}
                        </div>
                    );
                })()}

                {/* ── segnalate DA SISTEMARE (in carico a Claude) ── */}
                {isAdmin && daSistemare.length > 0 && (
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold text-orange-300 uppercase tracking-widest">🛠️ Da sistemare — in carico a Claude <span className="text-slate-500 font-normal normal-case">· {daSistemare.length}</span></h2>
                        {daSistemare.map((v) => (
                            <CardVoce key={v.id} v={v}>
                                {v.risposta && v.risposta !== v.dettaglio && <p className="text-[13px] text-orange-200 bg-orange-500/10 border border-orange-500/40 rounded-lg px-3 py-2">⚠️ {v.risposta}</p>}
                                <p className="text-[11px] text-slate-500">Claude la lavora alla prossima sessione e la rimette qui &quot;da verificare&quot; con la nota di cosa ha corretto.</p>
                            </CardVoce>
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
