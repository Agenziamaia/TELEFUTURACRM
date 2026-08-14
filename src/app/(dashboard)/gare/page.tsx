"use client";

import { useState, useEffect, Suspense } from "react";
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
import { TabellareEditor } from "./_views/tabellare";
import { W3PdvPanel } from "./_views/w3_pdv";
import { W3CommissioningPanel } from "./_views/w3_commissioning";
import { W3PartnershipPanel } from "./_views/w3_partnership";
import { CalendarioGareView } from "./_views/calendario_gare";

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
    { id: "kena", label: "Kena", desc: "Soglie e commissioning Kena.", color: "#F5A623", logo: "/kena-mobile-v2.png" },
    { id: "dojo", label: "Dojo", desc: "Soglie e commissioning POS Dojo.", color: "var(--tf-14b8a6)", logo: "/dojo-round.png" },
] as const;

// Scala ottica dei loghi col marchio piccolo dentro un canvas grande (stessi
// valori di brandAssets); gli altri PNG sono gia' pieni e restano a 1.
const GARE_LOGO_SCALE: Record<string, number> = { w3: 1.7, vs: 1.95, vnd: 1.95, fastweb: 1.75, kena: 2.0 };

// gara brand → contesto delle tabelle pay (il TABELLARE del Calcolatore $$$).
// vnd non ha tabellare (lato azienda futuro sui PDF); s4/dojo non ancora.
const PAY_CTX: Record<string, string> = { w3: "windtre", vs: "vodafone", fastweb: "fastweb", sky: "sky", tim: "tim", kena: "kena" };

