"use client";

// POP-UP COMUNICAZIONI (Luca 30/07, mig. 104): le comunicazioni kind='popup'
// indirizzate al ruolo dell'utente compaiono AL CENTRO sopra qualsiasi cosa
// stia facendo — subito se e' loggato (realtime + ricontrollo periodico), al
// primo login altrimenti (il componente monta dopo l'auth). Restano in coda
// finche' non vengono CONFERMATE col pulsante; "Piu' tardi" le fa sparire per
// la sessione ma ricompaiono al prossimo accesso. La visualizzazione scrive la
// LETTURA in comunicazioni_ricevute, la conferma scrive confermato_il.
import { useCallback, useEffect, useRef, useState } from "react";
import { Info, AlertTriangle, CheckCircle2, Rocket, Bomb, Flame } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { visibleInterval } from "@/lib/visibleInterval";
import { useAuth } from "@/context/AuthContext";
import { comunicazionePerMe, brandDelNegozio, negoziAssegnati, sincronizzaRispostaRiunione } from "@/lib/comunicazioniTarget";
import { sanificaHtml } from "@/components/EditorRicco";

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
    size?: string | null;                                 // 'piccola' | 'normale' | 'grande' (mig. 158)
    content_html?: string | null;                         // mig. 155: testo RICCO dell'editor
    sprint_frase?: string | null;                         // MOD-19: frase del calderone (tipo sprint)
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
.anim-scossa{animation:scossaIcona 2.8s ease-in-out infinite}
@keyframes bombaScossa{0%{transform:translate(0,0) rotate(0)}4%{transform:translate(-28px,20px) rotate(-1.6deg)}8%{transform:translate(26px,-22px) rotate(1.4deg)}12%{transform:translate(-24px,16px) rotate(-1.2deg)}16%{transform:translate(22px,-14px) rotate(1deg)}22%{transform:translate(-18px,12px) rotate(-.8deg)}28%{transform:translate(15px,-10px) rotate(.65deg)}36%{transform:translate(-12px,8px) rotate(-.5deg)}46%{transform:translate(9px,-6px) rotate(.35deg)}58%{transform:translate(-6px,4px) rotate(-.22deg)}72%{transform:translate(4px,-3px) rotate(.12deg)}86%{transform:translate(-2px,1px) rotate(-.05deg)}100%{transform:translate(0,0) rotate(0)}}
@keyframes bombaFlash{0%{opacity:0}3%{opacity:1}7%{opacity:.25}11%{opacity:1}16%{opacity:.4}24%{opacity:.9}38%{opacity:.5}60%{opacity:.22}100%{opacity:0}}
@keyframes bordoOro{0%,100%{box-shadow:0 0 0 0 rgba(251,191,36,.55)}50%{box-shadow:0 0 30px 7px rgba(251,191,36,.32)}}
.anim-bordo-oro{animation:bordoOro 1.4s ease-in-out infinite}
@keyframes fraseSprintIn{0%{transform:scale(.55) translateY(16px);opacity:0}100%{transform:scale(1) translateY(0);opacity:1}}`;

export function fondoComunicazione(genere?: string | null): string {
    return genere === "success" ? "linear-gradient(160deg,#0d1f13 0%,#12141f 55%,#0f2417 100%)"
        : genere === "warning" ? "linear-gradient(160deg,#220d13 0%,#12141f 55%,#2a0f16 100%)"
            : genere === "update" ? "linear-gradient(160deg,#170f2b 0%,#12141f 55%,#1a1233 100%)"
                : genere === "novita" ? "linear-gradient(160deg,#2b1206 0%,#12141f 55%,#331107 100%)"
                    : genere === "sprint" ? "linear-gradient(160deg,#2b2206 0%,#12141f 55%,#332607 100%)"
                        : "linear-gradient(160deg,#0f1522 0%,#12141f 60%,#101a2c 100%)";
}

export function SfondoComunicazione({ genere }: { genere?: string | null }) {
    const ref = useRef<HTMLCanvasElement | null>(null);
    const animato = genere === "success" || genere === "update" || genere === "novita" || genere === "sprint";
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
        // 💣 novita: BRACI — scintille di fuoco che salgono + mini-esplosioni
        // 🔥 sprint (MOD-19): stesse braci ma DORATE
        const fuoco = genere === "sprint"
            ? ["#fbbf24", "#f59e0b", "#fde047", "#f97316", "#fff7d6"]
            : ["#fb923c", "#f97316", "#fbbf24", "#ef4444", "#fde047"];
        const braci: { x: number; y: number; v: number; r: number; tw: number; c: string }[] = [];
        if (genere === "success") for (let i = 0; i < 34; i++) coriandoli.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .5, vy: .55 + Math.random() * .9, rot: Math.random() * Math.PI, vr: (Math.random() - .5) * .12, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, c: colori[(Math.random() * colori.length) | 0] });
        if (genere === "update") for (let i = 0; i < 42; i++) stelle.push({ x: Math.random() * W, y: Math.random() * H, v: .18 + Math.random() * .5, r: .6 + Math.random() * 1.5, tw: Math.random() * Math.PI * 2 });
        if (genere === "novita" || genere === "sprint") for (let i = 0; i < 38; i++) braci.push({ x: Math.random() * W, y: Math.random() * H, v: .3 + Math.random() * .75, r: .7 + Math.random() * 1.7, tw: Math.random() * Math.PI * 2, c: fuoco[(Math.random() * fuoco.length) | 0] });
        let ultimoBotto = 0;
        const botto = (pal: string[] = colori) => {
            const cx = 40 + Math.random() * Math.max(40, W - 80), cy = 26 + Math.random() * (H * .45), c = pal[(Math.random() * pal.length) | 0];
            for (let i = 0; i < 16; i++) { const a = (Math.PI * 2 * i) / 16 + Math.random() * .2; const sp = 1.4 + Math.random() * 1.6; scie.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vita: 0, max: 46 + Math.random() * 22, c }); }
        };
        const disegnaScie = () => {
            for (let i = scie.length - 1; i >= 0; i--) { const sc = scie[i]; sc.vita++; sc.x += sc.vx; sc.y += sc.vy; sc.vy += .028; const a = 1 - sc.vita / sc.max; if (a <= 0) { scie.splice(i, 1); continue; } ctx.globalAlpha = a * .9; ctx.fillStyle = sc.c; ctx.beginPath(); ctx.arc(sc.x, sc.y, 1.8, 0, Math.PI * 2); ctx.fill(); }
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
                disegnaScie();
                ctx.globalAlpha = 1;
            } else if (genere === "novita" || genere === "sprint") {
                // braci che salgono con sfarfallio + mini-esplosioni periodiche
                if (t - ultimoBotto > 1900) { ultimoBotto = t; botto(fuoco); }
                braci.forEach(b => {
                    b.y -= b.v; b.x += Math.sin((b.y + t * .03) * .04) * .35; b.tw += .07;
                    if (b.y < -4) { b.y = H + 4; b.x = Math.random() * W; }
                    ctx.globalAlpha = .3 + Math.abs(Math.sin(b.tw)) * .55; ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
                });
                disegnaScie();
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

/* TAGLIE v2 (Luca 04/08, mig. 158): piccola = ex normale, normale = ex grande,
   GRANDE = popup quasi-fullscreen; in bacheca la card resta di dimensioni
   normali con testi extra-large. Fallback null/valori legacy → piccola.
   UNICA fonte di verita' per popup, card di bacheca e anteprima del form. */
export const stileTaglia = (size?: string | null) => {
    const s = size === "grande" || size === "normale" ? size : "piccola";
    return {
        s,
        // il megafono resta sulle taglie in evidenza
        prefisso: s === "piccola" ? "" : "📢 ",
        // contenitore del POPUP (grande = quasi tutto lo schermo)
        popup: s === "grande" ? "w-[min(1200px,96vw)] min-h-[80vh] flex flex-col" : "w-full max-w-[560px]",
        titoloPopup: s === "grande" ? "text-3xl sm:text-4xl font-black text-white leading-tight"
            : s === "normale" ? "text-2xl font-black text-white leading-tight"
                : "text-xl font-bold text-white leading-tight",
        corpoPopup: s === "grande" ? "px-6 pb-5 flex-1 text-slate-100 text-xl sm:text-2xl font-medium leading-relaxed whitespace-pre-wrap max-h-[60vh] overflow-y-auto"
            : s === "normale" ? "px-6 pb-5 text-slate-100 text-lg font-medium leading-relaxed whitespace-pre-wrap max-h-[45vh] overflow-y-auto"
                : "px-6 pb-5 text-slate-200 leading-relaxed whitespace-pre-wrap max-h-[45vh] overflow-y-auto",
        // card di BACHECA: stessa card, testi che crescono
        titoloCard: s === "grande" ? "text-3xl font-black" : s === "normale" ? "text-2xl font-black" : "text-lg font-semibold",
        corpoCard: s === "grande" ? "text-xl text-slate-100" : s === "normale" ? "text-base text-slate-100" : "text-slate-300",
    };
};

export function ComunicazioniPopup() {
    const { user } = useAuth();
    const [coda, setCoda] = useState<ComPopup[]>([]);
    const lettureScritte = useRef<Set<number>>(new Set());
    const [salvando, setSalvando] = useState(false);

    const carica = useCallback(async () => {
        if (!user?.id) return;
        try {
            // select a scalare: v190 (sprint_frase, MOD-19) → v147 (allegati+size)
            // → completa (mig. 116) → senza esiti (mig. 112) → legacy
            const v190 = await supabase
                .from("comunicazioni")
                .select("id, title, content, content_html, type, date_display, created_by, created_by_name, target_roles, target_stores, target_users, target_brands, esiti, meeting_id, allegati, size, kind, sprint_frase")
                .eq("kind", "popup")
                .order("created_at", { ascending: true });
            const v147 = v190.error ? await supabase
                .from("comunicazioni")
                .select("id, title, content, content_html, type, date_display, created_by, created_by_name, target_roles, target_stores, target_users, target_brands, esiti, meeting_id, allegati, size, kind")
                .eq("kind", "popup")
                .order("created_at", { ascending: true }) : null;
            const completa = (v147 && v147.error) ? await supabase
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
            const coms = ((legacy ? legacy.data : esteso ? esteso.data : completa ? completa.data : v147 ? v147.data : v190.data) ?? null) as unknown as ComPopup[] | null;
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
        const stop = visibleInterval(carica, 5 * 60 * 1000);
        return () => { supabase.removeChannel(ch); stop(); };
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
        const stop = visibleInterval(() => setTick((x) => x + 1), 60 * 1000);
        return () => stop();
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

    // MOD-19 (Luca 10/08): nel POPUP gli effetti si RIPETONO finché non si
    // conferma. "colpo" è un contatore che ri-monta il one-shot (key diversa):
    // bomba ~11s, fuochi ~9s, sirena ~6s, radar ~6,5s. Update e Sprint non
    // ripetono il colpo iniziale (razzo/countdown): hanno l'AMBIENT continuo
    // dietro la card (razzi che sfrecciano / fiamme+parole). Il vecchio guard
    // "bomba una volta sola" resta SOLO in bacheca: qui il loop è voluto.
    const [colpo, setColpo] = useState(0);
    useEffect(() => {
        setColpo(0);
        if (!attuale) return;
        const RIPETI: Record<string, number> = { novita: 11000, success: 9000, warning: 6000, info: 6500 };
        const ms = RIPETI[attuale.type];
        if (!ms) return;
        const t = setInterval(() => setColpo((c) => c + 1), ms);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attuale?.id, attuale?.type]);

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
                : attuale.type === "novita"
                    ? { Icon: Bomb, color: "#fb923c", bg: "rgba(251,146,60,.12)", border: "rgba(249,115,22,.45)" }
                    : attuale.type === "sprint"
                        ? { Icon: Flame, color: "#fbbf24", bg: "rgba(251,191,36,.12)", border: "rgba(245,158,11,.5)" }
                        : { Icon: Info, color: "#60a5fa", bg: "rgba(96,165,250,.12)", border: "rgba(96,165,250,.35)" };
    const { Icon } = stile;
    const taglia = stileTaglia(attuale.size);

    // MOD-37: com-scura = ISOLA SCURA — la card resta scenografica scura anche
    // in tema chiaro, i testi NON si ribaltano (vedi globals.css)
    return (
        <div className="com-scura fixed inset-0 z-[5000] flex flex-col items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            {/* MOD-19: one-shot RIPETUTI fino a conferma (key con colpo) */}
            {attuale.type === "success" && <Confetti key={attuale.id + ":" + colpo} />}
            {attuale.type === "novita" && <EsplosioneBomba key={attuale.id + ":" + colpo} />}
            {attuale.type === "warning" && <ImpulsoOnde tipo="warning" key={attuale.id + ":" + colpo} />}
            {attuale.type === "info" && <ImpulsoOnde tipo="info" key={attuale.id + ":" + colpo} />}
            {attuale.type === "update" && <RazzoUpdate key={"rz" + attuale.id} />}
            {attuale.type === "sprint" && <SprintStart key={"sp" + attuale.id} />}
            {/* ambient CONTINUO dietro la card: smile / razzi / bombette+crepe / fiamme+parole */}
            {(attuale.type === "success" || attuale.type === "update" || attuale.type === "sprint" || attuale.type === "novita") &&
                <AmbientComunicazione genere={attuale.type} key={"amb" + attuale.id} />}
            {/* 🔥 sprint: la FRASE dal calderone SOPRA la comunicazione, dopo il countdown */}
            {attuale.type === "sprint" && attuale.sprint_frase && (
                <div key={"fr" + attuale.id} className="relative max-w-[min(720px,92vw)] mb-4 text-center font-black"
                    style={{ color: "#fde047", fontSize: "clamp(19px,3vw,27px)", lineHeight: 1.25, textShadow: "0 0 24px rgba(251,191,36,.75), 0 2px 4px rgba(0,0,0,.8)", opacity: 0, animation: "fraseSprintIn .5s cubic-bezier(.17,.89,.32,1.35) 2.35s both" }}>
                    🔥 {attuale.sprint_frase}
                </div>
            )}
            <div className={`relative ${taglia.popup} rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200${attuale.type === "warning" ? " anim-bordo-rosso" : attuale.type === "sprint" ? " anim-bordo-oro" : ""}`}
                style={{ background: fondoComunicazione(attuale.type), borderColor: stile.border }}>
                <SfondoComunicazione genere={attuale.type} />
                <div className="relative flex items-start gap-4 p-6 pb-4">
                    <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border${(attuale.type === "warning" || attuale.type === "sprint") ? " anim-scossa" : ""}`}
                        style={{ background: stile.bg, borderColor: stile.border, color: stile.color }}>
                        <Icon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: stile.color }}>
                            Comunicazione da confermare
                        </div>
                        <h3 className={taglia.titoloPopup}>
                            {taglia.prefisso}{attuale.title}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            {attuale.date_display}{attuale.created_by_name ? ` — ${attuale.created_by_name}` : ""}
                        </p>
                    </div>
                </div>
                <div className={"relative " + taglia.corpoPopup}>
                    {attuale.content_html
                        ? <div className="testo-ricco" dangerouslySetInnerHTML={{ __html: sanificaHtml(attuale.content_html) }} />
                        : attuale.content}
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

