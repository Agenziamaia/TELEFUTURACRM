// @ts-nocheck
"use client";

import React from "react";
import { TRK_BRAND_LOGOS, TRK_LOGO_SCALE, trkBrandKey } from "@/lib/brandAssets";

/* ============================================================================
   REPORT GIORNALIERO - canvas di cattura
   ----------------------------------------------------------------------------
   Componente PURO a dimensioni fisse: 1080 x 1620 px (2:3).
   Nessuna animazione, nessuna transizione, nessun hover, nessun breakpoint:
   deve produrre lo stesso identico PNG a ogni esecuzione.

   La fotografia la scatta il BROWSER DEL NEGOZIO (ModaleReport.tsx), non un
   servizio a parte: il foglio e' gia' a schermo, e fotografarlo li' vuol dire
   che quello che il negozio vede e' quello che parte. html-to-image, JPEG a
   qualita' 0,95 (il PNG dello stesso foglio pesa cinque volte e mezzo).

   Lo sfondo va servito da /report-bg.webp (public/). NON usare URL remote:
   se l'immagine arriva dopo lo scatto, il report esce senza fondale.
   ========================================================================== */

/* --- costanti di resa. Unica manopola per la resa dello sfondo. ---------- */
const BG_URL = "/report-bg.webp";
const VELO = 0.62;   // opacita' del velo scuro sopra la foto
const VETRO = 0.5;   // opacita' dei pannelli in vetro
const CORNICE = 80;  // bordo in cui vive lo sfondo, px, uniforme sui 4 lati

const W = 1080;
const H = 1620;

const T = {
  base: "#0f111a",
  border: "rgba(255,255,255,0.08)",
  text: "#f8fafc",
  muted: "#94a3b8",
  dim: "#64748b",
  dimmer: "#475569"
};

/* Colori brand: stessi valori di TRK_BRAND_COLORS, qui in esadecimale perche'
   le var(--tf-*) non sono garantite dentro un canvas isolato. */
const HEX = {
  windtre: "#f97316", wind3: "#f97316", vodafone: "#e60000", fastweb: "#eab308",
  sky: "#8b5cf6", s4: "#22c55e", energy: "#22c55e", tim: "#0050ff",
  iliad: "#c00028", dojo: "#14b8a6", verymobile: "#84cc16",
  homobile: "#9b26b6", kenamobile: "#e4002b", kena: "#e4002b",
  kipoint: "#0072c6", marginalita: "#22c55e"
};

const G = { head: 136, strip: 62, rail: 56, marg: 138, ai: 96, gap: 12,
  rigaH: 54, headCard: 46, unitRow: 20, padCard: 8, padCardB: 6 };

const TS = { h1: 42, sub: 18, kpi: 78, ricLab: 17, cat: 26, det: 16, num: 30,
  tot: 26, band: 18, bandV: 30, tot2: 46, unit: 13 };

/* Distribuzione colonne: 22 righe totali, 11 per colonna. */
const COLONNE = [["windtre", "s4", "iliad"], ["vodafone", "sky", "fastweb"]];

/* --- icone: SVG inline. Mai emoji: su Linux headless senza font emoji
       diventano quadratini, e il server di cattura e' proprio quello. ----- */
const ICONA = {
  "Mobile": "sim", "Fisso": "rete", "Customer Base": "utenti", "Business": "valigetta",
  "Luce & Gas": "fulmine", "TNP": "telefono", "Assicurazioni": "ombrello",
  "Protecta": "scudo", "Fibra": "fibra", "TV": "tv", "3P": "tre",
  "Luce": "lampadina", "Gas": "fiamma", "Attivazioni": "check"
};

