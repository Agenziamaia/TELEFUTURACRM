"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/utils";

export type StatusType = "success" | "warning" | "error" | "info";

export interface StatusOption {
    label: string;
    type: StatusType;
    isAutomatic?: boolean;
    agentCanEdit?: boolean;
    agentCanView?: boolean;
}

export const STATUS_OPTIONS: StatusOption[] = [
    // Stato INIZIALE del flusso outbound (Luca 03/08): lo scrive Invia PDA,
    // da qui il back office la lavora in Gestione PDA
    { label: "PDA Inviata", type: "info", isAutomatic: true, agentCanEdit: false, agentCanView: true },
    // Automatic statuses
    { label: "Assegnata", type: "info", isAutomatic: true, agentCanEdit: false, agentCanView: true },
    { label: "Ricevuta", type: "info", isAutomatic: true, agentCanEdit: false, agentCanView: true },
    // Back Office statuses (Success)
    { label: "Attivato", type: "success", agentCanEdit: false, agentCanView: true },
    { label: "Inserito", type: "success", agentCanEdit: false, agentCanView: true },
    // Back Office statuses (Warning/Suspended)
    { label: "Sospeso Dati Errati", type: "warning", agentCanEdit: false, agentCanView: true },
    { label: "Sospeso Mancanza di Documento", type: "warning", agentCanEdit: false, agentCanView: true },
    { label: "Sospeso", type: "warning", agentCanEdit: false, agentCanView: true },
    // Back Office statuses (Error/KO)
    { label: "KO Credito", type: "error", agentCanEdit: false, agentCanView: true },
    { label: "KO Doc Mai Arrivata", type: "error", agentCanEdit: false, agentCanView: true },
    { label: "KO", type: "error", agentCanEdit: false, agentCanView: true },
];

export const getStatusColor = (label: string) => {
    const opt = STATUS_OPTIONS.find(o => o.label === label);
    if (!opt) return "text-slate-300 bg-white/5 border-white/10";

    switch (opt.type) {
        case "success": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
        case "warning": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
        case "error": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
        case "info": return "text-blue-400 bg-blue-500/10 border-blue-500/20";
        default: return "text-slate-300 bg-white/5 border-white/10";
    }
};

interface StatusDropdownProps {
    value: string;
    onChange?: (val: string) => void;
    className?: string;
    isAgent?: boolean;
}

export function StatusDropdown({ value, onChange, className, isAgent = false }: StatusDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selected, setSelected] = useState(value);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (option: string) => {
        setSelected(option);
        setIsOpen(false);
        if (onChange) onChange(option);
    };

    const colorClass = getStatusColor(selected);

    const currentOpt = STATUS_OPTIONS.find(o => o.label === selected);

    // Determine if the dropdown should be disabled
    // It's disabled if the user is an agent (agents can never edit statuses according to the spec)
    // Or if it's an automatic status and we want to enforce that even BO can't manually set it back to Assegnata/Ricevuta easily
    // However, the spec says "statuses settable only by Back Office users", implying BO CAN change from/to manually settable ones.
    const isDisabled = isAgent;

    return (
        <div className={cn("relative w-full min-w-[180px]", className)} ref={containerRef}>
            <button
                type="button"
                onClick={() => !isDisabled && setIsOpen(!isOpen)}
                disabled={isDisabled}
                className={cn(
                    "flex items-center justify-between w-full text-xs font-semibold py-1.5 px-3 h-8 rounded-md border transition-all text-left",
                    colorClass,
                    isOpen && "ring-2 ring-indigo-500/50",
                    isDisabled && "opacity-80 cursor-default"
                )}
            >
                <span className="truncate pr-2">{selected}</span>
                {!isDisabled && <ChevronDown className={cn("w-3.5 h-3.5 opacity-70 shrink-0 transition-transform", isOpen && "rotate-180")} />}
            </button>

            {isOpen && !isDisabled && (
                <div className="absolute z-50 left-0 top-full w-[280px] mt-1 bg-[#161925]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-xl shadow-black/60 py-1 max-h-64 overflow-y-auto">
                    {STATUS_OPTIONS.filter(opt => !isAgent || opt.agentCanView).map((opt) => {
                        // For Back Office, maybe prevent selecting automatic statuses manually?
                        // The spec says "Automatic statuses (set by the system, not manually selectable)"
                        const isOptionDisabled = !isAgent && opt.isAutomatic && opt.label !== selected;

                        return (
                            <button
                                key={opt.label}
                                type="button"
                                disabled={isOptionDisabled}
                                onClick={() => !isOptionDisabled && handleSelect(opt.label)}
                                className={cn(
                                    "flex items-center w-full px-3 py-2 text-xs text-left transition-colors",
                                    selected === opt.label ? "bg-white/10 font-bold" : "font-medium",
                                    isOptionDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-white/5"
                                )}
                            >
                                <span className={cn(
                                    "flex-1",
                                    opt.type === "success" ? "text-emerald-400" :
                                        opt.type === "warning" ? "text-amber-400" :
                                            opt.type === "info" ? "text-blue-400" :
                                                "text-rose-400"
                                )}>
                                    {opt.label}
                                </span>
                                {selected === opt.label && <Check className="w-3.5 h-3.5 ml-2 opacity-70" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
