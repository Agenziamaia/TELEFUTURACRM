"use client";

// POP-UP COMUNICAZIONI (Luca 30/07, mig. 104): le comunicazioni kind='popup'
// indirizzate al ruolo dell'utente compaiono AL CENTRO sopra qualsiasi cosa
// stia facendo — subito se e' loggato (realtime + ricontrollo periodico), al
// primo login altrimenti (il componente monta dopo l'auth). Restano in coda
// finche' non vengono CONFERMATE col pulsante; "Piu' tardi" le fa sparire per
// la sessione ma ricompaiono al prossimo accesso. La visualizzazione scrive la
// LETTURA in comunicazioni_ricevute, la conferma scrive confermato_il.
import { useCallback, useEffect, useRef, useState } from "react";
import { Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";

type ComPopup = {
    id: number;
    title: string;
    content: string;
    type: string;
    date_display: string;
    created_by_name: string | null;
    target_roles: string[] | null;
    kind: string | null;
};

export function ComunicazioniPopup() {
    const { user } = useAuth();
    const [coda, setCoda] = useState<ComPopup[]>([]);
    const [rimandate, setRimandate] = useState<Set<number>>(new Set());
    const lettureScritte = useRef<Set<number>>(new Set());
    const [salvando, setSalvando] = useState(false);

    const carica = useCallback(async () => {
        if (!user?.id) return;
        try {
            const { data: coms, error } = await supabase
                .from("comunicazioni")
                .select("id, title, content, type, date_display, created_by_name, target_roles, kind")
                .eq("kind", "popup")
                .order("created_at", { ascending: true });
            if (error || !coms) return;
            const perMe = (coms as ComPopup[]).filter((c) => !c.target_roles?.length || c.target_roles.includes(user.role || ""));
            if (!perMe.length) { setCoda([]); return; }
            const { data: ric } = await supabase
                .from("comunicazioni_ricevute")
                .select("comunicazione_id, confermato_il")
                .eq("user_id", user.id)
                .in("comunicazione_id", perMe.map((c) => c.id));
            const confermate = new Set(((ric ?? []) as { comunicazione_id: number; confermato_il: string | null }[])
                .filter((r) => r.confermato_il).map((r) => r.comunicazione_id));
            setCoda(perMe.filter((c) => !confermate.has(c.id)));
        } catch { /* tabella non ancora migrata o rete: nessun popup */ }
    }, [user?.id, user?.role]);

    useEffect(() => {
        if (!user?.id) { setCoda([]); return; }
        carica();
        // realtime sugli INSERT + ricontrollo periodico di sicurezza
        const ch = supabase
            .channel("comunicazioni_popup")
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "comunicazioni" }, () => carica())
            .subscribe();
        const t = setInterval(carica, 5 * 60 * 1000);
        return () => { supabase.removeChannel(ch); clearInterval(t); };
    }, [user?.id, carica]);

    const attuale = coda.find((c) => !rimandate.has(c.id)) || null;

    // La sola visualizzazione conta come LETTURA (una volta per comunicazione).
    useEffect(() => {
        if (!attuale || !user?.id || lettureScritte.current.has(attuale.id)) return;
        lettureScritte.current.add(attuale.id);
        supabase.from("comunicazioni_ricevute").upsert([{
            comunicazione_id: attuale.id,
            user_id: user.id,
            user_name: user.name || null,
            letto_il: new Date().toISOString(),
        }], { onConflict: "comunicazione_id,user_id", ignoreDuplicates: true }).then(() => { });
    }, [attuale, user?.id, user?.name]);

    const conferma = async () => {
        if (!attuale || !user?.id) return;
        setSalvando(true);
        const ora = new Date().toISOString();
        const { error } = await supabase.from("comunicazioni_ricevute").upsert([{
            comunicazione_id: attuale.id,
            user_id: user.id,
            user_name: user.name || null,
            letto_il: ora,
            confermato_il: ora,
        }], { onConflict: "comunicazione_id,user_id" });
        setSalvando(false);
        if (!error) setCoda((p) => p.filter((c) => c.id !== attuale.id));
    };

    if (!user || !attuale) return null;

    const stile = attuale.type === "warning"
        ? { Icon: AlertTriangle, color: "#fbbf24", bg: "rgba(251,191,36,.12)", border: "rgba(251,191,36,.35)" }
        : attuale.type === "success"
            ? { Icon: CheckCircle2, color: "#34d399", bg: "rgba(52,211,153,.12)", border: "rgba(52,211,153,.35)" }
            : { Icon: Info, color: "#60a5fa", bg: "rgba(96,165,250,.12)", border: "rgba(96,165,250,.35)" };
    const { Icon } = stile;

    return (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="w-full max-w-[560px] rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200"
                style={{ background: "#12141f", borderColor: stile.border }}>
                <div className="flex items-start gap-4 p-6 pb-4">
                    <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border"
                        style={{ background: stile.bg, borderColor: stile.border, color: stile.color }}>
                        <Icon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: stile.color }}>
                            Comunicazione da confermare
                        </div>
                        <h3 className="text-xl font-bold text-white leading-tight">{attuale.title}</h3>
                        <p className="text-xs text-slate-500 mt-1">
                            {attuale.date_display}{attuale.created_by_name ? ` — ${attuale.created_by_name}` : ""}
                        </p>
                    </div>
                </div>
                <div className="px-6 pb-5 text-slate-200 leading-relaxed whitespace-pre-wrap max-h-[45vh] overflow-y-auto">
                    {attuale.content}
                </div>
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-white/10 bg-black/20">
                    <button
                        type="button"
                        onClick={() => setRimandate((p) => new Set(p).add(attuale.id))}
                        className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                        title="Ricomparirà al prossimo accesso finché non la confermi"
                    >
                        Più tardi
                    </button>
                    <button
                        type="button"
                        disabled={salvando}
                        onClick={conferma}
                        className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors disabled:opacity-40"
                    >
                        {salvando ? "…" : "✓ Ho letto e confermo"}
                    </button>
                </div>
                {coda.length > 1 && (
                    <div className="px-6 pb-3 -mt-1 text-[11px] text-slate-600 text-right">
                        {coda.length - 1} altra/e in coda
                    </div>
                )}
            </div>
        </div>
    );
}