function Ico({ cat, size, color }) {
  const k = ICONA[cat] || "check";
  const p = { fill: "none", stroke: color, strokeWidth: 1.7,
    strokeLinecap: "round", strokeLinejoin: "round" };
  let body = null;
  if (k === "sim") body = (<g><path d="M7 3h6l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" {...p} /><rect x="9" y="12" width="6" height="6" rx="1.2" {...p} /></g>);
  else if (k === "rete") body = (<g><path d="M4 11a12 12 0 0 1 16 0" {...p} /><path d="M7.5 14.5a7 7 0 0 1 9 0" {...p} /><circle cx="12" cy="18.5" r="1.4" {...p} /></g>);
  else if (k === "utenti") body = (<g><circle cx="9" cy="8" r="3" {...p} /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" {...p} /><path d="M16.5 5.5a3 3 0 0 1 0 5.5" {...p} /><path d="M17 20a5.5 5.5 0 0 0-1.8-4" {...p} /></g>);
  else if (k === "valigetta") body = (<g><rect x="3" y="7.5" width="18" height="12.5" rx="2" {...p} /><path d="M9 7.5V5.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" {...p} /><path d="M3 13h18" {...p} /></g>);
  else if (k === "fulmine") body = (<path d="M13 2.5 4.5 14H11l-1 7.5L19.5 10H13z" {...p} />);
  else if (k === "telefono") body = (<g><rect x="6.5" y="2.5" width="11" height="19" rx="2.2" {...p} /><path d="M10.5 18.5h3" {...p} /></g>);
  else if (k === "ombrello") body = (<g><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5h-17A8.5 8.5 0 0 1 12 3.5z" {...p} /><path d="M12 12v6.5a2 2 0 0 0 4 0" {...p} /></g>);
  else if (k === "scudo") body = (<g><path d="M12 2.5 4.5 5.5v6c0 4.8 3.2 8.6 7.5 10.3 4.3-1.7 7.5-5.5 7.5-10.3v-6z" {...p} /><path d="M9 11.8l2.2 2.2L15.2 10" {...p} /></g>);
  else if (k === "fibra") body = (<g><path d="M3.5 20.5c3.5-9.5 13.5-9.5 17 0" {...p} /><path d="M7 20.5c2.2-5.5 5-7 8-7" {...p} /><circle cx="15" cy="13.5" r="1.5" {...p} /></g>);
  else if (k === "tv") body = (<g><rect x="2.5" y="5" width="19" height="12.5" rx="2" {...p} /><path d="M8.5 21h7" {...p} /><path d="M12 17.5V21" {...p} /></g>);
  else if (k === "tre") body = (<g><rect x="4" y="3.5" width="16" height="4.6" rx="1.4" {...p} /><rect x="4" y="10" width="16" height="4.6" rx="1.4" {...p} /><rect x="4" y="16.5" width="16" height="4" rx="1.4" {...p} /></g>);
  else if (k === "lampadina") body = (<g><path d="M12 3a5.8 5.8 0 0 0-3.2 10.7V16h6.4v-2.3A5.8 5.8 0 0 0 12 3z" {...p} /><path d="M9.5 19h5" {...p} /><path d="M10.5 21.5h3" {...p} /></g>);
  else if (k === "fiamma") body = (<path d="M12 2.5s5 4.6 5 9.5a5 5 0 0 1-10 0c0-2 .9-3.4 1.9-4.8 0 1.9 1 2.9 2 2.9 0-2.9 1.1-5.6 1.1-7.6z" {...p} />);
  else body = (<g><circle cx="12" cy="12" r="8.8" {...p} /><path d="M8.2 12.4l2.6 2.6 5-5.2" {...p} /></g>);
  return <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0, display: "block" }}>{body}</svg>;
}

/* --- loghi: PNG del repo. TRK_LOGO_SCALE compensa il marchio annegato nel
       canvas trasparente dei file 900x900. Il box resta identico. -------- */
function Logo({ id, boxH }) {
  const k = trkBrandKey(id);
  const src = TRK_BRAND_LOGOS[k];
  if (!src) return null;
  const sc = TRK_LOGO_SCALE[k] || 1;
  return (
    <span style={{ height: boxH, display: "flex", alignItems: "center", overflow: "visible" }}>
      <img src={src} alt="" style={{ height: boxH * sc, width: "auto",
        objectFit: "contain", display: "block" }} />
    </span>
  );
}

