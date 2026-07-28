"use client";

// Inbox Email riusabile (webmail nel CRM). Una casella per negozio: IMAP per
// leggere, SMTP per inviare (route /api/email/*). Stessa struttura e visibilita'
// dell'inbox WhatsApp. embedded=true -> pensata per stare dentro la pagina Chat.
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useVisibleStores, sameStore } from "@/lib/visibleStores";
import { Mail, Plus, Send, X, RefreshCw, Loader2, Paperclip, Check, PenSquare, Inbox } from "lucide-react";
import { cn } from "@/utils";

type Account = { id: string; email_address: string; display_name: string | null; negozio: string | null; owner_user_id: string | null; status: string; last_error?: string | null };
type Conv = { id: string; account_id: string; customer_email: string; customer_name: string | null; client_id: string | null; subject: string | null; last_preview: string | null; last_message_at: string | null; unread: number };
type Msg = { id: string; direction: string; from_addr: string | null; from_name: string | null; to_addrs: string | null; subject: string | null; body_text: string | null; body_html: string | null; attachments: any[]; status: string | null; email_date: string | null; created_at: string };

const api = (path: string, body: unknown) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());

export function EmailInbox({ embedded = false }: { embedded?: boolean }) {
    const { user } = useAuth();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selAcc, setSelAcc] = useState<string | null>(null);
    const [convs, setConvs] = useState<Conv[]>([]);
    const [selConv, setSelConv] = useState<Conv | null>(null);
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [connectModal, setConnectModal] = useState(false);
    const [composeOpen, setComposeOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const { stores: myStores } = useVisibleStores();

    // visibilita' come WhatsApp: admin/dev/amministrativo tutte; store_manager il
    // proprio negozio; gli altri solo le proprie caselle.
    const scope: "all" | "store" | "own" = useMemo(() => {
        const role = user?.role || "";
        if (["admin", "dev", "amministrativo"].includes(role)) return "all";
        if (role === "store_manager") return "store";
        return "own";
    }, [user?.role]);
    const visibleAccounts = useMemo(() => {
        if (scope === "all") return accounts;
        if (scope === "own") return accounts.filter(a => a.owner_user_id === user?.id);
        return accounts.filter(a => a.negozio && myStores.some(s => sameStore(a.negozio, s)));
    }, [accounts, scope, user?.id, myStores]);

    const loadAccounts = async () => {
        const { data } = await supabase.from("email_accounts").select("id, email_address, display_name, negozio, owner_user_id, status, last_error").order("created_at");
        setAccounts((data ?? []) as Account[]);
    };
    useEffect(() => { loadAccounts(); const t = setInterval(loadAccounts, 8000); return () => clearInterval(t); }, []);
    useEffect(() => {
        if (visibleAccounts.length === 0) { if (selAcc) setSelAcc(null); return; }
        if (!selAcc || !visibleAccounts.some(a => a.id === selAcc)) { setSelAcc(visibleAccounts[0].id); setSelConv(null); }
    }, [visibleAccounts, selAcc]);

    // scarica la posta nuova per la casella selezionata + ricarica le conversazioni
    const aggiorna = async (accId?: string) => {
        const id = accId || selAcc; if (!id) return;
        setRefreshing(true);
        try { await api("/api/email/poll", { accountId: id }); } catch { }
        setRefreshing(false);
    };
    useEffect(() => { if (selAcc) aggiorna(selAcc); }, [selAcc]);            // poll all'apertura
    useEffect(() => { if (!selAcc) return; const t = setInterval(() => aggiorna(selAcc), 45000); return () => clearInterval(t); }, [selAcc]);  // e ogni 45s

    // conversazioni (polling leggero da Supabase)
    useEffect(() => {
        if (!selAcc) { setConvs([]); return; }
        let alive = true;
        const load = async () => {
            const { data } = await supabase.from("email_conversations").select("*").eq("account_id", selAcc).order("last_message_at", { ascending: false, nullsFirst: false });
            if (alive) setConvs((data ?? []) as Conv[]);
        };
        load(); const t = setInterval(load, 5000);
        return () => { alive = false; clearInterval(t); };
    }, [selAcc]);

    // messaggi della conversazione
    useEffect(() => {
        if (!selConv) { setMsgs([]); return; }
        let alive = true;
        const load = async () => {
            const { data } = await supabase.from("email_messages").select("*").eq("conversation_id", selConv.id).order("email_date", { ascending: true, nullsFirst: true });
            if (alive) setMsgs((data ?? []) as Msg[]);
        };
        load(); const t = setInterval(load, 4000);
        supabase.from("email_conversations").update({ unread: 0 }).eq("id", selConv.id).then(() => { });
        return () => { alive = false; clearInterval(t); };
    }, [selConv?.id]);

    useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs]);

    const rispondi = async () => {
        if (!selConv || !text.trim() || sending) return;
        setSending(true);
        const res = await api("/api/email/send", { conversationId: selConv.id, text: text.trim(), userId: user?.id });
        if (res?.error) alert("Invio non riuscito: " + res.error); else setText("");
        setSending(false);
    };

    const selAccObj = visibleAccounts.find(a => a.id === selAcc);
    const fmtOra = (s: string | null) => s ? new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
    const nomeConv = (c: Conv) => c.customer_name || c.customer_email;

    return (
        <div className={embedded ? "h-full flex flex-col gap-3 p-3 sm:p-4 overflow-hidden" : "w-full max-w-7xl mx-auto space-y-4"}>
            <div className="flex items-center justify-between gap-4 flex-wrap shrink-0">
                {embedded ? <p className="text-sm font-semibold text-slate-400">Le caselle che gestisci</p> : (
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-2xl bg-sky-500/15 border border-sky-500/30"><Mail className="w-6 h-6 text-sky-400" /></div>
                        <div><h1 className="text-2xl font-black text-white tracking-tight">Email</h1><p className="text-slate-500 text-sm">Scrivi e rispondi ai clienti dal CRM</p></div>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    {selAccObj && (
                        <button onClick={() => aggiorna()} disabled={refreshing} title="Scarica la posta nuova" className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 disabled:opacity-40">
                            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        </button>
                    )}
                    {selAccObj?.status === "attiva" && (
                        <button onClick={() => { setComposeOpen(true); }} className="px-4 py-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-200 text-sm font-bold flex items-center gap-2 hover:bg-sky-500/25"><PenSquare className="w-4 h-4" /> Nuova email</button>
                    )}
                    <button onClick={() => setConnectModal(true)} className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> Collega email</button>
                </div>
            </div>

            {/* selettore casella */}
            {visibleAccounts.length > 0 && (
                <div className="flex gap-2 flex-wrap shrink-0">
                    {visibleAccounts.map(a => (
                        <button key={a.id} onClick={() => { setSelAcc(a.id); setSelConv(null); }}
                            className={cn("px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-2", selAcc === a.id ? "bg-sky-500/15 border-sky-500/40 text-sky-200" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10")}>
                            <Mail className="w-3.5 h-3.5" />{a.display_name || a.email_address}
                            <span className={cn("w-2 h-2 rounded-full", a.status === "attiva" ? "bg-emerald-400" : "bg-rose-400")} title={a.status === "attiva" ? "attiva" : (a.last_error || "errore")} />
                        </button>
                    ))}
                </div>
            )}

            {visibleAccounts.length === 0 ? (
                <div className={cn("glass-card p-12 text-center text-slate-400", embedded && "flex-1 flex flex-col items-center justify-center")}>
                    <Inbox className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                    Nessuna casella collegata. Premi <b className="text-sky-300">Collega email</b> e inserisci indirizzo e password della casella del negozio.
                </div>
            ) : (
                <div className={cn("grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4", embedded ? "flex-1 min-h-0" : "h-[calc(100vh-230px)]")}>
                    {/* elenco conversazioni */}
                    <div className="glass-card overflow-y-auto">
                        {selAccObj?.status !== "attiva" && <div className="p-3 text-xs text-rose-300 border-b border-rose-500/20 bg-rose-500/5">Casella in errore — {selAccObj?.last_error || "ricollega dalle impostazioni"}.</div>}
                        {convs.length === 0 ? (
                            <div className="p-6 text-center text-slate-500 text-sm">Ancora nessuna email. Premi ↻ per scaricare la posta.</div>
                        ) : convs.map(c => (
                            <button key={c.id} onClick={() => setSelConv(c)} className={cn("w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] flex items-center gap-3", selConv?.id === c.id && "bg-white/[0.05]")}>
                                <div className="w-9 h-9 rounded-full border bg-sky-500/15 border-sky-500/25 text-sky-300 flex items-center justify-center text-xs font-bold shrink-0">{nomeConv(c).slice(0, 2).toUpperCase()}</div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-white truncate">{nomeConv(c)}</span>
                                        <span className="text-[10px] text-slate-500 shrink-0">{fmtOra(c.last_message_at)}</span>
                                    </div>
                                    <div className="text-xs text-slate-400 truncate">{c.subject || "(senza oggetto)"}</div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs text-slate-500 truncate">{c.last_preview || ""}</span>
                                        {c.unread > 0 && <span className="text-[10px] font-bold bg-sky-500 text-white rounded-full px-1.5 shrink-0">{c.unread}</span>}
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
                                <div className="px-4 py-3 border-b border-white/10">
                                    <div className="text-sm font-bold text-white">{selConv.subject || "(senza oggetto)"}</div>
                                    <div className="text-[11px] text-slate-500">{nomeConv(selConv)} · {selConv.customer_email}{selConv.client_id ? " · cliente collegato" : ""}</div>
                                </div>
                                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                                    {msgs.map(m => {
                                        const mine = m.direction === "out";
                                        return (
                                            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                                                <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm", mine ? "bg-sky-600 text-white rounded-br-sm" : "bg-white/5 text-slate-100 rounded-bl-sm border border-white/5")}>
                                                    <div className={cn("text-[11px] mb-1 font-semibold", mine ? "text-sky-100" : "text-sky-300")}>{mine ? "Tu" : (m.from_name || m.from_addr)}</div>
                                                    {m.subject && m.subject !== selConv.subject && <div className="text-[11px] italic mb-1 opacity-80">{m.subject}</div>}
                                                    <p className="whitespace-pre-wrap break-words">{m.body_text || (m.body_html ? m.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "")}</p>
                                                    {(m.attachments || []).length > 0 && (
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {(m.attachments || []).map((a: any, i: number) => (
                                                                <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/20 hover:bg-black/30 text-xs"><Paperclip className="w-3 h-3" /><span className="truncate max-w-[160px]">{a.name}</span></a>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <p className={cn("text-[10px] mt-1 flex items-center gap-1 justify-end", mine ? "text-sky-100/70" : "text-slate-500")}>
                                                        {fmtOra(m.email_date || m.created_at)}
                                                        {mine && (m.status === "failed" ? <span className="text-rose-200">✕</span> : <Check className="w-3.5 h-3.5" />)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="p-3 border-t border-white/10 flex gap-2 items-end">
                                    <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) rispondi(); }}
                                        rows={2} placeholder="Rispondi…  (Ctrl+Invio per inviare)" className="glass-input flex-1 text-sm resize-none max-h-40" />
                                    <button onClick={rispondi} disabled={sending || !text.trim()} className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white"><>{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</></button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {connectModal && <ConnectModal onClose={() => { setConnectModal(false); loadAccounts(); }} ownerUserId={user?.id} negozio={user?.negozio} />}
            {composeOpen && selAcc && <ComposeModal accountId={selAcc} userId={user?.id} onClose={() => setComposeOpen(false)} onSent={(cid) => { setComposeOpen(false); if (cid) { /* la conversazione comparira' col polling */ } }} />}
        </div>
    );
}

// Modal: collega una casella (indirizzo + password; IMAP/SMTP auto dal dominio).
function ConnectModal({ onClose, ownerUserId, negozio }: { onClose: () => void; ownerUserId?: string; negozio?: string }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [display, setDisplay] = useState(negozio || "");
    const [adv, setAdv] = useState(false);
    const [imapHost, setImapHost] = useState(""); const [smtpHost, setSmtpHost] = useState("");
    const [busy, setBusy] = useState(false);
    const collega = async () => {
        if (!email.trim() || !password) return;
        setBusy(true);
        const res = await api("/api/email/account", { action: "connect", email: email.trim(), password, displayName: display.trim() || null, negozio, ownerUserId, imapHost: imapHost || undefined, smtpHost: smtpHost || undefined });
        setBusy(false);
        if (res?.error) { alert(res.error); return; }
        onClose();
    };
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="glass-card w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-white">Collega una casella email</h3><button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button></div>
                <div className="space-y-3">
                    <div><label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nome (es. negozio)</label><input value={display} onChange={e => setDisplay(e.target.value)} className="glass-input w-full text-sm mt-1" placeholder="Magliana W3" /></div>
                    <div><label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Indirizzo email</label><input value={email} onChange={e => setEmail(e.target.value)} className="glass-input w-full text-sm mt-1" placeholder="magliana@telefuturasrl.com" autoFocus /></div>
                    <div><label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Password casella</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="glass-input w-full text-sm mt-1" placeholder="password della casella" /></div>
                    <button onClick={() => setAdv(v => !v)} className="text-xs text-slate-500 hover:text-slate-300">{adv ? "− " : "+ "}Impostazioni avanzate (server)</button>
                    {adv && (<div className="grid grid-cols-1 gap-2">
                        <input value={imapHost} onChange={e => setImapHost(e.target.value)} className="glass-input w-full text-sm" placeholder="IMAP host (auto: mail.tuodominio)" />
                        <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className="glass-input w-full text-sm" placeholder="SMTP host (auto: mail.tuodominio)" />
                    </div>)}
                    <div className="text-[11px] text-slate-500">Verifichiamo lettura e invio prima di salvare. IMAP/SMTP vengono rilevati dal dominio (Gmail, Aruba, o mail.tuodominio).</div>
                    <button onClick={collega} disabled={busy || !email.trim() || !password} className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2">{busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifico…</> : "Collega casella"}</button>
                </div>
            </div>
        </div>
    );
}

// Modal: componi una nuova email (destinatario + oggetto + testo).
function ComposeModal({ accountId, userId, onClose, onSent }: { accountId: string; userId?: string; onClose: () => void; onSent: (cid?: string) => void }) {
    const [to, setTo] = useState(""); const [subject, setSubject] = useState(""); const [body, setBody] = useState(""); const [busy, setBusy] = useState(false);
    const invia = async () => {
        if (!to.trim() || !body.trim()) return;
        setBusy(true);
        const res = await api("/api/email/send", { accountId, to: to.trim(), subject: subject.trim(), text: body.trim(), userId });
        setBusy(false);
        if (res?.error) { alert("Invio non riuscito: " + res.error); return; }
        onSent(res?.conversationId);
    };
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="glass-card w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-white">Nuova email</h3><button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button></div>
                <div className="space-y-3">
                    <input value={to} onChange={e => setTo(e.target.value)} className="glass-input w-full text-sm" placeholder="Destinatario (email del cliente)" autoFocus />
                    <input value={subject} onChange={e => setSubject(e.target.value)} className="glass-input w-full text-sm" placeholder="Oggetto" />
                    <textarea value={body} onChange={e => setBody(e.target.value)} rows={7} className="glass-input w-full text-sm resize-none" placeholder="Scrivi il messaggio…" />
                    <button onClick={invia} disabled={busy || !to.trim() || !body.trim()} className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2">{busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Invio…</> : <><Send className="w-4 h-4" /> Invia</>}</button>
                </div>
            </div>
        </div>
    );
}
