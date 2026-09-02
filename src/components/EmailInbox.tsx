"use client";

// Inbox Email riusabile (webmail nel CRM), interfaccia in stile Gmail ma in tema
// scuro glassmorphism. Cartelle (Posta in arrivo / Speciali / Inviati / Bozze /
// Spam / Cestino), stella, spam, cestino, archivia, bozze e composizione agganciata
// in basso a destra. Una casella per negozio: IMAP per leggere, SMTP per inviare
// (route /api/email/*). embedded=true -> pensata per stare dentro la pagina Chat.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { caricaTutte } from "@/lib/fetchTutte";
import { useVisibleStores } from "@/lib/visibleStores";
import { emailCaselleVisibili } from "@/lib/emailVisibilita";
import { seesAllStores } from "@/lib/roles";
import { useRolePermissions } from "@/lib/usePermissions";
import { capAllowed, CAP_EMAIL_ADMIN, CAP_EM_UTENTI, CAP_EM_NEGOZI } from "@/lib/capabilities";
import {
    Mail, Plus, Send, X, RefreshCw, Loader2, Paperclip, Check, PenSquare, Inbox,
    Star, Trash2, ShieldAlert, Archive, Search, CornerUpLeft, FileText, SendHorizontal,
    RotateCcw, ChevronLeft, MailOpen, Code, Settings, Ban, Sun, Moon,
} from "lucide-react";
import { cn } from "@/utils";

type Account = { id: string; email_address: string; display_name: string | null; negozio: string | null; owner_user_id: string | null; status: string; last_error?: string | null; backfill_enabled?: boolean; backfill_done?: boolean };
type Conv = { id: string; account_id: string; customer_email: string; customer_name: string | null; client_id: string | null; subject: string | null; last_preview: string | null; last_message_at: string | null; unread: number; starred?: boolean; spam?: boolean; trashed?: boolean; archived?: boolean };
type Msg = { id: string; direction: string; from_addr: string | null; from_name: string | null; to_addrs: string | null; subject: string | null; body_text: string | null; body_html: string | null; attachments: any[]; status: string | null; email_date: string | null; created_at: string };
type Draft = { id: string; account_id: string; to_addr: string | null; subject: string | null; body: string | null; updated_at: string };
type FolderId = "inbox" | "starred" | "sent" | "drafts" | "spam" | "trash" | "nonutili";

const api = (path: string, body: unknown) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
const FOLDERS: { id: FolderId; label: string; icon: any }[] = [
    { id: "inbox", label: "Posta in arrivo", icon: Inbox },
    { id: "starred", label: "Speciali", icon: Star },
    { id: "sent", label: "Inviati", icon: SendHorizontal },
    { id: "drafts", label: "Bozze", icon: FileText },
    { id: "spam", label: "Spam", icon: ShieldAlert },
    { id: "trash", label: "Cestino", icon: Trash2 },
    // «Non utili» (Luca 26/08 sera): i mittenti che QUESTO punto vendita ha
    // segnalato come spam — l'AI cestina le loro prossime email su questa
    // casella; da qui la segnalazione si può ANNULLARE (ripensamento)
    { id: "nonutili", label: "Non utili", icon: Ban },
];

// ── LINGUA VISIVA del restyle (26/08) ──────────────────────────────────────
// Keyframes e micro-classi iniettati con <style> nel componente (stesso
// pattern dell'header di Analisi): cascata d'ingresso delle righe, dock di
// composizione che sale, aurore lente nell'intestazione. Un solo posto, così
// anche la ConnectModal usata dal Pannello Email porta con sé le animazioni.
const MAIL_CSS = `
@keyframes mFadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
@keyframes mFade { from { opacity:0; } to { opacity:1; } }
@keyframes mSlideUp { from { opacity:0; transform:translateY(28px) scale(.98); } to { opacity:1; transform:none; } }
@keyframes mScaleIn { from { opacity:0; transform:scale(.94) translateY(8px); } to { opacity:1; transform:none; } }
@keyframes mAurora { 0% { transform:translate3d(-10%,-6%,0) scale(1); } 50% { transform:translate3d(8%,10%,0) scale(1.18); } 100% { transform:translate3d(-10%,-6%,0) scale(1); } }
@keyframes mFloat { 0%,100% { transform:translateY(0) rotate(3deg); } 50% { transform:translateY(-8px) rotate(-2deg); } }
@keyframes mPing { 0% { box-shadow:0 0 0 0 rgba(244,63,94,.45); } 70% { box-shadow:0 0 0 6px rgba(244,63,94,0); } 100% { box-shadow:0 0 0 0 rgba(244,63,94,0); } }
.mail-in { animation: mFadeUp .45s cubic-bezier(.22,1,.36,1) both; }
.mail-fade { animation: mFade .25s ease-out both; }
.mail-pop { animation: mScaleIn .3s cubic-bezier(.22,1,.36,1) both; }
.mail-dock { animation: mSlideUp .38s cubic-bezier(.22,1,.36,1) both; }
@media (prefers-reduced-motion: reduce) { .mail-in, .mail-fade, .mail-pop, .mail-dock { animation: none; } }
`;

// avatar per MITTENTE: gradiente stabile derivato dall'indirizzo — dà un
// volto colorato alla lista senza foto profilo. Le classi sono scritte per
// esteso (Tailwind le vede) e il testo resta bianco anche col tema chiaro
// (globals tiene bianco il testo sopra i bg-gradient pieni).
const AVATAR_GRADS = [
    "from-sky-500 to-blue-600",
    "from-indigo-500 to-violet-600",
    "from-violet-500 to-fuchsia-600",
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-600",
    "from-rose-500 to-pink-600",
    "from-cyan-500 to-sky-600",
    "from-blue-500 to-indigo-600",
];
const gradFor = (seed: string) => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return AVATAR_GRADS[h % AVATAR_GRADS.length];
};
// iniziali "vere": prima lettera delle prime due parole (o dell'indirizzo)
const iniziali = (s: string) => {
    const parti = String(s || "").trim().split(/[\s._@-]+/).filter(Boolean);
    const ini = ((parti[0]?.[0] || "") + (parti[1]?.[0] || parti[0]?.[1] || "")).toUpperCase();
    return ini || "?";
};

