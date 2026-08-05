"use client";

// Inbox Email riusabile (webmail nel CRM), interfaccia in stile Gmail ma in tema
// scuro glassmorphism. Cartelle (Posta in arrivo / Speciali / Inviati / Bozze /
// Spam / Cestino), stella, spam, cestino, archivia, bozze e composizione agganciata
// in basso a destra. Una casella per negozio: IMAP per leggere, SMTP per inviare
// (route /api/email/*). embedded=true -> pensata per stare dentro la pagina Chat.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { caricaTutte } from "@/lib/fetchTutte";
import { useVisibleStores, sameStore } from "@/lib/visibleStores";
import { seesAllStores } from "@/lib/roles";
import {
    Mail, Plus, Send, X, RefreshCw, Loader2, Paperclip, Check, PenSquare, Inbox,
    Star, Trash2, ShieldAlert, Archive, Search, CornerUpLeft, FileText, SendHorizontal,
    RotateCcw, ChevronLeft, MailOpen, Code, Settings,
} from "lucide-react";
import { cn } from "@/utils";

type Account = { id: string; email_address: string; display_name: string | null; negozio: string | null; owner_user_id: string | null; status: string; last_error?: string | null; backfill_enabled?: boolean; backfill_done?: boolean };
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
    const [manageModal, setManageModal] = useState(false);   // gestione/eliminazione caselle (EML-02)
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
    // palette per CASELLA: stabile (indice nell'elenco ordinato per created_at)
    const PALETTE_CASELLE = [
        { chip: "bg-sky-500/15 border-sky-500/40 text-sky-200", dot: "bg-sky-400", badge: "bg-sky-500" },
        { chip: "bg-violet-500/15 border-violet-500/40 text-violet-200", dot: "bg-violet-400", badge: "bg-violet-500" },
        { chip: "bg-emerald-500/15 border-emerald-500/40 text-emerald-200", dot: "bg-emerald-400", badge: "bg-emerald-500" },
        { chip: "bg-amber-500/15 border-amber-500/40 text-amber-200", dot: "bg-amber-400", badge: "bg-amber-500" },
        { chip: "bg-rose-500/15 border-rose-500/40 text-rose-200", dot: "bg-rose-400", badge: "bg-rose-500" },
        { chip: "bg-cyan-500/15 border-cyan-500/40 text-cyan-200", dot: "bg-cyan-400", badge: "bg-cyan-500" },
        { chip: "bg-orange-500/15 border-orange-500/40 text-orange-200", dot: "bg-orange-400", badge: "bg-orange-500" },
        { chip: "bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-200", dot: "bg-fuchsia-400", badge: "bg-fuchsia-500" },
    ];
    const coloreCasella = useCallback((id: string) => {
        const i = accounts.findIndex(a => a.id === id);
        return PALETTE_CASELLE[(i >= 0 ? i : 0) % PALETTE_CASELLE.length];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accounts]);
    const visibleAccounts = useMemo(() => {
        if (scope === "own") return accounts.filter(a => a.owner_user_id === user?.id);
        // AMMINISTRAZIONE = tutte le caselle (Luca 02/08: le caselle erano
        // "sparite" perche' ricollegate sotto un altro negozio/owner e la
        // vista non aveva un bypass per chi vede tutto)
        if (seesAllStores(user?.role)) return accounts;
        return accounts.filter(a => a.owner_user_id === user?.id || (a.negozio && myStores.some(s => sameStore(a.negozio, s))));
    }, [accounts, scope, user?.id, user?.role, myStores]);

    // non letti PER CASELLA (per i badge colorati sulle chip)
    const [unreadPerAcc, setUnreadPerAcc] = useState<Record<string, number>>({});
    useEffect(() => {
        let alive = true;
        const load = async () => {
            const ids = visibleAccounts.map(a => a.id);
            if (!ids.length) { if (alive) setUnreadPerAcc({}); return; }
            // col backfill le conversazioni superano il tetto PostgREST (1000
            // righe): caricaTutte pagina, altrimenti i badge contano a caso
            const { data } = await caricaTutte<{ account_id: string; unread: number; trashed: boolean; spam: boolean; archived: boolean }>((from, to) =>
                supabase.from("email_conversations")
                    .select("account_id, unread, trashed, spam, archived").in("account_id", ids)
                    .order("id").range(from, to));
            if (!alive) return;
            const m: Record<string, number> = {};
            (data || []).forEach((c: any) => { if (!c.trashed && !c.spam && !c.archived) m[c.account_id] = (m[c.account_id] || 0) + (c.unread || 0); });
            setUnreadPerAcc(m);
        };
        load(); const t = setInterval(load, 10000);
        return () => { alive = false; clearInterval(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleAccounts.map(a => a.id).join("|")]);


    const loadAccounts = async () => {
        // backfill_enabled/backfill_done arrivano con la mig. 20260804120000: se
        // non fosse ancora applicata la select fallirebbe, quindi si ripiega
        // sulla lista di colonne storica (l'indicatore "storico" resta muto).
        const full = await supabase.from("email_accounts").select("id, email_address, display_name, negozio, owner_user_id, status, last_error, backfill_enabled, backfill_done").order("created_at");
        let data: any[] | null = full.data;
        if (!data) ({ data } = await supabase.from("email_accounts").select("id, email_address, display_name, negozio, owner_user_id, status, last_error").order("created_at"));
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
    const [pollErr, setPollErr] = useState<string | null>(null);
    const aggiorna = async (accId?: string) => {
        const id = accId || selAcc; if (!id) return;
        setRefreshing(true);
        try {
            await api("/api/email/poll", { accountId: id });
            setPollErr(null);
        } catch (e) {
            // prima l'errore veniva INGHIOTTITO e "la posta non si aggiornava
            // a tratti" senza spiegazioni (Luca 02/08): un retry e poi si dice
            try { await api("/api/email/poll", { accountId: id }); setPollErr(null); }
            catch (e2) { setPollErr("Aggiornamento non riuscito: " + ((e2 as Error)?.message || "riprova")); }
        }
        setRefreshing(false);
    };
    // al RITORNO sulla scheda del browser la posta si aggiorna subito
    useEffect(() => {
        const su = () => { if (document.visibilityState === "visible" && selAcc) aggiorna(selAcc); };
        document.addEventListener("visibilitychange", su);
        return () => document.removeEventListener("visibilitychange", su);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selAcc]);
    useEffect(() => { if (selAcc) aggiorna(selAcc); }, [selAcc]);            // poll all'apertura
    useEffect(() => { if (!selAcc) return; const t = setInterval(() => aggiorna(selAcc), 45000); return () => clearInterval(t); }, [selAcc]);  // e ogni 45s

    // conversazioni (polling leggero da Supabase). caricaTutte (EML-03): senza
    // paginazione PostgREST tronca a 1000 righe IN SILENZIO — con lo storico di
    // amministrazione@ la lista si sarebbe tappata e i conteggi mentirebbero.
    // Ordine con .order("id") in coda: spareggio stabile tra le pagine.
    useEffect(() => {
        if (!selAcc) { setConvs([]); return; }
        let alive = true;
        const load = async () => {
            const { data } = await caricaTutte<Conv>((from, to) =>
                supabase.from("email_conversations").select("*").eq("account_id", selAcc)
                    .order("last_message_at", { ascending: false, nullsFirst: false }).order("id")
                    .range(from, to));
            if (alive) setConvs(data as Conv[]);
        };
        load(); const t = setInterval(load, 5000);
        return () => { alive = false; clearInterval(t); };
    }, [selAcc]);

    // quali conversazioni hanno un messaggio in uscita (per la cartella Inviati);
    // anche qui caricaTutte: le "out" storiche di una casella superano le 1000
    useEffect(() => {
        if (!selAcc) { setSentIds(new Set()); return; }
        let alive = true;
        caricaTutte<{ conversation_id: string }>((from, to) =>
            supabase.from("email_messages").select("conversation_id").eq("account_id", selAcc).eq("direction", "out")
                .order("id").range(from, to))
            .then(({ data }) => { if (alive) setSentIds(new Set(data.map(r => r.conversation_id))); });
        return () => { alive = false; };
    }, [selAcc, convs.length]);

    // bozze
    const loadDrafts = useCallback(async () => {
        if (!selAcc) { setDrafts([]); return; }
        const { data } = await supabase.from("email_drafts").select("*").eq("account_id", selAcc).order("updated_at", { ascending: false });
        setDrafts((data ?? []) as Draft[]);
    }, [selAcc]);
    useEffect(() => { loadDrafts(); const t = setInterval(loadDrafts, 8000); return () => clearInterval(t); }, [loadDrafts]);

    // messaggi della conversazione selezionata. Coi thread storici (EML-03: un
    // mittente automatico ha 3.000+ messaggi) la vecchia query ascendente senza
    // range veniva troncata dal tetto PostgREST ai 1000 PIU' VECCHI, nascondendo
    // proprio i recenti. Si caricano gli ULTIMI 300 (poi girati in ordine
    // cronologico) e un banner dichiara quanti ne restano fuori: caricare corpi
    // HTML a migliaia ogni 4s ammazzerebbe browser e banda.
    const [msgsTotali, setMsgsTotali] = useState(0);
    useEffect(() => {
        if (!selConv) { setMsgs([]); setMsgsTotali(0); return; }
        let alive = true;
        const load = async () => {
            const { data, count } = await supabase.from("email_messages").select("*", { count: "exact" })
                .eq("conversation_id", selConv.id)
                .order("email_date", { ascending: false, nullsFirst: false }).order("id", { ascending: false })
                .range(0, 299);
            if (alive) { setMsgs(((data ?? []) as Msg[]).reverse()); setMsgsTotali(count ?? (data?.length || 0)); }
        };
        load(); const t = setInterval(load, 4000);
        supabase.from("email_conversations").update({ unread: 0 }).eq("id", selConv.id).then(() => { });
        // EML-05: la lettura vale anche in webmail (\Seen su IMAP) — fuoco e
        // dimentica: se fallisce, il poll riallinea al giro dopo
        fetch("/api/email/seen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: selConv.id, seen: true }) }).catch(() => { });
        return () => { alive = false; clearInterval(t); };
    }, [selConv?.id]);
    // AUTOSCROLL SOLO QUANDO SERVE (Luca 05/08): prima OGNI refresh dei
    // messaggi (poll a 4s) riportava in fondo anche mentre leggevi in alto.
    // Ora: in fondo all'APERTURA del thread; sui refresh solo se sei già lì
    // (nuovo messaggio mentre guardi la coda), altrimenti lo scroll resta tuo.
    const scrollConvRef = useRef<string | null>(null);
    const scrollNMsgs = useRef(0);
    useEffect(() => {
        const el = scrollRef.current; if (!el) return;
        const cambioThread = scrollConvRef.current !== (selConv?.id || null);
        const eroInFondo = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
        if (cambioThread || (msgs.length > scrollNMsgs.current && eroInFondo)) el.scrollTop = el.scrollHeight;
        scrollConvRef.current = selConv?.id || null;
        scrollNMsgs.current = msgs.length;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [msgs, selConv?.id]);

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
    const markUnread = (c: Conv) => {
        patchConv(c.id, { unread: 1 }); if (selConv?.id === c.id) setSelConv(null);
        // EML-05: "segna da leggere" toglie \Seen anche in webmail (ultimo msg)
        fetch("/api/email/seen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: c.id, seen: false }) }).catch(() => { });
    };
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
    // il Cestino mostra quante conversazioni contiene (EML-03: "non vedo le
    // mail nel cestino" — il numero sul rail rende subito visibile l'import)
    const trashCount = convs.filter(c => c.trashed).length;
    const counts: Record<FolderId, number> = { inbox: inboxUnread, starred: 0, sent: 0, drafts: drafts.length, spam: spamCount, trash: trashCount };
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
            <TopBar embedded={embedded} onConnect={() => setConnectModal(true)} onManage={() => setManageModal(true)} onRefresh={() => aggiorna()} refreshing={refreshing} search={search} setSearch={setSearch} showSearch />
            {pollErr && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-1.5 shrink-0">{pollErr}</p>}

            {/* selettore casella (se piu' di una) */}
            {visibleAccounts.length > 1 && (
                <div className="flex gap-2 flex-wrap shrink-0">
                    {visibleAccounts.map(a => { const col = coloreCasella(a.id); const un = unreadPerAcc[a.id] || 0; return (
                        <button key={a.id} onClick={() => { setSelAcc(a.id); setSelConv(null); }}
                            className={cn("px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-2", selAcc === a.id ? col.chip : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10")}>
                            <span className={cn("w-2 h-2 rounded-full shrink-0", col.dot)} />
                            {a.display_name || a.email_address}
                            {un > 0 && <span className={cn("min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center", col.badge)}>{un > 99 ? "99+" : un}</span>}
                            {a.status !== "attiva" && <span className="w-2 h-2 rounded-full bg-rose-400" title={a.last_error || "errore"} />}
                        </button>
                    ); })}
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
                    {/* backfill storico in corso (EML-01): indicatore discreto, sparisce da solo a backfill_done */}
                    {selAccObj?.backfill_enabled && !selAccObj?.backfill_done && (
                        <div className="px-4 py-1.5 text-[11px] text-sky-300/80 border-b border-sky-500/15 bg-sky-500/5 shrink-0 flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" /> Storico in importazione: le email più vecchie compaiono man mano.
                        </div>
                    )}

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
                                {msgsTotali > msgs.length && (
                                    <div className="text-center text-[11px] text-slate-500 py-1">
                                        Conversazione lunga: mostrati gli ultimi {msgs.length} messaggi di {msgsTotali}.
                                    </div>
                                )}
                                {msgs.map(m => {
                                    const mine = m.direction === "out";
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
                                            <EmailBody html={m.body_html} text={m.body_text} />
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
            {manageModal && (
                <ManageAccountsModal accounts={visibleAccounts} coloreCasella={coloreCasella} userId={user?.id}
                    onClose={() => setManageModal(false)}
                    onDeleted={(id) => {
                        // reset selezione: l'effect sui visibili ripiega da solo sulla
                        // prima casella rimasta (o sullo stato "nessuna casella")
                        if (selAcc === id) { setSelAcc(null); setSelConv(null); }
                        loadAccounts();
                    }} />
            )}
        </div>
    );
}

// intestazione riusabile (titolo/azioni + ricerca)
function TopBar({ embedded, onConnect, onManage, onRefresh, refreshing, search, setSearch, showSearch }: { embedded: boolean; onConnect: () => void; onManage?: () => void; onRefresh?: () => void; refreshing?: boolean; search?: string; setSearch?: (v: string) => void; showSearch?: boolean }) {
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
                {onManage && (
                    <button onClick={onManage} title="Gestisci caselle (elimina dal CRM)" className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300">
                        <Settings className="w-4 h-4" />
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

// Corpo di un'email. Se c'e' l'HTML lo mostra CON la grafica (tabelle, immagini,
// loghi) dentro un iframe ISOLATO: sandbox SENZA allow-scripts -> nessun javascript
// dell'email viene eseguito e il suo CSS non "sporca" il tema del CRM. I link si
// aprono in una scheda nuova. Piccolo toggle per tornare al testo semplice.
// Prima l'HTML veniva appiattito a testo (tabelle sfasciate, loghi come URL grezzi).
function EmailBody({ html, text }: { html: string | null; text: string | null }) {
    const hasHtml = !!(html && html.trim() && /<[a-z!][\s\S]*>/i.test(html));
    const [showHtml, setShowHtml] = useState(hasHtml);
    const ref = useRef<HTMLIFrameElement | null>(null);
    const plain = (text && text.trim())
        ? text
        : (html ? html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

    const srcDoc = useMemo(() => hasHtml
        ? `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank">`
        + `<style>html,body{margin:0;padding:14px;background:#fff;color:#111;`
        + `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;`
        + `word-break:break-word;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}a{color:#0b66c3}</style>`
        + `</head><body>${html}</body></html>`
        : "", [html, hasHtml]);

    // sandbox senza allow-scripts, ma con allow-same-origin per poter MISURARE
    // l'altezza reale del contenuto e adattare l'iframe (niente doppio scroll).
    const autosize = useCallback(() => {
        const f = ref.current;
        try {
            const doc = f?.contentDocument;
            const h = doc ? Math.max(doc.documentElement?.scrollHeight || 0, doc.body?.scrollHeight || 0) : 0;
            if (f && h > 20) f.style.height = Math.min(h + 4, 6000) + "px";
            else if (f) f.style.height = "600px";   // "quadratone" da 80px mai piu': meglio larghi
        } catch { if (ref.current) ref.current.style.height = "600px"; /* non misurabile */ }
    }, []);

    useEffect(() => {
        if (!showHtml) return;
        // ri-misura dopo il caricamento delle immagini remote (loghi, banner…)
        const t = [setTimeout(autosize, 250), setTimeout(autosize, 1000), setTimeout(autosize, 2500), setTimeout(autosize, 5000)];
        window.addEventListener("resize", autosize);
        return () => { t.forEach(clearTimeout); window.removeEventListener("resize", autosize); };
    }, [showHtml, srcDoc, autosize]);

    if (!hasHtml) {
        return <p className="text-sm text-slate-100 whitespace-pre-wrap break-words leading-relaxed">{plain}</p>;
    }
    return (
        <div>
            <div className="flex justify-end -mt-1 mb-1.5">
                <button onClick={() => setShowHtml(v => !v)} className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1" title={showHtml ? "Mostra solo il testo" : "Mostra la versione con grafica"}>
                    <Code className="w-3 h-3" /> {showHtml ? "Testo semplice" : "Versione grafica"}
                </button>
            </div>
            {showHtml ? (
                <iframe ref={ref} title="Contenuto email" onLoad={autosize}
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                    srcDoc={srcDoc}
                    className="w-full rounded-xl bg-white block" style={{ border: 0, minHeight: 80 }} />
            ) : (
                <p className="text-sm text-slate-100 whitespace-pre-wrap break-words leading-relaxed">{plain}</p>
            )}
        </div>
    );
}

// Modal: gestione caselle (EML-02). Elenco delle caselle visibili con Elimina:
// eliminazione COMPLETA dal CRM (decisione Luca 04/08) — cascade su conversazioni,
// messaggi e bozze. La conferma mostra i CONTEGGI reali e chiarisce che la casella
// sul server di posta NON viene toccata. L'autorizzazione vera sta nella route.
function ManageAccountsModal({ accounts, coloreCasella, userId, onClose, onDeleted }: {
    accounts: Account[];
    coloreCasella: (id: string) => { chip: string; dot: string; badge: string };
    userId?: string;
    onClose: () => void;
    onDeleted: (id: string) => void;
}) {
    const [busyId, setBusyId] = useState<string | null>(null);
    const elimina = async (a: Account) => {
        if (busyId) return;
        setBusyId(a.id);
        try {
            // conteggi reali per la conferma esplicita
            const [conv, msg] = await Promise.all([
                supabase.from("email_conversations").select("id", { count: "exact", head: true }).eq("account_id", a.id),
                supabase.from("email_messages").select("id", { count: "exact", head: true }).eq("account_id", a.id),
            ]);
            const nConv = conv.count ?? 0, nMsg = msg.count ?? 0;
            const nome = a.display_name || a.email_address;
            if (!window.confirm(
                `Eliminare la casella "${nome}" dal CRM?\n\n` +
                `Verranno eliminati ${nMsg} messaggi di ${nConv} conversazioni (bozze e allegati compresi). ` +
                `L'operazione NON si può annullare.\n\n` +
                `La casella reale sul server di posta NON viene toccata: le email restano sul server e in webmail. ` +
                `Ricollegandola in futuro si riparte da zero.`
            )) return;
            const res = await api("/api/email/account", { action: "delete", id: a.id, userId });
            if (res?.error) { alert("Eliminazione non riuscita: " + res.error); return; }
            onDeleted(a.id);
        } finally { setBusyId(null); }
    };
    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="glass-card w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-2 p-4 border-b border-white/10 bg-white/5">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2"><Settings className="w-5 h-5 text-sky-300" /> Gestisci caselle</h3>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {accounts.length === 0 && <p className="text-sm text-slate-500 text-center py-8">Nessuna casella collegata.</p>}
                    {accounts.map(a => {
                        const col = coloreCasella(a.id);
                        return (
                            <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.03]">
                                <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", col.dot)} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-white truncate">{a.display_name || a.email_address}</p>
                                    <p className="text-[11px] text-slate-500 truncate">{a.email_address}{a.negozio ? ` · ${a.negozio}` : ""}</p>
                                    {a.status !== "attiva"
                                        ? <p className="text-[11px] text-rose-300 truncate" title={a.last_error || ""}>In errore{a.last_error ? ` — ${a.last_error}` : ""}</p>
                                        : <p className="text-[11px] text-emerald-300">Attiva</p>}
                                </div>
                                <button onClick={() => elimina(a)} disabled={!!busyId}
                                    title="Elimina la casella dal CRM con tutto lo storico scaricato (la casella sul server non viene toccata)"
                                    className="px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1.5 hover:bg-rose-500/25 disabled:opacity-40 shrink-0">
                                    {busyId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Elimina
                                </button>
                            </div>
                        );
                    })}
                </div>
                <div className="px-4 py-3 border-t border-white/10 text-[11px] text-slate-500">
                    L'eliminazione toglie la casella dal CRM con tutto lo storico scaricato (conversazioni, messaggi, bozze, allegati).
                    La casella reale sul server di posta non viene toccata.
                </div>
            </div>
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
