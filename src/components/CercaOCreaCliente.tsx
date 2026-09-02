"use client";

/* ═══ LA SCHEDA CLIENTE, FUORI DA REGISTRA VENDITA ═══════════════════════════
   Luca 02/09, sul telefono usato consegnato senza vendita: «la portiamo sul
   campo di ricerca del codice fiscale o di creazione della scheda del cliente,
   che deve avere le stesse identiche informazioni di Registra Vendita».

   Sono gli stessi campi che il banco compila quando vende — privato o
   business, referente, intestatario diverso, IBAN, indirizzo — e la stessa
   riga di `clients` che ne esce. Cambia solo il contorno: qui non c'è
   carrello, non c'è scontrino, non c'è contratto.

   ⚠️ DUE COSE CHE VENGONO DA LÌ E NON SI TOCCANO:

   1. IL VUOTO NON CANCELLA. `upsert` riscrive tutta la riga: su un cliente già
      noto, i campi lasciati vuoti qui sovrascriverebbero con "" quelli già
      salvati, e l'anagrafica si ridurrebbe a nome e cognome. Prima di
      scrivere si rilegge la riga e il vuoto tiene il valore di prima. È la
      Segnalazione 40 di Registra Vendita: qui sarebbe tornata identica.

   2. IL CELLULARE SI ARCHIVIA SENZA +39. Il prefisso lo mettono le
      integrazioni al momento dell'invio: scriverlo qui vorrebbe dire due
      formati nella stessa colonna, e un numero che non si trova più. */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { numeroNazionale } from "@/lib/telefono";
/* ⚠️ LA DATA DI NASCITA DAL CF È QUELLA DI CASA. Ne avevo scritta una copia
   qui: su 4.701 codici fiscali veri si arrendeva su 15 (le omocodie) dove
   quella ufficiale la ricava, e su un cliente NUOVO avrebbe salvato una data
   di nascita vuota dove Registra Vendita la riempie. Una seconda verità che
   diverge dalla prima è peggio di nessuna verità. */
import { dataNascitaDaCF } from "@/lib/dataNascita";

export type Anagrafica = {
    nome: string; cognome: string; cellulare: string; email: string;
    via: string; cap: string; citta: string; iban: string; cf: string;
    ragioneSociale: string; nomeRef: string; cognomeRef: string; cfRef: string;
    recapito: string; fisso: string;
    intDiverso: boolean; intNome: string; intCognome: string; intCf: string;
};
export const ANAGRAFICA_VUOTA: Anagrafica = {
    nome: "", cognome: "", cellulare: "", email: "", via: "", cap: "", citta: "", iban: "", cf: "",
    ragioneSociale: "", nomeRef: "", cognomeRef: "", cfRef: "", recapito: "", fisso: "",
    intDiverso: false, intNome: "", intCognome: "", intCf: "",
};

type Riga = Record<string, unknown>;


