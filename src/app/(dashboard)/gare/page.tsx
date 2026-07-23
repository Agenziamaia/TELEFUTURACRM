"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Trophy, ArrowLeft, ChevronLeft, ChevronRight, CalendarDays, Building2, Users } from "lucide-react";
import { cn } from "@/utils";
import { ToastHost } from "../amministrazione/_views/toast";
import { addMonths, monthLabel, currentMonthKey } from "../amministrazione/_views/months";
import { AziendaTab } from "./_views/azienda";
import { RagazziTab } from "./_views/ragazzi";
import { RAGAZZI_GARA } from "./_views/shared";

/* GARE — le condizioni degli operatori (lato AZIENDA) e la gara interna della squadra
   (lato RAGAZZI), per brand e per mese. I due lati si modificano separatamente. */

// Loghi e colori come in Registra Contratto (stessa rappresentazione)
const GARE_BRANDS = [
    { id: "w3", label: "WindTre", desc: "Soglie e commissioning dei franchising Wind3.", color: "#FF6B00", logo: "/windtre.png" },
    { id: "vs", label: "Vodafone Store", desc: "Soglie e commissioning dei Vodafone Store.", color: "#E60000", logo: "/vodaphone - Copy.png" },
    { id: "vnd", label: "Vodafone VND", desc: "Target Vodafone dei negozi multi brand (gestione VND).", color: "#E60000", logo: "/vodaphone - Copy.png" },
    { id: "fastweb", label: "Fastweb", desc: "Target Fastweb dei multi brand (nessun franchising).", color: "#CC9900", logo: "/fastweb.png" },
    { id: "sky", label: "Sky", desc: "Soglie e commissioning Sky.", color: "#0072C6", logo: "/sky.png" },
    { id: "s4", label: "S4 Energy", desc: "Soglie e commissioning energia S4.", color: "#28a745", logo: "/energy - Copy.png" },
    { id: "tim", label: "TIM", desc: "Soglie e commissioning Tim.", color: "#0050FF", logo: "/tim-logo-v2.png" },
    { id: "dojo", label: "Dojo", desc: "Soglie e commissioning POS Dojo.", color: "#14b8a6", logo: "/dojo - Copy.png" },
] as const;

export default function GarePage() {
    return (
        <Suspense>
            <GareInner />
        </Suspense>
    );
}

function GareInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const brandId = searchParams.get("brand");
    const brand = GARE_BRANDS.find((b) => b.id === brandId);
    const lato = searchParams.get("lato") === "ragazzi" ? "ragazzi" : "azienda";
    const go = (b?: string, l?: string) => router.push(b ? `/gare?brand=${b}${l ? `&lato=${l}` : ""}` : "/gare");
    const [month, setMonth] = useState(currentMonthKey());
    const rag = brand ? RAGAZZI_GARA[brand.id] : null;

    return (
        <div className="space-y-6">
            <ToastHost />
            {/* Header */}
            <div>
                {brand && (
                    <button onClick={() => go()} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-1">
                        <ArrowLeft className="w-3.5 h-3.5" /> Gare
                    </button>
                )}
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                    {brand ? (
                        <>
                            <Image src={brand.logo} alt={brand.label} width={140} height={40} className="h-9 w-auto object-contain" />
                            <span>
                                Gare · <span style={{ color: brand.color }}>{brand.label}</span>
                            </span>
                        </>
                    ) : (
                        <>
                            <Trophy className="w-6 h-6 text-amber-400" /> Gare
                        </>
                    )}
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                    {brand
                        ? brand.desc
                        : "Le condizioni degli operatori (lato azienda) e la gara interna della squadra (lato ragazzi), brand per brand, mese per mese."}
                </p>
            </div>

            {!brand ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {GARE_BRANDS.map((b) => (
                        <button
                            key={b.id}
                            onClick={() => go(b.id)}
                            className="p-4 rounded-xl border-2 border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] transition-colors text-center"
                        >
                            <div className="flex items-center justify-center h-14 mb-3">
                                <Image src={b.logo} alt={b.label} width={180} height={56} className="h-14 w-auto max-w-[85%] object-contain" />
                            </div>
                            <p className="font-extrabold text-[15px]" style={{ color: b.color }}>
                                {b.label}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{b.desc}</p>
                        </button>
                    ))}
                </div>
            ) : (
                <>
                    {/* Barra mese + tab lato */}
                    <div className="glass-panel px-4 py-2.5 flex flex-wrap items-center gap-3">
                        <CalendarDays className="w-4 h-4 text-indigo-400" />
                        <button onClick={() => setMonth(addMonths(month, -1))} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-semibold text-white min-w-[130px] text-center">{monthLabel(month)}</span>
                        <button onClick={() => setMonth(addMonths(month, 1))} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        {month === currentMonthKey() && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">mese corrente</span>
                        )}
                        <div className="flex gap-1.5 ml-auto">
                            <button
                                onClick={() => go(brand.id, "azienda")}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                                    lato === "azienda" ? "bg-amber-500/15 text-amber-300" : "text-slate-400 hover:bg-white/5",
                                )}
                            >
                                <Building2 className="w-3.5 h-3.5" /> Azienda
                            </button>
                            <button
                                onClick={() => go(brand.id, "ragazzi")}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                                    lato === "ragazzi" ? "bg-indigo-500/15 text-indigo-300" : "text-slate-400 hover:bg-white/5",
                                )}
                            >
                                <Users className="w-3.5 h-3.5" /> Ragazzi
                            </button>
                        </div>
                    </div>

                    {lato === "azienda" ? (
                        <AziendaTab key={`${brand.id}|${month}|az`} brand={brand.id} month={month} />
                    ) : (
                        <RagazziTab key={`${rag!.id}|${month}|rag`} garaId={rag!.id} month={month} nota={rag!.nota} />
                    )}
                </>
            )}
        </div>
    );
}
