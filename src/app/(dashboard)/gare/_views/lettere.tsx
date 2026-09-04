// @ts-nocheck
"use client";

// ARCHIVIO LETTERE DI GARA (Luca 19/08): un solo posto per le lettere mensili
// degli operatori — «così sappiamo sempre le lettere di tutti i mesi, e in
// qualsiasi momento sai anche tu qual è l'unico posto da cui prenderla».
// Tabella gare_lettere + file nel bucket contracts sotto lettere/<brand>/.
// La card vive nella pagina Gare del brand, lato azienda.

import { useEffect, useRef, useState } from "react";
import { eliminaFileMulti } from "@/lib/fileUrl";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { isAdminOrAbove } from "@/lib/roles";
import { cn } from "@/utils";
import { BookOpenText, Upload, Loader2, ExternalLink, X, ChevronDown, ChevronUp } from "lucide-react";

const meseIt = (iso) => {
    const [y, m] = String(iso).split("-").map(Number);
    const s = new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
};

export function LettereGara({ brand, month, colore = "var(--tf-f59e0b)" }) {
    const { user } = useAuth();
    const [lista, setLista] = useState(null);
    const [up, setUp] = useState(false);
    const [aperta, setAperta] = useState(true);
    const [storico, setStorico] = useState(false);
    const fileRef = useRef(null);

    const carica = async () => {
        const { data } = await supabase.from("gare_lettere").select("*")
            .eq("brand", brand).order("month", { ascending: false }).order("created_at", { ascending: false });
        setLista(data || []);
    };
    useEffect(() => { setLista(null); carica(); }, [brand]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { setStorico(false); }, [month]);

    const urlDi = (path) => supabase.storage.from("contracts").getPublicUrl(path)?.data?.publicUrl;

    const caricaFile = async (file) => {
        if (!file) return;
        setUp(true);
        try {
            const pulito = file.name.replace(/[^A-Za-z0-9àèéìòù._ -]/g, "_");
            const path = `lettere/${brand}/${String(month).slice(0, 7)}/${Date.now()}-${pulito}`;
            const { error } = await supabase.storage.from("contracts").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
            if (error) throw error;
            const { error: e2 } = await supabase.from("gare_lettere").insert({
                brand, month, filename: file.name, path, created_by: user?.name || null,
            });
            if (e2) throw e2;
            await carica();
        } catch (e) { alert("Caricamento non riuscito: " + (e?.message || e)); }
        setUp(false);
        if (fileRef.current) fileRef.current.value = "";
    };

    const elimina = async (r) => {
        if (!confirm(`Eliminare la lettera «${r.filename}» di ${meseIt(r.month)}?`)) return;
        await eliminaFileMulti("contracts", [r.path]);
        await supabase.from("gare_lettere").delete().eq("id", r.id);
        carica();
    };

    /* IL MESE SCELTO IN ALTO, IL RESTO È STORICO (Luca 04/09): «se io sono su
       settembre perché mi mostra ancora gli allegati di agosto?». L'archivio
       resta completo — era il senso della card — ma gli altri mesi stanno
       ripiegati, e in vista c'è solo il mese su cui stai lavorando. */
    const mio = String(month).slice(0, 7);
    const diQuestoMese = (lista || []).filter((r) => String(r.month).slice(0, 7) === mio);
    const delMese = new Map();
    (lista || []).filter((r) => String(r.month).slice(0, 7) !== mio)
        .forEach((r) => { const k = String(r.month).slice(0, 7); if (!delMese.has(k)) delMese.set(k, []); delMese.get(k).push(r); });

    return (
        <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2 cursor-pointer select-none" onClick={() => setAperta((v) => !v)}>
                <BookOpenText className="w-4 h-4" style={{ color: colore }} />
                <h3 className="text-[13px] font-bold text-slate-200 tracking-wide">Lettere di gara</h3>
                <span className="text-[10px] text-slate-500">{lista ? (diQuestoMese.length ? `${diQuestoMese.length} per ${meseIt(month)}` : `nessuna per ${meseIt(month)}`) : ""}</span>
                <div className="ml-auto flex items-center gap-2">
                    <label onClick={(e) => e.stopPropagation()}
                        className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors",
                            up ? "bg-white/5 text-slate-500" : "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25")}>
                        {up ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        Carica lettera di {meseIt(month)}
                        <input ref={fileRef} type="file" className="hidden" disabled={up}
                            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                            onChange={(e) => caricaFile(e.target.files?.[0])} />
                    </label>
                    {aperta ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </div>
            </div>
            {aperta && (
                <div className="px-4 pb-3 space-y-2 border-t border-white/5 pt-3">
                    {lista === null ? (
                        <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>
                    ) : (
                      <>
                        {diQuestoMese.length === 0 ? (
                            <p className="text-xs text-slate-500 py-1">Nessuna lettera per {meseIt(month)}: caricala qui sopra, oppure dalla direttamente all&apos;AI qui sotto — la archivia lei.</p>
                        ) : (
                            <div className="flex flex-wrap items-center gap-2">
                                {diQuestoMese.map((r) => (
                                    <span key={r.id} className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] border border-white/15 pl-2.5 pr-1.5 py-1.5 text-xs text-slate-100 max-w-full">
                                        <a href={urlDi(r.path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-white min-w-0">
                                            <span className="truncate max-w-[280px]">{r.filename}</span>
                                            <ExternalLink className="w-3 h-3 shrink-0 text-slate-500" />
                                        </a>
                                        {isAdminOrAbove(user?.role) && (
                                            <button onClick={() => elimina(r)} title="Elimina" className="p-0.5 rounded hover:bg-rose-500/20 text-slate-600 hover:text-rose-300">
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </span>
                                ))}
                            </div>
                        )}
                        {delMese.size > 0 && (
                            <button onClick={() => setStorico((v) => !v)}
                                className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors pt-1">
                                {storico ? "▾ Nascondi i mesi precedenti" : `▸ Mesi precedenti (${[...delMese.values()].reduce((n, r) => n + r.length, 0)} lettere)`}
                            </button>
                        )}
                        {storico && [...delMese.entries()].map(([ym, righe]) => (
                            <div key={ym} className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 w-28 shrink-0">{meseIt(ym + "-01")}</span>
                                {righe.map((r) => (
                                    <span key={r.id} className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] border border-white/10 pl-2.5 pr-1.5 py-1.5 text-xs text-slate-200 max-w-full">
                                        <a href={urlDi(r.path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-white min-w-0">
                                            <span className="truncate max-w-[260px]">{r.filename}</span>
                                            <ExternalLink className="w-3 h-3 shrink-0 text-slate-500" />
                                        </a>
                                        {isAdminOrAbove(user?.role) && (
                                            <button onClick={() => elimina(r)} title="Elimina" className="p-0.5 rounded hover:bg-rose-500/20 text-slate-600 hover:text-rose-300">
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </span>
                                ))}
                            </div>
                        ))}
                      </>
                    )}
                </div>
            )}
        </div>
    );
}
