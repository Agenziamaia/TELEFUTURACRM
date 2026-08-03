"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { seesWholeStore } from "@/lib/roles";
import { useVisibleStores, sameStore } from "@/lib/visibleStores";
import { categoriaDi, controlliDi, righeTracking } from "@/lib/tassonomia";
import { statoContrattoDa } from "./trackingHelpers";
import {
  CATEGORIE,
  ALL_BRANDS,
  STATI_ADMIN,
  STATI_ADMIN_FINANZIAMENTO,
  MALUS_IMPORTO,
  type TrackingRow,
  type StoriaEvent,
  type FollowUpItem,
} from "./trackingConstants";
import {
  getStatiNegozioPerCategoria,
  getStatoN,
  getStatoA,
  getCat,
  isAttenzioneRow,
  isDaLavorareRow,
  isMalusRow,
  calcolaMalus,
  impostaRegoleTracking,
} from "./trackingHelpers";
import { RegoleTracking } from "./RegoleTracking";
import { ArchivioMalus, StatoEpisodioBadge } from "./ArchivioMalus";
import { type EpisodioMalus, sincronizzaMalusStorico, totaliEpisodi, formatDataIt } from "./malusStorico";

type RawRow = Record<string, unknown> & {
  clients?: Record<string, unknown> | null;
  dettagli?: Record<string, unknown> | null;
};

function formatDataInserimento(val: string | undefined): string {
  const d = parseDataRiga(val);
  return d ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}

/**
 * Le date arrivano in tre forme: ISO con orario, "yyyy-mm-dd" da
 * data_registrazione e "gg/mm/aaaa" gia' formattato. Prima veniva convertita solo
 * la prima, quindi in colonna comparivano date ISO e soprattutto il filtro
 * "Periodo" faceva split("/") su "2026-07-22", otteneva un solo pezzo e saltava
 * del tutto il confronto: sembrava non funzionare (segnalazione 35).
 */
function parseDataRiga(val: string | undefined | null): Date | null {
  if (!val) return null;
  const s = String(val).trim();
  if (s.includes("T")) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function mapContractToTrackingRow(
  c: RawRow,
  client?: Record<string, unknown> | null,
  dettagli?: Record<string, unknown> | null
): TrackingRow {
  const nome = (client?.nome as string) ?? "";
  const cognome = (client?.cognome as string) ?? "";
  const ragione = (client?.ragione_sociale as string) ?? "";
  const nominativo = ragione.trim() || [nome, cognome].filter(Boolean).join(" ").trim() || "—";
  const telefono = (client?.cellulare as string) || (client?.email as string) || "—";
  const cf = (client?.cf_piva as string) ?? "—";
  const addr = (client?.indirizzo as string) ?? "";
  const citta = (client?.citta as string) ?? "";
  const indirizzo = addr ? (citta ? `${addr}, ${citta}` : addr) : "—";

  const dataReg = (c.data_registrazione as string) || (c.data as string) || (c.created_at as string) || "";
  const dataInserimento = formatDataInserimento(dataReg);

  const storia = (c.storia as StoriaEvent[] | null) ?? [];
  const statoNegozio = (c.stato_negozio as string) || "nuovo";
  const statoAdmin = (c.stato_admin as string) || "da_verificare";

  const d = dettagli || (c.dettagli as Record<string, unknown> | null) || {};

  // Categoria dalla tassonomia unica: si usa quella scritta a database
  // (categoria_macro) e, per i contratti piu' vecchi, la si ricava al volo dalle
  // stesse regole. Niente piu' logica di normalizzazione sparsa nelle pagine.
  const categoria = (c.categoria_macro as string) || categoriaDi(c.brand as string, c.categoria as string, c.prodotto as string);
  const controlli = Array.isArray(c.controlli) && c.controlli.length
    ? (c.controlli as string[])
    : controlliDi(d as Record<string, unknown>);

  return {
    id: (c.id as string) ?? "",
    // Deleghe: senza questi due campi i filtri "Delegate a me / da me" e la
    // tendina di delega confrontavano con undefined (bug silenzioso).
    delegated_to: (c.delegated_to as string | null) ?? null,
    delegated_by: (c.delegated_by as string | null) ?? null,
    categoria,
    brand: (c.brand as string) ?? "—",
    negozio: (c.negozio as string) ?? "—",
    venditore: (c.venditore as string) ?? "—",
    nominativo,
    telefono,
    numContratto: (c.id as string) ?? "",
    numAttivazione: (c.codice_attivazione as string) ?? "—",
    dataInserimento,
    statoNegozio,
    // Segnalazione 77: stato della pratica (colonna "stato"), diverso dall'esito
    // negozio. Serve per il filtro "Tutti gli stati".
    statoPratica: (c.stato as string) || "—",
    statoAdmin,
    storia,
    cf,
    indirizzo,
    gnp: d.gnp as boolean | undefined,
    numFissoProvvisorio: (d.numFissoProvvisorio as string | null) ?? null,
    numFissoDefinitivo: (d.numFissoDefinitivo as string | null) ?? null,
    tipoEnergia: d.tipoEnergia as string | undefined,
    pod: (d.pod as string | null) ?? null,
    pdr: (d.pdr as string | null) ?? null,
    tipoFinanziamento: d.tipoFinanziamento as string | undefined,
    codiceNegozio: (d.codiceNegozio as string) ?? undefined,
    modelloTelefono: d.modelloTelefono as string | undefined,
    numeroPratica: (d.numeroPratica as string | null) ?? null,
    hasPda: d.hasPda as boolean | undefined,
    hasDocumenti: d.hasDocumenti as boolean | undefined,
    followup: d.followup as FollowUpItem[] | undefined,
    dettagliFull: d as Record<string, unknown>,
    controlli,
    finanziato: controlli.includes("finanziamento"),
  };
}

// Segnalazioni 48, 65 e 70: i riquadri per categoria leggevano chiavi camelCase
// (tipoFinanziamento, codiceNegozio, modelloTelefono, tipoEnergia) che nei
// contratti reali non esistono, quindi restavano vuoti. I dettagli sono salvati
// con le etichette del modulo. Questa funzione prende la prima chiave presente.
function detVal(det: Record<string, unknown> | undefined, ...chiavi: string[]): string | null {
  if (!det) return null;
  for (const k of chiavi) {
    const v = det[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v);
  }
  return null;
}

/** Codice inserimento: cambia nome a seconda del prodotto, va sempre mostrato. */
function codiceInserimento(det: Record<string, unknown> | undefined): string | null {
  if (!det) return null;
  const esatte = detVal(det, "Cod.Ins.", "Cod. Ins.", "codice_inserimento", "Codice");
  if (esatte) return esatte;
  // fallback: qualunque chiave che inizi per "Cod.Ins" (CB, Cambio, Protecta, RF...)
  for (const [k, v] of Object.entries(det)) {
    if (/^cod\.?\s?ins/i.test(k) && v !== null && v !== undefined && String(v).trim() !== "") {
      return String(v);
    }
  }
  return null;
}

// ─── Badges ───────────────────────────────────────────────────────────────────
function StatoBadge({ id, set }: { id: string; set: "admin" | "negozio" }) {
  const s = set === "admin" ? getStatoA(id) : getStatoN(id);
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap border"
      style={{ color: s.color, background: s.bg, borderColor: s.color + "44" }}
    >
      {s.label}
    </span>
  );
}

function CatBadge({ id }: { id: string }) {
  const c = getCat(id);
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap border"
      style={{ color: c.color, background: c.color + "22", borderColor: c.color + "55" }}
    >
      {c.label}
    </span>
  );
}

// ─── KpiBar ───────────────────────────────────────────────────────────────────
// Chiave brand NORMALIZZATA (minuscole, niente spazi/punti): a DB convivono
// "Very Mobile", "TIM", "WindTre"... — il lookup esatto perdeva pezzi.
const trkBrandKey = (b: string) => String(b).toLowerCase().replace(/[^a-z0-9]/g, "");
const TRK_BRAND_COLORS: Record<string, string> = {
  vodafone: "#E60000", fastweb: "#eab308", windtre: "#f97316", wind3: "#f97316",
  iliad: "#C00028", tim: "#0050FF", s4: "#22c55e", energy: "#22c55e",
  sky: "#0072C6", dojo: "#14b8a6", verymobile: "#84cc16", homobile: "#9b26b6",
  kenamobile: "#e4002b", kena: "#e4002b",
};
// stessi loghi di Registra Vendita (public/)
const TRK_BRAND_LOGOS: Record<string, string> = {
  vodafone: "/vodaphone - Copy.png", fastweb: "/fastweb.png", windtre: "/windtre.png",
  wind3: "/windtre.png", iliad: "/iliad.png", tim: "/tim-logo-v2.png",
  s4: "/energy - Copy.png", energy: "/energy - Copy.png", sky: "/sky.png",
  dojo: "/dojo-round.png", verymobile: "/very-mobile.png", homobile: "/ho-mobile.png",
  kenamobile: "/kena-mobile-v2.png", kena: "/kena-mobile-v2.png",
};

