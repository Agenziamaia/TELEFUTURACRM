"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { seesWholeStore } from "@/lib/roles";
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
  giorniLavorativiDa,
  giorniDaUltimoAggiornamento,
  getStatiNegozioPerCategoria,
  getStatoN,
  getStatoA,
  getCat,
  isAttenzioneRow,
  isDaLavorareRow,
  isMalusRow,
  calcolaMalus,
} from "./trackingHelpers";

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
function KpiBar({
  data,
  onFilter,
  activeFilter,
  escludiConfermati,
  setEscludiConfermati,
  escludiCompletati,
  setEscludiCompletati,
}: {
  data: TrackingRow[];
  onFilter: (f: string | null) => void;
  activeFilter: string | null;
  escludiConfermati: boolean;
  setEscludiConfermati: (v: boolean) => void;
  escludiCompletati: boolean;
  setEscludiCompletati: (v: boolean) => void;
}) {
  const totale = data.length;
  const nuovi = data.filter((r) => r.statoNegozio === "nuovo").length;
  const daLavorare = data.filter((r) => isDaLavorareRow(r) && !isMalusRow(r)).length;
  const problema = data.filter((r) => isAttenzioneRow(r) && !isMalusRow(r)).length;
  const nonConformi = data.filter((r) => r.statoAdmin === "non_conforme").length;
  const malusCount = data.filter((r) => isMalusRow(r)).length;
  const malusTotale = data.reduce((acc, r) => acc + calcolaMalus(r), 0);

  const cards = [
    { label: "Totale Monitorati", val: totale, color: "#94a3b8", filter: null as string | null },
    { label: "Nuovi", val: nuovi, color: "#64748b", filter: "nuovo" },
    { label: "Da Lavorare", val: daLavorare, color: "#eab308", filter: "__da_lavorare__" },
    { label: "Warning", val: problema, color: "#f97316", filter: "__attenzione__" },
    { label: "Malus", val: malusCount, color: "#dc2626", filter: "__malus__" },
    { label: "Non Conforme", val: nonConformi, color: "#7c3aed", filter: "__non_conforme__" },
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
              className="rounded-xl border p-3.5 text-center cursor-pointer select-none transition-all hover:border-opacity-60"
              style={{
                background: isActive ? c.color + "22" : "#1e293b",
                borderColor: isActive ? c.color : "#334155",
              }}
            >
              <div className="text-2xl font-bold" style={{ color: c.color }}>
                {c.val}
              </div>
              <div className="text-[11px] mt-0.5 font-medium" style={{ color: isActive ? c.color : "#94a3b8" }}>
                {c.label}
              </div>
              {c.filter === "__malus__" && malusTotale > 0 && (
                <div className="text-[10px] mt-1" style={{ color: isActive ? "#fca5a5" : "#64748b" }}>
                  € {malusTotale.toFixed(0)} maturati
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEscludiConfermati(!escludiConfermati)}
        className="flex items-center gap-2.5 rounded-xl border py-2.5 px-4 cursor-pointer select-none transition-all mb-2"
        style={{
          background: escludiConfermati ? "#0c1a0c" : "#1e293b",
          borderColor: escludiConfermati ? "#22c55e" : "#334155",
        }}
      >
        <div
          className="w-[18px] h-[18px] rounded border-2 flex items-center justify-center flex-shrink-0"
          style={{ borderColor: escludiConfermati ? "#22c55e" : "#475569", background: escludiConfermati ? "#22c55e" : "transparent" }}
        >
          {escludiConfermati && <span className="text-black text-[11px] font-black">✓</span>}
        </div>
        <div>
          <div className="text-xs font-bold" style={{ color: escludiConfermati ? "#4ade80" : "#94a3b8" }}>
            Escludi pratiche confermate o superiori
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Nasconde contratti con esito admin: Confermato, Pagato, Stornato
          </div>
        </div>
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEscludiCompletati(!escludiCompletati)}
        className="flex items-center gap-2.5 rounded-xl border py-2.5 px-4 cursor-pointer select-none transition-all mt-2"
        style={{
          background: escludiCompletati ? "#0c1a0c" : "#1e293b",
          borderColor: escludiCompletati ? "#22c55e" : "#334155",
        }}
      >
        <div
          className="w-[18px] h-[18px] rounded border-2 flex items-center justify-center flex-shrink-0"
          style={{ borderColor: escludiCompletati ? "#22c55e" : "#475569", background: escludiCompletati ? "#22c55e" : "transparent" }}
        >
          {escludiCompletati && <span className="text-black text-[11px] font-black">✓</span>}
        </div>
        <div>
          <div className="text-xs font-bold" style={{ color: escludiCompletati ? "#4ade80" : "#94a3b8" }}>
            Escludi pratiche completate
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Nasconde contratti con esito negozio: Completato, Liquidato, Completo, Attivo
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FilterBar ───────────────────────────────────────────────────────────────
function FilterBar({
  catSel,
  setCatSel,
  search,
  setSearch,
  statoSel,
  setStatoSel,
  praticaSel,
  setPraticaSel,
  statiPraticaDisponibili,
  periodoDA,
  setPeriodoDA,
  periodoA,
  setPeriodoA,
  brandSel,
  setBrandSel,
  venditoreSel,
  setVenditoreSel,
  venditori,
}: {
  catSel: string[];
  setCatSel: (v: string[]) => void;
  search: string;
  setSearch: (v: string) => void;
  statoSel: string[];
  setStatoSel: (v: string[]) => void;
  praticaSel: string[];
  setPraticaSel: (v: string[]) => void;
  statiPraticaDisponibili: string[];
  periodoDA: string;
  setPeriodoDA: (v: string) => void;
  periodoA: string;
  setPeriodoA: (v: string) => void;
  brandSel: string[];
  setBrandSel: (v: string[]) => void;
  venditoreSel: string;
  setVenditoreSel: (v: string) => void;
  venditori: string[];
}) {
  const [statoOpen, setStatoOpen] = useState(false);
  const [praticaOpen, setPraticaOpen] = useState(false);   // segnalazione 77

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
    "bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-[13px] py-2 px-3 outline-none box-border w-full";

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
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
                borderColor: sel ? cat.color : "#334155",
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
            className="rounded-full px-3 py-1 text-[11px] cursor-pointer border border-slate-600 bg-transparent text-slate-500"
          >
            ✕ Deseleziona tutto
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-xs text-slate-400 font-semibold mr-1">BRAND</span>
        {ALL_BRANDS.map((b) => {
          const brandColors: Record<string, string> = {
            Vodafone: "#ef4444",
            Fastweb: "#3b82f6",
            WindTre: "#f97316",
            Iliad: "#a855f7",
            Tim: "#14b8a6",
            "S4 Energy": "#22c55e",
            Sky: "#ef4444",
          };
          const color = brandColors[b] || "#94a3b8";
          const sel = brandSel.includes(b);
          return (
            <button
              key={b}
              type="button"
              onClick={() => toggleBrand(b)}
              className="rounded-full px-3.5 py-1 text-xs font-semibold cursor-pointer border transition-all"
              style={{
                borderColor: sel ? color : "#334155",
                background: sel ? color + "33" : "transparent",
                color: sel ? color : "#94a3b8",
              }}
            >
              {b}
            </button>
          );
        })}
        {brandSel.length > 0 && (
          <button
            type="button"
            onClick={() => setBrandSel([])}
            className="rounded-full px-3 py-1 text-[11px] cursor-pointer border border-slate-600 bg-transparent text-slate-500"
          >
            ✕ Tutti i brand
          </button>
        )}
      </div>
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
              borderColor: venditoreSel === "" ? "#6366f1" : "#334155",
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
                  borderColor: sel ? "#6366f1" : "#334155",
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
        <div className="relative flex-[2] min-w-[200px]">
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
              className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg z-[999] shadow-xl max-h-60 overflow-y-auto"
              style={{ boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}
            >
              <div className="flex items-center justify-between py-2 px-3 border-b border-slate-700">
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
                className="py-2 px-3 border-t border-slate-700 text-center text-[11px] text-slate-500 cursor-pointer"
              >
                Chiudi ▲
              </div>
            </div>
          )}
        </div>
        {/* Segnalazione 77: nuova tendina che legge davvero la colonna "stato
            pratica" (Nuovo / In lavorazione / Attivo / Annullato). */}
        <div className="relative flex-1 min-w-[180px]">
          <button
            type="button"
            onClick={() => setPraticaOpen(!praticaOpen)}
            className={inputStyle + " text-left flex items-center justify-between cursor-pointer"}
          >
            <span className={praticaSel.length === 0 ? "text-slate-500" : "text-slate-100"}>
              {praticaSel.length === 0
                ? "Tutti gli stati"
                : praticaSel.length === 1
                  ? praticaSel[0]
                  : `${praticaSel.length} stati selezionati`}
            </span>
            <span className="text-slate-500 text-[10px] ml-2">{praticaOpen ? "▲" : "▼"}</span>
          </button>
          {praticaOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg z-[999] shadow-xl max-h-60 overflow-y-auto"
              style={{ boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>
              <div className="flex items-center justify-between py-2 px-3 border-b border-slate-700">
                <span className="text-[11px] text-slate-500 font-semibold">
                  {praticaSel.length > 0 ? `${praticaSel.length} selezionati` : "Seleziona stati"}
                </span>
                {praticaSel.length > 0 && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); setPraticaSel([]); }}
                    className="bg-transparent border-none text-slate-500 text-[11px] cursor-pointer p-0">✕ Tutti</button>
                )}
              </div>
              {statiPraticaDisponibili.map((s) => {
                const sel = praticaSel.includes(s);
                return (
                  <div key={s} role="button" tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (sel) setPraticaSel(praticaSel.filter((x) => x !== s));
                      else setPraticaSel([...praticaSel, s]);
                    }}
                    className={`flex items-center gap-2.5 py-1.5 px-3 cursor-pointer ${sel ? "bg-indigo-900/40" : ""}`}>
                    <div className="w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0"
                      style={{ borderColor: sel ? "#6366f1" : "#475569", background: sel ? "#6366f1" : "transparent" }}>
                      {sel && <span className="text-black text-[9px] font-black">✓</span>}
                    </div>
                    <span className="text-[13px] text-slate-200">{s}</span>
                  </div>
                );
              })}
              <div role="button" tabIndex={0} onClick={() => setPraticaOpen(false)}
                className="py-2 px-3 border-t border-slate-700 text-center text-[11px] text-slate-500 cursor-pointer">Chiudi ▲</div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-slate-500 font-semibold whitespace-nowrap">PERIODO</span>
          <input type="date" value={periodoDA} onChange={(e) => setPeriodoDA(e.target.value)} className={inputStyle + " w-[138px]"} />
          <span className="text-slate-500 text-xs">→</span>
          <input type="date" value={periodoA} onChange={(e) => setPeriodoA(e.target.value)} className={inputStyle + " w-[138px]"} />
          {(periodoDA || periodoA) && (
            <button
              type="button"
              onClick={() => { setPeriodoDA(""); setPeriodoA(""); }}
              className="py-1 px-2.5 rounded-md text-[11px] cursor-pointer border border-slate-600 bg-transparent text-slate-500 whitespace-nowrap"
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
function Tabella({ rows, onSelect, canDelegate = false, members = [], onBulkDelegate }: {
  rows: TrackingRow[];
  onSelect: (row: TrackingRow) => void;
  canDelegate?: boolean;
  members?: { id: string; full_name: string }[];
  onBulkDelegate?: (ids: string[], toId: string) => void;
}) {
  const thStyle =
    "py-2.5 px-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-700 whitespace-nowrap";
  // Selezione multipla per delega rapida dalla dashboard.
  const [checked, setChecked] = useState<string[]>([]);
  const [bulkTo, setBulkTo] = useState("");
  const toggle = (id: string) => setChecked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const allOnPage = rows.map((r) => r.id);
  const allChecked = checked.length > 0 && allOnPage.every((id) => checked.includes(id));

  if (rows.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl py-12 px-12 text-center text-slate-500">
        Nessuna pratica trovata con i filtri selezionati.
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      {/* Barra delega rapida: compare quando selezioni una o piu' pratiche */}
      {canDelegate && checked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 py-2.5 px-3.5 bg-indigo-900/40 border-b border-indigo-700">
          <span className="text-[13px] font-bold text-indigo-200">{checked.length} pratic{checked.length === 1 ? "a" : "he"} selezionat{checked.length === 1 ? "a" : "e"}</span>
          <select value={bulkTo} onChange={(e) => setBulkTo(e.target.value)}
            className="bg-slate-900 border border-slate-600 rounded-lg text-slate-100 text-[13px] p-1.5 outline-none">
            <option value="">— Delega a… —</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
          <button type="button" disabled={!bulkTo}
            onClick={() => { onBulkDelegate?.(checked, bulkTo); setChecked([]); setBulkTo(""); }}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[13px] font-bold disabled:opacity-40">
            Delega
          </button>
          <button type="button" onClick={() => setChecked([])} className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 text-[13px]">Annulla</button>
          <span className="text-[11px] text-slate-400 ml-auto">Solo collaboratori del tuo punto vendita</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-900">
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
              <th className={thStyle + " text-center"}>MALUS</th>
              <th className={thStyle + " text-center"}>STATO PRATICA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const bg = isMalusRow(row) ? "#2d0a0a" : i % 2 === 0 ? "transparent" : "#172033";
              return (
                <tr
                  key={row.rowKey || row.id}
                  className="cursor-pointer transition-colors hover:!bg-indigo-900/30"
                  style={{ background: bg }}
                  onClick={() => onSelect(row)}
                >
                  {canDelegate && (
                    <td className="py-2.5 px-3.5 border-b border-slate-800" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked.includes(row.id)} onChange={() => toggle(row.id)} />
                    </td>
                  )}
                  <td className="py-2.5 px-3.5 border-b border-slate-800">
                    <CatBadge id={row.categoria} />
                  </td>
                  <td className="py-2.5 px-3.5 border-b border-slate-800 text-slate-100 text-[13px] font-semibold">{row.brand}</td>
                  <td className="py-2.5 px-3.5 border-b border-slate-800 text-slate-200 text-[13px]">{row.nominativo}</td>
                  <td className="py-2.5 px-3.5 border-b border-slate-800 text-slate-400 text-xs">{row.negozio}</td>
                  <td className="py-2.5 px-3.5 border-b border-slate-800 text-slate-400 text-xs">{row.venditore}</td>
                  <td className="py-2.5 px-3.5 border-b border-slate-800 text-slate-500 text-xs">{row.dataInserimento}</td>
                  <td className="py-2.5 px-3.5 border-b border-slate-800">
                    <StatoBadge id={row.statoNegozio} set="negozio" />
                  </td>
                  <td className="py-2.5 px-3.5 border-b border-slate-800">
                    <StatoBadge id={row.statoAdmin} set="admin" />
                  </td>
                  <td className="py-2.5 px-3.5 border-b border-slate-800 text-center">
                    {isMalusRow(row) ? (
                      <div className="inline-flex flex-col items-center gap-0.5">
                        <div className="bg-red-950 border border-red-600 rounded-md px-2.5 py-0.5 text-xs font-bold text-red-200">
                          € {calcolaMalus(row)}
                        </div>
                        <div className="text-[10px] text-slate-500">({MALUS_IMPORTO[row.categoria] ?? 0}€/gg)</div>
                      </div>
                    ) : (
                      <span className="text-slate-800 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 border-b border-slate-800 text-center">
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="py-2.5 px-4 border-t border-slate-700 text-slate-500 text-xs flex items-center gap-4">
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
}: {
  row: TrackingRow;
  onClose: () => void;
  onUpdate: (updated: TrackingRow) => void;
  members?: { id: string; full_name: string }[];
  canDelegate?: boolean;
  canEditAdmin?: boolean;
  onDelegate?: (rowId: string, toId: string | null) => void;
  delegatoNome?: string | null;
}) {
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
          utente: "Venditore",
          ruolo: "negozio",
        });
      }
      if (notaNegozio.trim()) {
        nuovaStoria.push({
          data: oggi,
          tipo: "nota_negozio",
          testo: notaNegozio.trim(),
          utente: "Venditore",
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
          utente: "Amministrazione",
          ruolo: "admin",
        });
      }
      if (notaAdmin.trim()) {
        nuovaStoria.push({
          data: oggi,
          tipo: "nota_admin",
          testo: notaAdmin.trim(),
          utente: "Amministrazione",
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
    "bg-slate-800 border border-slate-700 rounded-xl p-4 mb-3.5";

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
      <div className="pt-5 px-6 pb-0 border-b border-slate-800 flex-shrink-0">
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
          <div className="mt-3.5 p-3 rounded-lg border border-slate-700 bg-slate-900/60">
            <div className={labelStyle + " mb-2"}>Delega verifica a</div>
            {row.delegated_to && (
              <div className="mb-2 text-[12px] text-emerald-400">Attualmente delegata a <b>{delegatoNome || "collaboratore"}</b></div>
            )}
            <select value={row.delegated_to || ""} onChange={(e) => onDelegate?.(row.id, e.target.value || null)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-[13px] p-2 outline-none">
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
              <div className={panelStyle + " border-indigo-500 bg-slate-900/50"}>
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
              <div className={panelStyle + " border-green-700 bg-slate-900/50"}>
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
              <div className={panelStyle + " border-amber-700 bg-slate-900/50"}>
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
                        borderColor: sel ? s.color : "#334155",
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
                        <div><div className="text-[10px] text-slate-500 mb-0.5">Data</div><input type="date" value={fu.data} onChange={(e) => updateFollowup(idx, "data", e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-md text-slate-100 text-xs py-1 px-2 outline-none" /></div>
                        <div><div className="text-[10px] text-slate-500 mb-0.5">Esito</div><input type="text" value={fu.esito} onChange={(e) => updateFollowup(idx, "esito", e.target.value)} placeholder="es. Nessuna risposta" className="w-full bg-slate-800 border border-slate-700 rounded-md text-slate-100 text-xs py-1 px-2 outline-none" /></div>
                        <div className="col-span-2"><div className="text-[10px] text-slate-500 mb-0.5">Note</div><input type="text" value={fu.note} onChange={(e) => updateFollowup(idx, "note", e.target.value)} placeholder="es. Chiamato alle 10:30" className="w-full bg-slate-800 border border-slate-700 rounded-md text-slate-100 text-xs py-1 px-2 outline-none" /></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                value={notaNegozio}
                onChange={(e) => setNotaNegozio(e.target.value)}
                placeholder="Nota negozio (es: cliente contattato…)"
                className="w-full min-h-[68px] bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-[13px] p-2.5 resize-y outline-none box-border mb-2.5"
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
                        borderColor: sel ? s.color : "#334155",
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
              className="w-full min-h-[68px] bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-[13px] p-2.5 resize-y outline-none box-border mb-2.5"
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
            {isMalusRow(row) && (
              <div className="bg-red-950/50 border border-red-600 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-red-600 flex-shrink-0" />
                  <div className="text-xs font-bold text-red-200 uppercase tracking-wider">Malus maturato</div>
                  <div className="ml-auto bg-red-950 border border-red-600 rounded-md py-0.5 px-3 text-sm font-black text-red-200">
                    € {calcolaMalus(row)}
                  </div>
                </div>
                {(() => {
                  const ggAgg = giorniDaUltimoAggiornamento(row.storia, row.dataInserimento);
                  const soglia = MALUS_IMPORTO[row.categoria] ? 6 : 0;
                  const importo = MALUS_IMPORTO[row.categoria] ?? 0;
                  const giorniMalus = Math.max(0, ggAgg - (row.categoria === "piva" ? 6 : (row.categoria === "mnp" ? 6 : row.categoria === "fisso" ? 15 : row.categoria === "finanziamento" ? 6 : row.categoria === "energia" ? 15 : 2)) + 1);
                  return (
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="bg-red-950/50 rounded-lg p-2.5">
                        <div className="text-[10px] text-red-500 font-bold uppercase tracking-wider mb-1">Entrata in malus</div>
                        <div className="text-[13px] font-bold text-red-200">—</div>
                      </div>
                      <div className="bg-red-950/50 rounded-lg p-2.5">
                        <div className="text-[10px] text-red-500 font-bold uppercase tracking-wider mb-1">Giorni in malus</div>
                        <div className="text-[13px] font-bold text-red-200">{giorniMalus} gg</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{importo} €/gg lavorativo</div>
                      </div>
                      <div className="bg-red-950/50 rounded-lg p-2.5">
                        <div className="text-[10px] text-red-500 font-bold uppercase tracking-wider mb-1">Totale maturato</div>
                        <div className="text-base font-black text-red-300">€ {calcolaMalus(row)}</div>
                      </div>
                    </div>
                  );
                })()}
                <div className="mt-3 py-2 px-3 bg-red-950/30 rounded-md text-[11px] text-slate-400 italic">
                  Il malus si azzera quando la pratica viene aggiornata o portata a completamento.
                </div>
              </div>
            )}
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
  const seesAll = ["admin", "dev", "direttore_generale", "amministrativo"].includes(user?.role || "");
  const [allMembers, setAllMembers] = useState<{ id: string; full_name: string; primary_store: string | null }[]>([]);
  const [onlyMine, setOnlyMine] = useState(false); // "delegate a me"
  useEffect(() => {
    supabase.from("app_users").select("id, full_name, primary_store").eq("active", true).order("full_name")
      .then(({ data }) => setAllMembers((data ?? []) as any));
  }, []);
  // Il manager puo' delegare SOLO ai collaboratori del proprio punto vendita.
  const members = useMemo(() => {
    if (seesAll || !user?.negozio) return allMembers;
    const base = user.negozio.split(" ")[0].toLowerCase();
    return allMembers.filter((m) => (m.primary_store || "").toLowerCase().startsWith(base));
  }, [allMembers, seesAll, user?.negozio]);
  const memberName = useCallback((id?: string | null) => allMembers.find((m) => m.id === id)?.full_name || null, [allMembers]);

  // Segnalazione 30: il Tracking PDA caricava TUTTI i contratti senza alcun
  // filtro di ruolo, quindi chiunque vedeva le pratiche di ogni negozio.
  // Regola richiesta: sotto il livello manager solo le proprie pratiche e quelle
  // delegate; i manager tutto il proprio punto vendita; il supervisore i punti
  // vendita a cui e' associato; dall'amministrazione in su, tutto.
  const seesWhole = seesWholeStore(user?.role);
  const [visibleStores, setVisibleStores] = useState<string[]>([]);
  useEffect(() => {
    if (!user?.id || seesAll) { setVisibleStores([]); return; }
    (async () => {
      const [vis, us] = await Promise.all([
        supabase.from("user_store_visibility").select("store_name").eq("user_id", user.id),
        supabase.from("user_stores").select("store_name").eq("user_id", user.id),
      ]);
      const names = new Set<string>();
      (vis.data ?? []).forEach((r: Record<string, unknown>) => { if (r.store_name) names.add(String(r.store_name)); });
      (us.data ?? []).forEach((r: Record<string, unknown>) => { if (r.store_name) names.add(String(r.store_name)); });
      if (user.negozio) names.add(user.negozio);
      setVisibleStores([...names]);
    })();
  }, [user?.id, user?.negozio, seesAll]);

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
  // Segnalazione 77: filtro sullo stato pratica (colonna "stato"), separato
  // dagli esiti negozio.
  const [praticaSel, setPraticaSel] = useState<string[]>([]);
  const [selected, setSelected] = useState<TrackingRow | null>(null);
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  const [escludiConfermati, setEscludiConfermati] = useState(false);
  const [escludiCompletati, setEscludiCompletati] = useState(false);
  const [showRegole, setShowRegole] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Left join clients so contracts without a matching client still appear (avoids 0 rows).
      const selectCols =
        "id, brand, categoria, stato, venditore, negozio, codice_attivazione, data_registrazione, data, created_at, dettagli, delegated_to, delegated_by, stati_categoria, categoria_macro, controlli, clients(nome, cognome, ragione_sociale, cellulare, email, cf_piva, indirizzo, citta)";
      const { data: baseData, error: baseErr } = await supabase
        .from("contracts")
        .select(selectCols)
        .order("created_at", { ascending: false })
        .limit(500);

      if (baseErr) throw baseErr;

      // Optional: fetch tracking columns (requires migration 022). If it fails, we still show contracts with defaults.
      let trackingMap = new Map<string, { stato_negozio?: string; stato_admin?: string; storia?: StoriaEvent[]; stati_categoria?: Record<string, string> }>();
      const { data: trackingData, error: trackingErr } = await supabase
        .from("contracts")
        .select("id, stato_negozio, stato_admin, storia, stati_categoria")
        .order("created_at", { ascending: false })
        .limit(500);

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
      // I nomi non coincidono sempre ("Magliana" vs "Magliana Multi"): confronto
      // sul prefisso nei due sensi, come gia' altrove nel CRM.
      const sameStore = (a?: string | null, b?: string | null) => {
        const x = (a || "").trim().toLowerCase(), y = (b || "").trim().toLowerCase();
        return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
      };
      // Segnalazione 43: i prodotti venduti a marginalita' (brand "Extra") non
      // sono pratiche da lavorare — niente attivazione, niente stato, niente
      // malus — e sporcavano solo l'elenco. Fuori dal Tracking.
      // Fuori dal Tracking anche le Sostituzioni SIM: come gli Extra non sono
      // pratiche da lavorare (nessuna attivazione da seguire) e sporcavano
      // l'elenco. Richiesta di Francesco insieme alla visibilita' del Tecnico.
      const lavorabili = (list as RawRow[]).filter((r: Record<string, unknown>) => {
        const b = String(r.brand || "").trim().toLowerCase();
        const p = String(r.prodotto || "").trim().toLowerCase();
        return b !== "extra" && !/sost/.test(p);
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
    fetchData();
  }, [fetchData]);

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
  useEffect(() => {
    if (deepLinked.current) return;
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("q");
    if (q) { setSearch(q); deepLinked.current = true; }
  }, []);

  const data: TrackingRow[] = useMemo(() => {
    const out: TrackingRow[] = [];
    rawList.forEach((r) => {
      const base = mapContractToTrackingRow(r, r.clients as Record<string, unknown> | null, (r.dettagli as Record<string, unknown>) || null);
      const cats = righeTracking(base.categoria as never, (base.controlli || []) as never);
      // Segnalazione 66: ogni riga ha il proprio esito. Quello della categoria e'
      // in stati_categoria; se manca si eredita da stato_negozio, cosi' le
      // pratiche gia' lavorate non perdono lo stato.
      const perCat = (r.stati_categoria as Record<string, string> | undefined) || {};
      cats.forEach((c) => out.push({
        ...base,
        categoria: c,
        rowKey: `${base.id}#${c}`,
        statoNegozio: perCat[c] ?? base.statoNegozio,
      }));
    });
    return out;
  }, [rawList]);

  const statiPraticaDisponibili = useMemo(
    () => Array.from(new Set(data.map((r) => r.statoPratica).filter((x) => x && x !== "—"))).sort(),
    [data]
  );

  const deepOpened = useRef(false);
  useEffect(() => {
    if (deepOpened.current || data.length === 0) return;
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    const hit = data.find((r) => r.id === id);
    if (hit) { setSelected(hit); deepOpened.current = true; }
  }, [data]);

  const statiConfermato = ["confermato", "pagato", "stornato"];
  const statiCompletatiNegozio = ["attivato", "liquidato", "completo_sky", "attivo_sky"];

  const filtered = useMemo(() => {
    return data.filter((row) => {
      if (escludiConfermati && statiConfermato.includes(row.statoAdmin)) return false;
      if (escludiCompletati && statiCompletatiNegozio.includes(row.statoNegozio)) return false;
      if (onlyMine && row.delegated_to !== user?.id) return false; // "delegate a me"
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
      if (venditoreSel && row.venditore !== venditoreSel) return false;
      if (statoSel.length > 0 && !statoSel.includes(row.statoNegozio)) return false;
      if (praticaSel.length > 0 && !praticaSel.includes(row.statoPratica)) return false;
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
  }, [data, catSel, brandSel, search, statoSel, praticaSel, kpiFilter, periodoDA, periodoA, escludiConfermati, escludiCompletati, onlyMine, user?.id, venditoreSel]);

  const filteredPerKpi = useMemo(() => {
    return data.filter((row) => {
      if (escludiConfermati && statiConfermato.includes(row.statoAdmin)) return false;
      if (escludiCompletati && statiCompletatiNegozio.includes(row.statoNegozio)) return false;
      if (catSel.length > 0 && !catSel.includes(row.categoria)) return false;
      if (brandSel.length > 0 && !brandSel.includes(row.brand)) return false;
      if (venditoreSel && row.venditore !== venditoreSel) return false;
      if (statoSel.length > 0 && !statoSel.includes(row.statoNegozio)) return false;
      if (praticaSel.length > 0 && !praticaSel.includes(row.statoPratica)) return false;
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
  }, [data, catSel, brandSel, search, statoSel, praticaSel, periodoDA, periodoA, escludiConfermati, escludiCompletati]);

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
      const attuali = (rawList.find((r) => (r.id as string) === updated.id)?.stati_categoria as Record<string, string>) || {};
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
            <h2 className="text-2xl font-bold text-white mb-1">Tracking PDA</h2>
            <p className="text-slate-400 text-sm">Monitoraggio pratiche: esito negozio, esito admin, storico e malus</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Filtro "Delegate a me" (richiesta Luca #6) */}
            <button
              type="button"
              onClick={() => setOnlyMine((v) => !v)}
              className={"px-4 py-2 rounded-lg border text-[13px] font-bold transition-colors " + (onlyMine ? "border-emerald-500 bg-emerald-500/15 text-emerald-300" : "border-slate-600 text-slate-300 hover:bg-white/5")}
            >
              👤 Delegate a me
            </button>
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
              className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-[820px] max-h-[88vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between py-5 px-7 border-b border-slate-700">
                <div>
                  <div className="text-lg font-extrabold text-slate-100">📋 Regole di Ingaggio — Tracking PDA</div>
                  <div className="text-xs text-slate-500 mt-0.5">Soglie temporali per evitare Da Lavorare, Warning e Malus</div>
                </div>
                <button type="button" onClick={() => setShowRegole(false)} className="bg-transparent border-none text-slate-500 text-xl cursor-pointer leading-none p-0">
                  ✕
                </button>
              </div>
              <div className="mx-7 mt-4 py-2.5 px-3.5 bg-slate-900 rounded-lg text-xs text-slate-400">
                <strong className="text-slate-100">Come funziona: </strong>
                tutti i giorni sono <strong className="text-slate-100">lavorativi (lun–sab)</strong>.
                I filtri sono mutualmente esclusivi: 🔴 Malus &gt; ⚠️ Warning &gt; ⚡ Da Lavorare. Le pratiche completate non appaiono in nessun filtro.
              </div>
              <div className="p-5">
                {[
                  { cat: "MNP", color: "#38bdf8", dl: ["≥ 2 gg senza aggiornamento storico"], warn: ["≥ 5 gg senza aggiornamento storico", "Non completata (≠ Completato / Re-Inserita) da ≥ 5 gg"], malus: ["≥ 6 gg senza aggiornamento storico → €5/gg"] },
                  { cat: "Fisso", color: "#818cf8", dl: ["≥ 5 gg senza aggiornamento storico"], warn: ["≥ 10 gg senza aggiornamento storico", "Non completata (≠ Completato) da ≥ 20 gg"], malus: ["≥ 15 gg senza aggiornamento storico → €10/gg"] },
                  { cat: "Finanziamento", color: "#f59e0b", dl: ["≥ 2 gg senza aggiornamento storico"], warn: ["≥ 4 gg senza aggiornamento storico"], malus: ["≥ 6 gg senza aggiornamento storico → €10/gg"] },
                  { cat: "P.IVA", color: "#a78bfa", dl: ["≥ 2 gg senza aggiornamento storico", "Sempre se stato = Cliente Irreperibile"], warn: ["≥ 4 gg senza aggiornamento storico", "Non completata da ≥ 10 gg", "Cliente Irreperibile non aggiornato da > 2 gg"], malus: ["Soglia non ancora definita (non attivo)"] },
                  { cat: "Energia", color: "#22c55e", dl: ["≥ 5 gg senza aggiornamento storico"], warn: ["≥ 10 gg senza aggiornamento storico"], malus: ["≥ 15 gg senza aggiornamento storico → €10/gg"] },
                  { cat: "Sky", color: "#6366f1", dl: ["Stato Nuovo da ≥ 2 gg dall'inserimento", "Sempre in stato WM Sospetta", "Attesa Matricola senza aggiornamento da ≥ 5 gg", "Aperto Sparks senza aggiornamento da ≥ 3 gg"], warn: ["Stato Nuovo da ≥ 4 gg dall'inserimento", "≥ 10 gg senza aggiornamento (qualsiasi stato)"], malus: ["Soddisfa Warning + ≥ 2 gg ulteriori senza aggiornamento → €5/gg"] },
                ].map((r) => (
                  <div key={r.cat} className="mb-4 rounded-xl border border-slate-700 overflow-hidden">
                    <div className="flex items-center gap-2.5 py-2.5 px-4 bg-slate-900 border-b border-slate-700">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
                      <div className="text-[13px] font-extrabold" style={{ color: r.color }}>{r.cat}</div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3">
                      {[
                        { label: "⚡ Da Lavorare", rules: r.dl, col: "#eab308", bg: "#1c1708" },
                        { label: "⚠️ Warning", rules: r.warn, col: "#f97316", bg: "#1c0e05" },
                        { label: "🔴 Malus", rules: r.malus, col: "#ef4444", bg: "#1c0505" },
                      ].map((col, ci) => (
                        <div key={ci} className="p-3 border-b sm:border-b-0 sm:border-r border-slate-700 last:border-r-0" style={{ background: col.bg }}>
                          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: col.col }}>{col.label}</div>
                          {col.rules.map((rule, ri) => (
                            <div key={ri} className="flex gap-1.5 mb-1 items-start">
                              <span className="flex-shrink-0 mt-0.5 text-[10px]" style={{ color: col.col }}>•</span>
                              <span className="text-[11px] text-slate-200 leading-snug">{rule}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="py-3.5 px-7 border-t border-slate-700 flex justify-end">
                <button type="button" onClick={() => setShowRegole(false)} className="bg-indigo-600 border-none rounded-lg text-white text-[13px] font-bold py-2 px-5 cursor-pointer">
                  Chiudi
                </button>
              </div>
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
              escludiConfermati={escludiConfermati}
              setEscludiConfermati={setEscludiConfermati}
              escludiCompletati={escludiCompletati}
              setEscludiCompletati={setEscludiCompletati}
            />
            <FilterBar
              catSel={catSel}
              setCatSel={setCatSel}
              search={search}
              setSearch={setSearch}
              statoSel={statoSel}
              praticaSel={praticaSel}
              setPraticaSel={setPraticaSel}
              statiPraticaDisponibili={statiPraticaDisponibili}
              setStatoSel={setStatoSel}
              periodoDA={periodoDA}
              setPeriodoDA={setPeriodoDA}
              periodoA={periodoA}
              setPeriodoA={setPeriodoA}
              brandSel={brandSel}
              setBrandSel={setBrandSel}
              venditoreSel={venditoreSel}
              setVenditoreSel={setVenditoreSel}
              venditori={seesWhole && !seesAll ? members.map((m) => m.full_name) : []}
            />
            <Tabella rows={filtered} onSelect={setSelected} canDelegate={canDelegate} members={members} onBulkDelegate={handleBulkDelegate} />
          </>
        )}

        {selected && (
          <Drawer row={selected} onClose={() => setSelected(null)} onUpdate={handleUpdate}
            members={members} canDelegate={canDelegate} canEditAdmin={canEditAdmin} onDelegate={handleDelegate} delegatoNome={memberName(selected.delegated_to)} />
        )}
      </div>
    </div>
  );
}