export function CercaOCreaCliente({ negozio, onCliente, onAnnulla }: {
    negozio?: string | null;
    /** chiamata con l'id del cliente scelto o creato */
    onCliente: (id: string, etichetta: string) => void;
    onAnnulla?: () => void;
}) {
    const [tipo, setTipo] = useState<"privato" | "business">("privato");
    const [cerca, setCerca] = useState("");
    const [sugg, setSugg] = useState<Riga[]>([]);
    const [ana, setAna] = useState<Anagrafica>(ANAGRAFICA_VUOTA);
    const [trovato, setTrovato] = useState<Riga | null>(null);
    const [aperta, setAperta] = useState(false);      // la scheda è visibile
    const [busy, setBusy] = useState(false);
    const [ko, setKo] = useState("");
    const tempo = useRef<ReturnType<typeof setTimeout> | null>(null);

    /* i suggerimenti mentre si scrive: codice fiscale, partita IVA o nome —
       le stesse tre strade del banco */
    useEffect(() => {
        const v = cerca.trim();
        if (tempo.current) clearTimeout(tempo.current);
        if (v.length < 3) { setSugg([]); return; }
        tempo.current = setTimeout(async () => {
            const compat = v.replace(/\s+/g, "");
            /* ⚠️ IL TESTO SI VIRGOLETTA. `.or()` è una grammatica: la virgola
               separa le condizioni, e cercando «Rossi, Mario» PostgREST
               rispondeva 400 — nessun suggerimento, e chi cercava concludeva
               che il cliente non c'era e ne creava un doppione. Fra virgolette
               la virgola torna un carattere come gli altri; le virgolette
               dentro il testo si raddoppiano. */
            const q = (x: string) => `"${x.replace(/"/g, '""')}"`;
            const { data } = await supabase.from("clients")
                .select("id, tipo, nome, cognome, ragione_sociale, cf_piva, cellulare")
                .or(`cf_piva.ilike.${q("%" + compat + "%")},nome.ilike.${q("%" + v + "%")},cognome.ilike.${q("%" + v + "%")},ragione_sociale.ilike.${q("%" + v + "%")}`)
                .limit(8);
            setSugg((data || []) as Riga[]);
        }, 320);
        return () => { if (tempo.current) clearTimeout(tempo.current); };
    }, [cerca]);

    const etichettaDi = (c: Riga) => String(c.tipo) === "business"
        ? String(c.ragione_sociale || "—")
        : `${c.nome || ""} ${c.cognome || ""}`.trim() || "—";

    const prendi = (c: Riga) => {
        setTrovato(c); setSugg([]); setAperta(true);
        setTipo(String(c.tipo) === "business" ? "business" : "privato");
        setAna({
            nome: String(c.nome || ""), cognome: String(c.cognome || ""),
            cellulare: String(c.cellulare || ""), email: String(c.email || ""),
            via: String(c.indirizzo || ""), cap: String(c.cap || ""), citta: String(c.citta || ""),
            iban: String(c.iban || ""), cf: String(c.cf_piva || ""),
            ragioneSociale: String(c.ragione_sociale || ""),
            nomeRef: String(c.nome_ref || ""), cognomeRef: String(c.cognome_ref || ""), cfRef: String(c.cf_ref || ""),
            recapito: "", fisso: String(c.telefono_fisso || ""),
            intDiverso: !!c.intestatario_diverso,
            intNome: String(c.intestatario_nome || ""), intCognome: String(c.intestatario_cognome || ""),
            intCf: String(c.intestatario_cf || ""),
        });
    };

    /** nuovo cliente: la scheda si apre vuota, col codice fiscale già scritto
     *  se quello che si è cercato ne ha la forma */
    const nuovo = () => {
        const v = cerca.trim().replace(/\s+/g, "").toUpperCase();
        setTrovato(null); setSugg([]); setAperta(true);
        setAna({ ...ANAGRAFICA_VUOTA, cf: /^[A-Z0-9]{11,16}$/.test(v) ? v : "" });
    };

    const salva = async () => {
        if (busy) return;
        setKo("");
        const cf = (ana.cf || "").trim().toUpperCase();
        const nome = tipo === "business" ? ana.ragioneSociale.trim() : `${ana.nome} ${ana.cognome}`.trim();
        if (!nome) { setKo(tipo === "business" ? "Manca la ragione sociale." : "Mancano nome e cognome."); return; }
        if (!cf) { setKo(tipo === "business" ? "Manca la partita IVA." : "Manca il codice fiscale."); return; }
        setBusy(true);
        try {
            /* ⚠️ IL VUOTO NON CANCELLA: si rilegge la riga e si tiene quello
               che c'era dove qui non si è scritto niente. */
            const prev: Riga = trovato?.id
                ? ((await supabase.from("clients").select("*").eq("id", trovato.id).maybeSingle()).data as Riga) || {}
                : {};
            const tieni = (v: string, col: string) => (v || "").trim() || (prev[col] as string | null) || null;
            const tel = numeroNazionale(ana.cellulare) || ana.cellulare.trim();
            const id = String(trovato?.id || `CL-${(cf || tel.replace(/\D/g, "") || "ND").replace(/\s/g, "")}-${Date.now()}`);
            const riga = {
                id,
                tipo: tipo === "privato" ? "consumer" : "business",
                nome: tieni(ana.nome, "nome"),
                cognome: tieni(ana.cognome, "cognome"),
                ragione_sociale: tieni(ana.ragioneSociale, "ragione_sociale"),
                nome_ref: tieni(ana.nomeRef, "nome_ref"),
                cognome_ref: tieni(ana.cognomeRef, "cognome_ref"),
                cf_ref: tipo === "business" ? (tieni(ana.cfRef, "cf_ref") || null) : ((prev.cf_ref as string | null) ?? null),
                cellulare: tel || (prev.cellulare as string | null) || null,
                telefono_fisso: tipo === "business" ? (tieni(ana.fisso, "telefono_fisso") || null) : ((prev.telefono_fisso as string | null) ?? null),
                email: tieni(ana.email, "email"),
                cf_piva: cf || null,
                data_nascita: dataNascitaDaCF(cf) || ((prev.data_nascita as string | null) ?? null),
                iban: tieni(ana.iban, "iban") || null,
                intestatario_diverso: !!ana.intDiverso,
                intestatario_nome: ana.intDiverso ? (ana.intNome || null) : null,
                intestatario_cognome: ana.intDiverso ? (ana.intCognome || null) : null,
                intestatario_cf: ana.intDiverso ? (ana.intCf || null) : null,
                indirizzo: tieni(ana.via, "indirizzo"),
                cap: tieni(ana.cap, "cap"),
                citta: tieni(ana.citta, "citta"),
                /* il negozio di acquisizione: storico, il primo vince */
                acquisito_da: (prev.acquisito_da as string) || negozio || null,
                is_demo: false,
            };
            const { error } = await supabase.from("clients").upsert(riga, { onConflict: "id" });
            /* ⚠️ IL CODICE FISCALE È UNICO A DATABASE (`uq_clients_cf_piva`).
               Senza questo, chi provava a creare un cliente già a sistema si
               prendeva in faccia il testo di Postgres — «duplicate key value
               violates unique constraint» — invece della cosa che gli serve:
               chi è quel cliente, così lo sceglie invece di reinventarlo. */
            if (error) {
                if (/duplicate key|uq_clients_cf_piva/i.test(error.message)) {
                    const { data: gia } = await supabase.from("clients")
                        .select("id, tipo, nome, cognome, ragione_sociale, cf_piva, cellulare")
                        .ilike("cf_piva", cf).limit(1);
                    const c0 = (gia || [])[0] as Riga | undefined;
                    if (c0) {
                        setKo(`Questo codice è già di «${etichettaDi(c0)}». Cercalo qui sopra e scegli quello, invece di crearne un altro.`);
                        setCerca(cf); setBusy(false); return;
                    }
                }
                throw error;
            }
            onCliente(id, nome);
        } catch (e) { setKo((e as Error)?.message || "non sono riuscito a salvare il cliente"); }
        finally { setBusy(false); }
    };

    const C = ({ l, v, set, ph, mono }: { l: string; v: string; set: (x: string) => void; ph?: string; mono?: boolean }) => (
        <label className="rvCampo">
            <span className="rvLab">{l}</span>
            <input value={v} onChange={(e) => set(e.target.value)} placeholder={ph}
                className="glass-input w-full text-sm" style={mono ? { fontFamily: "monospace", letterSpacing: 1 } : undefined} />
        </label>
    );

    return (
        <div className="space-y-3">
            {/* ── LA RICERCA ─────────────────────────────────────────── */}
            <div className="rvCampo">
                <span className="rvLab">Cerca il cliente — codice fiscale, partita IVA o nome</span>
                <input value={cerca} onChange={(e) => setCerca(e.target.value.toUpperCase())} autoFocus
                    placeholder="RSSMRA80A01H501Z — oppure Mario Rossi"
                    className="glass-input w-full text-sm" style={{ fontFamily: "monospace", letterSpacing: 1 }} />
            </div>
            {sugg.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/30 divide-y divide-white/5 max-h-56 overflow-y-auto">
                    {sugg.map((c) => (
                        <button key={String(c.id)} type="button" onClick={() => prendi(c)}
                            className="w-full text-left px-3 py-2 hover:bg-indigo-500/15 transition-colors">
                            <div className="text-sm text-white font-semibold">{etichettaDi(c)}</div>
                            <div className="text-[11px] text-slate-500">
                                {String(c.cf_piva || "senza codice")}{c.cellulare ? ` · ${c.cellulare}` : ""}
                                {String(c.tipo) === "business" ? " · business" : ""}
                            </div>
                        </button>
                    ))}
                </div>
            )}
            {cerca.trim().length >= 3 && !aperta && (
                <button type="button" onClick={nuovo} className="rvPill rvPill-sm rvPill-tinta rvT-indaco">
                    ＋ Non c&apos;è: crea la scheda del cliente
                </button>
            )}

            {/* ── LA SCHEDA, con gli stessi campi del banco ──────────── */}
            {aperta && (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="rvLab" style={{ marginBottom: 0 }}>Tipo</span>
                        {(["privato", "business"] as const).map((t) => (
                            <button key={t} type="button" onClick={() => setTipo(t)} aria-pressed={tipo === t}
                                className={`rvPill rvPill-sm rvPill-tinta rvT-indaco${tipo === t ? " rvPill-on" : ""}`}>
                                {t === "privato" ? "Privato" : "Business"}
                            </button>
                        ))}
                        {trovato && <span className="rvBadge rvBadge-ok ml-auto">già a sistema</span>}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {tipo === "privato" ? (
                            <>
                                <C l="Nome" v={ana.nome} set={(x) => setAna({ ...ana, nome: x })} />
                                <C l="Cognome" v={ana.cognome} set={(x) => setAna({ ...ana, cognome: x })} />
                                <C l="Codice fiscale" v={ana.cf} set={(x) => setAna({ ...ana, cf: x.toUpperCase() })} mono />
                            </>
                        ) : (
                            <>
                                <C l="Ragione sociale" v={ana.ragioneSociale} set={(x) => setAna({ ...ana, ragioneSociale: x })} />
                                <C l="Partita IVA" v={ana.cf} set={(x) => setAna({ ...ana, cf: x.toUpperCase() })} mono />
                                <C l="Nome referente" v={ana.nomeRef} set={(x) => setAna({ ...ana, nomeRef: x })} />
                                <C l="Cognome referente" v={ana.cognomeRef} set={(x) => setAna({ ...ana, cognomeRef: x })} />
                                <C l="CF referente" v={ana.cfRef} set={(x) => setAna({ ...ana, cfRef: x.toUpperCase() })} mono />
                                <C l="Telefono fisso" v={ana.fisso} set={(x) => setAna({ ...ana, fisso: x })} />
                            </>
                        )}
                        <C l="Cellulare" v={ana.cellulare} set={(x) => setAna({ ...ana, cellulare: x })} />
                        <C l="Email" v={ana.email} set={(x) => setAna({ ...ana, email: x })} />
                        <C l="Indirizzo" v={ana.via} set={(x) => setAna({ ...ana, via: x })} />
                        <C l="CAP" v={ana.cap} set={(x) => setAna({ ...ana, cap: x })} />
                        <C l="Città" v={ana.citta} set={(x) => setAna({ ...ana, citta: x })} />
                        <C l="IBAN" v={ana.iban} set={(x) => setAna({ ...ana, iban: x.toUpperCase() })} mono />
                    </div>

                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input type="checkbox" checked={ana.intDiverso} onChange={(e) => setAna({ ...ana, intDiverso: e.target.checked })} />
                        L&apos;intestatario è una persona diversa
                    </label>
                    {ana.intDiverso && (
                        <div className="grid grid-cols-3 gap-2">
                            <C l="Nome intestatario" v={ana.intNome} set={(x) => setAna({ ...ana, intNome: x })} />
                            <C l="Cognome intestatario" v={ana.intCognome} set={(x) => setAna({ ...ana, intCognome: x })} />
                            <C l="CF intestatario" v={ana.intCf} set={(x) => setAna({ ...ana, intCf: x.toUpperCase() })} mono />
                        </div>
                    )}

                    {ko && <div className="rvNota rvNota-ko"><div className="rvNota-s">{ko}</div></div>}
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={salva} disabled={busy} className="rvPill rvPill-sm rvPill-on rvT-verde">
                            {busy ? "salvo…" : trovato ? "✓ Usa questo cliente" : "✓ Crea e usa"}
                        </button>
                        <button type="button" onClick={() => { setAperta(false); setTrovato(null); setAna(ANAGRAFICA_VUOTA); onAnnulla?.(); }}
                            className="rvPill rvPill-sm">Annulla</button>
                    </div>
                </div>
            )}
        </div>
    );
}
