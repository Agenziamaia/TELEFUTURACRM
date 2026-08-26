"use client";

// DIREZIONE INSERIMENTO v2 (Luca 26/08, rifatta da capo su dettato):
// — l'azienda ragiona per CODICE DI INSERIMENTO, non per negozio che
//   registra: qui la direzione IMPOSTA i target per codice e pista (W3: i
//   codici della lettera da pay_target_pdv; Vodafone non serve, è a gruppo
//   unico), cliccando il codice si «esplodono» le sue soglie e il target si
//   sceglie da lì (o a mano);
// — il widget in Home legge l'avanzamento LIVE per codice dal motore e,
//   quando il ragazzo dichiara cosa sta vendendo, indirizza la vendita sul
//   codice dove manca di più — col favore al negozio di chi chiede.
// La vecchia mappa statica (tabella direzione_inserimento) resta a DB ma
// non è più montata: questa la sostituisce (export con gli stessi nomi).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { caricaDirezione, consigliaCodici, type Direzione } from "@/lib/direzioneTargets";
import { Compass, Loader2, Check, RotateCcw } from "lucide-react";
import { cn } from "@/utils";

const it = (v: number) => Number(v || 0).toLocaleString("it-IT", { maximumFractionDigits: 2 });
const mesePrimo = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };

// piste da NON targetizzare mai (conteggi paralleli / pay unico senza corsa)
const PISTE_FUORI = new Set(["partnership"]);

