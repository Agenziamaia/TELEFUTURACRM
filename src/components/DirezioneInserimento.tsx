"use client";

// DIREZIONE INSERIMENTO v3 (Luca 26/08 sera, rifinita su dettato):
// — selettore BRAND in testa: ogni operatore ha le sue realtà (WindTre = i
//   codici della lettera; Vodafone = Vodafone Store e VND; Fastweb = lettera
//   T2; Sky = canale unico);
// — dentro il codice si vede SUBITO la situazione come nell'area Rete
//   dell'Analisi: la SogliaBar (produzione piena, PROIEZIONE in sfumatura a
//   strisce, tacche alle soglie) — stesso componente, stessa fonte;
// — il target si sceglie cliccando la soglia: il numero è SEMPRE INTERO e
//   include lo SFRIDO della pista (l'extra % d'errore, es. mobile +5%),
//   arrotondato per eccesso; RICLICCANDO la soglia attiva si DESELEZIONA
//   (prima ci si restava incastrati — bug segnalato su Collatina S2);
// — il widget Home indirizza le vendite sul codice dove manca di più, col
//   favore al negozio di chi chiede.
// La vecchia mappa statica (tabella direzione_inserimento) resta a DB ma
// non è più montata: questa la sostituisce (export con gli stessi nomi).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import {
    caricaDirezione, consigliaCodici, targetConSfrido, proiezioneDir, strategiaDi, prioritaDi, èMioCodice,
    finestraBilancia, codiceBilancia, codiceAssociato, W3_PALETTO_BUSINESS,
    DIR_BRANDS, type DirBrandId, type Direzione,
} from "@/lib/direzioneTargets";
import { SogliaBar as SogliaBarRaw } from "@/app/(dashboard)/analisi/_charts";
import { Compass, Loader2, Check, RotateCcw } from "lucide-react";
import { PISTE_PARALLELE } from "@/lib/commissioning";
import { TRK_BRAND_LOGOS, TRK_LOGO_SCALE } from "@/lib/brandAssets";
import { cn } from "@/utils";

const SogliaBar = SogliaBarRaw as unknown as (p: {
    label: string; emoji?: string; punti: number; pezzi?: number;
    soglie: { tier: number; soglia_da: number }[]; colore?: string;
    proiezione?: number | null; nota?: string | null; unit?: string;
    targetDir?: number | null;
    bruciati?: number;
}) => React.ReactElement;

const it = (v: number) => Number(v || 0).toLocaleString("it-IT", { maximumFractionDigits: 2 });
const mesePrimo = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };

// piste da NON targetizzare mai (conteggi paralleli / pay unico senza corsa).
// ⚠️ SONO TUTTE LE PARALLELE, non solo la Partnership (rilievo del revisore
// 26/08): l'Extra Gara P.IVA è un bonus AZIENDA e Luca è stato netto — «i
// ragazzi non devono averne PER NIENTE visibilità». Bastava che qualcuno le
// desse un target dal pannello e il chip sarebbe comparso nella Home di tutti,
// perché la Bussola mostra le piste con target senza guardare il ruolo.
const PISTE_FUORI = new Set<string>([...PISTE_PARALLELE]);

// sfrido del PALETTO BUSINESS in PEZZI (Luca 26/08 notte-4): cuscinetto
// sopra il 6 della lettera — vive in direzione_sfridi con questa pista
// speciale (pct = pezzi, non percentuale)
const SFRIDO_PALETTO = "__paletto_business__";

// nome breve dei codici nelle pillole: prima parola, MA se è corta («San»)
// si tiene anche la seconda — «San Paolo» non diventa mai «San» (Luca 27/08)
const nomeBreve = (n: string) => {
    const w = String(n || "").trim().split(/\s+/);
    return w[0] && w[0].length <= 4 && w[1] ? `${w[0]} ${w[1]}` : (w[0] || n);
};

// etichette parlanti per le scale «di regola» (Luca 26/08 notte): la CB ha
// il target Partnership (80% = premio ridotto, 100% = pieno), i Protetti
// hanno la soglia-malus «almeno 1»
const etichettaSoglia = (brand: string, pista: string, i: number) => {
    if (brand === "windtre" && pista === "cb") return i === 0 ? "80%" : "Target";
    if (brand === "windtre" && pista === "protetti") return "Almeno";
    return `S${i + 1}`;
};

const EMOJI_PISTA = (nome: string) => {
    const n = nome.toLowerCase();
    if (n.includes("mobile")) return "📱";
    if (n.includes("fisso") || n.includes("wireline")) return "🌐";
    if (n.includes("luce") || n.includes("gas") || n.includes("energia")) return "⚡";
    if (n.includes("piva") || n.includes("business")) return "💼";
    if (n.includes("assicura")) return "🛡️";
    if (n.includes("customer") || n.includes("cb")) return "🔁";
    if (n.includes("tv") || n.includes("sky")) return "📺";
    return "🎯";
};

