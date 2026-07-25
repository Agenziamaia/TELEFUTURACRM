"use client";

/**
 * TASK URGENTI (⚡ accanto alla campanella): le cose DA FARE, distinte dalle
 * Comunicazioni. Prima voce: "completa il nuovo utente" quando amministrativo o
 * direzione generale creano uno user (costo/visibilita'/brand li mette l'admin).
 * Tabella admin_tasks (mig. 085) — se assente, l'icona semplicemente non compare.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";

interface Task { id: string; titolo: string; dettaglio: string | null; link: string | null; created_at: string }

export function UrgentTasks() {
    const { user } = useAuth();
    const router = useRouter();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [open, setOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);
    const isAdmin = !!user && ["admin", "dev"].includes(user.role);

    useEffect(() => {
        if (!isAdmin) return;
        let vivo = true;
        const load = async () => {
            const { data, error } = await supabase.from("admin_tasks")
                .select("id,titolo,dettaglio,link,created_at")
                .eq("target_role", "admin").eq("done", false).order("created_at", { ascending: false });
            if (vivo && !error) setTasks((data ?? []) as Task[]);
        };
        load();
        const t = setInterval(load, 60000);
        return () => { vivo = false; clearInterval(t); };
    }, [isAdmin]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const fatta = async (id: string) => {
        await supabase.from("admin_tasks").update({ done: true, done_by: user?.name || "—", done_at: new Date().toISOString() }).eq("id", id);
        setTasks((p) => p.filter((t) => t.id !== id));
    };

    // Sempre visibile per l'admin (anche a zero task: altrimenti non si scopre);
    // il colore ambra e il contatore compaiono solo quando c'e' qualcosa da fare.
    if (!isAdmin) return null;
    return (
        <div className="relative" ref={boxRef}>
            <button onClick={() => setOpen((o) => !o)} title={tasks.length ? `${tasks.length} task urgenti da fare` : "Task urgenti (vuoto)"}
                className={`relative p-2 rounded-lg hover:bg-white/5 transition-colors ${tasks.length ? "text-amber-400 hover:text-amber-300" : "text-slate-400 hover:text-white"}`}>
                <Zap className="h-5 w-5" />
                {tasks.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center">{tasks.length}</span>
                )}
            </button>
            {open && (
                <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-white/10 bg-[#0f1420] shadow-2xl z-[200] p-2 space-y-1">
                    <div className="px-2 py-1.5 text-xs font-bold text-amber-300 uppercase tracking-wider">⚡ Task urgenti</div>
                    {tasks.length === 0 && (
                        <div className="p-3 text-sm text-slate-500">Nessuna task urgente. Qui arrivano le cose DA FARE — ad esempio un nuovo utente creato dall'amministrazione da completare con costo, visibilità e brand.</div>
                    )}
                    {tasks.map((t) => (
                        <div key={t.id} className="p-2.5 rounded-lg bg-white/[0.03] border border-white/8">
                            <button onClick={() => { if (t.link) { router.push(t.link); setOpen(false); } }} className="text-left w-full">
                                <div className="text-sm font-semibold text-white leading-snug">{t.titolo}</div>
                                {t.dettaglio && <div className="text-xs text-slate-400 mt-0.5">{t.dettaglio}</div>}
                                <div className="text-[10px] text-slate-600 mt-1">{new Date(t.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                            </button>
                            <button onClick={() => fatta(t.id)} className="mt-1.5 text-[11px] px-2 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 font-bold">✓ Fatta</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
