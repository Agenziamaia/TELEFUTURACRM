import { useState, useEffect, useRef, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const BRANDS = [
  { id: "windtre", label: "WindTre", color: "#FF6B00", icon: "🌀" },
  { id: "vodafone", label: "Vodafone", color: "#E60000", icon: "📶" },
  { id: "sky", label: "Sky", color: "#0072C6", icon: "📡" },
  { id: "fastweb", label: "Fastweb", color: "#FFD200", icon: "⚡" },
  { id: "energia", label: "Energia", color: "#4CAF50", icon: "💡" },
];

// Sottocategorie per il TARGET AZIENDALE (poche, strategiche)
const BRAND_CATS_AZ = {
  windtre: [{ id: "w_fisso", label: "Fisso" }, { id: "w_lg", label: "Luce-Gas" }, { id: "w_ass", label: "Assicurazioni" }],
  vodafone: [{ id: "v_fisso", label: "Fisso" }, { id: "v_energy", label: "Energy" }],
  sky: [{ id: "s_3p", label: "3P" }, { id: "s_tv", label: "TV" }],
  fastweb: [{ id: "f_mob", label: "Mobile" }, { id: "f_energy", label: "Energy" }],
  energia: [{ id: "e_s4", label: "S4" }],
};

// Sottocategorie per il TARGET NEGOZIO (più granulari)
const BRAND_CATS_NEG = {
  windtre: [
    { id: "wn_mob_ga", label: "Mobile GA" }, { id: "wn_mob_cb", label: "Mobile CB" },
    { id: "wn_fisso", label: "Fisso" }, { id: "wn_lg", label: "Luce-Gas" },
    { id: "wn_ass", label: "Assicurazioni" }, { id: "wn_multi", label: "Multi-Servizi" },
  ],
  vodafone: [
    { id: "vn_mob_ga", label: "Mobile GA" }, { id: "vn_mob_cb", label: "Mobile CB" },
    { id: "vn_fisso", label: "Fisso" }, { id: "vn_energy", label: "Energy" },
    { id: "vn_multi", label: "Multi-Servizi" },
  ],
  sky: [
    { id: "sn_3p", label: "3P" }, { id: "sn_tv", label: "TV" },
    { id: "sn_sport", label: "Sport" }, { id: "sn_bundle", label: "Bundle" },
  ],
  fastweb: [
    { id: "fn_mob", label: "Mobile" }, { id: "fn_fisso", label: "Fisso" },
    { id: "fn_energy", label: "Energy" },
  ],
  energia: [
    { id: "en_s4", label: "S4" }, { id: "en_barton", label: "Barton" },
  ],
};

const STORES = [
  { id: "tiburtina", name: "Tiburtina", tipo: "multibrand", giorniLav: [1,2,3,4,5,6] },
  { id: "tuscolana", name: "Tuscolana", tipo: "multibrand", giorniLav: [1,2,3,4,5,6] },
  { id: "prati", name: "Prati", tipo: "franchising", giorniLav: [1,2,3,4,5] },
  { id: "eur", name: "EUR", tipo: "multibrand", giorniLav: [1,2,3,4,5,6] },
  { id: "ostia", name: "Ostia", tipo: "franchising", giorniLav: [1,2,3,4,5] },
  { id: "centocelle", name: "Centocelle", tipo: "multibrand", giorniLav: [1,2,3,4,5,6] },
  { id: "cinecitta", name: "Cinecittà", tipo: "franchising", giorniLav: [1,2,3,4,5,6] },
  { id: "primavalle", name: "Primavalle", tipo: "multibrand", giorniLav: [1,2,3,4,5] },
  { id: "trastevere", name: "Trastevere", tipo: "franchising", giorniLav: [1,2,3,4,5,6] },
];

const SELLERS = [
  { id: "s1", name: "Marco R.", store: "tiburtina", ruolo: "venditore" },
  { id: "s2", name: "Giulia T.", store: "tuscolana", ruolo: "venditore" },
  { id: "s3", name: "Alessandro P.", store: "tiburtina", ruolo: "store_manager" },
  { id: "s4", name: "Francesca M.", store: "prati", ruolo: "venditore" },
  { id: "s5", name: "Luca B.", store: "eur", ruolo: "venditore" },
  { id: "s6", name: "Sara D.", store: "ostia", ruolo: "venditore" },
  { id: "s7", name: "Davide C.", store: "centocelle", ruolo: "store_manager" },
  { id: "s8", name: "Elena V.", store: "cinecitta", ruolo: "venditore" },
  { id: "s9", name: "Roberto N.", store: "primavalle", ruolo: "venditore" },
  { id: "s10", name: "Chiara G.", store: "trastevere", ruolo: "venditore" },
  { id: "s11", name: "Paolo F.", store: "tuscolana", ruolo: "venditore" },
  { id: "s12", name: "Martina L.", store: "eur", ruolo: "store_manager" },
  { id: "s13", name: "Andrea Z.", store: "prati", ruolo: "venditore" },
  { id: "s14", name: "Simone K.", store: "ostia", ruolo: "store_manager" },
  { id: "s15", name: "Valentina B.", store: "centocelle", ruolo: "venditore" },
  { id: "s16", name: "Giorgio M.", store: "trastevere", ruolo: "venditore" },
  { id: "s17", name: "Federica A.", store: "tiburtina", ruolo: "venditore" },
  { id: "s18", name: "Tommaso R.", store: "primavalle", ruolo: "store_manager" },
  { id: "s19", name: "Ilaria C.", store: "cinecitta", ruolo: "venditore" },
  { id: "s20", name: "Matteo S.", store: "tuscolana", ruolo: "store_manager" },
  // Call Center
  { id: "cc1", name: "Laura P.", store: "call_center", ruolo: "caller" },
  { id: "cc2", name: "Stefano G.", store: "call_center", ruolo: "caller" },
  { id: "cc3", name: "Monica R.", store: "call_center", ruolo: "caller" },
  { id: "cc4", name: "Riccardo D.", store: "call_center", ruolo: "caller" },
  { id: "cc5", name: "Alessia F.", store: "call_center", ruolo: "cc_director" },
  // Outbound
  { id: "ob1", name: "Daniele M.", store: "outbound", ruolo: "agente_ob" },
  { id: "ob2", name: "Cristina L.", store: "outbound", ruolo: "agente_ob" },
  { id: "ob3", name: "Fabio T.", store: "outbound", ruolo: "agente_ob" },
  { id: "ob4", name: "Silvia N.", store: "outbound", ruolo: "ob_director" },
];

// Gruppi per classifica
const SELLER_GROUPS = {
  pv: SELLERS.filter(function(se) { return se.store !== "call_center" && se.store !== "outbound"; }),
  cc: SELLERS.filter(function(se) { return se.store === "call_center"; }),
  ob: SELLERS.filter(function(se) { return se.store === "outbound"; }),
};

// ═══════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════

function generateMockData() {
  let s = 77;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

  // Target aziendali per brand-categoria
  const targetAzCat = {};
  BRANDS.forEach(b => {
    targetAzCat[b.id] = {};
    const cats = BRAND_CATS_AZ[b.id] || [];
    cats.forEach(c => { targetAzCat[b.id][c.id] = Math.round(8 + rand() * 25); });
  });

  // Target negozio per brand-categoria (negozio usa BRAND_CATS_NEG)
  const targetNegCat = {};
  STORES.forEach(st => {
    targetNegCat[st.id] = {};
    BRANDS.forEach(b => {
      targetNegCat[st.id][b.id] = {};
      const cats = BRAND_CATS_NEG[b.id] || [];
      cats.forEach(c => { targetNegCat[st.id][b.id][c.id] = Math.round(1 + rand() * 6); });
    });
  });

  // Target personali per brand (complessivo, non per categoria)
  const targetPersonali = {};
  SELLERS.forEach(se => {
    targetPersonali[se.id] = { totale: 0 };
    BRANDS.forEach(b => {
      const val = Math.round(2 + rand() * 6);
      targetPersonali[se.id][b.id] = val;
      targetPersonali[se.id].totale += val;
    });
  });

  // Produzione per venditore per categoria aziendale
  const produzioneAzCat = {};
  SELLERS.forEach(se => {
    produzioneAzCat[se.id] = {};
    BRANDS.forEach(b => {
      produzioneAzCat[se.id][b.id] = {};
      const cats = BRAND_CATS_AZ[b.id] || [];
      cats.forEach(c => {
        const tAz = (targetAzCat[b.id] && targetAzCat[b.id][c.id]) || 5;
        const perSeller = tAz / SELLERS.length;
        produzioneAzCat[se.id][b.id][c.id] = Math.round(perSeller * (0.3 + rand() * 0.9));
      });
    });
  });

  // Produzione per venditore per categoria negozio
  const produzioneNegCat = {};
  SELLERS.forEach(se => {
    produzioneNegCat[se.id] = {};
    BRANDS.forEach(b => {
      produzioneNegCat[se.id][b.id] = {};
      const cats = BRAND_CATS_NEG[b.id] || [];
      cats.forEach(c => {
        const st = STORES.find(sst => sst.id === se.store);
        const tNeg = (targetNegCat[se.store] && targetNegCat[se.store][b.id] && targetNegCat[se.store][b.id][c.id]) || 3;
        const sellersInStore = SELLERS.filter(ss => ss.store === se.store).length;
        const perSeller = tNeg / sellersInStore;
        produzioneNegCat[se.id][b.id][c.id] = Math.round(perSeller * (0.3 + rand() * 0.9));
      });
    });
  });

  // Produzione brand-level per venditore (per target personali e classifica)
  const produzione = {};
  SELLERS.forEach(se => {
    produzione[se.id] = {};
    BRANDS.forEach(b => {
      const target = targetPersonali[se.id][b.id];
      produzione[se.id][b.id] = Math.round(target * (0.3 + rand() * 0.9));
    });
  });

  const fatturato = {};
  SELLERS.forEach(se => {
    let tot = 0;
    BRANDS.forEach(b => { tot += ((produzione[se.id] && produzione[se.id][b.id]) || 0) * (80 + Math.round(rand() * 120)); });
    fatturato[se.id] = tot;
  });

  const criticita = {};
  SELLERS.forEach(se => {
    criticita[se.id] = {
      daLavorare: Math.floor(rand() * 5), warning: Math.floor(rand() * 4),
      koBimestre: Math.floor(rand() * 5), nonPagateBimestre: Math.floor(rand() * 3),
    };
  });

  const appuntamenti = {};
  SELLERS.forEach(se => {
    const n = Math.floor(rand() * 4);
    const appts = [];
    const clienti = ["Mario Rossi", "Anna Verdi", "Luigi Bianchi", "Carla Neri", "Giuseppe Conti"];
    const tipi = ["MNP", "Nuovo", "Fisso", "Rinnovo", "Business"];
    for (let i = 0; i < n; i++) { appts.push({ ora: (9 + Math.floor(rand() * 8)) + ":" + (rand() > 0.5 ? "00" : "30"), cliente: clienti[Math.floor(rand() * clienti.length)], tipo: tipi[Math.floor(rand() * tipi.length)] }); }
    appts.sort((a, bb) => a.ora.localeCompare(bb.ora));
    appuntamenti[se.id] = appts;
  });

  return { targetAzCat, targetNegCat, targetPersonali, produzioneAzCat, produzioneNegCat, produzione, fatturato, criticita, appuntamenti };
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

const OGGI = 16;
function glMese(gl) { let c = 0; for (let d = 1; d <= 31; d++) { const dow = new Date(2026, 2, d).getDay(); if (dow !== 0 && gl.indexOf(dow) >= 0) c++; } return c; }
function glPass(gl, oggi) { let c = 0; for (let d = 1; d <= oggi; d++) { const dow = new Date(2026, 2, d).getDay(); if (dow !== 0 && gl.indexOf(dow) >= 0) c++; } return c; }
function glRim(gl, oggi) { return glMese(gl) - glPass(gl, oggi); }
function proj(fatti, gp, gt) { return gp === 0 ? fatti : Math.round((fatti / gp) * gt); }
function stCol(pct) { return pct >= 100 ? "#4CAF50" : pct >= 80 ? "#FFA726" : "#EF5350"; }
function stLbl(pct) { return pct >= 100 ? "In linea" : pct >= 80 ? "A rischio" : "Sotto tono"; }
function stEmoji(pct) { return pct >= 100 ? "✅" : pct >= 80 ? "⚠️" : "🔴"; }

function getAvgPct(sid, data, gp, gt) {
  let sum = 0;
  BRANDS.forEach(b => { const f = (data.produzione[sid] && data.produzione[sid][b.id]) || 0; const t = data.targetPersonali[sid][b.id] || 1; sum += Math.min(Math.round((proj(f, gp, gt) / t) * 100), 100); });
  return Math.round(sum / BRANDS.length);
}
function getFattProj(sid, data, gp, gt) { const f = data.fatturato[sid] || 0; return gp === 0 ? f : Math.round((f / gp) * gt); }

// Giorni lav per seller (CC e OB usano lun-ven)
const GL_DEFAULT = [1,2,3,4,5];
function getSellerGL(se) {
  const st = STORES.find(function(s) { return s.id === se.store; });
  return st ? st.giorniLav : GL_DEFAULT;
}
function getSellerGroup(se) {
  if (se.store === "call_center") return "cc";
  if (se.store === "outbound") return "ob";
  return "pv";
}
function getGroupLabel(g) {
  if (g === "cc") return "Call Center";
  if (g === "ob") return "Outbound";
  return "Punti Vendita";
}

// ═══════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════

function AnimNum({ target }) {
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; if (!el) return; let st = null; let raf; const run = (ts) => { if (!st) st = ts; const p = Math.min((ts - st) / 900, 1); el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(run); }; raf = requestAnimationFrame(run); return () => cancelAnimationFrame(raf); }, [target]);
  return React.createElement("span", { ref: ref }, "0");
}

