import { useState, useMemo, useRef, useCallback } from "react";

const STATUS_LIST = [
  { key: "acquistato", label: "Acquistato", icon: "\u{1F6D2}", color: "#8b949e" },
  { key: "in_transito", label: "In Transito", icon: "\u{1F69A}", color: "#d29922" },
  { key: "ricevuto", label: "Ricevuto", icon: "\u{1F4E5}", color: "#58a6ff" },
  { key: "in_lavorazione", label: "In Lavorazione", icon: "\u{1F527}", color: "#d2a8ff" },
  { key: "pronto", label: "Pronto", icon: "\u2705", color: "#3fb950" },
  { key: "invio_in_negozio", label: "Arrivo in Negozio", icon: "\u{1F4E6}", color: "#f0883e" },
  { key: "in_vendita", label: "In Vendita", icon: "\u{1F3F7}\uFE0F", color: "#3fb950" },
  { key: "venduto", label: "Venduto", icon: "\u{1F4B8}", color: "#f85149" },
  { key: "ko", label: "KO", icon: "\u274C", color: "#f85149" },
];
const statusMap = Object.fromEntries(STATUS_LIST.map(s => [s.key, s]));
const STATUS_KEYS = STATUS_LIST.map(s => s.key);

const KPI_CARDS = [
  { key: "_all", label: "Totale", icon: "\u{1F4CA}", color: "#8b5cf6" },
  { key: "acquistato", label: "Acquistato", icon: "\u{1F6D2}", color: "#8b949e" },
  { key: "invio_in_negozio", label: "Arrivo in Negozio", icon: "\u{1F4E6}", color: "#f0883e" },
  { key: "in_vendita", label: "In Vendita", icon: "\u{1F3F7}\uFE0F", color: "#3fb950" },
  { key: "venduto", label: "Venduto", icon: "\u{1F4B8}", color: "#f85149" },
];

const NEGOZI = ["Magliana","Donna","Libia","Collatina","Mazzini","San Paolo","Garbatella","Promontori","Acilia","Baleniere","Castani","Merulana","Telefonico"];
const DATE_FIELDS = [
  { key: "created_at", label: "Data Registrazione" },
  { key: "purchase_date", label: "Data Acquisto" },
  { key: "listed_date", label: "Data Messa in Vendita" },
  { key: "sold_date", label: "Data Vendita" },
];

const RICAMBI_CATALOG = ["Display LCD","Batteria","Fotocamera posteriore","Fotocamera frontale","Connettore ricarica","Altoparlante","Microfono","Tasto accensione","Tasto volume","Vetro posteriore","Scheda madre","Sensore impronte","Face ID module","Antenna NFC","Vibrazione motore"];
const BRANDS_PHONES = ["Apple iPhone 15","Apple iPhone 15 Pro","Apple iPhone 14","Apple iPhone 13","Samsung Galaxy S24","Samsung Galaxy S23","Samsung Galaxy A54","Samsung Galaxy A34","Xiaomi 14","Xiaomi Redmi Note 13","Xiaomi 13T","OPPO Reno 11","OPPO A79","Huawei P60","Huawei Nova 12","Motorola Edge 40","Google Pixel 8","Nothing Phone 2","OnePlus 12","Realme GT 5","Honor Magic 6","Samsung Galaxy Z Flip5","Apple iPhone SE"];

const randomDate = (f, t) => { const a = new Date(f).getTime(), b = new Date(t).getTime(); return new Date(a + Math.random() * (b - a)); };
const fmtDate = d => d ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "\u2014";
const fmtEur = v => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const isoDate = d => d.toISOString().slice(0, 10);
const genIMEI = () => { let s = "35"; for (let i = 0; i < 13; i++) s += Math.floor(Math.random() * 10); return s; };
const fmtDateTime = d => d ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "\u2014";

const OPERATORI = ["Alberto", "Francesca", "Daniele", "Giulia", "Michele", "Marta", "Federico", "Eloise", "Riccardo", "Lorenzo"];

const RICAMBIO_STATES = [
  { key: "in_magazzino", label: "In Magazzino", color: "#3fb950" },
  { key: "da_ordinare", label: "Da Ordinare", color: "#d29922" },
  { key: "ordinato", label: "Ordinato", color: "#58a6ff" },
  { key: "arrivato", label: "Arrivato", color: "#3fb950" },
];

const VENDITORI = ["Alberto","Alex","Alin","Asad","Ben Aziza","Cristhian","Cristi","Damiano","Daniel","Daniele","Denise","Dimitri","Eloise","Eros","Fadel","Federico","Francesca","Francesco","George","Giacomo","Gian","Giulia","Giuseppe B.","Ilaria","Lorenzo","Manu","Marta","Matteo","Michele","Riccardo","Roberto","Samantha","Sheekell","Tommaso","Veronica"];
const PHONE_BRANDS_MODELS = {
  Apple: ["iPhone 16 Pro Max","iPhone 16 Pro","iPhone 16","iPhone 15 Pro Max","iPhone 15 Pro","iPhone 15","iPhone 14 Pro","iPhone 14","iPhone 13","iPhone SE"],
  Samsung: ["Galaxy S24 Ultra","Galaxy S24+","Galaxy S24","Galaxy S23","Galaxy Z Fold5","Galaxy Z Flip5","Galaxy A54","Galaxy A34","Galaxy A15"],
  Xiaomi: ["14 Ultra","14","13T Pro","13T","Redmi Note 13 Pro","Redmi Note 13","Redmi 13C"],
  OPPO: ["Find X7","Reno 11 Pro","Reno 11","A79","A58"],
  Huawei: ["P60 Pro","P60","Nova 12","Nova 11"],
  Google: ["Pixel 8 Pro","Pixel 8","Pixel 7a"],
  OnePlus: ["12","Nord 3","Nord CE3"],
  Motorola: ["Edge 40 Pro","Edge 40","Moto G84"],
  Nothing: ["Phone 2","Phone 1"],
  Realme: ["GT 5 Pro","GT 5","12 Pro+"],
  Honor: ["Magic 6 Pro","Magic 6","90"],
};
const CAPACITA_OPTIONS = ["32 GB","64 GB","128 GB","256 GB","512 GB","1 TB"];
const COLORI_OPTIONS = ["Nero","Bianco","Blu","Rosso","Verde","Oro","Argento","Viola","Rosa","Grigio","Titanio","Altro"];
const GRADI_USURA = [
  { key: "A", label: "Grado A - Come nuovo", desc: "Nessun segno visibile" },
  { key: "B", label: "Grado B - Buono", desc: "Lievi segni di usura" },
  { key: "C", label: "Grado C - Discreto", desc: "Segni evidenti ma funzionante" },
  { key: "D", label: "Grado D - Usurato", desc: "Segni importanti, possibili difetti estetici" },
];

