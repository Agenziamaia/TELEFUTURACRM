"use client";

// POP-UP COMUNICAZIONI (Luca 30/07, mig. 104): le comunicazioni kind='popup'
// indirizzate al ruolo dell'utente compaiono AL CENTRO sopra qualsiasi cosa
// stia facendo — subito se e' loggato (realtime + ricontrollo periodico), al
// primo login altrimenti (il componente monta dopo l'auth). Restano in coda
// finche' non vengono CONFERMATE col pulsante; "Piu' tardi" le fa sparire per
// la sessione ma ricompaiono al prossimo accesso. La visualizzazione scrive la
// LETTURA in comunicazioni_ricevute, la conferma scrive confermato_il.
import { useCallback, useEffect, useRef, useState } from "react";
import { Info, AlertTriangle, CheckCircle2, Rocket } from "lucide-react";
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
    allegati?: { url: string; name: string }[] | null;   // mig. 147: apribili PRIMA di confermare
    size?: string | null;                                 // mig. 147: 'grande' = testo in evidenza
    kind: string | null;
};

/* SFONDO ANIMATO del riquadro comunicazione (Luca 03/08): il genere si VEDE.
   🎉 successo: coriandoli in caduta continua + fuochi d'artificio dentro il
   riquadro; 🚀 update: cielo di stelle che salgono; 🚨 urgente: strisce
   hazard in movimento (con bordo pulsante e icona che vibra, classi sotto);
   ℹ️ info: riflesso "cromato" che attraversa la card. Canvas e CSS puri,
   niente librerie: gira anche sui PC dei negozi. */
const CSS_SFONDI = `@keyframes hazardScorri{0%{transform:translateX(0)}100%{transform:translateX(62px)}}
.anim-hazard{animation:hazardScorri 2.2s linear infinite}
@keyframes cromoScorri{0%{background-position:130% 0}100%{background-position:-130% 0}}
.anim-cromo{animation:cromoScorri 3.4s ease-in-out infinite}
@keyframes bordoRosso{0%,100%{box-shadow:0 0 0 0 rgba(244,63,94,.55)}50%{box-shadow:0 0 28px 6px rgba(244,63,94,.30)}}
.anim-bordo-rosso{animation:bordoRosso 1.5s ease-in-out infinite}
@keyframes scossaIcona{0%,86%,100%{transform:rotate(0)}88%{transform:rotate(-9deg)}90%{transform:rotate(8deg)}92%{transform:rotate(-6deg)}94%{transform:rotate(5deg)}96%{transform:rotate(-2deg)}}
.anim-scossa{animation:scossaIcona 2.8s ease-in-out infinite}`;

export function fondoComunicazione(genere?: string | null): string {
    return genere === "success" ? "linear-gradient(160deg,#0d1f13 0%,#12141f 55%,#0f2417 100%)"
        : genere === "warning" ? "linear-gradient(160deg,#220d13 0%,#12141f 55%,#2a0f16 100%)"
            : genere === "update" ? "linear-gradient(160deg,#170f2b 0%,#12141f 55%,#1a1233 100%)"
                : "linear-gradient(160deg,#0f1522 0%,#12141f 60%,#101a2c 100%)";
}

