"use client";

// NOTIFICHE MESSAGGI in alto a destra (Luca 31/07): un toast all'arrivo di un
// messaggio, con stile diverso per fonte — chat interna (indaco), WhatsApp
// (verde), mail in stile "spettro": semi-trasparente e discreta, perché meno
// urgente delle altre due (e sparisce prima). Clic → si apre la conversazione.
// WhatsApp e mail notificano SOLO il proprietario dell'istanza/casella; i
// numeri di punto vendita suonano a chi ci lavora, mai a chi vede tutto.
// NB: wa_messages ed email_messages devono stare nella publication realtime
// (mig. 111) — senza, chat continua a funzionare e le altre due tacciono.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { markDelivered } from "@/lib/chat";
import { useAuth } from "@/context/AuthContext";
import { seesAllStores } from "@/lib/roles";
import { matchNegozi } from "@/lib/visibleStores";
import { MessageSquare, Mail, X } from "lucide-react";

type Fonte = "chat" | "wa" | "mail";
interface Toast { id: string; fonte: Fonte; titolo: string; testo: string; href: string }

const STILI: Record<Fonte, { card: string; chip: string; etichetta: string }> = {
    chat: {
        card: "bg-[#1e2235] border border-white/10 border-l-4 border-l-indigo-500 hover:bg-[#252a40] shadow-2xl",
        chip: "bg-indigo-500/15 text-indigo-300", etichetta: "Chat",
    },
    wa: {
        card: "bg-[#12291c] border border-emerald-500/25 border-l-4 border-l-[#25D366] hover:bg-[#17331f] shadow-2xl",
        chip: "bg-emerald-500/15 text-emerald-300", etichetta: "WhatsApp",
    },
    mail: {
        // "spettro": trasparenza + blur, niente ombra pesante — presenza leggera
        card: "bg-[#1e2235]/45 backdrop-blur-md border border-white/5 border-l-4 border-l-slate-500/50 hover:bg-[#1e2235]/70 opacity-90",
        chip: "bg-white/5 text-slate-400", etichetta: "Mail",
    },
};

