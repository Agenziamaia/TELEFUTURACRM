"use client";

// Stato "online" via Supabase Realtime Presence: ogni utente loggato entra in un
// canale condiviso e "traccia" il proprio id. onlineIds = chi e' presente ora.
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { touchLastSeen } from "@/lib/chat";

interface PresenceCtx { onlineIds: Set<string>; isOnline: (id?: string | null) => boolean }
const PresenceContext = createContext<PresenceCtx>({ onlineIds: new Set(), isOnline: () => false });

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) { setOnlineIds(new Set()); return; }
    const channel = supabase.channel("presence:online", {
      config: { presence: { key: user.id } },
    });
    const sync = () => setOnlineIds(new Set(Object.keys(channel.presenceState())));
    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
          touchLastSeen(user.id);
        }
      });
    const interval = setInterval(() => touchLastSeen(user.id), 45000);
    return () => { clearInterval(interval); supabase.removeChannel(channel); };
  }, [user?.id]);

  const isOnline = (id?: string | null) => !!id && onlineIds.has(id);
  return <PresenceContext.Provider value={{ onlineIds, isOnline }}>{children}</PresenceContext.Provider>;
}

export const usePresence = () => useContext(PresenceContext);
