"use client";

import { useState, useCallback } from "react";

// ── COSTANTI ──────────────────────────────────────────────────────────────────

const VENDITORI = ["Alberto", "Alex", "Alin", "Asad", "Ben Aziza", "Cristhian", "Cristi", "Damiano", "Daniel", "Daniele2", "Denise", "Dimitri", "Eloise", "Eros", "Fadel", "Federico", "Francesca", "Francesco", "George", "Giacomo", "Gian", "Giulia", "Giuseppe B.", "Ilaria", "Lorenzo", "Manu", "Marta", "Marta2", "Marta3", "Matteo", "Michele", "Riccardo", "Roberto", "Samantha", "Sheekell", "Tommaso", "Veronica"];
const NEGOZI = ["Magliana", "Donna", "Libia", "Collatina", "Mazzini", "San Paolo", "Garbatella", "Promontori", "Acilia", "Baleniere", "Castani", "Merulana", "Telefonico"];

const ALL_BRANDS = [
  { id: "w3", label: "WindTre", badge: "W3", color: "#2E75B6", bg: "#EBF3FB", desc: "Mobile · Fisso · Luce&Gas · Multi-Servizi", onlyBusiness: false },
  { id: "sky", label: "Sky", badge: "SKY", color: "#0072CE", bg: "#E6F2FB", desc: "Fisso · Abbonamenti TV", onlyBusiness: false },
  { id: "fastweb", label: "Fastweb", badge: "FW", color: "#00A651", bg: "#E6F7EE", desc: "Mobile · Fisso · Luce&Gas", onlyBusiness: false },
  { id: "energy", label: "Energy", badge: "NRG", color: "#fd7e14", bg: "#FFF3E6", desc: "Luce e Gas", onlyBusiness: false },
  { id: "dojo", label: "Dojo", badge: "DJ", color: "#6f42c1", bg: "#F3EEFB", desc: "POS · Terminali di pagamento", onlyBusiness: true },
];

// ── PRODOTTI PER BRAND ────────────────────────────────────────────────────────

const PRODOTTI = {
  w3: {
    consumer: {
      "Mobile": ["Mobile Voce 5G", "Mobile Special 5G", "Mobile Start Unlimited 5G", "Mobile Unlimited 5G", "Mobile Unlimited Pro 5G"],
      "Fisso": ["Super Fibra", "Super Fibra & Netflix STD", "Super Fibra & Netflix"],
      "Luce & Gas": ["Luce", "Gas"],
      "Multi-servizi": ["Assicurazione Casa & Famiglia Start", "Assicurazione Casa & Famiglia Plus", "Assicurazione Casa & Famiglia Full", "Protecta Casa", "Protecta Plus"],
    },
    business: {
      "Mobile": ["Mobile Professional", "Mobile World Plus", "Mobile Full Plus XL", "Mobile Staff XL", "Mobile Flat Tax"],
      "Fisso": ["Super Fibra Professional", "Super Fibra Professional Box"],
      "Luce & Gas": ["Luce", "Gas"],
      "Multi-servizi": ["Protecta Bus"],
    },
  },
  fastweb: {
    consumer: {
      "Mobile": ["Mobile Start", "Mobile Pro", "Mobile Power", "Mobile Ultra"],
      "Fisso": ["Casa Start", "Casa Pro", "Casa Ultra", "Casa FWA Start"],
      "Luce & Gas": ["Energy Flat Light", "Energy Flat Full", "Energy Flat Maxi", "Energy Flex", "Energy Fix"],
    },
    business: {
      "Mobile": ["Mobile Business", "Mobile Business Freedom", "Mobile Business Unlimited"],
      "Fisso": ["Business Light", "Business", "Business Plus", "Business Pro"],
      "Luce & Gas": ["Energy Flex", "Energy Fix"],
    },
  },
  energy: {
    consumer: { "Luce & Gas": ["Smart Luce", "Green Cap Luce", "Smart Gas", "Green Cap Gas"] },
    business: { "Luce & Gas": ["Smart Luce", "Green Cap Luce", "Smart Gas", "Green Cap Gas"] },
  },
  sky: {
    consumer: {
      "Fisso": ["Sky Wi-Fi", "Sky 3P"],
      "Abbonamenti SKY": ["Sky TV", "Sky Glass"],
    },
    business: {
      "Fisso": ["Sky Wi-Fi"],
      "Abbonamenti SKY": ["Sky Uffici", "Sky Bar", "Sky Hotel", "Sky B&B"],
    },
  },
  dojo: {
    consumer: {},
    business: { "POS": ["Dojo Go", "Dojo Pocket"] },
  },
};

// ── CAMPI POST-SELEZIONE (MENU A COMPARSA) ────────────────────────────────────

const CAT_FIELDS = {
  "Mobile": [
    { key: "serialeSim", label: "Seriale SIM Operatore", type: "text", ph: "89398808...", required: true },
    { key: "numeroMnp", label: "Numero Telefono MNP", type: "text", ph: "es. 3331234567" },
    { key: "serialeDon", label: "Seriale SIM Donating", type: "text", ph: "893910..." },
    { key: "device", label: "Device", type: "text", ph: "es. Samsung S25" },
    { key: "serviziDig", label: "Servizi Digitali", type: "text", ph: "es. Disney+" },
  ],
  "Fisso": [
    { key: "indirizzoImp", label: "Indirizzo Impianto", type: "text", ph: "es. Via Roma 1, 00100 Roma", required: true, span2: true },
    { key: "gnpLinea1", label: "N. Telefono GNP Linea 1", type: "text", ph: "es. 0612345678" },
    { key: "codMigr1", label: "Codice Migrazione L.1", type: "text", ph: "es. MIG123456" },
    { key: "gnpLinea2", label: "N. Telefono GNP Linea 2", type: "text", ph: "es. 0612345679" },
    { key: "codMigr2", label: "Codice Migrazione L.2", type: "text", ph: "es. MIG654321" },
    { key: "convergenza", label: "Convergenza", type: "select", opts: ["", "Sì", "No"] },
    { key: "serviziDig", label: "Servizi Digitali", type: "text", ph: "es. Netflix" },
  ],
  "Luce & Gas": [
    { key: "tipologiaC", label: "Tipologia Contratto", type: "select", opts: ["", "Switch", "Switch Voltura", "Voltura", "Attivazione / Subentro", "Posa + Attivazione"], required: true },
    { key: "indirizzoF", label: "Indirizzo Fornitura", type: "text", ph: "es. Via Roma 1, 00100 Roma", required: true, span2: true },
    // Luce
    { key: "pod", label: "POD", type: "text", ph: "It001exxxxxxxx" },
    { key: "potenzaImp", label: "Potenza Impegnata (kW)", type: "text", ph: "es. 3.0" },
    { key: "tensione", label: "Tensione", type: "select", opts: ["", "BT 220v", "BT 380v", "MT"] },
    { key: "destinazL", label: "Destinazione d'uso", type: "select", opts: ["", "Domestico residente", "Domestico non residente", "Altri usi"] },
    { key: "consumoL", label: "Consumo Annuo (kWh)", type: "text", ph: "es. 2700" },
    { key: "residente", label: "Residente", type: "select", opts: ["", "Sì", "No"] },
    // Gas
    { key: "pdr", label: "PDR", type: "text", ph: "es. 3582757092302395U02" },
    { key: "tipologiaUso", label: "Tipologia d'uso Gas", type: "select", opts: ["", "Attività di servizio pubblico", "Autotrazione", "Commercio e servizi", "Condominio con uso domestico", "Domestico", "Industria", "Generazione elettrica"] },
    { key: "destinazG", label: "Destinazione d'uso Gas", type: "select", opts: ["", "C1 - Riscaldamento", "C2 - Cottura cibi / acqua sanitaria", "C3 - Riscaldamento + cottura", "C4 - Condizionamento", "C5 - Condizionamento + riscaldamento", "T1 - Uso tecnologico", "T2 - Uso tecnologico + riscaldamento"] },
    { key: "consumoG", label: "Consumo Annuo (Smc)", type: "text", ph: "es. 1400" },
    { key: "fornitPrec", label: "Fornitore Precedente", type: "text", ph: "es. Enel / Eni Gas" },
  ],
  "Multi-servizi": [],
  "Abbonamenti SKY": [],
  "POS": [],
};

// Sezioni Luce & Gas: diviso visivamente
const LUCE_GAS_SECTIONS = [
  { title: "💡 Luce", keys: ["tipologiaC", "indirizzoF", "pod", "potenzaImp", "tensione", "destinazL", "consumoL", "residente"] },
  { title: "🔥 Gas", keys: ["tipologiaC", "indirizzoF", "pdr", "tipologiaUso", "destinazG", "consumoG", "fornitPrec"] },
];

// Sky
const SKY_TV_PRODUCTS = ["Sky TV", "Sky Glass", "Sky Uffici", "Sky Bar", "Sky Hotel", "Sky B&B"];
const SKY_PACCHETTI = ["Netflix", "Cinema", "Calcio", "Sport", "Multivision", "4K"];
const SKY_TECNOLOGIA = ["Parabola", "Fibra"];

const CAT_ICONS = { "Mobile": "📱", "Fisso": "🏠", "Luce & Gas": "⚡", "Multi-servizi": "🛡️", "Abbonamenti SKY": "📺", "POS": "💳" };
const CAT_COLORS = { "Mobile": "#2E75B6", "Fisso": "#28a745", "Luce & Gas": "#fd7e14", "Multi-servizi": "#6f42c1", "Abbonamenti SKY": "#0072CE", "POS": "#6f42c1" };

const STEP_LABELS = ["Venditore", "Cliente + Anagrafica", "Brand", "Prodotti", "Allegati", "Note"];


