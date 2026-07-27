"use client";

// Pagina WhatsApp: collega i numeri (QR) e chatta coi clienti. I dati stanno nel
// modello wa_* (separato dalla chat interna). Le chiamate a Evolution passano
// dalle route /api/whatsapp/* (l'URL e la chiave restano lato server).
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { MessageCircle, Plus, Phone, Send, X, RefreshCw, Check, CheckCheck, Loader2, QrCode, Trash2 } from "lucide-react";
import { cn } from "@/utils";

type Instance = { id: string; instance_name: string; display_name: string | null; wa_number: string | null; status: string };
type Conv = { id: string; instance_id: string; customer_number: string; customer_name: string | null; client_id: string | null; last_preview: string | null; last_message_at: string | null; unread: number };
type Msg = { id: string; direction: string; body: string | null; status: string | null; sender_name: string | null; wa_timestamp: string | null; created_at: string };

const api = (body: unknown) => fetch("/api/whatsapp/instance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());

export default function WhatsAppPage() {
    const { user } = useAuth();
    const [instances, setInstances] = useState<Instance[]>([]);
    const [selInst, setSelInst] = useState<string | null>(null);
    const [convs, setConvs] = useState<Conv[]>([]);
    const [selConv, setSelConv] = useState<Conv | null>(null);
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [linkModal, setLinkModal] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    const loadInstances = async () => {
        const { data } = await supabase.from("wa_instances").select("*").order("created_at");
        setInstances((data ?? []) as Instance[]);
        if (!selInst && data && data[0]) setSelInst(data[0].id);
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
        const load = async () => {
            const { data } = await supabase.from("wa_messages").select("*").eq("conversation_id", selConv.id).order("created_at");
            if (alive) setMsgs((data ?? []) as Msg[]);
        };
        load(); const t = setInterval(load, 2500);
        // azzera i non letti aprendo la conversazione
        supabase.from("wa_conversations").update({ unread: 0 }).eq("id", selConv.id).then(() => {});
        return () => { alive = false; clearInterval(t); };
    }, [selConv?.id]);

    useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs]);

    const invia = async () => {
        if (!selConv || !text.trim() || sending) return;
        setSending(true);
        const res = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: selConv.id, text: text.trim(), userId: user?.id }) }).then(r => r.json());
        if (res?.error) alert("Invio non riuscito: " + res.error);
        else setText("");
        setSending(false);
    };

    const instConnessa = instances.find(i => i.id === selInst);
    const fmtOra = (s: string | null) => s ? new Date(s).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";

    return (
        <div className="w-full max-w-7xl mx-auto space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30"><MessageCircle className="w-6 h-6 text-emerald-400" /></div>
                    <div><h1 className="text-2xl font-black text-white tracking-tight">WhatsApp</h1><p className="text-slate-500 text-sm">Messaggi dei clienti, rispondi da qui</p></div>
                </div>
                <button onClick={() => setLinkModal(true)} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> Collega numero</button>
            </div>

            {/* selettore numero */}
            {instances.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                    {instances.map(i => (
                        <button key={i.id} onClick={() => { setSelInst(i.id); setSelConv(null); }}
                            className={cn("px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-2",
                                selInst === i.id ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10")}>
                            <Phone className="w-3.5 h-3.5" />{i.display_name || i.instance_name}
                            <span className={cn("w-2 h-2 rounded-full", i.status === "connessa" ? "bg-emerald-400" : "bg-amber-400")} title={i.status} />
                        </button>
                    ))}
                </div>
            )}

            {instances.length === 0 ? (
                <div className="glass-card p-12 text-center text-slate-400">
                    <QrCode className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                    Nessun numero collegato. Premi <b className="text-emerald-300">Collega numero</b> e scansiona il QR con WhatsApp del telefono.
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-230px)]">
                    {/* elenco conversazioni */}
                    <div className="glass-card overflow-y-auto">
                        {instConnessa?.status !== "connessa" && (
                            <div className="p-3 text-xs text-amber-300 border-b border-amber-500/20 bg-amber-500/5">Numero non ancora collegato — riapri "Collega numero" per il QR.</div>
                        )}
                        {convs.length === 0 ? (
                            <div className="p-6 text-center text-slate-500 text-sm">Ancora nessuna conversazione.</div>
                        ) : convs.map(c => (
                            <button key={c.id} onClick={() => setSelConv(c)}
                                className={cn("w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] flex items-center gap-3", selConv?.id === c.id && "bg-white/[0.05]")}>
                                <div className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-300 text-xs font-bold shrink-0">
                                    {(c.customer_name || c.customer_number).slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-white truncate">{c.customer_name || `+${c.customer_number}`}</span>
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
                                    <div className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-300 text-xs font-bold">
                                        {(selConv.customer_name || selConv.customer_number).slice(0, 2).toUpperCase()}
                                    </div>
                                    <div><div className="text-sm font-bold text-white">{selConv.customer_name || `+${selConv.customer_number}`}</div>
                                        <div className="text-[11px] text-slate-500">+{selConv.customer_number}{selConv.client_id ? " · cliente collegato" : ""}</div></div>
                                </div>
                                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                                    {msgs.map(m => {
                                        const mine = m.direction === "out";
                                        return (
                                            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                                                <div className={cn("max-w-[75%] rounded-2xl px-3.5 py-2 text-sm", mine ? "bg-emerald-600 text-white rounded-br-sm" : "bg-white/5 text-slate-100 rounded-bl-sm border border-white/5")}>
                                                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                                                    <p className={cn("text-[10px] mt-0.5 flex items-center gap-1 justify-end", mine ? "text-emerald-100/70" : "text-slate-500")}>
                                                        {fmtOra(m.wa_timestamp || m.created_at)}
                                                        {mine && (m.status === "read" ? <CheckCheck className="w-3.5 h-3.5 text-sky-200" /> : m.status === "delivered" ? <CheckCheck className="w-3.5 h-3.5" /> : m.status === "failed" ? <span className="text-rose-200">✕</span> : <Check className="w-3.5 h-3.5" />)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="p-3 border-t border-white/10 flex gap-2">
                                    <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") invia(); }}
                                        placeholder="Scrivi un messaggio…" className="glass-input flex-1 text-sm" />
                                    <button onClick={invia} disabled={sending || !text.trim()} className="px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white">
                                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {linkModal && <LinkModal onClose={() => { setLinkModal(false); loadInstances(); }} ownerUserId={user?.id} />}
        </div>
    );
}

// Modal: crea un'istanza, mostra il QR, poll dello stato finche' connesso.
function LinkModal({ onClose, ownerUserId }: { onClose: () => void; ownerUserId?: string }) {
    const [name, setName] = useState("");
    const [instanceName, setInstanceName] = useState<string | null>(null);
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

    // poll stato + rinfresca QR
    useEffect(() => {
        if (!instanceName) return;
        let alive = true;
        const t = setInterval(async () => {
            const st = await api({ action: "state", instanceName });
            if (!alive) return;
            setState(st.state || "");
            if (st.state === "open") { clearInterval(t); setTimeout(onClose, 800); return; }
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
                    <h3 className="text-lg font-bold text-white">Collega un numero WhatsApp</h3>
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
