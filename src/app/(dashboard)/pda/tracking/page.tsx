"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { seesWholeStore } from "@/lib/roles";
import { capAllowed, CAP_TRACKING, CAP_TRACKING_ESITO_ADMIN } from "@/lib/capabilities";
import { useRolePermissions } from "@/lib/usePermissions";
import { useVisibleStores, sameStore } from "@/lib/visibleStores";
import { categoriaDi, controlliDi, righeTracking, vaInTracking } from "@/lib/tassonomia";
import { trkBrandKey, TRK_BRAND_COLORS, TRK_LOGO_SCALE, TRK_BRAND_LOGOS, TRK_BADGE_OFFSET, TRK_BADGE_OFFSET_DEFAULT } from "@/lib/brandAssets";
import { caricaTutte } from "@/lib/fetchTutte";
import { statoContrattoDa } from "./trackingHelpers";
import {
  CATEGORIE,
  ALL_BRANDS,
  MALUS_IMPORTO,
  type TrackingRow,
  type StoriaEvent,
  type FollowUpItem,
} from "./trackingConstants";
import {
  getStatiNegozioPerCategoria,
  getStatiNegozioTutte,
  getStatoN,
  getStatoA,
  getCat,
  isAttenzioneRow,
  isDaLavorareRow,
  isMalusRow,
  calcolaMalus,
  impostaRegoleTracking,
  impostaEsitiTracking,
  impostaCalendarioChiusure,
  impostaFerieResponsabili, impostaFerieVenditori,
  esitoCompletato,
  getStatiAdminPerCategoria,
  esitoAdminDefinitivo,
} from "./trackingHelpers";
import { RegoleTracking } from "./RegoleTracking";
import { VoceAnnidata } from "@/components/VoceAnnidata";
import { ArchivioMalus, StatoEpisodioBadge } from "./ArchivioMalus";
import { type EpisodioMalus, sincronizzaMalusStorico, totaliEpisodi, formatDataIt, impostaAgentiBOMalus, impostaDelegheMalus, impostaFuoriServizio } from "./malusStorico";

type RawRow = Record<string, unknown> & {
  clients?: Record<string, unknown> | null;
  dettagli?: Record<string, unknown> | null;
};

// MONDO AGENZIA (13/08, «non riesco a capire»): mappa nome agente → nome del
// back office che lo ha in carico (app_users.back_office_id). Riempita da
// fetchData PRIMA di posare le righe e letta al render per il badge 🏢 —
// così ANCHE chi vede tutto (admin) capisce a colpo d'occhio quali pratiche
// sono degli agenti e chi ne risponde.
let AGENTI_BO: Record<string, string> = {};
// pratiche RIASSEGNATE (licenziamenti): contract_id → nome del delegato, per
// il badge 📦 in riga e l'intestazione dei malus (Luca 21/08)
let DELEGHE: Record<string, string> = {};
// nel FILTRO utente e nelle tendine l'agente compare col nome del suo
// responsabile (risposta Luca 13/08: «trovo ancora Berdini e non Coviello»)
const nomeResponsabile = (v: string) => AGENTI_BO[v] || v;
// responsabile EFFICACE della riga (Luca 24/08, caso Verdile→Goretti): la
// pratica DELEGATA risponde al filtro del delegato — il badge 📦 in riga
// continua a dire che è stata attivata dal vecchio venditore
const respRiga = (row: { id?: unknown; venditore?: unknown }) => DELEGHE[String(row.id || "")] || nomeResponsabile(String(row.venditore || ""));
// REGOLA DELEGHE (Luca 24/08 sera): la pratica delegata è di ENTRAMBI —
// warning e malus pesano sia sul delegato sia sul venditore che l'ha
// venduta, quindi filtri e tendine devono trovarla con TUTTI E DUE i nomi.
const respRigaTutti = (row: { id?: unknown; venditore?: unknown }): string[] => {
    const base = nomeResponsabile(String(row.venditore || ""));
    const del = DELEGHE[String(row.id || "")];
    return del && del !== base ? [del, base] : [base];
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
    tracking_nascosto: !!c.tracking_nascosto,
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
// categoria+brand: dal pannello la stessa chiave puo' avere etichette diverse
// per categoria/operatore — senza contesto il badge pescherebbe quella sbagliata
function StatoBadge({ id, set, categoria, brand }: { id: string; set: "admin" | "negozio"; categoria?: string; brand?: string | null }) {
  const s = set === "admin" ? getStatoA(id) : getStatoN(id, categoria, brand);
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap border"
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
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap border"
      style={{ color: c.color, background: c.color + "18", borderColor: c.color + "4d" }}
    >
      {c.label}
    </span>
  );
}

// ─── KpiBar ───────────────────────────────────────────────────────────────────
// Chiave brand normalizzata, colori, scala ottica e loghi vivono in
// src/lib/brandAssets (RIC-01): condivisi con le tessere di Ricerca Vendite.
// Ordine voluto da Luca (03/08): W3, Sky, VF, S4, FW; gli altri a seguire.
const TRK_BRAND_PRIORITA = ["windtre", "sky", "vodafone", "s4", "energy", "fastweb"];
const ordinaBrandTracking = (arr: string[]) => [...arr].sort((a, b) => {
  const ia = TRK_BRAND_PRIORITA.indexOf(trkBrandKey(a));
  const ib = TRK_BRAND_PRIORITA.indexOf(trkBrandKey(b));
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a.localeCompare(b);
});

