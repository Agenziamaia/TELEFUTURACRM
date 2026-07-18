// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getInbox, listMessages, getParticipants, sendMessage, markRead,
  subscribeMessages, subscribeInbox, subscribeReceipts,
} from "@/lib/chat";
import { roleLabel } from "@/lib/roles";
import { usePresence } from "@/context/PresenceContext";
import { NewChatModal } from "./_components/NewChatModal";
import { Plus, Search, Send, Paperclip, X, Users, FileText, MessageSquare, Check, CheckCheck } from "lucide-react";

const initials = (n = "") => n.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
const fmtTime = (s) => new Date(s).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
function dayLabel(s) {
  const d = new Date(s), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Oggi";
  if (d.toDateString() === y.toDateString()) return "Ieri";
  return d.toLocaleDateString("it-IT");
}
const isImg = (m) => (m || "").startsWith("image/");
function lastSeen(s) {
  if (!s) return null;
  const d = new Date(s), now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "ultimo accesso poco fa";
  if (diff < 3600) return `ultimo accesso ${Math.floor(diff / 60)} min fa`;
  if (d.toDateString() === now.toDateString()) return `ultimo accesso alle ${fmtTime(s)}`;
  const y = new Date(); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `ultimo accesso ieri ${fmtTime(s)}`;
  return `ultimo accesso ${d.toLocaleDateString("it-IT")}`;
}

