// @ts-nocheck
"use client";


import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useVisibleStores, sameStore, matchNegozi } from "@/lib/visibleStores";
import { waIstanzeBadge } from "@/lib/waVisibilita";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useQrUpload, QrUploadModal } from "@/lib/useQrUpload";
import Link from "next/link";
import {
  getInbox, listMessages, getParticipants, sendMessage, sendGif, markRead,
  subscribeMessages, subscribeInbox, subscribeReceipts, subscribeReactions, toggleReaction, markUnread, forwardMessage, getOrCreateDM, togglePin, editMessage, FINESTRA_MODIFICA_MS, refHref,
  splitBody, refToken, searchAllEntities, recentEntities, deleteConversation,
  listDirectory, addParticipants, removeParticipant, searchMyMessages,
} from "@/lib/chat";
import type { ChatMessage, ChatSearchHit, DirUser } from "@/lib/chat";
import { leggiAllegatiBozza, salvaAllegatiBozza, cancellaAllegatiBozza, pulisciBozzeAllegatiVecchie } from "@/lib/chatAllegatiBozza";
import { roleLabel, seesAllStores, seesWholeStore } from "@/lib/roles";
import { usePresence } from "@/context/PresenceContext";
import { NewChatModal } from "./_components/NewChatModal";
import { ScreenshotEditor } from "./_components/ScreenshotEditor";
import { TagPicker } from "./_components/TagPicker";
import { ImageLightbox } from "@/components/ImageLightbox";
import { Plus, Search, Send, Paperclip, X, Users, FileText, MessageSquare, Check, CheckCheck, Tag, User, CalendarDays, Trash2, Reply, MessageCircle, Mail, Info, UserPlus, UserMinus, SmilePlus, Smile, EyeOff, Forward, Camera, Disc, Pin, PinOff, Pencil, ChevronLeft, CheckSquare, Sparkles } from "lucide-react";
import { WhatsAppInbox } from "@/components/WhatsAppInbox";
import { EmailInbox } from "@/components/EmailInbox";
import { OmniChat } from "./_omni/OmniChat";
import { AvatarUtente } from "@/components/AvatarUtente";
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

// CHT-03: snippet del messaggio che matcha la ricerca globale, con la parola
// trovata separata per poterla evidenziare (i tag @[tipo:id|etichetta]
// diventano la loro etichetta, come nelle anteprime).
function snippetMatch(body: string, q: string): { prima: string; match: string; dopo: string } {
  const piatto = splitBody(body || "")
    .map((p: any) => (p.text !== undefined ? p.text : (p.ref?.label || "").split(" · ")[0]))
    .join("").replace(/\s+/g, " ").trim();
  const i = piatto.toLowerCase().indexOf(q.toLowerCase());
  // match dentro un token (es. CF nell'etichetta piena) ma non nel testo piatto:
  // si mostra comunque l'inizio del messaggio, senza evidenziatura
  if (i < 0) return { prima: piatto.slice(0, 90), match: "", dopo: "" };
  const start = Math.max(0, i - 32);
  return {
    prima: (start > 0 ? "…" : "") + piatto.slice(start, i),
    match: piatto.slice(i, i + q.length),
    dopo: piatto.slice(i + q.length, i + q.length + 70),
  };
}

