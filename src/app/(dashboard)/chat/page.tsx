// @ts-nocheck
"use client";


import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useVisibleStores, sameStore } from "@/lib/visibleStores";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import {
  getInbox, listMessages, getParticipants, sendMessage, sendGif, markRead,
  subscribeMessages, subscribeInbox, subscribeReceipts, subscribeReactions, toggleReaction, markUnread, forwardMessage, getOrCreateDM, togglePin, refHref,
  splitBody, refToken, searchAllEntities, recentEntities, deleteConversation,
  listDirectory, addParticipants, removeParticipant,
} from "@/lib/chat";
import type { ChatMessage, DirUser } from "@/lib/chat";
import { roleLabel, seesAllStores, seesWholeStore } from "@/lib/roles";
import { usePresence } from "@/context/PresenceContext";
import { NewChatModal } from "./_components/NewChatModal";
import { TagPicker } from "./_components/TagPicker";
import { ImageLightbox } from "@/components/ImageLightbox";
import { Plus, Search, Send, Paperclip, X, Users, FileText, MessageSquare, Check, CheckCheck, Tag, User, CalendarDays, Trash2, Reply, MessageCircle, Mail, Info, UserPlus, UserMinus, SmilePlus, Smile, EyeOff, Forward, Camera, Disc, Pin, PinOff } from "lucide-react";
import { WhatsAppInbox } from "@/components/WhatsAppInbox";
import { EmailInbox } from "@/components/EmailInbox";
import { cn } from "@/utils";

// Segnalazione 74: testo breve del messaggio citato (i tag @[tipo:id|etichetta]
// diventano la loro etichetta, altrimenti si vedrebbe il token grezzo).
function previewBody(m: ChatMessage): string {
  if (!m.body) return (m.attachments || []).length ? "Allegato" : "—";
  const t = splitBody(m.body)
    .map((p: any) => (p.text !== undefined ? p.text : (p.ref?.label || "").split(" · ")[0]))
    .join("")
    .trim();
  return t.length > 120 ? t.slice(0, 120) + "…" : (t || "Allegato");
}

