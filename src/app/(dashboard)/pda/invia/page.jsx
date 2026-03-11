"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, ShoppingBag, User, Check, ChevronLeft, ChevronRight, Plus, Trash2, Archive, HelpCircle, Info, LayoutGrid, Clock, Calendar, ExternalLink, MoreVertical, ChevronUp, ChevronDown } from "lucide-react";
import { calculateCF, _CNA, _PNA } from "@/lib/cf";

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
      "Fisso": ["Business Light", "Business", "Business Plus", "Business Pro", "Fisso SME"],
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
    { key: "operatoreDon", label: "Operatore di provenienza", type: "select", opts: [], fallbackOpts: "DONOR_MOBILE", required: true },
    { key: "numeroMnp", label: "Numero Telefono MNP", type: "text", ph: "es. 3331234567" },
    { key: "serialeDon", label: "Seriale SIM Donating", type: "text", ph: "893910..." },
    { key: "device", label: "Device", type: "text", ph: "es. Samsung S25" },
    { key: "serviziDig", label: "Servizi Digitali", type: "text", ph: "es. Disney+" },
  ],
  "Fisso": [
    { key: "indirizzoImp", label: "Indirizzo Impianto", type: "text", ph: "es. Via Roma 1, 00100 Roma", required: true, span2: true },
    { key: "operatoreDon", label: "Operatore di provenienza", type: "select", opts: [], fallbackOpts: "DONOR_FISSO", required: true },
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
    { key: "fornitPrec", label: "Operatore di provenienza", type: "select", opts: [], fallbackOpts: "DONOR_LUCE_GAS" },
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
  ],
  "Multi-servizi": [],
  "Abbonamenti SKY": [],
  "POS": [],
};

// Sezioni Luce & Gas: diviso visivamente
const LUCE_GAS_SECTIONS = [
  { title: "💡 Luce", keys: ["tipologiaC", "indirizzoF", "fornitPrec", "pod", "potenzaImp", "tensione", "destinazL", "consumoL", "residente"] },
  { title: "🔥 Gas", keys: ["tipologiaC", "indirizzoF", "fornitPrec", "pdr", "tipologiaUso", "destinazG", "consumoG"] },
];

// Sky
const SKY_TV_PRODUCTS = ["Sky TV", "Sky Glass", "Sky Uffici", "Sky Bar", "Sky Hotel", "Sky B&B"];
const SKY_PACCHETTI = ["Netflix", "Cinema", "Calcio", "Sport", "Multivision", "4K"];
const SKY_TECNOLOGIA = ["Parabola", "Fibra"];

const CAT_ICONS = { "Mobile": "📱", "Fisso": "🏠", "Luce & Gas": "⚡", "Multi-servizi": "🛡️", "Abbonamenti SKY": "📺", "POS": "💳" };
const CAT_COLORS = { "Mobile": "#2E75B6", "Fisso": "#28a745", "Luce & Gas": "#fd7e14", "Multi-servizi": "#6f42c1", "Abbonamenti SKY": "#0072CE", "POS": "#6f42c1" };

const DONOR_MOBILE = ["", "TIM", "Vodafone", "WindTre", "Iliad", "Fastweb Mobile", "PosteMobile", "ho. Mobile", "Kena Mobile", "Very Mobile", "CoopVoce", "Spusu", "Lyca Mobile", "1Mobile", "Tiscali Mobile", "Digi Mobil", "Noitel", "Optima Mobile", "Feder Mobile", "Rabona Mobile", "Elimobile", "BT Italia", "Segnoverde Mobile", "Uno Mobile", "Saily", "Visitel", "Ops! Mobile"];
const DONOR_FISSO = ["", "TIM", "Vodafone", "WindTre", "Fastweb", "Iliad", "Tiscali", "Aruba", "PosteMobile", "Vianova", "Linkem", "Eolo", "BT Italia", "Retelit", "Unidata", "Uno Communications"];
const DONOR_LUCE_GAS = ["", "Enel Energia", "Eni Plenitude", "A2A Energia", "Iren", "Hera Comm", "Edison", "Sorgenia", "E.ON", "Illumia", "Engie", "Optima", "Wekiwi", "Estra", "Axpo", "Iberdrola", "Acea Energia", "Servizio Elettrico Nazionale", "Altro"];

const STEP_LABELS = ["Venditore", "Cliente", "Brand", "Prodotti"];

// W3 GA Consumer offerte per tipologia+easypay key
const MOB_OFFERS = {
  "Underground_Sì": ["EP LOCAL"],
  "Underground_No": ["RIC LOCAL"],
  "Mass Market_Sì": ["SPECIAL 5G", "START UNLIMITED 5G", "UNLIMITED 5G", "UNLIMITED PRO 5G", "UNLIMITED 5G SUPER FIBRA", "FAMILY UNLIMITED 200", "MULTISERVICE", "SUPER 5G UNDER 14 6.99", "SUPER 5G UNDER 14 9.99", "CYC UNLIMITED PLUS", "CYC UNLIMITED SUPER", "CYC UNLIMITED ULTRA", "CYC UNLIMITED FULL", "PACK 5G RELOAD EXCHANGE", "GIGA SPECIAL"],
  "Mass Market_No": ["SPECIAL 5G", "START UNLIMITED 5G", "UNLIMITED 5G", "UNLIMITED PRO 5G", "UNLIMITED 5G SUPER FIBRA", "FAMILY UNLIMITED 200", "MULTISERVICE", "SUPER 5G UNDER 14 6.99", "SUPER 5G UNDER 14 9.99", "CYC UNLIMITED PLUS", "CYC UNLIMITED SUPER", "CYC UNLIMITED ULTRA", "CYC UNLIMITED FULL", "PACK 5G RELOAD EXCHANGE", "GIGA 150 5G", "GIGA 250 5G", "GIGA UNLIMITED 5G", "GIGA START&STOP", "SMART SECURITY"],
};
const CB_TNP_VALS = ["Rata 0", "Finanziamento 0", "Rata >0", "Finanziamento >0"];
const CB_CAMBIO_VALS = ["Caring", "CL0", "CL1", "CL1 EP", "CL2", "CL2 EP", "CL3", "CL3 EP", "Migrazione FTTH"];
const CB_ADDON_VALS = ["Add-on", "Security Ric", "Security EP", "Security Pro Ric", "Security Pro EP", "Home Protect Fisso", "Netflix Fisso"];