// ─── DOPPIA BARRA PROGRESSO ────────────────────────────────────
// Barra superiore = proiezione (più lunga, semitrasparente)
// Barra inferiore = attuale (piena)
function DualBar({ actual, projected, max, color, height }) {
  const h = height || 10;
  const pctAct = max > 0 ? Math.min((actual / max) * 100, 100) : 0;
  const pctProj = max > 0 ? Math.min((projected / max) * 100, 100) : 0;
  return React.createElement("div", { style: { width: "100%", position: "relative" } },
    // Track
    React.createElement("div", { style: { width: "100%", height: h, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 99, overflow: "hidden", position: "relative" } },
      // Proiezione (background, più lunga)
      React.createElement("div", { style: { position: "absolute", top: 0, left: 0, height: "100%", width: pctProj + "%", backgroundColor: color, opacity: 0.25, borderRadius: 99, transition: "width 1s cubic-bezier(0.22,1,0.36,1)" } }),
      // Attuale (foreground, piena)
      React.createElement("div", { style: { position: "absolute", top: 0, left: 0, height: "100%", width: pctAct + "%", backgroundColor: color, borderRadius: 99, transition: "width 1s cubic-bezier(0.22,1,0.36,1)" } })
    ),
    // Legenda sotto
    React.createElement("div", { style: { display: "flex", gap: 10, marginTop: 3 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 3 } },
        React.createElement("div", { style: { width: 8, height: 4, borderRadius: 2, backgroundColor: color } }),
        React.createElement("span", { style: { fontSize: 8, color: "#666" } }, "attuale")
      ),
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 3 } },
        React.createElement("div", { style: { width: 8, height: 4, borderRadius: 2, backgroundColor: color, opacity: 0.3 } }),
        React.createElement("span", { style: { fontSize: 8, color: "#666" } }, "proiezione")
      )
    )
  );
}

function SectionTitle({ icon, text, extra }) {
  return React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
      React.createElement("span", { style: { fontSize: 16 } }, icon),
      React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: "#e0e0e0", textTransform: "uppercase", letterSpacing: "0.06em" } }, text)
    ), extra || null
  );
}

function Card({ children, delay, style }) {
  return React.createElement("div", { className: "card-hover", style: Object.assign({}, { backgroundColor: "#0c0c1a", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: "18px 22px", animation: "fadeUp 0.5s ease both", animationDelay: (delay || 0) + "s", transition: "border-color 0.2s, box-shadow 0.2s" }, style || {}) }, children);
}

function PratichePerse({ ko, nonPagate, label }) {
  const [exp, setExp] = useState(false);
  const tot = ko + nonPagate;
  return React.createElement("div", { onClick: () => setExp(function(p) { return !p; }), style: { padding: "10px 12px", borderRadius: 8, cursor: "pointer", backgroundColor: "rgba(239,83,80,0.06)", border: "1px solid rgba(239,83,80,0.12)" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12 } },
      React.createElement("span", { style: { fontSize: 22 } }, "🔴"),
      React.createElement("div", { style: { flex: 1 } },
        React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "#EF5350" } }, label || "Pratiche Perse — Ultimo Bimestre"),
        React.createElement("div", { style: { fontSize: 10, color: "#888", marginTop: 2 } }, "KO + non pagate · clicca per dettaglio")
      ),
      React.createElement("span", { style: { fontSize: 22, fontWeight: 800, color: "#EF5350", fontFamily: "'JetBrains Mono', monospace" } }, tot),
      React.createElement("span", { style: { fontSize: 10, color: "#555", marginLeft: 6 } }, exp ? "▲" : "▼")
    ),
    exp ? React.createElement("div", { style: { marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(239,83,80,0.1)", display: "flex", gap: 16 } },
      React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "8px", borderRadius: 6, backgroundColor: "rgba(239,83,80,0.06)" } },
        React.createElement("div", { style: { fontSize: 20, fontWeight: 800, color: "#EF5350", fontFamily: "'JetBrains Mono', monospace" } }, ko),
        React.createElement("div", { style: { fontSize: 10, color: "#EF5350" } }, "KO"), React.createElement("div", { style: { fontSize: 9, color: "#666", marginTop: 2 } }, "Mai attivate")
      ),
      React.createElement("div", { style: { flex: 1, textAlign: "center", padding: "8px", borderRadius: 6, backgroundColor: "rgba(255,152,0,0.06)" } },
        React.createElement("div", { style: { fontSize: 20, fontWeight: 800, color: "#FF9800", fontFamily: "'JetBrains Mono', monospace" } }, nonPagate),
        React.createElement("div", { style: { fontSize: 10, color: "#FF9800" } }, "Non Pagate"), React.createElement("div", { style: { fontSize: 9, color: "#666", marginTop: 2 } }, "Attivate ma perse")
      )
    ) : null
  );
}

// ─── BLOCCO A: Target Aziendale con sottocategorie ─────────────

function BloccoA({ data, storeId }) {
  const glA = [1,2,3,4,5,6];
  const gt = glMese(glA); const gp = glPass(glA, OGGI); const gr = glRim(glA, OGGI);

  const [collapsedAz, setCollapsedAz] = useState([]);

  return React.createElement("div", null,
    React.createElement(SectionTitle, { icon: "🎯", text: "Target Aziendale — Marzo 2026",
      extra: React.createElement("div", { style: { display: "flex", gap: 8 } },
        React.createElement("span", { style: { fontSize: 11, color: "#888", fontFamily: "'JetBrains Mono', monospace", background: "rgba(255,255,255,0.04)", padding: "4px 10px", borderRadius: 6 } }, gp + " giorni lavorati"),
        React.createElement("span", { style: { fontSize: 11, color: "#888", fontFamily: "'JetBrains Mono', monospace", background: "rgba(255,255,255,0.04)", padding: "4px 10px", borderRadius: 6 } }, gr + " rimasti")
      )
    }),
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 } },
      ...BRANDS.map((b, idx) => {
        const cats = BRAND_CATS_AZ[b.id] || [];
        const isExp = collapsedAz.indexOf(b.id) < 0;

        // Somma fatti e target per tutte le categorie di questo brand
        let totFatti = 0, totTarget = 0;
        const catData = cats.map(c => {
          const target = (data.targetAzCat[b.id] && data.targetAzCat[b.id][c.id]) || 0;
          let fatti = 0;
          SELLERS.forEach(se => { fatti += (data.produzioneAzCat[se.id] && data.produzioneAzCat[se.id][b.id] && data.produzioneAzCat[se.id][b.id][c.id]) || 0; });
          totFatti += fatti; totTarget += target;
          const p = proj(fatti, gp, gt);
          const pct = target > 0 ? Math.round((p / target) * 100) : 0;
          return { cat: c, fatti: fatti, target: target, proiezione: p, pct: pct };
        });

        const proiezione = proj(totFatti, gp, gt);
        const avgCatPct = catData.length > 0 ? Math.round(catData.reduce(function(s, cd) { return s + Math.min(cd.pct, 100); }, 0) / catData.length) : 0;
        const col = stCol(avgCatPct);
        const ritmo = gr > 0 ? ((totTarget - totFatti) / gr).toFixed(1) : "0";
        // Quante categorie in target
        const catInTarget = catData.filter(function(cd) { return cd.pct >= 100; }).length;

        // Contributo negozio
        let contribNeg = null;
        if (storeId) {
          let negFatti = 0;
          SELLERS.filter(se => se.store === storeId).forEach(se => {
            cats.forEach(c => { negFatti += (data.produzioneAzCat[se.id] && data.produzioneAzCat[se.id][b.id] && data.produzioneAzCat[se.id][b.id][c.id]) || 0; });
          });
          contribNeg = negFatti;
        }

        return React.createElement(Card, { key: b.id, delay: 0.05 * idx },
          React.createElement("div", {
            onClick: () => setCollapsedAz(function(prev) { return isExp ? prev.concat([b.id]) : prev.filter(function(x) { return x !== b.id; }); }),
            style: { cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }
          },
            React.createElement("div", { style: { width: 30, height: 30, borderRadius: 8, backgroundColor: b.color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 } }, b.icon),
            React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: b.color, flex: 1 } }, b.label),
            React.createElement("span", { style: { fontSize: 10, color: "#555" } }, cats.length + " cat. " + (isExp ? "▲" : "▼"))
          ),
          // Indicatore percentuale medio delle categorie
          React.createElement("div", { style: { textAlign: "center", marginBottom: 8 } },
            React.createElement("div", { style: { fontSize: 36, fontWeight: 800, color: col, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 } }, React.createElement(AnimNum, { target: avgCatPct }), "%"),
            React.createElement("div", { style: { fontSize: 9, color: "#666", marginTop: 4 } }, "media " + cats.length + " categorie · " + catInTarget + "/" + cats.length + " in target")
          ),
          React.createElement(DualBar, { actual: totFatti, projected: proiezione, max: totTarget, color: col, height: 8 }),
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 4 } },
            React.createElement("span", { style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#ccc" } }, totFatti + " fatti"),
            React.createElement("span", { style: { fontSize: 10, color: "#555" } }, "→"),
            React.createElement("span", { style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: col, fontWeight: 600 } }, proiezione + " proj. / " + totTarget)
          ),
          React.createElement("div", { style: { fontSize: 10, color: "#555", marginTop: 2 } }, "Ritmo: " + ritmo + "/gg"),
          contribNeg !== null ? React.createElement("div", { style: { fontSize: 10, color: b.color, marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.05)" } }, "Il tuo negozio: " + contribNeg) : null,
          // Sottocategorie espandibili
          isExp ? React.createElement("div", { style: { marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 6 } },
            ...catData.map(cd => React.createElement("div", { key: cd.cat.id },
              React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 } },
                React.createElement("span", { style: { fontSize: 10, color: "#aaa", fontWeight: 600 } }, cd.cat.label),
                React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
                  React.createElement("span", { style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#ccc" } }, cd.fatti + " fatti"),
                  React.createElement("span", { style: { fontSize: 10, color: "#555" } }, "→"),
                  React.createElement("span", { style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: stCol(cd.pct), fontWeight: 700 } }, cd.proiezione + "/" + cd.target)
                )
              ),
              React.createElement(DualBar, { actual: cd.fatti, projected: cd.proiezione, max: cd.target, color: stCol(cd.pct), height: 6 })
            ))
          ) : null
        );
      })
    )
  );
}