// icona + colore per tipo di tag
const REF_UI = {
  cliente: { Icon: User, cls: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30 hover:bg-emerald-500/25" },
  contratto: { Icon: FileText, cls: "bg-sky-500/15 text-sky-200 border-sky-500/30 hover:bg-sky-500/25" },
  appuntamento: { Icon: CalendarDays, cls: "bg-amber-500/15 text-amber-200 border-amber-500/30 hover:bg-amber-500/25" },
};

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

function ChatPageInner() {
  const { user } = useAuth();
  const meId = user?.id;
  const meName = user?.name || "";
  // reazioni rapide stile Telegram + set del picker del compositore
  const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "👏"];
  const EMOJI_SET = [
    "😀","😁","😂","🤣","😊","😍","😘","😎","🤩","🥳","😉","🙃","😅","😇","🤗","🤔",
    "😐","🙄","😴","🤯","😱","😭","😢","😤","😡","🥶","🤒","🤫","🫡","🤝","👍","👎",
    "👏","🙏","💪","🤞","✌️","👌","🤙","👋","🫶","❤️","🧡","💛","💚","💙","💜","🖤",
    "💯","🔥","⭐","✨","🎉","🎊","🏆","🥇","⚡","💡","✅","❌","⚠️","❓","❗","💰",
    "📱","💻","📞","📧","📎","📌","🗓️","⏰","🛒","📦","🚚","🔧","🧩","🏪","☕","🍕",
  ];
  const [reactFor, setReactFor] = useState<string | null>(null);   // msg col menu reazioni aperto
  const [showEmoji, setShowEmoji] = useState(false);               // picker nel compositore
  // "segna come da leggere": il badge torna e la chat si deseleziona (se
  // restasse aperta si ri-segnerebbe letta da sola)
  // fissa/sgancia (max 5, stile Telegram)
  const onTogglePin = async (e: React.MouseEvent, c: any) => {
    e.stopPropagation(); e.preventDefault();
    const fissa = !c.pinned_at;
    if (fissa && inbox.filter((x: any) => x.pinned_at).length >= 5) { alert("Puoi fissare al massimo 5 chat: sganciane una prima."); return; }
    try { await togglePin(c.conversation_id, meId!, fissa); await reloadInbox(); }
    catch (err) { alert((err as Error)?.message || "Operazione non riuscita"); }
  };
  const onMarkUnread = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation(); e.preventDefault();
    try { await markUnread(convId, meId!); if (selId === convId) setSelId(null); await reloadInbox(); }
    catch { /* riprova dal menu */ }
  };
  // ── INOLTRO (Luca 02/08): scegli conversazione o persona e il messaggio
  //    parte con testo, tag e allegati (stessi URL, niente re-upload) ──
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [forwardCerca, setForwardCerca] = useState("");
  const [forwardBusy, setForwardBusy] = useState(false);
  const inoltraA = async (targetConvId: string) => {
    if (!forwardMsg || forwardBusy) return;
    setForwardBusy(true);
    try {
      await forwardMessage(forwardMsg, meId!, targetConvId);
      setForwardMsg(null); setForwardCerca("");
      setSelId(targetConvId);                       // come Telegram: salta alla chat
      await reloadInbox();
    } catch (e) { alert("Inoltro non riuscito: " + ((e as Error)?.message || e)); }
    finally { setForwardBusy(false); }
  };
  const inoltraAUtente = async (otherId: string) => {
    try { const cid = await getOrCreateDM(meId!, otherId); await inoltraA(cid); }
    catch (e) { alert("Inoltro non riuscito: " + ((e as Error)?.message || e)); }
  };

  // ── CATTURA SCHERMO (Luca 02/08): screenshot o registrazione con il picker
  //    nativo del browser (si puo' scegliere lo schermo intero, non solo il
  //    CRM); il file finisce tra gli allegati del messaggio in scrittura ──
  const [recording, setRecording] = useState(false);
  const recRef = useRef<{ rec: MediaRecorder; stream: MediaStream } | null>(null);
  const fareScreenshot = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream; video.muted = true;
      await video.play();
      await new Promise(r => setTimeout(r, 350));   // lascia sparire il picker
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      const blob: Blob | null = await new Promise(r => canvas.toBlob(r, "image/png"));
      if (blob) setFiles((p: File[]) => [...p, new File([blob], `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`, { type: "image/png" })]);
    } catch { /* annullato dal picker */ }
  };
  const toggleRegistrazione = async () => {
    if (recording && recRef.current) { recRef.current.rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const rec = new MediaRecorder(stream, MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? { mimeType: "video/webm;codecs=vp9" } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false); recRef.current = null;
        const blob = new Blob(chunks, { type: "video/webm" });
        if (blob.size) setFiles((p: File[]) => [...p, new File([blob], `registrazione-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`, { type: "video/webm" })]);
      };
      stream.getVideoTracks()[0].onended = () => { if (rec.state !== "inactive") rec.stop(); };
      rec.start(1000);
      recRef.current = { rec, stream };
      setRecording(true);
    } catch { /* annullato dal picker */ }
  };
  const onReact = async (msgId: string, emoji: string) => {
    setReactFor(null);
    try { await toggleReaction(msgId, meId!, meName, emoji); await reloadMessages(selId!); }
    catch (e) { alert((e as Error)?.message || "Reazione non riuscita"); }
  };
  // GIF (picker Giphy) — richiesta Francesco. La chiave sta SOLO lato server
  // (/api/gif/search); selezionando una GIF la invio come allegato.
  const [showGif, setShowGif] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifItems, setGifItems] = useState<{ id: string; preview: string; gif: string }[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifErr, setGifErr] = useState<string | null>(null);
  useEffect(() => {
    if (!showGif) return;
    setGifLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/gif/search?q=" + encodeURIComponent(gifQuery.trim())).then((x) => x.json());
        setGifItems(r.items || []); setGifErr(r.error || null);
      } catch { setGifErr("Errore nel caricamento GIF"); setGifItems([]); }
      finally { setGifLoading(false); }
    }, gifQuery ? 350 : 0);
    return () => clearTimeout(t);
  }, [showGif, gifQuery]);
  const inviaGif = async (gifUrl: string) => {
    if (!selId || !meId) return;
    setShowGif(false); setGifQuery("");
    try { await sendGif(selId, meId, gifUrl); await reloadMessages(selId); }
    catch (e) { alert((e as Error)?.message || "Invio GIF non riuscito"); }
  };
  // il tasto GIF compare solo se il server ha la chiave Giphy configurata
  const [gifEnabled, setGifEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/gif/search?check=1").then((r) => r.json()).then((r) => setGifEnabled(!!r.enabled)).catch(() => { });
  }, []);
  const isAdmin = !!user && (seesAllStores(user.role) || user.role === "dev");
  // "Devo poter vedere i membri di un gruppo. Visibilita' dal manager in su" (Luca):
  // store manager, direzioni di area e chi vede tutti i negozi.
  const canSeeMembers = !!user && (seesWholeStore(user.role) || seesAllStores(user.role));
  const [showMembers, setShowMembers] = useState(false);

  // Interruttore Chat interna <-> WhatsApp (stessa pagina, nessuna voce di menu).
  // La scelta resta memorizzata tra una visita e l'altra.
  // deep-link: /chat?wa=<numero> apre direttamente WhatsApp sul cliente;
  // /chat?mail=<indirizzo> apre la webmail già in composizione (Luca 28/07).
  const searchParams = useSearchParams();
  const waParam = searchParams.get("wa");
  const mailParam = searchParams.get("mail");
  const [mode, setMode] = useState<"chat" | "whatsapp" | "email">(() => {
    if (typeof window === "undefined") return "chat";
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("wa")) return "whatsapp";
    if (qs.get("mail")) return "email";
    return (localStorage.getItem("crm_chat_mode") as "chat" | "whatsapp" | "email") || "chat";
  });
  useEffect(() => { try { localStorage.setItem("crm_chat_mode", mode); } catch { } }, [mode]);

  const onDeleteConversation = async () => {
    if (!selId || !isAdmin) return;
    if (!window.confirm("Eliminare definitivamente questa conversazione per tutti? L'azione non è reversibile.")) return;
    try { await deleteConversation(selId); setSelId(null); await reloadInbox(); }
    catch (e) { alert("Eliminazione non riuscita: " + (e?.message || e)); }
  };
  const { isOnline } = usePresence();

  const [inbox, setInbox] = useState([]);
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [parts, setParts] = useState([]);
  const [text, setText] = useState("");
  // Segnalazione 74: messaggio a cui si sta rispondendo (stile WhatsApp).
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  // Immagine aperta a schermo (prima si apriva in una scheda nuova).
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [files, setFiles] = useState([]);
  const [refs, setRefs] = useState([]);          // record CRM taggati nel messaggio in corso
  const [showTag, setShowTag] = useState(false);
  const [mention, setMention] = useState(null);  // autocomplete "@": { start, query }
  const [mentionRows, setMentionRows] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);   // dragenter/leave scattano anche sui figli: conta la profondita'

  // #125/#126: sono l'AMMINISTRATORE (creatore) di QUESTO gruppo? Abilita la
  // gestione membri (aggiungi/espelli) e il tasto "chi ha letto", a prescindere
  // dal ruolo aziendale — "chi crea un gruppo" (Francesco).
  const iAmGroupAdmin = useMemo(() => !!meId && parts.some((p) => p.user_id === meId && p.is_admin), [parts, meId]);
  const [manageBusy, setManageBusy] = useState<string | null>(null); // user_id in aggiunta/rimozione
  const [addOpen, setAddOpen] = useState(false);                     // pannello "aggiungi membri" aperto
  const [addQ, setAddQ] = useState("");
  const [dir, setDir] = useState<DirUser[]>([]);                     // rubrica (per l'aggiunta)
  const [infoMsg, setInfoMsg] = useState<ChatMessage | null>(null);  // #126: messaggio del popup "chi ha letto"

  const reloadInbox = async () => { if (!meId) return; try { setInbox(await getInbox(meId)); } catch {} };
  useEffect(() => { reloadInbox(); }, [meId]);
  useEffect(() => { if (!meId) return; return subscribeInbox(reloadInbox); }, [meId]);

  // ── Badge NON LETTI per canale (chat interna / WhatsApp / mail) sui tab ────
  // Chat: somma dei non letti della mia inbox (già caricata). WhatsApp e mail:
  // non letti delle istanze/caselle mie o del mio negozio (come le rispettive
  // inbox). Realtime sugli INSERT + refresh periodico per il calo alla lettura.
  const { stores: myStores } = useVisibleStores();
  const chatUnread = useMemo(() => inbox.reduce((s: number, c: any) => s + (c.unread || 0), 0), [inbox]);
  const [waUnread, setWaUnread] = useState(0);
  const [mailUnread, setMailUnread] = useState(0);
  const loadChannelCounts = useCallback(async () => {
    if (!meId) return;
    try {
      const { data: insts } = await supabase.from("wa_instances").select("id, owner_user_id, negozio");
      const mine = (insts || []).filter((i: any) => i.owner_user_id === meId || (i.negozio && myStores.some((s) => sameStore(i.negozio, s)))).map((i: any) => i.id);
      if (mine.length) {
        const { data } = await supabase.from("wa_conversations").select("unread").in("instance_id", mine);
        setWaUnread((data || []).reduce((s: number, c: any) => s + (c.unread || 0), 0));
      } else setWaUnread(0);
    } catch { /* ignora */ }
    try {
      const { data: accs } = await supabase.from("email_accounts").select("id, owner_user_id, negozio");
      const mine = (accs || []).filter((a: any) => a.owner_user_id === meId || (a.negozio && myStores.some((s) => sameStore(a.negozio, s)))).map((a: any) => a.id);
      if (mine.length) {
        const { data } = await supabase.from("email_conversations").select("unread, trashed, spam, archived").in("account_id", mine);
        setMailUnread((data || []).filter((c: any) => !c.trashed && !c.spam && !c.archived).reduce((s: number, c: any) => s + (c.unread || 0), 0));
      } else setMailUnread(0);
    } catch { /* ignora */ }
  }, [meId, myStores]);
  useEffect(() => {
    if (!meId) return;
    loadChannelCounts();
    const ch = supabase.channel("chat_tab_counts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wa_messages" }, () => loadChannelCounts())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "email_messages" }, () => loadChannelCounts())
      .subscribe();
    const t = setInterval(loadChannelCounts, 15000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [meId, loadChannelCounts]);
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
  const loadParts = () => { if (selId) getParticipants(selId).then(setParts).catch(() => setParts([])); };
  useEffect(() => {
    setShowMembers(false); setAddOpen(false); setAddQ(""); setInfoMsg(null);
    if (!selId) { setMessages([]); setParts([]); return; }
    reloadMessages(selId);
    loadParts();
    const offMsg = subscribeMessages(selId, () => reloadMessages(selId));
    const offReact = subscribeReactions(selId, () => reloadMessages(selId));
    const offRcpt = subscribeReceipts(selId, loadParts);
    return () => { offMsg(); offReact(); offRcpt(); };
  }, [selId]);

  // #125: gestione membri del gruppo (solo l'amministratore del gruppo).
  const openAdd = async () => {
    setAddOpen(true); setAddQ("");
    if (meId) { try { setDir(await listDirectory(meId)); } catch {} }
  };
  const addMember = async (u: DirUser) => {
    if (!selId) return;
    setManageBusy(u.id);
    try { await addParticipants(selId, [u.id]); loadParts(); reloadInbox(); }
    catch (e: any) { alert("Aggiunta non riuscita: " + (e?.message || e)); }
    finally { setManageBusy(null); }
  };
  const removeMember = async (p: any) => {
    if (!selId) return;
    if (!window.confirm(`Rimuovere ${p.full_name} dal gruppo?`)) return;
    setManageBusy(p.user_id);
    try { await removeParticipant(selId, p.user_id); loadParts(); reloadInbox(); }
    catch (e: any) { alert("Rimozione non riuscita: " + (e?.message || e)); }
    finally { setManageBusy(null); }
  };

  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages]);

  const senderName = useMemo(() => {
    const m = {}; parts.forEach((p) => (m[p.user_id] = p.full_name)); return m;
  }, [parts]);

  const filteredInbox = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return inbox;
    return inbox.filter((c) => (c.title || c.other_name || "").toLowerCase().includes(s));
  }, [inbox, q]);

  // La FileList e' "live": e.target.value="" la svuota prima che React esegua
  // l'updater. Va copiata SUBITO in un array, altrimenti gli allegati spariscono.
  // ── autocomplete "@" ──────────────────────────────────────────────
  // Rileva "@parola" appena prima del cursore e propone i record del CRM.
  const onTextChange = (e) => {
    const v = e.target.value;
    setText(v);
    const caret = e.target.selectionStart ?? v.length;
    const m = /@([^\s@\[\]]{0,40})$/.exec(v.slice(0, caret));
    setMention(m ? { start: caret - m[0].length, query: m[1] } : null);
  };
  useEffect(() => {
    if (!mention) { setMentionRows([]); return; }
    const q = mention.query;
    const t = setTimeout(() => {
      // "@" da solo -> suggerimenti recenti; da 1 carattere in poi -> ricerca
      const p = q.length === 0 ? recentEntities() : searchAllEntities(q);
      p.then(setMentionRows).catch(() => setMentionRows([]));
    }, q.length === 0 ? 0 : 200);
    return () => clearTimeout(t);
  }, [mention?.query, mention !== null]);

  const pickMention = (r) => {
    if (!mention) return;
    const before = text.slice(0, mention.start);
    const after = text.slice(mention.start + 1 + mention.query.length);
    setText(`${before}${refToken(r)} ${after}`);
    setRefs((p) => (p.some((x) => x.type === r.type && x.id === r.id) ? p : [...p, r]));
    setMention(null); setMentionRows([]);
  };

  const addFiles = (list) => {
    const arr = Array.from(list || []);
    if (arr.length) setFiles((p) => [...p, ...arr]);
  };

  // ── drag & drop + incolla (qualsiasi tipo di file) ────────────────
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
  const onDragEnter = (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDragOver(true); };
  const onDragOver = (e) => { if (hasFiles(e)) e.preventDefault(); };
  const onDragLeave = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };
  const onDrop = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0; setDragOver(false);
    addFiles(e.dataTransfer?.files);
  };
  const onPaste = (e) => {
    const f = Array.from(e.clipboardData?.files || []);
    if (f.length) { e.preventDefault(); addFiles(e.clipboardData.files); }
  };
  const onSend = async () => {
    setShowEmoji(false);
    if (!selId || !meId || sending) return;
    if (!text.trim() && files.length === 0 && refs.length === 0) return;
    setSending(true);
    try {
      await sendMessage(selId, meId, text.trim(), files, refs, replyTo?.id ?? null);
      setText(""); setFiles([]); setRefs([]); setMention(null); setMentionRows([]); setReplyTo(null);
      await reloadMessages(selId);
    }
    catch (e) { console.error("chat send failed", e); alert("Invio non riuscito: " + (e?.message || e)); }
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
    <div className="-m-4 sm:-m-6 md:-m-8 h-[calc(100dvh-4rem)] flex flex-col overflow-hidden">
      {/* interruttore: Chat interna <-> WhatsApp (stessa pagina) */}
      <div className="h-12 shrink-0 flex items-center gap-1 px-3 border-b border-white/5 bg-[#0f111a]/70">
        <button onClick={() => setMode("chat")}
          className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
            mode === "chat" ? "bg-indigo-500/15 text-indigo-200" : "text-slate-400 hover:text-white hover:bg-white/5")}>
          <MessageSquare className="w-4 h-4" /> Chat interna
          {chatUnread > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">{chatUnread > 99 ? "99+" : chatUnread}</span>}
        </button>
        <button onClick={() => setMode("whatsapp")}
          className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
            mode === "whatsapp" ? "bg-emerald-500/15 text-emerald-200" : "text-slate-400 hover:text-white hover:bg-white/5")}>
          <MessageCircle className="w-4 h-4" /> WhatsApp
          {waUnread > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">{waUnread > 99 ? "99+" : waUnread}</span>}
        </button>
        <button onClick={() => setMode("email")}
          className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
            mode === "email" ? "bg-sky-500/15 text-sky-200" : "text-slate-400 hover:text-white hover:bg-white/5")}>
          <Mail className="w-4 h-4" /> Email
          {mailUnread > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center">{mailUnread > 99 ? "99+" : mailUnread}</span>}
        </button>
      </div>

      {mode === "whatsapp" ? (
        <div className="flex-1 min-h-0 overflow-hidden"><WhatsAppInbox embedded apriNumero={waParam} /></div>
      ) : mode === "email" ? (
        <div className="flex-1 min-h-0 overflow-hidden"><EmailInbox embedded componiA={mailParam} /></div>
      ) : (
      <div className="flex-1 min-h-0 flex overflow-hidden">
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
                className={`group/riga w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left transition-colors ${active ? "bg-indigo-500/15" : "hover:bg-white/5"}`}>
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
                    <span className="flex items-center gap-1 shrink-0">
                      {c.pinned_at && <Pin className="w-3 h-3 text-indigo-300" />}
                      <span role="button" tabIndex={0} title={c.pinned_at ? "Sgancia la chat" : "Fissa in alto (max 5)"}
                        onClick={(e) => onTogglePin(e, c)}
                        className="opacity-0 group-hover/riga:opacity-100 p-1 rounded-md text-slate-500 hover:text-indigo-300 hover:bg-white/10 transition-opacity">
                        {c.pinned_at ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                      </span>
                      {c.unread === 0 && (
                        <span role="button" tabIndex={0} title="Segna come da leggere"
                          onClick={(e) => onMarkUnread(e, c.conversation_id)}
                          className="opacity-0 group-hover/riga:opacity-100 p-1 rounded-md text-slate-500 hover:text-indigo-300 hover:bg-white/10 transition-opacity">
                          <EyeOff className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {c.unread > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">{c.unread}</span>}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── RIGHT: thread ───────────────────────────────────────── */}
      <section className="hidden sm:flex flex-1 flex-col bg-[#0b0d14] relative"
        onDragEnter={selConv ? onDragEnter : undefined}
        onDragOver={selConv ? onDragOver : undefined}
        onDragLeave={selConv ? onDragLeave : undefined}
        onDrop={selConv ? onDrop : undefined}>

        {dragOver && selConv && (
          <div className="absolute inset-3 z-30 rounded-2xl border-2 border-dashed border-indigo-400 bg-indigo-500/10 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none">
            <Paperclip className="w-10 h-10 text-indigo-300 mb-2" />
            <p className="text-indigo-100 font-semibold">Rilascia qui i file</p>
            <p className="text-indigo-200/70 text-xs mt-0.5">Qualsiasi tipo di file, fino a 50 MB</p>
          </div>
        )}

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
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{title}</p>
                <p className="text-xs text-slate-500 truncate flex items-center gap-1.5">
                  {selConv.type === "dm" && <span className={`w-2 h-2 rounded-full ${dmOnline ? "bg-green-500" : "bg-slate-600"}`} />}
                  {selConv.type === "group"
                    ? ((canSeeMembers || iAmGroupAdmin)
                      ? <button onClick={() => setShowMembers(true)} className="text-purple-300 hover:text-purple-200 hover:underline">
                        {selConv.member_count} membri
                      </button>
                      : `${selConv.member_count} membri`)
                    : (dmOnline ? "Online" : (lastSeen(otherPart?.last_seen_at) || roleLabel(selConv.other_role || "")))}
                </p>
              </div>
              {selConv.type === "group" && (canSeeMembers || iAmGroupAdmin) && (
                <button onClick={() => setShowMembers(true)} title="Membri del gruppo"
                  className="p-2 rounded-lg text-slate-500 hover:text-purple-300 hover:bg-purple-500/10 transition-colors shrink-0">
                  <Users className="w-4.5 h-4.5" />
                </button>
              )}
              {isAdmin && (
                <button onClick={onDeleteConversation} title="Elimina conversazione (admin)"
                  className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0">
                  <Trash2 className="w-4.5 h-4.5" />
                </button>
              )}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {messages.map((m) => {
                const mine = m.sender_id === meId;
                // Segnalazione 74: messaggio citato (se e' stato eliminato resta il segnaposto)
                const quoted = m.reply_to ? messages.find((x) => x.id === m.reply_to) : null;
                const showDay = (() => { const d = dayLabel(m.created_at); if (d !== lastDay) { lastDay = d; return d; } return null; })();
                const btnRispondi = (
                  <button type="button" title="Rispondi" onClick={() => setReplyTo(m)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-opacity">
                    <Reply className="w-4 h-4" />
                  </button>
                );
                const btnInoltra = (
                  <button type="button" title="Inoltra" onClick={() => { setForwardMsg(m); setForwardCerca(""); }}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-opacity">
                    <Forward className="w-4 h-4" />
                  </button>
                );
                // REAZIONI stile Telegram (mig. 130): faccina al passaggio, menu rapido
                const btnReagisci = (
                  <span className="relative shrink-0">
                    <button type="button" title="Reagisci"
                      onClick={() => setReactFor(reactFor === m.id ? null : m.id)}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-white/10 transition-opacity">
                      <SmilePlus className="w-4 h-4" />
                    </button>
                    {reactFor === m.id && (
                      <div className={`absolute bottom-full mb-1 z-30 flex gap-0.5 px-1.5 py-1 rounded-full bg-[#171622] border border-white/15 shadow-2xl ${mine ? "right-0" : "left-0"}`}>
                        {QUICK_REACTIONS.map((e) => (
                          <button key={e} type="button" onClick={() => onReact(m.id, e)}
                            className="text-lg leading-none p-1 rounded-full hover:bg-white/10 hover:scale-125 transition-transform">{e}</button>
                        ))}
                      </div>
                    )}
                  </span>
                );
                // #126: solo l'amministratore del gruppo vede il tasto "i" (chi ha letto e quando)
                const btnInfo = (selConv.type === "group" && iAmGroupAdmin) ? (
                  <button type="button" title="Chi ha letto" onClick={() => setInfoMsg(m)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-white/10 transition-opacity">
                    <Info className="w-4 h-4" />
                  </button>
                ) : null;
                return (
                  <div key={m.id} id={`msg-${m.id}`}>
                    {showDay && <div className="text-center my-3"><span className="text-[11px] text-slate-500 bg-white/5 px-3 py-1 rounded-full">{showDay}</span></div>}
                    <div className={`group flex items-center gap-1 ${mine ? "justify-end" : "justify-start"}`}>
                      {mine && <>{btnInfo}{btnInoltra}{btnReagisci}{btnRispondi}</>}
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${mine ? "bg-indigo-600 text-white rounded-br-sm" : "bg-white/5 text-slate-100 rounded-bl-sm border border-white/5"}`}>
                        {!mine && selConv.type === "group" && (
                          <p className="text-[11px] font-semibold text-indigo-300 mb-0.5">{senderName[m.sender_id] || "—"}</p>
                        )}
                        {quoted && (
                          <button type="button" title="Vai al messaggio"
                            onClick={() => document.getElementById(`msg-${quoted.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                            className={`w-full text-left mb-1.5 px-2 py-1 rounded-lg border-l-2 ${mine ? "bg-black/20 border-indigo-200/70" : "bg-black/25 border-indigo-400"}`}>
                            <span className={`block text-[10px] font-semibold ${mine ? "text-indigo-100" : "text-indigo-300"}`}>
                              {quoted.sender_id === meId ? "Tu" : (senderName[quoted.sender_id] || "—")}
                            </span>
                            <span className="block text-[11px] opacity-80 truncate">{previewBody(quoted)}</span>
                          </button>
                        )}
                        {m.reply_to && !quoted && (
                          <div className="mb-1.5 px-2 py-1 rounded-lg bg-black/20 text-[11px] italic opacity-70">Messaggio non più disponibile</div>
                        )}
                        {(m.attachments || []).map((a) => (
                          <div key={a.id} className="mb-1">
                            {isImg(a.mime)
                              ? <button type="button" onClick={() => setLightbox({ src: a.url, alt: a.name || "" })} title="Apri l'immagine">
                                  <img src={a.url} alt={a.name || ""} className="max-w-[220px] max-h-[220px] rounded-lg object-cover cursor-zoom-in" />
                                </button>
                              : (a.mime || "").startsWith("video/")
                              ? <video src={a.url} controls preload="metadata" className="max-w-[260px] rounded-lg" />
                              : <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 text-xs"><FileText className="w-4 h-4 shrink-0" /><span className="truncate max-w-[180px]">{a.name || "file"}</span></a>}
                          </div>
                        ))}
                        {m.body && (
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {splitBody(m.body).map((part, i) => {
                              if (part.text !== undefined) return <span key={i}>{part.text}</span>;
                              const r = part.ref;
                              const ui = REF_UI[r.type] || REF_UI.cliente;
                              const RIcon = ui.Icon;
                              return (
                                <Link key={i} href={refHref(r)} title={`Apri ${r.type}`}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md border align-baseline text-[12px] transition-colors ${ui.cls}`}>
                                  <RIcon className="w-3 h-3 shrink-0" />
                                  {r.label.split(" · ")[0]}
                                </Link>
                              );
                            })}
                          </p>
                        )}
                        {/* solo i tag NON gia' presenti inline nel testo (evita doppioni) */}
                        {(m.refs || []).filter((r) => !(m.body || "").includes(`@[${r.type}:${r.id}|`)).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {(m.refs || []).filter((r) => !(m.body || "").includes(`@[${r.type}:${r.id}|`)).map((r, i) => {
                              const ui = REF_UI[r.type] || REF_UI.cliente;
                              const RIcon = ui.Icon;
                              return (
                                <Link key={i} href={refHref(r)} title={`Apri ${r.type}`}
                                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] transition-colors ${ui.cls}`}>
                                  <RIcon className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate max-w-[190px]">{r.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                        {(m.reactions || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {Object.entries((m.reactions || []).reduce((acc: Record<string, { n: number; mia: boolean; chi: string[] }>, r) => {
                              const g = acc[r.emoji] || { n: 0, mia: false, chi: [] };
                              g.n += 1; if (r.user_id === meId) g.mia = true; g.chi.push(r.user_name || "—");
                              acc[r.emoji] = g; return acc;
                            }, {})).map(([emoji, g]) => (
                              <button key={emoji} type="button" onClick={() => onReact(m.id, emoji)} title={g.chi.join(", ")}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[12px] border transition-colors ${g.mia
                                  ? (mine ? "bg-white/25 border-white/50" : "bg-indigo-500/25 border-indigo-400/60")
                                  : (mine ? "bg-black/20 border-white/20 hover:bg-black/30" : "bg-white/5 border-white/10 hover:bg-white/10")}`}>
                                <span className="leading-none">{emoji}</span>
                                <span className={`leading-none font-semibold ${mine ? "text-indigo-100" : "text-slate-300"}`}>{g.n}</span>
                              </button>
                            ))}
                          </div>
                        )}
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
                      {!mine && <>{btnRispondi}{btnReagisci}{btnInoltra}{btnInfo}</>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* composer */}
            <div className="relative border-t border-white/5 px-4 py-3 shrink-0">
              {/* Segnalazione 74: anteprima del messaggio a cui si risponde */}
              {replyTo && (
                <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-white/5 border-l-2 border-indigo-400">
                  <Reply className="w-4 h-4 text-indigo-300 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-indigo-300">
                      Rispondi a {replyTo.sender_id === meId ? "te stesso" : (senderName[replyTo.sender_id] || "—")}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{previewBody(replyTo)}</p>
                  </div>
                  <button type="button" onClick={() => setReplyTo(null)} title="Annulla risposta"
                    className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {mention && mentionRows.length > 0 && (
                <div className="absolute bottom-full left-4 right-4 mb-2 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#161a26] shadow-2xl z-20">
                  <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                    {mention.query
                      ? "Risultati — Invio per il primo"
                      : "Recenti — continua a scrivere per cercare"}
                  </p>
                  {mentionRows.map((r) => {
                    const ui = REF_UI[r.type] || REF_UI.cliente;
                    const RIcon = ui.Icon;
                    return (
                      <button type="button" key={`${r.type}-${r.id}`}
                        onMouseDown={(e) => { e.preventDefault(); pickMention(r); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5">
                        <span className={`w-7 h-7 shrink-0 rounded-lg border flex items-center justify-center ${ui.cls}`}>
                          <RIcon className="w-3.5 h-3.5" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-white truncate">{r.label}</span>
                          <span className="block text-[10px] text-slate-500">{r.type}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
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
              {refs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {refs.map((r, i) => {
                    const ui = REF_UI[r.type] || REF_UI.cliente;
                    const RIcon = ui.Icon;
                    return (
                      <span key={i} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] ${ui.cls}`}>
                        <RIcon className="w-3.5 h-3.5" />
                        <span className="truncate max-w-[160px]">{r.label}</span>
                        <button onClick={() => setRefs((p) => p.filter((_, j) => j !== i))} className="opacity-70 hover:opacity-100">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="flex items-end gap-2">
                <button onClick={() => fileRef.current?.click()} className="p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5" title="Allega">
                  <Paperclip className="w-5 h-5" />
                </button>
                <button onClick={() => setShowTag(true)} className="p-2.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-white/5" title="Tagga cliente, contratto o appuntamento">
                  <Tag className="w-5 h-5" />
                </button>
                <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                <button type="button" title="Screenshot dello schermo (si allega al messaggio)" onClick={fareScreenshot}
                  className="p-2 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-white/10 transition-colors shrink-0">
                  <Camera className="w-5 h-5" />
                </button>
                <button type="button" onClick={toggleRegistrazione}
                  title={recording ? "Ferma la registrazione (si allega al messaggio)" : "Registra lo schermo (clicca di nuovo per fermare)"}
                  className={`p-2 rounded-lg transition-colors shrink-0 ${recording ? "text-red-400 bg-red-500/15 animate-pulse" : "text-slate-400 hover:text-red-400 hover:bg-white/10"}`}>
                  <Disc className="w-5 h-5" />
                </button>
                <span className="relative shrink-0">
                  <button type="button" title="Emoji" onClick={() => { setShowEmoji(v => !v); setShowGif(false); }}
                    className={`p-2 rounded-lg transition-colors ${showEmoji ? "text-amber-300 bg-white/10" : "text-slate-400 hover:text-amber-300 hover:bg-white/10"}`}>
                    <Smile className="w-5 h-5" />
                  </button>
                  {showEmoji && (
                    <div className="absolute bottom-full mb-2 left-0 z-40 w-72 max-h-56 overflow-y-auto p-2 rounded-2xl bg-[#171622] border border-white/15 shadow-2xl">
                      <div className="grid grid-cols-8 gap-0.5">
                        {EMOJI_SET.map((e) => (
                          <button key={e} type="button" onClick={() => setText((t) => t + e)}
                            className="text-xl leading-none p-1.5 rounded-lg hover:bg-white/10">{e}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </span>
                {/* GIF picker (Giphy) — richiesta Francesco. Solo se la chiave è configurata */}
                {gifEnabled && <span className="relative shrink-0">
                  <button type="button" title="GIF" onClick={() => { setShowGif(v => !v); setShowEmoji(false); }}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-black tracking-wide transition-colors ${showGif ? "text-fuchsia-300 bg-white/10" : "text-slate-400 hover:text-fuchsia-300 hover:bg-white/10"}`}>
                    GIF
                  </button>
                  {showGif && (
                    <div className="absolute bottom-full mb-2 left-0 z-40 w-80 rounded-2xl bg-[#171622] border border-white/15 shadow-2xl p-2">
                      <input autoFocus value={gifQuery} onChange={(e) => setGifQuery(e.target.value)} placeholder="Cerca una GIF…"
                        className="glass-input w-full h-9 text-sm mb-2" />
                      <div className="max-h-64 overflow-y-auto">
                        {gifErr ? <p className="text-xs text-slate-500 p-4 text-center">{gifErr}</p>
                          : gifLoading && gifItems.length === 0 ? <p className="text-xs text-slate-500 p-4 text-center">Carico…</p>
                            : gifItems.length === 0 ? <p className="text-xs text-slate-500 p-4 text-center">Nessuna GIF.</p>
                              : <div className="grid grid-cols-2 gap-1.5">
                                {gifItems.map((g) => (
                                  <button key={g.id} type="button" onClick={() => inviaGif(g.gif)}
                                    className="rounded-lg overflow-hidden hover:ring-2 hover:ring-fuchsia-400/60 bg-black/30">
                                    <img src={g.preview || g.gif} alt="gif" loading="lazy" className="w-full h-24 object-cover" />
                                  </button>
                                ))}
                              </div>}
                      </div>
                      <p className="text-[9px] text-slate-600 text-right mt-1 pr-1">via GIPHY</p>
                    </div>
                  )}
                </span>}
                <textarea value={text} onChange={onTextChange} onPaste={onPaste}
                  onKeyDown={(e) => {
                    if (mention && mentionRows.length > 0) {
                      if (e.key === "Enter") { e.preventDefault(); pickMention(mentionRows[0]); return; }
                      if (e.key === "Escape") { e.preventDefault(); setMention(null); setMentionRows([]); return; }
                    }
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
                  }}
                  rows={1} placeholder="Scrivi un messaggio…  (@ per taggare cliente, contratto o appuntamento)"
                  className="glass-input flex-1 resize-none max-h-32 py-2.5" />
                <button onClick={onSend} disabled={sending || (!text.trim() && files.length === 0 && refs.length === 0)}
                  className="p-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      </div>
      )}

      {forwardMsg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setForwardMsg(null)}>
          <div className="glass-card w-full max-w-md max-h-[75vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 p-4 border-b border-white/10 bg-white/5">
              <h3 className="text-base font-bold text-white flex items-center gap-2"><Forward className="w-4 h-4 text-indigo-300" /> Inoltra a…</h3>
              <button onClick={() => setForwardMsg(null)} className="text-slate-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-3 border-b border-white/5">
              <input autoFocus value={forwardCerca} onChange={(e) => setForwardCerca(e.target.value)} placeholder="Cerca persona o gruppo…" className="glass-input w-full text-sm" />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {inbox.filter((c: any) => (c.type === "group" ? (c.title || "") : (c.other_name || "")).toLowerCase().includes(forwardCerca.trim().toLowerCase())).map((c: any) => (
                <button key={"c" + c.conversation_id} disabled={forwardBusy} onClick={() => inoltraA(c.conversation_id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-indigo-500/15 disabled:opacity-50">
                  {c.type === "group" ? <Users className="w-4 h-4 text-purple-300 shrink-0" /> : <User className="w-4 h-4 text-indigo-300 shrink-0" />}
                  <span className="text-sm text-slate-100 truncate">{c.type === "group" ? (c.title || "Gruppo") : (c.other_name || "—")}</span>
                </button>
              ))}
              {dir.filter((u) => !inbox.some((c: any) => c.type === "dm" && c.other_id === u.id) && (u.full_name || "").toLowerCase().includes(forwardCerca.trim().toLowerCase())).map((u) => (
                <button key={"u" + u.id} disabled={forwardBusy} onClick={() => inoltraAUtente(u.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-indigo-500/15 disabled:opacity-50">
                  <UserPlus className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-300 truncate">{u.full_name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showTag && (
        <TagPicker onClose={() => setShowTag(false)}
          onPick={(r) => {
            setRefs((p) => (p.some((x) => x.type === r.type && x.id === r.id) ? p : [...p, r]));
            setShowTag(false);
          }} />
      )}

      {showMembers && selConv?.type === "group" && (canSeeMembers || iAmGroupAdmin) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowMembers(false)}>
          <div className="glass-card w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 p-4 border-b border-white/10 bg-white/5">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white truncate">Membri del gruppo</h3>
                <p className="text-xs text-slate-400 truncate">{title} · {parts.length} {parts.length === 1 ? "membro" : "membri"}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* #125: solo l'amministratore del gruppo può aggiungere/espellere membri */}
                {iAmGroupAdmin && (
                  <button onClick={() => (addOpen ? setAddOpen(false) : openAdd())}
                    className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                      addOpen ? "bg-white/10 text-slate-300 border-white/10" : "bg-purple-500/15 text-purple-200 border-purple-500/30 hover:bg-purple-500/25")}>
                    <UserPlus className="w-4 h-4" /> {addOpen ? "Chiudi" : "Aggiungi"}
                  </button>
                )}
                <button onClick={() => setShowMembers(false)} className="p-1 hover:bg-white/10 rounded-lg text-slate-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* #125: pannello di ricerca/aggiunta (solo admin del gruppo) */}
            {iAmGroupAdmin && addOpen && (
              <div className="border-b border-white/10 bg-black/20 p-3 shrink-0">
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input value={addQ} onChange={(e) => setAddQ(e.target.value)} placeholder="Cerca persona da aggiungere…" className="glass-input w-full pl-9 h-9 text-sm" autoFocus />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {(() => {
                    const memberIds = new Set(parts.map((p) => p.user_id));
                    const s = addQ.trim().toLowerCase();
                    const cand = dir.filter((u) => !memberIds.has(u.id)).filter((u) => !s || (u.full_name || "").toLowerCase().includes(s));
                    if (cand.length === 0) return <p className="text-xs text-slate-500 py-4 text-center">Nessuna persona da aggiungere.</p>;
                    return cand.slice(0, 50).map((u) => (
                      <button key={u.id} disabled={manageBusy === u.id} onClick={() => addMember(u)}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-white/5 disabled:opacity-50">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border bg-indigo-500/20 text-indigo-200 border-indigo-500/30 shrink-0">
                          {initials(u.full_name)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-white truncate">{u.full_name}</span>
                          <span className="block text-[10px] text-slate-500 truncate">{roleLabel(u.role) || "—"}{u.primary_store ? ` · ${u.primary_store}` : ""}</span>
                        </span>
                        <UserPlus className="w-4 h-4 text-purple-300 shrink-0" />
                      </button>
                    ));
                  })()}
                </div>
              </div>
            )}

            <div className="overflow-y-auto p-2">
              {parts.length === 0 && <p className="text-sm text-slate-500 p-4 text-center">Nessun membro trovato.</p>}
              {[...parts]
                .sort((a, b) => (b.is_admin ? 1 : 0) - (a.is_admin ? 1 : 0) || (a.full_name || "").localeCompare(b.full_name || ""))
                .map((m) => {
                  const online = isOnline(m.user_id);
                  return (
                    <div key={m.user_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors">
                      <span className="relative shrink-0">
                        <span className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border bg-indigo-500/20 text-indigo-200 border-indigo-500/30">
                          {initials(m.full_name)}
                        </span>
                        {online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[#0b0d14]" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate flex items-center gap-2">
                          {m.full_name}
                          {m.user_id === meId && <span className="text-[10px] text-slate-500 font-normal">(tu)</span>}
                          {m.is_admin && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-200 border border-purple-500/30">
                              Amministratore
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {roleLabel(m.role) || "—"}{m.primary_store ? ` · ${m.primary_store}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-slate-500">
                          {online ? <span className="text-green-400">Online</span> : (lastSeen(m.last_seen_at) || "")}
                        </span>
                        {/* #125: espelli (solo admin, non su sé stesso) */}
                        {iAmGroupAdmin && m.user_id !== meId && (
                          <button onClick={() => removeMember(m)} disabled={manageBusy === m.user_id} title="Rimuovi dal gruppo"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50">
                            <UserMinus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* #126: popup "chi ha letto il messaggio e quando" — solo l'admin del gruppo */}
      {infoMsg && selConv?.type === "group" && iAmGroupAdmin && (() => {
        const T = new Date(infoMsg.created_at).getTime();
        const recips = parts.filter((p) => p.user_id !== infoMsg.sender_id);
        const read = recips.filter((p) => p.last_read_at && new Date(p.last_read_at).getTime() >= T);
        const unread = recips.filter((p) => !(p.last_read_at && new Date(p.last_read_at).getTime() >= T));
        const readAtLabel = (s: string | null) => (s ? `${dayLabel(s)} · ${fmtTime(s)}` : "");
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setInfoMsg(null)}>
            <div className="glass-card w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-2 p-4 border-b border-white/10 bg-white/5">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white flex items-center gap-2"><Info className="w-4 h-4 text-sky-300" /> Info messaggio</h3>
                  <p className="text-xs text-slate-400 truncate mt-0.5">“{previewBody(infoMsg)}” · {fmtTime(infoMsg.created_at)}</p>
                </div>
                <button onClick={() => setInfoMsg(null)} className="p-1 hover:bg-white/10 rounded-lg text-slate-400 transition-colors shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto p-3 space-y-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300/80 flex items-center gap-1.5 mb-1.5">
                    <CheckCheck className="w-3.5 h-3.5" /> Letto da · {read.length}
                  </p>
                  {read.length === 0 ? <p className="text-xs text-slate-500 px-1 py-1">Nessuno ha ancora letto.</p> :
                    [...read].sort((a, b) => new Date(b.last_read_at!).getTime() - new Date(a.last_read_at!).getTime()).map((p) => (
                      <div key={p.user_id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border bg-indigo-500/20 text-indigo-200 border-indigo-500/30 shrink-0">{initials(p.full_name)}</span>
                        <span className="flex-1 min-w-0 text-sm text-white truncate">{p.full_name}</span>
                        <span className="text-[11px] text-sky-300/90 shrink-0">{readAtLabel(p.last_read_at)}</span>
                      </div>
                    ))}
                </div>
                {unread.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-1.5">
                      <Check className="w-3.5 h-3.5" /> Non ancora letto · {unread.length}
                    </p>
                    {unread.map((p) => {
                      const delivered = p.last_delivered_at && new Date(p.last_delivered_at).getTime() >= T;
                      return (
                        <div key={p.user_id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5">
                          <span className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border bg-white/5 text-slate-300 border-white/10 shrink-0">{initials(p.full_name)}</span>
                          <span className="flex-1 min-w-0 text-sm text-slate-300 truncate">{p.full_name}</span>
                          <span className="text-[11px] text-slate-500 shrink-0">{delivered ? "Consegnato" : "In attesa"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {showNew && meId && (
        <NewChatModal meId={meId} onClose={() => setShowNew(false)}
          onCreated={(cid) => { setShowNew(false); reloadInbox(); setSelId(cid); }}
          onBroadcastDone={() => { setShowNew(false); reloadInbox(); }} />
      )}

      {lightbox && (
        <ImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

/* useSearchParams richiede Suspense in fase di build (lezione 502). */
export default function ChatPage() {
    return (
        <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" /></div>}>
            <ChatPageInner />
        </Suspense>
    );
}
