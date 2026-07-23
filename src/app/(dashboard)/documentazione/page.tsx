"use client";

import Image from "next/image";
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
    Folder,
    FileText,
    Download,
    Edit,
    Trash2,
    Archive,
    Eye,
    Plus,
    ChevronRight,
    Wifi,
    Radio,
    Tv,
    Zap,
    X,
    UploadCloud,
    FileSignature,
    AlertCircle,
    PhoneCall
} from "lucide-react";
import { cn } from "@/utils";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";

/* ─── BRAND CONFIG ─── */
const BRANDS = [
    {
        id: "windtre",
        name: "WindTre",
        color: "from-orange-500 to-orange-600",
        borderColor: "border-orange-500",
        text: "text-orange-500",
        bg: "bg-orange-500/10",
        icon: Wifi,
        logo: "/windtre.webp",
    },
    {
        id: "vodafone",
        name: "Vodafone",
        color: "from-red-500 to-red-600",
        borderColor: "border-red-500",
        text: "text-red-500",
        bg: "bg-red-500/10",
        icon: Radio,
        logo: "/vodaphone - Copy.png",
    },
    {
        id: "fastweb",
        name: "Fastweb",
        color: "from-violet-500 to-violet-600",
        borderColor: "border-violet-500",
        text: "text-violet-400",
        bg: "bg-violet-500/10",
        icon: Radio,
        logo: "/fastweb.png",
    },
    {
        id: "tim",
        name: "Tim",
        color: "from-blue-500 to-blue-600",
        borderColor: "border-blue-500",
        text: "text-blue-500",
        bg: "bg-blue-500/10",
        icon: PhoneCall,
        logo: "/tim-logo.png",
    },
    {
        id: "sky",
        name: "Sky",
        color: "from-sky-500 to-sky-600",
        borderColor: "border-sky-500",
        text: "text-sky-500",
        bg: "bg-sky-500/10",
        icon: Tv,
        logo: "/sky.png",
    },
    {
        id: "energia",
        name: "Energia",
        color: "from-emerald-500 to-emerald-600",
        borderColor: "border-emerald-500",
        text: "text-emerald-500",
        bg: "bg-emerald-500/10",
        icon: Zap,
        logo: "/energy - Copy.png",
    },
    {
        id: "iliad",
        name: "Iliad",
        color: "from-rose-500 to-rose-600",
        borderColor: "border-rose-500",
        text: "text-rose-500",
        bg: "bg-rose-500/10",
        icon: Radio,
        logo: "/iliad.png",
    },
    {
        id: "kena",
        name: "Kena Mobile",
        color: "from-amber-500 to-amber-600",
        borderColor: "border-amber-500",
        text: "text-amber-500",
        bg: "bg-amber-500/10",
        icon: Radio,
        logo: "/kena-mobile.png",
    },
    {
        id: "ho",
        name: "Ho Mobile",
        color: "from-indigo-500 to-indigo-600",
        borderColor: "border-indigo-500",
        text: "text-indigo-400",
        bg: "bg-indigo-500/10",
        icon: Radio,
        logo: "/ho-mobile.png",
    },
];

const CATEGORIES = [
    { id: "canvass", name: "Canvass Attuale", icon: Folder, desc: "Offerte e listini aggiornati" },
    { id: "modulistica", name: "Modulistica Utile", icon: FileSignature, desc: "Moduli compilabili e template" },
    { id: "operativa", name: "Documentazione Operativa", icon: FileText, desc: "Procedure, guide e manuali" },
];

/* ─── HELPERS ─── */
// Segnalazione 73: le categorie ora arrivano dal DB (doc_categories) e non hanno
// un componente icona; la scegliamo dalla chiave.
function catIconFor(key: string) {
    const k = (key || "").toLowerCase();
    if (k.includes("modul")) return FileSignature;
    if (k.includes("oper")) return FileText;
    return Folder;
}
function slugify(str: string) {
    return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "sezione";
}
function getBrand(id: string) { return BRANDS.find(b => b.id === id); }
function getCat(id: string) { return CATEGORIES.find(c => c.id === id); }

const DOC_VIEW_KEY = "crm-view-documentazione";

