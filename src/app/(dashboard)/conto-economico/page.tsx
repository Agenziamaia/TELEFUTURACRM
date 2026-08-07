"use client";

/**
 * CONTO ECONOMICO PER PUNTO VENDITA (cantiere 07/08) — replica del foglio
 * 'Costi & Ricavi' dell'Excel mensile, coi numeri VIVI del CRM:
 *  - 12 colonne = radici negozio (gemelli sommati) + Rete;
 *  - Ricavi: Marginalità dagli incassi EXT (bundle × coefficiente) + righe
 *    brand (pezzi subito, € col listino compensi — fase 4);
 *  - Costi: 16 voci editabili dalla direzione + TELEFONICO RIPARTITO IN
 *    AUTOMATICO pro-quota sugli appuntamenti del reparto;
 *  - Utile = Ricavi − Costi, con proiezione lineare a metà mese.
 * Il motore è condiviso (src/lib/contoEconomico.ts) con /api/ce/dataset e il
 * futuro deck builder delle riunioni.
 *
 * Note di robustezza (verifica avversaria pre-deploy):
 *  - il cambio mese CHIUDE la modalità Modifica (la bozza del mese vecchio non
 *    deve mai salvarsi sul nuovo);
 *  - "Copia mese precedente" rigenera la bozza dal dataset fresco;
 *  - una cella è "cambiata" solo se il testo differisce dal valore formattato
 *    originale (niente ri-salvataggi da arrotondamento);
 *  - sfondi via var(--tf-*): sul tema chiaro diventano bianchi (mai hex fissi).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useRolePermissions } from "@/lib/usePermissions";
import { capAllowed, CE_SECTION, CAP_CE_GESTISCE } from "@/lib/capabilities";
import { computeContoEconomico, CE_VOCI_STRUTTURA, type CeDataset, type CeNegozio, type CeVoceStruttura } from "@/lib/contoEconomico";
import { Loader2, Pencil, ChevronLeft, ChevronRight, X, Copy } from "lucide-react";

const BG = "var(--tf-0d1424)";     // fondo tabella e celle sticky (bianco sul tema chiaro)
const BG2 = "var(--tf-0e1526)";    // fondo overlay/dettaglio

const ETICHETTE_STRUTTURA: Record<CeVoceStruttura, string> = {
    affitto: "Affitto", luce: "Luce", utenze: "Utenze", materiali: "Materiali Consumo",
    assicurazione: "Assicurazione", allarme: "Allarme", sicurezza: "Sicurezza",
    immondizia: "Immondizia", commercialista: "Commercialista", consulente: "Consulente", insegna: "Insegna",
};
const RIGHE_BRAND: { key: keyof CeNegozio["ricavi"] & keyof CeNegozio["pezzi"]; label: string }[] = [
    { key: "wind3", label: "Wind3" }, { key: "vodafone", label: "Vodafone" }, { key: "sky", label: "Sky" },
    { key: "fastweb", label: "Fastweb" }, { key: "iliad", label: "Iliad" }, { key: "energia", label: "Energia" },
    { key: "altri", label: "Altri brand" },
];

const meseCorrente = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const spostaMese = (m: string, delta: number) => {
    const [y, mm] = m.split("-").map(Number);
    const d = new Date(y, mm - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const labelMese = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    const s = new Date(y, mm - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
};
const fmt = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseImporto = (s: string): number => { const n = Number(String(s).trim().replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
// per gli input: numero "semplice" con la virgola, senza separatore migliaia
const toInput = (n: number) => (Math.round(n * 100) / 100).toString().replace(".", ",");

function CellaNum({ v, forte, colore }: { v: number; forte?: boolean; colore?: boolean }) {
    const cls = colore ? (v < 0 ? "text-red-400" : "text-emerald-400") : v < 0 ? "text-red-400" : "text-slate-200";
    return <td className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${forte ? "font-bold " : ""}${cls}`}>{fmt(v)}</td>;
}

function RigaSezione({ label, cls, negozi }: { label: string; cls: string; negozi: CeNegozio[] }) {
    return (
        <tr className={cls + " text-xs uppercase tracking-wide"}>
            <td className="px-3 py-1 font-bold sticky left-0 z-10" style={{ background: BG }}>{label}</td>
            <td colSpan={negozi.length + 1} />
        </tr>
    );
}

export default function ContoEconomicoPage() {
    const { user } = useAuth();
    const { perms } = useRolePermissions(user?.role, user?.grade);
    const gestisce = capAllowed(user?.role, CE_SECTION, CAP_CE_GESTISCE, perms);

    const [mese, setMese] = useState(meseCorrente());
    const [ds, setDs] = useState<CeDataset | null>(null);
    const [loading, setLoading] = useState(true);
    const [errore, setErrore] = useState<string | null>(null);
    const [edit, setEdit] = useState(false);
    const [bozzaCosti, setBozzaCosti] = useState<Record<string, string>>({});
    const [bozzaApp, setBozzaApp] = useState<Record<string, string>>({});
    const [bozzaReparto, setBozzaReparto] = useState("");
    const [salvo, setSalvo] = useState(false);
    const [drill, setDrill] = useState<string | null>(null);

    const carica = useCallback(async (): Promise<CeDataset | null> => {
        setLoading(true); setErrore(null);
        try {
            const d = await computeContoEconomico(mese, { dettagli: true });
            setDs(d); setLoading(false); return d;
        } catch (e) {
            setErrore(e instanceof Error ? e.message : "Errore di calcolo");
            setLoading(false); return null;
        }
    }, [mese]);
    useEffect(() => { carica(); }, [carica]);
    // cambio mese = FUORI dalla modifica: la bozza del mese vecchio non deve
    // mai finire sul mese nuovo (verifica avversaria pre-deploy)
    useEffect(() => { setEdit(false); setDrill(null); }, [mese]);

    const negozi = ds?.negozi || [];
    const rete = useMemo(() => {
        const somma = (sel: (n: CeNegozio) => number) => negozi.reduce((s, n) => s + sel(n), 0);
        return { somma };
    }, [negozi]);

    const snapshotBozze = useCallback((d: CeDataset) => {
        const c: Record<string, string> = {}; const a: Record<string, string> = {};
        d.negozi.forEach(n => {
            CE_VOCI_STRUTTURA.forEach(v => { c[`${n.nome}|${v}`] = toInput(n.costi.struttura[v]); });
            c[`${n.nome}|collaboratori`] = toInput(n.costi.collaboratori);
            c[`${n.nome}|condivisi`] = toInput(n.costi.condivisi);
            c[`${n.nome}|formazione`] = toInput(n.costi.formazione);
            c[`${n.nome}|partnership_w3`] = toInput(n.costi.partnership_w3);
            c[`${n.nome}|malus_partnership`] = toInput(n.costi.malus_partnership);
            a[n.nome] = String(n.appuntamenti_telefonico);
        });
        setBozzaCosti(c); setBozzaApp(a);
        setBozzaReparto(toInput(d.meta.costo_reparto_telefonico));
    }, []);

    const entraEdit = () => { if (ds) { snapshotBozze(ds); setEdit(true); } };

    const salva = async () => {
        if (!ds) return;
        setSalvo(true);
        const primo = `${mese}-01`;
        try {
            const upserts: { month: string; store_root: string; voce: string; importo: number; updated_by: string | null }[] = [];
            ds.negozi.forEach(n => {
                const orig: Record<string, number> = {
                    collaboratori: n.costi.collaboratori, condivisi: n.costi.condivisi, formazione: n.costi.formazione,
                    partnership_w3: n.costi.partnership_w3, malus_partnership: n.costi.malus_partnership,
                };
                CE_VOCI_STRUTTURA.forEach(v => { orig[v] = n.costi.struttura[v]; });
                Object.entries(orig).forEach(([voce, valOrig]) => {
                    const raw = bozzaCosti[`${n.nome}|${voce}`];
                    // "cambiata" = il testo differisce dal formato dell'originale
                    // (mai ri-salvataggi da solo arrotondamento)
                    if (raw === undefined || raw === toInput(valOrig)) return;
                    upserts.push({ month: primo, store_root: n.nome, voce, importo: parseImporto(raw), updated_by: user?.name || null });
                });
            });
            if (upserts.length) {
                const { error } = await supabase.from("ce_costi_mensili").upsert(upserts, { onConflict: "month,store_root,voce" });
                if (error) throw new Error(error.message);
            }
            const appUp = ds.negozi
                .filter(n => bozzaApp[n.nome] !== undefined && bozzaApp[n.nome] !== String(n.appuntamenti_telefonico))
                .map(n => ({ month: primo, store_root: n.nome, appuntamenti: Math.max(0, parseInt(bozzaApp[n.nome]) || 0), fonte: "manuale" }));
            if (appUp.length) {
                const { error } = await supabase.from("ce_telefonico_appuntamenti").upsert(appUp, { onConflict: "month,store_root" });
                if (error) throw new Error(error.message);
            }
            if (bozzaReparto !== toInput(ds.meta.costo_reparto_telefonico)) {
                const nuovoReparto = parseImporto(bozzaReparto);
                // override del MESE (niente upsert: l'unicità è su indici parziali)
                const { data: ex, error: e1 } = await supabase.from("ce_parametri").select("chiave").eq("chiave", "telefonico_costo_reparto").eq("month", primo);
                if (e1) throw new Error(e1.message);
                if (ex && ex.length) {
                    const { error } = await supabase.from("ce_parametri").update({ valore_num: nuovoReparto, updated_at: new Date().toISOString() }).eq("chiave", "telefonico_costo_reparto").eq("month", primo);
                    if (error) throw new Error(error.message);
                } else {
                    const { error } = await supabase.from("ce_parametri").insert({ chiave: "telefonico_costo_reparto", month: primo, valore_num: nuovoReparto });
                    if (error) throw new Error(error.message);
                }
            }
            setEdit(false);
            await carica();
        } catch (e) { setErrore(e instanceof Error ? e.message : "Errore di salvataggio"); }
        setSalvo(false);
    };

    const copiaMesePrec = async () => {
        const prec = spostaMese(mese, -1);
        try {
            const { data, error } = await supabase.from("ce_costi_mensili").select("store_root, voce, importo").eq("month", `${prec}-01`);
            if (error) throw new Error(error.message);
            if (!data?.length) { setErrore(`Nessuna voce di costo su ${labelMese(prec)} da copiare.`); return; }
            const { data: mieRighe, error: e2 } = await supabase.from("ce_costi_mensili").select("store_root, voce").eq("month", `${mese}-01`);
            if (e2) throw new Error(e2.message);
            const gia = new Set((mieRighe || []).map(r => `${r.store_root}|${r.voce}`));
            const nuove = data.filter(r => !gia.has(`${r.store_root}|${r.voce}`))
                .map(r => ({ month: `${mese}-01`, store_root: r.store_root, voce: r.voce, importo: r.importo, updated_by: `copia da ${prec}` }));
            if (nuove.length) {
                const { error: e3 } = await supabase.from("ce_costi_mensili").insert(nuove);
                if (e3) throw new Error(e3.message);
            }
            // NB: gli appuntamenti NON si copiano (sono il dato del mese, riparte da vuoto)
            const fresco = await carica();
            if (fresco) snapshotBozze(fresco);   // la bozza segue i valori copiati
        } catch (e) { setErrore(e instanceof Error ? e.message : "Errore nella copia"); }
    };

    const inputCella = (root: string, voce: string) => (
        <td key={`${root}|${voce}`} className="px-1 py-0.5">
            <input value={bozzaCosti[`${root}|${voce}`] ?? ""} onChange={e => setBozzaCosti(b => ({ ...b, [`${root}|${voce}`]: e.target.value }))}
                className="w-24 rounded bg-white/10 border border-white/15 px-2 py-1 text-right text-sm text-white focus:border-indigo-400 outline-none" />
        </td>
    );

    const drillNegozio = drill ? negozi.find(n => n.nome === drill) : null;
    const unitTel = ds && ds.totali.appuntamenti > 0 ? ds.meta.costo_reparto_telefonico / ds.totali.appuntamenti : 0;
    const fattore = ds?.meta.prospect_fattore || 1;

    return (
        <div className="p-4 md:p-6 text-white">
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <h2 className="text-3xl font-bold text-white">💼 Conto Economico</h2>
                <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300">dati live</span>
                <div className="flex items-center gap-1 ml-auto">
                    <button onClick={() => setMese(m => spostaMese(m, -1))} className="p-1.5 rounded hover:bg-white/10"><ChevronLeft size={18} /></button>
                    <span className="min-w-[150px] text-center font-semibold">{labelMese(mese)}</span>
                    <button onClick={() => setMese(m => spostaMese(m, 1))} className="p-1.5 rounded hover:bg-white/10"><ChevronRight size={18} /></button>
                </div>
                {gestisce && !edit && !loading && (
                    <button onClick={entraEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white">
                        <Pencil size={14} /> Modifica costi
                    </button>
                )}
                {gestisce && edit && (
                    <div className="flex items-center gap-2">
                        <button onClick={copiaMesePrec} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm">
                            <Copy size={14} /> Copia mese precedente
                        </button>
                        <button onClick={() => setEdit(false)} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm">Annulla</button>
                        <button onClick={salva} disabled={salvo} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white disabled:opacity-50">
                            {salvo ? "Salvo…" : "💾 Salva"}
                        </button>
                    </div>
                )}
            </div>

            {errore && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/15 border border-red-400/30 text-red-300 text-sm">{errore}</div>}
            {ds && ds.warnings.length > 0 && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-400/25 text-amber-200/90 text-xs space-y-0.5">
                    {ds.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-slate-400 py-16 justify-center"><Loader2 className="animate-spin" size={18} /> Calcolo il conto economico…</div>
            ) : ds && (
                <>
                    <div className="rounded-xl border border-white/10 overflow-x-auto" style={{ background: BG }}>
                        <table className="w-full text-sm" style={{ minWidth: 1080 }}>
                            <thead>
                                <tr className="border-b border-white/10 text-slate-400">
                                    <th className="px-3 py-2 text-left sticky left-0 z-10" style={{ background: BG }}>Voce</th>
                                    {negozi.map(n => <th key={n.nome} className="px-2 py-2 text-right whitespace-nowrap">{n.nome}</th>)}
                                    <th className="px-2 py-2 text-right text-slate-200">Rete</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* ───────── RICAVI ───────── */}
                                <RigaSezione label="Ricavi" cls="bg-indigo-500/10 text-indigo-300" negozi={negozi} />
                                <tr className="border-b border-white/5">
                                    <td className="px-3 py-1.5 sticky left-0 z-10" style={{ background: BG }}>Marginalità (incassi)</td>
                                    {negozi.map(n => (
                                        <td key={n.nome} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-slate-200 cursor-pointer hover:text-indigo-300"
                                            title={`margine ricalcolato: € ${fmt(n.marginalita_margine)} — clic per il dettaglio`}
                                            onClick={() => setDrill(n.nome)}>{fmt(n.ricavi.marginalita)}</td>
                                    ))}
                                    <CellaNum v={rete.somma(n => n.ricavi.marginalita)} forte />
                                </tr>
                                <tr className="border-b border-white/5 text-xs text-slate-500">
                                    <td className="px-3 py-1 sticky left-0 z-10" style={{ background: BG }}>· di cui margine ricalcolato</td>
                                    {negozi.map(n => <td key={n.nome} className="px-2 py-1 text-right tabular-nums">{fmt(n.marginalita_margine)}</td>)}
                                    <td className="px-2 py-1 text-right tabular-nums">{fmt(rete.somma(n => n.marginalita_margine))}</td>
                                </tr>
                                {RIGHE_BRAND.map(r => {
                                    const pezziTot = rete.somma(n => n.pezzi[r.key as keyof CeNegozio["pezzi"]]);
                                    if (r.key === "altri" && pezziTot === 0 && rete.somma(n => n.ricavi.altri) === 0) return null;
                                    return (
                                        <tr key={r.key} className="border-b border-white/5">
                                            <td className="px-3 py-1.5 sticky left-0 z-10" style={{ background: BG }}>{r.label}</td>
                                            {negozi.map(n => {
                                                const pz = n.pezzi[r.key as keyof CeNegozio["pezzi"]];
                                                return (
                                                    <td key={n.nome} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-slate-300">
                                                        {fmt(n.ricavi[r.key as keyof CeNegozio["ricavi"]] as number)}
                                                        {pz > 0 && <span className="text-[10px] text-slate-500 ml-1">·{pz} pz</span>}
                                                    </td>
                                                );
                                            })}
                                            <CellaNum v={rete.somma(n => n.ricavi[r.key as keyof CeNegozio["ricavi"]] as number)} />
                                        </tr>
                                    );
                                })}
                                <tr className="border-b border-white/10 font-bold bg-white/[0.03]">
                                    <td className="px-3 py-1.5 sticky left-0 z-10" style={{ background: BG }}>Totale Ricavi</td>
                                    {negozi.map(n => <CellaNum key={n.nome} v={n.ricavi.actual_tot} forte />)}
                                    <CellaNum v={rete.somma(n => n.ricavi.actual_tot)} forte />
                                </tr>

                                {/* ───────── COSTI ───────── */}
                                <RigaSezione label="Costi" cls="bg-rose-500/10 text-rose-300" negozi={negozi} />
                                {CE_VOCI_STRUTTURA.map(v => (
                                    <tr key={v} className="border-b border-white/5">
                                        <td className="px-3 py-1.5 text-slate-300 sticky left-0 z-10" style={{ background: BG }}>{ETICHETTE_STRUTTURA[v]}</td>
                                        {negozi.map(n => edit ? inputCella(n.nome, v) : <CellaNum key={n.nome} v={n.costi.struttura[v]} />)}
                                        <CellaNum v={rete.somma(n => n.costi.struttura[v])} />
                                    </tr>
                                ))}
                                <tr className="border-b border-white/10 font-semibold text-slate-200 bg-white/[0.02]">
                                    <td className="px-3 py-1.5 sticky left-0 z-10" style={{ background: BG }}>Parz. Struttura</td>
                                    {negozi.map(n => <CellaNum key={n.nome} v={n.costi.struttura.parz_struttura} />)}
                                    <CellaNum v={rete.somma(n => n.costi.struttura.parz_struttura)} />
                                </tr>
                                {(["collaboratori", "condivisi", "formazione"] as const).map(v => (
                                    <tr key={v} className="border-b border-white/5">
                                        <td className="px-3 py-1.5 text-slate-300 sticky left-0 z-10" style={{ background: BG }}>
                                            {v === "collaboratori" ? "Parz. Collaboratori" : v === "condivisi" ? "Costi Condivisi" : "Formazione"}
                                        </td>
                                        {negozi.map(n => edit ? inputCella(n.nome, v) : <CellaNum key={n.nome} v={n.costi[v]} />)}
                                        <CellaNum v={rete.somma(n => n.costi[v])} />
                                    </tr>
                                ))}
                                <tr className="border-b border-white/5">
                                    <td className="px-3 py-1.5 text-slate-300 sticky left-0 z-10" style={{ background: BG }}
                                        title="Riparto automatico del costo del reparto telefonico pro-quota sugli appuntamenti">
                                        Telefonico <span className="text-[10px] text-indigo-300/80">(riparto automatico)</span>
                                    </td>
                                    {negozi.map(n => (
                                        <td key={n.nome} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-slate-200"
                                            title={`${n.appuntamenti_telefonico} appuntamenti × € ${fmt(unitTel)}`}>{fmt(n.costi.telefonico)}</td>
                                    ))}
                                    <CellaNum v={rete.somma(n => n.costi.telefonico)} />
                                </tr>
                                {(["partnership_w3", "malus_partnership"] as const).map(v => (
                                    <tr key={v} className="border-b border-white/5">
                                        <td className="px-3 py-1.5 text-slate-300 sticky left-0 z-10" style={{ background: BG }}>
                                            {v === "partnership_w3" ? "PartnerShip W3" : "Malus PartnerShip"}
                                        </td>
                                        {negozi.map(n => edit ? inputCella(n.nome, v) : <CellaNum key={n.nome} v={n.costi[v]} />)}
                                        <CellaNum v={rete.somma(n => n.costi[v])} />
                                    </tr>
                                ))}
                                <tr className="border-b border-white/10 font-bold bg-white/[0.03]">
                                    <td className="px-3 py-1.5 sticky left-0 z-10" style={{ background: BG }}>Totale Costi</td>
                                    {negozi.map(n => <CellaNum key={n.nome} v={n.costi.totale} forte />)}
                                    <CellaNum v={rete.somma(n => n.costi.totale)} forte />
                                </tr>

                                {/* ───────── UTILE ───────── */}
                                <RigaSezione label="Utile" cls="bg-emerald-500/10 text-emerald-300" negozi={negozi} />
                                <tr className="border-b border-white/5 font-bold">
                                    <td className="px-3 py-2 sticky left-0 z-10" style={{ background: BG }}>Utile Actual</td>
                                    {negozi.map(n => <CellaNum key={n.nome} v={n.utile_actual} forte colore />)}
                                    <CellaNum v={rete.somma(n => n.utile_actual)} forte colore />
                                </tr>
                                {fattore > 1.001 && (
                                    <tr className="border-b border-white/5 text-slate-400">
                                        <td className="px-3 py-1.5 sticky left-0 z-10" style={{ background: BG }}
                                            title={`Proiezione lineare sui giorni lavorati (lun-sab): fattore ${fattore.toFixed(3)}`}>Utile proiezione</td>
                                        {negozi.map(n => <CellaNum key={n.nome} v={n.prospect.utile} colore />)}
                                        <CellaNum v={rete.somma(n => n.prospect.utile)} colore />
                                    </tr>
                                )}
                                <tr className="text-xs text-slate-500">
                                    <td className="px-3 py-1.5 sticky left-0 z-10" style={{ background: BG }}>Appuntamenti telefonico</td>
                                    {negozi.map(n => edit ? (
                                        <td key={n.nome} className="px-1 py-0.5">
                                            <input value={bozzaApp[n.nome] ?? ""} onChange={e => setBozzaApp(b => ({ ...b, [n.nome]: e.target.value }))}
                                                className="w-16 rounded bg-white/10 border border-white/15 px-2 py-1 text-right text-xs text-white focus:border-indigo-400 outline-none" />
                                        </td>
                                    ) : <td key={n.nome} className="px-2 py-1 text-right tabular-nums">{n.appuntamenti_telefonico}</td>)}
                                    <td className="px-2 py-1 text-right tabular-nums">{ds.totali.appuntamenti}</td>
                                </tr>
                                {edit && (
                                    <tr className="text-xs text-slate-400">
                                        <td className="px-3 py-1.5 sticky left-0 z-10" style={{ background: BG }}>Costo reparto telefonico (mese)</td>
                                        <td className="px-1 py-0.5" colSpan={negozi.length + 1}>
                                            <input value={bozzaReparto} onChange={e => setBozzaReparto(e.target.value)}
                                                className="w-28 rounded bg-white/10 border border-white/15 px-2 py-1 text-right text-xs text-white focus:border-indigo-400 outline-none" />
                                            <span className="ml-2">€ / mese, ripartito sugli appuntamenti (default 11.400)</span>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {ds.fuori_mappa.length > 0 && (
                        <div className="mt-4 rounded-xl border border-white/10 p-3 text-xs text-slate-400" style={{ background: BG }}>
                            <div className="font-semibold text-slate-300 mb-1">Centri fuori dalle colonne (mai sommati ai negozi)</div>
                            {ds.fuori_mappa.map(f => (
                                <div key={f.negozio}>{f.negozio}: {f.pratiche} pratiche · marginalità € {fmt(f.marginalita)}</div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* drill-down marginalità (fondo SOLIDO via variabile tema: mai vetro sugli overlay) */}
            {drillNegozio && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setDrill(null)}>
                    <div className="rounded-xl border border-white/15 w-full max-w-3xl max-h-[80vh] overflow-auto" style={{ background: BG2 }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 sticky top-0" style={{ background: BG2 }}>
                            <div className="font-bold">💰 Marginalità — {drillNegozio.nome} · {labelMese(mese)}</div>
                            <button onClick={() => setDrill(null)} className="p-1 rounded hover:bg-white/10"><X size={16} /></button>
                        </div>
                        <table className="w-full text-xs">
                            <thead><tr className="text-slate-400 border-b border-white/10">
                                <th className="px-3 py-1.5 text-left">Data</th><th className="px-2 py-1.5 text-left">Voce</th>
                                <th className="px-2 py-1.5 text-left">Negozio</th><th className="px-2 py-1.5 text-left">Venditore</th>
                                <th className="px-2 py-1.5 text-right">Qtà</th><th className="px-2 py-1.5 text-right">Incasso</th>
                                <th className="px-3 py-1.5 text-right">Margine</th>
                            </tr></thead>
                            <tbody>
                                {(drillNegozio.voci_marg || []).map(v => (
                                    <tr key={v.id} className="border-b border-white/5">
                                        <td className="px-3 py-1 whitespace-nowrap text-slate-400">{v.data}</td>
                                        <td className="px-2 py-1">{v.bundle ? "🎁 " : ""}{v.nome}</td>
                                        <td className="px-2 py-1 text-slate-400">{v.negozio}</td>
                                        <td className="px-2 py-1 text-slate-400">{v.venditore || "—"}</td>
                                        <td className="px-2 py-1 text-right tabular-nums">{v.qty}</td>
                                        <td className="px-2 py-1 text-right tabular-nums">{fmt(v.importo)}</td>
                                        <td className={`px-3 py-1 text-right tabular-nums ${v.margine < 0 ? "text-red-400" : "text-emerald-400"}`}>{fmt(v.margine)}</td>
                                    </tr>
                                ))}
                                <tr className="font-bold">
                                    <td className="px-3 py-1.5" colSpan={5}>Totale</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(drillNegozio.ricavi.marginalita)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(drillNegozio.marginalita_margine)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
