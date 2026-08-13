"use client";

// MAGAZZINO E GIACENZE (task Luca 12/08, riga 9d7fe69a) — modulo di
// consultazione universale stile Gestione Usati: chi lavora in negozio vede
// l'inventario in tempo reale senza poterlo alterare; carico e trasferimenti
// (con DDT) sono dei ruoli di gestione. Tre sezioni:
//   📦 Giacenze  — filtri azienda/negozio/stato/data storica, griglia
//                  ordinabile (codice, descrizione, giacenza, in arrivo,
//                  valore), export Excel
//   🔍 Ricerca   — barra unica IMEI/SIM/seriale → timeline del ciclo di vita
//                  (magazzino + usati + vendite CRM)
//   🚚 Trasferimenti — merce da un negozio all'altro con DDT progressivo:
//                  in transito → accettato dal magazzino che riceve
// Stati unità: disponibile · in_arrivo · in_transito (negozio = destinazione,
// il mittente lo vede spedito nel DDT) · venduto (deflaggato ma ricercabile).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, FileDown, Loader2, PackagePlus, Search, Truck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { isAdminOrAbove } from "@/lib/roles";
import { caricaTutte } from "@/lib/fetchTutte";
import { scaricaXlsx, type CellaXlsx } from "@/lib/exportXlsx";
import { cn } from "@/utils";

type Unita = {
    id: string; seriale: string; tipo_seriale: string; codice: string | null; descrizione: string;
    azienda: string | null; negozio: string; stato: string; valore: number | null;
    caricato_il: string; caricato_da: string | null; venduto_il: string | null; venduto_da: string | null;
    contract_id: string | null; ddt_id: string | null;
    storia: { quando: string; evento: string; negozio?: string; operatore?: string; note?: string }[];
};
type Ddt = {
    id: string; numero: number; da_negozio: string; a_negozio: string; stato: string;
    creato_da: string | null; creato_il: string; accettato_da: string | null; accettato_il: string | null; note: string | null;
};

const STATI_LABEL: Record<string, string> = {
    disponibile: "🟢 Disponibile", in_arrivo: "📦 In arrivo", in_transito: "🚚 In transito",
    spedito: "📤 Spedito", venduto: "⚪ Venduto",
};
const gg = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString("it-IT") : "—";
const gghh = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const eur = (v: number | null | undefined) => v == null ? "—" : v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export default function MagazzinoPage() {
    const { user } = useAuth();
    // consultazione per tutti; trasferimenti per chi gestisce; il CARICO
    // merce solo amministrazione in su (segnalazione Francesco 12/08)
    const gestisce = ["admin", "dev", "direttore_generale", "store_manager"].includes(user?.role || "");
    const puoCaricare = isAdminOrAbove(user?.role);
    const [tab, setTab] = useState<"giacenze" | "ricerca" | "trasferimenti">("giacenze");

    const [negozi, setNegozi] = useState<string[]>([]);
    const [unita, setUnita] = useState<Unita[]>([]);
    const [loading, setLoading] = useState(true);

    const carica = useCallback(async () => {
        setLoading(true);
        const [st, un] = await Promise.all([
            supabase.from("stores").select("name, is_ufficio").order("name"),
            caricaTutte<Unita>((from, to) =>
                supabase.from("mag_unita").select("*").order("caricato_il", { ascending: false }).range(from, to) as never),
        ]);
        setNegozi(((st.data ?? []) as { name: string; is_ufficio?: boolean | null }[]).filter(s => !s.is_ufficio).map(s => s.name));
        setUnita((un.data ?? []) as Unita[]);
        setLoading(false);
    }, []);
    useEffect(() => { carica(); }, [carica]);

    const aziende = useMemo(() => Array.from(new Set(unita.map(u => u.azienda).filter(Boolean))) as string[], [unita]);

    return (
        <div className="p-6 max-w-[1500px]">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Boxes size={26} /> Magazzino</h1>
                <div className="flex gap-2">
                    {([["giacenze", "📦 Giacenze"], ["ricerca", "🔍 Ricerca seriale"], ["trasferimenti", "🚚 Trasferimenti"]] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setTab(k)}
                            className={cn("px-4 py-2 rounded-xl text-sm font-semibold border transition",
                                tab === k ? "bg-indigo-600 text-white border-transparent" : "text-slate-300 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]")}>
                            {l}
                        </button>
                    ))}
                </div>
            </div>
            {loading ? (
                <div className="flex justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : tab === "giacenze" ? (
                <Giacenze unita={unita} negozi={negozi} aziende={aziende} />
            ) : tab === "ricerca" ? (
                <RicercaSeriale unita={unita} />
            ) : (
                <Trasferimenti unita={unita} negozi={negozi} aziende={aziende} gestisce={gestisce} puoCaricare={puoCaricare} utente={user?.name || "—"} ricarica={carica} />
            )}
        </div>
    );
}

