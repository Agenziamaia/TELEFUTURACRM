"use client";

/* TENDINA-CON-SCRITTURA per i COLLABORATORI (Luca 29/07): ovunque si
   seleziona una persona si può anche SCRIVERE — iniziali del nome o del
   cognome — e la lista si filtra al volo (con 40+ collaboratori scorrere
   è una pena). Drop-in al posto di una <select>: value/onChange a stringa.
   Enter = primo risultato; ✕ = svuota; blur ripristina il valore scelto.

   La tendina vive in un PORTAL sul body (Luca 30/07: finiva SOTTO i pannelli
   successivi — i glass-panel col backdrop-blur creano contesti di
   sovrapposizione separati e lo z-index interno non basta). Posizionata
   sul campo e riallineata a scroll/resize. */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Variante GENERICA per qualsiasi filtro (Luca 30/07: "tutte le tendine
 *  identiche a questa"): stessa estetica e stesso comportamento — si scrive
 *  per filtrare o si sceglie col mouse; campo vuoto = nessun filtro. */
export function SelectOpzioni(props: {
    value: string;
    onChange: (v: string) => void;
    opzioni: readonly string[];
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}) {
    return <SelectPersona {...props} vuotoMsg="Nessuna voce corrispondente" />;
}

export function SelectPersona({
    value, onChange, opzioni, placeholder = "Scrivi o scegli…", className = "", disabled = false,
    vuotoMsg = "Nessun collaboratore corrispondente",
}: {
    value: string;
    onChange: (v: string) => void;
    opzioni: readonly string[];
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    vuotoMsg?: string;
}) {
    const [testo, setTesto] = useState(value);
    const [aperta, setAperta] = useState(false);
    const box = useRef<HTMLDivElement | null>(null);
    const menu = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

    // il valore scelto fuori si riflette dentro (es. reset dei filtri)
    useEffect(() => { setTesto(value); }, [value]);

    // chiusura al click fuori (campo E tendina: la tendina sta nel portal)
    useEffect(() => {
        const h = (e: MouseEvent) => {
            const t = e.target as Node;
            if (box.current && !box.current.contains(t) && !(menu.current && menu.current.contains(t))) {
                setAperta(false); setTesto(value);
            }
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [value]);

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

    const q = testo.trim().toLowerCase();
    const filtrate = !aperta ? [] : opzioni.filter((n) => {
        if (!q || q === value.trim().toLowerCase()) return true;   // focus senza digitare: tutte
        const nome = n.toLowerCase();
        // match per inclusione O per iniziali delle parole (es. "ma ro" → Mario Rossi)
        if (nome.includes(q)) return true;
        const parole = nome.split(/\s+/);
        const termini = q.split(/\s+/);
        return termini.every((t) => parole.some((p) => p.startsWith(t)));
    }).slice(0, 12);

    const scegli = (n: string) => { onChange(n); setTesto(n); setAperta(false); };

    const menuBody = pos && (filtrate.length > 0 || q) ? (
        <div ref={menu}
            className="select-persona-menu fixed z-[4000] max-h-72 overflow-y-auto rounded-xl border border-white/15 bg-[#161a2c] shadow-2xl shadow-black/60 divide-y divide-white/5"
            style={{ top: pos.top, left: pos.left, width: pos.width }}>
            {filtrate.length > 0 ? filtrate.map((n) => (
                <button key={n} type="button"
                    onMouseDown={(e) => { e.preventDefault(); scegli(n); }}
                    className={`block w-full text-left px-3.5 py-2.5 text-sm transition-colors hover:bg-indigo-500/20 ${n === value ? "text-indigo-300 font-bold" : "text-slate-100"}`}>
                    {n}
                </button>
            )) : (
                <div className="px-3.5 py-2.5 text-sm text-slate-500">{vuotoMsg}</div>
            )}
        </div>
    ) : null;

    return (
        <div ref={box} className="relative">
            <div className="relative">
                <input
                    value={testo} disabled={disabled}
                    onChange={(e) => { setTesto(e.target.value); setAperta(true); if (e.target.value.trim() === "") onChange(""); }}
                    onFocus={() => setAperta(true)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); if (filtrate[0]) scegli(filtrate[0]); }
                        if (e.key === "Escape") { setAperta(false); setTesto(value); }
                    }}
                    placeholder={placeholder}
                    className={className || "glass-input w-full text-sm"}
                />
                {value && !disabled && (
                    <button type="button" onClick={() => { onChange(""); setTesto(""); setAperta(false); }}
                        title="Svuota" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs">✕</button>
                )}
            </div>
            {aperta && typeof document !== "undefined" && menuBody && createPortal(menuBody, document.body)}
        </div>
    );
}