// ── CartItem ──────────────────────────────────────────────────────────────────
// ── CartItem ──────────────────────────────────────────────────────────────────
function CartItem({ it, ii, gi, total, expI, setExpI }) {
  const exp = expI[gi + "_" + ii];
  const dets = it.details ? Object.entries(it.details).filter(([k, v]) => v && k !== "hasContract" && v !== "null") : [];

  return (
    <div className={`py-4 ${ii < total - 1 ? "border-b border-white/5" : ""}`}>
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-lg border border-white/10 group-hover:scale-110 transition-transform">
          {it.macroIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/5 border border-white/5" style={{ color: it.macroColor }}>
              {it.macro}
            </span>
            <span className="text-slate-600 text-[10px]">#V-{it.saleNum}</span>
          </div>
          <h4 className="text-sm font-bold text-white truncate">{it.sub}</h4>
        </div>
        <button
          onClick={() => setExpI(p => ({ ...p, [gi + "_" + ii]: !p[gi + "_" + ii] }))}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${exp ? "bg-violet-500 text-white shadow-lg" : "bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5"}`}
        >
          {exp ? <ChevronUp className="w-3 h-3" /> : <Search className="w-3 h-3" />}
          {exp ? "Chiudi" : "Dettagli"}
        </button>
      </div>

      {exp && (
        <div className="mt-4 ml-14 animate-in slide-in-from-top-2 fade-in duration-200">
          <div className="glass-panel p-4 bg-white/[0.02] border-white/5 relative overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {dets.length > 0 ? (
                dets.map(([k, v]) => (
                  <div key={k} className="space-y-1">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{k}</span>
                    <div className="text-xs text-slate-200 font-medium break-all">{String(v)}</div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-4 text-center text-[10px] text-slate-500 uppercase font-black tracking-[0.2em]">Nessun dettaglio extra</div>
              )}
            </div>
            <div className="absolute top-0 right-0 p-2 opacity-5 scale-150 rotate-12 pointer-events-none">
              <LayoutGrid className="w-12 h-12" />
            </div>
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
  const [negozio, setNegozio] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  const [tipoCliente, setTipoCliente] = useState(null);
  const [lookupValue, setLookupValue] = useState("");
  const [clienteFound, setClienteFound] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [anConsumer, setAnConsumer] = useState({ nome: "", cognome: "", cf: "", email: "", numeroFisso: "", cellulare: "", iban: "", domicilio: "", note: "" });
  const [anBusiness, setAnBusiness] = useState({ ragioneSociale: "", piva: "", referente: "", numeroFisso: "", mobile: "", email: "", pec: "", codiceUnivoco: "", iban: "", sedeLegale: "", note: "" });

  const [brand, setBrand] = useState(null);

  const [showCF, setShowCF] = useState(false);
  const [cfD, setCfD] = useState({ nome: "", cognome: "", sesso: "M", giorno: "", mese: "", anno: "", comune: "", estero: false, paese: "" });


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

  const doCF = () => {
    const cf = calculateCF(cfD);
    if (cf) {
      setAnConsumer(p => ({
        ...p,
        cf,
        nome: cfD.nome.charAt(0).toUpperCase() + cfD.nome.slice(1).toLowerCase(),
        cognome: cfD.cognome.charAt(0).toUpperCase() + cfD.cognome.slice(1).toLowerCase()
      }));
      setLookupValue(cf);
      setShowCF(false);
      showToast("✅ Codice Fiscale calcolato: " + cf);
    } else {
      showToast("❌ Dati incompleti per il calcolo");
    }
  };


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
    setCart([]); setShowCart(false); setExpI({}); setConfirmReset(false);
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
  const goNext = () => { if (canProceed() && step < 4) setStep(s => s + 1); };
  const goBack = () => { if (step > 1) setStep(s => s - 1); };

  // ── Render campi MENU A COMPARSA ─────────────────────────────────────────────
  const renderCatFields = (categoria, catKey, si, sale) => {
    if (!sale.product) return null;
    const color = CAT_COLORS[categoria] || "#2E75B6";

    // Luce & Gas Special rendering
    if (categoria === "Luce & Gas") {
      const isLuce = brand === "fastweb" || sale.product === "Luce" || sale.product?.toUpperCase().includes("LUCE");
      const subKeys = isLuce ? ["tipologiaC", "indirizzoF", "fornitPrec", "pod", "potenzaImp", "tensione", "destinazL", "consumoL", "residente"] : ["tipologiaC", "indirizzoF", "fornitPrec", "pdr", "tipologiaUso", "destinazG", "consumoG"];
      const fields = CAT_FIELDS["Luce & Gas"].filter(f => subKeys.includes(f.key));
      const ibanAna = tipoCliente === "business" ? anBusiness.iban : anConsumer.iban;
      const ibanLG = sale.fields?.ibanLG || "";

      return (
        <div className="mt-4 p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-6">
          {(brand === "w3" || brand === "energy") && (
            <div className="pb-6 border-b border-white/5 space-y-4">
              <div>
                <Label text="🏦 Domiciliazione?" color={color} />
                <div className="flex gap-3 mt-2">
                  {["Sì", "No"].map(opt => (
                    <button
                      key={opt}
                      onClick={() => {
                        setField(catKey, si, "domiciliazione", sale.fields?.domiciliazione === opt ? "" : opt);
                        if (opt === "No") {
                          setField(catKey, si, "payMeth", "");
                          setField(catKey, si, "ibanLG", "");
                        }
                      }}
                      className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${sale.fields?.domiciliazione === opt ? "bg-emerald-500 text-white shadow-lg" : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {sale.fields?.domiciliazione === "Sì" && (
                <div className="pt-4 border-t border-white/5 animate-in fade-in duration-200">
                  <Label text="💳 Metodo di pagamento *" color={color} />
                  <div className="flex gap-3 mt-2">
                    {[["🏦 IBAN", "IBAN"], ["💳 Carta di Credito", "CC"]].map(([lbl, val]) => (
                      <button
                        key={val}
                        onClick={() => setField(catKey, si, "payMeth", sale.fields?.payMeth === val ? "" : val)}
                        className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${sale.fields?.payMeth === val ? "bg-emerald-500 text-white shadow-lg" : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>

                  {sale.fields?.payMeth === "IBAN" && (
                    <div className="mt-4 flex gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                      <input
                        type="text"
                        value={ibanLG}
                        onChange={e => setField(catKey, si, "ibanLG", e.target.value)}
                        placeholder="IT00 X000 0000 0000 0000 0000 000"
                        className="flex-1 glass-input text-xs font-mono py-2.5 px-4 rounded-xl focus:border-emerald-500/50"
                      />
                      {ibanAna && (
                        <button onClick={() => setField(catKey, si, "ibanLG", ibanAna)} className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-[10px] font-bold uppercase transition-all hover:bg-emerald-500/20 flex items-center gap-2">
                          📋 Copia Ana
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {brand === "fastweb" && (
            <div className="pb-6 border-b border-white/5">
              <Label text="Metodo di Pagamento dal Carrello / IBAN" required />
              <div className="flex gap-3 mt-3">
                <input
                  type="text"
                  value={ibanLG}
                  onChange={e => setField(catKey, si, "ibanLG", e.target.value)}
                  placeholder="IT00 X000 0000 0000 0000 0000 000"
                  className="flex-1 glass-input text-xs font-mono py-2.5 px-4 rounded-xl"
                />
                {ibanAna && (
                  <button onClick={() => setField(catKey, si, "ibanLG", ibanAna)} className="px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-xl text-[10px] font-bold uppercase transition-all hover:bg-emerald-500/20">
                    📋 Copia Ana
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {fields.map(f => (
              <div key={f.key} className={f.span2 ? 'md:col-span-2' : ''}>
                <Label text={f.label} required={f.required} />
                {f.type === "select" ? (
                  <select
                    value={sale.fields?.[f.key] || ""}
                    onChange={e => setField(catKey, si, f.key, e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-slate-300 outline-none focus:border-violet-500/50"
                  >
                    {(f.fallbackOpts === "DONOR_MOBILE" ? DONOR_MOBILE : f.fallbackOpts === "DONOR_FISSO" ? DONOR_FISSO : f.fallbackOpts === "DONOR_LUCE_GAS" ? DONOR_LUCE_GAS : f.opts).map(o => <option key={o} value={o}>{o || "— Seleziona —"}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={sale.fields?.[f.key] || ""}
                    onChange={e => setField(catKey, si, f.key, e.target.value)}
                    placeholder={f.ph}
                    className="w-full glass-input rounded-xl py-2.5 px-4 text-sm"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Dojo POS — custom fields, nothing in CAT_FIELDS
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
          <div className="mb-4">
            <Label text={label} required />
            <div className="flex items-center gap-3 mt-2">
              <button onClick={() => setField(catKey, si, fieldKey, clamp(value - step, min, max, step).toFixed(decimals))}
                disabled={!canDec}
                className={`w-9 h-9 rounded-lg flex items-center justify-center text-xl font-bold transition-all ${canDec ? `bg-violet-500/10 text-violet-400 border border-violet-500/20` : "bg-white/5 text-slate-600 border border-white/10 cursor-not-allowed"}`}>
                −
              </button>
              <div className="flex-1">
                <div className="text-center mb-1">
                  <span className="text-xl font-extrabold text-violet-400">{value.toFixed(decimals)}</span>
                  <span className="text-xs text-slate-500 ml-1">{unit}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 relative">
                  <div className="h-1.5 rounded-full bg-violet-500 transition-all duration-150" style={{ width: `${pctVal}%` }} />
                  <div className="absolute top-[-4px] w-3.5 h-3.5 rounded-full bg-violet-500 border-2 border-white/10 shadow-lg shadow-violet-500/30" style={{ left: `calc(${pctVal}% - 7px)` }} />
                </div>
                <div className="flex justify-between mt-1 text-[9px] text-slate-600">
                  <span>{min.toFixed(decimals)} {unit}</span><span>{max.toFixed(decimals)} {unit}</span>
                </div>
              </div>
              <button onClick={() => setField(catKey, si, fieldKey, clamp(value + step, min, max, step).toFixed(decimals))}
                disabled={!canInc}
                className={`w-9 h-9 rounded-lg flex items-center justify-center text-xl font-bold transition-all ${canInc ? `bg-violet-500/10 text-violet-400 border border-violet-500/20` : "bg-white/5 text-slate-600 border border-white/10 cursor-not-allowed"}`}>
                +
              </button>
            </div>
          </div>
        );
      };
      return (
        <div className="mt-4 p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-6">
          <div>
            <Label text="Indirizzo installazione" required />
            <input type="text" className="glass-input mt-2" value={addr}
              onChange={e => setField(catKey, si, "dojoAddr", e.target.value)}
              placeholder="es. Via Roma 1, 00100 Roma" />
          </div>
          <Stepper label="Costo mensile" value={cost} min={COST_MIN} max={COST_MAX} step={COST_STEP} fieldKey="dojoCost" unit="€/mese" decimals={2} />
          <Stepper label="Commissione transazioni" value={comm} min={COMM_MIN} max={COMM_MAX} step={COMM_STEP} fieldKey="dojoComm" unit="%" decimals={2} />
        </div>
      );
    }

    // ── FASTWEB BUSINESS FISSO SME — multi-line flow ────────────────
    if (brand === "fastweb" && tipoCliente === "business" && sale.product === "Fisso SME") {
      const smeColor = "#00A651";
      const ibanAnaS = anBusiness.iban;
      const numLinee = parseInt(sale.fields?.smeLinee || "2", 10);
      const numPort = parseInt(sale.fields?.smePort || "0", 10);
      const smeIban = sale.fields?.smeIban || "";
      const smeAddr = sale.fields?.smeAddr || "";
      const smePayM = sale.fields?.payMeth || "";

      // Generic Stepper for SME
      const SmeStep = ({ label, value, min, max, fieldKey }) => {
        const canDec = value > min;
        const canInc = value < max;
        const pctVal = ((value - min) / (max - min)) * 100;
        return (
          <div className="mb-4">
            <Label text={label} required color={smeColor} />
            <div className="flex items-center gap-3 mt-2">
              <button onClick={() => canDec && setField(catKey, si, fieldKey, String(value - 1))}
                disabled={!canDec}
                className={`w-9 h-9 rounded-lg flex items-center justify-center text-xl font-bold transition-all ${canDec ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-white/5 text-slate-600 border border-white/10 cursor-not-allowed"}`}>
                −
              </button>
              <div className="flex-1">
                <div className="text-center mb-1">
                  <span className="text-xl font-extrabold text-emerald-400">{value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 relative">
                  <div className="h-1.5 rounded-full bg-emerald-500 transition-all duration-150" style={{ width: `${pctVal}%` }} />
                  <div className="absolute top-[-4px] w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white/10 shadow-lg shadow-emerald-500/30" style={{ left: `calc(${pctVal}% - 7px)` }} />
                </div>
                <div className="flex justify-between mt-1 text-[9px] text-slate-600">
                  <span>Min {min}</span><span>Max {max}</span>
                </div>
              </div>
              <button onClick={() => canInc && setField(catKey, si, fieldKey, String(value + 1))}
                disabled={!canInc}
                className={`w-9 h-9 rounded-lg flex items-center justify-center text-xl font-bold transition-all ${canInc ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-white/5 text-slate-600 border border-white/10 cursor-not-allowed"}`}>
                +
              </button>
            </div>
          </div>
        );
      };

      const lineeSet = !!sale.fields?.smeLinee;
      const portSet = !!sale.fields?.smePort;
      const payDone = smePayM === "CC" || (smePayM === "IBAN" && !!smeIban);

      return (
        <div className="mt-4 p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-6">
          <SmeStep label="📊 Numero di linee totali" value={numLinee} min={2} max={8} fieldKey="smeLinee" />

          {lineeSet && (
            <div className="pt-4 border-t border-white/5 animate-in fade-in duration-200">
              <SmeStep label="📞 Linee in portabilità" value={Math.min(numPort, numLinee)} min={0} max={numLinee} fieldKey="smePort" />
            </div>
          )}

          {lineeSet && portSet && (
            <div className="pt-4 border-t border-white/5 animate-in fade-in duration-200">
              <Label text="💳 Metodo di pagamento *" color={smeColor} />
              <div className="flex gap-3 mt-2">
                {[["🏦 IBAN", "IBAN"], ["💳 Carta di Credito", "CC"]].map(([lbl, val]) => (
                  <button key={val} onClick={() => setField(catKey, si, "payMeth", smePayM === val ? "" : val)}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${smePayM === val ? "bg-emerald-500 text-white shadow-lg" : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"}`}>
                    {lbl}
                  </button>
                ))}
              </div>
              {smePayM === "IBAN" && (
                <div className="mt-4 flex gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <input type="text" value={smeIban} onChange={e => setField(catKey, si, "smeIban", e.target.value)}
                    placeholder="IT00 X000 0000 0000 0000 0000 000"
                    className="flex-1 glass-input text-xs font-mono py-2.5 px-4 rounded-xl focus:border-emerald-500/50" />
                  {ibanAnaS && (
                    <button onClick={() => setField(catKey, si, "smeIban", ibanAnaS)}
                      className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-[10px] font-bold uppercase transition-all hover:bg-emerald-500/20 flex items-center gap-2">
                      📋 Copia Ana
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {lineeSet && portSet && payDone && (
            <div className="pt-4 border-t border-white/5 animate-in fade-in duration-200">
              <Label text="📍 Indirizzo installazione" required />
              <input type="text" value={smeAddr} onChange={e => setField(catKey, si, "smeAddr", e.target.value)}
                placeholder="es. Via Roma 1, 00100 Roma"
                className="glass-input mt-2" />
            </div>
          )}

          {lineeSet && portSet && payDone && numPort > 0 && (
            <div className="pt-4 border-t border-white/5 animate-in fade-in duration-200">
              <div className="mb-6">
                <Label text="Operatore di provenienza" required color={smeColor} />
                <select
                  value={sale.fields?.smeOperatoreDon || ""}
                  onChange={e => setField(catKey, si, "smeOperatoreDon", e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-slate-300 outline-none focus:border-emerald-500/50 mt-2"
                >
                  {DONOR_FISSO.map(o => <option key={o} value={o}>{o || "— Seleziona —"}</option>)}
                </select>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-4 px-2">
                📞 Dati portabilità per {numPort} linee
              </div>
              <div className="space-y-4">
                {Array.from({ length: numPort }, (_, li) => {
                  const gnpKey = `smeGnp${li + 1}`;
                  const migrKey = `smeMigr${li + 1}`;
                  return (
                    <div key={li} className="p-4 rounded-xl bg-black/20 border border-white/5 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-3 text-[50px] font-black italic text-white/[0.02] leading-none pointer-events-none group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">
                        {li + 1}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                        <div>
                          <Label text="N. Telefono (GNP)" />
                          <input type="text" value={sale.fields?.[gnpKey] || ""} onChange={e => setField(catKey, si, gnpKey, e.target.value)}
                            placeholder="es. 02 1234567" className="glass-input mt-2" />
                        </div>
                        <div>
                          <Label text="Codice Migrazione" />
                          <input type="text" value={sale.fields?.[migrKey] || ""} onChange={e => setField(catKey, si, migrKey, e.target.value)}
                            placeholder="es. MIGR123456" className="glass-input mt-2" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    // ── W3 Consumer Mobile: GA + CB flow ──────────────────────────────────────
    if (categoria === "Mobile" && brand === "w3" && tipoCliente !== "business") {
      const isGa = sale.product && !sale.product.toUpperCase().includes("CB");
      const isCb = sale.product && sale.product.toUpperCase().includes("CB");
      const tipMob = sale.fields?.tipMob || null;
      const mnp = sale.fields?.mnp || null;
      const easyPay = sale.fields?.easyPay || null;
      const offerta = sale.fields?.offerta || "";
      const isUnd = tipMob === "Underground";
      const mnpLocked = isUnd ? true : null;
      const showMnp = tipMob !== null;
      const showEP = tipMob !== null && (isUnd || mnp !== null);
      const mobDone = tipMob !== null && (isUnd || mnp !== null) && easyPay !== null;
      const offerKey = tipMob && easyPay ? `${tipMob}_${easyPay === true || easyPay === "Sì" ? "Sì" : "No"}` : null;
      const offers = offerKey ? (MOB_OFFERS[offerKey] || []) : [];

      // CB-flow state
      const hasTnp = sale.fields?.cbHasTnp || null;
      const tnpVal = sale.fields?.cbTnpVal || "";
      const hasCambio = sale.fields?.cbHasCambio || null;
      const cambioVal = sale.fields?.cbCambioVal || "";
      const addons = sale.fields?.cbAddons || {};

      const MiniBtn = ({ val, active, onClick, color = "#2E75B6" }) => (
        <button onClick={onClick}
          className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${active ? "text-white shadow-lg" : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"
            }`}
          style={active ? { background: color } : {}}>
          {val}
        </button>
      );

      return (
        <div className="mt-4 p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-6">

          {/* GA flow */}
          {(isGa || !isCb) && (
            <div className="space-y-4">
              {/* Step 1: Tipologia */}
              <div>
                <Label text="📡 Tipologia Mobile" required color={color} />
                <div className="flex gap-3 mt-2">
                  {["Underground", "Mass Market"].map(opt => (
                    <MiniBtn key={opt} val={opt} active={tipMob === opt} color={color}
                      onClick={() => {
                        setField(catKey, si, "tipMob", tipMob === opt ? null : opt);
                        if (opt !== tipMob) {
                          setField(catKey, si, "mnp", opt === "Underground" ? true : null);
                          setField(catKey, si, "easyPay", null);
                          setField(catKey, si, "offerta", "");
                        }
                      }} />
                  ))}
                </div>
              </div>

              {/* Step 2: MNP */}
              {showMnp && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <Label text="🔄 MNP (Portabilità)?" required color={color} />
                  <div className="flex gap-3 mt-2">
                    {isUnd ? (
                      <div className="flex-1 py-2.5 px-4 rounded-xl text-sm font-bold text-white shadow-lg text-center" style={{ background: color }}>Sì (fisso Underground)</div>
                    ) : (
                      ["Sì", "No"].map(opt => (
                        <MiniBtn key={opt} val={opt} active={mnp === opt} color={color}
                          onClick={() => { setField(catKey, si, "mnp", mnp === opt ? null : opt); setField(catKey, si, "easyPay", null); setField(catKey, si, "offerta", ""); }} />
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Easy Pay */}
              {showEP && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <Label text="💳 Easy Pay?" required color={color} />
                  <div className="flex gap-3 mt-2">
                    {["Sì", "No"].map(opt => (
                      <MiniBtn key={opt} val={opt} active={easyPay === opt} color={color}
                        onClick={() => { setField(catKey, si, "easyPay", easyPay === opt ? null : opt); setField(catKey, si, "offerta", ""); }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Step 4: Offerta */}
              {mobDone && offers.length > 0 && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <Label text="📦 Offerta Mobile" required color={color} />
                  <select value={offerta} onChange={e => setField(catKey, si, "offerta", e.target.value)}
                    className="w-full mt-2 bg-black/40 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-slate-300 outline-none focus:border-blue-500/50">
                    <option value="">— Seleziona offerta —</option>
                    {offers.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              )}

              {/* Security when EasyPay = No */}
              {mobDone && (easyPay === "No") && (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 animate-in fade-in duration-200">
                  <Label text="🛡️ Security" color={color} />
                  <div className="flex gap-3 mt-2">
                    {["Security", "Security PRO"].map(s => (
                      <button key={s}
                        onClick={() => { const cur = sale.fields?.security || ""; setField(catKey, si, "security", cur === s ? "" : s); }}
                        className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${sale.fields?.security === s ? "text-white shadow-lg" : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"
                          }`}
                        style={sale.fields?.security === s ? { background: "#fd7e14" } : {}}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Common Mobile fields (Seriale SIM, Device etc) always shown if tipMob set */}
              {tipMob && (
                <div className="pt-4 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-200">
                  {CAT_FIELDS["Mobile"].filter(f => ["serialeSim", "device", "serviziDig"].includes(f.key)).map(f => (
                    <div key={f.key}>
                      <Label text={f.label} required={f.required} />
                      <input type="text" value={sale.fields?.[f.key] || ""} onChange={e => setField(catKey, si, f.key, e.target.value)}
                        placeholder={f.ph} className="glass-input mt-2" />
                    </div>
                  ))}
                  {(mnp === "Sì" || isUnd) && (
                    <>
                      <div>
                        <Label text="Operatore di provenienza" required />
                        <select value={sale.fields?.operatoreDon || ""} onChange={e => setField(catKey, si, "operatoreDon", e.target.value)}
                          className="w-full mt-2 bg-black/40 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-slate-300 outline-none focus:border-blue-500/50">
                          {DONOR_MOBILE.map(o => <option key={o} value={o}>{o || "— Seleziona —"}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label text="N. Telefono MNP" />
                        <input type="text" value={sale.fields?.numeroMnp || ""} onChange={e => setField(catKey, si, "numeroMnp", e.target.value)}
                          placeholder="es. 3331234567" className="glass-input mt-2" />
                      </div>
                      <div>
                        <Label text="Seriale SIM Donating" />
                        <input type="text" value={sale.fields?.serialeDon || ""} onChange={e => setField(catKey, si, "serialeDon", e.target.value)}
                          placeholder="893910..." className="glass-input mt-2" />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* CB flow */}
          {isCb && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <Label text="📱 TNP (Terminale Nuovo Prodotto)?" color={color} />
                <div className="flex gap-3 mt-2">
                  {["Sì", "No"].map(opt => (
                    <MiniBtn key={opt} val={opt} active={hasTnp === opt} color={color}
                      onClick={() => setField(catKey, si, "cbHasTnp", hasTnp === opt ? null : opt)} />
                  ))}
                </div>
                {hasTnp === "Sì" && (
                  <div className="mt-3 animate-in fade-in duration-200">
                    <select value={tnpVal} onChange={e => setField(catKey, si, "cbTnpVal", e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-slate-300 outline-none">
                      <option value="">— Tipo rata —</option>
                      {CB_TNP_VALS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <Label text="🔄 Cambio Offerta?" color={color} />
                <div className="flex gap-3 mt-2">
                  {["Sì", "No"].map(opt => (
                    <MiniBtn key={opt} val={opt} active={hasCambio === opt} color={color}
                      onClick={() => setField(catKey, si, "cbHasCambio", hasCambio === opt ? null : opt)} />
                  ))}
                </div>
                {hasCambio === "Sì" && (
                  <div className="mt-3 animate-in fade-in duration-200">
                    <select value={cambioVal} onChange={e => setField(catKey, si, "cbCambioVal", e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-slate-300 outline-none">
                      <option value="">— Tipo cambio —</option>
                      {CB_CAMBIO_VALS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <Label text="➕ Add-on" color={color} />
                <div className="flex flex-wrap gap-2 mt-2">
                  {CB_ADDON_VALS.map(a => (
                    <button key={a}
                      onClick={() => { const cur = { ...addons }; cur[a] = !cur[a]; setField(catKey, si, "cbAddons", cur); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${addons[a] ? "text-white shadow" : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"
                        }`}
                      style={addons[a] ? { background: color } : {}}>
                      {addons[a] ? "✓ " : ""}{a}
                    </button>
                  ))}
                </div>
              </div>

              {/* Common fields */}
              <div className="pt-4 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-4">
                {CAT_FIELDS["Mobile"].filter(f => ["serialeSim", "device"].includes(f.key)).map(f => (
                  <div key={f.key}>
                    <Label text={f.label} required={f.required} />
                    <input type="text" value={sale.fields?.[f.key] || ""} onChange={e => setField(catKey, si, f.key, e.target.value)}
                      placeholder={f.ph} className="glass-input mt-2" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Default rendering for other categories
    let fields = CAT_FIELDS[categoria];
    if (!fields || fields.length === 0) return null;
    // Mobile (non-W3): rimuovi MNP e Donating se Portabilità = No
    if (categoria === "Mobile") {
      if (sale.fields?.portMob === "No") {
        fields = fields.filter(f => f.key !== "numeroMnp" && f.key !== "serialeDon" && f.key !== "operatoreDon");
      }
    }
    if (categoria === "Fisso") {
      // Nascondi Linea 1 (GNP + migrazione) se portabilità = No
      if (sale.fields?.portabilita === "No") {
        fields = fields.filter(f => f.key !== "gnpLinea1" && f.key !== "codMigr1" && f.key !== "operatoreDon");
      }

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

    const ibanAnaG = tipoCliente === "business" ? anBusiness.iban : anConsumer.iban;
    const ibanFW = sale.fields?.ibanFW || "";
    const ibanSky3P = sale.fields?.ibanSky3P || "";

    return (
      <div className="mt-4 p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-6">
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
              className="mb-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 cursor-pointer select-none">
              <span className="text-xs text-slate-300">{payMeth === "CC" ? "💳 Carta di Credito" : "🏦 IBAN"}</span>
              {payMeth === "IBAN" && <span className="text-[10px] text-emerald-400 font-mono font-bold">···{ibanW3B.slice(-4)}</span>}
              <span className="text-[10px] text-emerald-400">✎</span>
            </div>
          );
          return (
            <div className="pb-6 border-b border-white/5">
              <Label text="Metodo di pagamento" required color="#28a745" />
              <div className="flex gap-3 mt-3">
                {[["🏦 IBAN", "IBAN"], ["💳 Carta di Credito", "CC"]].map(([lbl, val]) => {
                  const sel = payMeth === val;
                  return <button key={val} onClick={() => { setField(catKey, si, "payMeth", sel ? "" : val); if (val === "CC") collapseToggle(kIban); }}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${sel ? "bg-emerald-500 text-white" : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"}`}>
                    {lbl}
                  </button>;
                })}
              </div>
              {payMeth === "IBAN" && (
                <div className="mt-4">
                  {ibanBus && (
                    <button onClick={() => { setField(catKey, si, "ibanW3B", ibanBus); collapseToggle(kIban); }}
                      className="mb-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 transition-all hover:bg-emerald-500/20 flex items-center gap-2">
                      📋 Copia da anagrafica {ibanW3B === ibanBus && <span className="text-emerald-400">✓</span>}
                    </button>
                  )}
                  <input type="text" className="glass-input text-xs font-mono" value={ibanW3B}
                    onChange={e => setField(catKey, si, "ibanW3B", e.target.value)}
                    placeholder="IT00 X000 0000 0000 0000 0000 000" />
                  {!ibanBus && <p className="text-[10px] text-slate-500 mt-1">Nessun IBAN in anagrafica — inseriscilo manualmente</p>}
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
              className="mb-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 cursor-pointer select-none">
              <span className="text-xs text-slate-300">{payMeth === "CC" ? "💳 Carta di Credito" : "🏦 IBAN"}</span>
              {payMeth === "IBAN" && <span className="text-[10px] text-sky-400 font-mono font-bold">···{ibanSky3P.slice(-4)}</span>}
              <span className="text-[10px] text-sky-400">✎</span>
            </div>
          );
          return (
            <div className="pb-6 border-b border-white/5">
              <Label text="Metodo di pagamento" required color="#0072CE" />
              <div className="flex gap-3 mt-3">
                {[["🏦 IBAN", "IBAN"], ["💳 Carta di Credito", "CC"]].map(([lbl, val]) => {
                  const sel = payMeth === val;
                  return <button key={val} onClick={() => { setField(catKey, si, "payMeth", sel ? "" : val); if (val === "CC") collapseToggle(kIban); }}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${sel ? "bg-sky-500 text-white" : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"}`}>
                    {lbl}
                  </button>;
                })}
              </div>
              {payMeth === "IBAN" && (
                <div className="mt-4">
                  {ibanAnaG && (
                    <button onClick={() => { setField(catKey, si, "ibanSky3P", ibanAnaG); collapseToggle(kIban); }}
                      className="mb-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20 transition-all hover:bg-sky-500/20 flex items-center gap-2">
                      📋 Copia da anagrafica {ibanSky3P === ibanAnaG && <span className="text-emerald-400">✓</span>}
                    </button>
                  )}
                  <input type="text" className="glass-input text-xs font-mono" value={ibanSky3P}
                    onChange={e => setField(catKey, si, "ibanSky3P", e.target.value)}
                    placeholder="IT00 X000 0000 0000 0000 0000 000" />
                  {!ibanAnaG && <p className="text-[10px] text-slate-500 mt-1">Nessun IBAN in anagrafica — inseriscilo manualmente</p>}
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
              className="mb-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 cursor-pointer select-none">
              <span className="text-xs text-slate-300">{payMeth === "CC" ? "💳 Carta di Credito" : "🏦 IBAN"}</span>
              {payMeth === "IBAN" && <span className="text-[10px] text-emerald-400 font-mono font-bold">···{ibanFW.slice(-4)}</span>}
              <span className="text-[10px] text-emerald-400">✎</span>
            </div>
          );
          return (
            <div className="pb-6 border-b border-white/5">
              <Label text="Metodo di pagamento" required color="#00A651" note="Richiesto da Fastweb" />
              <div className="flex gap-3 mt-3">
                {[["🏦 IBAN", "IBAN"], ["💳 Carta di Credito", "CC"]].map(([lbl, val]) => {
                  const sel = payMeth === val;
                  return <button key={val} onClick={() => { setField(catKey, si, "payMeth", sel ? "" : val); if (val === "CC") collapseToggle(kIban); }}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${sel ? "bg-emerald-500 text-white" : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"}`}>
                    {lbl}
                  </button>;
                })}
              </div>
              {payMeth === "IBAN" && (
                <div className="mt-4">
                  {ibanAnaG && (
                    <button onClick={() => { setField(catKey, si, "ibanFW", ibanAnaG); collapseToggle(kIban); }}
                      className="mb-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 transition-all hover:bg-emerald-500/20 flex items-center gap-2">
                      📋 Copia da anagrafica {ibanFW === ibanAnaG && <span className="text-emerald-400">✓</span>}
                    </button>
                  )}
                  <input type="text" className="glass-input text-xs font-mono" value={ibanFW}
                    onChange={e => setField(catKey, si, "ibanFW", e.target.value)}
                    placeholder="IT00 X000 0000 0000 0000 0000 000" />
                  {!ibanAnaG && <p className="text-[10px] text-slate-500 mt-1">Nessun IBAN in anagrafica — inseriscilo manualmente</p>}
                </div>
              )}
            </div>
          );
        })()}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {fields.map(f => (
            <div key={f.key} className={f.span2 ? 'md:col-span-2' : ''}>
              <Label text={f.label} required={f.required} />
              {f.type === "select" ? (
                <SearchableSelect
                  options={f.opts.filter(Boolean)}
                  value={sale.fields?.[f.key] || ""}
                  onChange={v => setField(catKey, si, f.key, v)}
                  placeholder="— Seleziona —"
                />
              ) : (
                <input
                  type="text"
                  value={sale.fields?.[f.key] || ""}
                  onChange={e => setField(catKey, si, f.key, e.target.value)}
                  placeholder={f.ph}
                  className="w-full glass-input rounded-xl py-2.5 px-4 text-sm"
                />
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
      <div className="mt-4 space-y-6">
        {/* Pacchetti */}
        <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
          <Label text="Pacchetti TV" color={color} />
          <div className="flex flex-wrap gap-3 mt-3">
            {SKY_PACCHETTI.map(p => {
              const sel = pkt.includes(p);
              return (
                <button key={p} onClick={() => toggleSkyPkt(catKey, si, p)}
                  className={`py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${sel ? "bg-sky-500 text-white" : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"}`}>
                  {p}
                </button>
              );
            })}
          </div>
          {/* Decoder aggiuntivi se Multivision */}
          {hasMult && (
            <div className="mt-4 p-4 rounded-xl bg-sky-500/10 border border-sky-500/20">
              <Label text="Quanti decoder aggiuntivi? (Multivision)" color={color} />
              <div className="flex items-center gap-3 mt-3">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setSkyDec(catKey, si, sale.skyDec === String(n) ? "" : String(n))}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold transition-all ${sale.skyDec === String(n) ? "bg-sky-500 text-white" : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"}`}>
                    {n}
                  </button>
                ))}
                <span className="text-sm text-slate-500">decoder aggiuntivi</span>
              </div>
            </div>
          )}
          {pkt.length > 0 && (
            <div className="mt-4 text-sm text-sky-400 bg-sky-500/10 px-3 py-2 rounded-lg border border-sky-500/20">
              ✓ {pkt.join(" · ")}
              {hasMult && sale.skyDec ? <span className="ml-1">· <b className="font-bold">{sale.skyDec} decoder agg.</b></span> : null}
            </div>
          )}
        </div>
        {/* Tecnologia */}
        <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
          <Label text="Tecnologia" color={color} />
          <div className="flex gap-3 mt-3">
            {SKY_TECNOLOGIA.map(t => (
              <button key={t} onClick={() => setSkyTech(catKey, si, tech === t ? "" : t)}
                className={`flex-1 py-3 px-4 rounded-xl text-base font-bold transition-all ${tech === t ? "bg-sky-500 text-white" : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"} flex items-center justify-center gap-2`}>
                {t === "Parabola" ? "📡" : "🌐"} {t}
              </button>
            ))}
          </div>
        </div>
        {/* Indirizzo installazione — visibile dopo aver selezionato la tecnologia */}
        {tech && (
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
            <Label text="Indirizzo installazione" color={color} />
            <input type="text" className="glass-input mt-2"
              value={sale.fields?.indirizzoInstallazione || ""}
              onChange={e => setField(catKey, si, "indirizzoInstallazione", e.target.value)}
              placeholder="es. Via Roma 1, 00100 Roma" />
          </div>
        )}
      </div>
    );
  };

  // ── Render categoria prodotti (uguale per tutti i brand) ──────────────────────
  const renderCategoria = (categoria, prodotti) => {
    const catColor = CAT_COLORS[categoria] || "#2E75B6";
    const catIcon = CAT_ICONS[categoria] || "📦";
    const catKey = brand + "_" + categoria;
    const sales = getSales(catKey);
    const hasF = !!CAT_FIELDS[categoria]?.length || categoria === "Luce & Gas" || (categoria === "POS" && brand === "dojo");
    const isSkyTV = categoria === "Abbonamenti SKY";

    return (
      <div key={categoria} className="glass-panel p-6 border-l-4" style={{ borderLeftColor: catColor }}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-xl">{catIcon}</span>
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">{categoria}</h3>
          </div>
          <button onClick={() => addSale(catKey)} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-bold text-slate-400 uppercase rounded-lg transition-all">
            <span>➕</span> Aggiungi {categoria}
          </button>
        </div>

        <div className="space-y-4">
          {sales.map((sale, si) => (
            <div key={si} className="relative p-5 rounded-2xl bg-white/[0.02] border border-white/5 group">
              {sales.length > 1 && (
                <button onClick={() => removeSale(catKey, si)} className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center bg-rose-500/10 text-rose-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-500 hover:text-white text-xs">✕</button>
              )}

              <div className="mb-2">
                <Label text={`Prodotto ${si + 1}`} required />
                <div className="flex flex-wrap gap-3 mt-3">
                  {prodotti.map(p => {
                    const sel = sale.product === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setProd(catKey, si, sel ? "" : p)}
                        style={sel ? { backgroundColor: catColor, borderColor: catColor, color: "white" } : {}}
                        className={`py-2.5 px-5 rounded-xl text-sm font-bold transition-all border ${sel
                          ? "shadow-lg shadow-black/20"
                          : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white"
                          }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
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
                      <div key={tkKey} onClick={onExpand} className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 cursor-pointer select-none">
                        <span className="text-xs text-slate-300">{label}</span>
                        <span className={`text-[10px] font-bold ${answer === "Sì" ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"} px-2 py-0.5 rounded-full`}>{answer}</span>
                        {extra && <span className="text-[10px] text-slate-500 font-mono">{extra}</span>}
                        <span className="text-[10px] text-blue-400">✎</span>
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
                  // const ibanSummary = ibanField ? "···" + ibanField.slice(-4) : null; // Not used here, but good for debugging

                  // onSet wrapper that auto-collapses when complete
                  const handleSet = (v) => {
                    onSet(v);
                    if (v === "No" || (!ibanSetKey && v)) collapseToggle(tkKey);
                  };
                  const handleIban = (v) => {
                    setField(catKey, si, ibanSetKey, v);
                  };

                  return (
                    <div className="mt-3 p-5 rounded-2xl bg-white/[0.03] border border-white/5">
                      <Label text={label} color={gc} />
                      <div className="flex gap-3 mt-3">
                        {["Sì", "No"].map(v => {
                          const s = cur === v;
                          return <button key={v} onClick={() => handleSet(s ? "" : v)}
                            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${s ? "bg-blue-500 text-white" : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"}`}>
                            {v}
                          </button>;
                        })}
                      </div>
                      {ibanSetKey && cur === "Sì" && (() => {
                        const payMeth = sale.fields?.payMeth || "";
                        // const payDone = payMeth === "CC" || (payMeth === "IBAN" && !!ibanField); // Not used here
                        return (
                          <div className="mt-4">
                            <Label text="Metodo di pagamento" required color={gc} />
                            <div className="flex gap-3 mt-3">
                              {[["🏦 IBAN", "IBAN"], ["💳 Carta di Credito", "CC"]].map(([lbl, val]) => {
                                const sel = payMeth === val;
                                return <button key={val} onClick={() => { setField(catKey, si, "payMeth", sel ? "" : val); if (val === "CC") collapseToggle(tkKey); }}
                                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${sel ? "bg-blue-500 text-white" : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"}`}>
                                  {lbl}
                                </button>;
                              })}
                            </div>
                            {payMeth === "IBAN" && (
                              <div className="mt-4">
                                {ibanAnaM && (
                                  <button onClick={() => { setField(catKey, si, ibanSetKey, ibanAnaM); collapseToggle(tkKey); }}
                                    className="mb-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 transition-all hover:bg-blue-500/20 flex items-center gap-2">
                                    📋 Copia da anagrafica {ibanField === ibanAnaM && <span className="text-emerald-400">✓</span>}
                                  </button>
                                )}
                                <input type="text" className="glass-input text-xs font-mono" value={ibanField} onChange={e => handleIban(e.target.value)}
                                  placeholder="IT00 X000 0000 0000 0000 0000 000" />
                                {!ibanAnaM && <p className="text-[10px] text-slate-500 mt-1">Nessun IBAN in anagrafica — inseriscilo manualmente</p>}
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
                  const payMeth = sale.fields?.payMeth || "";
                  const ibanDone = payMeth === "CC" || (payMeth === "IBAN" && !!ibanMob);
                  const ibanCollapsed = collapsedToggles[kIban] !== false;
                  return (
                    <div className="mt-4">
                      {/* PayPicker block */}
                      {ibanDone && ibanCollapsed
                        ? <div onClick={() => expandToggle(kIban)} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 cursor-pointer select-none">
                          <span className="text-xs text-slate-300">{payMeth === "CC" ? "💳 Carta di Credito" : "🏦 IBAN"}</span>
                          {payMeth === "IBAN" && <span className="text-[10px] text-blue-400 font-mono font-bold">···{ibanMob.slice(-4)}</span>}
                          <span className="text-[10px] text-blue-400">✎</span>
                        </div>
                        : <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5">
                          <Label text="Metodo di pagamento" required color={gc} />
                          <div className="flex gap-3 mt-3">
                            {[["🏦 IBAN", "IBAN"], ["💳 Carta di Credito", "CC"]].map(([lbl, val]) => {
                              const sel = payMeth === val;
                              return <button key={val} onClick={() => { setField(catKey, si, "payMeth", sel ? "" : val); if (val === "CC") collapseToggle(kIban); }}
                                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${sel ? "bg-blue-500 text-white" : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"}`}>
                                {lbl}
                              </button>;
                            })}
                          </div>
                          {payMeth === "IBAN" && (<div className="mt-4">
                            {ibanAnaM && <button onClick={() => { setField(catKey, si, "ibanMob", ibanAnaM); collapseToggle(kIban); }}
                              className="mb-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 transition-all hover:bg-blue-500/20 flex items-center gap-2">
                              📋 Copia da anagrafica {ibanMob === ibanAnaM && <span className="text-emerald-400">✓</span>}
                            </button>}
                            <input type="text" className="glass-input text-xs font-mono" value={ibanMob} onChange={e => setField(catKey, si, "ibanMob", e.target.value)}
                              placeholder="IT00 X000 0000 0000 0000 0000 000" />
                            {!ibanAnaM && <p className="text-[10px] text-slate-500 mt-1">Nessun IBAN in anagrafica</p>}
                          </div>)}
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
                  <div className="mt-4">
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
                    className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 cursor-pointer select-none">
                    <span className="text-xs text-slate-300">{label}</span>
                    <span className={`text-[10px] font-bold ${answer === "Sì" ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"} px-2 py-0.5 rounded-full`}>{answer}</span>
                    {extra && <span className="text-[10px] text-slate-500 font-mono">{extra}</span>}
                    <span className="text-[10px] text-emerald-400">✎</span>
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
                    <div className="mt-3 p-5 rounded-2xl bg-white/[0.03] border border-white/5">
                      <Label text={label} color={gc} />
                      <div className="flex gap-3 mt-3">
                        {["Sì", "No"].map(v => {
                          const s = cur === v; return (
                            <button key={v} onClick={() => autoClose(s ? "" : v)}
                              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${s ? "bg-emerald-500 text-white" : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"}`}>
                              {v}
                            </button>
                          );
                        })}
                      </div>
                      {ibanSetKey && cur === "Sì" && (
                        <div className="mt-4">
                          <Label text="IBAN" required />
                          {ibanAna && (
                            <button onClick={() => { setField(catKey, si, ibanSetKey, ibanAna); collapseToggle(tkKey); }}
                              className="mb-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 transition-all hover:bg-emerald-500/20 flex items-center gap-2">
                              📋 Copia da anagrafica {ibanField === ibanAna && <span className="text-emerald-400">✓</span>}
                            </button>
                          )}
                          <input type="text" className="glass-input text-xs font-mono" value={ibanField || ""} onChange={e => handleIban(e.target.value)}
                            placeholder="IT00 X000 0000 0000 0000 0000 000" />
                          {!ibanAna && <p className="text-[10px] text-slate-500 mt-1">Nessun IBAN in anagrafica — inseriscilo manualmente</p>}
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
                    <div className="mt-4">
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
                    <div className="mt-4">
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
                  <div className="mt-4">
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
                <div className="mt-4 bg-white/[0.03] rounded-lg p-3 text-sm" style={{ color: catColor, borderLeft: `2px solid ${catColor}` }}>
                  ✓ Selezionato: <b className="font-bold">{sale.product}</b>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };


  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 text-slate-300">
      {/* TOAST */}
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#28a745", color: "#fff", padding: "12px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, boxShadow: "0 6px 20px rgba(0,0,0,.2)", zIndex: 9999 }}>
          {toast}
        </div>
      )}

      {/* HEADER DASHBOARD */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Inserimento Contratto</h1>
          <p className="sr-only">v5.5</p>
          <div className="flex items-center gap-2 text-sm text-slate-400 font-medium">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 uppercase tracking-wider text-[10px] font-bold text-slate-500">
              Multi-Brand v5.5
            </span>
            {venditore && <span className="text-slate-500">/</span>}
            {venditore && <span className="flex items-center gap-1 text-slate-300">👤 {venditore}</span>}
            {tipoCliente && <span className="text-slate-500">/</span>}
            {tipoCliente && (
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${tipoCliente === "privato" ? "bg-emerald-500/10 text-emerald-400" : "bg-violet-500/10 text-violet-400"}`}>
                {tipoCliente === "privato" ? "Consumer" : "Business"}
              </span>
            )}
            {currentBrand && <span className="text-slate-500">/</span>}
            {currentBrand && <span className="text-slate-300">🏷 {currentBrand.label}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {brand && step === 4 && (
            <button onClick={addCart}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2">
              <Plus className="w-4 h-4" /> 📦 Cambia brand
            </button>
          )}
          <button onClick={reset} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2">
            <ChevronLeft className="w-4 h-4" /> Ricomincia
          </button>
        </div>
      </div>

      {showCart ? (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-3">
              <ShoppingBag className="w-6 h-6 text-violet-400" />
              Carrello Prodotti ({tCI})
            </h2>
            <button onClick={() => setShowCart(false)} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-sm font-medium transition-all">
              Torna al modulo
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {[...cart, ...(colItems().length > 0 ? [{ brandId: brand, brandLabel: currentBrand?.label, brandColor: currentBrand?.color, items: colItems(), isCurrent: true }] : [])].map((group, gi) => (
                <div key={gi} className="glass-panel overflow-hidden border-l-4" style={{ borderLeftColor: group.brandColor }}>
                  <div className="p-4 bg-white/[0.03] border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{group.brandIcon || "📦"}</span>
                      <h3 className="font-bold text-white uppercase tracking-wider text-sm">{group.brandLabel}</h3>
                    </div>
                    {group.isCurrent && <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase">In Corso</span>}
                  </div>
                  <div className="p-4 space-y-4">
                    {group.items.map((it, ii) => (
                      <CartItem key={ii} it={it} ii={ii} gi={gi} total={group.items.length} expI={expI} setExpI={setExpI} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-6">
              <div className="glass-panel p-6 sticky top-24">
                <h3 className="text-sm font-bold text-slate-400 mb-6 uppercase tracking-widest">Resoconto</h3>
                <div className="space-y-4 mb-4">
                  <div className="flex justify-between text-sm py-2 border-b border-white/5">
                    <span className="text-slate-500 font-bold uppercase text-[10px]">Totale Brand</span>
                    <span className="text-white font-bold">{cart.length + (colItems().length > 0 ? 1 : 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm py-2 border-b border-white/5">
                    <span className="text-slate-500 font-bold uppercase text-[10px]">Totale Prodotti</span>
                    <span className="text-white font-bold">{tCI}</span>
                  </div>
                </div>

                {/* STEP 5 & 6 (CART INLINE) */}
                <div className="mt-6 mb-6">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest flex items-center gap-2"><Archive className="w-3 h-3 text-emerald-400" /> Attribuzione & Allegati</h4>

                  <div className="space-y-4 mb-6 relative z-50">
                    <div>
                      <Label text="Negozio" required />
                      <SearchableSelect options={NEGOZI} value={negozio} onChange={setNegozio} placeholder="— Seleziona —" icon={<Archive className="w-3 h-3 text-emerald-400" />} />
                    </div>
                    <div>
                      <Label text="Data Vendita" required />
                      <input type="date" className="w-full glass-input text-sm py-2.5 shadow-sm focus:border-violet-500/50" defaultValue="2026-03-07" />
                    </div>
                  </div>

                  <NoteStep mini />

                  <div className="mt-6">
                    <Label text="Allegati (Trascina o clicca)" />
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {[{ l: "Identità", i: "🪪" }, { l: "Contratti", i: "📄" }, { l: "Altro", i: "📁" }].map(a => (
                        <div key={a.l} className="border border-dashed border-white/10 rounded-xl p-3 text-center bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer group">
                          <div className="text-xl mb-1 group-hover:scale-110 transition-transform">{a.i}</div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter line-clamp-1">{a.l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {colItems().length > 0 && (
                    <button onClick={addCart} className="w-full py-3 bg-white/5 border border-white/10 text-slate-300 rounded-xl font-bold hover:bg-white/10 transition-all text-xs uppercase tracking-widest">
                      + Aggiungi Altro Brand
                    </button>
                  )}
                  <button onClick={finalSubmit} disabled={tCI === 0}
                    className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all ${tCI > 0 ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
                    <Check className="w-5 h-5" /> Invia Tutto
                  </button>
                </div>
                <p className="text-[9px] text-slate-500 text-center mt-4 uppercase font-bold tracking-tighter">I dati verranno salvati nel sistema centralizzato</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* PROGRESS BAR */}
          <div className="flex gap-2 mb-8">
            {STEP_LABELS.map((s, i) => {
              const n = i + 1, done = n < step, active = n === step;
              return (
                <div key={i} onClick={() => done && setStep(n)}
                  className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${active ? "bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.3)]" : done ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]" : "bg-white/10"}`}
                  title={s}
                />
              );
            })}
          </div>

          <div className="space-y-6">
            {/* CART BAR */}
            {cart.length > 0 && (
              <div onClick={() => setShowCart(true)}
                className="glass-panel p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-all group border-l-2 border-violet-500/50">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 group-hover:scale-110 transition-transform">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">Carrello Prodotti</div>
                    <div className="flex gap-2 mt-1">
                      {cart.map((g, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-bold text-slate-400 border border-white/5 uppercase tracking-tighter">
                          {g.brandLabel} ({g.items.length})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <span className="text-xs font-medium text-slate-500 group-hover:text-white transition-colors flex items-center gap-1 uppercase tracking-widest text-[10px]">Dettagli <ChevronRight className="w-3 h-3" /></span>
              </div>
            )}

            {/* ══ STEP 1 ══ */}
            {step === 1 && (
              <StepCard title="Step 1 — Venditore" color="#e83e8c" icon="👤">
                <div style={{ maxWidth: 360 }}>
                  <Label text="Seleziona il tuo nome" required note="Pre-compilato dal login" />
                  <SearchableSelect
                    options={VENDITORI}
                    value={venditore}
                    onChange={setVenditore}
                    placeholder="— Seleziona venditore —"
                    icon={<User className="w-4 h-4 text-violet-400" />}
                  />
                </div>
                <NavBar onNext={goNext} canNext={canProceed()} isFirst />
              </StepCard>
            )}

            {/* ══ STEP 2 ══ */}
            {step === 2 && (
              <StepCard title="Step 2 — Tipo Cliente e Anagrafica" color="#6f42c1" icon="🧑‍💼">
                <div className="grid grid-cols-2 gap-4 mb-8">
                  {[{ id: "privato", icon: "👤", label: "Consumer", desc: "Persona fisica" }, { id: "business", icon: "🏢", label: "Business", desc: "Azienda / P.IVA" }].map(o => (
                    <button key={o.id}
                      onClick={() => { setTipoCliente(o.id); setLookupDone(false); setClienteFound(false); setLookupValue(""); setBrand(null); setAllSales({}); }}
                      className={`p-6 rounded-2xl text-center border-2 transition-all ${tipoCliente === o.id ? "bg-violet-500/10 border-violet-500 shadow-lg shadow-violet-500/20" : "bg-white/5 border-white/5 hover:bg-white/10"}`}>
                      <div className="text-3xl mb-3">{o.icon}</div>
                      <div className={`font-bold text-sm uppercase tracking-wide ${tipoCliente === o.id ? "text-violet-400" : "text-slate-300"}`}>{o.label}</div>
                      <div className="text-[10px] text-slate-500 mt-1 uppercase font-bold">{o.desc}</div>
                    </button>
                  ))}
                </div>

                {tipoCliente && (
                  <div className="bg-white/[0.03] rounded-2xl p-6 mb-8 border border-white/5">
                    <Label text={tipoCliente === "privato" ? "Codice Fiscale" : "Partita IVA"} required note="Ricerca cliente esistente" />
                    <div className="flex gap-3 mt-3">
                      <input type="text" className="flex-1 glass-input font-mono tracking-widest uppercase" placeholder={tipoCliente === "privato" ? "RSSMRA80A..." : "1234567..."}
                        value={lookupValue} onChange={e => setLookupValue(e.target.value)} />
                      <button onClick={() => { setClienteFound(true); setLookupDone(true); }}
                        className="px-6 py-2 bg-violet-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-violet-600/25 hover:bg-violet-500 transition-all flex items-center gap-2">
                        <Search className="w-4 h-4" /> Cerca
                      </button>
                      <button onClick={() => { setClienteFound(false); setLookupDone(true); }}
                        className="px-6 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-sm font-bold border border-white/10 transition-all flex items-center gap-2">
                        <User className="w-4 h-4" /> Nuovo
                      </button>
                    </div>
                    {clienteFound && <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-sm text-emerald-400 flex items-center gap-2 font-bold uppercase text-[10px] tracking-widest"><Check className="w-4 h-4" /> Cliente trovato! Dati pre-compilati.</div>}
                    {lookupDone && !clienteFound && <div className="mt-4 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-400 flex items-center gap-2 font-bold uppercase text-[10px] tracking-widest"><Info className="w-4 h-4" /> Nuovo cliente — compila manualmente.</div>}
                  </div>
                )}

                {tipoCliente && lookupDone && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <SectionTitle>📝 Dati Anagrafici <Tag c="#6f42c1" bg="#F3EEFB">{tipoCliente === "privato" ? "Consumer" : "Business"}</Tag></SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {tipoCliente === "privato" ? (
                        <>
                          <AField label="Nome" required value={anConsumer.nome} onChange={v => setAnConsumer(p => ({ ...p, nome: v }))} pf={clienteFound} ph="es. Mario" />
                          <AField label="Cognome" required value={anConsumer.cognome} onChange={v => setAnConsumer(p => ({ ...p, cognome: v }))} pf={clienteFound} ph="es. Rossi" />
                          <AField label="Codice Fiscale" required value={anConsumer.cf} onChange={v => setAnConsumer(p => ({ ...p, cf: v.toUpperCase() }))} pf={clienteFound} ph="Rssmra80a01h501u" mono actionLabel="🧮 Calcola" onAction={() => setShowCF(true)} />

                          <AField label="Email" value={anConsumer.email} onChange={v => setAnConsumer(p => ({ ...p, email: v }))} pf={clienteFound} ph="mario.rossi@email.com" />
                          <AField label="Numero Fisso" value={anConsumer.numeroFisso} onChange={v => setAnConsumer(p => ({ ...p, numeroFisso: v }))} pf={clienteFound} ph="06 1234567" />
                          <AField label="Recapito Cellulare" value={anConsumer.cellulare} onChange={v => setAnConsumer(p => ({ ...p, cellulare: v }))} pf={clienteFound} ph="333 1234567" />
                          <AField label="IBAN" value={anConsumer.iban} onChange={v => setAnConsumer(p => ({ ...p, iban: v }))} pf={clienteFound} ph="It00..." mono span2 />
                          <AField label="Domicilio" value={anConsumer.domicilio} onChange={v => setAnConsumer(p => ({ ...p, domicilio: v }))} pf={clienteFound} ph="Via, Numero, CAP, Città" span2 />
                          <div className="col-span-full">
                            <Label text="Note" />
                            <textarea className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500/50 transition-colors"
                              value={anConsumer.note} onChange={e => setAnConsumer(p => ({ ...p, note: e.target.value }))} placeholder="Note aggiuntive..." rows={3} />
                          </div>
                        </>
                      ) : (
                        <>
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
                          <div className="col-span-full">
                            <Label text="Note" />
                            <textarea className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500/50 transition-colors"
                              value={anBusiness.note} onChange={e => setAnBusiness(p => ({ ...p, note: e.target.value }))} placeholder="Note aggiuntive..." rows={3} />
                          </div>
                        </>
                      )}
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
                  <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3 text-sm text-violet-400 mb-6 flex items-center gap-2 font-bold uppercase text-[10px] tracking-widest">
                    <Info className="w-4 h-4" /> Modalità Business — tutti i brand inclusi
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleBrands.map(b => (
                    <button key={b.id} onClick={() => { setBrand(b.id); setAllSales({}); }}
                      className={`p-6 rounded-2xl text-left border-2 transition-all ${brand === b.id ? "bg-white/10 border-white shadow-lg" : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20 shadow-sm"}`}
                      style={brand === b.id ? { borderColor: b.color, backgroundColor: `${b.color}15` } : {}}>
                      <div className="flex items-center justify-between mb-4">
                        <span className="font-bold text-lg text-white tracking-tight">{b.label}</span>
                        <Pill>{b.badge}</Pill>
                      </div>
                      <div className="text-[10px] text-slate-500 mb-4 font-bold uppercase tracking-tight leading-relaxed line-clamp-2">{b.desc}</div>
                      <div className="flex flex-wrap gap-2">
                        {b.onlyBusiness && <Tag c="#a78bfa" bg="#a78bfa10">🔒 Solo Business</Tag>}
                        {brand === b.id && <Tag c="#10b981" bg="#10b98110">✓ Selezionato</Tag>}
                      </div>
                    </button>
                  ))}
                </div>
                <NavBar onBack={goBack} onNext={goNext} canNext={canProceed()} />
              </StepCard>
            )}

            {/* ══ STEP 4 ══ */}
            {step === 4 && (
              <StepCard title="Step 4 — Prodotti" color={currentBrand?.color || "#2E75B6"} icon="📂"
                badge={`${currentBrand?.label} · ${tipoCliente === "business" ? "Business" : "Consumer"}`}>
                {Object.keys(brandProdotti).length > 0
                  ? <div className="space-y-6">
                    {Object.entries(brandProdotti).map(([cat, prods]) => renderCategoria(cat, prods))}
                  </div>
                  : (
                    <div className="text-center py-20 bg-white/[0.02] rounded-3xl border border-dashed border-white/10">
                      <div className="text-4xl mb-4 opacity-40">🚧</div>
                      <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Nessun prodotto disponibile per questa selezione</div>
                    </div>
                  )
                }
                <div className="flex justify-between items-center mt-8 pt-6 border-t border-white/10 gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <button onClick={goBack} className="px-5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 text-sm font-medium transition-all">← Indietro</button>
                    {confirmReset ? (
                      <div className="flex items-center gap-3 animate-in fade-in duration-200 ml-2">
                        <span className="text-xs font-bold text-rose-500 uppercase">Sei sicuro?</span>
                        <button onClick={reset} className="px-4 py-2 rounded-lg bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition-all">Sì, resetta</button>
                        <button onClick={() => setConfirmReset(false)} className="px-4 py-2 rounded-lg bg-white/5 text-slate-300 text-xs font-bold hover:bg-white/10 border border-white/10 transition-all">Annulla</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmReset(true)} className="px-5 py-2.5 flex items-center gap-2 rounded-xl text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-all uppercase tracking-widest">
                        <Trash2 className="w-4 h-4" /> Reset form
                      </button>
                    )}
                  </div>

                  <button onClick={() => setShowCart(true)} className="px-8 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl text-sm font-bold uppercase tracking-widest shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all flex items-center gap-2">
                    🛒 Riepilogo Carrello {tCI > 0 && <span className="bg-white text-violet-600 px-2 py-0.5 rounded-full text-[10px] font-black ml-1">{tCI}</span>}
                  </button>
                </div>
              </StepCard>
            )}
          </div>
        </div>
      )}

      {/* MODAL CF */}
      {showCF && tipoCliente === "privato" && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#1a1d29] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden relative max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#1a1d29]/95 backdrop-blur z-10 shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-violet-400">🧮</span> Calcolo Codice Fiscale
              </h3>
              <button onClick={() => setShowCF(false)} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto min-h-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-1">
                  <Label text="Nome" required />
                  <input type="text" value={cfD.nome} onChange={e => setCfD(p => ({ ...p, nome: e.target.value }))} className="w-full glass-input text-sm rounded-xl py-2 px-3 focus:border-violet-500/50" placeholder="Mario" />
                </div>
                <div className="col-span-1">
                  <Label text="Cognome" required />
                  <input type="text" value={cfD.cognome} onChange={e => setCfD(p => ({ ...p, cognome: e.target.value }))} className="w-full glass-input text-sm rounded-xl py-2 px-3 focus:border-violet-500/50" placeholder="Rossi" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-1">
                  <Label text="Sesso" required />
                  <div className="flex gap-2">
                    {["M", "F"].map(sx => (
                      <button key={sx} onClick={() => setCfD(p => ({ ...p, sesso: sx }))} className={`flex-1 py-1.5 rounded-xl text-sm font-bold transition-all ${cfD.sesso === sx ? "bg-violet-500 text-white shadow-lg shadow-violet-500/20" : "bg-white/5 text-slate-400 border border-white/10"}`}>{sx === "M" ? "♂ M" : "♀ F"}</button>
                    ))}
                  </div>
                </div>
                <div className="col-span-1">
                  <Label text="Data di Nascita" required />
                  <div className="flex gap-2">
                    <input type="text" value={cfD.giorno} onChange={e => setCfD(p => ({ ...p, giorno: e.target.value }))} placeholder="GG" maxLength={2} className="w-[50px] text-center glass-input rounded-xl text-sm py-2 px-1 focus:border-violet-500/50" />
                    <select value={cfD.mese} onChange={e => setCfD(p => ({ ...p, mese: e.target.value }))} className="flex-1 min-w-0 glass-input rounded-xl text-sm py-2 px-1 text-slate-300 bg-[#1a1d29] focus:border-violet-500/50">
                      <option value="">MM</option>
                      {["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input type="text" value={cfD.anno} onChange={e => setCfD(p => ({ ...p, anno: e.target.value }))} placeholder="AAAA" maxLength={4} className="w-[60px] text-center glass-input rounded-xl text-sm py-2 px-1 focus:border-violet-500/50" />
                  </div>
                </div>
              </div>

              <div>
                <Label text="Luogo di nascita" required />
                <div className="flex gap-2 mb-3">
                  {[{ k: false, l: "🇮🇹 Italia" }, { k: true, l: "🌍 Estero" }].map(({ k, l }) => (
                    <button key={String(k)} onClick={() => setCfD(p => ({ ...p, estero: k, comune: "", paese: "" }))} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all border ${cfD.estero === k ? "bg-violet-500/20 text-violet-300 border-violet-500/40" : "bg-white/5 text-slate-400 border-white/5 hover:bg-white/10"}`}>
                      {l}
                    </button>
                  ))}
                </div>
                {!cfD.estero ? (
                  <div>
                    <input list="cf-comuni-list" value={cfD.comune} onChange={e => setCfD(p => ({ ...p, comune: e.target.value.toUpperCase() }))} placeholder="Ricerca comune..." className="w-full glass-input text-sm rounded-xl py-2.5 px-3 uppercase focus:border-violet-500/50" />
                    <datalist id="cf-comuni-list">{_CNA?.map(n => <option key={n} value={n} />)}</datalist>
                  </div>
                ) : (
                  <div>
                    <input list="cf-paesi-list" value={cfD.paese} onChange={e => setCfD(p => ({ ...p, paese: e.target.value.toUpperCase() }))} placeholder="Ricerca nazione..." className="w-full glass-input text-sm rounded-xl py-2.5 px-3 uppercase focus:border-violet-500/50" />
                    <datalist id="cf-paesi-list">{_PNA?.map(n => <option key={n} value={n} />)}</datalist>
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-white/5 bg-black/20 shrink-0">
              <button onClick={doCF} className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl text-sm font-bold uppercase tracking-widest shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all flex items-center justify-center gap-2">
                🧮 Calcola Codice Fiscale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER TIPS */}

      <div className="mt-12 bg-blue-500/5 border border-blue-500/10 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Info className="w-5 h-5 text-blue-400" />
          <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">Guida Rapida Dashboard v5.5</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-[10px] text-slate-500 leading-relaxed uppercase space-y-2">
            <span className="text-white font-bold block mb-1">Brand Unificati</span>
            Stessa struttura per tutti i brand: prodotti → dettagli → carrello.
          </div>
          <div className="text-[10px] text-slate-500 leading-relaxed uppercase space-y-2">
            <span className="text-white font-bold block mb-1">Luce & Gas</span>
            Accorpate in un unico menu: seleziona il servizio per visualizzare i campi specifici.
          </div>
          <div className="text-[10px] text-slate-500 leading-relaxed uppercase space-y-2">
            <span className="text-white font-bold block mb-1">Carrello</span>
            Puoi aggiungere prodotti da brand diversi e inviarli tutti con un singolo click.
          </div>
        </div>
      </div>
    </div>
  );
}


// ── HELPERS ───────────────────────────────────────────────────────────────────

function StepCard({ title, color, icon, badge, children }) {
  return (
    <div className="glass-panel p-6 md:p-8 animate-in slide-in-from-top-2 fade-in duration-200" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <h2 className="text-lg font-bold text-white uppercase tracking-wide">{title}</h2>
        </div>
        {badge && (
          <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-slate-400 uppercase">
            {badge}
          </span>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function NavBar({ onBack, onNext, canNext, isFirst }) {
  return (
    <div className={`flex gap-4 ${isFirst ? 'justify-end' : 'justify-between'} mt-8 pt-6 border-t border-white/10`}>
      {!isFirst && (
        <button onClick={onBack} className="px-6 py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 text-sm font-medium transition-all">
          ← Torna indietro
        </button>
      )}
      <button onClick={onNext} disabled={!canNext}
        className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${canNext ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40' : 'bg-white/5 text-slate-500 cursor-not-allowed'}`}>
        {onNext.name === 'finalSubmit' ? 'Invia Tutto ✓' : 'Vai avanti →'}
      </button>
    </div>
  );
}

function Label({ text, required, note }) {
  return (
    <div className="text-sm font-semibold text-slate-400 mb-2 flex items-center justify-between">
      <span>
        {text}
        {required && <span className="text-rose-500 ml-1">*</span>}
      </span>
      {note && <span className="text-[10px] font-medium text-slate-600 uppercase italic">{note}</span>}
    </div>
  );
}

function SearchableSelect({ options, value, onChange, placeholder, icon }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-black/40 border border-white/10 text-white rounded-xl py-2.5 px-4 outline-none focus:border-violet-500 transition-all text-sm shadow-inner"
      >
        <div className="flex items-center gap-2">
          {icon && <span className="opacity-60">{icon}</span>}
          <span className={value ? "text-white font-medium" : "text-slate-500"}>
            {value || placeholder}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-[1000] mt-2 w-full bg-[#1a1d29] border border-white/10 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 shadow-2xl ring-1 ring-black/50">
          <div className="p-2 border-b border-white/5 bg-white/[0.02]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
              <input
                type="text"
                autoFocus
                className="w-full bg-black/20 border border-white/5 rounded-lg py-2 pl-8 pr-3 text-xs text-white outline-none focus:border-violet-500/50 placeholder:text-slate-600 font-medium"
                placeholder="Cerca..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1.5 scrollbar-hide">
            {filtered.length > 0 ? (
              filtered.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-200 flex items-center justify-between group ${value === opt
                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                    : "hover:bg-white/5 text-slate-400 hover:text-white"
                    }`}
                >
                  <span className={value === opt ? "font-bold" : "font-medium"}>{opt}</span>
                  {value === opt && <Check className="w-3 h-3 text-violet-400" />}
                </button>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-[10px] text-slate-600 uppercase font-black tracking-[0.2em]">
                Nessun risultato
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div className="flex items-center gap-2 text-sm font-bold text-slate-200 mt-6 mb-4 pb-2 border-b border-white/5">
      {children}
    </div>
  );
}

function Tag({ c, bg, children }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase" style={{ color: c, backgroundColor: bg }}>
      {children}
    </span>
  );
}

function Pill({ children }) {
  return (
    <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs font-medium text-slate-300">
      {children}
    </span>
  );
}

function AField({ label, required, value, onChange, pf, ph, mono, span2, actionLabel, onAction }) {
  return (
    <div className={`space-y-1.5 ${span2 ? 'col-span-full' : ''}`}>
      <Label text={label} required={required} />
      <div className="flex gap-2">
        <input
          type="text"
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder={ph}
          className={`flex-1 glass-input text-sm rounded-xl py-2.5 px-4 outline-none transition-all ${mono ? 'font-monospace uppercase text-white tracking-widest' : ''} ${pf && value ? 'border-emerald-500/50 bg-emerald-500/5' : ''}`}
        />
        {actionLabel && (
          <button type="button" onClick={onAction} className="px-4 py-2.5 rounded-xl bg-violet-500/10 text-violet-400 font-bold text-xs uppercase tracking-widest border border-violet-500/20 hover:bg-violet-500/20 transition-all">
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function NoteStep() {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <h3 className="text-lg font-semibold text-white mb-4">Vuoi aggiungere una nota o fissare un promemoria?</h3>
        <div className="flex gap-3 justify-center">
          <button onClick={() => setShow(true)} className={`px-8 py-2 rounded-xl text-sm font-bold transition-all ${show ? 'bg-emerald-500 text-white shadow-lg' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5'}`}>Sì</button>
          <button onClick={() => setShow(false)} className={`px-8 py-2 rounded-xl text-sm font-bold transition-all ${!show ? 'bg-rose-500 text-white shadow-lg' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5'}`}>No</button>
        </div>
      </div>

      {show && (
        <div className="grid md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="glass-panel p-5 bg-white/[0.02]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">📋</div>
              <div>
                <div className="text-sm font-bold text-white">Nota Interna</div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Archiviata nella vendita</div>
              </div>
            </div>
            <textarea
              rows={4}
              placeholder="Inserisci dettagli aggiuntivi..."
              className="w-full bg-black/20 border border-white/10 rounded-xl p-4 text-sm text-slate-300 placeholder-slate-600 focus:border-violet-500/50 transition-colors"
            />
          </div>

          <div className="glass-panel p-5 bg-white/[0.02]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">📅</div>
              <div>
                <div className="text-sm font-bold text-white">Promemoria Calendario</div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Fissa nel calendario</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-1.5">
                <Label text="Data" />
                <input type="date" className="w-full glass-input rounded-xl text-xs py-2 px-3" />
              </div>
              <div className="space-y-1.5">
                <Label text="Ora" />
                <input type="time" className="w-full glass-input rounded-xl text-xs py-2 px-3" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label text="Negozio" />
              <select className="w-full bg-black/40 border border-white/10 rounded-xl text-xs py-2 px-3 text-slate-300">
                {NEGOZI.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
