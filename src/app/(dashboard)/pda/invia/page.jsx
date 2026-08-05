"use client";

import Image from "next/image";
import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Search, ShoppingBag, User, Check, ChevronRight, Info, LayoutGrid, ChevronUp, ChevronDown } from "lucide-react";
import { calculateCF, _CNA, _PNA } from "@/lib/cf";
import { getDraft, saveDraft, clearDraft } from "@/lib/draft";
import { supabase } from "@/lib/supabaseClient";
import { designatiIncarico } from "@/lib/incarichi";
import { useAuth } from "@/context/AuthContext";
import { numeroNazionale } from "@/lib/telefono";
import { useStores, useSellers } from "@/lib/org";
import { IndirizzoAutocomplete } from "@/components/IndirizzoAutocomplete";
import { RicercaCliente } from "@/components/RicercaCliente";

// ── COSTANTI ──────────────────────────────────────────────────────────────────

// VENDITORI e NEGOZI ora arrivano dal DB (useSellers/useStores): le liste hardcoded
// erano nomi di fantasia/parziali e includevano "Telefonico", negozio rimosso in 033.

const ALL_BRANDS = [
  {
    id: "w3",
    label: "WindTre",
    badge: "W3",
    color: "var(--tf-2e75b6)",
    bg: "var(--tf-ebf3fb)",
    desc: "Mobile · Fisso · Luce&Gas · Multi-Servizi",
    onlyBusiness: false,
    logo: "/windtre.png",
  },
  {
    id: "sky",
    label: "Sky",
    badge: "SKY",
    color: "var(--tf-0072ce)",
    bg: "var(--tf-e6f2fb)",
    desc: "Fisso · Abbonamenti TV",
    onlyBusiness: false,
    logo: "/sky.png",
  },
  {
    id: "fastweb",
    label: "Fastweb",
    badge: "FW",
    color: "var(--tf-00a651)",
    bg: "var(--tf-e6f7ee)",
    desc: "Mobile · Fisso · Luce&Gas",
    onlyBusiness: false,
    logo: "/fastweb.png",
  },
  {
    id: "energy",
    label: "S4",
    badge: "NRG",
    color: "var(--tf-fd7e14)",
    bg: "var(--tf-fff3e6)",
    desc: "Luce e Gas",
    onlyBusiness: false,
    logo: "/energy - Copy.png",
  },
  {
    id: "dojo",
    label: "Dojo",
    badge: "DJ",
    color: "var(--tf-6f42c1)",
    bg: "var(--tf-f3eefb)",
    desc: "POS · Terminali di pagamento",
    onlyBusiness: true,
    logo: "/dojo-round.png",   // il cerchio, come Registra Vendita (Luca 04/08)
  },
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
    { key: "operatoreDon", label: "Origin Operator", type: "select", opts: [], fallbackOpts: "ORIGIN_OPERATORS_FISSO", required: true },
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
const CAT_COLORS = { "Mobile": "var(--tf-2e75b6)", "Fisso": "var(--tf-28a745)", "Luce & Gas": "var(--tf-fd7e14)", "Multi-servizi": "var(--tf-6f42c1)", "Abbonamenti SKY": "var(--tf-0072ce)", "POS": "var(--tf-6f42c1)" };

const DONOR_MOBILE = ["", "TIM", "Vodafone", "WindTre", "Iliad", "Fastweb Mobile", "PosteMobile", "ho. Mobile", "Kena Mobile", "Very Mobile", "CoopVoce", "Spusu", "Lyca Mobile", "1Mobile", "Tiscali Mobile", "Digi Mobil", "Noitel", "Optima Mobile", "Feder Mobile", "Rabona Mobile", "Elimobile", "BT Italia", "Segnoverde Mobile", "Uno Mobile", "Saily", "Visitel", "Ops! Mobile"];
// Fixed-line origin operators (Send PDA → Fixed Line → Origin Operator). Shown only when WindTre/Fastweb + Fisso + Portabilità = Sì.
const ORIGIN_OPERATORS_FISSO = ["", "TIM (ex Telecom Italia)", "Vodafone Italia", "WindTre", "Fastweb", "Iliad (FTTH fiber)", "Tiscali", "Aruba", "PosteMobile (Home)", "Vianova", "Linkem (FWA)", "Eolo (FWA)", "BT Italia", "Retelit", "Unidata", "Uno Communications"];
const DONOR_FISSO = ORIGIN_OPERATORS_FISSO; // used also for SME Fisso
const DONOR_LUCE_GAS = ["", "Enel Energia", "Eni Plenitude", "A2A Energia", "Iren", "Hera Comm", "Edison", "Sorgenia", "E.ON", "Illumia", "Engie", "Optima", "Wekiwi", "Estra", "Axpo", "Iberdrola", "Acea Energia", "Servizio Elettrico Nazionale", "Altro"];

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

const DRAFT_KEY_PDA = "pda-invia";

// ═══════════════════════════════════════════════════════════════════════════════
export default function InviaPda() {
  const VENDITORI = useSellers();

  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [venditore, setVenditore] = useState("");
  const [negozio, setNegozio] = useState("");
  // AUTOCOMPILAZIONE (Luca 29/07): il venditore è CHI È LOGGATO. L'init non
  // basta: al primo render l'utente può non essere ancora arrivato, e una
  // bozza con venditore VUOTO ("" non è nullish) bloccava il fallback → il
  // campo restava da selezionare a mano.
  useEffect(() => {
    if (!venditore && user?.name) setVenditore(user.name);
    if (!negozio && user?.negozio) setNegozio(user.negozio);
  }, [user?.name, user?.negozio]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Data Vendita" era un input non controllato fisso al 2026-03-07 (residuo
  // del mock): mostrava sempre il 7 marzo e il valore scelto non veniva letto.
  const [dataVendita, setDataVendita] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [confirmReset, setConfirmReset] = useState(false);

  const [tipoCliente, setTipoCliente] = useState(null);
  const [lookupValue, setLookupValue] = useState("");
  const [clienteFound, setClienteFound] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [anConsumer, setAnConsumer] = useState({ nome: "", cognome: "", cf: "", email: "", numeroFisso: "", cellulare: "", iban: "", domicilio: "", note: "" });
  const [anBusiness, setAnBusiness] = useState({ ragioneSociale: "", piva: "", referente: "", cfReferente: "", numeroFisso: "", mobile: "", email: "", pec: "", codiceUnivoco: "", iban: "", sedeLegale: "", note: "" });

  const [brand, setBrand] = useState(null);

  const [showCF, setShowCF] = useState(false);
  const [cfD, setCfD] = useState({ nome: "", cognome: "", sesso: "M", giorno: "", mese: "", anno: "", comune: "", estero: false, paese: "" });
  const [attachments, setAttachments] = useState([]); // { file: File, name: string, type: string }
  const [uploading, setUploading] = useState(false);


  // Carrello multi-brand
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [expI, setExpI] = useState({});
  const [toast, setToast] = useState(null);

  // { [catKey]: [ { product:"", fields:{}, skyPkt:[], skyTech:"", skyDec:"", lucaGasSez:"" } ] }
  const [allSales, setAllSales] = useState({});
  const [collapsedToggles, setCollapsedToggles] = useState({});

  // RIPRISTINO BOZZA come Registra Vendita (#118): la bozza si legge in un
  // effect DOPO il mount, MAI durante il render. Leggerla nel render (vecchio
  // draftRef) faceva divergere l'HTML del server (senza sessionStorage, quindi
  // senza bozza) da quello del client (con bozza) → all'apertura la pagina
  // andava in errore di idratazione React ("Hydration failed"). L'auto-save
  // sotto è gated su draftLoaded, così il primo salvataggio non cancella la
  // bozza prima di averla ripristinata.
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    if (draftLoaded) return;
    setDraftLoaded(true);
    const d = getDraft(DRAFT_KEY_PDA);
    if (!d) return;
    if (d.step) setStep(d.step);
    if (d.venditore) setVenditore(d.venditore);
    if (d.negozio) setNegozio(d.negozio);
    if (d.dataVendita) setDataVendita(d.dataVendita);
    if (d.tipoCliente) setTipoCliente(d.tipoCliente);
    if (d.lookupValue) setLookupValue(d.lookupValue);
    setClienteFound(!!d.clienteFound);
    setLookupDone(!!d.lookupDone);
    if (d.anConsumer) setAnConsumer(p => ({ ...p, ...d.anConsumer }));
    if (d.anBusiness) setAnBusiness(p => ({ ...p, ...d.anBusiness }));
    if (d.brand) setBrand(d.brand);
    if (d.cfD) setCfD(p => ({ ...p, ...d.cfD }));
    if (Array.isArray(d.cart)) setCart(d.cart);
    if (d.allSales && typeof d.allSales === "object") setAllSales(d.allSales);
  }, [draftLoaded]);

  const getSales = (ck) => allSales[ck] || [{ product: "", fields: {}, skyPkt: [], skyTech: "", skyDec: "", lgSez: "" }];
  const updSale = (ck, si, up) => setAllSales(p => { const a = [...getSales(ck)]; a[si] = { ...a[si], ...up }; return { ...p, [ck]: a }; });
  const setProd = (ck, si, v) => updSale(ck, si, { product: v });
  const setField = (ck, si, fk, v) => updSale(ck, si, { fields: { ...(getSales(ck)[si]?.fields || {}), [fk]: v } });
  // piu' campi in UN colpo (la scelta dell'indirizzo compila via+CAP+citta':
  // tre setField in fila si mangerebbero a vicenda leggendo stato stantio)
  const setFields = (ck, si, patch) => updSale(ck, si, { fields: { ...(getSales(ck)[si]?.fields || {}), ...patch } });
  // INDIRIZZO COMPLETO (Luca 29/07): via con riconoscimento + CAP e Citta'
  // compilati dalla lista (chiavi <k>Cap e <k>Citta nei dettagli); a mano
  // solo se non trovato. Montato su fisso, energia, Dojo e SME.
  // FUNZIONE CHIAMATA, NON componente (fix 05/08): definito come <CampiIndirizzo/>
  // dentro il componente cambiava identità a ogni render → React smontava e
  // rimontava gli input a OGNI tasto: focus perso dopo un carattere e tendina
  // dell'autocomplete che si chiudeva da sola. La pagina "sembrava in errore".
  const campiIndirizzo = ({ k, sale, catKey, si }) => {
    const f = sale.fields || {};
    return (
      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1.2fr] gap-2 mt-2">
        <IndirizzoAutocomplete value={f[k] || ""} onChange={v => setField(catKey, si, k, v)}
          onPick={s => setFields(catKey, si, { [k]: s.indirizzo, ...(s.cap ? { [k + "Cap"]: s.cap } : {}), ...(s.citta ? { [k + "Citta"]: s.citta } : {}) })}
          className="glass-input w-full" placeholder="Via e civico: scegli dalla lista" />
        <input type="text" className="glass-input" placeholder="CAP" maxLength={5} value={f[k + "Cap"] || ""} onChange={e => setField(catKey, si, k + "Cap", e.target.value)} />
        <input type="text" className="glass-input" placeholder="Città" value={f[k + "Citta"] || ""} onChange={e => setField(catKey, si, k + "Citta", e.target.value)} />
      </div>
    );
  };
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

  // RICERCA STANDARD (Luca 31/07): stesso campo unico di Registra Vendita —
  // la vecchia doLookup cercava SOLO il CF esatto col bottone e non trovava
  // nulla al minimo scarto. Ora la selezione arriva da <RicercaCliente/>.
  const applicaClientePda = (data) => {
    setClienteFound(true);
    setLookupDone(true);
    setLookupValue(data.cf_piva || "");
    if (data.tipo === "consumer") {
      setAnConsumer(p => ({
        ...p,
        nome: data.nome || "",
        cognome: data.cognome || "",
        cf: data.cf_piva || "",
        email: data.email || "",
        cellulare: data.cellulare || "",
        domicilio: data.indirizzo || "",
      }));
      setTipoCliente("privato");
    } else {
      setAnBusiness(p => ({
        ...p,
        ragioneSociale: data.ragione_sociale || "",
        piva: data.cf_piva || "",
        // il referente canonico sta in nome_ref/cognome_ref (nome resta il
        // ripiego per lo storico caller pre-mig. 124)
        referente: [data.nome_ref || data.nome, data.cognome_ref || data.cognome].filter(Boolean).join(" "),
        cfReferente: data.cf_ref || "",
        numeroFisso: data.telefono_fisso || "",
        email: data.email || "",
        mobile: data.cellulare || "",
        sedeLegale: data.indirizzo || "",
      }));
      setTipoCliente("business");
    }
    showToast("✅ Cliente trovato nel database");
  };

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
    clearDraft(DRAFT_KEY_PDA);
    setStep(1); setVenditore("");
    setTipoCliente(null); setLookupValue(""); setClienteFound(false); setLookupDone(false);
    setAnConsumer({ nome: "", cognome: "", cf: "", email: "", numeroFisso: "", cellulare: "", iban: "", domicilio: "", note: "" });
    setAnBusiness({ ragioneSociale: "", piva: "", referente: "", cfReferente: "", numeroFisso: "", mobile: "", email: "", pec: "", codiceUnivoco: "", iban: "", sedeLegale: "", note: "" });
    setBrand(null); setAllSales({});
    setCart([]); setShowCart(false); setExpI({}); setConfirmReset(false);
    setAttachments([]); setUploading(false);
  };

  const handleFileChange = (e, type) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files).map(f => ({ file: f, name: f.name, type }));
    setAttachments(p => [...p, ...newFiles]);
    showToast(`📎 ${newFiles.length} allegati aggiunti: ${type}`);
  };

  useEffect(() => {
    if (!draftLoaded) return; // il primo render non deve sovrascrivere la bozza
    const payload = { step, venditore, negozio, tipoCliente, lookupValue, clienteFound, lookupDone, anConsumer, anBusiness, brand, cfD, cart, allSales, attachments_count: attachments.length };
    const t = setTimeout(() => saveDraft(DRAFT_KEY_PDA, payload), 800);
    return () => clearTimeout(t);
  }, [draftLoaded, step, venditore, negozio, tipoCliente, lookupValue, clienteFound, lookupDone, anConsumer, anBusiness, brand, cfD, cart, allSales, attachments.length]);

  const finalSubmit = async () => {
    const cur = colItems();
    const bObj = ALL_BRANDS.find(b => b.id === brand);
    const fc = [...cart];
    if (cur.length > 0 && bObj)
      fc.push({ brandId: brand, brandLabel: bObj.label, brandColor: bObj.color, items: cur });

    if (fc.length === 0) {
      showToast("⚠️ Nessun prodotto nel carrello");
      return;
    }

    // REFERENTE e suo CF obbligatori per le business (03/08, mig. 139)
    if (tipoCliente === "business") {
      const cfR = String(anBusiness.cfReferente || "").trim().toUpperCase();
      if (!String(anBusiness.referente || "").trim()) { showToast("\u26a0\ufe0f REFERENTE obbligatorio per i clienti business"); return; }
      if (!/^[A-Z0-9]{16}$/.test(cfR)) { showToast("\u26a0\ufe0f CF REFERENTE obbligatorio (16 caratteri) per i clienti business"); return; }
    }

    try {
      // 1. Client Upsert
      const isBus = tipoCliente === "business";
      const ana = isBus ? anBusiness : anConsumer;
      const cId = lookupValue || (isBus ? ana.piva : (ana.cf || ana.nome));
      const clientId = String(cId).toUpperCase() || `CL-PDA-${Date.now()}`;

      const clientData = {
        id: clientId,
        tipo: isBus ? "business" : "consumer",
        nome: isBus ? (ana.referente || "Ragione Sociale") : (ana.nome || ""),
        cognome: isBus ? "" : (ana.cognome || ""),
        ragione_sociale: isBus ? (ana.ragioneSociale || "") : "",
        cf_ref: isBus ? (ana.cfReferente || null) : null,
        cellulare: numeroNazionale(isBus ? ana.mobile : ana.cellulare) || (isBus ? (ana.mobile || "") : (ana.cellulare || "")),
        email: ana.email || "",
        cf_piva: lookupValue || (isBus ? ana.piva : ana.cf) || "",
        indirizzo: isBus ? (ana.sedeLegale || "") : (ana.domicilio || ""),
        citta: "",
        is_demo: false
      };

      const { error: clientErr } = await supabase.from("clients").upsert(clientData, { onConflict: "id" });
      if (clientErr) throw clientErr;

      // 1.5 Upload Attachments
      setUploading(true);
      const uploadedFiles = [];
      for (const att of attachments) {
        const fileExt = att.name.split(".").pop();
        const fileName = `pda_${clientId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `contracts/${fileName}`;

        const { error: uploadErr } = await supabase.storage
          .from("contracts")
          .upload(filePath, att.file);

        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage.from("contracts").getPublicUrl(filePath);
          uploadedFiles.push({ url: publicUrl, name: att.name, type: att.type });
        }
      }

      // 2. Prepare Contract Rows
      const contractRows = [];
      // ISO (YYYY-MM-DD) come in registra-contratto: le colonne data* sono TEXT, quindi
      // il DB ordina/filtra alfabeticamente. Scrivere "21/03/2026" rompeva l'ordinamento
      // cronologico e i filtri per data. La formattazione all'italiana va fatta a video.
      const dateStr = new Date().toISOString().split("T")[0];

      fc.forEach(group => {
        group.items.forEach(item => {
          const actCode = item.details["Codice Contratto"] || item.details["Codice Proposta"] || item.details["Codice Ordine"] || "PDA-INVIATA";
          contractRows.push({
            id: `PDA-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
            client_id: clientId,
            data: dateStr,
            brand: group.brandLabel,
            categoria: item.macro,
            prodotto: item.sub,
            stato: "PDA Inviata",
            venditore: venditore || "Sistema",
            // pratica dell'AGENZIA: il negozio vero lo assegna il back office in Gestione
            negozio: "Agenzia",
            codice_attivazione: String(actCode),
            data_registrazione: dateStr,
            data_attivazione: dateStr,
            dettagli: item.details || {},
            note: ana.note || null,
            is_demo: false
          });
        });
      });

      if (contractRows.length > 0) {
        const { data: createdContracts, error: contractErr } = await supabase.from("contracts").insert(contractRows).select();
        if (contractErr) throw contractErr;

        // 4. Save Attachments Meta
        if (uploadedFiles.length > 0 && createdContracts && createdContracts.length > 0) {
          const firstId = createdContracts[0].id;
          const attRows = uploadedFiles.map(f => ({
            contract_id: firstId,
            file_url: f.url,
            file_name: f.name,
            file_type: f.type
          }));
          const { error: attErr } = await supabase.from("contract_attachments").insert(attRows);
          if (attErr) console.error("Attachment Meta Error:", attErr);
        }
      }

      // TASK ⚡ ai designati dell'incarico "PDA inviata" (Luca 03/08): il back
      // office deve accorgersi SUBITO che c'e' una pratica da lavorare in
      // Gestione PDA. Senza designati o con fulmine spento non parte nulla.
      try {
        const { ids: ass, fulmine } = await designatiIncarico("pda_inviata");
        if (fulmine && ass.length) {
          const righe = contractRows.map(r => `${r.brand} ${r.categoria}`).join(", ");
          await supabase.from("admin_tasks").insert(ass.map((uid) => ({
            tipo: "pda_inviata",
            titolo: `📨 Nuova PDA da ${venditore || "agente"}`,
            dettaglio: `${contractRows.length} ${contractRows.length === 1 ? "pratica" : "pratiche"}: ${righe} — cliente ${clientData.ragione_sociale || `${clientData.nome} ${clientData.cognome}`.trim()}`,
            link: "/gestione",
            target_role: "admin", created_by: venditore || null, target_user_id: uid,
          })));
        }
      } catch { /* la PDA e' gia' inviata: il task e' un di piu' */ }

      showToast("🎉 PDA Inviata con successo!");
      setTimeout(fullReset, 2500);
    } catch (err) {
      console.error("Submit Error:", err);
      showToast("❌ Errore invio: " + (err.message || "Controlla connessione"));
    }
  };

  const reset = fullReset;

  const visibleBrands = ALL_BRANDS.filter(b => tipoCliente === "business" ? true : !b.onlyBusiness);
  const currentBrand = ALL_BRANDS.find(b => b.id === brand);
  const brandProdotti = brand && tipoCliente ? (PRODOTTI[brand]?.[tipoCliente === "business" ? "business" : "consumer"] || {}) : {};

  const tCI = cart.reduce((s, g) => s + g.items.length, 0) + colItems().length;

  const canProceed = () => {
    if (step === 1) return !!venditore;
    if (step === 2) {
      // business: referente e CF referente obbligatori (03/08, mig. 139)
      if (tipoCliente === "business" && (!String(anBusiness.referente || "").trim() || !/^[A-Z0-9]{16}$/.test(String(anBusiness.cfReferente || "").trim().toUpperCase()))) return false;
      return !!tipoCliente && lookupDone;
    }
    if (step === 3) return !!brand;
    return true;
  };
  const goNext = () => { if (canProceed() && step < 4) setStep(s => s + 1); };
  const goBack = () => { if (step > 1) setStep(s => s - 1); };

  // ── Render campi MENU A COMPARSA ─────────────────────────────────────────────
  const renderCatFields = (categoria, catKey, si, sale) => {
    if (!sale.product) return null;
    const color = CAT_COLORS[categoria] || "var(--tf-2e75b6)";

    // Luce & Gas Special rendering
    if (categoria === "Luce & Gas") {
      const isLuce = brand === "fastweb" || sale.product === "Luce" || sale.product?.toUpperCase().includes("LUCE");
      const subKeys = isLuce ? ["tipologiaC", "indirizzoF", "fornitPrec", "pod", "potenzaImp", "tensione", "destinazL", "consumoL", "residente"] : ["tipologiaC", "indirizzoF", "fornitPrec", "pdr", "tipologiaUso", "destinazG", "consumoG"];
      let fields = CAT_FIELDS["Luce & Gas"].filter(f => subKeys.includes(f.key));
      if (isLuce && tipoCliente === "business") {
        fields = fields.filter(f => f.key !== "residente");
      }
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
            {fields.map(f => {
              const baseOpts = f.fallbackOpts === "DONOR_MOBILE" ? DONOR_MOBILE : f.fallbackOpts === "DONOR_FISSO" ? DONOR_FISSO : f.fallbackOpts === "DONOR_LUCE_GAS" ? DONOR_LUCE_GAS : f.opts || [];
              let opts = baseOpts;
              if (f.key === "tensione" && tipoCliente !== "business") opts = baseOpts.filter(o => o !== "MT");
              else if (f.key === "destinazL" && tipoCliente === "business") opts = ["", "Altri usi"];
              return (
                <div key={f.key} className={f.span2 ? 'md:col-span-2' : ''}>
                  <Label text={f.label} required={f.required} />
                  {f.type === "select" ? (
                    <select
                      value={sale.fields?.[f.key] || ""}
                      onChange={e => setField(catKey, si, f.key, e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-slate-300 outline-none focus:border-violet-500/50"
                    >
                      {opts.map(o => <option key={o} value={o}>{o || "— Seleziona —"}</option>)}
                    </select>
                  ) : f.key.toLowerCase().startsWith("indirizzo") ? (
                    campiIndirizzo({ k: f.key, sale, catKey, si })
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
              );
            })}
          </div>
        </div>
      );
    }

    // Dojo POS — custom fields, nothing in CAT_FIELDS
    if (brand === "dojo" && categoria === "POS") {
      const dc = "var(--tf-6f42c1)";
      const addr = sale.fields?.dojoAddr || "";
      const cost = parseFloat(sale.fields?.dojoCost || "5.00");
      const comm = parseFloat(sale.fields?.dojoComm || "0.50");
      const COST_MIN = 5.00, COST_MAX = 10.00, COST_STEP = 0.50;
      const COMM_MIN = 0.50, COMM_MAX = 1.10, COMM_STEP = 0.10;
      const clamp = (v, mn, mx, st) => Math.round(Math.min(mx, Math.max(mn, Math.round(v / st) * st)) * 1000) / 1000;
      const pct = (v, mn, mx) => ((v - mn) / (mx - mn)) * 100;
      // funzione chiamata, non componente (fix 05/08: identità stabile, niente remount)
      const stepper = ({ label, value, min, max, step, fieldKey, unit, decimals }) => {
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
            {campiIndirizzo({ k: "dojoAddr", sale, catKey, si })}
          </div>
          {stepper({ label: "Costo mensile", value: cost, min: COST_MIN, max: COST_MAX, step: COST_STEP, fieldKey: "dojoCost", unit: "€/mese", decimals: 2 })}
          {stepper({ label: "Commissione transazioni", value: comm, min: COMM_MIN, max: COMM_MAX, step: COMM_STEP, fieldKey: "dojoComm", unit: "%", decimals: 2 })}
        </div>
      );
    }

    // ── FASTWEB BUSINESS FISSO SME — multi-line flow ────────────────
    if (brand === "fastweb" && tipoCliente === "business" && sale.product === "Fisso SME") {
      const smeColor = "var(--tf-00a651)";
      const ibanAnaS = anBusiness.iban;
      const numLinee = parseInt(sale.fields?.smeLinee || "2", 10);
      const numPort = parseInt(sale.fields?.smePort || "0", 10);
      const smeIban = sale.fields?.smeIban || "";
      const smeAddr = sale.fields?.smeAddr || "";
      const smePayM = sale.fields?.payMeth || "";

      // Generic stepper for SME — funzione chiamata, non componente (fix 05/08)
      const smeStep = ({ label, value, min, max, fieldKey }) => {
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
          {smeStep({ label: "📊 Numero di linee totali", value: numLinee, min: 2, max: 8, fieldKey: "smeLinee" })}

          {lineeSet && (
            <div className="pt-4 border-t border-white/5 animate-in fade-in duration-200">
              {smeStep({ label: "📞 Linee in portabilità", value: Math.min(numPort, numLinee), min: 0, max: numLinee, fieldKey: "smePort" })}
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
              {campiIndirizzo({ k: "smeAddr", sale, catKey, si })}
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

      // funzione chiamata, non componente (fix 05/08): la key va sull'elemento reso
      const miniBtn = ({ k, val, active, onClick, color = "var(--tf-2e75b6)" }) => (
        <button key={k} onClick={onClick}
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
                  {["Underground", "Mass Market"].map(opt => miniBtn({
                    k: opt, val: opt, active: tipMob === opt, color,
                    onClick: () => {
                      setField(catKey, si, "tipMob", tipMob === opt ? null : opt);
                      if (opt !== tipMob) {
                        setField(catKey, si, "mnp", opt === "Underground" ? true : null);
                        setField(catKey, si, "easyPay", null);
                        setField(catKey, si, "offerta", "");
                      }
                    },
                  }))}
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
                      ["Sì", "No"].map(opt => miniBtn({
                        k: opt, val: opt, active: mnp === opt, color,
                        onClick: () => { setField(catKey, si, "mnp", mnp === opt ? null : opt); setField(catKey, si, "easyPay", null); setField(catKey, si, "offerta", ""); },
                      }))
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Easy Pay */}
              {showEP && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <Label text="💳 Easy Pay?" required color={color} />
                  <div className="flex gap-3 mt-2">
                    {["Sì", "No"].map(opt => miniBtn({
                      k: opt, val: opt, active: easyPay === opt, color,
                      onClick: () => { setField(catKey, si, "easyPay", easyPay === opt ? null : opt); setField(catKey, si, "offerta", ""); },
                    }))}
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
                        style={sale.fields?.security === s ? { background: "var(--tf-fd7e14)" } : {}}>
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
                  {["Sì", "No"].map(opt => miniBtn({
                    k: opt, val: opt, active: hasTnp === opt, color,
                    onClick: () => setField(catKey, si, "cbHasTnp", hasTnp === opt ? null : opt),
                  }))}
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
                  {["Sì", "No"].map(opt => miniBtn({
                    k: opt, val: opt, active: hasCambio === opt, color,
                    onClick: () => setField(catKey, si, "cbHasCambio", hasCambio === opt ? null : opt),
                  }))}
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
      // Origin Operator: show only when WindTre or Fastweb + Fixed Line + Portabilità = Sì (Consumer & Business)
      const showOriginOperator = (brand === "w3" || brand === "fastweb") && sale.fields?.portabilita === "Sì";
      if (!showOriginOperator) {
        fields = fields.filter(f => f.key !== "operatoreDon");
      }
      // Nascondi Linea 1 (GNP + migrazione) se portabilità = No
      if (sale.fields?.portabilita === "No") {
        fields = fields.filter(f => f.key !== "gnpLinea1" && f.key !== "codMigr1");
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
              <Label text="Metodo di pagamento" required color="var(--tf-28a745)" />
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
              <Label text="Metodo di pagamento" required color="var(--tf-0072ce)" />
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
        {/* IBAN Fastweb — PayPicker + collassabile (solo Fisso/Luce: per Mobile è già nel blocco Metodo/Portabilità) */}
        {brand === "fastweb" && categoria !== "Mobile" && (() => {
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
              <Label text="Metodo di pagamento" required color="var(--tf-00a651)" note="Richiesto da Fastweb" />
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
          {fields.map(f => {
            const selectOptions = f.type === "select"
              ? (f.opts?.length ? f.opts : (f.fallbackOpts === "DONOR_MOBILE" ? DONOR_MOBILE : f.fallbackOpts === "ORIGIN_OPERATORS_FISSO" || f.fallbackOpts === "DONOR_FISSO" ? ORIGIN_OPERATORS_FISSO : f.fallbackOpts === "DONOR_LUCE_GAS" ? DONOR_LUCE_GAS : f.opts || [])).filter(Boolean)
              : [];
            return (
              <div key={f.key} className={f.span2 ? 'md:col-span-2' : ''}>
                <Label text={f.label} required={f.required} />
                {f.type === "select" ? (
                  <SearchableSelect
                    options={selectOptions}
                    value={sale.fields?.[f.key] || ""}
                    onChange={v => setField(catKey, si, f.key, v)}
                    placeholder="— Seleziona —"
                  />
                ) : f.key.toLowerCase().startsWith("indirizzo") ? (
                  campiIndirizzo({ k: f.key, sale, catKey, si })
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
            );
          })}
        </div>
      </div>
    );
  };

  // ── Render pacchetti Sky ──────────────────────────────────────────────────────
  const renderSkyTvFields = (catKey, si, sale) => {
    if (!sale.product || !SKY_TV_PRODUCTS.includes(sale.product)) return null;
    const color = "var(--tf-0072ce)";
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
            {campiIndirizzo({ k: "indirizzoInstallazione", sale, catKey, si })}
          </div>
        )}
      </div>
    );
  };

  // ── Render categoria prodotti (uguale per tutti i brand) ──────────────────────
  const renderCategoria = (categoria, prodotti) => {
    const catColor = CAT_COLORS[categoria] || "var(--tf-2e75b6)";
    const catIcon = CAT_ICONS[categoria] || "📦";
    const catKey = brand + "_" + categoria;
    const sales = getSales(catKey);
    const hasF = !!CAT_FIELDS[categoria]?.length || categoria === "Luce & Gas" || (categoria === "POS" && brand === "dojo");
    const isSkyTV = categoria === "Abbonamenti SKY";

    return (
      <div key={categoria} style={{ background: "var(--tf-w30)", borderRadius: 14, padding: 18, borderLeft: "4px solid " + catColor }}>
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: catColor, textTransform: "uppercase", letterSpacing: .8 }}>{catIcon} {categoria}</div>
          <button onClick={() => addSale(catKey)}
            style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--tf-w100)", background: "var(--tf-w20)", color: "var(--tf-8892b0)", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            ➕ Aggiungi {categoria}
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
                const gc = "var(--tf-2e75b6)";
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
                const gc = "var(--tf-28a745)";

                // Chip pill: mostra risposta collassata, click → espandi
                // (funzioni chiamate, non componenti — fix 05/08: TBlock come
                //  <TBlock/> veniva rimontato a ogni render e l'input IBAN
                //  perdeva il focus dopo OGNI carattere digitato)
                const chipPill = ({ tkKey, label, answer, extra }) => (
                  <div onClick={() => expandToggle(tkKey)}
                    className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 cursor-pointer select-none">
                    <span className="text-xs text-slate-300">{label}</span>
                    <span className={`text-[10px] font-bold ${answer === "Sì" ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"} px-2 py-0.5 rounded-full`}>{answer}</span>
                    {extra && <span className="text-[10px] text-slate-500 font-mono">{extra}</span>}
                    <span className="text-[10px] text-emerald-400">✎</span>
                  </div>
                );

                // Blocco toggle pieno con opzionale IBAN interno
                const tBlock = ({ tkKey, label, cur, onSet, ibanField, ibanSetKey, ibanAna }) => {
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
                      {port1 && collapsedToggles[k1] !== false && chipPill({ tkKey: k1, label: "📞 Portabilità", answer: port1 })}
                      {tBlock({ tkKey: k1, label: "📞 Portabilità?", cur: port1, onSet: v => setField(catKey, si, "portabilita", v) })}
                      {port1 && (<>
                        {sec && collapsedToggles[k2] !== false && chipPill({ tkKey: k2, label: "🔌 Seconda linea", answer: sec })}
                        {tBlock({ tkKey: k2, label: "🔌 Seconda linea?", cur: sec, onSet: v => setField(catKey, si, "secondaLinea", v) })}
                      </>)}
                      {port1 && sec === "Sì" && (<>
                        {port2 && collapsedToggles[k3] !== false && chipPill({ tkKey: k3, label: "📞 2° Linea Port.", answer: port2 })}
                        {tBlock({ tkKey: k3, label: "📞 2° Linea, Portabilità?", cur: port2, onSet: v => setField(catKey, si, "portabilita2", v) })}
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
                        chipPill({
                          tkKey: kDom, label: "🏦 Domiciliazione", answer: domFisso,
                          extra: domFisso === "Sì" && ibanFisso ? "···" + ibanFisso.slice(-4) : null,
                        })}
                      {tBlock({
                        tkKey: kDom, label: "🏦 Domiciliazione?", cur: domFisso,
                        onSet: v => setField(catKey, si, "domFisso", v),
                        ibanField: ibanFisso, ibanSetKey: "ibanFisso", ibanAna: ibanAnaF,
                      })}
                      {domFisso && (<>
                        {port1 && collapsedToggles[kPort] !== false && chipPill({ tkKey: kPort, label: "📞 Portabilità", answer: port1 })}
                        {tBlock({ tkKey: kPort, label: "📞 Portabilità?", cur: port1, onSet: v => setField(catKey, si, "portabilita", v) })}
                      </>)}
                    </div>
                  );
                }

                // ── TUTTI GLI ALTRI BRAND (Sky, Fastweb…): solo Portabilità ──────────
                const port1 = sale.fields?.portabilita || "";
                const kPort = `${catKey}_${si}_portF`;
                return (
                  <div className="mt-4">
                    {port1 && collapsedToggles[kPort] !== false && chipPill({ tkKey: kPort, label: "📞 Portabilità", answer: port1 })}
                    {tBlock({ tkKey: kPort, label: "📞 Portabilità?", cur: port1, onSet: v => setField(catKey, si, "portabilita", v) })}
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
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto text-slate-300">
      {/* TOAST — identico a Registra Vendita */}
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "var(--tf-28a745)", color: "#fff", padding: "12px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, boxShadow: "0 6px 20px rgba(0,0,0,.2)", zIndex: 9999 }}>
          {toast}
        </div>
      )}

      {/* TITOLO in alto a sinistra, come Registra Vendita (Luca 03/08).
          Via il breadcrumb e i bottoni in testata: la navigazione passa dalla
          barra step, il reset sta nel footer (convenzione RV). */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--tf-f8fafc)", margin: 0, letterSpacing: -0.3 }}>Invia PDA</h1>
      </div>

      {showCart ? (
        <div className="animate-in fade-in duration-300">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--tf-f8fafc)", display: "flex", alignItems: "center", gap: 10 }}>
              <ShoppingBag className="w-5 h-5 text-violet-400" />
              Riepilogo carrello ({tCI})
            </h2>
            <button onClick={() => setShowCart(false)}
              style={{ padding: "11px 20px", borderRadius: 10, border: "1px solid var(--tf-w100)", background: "var(--tf-w20)", color: "var(--tf-8892b0)", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              ← Torna al modulo
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              {[...cart, ...(colItems().length > 0 ? [{ brandId: brand, brandLabel: currentBrand?.label, brandColor: currentBrand?.color, items: colItems(), isCurrent: true }] : [])].map((group, gi) => (
                <div key={gi} style={{ background: "var(--tf-w20)", borderRadius: 14, borderLeft: "4px solid " + (group.brandColor || "var(--tf-6f42c1)"), overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", background: "var(--tf-w30)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: .8, color: group.brandColor || "var(--tf-f8fafc)" }}>
                      {group.brandLabel}
                    </div>
                    {group.isCurrent && <span style={{ fontSize: 10, fontWeight: 800, color: "var(--tf-28a745)", background: "rgba(40,167,69,0.12)", borderRadius: 10, padding: "2px 10px", textTransform: "uppercase" }}>In corso</span>}
                  </div>
                  <div className="p-4 space-y-4">
                    {group.items.map((it, ii) => (
                      <CartItem key={ii} it={it} ii={ii} gi={gi} total={group.items.length} expI={expI} setExpI={setExpI} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="sticky top-24" style={{ background: "var(--tf-w20)", borderRadius: 14, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tf-8892b0)", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>Resoconto</div>
                <div className="mb-4">
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--tf-w60)" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--tf-64748b)", textTransform: "uppercase" }}>Totale Brand</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--tf-f8fafc)" }}>{cart.length + (colItems().length > 0 ? 1 : 0)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--tf-w60)" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--tf-64748b)", textTransform: "uppercase" }}>Totale Prodotti</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--tf-f8fafc)" }}>{tCI}</span>
                  </div>
                </div>

                {/* ATTRIBUZIONE & ALLEGATI (pelle RV: kicker verde, riquadri tratteggiati) */}
                <div className="mt-6 mb-6">
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tf-28a745)", marginBottom: 12, textTransform: "uppercase" }}>🏪 Attribuzione & Allegati</div>

                  {/* Il campo NEGOZIO è stato TOLTO (Luca 28/07): la pratica dell'agente
                      è dell'AGENZIA e di chi l'ha inserita — il negozio di attivazione
                      lo deciderà il back office dalla Gestione PDA. */}
                  <div className="space-y-4 mb-6 relative z-50">
                    <div>
                      <Label text="Data Vendita" required />
                      <input type="date" className="w-full glass-input text-sm py-2.5 shadow-sm focus:border-violet-500/50" value={dataVendita} onChange={e => setDataVendita(e.target.value)} />
                    </div>
                  </div>

                  <NoteStep mini />

                  <div className="mt-6 relative">
                    {uploading && <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center rounded-xl"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>}
                    <Label text="Allegati (Trascina o clicca)" />
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {[{ l: "Identità", i: "🪪", t: "identity" }, { l: "Contratti", i: "📄", t: "contract" }, { l: "Altro", i: "📁", t: "other" }].map(a => {
                        const cnt = attachments.filter(at => at.type === a.t).length;
                        return (
                          <label key={a.l} className="cursor-pointer group flex flex-col items-center"
                            style={{ border: "2px dashed " + (cnt > 0 ? "rgba(23,162,184,0.55)" : "var(--tf-w100)"), borderRadius: 10, padding: "12px 8px", textAlign: "center", background: cnt > 0 ? "rgba(23,162,184,0.08)" : "var(--tf-w30)", transition: "all .12s" }}>
                            <input type="file" multiple className="hidden" onChange={(e) => handleFileChange(e, a.t)} />
                            <div className="text-xl mb-1 group-hover:scale-110 transition-transform">{a.i}</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tf-8892b0)", textTransform: "uppercase" }}>{a.l}</div>
                            {cnt > 0 && <div style={{ marginTop: 5, fontSize: 10, color: "var(--tf-17a2b8)", fontWeight: 700 }}>{cnt} file</div>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {colItems().length > 0 && (
                    <button onClick={addCart}
                      style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "1px solid var(--tf-w100)", background: "var(--tf-w20)", color: "var(--tf-8892b0)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      📦 + Aggiungi altro brand
                    </button>
                  )}
                  {/* stesso stile del "💾 Salva vendita" di Registra Vendita */}
                  <button onClick={finalSubmit} disabled={tCI === 0}
                    style={tCI > 0
                      ? { width: "100%", padding: "13px 0", borderRadius: 10, border: "2px solid var(--tf-28a745)", background: "rgba(40,167,69,0.12)", color: "var(--tf-28a745)", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }
                      : { width: "100%", padding: "13px 0", borderRadius: 10, border: "2px solid var(--tf-w100)", background: "var(--tf-w30)", color: "var(--tf-64748b)", fontSize: 14, fontWeight: 800, cursor: "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    📨 Invia PDA
                  </button>
                </div>
                <p style={{ fontSize: 10, color: "var(--tf-64748b)", textAlign: "center", marginTop: 12, textTransform: "uppercase", fontWeight: 700 }}>I dati verranno salvati nel sistema centralizzato</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div>
          {/* BARRA STEP RICCA — stessa di Registra Vendita (classi rvsteps in
              globals.css, già pronte per il tema chiaro): nodi con anello di
              avanzamento conico, logo del brand scelto, etichetta + stato. */}
          {(() => {
            const cli100 = !!tipoCliente && lookupDone
              && !(tipoCliente === "business" && (!String(anBusiness.referente || "").trim() || !/^[A-Z0-9]{16}$/.test(String(anBusiness.cfReferente || "").trim().toUpperCase())));
            const STEPS = [
              { n: 1, label: "Venditore", icona: <span>{venditore ? "👤" : "🧑‍💼"}</span>, perc: venditore ? 100 : 0, abil: true },
              { n: 2, label: "Cliente", icona: <span>{tipoCliente ? (tipoCliente === "privato" ? "👤" : "🏢") : "🧑‍💼"}</span>, perc: !tipoCliente ? 0 : (cli100 ? 100 : 50), abil: !!venditore },
              {
                n: 3, label: "Brand",
                icona: currentBrand?.logo
                  ? <Image src={currentBrand.logo} alt={currentBrand.label} width={84} height={30} style={{ height: 26, width: "auto", maxWidth: 82, objectFit: "contain" }} />
                  : <span>🏷️</span>,
                perc: (brand || cart.length > 0) ? 100 : 0, abil: cli100,
              },
              { n: 4, label: "Prodotti", icona: <span>🛒</span>, perc: tCI > 0 ? 100 : (step === 4 ? 50 : 0), abil: !!brand || cart.length > 0 },
            ];
            const doneCount = STEPS.filter(s => s.perc >= 100).length;
            const railPct = Math.min(100, (doneCount / (STEPS.length - 1)) * 100);
            return (
              <div className="rvsteps">
                <div className="rvsteps-rail"><i style={{ width: railPct + "%" }} /></div>
                {STEPS.map(st => {
                  const attivo = step === st.n;
                  const fatto = st.perc >= 100;
                  const ringC = fatto ? "#22c55e" : "#6d5cff";
                  const sub = fatto ? "Completo" : attivo ? "Sei qui" : st.perc > 0 ? st.perc + "%" : st.abil ? "Da fare" : "Bloccato";
                  return (
                    <button key={st.n} type="button" disabled={!st.abil}
                      className={"rvnode-step" + (attivo ? " is-active" : "") + (fatto ? " is-done" : "") + (st.abil ? "" : " is-locked")}
                      onClick={() => { if (st.abil) setStep(st.n); }}
                      title={!st.abil ? "Completa prima gli step precedenti" : attivo ? "Sei qui" : "Vai a " + st.label}>
                      <span className="rvnode-ring" style={{ background: `conic-gradient(${ringC} ${st.perc}%, var(--rv-track) 0)` }}>
                        <span className="rvnode">{st.icona}</span>
                        {fatto && <span className="rvnode-check">✓</span>}
                      </span>
                      <span className="rvnode-lab">{st.label}</span>
                      <span className="rvnode-sub">{sub}</span>
                    </button>
                  );
                })}
              </div>
            );
          })()}

          <div>
            {/* CART BAR — riassunto carrello cliccabile, pelle RV */}
            {cart.length > 0 && (
              <div onClick={() => setShowCart(true)} role="button"
                style={{ background: "var(--tf-w20)", borderRadius: 14, padding: 14, marginBottom: 12, borderLeft: "4px solid #6f42c1", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                className="group hover:bg-white/5 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 group-hover:scale-110 transition-transform">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--tf-6f42c1)", textTransform: "uppercase" }}>🛒 Carrello PDA</div>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {cart.map((g, i) => (
                        <span key={i} style={{ background: "var(--tf-w30)", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, color: "var(--tf-e2e8f0)" }}>
                          {g.brandLabel} <span style={{ color: "var(--tf-64748b)", fontWeight: 600 }}>x{g.items.length}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--tf-6f42c1)", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>Riepilogo <ChevronRight className="w-3 h-3" /></span>
              </div>
            )}

            {/* ══ STEP 1 — VENDITORE ══ */}
            {step === 1 && (
              <>
                <StepCard title="Venditore — chi invia la PDA" color="var(--tf-6f42c1)" icon="👤">
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
                </StepCard>
                <NavBar onNext={goNext} canNext={canProceed()} isFirst />
              </>
            )}

            {/* ══ STEP 2 — CLIENTE (due card come RV: tipo+ricerca, poi anagrafica) ══ */}
            {step === 2 && (
              <>
                <StepCard title="Cliente — tipo e ricerca" color="var(--tf-6f42c1)" icon="👥">
                  <div style={{ display: "flex", gap: 12, marginBottom: tipoCliente ? 16 : 0 }}>
                    {[{ id: "privato", icon: "👤", label: "Privato" }, { id: "business", icon: "🏢", label: "Business" }].map(o => (
                      <button key={o.id} type="button"
                        onClick={() => { setTipoCliente(o.id); setLookupDone(false); setClienteFound(false); setLookupValue(""); setBrand(null); setAllSales({}); }}
                        style={{ flex: 1, padding: 12, borderRadius: 10, border: tipoCliente === o.id ? "2px solid #6f42c1" : "2px solid var(--tf-w60)", background: tipoCliente === o.id ? "rgba(111,66,193,0.12)" : "var(--tf-w40)", cursor: "pointer", textAlign: "center" }}>
                        <div style={{ fontSize: 22, marginBottom: 2 }}>{o.icon}</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: tipoCliente === o.id ? "var(--tf-6f42c1)" : "var(--tf-f8fafc)" }}>{o.label}</div>
                      </button>
                    ))}
                  </div>

                  {tipoCliente && (
                    <div style={{ background: "var(--tf-w30)", borderRadius: 8, padding: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tf-8892b0)", marginBottom: 8 }}>Cliente esistente — cerca per CF/P.IVA, cellulare, nome e cognome o ragione sociale</div>
                      <div className="flex gap-3 items-start">
                        {/* ricerca STANDARD del CRM, identica a Registra Vendita (Luca 31/07) */}
                        <RicercaCliente
                          tipo={tipoCliente === "privato" ? "consumer" : "business"}
                          className="flex-1"
                          onScelto={applicaClientePda}
                        />
                        <button onClick={() => { setClienteFound(false); setLookupDone(true); }}
                          style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid var(--tf-w180)", background: "var(--tf-w40)", color: "var(--tf-cbd5e1)", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                          ✏️ Nuovo
                        </button>
                      </div>
                      {clienteFound && <div style={{ marginTop: 10, background: "rgba(40,167,69,0.12)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--tf-28a745)" }}>✅ Cliente trovato in anagrafica — dati pre-compilati</div>}
                      {lookupDone && !clienteFound && <div style={{ marginTop: 10, background: "rgba(245,158,11,0.12)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--tf-f59e0b)" }}>⚠ Cliente non presente in anagrafica — compila i dati a mano</div>}
                    </div>
                  )}
                </StepCard>

                {tipoCliente && lookupDone && (
                  <StepCard title="Anagrafica" color="var(--tf-8fb4dd)" stripe="#1B3A5C" icon="📝"
                    badge={tipoCliente === "privato" ? "Consumer" : "Business"}>
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
                          <AFieldIndirizzo label="Domicilio" value={anConsumer.domicilio} onChange={v => setAnConsumer(p => ({ ...p, domicilio: v }))} pf={clienteFound} ph="Via, Numero, CAP, Città" span2 />
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
                          {/* CF del REFERENTE obbligatorio (03/08, mig. 139) */}
                          <AField label="CF Referente" required value={anBusiness.cfReferente} onChange={v => setAnBusiness(p => ({ ...p, cfReferente: String(v).toUpperCase().replace(/\s+/g, "") }))} pf={clienteFound} ph="RSSMRA80A01H501B" mono />
                          <AField label="Numero Fisso" value={anBusiness.numeroFisso} onChange={v => setAnBusiness(p => ({ ...p, numeroFisso: v }))} pf={clienteFound} ph="06 1234567" />
                          <AField label="Numero Mobile" value={anBusiness.mobile} onChange={v => setAnBusiness(p => ({ ...p, mobile: v }))} pf={clienteFound} ph="333 1234567" />
                          <AField label="Email" value={anBusiness.email} onChange={v => setAnBusiness(p => ({ ...p, email: v }))} pf={clienteFound} ph="info@rossi.it" />
                          <AField label="Pec" value={anBusiness.pec} onChange={v => setAnBusiness(p => ({ ...p, pec: v }))} pf={clienteFound} ph="azienda@pec.it" />
                          <AField label="Codice Univoco / SDI" value={anBusiness.codiceUnivoco} onChange={v => setAnBusiness(p => ({ ...p, codiceUnivoco: v }))} pf={clienteFound} ph="Abc1234" mono />
                          <AField label="IBAN" value={anBusiness.iban} onChange={v => setAnBusiness(p => ({ ...p, iban: v }))} pf={clienteFound} ph="It00..." mono span2 />
                          <AFieldIndirizzo label="Sede Legale" value={anBusiness.sedeLegale} onChange={v => setAnBusiness(p => ({ ...p, sedeLegale: v }))} pf={clienteFound} ph="Via, Numero, CAP, Città" span2 />
                          <div className="col-span-full">
                            <Label text="Note" />
                            <textarea className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500/50 transition-colors"
                              value={anBusiness.note} onChange={e => setAnBusiness(p => ({ ...p, note: e.target.value }))} placeholder="Note aggiuntive..." rows={3} />
                          </div>
                        </>
                      )}
                    </div>
                  </StepCard>
                )}
                <NavBar onBack={goBack} onNext={goNext} canNext={canProceed()} />
              </>
            )}

            {/* ══ STEP 3 — BRAND (griglia solo-logo identica a RV, Luca 03-04/08) ══ */}
            {step === 3 && (
              <>
                <StepCard title="Scegli il brand" color="var(--tf-8892b0)" noStripe>
                  {tipoCliente === "business" && (
                    <div style={{ marginBottom: 14, background: "rgba(111,66,193,0.12)", borderRadius: 6, padding: "7px 12px", fontSize: 12, fontWeight: 600, color: "var(--tf-6f42c1)", display: "flex", alignItems: "center", gap: 6 }}>
                      <Info className="w-4 h-4" /> Modalità Business — tutti i brand inclusi
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 14 }}>
                    {visibleBrands.map(b => {
                      const sel = brand === b.id;
                      const nBr = cart.filter(g => g.brandId === b.id).reduce((s, g) => s + g.items.length, 0);
                      return (
                        <button
                          key={b.id} type="button"
                          onClick={() => { setBrand(b.id); setAllSales({}); }}
                          title={`${b.label} — ${b.desc}`}
                          style={{ padding: "26px 16px", borderRadius: 14, border: sel ? "2px solid " + b.color : "2px solid var(--tf-w60)", background: sel ? b.color + "14" : "var(--tf-w20)", cursor: "pointer", textAlign: "center", position: "relative", overflow: "hidden", transition: "border-color .15s,background .15s" }}
                          onMouseEnter={e => { if (!sel) { e.currentTarget.style.borderColor = b.color; e.currentTarget.style.background = "var(--tf-w50)"; } }}
                          onMouseLeave={e => { if (!sel) { e.currentTarget.style.borderColor = "var(--tf-w60)"; e.currentTarget.style.background = "var(--tf-w20)"; } }}
                        >
                          {nBr > 0 && <span style={{ position: "absolute", top: 8, right: 8, background: b.color, color: "#fff", borderRadius: 10, padding: "2px 10px", fontSize: 12, fontWeight: 800, zIndex: 3 }}>{nBr}</span>}
                          {/* SOLO il logo, grande e centrato (Luca 04/08, come Registra
                              Vendita): via nome e sottotitolo mobile/fisso/luce&gas.
                              Scala OTTICA per i wordmark annegati nel canvas. */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 88 }}>
                            {b.logo
                              ? <Image src={b.logo} alt={b.label} width={260} height={88}
                                  style={{ height: 84, width: "auto", maxWidth: "92%", objectFit: "contain", transform: `scale(${({ w3: 1.7, fastweb: 1.75 })[b.id] || 1})` }} />
                              : <span style={{ fontSize: 20, fontWeight: 700, color: "var(--tf-f8fafc)" }}>{b.label}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </StepCard>
                <NavBar onBack={goBack} onNext={goNext} canNext={canProceed()} />
              </>
            )}

            {/* ══ STEP 4 — PRODOTTI ══ */}
            {step === 4 && (
              <>
                <StepCard title="Prodotti e Contratto" color={currentBrand?.color || "var(--tf-2e75b6)"} icon="📂"
                  badge={`${currentBrand?.label} · ${tipoCliente === "business" ? "Business" : "Consumer"}`}>
                  {Object.keys(brandProdotti).length > 0
                    ? <div className="space-y-4">
                      {Object.entries(brandProdotti).map(([cat, prods]) => renderCategoria(cat, prods))}
                    </div>
                    : (
                      <div style={{ textAlign: "center", padding: "64px 0", background: "var(--tf-w30)", borderRadius: 14, border: "2px dashed var(--tf-w100)" }}>
                        <div style={{ fontSize: 34, marginBottom: 10, opacity: .5 }}>🚧</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--tf-64748b)", textTransform: "uppercase", letterSpacing: 2 }}>Nessun prodotto disponibile per questa selezione</div>
                      </div>
                    )
                  }
                </StepCard>

                {/* Footer wizard RV: Indietro/Reset a sinistra, Avanti a DESTRA (Luca 04/08) */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 20, marginTop: 8, gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={goBack} style={{ padding: "11px 20px", borderRadius: 10, border: "1px solid var(--tf-w100)", background: "var(--tf-w20)", color: "var(--tf-8892b0)", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>← Indietro</button>
                    {confirmReset ? (
                      <div className="flex items-center gap-2 animate-in fade-in duration-200">
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--tf-dc3545)", textTransform: "uppercase" }}>Sei sicuro?</span>
                        <button onClick={reset} style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: "var(--tf-dc3545)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Sì, resetta</button>
                        <button onClick={() => setConfirmReset(false)} style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid var(--tf-w100)", background: "var(--tf-w20)", color: "var(--tf-8892b0)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Annulla</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmReset(true)} style={{ padding: "11px 22px", borderRadius: 10, border: "2px solid #dc3545", background: "var(--tf-w20)", color: "var(--tf-dc3545)", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>🗑️ Reset form</button>
                    )}
                    {brand && (
                      <button onClick={addCart} title="Metti nel carrello i prodotti di questo brand e scegline un altro"
                        style={{ padding: "11px 22px", borderRadius: 10, border: "1px solid var(--tf-w100)", background: "var(--tf-w20)", color: "var(--tf-8892b0)", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>📦 Cambia brand</button>
                    )}
                  </div>
                  <button onClick={() => setShowCart(true)}
                    style={{ padding: "11px 30px", borderRadius: 10, border: "1.5px solid rgba(99,102,241,0.6)", background: "rgba(99,102,241,0.14)", color: "var(--tf-c7d2fe)", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                    Avanti — riepilogo →
                    {tCI > 0 && <span style={{ background: "var(--tf-ffd800)", color: "#111", borderRadius: 10, padding: "1px 9px", fontSize: 12, fontWeight: 900 }}>{tCI}</span>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL CF */}
      {showCF && tipoCliente === "privato" && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-[#1a1d29] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden relative my-auto max-h-[95vh] sm:max-h-[90vh] flex flex-col">
            <div className="p-4 sm:p-5 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#1a1d29]/95 backdrop-blur z-10 shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span className="text-violet-400">🧮</span> Calcolo Codice Fiscale
              </h3>
              <button type="button" onClick={() => setShowCF(false)} className="p-2 -m-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 touch-manipulation" aria-label="Chiudi">✕</button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto min-h-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label text="Nome" required />
                  <input type="text" value={cfD.nome} onChange={e => setCfD(p => ({ ...p, nome: e.target.value }))} className="w-full glass-input text-sm rounded-xl py-2.5 sm:py-2 px-3 min-h-[44px] focus:border-violet-500/50" placeholder="Mario" />
                </div>
                <div>
                  <Label text="Cognome" required />
                  <input type="text" value={cfD.cognome} onChange={e => setCfD(p => ({ ...p, cognome: e.target.value }))} className="w-full glass-input text-sm rounded-xl py-2.5 sm:py-2 px-3 min-h-[44px] focus:border-violet-500/50" placeholder="Rossi" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label text="Sesso" required />
                  <div className="flex gap-2">
                    {["M", "F"].map(sx => (
                      <button key={sx} type="button" onClick={() => setCfD(p => ({ ...p, sesso: sx }))} className={`flex-1 py-2.5 sm:py-1.5 rounded-xl text-sm font-bold transition-all min-h-[44px] touch-manipulation ${cfD.sesso === sx ? "bg-violet-500 text-white shadow-lg shadow-violet-500/20" : "bg-white/5 text-slate-400 border border-white/10"}`}>{sx === "M" ? "♂ M" : "♀ F"}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label text="Data di Nascita" required />
                  <div className="flex gap-2">
                    <input type="text" value={cfD.giorno} onChange={e => setCfD(p => ({ ...p, giorno: e.target.value }))} placeholder="GG" maxLength={2} className="w-14 sm:w-12 text-center glass-input rounded-xl text-sm py-2.5 sm:py-2 min-h-[44px] focus:border-violet-500/50" />
                    <select value={cfD.mese} onChange={e => setCfD(p => ({ ...p, mese: e.target.value }))} className="flex-1 min-w-0 glass-input rounded-xl text-sm py-2.5 sm:py-2 px-2 text-slate-300 bg-[#1a1d29] min-h-[44px] focus:border-violet-500/50">
                      <option value="">MM</option>
                      {["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input type="text" value={cfD.anno} onChange={e => setCfD(p => ({ ...p, anno: e.target.value }))} placeholder="AAAA" maxLength={4} className="w-16 sm:w-14 text-center glass-input rounded-xl text-sm py-2.5 sm:py-2 min-h-[44px] focus:border-violet-500/50" />
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

            <div className="p-4 sm:p-5 border-t border-white/5 bg-black/20 shrink-0">
              <button type="button" onClick={doCF} className="w-full py-3.5 sm:py-3 min-h-[48px] bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl text-sm font-bold uppercase tracking-widest shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all flex items-center justify-center gap-2 touch-manipulation">
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
          <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">Guida rapida — Invia PDA</h4>
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

// Card di sezione — stessa pelle delle card di Registra Vendita: superficie
// var(--tf-w20), radius 14, stanghetta colorata a sinistra e kicker maiuscolo.
// `stripe` permette una stanghetta di colore diverso dal testo (es. Anagrafica
// RV: stanghetta #1B3A5C, kicker azzurro); `noStripe` la toglie (griglia brand).
function StepCard({ title, color, icon, badge, children, noStripe, stripe }) {
  return (
    <div className="animate-in fade-in duration-200"
      style={{ background: "var(--tf-w20)", borderRadius: 14, padding: 18, marginBottom: 12, borderLeft: noStripe ? undefined : "4px solid " + (stripe || color) }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: .6 }}>
          {icon ? icon + " " : ""}{title}
        </div>
        {badge && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--tf-8892b0)", background: "var(--tf-w30)", borderRadius: 6, padding: "3px 10px", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            {badge}
          </span>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

// Footer di navigazione — convenzione wizard di Registra Vendita (Luca 04/08):
// "← Indietro" a sinistra, "Avanti →" a DESTRA in indaco tenue.
function NavBar({ onBack, onNext, canNext, isFirst }) {
  return (
    <div style={{ display: "flex", justifyContent: isFirst ? "flex-end" : "space-between", alignItems: "center", gap: 10, marginTop: 8, paddingBottom: 20 }}>
      {!isFirst && (
        <button onClick={onBack} style={{ padding: "11px 20px", borderRadius: 10, border: "1px solid var(--tf-w100)", background: "var(--tf-w20)", color: "var(--tf-8892b0)", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          ← Indietro
        </button>
      )}
      <button onClick={onNext} disabled={!canNext}
        style={canNext
          ? { padding: "11px 30px", borderRadius: 10, border: "1.5px solid rgba(99,102,241,0.6)", background: "rgba(99,102,241,0.14)", color: "var(--tf-c7d2fe)", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }
          : { padding: "11px 30px", borderRadius: 10, border: "1.5px solid var(--tf-w100)", background: "var(--tf-w80)", color: "var(--tf-64748b)", fontSize: 14, fontWeight: 800, cursor: "not-allowed", display: "flex", alignItems: "center", gap: 6 }}>
        Avanti →
      </button>
    </div>
  );
}

// Etichetta campo — stessa taglia delle label di Registra Vendita (TF).
function Label({ text, required, note }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--tf-8892b0)" }}>
        {text}
        {required && <span style={{ color: "var(--tf-dc3545)", marginLeft: 3 }}>*</span>}
      </span>
      {note && <span style={{ fontSize: 10, fontStyle: "italic", color: "var(--tf-64748b)", textTransform: "uppercase" }}>{note}</span>}
    </div>
  );
}

function SearchableSelect({ options, value, onChange, placeholder, icon }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState({});

  const updatePosition = useCallback(() => {
    if (containerRef.current && typeof document !== "undefined") {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
        zIndex: 9998,
      });
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current?.contains(event.target)) return;
      if (event.target.closest?.("[data-searchable-select-dropdown]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  const dropdownEl = open && (
    <div
      data-searchable-select-dropdown
      className="w-full bg-[#1a1d29] border border-white/10 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-black/50"
      style={dropdownStyle}
    >
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
  );

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
      {typeof document !== "undefined" && dropdownEl && dropdownStyle.position === "fixed" && createPortal(dropdownEl, document.body)}
    </div>
  );
}

// INDIRIZZO con AUTOCOMPLETE (Luca 28/07): si sceglie dalla lista e il campo
// unico si compila con "Via civico, CAP Città"; a mano solo se non trovato.
function AFieldIndirizzo({ label, value, onChange, pf, ph, span2 }) {
  return (
    <div className={`space-y-1.5 ${span2 ? 'col-span-full' : ''}`}>
      <Label text={label} />
      <IndirizzoAutocomplete value={value || ""} onChange={onChange} onPick={s => onChange(s.completo)} placeholder={ph}
        className={`w-full glass-input text-sm rounded-xl py-2.5 px-4 outline-none transition-all ${pf && value ? 'border-emerald-500/50 bg-emerald-500/5' : ''}`} />
    </div>
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
  const NEGOZI = useStores();
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
