"use client";

// ARCHIVIO MALUS (30/07): la vista dedicata che si apre dal riquadro Malus del
// Tracking. Elenca gli EPISODI persistiti in malus_storico — in corso, attivi
// (chiusi ma non ancora scalati) e compensati — con i totali per collaboratore.
// La visibilita' per ruolo e' del chiamante: qui arrivano episodi gia' scopati
// (consulente i suoi, store manager i suoi negozi, amministrazione tutti).
// La compensazione vera arrivera' col commissioning delle gare: intanto
// l'amministrazione puo' segnare/annullare a mano.
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { SelectPersona } from "@/components/SelectPersona";
import { getCat } from "./trackingHelpers";
import { type EpisodioMalus, totaliEpisodi, formatDataIt } from "./malusStorico";

export function StatoEpisodioBadge({ ep }: { ep: EpisodioMalus }) {
  const s =
    ep.stato === "compensato"
      ? { label: "Compensato", color: "#4ade80", bg: "#052e16", border: "#22c55e" }
      : ep.data_fine === null
        ? { label: "In corso", color: "#fca5a5", bg: "#450a0a", border: "#dc2626" }
        : { label: "Attivo — da scalare", color: "#fbbf24", bg: "#451a03", border: "#f59e0b" };
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap border"
      style={{ color: s.color, background: s.bg, borderColor: s.border }}
    >
      {s.label}
    </span>
  );
}

const eur = (n: number) => "€ " + (Math.round(n * 100) / 100).toLocaleString("it-IT");

