"use client";

// POP-UP COMUNICAZIONI (Luca 30/07, mig. 104): le comunicazioni kind='popup'
// indirizzate al ruolo dell'utente compaiono AL CENTRO sopra qualsiasi cosa
// stia facendo — subito se e' loggato (realtime + ricontrollo periodico), al
// primo login altrimenti (il componente monta dopo l'auth). Restano in coda
// finche' non vengono CONFERMATE col pulsante; "Piu' tardi" le fa sparire per
// la sessione ma ricompaiono al prossimo accesso. La visualizzazione scrive la
// LETTURA in comunicazioni_ricevute, la conferma scrive confermato_il.
import { useCallback, useEffect, useRef, useState } from "react";
import { Info, AlertTriangle, CheckCircle2, Rocket, Bomb } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
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
@keyframes bombaFlash{0%{opacity:0}3%{opacity:1}7%{opacity:.25}11%{opacity:1}16%{opacity:.4}24%{opacity:.9}38%{opacity:.5}60%{opacity:.22}100%{opacity:0}}`;

export function fondoComunicazione(genere?: string | null): string {
    return genere === "success" ? "linear-gradient(160deg,#0d1f13 0%,#12141f 55%,#0f2417 100%)"
        : genere === "warning" ? "linear-gradient(160deg,#220d13 0%,#12141f 55%,#2a0f16 100%)"
            : genere === "update" ? "linear-gradient(160deg,#170f2b 0%,#12141f 55%,#1a1233 100%)"
                : genere === "novita" ? "linear-gradient(160deg,#2b1206 0%,#12141f 55%,#331107 100%)"
                    : "linear-gradient(160deg,#0f1522 0%,#12141f 60%,#101a2c 100%)";
}

export function SfondoComunicazione({ genere }: { genere?: string | null }) {
    const ref = useRef<HTMLCanvasElement | null>(null);
    const animato = genere === "success" || genere === "update" || genere === "novita";
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
        const fuoco = ["#fb923c", "#f97316", "#fbbf24", "#ef4444", "#fde047"];
        const braci: { x: number; y: number; v: number; r: number; tw: number; c: string }[] = [];
        if (genere === "success") for (let i = 0; i < 34; i++) coriandoli.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .5, vy: .55 + Math.random() * .9, rot: Math.random() * Math.PI, vr: (Math.random() - .5) * .12, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, c: colori[(Math.random() * colori.length) | 0] });
        if (genere === "update") for (let i = 0; i < 42; i++) stelle.push({ x: Math.random() * W, y: Math.random() * H, v: .18 + Math.random() * .5, r: .6 + Math.random() * 1.5, tw: Math.random() * Math.PI * 2 });
        if (genere === "novita") for (let i = 0; i < 38; i++) braci.push({ x: Math.random() * W, y: Math.random() * H, v: .3 + Math.random() * .75, r: .7 + Math.random() * 1.7, tw: Math.random() * Math.PI * 2, c: fuoco[(Math.random() * fuoco.length) | 0] });
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
            } else if (genere === "novita") {
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
            // select a scalare: v147 (allegati+size) → completa (mig. 116) → senza esiti (mig. 112) → legacy
            const v147 = await supabase
                .from("comunicazioni")
                .select("id, title, content, content_html, type, date_display, created_by, created_by_name, target_roles, target_stores, target_users, target_brands, esiti, meeting_id, allegati, size, kind")
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

    // 💣 BOMBA one-shot (Luca 04/08): l'esplosione si vede UNA volta per
    // utente+comunicazione (guard localStorage) — chi preme "Più tardi" non
    // se la ribecca a ogni ricomparsa. Stesso pattern dei rinvii qui sopra.
    const [bombaId, setBombaId] = useState<number | null>(null);
    useEffect(() => {
        if (!attuale || !user?.id || attuale.type !== "novita") return;
        const k = `bomba_vista_${user.id}_${attuale.id}`;
        try {
            if (localStorage.getItem(k)) return;
            localStorage.setItem(k, new Date().toISOString());
        } catch { /* senza localStorage resta comunque one-shot per mount */ }
        setBombaId(attuale.id);
    }, [attuale, user?.id]);

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
                    : { Icon: Info, color: "#60a5fa", bg: "rgba(96,165,250,.12)", border: "rgba(96,165,250,.35)" };
    const { Icon } = stile;
    const taglia = stileTaglia(attuale.size);

    return (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            {/* buone notizie (type success): esplosione di coriandoli all'apertura */}
            {attuale.type === "success" && <Confetti key={attuale.id} />}
            {/* 💣 novita: la bomba esplode SOLO alla prima apertura (guard sopra) */}
            {attuale.type === "novita" && bombaId === attuale.id && <EsplosioneBomba key={attuale.id} />}
            <div className={`relative ${taglia.popup} rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200${attuale.type === "warning" ? " anim-bordo-rosso" : ""}`}
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