export function ChatToaster() {
    const { user } = useAuth();
    const router = useRouter();
    const [toasts, setToasts] = useState<Toast[]>([]);

    useEffect(() => {
        if (!user?.id) return;
        const inChat = () => typeof window !== "undefined" && window.location.pathname.startsWith("/chat");
        const aggiungi = (t: Toast, durataMs: number) => {
            setToasts((p) => [t, ...p.filter((x) => x.id !== t.id)].slice(0, 4));
            setTimeout(() => setToasts((p) => p.filter((x) => x.id !== t.id)), durataMs);
        };
        const channel = supabase
            .channel("messaggi_toaster")
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, async (payload) => {
                const m: any = payload.new; // eslint-disable-line @typescript-eslint/no-explicit-any
                if (!m || m.sender_id === user.id) return;
                // sono un partecipante di questa conversazione?
                const { data: part } = await supabase
                    .from("chat_participants").select("user_id")
                    .eq("conversation_id", m.conversation_id).eq("user_id", user.id).maybeSingle();
                if (!part) return;
                // consegnato: il mio client ha ricevuto il messaggio (anche fuori da /chat)
                markDelivered(m.conversation_id, user.id);
                if (inChat()) return; // dentro /chat lo vedi live
                const [{ data: su }, { data: conv }] = await Promise.all([
                    supabase.from("app_users").select("full_name").eq("id", m.sender_id).maybeSingle(),
                    supabase.from("chat_conversations").select("type,title").eq("id", m.conversation_id).maybeSingle(),
                ]);
                const senderName = su?.full_name || "Nuovo messaggio";
                const titolo = conv?.type === "group" && conv?.title ? `${senderName} · ${conv.title}` : senderName;
                aggiungi({ id: `chat-${m.id}`, fonte: "chat", titolo, testo: m.body || "📎 Allegato", href: `/chat?c=${m.conversation_id}` }, 7000);
            })
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "wa_messages" }, async (payload) => {
                const m: any = payload.new; // eslint-disable-line @typescript-eslint/no-explicit-any
                if (!m || m.direction !== "in") return;
                const { data: conv } = await supabase.from("wa_conversations")
                    .select("customer_name, customer_number, instance_id").eq("id", m.conversation_id).maybeSingle();
                if (!conv) return;
                const { data: inst } = await supabase.from("wa_instances").select("owner_user_id, negozio").eq("id", conv.instance_id).maybeSingle();
                /* I NUMERI DEI PUNTI VENDITA non hanno un titolare, e la vecchia
                   guardia (`owner && owner !== me`) li lasciava passare a
                   CHIUNQUE: chi vede tutte le chat — dall'amministrativo in su —
                   riceveva il toast di ogni negozio (Luca 28/08). Come per le
                   mail: a chi vede tutto arrivano solo i suoi numeri personali;
                   il numero del negozio suona a chi in quel negozio ci lavora. */
                if (inst?.owner_user_id) {
                    if (inst.owner_user_id !== user.id) return;
                } else {
                    if (seesAllStores(user.role)) return;
                    if (!matchNegozi(inst?.negozio, [user.negozio || ""])) return;
                }
                if (inChat()) return;
                aggiungi({
                    id: `wa-${m.id}`, fonte: "wa",
                    titolo: conv.customer_name || m.sender_name || conv.customer_number || "WhatsApp",
                    testo: m.body || (m.media_mime ? "📎 Allegato" : "Nuovo messaggio"),
                    href: `/chat?wa=${encodeURIComponent(conv.customer_number || "")}`,
                }, 7000);
            })
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "email_messages" }, async (payload) => {
                const m: any = payload.new; // eslint-disable-line @typescript-eslint/no-explicit-any
                if (!m || m.direction !== "in") return;
                // niente toast email per l'AMMINISTRAZIONE (Luca 26/08 sera,
                // «spengile SOLO a me»): vede tutte le caselle, riceverebbe
                // il toast di ogni negozio — ai punti vendita restano
                if (seesAllStores(user.role)) return;
                // Il backfill dello storico inserisce mail VECCHIE: niente toast
                // (e niente query owner) per messaggi più vecchi di 24 ore.
                if (m.email_date && Date.now() - new Date(m.email_date).getTime() > 24 * 3600 * 1000) return;
                const { data: acc } = await supabase.from("email_accounts").select("owner_user_id").eq("id", m.account_id).maybeSingle();
                if (acc?.owner_user_id && acc.owner_user_id !== user.id) {
                    // casella multi-utente (26/08): il toast arriva anche ai MEMBRI
                    const { data: mm } = await supabase.from("email_account_users")
                        .select("account_id").eq("account_id", m.account_id).eq("user_id", user.id).maybeSingle();
                    if (!mm) return;
                }
                if (inChat()) return;
                aggiungi({
                    id: `mail-${m.id}`, fonte: "mail",
                    titolo: m.from_name || m.from_addr || "Nuova mail",
                    testo: m.subject || String(m.body_text || "").slice(0, 80) || "…",
                    href: `/chat?mail=${encodeURIComponent(m.from_addr || "")}`,
                }, 5000);
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id]);

    const open = (t: Toast) => { setToasts((p) => p.filter((x) => x.id !== t.id)); router.push(t.href); };
    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-6 right-6 z-[1400] flex flex-col gap-2">
            {toasts.map((t) => {
                const st = STILI[t.fonte];
                return (
                    <div key={t.id} onClick={() => open(t)}
                        className={`cursor-pointer w-80 flex items-start gap-3 p-3 rounded-xl transition-colors animate-in slide-in-from-right-full duration-300 ${st.card}`}>
                        <div className={`p-2 rounded-lg shrink-0 ${st.chip}`}>
                            {t.fonte === "mail" ? <Mail className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold truncate ${t.fonte === "mail" ? "text-slate-300" : "text-white"}`}>{t.titolo}</p>
                            <p className={`text-xs truncate ${t.fonte === "mail" ? "text-slate-500" : "text-slate-400"}`}>{t.testo}</p>
                        </div>
                        <span className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 shrink-0 ${st.chip} px-1.5 py-0.5 rounded`}>{st.etichetta}</span>
                        <button onClick={(e) => { e.stopPropagation(); setToasts((p) => p.filter((x) => x.id !== t.id)); }}
                            className="text-slate-500 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
                    </div>
                );
            })}
        </div>
    );
}
