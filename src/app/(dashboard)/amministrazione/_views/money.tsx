"use client";

import { useState, useRef, useLayoutEffect } from "react";
import { cn } from "@/utils";

/* Input importi in €: mostra il simbolo nel riquadro e formatta in stile it-IT
   (migliaia col punto, decimali con la virgola, max 2) anche MENTRE si digita,
   preservando la posizione del cursore. Il valore esposto è il numero puro. */

// tiene cifre e la prima virgola, max 2 decimali ("2.800,509" -> "2800,50")
function parseClean(raw: string): string {
    let s = raw.replace(/[^\d,]/g, "");
    const i = s.indexOf(",");
    if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, "").slice(0, 2);
    return s;
}

// "2800,5" -> "2.800,5"
function fmtClean(clean: string): string {
    if (!clean) return "";
    const [int, dec] = clean.split(",");
    const intFmt = int ? Number(int).toLocaleString("it-IT", { maximumFractionDigits: 0 }) : "0";
    return dec !== undefined ? `${intFmt},${dec}` : intFmt;
}

function fmtNum(v: number | null | undefined): string {
    if (v == null || isNaN(v)) return "";
    return fmtClean(String(v).replace(".", ","));
}

function toNumber(clean: string): number | null {
    if (!clean || clean === ",") return null;
    const n = Number(clean.replace(",", "."));
    return isNaN(n) ? null : n;
}

// posizione del cursore nel testo formattato dopo `sig` caratteri significativi (cifre/virgola)
function caretPos(text: string, sig: number): number {
    if (sig <= 0) return 0;
    let count = 0;
    for (let i = 0; i < text.length; i++) {
        if (/[\d,]/.test(text[i])) count++;
        if (count >= sig) return i + 1;
    }
    return text.length;
}

export function MoneyInput({
    value,
    onChange,
    onCommit,
    className,
    wrapClass,
    placeholder = "—",
    title,
    autoFocus,
}: {
    value: number | null;
    onChange: (v: number | null) => void;
    onCommit?: () => void; // chiamato al blur (per i salvataggi on-blur esistenti)
    className?: string;
    wrapClass?: string;
    placeholder?: string;
    title?: string;
    autoFocus?: boolean;
}) {
    const ref = useRef<HTMLInputElement>(null);
    const caretRef = useRef<number | null>(null);
    const [text, setText] = useState(() => fmtNum(value));
    const [focused, setFocused] = useState(false);

    // riallinea il testo quando il valore cambia da fuori (non mentre si scrive):
    // aggiustamento di stato durante il render, niente effect
    const [prevValue, setPrevValue] = useState<number | null>(value);
    if (!focused && value !== prevValue) {
        setPrevValue(value);
        setText(fmtNum(value));
    }

    useLayoutEffect(() => {
        if (caretRef.current != null && ref.current) {
            const pos = caretPos(text, caretRef.current);
            ref.current.setSelectionRange(pos, pos);
            caretRef.current = null;
        }
    }, [text]);

    return (
        <span className={cn("relative inline-block", wrapClass)}>
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-500 pointer-events-none">€</span>
            <input
                ref={ref}
                type="text"
                inputMode="decimal"
                value={text}
                title={title}
                placeholder={placeholder}
                autoFocus={autoFocus}
                onChange={(e) => {
                    const el = e.target;
                    const caret = el.selectionStart ?? el.value.length;
                    const sig = el.value.slice(0, caret).replace(/[^\d,]/g, "").length;
                    const clean = parseClean(el.value);
                    caretRef.current = sig;
                    setText(fmtClean(clean));
                    onChange(toNumber(clean));
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                    setFocused(false);
                    // normalizza (es. virgola penzolante "2.800," -> "2.800")
                    setText(fmtClean(parseClean(text).replace(/,$/, "")));
                    onCommit?.();
                }}
                className={cn("glass-input w-full pl-7 pr-2 text-right", className)}
            />
        </span>
    );
}