const LIFECYCLE = ["acquistato", "in_transito", "ricevuto", "in_lavorazione", "pronto", "invio_in_negozio", "in_vendita", "venduto"];

const statusDist = [
  ...Array(6).fill("acquistato"), ...Array(4).fill("in_transito"), ...Array(5).fill("ricevuto"),
  ...Array(8).fill("in_lavorazione"), ...Array(5).fill("pronto"), ...Array(4).fill("invio_in_negozio"),
  ...Array(18).fill("in_vendita"), ...Array(14).fill("venduto"), ...Array(4).fill("ko"),
];

const MOCK_DEVICES = statusDist.map((status, i) => {
  const price = Math.round((80 + Math.random() * 720) / 10) * 10;
  const store = NEGOZI[Math.floor(Math.random() * NEGOZI.length)];
  const hasR = ["pronto", "invio_in_negozio", "in_vendita", "venduto"].includes(status);
  const inLav = status === "in_lavorazione";
  const rc = hasR ? Math.floor(Math.random() * 3) : (inLav ? 1 + Math.floor(Math.random() * 2) : 0);
  const ricambi = []; const used = new Set();
  for (let r = 0; r < rc; r++) {
    let idx; do { idx = Math.floor(Math.random() * RICAMBI_CATALOG.length); } while (used.has(idx)); used.add(idx);
    const rState = hasR ? "arrivato" : (inLav ? ["in_magazzino", "da_ordinare", "ordinato", "arrivato"][Math.floor(Math.random() * 4)] : "da_ordinare");
    ricambi.push({
      name: RICAMBI_CATALOG[idx], stato: rState,
      cost: hasR || Math.random() > 0.4 ? Math.round((5 + Math.random() * 45) * 100) / 100 : 0,
      data_consegna_prevista: rState === "ordinato" ? isoDate(randomDate("2026-03-10", "2026-03-25")) : "",
    });
  }
  const isKO = status === "ko";
  const lcIdx = isKO ? 4 : LIFECYCLE.indexOf(status);
  const baseDate = new Date("2025-08-01").getTime();
  const history = {};
  for (let h = 0; h <= Math.min(lcIdx, LIFECYCLE.length - 1); h++) {
    const dt = new Date(baseDate + h * (2 + Math.random() * 5) * 86400000);
    dt.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));
    history[LIFECYCLE[h]] = { date: dt, operatore: OPERATORI[Math.floor(Math.random() * OPERATORI.length)] };
  }
  if (isKO) { const dt = new Date(baseDate + 5 * 86400000); dt.setHours(14, Math.floor(Math.random() * 60)); history["ko"] = { date: dt, operatore: OPERATORI[Math.floor(Math.random() * OPERATORI.length)] }; }
  return {
    id: i + 1, model: BRANDS_PHONES[Math.floor(Math.random() * BRANDS_PHONES.length)], imei: genIMEI(), status,
    sale_price: price, purchase_price: Math.round(price * (0.35 + Math.random() * 0.25)), store,
    target_store: ["invio_in_negozio", "in_vendita", "venduto"].includes(status) ? NEGOZI[Math.floor(Math.random() * 12)] : null,
    created_at: randomDate("2025-06-01", "2026-03-10"), purchase_date: randomDate("2025-04-01", "2026-02-28"),
    listed_date: ["in_vendita", "venduto"].includes(status) ? randomDate("2025-07-01", "2026-03-08") : null,
    sold_date: status === "venduto" ? randomDate("2026-01-01", "2026-03-09") : null,
    ricambi, note_tecnico: inLav ? "Verifica componenti in corso" : (status === "ko" ? "Scheda madre irrecuperabile" : ""),
    status_history: history,
  };
});

const C = {
  bg: "#0d1117", card: "#161b22", cardHover: "#1c2333", border: "#30363d",
  text: "#e6edf3", textMuted: "#8b949e", textDim: "#484f58",
  purple: "#8b5cf6", purpleGlow: "rgba(139,92,246,0.15)", purpleBorder: "rgba(139,92,246,0.4)",
  green: "#3fb950", orange: "#d29922", blue: "#58a6ff", red: "#f85149", yellow: "#e3b341",
  inputBg: "#0d1117", inputBorder: "#30363d",
};

function MultiSelect({ options, selected, onChange, renderOption }) {
  const [open, setOpen] = useState(false);
  const allSel = selected.length === options.length;
  const toggle = opt => onChange(selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt]);
  return (
    <div style={{ position: "relative", minWidth: 220 }}>
      <div style={{ background: C.inputBg, color: C.text, border: "1px solid " + C.inputBorder, borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minHeight: 38 }} onClick={() => setOpen(!open)}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {allSel ? "Tutti" : selected.length === 0 ? "Nessuno" :
            selected.length <= 2 ? (renderOption ? selected.map((o, i) => <span key={o}>{i > 0 ? ", " : ""}{renderOption(o)}</span>) : selected.join(", ")) :
            <span style={{ background: C.purpleGlow, color: C.purple, borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{selected.length} selezionati</span>}
        </span>
        <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>{open ? "\u25B2" : "\u25BC"}</span>
      </div>
      {open && <>
        <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: "6px 0", zIndex: 50, maxHeight: 300, overflow: "auto", boxShadow: "0 8px 30px rgba(0,0,0,0.4)" }}>
          <div style={{ padding: "7px 14px", fontSize: 11, color: C.purple, cursor: "pointer", fontWeight: 600, borderBottom: "1px solid " + C.border, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }} onClick={() => onChange(allSel ? [] : [...options])}>{allSel ? "Deseleziona Tutti" : "Seleziona Tutti"}</div>
          {options.map(opt => {
            const ch = selected.includes(opt);
            return (
              <div key={opt} style={{ padding: "7px 14px", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: ch ? C.purpleGlow : "transparent", color: C.text }}
                onClick={() => toggle(opt)}
                onMouseEnter={e => { if (!ch) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = ch ? C.purpleGlow : "transparent"; }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: "2px solid " + (ch ? C.purple : C.border), background: ch ? C.purple : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", flexShrink: 0 }}>{ch && "\u2713"}</div>
                {renderOption ? renderOption(opt) : opt}
              </div>
            );
          })}
        </div>
      </>}
    </div>
  );
}

function StatusBadge({ statusKey }) {
  const s = statusMap[statusKey]; if (!s) return <span>{statusKey}</span>;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.color + "18", color: s.color, border: "1px solid " + s.color + "40" }}>{s.icon} {s.label}</span>;
}

