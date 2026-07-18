"use client";

// Toast in basso a destra all'arrivo di un nuovo messaggio chat (quando NON sei
// gia' dentro /chat). Clic -> apre la conversazione.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { MessageSquare, X } from "lucide-react";

interface Toast { id: string; convId: string; sender: string; text: string }

export function ChatToaster() {
  const { user } = useAuth();
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("chat_toaster")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, async (payload) => {
        const m: any = payload.new;
        if (!m || m.sender_id === user.id) return;
        // se sei gia' nella chat, niente toast (lo vedi live)
        if (typeof window !== "undefined" && window.location.pathname.startsWith("/chat")) return;
        // sono un partecipante di questa conversazione?
        const { data: part } = await supabase
          .from("chat_participants").select("user_id")
          .eq("conversation_id", m.conversation_id).eq("user_id", user.id).maybeSingle();
        if (!part) return;
        const [{ data: su }, { data: conv }] = await Promise.all([
          supabase.from("app_users").select("full_name").eq("id", m.sender_id).maybeSingle(),
          supabase.from("chat_conversations").select("type,title").eq("id", m.conversation_id).maybeSingle(),
        ]);
        const senderName = su?.full_name || "Nuovo messaggio";
        const label = conv?.type === "group" && conv?.title ? `${senderName} · ${conv.title}` : senderName;
        const id = String(m.id);
        setToasts((p) => [{ id, convId: m.conversation_id, sender: label, text: m.body || "📎 Allegato" }, ...p].slice(0, 4));
        setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 6000);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const open = (t: Toast) => { setToasts((p) => p.filter((x) => x.id !== t.id)); router.push(`/chat?c=${t.convId}`); };
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} onClick={() => open(t)}
          className="cursor-pointer w-80 flex items-start gap-3 bg-[#1e2235] border border-white/10 border-l-4 border-l-indigo-500 p-3 rounded-xl shadow-2xl hover:bg-[#252a40] transition-colors animate-in slide-in-from-right-full duration-300">
          <div className="p-2 rounded-lg bg-indigo-500/15 shrink-0"><MessageSquare className="w-4 h-4 text-indigo-300" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{t.sender}</p>
            <p className="text-xs text-slate-400 truncate">{t.text}</p>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setToasts((p) => p.filter((x) => x.id !== t.id)); }}
            className="text-slate-500 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  );
}
