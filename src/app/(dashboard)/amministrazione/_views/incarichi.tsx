"use client";

/* INCARICHI (Luca 29/07) — permessi "di capacità": funzioni operative
   assegnate a persone specifiche, non semplice visibilità (per quella c'è
   Permessi). Primo incarico: la GESTIONE FERIE. Pensato per la rivendita:
   il cliente decide CHI è designato e se, oltre al pallino sulla sezione,
   deve arrivare anche il task nel fulmine ⚡ (indirizzato solo ai designati).
   Ogni salvataggio scrive su `incarichi` e RILEGGE dal DB. */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { Loader2, Zap, Users, RefreshCw } from "lucide-react";
import { notify, dbError } from "./toast";
import { useRoles } from "@/lib/useRoles";
import { caricaTutte } from "@/lib/fetchTutte";

interface Incarico { chiave: string; titolo: string; descrizione: string; assegnatari: string[]; ruoli?: string[] | null; fulmine: boolean; whatsapp?: string | null }
interface Persona { id: string; full_name: string; role: string }

export function IncarichiView() {
    const [loading, setLoading] = useState(true);
    const [incarichi, setIncarichi] = useState<Incarico[]>([]);
    const [persone, setPersone] = useState<Persona[]>([]);
    const [busy, setBusy] = useState(false);
    const [q, setQ] = useState<Record<string, string>>({});   // ricerca risorsa per incarico
    const [lettoAlle, setLettoAlle] = useState("");           // ora dell'ultima lettura dal DB

    const carica = async () => {
        const [inc, pers] = await Promise.all([
            supabase.from("incarichi").select("*").order("chiave"),
            // lista COMPLETA degli utenti attivi (caricaTutte: oltre il tetto
            // PostgREST da 1000 righe; ordinamento stabile full_name+id)
            caricaTutte<Persona>((from, to) =>
                supabase.from("app_users").select("id, full_name, role").eq("active", true).order("full_name").order("id").range(from, to)),
        ]);
        if (dbError("Caricamento incarichi", inc.error)) return;
        dbError("Caricamento utenti", pers.error);
        setIncarichi((inc.data ?? []) as Incarico[]);
        setPersone(pers.data);
        setLettoAlle(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
        setLoading(false);
    };
    useEffect(() => { carica(); }, []);

    const salva = async (chiave: string, patch: Partial<Incarico>) => {
        if (busy) return;
        setBusy(true);
        try {
            const { error } = await supabase.from("incarichi").update({ ...patch, updated_at: new Date().toISOString() }).eq("chiave", chiave);
            if (dbError("Salvataggio incarico", error)) return;
            await carica();                       // rilettura: quello che vedi è ciò che vale
            notify("Incarico aggiornato ✓", "ok");
        } finally { setBusy(false); }
    };

    const togAssegnatario = (inc: Incarico, id: string) => {
        const next = inc.assegnatari.includes(id) ? inc.assegnatari.filter((x) => x !== id) : [...inc.assegnatari, id];
        salva(inc.chiave, { assegnatari: next });
    };

    // RUOLI DESIGNATI (Luca 03/08, mig. 156): tutto un ruolo insieme — la
    // risoluzione in persone avviene AL MOMENTO dell'evento, quindi chi viene
    // creato in futuro con quel ruolo entra nell'incarico da solo.
    const { roles: tuttiRuoli, labelOf } = useRoles();
    const togRuolo = (inc: Incarico, ruoloId: string) => {
        const cur = (inc.ruoli ?? []) as string[];
        const next = cur.includes(ruoloId) ? cur.filter((x) => x !== ruoloId) : [...cur, ruoloId];
        salva(inc.chiave, { ruoli: next } as Partial<Incarico>);
    };

    if (loading) return <div className="flex items-center gap-3 text-slate-400 py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Caricamento incarichi…</div>;

    // in prima fila chi fa parte dell'amministrazione, ma OGNI utente è designabile
    const ordinate = [...persone].sort((a, b) => {
        const pa = ["amministrativo", "admin", "direttore_generale"].includes(a.role) ? 0 : 1;
        const pb = ["amministrativo", "admin", "direttore_generale"].includes(b.role) ? 0 : 1;
        return pa - pb || a.full_name.localeCompare(b.full_name);
    });

    // RIQUADRO "Designati adesso" (Luca 05/08) — helper JSX chiamato come
    // funzione. Alla selezione di un ruolo si vede SUBITO chi ne fa parte:
    // stessa regola di lib/incarichi.designatiIncarico (singoli + utenti
    // ATTIVI dei ruoli designati, senza doppioni), calcolata sugli app_users
    // riletti dal DB a ogni salvataggio — non una cache stantia.
    const boxDesignatiAdesso = (inc: Incarico) => {
        const ruoliSel = (inc.ruoli ?? []) as string[];
        if (!ruoliSel.length) return null;
        const visti = new Set<string>();
        const nomi: string[] = [];
        for (const id of inc.assegnatari) {
            if (visti.has(id)) continue;
            visti.add(id);
            nomi.push(persone.find((p) => p.id === id)?.full_name || id);
        }
        for (const p of persone) {
            if (ruoliSel.includes(p.role) && !visti.has(p.id)) { visti.add(p.id); nomi.push(p.full_name); }
        }
        nomi.sort((a, b) => a.localeCompare(b));
        const ruoliVuoti = ruoliSel.filter((r) => !persone.some((p) => p.role === r));
        return (
            <div className="mt-2.5 rounded-xl border border-sky-400/25 bg-white/[0.03] px-3.5 py-2.5 space-y-1">
                <div className="flex items-start justify-between gap-3">
                    <p className="text-xs text-sky-100">
                        <span className="font-bold">Designati adesso: {nomi.length}</span>
                        {nomi.length > 0
                            ? <span className="font-normal text-slate-300"> — {nomi.join(", ")}</span>
                            : <span className="font-normal text-slate-400"> — nessun utente attivo con i ruoli scelti</span>}
                    </p>
                    <button onClick={() => carica()} disabled={busy}
                        title="Rileggi adesso utenti e incarichi dal database"
                        className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-sky-300 transition-colors disabled:opacity-50">
                        <RefreshCw className="w-3 h-3" /> {lettoAlle && `letto alle ${lettoAlle}`}
                    </button>
                </div>
                {ruoliVuoti.length > 0 && (
                    <p className="text-[10px] text-amber-300">Nessun utente attivo per: {ruoliVuoti.map((r) => labelOf(r)).join(", ")}.</p>
                )}
                <p className="text-[10px] text-slate-500">
                    Elenco risolto dal ruolo, non fotografato: ogni nuovo utente creato con uno di questi ruoli
                    diventa designato automaticamente, senza ritoccare l&apos;incarico.
                </p>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-400 max-w-3xl">
                Qui si decide <b className="text-slate-200">chi è designato</b> alle funzioni operative
                (non è visibilità: per quella c&apos;è Permessi). I designati ricevono il
                <b className="text-slate-200"> pallino</b> sulla sezione interessata; con il fulmine attivo
                anche il <b className="text-slate-200">task ⚡</b>, indirizzato solo a loro.
                Senza designati, le notifiche seguono il comportamento standard (tutta l&apos;amministrazione).
                Si può designare anche un <b className="text-slate-200">RUOLO intero</b>: vale per tutti i suoi utenti,
                <b className="text-slate-200"> compresi quelli creati in futuro</b> (la risoluzione avviene al momento dell&apos;evento).
            </p>
            {incarichi.map((inc) => (
                <div key={inc.chiave} className="glass-card p-5 space-y-3">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2"><Users className="w-4 h-4 text-violet-400" /> {inc.titolo}</h3>
                            <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">{inc.descrizione}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">WhatsApp incaricato <span className="normal-case font-normal">(per i messaggi automatici, es. bonifico istantaneo)</span></label>
                            <input defaultValue={inc.whatsapp || ""} placeholder="es. 333 1234567" inputMode="tel"
                                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (inc.whatsapp || "")) salva(inc.chiave, { whatsapp: v }); }}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                className="glass-input !h-9 text-xs w-44 font-mono" />
                        </div>
                        <button onClick={() => salva(inc.chiave, { fulmine: !inc.fulmine })}
                            title="Con il fulmine attivo, ogni nuova richiesta genera anche un task ⚡ indirizzato ai designati"
                            className={cn("flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all",
                                inc.fulmine ? "border-amber-400/70 bg-amber-500/15 text-amber-200" : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/25")}>
                            <Zap className="w-4 h-4" /> Task nel fulmine: {inc.fulmine ? "ATTIVO" : "spento"}
                        </button>
                        </div>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                            Designati scelti uno a uno <span className="normal-case font-normal">({inc.assegnatari.length || (((inc.ruoli ?? []) as string[]).length ? "nessuno" : "nessuno — vale il comportamento standard")})</span>
                        </p>
                        {/* RICERCA A SCRITTURA (Luca 29/07): scrivi la risorsa e la selezioni —
                            con più incarichi la lista completa farebbe solo disordine. */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            <div className="relative">
                                <input value={q[inc.chiave] || ""} onChange={(e) => setQ((prev) => ({ ...prev, [inc.chiave]: e.target.value }))}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            const cerca = (q[inc.chiave] || "").trim().toLowerCase();
                                            const primo = ordinate.filter((p) => !inc.assegnatari.includes(p.id) && p.full_name.toLowerCase().includes(cerca))[0];
                                            if (cerca && primo) { togAssegnatario(inc, primo.id); setQ((prev) => ({ ...prev, [inc.chiave]: "" })); }
                                        }
                                    }}
                                    placeholder="Scrivi la risorsa…" className="glass-input !h-8 text-xs w-48" />
                                {(q[inc.chiave] || "").trim() && (
                                    <div className="absolute z-40 mt-1 w-64 rounded-lg border border-white/10 bg-[#0f111a] shadow-2xl overflow-hidden">
                                        {ordinate.filter((p) => !inc.assegnatari.includes(p.id) && p.full_name.toLowerCase().includes((q[inc.chiave] || "").trim().toLowerCase())).slice(0, 8).map((p) => (
                                            <button key={p.id} onClick={() => { togAssegnatario(inc, p.id); setQ((prev) => ({ ...prev, [inc.chiave]: "" })); }}
                                                className="block w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-violet-500/15">
                                                {p.full_name} <span className="text-slate-500">· {p.role}</span>
                                            </button>
                                        ))}
                                        {ordinate.filter((p) => !inc.assegnatari.includes(p.id) && p.full_name.toLowerCase().includes((q[inc.chiave] || "").trim().toLowerCase())).length === 0 && (
                                            <p className="px-3 py-1.5 text-xs text-slate-600">Nessuna risorsa corrispondente</p>
                                        )}
                                    </div>
                                )}
                            </div>
                            {inc.assegnatari.map((id) => {
                                const p = persone.find((x) => x.id === id);
                                return (
                                    <span key={id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border border-violet-400/70 bg-violet-500/20 text-violet-100">
                                        {p?.full_name || id}
                                        <button onClick={() => togAssegnatario(inc, id)} className="opacity-70 hover:opacity-100" title="Rimuovi designato">✕</button>
                                    </span>
                                );
                            })}
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-3 mb-1.5">
                            Ruoli designati <span className="normal-case font-normal">(tutti gli utenti del ruolo, anche futuri)</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {tuttiRuoli.map((r) => {
                                const on = ((inc.ruoli ?? []) as string[]).includes(r.id);
                                return (
                                    <button key={r.id} onClick={() => togRuolo(inc, r.id)}
                                        className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors",
                                            on ? "border-sky-400/70 bg-sky-500/20 text-sky-100" : "border-white/10 text-slate-500 hover:border-white/25 hover:text-slate-300")}>
                                        {on ? "✓ " : ""}{r.label}
                                    </button>
                                );
                            })}
                        </div>
                        {boxDesignatiAdesso(inc)}
                    </div>
                </div>
            ))}
        </div>
    );
}