// ─── BLOCCO B: Target Negozio con sottocategorie ───────────────

function BloccoB({ data, storeId }) {
  const store = STORES.find(s => s.id === storeId);
  if (!store) return null;
  const gt = glMese(store.giorniLav); const gp = glPass(store.giorniLav, OGGI);
  const sellersNeg = SELLERS.filter(se => se.store === storeId);
  const [collapsedNeg, setCollapsedNeg] = useState([]);
  const [teamExp, setTeamExp] = useState(null);

  // Criticità negozio
  let totDaLav = 0, totWarn = 0, totKo = 0, totNP = 0;
  sellersNeg.forEach(se => { const c = data.criticita[se.id]; if (c) { totDaLav += c.daLavorare; totWarn += c.warning; totKo += c.koBimestre; totNP += c.nonPagateBimestre; } });

  // Team data
  const teamData = sellersNeg.map(se => {
    let fattiTot = 0;
    BRANDS.forEach(b => { fattiTot += (data.produzione[se.id] && data.produzione[se.id][b.id]) || 0; });
    const targetTot = data.targetPersonali[se.id].totale;
    const p = proj(fattiTot, gp, gt); const pct = targetTot > 0 ? Math.round((p / targetTot) * 100) : 0;
    return { seller: se, fatti: fattiTot, target: targetTot, proj: p, pct: pct };
  }).sort((a, b) => a.pct - b.pct);

  return React.createElement("div", null,
    React.createElement(SectionTitle, { icon: "🏪", text: "Negozio " + store.name,
      extra: React.createElement("span", { style: { fontSize: 10, color: "#666", background: "rgba(255,255,255,0.04)", padding: "3px 8px", borderRadius: 4 } }, store.tipo.toUpperCase() + " · " + (store.giorniLav.length === 6 ? "Lun-Sab" : "Lun-Ven"))
    }),
    // B1: Brand targets con sottocategorie
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 } },
      ...BRANDS.map((b, idx) => {
        const cats = BRAND_CATS_NEG[b.id] || [];
        const isExp = collapsedNeg.indexOf(b.id) < 0;
        const catData = cats.map(c => {
          const target = (data.targetNegCat[storeId] && data.targetNegCat[storeId][b.id] && data.targetNegCat[storeId][b.id][c.id]) || 0;
          let fatti = 0;
          sellersNeg.forEach(se => { fatti += (data.produzioneNegCat[se.id] && data.produzioneNegCat[se.id][b.id] && data.produzioneNegCat[se.id][b.id][c.id]) || 0; });
          const p = proj(fatti, gp, gt);
          const pct = target > 0 ? Math.round((p / target) * 100) : 0;
          return { cat: c, fatti: fatti, target: target, proiezione: p, pct: pct };
        });
        // Media % per brand
        const avgPct = catData.length > 0 ? Math.round(catData.reduce((sum, cd) => sum + Math.min(cd.pct, 100), 0) / catData.length) : 0;
        const col = stCol(avgPct);

        return React.createElement(Card, { key: b.id, delay: 0.3 + idx * 0.04, style: { padding: "12px 14px", borderLeft: "3px solid " + col } },
          React.createElement("div", {
            onClick: () => setCollapsedNeg(function(prev) { return isExp ? prev.concat([b.id]) : prev.filter(function(x) { return x !== b.id; }); }),
            style: { cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }
          },
            React.createElement("span", { style: { fontSize: 13 } }, b.icon),
            React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: b.color, flex: 1 } }, b.label),
            React.createElement("span", { style: { fontSize: 10, color: "#555" } }, isExp ? "▲" : "▼")
          ),
          // Media complessiva
          React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 } },
            React.createElement("span", { style: { fontSize: 20, fontWeight: 800, color: col, fontFamily: "'JetBrains Mono', monospace" } }, avgPct + "%"),
            React.createElement("span", { style: { fontSize: 10, color: "#888" } }, "media " + cats.length + " categorie")
          ),
          React.createElement("div", { style: { fontSize: 10, color: col, fontWeight: 600 } }, stLbl(avgPct)),
          // Sottocategorie
          isExp ? React.createElement("div", { style: { marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 6 } },
            ...catData.map(cd => React.createElement("div", { key: cd.cat.id },
              React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 } },
                React.createElement("span", { style: { fontSize: 10, color: "#aaa" } }, cd.cat.label),
                React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center" } },
                  React.createElement("span", { style: { fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: "#ccc" } }, cd.fatti),
                  React.createElement("span", { style: { fontSize: 8, color: "#555" } }, "→"),
                  React.createElement("span", { style: { fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: stCol(cd.pct), fontWeight: 700 } }, cd.proiezione + "/" + cd.target)
                )
              ),
              React.createElement(DualBar, { actual: cd.fatti, projected: cd.proiezione, max: cd.target, color: stCol(cd.pct), height: 5 })
            ))
          ) : null
        );
      })
    ),
    // B2 + B3
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },
      React.createElement(Card, { delay: 0.5 },
        React.createElement("div", { style: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 } }, "Team · Proiezione Target"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
          ...teamData.map(td => {
            const col = stCol(td.pct); const isE = teamExp === td.seller.id;
            return React.createElement("div", { key: td.seller.id },
              React.createElement("div", { onClick: () => setTeamExp(isE ? null : td.seller.id), style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer", backgroundColor: td.pct < 80 ? "rgba(239,83,80,0.06)" : "transparent" } },
                React.createElement("div", { style: { width: 8, height: 8, borderRadius: "50%", backgroundColor: col, flexShrink: 0 } }),
                React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: "#ccc", flex: 1 } }, td.seller.name),
                React.createElement("span", { style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#aaa" } }, td.fatti),
                React.createElement("span", { style: { fontSize: 8, color: "#555" } }, "→"),
                React.createElement("span", { style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: col, fontWeight: 600 } }, td.proj + "/" + td.target),
                React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: col, width: 36, textAlign: "right" } }, td.pct + "%"),
                React.createElement("span", { style: { fontSize: 10, color: "#555", marginLeft: 4 } }, isE ? "▲" : "▼")
              ),
              isE ? React.createElement("div", { style: { padding: "8px 8px 6px 24px" } },
                // Calcola conteggio target raggiunti
                React.createElement("div", {
                  style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "4px 8px", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.03)" }
                },
                  React.createElement("span", { style: { fontSize: 11, color: "#888" } }, "Target raggiunti:"),
                  React.createElement("span", {
                    style: { fontSize: 13, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: "#fff" }
                  }, BRANDS.filter(function(b) { const f = (data.produzione[td.seller.id] && data.produzione[td.seller.id][b.id]) || 0; const t = (data.targetPersonali[td.seller.id] && data.targetPersonali[td.seller.id][b.id]) || 1; return Math.round((proj(f, gp, gt) / t) * 100) >= 100; }).length + "/" + BRANDS.length)
                ),
                // Dettaglio per brand
                React.createElement("div", null,
                  ...BRANDS.map(b => {
                    const f = (data.produzione[td.seller.id] && data.produzione[td.seller.id][b.id]) || 0;
                    const t = (data.targetPersonali[td.seller.id] && data.targetPersonali[td.seller.id][b.id]) || 0;
                    const p = proj(f, gp, gt); const pc = t > 0 ? Math.round((p / t) * 100) : 100;
                    const reached = pc >= 100;
                    return React.createElement("div", {
                      key: b.id,
                      style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }
                    },
                      React.createElement("span", { style: { fontSize: 14, width: 22, textAlign: "center" } }, b.icon),
                      React.createElement("span", { style: { fontSize: 10, color: b.color, fontWeight: 600, width: 60 } }, b.label),
                      React.createElement("span", { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#ccc", width: 30, textAlign: "center" } }, f),
                      React.createElement("span", { style: { fontSize: 8, color: "#555" } }, "→"),
                      React.createElement("span", { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: stCol(pc), fontWeight: 700, width: 40, textAlign: "center" } }, p + "/" + t),
                      React.createElement("span", { style: { fontSize: 12, width: 18, textAlign: "center" } }, reached ? "✅" : pc >= 80 ? "⚠️" : "🔴")
                    );
                  })
                )
              ) : null
            );
          })
        )
      ),
      React.createElement(Card, { delay: 0.55 },
        React.createElement("div", { style: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 } }, "Monitoraggio Pratiche Negozio"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, cursor: "pointer", backgroundColor: "rgba(255,167,38,0.06)", border: "1px solid rgba(255,167,38,0.12)" } },
            React.createElement("span", { style: { fontSize: 22 } }, "📋"),
            React.createElement("div", { style: { flex: 1 } },
              React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "#FFA726" } }, "Da Lavorare + Warning"),
              React.createElement("div", { style: { fontSize: 10, color: "#888", marginTop: 2 } }, totDaLav + " da lavorare · " + totWarn + " in warning")
            ),
            React.createElement("span", { style: { fontSize: 22, fontWeight: 800, color: "#FFA726", fontFamily: "'JetBrains Mono', monospace" } }, totDaLav + totWarn)
          ),
          React.createElement(PratichePerse, { ko: totKo, nonPagate: totNP, label: "Pratiche Perse — Ultimo Bimestre" })
        )
      )
    )
  );
}

// ─── BLOCCO C: I miei dati ──────────────────────────────────────