// 💣 ESPLOSIONE BOMBA v2 (Luca 05/08: «deve scoppiare il computer, falla
// esagerata»). Sequenza cinematografica ~4.5s: INNESCO (la bomba cade al
// centro con la miccia che sfrigola, lo schermo si oscura) → DETONAZIONE
// (flash a strobo, palla di fuoco turbolenta, TRIPLA onda d'urto, scossa
// violenta dello schermo, CREPE tipo vetro rotto) → FALLOUT (600+ detriti
// fiammeggianti con scia, scintille, fumo che sale, braci che sfarfallano,
// vignetta rossa che sfuma). One-shot, canvas autonomo pointer-events none.
// Il guard "una volta per utente e comunicazione" sta nel chiamante
// (localStorage bomba_vista_*). Rispetta prefers-reduced-motion: non parte.
const BOOM_MS = 430;   // durata dell'innesco: poi BOOM
export function EsplosioneBomba() {
    const ref = useRef<HTMLCanvasElement | null>(null);
    const flashRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
        // SCOSSA + FLASH partono alla DETONAZIONE (dopo l'innesco), non al mount
        const prima = document.body.style.animation;
        const tBoom = setTimeout(() => {
            if (flashRef.current) flashRef.current.style.animation = "bombaFlash 2.6s ease-out forwards";
            document.body.style.animation = "bombaScossa 1.5s cubic-bezier(.36,.07,.19,.97) both";
        }, BOOM_MS);
        const tFine = setTimeout(() => { document.body.style.animation = prima; }, BOOM_MS + 1600);
        return () => { clearTimeout(tBoom); clearTimeout(tFine); document.body.style.animation = prima; };
    }, []);
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
        const canvas = ref.current; if (!canvas) return;
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let W = window.innerWidth, H = window.innerHeight;
        const setup = () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
        setup();
        const cx = W * 0.5, cy = H * 0.45;
        // tipi particella: 0 detrito fiammeggiante, 1 scintilla con scia, 2 fumo, 3 brace
        const TINTE: string[][] = [
            ["#fb923c", "#f97316", "#fbbf24", "#ef4444", "#fde047", "#fca5a5", "#78716c"],
            ["#fff7ed", "#fde047", "#fef3c7", "#fdba74"],
            ["#57534e", "#44403c", "#78716c"],
            ["#fb923c", "#ef4444", "#f97316"],
        ];
        type P = { x: number; y: number; vx: number; vy: number; size: number; color: string; rot: number; vr: number; tipo: number };
        const parts: P[] = [];
        const raffica = (n: number, power: number, tipo: number) => {
            const tinte = TINTE[tipo];
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2;
                const s = power * (0.3 + Math.random() * 1.0) * (tipo === 1 ? 1.6 : tipo === 2 ? 0.35 : tipo === 3 ? 0.55 : 1);
                parts.push({
                    x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - power * 0.25,
                    size: tipo === 1 ? 1.5 + Math.random() * 2 : tipo === 2 ? 14 + Math.random() * 18 : tipo === 3 ? 2 + Math.random() * 3.5 : 5 + Math.random() * 9,
                    color: tinte[(Math.random() * tinte.length) | 0],
                    rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.5, tipo,
                });
            }
        };
        // CREPE tipo vetro rotto: polilinee che si irradiano dal centro
        const crepe: [number, number][][] = [];
        const generaCrepe = () => {
            const maxDim = Math.max(W, H);
            const nCrepe = 9 + ((Math.random() * 3) | 0);
            for (let i = 0; i < nCrepe; i++) {
                let a = (i / nCrepe) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
                let x = cx, y = cy;
                const pts: [number, number][] = [[x, y]];
                const segs = 9 + ((Math.random() * 6) | 0);
                for (let k = 0; k < segs; k++) {
                    const passo = maxDim * (0.03 + Math.random() * 0.06);
                    a += (Math.random() - 0.5) * 0.55;
                    x += Math.cos(a) * passo; y += Math.sin(a) * passo;
                    pts.push([x, y]);
                }
                crepe.push(pts);
            }
        };
        let esplosa = false;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const start = Date.now();
        let raf = 0;
        const tick = () => {
            const t = Date.now() - start;
            ctx.clearRect(0, 0, W, H);
            if (t < BOOM_MS) {
                // ── INNESCO: buio che sale, bomba che cade, miccia che sfrigola ──
                ctx.globalAlpha = Math.min(0.6, (t / BOOM_MS) * 0.6);
                ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
                const p = t / BOOM_MS;
                const by = cy - (1 - p * p) * H * 0.55;
                ctx.save(); ctx.translate(cx, by); ctx.rotate(Math.sin(t / 90) * 0.14);
                ctx.font = "92px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText("💣", 0, 0); ctx.restore();
                for (let i = 0; i < 4; i++) {
                    ctx.globalAlpha = 0.5 + Math.random() * 0.5;
                    ctx.fillStyle = i % 2 ? "#fde047" : "#fff7ed";
                    ctx.beginPath();
                    ctx.arc(cx + 36 + (Math.random() - 0.5) * 18, by - 48 + (Math.random() - 0.5) * 18, 1.2 + Math.random() * 2.4, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
            } else {
                const te = t - BOOM_MS;
                if (!esplosa) {
                    esplosa = true; generaCrepe();
                    raffica(240, 19, 0); raffica(150, 26, 1); raffica(60, 6, 2); raffica(120, 9, 3);
                    timers.push(setTimeout(() => { raffica(120, 14, 0); raffica(60, 20, 1); }, 180));
                    timers.push(setTimeout(() => { raffica(80, 11, 0); raffica(50, 6, 3); }, 420));
                }
                // ── PALLA DI FUOCO turbolenta (0–900ms) ──
                if (te < 900) {
                    const p = te / 900;
                    const R = 40 + p * Math.min(W, H) * 0.55;
                    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
                    g.addColorStop(0, `rgba(255,247,237,${0.95 * (1 - p)})`);
                    g.addColorStop(0.25, `rgba(253,224,71,${0.85 * (1 - p)})`);
                    g.addColorStop(0.55, `rgba(249,115,22,${0.7 * (1 - p)})`);
                    g.addColorStop(0.85, `rgba(239,68,68,${0.4 * (1 - p)})`);
                    g.addColorStop(1, "rgba(0,0,0,0)");
                    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
                    for (let i = 0; i < 7; i++) {
                        const a = (i / 7) * Math.PI * 2 + p * 2;
                        ctx.globalAlpha = 0.25 * (1 - p);
                        ctx.fillStyle = i % 2 ? "#f97316" : "#fbbf24";
                        ctx.beginPath();
                        ctx.arc(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.44, R * 0.28 * (0.6 + Math.random() * 0.3), 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.globalAlpha = 1;
                }
                // ── TRIPLA ONDA D'URTO ──
                const onde: [number, number, string, number][] = [[0, 750, "#fdba74", 16], [120, 850, "#f97316", 30], [320, 950, "#fca5a5", 10]];
                for (const [ritardo, dur, col, lw] of onde) {
                    const tt = te - ritardo;
                    if (tt > 0 && tt < dur) {
                        const p = tt / dur;
                        const r = 30 + p * Math.max(W, H) * 0.95;
                        ctx.globalAlpha = (1 - p) * 0.75; ctx.lineWidth = lw * (1 - p) + 2; ctx.strokeStyle = col;
                        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
                    }
                }
                // ── CREPE: lo schermo "si rompe", poi sfumano ──
                if (te < 2100) {
                    ctx.save();
                    ctx.globalAlpha = te < 1400 ? 0.85 : 0.85 * (1 - (te - 1400) / 700);
                    ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1.4;
                    ctx.shadowColor = "rgba(255,255,255,.8)"; ctx.shadowBlur = 5;
                    for (const c of crepe) {
                        ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]);
                        for (let k = 1; k < c.length; k++) ctx.lineTo(c[k][0], c[k][1]);
                        ctx.stroke();
                    }
                    ctx.restore();
                }
                // ── VIGNETTA rossa ai bordi che sfuma ──
                if (te < 2400) {
                    const p = 1 - te / 2400;
                    const vg = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, Math.max(W, H) * 0.8);
                    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(127,29,29,${0.5 * p})`);
                    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
                }
                // ── PARTICELLE: detriti con coda, scintille con scia, fumo, braci ──
                let vivo = false;
                for (const p of parts) {
                    const grav = p.tipo === 2 ? -0.02 : p.tipo === 1 ? 0.16 : p.tipo === 3 ? 0.12 : 0.3;
                    p.vy += grav; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
                    if (p.tipo === 2) p.size *= 1.006;
                    const durVita = p.tipo === 1 ? 1100 : p.tipo === 2 ? 3600 : p.tipo === 3 ? 3400 : 2600;
                    const vita = Math.max(0, 1 - te / durVita);
                    if (vita <= 0 || p.y > H + 40) continue;
                    vivo = true;
                    ctx.save();
                    ctx.globalAlpha = p.tipo === 3 ? vita * (0.55 + 0.45 * Math.sin(te / 60 + p.rot * 13)) : p.tipo === 2 ? vita * 0.3 : vita;
                    ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
                    if (p.tipo === 1) {
                        ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
                        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-p.vx * 2.2, -p.vy * 2.2); ctx.stroke();
                    } else if (p.tipo === 2 || p.tipo === 3) {
                        ctx.beginPath(); ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2); ctx.fill();
                    } else {
                        ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
                        ctx.globalAlpha *= 0.5; ctx.fillStyle = "#fbbf24";
                        ctx.fillRect(-p.size / 2 - p.vx * 1.2, -p.size * 0.2 - p.vy * 1.2, p.size * 0.7, p.size * 0.4);
                    }
                    ctx.restore();
                }
                if (!vivo && te > 2600) { ctx.clearRect(0, 0, W, H); return; }
            }
            if (t < BOOM_MS + 4300) raf = requestAnimationFrame(tick);
            else ctx.clearRect(0, 0, W, H);
        };
        raf = requestAnimationFrame(tick);
        window.addEventListener("resize", setup);
        return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); window.removeEventListener("resize", setup); };
    }, []);
    return (
        <>
            <style>{CSS_SFONDI}</style>
            {/* FLASH bianco/arancio a tutto schermo: parte dall'effect, sfuma da solo */}
            <div ref={flashRef} aria-hidden style={{ position: "fixed", inset: 0, zIndex: 6001, pointerEvents: "none", background: "radial-gradient(circle at 50% 45%, rgba(255,247,237,.95) 0%, rgba(251,146,60,.75) 30%, rgba(239,68,68,.35) 55%, transparent 78%)", opacity: 0 }} />
            <canvas ref={ref} aria-hidden style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 6000 }} />
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MOD-19 (Luca 10/08) — EFFETTI NUOVI, stessa filosofia della bomba: canvas
// autonomi pointer-events none, one-shot o loop, prefers-reduced-motion
// rispettato, zero librerie. Esportati: li usa anche la bacheca.
// ═══════════════════════════════════════════════════════════════════════════

/** 🔥 SPRINT — countdown 3·2·1 a battito → "SPRINT! 💪" gigante che sbatte
 *  sullo schermo con scossa, onda d'urto dorata e scintille. One-shot ~2.1s. */
export function SprintStart() {
    const ref = useRef<HTMLCanvasElement | null>(null);
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
        const canvas = ref.current; if (!canvas) return;
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = window.innerWidth, H = window.innerHeight;
        canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cx = W * 0.5, cy = H * 0.42;
        const STEP = 340, SLAM = STEP * 3, FINE = SLAM + 1050;
        let slammed = false, raf = 0;
        const particelle: { x: number; y: number; vx: number; vy: number; size: number; c: string }[] = [];
        const prima = document.body.style.animation;
        const start = Date.now();
        const tick = () => {
            const t = Date.now() - start;
            ctx.clearRect(0, 0, W, H);
            if (t < FINE) {
                const vAl = t < SLAM ? 0.45 : 0.45 * (1 - (t - SLAM) / 1050);
                const vg = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.18, cx, cy, Math.max(W, H) * 0.75);
                vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(0,0,0,${Math.max(0, vAl)})`);
                ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
            }
            if (t < SLAM) {
                const idx = Math.floor(t / STEP), tt = (t % STEP) / STEP;
                const num = String(3 - idx);
                const sc = 1.65 - tt * 0.65, al = tt < .15 ? tt / .15 : 1 - (tt - .15) / .85 * 0.35;
                ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.globalAlpha = Math.max(0, al);
                ctx.font = "900 150px ui-sans-serif,system-ui,sans-serif";
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 44;
                ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 10; ctx.strokeText(num, 0, 0);
                ctx.fillStyle = "#fde047"; ctx.fillText(num, 0, 0); ctx.restore();
                const rr = Math.min(W, H) * (0.34 - tt * 0.10);
                ctx.save(); ctx.globalAlpha = .5; ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
            } else {
                if (!slammed) {
                    slammed = true;
                    document.body.style.animation = "bombaScossa 1.1s cubic-bezier(.36,.07,.19,.97) both";
                    setTimeout(() => { document.body.style.animation = prima; }, 1200);
                    for (let i = 0; i < 130; i++) {
                        const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 11;
                        particelle.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, size: 2.5 + Math.random() * 4, c: ["#fbbf24", "#f97316", "#fde047", "#fff7d6"][(Math.random() * 4) | 0] });
                    }
                }
                const ts = t - SLAM;
                // onde d'urto dorate
                const onde: [number, number][] = [[0, 750], [140, 900], [300, 1050]];
                for (const [rit, dur] of onde) {
                    const tt2 = ts - rit;
                    if (tt2 > 0 && tt2 < dur) {
                        const p = tt2 / dur; const r = 30 + p * Math.max(W, H) * 0.9;
                        ctx.globalAlpha = (1 - p) * 0.7; ctx.lineWidth = 18 * (1 - p) + 2; ctx.strokeStyle = "#fbbf24";
                        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
                    }
                }
                // SPRINT! che sbatte dentro
                const sc2 = ts < 160 ? 2.4 - (ts / 160) * 1.4 : 1;
                const al2 = ts < 160 ? ts / 160 : ts > 820 ? Math.max(0, 1 - (ts - 820) / 230) : 1;
                ctx.save(); ctx.translate(cx, cy); ctx.scale(sc2, sc2); ctx.rotate(-0.04); ctx.globalAlpha = al2;
                const fsz = Math.min(130, W / 6.2);
                ctx.font = "900 " + fsz + "px ui-sans-serif,system-ui,sans-serif";
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 60;
                ctx.strokeStyle = "rgba(0,0,0,.65)"; ctx.lineWidth = 12; ctx.strokeText("SPRINT! 💪", 0, 0);
                ctx.fillStyle = "#fde047"; ctx.fillText("SPRINT! 💪", 0, 0); ctx.restore();
                for (let j = particelle.length - 1; j >= 0; j--) {
                    const p = particelle[j];
                    p.vy += 0.22; p.vx *= 0.99; p.x += p.vx; p.y += p.vy;
                    const vp = Math.max(0, 1 - ts / 1000);
                    if (vp <= 0) { particelle.splice(j, 1); continue; }
                    ctx.globalAlpha = vp; ctx.fillStyle = p.c;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
                }
                ctx.globalAlpha = 1;
            }
            if (t < FINE) raf = requestAnimationFrame(tick);
            else ctx.clearRect(0, 0, W, H);
        };
        raf = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(raf); document.body.style.animation = prima; };
    }, []);
    return (
        <>
            <style>{CSS_SFONDI}</style>
            <canvas ref={ref} aria-hidden style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 6002 }} />
        </>
    );
}