// `senzaLista` (26/08): come su WhatsApp — solo il thread, la lista la porta
// l'Omnichat. Cartelle e caselle restano, che sono funzioni vere.
export function EmailInbox({ embedded = false, componiA = null, apriConvId = null, senzaLista = false, apriComponi = false }: { embedded?: boolean; componiA?: string | null; apriConvId?: string | null; senzaLista?: boolean; apriComponi?: boolean }) {
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
    // GOVERNANCE CASELLE (Luca 26/08): collegare, scollegare ed eliminare le
    // caselle si fa SOLO dal Pannello Email in Amministrazione — qui
    // nell'Inbox quei bottoni li vede solo chi ha le capacità del pannello
    // (default admin/dev). Per tutti gli altri la casella "c'è e basta":
    // leggere, rispondere, archiviare, spam e cestino restano liberi.
    const { perms: emPerms } = useRolePermissions(user?.role, user?.grade, user?.id);
    const puoGestireCaselle = capAllowed(user?.role, CAP_EMAIL_ADMIN.section, CAP_EM_UTENTI, emPerms)
        || capAllowed(user?.role, CAP_EMAIL_ADMIN.section, CAP_EM_NEGOZI, emPerms);

    // composizione (dock in basso a destra, stile Gmail)
    const [composeOpen, setComposeOpen] = useState(false);
    // «Nuova conversazione» → Email dall'Omnichat (Luca 27/08): si apre il
    // compose appena la casella è pronta (il render è già gated su selAcc)
    useEffect(() => { if (apriComponi) setComposeOpen(true); }, [apriComponi]);
    const [cTo, setCTo] = useState(""); const [cSubject, setCSubject] = useState(""); const [cBody, setCBody] = useState("");
    const [cDraftId, setCDraftId] = useState<string | null>(null);

    // VISIBILITÀ — MODELLO WHATSAPP (direttiva Luca 26/08, governance): la
    // casella PERSONALE la vede solo il titolare; la casella di NEGOZIO
    // (senza titolare) la vedono in automatico tutte le persone col negozio
    // in visibilità — esattamente come promette il Pannello Email (prima solo
    // lo store manager la vedeva: il pannello disinformava, rilievo alto del
    // revisore). Resta la decisione Luca 03/08: NIENTE bypass "tutte le
    // caselle" per l'amministrazione — l'admin ispeziona col «Vedi come»
    // o governa dal pannello, la sua Inbox resta pulita.
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
    // casella MULTI-UTENTE (26/08): oltre al titolare (owner_user_id) la
    // vedono i MEMBRI in email_account_users — set dei miei account condivisi
    const [membroDi, setMembroDi] = useState<Set<string>>(new Set());
    useEffect(() => {
        if (!user?.id) return;
        let alive = true;
        const load = () => supabase.from("email_account_users").select("account_id").eq("user_id", user.id)
            .then(({ data }) => { if (alive) setMembroDi(new Set((data || []).map((r: any) => r.account_id))); });
        load(); const t = setInterval(load, 30000);
        return () => { alive = false; clearInterval(t); };
    }, [user?.id]);
    // il campo negozio può essere MULTI ("Magliana W3, Magliana Multi" —
    // gemelli con una casella sola, come i numeri WhatsApp): matchNegozi.
    // L'AMMINISTRAZIONE vede TUTTE le caselle (direttiva Luca 26/08 sera,
    // «come vedo tutti i numeri WhatsApp» — supera la scelta del 03/08: da
    // oggi le email si lavorano SOLO nel CRM, la regia serve completa)
    // la regola vive in lib/emailVisibilita: la Chat Omnicanale usa LA STESSA
    // funzione, non una copia (26/08 — su queste tabelle non c'è RLS, e due
    // copie della regola sono il modo in cui una delle due torna a perdere)
    const visibleAccounts = useMemo(() =>
        emailCaselleVisibili(accounts, user?.id, user?.role, myStores, membroDi),
    [accounts, user?.id, user?.role, myStores, membroDi]);

    // DEEP-LINK /chat?mconv=<id> (26/08, widget Email del team): apre LA
    // conversazione esatta. Tre lezioni del revisore (rilievi A2+M5): ① si
    // apre SOLO quando visibleAccounts contiene la casella (mai side-effect
    // su posta non apribile: l'admin dal widget vede tutte, la sua Inbox no);
    // ② l'effect «cambio cartella/casella → chiudi thread» va scavalcato UNA
    // volta col ref, sennò richiude il thread appena aperto (e l'apertura
    // fantasma bruciava pure l'unread per tutti); ③ il ref si brucia solo ad
    // apertura riuscita o id inesistente — mai su visibilità in ritardo.
    const _mconvFatto = useRef<string | null>(null);
    const _skipChiusura = useRef(false);
    useEffect(() => {
        if (!apriConvId || _mconvFatto.current === apriConvId) return;
        if (!visibleAccounts.length) return;               // visibilità non pronta
        (async () => {
            const { data: c } = await supabase.from("email_conversations").select("*").eq("id", apriConvId).maybeSingle();
            if (!c) { _mconvFatto.current = apriConvId; return; }
            if (!visibleAccounts.some(a => a.id === c.account_id)) return;   // non mia (o non ancora): niente apertura cieca
            _mconvFatto.current = apriConvId;
            _skipChiusura.current = true;
            setSelAcc(c.account_id);
            setFolder(c.trashed ? "trash" : c.spam ? "spam" : "inbox");
            setSelConv(c as Conv);
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apriConvId, visibleAccounts.map(a => a.id).join("|")]);

    // REGOLE «NON UTILE» della casella corrente (26/08 sera): i mittenti
    // segnalati dal punto vendita — elencati nella sezione «Non utili» con
    // l'Annulla per i ripensamenti
    const [regoleCasella, setRegoleCasella] = useState<{ id: string; mittente: string; creato_il: string; annullata_il: string | null }[]>([]);
    const caricaRegoleCasella = useCallback(() => {
        if (!selAcc) { setRegoleCasella([]); return; }
        supabase.from("email_regole_utente")
            .select("id, mittente, creato_il, annullata_il")
            .eq("account_id", selAcc).order("creato_il", { ascending: false })
            .then(({ data }) => setRegoleCasella((data ?? []) as any));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selAcc]);
    useEffect(() => { caricaRegoleCasella(); }, [caricaRegoleCasella]);
    const annullaRegola = async (r: { id: string }) => {
        await supabase.from("email_regole_utente")
            .update({ annullata_il: new Date().toISOString(), annullata_da: user?.id || null }).eq("id", r.id);
        caricaRegoleCasella();
    };

    // PRIORITÀ del triage AI per conversazione (Luca 26/08 sera: «i pallini
    // in linea con la priorità»): rispondere → badge ROSSO, da_leggere →
    // AMBRA, il resto resta blu. Si carica per le conversazioni correnti.
    const [triStati, setTriStati] = useState<Record<string, string>>({});
    useEffect(() => {
        let alive = true;
        (async () => {
            const ids = convs.map(c => c.id);
            if (!ids.length) { if (alive) setTriStati({}); return; }
            const m: Record<string, string> = {};
            for (let b = 0; b < ids.length; b += 100) {
                const { data } = await supabase.from("email_triage")
                    .select("conversation_id, stato").in("conversation_id", ids.slice(b, b + 100));
                (data || []).forEach((r: any) => { m[r.conversation_id] = r.stato; });
            }
            if (alive) setTriStati(m);
        })();
        return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [convs.map(c => c.id).join("|")]);
    const badgePriorita = (c: Conv) =>
        triStati[c.id] === "rispondere" ? "bg-rose-500" : triStati[c.id] === "da_leggere" ? "bg-amber-500" : "bg-sky-500";

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
    const aggiorna = async (accId?: string, force = false) => {
        const id = accId || selAcc; if (!id) return;
        setRefreshing(true);
        try {
            await api("/api/email/poll", { accountId: id, force });
            setPollErr(null);
        } catch (e) {
            // prima l'errore veniva INGHIOTTITO e "la posta non si aggiornava
            // a tratti" senza spiegazioni (Luca 02/08): un retry e poi si dice
            try { await api("/api/email/poll", { accountId: id, force }); setPollErr(null); }
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
        /* ⚠️ GLI ALLEGATI RESTANO NELLA LORO CONVERSAZIONE. Senza questa riga,
           chi allegava un documento a una risposta, non inviava e passava a un
           altro cliente, glielo spediva: la striscia sta sotto la casella di
           testo e sembra parte del thread aperto. */
        setAllegRisposta([]);
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
    useEffect(() => {
        // il deep-link imposta cartella+casella+thread nello stesso batch:
        // senza questo skip l'effect richiudeva il thread appena aperto
        if (_skipChiusura.current) { _skipChiusura.current = false; return; }
        setSelConv(null);
    }, [folder, selAcc]);

    // ── azioni sulle conversazioni (aggiornamento ottimistico + DB) ────────────
    const patchConv = async (id: string, patch: Partial<Conv>) => {
        setConvs(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c));
        setSelConv(sc => sc && sc.id === id ? { ...sc, ...patch } : sc);
        await supabase.from("email_conversations").update(patch).eq("id", id);
    };
    const toggleStar = (c: Conv, e?: React.MouseEvent) => { e?.stopPropagation(); patchConv(c.id, { starred: !c.starred }); };
    const doArchive = (c: Conv) => { patchConv(c.id, { archived: true }); if (selConv?.id === c.id) setSelConv(null); };
    const doTrash = (c: Conv) => { patchConv(c.id, { trashed: true }); if (selConv?.id === c.id) setSelConv(null); };
    // «Segna come spam» = anche SEGNALAZIONE all'AI (Luca 26/08 sera): il
    // mittente entra nelle regole di questa casella e le sue prossime email
    // vengono cestinate in automatico; «Non è spam» annulla la regola.
    // L'elenco (con Annulla) sta nella sezione «Non utili» del rail.
    /** LO STORICO DI QUEL MITTENTE, SUBITO NEL CESTINO (Luca 27/08: «nel
     *  momento in cui metto un'email dentro i non utili parte immediatamente a
     *  fare un check di tutte le email di quell'indirizzo su quell'account,
     *  portando nel cestino quelle collegate»). Prima l'unico effetto era
     *  svegliare il motore: che ripassava sì tutto lo storico, ma facendo
     *  giudicare ogni mail all'AI — e sulle fatture l'AI le graziava.
     *  Qui non si giudica niente: l'ha deciso una persona.
     *  Restano fuori solo le stellate (un altro giudizio umano). */
    const cestinaStoricoMittente = async (accountId: string, mittente: string): Promise<number> => {
        const { data: conv } = await supabase.from("email_conversations")
            .select("id, starred, trashed").eq("account_id", accountId)
            .ilike("customer_email", mittente).limit(500);
        const cand = (conv || []).filter((x: any) => !x.trashed && !x.starred).map((x: any) => x.id as string);
        if (!cand.length) return 0;
        // il ripristino di un admin non si scavalca mai
        const stop = new Set<string>();
        for (let i = 0; i < cand.length; i += 100) {
            const { data } = await supabase.from("email_triage").select("conversation_id")
                .in("conversation_id", cand.slice(i, i + 100)).not("ripristinata_il", "is", null);
            (data || []).forEach((r: any) => stop.add(r.conversation_id));
        }
        const ids = cand.filter(id => !stop.has(id));
        for (let i = 0; i < ids.length; i += 100) {
            await supabase.from("email_conversations")
                .update({ trashed: true, spam: false }).in("id", ids.slice(i, i + 100));
        }
        return ids.length;
    };

    const doSpam = (c: Conv, val: boolean) => {
        patchConv(c.id, { spam: val });
        if (val && selConv?.id === c.id) setSelConv(null);
        const mittente = String(c.customer_email || "").toLowerCase();
        if (!mittente || !c.account_id) return;
        if (val) {
            supabase.from("email_regole_utente")
                .upsert({ account_id: c.account_id, mittente, creato_da: user?.id || null, annullata_il: null, annullata_da: null }, { onConflict: "account_id,mittente" })
                .then(async () => {
                    caricaRegoleCasella();
                    // PRIMA il cestino dello storico (immediato, deterministico),
                    // POI il motore per quelle che arriveranno
                    try { await cestinaStoricoMittente(c.account_id as string, mittente); } catch { }
                    await aggiorna(undefined, true);
                    fetch("/api/email/triage", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => { });
                });
        } else {
            supabase.from("email_regole_utente")
                .update({ annullata_il: new Date().toISOString(), annullata_da: user?.id || null })
                .eq("account_id", c.account_id).eq("mittente", mittente)
                .then(() => caricaRegoleCasella());
        }
    };
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
    const openNewCompose = () => { setCTo(""); setCSubject(""); setCBody(""); setCDraftId(null); setAllegCompose([]); setComposeOpen(true); };
    const openDraft = (d: Draft) => { setCTo(d.to_addr || ""); setCSubject(d.subject || ""); setCBody(d.body || ""); setCDraftId(d.id); setAllegCompose([]); setComposeOpen(true); };
    const saveDraft = async (silent = false) => {
        if (!selAcc) return;
        if (!cTo.trim() && !cSubject.trim() && !cBody.trim()) return;
        const payload: any = { account_id: selAcc, to_addr: cTo.trim() || null, subject: cSubject.trim() || null, body: cBody || null, updated_at: new Date().toISOString() };
        if (cDraftId) { await supabase.from("email_drafts").update(payload).eq("id", cDraftId); }
        else { const { data } = await supabase.from("email_drafts").insert(payload).select("id").single(); if (data) setCDraftId(data.id); }
        if (!silent) loadDrafts();
    };
    const closeCompose = async () => { await saveDraft(true); setComposeOpen(false); loadDrafts(); };
    const discardCompose = async () => { if (cDraftId) await supabase.from("email_drafts").delete().eq("id", cDraftId); setComposeOpen(false); setCTo(""); setCSubject(""); setCBody(""); setCDraftId(null); setAllegCompose([]); loadDrafts(); };
    const sendCompose = async () => {
        try { setTimeout(() => window.dispatchEvent(new Event("tf-omni-refresh")), 1500); } catch { /* lista omni non montata */ }
        if (!cTo.trim() || !cBody.trim() || !selAcc || sending) return;
        setSending(true);
        let res: { error?: string } | null = null;
        try {
            res = await api("/api/email/send", { accountId: selAcc, to: cTo.trim(), subject: cSubject.trim(), text: cBody.trim(), userId: user?.id, allegati: allegCompose.map(({ path, nome, mime, size }) => ({ path, nome, mime, size })) });
        } catch {
            setSending(false);
            alert("Invio non riuscito: la risposta del server non è arrivata. Se l'allegato è grande, riprova con un file più leggero.");
            return;
        }
        setSending(false);
        if (res?.error) { alert("Invio non riuscito: " + res.error); return; }
        if (cDraftId) await supabase.from("email_drafts").delete().eq("id", cDraftId);
        setComposeOpen(false); setCTo(""); setCSubject(""); setCBody(""); setCDraftId(null); setAllegCompose([]);
        loadDrafts();
    };

    /* ═══ GLI ALLEGATI ════════════════════════════════════════════════════
       Il file NON viaggia dentro il JSON della rotta: lo carica il browser
       dritto sul deposito e alla rotta va solo il percorso. È il modello che
       già usa WhatsApp, e il motivo è misurato: nginx davanti al CRM accetta
       richieste da 1 MB, il base64 gonfia di un terzo, e quello che vede il
       negozio è «Unexpected token '<'» — la pagina d'errore del proxy letta
       come risposta.

       ⚠️ E si parcheggiano sotto «bozze/<utente>/»: il permesso di aprire un
       file lo decide la CARTELLA, che deve essere la conversazione — e in
       composizione nuova la conversazione non esiste ancora quando si sceglie
       il file. Al momento dell'invio è il server a spostarli al posto giusto. */
    type Alleg = { path: string; nome: string; mime?: string; size?: number; su?: boolean };
    /* ⚠️ GLI ALLEGATI APPARTENGONO A QUELLA FINESTRA, e a nessun'altra
       (revisore 02/09). Non azzerandoli, il negozio che allega la carta
       d'identità del cliente A, non invia, e passa alla conversazione del
       cliente B, gliela spedisce — la striscia sta sotto la casella di testo
       e sembra parte del thread aperto. Nessuna malizia, succede da solo al
       primo giorno d'uso. */
    const [allegRisposta, setAllegRisposta] = useState<Alleg[]>([]);
    const [allegCompose, setAllegCompose] = useState<Alleg[]>([]);
    const [caricandoAlleg, setCaricandoAlleg] = useState(false);
    const MAX_ALLEG = 20 * 1024 * 1024;

    const caricaAllegati = async (files: FileList | null, dove: "risposta" | "compose") => {
        if (!files || !files.length || !user?.id || caricandoAlleg) return;
        const attuali = dove === "risposta" ? allegRisposta : allegCompose;
        const gia = attuali.reduce((n, a) => n + (a.size || 0), 0);
        const nuovi = [...files].reduce((n, f) => n + f.size, 0);
        if (gia + nuovi > MAX_ALLEG) {
            alert(`Gli allegati non possono superare i 20 MB in tutto: questi arriverebbero a ${((gia + nuovi) / 1048576).toFixed(1)} MB.\n\nMandane meno per volta, oppure manda un link.`);
            return;
        }
        setCaricandoAlleg(true);
        const messi: Alleg[] = [];
        for (const f of [...files]) {
            const nome = f.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
            const path = `bozze/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${nome}`;
            /* ⚠️ NIENTE `upsert: true`. Dal 31/08 i depositi sono chiusi: per
               fare «se c'è già aggiorna» il deposito deve LEGGERE la riga, e
               la lettura diretta non esiste più — è l'errore che Veronica ha
               visto su WhatsApp il 02/09. Il percorso ha già l'istante dentro:
               un doppione non può esistere. */
            const { error } = await supabase.storage.from("email-attachments").upload(path, f, { contentType: f.type || undefined });
            if (error) { alert(`«${f.name}» non è stato caricato: ${error.message}`); continue; }
            messi.push({ path, nome: f.name, mime: f.type || undefined, size: f.size });
        }
        if (dove === "risposta") setAllegRisposta((p) => [...p, ...messi]);
        else setAllegCompose((p) => [...p, ...messi]);
        setCaricandoAlleg(false);
    };

    const togliAllegato = async (a: Alleg, dove: "risposta" | "compose") => {
        /* ⚠️ SI CANCELLA DAL CUSTODE, non con `storage.remove()`. Dal browser
           quella chiamata non cancella niente e non protesta: senza il
           permesso di LEGGERE il deposito la DELETE non vede la riga e
           risponde «fatto» con zero righe toccate. È scritto in `fileUrl.ts`
           — «sedici punti del CRM ci sono cascati in silenzio» — e ci ero
           cascato anch'io. Il segno: `qr-uploads`, che ha la stessa policy,
           ha 536 file mai cancellati. */
        const { eliminaFile } = await import("@/lib/fileUrl");
        const r = await eliminaFile("email-attachments", a.path);
        if (!r.ok) console.error("[email] allegato non cancellato:", a.path, r.errore);
        if (dove === "risposta") setAllegRisposta((p) => p.filter((x) => x.path !== a.path));
        else setAllegCompose((p) => p.filter((x) => x.path !== a.path));
    };


    /* la striscia sotto al testo: quello che sto per mandare, con la x per
       toglierlo. Il nome per intero, non troncato: chi allega tre PDF simili
       deve poter capire quale ha sbagliato. */
    const StrisciaAllegati = ({ lista, dove }: { lista: Alleg[]; dove: "risposta" | "compose" }) => (
        lista.length ? (
            <div className="flex flex-wrap gap-1.5 px-1 pb-1.5">
                {lista.map((a) => (
                    <span key={a.path} className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-lg bg-sky-500/10 border border-sky-500/25 text-[11px] text-sky-200">
                        <Paperclip className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[220px]" title={a.nome}>{a.nome}</span>
                        <span className="text-slate-500 shrink-0">{a.size ? (a.size > 1048576 ? (a.size / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(a.size / 1024)) + " KB") : ""}</span>
                        <button type="button" onClick={() => togliAllegato(a, dove)} className="text-slate-400 hover:text-rose-300 shrink-0" title="Togli">✕</button>
                    </span>
                ))}
            </div>
        ) : null
    );

    const rispondi = async () => {
        if (!selConv || !text.trim() || sending) return;
        setSending(true);
        /* ⚠️ `finally`, e non una riga dopo l'await. Se il proxy risponde con
           una pagina HTML — un invio pesante che va in timeout — `r.json()`
           lancia, l'eccezione esce dalla funzione e `sending` resta acceso:
           il pulsante Invia diventa grigio per sempre, senza un messaggio. */
        try {
            const res = await api("/api/email/send", { conversationId: selConv.id, text: text.trim(), userId: user?.id, allegati: allegRisposta.map(({ path, nome, mime, size }) => ({ path, nome, mime, size })) });
            if (res?.error) alert("Invio non riuscito: " + res.error); else { setText(""); setAllegRisposta([]); }
        } catch {
            alert("Invio non riuscito: la risposta del server non è arrivata. Se l'allegato è grande, riprova con un file più leggero.");
        } finally { setSending(false); }
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
            case "nonutili": return [];   // vista dedicata: elenco regole, non conversazioni
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
    const counts: Record<FolderId, number> = { inbox: inboxUnread, starred: 0, sent: 0, drafts: drafts.length, spam: spamCount, trash: trashCount, nonutili: regoleCasella.filter(r => !r.annullata_il).length };
    const folderLabel = FOLDERS.find(f => f.id === folder)?.label || "";
    // icona della cartella corrente per l'intestazione della lista (solo resa)
    const FolderIcon = FOLDERS.find(f => f.id === folder)?.icon || Inbox;

    // ── stati "vuoto" ───────────────────────────────────────────────────────────
    if (visibleAccounts.length === 0) {
        return (
            <div className={embedded ? "h-full flex flex-col gap-3 p-3 sm:p-4 overflow-hidden" : "w-full max-w-7xl mx-auto space-y-4"}>
                <style>{MAIL_CSS}</style>
                <TopBar embedded={embedded} onConnect={puoGestireCaselle ? () => setConnectModal(true) : undefined} />
                <div className={cn("glass-panel shadow-lg mail-in relative overflow-hidden p-12 text-center", embedded && "flex-1 flex flex-col items-center justify-center")}>
                    <div className="pointer-events-none absolute -top-24 right-8 w-80 h-80 rounded-full opacity-15 blur-3xl" style={{ background: "radial-gradient(circle, var(--tf-38bdf8), transparent 65%)", animation: "mAurora 18s ease-in-out infinite" }} />
                    <div className="relative flex flex-col items-center gap-4">
                        <div className="relative">
                            <div className="absolute inset-0 rounded-full bg-sky-500/20 blur-2xl scale-150" />
                            <div className="relative w-20 h-20 rounded-[28px] bg-gradient-to-br from-sky-500/20 to-indigo-500/10 border border-white/10 flex items-center justify-center shadow-xl" style={{ animation: "mFloat 5s ease-in-out infinite" }}>
                                <Inbox className="w-9 h-9 text-sky-300" />
                            </div>
                        </div>
                        <div className="text-sm text-slate-400 max-w-md leading-relaxed">
                            {puoGestireCaselle
                                ? <>Nessuna casella collegata. Premi <b className="text-sky-300">Collega email</b> e inserisci indirizzo e password della casella del negozio.</>
                                : <>Nessuna casella email collegata per te. Le caselle le assegna l&apos;amministrazione dal pannello Email: chiedi lì se te ne serve una.</>}
                        </div>
                    </div>
                </div>
                {connectModal && puoGestireCaselle && <ConnectModal onClose={() => { setConnectModal(false); loadAccounts(); }} ownerUserId={user?.id} negozio={user?.negozio} userId={user?.id} />}
            </div>
        );
    }

    return (
        <div className={embedded ? "h-full flex flex-col gap-3 p-3 sm:p-4 overflow-hidden" : "w-full max-w-7xl mx-auto space-y-4"}>
            <style>{MAIL_CSS}</style>
            {/* Nell'OMNICHAT la colonna centrale è SOLO la mail aperta (Luca
                27/08): niente barra di ricerca, niente «Collega email», niente
                pillole delle caselle e niente cartelle. Quella roba è della
                scheda Email — qui ruba lo spazio al messaggio, che diventa un
                francobollo in mezzo allo schermo. */}
            {!senzaLista && <TopBar embedded={embedded} onConnect={puoGestireCaselle ? () => setConnectModal(true) : undefined} onManage={puoGestireCaselle ? () => setManageModal(true) : undefined} onRefresh={() => aggiorna(undefined, true)} refreshing={refreshing} search={search} setSearch={setSearch} showSearch />}
            {pollErr && (
                <p className="mail-in text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3.5 py-2 shrink-0 flex items-center gap-2">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" /> {pollErr}
                </p>
            )}

            {/* selettore casella (se piu' di una): pillole col colore della casella,
                badge non-letti e spia rossa se la casella è in errore */}
            {!senzaLista && visibleAccounts.length > 1 && (
                <div className="mail-in flex gap-2 flex-wrap shrink-0">
                    {visibleAccounts.map(a => { const col = coloreCasella(a.id); const un = unreadPerAcc[a.id] || 0; const attiva = selAcc === a.id; return (
                        <button key={a.id} onClick={() => { setSelAcc(a.id); setSelConv(null); }}
                            className={cn("px-3.5 py-2 rounded-full text-xs font-bold border flex items-center gap-2 transition-all duration-200 active:scale-95",
                                attiva ? cn(col.chip, "shadow-lg shadow-black/20") : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20 hover:-translate-y-0.5")}>
                            <span className={cn("w-2 h-2 rounded-full shrink-0 transition-transform duration-200", col.dot, attiva && "scale-125")} />
                            {a.display_name || a.email_address}
                            {un > 0 && <span className={cn("min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center", col.badge)}>{un > 99 ? "99+" : un}</span>}
                            {a.status !== "attiva" && <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" title={a.last_error || "errore"} />}
                        </button>
                    ); })}
                </div>
            )}

            <div className={cn("grid grid-cols-1 gap-3", senzaLista ? "lg:grid-cols-1" : "lg:grid-cols-[196px_minmax(300px,360px)_1fr]", embedded ? "flex-1 min-h-0" : "h-[calc(100vh-264px)] min-h-[480px]")}>
                {/* ── RAIL cartelle ── (nell'Omnichat non c'è: si sta leggendo
                    UNA conversazione, non si naviga fra le cartelle) */}
                <div className={cn("glass-panel shadow-lg p-3 flex flex-col gap-2", selConv && "hidden lg:flex", senzaLista && "hidden lg:hidden")}>
                    <button onClick={openNewCompose}
                        className="group w-full mb-1 px-4 py-3 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-sky-500/30 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/40 hover:-translate-y-0.5 active:scale-[0.97]">
                        <PenSquare className="w-4 h-4 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" /> Scrivi
                    </button>
                    <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
                        {FOLDERS.map((f, i) => {
                            const Icon = f.icon; const active = folder === f.id; const n = counts[f.id];
                            return (
                                <button key={f.id} onClick={() => setFolder(f.id)}
                                    className={cn("mail-in relative shrink-0 lg:w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-200 group/f",
                                        active ? "bg-sky-500/15 text-sky-200 border border-sky-500/30" : "text-slate-300 hover:bg-white/5 hover:text-white border border-transparent")}
                                    style={{ animationDelay: `${i * 35}ms` }}>
                                    {/* linguetta luminosa: segnaposto della cartella attiva */}
                                    <span className={cn("hidden lg:block absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-sky-400 transition-all duration-300", active ? "h-5 opacity-100" : "h-0 opacity-0")} />
                                    <Icon className={cn("w-4 h-4 shrink-0 transition-transform duration-200", active ? "text-sky-300" : "text-slate-400 group-hover/f:scale-110")} />
                                    <span className="truncate flex-1 text-left">{f.label}</span>
                                    {n > 0 && <span className={cn("text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0 transition-colors", f.id === "spam" ? "bg-rose-500/80 text-white" : active ? "bg-sky-400 text-slate-900" : "bg-white/10 text-slate-300")}>{n}</span>}
                                </button>
                            );
                        })}
                    </nav>
                    {/* LEGENDA dei pallini a priorità (richiesta Luca 26/08 sera,
                        con screenshot del rail): cosa significa il colore */}
                    <div className="hidden lg:block mt-auto mb-1 px-2.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/5 space-y-1.5">
                        <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-0.5">I colori dei pallini</div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0 shadow-[0_0_6px_rgba(244,63,94,.6)]" /> aspetta una risposta</div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 shadow-[0_0_6px_rgba(245,158,11,.5)]" /> da leggere</div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400"><span className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0 shadow-[0_0_6px_rgba(14,165,233,.5)]" /> non letta, senza fretta</div>
                    </div>
                    {selAccObj && (
                        <div className="pt-2 border-t border-white/5 flex items-center gap-1.5 px-1 min-w-0">
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", selAccObj.status === "attiva" ? "bg-emerald-400" : "bg-rose-400")} />
                            <span className="text-[10px] text-slate-500 truncate" title={selAccObj.email_address}>{selAccObj.email_address}</span>
                        </div>
                    )}
                </div>

                {/* ── LISTA ── (nell'Omnichat la porta la colonna unificata) */}
                <div className={cn("glass-panel shadow-lg overflow-hidden flex flex-col min-h-0", selConv && "hidden lg:flex", senzaLista && "hidden lg:hidden")}>
                    <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between shrink-0">
                        <span className="text-sm font-bold text-white flex items-center gap-2">
                            <FolderIcon className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                            {folderLabel}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 bg-white/5 border border-white/10 rounded-full px-2 py-0.5 tabular-nums">{folder === "drafts" ? draftsShown.length : folder === "nonutili" ? regoleCasella.length : shown.length}</span>
                    </div>
                    {selAccObj?.status !== "attiva" && (
                        <div className="mail-in px-4 py-2.5 text-xs text-rose-300 border-b border-rose-500/20 bg-rose-500/5 shrink-0 flex items-center gap-2">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                            <span>Casella in errore — {selAccObj?.last_error || "ricollega dalle impostazioni"}.</span>
                        </div>
                    )}
                    {/* backfill storico in corso (EML-01): indicatore discreto, sparisce da solo a backfill_done */}
                    {selAccObj?.backfill_enabled && !selAccObj?.backfill_done && (
                        <div className="px-4 py-1.5 text-[11px] text-sky-300/80 border-b border-sky-500/15 bg-sky-500/5 shrink-0 flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" /> Storico in importazione: le email più vecchie compaiono man mano.
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto">
                        {folder === "nonutili" ? (
                            /* ── NON UTILI: i mittenti segnalati da questa casella —
                               l'AI cestina le loro prossime email; Annulla = ripensamento ── */
                            regoleCasella.length === 0 ? (
                                <EmptyList icon={Ban} title="Nessun mittente segnalato" label="Quando segni una email come Spam, il mittente finisce qui e le sue prossime email vanno nel cestino da sole." />
                            ) : (
                                <>
                                    <div className="mail-in px-4 py-2.5 text-[11px] text-slate-400 leading-relaxed border-b border-white/5 bg-white/[0.02]">Le prossime email di questi mittenti vengono cestinate in automatico su questa casella. Ci hai ripensato? Annulla la segnalazione.</div>
                                    {regoleCasella.map((r, i) => (
                                        <div key={r.id} className={cn("mail-in px-4 py-3 border-b border-white/5 flex items-center gap-3 transition-colors hover:bg-white/[0.02]", r.annullata_il && "opacity-50")} style={{ animationDelay: `${Math.min(i, 12) * 26}ms` }}>
                                            <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-md", r.annullata_il ? "bg-white/5 border border-white/10 text-slate-500" : "bg-gradient-to-br from-rose-500 to-red-600 text-white")}><Ban className="w-4 h-4" /></div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-semibold text-slate-200 truncate">{r.mittente}</div>
                                                <div className="text-[11px] text-slate-500">{r.annullata_il ? "segnalazione annullata — torna al filtro normale" : `segnalato il ${new Date(r.creato_il).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })} · le sue email vanno nel cestino`}</div>
                                            </div>
                                            {!r.annullata_il && (
                                                <button onClick={() => annullaRegola(r)}
                                                    className="shrink-0 px-3 py-1.5 rounded-full border border-white/10 text-[12px] font-bold text-slate-300 hover:bg-white/10 hover:text-white hover:border-white/25 inline-flex items-center gap-1.5 transition-all active:scale-95">
                                                    <RotateCcw className="w-3.5 h-3.5" /> Annulla
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </>
                            )
                        ) : folder === "drafts" ? (
                            draftsShown.length === 0 ? <EmptyList icon={FileText} title="Nessuna bozza" label="Le email lasciate a metà ti aspettano qui, al sicuro." />
                                : draftsShown.map((d, i) => (
                                    <button key={d.id} onClick={() => openDraft(d)}
                                        className="mail-in w-full text-left px-4 py-2.5 border-b border-white/5 hover:bg-amber-500/[0.04] flex items-center gap-2.5 group transition-colors duration-150"
                                        style={{ animationDelay: `${Math.min(i, 12) * 26}ms` }}>
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shrink-0 shadow-md"><FileText className="w-4 h-4" /></div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-semibold text-amber-300/90 truncate">Bozza · {d.to_addr || "senza destinatario"}</span>
                                                <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">{fmtOra(d.updated_at)}</span>
                                            </div>
                                            <div className="text-xs text-slate-300 truncate">{d.subject || "(senza oggetto)"}</div>
                                            <div className="text-xs text-slate-500 truncate">{(d.body || "").replace(/\s+/g, " ").trim() || "…"}</div>
                                        </div>
                                        <span onClick={(e) => { e.stopPropagation(); supabase.from("email_drafts").delete().eq("id", d.id).then(() => loadDrafts()); }} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 shrink-0 transition-all" title="Elimina bozza"><Trash2 className="w-4 h-4" /></span>
                                    </button>
                                ))
                        ) : shown.length === 0 ? (
                            folder === "inbox"
                                ? <EmptyList icon={Inbox} title="Tutto tranquillo" label="Nessuna email qui. Premi ↻ in alto per scaricare la posta nuova." />
                                : folder === "trash" ? <EmptyList icon={Trash2} title="Cestino vuoto" label="Quello che butti finisce qui, recuperabile finché vuoi." />
                                : folder === "spam" ? <EmptyList icon={ShieldAlert} title="Niente spam" label="Le email sospette finiscono qui da sole. Per ora, aria pulita." />
                                : folder === "starred" ? <EmptyList icon={Star} title="Nessuna speciale" label="Tocca la stellina su una email per ritrovarla qui al volo." />
                                : <EmptyList icon={SendHorizontal} title="Niente qui" label="Le email che invii compaiono in questa cartella." />
                        ) : shown.map((c, i) => {
                            const aperta = selConv?.id === c.id;
                            const nonLetta = c.unread > 0;
                            return (
                                <div key={`${folder}:${c.id}`} onClick={() => setSelConv(c)}
                                    className={cn("mail-in relative w-full cursor-pointer pl-3.5 pr-3 py-2.5 border-b border-white/5 flex items-center gap-2.5 group transition-colors duration-150",
                                        aperta ? "bg-sky-500/[0.08]" : nonLetta ? "bg-sky-500/[0.04] hover:bg-sky-500/[0.07]" : "hover:bg-white/[0.04]")}
                                    style={{ animationDelay: `${Math.min(i, 12) * 26}ms` }}>
                                    {/* filo luminoso a sinistra: acceso se non letta, pieno se aperta */}
                                    <span className={cn("absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all duration-300", aperta ? "h-3/4 bg-sky-400" : nonLetta ? "h-1/2 bg-sky-400/70" : "h-0 bg-transparent")} />
                                    <button onClick={(e) => toggleStar(c, e)} className="p-0.5 shrink-0 transition-transform duration-150 hover:scale-125 active:scale-95" title={c.starred ? "Togli speciale" : "Segna come speciale"}>
                                        <Star className={cn("w-4 h-4 transition-colors", c.starred ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,.5)]" : "text-slate-600 hover:text-slate-300")} />
                                    </button>
                                    <div className={cn("w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center text-[11px] font-bold text-white shrink-0 shadow-md transition-transform duration-200 group-hover:scale-105", gradFor(c.customer_email || c.id), nonLetta ? "ring-2 ring-sky-400/40" : "opacity-80 saturate-[.85]")}>{iniziali(nomeConv(c))}</div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className={cn("text-sm truncate", nonLetta ? "font-bold text-white" : "font-semibold text-slate-200")}>{nomeConv(c)}</span>
                                            <span className={cn("text-[10px] shrink-0 tabular-nums", nonLetta ? "text-sky-300 font-semibold" : "text-slate-500")}>{fmtOra(c.last_message_at)}</span>
                                        </div>
                                        <div className={cn("text-xs truncate", nonLetta ? "text-slate-100 font-medium" : "text-slate-400")}>{c.subject || "(senza oggetto)"}</div>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs text-slate-500 truncate">{c.last_preview || ""}</span>
                                            {/* pallino a PRIORITÀ del triage: rosso = cliente aspetta
                                                noi (pulsa piano), ambra = informativa da leggere, blu = il resto */}
                                            {nonLetta && <span className={cn("text-[10px] font-bold text-white rounded-full px-1.5 shrink-0", badgePriorita(c), triStati[c.id] === "rispondere" && "animate-[mPing_2s_ease-out_infinite]")} title={triStati[c.id] === "rispondere" ? "Il mittente aspetta una risposta" : triStati[c.id] === "da_leggere" ? "Informativa da leggere" : undefined}>{c.unread}</span>}
                                        </div>
                                    </div>
                                    {/* azioni rapide al hover: pillola sospesa sul lato destro,
                                        stile Gmail — non ruba larghezza alla riga compatta */}
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex mail-pop items-center gap-0.5 rounded-full border border-white/10 bg-slate-900/90 backdrop-blur-md px-1 py-0.5 shadow-xl shadow-black/30">
                                        {folder === "trash" ? (
                                            <>
                                                <IconBtn title="Ripristina" onClick={(e) => { e.stopPropagation(); doRestore(c); }}><RotateCcw className="w-3.5 h-3.5" /></IconBtn>
                                                {/* elimina-per-sempre: solo chi governa le caselle (26/08) — il cestino basta a tutti gli altri */}
                                                {puoGestireCaselle && <IconBtn title="Elimina definitivamente" danger onClick={(e) => { e.stopPropagation(); if (confirm("Eliminare definitivamente questa conversazione?")) deleteForever(c); }}><Trash2 className="w-3.5 h-3.5" /></IconBtn>}
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
                            );
                        })}
                    </div>
                </div>

                {/* ── LETTURA thread ── */}
                <div className={cn("glass-panel shadow-lg flex flex-col min-h-0 overflow-hidden", !selConv && "hidden lg:flex")}>
                    {!selConv ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
                            <div className="relative mail-pop">
                                <div className="absolute inset-0 rounded-full bg-sky-500/15 blur-3xl scale-[2]" />
                                <div className="relative w-20 h-20 rounded-[28px] bg-gradient-to-br from-sky-500/15 to-indigo-500/10 border border-white/10 flex items-center justify-center shadow-xl" style={{ animation: "mFloat 5s ease-in-out infinite" }}>
                                    <MailOpen className="w-9 h-9 text-sky-300" />
                                </div>
                            </div>
                            <div className="mail-in" style={{ animationDelay: "80ms" }}>
                                <p className="text-sm font-bold text-slate-300">La tua posta, con calma</p>
                                <p className="text-xs text-slate-500 mt-1 max-w-[250px] leading-relaxed">Scegli una conversazione dalla lista, oppure inizia tu il discorso.</p>
                            </div>
                            <button onClick={openNewCompose}
                                className="mail-in mt-1 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sky-300 text-xs font-bold hover:bg-sky-500/10 hover:border-sky-500/30 transition-all duration-200 flex items-center gap-2 active:scale-95"
                                style={{ animationDelay: "150ms" }}>
                                <PenSquare className="w-3.5 h-3.5" /> Scrivi una email
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] shrink-0">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex items-center gap-2.5">
                                        <button onClick={() => setSelConv(null)} className="lg:hidden p-1.5 -ml-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                                        <div className={cn("hidden sm:flex w-10 h-10 rounded-full bg-gradient-to-br items-center justify-center text-xs font-bold text-white shrink-0 shadow-md", gradFor(selConv.customer_email || selConv.id))}>{iniziali(nomeConv(selConv))}</div>
                                        <div className="min-w-0">
                                            <div className="text-base font-bold text-white truncate leading-tight">{selConv.subject || "(senza oggetto)"}</div>
                                            <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                                                <span className="truncate">{nomeConv(selConv)} · {selConv.customer_email}</span>
                                                {selConv.client_id && <span className="shrink-0 px-1.5 py-px rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[9px] font-bold uppercase tracking-wide">cliente collegato</span>}
                                                {/* la PRIORITÀ del triage anche a thread aperto: stesso
                                                    linguaggio dei pallini della lista, qui a parole */}
                                                {triStati[selConv.id] === "rispondere" && <span className="shrink-0 px-1.5 py-px rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[9px] font-bold uppercase tracking-wide">aspetta risposta</span>}
                                                {triStati[selConv.id] === "da_leggere" && <span className="shrink-0 px-1.5 py-px rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[9px] font-bold uppercase tracking-wide">da leggere</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-0.5 shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-1 py-0.5">
                                        <IconBtn title={selConv.starred ? "Togli speciale" : "Speciale"} onClick={() => toggleStar(selConv)}><Star className={cn("w-4 h-4", selConv.starred && "fill-amber-400 text-amber-400")} /></IconBtn>
                                        {selConv.trashed ? (
                                            <>
                                                <IconBtn title="Ripristina" onClick={() => doRestore(selConv)}><RotateCcw className="w-4 h-4" /></IconBtn>
                                                {puoGestireCaselle && <IconBtn title="Elimina definitivamente" danger onClick={() => { if (confirm("Eliminare definitivamente?")) deleteForever(selConv); }}><Trash2 className="w-4 h-4" /></IconBtn>}
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
                                        <span className="inline-block px-3 py-1 rounded-full bg-white/[0.04] border border-white/10">Conversazione lunga: mostrati gli ultimi {msgs.length} messaggi di {msgsTotali}.</span>
                                    </div>
                                )}
                                {msgs.map(m => {
                                    const mine = m.direction === "out";
                                    return (
                                        /* carte-messaggio sfalsate: le mie rientrano da destra,
                                           quelle in arrivo da sinistra — il thread respira */
                                        <div key={m.id} className={cn("mail-in rounded-2xl border p-3.5", mine ? "bg-sky-500/[0.08] border-sky-500/25 lg:ml-10" : "bg-white/[0.03] border-white/10 lg:mr-10")}>
                                            <div className="flex items-center gap-2.5 mb-2">
                                                <div className={cn("w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-md", mine ? "from-sky-500 to-indigo-600" : gradFor(m.from_addr || selConv.customer_email || ""))}>
                                                    {iniziali(mine ? (selAccObj?.display_name || "Tu") : (m.from_name || m.from_addr || "?"))}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-semibold text-white truncate">{mine ? "Tu" : (m.from_name || m.from_addr)}</div>
                                                    <div className="text-[10px] text-slate-500 truncate">{mine ? `a ${m.to_addrs || selConv.customer_email}` : (m.from_addr || "")}</div>
                                                </div>
                                                <div className="text-[10px] text-slate-500 shrink-0 flex items-center gap-1 tabular-nums">
                                                    {fmtOra(m.email_date || m.created_at)}
                                                    {mine && (m.status === "failed" ? <span className="text-rose-300" title="invio fallito">✕</span> : <Check className="w-3.5 h-3.5 text-sky-300" />)}
                                                </div>
                                            </div>
                                            {m.subject && m.subject !== selConv.subject && <div className="text-[11px] italic text-slate-400 mb-1">{m.subject}</div>}
                                            <EmailBody html={m.body_html} text={m.body_text} />
                                            {(m.attachments || []).length > 0 && (
                                                <div className="mt-2.5 flex flex-wrap gap-1.5">
                                                    {(m.attachments || []).map((a: any, i: number) => (
                                                        <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/25 hover:bg-black/40 text-xs text-slate-200 border border-white/10 transition-all duration-150 hover:border-sky-500/30 hover:-translate-y-0.5"><Paperclip className="w-3 h-3 text-sky-300" /><span className="truncate max-w-[180px]">{a.name}</span></a>
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
                                    {/* risposta rapida: una carta che si accende quando ci scrivi dentro */}
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 transition-all duration-200 focus-within:border-sky-400/40 focus-within:bg-white/[0.05] focus-within:shadow-lg focus-within:shadow-sky-500/10">
                                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1 px-1"><CornerUpLeft className="w-3.5 h-3.5 text-sky-400" /> Rispondi a <span className="text-slate-300 font-semibold truncate">{nomeConv(selConv)}</span></div>
                                        <div className="flex gap-2 items-end">
                                            <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) rispondi(); }}
                                                rows={2} placeholder="Scrivi la risposta…  (Ctrl+Invio per inviare)" className="flex-1 bg-transparent border-0 outline-none text-sm text-slate-100 placeholder:text-slate-500 resize-none max-h-40 px-1 py-1" />
                                            <label title="Allega un file" className="p-2.5 rounded-full shrink-0 cursor-pointer text-slate-400 hover:text-sky-300 hover:bg-white/5 transition-colors">
                                                {caricandoAlleg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                                                <input type="file" multiple className="hidden"
                                                    onChange={(e) => { void caricaAllegati(e.target.files, "risposta"); e.currentTarget.value = ""; }} />
                                            </label>
                                            <button onClick={rispondi} disabled={sending || !text.trim()} title="Invia la risposta"
                                                className={cn("p-2.5 rounded-full text-white shrink-0 transition-all duration-200", sending || !text.trim() ? "bg-white/10 text-slate-500" : "bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-lg shadow-sky-500/30 hover:scale-105 active:scale-95")}>
                                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <StrisciaAllegati lista={allegRisposta} dove="risposta" />
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── COMPOSE dock (stile Gmail): la "carta luminosa" che sale da
                destra — filo di luce sky sul bordo alto, campi a filo, Invia
                col gradiente di sezione ── */}
            {composeOpen && selAcc && (
                <div className="fixed z-[1000] bottom-0 right-0 sm:right-6 w-full sm:w-[520px] max-w-full">
                    <div className="mail-dock glass-panel rounded-b-none rounded-t-3xl border border-white/15 shadow-2xl shadow-black/50 flex flex-col max-h-[85vh] sm:max-h-[560px] overflow-hidden">
                        <div className="h-[3px] shrink-0 bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500" />
                        <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.04] border-b border-white/10">
                            <span className="text-sm font-bold text-white flex items-center gap-2">
                                <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-md shadow-sky-500/30"><PenSquare className="w-3.5 h-3.5 text-white" /></span>
                                {cDraftId ? "Bozza" : "Nuovo messaggio"}
                            </span>
                            <div className="flex items-center gap-1">
                                <IconBtn title="Elimina bozza" danger onClick={discardCompose}><Trash2 className="w-4 h-4" /></IconBtn>
                                <IconBtn title="Chiudi (salva bozza)" onClick={closeCompose}><X className="w-4 h-4" /></IconBtn>
                            </div>
                        </div>
                        <div className="px-4 pt-3 flex flex-col gap-1.5 overflow-y-auto">
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 pb-2 border-b border-white/5">Da
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300 font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />{selAccObj?.email_address}
                                </span>
                            </div>
                            <input value={cTo} onChange={e => setCTo(e.target.value)} className="bg-transparent border-b border-white/5 focus:border-sky-400/50 outline-none py-2 text-sm text-white placeholder:text-slate-500 transition-colors" placeholder="A (email del destinatario)" autoFocus />
                            <input value={cSubject} onChange={e => setCSubject(e.target.value)} className="bg-transparent border-b border-white/5 focus:border-sky-400/50 outline-none py-2 text-sm font-medium text-white placeholder:text-slate-500 transition-colors" placeholder="Oggetto" />
                            <textarea value={cBody} onChange={e => setCBody(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendCompose(); }} rows={9} className="bg-transparent outline-none py-2.5 text-sm text-slate-100 leading-relaxed resize-none min-h-[150px] placeholder:text-slate-500" placeholder="Scrivi il messaggio…" />
                        </div>
                        <div className="px-4"><StrisciaAllegati lista={allegCompose} dove="compose" /></div>
                        <div className="px-4 py-3 border-t border-white/10 bg-white/[0.02] flex items-center gap-2">
                            <button onClick={sendCompose} disabled={sending || !cTo.trim() || !cBody.trim()}
                                className={cn("px-5 py-2 rounded-full text-white text-sm font-bold flex items-center gap-2 transition-all duration-200", sending || !cTo.trim() || !cBody.trim() ? "bg-white/10 text-slate-500" : "bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-lg shadow-sky-500/30 hover:-translate-y-0.5 active:scale-95")}>
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Invia
                            </button>
                            <label title="Allega un file" className="px-3.5 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5">
                                {caricandoAlleg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />} Allega
                                <input type="file" multiple className="hidden"
                                    onChange={(e) => { void caricaAllegati(e.target.files, "compose"); e.currentTarget.value = ""; }} />
                            </label>
                            <button onClick={() => saveDraft(false)} className="px-3.5 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-semibold transition-colors">Salva bozza</button>
                            <span className="ml-auto text-[10px] text-slate-600">Ctrl+Invio per inviare</span>
                        </div>
                    </div>
                </div>
            )}

            {connectModal && puoGestireCaselle && <ConnectModal onClose={() => { setConnectModal(false); loadAccounts(); }} ownerUserId={user?.id} negozio={user?.negozio} userId={user?.id} />}
            {manageModal && puoGestireCaselle && (
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

// intestazione riusabile (titolo/azioni + ricerca) — due vesti: dentro la
// chat una riga compatta con la ricerca in primo piano; da pagina intera un
// banner con le aurore azzurre in movimento lento (pattern dell'hub Analisi)
function TopBar({ embedded, onConnect, onManage, onRefresh, refreshing, search, setSearch, showSearch }: { embedded: boolean; onConnect?: () => void; onManage?: () => void; onRefresh?: () => void; refreshing?: boolean; search?: string; setSearch?: (v: string) => void; showSearch?: boolean }) {
    const cerca = showSearch ? (
        <div className="relative flex-1 min-w-[180px] max-w-md group">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-sky-300" />
            <input value={search} onChange={e => setSearch?.(e.target.value)} placeholder="Cerca nelle email…"
                className="w-full pl-10 pr-3 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-white placeholder:text-slate-500 outline-none transition-all duration-200 focus:border-sky-400/50 focus:bg-white/[0.07] focus:ring-4 focus:ring-sky-500/10" />
        </div>
    ) : null;
    const azioni = (
        <div className="flex items-center gap-2 shrink-0">
            {onRefresh && (
                <button onClick={onRefresh} disabled={refreshing} title="Scarica la posta nuova"
                    className="group p-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white disabled:opacity-40 transition-all duration-200 active:scale-90">
                    {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 transition-transform duration-500 group-hover:rotate-180" />}
                </button>
            )}
            {onManage && (
                <button onClick={onManage} title="Gestisci caselle (elimina dal CRM)"
                    className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all duration-200 active:scale-90">
                    <Settings className="w-4 h-4" />
                </button>
            )}
            {/* GOVERNANCE (26/08): il collega-casella compare solo a chi ha le
                capacità del Pannello Email — per gli altri le caselle arrivano
                assegnate dall'amministrazione */}
            {onConnect && (
                <button onClick={onConnect}
                    className="px-4 py-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-sm font-bold flex items-center gap-2 shadow-lg shadow-sky-500/25 transition-all duration-200 hover:-translate-y-0.5 active:scale-95">
                    <Plus className="w-4 h-4" /> Collega email
                </button>
            )}
        </div>
    );
    if (embedded) {
        return (
            <div className="mail-in flex items-center justify-between gap-3 flex-wrap shrink-0">
                {cerca || <p className="text-sm font-semibold text-slate-400">Le tue caselle email</p>}
                {azioni}
            </div>
        );
    }
    return (
        <div className="mail-in relative overflow-hidden glass-panel shadow-lg px-5 py-4 shrink-0">
            <div className="pointer-events-none absolute -top-24 -left-20 w-80 h-80 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, var(--tf-38bdf8), transparent 65%)", animation: "mAurora 18s ease-in-out infinite" }} />
            <div className="pointer-events-none absolute -bottom-28 -right-16 w-96 h-96 rounded-full opacity-[0.15] blur-3xl" style={{ background: "radial-gradient(circle, var(--tf-818cf8), transparent 65%)", animation: "mAurora 22s ease-in-out infinite reverse" }} />
            <div className="relative flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3.5 min-w-0">
                    <div className="p-2.5 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30"><Mail className="w-6 h-6 text-white" /></div>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-black text-white tracking-tight">Email</h1>
                        <p className="text-slate-400 text-xs">Scrivi e rispondi ai clienti senza uscire dal CRM</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap flex-1 justify-end min-w-0">
                    {cerca}
                    {azioni}
                </div>
            </div>
        </div>
    );
}

// piccolo bottone-icona riusabile
function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: (e: React.MouseEvent) => void; danger?: boolean }) {
    return (
        <button title={title} onClick={onClick} className={cn("p-1.5 rounded-full transition-all duration-150 text-slate-400 active:scale-90", danger ? "hover:bg-rose-500/20 hover:text-rose-300" : "hover:bg-white/10 hover:text-white")}>{children}</button>
    );
}

// stato vuoto "caldo": icona su tessera in gradiente con alone morbido,
// titolo e riga di spiegazione — mai un elenco muto
function EmptyList({ icon: Icon, label, title }: { icon: any; label: string; title?: string }) {
    return (
        <div className="mail-in flex flex-col items-center justify-center gap-3 py-14 px-6 text-center">
            <div className="relative">
                <div className="absolute inset-0 rounded-full bg-sky-500/15 blur-2xl scale-150" />
                <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500/15 to-indigo-500/10 border border-white/10 flex items-center justify-center rotate-3 shadow-lg">
                    <Icon className="w-6 h-6 text-sky-300" />
                </div>
            </div>
            {title && <div className="text-sm font-bold text-slate-300">{title}</div>}
            <span className="text-xs text-slate-500 max-w-xs leading-relaxed">{label}</span>
        </div>
    );
}

// ADATTAMENTO AL TEMA SCURO (Luca 26/08, terzo giro: l'inversione a filtro
// CSS rendeva le email un NEGATIVO — il rosso Vodafone salmone, il bianco
// nero pece). Qui si fa come i client veri (Outlook/Apple Mail): si
// RISCRIVONO i colori nel DOM dell'iframe leggendo quelli computati —
// gli sfondi "carta" (chiari e poco saturi) diventano le superfici scure
// del CRM, i testi scuri diventano chiari (tinta conservata), i colori
// BRAND (saturi: banner, bottoni) restano identici e le immagini non si
// toccano. Il testo cambia SOLO dove lo sfondo effettivo è diventato
// scuro: mai bianco-su-giallo. Email enormi: meglio la carta chiara che
// una trasformazione a metà. Possibile solo grazie ad allow-same-origin
// (lo stesso canale dell'autosize); dentro un try del chiamante.
function adattaTema(doc: Document) {
    const carta = doc.querySelector<HTMLElement>(".tfcarta");
    if (!carta) return;
    const tutti = [carta, ...Array.from(carta.querySelectorAll<HTMLElement>("*"))];
    if (tutti.length > 4500) return;
    const leggi = (s: string | null | undefined): [number, number, number, number] | null => {
        if (!s) return null;
        const m = s.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/);
        return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
    };
    const lum = (c: [number, number, number, number]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    const sat = (c: [number, number, number, number]) => { const mx = Math.max(c[0], c[1], c[2]); return mx === 0 ? 0 : (mx - Math.min(c[0], c[1], c[2])) / mx; };
    // superfici del tema: grigio-blu freddo come le card del CRM
    const grigioBlu = (l: number) => `hsl(226 24% ${Math.round(l * 100)}%)`;
    const schiarisci = (c: [number, number, number, number]) => {
        if (sat(c) < 0.15) return "#e7eaf2";      // testi grigi/neri → chiaro neutro
        const [r, g, b] = c; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let h = 0;
        if (d > 0) {
            if (mx === r) h = 60 * (((g - b) / d) % 6);
            else if (mx === g) h = 60 * ((b - r) / d + 2);
            else h = 60 * ((r - g) / d + 4);
        }
        if (h < 0) h += 360;
        return `hsl(${Math.round(h)} 75% 72%)`;   // stessa tinta, luminosità da tema scuro
    };
    // 1) SFONDI, in ordine di documento; ogni nodo toccato viene marcato per il passo 2
    for (const el of tutti) {
        const cs = doc.defaultView?.getComputedStyle(el); if (!cs) continue;
        const bg = leggi(cs.backgroundColor);
        if (!bg || bg[3] < 0.4) continue;                              // trasparente: eredita
        if (cs.backgroundImage && cs.backgroundImage !== "none") { el.dataset.tfbg = "chiaro"; continue; }
        const l = lum(bg);
        if (l > 0.62 && sat(bg) < 0.28) {
            // superficie "carta": più era chiara più diventa profonda — i
            // grigini restano un gradino sopra, le gerarchie si conservano.
            // Base 14%: PIÙ CHIARA del fondo pagina (#0f111a ≈ 8%) — con la
            // base a 9-10% carta e fondo si fondevano in un pozzo nero unico
            // (caso Instagram, email nativa-dark senza più cornice visibile)
            el.style.setProperty("background-color", grigioBlu(0.14 + (1 - l) * 0.5), "important");
            el.dataset.tfbg = "scuro";
        } else {
            el.dataset.tfbg = l < 0.35 ? "scuro" : "chiaro";           // brand e scuri: lasciati
        }
    }
    // lo sfondo EFFETTIVO di un nodo: il primo antenato marcato (la carta lo è sempre)
    const zona = (el: HTMLElement): string => {
        let n: HTMLElement | null = el;
        while (n && n !== carta.parentElement) { if (n.dataset.tfbg) return n.dataset.tfbg; n = n.parentElement; }
        return "scuro";
    };
    // 2) TESTI e BORDI: solo dove lo sfondo effettivo è diventato scuro
    for (const el of tutti) {
        if (zona(el) !== "scuro") continue;
        const cs = doc.defaultView?.getComputedStyle(el); if (!cs) continue;
        const col = leggi(cs.color);
        if (col && lum(col) < 0.55) el.style.setProperty("color", schiarisci(col), "important");
        // bordi PER LATO (i separatori delle email sono spesso solo
        // border-bottom) e marcati una volta sola: alla seconda passata il
        // bianco-alpha già scritto rileggerebbe lum=1 e degraderebbe .22→.14
        if (!el.dataset.tfbr) {
            const lati: Array<[string, string, string]> = [
                ["top", cs.borderTopColor, cs.borderTopWidth],
                ["right", cs.borderRightColor, cs.borderRightWidth],
                ["bottom", cs.borderBottomColor, cs.borderBottomWidth],
                ["left", cs.borderLeftColor, cs.borderLeftWidth],
            ];
            let toccato = false;
            for (const [lato, c, w] of lati) {
                const bc = leggi(c);
                if (!bc || bc[3] <= 0 || parseFloat(w || "0") <= 0) continue;
                el.style.setProperty(`border-${lato}-color`, lum(bc) > 0.6 ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.22)", "important");
                toccato = true;
            }
            if (toccato) el.dataset.tfbr = "1";
        }
    }
    // la carta stessa: un gradino sopra il fondo pagina (superficie elevata,
    // come le card del CRM) + un filo di bordo — così anche un'email
    // nativa-dark (Instagram) resta dentro una cornice visibile
    carta.style.setProperty("background-color", grigioBlu(0.14), "important");
    carta.style.setProperty("border", "1px solid rgba(255,255,255,.09)", "important");
}

// Corpo di un'email. Se c'e' l'HTML lo mostra CON la grafica (tabelle, immagini,
// loghi) dentro un iframe ISOLATO: sandbox SENZA allow-scripts -> nessun javascript
// dell'email viene eseguito e il suo CSS non "sporca" il tema del CRM. I link si
// aprono in una scheda nuova. Piccolo toggle per tornare al testo semplice.
// Prima l'HTML veniva appiattito a testo (tabelle sfasciate, loghi come URL grezzi).
function EmailBody({ html, text }: { html: string | null; text: string | null }) {
    const hasHtml = !!(html && html.trim() && /<[a-z!][\s\S]*>/i.test(html));
    const [showHtml, setShowHtml] = useState(hasHtml);
    // DARK MODE delle email (Luca 26/08 sera: «il CRM è tutto scuro, quando
    // apro una mail ho tutto bianco»): di default i colori vengono RISCRITTI
    // nel DOM da adattaTema() dopo il load — vedi il commento là. Il bottone
    // ☀️ mostra l'email coi colori originali quando serve.
    const [scura, setScura] = useState(true);
    const ref = useRef<HTMLIFrameElement | null>(null);
    const plain = (text && text.trim())
        ? text
        : (html ? html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

    // Il contenuto vive in una NOSTRA carta (.tfcarta) dentro un wrapper con
    // l'ombra (fuori dal filtro, sennò si inverte pure lei): le email portano
    // stili di body propri che scavalcavano i nostri (carta a sinistra +
    // lenzuolo bianco, caso Fastweb) — html/body azzerati a !important,
    // tabelle a max-width e overflow contenuto.
    const srcDoc = useMemo(() => hasHtml
        ? `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank">`
        + `<style>html,body{margin:0!important;padding:0!important;background:transparent!important}`
        + `.tfwrap{margin:10px auto;max-width:680px;border-radius:16px;overflow:hidden;`
        + `box-shadow:0 10px 34px rgba(0,0,0,.35)}`
        + `.tfcarta{padding:20px 22px;background:#fff;color:#111;overflow-x:auto;`
        + `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;`
        + `word-break:break-word;overflow-wrap:anywhere}`
        + `.tfcarta img{max-width:100%;height:auto}.tfcarta table{max-width:100%!important}a{color:#0b66c3}</style>`
        + `</head><body><div class="tfwrap"><div class="tfcarta">${html}</div></div></body></html>`
        : "", [html, hasHtml]);

    // sandbox senza allow-scripts, ma con allow-same-origin per poter MISURARE
    // l'altezza reale del contenuto e adattare l'iframe (niente doppio scroll).
    const autosize = useCallback(() => {
        const f = ref.current;
        try {
            const doc = f?.contentDocument;
            // le immagini FALLITE (URL firmati scaduti: avatar Instagram…)
            // lasciano l'icona rotta: via, lo spazio resta (visibility)
            doc?.querySelectorAll("img").forEach((im) => {
                if (im.complete && im.naturalWidth === 0 && im.src) im.style.visibility = "hidden";
            });
            const h = doc ? Math.max(doc.documentElement?.scrollHeight || 0, doc.body?.scrollHeight || 0) : 0;
            if (f && h > 20) f.style.height = Math.min(h + 4, 6000) + "px";
            else if (f) f.style.height = "600px";   // "quadratone" da 80px mai piu': meglio larghi
        } catch { if (ref.current) ref.current.style.height = "600px"; /* non misurabile */ }
    }, []);

    // al load: adatta i colori al tema (se richiesto), POI mostra l'iframe —
    // parte a opacity 0 così non c'è il lampo bianco prima della riscrittura
    const alCarico = useCallback(() => {
        if (scura) { try { const d = ref.current?.contentDocument; if (d) adattaTema(d); } catch { /* non accessibile */ } }
        if (ref.current) ref.current.style.opacity = "1";
        autosize();
    }, [scura, autosize]);

    useEffect(() => {
        if (!showHtml) return;
        // ri-misura dopo il caricamento delle immagini remote (loghi, banner…)
        const t = [setTimeout(autosize, 250), setTimeout(autosize, 1000), setTimeout(autosize, 2500), setTimeout(autosize, 5000)];
        // rete di sicurezza: l'evento load dell'iframe aspetta ANCHE le
        // immagini remote — con un banner lento l'email resterebbe invisibile.
        // adattaTema è idempotente, quindi qui si adatta+rivela senza rischi.
        t.push(setTimeout(alCarico, 900));
        window.addEventListener("resize", autosize);
        return () => { t.forEach(clearTimeout); window.removeEventListener("resize", autosize); };
    }, [showHtml, srcDoc, scura, autosize, alCarico]);

    if (!hasHtml) {
        return <p className="text-sm text-slate-100 whitespace-pre-wrap break-words leading-relaxed">{plain}</p>;
    }
    // L'iframe è LARGO QUANTO LA CARTA e centrato (Luca 26/08: «un corpo
    // esterno») — a piena larghezza restava un mare scuro ai lati; così
    // l'email vive dentro la card del thread come una foto in una chat.
    return (
        <div>
            <div className="flex justify-end items-center gap-1 -mt-1 mb-1.5">
                {showHtml && (
                    <button onClick={() => setScura(v => !v)} className="text-[10px] font-semibold text-slate-500 hover:text-amber-300 flex items-center gap-1 px-2 py-0.5 rounded-full hover:bg-white/5 transition-colors" title={scura ? "Mostra i colori originali dell'email" : "Adatta i colori al tema scuro"}>
                        {scura ? <><Sun className="w-3 h-3" /> Colori originali</> : <><Moon className="w-3 h-3" /> Adatta al tema</>}
                    </button>
                )}
                <button onClick={() => setShowHtml(v => !v)} className="text-[10px] font-semibold text-slate-500 hover:text-sky-300 flex items-center gap-1 px-2 py-0.5 rounded-full hover:bg-white/5 transition-colors" title={showHtml ? "Mostra solo il testo" : "Mostra la versione con grafica"}>
                    <Code className="w-3 h-3" /> {showHtml ? "Testo semplice" : "Versione grafica"}
                </button>
            </div>
            {showHtml ? (
                <iframe key={scura ? "tema" : "originale"} ref={ref} title="Contenuto email" onLoad={alCarico}
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                    srcDoc={srcDoc}
                    className="w-full max-w-[720px] mx-auto block bg-transparent"
                    style={{ border: 0, minHeight: 80, opacity: 0, transition: "opacity .18s ease" }} />
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
        <div className="mail-fade fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="mail-pop glass-panel shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-2 p-4 border-b border-white/10 bg-white/5">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-md shadow-sky-500/30"><Settings className="w-4 h-4 text-white" /></span>
                        Gestisci caselle
                    </h3>
                    <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {accounts.length === 0 && <p className="text-sm text-slate-500 text-center py-8">Nessuna casella collegata.</p>}
                    {accounts.map((a, i) => {
                        const col = coloreCasella(a.id);
                        return (
                            <div key={a.id} className="mail-in flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] transition-colors hover:bg-white/[0.05] hover:border-white/20" style={{ animationDelay: `${i * 40}ms` }}>
                                <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", col.dot)} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-white truncate">{a.display_name || a.email_address}</p>
                                    <p className="text-[11px] text-slate-500 truncate">{a.email_address}{a.negozio ? ` · ${a.negozio}` : ""}</p>
                                    {a.status !== "attiva"
                                        ? <p className="text-[11px] text-rose-300 truncate" title={a.last_error || ""}>In errore{a.last_error ? ` — ${a.last_error}` : ""}</p>
                                        : <p className="text-[11px] text-emerald-300 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Attiva</p>}
                                </div>
                                <button onClick={() => elimina(a)} disabled={!!busyId}
                                    title="Elimina la casella dal CRM con tutto lo storico scaricato (la casella sul server non viene toccata)"
                                    className="px-3 py-1.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1.5 hover:bg-rose-500/25 disabled:opacity-40 shrink-0 transition-all active:scale-95">
                                    {busyId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Elimina
                                </button>
                            </div>
                        );
                    })}
                </div>
                <div className="px-4 py-3 border-t border-white/10 bg-white/[0.02] text-[11px] text-slate-500 leading-relaxed">
                    L'eliminazione toglie la casella dal CRM con tutto lo storico scaricato (conversazioni, messaggi, bozze, allegati).
                    La casella reale sul server di posta non viene toccata.
                </div>
            </div>
        </div>
    );
}

// Modal: collega una casella (indirizzo + password; IMAP/SMTP auto dal dominio).
// ESPORTATO per il Pannello Email in Amministrazione (governance 26/08):
// presetEmail/presetDisplay precompilano il ri-collega di una casella
// esistente (il connect su indirizzo già noto aggiorna le credenziali).
export function ConnectModal({ onClose, ownerUserId, negozio, presetEmail, presetDisplay, userId, extraUserIds, usoSistema }: { onClose: () => void; ownerUserId?: string; negozio?: string; presetEmail?: string; presetDisplay?: string; userId?: string; extraUserIds?: string[]; usoSistema?: boolean }) {
    const [email, setEmail] = useState(presetEmail || "");
    const [password, setPassword] = useState("");
    const [display, setDisplay] = useState(presetDisplay || negozio || "");
    const [adv, setAdv] = useState(false);
    const [imapHost, setImapHost] = useState(""); const [smtpHost, setSmtpHost] = useState("");
    const [busy, setBusy] = useState(false);
    // le caselle dei codici sono quasi sempre Gmail/Outlook personali: lì la
    // password normale non basta più, e senza dirlo il collegamento fallisce
    // con un messaggio che non spiega niente
    const provider = /@(gmail|googlemail)\./i.test(email) ? "google" : /@(hotmail|outlook|live|msn)\./i.test(email) ? "microsoft" : null;
    const collega = async () => {
        if (!email.trim() || !password) return;
        setBusy(true);
        const res = await api("/api/email/account", { action: "connect", email: email.trim(), password, displayName: display.trim() || null, negozio, ownerUserId, extraUserIds, userId, imapHost: imapHost || undefined, smtpHost: smtpHost || undefined, usoSistema: usoSistema === true });
        setBusy(false);
        if (res?.error) { alert(res.error); return; }
        if (res?.reconnected) alert("Questa casella era già collegata: l'ho ri-collegata con le credenziali appena inserite.");
        // le utenze che aspettavano proprio questa casella si sono agganciate
        // da sole: dirlo evita il dubbio «e adesso devo collegarle a mano?»
        if (res?.agganciate > 0) {
            alert(`Casella collegata.\n\n${res.agganciate === 1 ? "Un'utenza aspettava" : `${res.agganciate} utenze aspettavano`} proprio questo indirizzo: ${res.agganciate === 1 ? "si è agganciata" : "si sono agganciate"} da ${res.agganciate === 1 ? "sola" : "sole"}. Il pulsante «Chiedi il codice» ora funziona.`);
        }
        onClose();
    };
    /* IN UN PORTAL, NON DOVE STA IL BOTTONE (Luca 28/08, «Caselle dei
       codici»: la finestra si apriva dentro la striscia della sezione e il
       tasto per salvare non si raggiungeva). Le sezioni hanno la classe
       `glass-panel`, che porta un `backdrop-blur`: un elemento con un filtro
       di sfondo diventa il RIFERIMENTO dei figli in posizione fissa, e con
       `overflow-hidden` sullo stesso riquadro il modale veniva tagliato lì
       dentro. Portandolo su document.body il problema non si ripresenta più,
       in nessuno dei punti che usano questa finestra. */
    return typeof document === "undefined" ? null : createPortal(
        <div className="mail-fade fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            {/* la modal vive anche da sola nel Pannello Email: le animazioni
                viaggiano con lei (keyframes duplicati = innocui) */}
            <style>{MAIL_CSS}</style>
            <div className="mail-pop glass-panel shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="h-[3px] bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500" />
                <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                            <span className={cn("w-8 h-8 rounded-xl flex items-center justify-center shadow-md",
                                usoSistema ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30" : "bg-gradient-to-br from-sky-500 to-blue-600 shadow-sky-500/30")}>
                                <Mail className="w-4 h-4 text-white" />
                            </span>
                            {usoSistema ? "Casella dei codici" : "Collega una casella email"}
                        </h3>
                        <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="space-y-3">
                        {usoSistema && (
                            <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.07] px-3 py-2.5 text-[11px] text-amber-200/90 leading-relaxed">
                                Questa casella non finisce nella posta di nessuno: serve solo al CRM per andare a prendere
                                i codici usa e getta quando qualcuno li chiede dalla sezione Password.
                            </div>
                        )}
                        <div><label className="text-xs font-bold text-slate-400 uppercase tracking-widest">{usoSistema ? "Come chiamarla" : "Nome (es. negozio)"}</label><input value={display} onChange={e => setDisplay(e.target.value)} className="glass-input w-full text-sm mt-1" placeholder={usoSistema ? "Codici Fastweb — Donna Olimpia" : "Magliana W3"} /></div>
                        <div><label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Indirizzo email</label><input value={email} onChange={e => setEmail(e.target.value)} className="glass-input w-full text-sm mt-1" placeholder="magliana@telefuturasrl.com" autoFocus /></div>
                        <div><label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Password casella</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="glass-input w-full text-sm mt-1" placeholder="password della casella" /></div>
                        <button onClick={() => setAdv(v => !v)} className="text-xs text-slate-500 hover:text-sky-300 transition-colors">{adv ? "− " : "+ "}Impostazioni avanzate (server)</button>
                        {adv && (<div className="mail-in grid grid-cols-1 gap-2">
                            <input value={imapHost} onChange={e => setImapHost(e.target.value)} className="glass-input w-full text-sm" placeholder="IMAP host (auto: mail.tuodominio)" />
                            <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className="glass-input w-full text-sm" placeholder="SMTP host (auto: mail.tuodominio)" />
                        </div>)}
                        {/* PASSWORD PER LE APP (28/08): Gmail non accetta più la
                            password normale da programmi esterni. Senza dirlo qui, il
                            collegamento fallisce e sembra un guasto del CRM. */}
                        {provider === "google" && (
                            <div className="rounded-xl border border-sky-400/25 bg-sky-500/[0.06] px-3 py-2.5 text-[11px] text-sky-100/90 leading-relaxed space-y-1">
                                <div className="font-bold text-sky-200">È una casella Google: serve una «password per le app»</div>
                                <div>Su <span className="font-mono">myaccount.google.com</span> → Sicurezza: attiva la <b>verifica in due passaggi</b>, poi
                                    cerca <b>Password per le app</b>, creane una (nome: «CRM Telefutura») e incolla qui le <b>16 lettere</b> che ti dà — non la password con cui entri in Gmail.</div>
                            </div>
                        )}
                        {/* ⛔ NON C'È UNA PASSWORD CHE FUNZIONI (verificato il 29/08
                            con un indirizzo INVENTATO, quindi non è mai una questione
                            di credenziali sbagliate):
                              → a4 LOGIN "…@hotmail.it" "passwordfinta"
                              ← a4 NO Basic authentication is disabled.
                            e la lista dei meccanismi offerti è una sola voce:
                            AUTH=XOAUTH2.
                            ⚠️ NON vuol dire «impossibile»: il telefono si collega
                            proprio perché usa OAuth2 (la password la scrivi su una
                            pagina di Microsoft, e l'app riceve un permesso). Quello
                            manca al CRM, e si può costruire. Il riquadro di prima
                            diceva di creare una «password per le app»: un'ora buttata
                            su una strada che il server non guarda nemmeno. */}
                        {provider === "microsoft" && (
                            <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.07] px-3 py-2.5 text-[11px] text-amber-100/90 leading-relaxed space-y-1.5">
                                <div className="font-bold text-amber-200">⛔ Qui la password non basta</div>
                                <div>Su hotmail/outlook/live Microsoft ha <b>chiuso l&apos;accesso con utente e password</b> — risponde
                                    «Basic authentication is disabled» prima ancora di leggerla. Attivare IMAP o creare una
                                    «password per le app» <b>non serve a niente</b>.</div>
                                <div className="text-amber-200/80">Il telefono si collega perché usa <b>OAuth2</b>: la password la scrivi su una pagina di
                                    Microsoft e l&apos;app riceve un permesso. Il CRM quel meccanismo non lo parla <b>ancora</b>.</div>
                                <div className="text-amber-200/80">Intanto funzionano: far <b>inoltrare</b> in automatico la posta di questa casella a una Gmail
                                    già collegata, oppure <b>cambiare l&apos;indirizzo</b> registrato sul portale che manda i codici.</div>
                            </div>
                        )}
                        <div className="text-[11px] text-slate-500 leading-relaxed">
                            {usoSistema
                                ? "Verifichiamo la lettura prima di salvare (l'invio non serve: da questa casella non spediremo mai nulla)."
                                : "Verifichiamo lettura e invio prima di salvare."} IMAP/SMTP vengono rilevati dal dominio (Gmail, Outlook, Aruba, o mail.tuodominio).
                        </div>
                        <button onClick={collega} disabled={busy || !email.trim() || !password}
                            className={cn("w-full py-2.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-all duration-200", busy || !email.trim() || !password ? "bg-white/10 text-slate-500" : "bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-lg shadow-sky-500/30 hover:-translate-y-0.5 active:scale-[0.98]")}>
                            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifico…</> : "Collega casella"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        , document.body);
}
