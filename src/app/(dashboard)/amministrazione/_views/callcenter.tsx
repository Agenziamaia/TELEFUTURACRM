"use client";

// CALL CENTER (Luca 30/07, mig. 105): pannello per gestire le opzioni della
// sezione Caller — esiti/stati, provenienze, tipologie e obiettivi. Le voci
// vivono in caller_opzioni: aggiungi, rinomina, riordina, spegni (le pratiche
// gia' salvate mantengono il testo con cui sono state esitate). ATTENZIONE:
// gli stati con automatismi (NR → WhatsApp, richiami, appuntamenti →
// calendario) sono riconosciuti PER NOME nel codice del Caller.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Phone, Plus, ChevronUp, ChevronDown, MessageSquare } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { SelectOpzioni } from "@/components/SelectPersona";

type Opzione = { id: string; categoria: string; voce: string; ordine: number; attiva: boolean; comportamento?: string | null };

// COMPORTAMENTO dello stato (mig. 119, Luca 31/07): niente piu' riconoscimento
// per nome nel codice — l'automatismo si sceglie qui, voce per voce.
const COMPORTAMENTI: { id: string; label: string }[] = [
    { id: "neutro", label: "— nessuno" },
    { id: "appuntamento", label: "📅 Appuntamento" },
    { id: "richiamo", label: "☎ Richiamo" },
    { id: "non_risposto", label: "📵 Non risposto" },
    // SALTATO (Luca 31/08): il cliente non si e' presentato all'appuntamento.
    // Non e' un «non risposto»: i messaggi WhatsApp che riceve parlano di
    // riprogrammare, non di «ti ho cercato». Lo stato che porta questo
    // comportamento accende lo scenario 🚪 dei modelli.
    { id: "saltato", label: "🚪 Appuntamento saltato" },
    // ESITO DEFINITIVO (Luca 11/08, come il 🏁 del Tracking PDA): archivia la
    // pratica/lead — esce dalla lista di lavoro del Caller (si rivede col
    // toggle 🗂 Archiviate), non resta in perenne lavorazione e non genera malus
    { id: "definitivo", label: "🏁 Definitivo — archivia" },
];

const CATEGORIE: { id: string; label: string; hint: string }[] = [
    { id: "stato", label: "Stati / Esiti", hint: "La lista che i caller scelgono quando esitano una chiamata. La tendina a destra decide l'AUTOMATISMO della voce: 📅 Appuntamento = chiede data/negozio e va sul calendario; ☎ Richiamo = chiede la data e crea il promemoria; 📵 Non risposto = apre il WhatsApp con i messaggi «ti ho cercato»; 🚪 Appuntamento saltato = apre il WhatsApp con i messaggi che propongono di riprogrammare (il cliente non si è presentato); 🏁 Definitivo = ARCHIVIA la pratica (esce dal lavoro, niente malus — si rivede col toggle 🗂 Archiviate)." },
    { id: "provenienza", label: "Provenienze", hint: "Da dove arriva il lead." },
    { id: "tipologia", label: "Tipologie", hint: "Il tipo di attività della chiamata." },
    { id: "obiettivo", label: "Obiettivi", hint: "Cosa si vuole vendere/ottenere." },
];

// ── MODELLI WHATSAPP (CAL-01, Luca 04/08 — testi rifatti il 31/08) ───────────
// I messaggi pronti che i caller inviano dal modale WhatsApp della pratica.
// Lo SCENARIO e' agganciato al comportamento dello stato (non ai nomi);
// brand/obiettivo/provenienza/tipologia vuoti = il modello vale per tutti.
// Piu' varianti nello stesso GRUPPO = rotazione anti-ban sul singolo numero.
//
// I GRUPPI SONO IL TONO (Luca 31/08): «-lei» e «-tu» dentro lo stesso scenario
// diventano due schede nel modale del caller, che sceglie come dare del
// cliente; dentro la scheda il CRM ruota da solo la variante, evitando quella
// usata per ultima su quel numero. Se si aggiunge un gruppo nuovo, compare
// come scheda in piu': e' il modo per creare un terzo tono.

