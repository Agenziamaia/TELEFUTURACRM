"use client";

// TABELLARI GARE (cantiere GARE 10/08, direttiva Luca: "devo poterci lavorare
// sulle tabelle per ogni brand e cambiargli le soglie, tutto molto intuitivo").
// Amministra pay_piste / pay_soglie / pay_righe per CONTESTO+mese — la fonte
// del Calcolatore $$$ e del motore commissioning. I contesti VF/FW seguono la
// mappa T1/T2 (lib/commissioning): le vendite si allocano col codice di
// inserimento. Le soglie si scrivono come le pensa Luca: solo il "da S1..Sn",
// il fino-a si ricava da solo. I tabellari seedati valgono LUGLIO (tranne
// VF T1 già di agosto): da qui si ritoccano mese per mese.
import { useCallback, useEffect, useState } from "react";
import { Copy, Plus, Save, Trash2, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { dbError, notify } from "./toast";

type Pista = { id: string; chiave: string; nome: string; um: string; ordine: number };
type Soglia = { id?: string; pista: string; tier: number; soglia_da: number; soglia_a: number | null };
type Riga = {
    id: string; pista: string | null; nome: string;
    tipo_cliente: string | null; categoria: string | null; prodotto: string | null; offerta: string | null;
    brand_vendita: string | null; punti: number; pay_base: number | null; pay_tiers: number[];
    gettone: boolean; attivo: boolean; note: string | null; ordine: number;
};

const CONTESTI = [
    { key: "windtre", label: "WindTre", colore: "#FF6B00" },
    { key: "vodafone", label: "Vodafone Store · T1", colore: "#E60000" },
    { key: "vodafone_vnd", label: "Vodafone VND · T2", colore: "#FF6666" },
    { key: "fastweb", label: "Fastweb · T2", colore: "#CC9900" },
    { key: "sky", label: "Sky", colore: "#0072C6" },
];
const BRAND_VENDITA = ["windtre", "vodafone", "fastweb", "sky", "tim", "iliad", "very", "ho", "kena", "s4", "dojo", "kipoint"];

const meseCorrente = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const mesePrec = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    const d = new Date(y, mm - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const inputCls = "bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1 text-sm text-white w-20 text-right";
const num = (v: string): number => {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
};

export function PayTabellariView() {
    const [mese, setMese] = useState(meseCorrente());
    const monthISO = `${mese}-01`;
    const [ctx, setCtx] = useState<string>("windtre");
    const meta = CONTESTI.find(c => c.key === ctx);
    const colore = meta?.colore || "#6366f1";

    const [piste, setPiste] = useState<Pista[]>([]);
    const [soglie, setSoglie] = useState<Soglia[]>([]);          // copia editabile
    const [soglieDirty, setSoglieDirty] = useState<Set<string>>(new Set());   // per pista
    const [righe, setRighe] = useState<Riga[]>([]);
    const [orig, setOrig] = useState<Map<string, string>>(new Map());   // id → JSON per il dirty
    const [carico, setCarico] = useState(false);
    const [nuovaRigaPer, setNuovaRigaPer] = useState<string | null>(null);   // chiave pista | "__gettoni"

    const load = useCallback(async () => {
        setCarico(true); setSoglieDirty(new Set()); setNuovaRigaPer(null);
        const [p, s, r] = await Promise.all([
            supabase.from("pay_piste").select("id, chiave, nome, um, ordine").eq("brand", ctx).eq("month", monthISO).order("ordine"),
            supabase.from("pay_soglie").select("id, pista, tier, soglia_da, soglia_a").eq("brand", ctx).eq("month", monthISO).order("tier"),
            supabase.from("pay_righe").select("id, pista, nome, tipo_cliente, categoria, prodotto, offerta, brand_vendita, punti, pay_base, pay_tiers, gettone, attivo, note, ordine").eq("brand", ctx).eq("month", monthISO).order("ordine").limit(1000),
        ]);
        if (dbError("Caricamento tabellare", p.error || s.error || r.error)) { setCarico(false); return; }
        setPiste((p.data || []) as Pista[]);
        setSoglie(((s.data || []) as Soglia[]).map(x => ({ ...x, soglia_da: Number(x.soglia_da), soglia_a: x.soglia_a == null ? null : Number(x.soglia_a) })));
        const rr = ((r.data || []) as Riga[]).map(x => ({
            ...x, punti: Number(x.punti || 0), pay_base: x.pay_base == null ? null : Number(x.pay_base),
            pay_tiers: Array.isArray(x.pay_tiers) ? x.pay_tiers.map(Number) : [],
        }));
        setRighe(rr);
        setOrig(new Map(rr.map(x => [x.id, JSON.stringify(x)])));
        setCarico(false);
    }, [ctx, monthISO]);
    useEffect(() => { load(); }, [load]);

    // ── SOGLIE: si edita solo il "da"; il fino-a si ricalcola a catena
    const soglieDi = (pista: string) => soglie.filter(s => s.pista === pista).sort((a, b) => a.tier - b.tier);
    const setDa = (pista: string, tier: number, v: string) => {
        setSoglie(prev => prev.map(s => s.pista === pista && s.tier === tier ? { ...s, soglia_da: num(v) } : s));
        setSoglieDirty(prev => new Set(prev).add(pista));
    };
    const addSoglia = (pista: string) => {
        const scala = soglieDi(pista);
        const ultima = scala[scala.length - 1];
        setSoglie(prev => [...prev, { pista, tier: (ultima?.tier || 0) + 1, soglia_da: (ultima?.soglia_da || 0) + 100, soglia_a: null }]);
        setSoglieDirty(prev => new Set(prev).add(pista));
    };
    const dropSoglia = (pista: string) => {
        const scala = soglieDi(pista);
        if (scala.length <= 1) { notify("Serve almeno una soglia"); return; }
        setSoglie(prev => prev.filter(s => !(s.pista === pista && s.tier === scala[scala.length - 1].tier)));
        setSoglieDirty(prev => new Set(prev).add(pista));
    };
    const salvaSoglie = async (pista: string) => {
        const scala = soglieDi(pista);
        for (let i = 0; i < scala.length - 1; i++)
            if (scala[i + 1].soglia_da <= scala[i].soglia_da) { notify(`S${i + 2} deve partire dopo S${i + 1}`); return; }
        const del = await supabase.from("pay_soglie").delete().eq("brand", ctx).eq("month", monthISO).eq("pista", pista);
        if (dbError("Salvataggio soglie", del.error)) return;
        const ins = await supabase.from("pay_soglie").insert(scala.map((s, i) => ({
            brand: ctx, month: monthISO, pista, tier: i + 1,
            soglia_da: s.soglia_da, soglia_a: i < scala.length - 1 ? scala[i + 1].soglia_da - 1 : null,
        })));
        if (dbError("Salvataggio soglie", ins.error)) return;
        notify("Soglie salvate ✓", "ok"); load();
    };

    // ── RIGHE
    const dirty = (r: Riga) => orig.get(r.id) !== JSON.stringify(r);
    const upRiga = (id: string, patch: Partial<Riga>) =>
        setRighe(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    const salvaRiga = async (r: Riga) => {
        const { error } = await supabase.from("pay_righe").update({
            nome: r.nome, punti: r.punti, pay_base: r.pay_base, pay_tiers: r.pay_tiers,
            gettone: r.gettone, attivo: r.attivo, note: r.note || null,
        }).eq("id", r.id);
        if (dbError("Salvataggio riga", error)) return;
        setOrig(prev => new Map(prev).set(r.id, JSON.stringify(r)));
        notify("Riga salvata ✓", "ok");
    };
    const eliminaRiga = async (r: Riga) => {
        if (!confirm(`Eliminare la riga "${r.nome}"? Le vendite che agganciava diventano scoperture.`)) return;
        const { error } = await supabase.from("pay_righe").delete().eq("id", r.id);
        if (dbError("Eliminazione", error)) return;
        setRighe(prev => prev.filter(x => x.id !== r.id));
    };

    // ── COPIA dal mese precedente (tabellare vuoto)
    const copiaMese = async () => {
        const prev = `${mesePrec(mese)}-01`;
        const [p, s, r] = await Promise.all([
            supabase.from("pay_piste").select("chiave, nome, um, ordine").eq("brand", ctx).eq("month", prev),
            supabase.from("pay_soglie").select("pista, tier, soglia_da, soglia_a").eq("brand", ctx).eq("month", prev),
            supabase.from("pay_righe").select("pista, nome, tipo_cliente, categoria, prodotto, offerta, brand_vendita, punti, pay_base, pay_tiers, gettone, attivo, note, ordine").eq("brand", ctx).eq("month", prev).limit(1000),
        ]);
        if (!p.data?.length) { notify(`Nessun tabellare ${meta?.label} su ${mesePrec(mese)}`); return; }
        const e1 = await supabase.from("pay_piste").insert(p.data.map(x => ({ ...x, brand: ctx, month: monthISO })));
        const e2 = (s.data?.length ? await supabase.from("pay_soglie").insert(s.data.map(x => ({ ...x, brand: ctx, month: monthISO }))) : { error: null });
        const e3 = (r.data?.length ? await supabase.from("pay_righe").insert(r.data.map(x => ({ ...x, brand: ctx, month: monthISO }))) : { error: null });
        if (dbError("Copia mese", e1.error || e2.error || e3.error)) return;
        notify(`Copiato da ${mesePrec(mese)} ✓ — ora ritocca soglie e importi`, "ok"); load();
    };

    const righeDiPista = (chiave: string) => righe.filter(r => r.pista === chiave && !r.gettone);
    const gettoni = righe.filter(r => r.gettone || !r.pista);

    return (
        <div>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2"><Trophy size={22} /> Tabellari Gare</h2>
                <input type="month" value={mese} onChange={e => setMese(e.target.value)}
                    className="bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-sm text-white" />
            </div>
            <div className="text-[12px] text-slate-400 mb-3">
                Qui vive il pagamento a tabella dei ragazzi: soglie per pista e € per attivazione a ogni soglia.
                Le vendite si agganciano per NOME (tipo cliente · categoria · prodotto · offerta — vince la riga più specifica);
                su Vodafone e Fastweb l&apos;attivazione si alloca alla lettera T1/T2 col <b>codice di inserimento</b>.
            </div>

            {/* contesti */}
            <div className="flex gap-2 flex-wrap mb-5">
                {CONTESTI.map(c => (
                    <button key={c.key} onClick={() => setCtx(c.key)}
                        className="px-4 py-2 rounded-xl text-sm font-semibold border transition"
                        style={ctx === c.key ? { background: c.colore, borderColor: "transparent", color: "#fff" }
                            : { borderColor: "rgba(255,255,255,0.1)", color: "#cbd5e1", background: "rgba(255,255,255,0.04)" }}>
                        <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: ctx === c.key ? "#fff" : c.colore }} />
                        {c.label}
                    </button>
                ))}
            </div>

            {carico ? <div className="text-slate-400 text-sm">Carico…</div> : !piste.length ? (
                <div className="glass-panel rounded-2xl p-6 text-center">
                    <div className="text-slate-300 mb-3">Nessun tabellare {meta?.label} su {mese}.</div>
                    <button onClick={copiaMese} className="px-4 py-2 rounded-xl text-sm font-semibold text-white inline-flex items-center gap-2" style={{ background: colore }}>
                        <Copy size={15} /> Copia da {mesePrec(mese)} e ritocca
                    </button>
                </div>
            ) : (
                <div className="space-y-5">
                    {/* SOGLIE per pista */}
                    <div className="glass-panel rounded-2xl p-5" style={{ borderLeft: `4px solid ${colore}` }}>
                        <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-3">Soglie — scrivi solo il &quot;da&quot;: il fino-a si sistema da solo</div>
                        {piste.map(p => {
                            const scala = soglieDi(p.chiave);
                            return (
                                <div key={p.id} className="mb-4 last:mb-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold text-white min-w-[130px]">{p.nome} <span className="text-slate-500 font-normal">({p.um})</span></span>
                                        {scala.map((s, i) => (
                                            <label key={s.tier} className="text-[11px] text-slate-400">S{i + 1} da
                                                <input value={s.soglia_da} onChange={e => setDa(p.chiave, s.tier, e.target.value)} className={inputCls + " ml-1"} />
                                            </label>
                                        ))}
                                        <button onClick={() => addSoglia(p.chiave)} className="text-slate-400 hover:text-white" title="Aggiungi soglia"><Plus size={15} /></button>
                                        <button onClick={() => dropSoglia(p.chiave)} className="text-slate-500 hover:text-red-400" title="Togli l'ultima soglia"><Trash2 size={14} /></button>
                                        {soglieDirty.has(p.chiave) && (
                                            <button onClick={() => salvaSoglie(p.chiave)} className="text-emerald-300 text-xs font-semibold flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-500/40"><Save size={13} /> Salva soglie</button>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-slate-500 mt-1 ml-[130px]">
                                        {scala.map((s, i) => `S${i + 1}: ${s.soglia_da}${i < scala.length - 1 ? `–${scala[i + 1].soglia_da - 1}` : "+"}`).join(" · ")}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* RIGHE per pista */}
                    {piste.map(p => {
                        const rr = righeDiPista(p.chiave);
                        const nTiers = soglieDi(p.chiave).length;
                        return (
                            <div key={p.id} className="glass-panel rounded-2xl p-5">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="text-[11px] uppercase tracking-wider text-slate-400">Righe · {p.nome} ({rr.length})</div>
                                    <button onClick={() => setNuovaRigaPer(nuovaRigaPer === p.chiave ? null : p.chiave)} className="text-xs text-slate-300 border border-white/10 rounded-lg px-2 py-1 flex items-center gap-1"><Plus size={13} /> Riga</button>
                                </div>
                                {nuovaRigaPer === p.chiave && <NuovaRiga ctx={ctx} monthISO={monthISO} pista={p.chiave} nTiers={nTiers} dopo={() => { setNuovaRigaPer(null); load(); }} />}
                                {rr.map(r => <RigaEd key={r.id} r={r} nTiers={nTiers} isDirty={dirty(r)} onUp={upRiga} onSalva={salvaRiga} onElimina={eliminaRiga} />)}
                                {!rr.length && <div className="text-slate-500 text-sm">Nessuna riga su questa pista.</div>}
                            </div>
                        );
                    })}

                    {/* GETTONI */}
                    <div className="glass-panel rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-[11px] uppercase tracking-wider text-slate-400">💰 Gettoni — pagano sempre, senza soglia ({gettoni.length})</div>
                            <button onClick={() => setNuovaRigaPer(nuovaRigaPer === "__gettoni" ? null : "__gettoni")} className="text-xs text-slate-300 border border-white/10 rounded-lg px-2 py-1 flex items-center gap-1"><Plus size={13} /> Gettone</button>
                        </div>
                        {nuovaRigaPer === "__gettoni" && <NuovaRiga ctx={ctx} monthISO={monthISO} pista={null} nTiers={0} dopo={() => { setNuovaRigaPer(null); load(); }} />}
                        {gettoni.map(r => <RigaEd key={r.id} r={r} nTiers={0} isDirty={dirty(r)} onUp={upRiga} onSalva={salvaRiga} onElimina={eliminaRiga} />)}
                        {!gettoni.length && <div className="text-slate-500 text-sm">Nessun gettone.</div>}
                    </div>
                </div>
            )}
        </div>
    );
}

// Riga editabile — TOP-LEVEL, mai annidata nel componente pagina (lezione
// CardVoce 10/08: il rimontaggio a ogni tasto fa perdere il focus agli input).
function RigaEd({ r, nTiers, isDirty, onUp, onSalva, onElimina }: {
    r: Riga; nTiers: number; isDirty: boolean;
    onUp: (id: string, patch: Partial<Riga>) => void;
    onSalva: (r: Riga) => void; onElimina: (r: Riga) => void;
}) {
    const anchor = [r.tipo_cliente, r.categoria, r.prodotto, r.offerta].filter(Boolean).join(" · ") || "qualsiasi vendita";
    return (
        <div className="border-b border-white/5 py-2">
            <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => onUp(r.id, { attivo: !r.attivo })} title={r.attivo ? "Attiva — click per spegnere" : "Spenta"}
                    className={`text-xs px-2 py-0.5 rounded-full border ${r.attivo ? "border-emerald-500/40 text-emerald-300" : "border-white/10 text-slate-500"}`}>
                    {r.attivo ? "attiva" : "spenta"}
                </button>
                <input value={r.nome} onChange={e => onUp(r.id, { nome: e.target.value })}
                    className="bg-transparent border-b border-white/10 text-sm text-white font-semibold flex-1 min-w-[160px] focus:outline-none focus:border-indigo-400" />
                {r.brand_vendita && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400">{r.brand_vendita}</span>}
                {isDirty && <button onClick={() => onSalva(r)} className="text-emerald-300 text-xs font-semibold flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-500/40"><Save size={13} /> Salva</button>}
                <button onClick={() => onElimina(r)} className="text-slate-500 hover:text-red-400" title="Elimina riga"><Trash2 size={15} /></button>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">{anchor}{r.note ? ` — ${r.note}` : ""}</div>
            <div className="flex items-center gap-3 flex-wrap mt-1.5">
                {!r.gettone && <label className="text-[11px] text-slate-400">punti <input value={r.punti} onChange={e => onUp(r.id, { punti: num(e.target.value) })} className={inputCls + " w-14"} /></label>}
                <label className="text-[11px] text-slate-400">{r.gettone ? "gettone €" : "base €"} <input value={r.pay_base ?? ""} onChange={e => onUp(r.id, { pay_base: e.target.value === "" ? null : num(e.target.value) })} className={inputCls} /></label>
                {!r.gettone && Array.from({ length: nTiers }, (_, i) => (
                    <label key={i} className="text-[11px] text-slate-400">S{i + 1} €
                        <input value={r.pay_tiers[i] ?? ""} onChange={e => {
                            const t = [...r.pay_tiers]; t[i] = num(e.target.value); onUp(r.id, { pay_tiers: t });
                        }} className={inputCls} />
                    </label>
                ))}
            </div>
        </div>
    );
}

// Form nuova riga: aggancio per NOME al catalogo (campo vuoto = jolly)
function NuovaRiga({ ctx, monthISO, pista, nTiers, dopo }: {
    ctx: string; monthISO: string; pista: string | null; nTiers: number; dopo: () => void;
}) {
    const [nome, setNome] = useState("");
    const [tc, setTc] = useState<string | null>(null);
    const [cat, setCat] = useState(""); const [prod, setProd] = useState(""); const [off, setOff] = useState("");
    const [bv, setBv] = useState(ctx === "vodafone_vnd" ? "vodafone" : BRAND_VENDITA.includes(ctx) ? ctx : "vodafone");
    const [punti, setPunti] = useState("1"); const [base, setBase] = useState("");
    const [tiers, setTiers] = useState<string[]>(Array.from({ length: nTiers }, () => ""));
    const inputCls = "bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1 text-sm text-white";
    const salva = async () => {
        if (!nome.trim()) { notify("Dai un nome alla riga"); return; }
        const { error } = await supabase.from("pay_righe").insert({
            brand: ctx, month: monthISO, pista, nome: nome.trim(),
            tipo_cliente: tc, categoria: cat.trim() || null, prodotto: prod.trim() || null, offerta: off.trim() || null,
            brand_vendita: bv, punti: pista ? Number(punti.replace(",", ".")) || 0 : 0,
            pay_base: base === "" ? null : Number(base.replace(",", ".")) || 0,
            pay_tiers: pista ? tiers.map(t => Number(t.replace(",", ".")) || 0) : [],
            gettone: !pista, attivo: true, ordine: 999,
        });
        if (dbError("Nuova riga", error)) return;
        notify("Riga aggiunta ✓", "ok"); dopo();
    };
    return (
        <div className="border border-dashed border-white/15 rounded-xl p-3 mb-3 space-y-2">
            <div className="flex gap-2 flex-wrap items-center">
                <input placeholder="Nome riga (etichetta)" value={nome} onChange={e => setNome(e.target.value)} className={inputCls + " flex-1 min-w-[180px]"} />
                {[null, "Consumer", "Business"].map(t => (
                    <button key={String(t)} onClick={() => setTc(t)} className={`text-xs px-2 py-1 rounded-lg border ${tc === t ? "border-indigo-400 text-white bg-indigo-500/30" : "border-white/10 text-slate-400"}`}>
                        {t || "Tutti"}
                    </button>
                ))}
            </div>
            <div className="flex gap-2 flex-wrap">
                <input placeholder="Categoria (nome esatto, vuoto = tutte)" value={cat} onChange={e => setCat(e.target.value)} className={inputCls + " flex-1 min-w-[150px]"} />
                <input placeholder="Prodotto (vuoto = tutti)" value={prod} onChange={e => setProd(e.target.value)} className={inputCls + " flex-1 min-w-[150px]"} />
                <input placeholder="Offerta (vuoto = tutte)" value={off} onChange={e => setOff(e.target.value)} className={inputCls + " flex-1 min-w-[150px]"} />
            </div>
            <div className="flex gap-2 flex-wrap items-center">
                <span className="text-[11px] text-slate-400">brand della vendita</span>
                {BRAND_VENDITA.slice(0, 6).map(b => (
                    <button key={b} onClick={() => setBv(b)} className={`text-xs px-2 py-1 rounded-lg border ${bv === b ? "border-indigo-400 text-white bg-indigo-500/30" : "border-white/10 text-slate-400"}`}>{b}</button>
                ))}
                {pista && <label className="text-[11px] text-slate-400">punti <input value={punti} onChange={e => setPunti(e.target.value)} className={inputCls + " w-14 text-right"} /></label>}
                <label className="text-[11px] text-slate-400">{pista ? "base €" : "gettone €"} <input value={base} onChange={e => setBase(e.target.value)} className={inputCls + " w-20 text-right"} /></label>
                {pista && tiers.map((t, i) => (
                    <label key={i} className="text-[11px] text-slate-400">S{i + 1} € <input value={t} onChange={e => setTiers(p => p.map((x, j) => j === i ? e.target.value : x))} className={inputCls + " w-20 text-right"} /></label>
                ))}
                <button onClick={salva} className="text-emerald-300 text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-500/40"><Save size={13} /> Aggiungi</button>
            </div>
        </div>
    );
}
