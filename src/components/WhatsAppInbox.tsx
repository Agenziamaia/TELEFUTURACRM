"use client";

// Inbox WhatsApp riusabile. Collega i numeri (QR) e chatta coi clienti. I dati
// stanno nel modello wa_* (separato dalla chat interna); le chiamate a Evolution
// passano dalle route /api/whatsapp/* (URL e chiave restano lato server).
//   embedded=true -> pensato per stare DENTRO la pagina Chat (riempie l'altezza,
//                    niente titolone/margini di pagina).
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useVisibleStores, sameStore } from "@/lib/visibleStores";
import { MessageCircle, Plus, Phone, Send, X, RefreshCw, Check, CheckCheck, Loader2, QrCode, Users, Paperclip, FileText, LogOut } from "lucide-react";
import { cn } from "@/utils";

type Instance = { id: string; instance_name: string; display_name: string | null; wa_number: string | null; status: string; owner_user_id: string | null; negozio: string | null };
type Conv = { id: string; instance_id: string; customer_number: string; customer_name: string | null; client_id: string | null; last_preview: string | null; last_message_at: string | null; unread: number; is_group?: boolean; chat_jid?: string | null };
type Msg = { id: string; direction: string; body: string | null; status: string | null; sender_name: string | null; wa_timestamp: string | null; created_at: string; media_url?: string | null; media_mime?: string | null };

