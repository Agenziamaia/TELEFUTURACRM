"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Trophy, ArrowLeft, ChevronLeft, ChevronRight, CalendarDays, Building2, Users, ClipboardList, Target, Compass, Layers } from "lucide-react";
import { cn } from "@/utils";
import { ToastHost } from "../amministrazione/_views/toast";
import { addMonths, monthLabel, currentMonthKey } from "../amministrazione/_views/months";
import { AziendaTab } from "./_views/azienda";
import { RagazziTab } from "./_views/ragazzi";
import { RAGAZZI_GARA } from "./_views/shared";
import { TargetSection } from "../amministrazione/_views/target";
import { DashboardTargetAdmin } from "@/components/DashboardTargetAdmin";
import { DirezioneInserimentoAdmin } from "@/components/DirezioneInserimento";

/* GARE — le condizioni degli operatori (lato AZIENDA) e la gara interna della squadra
   (lato RAGAZZI), per brand e per mese. RIORDINO (Luca 03/08): i brand vivono nel
   sub-hub OPERATORI; Target, Obiettivi Home e Direzione Inserimento sono arrivati
   qui dall'hub Amministrazione (stesse viste, solo casa nuova). */

// Loghi e colori come in Registra Contratto (stessa rappresentazione)
const GARE_BRANDS = [
    { id: "w3", label: "WindTre", desc: "Soglie e commissioning dei franchising Wind3.", color: "var(--tf-ff6b00)", logo: "/windtre.png" },
    { id: "vs", label: "Vodafone Store", desc: "Soglie e commissioning dei Vodafone Store.", color: "var(--tf-e60000)", logo: "/vodaphone - Copy.png" },
    { id: "vnd", label: "Vodafone VND", desc: "Target Vodafone dei negozi multi brand (gestione VND).", color: "var(--tf-e60000)", logo: "/vodaphone - Copy.png" },
    { id: "fastweb", label: "Fastweb", desc: "Target Fastweb dei multi brand (nessun franchising).", color: "var(--tf-cc9900)", logo: "/fastweb.png" },
    { id: "sky", label: "Sky", desc: "Soglie e commissioning Sky.", color: "var(--tf-0072c6)", logo: "/sky.png" },
    { id: "s4", label: "S4", desc: "Soglie e commissioning energia S4.", color: "var(--tf-28a745)", logo: "/energy - Copy.png" },
    { id: "tim", label: "TIM", desc: "Soglie e commissioning Tim.", color: "var(--tf-0050ff)", logo: "/tim-logo-v2.png" },
    { id: "dojo", label: "Dojo", desc: "Soglie e commissioning POS Dojo.", color: "var(--tf-14b8a6)", logo: "/dojo-round.png" },
] as const;

// le sezioni di GESTIONE traslocate dall'Amministrazione (Luca 03/08)
const GARE_GESTIONE = [
    { id: "target", label: "Target", icon: ClipboardList, desc: "Gare e target per personale, ruoli, negozi e categorie; paletti e sblocco commissioning." },
    { id: "obiettivi", label: "Obiettivi Home", icon: Target, desc: "Target contratti del mese per rete, negozio e venditore — la barra 'Obiettivo' nella Home." },
    { id: "direzione", label: "Direzione Inserimento", icon: Compass, desc: "Mappa, per ogni negozio, su quale codice inserire ogni brand/categoria — alimenta la bussola in Home (sola lettura)." },
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
    const gestione = GARE_GESTIONE.find((g) => g.id === brandId);
    const lato = searchParams.get("lato") === "ragazzi" ? "ragazzi" : "azienda";
    const go = (b?: string, l?: string) => router.push(b ? `/gare?brand=${b}${l ? `&lato=${l}` : ""}` : "/gare");
    const [month, setMonth] = useState(currentMonthKey());
    const rag = brand ? RAGAZZI_GARA[brand.id] : null;
    const GestIcon = gestione?.icon;

    return (
        <div className="space-y-6">
            <ToastHost />
            {/* Header */}
            <div>
                {(brand || gestione) && (
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
                    ) : gestione && GestIcon ? (
                        <>
                            <GestIcon className="w-6 h-6 text-indigo-400" /> Gare · {gestione.label}
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
                        : gestione
                            ? gestione.desc
                            : "Gli operatori (condizioni azienda e gara dei ragazzi), i target, gli obiettivi Home e la direzione inserimento."}
                </p>
            </div>

            {gestione ? (
                gestione.id === "target" ? <TargetSection />
                    : gestione.id === "obiettivi" ? <DashboardTargetAdmin />
                        : <DirezioneInserimentoAdmin />
            ) : !brand ? (
                <>
                    {/* OPERATORI: i brand, riuniti (Luca 03/08) */}
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-300 uppercase tracking-widest">
                        <Layers className="w-4 h-4 text-amber-400" /> Operatori
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {GARE_BRANDS.map((b) => (
                            <button
                                key={b.id}
                                onClick={() => go(b.id)}
                                title={b.label}
                                className="p-4 rounded-xl border-2 border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] transition-colors text-center"
                            >
                                {/* SOLO il logo, grande (pattern Registra Vendita, Luca 04/08):
                                    il nome del brand e' gia' nel logo; label e desc restano
                                    nell'array per l'header interno */}
                                <div className="flex items-center justify-center h-[88px]">
                                    <Image src={b.logo} alt={b.label} width={260} height={88} className="h-[84px] w-auto max-w-[92%] object-contain" />
                                </div>
                                {/* le due Vodafone condividono il logo: mini-badge discreto
                                    SOLO per loro, altrimenti tessere indistinguibili (Luca 04/08) */}
                                {(b.id === "vs" || b.id === "vnd") && (
                                    <p className="mt-1.5 text-[10px] font-bold tracking-[0.2em] text-slate-500">
                                        {b.id === "vs" ? "STORE" : "VND"}
                                    </p>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* GESTIONE: le sezioni arrivate dall'Amministrazione (Luca 03/08) */}
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-300 uppercase tracking-widest pt-2">
                        <ClipboardList className="w-4 h-4 text-indigo-400" /> Gestione
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {GARE_GESTIONE.map((g) => {
                            const Icon = g.icon;
                            return (
                                <button
                                    key={g.id}
                                    onClick={() => go(g.id)}
                                    className="glass-panel p-5 rounded-2xl text-left hover:bg-white/5 transition-colors group"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center mb-3">
                                            <Icon className="w-5 h-5 text-indigo-300" />
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors" />
                                    </div>
                                    <p className="text-white font-semibold">{g.label}</p>
                                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{g.desc}</p>
                                </button>
                            );
                        })}
                    </div>
                </>
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