function StatusTimeline({ currentStatus, history }) {
  const isKO = currentStatus === "ko";
  const currentIdx = isKO ? 3 : LIFECYCLE.indexOf(currentStatus);
  const [openStep, setOpenStep] = useState(null);
  const hist = history || {};
  return (
    <div>
      {LIFECYCLE.map((sk, i) => {
        const s = statusMap[sk]; const done = !isKO && i < currentIdx; const active = !isKO && i === currentIdx;
        const hasHistory = !!hist[sk];
        const clickable = done || active;
        return (
          <div key={sk}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", opacity: done || active ? 1 : 0.35, cursor: clickable ? "pointer" : "default", position: "relative" }}
              onClick={() => { if (clickable && hasHistory) setOpenStep(openStep === sk ? null : sk); }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, background: done ? s.color + "25" : (active ? s.color + "40" : C.bg), border: "2px solid " + (done || active ? s.color : C.border), boxShadow: active ? "0 0 10px " + s.color + "40" : "none", transition: "transform 0.15s", transform: openStep === sk ? "scale(1.2)" : "scale(1)" }}>{done ? "\u2713" : s.icon}</div>
              <span style={{ fontSize: 12, fontWeight: active ? 700 : 400, color: active ? C.text : C.textMuted }}>{s.label}</span>
              {clickable && hasHistory && <span style={{ fontSize: 10, color: C.textDim, marginLeft: 4 }}>{"\u{1F4C5}"}</span>}
            </div>
            {openStep === sk && hasHistory && (
              <div style={{ marginLeft: 36, marginBottom: 4, padding: "8px 12px", background: C.bg, border: "1px solid " + s.color + "40", borderRadius: 8, fontSize: 12, lineHeight: 1.6 }}>
                <div style={{ color: C.text, fontWeight: 600 }}>{s.icon} {s.label}</div>
                <div style={{ color: C.textMuted }}>{"\u{1F4C5}"} {fmtDateTime(hist[sk].date)}</div>
                <div style={{ color: C.textMuted }}>{"\u{1F464}"} {hist[sk].operatore}</div>
              </div>
            )}
            {i < LIFECYCLE.length - 1 && <div style={{ width: 2, height: 10, background: done ? C.green : C.border, marginLeft: 12 }} />}
          </div>
        );
      })}
      {isKO && <>
        <div style={{ width: 2, height: 10, background: C.border, marginLeft: 12 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: hist["ko"] ? "pointer" : "default", position: "relative" }}
          onClick={() => { if (hist["ko"]) setOpenStep(openStep === "ko" ? null : "ko"); }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, background: C.red + "40", border: "2px solid " + C.red, transition: "transform 0.15s", transform: openStep === "ko" ? "scale(1.2)" : "scale(1)" }}>{"\u274C"}</div>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.red }}>KO \u2014 Non riparabile</span>
          {hist["ko"] && <span style={{ fontSize: 10, color: C.textDim, marginLeft: 4 }}>{"\u{1F4C5}"}</span>}
        </div>
        {openStep === "ko" && hist["ko"] && (
          <div style={{ marginLeft: 36, marginBottom: 4, padding: "8px 12px", background: C.bg, border: "1px solid " + C.red + "40", borderRadius: 8, fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ color: C.text, fontWeight: 600 }}>{"\u274C"} KO</div>
            <div style={{ color: C.textMuted }}>{"\u{1F4C5}"} {fmtDateTime(hist["ko"].date)}</div>
            <div style={{ color: C.textMuted }}>{"\u{1F464}"} {hist["ko"].operatore}</div>
          </div>
        )}
      </>}
    </div>
  );
}

function RicambioRow({ r, idx, onUpdate, onRemove }) {
  const stColor = RICAMBIO_STATES.find(s => s.key === r.stato);
  return (
    <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", marginBottom: 8, border: "1px solid " + C.border }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{"\u{1F529}"} {r.name}</span>
        <select style={{ background: C.inputBg, color: stColor ? stColor.color : C.text, border: "1px solid " + (stColor ? stColor.color + "60" : C.inputBorder), borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, outline: "none", cursor: "pointer" }}
          value={r.stato} onChange={e => onUpdate(idx, { ...r, stato: e.target.value })}>
          {RICAMBIO_STATES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <div style={{ marginLeft: "auto" }}>
          <button style={{ background: "none", border: "none", color: C.textMuted, fontSize: 14, cursor: "pointer", padding: "2px 6px" }} onClick={() => onRemove(idx)} title="Rimuovi">{"\u{1F5D1}"}</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: C.textMuted }}>Costo:</span>
          <input type="number" step="0.01" min="0" style={{ background: C.inputBg, color: C.text, border: "1px solid " + C.inputBorder, borderRadius: 6, padding: "4px 8px", fontSize: 12, width: 80, outline: "none" }}
            value={r.cost || ""} onChange={e => onUpdate(idx, { ...r, cost: parseFloat(e.target.value) || 0 })} placeholder="0.00" />
          <span style={{ fontSize: 11, color: C.textMuted }}>{"\u20AC"}</span>
        </div>
        {r.stato === "ordinato" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>Consegna prevista:</span>
            <input type="date" style={{ background: C.inputBg, color: C.text, border: "1px solid " + C.inputBorder, borderRadius: 6, padding: "4px 8px", fontSize: 12, outline: "none" }}
              value={r.data_consegna_prevista || ""} onChange={e => onUpdate(idx, { ...r, data_consegna_prevista: e.target.value })} />
          </div>
        )}
      </div>
    </div>
  );
}