const api = (body: unknown) => fetch("/api/whatsapp/instance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());

export function WhatsAppInbox({ embedded = false, apriNumero = null }: { embedded?: boolean; apriNumero?: string | null }) {
    const { user } = useAuth();
    const [instances, setInstances] = useState<Instance[]>([]);
    const [selInst, setSelInst] = useState<string | null>(null);
    const [convs, setConvs] = useState<Conv[]>([]);
    const [selConv, setSelConv] = useState<Conv | null>(null);
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [linkModal, setLinkModal] = useState(false);
    const [relinkName, setRelinkName] = useState<string | null>(null);   // ri-scansione di un numero disconnesso
    const [syncing, setSyncing] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const historyLoaded = useRef<Set<string>>(new Set());   // conversazioni gia' backfillate
    const { stores: myStores } = useVisibleStores();

    // Modello "un numero per caller": ognuno vede i PROPRI numeri. Eccezioni:
    //  - admin/dev/amministrativo -> tutti i numeri
    //  - store_manager            -> i numeri del proprio negozio
    // SICUREZZA (deciso 28/07): SOLO Luca vede tutti i numeri — non un ruolo
    // generico (un secondo admin non vedrebbe tutto), non il dev, non l'amministrativo.
    // I numeri WhatsApp possono essere personali. Legato all'ID reale, cosi' con il
    // "guarda come" Luca vede comunque la vista ristretta dell'utente simulato.
    const LUCA_ID = "0355d28b-968f-4089-93b7-b8b5eeeda40c";
    const waScope: "all" | "store" | "own" = useMemo(() => {
        if (user?.id === LUCA_ID) return "all";
        if (user?.role === "store_manager") return "store";
        return "own";
    }, [user?.id, user?.role]);
    const visibleInstances = useMemo(() => {
        if (waScope === "all") return instances;
        if (waScope === "own") return instances.filter(i => i.owner_user_id === user?.id);
        return instances.filter(i => i.negozio && myStores.some(s => sameStore(i.negozio, s)));
    }, [instances, waScope, user?.id, myStores]);

    // tieni selInst sempre dentro i numeri visibili
    useEffect(() => {
        if (visibleInstances.length === 0) { if (selInst) setSelInst(null); return; }
        if (!selInst || !visibleInstances.some(i => i.id === selInst)) { setSelInst(visibleInstances[0].id); setSelConv(null); }
    }, [visibleInstances, selInst]);

    // importa le conversazioni gia' esistenti dal telefono (history-sync).
    // silent=true -> in background dopo la connessione: niente spinner ne' avvisi
    // (le conversazioni compaiono da sole). Timeout + finally: non resta mai
    // appeso (es. se salta la connessione), lo spinner si ferma comunque.
    const sincronizza = async (instanceName?: string, opts?: { silent?: boolean }) => {
        const inst = instances.find(i => i.id === selInst);
        const name = instanceName || inst?.instance_name;
        if (!name) return;
        const silent = !!opts?.silent;
        if (!silent && syncing) return;
        if (!silent) setSyncing(true);
        try {
            const res = await fetch("/api/whatsapp/instance", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "sync", instanceName: name }),
                signal: AbortSignal.timeout(90000),
            }).then(r => r.json());
            if (!silent) {
                if (res?.error) alert("Sincronizzazione non riuscita: " + res.error);
                else if (typeof res?.importate === "number") alert(`Importate ${res.importate} conversazioni (${res.saltate} saltate).`);
            }
        } catch {
            if (!silent) alert("Sincronizzazione interrotta (connessione lenta o assente). Riprova.");
        } finally {
            if (!silent) setSyncing(false);
        }
    };

    // disconnessione volontaria (logout): chiude la sessione ma tiene le
    // conversazioni; si riattiva riscansionando il QR con "Ricollega".
    const disconnetti = async () => {
        const inst = instances.find(i => i.id === selInst);
        if (!inst || disconnecting) return;
        if (!window.confirm(`Disconnettere "${inst.display_name || inst.instance_name}"?\nLe conversazioni restano; per riattivarlo dovrai riscansionare il QR.`)) return;
        setDisconnecting(true);
        const res = await api({ action: "logout", instanceName: inst.instance_name });
        setDisconnecting(false);
        if (res?.error) alert("Disconnessione non riuscita: " + res.error);
        else { setSelConv(null); loadInstances(); }
    };

    const loadInstances = async () => {
        const { data } = await supabase.from("wa_instances").select("*").order("created_at");
        setInstances((data ?? []) as Instance[]);   // selInst lo gestisce l'effect sui visibili
    };
    useEffect(() => { loadInstances(); const t = setInterval(loadInstances, 5000); return () => clearInterval(t); }, []);

    // conversazioni dell'istanza selezionata (polling leggero)
    useEffect(() => {
        if (!selInst) { setConvs([]); return; }
        let alive = true;
        const load = async () => {
            const { data } = await supabase.from("wa_conversations").select("*").eq("instance_id", selInst).order("last_message_at", { ascending: false, nullsFirst: false });
            if (alive) setConvs((data ?? []) as Conv[]);
        };
        load(); const t = setInterval(load, 3000);
        return () => { alive = false; clearInterval(t); };
    }, [selInst]);

    // messaggi della conversazione (polling)
    useEffect(() => {
        if (!selConv) { setMsgs([]); return; }
        let alive = true;
        // backfill dello storico recente la prima volta che si apre la conversazione
        if (!historyLoaded.current.has(selConv.id)) {
            historyLoaded.current.add(selConv.id);
            const inst = instances.find(i => i.id === selConv.instance_id);
            if (inst) api({ action: "history", instanceName: inst.instance_name, conversationId: selConv.id }).catch(() => {});
        }
        const load = async () => {
            const { data } = await supabase.from("wa_messages").select("*").eq("conversation_id", selConv.id).order("wa_timestamp", { ascending: true, nullsFirst: true });
            if (alive) setMsgs((data ?? []) as Msg[]);
        };
        load(); const t = setInterval(load, 2500);
        // azzera i non letti aprendo la conversazione
        supabase.from("wa_conversations").update({ unread: 0 }).eq("id", selConv.id).then(() => {});
        return () => { alive = false; clearInterval(t); };
    }, [selConv?.id]);

    useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs]);

    // ── DEEP-LINK (Luca 29/07): /chat?wa=<numero> apre la chat col cliente
    //    precaricata. Cerca la conversazione tra i numeri visibili (aggancio
    //    per coda di cifre, come il ponte Aircall); se non esiste la CREA
    //    sull'istanza selezionata (o la prima visibile).
    const _apriFatto = useRef<string | null>(null);
    useEffect(() => {
        const dig = String(apriNumero || "").replace(/\D/g, "");
        if (!dig || dig.length < 6 || _apriFatto.current === dig) return;
        if (!visibleInstances.length) return;    // istanze non ancora arrivate
        _apriFatto.current = dig;
        (async () => {
            const coda = dig.slice(-9);
            const ids = visibleInstances.map(i => i.id);
            const patt = "%" + coda.split("").join("%") + "%";
            const { data: trovate } = await supabase.from("wa_conversations")
                .select("*").in("instance_id", ids).ilike("customer_number", patt)
                .order("last_message_at", { ascending: false }).limit(1);
            let conv = (trovate && trovate[0]) as Conv | undefined;
            if (!conv) {
                const inst = visibleInstances.find(i => i.id === selInst) || visibleInstances[0];
                const numero = dig.length === 10 && dig.startsWith("3") ? "39" + dig : dig;
                const { data: creata, error } = await supabase.from("wa_conversations")
                    .insert({ instance_id: inst.id, customer_number: numero, unread: 0 })
                    .select("*").maybeSingle();
                if (error || !creata) { alert("Chat non aperta: " + (error?.message || "conversazione non creata")); return; }
                conv = creata as Conv;
            }
            setSelInst(conv.instance_id);
            setSelConv(conv);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apriNumero, visibleInstances.map(i => i.id).join("|")]);

    const invia = async () => {
        if (!selConv || !text.trim() || sending) return;
        setSending(true);
        const res = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: selConv.id, text: text.trim(), userId: user?.id }) }).then(r => r.json());
        if (res?.error) alert("Invio non riuscito: " + res.error);
        else setText("");
        setSending(false);
    };

    // invia un allegato: carica nel bucket pubblico, poi Evolution lo spedisce
    // dall'URL. Il testo eventuale diventa la didascalia.
    const inviaFile = async (f: File) => {
        if (!selConv || sending) return;
        setSending(true);
        try {
            const safe = f.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
            const path = `out/${selConv.id}/${Date.now()}-${safe}`;
            const { error } = await supabase.storage.from("whatsapp-media").upload(path, f, { contentType: f.type || "application/octet-stream", upsert: true });
            if (error) throw error;
            const { data: pub } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
            const res = await fetch("/api/whatsapp/send", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversationId: selConv.id, text: text.trim(), userId: user?.id, mediaUrl: pub?.publicUrl, mediaMime: f.type || "application/octet-stream", fileName: f.name }),
            }).then(r => r.json());
            if (res?.error) alert("Invio non riuscito: " + res.error);
            else setText("");
        } catch (e: any) {
            alert("Allegato non inviato: " + (e?.message || e));
        } finally {
            setSending(false);
        }
    };

    const instConnessa = visibleInstances.find(i => i.id === selInst);
    const fmtOra = (s: string | null) => s ? new Date(s).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";

    return (
        <div className={embedded ? "h-full flex flex-col gap-3 p-3 sm:p-4 overflow-hidden" : "w-full max-w-7xl mx-auto space-y-4"}>
            <div className="flex items-center justify-between gap-4 flex-wrap shrink-0">
                {embedded ? (
                    <p className="text-sm font-semibold text-slate-400">I numeri che gestisci</p>
                ) : (
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30"><MessageCircle className="w-6 h-6 text-emerald-400" /></div>
                        <div><h1 className="text-2xl font-black text-white tracking-tight">WhatsApp</h1><p className="text-slate-500 text-sm">Messaggi dei clienti, rispondi da qui</p></div>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    {instConnessa?.status === "connessa" && (
                        <button onClick={() => sincronizza()} disabled={syncing} title="Ricarica le conversazioni dal telefono (di solito non serve: si aggiorna da solo)"
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 disabled:opacity-40">
                            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        </button>
                    )}
                    {instConnessa?.status === "connessa" && (
                        <button onClick={disconnetti} disabled={disconnecting} title="Disconnetti questo numero (le conversazioni restano, per riattivarlo si riscansiona il QR)"
                            className="px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm font-bold flex items-center gap-2 hover:bg-rose-500/25 disabled:opacity-40">
                            {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Disconnetti
                        </button>
                    )}
                    {/* Numero selezionato NON connesso (mai scansionato o sessione scaduta):
                        serve ri-scansionare LO STESSO numero, non crearne un altro. */}
                    {instConnessa && instConnessa.status !== "connessa" && (
                        <button onClick={() => setRelinkName(instConnessa.instance_name)}
                            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold flex items-center gap-2">
                            <QrCode className="w-4 h-4" /> {instConnessa.status === "disconnessa" ? "Ricollega" : "Scansiona QR"}
                        </button>
                    )}
                    {/* Numero connesso e visibilita' "own": il caller ha gia' il suo numero. */}
                    {waScope === "own" && instConnessa?.status === "connessa" && (
                        <span className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-bold flex items-center gap-2">
                            <CheckCheck className="w-4 h-4" /> Connesso
                        </span>
                    )}
                    {/* "Collega numero" (nuovo): admin/manager sempre; caller solo se non ne ha ancora uno. */}
                    {(waScope !== "own" || visibleInstances.length === 0) && (
                        <button onClick={() => setLinkModal(true)} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> Collega numero</button>
                    )}
                </div>
            </div>

            {/* selettore numero */}
            {visibleInstances.length > 0 && (
                <div className="flex gap-2 flex-wrap shrink-0">
                    {visibleInstances.map(i => (
                        <button key={i.id} onClick={() => { setSelInst(i.id); setSelConv(null); }}
                            className={cn("px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-2",
                                selInst === i.id ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10")}>
                            <Phone className="w-3.5 h-3.5" />{i.display_name || i.instance_name}
                            <span className={cn("w-2 h-2 rounded-full", i.status === "connessa" ? "bg-emerald-400" : "bg-amber-400")} title={i.status} />
                        </button>
                    ))}
                </div>
            )}

            {visibleInstances.length === 0 ? (
                <div className={cn("glass-card p-12 text-center text-slate-400", embedded && "flex-1 flex flex-col items-center justify-center")}>
                    <QrCode className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                    {waScope === "own"
                        ? <span>Non hai ancora un numero WhatsApp collegato. Premi <b className="text-emerald-300">Collega numero</b> e scansiona il QR col tuo telefono.</span>
                        : <span>Nessun numero collegato per la tua visibilita'. Premi <b className="text-emerald-300">Collega numero</b> e scansiona il QR con WhatsApp del telefono.</span>}
                </div>
            ) : (
                <div className={cn("grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4", embedded ? "flex-1 min-h-0" : "h-[calc(100vh-230px)]")}>
                    {/* elenco conversazioni */}
                    <div className="glass-card overflow-y-auto">
                        {instConnessa && instConnessa.status !== "connessa" && (
                            <div className="p-3 text-xs text-amber-300 border-b border-amber-500/20 bg-amber-500/5">
                                {instConnessa.status === "disconnessa" ? "Sessione scaduta" : "Numero non ancora collegato"} — premi{" "}
                                <button onClick={() => setRelinkName(instConnessa.instance_name)} className="underline font-semibold hover:text-amber-200">
                                    {instConnessa.status === "disconnessa" ? "Ricollega" : "Scansiona QR"}
                                </button>{" "}per il QR.
                            </div>
                        )}
                        {convs.length === 0 ? (
                            <div className="p-6 text-center text-slate-500 text-sm">Ancora nessuna conversazione.</div>
                        ) : convs.map(c => (
                            <button key={c.id} onClick={() => setSelConv(c)}
                                className={cn("w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] flex items-center gap-3", selConv?.id === c.id && "bg-white/[0.05]")}>
                                <div className={cn("w-9 h-9 rounded-full border flex items-center justify-center text-xs font-bold shrink-0",
                                    c.is_group ? "bg-sky-500/15 border-sky-500/25 text-sky-300" : "bg-emerald-500/15 border-emerald-500/25 text-emerald-300")}>
                                    {c.is_group ? <Users className="w-4 h-4" /> : (c.customer_name || c.customer_number).slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-white truncate">{c.customer_name || (c.is_group ? "Gruppo" : `+${c.customer_number}`)}</span>
                                        <span className="text-[10px] text-slate-500 shrink-0">{fmtOra(c.last_message_at)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs text-slate-500 truncate">{c.last_preview || ""}</span>
                                        {c.unread > 0 && <span className="text-[10px] font-bold bg-emerald-500 text-white rounded-full px-1.5 shrink-0">{c.unread}</span>}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* thread */}
                    <div className="glass-card flex flex-col min-h-0">
                        {!selConv ? (
                            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Seleziona una conversazione</div>
                        ) : (
                            <>
                                <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
                                    <div className={cn("w-9 h-9 rounded-full border flex items-center justify-center text-xs font-bold",
                                        selConv.is_group ? "bg-sky-500/15 border-sky-500/25 text-sky-300" : "bg-emerald-500/15 border-emerald-500/25 text-emerald-300")}>
                                        {selConv.is_group ? <Users className="w-4 h-4" /> : (selConv.customer_name || selConv.customer_number).slice(0, 2).toUpperCase()}
                                    </div>
                                    <div><div className="text-sm font-bold text-white">{selConv.customer_name || (selConv.is_group ? "Gruppo" : `+${selConv.customer_number}`)}</div>
                                        <div className="text-[11px] text-slate-500">{selConv.is_group ? "gruppo WhatsApp" : `+${selConv.customer_number}`}{selConv.client_id ? " · cliente collegato" : ""}</div></div>
                                </div>
                                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                                    {msgs.map(m => {
                                        const mine = m.direction === "out";
                                        return (
                                            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                                                <div className={cn("max-w-[75%] rounded-2xl px-3.5 py-2 text-sm", mine ? "bg-emerald-600 text-white rounded-br-sm" : "bg-white/5 text-slate-100 rounded-bl-sm border border-white/5")}>
                                                    {selConv.is_group && !mine && m.sender_name && (
                                                        <p className="text-[11px] font-bold text-sky-300 mb-0.5">{m.sender_name}</p>
                                                    )}
                                                    {m.media_url && (
                                                        m.media_mime?.startsWith("image/") ? (
                                                            <button type="button" onClick={() => window.open(m.media_url as string, "_blank")} className="block mb-1">
                                                                <img src={m.media_url} alt="" className="max-w-[240px] max-h-[280px] rounded-lg object-cover cursor-zoom-in" />
                                                            </button>
                                                        ) : m.media_mime?.startsWith("video/") ? (
                                                            <video src={m.media_url} controls className="max-w-[260px] rounded-lg mb-1" />
                                                        ) : m.media_mime?.startsWith("audio/") ? (
                                                            <audio src={m.media_url} controls className="mb-1 w-[240px] max-w-full" />
                                                        ) : (
                                                            <a href={m.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-black/25 hover:bg-black/35 text-xs mb-1">
                                                                <FileText className="w-4 h-4 shrink-0" /><span className="truncate max-w-[180px]">Documento</span>
                                                            </a>
                                                        )
                                                    )}
                                                    {m.body && !(m.media_url && /^\[(Immagine|Documento|Audio|Video|Sticker)\]$/.test(m.body)) && (
                                                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                                                    )}
                                                    <p className={cn("text-[10px] mt-0.5 flex items-center gap-1 justify-end", mine ? "text-emerald-100/70" : "text-slate-500")}>
                                                        {fmtOra(m.wa_timestamp || m.created_at)}
                                                        {mine && (m.status === "read" ? <CheckCheck className="w-3.5 h-3.5 text-sky-200" /> : m.status === "delivered" ? <CheckCheck className="w-3.5 h-3.5" /> : m.status === "failed" ? <span className="text-rose-200">✕</span> : <Check className="w-3.5 h-3.5" />)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="p-3 border-t border-white/10 flex items-center gap-2">
                                    <input ref={fileRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) inviaFile(f); e.target.value = ""; }} />
                                    <button onClick={() => fileRef.current?.click()} disabled={sending} title="Allega un file"
                                        className="p-2.5 rounded-xl text-slate-400 hover:text-emerald-300 hover:bg-white/5 disabled:opacity-40">
                                        <Paperclip className="w-5 h-5" />
                                    </button>
                                    <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") invia(); }}
                                        placeholder="Scrivi un messaggio…  (o allega un file con la graffetta)" className="glass-input flex-1 text-sm" />
                                    <button onClick={invia} disabled={sending || !text.trim()} className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white">
                                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {linkModal && <LinkModal onClose={() => { setLinkModal(false); loadInstances(); }} onLinked={(name) => sincronizza(name, { silent: true })} ownerUserId={user?.id} />}
            {relinkName && <LinkModal reconnectName={relinkName} onClose={() => { setRelinkName(null); loadInstances(); }} onLinked={(name) => sincronizza(name, { silent: true })} ownerUserId={user?.id} />}
        </div>
    );
}

// Modal: crea (o RICOLLEGA) un'istanza, mostra il QR, poll dello stato finche'
// connesso. Con reconnectName si salta la creazione e si ri-scansiona lo stesso
// numero (es. dopo una sessione scaduta), senza crearne uno nuovo.
function LinkModal({ onClose, onLinked, ownerUserId, reconnectName }: { onClose: () => void; onLinked?: (instanceName: string) => void; ownerUserId?: string; reconnectName?: string }) {
    const [name, setName] = useState("");
    const [instanceName, setInstanceName] = useState<string | null>(reconnectName || null);
    const [qr, setQr] = useState<string | null>(null);
    const [state, setState] = useState<string>("");
    const [busy, setBusy] = useState(false);

    const crea = async () => {
        if (!name.trim()) return;
        setBusy(true);
        const res = await api({ action: "create", displayName: name.trim(), ownerUserId });
        setBusy(false);
        if (res?.error) { alert(res.error); return; }
        setInstanceName(res.instanceName);
        setQr(res.qr || null);
    };

    // ricollegamento: chiedi subito un QR fresco per l'istanza esistente
    useEffect(() => {
        if (!reconnectName) return;
        let alive = true;
        (async () => {
            const q = await api({ action: "qr", instanceName: reconnectName });
            if (alive) setQr(q.qr || null);
        })();
        return () => { alive = false; };
    }, [reconnectName]);

    // poll stato + rinfresca QR
    useEffect(() => {
        if (!instanceName) return;
        let alive = true;
        const t = setInterval(async () => {
            const st = await api({ action: "state", instanceName });
            if (!alive) return;
            setState(st.state || "");
            if (st.state === "open") { clearInterval(t); if (instanceName) onLinked?.(instanceName); setTimeout(onClose, 800); return; }
            // se il QR e' scaduto, richiedine uno nuovo
            const q = await api({ action: "qr", instanceName });
            if (alive && q.qr) setQr(q.qr);
        }, 4000);
        return () => { alive = false; clearInterval(t); };
    }, [instanceName]);

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="glass-card w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">{reconnectName ? "Ricollega il numero WhatsApp" : "Collega un numero WhatsApp"}</h3>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                {!instanceName ? (
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nome (es. "Caller Giulia")</label>
                        <input value={name} onChange={e => setName(e.target.value)} className="glass-input w-full text-sm" placeholder="Nome del numero" autoFocus />
                        <button onClick={crea} disabled={busy || !name.trim()} className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />} Genera QR
                        </button>
                    </div>
                ) : state === "open" ? (
                    <div className="py-8 text-center text-emerald-300 font-bold flex flex-col items-center gap-2"><CheckCheck className="w-10 h-10" /> Numero collegato!</div>
                ) : (
                    <div className="text-center space-y-3">
                        <p className="text-sm text-slate-400">Apri WhatsApp sul telefono → <b>Dispositivi collegati</b> → <b>Collega un dispositivo</b> → inquadra il QR.</p>
                        {qr ? <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="QR WhatsApp" className="w-56 h-56 mx-auto rounded-xl bg-white p-2" />
                            : <div className="w-56 h-56 mx-auto rounded-xl bg-white/5 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-500" /></div>}
                        <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1"><RefreshCw className="w-3 h-3" /> il QR si aggiorna da solo · stato: {state || "in attesa"}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
