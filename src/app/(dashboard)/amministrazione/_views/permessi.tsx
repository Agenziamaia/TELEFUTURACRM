"use client";

/**
 * PERMESSI DI VISIBILITÀ (solo admin) — Amministrazione → Permessi.
 *
 * Scegli un RUOLO e vedi la matrice completa del menù (categorie e
 * sotto-categorie, da src/lib/nav.ts): ogni interruttore concede o toglie la
 * visibilità di quella voce al ruolo. Lo stato mostrato è quello EFFETTIVO
 * (default di codice finché non tocchi; poi vale la riga in role_permissions —
 * senza etichette "predefinito/personalizzato": lo stato che vedi È la
 * configurazione). Sidebar e blocco rotte leggono la stessa fonte:
 * quello che cambi qui vale ovunque, in entrambe le direzioni, senza codice.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { roleLabel, AREAS, gradesFor, gradeLabel } from "@/lib/roles";
import { roleGradeKey, userKey } from "@/lib/usePermissions";
import { useRoles } from "@/lib/useRoles";
import { NAVIGATION, effectiveAllowed, OUTBOUND_HIDDEN_GROUPS, hubChildKey, hubSubKey, groupKey, type PermMap } from "@/lib/nav";
import { CAPABILITIES, capKey, capAllowed, capChoice, type CapGroup, type CapGroupChoice } from "@/lib/capabilities";
import { notify, dbError } from "./toast";

const AREA_CHIP_COLORS: Record<string, string> = { pv: "var(--tf-6366f1)", cc: "var(--tf-0ea5e9)", ob: "var(--tf-f59e0b)", sede: "var(--tf-a855f7)" };

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
    // ECCEZIONI PER GRADO (Luca 03/08): righe role "ruolo@grado" — vincono
    // sulla riga di ruolo per chi ha quel grado.
    const [righeGradi, setRigheGradi] = useState<Map<string, PermMap>>(new Map());
    // GRADO SELEZIONATO IN TESTA (Luca 03/08 sera): "" = tutti i gradi (si
    // regola il RUOLO); un grado scelto COMMUTA l'intera matrice su di lui —
    // gli interruttori mostrano e scrivono le sue eccezioni.
    const [grado, setGrado] = useState<string>("");
    // PERSONA (MOD-29, Luca 10/08): terzo livello — righe "user:<id>" che
    // vincono su grado e ruolo. Scegliere una persona commuta la matrice su di
    // lei (il suo grado resta implicito nella fusione); esclusivo col grado.
    const [persone, setPersone] = useState<{ id: string; full_name: string; grade: string | null }[]>([]);
    const [persona, setPersona] = useState<string>("");
    const [righePersone, setRighePersone] = useState<Map<string, PermMap>>(new Map());
    useEffect(() => { setGrado(""); setPersona(""); }, [ruolo]);
    useEffect(() => {
        if (!ruolo) { setPersone([]); return; }
        let vivo = true;
        supabase.from("app_users").select("id, full_name, grade")
            .eq("role", ruolo).or("status.is.null,status.neq.licenziato").order("full_name")
            .then(({ data }) => { if (vivo) setPersone((data ?? []) as { id: string; full_name: string; grade: string | null }[]); });
        return () => { vivo = false; };
    }, [ruolo]);
    const personaObj = persone.find((u) => u.id === persona) || null;
    const [busy, setBusy] = useState<string | null>(null);
    // ⚙️ aperto: le opzioni di comportamento esplodono SOTTO la riga della sezione
    const [capOpen, setCapOpen] = useState<string | null>(null);
    const gruppi = useMemo(catalogo, []);

    const load = async (r: string) => {
        // due letture: righe di ruolo+gradi, e TUTTE le eccezioni per persona
        // ("user:<id>", poche per natura) — i conteggi si mostrano solo per le
        // persone del ruolo selezionato
        const [{ data, error }, { data: dataU, error: errU }] = await Promise.all([
            supabase.from("role_permissions").select("role,perm_key,allowed").or(`role.eq.${r},role.like.${r}@%`),
            supabase.from("role_permissions").select("role,perm_key,allowed").like("role", "user:%"),
        ]);
        if (error || errU) { dbError("permessi", (error || errU)!); return; }
        const m: PermMap = new Map();
        const gm = new Map<string, PermMap>();
        ((data ?? []) as { role: string; perm_key: string; allowed: boolean }[]).forEach((x) => {
            if (x.role === r) { m.set(x.perm_key, x.allowed); return; }
            const g = x.role.slice(r.length + 1);
            const pm = gm.get(g) || new Map();
            pm.set(x.perm_key, x.allowed);
            gm.set(g, pm);
        });
        const um = new Map<string, PermMap>();
        ((dataU ?? []) as { role: string; perm_key: string; allowed: boolean }[]).forEach((x) => {
            const uid = x.role.slice("user:".length);
            const pm = um.get(uid) || new Map();
            pm.set(x.perm_key, x.allowed);
            um.set(uid, pm);
        });
        setRighe(m);
        setRigheGradi(gm);
        setRighePersone(um);
    };
    useEffect(() => { if (ruolo) load(ruolo); }, [ruolo]);

    // vista corrente: righe di ruolo, con le eccezioni del grado SOPRA; con una
    // PERSONA scelta: ruolo → il SUO grado (implicito) → le sue eccezioni
    const permsEff = useMemo<PermMap>(() => {
        if (persona) {
            const m: PermMap = new Map(righe);
            if (personaObj?.grade) (righeGradi.get(personaObj.grade) ?? new Map()).forEach((v, k) => m.set(k, v));
            (righePersone.get(persona) ?? new Map()).forEach((v, k) => m.set(k, v));
            return m;
        }
        if (!grado) return righe;
        const m: PermMap = new Map(righe);
        (righeGradi.get(grado) ?? new Map()).forEach((v, k) => m.set(k, v));
        return m;
    }, [righe, righeGradi, righePersone, grado, persona, personaObj?.grade]);
    // dove SCRIVONO interruttori e rotelline in questa vista
    const chiaveScrittura = persona ? userKey(persona) : grado ? roleGradeKey(ruolo, grado) : ruolo;

    /* «MA SONO TUTTI ABILITATI, COME MAI?» (Luca 28/08)
       Guardando il RUOLO la levetta era muta: diceva verde anche quando sotto
       c'era un grado o una persona che la contraddiceva — e quelle persone non
       vedevano la sezione senza che si capisse il perché (caso vero: Password
       accesa a "venditore", ma spenta per gli apprendisti).
       Da qui la levetta del ruolo DICHIARA le sue eccezioni: chi le ha e in
       che verso. Il conto si fa solo nella vista di ruolo — con un grado o una
       persona scelti la levetta parla già di loro. */
    const eccezioniDi = (href: string): { chi: string; vale: boolean; teste: number }[] => {
        if (grado || persona) return [];
        const out: { chi: string; vale: boolean; teste: number }[] = [];
        const conEccPersonale = new Set<string>();
        for (const p of persone) {                       // solo le persone di QUESTO ruolo
            const pm = righePersone.get(p.id);
            if (pm?.has(href)) { out.push({ chi: p.full_name, vale: !!pm.get(href), teste: 1 }); conEccPersonale.add(p.id); }
        }
        righeGradi.forEach((pm, gr) => {
            if (!pm.has(href)) return;
            // le teste vere: chi ha quel grado e non ha già un'eccezione sua
            const teste = persone.filter((p) => p.grade === gr && !conEccPersonale.has(p.id)).length;
            out.push({ chi: `${gradeLabel(ruolo, gr)}${teste ? ` (${teste})` : " — nessuno con questo grado"}`, vale: !!pm.get(href), teste });
        });
        return out;
    };

    if (!isAdmin) return (
        <div className="p-8 text-center text-slate-500 rounded-xl bg-white/[0.02] border border-white/5">
            Sezione riservata all&apos;Admin.
        </div>
    );

    const toggle = async (v: Riga) => {
        if (!ruolo || busy) return;
        setBusy(v.href);
        const attuale = effectiveAllowed(ruolo, v.href, v.defaultRoles, permsEff, v.gruppo);
        let error: { message: string } | null = null;
        if (persona) {
            // ECCEZIONE PERSONALE (MOD-29): se il nuovo valore torna uguale a
            // quello che la persona avrebbe da ruolo+grado, la riga si CANCELLA
            // da sola (si torna a ereditare)
            const mBase: PermMap = new Map(righe);
            if (personaObj?.grade) (righeGradi.get(personaObj.grade) ?? new Map()).forEach((v2, k) => mBase.set(k, v2));
            const effSotto = effectiveAllowed(ruolo, v.href, v.defaultRoles, mBase, v.gruppo);
            const nuovo = !attuale;
            ({ error } = nuovo === effSotto
                ? await supabase.from("role_permissions").delete().eq("role", chiaveScrittura).eq("perm_key", v.href)
                : await supabase.from("role_permissions").upsert(
                    { role: chiaveScrittura, perm_key: v.href, allowed: nuovo, updated_by: user?.name || "—", updated_at: new Date().toISOString() },
                    { onConflict: "role,perm_key" }));
        } else if (grado) {
            // ECCEZIONE DI GRADO: se il nuovo valore torna uguale al ruolo,
            // la riga si CANCELLA da sola (si torna a ereditare)
            const effRuolo = effectiveAllowed(ruolo, v.href, v.defaultRoles, righe, v.gruppo);
            const nuovo = !attuale;
            ({ error } = nuovo === effRuolo
                ? await supabase.from("role_permissions").delete().eq("role", chiaveScrittura).eq("perm_key", v.href)
                : await supabase.from("role_permissions").upsert(
                    { role: chiaveScrittura, perm_key: v.href, allowed: nuovo, updated_by: user?.name || "—", updated_at: new Date().toISOString() },
                    { onConflict: "role,perm_key" }));
        } else {
            ({ error } = await supabase.from("role_permissions").upsert(
                { role: ruolo, perm_key: v.href, allowed: !attuale, updated_by: user?.name || "—", updated_at: new Date().toISOString() },
                { onConflict: "role,perm_key" },
            ));
        }
        setBusy(null);
        if (error) { dbError("salvataggio permesso", error); return; }
        notify(`${v.nome}: ${!attuale ? "visibile" : "nascosta"} per ${persona ? (personaObj?.full_name || "la persona") : roleLabel(ruolo) + (grado ? ` · ${gradeLabel(ruolo, grado)}` : "")}`, "ok");
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
            role: chiaveScrittura, perm_key: capKey(g.section, c.id), allowed: c.id === sceltaId,
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
            role: chiaveScrittura, perm_key: capKey(g.section, capId), allowed: !attuale,
            updated_by: user?.name || "—", updated_at: new Date().toISOString(),
        }, { onConflict: "role,perm_key" });
        setBusy(null);
        if (error) { dbError("salvataggio comportamento", error); return; }
        notify(`${g.sectionLabel}: comportamento aggiornato per ${roleLabel(ruolo)}`, "ok");
        load(ruolo);
    };

    return (
        <div className="space-y-5 max-w-4xl">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
                {/* Selettore ruolo a RIQUADRI, divisi per contesto (richiesta Luca):
                    un click e via, niente tendina da scorrere. */}
                <div className="space-y-2.5">
                    {AREAS.filter((a) => ruoli.some((r) => r.area === a.id)).map((a) => (
                        <div key={a.id} className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-widest w-24 shrink-0" style={{ color: AREA_CHIP_COLORS[a.id] }}>{a.label}</span>
                            {ruoli.filter((r) => r.area === a.id).map((r) => {
                                const on = ruolo === r.id;
                                return (
                                    <button key={r.id} onClick={() => setRuolo(on ? "" : r.id)}
                                        className="text-xs px-3 py-1.5 rounded-lg border font-bold transition-colors"
                                        style={on
                                            ? { color: AREA_CHIP_COLORS[a.id], borderColor: AREA_CHIP_COLORS[a.id], background: AREA_CHIP_COLORS[a.id] + "22" }
                                            : { color: "var(--tf-94a3b8)", borderColor: "var(--tf-w100)" }}>
                                        {r.label}{on && " ✓"}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                    {/* GRADI IN TESTA (Luca 03/08 sera): scegliendo un grado qui sopra
                        cambia TUTTA la matrice — interruttori e rotelline mostrano e
                        scrivono le eccezioni di QUEL grado; senza scelta vale il ruolo. */}
                    {ruolo && gradesFor(ruolo).length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-white/5">
                            <span className="text-[10px] font-bold uppercase tracking-widest w-24 shrink-0 text-amber-300">Grado</span>
                            <button onClick={() => setGrado("")}
                                className="text-xs px-3 py-1.5 rounded-lg border font-bold transition-colors"
                                style={!grado
                                    ? { color: "var(--tf-fbbf24)", borderColor: "var(--tf-f59e0b)", background: "rgba(245,158,11,0.14)" }
                                    : { color: "var(--tf-94a3b8)", borderColor: "var(--tf-w100)" }}>
                                Tutti i gradi{!grado && " ✓"}
                            </button>
                            {gradesFor(ruolo).map((g) => {
                                const on = grado === g.id;
                                const nEcc = righeGradi.get(g.id)?.size ?? 0;
                                return (
                                    <button key={g.id} onClick={() => { setGrado(on ? "" : g.id); if (!on) setPersona(""); }}
                                        className="text-xs px-3 py-1.5 rounded-lg border font-bold transition-colors"
                                        style={on
                                            ? { color: "var(--tf-fbbf24)", borderColor: "var(--tf-f59e0b)", background: "rgba(245,158,11,0.14)" }
                                            : { color: "var(--tf-94a3b8)", borderColor: "var(--tf-w100)" }}>
                                        {g.label}{on && " ✓"}{nEcc > 0 && <span className="ml-1.5 text-[10px] font-black text-amber-400">·{nEcc}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {/* PERSONA (MOD-29, Luca 10/08): eccezioni del SINGOLO utente,
                        vincono su ruolo e grado — esclusive con la scelta del grado */}
                    {ruolo && persone.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-white/5">
                            <span className="text-[10px] font-bold uppercase tracking-widest w-24 shrink-0 text-sky-300">Persona</span>
                            <button onClick={() => setPersona("")}
                                className="text-xs px-3 py-1.5 rounded-lg border font-bold transition-colors"
                                style={!persona
                                    ? { color: "var(--tf-38bdf8)", borderColor: "var(--tf-0ea5e9)", background: "rgba(14,165,233,0.14)" }
                                    : { color: "var(--tf-94a3b8)", borderColor: "var(--tf-w100)" }}>
                                Tutte le persone{!persona && " ✓"}
                            </button>
                            {persone.map((u) => {
                                const on = persona === u.id;
                                const nEcc = righePersone.get(u.id)?.size ?? 0;
                                return (
                                    <button key={u.id} onClick={() => { setPersona(on ? "" : u.id); if (!on) setGrado(""); }}
                                        className="text-xs px-3 py-1.5 rounded-lg border font-bold transition-colors"
                                        style={on
                                            ? { color: "var(--tf-38bdf8)", borderColor: "var(--tf-0ea5e9)", background: "rgba(14,165,233,0.14)" }
                                            : { color: "var(--tf-94a3b8)", borderColor: "var(--tf-w100)" }}>
                                        {u.full_name}{on && " ✓"}{nEcc > 0 && <span className="ml-1.5 text-[10px] font-black text-sky-400">·{nEcc}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {ruolo && grado && !persona && (
                        <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                            Stai regolando <b>{roleLabel(ruolo)} · {gradeLabel(ruolo, grado)}</b>: gli interruttori mostrano cosa vede questo grado.
                            Le voci senza pallino ambra seguono il ruolo; rimettendo un interruttore com&apos;è per il ruolo, l&apos;eccezione si cancella da sola.
                        </p>
                    )}
                    {ruolo && persona && (
                        <p className="text-xs text-sky-300/90 bg-sky-500/10 border border-sky-500/30 rounded-lg px-3 py-2">
                            Stai regolando SOLO <b>{personaObj?.full_name}</b> ({roleLabel(ruolo)}{personaObj?.grade ? ` · ${gradeLabel(ruolo, personaObj.grade)}` : ""}): le sue eccezioni vincono su ruolo e grado.
                            Le voci senza pallino azzurro seguono ruolo/grado; rimettendo un interruttore com&apos;è per il suo ruolo, l&apos;eccezione personale si cancella da sola.
                        </p>
                    )}
                    <p className="text-xs text-slate-500 pt-1">
                        Gli interruttori mostrano cosa VEDE il ruolo scelto{ruolo && gradesFor(ruolo).length > 0 ? " (o il grado selezionato qui sopra)" : ""}: menù e accesso alle pagine seguono in automatico.
                        L&apos;Admin vede sempre tutto e non è modificabile da qui.
                    </p>
                    {/* la legenda del bollino: senza, «≠ 3» non dice niente a nessuno */}
                    {ruolo && !grado && !persona && (
                        <p className="text-xs text-slate-500">
                            Il bollino <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 border border-amber-400/40 text-amber-300">≠ n</span> accanto
                            a una levetta avvisa che <b className="text-amber-300/90">per n persone di questo ruolo vale il contrario</b> (un grado o un&apos;eccezione personale):
                            passaci sopra per sapere chi, e scegli il grado o la persona qui sopra per regolarli.
                        </p>
                    )}
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
                                    const eff = effectiveAllowed(ruolo, v.href, v.defaultRoles, permsEff, v.gruppo);
                                    const eccezione = !persona && !!grado && (righeGradi.get(grado)?.has(v.href) ?? false);
                                    const eccPersona = !!persona && (righePersone.get(persona)?.has(v.href) ?? false);
                                    // chi, dentro questo ruolo, fa eccezione a questa levetta
                                    const eccContro = eccezioniDi(v.href).filter((e) => e.vale !== eff);   // chi la contraddice
                                    const teste = eccContro.reduce((s, e) => s + e.teste, 0);             // quante persone davvero
                                    // COERENZA GERARCHICA (regola Luca): con un antenato spento la voce
                                    // non conta nulla e NON si puo' accendere — prima si accende l'hub
                                    // (o la sezione), poi si scelgono le voci interne una a una.
                                    let padreOff = false;
                                    for (let ph = v.padre; ph; ) {
                                        const par = g.voci.find((x) => x.href === ph);
                                        if (!par) break;
                                        if (!effectiveAllowed(ruolo, par.href, par.defaultRoles, permsEff, par.gruppo)) { padreOff = true; break; }
                                        ph = par.padre;
                                    }
                                    // capacita' agganciate a QUESTA sezione (possono essere piu' gruppi)
                                    const capGroups = CAPABILITIES.filter((cg) => cg.section === v.href);
                                    const capGroup = capGroups[0];
                                    return (
                                        <div key={v.href}>
                                            <div className={`flex items-center gap-3 px-4 py-2.5 transition-opacity ${padreOff ? "opacity-30" : ""}`} style={{ paddingLeft: 16 + (v.livello || 0) * 26 }}>
                                                {(v.livello || 0) > 0 && <span className="text-slate-600 text-xs shrink-0">└</span>}
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-white">{v.nome}</div>
                                                    <div className="text-[11px] text-slate-600 font-mono">{v.href}</div>
                                                </div>
                                                {capGroup && (
                                                    <button onClick={() => setCapOpen(capOpen === v.href ? null : v.href)}
                                                        title="Comportamenti della sezione per questo ruolo"
                                                        className={`p-1.5 rounded-lg border transition-colors shrink-0 ${capOpen === v.href ? "border-indigo-400/60 bg-indigo-500/15 text-indigo-300" : "border-white/10 text-slate-400 hover:text-white hover:bg-white/5"}`}>
                                                        ⚙️
                                                    </button>
                                                )}
                                                {/* «non vale per tutti»: la levetta del ruolo dichiara chi la contraddice */}
                                                {eccContro.length > 0 && (
                                                    <span
                                                        title={`Attenzione: questa levetta NON vale per tutti.\n\n${eccContro.map((e) => `• ${e.chi}: ${e.vale ? "la vede lo stesso" : "NON la vede"}`).join("\n")}\n\nScegli il grado (o la persona) qui sopra per regolarli.`}
                                                        className="shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 border border-amber-400/40 text-amber-300 cursor-help">
                                                        ≠ {teste || eccContro.length}
                                                    </span>
                                                )}
                                                {eccezione && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title={`Eccezione del grado ${gradeLabel(ruolo, grado)} su questa voce`} />}
                                                {eccPersona && <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" title={`Eccezione personale di ${personaObj?.full_name} su questa voce`} />}
                                                {/* ⚠️ COL PADRE SPENTO LA LEVETTA SI MOSTRA SPENTA (Luca
                                                    01/09: «quando disabilito l'hub si disabilitano anche
                                                    quelle sotto, anche graficamente»). Prima la riga si
                                                    sbiadiva ma la levetta restava VERDE — e il verde è la
                                                    prima cosa che l'occhio legge: si vedeva un hub chiuso
                                                    con dentro tre voci apparentemente aperte, che è il
                                                    contrario di quello che succede davvero.
                                                    ⚠️ Si spegne solo la GRAFICA, non il dato: la riga
                                                    salvata resta accesa, e riaprendo l'hub le voci
                                                    tornano come erano. Spegnerle davvero vorrebbe dire
                                                    perdere una configurazione fatta a mano ogni volta che
                                                    si chiude un hub per un minuto. Chi vuole sapere il
                                                    valore vero lo legge nel pallino qui accanto. */}
                                                {padreOff && eff && (
                                                    <span title="Questa voce è accesa, ma con l'hub spento non conta: riaprendo l'hub torna visibile."
                                                        className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-emerald-400/50">on</span>
                                                )}
                                                <button onClick={() => { if (!padreOff) toggle(v); }} disabled={busy === v.href || padreOff}
                                                    className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${eff && !padreOff ? "bg-emerald-500/70" : "bg-white/10"} ${busy === v.href ? "opacity-50" : ""} ${padreOff ? "cursor-not-allowed" : ""}`}
                                                    title={padreOff ? "L'hub è spento: queste voci non sono raggiungibili, qualunque sia il loro valore. Accendi prima l'accesso all'hub (la riga sopra)." : eff ? "Visibile — clicca per nascondere" : "Nascosta — clicca per concedere"}>
                                                    <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${eff && !padreOff ? "bg-white left-6" : "bg-white left-0.5"} ${padreOff ? "bg-slate-400" : ""}`} />
                                                </button>
                                            </div>
                                            {capGroup && capOpen === v.href && (
                                                <div className="pb-3 pr-4 space-y-2" style={{ paddingLeft: 16 + ((v.livello || 0) + 1) * 26 }}>
                                                    {capGroups.map((cg) => (
                                                        <div key={cg.sectionLabel} className="rounded-lg border border-indigo-500/25 bg-indigo-500/[0.04] overflow-hidden">
                                                            <CapOptions g={cg} ruolo={ruolo} righe={permsEff} busy={busy}
                                                                onChoice={(id) => setCapChoice(cg as CapGroupChoice, id)}
                                                                onFlag={(id, att) => toggleCapFlag(cg, id, att)}
                                                                ecc={eccezioniDi} />
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

        </div>
    );
}


/* Opzioni di comportamento di una sezione (choice = radio; flags = interruttori),
   esplose sotto la riga della sezione al click sull'ingranaggio ⚙️. */
function CapOptions({ g, ruolo, righe, busy, onChoice, onFlag, ecc }: {
    g: CapGroup; ruolo: string; righe: PermMap; busy: string | null;
    onChoice: (id: string) => void; onFlag: (id: string, attuale: boolean) => void;
    // chi, dentro questo ruolo, fa eccezione su una chiave (vuoto nelle viste
    // per grado/persona, dove l'interruttore parla già di loro)
    ecc?: (permKey: string) => { chi: string; vale: boolean; teste: number }[];
}) {
    if (g.mode === "choice") {
        const attivaId = capChoice(ruolo, g, righe);
        // su una scelta a pallini l'eccezione non è "il contrario": è «per
        // costoro vale un'altra opzione». Si avvisa in testa al gruppo.
        const diversi = [...g.caps, g.fallback].flatMap((c) => ecc?.(capKey(g.section, c.id)) ?? []);
        return (
            <div className="divide-y divide-white/5">
                {diversi.length > 0 && (
                    <div className="px-3 py-2 text-[11px] text-amber-300/90 bg-amber-500/[0.07]">
                        ⚠️ Non vale per tutti: {diversi.map((d) => d.chi).join(", ")} — scegli il grado o la persona qui sopra per vedere la loro impostazione.
                    </div>
                )}
                {/* il fallback compare come voce SOLO se non coincide già con
                    una scelta esplicita (caso «Solo le sue cose», Luca 27/08:
                    stesso id due volte = due pallini accesi insieme) */}
                {[...g.caps.map((c) => ({ id: c.id, label: c.label, desc: c.desc })), ...(g.caps.some((c) => c.id === g.fallback.id) ? [] : [g.fallback])].map((opt) => {
                    const attiva = attivaId === opt.id;
                    return (
                        <button key={opt.id} disabled={busy === "cap:" + g.section}
                            onClick={() => { if (!attiva) onChoice(opt.id); }}
                            className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors ${attiva ? "bg-emerald-500/[0.06]" : "hover:bg-white/[0.03]"}`}>
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
        );
    }
    return (
        <div className="divide-y divide-white/5">
            {g.caps.map((c) => {
                const eff = capAllowed(ruolo, g.section, c, righe);
                // DIPENDENZE (Luca 30/07): una capacita' con `requires` resta
                // oscurata e non cliccabile finche' il requisito e' spento —
                // es. i destinatari delle Comunicazioni senza "puo' creare".
                const req = c.requires ? g.caps.find((x) => x.id === c.requires) : undefined;
                const reqOff = !!req && !capAllowed(ruolo, g.section, req, righe);
                const contro = (ecc?.(capKey(g.section, c.id)) ?? []).filter((e) => e.vale !== eff);
                const teste = contro.reduce((s, e) => s + e.teste, 0);
                return (
                    <div key={c.id} className={`flex items-center gap-3 px-3 py-2.5 ${reqOff ? "opacity-40" : ""}`}>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white">{c.label}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{c.desc}</div>
                        </div>
                        {/* AZZERA IL CODICE WHATSAPP (Luca 27/08): il codice se lo
                            scelgono loro e nessuno lo può rileggere — quindi
                            l'unico rimedio se lo dimenticano è cancellarlo e
                            farne scegliere un altro. Solo su una PERSONA: su un
                            ruolo intero non avrebbe senso. */}
                        {(c.id === "codice" || c.id === "codice_email") && g.section === "/chat" && ruolo.startsWith("user:") && eff && (
                            <AzzeraCodice userId={ruolo.slice(5)} canale={c.id === "codice_email" ? "email" : "whatsapp"} />
                        )}
                        {contro.length > 0 && (
                            <span
                                title={`Attenzione: questa opzione NON vale per tutti.\n\n${contro.map((e) => `• ${e.chi}: ${e.vale ? "ce l'ha lo stesso" : "NON ce l'ha"}`).join("\n")}\n\nScegli il grado (o la persona) qui sopra per regolarli.`}
                                className="shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 border border-amber-400/40 text-amber-300 cursor-help">
                                ≠ {teste || contro.length}
                            </span>
                        )}
                        <button onClick={() => { if (!reqOff) onFlag(c.id, eff); }} disabled={busy === "cap:" + g.section + c.id || reqOff}
                            className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${eff ? "bg-emerald-500/70" : "bg-white/10"} ${reqOff ? "cursor-not-allowed" : ""}`}
                            title={reqOff ? `Prima accendi "${req?.label}": senza, questa opzione non conta nulla` : eff ? "Attivo — clicca per disattivare" : "Disattivo — clicca per attivare"}>
                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${eff ? "left-6" : "left-0.5"}`} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

/* ── AZZERA IL CODICE DI UN CANALE ─────────────────────────────────────────
   Il codice non è rileggibile da nessuno (nel database c'è solo l'impronta):
   se la persona lo dimentica, l'unica strada è cancellarlo e farle scegliere
   il prossimo al primo ingresso. La prova che chi clicca è un admin la fa il
   DATABASE (`codice_azzera` controlla il ruolo), non questo bottone.
   UN CANALE PER VOLTA (31/08): chi dimentica il codice della posta non deve
   perdere anche quello di WhatsApp. */
function AzzeraCodice({ userId, canale }: { userId: string; canale: "whatsapp" | "email" }) {
    const { user } = useAuth();
    const [stato, setStato] = useState<"fermo" | "conferma" | "vado" | "fatto" | "errore">("fermo");
    const [msg, setMsg] = useState<string | null>(null);

    const azzera = async () => {
        setStato("vado"); setMsg(null);
        const { data, error } = await supabase.rpc("codice_azzera", { p_user: userId, p_admin: user?.id || null, p_canale: canale });
        const d = (data || {}) as { ok?: boolean; errore?: string };
        if (error || !d.ok) { setStato("errore"); setMsg(error?.message || d.errore || "non riuscito"); return; }
        setStato("fatto");
    };

    if (stato === "fatto") return <span className="text-[11px] text-emerald-400 shrink-0">codice azzerato</span>;
    if (stato === "conferma") {
        return (
            <span className="flex items-center gap-1.5 shrink-0">
                <button onClick={azzera} className="text-[11px] font-bold px-2 py-1 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20">
                    Sì, azzera
                </button>
                <button onClick={() => setStato("fermo")} className="text-[11px] text-slate-500 hover:text-slate-300 px-1">no</button>
            </span>
        );
    }
    return (
        <span className="flex items-center gap-1.5 shrink-0">
            {msg && <span className="text-[10px] text-rose-300">{msg}</span>}
            <button onClick={() => setStato("conferma")} disabled={stato === "vado"}
                title="Cancella il codice: al prossimo ingresso ne sceglierà uno nuovo"
                className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
                {stato === "vado" ? "…" : "Azzera codice"}
            </button>
        </span>
    );
}
