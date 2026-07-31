"use client";

// Inbox Email riusabile (webmail nel CRM), interfaccia in stile Gmail ma in tema
// scuro glassmorphism. Cartelle (Posta in arrivo / Speciali / Inviati / Bozze /
// Spam / Cestino), stella, spam, cestino, archivia, bozze e composizione agganciata
// in basso a destra. Una casella per negozio: IMAP per leggere, SMTP per inviare
// (route /api/email/*). embedded=true -> pensata per stare dentro la pagina Chat.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useVisibleStores, sameStore } from "@/lib/visibleStores";
import {
    Mail, Plus, Send, X, RefreshCw, Loader2, Paperclip, Check, PenSquare, Inbox,
    Star, Trash2, ShieldAlert, Archive, Search, CornerUpLeft, FileText, SendHorizontal,
    RotateCcw, ChevronLeft, MailOpen,
} from "lucide-react";
import { cn } from "@/utils";

type Account = { id: string; email_address: string; display_name: string | null; negozio: string | null; owner_user_id: string | null; status: string; last_error?: string | null };
type Conv = { id: string; account_id: string; customer_email: string; customer_name: string | null; client_id: string | null; subject: string | null; last_preview: string | null; last_message_at: string | null; unread: number; starred?: boolean; spam?: boolean; trashed?: boolean; archived?: boolean };
type Msg = { id: string; direction: string; from_addr: string | null; from_name: string | null; to_addrs: string | null; subject: string | null; body_text: string | null; body_html: string | null; attachments: any[]; status: string | null; email_date: string | null; created_at: string };
type Draft = { id: string; account_id: string; to_addr: string | null; subject: string | null; body: string | null; updated_at: string };
type FolderId = "inbox" | "starred" | "sent" | "drafts" | "spam" | "trash";

const api = (path: string, body: unknown) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
const FOLDERS: { id: FolderId; label: string; icon: any }[] = [
    { id: "inbox", label: "Posta in arrivo", icon: Inbox },
    { id: "starred", label: "Speciali", icon: Star },
    { id: "sent", label: "Inviati", icon: SendHorizontal },
    { id: "drafts", label: "Bozze", icon: FileText },
    { id: "spam", label: "Spam", icon: ShieldAlert },
    { id: "trash", label: "Cestino", icon: Trash2 },
];

