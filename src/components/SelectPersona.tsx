"use client";

/* TENDINA-CON-SCRITTURA per i COLLABORATORI (Luca 29/07): ovunque si
   seleziona una persona si può anche SCRIVERE — iniziali del nome o del
   cognome — e la lista si filtra al volo (con 40+ collaboratori scorrere
   è una pena). Drop-in al posto di una <select>: value/onChange a stringa.
   Enter = primo risultato; ✕ = svuota; blur ripristina il valore scelto. */

import { useEffect, useRef, useState } from "react";

export function SelectPersona({
    value, onChange, opzioni, placeholder = "Scrivi o scegli…", className = "", disabled = false,
}: {
    value: string;
    onChange: (v: string) => void;
    opzioni: string[];
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}) {
    const [testo, setTesto] = useState(value);
    const [aperta, setAperta] = useState(false);
    const box = useRef<HTMLDivElement | null>(null);

    // il valore scelto fuori si riflette dentro (es. reset dei filtri)
    useEffect(() => { setTesto(value); }, [value]);

    // chiusura al click fuori
    useEffect(() => {
        const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) { setAperta(false); setTesto(value); } };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [value]);

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
            {/* Tendina leggibile (Luca 30/07: "si vede malissimo"): righe piu'
                alte, testo a misura normale, fondo con contrasto e bordo netto;
                la classe select-persona-menu porta la variante del tema chiaro. */}
            {aperta && filtrate.length > 0 && (
                <div className="select-persona-menu absolute z-[1300] mt-1.5 w-full min-w-[230px] max-h-72 overflow-y-auto rounded-xl border border-white/15 bg-[#161a2c] shadow-2xl shadow-black/60 divide-y divide-white/5">
                    {filtrate.map((n) => (
                        <button key={n} type="button"
                            onMouseDown={(e) => { e.preventDefault(); scegli(n); }}
                            className={`block w-full text-left px-3.5 py-2.5 text-sm transition-colors hover:bg-indigo-500/20 ${n === value ? "text-indigo-300 font-bold" : "text-slate-100"}`}>
                            {n}
                        </button>
                    ))}
                </div>
            )}
            {aperta && filtrate.length === 0 && q && (
                <div className="select-persona-menu absolute z-[1300] mt-1.5 w-full rounded-xl border border-white/15 bg-[#161a2c] shadow-2xl px-3.5 py-2.5 text-sm text-slate-500">
                    Nessun collaboratore corrispondente
                </div>
            )}
        </div>
    );
}