/** 🚀 UPDATE — il razzo attraversa lo schermo, si schianta al centro e DETONA
 *  (burst viola + onde + scossa leggera). One-shot ~2.3s. */
export function RazzoUpdate() {
    const ref = useRef<HTMLCanvasElement | null>(null);
    const rocketRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
        const canvas = ref.current; if (!canvas) return;
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = window.innerWidth, H = window.innerHeight;
        canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cx = W * 0.5, cy = H * 0.45;
        // volo del razzo (Web Animations API sul div)
        rocketRef.current?.animate([
            { transform: "translate(-80vw,60vh) rotate(45deg) scale(.45)", opacity: 0 },
            { transform: "translate(-60vw,45vh) rotate(45deg) scale(.6)", opacity: 1, offset: .12 },
            { transform: "translate(0,0) rotate(45deg) scale(1.15)", opacity: 1, offset: .82 },
            { transform: "translate(4vw,-3vh) rotate(45deg) scale(1.5)", opacity: 0 },
        ], { duration: 1150, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
        const parts: { x: number; y: number; vx: number; vy: number; size: number; c: string; rot: number; vr: number }[] = [];
        let raf = 0, esploso = false;
        const prima = document.body.style.animation;
        const start = Date.now();
        const tick = () => {
            const t = Date.now() - start;
            ctx.clearRect(0, 0, W, H);
            if (t >= 1050 && !esploso) {
                esploso = true;
                document.body.style.animation = "bombaScossa .8s cubic-bezier(.36,.07,.19,.97) both";
                setTimeout(() => { document.body.style.animation = prima; }, 900);
                for (let i = 0; i < 160; i++) {
                    const a = Math.random() * Math.PI * 2, s = 13 * (0.3 + Math.random());
                    parts.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 3, size: 3 + Math.random() * 6, c: ["#a78bfa", "#8b5cf6", "#c4b5fd", "#f97316", "#fde047"][(Math.random() * 5) | 0], rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4 });
                }
            }
            if (esploso) {
                const te = t - 1050;
                if (te < 380) {
                    const pf = 1 - te / 380;
                    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.42);
                    g.addColorStop(0, `rgba(167,139,250,${0.55 * pf})`); g.addColorStop(1, "rgba(167,139,250,0)");
                    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, Math.min(W, H) * 0.5, 0, Math.PI * 2); ctx.fill();
                }
                const onde: [number, number, string][] = [[0, 750, "#a78bfa"], [140, 900, "#8b5cf6"], [300, 1050, "#c4b5fd"]];
                for (const [rit, dur, col] of onde) {
                    const tt = te - rit;
                    if (tt > 0 && tt < dur) {
                        const p = tt / dur; const r = 30 + p * Math.max(W, H) * 0.9;
                        ctx.globalAlpha = (1 - p) * 0.7; ctx.lineWidth = 18 * (1 - p) + 2; ctx.strokeStyle = col;
                        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
                    }
                }
                let vivo = false;
                for (const p of parts) {
                    p.vy += 0.22; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
                    const vita = Math.max(0, 1 - te / 2000);
                    if (vita <= 0 || p.y > H + 30) continue;
                    vivo = true;
                    ctx.save(); ctx.globalAlpha = vita; ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
                    ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6); ctx.restore();
                }
                if (!vivo && te > 1100) { ctx.clearRect(0, 0, W, H); return; }
            }
            if (t < 3400) raf = requestAnimationFrame(tick);
            else ctx.clearRect(0, 0, W, H);
        };
        raf = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(raf); document.body.style.animation = prima; };
    }, []);
    return (
        <>
            <style>{CSS_SFONDI}</style>
            <div ref={rocketRef} aria-hidden style={{ position: "fixed", top: "45%", left: "50%", width: 110, height: 110, margin: "-55px 0 0 -55px", pointerEvents: "none", zIndex: 6001, opacity: 0 }}>
                <svg viewBox="0 0 200 200" width="110" height="110"><path d="M100 12 Q142 54 130 140 L70 140 Q58 54 100 12 Z" fill="#efeafd" /><path d="M70 100 L26 150 L70 126 Z" fill="#7c6ba8" /><path d="M130 100 L174 150 L130 126 Z" fill="#7c6ba8" /><circle cx="100" cy="76" r="16" fill="#a78bfa" /><path d="M72 140 Q100 206 128 140 Q100 160 72 140 Z" fill="#f97316" /></svg>
            </div>
            <canvas ref={ref} aria-hidden style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 6000 }} />
        </>
    );
}