export function SfondoComunicazione({ genere }: { genere?: string | null }) {
    const ref = useRef<HTMLCanvasElement | null>(null);
    const animato = genere === "success" || genere === "update";
    useEffect(() => {
        if (!animato) return;
        const cv = ref.current; if (!cv) return;
        const ctx = cv.getContext("2d"); if (!ctx) return;
        let W = 0, H = 0, raf = 0, vivo = true;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const setup = () => {
            const r = cv.parentElement?.getBoundingClientRect();
            W = Math.max(1, Math.floor(r?.width || 560)); H = Math.max(1, Math.floor(r?.height || 400));
            cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        setup();
        const colori = ["#f59e0b", "#22c55e", "#3b82f6", "#ec4899", "#a78bfa", "#facc15", "#34d399"];
        type Cor = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; w: number; h: number; c: string };
        type Scia = { x: number; y: number; vx: number; vy: number; vita: number; max: number; c: string };
        const coriandoli: Cor[] = []; const scie: Scia[] = [];
        const stelle: { x: number; y: number; v: number; r: number; tw: number }[] = [];
        if (genere === "success") for (let i = 0; i < 34; i++) coriandoli.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .5, vy: .55 + Math.random() * .9, rot: Math.random() * Math.PI, vr: (Math.random() - .5) * .12, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, c: colori[(Math.random() * colori.length) | 0] });
        if (genere === "update") for (let i = 0; i < 42; i++) stelle.push({ x: Math.random() * W, y: Math.random() * H, v: .18 + Math.random() * .5, r: .6 + Math.random() * 1.5, tw: Math.random() * Math.PI * 2 });
        let ultimoBotto = 0;
        const botto = () => {
            const cx = 40 + Math.random() * Math.max(40, W - 80), cy = 26 + Math.random() * (H * .45), c = colori[(Math.random() * colori.length) | 0];
            for (let i = 0; i < 16; i++) { const a = (Math.PI * 2 * i) / 16 + Math.random() * .2; const sp = 1.4 + Math.random() * 1.6; scie.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vita: 0, max: 46 + Math.random() * 22, c }); }
        };
        const tick = (t: number) => {
            if (!vivo) return;
            ctx.clearRect(0, 0, W, H);
            if (genere === "success") {
                if (t - ultimoBotto > 2400) { ultimoBotto = t; botto(); }
                coriandoli.forEach(pt => {
                    pt.x += pt.vx + Math.sin((pt.y + t * .02) * .02) * .3; pt.y += pt.vy; pt.rot += pt.vr;
                    if (pt.y > H + 8) { pt.y = -8; pt.x = Math.random() * W; }
                    ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(pt.rot); ctx.globalAlpha = .8; ctx.fillStyle = pt.c; ctx.fillRect(-pt.w / 2, -pt.h / 2, pt.w, pt.h); ctx.restore();
                });
                for (let i = scie.length - 1; i >= 0; i--) { const sc = scie[i]; sc.vita++; sc.x += sc.vx; sc.y += sc.vy; sc.vy += .028; const a = 1 - sc.vita / sc.max; if (a <= 0) { scie.splice(i, 1); continue; } ctx.globalAlpha = a * .9; ctx.fillStyle = sc.c; ctx.beginPath(); ctx.arc(sc.x, sc.y, 1.8, 0, Math.PI * 2); ctx.fill(); }
                ctx.globalAlpha = 1;
            } else {
                stelle.forEach(st => { st.y -= st.v; st.tw += .05; if (st.y < -4) { st.y = H + 4; st.x = Math.random() * W; } ctx.globalAlpha = .35 + Math.abs(Math.sin(st.tw)) * .5; ctx.fillStyle = "#c4b5fd"; ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill(); });
                ctx.globalAlpha = 1;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        const ro = new ResizeObserver(setup);
        if (cv.parentElement) ro.observe(cv.parentElement);
        return () => { vivo = false; cancelAnimationFrame(raf); ro.disconnect(); };
    }, [genere, animato]);

    return (
        <>
            <style>{CSS_SFONDI}</style>
            {animato ? (
                <canvas ref={ref} className="absolute inset-0 pointer-events-none" aria-hidden />
            ) : genere === "warning" ? (
                <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
                    <div className="absolute -inset-16 anim-hazard" style={{ background: "repeating-linear-gradient(45deg, rgba(244,63,94,0.10) 0 22px, transparent 22px 44px)" }} />
                </div>
            ) : (
                <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
                    <div className="absolute inset-0 anim-cromo" style={{ background: "linear-gradient(105deg, transparent 42%, rgba(255,255,255,0.09) 50%, transparent 58%)", backgroundSize: "260% 100%" }} />
                </div>
            )}
        </>
    );
}

const cnBody = (size?: string | null) => size === "grande"
    ? "px-6 pb-5 text-slate-100 text-lg font-medium leading-relaxed whitespace-pre-wrap max-h-[45vh] overflow-y-auto"
    : "px-6 pb-5 text-slate-200 leading-relaxed whitespace-pre-wrap max-h-[45vh] overflow-y-auto";