/** Variante MULTI-SELEZIONE (Luca 30/07): stessa estetica e stesso modo d'uso
 *  — si scrive per filtrare o si clicca — ma le voci scelte si SOMMANO e
 *  compaiono come chips sotto il campo (click sulla chip per toglierla).
 *  Nessuna selezione = nessun filtro. */
export function SelectMulti({
    values, onChange, opzioni, placeholder = "Tutti — scrivi per filtrare", className = "",
    vuotoMsg = "Nessuna voce corrispondente", disabled = false,
}: {
    values: string[];
    onChange: (v: string[]) => void;
    opzioni: readonly string[];
    placeholder?: string;
    className?: string;
    vuotoMsg?: string;
    disabled?: boolean;
}) {
    const [testo, setTesto] = useState("");
    const [aperta, setAperta] = useState(false);
    const box = useRef<HTMLDivElement | null>(null);
    const menu = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

    useEffect(() => {
        const h = (e: MouseEvent) => {
            const t = e.target as Node;
            if (box.current && !box.current.contains(t) && !(menu.current && menu.current.contains(t))) {
                setAperta(false); setTesto("");
            }
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);

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

    const q = testo.trim().toLowerCase();
    const filtrate = !aperta ? [] : opzioni.filter((n) => {
        if (!q) return true;
        const nome = n.toLowerCase();
        if (nome.includes(q)) return true;
        const parole = nome.split(/\s+/);
        return q.split(/\s+/).every((t) => parole.some((p) => p.startsWith(t)));
    }).slice(0, 12);

    const toggle = (n: string) => {
        onChange(values.includes(n) ? values.filter((x) => x !== n) : [...values, n]);
        setTesto("");
    };

    const menuBody = pos ? (
        <div ref={menu}
            className="select-persona-menu fixed z-[4000] max-h-72 overflow-y-auto rounded-xl border border-white/15 bg-[#161a2c] shadow-2xl shadow-black/60 divide-y divide-white/5"
            style={{ top: pos.top, left: pos.left, width: pos.width }}>
            {filtrate.length > 0 ? filtrate.map((n) => {
                const sel = values.includes(n);
                return (
                    <button key={n} type="button"
                        onMouseDown={(e) => { e.preventDefault(); toggle(n); }}
                        className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors hover:bg-indigo-500/20 flex items-center gap-2 ${sel ? "text-indigo-300 font-bold" : "text-slate-100"}`}>
                        <span className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center text-[9px] ${sel ? "border-indigo-400 bg-indigo-500/40" : "border-slate-600"}`}>{sel ? "✓" : ""}</span>
                        {n}
                    </button>
                );
            }) : (
                <div className="px-3.5 py-2.5 text-sm text-slate-500">{vuotoMsg}</div>
            )}
        </div>
    ) : null;

    return (
        <div ref={box} className="relative">
            <input
                value={testo} disabled={disabled}
                onChange={(e) => { setTesto(e.target.value); setAperta(true); }}
                onFocus={() => { if (!disabled) setAperta(true); }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); if (filtrate[0]) toggle(filtrate[0]); }
                    if (e.key === "Escape") { setAperta(false); setTesto(""); }
                }}
                placeholder={values.length ? `${values.length} selezionat${values.length === 1 ? "o" : "i"} — aggiungi…` : placeholder}
                className={(className || "glass-input w-full text-sm") + (disabled ? " disabled:opacity-50" : "")}
            />
            {values.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                    {values.map((v) => (
                        <button key={v} type="button" onClick={() => toggle(v)} title="Togli dal filtro"
                            className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-500/15 border border-indigo-500/40 text-indigo-200 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-200 transition-colors">
                            {v} ✕
                        </button>
                    ))}
                </div>
            )}
            {aperta && typeof document !== "undefined" && menuBody && createPortal(menuBody, document.body)}
        </div>
    );
}