type WaTemplate = {
    id: string; gruppo: string; titolo: string | null; corpo: string; scenario: string;
    brand: string | null; obiettivo: string | null; provenienza: string | null; tipologia: string | null;
    attivo: boolean; ordine: number;
};

const SCENARI_WA: { id: string; label: string }[] = [
    { id: "nr", label: "📵 Non risposto" },
    { id: "richiamo", label: "☎ Richiamo" },
    { id: "appuntamento", label: "📅 Appuntamento" },
    // il cliente non si e' presentato e non risponde: ha messaggi suoi, che
    // parlano di riprogrammare (Luca 31/08). Si accende sullo stato «Non andato»
    { id: "saltato", label: "🚪 Appuntamento saltato" },
    { id: "generico", label: "💬 Generico" },
];
const scenLabelWa = (id: string) => SCENARI_WA.find((s) => s.id === id)?.label || id;
const scenIdWa = (label: string) => SCENARI_WA.find((s) => s.label === label)?.id || "";

// stessi brand cablati della sezione Caller (caller_opzioni non ha la categoria)
const BRANDS_WA = ["WindTre", "Vodafone", "Fastweb", "Sky", "Energia", "Tim", "Altro"];

// {cognome} RIMOSSO dai chips (Luca 06/08): verso il cliente si usa solo il
// primo nome — suo e di chi scrive ({caller} = primo nome dell'utente loggato).
// Il placeholder resta neutralizzato nel motore per i testi vecchi.
// {indirizzo} = l'indirizzo del negozio, dall'anagrafica (Amministrazione →
// Negozi → Indirizzo). Se non e' compilato sparisce dal messaggio insieme alla
// preposizione che lo reggeva, quindi si puo' usare senza paura di spedire un
// segnaposto al cliente.
const PLACEHOLDER_WA = [
    "{nome}", "{ragione_sociale}", "{brand}", "{obiettivo}",
    "{negozio}", "{indirizzo}", "{negozio_pertinenza}", "{data_appuntamento}", "{ora_appuntamento}",
    "{fascia_appuntamento}", "{data_richiamo}", "{fascia_richiamo}", "{caller}",
];

// chips di placeholder cliccabili: si appendono al testo in scrittura
function ChipsPlaceholder({ onPick }: { onPick: (p: string) => void }) {
    return (
        <div className="flex flex-wrap gap-1">
            {PLACEHOLDER_WA.map((p) => (
                <button key={p} type="button" onClick={() => onPick(p)} title="Aggiungi al testo"
                    className="px-1.5 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[10px] font-mono hover:bg-indigo-500/25">
                    {p}
                </button>
            ))}
        </div>
    );
}

