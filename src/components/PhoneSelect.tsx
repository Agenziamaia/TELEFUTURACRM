"use client";

import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Check, Loader2 } from "lucide-react";
import { cn } from "@/utils";
import { nomeDispositivo } from "@/lib/nomeDispositivo";

type PhoneOption = { brand: string; model: string; label: string };

export function PhoneSelect({
    value = "",
    onChange = () => { },
    placeholder = "es. Samsung S25 Ultra",
    className,
}: {
    value?: string;
    onChange?: (val: string) => void;
    placeholder?: string;
    className?: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [phones, setPhones] = useState<PhoneOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Initial load of phones data
    useEffect(() => {
        setIsLoading(true);
        fetch('/api/smartphones')
            .then(res => res.json())
            .then(data => {
                if (!data.error) {
                    const allPhones = Object.entries(data as Record<string, string[]>).flatMap(([brand, models]) =>
                        /* ⚠️ 38 delle 222 voci del catalogo portano già la marca dentro
                           il modello («Xiaomi» + «Xiaomi 15 Ultra»): composte a mano
                           diventavano «Xiaomi Xiaomi 15 Ultra», e da qui il nome doppio
                           finiva dritto nel modulo che il cliente firma. */
                        models.map(model => ({ brand, model, label: nomeDispositivo(brand, model) }))
                    );
                    setPhones(allPhones);
                }
            })
            .catch(err => console.error("Failed to fetch smartphones:", err))
            .finally(() => setIsLoading(false));
    }, []);

    // Sync search term with value when opened/closed if needed, but it's easier
    // to just let searchTerm be independent for filtering.

    // Find if the current value matches a phone
    const currentPhone = phones.find(p => p.model === value || p.label === value);
    const displayValue = currentPhone ? currentPhone.label : value;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setSearchTerm("");
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredPhones = phones.filter(phone =>
        phone.label.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 50); // limit to top 50 matches for performance

    return (
        <div ref={containerRef} className={cn("relative w-full", className)}>
            <div
                className={cn(
                    "flex flex-col justify-center glass-input w-full min-h-[38px] py-1.5 px-3 cursor-text text-sm transition-all",
                    isOpen && "border-indigo-500/50 bg-white/[0.05]"
                )}
                onClick={() => {
                    if (!isOpen) {
                        setIsOpen(true);
                        setSearchTerm(""); // start fresh search when opening
                    }
                }}
            >
                <div className="flex items-center justify-between w-full">
                    {isOpen ? (
                        <div className="flex items-center w-full gap-2">
                            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <input
                                type="text"
                                className="bg-transparent border-none outline-none w-full text-white placeholder:text-slate-500 p-0 text-sm"
                                placeholder="Cerca tra i modelli..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                        </div>
                    ) : (
                        <>
                            <span className={cn("truncate", displayValue ? "text-white" : "text-slate-400")}>
                                {displayValue || placeholder}
                            </span>
                            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                        </>
                    )}
                </div>
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl border border-white/10 bg-[#0f111a] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    <div className="max-h-64 overflow-y-auto custom-scrollbar p-1.5">
                        {filteredPhones.length > 0 ? (
                            filteredPhones.map((phone: PhoneOption, i: number) => {
                                const isSelected = value === phone.model || value === phone.label;
                                return (
                                    <button
                                        key={`${phone.brand}-${phone.model}-${i}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onChange(phone.model);
                                            setIsOpen(false);
                                            setSearchTerm("");
                                        }}
                                        className={cn(
                                            "w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center justify-between mb-0.5",
                                            isSelected ? "bg-indigo-500/20 text-indigo-300" : "text-slate-300 hover:text-white hover:bg-white/5"
                                        )}
                                    >
                                        <span>
                                            <span className="text-slate-500 mr-2 font-medium">{phone.brand}</span>
                                            {phone.model}
                                        </span>
                                        {isSelected && <Check className="w-3.5 h-3.5" />}
                                    </button>
                                );
                            })
                        ) : (
                            <div className="p-4 text-center text-sm text-slate-500">
                                Nessun modello trovato.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