function KpiBar({
  data,
  onFilter,
  activeFilter,
  storicoTotale,
  onApriStorico,
  brands,
  brandSel,
  setBrandSel,
  dataBrand,
}: {
  data: TrackingRow[];
  onFilter: (f: string | null) => void;
  activeFilter: string | null;
  brands: string[];
  brandSel: string[];
  setBrandSel: (v: string[]) => void;
  dataBrand: TrackingRow[];
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
    { label: "Totale Monitorati", emoji: "📡", val: totale, color: "var(--tf-94a3b8)", filter: null as string | null },
    { label: "Nuovi", emoji: "🆕", val: nuovi, color: "var(--tf-60a5fa)", filter: "nuovo" },
    { label: "Da Lavorare", emoji: "⚡", val: daLavorare, color: "var(--tf-eab308)", filter: "__da_lavorare__" },
    { label: "Warning", emoji: "⚠️", val: problema, color: "var(--tf-f97316)", filter: "__attenzione__" },
    { label: "Malus", emoji: "🔴", val: malusCount, color: "var(--tf-ef4444)", filter: "__malus__" },
    { label: "Non Conforme", emoji: "🚫", val: nonConformi, color: "var(--tf-a78bfa)", filter: "__non_conforme__" },
  ];

  return (
    <div>
      {/* Card KPI in stile Gestione Usati (Luca 10/08): testo a sinistra,
          attiva = colori dello stato + ring, spenta = velatura + opacita' */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
        {cards.map((c) => {
          const isActive = activeFilter === c.filter;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => onFilter(isActive ? null : c.filter)}
              className={"px-3 py-3 rounded-xl border transition-all text-left overflow-hidden " +
                (isActive ? "ring-1 ring-white/10" : "bg-white/[0.02] border-white/5 opacity-70 hover:opacity-100 hover:border-white/10")}
              style={isActive ? { background: c.color + "1a", borderColor: c.color + "66" } : undefined}
            >
              <div className="flex items-center gap-1.5 mb-1 min-w-0">
                <span className="text-base flex-shrink-0">{c.emoji}</span>
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide truncate"
                  style={{ color: isActive ? c.color : "var(--tf-64748b)" }}>
                  {c.label}{isActive ? " ✓" : ""}
                </span>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-xl sm:text-2xl font-bold" style={{ color: isActive ? c.color : "#fff" }}>{c.val}</span>
                {/* maturati + storico accanto al numero (Luca 03/08): card bassa come le altre */}
                {c.filter === "__malus__" && (
                  <span className="pb-0.5 text-left min-w-0">
                    {malusTotale > 0 && <span className="block text-[10px] font-bold leading-tight" style={{ color: isActive ? "var(--tf-fca5a5)" : "var(--tf-94a3b8)" }}>€ {malusTotale.toFixed(0)} maturati</span>}
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
            </button>
          );
        })}
      </div>
      {/* BRAND in prima linea (Luca 03/08): SOLO LOGHI, griglia a N colonne
          uguali larga quanto la fila di card sopra. Tutti attivi all'ingresso;
          click = filtro esclusivo, riclick = di nuovo tutti (Ricerca Vendite). */}
      {brands.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${brands.length}, minmax(0, 1fr))` }}>
          {brands.map((b) => {
            const color = TRK_BRAND_COLORS[trkBrandKey(b)] || "var(--tf-94a3b8)";
            const logo = TRK_BRAND_LOGOS[trkBrandKey(b)];
            const esclusivo = brandSel.length === 1 && brandSel[0] === b;
            const on = brandSel.length === 0 || brandSel.includes(b);
            // quante pratiche di QUESTO brand col filtro KPI applicato (Luca 03/08)
            const contaKpi = (r: TrackingRow) => {
              if (!activeFilter) return true;
              if (activeFilter === "__attenzione__") return isAttenzioneRow(r) && !isMalusRow(r);
              if (activeFilter === "__da_lavorare__") return isDaLavorareRow(r) && !isMalusRow(r);
              if (activeFilter === "__malus__") return isMalusRow(r);
              if (activeFilter === "__non_conforme__") return r.statoAdmin === "non_conforme";
              return r.statoNegozio === activeFilter;
            };
            const nBrand = dataBrand.filter((r) => r.brand === b && contaKpi(r)).length;
            const colBadge = activeFilter ? (cards.find((c) => c.filter === activeFilter)?.color || "var(--tf-94a3b8)") : "var(--tf-94a3b8)";
            return (
              <button key={b} type="button"
                onClick={() => setBrandSel(esclusivo ? [] : [b])}
                title={esclusivo ? b + " — filtro attivo, clicca per tornare a tutti" : "Mostra solo " + b + (activeFilter ? " (conteggio sul filtro attivo)" : "")}
                aria-label={b}
                className="relative rounded-xl border flex items-center justify-center transition-all cursor-pointer"
                style={{
                  height: 72,
                  borderColor: esclusivo ? color + "99" : "var(--tf-w60)",
                  background: esclusivo ? color + "18" : "var(--tf-w20)",
                  boxShadow: esclusivo ? `0 0 0 1px rgba(255,255,255,.10)` : "none",
                  opacity: on ? 1 : .35,
                  filter: on ? "none" : "grayscale(1)",
                }}>
                {logo ? (
                  <img src={logo} alt={b} style={{ maxHeight: 56, maxWidth: "92%", objectFit: "contain", display: "block", transform: `scale(${TRK_LOGO_SCALE[trkBrandKey(b)] || 1})` }} />
                ) : /marginal/i.test(b) ? (
                  /* P&M: stesso simbolo 💰 della tessera di Registra Vendita
                     (Luca 10/08: "mettici il simbolo come gli altri") */
                  <span title={b} style={{ fontSize: 40, lineHeight: 1 }}>💰</span>
                ) : (
                  <span className="text-xs font-bold" style={{ color: on ? color : "var(--tf-586174)" }}>{b}</span>
                )}
                {/* numeretto ADIACENTE alla spalla destra del logo, in alto —
                    "come parte del logo ma staccato" (Luca 04/08): ancorato al
                    CENTRO + offset per-brand (le larghezze visive dei marchi
                    variano); fondo solido perché i loghi scalati sbordano. */}
                <span className="absolute text-[11px] font-black leading-none px-1.5 py-[3px] rounded-full"
                  style={{ left: `calc(50% + ${TRK_BADGE_OFFSET[trkBrandKey(b)] ?? TRK_BADGE_OFFSET_DEFAULT}px)`, top: 8, zIndex: 1, color: colBadge, background: "var(--tf-0d1424)", border: `1px solid ${colBadge}66`, opacity: nBrand === 0 ? .5 : 1 }}>
                  {nBrand}
                </span>
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

// ─── FiltroTendina ───────────────────────────────────────────────────────────
// Tendina filtri in stile Gestione Usati (Luca 10/08): label dentro il bottone,
// pannello scuro con ricerca sopra le 12 voci, spunte indaco, pallino colore
// per gli esiti. `single` = scelta singola con voce "Tutti" (vuoto = nessun filtro).
function FiltroTendina({ label, options, selected, onChange, single = false }: {
  label: string;
  options: { id: string; label: string; color?: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  single?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [cerca, setCerca] = useState("");
  const visibili = cerca.trim() ? options.filter((o) => o.label.toLowerCase().includes(cerca.trim().toLowerCase())) : options;
  const mostrate = visibili.slice(0, 200);
  const nascoste = visibili.length - mostrate.length;
  const nomeDi = (id: string) => options.find((o) => o.id === id)?.label || id;
  const testo = selected.length === 0 ? `${label} (Tutti)`
    : selected.length <= 2 ? selected.map(nomeDi).join(", ")
      : `${label} (${selected.length})`;
  const chiudi = () => { setOpen(false); setCerca(""); };
  const toggle = (id: string) => {
    if (single) { onChange(selected[0] === id ? [] : [id]); chiudi(); return; }
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  return (
    <div className="relative">
      <button type="button" onClick={() => (open ? chiudi() : setOpen(true))}
        className="w-full sm:w-auto flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-300 hover:bg-white/10 transition-all min-w-[140px]">
        <span className="flex-1 text-left truncate">{testo}</span>
        <span className="text-[10px] text-slate-500">{open ? "▲" : "▼"}</span>
      </button>
      {open && <>
        <div className="fixed inset-0 z-40" onClick={chiudi} />
        <div className="absolute top-full mt-1 left-0 z-50 bg-[#12141f] border border-white/10 rounded-xl shadow-2xl w-64 max-h-80 overflow-auto py-1">
          {options.length > 12 && (
            <div className="px-2 pt-1.5 pb-2 border-b border-white/5 sticky top-0 bg-[#12141f] z-10">
              <input value={cerca} onChange={(e) => setCerca(e.target.value)} autoFocus placeholder="Scrivi per filtrare…"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-400/50" />
            </div>
          )}
          <div className="px-3 py-2 text-[11px] font-bold uppercase text-indigo-400 border-b border-white/5 cursor-pointer hover:bg-white/5"
            onClick={() => { onChange([]); if (single) chiudi(); }}>
            {single || selected.length === 0 ? "Tutti" : "✕ Deseleziona tutto"}
          </div>
          {visibili.length === 0 && <div className="px-3 py-2.5 text-xs text-slate-500">Nessuna voce corrispondente</div>}
          {mostrate.map((o) => {
            const sel = selected.includes(o.id);
            return (
              <div key={o.id} onClick={() => toggle(o.id)}
                className={"flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-white/5 transition-colors " + (sel ? "bg-indigo-500/10 text-indigo-300" : "text-slate-300")}>
                <div className={"w-4 h-4 rounded flex items-center justify-center border text-[10px] flex-shrink-0 " + (sel ? "bg-indigo-500 border-indigo-500 text-white" : "border-white/20")}>
                  {sel && "✓"}
                </div>
                {o.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: o.color }} />}
                <span className="truncate">{o.label}</span>
              </div>
            );
          })}
          {nascoste > 0 && (
            <div className="px-3 py-2 text-[11px] font-semibold text-amber-300/90 bg-amber-500/[0.06] border-t border-white/5">
              … scrivi per vedere gli altri {nascoste}
            </div>
          )}
        </div>
      </>}
    </div>
  );
}

// ─── FilterBar ───────────────────────────────────────────────────────────────
function FilterBar({
  categorie,
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
  // PDA-01: i chip Categoria arrivano dal chiamante, gia' ristretti alle
  // categorie con pratiche visibili (via i 5 chip morti mobile/tv/digitale/...).
  categorie: { id: string; label: string; color: string }[];
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
  // Togliendo una categoria si azzera il filtro esiti (comportamento storico
  // dei chip: gli esiti selezionati potrebbero non esistere piu' nel pool).
  const cambiaCat = (v: string[]) => {
    if (v.length < catSel.length) setStatoSel([]);
    setCatSel(v);
  };

  let pools: { id: string; label: string; color: string }[] = [];
  if (catSel.length === 0) {
    // Solo gli esiti delle categorie realmente presenti: entrano gli stati Sky
    // (prima assenti), escono quelli delle categorie morte (PDA-01).
    pools = [
      ...categorie.flatMap((cat) => getStatiNegozioTutte(cat.id)),
    ];
  } else {
    pools = catSel.flatMap((cid) => getStatiNegozioTutte(cid));
  }
  const seen = new Set<string>();
  const statiDisponibili = pools.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  // Stile campi in linea con Gestione Usati (Luca 10/08)
  const inputCls = "px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm outline-none hover:bg-white/10 transition-all min-w-0";
  const haFiltri = catSel.length > 0 || statoSel.length > 0 || utentiSel.length > 0
    || !!negozioSel || !!venditoreSel || !!periodoDA || !!periodoA || !!search.trim();
  const reset = () => {
    setCatSel([]); setStatoSel([]); setUtentiSel([]); setNegozioSel("");
    setVenditoreSel(""); setPeriodoDA(""); setPeriodoA(""); setSearch("");
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-3 px-4 sm:px-6 pb-3">
        <FiltroTendina label="Categoria" options={categorie} selected={catSel} onChange={cambiaCat} />
        {negozi.length > 0 && (
          <FiltroTendina label="Negozio" single options={negozi.map((n) => ({ id: n, label: n }))}
            selected={negozioSel ? [negozioSel] : []} onChange={(v) => setNegozioSel(v[0] || "")} />
        )}
        {venditori.length > 0 && (
          <FiltroTendina label="Venditore" single options={venditori.map((n) => ({ id: n, label: n }))}
            selected={venditoreSel ? [venditoreSel] : []} onChange={(v) => setVenditoreSel(v[0] || "")} />
        )}
        {/* Segnalazione 77: questa tendina elenca gli ESITI NEGOZIO, non gli stati pratica. */}
        <FiltroTendina label="Esito negozio" options={statiDisponibili} selected={statoSel} onChange={setStatoSel} />
        {/* Filtro UTENTE multi (Luca 03/08): amministrazione in su; opzioni dalle
            pratiche VISIBILI col negozio selezionato. */}
        {utenti.length > 0 && (
          <FiltroTendina label="Utente" options={utenti.map((n) => ({ id: n, label: n }))}
            selected={utentiSel} onChange={setUtentiSel} />
        )}
        <input type="date" value={periodoDA} onChange={(e) => setPeriodoDA(e.target.value)}
          title="Periodo: dal" className={inputCls + " w-full sm:w-36 text-slate-400"} />
        <input type="date" value={periodoA} onChange={(e) => setPeriodoA(e.target.value)}
          title="Periodo: al" className={inputCls + " w-full sm:w-36 text-slate-400"} />
        {haFiltri && (
          <button type="button" onClick={reset}
            className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-400 hover:bg-white/10 transition-all">
            ↺ Reset
          </button>
        )}
      </div>
      <div className="px-4 sm:px-6 pb-5">
        <div className="relative w-full">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per nominativo, n° contratto, negozio…"
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-base text-slate-300 outline-none focus:border-white/20 transition-all"
          />
        </div>
      </div>
    </>
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
  // th in stile Gestione Usati (Luca 10/08): sticky dentro la lista scrollabile
  const thStyle =
    "px-4 py-3 text-left text-[11px] text-slate-500 uppercase font-semibold tracking-wide border-b border-white/5 bg-[#12141f] sticky top-0 whitespace-nowrap";
  const tdStyle = "px-4 py-3";
  // Selezione multipla per delega rapida dalla dashboard.
  const [checked, setChecked] = useState<string[]>([]);
  const [bulkTo, setBulkTo] = useState("");
  const toggle = (id: string) => setChecked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const allOnPage = rows.map((r) => r.id);
  const allChecked = checked.length > 0 && allOnPage.every((id) => checked.includes(id));

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 py-16 px-12 text-center text-slate-600 text-sm">
        Nessuna pratica trovata con i filtri selezionati.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/5 overflow-hidden">
      {/* Barra delega rapida: compare quando selezioni una o piu' pratiche */}
      {canDelegate && checked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-indigo-500/10 border-b border-indigo-500/30">
          <span className="text-[13px] font-bold text-indigo-200">{checked.length} pratic{checked.length === 1 ? "a" : "he"} selezionat{checked.length === 1 ? "a" : "e"}</span>
          <select value={bulkTo} onChange={(e) => setBulkTo(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-200 outline-none hover:bg-white/10 transition-all">
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
            <tr>
              {canDelegate && (
                <th className={thStyle + " w-8"}>
                  <input type="checkbox" checked={allChecked}
                    onChange={() => setChecked(allChecked ? [] : allOnPage)} title="Seleziona tutte" />
                </th>
              )}
              <th className={thStyle}>Categoria</th>
              <th className={thStyle}>Brand</th>
              <th className={thStyle}>Nominativo</th>
              <th className={thStyle}>Negozio</th>
              <th className={thStyle}>Venditore</th>
              <th className={thStyle}>Data</th>
              <th className={thStyle}>Esito negozio</th>
              <th className={thStyle}>Esito admin</th>
              <th className={thStyle + " text-center"}>Stato pratica</th>
              <th className={thStyle + " text-center"}>Malus</th>
              {canDelete && <th className={thStyle + " w-10 text-center"}>🗑</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              // RIGHE SFUMATE (Luca 03/08, ammorbidite 10/08 sul look Usati):
              // la fase colora la riga con un velo che sfuma da sinistra +
              // barretta colore; niente zebra (come Gestione Usati).
              const fase = isMalusRow(row) ? "malus" : isAttenzioneRow(row) ? "warning" : isDaLavorareRow(row) ? "lavorare" : "";
              const cFase = fase === "malus" ? "var(--tf-ef4444)" : fase === "warning" ? "var(--tf-f97316)" : fase === "lavorare" ? "var(--tf-eab308)" : "";
              const bg = fase
                ? `linear-gradient(90deg, ${cFase}1c, ${cFase}06 45%, transparent 70%)`
                : "transparent";
              return (
                <tr
                  key={row.rowKey || row.id}
                  className="border-b border-white/[0.03] cursor-pointer transition-colors group hover:!bg-white/[0.04]"
                  style={{ background: bg, boxShadow: fase ? `inset 3px 0 0 ${cFase}` : "none" }}
                  onClick={() => onSelect(row)}
                >
                  {canDelegate && (
                    <td className={tdStyle} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked.includes(row.id)} onChange={() => toggle(row.id)} />
                    </td>
                  )}
                  <td className={tdStyle}>
                    <CatBadge id={row.categoria} />
                  </td>
                  <td className={tdStyle + " text-sm font-semibold text-slate-200 whitespace-nowrap"}>{row.brand}</td>
                  <td className={tdStyle + " text-sm font-medium text-slate-200 group-hover:text-white transition-colors"}>{row.nominativo}</td>
                  <td className={tdStyle + " text-sm text-slate-400 whitespace-nowrap"}>{row.negozio}</td>
                  <td className={tdStyle + " text-sm text-slate-400 whitespace-nowrap"}>
                    {row.venditore}
                    {DELEGHE[row.id] && (
                      <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-fuchsia-500/15 border border-fuchsia-400/30 text-[10px] font-bold text-fuchsia-200"
                        title={`Pratica riassegnata: era di ${row.venditore}, ora in carico a ${DELEGHE[row.id]}`}>
                        📦 {DELEGHE[row.id]}
                      </span>
                    )}
                    {AGENTI_BO[row.venditore] && (
                      <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border bg-indigo-500/10 border-indigo-500/30 text-indigo-300 whitespace-nowrap"
                        title={`Agente esterno: la pratica è in carico al back office ${AGENTI_BO[row.venditore]}`}>
                        🏢 {AGENTI_BO[row.venditore]}
                      </span>
                    )}
                  </td>
                  <td className={tdStyle + " text-xs text-slate-500 whitespace-nowrap"}>{row.dataInserimento}</td>
                  <td className={tdStyle}>
                    <StatoBadge id={row.statoNegozio} set="negozio" categoria={row.categoria} brand={row.brand} />
                  </td>
                  <td className={tdStyle}>
                    <StatoBadge id={row.statoAdmin} set="admin" />
                  </td>
                  <td className={tdStyle + " text-center"}>
                    {isMalusRow(row) ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-red-500/10 text-red-400 border-red-500/30 whitespace-nowrap">
                        🔴 Malus
                      </span>
                    ) : isAttenzioneRow(row) ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-orange-500/10 text-orange-400 border-orange-500/30 whitespace-nowrap">
                        ⚠️ Warning
                      </span>
                    ) : isDaLavorareRow(row) ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-amber-500/10 text-amber-400 border-amber-500/30 whitespace-nowrap">
                        ⚡ Da Lavorare
                      </span>
                    ) : (
                      <span className="text-slate-700 text-xs">—</span>
                    )}
                  </td>
                  <td className={tdStyle + " text-center"}>
                    {(() => {
                      // Oltre al malus che sta maturando ADESSO, la colonna dice
                      // quanto la pratica ha gia' generato in passato (episodi
                      // archiviati in malus_storico): sanare non cancella.
                      const chiusi = (archivio?.get(`${row.id}#${row.categoria}`) || []).filter((e) => e.data_fine !== null);
                      const totStorico = chiusi.reduce((a, e) => a + (Number(e.importo) || 0), 0);
                      if (isMalusRow(row)) {
                        return (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border bg-red-500/10 text-red-400 border-red-500/30 whitespace-nowrap">
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
                            <div className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border bg-white/5 text-slate-400 border-white/10 whitespace-nowrap">
                              € {Math.round(totStorico)} storico
                            </div>
                          </div>
                        );
                      }
                      return <span className="text-slate-700 text-xs">—</span>;
                    })()}
                  </td>
                  {canDelete && (
                    <td className={tdStyle + " text-center"} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onAskDelete?.(row)}
                        title="Togli dal Tracking (la vendita resta in Ricerca Vendite)…"
                        className="p-1.5 rounded-lg border border-transparent text-slate-500 cursor-pointer hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all"
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
      <div className="px-4 py-3 border-t border-white/5 bg-[#12141f]/50 text-xs text-slate-600 flex items-center gap-4">
        <span>{rows.length} pratiche visualizzate</span>
        {(() => {
          const totMalus = rows.reduce((acc, r) => acc + calcolaMalus(r), 0);
          const countMalus = rows.filter((r) => isMalusRow(r)).length;
          if (countMalus === 0) return null;
          return (
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full border bg-red-500/10 text-red-400 border-red-500/30 text-[11px] font-bold"
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
  canEditNegozio = true,
  onDelegate,
  delegatoNome = null,
  episodiMalus = [],
  scartaRef,
}: {
  row: TrackingRow;
  onClose: () => void;
  onUpdate: (updated: TrackingRow, opts?: { salvaFollowup?: boolean }) => void;
  members?: { id: string; full_name: string }[];
  canDelegate?: boolean;
  canEditAdmin?: boolean;
  /** false = pratica visibile solo grazie alla capacità esito admin: lato
   *  negozio è in sola lettura (niente esito negozio né delega) */
  canEditNegozio?: boolean;
  onDelegate?: (rowId: string, toId: string | null) => void;
  delegatoNome?: string | null;
  episodiMalus?: EpisodioMalus[];
  // cestino: la pratica sta sparendo dalla vista → la bozza si butta, non si salva
  scartaRef?: { current: boolean };
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
  // Se non hai la capacità esito admin non puoi restare sul tab Esito Admin —
  // e la bozza si SCARTA (rilievo revisore 25/08): il commit di chiusura non
  // deve salvare l'esito di un utente appena revocato.
  useEffect(() => {
    if (activeTab === "admin" && !canEditAdmin) {
      // baseline VIVA (baseA), non row.statoAdmin: nella finestra tra commit e
      // ritorno di handleUpdate i due divergono (rilievo terzo revisore)
      setEditStatoA(baseA.current);
      setNotaAdmin("");
      setActiveTab("negozio");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, canEditAdmin]);
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

  // MOD-27 (Luca 10/08): via i bottoni Salva — le modifiche restano in BOZZA
  // qui dentro e si scrivono DA SOLE quando si chiude la sezione (cambio tab),
  // si cambia pratica o si chiude la scheda: un esito cliccato per sbaglio e
  // corretto al volo NON intasa lo storico. I refs sono la fonte del commit di
  // chiusura: durante l'unmount lo stato React non e' piu' leggibile.
  const staged = useRef({ statoN: row.statoNegozio, statoA: row.statoAdmin, notaN: "", notaA: "", fu: followup });
  useEffect(() => { staged.current = { statoN: editStatoN, statoA: editStatoA, notaN: notaNegozio, notaA: notaAdmin, fu: followup }; });
  // baseline = ultimo valore COMMITTATO (parte dal dato a DB): il confronto con
  // la bozza decide se c'e' davvero qualcosa da salvare
  const baseN = useRef(row.statoNegozio);
  const baseA = useRef(row.statoAdmin);
  const baseFu = useRef(JSON.stringify(row.followup ?? []));
  // storia accumulata, inclusi i commit non ancora tornati dal giro DB→prop; se
  // il prop si allunga per altre vie (es. evento delega) vince il piu' ricco
  const storiaRef = useRef<StoriaEvent[]>(row.storia);
  useEffect(() => { if (row.storia.length > storiaRef.current.length) storiaRef.current = row.storia; }, [row.storia]);

  const commit = (origine?: "negozio" | "admin") => {
    const s = staged.current;
    const oggi = new Date().toLocaleDateString("it-IT");
    const eventi: StoriaEvent[] = [];
    let dirty = false;
    let salvaFollowup = false;
    if (origine !== "admin") {
      const nota = s.notaN.trim();
      const fuJson = JSON.stringify(s.fu);
      const cambioFu = row.categoria === "piva" && fuJson !== baseFu.current;
      if (s.statoN !== baseN.current) {
        eventi.push({ data: oggi, tipo: "stato_negozio", testo: "Esito negozio aggiornato: " + getStatoN(s.statoN, row.categoria, row.brand).label, utente: nomeUtente, ruolo: "negozio" });
      }
      if (nota) {
        eventi.push({ data: oggi, tipo: "nota_negozio", testo: nota, utente: nomeUtente, ruolo: "negozio" });
      }
      if (s.statoN !== baseN.current || nota || cambioFu) {
        dirty = true;
        salvaFollowup = cambioFu;
        baseN.current = s.statoN;
        baseFu.current = fuJson;
        s.notaN = "";
        setNotaNegozio("");
      }
    }
    if (origine !== "negozio") {
      const nota = s.notaA.trim();
      if (s.statoA !== baseA.current) {
        eventi.push({ data: oggi, tipo: "stato_admin", testo: "Esito admin aggiornato: " + getStatoA(s.statoA).label, utente: nomeUtente, ruolo: "admin" });
      }
      if (nota) {
        eventi.push({ data: oggi, tipo: "nota_admin", testo: nota, utente: nomeUtente, ruolo: "admin" });
      }
      if (s.statoA !== baseA.current || nota) {
        dirty = true;
        baseA.current = s.statoA;
        s.notaA = "";
        setNotaAdmin("");
      }
    }
    if (!dirty) return;
    const nuovaStoria = [...storiaRef.current, ...eventi];
    storiaRef.current = nuovaStoria;
    onUpdate({ ...row, statoNegozio: baseN.current, statoAdmin: baseA.current, followup: s.fu, storia: nuovaStoria }, { salvaFollowup });
  };
  // il commit di chiusura (unmount: ✕, cambio pratica, navigazione) passa da un
  // ref cosi' legge sempre la versione corrente della funzione
  const commitRef = useRef(commit);
  useEffect(() => { commitRef.current = commit; });
  useEffect(() => {
    if (scartaRef) scartaRef.current = false;
    return () => {
      if (scartaRef?.current) { scartaRef.current = false; return; }
      commitRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const labelStyle = "text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-1";
  const valStyle = "text-[13px] text-slate-200";
  const panelStyle =
    "bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-3.5";

  const tipoColor = (tipo: string) => {
    if (tipo === "stato_admin" || tipo === "nota_admin") return "var(--tf-a78bfa)";
    if (tipo === "stato_negozio") return "var(--tf-6366f1)";
    if (tipo === "nota_negozio") return "var(--tf-f59e0b)";
    return "var(--tf-22c55e)";
  };
  const tipoLabel = (tipo: string) => {
    if (tipo === "stato_admin") return "Admin";
    if (tipo === "nota_admin") return "Admin";
    if (tipo === "stato_negozio") return "Negozio";
    if (tipo === "nota_negozio") return "Negozio";
    return "Sistema";
  };

  // esiti admin AMMINISTRABILI per categoria (10/08): dal pannello, fallback hardcoded
  const statiAdmin = getStatiAdminPerCategoria(row.categoria, row.brand);

  return (
    <div
      className="fixed top-0 right-0 bottom-0 w-full max-w-[520px] flex flex-col z-[1000] border-l border-slate-700"
      style={{ background: "var(--tf-0f172a)", boxShadow: "-8px 0 32px rgba(0,0,0,.5)" }}
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
          <StatoBadge id={row.statoNegozio} set="negozio" categoria={row.categoria} brand={row.brand} />
          <span className="text-[11px] text-slate-500 mx-1">| Admin:</span>
          <StatoBadge id={row.statoAdmin} set="admin" />
        </div>
        {/* Delega verifica: NON fa parte della sezione admin — e' una funzione
            dallo store manager in su, quindi sta fuori dai tab. */}
        {canDelegate && canEditNegozio && (
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
                onClick={() => {
                  // MOD-27: lasciare la sezione = salvarla (se c'e' una bozza)
                  if (tab !== activeTab) {
                    if (activeTab === "negozio") commit("negozio");
                    if (activeTab === "admin") commit("admin");
                  }
                  setActiveTab(tab);
                }}
                className="py-2 px-4 bg-transparent border-none border-b-2 cursor-pointer transition-all text-[13px] font-normal"
                style={{
                  borderBottomColor: active ? "var(--tf-6366f1)" : "transparent",
                  color: active ? "var(--tf-f1f5f9)" : "var(--tf-475569)",
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
              <div><div className={labelStyle}>VENDITORE</div><div className={valStyle}>{row.venditore}</div>
                {AGENTI_BO[row.venditore] && <div className="mt-0.5 text-[11px] font-semibold text-indigo-300">🏢 agente in carico a {AGENTI_BO[row.venditore]}</div>}
              </div>
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
                    {/* Mai più JSON grezzo (segnalazione Francesco 11/08): i
                        valori annidati (followup, units…) diventano righe
                        leggibili e spariscono se vuoti. */}
                    {annidate.map(([k, v]) => (
                      <VoceAnnidata key={k} nome={k} valore={v} wrapperClassName="col-span-2" labelClassName={labelStyle} />
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
              {/* pratica vista SOLO grazie alla capacità esito admin: lato
                  negozio niente mani — badge e stop (Luca: «nient'altro») */}
              {!canEditNegozio && (
                <div>
                  <StatoBadge id={row.statoNegozio} set="negozio" categoria={row.categoria} brand={row.brand} />
                  <p className="mt-3 text-[11px] text-slate-500">🔒 Pratica fuori dai tuoi punti vendita: l&apos;esito negozio resta al negozio — qui lavori solo l&apos;esito admin.</p>
                </div>
              )}
              {canEditNegozio && <>
              <div className="flex flex-wrap gap-2 mb-3.5">
                {getStatiNegozioPerCategoria(row.categoria, row.brand).map((s) => {
                  const sel = editStatoN === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setEditStatoN(s.id)}
                      className="rounded-full py-1.5 px-3.5 text-xs font-semibold cursor-pointer border transition-all"
                      style={{
                        borderColor: sel ? s.color : "var(--tf-w100)",
                        background: sel ? s.color + "33" : "transparent",
                        color: sel ? s.color : "var(--tf-64748b)",
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
              {/* MOD-27: niente bottone — vedi commit() qui sopra */}
              <p className="text-[11px] text-slate-500 text-center">
                💾 Si salva da solo quando cambi sezione o pratica, o chiudi questa scheda.
              </p>
              </>}
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
              <StatoBadge id={row.statoNegozio} set="negozio" categoria={row.categoria} brand={row.brand} />
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
                        borderColor: sel ? s.color : "var(--tf-w100)",
                        background: sel ? s.color + "33" : "transparent",
                        color: sel ? s.color : "var(--tf-64748b)",
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
            {/* MOD-27: niente bottone — vedi commit() qui sopra */}
            <p className="text-[11px] text-slate-500 text-center">
              💾 Si salva da solo quando cambi sezione o pratica, o chiudi questa scheda.
            </p>
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
                // MODIFICA CONTRATTO (11/08, caso "[SISTEMA] —"): gli eventi di
                // Ricerca Vendite hanno un formato diverso ({campo, da, a, at,
                // user}) e uscivano come trattini — si traducono qui in chiaro
                const mc = ev as unknown as { campo?: string; da?: string; a?: string; at?: string; user?: string };
                const isModifica = !ev.testo && (mc.campo || mc.at);
                const testo = isModifica
                  ? `Modifica contratto — ${mc.campo || "campo"}: ${mc.da || "—"} → ${mc.a || "—"}`
                  : ev.testo;
                const quando = ev.data || (mc.at ? new Date(mc.at).toLocaleDateString("it-IT") : "—");
                const chi = ev.utente || mc.user || "—";
                const dotColor = isModifica ? "var(--tf-38bdf8)" : tipoColor(ev.tipo);
                const isAdmin = ev.ruolo === "admin";
                return (
                  <div key={i} className="flex gap-3.5 mb-4 relative">
                    <div className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 z-[1]" style={{ background: dotColor }} />
                    <div className="flex-1">
                      <div
                        className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-1 uppercase tracking-wider"
                        style={{
                          color: isModifica ? "var(--tf-38bdf8)" : isAdmin ? "var(--tf-a78bfa)" : "var(--tf-6366f1)",
                          background: isModifica ? "var(--tf-0c2a3f)" : isAdmin ? "var(--tf-2e1065)" : "var(--tf-1e1b4b)",
                        }}
                      >
                        {isModifica ? "Modifica" : tipoLabel(ev.tipo)}
                      </div>
                      <div className="text-[13px] text-slate-200">{testo}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{quando} — {chi}</div>
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
  // Delega: dallo store manager in su. Esito admin: capacità della rotellina
  // Permessi (Luca 25/08) — prima era il ruolo cablato "amministrativo in su",
  // nato quando il pannello non esisteva; il default della capacità lo replica.
  const { perms, loaded: permsLoaded } = useRolePermissions(user?.role, user?.grade, user?.id);
  const canDelegate = ["store_manager", "admin", "dev", "direttore_generale", "direttore_commerciale"].includes(user?.role || "");
  const canEditAdmin = capAllowed(user?.role, CAP_TRACKING.section, CAP_TRACKING_ESITO_ADMIN, perms);
  // La capacità concede SOLO la coda «⚡ Da lavorare» e l'esito admin con nota
  // (Luca 25/08 sera): la compensazione dei malus NON viaggia con lei e resta
  // all'amministrazione; eliminare pratiche e malus resta admin/dev come prima.
  const puoCompensare = ["amministrativo", "admin", "dev", "direttore_generale"].includes(user?.role || "");
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
  // Con la capacità esito admin la platea diventa COMPLETA — tutte le pratiche
  // di tutti i punti vendita, ma SOLO qui nel Tracking (Luca 25/08 sera-2): il
  // lavoro di controllo richiede la visione totale senza toccare la visibilità
  // negozi globale dell'utente (le altre sezioni non cambiano). Vale per la
  // lista pratiche e per l'archivio malus in sola lettura; lo spazzino della
  // sync malus resta gated sul seesAll vero.
  // Fail-closed sui permessi (rilievo quarto revisore): finché le righe perms
  // sono in volo vale il default di ruolo — un'esclusione per-persona non deve
  // avere la finestra in cui la platea completa appare comunque.
  const vedeTutteTracking = seesAll || (permsLoaded && canEditAdmin);
  // Pratiche nel perimetro REALE (senza capacità): fuori da qui il capacitato
  // lavora SOLO l'esito admin — niente esito negozio, niente delega (Luca:
  // «non deve poter fare nient'altro»). Specchia il filtro di fetchData;
  // mieiAgenti (direttore outbound) arriva via ref dall'ultimo fetch.
  const mieiAgentiRef = useRef<Set<string>>(new Set());
  const inPerimetroReale = useCallback((r0: unknown) => {
    if (seesAll) return true;
    const r = (r0 ?? {}) as { negozio?: unknown; venditore?: unknown; delegated_to?: unknown };
    const vend = r.venditore ? String(r.venditore) : "";
    if (mieiAgentiRef.current.size && vend && mieiAgentiRef.current.has(vend)) return true;
    const mie = (!!vend && !!user?.name && vend === user.name) || (!!r.delegated_to && r.delegated_to === user?.id);
    if (seesWhole) return mie || visibleStores.some((st) => sameStore(String(r.negozio || ""), st));
    return mie;
  }, [seesAll, seesWhole, visibleStores, user?.name, user?.id]);

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
  // MOD-27: specchio di `selected` per i callback con deps [] + flag "butta la
  // bozza" letto dal Drawer all'unmount (solo per il cestino)
  const selectedRef = useRef<TrackingRow | null>(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  const scartaCommitRef = useRef(false);
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
  // se la capacità arriva/cambia DOPO il load dei permessi, il filtro ⚡ non
  // resta incastrato invisibile (rilievo revisore 25/08)
  useEffect(() => { if (!canEditAdmin) setSoloDaLavorare(false); }, [canEditAdmin]);
  // Cestino (Luca 03/08, ridisegnato 06/08: solo NASCONDI): pratica in attesa
  // di conferma rimozione dalla vista.
  const [daEliminare, setDaEliminare] = useState<TrackingRow | null>(null);
  const [eliminando, setEliminando] = useState(false);
  // regole del tracking dal DB (mig. 098): senza righe valgono i default in
  // codice; regoleV forza il ricalcolo di fasce e KPI dopo un salvataggio
  const [regoleV, setRegoleV] = useState(0);
  useEffect(() => {
    (async () => {
      const { data: rg } = await supabase.from("tracking_regole").select("*");
      if (rg && rg.length) { impostaRegoleTracking(rg as never); setRegoleV((v) => v + 1); }
      // MOD-28: esiti amministrabili (tabella tracking_esiti) — senza righe (o
      // senza tabella) valgono le liste hardcoded, il CRM non si rompe mai
      const { data: es } = await supabase.from("tracking_esiti").select("*").order("ordine");
      if (es && es.length) { impostaEsitiTracking(es as never); setRegoleV((v) => v + 1); }
      // CHIUSURE (Luca 11/08): festivi globali + chiusure straordinarie per
      // negozio (Amministrazione → Orari & Chiusure) — nei giorni chiusi
      // warning/malus non corrono. Best-effort: senza dati vale il lun-sab.
      try {
        const [fest, chius, dom] = await Promise.all([
          supabase.from("giorni_festivi").select("giorno"),
          supabase.from("chiusure_negozio").select("store, dal, al"),
          supabase.from("stores").select("name").eq("domenica_aperta", true),
        ]);
        impostaCalendarioChiusure(
          (fest.data ?? []) as never,
          (chius.data ?? []) as never,
          ((dom.data ?? []) as { name: string }[]).map((s) => s.name),
        );
        setRegoleV((v) => v + 1);
      } catch { /* calendario assente: comportamento storico */ }
    })();
  }, []);

  // generation-guard (rilievo quarto revisore): il flip della capacità rende
  // normali due run sovrapposte — vince sempre l'ULTIMA partita, mai la stale
  const fetchGen = useRef(0);
  const fetchData = useCallback(async () => {
    const gen = ++fetchGen.current;
    setLoading(true);
    setLoadError(null);
    try {
      // Left join clients so contracts without a matching client still appear (avoids 0 rows).
      // RIC-02: `prodotto` serve al predicato condiviso vaInTracking (esclusione
      // sostituzioni) e allo split 3P Sky piu' sotto: senza, entrambi erano
      // codice morto perche' r.prodotto era sempre undefined.
      const selectCols =
        "id, brand, categoria, prodotto, stato, venditore, negozio, codice_attivazione, data_registrazione, data, created_at, dettagli, delegated_to, delegated_by, stati_categoria, categoria_macro, controlli, tipo_cliente, tracking_nascosto, clients(nome, cognome, ragione_sociale, cellulare, email, cf_piva, indirizzo, citta)";
      // caricaTutte (04/08): il tetto server 1000 ignorava il .limit(5000) e
      // 300+ pratiche vecchie sparivano dal Tracking (e lo SPAZZINO della sync
      // malus le avrebbe congelate come uscite).
      const { data: baseData, error: baseErr } = await caricaTutte<Record<string, unknown>>((from, to) =>
        supabase.from("contracts").select(selectCols)
          .order("created_at", { ascending: false }).order("id").range(from, to));

      if (baseErr) throw baseErr;

      // Optional: fetch tracking columns (requires migration 022). If it fails, we still show contracts with defaults.
      let trackingMap = new Map<string, { stato_negozio?: string; stato_admin?: string; storia?: StoriaEvent[]; stati_categoria?: Record<string, string> }>();
      const { data: trackingData, error: trackingErr } = await caricaTutte<{ id: string; stato_negozio?: string; stato_admin?: string; storia?: StoriaEvent[]; stati_categoria?: Record<string, string> }>((from, to) =>
        supabase.from("contracts").select("id, stato_negozio, stato_admin, storia, stati_categoria")
          .order("created_at", { ascending: false }).order("id").range(from, to));

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
      // Perimetro "lavorabili" = vaInTracking (tassonomia, RIC-02): predicato
      // UNICO condiviso con Ricerca Vendite, che con le stesse regole decide se
      // mostrare il bottone "Apri in Tracking PDA". Le regole storiche (Extra/
      // marginalita' e sostituzioni SIM — segnalazione 43 e Francesco —, Very
      // Mobile — Luca 03/08 —, macro fuori perimetro — Luca 29/07 —, mobile
      // consumer senza MNP ne' finanziamento — segnalazione 91) vivono la'.
      const lavorabili = (list as RawRow[]).filter((r) => vaInTracking(r));
      // MONDO AGENZIA (Luca 12/08): gli agenti associati a un back office
      // (app_users.back_office_id) sono in carico a LUI — le loro pratiche
      // entrano nella sua coda. Pannello: Amministrazione → Ruoli, tendina
      // «🏢 In carico a». La mappa completa si carica per TUTTI (serve al
      // badge 🏢 in riga, anche per gli admin); la coda del BO usa la stessa.
      const mieiAgenti = new Set<string>();
      {
        const { data: ag } = await supabase.from("app_users")
          .select("full_name, back_office_id").not("back_office_id", "is", null).eq("active", true);
        const righe = (ag ?? []) as { full_name: string | null; back_office_id: string | null }[];
        const boIds = [...new Set(righe.map((a) => a.back_office_id).filter(Boolean))] as string[];
        const nomiBO: Record<string, string> = {};
        if (boIds.length) {
          const { data: bos } = await supabase.from("app_users").select("id, full_name").in("id", boIds);
          ((bos ?? []) as { id: string; full_name: string | null }[]).forEach((b) => { if (b.full_name) nomiBO[b.id] = b.full_name; });
        }
        const mappa: Record<string, string> = {};
        righe.forEach((a) => {
          if (!a.full_name || !a.back_office_id) return;
          if (nomiBO[a.back_office_id]) mappa[a.full_name] = nomiBO[a.back_office_id];
          if (a.back_office_id === user?.id) mieiAgenti.add(a.full_name);
        });
        AGENTI_BO = mappa;
        // il malus delle pratiche degli agenti si intesta al loro BO
        // (risposta Luca 13/08) — la sync legge questa mappa
        impostaAgentiBOMalus(mappa);
        // FERIE DEL BO (risposta Luca 13/08): il back office non lavora come
        // un negozio e non delega — nei suoi giorni di ferie approvate le
        // pratiche dei suoi agenti congelano warning e malus. Mappa keyed
        // sul nome AGENTE (venditore riga) → periodi del suo BO.
        const ferieResp: Record<string, { dal: string; al: string }[]> = {};
        if (boIds.length) {
          const { data: fer } = await supabase.from("vacation_requests")
            .select("user_id, date_from, date_to, status, tipo").in("user_id", boIds);
          const okFer = ((fer ?? []) as { user_id: string; date_from: string; date_to: string; status: string | null; tipo: string | null }[])
            .filter((f) => /approv/i.test(String(f.status || "")) && String(f.tipo || "ferie") !== "corsi");
          righe.forEach((a) => {
            if (!a.full_name || !a.back_office_id) return;
            const periodi = okFer.filter((f) => f.user_id === a.back_office_id)
              .map((f) => ({ dal: String(f.date_from).slice(0, 10), al: String(f.date_to).slice(0, 10) }));
            if (periodi.length) ferieResp[a.full_name] = periodi;
          });
        }
        impostaFerieResponsabili(ferieResp);
      }
      // FERIE PERSONALI (Luca 21/08): la persona in ferie congela warning e
      // malus delle SUE pratiche — come la chiusura del negozio, ma solo per
      // lei. Preciso anche quando il PV resta aperto con altri al lavoro.
      {
        const nomi = [...new Set(lavorabili.map((r: Record<string, unknown>) => String(r.venditore || "")).filter(Boolean))];
        const ferieVend: Record<string, { dal: string; al: string }[]> = {};
        if (nomi.length) {
          const { data: ute } = await supabase.from("app_users").select("id, full_name").in("full_name", nomi);
          const nomeDi: Record<string, string> = {};
          ((ute ?? []) as { id: string; full_name: string | null }[]).forEach((u) => { if (u.full_name) nomeDi[u.id] = u.full_name; });
          const ids = Object.keys(nomeDi);
          if (ids.length) {
            const { data: fer } = await supabase.from("vacation_requests")
              .select("user_id, date_from, date_to, status, tipo").in("user_id", ids);
            ((fer ?? []) as { user_id: string; date_from: string; date_to: string; status: string | null; tipo: string | null }[])
              .filter((f) => /approv/i.test(String(f.status || "")) && String(f.tipo || "ferie") !== "corsi")
              .forEach((f) => {
                const nome = nomeDi[f.user_id];
                if (!nome) return;
                (ferieVend[nome] = ferieVend[nome] || []).push({ dal: String(f.date_from).slice(0, 10), al: String(f.date_to).slice(0, 10) });
              });
          }
        }
        impostaFerieVenditori(ferieVend);
      }
      // DELEGHE (Luca 21/08): risolvi i nomi dei delegati per badge e malus
      {
        const ids = [...new Set(lavorabili.map((r: Record<string, unknown>) => String(r.delegated_to || "")).filter(Boolean))];
        const mappa: Record<string, string> = {};
        if (ids.length) {
          const { data: del } = await supabase.from("app_users").select("id, full_name").in("id", ids);
          const nomi: Record<string, string> = {};
          ((del ?? []) as { id: string; full_name: string | null }[]).forEach((d) => { if (d.full_name) nomi[d.id] = d.full_name; });
          lavorabili.forEach((r: Record<string, unknown>) => {
            const n = nomi[String(r.delegated_to || "")];
            if (n) mappa[String(r.id)] = n;
          });
        }
        DELEGHE = mappa;
        impostaDelegheMalus(mappa);
      }
      mieiAgentiRef.current = mieiAgenti;
      const scoped = vedeTutteTracking ? lavorabili : lavorabili.filter((r: Record<string, unknown>) => {
        if (mieiAgenti.size && !!r.venditore && mieiAgenti.has(String(r.venditore))) return true;
        // Le pratiche FATTE DA ME si vedono SEMPRE, anche se registrate su un
        // negozio fuori dalla mia visibilità (coperture in altri PV — Luca
        // 21/08, caso Lorenzo a Magliana): la responsabilità malus resta mia.
        const mie = (!!r.venditore && !!user?.name && r.venditore === user.name)
            || (!!r.delegated_to && r.delegated_to === user?.id);
        if (seesWhole) return mie || visibleStores.some((st) => sameStore(r.negozio as string, st));
        return mie;
      });
      if (gen !== fetchGen.current) return;
      setRawList(scoped as RawRow[]);
    } catch (err: unknown) {
      if (gen === fetchGen.current) {
        setLoadError(err instanceof Error ? err.message : String(err));
        setRawList([]);
      }
    } finally {
      if (gen === fetchGen.current) setLoading(false);
    }
  }, [vedeTutteTracking, seesWhole, visibleStores, user?.name, user?.id]);

  useEffect(() => {
    // NON interrogare i dati prima che la visibilita' negozi sia arrivata: un
    // utente "scopato" (es. store manager) altrimenti parte con stores=[] e la
    // sua lista resta VUOTA (nessuna pratica del suo negozio). seesAll non attende.
    // (la capacità arriva coi permessi: al flip di vedeTutteTracking cambia
    // l'identità di fetchData e la lista si ricarica completa da sola)
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
            : ((base.statoNegozio && getStatiNegozioPerCategoria(c, base.brand).some((s) => s.id === base.statoNegozio)) ? base.statoNegozio : "nuovo")),
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
        // GATE SCRITTURE (revisione indipendente 21/08, come il call center):
        // la sync scrive SOLO per chi vede tutto — con le righe scopate di un
        // consulente/SM lo spazzino chiuderebbe "a oggi" gli episodi aperti
        // delle pratiche fuori dal suo perimetro, troncandoli in silenzio.
        // Gli altri ricevono comunque l'archivio in sola lettura.
        if (!seesAll) {
          if (vivo) { setEpisodi((eps ?? []) as EpisodioMalus[]); setMalusErr(null); }
          return;
        }
        // FUORI SERVIZIO → SPAZIO ARCHIVIATI (Luca 21/08 sera): gli episodi
        // di licenziati/sospesi non spariscono piu' dall'archivio — la sync
        // li marca "archiviato" (aperti congelati a oggi, la partita si
        // chiude) e l'Archivio Malus li mostra nel loro spazio dedicato,
        // fuori dai conteggi operativi della squadra attiva.
        const { data: fuoriUt, error: errFuori } = await supabase.from("app_users")
          .select("full_name, status, sospeso_dal").or("status.eq.licenziato,sospeso_dal.not.is.null");
        // query fallita ≠ "nessun fuori servizio": proseguire con l'insieme
        // vuoto de-archivierebbe TUTTO in massa (revisione 21/08, rilievo 5)
        if (errFuori) throw errFuori;
        const oggiX = (() => { const d = new Date(); const pp = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pp(d.getMonth() + 1)}-${pp(d.getDate())}`; })();
        const fuori = new Set(((fuoriUt ?? []) as { full_name: string | null; status: string | null; sospeso_dal: string | null }[])
          .filter((x) => x.status === "licenziato" || (x.sospeso_dal && String(x.sospeso_dal).slice(0, 10) <= oggiX))
          .map((x) => x.full_name).filter(Boolean) as string[]);
        impostaFuoriServizio(fuori);
        // le pratiche CESTINATE (tracking_nascosto) escono dalle righe della
        // sync: cosi' lo spazzino congela A OGGI il loro episodio aperto —
        // prima restavano dentro e il malus continuava a maturare per sempre
        // (bug emerso rispondendo alla domanda di Luca, 10/08)
        const scritture = await sincronizzaMalusStorico(data.filter((r) => !r.tracking_nascosto), (eps ?? []) as EpisodioMalus[]);
        // diagnostica leggera, cercabile in console come [CRASH:]
        console.debug("[SYNC-MALUS] scritture:", scritture);
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
  }, [data, loading, regoleV, seesAll]);

  // Scoping dell'archivio per ruolo, stessa regola delle pratiche: consulente
  // i suoi episodi, store manager i negozi visibili, amministrazione tutto.
  const episodiVisibili = useMemo(() => {
    // i TOMBSTONE (mig. 150, eliminati dall'admin) restano solo per la sync:
    // fuori da archivio, contatori e badge per chiunque
    const vivi = episodi.filter((e) => !e.eliminato);
    // capacità esito admin = archivio completo in SOLA lettura (le azioni
    // restano su puoCompensare/puoEliminare): coi badge di riga sulla platea
    // completa, un archivio scopato mostrerebbe pratiche senza il loro malus
    if (vedeTutteTracking) return vivi;
    // Gli episodi MIEI si vedono SEMPRE, anche se maturati su un negozio fuori
    // dalla mia visibilità (coperture — Luca 23/08, caso Staicu a Magliana: la
    // penale è sua ma da SM di Promontori non gli compariva nello storico).
    // Stessa clausola già applicata alle PRATICHE il 21/08.
    const mio = (e: EpisodioMalus) => !!e.venditore && !!user?.name && e.venditore === user.name;
    if (seesWhole) return vivi.filter((e) => mio(e) || visibleStores.some((st) => sameStore(e.negozio, st)));
    return vivi.filter(mio);
  }, [episodi, vedeTutteTracking, seesWhole, visibleStores, user?.name]);

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

  // Il numerone "storico" del riquadro Malus e' quello della squadra OPERATIVA:
  // gli archiviati (licenziati/sospesi) restano fuori — si vedono nel loro
  // spazio dentro l'Archivio, non nei conteggi di chi lavora oggi.
  const storicoTotale = useMemo(() => {
    const t = totaliEpisodi(episodiVisibili);
    return t.totale - t.archiviati.eur;
  }, [episodiVisibili]);

  // Dall'archivio si apre la pratica: stessa riga (id+categoria) del tracking.
  const apriPraticaDaArchivio = useCallback((cid: string, cat: string) => {
    const hit = data.find((r) => r.id === cid && r.categoria === cat) || data.find((r) => r.id === cid);
    if (hit) { setSelected(hit); setShowArchivio(false); return; }
    // pratica esclusa dal tracking o contratto eliminato: dillo, non ignorare il click
    alert("Questa pratica non è più nel Tracking (esclusa o eliminata): il dettaglio non è disponibile.");
  }, [data]);

  const deepOpened = useRef(false);
  useEffect(() => {
    if (deepOpened.current || data.length === 0) return;
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    const hit = data.find((r) => r.id === id);
    if (hit) { setSelected(hit); deepOpened.current = true; }
  }, [data]);

  // MOD-28: "completata" non e' piu' una lista hardcoded (che tra l'altro
  // divergeva da STATI_COMPLETATI: mancava re_inserita) ma il flag
  // amministrabile della tabella tracking_esiti — helper esitoCompletato.

  // PDA-01: platea per le OPZIONI dei filtri Negozio/Utente/Categoria — le
  // "pratiche da monitorare in questo momento". Replica i soli filtri DI
  // MODALITA' di `filtered` (cestino, completate/da lavorare, deleghe), NON
  // quelli di contenuto: brand e KPI restano fuori apposta (decisione Luca,
  // hanno gia' i loro contatori a vista).
  const baseVisibile = useMemo(() => data.filter((row) => {
    if (row.tracking_nascosto) return false;
    if (soloDaLavorare) {
      if (!esitoCompletato(row.statoNegozio, row.categoria, row.brand)) return false;
      if (esitoAdminDefinitivo(row.statoAdmin, row.categoria, row.brand) || row.statoAdmin === "non_conforme") return false;
    } else if (!mostraCompletate && esitoCompletato(row.statoNegozio, row.categoria, row.brand) && row.statoAdmin !== "non_conforme") return false;
    if (onlyMine && row.delegated_to !== user?.id) return false;
    if (onlyDelegate && row.delegated_by !== user?.id) return false;
    return true;
  }), [data, mostraCompletate, soloDaLavorare, onlyMine, onlyDelegate, user?.id, regoleV]);

  // Opzioni con dipendenza UNIDIREZIONALE (niente prune a cascata):
  // NEGOZIO ← base; UTENTE ← base+negozio; CATEGORIA ← base+negozio+utente.
  // La tendina Negozio compare anche a chi ha PIÙ punti vendita in visibilità
  // (Luca 21/08, caso Eros/Gianluca): senza, le pratiche arrivano tutte miste.
  // baseVisibile è già ritagliata sulla loro visibilità, quindi l'elenco sono
  // solo i LORO negozi; con un negozio solo la tendina resta nascosta.
  const negoziAttivi = useMemo(
    () => {
      const tutti = Array.from(new Set(baseVisibile.map((r) => r.negozio).filter((n) => n && n !== "—"))).sort();
      return seesAll || tutti.length > 1 ? tutti : [];
    },
    [baseVisibile, seesAll]
  );
  const venditoriAttivi = useMemo(
    () => (seesWhole && !vedeTutteTracking ? Array.from(new Set(baseVisibile.flatMap((r) => respRigaTutti(r)).filter((n) => n && n !== "—"))).sort() : []),
    [baseVisibile, seesWhole, vedeTutteTracking]
  );
  // con la capacità (o seesAll) vale la tendina utenti a cascata sul negozio
  const utentiAttivi = useMemo(
    () => (vedeTutteTracking ? Array.from(new Set(baseVisibile.filter((r) => !negozioSel || r.negozio === negozioSel).flatMap((r) => respRigaTutti(r)).filter((n) => n && n !== "—"))).sort() : []),
    [baseVisibile, vedeTutteTracking, negozioSel]
  );
  // tendina Venditore sparita (flip a platea completa) = filtro azzerato:
  // niente filtri fantasma invisibili (rilievo quarto revisore)
  useEffect(() => { if (venditoreSel && !venditoriAttivi.length) setVenditoreSel(""); }, [venditoriAttivi, venditoreSel]);
  const catAttive = useMemo(() => new Set(
    baseVisibile
      .filter((r) => (!negozioSel || r.negozio === negozioSel) && (utentiSel.length === 0 || respRigaTutti(r).some((n) => utentiSel.includes(n))))
      .map((r) => r.categoria)
  ), [baseVisibile, negozioSel, utentiSel]);
  const categorieAttive = useMemo(() => CATEGORIE.filter((c) => catAttive.has(c.id)), [catAttive]);

  // Negozio selezionato sparito dalla platea (es. attivando "Da lavorare"):
  // si deseleziona da solo, niente chip-fantasma che svuota la tabella.
  useEffect(() => {
    if (negozioSel && !negoziAttivi.includes(negozioSel)) setNegozioSel("");
  }, [negoziAttivi, negozioSel]);

  // Cambio negozio ⇒ via dalla selezione gli utenti che li' non hanno pratiche
  // (altrimenti resta un filtro-fantasma che svuota la tabella).
  useEffect(() => {
    setUtentiSel((prev) => {
      const next = prev.filter((n) => baseVisibile.some((r) => respRigaTutti(r).includes(n) && (!negozioSel || r.negozio === negozioSel)));
      return next.length === prev.length ? prev : next;
    });
  }, [negozioSel, baseVisibile]);

  // Categoria selezionata rimasta senza pratiche ⇒ fuori dalla selezione; gli
  // esiti scelti si intersecano con quelli delle categorie rimaste (stessa
  // pulizia del toggleCat manuale), altrimenti un esito-fantasma continuerebbe
  // a svuotare la tabella senza nessun controllo visibile.
  useEffect(() => {
    const next = catSel.filter((c) => catAttive.has(c));
    if (next.length === catSel.length) return;
    setCatSel(next);
    if (next.length === 0) { setStatoSel([]); return; }
    const validi = new Set(next.flatMap((cid) => getStatiNegozioTutte(cid).map((s) => s.id)));
    setStatoSel((prev) => {
      const sNext = prev.filter((id) => validi.has(id));
      return sNext.length === prev.length ? prev : sNext;
    });
  }, [catAttive, catSel]);

  const filtered = useMemo(() => {
    return data.filter((row) => {
      // cestino "Solo da Tracking": fuori dalla vista, ma la riga resta in
      // data cosi' la sync malus puo' ancora chiudere i suoi episodi.
      if (row.tracking_nascosto) return false;
      // ⚡ Da lavorare (amministrazione): SOLO pratiche chiuse dal negozio che
      // aspettano ancora l'esito definitivo dell'admin — bypassa la regola
      // che nasconde le completate, altrimenti la coda sarebbe invisibile.
      if (soloDaLavorare) {
        if (!esitoCompletato(row.statoNegozio, row.categoria, row.brand)) return false;
        if (esitoAdminDefinitivo(row.statoAdmin, row.categoria, row.brand) || row.statoAdmin === "non_conforme") return false;
      } else if (!mostraCompletate && esitoCompletato(row.statoNegozio, row.categoria, row.brand) && row.statoAdmin !== "non_conforme") return false;
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
      if (utentiSel.length > 0 && !respRigaTutti(row).some((n) => utentiSel.includes(n))) return false;
      if (venditoreSel && !respRigaTutti(row).includes(venditoreSel)) return false;
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

  // Base per i BADGE sui loghi brand: tutti i filtri TRANNE il brand stesso
  // (senno' i brand non selezionati farebbero sempre 0).
  const filteredPerBrand = useMemo(() => {
    return data.filter((row) => {
      if (row.tracking_nascosto) return false;
      // Esito definitivo del negozio = pratica completata = sparisce da sola.
      // ECCEZIONE: se l'admin la boccia (non conforme) torna lavorabile e riappare.
      if (!mostraCompletate && esitoCompletato(row.statoNegozio, row.categoria, row.brand) && row.statoAdmin !== "non_conforme") return false;
      if (catSel.length > 0 && !catSel.includes(row.categoria)) return false;
      if (utentiSel.length > 0 && !respRigaTutti(row).some((n) => utentiSel.includes(n))) return false;
      if (venditoreSel && !respRigaTutti(row).includes(venditoreSel)) return false;
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
  }, [data, catSel, search, statoSel, periodoDA, periodoA, mostraCompletate, negozioSel, utentiSel, regoleV]);

  // I numeri delle card KPI rispettano ANCHE il brand selezionato.
  const filteredPerKpi = useMemo(
    () => (brandSel.length > 0 ? filteredPerBrand.filter((r) => brandSel.includes(r.brand)) : filteredPerBrand),
    [filteredPerBrand, brandSel]
  );

  // Delega la verifica di una pratica a un collaboratore (o rimuove la delega).
  const handleDelegate = useCallback(async (rowId: string, toId: string | null) => {
    const target = rawList.find((r) => (r.id as string) === rowId);
    // pratica vista solo con la capacità esito admin = niente delega (la UI
    // già non la offre: guardia al varco unico delle scritture di delega)
    if (target && !inPerimetroReale(target)) { alert("Pratica fuori dai tuoi punti vendita: con la capacità esito admin si lavora solo l'esito, niente delega."); return; }
    const oggi = new Date().toLocaleDateString("it-IT");
    const storia = Array.isArray((target as any)?.storia) ? [...(target as any).storia] : [];
    storia.push({ data: oggi, tipo: "delega",
      testo: toId ? `Verifica delegata a ${memberName(toId) || "collaboratore"}` : "Delega verifica rimossa",
      utente: user?.name || "—", ruolo: "admin" });
    const { error } = await supabase.from("contracts")
      .update({ delegated_to: toId, delegated_by: toId ? (user?.id ?? null) : null, delegated_at: toId ? new Date().toISOString() : null, storia }).eq("id", rowId);
    if (error) { setLoadError(error.message); return; }
    setRawList((prev) => prev.map((r) => (r.id as string) === rowId ? { ...r, delegated_to: toId, delegated_by: toId ? user?.id : null, storia } : r));
    setSelected((s) => s && s.id === rowId ? { ...s, delegated_to: toId, delegated_by: toId ? (user?.id ?? null) : null, storia } : s);
  }, [rawList, memberName, user, inPerimetroReale]);

  // Cestino — NUOVO DISEGNO (Luca 06/08): dal Tracking NON si elimina mai la
  // vendita. Il cestino NASCONDE la pratica da questa vista (flag
  // tracking_nascosto): contratto, allegati e Ricerca Vendite non si toccano.
  // (Prima il popup offriva anche il DELETE vero del contratto: rimosso.)
  const handleElimina = useCallback(async (row: TrackingRow) => {
    setEliminando(true);
    try {
      const { error } = await supabase.from("contracts").update({ tracking_nascosto: true }).eq("id", row.id);
      if (error) throw error;
      // MOD-27: la pratica sparisce dalla vista — l'eventuale bozza nel drawer
      // NON va committata (scriverebbe storico su una pratica appena nascosta)
      if (selectedRef.current && selectedRef.current.id === row.id) scartaCommitRef.current = true;
      setRawList((prev) => prev.map((r) => ((r.id as string) === row.id ? { ...r, tracking_nascosto: true } : r)));
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
    // fuori dal perimetro reale niente delega: si delegano solo le pratiche
    // che si vedrebbero anche senza la capacità esito admin
    const fuori = ids.filter((id) => { const t = rawList.find((r) => (r.id as string) === id); return t && !inPerimetroReale(t); });
    if (fuori.length) {
      alert(`${fuori.length} pratiche fuori dai tuoi punti vendita: escluse dalla delega (con la capacità esito admin si lavora solo l'esito).`);
      ids = ids.filter((id) => !fuori.includes(id));
      if (!ids.length) return;
    }
    const nome = memberName(toId) || "collaboratore";
    const oggi = new Date().toLocaleDateString("it-IT");
    for (const id of ids) {
      const target = rawList.find((r) => (r.id as string) === id);
      const storia = Array.isArray((target as any)?.storia) ? [...(target as any).storia] : [];
      storia.push({ data: oggi, tipo: "delega", testo: `Verifica delegata a ${nome}`, utente: user?.name || "—", ruolo: "admin" });
      await supabase.from("contracts").update({ delegated_to: toId, delegated_by: user?.id ?? null, delegated_at: toId ? new Date().toISOString() : null, storia }).eq("id", id);
    }
    setRawList((prev) => prev.map((r) => ids.includes(r.id as string) ? { ...r, delegated_to: toId, delegated_by: user?.id } : r));
  }, [rawList, memberName, user, inPerimetroReale]);

  const handleUpdate = useCallback(
    async (updated: TrackingRow, opts?: { salvaFollowup?: boolean }) => {
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
      const { data: _cur } = await supabase.from("contracts").select("stati_categoria, dettagli").eq("id", updated.id).maybeSingle();
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
      // MOD-27: i follow-up P.IVA (cliente irreperibile) vivono in dettagli —
      // prima non venivano MAI persistiti; si scrivono solo quando cambiano
      if (opts?.salvaFollowup) {
        payload.dettagli = { ...((_cur?.dettagli as Record<string, unknown>) || {}), followup: updated.followup || [] };
      }
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
      // MOD-27: il commit puo' arrivare dal drawer della pratica PRECEDENTE
      // (unmount al cambio pratica): la selezione si aggiorna solo se e' ancora
      // la stessa riga, altrimenti si riaprirebbe la scheda vecchia
      setSelected((sel) => sel && sel.id === updated.id && sel.categoria === updated.categoria ? updated : sel);
    },
    []
  );

  return (
    <div className="-m-4 sm:-m-6 md:-m-8 text-white flex flex-col min-h-0 overflow-x-hidden" style={{ height: "calc(100vh - 4rem)" }}>
      {/* HEADER BLOCCATO in stile Gestione Usati (Luca 10/08): titolo, KPI,
          tessere brand, filtri e ricerca non scrollano — scorre solo la lista.
          relative z-20: senza, il backdrop-blur crea un contesto sotto la
          tabella e le tendine dei filtri finiscono coperte (lezione Usati). */}
      <div className="flex-shrink-0 bg-[#0f111a]/80 backdrop-blur-xl border-b border-white/5 relative z-20">
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-5 sm:py-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">📡 Tracking PDA</h1>
            <p className="text-sm text-slate-500 mt-1">Monitoraggio pratiche: esito negozio, esito admin, storico e malus</p>
          </div>
          {/* Bottoni in griglia compatta come Gestione Usati; toggle = formula
              attivo bg-500/25 border-400/60 + " ✓". Filtri personali (Luca
              03/08): chi riceve deleghe ha "📥 Delegate a me"; chi puo' delegare
              "📤 Delegate da me"; l'amministrazione "⚡ Da lavorare". */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setMostraCompletate((v) => !v)}
              title="Le pratiche con esito definitivo del negozio spariscono da sole: attiva per rivederle"
              className={"flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all " + (mostraCompletate ? "bg-emerald-500/25 border-emerald-400/60 text-emerald-100" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/20")}
            >
              👁 Mostra completate{mostraCompletate ? " ✓" : ""}
            </button>
            {/* visibile a TUTTI (rilievo revisore 25/08): era legato a
                !canEditAdmin quando la capacità coincideva con l'amministrazione
                — a uno store manager con la capacità spariva il filtro deleghe */}
            <button
              type="button"
              onClick={() => setOnlyMine((v) => !v)}
              className={"flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all " + (onlyMine ? "bg-blue-500/25 border-blue-400/60 text-blue-100" : "bg-blue-500/10 border-blue-500/30 text-blue-200 hover:bg-blue-500/20")}
            >
              📥 Delegate a me{onlyMine ? " ✓" : ""}
            </button>
            {canDelegate && (
              <button
                type="button"
                onClick={() => setOnlyDelegate((v) => !v)}
                title="Solo le pratiche che HAI delegato a qualcuno"
                className={"flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all " + (onlyDelegate ? "bg-purple-500/25 border-purple-400/60 text-purple-100" : "bg-purple-500/10 border-purple-500/30 text-purple-200 hover:bg-purple-500/20")}
              >
                📤 Delegate da me{onlyDelegate ? " ✓" : ""}
              </button>
            )}
            {canEditAdmin && (
              <button
                type="button"
                onClick={() => setSoloDaLavorare((v) => !v)}
                title="Pratiche chiuse dal negozio che aspettano la verifica dell'amministrazione"
                className={"flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all " + (soloDaLavorare ? "bg-amber-500/25 border-amber-400/60 text-amber-100" : "bg-amber-500/10 border-amber-500/30 text-amber-200 hover:bg-amber-500/20")}
              >
                ⚡ Da lavorare{soloDaLavorare ? " ✓" : ""}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowRegole(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 border border-white/10 text-xs font-semibold hover:bg-white/10 transition-all"
            >
              📋 Regole
            </button>
          </div>
        </div>

        {!loading && (
          <>
            <div className="px-4 sm:px-6 pb-1">
              <KpiBar
                data={filteredPerKpi}
                onFilter={setKpiFilter}
                activeFilter={kpiFilter}
                storicoTotale={storicoTotale}
                onApriStorico={() => setShowArchivio(true)}
                brands={ordinaBrandTracking([...new Set(data.filter((r) => !r.tracking_nascosto).map((r) => r.brand).filter(Boolean))])}
                dataBrand={filteredPerBrand}
                brandSel={brandSel}
                setBrandSel={setBrandSel}
              />
            </div>
            <FilterBar
              categorie={categorieAttive}
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
              // PDA-01: le opzioni pescano da baseVisibile (pratiche monitorabili
              // in questo momento), non piu' da tutta `data`.
              venditori={venditoriAttivi}
              negozioSel={negozioSel}
              setNegozioSel={setNegozioSel}
              negozi={negoziAttivi}
              utenti={utentiAttivi}
              utentiSel={utentiSel}
              setUtentiSel={setUtentiSel}
            />
          </>
        )}
      </div>

      {/* LISTA: solo questa scrolla (come Gestione Usati) */}
      <div className="flex-1 min-h-0 overflow-auto px-3 sm:px-6 py-4 pb-8">
        {loadError && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            Errore: {loadError}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-500 text-sm">Caricamento pratiche…</div>
        ) : (
          <Tabella rows={filtered} onSelect={setSelected} canDelegate={canDelegate} members={members} onBulkDelegate={handleBulkDelegate} archivio={episodiPerRiga} canDelete={["admin", "dev"].includes(user?.role || "")} onAskDelete={setDaEliminare} />
        )}

        {/* Modale Regole: FUORI dall'header sticky — il backdrop-blur di un
            antenato diventa il containing block dei position:fixed e la modale
            ne resterebbe intrappolata. */}
        {showRegole && (
          <div
            className="fixed inset-0 bg-black/60 z-[1100] flex items-center justify-center p-4"
            onClick={() => setShowRegole(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Regole di Ingaggio"
          >
            <div
              className="bg-[#0e1526] border border-white/10 rounded-2xl w-full max-w-[980px] max-h-[88vh] overflow-y-auto shadow-2xl"
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

        {/* Popup cestino: NASCONDE dal Tracking, la vendita non si tocca
            (nuovo disegno eliminazioni, Luca 06/08). */}
        {daEliminare && (
          <div
            className="fixed inset-0 bg-black/60 z-[1200] flex items-center justify-center p-4"
            onClick={() => { if (!eliminando) setDaEliminare(null); }}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-white/10 p-6"
              style={{ background: "var(--tf-0e1526)", boxShadow: "0 18px 50px rgba(0,0,0,.55)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-lg font-extrabold text-slate-100 mb-1">🗑️ Togli dal Tracking PDA</div>
              <div className="text-[13px] text-slate-400 mb-5">
                {daEliminare.nominativo} — {daEliminare.brand} · {daEliminare.categoria}
              </div>
              <button
                type="button"
                disabled={eliminando}
                onClick={() => handleElimina(daEliminare)}
                className="w-full text-left rounded-xl border border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors px-4 py-3 mb-2.5 cursor-pointer disabled:opacity-50"
              >
                <div className="text-sm font-bold text-indigo-200">📡 Togli da questa sezione</div>
                <div className="text-[11px] text-slate-400 mt-0.5">La pratica sparisce da questa sezione; la vendita resta in Ricerca Vendite (per eliminarla davvero si passa da lì)</div>
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
            canCompensare={puoCompensare}
            puoEliminare={user?.role === "admin" || user?.role === "dev"}
            utente={user?.name || "—"}
            venditoreIniziale={malusDeepLink || undefined}
            onAggiornato={(ep) => setEpisodi((prev) => prev.map((e) => (e.id === ep.id ? ep : e)))}
          />
        )}

        {selected && (
          /* MOD-27: il key RIMONTA il drawer a ogni cambio pratica — senza,
             React riusava l'istanza e la bozza (stato/note) della pratica
             precedente "traslocava" sulla nuova; l'unmount della vecchia
             istanza fa anche il commit automatico della sua bozza */
          <Drawer key={selected.rowKey || `${selected.id}#${selected.categoria}`}
            row={selected} onClose={() => setSelected(null)} onUpdate={handleUpdate}
            members={members} canDelegate={canDelegate} canEditAdmin={canEditAdmin} canEditNegozio={inPerimetroReale(selected)} onDelegate={handleDelegate} delegatoNome={memberName(selected.delegated_to)}
            episodiMalus={episodiPerRiga.get(`${selected.id}#${selected.categoria}`) || []}
            scartaRef={scartaCommitRef} />
        )}
      </div>
    </div>
  );
}
