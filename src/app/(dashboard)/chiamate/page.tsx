"use client";

// REGISTRO CHIAMATE (AIR-01b/e, Luca 04/08): il registro telefonico Aircall del
// punto vendita — ogni chiamata in entrata/uscita con esito, registrazione e
// aggancio alla scheda cliente. Visibilità per negozio come WhatsApp/email
// (useVisibleStores); l'AUDIO delle registrazioni è una CAPABILITY
// (cap:/clienti:ascolta_registrazioni, rotellina Clienti in Permessi — gate
// anche sul proxy /api/aircall/recording; default: store manager in su + cc).
// La tab "Da anagrafizzare" è la coda delle inbound dal go-live (04/08/2026)
// senza cliente: da lì si crea l'anagrafica, si associa a un cliente esistente
// o si archivia. NIENTE task automatiche: lista da smaltire quando c'è tempo.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Search, X, UserPlus, Link2, Archive, RefreshCw , Copy } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useVisibleStores, negozioInValues, sameStore } from "@/lib/visibleStores";
import { useStores } from "@/lib/org";
import { SelectOpzioni } from "@/components/SelectPersona";
import { RicercaCliente, etichettaCliente, type ClienteTrovato } from "@/components/RicercaCliente";
import { numeroNazionale } from "@/lib/telefono";
import { puoAscoltareRegistrazioni, ANYTIME_NUMBER_IDS, ANYTIME_USER_RANGE } from "@/lib/aircall";
import { useRolePermissions } from "@/lib/usePermissions";

// GO-LIVE della coda di anagrafizzazione (Luca 04/08): le 1100+ inbound
// storiche senza cliente NON entrano in coda — le aggancia il backfill.
const GO_LIVE = "2026-08-04";

interface EventoChiamata {
    id: string;
    aircall_call_id: number | null;
    direction: string | null;
    cliente_num: string | null;
    agente_nome: string | null;
    negozio: string | null;
    missed: boolean | null;
    duration_sec: number | null;
    recording_url?: string | null;   // selezionata SOLO per chi può ascoltare
    started_at: string | null;
    client_id: string | null;
    archiviato: boolean | null;
    risposta_cc?: boolean | null;   // AIR-04: risposta dal call center (badge)
}