export function ArchivioMalus({
  episodi,
  errore,
  onClose,
  onApriPratica,
  canCompensare,
  puoEliminare = false,
  utente,
  onAggiornato,
  venditoreIniziale,
}: {
  episodi: EpisodioMalus[];
  errore?: string | null;
  onClose: () => void;
  onApriPratica?: (contractId: string, categoria: string) => void;
  canCompensare: boolean;
  puoEliminare?: boolean;   // solo admin/dev (Luca 03/08): via QUALSIASI episodio
  utente: string;
  onAggiornato: (ep: EpisodioMalus) => void;
  venditoreIniziale?: string;
}) {
  const [statoSel, setStatoSel] = useState<"tutti" | "in_corso" | "attivo" | "compensato">("tutti");
  // deep-link dalla scheda utente (Luca 02/08): archivio gia' filtrato su di lui
  const [venditoreSel, setVenditoreSel] = useState(venditoreIniziale || "");
  const [search, setSearch] = useState("");
  const [confermaId, setConfermaId] = useState<string | null>(null);
  const [eliminaId, setEliminaId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [errAzione, setErrAzione] = useState<string | null>(null);

  const statoDi = (e: EpisodioMalus): "in_corso" | "attivo" | "compensato" =>
    e.stato === "compensato" ? "compensato" : e.data_fine === null ? "in_corso" : "attivo";

  // Filtri trasversali (ricerca + venditore); le card di riepilogo filtrano lo stato.
  const filtratiBase = useMemo(() => {
    const q = search.trim().toLowerCase();
    return episodi.filter((e) => {
      if (venditoreSel && (e.venditore || "—") !== venditoreSel) return false;
      if (q) {
        const match = [e.nominativo, e.venditore, e.negozio, e.brand, e.categoria]
          .some((v) => (v || "").toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [episodi, venditoreSel, search]);

  const filtrati = useMemo(
    () => filtratiBase.filter((e) => statoSel === "tutti" || statoDi(e) === statoSel),
    [filtratiBase, statoSel]
  );

  const tot = useMemo(() => totaliEpisodi(filtratiBase), [filtratiBase]);
  const venditori = useMemo(
    () => Array.from(new Set(episodi.map((e) => e.venditore || "—"))).sort(),
    [episodi]
  );

  // Totali per collaboratore: e' l'archivio "per ognuno di loro" — quanto ha
  // generato, quanto e' ancora da scalare, quanto e' gia' stato compensato.
  const perVenditore = useMemo(() => {
    const m = new Map<string, { negozi: Set<string>; n: number; inCorso: number; attivi: number; compensati: number }>();
    for (const e of filtratiBase) {
      const k = e.venditore || "—";
      const r = m.get(k) || { negozi: new Set<string>(), n: 0, inCorso: 0, attivi: 0, compensati: 0 };
      if (e.negozio) r.negozi.add(e.negozio);
      r.n++;
      const imp = Number(e.importo) || 0;
      const s = statoDi(e);
      if (s === "in_corso") r.inCorso += imp;
      else if (s === "attivo") r.attivi += imp;
      else r.compensati += imp;
      m.set(k, r);
    }
    return [...m.entries()].sort((a, b) => (b[1].inCorso + b[1].attivi) - (a[1].inCorso + a[1].attivi));
  }, [filtratiBase]);

  const ordinati = useMemo(
    () => [...filtrati].sort((a, b) => (b.data_inizio || "").localeCompare(a.data_inizio || "")),
    [filtrati]
  );

  const setCompensato = async (ep: EpisodioMalus, compensa: boolean) => {
    setSalvando(true);
    setErrAzione(null);
    const oggi = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const iso = `${oggi.getFullYear()}-${p(oggi.getMonth() + 1)}-${p(oggi.getDate())}`;
    const patch = compensa
      ? { stato: "compensato", compensato_il: iso, compensato_da: utente }
      : { stato: "attivo", compensato_il: null, compensato_da: null, compensato_note: null };
    const { error } = await supabase.from("malus_storico").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", ep.id);
    setSalvando(false);
    setConfermaId(null);
    if (error) { setErrAzione(error.message); return; }
    onAggiornato({ ...ep, ...(patch as Partial<EpisodioMalus>) } as EpisodioMalus);
  };

  // ELIMINA (Luca 03/08, mig. 150): tombstone, NON delete — la ricostruzione
  // deterministica rifarebbe nascere la riga al prossimo giro di sync.
  const elimina = async (ep: EpisodioMalus) => {
    setSalvando(true);
    setErrAzione(null);
    const { error } = await supabase.from("malus_storico").update({
      eliminato: true, eliminato_il: new Date().toISOString(), eliminato_da: utente,
      updated_at: new Date().toISOString(),
    }).eq("id", ep.id);
    setSalvando(false);
    setEliminaId(null);
    if (error) { setErrAzione(error.message); return; }
    onAggiornato({ ...ep, eliminato: true } as EpisodioMalus);
  };

  const cards: { id: "tutti" | "in_corso" | "attivo" | "compensato"; label: string; n: number; val: number; color: string; hint?: string }[] = [
    { id: "tutti", label: "Totale generato", n: filtratiBase.length, val: tot.totale, color: "#94a3b8" },
    { id: "in_corso", label: "In corso ora", n: tot.inCorso.n, val: tot.inCorso.eur, color: "#dc2626", hint: "stanno ancora maturando" },
    { id: "attivo", label: "Attivi — da scalare", n: tot.attivi.n, val: tot.attivi.eur, color: "#f59e0b", hint: "chiusi, in attesa di compensazione" },
    { id: "compensato", label: "Compensati", n: tot.compensati.n, val: tot.compensati.eur, color: "#22c55e", hint: "gia' scalati dai pagamenti" },
  ];

  const thStyle =
    "py-2 px-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-700 whitespace-nowrap";
  const tdStyle = "py-2 px-3 border-b border-slate-800 text-[12px]";

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[1100] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Archivio Malus"
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-[1150px] max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between py-5 px-7 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
          <div>
            <div className="text-lg font-extrabold text-slate-100">💰 Archivio Malus</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Ogni periodo di malus resta archiviato anche dopo che la pratica e&apos; stata sanata ·
              attivi = non ancora scalati · compensati = gia&apos; scalati dai pagamenti
            </div>
          </div>
          <button type="button" onClick={onClose} className="bg-transparent border-none text-slate-500 text-xl cursor-pointer leading-none p-0">
            ✕
          </button>
        </div>

        <div className="p-6">
          {errore && (
            <div className="mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[13px]">
              Archivio non disponibile: {errore}
              <div className="text-[11px] text-amber-400/70 mt-1">
                Probabilmente manca la migrazione 103 (tabella malus_storico) su Supabase.
              </div>
            </div>
          )}
          {errAzione && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-[13px]">
              Errore: {errAzione}
            </div>
          )}

          {/* Riepilogo: le card filtrano l'elenco per stato */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
            {cards.map((c) => {
              const active = statoSel === c.id;
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setStatoSel(c.id)}
                  onKeyDown={(e) => e.key === "Enter" && setStatoSel(c.id)}
                  className="rounded-xl border p-3.5 cursor-pointer select-none transition-all"
                  style={{ background: active ? c.color + "22" : "#1e293b", borderColor: active ? c.color : "#334155" }}
                >
                  <div className="text-xl font-bold" style={{ color: c.color }}>{eur(c.val)}</div>
                  <div className="text-[11px] mt-0.5 font-medium" style={{ color: active ? c.color : "#94a3b8" }}>
                    {c.label} · {c.n}
                  </div>
                  {c.hint && <div className="text-[10px] text-slate-500 mt-0.5">{c.hint}</div>}
                </div>
              );
            })}
          </div>

          {/* Filtri */}
          <div className="flex gap-2.5 items-center flex-wrap mb-5">
            <div className="relative flex-1 min-w-[220px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca per cliente, venditore, negozio, brand…"
                className="bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-[13px] py-2 px-3 pl-9 outline-none w-full box-border"
              />
            </div>
            {venditori.length > 1 && (
              <div className="min-w-[230px]">
                <SelectPersona
                  value={venditoreSel}
                  onChange={setVenditoreSel}
                  opzioni={venditori}
                  placeholder="Tutti i venditori — scrivi per filtrare"
                  className="bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-[13px] py-2 px-3 outline-none w-full"
                />
              </div>
            )}
          </div>

          {/* Totali per collaboratore */}
          {perVenditore.length > 1 && (
            <div className="mb-6">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Totali per collaboratore</div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-900">
                        <th className={thStyle}>Venditore</th>
                        <th className={thStyle}>Negozio</th>
                        <th className={thStyle + " text-center"}>Episodi</th>
                        <th className={thStyle + " text-right"}>In corso</th>
                        <th className={thStyle + " text-right"}>Attivi</th>
                        <th className={thStyle + " text-right"}>Compensati</th>
                        <th className={thStyle + " text-right"}>Totale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perVenditore.map(([nome, r]) => (
                        <tr
                          key={nome}
                          className="cursor-pointer hover:bg-indigo-900/20"
                          onClick={() => setVenditoreSel(venditoreSel === nome ? "" : nome)}
                        >
                          <td className={tdStyle + " text-slate-100 font-semibold"}>{nome}</td>
                          <td className={tdStyle + " text-slate-400"}>{[...r.negozi].join(", ") || "—"}</td>
                          <td className={tdStyle + " text-center text-slate-300"}>{r.n}</td>
                          <td className={tdStyle + " text-right font-bold text-red-300"}>{r.inCorso ? eur(r.inCorso) : "—"}</td>
                          <td className={tdStyle + " text-right font-bold text-amber-300"}>{r.attivi ? eur(r.attivi) : "—"}</td>
                          <td className={tdStyle + " text-right text-emerald-300"}>{r.compensati ? eur(r.compensati) : "—"}</td>
                          <td className={tdStyle + " text-right font-black text-slate-100"}>{eur(r.inCorso + r.attivi + r.compensati)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Elenco episodi */}
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Episodi {statoSel !== "tutti" ? `· ${cards.find((c) => c.id === statoSel)?.label}` : ""}
          </div>
          {ordinati.length === 0 ? (
            <div className="bg-slate-800 border border-slate-700 rounded-xl py-10 px-6 text-center text-slate-500 text-[13px]">
              Nessun episodio di malus con i filtri selezionati.
            </div>
          ) : (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-900">
                      <th className={thStyle}>Cliente</th>
                      <th className={thStyle}>Categoria</th>
                      <th className={thStyle}>Brand</th>
                      <th className={thStyle}>Negozio</th>
                      <th className={thStyle}>Venditore</th>
                      <th className={thStyle}>Inizio</th>
                      <th className={thStyle}>Fine</th>
                      <th className={thStyle + " text-center"}>GG</th>
                      <th className={thStyle + " text-right"}>Importo</th>
                      <th className={thStyle}>Stato</th>
                      {(canCompensare || puoEliminare) && <th className={thStyle}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {ordinati.map((ep) => {
                      const cat = getCat(ep.categoria);
                      return (
                        <tr
                          key={ep.id}
                          className={onApriPratica ? "cursor-pointer hover:bg-indigo-900/20" : ""}
                          onClick={() => onApriPratica?.(ep.contract_id, ep.categoria)}
                        >
                          <td className={tdStyle + " text-slate-100 font-semibold"}>{ep.nominativo || "—"}</td>
                          <td className={tdStyle}>
                            <span
                              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap border"
                              style={{ color: cat.color, background: cat.color + "22", borderColor: cat.color + "55" }}
                            >
                              {cat.label}
                            </span>
                          </td>
                          <td className={tdStyle + " text-slate-300"}>{ep.brand || "—"}</td>
                          <td className={tdStyle + " text-slate-400"}>{ep.negozio || "—"}</td>
                          <td className={tdStyle + " text-slate-300"}>{ep.venditore || "—"}</td>
                          <td className={tdStyle + " text-slate-400 whitespace-nowrap"}>{formatDataIt(ep.data_inizio)}</td>
                          <td className={tdStyle + " text-slate-400 whitespace-nowrap"}>
                            {ep.data_fine ? formatDataIt(ep.data_fine) : <span className="text-red-400 font-semibold">in corso</span>}
                          </td>
                          <td className={tdStyle + " text-center text-slate-300"}>
                            {ep.giorni}
                            <div className="text-[10px] text-slate-600">{Number(ep.malus_euro)}€/gg</div>
                          </td>
                          <td className={tdStyle + " text-right font-black text-slate-100 whitespace-nowrap"}>{eur(Number(ep.importo))}</td>
                          <td className={tdStyle}>
                            <StatoEpisodioBadge ep={ep} />
                            {ep.stato === "compensato" && ep.compensato_il && (
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {formatDataIt(ep.compensato_il)}{ep.compensato_da ? ` · ${ep.compensato_da}` : ""}
                              </div>
                            )}
                          </td>
                          {(canCompensare || puoEliminare) && (
                            <td className={tdStyle + " whitespace-nowrap"} onClick={(e) => e.stopPropagation()}>
                              {canCompensare && ep.stato !== "compensato" && ep.data_fine !== null && (
                                confermaId === ep.id ? (
                                  <span className="inline-flex gap-1.5">
                                    <button
                                      type="button"
                                      disabled={salvando}
                                      onClick={() => setCompensato(ep, true)}
                                      className="px-2 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-bold disabled:opacity-40"
                                    >
                                      Confermi?
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfermaId(null)}
                                      className="px-2 py-1 rounded-md border border-slate-600 text-slate-400 text-[11px]"
                                    >
                                      ✕
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfermaId(ep.id)}
                                    className="px-2 py-1 rounded-md border border-emerald-600 text-emerald-300 text-[11px] font-bold hover:bg-emerald-600/10"
                                  >
                                    ✓ Compensa
                                  </button>
                                )
                              )}
                              {canCompensare && ep.stato === "compensato" && (
                                <button
                                  type="button"
                                  disabled={salvando}
                                  onClick={() => setCompensato(ep, false)}
                                  className="px-2 py-1 rounded-md border border-slate-600 text-slate-500 text-[11px] hover:text-slate-300"
                                  title="Riporta l'episodio tra gli attivi"
                                >
                                  Annulla
                                </button>
                              )}
                              {puoEliminare && (
                                eliminaId === ep.id ? (
                                  <span className="inline-flex gap-1.5 ml-1.5">
                                    <button
                                      type="button"
                                      disabled={salvando}
                                      onClick={() => elimina(ep)}
                                      className="px-2 py-1 rounded-md bg-rose-600 text-white text-[11px] font-bold disabled:opacity-40"
                                      title="Sparisce da archivio, contatori e badge — e non rinasce"
                                    >
                                      Elimino?
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEliminaId(null)}
                                      className="px-2 py-1 rounded-md border border-slate-600 text-slate-400 text-[11px]"
                                    >
                                      ✕
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setEliminaId(ep.id)}
                                    className="px-2 py-1 rounded-md border border-rose-700/60 text-rose-400/90 text-[11px] ml-1.5 hover:bg-rose-600/10"
                                    title="Elimina il malus (solo admin)"
                                  >
                                    🗑
                                  </button>
                                )
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="py-2.5 px-4 border-t border-slate-700 text-slate-500 text-xs">
                {ordinati.length} episodi · la compensazione automatica arrivera&apos; con il sistema gare/commissioning
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