function BloccoC({ data, sellerId, outbound, hideMonitoraggio, hideAppuntamenti, showAllClassifiche }) {
  const seller = SELLERS.find(se => se.id === sellerId);
  if (!seller) return null;
  const store = STORES.find(st => st.id === seller.store);
  const sellerGL = getSellerGL(seller);
  const gt = glMese(sellerGL); const gp = glPass(sellerGL, OGGI);
  const tp = data.targetPersonali[sellerId];

  const brandStatus = BRANDS.map(b => {
    const f = (data.produzione[sellerId] && data.produzione[sellerId][b.id]) || 0;
    const t = tp[b.id] || 0; const p = proj(f, gp, gt); const pct = t > 0 ? Math.round((p / t) * 100) : 100;
    return { brand: b, fatti: f, target: t, proiezione: p, pct: pct };
  });
  const inLinea = brandStatus.filter(bs => bs.pct >= 100).length;
  const aRischio = brandStatus.filter(bs => bs.pct >= 80 && bs.pct < 100).length;
  const sottoTono = brandStatus.filter(bs => bs.pct < 80).length;

  // Confronto motivazionale — stessa tipologia per PV, stesso gruppo per CC/OB
  const myGroup = getSellerGroup(seller);
  const storeObj = STORES.find(st => st.id === seller.store);
  const peerSellers = myGroup === "pv"
    ? SELLERS.filter(function(se) { const so = STORES.find(function(st) { return st.id === se.store; }); return so && storeObj && so.tipo === storeObj.tipo; })
    : SELLER_GROUPS[myGroup];
  const brandSotto = brandStatus.filter(bs => bs.pct < 100);
  const [showConf, setShowConf] = useState(false);
  const confronti = brandSotto.map(bs => {
    const ranking = peerSellers.map(se => {
      const seGL = getSellerGL(se);
      const seGt = glMese(seGL); const seGp = glPass(seGL, OGGI);
      const f = (data.produzione[se.id] && data.produzione[se.id][bs.brand.id]) || 0;
      const t = (data.targetPersonali[se.id] && data.targetPersonali[se.id][bs.brand.id]) || 1;
      const p = proj(f, seGp, seGt); const pct = Math.round((p / t) * 100);
      return { seller: se, proj: p, pct: pct };
    }).sort((a, bb) => bb.pct - a.pct);
    const meglio = ranking.find(r => r.seller.id !== sellerId && r.pct > bs.pct);
    return { brand: bs.brand, myPct: bs.pct, meglio: meglio };
  });

  // Classifica con 3 tab (PV / CC / OB) + toggle fatturato/target
  const [classMode, setClassMode] = useState("fatturato");
  const [classGroup, setClassGroup] = useState(myGroup);
  const classGroupSellers = SELLER_GROUPS[classGroup] || [];
  const classData = classGroupSellers.map(se => {
    const seGL = getSellerGL(se);
    const seGt = glMese(seGL); const seGp = glPass(seGL, OGGI);
    return { seller: se, store: STORES.find(function(st) { return st.id === se.store; }), fattProj: getFattProj(se.id, data, seGp, seGt), avgPct: getAvgPct(se.id, data, seGp, seGt) };
  });
  const classSorted = classMode === "fatturato" ? classData.slice().sort((a, b) => b.fattProj - a.fattProj) : classData.slice().sort((a, b) => b.avgPct - a.avgPct);
  const myRank = classSorted.findIndex(r => r.seller.id === sellerId) + 1;

  const myCrit = data.criticita[sellerId] || { daLavorare: 0, warning: 0, koBimestre: 0, nonPagateBimestre: 0 };
  const negAppts = outbound ? (data.appuntamenti[sellerId] || [])
    : SELLERS.filter(se => se.store === seller.store).reduce((acc, se) => acc.concat((data.appuntamenti[se.id] || []).map(a => Object.assign({}, a, { venditore: se.name }))), []).sort((a, b) => a.ora.localeCompare(b.ora)).slice(0, 5);

  return React.createElement("div", null,
    React.createElement(SectionTitle, { icon: "👤", text: "I Miei Dati — " + seller.name }),
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 } },
      // C1
      React.createElement(Card, { delay: 0.6 },
        React.createElement("div", { style: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 } }, "I Miei Target — Proiezione"),
        React.createElement("div", { style: { display: "flex", gap: 12, marginBottom: 14 } },
          ...[{ n: inLinea, l: "In linea", c: "#4CAF50" }, { n: aRischio, l: "A rischio", c: "#FFA726" }, { n: sottoTono, l: "Sotto tono", c: "#EF5350" }].map(i =>
            React.createElement("div", { key: i.l, style: { flex: 1, textAlign: "center", padding: "10px 8px", borderRadius: 8, backgroundColor: i.c + "12", border: "1px solid " + i.c + "25" } },
              React.createElement("div", { style: { fontSize: 24, fontWeight: 800, color: i.c, fontFamily: "'JetBrains Mono', monospace" } }, i.n),
              React.createElement("div", { style: { fontSize: 10, color: i.c, marginTop: 2 } }, i.l)
            )
          )
        ),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
          ...brandStatus.map(bs => {
            const col = stCol(bs.pct);
            return React.createElement("div", { key: bs.brand.id },
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 2 } },
                React.createElement("span", { style: { fontSize: 12, width: 20, textAlign: "center" } }, bs.brand.icon),
                React.createElement("span", { style: { fontSize: 11, color: "#aaa", width: 60 } }, bs.brand.label),
                React.createElement("span", { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#fff", width: 50, textAlign: "center" } }, bs.fatti + " fatti"),
                React.createElement("span", { style: { fontSize: 9, color: "#555" } }, "→"),
                React.createElement("span", { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: col, fontWeight: 700, width: 55, textAlign: "center" } }, bs.proiezione + "/" + bs.target)
              ),
              React.createElement(DualBar, { actual: bs.fatti, projected: bs.proiezione, max: bs.target, color: col, height: 7 })
            );
          })
        ),
        confronti.length > 0 ? React.createElement("div", null,
          React.createElement("button", { onClick: () => setShowConf(function(p) { return !p; }),
            style: { width: "100%", marginTop: 12, padding: "8px", borderRadius: 6, cursor: "pointer", background: showConf ? "rgba(255,167,38,0.1)" : "rgba(255,255,255,0.03)", border: "1px solid " + (showConf ? "rgba(255,167,38,0.2)" : "rgba(255,255,255,0.06)"), color: showConf ? "#FFA726" : "#888", fontSize: 11, fontWeight: 600 }
          }, showConf ? "▲ Chiudi confronto" : "👀 Guarda chi sta facendo meglio di te"),
          showConf ? React.createElement("div", { style: { marginTop: 10, display: "flex", flexDirection: "column", gap: 6 } },
            ...confronti.map(c => React.createElement("div", { key: c.brand.id, style: { padding: "8px 10px", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" } },
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 4 } },
                React.createElement("span", { style: { fontSize: 12 } }, c.brand.icon),
                React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: c.brand.color } }, c.brand.label),
                React.createElement("span", { style: { fontSize: 9, color: stCol(c.myPct), marginLeft: "auto", fontWeight: 600 } }, stEmoji(c.myPct) + " Tu: " + c.myPct + "%")
              ),
              c.meglio
                ? React.createElement("div", { style: { fontSize: 11, color: "#4CAF50" } }, "📈 ", React.createElement("strong", null, c.meglio.seller.name), " (" + ((STORES.find(st => st.id === c.meglio.seller.store) || {}).name || getGroupLabel(getSellerGroup(c.meglio.seller))) + ") proietta " + c.meglio.pct + "%")
                : React.createElement("div", { style: { fontSize: 11, color: "#888" } }, "Nessuno proietta meglio")
            ))
          ) : null
        ) : null
      ),
      // C2: Classifica con 3 gruppi
      React.createElement(Card, { delay: 0.65 },
        // Group tabs — solo se showAllClassifiche (admin)
        showAllClassifiche ? React.createElement("div", { style: { display: "flex", gap: 4, marginBottom: 10 } },
          ...["pv", "cc", "ob"].map(g => React.createElement("button", { key: g, onClick: () => setClassGroup(g),
            style: { flex: 1, padding: "5px 6px", borderRadius: 6, fontSize: 10, cursor: "pointer", border: classGroup === g ? "1px solid rgba(66,165,245,0.4)" : "1px solid rgba(255,255,255,0.06)", background: classGroup === g ? "rgba(66,165,245,0.08)" : "transparent", color: classGroup === g ? "#42A5F5" : "#666", fontWeight: 600, textAlign: "center" }
          }, g === "pv" ? "🏪 PV" : g === "cc" ? "📞 CC" : "🚗 OB"))
        ) : null,
        React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 } },
          React.createElement("div", { style: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" } }, getGroupLabel(classGroup)),
          React.createElement("div", { style: { display: "flex", gap: 4 } },
            ...["fatturato", "target"].map(m => React.createElement("button", { key: m, onClick: () => setClassMode(m),
              style: { padding: "3px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer", border: classMode === m ? "1px solid rgba(66,165,245,0.4)" : "1px solid rgba(255,255,255,0.08)", background: classMode === m ? "rgba(66,165,245,0.1)" : "transparent", color: classMode === m ? "#42A5F5" : "#666", fontWeight: 600 }
            }, m === "fatturato" ? "💰 Fatturato" : "🎯 % Target"))
          )
        ),
        React.createElement("div", { style: { textAlign: "center", padding: "10px", marginBottom: 12, borderRadius: 8, backgroundColor: myRank <= 3 ? "rgba(76,175,80,0.06)" : "rgba(255,255,255,0.02)", border: "1px solid " + (myRank <= 3 ? "rgba(76,175,80,0.12)" : "rgba(255,255,255,0.04)") } },
          React.createElement("span", { style: { fontSize: 11, color: "#888" } }, "La tua posizione: "),
          React.createElement("span", { style: { fontSize: 18, fontWeight: 800, color: myRank <= 3 ? "#4CAF50" : "#FFA726", fontFamily: "'JetBrains Mono', monospace" } }, myRank + "°"),
          React.createElement("span", { style: { fontSize: 11, color: "#666" } }, " su " + classSorted.length)
        ),
        React.createElement("div", { style: { maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 } },
          ...classSorted.map((r, ri) => {
            const medals = ["🥇", "🥈", "🥉"]; const isMe = r.seller.id === sellerId;
            return React.createElement("div", { key: r.seller.id, style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, backgroundColor: isMe ? "rgba(66,165,245,0.08)" : "transparent", border: isMe ? "1px solid rgba(66,165,245,0.15)" : "1px solid transparent" } },
              React.createElement("span", { style: { fontSize: 14, width: 22, textAlign: "center" } }, ri < 3 ? medals[ri] : (ri + 1) + "."),
              React.createElement("span", { style: { fontSize: 11, fontWeight: isMe ? 700 : 500, color: isMe ? "#42A5F5" : "#ccc", flex: 1 } }, r.seller.name),
              React.createElement("span", { style: { fontSize: 9, color: "#666" } }, r.store ? r.store.name : getGroupLabel(getSellerGroup(r.seller))),
              React.createElement("span", { style: { fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: isMe ? "#42A5F5" : "#aaa", width: 60, textAlign: "right" } }, classMode === "fatturato" ? "€" + Math.round(r.fattProj / 1000) + "k" : r.avgPct + "%")
            );
          })
        )
      )
    ),
    // C3 + C4 (condizionali)
    (!hideMonitoraggio || !hideAppuntamenti) ? React.createElement("div", { style: { display: "grid", gridTemplateColumns: hideMonitoraggio || hideAppuntamenti ? "1fr" : "1fr 1fr", gap: 12 } },
      !hideMonitoraggio ? React.createElement(Card, { delay: 0.7 },
        React.createElement("div", { style: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 } }, "Monitoraggio Pratiche"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
          React.createElement("div", { style: { padding: "10px", borderRadius: 8, textAlign: "center", cursor: "pointer", backgroundColor: "rgba(255,167,38,0.06)", border: "1px solid rgba(255,167,38,0.12)" } },
            React.createElement("div", { style: { fontSize: 26, fontWeight: 800, color: "#FFA726", fontFamily: "'JetBrains Mono', monospace" } }, myCrit.warning + myCrit.daLavorare),
            React.createElement("div", { style: { fontSize: 10, color: "#FFA726", marginTop: 2 } }, "Da Lavorare + Warning"),
            React.createElement("div", { style: { fontSize: 9, color: "#666", marginTop: 4 } }, "Vai al Tracking PDA →")
          ),
          React.createElement(PratichePerse, { ko: myCrit.koBimestre, nonPagate: myCrit.nonPagateBimestre, label: "Le Mie Pratiche Perse — Ultimo Bimestre" })
        )
      ) : null,
      !hideAppuntamenti ? React.createElement(Card, { delay: 0.75 },
        React.createElement("div", { style: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 } }, outbound ? "I Miei Appuntamenti Oggi" : "Appuntamenti Negozio Oggi"),
        negAppts.length === 0 ? React.createElement("div", { style: { textAlign: "center", padding: "20px 0", color: "#555", fontSize: 12 } }, "Nessun appuntamento oggi")
          : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
              ...negAppts.map((a, ai) => React.createElement("div", { key: ai, style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.02)" } },
                React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "#42A5F5", fontFamily: "'JetBrains Mono', monospace", width: 40 } }, a.ora),
                React.createElement("span", { style: { fontSize: 11, color: "#ccc", flex: 1 } }, a.cliente),
                a.venditore ? React.createElement("span", { style: { fontSize: 10, color: "#888" } }, a.venditore) : null,
                React.createElement("span", { style: { fontSize: 9, padding: "2px 6px", borderRadius: 4, backgroundColor: "rgba(66,165,245,0.1)", color: "#42A5F5", fontWeight: 600 } }, a.tipo)
              ))
            ),
        React.createElement("div", { style: { fontSize: 10, color: "#42A5F5", marginTop: 8, cursor: "pointer", textAlign: "right" } }, "Vedi calendario →")
      ) : null
    ) : null
  );
}