// le sezioni di GESTIONE traslocate dall'Amministrazione (Luca 03/08)
const GARE_GESTIONE = [
    { id: "target", label: "Target", icon: ClipboardList, desc: "Gare e target per personale, ruoli, negozi e categorie; paletti e sblocco commissioning." },
    { id: "obiettivi", label: "Obiettivi Home", icon: Target, desc: "Target contratti del mese per rete, negozio e venditore — la barra 'Obiettivo' nella Home." },
    { id: "direzione", label: "Direzione Inserimento", icon: Compass, desc: "Mappa, per ogni negozio, su quale codice inserire ogni brand/categoria — alimenta la bussola in Home (sola lettura)." },
    // CALENDARIO GARE (Luca 11/08): i giorni lavorativi guidano TUTTE le proiezioni
    { id: "calendariogare", label: "Calendario gare", icon: CalendarDays, desc: "Giorni lavorativi del mese, ora di scatto del giorno e visibilità della proiezione — la base di tutte le proiezioni di commissioning." },
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
    useEffect(() => { setMostraCreazione(false); }, [brandId, lato, month]);
    // W3 azienda A SCHEDE (Luca 14/08: cinque pannelli impilati erano
    // «confusionari»): Partnership · Commissioning € · Lettera & tabellare
    const [tabW3, setTabW3] = useState<"partnership" | "comm" | "lettera">("partnership");
    useEffect(() => { setTabW3("partnership"); }, [brandId]);
    const [vecchioSchema, setVecchioSchema] = useState(false);   // schema gare pre-tabellari, a richiesta
    const [tabVuoto, setTabVuoto] = useState(false);   // tabellare assente → lo schema precedente si mostra da solo
    const [mostraCreazione, setMostraCreazione] = useState(false);   // apre la card copia/crea del tabellare pay
    // W3 azienda (Luca 13/08, «ragiona da proprietario»): il SEGMENTO guida
    // TUTTA la pagina — su Franchising si vedono rete e tabellare a
    // moltiplicatore (che sono suoi); su Multibrand/T2 solo la loro gara
    const [segW3, setSegW3] = useState("franchising");
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
                        : gestione.id === "calendariogare" ? <CalendarioGareView />
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
                                {/* scala OTTICA solo per i PNG col marchio annegato nel
                                    canvas (W3/VF/FW): senza correzione risultavano minuscoli
                                    accanto agli altri (Luca 04/08). Il box resta 88px. */}
                                <div className="flex items-center justify-center h-[88px]">
                                    <Image src={b.logo} alt={b.label} width={260} height={88} className="h-[84px] w-auto max-w-[92%] object-contain"
                                        style={{ transform: `scale(${GARE_LOGO_SCALE[b.id] || 1})` }} />
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

                    {/* W3 AZIENDA A SCHEDE (riordino Luca 14/08, «era confusionario»):
                        il pannello PDV con segmento e target resta sempre in testa;
                        sul franchising il resto vive in TRE SCHEDE — 🏅 Partnership,
                        💶 Commissioning €, 📜 Lettera & tabellare — una alla volta. */}
                    {PAY_CTX[brand.id] === "windtre" && lato === "azienda" ? (
                        <>
                            <W3PdvPanel key={`w3pdv|${month}`} mese={month.slice(0, 7)} colore={brand.color} seg={segW3} onSeg={setSegW3} />
                            {segW3 === "franchising" && (
                                <>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {([
                                            { id: "partnership", label: "🏅 Partnership Reward" },
                                            { id: "comm", label: "💶 Commissioning €" },
                                            { id: "lettera", label: "⚙️ Regole del mese (lettera)" },
                                        ] as const).map(t => (
                                            <button key={t.id} onClick={() => setTabW3(t.id)}
                                                className={cn(
                                                    "px-4 py-2 rounded-xl border text-sm font-bold transition-all",
                                                    tabW3 === t.id ? "border-amber-400/70 bg-amber-500/15 text-white" : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25",
                                                )}>
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                    {tabW3 === "partnership" && (
                                        <W3PartnershipPanel key={`w3pr|${month}`} mese={month.slice(0, 7)} colore={brand.color} />
                                    )}
                                    {tabW3 === "comm" && (
                                        <W3CommissioningPanel key={`w3comm|${month}`} mese={month.slice(0, 7)} colore={brand.color} />
                                    )}
                                    {tabW3 === "lettera" && (
                                        <>
                                            <TabellareEditor key={`${PAY_CTX[brand.id]}|${month}|${lato}|tab`}
                                                ctx={PAY_CTX[brand.id]} mese={month.slice(0, 7)} lato={lato} colore={brand.color}
                                                vaiAzienda={() => go(brand.id, "azienda")} onVuoto={setTabVuoto}
                                                nascondiVuoto={!mostraCreazione} nascondiSoglie />
                                            {!tabVuoto && (
                                                <button onClick={() => setVecchioSchema(v => !v)}
                                                    className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                                                    {vecchioSchema ? "▾ Nascondi lo schema gare precedente" : "▸ Mostra lo schema gare precedente"}
                                                </button>
                                            )}
                                            {tabVuoto && !mostraCreazione && (
                                                <button onClick={() => setMostraCreazione(true)}
                                                    className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                                                    ＋ Imposta il tabellare pay del Calcolatore per questo mese
                                                </button>
                                            )}
                                            {(vecchioSchema || tabVuoto) && (
                                                <AziendaTab key={`${brand.id}|${month}|az`} brand={brand.id} month={month} />
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </>
                    ) : PAY_CTX[brand.id] ? (
                        <>
                            {/* TABELLARE PAY (Luca 11/08): gli altri brand e il lato
                                ragazzi restano al flusso classico */}
                            <TabellareEditor key={`${PAY_CTX[brand.id]}|${month}|${lato}|tab`}
                                ctx={PAY_CTX[brand.id]} mese={month.slice(0, 7)} lato={lato} colore={brand.color}
                                vaiAzienda={() => go(brand.id, "azienda")} onVuoto={setTabVuoto}
                                nascondiVuoto={!mostraCreazione} />
                            {!tabVuoto && (
                                <button onClick={() => setVecchioSchema(v => !v)}
                                    className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                                    {vecchioSchema ? "▾ Nascondi lo schema gare precedente" : "▸ Mostra lo schema gare precedente"}
                                </button>
                            )}
                            {tabVuoto && !mostraCreazione && (
                                <button onClick={() => setMostraCreazione(true)}
                                    className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                                    ＋ Imposta il tabellare pay del Calcolatore per questo mese
                                </button>
                            )}
                            {(vecchioSchema || tabVuoto) && (
                                lato === "azienda" ? (
                                    <AziendaTab key={`${brand.id}|${month}|az`} brand={brand.id} month={month} />
                                ) : rag ? (
                                    <RagazziTab key={`${rag.id}|${month}|rag`} garaId={rag.id} month={month} nota={rag.nota} />
                                ) : null
                            )}
                        </>
                    ) : (
                        lato === "azienda" ? (
                            <AziendaTab key={`${brand.id}|${month}|az`} brand={brand.id} month={month} />
                        ) : rag ? (
                            <RagazziTab key={`${rag.id}|${month}|rag`} garaId={rag.id} month={month} nota={rag.nota} />
                        ) : null
                    )}
                </>
            )}
        </div>
    );
}