export function ComunicazioniPopup() {
    const { user } = useAuth();
    const [coda, setCoda] = useState<ComPopup[]>([]);
    const lettureScritte = useRef<Set<number>>(new Set());
    const [salvando, setSalvando] = useState(false);

    const carica = useCallback(async () => {
        if (!user?.id) return;
        try {
            // select a scalare: v147 (allegati+size) → completa (mig. 116) → senza esiti (mig. 112) → legacy
            const v147 = await supabase
                .from("comunicazioni")
                .select("id, title, content, type, date_display, created_by, created_by_name, target_roles, target_stores, target_users, target_brands, esiti, meeting_id, allegati, size, kind")
                .eq("kind", "popup")
                .order("created_at", { ascending: true });
            const completa = v147.error ? await supabase
                .from("comunicazioni")
                .select("id, title, content, type, date_display, created_by, created_by_name, target_roles, target_stores, target_users, target_brands, esiti, meeting_id, kind")
                .eq("kind", "popup")
                .order("created_at", { ascending: true }) : null;
            const esteso = (completa && completa.error) ? await supabase
                .from("comunicazioni")
                .select("id, title, content, type, date_display, created_by, created_by_name, target_roles, target_stores, target_users, target_brands, kind")
                .eq("kind", "popup")
                .order("created_at", { ascending: true }) : null;
            const legacy = (esteso && esteso.error) ? await supabase
                .from("comunicazioni")
                .select("id, title, content, type, date_display, created_by, created_by_name, target_roles, kind")
                .eq("kind", "popup")
                .order("created_at", { ascending: true }) : null;
            const coms = ((legacy ? legacy.data : esteso ? esteso.data : completa ? completa.data : v147.data) ?? null) as unknown as ComPopup[] | null;
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
    const rinvia = async () => {
        if (!attuale || !user?.id) return;
        const next = { ...rinvii, [attuale.id]: Date.now() + 60 * 60 * 1000 };
        setRinvii(next);
        try { localStorage.setItem(`popup_rinvii_${user.id}`, JSON.stringify(next)); } catch { /* no-op */ }
        // RINVIO TRACCIATO (mig. 141): prima il "Più tardi" restava solo nel
        // localStorage del dispositivo e il mittente non vedeva nulla — ora
        // scrive rinviato_il (ultimo) e incrementa il contatore rinvii.
        try {
            const { data: cur } = await supabase.from("comunicazioni_ricevute")
                .select("letto_il, rinvii").eq("comunicazione_id", attuale.id).eq("user_id", user.id).maybeSingle();
            await supabase.from("comunicazioni_ricevute").upsert([{
                comunicazione_id: attuale.id,
                user_id: user.id,
                user_name: user.name || null,
                letto_il: (cur as { letto_il?: string | null } | null)?.letto_il || new Date().toISOString(),
                rinviato_il: new Date().toISOString(),
                rinvii: (Number((cur as { rinvii?: number | null } | null)?.rinvii) || 0) + 1,
            }], { onConflict: "comunicazione_id,user_id" });
        } catch { /* mig. 141 non applicata: il rinvio resta almeno locale */ }
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
        ? { Icon: AlertTriangle, color: "#fb7185", bg: "rgba(244,63,94,.12)", border: "rgba(244,63,94,.45)" }
        : attuale.type === "success"
            ? { Icon: CheckCircle2, color: "#34d399", bg: "rgba(52,211,153,.12)", border: "rgba(52,211,153,.35)" }
            : attuale.type === "update"
                ? { Icon: Rocket, color: "#a78bfa", bg: "rgba(139,92,246,.12)", border: "rgba(139,92,246,.40)" }
                : { Icon: Info, color: "#60a5fa", bg: "rgba(96,165,250,.12)", border: "rgba(96,165,250,.35)" };
    const { Icon } = stile;

    return (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            {/* buone notizie (type success): esplosione di coriandoli all'apertura */}
            {attuale.type === "success" && <Confetti key={attuale.id} />}
            <div className={`relative w-full max-w-[560px] rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200${attuale.type === "warning" ? " anim-bordo-rosso" : ""}`}
                style={{ background: fondoComunicazione(attuale.type), borderColor: stile.border }}>
                <SfondoComunicazione genere={attuale.type} />
                <div className="relative flex items-start gap-4 p-6 pb-4">
                    <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border${attuale.type === "warning" ? " anim-scossa" : ""}`}
                        style={{ background: stile.bg, borderColor: stile.border, color: stile.color }}>
                        <Icon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: stile.color }}>
                            Comunicazione da confermare
                        </div>
                        <h3 className={attuale.size === "grande" ? "text-2xl font-black text-white leading-tight" : "text-xl font-bold text-white leading-tight"}>
                            {attuale.size === "grande" ? "📢 " : ""}{attuale.title}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            {attuale.date_display}{attuale.created_by_name ? ` — ${attuale.created_by_name}` : ""}
                        </p>
                    </div>
                </div>
                <div className={"relative " + cnBody(attuale.size)}>
                    {attuale.content}
                </div>
                {/* ALLEGATI (mig. 147): apribili SUBITO, senza dover confermare */}
                {(attuale.allegati?.length ?? 0) > 0 && (
                    <div className="relative px-6 pb-4 flex flex-wrap gap-2">
                        {attuale.allegati!.map((a) => (
                            <a key={a.url} href={a.url} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/15 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:border-white/30 transition-colors">
                                📎 {a.name}
                            </a>
                        ))}
                    </div>
                )}
                {/* la conferma E' la scelta di una risposta (esiti, mig. 116);
                    "Piu' tardi" e' solo un RINVIO di un'ora, piccolo e a sinistra
                    (Luca 31/07): il pop-up torna finche' non c'e' l'esito */}
                <div className="relative flex items-center justify-between gap-2.5 flex-wrap px-6 py-4 border-t border-white/10 bg-black/20">
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

// Esplosione di coriandoli / fuochi d'artificio all'apertura di una "buona
// notizia". Canvas autonomo (nessuna dipendenza), pointer-events none così non
// blocca i pulsanti, one-shot (~3s poi si ferma). Rispetta prefers-reduced-motion.
export function Confetti() {   // esportato (03/08): festa anche aprendo le buone notizie in bacheca
    const ref = useRef<HTMLCanvasElement | null>(null);
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
        const canvas = ref.current; if (!canvas) return;
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let W = window.innerWidth, H = window.innerHeight;
        const setup = () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
        setup();
        const colors = ["#34d399", "#10b981", "#fbbf24", "#f472b6", "#60a5fa", "#a78bfa", "#f87171", "#facc15", "#22d3ee"];
        type P = { x: number; y: number; vx: number; vy: number; size: number; color: string; rot: number; vr: number; shape: number };
        const parts: P[] = [];
        const burst = (cx: number, cy: number, n: number, power: number) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2;
                const s = power * (0.35 + Math.random() * 0.9);
                parts.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - power * 0.5, size: 5 + Math.random() * 7, color: colors[(Math.random() * colors.length) | 0], rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35, shape: (Math.random() * 3) | 0 });
            }
        };
        // due esplosioni ravvicinate = effetto fuochi d'artificio
        burst(W * 0.5, H * 0.34, 140, 11);
        const t2 = setTimeout(() => burst(W * 0.5, H * 0.30, 90, 13), 220);
        const start = Date.now();
        let raf = 0;
        const tick = () => {
            const t = Date.now() - start;
            ctx.clearRect(0, 0, W, H);
            let alive = false;
            for (const p of parts) {
                p.vy += 0.24; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
                const life = Math.max(0, 1 - t / 2900);
                if (life <= 0 || p.y > H + 30) continue;
                alive = true;
                ctx.save(); ctx.globalAlpha = life; ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
                if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
                else if (p.shape === 1) { ctx.beginPath(); ctx.arc(0, 0, p.size * 0.45, 0, Math.PI * 2); ctx.fill(); }
                else { ctx.beginPath(); ctx.moveTo(0, -p.size * 0.5); ctx.lineTo(p.size * 0.5, p.size * 0.4); ctx.lineTo(-p.size * 0.5, p.size * 0.4); ctx.closePath(); ctx.fill(); }
                ctx.restore();
            }
            if (alive && t < 3400) raf = requestAnimationFrame(tick);
            else ctx.clearRect(0, 0, W, H);
        };
        raf = requestAnimationFrame(tick);
        window.addEventListener("resize", setup);
        return () => { cancelAnimationFrame(raf); clearTimeout(t2); window.removeEventListener("resize", setup); };
    }, []);
    return <canvas ref={ref} aria-hidden style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 6000 }} />;
}