export function EmailInbox({ embedded = false, componiA = null }: { embedded?: boolean; componiA?: string | null }) {
    const { user } = useAuth();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selAcc, setSelAcc] = useState<string | null>(null);
    const [convs, setConvs] = useState<Conv[]>([]);
    const [sentIds, setSentIds] = useState<Set<string>>(new Set());
    const [drafts, setDrafts] = useState<Draft[]>([]);
    const [folder, setFolder] = useState<FolderId>("inbox");
    const [selConv, setSelConv] = useState<Conv | null>(null);
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [search, setSearch] = useState("");
    const [connectModal, setConnectModal] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const { stores: myStores } = useVisibleStores();

    // composizione (dock in basso a destra, stile Gmail)
    const [composeOpen, setComposeOpen] = useState(false);
    const [cTo, setCTo] = useState(""); const [cSubject, setCSubject] = useState(""); const [cBody, setCBody] = useState("");
    const [cDraftId, setCDraftId] = useState<string | null>(null);

    // VISIBILITÀ (Luca 28/07): NESSUNA vista "tutte le caselle" — nemmeno per
    // amministrazione o admin. Ognuno vede le PROPRIE; lo store manager anche
    // quella del suo negozio (la casella è del punto vendita). L'admin ispeziona
    // le altrui SOLO impersonando la persona dal "Vedi come" in alto: lì lo
    // user effettivo diventa il suo, e questa regola fa il resto da sola.
    const scope: "store" | "own" = useMemo(() => {
        const role = user?.role || "";
        if (role === "store_manager") return "store";
        return "own";
    }, [user?.role]);
    const visibleAccounts = useMemo(() => {
        if (scope === "own") return accounts.filter(a => a.owner_user_id === user?.id);
        return accounts.filter(a => a.owner_user_id === user?.id || (a.negozio && myStores.some(s => sameStore(a.negozio, s))));
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

    // DEEP-LINK dal CRM (Luca 28/07): /chat?mail=<indirizzo> arriva come componiA e
    // apre SUBITO la composizione col destinatario precompilato (bottone ✉️ cliente).
    const [prefillTo, setPrefillTo] = useState<string | null>(componiA || null);
    useEffect(() => { if (componiA) setPrefillTo(componiA); }, [componiA]);
    useEffect(() => {
        if (prefillTo && selAcc) { setCTo(prefillTo); setCSubject(""); setCBody(""); setCDraftId(null); setComposeOpen(true); setPrefillTo(null); }
    }, [prefillTo, selAcc]);

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

    // quali conversazioni hanno un messaggio in uscita (per la cartella Inviati)
    useEffect(() => {
        if (!selAcc) { setSentIds(new Set()); return; }
        let alive = true;
        supabase.from("email_messages").select("conversation_id").eq("account_id", selAcc).eq("direction", "out")
            .then(({ data }) => { if (alive) setSentIds(new Set((data ?? []).map((r: any) => r.conversation_id))); });
        return () => { alive = false; };
    }, [selAcc, convs.length]);

    // bozze
    const loadDrafts = useCallback(async () => {
        if (!selAcc) { setDrafts([]); return; }
        const { data } = await supabase.from("email_drafts").select("*").eq("account_id", selAcc).order("updated_at", { ascending: false });
        setDrafts((data ?? []) as Draft[]);
    }, [selAcc]);
    useEffect(() => { loadDrafts(); const t = setInterval(loadDrafts, 8000); return () => clearInterval(t); }, [loadDrafts]);

    // messaggi della conversazione selezionata
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

    // se cambio cartella/casella, chiudo il thread aperto
    useEffect(() => { setSelConv(null); }, [folder, selAcc]);

    // ── azioni sulle conversazioni (aggiornamento ottimistico + DB) ────────────
    const patchConv = async (id: string, patch: Partial<Conv>) => {
        setConvs(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c));
        setSelConv(sc => sc && sc.id === id ? { ...sc, ...patch } : sc);
        await supabase.from("email_conversations").update(patch).eq("id", id);
    };
    const toggleStar = (c: Conv, e?: React.MouseEvent) => { e?.stopPropagation(); patchConv(c.id, { starred: !c.starred }); };
    const doArchive = (c: Conv) => { patchConv(c.id, { archived: true }); if (selConv?.id === c.id) setSelConv(null); };
    const doTrash = (c: Conv) => { patchConv(c.id, { trashed: true }); if (selConv?.id === c.id) setSelConv(null); };
    const doSpam = (c: Conv, val: boolean) => { patchConv(c.id, { spam: val }); if (val && selConv?.id === c.id) setSelConv(null); };
    const doRestore = (c: Conv) => { patchConv(c.id, { trashed: false, spam: false, archived: false }); };
    const markUnread = (c: Conv) => { patchConv(c.id, { unread: 1 }); if (selConv?.id === c.id) setSelConv(null); };
    const deleteForever = async (c: Conv) => {
        await supabase.from("email_conversations").delete().eq("id", c.id);
        setConvs(cs => cs.filter(x => x.id !== c.id)); if (selConv?.id === c.id) setSelConv(null);
    };

    // ── composizione ───────────────────────────────────────────────────────────
    const openNewCompose = () => { setCTo(""); setCSubject(""); setCBody(""); setCDraftId(null); setComposeOpen(true); };
    const openDraft = (d: Draft) => { setCTo(d.to_addr || ""); setCSubject(d.subject || ""); setCBody(d.body || ""); setCDraftId(d.id); setComposeOpen(true); };
    const saveDraft = async (silent = false) => {
        if (!selAcc) return;
        if (!cTo.trim() && !cSubject.trim() && !cBody.trim()) return;
        const payload: any = { account_id: selAcc, to_addr: cTo.trim() || null, subject: cSubject.trim() || null, body: cBody || null, updated_at: new Date().toISOString() };
        if (cDraftId) { await supabase.from("email_drafts").update(payload).eq("id", cDraftId); }
        else { const { data } = await supabase.from("email_drafts").insert(payload).select("id").single(); if (data) setCDraftId(data.id); }
        if (!silent) loadDrafts();
    };
    const closeCompose = async () => { await saveDraft(true); setComposeOpen(false); loadDrafts(); };
    const discardCompose = async () => { if (cDraftId) await supabase.from("email_drafts").delete().eq("id", cDraftId); setComposeOpen(false); setCTo(""); setCSubject(""); setCBody(""); setCDraftId(null); loadDrafts(); };
    const sendCompose = async () => {
        if (!cTo.trim() || !cBody.trim() || !selAcc || sending) return;
        setSending(true);
        const res = await api("/api/email/send", { accountId: selAcc, to: cTo.trim(), subject: cSubject.trim(), text: cBody.trim(), userId: user?.id });
        setSending(false);
        if (res?.error) { alert("Invio non riuscito: " + res.error); return; }
        if (cDraftId) await supabase.from("email_drafts").delete().eq("id", cDraftId);
        setComposeOpen(false); setCTo(""); setCSubject(""); setCBody(""); setCDraftId(null);
        loadDrafts();
    };

    const rispondi = async () => {
        if (!selConv || !text.trim() || sending) return;
        setSending(true);
        const res = await api("/api/email/send", { conversationId: selConv.id, text: text.trim(), userId: user?.id });
        if (res?.error) alert("Invio non riuscito: " + res.error); else setText("");
        setSending(false);
    };

    // ── derivati ──────────────────────────────────────────────────────────────
    const selAccObj = visibleAccounts.find(a => a.id === selAcc);
    const fmtOra = (s: string | null) => s ? new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
    const nomeConv = (c: Conv) => c.customer_name || c.customer_email;
    const inFolder = useMemo(() => {
        switch (folder) {
            case "inbox": return convs.filter(c => !c.trashed && !c.spam && !c.archived);
            case "starred": return convs.filter(c => c.starred && !c.trashed && !c.spam);
            case "sent": return convs.filter(c => sentIds.has(c.id) && !c.trashed && !c.spam);
            case "spam": return convs.filter(c => c.spam && !c.trashed);
            case "trash": return convs.filter(c => c.trashed);
            default: return convs;
        }
    }, [convs, folder, sentIds]);
    const q = search.trim().toLowerCase();
    const shown = q ? inFolder.filter(c => `${nomeConv(c)} ${c.customer_email} ${c.subject || ""} ${c.last_preview || ""}`.toLowerCase().includes(q)) : inFolder;
    const draftsShown = q ? drafts.filter(d => `${d.to_addr || ""} ${d.subject || ""} ${d.body || ""}`.toLowerCase().includes(q)) : drafts;
    const inboxUnread = convs.filter(c => !c.trashed && !c.spam && !c.archived).reduce((a, c) => a + (c.unread || 0), 0);
    const spamCount = convs.filter(c => c.spam && !c.trashed).length;
    const counts: Record<FolderId, number> = { inbox: inboxUnread, starred: 0, sent: 0, drafts: drafts.length, spam: spamCount, trash: 0 };
    const folderLabel = FOLDERS.find(f => f.id === folder)?.label || "";

    // ── stati "vuoto" ───────────────────────────────────────────────────────────
    if (visibleAccounts.length === 0) {
        return (
            <div className={embedded ? "h-full flex flex-col gap-3 p-3 sm:p-4 overflow-hidden" : "w-full max-w-7xl mx-auto space-y-4"}>
                <TopBar embedded={embedded} onConnect={() => setConnectModal(true)} />
                <div className={cn("glass-card p-12 text-center text-slate-400", embedded && "flex-1 flex flex-col items-center justify-center")}>
                    <Inbox className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                    Nessuna casella collegata. Premi <b className="text-sky-300">Collega email</b> e inserisci indirizzo e password della casella del negozio.
                </div>
                {connectModal && <ConnectModal onClose={() => { setConnectModal(false); loadAccounts(); }} ownerUserId={user?.id} negozio={user?.negozio} />}
            </div>
        );
    }

    return (
        <div className={embedded ? "h-full flex flex-col gap-3 p-3 sm:p-4 overflow-hidden" : "w-full max-w-7xl mx-auto space-y-4"}>
            <TopBar embedded={embedded} onConnect={() => setConnectModal(true)} onRefresh={() => aggiorna()} refreshing={refreshing} search={search} setSearch={setSearch} showSearch />

            {/* selettore casella (se piu' di una) */}
            {visibleAccounts.length > 1 && (
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

            <div className={cn("grid grid-cols-1 lg:grid-cols-[196px_minmax(300px,360px)_1fr] gap-3", embedded ? "flex-1 min-h-0" : "h-[calc(100vh-230px)]")}>
                {/* ── RAIL cartelle ── */}
                <div className={cn("glass-card p-3 flex flex-col gap-2", selConv && "hidden lg:flex")}>
                    <button onClick={openNewCompose} className="w-full mb-1 px-4 py-3 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 transition-colors">
                        <PenSquare className="w-4 h-4" /> Scrivi
                    </button>
                    <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
                        {FOLDERS.map(f => {
                            const Icon = f.icon; const active = folder === f.id; const n = counts[f.id];
                            return (
                                <button key={f.id} onClick={() => setFolder(f.id)}
                                    className={cn("shrink-0 lg:w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-colors",
                                        active ? "bg-sky-500/15 text-sky-200 border border-sky-500/30" : "text-slate-300 hover:bg-white/5 border border-transparent")}>
                                    <Icon className={cn("w-4 h-4 shrink-0", active ? "text-sky-300" : "text-slate-400")} />
                                    <span className="truncate flex-1 text-left">{f.label}</span>
                                    {n > 0 && <span className={cn("text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0", f.id === "spam" ? "bg-rose-500/80 text-white" : active ? "bg-sky-400 text-slate-900" : "bg-white/10 text-slate-300")}>{n}</span>}
                                </button>
                            );
                        })}
                    </nav>
                    {selAccObj && <div className="mt-auto pt-2 border-t border-white/5 text-[10px] text-slate-500 truncate px-1" title={selAccObj.email_address}>{selAccObj.email_address}</div>}
                </div>

                {/* ── LISTA ── */}
                <div className={cn("glass-card overflow-hidden flex flex-col min-h-0", selConv && "hidden lg:flex")}>
                    <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between shrink-0">
                        <span className="text-sm font-bold text-white">{folderLabel}</span>
                        <span className="text-[11px] text-slate-500">{folder === "drafts" ? draftsShown.length : shown.length}</span>
                    </div>
                    {selAccObj?.status !== "attiva" && <div className="p-3 text-xs text-rose-300 border-b border-rose-500/20 bg-rose-500/5 shrink-0">Casella in errore — {selAccObj?.last_error || "ricollega dalle impostazioni"}.</div>}

                    <div className="flex-1 overflow-y-auto">
                        {folder === "drafts" ? (
                            draftsShown.length === 0 ? <EmptyList icon={FileText} label="Nessuna bozza" />
                                : draftsShown.map(d => (
                                    <button key={d.id} onClick={() => openDraft(d)} className="w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] flex items-center gap-3 group">
                                        <div className="w-9 h-9 rounded-full border bg-amber-500/15 border-amber-500/25 text-amber-300 flex items-center justify-center shrink-0"><FileText className="w-4 h-4" /></div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-semibold text-amber-300/90 truncate">Bozza · {d.to_addr || "senza destinatario"}</span>
                                                <span className="text-[10px] text-slate-500 shrink-0">{fmtOra(d.updated_at)}</span>
                                            </div>
                                            <div className="text-xs text-slate-400 truncate">{d.subject || "(senza oggetto)"}</div>
                                            <div className="text-xs text-slate-500 truncate">{(d.body || "").replace(/\s+/g, " ").trim() || "…"}</div>
                                        </div>
                                        <span onClick={(e) => { e.stopPropagation(); supabase.from("email_drafts").delete().eq("id", d.id).then(() => loadDrafts()); }} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 shrink-0" title="Elimina bozza"><Trash2 className="w-4 h-4" /></span>
                                    </button>
                                ))
                        ) : shown.length === 0 ? (
                            <EmptyList icon={folder === "trash" ? Trash2 : folder === "spam" ? ShieldAlert : folder === "starred" ? Star : Inbox} label={folder === "inbox" ? "Nessuna email. Premi ↻ per scaricare la posta." : "Niente qui"} />
                        ) : shown.map(c => (
                            <div key={c.id} onClick={() => setSelConv(c)}
                                className={cn("w-full cursor-pointer px-3 py-3 border-b border-white/5 hover:bg-white/[0.03] flex items-center gap-2.5 group", selConv?.id === c.id && "bg-white/[0.05]", c.unread > 0 && "bg-sky-500/[0.04]")}>
                                <button onClick={(e) => toggleStar(c, e)} className="p-0.5 shrink-0" title={c.starred ? "Togli speciale" : "Segna come speciale"}>
                                    <Star className={cn("w-4 h-4 transition-colors", c.starred ? "fill-amber-400 text-amber-400" : "text-slate-600 hover:text-slate-400")} />
                                </button>
                                <div className={cn("w-9 h-9 rounded-full border flex items-center justify-center text-xs font-bold shrink-0", c.unread > 0 ? "bg-sky-500/25 border-sky-400/40 text-sky-200" : "bg-sky-500/10 border-sky-500/20 text-sky-300/80")}>{nomeConv(c).slice(0, 2).toUpperCase()}</div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={cn("text-sm truncate", c.unread > 0 ? "font-bold text-white" : "font-semibold text-slate-200")}>{nomeConv(c)}</span>
                                        <span className="text-[10px] text-slate-500 shrink-0">{fmtOra(c.last_message_at)}</span>
                                    </div>
                                    <div className={cn("text-xs truncate", c.unread > 0 ? "text-slate-200 font-medium" : "text-slate-400")}>{c.subject || "(senza oggetto)"}</div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs text-slate-500 truncate">{c.last_preview || ""}</span>
                                        {c.unread > 0 && <span className="text-[10px] font-bold bg-sky-500 text-white rounded-full px-1.5 shrink-0">{c.unread}</span>}
                                    </div>
                                </div>
                                {/* azioni rapide al hover */}
                                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                                    {folder === "trash" ? (
                                        <>
                                            <IconBtn title="Ripristina" onClick={(e) => { e.stopPropagation(); doRestore(c); }}><RotateCcw className="w-3.5 h-3.5" /></IconBtn>
                                            <IconBtn title="Elimina definitivamente" danger onClick={(e) => { e.stopPropagation(); if (confirm("Eliminare definitivamente questa conversazione?")) deleteForever(c); }}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                                        </>
                                    ) : folder === "spam" ? (
                                        <>
                                            <IconBtn title="Non è spam" onClick={(e) => { e.stopPropagation(); doSpam(c, false); }}><ShieldAlert className="w-3.5 h-3.5" /></IconBtn>
                                            <IconBtn title="Cestina" danger onClick={(e) => { e.stopPropagation(); doTrash(c); }}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                                        </>
                                    ) : (
                                        <>
                                            <IconBtn title="Archivia" onClick={(e) => { e.stopPropagation(); doArchive(c); }}><Archive className="w-3.5 h-3.5" /></IconBtn>
                                            <IconBtn title="Segna come spam" onClick={(e) => { e.stopPropagation(); doSpam(c, true); }}><ShieldAlert className="w-3.5 h-3.5" /></IconBtn>
                                            <IconBtn title="Cestina" danger onClick={(e) => { e.stopPropagation(); doTrash(c); }}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── LETTURA thread ── */}
                <div className={cn("glass-card flex flex-col min-h-0", !selConv && "hidden lg:flex")}>
                    {!selConv ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-3">
                            <MailOpen className="w-14 h-14" />
                            <span className="text-sm text-slate-500">Seleziona una email da leggere</span>
                        </div>
                    ) : (
                        <>
                            <div className="px-4 py-3 border-b border-white/10 shrink-0">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex items-center gap-2">
                                        <button onClick={() => setSelConv(null)} className="lg:hidden p-1 -ml-1 text-slate-400 hover:text-white"><ChevronLeft className="w-5 h-5" /></button>
                                        <div className="min-w-0">
                                            <div className="text-base font-bold text-white truncate">{selConv.subject || "(senza oggetto)"}</div>
                                            <div className="text-[11px] text-slate-500 truncate">{nomeConv(selConv)} · {selConv.customer_email}{selConv.client_id ? " · cliente collegato" : ""}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                        <IconBtn title={selConv.starred ? "Togli speciale" : "Speciale"} onClick={() => toggleStar(selConv)}><Star className={cn("w-4 h-4", selConv.starred && "fill-amber-400 text-amber-400")} /></IconBtn>
                                        {selConv.trashed ? (
                                            <>
                                                <IconBtn title="Ripristina" onClick={() => doRestore(selConv)}><RotateCcw className="w-4 h-4" /></IconBtn>
                                                <IconBtn title="Elimina definitivamente" danger onClick={() => { if (confirm("Eliminare definitivamente?")) deleteForever(selConv); }}><Trash2 className="w-4 h-4" /></IconBtn>
                                            </>
                                        ) : (
                                            <>
                                                <IconBtn title="Archivia" onClick={() => doArchive(selConv)}><Archive className="w-4 h-4" /></IconBtn>
                                                {selConv.spam
                                                    ? <IconBtn title="Non è spam" onClick={() => doSpam(selConv, false)}><ShieldAlert className="w-4 h-4" /></IconBtn>
                                                    : <IconBtn title="Segna come spam" onClick={() => doSpam(selConv, true)}><ShieldAlert className="w-4 h-4" /></IconBtn>}
                                                <IconBtn title="Segna come da leggere" onClick={() => markUnread(selConv)}><MailOpen className="w-4 h-4" /></IconBtn>
                                                <IconBtn title="Cestina" danger onClick={() => doTrash(selConv)}><Trash2 className="w-4 h-4" /></IconBtn>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                                {msgs.map(m => {
                                    const mine = m.direction === "out";
                                    const body = m.body_text || (m.body_html ? m.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");
                                    return (
                                        <div key={m.id} className={cn("rounded-2xl border p-3.5", mine ? "bg-sky-500/[0.08] border-sky-500/20" : "bg-white/[0.03] border-white/10")}>
                                            <div className="flex items-center gap-2.5 mb-2">
                                                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0", mine ? "bg-sky-500/25 text-sky-200" : "bg-slate-500/20 text-slate-300")}>
                                                    {(mine ? (selAccObj?.display_name || "Tu") : (m.from_name || m.from_addr || "?")).slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-semibold text-white truncate">{mine ? "Tu" : (m.from_name || m.from_addr)}</div>
                                                    <div className="text-[10px] text-slate-500 truncate">{mine ? `a ${m.to_addrs || selConv.customer_email}` : (m.from_addr || "")}</div>
                                                </div>
                                                <div className="text-[10px] text-slate-500 shrink-0 flex items-center gap-1">
                                                    {fmtOra(m.email_date || m.created_at)}
                                                    {mine && (m.status === "failed" ? <span className="text-rose-300" title="invio fallito">✕</span> : <Check className="w-3.5 h-3.5 text-sky-300" />)}
                                                </div>
                                            </div>
                                            {m.subject && m.subject !== selConv.subject && <div className="text-[11px] italic text-slate-400 mb-1">{m.subject}</div>}
                                            <p className="text-sm text-slate-100 whitespace-pre-wrap break-words leading-relaxed">{body}</p>
                                            {(m.attachments || []).length > 0 && (
                                                <div className="mt-2.5 flex flex-wrap gap-1.5">
                                                    {(m.attachments || []).map((a: any, i: number) => (
                                                        <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/25 hover:bg-black/40 text-xs text-slate-200 border border-white/5"><Paperclip className="w-3 h-3" /><span className="truncate max-w-[180px]">{a.name}</span></a>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {msgs.length === 0 && <div className="text-center text-slate-500 text-sm py-8">Nessun messaggio.</div>}
                            </div>

                            {!selConv.trashed && !selConv.spam && (
                                <div className="p-3 border-t border-white/10 shrink-0">
                                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1.5 px-1"><CornerUpLeft className="w-3.5 h-3.5" /> Rispondi a {nomeConv(selConv)}</div>
                                    <div className="flex gap-2 items-end">
                                        <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) rispondi(); }}
                                            rows={2} placeholder="Scrivi la risposta…  (Ctrl+Invio per inviare)" className="glass-input flex-1 text-sm resize-none max-h-40" />
                                        <button onClick={rispondi} disabled={sending || !text.trim()} className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white shrink-0">{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── COMPOSE dock (stile Gmail) ── */}
            {composeOpen && selAcc && (
                <div className="fixed z-[1000] bottom-0 right-0 sm:right-6 w-full sm:w-[512px] max-w-full">
                    <div className="glass-card m-0 sm:mb-0 rounded-b-none sm:rounded-b-none rounded-t-2xl border border-white/10 shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[560px]">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.04] rounded-t-2xl border-b border-white/10">
                            <span className="text-sm font-bold text-white">{cDraftId ? "Bozza" : "Nuovo messaggio"}</span>
                            <div className="flex items-center gap-1">
                                <IconBtn title="Elimina bozza" danger onClick={discardCompose}><Trash2 className="w-4 h-4" /></IconBtn>
                                <IconBtn title="Chiudi (salva bozza)" onClick={closeCompose}><X className="w-4 h-4" /></IconBtn>
                            </div>
                        </div>
                        <div className="px-4 pt-3 flex flex-col gap-2 overflow-y-auto">
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 pb-1 border-b border-white/5">Da <span className="text-slate-300 font-medium">{selAccObj?.email_address}</span></div>
                            <input value={cTo} onChange={e => setCTo(e.target.value)} className="bg-transparent border-b border-white/5 focus:border-sky-500/40 outline-none py-1.5 text-sm text-white placeholder:text-slate-500" placeholder="A (email del destinatario)" autoFocus />
                            <input value={cSubject} onChange={e => setCSubject(e.target.value)} className="bg-transparent border-b border-white/5 focus:border-sky-500/40 outline-none py-1.5 text-sm text-white placeholder:text-slate-500" placeholder="Oggetto" />
                            <textarea value={cBody} onChange={e => setCBody(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendCompose(); }} rows={9} className="bg-transparent outline-none py-2 text-sm text-slate-100 resize-none min-h-[140px] placeholder:text-slate-500" placeholder="Scrivi il messaggio…" />
                        </div>
                        <div className="px-4 py-3 border-t border-white/10 flex items-center gap-2">
                            <button onClick={sendCompose} disabled={sending || !cTo.trim() || !cBody.trim()} className="px-5 py-2 rounded-full bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white text-sm font-bold flex items-center gap-2">{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Invia</button>
                            <button onClick={() => saveDraft(false)} className="px-3 py-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold">Salva bozza</button>
                            <span className="ml-auto text-[10px] text-slate-600">Ctrl+Invio per inviare</span>
                        </div>
                    </div>
                </div>
            )}

            {connectModal && <ConnectModal onClose={() => { setConnectModal(false); loadAccounts(); }} ownerUserId={user?.id} negozio={user?.negozio} />}
        </div>
    );
}

// intestazione riusabile (titolo/azioni + ricerca)
function TopBar({ embedded, onConnect, onRefresh, refreshing, search, setSearch, showSearch }: { embedded: boolean; onConnect: () => void; onRefresh?: () => void; refreshing?: boolean; search?: string; setSearch?: (v: string) => void; showSearch?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
            {embedded ? (
                showSearch ? (
                    <div className="relative flex-1 min-w-[180px] max-w-md">
                        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input value={search} onChange={e => setSearch?.(e.target.value)} placeholder="Cerca nelle email…" className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-slate-500 focus:border-sky-500/40 outline-none" />
                    </div>
                ) : <p className="text-sm font-semibold text-slate-400">Le caselle che gestisci</p>
            ) : (
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-sky-500/15 border border-sky-500/30"><Mail className="w-6 h-6 text-sky-400" /></div>
                    <div><h1 className="text-2xl font-black text-white tracking-tight">Email</h1><p className="text-slate-500 text-sm">Scrivi e rispondi ai clienti dal CRM</p></div>
                </div>
            )}
            <div className="flex items-center gap-2 shrink-0">
                {onRefresh && (
                    <button onClick={onRefresh} disabled={refreshing} title="Scarica la posta nuova" className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 disabled:opacity-40">
                        {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                )}
                <button onClick={onConnect} className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> Collega email</button>
            </div>
        </div>
    );
}

// piccolo bottone-icona riusabile
function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: (e: React.MouseEvent) => void; danger?: boolean }) {
    return (
        <button title={title} onClick={onClick} className={cn("p-1.5 rounded-lg transition-colors text-slate-400", danger ? "hover:bg-rose-500/20 hover:text-rose-300" : "hover:bg-white/10 hover:text-white")}>{children}</button>
    );
}

function EmptyList({ icon: Icon, label }: { icon: any; label: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-slate-600">
            <Icon className="w-10 h-10" />
            <span className="text-sm text-slate-500 text-center px-6">{label}</span>
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
        if (res?.reconnected) alert("Questa casella era già collegata: l'ho ri-collegata con le credenziali appena inserite.");
        onClose();
    };
    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
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
