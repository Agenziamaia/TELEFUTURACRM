// @ts-nocheck
"use client";

// MASTER (ex Regia — direttive Luca 21/08 notte, rifatta col double-check).
// · Due lenti: 🎯 CODICI di inserimento ↔ 🏪 NEGOZI (multi). La Marginalità
//   vive SOLO nella lente Negozi (coi codici non c'entra).
// · Ogni brand ha la sua carta, SEMPRE visibile, con filtro codici proprio.
// · SOGLIE COL LORO PERIMETRO (lezione del primo giro, sbagliato):
//   - W3 mobile/fisso → target PER PDV dal pannello (pay_target_pdv),
//     sommati sui codici selezionati; senza filtro = somma del franchising.
//   - W3 Partnership Reward → punti eventi CB (matchRigaPartnership, righe
//     condizionate stanotte) contro il target PDV (extra.pr), tacche
//     all'80% e al 100% coi premi in chip.
//   - Multibrand (Donna Olimpia, Promontori+Garbatella) → gara On Top a
//     punti cumulati, barre dedicate (punteggi PROVVISORI dal motore
//     franchising finché non nasce il tabellare multibrand).
//   - Soglie di RETE (assicurazioni, luce&gas, business di Ragione Sociale,
//     VF, Sky GOLD): tacche SOLO senza filtro — con un PV/codice filtrato
//     non hanno senso e lo si dice in chip.
// · PROSPECT: barra piena = attuale, coda a strisce = proiezione fine mese;
//   le considerazioni (soglie, mancanti) si fanno sulla proiezione.
// · TUTTO si apre nel drill fino ai contratti (Ricerca/Tracking).

import { useMemo, useState } from "react";
import { SelectMulti } from "@/components/SelectPersona";
import { contestoVfFw, calcolaAvanzamento, matchRigaPartnership, matchRigheAttivazione, puntiPerRighe, brandIdDaLabel } from "@/lib/commissioning";
import { cn } from "@/utils";
import { Tip, TipRiga, TipTitolo, SogliaBar, fmtPt, fmtN } from "./_charts";
import { GARA, LogoBrand, righeOperatore, DrillPanel } from "./_widgets";

const norm = (s) => String(s || "").trim().toLowerCase();
// match a PREFISSO bidirezionale (come il pannello target): "Magliana" ↔
// "Magliana W3"/"Magliana Multi", "Donna Olimpia" ↔ codice "Donna"
const stessoNome = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };
const PISTA_LABEL = { mobile: "Mobile", fisso: "Fisso", assicurazioni: "Assicurazioni", lucegas: "Luce & Gas", sky: "Punti Sky", cb: "Customer Base", business_piva: "Business (eventi)", business_mobile: "Business mobile", business_fisso: "Business fisso", soluzioni_digitali: "Soluzioni digitali", vas: "VAS", luce: "Luce", gas: "Gas" };
const PISTA_EMOJI = { mobile: "📱", fisso: "🌐", assicurazioni: "🛡", lucegas: "⚡", sky: "🟣", cb: "🔁", business_piva: "💼", business_mobile: "💼", business_fisso: "💼", soluzioni_digitali: "🧩", vas: "✨", luce: "💡", gas: "🔥" };