// ─── BLOCCO D+E: Admin ──────────────────────────────────────────

function BloccoDE({ data }) {
  const piste = BRANDS.map(b => {
    const negData = STORES.map(st => {
      const gt = glMese(st.giorniLav); const gp = glPass(st.giorniLav, OGGI);
      const cats = BRAND_CATS_NEG[b.id] || [];
      let totF = 0, totT = 0;
      cats.forEach(c => {
        const t = (data.targetNegCat[st.id] && data.targetNegCat[st.id][b.id] && data.targetNegCat[st.id][b.id][c.id]) || 0;
        let f = 0;
        SELLERS.filter(se => se.store === st.id).forEach(se => { f += (data.produzioneNegCat[se.id] && data.produzioneNegCat[se.id][b.id] && data.produzioneNegCat[se.id][b.id][c.id]) || 0; });
        totF += f; totT += t;
      });
      const p = proj(totF, gp, gt);
      const pct = totT > 0 ? Math.round((p / totT) * 100) : 100;
      return { store: st, proj: p, target: totT, pct: pct };
    }).sort((a, bb) => a.pct - bb.pct);
    return { brand: b, sottoTono: negData.filter(n => n.pct < 80) };
  });

  const critMap = STORES.map(st => {
    let daLav = 0, warn = 0, perse = 0;
    SELLERS.filter(se => se.store === st.id).forEach(se => { const c = data.criticita[se.id]; if (c) { daLav += c.daLavorare; warn += c.warning; perse += c.koBimestre + c.nonPagateBimestre; } });
    return { store: st, daLav: daLav, warn: warn, perse: perse, tot: daLav + warn + perse };
  }).sort((a, b) => b.tot - a.tot);

  return React.createElement("div", null,
    React.createElement(SectionTitle, { icon: "🚨", text: "Piste — Negozi Sotto Tono (Proiezione)" }),
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 } },
      ...piste.map((p, pi) => React.createElement(Card, { key: p.brand.id, delay: 0.8 + pi * 0.04, style: { padding: "12px 14px" } },
        React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: p.brand.color, marginBottom: 8 } }, p.brand.icon + " " + p.brand.label),
        p.sottoTono.length === 0 ? React.createElement("div", { style: { fontSize: 11, color: "#4CAF50", fontWeight: 600 } }, "✅ Tutti in linea")
          : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
              ...p.sottoTono.slice(0, 3).map(n => React.createElement("div", { key: n.store.id, style: { display: "flex", alignItems: "center", gap: 6 } },
                React.createElement("span", { style: { fontSize: 11, color: "#EF5350", flex: 1 } }, n.store.name),
                React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: "#EF5350", fontFamily: "'JetBrains Mono', monospace" } }, n.pct + "%")
              ))
            )
      ))
    ),
    React.createElement(SectionTitle, { icon: "🗺️", text: "Mappa Criticità — Ultimo Bimestre" }),
    React.createElement(Card, { delay: 1.0 },
      React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12 } },
        React.createElement("thead", null, React.createElement("tr", null,
          ...["Negozio", "Da Lavorare", "Warning", "Pratiche Perse", "Totale"].map(h =>
            React.createElement("th", { key: h, style: { textAlign: "left", padding: "8px 10px", color: "#666", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 10, fontWeight: 600, textTransform: "uppercase" } }, h)
          )
        )),
        React.createElement("tbody", null,
          ...critMap.map(cm => React.createElement("tr", { key: cm.store.id, style: { borderBottom: "1px solid rgba(255,255,255,0.03)" } },
            React.createElement("td", { style: { padding: "8px 10px", fontWeight: 600, color: "#ccc" } }, cm.store.name),
            React.createElement("td", { style: { padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", color: cm.daLav > 0 ? "#FFA726" : "#444" } }, cm.daLav),
            React.createElement("td", { style: { padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", color: cm.warn > 0 ? "#FF7043" : "#444" } }, cm.warn),
            React.createElement("td", { style: { padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", color: cm.perse > 0 ? "#EF5350" : "#444" } }, cm.perse),
            React.createElement("td", { style: { padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: cm.tot > 5 ? "#EF5350" : cm.tot > 0 ? "#FFA726" : "#4CAF50" } }, cm.tot)
          ))
        )
      )
    )
  );
}

// ─── BLOCCO C ADMIN: Visione globale ────────────────────────────

function BloccoCAdmin({ data }) {
  const [apptView, setApptView] = useState("negozi"); // "negozi" | "agenti"
  const [pratView, setPratView] = useState("lavorare"); // "lavorare" | "perse"

  // Appuntamenti per negozio
  const apptPerNegozio = STORES.map(st => {
    let count = 0;
    SELLERS.filter(se => se.store === st.id).forEach(se => { count += (data.appuntamenti[se.id] || []).length; });
    return { store: st, count: count };
  }).sort((a, b) => b.count - a.count);
  const maxApptNeg = Math.max(1, Math.max.apply(null, apptPerNegozio.map(function(a) { return a.count; })));
  const totAppt = apptPerNegozio.reduce(function(s, a) { return s + a.count; }, 0);

  // Appuntamenti per agente (outbound = tutti per ora come demo)
  const apptPerAgente = SELLERS.filter(function(se) { return (data.appuntamenti[se.id] || []).length > 0; }).map(se => {
    return { seller: se, store: STORES.find(function(st) { return st.id === se.store; }), count: (data.appuntamenti[se.id] || []).length };
  }).sort((a, b) => b.count - a.count);
  const maxApptAg = Math.max(1, Math.max.apply(null, apptPerAgente.length > 0 ? apptPerAgente.map(function(a) { return a.count; }) : [1]));

  // Pratiche per negozio — visione globale
  const pratichePerNeg = STORES.map(st => {
    let daLav = 0, warn = 0, perse = 0;
    SELLERS.filter(se => se.store === st.id).forEach(se => {
      const c = data.criticita[se.id];
      if (c) { daLav += c.daLavorare; warn += c.warning; perse += c.koBimestre + c.nonPagateBimestre; }
    });
    return { store: st, daLav: daLav, warn: warn, perse: perse, tot: daLav + warn + perse };
  }).sort((a, b) => b.tot - a.tot);
  const maxPrat = Math.max(1, Math.max.apply(null, pratichePerNeg.map(function(p) { return p.tot; })));

  return React.createElement("div", null,
    React.createElement(SectionTitle, { icon: "📊", text: "Panoramica Operativa" }),
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } },

      // Appuntamenti globali
      React.createElement(Card, { delay: 0.7 },
        React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 } },
          React.createElement("div", null,
            React.createElement("div", { style: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" } }, "Appuntamenti Oggi"),
            React.createElement("div", { style: { fontSize: 20, fontWeight: 800, color: "#42A5F5", fontFamily: "'JetBrains Mono', monospace", marginTop: 4 } }, totAppt + " totali")
          ),
          React.createElement("div", { style: { display: "flex", gap: 4 } },
            ...["negozi", "agenti"].map(m => React.createElement("button", {
              key: m, onClick: () => setApptView(m),
              style: {
                padding: "3px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer",
                border: apptView === m ? "1px solid rgba(66,165,245,0.4)" : "1px solid rgba(255,255,255,0.08)",
                background: apptView === m ? "rgba(66,165,245,0.1)" : "transparent",
                color: apptView === m ? "#42A5F5" : "#666", fontWeight: 600,
              }
            }, m === "negozi" ? "🏪 Punti Vendita" : "👤 Agenti"))
          )
        ),
        apptView === "negozi"
          ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
              ...apptPerNegozio.map(a => React.createElement("div", {
                key: a.store.id, style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }
              },
                React.createElement("span", { style: { fontSize: 11, color: "#aaa", width: 80, fontWeight: 500 } }, a.store.name),
                React.createElement("div", { style: { flex: 1, height: 16, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden", position: "relative" } },
                  React.createElement("div", { style: { height: "100%", width: (a.count / maxApptNeg * 100) + "%", backgroundColor: "rgba(66,165,245,0.4)", borderRadius: 4, transition: "width 0.8s ease", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 } },
                    a.count > 0 ? React.createElement("span", { style: { fontSize: 9, color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 } }, a.count) : null
                  )
                ),
                a.count === 0 ? React.createElement("span", { style: { fontSize: 9, color: "#444", fontFamily: "'JetBrains Mono', monospace", width: 16 } }, "0") : null
              ))
            )
          : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
              ...apptPerAgente.slice(0, 10).map(a => React.createElement("div", {
                key: a.seller.id, style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }
              },
                React.createElement("span", { style: { fontSize: 11, color: "#ccc", width: 90, fontWeight: 500 } }, a.seller.name),
                React.createElement("span", { style: { fontSize: 9, color: "#666", width: 65 } }, a.store.name),
                React.createElement("div", { style: { flex: 1, height: 16, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" } },
                  React.createElement("div", { style: { height: "100%", width: (a.count / maxApptAg * 100) + "%", backgroundColor: "rgba(76,175,80,0.4)", borderRadius: 4, transition: "width 0.8s ease", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 } },
                    React.createElement("span", { style: { fontSize: 9, color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 } }, a.count)
                  )
                )
              ))
            )
      ),

      // Monitoraggio pratiche globale con toggle
      React.createElement(Card, { delay: 0.75 },
        React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 } },
          React.createElement("div", { style: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" } }, "Monitoraggio Pratiche — Tutti i Negozi"),
          React.createElement("div", { style: { display: "flex", gap: 4 } },
            ...["lavorare", "perse"].map(m => React.createElement("button", {
              key: m, onClick: () => setPratView(m),
              style: {
                padding: "3px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer",
                border: pratView === m ? "1px solid " + (m === "lavorare" ? "rgba(255,167,38,0.4)" : "rgba(239,83,80,0.4)") : "1px solid rgba(255,255,255,0.08)",
                background: pratView === m ? (m === "lavorare" ? "rgba(255,167,38,0.1)" : "rgba(239,83,80,0.1)") : "transparent",
                color: pratView === m ? (m === "lavorare" ? "#FFA726" : "#EF5350") : "#666", fontWeight: 600,
              }
            }, m === "lavorare" ? "📋 Da Lavorare + Warning" : "🔴 Pratiche Perse"))
          )
        ),
        pratView === "lavorare"
          ? React.createElement("div", null,
              React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
                ...pratichePerNeg.slice().sort(function(a, b) { return (b.daLav + b.warn) - (a.daLav + a.warn); }).map(function(p) {
                  const val = p.daLav + p.warn;
                  const maxVal = Math.max.apply(null, pratichePerNeg.map(function(x) { return x.daLav + x.warn; }));
                  const max = Math.max(1, maxVal);
                  return React.createElement("div", { key: p.store.id, style: { display: "flex", alignItems: "center", gap: 8, padding: "3px 0" } },
                    React.createElement("span", { style: { fontSize: 11, color: "#aaa", width: 80, fontWeight: 500 } }, p.store.name),
                    React.createElement("div", { style: { flex: 1, display: "flex", gap: 2, height: 14 } },
                      p.daLav > 0 ? React.createElement("div", { style: { width: (p.daLav / max * 100) + "%", backgroundColor: "#FFA726", borderRadius: 3, transition: "width 0.8s ease" } }) : null,
                      p.warn > 0 ? React.createElement("div", { style: { width: (p.warn / max * 100) + "%", backgroundColor: "#FF7043", borderRadius: 3, transition: "width 0.8s ease" } }) : null
                    ),
                    React.createElement("span", { style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: val > 3 ? "#FF7043" : val > 0 ? "#FFA726" : "#4CAF50", width: 20, textAlign: "right", fontWeight: 700 } }, val)
                  );
                })
              ),
              React.createElement("div", { style: { display: "flex", gap: 12, marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.04)" } },
                ...[{ c: "#FFA726", l: "Da Lavorare" }, { c: "#FF7043", l: "Warning" }].map(function(item) {
                  return React.createElement("div", { key: item.l, style: { display: "flex", alignItems: "center", gap: 4 } },
                    React.createElement("div", { style: { width: 10, height: 6, borderRadius: 2, backgroundColor: item.c } }),
                    React.createElement("span", { style: { fontSize: 9, color: "#666" } }, item.l)
                  );
                })
              )
            )
          : React.createElement("div", null,
              React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
                ...pratichePerNeg.slice().sort(function(a, b) { return b.perse - a.perse; }).map(function(p) {
                  const maxPerse = Math.max(1, Math.max.apply(null, pratichePerNeg.map(function(x) { return x.perse; })));
                  return React.createElement("div", { key: p.store.id, style: { display: "flex", alignItems: "center", gap: 8, padding: "3px 0" } },
                    React.createElement("span", { style: { fontSize: 11, color: "#aaa", width: 80, fontWeight: 500 } }, p.store.name),
                    React.createElement("div", { style: { flex: 1, height: 14, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" } },
                      React.createElement("div", { style: { height: "100%", width: (p.perse / maxPerse * 100) + "%", backgroundColor: "#EF5350", borderRadius: 3, transition: "width 0.8s ease" } })
                    ),
                    React.createElement("span", { style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: p.perse > 3 ? "#EF5350" : p.perse > 0 ? "#FF9800" : "#4CAF50", width: 20, textAlign: "right", fontWeight: 700 } }, p.perse)
                  );
                })
              ),
              React.createElement("div", { style: { display: "flex", gap: 12, marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.04)" } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
                  React.createElement("div", { style: { width: 10, height: 6, borderRadius: 2, backgroundColor: "#EF5350" } }),
                  React.createElement("span", { style: { fontSize: 9, color: "#666" } }, "KO + Non Pagate (ultimo bimestre)")
                )
              )
            )
      )
    )
  );
}

