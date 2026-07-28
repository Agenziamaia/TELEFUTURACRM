"use client";

/* AUTOCOMPLETE INDIRIZZI (Luca 28/07) — regola di piattaforma: OVUNQUE si
   compila un indirizzo, si scrive via + civico, si SCEGLIE dalla lista e
   CAP + comune si compilano DA SOLI. La scrittura a mano resta possibile
   solo come ripiego (indirizzo non trovato): il campo è sempre testo libero
   e i campi CAP/città restano editabili.
   Motore: /api/geo/indirizzi (Photon/OpenStreetMap, bias Roma). Se il civico
   non è censito su OSM, si tiene quello DIGITATO dall'utente. */

import { useEffect, useRef, useState } from "react";

export interface IndirizzoScelto {
    indirizzo: string;   // "Via Appia Nuova 103"
    via: string;
    civico: string;
    cap: string;
    citta: string;
    completo: string;    // "Via Appia Nuova 103, 00174 Roma" (per i campi unici)
}

type Suggerimento = { label: string; via: string; civico: string; cap: string; citta: string };

/** ultimo numero civico digitato (ignora i CAP a 5 cifre) */
function civicoDigitato(testo: string): string {
    const m = String(testo).match(/\b(\d{1,4}(?:\s*\/?\s*[a-zA-Z])?)\b(?!.*\b\d{1,4}\b)/);
    const v = (m?.[1] || "").replace(/\s+/g, "");
    return v && v.replace(/\D/g, "").length < 5 ? v : "";
}

export function IndirizzoAutocomplete({
    value, onChange, onPick, placeholder = "Via e numero civico…", className = "", inputStyle, disabled = false,
}: {
    value: string;
    onChange: (v: string) => void;
    onPick: (sel: IndirizzoScelto) => void;
    placeholder?: string;
    className?: string;
    inputStyle?: React.CSSProperties;   // per le pagine a stili inline (registra)
    disabled?: boolean;
}) {
    const [aperta, setAperta] = useState(false);
    const [righe, setRighe] = useState<Suggerimento[]>([]);
    const [cerco, setCerco] = useState(false);
    const box = useRef<HTMLDivElement | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ctrl = useRef<AbortController | null>(null);
    const scelto = useRef<string>("");   // l'ultimo valore APPLICATO da un pick: non riaprire su di lui

    useEffect(() => {
        const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setAperta(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);

    // ricerca con debounce mentre si digita
    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        const q = value.trim();
        if (q.length < 4 || q === scelto.current) { setRighe([]); setCerco(false); return; }
        setCerco(true);
        timer.current = setTimeout(async () => {
            ctrl.current?.abort();
            ctrl.current = new AbortController();
            try {
                const res = await fetch("/api/geo/indirizzi?q=" + encodeURIComponent(q), { signal: ctrl.current.signal });
                const data = await res.json();
                setRighe((data?.risultati ?? []) as Suggerimento[]);
                setAperta(true);
            } catch { /* rete giù: si continua a mano */ }
            setCerco(false);
        }, 350);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

    const scegli = (r: Suggerimento) => {
        const civico = r.civico || civicoDigitato(value);
        const indirizzo = `${r.via}${civico ? " " + civico : ""}`.trim();
        const completo = `${indirizzo}${r.cap || r.citta ? ", " + [r.cap, r.citta].filter(Boolean).join(" ") : ""}`;
        scelto.current = indirizzo;
        setAperta(false); setRighe([]);
        onPick({ indirizzo, via: r.via, civico, cap: r.cap, citta: r.citta, completo });
    };

    return (
        <div ref={box} className="relative">
            <input
                value={value} disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => { if (righe.length) setAperta(true); }}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && aperta && righe[0]) { e.preventDefault(); scegli(righe[0]); }
                    if (e.key === "Escape") setAperta(false);
                }}
                placeholder={placeholder}
                className={inputStyle ? undefined : (className || "glass-input w-full")}
                style={inputStyle}
            />
            {cerco && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">cerco…</span>}
            {aperta && righe.length > 0 && (
                <div className="absolute z-[1300] mt-1 w-full min-w-[260px] rounded-lg border border-white/10 bg-[#0f111a] shadow-2xl overflow-hidden">
                    {righe.map((r) => {
                        const civ = r.civico || civicoDigitato(value);
                        return (
                            <button key={r.label} type="button"
                                onMouseDown={(e) => { e.preventDefault(); scegli(r); }}
                                className="block w-full text-left px-3 py-2 hover:bg-indigo-500/15">
                                <span className="text-xs text-slate-100 font-semibold">{r.via}{civ ? ` ${civ}` : ""}</span>
                                <span className="text-[11px] text-slate-500 ml-2">{[r.cap, r.citta].filter(Boolean).join(" ")}</span>
                            </button>
                        );
                    })}
                    <p className="px-3 py-1.5 text-[10px] text-slate-600 border-t border-white/5">Non c&apos;è? Continua a scrivere a mano (anche CAP e città).</p>
                </div>
            )}
        </div>
    );
}