// ─────────────────────────────────────────────────────────────────────────────
// PANNELLO ADMIN (Gare → Direzione Inserimento)
// ─────────────────────────────────────────────────────────────────────────────
export function DirezioneInserimentoAdmin() {
    const { user } = useAuth();
    const [brand, setBrand] = useState<DirBrandId>("windtre");
    const [monthISO, setMonthISO] = useState(mesePrimo());
    const [dir, setDir] = useState<Direzione | null>(null);
    const [aperto, setAperto] = useState<string | null>(null);
    const [bozze, setBozze] = useState<Record<string, string>>({});       // "cod|pista" → input target
    const [bozzeSfr, setBozzeSfr] = useState<Record<string, string>>({}); // pista → input sfrido
    const [salvate, setSalvate] = useState<Record<string, boolean>>({});
    const [erroriSalva, setErroriSalva] = useState<Record<string, boolean>>({});
    const [gruppoAperto, setGruppoAperto] = useState(false);
    const [recapAperto, setRecapAperto] = useState(false);
    const [giro, setGiro] = useState(0);

    useEffect(() => {
        let vivo = true;
        setDir(null); setAperto(null);
        caricaDirezione(brand, monthISO).then((d) => { if (vivo) { setDir(d); setBozze({}); setBozzeSfr({}); } });
        return () => { vivo = false; };
    }, [brand, monthISO, giro]);

    const flash = (chiave: string, ok: boolean) => {
        if (!ok) { setErroriSalva((s) => ({ ...s, [chiave]: true })); return; }
        setErroriSalva((s) => ({ ...s, [chiave]: false }));
        setSalvate((s) => ({ ...s, [chiave]: true }));
        setTimeout(() => setSalvate((s) => ({ ...s, [chiave]: false })), 1600);
    };
    // tier = soglia di provenienza del target (null = scritto a mano): al
    // cambio di sfrido i target con tier si RICALCOLANO da soli (notte-7)
    const salva = async (cod_gara: string, pista: string, valore: number, tier: number | null = null) => {
        const chiave = `${cod_gara}|${pista}`;
        const { error } = await supabase.from("direzione_targets").upsert(
            { brand, month: monthISO, cod_gara, pista, target: valore, tier: valore > 0 ? tier : null, updated_at: new Date().toISOString(), updated_by: user?.name || null },
            { onConflict: "brand,month,cod_gara,pista" });
        if (error) { flash(chiave, false); return; }
        setDir((p) => p ? {
            ...p,
            codici: p.codici.map((k) => k.cod_gara === cod_gara ? { ...k, targets: { ...k.targets, [pista]: valore }, tiersScelti: { ...k.tiersScelti, [pista]: valore > 0 ? tier : null } } : k),
        } : p);
        flash(chiave, true);
    };
    const salvaSfrido = async (pista: string, pct: number) => {
        const chiave = `sfr|${pista}`;
        const { error } = await supabase.from("direzione_sfridi").upsert(
            { brand, month: monthISO, pista, pct, updated_at: new Date().toISOString(), updated_by: user?.name || null },
            { onConflict: "brand,month,pista" });
        if (error) { flash(chiave, false); return; }
        setDir((p) => p ? { ...p, sfridi: { ...p.sfridi, [pista]: pct } } : p);
        flash(chiave, true);
        // RICALCOLO AUTOMATICO (Luca notte-7): i target nati da una soglia
        // si riallineano al nuovo sfrido — quelli a mano non si toccano
        if (dir && pista !== SFRIDO_PALETTO) {
            for (const k of dir.codici) {
                const t = k.tiersScelti?.[pista];
                const scala = k.soglie[pista] || [];
                if ((k.targets[pista] || 0) > 0 && t != null && Number(scala[t - 1]) > 0) {
                    const nuovo = targetConSfrido(Number(scala[t - 1]), pct);
                    if (nuovo !== k.targets[pista]) await salva(k.cod_gara, pista, nuovo, t);
                }
            }
        }
    };
    // politica di una pista di GRUPPO (proprio/bilancia) e associazioni MB
    const salvaPolitica = async (pista: string, modo: string, dati?: Record<string, unknown> | null) => {
        const chiave = `pol|${pista}`;
        const { error } = await supabase.from("direzione_politiche").upsert(
            { brand, month: monthISO, pista, modo, ...(dati !== undefined ? { dati } : {}), updated_at: new Date().toISOString(), updated_by: user?.name || null },
            { onConflict: "brand,month,pista" });
        if (error) { flash(chiave, false); return; }
        setDir((p) => p ? { ...p, politiche: { ...p.politiche, [pista]: { modo, dati: dati ?? p.politiche[pista]?.dati ?? null } } } : p);
        flash(chiave, true);
    };

    const mesi = useMemo(() => {
        const out: { iso: string; label: string }[] = [];
        const d = new Date(); d.setDate(1);
        for (let i = 0; i < 4; i++) {
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
            out.push({ iso, label: d.toLocaleDateString("it-IT", { month: "long", year: "numeric" }) });
            d.setMonth(d.getMonth() - 1);
        }
        return out;
    }, []);
    const bMeta = DIR_BRANDS.find((b) => b.id === brand)!;

    return (
        <div className="space-y-4">
            {/* SOLO I BRAND, tessere come nella sezione CALLER (Luca 26/08 sera-5):
                logo grande, attivo acceso, inattivo in grayscale — niente
                riquadri colorati né descrizioni */}
            <div className="flex items-center gap-3">
                {DIR_BRANDS.map((b) => {
                    const logo = TRK_BRAND_LOGOS[b.id];
                    const scala = TRK_LOGO_SCALE[b.id] || 1;
                    const attivo = brand === b.id;
                    return (
                        <button key={b.id} onClick={() => setBrand(b.id)} title={b.label} aria-label={b.label}
                            className={cn("flex-1 min-w-0 h-[84px] flex items-center justify-center rounded-2xl border px-3 transition-all",
                                attivo
                                    ? "border-indigo-400/80 bg-indigo-500/20 ring-1 ring-indigo-400/40 shadow-lg shadow-indigo-500/25 brightness-110"
                                    : "border-white/15 bg-white/[0.05] opacity-70 grayscale-[60%] hover:opacity-90 hover:grayscale-[30%]")}>
                            {logo ? (
                                <img src={logo} alt={b.label} className="block object-contain max-w-full"
                                    style={{ maxHeight: 56, transform: scala !== 1 ? `scale(${scala})` : undefined }} />
                            ) : (
                                <span className="block text-base font-bold text-slate-200 px-1">{b.label}</span>
                            )}
                        </button>
                    );
                })}
                <div className="flex items-center gap-2 shrink-0">
                    <select value={monthISO} onChange={(e) => setMonthISO(e.target.value)} className="glass-input text-sm !h-10 min-w-[150px]">
                        {mesi.map((m) => <option key={m.iso} value={m.iso}>{m.label}</option>)}
                    </select>
                    <button onClick={() => setGiro((g) => g + 1)} title="Ricarica l'avanzamento" className="p-2 rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"><RotateCcw className="w-4 h-4" /></button>
                </div>
            </div>

            {/* 🕊️ INSERIMENTO LIBERO (Luca 26/08 notte-5): il brand si può
                «spegnere» — es. Sky, dove la regia non serve: la Bussola dei
                ragazzi mostrerà «inserimento libero» invece dei consigli */}
            {dir && (() => {
                const libero = dir.politiche["__libero__"]?.modo === "libero";
                const lKey = "pol|__libero__";
                return (
                    <div className={cn("glass-card p-3.5 flex flex-wrap items-center gap-3", libero && "border-emerald-500/30")}>
                        <button type="button" onClick={() => salvaPolitica("__libero__", libero ? "guidato" : "libero")}
                            className={cn("relative w-11 h-6 rounded-full transition-colors shrink-0", libero ? "bg-emerald-500" : "bg-white/15")}
                            title={libero ? "Riattiva la regia degli inserimenti" : "Spegni la regia: inserimento libero"}>
                            <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all", libero ? "left-[22px]" : "left-0.5")} />
                        </button>
                        <span className="text-sm font-bold text-slate-100">🕊️ Inserimento libero per {bMeta.label}</span>
                        <span className="text-[11px] text-slate-500">{libero ? "la Bussola dice ai ragazzi: «carica dove preferisci» — niente target né consigli" : "spento: vale la regia (target, politiche e consigli della Bussola)"}</span>
                        {salvate[lKey] && <Check className="w-4 h-4 text-emerald-400" />}
                        {erroriSalva[lKey] && <span className="text-[10px] font-bold text-rose-300">✗</span>}
                    </div>
                );
            })()}

            {/* SFRIDO GENERALE per categoria (Luca 26/08 sera-2): si imposta QUI,
                una volta per pista, e vale per TUTTI i codici del brand — le
                pillole soglia di ogni codice escono già maggiorate e intere */}
            {dir && dir.tab && dir.codici.length > 0 && (
                <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2.5">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">⚙️ Sfrido per categoria</span>
                        <span className="text-[10px] text-slate-600">vale su tutti i codici {bMeta.label} · % intera, il target esce già maggiorato per eccesso</span>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                        {/* SOLO dove lo sfrido lavora davvero: le piste per-codice
                            con soglie cliccabili (mobile, fisso, CB). Niente
                            Protetti («almeno 1» non si sfrida) né piste di gruppo
                            (Luca 26/08 notte-3: «su Protetti non serve, e su
                            Telefoni&device a cosa ti riferivi?» — a nulla: era il
                            pannello che elencava tutto il tabellare) */}
                        {dir.pisteTab.filter((p) => dir.kpiCodice.includes(p.chiave) && p.chiave !== "protetti").map((p) => {
                            const sfrido = Math.round(Number(dir.sfridi[p.chiave]) || 0);
                            const sfrKey = `sfr|${p.chiave}`;
                            const bozzaSfr = bozzeSfr[p.chiave] ?? (sfrido ? String(sfrido) : "");
                            return (
                                <div key={p.chiave} className="flex items-center gap-1.5">
                                    <span className="text-xs text-slate-300 font-semibold">{EMOJI_PISTA(p.nome)} {p.nome}</span>
                                    <input value={bozzaSfr} onChange={(e) => setBozzeSfr((b) => ({ ...b, [p.chiave]: e.target.value }))}
                                        onBlur={() => {
                                            if (String(bozzaSfr).trim() === "") { setBozzeSfr((b) => ({ ...b, [p.chiave]: sfrido ? String(sfrido) : "" })); return; }
                                            const v = Math.max(0, Math.round(Number(String(bozzaSfr).replace(",", "."))));
                                            if (Number.isFinite(v) && v !== sfrido) salvaSfrido(p.chiave, v);
                                        }}
                                        placeholder="0" inputMode="numeric"
                                        className="glass-input !h-8 w-14 text-xs text-right" />
                                    <span className="text-[10px] text-slate-500">%</span>
                                    {salvate[sfrKey] && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                    {erroriSalva[sfrKey] && <span className="text-[10px] font-bold text-rose-300">✗</span>}
                                </div>
                            );
                        })}
                        {/* 💼 sfrido del PALETTO in PEZZI (non %): cuscinetto sopra
                            il 6 della lettera — l'obiettivo delle barre diventa 6+n */}
                        {brand === "windtre" && (() => {
                            const sp = Math.round(Number(dir.sfridi[SFRIDO_PALETTO]) || 0);
                            const spKey = `sfr|${SFRIDO_PALETTO}`;
                            const bozzaSp = bozzeSfr[SFRIDO_PALETTO] ?? (sp ? String(sp) : "");
                            return (
                                <div className="flex items-center gap-1.5" title="Cuscinetto in PEZZI sopra il paletto business della lettera (6): l'obiettivo mostrato diventa 6 + sfrido">
                                    <span className="text-xs text-slate-300 font-semibold">💼 Paletto Business</span>
                                    <input value={bozzaSp} onChange={(e) => setBozzeSfr((b) => ({ ...b, [SFRIDO_PALETTO]: e.target.value }))}
                                        onBlur={() => {
                                            if (String(bozzaSp).trim() === "") { setBozzeSfr((b) => ({ ...b, [SFRIDO_PALETTO]: sp ? String(sp) : "" })); return; }
                                            const v = Math.max(0, Math.round(Number(String(bozzaSp).replace(",", "."))));
                                            if (Number.isFinite(v) && v !== sp) salvaSfrido(SFRIDO_PALETTO, v);
                                        }}
                                        placeholder="0" inputMode="numeric"
                                        className="glass-input !h-8 w-14 text-xs text-right" />
                                    <span className="text-[10px] text-slate-500">pz</span>
                                    {salvate[spKey] && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                    {erroriSalva[spKey] && <span className="text-[10px] font-bold text-rose-300">✗</span>}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* 🧭 STRATEGIA DI RIEMPIMENTO per KPI (Luca 27/08-5): vale per il
                KPI intero, non per codice — 'vicino' CHIUDE prima chi è quasi
                a target, 'scoperto' livella dal basso */}
            {dir && dir.tab && dir.codici.length > 0 && (
                <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2.5">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">🧭 Strategia di riempimento</span>
                        <span className="text-[10px] text-slate-600">per KPI: la Bussola indirizza di conseguenza</span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-2.5">
                        {[...dir.pisteTab.filter((p) => dir.kpiCodice.includes(p.chiave) && p.chiave !== "protetti").map((p) => ({ chiave: p.chiave, nome: `${EMOJI_PISTA(p.nome)} ${p.nome}` })),
                          ...(brand === "windtre" ? [{ chiave: "__bizmob__", nome: "💼 Business mobile (paletto)" }] : [])].map((p) => {
                            const strat = dir.politiche[p.chiave]?.modo === "scoperto" ? "scoperto" : "vicino";
                            const sKey = `pol|${p.chiave}`;
                            return (
                                <div key={p.chiave} className="flex items-center gap-1.5">
                                    <span className="text-xs text-slate-300 font-semibold">{p.nome}</span>
                                    <button onClick={() => salvaPolitica(p.chiave, "vicino")}
                                        title="Si chiude prima chi è già quasi a target: la strategia SCAVALCA il negozio del venditore"
                                        className={cn("px-2 py-1 rounded-lg text-[10px] font-bold border transition-all",
                                            strat === "vicino" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-white/[0.04] text-slate-400 border-white/10 hover:bg-white/10")}>
                                        🎯 Chiudi il più vicino
                                    </button>
                                    <button onClick={() => salvaPolitica(p.chiave, "scoperto")}
                                        title="Si livella dal basso — ma chi chiede carica PRIMA sul suo negozio, finché ha capienza sul target"
                                        className={cn("px-2 py-1 rounded-lg text-[10px] font-bold border transition-all",
                                            strat === "scoperto" ? "bg-sky-500/15 text-sky-300 border-sky-500/40" : "bg-white/[0.04] text-slate-400 border-white/10 hover:bg-white/10")}>
                                        ⚖️ Riempi il più scoperto
                                    </button>
                                    {salvate[sKey] && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                    {erroriSalva[sKey] && <span className="text-[10px] font-bold text-rose-300">✗</span>}
                                    {/* ① PRIORITÀ ESPLICITE (Luca 27/08-6): clicca i codici
                                        nell'ordine — vincono su tutto finché non chiudono */}
                                    <span className="text-[9px] font-bold text-slate-600 uppercase ml-1">priorità</span>
                                    <div className="flex gap-1 flex-wrap">
                                        {dir.codici.map((k) => {
                                            const prio = ((dir.politiche[p.chiave]?.dati as { priorita?: string[] } | null)?.priorita) || [];
                                            const idx = prio.indexOf(k.cod_gara);
                                            const on = idx >= 0;
                                            return (
                                                <button key={k.cod_gara}
                                                    onClick={() => {
                                                        const nuova = on ? prio.filter((x) => x !== k.cod_gara) : [...prio, k.cod_gara];
                                                        salvaPolitica(p.chiave, dir.politiche[p.chiave]?.modo || "vicino", { ...((dir.politiche[p.chiave]?.dati as Record<string, unknown>) || {}), priorita: nuova });
                                                    }}
                                                    title={on ? `Togli ${k.negozio} dalle priorità` : `Dai priorità a ${k.negozio}`}
                                                    className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold border transition-all",
                                                        on ? "text-white border-transparent" : "bg-white/[0.03] text-slate-500 border-white/10 hover:bg-white/10")}
                                                    style={on ? { background: bMeta.color } : undefined}>
                                                    {on ? `${["①", "②", "③", "④", "⑤", "⑥", "⑦"][idx] || idx + 1} ` : ""}{nomeBreve(k.negozio)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 📊 IL TOTALE DI QUELLO CHE STO CHIEDENDO (Luca 26/08 notte, v2):
                TUTTE le piste per-codice, con la regola dei SUPERAMENTI — i
                punti oltre il target di un codice NON sono recuperabili (uno
                sbaglio da 30 punti su Magliana non tappa il buco di Collatina):
                il progresso VALIDO è Σ min(fatto, target) per codice */}
            {dir && dir.tab && dir.codici.length > 0 && (() => {
                const righe = dir.kpiCodice.map((pk) => {
                    const meta = dir.pisteTab.find((p) => p.chiave === pk);
                    if (!meta) return null;
                    const cbW3 = dir.brand === "windtre" && pk === "cb";
                    const fattoDi = (k: typeof dir.codici[number]) => cbW3 ? (k.cbPunti || 0) : (k.piste[pk]?.punti || 0);
                    const conTargetK = dir.codici.filter((k) => (k.targets[pk] || 0) > 0);
                    const richiesto = conTargetK.reduce((s, k) => s + (k.targets[pk] || 0), 0);
                    const fatto = Math.round(dir.codici.reduce((s, k) => s + fattoDi(k), 0) * 100) / 100;
                    const utile = Math.round(conTargetK.reduce((s, k) => s + Math.min(fattoDi(k), k.targets[pk] || 0), 0) * 100) / 100;
                    // ECCEDENZA (Luca 27/08): SEMPRE caricato − target SFRIDATO
                    // (k.targets è già col +sfrido), e contano anche i punti su
                    // codici SENZA target — «non ne avevano bisogno» per definizione
                    const sforati = dir.codici
                        .map((k) => { const t = k.targets[pk] || 0; return { nome: k.negozio, extra: Math.round((fattoDi(k) - t) * 100) / 100, senza: !(t > 0) }; })
                        .filter((x) => x.extra > 0);
                    const sforo = Math.round(sforati.reduce((s, x) => s + x.extra, 0) * 100) / 100;
                    const proj = proiezioneDir(dir, fatto);
                    // proiezione UTILE: il ritmo di rete meno gli sforamenti già
                    // maturati (che non torneranno buoni) — approssimazione onesta
                    const projUtile = proj != null ? Math.max(utile, Math.round(proj - sforo)) : null;
                    const rif = projUtile ?? utile;
                    const ratio = richiesto > 0 ? rif / richiesto : 1;
                    const verdetto = richiesto <= 0 ? null : ratio >= 1
                        ? { txt: "✅ in linea: la proiezione utile copre la richiesta", cls: "text-emerald-300" }
                        : ratio >= 0.85
                            ? { txt: `🟡 quasi: la proiezione utile arriva a ${it(rif)} su ${it(richiesto)}`, cls: "text-amber-300" }
                            : { txt: `🔴 sopra la proiezione di ${it(Math.max(0, Math.ceil(richiesto - rif)))}: o si spinge o si ridimensiona`, cls: "text-rose-300" };
                    return { pk, meta, cbW3, richiesto, fatto, utile, sforati, sforo, proj: projUtile, verdetto };
                }).filter(Boolean) as { pk: string; meta: { chiave: string; nome: string; um: string }; cbW3: boolean; richiesto: number; fatto: number; utile: number; sforati: { nome: string; extra: number; senza: boolean }[]; sforo: number; proj: number | null; verdetto: { txt: string; cls: string } | null }[];
                if (!righe.length) return null;
                return (
                    <div className="glass-card p-4 space-y-3.5">
                        <button type="button" onClick={() => setRecapAperto((v) => !v)} className="w-full flex items-center gap-2 text-left">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">📊 Totale richiesto vs rete</span>
                            <span className="text-[10px] text-slate-600">Σ target sui codici (sfrido incluso) · l'eccedenza si misura sul target SFRIDATO e non recupera: la proiezione utile la deduce</span>
                            <span className={cn("ml-auto text-slate-500 transition-transform text-xs", recapAperto && "rotate-180")}>▾</span>
                        </button>
                        {recapAperto && righe.map((r) => (
                            <div key={r.pk} className="space-y-1">
                                <SogliaBar emoji={EMOJI_PISTA(r.meta.nome)}
                                    label={r.richiesto > 0 ? `${r.meta.nome} · richiesti ${it(r.richiesto)}` : `${r.meta.nome} · nessun target dato`}
                                    punti={r.richiesto > 0 ? r.utile : r.fatto}
                                    soglie={r.richiesto > 0 ? [{ tier: 1, soglia_da: r.richiesto }] : []}
                                    colore={bMeta.color} proiezione={r.proj}
                                    bruciati={r.richiesto > 0 ? r.sforo : 0}
                                    unit={r.meta.um === "pezzi" && !r.cbW3 ? "pz" : "pt"}
                                    nota={r.richiesto > 0 && r.fatto !== r.utile ? `rete ${it(r.fatto)} · validi verso i target ${it(r.utile)} · 🔥 ${it(r.sforo)} bruciati` : null} />
                                {r.sforati.length > 0 && (
                                    <div className="text-[11px] font-semibold text-rose-300">
                                        🔥 {it(r.sforo)} bruciati oltre il target sfridato — non recuperano: {r.sforati.map((x) => `${x.nome} (+${it(x.extra)}${x.senza ? " · senza target" : ""})`).join(" · ")}
                                    </div>
                                )}
                                {r.verdetto && <div className={cn("text-[11px] font-semibold", r.verdetto.cls)}>{r.verdetto.txt}</div>}
                            </div>
                        ))}
                    </div>
                );
            })()}

            {!dir ? (
                <div className="glass-card p-10 flex items-center justify-center gap-2 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /> Carico realtà, tabellare e produzione…</div>
            ) : !dir.tab ? (
                <div className="glass-card p-8 text-center text-sm text-slate-400">Nessun tabellare {bMeta.label} per questo mese: carica prima le gare dell&apos;operatore.</div>
            ) : !dir.codici.length ? (
                <div className="glass-card p-8 text-center text-sm text-slate-400">Nessun codice {bMeta.label} per questo mese{brand === "windtre" ? <> — carica prima il <b>Target PDV</b> della lettera (Gare → WindTre, vista azienda)</> : null}.</div>
            ) : (
                <div className="space-y-4">
                    {dir.nonAllocati > 0 && (
                        <div className="text-[11px] text-amber-400/80 px-1">⚠ {dir.nonAllocati} vendite valide del mese hanno un Cod.Ins. non riconducibile a una realtà: non compaiono qui sotto.</div>
                    )}
                    {/* W3 diviso nelle sue DUE anime (Luca 26/08): franchising e
                        multibrand non si mischiano — sezioni dichiarate */}
                    {(brand === "windtre"
                        ? [
                            { label: "🏪 Franchising", items: dir.codici.filter((x) => !x.cod_gara.startsWith("MB-")) },
                            { label: "🔀 Multibrand", items: dir.codici.filter((x) => x.cod_gara.startsWith("MB-")) },
                        ].filter((s) => s.items.length)
                        : [{ label: null as string | null, items: dir.codici }]
                    ).map((sez) => (
                    <div key={sez.label || "tutti"} className="space-y-3">
                    {sez.label && (
                        <div className="flex items-center gap-2 px-1">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{sez.label}</span>
                            <span className="text-[10px] text-slate-600">{sez.items.length}</span>
                            <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                        </div>
                    )}
                    {/* 🌍 TARGET DI GRUPPO (W3): luce&gas, assicurazioni… — non
                        importa DOVE si caricano: qui la barra di RETE e la
                        POLITICA di caricamento per la Bussola dei ragazzi */}
                    {sez.label === "🏪 Franchising" && dir.pisteGruppo.length > 0 && (
                        <div className="glass-card p-4 space-y-4">
                            {/* header CLICCABILE: la card si chiude (Luca 26/08 notte-4) */}
                            <button type="button" onClick={() => setGruppoAperto((v) => !v)} className="w-full flex items-center gap-2 text-left">
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">🌍 Target di gruppo</span>
                                <span className="text-[10px] text-slate-600">contano a RETE: la politica decide dove la Bussola fa caricare</span>
                                <span className={cn("ml-auto text-slate-500 transition-transform text-xs", gruppoAperto && "rotate-180")}>▾</span>
                            </button>
                            {gruppoAperto && dir.pisteGruppo.map((pg) => {
                                const meta = dir.pisteTab.find((p) => p.chiave === pg);
                                if (!meta) return null;
                                const puntiRete = Math.round(dir.codici.reduce((s, k) => s + (k.piste[pg]?.punti || 0), 0) * 100) / 100;
                                const pezziRete = dir.codici.reduce((s, k) => s + (k.piste[pg]?.pezzi || 0), 0);
                                const scalaRete = (dir.tab?.soglie || []).filter((s) => s.pista === pg).sort((a, b) => a.tier - b.tier).map((s) => ({ tier: s.tier, soglia_da: Number(s.soglia_da) }));
                                const pol = dir.politiche[pg]?.modo || "proprio";
                                const polKey = `pol|${pg}`;
                                const projRete = proiezioneDir(dir, puntiRete);
                                return (
                                    <div key={pg} className="space-y-2">
                                        <SogliaBar emoji={EMOJI_PISTA(meta.nome)} label={`${meta.nome} · rete`}
                                            punti={puntiRete} pezzi={pezziRete} soglie={scalaRete}
                                            colore={bMeta.color} proiezione={projRete}
                                            unit={meta.um === "pezzi" ? "pz" : "pt"} nota={null} />
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">politica</span>
                                            <button onClick={() => salvaPolitica(pg, "proprio")}
                                                className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                                                    pol === "proprio" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/10")}>
                                                🏠 Ognuno sul suo
                                            </button>
                                            <button onClick={() => salvaPolitica(pg, "bilancia")}
                                                className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                                                    pol === "bilancia" ? "bg-sky-500/15 text-sky-300 border-sky-500/40" : "bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/10")}>
                                                ⚖️ Bilancia{pol === "bilancia" ? ` (${finestraBilancia(String((dir.politiche[pg]?.dati as { fino?: string } | null)?.fino || "")).label})` : ""}
                                            </button>
                                            {/* 📅 il calendario del bilancia (Luca notte-8): la scelta
                                                vale FINO a questa data, poi si ricalcola */}
                                            {pol === "bilancia" && (
                                                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                                                    vale fino al
                                                    <input type="date" min={dir.monthISO.slice(0, 8) + "01"}
                                                        value={String((dir.politiche[pg]?.dati as { fino?: string } | null)?.fino || "")}
                                                        onChange={(e) => salvaPolitica(pg, "bilancia", { ...((dir.politiche[pg]?.dati as Record<string, unknown>) || {}), fino: e.target.value })}
                                                        className="glass-input !h-8 text-xs" />
                                                </label>
                                            )}
                                            {salvate[polKey] && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                            {erroriSalva[polKey] && <span className="text-[10px] font-bold text-rose-300">✗</span>}
                                            <span className="text-[10px] text-slate-600">{pol === "proprio" ? "ogni negozio carica sul suo codice (i multibrand sull'associato)" : "la Bussola indirizza sul codice più scarico, stabile nella finestra"}</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {/* i MULTIBRAND non caricano MAI sul loro codice: qui
                                l'ASSOCIAZIONE al franchising per le categorie libere */}
                            {gruppoAperto && dir.codici.some((k) => k.multibrand) && (
                                <div className="pt-3 border-t border-white/5 space-y-2">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase">Codice associato dei multibrand <span className="normal-case font-normal">(per le categorie «ognuno sul suo»)</span></div>
                                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                                        {dir.codici.filter((k) => k.multibrand).map((mb) => {
                                            const franchising = dir.codici.filter((k) => !k.multibrand);
                                            const mappa = (dir.politiche["__associati__"]?.dati || {}) as Record<string, string>;
                                            const attuale = mappa[mb.cod_gara] || "";
                                            return (
                                                <div key={mb.cod_gara} className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-slate-300">{mb.negozio} →</span>
                                                    <div className="flex gap-1">
                                                        {franchising.map((f) => (
                                                            <button key={f.cod_gara}
                                                                onClick={() => salvaPolitica("__associati__", "mappa", { ...mappa, [mb.cod_gara]: attuale === f.cod_gara ? "" : f.cod_gara })}
                                                                title={f.negozio}
                                                                className={cn("px-2 py-1 rounded-lg text-[10px] font-bold border transition-all",
                                                                    attuale === f.cod_gara ? "text-white border-transparent" : "bg-white/[0.04] text-slate-400 border-white/10 hover:bg-white/10")}
                                                                style={attuale === f.cod_gara ? { background: bMeta.color } : undefined}>
                                                                {nomeBreve(f.negozio)}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {sez.items.map((k) => {
                        const on = aperto === k.cod_gara;
                        // SOLO i KPI su cui l'operatore pesa PER CODICE (W3:
                        // mobile, fisso, CB a punti, protetti — Luca 26/08):
                        // le categorie di gruppo vivono nella card sotto
                        const pisteMostrate = dir.pisteTab.filter((p) => dir.kpiCodice.includes(p.chiave) && !PISTE_FUORI.has(p.chiave));
                        // SEMAFORO (Luca 27/08): un pallino per target — verde
                        // preso, giallo lo prende in proiezione, rosso nemmeno lì
                        const semafori = pisteMostrate
                            .filter((p) => (k.targets[p.chiave] || 0) > 0)
                            .map((p) => {
                                const t = k.targets[p.chiave] || 0;
                                const cbSem = dir.brand === "windtre" && p.chiave === "cb";
                                const f = cbSem ? (k.cbPunti || 0) : (k.piste[p.chiave]?.punti || 0);
                                const pj = proiezioneDir(dir, f);
                                const stato = f >= t ? "verde" : (pj != null && pj >= t) ? "giallo" : "rosso";
                                return { chiave: p.chiave, nome: p.nome, t, f, stato };
                            });
                        return (
                            <div key={k.cod_gara} className="glass-card overflow-hidden transition-shadow"
                                style={{ borderLeft: `3px solid ${on ? bMeta.color : `color-mix(in srgb, ${bMeta.color} 35%, transparent)`}`, boxShadow: on ? `0 0 22px color-mix(in srgb, ${bMeta.color} 22%, transparent)` : undefined }}>
                                <button onClick={() => setAperto(on ? null : k.cod_gara)} className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: bMeta.color, boxShadow: `0 0 8px ${bMeta.color}` }} />
                                        <span className="text-sm font-black text-white truncate">{k.negozio}</span>
                                        <span className="text-[10px] font-mono text-slate-500">{k.cod_gara}</span>
                                        {k.cluster && <span className="text-[10px] text-slate-500 truncate hidden sm:inline">· {k.cluster}</span>}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {semafori.length > 0 && (
                                            <span className="flex items-center gap-1.5 bg-white/[0.04] border border-white/10 rounded-md px-2 py-1.5">
                                                {semafori.map((sm) => (
                                                    <span key={sm.chiave}
                                                        title={`${sm.nome}: ${it(sm.f)} / ${it(sm.t)} — ${sm.stato === "verde" ? "🎯 target preso" : sm.stato === "giallo" ? "in proiezione lo prende" : "nemmeno in proiezione: serve una spinta"}`}
                                                        className={cn("w-2.5 h-2.5 rounded-full", sm.stato === "rosso" && "animate-pulse")}
                                                        style={sm.stato === "verde" ? { background: "#34d399", boxShadow: "0 0 7px #34d399" }
                                                            : sm.stato === "giallo" ? { background: "#fbbf24", boxShadow: "0 0 7px #fbbf2488" }
                                                                : { background: "#f43f5e", boxShadow: "0 0 7px #f43f5e88" }} />
                                                ))}
                                            </span>
                                        )}
                                        <span className={cn("text-slate-500 transition-transform text-xs", on && "rotate-180")}>▾</span>
                                    </div>
                                </button>
                                {on && (
                                    <div className="border-t border-white/5 divide-y divide-white/[0.04]">
                                        {pisteMostrate.map((p) => {
                                            const scala = k.soglie[p.chiave] || null;
                                            // la CB «va a punti» (gara parallela Partnership):
                                            // il numero che conta è cbPunti, i pezzi nel sub
                                            const cbW3 = dir.brand === "windtre" && p.chiave === "cb";
                                            const avz = cbW3
                                                ? { punti: k.cbPunti || 0, pezzi: k.piste[p.chiave]?.pezzi || 0 }
                                                : (k.piste[p.chiave] || { punti: 0, pezzi: 0 });
                                            const chiave = `${k.cod_gara}|${p.chiave}`;
                                            const target = k.targets[p.chiave] || 0;
                                            const sfrido = Math.round(Number(dir.sfridi[p.chiave]) || 0);
                                            const bozza = bozze[chiave] ?? (target ? String(target) : "");
                                            const proj = proiezioneDir(dir, avz.punti);
                                            const perc = target > 0 ? Math.min(100, Math.round((avz.punti / target) * 100)) : 0;
                                            return (
                                                <div key={p.chiave} className="px-4 py-3.5 space-y-2.5">
                                                    {/* LA BARRA come in Analisi → Rete: produzione piena,
                                                        proiezione a strisce, tacche alle soglie */}
                                                    <SogliaBar
                                                        emoji={EMOJI_PISTA(p.nome)} label={cbW3 ? `${p.nome} · punti` : p.nome}
                                                        punti={avz.punti} pezzi={avz.pezzi}
                                                        soglie={(scala || []).map((s, i) => ({ tier: i + 1, soglia_da: Number(s) }))}
                                                        colore={bMeta.color} proiezione={proj}
                                                        targetDir={target > 0 ? target : null}
                                                        unit={cbW3 ? "pt" : (p.um === "pezzi" ? "pz" : "pt")}
                                                        nota={[cbW3 ? `${avz.pezzi} eventi CB` : null, target > 0 ? `target direzione ${it(target)} · ${avz.punti < target ? `mancano ${it(Math.max(0, Math.ceil(target - avz.punti)))}` : "🎯 fatto"}` : null].filter(Boolean).join(" · ") || null}
                                                    />
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                                        {/* le SOGLIE: click = target (INTERO, sfrido incluso);
                                                            RICLICK sulla attiva = si toglie (bug Collatina S2).
                                                            Le soglie a 0 (S1 Sky) non fanno pillola: un target 0
                                                            sarebbe un finto no-op (revisore) */}
                                                        <div className="flex flex-wrap gap-1.5 flex-1 min-w-[220px]">
                                                            {scala && scala.length ? scala.map((s, i) => {
                                                                if (!(Number(s) > 0)) return null;
                                                                const valore = targetConSfrido(Number(s), sfrido);
                                                                const attiva = target === valore && target > 0;
                                                                return (
                                                                    <button key={i}
                                                                        onClick={() => {
                                                                            const nuovo = attiva ? 0 : valore;
                                                                            setBozze((b) => ({ ...b, [chiave]: nuovo ? String(nuovo) : "" }));
                                                                            salva(k.cod_gara, p.chiave, nuovo, nuovo ? i + 1 : null);
                                                                        }}
                                                                        title={attiva ? "Riclicca per togliere il target" : (sfrido ? `${etichettaSoglia(dir.brand, p.chiave, i)} = ${it(Number(s))} + ${sfrido}% sfrido → ${valore}` : `${etichettaSoglia(dir.brand, p.chiave, i)} = ${it(Number(s))}`)}
                                                                        className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                                                                            attiva ? "text-white border-transparent scale-105" : "bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/10 hover:scale-[1.03]")}
                                                                        style={attiva ? {
                                                                            background: `linear-gradient(160deg, ${bMeta.color}, color-mix(in srgb, ${bMeta.color} 62%, #000))`,
                                                                            boxShadow: `0 0 14px color-mix(in srgb, ${bMeta.color} 55%, transparent)`,
                                                                        } : undefined}>
                                                                        {etichettaSoglia(dir.brand, p.chiave, i)} · {valore}{attiva ? " ✕" : ""}
                                                                    </button>
                                                                );
                                                            }) : <span className="text-[10px] text-slate-600">nessuna scala per questa pista: target a mano qui a destra</span>}
                                                        </div>
                                                        {/* lo sfrido si imposta SOPRA, una volta per categoria:
                                                            qui solo il promemoria che le pillole sono maggiorate */}
                                                        {sfrido > 0 && (
                                                            <span className="shrink-0 text-[10px] font-bold text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-md px-2 py-0.5" title="Le soglie qui sopra sono già maggiorate dello sfrido di categoria">
                                                                +{sfrido}% sfrido
                                                            </span>
                                                        )}
                                                        {/* target a mano (sempre intero; vuoto = resta com'era) */}
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <input value={bozza} onChange={(e) => setBozze((b) => ({ ...b, [chiave]: e.target.value }))}
                                                                onBlur={() => {
                                                                    if (String(bozza).trim() === "") { setBozze((b) => ({ ...b, [chiave]: target ? String(target) : "" })); return; }
                                                                    const v = Math.max(0, Math.round(Number(String(bozza).replace(",", "."))));
                                                                    if (Number.isFinite(v) && v !== target) salva(k.cod_gara, p.chiave, v);
                                                                }}
                                                                placeholder="target" inputMode="numeric"
                                                                className="glass-input !h-8 w-20 text-xs text-right" />
                                                            {salvate[chiave] && <Check className="w-4 h-4 text-emerald-400" />}
                                                            {erroriSalva[chiave] && <span className="text-[10px] font-bold text-rose-300" title="Scrittura fallita: riprova">✗</span>}
                                                        </div>
                                                    </div>
                                                    {/* target che non combacia con nessuna pillola: scritto a
                                                        mano O figlio di uno sfrido cambiato dopo il click —
                                                        dirlo evita il mistero (rilievo revisore) */}
                                                    {target > 0 && !!(scala && scala.some((s) => Number(s) > 0)) && !scala.some((s) => Number(s) > 0 && targetConSfrido(Number(s), sfrido) === target) && (
                                                        <div className="text-[10px] text-amber-400/80">✍️ target impostato a mano (o con uno sfrido diverso da quello attuale): un click su una soglia lo riallinea.</div>
                                                    )}
                                                    {target > 0 && (
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-1.5 flex-1 rounded-full bg-white/[0.06] overflow-hidden">
                                                                <div className={cn("h-full rounded-full transition-all", perc >= 100 ? "bg-emerald-400" : "bg-sky-400/80")} style={{ width: `${perc}%` }} />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-slate-400 tabular-nums shrink-0">
                                                                {it(avz.punti)} / {it(target)}{avz.punti < target ? ` · mancano ${it(Math.max(0, Math.ceil(target - avz.punti)))}` : " · 🎯 fatto"}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {/* ⚔️ PALETTO BUSINESS (lettera W3): 6 pezzi business per
                                            codice o malus 30% sulla gara mobile del PV — in Gare non
                                            è ancora censito come gate, qui almeno si monitora */}
                                        {dir.brand === "windtre" && !k.multibrand && (() => {
                                            const fatti = k.businessPezzi || 0;
                                            const spPaletto = Math.round(Number(dir.sfridi[SFRIDO_PALETTO]) || 0);
                                            const obiettivo = W3_PALETTO_BUSINESS + spPaletto;
                                            const salvo = fatti >= W3_PALETTO_BUSINESS;      // niente malus
                                            const okP = fatti >= obiettivo;                   // cuscinetto pieno
                                            const percP = Math.min(100, Math.round((fatti / obiettivo) * 100));
                                            return (
                                                <div className="px-4 py-3.5">
                                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                                        <span className="text-xs font-bold text-slate-200">💼 Paletto Business <span className="text-[10px] font-normal text-slate-500">— {W3_PALETTO_BUSINESS} attivazioni P.IVA mobile{spPaletto ? ` + ${spPaletto} di sfrido = obiettivo ${obiettivo}` : ""} o malus 30% sul mobile (vale anche col fisso sotto S1)</span></span>
                                                        <span className={cn("text-[11px] font-black tabular-nums", okP ? "text-emerald-400" : salvo ? "text-amber-300" : "text-rose-300")}>{fatti} / {obiettivo}{okP ? " ✅" : ""}</span>
                                                    </div>
                                                    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                                        <div className={cn("h-full rounded-full transition-all", okP ? "bg-emerald-400" : salvo ? "bg-amber-400" : "bg-rose-400")} style={{ width: `${percP}%` }} />
                                                    </div>
                                                    {!salvo && <div className="text-[10px] text-rose-300/80 mt-1">⚠ mancano {W3_PALETTO_BUSINESS - fatti} al paletto: sotto scatta il −30% sul mobile.</div>}
                                                    {salvo && !okP && <div className="text-[10px] text-amber-300/80 mt-1">paletto salvo — mancano {obiettivo - fatti} al cuscinetto di sicurezza.</div>}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    </div>
                    ))}
                    <div className="text-[10px] text-slate-600 px-1">Punti dal motore gare (tabellare azienda) · produzione allocata per Cod.Ins. · proiezione a strisce sul ritmo dei giorni lavorativi · l&apos;ora di scatto vale anche qui.</div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET HOME — «cosa vendi?» → «caricala su …» (sola lettura, multi-brand)
// Ritorna solo il CONTENUTO (chi lo usa lo avvolge nella sua card/header).
// ─────────────────────────────────────────────────────────────────────────────
export function BussolaWidget({ negozio }: { negozio?: string | null }) {
    const [dirs, setDirs] = useState<Direzione[] | null>(null);
    const [liberi, setLiberi] = useState<Set<string>>(new Set());
    const [brandSel, setBrandSel] = useState<DirBrandId | "">("");
    const [pista, setPista] = useState<string>("");
    // ② TIPO CLIENTE prima della categoria (Luca 27/08-3): preselezione
    // obbligatoria Consumer/Business — così non si sbagliano
    const [tipoCli, setTipoCli] = useState<"consumer" | "business" | "">("");
    // 🔔 notifica cambi (Luca 26/08 notte-5): l'ultimo updated_at della
    // direzione confrontato con l'ultima visita (localStorage per dispositivo)
    const [novita, setNovita] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        (async () => {
            const mese = mesePrimo();
            // i brand con ALMENO un target + quelli in INSERIMENTO LIBERO
            const [tgt, pol] = await Promise.all([
                supabase.from("direzione_targets").select("brand, updated_at").eq("month", mese).gt("target", 0),
                supabase.from("direzione_politiche").select("brand, pista, modo, updated_at").eq("month", mese),
            ]);
            const lib = new Set((pol.data || []).filter((r) => r.pista === "__libero__" && r.modo === "libero").map((r) => String(r.brand)));
            const brands = [...new Set((tgt.data || []).map((r) => String(r.brand)))].filter((b) => DIR_BRANDS.some((x) => x.id === b) && !lib.has(b)) as DirBrandId[];
            const out = await Promise.all(brands.map((b) => caricaDirezione(b, mese).catch(() => null)));
            if (!vivo) return;
            setLiberi(lib);
            setDirs(out.filter(Boolean) as Direzione[]);
            // ultimo cambio della direzione (targets + politiche del mese)
            const ts = [...(tgt.data || []), ...(pol.data || [])].map((r) => String(r.updated_at || "")).filter(Boolean).sort().pop() || null;
            if (ts) {
                let visto = "";
                try { visto = localStorage.getItem("tf_direzione_visto") || ""; } catch { /* storage negato */ }
                if (ts > visto) setNovita(ts);
            }
        })();
        return () => { vivo = false; };
    }, []);
    const segnaVisto = () => {
        try { if (novita) localStorage.setItem("tf_direzione_visto", novita); } catch { /* storage negato */ }
        setNovita(null);
    };

    // doppia porta (come nel Calcolatore): le piste parallele non compaiono
    // MAI qui, qualunque cosa dica il pannello
    const conTarget = useMemo(() => (dirs || []).filter((d) =>
        d.codici.some((k) => Object.entries(k.targets).some(([p, v]) => v > 0 && !PISTE_FUORI.has(p)))), [dirs]);
    const brandsLiberi = useMemo(() => DIR_BRANDS.filter((b) => liberi.has(b.id)), [liberi]);
    const tuttiBrand = useMemo(() => [
        ...conTarget.map((d) => ({ id: d.brand as DirBrandId, libero: false })),
        ...brandsLiberi.map((b) => ({ id: b.id as DirBrandId, libero: true })),
    ], [conTarget, brandsLiberi]);
    useEffect(() => { if (tuttiBrand.length && !tuttiBrand.some((d) => d.id === brandSel)) setBrandSel(tuttiBrand[0].id); }, [tuttiBrand]); // eslint-disable-line
    const brandLibero = liberi.has(brandSel);
    const dir = conTarget.find((d) => d.brand === brandSel) || null;
    const pisteAttive = useMemo(() => {
        if (!dir) return [];
        const con = new Set<string>();
        dir.codici.forEach((k) => Object.entries(k.targets).forEach(([p, v]) => { if (v > 0) con.add(p); }));
        // le categorie di GRUPPO (luce&gas, assicurazioni…) compaiono sempre:
        // la risposta è la POLITICA, non serve un target
        return dir.pisteTab.filter((p) => (con.has(p.chiave) || dir.pisteGruppo.includes(p.chiave)) && !PISTE_FUORI.has(p.chiave));
    }, [dir]);
    // 💼 BUSINESS MOBILE W3 (Luca 27/08): variabile dedicata — la Bussola
    // SPARTISCE le attivazioni per portare TUTTI i codici oltre il paletto
    const BIZMOB = "__bizmob__";
    const èBusinessPista = (p: { chiave: string; nome: string }) => p.chiave === BIZMOB || /business|piva/i.test(p.chiave + " " + p.nome);
    const pisteBussola = useMemo(() => {
        const base = dir?.brand === "windtre"
            ? [...pisteAttive, { chiave: BIZMOB, nome: "Business mobile", um: "pezzi" }]
            : pisteAttive;
        if (tipoCli === "business") return base.filter(èBusinessPista);
        if (tipoCli === "consumer") return base.filter((p) => !èBusinessPista(p));
        return [];   // niente categoria finché non si sceglie il cliente
    }, [dir, pisteAttive, tipoCli]); // eslint-disable-line
    useEffect(() => { setTipoCli(""); setPista(""); }, [brandSel]);
    useEffect(() => { if (pisteBussola.length && !pisteBussola.some((p) => p.chiave === pista)) setPista(pisteBussola[0]?.chiave || ""); }, [pisteBussola]); // eslint-disable-line
    // risposta SECCA per le piste di gruppo (Luca: «per alcune categorie non
    // devono essere costretti a consultare la direzione ogni volta»)
    const [tipGruppo, setTipGruppo] = useState<{ testo: string; sub: string } | null>(null);
    const pistaDiGruppo = !!dir && dir.pisteGruppo.includes(pista);
    useEffect(() => {
        let vivo = true;
        setTipGruppo(null);
        if (!dir || !pistaDiGruppo) return;
        const normS = (s: unknown) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        const nu = normS(negozio);
        const modo = dir.politiche[pista]?.modo || "proprio";
        (async () => {
            if (modo === "bilancia") {
                const r = await codiceBilancia(dir, pista);
                if (vivo && r) setTipGruppo({ testo: `📍 Caricala su ${r.codice.negozio}`, sub: `⚖️ ${finestraBilancia(r.fino).label}` });
                return;
            }
            // «ognuno sul suo»: il multibrand carica sul codice ASSOCIATO
            const mioMb = nu ? dir.codici.find((k) => k.multibrand && k.token.some((t) => nu.startsWith(t) || t.startsWith(nu))) : null;
            if (mioMb) {
                const ass = codiceAssociato(dir, mioMb.cod_gara);
                // senza tante storie (Luca 27/08-4): solo il nome del codice
                if (vivo) setTipGruppo(ass
                    ? { testo: `📍 Caricala su ${ass.negozio}`, sub: "" }
                    : { testo: "🏠 Chiedi alla direzione il tuo codice", sub: "" });
                return;
            }
            if (vivo) setTipGruppo({ testo: "🏠 Caricala sul codice del tuo negozio", sub: "" });
        })();
        return () => { vivo = false; };
    }, [dir, pista, pistaDiGruppo, negozio]);

    if (!dirs) return <div className="p-5 flex items-center justify-center h-full min-h-[160px] text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /></div>;
    if (!tuttiBrand.length) {
        return (
            <div className="p-5 text-center flex flex-col items-center justify-center gap-2 h-full min-h-[160px]">
                <Compass className="w-8 h-8 text-slate-600" />
                <p className="text-xs text-slate-400">La direzione non ha ancora dato i target per codice di questo mese.</p>
                <Link href="/gare?brand=direzione" className="text-[11px] font-bold text-sky-300 hover:text-sky-200">Impostali in Gare → Direzione Inserimento</Link>
            </div>
        );
    }
    const lista = dir && !pistaDiGruppo ? consigliaCodici(dir, pista, negozio, strategiaDi(dir, pista)).slice(0, 5) : [];
    const consigliato = lista.find((k) => k.mancano > 0) || lista[0];
    const bMeta = DIR_BRANDS.find((b) => b.id === brandSel);
    const altre = consigliato ? lista.filter((k) => k.cod_gara !== consigliato.cod_gara) : [];
    return (
        <div className="flex flex-col p-3.5 gap-3">
            {/* 🔔 la direzione ha CAMBIATO gli inserimenti */}
            {novita && (
                <div className="rounded-xl bg-amber-500/[0.12] border border-amber-500/40 px-3 py-2 flex items-center gap-2 animate-pulse">
                    <span className="flex-1 text-[11px] font-bold text-amber-200">🔔 La direzione ha aggiornato gli inserimenti: controlla dove caricare!</span>
                    <button onClick={segnaVisto} title="Ho visto le novità"
                        className="shrink-0 px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-[11px] font-bold text-amber-100 hover:bg-amber-500/30">✓ visto</button>
                </div>
            )}
            {/* ① OPERATORE — tessere logo, come nel caller */}
            <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">① Operatore</div>
                <div className="flex gap-2">
                    {tuttiBrand.map((d) => {
                        const m = DIR_BRANDS.find((b) => b.id === d.id)!;
                        const logo = TRK_BRAND_LOGOS[m.id];
                        const scala = TRK_LOGO_SCALE[m.id] || 1;
                        const attivo = brandSel === d.id;
                        return (
                            <button key={d.id} onClick={() => { setBrandSel(d.id); setPista(""); }} title={m.label} aria-label={m.label}
                                className={cn("flex-1 min-w-0 h-12 flex items-center justify-center rounded-xl border px-2 transition-all",
                                    attivo
                                        ? "border-indigo-400/80 bg-indigo-500/20 ring-1 ring-indigo-400/40 shadow-lg shadow-indigo-500/25 brightness-110"
                                        : "border-white/15 bg-white/[0.05] opacity-70 grayscale-[60%] hover:opacity-90 hover:grayscale-[30%]")}>
                                {logo ? (
                                    <img src={logo} alt={m.label} className="block object-contain max-w-full"
                                        style={{ maxHeight: 30, transform: scala !== 1 ? `scale(${Math.min(scala, 1.3)})` : undefined }} />
                                ) : <span className="text-xs font-bold text-slate-200">{m.label}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>
            {/* brand LIBERO: risposta immediata, niente step 2 */}
            {brandLibero ? (
                <div className="rounded-2xl px-4 py-5 text-center border border-emerald-500/30"
                    style={{ background: "linear-gradient(160deg, rgba(16,185,129,0.14), rgba(16,185,129,0.04))", boxShadow: "0 0 24px rgba(16,185,129,0.18)" }}>
                    <div className="text-2xl font-black text-emerald-300 drop-shadow">🕊️ Inserimento libero</div>
                    <div className="text-[11px] text-slate-400 mt-1">Per {bMeta?.label || "questo brand"} carica sul codice che preferisci: nessuna indicazione dalla direzione.</div>
                </div>
            ) : (<>
                {/* ② TIPO CLIENTE — preselezione anti-errore */}
                <div className="space-y-1.5">
                    <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">② Cliente</div>
                    <div className="flex gap-2">
                        {([["consumer", "👤 Consumer"], ["business", "💼 Business"]] as const).map(([v, l]) => (
                            <button key={v} onClick={() => { setTipoCli(v); setPista(""); }}
                                className={cn("flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                                    tipoCli === v ? "text-white border-transparent scale-[1.02]" : "bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/10")}
                                style={tipoCli === v ? { background: bMeta?.color || "#38bdf8", boxShadow: `0 0 12px color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 50%, transparent)` } : undefined}>
                                {l}
                            </button>
                        ))}
                    </div>
                </div>
                {/* ③ COSA STAI VENDENDO — le variabili dell'operatore */}
                {tipoCli !== "" && <div className="space-y-1.5">
                    <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">③ Cosa stai vendendo?</div>
                    <div className="flex flex-wrap gap-1.5">
                        {pisteBussola.map((p) => (
                            <button key={p.chiave} onClick={() => setPista(p.chiave)}
                                className={cn("px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                                    pista === p.chiave ? "text-white border-transparent scale-105" : "bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/10")}
                                style={pista === p.chiave ? { background: bMeta?.color || "#38bdf8", boxShadow: `0 0 12px color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 50%, transparent)` } : undefined}>
                                {EMOJI_PISTA(p.nome)} {p.nome}
                            </button>
                        ))}
                    </div>
                </div>}
                {/* ④ LA RISPOSTA — la carta col codice, grande */}
                {pista === BIZMOB && dir && (() => {
                    const spPaletto = Math.round(Number(dir.sfridi["__paletto_business__"]) || 0);
                    const obiettivo = W3_PALETTO_BUSINESS + spPaletto;
                    const franchising = dir.codici.filter((k) => !k.multibrand && !k.catchAll)
                        .map((k) => ({ nome: k.negozio, fatti: k.businessPezzi || 0, mio: èMioCodice(k, negozio) }))
                        .sort((a, b) => a.fatti - b.fatti);
                    // DUE FASI (Luca 27/08-5): prima TUTTI al paletto (6),
                    // POI il pezzo di sfrido su chi manca; dentro la fase
                    // vale la strategia (default: si CHIUDE il più vicino)
                    const strat = strategiaDi(dir, BIZMOB);
                    const sottoPaletto = franchising.filter((f) => f.fatti < W3_PALETTO_BUSINESS);
                    const sottoObiettivo = franchising.filter((f) => f.fatti < obiettivo);
                    const fase = sottoPaletto.length ? sottoPaletto : sottoObiettivo;
                    const prioB = prioritaDi(dir, BIZMOB);
                    const rankB = (nome: string) => {
                        const k = dir.codici.find((x) => x.negozio === nome);
                        const i = k ? prioB.indexOf(k.cod_gara) : -1;
                        return i >= 0 ? i : Infinity;
                    };
                    // col «riempi il più scoperto» il negozio del richiedente vince
                    // finché è in fase (= ha capienza); col «vicino» la strategia scavalca
                    const ordinati = [...fase].sort((a, b) =>
                        (rankB(a.nome) - rankB(b.nome))
                        || (strat === "scoperto" && a.mio !== b.mio ? (a.mio ? -1 : 1) : 0)
                        || (strat === "vicino" ? (b.fatti - a.fatti) : (a.fatti - b.fatti)));
                    const scelto = ordinati[0] || null;
                    const faseLabel = sottoPaletto.length ? W3_PALETTO_BUSINESS : obiettivo;
                    // CASCATA (Luca 27/08-2): paletti tutti salvi → si passa
                    // all'esigenza dei PUNTI MOBILE (i target della direzione)
                    const mobConsigli = !scelto ? consigliaCodici(dir, "mobile", negozio, strategiaDi(dir, "mobile")) : [];
                    const mobScelto = mobConsigli.find((k) => k.mancano > 0) || mobConsigli[0] || null;
                    return (<>
                        {scelto ? (
                            <div className="rounded-2xl px-4 py-4 border"
                                style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 18%, transparent), color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 5%, transparent))`, borderColor: `color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 40%, transparent)`, boxShadow: `0 0 26px color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 25%, transparent)` }}>
                                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400">📍 Caricala su</div>
                                <div className="text-2xl font-black text-white leading-tight drop-shadow">{scelto.nome}</div>
                                <div className="text-[11px] font-semibold text-slate-300 mt-1.5">{strat === "vicino" ? "è il più vicino a chiudere" : scelto.mio ? "è il tuo negozio e ha ancora capienza" : "è il più scoperto"}: {scelto.fatti} / {faseLabel}{scelto.fatti < W3_PALETTO_BUSINESS ? " — sotto i " + W3_PALETTO_BUSINESS + " scatta il −30% sul mobile" : " (paletto salvo, ora il pezzo di sfrido)"}</div>
                            </div>
                        ) : mobScelto ? (
                            <div className="rounded-2xl px-4 py-4 border"
                                style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 18%, transparent), color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 5%, transparent))`, borderColor: `color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 40%, transparent)`, boxShadow: `0 0 26px color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 25%, transparent)` }}>
                                <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-300">✅ paletti tutti salvi → ora contano i punti mobile</div>
                                <div className="text-2xl font-black text-white leading-tight drop-shadow flex items-center gap-2 flex-wrap">
                                    {mobScelto.negozio}
                                    {mobScelto.mio && <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded-md px-2 py-0.5">🏠 il tuo negozio</span>}
                                </div>
                                <div className="text-[11px] font-semibold text-slate-300 mt-1">{mobScelto.mancano > 0 ? `mancano ${it(mobScelto.mancano)} punti mobile al target della direzione` : "🎯 anche il mobile è a target: carica dove preferisci"}</div>
                            </div>
                        ) : (
                            <div className="rounded-2xl px-4 py-4 border border-emerald-500/30 text-center"
                                style={{ background: "linear-gradient(160deg, rgba(16,185,129,0.14), rgba(16,185,129,0.04))" }}>
                                <div className="text-lg font-black text-emerald-300">✅ Tutti i codici sopra il paletto</div>
                                <div className="text-[11px] text-slate-400 mt-1">carica dove preferisci (meglio sul tuo negozio)</div>
                            </div>
                        )}
                        <div className="space-y-1">
                            {franchising.map((f) => (
                                <div key={f.nome} className="text-[11px]">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-slate-300">{f.nome}</span>
                                        <span className={cn("shrink-0 tabular-nums font-bold", f.fatti >= obiettivo ? "text-emerald-400" : f.fatti >= W3_PALETTO_BUSINESS ? "text-amber-300" : "text-rose-300")}>{f.fatti} / {obiettivo}</span>
                                    </div>
                                    <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden mt-0.5">
                                        <div className={cn("h-full rounded-full", f.fatti >= obiettivo ? "bg-emerald-400" : f.fatti >= W3_PALETTO_BUSINESS ? "bg-amber-400" : "bg-rose-400")} style={{ width: `${Math.min(100, Math.round((f.fatti / obiettivo) * 100))}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>);
                })()}
                {pista !== BIZMOB && pistaDiGruppo && tipGruppo && (
                    <div className="rounded-2xl px-4 py-4 border text-center"
                        style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 16%, transparent), color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 5%, transparent))`, borderColor: `color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 35%, transparent)`, boxShadow: `0 0 22px color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 22%, transparent)` }}>
                        <div className="text-xl font-black text-white leading-snug">{tipGruppo.testo}</div>
                        {tipGruppo.sub ? <div className="text-[10px] text-slate-400 mt-1">{tipGruppo.sub}</div> : null}
                    </div>
                )}
                {pista !== BIZMOB && !pistaDiGruppo && consigliato && (
                    <div className="rounded-2xl px-4 py-4 border"
                        style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 18%, transparent), color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 5%, transparent))`, borderColor: `color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 40%, transparent)`, boxShadow: `0 0 26px color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 25%, transparent)` }}>
                        <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400">📍 Caricala su</div>
                        <div className="text-2xl font-black text-white leading-tight drop-shadow flex items-center gap-2 flex-wrap">
                            {consigliato.negozio}
                            {consigliato.mio && <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded-md px-2 py-0.5">🏠 il tuo negozio</span>}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-black/30 overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${consigliato.target > 0 ? Math.min(100, Math.round((consigliato.fatti / consigliato.target) * 100)) : 0}%`, background: bMeta?.color || "#38bdf8" }} />
                            </div>
                            <span className="text-[11px] font-bold text-slate-200 tabular-nums shrink-0">{it(consigliato.fatti)} / {it(consigliato.target)}</span>
                        </div>
                        <div className="text-[11px] font-semibold mt-1">{consigliato.sottoS1
                            ? <span className="text-rose-300">🚨 prima esigenza: il Target 1 — mancano {it(consigliato.mancanoS1)} alla S1{consigliato.mio ? " del tuo negozio" : ""}</span>
                            : <span className="text-slate-300">{consigliato.mancano > 0 ? `mancano ${it(consigliato.mancano)} al target della direzione` : "🎯 target raggiunto: prosegui qui o guarda le altre realtà"}</span>}</div>
                    </div>
                )}
                {/* le altre realtà, in piccolo */}
                {pista !== BIZMOB && altre.length > 0 && (
                    <div className="space-y-1">
                        {altre.map((k) => {
                            const perc = k.target > 0 ? Math.min(100, Math.round((k.fatti / k.target) * 100)) : 0;
                            return (
                                <div key={k.cod_gara} className="text-[11px]">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={cn("truncate", k.mio ? "text-white font-bold" : "text-slate-400")}>{k.mio ? "🏠 " : ""}{k.negozio}</span>
                                        <span className="shrink-0 tabular-nums text-slate-500">{it(k.fatti)} / {it(k.target)}</span>
                                    </div>
                                    <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden mt-0.5">
                                        <div className={cn("h-full rounded-full", perc >= 100 ? "bg-emerald-400" : "bg-sky-400/60")} style={{ width: `${perc}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </>)}
            <div className="text-[10px] text-slate-600">Avanzamento per codice di inserimento, dal motore gare · aggiornato all&apos;apertura.</div>
        </div>
    );
}