function readDocViewFromStorage(): { brandId: string | null; catId: string | null } {
    if (typeof window === "undefined") return { brandId: null, catId: null };
    try {
        const raw = sessionStorage.getItem(DOC_VIEW_KEY);
        if (!raw) return { brandId: null, catId: null };
        const parsed = JSON.parse(raw) as { brandId?: string | null; catId?: string | null };
        const brandId = parsed.brandId && BRANDS.some((b) => b.id === parsed.brandId) ? parsed.brandId : null;
        const catId = parsed.catId && CATEGORIES.some((c) => c.id === parsed.catId) ? parsed.catId : null;
        return { brandId, catId };
    } catch {
        return { brandId: null, catId: null };
    }
}

type DocEntry = { id: number; name: string; type: string; size: string; date: string; fillable: boolean; file_path?: string | null; archived?: boolean };

function formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
function formatDateForDoc(d: Date): string {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

export default function DocumentazionePage() {
    const [view, setView] = useState<{ brandId: string | null; catId: string | null }>({ brandId: null, catId: null });
    const didRestore = useRef(false);
    const skipNextSave = useRef(true);
    const [docList, setDocList] = useState<{ id: number; brand_id: string; category_id: string; name: string; type: string; size: string | null; date: string | null; fillable: boolean; file_path?: string | null; archived?: boolean }[]>([]);

    const fetchDocs = useCallback(async () => {
        const { data, error } = await supabase.from("documentation").select("id, brand_id, category_id, name, type, size, date, fillable, file_path, archived").order("brand_id").order("category_id");
        if (!error && data) setDocList(data as typeof docList);
    }, []);

    useEffect(() => {
        fetchDocs();
    }, [fetchDocs]);

    const docsByBrandCategory = useMemo(() => {
        const m: Record<string, Record<string, DocEntry[]>> = {};
        docList.forEach((d) => {
            if (!m[d.brand_id]) m[d.brand_id] = {};
            if (!m[d.brand_id][d.category_id]) m[d.brand_id][d.category_id] = [];
            m[d.brand_id][d.category_id].push({
                id: d.id,
                name: d.name,
                type: d.type,
                size: d.size ?? "",
                date: d.date ?? "",
                fillable: d.fillable,
                file_path: d.file_path ?? undefined,
                archived: !!d.archived,
            });
        });
        return m;
    }, [docList]);

    function getDocPublicUrl(filePath: string): string {
        const { data } = supabase.storage.from("documentation").getPublicUrl(filePath);
        return data.publicUrl;
    }

    const getDocs = useCallback((brandId: string, catId: string) => (docsByBrandCategory[brandId]?.[catId] ?? []), [docsByBrandCategory]);
    const getTotalDocs = useCallback((brandId: string) => {
        const cats = docsByBrandCategory[brandId] || {};
        return Object.values(cats).reduce((s, arr) => s + arr.length, 0);
    }, [docsByBrandCategory]);

    useEffect(() => {
        if (didRestore.current) return;
        didRestore.current = true;
        const stored = readDocViewFromStorage();
        if (stored.brandId || stored.catId) setView(stored);
    }, []);

    useEffect(() => {
        if (skipNextSave.current) {
            skipNextSave.current = false;
            return;
        }
        try {
            sessionStorage.setItem(DOC_VIEW_KEY, JSON.stringify(view));
        } catch {
            // ignore
        }
    }, [view]);

    const brandId = view.brandId && BRANDS.some((b) => b.id === view.brandId) ? view.brandId : null;
    const catId = view.catId && CATEGORIES.some((c) => c.id === view.catId) ? view.catId : null;

    // Solo Direttore Commerciale (e superuser) puo' modificare i file (richiesta Luca #14).
    const { user } = useAuth();
    const canEdit = ["direttore_commerciale", "admin", "dev", "direttore_generale"].includes(user?.role || "");
    const [isAdmin, setIsAdmin] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    useEffect(() => { if (!canEdit && isAdmin) setIsAdmin(false); }, [canEdit, isAdmin]);

    // Segnalazione 73: categorie/sezioni gestibili dal Direttore Commerciale in su.
    const [dbCats, setDbCats] = useState<{ id: number; brand_id: string | null; cat_key: string; name: string; descrizione: string | null; sort: number; archived: boolean }[]>([]);
    const fetchCats = useCallback(async () => {
        const { data } = await supabase.from("doc_categories").select("id, brand_id, cat_key, name, descrizione, sort, archived").eq("archived", false).order("sort");
        if (data) setDbCats(data as typeof dbCats);
    }, []);
    useEffect(() => { fetchCats(); }, [fetchCats]);
    // Gestione inline (niente prompt del browser: input dentro la pagina).
    const [addingCat, setAddingCat] = useState(false);
    const [newCatName, setNewCatName] = useState("");
    const [editCatId, setEditCatId] = useState<number | null>(null);
    const [editCatName, setEditCatName] = useState("");
    const addCategory = useCallback(async (name: string, forBrand: string) => {
        const nm = name.trim();
        if (!nm) return;
        const key = slugify(nm) + "-" + Math.random().toString(36).slice(2, 6);
        const maxSort = dbCats.reduce((m, c) => Math.max(m, c.sort), 0);
        await supabase.from("doc_categories").insert({ brand_id: forBrand, cat_key: key, name: nm, sort: maxSort + 10 });
        setAddingCat(false); setNewCatName("");
        fetchCats();
    }, [dbCats, fetchCats]);
    const renameCategory = useCallback(async (dbId: number, name: string) => {
        const nm = name.trim();
        if (!nm) { setEditCatId(null); return; }
        await supabase.from("doc_categories").update({ name: nm }).eq("id", dbId);
        setEditCatId(null); setEditCatName("");
        fetchCats();
    }, [fetchCats]);
    const archiveCategory = useCallback(async (dbId: number) => {
        await supabase.from("doc_categories").update({ archived: true }).eq("id", dbId);
        fetchCats();
    }, [fetchCats]);
    const [previewDoc, setPreviewDoc] = useState<DocEntry | null>(null);
    const [fillDoc, setFillDoc] = useState<DocEntry | null>(null);
    const [showUpload, setShowUpload] = useState(false);
    const [adminAct, setAdminAct] = useState<{ doc: DocEntry; action: string } | null>(null);

    const [uploadName, setUploadName] = useState("");
    const [uploadCategory, setUploadCategory] = useState("");
    const [uploadFillable, setUploadFillable] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [renameValue, setRenameValue] = useState("");

    const brand = brandId ? getBrand(brandId) : null;
    // Segnalazione 73: categorie effettive = globali (brand_id null) + quelle del
    // brand corrente. Fallback alle 3 storiche finche' il DB non ha risposto.
    const effCats = useMemo(() => {
        const rows = dbCats.filter(c => !c.archived && (c.brand_id === null || c.brand_id === brandId));
        if (rows.length) return rows.map(c => ({ id: c.cat_key, name: c.name, desc: c.descrizione ?? "", icon: catIconFor(c.cat_key), dbId: c.id, shared: c.brand_id === null }));
        return CATEGORIES.map(c => ({ id: c.id, name: c.name, desc: c.desc, icon: c.icon, dbId: 0, shared: true }));
    }, [dbCats, brandId]);
    const cat = catId ? (effCats.find(c => c.id === catId) ?? getCat(catId)) : null;
    const allDocs = brandId && catId ? getDocs(brandId, catId) : [];
    // I documenti archiviati (OLD) sono nascosti finche' non si sceglie di mostrarli.
    const docs = showArchived ? allDocs : allDocs.filter((d) => !d.archived);
    const archivedCount = allDocs.filter((d) => d.archived).length;

    const toggleArchive = async (doc: DocEntry) => {
        await supabase.from("documentation").update({ archived: !doc.archived }).eq("id", doc.id);
        fetchDocs();
    };

    const goHome = useCallback(() => setView({ brandId: null, catId: null }), [setView]);
    const goBrand = useCallback((id: string) => setView((prev) => ({ ...prev, brandId: id, catId: null })), [setView]);

    const stateRef = useRef({ brandId, catId });
    stateRef.current = { brandId, catId };

    useEffect(() => {
        const onBack = (e: Event) => {
            const { brandId: b, catId: c } = stateRef.current;
            if (c) {
                setView((prev) => ({ ...prev, catId: null }));
                e.preventDefault();
                return;
            }
            if (b) {
                setView((prev) => ({ ...prev, brandId: null, catId: null }));
                e.preventDefault();
                return;
            }
        };
        window.addEventListener("crm-back", onBack);
        return () => window.removeEventListener("crm-back", onBack);
    }, [setView]);

    return (
        <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] lg:h-screen lg:pl-64 w-full overflow-hidden min-w-0 max-w-full">
            {/* Header Area */}
            <div className="flex-none p-4 lg:p-8 w-full min-w-0 max-w-full">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-indigo-500/20 rounded-lg border border-indigo-500/30">
                                <Folder className="w-6 h-6 text-indigo-400" />
                            </div>
                            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Documentazione</h1>
                        </div>
                        <p className="text-sm text-slate-400">Archivio canvass, moduli compilabili e manuali operativi</p>
                    </div>

                    <div className="flex items-center gap-3">
                        {brandId && catId && archivedCount > 0 && (
                            <button
                                onClick={() => setShowArchived((v) => !v)}
                                className={cn("px-3 py-2 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5",
                                    showArchived ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10")}
                            >
                                <Archive className="w-3.5 h-3.5" /> {showArchived ? "Nascondi OLD" : `OLD (${archivedCount})`}
                            </button>
                        )}
                        {/* Modifica riservata al Direttore Commerciale (richiesta Luca #14). */}
                        {canEdit && (
                            <button
                                onClick={() => setIsAdmin(!isAdmin)}
                                className={cn(
                                    "px-4 py-2 rounded-xl text-sm font-semibold transition-all border",
                                    isAdmin
                                        ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-400"
                                        : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                                )}
                            >
                                {isAdmin ? "Modalità Admin" : "Modalità Utente"}
                            </button>
                        )}
                        {brandId && (
                            <button
                                onClick={goHome}
                                className="px-4 py-2 rounded-xl text-sm font-semibold transition-all bg-white/5 border border-white/10 text-white hover:bg-white/10"
                            >
                                Tutti i Brand
                            </button>
                        )}
                    </div>
                </div>

                {/* Breadcrumb */}
                <div className="flex items-center gap-2 mt-6 text-sm text-slate-400">
                    <button
                        onClick={goHome}
                        className={cn("hover:text-white transition-colors", !brandId && "text-white font-semibold")}
                    >
                        Directory
                    </button>
                    {brand && (
                        <>
                            <ChevronRight className="w-4 h-4 text-slate-600" />
                            <button
                                onClick={() => setView((prev) => ({ ...prev, catId: null }))}
                                className={cn("hover:text-white transition-colors", !catId && "text-white font-semibold")}
                            >
                                {brand.name}
                            </button>
                        </>
                    )}
                    {cat && (
                        <>
                            <ChevronRight className="w-4 h-4 text-slate-600" />
                            <span className="text-white font-semibold">{cat.name}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 px-4 lg:px-8 pb-8 overflow-y-auto custom-scrollbar w-full min-w-0 max-w-full">
              {/* Segnalazione 50: pagina centrata (contenuto con larghezza massima e mx-auto). */}
              <div className="max-w-6xl mx-auto w-full">

                {/* LANDING - BRAND SELECTION */}
                {!brandId && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                        {BRANDS.map(b => (
                            <div
                                key={b.id}
                                onClick={() => goBrand(b.id)}
                                className={cn(
                                    "glass-card p-6 cursor-pointer group hover:bg-white/[0.04] transition-all relative overflow-hidden border",
                                    "hover:" + b.borderColor
                                )}
                            >
                                <div className={cn("absolute top-0 left-0 right-0 h-1 bg-gradient-to-r", b.color)} />

                                <div className="flex flex-col items-center justify-center text-center gap-4 py-4">
                                    <div className={cn("w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center", b.bg)}>
                                        {b.logo ? (
                                            <Image
                                                src={b.logo}
                                                alt={b.name}
                                                width={80}
                                                height={80}
                                                className="w-full h-full object-contain rounded-xl p-2"
                                            />
                                        ) : (
                                            <b.icon className={cn("w-10 h-10", b.text)} />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white mb-1">{b.name}</h3>
                                        <p className={cn("text-sm font-semibold", b.text)}>
                                            {getTotalDocs(b.id)} documenti
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* CATEGORY SELECTION */}
                {brandId && !catId && brand && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {effCats.map(c => {
                            const docCount = getDocs(brand.id, c.id).length;
                            const editing = editCatId === c.dbId && c.dbId > 0;
                            return (
                                <div
                                    key={c.id}
                                    onClick={() => { if (!editing) setView((prev) => ({ ...prev, catId: c.id })); }}
                                    className={cn(
                                        "glass-card p-6 group hover:bg-white/[0.04] transition-all border border-white/10 hover:border-white/20 flex gap-4 relative",
                                        editing ? "cursor-default" : "cursor-pointer"
                                    )}
                                >
                                    <div className={cn("p-3 rounded-xl h-fit", brand.bg)}>
                                        <c.icon className={cn("w-6 h-6", brand.text)} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        {editing ? (
                                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    autoFocus
                                                    value={editCatName}
                                                    onChange={(e) => setEditCatName(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === "Enter") renameCategory(c.dbId, editCatName); if (e.key === "Escape") setEditCatId(null); }}
                                                    className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                                                />
                                                <button onClick={() => renameCategory(c.dbId, editCatName)} className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"><ChevronRight className="w-4 h-4" /></button>
                                                <button onClick={() => setEditCatId(null)} className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10"><X className="w-4 h-4" /></button>
                                            </div>
                                        ) : (
                                            <>
                                                <h3 className="text-lg font-bold text-white mb-1 group-hover:text-indigo-400 transition-colors flex items-center gap-2">
                                                    {c.name}
                                                    {c.shared && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 border border-white/10 rounded px-1.5 py-0.5">condivisa</span>}
                                                </h3>
                                                <p className="text-sm text-slate-400 mb-3">{c.desc}</p>
                                                <span className={cn("inline-block px-2.5 py-1 rounded-md text-xs font-bold bg-[#0f111a]/50 border border-white/5", brand.text)}>
                                                    {docCount} documenti
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    {/* Gestione sezione (solo Direttore Commerciale in su, e solo per le
                                        sezioni specifiche del brand: le "condivise" restano invariate). */}
                                    {isAdmin && !editing && c.dbId > 0 && !c.shared && (
                                        <div className="absolute top-3 right-3 flex gap-1" onClick={(e) => e.stopPropagation()}>
                                            <button onClick={() => { setEditCatId(c.dbId); setEditCatName(c.name); }} title="Rinomina" className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"><Edit className="w-4 h-4" /></button>
                                            <button onClick={() => { if (window.confirm(`Rimuovere la sezione "${c.name}"?`)) archiveCategory(c.dbId); }} title="Rimuovi" className="p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Aggiungi nuova sezione per questo brand (segn.73) */}
                        {isAdmin && (
                            addingCat ? (
                                <div className="glass-card p-6 border border-indigo-500/30 flex flex-col gap-3">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Nuova sezione — {brand.name}</label>
                                    <input
                                        autoFocus
                                        value={newCatName}
                                        onChange={(e) => setNewCatName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") addCategory(newCatName, brand.id); if (e.key === "Escape") { setAddingCat(false); setNewCatName(""); } }}
                                        placeholder="es. Listini Business"
                                        className="w-full bg-[#0f111a] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => addCategory(newCatName, brand.id)} className="flex-1 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold">Crea</button>
                                        <button onClick={() => { setAddingCat(false); setNewCatName(""); }} className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm">Annulla</button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setAddingCat(true)}
                                    className="glass-card p-6 border border-dashed border-white/15 hover:border-indigo-500/50 hover:bg-white/[0.03] transition-all flex items-center justify-center gap-3 text-slate-400 hover:text-indigo-300"
                                >
                                    <Plus className="w-6 h-6" />
                                    <span className="font-semibold">Nuova sezione</span>
                                </button>
                            )
                        )}
                    </div>
                )}

                {/* DOCUMENT LIST */}
                {brandId && catId && brand && cat && (
                    <div className="glass-card overflow-hidden flex flex-col min-h-[400px]">
                        {/* Toolbar */}
                        <div className="p-4 border-b border-white/10 flex flex-wrap justify-between items-center gap-4 bg-[#0f111a]/50">
                            <div>
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <cat.icon className={cn("w-5 h-5", brand.text)} />
                                    {cat.name}
                                </h2>
                                <p className="text-xs text-slate-400 mt-1">{docs.length} documenti disponibili</p>
                            </div>
                            {isAdmin && (
                                <button
                                    onClick={() => {
                                        setUploadCategory(catId ?? "");
                                        setUploadName("");
                                        setUploadFillable(false);
                                        setUploadFile(null);
                                        setUploadError(null);
                                        setShowUpload(true);
                                    }}
                                    className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                    Carica Documento
                                </button>
                            )}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="text-xs font-semibold text-slate-400 uppercase tracking-wider bg-white/5 border-b border-white/10">
                                    <tr>
                                        <th className="px-6 py-4">Documento</th>
                                        <th className="px-6 py-4">Formato</th>
                                        <th className="px-6 py-4">Dim.</th>
                                        <th className="px-6 py-4">Aggiornato</th>
                                        <th className="px-6 py-4 text-right">Azioni</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {docs.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                                Nessun documento in questa categoria.
                                            </td>
                                        </tr>
                                    ) : (
                                        docs.map(doc => (
                                            <tr key={doc.id} className="hover:bg-white/[0.02]">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <FileText className="w-5 h-5 text-slate-500" />
                                                        <span className="font-semibold text-white">{doc.name}</span>
                                                        {doc.archived && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/25">OLD</span>}
                                                        {doc.fillable && (
                                                            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                                                COMPILABILE
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                                        {doc.type.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-slate-400">{doc.size}</td>
                                                <td className="px-6 py-4 text-slate-400">{doc.date}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => setPreviewDoc(doc)}
                                                            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors tooltip-trigger"
                                                            title="Anteprima"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => doc.file_path && window.open(getDocPublicUrl(doc.file_path), "_blank", "noopener")}
                                                            disabled={!doc.file_path}
                                                            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors tooltip-trigger disabled:opacity-50 disabled:cursor-not-allowed"
                                                            title={doc.file_path ? "Scarica" : "Nessun file"}
                                                        >
                                                            <Download className="w-4 h-4" />
                                                        </button>
                                                        {doc.fillable && (
                                                            <button
                                                                onClick={() => setFillDoc(doc)}
                                                                className="px-3 py-1.5 ml-2 hover:bg-indigo-500/20 rounded-lg text-indigo-400 font-semibold text-xs border border-indigo-500/30 transition-colors inline-flex items-center gap-1.5"
                                                            >
                                                                <FileSignature className="w-3.5 h-3.5" />
                                                                Compila
                                                            </button>
                                                        )}
                                                        {isAdmin && (
                                                            <div className="flex items-center ml-2 border-l border-white/10 pl-2 gap-1">
                                                                <button
                                                                    onClick={() => { setAdminAct({ doc, action: "rename" }); setRenameValue(doc.name); }}
                                                                    className="p-1.5 hover:bg-amber-500/20 rounded-lg text-amber-500 transition-colors"
                                                                    title="Rinomina"
                                                                >
                                                                    <Edit className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => toggleArchive(doc)}
                                                                    className={cn("p-1.5 rounded-lg transition-colors", doc.archived ? "text-amber-400 hover:bg-amber-500/20" : "text-slate-400 hover:bg-amber-500/20 hover:text-amber-400")}
                                                                    title={doc.archived ? "Ripristina (togli da OLD)" : "Archivia come OLD (non aggiornato)"}
                                                                >
                                                                    <Archive className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => setAdminAct({ doc, action: "delete" })}
                                                                    className="p-1.5 hover:bg-rose-500/20 rounded-lg text-rose-500 transition-colors"
                                                                    title="Elimina"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

              </div>{/* /max-w-6xl (segn.50 centratura) */}
            </div>

            {/* MODALS */}

            {/* Preview Modal */}
            {previewDoc && brand && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#0f111a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <FileText className={cn("w-5 h-5", brand.text)} />
                                {previewDoc.name}
                            </h3>
                            <button onClick={() => setPreviewDoc(null)} className="p-1 hover:bg-white/10 rounded-lg text-slate-400 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 flex-1 overflow-auto bg-[#0a0a0f] flex flex-col rounded-b-2xl min-h-[500px]">
                            {previewDoc.file_path ? (
                                <iframe
                                    src={getDocPublicUrl(previewDoc.file_path)}
                                    title={previewDoc.name}
                                    className="w-full flex-1 min-h-[500px] rounded-xl border border-white/10 bg-white"
                                />
                            ) : (
                                <div className="w-full h-full min-h-[500px] border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center text-slate-500 gap-4">
                                    <Eye className="w-12 h-12 opacity-50" />
                                    <div className="text-center">
                                        <p className="font-bold text-white mb-1">Nessun file caricato</p>
                                        <p className="text-sm">Questo documento non ha un PDF associato. Carica un file dalla modalità Admin.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Fillable Modal */}
            {fillDoc && brand && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <FileSignature className={cn("w-5 h-5", brand.text)} />
                                {fillDoc.name}
                            </h3>
                            <button onClick={() => setFillDoc(null)} className="p-1 hover:bg-white/10 rounded-lg text-slate-400 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar">
                            {fillDoc.file_path && (
                                <div className="mb-6 rounded-xl border border-white/10 overflow-hidden bg-white">
                                    <iframe
                                        src={getDocPublicUrl(fillDoc.file_path)}
                                        title={fillDoc.name}
                                        className="w-full h-[400px]"
                                    />
                                </div>
                            )}
                            <div className={cn("p-4 rounded-xl border mb-6 flex items-start gap-3", brand.bg, brand.borderColor)}>
                                <AlertCircle className={cn("w-5 h-5 shrink-0", brand.text)} />
                                <div>
                                    <p className={cn("text-sm font-semibold", brand.text)}>Compilazione Modulo</p>
                                    <p className="text-xs text-slate-300 mt-1">I campi verranno pre-compilati con i dati del cliente se disponibili in anagrafica.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5 sm:col-span-2">
                                    <label className="text-xs font-semibold text-slate-400">Nome e Cognome / Ragione Sociale</label>
                                    <input type="text" className="w-full bg-[#0f111a] border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors" placeholder="Es. Mario Rossi" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-400">Codice Fiscale / P.IVA</label>
                                    <input type="text" className="w-full bg-[#0f111a] border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-400">Telefono</label>
                                    <input type="text" className="w-full bg-[#0f111a] border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <label className="text-xs font-semibold text-slate-400">Email</label>
                                    <input type="text" className="w-full bg-[#0f111a] border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <label className="text-xs font-semibold text-slate-400">Note Aggiuntive</label>
                                    <textarea className="w-full bg-[#0f111a] border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors min-h-[80px]" />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-8">
                                <button onClick={() => setFillDoc(null)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
                                    Annulla
                                </button>
                                <button
                                    type="button"
                                    onClick={() => fillDoc?.file_path && window.open(getDocPublicUrl(fillDoc.file_path), "_blank", "noopener")}
                                    disabled={!fillDoc?.file_path}
                                    className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-500 hover:bg-indigo-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Esporta PDF
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Modal (Admin) */}
            {showUpload && brand && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-lg flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <UploadCloud className={cn("w-5 h-5", brand.text)} />
                                Carica Documento
                            </h3>
                            <button onClick={() => setShowUpload(false)} className="p-1 hover:bg-white/10 rounded-lg text-slate-400 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {uploadError && (
                                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                                    {uploadError}
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400">Nome Documento</label>
                                <input
                                    type="text"
                                    value={uploadName}
                                    onChange={e => setUploadName(e.target.value)}
                                    className="w-full bg-[#0f111a] border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                    placeholder="es. Canvass Consumer Aprile 2026"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400">Categoria</label>
                                <select
                                    value={uploadCategory}
                                    onChange={e => setUploadCategory(e.target.value)}
                                    className="w-full bg-[#0f111a] border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
                                >
                                    {effCats.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400">Tipo Documento</label>
                                <select
                                    value={uploadFillable ? "fillable" : "flat"}
                                    onChange={e => setUploadFillable(e.target.value === "fillable")}
                                    className="w-full bg-[#0f111a] border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
                                >
                                    <option value="flat">PDF statico (sola lettura)</option>
                                    <option value="fillable">PDF compilabile (con campi)</option>
                                </select>
                            </div>
                            <div className="space-y-1.5 pt-2">
                                <label className="text-xs font-semibold text-slate-400">File</label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="application/pdf"
                                    className="hidden"
                                    onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                                />
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("border-indigo-500/50", "bg-indigo-500/5"); }}
                                    onDragLeave={e => { e.preventDefault(); e.currentTarget.classList.remove("border-indigo-500/50", "bg-indigo-500/5"); }}
                                    onDrop={e => {
                                        e.preventDefault();
                                        e.currentTarget.classList.remove("border-indigo-500/50", "bg-indigo-500/5");
                                        const f = e.dataTransfer.files[0];
                                        if (f?.type === "application/pdf") setUploadFile(f);
                                    }}
                                    className="border-2 border-dashed border-white/10 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-white/[0.02] transition-colors cursor-pointer group"
                                >
                                    <UploadCloud className="w-10 h-10 text-slate-500 group-hover:text-indigo-400 transition-colors mb-3" />
                                    <p className="font-semibold text-white mb-1">
                                        {uploadFile ? uploadFile.name : "Trascina un file o clicca per selezionare"}
                                    </p>
                                    <p className="text-xs text-slate-400">PDF, massimo 25 MB</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 p-4 border-t border-white/10 bg-[#0f111a]/50">
                            <button onClick={() => setShowUpload(false)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
                                Annulla
                            </button>
                            <button
                                disabled={uploading || !uploadName.trim() || !uploadCategory || !uploadFile}
                                onClick={async () => {
                                    if (!brandId || !uploadName.trim() || !uploadCategory || !uploadFile) return;
                                    setUploadError(null);
                                    setUploading(true);
                                    try {
                                        const ext = uploadFile.name.toLowerCase().endsWith(".pdf") ? "" : ".pdf";
                                        const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
                                        const storagePath = `${brandId}/${uploadCategory}/${Date.now()}_${safeName}${ext}`;
                                        const { error: upErr } = await supabase.storage.from("documentation").upload(storagePath, uploadFile, { contentType: "application/pdf", upsert: false });
                                        if (upErr) throw new Error(upErr.message);
                                        const { error: dbErr } = await supabase.from("documentation").insert({
                                            brand_id: brandId,
                                            category_id: uploadCategory,
                                            name: uploadName.trim(),
                                            type: "pdf",
                                            size: formatBytes(uploadFile.size),
                                            date: formatDateForDoc(new Date()),
                                            fillable: uploadFillable,
                                            file_path: storagePath,
                                        });
                                        if (dbErr) throw new Error(dbErr.message);
                                        await fetchDocs();
                                        setShowUpload(false);
                                        setUploadName("");
                                        setUploadFile(null);
                                    } catch (err) {
                                        setUploadError(err instanceof Error ? err.message : "Errore durante il caricamento.");
                                    } finally {
                                        setUploading(false);
                                    }
                                }}
                                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-500 hover:bg-indigo-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {uploading ? "Caricamento..." : "Carica File"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Admin Action Modal (Rename/Delete) */}
            {adminAct && brand && adminAct.action === "delete" && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-sm flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-rose-500/20 bg-rose-500/5">
                            <h3 className="text-lg font-bold text-rose-500 flex items-center gap-2">
                                <Trash2 className="w-5 h-5" />
                                Conferma Eliminazione
                            </h3>
                            <button onClick={() => setAdminAct(null)} className="p-1 hover:bg-white/10 rounded-lg text-slate-400 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 text-center">
                            <p className="text-slate-300 text-sm mb-6">
                                Sei sicuro di voler eliminare definitivamente il documento <br />
                                <strong className="text-white mt-2 block">{adminAct.doc.name}</strong>?
                            </p>
                            <div className="flex justify-center gap-3">
                                <button onClick={() => setAdminAct(null)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
                                    Annulla
                                </button>
                                <button
                                    onClick={async () => {
                                        const doc = adminAct.doc;
                                        if (doc.file_path) await supabase.storage.from("documentation").remove([doc.file_path]);
                                        await supabase.from("documentation").delete().eq("id", doc.id);
                                        await fetchDocs();
                                        setAdminAct(null);
                                    }}
                                    className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-rose-500 hover:bg-rose-600 text-white transition-colors"
                                >
                                    Sì, Elimina
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {adminAct && brand && adminAct.action === "rename" && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-md flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Edit className={cn("w-5 h-5", brand.text)} />
                                Rinomina Documento
                            </h3>
                            <button onClick={() => setAdminAct(null)} className="p-1 hover:bg-white/10 rounded-lg text-slate-400 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400">Nuovo Nome</label>
                                <input
                                    type="text"
                                    value={renameValue || adminAct.doc.name}
                                    onChange={e => setRenameValue(e.target.value)}
                                    className="w-full bg-[#0f111a] border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button onClick={() => { setAdminAct(null); setRenameValue(""); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
                                    Annulla
                                </button>
                                <button
                                    onClick={async () => {
                                        const newName = (renameValue || adminAct.doc.name).trim();
                                        if (!newName) return;
                                        await supabase.from("documentation").update({ name: newName }).eq("id", adminAct.doc.id);
                                        await fetchDocs();
                                        setAdminAct(null);
                                        setRenameValue("");
                                    }}
                                    className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
                                >
                                    Salva Modifiche
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
