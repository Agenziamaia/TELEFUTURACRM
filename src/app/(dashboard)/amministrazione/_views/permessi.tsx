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
        </div>
    );
}
