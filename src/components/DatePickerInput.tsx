"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { format, parse, isValid } from "date-fns";
import { it } from "date-fns/locale";
import { Calendar } from "lucide-react";
import { cn } from "@/utils";

interface DatePickerInputProps {
    id?: string;
    name?: string;
    placeholder?: string;
    value?: string;
    onChange?: (val: string) => void;
    className?: string;
}

export function DatePickerInput({
    id,
    name,
    placeholder = "inserire data",
    value,
    onChange,
    className,
}: DatePickerInputProps) {
    const [mounted, setMounted] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [inputText, setInputText] = useState(value ?? "");
    const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
    // Position of the popup (fixed, relative to viewport)
    const [popupStyle, setPopupStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setMounted(true); }, []);

    // Il parent può resettare `value` dall'esterno (es. "Annulla filtri" in
    // Ricerca Vendite, esito Luca 12/08): senza questa sync il campo
    // continuava a MOSTRARE la data vecchia anche a filtro ormai svuotato.
    useEffect(() => { setInputText(value ?? ""); }, [value]);

    useEffect(() => {
        if (!inputText) { setSelectedDay(undefined); return; }
        const parsed = parse(inputText, "dd/MM/yyyy", new Date());
        if (isValid(parsed)) setSelectedDay(parsed);
    }, [inputText]);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            // Check if click is inside the container OR the portal popup
            const popup = document.getElementById("rdp-portal-popup");
            if (
                containerRef.current && !containerRef.current.contains(e.target as Node) &&
                popup && !popup.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const openCalendar = () => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        setPopupStyle({
            top: rect.bottom + window.scrollY + 4,
            left: rect.left + window.scrollX,
        });
        setIsOpen((p) => !p);
    };

    const handleDaySelect = (day: Date | undefined) => {
        if (!day) return;
        const formatted = format(day, "dd/MM/yyyy");
        setInputText(formatted);
        setSelectedDay(day);
        setIsOpen(false);
        onChange?.(formatted);
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputText(e.target.value);
        onChange?.(e.target.value);
    };

    return (
        <div className={cn("relative", className)} ref={containerRef}>
            <div className="flex items-stretch">
                <button
                    type="button"
                    tabIndex={-1}
                    className="flex items-center justify-center px-3 bg-slate-900/50 border border-r-0 border-white/[0.08] rounded-l-lg text-slate-500 hover:text-slate-300 transition-colors"
                    onClick={openCalendar}
                >
                    <Calendar className="w-4 h-4" />
                </button>
                <input
                    id={id}
                    name={name}
                    type="text"
                    placeholder={placeholder}
                    value={inputText}
                    onChange={handleTextChange}
                    onFocus={openCalendar}
                    autoComplete="off"
                    className="glass-input rounded-l-none flex-1 w-full"
                />
            </div>

            {/* Render popup via portal so it is never clipped by parent overflow */}
            {mounted && isOpen && createPortal(
                <div
                    id="rdp-portal-popup"
                    style={{
                        position: "absolute",
                        top: popupStyle.top,
                        left: popupStyle.left,
                        zIndex: 9999,
                    }}
                    className="rdp-popup bg-[#161925]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl shadow-black/60 p-3"
                >
                    <DayPicker
                        mode="single"
                        selected={selectedDay}
                        onSelect={handleDaySelect}
                        locale={it}
                        weekStartsOn={1}
                        showOutsideDays
                    />
                </div>,
                document.body
            )}
        </div>
    );
}
