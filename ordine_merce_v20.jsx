import { useState, useMemo, useCallback } from "react";

/* ═══════════════════════════════════════════════════
   ORDINE MERCE v2 — Telefutura CRM
   ═══════════════════════════════════════════════════ */

const C = {
  bg:"#f4f5f7", card:"#ffffff", border:"#e2e5ea",
  primary:"#2563eb", primaryHover:"#1d4ed8", primaryLight:"#eff6ff",
  success:"#16a34a", successBg:"#f0fdf4",
  warning:"#d97706", warningBg:"#fffbeb",
  danger:"#dc2626", dangerBg:"#fef2f2",
  info:"#7c3aed", infoBg:"#f5f3ff",
  orange:"#ea580c", orangeBg:"#fff7ed",
  gray:"#6b7280", grayLight:"#9ca3af", grayBg:"#f9fafb",
  text:"#111827", textSec:"#4b5563",
};

/* ─── Stati ordine ─── */
const STATUS = {
  nuovo:       { label:"Nuovo",          color:C.primary, bg:C.primaryLight, icon:"🆕" },
  lavorazione: { label:"In Lavorazione", color:C.warning, bg:C.warningBg,   icon:"⏳" },
  parziale:    { label:"Parz. Evaso",    color:C.info,    bg:C.infoBg,      icon:"📦" },
  evaso:       { label:"Evaso",          color:C.success, bg:C.successBg,   icon:"✅" },
  annullato:   { label:"Annullato",      color:C.danger,  bg:C.dangerBg,    icon:"❌" },
};

/* ─── Stati singola voce ─── */
const ITEM_STATUS = {
  pending:     { label:"In Attesa",       color:C.gray,    bg:C.grayBg },
  ordinato:    { label:"Ordinato",        color:C.orange,  bg:C.orangeBg },
  evaso:       { label:"Evaso",           color:C.success, bg:C.successBg },
  non_disponibile: { label:"Non Disponibile", color:C.danger, bg:C.dangerBg },
};

/* ─── Auto-compute order status from item statuses ─── */
const computeOrderStatus = (items, currentStatus) => {
  if (currentStatus === "annullato") return "annullato";
  if (items.length === 0) return currentStatus;
  const allPending = items.every(i => i.itemStatus === "pending");
  const allResolved = items.every(i => i.itemStatus === "evaso" || i.itemStatus === "non_disponibile");
  const someResolved = items.some(i => i.itemStatus === "evaso" || i.itemStatus === "non_disponibile");
  const someOrdinato = items.some(i => i.itemStatus === "ordinato");
  const somePending = items.some(i => i.itemStatus === "pending");
  if (allResolved) return "evaso";
  if (someResolved && (someOrdinato || somePending)) return "parziale";
  if (someOrdinato && !someResolved) return "lavorazione";
  if (allPending) return "nuovo";
  return currentStatus;
};

/* ─── Brands ─── */
const BRANDS = [
  { id:"vodafone", name:"Vodafone",  color:"#e60000" },
  { id:"fastweb",  name:"Fastweb",   color:"#ffd800" },
  { id:"wind3",    name:"WindTre",    color:"#ff6600" },
  { id:"sky",      name:"Sky",        color:"#0072ce" },
  { id:"iliad",    name:"Iliad",      color:"#d31118" },
  { id:"homobile", name:"Ho Mobile",  color:"#000000" },
  { id:"tim",      name:"Tim",        color:"#003d7a" },
];

/* ─── Brand → sotto-categoria → items ─── */
/* When a brand+sub combo needs a channel picker, items is an object of { channelId: { label, items[] } }
   Otherwise items is a flat array (or per-brand object as before) */
const BRAND_SUB = {
  sim: { label:"SIM", icon:"💳", items:{
    vodafone:{
      _hasChannels: true,
      channels: {
        vdf_store: { label:"Vodafone Store", items:["Sostituzioni","E Sim","E Sim Next","Sim Next"] },
        vnd:       { label:"VND",            items:["Sostituzioni","E Sim","E Sim Next","Sim Next"] },
      }
    },
    fastweb:["Sim","ESim","Sostitutiva","ESim Sostitutiva"],
    wind3:{
      _hasChannels: true,
      channels: {
        telefutura:  { label:"Telefutura",   items:["Sim 893988","Sim 893999","Sostitutiva 893988","Sostitutiva 893999","ESim 893988","Sostitutiva ESim 893988","Sostitutiva ESim 893999","Sim Abbonamento","Sim Very Mobile","Sostitutiva Very Mobile"] },
        telefutura2: { label:"Telefutura 2", items:["Sim 893988","Sim 893999","Sostitutiva 893988","Sostitutiva 893999","ESim 893988","Sostitutiva ESim 893988","Sostitutiva ESim 893999","Sim Abbonamento","Sim Very Mobile","Sostitutiva Very Mobile"] },
      }
    },
    sky:["Sim Sky"],
    iliad:["Sim Iliad"],
    homobile:["Sim Ho Mobile"],
    tim:["Sim","Sostituzione"],
  }},
  telefoni: { label:"Telefoni", icon:"📱", items:{
    vodafone: { _isPhone: true },
    fastweb:  { _isPhone: true },
    wind3:    { _isPhone: true },
  }},
  accessori_brand: { label:"Accessori Brand", icon:"🎧", items:{
    wind3:{
      _hasAccessoriSub: true,
      subCategories: {
        cavi:       { label:"Cavi",       icon:"🔌", items:["USB → Type-C","USB → Apple","Type-C → Type-C","Type-C → Apple"] },
        travel:     { label:"Travel",     icon:"🔋", items:["25W","30W","45W"] },
        powerbank:  { label:"Power Bank", icon:"🔌", items:["5.000 mAh","10.000 mAh","20.000 mAh","MagSafe"] },
        auricolari: { label:"Auricolari", icon:"🎧", items:["Jack Audio 3.5","Type-C"] },
        earbuds:    { label:"Earbuds",    icon:"🎵", _isProduct: true },
      }
    },
  }},
  dispositivi_wifi: { label:"Dispositivi Wi-Fi", icon:"📶", items:{
    vodafone:["B311 Mi-Fi","Box Wi-Fi","Extender"],
    wind3:["Box Wi-Fi","Torre Indoor","Torre Outdoor","Telefono Fisso"],
  }},
};

/* ─── Phone Catalog: phoneBrand → models → capacities/colors ─── */
const PHONE_BRANDS = [
  { id:"apple",    name:"Apple",    color:"#555555" },
  { id:"samsung",  name:"Samsung",  color:"#1428a0" },
  { id:"xiaomi",   name:"Xiaomi",   color:"#ff6900" },
  { id:"oppo",     name:"OPPO",     color:"#1a6e37" },
  { id:"google",   name:"Google",   color:"#4285f4" },
  { id:"motorola", name:"Motorola", color:"#5c2d91" },
  { id:"zte",      name:"ZTE",      color:"#0068b7" },
  { id:"realme",   name:"Realme",   color:"#f5c518" },
  { id:"honor",    name:"Honor",    color:"#0ab4e6" },
  { id:"tcl",      name:"TCL",      color:"#e4002b" },
];

const PHONE_CATALOG = {
  apple: [
    { id:"ip16pro_max", name:"iPhone 16 Pro Max", capacities:["128GB","256GB","512GB","1TB"], colors:["Titanio Naturale","Titanio Nero","Titanio Bianco","Titanio Sabbia"] },
    { id:"ip16pro",     name:"iPhone 16 Pro",     capacities:["128GB","256GB","512GB","1TB"], colors:["Titanio Naturale","Titanio Nero","Titanio Bianco","Titanio Sabbia"] },
    { id:"ip16",        name:"iPhone 16",         capacities:["128GB","256GB","512GB"],       colors:["Nero","Bianco","Rosa","Verde","Blu"] },
    { id:"ip16plus",    name:"iPhone 16 Plus",    capacities:["128GB","256GB","512GB"],       colors:["Nero","Bianco","Rosa","Verde","Blu"] },
    { id:"ip15",        name:"iPhone 15",         capacities:["128GB","256GB","512GB"],       colors:["Nero","Blu","Verde","Giallo","Rosa"] },
    { id:"ipse4",       name:"iPhone SE 4",       capacities:["128GB","256GB"],               colors:["Nero","Bianco","Rosso"] },
  ],
  samsung: [
    { id:"s25ultra", name:"Galaxy S25 Ultra",  capacities:["256GB","512GB","1TB"],  colors:["Titanium Black","Titanium Gray","Titanium Silver","Titanium Blue"] },
    { id:"s25plus",  name:"Galaxy S25+",       capacities:["256GB","512GB"],        colors:["Navy","Ice Blue","Silver","Mint"] },
    { id:"s25",      name:"Galaxy S25",        capacities:["128GB","256GB"],        colors:["Navy","Ice Blue","Silver","Mint"] },
    { id:"a55",      name:"Galaxy A55",        capacities:["128GB","256GB"],        colors:["Awesome Navy","Awesome Lemon","Awesome Lilac","Awesome Ice Blue"] },
    { id:"a35",      name:"Galaxy A35",        capacities:["128GB","256GB"],        colors:["Awesome Navy","Awesome Lemon","Awesome Lilac","Awesome Ice Blue"] },
    { id:"a25",      name:"Galaxy A25",        capacities:["128GB","256GB"],        colors:["Blu","Nero","Giallo"] },
    { id:"a16",      name:"Galaxy A16",        capacities:["64GB","128GB"],         colors:["Nero","Blu","Oro"] },
  ],
  xiaomi: [
    { id:"x15",       name:"Xiaomi 15",          capacities:["256GB","512GB"],  colors:["Nero","Bianco","Verde"] },
    { id:"x14",       name:"Xiaomi 14",          capacities:["256GB","512GB"],  colors:["Nero","Bianco","Verde"] },
    { id:"rn13pro",   name:"Redmi Note 13 Pro",  capacities:["128GB","256GB"],  colors:["Nero","Blu","Viola"] },
    { id:"rn13",      name:"Redmi Note 13",      capacities:["128GB","256GB"],  colors:["Nero","Blu","Verde Menta"] },
    { id:"r13",       name:"Redmi 13",           capacities:["128GB","256GB"],  colors:["Nero","Blu","Rosa"] },
  ],
  oppo: [
    { id:"reno12pro", name:"Reno 12 Pro",  capacities:["256GB","512GB"],  colors:["Nebula Silver","Amber Orange"] },
    { id:"reno12",    name:"Reno 12",      capacities:["128GB","256GB"],  colors:["Nebula Silver","Amber Orange","Astro Pink"] },
    { id:"a79",       name:"A79",          capacities:["128GB","256GB"],  colors:["Nero","Verde"] },
    { id:"a18",       name:"A18",          capacities:["64GB","128GB"],   colors:["Nero","Blu"] },
  ],
  google: [
    { id:"p9pro",  name:"Pixel 9 Pro",   capacities:["128GB","256GB","512GB"], colors:["Obsidian","Porcelain","Hazel","Rose"] },
    { id:"p9",     name:"Pixel 9",       capacities:["128GB","256GB"],         colors:["Obsidian","Porcelain","Wintergreen","Peony"] },
    { id:"p8a",    name:"Pixel 8a",      capacities:["128GB","256GB"],         colors:["Obsidian","Porcelain","Bay","Aloe"] },
  ],
  motorola: [
    { id:"edge50pro",  name:"Edge 50 Pro",   capacities:["256GB","512GB"],  colors:["Nero","Blu","Vaniglia"] },
    { id:"edge50",     name:"Edge 50",       capacities:["256GB"],          colors:["Nero","Blu","Pesca"] },
    { id:"g84",        name:"Moto G84",      capacities:["128GB","256GB"],  colors:["Nero","Blu"] },
  ],
  zte: [
    { id:"blade_v50",  name:"Blade V50",       capacities:["128GB","256GB"],  colors:["Nero","Blu","Verde"] },
    { id:"blade_a73",  name:"Blade A73",       capacities:["128GB"],          colors:["Nero","Blu"] },
    { id:"blade_a53",  name:"Blade A53 Pro",   capacities:["64GB","128GB"],   colors:["Nero","Blu"] },
  ],
  realme: [
    { id:"rm12pro",   name:"Realme 12 Pro+",  capacities:["256GB","512GB"],  colors:["Blu","Verde"] },
    { id:"rm12",      name:"Realme 12",       capacities:["128GB","256GB"],  colors:["Nero","Verde","Blu"] },
    { id:"rmc55",     name:"Realme C55",      capacities:["64GB","128GB"],   colors:["Nero","Oro"] },
    { id:"rmn50",     name:"Realme Note 50",  capacities:["64GB","128GB"],   colors:["Nero","Blu"] },
  ],
  honor: [
    { id:"magic6pro", name:"Magic 6 Pro",     capacities:["256GB","512GB"],  colors:["Nero","Verde","Viola"] },
    { id:"magic6",    name:"Magic 6 Lite",    capacities:["128GB","256GB"],  colors:["Nero","Blu","Verde"] },
    { id:"honor200",  name:"Honor 200",       capacities:["256GB","512GB"],  colors:["Nero","Blu","Rosa"] },
    { id:"honorx8b",  name:"Honor X8b",       capacities:["128GB","256GB"],  colors:["Nero","Argento","Blu"] },
    { id:"honorx6a",  name:"Honor X6a",       capacities:["64GB","128GB"],   colors:["Nero","Verde"] },
  ],
  tcl: [
    { id:"tcl50se",   name:"TCL 50 SE",       capacities:["128GB","256GB"],  colors:["Nero","Blu"] },
    { id:"tcl40se",   name:"TCL 40 SE",       capacities:["128GB"],          colors:["Nero","Grigio","Viola"] },
    { id:"tcl40r",    name:"TCL 40 R",        capacities:["64GB","128GB"],   colors:["Nero","Blu"] },
    { id:"tcl305i",   name:"TCL 305i",        capacities:["32GB","64GB"],    colors:["Nero","Blu"] },
  ],
};