export function Master({ items, righeGara, dati, labels, nG, oggi, idxDi, gl, meseCorrente }) {
    const [lente, setLente] = useState("codici");
    const [codSel, setCodSel] = useState({ w3: [], vf: [], sky: [], fw: [] });
    const [negSel, setNegSel] = useState([]);
    const [drill, setDrill] = useState(null);

    const negoziTutti = useMemo(() => {
        const per = new Map();
        for (const it of items) { if (it.negozio === "—") continue; per.set(it.negozio, (per.get(it.negozio) || 0) + 1); }
        return [...per.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    }, [items]);

    const itemsDi = (b) => items.filter((it) => it.brandGara === b);
    const filtra = (arr, b) => lente === "codici"
        ? (codSel[b]?.length ? arr.filter((x) => codSel[b].includes(x.cod_ins)) : arr)
        : (negSel.length ? arr.filter((x) => negSel.some((n) => norm(n) === norm(x.negozio))) : arr);

    const inA = (c) => contestoVfFw("fastweb", c.cod_ins, c.negozio, c.categoria) === "vodafone";
    const rawDi = (b) => {
        if (!righeGara) return null;
        if (b === "w3") return righeGara.w3;
        if (b === "sky") return righeGara.sky;
        if (b === "vf") return [...righeGara.vf, ...righeGara.fw.filter(inA)].filter((c) => !(/mnp/i.test(String(c.prodotto || "")) && /vodafone|fastweb|\bho\b|ho\./i.test(String(c.provenienza || ""))));
        return null;
    };
    const filtraRaw = (arr, b) => !arr ? null : lente === "codici"
        ? (codSel[b]?.length ? arr.filter((c) => codSel[b].includes(c.cod_ins || "—")) : arr)
        : (negSel.length ? arr.filter((c) => negSel.some((n) => norm(n) === norm(c.negozio))) : arr);

    const TABS = { w3: dati.aw3, vf: dati.avf, sky: dati.asky, fw: null };

    return (
        <div className="space-y-4">
            <div className="an-in rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0">
                    <p className="text-sm text-fuchsia-100"><b>🎛 Master</b> — {lente === "codici" ? "produzione per CODICE di inserimento: qui decidi dove spostare le attivazioni." : "produzione per PUNTO VENDITA: il quadro di cosa sta facendo il negozio."}</p>
                    <p className="text-[10px] text-fuchsia-200/60 mt-0.5">barra piena = fatto · strisce = proiezione fine mese · clicca barre, categorie e chip per arrivare ai contratti → 🔍 Ricerca · 🧭 Tracking</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {lente === "negozi" && (
                        <SelectMulti values={negSel} onChange={setNegSel} opzioni={negoziTutti} placeholder="tutti i negozi…" maxVoci={100} className="min-w-[220px]" />
                    )}
                    <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                        {[{ id: "codici", l: "🎯 Codici" }, { id: "negozi", l: "🏪 Negozi" }].map((x) => (
                            <button key={x.id} onClick={() => setLente(x.id)} className={cn("px-3.5 py-2 rounded-lg text-xs font-black transition-all", lente === x.id ? "bg-fuchsia-500/80 text-white shadow-lg shadow-fuchsia-500/30" : "text-slate-400 hover:text-white")}>{x.l}</button>
                        ))}
                    </div>
                </div>
            </div>

            {!righeGara && (
                <p className="an-in text-[11px] text-amber-200/90 bg-amber-400/10 border border-amber-400/20 rounded-xl px-3 py-2">📅 Le gare sono mensili: con un periodo su più mesi le soglie si spengono — resta la produzione. Scegli un periodo dentro un solo mese per vederle.</p>
            )}

            {["w3", "vf", "sky", "fw"].map((b, i) => (
                <CartaMaster key={b} b={b} lente={lente}
                    tab={TABS[b]} raw={filtraRaw(rawDi(b), b)}
                    sue={filtra(itemsDi(b), b)} sueTutte={itemsDi(b)}
                    codici={codSel[b]} setCodici={(v) => setCodSel((p) => ({ ...p, [b]: v }))}
                    negSel={negSel} targetW3={dati.targetW3 || []}
                    gl={gl} meseCorrente={meseCorrente} idxDi={idxDi} labels={labels}
                    apri={setDrill} delay={i * 60} />
            ))}

            {lente === "negozi" && <CartaMargMaster dati={dati} negSel={negSel} delay={280} />}

            <DrillPanel drill={drill} chiudi={() => setDrill(null)} labels={labels} />
        </div>
    );
}

/* ═══ LA CARTA DI UN BRAND NEL MASTER ══════════════════════════════════ */
function CartaMaster({ b, lente, tab, raw, sue, sueTutte, codici, setCodici, negSel, targetW3, gl, meseCorrente, idxDi, labels, apri, delay }) {
    const G = GARA[b];
    const selezione = lente === "codici" ? codici : negSel;
    const filtroAttivo = selezione.length > 0;
    const filtroLabel = filtroAttivo ? `${selezione.length} ${lente === "codici" ? "codici" : "negozi"}: ${selezione.slice(0, 3).join(", ")}${selezione.length > 3 ? "…" : ""}` : (lente === "codici" ? "tutti i codici" : "tutti i negozi");

    const codiciBrand = useMemo(() => {
        const per = new Map();
        for (const it of sueTutte) { if (it.cod_ins === "—") continue; per.set(it.cod_ins, (per.get(it.cod_ins) || 0) + 1); }
        return [...per.entries()].sort((x, y) => y[1] - x[1]).map(([k]) => k);
    }, [sueTutte]);

    // proiezione fine mese sul ritmo dei giorni lavorativi trascorsi
    const prj = (v) => (meseCorrente && gl?.mostraProiezione !== false && gl?.trascorsi > 0 && v > 0) ? Math.round((v / gl.trascorsi) * gl.totali * 100) / 100 : null;

    // ── W3: target per PDV (pannello) — franchising vs Multibrand ────────
    const w3 = useMemo(() => {
        if (b !== "w3" || !tab || !raw) return null;
        const fr = targetW3.filter((r) => /^\d+$/.test(r.cod_gara || ""));
        const mb = targetW3.filter((r) => /^MB-/.test(r.cod_gara || ""));
        const copre = (rigaNeg, v) => String(rigaNeg).split("+").some((x) => stessoNome(x, v)) || stessoNome(rigaNeg, v);
        const frSel = filtroAttivo ? fr.filter((r) => selezione.some((v) => copre(r.negozio, v))) : fr;
        const mbSel = filtroAttivo ? mb.filter((r) => selezione.some((v) => copre(r.negozio, v))) : mb;
        const nomiFr = fr.map((r) => r.negozio);
        const rawFr = raw.filter((c) => nomiFr.some((n) => stessoNome(n, c.cod_ins || "")));
        const somme = (campo) => {
            const arr = frSel.map((r) => r[campo]).filter((a) => Array.isArray(a) && a.length);
            if (!arr.length) return [];
            const len = Math.max(...arr.map((a) => a.length));
            return Array.from({ length: len }, (_, i) => ({ tier: i + 1, soglia_da: Math.round(arr.reduce((s, a) => s + (a[i] ?? a[a.length - 1] ?? 0), 0)) }));
        };
        // Partnership: eventi CB (righe condizionate) contro il target dei PDV scelti
        const eventi = [];
        let puntiPr = 0;
        for (const c of rawFr) {
            const r = matchRigaPartnership(tab.righe, c);
            if (!r) continue;
            puntiPr += Number(r.punti || 0);
            eventi.push({ id: c.id, venditore: c.venditore || "—", negozio: c.negozio || "—", cod_ins: c.cod_ins || "—", categoria: c.categoria, prodotto: c.prodotto, offerta: c.offerta, punti: Number(r.punti || 0), g: idxDi?.get(String(c.data || "").slice(0, 10)) || 0 });
        }
        const pr = frSel.reduce((s, r) => ({ target: s.target + (r.extra?.pr?.target || 0), premio: s.premio + (r.extra?.pr?.premio || 0), premio80: s.premio80 + (r.extra?.pr?.premio80 || 0) }), { target: 0, premio: 0, premio80: 0 });
        return { fr, frSel, mbSel, rawFr, somme, eventi, puntiPr, pr };
    }, [b, tab, raw, targetW3, filtroAttivo, selezione, idxDi]);

    // motore azienda: per W3 sul solo franchising (il Multibrand ha la sua gara)
    const av = useMemo(() => {
        if (!tab || !raw) return null;
        return calcolaAvanzamento(tab, b === "w3" && w3 ? w3.rawFr : raw);
    }, [tab, raw, b, w3]);

    const righe = useMemo(() => righeOperatore(b, sue), [b, sue]);
    const punti = av
        ? Math.round(Object.values(av.piste || {}).reduce((s, st) => s + (st?.punti || 0), 0) * 100) / 100
        : Math.round(sue.reduce((s, x) => s + x.punti, 0) * 100) / 100;
    const senzaRiga = sue.filter((it) => it.senzaRiga).length;
    const escluse = sue.filter((it) => it.esclusa).length;

    const drillPista = (chiave, nome) => {
        // il drill nasce dallo STESSO motore delle barre (tabellare azienda,
        // stesse righe raw): così i conteggi combaciano sempre
        const base = b === "w3" && w3 ? w3.rawFr : (raw || []);
        const lista = [];
        for (const c of base) {
            const set = matchRigheAttivazione(tab?.righe || [], c, brandIdDaLabel(c.brand) || G.chiave);
            if (!set.length || set[0].pista !== chiave) continue;
            lista.push({ id: c.id, venditore: c.venditore || "—", negozio: c.negozio || "—", cod_ins: c.cod_ins || "—", categoria: c.categoria, prodotto: c.prodotto, offerta: c.offerta, punti: puntiPerRighe(set), g: idxDi?.get(String(c.data || "").slice(0, 10)) || 0 });
        }
        apri({ titolo: `${G.label} · ${nome} — contratti nel filtro`, sub: filtroLabel, items: lista });
    };

    // quali piste hanno soglie di RETE (tacche solo senza filtro)
    const scopoRete = (chiave) => b !== "w3" || ["assicurazioni", "lucegas", "business_piva"].includes(chiave);
    const notaRete = (chiave) => b === "w3" && chiave === "business_piva" ? "🌍 soglia di Ragione Sociale" : "🌍 soglie di RETE — togli il filtro per vederle";

    const barraPista = (p) => {
        const st = av?.piste?.[p.chiave];
        if (!st || (!st.punti && !st.pezzi)) return null;
        if (b === "w3" && (p.chiave === "cb" || p.chiave === "partnership")) return null;   // la CB vive nella barra Partnership
        let scala = (tab?.soglie || []).filter((s) => s.pista === p.chiave).sort((x, y) => x.tier - y.tier);
        let nota = null;
        if (b === "w3" && (p.chiave === "mobile" || p.chiave === "fisso")) {
            scala = w3 ? w3.somme(p.chiave === "mobile" ? "soglie_mobile" : "soglie_fisso") : [];
            nota = w3 && w3.frSel.length ? `🎯 target di ${w3.frSel.length} PDV${w3.frSel.length > 1 ? " sommati" : ` (${w3.frSel[0].negozio})`}` : null;
        } else if (scopoRete(p.chiave) && filtroAttivo) {
            scala = [];
            nota = notaRete(p.chiave);
        }
        return (
            <SogliaBar key={p.chiave}
                emoji={PISTA_EMOJI[p.chiave] || "▫️"} label={PISTA_LABEL[p.chiave] || p.nome}
                punti={st.punti} pezzi={st.pezzi} soglie={scala} colore={G.colore}
                proiezione={prj(st.punti)}
                gate={!filtroAttivo ? (st.gate || null) : null}
                malus={!filtroAttivo && b === "w3" && p.chiave === "mobile" && av?.malus30Mobile ? "malus −30% (fisso S1 o <6 P.IVA)" : null}
                nota={nota}
                onClick={() => drillPista(p.chiave, PISTA_LABEL[p.chiave] || p.nome)}
            />
        );
    };

    return (
        <div className="glass-card an-card rounded-2xl p-4 an-in relative overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
            <span className="absolute inset-y-3 left-0 w-[3px] rounded-full" style={{ background: G.colore, boxShadow: `0 0 10px ${G.colore}` }} />
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pl-2">
                <div className="flex items-center gap-3 min-w-0">
                    <LogoBrand chiave={G.chiave} colore={G.colore} alt={G.label} h={38} origine="left" />
                    <span className="text-[10px] text-slate-500 whitespace-nowrap tabular-nums">{fmtN(sue.length)} pezzi{b !== "fw" ? <> · <b className="text-slate-300">{fmtPt(punti)}</b> pt</> : null} <span className="text-slate-600">({filtroLabel})</span></span>
                </div>
                {lente === "codici" && (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">🎯 Codici</span>
                        <SelectMulti values={codici} onChange={setCodici} opzioni={codiciBrand} placeholder="tutti…" maxVoci={100} className="min-w-[200px]" />
                    </div>
                )}
            </div>

            {!sue.length ? <p className="text-xs text-slate-500 py-4 text-center">Nessuna vendita {G.label} nel filtro.</p> : (
                <div className="grid lg:grid-cols-2 gap-x-5 gap-y-2 pl-2">
                    <div className="space-y-2">
                        {b === "fw" ? (
                            <p className="text-[11px] text-slate-500 rounded-xl bg-white/[.04] border border-white/[.06] px-3 py-3">🟡 La gara Fastweb T2 corre a <b className="text-slate-300">pezzi</b> (niente tabellare a soglie): il dettaglio per categoria è qui a destra. Il Fastweb sui codici T1 conta nella carta Vodafone (lettera A).</p>
                        ) : av ? (
                            <>
                                {[...(tab?.piste || [])].sort((x, y) => x.ordine - y.ordine).map(barraPista)}
                                {b === "w3" && w3 && (w3.pr.target > 0 || w3.puntiPr > 0) && (
                                    <SogliaBar emoji="🏅" label="Partnership Reward (eventi CB)"
                                        punti={w3.puntiPr} pezzi={w3.eventi.length}
                                        soglie={w3.pr.target > 0 ? [{ tier: 1, soglia_da: Math.round(w3.pr.target * 0.8) }, { tier: 2, soglia_da: w3.pr.target }] : []}
                                        colore={G.colore} proiezione={prj(w3.puntiPr)}
                                        nota={w3.pr.target > 0
                                            ? (w3.puntiPr >= w3.pr.target ? `🎁 premio pieno ${fmtN(w3.pr.premio)} € preso!`
                                                : w3.puntiPr >= w3.pr.target * 0.8 ? `🎁 ${fmtN(w3.pr.premio80)} € in tasca · pieni ${fmtN(w3.pr.premio)} € tra ${fmtN(Math.ceil(w3.pr.target - w3.puntiPr))} pt`
                                                    : `🎁 ${fmtN(w3.pr.premio80)} € tra ${fmtN(Math.ceil(w3.pr.target * 0.8 - w3.puntiPr))} pt (80%) · ${fmtN(w3.pr.premio)} € al target`)
                                            : "🎯 target: seleziona PDV franchising"}
                                        onClick={() => apri({ titolo: "Partnership Reward — eventi Customer Base", sub: filtroLabel, items: w3.eventi })}
                                    />
                                )}
                                {b === "w3" && w3 && w3.mbSel.map((r) => {
                                    const negozi = String(r.negozio).split("+").map((x) => x.trim());
                                    const rowsMb = raw.filter((c) => negozi.some((n) => stessoNome(n, c.cod_ins || "")));
                                    const avMb = calcolaAvanzamento(tab, rowsMb);
                                    const pMb = Math.round(((avMb.piste?.mobile?.punti || 0) + (avMb.piste?.fisso?.punti || 0)) * 100) / 100;
                                    return (
                                        <SogliaBar key={r.cod_gara} emoji="🚀" label={`On Top · ${r.negozio}`}
                                            punti={pMb} pezzi={rowsMb.length}
                                            soglie={(r.soglie_mobile || []).map((v, i) => ({ tier: i + 1, soglia_da: v }))}
                                            colore={G.colore} proiezione={prj(pMb)}
                                            nota="⚠ punteggi provvisori (motore franchising) — il tabellare multibrand arriva col suo cantiere"
                                            onClick={() => apri({ titolo: `On Top Multibrand · ${r.negozio}`, sub: "punti cumulati mobile+fisso", items: sue.filter((it) => negozi.some((n) => stessoNome(n, it.cod_ins))) })}
                                        />
                                    );
                                })}
                            </>
                        ) : (
                            <p className="text-[11px] text-slate-500 rounded-xl bg-white/[.04] border border-white/[.06] px-3 py-3">📅 Soglie spente: periodo su più mesi{tab ? "" : " (o tabellare azienda assente)"} — la produzione del filtro resta qui a destra.</p>
                        )}
                    </div>

                    <div className="space-y-1">
                        {righe.map((r) => {
                            const pt = Math.round(r.items.reduce((s, x) => s + x.punti, 0) * 100) / 100;
                            const maxPt = Math.max(1, b === "fw" ? sue.length : punti);
                            return (
                                <Tip key={r.label} block tip={<div>
                                    <TipTitolo>{r.emoji} {r.label}</TipTitolo>
                                    <TipRiga l="pezzi" r={fmtN(r.items.length)} colore={r.colore} />
                                    {b !== "fw" && <TipRiga l="punti" r={fmtPt(pt)} />}
                                    {r.det.map(([l, v]) => <TipRiga key={l} l={l} r={fmtN(v)} />)}
                                    <p className="text-[10px] text-indigo-300 mt-1">👆 clicca per l'elenco contratti</p>
                                </div>}>
                                    <div onClick={(e) => { e.stopPropagation(); apri({ titolo: `${G.label} · ${r.label}`, sub: filtroLabel, items: r.items }); }}
                                        className="grid grid-cols-[minmax(120px,1.2fr)_2fr_auto_auto] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors cursor-pointer">
                                        <span className="text-xs font-semibold text-slate-200 truncate">{r.emoji} {r.label}</span>
                                        <span className="h-2 rounded-full bg-white/5 overflow-hidden">
                                            <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, ((b === "fw" ? r.items.length : pt) / maxPt) * 100)}%`, background: `linear-gradient(90deg, ${r.colore}55, ${r.colore})` }} />
                                        </span>
                                        <span className="text-[11px] font-black text-white tabular-nums text-right w-14">{b === "fw" ? `${fmtN(r.items.length)} pz` : `${fmtPt(pt)} pt`}</span>
                                        <span className="text-[10px] text-slate-500 tabular-nums text-right w-12">{b === "fw" ? "" : `${fmtN(r.items.length)} pz`}</span>
                                    </div>
                                </Tip>
                            );
                        })}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {escluse > 0 && <span onClick={() => apri({ titolo: `${G.label} · MNP escluse da lettera`, sub: filtroLabel, items: sue.filter((it) => it.esclusa) })} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-slate-400 cursor-pointer hover:bg-white/10">🚫 {escluse} MNP escluse</span>}
                            {senzaRiga > 0 && <span onClick={() => apri({ titolo: `${G.label} · senza punti`, sub: filtroLabel, items: sue.filter((it) => it.senzaRiga) })} className="px-2 py-0.5 rounded-md bg-amber-400/10 border border-amber-400/25 text-[10px] text-amber-200 cursor-pointer hover:bg-amber-400/20">⚠ {senzaRiga} senza punti</span>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ═══ MARGINALITÀ nel Master (SOLO lente Negozi: è roba di negozio) ════ */
function CartaMargMaster({ dati, negSel, delay }) {
    const righe = useMemo(() => (dati.ext || []).filter((r) => !negSel.length || negSel.some((n) => norm(n) === norm(r.negozio))), [dati.ext, negSel]);
    const venduto = righe.reduce((s, r) => s + (Number(r.prezzo) || 0), 0);
    const catDi = (p) => dati.margMap?.get(norm(p))?.cat || (/bundle/i.test(String(p || "")) ? "Bundle" : /(telefono|tnp|smartphone|iphone)/i.test(String(p || "")) ? "Telefoni" : "Altro");
    const icona = (nome) => nome === "Telefoni" ? "📱" : nome === "Bundle" ? "🎁" : (dati.margIcone?.get(nome) || "🧩");
    const perCat = useMemo(() => {
        const per = {};
        for (const r of righe) { const c = catDi(r.prodotto); (per[c] ??= { val: 0, qty: 0 }); per[c].val += Number(r.prezzo) || 0; per[c].qty += Math.max(1, Number(r.qty) || 1); }
        return Object.entries(per).sort((a, b) => b[1].val - a[1].val);
    }, [righe]);
    const perNegozio = useMemo(() => {
        const per = {};
        for (const r of righe) { (per[r.negozio] ??= 0); per[r.negozio] += Number(r.prezzo) || 0; }
        return Object.entries(per).sort((a, b) => b[1] - a[1]);
    }, [righe]);
    const eur = (v) => `${fmtN(Math.round(v))} €`;
    return (
        <div className="glass-card an-card rounded-2xl p-4 an-in relative overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
            <span className="absolute inset-y-3 left-0 w-[3px] rounded-full" style={{ background: "#22c55e", boxShadow: "0 0 10px #22c55e" }} />
            <div className="flex items-center gap-3 mb-3 pl-2">
                <LogoBrand chiave="marginalita" colore="#22c55e" alt="Marginalità" h={34} origine="left" />
                <span className="text-[10px] text-slate-500 tabular-nums">venduto <b className="text-slate-200">{eur(venduto)}</b> · {fmtN(righe.reduce((s, r) => s + Math.max(1, Number(r.qty) || 1), 0))} pezzi <span className="text-slate-600">(roba di negozio: coi codici non c'entra)</span></span>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 pl-2">
                <div className="space-y-1">
                    {perCat.slice(0, 7).map(([c, v]) => (
                        <div key={c} className="flex items-center gap-2 text-[11px]">
                            <span className="text-slate-300 flex-1 truncate">{icona(c)} {c}</span>
                            <b className="text-white tabular-nums">{eur(v.val)}</b>
                            <span className="text-[10px] text-slate-500 tabular-nums w-12 text-right">{fmtN(v.qty)} pz</span>
                        </div>
                    ))}
                </div>
                <div className="space-y-1">
                    {perNegozio.slice(0, 7).map(([n, v]) => (
                        <div key={n} className="flex items-center gap-2 text-[11px]">
                            <span className="text-slate-300 flex-1 truncate">🏪 {n}</span>
                            <b className="text-white tabular-nums">{eur(v)}</b>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