// ─────────────────────────────────────────────────────────────────────────────
// PANNELLO ADMIN (Gare → Direzione Inserimento)
// ─────────────────────────────────────────────────────────────────────────────
export function DirezioneInserimentoAdmin() {
    const { user } = useAuth();
    const [monthISO, setMonthISO] = useState(mesePrimo());
    const [dir, setDir] = useState<Direzione | null>(null);
    const [aperto, setAperto] = useState<string | null>(null);
    const [bozze, setBozze] = useState<Record<string, string>>({});     // "cod|pista" → input
    const [salvate, setSalvate] = useState<Record<string, boolean>>({});
    const [giro, setGiro] = useState(0);

    useEffect(() => {
        let vivo = true;
        setDir(null);
        caricaDirezione(monthISO).then((d) => { if (vivo) { setDir(d); setBozze({}); } });
        return () => { vivo = false; };
    }, [monthISO, giro]);

    const [erroriSalva, setErroriSalva] = useState<Record<string, boolean>>({});
    const salva = async (cod_gara: string, pista: string, valore: number) => {
        const chiave = `${cod_gara}|${pista}`;
        const { error } = await supabase.from("direzione_targets").upsert(
            { brand: "windtre", month: monthISO, cod_gara, pista, target: valore, updated_at: new Date().toISOString(), updated_by: user?.name || null },
            { onConflict: "brand,month,cod_gara,pista" });
        // niente ✓ su scrittura fallita (rilievo revisore): rosso e si riprova
        if (error) { setErroriSalva((s) => ({ ...s, [chiave]: true })); return; }
        setErroriSalva((s) => ({ ...s, [chiave]: false }));
        setDir((p) => p ? {
            ...p,
            codici: p.codici.map((k) => k.cod_gara === cod_gara ? { ...k, targets: { ...k.targets, [pista]: valore } } : k),
        } : p);
        setSalvate((s) => ({ ...s, [chiave]: true }));
        setTimeout(() => setSalvate((s) => ({ ...s, [chiave]: false })), 1600);
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

    return (
        <div className="space-y-4">
            <div className="glass-card p-4 flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-center gap-3">
                    <Compass className="w-5 h-5 text-sky-400" />
                    <div>
                        <div className="text-sm font-bold text-white">Direzione Inserimento — target per codice</div>
                        <div className="text-xs text-slate-500 max-w-[560px]">
                            L&apos;azienda ragiona per <b>codice di inserimento</b>: clicca un codice, guarda le sue soglie e dagli il
                            target del mese per pista. Il widget in Home indirizza le vendite dei ragazzi sul codice dove manca di
                            più (col favore al loro negozio). Vodafone non serve: la lettera A è a gruppo unico.
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

            {!dir ? (
                <div className="glass-card p-10 flex items-center justify-center gap-2 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /> Carico codici, tabellare e produzione…</div>
            ) : !dir.codici.length ? (
                <div className="glass-card p-8 text-center text-sm text-slate-400">Nessun codice W3 per questo mese: carica prima il <b>Target PDV</b> della lettera (Gare → WindTre, vista azienda).</div>
            ) : (
                <div className="space-y-3">
                    {dir.nonAllocati > 0 && (
                        <div className="text-[11px] text-amber-400/80 px-1">⚠ {dir.nonAllocati} vendite valide del mese hanno un Cod.Ins. non riconducibile a un codice della lettera: non compaiono in nessuna riga qui sotto.</div>
                    )}
                    {dir.codici.map((k) => {
                        const on = aperto === k.cod_gara;
                        // TUTTE le piste, sempre (rilievo revisore: a inizio mese
                        // cb/lucegas non avevano produzione né scala → sparivano
                        // e il primo target era impossibile da dare)
                        const pisteMostrate = dir.pisteTab.filter((p) => !PISTE_FUORI.has(p.chiave));
                        const nTarget = Object.values(k.targets).filter((v) => v > 0).length;
                        return (
                            <div key={k.cod_gara} className="glass-card overflow-hidden">
                                <button onClick={() => setAperto(on ? null : k.cod_gara)} className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors">
                                    <div className="flex items-center gap-3 min-w-0">
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
                                            const bozza = bozze[chiave] ?? (target ? String(target) : "");
                                            const perc = target > 0 ? Math.min(100, Math.round((avz.punti / target) * 100)) : 0;
                                            return (
                                                <div key={p.chiave} className="px-4 py-3">
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                                        <div className="w-40 shrink-0">
                                                            <div className="text-xs font-bold text-slate-200">{p.nome}</div>
                                                            <div className="text-[10px] text-slate-500">{it(avz.punti)} {p.um} fatti · {avz.pezzi} pezzi</div>
                                                        </div>
                                                        {/* le SOGLIE del codice esplose: click = target */}
                                                        <div className="flex flex-wrap gap-1.5 flex-1 min-w-[200px]">
                                                            {scala ? scala.map((s, i) => (
                                                                <button key={i} onClick={() => { setBozze((b) => ({ ...b, [chiave]: String(s) })); salva(k.cod_gara, p.chiave, s); }}
                                                                    className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors",
                                                                        target === s ? "bg-sky-500 text-white border-transparent" : "bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/10")}>
                                                                    S{i + 1} · {it(s)}
                                                                </button>
                                                            )) : <span className="text-[10px] text-slate-600">nessuna scala per-codice in lettera{dir.tab ? " (scala di rete in Gare)" : ""}</span>}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <input value={bozza} onChange={(e) => setBozze((b) => ({ ...b, [chiave]: e.target.value }))}
                                                                onBlur={() => {
                                                                    // input svuotato ≠ «metti 0»: per azzerare si scrive 0
                                                                    // (rilievo revisore: Number("")===0 sovrascriveva)
                                                                    if (String(bozza).trim() === "") { setBozze((b) => ({ ...b, [chiave]: target ? String(target) : "" })); return; }
                                                                    const v = Number(String(bozza).replace(",", "."));
                                                                    if (Number.isFinite(v) && v !== target) salva(k.cod_gara, p.chiave, Math.max(0, v));
                                                                }}
                                                                placeholder="target" inputMode="decimal"
                                                                className="glass-input !h-8 w-20 text-xs text-right" />
                                                            {salvate[chiave] && <Check className="w-4 h-4 text-emerald-400" />}
                                                            {erroriSalva[chiave] && <span className="text-[10px] font-bold text-rose-300" title="Scrittura fallita: riprova">✗</span>}
                                                        </div>
                                                    </div>
                                                    {target > 0 && (
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <div className="h-1.5 flex-1 rounded-full bg-white/[0.06] overflow-hidden">
                                                                <div className={cn("h-full rounded-full transition-all", perc >= 100 ? "bg-emerald-400" : "bg-sky-400/80")} style={{ width: `${perc}%` }} />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-slate-400 tabular-nums shrink-0">
                                                                {it(avz.punti)} / {it(target)}{avz.punti < target ? ` · mancano ${it(Math.round((target - avz.punti) * 100) / 100)}` : " · 🎯 fatto"}
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
                    <div className="text-[10px] text-slate-600 px-1">Punti dal motore gare (tabellare azienda) · produzione allocata per Cod.Ins. · l&apos;ora di scatto vale anche qui.</div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET HOME — «cosa vendi?» → «caricala su …» (sola lettura)
// Ritorna solo il CONTENUTO (chi lo usa lo avvolge nella sua card/header).
// ─────────────────────────────────────────────────────────────────────────────
export function BussolaWidget({ negozio }: { negozio?: string | null }) {
    const [dir, setDir] = useState<Direzione | null>(null);
    const [pista, setPista] = useState<string>("");

    useEffect(() => {
        let vivo = true;
        caricaDirezione(mesePrimo()).then((d) => { if (vivo) setDir(d); });
        return () => { vivo = false; };
    }, []);

    const pisteAttive = useMemo(() => {
        if (!dir) return [];
        const con = new Set<string>();
        dir.codici.forEach((k) => Object.entries(k.targets).forEach(([p, v]) => { if (v > 0) con.add(p); }));
        return dir.pisteTab.filter((p) => con.has(p.chiave));
    }, [dir]);
    useEffect(() => { if (pisteAttive.length && !pisteAttive.some((p) => p.chiave === pista)) setPista(pisteAttive[0].chiave); }, [pisteAttive]); // eslint-disable-line

    if (!dir) return <div className="p-5 flex items-center justify-center h-full min-h-[160px] text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /></div>;
    if (!pisteAttive.length) {
        return (
            <div className="p-5 text-center flex flex-col items-center justify-center gap-2 h-full min-h-[160px]">
                <Compass className="w-8 h-8 text-slate-600" />
                <p className="text-xs text-slate-400">La direzione non ha ancora dato i target per codice di questo mese.</p>
                <Link href="/gare?brand=direzione" className="text-[11px] font-bold text-sky-300 hover:text-sky-200">Impostali in Gare → Direzione Inserimento</Link>
            </div>
        );
    }
    const lista = consigliaCodici(dir, pista, negozio).slice(0, 5);
    const consigliato = lista.find((k) => k.mancano > 0) || lista[0];
    return (
        <div className="flex flex-col p-3 gap-2">
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Cosa stai vendendo? <span className="normal-case font-normal">(WindTre)</span></div>
            <div className="flex flex-wrap gap-1.5">
                {pisteAttive.map((p) => (
                    <button key={p.chiave} onClick={() => setPista(p.chiave)}
                        className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors",
                            pista === p.chiave ? "bg-sky-500 text-white border-transparent" : "bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/10")}>
                        {p.nome}
                    </button>
                ))}
            </div>
            {consigliato && (
                <div className="rounded-xl bg-sky-500/[0.08] border border-sky-500/25 px-3 py-2">
                    <div className="text-[11px] font-bold text-sky-200">📍 Caricala su <span className="text-white">{consigliato.negozio}</span>{consigliato.mio ? " (il tuo negozio)" : ""}</div>
                    <div className="text-[10px] text-slate-400">{consigliato.mancano > 0 ? `mancano ${it(consigliato.mancano)} al target della direzione` : "target già raggiunto: prosegui qui o guarda gli altri codici"}</div>
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

// (compat: il vecchio elenco brand non serve più al nuovo pannello, ma resta
// esportato per eventuali import esterni)
export const DIR_BRANDS = [
    { id: "windtre", label: "WindTre", color: "var(--tf-ff6b00)" },
] as const;