/* --- formattatori: stessi di analisi/_charts.tsx ------------------------- */
function fmtN(v, dec) {
  const d = dec || 0;
  return Number(v || 0).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPt(v) {
  const n = Math.round(Number(v || 0) * 100) / 100;
  if (n % 1 === 0) return fmtN(n);
  return fmtN(n, Math.round(n * 10) % 10 === 0 ? 1 : 2);
}
function fmtEuro(v) {
  const n = Math.round(Number(v) || 0);
  return n ? fmtN(n) + " \u20AC" : "\u2013";
}

const gl = function (k) { return "rgba(26,29,41," + Math.min(0.95, VETRO * k).toFixed(3) + ")"; };

function ptDi(b, r) {
  if (b.calcPt) return (Number(r.pz) || 0) * (r.val || 0);
  return r.pt === undefined ? null : r.pt;
}
function totPunti(b) {
  if (!b.pt) return null;
  let t = 0;
  for (let i = 0; i < b.righe.length; i++) t += Number(ptDi(b, b.righe[i])) || 0;
  return t;
}
function vuotoBrand(b) {
  for (let i = 0; i < b.righe.length; i++) if (Number(b.righe[i].pz) > 0) return false;
  return true;
}
function altezzaCard(b, rigaH) {
  return G.padCard + G.headCard + G.unitRow + b.righe.length * rigaH +
    (b.righe.length - 1) * 3 + G.padCardB;
}

/* L'ALTEZZA DI RIGA CHE FA ENTRARE TUTTO.
   Il foglio è alto 1620 px e basta; il numero di righe invece cambia — Sky ne ha
   quattro, e la riga «Altro» compare quando una vendita non trova posto altrove.
   Con l'altezza fissa a 54 px il caso pieno sfondava la colonna: le carte hanno
   flexShrink 0, quindi non si stringevano — si sovrapponevano, e Fastweb usciva
   tagliata a metà dalla fotografia.
   Qui si parte dallo spazio che c'è e si divide per le righe della colonna più
   carica. Sotto i 38 px il testo non ci starebbe più: è il pavimento. */
function altezzaRiga(perId, conRail) {
  const spazio = H - 2 * CORNICE - G.head - G.strip - G.marg - G.ai
    - G.gap * (conRail ? 5 : 4) - (conRail ? G.rail : 0);
  let righeMax = 0, carteMax = 0;
  COLONNE.forEach(function (ids) {
    let r = 0, c = 0;
    ids.forEach(function (id) { const b = perId[id]; if (b) { r += b.righe.length; c += 1; } });
    if (r > righeMax) { righeMax = r; carteMax = c; }
  });
  if (!righeMax) return G.rigaH;
  const fisso = carteMax * (G.padCard + G.headCard + G.unitRow + G.padCardB)
    + G.gap * Math.max(0, carteMax - 1) + 3 * Math.max(0, righeMax - carteMax);
  return Math.max(38, Math.min(G.rigaH, Math.floor((spazio - fisso) / righeMax)));
}

const W_PZ = Math.round(TS.num * 2.2);
const W_PT = Math.round(TS.num * 2.5);

function Riga({ b, r, rigaH }) {
  const colore = HEX[trkBrandKey(b.id)] || "#94a3b8";
  const zero = !r.pz;
  const p = ptDi(b, r);
  const senzaPunti = p === null || p === undefined;
  return (
    <div style={{ display: "flex", alignItems: "center", height: rigaH, gap: 9,
      padding: "0 10px", borderRadius: 8, opacity: zero ? 0.34 : 1,
      background: zero ? "transparent" : "rgba(255,255,255,0.032)",
      borderLeft: "3px solid " + (zero ? "rgba(255,255,255,0.06)" : colore) }}>
      <Ico cat={r.cat} size={Math.round(TS.cat * 0.98)} color={zero ? T.dimmer : colore} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
        justifyContent: "center" }}>
        <span style={{ fontSize: TS.cat, fontWeight: 600, color: T.muted, lineHeight: 1.12,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.cat}</span>
        {r.det && !zero
          ? <span style={{ fontSize: TS.det, fontWeight: 600, color: T.dimmer, lineHeight: 1.15,
              whiteSpace: "nowrap" }}>{"di cui " + r.det}</span>
          : null}
      </div>
      <span style={{ width: W_PZ, textAlign: "right", fontSize: TS.num, fontWeight: 800,
        color: zero ? T.dimmer : T.text, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
        {zero ? "\u2013" : fmtN(r.pz)}</span>
      {b.pt
        ? <span style={{ width: W_PT, textAlign: "right", fontSize: TS.num, fontWeight: 800,
            fontVariantNumeric: "tabular-nums", lineHeight: 1,
            color: senzaPunti ? "rgba(255,255,255,0.14)" : (!p ? T.dimmer : colore) }}>
            {senzaPunti ? "\u00B7" : (!p ? "\u2013" : fmtPt(p))}</span>
        : null}
    </div>
  );
}

function CardBrand({ b, rigaH }) {
  const colore = HEX[trkBrandKey(b.id)] || "#94a3b8";
  const vuota = vuotoBrand(b);
  const tp = totPunti(b);
  return (
    <div style={{ flexGrow: b.righe.length, flexShrink: 0, flexBasis: altezzaCard(b, rigaH),
      display: "flex", flexDirection: "column",
      padding: G.padCard + "px 10px " + G.padCardB + "px 10px", borderRadius: 15,
      background: vuota ? gl(0.63) : gl(1),
      backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)",
      border: "1px solid " + T.border, boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
      opacity: vuota ? 0.55 : 1 }}>
      <div style={{ height: G.headCard, display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 10, borderBottom: "1px solid " + T.border }}>
        <span style={{ filter: vuota ? "grayscale(1) brightness(0.65)" : "drop-shadow(0 0 9px " + colore + "55)" }}>
          <Logo id={b.id} boxH={TS.cat * 1.24} />
        </span>
        {vuota
          ? <span style={{ fontSize: TS.det, fontWeight: 700, letterSpacing: "0.10em",
              textTransform: "uppercase", color: T.dimmer }}>nessuna produzione</span>
          : <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              {b.totPt && tp > 0
                ? <span style={{ fontSize: TS.det, fontWeight: 700, color: T.dim,
                    fontVariantNumeric: "tabular-nums" }}>{fmtPt(tp) + " pt totali"}</span>
                : null}
              <span style={{ fontSize: TS.tot, fontWeight: 800, color: T.text,
                fontVariantNumeric: "tabular-nums" }}>{fmtEuro(b.euro)}</span>
            </div>}
      </div>
      <div style={{ height: G.unitRow, display: "flex", alignItems: "center", gap: 9, padding: "0 10px" }}>
        <span style={{ flex: 1 }} />
        <span style={{ width: W_PZ, textAlign: "right", fontSize: TS.unit, fontWeight: 800,
          letterSpacing: "0.14em", color: T.dimmer }}>PEZZI</span>
        {b.pt
          ? <span style={{ width: W_PT, textAlign: "right", fontSize: TS.unit, fontWeight: 800,
              letterSpacing: "0.14em", color: T.dimmer }}>PUNTI</span>
          : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
        {b.righe.map(function (r, i) { return <Riga key={b.id + i} b={b} r={r} rigaH={rigaH} />; })}
      </div>
    </div>
  );
}

/* Rail: presente SOLO se almeno un brand minore ha prodotto oggi.
   Brand minori: TIM, Dojo, Kipoint, Very, Ho, Kena. */
const RAIL_MAX = 5;   // oltre, la corsia non ci sta in una riga

function Rail({ minori }) {
  const mostrati = minori.slice(0, RAIL_MAX);
  const restanti = minori.length - mostrati.length;
  return (
    <div style={{ height: G.rail, display: "flex", alignItems: "center", gap: 10, padding: "0 14px",
      overflow: "hidden",
      borderRadius: 13, background: "rgba(26,29,41," + Math.min(0.95, VETRO * 0.74).toFixed(3) + ")",
      backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)",
      border: "1px solid " + T.border }}>
      <span style={{ fontSize: TS.unit, fontWeight: 800, letterSpacing: "0.16em",
        textTransform: "uppercase", color: T.dimmer, marginRight: 4 }}>Altri brand</span>
      {mostrati.map(function (m) {
        const c = HEX[trkBrandKey(m.id)] || "#94a3b8";
        return (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", minWidth: 0,
            borderRadius: 9, background: "rgba(255,255,255,0.045)", border: "1px solid " + c + "44" }}>
            <Logo id={m.id} boxH={TS.cat * 1.15} />
            <span style={{ fontSize: TS.num * 0.78, fontWeight: 800, color: T.text,
              fontVariantNumeric: "tabular-nums" }}>{fmtN(m.pz)}
              <span style={{ fontSize: TS.unit * 0.9, color: T.dim, marginLeft: 3 }}>pz</span></span>
            <span style={{ fontSize: TS.det, fontWeight: 700, color: c }}>{fmtEuro(m.e)}</span>
          </div>
        );
      })}
      {restanti > 0
        ? <span style={{ fontSize: TS.det, fontWeight: 700, color: T.dim, whiteSpace: "nowrap" }}>
            {"+" + restanti + " altri"}</span>
        : null}
    </div>
  );
}