function ModelliWaView({ opzioniCaller }: { opzioniCaller: Opzione[] }) {
    const [modelli, setModelli] = useState<WaTemplate[]>([]);
    const [usi, setUsi] = useState<Record<string, number>>({});
    const [err, setErr] = useState<string | null>(null);
    // filtri "tipo catalogo": simulano la pratica — si vedono i modelli che
    // MATCHEREBBERO con quelle opzioni (vuoto = tutte)
    const [fScenario, setFScenario] = useState("");
    const [fBrand, setFBrand] = useState("");
    const [fObiettivo, setFObiettivo] = useState("");
    const [fProvenienza, setFProvenienza] = useState("");
    const [fTipologia, setFTipologia] = useState("");
    // editing di una variante
    const [editId, setEditId] = useState<string | null>(null);
    const [editTitolo, setEditTitolo] = useState("");
    const [editCorpo, setEditCorpo] = useState("");
    const [delId, setDelId] = useState<string | null>(null);
    // nuova variante per gruppo esistente
    const [varNuova, setVarNuova] = useState<Record<string, string>>({});
    // nuovo gruppo/modello
    const [nuovoOpen, setNuovoOpen] = useState(false);
    const [nuovoGruppo, setNuovoGruppo] = useState("");
    const [nuovoTitolo, setNuovoTitolo] = useState("");
    const [nuovoScenario, setNuovoScenario] = useState("");
    const [nuovoCorpo, setNuovoCorpo] = useState("");

    const opz = (cat: string) => opzioniCaller.filter((r) => r.categoria === cat && r.attiva).sort((a, b) => a.ordine - b.ordine).map((r) => r.voce);
    const OBIETTIVI_WA = opz("obiettivo");
    const PROVENIENZE_WA = opz("provenienza");
    const TIPOLOGIE_WA = opz("tipologia");

    const carica = useCallback(async () => {
        const { data, error } = await supabase.from("wa_templates").select("*")
            .order("gruppo").order("ordine").order("created_at");
        if (error) { setErr(/wa_templates/i.test(error.message) ? "Manca la migrazione wa_templates (modelli WhatsApp)." : error.message); return; }
        setErr(null);
        setModelli((data ?? []) as WaTemplate[]);
        // contatore usi dal log invii (best-effort)
        const { data: inv } = await supabase.from("wa_template_invii").select("template_id");
        const cnt: Record<string, number> = {};
        ((inv ?? []) as { template_id: string | null }[]).forEach((r) => { if (r.template_id) cnt[r.template_id] = (cnt[r.template_id] || 0) + 1; });
        setUsi(cnt);
    }, []);
    useEffect(() => { carica(); }, [carica]);

    // match come nel modale del caller: campo del modello vuoto = jolly
    const visibili = useMemo(() => modelli.filter((t) =>
        (!fScenario || t.scenario === fScenario) &&
        (!fBrand || !t.brand || t.brand === fBrand) &&
        (!fObiettivo || !t.obiettivo || t.obiettivo === fObiettivo) &&
        (!fProvenienza || !t.provenienza || t.provenienza === fProvenienza) &&
        (!fTipologia || !t.tipologia || t.tipologia === fTipologia)
    ), [modelli, fScenario, fBrand, fObiettivo, fProvenienza, fTipologia]);
    const gruppi = useMemo(() => {
        const m = new Map<string, WaTemplate[]>();
        visibili.forEach((t) => { const arr = m.get(t.gruppo) || []; arr.push(t); m.set(t.gruppo, arr); });
        return [...m.entries()];
    }, [visibili]);

    const salvaEdit = async (t: WaTemplate) => {
        const corpo = editCorpo.trim();
        setEditId(null);
        if (!corpo || (corpo === t.corpo && editTitolo.trim() === (t.titolo || ""))) return;
        const { error } = await supabase.from("wa_templates").update({ corpo, titolo: editTitolo.trim() || null }).eq("id", t.id);
        if (error) { setErr(error.message); return; }
        carica();
    };
    const toggleAttivo = async (t: WaTemplate) => {
        await supabase.from("wa_templates").update({ attivo: !t.attivo }).eq("id", t.id);
        carica();
    };
    const elimina = async (t: WaTemplate) => {
        setDelId(null);
        await supabase.from("wa_templates").delete().eq("id", t.id);
        carica();
    };
    // nuova variante: eredita scenario e destinatari (brand/obiettivo/...) dal gruppo
    const aggiungiVariante = async (gruppo: string, base: WaTemplate) => {
        const corpo = (varNuova[gruppo] || "").trim();
        if (!corpo) return;
        const maxOrd = Math.max(0, ...modelli.filter((m) => m.gruppo === gruppo).map((m) => m.ordine));
        const { error } = await supabase.from("wa_templates").insert({
            gruppo, titolo: null, corpo, scenario: base.scenario,
            brand: base.brand, obiettivo: base.obiettivo, provenienza: base.provenienza, tipologia: base.tipologia,
            ordine: maxOrd + 10,
        });
        if (error) { setErr(error.message); return; }
        setVarNuova((p) => ({ ...p, [gruppo]: "" }));
        carica();
    };
    // nuovo modello: nasce con le opzioni selezionate nei filtri (vuoto = jolly)
    const aggiungiModello = async () => {
        const gruppo = nuovoGruppo.trim();
        const corpo = nuovoCorpo.trim();
        const scenario = scenIdWa(nuovoScenario);
        if (!gruppo || !corpo || !scenario) return;
        const maxOrd = Math.max(0, ...modelli.filter((m) => m.gruppo === gruppo).map((m) => m.ordine));
        const { error } = await supabase.from("wa_templates").insert({
            gruppo, titolo: nuovoTitolo.trim() || null, corpo, scenario,
            brand: fBrand || null, obiettivo: fObiettivo || null,
            provenienza: fProvenienza || null, tipologia: fTipologia || null,
            ordine: maxOrd + 10,
        });
        if (error) { setErr(error.message); return; }
        setNuovoGruppo(""); setNuovoTitolo(""); setNuovoCorpo(""); setNuovoOpen(false);
        carica();
    };

    const destinatariLabel = (t: WaTemplate) => {
        const parti = [t.brand, t.obiettivo, t.provenienza, t.tipologia].filter(Boolean);
        return parti.length ? parti.join(" · ") : "tutti";
    };

    return (
        <div className="glass-panel p-5">
            <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex-1">
                    <h3 className="text-sm font-bold text-white">Modelli WhatsApp <span className="text-slate-500 font-normal">· {modelli.filter((m) => m.attivo).length} attivi</span></h3>
                    <p className="text-[11px] text-slate-500">I messaggi pronti del bottone WhatsApp dei caller. Scegli le opzioni per vedere quali modelli matcherebbero su una pratica così fatta.
                        <br /><b className="text-slate-400">Il gruppo è il tono</b>: «…-lei» e «…-tu» diventano due schede fra cui il caller sceglie — un gruppo nuovo è una scheda in più, cioè un terzo tono. Dentro la scheda le varianti <b className="text-slate-400">ruotano da sole</b> (anti-ban), quindi scrivile DAVVERO diverse tra loro.</p>
                </div>
                <button onClick={() => setNuovoOpen((v) => !v)}
                    className="px-3.5 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center gap-1.5 shrink-0">
                    <Plus className="w-4 h-4" /> Nuovo modello
                </button>
            </div>

            {err && <div className="p-3 mt-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{err}</div>}

            {/* filtri "simula la pratica" — tendine standard del CRM */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
                <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-widest">Scenario</label>
                    <SelectOpzioni value={fScenario ? scenLabelWa(fScenario) : ""} onChange={(v) => setFScenario(scenIdWa(v))} opzioni={SCENARI_WA.map((s) => s.label)} placeholder="Tutti…" className="glass-input rounded-lg py-2 w-full text-sm" />
                </div>
                <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-widest">Brand</label>
                    <SelectOpzioni value={fBrand} onChange={setFBrand} opzioni={BRANDS_WA} placeholder="Tutti…" className="glass-input rounded-lg py-2 w-full text-sm" />
                </div>
                <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-widest">Obiettivo</label>
                    <SelectOpzioni value={fObiettivo} onChange={setFObiettivo} opzioni={OBIETTIVI_WA} placeholder="Tutti…" className="glass-input rounded-lg py-2 w-full text-sm" />
                </div>
                <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-widest">Provenienza</label>
                    <SelectOpzioni value={fProvenienza} onChange={setFProvenienza} opzioni={PROVENIENZE_WA} placeholder="Tutte…" className="glass-input rounded-lg py-2 w-full text-sm" />
                </div>
                <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-widest">Tipologia</label>
                    <SelectOpzioni value={fTipologia} onChange={setFTipologia} opzioni={TIPOLOGIE_WA} placeholder="Tutte…" className="glass-input rounded-lg py-2 w-full text-sm" />
                </div>
            </div>

            {/* nuovo modello (gruppo nuovo o variante con destinatari diversi) */}
            {nuovoOpen && (
                <div className="mt-3 p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] space-y-2.5">
                    <p className="text-[11px] font-bold text-emerald-300 uppercase tracking-widest">Nuovo modello — nasce con le opzioni selezionate sopra (vuote = vale per tutti)</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input value={nuovoGruppo} onChange={(e) => setNuovoGruppo(e.target.value)} placeholder="Gruppo (es. nr-primo-contatto)" className="glass-input !h-9 text-sm" />
                        <input value={nuovoTitolo} onChange={(e) => setNuovoTitolo(e.target.value)} placeholder="Titolo (facoltativo)" className="glass-input !h-9 text-sm" />
                        <SelectOpzioni value={nuovoScenario} onChange={setNuovoScenario} opzioni={SCENARI_WA.map((s) => s.label)} placeholder="Scenario…" className="glass-input rounded-lg py-2 w-full text-sm" />
                    </div>
                    <textarea value={nuovoCorpo} onChange={(e) => setNuovoCorpo(e.target.value)} placeholder="Testo del messaggio — usa i placeholder qui sotto…" className="glass-input rounded-lg py-2 w-full min-h-[70px] text-sm" />
                    <ChipsPlaceholder onPick={(p) => setNuovoCorpo((v) => (v ? v + " " : "") + p)} />
                    <div className="flex gap-2">
                        <button onClick={aggiungiModello} disabled={!nuovoGruppo.trim() || !nuovoCorpo.trim() || !scenIdWa(nuovoScenario)}
                            className="px-3.5 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-40 flex items-center gap-1.5">
                            <Plus className="w-4 h-4" /> Aggiungi
                        </button>
                        <button onClick={() => setNuovoOpen(false)} className="px-3 h-9 rounded-xl border border-white/10 text-slate-400 text-sm">Annulla</button>
                    </div>
                </div>
            )}

            {/* elenco per gruppo, con le varianti */}
            <div className="mt-4 space-y-3">
                {gruppi.length === 0 && !err && (
                    <p className="text-sm text-slate-500">Nessun modello per questa combinazione di opzioni.</p>
                )}
                {gruppi.map(([g, vars]) => (
                    <div key={g} className="p-3.5 rounded-xl border border-white/8 bg-white/[0.02]">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="text-xs font-bold text-white">{g}</span>
                            <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[10px] font-bold">{scenLabelWa(vars[0].scenario)}</span>
                            <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-400 text-[10px]">per: {destinatariLabel(vars[0])}</span>
                            <span className="text-[10px] text-slate-500">{vars.length} variant{vars.length === 1 ? "e" : "i"}</span>
                        </div>
                        <div className="space-y-2">
                            {vars.map((t) => (
                                <div key={t.id} className={`p-2.5 rounded-lg border ${t.attivo ? "border-white/8 bg-black/20" : "border-white/5 opacity-50"}`}>
                                    {editId === t.id ? (
                                        <div className="space-y-2">
                                            <input value={editTitolo} onChange={(e) => setEditTitolo(e.target.value)} placeholder="Titolo (facoltativo)" className="glass-input !h-8 text-sm w-full" />
                                            <textarea autoFocus value={editCorpo} onChange={(e) => setEditCorpo(e.target.value)} className="glass-input rounded-lg py-2 w-full min-h-[70px] text-sm" />
                                            <ChipsPlaceholder onPick={(p) => setEditCorpo((v) => (v ? v + " " : "") + p)} />
                                            <div className="flex gap-2">
                                                <button onClick={() => salvaEdit(t)} className="px-3 h-8 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold">Salva</button>
                                                <button onClick={() => setEditId(null)} className="px-2.5 h-8 rounded-lg border border-white/10 text-slate-400 text-xs">Annulla</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-start gap-2">
                                            <button onClick={() => { setEditId(t.id); setEditTitolo(t.titolo || ""); setEditCorpo(t.corpo); }} title="Clicca per modificare il testo"
                                                className="flex-1 text-left">
                                                {t.titolo && <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{t.titolo}</span>}
                                                <span className="block text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{t.corpo}</span>
                                            </button>
                                            <span title="Invii registrati con questa variante" className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[10px] font-bold">{usi[t.id] || 0} usi</span>
                                            <button onClick={() => toggleAttivo(t)} title={t.attivo ? "Attiva — clicca per spegnerla" : "Spenta — clicca per riattivarla"}
                                                className={`relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5 ${t.attivo ? "bg-emerald-500/70" : "bg-white/10"}`}>
                                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${t.attivo ? "left-[18px]" : "left-0.5"}`} />
                                            </button>
                                            {delId === t.id ? (
                                                <span className="inline-flex gap-1 shrink-0">
                                                    <button onClick={() => elimina(t)} className="text-[10px] px-2 py-1 rounded-md bg-rose-500/20 border border-rose-500/50 text-rose-300 font-bold">Elimina</button>
                                                    <button onClick={() => setDelId(null)} className="text-[10px] px-1.5 py-1 rounded-md text-slate-400">✕</button>
                                                </span>
                                            ) : (
                                                <button onClick={() => setDelId(t.id)} title="Elimina la variante (gli invii già fatti restano nel log)"
                                                    className="p-1 rounded-md text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 shrink-0">🗑</button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        {/* nuova variante nello stesso gruppo (stessi destinatari) */}
                        <div className="flex gap-2 mt-2">
                            <input value={varNuova[g] || ""} onChange={(e) => setVarNuova((p) => ({ ...p, [g]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === "Enter") aggiungiVariante(g, vars[0]); }}
                                placeholder="Nuova variante di questo messaggio (testo diverso, stesso scopo)…" className="glass-input flex-1 !h-9 text-sm" />
                            <button onClick={() => aggiungiVariante(g, vars[0])} disabled={!(varNuova[g] || "").trim()}
                                className="px-3 h-9 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200 text-sm font-bold disabled:opacity-40 flex items-center gap-1.5">
                                <Plus className="w-4 h-4" /> Variante
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ── REGOLE DEL MATCH vendita ↔ appuntamento (Luca 24/08): la finestra
   temporale — dalla chiamata che fissa l'appuntamento a +N giorni dalla data
   fissata — si governa da qui, non più cablata nel codice. Gli esiti
   «Attivato» e «Attivato Altro Negozio» li scrive SOLO il match. ────────── */
function MatchConfigCard() {
    const [gg, setGg] = useState<string>("");
    const [caricato, setCaricato] = useState(false);
    const [salvato, setSalvato] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    useEffect(() => {
        (async () => {
            const { data, error } = await supabase.from("caller_match_config").select("finestra_giorni").eq("id", 1).maybeSingle();
            if (error) { setErr(error.message + " — probabilmente manca la migrazione caller_match_config"); return; }
            setGg(String(data?.finestra_giorni ?? 30));
            setCaricato(true);
        })();
    }, []);
    const salva = async () => {
        const v = Math.round(Number(gg));
        if (!Number.isFinite(v) || v < 1 || v > 365) { setErr("Inserisci un numero di giorni tra 1 e 365."); return; }
        setErr(null);
        const { error } = await supabase.from("caller_match_config").update({ finestra_giorni: v, updated_at: new Date().toISOString() }).eq("id", 1);
        if (error) { setErr(error.message); return; }
        try { const m = await import("@/lib/matchAppuntamento"); m.resetCacheMatchConfig(); } catch { /* ok */ }
        setSalvato(true); setTimeout(() => setSalvato(false), 2000);
    };
    return (
        <div className="glass-card p-4 rounded-xl space-y-2">
            <p className="text-sm font-bold text-white">🎯 Match vendita ↔ appuntamento</p>
            <p className="text-[12px] text-slate-400 leading-relaxed">Gli esiti <b className="text-slate-200">«Attivato»</b> e <b className="text-slate-200">«Attivato Altro Negozio»</b> non si scelgono a mano: li scrive il match quando una vendita col CF del cliente arriva <b className="text-slate-200">dalla chiamata che ha fissato l&apos;appuntamento fino a N giorni dopo la data fissata</b> (il cliente in anticipo conta; gemelli per sede fisica).</p>
            {err && <p className="text-[12px] text-rose-400">{err}</p>}
            <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[12px] text-slate-400">Finestra dopo la data dell&apos;appuntamento:</label>
                <input type="number" min={1} max={365} value={gg} disabled={!caricato}
                    onChange={(e) => setGg(e.target.value)}
                    className="glass-input w-24 text-sm rounded-lg py-1.5 text-center font-mono" />
                <span className="text-[12px] text-slate-500">giorni</span>
                <span className="text-[11px] text-slate-600">· le sessioni già aperte usano il valore nuovo dal prossimo ricaricamento</span>
                <button onClick={salva} disabled={!caricato}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-bold disabled:opacity-40">
                    {salvato ? "✓ Salvato" : "Salva"}
                </button>
            </div>
        </div>
    );
}

export function CallCenterView() {
    const [righe, setRighe] = useState<Opzione[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const [nuova, setNuova] = useState<Record<string, string>>({});
    const [delId, setDelId] = useState<string | null>(null);
    const [editId, setEditId] = useState<string | null>(null);
    const [editVal, setEditVal] = useState("");

    const carica = useCallback(async () => {
        const { data, error } = await supabase.from("caller_opzioni").select("*").order("ordine");
        if (error) { setErr(error.message + " — probabilmente manca la migrazione 105"); return; }
        setErr(null);
        setRighe((data ?? []) as Opzione[]);
    }, []);
    useEffect(() => { carica(); }, [carica]);

    const aggiungi = async (categoria: string) => {
        const voce = (nuova[categoria] || "").trim();
        if (!voce) return;
        const maxOrd = Math.max(0, ...righe.filter((r) => r.categoria === categoria).map((r) => r.ordine));
        const { error } = await supabase.from("caller_opzioni").insert({ categoria, voce, ordine: maxOrd + 10 });
        if (error) { setErr(error.message.includes("duplicate") ? `"${voce}" esiste già in questa lista.` : error.message); return; }
        setNuova((p) => ({ ...p, [categoria]: "" }));
        carica();
    };
    const salvaRinomina = async (r: Opzione) => {
        const voce = editVal.trim();
        setEditId(null);
        if (!voce || voce === r.voce) return;
        const { error } = await supabase.from("caller_opzioni").update({ voce }).eq("id", r.id);
        if (error) { setErr(error.message.includes("duplicate") ? `"${voce}" esiste già in questa lista.` : error.message); return; }
        carica();
    };
    const toggle = async (r: Opzione) => {
        await supabase.from("caller_opzioni").update({ attiva: !r.attiva }).eq("id", r.id);
        carica();
    };
    const elimina = async (r: Opzione) => {
        setDelId(null);
        await supabase.from("caller_opzioni").delete().eq("id", r.id);
        carica();
    };
    const sposta = async (r: Opzione, dir: -1 | 1) => {
        const lista = righe.filter((x) => x.categoria === r.categoria).sort((a, b) => a.ordine - b.ordine);
        const i = lista.findIndex((x) => x.id === r.id);
        const altro = lista[i + dir];
        if (!altro) return;
        await supabase.from("caller_opzioni").update({ ordine: altro.ordine }).eq("id", r.id);
        await supabase.from("caller_opzioni").update({ ordine: r.ordine }).eq("id", altro.id);
        carica();
    };

    return (
        <div className="space-y-6">
            <MatchConfigCard />
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
                    <Phone className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Call Center — opzioni della sezione Caller</h2>
                    <p className="text-sm text-slate-400">Le liste che i caller vedono nei form e nei filtri. Spegnere una voce la toglie dalle scelte nuove; le pratiche già salvate mantengono il loro testo.</p>
                </div>
            </div>

            {err && <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{err}</div>}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {CATEGORIE.map((cat) => {
                    const voci = righe.filter((r) => r.categoria === cat.id).sort((a, b) => a.ordine - b.ordine);
                    return (
                        <div key={cat.id} className="glass-panel p-5">
                            <h3 className="text-sm font-bold text-white">{cat.label} <span className="text-slate-500 font-normal">· {voci.filter((v) => v.attiva).length} attive</span></h3>
                            <p className="text-[11px] text-slate-500 mt-0.5 mb-3">{cat.hint}</p>
                            <div className="space-y-1">
                                {voci.map((r, i) => (
                                    <div key={r.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${r.attiva ? "border-white/8 bg-white/[0.02]" : "border-white/5 bg-transparent opacity-50"}`}>
                                        <div className="flex flex-col -my-1">
                                            <button onClick={() => sposta(r, -1)} disabled={i === 0} className="text-slate-600 hover:text-white disabled:opacity-20 leading-none"><ChevronUp className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => sposta(r, 1)} disabled={i === voci.length - 1} className="text-slate-600 hover:text-white disabled:opacity-20 leading-none"><ChevronDown className="w-3.5 h-3.5" /></button>
                                        </div>
                                        {editId === r.id ? (
                                            <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                                                onBlur={() => salvaRinomina(r)}
                                                onKeyDown={(e) => { if (e.key === "Enter") salvaRinomina(r); if (e.key === "Escape") setEditId(null); }}
                                                className="flex-1 glass-input !h-7 text-sm px-2" />
                                        ) : (
                                            <button onClick={() => { setEditId(r.id); setEditVal(r.voce); }} title="Clicca per rinominare"
                                                className="flex-1 text-left text-sm text-slate-200 hover:text-white truncate">{r.voce}</button>
                                        )}
                                        {cat.id === "stato" && (
                                            <select value={r.comportamento || "neutro"}
                                                onChange={async (e) => {
                                                    const { error } = await supabase.from("caller_opzioni").update({ comportamento: e.target.value }).eq("id", r.id);
                                                    if (error) setErr(/comportamento/i.test(error.message) ? "Manca la migrazione 119 (colonna comportamento)." : error.message);
                                                    carica();
                                                }}
                                                title="Automatismo dello stato nel Caller"
                                                className="shrink-0 bg-black/40 border border-white/10 rounded-lg px-1.5 py-1 text-[11px] text-slate-300 outline-none cursor-pointer">
                                                {COMPORTAMENTI.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                                            </select>
                                        )}
                                        <button onClick={() => toggle(r)} title={r.attiva ? "Attiva — clicca per spegnerla" : "Spenta — clicca per riattivarla"}
                                            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${r.attiva ? "bg-emerald-500/70" : "bg-white/10"}`}>
                                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${r.attiva ? "left-[18px]" : "left-0.5"}`} />
                                        </button>
                                        {delId === r.id ? (
                                            <span className="inline-flex gap-1 shrink-0">
                                                <button onClick={() => elimina(r)} className="text-[10px] px-2 py-1 rounded-md bg-rose-500/20 border border-rose-500/50 text-rose-300 font-bold">Elimina</button>
                                                <button onClick={() => setDelId(null)} className="text-[10px] px-1.5 py-1 rounded-md text-slate-400">✕</button>
                                            </span>
                                        ) : (
                                            <button onClick={() => setDelId(r.id)} title="Elimina la voce (le pratiche vecchie mantengono il testo)"
                                                className="p-1 rounded-md text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 shrink-0">🗑</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2 mt-3">
                                <input value={nuova[cat.id] || ""} onChange={(e) => setNuova((p) => ({ ...p, [cat.id]: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === "Enter") aggiungi(cat.id); }}
                                    placeholder="Nuova voce…" className="glass-input flex-1 !h-9 text-sm" />
                                <button onClick={() => aggiungi(cat.id)} disabled={!(nuova[cat.id] || "").trim()}
                                    className="px-3.5 h-9 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold disabled:opacity-40 flex items-center gap-1.5">
                                    <Plus className="w-4 h-4" /> Aggiungi
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* CAL-01: i modelli del bottone WhatsApp dei caller, amministrabili qui */}
            <ModelliWaView opzioniCaller={righe} />
        </div>
    );
}