// ─── BLOCCO OB: Dashboard Outbound ──────────────────────────────

const SOGLIE = [
  { min: 0, max: 200, pay: 6, label: "Soglia 1" },
  { min: 200, max: 300, pay: 7, label: "Soglia 2" },
  { min: 300, max: 400, pay: 8.5, label: "Soglia 3" },
  { min: 400, max: 500, pay: 10, label: "Soglia 4" },
  { min: 500, max: 9999, pay: 12, label: "Soglia 5" },
];

function getSoglia(punti) {
  for (let i = SOGLIE.length - 1; i >= 0; i--) { if (punti >= SOGLIE[i].min) return SOGLIE[i]; }
  return SOGLIE[0];
}

function getGuadagno(punti) {
  const s = getSoglia(punti);
  return punti * s.pay;
}

function BloccoOB({ data, sellerId, isDirector }) {
  const seller = SELLERS.find(se => se.id === sellerId);
  if (!seller) return null;
  const gl = getSellerGL(seller);
  const gt = glMese(gl); const gp = glPass(gl, OGGI); const gr = glRim(gl, OGGI);

  // Fatturato
  const fatturato = data.fatturato[sellerId] || 0;
  const fattProj = proj(fatturato, gp, gt);
  const fattTarget = Math.round(4500 + fatturato * 0.3); // mock target
  const fattPct = fattTarget > 0 ? Math.round((fattProj / fattTarget) * 100) : 0;
  const fattGap = Math.max(0, fattTarget - fattProj);
  const fattRitmo = gr > 0 ? Math.round(fattGap / gr) : 0;

  // Punti
  let puntiAttuali = 0;
  const brandPunti = BRANDS.map(b => {
    const f = (data.produzione[sellerId] && data.produzione[sellerId][b.id]) || 0;
    const pts = f * 10;
    puntiAttuali += pts;
    return { brand: b, punti: pts, consumer: Math.round(pts * 0.6), business: Math.round(pts * 0.4) };
  }).filter(function(bp) { return bp.punti > 0; });
  const puntiProj = proj(puntiAttuali, gp, gt);
  const sogliaAttuale = getSoglia(puntiAttuali);
  const sogliaProj = getSoglia(puntiProj);
  const guadagnoProj = getGuadagno(puntiProj);
  const totBrandPunti = brandPunti.reduce(function(s, bp) { return s + bp.punti; }, 0) || 1;

  // Prossima soglia
  const nextSogliaIdx = SOGLIE.findIndex(function(s) { return s.label === sogliaProj.label; }) + 1;
  const nextSoglia = nextSogliaIdx < SOGLIE.length ? SOGLIE[nextSogliaIdx] : null;
  const puntiToNext = nextSoglia ? nextSoglia.min - puntiProj : 0;
  const moneyShift = nextSoglia ? (puntiProj * nextSoglia.pay) - guadagnoProj : 0;

  // Gestione pratiche mock
  const pratiche = { inviate: Math.round(puntiAttuali / 8), inLavorazione: Math.round(puntiAttuali / 15), inAttesa: 3, conProblema: 1 };

  // Motivazione
  const mood = fattPct >= 100 ? { emoji: "🔥", msg: "Stai spaccando! Sopra target.", col: "#4CAF50" }
    : fattPct >= 85 ? { emoji: "💪", msg: "Quasi! Mancano €" + fattGap.toLocaleString() + " — spingi!", col: "#FFA726" }
    : fattPct >= 60 ? { emoji: "⚡", msg: "Sveglia! Servono €" + fattRitmo.toLocaleString() + "/gg per chiudere.", col: "#FF7043" }
    : { emoji: "🚨", msg: "Allarme rosso. €" + fattRitmo.toLocaleString() + "/gg da oggi o non chiudi.", col: "#EF5350" };

  // Classifica OB
  const obSellers = SELLER_GROUPS.ob || [];
  const [classMode, setClassMode] = useState("fatturato");
  const classData = obSellers.map(function(se) {
    const seGL = getSellerGL(se);
    const seGt = glMese(seGL); const seGp = glPass(seGL, OGGI);
    return { seller: se, fattProj: getFattProj(se.id, data, seGp, seGt), avgPct: getAvgPct(se.id, data, seGp, seGt) };
  });
  const classSorted = classMode === "fatturato" ? classData.slice().sort(function(a, b) { return b.fattProj - a.fattProj; }) : classData.slice().sort(function(a, b) { return b.avgPct - a.avgPct; });
  const myRank = classSorted.findIndex(function(r) { return r.seller.id === sellerId; }) + 1;

  // Director team
  const [dirExp, setDirExp] = useState(null);
  const teamOB = isDirector ? obSellers.map(function(se) {
    let pts = 0;
    const seBrands = BRANDS.map(function(b) {
      const f = (data.produzione[se.id] && data.produzione[se.id][b.id]) || 0;
      const p = f * 10; pts += p;
      return { brand: b, punti: p, consumer: Math.round(p * 0.6), business: Math.round(p * 0.4) };
    });
    const seGL = getSellerGL(se); const seGt = glMese(seGL); const seGp = glPass(seGL, OGGI);
    return { seller: se, punti: pts, puntiProj: proj(pts, seGp, seGt), soglia: getSoglia(proj(pts, seGp, seGt)), fattProj: proj(data.fatturato[se.id] || 0, seGp, seGt), brands: seBrands };
  }).sort(function(a, b) { return b.puntiProj - a.puntiProj; }) : [];

  return React.createElement("div", null,
    React.createElement(SectionTitle, { icon: "🚗", text: isDirector ? "Outbound — Panoramica Team" : "I Miei Risultati" }),

    // Director team
    isDirector ? React.createElement("div", { style: { marginBottom: 20 } },
      React.createElement(Card, { delay: 0.1 },
        React.createElement("div", { style: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 } }, "Team Agenti — Clicca per dettaglio"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
          ...teamOB.map(function(td, ti) {
            const medals = ["🥇", "🥈", "🥉"];
            const isMe = td.seller.id === sellerId;
            const isE = dirExp === td.seller.id;
            const tdTot = td.brands.reduce(function(s, bp) { return s + bp.punti; }, 0) || 1;
            return React.createElement("div", { key: td.seller.id },
              React.createElement("div", {
                onClick: function() { setDirExp(isE ? null : td.seller.id); },
                style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: "pointer", backgroundColor: isE ? "rgba(255,255,255,0.03)" : isMe ? "rgba(66,165,245,0.06)" : ti % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent" }
              },
                React.createElement("span", { style: { fontSize: 14, width: 22 } }, ti < 3 ? medals[ti] : (ti + 1) + "."),
                React.createElement("span", { style: { fontSize: 12, fontWeight: isMe ? 700 : 500, color: isMe ? "#42A5F5" : "#ccc", flex: 1 } }, td.seller.name),
                React.createElement("div", { style: { textAlign: "center", width: 70 } },
                  React.createElement("div", { style: { fontSize: 13, fontWeight: 800, color: td.soglia.pay >= 10 ? "#4CAF50" : td.soglia.pay >= 8 ? "#FFA726" : "#ccc", fontFamily: "'JetBrains Mono', monospace" } }, td.puntiProj + " pt"),
                  React.createElement("div", { style: { fontSize: 9, color: "#666" } }, td.soglia.label)
                ),
                React.createElement("div", { style: { textAlign: "right", width: 65 } },
                  React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "#42A5F5", fontFamily: "'JetBrains Mono', monospace" } }, "€" + Math.round(td.fattProj / 1000) + "k"),
                  React.createElement("div", { style: { fontSize: 9, color: "#666" } }, "fatt. proj.")
                ),
                React.createElement("span", { style: { fontSize: 10, color: "#555", marginLeft: 4 } }, isE ? "▲" : "▼")
              ),
              isE ? React.createElement("div", { style: { padding: "10px 10px 10px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } },
                React.createElement("div", null,
                  React.createElement("div", { style: { fontSize: 10, color: "#888", fontWeight: 600, marginBottom: 6 } }, "PUNTI PER BRAND"),
                  ...td.brands.filter(function(bp) { return bp.punti > 0; }).map(function(bp) {
                    return React.createElement("div", { key: bp.brand.id, style: { display: "flex", alignItems: "center", gap: 6, padding: "2px 0" } },
                      React.createElement("span", { style: { fontSize: 12, width: 16 } }, bp.brand.icon),
                      React.createElement("span", { style: { fontSize: 10, color: bp.brand.color, width: 50 } }, bp.brand.label),
                      React.createElement("div", { style: { flex: 1, height: 10, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" } },
                        React.createElement("div", { style: { height: "100%", width: Math.round(bp.punti / tdTot * 100) + "%", backgroundColor: bp.brand.color, opacity: 0.5, borderRadius: 3 } })
                      ),
                      React.createElement("span", { style: { fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: "#aaa", width: 35, textAlign: "right" } }, bp.punti + "pt")
                    );
                  })
                ),
                React.createElement("div", null,
                  React.createElement("div", { style: { fontSize: 10, color: "#888", fontWeight: 600, marginBottom: 6 } }, "CONSUMER vs BUSINESS"),
                  ...td.brands.filter(function(bp) { return bp.punti > 0; }).map(function(bp) {
                    const totBP = bp.consumer + bp.business || 1;
                    return React.createElement("div", { key: bp.brand.id, style: { display: "flex", alignItems: "center", gap: 6, padding: "2px 0" } },
                      React.createElement("span", { style: { fontSize: 12, width: 16 } }, bp.brand.icon),
                      React.createElement("div", { style: { flex: 1, height: 10, display: "flex", borderRadius: 3, overflow: "hidden" } },
                        React.createElement("div", { style: { width: Math.round(bp.consumer / totBP * 100) + "%", backgroundColor: "#42A5F5", height: "100%" } }),
                        React.createElement("div", { style: { width: Math.round(bp.business / totBP * 100) + "%", backgroundColor: "#FF9800", height: "100%" } })
                      ),
                      React.createElement("span", { style: { fontSize: 8, color: "#42A5F5", width: 20, textAlign: "right" } }, bp.consumer),
                      React.createElement("span", { style: { fontSize: 8, color: "#FF9800", width: 20, textAlign: "right" } }, bp.business)
                    );
                  }),
                  React.createElement("div", { style: { display: "flex", gap: 10, marginTop: 6 } },
                    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 3 } }, React.createElement("div", { style: { width: 8, height: 5, borderRadius: 2, backgroundColor: "#42A5F5" } }), React.createElement("span", { style: { fontSize: 8, color: "#666" } }, "Consumer")),
                    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 3 } }, React.createElement("div", { style: { width: 8, height: 5, borderRadius: 2, backgroundColor: "#FF9800" } }), React.createElement("span", { style: { fontSize: 8, color: "#666" } }, "Business"))
                  )
                )
              ) : null
            );
          })
        )
      )
    ) : null,

    // ROW 1: Fatturato (con TARGET visibile) + Punti/Soglie
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 } },

      // Fatturato con 3 numeri
      React.createElement(Card, { delay: 0.2, style: { borderLeft: "3px solid " + mood.col } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 } },
          React.createElement("div", { style: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" } }, "Fatturato"),
          React.createElement("span", { style: { fontSize: 18 } }, mood.emoji)
        ),
        React.createElement("div", { style: { padding: "8px 10px", borderRadius: 6, backgroundColor: mood.col + "12", border: "1px solid " + mood.col + "25", marginBottom: 10 } },
          React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: mood.col } }, mood.msg)
        ),
        // 3 numeri: Target, Attuale, Proiezione
        React.createElement("div", { style: { display: "flex", gap: 6, marginBottom: 8 } },
          React.createElement("div", { style: { flex: 1, padding: "6px", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.03)", textAlign: "center" } },
            React.createElement("div", { style: { fontSize: 8, color: "#666", textTransform: "uppercase", marginBottom: 2 } }, "TARGET"),
            React.createElement("div", { style: { fontSize: 16, fontWeight: 800, color: "#fff", fontFamily: "'JetBrains Mono', monospace" } }, "€" + fattTarget.toLocaleString())
          ),
          React.createElement("div", { style: { flex: 1, padding: "6px", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.03)", textAlign: "center" } },
            React.createElement("div", { style: { fontSize: 8, color: "#888", textTransform: "uppercase", marginBottom: 2 } }, "ATTUALE"),
            React.createElement("div", { style: { fontSize: 16, fontWeight: 800, color: "#ccc", fontFamily: "'JetBrains Mono', monospace" } }, "€" + fatturato.toLocaleString())
          ),
          React.createElement("div", { style: { flex: 1, padding: "6px", borderRadius: 6, backgroundColor: mood.col + "10", border: "1px solid " + mood.col + "20", textAlign: "center" } },
            React.createElement("div", { style: { fontSize: 8, color: mood.col, textTransform: "uppercase", marginBottom: 2 } }, "PROIEZIONE"),
            React.createElement("div", { style: { fontSize: 16, fontWeight: 800, color: mood.col, fontFamily: "'JetBrains Mono', monospace" } }, "€" + fattProj.toLocaleString())
          )
        ),
        React.createElement(DualBar, { actual: fatturato, projected: fattProj, max: fattTarget, color: mood.col, height: 10 }),
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: 6 } },
          React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: mood.col } }, fattPct + "% del target"),
          fattGap > 0 ? React.createElement("span", { style: { fontSize: 10, color: "#888" } }, "Gap: €" + fattGap.toLocaleString()) : null
        )
      ),

      // Punti e Soglie
      React.createElement(Card, { delay: 0.25 },
        React.createElement("div", { style: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 } }, "Punti & Soglie"),
        React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } },
          React.createElement("div", { style: { flex: 1, padding: "8px", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.03)", textAlign: "center" } },
            React.createElement("div", { style: { fontSize: 8, color: "#666", textTransform: "uppercase", marginBottom: 2 } }, "ATTUALI"),
            React.createElement("div", { style: { fontSize: 20, fontWeight: 800, color: "#fff", fontFamily: "'JetBrains Mono', monospace" } }, puntiAttuali),
            React.createElement("div", { style: { fontSize: 9, color: "#888", marginTop: 2 } }, sogliaAttuale.label + " · €" + sogliaAttuale.pay + "/pt")
          ),
          React.createElement("div", { style: { flex: 1, padding: "8px", borderRadius: 6, backgroundColor: sogliaProj.pay >= 10 ? "rgba(76,175,80,0.08)" : "rgba(255,167,38,0.08)", border: "1px solid " + (sogliaProj.pay >= 10 ? "rgba(76,175,80,0.15)" : "rgba(255,167,38,0.15)"), textAlign: "center" } },
            React.createElement("div", { style: { fontSize: 8, color: sogliaProj.pay >= 10 ? "#4CAF50" : "#FFA726", textTransform: "uppercase", marginBottom: 2 } }, "PROIEZIONE"),
            React.createElement("div", { style: { fontSize: 20, fontWeight: 800, color: sogliaProj.pay >= 10 ? "#4CAF50" : "#FFA726", fontFamily: "'JetBrains Mono', monospace" } }, puntiProj),
            React.createElement("div", { style: { fontSize: 9, color: sogliaProj.pay >= 10 ? "#4CAF50" : "#FFA726", fontWeight: 600, marginTop: 2 } }, sogliaProj.label + " · €" + sogliaProj.pay + "/pt")
          )
        ),
        nextSoglia ? React.createElement("div", { style: { padding: "8px 10px", borderRadius: 6, backgroundColor: "rgba(76,175,80,0.06)", border: "1px solid rgba(76,175,80,0.12)", marginBottom: 10 } },
          React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "#4CAF50" } }, "🎯 Ti mancano " + puntiToNext + " pt per " + nextSoglia.label),
          React.createElement("div", { style: { fontSize: 10, color: "#888", marginTop: 2 } }, "Saliresti a €" + nextSoglia.pay + "/pt retroattivo: "),
          React.createElement("span", { style: { fontSize: 14, fontWeight: 800, color: "#4CAF50", fontFamily: "'JetBrains Mono', monospace" } }, "+€" + Math.round(moneyShift).toLocaleString() + " in più!")
        ) : React.createElement("div", { style: { padding: "6px 10px", borderRadius: 6, backgroundColor: "rgba(76,175,80,0.06)", textAlign: "center", marginBottom: 10 } },
          React.createElement("span", { style: { fontSize: 11, color: "#4CAF50", fontWeight: 700 } }, "🏆 Soglia massima!")
        ),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3 } },
          ...SOGLIE.map(function(sg, si) {
            const isActive = sogliaProj.label === sg.label;
            const isPast = puntiProj >= sg.max;
            return React.createElement("div", { key: si, style: { display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", borderRadius: 4, backgroundColor: isActive ? "rgba(76,175,80,0.08)" : "transparent" } },
              React.createElement("div", { style: { width: 8, height: 8, borderRadius: "50%", backgroundColor: isPast ? "#4CAF50" : isActive ? "#FFA726" : "#333" } }),
              React.createElement("span", { style: { fontSize: 10, color: isActive ? "#fff" : "#888", fontWeight: isActive ? 700 : 400, flex: 1 } }, sg.label + ": " + sg.min + "-" + (sg.max === 9999 ? "∞" : sg.max) + " pt"),
              React.createElement("span", { style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: isActive ? "#4CAF50" : "#666", fontWeight: isActive ? 700 : 400 } }, "€" + sg.pay + "/pt")
            );
          })
        ),
        React.createElement("div", { style: { marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)", textAlign: "center" } },
          React.createElement("span", { style: { fontSize: 10, color: "#888" } }, "Guadagno proj.: "),
          React.createElement("span", { style: { fontSize: 16, fontWeight: 800, color: "#4CAF50", fontFamily: "'JetBrains Mono', monospace" } }, "€" + guadagnoProj.toLocaleString())
        )
      )
    ),

    // ROW 2: Brand Breakdown + Classifica (scrollabile)
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 } },
      React.createElement(Card, { delay: 0.35 },
        React.createElement("div", { style: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 } }, "Distribuzione Punti per Brand"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
          ...brandPunti.map(function(bp) {
            const pct = Math.round((bp.punti / totBrandPunti) * 100);
            return React.createElement("div", { key: bp.brand.id, style: { display: "flex", alignItems: "center", gap: 8 } },
              React.createElement("span", { style: { fontSize: 13, width: 20, textAlign: "center" } }, bp.brand.icon),
              React.createElement("span", { style: { fontSize: 11, color: bp.brand.color, fontWeight: 600, width: 60 } }, bp.brand.label),
              React.createElement("div", { style: { flex: 1, height: 14, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" } },
                React.createElement("div", { style: { height: "100%", width: pct + "%", backgroundColor: bp.brand.color, opacity: 0.6, borderRadius: 4, transition: "width 0.8s ease" } })
              ),
              React.createElement("span", { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#ccc", width: 40, textAlign: "right" } }, bp.punti + " pt"),
              React.createElement("span", { style: { fontSize: 9, color: "#666", width: 30, textAlign: "right" } }, pct + "%")
            );
          })
        )
      ),
      // Classifica OB scrollabile
      React.createElement(Card, { delay: 0.4 },
        React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 } },
          React.createElement("div", { style: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" } }, "Classifica Agenti"),
          React.createElement("div", { style: { display: "flex", gap: 4 } },
            ...["fatturato", "target"].map(function(m) { return React.createElement("button", { key: m, onClick: function() { setClassMode(m); },
              style: { padding: "3px 8px", borderRadius: 6, fontSize: 9, cursor: "pointer", border: classMode === m ? "1px solid rgba(66,165,245,0.4)" : "1px solid rgba(255,255,255,0.08)", background: classMode === m ? "rgba(66,165,245,0.1)" : "transparent", color: classMode === m ? "#42A5F5" : "#666", fontWeight: 600 }
            }, m === "fatturato" ? "💰 Fatt." : "🎯 % Tgt"); })
          )
        ),
        myRank > 0 ? React.createElement("div", { style: { textAlign: "center", padding: "6px", marginBottom: 8, borderRadius: 6, backgroundColor: myRank <= 3 ? "rgba(76,175,80,0.06)" : "rgba(255,255,255,0.02)", border: "1px solid " + (myRank <= 3 ? "rgba(76,175,80,0.12)" : "rgba(255,255,255,0.04)") } },
          React.createElement("span", { style: { fontSize: 11, color: "#888" } }, "Tu: "),
          React.createElement("span", { style: { fontSize: 16, fontWeight: 800, color: myRank <= 3 ? "#4CAF50" : "#FFA726", fontFamily: "'JetBrains Mono', monospace" } }, myRank + "°"),
          React.createElement("span", { style: { fontSize: 11, color: "#666" } }, " su " + classSorted.length)
        ) : null,
        React.createElement("div", { style: { maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 } },
          ...classSorted.map(function(r, ri) {
            const medals = ["🥇", "🥈", "🥉"];
            const isMe = r.seller.id === sellerId;
            return React.createElement("div", { key: r.seller.id, style: { display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 6, backgroundColor: isMe ? "rgba(66,165,245,0.08)" : "transparent", border: isMe ? "1px solid rgba(66,165,245,0.15)" : "1px solid transparent", flexShrink: 0 } },
              React.createElement("span", { style: { fontSize: 12, width: 20, textAlign: "center" } }, ri < 3 ? medals[ri] : (ri + 1) + "."),
              React.createElement("span", { style: { fontSize: 11, fontWeight: isMe ? 700 : 500, color: isMe ? "#42A5F5" : "#ccc", flex: 1 } }, r.seller.name),
              React.createElement("span", { style: { fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: isMe ? "#42A5F5" : "#aaa", width: 55, textAlign: "right" } }, classMode === "fatturato" ? "€" + Math.round(r.fattProj / 1000) + "k" : r.avgPct + "%")
            );
          })
        )
      )
    ),

    // ROW 3: Gestione Pratiche
    React.createElement(Card, { delay: 0.5 },
      React.createElement("div", { style: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 } }, "Gestione Pratiche"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 } },
        ...[
          { n: pratiche.inviate, label: "Inviate", col: "#42A5F5", icon: "📤" },
          { n: pratiche.inLavorazione, label: "In Lavorazione", col: "#4CAF50", icon: "⚙️" },
          { n: pratiche.inAttesa, label: "Attesa Inserimento", col: "#FFA726", icon: "⏳" },
          { n: pratiche.conProblema, label: "Con Problema", col: "#EF5350", icon: "⚠️" },
        ].map(function(item) {
          return React.createElement("div", { key: item.label, style: { padding: "12px", borderRadius: 8, textAlign: "center", backgroundColor: item.col + "08", border: "1px solid " + item.col + "15", cursor: "pointer" } },
            React.createElement("div", { style: { fontSize: 14, marginBottom: 4 } }, item.icon),
            React.createElement("div", { style: { fontSize: 22, fontWeight: 800, color: item.col, fontFamily: "'JetBrains Mono', monospace" } }, item.n),
            React.createElement("div", { style: { fontSize: 9, color: item.col, marginTop: 2 } }, item.label)
          );
        })
      ),
      React.createElement("div", { style: { fontSize: 10, color: "#42A5F5", marginTop: 10, cursor: "pointer", textAlign: "right" } }, "Vai a Gestione PDA →")
    )
  );
}

