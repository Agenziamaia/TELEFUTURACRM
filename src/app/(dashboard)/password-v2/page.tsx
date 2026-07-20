"use client";

import { useState, useEffect } from "react";
import { LockKeyhole, Wifi, Radio, Tv, Zap, Leaf, ArrowLeft, RotateCcw, Eye, EyeOff, Copy, Key, ShieldCheck, Info, Loader2 } from "lucide-react";
import { cn } from "@/utils";
import { useAuth } from "@/context/AuthContext";
import { useStoreRecords } from "@/lib/org";

type BrandId = "windtre" | "vodafone" | "sky" | "fastweb" | "energia";

const BRANDS: { id: BrandId; name: string; color: string; bg: string; image: string; categories: number }[] = [
    { id: "windtre", name: "WindTre", color: "text-orange-300", bg: "bg-orange-500/15 border-orange-500/40", image: "/windtre.webp", categories: 4 },
    { id: "vodafone", name: "Vodafone", color: "text-rose-300", bg: "bg-rose-500/15 border-rose-500/40", image: "/vodaphone - Copy.png", categories: 3 },
    { id: "sky", name: "Sky", color: "text-sky-300", bg: "bg-sky-500/15 border-sky-500/40", image: "/sky.png", categories: 3 },
    { id: "fastweb", name: "Fastweb", color: "text-violet-300", bg: "bg-violet-500/15 border-violet-500/40", image: "/fastweb.png", categories: 2 },
    { id: "energia", name: "Energia", color: "text-emerald-300", bg: "bg-emerald-500/15 border-emerald-500/40", image: "/energy - Copy.png", categories: 3 },
];

const CATEGORIES: Record<BrandId, { id: string; name: string }[]> = {
    windtre: [
        { id: "ngpos", name: "NGPOS" },
        { id: "ask", name: "ASK" },
        { id: "findomestic", name: "FINDOMESTIC" },
        { id: "compass", name: "COMPASS" },
    ],
    vodafone: [
        { id: "vodafone-one", name: "Vodafone One" },
        { id: "mnp-portal", name: "MNP Portal" },
        { id: "admin-dashboard", name: "Admin Dashboard" },
    ],
    sky: [
        { id: "sky-agent", name: "Sky Agent" },
        { id: "sky-business", name: "Sky Business" },
        { id: "admin-dashboard", name: "Admin Dashboard" },
    ],
    fastweb: [
        { id: "partner-portal", name: "Partner Portal" },
        { id: "admin-dashboard", name: "Admin Dashboard" },
    ],
    energia: [
        { id: "s4-energy", name: "S4 Energy Portal" },
        { id: "barton", name: "Barton Portal" },
        { id: "admin-dashboard", name: "Admin Dashboard" },
    ],
};

// I negozi arrivano dal DB (useStoreRecords): erano inventati (Roma Termini,
// Milano Centrale, Napoli Toledo...) e non corrispondevano ad alcun punto vendita.

type Credential = {
    id: number;
    brandId: BrandId;
    categoryId: string;
    storeId: string;
    accessType: string;
    username: string;
    passwordMasked: string;
    passwordReal?: string;
};