// icona + colore per tipo di tag
const REF_UI = {
  cliente: { Icon: User, cls: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30 hover:bg-emerald-500/25" },
  contratto: { Icon: FileText, cls: "bg-sky-500/15 text-sky-200 border-sky-500/30 hover:bg-sky-500/25" },
  appuntamento: { Icon: CalendarDays, cls: "bg-amber-500/15 text-amber-200 border-amber-500/30 hover:bg-amber-500/25" },
};

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
  // EMOJI RECENTI (Luca 04/08, stile WhatsApp): per dispositivo, max 16
  const [recentiEmoji, setRecentiEmoji] = useState<string[]>([]);
  useEffect(() => { try { setRecentiEmoji(JSON.parse(localStorage.getItem("tf_emoji_recenti") || "[]")); } catch { /* localStorage negato */ } }, []);
  const registraEmojiRecente = (e: string) => setRecentiEmoji((p) => {
    const n = [e, ...p.filter((x) => x !== e)].slice(0, 16);
    try { localStorage.setItem("tf_emoji_recenti", JSON.stringify(n)); } catch { /* pieno/negato */ }
    return n;
  });
  const [reactFor, setReactFor] = useState<string | null>(null);   // msg col menu reazioni aperto
  const [reactPickerFor, setReactPickerFor] = useState<string | null>(null);   // msg col picker COMPLETO aperto
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
  // MODIFICA entro 3' (Luca 02/08): il composer passa in modalita' modifica
  const [editMsg, setEditMsg] = useState<ChatMessage | null>(null);
  const avviaModifica = (m: ChatMessage) => { setEditMsg(m); setReplyTo(null); setText(m.body || ""); };
  const annullaModifica = () => { setEditMsg(null); setText(""); };
  const salvaModifica = async () => {
    if (!editMsg || !text.trim()) return;
    try {
      await editMessage(editMsg.id, meId!, text.trim(), editMsg.created_at);
      setEditMsg(null); setText("");
      await reloadMessages(selId!);
    } catch (e) { alert((e as Error)?.message || "Modifica non riuscita"); }
  };
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  // INOLTRO MULTIPLO stile WhatsApp (Luca 24/08): selezioni N messaggi e li
  // inoltri in un colpo solo, in ordine cronologico
  const [multiSel, setMultiSel] = useState<Set<string>>(new Set());
  const [forwardList, setForwardList] = useState<ChatMessage[] | null>(null);
  const toggleSel = (m: ChatMessage) => setMultiSel((prev) => {
    const n = new Set(prev);
    if (n.has(m.id)) n.delete(m.id); else n.add(m.id);
    return n;
  });
  const [forwardCerca, setForwardCerca] = useState("");
  const [forwardBusy, setForwardBusy] = useState(false);
  // la rubrica si caricava SOLO aprendo «aggiungi membri»: senza, il modale
  // di inoltro mostrava solo le chat esistenti e sembrava impossibile
  // inoltrare a chi non hai mai scritto (segnalazione team 24/08)
  useEffect(() => {
    if (!(forwardMsg || forwardList) || !meId || dir.length) return;
    let vivo = true;
    listDirectory(meId).then((d) => { if (vivo) setDir(d); }).catch(() => { /* rubrica non caricata: restano le chat */ });
    return () => { vivo = false; };
  }, [forwardMsg, forwardList, meId]); // eslint-disable-line react-hooks/exhaustive-deps
  const inoltraA = async (targetConvId: string) => {
    const daInoltrare = forwardList ?? (forwardMsg ? [forwardMsg] : []);
    if (!daInoltrare.length || forwardBusy) return;
    setForwardBusy(true);
    try {
      // ordine cronologico: arrivano nella chat di destinazione come li leggi
      const ordinati = [...daInoltrare].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      for (const m of ordinati) await forwardMessage(m, meId!, targetConvId);
      setForwardMsg(null); setForwardList(null); setMultiSel(new Set()); setForwardCerca("");
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
  // getDisplayMedia NON esiste su iOS Safari / Android Chrome: senza questo
  // check i bottoni screenshot/registra fallivano in silenzio su telefono.
  // In state (non a render) per evitare mismatch di idratazione SSR.
  const [canCapture, setCanCapture] = useState(false);
  useEffect(() => { setCanCapture(typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function"); }, []);
  // agganci al registratore di MODULO (vedi in fondo al file): montandomi
  // riprendo lo stato vivo e ritiro l'eventuale registrazione finita altrove
  useEffect(() => {
    _regConsegna = (f: File) => {
      // la registrazione APPARTIENE alla chat da cui e' partita (Luca 03/08):
      // alla consegna si torna li' e il file si allega in quel composer
      if (_regConv) setSelId(_regConv);
      setFiles((p: File[]) => [...p, f]); setRecording(false); _regConv = null;
    };
    // rientrando in chat con una registrazione viva o pronta, si RIAPRE la
    // conversazione d'origine (prima si finiva sulla lista generale)
    if ((_regViva || _regPronta) && _regConv) setSelId(_regConv);
    if (_regViva) setRecording(true);
    if (_regPronta) { const f = _regPronta; _regPronta = null; setFiles((p: File[]) => [...p, f]); _regConv = null; }
    return () => { _regConsegna = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // due modalita' (Luca 02/08): finestra intera O selezione manuale di
  // un'area col tratteggio; in entrambi i casi si passa dall'EDITOR
  // (matita/cerchio/rettangolo/freccia stile WhatsApp) prima di allegare
  const [shotMenu, setShotMenu] = useState(false);
  // CHT-04 (segnalazione 06/08): terzo bottone del popover — QR per caricare
  // foto DAL TELEFONO direttamente negli allegati del messaggio (stesso
  // flusso di Registra Vendita/Disdette: useQrUpload + QrUploadModal)
  const qrChat = useQrUpload((ricevuti) => setFiles((p: File[]) => [...p, ...ricevuti]));
  const [shotEdit, setShotEdit] = useState<{ src: string; ritaglio: boolean } | null>(null);
  const fareScreenshot = async (area: boolean) => {
    setShotMenu(false);
    try {
      // Due funzioni DIVERSE (Luca 02/08): l'area parte gia' sulla scheda del
      // CRM (preferCurrentTab: un click e trascini); la 🖥️ apre il picker
      // sulla scelta della FINESTRA da fotografare, come prima.
      const opzioni = (area
        ? { video: true, preferCurrentTab: true, selfBrowserSurface: "include" }
        : { video: { displaySurface: "window" } }) as DisplayMediaStreamOptions;
      const stream = await navigator.mediaDevices.getDisplayMedia(opzioni);
      const video = document.createElement("video");
      video.srcObject = stream; video.muted = true;
      await video.play();
      await new Promise(r => setTimeout(r, 350));   // lascia sparire il picker
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      setShotEdit({ src: canvas.toDataURL("image/png"), ritaglio: area });
    } catch { /* annullato dal picker */ }
  };
  const toggleRegistrazione = async () => {
    if (_regViva) { _regViva.rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const rec = new MediaRecorder(stream, MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? { mimeType: "video/webm;codecs=vp9" } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        _regViva = null;
        const blob = new Blob(chunks, { type: "video/webm" });
        const file = blob.size ? new File([blob], `registrazione-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`, { type: "video/webm" }) : null;
        if (!file) return;
        // se la chat e' aperta si allega subito; altrimenti il file ASPETTA
        // il prossimo ingresso in chat (niente piu' registrazioni perse)
        if (_regConsegna) _regConsegna(file); else _regPronta = file;
      };
      stream.getVideoTracks()[0].onended = () => { if (rec.state !== "inactive") rec.stop(); };
      rec.start(1000);
      _regViva = { rec, stream, chunks };
      _regConv = selId || null;   // chat d'origine: al ritorno si riapre lei
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
  // /chat?conv=<id> (25/08): apre LA conversazione esatta (dalla scheda cliente)
  const convParam = searchParams.get("conv");
  // CAL-01: /chat?wa=<numero>&testo=<messaggio> precompila il composer WhatsApp
  // (il testo arriva dal modello scelto nella sezione caller)
  const testoParam = searchParams.get("testo");
  const mailParam = searchParams.get("mail");
  // /chat?mconv=<id> (26/08, widget Email del team): apre LA conversazione email
  const mconvParam = searchParams.get("mconv");
  const _modeDaUrl = useRef(false);
  const [mode, setMode] = useState<"chat" | "whatsapp" | "email" | "omni">(() => {
    if (typeof window === "undefined") return "chat";
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("wa") || qs.get("conv") || qs.get("mode") === "wa") { _modeDaUrl.current = true; return "whatsapp"; }
    if (qs.get("mail") || qs.get("mconv")) { _modeDaUrl.current = true; return "email"; }
    return (localStorage.getItem("crm_chat_mode") as "chat" | "whatsapp" | "email" | "omni") || "chat";
  });
  // un arrivo da deep-link non deve diventare la preferenza salvata: la
  // scheda scelta a mano sì (rilievo del revisore 25/08)
  useEffect(() => {
    if (_modeDaUrl.current) { _modeDaUrl.current = false; return; }
    try { localStorage.setItem("crm_chat_mode", mode); } catch { }
  }, [mode]);
  // Il TAB segue i parametri REATTIVI, non solo l'initializer (bug del
  // widget, video Luca 26/08: col router.push l'initializer di mode gira
  // mentre window.location è ANCORA la pagina di partenza → vinceva la
  // preferenza salvata e /chat?conv=… atterrava sulla chat interna).
  useEffect(() => {
    if (waParam || convParam) { _modeDaUrl.current = true; setMode("whatsapp"); }
    else if (mailParam || mconvParam) { _modeDaUrl.current = true; setMode("email"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waParam, convParam, mailParam, mconvParam]);

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
  // ── CHT-03 (Luca 04/08): ricerca globale nei messaggi, stile Telegram ──
  // lente accanto al + -> la lista diventa l'elenco delle chat che contengono
  // la parola cercata (snippet evidenziato + conteggio); X per uscire.
  const [searchMode, setSearchMode] = useState(false);
  const [globalQ, setGlobalQ] = useState("");
  const [searchHits, setSearchHits] = useState<ChatSearchHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const scrollToMsgRef = useRef<string | null>(null);   // messaggio da centrare all'apertura della chat
  useEffect(() => {
    if (!searchMode || !meId) return;
    const s = globalQ.trim();
    if (s.length < 3) { setSearchHits([]); setSearchBusy(false); return; }
    setSearchBusy(true);
    const t = setTimeout(async () => {
      try { setSearchHits(await searchMyMessages(meId, s)); }
      catch { setSearchHits([]); }
      finally { setSearchBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchMode, globalQ, meId]);
  // un risultato per CHAT (come Telegram): il match piu' recente + conteggio
  const searchGroups = useMemo(() => {
    const map = new Map<string, { top: ChatSearchHit; count: number }>();
    for (const h of searchHits) {
      const g = map.get(h.conversation_id);
      if (g) g.count += 1; else map.set(h.conversation_id, { top: h, count: 1 });
    }
    return [...map.values()];   // gli hit arrivano gia' in ordine di data desc
  }, [searchHits]);
  const chiudiRicerca = () => { setSearchMode(false); setGlobalQ(""); setSearchHits([]); };
  // centra il messaggio trovato e lo evidenzia per qualche secondo
  const evidenziaMsg = (msgId: string): boolean => {
    const el = document.getElementById(`msg-${msgId}`);
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    el.classList.add("rounded-xl", "ring-2", "ring-amber-400/60", "bg-amber-400/10");
    setTimeout(() => el.classList.remove("rounded-xl", "ring-2", "ring-amber-400/60", "bg-amber-400/10"), 2200);
    return true;
  };
  const apriRisultato = (hit: ChatSearchHit) => {
    if (selId === hit.conversation_id) { evidenziaMsg(hit.message_id); return; }
    scrollToMsgRef.current = hit.message_id;
    setSelId(hit.conversation_id);
  };
  const [messages, setMessages] = useState([]);
  const [parts, setParts] = useState([]);
  const [text, setText] = useState("");
  // Segnalazione 74: messaggio a cui si sta rispondendo (stile WhatsApp).
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  // Luca 07/08: il box di scrittura CRESCE VERSO L'ALTO con le righe (stile
  // WhatsApp) fino a ~9 righe, poi scorre dentro; si ritira quando si cancella
  const autoGrowComposer = () => {
    const el = composerRef.current; if (!el) return;
    const MAX = 220;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX) + "px";
    el.style.overflowY = el.scrollHeight > MAX ? "auto" : "hidden";
  };
  // Luca 04/08: rispondere (doppio click o bottone) deve portare il cursore
  // DRITTO nel campo di scrittura — prima si partiva a scrivere nel vuoto.
  const rispondiA = (m: ChatMessage) => {
    setReplyTo(m);
    requestAnimationFrame(() => composerRef.current?.focus());
  };
  // Luca 05/08: aprire una chat dalla lista = cursore GIÀ nel campo di
  // scrittura, senza cliccarci (il rAF aspetta il render del thread)
  useEffect(() => {
    setMultiSel(new Set());
    if (selId) requestAnimationFrame(() => composerRef.current?.focus());
  }, [selId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { autoGrowComposer(); }, [text]);
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
      // BADGE = SOLO il numero PERSONALE (Luca 11/08): chi vede tutto non deve
      // avere il pallino per chat non sue; le notifiche degli altri numeri
      // stanno sul chip di ogni numero dentro la scheda WhatsApp
      const { data: insts } = await supabase.from("wa_instances").select("id, owner_user_id, status");
      const mine = waIstanzeBadge((insts || []) as never[], meId).map((i: any) => i.id);
      if (mine.length) {
        const { data } = await supabase.from("wa_conversations").select("unread").in("instance_id", mine);
        setWaUnread((data || []).reduce((s: number, c: any) => s + (c.unread || 0), 0));
      } else setWaUnread(0);
    } catch { /* ignora */ }
    try {
      const [{ data: accs }, { data: memb }] = await Promise.all([
        supabase.from("email_accounts").select("id, owner_user_id, negozio"),
        supabase.from("email_account_users").select("account_id").eq("user_id", meId),
      ]);
      // stessa regola di visibilità dell'Inbox (modello WhatsApp, 26/08):
      // titolare O membro O negozio (anche multi) in visibilità; e
      // amministrazione = TUTTE (direttiva 26/08 sera) — il pallino conta
      // solo caselle apribili, e per l'admin ora lo sono tutte
      const membro = new Set((memb || []).map((r: any) => r.account_id));
      const mine = (accs || []).filter((a: any) => seesAllStores(user?.role) || a.owner_user_id === meId || membro.has(a.id) || (!a.owner_user_id && matchNegozi(a.negozio, myStores))).map((a: any) => a.id);
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

  // ── BOZZE PERSISTENTI + ULTIMA CHAT (Luca 06/08) ────────────────────────
  // Uscire dalla chat per un'altra sezione del CRM e rientrare deve riportare
  // alla conversazione in cui si stava scrivendo, col testo conservato.
  // Bozze per-conversazione in localStorage (per utente); l'ultima chat aperta
  // si ripristina solo se non c'e' un deep-link ?c=.
  const bozzeKey = meId ? `tf_chat_bozze_${meId}` : null;
  const leggiBozze = (): Record<string, string> => {
    if (!bozzeKey) return {};
    try { return JSON.parse(localStorage.getItem(bozzeKey) || "{}"); } catch { return {}; }
  };
  const convCorrente = useRef<string | null>(null);
  const bozzaAppenaCaricata = useRef(false);
  const allegatiAppenaCaricati = useRef(false);
  useEffect(() => {   // cambio conversazione: carica la bozza della nuova
    if (convCorrente.current === selId) return;
    convCorrente.current = selId;
    bozzaAppenaCaricata.current = true;
    setReplyTo(null);           // una citazione non puo' seguire in un'altra chat
    setText(selId ? (leggiBozze()[selId] || "") : "");
    // ALLEGATI della bozza (Luca 07/08: "se avevo messo allegati me li
    // cancella"): azzera quelli della chat precedente (non devono migrare di
    // conversazione) e ricarica da IndexedDB quelli della nuova — con guardia
    // anti-race sul selId al ritorno della promise
    allegatiAppenaCaricati.current = true;
    setFiles([]);
    if (selId && meId) {
      const perConv = selId;
      leggiAllegatiBozza(String(meId), perConv).then((f) => {
        if (convCorrente.current !== perConv || !f.length) return;
        allegatiAppenaCaricati.current = true;
        setFiles(f);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);
  useEffect(() => {   // write-through: ogni tasto aggiorna la bozza della chat corrente
    if (bozzaAppenaCaricata.current) { bozzaAppenaCaricata.current = false; return; }
    if (!bozzeKey || !selId || convCorrente.current !== selId || editMsg) return;
    try {
      const b = leggiBozze();
      if (text.trim()) b[selId] = text; else delete b[selId];
      localStorage.setItem(bozzeKey, JSON.stringify(b));
    } catch { /* storage negato: la bozza vive solo in pagina */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, selId, bozzeKey, editMsg]);
  useEffect(() => {   // write-through ALLEGATI (speculare al testo; copre input, drop, paste, screenshot, QR)
    if (allegatiAppenaCaricati.current) { allegatiAppenaCaricati.current = false; return; }
    if (!meId || !selId || convCorrente.current !== selId) return;
    const perConv = selId;
    if ((files as File[]).length) salvaAllegatiBozza(String(meId), perConv, files as File[]);
    else cancellaAllegatiBozza(String(meId), perConv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, selId, meId]);
  useEffect(() => { if (meId) pulisciBozzeAllegatiVecchie(String(meId)); }, [meId]);
  useEffect(() => {   // memoria dell'ultima chat aperta
    if (selId && meId) { try { localStorage.setItem(`tf_chat_ultima_${meId}`, String(selId)); } catch { } }
  }, [selId, meId]);
  const ripristinoFatto = useRef(false);
  useEffect(() => {   // rientro in chat: riapri dove si era rimasti
    if (ripristinoFatto.current || !meId || selId || !inbox.length) return;
    ripristinoFatto.current = true;
    if (new URLSearchParams(window.location.search).get("c")) return;
    try {
      const ultima = localStorage.getItem(`tf_chat_ultima_${meId}`);
      if (ultima && (inbox as any[]).some((c) => c.conversation_id === ultima)) setSelId(ultima);
    } catch { /* niente ripristino */ }
  }, [meId, inbox, selId]);

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

  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    // CHT-03: arrivando da un risultato di ricerca si centra il messaggio
    // trovato; un solo tentativo appena i messaggi sono a bordo, poi i
    // reload successivi tornano al normale "vai in fondo"
    const targetId = scrollToMsgRef.current;
    if (targetId && messages.length) {
      scrollToMsgRef.current = null;
      if (evidenziaMsg(targetId)) return;
    }
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const senderName = useMemo(() => {
    const m = {}; parts.forEach((p) => (m[p.user_id] = p.full_name)); return m;
  }, [parts]);

  // Filtro "Non letti" (Luca 04/08, stile WhatsApp): pillola sotto la ricerca
  const [soloNonLetti, setSoloNonLetti] = useState(false);
  const filteredInbox = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = inbox;
    if (soloNonLetti) out = out.filter((c: any) => (c.unread || 0) > 0);
    if (!s) return out;
    return out.filter((c) => (c.title || c.other_name || "").toLowerCase().includes(s));
  }, [inbox, q, soloNonLetti]);

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
    if (editMsg) { await salvaModifica(); return; }
    if (!selId || !meId || sending) return;
    if (!text.trim() && files.length === 0 && refs.length === 0) return;
    setSending(true);
    try {
      await sendMessage(selId, meId, text.trim(), files, refs, replyTo?.id ?? null);
      setText(""); setFiles([]); setRefs([]); setMention(null); setMentionRows([]); setReplyTo(null);
      if (meId && selId) cancellaAllegatiBozza(String(meId), selId);
      await reloadMessages(selId);
    }
    catch (e) { console.error("chat send failed", e); alert("Invio non riuscito: " + (e?.message || e)); }
    finally { setSending(false); }
  };

  const title = selConv ? (selConv.type === "group" ? selConv.title : selConv.other_name) : "";
  const dmOnline = selConv?.type === "dm" && isOnline(selConv.other_id);
  const otherPart = selConv?.type === "dm" ? parts.find((p) => p.user_id !== meId) : null;
  // RICEVUTE UNIVERSALI (03/08, richiesta Luca): valgono anche nei GRUPPI —
  // 👀 = letto da TUTTI (come le spunte blu), 👁 x/y = letto da alcuni,
  // ✉️ = consegnato, 📤 = inviato. Emoji al posto delle spunte: sul tema
  // scuro le due grigie/blu si confondevano.
  const receiptFor = (m) => {
    const altri = parts.filter((p) => p.user_id !== meId);
    if (!altri.length) return { stato: "sent", letti: 0, tot: 0 };
    const t = new Date(m.created_at).getTime();
    const letti = altri.filter((p) => p.last_read_at && new Date(p.last_read_at).getTime() >= t).length;
    if (letti >= altri.length) return { stato: "seen", letti, tot: altri.length };
    if (letti > 0) return { stato: "partial", letti, tot: altri.length };
    const consegnato = altri.some((p) => p.last_delivered_at && new Date(p.last_delivered_at).getTime() >= t);
    return { stato: consegnato ? "delivered" : "sent", letti, tot: altri.length };
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
        {/* OMNICHAT (Luca 26/08): la quarta scheda UNISCE le altre tre e ci
            mette accanto l'AI — recap, analisi e risposte pronte — più i dati
            del cliente. Le tre inbox non vengono riscritte: vengono RIUSATE
            senza la loro lista, così restano tutte le loro funzioni. */}
        <button onClick={() => setMode("omni")}
          className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
            mode === "omni" ? "bg-violet-500/15 text-violet-200" : "text-slate-400 hover:text-white hover:bg-white/5")}>
          <Sparkles className="w-4 h-4" /> Omnichat
        </button>
      </div>

      {mode === "omni" ? (
        <OmniChat />
      ) : mode === "whatsapp" ? (
        <div className="flex-1 min-h-0 overflow-hidden"><WhatsAppInbox embedded apriNumero={convParam ? null : waParam} apriConvId={convParam} testoIniziale={testoParam} /></div>
      ) : mode === "email" ? (
        <div className="flex-1 min-h-0 overflow-hidden"><EmailInbox embedded componiA={mailParam} apriConvId={mconvParam} /></div>
      ) : (
      <div className="flex-1 min-h-0 flex overflow-hidden">
      {/* ── LEFT: conversation list ─────────────────────────────── */}
      {/* CHT-01: sotto sm i pannelli si alternano (colonna singola pilotata da
          selId): chat aperta -> solo thread; nessuna chat -> solo lista. */}
      <aside className={cn("w-full sm:w-80 lg:w-96 shrink-0 flex-col border-r border-white/5 bg-[#0f111a]/60", selId ? "hidden sm:flex" : "flex")}>
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/5">
          <h2 className="text-white font-semibold flex items-center gap-2"><MessageSquare className="w-5 h-5 text-indigo-400" /> Chat</h2>
          <div className="flex items-center gap-1">
            {/* CHT-03: lente = ricerca per parole in TUTTE le mie chat */}
            <button onClick={() => setSearchMode(true)}
              className={cn("p-2 rounded-lg transition-colors", searchMode ? "bg-amber-500/15 text-amber-300" : "text-slate-400 hover:text-indigo-300 hover:bg-white/5")}
              title="Cerca nei messaggi di tutte le chat">
              <Search className="w-4 h-4" />
            </button>
            <button onClick={() => setShowNew(true)} className="p-2 rounded-lg bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25" title="Nuova conversazione">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="px-3 py-2">
          {searchMode ? (
            /* CHT-03: campo della ricerca globale — X (o Esc) per tornare alla lista */
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400" />
              <input autoFocus value={globalQ} onChange={(e) => setGlobalQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") chiudiRicerca(); }}
                placeholder="Cerca parole in tutte le chat…" className="glass-input w-full pl-9 pr-9 h-9 text-sm" />
              <button onClick={chiudiRicerca} title="Chiudi la ricerca"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca conversazioni…" className="glass-input w-full pl-9 h-9 text-sm" />
            </div>
          )}
          {/* pillole filtro stile WhatsApp (Luca 04/08) */}
          {!searchMode && (
            <div className="flex gap-1.5 mt-2">
              <button type="button" onClick={() => setSoloNonLetti(false)}
                className={cn("px-3 py-1 rounded-full border text-[11px] font-bold transition-colors",
                  !soloNonLetti ? "border-indigo-400/60 bg-indigo-500/15 text-indigo-200" : "border-white/10 text-slate-500 hover:text-slate-300")}>Tutte</button>
              <button type="button" onClick={() => setSoloNonLetti(true)}
                className={cn("px-3 py-1 rounded-full border text-[11px] font-bold transition-colors",
                  soloNonLetti ? "border-indigo-400/60 bg-indigo-500/15 text-indigo-200" : "border-white/10 text-slate-500 hover:text-slate-300")}>
                Non lette{chatUnread > 0 && <span className="ml-1.5 px-1.5 py-[1px] rounded-full bg-indigo-500 text-white text-[10px]">{chatUnread > 99 ? "99+" : chatUnread}</span>}
              </button>
            </div>
          )}
        </div>
        {/* CHT-03: in modalita' ricerca la lista mostra SOLO le chat che
            contengono la parola cercata, con snippet e conteggio (stile Telegram) */}
        {searchMode ? (
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {globalQ.trim().length < 3 ? (
            <p className="text-center text-sm text-slate-500 py-10 px-4">Scrivi almeno 3 caratteri:<br />codice fiscale, email, qualsiasi parola.</p>
          ) : searchBusy && searchGroups.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-10">Cerco…</p>
          ) : searchGroups.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-10 px-4">Nessun messaggio contiene<br />“{globalQ.trim()}”.</p>
          ) : searchGroups.map(({ top, count }) => {
            const conv = inbox.find((c: any) => c.conversation_id === top.conversation_id);
            const nome = conv ? (conv.type === "group" ? conv.title : conv.other_name) : "Chat";
            const sn = snippetMatch(top.body, globalQ.trim());
            return (
              <button key={top.conversation_id} onClick={() => apriRisultato(top)}
                className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left hover:bg-white/5 transition-colors">
                {conv?.type === "group" ? (
                  <span className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-xs font-bold border bg-purple-500/20 text-purple-200 border-purple-500/30">
                    <Users className="w-5 h-5" />
                  </span>
                ) : (
                  /* FOTO PROFILO (Luca 05/08): la foto dell'utente, iniziali se manca */
                  <AvatarUtente userId={conv?.other_id} nome={nome || ""} className="w-11 h-11 text-xs" />
                )}
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white truncate">{nome || "—"}</span>
                    <span className="text-[10px] text-slate-500 shrink-0">{dayLabel(top.created_at)}</span>
                  </span>
                  <span className="block text-xs text-slate-400 truncate">
                    {sn.prima}
                    {sn.match && <span className="bg-amber-400/30 text-amber-100 rounded-sm px-0.5">{sn.match}</span>}
                    {sn.dopo}
                  </span>
                  {count > 1 && <span className="block text-[10px] text-indigo-300 mt-0.5">{count} messaggi</span>}
                </span>
              </button>
            );
          })}
        </div>
        ) : (
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
                  {c.type === "group" ? (
                    <span className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold border bg-purple-500/20 text-purple-200 border-purple-500/30">
                      <Users className="w-5 h-5" />
                    </span>
                  ) : (
                    /* FOTO PROFILO (Luca 05/08): foto nelle chat 1:1, iniziali se manca */
                    <AvatarUtente userId={c.other_id} nome={name} className="w-11 h-11 text-xs" />
                  )}
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
                        className="opacity-0 group-hover/riga:opacity-100 pointer-coarse:opacity-100 p-1 rounded-md text-slate-500 hover:text-indigo-300 hover:bg-white/10 transition-opacity">
                        {c.pinned_at ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                      </span>
                      {c.unread === 0 && (
                        <span role="button" tabIndex={0} title="Segna come da leggere"
                          onClick={(e) => onMarkUnread(e, c.conversation_id)}
                          className="opacity-0 group-hover/riga:opacity-100 pointer-coarse:opacity-100 p-1 rounded-md text-slate-500 hover:text-indigo-300 hover:bg-white/10 transition-opacity">
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
        )}
      </aside>

      {/* ── RIGHT: thread ───────────────────────────────────────── */}
      <section className={cn("flex-1 flex-col bg-[#0b0d14] relative", selId ? "flex" : "hidden sm:flex")}
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
            {/* selId puntato su una chat non (ancora) in inbox: su mobile la lista
                e' nascosta, serve comunque una via di ritorno */}
            {selId && (
              <button onClick={() => setSelId(null)} className="sm:hidden mt-3 flex items-center gap-1 text-sm text-indigo-300 hover:text-indigo-200">
                <ChevronLeft className="w-4 h-4" /> Torna alle conversazioni
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-4 sm:px-5 h-14 border-b border-white/5 shrink-0">
              {/* CHT-01: indietro (solo mobile) — torna alla lista */}
              <button onClick={() => setSelId(null)} title="Torna alle conversazioni"
                className="sm:hidden p-1.5 -ml-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 shrink-0">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="relative shrink-0">
                {selConv.type === "group" ? (
                  <span className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border bg-purple-500/20 text-purple-200 border-purple-500/30">
                    <Users className="w-4 h-4" />
                  </span>
                ) : (
                  /* FOTO PROFILO (Luca 05/08): foto dell'interlocutore nell'intestazione */
                  <AvatarUtente userId={selConv.other_id} nome={title} className="w-9 h-9 text-xs" />
                )}
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
                  <button type="button" title="Rispondi" onClick={() => rispondiA(m)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100 shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-opacity">
                    <Reply className="w-4 h-4" />
                  </button>
                );
                const btnModifica = (mine && (Date.now() - new Date(m.created_at).getTime() <= FINESTRA_MODIFICA_MS) && m.body) ? (
                  <button type="button" title="Modifica (entro 3 minuti)" onClick={() => avviaModifica(m)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100 shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-white/10 transition-opacity">
                    <Pencil className="w-4 h-4" />
                  </button>
                ) : null;
                const btnInoltra = (
                  <button type="button" title="Inoltra" onClick={() => { setForwardMsg(m); setForwardCerca(""); }}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100 shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-opacity">
                    <Forward className="w-4 h-4" />
                  </button>
                );
                const btnSeleziona = (
                  <button type="button" title="Seleziona più messaggi da inoltrare insieme" onClick={() => toggleSel(m)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100 shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-white/10 transition-opacity">
                    <CheckSquare className="w-4 h-4" />
                  </button>
                );
                // REAZIONI stile Telegram (mig. 130): faccina al passaggio, menu rapido
                const btnReagisci = (
                  <span className="relative shrink-0">
                    <button type="button" title="Reagisci"
                      onClick={() => { setReactPickerFor(null); setReactFor(reactFor === m.id ? null : m.id); }}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-white/10 transition-opacity">
                      <SmilePlus className="w-4 h-4" />
                    </button>
                    {reactFor === m.id && !reactPickerFor && (
                      // CHT-01: sotto sm i picker si sganciano dall'ancora (fixed in
                      // basso, tutta larghezza), altrimenti sbordano dal viewport
                      <div className={`fixed sm:absolute left-3 right-3 bottom-20 sm:bottom-full mb-1 z-30 flex flex-wrap justify-center sm:justify-start gap-0.5 px-1.5 py-1 rounded-full bg-[#171622] border border-white/15 shadow-2xl ${mine ? "sm:left-auto sm:right-0" : "sm:right-auto sm:left-0"}`}>
                        {QUICK_REACTIONS.map((e) => (
                          <button key={e} type="button" onClick={() => onReact(m.id, e)}
                            className="text-lg leading-none p-1 rounded-full hover:bg-white/10 hover:scale-125 transition-transform">{e}</button>
                        ))}
                        {/* + = qualsiasi emoji (Luca 02/08): apre la griglia completa */}
                        <button type="button" title="Tutte le emoji" onClick={() => setReactPickerFor(m.id)}
                          className="text-sm font-black leading-none px-1.5 rounded-full text-slate-300 hover:bg-white/10">＋</button>
                      </div>
                    )}
                    {reactFor === m.id && reactPickerFor === m.id && (
                      <div className={`fixed sm:absolute left-3 right-3 bottom-20 sm:bottom-full mb-1 z-30 w-auto sm:w-64 max-h-48 overflow-y-auto p-2 rounded-2xl bg-[#171622] border border-white/15 shadow-2xl ${mine ? "sm:left-auto sm:right-0" : "sm:right-auto sm:left-0"}`}>
                        {recentiEmoji.length > 0 && <div className="grid grid-cols-8 gap-0.5 mb-1 pb-1 border-b border-white/10">
                          {recentiEmoji.map((e) => (
                            <button key={"r" + e} type="button" onClick={() => { setReactPickerFor(null); onReact(m.id, e); registraEmojiRecente(e); }}
                              className="text-lg leading-none p-1 rounded-lg hover:bg-white/10">{e}</button>
                          ))}
                        </div>}
                        <div className="grid grid-cols-8 gap-0.5">
                          {EMOJI_SET.map((e) => (
                            <button key={e} type="button" onClick={() => { setReactPickerFor(null); onReact(m.id, e); registraEmojiRecente(e); }}
                              className="text-lg leading-none p-1 rounded-lg hover:bg-white/10">{e}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </span>
                );
                // #126: solo l'amministratore del gruppo vede il tasto "i" (chi ha letto e quando)
                const btnInfo = (selConv.type === "group" && iAmGroupAdmin) ? (
                  <button type="button" title="Chi ha letto" onClick={() => setInfoMsg(m)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100 shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-white/10 transition-opacity">
                    <Info className="w-4 h-4" />
                  </button>
                ) : null;
                return (
                  <div key={m.id} id={`msg-${m.id}`}>
                    {showDay && <div className="text-center my-3"><span className="text-[11px] text-slate-500 bg-white/5 px-3 py-1 rounded-full">{showDay}</span></div>}
                    {/* Doppio click A FIANCO del messaggio = rispondi (Luca 02/08):
                        sul testo il doppio click deve solo selezionare, come nativo. */}
                    <div className={`group flex items-center gap-1 ${mine ? "justify-end" : "justify-start"} ${multiSel.size > 0 ? "cursor-pointer rounded-xl " + (multiSel.has(m.id) ? "bg-indigo-500/10" : "hover:bg-white/[0.03]") : ""}`}
                      title={multiSel.size > 0 ? "Clicca per selezionare/deselezionare" : "Doppio click a fianco del messaggio per rispondere"}
                      onClickCapture={(e) => { if (multiSel.size > 0) { e.preventDefault(); e.stopPropagation(); toggleSel(m); } }}
                      onDoubleClick={(e) => { if ((e.target as HTMLElement).closest("button")) return; rispondiA(m); }}>
                      {multiSel.size > 0 && (
                        <span className={`shrink-0 w-5 h-5 rounded-full border grid place-items-center text-[11px] font-black transition-colors ${multiSel.has(m.id) ? "bg-indigo-500 border-indigo-400 text-white" : "border-white/25 text-transparent"}`}>✓</span>
                      )}
                      {mine && <>{btnInfo}{btnModifica}{btnInoltra}{btnSeleziona}{btnReagisci}{btnRispondi}</>}
                      <div onDoubleClick={(e) => e.stopPropagation()}
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2 select-text ${mine ? "bg-indigo-600 text-white rounded-br-sm" : "bg-white/5 text-slate-100 rounded-bl-sm border border-white/5"}`}>
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
                          {m.edited_at && <span className="italic opacity-70">modificato ·</span>} {fmtTime(m.created_at)}
                          {mine && (() => {
                            const r = receiptFor(m);
                            const gruppo = selConv.type === "group";
                            if (r.stato === "seen") return <span title={gruppo ? `👀 Letto da TUTTI (${r.tot})` : "👀 Letto"} className="text-[11px] leading-none">👀</span>;
                            if (r.stato === "partial") return <span title={`👁 Letto da ${r.letti} su ${r.tot} — dettaglio sulla ⓘ`} className="text-[11px] leading-none">👁 <i className="not-italic font-bold">{r.letti}/{r.tot}</i></span>;
                            if (r.stato === "delivered") return <span title="✉️ Consegnato (non ancora letto)" className="text-[11px] leading-none">✉️</span>;
                            return <span title="📤 Inviato" className="text-[11px] leading-none">📤</span>;
                          })()}
                        </p>
                      </div>
                      {!mine && <>{btnRispondi}{btnReagisci}{btnInoltra}{btnSeleziona}{btnInfo}</>}
                    </div>
                  </div>
                );
              })}
            </div>

            {multiSel.size > 0 && (
              <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-white/10 bg-[#14131f]">
                <span className="text-xs font-bold text-slate-200">☑ {multiSel.size} {multiSel.size === 1 ? "messaggio selezionato" : "messaggi selezionati"}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { const lista = messages.filter((x) => multiSel.has(x.id)); if (lista.length) { setForwardList(lista); setForwardCerca(""); } }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-1.5">
                    <Forward className="w-3.5 h-3.5" /> Inoltra {multiSel.size > 1 ? `tutti e ${multiSel.size}` : ""}
                  </button>
                  <button type="button" onClick={() => setMultiSel(new Set())}
                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs font-bold hover:bg-white/10">Annulla</button>
                </div>
              </div>
            )}
            {/* composer */}
            <div className="relative border-t border-white/5 px-4 py-3 shrink-0">
              {/* Segnalazione 74: anteprima del messaggio a cui si risponde */}
              {editMsg && (
                <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-amber-500/10 border-l-2 border-amber-400">
                  <Pencil className="w-4 h-4 text-amber-300 shrink-0" />
                  <span className="text-xs text-amber-200 flex-1 truncate">Stai modificando il messaggio — Invio per salvare</span>
                  <button onClick={annullaModifica} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
              )}
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
                {/* CHT-01: screenshot/registrazione SOLO dove getDisplayMedia esiste
                    (su iOS/Android fallivano in silenzio) e da sm in su (composer
                    ridotto su mobile). Registrazione viva: il tasto stop resta. */}
                {canCapture && <span className="relative shrink-0 hidden sm:block">
                  <button type="button" title="Screenshot (finestra intera o area)" onClick={() => setShotMenu(v => !v)}
                    className={`p-2 rounded-lg transition-colors ${shotMenu ? "text-sky-300 bg-white/10" : "text-slate-400 hover:text-sky-300 hover:bg-white/10"}`}>
                    <Camera className="w-5 h-5" />
                  </button>
                  {shotMenu && (
                    <div className="absolute bottom-full mb-2 left-0 z-40 flex gap-1.5 p-1.5 rounded-2xl bg-[#171622] border border-white/15 shadow-2xl">
                      <button type="button" title="Cattura la finestra/schermo intero" onClick={() => fareScreenshot(false)}
                        className="w-12 h-12 rounded-xl bg-white/5 border border-white/15 hover:bg-white/10 flex items-center justify-center text-xl">🖥️</button>
                      <button type="button" title="Seleziona un'area a mano (tratteggio)" onClick={() => fareScreenshot(true)}
                        className="w-12 h-12 rounded-xl bg-white/5 border-2 border-dashed border-white/30 hover:bg-white/10 flex items-center justify-center">
                        <span className="w-6 h-5 border-2 border-dashed border-slate-300 rounded-sm" />
                      </button>
                      <button type="button" title="Carica foto dal telefono (QR)" onClick={() => { setShotMenu(false); qrChat.openQr("chat", "foto"); }}
                        className="w-12 h-12 rounded-xl bg-white/5 border border-white/15 hover:bg-white/10 flex items-center justify-center text-xl">📱</button>
                    </div>
                  )}
                </span>}
                {canCapture && <button type="button" onClick={toggleRegistrazione}
                  title={recording ? "Ferma la registrazione (si allega al messaggio)" : "Registra lo schermo (clicca di nuovo per fermare)"}
                  className={`p-2 rounded-lg transition-colors shrink-0 ${recording ? "text-red-400 bg-red-500/15 animate-pulse" : "hidden sm:block text-slate-400 hover:text-red-400 hover:bg-white/10"}`}>
                  <Disc className="w-5 h-5" />
                </button>}
                <span className="relative shrink-0">
                  <button type="button" title="Emoji" onClick={() => { setShowEmoji(v => !v); setShowGif(false); }}
                    className={`p-2 rounded-lg transition-colors ${showEmoji ? "text-amber-300 bg-white/10" : "text-slate-400 hover:text-amber-300 hover:bg-white/10"}`}>
                    <Smile className="w-5 h-5" />
                  </button>
                  {showEmoji && (
                    // CHT-01: sotto sm il picker si sgancia dall'ancora (fixed, tutta
                    // larghezza), altrimenti sborda dal viewport
                    <div className="fixed sm:absolute left-3 right-3 bottom-20 sm:left-0 sm:right-auto sm:bottom-full mb-2 z-40 w-auto sm:w-72 max-h-56 overflow-y-auto p-2 rounded-2xl bg-[#171622] border border-white/15 shadow-2xl">
                      {/* recenti in testa, come WhatsApp (Luca 04/08) */}
                      {recentiEmoji.length > 0 && <>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1 pb-1">🕐 Recenti</p>
                        <div className="grid grid-cols-8 gap-0.5 mb-1.5 pb-1.5 border-b border-white/10">
                          {recentiEmoji.map((e) => (
                            <button key={"r" + e} type="button" onClick={() => { setText((t) => t + e); registraEmojiRecente(e); }}
                              className="text-xl leading-none p-1.5 rounded-lg hover:bg-white/10">{e}</button>
                          ))}
                        </div>
                      </>}
                      <div className="grid grid-cols-8 gap-0.5">
                        {EMOJI_SET.map((e) => (
                          <button key={e} type="button" onClick={() => { setText((t) => t + e); registraEmojiRecente(e); }}
                            className="text-xl leading-none p-1.5 rounded-lg hover:bg-white/10">{e}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </span>
                {/* GIF picker (Giphy) — richiesta Francesco. Solo se la chiave è configurata */}
                {gifEnabled && <span className="relative shrink-0">
                  <button type="button" title="GIF" onClick={() => { setShowGif(v => !v); setShowEmoji(false); }}
                    className={`p-2 rounded-lg transition-colors ${showGif ? "text-fuchsia-300 bg-white/10" : "text-slate-400 hover:text-fuchsia-300 hover:bg-white/10"}`}>
                    <span className="block h-5 leading-5 text-[11px] font-black tracking-wide">GIF</span>
                  </button>
                  {showGif && (
                    <div className="fixed sm:absolute left-3 right-3 bottom-20 sm:left-0 sm:right-auto sm:bottom-full mb-2 z-40 w-auto sm:w-80 rounded-2xl bg-[#171622] border border-white/15 shadow-2xl p-2">
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
                <textarea ref={composerRef} value={text} onChange={onTextChange} onPaste={onPaste}
                  onKeyDown={(e) => {
                    if (mention && mentionRows.length > 0) {
                      if (e.key === "Enter") { e.preventDefault(); pickMention(mentionRows[0]); return; }
                      if (e.key === "Escape") { e.preventDefault(); setMention(null); setMentionRows([]); return; }
                    }
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
                  }}
                  rows={1} placeholder="Scrivi un messaggio…  (@ per taggare cliente, contratto o appuntamento)"
                  className="glass-input flex-1 resize-none py-2.5" style={{ maxHeight: 220 }} />
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

      {shotEdit && (
        <ScreenshotEditor src={shotEdit.src} iniziaInRitaglio={shotEdit.ritaglio}
          onDone={(f) => { setFiles((p: File[]) => [...p, f]); setShotEdit(null); }}
          onCancel={() => setShotEdit(null)} />
      )}

      {(forwardMsg || forwardList) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => { setForwardMsg(null); setForwardList(null); }}>
          <div className="glass-card w-full max-w-md max-h-[75vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 p-4 border-b border-white/10 bg-white/5">
              <h3 className="text-base font-bold text-white flex items-center gap-2"><Forward className="w-4 h-4 text-indigo-300" /> Inoltra {forwardList && forwardList.length > 1 ? `${forwardList.length} messaggi` : ""} a…</h3>
              <button onClick={() => { setForwardMsg(null); setForwardList(null); }} className="text-slate-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
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
                        <AvatarUtente userId={u.id} nome={u.full_name} className="w-8 h-8 text-[10px]" />
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
                        <AvatarUtente userId={m.user_id} nome={m.full_name} className="w-9 h-9 text-xs" />
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
                        <AvatarUtente userId={p.user_id} nome={p.full_name} className="w-8 h-8 text-[10px]" />
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
                          <AvatarUtente userId={p.user_id} nome={p.full_name} className="w-8 h-8 text-[10px] bg-white/5 text-slate-300 border-white/10" />
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
      <QrUploadModal qr={qrChat} hint="Le foto caricate dal telefono si allegano al messaggio in scrittura." />
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

/* ── REGISTRATORE SCHERMO di MODULO (03/08): sopravvive al cambio di
   sezione del CRM. La registrazione parte dalla chat, continua ovunque tu
   navighi, e si allega quando torni (o appena fermi la condivisione). ── */
let _regViva: { rec: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null = null;
let _regPronta: File | null = null;
let _regConsegna: ((f: File) => void) | null = null;
// conversazione da cui e' PARTITA la registrazione (Luca 03/08): rientrando
// in chat si riapre lei, e il file consegnato si allega li'
let _regConv: string | null = null;