function KpiBar({
  data,
  onFilter,
  activeFilter,
  storicoTotale,
  onApriStorico,
  brands,
  brandSel,
  setBrandSel,
}: {
  data: TrackingRow[];
  onFilter: (f: string | null) => void;
  activeFilter: string | null;
  brands: string[];
  brandSel: string[];
  setBrandSel: (v: string[]) => void;
  storicoTotale: number;
  onApriStorico: () => void;
}) {
  const totale = data.length;
  const nuovi = data.filter((r) => r.statoNegozio === "nuovo").length;
  const daLavorare = data.filter((r) => isDaLavorareRow(r) && !isMalusRow(r)).length;
  const problema = data.filter((r) => isAttenzioneRow(r) && !isMalusRow(r)).length;
  const nonConformi = data.filter((r) => r.statoAdmin === "non_conforme").length;
  const malusCount = data.filter((r) => isMalusRow(r)).length;
  const malusTotale = data.reduce((acc, r) => acc + calcolaMalus(r), 0);

  const cards = [
    { label: "Totale Monitorati", emoji: "📡", val: totale, color: "#94a3b8", filter: null as string | null },
    { label: "Nuovi", emoji: "🆕", val: nuovi, color: "#60a5fa", filter: "nuovo" },
    { label: "Da Lavorare", emoji: "⚡", val: daLavorare, color: "#eab308", filter: "__da_lavorare__" },
    { label: "Warning", emoji: "⚠️", val: problema, color: "#f97316", filter: "__attenzione__" },
    { label: "Malus", emoji: "🔴", val: malusCount, color: "#ef4444", filter: "__malus__" },
    { label: "Non Conforme", emoji: "🚫", val: nonConformi, color: "#a78bfa", filter: "__non_conforme__" },
  ];

  return (
    <div className="mb-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-2.5">
        {cards.map((c) => {
          const isActive = activeFilter === c.filter;
          return (
            <div
              key={c.label}
              role="button"
              tabIndex={0}
              onClick={() => onFilter(isActive ? null : c.filter)}
              onKeyDown={(e) => e.key === "Enter" && onFilter(isActive ? null : c.filter)}
              className="rounded-xl border p-3.5 text-center cursor-pointer select-none transition-all"
              style={{
                background: isActive ? c.color + "1f" : "rgba(255,255,255,0.03)",
                borderColor: isActive ? c.color : "rgba(255,255,255,0.08)",
                boxShadow: isActive ? `0 0 0 3px ${c.color}22` : "none",
              }}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-xl" style={{ opacity: .85 }}>{c.emoji}</span>
                <span className="text-2xl font-black" style={{ color: c.color }}>{c.val}</span>
                {/* maturati + storico A DESTRA del numero (Luca 03/08): card bassa come le altre */}
                {c.filter === "__malus__" && (
                  <span className="ml-1.5 pl-2 text-left" style={{ borderLeft: "1px solid rgba(255,255,255,0.10)" }}>
                    {malusTotale > 0 && <span className="block text-[10px] font-bold leading-tight" style={{ color: isActive ? "#fca5a5" : "#94a3b8" }}>€ {malusTotale.toFixed(0)} maturati</span>}
                    <span
                      role="button" tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onApriStorico(); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onApriStorico(); } }}
                      className="block text-[10px] font-bold underline decoration-dotted underline-offset-2 text-slate-400 hover:text-red-300 leading-tight"
                      title="Apri l'archivio storico dei malus"
                    >📂 {storicoTotale > 0 ? `€ ${Math.round(storicoTotale)}` : "Storico"} →</span>
                  </span>
                )}
              </div>
              <div className="text-[11px] mt-1 font-bold uppercase tracking-wider" style={{ color: isActive ? c.color : "#94a3b8" }}>
                {c.label}
              </div>
            </div>
          );
        })}
      </div>
      {/* BRAND in prima linea (Luca 03/08): SOLO LOGHI, griglia a N colonne
          uguali larga quanto la fila di card sopra. Tutti attivi all'ingresso;
          click = filtro esclusivo, riclick = di nuovo tutti (Ricerca Vendite). */}
      {brands.length > 0 && (
        <div className="grid gap-2.5 mb-2.5" style={{ gridTemplateColumns: `repeat(${brands.length}, minmax(0, 1fr))` }}>
          {brands.map((b) => {
            const color = TRK_BRAND_COLORS[trkBrandKey(b)] || "#94a3b8";
            const logo = TRK_BRAND_LOGOS[trkBrandKey(b)];
            const esclusivo = brandSel.length === 1 && brandSel[0] === b;
            const on = brandSel.length === 0 || brandSel.includes(b);
            return (
              <button key={b} type="button"
                onClick={() => setBrandSel(esclusivo ? [] : [b])}
                title={esclusivo ? b + " — filtro attivo, clicca per tornare a tutti" : "Mostra solo " + b}
                aria-label={b}
                className="rounded-xl border flex items-center justify-center transition-all cursor-pointer"
                style={{
                  height: 72,
                  borderColor: esclusivo ? color : "rgba(255,255,255,0.10)",
                  background: esclusivo ? color + "18" : "rgba(255,255,255,0.03)",
                  boxShadow: esclusivo ? `0 0 0 3px ${color}22` : "none",
                  opacity: on ? 1 : .35,
                  filter: on ? "none" : "grayscale(1)",
                }}>
                {logo ? (
                  <img src={logo} alt={b} style={{ maxHeight: 56, maxWidth: "92%", objectFit: "contain", display: "block" }} />
                ) : (
                  <span className="text-xs font-bold" style={{ color: on ? color : "#586174" }}>{b}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Segnalazione 77: "stato pratica" = lo stato di malus mostrato in tabella.
const STATI_PRATICA = ["🔴 Malus", "⚠️ Warning", "⚡ Da Lavorare", "— Nessuno"];
function statoPraticaDi(row: TrackingRow): string {
  if (isMalusRow(row)) return "🔴 Malus";
  if (isAttenzioneRow(row)) return "⚠️ Warning";
  if (isDaLavorareRow(row)) return "⚡ Da Lavorare";
  return "— Nessuno";
}

// ─── FilterBar ───────────────────────────────────────────────────────────────
function FilterBar({
  catSel,
  setCatSel,
  search,
  setSearch,
  statoSel,
  setStatoSel,
  periodoDA,
  setPeriodoDA,
  periodoA,
  setPeriodoA,
  brandSel,
  setBrandSel,
  venditoreSel,
  setVenditoreSel,
  venditori,
  utenti,
  utentiSel,
  setUtentiSel,
  negozioSel,
  setNegozioSel,
  negozi,
}: {
  catSel: string[];
  setCatSel: (v: string[]) => void;
  search: string;
  setSearch: (v: string) => void;
  statoSel: string[];
  setStatoSel: (v: string[]) => void;
  periodoDA: string;
  setPeriodoDA: (v: string) => void;
  periodoA: string;
  setPeriodoA: (v: string) => void;
  brandSel: string[];
  setBrandSel: (v: string[]) => void;
  venditoreSel: string;
  setVenditoreSel: (v: string) => void;
  venditori: string[];
  utenti: string[];
  utentiSel: string[];
  setUtentiSel: (v: string[]) => void;
  negozioSel: string;
  setNegozioSel: (v: string) => void;
  negozi: string[];
}) {
  const [statoOpen, setStatoOpen] = useState(false);
  const [utentiOpen, setUtentiOpen] = useState(false);

  const toggleCat = (id: string) => {
    if (catSel.includes(id)) {
      setCatSel(catSel.filter((c) => c !== id));
      setStatoSel([]);
    } else {
      setCatSel([...catSel, id]);
    }
  };

  const toggleBrand = (b: string) => {
    if (brandSel.includes(b)) setBrandSel(brandSel.filter((x) => x !== b));
    else setBrandSel([...brandSel, b]);
  };

  let pools: { id: string; label: string; color: string }[] = [];
  if (catSel.length === 0) {
    pools = [
      ...CATEGORIE.flatMap((cat) => getStatiNegozioPerCategoria(cat.id)),
    ];
  } else {
    pools = catSel.flatMap((cid) => getStatiNegozioPerCategoria(cid));
  }
  const seen = new Set<string>();
  const statiDisponibili = pools.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  const inputStyle =
    "bg-white/[0.05] border border-white/10 rounded-lg text-slate-100 text-[13px] py-2 px-3 outline-none box-border w-full";

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-xs text-slate-400 font-semibold mr-1">CATEGORIA</span>
        {CATEGORIE.map((cat) => {
          const sel = catSel.includes(cat.id);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => toggleCat(cat.id)}
              className="rounded-full px-3.5 py-1 text-xs font-semibold cursor-pointer border transition-all"
              style={{
                borderColor: sel ? cat.color : "rgba(255,255,255,0.10)",
                background: sel ? cat.color + "33" : "transparent",
                color: sel ? cat.color : "#94a3b8",
              }}
            >
              {cat.label}
            </button>
          );
        })}
        {catSel.length > 0 && (
          <button
            type="button"
            onClick={() => { setCatSel([]); setStatoSel([]); }}
            className="rounded-full px-3 py-1 text-[11px] cursor-pointer border border-white/15 bg-transparent text-slate-500"
          >
            ✕ Deseleziona tutto
          </button>
        )}
      </div>

      {/* Filtro NEGOZIO (richiesta Luca 28/07): visibile dall'amministrativa in
          su (chi vede tutti i negozi); stessi chip cliccabili degli altri filtri. */}
      {negozi.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs text-slate-400 font-semibold mr-1">NEGOZIO</span>
          <button
            type="button"
            onClick={() => setNegozioSel("")}
            className="rounded-full px-3.5 py-1 text-xs font-semibold cursor-pointer border transition-all"
            style={{
              borderColor: negozioSel === "" ? "#6366f1" : "rgba(255,255,255,0.10)",
              background: negozioSel === "" ? "#6366f133" : "transparent",
              color: negozioSel === "" ? "#818cf8" : "#94a3b8",
            }}
          >
            Tutti
          </button>
          {negozi.map((n) => {
            const sel = negozioSel === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setNegozioSel(sel ? "" : n)}
                className="rounded-full px-3.5 py-1 text-xs font-semibold cursor-pointer border transition-all"
                style={{
                  borderColor: sel ? "#6366f1" : "rgba(255,255,255,0.10)",
                  background: sel ? "#6366f133" : "transparent",
                  color: sel ? "#818cf8" : "#94a3b8",
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
      )}
      {/* Segnalazione 54: filtro Venditore come ultimo, con pulsanti cliccabili
          (come Categoria e Brand) invece della tendina. "Tutti" + i nomi dei
          collaboratori del negozio, manager compreso. Visibile allo store manager. */}
      {venditori.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs text-slate-400 font-semibold mr-1">VENDITORE</span>
          <button
            type="button"
            onClick={() => setVenditoreSel("")}
            className="rounded-full px-3.5 py-1 text-xs font-semibold cursor-pointer border transition-all"
            style={{
              borderColor: venditoreSel === "" ? "#6366f1" : "rgba(255,255,255,0.10)",
              background: venditoreSel === "" ? "#6366f133" : "transparent",
              color: venditoreSel === "" ? "#818cf8" : "#94a3b8",
            }}
          >
            Tutti
          </button>
          {venditori.map((n) => {
            const sel = venditoreSel === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setVenditoreSel(sel ? "" : n)}
                className="rounded-full px-3.5 py-1 text-xs font-semibold cursor-pointer border transition-all"
                style={{
                  borderColor: sel ? "#6366f1" : "rgba(255,255,255,0.10)",
                  background: sel ? "#6366f133" : "transparent",
                  color: sel ? "#818cf8" : "#94a3b8",
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2.5 items-center flex-wrap">
        <div className="relative flex-[1.5] min-w-[180px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per nominativo, n° contratto, negozio…"
            className={inputStyle + " pl-9"}
          />
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <button
            type="button"
            onClick={() => setStatoOpen(!statoOpen)}
            className={inputStyle + " text-left flex items-center justify-between cursor-pointer"}
          >
            {/* Segnalazione 77: questa tendina elenca gli ESITI NEGOZIO, non gli
                stati pratica: rinominata di conseguenza. */}
            <span className={statoSel.length === 0 ? "text-slate-500" : "text-slate-100"}>
              {statoSel.length === 0
                ? "Tutti gli esiti"
                : statoSel.length === 1
                  ? (statiDisponibili.find((s) => s.id === statoSel[0])?.label ?? statoSel[0])
                  : `${statoSel.length} esiti selezionati`}
            </span>
            <span className="text-slate-500 text-[10px] ml-2">{statoOpen ? "▲" : "▼"}</span>
          </button>
          {statoOpen && (
            <div
              className="absolute top-full left-0 right-0 mt-1 bg-white/[0.03] border border-white/10 rounded-lg z-[999] shadow-xl max-h-60 overflow-y-auto"
              style={{ boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}
            >
              <div className="flex items-center justify-between py-2 px-3 border-b border-white/10">
                <span className="text-[11px] text-slate-500 font-semibold">
                  {statoSel.length > 0 ? `${statoSel.length} selezionati` : "Seleziona esiti"}
                </span>
                {statoSel.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setStatoSel([]); }}
                    className="bg-transparent border-none text-slate-500 text-[11px] cursor-pointer p-0"
                  >
                    ✕ Tutti
                  </button>
                )}
              </div>
              {statiDisponibili.map((s) => {
                const sel = statoSel.includes(s.id);
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (sel) setStatoSel(statoSel.filter((x) => x !== s.id));
                      else setStatoSel([...statoSel, s.id]);
                    }}
                    className={`flex items-center gap-2.5 py-1.5 px-3 cursor-pointer ${sel ? "bg-indigo-900/40" : ""}`}
                  >
                    <div
                      className="w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0"
                      style={{ borderColor: sel ? s.color : "#475569", background: sel ? s.color : "transparent" }}
                    >
                      {sel && <span className="text-black text-[9px] font-black">✓</span>}
                    </div>
                    <span className="text-[13px]" style={{ color: s.color }}>{s.label}</span>
                  </div>
                );
              })}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setStatoOpen(false)}
                className="py-2 px-3 border-t border-white/10 text-center text-[11px] text-slate-500 cursor-pointer"
              >
                Chiudi ▲
              </div>
            </div>
          )}
        </div>
        {/* Segnalazione 93: rimosso il filtro "Tutti gli stati" (era un doppione); resta "Tutti gli esiti". */}
        {/* Filtro UTENTE multi-selezione (Luca 03/08): amministrazione in su.
            Le opzioni vengono dalle pratiche VISIBILI col negozio selezionato:
            filtro un punto vendita e vedo solo chi ci ha pratiche dentro. */}
        {utenti.length > 0 && (
          <div className="relative flex-1 min-w-[180px]">
            <button
              type="button"
              onClick={() => setUtentiOpen(!utentiOpen)}
              className={inputStyle + " text-left flex items-center justify-between cursor-pointer"}
            >
              <span className={utentiSel.length === 0 ? "text-slate-500" : "text-slate-100"}>
                {utentiSel.length === 0
                  ? "👥 Tutti gli utenti"
                  : utentiSel.length === 1
                    ? "👤 " + utentiSel[0]
                    : `👥 ${utentiSel.length} utenti selezionati`}
              </span>
              <span className="text-slate-500 text-[10px] ml-2">{utentiOpen ? "▲" : "▼"}</span>
            </button>
            {utentiOpen && (
              <div
                className="absolute top-full left-0 right-0 mt-1 bg-white/[0.03] border border-white/10 rounded-lg z-[999] shadow-xl max-h-60 overflow-y-auto"
                style={{ boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}
              >
                <div className="flex items-center justify-between py-2 px-3 border-b border-white/10">
                  <span className="text-[11px] text-slate-500 font-semibold">
                    {utentiSel.length > 0 ? `${utentiSel.length} selezionati` : "Seleziona utenti"}
                  </span>
                  {utentiSel.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setUtentiSel([]); }}
                      className="bg-transparent border-none text-slate-500 text-[11px] cursor-pointer p-0"
                    >
                      ✕ Tutti
                    </button>
                  )}
                </div>
                {utenti.map((n) => {
                  const sel = utentiSel.includes(n);
                  return (
                    <div
                      key={n}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (sel) setUtentiSel(utentiSel.filter((x) => x !== n));
                        else setUtentiSel([...utentiSel, n]);
                      }}
                      className={`flex items-center gap-2.5 py-1.5 px-3 cursor-pointer ${sel ? "bg-indigo-900/40" : ""}`}
                    >
                      <div
                        className="w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: sel ? "#818cf8" : "#475569", background: sel ? "#818cf8" : "transparent" }}
                      >
                        {sel && <span className="text-black text-[9px] font-black">✓</span>}
                      </div>
                      <span className="text-[13px]" style={{ color: sel ? "#c7d2fe" : "#cbd5e1" }}>{n}</span>
                    </div>
                  );
                })}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setUtentiOpen(false)}
                  className="py-2 px-3 border-t border-white/10 text-center text-[11px] text-slate-500 cursor-pointer"
                >
                  Chiudi ▲
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-slate-500 font-semibold whitespace-nowrap">PERIODO</span>
          <input type="date" value={periodoDA} onChange={(e) => setPeriodoDA(e.target.value)} className={inputStyle + " w-[138px]"} />
          <span className="text-slate-500 text-xs">→</span>
          <input type="date" value={periodoA} onChange={(e) => setPeriodoA(e.target.value)} className={inputStyle + " w-[138px]"} />
          {(periodoDA || periodoA) && (
            <button
              type="button"
              onClick={() => { setPeriodoDA(""); setPeriodoA(""); }}
              className="py-1 px-2.5 rounded-md text-[11px] cursor-pointer border border-white/15 bg-transparent text-slate-500 whitespace-nowrap"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tabella ──────────────────────────────────────────────────────────────────
function Tabella({ rows, onSelect, canDelegate = false, members = [], onBulkDelegate, archivio, canDelete = false, onAskDelete }: {
  rows: TrackingRow[];
  onSelect: (row: TrackingRow) => void;
  canDelegate?: boolean;
  members?: { id: string; full_name: string }[];
  onBulkDelegate?: (ids: string[], toId: string) => void;
  archivio?: Map<string, EpisodioMalus[]>;
  canDelete?: boolean;
  onAskDelete?: (row: TrackingRow) => void;
}) {
  const thStyle =
    "py-2.5 px-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-white/10 whitespace-nowrap";
  // Selezione multipla per delega rapida dalla dashboard.
  const [checked, setChecked] = useState<string[]>([]);
  const [bulkTo, setBulkTo] = useState("");
  const toggle = (id: string) => setChecked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const allOnPage = rows.map((r) => r.id);
  const allChecked = checked.length > 0 && allOnPage.every((id) => checked.includes(id));

  if (rows.length === 0) {
    return (
      <div className="bg-white/[0.03] border border-white/10 rounded-xl py-12 px-12 text-center text-slate-500">
        Nessuna pratica trovata con i filtri selezionati.
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
      {/* Barra delega rapida: compare quando selezioni una o piu' pratiche */}
      {canDelegate && checked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 py-2.5 px-3.5 bg-indigo-900/40 border-b border-indigo-700">
          <span className="text-[13px] font-bold text-indigo-200">{checked.length} pratic{checked.length === 1 ? "a" : "he"} selezionat{checked.length === 1 ? "a" : "e"}</span>
          <select value={bulkTo} onChange={(e) => setBulkTo(e.target.value)}
            className="bg-white/[0.05] border border-white/15 rounded-lg text-slate-100 text-[13px] p-1.5 outline-none">
            <option value="">— Delega a… —</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
          <button type="button" disabled={!bulkTo}
            onClick={() => { onBulkDelegate?.(checked, bulkTo); setChecked([]); setBulkTo(""); }}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[13px] font-bold disabled:opacity-40">
            Delega
          </button>
          <button type="button" onClick={() => setChecked([])} className="px-3 py-1.5 rounded-lg border border-white/15 text-slate-300 text-[13px]">Annulla</button>
          <span className="text-[11px] text-slate-400 ml-auto">Solo collaboratori del tuo punto vendita</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-white/[0.04]">
              {canDelegate && (
                <th className={thStyle + " w-8"}>
                  <input type="checkbox" checked={allChecked}
                    onChange={() => setChecked(allChecked ? [] : allOnPage)} title="Seleziona tutte" />
                </th>
              )}
              <th className={thStyle}>CATEGORIA</th>
              <th className={thStyle}>BRAND</th>
              <th className={thStyle}>NOMINATIVO</th>
              <th className={thStyle}>NEGOZIO</th>
              <th className={thStyle}>VENDITORE</th>
              <th className={thStyle}>DATA</th>
              <th className={thStyle}>ESITO NEGOZIO</th>
              <th className={thStyle}>ESITO ADMIN</th>
              <th className={thStyle + " text-center"}>STATO PRATICA</th>
              <th className={thStyle + " text-center"}>MALUS</th>
              {canDelete && <th className={thStyle + " w-10 text-center"}>🗑</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              // RIGHE SFUMATE (Luca 03/08): la fase colora la riga con un
              // gradiente che sfuma da sinistra + barretta colore — via il
              // monocolore da foglio Excel
              const fase = isMalusRow(row) ? "malus" : isAttenzioneRow(row) ? "warning" : isDaLavorareRow(row) ? "lavorare" : "";
              const cFase = fase === "malus" ? "#ef4444" : fase === "warning" ? "#f97316" : fase === "lavorare" ? "#eab308" : "";
              const bg = fase
                ? `linear-gradient(90deg, ${cFase}24, ${cFase}08 45%, transparent 75%)`
                : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)";
              return (
                <tr
                  key={row.rowKey || row.id}
                  className="cursor-pointer transition-all hover:!bg-indigo-900/30"
                  style={{ background: bg, boxShadow: fase ? `inset 3px 0 0 ${cFase}` : "none" }}
                  onClick={() => onSelect(row)}
                >
                  {canDelegate && (
                    <td className="py-2.5 px-3.5 border-b border-white/5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked.includes(row.id)} onChange={() => toggle(row.id)} />
                    </td>
                  )}
                  <td className="py-2.5 px-3.5 border-b border-white/5">
                    <CatBadge id={row.categoria} />
                  </td>
                  <td className="py-2.5 px-3.5 border-b border-white/5 text-slate-100 text-[13px] font-semibold">{row.brand}</td>
                  <td className="py-2.5 px-3.5 border-b border-white/5 text-slate-200 text-[13px]">{row.nominativo}</td>
                  <td className="py-2.5 px-3.5 border-b border-white/5 text-slate-400 text-xs">{row.negozio}</td>
                  <td className="py-2.5 px-3.5 border-b border-white/5 text-slate-400 text-xs">{row.venditore}</td>
                  <td className="py-2.5 px-3.5 border-b border-white/5 text-slate-500 text-xs">{row.dataInserimento}</td>
                  <td className="py-2.5 px-3.5 border-b border-white/5">
                    <StatoBadge id={row.statoNegozio} set="negozio" />
                  </td>
                  <td className="py-2.5 px-3.5 border-b border-white/5">
                    <StatoBadge id={row.statoAdmin} set="admin" />
                  </td>
                  <td className="py-2.5 px-3.5 border-b border-white/5 text-center">
                    {isMalusRow(row) ? (
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-red-950 border border-red-600 text-red-200">
                        🔴 Malus
                      </span>
                    ) : isAttenzioneRow(row) ? (
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-orange-950 border border-orange-500 text-orange-200">
                        ⚠️ Warning
                      </span>
                    ) : isDaLavorareRow(row) ? (
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-amber-950 border border-amber-500 text-amber-200">
                        ⚡ Da Lavorare
                      </span>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 border-b border-white/5 text-center">
                    {(() => {
                      // Oltre al malus che sta maturando ADESSO, la colonna dice
                      // quanto la pratica ha gia' generato in passato (episodi
                      // archiviati in malus_storico): sanare non cancella.
                      const chiusi = (archivio?.get(`${row.id}#${row.categoria}`) || []).filter((e) => e.data_fine !== null);
                      const totStorico = chiusi.reduce((a, e) => a + (Number(e.importo) || 0), 0);
                      if (isMalusRow(row)) {
                        return (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <div className="bg-red-950 border border-red-600 rounded-md px-2.5 py-0.5 text-xs font-bold text-red-200">
                              € {calcolaMalus(row)}
                            </div>
                            <div className="text-[10px] text-slate-500">({MALUS_IMPORTO[row.categoria] ?? 0}€/gg)</div>
                            {totStorico > 0 && (
                              <div className="text-[10px] text-slate-500">+ € {Math.round(totStorico)} storico</div>
                            )}
                          </div>
                        );
                      }
                      if (totStorico > 0) {
                        return (
                          <div className="inline-flex flex-col items-center gap-0.5" title="Malus generato in passato, archiviato">
                            <div className="bg-white/[0.05] border border-white/15 rounded-md px-2.5 py-0.5 text-[11px] font-bold text-slate-400">
                              € {Math.round(totStorico)} storico
                            </div>
                          </div>
                        );
                      }
                      return <span className="text-slate-800 text-xs">—</span>;
                    })()}
                  </td>
                  {canDelete && (
                    <td className="py-2.5 px-3.5 border-b border-white/5 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onAskDelete?.(row)}
                        title="Elimina pratica…"
                        className="bg-transparent border border-white/10 rounded-lg px-2 py-1 text-sm cursor-pointer hover:border-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        🗑️
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="py-2.5 px-4 border-t border-white/10 text-slate-500 text-xs flex items-center gap-4">
        <span>{rows.length} pratiche visualizzate</span>
        {(() => {
          const totMalus = rows.reduce((acc, r) => acc + calcolaMalus(r), 0);
          const countMalus = rows.filter((r) => isMalusRow(r)).length;
          if (countMalus === 0) return null;
          return (
            <span
              className="ml-4 py-0.5 px-2.5 bg-red-950 border border-red-600 rounded-md text-red-200 text-[11px] font-bold"
            >
              {countMalus} in Malus — € {totMalus} maturati
            </span>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
function Drawer({
  row,
  onClose,
  onUpdate,
  members = [],
  canDelegate = false,
  canEditAdmin = false,
  onDelegate,
  delegatoNome = null,
  episodiMalus = [],
}: {
  row: TrackingRow;
  onClose: () => void;
  onUpdate: (updated: TrackingRow) => void;
  members?: { id: string; full_name: string }[];
  canDelegate?: boolean;
  canEditAdmin?: boolean;
  onDelegate?: (rowId: string, toId: string | null) => void;
  delegatoNome?: string | null;
  episodiMalus?: EpisodioMalus[];
}) {
  // nome VERO di chi modifica nello storico (Luca 02/08): niente piu'
  // "Venditore"/"Amministrazione" generici
  const { user: utenteCorrente } = useAuth();
  const nomeUtente = utenteCorrente?.name || "—";
  const [notaNegozio, setNotaNegozio] = useState("");
  const [notaAdmin, setNotaAdmin] = useState("");
  const [editStatoN, setEditStatoN] = useState(row.statoNegozio);
  const [editStatoA, setEditStatoA] = useState(row.statoAdmin);
  const [activeTab, setActiveTab] = useState<"negozio" | "admin" | "storico">("negozio");
  // Se non sei amministrazione non puoi restare sul tab Esito Admin.
  useEffect(() => { if (activeTab === "admin" && !canEditAdmin) setActiveTab("negozio"); }, [activeTab, canEditAdmin]);
  const [followup, setFollowup] = useState<FollowUpItem[]>(
    row.followup && row.followup.length > 0
      ? row.followup
      : [
          { label: "Follow-up 1", data: "", esito: "", note: "" },
          { label: "Follow-up 2", data: "", esito: "", note: "" },
          { label: "Follow-up 3", data: "", esito: "", note: "" },
        ]
  );

  const updateFollowup = (idx: number, field: keyof FollowUpItem, val: string) => {
    setFollowup((prev) =>
      prev.map((f, i) => (i !== idx ? f : { ...f, [field]: val }))
    );
  };

  const salva = (origine: "negozio" | "admin") => {
    const oggi = new Date().toLocaleDateString("it-IT");
    const nuovaStoria = [...row.storia];

    if (origine === "negozio") {
      if (editStatoN !== row.statoNegozio) {
        nuovaStoria.push({
          data: oggi,
          tipo: "stato_negozio",
          testo: "Esito negozio aggiornato: " + getStatoN(editStatoN).label,
          utente: nomeUtente,
          ruolo: "negozio",
        });
      }
      if (notaNegozio.trim()) {
        nuovaStoria.push({
          data: oggi,
          tipo: "nota_negozio",
          testo: notaNegozio.trim(),
          utente: nomeUtente,
          ruolo: "negozio",
        });
      }
      onUpdate({ ...row, statoNegozio: editStatoN, storia: nuovaStoria });
      setNotaNegozio("");
    } else {
      if (editStatoA !== row.statoAdmin) {
        nuovaStoria.push({
          data: oggi,
          tipo: "stato_admin",
          testo: "Esito admin aggiornato: " + getStatoA(editStatoA).label,
          utente: nomeUtente,
          ruolo: "admin",
        });
      }
      if (notaAdmin.trim()) {
        nuovaStoria.push({
          data: oggi,
          tipo: "nota_admin",
          testo: notaAdmin.trim(),
          utente: nomeUtente,
          ruolo: "admin",
        });
      }
      onUpdate({ ...row, statoAdmin: editStatoA, storia: nuovaStoria });
      setNotaAdmin("");
    }
  };

  const labelStyle = "text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-1";
  const valStyle = "text-[13px] text-slate-200";
  const panelStyle =
    "bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-3.5";

  const tipoColor = (tipo: string) => {
    if (tipo === "stato_admin" || tipo === "nota_admin") return "#a78bfa";
    if (tipo === "stato_negozio") return "#6366f1";
    if (tipo === "nota_negozio") return "#f59e0b";
    return "#22c55e";
  };
  const tipoLabel = (tipo: string) => {
    if (tipo === "stato_admin") return "Admin";
    if (tipo === "nota_admin") return "Admin";
    if (tipo === "stato_negozio") return "Negozio";
    if (tipo === "nota_negozio") return "Negozio";
    return "Sistema";
  };

  const statiAdmin = row.categoria === "finanziamento" ? STATI_ADMIN_FINANZIAMENTO : STATI_ADMIN;

  return (
    <div
      className="fixed top-0 right-0 bottom-0 w-full max-w-[520px] flex flex-col z-[1000] border-l border-slate-700"
      style={{ background: "#0f172a", boxShadow: "-8px 0 32px rgba(0,0,0,.5)" }}
    >
      <div className="pt-5 px-6 pb-0 border-b border-white/5 flex-shrink-0">
        <div className="flex items-start justify-between mb-3.5">
          <div>
            <div className="text-base font-bold text-slate-100 mb-1.5">{row.nominativo}</div>
            <div className="flex gap-2 items-center flex-wrap">
              <CatBadge id={row.categoria} />
              <span className="text-xs text-slate-400 font-semibold">{row.brand}</span>
              <span className="text-[11px] text-slate-500">{row.numContratto}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border border-slate-700 rounded-lg text-slate-400 text-lg cursor-pointer py-1 px-2.5 leading-none flex-shrink-0"
          >
            ✕
          </button>
        </div>
        <div className="flex gap-1.5 items-center py-2.5">
          <span className="text-[11px] text-slate-500 mr-1">Negozio:</span>
          <StatoBadge id={row.statoNegozio} set="negozio" />
          <span className="text-[11px] text-slate-500 mx-1">| Admin:</span>
          <StatoBadge id={row.statoAdmin} set="admin" />
        </div>
        {/* Delega verifica: NON fa parte della sezione admin — e' una funzione
            dallo store manager in su, quindi sta fuori dai tab. */}
        {canDelegate && (
          <div className="mt-3.5 p-3 rounded-lg border border-slate-700 bg-black/25">
            <div className={labelStyle + " mb-2"}>Delega verifica a</div>
            {row.delegated_to && (
              <div className="mb-2 text-[12px] text-emerald-400">Attualmente delegata a <b>{delegatoNome || "collaboratore"}</b></div>
            )}
            <select value={row.delegated_to || ""} onChange={(e) => onDelegate?.(row.id, e.target.value || null)}
              className="w-full bg-white/[0.05] border border-white/10 rounded-lg text-slate-100 text-[13px] p-2 outline-none">
              <option value="">— Nessuna delega —</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
            <p className="mt-1.5 text-[11px] text-slate-500">Solo collaboratori del tuo punto vendita. Il delegato la trova con il filtro “Delegate a me”.</p>
          </div>
        )}
        <div className="flex gap-0 mt-3.5">
          {(["negozio", "admin", "storico"] as const).filter((t) => t !== "admin" || canEditAdmin).map((tab) => {
            const labels = { negozio: "Esito Negozio", admin: "Esito Admin", storico: "Storico" };
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="py-2 px-4 bg-transparent border-none border-b-2 cursor-pointer transition-all text-[13px] font-normal"
                style={{
                  borderBottomColor: active ? "#6366f1" : "transparent",
                  color: active ? "#f1f5f9" : "#475569",
                  fontWeight: active ? 700 : 400,
                }}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 px-6">
        {activeTab === "negozio" && (
          <div>
            <div className={panelStyle + " grid grid-cols-2 gap-3.5"}>
              <div><div className={labelStyle}>N° CONTRATTO</div><div className={valStyle + " font-mono"}>{row.numContratto}</div></div>
              <div><div className={labelStyle}>N° ATTIVAZIONE</div><div className={valStyle + " font-mono"}>{row.numAttivazione}</div></div>
              <div><div className={labelStyle}>NEGOZIO</div><div className={valStyle}>{row.negozio}</div></div>
              <div><div className={labelStyle}>VENDITORE</div><div className={valStyle}>{row.venditore}</div></div>
              <div><div className={labelStyle}>TELEFONO</div><div className={valStyle}>{row.telefono}</div></div>
              <div><div className={labelStyle}>DATA INSERIMENTO</div><div className={valStyle}>{row.dataInserimento}</div></div>
              <div className="col-span-2"><div className={labelStyle}>C.F. / P.IVA</div><div className={valStyle + " font-mono"}>{row.cf}</div></div>
            </div>
            {row.categoria === "fisso" && (row.gnp || row.numFissoProvvisorio || row.numFissoDefinitivo) && (
              <div className={panelStyle + " border-indigo-500 bg-black/25"}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                  <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Portabilità numero fisso (GNP)</div>
                </div>
                <div className="grid grid-cols-2 gap-3.5">
                  <div><div className={labelStyle}>N. FISSO PROVVISORIO</div><div className={valStyle + " font-mono"}>{row.numFissoProvvisorio ?? "—"}</div></div>
                  <div><div className={labelStyle}>N. FISSO DEFINITIVO</div><div className={valStyle + " font-mono"}>{row.numFissoDefinitivo ?? "—"}</div></div>
                </div>
              </div>
            )}
            {row.categoria === "energia" && (
              <div className={panelStyle + " border-green-700 bg-black/25"}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <div className="text-xs font-bold text-green-500 uppercase tracking-wider">Dati energia</div>
                </div>
                <div className="grid grid-cols-2 gap-3.5">
                  {/* Segnalazione 65: tipo fornitura e codice inserimento. */}
                  <div><div className={labelStyle}>Tipo fornitura</div><div className={valStyle}>
                    {detVal(row.dettagliFull, "Tipo Fornitura", "tipoEnergia", "Tipologia")
                      ?? (detVal(row.dettagliFull, "pdr", "PDR") ? "Gas" : detVal(row.dettagliFull, "pod", "POD") ? "Luce" : "—")}
                  </div></div>
                  <div><div className={labelStyle}>Codice inserimento</div><div className={valStyle + " font-mono"}>{codiceInserimento(row.dettagliFull) ?? "—"}</div></div>
                  {detVal(row.dettagliFull, "pod", "POD") && <div className="col-span-2"><div className={labelStyle}>POD</div><div className={valStyle + " font-mono"}>{detVal(row.dettagliFull, "pod", "POD")}</div></div>}
                  {detVal(row.dettagliFull, "pdr", "PDR") && <div className="col-span-2"><div className={labelStyle}>PDR</div><div className={valStyle + " font-mono"}>{detVal(row.dettagliFull, "pdr", "PDR")}</div></div>}
                </div>
              </div>
            )}
            {row.categoria === "finanziamento" && (
              <div className={panelStyle + " border-amber-700 bg-black/25"}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">Dati finanziamento</div>
                </div>
                <div className="grid grid-cols-2 gap-3.5">
                  {/* Segnalazione 48: Tipo = Tipo TNP o Tipo CB, Codice negozio =
                      codice inserimento, Modello = Terminali TNP o Terminali CB. */}
                  <div><div className={labelStyle}>Tipo</div><div className={valStyle}>{detVal(row.dettagliFull, "Tipo TNP", "Tipo CB") ?? "—"}</div></div>
                  <div><div className={labelStyle}>Codice inserimento</div><div className={valStyle + " font-mono"}>{codiceInserimento(row.dettagliFull) ?? "—"}</div></div>
                  <div className="col-span-2"><div className={labelStyle}>Modello telefono</div><div className={valStyle}>
                    {detVal(row.dettagliFull, "Terminali TNP", "Terminali CB", "Terminale", "Term. CB", "Modello") ?? "—"}
                  </div></div>
                  {detVal(row.dettagliFull, "IMEI TNP", "IMEI CB", "IMEI") && (
                    <div className="col-span-2"><div className={labelStyle}>IMEI</div><div className={valStyle + " font-mono"}>{detVal(row.dettagliFull, "IMEI TNP", "IMEI CB", "IMEI")}</div></div>
                  )}
                </div>
              </div>
            )}
            {/* Segnalazione 43: "dettagli contratto mancanti". I riquadri qui sopra
                cercano chiavi come numFissoProvvisorio o modelloTelefono, che nei
                contratti reali non esistono: i dettagli sono salvati con le
                etichette del modulo ("ICCID", "Offerta", "Cod.Ins.", "IMEI"...).
                Questo blocco mostra l'intero contenuto, quindi non manca nulla
                qualunque sia il brand. */}
            {(() => {
              const det = row.dettagliFull || {};
              const tutte = Object.entries(det).filter(([k]) => !k.startsWith("_"));
              const voci = tutte.filter(([, v]) => v === null || typeof v !== "object");
              const annidate = tutte.filter(([, v]) => v !== null && typeof v === "object");
              if (tutte.length === 0) return null;
              return (
                <div className={panelStyle}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                    <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Dettagli registrazione</div>
                    <div className="ml-auto text-[10px] text-slate-500">{tutte.length} campi</div>
                    {row.finanziato && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40">
                        Finanziato
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3.5">
                    {/* Segnalazione 70: il codice inserimento deve comparire sempre,
                        anche quando la chiave ha un nome diverso per prodotto. */}
                    <div className="col-span-2">
                      <div className={labelStyle}>Cod.Ins. (codice inserimento)</div>
                      <div className={valStyle + " font-mono"}>{codiceInserimento(det as Record<string, unknown>) ?? "—"}</div>
                    </div>
                    {voci.map(([k, v]) => (
                      <div key={k}>
                        <div className={labelStyle}>{k}</div>
                        <div className={valStyle + " break-words"}>
                          {v === null || v === undefined || v === "" ? "—"
                            : typeof v === "boolean" ? (v ? "Sì" : "No") : String(v)}
                        </div>
                      </div>
                    ))}
                    {annidate.map(([k, v]) => (
                      <div key={k} className="col-span-2">
                        <div className={labelStyle}>{k}</div>
                        <pre className="text-[11px] text-slate-300 bg-black/30 rounded-lg p-2 overflow-x-auto">{JSON.stringify(v, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div className={panelStyle}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Esito negozio</div>
              </div>
              <div className="flex flex-wrap gap-2 mb-3.5">
                {getStatiNegozioPerCategoria(row.categoria).map((s) => {
                  const sel = editStatoN === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setEditStatoN(s.id)}
                      className="rounded-full py-1.5 px-3.5 text-xs font-semibold cursor-pointer border transition-all"
                      style={{
                        borderColor: sel ? s.color : "rgba(255,255,255,0.10)",
                        background: sel ? s.color + "33" : "transparent",
                        color: sel ? s.color : "#64748b",
                      }}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              {row.categoria === "piva" && editStatoN === "cliente_irreperibile" && (
                <div className="bg-purple-950/50 border border-purple-600 rounded-xl p-3.5 mb-3.5">
                  <div className="text-[11px] font-bold text-purple-300 uppercase tracking-wider mb-3">Tentativi di contatto — Cliente irreperibile</div>
                  {followup.map((fu, idx) => (
                    <div key={idx} className="bg-slate-900 rounded-lg p-2.5 mb-2 border border-purple-500/30">
                      <div className="text-[11px] font-bold text-purple-400 mb-2">{fu.label}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><div className="text-[10px] text-slate-500 mb-0.5">Data</div><input type="date" value={fu.data} onChange={(e) => updateFollowup(idx, "data", e.target.value)} className="w-full bg-white/[0.03] border border-white/10 rounded-md text-slate-100 text-xs py-1 px-2 outline-none" /></div>
                        <div><div className="text-[10px] text-slate-500 mb-0.5">Esito</div><input type="text" value={fu.esito} onChange={(e) => updateFollowup(idx, "esito", e.target.value)} placeholder="es. Nessuna risposta" className="w-full bg-white/[0.03] border border-white/10 rounded-md text-slate-100 text-xs py-1 px-2 outline-none" /></div>
                        <div className="col-span-2"><div className="text-[10px] text-slate-500 mb-0.5">Note</div><input type="text" value={fu.note} onChange={(e) => updateFollowup(idx, "note", e.target.value)} placeholder="es. Chiamato alle 10:30" className="w-full bg-white/[0.03] border border-white/10 rounded-md text-slate-100 text-xs py-1 px-2 outline-none" /></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                value={notaNegozio}
                onChange={(e) => setNotaNegozio(e.target.value)}
                placeholder="Nota negozio (es: cliente contattato…)"
                className="w-full min-h-[68px] bg-white/[0.05] border border-white/10 rounded-lg text-slate-100 text-[13px] p-2.5 resize-y outline-none box-border mb-2.5"
              />
              <button
                type="button"
                onClick={() => salva("negozio")}
                className="w-full bg-indigo-600 border-none rounded-lg text-white text-[13px] font-semibold py-2 px-5 cursor-pointer"
              >
                Salva esito negozio
              </button>
            </div>
          </div>
        )}

        {activeTab === "admin" && canEditAdmin && (
          <div className={panelStyle}>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Verifica amministrazione</div>
            </div>
            <p className="text-xs text-slate-500 mb-3.5">Conferma o rettifica l&apos;esito. Visibile a tutte le parti.</p>
            <div className="mb-1.5">
              <div className={labelStyle + " mb-2"}>Esito corrente negozio</div>
              <StatoBadge id={row.statoNegozio} set="negozio" />
            </div>
            <div className="my-3.5">
              <div className={labelStyle + " mb-2"}>Esito amministrazione</div>
              <div className="flex flex-wrap gap-2 mb-3.5">
                {statiAdmin.map((s) => {
                  const sel = editStatoA === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setEditStatoA(s.id)}
                      className="rounded-full py-1.5 px-3.5 text-xs font-semibold cursor-pointer border transition-all"
                      style={{
                        borderColor: sel ? s.color : "rgba(255,255,255,0.10)",
                        background: sel ? s.color + "33" : "transparent",
                        color: sel ? s.color : "#64748b",
                      }}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <textarea
              value={notaAdmin}
              onChange={(e) => setNotaAdmin(e.target.value)}
              placeholder="Nota amministrazione…"
              className="w-full min-h-[68px] bg-white/[0.05] border border-white/10 rounded-lg text-slate-100 text-[13px] p-2.5 resize-y outline-none box-border mb-2.5"
            />
            <button
              type="button"
              onClick={() => salva("admin")}
              className="w-full bg-purple-600 border-none rounded-lg text-white text-[13px] font-semibold py-2 px-5 cursor-pointer"
            >
              Salva verifica amministrazione
            </button>

          </div>
        )}

        {activeTab === "storico" && (
          <div>
            {/* STORICO MALUS (30/07): sanare la pratica ferma la maturazione ma
                NON cancella il generato — gli episodi restano archiviati in
                malus_storico. Sostituisce il vecchio blocco che diceva
                "il malus si azzera quando la pratica viene aggiornata". */}
            {(() => {
              const importoLive = isMalusRow(row) ? calcolaMalus(row) : 0;
              const aperto = episodiMalus.find((e) => e.data_fine === null) || null;
              const chiusi = episodiMalus.filter((e) => e.data_fine !== null);
              const totGenerato = chiusi.reduce((a, e) => a + (Number(e.importo) || 0), 0) + importoLive;
              if (totGenerato <= 0) return null;
              const euroGg = MALUS_IMPORTO[row.categoria] ?? 0;
              return (
                <div className="bg-red-950/50 border border-red-600 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-red-600 flex-shrink-0" />
                    <div className="text-xs font-bold text-red-200 uppercase tracking-wider">Storico malus</div>
                    <div className="ml-auto bg-red-950 border border-red-600 rounded-md py-0.5 px-3 text-sm font-black text-red-200">
                      € {Math.round(totGenerato)} generati
                    </div>
                  </div>
                  {importoLive > 0 && (
                    <div className="grid grid-cols-3 gap-2.5 mb-3">
                      <div className="bg-red-950/50 rounded-lg p-2.5">
                        <div className="text-[10px] text-red-500 font-bold uppercase tracking-wider mb-1">Entrata in malus</div>
                        <div className="text-[13px] font-bold text-red-200">{aperto ? formatDataIt(aperto.data_inizio) : "—"}</div>
                      </div>
                      <div className="bg-red-950/50 rounded-lg p-2.5">
                        <div className="text-[10px] text-red-500 font-bold uppercase tracking-wider mb-1">Giorni in malus</div>
                        <div className="text-[13px] font-bold text-red-200">{euroGg > 0 ? Math.max(1, Math.round(importoLive / euroGg)) : "—"} gg</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{euroGg} €/gg lavorativo</div>
                      </div>
                      <div className="bg-red-950/50 rounded-lg p-2.5">
                        <div className="text-[10px] text-red-500 font-bold uppercase tracking-wider mb-1">In corso ora</div>
                        <div className="text-base font-black text-red-300">€ {importoLive}</div>
                      </div>
                    </div>
                  )}
                  {chiusi.length > 0 && (
                    <div className="rounded-lg overflow-hidden border border-red-900/60">
                      {[...chiusi].sort((a, b) => (b.data_inizio || "").localeCompare(a.data_inizio || "")).map((e) => (
                        <div key={e.id} className="flex items-center gap-2.5 py-2 px-3 bg-red-950/30 border-b border-red-900/40 last:border-b-0">
                          <div className="text-[12px] text-slate-300 whitespace-nowrap">
                            {formatDataIt(e.data_inizio)} → {formatDataIt(e.data_fine)}
                          </div>
                          <div className="text-[11px] text-slate-500">{e.giorni} gg · {Number(e.malus_euro)}€/gg</div>
                          <div className="ml-auto text-[13px] font-black text-red-200 whitespace-nowrap">€ {Math.round(Number(e.importo))}</div>
                          <StatoEpisodioBadge ep={e} />
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 py-2 px-3 bg-red-950/30 rounded-md text-[11px] text-slate-400 italic">
                    Quando la pratica viene aggiornata o completata il malus smette di maturare,
                    ma quanto generato resta archiviato (attivo finch&eacute; non viene compensato in fase di pagamento gare).
                  </div>
                </div>
              );
            })()}
            <p className="text-xs text-slate-500 mb-4">Tutte le azioni in ordine cronologico inverso.</p>
            <div className="relative">
              <div className="absolute left-[7px] top-0 bottom-0 w-0.5 bg-slate-800" />
              {[...row.storia].reverse().map((ev, i) => {
                const dotColor = tipoColor(ev.tipo);
                const isAdmin = ev.ruolo === "admin";
                return (
                  <div key={i} className="flex gap-3.5 mb-4 relative">
                    <div className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 z-[1]" style={{ background: dotColor }} />
                    <div className="flex-1">
                      <div
                        className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-1 uppercase tracking-wider"
                        style={{
                          color: isAdmin ? "#a78bfa" : "#6366f1",
                          background: isAdmin ? "#2e1065" : "#1e1b4b",
                        }}
                      >
                        {tipoLabel(ev.tipo)}
                      </div>
                      <div className="text-[13px] text-slate-200">{ev.testo}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{ev.data} — {ev.utente}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TrackingPdaPage() {
  const { user } = useAuth();
  // Delega: dallo store manager in su. Esito admin: solo utenti amministrazione.
  const canDelegate = ["store_manager", "admin", "dev", "direttore_generale", "direttore_commerciale"].includes(user?.role || "");
  const canEditAdmin = ["amministrativo", "admin", "dev", "direttore_generale"].includes(user?.role || "");
  const [allMembers, setAllMembers] = useState<{ id: string; full_name: string; primary_store: string | null }[]>([]);
  const [onlyMine, setOnlyMine] = useState(false); // "delegate a me"
  useEffect(() => {
    supabase.from("app_users").select("id, full_name, primary_store").eq("active", true).order("full_name")
      .then(({ data }) => setAllMembers((data ?? []) as any));
  }, []);
  // Segnalazione 30: il Tracking PDA caricava TUTTI i contratti senza alcun
  // filtro di ruolo, quindi chiunque vedeva le pratiche di ogni negozio.
  // Regola richiesta: sotto il livello manager solo le proprie pratiche e quelle
  // delegate; i manager tutto il proprio punto vendita; il supervisore i punti
  // vendita a cui e' associato; dall'amministrazione in su, tutto.
  // I negozi visibili arrivano dalla FONTE UNICA (primary + user_stores +
  // user_store_visibility): prima la stessa union era ricalcolata qui a mano.
  const seesWhole = seesWholeStore(user?.role);
  // seesAll dalla fonte unica: per l'amministrativo dipende dalle restrizioni admin.
  const { seesAll, stores: visibleStores, loaded: visLoaded } = useVisibleStores();

  // Il manager puo' delegare SOLO ai collaboratori dei propri punti vendita —
  // TUTTI quelli visibili, non solo il principale.
  const members = useMemo(() => {
    if (seesAll) return allMembers;
    const miei = visibleStores.length ? visibleStores : (user?.negozio ? [user.negozio] : []);
    if (!miei.length) return allMembers;
    return allMembers.filter((m) => miei.some((st) => sameStore(m.primary_store, st)));
  }, [allMembers, seesAll, visibleStores, user?.negozio]);
  const memberName = useCallback((id?: string | null) => allMembers.find((m) => m.id === id)?.full_name || null, [allMembers]);

  const [rawList, setRawList] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catSel, setCatSel] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statoSel, setStatoSel] = useState<string[]>([]);
  const [periodoDA, setPeriodoDA] = useState("");
  const [periodoA, setPeriodoA] = useState("");
  const [brandSel, setBrandSel] = useState<string[]>([]);
  // Segnalazione 54: filtro Venditore (dallo store manager in su) per vedere
  // solo le pratiche da verificare di un singolo collaboratore del team.
  const [venditoreSel, setVenditoreSel] = useState<string>("");
  // Filtro UTENTE multi-selezione per l'amministrazione (Luca 03/08).
  const [utentiSel, setUtentiSel] = useState<string[]>([]);
  // filtro NEGOZIO per chi vede tutto (amministrativa in su): opzioni dai dati
  const [negozioSel, setNegozioSel] = useState<string>("");

  const [selected, setSelected] = useState<TrackingRow | null>(null);
  // STORICO MALUS (30/07, mig. 103): episodi persistiti + vista archivio.
  const [episodi, setEpisodi] = useState<EpisodioMalus[]>([]);
  const [malusErr, setMalusErr] = useState<string | null>(null);
  const [showArchivio, setShowArchivio] = useState(false);
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  // Le completate spariscono DA SOLE (Luca 03/08): il toggle e' diventato
  // "Mostra pratiche completate" in alto a destra, spento di default.
  const [mostraCompletate, setMostraCompletate] = useState(false);
  const [showRegole, setShowRegole] = useState(false);
  // 📤 solo le pratiche che HO delegato; ⚡ coda di verifica amministrazione.
  const [onlyDelegate, setOnlyDelegate] = useState(false);
  const [soloDaLavorare, setSoloDaLavorare] = useState(false);
  // Cestino (Luca 03/08): pratica in attesa di conferma eliminazione.
  const [daEliminare, setDaEliminare] = useState<TrackingRow | null>(null);
  const [eliminando, setEliminando] = useState(false);
  // regole del tracking dal DB (mig. 098): senza righe valgono i default in
  // codice; regoleV forza il ricalcolo di fasce e KPI dopo un salvataggio
  const [regoleV, setRegoleV] = useState(0);
  useEffect(() => {
    (async () => {
      const { data: rg } = await supabase.from("tracking_regole").select("*");
      if (rg && rg.length) { impostaRegoleTracking(rg as never); setRegoleV((v) => v + 1); }
    })();
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Left join clients so contracts without a matching client still appear (avoids 0 rows).
      const selectCols =
        "id, brand, categoria, stato, venditore, negozio, codice_attivazione, data_registrazione, data, created_at, dettagli, delegated_to, delegated_by, stati_categoria, categoria_macro, controlli, tipo_cliente, tracking_nascosto, clients(nome, cognome, ragione_sociale, cellulare, email, cf_piva, indirizzo, citta)";
      const { data: baseData, error: baseErr } = await supabase
        .from("contracts")
        .select(selectCols)
        .order("created_at", { ascending: false })
        .limit(5000);   // #tracking: con .limit(500) i contratti oltre i 500 piu' recenti sparivano dal Tracking (pratiche piu' vecchie non trovabili)

      if (baseErr) throw baseErr;

      // Optional: fetch tracking columns (requires migration 022). If it fails, we still show contracts with defaults.
      let trackingMap = new Map<string, { stato_negozio?: string; stato_admin?: string; storia?: StoriaEvent[]; stati_categoria?: Record<string, string> }>();
      const { data: trackingData, error: trackingErr } = await supabase
        .from("contracts")
        .select("id, stato_negozio, stato_admin, storia, stati_categoria")
        .order("created_at", { ascending: false })
        .limit(5000);   // #tracking: con .limit(500) i contratti oltre i 500 piu' recenti sparivano dal Tracking (pratiche piu' vecchie non trovabili)

      if (!trackingErr && trackingData?.length) {
        trackingMap = new Map(
          (trackingData as { id: string; stato_negozio?: string; stato_admin?: string; storia?: StoriaEvent[]; stati_categoria?: Record<string, string> }[]).map((r) => [
            r.id,
            { stato_negozio: r.stato_negozio, stato_admin: r.stato_admin, storia: r.storia, stati_categoria: r.stati_categoria },
          ])
        );
      }

      const list = ((baseData ?? []) as unknown as RawRow[]).map((row) => {
        const id = row.id as string;
        const t = trackingMap.get(id);
        return {
          ...row,
          stato_negozio: t?.stato_negozio ?? "nuovo",
          stato_admin: t?.stato_admin ?? "da_verificare",
          storia: Array.isArray(t?.storia) ? t.storia : [],
          delegated_to: (row as RawRow).delegated_to ?? null,
          delegated_by: (row as RawRow).delegated_by ?? null,
        };
      });
      // Optional: use client's 41 sample data from Supabase (run migration 024_tracking_pda_sample_data.sql)
      // Segnalazione 43: i prodotti venduti a marginalita' (brand "Extra") non
      // sono pratiche da lavorare — niente attivazione, niente stato, niente
      // malus — e sporcavano solo l'elenco. Fuori dal Tracking.
      // Fuori dal Tracking anche le Sostituzioni SIM: come gli Extra non sono
      // pratiche da lavorare (nessuna attivazione da seguire) e sporcavano
      // l'elenco. Richiesta di Francesco insieme alla visibilita' del Tecnico.
      const lavorabili = (list as RawRow[]).filter((r: Record<string, unknown>) => {
        if (r.tracking_nascosto) return false; // cestino: nascosta SOLO dal Tracking
        const b = String(r.brand || "").trim().toLowerCase();
        const p = String(r.prodotto || "").trim().toLowerCase();
        if (b === "extra" || b.startsWith("marginal") || /sost/.test(p)) return false;
        // Very Mobile fuori dal Tracking (Luca 03/08): non si lavora qui.
        if (b.startsWith("very")) return false;
        // Segnalazione 91: una pratica MOBILE senza finanziamento e senza MNP non
        // e' da lavorare -> fuori dal Tracking (e in Ricerca risulta gia' Attivo).
        const macro = String(r.categoria_macro || "").toLowerCase()
          || categoriaDi(r.brand as string, r.categoria as string, r.prodotto as string);
        const ctrl = (Array.isArray(r.controlli) && r.controlli.length)
          ? (r.controlli as string[])
          : controlliDi((r.dettagli as Record<string, unknown>) || {});
        // PERIMETRO (Luca 29/07): nel Tracking entrano SOLO le categorie
        // monitorate dalle regole — SIM/MNP e finanziamenti (mobile), fissi di
        // ogni operatore (Sky fibra inclusa → Fisso), contratti P.IVA (mobile
        // business), energia di ogni operatore, Sky TV. FUORI: Customer Base,
        // Multi-Servizi, POS (oltre a marginalità e sostituzioni qui sopra).
        if (["cb", "multi_servizi", "pos", "extra", "digitale"].includes(macro)) return false;
        const business = String(r.tipo_cliente || "").toLowerCase() === "business";
        if (macro === "mobile" && !business && !ctrl.includes("mnp") && !ctrl.includes("finanziamento")) return false;
        return true;
      });
      const scoped = seesAll ? lavorabili : lavorabili.filter((r: Record<string, unknown>) => {
        if (seesWhole) return visibleStores.some((st) => sameStore(r.negozio as string, st));
        return (!!r.venditore && !!user?.name && r.venditore === user.name)
            || (!!r.delegated_to && r.delegated_to === user?.id);
      });
      setRawList(scoped as RawRow[]);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setRawList([]);
    } finally {
      setLoading(false);
    }
  }, [seesAll, seesWhole, visibleStores, user?.name, user?.id]);

  useEffect(() => {
    // NON interrogare i dati prima che la visibilita' negozi sia arrivata: un
    // utente "scopato" (es. store manager) altrimenti parte con stores=[] e la
    // sua lista resta VUOTA (nessuna pratica del suo negozio). seesAll non attende.
    if (seesAll || visLoaded) fetchData();
  }, [fetchData, seesAll, visLoaded]);

  // Combinazioni di vendita, come indicate da Francesco (per ora WindTre mobile):
  //   solo Mobile                  -> Mobile
  //   Mobile + MNP                 -> MNP
  //   Mobile + Rata                -> Mobile   (la rata non e' un finanziamento)
  //   Mobile + Rata + MNP          -> MNP
  //   Mobile + Finanziamento       -> Finanziamento
  //   Mobile + Finanziamento + MNP -> DUE righe: MNP e Finanziamento
  // Le altre categorie (fisso, energia, sky, piva) restano una riga sola.
  // Segnalazione 46: arrivando dall'icona di navigazione di Ricerca Contratto,
  // la ricerca testuale si imposta sul nominativo del cliente e si apre subito
  // il pannello della pratica.
  const deepLinked = useRef(false);
  const [malusDeepLink, setMalusDeepLink] = useState<string | null>(null);
  useEffect(() => {
    if (deepLinked.current) return;
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("q");
    if (q) { setSearch(q); deepLinked.current = true; }
    // ?malus=<venditore> (Luca 02/08): dal box Malus della scheda utente si
    // atterra qui con l'ARCHIVIO gia' aperto e filtrato su quella persona
    const mv = sp.get("malus");
    if (mv) { setMalusDeepLink(mv); setShowArchivio(true); deepLinked.current = true; }
  }, []);

  const data: TrackingRow[] = useMemo(() => {
    const out: TrackingRow[] = [];
    rawList.forEach((r) => {
      const base = mapContractToTrackingRow(r, r.clients as Record<string, unknown> | null, (r.dettagli as Record<string, unknown>) || null);
      const cats = (() => {
        // Sky TV usa le regole "sky"; i fissi Sky sono già macro fisso.
        if (base.categoria === "tv") return ["sky"];
        // 3P SKY (Luca 02/08): un contratto solo che contiene TV + fibra.
        // SOLO qui nel Tracking si divide in DUE righe esitabili
        // separatamente: "fisso" (la fibra, regole fisso) e "sky" (la TV,
        // regole Sky). L'eventuale mobile Sky viaggia gia' come pratica a
        // parte. Copre anche il prodotto legacy "3P 35,80".
        if (base.categoria === "fisso" && String(r.brand || "").toLowerCase().includes("sky") && /\b3\s*P\b/i.test(String(r.prodotto || ""))) return ["fisso", "sky"];
        // contratti P.IVA: il mobile business segue le regole "piva"
        if (base.categoria === "mobile" && String(r.tipo_cliente || "").toLowerCase() === "business") return ["piva"];
        return righeTracking(base.categoria as never, (base.controlli || []) as never);
      })();
      // Segnalazione 66: ogni riga ha il proprio esito. Quello della categoria e'
      // in stati_categoria; se manca si eredita da stato_negozio, cosi' le
      // pratiche gia' lavorate non perdono lo stato.
      const perCat = (r.stati_categoria as Record<string, string> | undefined) || {};
      cats.forEach((c) => out.push({
        ...base,
        categoria: c,
        rowKey: `${base.id}#${c}`,
        // #119: ogni riga (categoria) e' INDIPENDENTE. Se la categoria non ha un
        // esito proprio in stati_categoria, eredita lo stato_negozio condiviso SOLO
        // se e' VALIDO per quella categoria (retrocompat delle pratiche vecchie il cui
        // esito sta ancora nel campo condiviso); altrimenti parte da "nuovo". Cosi'
        // "In Liquidazione" (valido solo per il Finanziamento) non finisce sull'MNP,
        // ma il Finanziamento non perde il suo stato.
        // Riga TV sintetizzata da un 3P: fino a oggi la pratica era UNA riga
        // sola, quindi se la fibra risulta attivata la TV era stata lavorata
        // insieme — nasce "attivo_sky", NON "nuovo", altrimenti il malus
        // maturerebbe retroattivamente su pratiche gia' chiuse.
        statoNegozio: perCat[c] ?? (
          (c === "sky" && base.categoria === "fisso" && (perCat["fisso"] === "attivato" || (!perCat["fisso"] && base.statoNegozio === "attivato")))
            ? "attivo_sky"
            : ((base.statoNegozio && getStatiNegozioPerCategoria(c).some((s) => s.id === base.statoNegozio)) ? base.statoNegozio : "nuovo")),
      }));
    });
    return out;
  }, [rawList]);



  // STORICO MALUS: dopo ogni caricamento/aggiornamento si allineano gli
  // episodi persistiti alle righe correnti (nuovi malus si aprono, pratiche
  // sanate si congelano alla data dell'evento, il maturato in corso si
  // aggiorna) e si tiene in stato l'archivio completo. Idempotente: due
  // sessioni aperte insieme scrivono gli stessi valori.
  useEffect(() => {
    if (loading || data.length === 0) return;
    let vivo = true;
    (async () => {
      try {
        const { data: eps, error } = await supabase.from("malus_storico").select("*").limit(5000);
        if (error) throw error;
        const scritture = await sincronizzaMalusStorico(data, (eps ?? []) as EpisodioMalus[]);
        if (scritture > 0) {
          const { data: eps2, error: err2 } = await supabase.from("malus_storico").select("*").limit(5000);
          if (err2) throw err2;
          if (vivo) setEpisodi((eps2 ?? []) as EpisodioMalus[]);
        } else if (vivo) {
          setEpisodi((eps ?? []) as EpisodioMalus[]);
        }
        if (vivo) setMalusErr(null);
      } catch (e) {
        // tabella assente (migrazione 103 non ancora eseguita) o rete: il
        // tracking live continua a funzionare, l'archivio segnala il problema.
        if (vivo) setMalusErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { vivo = false; };
  }, [data, loading, regoleV]);

  // Scoping dell'archivio per ruolo, stessa regola delle pratiche: consulente
  // i suoi episodi, store manager i negozi visibili, amministrazione tutto.
  const episodiVisibili = useMemo(() => {
    // i TOMBSTONE (mig. 150, eliminati dall'admin) restano solo per la sync:
    // fuori da archivio, contatori e badge per chiunque
    const vivi = episodi.filter((e) => !e.eliminato);
    if (seesAll) return vivi;
    if (seesWhole) return vivi.filter((e) => visibleStores.some((st) => sameStore(e.negozio, st)));
    return vivi.filter((e) => !!e.venditore && !!user?.name && e.venditore === user.name);
  }, [episodi, seesAll, seesWhole, visibleStores, user?.name]);

  const episodiPerRiga = useMemo(() => {
    const m = new Map<string, EpisodioMalus[]>();
    episodiVisibili.forEach((e) => {
      const k = `${e.contract_id}#${e.categoria}`;
      const arr = m.get(k);
      if (arr) arr.push(e);
      else m.set(k, [e]);
    });
    return m;
  }, [episodiVisibili]);

  const storicoTotale = useMemo(() => totaliEpisodi(episodiVisibili).totale, [episodiVisibili]);

  // Dall'archivio si apre la pratica: stessa riga (id+categoria) del tracking.
  const apriPraticaDaArchivio = useCallback((cid: string, cat: string) => {
    const hit = data.find((r) => r.id === cid && r.categoria === cat) || data.find((r) => r.id === cid);
    if (hit) { setSelected(hit); setShowArchivio(false); }
  }, [data]);

  const deepOpened = useRef(false);
  useEffect(() => {
    if (deepOpened.current || data.length === 0) return;
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    const hit = data.find((r) => r.id === id);
    if (hit) { setSelected(hit); deepOpened.current = true; }
  }, [data]);

  // Cambio negozio ⇒ via dalla selezione gli utenti che li' non hanno pratiche
  // (altrimenti resta un filtro-fantasma che svuota la tabella).
  useEffect(() => {
    setUtentiSel((prev) => {
      const next = prev.filter((n) => data.some((r) => r.venditore === n && (!negozioSel || r.negozio === negozioSel)));
      return next.length === prev.length ? prev : next;
    });
  }, [negozioSel, data]);

  const statiCompletatiNegozio = ["attivato", "liquidato", "completo_sky", "attivo_sky"];

  const filtered = useMemo(() => {
    return data.filter((row) => {
      // ⚡ Da lavorare (amministrazione): SOLO pratiche chiuse dal negozio che
      // aspettano ancora l'esito definitivo dell'admin — bypassa la regola
      // che nasconde le completate, altrimenti la coda sarebbe invisibile.
      if (soloDaLavorare) {
        if (!statiCompletatiNegozio.includes(row.statoNegozio)) return false;
        if (["confermato", "pagato", "stornato", "non_conforme"].includes(row.statoAdmin)) return false;
      } else if (!mostraCompletate && statiCompletatiNegozio.includes(row.statoNegozio) && row.statoAdmin !== "non_conforme") return false;
      if (onlyMine && row.delegated_to !== user?.id) return false; // "delegate a me"
      if (onlyDelegate && row.delegated_by !== user?.id) return false; // "delegate DA me"
      if (kpiFilter !== null) {
        if (kpiFilter === "__attenzione__") {
          if (!isAttenzioneRow(row) || isMalusRow(row)) return false;
        } else if (kpiFilter === "__da_lavorare__") {
          if (!isDaLavorareRow(row) || isMalusRow(row)) return false;
        } else if (kpiFilter === "__malus__") {
          if (!isMalusRow(row)) return false;
        } else if (kpiFilter === "__non_conforme__") {
          if (row.statoAdmin !== "non_conforme") return false;
        } else {
          if (row.statoNegozio !== kpiFilter) return false;
        }
      }
      if (catSel.length > 0 && !catSel.includes(row.categoria)) return false;
      if (brandSel.length > 0 && !brandSel.includes(row.brand)) return false;
      if (utentiSel.length > 0 && !utentiSel.includes(row.venditore)) return false;
      if (venditoreSel && row.venditore !== venditoreSel) return false;
      if (negozioSel && row.negozio !== negozioSel) return false;
      if (statoSel.length > 0 && !statoSel.includes(row.statoNegozio)) return false;
      if (periodoDA || periodoA) {
        const rowDate = parseDataRiga(row.dataInserimento);
        // Senza data valida la riga resta fuori: se si filtra per periodo, una
        // pratica senza data non appartiene a quel periodo.
        if (!rowDate) return false;
        rowDate.setHours(12, 0, 0, 0);
        if (periodoDA) {
          const da = parseDataRiga(periodoDA);
          if (da) { da.setHours(0, 0, 0, 0); if (rowDate < da) return false; }
        }
        if (periodoA) {
          const a = parseDataRiga(periodoA);
          if (a) { a.setHours(23, 59, 59, 999); if (rowDate > a) return false; }
        }
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          row.nominativo.toLowerCase().includes(q) ||
          row.numContratto.toLowerCase().includes(q) ||
          row.numAttivazione.toLowerCase().includes(q) ||
          row.negozio.toLowerCase().includes(q) ||
          row.brand.toLowerCase().includes(q) ||
          row.venditore.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [data, catSel, brandSel, search, statoSel, kpiFilter, periodoDA, periodoA, mostraCompletate, soloDaLavorare, onlyMine, onlyDelegate, user?.id, venditoreSel, negozioSel, utentiSel, regoleV]);

  const filteredPerKpi = useMemo(() => {
    return data.filter((row) => {
      // Esito definitivo del negozio = pratica completata = sparisce da sola.
      // ECCEZIONE: se l'admin la boccia (non conforme) torna lavorabile e riappare.
      if (!mostraCompletate && statiCompletatiNegozio.includes(row.statoNegozio) && row.statoAdmin !== "non_conforme") return false;
      if (catSel.length > 0 && !catSel.includes(row.categoria)) return false;
      if (brandSel.length > 0 && !brandSel.includes(row.brand)) return false;
      if (utentiSel.length > 0 && !utentiSel.includes(row.venditore)) return false;
      if (venditoreSel && row.venditore !== venditoreSel) return false;
      if (negozioSel && row.negozio !== negozioSel) return false;
      if (statoSel.length > 0 && !statoSel.includes(row.statoNegozio)) return false;
      if (periodoDA || periodoA) {
        const parti = row.dataInserimento.split("/");
        if (parti.length === 3) {
          const rowDate = new Date(parseInt(parti[2], 10), parseInt(parti[1], 10) - 1, parseInt(parti[0], 10));
          if (periodoDA) {
            const da = new Date(periodoDA);
            da.setHours(0, 0, 0, 0);
            if (rowDate < da) return false;
          }
          if (periodoA) {
            const a = new Date(periodoA);
            a.setHours(23, 59, 59, 999);
            if (rowDate > a) return false;
          }
        }
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          row.nominativo.toLowerCase().includes(q) ||
          row.numContratto.toLowerCase().includes(q) ||
          row.numAttivazione.toLowerCase().includes(q) ||
          row.negozio.toLowerCase().includes(q) ||
          row.brand.toLowerCase().includes(q) ||
          row.venditore.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [data, catSel, brandSel, search, statoSel, periodoDA, periodoA, mostraCompletate, negozioSel, utentiSel, regoleV]);

  // Delega la verifica di una pratica a un collaboratore (o rimuove la delega).
  const handleDelegate = useCallback(async (rowId: string, toId: string | null) => {
    const target = rawList.find((r) => (r.id as string) === rowId);
    const oggi = new Date().toLocaleDateString("it-IT");
    const storia = Array.isArray((target as any)?.storia) ? [...(target as any).storia] : [];
    storia.push({ data: oggi, tipo: "delega",
      testo: toId ? `Verifica delegata a ${memberName(toId) || "collaboratore"}` : "Delega verifica rimossa",
      utente: user?.name || "—", ruolo: "admin" });
    const { error } = await supabase.from("contracts")
      .update({ delegated_to: toId, delegated_by: toId ? (user?.id ?? null) : null, storia }).eq("id", rowId);
    if (error) { setLoadError(error.message); return; }
    setRawList((prev) => prev.map((r) => (r.id as string) === rowId ? { ...r, delegated_to: toId, delegated_by: toId ? user?.id : null, storia } : r));
    setSelected((s) => s && s.id === rowId ? { ...s, delegated_to: toId, delegated_by: toId ? (user?.id ?? null) : null, storia } : s);
  }, [rawList, memberName, user]);

  // Cestino: "riga" = nascondi SOLO dal Tracking (flag tracking_nascosto, la
  // vendita resta in Ricerca Vendite); "contratto" = DELETE vero, sparisce
  // ovunque. Scelta nel popup, solo admin/dev.
  const handleElimina = useCallback(async (row: TrackingRow, modo: "riga" | "contratto") => {
    setEliminando(true);
    try {
      if (modo === "riga") {
        const { error } = await supabase.from("contracts").update({ tracking_nascosto: true }).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contracts").delete().eq("id", row.id);
        if (error) throw error;
      }
      setRawList((prev) => prev.filter((r) => (r.id as string) !== row.id));
      setSelected((sel) => (sel && sel.id === row.id ? null : sel));
      setDaEliminare(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setEliminando(false);
    }
  }, []);

  // Delega rapida di piu' pratiche insieme dalla dashboard.
  const handleBulkDelegate = useCallback(async (ids: string[], toId: string) => {
    if (!ids.length || !toId) return;
    const nome = memberName(toId) || "collaboratore";
    const oggi = new Date().toLocaleDateString("it-IT");
    for (const id of ids) {
      const target = rawList.find((r) => (r.id as string) === id);
      const storia = Array.isArray((target as any)?.storia) ? [...(target as any).storia] : [];
      storia.push({ data: oggi, tipo: "delega", testo: `Verifica delegata a ${nome}`, utente: user?.name || "—", ruolo: "admin" });
      await supabase.from("contracts").update({ delegated_to: toId, delegated_by: user?.id ?? null, storia }).eq("id", id);
    }
    setRawList((prev) => prev.map((r) => ids.includes(r.id as string) ? { ...r, delegated_to: toId, delegated_by: user?.id } : r));
  }, [rawList, memberName, user]);

  const handleUpdate = useCallback(
    async (updated: TrackingRow) => {
      // Segnalazioni 37 e 38: lo stato lavorato qui deve comparire subito in
      // Ricerca Contratto, e la data di attivazione si popola quando la pratica
      // diventa davvero attiva (prima veniva scritta all'inserimento).
      // Se la pratica ha piu' controlli (MNP + finanziamento), l'esito va scritto
      // sulla sua categoria e non sulla colonna condivisa, altrimenti si
      // sovrascrivono a vicenda (segnalazione 66).
      const rigaEspansa = !!updated.rowKey && updated.rowKey.includes("#");
      const cat = updated.categoria;
      // #119: lo stato per-categoria ATTUALE va letto FRESCO dal DB, non da rawList:
      // questo callback ha deps [] e nel suo closure `rawList` e' quello del primo
      // render (vuoto), quindi il merge partiva da {} e CANCELLAVA le altre categorie
      // gia' salvate (corruzione della riga sorella allo "Salva esito negozio").
      const { data: _cur } = await supabase.from("contracts").select("stati_categoria").eq("id", updated.id).maybeSingle();
      const attuali = ((_cur?.stati_categoria as Record<string, string>) || {});
      const nuoviStati = { ...attuali, [cat]: updated.statoNegozio };

      // Lo stato del contratto e' "Attivo" solo quando TUTTI i controlli sono
      // completati: con due verifiche aperte la pratica non e' finita.
      const tuttiStati = rigaEspansa ? Object.values(nuoviStati) : [updated.statoNegozio];
      const statoContratto = tuttiStati.every((st) => statoContrattoDa(st) === "Attivo")
        ? "Attivo"
        : statoContrattoDa(tuttiStati.find((st) => statoContrattoDa(st) !== "Attivo") ?? updated.statoNegozio);

      const payload: Record<string, unknown> = {
        stato_admin: updated.statoAdmin,
        storia: updated.storia,
        stato: statoContratto,
        stati_categoria: nuoviStati,
      };
      if (!rigaEspansa) payload.stato_negozio = updated.statoNegozio;
      // La data di attivazione NON si tocca qui: viene compilata alla
      // registrazione ed e' quella la data buona (indicazione di Luca, che
      // annulla la segnalazione 38). Qui si propaga solo lo stato.
      const { error } = await supabase.from("contracts").update(payload).eq("id", updated.id);
      if (error) {
        setLoadError(error.message);
        return;
      }
      setRawList((prev) =>
        prev.map((r) => ((r.id as string) === updated.id ? { ...r, ...payload } : r))
      );
      setSelected(updated);
    },
    []
  );

  return (
    <div className="w-full">
      <div className="p-0">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h2 className="text-3xl font-bold text-white">📡 Tracking PDA</h2>
              {/* Le completate (esito definitivo negozio) spariscono in automatico:
                  questo le fa rivedere. Accanto al titolo (Luca 03/08). */}
              <button
                type="button"
                onClick={() => setMostraCompletate((v) => !v)}
                title="Le pratiche con esito definitivo del negozio spariscono da sole: attiva per rivederle"
                className={"px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors " + (mostraCompletate ? "border-emerald-500 bg-emerald-500/15 text-emerald-300" : "border-slate-600 text-slate-400 hover:bg-white/5")}
              >
                {mostraCompletate ? "✓" : "✅"} Mostra completate
              </button>
            </div>
            <p className="text-slate-400 text-sm">Monitoraggio pratiche: esito negozio, esito admin, storico e malus</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Filtri personali (Luca 03/08): chi riceve deleghe ha "📥 Delegate
                a me"; chi puo' delegare ha "📤 Delegate da me"; l'amministrazione
                al posto del primo ha "⚡ Da lavorare" = pratiche chiuse dal
                negozio che aspettano la verifica admin. */}
            {!canEditAdmin && (
              <button
                type="button"
                onClick={() => setOnlyMine((v) => !v)}
                className={"px-4 py-2 rounded-lg border text-[13px] font-bold transition-colors " + (onlyMine ? "border-emerald-500 bg-emerald-500/15 text-emerald-300" : "border-slate-600 text-slate-300 hover:bg-white/5")}
              >
                📥 Delegate a me
              </button>
            )}
            {canDelegate && (
              <button
                type="button"
                onClick={() => setOnlyDelegate((v) => !v)}
                title="Solo le pratiche che HAI delegato a qualcuno"
                className={"px-4 py-2 rounded-lg border text-[13px] font-bold transition-colors " + (onlyDelegate ? "border-violet-500 bg-violet-500/15 text-violet-300" : "border-slate-600 text-slate-300 hover:bg-white/5")}
              >
                📤 Delegate da me
              </button>
            )}
            {canEditAdmin && (
              <button
                type="button"
                onClick={() => setSoloDaLavorare((v) => !v)}
                title="Pratiche chiuse dal negozio che aspettano la verifica dell'amministrazione"
                className={"px-4 py-2 rounded-lg border text-[13px] font-bold transition-colors " + (soloDaLavorare ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-slate-600 text-slate-300 hover:bg-white/5")}
              >
                ⚡ Da lavorare
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowRegole(true)}
              className="px-4 py-2 rounded-lg border border-indigo-500 text-indigo-200 text-[13px] font-bold hover:bg-indigo-500/10 transition-colors"
            >
              📋 Regole
            </button>
          </div>
        </div>

        {showRegole && (
          <div
            className="fixed inset-0 bg-black/60 z-[1100] flex items-center justify-center p-4"
            onClick={() => setShowRegole(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Regole di Ingaggio"
          >
            <div
              className="bg-white/[0.03] border border-white/10 rounded-2xl w-full max-w-[980px] max-h-[88vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between py-5 px-7 border-b border-white/10">
                <div>
                  <div className="text-lg font-extrabold text-slate-100">📋 Regole di Ingaggio — Tracking PDA</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Giorni LAVORATIVI (lun–sab) · fasce mutuamente esclusive: 🔴 Malus &gt; ⚠️ Warning &gt; ⚡ Da Lavorare
                    {["admin", "dev"].includes(user?.role || "") ? " · clicca sui numeri per modificarli" : ""}
                  </div>
                </div>
                <button type="button" onClick={() => setShowRegole(false)} className="bg-transparent border-none text-slate-500 text-xl cursor-pointer leading-none p-0">
                  ✕
                </button>
              </div>
              <RegoleTracking admin={["admin", "dev"].includes(user?.role || "")} onSalvate={() => setRegoleV((v) => v + 1)} />
            </div>
          </div>
        )}

        {loadError && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            Errore: {loadError}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-slate-400">Caricamento...</div>
        ) : (
          <>
            <KpiBar
              data={filteredPerKpi}
              onFilter={setKpiFilter}
              activeFilter={kpiFilter}
              storicoTotale={storicoTotale}
              onApriStorico={() => setShowArchivio(true)}
              brands={[...new Set(data.map((r) => r.brand).filter(Boolean))].sort()}
              brandSel={brandSel}
              setBrandSel={setBrandSel}
            />
            <FilterBar
              catSel={catSel}
              setCatSel={setCatSel}
              search={search}
              setSearch={setSearch}
              statoSel={statoSel}
              setStatoSel={setStatoSel}
              periodoDA={periodoDA}
              setPeriodoDA={setPeriodoDA}
              periodoA={periodoA}
              setPeriodoA={setPeriodoA}
              brandSel={brandSel}
              setBrandSel={setBrandSel}
              venditoreSel={venditoreSel}
              setVenditoreSel={setVenditoreSel}
              // I nomi venditore vengono dai contratti REALI (come il filtro
              // Negozio qui sotto), non da full_name: sui contratti il venditore
              // e' spesso il match_name ("Eloisa Nucci") mentre full_name e'
              // "Eloisa Nucci Gonzalez", quindi il chip preso da full_name non
              // corrispondeva a nulla e le pratiche sparivano (segn. Lorenzo 03/08).
              venditori={seesWhole && !seesAll ? Array.from(new Set(data.map((r) => r.venditore).filter((n) => n && n !== "—"))).sort() : []}
              negozioSel={negozioSel}
              setNegozioSel={setNegozioSel}
              negozi={seesAll ? Array.from(new Set(data.map((r) => r.negozio).filter((n) => n && n !== "—"))).sort() : []}
              utenti={seesAll ? Array.from(new Set(data.filter((r) => !negozioSel || r.negozio === negozioSel).map((r) => r.venditore).filter((n) => n && n !== "—"))).sort() : []}
              utentiSel={utentiSel}
              setUtentiSel={setUtentiSel}
            />
            <Tabella rows={filtered} onSelect={setSelected} canDelegate={canDelegate} members={members} onBulkDelegate={handleBulkDelegate} archivio={episodiPerRiga} canDelete={["admin", "dev"].includes(user?.role || "")} onAskDelete={setDaEliminare} />
          </>
        )}

        {/* Popup cestino: riga tracking o intero contratto? */}
        {daEliminare && (
          <div
            className="fixed inset-0 bg-black/60 z-[1200] flex items-center justify-center p-4"
            onClick={() => { if (!eliminando) setDaEliminare(null); }}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-white/10 p-6"
              style={{ background: "#0e1526", boxShadow: "0 18px 50px rgba(0,0,0,.55)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-lg font-extrabold text-slate-100 mb-1">🗑️ Elimina pratica</div>
              <div className="text-[13px] text-slate-400 mb-5">
                {daEliminare.nominativo} — {daEliminare.brand} · {daEliminare.categoria}
              </div>
              <button
                type="button"
                disabled={eliminando}
                onClick={() => handleElimina(daEliminare, "riga")}
                className="w-full text-left rounded-xl border border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors px-4 py-3 mb-2.5 cursor-pointer disabled:opacity-50"
              >
                <div className="text-sm font-bold text-indigo-200">📡 Solo da Tracking PDA</div>
                <div className="text-[11px] text-slate-400 mt-0.5">La pratica sparisce da qui ma resta in Ricerca Vendite</div>
              </button>
              <button
                type="button"
                disabled={eliminando}
                onClick={() => handleElimina(daEliminare, "contratto")}
                className="w-full text-left rounded-xl border border-red-500/60 bg-red-500/10 hover:bg-red-500/20 transition-colors px-4 py-3 cursor-pointer disabled:opacity-50"
              >
                <div className="text-sm font-bold text-red-300">💥 Elimina l&apos;intero contratto</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Sparisce da TUTTO il CRM, anche da Ricerca Vendite. Irreversibile.</div>
              </button>
              <button
                type="button"
                disabled={eliminando}
                onClick={() => setDaEliminare(null)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] transition-colors px-4 py-2.5 mt-2.5 text-[13px] font-bold text-slate-300 cursor-pointer disabled:opacity-50"
              >
                Annulla
              </button>
            </div>
          </div>
        )}

        {showArchivio && (
          <ArchivioMalus
            episodi={episodiVisibili}
            errore={malusErr}
            onClose={() => setShowArchivio(false)}
            onApriPratica={apriPraticaDaArchivio}
            canCompensare={canEditAdmin}
            puoEliminare={user?.role === "admin" || user?.role === "dev"}
            utente={user?.name || "—"}
            venditoreIniziale={malusDeepLink || undefined}
            onAggiornato={(ep) => setEpisodi((prev) => prev.map((e) => (e.id === ep.id ? ep : e)))}
          />
        )}

        {selected && (
          <Drawer row={selected} onClose={() => setSelected(null)} onUpdate={handleUpdate}
            members={members} canDelegate={canDelegate} canEditAdmin={canEditAdmin} onDelegate={handleDelegate} delegatoNome={memberName(selected.delegated_to)}
            episodiMalus={episodiPerRiga.get(`${selected.id}#${selected.categoria}`) || []} />
        )}
      </div>
    </div>
  );
}
