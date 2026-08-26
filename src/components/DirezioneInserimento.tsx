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
    caricaDirezione, consigliaCodici, targetConSfrido, proiezioneDir,
    finestraBilancia, codiceBilancia, codiceAssociato, W3_PALETTO_BUSINESS,
    DIR_BRANDS, type DirBrandId, type Direzione,
} from "@/lib/direzioneTargets";
import { SogliaBar as SogliaBarRaw } from "@/app/(dashboard)/analisi/_charts";
import { Compass, Loader2, Check, RotateCcw } from "lucide-react";
import { PISTE_PARALLELE } from "@/lib/commissioning";
import { TRK_BRAND_LOGOS } from "@/lib/brandAssets";
import { cn } from "@/utils";

const SogliaBar = SogliaBarRaw as unknown as (p: {
    label: string; emoji?: string; punti: number; pezzi?: number;
    soglie: { tier: number; soglia_da: number }[]; colore?: string;
    proiezione?: number | null; nota?: string | null; unit?: string;
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
    const salva = async (cod_gara: string, pista: string, valore: number) => {
        const chiave = `${cod_gara}|${pista}`;
        const { error } = await supabase.from("direzione_targets").upsert(
            { brand, month: monthISO, cod_gara, pista, target: valore, updated_at: new Date().toISOString(), updated_by: user?.name || null },
            { onConflict: "brand,month,cod_gara,pista" });
        if (error) { flash(chiave, false); return; }
        setDir((p) => p ? {
            ...p,
            codici: p.codici.map((k) => k.cod_gara === cod_gara ? { ...k, targets: { ...k.targets, [pista]: valore } } : k),
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
            {/* SOLO I BRAND (Luca 26/08 sera-4: «lasciami solo i brand» — via la
                descrizione, loghi GRANDI e visibili; mese e refresh a destra) */}
            <div className="glass-card p-4">
                <div className="flex flex-wrap items-center gap-3 justify-between">
                    <div className="flex flex-wrap gap-3">
                        {DIR_BRANDS.map((b) => {
                            const logo = TRK_BRAND_LOGOS[b.id];
                            const attivo = brand === b.id;
                            return (
                                <button key={b.id} onClick={() => setBrand(b.id)} title={b.label}
                                    className={cn("group relative px-7 py-4 rounded-2xl border transition-all duration-200 flex items-center justify-center min-w-[160px]",
                                        attivo ? "scale-105 border-transparent" : "border-white/10 bg-white/[0.07] hover:bg-white/[0.12] hover:scale-[1.03]")}
                                    style={attivo ? {
                                        background: `linear-gradient(160deg, color-mix(in srgb, ${b.color} 30%, #0c0d14), color-mix(in srgb, ${b.color} 12%, #0c0d14))`,
                                        boxShadow: `0 0 30px color-mix(in srgb, ${b.color} 50%, transparent), inset 0 0 16px color-mix(in srgb, ${b.color} 20%, transparent)`,
                                        border: `1px solid color-mix(in srgb, ${b.color} 60%, transparent)`,
                                    } : undefined}>
                                    {logo
                                        ? <img src={logo} alt={b.label} className={cn("h-11 w-auto max-w-[140px] object-contain transition-transform", attivo ? "drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]" : "opacity-90 group-hover:opacity-100")} />
                                        : <span className="text-lg font-black text-white">{b.label}</span>}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2">
                        <select value={monthISO} onChange={(e) => setMonthISO(e.target.value)} className="glass-input text-sm !h-10 min-w-[170px]">
                            {mesi.map((m) => <option key={m.iso} value={m.iso}>{m.label}</option>)}
                        </select>
                        <button onClick={() => setGiro((g) => g + 1)} title="Ricarica l'avanzamento" className="p-2 rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"><RotateCcw className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>

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
                        {dir.pisteTab.filter((p) => !PISTE_FUORI.has(p.chiave)).map((p) => {
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
                    </div>
                </div>
            )}

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
                    {sez.items.map((k) => {
                        const on = aperto === k.cod_gara;
                        // SOLO i KPI su cui l'operatore pesa PER CODICE (W3:
                        // mobile, fisso, CB a punti, protetti — Luca 26/08):
                        // le categorie di gruppo vivono nella card sotto
                        const pisteMostrate = dir.pisteTab.filter((p) => dir.kpiCodice.includes(p.chiave) && !PISTE_FUORI.has(p.chiave));
                        const nTarget = Object.entries(k.targets).filter(([p, v]) => v > 0 && !PISTE_FUORI.has(p)).length;
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
                                        {nTarget > 0 && <span className="text-[10px] font-bold text-sky-300 bg-sky-500/10 border border-sky-500/25 rounded-md px-2 py-0.5">{nTarget} target</span>}
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
                                                                            salva(k.cod_gara, p.chiave, nuovo);
                                                                        }}
                                                                        title={attiva ? "Riclicca per togliere il target" : (sfrido ? `S${i + 1} = ${it(Number(s))} + ${sfrido}% sfrido → ${valore}` : `S${i + 1} = ${it(Number(s))}`)}
                                                                        className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                                                                            attiva ? "text-white border-transparent scale-105" : "bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/10 hover:scale-[1.03]")}
                                                                        style={attiva ? {
                                                                            background: `linear-gradient(160deg, ${bMeta.color}, color-mix(in srgb, ${bMeta.color} 62%, #000))`,
                                                                            boxShadow: `0 0 14px color-mix(in srgb, ${bMeta.color} 55%, transparent)`,
                                                                        } : undefined}>
                                                                        S{i + 1} · {valore}{attiva ? " ✕" : ""}
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
                                            const okP = fatti >= W3_PALETTO_BUSINESS;
                                            const percP = Math.min(100, Math.round((fatti / W3_PALETTO_BUSINESS) * 100));
                                            return (
                                                <div className="px-4 py-3.5">
                                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                                        <span className="text-xs font-bold text-slate-200">💼 Paletto Business <span className="text-[10px] font-normal text-slate-500">— {W3_PALETTO_BUSINESS} attivazioni P.IVA mobile o malus 30% sul mobile (vale anche col fisso sotto S1)</span></span>
                                                        <span className={cn("text-[11px] font-black tabular-nums", okP ? "text-emerald-400" : "text-rose-300")}>{fatti} / {W3_PALETTO_BUSINESS}{okP ? " ✅" : ""}</span>
                                                    </div>
                                                    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                                        <div className={cn("h-full rounded-full transition-all", okP ? "bg-emerald-400" : percP >= 50 ? "bg-amber-400" : "bg-rose-400")} style={{ width: `${percP}%` }} />
                                                    </div>
                                                    {!okP && <div className="text-[10px] text-rose-300/80 mt-1">⚠ mancano {W3_PALETTO_BUSINESS - fatti} pezzi business: sotto il paletto scatta il −30% sul mobile.</div>}
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
                    {/* 🌍 TARGET DI GRUPPO (W3): luce&gas, assicurazioni… — non
                        importa DOVE si caricano: qui la barra di RETE e la
                        POLITICA di caricamento per la Bussola dei ragazzi */}
                    {dir.pisteGruppo.length > 0 && (
                        <div className="glass-card p-4 space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">🌍 Target di gruppo</span>
                                <span className="text-[10px] text-slate-600">contano a RETE: la politica decide dove la Bussola fa caricare</span>
                            </div>
                            {dir.pisteGruppo.map((pg) => {
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
                                                ⚖️ Bilancia ({finestraBilancia().label})
                                            </button>
                                            {salvate[polKey] && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                            {erroriSalva[polKey] && <span className="text-[10px] font-bold text-rose-300">✗</span>}
                                            <span className="text-[10px] text-slate-600">{pol === "proprio" ? "ogni negozio carica sul suo codice (i multibrand sull'associato)" : "la Bussola indirizza sul codice più scarico, stabile nella finestra"}</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {/* i MULTIBRAND non caricano MAI sul loro codice: qui
                                l'ASSOCIAZIONE al franchising per le categorie libere */}
                            {dir.codici.some((k) => k.multibrand) && (
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
                                                                {f.negozio.split(/\s+/)[0]}
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
    const [brandSel, setBrandSel] = useState<DirBrandId | "">("");
    const [pista, setPista] = useState<string>("");

    useEffect(() => {
        let vivo = true;
        (async () => {
            const mese = mesePrimo();
            // solo i brand con ALMENO un target del mese: di solito 1-2 fetch
            const { data } = await supabase.from("direzione_targets").select("brand").eq("month", mese).gt("target", 0);
            const brands = [...new Set((data || []).map((r) => String(r.brand)))].filter((b) => DIR_BRANDS.some((x) => x.id === b)) as DirBrandId[];
            const out = await Promise.all(brands.map((b) => caricaDirezione(b, mese).catch(() => null)));
            if (vivo) setDirs(out.filter(Boolean) as Direzione[]);
        })();
        return () => { vivo = false; };
    }, []);

    // doppia porta (come nel Calcolatore): le piste parallele non compaiono
    // MAI qui, qualunque cosa dica il pannello
    const conTarget = useMemo(() => (dirs || []).filter((d) =>
        d.codici.some((k) => Object.entries(k.targets).some(([p, v]) => v > 0 && !PISTE_FUORI.has(p)))), [dirs]);
    useEffect(() => { if (conTarget.length && !conTarget.some((d) => d.brand === brandSel)) setBrandSel(conTarget[0].brand); }, [conTarget]); // eslint-disable-line
    const dir = conTarget.find((d) => d.brand === brandSel) || null;
    const pisteAttive = useMemo(() => {
        if (!dir) return [];
        const con = new Set<string>();
        dir.codici.forEach((k) => Object.entries(k.targets).forEach(([p, v]) => { if (v > 0) con.add(p); }));
        // le categorie di GRUPPO (luce&gas, assicurazioni…) compaiono sempre:
        // la risposta è la POLITICA, non serve un target
        return dir.pisteTab.filter((p) => (con.has(p.chiave) || dir.pisteGruppo.includes(p.chiave)) && !PISTE_FUORI.has(p.chiave));
    }, [dir]);
    useEffect(() => { if (pisteAttive.length && !pisteAttive.some((p) => p.chiave === pista)) setPista(pisteAttive[0].chiave); }, [pisteAttive]); // eslint-disable-line
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
                const k = await codiceBilancia(dir, pista);
                if (vivo && k) setTipGruppo({ testo: `⚖️ ${finestraBilancia().label}: caricala su ${k.negozio}`, sub: "vale per tutti — così i codici restano bilanciati e non devi ricontrollare ogni volta" });
                return;
            }
            // «ognuno sul suo»: il multibrand carica sul codice ASSOCIATO
            const mioMb = nu ? dir.codici.find((k) => k.multibrand && k.token.some((t) => nu.startsWith(t) || t.startsWith(nu))) : null;
            if (mioMb) {
                const ass = codiceAssociato(dir, mioMb.cod_gara);
                if (vivo) setTipGruppo(ass
                    ? { testo: `🏠 Caricala su ${ass.negozio} (il codice associato al tuo negozio)`, sub: "il codice del multibrand resta a zero: per queste categorie usa sempre l'associato" }
                    : { testo: "🏠 Chiedi alla direzione il codice associato del tuo negozio", sub: "il codice del multibrand resta a zero — l'associazione si imposta in Gare → Direzione" });
                return;
            }
            if (vivo) setTipGruppo({ testo: "🏠 Caricala sul codice del tuo negozio", sub: "per questa categoria non serve la regia: ognuno il suo, senza pensieri" });
        })();
        return () => { vivo = false; };
    }, [dir, pista, pistaDiGruppo, negozio]);

    if (!dirs) return <div className="p-5 flex items-center justify-center h-full min-h-[160px] text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /></div>;
    if (!conTarget.length) {
        return (
            <div className="p-5 text-center flex flex-col items-center justify-center gap-2 h-full min-h-[160px]">
                <Compass className="w-8 h-8 text-slate-600" />
                <p className="text-xs text-slate-400">La direzione non ha ancora dato i target per codice di questo mese.</p>
                <Link href="/gare?brand=direzione" className="text-[11px] font-bold text-sky-300 hover:text-sky-200">Impostali in Gare → Direzione Inserimento</Link>
            </div>
        );
    }
    const lista = dir && !pistaDiGruppo ? consigliaCodici(dir, pista, negozio).slice(0, 5) : [];
    const consigliato = lista.find((k) => k.mancano > 0) || lista[0];
    const bMeta = DIR_BRANDS.find((b) => b.id === brandSel);
    return (
        <div className="flex flex-col p-3 gap-2">
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Cosa stai vendendo?</div>
            {conTarget.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                    {conTarget.map((d) => {
                        const m = DIR_BRANDS.find((b) => b.id === d.brand)!;
                        const logo = TRK_BRAND_LOGOS[m.id];
                        const attivo = brandSel === d.brand;
                        return (
                            <button key={d.brand} onClick={() => { setBrandSel(d.brand); setPista(""); }} title={m.label}
                                className={cn("px-3 py-1.5 rounded-lg border transition-all flex items-center justify-center",
                                    attivo ? "border-transparent scale-105" : "bg-white/[0.04] border-white/10 hover:bg-white/10")}
                                style={attivo ? { background: `color-mix(in srgb, ${m.color} 22%, #0c0d14)`, boxShadow: `0 0 12px color-mix(in srgb, ${m.color} 40%, transparent)`, border: `1px solid color-mix(in srgb, ${m.color} 50%, transparent)` } : undefined}>
                                {logo ? <img src={logo} alt={m.label} className={cn("h-4 w-auto max-w-[64px] object-contain", attivo ? "" : "opacity-75")} /> : <span className="text-[11px] font-bold text-slate-200">{m.label}</span>}
                            </button>
                        );
                    })}
                </div>
            )}
            <div className="flex flex-wrap gap-1.5">
                {pisteAttive.map((p) => (
                    <button key={p.chiave} onClick={() => setPista(p.chiave)}
                        className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors",
                            pista === p.chiave ? "bg-sky-500 text-white border-transparent" : "bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/10")}>
                        {EMOJI_PISTA(p.nome)} {p.nome}
                    </button>
                ))}
            </div>
            {/* pista di GRUPPO: risposta secca dalla politica, niente lista */}
            {pistaDiGruppo && tipGruppo && (
                <div className="rounded-xl px-3 py-2 border" style={{ background: `color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 9%, transparent)`, borderColor: `color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 30%, transparent)` }}>
                    <div className="text-[11px] font-bold text-slate-100">{tipGruppo.testo}</div>
                    <div className="text-[10px] text-slate-400">{tipGruppo.sub}</div>
                </div>
            )}
            {!pistaDiGruppo && consigliato && (
                <div className="rounded-xl px-3 py-2 border" style={{ background: `color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 9%, transparent)`, borderColor: `color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 30%, transparent)` }}>
                    <div className="text-[11px] font-bold text-slate-100">📍 Caricala su <span className="text-white">{consigliato.negozio}</span>{consigliato.mio ? " (il tuo negozio)" : ""}</div>
                    <div className="text-[10px] text-slate-400">{consigliato.mancano > 0 ? `mancano ${it(consigliato.mancano)} al target della direzione` : "target già raggiunto: prosegui qui o guarda le altre realtà"}</div>
                </div>
            )}
            <div className="space-y-1">
                {lista.map((k) => {
                    const perc = k.target > 0 ? Math.min(100, Math.round((k.fatti / k.target) * 100)) : 0;
                    return (
                        <div key={k.cod_gara} className="text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                                <span className={cn("truncate", k.mio ? "text-white font-bold" : "text-slate-300")}>{k.mio ? "🏠 " : ""}{k.negozio}</span>
                                <span className="shrink-0 tabular-nums text-slate-400">{it(k.fatti)} / {it(k.target)}</span>
                            </div>
                            <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden mt-0.5">
                                <div className={cn("h-full rounded-full", perc >= 100 ? "bg-emerald-400" : "bg-sky-400/80")} style={{ width: `${perc}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="text-[10px] text-slate-600">Avanzamento per codice di inserimento, dal motore gare · aggiornato all&apos;apertura.</div>
        </div>
    );
}
