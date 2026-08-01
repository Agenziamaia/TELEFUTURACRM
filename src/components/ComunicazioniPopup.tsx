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
import { comunicazionePerMe, brandDelNegozio, negoziAssegnati, sincronizzaRispostaRiunione } from "@/lib/comunicazioniTarget";

type ComPopup = {
    id: number;
    title: string;
    content: string;
    type: string;
    date_display: string;
    created_by?: string | null;
    created_by_name: string | null;
    target_roles: string[] | null;
    target_stores?: string[] | null;
    target_users?: string[] | null;
    target_brands?: string[] | null;
    esiti?: string[] | null;   // risposte cliccabili (mig. 116); null = solo conferma
    meeting_id?: number | null;   // invito riunione (mig. 122): la risposta si riflette sul calendario
    kind: string | null;
};

export function ComunicazioniPopup() {
    const { user } = useAuth();
    const [coda, setCoda] = useState<ComPopup[]>([]);
    const lettureScritte = useRef<Set<number>>(new Set());
    const [salvando, setSalvando] = useState(false);

    const carica = useCallback(async () => {
        if (!user?.id) return;
        try {
            // select a scalare: completa (mig. 116) → senza esiti (mig. 112) → legacy
            const completa = await supabase
                .from("comunicazioni")
                .select("id, title, content, type, date_display, created_by, created_by_name, target_roles, target_stores, target_users, target_brands, esiti, meeting_id, kind")
                .eq("kind", "popup")
                .order("created_at", { ascending: true });
            const esteso = completa.error ? await supabase
                .from("comunicazioni")
                .select("id, title, content, type, date_display, created_by, created_by_name, target_roles, target_stores, target_users, target_brands, kind")
                .eq("kind", "popup")
                .order("created_at", { ascending: true }) : null;
            const legacy = (esteso && esteso.error) ? await supabase
                .from("comunicazioni")
                .select("id, title, content, type, date_display, created_by, created_by_name, target_roles, kind")
                .eq("kind", "popup")
                .order("created_at", { ascending: true }) : null;
            const coms = ((legacy ? legacy.data : esteso ? esteso.data : completa.data) ?? null) as unknown as ComPopup[] | null;
            if (!coms) return;
            const brandsNegozio = await brandDelNegozio(user.negozio);
            const negozi = await negoziAssegnati(user.id);
            const perMe = (coms as ComPopup[]).filter((c) =>
                comunicazionePerMe(c, { userId: user.id, role: user.role || "", negozio: user.negozio, negozi, brandsNegozio }));
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

    // "PIU' TARDI" con ritorno ORARIO (Luca 31/07): niente archiviazione
    // definitiva senza esito — il rinvio dura un'ora (salvato per utente) e
    // il pop-up ricompare finche' non arriva una risposta vera. Il timer
    // sotto fa da "cron" lato client: ogni minuto ricontrolla le scadenze.
    const [rinvii, setRinvii] = useState<Record<number, number>>({});
    const [, setTick] = useState(0);
    useEffect(() => {
        if (!user?.id) return;
        try { setRinvii(JSON.parse(localStorage.getItem(`popup_rinvii_${user.id}`) || "{}")); } catch { /* no-op */ }
    }, [user?.id]);
    useEffect(() => {
        const t = setInterval(() => setTick((x) => x + 1), 60 * 1000);
        return () => clearInterval(t);
    }, []);
    const adesso = Date.now();
    const visibili = coda.filter((c) => !(rinvii[c.id] > adesso));
    const attuale = visibili[0] || null;
    const rinvia = () => {
        if (!attuale || !user?.id) return;
        const next = { ...rinvii, [attuale.id]: Date.now() + 60 * 60 * 1000 };
        setRinvii(next);
        try { localStorage.setItem(`popup_rinvii_${user.id}`, JSON.stringify(next)); } catch { /* no-op */ }
    };

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

    const conferma = async (esito?: string) => {
        if (!attuale || !user?.id) return;
        setSalvando(true);
        const ora = new Date().toISOString();
        const riga: Record<string, unknown> = {
            comunicazione_id: attuale.id,
            user_id: user.id,
            user_name: user.name || null,
            letto_il: ora,
            confermato_il: ora,
        };
        if (esito) riga.esito = esito;
        let { error } = await supabase.from("comunicazioni_ricevute").upsert([riga], { onConflict: "comunicazione_id,user_id" });
        if (error && esito && /column/i.test(error.message)) {
            // mig. 116 non applicata: si salva almeno la conferma
            delete riga.esito;
            ({ error } = await supabase.from("comunicazioni_ricevute").upsert([riga], { onConflict: "comunicazione_id,user_id" }));
        }
        setSalvando(false);
        if (!error) {
            // invito riunione: la risposta si riflette sullo stato in calendario
            if (esito) await sincronizzaRispostaRiunione(attuale.meeting_id, user.id, esito);
            setCoda((p) => p.filter((c) => c.id !== attuale.id));
        }
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
                {/* la conferma E' la scelta di una risposta (esiti, mig. 116);
                    "Piu' tardi" e' solo un RINVIO di un'ora, piccolo e a sinistra
                    (Luca 31/07): il pop-up torna finche' non c'e' l'esito */}
                <div className="flex items-center justify-between gap-2.5 flex-wrap px-6 py-4 border-t border-white/10 bg-black/20">
                    <button type="button" onClick={rinvia} title="Te lo ripropongo tra un'ora, finché non dai una risposta"
                        className="px-2 py-1.5 rounded-lg text-[11px] text-slate-500 hover:text-slate-300 transition-colors shrink-0">
                        Più tardi
                    </button>
                    <div className="flex items-center justify-end gap-2.5 flex-wrap">
                    {attuale.esiti?.length ? (
                        attuale.esiti.map((e) => (
                            <button
                                key={e}
                                type="button"
                                disabled={salvando}
                                onClick={() => conferma(e)}
                                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors disabled:opacity-40"
                            >
                                {salvando ? "…" : e}
                            </button>
                        ))
                    ) : (
                        <button
                            type="button"
                            disabled={salvando}
                            onClick={() => conferma()}
                            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors disabled:opacity-40"
                        >
                            {salvando ? "…" : "✓ Ho letto e confermo"}
                        </button>
                    )}
                    </div>
                </div>
                {visibili.length > 1 && (
                    <div className="px-6 pb-3 -mt-1 text-[11px] text-slate-600 text-right">
                        {visibili.length - 1} altra/e in coda
                    </div>
                )}
            </div>
        </div>
    );
}