// ─── BLOCCO CC DIR: Team Call Center ─────────────────────────────

function BloccoCCDir({ data, sellerId }) {
  const ccSellers = SELLER_GROUPS.cc || [];
  const teamCC = ccSellers.map(function(se) {
    const seGL = getSellerGL(se);
    const seGt = glMese(seGL); const seGp = glPass(seGL, OGGI);
    let fatti = 0;
    BRANDS.forEach(function(b) { fatti += (data.produzione[se.id] && data.produzione[se.id][b.id]) || 0; });
    const target = data.targetPersonali[se.id].totale;
    const p = proj(fatti, seGp, seGt);
    const pct = target > 0 ? Math.round((p / target) * 100) : 0;
    return { seller: se, fatti: fatti, target: target, proj: p, pct: pct, fattProj: getFattProj(se.id, data, seGp, seGt) };
  }).sort(function(a, b) { return b.pct - a.pct; });

  return React.createElement(Card, { delay: 0.4 },
    React.createElement("div", { style: { fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 } }, "Team Call Center — Proiezione"),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
      ...teamCC.map(function(td, ti) {
        const col = stCol(td.pct);
        const isMe = td.seller.id === sellerId;
        const medals = ["🥇", "🥈", "🥉"];
        return React.createElement("div", { key: td.seller.id, style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, backgroundColor: isMe ? "rgba(66,165,245,0.06)" : ti % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" } },
          React.createElement("span", { style: { fontSize: 14, width: 22 } }, ti < 3 ? medals[ti] : (ti + 1) + "."),
          React.createElement("div", { style: { width: 8, height: 8, borderRadius: "50%", backgroundColor: col, flexShrink: 0 } }),
          React.createElement("span", { style: { fontSize: 12, fontWeight: isMe ? 700 : 500, color: isMe ? "#42A5F5" : "#ccc", flex: 1 } }, td.seller.name),
          React.createElement("span", { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#aaa" } }, td.fatti),
          React.createElement("span", { style: { fontSize: 8, color: "#555" } }, "→"),
          React.createElement("span", { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: col, fontWeight: 600 } }, td.proj + "/" + td.target),
          React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: col, width: 36, textAlign: "right" } }, td.pct + "%")
        );
      })
    )
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

