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
    DIR_BRANDS, type DirBrandId, type Direzione,
} from "@/lib/direzioneTargets";
import { SogliaBar as SogliaBarRaw } from "@/app/(dashboard)/analisi/_charts";
import { Compass, Loader2, Check, RotateCcw } from "lucide-react";
import { PISTE_PARALLELE } from "@/lib/commissioning";
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
            <div className="glass-card p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3 justify-between">
                    <div className="flex items-center gap-3">
                        <Compass className="w-5 h-5 text-sky-400" />
                        <div>
                            <div className="text-sm font-bold text-white">Direzione Inserimento — target per codice</div>
                            <div className="text-xs text-slate-500 max-w-[560px]">
                                Scegli l&apos;operatore, apri la realtà (codice/canale), guarda la barra come in Analisi → Rete e
                                clicca la soglia da atterrare: il target si calcola da solo, INTERO, con lo sfrido della pista.
                                Riclicca la soglia per toglierla.
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <select value={monthISO} onChange={(e) => setMonthISO(e.target.value)} className="glass-input text-sm !h-10 min-w-[170px]">
                            {mesi.map((m) => <option key={m.iso} value={m.iso}>{m.label}</option>)}
                        </select>
                        <button onClick={() => setGiro((g) => g + 1)} title="Ricarica l'avanzamento" className="p-2 rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"><RotateCcw className="w-4 h-4" /></button>
                    </div>
                </div>
                {/* selettore BRAND: ogni operatore con le sue realtà */}
                <div className="flex flex-wrap gap-2">
                    {DIR_BRANDS.map((b) => (
                        <button key={b.id} onClick={() => setBrand(b.id)}
                            className={cn("px-4 py-2 rounded-xl text-sm font-bold border transition-all",
                                brand === b.id ? "text-white border-transparent shadow-lg" : "text-slate-300 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]")}
                            style={brand === b.id ? { background: b.color } : undefined}>
                            {b.label}
                        </button>
                    ))}
                </div>
            </div>

            {!dir ? (
                <div className="glass-card p-10 flex items-center justify-center gap-2 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /> Carico realtà, tabellare e produzione…</div>
            ) : !dir.tab ? (
                <div className="glass-card p-8 text-center text-sm text-slate-400">Nessun tabellare {bMeta.label} per questo mese: carica prima le gare dell&apos;operatore.</div>
            ) : !dir.codici.length ? (
                <div className="glass-card p-8 text-center text-sm text-slate-400">Nessun codice {bMeta.label} per questo mese{brand === "windtre" ? <> — carica prima il <b>Target PDV</b> della lettera (Gare → WindTre, vista azienda)</> : null}.</div>
            ) : (
                <div className="space-y-3">
                    {dir.nonAllocati > 0 && (
                        <div className="text-[11px] text-amber-400/80 px-1">⚠ {dir.nonAllocati} vendite valide del mese hanno un Cod.Ins. non riconducibile a una realtà: non compaiono qui sotto.</div>
                    )}
                    {dir.codici.map((k) => {
                        const on = aperto === k.cod_gara;
                        const pisteMostrate = dir.pisteTab.filter((p) => !PISTE_FUORI.has(p.chiave));
                        const nTarget = Object.entries(k.targets).filter(([p, v]) => v > 0 && !PISTE_FUORI.has(p)).length;
                        return (
                            <div key={k.cod_gara} className="glass-card overflow-hidden">
                                <button onClick={() => setAperto(on ? null : k.cod_gara)} className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: bMeta.color }} />
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
                                            const avz = k.piste[p.chiave] || { punti: 0, pezzi: 0 };
                                            const chiave = `${k.cod_gara}|${p.chiave}`;
                                            const target = k.targets[p.chiave] || 0;
                                            const sfrido = Math.round(Number(dir.sfridi[p.chiave]) || 0);
                                            const bozza = bozze[chiave] ?? (target ? String(target) : "");
                                            const proj = proiezioneDir(dir, avz.punti);
                                            const perc = target > 0 ? Math.min(100, Math.round((avz.punti / target) * 100)) : 0;
                                            const sfrKey = `sfr|${p.chiave}`;
                                            const bozzaSfr = bozzeSfr[p.chiave] ?? (sfrido ? String(sfrido) : "");
                                            return (
                                                <div key={p.chiave} className="px-4 py-3.5 space-y-2.5">
                                                    {/* LA BARRA come in Analisi → Rete: produzione piena,
                                                        proiezione a strisce, tacche alle soglie */}
                                                    <SogliaBar
                                                        emoji={EMOJI_PISTA(p.nome)} label={p.nome}
                                                        punti={avz.punti} pezzi={avz.pezzi}
                                                        soglie={(scala || []).map((s, i) => ({ tier: i + 1, soglia_da: Number(s) }))}
                                                        colore={bMeta.color} proiezione={proj}
                                                        unit={p.um === "pezzi" ? "pz" : "pt"}
                                                        nota={target > 0 ? `target direzione ${it(target)} · ${avz.punti < target ? `mancano ${it(Math.max(0, Math.ceil(target - avz.punti)))}` : "🎯 fatto"}` : null}
                                                    />
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                                        {/* le SOGLIE: click = target (INTERO, sfrido incluso);
                                                            RICLICK sulla attiva = si toglie (bug Collatina S2) */}
                                                        <div className="flex flex-wrap gap-1.5 flex-1 min-w-[220px]">
                                                            {scala && scala.length ? scala.map((s, i) => {
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
                                                                        className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors",
                                                                            attiva ? "text-white border-transparent" : "bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/10")}
                                                                        style={attiva ? { background: bMeta.color } : undefined}>
                                                                        S{i + 1} · {valore}{attiva ? " ✕" : ""}
                                                                    </button>
                                                                );
                                                            }) : <span className="text-[10px] text-slate-600">nessuna scala per questa pista: target a mano qui a destra</span>}
                                                        </div>
                                                        {/* SFRIDO della pista (vale per tutte le realtà del brand) */}
                                                        <div className="flex items-center gap-1 shrink-0" title="Sfrido: extra % d'errore della pista — si somma alla soglia cliccata, arrotondato per eccesso all'intero">
                                                            <span className="text-[10px] font-bold text-slate-500">sfrido</span>
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
                                    </div>
                                )}
                            </div>
                        );
                    })}
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
        return dir.pisteTab.filter((p) => con.has(p.chiave) && !PISTE_FUORI.has(p.chiave));
    }, [dir]);
    useEffect(() => { if (pisteAttive.length && !pisteAttive.some((p) => p.chiave === pista)) setPista(pisteAttive[0].chiave); }, [pisteAttive]); // eslint-disable-line

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
    const lista = dir ? consigliaCodici(dir, pista, negozio).slice(0, 5) : [];
    const consigliato = lista.find((k) => k.mancano > 0) || lista[0];
    const bMeta = DIR_BRANDS.find((b) => b.id === brandSel);
    return (
        <div className="flex flex-col p-3 gap-2">
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Cosa stai vendendo?</div>
            {conTarget.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                    {conTarget.map((d) => {
                        const m = DIR_BRANDS.find((b) => b.id === d.brand)!;
                        return (
                            <button key={d.brand} onClick={() => { setBrandSel(d.brand); setPista(""); }}
                                className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors",
                                    brandSel === d.brand ? "text-white border-transparent" : "bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/10")}
                                style={brandSel === d.brand ? { background: m.color } : undefined}>
                                {m.label}
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
            {consigliato && (
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
