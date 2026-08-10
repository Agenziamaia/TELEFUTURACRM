"use client";

// FILTRO MULTI-SELEZIONE STANDARD del CRM (estratto da Ricerca Vendite il
// 10/08 per riuso — MOD-24 Archivio Malus; identico anche in Calendario).
// Convenzione: null = TUTTO selezionato (nessun filtro, default); [] = niente
// spuntato; array = insieme scelto; rispuntare tutte le voci ricompatta a null.
// In testa "Seleziona/Deseleziona tutto"; sul bottone la chip riassuntiva
// ("Tutti" / nome se 1 / "N selezionati"). Menu in PORTAL come SelectPersona
// (i glass-panel creano stacking context separati e lo z-index non basta).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export function FiltroMulti({ values, onChange, opzioni, className = "", disabled = false,
    etichettaTutti = "Tutti", testoDisabilitato, etichette }: {
    values: string[] | null;
    onChange: (v: string[] | null) => void;
    opzioni: readonly string[];
    className?: string;
    disabled?: boolean;
    etichettaTutti?: string;          // chip nello stato "tutto selezionato"
    testoDisabilitato?: string;       // chip quando la tendina e' spenta (motivo)
    etichette?: Record<string, string>; // valore → etichetta visuale
}) {
    const [aperta, setAperta] = useState(false);
    const [testo, setTesto] = useState("");
    const box = useRef<HTMLDivElement | null>(null);
    const menu = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

    // chiusura al click fuori (campo E tendina: la tendina sta nel portal) + Esc
    useEffect(() => {
        if (!aperta) return;
        const h = (e: MouseEvent) => {
            const t = e.target as Node;
            if (box.current && !box.current.contains(t) && !(menu.current && menu.current.contains(t))) {
                setAperta(false); setTesto("");
            }
        };
        const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setAperta(false); setTesto(""); } };
        document.addEventListener("mousedown", h);
        document.addEventListener("keydown", k);
        return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
    }, [aperta]);

    // posizione della tendina agganciata al campo, viva su scroll/resize
    useEffect(() => {
        if (!aperta) { setPos(null); return; }
        const update = () => {
            const r = box.current?.getBoundingClientRect();
            if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 230) });
        };
        update();
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
    }, [aperta]);

    const tutte = values === null;
    const visuale = (o: string) => etichette?.[o] ?? o;
    const spuntata = (o: string) => tutte || (values as string[]).includes(o);
    const toggle = (o: string) => {
        // Luca 10/08: dallo stato "tutte" il click ELEGGE la voce a unico
        // filtro attivo (prima la toglieva dall'insieme — controintuitivo);
        // con un sottoinsieme già scelto resta il toggle classico
        if (values === null) { onChange([o]); return; }
        const next = values.includes(o) ? values.filter((x) => x !== o) : [...values, o];
        onChange(opzioni.length > 0 && opzioni.every((x) => next.includes(x)) ? null : next);
    };

    const chip = disabled ? (testoDisabilitato ?? etichettaTutti)
        : tutte ? etichettaTutti
        : values.length === 0 ? "Nessuno selezionato"
        : values.length === 1 ? visuale(values[0])
        : `${values.length} selezionati`;

    // ricerca interna (stesso match di SelectPersona: inclusione o iniziali)
    const q = testo.trim().toLowerCase();
    const filtrate = !q ? opzioni : opzioni.filter((n) => {
        const nome = (visuale(n) + " " + n).toLowerCase();
        if (nome.includes(q)) return true;
        const parole = nome.split(/\s+/);
        return q.split(/\s+/).every((t) => parole.some((p) => p.startsWith(t)));
    });

    const menuBody = pos ? (
        <div ref={menu}
            className="select-persona-menu fixed z-[4000] rounded-xl border border-white/15 bg-[#161a2c] shadow-2xl shadow-black/60 overflow-hidden"
            style={{ top: pos.top, left: pos.left, width: pos.width }}>
            <button type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(tutte ? [] : null); }}
                className="w-full text-left px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-indigo-300 hover:bg-indigo-500/20 border-b border-white/10">
                {tutte ? "Deseleziona tutto" : "Seleziona tutto"}
            </button>
            {opzioni.length > 8 && (
                <div className="p-2 border-b border-white/10">
                    <input value={testo} onChange={(e) => setTesto(e.target.value)}
                        placeholder="Scrivi per filtrare…" autoFocus
                        className="glass-input w-full text-sm" />
                </div>
            )}
            <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                {filtrate.length > 0 ? filtrate.map((n) => {
                    const sel = spuntata(n);
                    return (
                        <button key={n} type="button"
                            onMouseDown={(e) => { e.preventDefault(); toggle(n); }}
                            className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors hover:bg-indigo-500/20 flex items-center gap-2 ${sel ? "text-indigo-300 font-bold" : "text-slate-100"}`}>
                            <span className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center text-[9px] ${sel ? "border-indigo-400 bg-indigo-500/40" : "border-slate-600"}`}>{sel ? "✓" : ""}</span>
                            <span className="truncate">{visuale(n)}</span>
                        </button>
                    );
                }) : (
                    <div className="px-3.5 py-2.5 text-sm text-slate-500">Nessuna voce corrispondente</div>
                )}
            </div>
        </div>
    ) : null;

    return (
        <div ref={box} className="relative">
            <button type="button" disabled={disabled} onClick={() => setAperta((v) => !v)}
                className={(className || "glass-input w-full text-sm") + " flex items-center justify-between gap-2 text-left disabled:opacity-50"}>
                <span className={"truncate " + (disabled || tutte ? "text-slate-400" : "text-white font-semibold")}>{chip}</span>
                <ChevronDown className={"w-4 h-4 shrink-0 text-slate-400 transition-transform " + (aperta ? "rotate-180" : "")} />
            </button>
            {aperta && !disabled && typeof document !== "undefined" && menuBody && createPortal(menuBody, document.body)}
        </div>
    );
}

// chiave stabile per le dipendenze degli effect: null ("tutto") ≠ [] ("niente")
export const kMulti = (v: string[] | null) => (v === null ? "*" : v.join("|"));
