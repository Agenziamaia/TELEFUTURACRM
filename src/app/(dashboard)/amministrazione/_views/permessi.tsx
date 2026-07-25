"use client";

/**
 * PERMESSI DI VISIBILITÀ (solo admin) — Amministrazione → Permessi.
 *
 * Scegli un RUOLO e vedi la matrice completa del menù (categorie e
 * sotto-categorie, da src/lib/nav.ts): ogni interruttore concede o toglie la
 * visibilità di quella voce al ruolo. Lo stato mostrato è quello EFFETTIVO
 * (default di codice finché non tocchi; "Personalizzato" quando esiste una
 * riga in role_permissions). Sidebar e blocco rotte leggono la stessa fonte:
 * quello che cambi qui vale ovunque, in entrambe le direzioni, senza codice.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { roleLabel } from "@/lib/roles";
import { useRoles } from "@/lib/useRoles";
import { NAVIGATION, effectiveAllowed, canSeeDefault, OUTBOUND_HIDDEN_GROUPS, hubChildKey, hubSubKey, groupKey, type PermMap } from "@/lib/nav";
import { CAPABILITIES, capKey, capAllowed, capChoice, type CapGroup, type CapGroupChoice } from "@/lib/capabilities";
import { notify, dbError } from "./toast";

interface Riga { href: string; nome: string; gruppo?: string; defaultRoles: string[]; livello?: number; padre?: string }

// La matrice e' GERARCHICA (richiesta Luca): un hub acceso si esplode nelle sue
// sezioni interne, e Utenti anche nelle sue funzioni — tutte decidibili una a una.
function catalogo(): { titolo: string; voci: Riga[] }[] {
    const out: { titolo: string; voci: Riga[] }[] = [];
    let sciolte: Riga[] = [];
    NAVIGATION.forEach((e) => {
        if (e.type === "link") sciolte.push({ href: e.href, nome: e.name, defaultRoles: e.roles });
        else if (e.type === "hub") {
            if (sciolte.length) { out.push({ titolo: "Voci principali", voci: sciolte }); sciolte = []; }
            const voci: Riga[] = [{ href: e.href, nome: `${e.name} — accesso all'hub`, defaultRoles: e.roles }];
            e.children.forEach((c) => {
                voci.push({ href: hubChildKey(e, c), nome: c.name, defaultRoles: c.roles ?? e.roles, livello: 1, padre: e.href });
                (c.subs ?? []).forEach((sub) => {
                    voci.push({ href: hubSubKey(e, c, sub.id), nome: sub.name, defaultRoles: sub.roles, livello: 2, padre: hubChildKey(e, c) });
                });
            });
            out.push({ titolo: `${e.name} (hub)`, voci });
        } else {
            // GRUPPO del menu': stessa resa degli hub (riga di accesso + voci indentate)
            if (sciolte.length) { out.push({ titolo: "Voci principali", voci: sciolte }); sciolte = []; }
            const gk = groupKey(e.label);
            out.push({
                titolo: `${e.label} (hub)`,
                voci: [
                    { href: gk, nome: `${e.label} — accesso all'hub`, gruppo: e.label, defaultRoles: e.roles ?? ["*"] },
                    ...e.children.map((c) => ({ href: c.href, nome: c.name, gruppo: e.label, defaultRoles: c.roles, livello: 1, padre: gk })),
                ],
            });
        }
    });
    if (sciolte.length) out.push({ titolo: "Voci principali", voci: sciolte });
    return out;
}

export function PermessiView() {
    const { user } = useAuth();
    const isAdmin = ["admin", "dev"].includes(user?.role || "");
    const { roles: allRoles } = useRoles();
    const ruoli = useMemo(() => allRoles.filter((r) => !["admin", "dev"].includes(r.id)), [allRoles]);
    const [ruolo, setRuolo] = useState<string>("");
    const [righe, setRighe] = useState<PermMap>(new Map());
    const [busy, setBusy] = useState<string | null>(null);
    const gruppi = useMemo(catalogo, []);

    const load = async (r: string) => {
        const { data, error } = await supabase.from("role_permissions").select("perm_key,allowed").eq("role", r);
        if (error) { dbError("permessi", error); return; }
        const m: PermMap = new Map();
        (data ?? []).forEach((x: { perm_key: string; allowed: boolean }) => m.set(x.perm_key, x.allowed));
        setRighe(m);
    };
    useEffect(() => { if (ruolo) load(ruolo); }, [ruolo]);

    if (!isAdmin) return (
        <div className="p-8 text-center text-slate-500 rounded-xl bg-white/[0.02] border border-white/5">
            Sezione riservata all&apos;Admin.
        </div>
    );

    const toggle = async (v: Riga) => {
        if (!ruolo || busy) return;
        setBusy(v.href);
        const attuale = effectiveAllowed(ruolo, v.href, v.defaultRoles, righe, v.gruppo);
        const { error } = await supabase.from("role_permissions").upsert(
            { role: ruolo, perm_key: v.href, allowed: !attuale, updated_by: user?.name || "—", updated_at: new Date().toISOString() },
            { onConflict: "role,perm_key" },
        );
        setBusy(null);
        if (error) { dbError("salvataggio permesso", error); return; }
        notify(`${v.nome}: ${!attuale ? "visibile" : "nascosta"} per ${roleLabel(ruolo)}`, "ok");
        load(ruolo);
    };

    const ripristina = async (v: Riga) => {
        if (!ruolo || busy) return;
        setBusy(v.href);
        const { error } = await supabase.from("role_permissions").delete().eq("role", ruolo).eq("perm_key", v.href);
        setBusy(null);
        if (error) { dbError("ripristino default", error); return; }
        notify(`${v.nome}: tornata al default per ${roleLabel(ruolo)}`, "ok");
        load(ruolo);
    };

    // ── CAPACITÀ (comportamenti per sezione) ────────────────────────────────
    // choice: scrivo ESPLICITAMENTE tutte le opzioni del gruppo (la scelta = true,
    // le altre = false) così lo stato a DB è sempre inequivocabile;
    // flags: un upsert per interruttore. Ripristina = cancello le righe del gruppo.
    const setCapChoice = async (g: CapGroupChoice, sceltaId: string) => {
        if (!ruolo || busy) return;
        setBusy("cap:" + g.section);
        const rows = g.caps.map((c) => ({
            role: ruolo, perm_key: capKey(g.section, c.id), allowed: c.id === sceltaId,
            updated_by: user?.name || "—", updated_at: new Date().toISOString(),
        }));
        const { error } = await supabase.from("role_permissions").upsert(rows, { onConflict: "role,perm_key" });
        setBusy(null);
        if (error) { dbError("salvataggio comportamento", error); return; }
        notify(`${g.sectionLabel}: modalità aggiornata per ${roleLabel(ruolo)}`, "ok");
        load(ruolo);
    };
    const toggleCapFlag = async (g: CapGroup, capId: string, attuale: boolean) => {
        if (!ruolo || busy) return;
        setBusy("cap:" + g.section + capId);
        const { error } = await supabase.from("role_permissions").upsert({
            role: ruolo, perm_key: capKey(g.section, capId), allowed: !attuale,
            updated_by: user?.name || "—", updated_at: new Date().toISOString(),
        }, { onConflict: "role,perm_key" });
        setBusy(null);
        if (error) { dbError("salvataggio comportamento", error); return; }
        notify(`${g.sectionLabel}: comportamento aggiornato per ${roleLabel(ruolo)}`, "ok");
        load(ruolo);
    };
    const resetCaps = async (g: CapGroup) => {
        if (!ruolo || busy) return;
        setBusy("cap:" + g.section);
        const { error } = await supabase.from("role_permissions").delete()
            .eq("role", ruolo).in("perm_key", g.caps.map((c) => capKey(g.section, c.id)));
        setBusy(null);
        if (error) { dbError("ripristino comportamento", error); return; }
        notify(`${g.sectionLabel}: comportamento tornato al default per ${roleLabel(ruolo)}`, "ok");
        load(ruolo);
    };

    return (
        <div className="space-y-5 max-w-4xl">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Ruolo</label>
                        <select className="glass-input text-sm" value={ruolo} onChange={(e) => setRuolo(e.target.value)}>
                            <option value="">— Scegli il ruolo —</option>
                            {ruoli.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                    </div>
                    <p className="text-xs text-slate-500 pb-2 max-w-xl">
                        Gli interruttori mostrano cosa VEDE il ruolo: menù e accesso alle pagine seguono in automatico.
                        L&apos;Admin vede sempre tutto e non è modificabile da qui.
                    </p>
                </div>
                {ruolo && ["agente", "direttore_ob"].includes(ruolo) && (
                    <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                        Reparto Outbound: {OUTBOUND_HIDDEN_GROUPS.join(", ")} sono nascosti di default — puoi comunque concederli voce per voce da qui.
                    </p>
                )}
            </div>

            {!ruolo ? (
                <div className="p-10 text-center text-slate-500 rounded-xl bg-white/[0.02] border border-white/5">
                    Scegli un ruolo per vedere e modificare la sua matrice di visibilità.
                </div>
            ) : (
                <div className="space-y-4">
                    {gruppi.map((g) => (
                        <div key={g.titolo} className="rounded-xl bg-white/[0.02] border border-white/5 overflow-hidden">
                            <div className="px-4 py-2.5 bg-white/[0.03] border-b border-white/5 text-xs font-bold uppercase tracking-wider text-slate-400">{g.titolo}</div>
                            <div className="divide-y divide-white/5">
                                {g.voci.map((v) => {
                                    const eff = effectiveAllowed(ruolo, v.href, v.defaultRoles, righe, v.gruppo);
                                    const custom = righe.has(v.href);
                                    const defaultVal = (["agente", "direttore_ob"].includes(ruolo) && v.gruppo && OUTBOUND_HIDDEN_GROUPS.includes(v.gruppo))
                                        ? false : canSeeDefault(v.defaultRoles, ruolo);
                                    // se il livello sopra e' spento, la voce interna non conta nulla
                                    const padreOff = !!v.padre && !g.voci.some((x) => x.href === v.padre &&
                                        effectiveAllowed(ruolo, x.href, x.defaultRoles, righe, x.gruppo));
                                    return (
                                        <div key={v.href} className={`flex items-center gap-3 px-4 py-2.5 ${padreOff ? "opacity-40" : ""}`} style={{ paddingLeft: 16 + (v.livello || 0) * 26 }}>
                                            {(v.livello || 0) > 0 && <span className="text-slate-600 text-xs shrink-0">└</span>}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-white">{v.nome}</div>
                                                <div className="text-[11px] text-slate-600 font-mono">{v.href}</div>
                                            </div>
                                            {custom ? (
                                                <button onClick={() => ripristina(v)} title={`Torna al default (${defaultVal ? "visibile" : "nascosta"})`}
                                                    className="text-[10px] px-2 py-1 rounded-md border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 font-bold">
                                                    Personalizzato · ripristina
                                                </button>
                                            ) : (
                                                <span className="text-[10px] px-2 py-1 rounded-md border border-white/10 text-slate-500 font-bold">Predefinito</span>
                                            )}
                                            <button onClick={() => toggle(v)} disabled={busy === v.href}
                                                className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${eff ? "bg-emerald-500/70" : "bg-white/10"} ${busy === v.href ? "opacity-50" : ""}`}
                                                title={eff ? "Visibile — clicca per nascondere" : "Nascosta — clicca per concedere"}>
                                                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${eff ? "left-6" : "left-0.5"}`} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ⚙️ COMPORTAMENTI: come si comporta una sezione per questo ruolo
                (non SE la vede — quello sta sopra). Ogni personalizzazione
                registrata nel catalogo CAPABILITIES appare qui da sola. */}
            {ruolo && (
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-white pt-2">⚙️ Comportamenti nelle sezioni</h3>
                    {CAPABILITIES.map((g) => {
                        const custom = g.caps.some((c) => righe.has(capKey(g.section, c.id)));
                        return (
                            <div key={g.section} className="rounded-xl bg-white/[0.02] border border-white/5 overflow-hidden">
                                <div className="px-4 py-2.5 bg-white/[0.03] border-b border-white/5 flex items-center gap-2">
                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">⚙️ {g.sectionLabel}</span>
                                    {custom ? (
                                        <button onClick={() => resetCaps(g)} className="ml-auto text-[10px] px-2 py-1 rounded-md border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 font-bold">
                                            Personalizzato · ripristina default
                                        </button>
                                    ) : (
                                        <span className="ml-auto text-[10px] px-2 py-1 rounded-md border border-white/10 text-slate-500 font-bold">Predefinito</span>
                                    )}
                                </div>
                                {g.mode === "choice" ? (
                                    <div className="divide-y divide-white/5">
                                        {[...g.caps.map((c) => ({ id: c.id, label: c.label, desc: c.desc })), g.fallback].map((opt) => {
                                            const attiva = capChoice(ruolo, g, righe) === opt.id;
                                            return (
                                                <button key={opt.id} disabled={busy === "cap:" + g.section}
                                                    onClick={() => {
                                                        if (attiva) return;
                                                        // scegliere il fallback = spegnere tutte le opzioni esplicite
                                                        setCapChoice(g, opt.id);
                                                    }}
                                                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${attiva ? "bg-emerald-500/[0.06]" : "hover:bg-white/[0.03]"}`}>
                                                    <span className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${attiva ? "border-emerald-400" : "border-slate-600"}`}>
                                                        {attiva && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                                                    </span>
                                                    <span>
                                                        <span className={`block text-sm font-medium ${attiva ? "text-emerald-200" : "text-slate-300"}`}>{opt.label}</span>
                                                        <span className="block text-[11px] text-slate-500 mt-0.5">{opt.desc}</span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="divide-y divide-white/5">
                                        {g.caps.map((c) => {
                                            const eff = capAllowed(ruolo, g.section, c, righe);
                                            const rowCustom = righe.has(capKey(g.section, c.id));
                                            return (
                                                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium text-white">{c.label}</div>
                                                        <div className="text-[11px] text-slate-500 mt-0.5">{c.desc}</div>
                                                    </div>
                                                    {rowCustom && <span className="text-[10px] px-2 py-1 rounded-md border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 font-bold shrink-0">Personalizzato</span>}
                                                    <button onClick={() => toggleCapFlag(g, c.id, eff)} disabled={busy === "cap:" + g.section + c.id}
                                                        className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${eff ? "bg-emerald-500/70" : "bg-white/10"}`}
                                                        title={eff ? "Attivo — clicca per disattivare" : "Disattivo — clicca per attivare"}>
                                                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${eff ? "left-6" : "left-0.5"}`} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