export default function ChatPage() {
  const { user } = useAuth();
  const meId = user?.id;
  const { isOnline } = usePresence();

  const [inbox, setInbox] = useState([]);
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [parts, setParts] = useState([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);

  const reloadInbox = async () => { if (!meId) return; try { setInbox(await getInbox(meId)); } catch {} };
  useEffect(() => { reloadInbox(); }, [meId]);
  useEffect(() => { if (!meId) return; return subscribeInbox(reloadInbox); }, [meId]);
  // apri una conversazione specifica se arrivi da un toast (/chat?c=<id>)
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) setSelId(c);
  }, []);

  const selConv = useMemo(() => inbox.find((c) => c.conversation_id === selId), [inbox, selId]);

  const reloadMessages = async (cid) => {
    try {
      setMessages(await listMessages(cid));
      if (meId) markRead(cid, meId).then(reloadInbox);
    } catch {}
  };
  useEffect(() => {
    if (!selId) { setMessages([]); setParts([]); return; }
    const loadParts = () => getParticipants(selId).then(setParts).catch(() => setParts([]));
    reloadMessages(selId);
    loadParts();
    const offMsg = subscribeMessages(selId, () => reloadMessages(selId));
    const offRcpt = subscribeReceipts(selId, loadParts);
    return () => { offMsg(); offRcpt(); };
  }, [selId]);

  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages]);

  const senderName = useMemo(() => {
    const m = {}; parts.forEach((p) => (m[p.user_id] = p.full_name)); return m;
  }, [parts]);

  const filteredInbox = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return inbox;
    return inbox.filter((c) => (c.title || c.other_name || "").toLowerCase().includes(s));
  }, [inbox, q]);

  const addFiles = (list) => setFiles((p) => [...p, ...Array.from(list || [])]);
  const onSend = async () => {
    if (!selId || !meId || sending) return;
    if (!text.trim() && files.length === 0) return;
    setSending(true);
    try { await sendMessage(selId, meId, text.trim(), files); setText(""); setFiles([]); await reloadMessages(selId); }
    catch { alert("Invio non riuscito"); }
    finally { setSending(false); }
  };

  const title = selConv ? (selConv.type === "group" ? selConv.title : selConv.other_name) : "";
  const dmOnline = selConv?.type === "dm" && isOnline(selConv.other_id);
  const otherPart = selConv?.type === "dm" ? parts.find((p) => p.user_id !== meId) : null;
  const receiptFor = (m) => {
    if (!otherPart) return "sent";
    const t = new Date(m.created_at).getTime();
    if (otherPart.last_read_at && new Date(otherPart.last_read_at).getTime() >= t) return "seen";
    if (otherPart.last_delivered_at && new Date(otherPart.last_delivered_at).getTime() >= t) return "delivered";
    return "sent";
  };

  let lastDay = null;

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden">
      {/* ── LEFT: conversation list ─────────────────────────────── */}
      <aside className="w-full sm:w-80 lg:w-96 shrink-0 flex flex-col border-r border-white/5 bg-[#0f111a]/60">
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/5">
          <h2 className="text-white font-semibold flex items-center gap-2"><MessageSquare className="w-5 h-5 text-indigo-400" /> Chat</h2>
          <button onClick={() => setShowNew(true)} className="p-2 rounded-lg bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25" title="Nuova conversazione">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca conversazioni…" className="glass-input w-full pl-9 h-9 text-sm" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {filteredInbox.length === 0 && (
            <p className="text-center text-sm text-slate-500 py-10">Nessuna conversazione.<br />Premi + per iniziare.</p>
          )}
          {filteredInbox.map((c) => {
            const name = c.type === "group" ? c.title : c.other_name;
            const active = c.conversation_id === selId;
            return (
              <button key={c.conversation_id} onClick={() => setSelId(c.conversation_id)}
                className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left transition-colors ${active ? "bg-indigo-500/15" : "hover:bg-white/5"}`}>
                <span className="relative shrink-0">
                  <span className={`w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold border ${c.type === "group" ? "bg-purple-500/20 text-purple-200 border-purple-500/30" : "bg-indigo-500/20 text-indigo-200 border-indigo-500/30"}`}>
                    {c.type === "group" ? <Users className="w-5 h-5" /> : initials(name)}
                  </span>
                  {c.type === "dm" && isOnline(c.other_id) && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-[#0f111a]" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white truncate">{name || "—"}</span>
                    <span className="text-[10px] text-slate-500 shrink-0">{fmtTime(c.last_message_at)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 truncate">{c.last_body || "Nessun messaggio"}</span>
                    {c.unread > 0 && <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">{c.unread}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── RIGHT: thread ───────────────────────────────────────── */}
      <section className="hidden sm:flex flex-1 flex-col bg-[#0b0d14]">
        {!selConv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <MessageSquare className="w-12 h-12 mb-3 opacity-40" />
            <p>Seleziona una conversazione</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-5 h-14 border-b border-white/5 shrink-0">
              <span className="relative shrink-0">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border ${selConv.type === "group" ? "bg-purple-500/20 text-purple-200 border-purple-500/30" : "bg-indigo-500/20 text-indigo-200 border-indigo-500/30"}`}>
                  {selConv.type === "group" ? <Users className="w-4 h-4" /> : initials(title)}
                </span>
                {selConv.type === "dm" && dmOnline && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[#0b0d14]" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{title}</p>
                <p className="text-xs text-slate-500 truncate flex items-center gap-1.5">
                  {selConv.type === "dm" && <span className={`w-2 h-2 rounded-full ${dmOnline ? "bg-green-500" : "bg-slate-600"}`} />}
                  {selConv.type === "group"
                    ? `${selConv.member_count} membri`
                    : (dmOnline ? "Online" : (lastSeen(otherPart?.last_seen_at) || roleLabel(selConv.other_role || "")))}
                </p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {messages.map((m) => {
                const mine = m.sender_id === meId;
                const showDay = (() => { const d = dayLabel(m.created_at); if (d !== lastDay) { lastDay = d; return d; } return null; })();
                return (
                  <div key={m.id}>
                    {showDay && <div className="text-center my-3"><span className="text-[11px] text-slate-500 bg-white/5 px-3 py-1 rounded-full">{showDay}</span></div>}
                    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${mine ? "bg-indigo-600 text-white rounded-br-sm" : "bg-white/5 text-slate-100 rounded-bl-sm border border-white/5"}`}>
                        {!mine && selConv.type === "group" && (
                          <p className="text-[11px] font-semibold text-indigo-300 mb-0.5">{senderName[m.sender_id] || "—"}</p>
                        )}
                        {(m.attachments || []).map((a) => (
                          <div key={a.id} className="mb-1">
                            {isImg(a.mime)
                              ? <a href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name || ""} className="max-w-[220px] max-h-[220px] rounded-lg object-cover" /></a>
                              : <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 text-xs"><FileText className="w-4 h-4 shrink-0" /><span className="truncate max-w-[180px]">{a.name || "file"}</span></a>}
                          </div>
                        ))}
                        {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
                        <p className={`text-[10px] mt-0.5 flex items-center gap-1 justify-end ${mine ? "text-indigo-200/70" : "text-slate-500"}`}>
                          {fmtTime(m.created_at)}
                          {mine && selConv.type === "dm" && (() => {
                            const r = receiptFor(m);
                            if (r === "seen") return <CheckCheck className="w-3.5 h-3.5 text-sky-300" />;
                            if (r === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-indigo-200/70" />;
                            return <Check className="w-3.5 h-3.5 text-indigo-200/70" />;
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* composer */}
            <div className="border-t border-white/5 px-4 py-3 shrink-0">
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {files.map((f, i) => (
                    <span key={i} className="flex items-center gap-1.5 text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-slate-300">
                      <FileText className="w-3.5 h-3.5" /><span className="truncate max-w-[140px]">{f.name}</span>
                      <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <button onClick={() => fileRef.current?.click()} className="p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5" title="Allega">
                  <Paperclip className="w-5 h-5" />
                </button>
                <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                <textarea value={text} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
                  rows={1} placeholder="Scrivi un messaggio…" className="glass-input flex-1 resize-none max-h-32 py-2.5" />
                <button onClick={onSend} disabled={sending || (!text.trim() && files.length === 0)}
                  className="p-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {showNew && meId && (
        <NewChatModal meId={meId} onClose={() => setShowNew(false)}
          onCreated={(cid) => { setShowNew(false); reloadInbox(); setSelId(cid); }} />
      )}
    </div>
  );
}