/** 🚨/ℹ️ IMPULSO — sirena rossa (vignetta + onde doppie) o radar blu (onde
 *  leggere). One-shot ~1.5s, pensato per essere RIPETUTO dal chiamante. */
export function ImpulsoOnde({ tipo }: { tipo: "warning" | "info" }) {
    const ref = useRef<HTMLCanvasElement | null>(null);
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
        const canvas = ref.current; if (!canvas) return;
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = window.innerWidth, H = window.innerHeight;
        canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cx = W * 0.5, cy = H * 0.45;
        const rosso = tipo === "warning";
        const base = rosso ? "rgba(244,63,94," : "rgba(96,165,250,";
        const pal = rosso ? ["#f43f5e", "#fb7185"] : ["#60a5fa", "#93c5fd"];
        const DUR = rosso ? 1400 : 1600;
        let raf = 0;
        const start = Date.now();
        const tick = () => {
            const t = Date.now() - start;
            ctx.clearRect(0, 0, W, H);
            if (t < 380) {
                const pf = 1 - t / 380;
                const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * (rosso ? 0.42 : 0.28));
                g.addColorStop(0, base + (rosso ? 0.5 : 0.3) * pf + ")"); g.addColorStop(1, base + "0)");
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, Math.min(W, H) * 0.5, 0, Math.PI * 2); ctx.fill();
            }
            const onde: [number, number][] = rosso ? [[0, 750], [140, 900], [300, 1050]] : [[0, 750], [140, 900]];
            for (let o = 0; o < onde.length; o++) {
                const tt = t - onde[o][0];
                if (tt > 0 && tt < onde[o][1]) {
                    const p = tt / onde[o][1]; const r = 30 + p * Math.max(W, H) * 0.9;
                    ctx.globalAlpha = (1 - p) * (rosso ? 0.7 : 0.5); ctx.lineWidth = (rosso ? 18 : 8) * (1 - p) + 2; ctx.strokeStyle = pal[o % pal.length];
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
                }
            }
            if (rosso && t < DUR) {
                const pv = 1 - t / DUR;
                const vg = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, Math.max(W, H) * 0.8);
                vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, base + 0.45 * pv + ")");
                ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
            }
            if (t < DUR) raf = requestAnimationFrame(tick);
            else ctx.clearRect(0, 0, W, H);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [tipo]);
    return <canvas ref={ref} aria-hidden style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 6000 }} />;
}

