"use client";

/**
 * RUOLI v2 (Amministrazione → Utenti → Ruoli) — interattiva e su database.
 *
 * - CREA un ruolo nuovo (etichetta → id automatico, area, gradi) → role_defs;
 * - MODIFICA qualsiasi ruolo (etichetta, contesto pv/cc/ob/sede, gradi): sui
 *   ruoli di sistema salva un OVERRIDE ripristinabile, sui custom la riga;
 * - i GRADI sono FILTRI: click sul grado → solo le persone con quel grado;
 * - ELIMINA: solo i ruoli personalizzati e solo senza persone assegnate
 *   (i ruoli di sistema portano permessi/costi/gating: non si eliminano).
 *
 * Ogni scrittura passa da role_defs (mig. 087) con RISCONTRO (rilettura dal
 * DB dopo il salvataggio): quello che vedi è sempre lo stato reale.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AREAS, type Area, type Grade } from "@/lib/roles";
import { useRoles, type RoleMerged } from "@/lib/useRoles";
import { useAuth } from "@/context/AuthContext";
import { notify, dbError } from "./toast";

interface Persona { id: string; full_name: string; role: string; grade: string | null; primary_store: string | null; active: boolean }

const AREA_COLORS: Record<string, string> = { pv: "var(--tf-6366f1)", cc: "var(--tf-0ea5e9)", ob: "var(--tf-f59e0b)", sede: "var(--tf-a855f7)" };
const slug = (s: string) => s.trim().toLowerCase()
    .replace(/[àáâä]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i").replace(/[òóôö]/g, "o").replace(/[ùúûü]/g, "u")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export function RuoliView() {
    const { user } = useAuth();
    const { roles, reload, loaded } = useRoles();
    const [persone, setPersone] = useState<Persona[]>([]);
    const [aperto, setAperto] = useState<string | null>(null);
    const [soloAttivi, setSoloAttivi] = useState(true);
    const [gradoFiltro, setGradoFiltro] = useState<string | null>(null);   // "ruolo|grado"
    const [areaFiltro, setAreaFiltro] = useState<Area | "">("");
    const [edit, setEdit] = useState<{ id: string; label: string; area: Area; grades: Grade[]; isCustom: boolean; nuovo: boolean } | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");

    const loadPersone = () => {
        supabase.from("app_users").select("id,full_name,role,grade,primary_store,active").order("full_name")
            .then(({ data, error }) => { if (error) dbError("utenti", error); else setPersone((data ?? []) as Persona[]); });
    };
    useEffect(loadPersone, []);

    const perRuolo = useMemo(() => {
        const m = new Map<string, Persona[]>();
        persone.filter((p) => !soloAttivi || p.active).forEach((p) => {
            (m.get(p.role) ?? m.set(p.role, []).get(p.role)!).push(p);
        });
        return m;
    }, [persone, soloAttivi]);

    const salva = async () => {
        if (!edit || busy) return;
        setMsg("");
        const label = edit.label.trim();
        if (!label) { setMsg("L'etichetta del ruolo è obbligatoria."); return; }
        const id = edit.nuovo ? slug(label) : edit.id;
        if (!id) { setMsg("Etichetta non valida per generare l'identificativo."); return; }
        if (edit.nuovo && roles.some((r) => r.id === id)) { setMsg(`Esiste già un ruolo con identificativo "${id}": cambia etichetta.`); return; }
        const grades = edit.grades.map((g) => ({ id: g.id || slug(g.label), label: g.label.trim() })).filter((g) => g.label && g.id);
        setBusy(true);
        const { error } = await supabase.from("role_defs").upsert({
            id, label, area: edit.area, grades, is_custom: edit.isCustom,
            updated_by: user?.name || "—", updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
        if (error) { setBusy(false); setMsg("⚠️ Errore: " + error.message); return; }
        // RISCONTRO: rileggo dal DB — mai fidarsi del solo esito della chiamata
        const { data: check } = await supabase.from("role_defs").select("id,label,area").eq("id", id).maybeSingle();
        setBusy(false);
        if (!check || check.label !== label || check.area !== edit.area) { setMsg("⚠️ Il salvataggio non risulta a database: riprova."); return; }
        notify(`Ruolo "${label}" salvato a database ✓`, "ok");
        setEdit(null);
        reload();
    };

    const ripristinaOverride = async (r: RoleMerged) => {
        if (busy) return;
        setBusy(true);
        const { error } = await supabase.from("role_defs").delete().eq("id", r.id);
        setBusy(false);
        if (error) { dbError("ripristino", error); return; }
        notify(`"${r.label}" tornato alla definizione di sistema`, "ok");
        reload();
    };

    const elimina = async (r: RoleMerged) => {
        if (busy) return;
        const assegnate = persone.filter((p) => p.role === r.id);   // anche non attive
        if (assegnate.length > 0) {
            notify(`"${r.label}" ha ${assegnate.length} person${assegnate.length === 1 ? "a" : "e"} assegnate: spostale prima di eliminarlo`, "error");
            return;
        }
        setBusy(true);
        await supabase.from("role_defs").delete().eq("id", r.id);
        const { data: still } = await supabase.from("role_defs").select("id").eq("id", r.id).maybeSingle();
        setBusy(false);
        if (still) { notify("Eliminazione non riuscita: la riga esiste ancora", "error"); return; }
        notify(`Ruolo "${r.label}" eliminato`, "ok");
        if (aperto === r.id) setAperto(null);
        reload();
    };

    const gradeLabelOf = (r: RoleMerged, gradeId: string | null) =>
        gradeId ? (r.grades.find((g) => g.id === gradeId)?.label || gradeId) : null;

    const visibili = roles.filter((r) => !areaFiltro || r.area === areaFiltro);

    return (
        <div className="space-y-4 max-w-5xl">
            <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => { setEdit({ id: "", label: "", area: "sede", grades: [], isCustom: true, nuovo: true }); setMsg(""); }}
                    className="text-sm px-4 py-2 rounded-lg font-bold bg-indigo-500 hover:bg-indigo-600 text-white transition-colors">
                    ➕ Nuovo ruolo
                </button>
                {/* filtro per contesto (pv / call center / outbound / sede) */}
                <div className="flex gap-1.5 flex-wrap">
                    {AREAS.map((a) => (
                        <button key={a.id} onClick={() => setAreaFiltro(areaFiltro === a.id ? "" : a.id)}
                            className="text-xs px-3 py-1.5 rounded-lg border font-bold transition-colors"
                            style={areaFiltro === a.id
                                ? { color: AREA_COLORS[a.id], borderColor: AREA_COLORS[a.id], background: AREA_COLORS[a.id] + "22" }
                                : { color: "var(--tf-94a3b8)", borderColor: "var(--tf-w100)" }}>
                            {a.label}{areaFiltro === a.id && " ✓"}
                        </button>
                    ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none ml-auto">
                    <input type="checkbox" checked={soloAttivi} onChange={(e) => setSoloAttivi(e.target.checked)} className="w-4 h-4 accent-indigo-500" />
                    Solo persone attive
                </label>
            </div>
            {gradoFiltro && (
                <div className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
                    Filtro grado attivo: vedi solo le persone con quel grado.
                    <button onClick={() => setGradoFiltro(null)} className="ml-auto font-bold hover:text-white">✕ Togli filtro</button>
                </div>
            )}

            {!loaded ? <div className="p-8 text-center text-slate-500">Caricamento…</div> : (
                /* DIVISORI per contesto (come la Lista utenti): i ruoli raggruppati
                   sotto l'intestazione della loro area, nell'ordine ufficiale. */
                <div className="space-y-6">
                    {AREAS.filter((a) => visibili.some((r) => r.area === a.id)).map((a) => (
                        <div key={a.id} className="space-y-3">
                            <div className="flex items-center gap-2 pb-1.5 border-b border-white/8">
                                <span className="w-2 h-2 rounded-full" style={{ background: AREA_COLORS[a.id] }} />
                                <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: AREA_COLORS[a.id] }}>
                                    {a.label} · {visibili.filter((r) => r.area === a.id).length}
                                </h3>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {visibili.filter((r) => r.area === a.id).map((r) => {
                        const gente = perRuolo.get(r.id) ?? [];
                        const open = aperto === r.id;
                        const col = AREA_COLORS[r.area] || "var(--tf-64748b)";
                        const areaLbl = AREAS.find((a) => a.id === r.area)?.label || r.area;
                        const gradoSel = gradoFiltro?.startsWith(r.id + "|") ? gradoFiltro.split("|")[1] : null;
                        const mostrate = gradoSel ? gente.filter((p) => p.grade === gradoSel) : gente;
                        return (
                            <div key={r.id} className="rounded-xl bg-white/[0.02] border border-white/8 overflow-hidden">
                                <div className="p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <button onClick={() => setAperto(open ? null : r.id)} className="font-bold text-white hover:text-indigo-300 transition-colors text-left">
                                            {r.label} <span className="text-slate-500 font-normal">{open ? "▾" : "▸"}</span>
                                        </button>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {r.isCustom && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold">CUSTOM</span>}
                                            {r.hasOverride && <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-bold" title="Ruolo di sistema modificato da UI">MODIFICATO</span>}
                                            <span className="text-xs font-bold px-2 py-0.5 rounded-full border" style={{ color: col, borderColor: col + "66", background: col + "1a" }}>{areaLbl}</span>
                                        </div>
                                    </div>
                                    {/* GRADI = FILTRI */}
                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                        {r.grades.length > 0 ? r.grades.map((g) => {
                                            const on = gradoFiltro === `${r.id}|${g.id}`;
                                            return (
                                                <button key={g.id}
                                                    onClick={() => { setGradoFiltro(on ? null : `${r.id}|${g.id}`); setAperto(r.id); }}
                                                    title={on ? "Filtro attivo — clicca per toglierlo" : "Mostra solo le persone con questo grado"}
                                                    className={`text-[10px] px-2 py-0.5 rounded-md border font-bold transition-colors ${on ? "bg-indigo-500/25 border-indigo-400/60 text-indigo-200" : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/25"}`}>
                                                    {g.label}{on && " ✓"}
                                                </button>
                                            );
                                        }) : <span className="text-[10px] text-slate-600">Nessun grado</span>}
                                    </div>
                                    <div className="flex items-center justify-between mt-2 gap-2">
                                        <button onClick={() => setAperto(open ? null : r.id)} className="text-xs text-slate-400 hover:text-slate-200">
                                            <b className="text-slate-200">{mostrate.length}</b> person{mostrate.length === 1 ? "a" : "e"}{gradoSel ? " (filtrate)" : ""}
                                        </button>
                                        <div className="flex gap-1.5">
                                            <button onClick={() => { setEdit({ id: r.id, label: r.label, area: r.area, grades: r.grades.map((g) => ({ ...g })), isCustom: r.isCustom, nuovo: false }); setMsg(""); }}
                                                className="text-[10px] px-2 py-1 rounded-md border border-white/15 text-slate-300 hover:text-white hover:bg-white/5 font-bold">✏️ Modifica</button>
                                            {r.hasOverride && (
                                                <button onClick={() => ripristinaOverride(r)} title="Torna alla definizione di sistema"
                                                    className="text-[10px] px-2 py-1 rounded-md border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/15 font-bold">↩ Sistema</button>
                                            )}
                                            {r.isCustom && (
                                                <button onClick={() => elimina(r)} title="Elimina (solo senza persone assegnate)"
                                                    className="text-[10px] px-2 py-1 rounded-md border border-rose-500/40 text-rose-300 hover:bg-rose-500/15 font-bold">🗑</button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {open && (
                                    <div className="border-t border-white/5 divide-y divide-white/5 max-h-56 overflow-y-auto">
                                        {mostrate.length === 0 ? (
                                            <div className="px-4 py-3 text-xs text-slate-600">{gradoSel ? "Nessuna persona con questo grado." : "Nessuna persona con questo ruolo."}</div>
                                        ) : mostrate.map((p) => (
                                            <div key={p.id} className="px-4 py-2 flex items-center gap-2 text-xs">
                                                <span className="font-medium text-slate-200">{p.full_name}</span>
                                                {!p.active && <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 font-bold">non attivo</span>}
                                                <span className="ml-auto text-slate-500">{gradeLabelOf(r, p.grade)}</span>
                                                {p.primary_store && <span className="text-slate-600">· {p.primary_store}</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* editor crea/modifica */}
            {edit && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">{edit.nuovo ? "➕ Nuovo ruolo" : `✏️ Modifica ruolo: ${edit.label || edit.id}`}</h3>
                            <button onClick={() => setEdit(null)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10">✕</button>
                        </div>
                        <div className="p-5 space-y-4 overflow-y-auto">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Etichetta <span className="text-rose-400">*</span></label>
                                <input className="glass-input w-full text-sm" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="Es. Magazziniere" />
                                {edit.nuovo && edit.label.trim() && <p className="text-[11px] text-slate-500 mt-1 font-mono">identificativo: {slug(edit.label)}</p>}
                                {!edit.nuovo && <p className="text-[11px] text-slate-500 mt-1 font-mono">identificativo (fisso): {edit.id}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Contesto</label>
                                <div className="flex gap-2 flex-wrap">
                                    {AREAS.map((a) => (
                                        <button key={a.id} onClick={() => setEdit({ ...edit, area: a.id })}
                                            className="text-xs px-3 py-2 rounded-lg border font-bold transition-colors"
                                            style={edit.area === a.id
                                                ? { color: AREA_COLORS[a.id], borderColor: AREA_COLORS[a.id], background: AREA_COLORS[a.id] + "22" }
                                                : { color: "var(--tf-94a3b8)", borderColor: "var(--tf-w100)" }}>
                                            {a.label}{edit.area === a.id && " ✓"}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Gradi (facoltativi)</label>
                                <div className="space-y-2">
                                    {edit.grades.map((g, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <input className="glass-input flex-1 text-sm" value={g.label}
                                                onChange={(e) => setEdit({ ...edit, grades: edit.grades.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })}
                                                placeholder="Es. Senior" />
                                            <button onClick={() => setEdit({ ...edit, grades: edit.grades.filter((_, j) => j !== i) })}
                                                className="text-rose-400 hover:text-rose-300 font-bold px-2">✕</button>
                                        </div>
                                    ))}
                                    <button onClick={() => setEdit({ ...edit, grades: [...edit.grades, { id: "", label: "" }] })}
                                        className="text-xs px-3 py-1.5 rounded-lg border border-white/15 text-slate-300 hover:bg-white/5 font-bold">+ Aggiungi grado</button>
                                </div>
                            </div>
                            {!edit.nuovo && !edit.isCustom && (
                                <p className="text-[11px] text-slate-500 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2">
                                    Ruolo di sistema: la modifica viene salvata come personalizzazione (badge MODIFICATO) e puoi sempre tornare alla definizione originale con «↩ Sistema».
                                </p>
                            )}
                            {msg && <div className="text-sm font-medium text-rose-300">{msg}</div>}
                        </div>
                        <div className="p-5 border-t border-white/10 flex justify-end gap-3">
                            <button onClick={() => setEdit(null)} className="px-5 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10">Annulla</button>
                            <button onClick={salva} disabled={busy}
                                className="px-6 py-2 rounded-lg text-sm font-bold bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50">
                                {busy ? "Salvo…" : "Salva a database"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