export default function PasswordV2Page() {
    const { user } = useAuth();
    const storeRecs = useStoreRecords();
    const STORES = [...storeRecs, { id: "tutti", name: "Tutti (Accesso Globale)", code: "ALL" }];
    const [brand, setBrand] = useState<BrandId | null>(null);
    const [category, setCategory] = useState<string | null>(null);
    const [store, setStore] = useState<string | null>(null);
    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [loading, setLoading] = useState(false);
    const [revealedIds, setRevealedIds] = useState<Record<number, string>>({});
    const [revealingId, setRevealingId] = useState<number | null>(null);
    const [copiedId, setCopiedId] = useState<number | null>(null);

    const isAllowed = user && ["admin", "store_manager"].includes(user.role);

    useEffect(() => {
        if (brand && category && store) {
            fetchCredentials();
        } else {
            setCredentials([]);
            setRevealedIds({});
        }
    }, [brand, category, store]);

    const fetchCredentials = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/passwords/credentials?brandId=${brand}&categoryId=${category}&storeId=${store}`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setCredentials(data);
            }
        } catch (err) {
            console.error("Error fetching credentials:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleReveal = async (id: number) => {
        if (revealedIds[id]) {
            setRevealedIds(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
            return;
        }

        setRevealingId(id);
        try {
            const res = await fetch(`/api/passwords/credentials/${id}/reveal`, { method: "POST" });
            const data = await res.json();
            if (data.password) {
                setRevealedIds(prev => ({ ...prev, [id]: data.password }));
            }
        } catch (err) {
            console.error("Error revealing password:", err);
        } finally {
            setRevealingId(null);
        }
    };

    const handleCopy = (id: number, value: string) => {
        navigator.clipboard?.writeText(value).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
        });
    };

    const resetAll = () => {
        setBrand(null);
        setCategory(null);
        setStore(null);
        setRevealedIds({});
    };

    if (!isAllowed) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
                <div className="glass-card max-w-md w-full p-10 space-y-6">
                    <div className="w-20 h-20 mx-auto bg-amber-500/10 rounded-3xl border border-amber-500/20 flex items-center justify-center">
                        <LockKeyhole className="w-10 h-10 text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-white tracking-tight">Accesso Riservato</h1>
                        <p className="text-slate-400 mt-2 text-sm">
                            La sezione Password CRM è visibile solo a ruoli <span className="font-semibold text-slate-200">admin</span> e{" "}
                            <span className="font-semibold text-slate-200">store manager</span>.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const step = !brand ? 1 : !category ? 2 : !store ? 3 : 4;
    const currentBrand = brand ? BRANDS.find((b) => b.id === brand) : null;
    const currentCategory = brand && category ? CATEGORIES[brand].find((c) => c.id === category) : null;
    const currentStore = store ? STORES.find((s) => s.id === store) : null;

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-black text-white tracking-tight">Password CRM</h1>
                    <p className="text-slate-500 font-medium mt-1">
                        Credenziali di accesso per i vari brand — visibile solo ad admin e store manager
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {step > 1 && (
                        <button
                            onClick={() => {
                                if (step === 2) setBrand(null);
                                else if (step === 3) setCategory(null);
                                else if (step === 4) setStore(null);
                            }}
                            className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" /> Indietro
                        </button>
                    )}
                    {step > 1 && (
                        <button
                            onClick={resetAll}
                            className="bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2"
                        >
                            <RotateCcw className="w-4 h-4" /> Reset
                        </button>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
                <button
                    onClick={resetAll}
                    className={cn(
                        "px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap",
                        step === 1
                            ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                            : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/5"
                    )}
                >
                    Brand
                </button>

                {brand && (
                    <>
                        <span className="text-slate-700 font-bold">›</span>
                        <button
                            onClick={() => { setCategory(null); setStore(null); }}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap",
                                step === 2
                                    ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                                    : "bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10"
                            )}
                        >
                            {currentBrand?.name}
                        </button>
                    </>
                )}

                {category && (
                    <>
                        <span className="text-slate-700 font-bold">›</span>
                        <button
                            onClick={() => { setStore(null); }}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap",
                                step === 3
                                    ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                                    : "bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10"
                            )}
                        >
                            {currentCategory?.name}
                        </button>
                    </>
                )}

                {store && (
                    <>
                        <span className="text-slate-700 font-bold">›</span>
                        <button
                            disabled
                            className="px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all whitespace-nowrap"
                        >
                            {currentStore?.name}
                        </button>
                    </>
                )}
            </div>

            <div className="min-h-[400px]">
                {step === 1 && (
                    <div className="space-y-8">
                        <div className="glass-card p-12 lg:p-16 text-center space-y-6 bg-gradient-to-b from-white/[0.03] to-transparent">
                            <div className="w-20 h-20 mx-auto bg-indigo-500/10 rounded-[2rem] border border-indigo-500/20 flex items-center justify-center rotate-12 hover:rotate-0 transition-transform duration-500">
                                <Key className="w-10 h-10 text-indigo-400 -rotate-45" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-black text-white">Seleziona un Brand</h2>
                                <p className="text-slate-500 max-w-md mx-auto">
                                    Scegli il brand per cui vuoi visualizzare le credenziali di accesso
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                            {BRANDS.map((b) => {
                                const colorHex = b.id === "windtre" ? "#f97316" : b.id === "vodafone" ? "#e60000" : b.id === "sky" ? "#0072CE" : b.id === "fastweb" ? "#7c3aed" : "#10b981";
                                return (
                                    <div
                                        key={b.id}
                                        onClick={() => setBrand(b.id)}
                                        className="glass-card p-6 cursor-pointer group hover:bg-white/[0.04] transition-all relative overflow-hidden border border-white/[0.08]"
                                    >
                                        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: `linear-gradient(to right, ${colorHex}, ${colorHex}88)` }} />
                                        <div className="flex flex-col items-center justify-center text-center gap-4 py-4">
                                            <div className={cn("w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center", b.bg)}>
                                                <img src={b.image} alt={b.name} className="w-full h-full object-cover rounded-xl" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-white mb-1">{b.name}</h3>
                                                <p className={cn("text-sm font-semibold", b.color)}>
                                                    {b.categories} categorie
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {step === 2 && brand && (
                    <div className="glass-card p-6 space-y-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                            Step 2 — Seleziona categoria — {currentBrand?.name}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {CATEGORIES[brand].map((c) => {
                                const active = category === c.id;
                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => { setCategory(c.id); setStore(null); }}
                                        className={cn(
                                            "rounded-2xl border p-4 text-left transition-all",
                                            active ? "bg-indigo-500/20 border-indigo-500/40" : "bg-white/5 border-white/10 hover:bg-white/10"
                                        )}
                                    >
                                        <p className={cn("font-semibold text-sm", active ? "text-white" : "text-slate-100")}>{c.name}</p>
                                        <p className="text-xs text-slate-500 mt-1">Sistema di accesso</p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {step === 3 && brand && category && (
                    <div className="glass-card p-6 space-y-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                            Step 3 — Seleziona Negozio — {currentBrand?.name} • {currentCategory?.name}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {STORES.map((s) => {
                                const active = store === s.id;
                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => { setStore(s.id); }}
                                        className={cn(
                                            "rounded-2xl border p-4 text-left transition-all",
                                            active ? "bg-slate-100/10 border-sky-500/40" : "bg-white/5 border-white/10 hover:bg-white/10"
                                        )}
                                    >
                                        <p className={cn("font-semibold text-sm", active ? "text-white" : "text-slate-100")}>{s.name}</p>
                                        <p className="text-[11px] text-slate-500 mt-1">Codice: {s.code}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {step === 4 && brand && category && store && (
                    <div className="space-y-4">
                        <div className="glass-card p-6 space-y-4">
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                        Credenziali trovate
                                    </p>
                                    <p className="text-sm text-slate-300">
                                        {currentBrand?.name} • {currentCategory?.name} • {currentStore?.name}
                                    </p>
                                </div>
                                <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-[10px] font-bold text-emerald-300">
                                    {credentials.length} credenziali
                                </span>
                            </div>
                        </div>
                        <div className="border border-white/10 rounded-2xl overflow-hidden bg-black/20">
                            <table className="w-full text-sm text-slate-300">
                                <thead className="bg-white/5 text-slate-400 uppercase tracking-wider text-[10px] font-bold">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Tipo di accesso</th>
                                        <th className="px-4 py-2 text-left">Username</th>
                                        <th className="px-4 py-2 text-left text-right">Password</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td className="px-4 py-20 text-center" colSpan={3}>
                                                <div className="flex flex-col items-center gap-3">
                                                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                                                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Caricamento credenziali...</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : credentials.length === 0 ? (
                                        <tr>
                                            <td className="px-4 py-12 text-center text-slate-500" colSpan={3}>
                                                Nessuna credenziale configurata per questa combinazione.
                                            </td>
                                        </tr>
                                    ) : (
                                        credentials.map((c) => {
                                            const revealedPassword = revealedIds[c.id];
                                            const isRevealing = revealingId === c.id;
                                            return (
                                                <tr key={c.id} className="border-t border-white/5">
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-7 h-7 rounded-lg bg-slate-900/60 flex items-center justify-center">
                                                                <Wifi className="w-4 h-4 text-slate-300" />
                                                            </div>
                                                            <span className="font-semibold text-slate-100">{c.accessType}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-xs text-slate-100">{c.username}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCopy(c.id, c.username)}
                                                                className="p-1 rounded hover:bg-white/10 text-slate-400"
                                                            >
                                                                <Copy className="w-3 h-3" />
                                                            </button>
                                                            {copiedId === c.id && (
                                                                <span className="text-[10px] text-emerald-400 font-semibold">Copiato</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2 justify-end">
                                                            <span className="font-mono text-xs text-slate-100 italic">
                                                                {revealedPassword || c.passwordMasked}
                                                            </span>
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleReveal(c.id)}
                                                                    disabled={isRevealing}
                                                                    className="p-1 rounded hover:bg-white/10 text-slate-400"
                                                                >
                                                                    {isRevealing ? (
                                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                                    ) : revealedPassword ? (
                                                                        <EyeOff className="w-3 h-3 text-indigo-400" />
                                                                    ) : (
                                                                        <Eye className="w-3 h-3" />
                                                                    )}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCopy(c.id, revealedPassword || "")}
                                                                    disabled={!revealedPassword}
                                                                    className={cn(
                                                                        "p-1 rounded hover:bg-white/10",
                                                                        revealedPassword ? "text-slate-400" : "text-slate-700 pointer-events-none"
                                                                    )}
                                                                >
                                                                    <Copy className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            <div className="glass-card border-amber-500/20 bg-amber-500/5 text-amber-100/80 text-xs p-6 flex gap-4 mt-8 animate-in slide-in-from-bottom-4 duration-1000">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-5 h-5 text-amber-500" />
                </div>
                <div className="space-y-1">
                    <p className="font-black text-amber-500 uppercase tracking-widest text-[10px]">Nota di sicurezza</p>
                    <p className="text-[13px] leading-relaxed">
                        Questa sezione contiene credenziali sensibili. L&apos;accesso è limitato ai ruoli <span className="text-amber-200 font-bold">admin</span> e <span className="text-amber-200 font-bold">store manager</span>.
                        Le password sono visibili solo dopo aver cliccato sull&apos;icona dell&apos;occhio. <span className="underline decoration-amber-500/50 underline-offset-4">Non condividere queste credenziali.</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