/* ─── Which phone models each operator carries (only VF/FW/W3) ─── */
const OPERATOR_PHONES = {
  vodafone: {
    apple:["ip16pro_max","ip16pro","ip16","ip16plus","ip15","ipse4"],
    samsung:["s25ultra","s25plus","s25","a55","a35","a25"],
    xiaomi:["x15","x14","rn13pro","rn13"],
    oppo:["reno12pro","reno12","a79"],
    google:["p9pro","p9"],
    motorola:["edge50pro","edge50"],
    zte:["blade_v50","blade_a73"],
    realme:["rm12pro","rm12"],
    honor:["magic6pro","honor200","honorx8b"],
    tcl:["tcl50se","tcl40se"],
  },
  fastweb: {
    apple:["ip16","ip15","ipse4"],
    samsung:["a55","a35","a25","a16"],
    xiaomi:["rn13","r13"],
    oppo:["a79","a18"],
    google:[],
    motorola:["g84"],
    zte:["blade_a73","blade_a53"],
    realme:["rmc55","rmn50"],
    honor:["honorx8b","honorx6a"],
    tcl:["tcl40se","tcl40r","tcl305i"],
  },
  wind3: {
    apple:["ip16pro_max","ip16pro","ip16","ip16plus","ip15","ipse4"],
    samsung:["s25ultra","s25plus","s25","a55","a35"],
    xiaomi:["x15","x14","rn13pro"],
    oppo:["reno12pro","reno12"],
    google:["p9pro","p9","p8a"],
    motorola:["edge50pro","edge50"],
    zte:["blade_v50","blade_a73","blade_a53"],
    realme:["rm12pro","rm12","rmc55"],
    honor:["magic6pro","magic6","honor200","honorx8b"],
    tcl:["tcl50se","tcl40se","tcl40r"],
  },
};

/* ─── Prodotti (da banco) per categoria ─── */
const PRODOTTI_CAT = {
  pellicole: { label:"Pellicole", icon:"🛡️", items:["PLV","PLX","Privacy"] },
  cover: { label:"Cover", icon:"📲", _isCover: true },
  cavi: { label:"Cavi", icon:"🔌", items:["Type-C → USB","Type-C → Type-C","USB → Apple","Type-C → Apple"] },
  travel: { label:"Travel", icon:"🔋", items:["Originale Apple","Originale Samsung","Kit Completo","25W","30W","45W","Caricatore Wireless"] },
  powerbank: { label:"Power Bank", icon:"🔋", items:["5.000 mAh","10.000 mAh","20.000 mAh","MagSafe"] },
  auricolari: { label:"Auricolari", icon:"🎧", items:["Jack Audio 3.5","Type-C","Earbuds"] },
  memoria: { label:"Memoria & Storage", icon:"💾", items:[
    "Memory Card 64GB","Memory Card 128GB","Memory Card 256GB","Chiavetta USB-C 64GB","Chiavetta USB-C 128GB",
  ] },
  senior: { label:"Telefoni Senior", icon:"👴", items:[
    "Brondi President","Brondi Magnum","Cordless Singolo","Cordless Doppio","Cordless Trio Panasonic","Cordless Trio Siemens",
  ] },
};

/* ─── Cover: reuse PHONE_BRANDS + PHONE_CATALOG for model selection ─── */
const COVER_BRANDS = [
  ...PHONE_BRANDS,
];

/* ─── Extra per categoria ─── */
const EXTRA_CAT = {
  cancelleria: { label:"Cancelleria", icon:"✏️", items:[
    "Penne","Evidenziatori","Pennarelli","Puntine",
    "Spillatrice","Nastro Adesivo","Nastro Biadesivo","Nastro Carta","Forbici",
    "Buste Trasparenti (Eurofogli)","Elastici","Blocco Appunti",
    "Bianchino","Box Documenti","Rulli Dymo","Pellicola Plastificata","Attache",
  ]},
  pulizia: { label:"Pulizia", icon:"🧴", items:[
    "Panni Microfibra","Guanti Monouso","Sapone Mani","Spray Multiuso",
    "WC Net","Scottex","Carta Igienica","Detersivo","Stracci",
    "Sgrassatore","Sacchi Piccoli","Sacchi Grandi","Deodorante Spray",
    "Profumatore","Spirito","Ammoniaca","Swiffer",
  ]},
  stampa: { label:"Stampa", icon:"🖨️", items:[
    "Rotoli POS","Rotoli Cassa","Inchiostro Nero","Inchiostro Colore","Carta A4 (risma)",
  ]},
  varie: { label:"Varie", icon:"🏪", items:[
    "Caffè Cialde","Acqua (bottiglie)","Bicchierini Caffè",
    "Zucchero","Stecchette","Sapone Piatti","Buste Clienti",
    "Batterie Mini Stilo AAA","Batterie Stilo AA",
  ]},
  elettronica: { label:"Elettronica", icon:"🖥️", items:[
    "Tastiera","Mouse","Pistola Barcode",
  ]},
};

/* ─── Usati: structured categories ─── */
const USATI_CATEGORIES = {
  smartphone: { label:"Smartphone", icon:"📱" },
  tablet:     { label:"Tablet",     icon:"📟" },
  watch:      { label:"Watch",      icon:"⌚" },
};
const USATI_FASCE = {
  s: { label:"Fascia S", desc:"Entry level" },
  m: { label:"Fascia M", desc:"Mid range" },
  l: { label:"Fascia L", desc:"High end" },
};

const STORES = [
  { id:"roma_centro", name:"Roma Centro" },
  { id:"roma_est",    name:"Roma Est" },
  { id:"milano_duomo",name:"Milano Duomo" },
  { id:"napoli_centro",name:"Napoli Centro" },
];
const storeName = id => STORES.find(s=>s.id===id)?.name||id;

const CATEGORIES = {
  brand:    { label:"Brand",    color:"#2563eb", bg:"#dbeafe", icon:"📡" },
  prodotti: { label:"Prodotti", color:"#92400e", bg:"#fef3c7", icon:"📱" },
  extra:    { label:"Extra",    color:"#3730a3", bg:"#e0e7ff", icon:"🧴" },
  usati:    { label:"Usati",    color:"#065f46", bg:"#d1fae5", icon:"♻️" },
};

/* ─── Mock orders (multi-category) ─── */
const MOCK_ORDERS = [
  {
    id:"ORD-2026-0042", store:"roma_centro", date:"2026-03-08", status:"parziale",
    eta:"2026-03-16", note:"Urgente per apertura weekend",
    items:[
      { name:"SIM Voce", qty:50, itemStatus:"evaso", cat:"brand", brand:"vodafone", sub:"sim" },
      { name:"Ricariche 10€", qty:100, itemStatus:"ordinato", cat:"brand", brand:"vodafone", sub:"accessori_brand", itemEta:"2026-03-14" },
      { name:"SIM Voce", qty:30, itemStatus:"evaso", cat:"brand", brand:"wind3", sub:"sim" },
      { name:"Materiale Promo", qty:5, itemStatus:"non_disponibile", cat:"brand", brand:"wind3", sub:"accessori_brand" },
      { name:"Pellicola Vetro Universale 6.5\"", qty:10, itemStatus:"evaso", cat:"prodotti", subCat:"pellicole" },
      { name:"Scottex (pacco 6)", qty:4, itemStatus:"pending", cat:"extra", subCat:"pulizia" },
    ],
  },
  {
    id:"ORD-2026-0041", store:"milano_duomo", date:"2026-03-07", status:"evaso",
    eta:null, note:"",
    items:[
      { name:"Scottex (pacco 6)", qty:4, itemStatus:"evaso", cat:"extra", subCat:"pulizia" },
      { name:"Sapone Mani", qty:6, itemStatus:"evaso", cat:"extra", subCat:"pulizia" },
      { name:"Carta A4 (risma 500 fogli)", qty:10, itemStatus:"evaso", cat:"extra", subCat:"stampa" },
      { name:"Rotoli POS (x10)", qty:20, itemStatus:"evaso", cat:"extra", subCat:"stampa" },
    ],
  },
  {
    id:"ORD-2026-0040", store:"roma_centro", date:"2026-03-06", status:"lavorazione",
    eta:"2026-03-20", note:"Prodotti per promo marzo",
    items:[
      { name:"iPhone 16 Pro 256GB Titanio Nero", qty:3, itemStatus:"ordinato", cat:"brand", brand:"wind3", sub:"telefoni", phoneBrand:"apple", phoneModel:"iPhone 16 Pro", phoneCapacity:"256GB", phoneColor:"Titanio Nero", itemEta:"2026-03-18" },
      { name:"Samsung Galaxy S25 128GB", qty:2, itemStatus:"pending", cat:"brand", brand:"vodafone", sub:"telefoni", phoneBrand:"samsung", phoneModel:"Galaxy S25", phoneCapacity:"128GB", phoneColor:"Generico" },
      { name:"Cover Silicone iPhone 16", qty:10, itemStatus:"evaso", cat:"prodotti", subCat:"cover" },
      { name:"Cavo USB-C 1m", qty:20, itemStatus:"evaso", cat:"prodotti", subCat:"cavi" },
      { name:"iPhone 14 Ricondizionato", qty:2, itemStatus:"pending", cat:"usati" },
    ],
  },
  {
    id:"ORD-2026-0039", store:"napoli_centro", date:"2026-03-05", status:"nuovo",
    eta:null, note:"",
    items:[
      { name:"SIM Voce", qty:40, itemStatus:"pending", cat:"brand", brand:"iliad", sub:"sim" },
      { name:"SIM Dati", qty:20, itemStatus:"pending", cat:"brand", brand:"iliad", sub:"sim" },
      { name:"Materiale Espositivo", qty:2, itemStatus:"pending", cat:"brand", brand:"iliad", sub:"accessori_brand" },
      { name:"Penne Personalizzate (x10)", qty:5, itemStatus:"pending", cat:"extra", subCat:"cancelleria" },
    ],
  },
  {
    id:"ORD-2026-0038", store:"roma_est", date:"2026-03-04", status:"evaso",
    eta:null, note:"",
    items:[
      { name:"SIM Voce", qty:60, itemStatus:"evaso", cat:"brand", brand:"tim", sub:"sim" },
      { name:"Ricariche 25€", qty:80, itemStatus:"evaso", cat:"brand", brand:"tim", sub:"accessori_brand" },
      { name:"Caricatore USB-C 20W", qty:15, itemStatus:"evaso", cat:"prodotti", subCat:"travel" },
    ],
  },
  {
    id:"ORD-2026-0037", store:"milano_duomo", date:"2026-03-03", status:"annullato",
    eta:null, note:"Annullato — cliente ha cambiato idea",
    items:[
      { name:"Samsung Galaxy S24 Ricondizionato", qty:1, itemStatus:"non_disponibile", cat:"usati" },
    ],
  },
];