export default function RegistroChiamatePage() {
    const { user } = useAuth();
    const { seesAll, stores, loaded } = useVisibleStores();
    const NEGOZI = useStores();
    // AUDIO a capability (cap:/clienti:ascolta_registrazioni, Luca 04/08):
    // amministrabile dalla rotellina Clienti; il registro resta visibile a tutti
    const { perms } = useRolePermissions(user?.role, user?.grade, user?.id);
    const puoAudio = puoAscoltareRegistrazioni(user?.role, perms);

    const [eventi, setEventi] = useState<EventoChiamata[]>([]);
    const [carico, setCarico] = useState(true);
    const [errore, setErrore] = useState<string | null>(null);
    const [tab, setTab] = useState<"tutte" | "coda">("tutte");
    const [fDirezione, setFDirezione] = useState("");
    const [fEsito, setFEsito] = useState("");
    const [fNegozio, setFNegozio] = useState("");
    const [ricerca, setRicerca] = useState("");
    const [visibili, setVisibili] = useState(50);
    // chiamata espansa: l'audio si apre SOLO qui (vista compatta per tutti)
    const [apertaId, setApertaId] = useState<string | null>(null);
    const [associaEv, setAssociaEv] = useState<EventoChiamata | null>(null);
    const [msg, setMsg] = useState("");

    const carica = async () => {
        setCarico(true); setErrore(null);
        // recording_url SOLO per chi può ascoltare: agli altri il link firmato
        // non serve e non deve nemmeno viaggiare nella risposta
        const campi = "id, aircall_call_id, direction, cliente_num, agente_nome, negozio, missed, duration_sec, started_at, client_id, archiviato, risposta_cc"
            + (puoAudio ? ", recording_url" : "");
        let q = supabase.from("call_events").select(campi)
            // righe storiche AnyTime Fitness fuori (stesso account Aircall,
            // altra azienda — il webhook ora le scarta all'ingresso)
            .or(`aircall_number_id.is.null,aircall_number_id.not.in.(${ANYTIME_NUMBER_IDS.join(",")})`)
            .or(`aircall_user_id.is.null,aircall_user_id.lt.${ANYTIME_USER_RANGE[0]},aircall_user_id.gt.${ANYTIME_USER_RANGE[1]}`)
            .order("started_at", { ascending: false, nullsFirst: false })
            .limit(500);
        if (!seesAll) {
            const valori = negozioInValues(stores);
            if (valori.length === 0) { setEventi([]); setCarico(false); return; }
            // SOLO le chiamate del proprio interno (Luca 05/08): il broadcast
            // delle perse del numero unico (negozio null) faceva vedere a ogni
            // negozio le chiamate di tutti — marcia indietro. Le non attribuite
            // restano alla direzione (registro completo, badge 🌐), che le
            // anagrafizza o le smista.
            q = q.in("negozio", valori);
        }
        const { data, error } = await q;
        if (error) { setErrore(error.message); setEventi([]); }
        else setEventi((data ?? []) as unknown as EventoChiamata[]);
        setCarico(false);
    };
    // nomi dei clienti agganciati (Luca 04/08): il nome cliccabile in riga
    // al posto della scritta "apri la scheda cliente"
    const [nomiClienti, setNomiClienti] = useState<Record<string, string>>({});
    useEffect(() => {
        const ids = [...new Set(eventi.map((e) => e.client_id).filter(Boolean))] as string[];
        const mancanti = ids.filter((id) => !(id in nomiClienti));
        if (!mancanti.length) return;
        (async () => {
            const out: Record<string, string> = {};
            for (let i = 0; i < mancanti.length; i += 200) {
                const { data } = await supabase.from("clients")
                    .select("id, nome, cognome, ragione_sociale").in("id", mancanti.slice(i, i + 200));
                (data ?? []).forEach((c: { id: string; nome: string | null; cognome: string | null; ragione_sociale: string | null }) => {
                    out[c.id] = (c.ragione_sociale || `${c.nome || ""} ${c.cognome || ""}`).trim() || "Cliente";
                });
            }
            setNomiClienti((p) => ({ ...p, ...out }));
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventi]);
    // il primo fetch parte SOLO a visibilità caricata (regola useVisibleStores);
    // puoAudio in deps: quando le righe di permesso arrivano e cambiano il
    // verdetto, la select va rifatta (recording_url incluso/escluso dai campi)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (loaded) carica(); }, [loaded, seesAll, stores.join("|"), puoAudio]);

    // coda "Da anagrafizzare": inbound senza cliente, non archiviate, dal go-live
    const inCoda = (e: EventoChiamata) =>
        e.direction === "inbound" && !e.client_id && !e.archiviato &&
        !!e.started_at && e.started_at >= GO_LIVE;
    const nCoda = useMemo(() => eventi.filter(inCoda).length, [eventi]);

    const filtrate = useMemo(() => {
        const cifre = ricerca.replace(/\D/g, "");
        return eventi.filter((e) => {
            if (tab === "coda" && !inCoda(e)) return false;
            if (fDirezione === "In entrata" && e.direction !== "inbound") return false;
            if (fDirezione === "In uscita" && e.direction !== "outbound") return false;
            if (fEsito === "Risposte" && e.missed) return false;
            if (fEsito === "Perse" && !e.missed) return false;
            if (fNegozio === "🌐 Numero unico") { if (e.negozio) return false; }
            else if (fNegozio && !sameStore(e.negozio, fNegozio)) return false;
            if (cifre.length >= 3 && !String(e.cliente_num || "").replace(/\D/g, "").includes(cifre)) return false;
            return true;
        });
    }, [eventi, tab, fDirezione, fEsito, fNegozio, ricerca]);

    const quando = (iso: unknown) => { const d = new Date(String(iso || "")); return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("it-IT") + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }); };
    const durata = (sec: unknown) => { const n = Number(sec) || 0; return n ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}` : "—"; };
    const codaDi = (e: EventoChiamata) => String(e.cliente_num || "").replace(/\D/g, "").slice(-9);

    // [Associa a esistente]: client_id su TUTTE le chiamate orfane con la stessa
    // coda di 9 cifre (cifre intervallate da %: i numeri arrivano con gli spazi)
    const associa = async (cli: ClienteTrovato) => {
        if (!associaEv) return;
        const coda = codaDi(associaEv);
        const upd = { client_id: cli.id, anagrafizzato_da: user?.name || null, anagrafizzato_il: new Date().toISOString() };
        const { error } = coda.length >= 6
            ? await supabase.from("call_events").update(upd).is("client_id", null).ilike("cliente_num", "%" + coda.split("").join("%") + "%")
            : await supabase.from("call_events").update(upd).eq("id", associaEv.id);
        setAssociaEv(null);
        setMsg(error ? "⚠️ Associazione non riuscita: " + error.message : `✅ Chiamate di questo numero associate a "${etichettaCliente(cli)}".`);
        if (!error) carica();
    };

    // [Ignora]: fuori dalla coda, la riga resta nel registro
    const archivia = async (e: EventoChiamata) => {
        const { error } = await supabase.from("call_events").update({ archiviato: true }).eq("id", e.id);
        setMsg(error ? "⚠️ Archiviazione non riuscita: " + error.message : "✅ Chiamata archiviata: fuori dalla coda di anagrafizzazione.");
        if (!error) setEventi((p) => p.map((x) => (x.id === e.id ? { ...x, archiviato: true } : x)));
    };

    const mostraNegozio = seesAll || stores.length > 1;

    return (
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
            {/* titolo nudo sul gradiente (GLB-01, Luca 04/08): niente <header>, niente lastra */}
            <div className="flex-none flex items-center justify-between pb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                        <Phone className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-white">Registro Chiamate</h1>
                        <p className="text-sm text-slate-400">
                            {seesAll ? "Tutte le chiamate Aircall dei punti vendita" : "Le chiamate Aircall del tuo negozio"}
                            {!puoAudio && " — l'ascolto dell'audio delle registrazioni non è abilitato per il tuo ruolo"}
                        </p>
                        {msg && <p className={`text-sm mt-1 font-medium ${msg.startsWith("✅") ? "text-emerald-400" : "text-amber-400"}`}>{msg}</p>}
                    </div>
                </div>
                <button onClick={carica} title="Aggiorna il registro"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 text-sm font-medium transition-all">
                    <RefreshCw className={`w-4 h-4 ${carico ? "animate-spin" : ""}`} /> Aggiorna
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8">
                <div className="max-w-6xl mx-auto space-y-5">

                    {/* TAB + FILTRI */}
                    <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 w-max">
                            <button onClick={() => setTab("tutte")}
                                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${tab === "tutte" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/20" : "text-slate-400 hover:text-white"}`}>
                                Tutte le chiamate
                            </button>
                            <button onClick={() => setTab("coda")}
                                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${tab === "coda" ? "bg-amber-500/20 text-amber-300 border border-amber-500/20" : "text-slate-400 hover:text-white"}`}>
                                📇 Da anagrafizzare
                                {nCoda > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/25 text-amber-200">{nCoda}</span>}
                            </button>
                        </div>
                        <div className="relative w-full md:w-72 group">
                            <input type="text" value={ricerca} onChange={(e) => setRicerca(e.target.value)}
                                placeholder="Cerca per numero…"
                                className="w-full glass-input pl-10 pr-4 py-2 rounded-xl text-sm" />
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Direzione</label>
                            <SelectOpzioni value={fDirezione} onChange={setFDirezione}
                                opzioni={["In entrata", "In uscita"]} placeholder="Tutte" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Esito</label>
                            <SelectOpzioni value={fEsito} onChange={setFEsito}
                                opzioni={["Risposte", "Perse"]} placeholder="Tutti" />
                        </div>
                        {mostraNegozio && (
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Negozio</label>
                                <SelectOpzioni value={fNegozio} onChange={setFNegozio}
                                    opzioni={seesAll ? ["🌐 Numero unico", ...NEGOZI] : stores} placeholder="Tutti" />
                            </div>
                        )}
                    </div>

                    {/* LISTA */}
                    {carico ? (
                        <div className="text-center text-slate-500 py-16">Caricamento registro…</div>
                    ) : errore ? (
                        <div className="text-center text-rose-400 py-16 text-sm">Errore: {errore}</div>
                    ) : filtrate.length === 0 ? (
                        <div className="text-center text-slate-500 py-16 text-sm">
                            {tab === "coda" ? "Nessuna chiamata da anagrafizzare: coda vuota. 🎉" : "Nessuna chiamata con i filtri correnti."}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filtrate.slice(0, visibili).map((e) => {
                                const espandibile = puoAudio && !!e.recording_url && !!e.aircall_call_id;
                                const aperta = apertaId === e.id;
                                return (
                                <div key={e.id}
                                    onClick={(ev) => { if ((ev.target as HTMLElement).closest("a,button,audio")) return; if (espandibile) setApertaId((p) => p === e.id ? null : e.id); }}
                                    title={espandibile ? (aperta ? "Chiudi la registrazione" : "Apri la chiamata per ascoltare la registrazione") : undefined}
                                    className={`rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition-colors ${espandibile ? "cursor-pointer hover:bg-white/[0.06]" : ""}`}>
                                    <div className="flex items-center gap-3 flex-wrap text-sm">
                                        {espandibile && <span className="text-slate-500 text-xs shrink-0">{aperta ? "▾" : "▸"} 🎧</span>}
                                        {/* direzione stile Telegram (Luca 04/08): telefono con
                                            freccetta colorata, non i vassoi dei messaggi —
                                            verde=ricevuta, blu=effettuata, rossa=persa */}
                                        <span className="shrink-0" title={e.missed && e.direction === "inbound" ? "Persa — il cliente ha chiamato e nessuno ha risposto" : e.direction === "inbound" ? "Ricevuta — il cliente ha chiamato il negozio" : "Effettuata — il negozio ha chiamato"}>
                                            {e.missed && e.direction === "inbound"
                                                ? <PhoneMissed className="w-4 h-4 text-rose-400" />
                                                : e.direction === "inbound"
                                                    ? <PhoneIncoming className="w-4 h-4 text-emerald-400" />
                                                    : <PhoneOutgoing className="w-4 h-4 text-sky-400" />}
                                        </span>
                                        <span className="text-white font-semibold">{quando(e.started_at)}</span>
                                        {mostraNegozio && !!e.negozio && (
                                            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[11px] text-slate-300">🏪 {e.negozio}</span>
                                        )}
                                        {!e.negozio && (
                                            <span title="Chiamata sul numero unico aziendale: squilla su tutti i negozi, nessuno ha risposto — non è attribuibile a un punto vendita"
                                                className="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/25 text-[11px] text-sky-300">🌐 Numero unico</span>
                                        )}
                                        {/* AIR-04 (Luca 05/08): il cliente ha scelto il negozio
                                            nell'IVR ma ha risposto il call center — il negozio
                                            vede la chiamata e sa chi l'ha gestita */}
                                        {!!e.risposta_cc && (
                                            <span title={`Il punto vendita non ha risposto in tempo: ha risposto il call center${e.agente_nome ? ` (${e.agente_nome})` : ""}`}
                                                className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/25 text-[11px] text-indigo-300">☎️ risposta dal Call Center</span>
                                        )}
                                        <span className="text-slate-400">{String(e.agente_nome || "—")}</span>
                                        {e.missed
                                            ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-rose-500/15 text-rose-300">persa</span>
                                            : <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">risposta · {durata(e.duration_sec)}</span>}
                                        {!!e.archiviato && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/5 text-slate-500">archiviata</span>}
                                        {/* cliente agganciato: NOME cliccabile → scheda, poi il numero
                                            (Luca 04/08 — via la scritta "apri la scheda" sotto) */}
                                        {e.client_id ? (
                                            <span className="ml-auto flex items-center gap-2 min-w-0">
                                                <Link href={`/clienti?id=${encodeURIComponent(e.client_id)}`} title="Apri la scheda del cliente"
                                                    className="text-xs font-bold text-violet-300 hover:text-violet-100 hover:underline truncate max-w-[220px]">
                                                    👤 {nomiClienti[e.client_id] || "Cliente"}
                                                </Link>
                                                <span className="text-xs text-slate-500 font-mono shrink-0">{numeroNazionale(String(e.cliente_num || "")) || String(e.cliente_num || "—")}</span>
                                                {(() => { const num = numeroNazionale(String(e.cliente_num || "")) || String(e.cliente_num || ""); return num ? (
                                                    <button onClick={(ev) => { ev.stopPropagation(); navigator.clipboard?.writeText(num); setMsg("📋 Numero copiato: " + num); }}
                                                        title="Copia il numero" className="shrink-0 text-slate-500 hover:text-white transition-colors">
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                ) : null; })()}
                                            </span>
                                        ) : (
                                            <span className="ml-auto flex items-center gap-2">
                                                <span className="text-xs text-slate-500 font-mono">{numeroNazionale(String(e.cliente_num || "")) || String(e.cliente_num || "—")}</span>
                                                {(() => { const num = numeroNazionale(String(e.cliente_num || "")) || String(e.cliente_num || ""); return num ? (
                                                    <button onClick={(ev) => { ev.stopPropagation(); navigator.clipboard?.writeText(num); setMsg("📋 Numero copiato: " + num); }}
                                                        title="Copia il numero" className="shrink-0 text-slate-500 hover:text-white transition-colors">
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                ) : null; })()}
                                            </span>
                                        )}
                                    </div>

                                    {/* registrazione SOLO nella chiamata ESPANSA (Luca 04/08:
                                        "vista compatta per tutti, l'audio esplodendo la chiamata");
                                        il permesso resta quello della rotellina */}
                                    {espandibile && aperta && (
                                        <div className="mt-2 flex items-center gap-3">
                                            {/* l'URL salvato scade in ~1h (firma S3): si passa dal proxy,
                                                che verifica anche il ruolo (?u=) e chiede un URL fresco */}
                                            <audio controls autoPlay={false} preload="none" src={`/api/aircall/recording?call=${e.aircall_call_id}&u=${user?.id || ""}`} className="h-8 flex-1 min-w-0" />
                                            <a href={`/api/aircall/recording?call=${e.aircall_call_id}&u=${user?.id || ""}`} target="_blank" rel="noreferrer" download
                                                className="text-xs font-bold text-sky-300 hover:text-white shrink-0">⬇ Scarica</a>
                                        </div>
                                    )}

                                    {/* azioni di anagrafizzazione (il cliente agganciato ha già
                                        il nome cliccabile in riga) */}
                                    {e.client_id ? null : inCoda(e) ? (
                                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                                            <span className="text-[11px] text-amber-300/90 font-semibold mr-1">Numero sconosciuto:</span>
                                            <Link href={`/clienti?nuovo=${encodeURIComponent(numeroNazionale(String(e.cliente_num || "")) || codaDi(e))}`}
                                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 flex items-center gap-1.5">
                                                <UserPlus className="w-3.5 h-3.5" /> Crea cliente
                                            </Link>
                                            <button onClick={() => setAssociaEv(e)}
                                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25 flex items-center gap-1.5">
                                                <Link2 className="w-3.5 h-3.5" /> Associa a esistente
                                            </button>
                                            {/* archiviare = solo amministrativo in su (Luca 10/08):
                                                le entrate restano in coda per tutti gli altri */}
                                            {["admin", "dev", "direttore_generale", "amministrativo"].includes(user?.role || "") && (
                                            <button onClick={() => archivia(e)} title="Numero da ignorare (spam, errore): esce dalla coda"
                                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200 flex items-center gap-1.5">
                                                <Archive className="w-3.5 h-3.5" /> Ignora
                                            </button>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                                );
                            })}
                            {filtrate.length > visibili && (
                                <button onClick={() => setVisibili((v) => v + 50)}
                                    className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 text-sm font-medium">
                                    Mostra altre {Math.min(50, filtrate.length - visibili)} chiamate ({filtrate.length - visibili} rimanenti)
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* MODALE "Associa a esistente": RicercaCliente standard */}
            {associaEv && (
                <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setAssociaEv(null)}>
                    <div className="glass-panel w-full max-w-lg shadow-2xl border-white/10 p-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-lg font-bold text-white">🔗 Associa a un cliente</h3>
                            <button onClick={() => setAssociaEv(null)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
                        </div>
                        <p className="text-sm text-slate-400 mb-3">
                            Il numero <strong className="text-white font-mono">{numeroNazionale(String(associaEv.cliente_num || "")) || String(associaEv.cliente_num || "")}</strong> verrà
                            agganciato al cliente scelto — su questa chiamata e su tutte le altre dello stesso numero ancora senza cliente.
                        </p>
                        <RicercaCliente onScelto={associa} />
                    </div>
                </div>
            )}
        </div>
    );
}
