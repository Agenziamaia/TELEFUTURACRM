"use client";

// RICERCA CLIENTE STANDARD (Luca 31/07): il campo unico di Registra Vendita,
// identico OVUNQUE nel CRM — si scrive codice fiscale, cellulare, nome e
// cognome (in entrambi gli ordini) o ragione sociale e le anagrafiche
// compaiono sotto; un click e i dati sono selezionati. Debounce 300ms.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type ClienteTrovato = {
    id: string; tipo: string;
    nome: string | null; cognome: string | null; ragione_sociale: string | null;
    nome_ref: string | null; cognome_ref: string | null; cf_ref?: string | null;
    cf_piva: string | null; cellulare: string | null; telefono_fisso: string | null; email: string | null;
    indirizzo: string | null; cap: string | null; citta: string | null; iban: string | null;
};

export function etichettaCliente(c: ClienteTrovato): string {
    return c.ragione_sociale || `${c.nome || ""} ${c.cognome || ""}`.trim() || c.cf_piva || c.id;
}

export function RicercaCliente({ tipo, onScelto, placeholder = "Cerca: CF, cellulare, nome e cognome o ragione sociale…", className = "", testoIniziale = "", onTesto, tieniScelto = false }: {
    /** consumer | business per filtrare; vuoto/assente = tutti */
    tipo?: "consumer" | "business" | "";
    onScelto: (c: ClienteTrovato) => void;
    placeholder?: string;
    className?: string;
    /** modalità «campo con memoria» (task, Luca 27/08): il testo libero
     *  risale al padre e la scelta resta scritta nel campo */
    testoIniziale?: string;
    onTesto?: (t: string) => void;
    tieniScelto?: boolean;
}) {
    const [testo, setTesto] = useState(testoIniziale || "");
    const [hits, setHits] = useState<ClienteTrovato[]>([]);
    const [cercando, setCercando] = useState(false);
    /* l'etichetta scelta: non si ri-cerca. Parte VALORIZZATA col testo che
       arriva da fuori (Luca 28/08: «ogni volta che rientro su una task mi si
       riapre la selezione del cliente»): un cliente già scelto e salvato è
       una scelta fatta, non qualcosa che l'utente sta digitando ora. */
    const sceltoRef = useRef<string | null>(tieniScelto && testoIniziale ? testoIniziale : null);

    useEffect(() => {
        if (sceltoRef.current && testo === sceltoRef.current) { setHits([]); return; }
        const v = testo.trim().replace(/[(),]/g, " ").replace(/\s+/g, " ");
        if (v.length < 3) { setHits([]); return; }
        let vivo = true;
        setCercando(true);
        const t = setTimeout(async () => {
            const parole = v.split(" ").filter(Boolean);
            const cifre = v.replace(/\D/g, "");
            let q = supabase.from("clients")
                .select("id,tipo,nome,cognome,ragione_sociale,nome_ref,cognome_ref,cf_ref,cf_piva,cellulare,telefono_fisso,email,indirizzo,cap,citta,iban")
                .limit(6);
            if (tipo) q = q.eq("tipo", tipo);
            if (parole.length >= 2) {
                q = q.or(`and(nome.ilike.%${parole[0]}%,cognome.ilike.%${parole[1]}%),and(nome.ilike.%${parole[1]}%,cognome.ilike.%${parole[0]}%),ragione_sociale.ilike.%${v}%`);
            } else {
                // con ≥4 cifre si cerca su cellulare E telefono fisso (Luca 01/08)
                q = q.or(`cf_piva.ilike.%${v}%,nome.ilike.%${v}%,cognome.ilike.%${v}%,ragione_sociale.ilike.%${v}%${cifre.length >= 4 ? `,cellulare.ilike.%${cifre}%,telefono_fisso.ilike.%${cifre}%` : ""}`);
            }
            const { data } = await q;
            if (!vivo) return;
            setHits((data ?? []) as ClienteTrovato[]);
            setCercando(false);
        }, 300);
        return () => { vivo = false; clearTimeout(t); };
    }, [testo, tipo]);

    return (
        <div className={className}>
            <input value={testo} onChange={(e) => { sceltoRef.current = null; setTesto(e.target.value); onTesto?.(e.target.value); }}
                placeholder={placeholder}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500/50 transition-colors" />
            {testo.trim().length >= 3 && (
                hits.length > 0 ? (
                    <div className="mt-1.5 rounded-xl border border-white/10 overflow-hidden bg-[#12141f]">
                        {hits.map((c) => (
                            <button key={c.id} type="button"
                                onClick={() => {
                                    onScelto(c);
                                    if (tieniScelto) { const et = etichettaCliente(c); sceltoRef.current = et; setTesto(et); onTesto?.(et); }
                                    else setTesto("");
                                    setHits([]);
                                }}
                                className="block w-full text-left px-3.5 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/[0.06] transition-colors">
                                <span className="text-sm font-semibold text-slate-100">{etichettaCliente(c)}</span>
                                <span className="text-xs text-slate-500 ml-2">{[c.cf_piva, c.cellulare, c.telefono_fisso ? `fisso ${c.telefono_fisso}` : null].filter(Boolean).join(" · ")}</span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="mt-1.5 text-xs text-slate-500">{cercando ? "Ricerca in corso…" : "Nessuna anagrafica trovata: prosegui con l'inserimento manuale."}</p>
                )
            )}
        </div>
    );
}