/* ─── Pill component ─── */
const Pill = ({ label, color, bg, small }) => (
  <span style={{ display:"inline-block", padding: small ? "2px 7px" : "3px 10px",
    borderRadius:12, fontSize: small ? 11 : 12, fontWeight:600,
    color, background:bg, letterSpacing:0.2, whiteSpace:"nowrap" }}>{label}</span>
);

/* ═══ MAIN COMPONENT ═══ */
export default function OrdineMerce() {
  const [role, setRole] = useState("store_manager");
  const [myStore] = useState("roma_centro");
  const [orders, setOrders] = useState(MOCK_ORDERS);
  const [expandedId, setExpandedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  /* Filters */
  const [fStatus, setFStatus] = useState("tutti");
  const [fStore, setFStore] = useState("tutti");
  const [fCats, setFCats] = useState([]); // multi-select categories
  const [fSearch, setFSearch] = useState("");

  /* Create order state */
  const [activeSection, setActiveSection] = useState(null); // which section is open in creator
  const [activeBrand, setActiveBrand] = useState(null);
  const [activeBrandSub, setActiveBrandSub] = useState(null);
  const [activeBrandChannel, setActiveBrandChannel] = useState(null);
  const [activePhoneBrand, setActivePhoneBrand] = useState(null);
  const [phoneSelecting, setPhoneSelecting] = useState(null); // {modelId, capacity, color}
  const [phoneSearch, setPhoneSearch] = useState("");
  const [activeAccSub, setActiveAccSub] = useState(null);
  const [usatiCat, setUsatiCat] = useState(null); // smartphone|tablet|watch
  const [usatiOs, setUsatiOs] = useState(null); // android|apple
  const [usatiFascia, setUsatiFascia] = useState(null); // s|m|l
  const [usatiSpecific, setUsatiSpecific] = useState(false);
  const [usatiSpecBrand, setUsatiSpecBrand] = useState("");
  const [usatiSpecModel, setUsatiSpecModel] = useState("");
  const [usatiSpecGb, setUsatiSpecGb] = useState("");
  const [activeProdCat, setActiveProdCat] = useState(null);
  const [coverBrand, setCoverBrand] = useState(null);
  const [coverModel, setCoverModel] = useState(null);
  const [coverSearch, setCoverSearch] = useState("");
  const [activeExtraCat, setActiveExtraCat] = useState(null);
  const [itemSearch, setItemSearch] = useState("");
  const [inkModel, setInkModel] = useState(""); // printer model for ink items
  const [inkPending, setInkPending] = useState(null); // which ink item is being configured
  const [cart, setCart] = useState([]); // [{name, qty, cat, brand?, sub?, subCat?}]
  const [orderNote, setOrderNote] = useState("");
  const [createStep, setCreateStep] = useState(0); // 0=build, 1=review

  const isAdmin = role === "admin";

  /* ─── Filter logic ─── */
  const toggleCatFilter = (cat) => {
    setFCats(prev => prev.includes(cat) ? prev.filter(c=>c!==cat) : [...prev, cat]);
  };

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (!isAdmin && o.store !== myStore) return false;
      if (fStatus !== "tutti" && o.status !== fStatus) return false;
      if (fStore !== "tutti" && o.store !== fStore) return false;
      if (fCats.length > 0) {
        const orderCats = [...new Set(o.items.map(i=>i.cat))];
        if (!fCats.some(fc => orderCats.includes(fc))) return false;
      }
      if (fSearch) {
        const q = fSearch.toLowerCase();
        if (!o.id.toLowerCase().includes(q) && !o.items.some(i=>i.name.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [orders, isAdmin, myStore, fStatus, fStore, fCats, fSearch]);

  /* ─── Stats ─── */
  const stats = useMemo(() => {
    const base = isAdmin ? orders : orders.filter(o=>o.store===myStore);
    return {
      totale:     base.length,
      nuovi:      base.filter(o=>o.status==="nuovo").length,
      lavorazione:base.filter(o=>o.status==="lavorazione").length,
      parziale:   base.filter(o=>o.status==="parziale").length,
      evasi:      base.filter(o=>o.status==="evaso").length,
    };
  }, [orders, isAdmin, myStore]);

  /* ─── Cart helpers ─── */
  const cartKey = (c) => `${c.cat}|${c.brand||""}|${c.sub||""}|${c.subCat||""}|${c.channel||""}|${c.phoneBrand||""}|${c.phoneCapacity||""}|${c.phoneColor||""}|${c.name}`;
  const addToCart = (item) => {
    setCart(prev => {
      const key = cartKey(item);
      const idx = prev.findIndex(c => cartKey(c) === key);
      if (idx >= 0) {
        const n = [...prev]; n[idx] = { ...n[idx], qty: n[idx].qty + 1 }; return n;
      }
      return [...prev, { ...item, qty:1 }];
    });
  };
  const updateCartQty = (idx, qty) => {
    const v = parseInt(qty) || 0;
    if (v <= 0) { setCart(prev => prev.filter((_,i)=>i!==idx)); }
    else { setCart(prev => prev.map((c,i) => i===idx ? { ...c, qty:v } : c)); }
  };
  const removeCartItem = (idx) => setCart(prev => prev.filter((_,i)=>i!==idx));
  const cartHas = (name, cat, brand, sub, subCat, channel) => {
    const key = cartKey({name, cat, brand, sub, subCat, channel});
    return cart.find(c => cartKey(c) === key);
  };

  /* ─── Reset create ─── */
  const resetCreate = () => {
    setShowCreate(false); setActiveSection(null); setActiveBrand(null);
    setActiveBrandSub(null); setActiveBrandChannel(null); setActivePhoneBrand(null); setPhoneSelecting(null); setPhoneSearch("");
    setActiveAccSub(null); setUsatiCat(null); setUsatiOs(null); setUsatiFascia(null);
    setUsatiSpecific(false); setUsatiSpecBrand(""); setUsatiSpecModel(""); setUsatiSpecGb("");
    setActiveProdCat(null); setCoverBrand(null); setCoverModel(null); setCoverSearch("");
    setActiveExtraCat(null); setItemSearch(""); setInkPending(null); setInkModel("");
    setCart([]); setOrderNote(""); setCreateStep(0);
  };

  /* ─── Submit ─── */
  const submitOrder = () => {
    const items = cart.map(c => ({
      name:c.name, qty:c.qty, itemStatus:"pending", cat:c.cat,
      ...(c.brand ? {brand:c.brand} : {}),
      ...(c.sub ? {sub:c.sub} : {}),
      ...(c.subCat ? {subCat:c.subCat} : {}),
      ...(c.channel ? {channel:c.channel} : {}),
      ...(c.phoneBrand ? {phoneBrand:c.phoneBrand} : {}),
      ...(c.phoneModel ? {phoneModel:c.phoneModel} : {}),
      ...(c.phoneCapacity ? {phoneCapacity:c.phoneCapacity} : {}),
      ...(c.phoneColor ? {phoneColor:c.phoneColor} : {}),
    }));
    const newOrder = {
      id:"ORD-2026-"+String(43+orders.length).padStart(4,"0"),
      store:myStore, date:new Date().toISOString().slice(0,10),
      status:"nuovo", eta:null, note:orderNote, items,
    };
    setOrders(prev => [newOrder, ...prev]);
    resetCreate();
  };

  /* ─── Admin actions ─── */
  const updateStatus = (oid, s) => setOrders(prev=>prev.map(o=>o.id===oid?{...o,status:s}:o));
  const updateEta = (oid, eta) => setOrders(prev=>prev.map(o=>o.id===oid?{...o,eta}:o));
  const updateItemStatus = (oid, idx, newSt) => {
    setOrders(prev=>prev.map(o=>{
      if(o.id!==oid) return o;
      const items = o.items.map((it,i)=>i===idx?{...it,itemStatus:newSt, ...(newSt!=="ordinato"?{itemEta:null}:{})}:it);
      const autoStatus = computeOrderStatus(items, o.status);
      return {...o, items, status: autoStatus};
    }));
  };
  const updateItemEta = (oid, idx, eta) => {
    setOrders(prev=>prev.map(o=>{
      if(o.id!==oid) return o;
      const items = o.items.map((it,i)=>i===idx?{...it,itemEta:eta}:it);
      return {...o, items};
    }));
  };

  /* ─── Stat filter click ─── */
  const handleStatClick = (key) => {
    if (key === "totale") { setFStatus("tutti"); return; }
    if (key === "nuovi") { setFStatus(fStatus==="nuovo"?"tutti":"nuovo"); return; }
    if (key === "lavorazione") { setFStatus(fStatus==="lavorazione"?"tutti":"lavorazione"); return; }
    if (key === "parziale") { setFStatus(fStatus==="parziale"?"tutti":"parziale"); return; }
    if (key === "evasi") { setFStatus(fStatus==="evaso"?"tutti":"evaso"); return; }
  };

  /* ═══ STYLES ═══ */
  const s = {
    wrap:{ fontFamily:"'Segoe UI',system-ui,-apple-system,sans-serif", background:C.bg, minHeight:"100vh", color:C.text },
    header:{ background:C.card, borderBottom:`1px solid ${C.border}`, padding:"16px 28px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 },
    title:{ fontSize:22, fontWeight:700, margin:0, letterSpacing:-0.3 },
    subtitle:{ fontSize:13, color:C.grayLight, margin:0 },
    btn:{ padding:"9px 20px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:600, transition:"all .15s" },
    content:{ padding:"20px 28px", maxWidth:1280, margin:"0 auto" },
    statsRow:{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:14, marginBottom:20 },
    filtersRow:{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:16, alignItems:"center" },
    select:{ padding:"8px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, background:C.card, color:C.text, outline:"none" },
    input:{ padding:"8px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, background:C.card, color:C.text, outline:"none" },
    table:{ width:"100%", borderCollapse:"separate", borderSpacing:0 },
    th:{ textAlign:"left", padding:"10px 14px", fontSize:11, fontWeight:600, color:C.gray, textTransform:"uppercase", letterSpacing:0.5, borderBottom:`2px solid ${C.border}` },
    td:{ padding:"12px 14px", fontSize:13, borderBottom:`1px solid ${C.border}`, verticalAlign:"middle" },
    modal:{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 },
    modalBox:{ background:C.card, borderRadius:14, width:780, maxHeight:"88vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,.2)" },
    modalHead:{ padding:"20px 24px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" },
    modalBody:{ padding:"20px 24px" },
    sectionTab:{ padding:"10px 16px", borderRadius:10, border:`2px solid ${C.border}`, cursor:"pointer", textAlign:"center", transition:"all .15s", background:C.card, minWidth:120 },
    chipRow:{ display:"flex", flexWrap:"wrap", gap:8, marginTop:10 },
    chip:{ display:"inline-flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:20, border:`2px solid ${C.border}`, cursor:"pointer", transition:"all .15s", fontSize:13, fontWeight:600, background:C.card },
    itemRow:{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 14px", borderBottom:`1px solid ${C.border}`, fontSize:13 },
    qtyControl:{ display:"flex", alignItems:"center", gap:0, border:`1px solid ${C.border}`, borderRadius:6, overflow:"hidden" },
    qtyBtn:{ width:28, height:28, border:"none", background:C.grayBg, cursor:"pointer", fontSize:15, fontWeight:600, color:C.text },
    qtyInput:{ width:38, height:28, border:"none", borderLeft:`1px solid ${C.border}`, borderRight:`1px solid ${C.border}`, textAlign:"center", fontSize:12, fontWeight:600, background:C.card, color:C.text, outline:"none" },
    roleToggle:{ display:"flex", gap:0, borderRadius:8, overflow:"hidden", border:`1px solid ${C.border}` },
    roleBtn:{ padding:"6px 14px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", transition:"all .15s" },
    cartBadge:{ position:"absolute", top:-6, right:-6, width:18, height:18, borderRadius:"50%", background:C.danger, color:"#fff", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" },
  };

  /* ═══ RENDER: Item picker (reusable) ═══ */
  const renderItemPicker = (items, cat, extra) => {
    if (!items || items.length === 0) return <p style={{fontSize:13,color:C.grayLight,padding:10}}>Nessun articolo disponibile</p>;
    const isInk = (name) => name.toLowerCase().startsWith("inchiostro");
    return (
      <div style={{ maxHeight:300, overflowY:"auto", borderRadius:8, border:`1px solid ${C.border}`, marginTop:8 }}>
        {items.map(name => {
          const existing = cartHas(name, cat, extra?.brand, extra?.sub, extra?.subCat, extra?.channel);
          const findIdx = () => cart.findIndex(c => cartKey(c) === cartKey({name, cat, brand:extra?.brand, sub:extra?.sub, subCat:extra?.subCat, channel:extra?.channel}));
          const inkActive = isInk(name) && inkPending === name;
          return (
            <div key={name} style={{ borderBottom:`1px solid ${C.border}` }}>
              <div style={{ ...s.itemRow, background: existing ? C.primaryLight : "transparent", borderBottom: inkActive ? "none" : undefined }}>
                <span style={{ fontWeight: existing ? 600 : 400 }}>{name}</span>
                {existing ? (
                  <div style={s.qtyControl}>
                    <button style={s.qtyBtn} onClick={() => {
                      const idx = findIdx(); if (idx>=0) updateCartQty(idx, existing.qty - 1);
                    }}>−</button>
                    <input style={s.qtyInput} value={existing.qty} onChange={e=>{
                      const idx = findIdx(); if(idx>=0) updateCartQty(idx, e.target.value);
                    }}/>
                    <button style={s.qtyBtn} onClick={()=>addToCart({name, cat, ...extra})}>+</button>
                  </div>
                ) : (
                  <button style={{ ...s.btn, padding:"4px 12px", fontSize:11, background:"transparent", border:`1px solid ${C.border}`, color:C.textSec }}
                    onClick={()=>{
                      if (isInk(name)) { setInkPending(inkPending===name?null:name); setInkModel(""); }
                      else addToCart({name, cat, ...extra});
                    }}>+ Aggiungi</button>
                )}
              </div>
              {inkActive && (
                <div style={{padding:"8px 14px", background:C.grayBg, display:"flex", gap:8, alignItems:"center"}}>
                  <input style={{...s.input, flex:1}} placeholder="Modello stampante..."
                    value={inkModel} onChange={e=>setInkModel(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter" && inkModel.trim()){
                      addToCart({name: name+" — "+inkModel.trim(), cat, ...extra});
                      setInkPending(null); setInkModel("");
                    }}}/>
                  <button style={{...s.btn, padding:"6px 14px", fontSize:12,
                    background: inkModel.trim() ? C.primary : C.grayLight, color:"#fff"}}
                    disabled={!inkModel.trim()}
                    onClick={()=>{
                      if(inkModel.trim()){
                        addToCart({name: name+" — "+inkModel.trim(), cat, ...extra});
                        setInkPending(null); setInkModel("");
                      }
                    }}>Conferma</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  /* ═══ RENDER: Create Order Modal ═══ */
  const renderCreateModal = () => {
    if (!showCreate) return null;

    const cartCount = cart.reduce((a,c)=>a+c.qty,0);

    return (
      <div style={s.modal} onClick={e=>{if(e.target===e.currentTarget) resetCreate();}}>
        <div style={s.modalBox}>
          <div style={s.modalHead}>
            <div>
              <h3 style={{margin:0,fontSize:18,fontWeight:700}}>
                {createStep===0 ? "Crea Nuovo Ordine" : "Riepilogo Ordine"}
              </h3>
              <p style={{margin:"4px 0 0",fontSize:12,color:C.grayLight}}>
                {createStep===0 ? "Aggiungi articoli da una o più sezioni" : `${cart.length} voci — ${cartCount} pezzi totali`}
              </p>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {createStep===0 && cart.length > 0 && (
                <button style={{...s.btn, background:C.success, color:"#fff"}} onClick={()=>setCreateStep(1)}>
                  Riepilogo ({cartCount}) →
                </button>
              )}
              <button onClick={resetCreate} style={{...s.btn, padding:"6px 12px", background:"transparent", border:`1px solid ${C.border}`, color:C.textSec}}>✕</button>
            </div>
          </div>
          <div style={s.modalBody}>
            {createStep === 0 && (
              <div>
                {/* Section tabs */}
                <div style={{display:"flex", gap:10, marginBottom:16, flexWrap:"wrap"}}>
                  {Object.entries(CATEGORIES).map(([key, cat]) => {
                    const active = activeSection === key;
                    const sectionCartCount = cart.filter(c=>c.cat===key).reduce((a,c)=>a+c.qty,0);
                    return (
                      <div key={key} style={{...s.sectionTab, position:"relative",
                        borderColor: active ? cat.color : C.border,
                        background: active ? cat.bg : C.card,
                      }} onClick={()=>{setActiveSection(active?null:key); setActiveBrand(null); setActiveBrandSub(null); setActiveBrandChannel(null); setActivePhoneBrand(null); setPhoneSelecting(null); setPhoneSearch(""); setActiveAccSub(null); setUsatiCat(null); setUsatiOs(null); setUsatiFascia(null); setUsatiSpecific(false); setActiveProdCat(null); setCoverBrand(null); setCoverModel(null); setCoverSearch(""); setActiveExtraCat(null); setItemSearch("");}}>
                        <div style={{fontSize:22}}>{cat.icon}</div>
                        <div style={{fontSize:13,fontWeight:700,marginTop:2}}>{cat.label}</div>
                        {sectionCartCount > 0 && <div style={s.cartBadge}>{sectionCartCount}</div>}
                      </div>
                    );
                  })}
                </div>

                {/* ── BRAND section ── */}
                {activeSection === "brand" && (
                  <div>
                    <p style={{fontSize:13,fontWeight:600,marginBottom:8}}>Seleziona Operatore:</p>
                    <div style={s.chipRow}>
                      {BRANDS.map(b => (
                        <div key={b.id} style={{...s.chip,
                          borderColor: activeBrand===b.id ? b.color : C.border,
                          background: activeBrand===b.id ? b.color+"15" : C.card,
                        }} onClick={()=>{setActiveBrand(activeBrand===b.id?null:b.id); setActiveBrandSub(null); setActiveBrandChannel(null); setActivePhoneBrand(null); setPhoneSelecting(null); setPhoneSearch(""); setActiveAccSub(null);}}>
                          <span style={{width:10,height:10,borderRadius:"50%",background:b.color,display:"inline-block"}}/>
                          {b.name}
                        </div>
                      ))}
                    </div>
                    {activeBrand && (
                      <div style={{marginTop:14}}>
                        <p style={{fontSize:13,fontWeight:600,marginBottom:8}}>Cosa stai ordinando?</p>
                        <div style={s.chipRow}>
                          {Object.entries(BRAND_SUB).map(([subKey, sub]) => {
                            const rawItems = sub.items[activeBrand];
                            let hasItems = false;
                            if (rawItems && rawItems._isPhone) {
                              const opPhones = OPERATOR_PHONES[activeBrand] || {};
                              hasItems = Object.values(opPhones).some(arr => arr.length > 0);
                            } else if (rawItems && rawItems._hasChannels) {
                              hasItems = true;
                            } else if (rawItems && rawItems._hasAccessoriSub) {
                              hasItems = true;
                            } else if (Array.isArray(rawItems)) {
                              hasItems = rawItems.length > 0;
                            }
                            if (!hasItems) return null;
                            return (
                              <div key={subKey} style={{...s.chip,
                                borderColor: activeBrandSub===subKey ? C.primary : C.border,
                                background: activeBrandSub===subKey ? C.primaryLight : C.card,
                              }} onClick={()=>{setActiveBrandSub(activeBrandSub===subKey?null:subKey); setActiveBrandChannel(null); setActivePhoneBrand(null); setPhoneSelecting(null); setPhoneSearch(""); setActiveAccSub(null);}}>
                                {sub.icon} {sub.label}
                              </div>
                            );
                          })}
                        </div>
                        {activeBrandSub && BRAND_SUB[activeBrandSub] && (() => {
                          const rawItems = BRAND_SUB[activeBrandSub].items[activeBrand];
                          if (!rawItems) return null;

                          /* ── Phone picker ── */
                          if (rawItems._isPhone) {
                            const opPhones = OPERATOR_PHONES[activeBrand] || {};
                            const availBrands = PHONE_BRANDS.filter(pb => (opPhones[pb.id] || []).length > 0);
                            return (
                              <div style={{marginTop:12}}>
                                <p style={{fontSize:13,fontWeight:600,marginBottom:8}}>Seleziona Marca:</p>
                                <div style={s.chipRow}>
                                  {availBrands.map(pb => (
                                    <div key={pb.id} style={{...s.chip,
                                      borderColor: activePhoneBrand===pb.id ? pb.color : C.border,
                                      background: activePhoneBrand===pb.id ? pb.color+"15" : C.card,
                                    }} onClick={()=>{setActivePhoneBrand(activePhoneBrand===pb.id?null:pb.id); setPhoneSelecting(null); setPhoneSearch("");}}>
                                      <span style={{width:10,height:10,borderRadius:"50%",background:pb.color,display:"inline-block"}}/>
                                      {pb.name}
                                    </div>
                                  ))}
                                </div>
                                {activePhoneBrand && (() => {
                                  const modelIds = opPhones[activePhoneBrand] || [];
                                  const allModels = PHONE_CATALOG[activePhoneBrand] || [];
                                  const models = allModels.filter(m => modelIds.includes(m.id));
                                  const filteredModels = phoneSearch ? models.filter(m => m.name.toLowerCase().includes(phoneSearch.toLowerCase())) : models;
                                  return (
                                    <div style={{marginTop:12}}>
                                      <p style={{fontSize:13,fontWeight:600,marginBottom:8}}>Seleziona Modello:</p>
                                      <input style={{...s.input, width:"100%", marginBottom:8, boxSizing:"border-box"}}
                                        placeholder={"🔍 Cerca modello..."}
                                        value={phoneSearch} onChange={e=>setPhoneSearch(e.target.value)}/>
                                      <div style={{borderRadius:8, border:`1px solid ${C.border}`, overflow:"hidden", maxHeight:350, overflowY:"auto"}}>
                                        {filteredModels.map(model => {
                                          const isOpen = phoneSelecting && phoneSelecting.modelId === model.id;
                                          const caps = ["Generico", ...model.capacities];
                                          const cols = ["Generico", ...model.colors];
                                          return (
                                            <div key={model.id} style={{borderBottom:`1px solid ${C.border}`}}>
                                              <div style={{...s.itemRow, cursor:"pointer", background: isOpen ? C.primaryLight : "transparent"}}
                                                onClick={()=>setPhoneSelecting(isOpen ? null : {modelId:model.id, capacity:"Generico", color:"Generico"})}>
                                                <span style={{fontWeight:600, fontSize:13}}>{model.name}</span>
                                                <span style={{fontSize:12, color:C.grayLight}}>{isOpen ? "▲" : "▼"}</span>
                                              </div>
                                              {isOpen && (
                                                <div style={{padding:"10px 14px", background:C.grayBg}}>
                                                  <div style={{display:"flex", gap:12, marginBottom:10, flexWrap:"wrap"}}>
                                                    <div style={{flex:1, minWidth:140}}>
                                                      <label style={{fontSize:11, fontWeight:600, color:C.gray, display:"block", marginBottom:4}}>Capacità</label>
                                                      <select value={phoneSelecting.capacity} onChange={e=>setPhoneSelecting(prev=>({...prev, capacity:e.target.value}))}
                                                        style={{...s.select, width:"100%"}}>
                                                        {caps.map(c=><option key={c} value={c}>{c}</option>)}
                                                      </select>
                                                    </div>
                                                    <div style={{flex:1, minWidth:140}}>
                                                      <label style={{fontSize:11, fontWeight:600, color:C.gray, display:"block", marginBottom:4}}>Colore</label>
                                                      <select value={phoneSelecting.color} onChange={e=>setPhoneSelecting(prev=>({...prev, color:e.target.value}))}
                                                        style={{...s.select, width:"100%"}}>
                                                        {cols.map(c=><option key={c} value={c}>{c}</option>)}
                                                      </select>
                                                    </div>
                                                  </div>
                                                  <button style={{...s.btn, background:C.primary, color:"#fff", width:"100%", padding:"8px 0"}}
                                                    onClick={()=>{
                                                      const capLabel = phoneSelecting.capacity === "Generico" ? "" : " "+phoneSelecting.capacity;
                                                      const colLabel = phoneSelecting.color === "Generico" ? "" : " "+phoneSelecting.color;
                                                      const fullName = model.name + capLabel + colLabel;
                                                      addToCart({
                                                        name: fullName, cat:"brand", brand:activeBrand, sub:"telefoni",
                                                        phoneBrand: activePhoneBrand,
                                                        phoneCapacity: phoneSelecting.capacity,
                                                        phoneColor: phoneSelecting.color,
                                                        phoneModel: model.name,
                                                      });
                                                      setPhoneSelecting(null);
                                                    }}>
                                                    + Aggiungi al Carrello
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          }

                          /* ── Channel step needed ── */
                          if (rawItems._hasChannels) {
                            return (
                              <div style={{marginTop:12}}>
                                <p style={{fontSize:13,fontWeight:600,marginBottom:8}}>Seleziona Canale:</p>
                                <div style={s.chipRow}>
                                  {Object.entries(rawItems.channels).map(([chKey, ch]) => (
                                    <div key={chKey} style={{...s.chip,
                                      borderColor: activeBrandChannel===chKey ? C.primary : C.border,
                                      background: activeBrandChannel===chKey ? C.primaryLight : C.card,
                                    }} onClick={()=>setActiveBrandChannel(activeBrandChannel===chKey?null:chKey)}>
                                      🏪 {ch.label}
                                    </div>
                                  ))}
                                </div>
                                {activeBrandChannel && rawItems.channels[activeBrandChannel] && (
                                  renderItemPicker(
                                    rawItems.channels[activeBrandChannel].items,
                                    "brand",
                                    { brand:activeBrand, sub:activeBrandSub, channel:activeBrandChannel }
                                  )
                                )}
                              </div>
                            );
                          }

                          /* ── Accessori with subcategories ── */
                          if (rawItems._hasAccessoriSub) {
                            return (
                              <div style={{marginTop:12}}>
                                <p style={{fontSize:13,fontWeight:600,marginBottom:8}}>Seleziona Tipo:</p>
                                <div style={s.chipRow}>
                                  {Object.entries(rawItems.subCategories).map(([scKey, sc]) => {
                                    const isProd = sc._isProduct;
                                    return (
                                      <div key={scKey} style={{...s.chip,
                                        borderColor: activeAccSub===scKey ? (isProd ? C.success : C.primary) : C.border,
                                        background: activeAccSub===scKey ? (isProd ? C.successBg : C.primaryLight) : C.card,
                                      }} onClick={()=>setActiveAccSub(activeAccSub===scKey?null:scKey)}>
                                        {sc.icon} {sc.label}
                                      </div>
                                    );
                                  })}
                                </div>
                                {/* Product item (Earbuds): qty picker */}
                                {activeAccSub && rawItems.subCategories[activeAccSub] && rawItems.subCategories[activeAccSub]._isProduct && (() => {
                                  const sc = rawItems.subCategories[activeAccSub];
                                  const prodName = sc.label;
                                  const existing = cartHas(prodName, "brand", activeBrand, activeBrandSub, activeAccSub, undefined);
                                  const findIdx = () => cart.findIndex(c => cartKey(c) === cartKey({name:prodName, cat:"brand", brand:activeBrand, sub:activeBrandSub, subCat:activeAccSub}));
                                  return (
                                    <div style={{marginTop:10, padding:"12px 14px", background:C.grayBg, borderRadius:8, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between"}}>
                                      <span style={{fontSize:14, fontWeight:600}}>{sc.icon} {prodName}</span>
                                      {existing ? (
                                        <div style={{display:"flex", alignItems:"center", gap:8}}>
                                          <div style={s.qtyControl}>
                                            <button style={s.qtyBtn} onClick={()=>{const idx=findIdx(); if(idx>=0) updateCartQty(idx, existing.qty-1);}}>−</button>
                                            <input style={s.qtyInput} value={existing.qty} onChange={e=>{const idx=findIdx(); if(idx>=0) updateCartQty(idx, e.target.value);}}/>
                                            <button style={s.qtyBtn} onClick={()=>addToCart({name:prodName, cat:"brand", brand:activeBrand, sub:activeBrandSub, subCat:activeAccSub})}>+</button>
                                          </div>
                                          <span style={{fontSize:11, color:C.success, fontWeight:600}}>✓ Nel carrello</span>
                                        </div>
                                      ) : (
                                        <button style={{...s.btn, background:C.primary, color:"#fff", padding:"8px 20px"}}
                                          onClick={()=>addToCart({name:prodName, cat:"brand", brand:activeBrand, sub:activeBrandSub, subCat:activeAccSub})}>
                                          + Aggiungi al Carrello
                                        </button>
                                      )}
                                    </div>
                                  );
                                })()}
                                {/* Normal sub-items list */}
                                {activeAccSub && rawItems.subCategories[activeAccSub] && !rawItems.subCategories[activeAccSub]._isProduct && (
                                  renderItemPicker(
                                    rawItems.subCategories[activeAccSub].items,
                                    "brand",
                                    { brand:activeBrand, sub:activeBrandSub, subCat:activeAccSub }
                                  )
                                )}
                              </div>
                            );
                          }

                          /* ── Flat items (no channel) ── */
                          return renderItemPicker(
                            Array.isArray(rawItems) ? rawItems : [],
                            "brand",
                            { brand:activeBrand, sub:activeBrandSub }
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* ── PRODOTTI section ── */}
                {activeSection === "prodotti" && (
                  <div>
                    <p style={{fontSize:13,fontWeight:600,marginBottom:8}}>Seleziona Categoria:</p>
                    <div style={s.chipRow}>
                      {Object.entries(PRODOTTI_CAT).map(([key, cat]) => (
                        <div key={key} style={{...s.chip,
                          borderColor: activeProdCat===key ? C.primary : C.border,
                          background: activeProdCat===key ? C.primaryLight : C.card,
                        }} onClick={()=>{setActiveProdCat(activeProdCat===key?null:key); setItemSearch(""); setCoverBrand(null); setCoverModel(null); setCoverSearch("");}}>
                          {cat.icon} {cat.label}
                        </div>
                      ))}
                    </div>

                    {/* Cover picker: brand → model → add */}
                    {activeProdCat === "cover" && (
                      <div style={{marginTop:10}}>
                        <p style={{fontSize:13,fontWeight:600,marginBottom:8}}>Seleziona Marca Telefono:</p>
                        <div style={s.chipRow}>
                          {COVER_BRANDS.map(pb => {
                            const models = PHONE_CATALOG[pb.id];
                            if (!models || models.length === 0) return null;
                            return (
                              <div key={pb.id} style={{...s.chip,
                                borderColor: coverBrand===pb.id ? pb.color : C.border,
                                background: coverBrand===pb.id ? pb.color+"15" : C.card,
                              }} onClick={()=>{setCoverBrand(coverBrand===pb.id?null:pb.id); setCoverModel(null); setCoverSearch("");}}>
                                <span style={{width:10,height:10,borderRadius:"50%",background:pb.color,display:"inline-block"}}/>
                                {pb.name}
                              </div>
                            );
                          })}
                        </div>
                        {coverBrand && (() => {
                          const allModels = PHONE_CATALOG[coverBrand] || [];
                          const filtered = coverSearch ? allModels.filter(m => m.name.toLowerCase().includes(coverSearch.toLowerCase())) : allModels;
                          return (
                            <div style={{marginTop:10}}>
                              <input style={{...s.input, width:"100%", boxSizing:"border-box", marginBottom:8}}
                                placeholder="🔍 Cerca modello..." value={coverSearch} onChange={e=>setCoverSearch(e.target.value)}/>
                              <div style={{borderRadius:8, border:`1px solid ${C.border}`, overflow:"hidden", maxHeight:300, overflowY:"auto"}}>
                                {filtered.map(model => {
                                  const brandName = COVER_BRANDS.find(b=>b.id===coverBrand)?.name || coverBrand;
                                  const coverName = `Cover ${brandName} ${model.name}`;
                                  const existing = cartHas(coverName, "prodotti", undefined, undefined, "cover", undefined);
                                  const findIdx = () => cart.findIndex(c => cartKey(c) === cartKey({name:coverName, cat:"prodotti", subCat:"cover"}));
                                  return (
                                    <div key={model.id} style={{...s.itemRow, background: existing ? C.primaryLight : "transparent"}}>
                                      <span style={{fontWeight: existing ? 600 : 400, fontSize:13}}>{model.name}</span>
                                      {existing ? (
                                        <div style={s.qtyControl}>
                                          <button style={s.qtyBtn} onClick={()=>{const idx=findIdx(); if(idx>=0) updateCartQty(idx, existing.qty-1);}}>−</button>
                                          <input style={s.qtyInput} value={existing.qty} onChange={e=>{const idx=findIdx(); if(idx>=0) updateCartQty(idx, e.target.value);}}/>
                                          <button style={s.qtyBtn} onClick={()=>addToCart({name:coverName, cat:"prodotti", subCat:"cover", coverBrand, coverModel:model.name})}>+</button>
                                        </div>
                                      ) : (
                                        <button style={{...s.btn, padding:"4px 12px", fontSize:11, background:"transparent", border:`1px solid ${C.border}`, color:C.textSec}}
                                          onClick={()=>addToCart({name:coverName, cat:"prodotti", subCat:"cover", coverBrand, coverModel:model.name})}>+ Aggiungi</button>
                                      )}
                                    </div>
                                  );
                                })}
                                {filtered.length === 0 && <p style={{padding:12,fontSize:12,color:C.grayLight,textAlign:"center"}}>Nessun modello trovato</p>}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Standard item picker for non-cover categories */}
                    {activeProdCat && activeProdCat !== "cover" && PRODOTTI_CAT[activeProdCat] && PRODOTTI_CAT[activeProdCat].items && (
                      <div>
                        <input style={{...s.input, width:"100%", marginTop:10, boxSizing:"border-box"}}
                          placeholder={"🔍 Cerca in " + PRODOTTI_CAT[activeProdCat].label + "..."}
                          value={itemSearch} onChange={e=>setItemSearch(e.target.value)}/>
                        {renderItemPicker(
                          PRODOTTI_CAT[activeProdCat].items.filter(i => !itemSearch || i.toLowerCase().includes(itemSearch.toLowerCase())),
                          "prodotti", { subCat:activeProdCat }
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── EXTRA section ── */}
                {activeSection === "extra" && (
                  <div>
                    <p style={{fontSize:13,fontWeight:600,marginBottom:8}}>Seleziona Categoria:</p>
                    <div style={s.chipRow}>
                      {Object.entries(EXTRA_CAT).map(([key, cat]) => (
                        <div key={key} style={{...s.chip,
                          borderColor: activeExtraCat===key ? C.primary : C.border,
                          background: activeExtraCat===key ? C.primaryLight : C.card,
                        }} onClick={()=>{setActiveExtraCat(activeExtraCat===key?null:key); setItemSearch("");}}>
                          {cat.icon} {cat.label}
                        </div>
                      ))}
                    </div>
                    {activeExtraCat && EXTRA_CAT[activeExtraCat] && (
                      <div>
                        <input style={{...s.input, width:"100%", marginTop:10, boxSizing:"border-box"}}
                          placeholder={"🔍 Cerca in " + EXTRA_CAT[activeExtraCat].label + "..."}
                          value={itemSearch} onChange={e=>setItemSearch(e.target.value)}/>
                        {renderItemPicker(
                          EXTRA_CAT[activeExtraCat].items.filter(i => !itemSearch || i.toLowerCase().includes(itemSearch.toLowerCase())),
                          "extra", { subCat:activeExtraCat }
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── USATI section ── */}
                {activeSection === "usati" && (
                  <div>
                    <p style={{fontSize:13,fontWeight:600,marginBottom:8}}>Seleziona Tipo Dispositivo:</p>
                    <div style={s.chipRow}>
                      {Object.entries(USATI_CATEGORIES).map(([key, cat]) => (
                        <div key={key} style={{...s.chip,
                          borderColor: usatiCat===key ? C.primary : C.border,
                          background: usatiCat===key ? C.primaryLight : C.card,
                        }} onClick={()=>{setUsatiCat(usatiCat===key?null:key); setUsatiOs(null); setUsatiFascia(null); setUsatiSpecific(false); setUsatiSpecBrand(""); setUsatiSpecModel(""); setUsatiSpecGb("");}}>
                          {cat.icon} {cat.label}
                        </div>
                      ))}
                    </div>

                    {usatiCat && (
                      <div style={{marginTop:12}}>
                        <p style={{fontSize:13,fontWeight:600,marginBottom:8}}>
                          {usatiCat === "smartphone" ? "Seleziona:" : "Sistema Operativo:"}
                        </p>
                        <div style={s.chipRow}>
                          {[{id:"android",label:"Android",icon:"🤖"},{id:"apple",label:"Apple",icon:"🍎"}].map(os => (
                            <div key={os.id} style={{...s.chip,
                              borderColor: !usatiSpecific && usatiOs===os.id ? C.primary : C.border,
                              background: !usatiSpecific && usatiOs===os.id ? C.primaryLight : C.card,
                            }} onClick={()=>{setUsatiOs(usatiOs===os.id?null:os.id); setUsatiFascia(null); setUsatiSpecific(false);}}>
                              {os.icon} {os.label}
                            </div>
                          ))}
                          {usatiCat === "smartphone" && (
                            <div style={{...s.chip,
                              borderColor: usatiSpecific ? C.info : C.border,
                              background: usatiSpecific ? C.infoBg : C.card,
                            }} onClick={()=>{setUsatiSpecific(!usatiSpecific); setUsatiOs(null); setUsatiFascia(null); setUsatiSpecBrand(""); setUsatiSpecModel(""); setUsatiSpecGb("");}}>
                              🎯 Modello Specifico
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Smartphone + Android/Apple: fascia selection */}
                    {usatiCat === "smartphone" && usatiOs && !usatiSpecific && (
                      <div style={{marginTop:12}}>
                        <p style={{fontSize:13,fontWeight:600,marginBottom:8}}>Seleziona Fascia:</p>
                        <div style={s.chipRow}>
                          {Object.entries(USATI_FASCE).map(([fk, fv]) => (
                            <div key={fk} style={{...s.chip,
                              borderColor: usatiFascia===fk ? C.primary : C.border,
                              background: usatiFascia===fk ? C.primaryLight : C.card,
                            }} onClick={()=>{
                              setUsatiFascia(fk);
                              const label = `Smartphone Usato ${usatiOs==="apple"?"Apple":"Android"} — ${fv.label}`;
                              addToCart({name:label, cat:"usati", subCat:"smartphone", usatiOs, usatiFascia:fk});
                            }}>
                              {fv.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Smartphone + Modello Specifico: brand/model/gb form */}
                    {usatiCat === "smartphone" && usatiSpecific && (
                      <div style={{marginTop:10, padding:"12px 14px", background:C.grayBg, borderRadius:8, border:`1px solid ${C.border}`}}>
                        <div style={{display:"flex", gap:10, marginBottom:10, flexWrap:"wrap"}}>
                          <div style={{flex:1, minWidth:120}}>
                            <label style={{fontSize:11, fontWeight:600, color:C.gray, display:"block", marginBottom:4}}>Brand</label>
                            <input style={{...s.input, width:"100%", boxSizing:"border-box"}} placeholder="Es. Samsung"
                              value={usatiSpecBrand} onChange={e=>setUsatiSpecBrand(e.target.value)}/>
                          </div>
                          <div style={{flex:1, minWidth:120}}>
                            <label style={{fontSize:11, fontWeight:600, color:C.gray, display:"block", marginBottom:4}}>Modello</label>
                            <input style={{...s.input, width:"100%", boxSizing:"border-box"}} placeholder="Es. Galaxy S24"
                              value={usatiSpecModel} onChange={e=>setUsatiSpecModel(e.target.value)}/>
                          </div>
                          <div style={{flex:1, minWidth:100}}>
                            <label style={{fontSize:11, fontWeight:600, color:C.gray, display:"block", marginBottom:4}}>Capacità (GB)</label>
                            <input style={{...s.input, width:"100%", boxSizing:"border-box"}} placeholder="Es. 256GB"
                              value={usatiSpecGb} onChange={e=>setUsatiSpecGb(e.target.value)}/>
                          </div>
                        </div>
                        <button style={{...s.btn, background: (usatiSpecBrand && usatiSpecModel) ? C.primary : C.grayLight, color:"#fff", width:"100%", padding:"8px 0"}}
                          disabled={!usatiSpecBrand || !usatiSpecModel}
                          onClick={()=>{
                            const gb = usatiSpecGb ? " "+usatiSpecGb : "";
                            const label = `Smartphone Usato — ${usatiSpecBrand} ${usatiSpecModel}${gb}`;
                            addToCart({name:label, cat:"usati", subCat:"smartphone", usatiSpecific:true});
                            setUsatiSpecBrand(""); setUsatiSpecModel(""); setUsatiSpecGb("");
                          }}>
                          + Aggiungi al Carrello
                        </button>
                      </div>
                    )}

                    {/* Tablet / Watch: direct add */}
                    {usatiCat && usatiCat !== "smartphone" && usatiOs && (
                      <div style={{marginTop:12}}>
                        <button style={{...s.btn, background:C.primary, color:"#fff", width:"100%", padding:"10px 0"}}
                          onClick={()=>{
                            const catLabel = USATI_CATEGORIES[usatiCat].label;
                            const label = `${catLabel} Usato ${usatiOs==="apple"?"Apple":"Android"}`;
                            addToCart({name:label, cat:"usati", subCat:usatiCat, usatiOs});
                          }}>
                          + Aggiungi {USATI_CATEGORIES[usatiCat].label} {usatiOs==="apple"?"Apple":"Android"} al Carrello
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Mini cart summary */}
                {cart.length > 0 && (
                  <div style={{marginTop:18, padding:"12px 16px", background:C.primaryLight, borderRadius:10, border:`1px solid ${C.primary}30`}}>
                    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
                      <span style={{fontSize:13,fontWeight:700,color:C.primary}}>🛒 Carrello ({cartCount} pezzi)</span>
                      <button style={{...s.btn, background:C.success, color:"#fff", padding:"7px 18px"}}
                        onClick={()=>setCreateStep(1)}>Riepilogo →</button>
                    </div>
                    <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
                      {Object.entries(CATEGORIES).map(([ck,cv])=>{
                        const n = cart.filter(c=>c.cat===ck).reduce((a,c)=>a+c.qty,0);
                        if (!n) return null;
                        return <Pill key={ck} label={`${cv.icon} ${cv.label}: ${n}`} color={cv.color} bg={cv.bg} small />;
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── REVIEW STEP ── */}
            {createStep === 1 && (
              <div>
                <button onClick={()=>setCreateStep(0)} style={{...s.btn, padding:"6px 14px", fontSize:12, background:"transparent", border:`1px solid ${C.border}`, color:C.textSec, marginBottom:14}}>← Modifica Ordine</button>

                {/* Group by category */}
                {Object.entries(CATEGORIES).map(([ck, cv]) => {
                  const catItems = cart.filter(c=>c.cat===ck);
                  if (catItems.length === 0) return null;

                  /* Split phones vs non-phones */
                  const phoneItems = catItems.filter(c=>c.phoneBrand);
                  const otherItems = catItems.filter(c=>!c.phoneBrand);

                  /* Group phones by phoneBrand */
                  const phoneGroups = {};
                  phoneItems.forEach(item => {
                    if (!phoneGroups[item.phoneBrand]) phoneGroups[item.phoneBrand] = [];
                    phoneGroups[item.phoneBrand].push(item);
                  });

                  const renderCartRow = (item) => {
                    const globalIdx = cart.indexOf(item);
                    return (
                      <div key={globalIdx} style={{...s.itemRow}}>
                        <div style={{flex:1}}>
                          <span style={{fontWeight:600}}>{item.name}</span>
                          {item.brand && !item.phoneBrand && <span style={{fontSize:11,color:C.grayLight,marginLeft:6}}>
                            ({BRANDS.find(b=>b.id===item.brand)?.name}{item.channel ? (" — "+(BRAND_SUB[item.sub]?.items[item.brand]?.channels?.[item.channel]?.label||item.channel)) : ""})
                          </span>}
                          {item.phoneCapacity && item.phoneCapacity !== "Generico" && <span style={{fontSize:11,color:C.info,marginLeft:6}}>{item.phoneCapacity}</span>}
                          {item.phoneColor && item.phoneColor !== "Generico" && <span style={{fontSize:11,color:C.orange,marginLeft:4}}>{item.phoneColor}</span>}
                          {item.phoneCapacity === "Generico" && item.phoneColor === "Generico" && <span style={{fontSize:10,color:C.grayLight,marginLeft:6}}>(Generico)</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={s.qtyControl}>
                            <button style={s.qtyBtn} onClick={()=>updateCartQty(globalIdx, item.qty-1)}>−</button>
                            <input style={s.qtyInput} value={item.qty} onChange={e=>updateCartQty(globalIdx, e.target.value)}/>
                            <button style={s.qtyBtn} onClick={()=>updateCartQty(globalIdx, item.qty+1)}>+</button>
                          </div>
                          <button style={{border:"none",background:"transparent",cursor:"pointer",fontSize:16,color:C.danger}}
                            onClick={()=>removeCartItem(globalIdx)}>×</button>
                        </div>
                      </div>
                    );
                  };

                  return (
                    <div key={ck} style={{marginBottom:14}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <Pill label={`${cv.icon} ${cv.label}`} color={cv.color} bg={cv.bg} />
                      </div>
                      {/* Non-phone items */}
                      {otherItems.length > 0 && (
                        <div style={{borderRadius:8, border:`1px solid ${C.border}`, overflow:"hidden", marginBottom: phoneItems.length > 0 ? 8 : 0}}>
                          {otherItems.map(renderCartRow)}
                        </div>
                      )}
                      {/* Phone items grouped by phone brand */}
                      {Object.entries(phoneGroups).map(([pbId, pbItems]) => {
                        const pb = PHONE_BRANDS.find(p=>p.id===pbId);
                        return (
                          <div key={pbId} style={{marginBottom:8}}>
                            <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",background:pb?.color+"12",borderRadius:"8px 8px 0 0",border:`1px solid ${C.border}`,borderBottom:"none"}}>
                              <span style={{width:8,height:8,borderRadius:"50%",background:pb?.color||C.gray,display:"inline-block"}}/>
                              <span style={{fontSize:12,fontWeight:700,color:pb?.color||C.gray}}>{pb?.name||pbId}</span>
                              <span style={{fontSize:11,color:C.grayLight}}>({pbItems.length} {pbItems.length===1?"telefono":"telefoni"})</span>
                            </div>
                            <div style={{borderRadius:"0 0 8px 8px", border:`1px solid ${C.border}`, overflow:"hidden"}}>
                              {pbItems.map(renderCartRow)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                <div style={{marginBottom:14}}>
                  <label style={{fontSize:12,fontWeight:600,color:C.gray,display:"block",marginBottom:4}}>Note (opzionale)</label>
                  <textarea value={orderNote} onChange={e=>setOrderNote(e.target.value)}
                    placeholder="Es. Urgente, per apertura weekend..."
                    style={{...s.input, width:"100%", minHeight:60, resize:"vertical", boxSizing:"border-box"}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderTop:`1px solid ${C.border}`}}>
                  <span style={{fontSize:13,color:C.grayLight}}>
                    Negozio: <strong style={{color:C.text}}>{storeName(myStore)}</strong>
                  </span>
                  <button style={{...s.btn, padding:"10px 28px", fontSize:14, background:C.primary, color:"#fff"}}
                    onClick={submitOrder}>✓ Invia Ordine</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ═══ RENDER: Order Detail Modal ═══ */
  const renderDetailModal = () => {
    if (!expandedId) return null;
    const order = orders.find(o=>o.id===expandedId);
    if (!order) return null;

    const total = order.items.length;
    const evasi = order.items.filter(i=>i.itemStatus==="evaso").length;
    const nonDisp = order.items.filter(i=>i.itemStatus==="non_disponibile").length;
    const ordinati = order.items.filter(i=>i.itemStatus==="ordinato").length;
    const inAttesa = order.items.filter(i=>i.itemStatus==="pending").length;
    const resolved = evasi + nonDisp;
    const pct = total > 0 ? Math.round((resolved/total)*100) : 0;

    /* group items by cat */
    const grouped = {};
    order.items.forEach((it,idx)=>{
      if (!grouped[it.cat]) grouped[it.cat]=[];
      grouped[it.cat].push({...it, _idx:idx});
    });

    const stObj = STATUS[order.status] || STATUS.nuovo;

    return (
      <div style={s.modal} onClick={e=>{if(e.target===e.currentTarget) setExpandedId(null);}}>
        <div style={{background:C.card, borderRadius:14, width:920, maxHeight:"90vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,.25)"}}>
          {/* Header */}
          <div style={{padding:"20px 24px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
            <div>
              <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:6}}>
                <h3 style={{margin:0, fontSize:20, fontWeight:700, fontFamily:"monospace"}}>{order.id}</h3>
                <Pill label={stObj.label} color={stObj.color} bg={stObj.bg}/>
              </div>
              <div style={{display:"flex", gap:16, fontSize:13, color:C.textSec}}>
                <span>📍 {storeName(order.store)}</span>
                <span>📅 {new Date(order.date).toLocaleDateString("it-IT")}</span>
                <span>{total} voci</span>
              </div>
            </div>
            <button onClick={()=>setExpandedId(null)}
              style={{...s.btn, padding:"6px 14px", background:"transparent", border:`1px solid ${C.border}`, color:C.textSec, fontSize:18, lineHeight:1}}>✕</button>
          </div>

          <div style={{padding:"20px 24px"}}>
            {/* Progress bar */}
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
              <div style={{flex:1,height:10,background:C.border,borderRadius:5,overflow:"hidden"}}>
                <div style={{width:`${pct}%`,height:"100%",borderRadius:5,transition:"width .3s",
                  background: pct===100 ? C.success : C.primary}}/>
              </div>
              <span style={{fontSize:14,fontWeight:700,color: pct===100?C.success:C.primary,minWidth:48}}>{pct}%</span>
            </div>

            {/* Summary pills */}
            <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
              <div style={{padding:"8px 14px",borderRadius:8,background:C.successBg,border:`1px solid ${C.success}30`}}>
                <span style={{fontSize:11,color:C.gray}}>Evase</span>
                <span style={{fontSize:18,fontWeight:800,color:C.success,marginLeft:8}}>{evasi}</span>
              </div>
              <div style={{padding:"8px 14px",borderRadius:8,background:C.orangeBg,border:`1px solid ${C.orange}30`}}>
                <span style={{fontSize:11,color:C.gray}}>Ordinati</span>
                <span style={{fontSize:18,fontWeight:800,color:C.orange,marginLeft:8}}>{ordinati}</span>
              </div>
              <div style={{padding:"8px 14px",borderRadius:8,background:C.dangerBg,border:`1px solid ${C.danger}30`}}>
                <span style={{fontSize:11,color:C.gray}}>Non Disp.</span>
                <span style={{fontSize:18,fontWeight:800,color:C.danger,marginLeft:8}}>{nonDisp}</span>
              </div>
              <div style={{padding:"8px 14px",borderRadius:8,background:C.grayBg,border:`1px solid ${C.border}`}}>
                <span style={{fontSize:11,color:C.gray}}>In Attesa</span>
                <span style={{fontSize:18,fontWeight:800,color:C.gray,marginLeft:8}}>{inAttesa}</span>
              </div>
            </div>

            {/* ETA ordine */}
            <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:18,padding:"10px 14px",background:C.grayBg,borderRadius:8,border:`1px solid ${C.border}`}}>
              <span style={{fontSize:12,fontWeight:600,color:C.gray}}>📅 Arrivo Previsto Ordine:</span>
              {isAdmin ? (
                <input type="date" value={order.eta||""} onChange={e=>updateEta(order.id, e.target.value)}
                  style={{...s.input, padding:"4px 10px", fontSize:12}}/>
              ) : (
                order.eta ? <span style={{fontSize:13,fontWeight:700,color:C.info}}>
                  {new Date(order.eta).toLocaleDateString("it-IT")}
                </span> : <span style={{fontSize:12,color:C.grayLight}}>Non impostato</span>
              )}
            </div>

            {/* Items grouped by cat */}
            {Object.entries(grouped).map(([cat, items]) => {
              /* Split phones vs others */
              const phoneItems = items.filter(it => it.phoneBrand);
              const otherItems = items.filter(it => !it.phoneBrand);

              const phoneGroups = {};
              phoneItems.forEach(it => {
                if (!phoneGroups[it.phoneBrand]) phoneGroups[it.phoneBrand] = [];
                phoneGroups[it.phoneBrand].push(it);
              });

              const renderItemRow = (it) => {
                const ist = ITEM_STATUS[it.itemStatus] || ITEM_STATUS.pending;
                return (
                  <tr key={it._idx} style={{background: ist.bg}}>
                    <td style={{...s.td,fontWeight:600}}>
                      {it.name}
                      {it.brand && !it.phoneBrand && <span style={{marginLeft:6,fontSize:10,color:C.grayLight}}>
                        ({BRANDS.find(b=>b.id===it.brand)?.name}{it.channel ? (" — "+(BRAND_SUB[it.sub]?.items[it.brand]?.channels?.[it.channel]?.label||it.channel)) : ""})
                      </span>}
                    </td>
                    <td style={{...s.td,textAlign:"center",fontWeight:700}}>{it.qty}</td>
                    <td style={s.td}><Pill {...ist} small/></td>
                    <td style={s.td}>
                      {it.itemStatus === "ordinato" ? (
                        isAdmin ? (
                          <input type="date" value={it.itemEta||""} onChange={e=>updateItemEta(order.id, it._idx, e.target.value)}
                            style={{...s.input, padding:"4px 8px", fontSize:11, width:130}}/>
                        ) : (
                          it.itemEta ? <span style={{fontSize:12,fontWeight:600,color:C.orange}}>
                            {new Date(it.itemEta).toLocaleDateString("it-IT")}
                          </span> : <span style={{fontSize:11,color:C.grayLight}}>Da definire</span>
                        )
                      ) : (
                        <span style={{fontSize:11,color:C.grayLight}}>—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td style={s.td}>
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {it.itemStatus !== "evaso" && (
                            <button onClick={()=>updateItemStatus(order.id, it._idx, "evaso")}
                              style={{...s.btn, fontSize:10, padding:"3px 8px", background:C.success, color:"#fff"}}>
                              ✓ Evaso
                            </button>
                          )}
                          {it.itemStatus !== "ordinato" && it.itemStatus !== "evaso" && (
                            <button onClick={()=>updateItemStatus(order.id, it._idx, "ordinato")}
                              style={{...s.btn, fontSize:10, padding:"3px 8px", background:C.orange, color:"#fff"}}>
                              📋 Ordinato
                            </button>
                          )}
                          {it.itemStatus !== "non_disponibile" && it.itemStatus !== "evaso" && (
                            <button onClick={()=>updateItemStatus(order.id, it._idx, "non_disponibile")}
                              style={{...s.btn, fontSize:10, padding:"3px 8px", background:C.danger, color:"#fff"}}>
                              ✗ Non Disp.
                            </button>
                          )}
                          {(it.itemStatus === "evaso" || it.itemStatus === "ordinato" || it.itemStatus === "non_disponibile") && (
                            <button onClick={()=>updateItemStatus(order.id, it._idx, "pending")}
                              style={{...s.btn, fontSize:10, padding:"3px 8px", background:"transparent", border:`1px solid ${C.border}`, color:C.gray}}>
                              ↩ Reset
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              };

              const tableHead = (
                <thead>
                  <tr style={{background:C.grayBg}}>
                    <th style={{...s.th,fontSize:11}}>Articolo</th>
                    <th style={{...s.th,fontSize:11,textAlign:"center"}}>Qtà</th>
                    <th style={{...s.th,fontSize:11}}>Stato</th>
                    <th style={{...s.th,fontSize:11}}>Arrivo Previsto</th>
                    {isAdmin && <th style={{...s.th,fontSize:11}}>Azioni</th>}
                  </tr>
                </thead>
              );

              return (
                <div key={cat} style={{marginBottom:16}}>
                  <div style={{marginBottom:6}}>
                    <Pill label={`${CATEGORIES[cat]?.icon||""} ${CATEGORIES[cat]?.label||cat}`}
                      color={CATEGORIES[cat]?.color||C.gray} bg={CATEGORIES[cat]?.bg||C.grayBg} small/>
                  </div>
                  {/* Non-phone items */}
                  {otherItems.length > 0 && (
                    <table style={{...s.table, fontSize:13, marginBottom: Object.keys(phoneGroups).length > 0 ? 10 : 0}}>
                      {tableHead}
                      <tbody>{otherItems.map(renderItemRow)}</tbody>
                    </table>
                  )}
                  {/* Phone items grouped by phone brand */}
                  {Object.entries(phoneGroups).map(([pbId, pbItems]) => {
                    const pb = PHONE_BRANDS.find(p=>p.id===pbId);
                    return (
                      <div key={pbId} style={{marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",background:(pb?.color||C.gray)+"12",borderRadius:6,marginBottom:4}}>
                          <span style={{width:8,height:8,borderRadius:"50%",background:pb?.color||C.gray,display:"inline-block"}}/>
                          <span style={{fontSize:12,fontWeight:700,color:pb?.color||C.gray}}>{pb?.name||pbId}</span>
                          <span style={{fontSize:11,color:C.grayLight}}>({pbItems.length} {pbItems.length===1?"telefono":"telefoni"})</span>
                        </div>
                        <table style={{...s.table, fontSize:13}}>
                          {tableHead}
                          <tbody>{pbItems.map(renderItemRow)}</tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {order.note && (
              <div style={{marginTop:6,padding:"10px 14px",background:C.grayBg,borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,color:C.textSec}}>
                📝 {order.note}
              </div>
            )}

            {/* Admin: status change */}
            {isAdmin && (
              <div style={{marginTop:16,padding:"14px 16px",background:C.grayBg,borderRadius:8,border:`1px solid ${C.border}`,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:12,fontWeight:600,color:C.gray}}>Stato ordine:</span>
                {Object.entries(STATUS).map(([key,val])=>(
                  <button key={key} onClick={()=>updateStatus(order.id,key)}
                    style={{...s.btn, padding:"4px 12px", fontSize:12, fontWeight:600,
                      background: order.status===key ? val.color : val.bg,
                      color: order.status===key ? "#fff" : val.color,
                      border:`1px solid ${val.color}30`}}>
                    {val.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ═══ MAIN RENDER ═══ */
  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>📦 Ordine Merce</h1>
          <p style={s.subtitle}>{isAdmin ? "Pannello Amministrazione — Tutti i negozi" : `Negozio: ${storeName(myStore)}`}</p>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <div style={s.roleToggle}>
            <button style={{...s.roleBtn, background:!isAdmin?C.primary:C.grayBg, color:!isAdmin?"#fff":C.gray}}
              onClick={()=>setRole("store_manager")}>Store Manager</button>
            <button style={{...s.roleBtn, background:isAdmin?C.primary:C.grayBg, color:isAdmin?"#fff":C.gray}}
              onClick={()=>setRole("admin")}>Amministrazione</button>
          </div>
          {!isAdmin && (
            <button style={{...s.btn, background:C.primary, color:"#fff"}} onClick={()=>setShowCreate(true)}>
              + Crea Ordine
            </button>
          )}
        </div>
      </div>

      <div style={s.content}>
        {/* Stats — clickable */}
        <div style={s.statsRow}>
          {[
            { key:"totale",      label:"Totale Ordini",  val:stats.totale,      color:C.text,    icon:"📋", active: fStatus==="tutti" },
            { key:"nuovi",       label:"Nuovi",          val:stats.nuovi,       color:C.primary, icon:"🆕", active: fStatus==="nuovo" },
            { key:"lavorazione", label:"In Lavorazione",  val:stats.lavorazione, color:C.warning, icon:"⏳", active: fStatus==="lavorazione" },
            { key:"parziale",    label:"Parz. Evasi",     val:stats.parziale,    color:C.info,    icon:"📦", active: fStatus==="parziale" },
            { key:"evasi",       label:"Evasi",           val:stats.evasi,       color:C.success, icon:"✅", active: fStatus==="evaso" },
          ].map(st => (
            <div key={st.key} onClick={()=>handleStatClick(st.key)}
              style={{background:C.card, borderRadius:10, padding:"16px 20px", cursor:"pointer",
                border: st.active && st.key!=="totale" ? `2px solid ${st.color}` : `1px solid ${C.border}`,
                transition:"all .15s", boxShadow: st.active && st.key!=="totale" ? `0 0 0 3px ${st.color}20` : "none",
              }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:12,color:C.grayLight,fontWeight:500}}>{st.label}</div>
                  <div style={{fontSize:28,fontWeight:800,color:st.color,marginTop:2}}>{st.val}</div>
                </div>
                <span style={{fontSize:28,opacity:0.7}}>{st.icon}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={s.filtersRow}>
          <input style={{...s.input,width:220}} placeholder="🔍 Cerca per ID o articolo..."
            value={fSearch} onChange={e=>setFSearch(e.target.value)}/>
          <select style={s.select} value={fStatus} onChange={e=>setFStatus(e.target.value)}>
            <option value="tutti">Tutti gli stati</option>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>

          {/* Multi-select categories */}
          <div style={{display:"flex", gap:4}}>
            {Object.entries(CATEGORIES).map(([ck,cv])=>{
              const active = fCats.includes(ck);
              return (
                <button key={ck} onClick={()=>toggleCatFilter(ck)}
                  style={{...s.btn, padding:"6px 12px", fontSize:12,
                    background: active ? cv.bg : "transparent",
                    color: active ? cv.color : C.gray,
                    border: `1px solid ${active ? cv.color : C.border}`,
                    fontWeight: active ? 700 : 500}}>
                  {cv.icon} {cv.label}
                </button>
              );
            })}
            {fCats.length > 0 && (
              <button onClick={()=>setFCats([])}
                style={{...s.btn, padding:"6px 8px", fontSize:11, background:"transparent", border:"none", color:C.grayLight, textDecoration:"underline"}}>
                Reset
              </button>
            )}
          </div>

          {isAdmin && (
            <select style={s.select} value={fStore} onChange={e=>setFStore(e.target.value)}>
              <option value="tutti">Tutti i negozi</option>
              {STORES.map(st=><option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          )}
          <span style={{fontSize:12,color:C.grayLight,marginLeft:"auto"}}>{filtered.length} ordini</span>
        </div>

        {/* Orders Table */}
        <div style={{background:C.card, borderRadius:10, border:`1px solid ${C.border}`, overflow:"hidden"}}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>ID Ordine</th>
                {isAdmin && <th style={s.th}>Negozio</th>}
                <th style={s.th}>Data</th>
                <th style={s.th}>Categorie</th>
                <th style={s.th}>Voci</th>
                <th style={s.th}>Stato</th>
                <th style={{...s.th,width:60}}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => {
                const cats = [...new Set(order.items.map(i=>i.cat))];
                return (
                  <tr key={order.id} style={{background:C.card, cursor:"pointer", transition:"background .1s"}}
                    onMouseOver={e=>{e.currentTarget.style.background=C.grayBg}}
                    onMouseOut={e=>{e.currentTarget.style.background=C.card}}
                    onClick={()=>setExpandedId(order.id)}>
                    <td style={{...s.td, fontWeight:700, fontFamily:"monospace", fontSize:13}}>{order.id}</td>
                    {isAdmin && <td style={s.td}>{storeName(order.store)}</td>}
                    <td style={{...s.td, color:C.textSec}}>{new Date(order.date).toLocaleDateString("it-IT")}</td>
                    <td style={s.td}>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                        {cats.map(c => <Pill key={c} label={CATEGORIES[c]?.icon+" "+CATEGORIES[c]?.label}
                          color={CATEGORIES[c]?.color} bg={CATEGORIES[c]?.bg} small/>)}
                      </div>
                    </td>
                    <td style={{...s.td, color:C.textSec}}>{order.items.length} voci</td>
                    <td style={s.td}><Pill {...STATUS[order.status]}/></td>
                    <td style={{...s.td, textAlign:"center", fontSize:14, color:C.primary, fontWeight:600}}>
                      Apri →
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={isAdmin?7:6} style={{...s.td,textAlign:"center",padding:40,color:C.grayLight}}>
                  Nessun ordine trovato
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {renderCreateModal()}
      {renderDetailModal()}
    </div>
  );
}