/* ── 📦 GIACENZE ─────────────────────────────────────────────────────── */
function Giacenze({ unita, negozi, aziende }: { unita: Unita[]; negozi: string[]; aziende: string[] }) {
    const [negozio, setNegozio] = useState("");
    const [azienda, setAzienda] = useState("");
    const [stato, setStato] = useState("");
    const [dataStorica, setDataStorica] = useState("");
    const [sort, setSort] = useState<{ col: number; desc: boolean }>({ col: 1, desc: false });

    // filtro base + GIACENZA STORICA: a quella data conta ciò che era già
    // caricato e non ancora venduto (fotografia del magazzino nel passato)
    const filtrate = useMemo(() => unita.filter(u => {
        if (negozio && u.negozio !== negozio) return false;
        if (azienda && u.azienda !== azienda) return false;
        if (dataStorica) {
            const fine = dataStorica + "T23:59:59";
            if (u.caricato_il > fine) return false;
            if (u.venduto_il && u.venduto_il <= fine) return false;
            return true;   // alla data era in casa (qualunque sia lo stato di oggi)
        }
        if (stato && u.stato !== stato) return false;
        return true;
    }), [unita, negozio, azienda, stato, dataStorica]);

    // griglia per ARTICOLO: giacenza = disponibili, in arrivo = in_transito/in_arrivo
    type Riga = { codice: string; descrizione: string; giacenza: number; inArrivo: number; valore: number };
    const righe = useMemo(() => {
        const m = new Map<string, Riga>();
        for (const u of filtrate) {
            const k = `${u.codice || ""}|${u.descrizione}`;
            const r = m.get(k) || { codice: u.codice || "—", descrizione: u.descrizione, giacenza: 0, inArrivo: 0, valore: 0 };
            const vivo = dataStorica ? true : u.stato === "disponibile";
            const arrivo = !dataStorica && (u.stato === "in_transito" || u.stato === "in_arrivo");
            if (vivo) { r.giacenza++; r.valore += Number(u.valore || 0); }
            if (arrivo) r.inArrivo++;
            if (vivo || arrivo) m.set(k, r);
        }
        const out = Array.from(m.values());
        const val = (r: Riga, c: number) => c === 0 ? r.codice : c === 1 ? r.descrizione : c === 2 ? r.giacenza : c === 3 ? r.inArrivo : r.valore;
        out.sort((a, b) => {
            const va = val(a, sort.col), vb = val(b, sort.col);
            const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
            return sort.desc ? -cmp : cmp;
        });
        return out;
    }, [filtrate, sort, dataStorica]);

    const esporta = () => {
        const dati: CellaXlsx[][] = righe.map(r => [r.codice, r.descrizione, r.giacenza, r.inArrivo, Math.round(r.valore * 100) / 100]);
        scaricaXlsx(`giacenze_${negozio || "tutti"}_${new Date().toISOString().slice(0, 10)}.xlsx`,
            ["Codice", "Descrizione", "Giacenza", "In arrivo", "Valore €"], dati, "Giacenze");
    };

    const selCls = "glass-input !h-9 text-sm";
    const colonne = ["Codice", "Descrizione", "Giacenza", "In arrivo", "Valore"];
    return (
        <div className="space-y-4">
            <div className="glass-panel rounded-2xl p-4 flex items-end gap-3 flex-wrap">
                <label className="text-xs text-slate-400">Azienda<br />
                    <select value={azienda} onChange={e => setAzienda(e.target.value)} className={selCls}>
                        <option value="">Tutte</option>{aziende.map(a => <option key={a}>{a}</option>)}
                    </select></label>
                <label className="text-xs text-slate-400">Punto vendita<br />
                    <select value={negozio} onChange={e => setNegozio(e.target.value)} className={selCls}>
                        <option value="">Tutti</option>{negozi.map(n => <option key={n}>{n}</option>)}
                    </select></label>
                <label className="text-xs text-slate-400">Disponibilità<br />
                    <select value={stato} onChange={e => setStato(e.target.value)} disabled={!!dataStorica} className={selCls}>
                        <option value="">Tutte</option>{Object.entries(STATI_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select></label>
                <label className="text-xs text-slate-400" title="Fotografia del magazzino a quella data: caricato entro la data e non ancora venduto">Giacenza alla data<br />
                    <input type="date" value={dataStorica} onChange={e => setDataStorica(e.target.value)} className={selCls} /></label>
                {dataStorica && <button onClick={() => setDataStorica("")} className="text-xs text-slate-400 hover:text-white pb-2">✕ oggi</button>}
                <div className="flex-1" />
                <button onClick={esporta} disabled={!righe.length}
                    className="px-3 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40">
                    <FileDown size={14} /> Excel
                </button>
            </div>
            <div className="glass-card overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-white/[0.03] text-xs uppercase text-slate-400">
                        <tr>{colonne.map((cta, i) => (
                            <th key={i} className={cn("px-4 py-3 font-semibold cursor-pointer select-none", i >= 2 && "text-center")}
                                onClick={() => setSort(s => ({ col: i, desc: s.col === i ? !s.desc : false }))}>
                                {cta}{sort.col === i ? (sort.desc ? " ↓" : " ↑") : ""}
                            </th>))}
                        </tr>
                    </thead>
                    <tbody>
                        {righe.map((r, i) => (
                            <tr key={i} className="border-t border-white/5 hover:bg-white/[0.03]">
                                <td className="px-4 py-2 font-mono text-xs text-slate-400">{r.codice}</td>
                                <td className="px-4 py-2 text-white">{r.descrizione}</td>
                                <td className="px-4 py-2 text-center font-bold text-emerald-300">{r.giacenza}</td>
                                <td className="px-4 py-2 text-center text-sky-300">{r.inArrivo || "—"}</td>
                                <td className="px-4 py-2 text-center tabular-nums">{eur(r.valore)}</td>
                            </tr>
                        ))}
                        {!righe.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Nessuna unità a magazzino con questi filtri.{!unita.length && " Il magazzino parte vuoto: il primo carico si fa da 🚚 Trasferimenti → 📥 Carico merce."}</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ── 🔍 RICERCA SERIALE (deep search con timeline) ───────────────────── */
function RicercaSeriale({ unita }: { unita: Unita[] }) {
    const [testo, setTesto] = useState("");
    const [busy, setBusy] = useState(false);
    type Evento = { quando: string; testo: string };
    type Scheda = { titolo: string; sotto: string; stato: string; eventi: Evento[] };
    const [schede, setSchede] = useState<Scheda[] | null>(null);

    const cerca = async () => {
        const s = testo.trim().replace(/[\s./-]/g, "");
        if (s.length < 5) return;
        setBusy(true);
        const out: Scheda[] = [];
        // 1) magazzino
        for (const u of unita.filter(x => x.seriale.replace(/[\s./-]/g, "").includes(s))) {
            const eventi: Evento[] = [
                { quando: u.caricato_il, testo: `📥 Caricato a ${u.negozio}${u.caricato_da ? ` da ${u.caricato_da}` : ""}` },
                ...(u.storia || []).map(e => ({ quando: e.quando, testo: `${e.evento}${e.negozio ? ` · ${e.negozio}` : ""}${e.operatore ? ` · ${e.operatore}` : ""}${e.note ? ` — ${e.note}` : ""}` })),
            ];
            if (u.venduto_il) eventi.push({ quando: u.venduto_il, testo: `💰 Venduto${u.venduto_da ? ` da ${u.venduto_da}` : ""}${u.contract_id ? ` · pratica ${u.contract_id}` : ""}` });
            out.push({ titolo: `${u.descrizione} · ${u.seriale}`, sotto: `Magazzino — ${u.negozio}${u.azienda ? ` · ${u.azienda}` : ""}`, stato: STATI_LABEL[u.stato] || u.stato, eventi });
        }
        // 2) usati (gestione usati)
        const us = await supabase.from("usati").select("id, model, imei, status, store, created_at, sold_date, venditore, status_history").ilike("imei", `%${s}%`).limit(10);
        for (const u of (us.data ?? []) as Record<string, unknown>[]) {
            const sh = (u.status_history || {}) as Record<string, { date?: string; operatore?: string }>;
            const eventi = Object.entries(sh).map(([k, v]) => ({ quando: String(v?.date || u.created_at), testo: `♻️ ${k}${v?.operatore ? ` · ${v.operatore}` : ""}` }));
            out.push({ titolo: `${u.model} · ${u.imei}`, sotto: `Gestione Usati — ${u.store} (n.${u.id})`, stato: `♻️ ${u.status}`, eventi });
        }
        // 3) vendite CRM (IMEI piatti e terminali della vendita)
        const t = `%${s}%`;
        const ct = await supabase.from("contracts")
            .select("id, venditore, negozio, brand, prodotto, data_registrazione, dettagli")
            .or([`dettagli->>IMEI.ilike.${t}`, `dettagli->>imei.ilike.${t}`, `dettagli->>"IMEI TNP".ilike.${t}`, `dettagli->>"IMEI CB".ilike.${t}`, `dettagli->units.cs."[{\\"imei\\":\\"${s}\\"}]"`, `codice_attivazione.ilike.${t}`].join(","))
            .limit(10);
        for (const c of (ct.data ?? []) as Record<string, unknown>[]) {
            out.push({
                titolo: `${c.brand} · ${c.prodotto}`, sotto: `Vendita ${c.id} — ${c.negozio}`,
                stato: "🧾 Registrata",
                eventi: [{ quando: String(c.data_registrazione), testo: `💰 Venduto il ${gg(String(c.data_registrazione))} da ${c.venditore} · ${c.negozio} · pratica ${c.id}` }],
            });
        }
        setSchede(out); setBusy(false);
    };

    return (
        <div className="space-y-4 max-w-3xl">
            <div className="glass-panel rounded-2xl p-4 flex items-center gap-2">
                <Search size={18} className="text-slate-400 shrink-0" />
                <input value={testo} onChange={e => setTesto(e.target.value)} onKeyDown={e => e.key === "Enter" && cerca()}
                    placeholder="Cerca IMEI / SIM / seriale…" className="flex-1 bg-transparent outline-none text-white text-sm py-2" />
                <button onClick={cerca} disabled={busy || testo.trim().length < 5}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-40">
                    {busy ? "Cerco…" : "Cerca"}
                </button>
            </div>
            {schede && !schede.length && <div className="glass-panel rounded-2xl p-6 text-center text-slate-400 text-sm">Nessuna traccia di questo seriale: né a magazzino, né negli usati, né nelle vendite.</div>}
            {schede?.map((sc, i) => (
                <div key={i} className="glass-panel rounded-2xl p-5">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                        <div className="text-sm font-bold text-white">{sc.titolo}</div>
                        <span className="text-xs font-semibold text-slate-300 bg-white/[0.06] border border-white/10 rounded-full px-2.5 py-1">{sc.stato}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mb-3">{sc.sotto}</div>
                    <div className="space-y-1.5">
                        {sc.eventi.sort((a, b) => String(a.quando).localeCompare(String(b.quando))).map((e, j) => (
                            <div key={j} className="flex items-start gap-2 text-[12px] text-slate-300">
                                <span className="text-slate-500 font-mono shrink-0 w-32">{gghh(e.quando)}</span>
                                <span>{e.testo}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ── 🚚 TRASFERIMENTI + 📥 CARICO ─────────────────────────────────────── */
function Trasferimenti({ unita, negozi, aziende, gestisce, puoCaricare, utente, ricarica }: {
    unita: Unita[]; negozi: string[]; aziende: string[]; gestisce: boolean; puoCaricare: boolean; utente: string; ricarica: () => void;
}) {
    const [ddt, setDdt] = useState<Ddt[]>([]);
    const [apriNuovo, setApriNuovo] = useState(false);
    const [apriCarico, setApriCarico] = useState(false);
    const caricaDdt = useCallback(async () => {
        const { data } = await supabase.from("mag_ddt").select("*").order("numero", { ascending: false }).limit(200);
        setDdt((data ?? []) as Ddt[]);
    }, []);
    useEffect(() => { caricaDdt(); }, [caricaDdt]);

    const unitaDiDdt = (id: string) => unita.filter(u => u.ddt_id === id);
    const accetta = async (d: Ddt) => {
        if (!window.confirm(`Accettare il DDT n.${d.numero} (${d.da_negozio} → ${d.a_negozio})? Le unità diventano disponibili a ${d.a_negozio}.`)) return;
        const mie = unitaDiDdt(d.id);
        for (const u of mie) {
            await supabase.from("mag_unita").update({
                stato: "disponibile", ddt_id: null,
                storia: [...(u.storia || []), { quando: new Date().toISOString(), evento: "📤 Spedito e accettato", negozio: d.a_negozio, operatore: utente, note: `DDT n.${d.numero} da ${d.da_negozio}` }],
            }).eq("id", u.id);
        }
        await supabase.from("mag_ddt").update({ stato: "accettato", accettato_da: utente, accettato_il: new Date().toISOString() }).eq("id", d.id);
        caricaDdt(); ricarica();
    };
    const stampa = (d: Ddt) => {
        const mie = unitaDiDdt(d.id);
        const w = window.open("", "_blank"); if (!w) return;
        w.document.write(`<html><head><title>DDT ${d.numero}</title><style>body{font-family:sans-serif;padding:32px;color:#111}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin-top:16px}td,th{border:1px solid #999;padding:6px 10px;font-size:13px;text-align:left}p{font-size:13px}</style></head><body>
<h1>Documento di trasporto n. ${d.numero}/${new Date(d.creato_il).getFullYear()}</h1>
<p><b>Mittente:</b> ${d.da_negozio} &nbsp;&nbsp; <b>Destinatario:</b> ${d.a_negozio}<br/><b>Data:</b> ${gghh(d.creato_il)} &nbsp;&nbsp; <b>Causale:</b> trasferimento tra punti vendita${d.note ? `<br/><b>Note:</b> ${d.note}` : ""}</p>
<table><tr><th>#</th><th>Codice</th><th>Descrizione</th><th>Seriale</th></tr>
${mie.map((u, i) => `<tr><td>${i + 1}</td><td>${u.codice || ""}</td><td>${u.descrizione}</td><td>${u.seriale}</td></tr>`).join("")}
</table><p style="margin-top:40px">Firma mittente ______________________ &nbsp;&nbsp;&nbsp; Firma destinatario ______________________</p>
<script>window.print()</script></body></html>`);
        w.document.close();
    };

    return (
        <div className="space-y-4">
            {gestisce && (
                <div className="flex gap-2">
                    <button onClick={() => { setApriNuovo(v => !v); setApriCarico(false); }} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold inline-flex items-center gap-2"><Truck size={15} /> Nuovo trasferimento</button>
                    {puoCaricare && <button onClick={() => { setApriCarico(v => !v); setApriNuovo(false); }} className="px-4 py-2 rounded-xl border border-white/15 text-slate-200 text-sm font-semibold inline-flex items-center gap-2"><PackagePlus size={15} /> Carico merce</button>}
                </div>
            )}
            {apriCarico && <Carico negozi={negozi} aziende={aziende} utente={utente} dopo={() => { setApriCarico(false); ricarica(); }} />}
            {apriNuovo && <NuovoTrasferimento unita={unita} negozi={negozi} utente={utente} dopo={() => { setApriNuovo(false); caricaDdt(); ricarica(); }} />}
            <div className="glass-card overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-white/[0.03] text-xs uppercase text-slate-400">
                        <tr><th className="px-4 py-3">DDT</th><th className="px-4 py-3">Tragitto</th><th className="px-4 py-3">Unità</th><th className="px-4 py-3">Stato</th><th className="px-4 py-3">Creato</th><th className="px-4 py-3 text-center w-40">Azioni</th></tr>
                    </thead>
                    <tbody>
                        {ddt.map(d => {
                            const n = unitaDiDdt(d.id).length;
                            return (
                                <tr key={d.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                                    <td className="px-4 py-2 font-mono text-xs">n.{d.numero}</td>
                                    <td className="px-4 py-2 text-white">{d.da_negozio} → {d.a_negozio}</td>
                                    <td className="px-4 py-2">{d.stato === "accettato" ? "✓" : n}</td>
                                    <td className="px-4 py-2">{d.stato === "in_transito" ? "🚚 In transito" : d.stato === "accettato" ? `✅ Accettato da ${d.accettato_da} il ${gg(d.accettato_il)}` : d.stato}</td>
                                    <td className="px-4 py-2 text-xs text-slate-500">{gghh(d.creato_il)}{d.creato_da ? ` · ${d.creato_da}` : ""}</td>
                                    <td className="px-4 py-2 text-center">
                                        <button onClick={() => stampa(d)} className="text-xs text-slate-300 border border-white/10 rounded-lg px-2 py-1 mr-1">🖨 DDT</button>
                                        {gestisce && d.stato === "in_transito" && (
                                            <button onClick={() => accetta(d)} className="text-xs text-emerald-300 border border-emerald-500/40 rounded-lg px-2 py-1">✓ Accetta</button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {!ddt.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Nessun trasferimento ancora.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function NuovoTrasferimento({ unita, negozi, utente, dopo }: { unita: Unita[]; negozi: string[]; utente: string; dopo: () => void }) {
    const [da, setDa] = useState(""); const [a, setA] = useState(""); const [note, setNote] = useState("");
    const [filtro, setFiltro] = useState(""); const [scelte, setScelte] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const disponibili = useMemo(() =>
        unita.filter(u => u.stato === "disponibile" && u.negozio === da &&
            (!filtro || `${u.descrizione} ${u.seriale} ${u.codice || ""}`.toLowerCase().includes(filtro.toLowerCase()))),
        [unita, da, filtro]);
    const crea = async () => {
        if (!da || !a || da === a || !scelte.size) return;
        setBusy(true);
        const { data: d, error } = await supabase.from("mag_ddt").insert({ da_negozio: da, a_negozio: a, creato_da: utente, note: note.trim() || null }).select().single();
        if (error || !d) { setBusy(false); alert("DDT non creato: " + (error?.message || "")); return; }
        for (const id of scelte) {
            const u = unita.find(x => x.id === id); if (!u) continue;
            await supabase.from("mag_unita").update({
                stato: "in_transito", negozio: a, ddt_id: (d as Ddt).id,
                storia: [...(u.storia || []), { quando: new Date().toISOString(), evento: "🚚 In transito", negozio: `${da} → ${a}`, operatore: utente, note: `DDT n.${(d as Ddt).numero}` }],
            }).eq("id", id);
        }
        setBusy(false); dopo();
    };
    const selCls = "glass-input !h-9 text-sm";
    return (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
            <div className="text-sm font-bold text-white">🚚 Nuovo trasferimento</div>
            <div className="flex items-end gap-3 flex-wrap">
                <label className="text-xs text-slate-400">Da<br />
                    <select value={da} onChange={e => { setDa(e.target.value); setScelte(new Set()); }} className={selCls}><option value="">—</option>{negozi.map(n => <option key={n}>{n}</option>)}</select></label>
                <label className="text-xs text-slate-400">A<br />
                    <select value={a} onChange={e => setA(e.target.value)} className={selCls}><option value="">—</option>{negozi.filter(n => n !== da).map(n => <option key={n}>{n}</option>)}</select></label>
                <label className="text-xs text-slate-400 flex-1 min-w-[200px]">Note<br />
                    <input value={note} onChange={e => setNote(e.target.value)} placeholder="facoltative, finiscono sul DDT" className={selCls + " w-full"} /></label>
            </div>
            {da && (
                <>
                    <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtra le unità disponibili…" className="glass-input !h-9 text-sm w-full" />
                    <div className="max-h-64 overflow-y-auto space-y-1">
                        {disponibili.map(u => (
                            <label key={u.id} className="flex items-center gap-2 text-[12px] text-slate-300 px-2 py-1 rounded-lg hover:bg-white/[0.04] cursor-pointer">
                                <input type="checkbox" checked={scelte.has(u.id)} onChange={e => setScelte(p => { const s = new Set(p); if (e.target.checked) s.add(u.id); else s.delete(u.id); return s; })} />
                                <span className="text-white">{u.descrizione}</span>
                                <span className="font-mono text-slate-500">{u.seriale}</span>
                                {u.azienda && <span className="text-slate-600">· {u.azienda}</span>}
                            </label>
                        ))}
                        {!disponibili.length && <div className="text-xs text-slate-500 italic px-2 py-3">Niente di disponibile a {da}.</div>}
                    </div>
                </>
            )}
            <div className="text-right">
                <button onClick={crea} disabled={busy || !da || !a || !scelte.size}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-40">
                    {busy ? "Creo…" : `Crea DDT (${scelte.size} unità)`}
                </button>
            </div>
        </div>
    );
}

function Carico({ negozi, aziende, utente, dopo }: { negozi: string[]; aziende: string[]; utente: string; dopo: () => void }) {
    const [descrizione, setDescrizione] = useState(""); const [codice, setCodice] = useState("");
    const [negozio, setNegozio] = useState(""); const [azienda, setAzienda] = useState("");
    const [valore, setValore] = useState(""); const [tipo, setTipo] = useState("imei");
    const [seriali, setSeriali] = useState(""); const [busy, setBusy] = useState(false);
    const salva = async () => {
        const lista = seriali.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
        if (!descrizione.trim() || !negozio || !lista.length) return;
        setBusy(true);
        const v = valore.trim() === "" ? null : Number(valore.replace(",", "."));
        const { error } = await supabase.from("mag_unita").insert(lista.map(s => ({
            seriale: s, tipo_seriale: tipo, codice: codice.trim() || null, descrizione: descrizione.trim(),
            azienda: azienda || null, negozio, valore: v, caricato_da: utente,
            storia: [{ quando: new Date().toISOString(), evento: "📥 Carico", negozio, operatore: utente }],
        })));
        setBusy(false);
        if (error) { alert("Carico non riuscito: " + error.message); return; }
        dopo();
    };
    const selCls = "glass-input !h-9 text-sm";
    return (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
            <div className="text-sm font-bold text-white">📥 Carico merce</div>
            <div className="flex items-end gap-3 flex-wrap">
                <label className="text-xs text-slate-400 flex-1 min-w-[220px]">Descrizione articolo<br />
                    <input value={descrizione} onChange={e => setDescrizione(e.target.value)} placeholder='es. "iPhone 15 128GB Nero"' className={selCls + " w-full"} /></label>
                <label className="text-xs text-slate-400">Codice<br />
                    <input value={codice} onChange={e => setCodice(e.target.value)} className={selCls + " w-28"} /></label>
                <label className="text-xs text-slate-400">Tipo seriale<br />
                    <select value={tipo} onChange={e => setTipo(e.target.value)} className={selCls}><option value="imei">IMEI</option><option value="sim">SIM (ICCID)</option><option value="seriale">Seriale</option></select></label>
                <label className="text-xs text-slate-400">Negozio<br />
                    <select value={negozio} onChange={e => setNegozio(e.target.value)} className={selCls}><option value="">—</option>{negozi.map(n => <option key={n}>{n}</option>)}</select></label>
                <label className="text-xs text-slate-400">Azienda<br />
                    <select value={azienda} onChange={e => setAzienda(e.target.value)} className={selCls}><option value="">—</option>{Array.from(new Set([...aziende, "T1", "T2"])).map(a => <option key={a}>{a}</option>)}</select></label>
                <label className="text-xs text-slate-400">Valore unitario €<br />
                    <input value={valore} onChange={e => setValore(e.target.value)} className={selCls + " w-24"} /></label>
            </div>
            <label className="text-xs text-slate-400 block">Seriali (uno per riga — spara pure col lettore barcode)<br />
                <textarea value={seriali} onChange={e => setSeriali(e.target.value)} rows={5} className="glass-input w-full text-sm font-mono mt-1" /></label>
            <div className="text-right">
                <button onClick={salva} disabled={busy || !descrizione.trim() || !negozio || !seriali.trim()}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40">
                    {busy ? "Carico…" : "Carica le unità"}
                </button>
            </div>
        </div>
    );
}