// ── CartItem ──────────────────────────────────────────────────────────────────
function CartItem({ it, ii, gi, total, expI, setExpI }) {
  const exp = expI[gi + "_" + ii];
  const dets = it.details ? Object.entries(it.details).filter(([k, v]) => v && k !== "hasContract") : [];
  return (
    <div style={{ borderBottom: ii < total - 1 ? "1px solid #f0f0f0" : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
        <span style={{ fontSize: 14 }}>{it.macroIcon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: it.macroColor }}>{it.macro}</span>
        <span style={{ color: "#ccc" }}>›</span>
        <span style={{ fontSize: 12, color: "#333" }}>{it.sub}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#bbb" }}>V.#{it.saleNum}</span>
          <button onClick={() => setExpI(p => ({ ...p, [gi + "_" + ii]: !p[gi + "_" + ii] }))}
            style={{ background: exp ? "#f0f7ff" : "#f8f9fa", border: exp ? "1px solid #2E75B6" : "1px solid #e0e0e0", borderRadius: 5, padding: "3px 10px", fontSize: 10, fontWeight: 600, cursor: "pointer", color: exp ? "#2E75B6" : "#888" }}>
            {exp ? "▲ Chiudi" : "👁 Dettagli"}
          </button>
        </div>
      </div>
      {exp && (
        <div style={{ padding: "8px 12px 12px 32px" }}>
          <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12, border: "1px solid #e8edf2" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: it.macroColor, marginBottom: 8 }}>📋 {it.sub}</div>
            {dets.length > 0
              ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                {dets.map(([k, v]) => (
                  <div key={k}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase" }}>{k}</span>
                    <div style={{ fontSize: 12, color: "#333", marginTop: 1 }}>{String(v)}</div>
                  </div>
                ))}
              </div>
              : <div style={{ fontSize: 12, color: "#999" }}>Nessun dettaglio aggiuntivo</div>
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function InviaPda() {
  const [step, setStep] = useState(1);
  const [venditore, setVenditore] = useState("");

  const [tipoCliente, setTipoCliente] = useState(null);
  const [lookupValue, setLookupValue] = useState("");
  const [clienteFound, setClienteFound] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [anConsumer, setAnConsumer] = useState({ nome: "", cognome: "", cf: "", email: "", numeroFisso: "", cellulare: "", iban: "", domicilio: "", note: "" });
  const [anBusiness, setAnBusiness] = useState({ ragioneSociale: "", piva: "", referente: "", numeroFisso: "", mobile: "", email: "", pec: "", codiceUnivoco: "", iban: "", sedeLegale: "", note: "" });

  const [brand, setBrand] = useState(null);

  // Carrello multi-brand
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [expI, setExpI] = useState({});
  const [toast, setToast] = useState(null);

  // { [catKey]: [ { product:"", fields:{}, skyPkt:[], skyTech:"", skyDec:"", lucaGasSez:"" } ] }
  const [allSales, setAllSales] = useState({});
  const [collapsedToggles, setCollapsedToggles] = useState({});

  const getSales = (ck) => allSales[ck] || [{ product: "", fields: {}, skyPkt: [], skyTech: "", skyDec: "", lgSez: "" }];
  const updSale = (ck, si, up) => setAllSales(p => { const a = [...getSales(ck)]; a[si] = { ...a[si], ...up }; return { ...p, [ck]: a }; });
  const setProd = (ck, si, v) => updSale(ck, si, { product: v });
  const setField = (ck, si, fk, v) => updSale(ck, si, { fields: { ...(getSales(ck)[si]?.fields || {}), [fk]: v } });
  const toggleSkyPkt = (ck, si, p) => { const cur = getSales(ck)[si]?.skyPkt || []; updSale(ck, si, { skyPkt: cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p] }); };
  const setSkyTech = (ck, si, v) => updSale(ck, si, { skyTech: v });
  const setSkyDec = (ck, si, v) => updSale(ck, si, { skyDec: v });
  const setLgSez = (ck, si, v) => updSale(ck, si, { lgSez: v });
  // Collaps helper per i toggle blocks pre-campi
  const isTogCollapsed = (key) => collapsedToggles[key] !== false; // default collapsed se già compilato
  const expandToggle = (key) => setCollapsedToggles(p => ({ ...p, [key]: false }));
  const collapseToggle = (key) => setCollapsedToggles(p => ({ ...p, [key]: true }));

  const addSale = (ck) => setAllSales(p => ({ ...p, [ck]: [...getSales(ck), { product: "", fields: {}, skyPkt: [], skyTech: "", skyDec: "", lgSez: "" }] }));
  const removeSale = (ck, si) => setAllSales(p => { const a = [...getSales(ck)]; a.splice(si, 1); return { ...p, [ck]: a.length ? a : [{ product: "", fields: {}, skyPkt: [], skyTech: "", skyDec: "", lgSez: "" }] }; });


  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Raccoglie tutti i prodotti selezionati nel brand corrente
  const colItems = useCallback(() => {
    const items = [];
    const bObj = ALL_BRANDS.find(b => b.id === brand);
    if (!bObj) return items;
    Object.entries(allSales).forEach(([catKey, sales]) => {
      const prefix = brand + "_";
      if (!catKey.startsWith(prefix)) return;
      const categoria = catKey.slice(prefix.length);
      sales.forEach((sale, si) => {
        if (!sale.product) return;
        const det = { ...(sale.fields || {}) };
        if (sale.skyPkt?.length) det["Pacchetti TV"] = sale.skyPkt.join(", ");
        if (sale.skyTech) det["Tecnologia"] = sale.skyTech;
        if (sale.skyDec) det["Decoder agg."] = sale.skyDec;
        items.push({
          macro: categoria,
          macroColor: CAT_COLORS[categoria] || bObj.color,
          macroIcon: CAT_ICONS[categoria] || "📦",
          sub: sale.product,
          saleNum: si + 1,
          details: det,
        });
      });
    });
    return items;
  }, [brand, allSales]);

  const addCart = () => {
    const items = colItems();
    const bObj = ALL_BRANDS.find(b => b.id === brand);
    if (items.length > 0 && bObj) {
      const snap = { allSales: JSON.parse(JSON.stringify(allSales)), brand, tipoCliente };
      setCart(p => [...p, { brandId: brand, brandLabel: bObj.label, brandColor: bObj.color, brandIcon: bObj.badge || bObj.label, items, sv: snap }]);
      showToast("✅ " + items.length + " prodott" + (items.length === 1 ? "o" : "i") + " " + bObj.label + " aggiunti al carrello");
    }
    setBrand(null); setAllSales({});
    setStep(3);
  };

  const editCG = (idx) => {
    const g = cart[idx];
    if (!g) return;
    setBrand(g.sv.brand);
    setAllSales(g.sv.allSales || {});
    setCart(p => p.filter((_, i) => i !== idx));
    setShowCart(false);
    setStep(4);
    showToast("✏️ Modifica " + g.brandLabel);
  };

  const rmCG = (idx) => setCart(p => p.filter((_, i) => i !== idx));

  const fullReset = () => {
    setStep(1); setVenditore("");
    setTipoCliente(null); setLookupValue(""); setClienteFound(false); setLookupDone(false);
    setAnConsumer({ nome: "", cognome: "", cf: "", email: "", numeroFisso: "", cellulare: "", iban: "", domicilio: "", note: "" });
    setAnBusiness({ ragioneSociale: "", piva: "", referente: "", numeroFisso: "", mobile: "", email: "", pec: "", codiceUnivoco: "", iban: "", sedeLegale: "", note: "" });
    setBrand(null); setAllSales({});
    setCart([]); setShowCart(false); setExpI({});
  };

  const finalSubmit = () => {
    const cur = colItems();
    const bObj = ALL_BRANDS.find(b => b.id === brand);
    const fc = [...cart];
    if (cur.length > 0 && bObj)
      fc.push({ brandId: brand, brandLabel: bObj.label, brandColor: bObj.color, items: cur });
    const totProd = fc.reduce((s, g) => s + g.items.length, 0);
    showToast("🎉 Inviato! " + fc.length + " brand · " + totProd + " prodotti");
    setTimeout(fullReset, 2500);
  };

  const reset = fullReset;

  const visibleBrands = ALL_BRANDS.filter(b => tipoCliente === "business" ? true : !b.onlyBusiness);
  const currentBrand = ALL_BRANDS.find(b => b.id === brand);
  const brandProdotti = brand && tipoCliente ? (PRODOTTI[brand]?.[tipoCliente === "business" ? "business" : "consumer"] || {}) : {};

  const tCI = cart.reduce((s, g) => s + g.items.length, 0) + colItems().length;

  const canProceed = () => {
    if (step === 1) return !!venditore;
    if (step === 2) return !!tipoCliente && lookupDone;
    if (step === 3) return !!brand;
    return true;
  };
  const goNext = () => { if (canProceed() && step < 6) setStep(s => s + 1); };
  const goBack = () => { if (step > 1) setStep(s => s - 1); };

  // ── Render campi MENU A COMPARSA ─────────────────────────────────────────────
  const renderCatFields = (categoria, catKey, si, sale) => {
    if (!sale.product) return null;

    // LUCE & GAS
    if (categoria === "Luce & Gas") {
      if (!sale.product) return null;
      const allFields = CAT_FIELDS["Luce & Gas"];
      const color = CAT_COLORS["Luce & Gas"];
      // Fastweb vende solo energia (Luce) — usa sempre campi Luce
      // W3: "Luce" o "Gas" espliciti — Gas aggiornato senza remi/matricola
      const luceKeys = ["tipologiaC", "indirizzoF", "pod", "potenzaImp", "tensione", "destinazL", "consumoL", "residente"];
      const gasKeys = ["tipologiaC", "indirizzoF", "pdr", "tipologiaUso", "destinazG", "consumoG", "fornitPrec"];
      const isLuce = brand === "fastweb" || sale.product === "Luce" || sale.product?.toUpperCase().includes("LUCE");
      const sezKeys = isLuce ? luceKeys : gasKeys;
      const visible = allFields.filter(f => sezKeys.includes(f.key));
      const ibanAna = tipoCliente === "business" ? anBusiness.iban : anConsumer.iban;
      const ibanLG = sale.fields?.ibanLG || "";

      // ── FASTWEB: metodo pagamento + IBAN condizionale ──────────────────────
      if (brand === "fastweb") {
        const payMeth = sale.fields?.payMeth || "";
        return (
          <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 8, background: "white", border: `1px solid ${color}30`, borderLeft: `3px solid ${color}` }}>
            {/* Metodo pagamento + IBAN */}
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px dashed #e0e0e0" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: color, marginBottom: 6 }}>
                💳 Metodo di pagamento <span style={{ color: "#dc3545" }}>*</span>
                <span style={{ fontSize: 10, fontWeight: 400, color: "#888", marginLeft: 6 }}>Richiesto da Fastweb</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: payMeth === "IBAN" ? 10 : 0 }}>
                {[["🏦 IBAN", "IBAN"], ["💳 Carta di Credito", "CC"]].map(([lbl, val]) => {
                  const sel = payMeth === val;
                  return <button key={val} onClick={() => setField(catKey, si, "payMeth", sel ? "" : val)}
                    style={{
                      flex: 1, padding: "10px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      border: sel ? `2px solid ${color}` : "2px solid #e0e0e0",
                      background: sel ? color : "white", color: sel ? "white" : "#444"
                    }}>{lbl}</button>;
                })}
              </div>
              {payMeth === "IBAN" && (
                <div style={{ marginTop: 8 }}>
                  {ibanAna && (
                    <button onClick={() => setField(catKey, si, "ibanLG", ibanAna)}
                      style={{
                        marginBottom: 8, padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                        border: `1px solid ${color}`, background: "white", color: color, display: "flex", alignItems: "center", gap: 6
                      }}>
                      📋 Copia da anagrafica {ibanLG === ibanAna && <span style={{ color: "#28a745" }}>✓</span>}
                    </button>
                  )}
                  <input type="text" value={ibanLG}
                    onChange={e => setField(catKey, si, "ibanLG", e.target.value)}
                    placeholder="IT00 X000 0000 0000 0000 0000 000"
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, boxSizing: "border-box",
                      fontFamily: "monospace", letterSpacing: 1.2,
                      border: ibanLG ? "2px solid #28a745" : "1px solid #d0d0d0",
                      background: ibanLG ? "#f0fff0" : "white"
                    }} />
                  {!ibanAna && <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>Nessun IBAN in anagrafica — inseriscilo manualmente</div>}
                </div>
              )}
            </div>
            {/* Campi fornitura */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 16px" }}>
              {visible.map(f => (
                <div key={f.key} style={f.span2 ? { gridColumn: "1 / -1" } : {}}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 3 }}>
                    {f.label}{f.required && <span style={{ color: "#dc3545" }}> *</span>}
                  </div>
                  {f.type === "select" ? (
                    <select value={sale.fields?.[f.key] || ""} onChange={e => setField(catKey, si, f.key, e.target.value)}
                      style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12 }}>
                      {f.opts.map(o => <option key={o} value={o}>{o || "— Seleziona —"}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={sale.fields?.[f.key] || ""} onChange={e => setField(catKey, si, f.key, e.target.value)}
                      placeholder={f.ph}
                      style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12, boxSizing: "border-box" }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      }

      // ── W3 (e altri): toggle Domiciliazione → IBAN condizionale ──────────────
      const domicil = sale.fields?.domiciliazione || "";
      return (
        <div style={{ marginTop: 12 }}>
          {/* Domiciliazione */}
          <div style={{ padding: "12px 14px", borderRadius: 8, background: "#f8f9fa", border: "1px solid #e0e0e0", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: color, marginBottom: 8 }}>🏦 Domiciliazione?</div>
            <div style={{ display: "flex", gap: 8, marginBottom: domicil === "Sì" ? 12 : 0 }}>
              {["Sì", "No"].map(v => {
                const sel = domicil === v;
                return (
                  <button key={v} onClick={() => setField(catKey, si, "domiciliazione", sel ? "" : v)}
                    style={{
                      flex: 1, padding: "10px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .15s",
                      border: sel ? `2px solid ${color}` : "2px solid #e0e0e0",
                      background: sel ? color : "white", color: sel ? "white" : "#555"
                    }}>
                    {v}
                  </button>
                );
              })}
            </div>
            {domicil === "Sì" && (() => {
              const payMeth = sale.fields?.payMeth || "";
              return (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: color, marginBottom: 8 }}>💳 Metodo di pagamento <span style={{ color: "#dc3545" }}>*</span></div>
                  <div style={{ display: "flex", gap: 8, marginBottom: payMeth === "IBAN" ? 10 : 0 }}>
                    {[["🏦 IBAN", "IBAN"], ["💳 Carta di Credito", "CC"]].map(([lbl, val]) => {
                      const sel = payMeth === val;
                      return <button key={val} onClick={() => setField(catKey, si, "payMeth", sel ? "" : val)}
                        style={{
                          flex: 1, padding: "10px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                          border: sel ? `2px solid ${color}` : "2px solid #e0e0e0",
                          background: sel ? color : "white", color: sel ? "white" : "#444"
                        }}>{lbl}</button>;
                    })}
                  </div>
                  {payMeth === "IBAN" && (
                    <div>
                      {ibanAna && (
                        <button onClick={() => setField(catKey, si, "ibanLG", ibanAna)}
                          style={{
                            marginBottom: 8, padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                            border: `1px solid ${color}`, background: "white", color: color, display: "flex", alignItems: "center", gap: 6
                          }}>
                          📋 Copia da anagrafica {ibanLG === ibanAna && <span style={{ color: "#28a745" }}>✓</span>}
                        </button>
                      )}
                      <input type="text" value={ibanLG}
                        onChange={e => setField(catKey, si, "ibanLG", e.target.value)}
                        placeholder="IT00 X000 0000 0000 0000 0000 000"
                        style={{
                          width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, boxSizing: "border-box",
                          fontFamily: "monospace", letterSpacing: 1.2,
                          border: ibanLG ? "2px solid #28a745" : "1px solid #d0d0d0",
                          background: ibanLG ? "#f0fff0" : "white"
                        }} />
                      {!ibanAna && <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>Nessun IBAN in anagrafica — inseriscilo manualmente</div>}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          {/* Campi fornitura — visibili solo dopo aver risposto alla domiciliazione */}
          {(domicil === "No" || (domicil === "Sì" && (sale.fields?.payMeth === "CC" || (sale.fields?.payMeth === "IBAN")))) && (
            <div style={{ padding: "12px 14px", borderRadius: 8, background: "white", border: `1px solid ${color}30`, borderLeft: `3px solid ${color}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 16px" }}>
                {visible.map(f => (
                  <div key={f.key} style={f.span2 ? { gridColumn: "1 / -1" } : {}}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 3 }}>
                      {f.label}{f.required && <span style={{ color: "#dc3545" }}> *</span>}
                    </div>
                    {f.type === "select" ? (
                      <select value={sale.fields?.[f.key] || ""} onChange={e => setField(catKey, si, f.key, e.target.value)}
                        style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12 }}>
                        {f.opts.map(o => <option key={o} value={o}>{o || "— Seleziona —"}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={sale.fields?.[f.key] || ""} onChange={e => setField(catKey, si, f.key, e.target.value)}
                        placeholder={f.ph}
                        style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12, boxSizing: "border-box" }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Dojo POS — campi custom, niente in CAT_FIELDS
    if (brand === "dojo" && categoria === "POS") {
      const dc = "#6f42c1";
      const addr = sale.fields?.dojoAddr || "";
      const cost = parseFloat(sale.fields?.dojoCost || "5.00");
      const comm = parseFloat(sale.fields?.dojoComm || "0.65");
      const COST_MIN = 5.00, COST_MAX = 10.00, COST_STEP = 0.50;
      const COMM_MIN = 0.65, COMM_MAX = 1.40, COMM_STEP = 0.05;
      const clamp = (v, mn, mx, st) => Math.round(Math.min(mx, Math.max(mn, Math.round(v / st) * st)) * 1000) / 1000;
      const pct = (v, mn, mx) => ((v - mn) / (mx - mn)) * 100;
      const Stepper = ({ label, value, min, max, step, fieldKey, unit, decimals }) => {
        const canDec = value > min, canInc = value < max;
        const pctVal = pct(value, min, max);
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 6 }}>
              {label} <span style={{ color: "#dc3545" }}>*</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => setField(catKey, si, fieldKey, clamp(value - step, min, max, step).toFixed(decimals))}
                disabled={!canDec}
                style={{
                  width: 34, height: 34, borderRadius: 8, border: `2px solid ${canDec ? dc : "#ddd"}`,
                  background: canDec ? dc : "#f5f5f5", color: canDec ? "white" : "#bbb", fontSize: 20, fontWeight: 700,
                  cursor: canDec ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                }}>−</button>
              <div style={{ flex: 1 }}>
                <div style={{ textAlign: "center", marginBottom: 5 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: dc }}>{value.toFixed(decimals)}</span>
                  <span style={{ fontSize: 12, color: "#888", marginLeft: 4 }}>{unit}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "#e0e0e0", position: "relative" }}>
                  <div style={{ height: 6, borderRadius: 3, background: dc, width: `${pctVal}%`, transition: "width .15s" }} />
                  <div style={{
                    position: "absolute", top: -4, left: `calc(${pctVal}% - 7px)`, width: 14, height: 14,
                    borderRadius: "50%", background: dc, border: "2px solid white", boxShadow: `0 2px 6px ${dc}66`
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 9, color: "#aaa" }}>
                  <span>{min.toFixed(decimals)} {unit}</span><span>{max.toFixed(decimals)} {unit}</span>
                </div>
              </div>
              <button onClick={() => setField(catKey, si, fieldKey, clamp(value + step, min, max, step).toFixed(decimals))}
                disabled={!canInc}
                style={{
                  width: 34, height: 34, borderRadius: 8, border: `2px solid ${canInc ? dc : "#ddd"}`,
                  background: canInc ? dc : "#f5f5f5", color: canInc ? "white" : "#bbb", fontSize: 20, fontWeight: 700,
                  cursor: canInc ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                }}>+</button>
            </div>
          </div>
        );
      };
      return (
        <div style={{ marginTop: 12, padding: "14px", borderRadius: 8, background: "white", border: `1px solid ${dc}30`, borderLeft: `3px solid ${dc}` }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 5 }}>
              📍 Indirizzo installazione <span style={{ color: "#dc3545" }}>*</span>
            </div>
            <input type="text" value={addr}
              onChange={e => setField(catKey, si, "dojoAddr", e.target.value)}
              placeholder="es. Via Roma 1, 00100 Roma"
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, boxSizing: "border-box",
                border: addr ? `2px solid ${dc}` : "1px solid #d0d0d0", background: addr ? "#FAF5FF" : "white"
              }} />
          </div>
          <Stepper label="💶 Costo mensile" value={cost} min={COST_MIN} max={COST_MAX} step={COST_STEP} fieldKey="dojoCost" unit="€/mese" decimals={2} />
          <Stepper label="📊 Commissione transazioni" value={comm} min={COMM_MIN} max={COMM_MAX} step={COMM_STEP} fieldKey="dojoComm" unit="%" decimals={2} />
        </div>
      );
    }

    // Categorie generiche
    let fields = CAT_FIELDS[categoria];
    if (!fields || fields.length === 0) return null;
    // Mobile: rimuovi MNP e Donating se Portabilità = No
    if (categoria === "Mobile") {
      if (sale.fields?.portMob === "No")
        fields = fields.filter(f => f.key !== "numeroMnp" && f.key !== "serialeDon");
    }
    if (categoria === "Fisso") {
      // Nascondi Linea 1 (GNP + migrazione) se portabilità = No
      if (sale.fields?.portabilita === "No")
        fields = fields.filter(f => f.key !== "gnpLinea1" && f.key !== "codMigr1");

      // Nascondi Linea 2: W3 consumer sempre | W3 business se secondaLinea=No |
      //                   Sky Wi-Fi/3P sempre | W3 business con secondaLinea=Sì ma portabilita2=No
      const hideL2 = (brand === "w3" && tipoCliente !== "business")
        || (brand === "fastweb" && tipoCliente !== "business")
        || sale.fields?.secondaLinea === "No"
        || (brand === "sky" && (sale.product === "Sky 3P" || sale.product === "Sky Wi-Fi"))
        || (brand === "w3" && tipoCliente === "business" && sale.fields?.secondaLinea === "Sì" && sale.fields?.portabilita2 === "No");
      if (hideL2) fields = fields.filter(f => f.key !== "gnpLinea2" && f.key !== "codMigr2");

      // Sky Wi-Fi e Sky 3P: niente convergenza né servizi digitali
      if (brand === "sky" && (sale.product === "Sky Wi-Fi" || sale.product === "Sky 3P"))
        fields = fields.filter(f => f.key !== "convergenza" && f.key !== "serviziDig");
      // Fastweb: niente convergenza
      if (brand === "fastweb")
        fields = fields.filter(f => f.key !== "convergenza");
    }
    const color = CAT_COLORS[categoria] || "#555";
    const cols = fields.length >= 6 ? "1fr 1fr 1fr" : "1fr 1fr";
    const ibanAnaG = tipoCliente === "business" ? anBusiness.iban : anConsumer.iban;
    const ibanFW = sale.fields?.ibanFW || "";
    const ibanSky3P = sale.fields?.ibanSky3P || "";
    return (
      <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 8, background: "white", border: `1px solid ${color}30`, borderLeft: `3px solid ${color}` }}>
        {/* IBAN W3 Business FISSO — PayPicker + collassabile */}
        {brand === "w3" && tipoCliente === "business" && categoria === "Fisso" && (() => {
          const ibanBus = anBusiness.iban;
          const ibanW3B = sale.fields?.ibanW3B || "";
          const payMeth = sale.fields?.payMeth || "";
          const kIban = `${catKey}_${si}_ibanW3B`;
          const done = payMeth === "CC" || (payMeth === "IBAN" && !!ibanW3B);
          const coll = collapsedToggles[kIban] !== false;
          if (done && coll) return (
            <div onClick={() => expandToggle(kIban)}
              style={{
                marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 8px",
                borderRadius: 20, background: "#edfaf1", border: "1px solid #b2dfca", cursor: "pointer", userSelect: "none"
              }}>
              <span style={{ fontSize: 11, color: "#444" }}>{payMeth === "CC" ? "💳 Carta di Credito" : "🏦 IBAN"}</span>
              {payMeth === "IBAN" && <span style={{ fontSize: 10, color: "#28a745", fontFamily: "monospace", fontWeight: 700 }}>···{ibanW3B.slice(-4)}</span>}
              <span style={{ fontSize: 10, color: "#28a745" }}>✎</span>
            </div>
          );
          return (
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px dashed #e0e0e0" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#28a745", marginBottom: 8 }}>💳 Metodo di pagamento <span style={{ color: "#dc3545" }}>*</span></div>
              <div style={{ display: "flex", gap: 8, marginBottom: payMeth === "IBAN" ? 10 : 0 }}>
                {[["🏦 IBAN", "IBAN"], ["💳 Carta di Credito", "CC"]].map(([lbl, val]) => {
                  const sel = payMeth === val;
                  return <button key={val} onClick={() => { setField(catKey, si, "payMeth", sel ? "" : val); if (val === "CC") collapseToggle(kIban); }}
                    style={{
                      flex: 1, padding: "10px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      border: sel ? "2px solid #28a745" : "2px solid #e0e0e0",
                      background: sel ? "#28a745" : "white", color: sel ? "white" : "#444"
                    }}>{lbl}</button>;
                })}
              </div>
              {payMeth === "IBAN" && (
                <div>
                  {ibanBus && (
                    <button onClick={() => { setField(catKey, si, "ibanW3B", ibanBus); collapseToggle(kIban); }}
                      style={{
                        marginBottom: 8, padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                        border: "1px solid #28a745", background: "white", color: "#28a745", display: "flex", alignItems: "center", gap: 6
                      }}>
                      📋 Copia da anagrafica {ibanW3B === ibanBus && <span style={{ color: "#28a745" }}>✓</span>}
                    </button>
                  )}
                  <input type="text" value={ibanW3B}
                    onChange={e => setField(catKey, si, "ibanW3B", e.target.value)}
                    placeholder="IT00 X000 0000 0000 0000 0000 000"
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, boxSizing: "border-box",
                      fontFamily: "monospace", letterSpacing: 1.2,
                      border: ibanW3B ? "2px solid #28a745" : "1px solid #d0d0d0", background: ibanW3B ? "#f0fff0" : "white"
                    }} />
                  {!ibanBus && <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>Nessun IBAN in anagrafica — inseriscilo manualmente</div>}
                </div>
              )}
            </div>
          );
        })()}
        {/* IBAN SKY (Wi-Fi / 3P) — PayPicker + collassabile */}
        {brand === "sky" && (sale.product === "Sky 3P" || sale.product === "Sky Wi-Fi") && (() => {
          const payMeth = sale.fields?.payMeth || "";
          const kIban = `${catKey}_${si}_ibanSky`;
          const done = payMeth === "CC" || (payMeth === "IBAN" && !!ibanSky3P);
          const coll = collapsedToggles[kIban] !== false;
          if (done && coll) return (
            <div onClick={() => expandToggle(kIban)}
              style={{
                marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 8px",
                borderRadius: 20, background: "#E8F4FF", border: "1px solid #9DCBF0", cursor: "pointer", userSelect: "none"
              }}>
              <span style={{ fontSize: 11, color: "#444" }}>{payMeth === "CC" ? "💳 Carta di Credito" : "🏦 IBAN"}</span>
              {payMeth === "IBAN" && <span style={{ fontSize: 10, color: "#0072CE", fontFamily: "monospace", fontWeight: 700 }}>···{ibanSky3P.slice(-4)}</span>}
              <span style={{ fontSize: 10, color: "#0072CE" }}>✎</span>
            </div>
          );
          return (
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px dashed #e0e0e0" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#0072CE", marginBottom: 8 }}>💳 Metodo di pagamento <span style={{ color: "#dc3545" }}>*</span></div>
              <div style={{ display: "flex", gap: 8, marginBottom: payMeth === "IBAN" ? 10 : 0 }}>
                {[["🏦 IBAN", "IBAN"], ["💳 Carta di Credito", "CC"]].map(([lbl, val]) => {
                  const sel = payMeth === val;
                  return <button key={val} onClick={() => { setField(catKey, si, "payMeth", sel ? "" : val); if (val === "CC") collapseToggle(kIban); }}
                    style={{
                      flex: 1, padding: "10px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      border: sel ? "2px solid #0072CE" : "2px solid #e0e0e0",
                      background: sel ? "#0072CE" : "white", color: sel ? "white" : "#444"
                    }}>{lbl}</button>;
                })}
              </div>
              {payMeth === "IBAN" && (
                <div>
                  {ibanAnaG && (
                    <button onClick={() => { setField(catKey, si, "ibanSky3P", ibanAnaG); collapseToggle(kIban); }}
                      style={{
                        marginBottom: 8, padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                        border: "1px solid #0072CE", background: "white", color: "#0072CE", display: "flex", alignItems: "center", gap: 6
                      }}>
                      📋 Copia da anagrafica {ibanSky3P === ibanAnaG && <span style={{ color: "#28a745" }}>✓</span>}
                    </button>
                  )}
                  <input type="text" value={ibanSky3P}
                    onChange={e => setField(catKey, si, "ibanSky3P", e.target.value)}
                    placeholder="IT00 X000 0000 0000 0000 0000 000"
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, boxSizing: "border-box",
                      fontFamily: "monospace", letterSpacing: 1.2,
                      border: ibanSky3P ? "2px solid #28a745" : "1px solid #d0d0d0", background: ibanSky3P ? "#f0fff0" : "white"
                    }} />
                  {!ibanAnaG && <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>Nessun IBAN in anagrafica — inseriscilo manualmente</div>}
                </div>
              )}
            </div>
          );
        })()}
        {/* IBAN Fastweb — PayPicker + collassabile */}
        {brand === "fastweb" && (() => {
          const payMeth = sale.fields?.payMeth || "";
          const kIban = `${catKey}_${si}_ibanFW`;
          const done = payMeth === "CC" || (payMeth === "IBAN" && !!ibanFW);
          const coll = collapsedToggles[kIban] !== false;
          if (done && coll) return (
            <div onClick={() => expandToggle(kIban)}
              style={{
                marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 8px",
                borderRadius: 20, background: "#edfaf4", border: "1px solid #99dbb4", cursor: "pointer", userSelect: "none"
              }}>
              <span style={{ fontSize: 11, color: "#444" }}>{payMeth === "CC" ? "💳 Carta di Credito" : "🏦 IBAN"}</span>
              {payMeth === "IBAN" && <span style={{ fontSize: 10, color: "#00A651", fontFamily: "monospace", fontWeight: 700 }}>···{ibanFW.slice(-4)}</span>}
              <span style={{ fontSize: 10, color: "#00A651" }}>✎</span>
            </div>
          );
          return (
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px dashed #e0e0e0" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#00A651", marginBottom: 8 }}>
                💳 Metodo di pagamento <span style={{ color: "#dc3545" }}>*</span>
                <span style={{ fontSize: 10, fontWeight: 400, color: "#888", marginLeft: 6 }}>Richiesto da Fastweb</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: payMeth === "IBAN" ? 10 : 0 }}>
                {[["🏦 IBAN", "IBAN"], ["💳 Carta di Credito", "CC"]].map(([lbl, val]) => {
                  const sel = payMeth === val;
                  return <button key={val} onClick={() => { setField(catKey, si, "payMeth", sel ? "" : val); if (val === "CC") collapseToggle(kIban); }}
                    style={{
                      flex: 1, padding: "10px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      border: sel ? "2px solid #00A651" : "2px solid #e0e0e0",
                      background: sel ? "#00A651" : "white", color: sel ? "white" : "#444"
                    }}>{lbl}</button>;
                })}
              </div>
              {payMeth === "IBAN" && (
                <div>
                  {ibanAnaG && (
                    <button onClick={() => { setField(catKey, si, "ibanFW", ibanAnaG); collapseToggle(kIban); }}
                      style={{
                        marginBottom: 8, padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                        border: "1px solid #00A651", background: "white", color: "#00A651", display: "flex", alignItems: "center", gap: 6
                      }}>
                      📋 Copia da anagrafica {ibanFW === ibanAnaG && <span style={{ color: "#28a745" }}>✓</span>}
                    </button>
                  )}
                  <input type="text" value={ibanFW}
                    onChange={e => setField(catKey, si, "ibanFW", e.target.value)}
                    placeholder="IT00 X000 0000 0000 0000 0000 000"
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, boxSizing: "border-box",
                      fontFamily: "monospace", letterSpacing: 1.2,
                      border: ibanFW ? "2px solid #28a745" : "1px solid #d0d0d0", background: ibanFW ? "#f0fff0" : "white"
                    }} />
                  {!ibanAnaG && <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>Nessun IBAN in anagrafica — inseriscilo manualmente</div>}
                </div>
              )}
            </div>
          );
        })()}
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: "10px 16px" }}>
          {fields.map(f => (
            <div key={f.key} style={f.span2 ? { gridColumn: "1 / -1" } : {}}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 3 }}>
                {f.label}{f.required && <span style={{ color: "#dc3545" }}> *</span>}
              </div>
              {f.type === "select" ? (
                <select value={sale.fields?.[f.key] || ""} onChange={e => setField(catKey, si, f.key, e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12 }}>
                  {f.opts.map(o => <option key={o} value={o}>{o || "— Seleziona —"}</option>)}
                </select>
              ) : (
                <input type="text" value={sale.fields?.[f.key] || ""} onChange={e => setField(catKey, si, f.key, e.target.value)}
                  placeholder={f.ph}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12, boxSizing: "border-box" }} />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Render pacchetti Sky ──────────────────────────────────────────────────────
  const renderSkyTvFields = (catKey, si, sale) => {
    if (!sale.product || !SKY_TV_PRODUCTS.includes(sale.product)) return null;
    const color = "#0072CE";
    const pkt = sale.skyPkt || [];
    const tech = sale.skyTech || "";
    const hasMult = pkt.includes("Multivision");
    return (
      <div style={{ marginTop: 12 }}>
        {/* Pacchetti */}
        <div style={{ padding: "12px 14px", borderRadius: 8, background: "white", border: `1px solid ${color}30`, borderLeft: `3px solid ${color}`, marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>📺 Pacchetti TV</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SKY_PACCHETTI.map(p => {
              const sel = pkt.includes(p);
              return (
                <button key={p} onClick={() => toggleSkyPkt(catKey, si, p)}
                  style={{
                    padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .15s",
                    border: sel ? `2px solid ${color}` : "2px solid #e0e0e0",
                    background: sel ? color : "white", color: sel ? "white" : "#444"
                  }}>
                  {p}
                </button>
              );
            })}
          </div>
          {/* Decoder aggiuntivi se Multivision */}
          {hasMult && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#EBF3FB", border: `1px dashed ${color}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 8 }}>🔢 Quanti decoder aggiuntivi? (Multivision)</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setSkyDec(catKey, si, sale.skyDec === String(n) ? "" : String(n))}
                    style={{
                      width: 40, height: 40, borderRadius: 8,
                      border: sale.skyDec === String(n) ? `2px solid ${color}` : "2px solid #e0e0e0",
                      background: sale.skyDec === String(n) ? color : "white",
                      color: sale.skyDec === String(n) ? "white" : "#444",
                      fontSize: 15, fontWeight: 700, cursor: "pointer"
                    }}>
                    {n}
                  </button>
                ))}
                <span style={{ fontSize: 11, color: "#888" }}>decoder aggiuntivi</span>
              </div>
            </div>
          )}
          {pkt.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color, background: "#EBF3FB", padding: "5px 10px", borderRadius: 6 }}>
              ✓ {pkt.join(" · ")}
              {hasMult && sale.skyDec ? <span style={{ marginLeft: 6 }}>· <b>{sale.skyDec} decoder agg.</b></span> : null}
            </div>
          )}
        </div>
        {/* Tecnologia */}
        <div style={{ padding: "12px 14px", borderRadius: 8, background: "white", border: `1px solid ${color}30`, borderLeft: `3px solid ${color}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>📡 Tecnologia</div>
          <div style={{ display: "flex", gap: 8 }}>
            {SKY_TECNOLOGIA.map(t => (
              <button key={t} onClick={() => setSkyTech(catKey, si, tech === t ? "" : t)}
                style={{
                  flex: 1, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .15s",
                  border: tech === t ? `2px solid ${color}` : "2px solid #e0e0e0",
                  background: tech === t ? color : "white", color: tech === t ? "white" : "#444",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                }}>
                {t === "Parabola" ? "📡" : "🌐"} {t}
              </button>
            ))}
          </div>
        </div>
        {/* Indirizzo installazione — visibile dopo aver selezionato la tecnologia */}
        {tech && (
          <div style={{ padding: "12px 14px", borderRadius: 8, background: "white", border: `1px solid ${color}30`, borderLeft: `3px solid ${color}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>📍 Indirizzo installazione</div>
            <input type="text"
              value={sale.fields?.indirizzoInstallazione || ""}
              onChange={e => setField(catKey, si, "indirizzoInstallazione", e.target.value)}
              placeholder="es. Via Roma 1, 00100 Roma"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12, boxSizing: "border-box" }} />
          </div>
        )}
      </div>
    );
  };

  // ── Render categoria prodotti (uguale per tutti i brand) ──────────────────────
  const renderCategoria = (categoria, prodotti) => {
    const catKey = `${brand}_${categoria}`;
    const catSales = getSales(catKey);
    const catColor = CAT_COLORS[categoria] || currentBrand?.color || "#555";
    const catIcon = CAT_ICONS[categoria] || "📦";
    const filled = catSales.filter(s => s.product).length;
    const hasF = (CAT_FIELDS[categoria] || []).length > 0 || categoria === "Luce & Gas" || (categoria === "POS" && brand === "dojo");
    const isSkyTV = categoria === "Abbonamenti SKY";

    return (
      <div key={categoria} style={{ marginBottom: 16 }}>
        {/* Intestazione categoria */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>{catIcon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: catColor, textTransform: "uppercase", letterSpacing: 0.5 }}>{categoria}</span>
          {filled > 0 && <Tag c="#155724" bg="#d4edda">✓ {filled} vendita{filled === 1 ? "" : "e"}</Tag>}
        </div>

        {catSales.map((sale, si) => (
          <div key={si} style={{
            padding: 14, borderRadius: 10, marginBottom: 8,
            background: si === 0 ? "#fafbfc" : "#fff",
            borderLeft: `4px solid ${catColor}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            ...(si > 0 ? { border: `1px dashed ${catColor}`, borderLeft: `4px solid ${catColor}` } : {})
          }}>

            {/* Header vendita */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: catColor, textTransform: "uppercase", letterSpacing: 0.3 }}>
                Vendita #{si + 1}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                {si === catSales.length - 1 && (
                  <button onClick={() => addSale(catKey)}
                    style={{ padding: "4px 14px", borderRadius: 6, border: `1px solid ${catColor}`, background: "white", color: catColor, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    + Aggiungi vendita
                  </button>
                )}
                {si > 0 && (
                  <button onClick={() => removeSale(catKey, si)}
                    style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #dc3545", background: "white", color: "#dc3545", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                    ✕ Rimuovi
                  </button>
                )}
              </div>
            </div>

            {/* Riquadri prodotto */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {prodotti.map(p => {
                const sel = sale.product === p;
                return (
                  <button key={p} onClick={() => setProd(catKey, si, sel ? "" : p)}
                    style={{
                      padding: "10px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .15s",
                      border: sel ? `2px solid ${catColor}` : "2px solid #e0e0e0",
                      background: sel ? catColor : "white",
                      color: sel ? "white" : "#444",
                      boxShadow: sel ? `0 2px 6px ${catColor}44` : "none"
                    }}>
                    {p}
                  </button>
                );
              })}
            </div>

            {/* ─── MOBILE: blocco toggle pre-campi ────────────────── */}
            {sale.product && categoria === "Mobile" && (() => {
              const gc = "#2E75B6";
              const ibanAnaM = tipoCliente === "business" ? anBusiness.iban : anConsumer.iban;
              const ibanMob = sale.fields?.ibanMob || "";
              const port = sale.fields?.portMob || "";
              const domMob = sale.fields?.domMob || "";

              // Chip collassato riutilizzabile
              const chip = (tkKey, label, answer, extra, onExpand) => {
                const collapsed = collapsedToggles[tkKey] !== false;
                const isDone = !!answer;
                if (isDone && collapsed) {
                  return (
                    <div key={tkKey} onClick={onExpand} style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 8px", borderRadius: 20, background: "#EBF3FB", border: "1px solid #b8d4f0", cursor: "pointer", userSelect: "none" }}>
                      <span style={{ fontSize: 11, color: "#555" }}>{label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: answer === "Sì" ? "#28a745" : "#dc3545", background: answer === "Sì" ? "#d4edda" : "#f8d7da", padding: "1px 7px", borderRadius: 10 }}>{answer}</span>
                      {extra && <span style={{ fontSize: 10, color: "#666", fontFamily: "monospace" }}>{extra}</span>}
                      <span style={{ fontSize: 10, color: "#2E75B6" }}>✎</span>
                    </div>
                  );
                }
                return null; // render full block
              };

              const fullBlock = (tkKey, label, cur, onSet, ibanField, ibanSetKey) => {
                const collapsed = collapsedToggles[tkKey] !== false;
                const payMethVal = sale.fields?.payMeth || "";
                const isDone = !!cur && (cur === "No" || !ibanSetKey || (cur === "Sì" && (payMethVal === "CC" || (payMethVal === "IBAN" && !!ibanField))));
                // auto-collapse when done
                if (isDone && collapsed) return null; // handled by chip above
                const ibanSummary = ibanField ? "···" + ibanField.slice(-4) : null;

                // onSet wrapper that auto-collapses when complete
                const handleSet = (v) => {
                  onSet(v);
                  if (v === "No" || (!ibanSetKey && v)) collapseToggle(tkKey);
                };
                const handleIban = (v) => {
                  setField(catKey, si, ibanSetKey, v);
                };

                return (
                  <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 8, background: "#f8f9fa", border: "1px solid #cce0f5", borderLeft: `3px solid ${gc}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: gc, marginBottom: 8 }}>{label}</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: ibanSetKey && cur === "Sì" ? 10 : 0 }}>
                      {["Sì", "No"].map(v => {
                        const s = cur === v;
                        return <button key={v} onClick={() => handleSet(s ? "" : v)}
                          style={{
                            flex: 1, padding: "10px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                            border: s ? `2px solid ${gc}` : "2px solid #e0e0e0",
                            background: s ? gc : "white", color: s ? "white" : "#555"
                          }}>{v}</button>;
                      })}
                    </div>
                    {ibanSetKey && cur === "Sì" && (() => {
                      const payMeth = sale.fields?.payMeth || "";
                      const payDone = payMeth === "CC" || (payMeth === "IBAN" && !!ibanField);
                      return (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: gc, marginBottom: 8 }}>💳 Metodo di pagamento <span style={{ color: "#dc3545" }}>*</span></div>
                          <div style={{ display: "flex", gap: 8, marginBottom: payMeth === "IBAN" ? 10 : 0 }}>
                            {[["🏦 IBAN", "IBAN"], ["💳 Carta di Credito", "CC"]].map(([lbl, val]) => {
                              const sel = payMeth === val;
                              return <button key={val} onClick={() => { setField(catKey, si, "payMeth", sel ? "" : val); if (val === "CC") collapseToggle(tkKey); }}
                                style={{
                                  flex: 1, padding: "10px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                                  border: sel ? `2px solid ${gc}` : "2px solid #e0e0e0",
                                  background: sel ? gc : "white", color: sel ? "white" : "#444"
                                }}>{lbl}</button>;
                            })}
                          </div>
                          {payMeth === "IBAN" && (
                            <div>
                              {ibanAnaM && (
                                <button onClick={() => { setField(catKey, si, ibanSetKey, ibanAnaM); collapseToggle(tkKey); }}
                                  style={{
                                    marginBottom: 8, padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                                    border: `1px solid ${gc}`, background: "white", color: gc, display: "flex", alignItems: "center", gap: 6
                                  }}>
                                  📋 Copia da anagrafica {ibanField === ibanAnaM && <span style={{ color: "#28a745" }}>✓</span>}
                                </button>
                              )}
                              <input type="text" value={ibanField} onChange={e => handleIban(e.target.value)}
                                placeholder="IT00 X000 0000 0000 0000 0000 000"
                                style={{
                                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, boxSizing: "border-box", fontFamily: "monospace", letterSpacing: 1.2,
                                  border: ibanField ? "2px solid #28a745" : "1px solid #d0d0d0", background: ibanField ? "#f0fff0" : "white"
                                }} />
                              {!ibanAnaM && <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>Nessun IBAN in anagrafica — inseriscilo manualmente</div>}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              };

              if (tipoCliente === "business") {
                const kIban = `${catKey}_${si}_ibanMob`;
                const kPort = `${catKey}_${si}_portMob`;
                const payMeth = sale.fields?.payMeth || "";
                const ibanDone = payMeth === "CC" || (payMeth === "IBAN" && !!ibanMob);
                const ibanCollapsed = collapsedToggles[kIban] !== false;
                return (
                  <div>
                    {/* PayPicker block */}
                    {ibanDone && ibanCollapsed
                      ? <div onClick={() => expandToggle(kIban)} style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 8px", borderRadius: 20, background: "#EBF3FB", border: "1px solid #b8d4f0", cursor: "pointer", userSelect: "none" }}>
                        <span style={{ fontSize: 11, color: "#555" }}>{payMeth === "CC" ? "💳 Carta di Credito" : "🏦 IBAN"}</span>
                        {payMeth === "IBAN" && <span style={{ fontSize: 10, color: "#28a745", fontFamily: "monospace", fontWeight: 700 }}>···{ibanMob.slice(-4)}</span>}
                        <span style={{ fontSize: 10, color: gc }}>✎</span>
                      </div>
                      : <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 8, background: "#f8f9fa", border: "1px solid #cce0f5", borderLeft: `3px solid ${gc}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: gc, marginBottom: 8 }}>💳 Metodo di pagamento <span style={{ color: "#dc3545", fontWeight: 400 }}>*</span></div>
                        <div style={{ display: "flex", gap: 8, marginBottom: payMeth === "IBAN" ? 10 : 0 }}>
                          {[["🏦 IBAN", "IBAN"], ["💳 Carta di Credito", "CC"]].map(([lbl, val]) => {
                            const sel = payMeth === val;
                            return <button key={val} onClick={() => { setField(catKey, si, "payMeth", sel ? "" : val); if (val === "CC") collapseToggle(kIban); }}
                              style={{
                                flex: 1, padding: "10px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                                border: sel ? `2px solid ${gc}` : "2px solid #e0e0e0",
                                background: sel ? gc : "white", color: sel ? "white" : "#444"
                              }}>{lbl}</button>;
                          })}
                        </div>
                        {payMeth === "IBAN" && (<>
                          {ibanAnaM && <button onClick={() => { setField(catKey, si, "ibanMob", ibanAnaM); collapseToggle(kIban); }}
                            style={{ marginBottom: 8, padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", border: `1px solid ${gc}`, background: "white", color: gc, display: "flex", alignItems: "center", gap: 6 }}>
                            📋 Copia da anagrafica {ibanMob === ibanAnaM && <span style={{ color: "#28a745" }}>✓</span>}
                          </button>}
                          <input type="text" value={ibanMob} onChange={e => setField(catKey, si, "ibanMob", e.target.value)}
                            placeholder="IT00 X000 0000 0000 0000 0000 000"
                            style={{
                              width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, boxSizing: "border-box", fontFamily: "monospace", letterSpacing: 1.2,
                              border: ibanMob ? "2px solid #28a745" : "1px solid #d0d0d0", background: ibanMob ? "#f0fff0" : "white"
                            }} />
                          {!ibanAnaM && <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>Nessun IBAN in anagrafica</div>}
                        </>)}
                      </div>
                    }
                    {/* Portabilità */}
                    {chip(`${catKey}_${si}_portMob`, "📞 Portabilità", port, null, () => expandToggle(`${catKey}_${si}_portMob`))}
                    {fullBlock(`${catKey}_${si}_portMob`, "📞 Portabilità?", port, v => setField(catKey, si, "portMob", v), null, null)}
                  </div>
                );
              }
              // Consumer
              const kDom = `${catKey}_${si}_domMob`;
              const kPort = `${catKey}_${si}_portMob`;
              const domPayMeth = sale.fields?.payMeth || "";
              const domDone = !!domMob && (domMob === "No" || (domMob === "Sì" && (domPayMeth === "CC" || (domPayMeth === "IBAN" && !!ibanMob))));
              const ibanSummary = ibanMob ? "···" + ibanMob.slice(-4) : null;
              return (
                <div>
                  {chip(kDom, "🏦 Domiciliazione", domMob, domMob === "Sì" && ibanSummary ? ibanSummary : null, () => expandToggle(kDom))}
                  {fullBlock(kDom, "🏦 Domiciliazione?", domMob, v => setField(catKey, si, "domMob", v), ibanMob, "ibanMob")}
                  {domMob && (
                    <>
                      {chip(kPort, "📞 Portabilità", port, null, () => expandToggle(kPort))}
                      {fullBlock(kPort, "📞 Portabilità?", port, v => setField(catKey, si, "portMob", v), null, null)}
                    </>
                  )}
                </div>
              );
            })()}

            {/* ─── FISSO: blocco toggle pre-campi ─────────────────── */}
            {sale.product && categoria === "Fisso" && (() => {
              const gc = "#28a745";

              // Chip pill: mostra risposta collassata, click → espandi
              const Chip = ({ tkKey, label, answer, extra }) => (
                <div onClick={() => expandToggle(tkKey)}
                  style={{
                    marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 8px",
                    borderRadius: 20, background: "#edfaf1", border: "1px solid #b2dfca", cursor: "pointer", userSelect: "none"
                  }}>
                  <span style={{ fontSize: 11, color: "#444" }}>{label}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: answer === "Sì" ? "#155724" : "#721c24",
                    background: answer === "Sì" ? "#d4edda" : "#f8d7da",
                    padding: "1px 8px", borderRadius: 10
                  }}>{answer}</span>
                  {extra && <span style={{ fontSize: 10, color: "#555", fontFamily: "monospace" }}>{extra}</span>}
                  <span style={{ fontSize: 10, color: gc }}>✎</span>
                </div>
              );

              // Blocco toggle pieno con opzionale IBAN interno
              const TBlock = ({ tkKey, label, cur, onSet, ibanField, ibanSetKey, ibanAna }) => {
                const collapsed = collapsedToggles[tkKey] !== false;
                const isDone = !!cur && (cur === "No" || !ibanSetKey || (cur === "Sì" && !!ibanField));
                if (isDone && collapsed) return null; // mostrato come chip sopra
                const autoClose = (v) => {
                  onSet(v);
                  if (v === "No" || (!ibanSetKey && v)) collapseToggle(tkKey);
                };
                const handleIban = (v) => {
                  setField(catKey, si, ibanSetKey, v);
                };
                return (
                  <div style={{
                    marginTop: 10, padding: "12px 14px", borderRadius: 8, background: "#f8f9fa",
                    border: "1px solid #c3e6cb", borderLeft: `3px solid ${gc}`
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: gc, marginBottom: 8 }}>{label}</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: ibanSetKey && cur === "Sì" ? 10 : 0 }}>
                      {["Sì", "No"].map(v => {
                        const s = cur === v; return (
                          <button key={v} onClick={() => autoClose(s ? "" : v)}
                            style={{
                              flex: 1, padding: "10px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                              border: s ? `2px solid ${gc}` : "2px solid #e0e0e0",
                              background: s ? gc : "white", color: s ? "white" : "#555"
                            }}>{v}</button>
                        );
                      })}
                    </div>
                    {ibanSetKey && cur === "Sì" && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 6 }}>IBAN <span style={{ color: "#dc3545" }}>*</span></div>
                        {ibanAna && (
                          <button onClick={() => { setField(catKey, si, ibanSetKey, ibanAna); collapseToggle(tkKey); }}
                            style={{
                              marginBottom: 8, padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                              border: `1px solid ${gc}`, background: "white", color: gc, display: "flex", alignItems: "center", gap: 6
                            }}>
                            📋 Copia da anagrafica {ibanField === ibanAna && <span style={{ color: gc }}>✓</span>}
                          </button>
                        )}
                        <input type="text" value={ibanField || ""} onChange={e => handleIban(e.target.value)}
                          placeholder="IT00 X000 0000 0000 0000 0000 000"
                          style={{
                            width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, boxSizing: "border-box",
                            fontFamily: "monospace", letterSpacing: 1.2,
                            border: ibanField ? "2px solid #28a745" : "1px solid #d0d0d0",
                            background: ibanField ? "#f0fff0" : "white"
                          }} />
                        {!ibanAna && <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>Nessun IBAN in anagrafica — inseriscilo manualmente</div>}
                      </div>
                    )}
                  </div>
                );
              };

              // ── W3 / FASTWEB BUSINESS: Portabilità → Seconda linea → 2° Linea Port. ──
              if ((brand === "w3" || brand === "fastweb") && tipoCliente === "business") {
                const port1 = sale.fields?.portabilita || "";
                const sec = sale.fields?.secondaLinea || "";
                const port2 = sale.fields?.portabilita2 || "";
                const k1 = `${catKey}_${si}_port1`, k2 = `${catKey}_${si}_sec`, k3 = `${catKey}_${si}_port2`;
                return (
                  <div>
                    {port1 && collapsedToggles[k1] !== false && <Chip tkKey={k1} label="📞 Portabilità" answer={port1} />}
                    <TBlock tkKey={k1} label="📞 Portabilità?" cur={port1} onSet={v => setField(catKey, si, "portabilita", v)} />
                    {port1 && (<>
                      {sec && collapsedToggles[k2] !== false && <Chip tkKey={k2} label="🔌 Seconda linea" answer={sec} />}
                      <TBlock tkKey={k2} label="🔌 Seconda linea?" cur={sec} onSet={v => setField(catKey, si, "secondaLinea", v)} />
                    </>)}
                    {port1 && sec === "Sì" && (<>
                      {port2 && collapsedToggles[k3] !== false && <Chip tkKey={k3} label="📞 2° Linea Port." answer={port2} />}
                      <TBlock tkKey={k3} label="📞 2° Linea, Portabilità?" cur={port2} onSet={v => setField(catKey, si, "portabilita2", v)} />
                    </>)}
                  </div>
                );
              }

              // ── W3 CONSUMER: Domiciliazione (IBAN) → Portabilità ─────────────────
              if (brand === "w3" && tipoCliente !== "business") {
                const domFisso = sale.fields?.domFisso || "";
                const ibanFisso = sale.fields?.ibanFisso || "";
                const port1 = sale.fields?.portabilita || "";
                const ibanAnaF = anConsumer.iban;
                const kDom = `${catKey}_${si}_domF`, kPort = `${catKey}_${si}_portF`;
                const domDone = !!domFisso && (domFisso === "No" || (domFisso === "Sì" && !!ibanFisso));
                return (
                  <div>
                    {domDone && collapsedToggles[kDom] !== false &&
                      <Chip tkKey={kDom} label="🏦 Domiciliazione" answer={domFisso}
                        extra={domFisso === "Sì" && ibanFisso ? "···" + ibanFisso.slice(-4) : null} />}
                    <TBlock tkKey={kDom} label="🏦 Domiciliazione?" cur={domFisso}
                      onSet={v => setField(catKey, si, "domFisso", v)}
                      ibanField={ibanFisso} ibanSetKey="ibanFisso" ibanAna={ibanAnaF} />
                    {domFisso && (<>
                      {port1 && collapsedToggles[kPort] !== false && <Chip tkKey={kPort} label="📞 Portabilità" answer={port1} />}
                      <TBlock tkKey={kPort} label="📞 Portabilità?" cur={port1} onSet={v => setField(catKey, si, "portabilita", v)} />
                    </>)}
                  </div>
                );
              }

              // ── TUTTI GLI ALTRI BRAND (Sky, Fastweb…): solo Portabilità ──────────
              const port1 = sale.fields?.portabilita || "";
              const kPort = `${catKey}_${si}_portF`;
              return (
                <div>
                  {port1 && collapsedToggles[kPort] !== false && <Chip tkKey={kPort} label="📞 Portabilità" answer={port1} />}
                  <TBlock tkKey={kPort} label="📞 Portabilità?" cur={port1} onSet={v => setField(catKey, si, "portabilita", v)} />
                </div>
              );
            })()}

            {/* Campi post-selezione — attendono i toggle obbligatori */}
            {hasF
              // Mobile gates
              && !(categoria === "Mobile" && tipoCliente === "business" && sale.product && !sale.fields?.portMob)
              && !(categoria === "Mobile" && tipoCliente !== "business" && sale.product && (!sale.fields?.domMob || !sale.fields?.portMob))
              // Fisso gates
              && !(categoria === "Fisso" && !sale.product)
              && !((brand === "w3" || brand === "fastweb") && tipoCliente === "business" && categoria === "Fisso" && !sale.fields?.portabilita)
              && !(brand === "w3" && tipoCliente !== "business" && categoria === "Fisso" && (!sale.fields?.domFisso || !sale.fields?.portabilita))
              && !(brand !== "w3" && brand !== "fastweb" && categoria === "Fisso" && sale.product && !sale.fields?.portabilita)
              && renderCatFields(categoria, catKey, si, sale)}
            {isSkyTV && renderSkyTvFields(catKey, si, sale)}
            {!hasF && !isSkyTV && sale.product && (
              <div style={{ marginTop: 10, background: "white", borderRadius: 6, padding: "7px 12px", fontSize: 11, color: catColor, borderLeft: `2px solid ${catColor}` }}>
                ✓ Selezionato: <b>{sale.product}</b>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ── CART VIEW ──────────────────────────────────────────────────────────────
  if (showCart) {
    const curI = colItems();
    const bObj = ALL_BRANDS.find(b => b.id === brand);
    const allG = [...cart];
    if (curI.length > 0 && bObj)
      allG.push({ brandId: brand, brandLabel: bObj.label, brandColor: bObj.color, brandIcon: bObj.badge || bObj.label, items: curI, isCurrent: true });
    const tp = allG.reduce((s, g) => s + g.items.length, 0);
    const clienteLabel = tipoCliente === "privato"
      ? (anConsumer.nome + " " + anConsumer.cognome).trim() || "—"
      : anBusiness.ragioneSociale || "—";
    return (
      <div style={{ fontFamily: "Inter,-apple-system,sans-serif", background: "#f0f2f5", minHeight: "100vh", padding: 16, maxWidth: 960, margin: "0 auto" }}>
        {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#28a745", color: "#fff", padding: "12px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, boxShadow: "0 6px 20px rgba(0,0,0,.2)", zIndex: 9999 }}>{toast}</div>}
        {/* Cart header */}
        <div style={{ background: "linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)", borderRadius: 16, padding: "20px 24px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 20, marginBottom: 4 }}>🛒 Carrello ordini</div>
              <div style={{ color: "rgba(255,255,255,.6)", fontSize: 12 }}>{clienteLabel} · {lookupValue || "—"}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ background: "rgba(255,255,255,.15)", borderRadius: 10, padding: "8px 16px", textAlign: "center" }}>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 20 }}>{allG.length}</div>
                <div style={{ color: "rgba(255,255,255,.6)", fontSize: 10 }}>BRAND</div>
              </div>
              <div style={{ background: "rgba(255,255,255,.15)", borderRadius: 10, padding: "8px 16px", textAlign: "center" }}>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 20 }}>{tp}</div>
                <div style={{ color: "rgba(255,255,255,.6)", fontSize: 10 }}>PRODOTTI</div>
              </div>
            </div>
          </div>
        </div>
        {/* Cart groups */}
        {allG.length === 0
          ? <div style={{ background: "#fff", borderRadius: 12, padding: 40, textAlign: "center", color: "#999" }}>
            <div style={{ fontSize: 40 }}>🛒</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 10 }}>Carrello vuoto</div>
          </div>
          : allG.map((g, gi) => (
            <div key={gi} style={{ background: "#fff", borderRadius: 12, marginBottom: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
              <div style={{ background: g.brandColor, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{g.brandLabel}</span>
                  <span style={{ background: "rgba(255,255,255,.25)", borderRadius: 12, padding: "2px 10px", color: "#fff", fontSize: 11, fontWeight: 600 }}>{g.items.length}</span>
                  {g.isCurrent && <span style={{ background: "#FFD800", borderRadius: 12, padding: "2px 10px", color: "#333", fontSize: 10, fontWeight: 700 }}>IN CORSO</span>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => g.isCurrent ? setShowCart(false) : editCG(gi)}
                    style={{ background: "rgba(255,255,255,.25)", border: "none", borderRadius: 6, padding: "5px 14px", color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
                    ✏️ Modifica
                  </button>
                  {!g.isCurrent && (
                    <button onClick={() => rmCG(gi)}
                      style={{ background: "rgba(255,0,0,.25)", border: "none", borderRadius: 6, padding: "5px 14px", color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                      ✕ Rimuovi
                    </button>
                  )}
                </div>
              </div>
              <div style={{ padding: "6px 16px" }}>
                {g.items.map((it, ii) => <CartItem key={ii} it={it} ii={ii} gi={gi} total={g.items.length} expI={expI} setExpI={setExpI} />)}
              </div>
            </div>
          ))
        }
        {/* Cart action bar */}
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button onClick={() => setShowCart(false)}
            style={{ padding: "11px 22px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", color: "#666", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            ← Torna al form
          </button>
          <button onClick={() => { addCart(); setShowCart(false); }}
            style={{ padding: "11px 22px", borderRadius: 10, border: "2px solid #6f42c1", background: "#F3EEFB", color: "#6f42c1", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            + Aggiungi altro brand
          </button>
          <button onClick={finalSubmit} disabled={tp === 0}
            style={{ padding: "11px 36px", borderRadius: 10, border: "none", background: tp > 0 ? "linear-gradient(135deg,#28a745,#20c997)" : "#ccc", color: "#fff", fontSize: 14, fontWeight: 800, cursor: tp > 0 ? "pointer" : "not-allowed", marginLeft: "auto" }}>
            📨 Invia tutto ({tp} prodotti)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Inter,-apple-system,sans-serif", padding: 16, maxWidth: 960, margin: "0 auto" }}>

      {/* TOAST */}
      {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#28a745", color: "#fff", padding: "12px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, boxShadow: "0 6px 20px rgba(0,0,0,.2)", zIndex: 9999 }}>{toast}</div>}

      {/* HEADER */}
      <div style={{ background: "linear-gradient(135deg,#1B3A5C 0%,#2E75B6 100%)", borderRadius: 12, padding: "14px 20px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: "rgba(255,255,255,0.2)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📋</div>
          <div>
            <div style={{ color: "white", fontWeight: 700, fontSize: 16 }}>CRM — Inserimento Contratto</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              Multi-Brand · v5.5
              {venditore && <Pill>👤 {venditore}</Pill>}
              {tipoCliente && <Pill>{tipoCliente === "privato" ? "👤 Consumer" : "🏢 Business"}</Pill>}
              {currentBrand && <Pill>🏷 {currentBrand.label}</Pill>}
              {/* PROGRESS */}
              <div style={{ display: "flex", gap: 3, marginBottom: 16 }}>
                {STEP_LABELS.map((s, i) => {
                  const n = i + 1, done = n < step, active = n === step;
                  return (
                    <div key={i} onClick={() => done && setStep(n)}
                      style={{
                        flex: 1, textAlign: "center", padding: "7px 4px", borderRadius: 6, fontSize: 9, fontWeight: 600,
                        background: active ? "#2E75B6" : done ? "#28a745" : "#e9ecef",
                        color: active || done ? "white" : "#aaa", cursor: done ? "pointer" : "default",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                      }}>
                      {done ? "✓ " : ""}{s}
                    </div>
                  );
                })}
              </div>

              {/* CART BAR — visibile quando il carrello ha qualcosa */}
              {cart.length > 0 && (
                <div onClick={() => setShowCart(true)}
                  style={{ background: "linear-gradient(90deg,#1a1a2e,#16213e)", borderRadius: 10, padding: "10px 16px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span>🛒</span>
                    <span style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>Carrello:</span>
                    {cart.map((g, i) => (
                      <span key={i} style={{ background: g.brandColor, color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
                        {g.brandLabel} ({g.items.length})
                      </span>
                    ))}
                  </div>
                  <span style={{ color: "rgba(255,255,255,.5)", fontSize: 11 }}>Vedi → </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PROGRESS */}
        <div style={{ display: "flex", gap: 3, marginBottom: 16 }}>
          {STEP_LABELS.map((s, i) => {
            const n = i + 1, done = n < step, active = n === step;
            return (
              <div key={i} onClick={() => done && setStep(n)}
                style={{
                  flex: 1, textAlign: "center", padding: "7px 4px", borderRadius: 6, fontSize: 9, fontWeight: 600,
                  background: active ? "#2E75B6" : done ? "#28a745" : "#e9ecef",
                  color: active || done ? "white" : "#aaa", cursor: done ? "pointer" : "default",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                }}>
                {done ? "✓ " : ""}{s}
              </div>
            );
          })}
        </div>

        {/* ══ STEP 1 ══ */}
        {step === 1 && (
          <StepCard title="Step 1 — Venditore" color="#e83e8c" icon="👤">
            <div style={{ maxWidth: 360 }}>
              <Label text="Seleziona il tuo nome" required note="Pre-compilato dal login" />
              <select value={venditore} onChange={e => setVenditore(e.target.value)}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 8, fontSize: 13,
                  border: venditore ? "2px solid #28a745" : "1px solid #d0d0d0", background: venditore ? "#f0fff0" : "white"
                }}>
                <option value="">— Seleziona venditore —</option>
                {VENDITORI.map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <NavBar onNext={goNext} canNext={canProceed()} isFirst />
          </StepCard>
        )}

        {/* ══ STEP 2 ══ */}
        {step === 2 && (
          <StepCard title="Step 2 — Tipo Cliente e Anagrafica" color="#6f42c1" icon="🧑‍💼">
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              {[{ id: "privato", icon: "👤", label: "Consumer", desc: "Persona fisica" }, { id: "business", icon: "🏢", label: "Business", desc: "Azienda / P.IVA" }].map(o => (
                <button key={o.id}
                  onClick={() => { setTipoCliente(o.id); setLookupDone(false); setClienteFound(false); setLookupValue(""); setBrand(null); setAllSales({}); }}
                  style={{
                    flex: 1, padding: 12, borderRadius: 10,
                    border: tipoCliente === o.id ? "2px solid #6f42c1" : "2px solid #e8e8e8",
                    background: tipoCliente === o.id ? "#F3EEFB" : "white", cursor: "pointer", textAlign: "center"
                  }}>
                  <div style={{ fontSize: 22, marginBottom: 2 }}>{o.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: tipoCliente === o.id ? "#6f42c1" : "#333" }}>{o.label}</div>
                  <div style={{ fontSize: 10, color: "#999", marginTop: 1 }}>{o.desc}</div>
                </button>
              ))}
            </div>
            {tipoCliente && (
              <div style={{ background: "#f8f9fa", borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 8 }}>
                  {tipoCliente === "privato" ? "Codice Fiscale — ricerca cliente esistente" : "Partita IVA — ricerca cliente esistente"}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" placeholder={tipoCliente === "privato" ? "Es. Rssmra80a01h501u" : "Es. 12345678901"}
                    value={lookupValue} onChange={e => setLookupValue(e.target.value)}
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #d0d0d0", fontSize: 13, fontFamily: "monospace", letterSpacing: 1.5 }} />
                  <button onClick={() => { setClienteFound(true); setLookupDone(true); }}
                    style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#6f42c1", color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🔍 Cerca</button>
                  <button onClick={() => { setClienteFound(false); setLookupDone(true); }}
                    style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc", background: "white", color: "#555", fontSize: 12, cursor: "pointer" }}>👤 Nuovo</button>
                </div>
                {clienteFound && <div style={{ marginTop: 8, background: "#d4edda", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#155724" }}>✅ Cliente trovato! Dati pre-compilati.</div>}
                {lookupDone && !clienteFound && <div style={{ marginTop: 8, background: "#fff3cd", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#856404" }}>👤 Nuovo cliente — compila i dati manualmente.</div>}
              </div>
            )}
            {tipoCliente === "privato" && lookupDone && (
              <div>
                <SectionTitle>📝 Dati Anagrafici <Tag c="#6f42c1" bg="#F3EEFB">Consumer</Tag></SectionTitle>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
                  <AField label="Nome" required value={anConsumer.nome} onChange={v => setAnConsumer(p => ({ ...p, nome: v }))} pf={clienteFound} ph="es. Mario" />
                  <AField label="Cognome" required value={anConsumer.cognome} onChange={v => setAnConsumer(p => ({ ...p, cognome: v }))} pf={clienteFound} ph="es. Rossi" />
                  <AField label="Codice Fiscale" required value={anConsumer.cf} onChange={v => setAnConsumer(p => ({ ...p, cf: v }))} pf={clienteFound} ph="Rssmra80a01h501u" mono />
                  <AField label="Email" value={anConsumer.email} onChange={v => setAnConsumer(p => ({ ...p, email: v }))} pf={clienteFound} ph="mario.rossi@email.com" />
                  <AField label="Numero Fisso" value={anConsumer.numeroFisso} onChange={v => setAnConsumer(p => ({ ...p, numeroFisso: v }))} pf={clienteFound} ph="06 1234567" />
                  <AField label="Recapito Cellulare" value={anConsumer.cellulare} onChange={v => setAnConsumer(p => ({ ...p, cellulare: v }))} pf={clienteFound} ph="333 1234567" />
                  <AField label="IBAN" value={anConsumer.iban} onChange={v => setAnConsumer(p => ({ ...p, iban: v }))} pf={clienteFound} ph="It00..." mono span2 />
                  <AField label="Domicilio" value={anConsumer.domicilio} onChange={v => setAnConsumer(p => ({ ...p, domicilio: v }))} pf={clienteFound} ph="Via, Numero, CAP, Città" span2 />
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 3 }}>Note</div>
                    <textarea value={anConsumer.note} onChange={e => setAnConsumer(p => ({ ...p, note: e.target.value }))} placeholder="Note..." rows={3}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>
            )}
            {tipoCliente === "business" && lookupDone && (
              <div>
                <SectionTitle>📝 Dati Anagrafici <Tag c="#6f42c1" bg="#F3EEFB">Business</Tag></SectionTitle>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
                  <AField label="Ragione Sociale" required value={anBusiness.ragioneSociale} onChange={v => setAnBusiness(p => ({ ...p, ragioneSociale: v }))} pf={clienteFound} ph="Rossi S.r.l." />
                  <AField label="Partita IVA" required value={anBusiness.piva} onChange={v => setAnBusiness(p => ({ ...p, piva: v }))} pf={clienteFound} ph="12345678901" mono />
                  <AField label="Referente" required value={anBusiness.referente} onChange={v => setAnBusiness(p => ({ ...p, referente: v }))} pf={clienteFound} ph="Mario Rossi" />
                  <AField label="Numero Fisso" value={anBusiness.numeroFisso} onChange={v => setAnBusiness(p => ({ ...p, numeroFisso: v }))} pf={clienteFound} ph="06 1234567" />
                  <AField label="Numero Mobile" value={anBusiness.mobile} onChange={v => setAnBusiness(p => ({ ...p, mobile: v }))} pf={clienteFound} ph="333 1234567" />
                  <AField label="Email" value={anBusiness.email} onChange={v => setAnBusiness(p => ({ ...p, email: v }))} pf={clienteFound} ph="info@rossi.it" />
                  <AField label="Pec" value={anBusiness.pec} onChange={v => setAnBusiness(p => ({ ...p, pec: v }))} pf={clienteFound} ph="azienda@pec.it" />
                  <AField label="Codice Univoco / SDI" value={anBusiness.codiceUnivoco} onChange={v => setAnBusiness(p => ({ ...p, codiceUnivoco: v }))} pf={clienteFound} ph="Abc1234" mono />
                  <AField label="IBAN" value={anBusiness.iban} onChange={v => setAnBusiness(p => ({ ...p, iban: v }))} pf={clienteFound} ph="It00..." mono span2 />
                  <AField label="Sede Legale" value={anBusiness.sedeLegale} onChange={v => setAnBusiness(p => ({ ...p, sedeLegale: v }))} pf={clienteFound} ph="Via, Numero, CAP, Città" span2 />
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 3 }}>Note</div>
                    <textarea value={anBusiness.note} onChange={e => setAnBusiness(p => ({ ...p, note: e.target.value }))} placeholder="Note..." rows={3}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>
            )}
            <NavBar onBack={goBack} onNext={goNext} canNext={canProceed()} />
          </StepCard>
        )}

        {/* ══ STEP 3 ══ */}
        {step === 3 && (
          <StepCard title="Step 3 — Seleziona Brand" color="#2E75B6" icon="🏷️">
            {tipoCliente === "business" && (
              <div style={{ background: "#F3EEFB", borderRadius: 6, padding: "6px 12px", fontSize: 11, color: "#6f42c1", marginBottom: 12, fontWeight: 600 }}>
                🏢 Modalità Business — tutti i brand disponibili incluso Dojo
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {visibleBrands.map(b => (
                <button key={b.id} onClick={() => { setBrand(b.id); setAllSales({}); }}
                  style={{
                    padding: "14px 12px", borderRadius: 10, textAlign: "left",
                    border: brand === b.id ? `2px solid ${b.color}` : "2px solid #e8e8e8",
                    background: brand === b.id ? b.bg : "white", cursor: "pointer", transition: "all .15s"
                  }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: brand === b.id ? b.color : "#333" }}>{b.label}</span>
                    <span style={{ fontSize: 9, background: brand === b.id ? b.color : "#eee", color: brand === b.id ? "white" : "#999", padding: "2px 6px", borderRadius: 3, fontWeight: 700 }}>{b.badge}</span>
                  </div>
                  <div style={{ fontSize: 9, color: "#999", lineHeight: 1.5, marginBottom: 4 }}>{b.desc}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {b.onlyBusiness && <Tag c="#6f42c1" bg="#F3EEFB">🔒 Solo Business</Tag>}
                    {brand === b.id && <Tag c="#155724" bg="#d4edda">✓ Selezionato</Tag>}
                  </div>
                </button>
              ))}
            </div>
            <NavBar onBack={goBack} onNext={goNext} canNext={canProceed()} />
          </StepCard>
        )}

        {/* ══ STEP 4 — PRODOTTI (identico per tutti i brand) ══ */}
        {step === 4 && (
          <StepCard title="Step 4 — Prodotti" color={currentBrand?.color || "#2E75B6"} icon="📂"
            badge={`${currentBrand?.label} · ${tipoCliente === "business" ? "Business" : "Consumer"}`}>
            {Object.keys(brandProdotti).length > 0
              ? Object.entries(brandProdotti).map(([cat, prods]) => renderCategoria(cat, prods))
              : (
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🚧</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#666" }}>Nessun prodotto configurato per questo profilo.</div>
                </div>
              )
            }
            <NavBar onBack={goBack} onNext={goNext} canNext />
          </StepCard>
        )}

        {/* ══ STEP 5 ══ */}
        {step === 5 && (
          <StepCard title="Step 5 — Allegati" color="#17a2b8" icon="📎">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[{ label: "Documento d'identità", icon: "🪪" }, { label: "Contratti", icon: "📄" }, { label: "Altro", icon: "📁" }].map(a => (
                <div key={a.label} style={{ border: "2px dashed #ccc", borderRadius: 10, padding: "20px 12px", textAlign: "center", background: "#fafbfc", cursor: "pointer" }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>{a.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#333", marginBottom: 4 }}>{a.label}</div>
                  <div style={{ fontSize: 10, color: "#999", marginBottom: 10 }}>Trascina o clicca</div>
                  <div style={{ display: "inline-block", padding: "6px 16px", borderRadius: 6, background: "#17a2b8", color: "white", fontSize: 11, fontWeight: 600 }}>Carica file</div>
                </div>
              ))}
            </div>
            <NavBar onBack={goBack} onNext={goNext} canNext />
          </StepCard>
        )}

        {/* ══ STEP 6 ══ */}
        {step === 6 && (
          <StepCard title="Step 6 — Note / Promemoria" color="#e83e8c" icon="📝">
            <NoteStep />
            <div style={{ background: "#f8f9fa", borderRadius: 8, padding: 14, marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#333", marginBottom: 10, textTransform: "uppercase" }}>🏪 Attribuzione vendita</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
                <div>
                  <Label text="Negozio" required note="Pre-compilato dal login" />
                  <select style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12 }}>
                    <option value="">— Seleziona negozio —</option>
                    {NEGOZI.map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <Label text="Data Vendita" required note="Default: oggi" />
                  <input type="date" defaultValue="2026-03-07"
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12, boxSizing: "border-box" }} />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 16, paddingTop: 14, borderTop: "1px solid #f0f0f0", flexWrap: "wrap" }}>
              <button onClick={goBack} style={{ padding: "9px 22px", borderRadius: 8, border: "1px solid #ccc", background: "white", color: "#555", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>← Torna indietro</button>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={addCart}
                  style={{ padding: "9px 20px", borderRadius: 8, border: "2px solid #6f42c1", background: "#F3EEFB", color: "#6f42c1", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  📦 Aggiungi e cambia brand
                </button>
                <button onClick={() => setShowCart(true)}
                  style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  🛒 Carrello{tCI > 0 ? " (" + tCI + ")" : ""}
                </button>
                <button onClick={finalSubmit}
                  style={{ padding: "9px 28px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#28a745,#20c997)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px rgba(40,167,69,0.3)" }}>
                  📨 Invia tutto
                </button>
              </div>
            </div>
          </StepCard>
        )}

        {/* FOOTER */}
        <div style={{ background: "#EBF3FB", borderRadius: 10, padding: 12, border: "1px solid #BDD9F2", marginTop: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#1B3A5C", marginBottom: 4 }}>V5.5 — STRUTTURA UNIFICATA TUTTI I BRAND · LUCE & GAS ACCORPATE · MENU A COMPARSA INTEGRATO</div>
          <div style={{ fontSize: 10, color: "#2E75B6", lineHeight: 1.8 }}>
            <div>• Tutti i brand usano la stessa struttura: riquadri prodotto → campi MENU A COMPARSA → più vendite per categoria</div>
            <div>• W3: Mobile · Fisso · Luce &amp; Gas (accorpate, selezione 💡Luce / 🔥Gas) · Multi-Servizi</div>
            <div>• Sky Abbonamenti: prodotto → Pacchetti TV → Multivision (decoder) → Tecnologia (Parabola/Fibra)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function StepCard({ title, color, icon, badge, children }) {
  return (
    <div style={{ background: "white", borderRadius: 10, padding: 16, marginBottom: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 14, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {icon} {title}
        {badge && <span style={{ fontSize: 10, fontWeight: 400, color: "#999", background: "#f0f0f0", padding: "2px 8px", borderRadius: 4, textTransform: "none" }}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function NavBar({ onBack, onNext, canNext, isFirst }) {
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: isFirst ? "flex-end" : "space-between", marginTop: 20, paddingTop: 14, borderTop: "1px solid #f0f0f0" }}>
      {!isFirst && <button onClick={onBack} style={{ padding: "9px 22px", borderRadius: 8, border: "1px solid #ccc", background: "white", color: "#555", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>← Torna indietro</button>}
      <button onClick={onNext} disabled={!canNext}
        style={{
          padding: "9px 26px", borderRadius: 8, border: "none",
          background: canNext ? "linear-gradient(135deg,#1B3A5C,#2E75B6)" : "#ccc",
          color: "white", fontSize: 13, fontWeight: 700, cursor: canNext ? "pointer" : "not-allowed",
          boxShadow: canNext ? "0 2px 6px rgba(46,117,182,0.3)" : "none"
        }}>
        Vai avanti →
      </button>
    </div>
  );
}

function Label({ text, required, note }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 3 }}>
      {text}{required && <span style={{ color: "#dc3545" }}> *</span>}
      {note && <span style={{ fontSize: 10, fontWeight: 400, color: "#999", marginLeft: 6 }}>{note}</span>}
    </div>
  );
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: "#444", marginBottom: 12, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>{children}</div>;
}

function Tag({ c, bg, children }) {
  return <span style={{ fontSize: 9, fontWeight: 700, color: c, background: bg, padding: "1px 6px", borderRadius: 4 }}>{children}</span>;
}

function Pill({ children }) {
  return <span style={{ background: "rgba(255,255,255,0.2)", padding: "2px 7px", borderRadius: 4 }}>{children}</span>;
}

function AField({ label, required, value, onChange, pf, ph, mono, span2 }) {
  return (
    <div style={span2 ? { gridColumn: "1 / -1" } : {}}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 3 }}>
        {label}{required && <span style={{ color: "#dc3545" }}> *</span>}
      </div>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={ph}
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12, boxSizing: "border-box",
          fontFamily: mono ? "monospace" : "inherit", letterSpacing: mono ? 1.2 : 0,
          border: pf && value ? "2px solid #28a745" : "1px solid #d0d0d0",
          background: pf && value ? "#f0fff0" : "white"
        }} />
    </div>
  );
}

function NoteStep() {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: show ? 16 : 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 10 }}>Vuoi aggiungere una nota o fissare un promemoria?</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={() => setShow(true)} style={{ padding: "8px 28px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: show ? "2px solid #28a745" : "2px solid #e0e0e0", background: show ? "#d4edda" : "white", color: show ? "#155724" : "#666" }}>Sì</button>
          <button onClick={() => setShow(false)} style={{ padding: "8px 28px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: !show ? "2px solid #dc3545" : "2px solid #e0e0e0", background: !show ? "#f8d7da" : "white", color: !show ? "#721c24" : "#666" }}>No</button>
        </div>
      </div>
      {show && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
          <div style={{ border: "1px solid #e0e0e0", borderRadius: 10, padding: 14, background: "#fafbfc" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>📋</span>
              <div><div style={{ fontSize: 13, fontWeight: 700 }}>Nota</div><div style={{ fontSize: 10, color: "#999" }}>Archiviata nella vendita</div></div>
            </div>
            <textarea placeholder="Scrivi una nota..." rows={3}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ border: "1px solid #e0e0e0", borderRadius: 10, padding: 14, background: "#fafbfc" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>📅</span>
              <div><div style={{ fontSize: 13, fontWeight: 700 }}>Promemoria</div><div style={{ fontSize: 10, color: "#999" }}>Fissa nel calendario</div></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><Label text="Data" /><input type="date" style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12, boxSizing: "border-box" }} /></div>
              <div><Label text="Ora" /><input type="time" style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12, boxSizing: "border-box" }} /></div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <Label text="Negozio" />
              <select style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12, background: "#f0fff0" }}>
                {["Magliana", "Donna", "Libia", "Collatina", "Mazzini", "San Paolo", "Garbatella", "Promontori", "Acilia", "Baleniere", "Castani", "Merulana", "Telefonico"].map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <Label text="Descrizione" />
              <textarea placeholder="es. Ritiro documenti..." rows={2}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d0d0d0", fontSize: 12, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