const ROLES = [
  { id: "venditore", label: "Venditore", sellerId: "s1", icon: "👤", area: "pv" },
  { id: "store_manager", label: "Store Manager", sellerId: "s3", icon: "🏪", area: "pv" },
  { id: "supervisore", label: "Supervisore", sellerId: "s7", icon: "👁️", area: "pv" },
  { id: "admin", label: "Admin", sellerId: "s3", icon: "🔑", area: "admin" },
  { id: "cc_operator", label: "Caller", sellerId: "cc1", icon: "📞", area: "cc" },
  { id: "cc_director", label: "Dir. Call Center", sellerId: "cc5", icon: "📞", area: "cc" },
  { id: "ob_agent", label: "Agente", sellerId: "ob1", icon: "🚗", area: "ob" },
  { id: "ob_director", label: "Dir. Outbound", sellerId: "ob4", icon: "🚗", area: "ob" },
];

export default function Dashboard() {
  const data = useMemo(function() { return generateMockData(); }, []);
  const [ri, setRi] = useState(0);
  const [supSt, setSupSt] = useState("centocelle");
  const [admSt, setAdmSt] = useState("tiburtina");
  const role = ROLES[ri]; const seller = SELLERS.find(se => se.id === role.sellerId);
  const isMgr = role.id === "store_manager"; const isSup = role.id === "supervisore"; const isAdm = role.id === "admin";
  const isCC = role.area === "cc"; const isOB = role.area === "ob"; const isPV = role.area === "pv";
  const isDirector = role.id === "cc_director" || role.id === "ob_director";
  let stB = seller ? seller.store : null; if (isSup) stB = supSt; if (isAdm) stB = admSt;

  // Label per il saluto
  const areaLabel = isAdm ? "Amministrazione" : isCC ? "Call Center" : isOB ? "Outbound" : ((STORES.find(st => st.id === (seller ? seller.store : ""))) || {}).name || "";

  return React.createElement("div", { style: { minHeight: "100vh", backgroundColor: "#060610", color: "#e0e0e0", fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif" } },
    React.createElement("style", null, "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');* { box-sizing: border-box; margin: 0; padding: 0; }::-webkit-scrollbar { width: 4px; }::-webkit-scrollbar-track { background: transparent; }::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }@keyframes fadeUp { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform: translateY(0); } }.card-hover { transition: border-color 0.2s, box-shadow 0.2s; }.card-hover:hover { border-color: rgba(255,255,255,0.1) !important; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }"),
    React.createElement("div", { style: { padding: "18px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "linear-gradient(180deg, rgba(12,12,26,0.95) 0%, transparent 100%)" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12 } },
        React.createElement("div", { style: { width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg, #E60000, #FF6B00)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff", fontFamily: "'JetBrains Mono', monospace" } }, "T"),
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 16, fontWeight: 800, color: "#fff" } }, "Dashboard"),
          React.createElement("div", { style: { fontSize: 10, color: "#666", fontFamily: "'JetBrains Mono', monospace" } }, "Telefutura CRM · Marzo 2026")
        )
      ),
      React.createElement("div", { style: { display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" } },
        React.createElement("span", { style: { fontSize: 10, color: "#555", marginRight: 4 } }, "DEMO:"),
        ...ROLES.map((r, i) => React.createElement("button", { key: r.id, onClick: () => setRi(i),
          style: { padding: "4px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", border: ri === i ? "1px solid rgba(230,0,0,0.4)" : "1px solid rgba(255,255,255,0.08)", background: ri === i ? "rgba(230,0,0,0.1)" : "transparent", color: ri === i ? "#ff4444" : "#777", fontWeight: 600 }
        }, r.icon + " " + r.label))
      )
    ),
    React.createElement("div", { style: { padding: "20px 28px 6px", fontSize: 20, fontWeight: 700, color: "#fff" } },
      "Buongiorno, " + (seller ? seller.name : ""),
      React.createElement("span", { style: { fontSize: 14, color: "#555", fontWeight: 400, marginLeft: 8 } }, "· " + areaLabel)
    ),
    React.createElement("div", { style: { padding: "16px 28px 40px", display: "flex", flexDirection: "column", gap: 24 } },

      // BLOCCO A — PV e CC vedono il target aziendale, OB no
      (isPV || isCC || isAdm) ? React.createElement(BloccoA, { data: data, storeId: (isMgr || isSup) ? stB : null }) : null,

      // BLOCCO D+E — Solo Admin
      isAdm ? React.createElement(BloccoDE, { data: data }) : null,

      // Supervisore: selettore negozio
      isSup ? React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
        React.createElement("span", { style: { fontSize: 12, color: "#888" } }, "Seleziona negozio:"),
        ...["centocelle", "cinecitta", "trastevere"].map(sid => React.createElement("button", { key: sid, onClick: () => setSupSt(sid),
          style: { padding: "5px 14px", borderRadius: 8, fontSize: 11, cursor: "pointer", border: supSt === sid ? "1px solid rgba(66,165,245,0.4)" : "1px solid rgba(255,255,255,0.08)", background: supSt === sid ? "rgba(66,165,245,0.1)" : "transparent", color: supSt === sid ? "#42A5F5" : "#888", fontWeight: 600 }
        }, (STORES.find(s => s.id === sid) || {}).name || sid))
      ) : null,

      // Admin: selettore negozio per Blocco B
      isAdm ? React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
        React.createElement("span", { style: { fontSize: 12, color: "#888" } }, "Dettaglio negozio:"),
        React.createElement("select", { value: admSt, onChange: (e) => setAdmSt(e.target.value),
          style: { background: "#111125", border: "1px solid rgba(255,255,255,0.1)", color: "#ccc", padding: "5px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", outline: "none" }
        }, ...STORES.map(st => React.createElement("option", { key: st.id, value: st.id }, st.name)))
      ) : null,

      // BLOCCO B — Solo PV managers e admin
      (isMgr || isSup || isAdm) ? React.createElement(BloccoB, { data: data, storeId: stB }) : null,

      // BLOCCO C — differenziato per area
      // Admin: BloccoCAdmin
      // OB: BloccoOB dedicato
      // CC Director: BloccoCCDir team + BloccoC personale
      // CC Operator: BloccoC senza monitoraggio/appuntamenti
      // PV: BloccoC completo
      isAdm
        ? React.createElement(BloccoCAdmin, { data: data })
        : isOB
          ? React.createElement(BloccoOB, { data: data, sellerId: role.sellerId, isDirector: isDirector })
          : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 24 } },
              (role.id === "cc_director") ? React.createElement(BloccoCCDir, { data: data, sellerId: role.sellerId }) : null,
              React.createElement(BloccoC, {
                data: data, sellerId: role.sellerId, outbound: false,
                hideMonitoraggio: isCC, hideAppuntamenti: isCC,
              })
            )
    ),
    React.createElement("div", { style: { padding: "12px 28px", borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: 10, color: "#333", display: "flex", justifyContent: "space-between" } },
      React.createElement("span", null, "Telefutura SRL / Telefutura 2SRL"),
      React.createElement("span", { style: { fontFamily: "'JetBrains Mono', monospace" } }, "Dashboard v1.3")
    )
  );
}