function DevicePanel({ device, onClose, onSave }) {
  const [dev, setDev] = useState(() => ({ ...device, ricambi: device.ricambi.map(r => ({ ...r })) }));
  const [newRicambio, setNewRicambio] = useState("");
  const [newRicambioInMag, setNewRicambioInMag] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [targetStore, setTargetStore] = useState(dev.target_store || "");
  const [noteTecnico, setNoteTecnico] = useState(dev.note_tecnico || "");
  const s = statusMap[dev.status];
  const canAdvance = !["venduto", "ko"].includes(dev.status);
  const nextSt = () => { const idx = LIFECYCLE.indexOf(dev.status); return idx >= 0 && idx < LIFECYCLE.length - 1 ? LIFECYCLE[idx + 1] : null; };
  const next = nextSt();
  const needsStore = dev.status === "pronto";
  const totalRicambiCost = dev.ricambi.reduce((s, r) => s + (r.cost || 0), 0);
  const margin = dev.sale_price - dev.purchase_price - totalRicambiCost;

  const addRicambio = () => {
    if (!newRicambio.trim()) return;
    setDev(p => ({ ...p, ricambi: [...p.ricambi, { name: newRicambio.trim(), stato: newRicambioInMag ? "in_magazzino" : "da_ordinare", cost: 0, data_consegna_prevista: "" }] }));
    setNewRicambio(""); setShowAdd(false); setNewRicambioInMag(false);
  };
  const updateRicambio = (idx, updated) => { setDev(p => { const r = [...p.ricambi]; r[idx] = updated; return { ...p, ricambi: r }; }); };
  const removeRicambio = idx => { setDev(p => ({ ...p, ricambi: p.ricambi.filter((_, i) => i !== idx) })); };
  const advanceStatus = () => {
    if (needsStore && !targetStore) return;
    setDev(p => { const u = { ...p, status: next, note_tecnico: noteTecnico }; if (needsStore) u.target_store = targetStore; if (next === "in_vendita") u.listed_date = new Date(); if (next === "venduto") u.sold_date = new Date(); return u; });
  };
  const setKO = () => setDev(p => ({ ...p, status: "ko", note_tecnico: noteTecnico }));
  const handleSave = () => { onSave({ ...dev, note_tecnico: noteTecnico }); };
  const ab = color => ({ background: color + "18", color, border: "1px solid " + color + "40", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 40 }} onClick={onClose}>
      <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 16, width: "94%", maxWidth: 960, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 28px", borderBottom: "1px solid " + C.border, position: "sticky", top: 0, background: C.card, zIndex: 3, borderRadius: "16px 16px 0 0" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>{s && s.icon} {dev.model}</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2, fontFamily: "monospace" }}>IMEI: {dev.imei}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button style={ab(C.purple)} onClick={handleSave}>{"\u{1F4BE}"} Salva</button>
            <button style={{ background: "none", border: "none", color: C.textMuted, fontSize: 22, cursor: "pointer", padding: "4px 8px" }} onClick={onClose}>{"\u2715"}</button>
          </div>
        </div>
        <div style={{ padding: "24px 28px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 28 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{"\u{1F4CD}"} Stato</div>
              <div style={{ marginBottom: 12 }}><StatusBadge statusKey={dev.status} /></div>
              <StatusTimeline currentStatus={dev.status} history={dev.status_history} />
              {canAdvance && (
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                  {needsStore && (
                    <select style={{ background: C.inputBg, color: C.text, border: "1px solid " + C.inputBorder, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" }} value={targetStore} onChange={e => setTargetStore(e.target.value)}>
                      <option value="">Seleziona Negozio...</option>
                      {NEGOZI.filter(n => n !== "Telefonico").map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  )}
                  {next && <button style={ab(C.green)} onClick={advanceStatus}>{"\u25B6"} {statusMap[next] && statusMap[next].icon} {statusMap[next] && statusMap[next].label}</button>}
                  {["in_lavorazione", "ricevuto"].includes(dev.status) && <button style={ab(C.red)} onClick={setKO}>{"\u274C"} KO</button>}
                </div>
              )}
            </div>
            <div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{"\u{1F4CB}"} Dettagli</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px" }}>
                  {[["Modello", dev.model, false], ["IMEI", dev.imei, true], ["Prezzo Acquisto", fmtEur(dev.purchase_price), false], ["Prezzo Vendita", fmtEur(dev.sale_price), false], ["Negozio Origine", dev.store, false], ["Negozio Dest.", dev.target_store || "\u2014", false], ["Data Acquisto", fmtDate(dev.purchase_date), false], ["Data Reg.", fmtDate(dev.created_at), false]].map(([l, v, mono], i) => (
                    <div key={i}>
                      <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: "uppercase" }}>{l}</div>
                      <div style={{ fontSize: 14, color: l === "Prezzo Vendita" ? C.green : C.text, fontWeight: l === "Prezzo Vendita" ? 700 : 500, marginBottom: 8, fontFamily: mono ? "monospace" : "inherit" }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 8, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid " + C.border }}>
                  <div><div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase" }}>Costo Ricambi</div><div style={{ fontSize: 14, fontWeight: 600, color: C.orange }}>{fmtEur(totalRicambiCost)}</div></div>
                  <div><div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase" }}>Margine</div><div style={{ fontSize: 14, fontWeight: 700, color: margin >= 0 ? C.green : C.red }}>{fmtEur(margin)}</div></div>
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{"\u{1F529}"} Ricambi ({dev.ricambi.length})</div>
                  <button style={ab(C.blue)} onClick={() => setShowAdd(!showAdd)}>+ Aggiungi</button>
                </div>
                {showAdd && (
                  <div style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid " + C.border, marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <select style={{ background: C.inputBg, color: C.text, border: "1px solid " + C.inputBorder, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", flex: 1 }} value={newRicambio} onChange={e => setNewRicambio(e.target.value)}>
                        <option value="">Seleziona ricambio...</option>
                        {RICAMBI_CATALOG.filter(r => !dev.ricambi.some(x => x.name === r)).map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button style={ab(C.green)} onClick={addRicambio}>Aggiungi</button>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text, cursor: "pointer" }}>
                      <input type="checkbox" checked={newRicambioInMag} onChange={e => setNewRicambioInMag(e.target.checked)} style={{ accentColor: C.green }} />
                      {"\u2705"} Presente in magazzino
                    </label>
                  </div>
                )}
                {dev.ricambi.length === 0 ? (
                  <div style={{ padding: 16, textAlign: "center", color: C.textMuted, fontSize: 13, background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid " + C.border }}>Nessun ricambio richiesto</div>
                ) : dev.ricambi.map((r, idx) => (
                  <RicambioRow key={idx} r={r} idx={idx} onUpdate={updateRicambio} onRemove={removeRicambio} />
                ))}
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{"\u{1F4DD}"} Note</div>
                <textarea style={{ background: C.inputBg, color: C.text, border: "1px solid " + C.inputBorder, borderRadius: 8, padding: "10px 12px", fontSize: 13, outline: "none", width: "100%", minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
                  value={noteTecnico} onChange={e => setNoteTecnico(e.target.value)} placeholder="Note tecnico / amministrazione..." />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RegistraUsatoPanel({ onClose, onSave }) {
  const [step, setStep] = useState(1);
  const [venditore, setVenditore] = useState("");
  const [negozio, setNegozio] = useState("");
  const [tipoCliente, setTipoCliente] = useState("");
  const [searchField, setSearchField] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [clienteFound, setClienteFound] = useState(null);
  const [ana, setAna] = useState({ nome: "", cognome: "", cf: "", piva: "", email: "", cellulare: "", fisso: "", iban: "", domicilio: "", ragioneSociale: "", referente: "", pec: "", sdi: "", sedeLegale: "" });
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [capacita, setCapacita] = useState("");
  const [colore, setColore] = useState("");
  const [imei, setImei] = useState("");
  const [prezzoAcquisto, setPrezzoAcquisto] = useState("");
  const [gradoUsura, setGradoUsura] = useState("");
  const [allegDocumento, setAllegDocumento] = useState(null);
  const [allegDichiarazione, setAllegDichiarazione] = useState(null);

  const ipt = { background: C.inputBg, color: C.text, border: "1px solid " + C.inputBorder, borderRadius: 8, padding: "10px 14px", fontSize: 13, outline: "none", width: "100%" };
  const sel = { ...ipt, cursor: "pointer" };
  const lbl = { fontSize: 12, color: C.textMuted, fontWeight: 600, marginBottom: 4, display: "block" };
  const ab = color => ({ background: color + "18", color, border: "1px solid " + color + "40", borderRadius: 8, padding: "10px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, transition: "all 0.2s" });
  const stepDot = (n) => ({ width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, background: step >= n ? C.purple + "30" : C.bg, color: step >= n ? C.purple : C.textDim, border: "2px solid " + (step >= n ? C.purple : C.border) });

  const doSearch = () => {
    if (!searchValue.trim()) return;
    setClienteFound(true);
    if (tipoCliente === "consumer") setAna({ ...ana, nome: "Mario", cognome: "Rossi", cf: "RSSMRA80A01H501U", email: "mario.rossi@email.com", cellulare: "333 1234567", fisso: "06 1234567", domicilio: "Via Roma 15, 00100 Roma" });
    else setAna({ ...ana, ragioneSociale: "Rossi S.r.l.", piva: "12345678901", referente: "Mario Rossi", cellulare: "333 1234567", email: "info@rossi.it", pec: "azienda@pec.it", sdi: "Abc1234", sedeLegale: "Via Roma 15, 00100 Roma" });
  };
  const doNew = () => { setClienteFound(false); };

  const canNext = () => {
    if (step === 1) return venditore && negozio;
    if (step === 2) return tipoCliente && clienteFound !== null;
    if (step === 3) return brand && model && capacita && colore && imei && prezzoAcquisto && gradoUsura;
    if (step === 4) return allegDocumento && allegDichiarazione;
    return false;
  };

  const handleSubmit = () => {
    onSave({
      venditore, negozio, tipoCliente, anagrafica: ana,
      brand, model, capacita, colore, imei, prezzoAcquisto: parseFloat(prezzoAcquisto) || 0, gradoUsura,
      allegati: { documento: allegDocumento, dichiarazione: allegDichiarazione },
    });
  };

  const renderStep = () => {
    if (step === 1) return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div><label style={lbl}>Venditore *</label><select style={sel} value={venditore} onChange={e => setVenditore(e.target.value)}><option value="">Seleziona venditore...</option>{VENDITORI.map(v => <option key={v} value={v}>{v}</option>)}</select></div>
        <div><label style={lbl}>Negozio *</label><select style={sel} value={negozio} onChange={e => setNegozio(e.target.value)}><option value="">Seleziona negozio...</option>{NEGOZI.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
      </div>
    );
    if (step === 2) return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          {["consumer", "business"].map(t => (
            <div key={t} style={{ border: "1px solid " + (tipoCliente === t ? C.purple : C.border), borderRadius: 12, padding: "18px 20px", cursor: "pointer", background: tipoCliente === t ? C.purple + "12" : C.card, textAlign: "center", transition: "all 0.2s" }}
              onClick={() => { setTipoCliente(t); setClienteFound(null); setSearchValue(""); }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{t === "consumer" ? "\u{1F464}" : "\u{1F3E2}"}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: tipoCliente === t ? C.purple : C.text }}>{t === "consumer" ? "CONSUMER" : "BUSINESS"}</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>{t === "consumer" ? "Persona fisica" : "Azienda / P.IVA"}</div>
            </div>
          ))}
        </div>
        {tipoCliente && (
          <div>
            <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>Ricerca Cliente Esistente</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <select style={{ ...sel, width: "auto", minWidth: 180 }} value={searchField} onChange={e => setSearchField(e.target.value)}>
                <option value="">Cerca per...</option>
                {tipoCliente === "consumer" ? <><option value="cf">Codice Fiscale</option><option value="cell">Numero Cellulare</option></> : <><option value="piva">Partita IVA</option><option value="cell">Numero Cellulare</option></>}
              </select>
              <input style={{ ...ipt, flex: 1 }} placeholder={searchField === "cf" ? "RSSMRA80A..." : searchField === "piva" ? "1234567..." : "333..."} value={searchValue} onChange={e => setSearchValue(e.target.value)} />
              <button style={ab(C.green)} onClick={doSearch}>{"\u{1F50D}"} Cerca</button>
              <button style={ab(C.blue)} onClick={doNew}>{"\u{1F464}"} Nuovo</button>
            </div>
            {clienteFound === true && (
              <div style={{ padding: 14, background: C.green + "12", border: "1px solid " + C.green + "40", borderRadius: 10, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: C.green, fontWeight: 600, marginBottom: 10 }}>{"\u2705"} Cliente trovato! Dati pre-compilati.</div>
                {tipoCliente === "consumer" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label style={lbl}>Nome *</label><input style={ipt} value={ana.nome} onChange={e => setAna({ ...ana, nome: e.target.value })} /></div>
                    <div><label style={lbl}>Cognome *</label><input style={ipt} value={ana.cognome} onChange={e => setAna({ ...ana, cognome: e.target.value })} /></div>
                    <div><label style={lbl}>Codice Fiscale *</label><input style={ipt} value={ana.cf} onChange={e => setAna({ ...ana, cf: e.target.value })} /></div>
                    <div><label style={lbl}>Email</label><input style={ipt} value={ana.email} onChange={e => setAna({ ...ana, email: e.target.value })} /></div>
                    <div><label style={lbl}>Cellulare</label><input style={ipt} value={ana.cellulare} onChange={e => setAna({ ...ana, cellulare: e.target.value })} /></div>
                    <div><label style={lbl}>Domicilio</label><input style={ipt} value={ana.domicilio} onChange={e => setAna({ ...ana, domicilio: e.target.value })} /></div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label style={lbl}>Ragione Sociale *</label><input style={ipt} value={ana.ragioneSociale} onChange={e => setAna({ ...ana, ragioneSociale: e.target.value })} /></div>
                    <div><label style={lbl}>Partita IVA *</label><input style={ipt} value={ana.piva} onChange={e => setAna({ ...ana, piva: e.target.value })} /></div>
                    <div><label style={lbl}>Referente *</label><input style={ipt} value={ana.referente} onChange={e => setAna({ ...ana, referente: e.target.value })} /></div>
                    <div><label style={lbl}>Cellulare</label><input style={ipt} value={ana.cellulare} onChange={e => setAna({ ...ana, cellulare: e.target.value })} /></div>
                    <div><label style={lbl}>Email</label><input style={ipt} value={ana.email} onChange={e => setAna({ ...ana, email: e.target.value })} /></div>
                    <div><label style={lbl}>PEC</label><input style={ipt} value={ana.pec} onChange={e => setAna({ ...ana, pec: e.target.value })} /></div>
                    <div><label style={lbl}>Codice Univoco / SDI</label><input style={ipt} value={ana.sdi} onChange={e => setAna({ ...ana, sdi: e.target.value })} /></div>
                    <div><label style={lbl}>Sede Legale</label><input style={ipt} value={ana.sedeLegale} onChange={e => setAna({ ...ana, sedeLegale: e.target.value })} /></div>
                  </div>
                )}
              </div>
            )}
            {clienteFound === false && (
              <div style={{ padding: 14, background: C.blue + "12", border: "1px solid " + C.blue + "40", borderRadius: 10 }}>
                <div style={{ fontSize: 13, color: C.blue, fontWeight: 600, marginBottom: 10 }}>{"\u{1F464}"} Nuovo cliente \u2014 compila i dati</div>
                {tipoCliente === "consumer" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label style={lbl}>Nome *</label><input style={ipt} value={ana.nome} onChange={e => setAna({ ...ana, nome: e.target.value })} placeholder="es. Mario" /></div>
                    <div><label style={lbl}>Cognome *</label><input style={ipt} value={ana.cognome} onChange={e => setAna({ ...ana, cognome: e.target.value })} placeholder="es. Rossi" /></div>
                    <div><label style={lbl}>Codice Fiscale *</label><input style={ipt} value={ana.cf} onChange={e => setAna({ ...ana, cf: e.target.value })} placeholder="RSSMRA80A01H501U" /></div>
                    <div><label style={lbl}>Email</label><input style={ipt} value={ana.email} onChange={e => setAna({ ...ana, email: e.target.value })} placeholder="mario@email.com" /></div>
                    <div><label style={lbl}>Cellulare</label><input style={ipt} value={ana.cellulare} onChange={e => setAna({ ...ana, cellulare: e.target.value })} placeholder="333 1234567" /></div>
                    <div><label style={lbl}>Domicilio</label><input style={ipt} value={ana.domicilio} onChange={e => setAna({ ...ana, domicilio: e.target.value })} placeholder="Via, CAP, Citt\u00E0" /></div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label style={lbl}>Ragione Sociale *</label><input style={ipt} value={ana.ragioneSociale} onChange={e => setAna({ ...ana, ragioneSociale: e.target.value })} placeholder="Azienda S.r.l." /></div>
                    <div><label style={lbl}>Partita IVA *</label><input style={ipt} value={ana.piva} onChange={e => setAna({ ...ana, piva: e.target.value })} placeholder="12345678901" /></div>
                    <div><label style={lbl}>Referente *</label><input style={ipt} value={ana.referente} onChange={e => setAna({ ...ana, referente: e.target.value })} placeholder="Nome Cognome" /></div>
                    <div><label style={lbl}>Cellulare</label><input style={ipt} value={ana.cellulare} onChange={e => setAna({ ...ana, cellulare: e.target.value })} placeholder="333 1234567" /></div>
                    <div><label style={lbl}>Email</label><input style={ipt} value={ana.email} onChange={e => setAna({ ...ana, email: e.target.value })} placeholder="info@azienda.it" /></div>
                    <div><label style={lbl}>PEC</label><input style={ipt} value={ana.pec} onChange={e => setAna({ ...ana, pec: e.target.value })} placeholder="azienda@pec.it" /></div>
                    <div><label style={lbl}>Codice Univoco / SDI</label><input style={ipt} value={ana.sdi} onChange={e => setAna({ ...ana, sdi: e.target.value })} /></div>
                    <div><label style={lbl}>Sede Legale</label><input style={ipt} value={ana.sedeLegale} onChange={e => setAna({ ...ana, sedeLegale: e.target.value })} placeholder="Via, CAP, Citt\u00E0" /></div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
    if (step === 3) return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div><label style={lbl}>Brand *</label><select style={sel} value={brand} onChange={e => { setBrand(e.target.value); setModel(""); }}><option value="">Seleziona brand...</option>{Object.keys(PHONE_BRANDS_MODELS).map(b => <option key={b} value={b}>{b}</option>)}</select></div>
          <div><label style={lbl}>Modello *</label><select style={sel} value={model} onChange={e => setModel(e.target.value)} disabled={!brand}><option value="">Seleziona modello...</option>{brand && PHONE_BRANDS_MODELS[brand] && PHONE_BRANDS_MODELS[brand].map(m => <option key={m} value={m}>{m}</option>)}</select></div>
          <div><label style={lbl}>Capacit\u00E0 (GB) *</label><select style={sel} value={capacita} onChange={e => setCapacita(e.target.value)}><option value="">Seleziona...</option>{CAPACITA_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label style={lbl}>Colore *</label><select style={sel} value={colore} onChange={e => setColore(e.target.value)}><option value="">Seleziona...</option>{COLORI_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label style={lbl}>IMEI *</label><input style={ipt} value={imei} onChange={e => setImei(e.target.value)} placeholder="353456789012345" maxLength={15} /></div>
          <div><label style={lbl}>Prezzo Acquisto (\u20AC) *</label><input type="number" step="1" min="0" style={ipt} value={prezzoAcquisto} onChange={e => setPrezzoAcquisto(e.target.value)} placeholder="es. 250" /></div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={lbl}>Grado di Usura *</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {GRADI_USURA.map(g => (
              <div key={g.key} style={{ border: "1px solid " + (gradoUsura === g.key ? C.purple : C.border), borderRadius: 10, padding: "12px 16px", cursor: "pointer", background: gradoUsura === g.key ? C.purple + "12" : C.card, transition: "all 0.2s" }}
                onClick={() => setGradoUsura(g.key)}>
                <div style={{ fontSize: 13, fontWeight: 700, color: gradoUsura === g.key ? C.purple : C.text }}>{g.label}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{g.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
    if (step === 4) return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Documento di Identit\u00E0 *</label>
          <div style={{ border: "2px dashed " + (allegDocumento ? C.green : C.border), borderRadius: 10, padding: 20, textAlign: "center", cursor: "pointer", background: allegDocumento ? C.green + "08" : "transparent", transition: "all 0.2s" }}
            onClick={() => setAllegDocumento(allegDocumento ? null : "documento_id.pdf")}>
            {allegDocumento ? (
              <div><span style={{ fontSize: 28 }}>{"\u2705"}</span><div style={{ fontSize: 13, color: C.green, fontWeight: 600, marginTop: 6 }}>Documento caricato</div><div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{allegDocumento}</div></div>
            ) : (
              <div><span style={{ fontSize: 28 }}>{"\u{1F4CE}"}</span><div style={{ fontSize: 13, color: C.textMuted, marginTop: 6 }}>Clicca per caricare il documento</div><div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>PDF, JPG, PNG</div></div>
            )}
          </div>
        </div>
        <div>
          <label style={lbl}>Dichiarazione di Vendita (firmata) *</label>
          <div style={{ border: "2px dashed " + (allegDichiarazione ? C.green : C.border), borderRadius: 10, padding: 20, textAlign: "center", cursor: "pointer", background: allegDichiarazione ? C.green + "08" : "transparent", transition: "all 0.2s" }}
            onClick={() => setAllegDichiarazione(allegDichiarazione ? null : "dichiarazione_vendita.pdf")}>
            {allegDichiarazione ? (
              <div><span style={{ fontSize: 28 }}>{"\u2705"}</span><div style={{ fontSize: 13, color: C.green, fontWeight: 600, marginTop: 6 }}>Dichiarazione caricata</div><div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{allegDichiarazione}</div></div>
            ) : (
              <div><span style={{ fontSize: 28 }}>{"\u{1F4DD}"}</span><div style={{ fontSize: 13, color: C.textMuted, marginTop: 6 }}>Clicca per caricare la dichiarazione firmata</div><div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>PDF, JPG, PNG</div></div>
            )}
          </div>
        </div>
      </div>
    );
    return null;
  };

  const STEP_LABELS = ["Venditore e Negozio", "Anagrafica Cliente", "Dettaglio Prodotto", "Allegati"];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 30 }} onClick={onClose}>
      <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 16, width: "94%", maxWidth: 820, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 28px", borderBottom: "1px solid " + C.border, position: "sticky", top: 0, background: C.card, zIndex: 3, borderRadius: "16px 16px 0 0" }}>
          <div style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>{"\u{1F4F1}"} Registra Usato</div>
          <button style={{ background: "none", border: "none", color: C.textMuted, fontSize: 22, cursor: "pointer" }} onClick={onClose}>{"\u2715"}</button>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "20px 28px 0", alignItems: "center" }}>
          {STEP_LABELS.map((label, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {i > 0 && <div style={{ width: 30, height: 2, background: step > i ? C.purple : C.border }} />}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={stepDot(i + 1)}>{step > i + 1 ? "\u2713" : i + 1}</div>
                <span style={{ fontSize: 11, color: step >= i + 1 ? C.text : C.textDim, fontWeight: step === i + 1 ? 700 : 400, whiteSpace: "nowrap" }}>{label}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "24px 28px" }}>
          {renderStep()}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 28px", borderTop: "1px solid " + C.border }}>
          <div>{step > 1 && <button style={ab(C.textMuted)} onClick={() => setStep(step - 1)}>{"\u2190"} Indietro</button>}</div>
          <div>
            {step < 4 ? (
              <button style={ab(canNext() ? C.purple : C.textDim)} onClick={() => canNext() && setStep(step + 1)}
                onMouseEnter={e => { if (canNext()) e.currentTarget.style.background = C.purple + "30"; }}
                onMouseLeave={e => { e.currentTarget.style.background = (canNext() ? C.purple : C.textDim) + "18"; }}>
                Avanti {"\u2192"}
              </button>
            ) : (
              <button style={ab(canNext() ? C.green : C.textDim)} onClick={() => canNext() && handleSubmit()}
                onMouseEnter={e => { if (canNext()) e.currentTarget.style.background = C.green + "30"; }}
                onMouseLeave={e => { e.currentTarget.style.background = (canNext() ? C.green : C.textDim) + "18"; }}>
                {"\u2705"} Registra Usato
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GestioneUsati() {
  const [selectedStores, setSelectedStores] = useState([...NEGOZI]);
  const [selectedStatuses, setSelectedStatuses] = useState([...STATUS_KEYS]);
  const [dateField, setDateField] = useState("created_at");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchText, setSearchText] = useState("");
  const [devices, setDevices] = useState(MOCK_DEVICES);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showRegistra, setShowRegistra] = useState(false);
  const [sortKey, setSortKey] = useState("id");
  const [sortDir, setSortDir] = useState("desc");

  const filtered = useMemo(() => devices.filter(d => {
    if (!selectedStores.includes(d.store)) return false;
    if (!selectedStatuses.includes(d.status)) return false;
    if (dateFrom) { const v = d[dateField]; if (!v || isoDate(v) < dateFrom) return false; }
    if (dateTo) { const v = d[dateField]; if (!v || isoDate(v) > dateTo) return false; }
    if (searchText) { const q = searchText.toLowerCase(); if (!d.model.toLowerCase().includes(q) && !d.imei.includes(q)) return false; }
    return true;
  }), [devices, selectedStores, selectedStatuses, dateField, dateFrom, dateTo, searchText]);

  const inCirculation = useMemo(() => devices.filter(d => d.status !== "venduto" && d.status !== "ko"), [devices]);
  const inVetrina = useMemo(() => devices.filter(d => d.status === "in_vendita"), [devices]);
  const vetrinaValue = useMemo(() => inVetrina.reduce((s, d) => s + d.sale_price, 0), [inVetrina]);
  const totalInventoryValue = useMemo(() => inCirculation.reduce((s, d) => s + d.sale_price, 0), [inCirculation]);
  const kpiData = useMemo(() => { const c = {}; STATUS_KEYS.forEach(k => c[k] = 0); filtered.forEach(d => { c[d.status] = (c[d.status] || 0) + 1; }); c._total = filtered.filter(d => d.status !== "venduto" && d.status !== "ko").length; return c; }, [filtered]);
  const sorted = useMemo(() => [...filtered].sort((a, b) => { let va = a[sortKey], vb = b[sortKey]; if (va instanceof Date) va = va.getTime(); if (vb instanceof Date) vb = vb.getTime(); if (va == null) return 1; if (vb == null) return -1; const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? cmp : -cmp; }), [filtered, sortKey, sortDir]);

  const doSort = key => { if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir("asc"); } };
  const arrow = key => sortKey === key ? (sortDir === "asc" ? " \u2191" : " \u2193") : "";
  const handleKpiClick = sk => {
    const isAllActive = selectedStatuses.length === STATUS_KEYS.length - 2 && !selectedStatuses.includes("venduto") && !selectedStatuses.includes("ko");
    const isSingleActive = selectedStatuses.length === 1 && selectedStatuses[0] === sk;
    if (sk === "_all") {
      if (isAllActive) setSelectedStatuses([...STATUS_KEYS]);
      else setSelectedStatuses(STATUS_KEYS.filter(k => k !== "venduto" && k !== "ko"));
    } else {
      if (isSingleActive) setSelectedStatuses([...STATUS_KEYS]);
      else setSelectedStatuses([sk]);
    }
  };
  const resetFilters = () => { setSelectedStores([...NEGOZI]); setSelectedStatuses([...STATUS_KEYS]); setDateField("created_at"); setDateFrom(""); setDateTo(""); setSearchText(""); };
  const handleSaveDevice = updated => { setDevices(prev => prev.map(d => d.id === updated.id ? updated : d)); setSelectedDevice(null); };

  const th = { textAlign: "left", padding: "10px 14px", color: C.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid " + C.border, background: C.card, position: "sticky", top: 0, zIndex: 2, cursor: "pointer", userSelect: "none" };
  const td = { padding: "10px 14px", borderBottom: "1px solid " + C.border, color: C.text, verticalAlign: "middle" };
  const fl = { fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.5px" };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: C.bg, color: C.text, fontFamily: "'Segoe UI',system-ui,-apple-system,sans-serif" }}>
      <style>{`input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(0.7);cursor:pointer} ::-webkit-scrollbar{width:6px;height:6px} ::-webkit-scrollbar-track{background:${C.bg}} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}`}</style>

      {/* STICKY TOP */}
      <div style={{ flexShrink: 0, padding: "20px 32px 0 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>{"\u{1F4F1}"} Gestione Usati</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 2 }}>Gestione completa dispositivi usati</div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ background: "rgba(88,166,255,0.12)", border: "1px solid rgba(88,166,255,0.4)", borderRadius: 10, padding: "10px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>VALORE INVENTARIO</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.blue }}>{fmtEur(totalInventoryValue)}</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>{inCirculation.length} dispositivi</div>
            </div>
            <div style={{ background: C.purpleGlow, border: "1px solid " + C.purpleBorder, borderRadius: 10, padding: "10px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>VALORE VETRINA</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.purple }}>{fmtEur(vetrinaValue)}</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>{inVetrina.length} in vendita</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={fl}>Negozio</span><MultiSelect options={NEGOZI} selected={selectedStores} onChange={setSelectedStores} /></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={fl}>Stato</span><MultiSelect options={STATUS_KEYS} selected={selectedStatuses} onChange={setSelectedStatuses} renderOption={opt => { const s = statusMap[opt]; return <span style={{ display: "flex", alignItems: "center", gap: 6 }}>{s.icon} {s.label}</span>; }} /></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={fl}>Filtra per Data</span><select style={{ background: C.inputBg, color: C.text, border: "1px solid " + C.inputBorder, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", minWidth: 170 }} value={dateField} onChange={e => setDateField(e.target.value)}>{DATE_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={fl}>DA</span><input type="date" style={{ background: C.inputBg, color: C.text, border: "1px solid " + C.inputBorder, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", width: 145 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={fl}>A</span><input type="date" style={{ background: C.inputBg, color: C.text, border: "1px solid " + C.inputBorder, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", width: 145 }} value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={fl}>Cerca</span><input style={{ background: C.inputBg, color: C.text, border: "1px solid " + C.inputBorder, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", minWidth: 170 }} placeholder="Modello o IMEI..." value={searchText} onChange={e => setSearchText(e.target.value)} /></div>
          <button style={{ background: "transparent", color: C.purple, border: "1px solid " + C.purpleBorder, borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", alignSelf: "flex-end" }} onClick={resetFilters}>{"\u21BA"} Reset Filtri</button>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button style={{ background: C.green + "18", color: C.green, border: "1px solid " + C.green + "40", borderRadius: 10, padding: "10px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s" }}
            onClick={() => setShowRegistra(true)}
            onMouseEnter={e => e.currentTarget.style.background = C.green + "30"}
            onMouseLeave={e => e.currentTarget.style.background = C.green + "18"}>
            + Registra Usato
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
          {KPI_CARDS.map(c => {
            const val = c.key === "_all" ? kpiData._total : (kpiData[c.key] || 0);
            const isActive = c.key === "_all" ? (selectedStatuses.length === STATUS_KEYS.length - 2 && !selectedStatuses.includes("venduto") && !selectedStatuses.includes("ko")) : selectedStatuses.length === 1 && selectedStatuses[0] === c.key;
            return (
              <div key={c.key} style={{ background: isActive ? c.color + "18" : C.card, border: "1px solid " + (isActive ? c.color : C.border), borderRadius: 12, padding: "14px 16px", cursor: "pointer", transition: "all 0.25s", boxShadow: isActive ? "0 0 14px " + c.color + "20" : "none" }}
                onClick={() => handleKpiClick(c.key)}
                onMouseEnter={e => { e.currentTarget.style.background = c.color + "18"; e.currentTarget.style.borderColor = c.color; }}
                onMouseLeave={e => { e.currentTarget.style.background = isActive ? c.color + "18" : C.card; e.currentTarget.style.borderColor = isActive ? c.color : C.border; }}>
                <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color: c.color }}>{val}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 5, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>{c.icon} {c.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SCROLLABLE TABLE */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 32px 24px 32px" }}>
        <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
            <thead><tr>
              <th style={th} onClick={() => doSort("id")}>#</th>
              <th style={th} onClick={() => doSort("model")}>Modello{arrow("model")}</th>
              <th style={th} onClick={() => doSort("imei")}>IMEI{arrow("imei")}</th>
              <th style={th} onClick={() => doSort("status")}>Stato{arrow("status")}</th>
              <th style={{ ...th, textAlign: "right" }} onClick={() => doSort("purchase_price")}>Acquisto{arrow("purchase_price")}</th>
              <th style={{ ...th, textAlign: "right" }} onClick={() => doSort("sale_price")}>Vendita{arrow("sale_price")}</th>
              <th style={th} onClick={() => doSort("store")}>Negozio{arrow("store")}</th>
              <th style={th} onClick={() => doSort("created_at")}>Data Reg.{arrow("created_at")}</th>
            </tr></thead>
            <tbody>
              {sorted.length === 0 ? <tr><td colSpan={8} style={{ ...td, textAlign: "center", padding: 40, color: C.textMuted }}>Nessun dispositivo trovato</td></tr> :
                sorted.map((d, i) => (
                  <tr key={d.id} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)", cursor: "pointer" }}
                    onClick={() => setSelectedDevice(d)}
                    onMouseEnter={e => e.currentTarget.style.background = C.cardHover}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)"}>
                    <td style={{ ...td, color: C.textDim, fontSize: 11 }}>{d.id}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{d.model}</td>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: 12, color: C.textMuted }}>{d.imei}</td>
                    <td style={td}><StatusBadge statusKey={d.status} /></td>
                    <td style={{ ...td, textAlign: "right", color: C.textMuted }}>{fmtEur(d.purchase_price)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600, color: C.green }}>{fmtEur(d.sale_price)}</td>
                    <td style={td}>{d.store}</td>
                    <td style={{ ...td, color: C.textMuted, fontSize: 12 }}>{fmtDate(d.created_at)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div style={{ padding: "10px 20px", borderTop: "1px solid " + C.border, fontSize: 12, color: C.textMuted }}>{sorted.length} dispositivi</div>
        </div>
      </div>

      {selectedDevice && <DevicePanel device={selectedDevice} onClose={() => setSelectedDevice(null)} onSave={handleSaveDevice} />}
      {showRegistra && <RegistraUsatoPanel onClose={() => setShowRegistra(false)} onSave={data => { console.log("Registra:", data); setShowRegistra(false); }} />}
    </div>
  );
}