/** AMBIENT — il loop CONTINUO che vive intorno alla comunicazione (dietro la
 *  card): 🎉 smile che fluttuano · 🚀 razzi che sfrecciano · 💣 bombette che
 *  rimbalzano ed esplodono + crepe · 🔥 linee di velocità + fiamme + DAJE!/
 *  VAI!/SPINGI! + saette. Parte dopo un ritardo per lasciare la scena allo
 *  start, gira finché è montato (= finché non si conferma). */
export function AmbientComunicazione({ genere }: { genere: string }) {
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
        const RITARDO: Record<string, number> = { novita: 5200, success: 1300, update: 2300, sprint: 2200 };
        const EMO_S = ["😄", "🥳", "😊", "🎉", "🙌", "✨", "😁"];
        const PAROLE = ["DAJE!", "VAI!", "SPINGI!", "💪", "🔥", "+1 🎯"];
        type It = Record<string, any>;
        const items: It[] = [];
        let vivo = true, raf = 0, lastSpawn = 0, lastBolt = 0, lastWord = 0, lastBomb = 0, lastCrepa = 0;
        let bolt: { pts: [number, number][]; t0: number } | null = null;
        const crepaA = (x: number, y: number, grande: boolean) => {
            const rami = grande ? 6 : 4; const pts: [number, number][][] = [];
            for (let i = 0; i < rami; i++) {
                let a = (i / rami) * Math.PI * 2 + (Math.random() - .5) * .7, px = x, py = y;
                const linea: [number, number][] = [[px, py]];
                const segs = grande ? 6 : 4;
                for (let k = 0; k < segs; k++) { const passo = (grande ? 38 : 22) + Math.random() * (grande ? 42 : 22); a += (Math.random() - .5) * .6; px += Math.cos(a) * passo; py += Math.sin(a) * passo; linea.push([px, py]); }
                pts.push(linea);
            }
            items.push({ k: "crepa", rami: pts, t0: performance.now(), dur: grande ? 2600 : 1900 });
        };
        const esplodiMini = (x: number, y: number) => {
            items.push({ k: "mexp", x, y, t0: performance.now() });
            for (let i = 0; i < 16; i++) { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3.6; items.push({ k: "pb", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.4, size: 2 + Math.random() * 3, c: ["#fb923c", "#f97316", "#fbbf24", "#ef4444"][(Math.random() * 4) | 0], t0: performance.now() }); }
            if (Math.random() < .5) crepaA(x, y, false);
        };
        const spawn = (t: number) => {
            if (genere === "success") {
                if (t - lastSpawn > 420) { lastSpawn = t; items.push({ k: "emo", e: EMO_S[(Math.random() * EMO_S.length) | 0], x: Math.random() * W, y: H + 30, vy: -(0.6 + Math.random() * 1.1), vx: (Math.random() - .5) * .5, sw: Math.random() * Math.PI * 2, size: 22 + Math.random() * 24, rot: (Math.random() - .5) * .5 }); }
            } else if (genere === "update") {
                if (t - lastSpawn > 1400 + Math.random() * 900) {
                    lastSpawn = t;
                    const daSx = Math.random() < .5;
                    const ang = (daSx ? 0 : Math.PI) + (Math.random() - .5) * 0.8;
                    const sp = 2.6 + Math.random() * 2.6;
                    items.push({ k: "rz", x: daSx ? -50 : W + 50, y: H * (0.06 + Math.random() * 0.85), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, size: 26 + Math.random() * 20 });
                }
            } else if (genere === "novita") {
                if (t - lastBomb > 2400 + Math.random() * 1900) { lastBomb = t; items.push({ k: "mb", x: W * (0.08 + Math.random() * 0.84), y: -30, vx: (Math.random() - .5) * 2.2, vy: 1.5 + Math.random() * 1.5, rot: Math.random() * Math.PI, vr: (Math.random() - .5) * .12, born: t, rimbalzi: 0 }); }
                if (t - lastCrepa > 5200 + Math.random() * 3600) { lastCrepa = t; crepaA(W * (0.1 + Math.random() * 0.8), H * (0.12 + Math.random() * 0.6), true); }
            } else if (genere === "sprint") {
                if (t - lastSpawn > 85) { lastSpawn = t; items.push({ k: "sl", x: -80, y: Math.random() * H, len: 60 + Math.random() * 160, sp: 16 + Math.random() * 16, w: 1 + Math.random() * 2.2, a: .25 + Math.random() * .4, oro: Math.random() < .6 }); }
                if (Math.random() < .5) items.push({ k: "fl", x: Math.random() * W, y: H + 8, vy: -(1.4 + Math.random() * 2.2), vx: (Math.random() - .5) * .6, size: 2 + Math.random() * 4, c: ["#fbbf24", "#f97316", "#fde047", "#ef4444"][(Math.random() * 4) | 0], tw: Math.random() * Math.PI * 2 });
                if (t - lastWord > 2600 + Math.random() * 1600) { lastWord = t; items.push({ k: "pw", txt: PAROLE[(Math.random() * PAROLE.length) | 0], x: W * (0.18 + Math.random() * 0.64), y: H * (0.2 + Math.random() * 0.55), t0: t, ang: (Math.random() - .5) * .22 }); }
                if (t - lastBolt > 3600 + Math.random() * 2400) {
                    lastBolt = t;
                    const bx = W * (0.12 + Math.random() * 0.76); const pts: [number, number][] = [[bx, 0]]; let x = bx, y = 0;
                    while (y < H * 0.5) { x += (Math.random() - .5) * 90; y += 30 + Math.random() * 45; pts.push([x, y]); }
                    bolt = { pts, t0: t };
                }
            }
        };
        const tick = (t: number) => {
            if (!vivo) return;
            ctx.clearRect(0, 0, W, H);
            spawn(t);
            for (let i = items.length - 1; i >= 0; i--) {
                const p = items[i];
                if (p.k === "emo") {
                    p.y += p.vy; p.x += p.vx + Math.sin(p.sw += .03) * .6;
                    if (p.y < -40) { items.splice(i, 1); continue; }
                    const a = p.y < H * .22 ? Math.max(0, p.y / (H * .22)) : 1;
                    ctx.save(); ctx.globalAlpha = a * .95; ctx.translate(p.x, p.y); ctx.rotate(Math.sin(p.sw) * p.rot);
                    ctx.font = p.size + "px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                    ctx.fillText(p.e, 0, 0); ctx.restore();
                } else if (p.k === "rz") {
                    p.x += p.vx; p.y += p.vy;
                    if (p.x < -90 || p.x > W + 90 || p.y < -90 || p.y > H + 90) { items.splice(i, 1); continue; }
                    const ang2 = Math.atan2(p.vy, p.vx);
                    ctx.save(); ctx.globalAlpha = .55;
                    const g = ctx.createLinearGradient(p.x, p.y, p.x - p.vx * 14, p.y - p.vy * 14);
                    g.addColorStop(0, "rgba(249,115,22,.85)"); g.addColorStop(1, "rgba(249,115,22,0)");
                    ctx.strokeStyle = g; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 14, p.y - p.vy * 14); ctx.stroke(); ctx.restore();
                    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang2 + Math.PI / 4);
                    ctx.font = p.size + "px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                    ctx.fillText("🚀", 0, 0); ctx.restore();
                } else if (p.k === "mb") {
                    p.vy += 0.11; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
                    if (p.y > H - 16 && p.vy > 0) { p.vy = -p.vy * 0.52; p.vx *= 0.85; p.rimbalzi++; }
                    if (p.rimbalzi >= 2 && t - p.born > 1500) { items.splice(i, 1); esplodiMini(p.x, p.y); continue; }
                    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
                    ctx.font = "30px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                    ctx.fillText("💣", 0, 0); ctx.restore();
                    for (let s2 = 0; s2 < 2; s2++) {
                        ctx.globalAlpha = .5 + Math.random() * .5; ctx.fillStyle = s2 ? "#fde047" : "#fff7ed";
                        ctx.beginPath(); ctx.arc(p.x + 12 + (Math.random() - .5) * 7, p.y - 16 + (Math.random() - .5) * 7, 1 + Math.random() * 1.8, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.globalAlpha = 1;
                } else if (p.k === "mexp") {
                    const me = performance.now() - p.t0;
                    if (me > 380) { items.splice(i, 1); continue; }
                    const pr = me / 380, R = 12 + pr * 80;
                    const g3 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
                    g3.addColorStop(0, `rgba(255,247,237,${0.8 * (1 - pr)})`);
                    g3.addColorStop(0.5, `rgba(249,115,22,${0.5 * (1 - pr)})`);
                    g3.addColorStop(1, "rgba(249,115,22,0)");
                    ctx.fillStyle = g3; ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.fill();
                } else if (p.k === "pb") {
                    const pe = performance.now() - p.t0;
                    if (pe > 900) { items.splice(i, 1); continue; }
                    p.vy += 0.14; p.x += p.vx; p.y += p.vy;
                    ctx.globalAlpha = 1 - pe / 900; ctx.fillStyle = p.c;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
                } else if (p.k === "crepa") {
                    const ce = performance.now() - p.t0;
                    if (ce > p.dur) { items.splice(i, 1); continue; }
                    const al = ce < 300 ? ce / 300 : 1 - ((ce - 300) / (p.dur - 300));
                    ctx.save(); ctx.globalAlpha = Math.max(0, al) * .8;
                    ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1.3;
                    ctx.shadowColor = "rgba(255,255,255,.7)"; ctx.shadowBlur = 4;
                    for (const L of p.rami) {
                        ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
                        for (let k3 = 1; k3 < L.length; k3++) ctx.lineTo(L[k3][0], L[k3][1]);
                        ctx.stroke();
                    }
                    ctx.restore();
                } else if (p.k === "sl") {
                    p.x += p.sp;
                    if (p.x - p.len > W) { items.splice(i, 1); continue; }
                    ctx.save(); ctx.globalAlpha = p.a;
                    const g4 = ctx.createLinearGradient(p.x - p.len, p.y, p.x, p.y);
                    g4.addColorStop(0, "rgba(255,255,255,0)");
                    g4.addColorStop(1, p.oro ? "rgba(251,191,36,.9)" : "rgba(255,255,255,.8)");
                    ctx.strokeStyle = g4; ctx.lineWidth = p.w;
                    ctx.beginPath(); ctx.moveTo(p.x - p.len, p.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.restore();
                } else if (p.k === "pw") {
                    const we = t - p.t0;
                    if (we > 1500) { items.splice(i, 1); continue; }
                    const sc = we < 220 ? 1.9 - (we / 220) * 0.9 : 1, wa = we < 220 ? we / 220 : 1 - ((we - 220) / 1280);
                    ctx.save(); ctx.globalAlpha = Math.max(0, wa);
                    ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.scale(sc, sc);
                    ctx.font = "900 44px ui-sans-serif,system-ui,sans-serif";
                    ctx.textAlign = "center"; ctx.textBaseline = "middle";
                    ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 26;
                    ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 7; ctx.strokeText(p.txt, 0, 0);
                    ctx.fillStyle = "#fde047"; ctx.fillText(p.txt, 0, 0);
                    ctx.restore();
                } else {
                    p.y += p.vy; p.x += p.vx + Math.sin(p.tw += .09) * .4;
                    if (p.y < H * .3) { items.splice(i, 1); continue; }
                    ctx.globalAlpha = .22 + Math.abs(Math.sin(p.tw)) * .5; ctx.fillStyle = p.c;
                    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
                }
            }
            if (bolt) {
                const bt = t - bolt.t0;
                if (bt < 260) {
                    ctx.save(); ctx.globalAlpha = (1 - bt / 260) * .85;
                    ctx.strokeStyle = "#fde047"; ctx.lineWidth = 2.5; ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 12;
                    ctx.beginPath(); ctx.moveTo(bolt.pts[0][0], bolt.pts[0][1]);
                    for (let k = 1; k < bolt.pts.length; k++) ctx.lineTo(bolt.pts[k][0], bolt.pts[k][1]);
                    ctx.stroke(); ctx.restore();
                } else bolt = null;
            }
            if (items.length > 400) items.splice(0, items.length - 400);
            raf = requestAnimationFrame(tick);
        };
        const avvio = setTimeout(() => { if (vivo) raf = requestAnimationFrame(tick); }, RITARDO[genere] ?? 1500);
        window.addEventListener("resize", setup);
        return () => { vivo = false; clearTimeout(avvio); cancelAnimationFrame(raf); window.removeEventListener("resize", setup); };
    }, [genere]);
    return <canvas ref={ref} aria-hidden style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none" }} />;
}
