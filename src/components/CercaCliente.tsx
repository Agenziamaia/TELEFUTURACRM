"use client";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";

/** Un cliente dell'anagrafica, coi soli campi che servono a riconoscerlo. */
export type ClienteRif = {
    id: string;
    tipo?: string | null;
    nome?: string | null;
    cognome?: string | null;
    ragione_sociale?: string | null;
    cf_piva?: string | null;
    cellulare?: string | null;
};

export function nomeCliente(c: ClienteRif): string {
    return c.ragione_sociale || `${c.nome || ""} ${c.cognome || ""}`.trim() || c.cf_piva || "cliente";
}

/* IL CAMPO CLIENTE, UNO SOLO IN TUTTO IL CRM (Luca 28/08 sul calendario:
   «devo poter filtrare con qualsiasi dato del cliente e deve fare la solita
   ricerca complessiva nel nostro database, e deve farti selezionare il
   cliente come se fossimo in registra vendita»). Stessa query di Registra
   Vendita: due parole = nome+cognome nei due versi o ragione sociale; una
   parola = CF/P.IVA, nome, cognome, ragione sociale, e il cellulare quando
   sono almeno 4 cifre. Selezionando si esce dall'ambiguità: da lì in poi il
   filtro è su UN cliente, non su una stringa. */
export function CercaCliente({ value, onChange, testo, onTesto, placeholder = "Cerca cliente: nome, CF/P.IVA o cellulare…", className, autoFocus }: {
    value: ClienteRif | null;
    onChange: (c: ClienteRif | null) => void;
    /** testo libero: chi lo passa tiene anche la ricerca "vecchia" per i nomi
     *  scritti a mano che in anagrafica non esistono */
    testo?: string;
    onTesto?: (v: string) => void;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
}) {
    const [q, setQ] = useState("");
    const [hits, setHits] = useState<ClienteRif[]>([]);
    const [aperto, setAperto] = useState(false);
    const [cerco, setCerco] = useState(false);
    const box = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fuori = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setAperto(false); };
        document.addEventListener("mousedown", fuori);
        return () => document.removeEventListener("mousedown", fuori);
    }, []);

    useEffect(() => {
        const v = q.trim().replace(/[(),]/g, " ").replace(/\s+/g, " ");
        if (v.length < 3) { setHits([]); setCerco(false); return; }
        let vivo = true;
        setCerco(true);
        const t = setTimeout(async () => {
            const parole = v.split(" ").filter(Boolean);
            const cifre = v.replace(/\D/g, "");
            let sel = supabase.from("clients").select("id,tipo,nome,cognome,ragione_sociale,cf_piva,cellulare").limit(8);
            sel = parole.length >= 2
                ? sel.or(`and(nome.ilike.%${parole[0]}%,cognome.ilike.%${parole[1]}%),and(nome.ilike.%${parole[1]}%,cognome.ilike.%${parole[0]}%),ragione_sociale.ilike.%${v}%`)
                : sel.or(`cf_piva.ilike.%${v}%,nome.ilike.%${v}%,cognome.ilike.%${v}%,ragione_sociale.ilike.%${v}%${cifre.length >= 4 ? `,cellulare.ilike.%${cifre}%` : ""}`);
            const { data } = await sel;
            if (!vivo) return;
            setHits((data || []) as ClienteRif[]);
            setCerco(false);
        }, 300);
        return () => { vivo = false; clearTimeout(t); };
    }, [q]);

    if (value) return (
        <div className={cn("relative", className)}>
            <div className="glass-input w-full text-sm h-9 pl-3 pr-9 flex items-center gap-2 border-indigo-400/40">
                <span className="text-indigo-300 shrink-0">👤</span>
                <span className="font-semibold text-slate-100 truncate">{nomeCliente(value)}</span>
                <span className="text-[10px] text-slate-500 truncate hidden sm:inline">{value.cf_piva || value.cellulare || ""}</span>
            </div>
            <button type="button" onClick={() => { onChange(null); setQ(""); onTesto?.(""); }}
                title="Togli il filtro cliente"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10">
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );

    return (
        <div ref={box} className={cn("relative", className)}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input type="text" placeholder={placeholder} autoFocus={autoFocus}
                className="glass-input w-full text-sm h-9 pl-9"
                value={q}
                onFocus={() => setAperto(true)}
                onChange={(e) => { setQ(e.target.value); setAperto(true); onTesto?.(e.target.value); }} />
            {aperto && q.trim().length >= 3 && (
                <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-[#0d1117] shadow-2xl overflow-hidden">
                    {hits.map((c) => (
                        <button key={c.id} type="button"
                            onClick={() => { onChange(c); setAperto(false); setQ(""); onTesto?.(""); }}
                            className="w-full text-left px-3 py-2 hover:bg-white/[0.07] border-b border-white/5 last:border-0">
                            <div className="text-sm font-semibold text-slate-100 truncate">{nomeCliente(c)}</div>
                            <div className="text-[10px] text-slate-500 truncate">
                                {[c.cf_piva, c.cellulare, c.tipo === "business" ? "business" : null].filter(Boolean).join(" · ") || "—"}
                            </div>
                        </button>
                    ))}
                    {!hits.length && (
                        <div className="px-3 py-2 text-[11px] text-slate-500">{cerco ? "cerco in anagrafica…" : "nessun cliente in anagrafica con questi dati"}</div>
                    )}
                    {onTesto && (
                        <div className="px-3 py-1.5 text-[10px] text-slate-500 bg-white/[0.02] border-t border-white/5">
                            intanto sto filtrando per testo: scegli il cliente per un filtro univoco
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