function Marg({ voci }) {
  let tot = 0;
  for (let i = 0; i < voci.length; i++) tot += voci[i].v;
  const verde = HEX.marginalita;
  return (
    <div style={{ height: G.marg, borderRadius: 15, display: "flex", alignItems: "stretch",
      padding: "0 18px",
      background: "rgba(26,29,41," + Math.min(0.95, VETRO * 1.06).toFixed(3) + ")",
      backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)",
      border: "1px solid " + verde + "3a",
      boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 0 50px " + verde + "0d" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 5,
        paddingRight: 20, minWidth: 175, borderRight: "1px solid " + T.border }}>
        <span style={{ fontSize: TS.band, fontWeight: 800, letterSpacing: "0.18em",
          textTransform: "uppercase", color: verde }}>{"Marginalit\u00E0"}</span>
        <span style={{ fontSize: TS.tot2 * 0.85, fontWeight: 900, color: T.text, lineHeight: 1,
          fontVariantNumeric: "tabular-nums" }}>{fmtEuro(tot)}</span>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
        {voci.map(function (m, i) {
          const z = !m.v;
          return (
            <div key={m.l} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4,
              paddingLeft: i === 0 ? 18 : 12, opacity: z ? 0.42 : 1 }}>
              <span style={{ fontSize: TS.unit, fontWeight: 800, letterSpacing: "0.10em",
                textTransform: "uppercase", color: T.dim }}>{m.l}</span>
              <span style={{ fontSize: TS.bandV * 0.82, fontWeight: 800, color: z ? T.dimmer : T.text,
                fontVariantNumeric: "tabular-nums" }}>{z ? "\u2013" : fmtEuro(m.v)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ==========================================================================
   dati attesi:
   {
     negozio: "Donna Olimpia",
     data: "Venerdi 28 Agosto 2026",
     ingressi: 24,
     usati: 2,
     commento: "testo generato da DeepSeek, max 200 caratteri",
     brands: [ { id, euro, pt, calcPt?, totPt?, righe:[{cat,pz,pt|val,det?}] } ],
     minori: [ { id, pz, e } ],            // vuoto = rail assente
     marginalita: [ {l:"Prodotti", v:34}, ... ]   // 5 voci
   }
   ========================================================================== */
export default function ReportGiornaliero({ dati }) {
  const d = dati;
  const perId = {};
  for (let i = 0; i < d.brands.length; i++) perId[d.brands[i].id] = d.brands[i];

  let ricavo = 0;
  for (let i = 0; i < d.brands.length; i++) ricavo += Number(d.brands[i].euro) || 0;
  const minori = d.minori || [];
  for (let i = 0; i < minori.length; i++) ricavo += Number(minori[i].e) || 0;
  // quanto spazio ha ogni riga, viste le carte di OGGI e la corsia di oggi
  const rigaH = altezzaRiga(perId, (d.minori || []).length > 0);

  let margTot = 0;
  for (let i = 0; i < d.marginalita.length; i++) margTot += d.marginalita[i].v;
  const totale = ricavo + margTot;

  return (
    <div id="report-canvas" style={{ position: "relative", width: W, height: H,
      overflow: "hidden", background: T.base }}>

      <div style={{ position: "absolute", inset: 0 }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "url(" + BG_URL + ")",
          backgroundSize: "cover", backgroundPosition: "center" }} />
        <div style={{ position: "absolute", inset: 0, background: "rgba(12,15,26," + VELO + ")" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage:
          "radial-gradient(ellipse at top left, rgba(79,70,229,0.22), transparent 55%)," +
          "radial-gradient(ellipse at bottom right, rgba(236,72,153,0.14), transparent 55%)" }} />
      </div>

      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex",
        flexDirection: "column", padding: CORNICE + "px", boxSizing: "border-box", gap: G.gap,
        fontFamily: "var(--font-sans, Outfit), ui-sans-serif, system-ui, sans-serif",
        color: T.text }}>

        <div style={{ height: G.head, display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: TS.h1, fontWeight: 900, letterSpacing: "-0.015em", lineHeight: 1 }}>
              REPORT GIORNALIERO</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ padding: "5px 14px", borderRadius: 999, fontSize: TS.sub, fontWeight: 800,
                color: "#c7d2fe", background: "rgba(79,70,229,0.28)",
                border: "1px solid rgba(99,102,241,0.5)" }}>{d.negozio}</span>
              <span style={{ fontSize: TS.sub, fontWeight: 600, color: T.muted }}>{d.data}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span style={{ fontSize: TS.ricLab, fontWeight: 800, letterSpacing: "0.18em",
              textTransform: "uppercase", color: T.dim }}>Ricavo totale</span>
            <span style={{ fontSize: TS.kpi, fontWeight: 900, lineHeight: 1,
              fontVariantNumeric: "tabular-nums", color: totale > 0 ? T.text : T.dimmer,
              textShadow: totale > 0 ? "0 0 34px rgba(99,102,241,0.55)" : "none" }}>{fmtEuro(totale)}</span>
          </div>
        </div>

        <div style={{ height: G.strip, display: "flex" }}>
          <div style={{ flex: "0 0 48%", display: "flex", gap: 10 }}>
            {[["Ingressi", d.ingressi], ["Usati comprati", d.usati]].map(function (m, i) {
              return (
                <div key={"m" + i} style={{ flex: 1, display: "flex", alignItems: "center",
                  justifyContent: "space-between", padding: "0 15px", borderRadius: 12,
                  background: gl(1), backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)",
                  border: "1px solid " + T.border }}>
                  <span style={{ fontSize: TS.unit, fontWeight: 800, letterSpacing: "0.10em",
                    textTransform: "uppercase", color: T.dim }}>{m[0]}</span>
                  <span style={{ fontSize: TS.num, fontWeight: 900, color: m[1] ? T.text : T.dimmer,
                    fontVariantNumeric: "tabular-nums" }}>{m[1] ? fmtN(m[1]) : "\u2013"}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", gap: G.gap, minHeight: 0 }}>
          {COLONNE.map(function (ids, ci) {
            return (
              <div key={"c" + ci} style={{ flex: 1, display: "flex", flexDirection: "column",
                gap: G.gap, minHeight: 0 }}>
                {ids.map(function (id) {
                  const b = perId[id];
                  if (!b) return null;
                  return <CardBrand key={id} b={b} rigaH={rigaH} />;
                })}
              </div>
            );
          })}
        </div>

        {minori.length > 0 ? <Rail minori={minori} /> : null}
        <Marg voci={d.marginalita} />

        <div style={{ height: G.ai, display: "flex", alignItems: "center", gap: 14, padding: "0 18px",
          borderRadius: 15, background: "rgba(79,70,229,0.13)",
          backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)",
          border: "1px solid rgba(99,102,241,0.32)" }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0,
            background: "linear-gradient(135deg,#4f46e5,#a855f7)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: TS.unit, fontWeight: 800, letterSpacing: "0.16em",
              textTransform: "uppercase", color: "#a5b4fc" }}>Commento della giornata</span>
            <span style={{ fontSize: TS.det * 1.25, color: T.muted, lineHeight: 1.35 }}>
              {(d.commento || "").slice(0, 200)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
