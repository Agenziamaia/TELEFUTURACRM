// @ts-nocheck
"use client";
import { useState, useCallback, useEffect, memo, useContext, useRef, useReducer, useMemo, createContext } from "react";
import { createPortal } from "react-dom";
import { ErrorBoundaryClient } from "@/components/ErrorBoundaryClient";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { MARG_PRODUCTS_LEGACY } from "@/lib/margMargini";
import { trovaAppuntamentoDaAgganciare, agganciaVenditaAppuntamento, appuntamentiPerCF, venditoreLavoraIn } from "@/lib/matchAppuntamento";
import { registraContrattoBrands, registraContrattoAlbero, contrattoRichiestoPer } from "@/lib/contrattoAllegato";
import { storeRoot as _storeRoot } from "@/lib/storeRoot";
import { categoriaDi, controlliDi, CANONICA_BY_ID, categoriaDef, vaInTracking } from "@/lib/tassonomia";
import { SLUG_CATALOGO, CAT_MACRO_ID } from "@/lib/catalogoVendita";
import { risolviCampi, impostaRegoleCampi } from "@/lib/campiRegole";
import { dataNascitaDaCF } from "@/lib/dataNascita";
import { trovaDuplicati, liberaCellulare } from "@/lib/clientChecks";
import { erroreIbanIT } from "@/lib/iban";
import { IndirizzoAutocomplete, civicoMancante } from "@/components/IndirizzoAutocomplete";
import { useClientiVisibili } from "@/lib/clientiVisibili";
import { stessoMagazzino } from "@/lib/visibleStores";
import { CODICI_KENA } from "@/lib/codiciInserimento";
import { numeroNazionale } from "@/lib/telefono";
import { useAuth } from "@/context/AuthContext";
import QRCode from "qrcode";
const ReqCtx = createContext(null);
const SubKeyCtx = createContext(null);
let _FUID = 0;
const _isEmptyVal=(v)=>!(v!==undefined&&v!==null&&String(v).trim()!=="");


// ═══════════════════════════════════════════════════════════════
// v9 ENHANCEMENTS: Auto-save, Smart Defaults, Validation, Marginalità
// ═══════════════════════════════════════════════════════════════

// ── AUTO-SAVE ──
// enabled: non salvare finche' la bozza non e' stata ricaricata, altrimenti al
// mount lo stato VUOTO sovrascriverebbe la bozza prima del ripristino (#118).
const useAutoSave=(key,state,enabled=true)=>{useEffect(()=>{if(!enabled)return;try{sessionStorage.setItem(key,JSON.stringify(state))}catch(e){}},[key,state,enabled])};
const loadDraft=(key)=>{try{const d=sessionStorage.getItem(key);return d?JSON.parse(d):null}catch(e){return null}};
const clearDraft=(key)=>{try{sessionStorage.removeItem(key)}catch(e){}};

// ── VALIDATION ──
const vIMEI=(v)=>{if(!v)return null;const d=v.replace(/\D/g,"");if(!d.length)return null;if(d.length!==15)return{ok:false,msg:`${d.length}/15`};let s=0;for(let i=0;i<14;i++){let n=parseInt(d[i]);if(i%2===1)n*=2;if(n>9)n-=9;s+=n}return{ok:(10-s%10)%10===parseInt(d[14]),msg:d.length===15?"✓ Valido":""}};
const vICCID=(v)=>{if(!v)return null;const d=v.replace(/\D/g,"");if(!d.length)return null;return{ok:d.length>=19&&d.length<=20,msg:d.length>=19?`✓ ${d.length}`:`${d.length}/19-20`}};
const vCF=(v)=>{if(!v)return null;const u=v.toUpperCase().replace(/\s/g,"");if(!u.length)return null;if(u.length===11&&/^\d{11}$/.test(u))return{ok:true,msg:"P.IVA"};if(u.length!==16)return{ok:false,msg:`${u.length}/16`};return{ok:/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(u),msg:u.length===16?"✓":"err"}};

// ── MARGINALITÀ DATA ──
// #102 (Francesco): logo del brand per ogni SIM + raggruppamento per brand nel
// picker "Registra Prodotto". SimL e Subentro/Reale Util. = logo Telefutura
// (sono prodotti nostri, non di un operatore).
const SIM_BRANDS={
  windtre:   {logo:"/windtre.png",         label:"WindTre",     color:"var(--tf-ff6b00)"},
  vodafone:  {logo:"/vodaphone - Copy.png", label:"Vodafone",    color:"var(--tf-e60000)"},
  fastweb:   {logo:"/fastweb.png",          label:"Fastweb",     color:"var(--tf-cc9900)"},
  tim:       {logo:"/tim-logo-v2.png",      label:"TIM",         color:"var(--tf-0050ff)"},
  iliad:     {logo:"/iliad.png",            label:"Iliad",       color:"var(--tf-c00028)"},
  sky:       {logo:"/sky.png",              label:"Sky",         color:"var(--tf-0072c6)"},
  ho:        {logo:"/ho-mobile.png",        label:"Ho. Mobile",  color:"var(--tf-e6007e)"},
  very:      {logo:"/very-mobile.png",      label:"Very Mobile", color:"var(--tf-1fa300)"},
  kena:      {logo:"/kena-mobile-v2.png",   label:"Kena Mobile", color:"var(--tf-f5a623)"},
  telefutura:{logo:"/logo-crm.png",         label:"Telefutura",  color:"var(--tf-6f42c1)"},
};
const SIM_BRAND_ORDER=["windtre","vodafone","fastweb","tim","iliad","sky","ho","very","kena","telefutura"];
// Catalogo storico marginalita' → src/lib/margMargini (fonte unica, cantiere conto economico 07/08)

// ── PANNELLO = FONTE UNICA della marginalita' (Luca 03/08): il catalogo si
//    legge da marg_categories/marg_items (Amministrazione → Marginalità).
//    Regole margine del pannello: costo fisso → utile = prezzo − costo
//    azienda; % margine → utile = prezzo × %. Le voci del pannello SENZA
//    valori compilati tengono i margini storici del codice (match per nome),
//    cosi' le gare non perdono i margini finche' il pannello non li definisce.
//    I comportamenti speciali (magazzino usato, Telefono Cash, quantita',
//    modello) restano agganciati per nome alla voce storica.
let MARG_PRODUCTS = MARG_PRODUCTS_LEGACY;
let _margCatAttesa = null;
const _margNorm = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const _MARG_BRAND_MAP = { WINDTRE: "windtre", VODAFONE: "vodafone", FASTWEB: "fastweb", TIM: "tim", ILIAD: "iliad", SKY: "sky", S4: "s4", VERYMOBILE: "very", HOMOBILE: "ho", KENAMOBILE: "kena", DOJO: "dojo" };
const _MARG_CAT_EMOJI = { PRODOTTI: "📦", SERVIZI: "🔧", KASKO: "🛡️", SIM: "📶", ESIM: "📲", TELEFONOCASH: "📱" };
const caricaMargCatalogo = () => {
  if (_margCatAttesa) return _margCatAttesa;
  _margCatAttesa = (async () => {
    try {
      const [rc, ri] = await Promise.all([
        supabase.from("marg_categories").select("*").order("sort_order"),
        supabase.from("marg_items").select("*").eq("active", true).order("sort_order"),
      ]);
      const cats = (rc.data || []).filter(c => c.active !== false);
      const items = ri.data || [];
      if (!cats.length || !items.length) return MARG_PRODUCTS;
      const legacyByName = {};
      MARG_PRODUCTS_LEGACY.forEach(c => c.items.forEach(it => { legacyByName[_margNorm(it.name)] = it; }));
      const gruppi = [];
      cats.forEach(c => {
        const voci = items.filter(i => i.category_id === c.id).map(i => {
          const legacy = legacyByName[_margNorm(i.name)] || {};
          const haCosto = i.cost_mode === "costo_fisso" && i.company_cost != null;
          const haPct = i.cost_mode !== "costo_fisso" && i.margin_percent != null;
          const margine = haCosto ? { type: "cost", companyCost: Number(i.company_cost) }
            : haPct ? { type: "pct", pctMargin: Number(i.margin_percent) }
              : legacy.type ? { type: legacy.type, fixedMargin: legacy.fixedMargin, pctMargin: legacy.pctMargin }
                : { type: "pct", pctMargin: 0 };
          return {
            id: legacy.id || "mi_" + i.id,
            name: i.name,
            price: i.default_price != null ? Number(i.default_price) : (legacy.price !== undefined ? legacy.price : null),
            icon: i.icon || legacy.icon || (c.kind === "servizi" ? "🔧" : "📦"),
            brand: i.brand ? (_MARG_BRAND_MAP[_margNorm(i.brand)] || _margNorm(i.brand).toLowerCase()) : legacy.brand,
            linked: !!(i.auto_link || legacy.linked || i.brand),
            hasQty: legacy.hasQty, needsModel: legacy.needsModel, needsImei: legacy.needsImei,
            isTelCash: legacy.isTelCash, countsPhone: legacy.countsPhone,
            vat: i.vat_rate, visibile: i.visible_value,
            ...margine,
          };
        });
        if (voci.length) gruppi.push({ cat: (c.icon || _MARG_CAT_EMOJI[_margNorm(c.name)] || "🏷️") + " " + c.name, grouped: _margNorm(c.name) === "SIM" || _margNorm(c.name) === "ESIM", items: voci });
      });
      if (gruppi.length) MARG_PRODUCTS = gruppi;
    } catch { /* pannello irraggiungibile: resta il catalogo storico */ }
    return MARG_PRODUCTS;
  })();
  return _margCatAttesa;
};
if (typeof window !== "undefined") caricaMargCatalogo();

// ── MARGINALITÀ POS OVERLAY ──
const calcMargLabel=(selProd,price,qty)=>{
  if(!selProd)return"";
  const pVal=selProd.price!==null?selProd.price:parseFloat(price)||0;
  const mVal=selProd.type==="fixed"?(selProd.fixedMargin||0):selProd.type==="pct"?(pVal*(selProd.pctMargin||0)/100):selProd.type==="cost"?(pVal-(selProd.companyCost||0)):0;
  const q=parseInt(qty)||1;
  const label=selProd.type==="pct"?`${selProd.pctMargin}% di €${pVal.toFixed(2)} = €${mVal.toFixed(2)}`:selProd.type==="cost"?`€${pVal.toFixed(2)} − costo €${(selProd.companyCost||0).toFixed(2)} = €${mVal.toFixed(2)}`:`€${mVal.toFixed(2)}`;
  return`${label}${q>1?` × ${q} = €${(mVal*q).toFixed(2)}`:""}`;
};
// ── MAGAZZINO USATI (reale: tabella "usati") ──
// Era una mappa hardcoded di 6 IMEI inventati: la ricerca per IMEI non guardava
// il magazzino vero, quindi un usato realmente a magazzino risultava "non presente".
let USED_WAREHOUSE={};
let usedWarehouseLoaded=false;
async function loadUsedWarehouse(){
  if(usedWarehouseLoaded)return USED_WAREHOUSE;
  usedWarehouseLoaded=true;
  try{
    const {data}=await supabase.from("usati").select("imei, model");
    const m={};
    (data||[]).forEach(r=>{const d=String(r.imei||"").replace(/\D/g,"");if(d)m[d]=r.model||"";});
    USED_WAREHOUSE=m;
  }catch{usedWarehouseLoaded=false;}
  return USED_WAREHOUSE;
}
if(typeof window!=="undefined")loadUsedWarehouse();
const lookupUsato=(imei)=>{const d=String(imei||"").replace(/\D/g,"");return d.length===15?(USED_WAREHOUSE[d]||""):"";};
// SCARICO MAGAZZINO USATI (Luca 31/07): la vendita da qui e' l'UNICO punto che
// porta un telefono a "venduto" su Gestione Usati (il passaggio manuale in quella
// pagina non esiste piu'). Si scaricano solo i dispositivi IN VENDITA — un telefono
// in altra fase va prima portato in vetrina dalla pagina usati.
async function scaricaUsatiVenduti(items,clientId,dateStr,vendFallback){
  for(const mi of (items||[])){
    if(mi.productId!=="vendita_usato")continue;
    for(const u of (Array.isArray(mi.units)?mi.units:[])){
      try{
        const imeiDigits=String(u.imei||"").replace(/\D/g,"");
        let row=null;
        if(u.usatoId){const r=await supabase.from("usati").select("id,status,status_history,sale_price").eq("id",u.usatoId).maybeSingle();row=r.data||null;}
        if(!row&&imeiDigits.length===15){const r=await supabase.from("usati").select("id,status,status_history,sale_price").eq("imei",imeiDigits).eq("status","in_vendita").maybeSingle();row=r.data||null;}
        if(!row||row.status!=="in_vendita")continue;
        const hist=(row.status_history&&typeof row.status_history==="object")?row.status_history:{};
        const prezzo=parseFloat(String(u.prezzo??"").replace(",","."))||Number(row.sale_price)||null;
        const soldIso=dateStr?new Date(dateStr+"T12:00:00").toISOString():new Date().toISOString();
        const upd={status:"venduto",sold_date:soldIso,sold_price:prezzo,client_id:clientId||null,
          status_history:{...hist,venduto:{date:new Date().toISOString(),operatore:`${mi.vendor||mi.venditore||vendFallback||"—"} — scarico da Registra Vendita`}}};
        let {error}=await supabase.from("usati").update(upd).eq("id",row.id);
        if(error&&/column/i.test(error.message||"")){
          // fallback difensivo se client_id/sold_price non esistessero ancora
          const{client_id:_c,sold_price:_s,...rest}=upd;
          ({error}=await supabase.from("usati").update(rest).eq("id",row.id));
        }
        if(error)console.error("Scarico usato fallito:",error.message);
      }catch(e){console.error("Scarico usato fallito:",e);}
    }
  }
}
const MargPOS=memo(({show,onClose,venditore,negozio,onAdd,editItem,inline})=>{
  const [selCat,setSelCat]=useState(0);
  const [qMarg,setQMarg]=useState("");   // ricerca libera su TUTTO il catalogo (Luca 03/08)
  // catalogo dal PANNELLO (03/08): al primo render il modulo potrebbe avere
  // ancora il ripiego storico — quando la lettura dal DB arriva si ridisegna
  const [,_margTick]=useState(0);
  useEffect(()=>{let vivo=true;caricaMargCatalogo().then(()=>{if(vivo)_margTick(x=>x+1);});return()=>{vivo=false};},[]);
  const [selProd,setSelProd]=useState(null);
  const [price,setPrice]=useState("");
  const [qty,setQty]=useState("1");
  const [importo,setImporto]=useState("");
  const [model,setModel]=useState("");
  const [imei,setImei]=useState("");
  const [usatoUnits,setUsatoUnits]=useState([{imei:"",model:""}]);
  const setUnit=(i,k,v)=>{setUsatoUnits(prev=>{const a=[...prev];a[i]={...a[i],[k]:v};return a;});};
  const clearUnit=(i)=>{setUsatoUnits(prev=>{const a=[...prev];a[i]={imei:"",model:""};return a;});};
  const onUnitImei=(i,raw)=>{const v=raw.replace(/\D/g,"").slice(0,15);setUsatoUnits(prev=>{const a=[...prev];a[i]={...a[i],imei:v};return a;});if(v.length===15){supabase.from("usati").select("model").eq("imei",v).maybeSingle().then(r=>{if(r&&r.data&&r.data.model)setUsatoUnits(prev=>{const a=[...prev];if(a[i])a[i]={...a[i],model:r.data.model};return a;})}).catch(()=>{})}};
  // MAGAZZINO USATI collegato (Luca 31/07): i telefoni IN VENDITA del negozio si
  // scelgono da una lista (cerchi per modello o IMEI), il prezzo si precompila dal
  // listino e alla registrazione il telefono viene SCARICATO (venduto) anche su
  // Gestione Usati.
  const [magUsati,setMagUsati]=useState([]);
  useEffect(()=>{
    if(!(show&&selProd&&selProd.needsImei))return;
    let vivo=true;
    // NB: niente colonna "brand" — in usati il brand sta DENTRO model
    // ("Apple iPhone 17 Pro Max"): selezionarla faceva fallire la query
    // in silenzio e il magazzino risultava sempre vuoto
    supabase.from("usati").select("id, imei, model, sale_price, store").eq("status","in_vendita").then(({data})=>{
      if(!vivo)return;
      const tutti=(data||[]).map(r=>({id:r.id,imei:String(r.imei||""),model:r.model||"",prezzo:Number(r.sale_price)||0,store:r.store||""}));
      // sede FISICA, non nome esatto: i negozi doppi (Magliana W3/Multi, Acilia,
      // Collatina) condividono il magazzino — da uno dei due si scarica anche l'altro
      setMagUsati(negozio?tutti.filter(t=>stessoMagazzino(t.store,negozio)):tutti);
    }).catch(()=>{});
    return()=>{vivo=false};
  },[show,selProd,negozio]);
  // importo totale della voce = somma dei prezzi delle unita' scelte dal
  // magazzino: il campo Importo non si mostra piu' per l'usato (Luca 31/07,
  // era un doppione del prezzo nel riquadro) ma resta la base del margine
  useEffect(()=>{
    if(!(show&&selProd&&selProd.needsImei))return;
    const somma=usatoUnits.reduce((s,u)=>s+(parseFloat(String(u.prezzo??"").replace(",","."))||0),0);
    setImporto(somma>0?String(Math.round(somma*100)/100):"");
  },[usatoUnits,selProd,show]);
  useEffect(()=>{
    if(show&&editItem){
      const found=MARG_PRODUCTS.flatMap(c=>c.items).find(p=>p.id===editItem.productId);
      if(found){
        const catIdx=MARG_PRODUCTS.findIndex(c=>c.items.some(p=>p.id===found.id));
        setSelCat(catIdx>=0?catIdx:0);
        setSelProd(found);
        setQty(String(editItem.qty||1));
        setImporto(editItem.importo!=null?String(editItem.importo):"");
        setModel(editItem.model||"");
        setImei(editItem.imei||"");
        if(found.needsImei&&Array.isArray(editItem.units)&&editItem.units.length)setUsatoUnits(editItem.units.map(u=>({imei:u.imei||"",model:u.model||"",usatoId:u.usatoId||null,prezzo:u.prezzo!=null?String(u.prezzo):""})));
        if(found.price===null)setPrice(String(editItem.price||""));
      }
    } else if(show&&!editItem){
      setSelProd(null);setPrice("");setQty("1");setImporto("");setModel("");setImei("");setUsatoUnits([{imei:"",model:""}]);
    }
  },[show,editItem]);
  useEffect(()=>{
    if(show&&selProd&&selProd.needsImei){const n=Math.max(1,parseInt(qty)||1);setUsatoUnits(prev=>{const a=prev.map(u=>({...u}));while(a.length<n)a.push({imei:"",model:""});a.length=n;return a;});}
  },[qty,selProd,show]);
  if(!show)return null;
  // Prezzo di vendita OBBLIGATORIO anche dall'aggiunta manuale: per le voci di brand
  // (SIM/ESIM/Sost, linked) e per quelle a margine percentuale (senza importo il
  // margine verrebbe 0). Le vendite SIM a importo NULL nascevano proprio da qui:
  // la guardia al checkout copriva solo le voci AUTO del flusso brand.
  const needImporto=!!(selProd&&(selProd.linked||selProd.type==="pct"||selProd.type==="cost"));
  const importoMissing=needImporto&&String(importo).trim()==="";
  const handleAdd=()=>{
    if(!selProd)return;
    if(importoMissing)return;
    const p=selProd;
    const impVal=String(importo).trim()===""?null:(parseFloat(importo)||0);
    // Telefono Cash: la base del 4% e' l'importo di VENDITA inserito.
    const pVal=p.isTelCash?(parseFloat(importo)||0):(p.price!==null?p.price:parseFloat(price)||0);
    const mVal=p.type==="fixed"?(p.fixedMargin||0):p.type==="pct"?(pVal*(p.pctMargin||0)/100):p.type==="cost"?(pVal-(p.companyCost||0)):0;
    if(p.needsImei){
      // SOLO telefoni scelti dal magazzino (Luca 31/07): niente IMEI a mano.
      const units=usatoUnits.filter(u=>u.usatoId).map(u=>({imei:u.imei||"",model:u.model||"",usatoId:u.usatoId,prezzo:(u.prezzo!=null&&String(u.prezzo).trim()!=="")?(parseFloat(String(u.prezzo).replace(",","."))||null):null,finanziato:u.finanziato||null,rate:u.finanziato==="si"?(parseInt(u.rate)||null):null}));
      if(units.length===0)return;
      // MOD-44: la scelta finanziamento e' OBBLIGATORIA (e con Si' servono le rate)
      if(usatoUnits.some(u=>u.usatoId&&(!u.finanziato||(u.finanziato==="si"&&!(parseInt(u.rate)>0)))))return;
      const _im=units.map(u=>String(u.imei||"").replace(/\D/g,"")).filter(x=>x.length===15);
      if(new Set(_im).size!==_im.length)return;
      const q=units.length||1;
      onAdd({product:p.name,productId:p.id,price:pVal,qty:q,importo:impVal,margin:mVal,totalMargin:mVal*q,model:units.map(u=>u.model).filter(Boolean).join(", ")||null,imei:units.map(u=>u.imei).filter(Boolean).join(", ")||null,units,venditore,negozio,date:new Date().toISOString().split("T")[0],linked:p.linked||false,countsPhone:p.countsPhone||false,priceRequired:needImporto});
    }else{
      onAdd({product:p.name,productId:p.id,price:pVal,qty:parseInt(qty)||1,importo:impVal,margin:mVal,totalMargin:mVal*(parseInt(qty)||1),model:model||null,imei:imei||null,venditore,negozio,date:new Date().toISOString().split("T")[0],linked:p.linked||false,countsPhone:p.countsPhone||false,priceRequired:needImporto});
    }
    setSelProd(null);setPrice("");setQty("1");setImporto("");setModel("");setImei("");setUsatoUnits([{imei:"",model:""}]);
  };
  const _usImeis=usatoUnits.map(u=>String(u.imei||"").replace(/\D/g,"")).filter(x=>x.length===15);
  const hasDupImei=!!(selProd&&selProd.needsImei)&&(new Set(_usImeis).size!==_usImeis.length);
  const unitMissing=!!(selProd&&selProd.needsImei)&&!usatoUnits.some(u=>u.usatoId);
  // MOD-44: gate finanziamento (scelta obbligatoria; Si' → rate)
  const finMissing=!!(selProd&&selProd.needsImei)&&usatoUnits.some(u=>u.usatoId&&(!u.finanziato||(u.finanziato==="si"&&!(parseInt(u.rate)>0))));
  return(<div style={inline?{width:"100%"}:{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(4px)"}}>
    {!inline&&<style>{`@keyframes margSlideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>}
    <div style={inline?{background:"transparent",width:"100%",display:"flex",flexDirection:"column"}:{background:"var(--tf-w20)",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:760,maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 -4px 30px rgba(0,0,0,.2)",animation:"margSlideUp 0.32s cubic-bezier(0.22,1,0.36,1)"}}>
      <div style={{padding:"16px 20px",borderBottom:"2px solid var(--tf-w30)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontSize:16,fontWeight:800,color:"var(--tf-f8fafc)"}}>📦 Registra Prodotto</div><div style={{fontSize:11,color:"var(--tf-64748b)"}}>{venditore||"—"} • {negozio||"—"} • {new Date().toLocaleDateString("it-IT")}</div></div>
        {!inline&&<button onClick={onClose} style={{padding:"6px 14px",borderRadius:8,border:"1px solid var(--tf-w100)",background:"var(--tf-w20)",color:"var(--tf-8892b0)",fontSize:12,fontWeight:600,cursor:"pointer"}}>✕</button>}
      </div>
      <div style={{display:"flex",gap:4,padding:"10px 16px",overflowX:"auto",borderBottom:"1px solid var(--tf-w30)"}}>
        <input value={qMarg} onChange={e=>{setQMarg(e.target.value);setSelProd(null);}} placeholder="🔍 Cerca in tutto il catalogo…"
          style={{minWidth:190,flex:"0 1 220px",padding:"7px 12px",borderRadius:8,border:"1px solid var(--tf-w120)",background:"var(--tf-w50)",color:"var(--tf-f8fafc)",fontSize:12,outline:"none"}}/>
        {MARG_PRODUCTS.map((cat,ci)=>(<button key={ci} onClick={()=>{setSelCat(ci);setSelProd(null);setQMarg("")}} style={{padding:"6px 14px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",border:selCat===ci?"2px solid #6f42c1":"2px solid var(--tf-w100)",background:selCat===ci?"rgba(111,66,193,0.12)":"var(--tf-w40)",color:selCat===ci?"var(--tf-6f42c1)":"var(--tf-8892b0)"}}>{cat.cat}</button>))}
      </div>
      <div style={{flex:1,overflow:"auto",padding:16}}>
        {!selProd?(qMarg.trim()?(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:10}}>
            {MARG_PRODUCTS.flatMap((c)=>c.items.map(pr=>({pr,catNome:c.cat}))).filter(x=>x.pr.name.toLowerCase().includes(qMarg.trim().toLowerCase())).slice(0,60).map(({pr,catNome})=>(
              <button key={catNome+"_"+pr.id} onClick={()=>{setSelProd(pr);if(pr.price!==null)setPrice(String(pr.price));setQMarg("");}}
                style={{padding:"20px 12px",borderRadius:14,border:"1px solid var(--tf-w60)",background:"var(--tf-w30)",cursor:"pointer",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                {/* RVUI-01: stesso lookup logo dell'header dettaglio — condizione STRETTA su
                    SIM_BRANDS (brand non mappati, es. s4/dojo, cadono sull'emoji) */}
                {pr.brand&&SIM_BRANDS[pr.brand]?<img src={SIM_BRANDS[pr.brand].logo} alt="" style={{height:56,width:"auto",maxWidth:"88%",objectFit:"contain"}}/>:<span style={{fontSize:30}}>{pr.icon||"📦"}</span>}
                <span style={{fontSize:13,fontWeight:600,color:"var(--tf-f8fafc)",lineHeight:1.2}}>{pr.name}</span>
                <span style={{fontSize:11,color:"var(--tf-8892b0)"}}>{catNome}</span>
              </button>))}
            {MARG_PRODUCTS.flatMap((c)=>c.items).filter(pr=>pr.name.toLowerCase().includes(qMarg.trim().toLowerCase())).length===0&&<div style={{gridColumn:"1/-1",textAlign:"center",padding:20,color:"var(--tf-64748b)",fontSize:12}}>Nessun prodotto per “{qMarg}”</div>}
          </div>
        ):MARG_PRODUCTS[selCat].grouped?(
          // #102: SIM/ESIM affiancate e ordinate per brand (senza titolo), logo grande del brand
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
            {SIM_BRAND_ORDER.flatMap(bk=>MARG_PRODUCTS[selCat].items.filter(p=>p.brand===bk)).map(p=>{const info=SIM_BRANDS[p.brand]||{color:"var(--tf-64748b)",logo:"/logo-crm.png"};return (
              <button key={p.id} onClick={()=>{setSelProd(p);if(p.price!==null)setPrice(String(p.price))}} style={{padding:"20px 12px",borderRadius:14,border:`1px solid ${info.color}33`,background:`${info.color}14`,cursor:"pointer",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                <img src={info.logo} alt="" style={{height:56,width:"auto",maxWidth:"88%",objectFit:"contain"}}/>
                <span style={{fontSize:13,fontWeight:600,color:"var(--tf-f8fafc)",lineHeight:1.2}}>{p.name}</span>
              </button>);})}
            {/* RVUI-01: in coda le voci con brand assente o fuori da SIM_BRAND_ORDER
                (es. create dal pannello, o s4/dojo): ramo emoji, cosi' non spariscono */}
            {MARG_PRODUCTS[selCat].items.filter(p=>!SIM_BRAND_ORDER.includes(p.brand)).map(p=>(
              <button key={p.id} onClick={()=>{setSelProd(p);if(p.price!==null)setPrice(String(p.price))}} style={{padding:"20px 12px",borderRadius:14,border:"1px solid var(--tf-w60)",background:"var(--tf-w30)",cursor:"pointer",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                <span style={{fontSize:30}}>{p.icon||"📦"}</span>
                <span style={{fontSize:13,fontWeight:600,color:"var(--tf-f8fafc)",lineHeight:1.2}}>{p.name}</span>
              </button>))}
          </div>
        ):(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
          {MARG_PRODUCTS[selCat].items.map(p=>(<button key={p.id} onClick={()=>{setSelProd(p);if(p.price!==null)setPrice(String(p.price))}} style={{padding:"20px 12px",borderRadius:14,border:"1px solid var(--tf-w60)",background:"var(--tf-w30)",cursor:"pointer",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <span style={{fontSize:30}}>{p.icon}</span>
            <span style={{fontSize:13,fontWeight:600,color:"var(--tf-f8fafc)",lineHeight:1.2}}>{p.name}</span>
          </button>))}
        </div>)):(<div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <button onClick={()=>setSelProd(null)} style={{background:"none",border:"none",color:"var(--tf-6f42c1)",fontSize:13,cursor:"pointer",fontWeight:600}}>← Indietro</button>
            {selProd.brand&&SIM_BRANDS[selProd.brand]?<img src={SIM_BRANDS[selProd.brand].logo} alt="" style={{height:24,width:"auto",maxWidth:90,objectFit:"contain"}}/>:<span style={{fontSize:22}}>{selProd.icon}</span>}
            <span style={{fontSize:16,fontWeight:800,color:"var(--tf-f8fafc)"}}>{selProd.name}</span>
          </div>
          <div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:3}}>Quantità</div>
            <input value={qty} onChange={e=>setQty(e.target.value)} type="number" min="1" style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"1px solid var(--tf-w100)",fontSize:14,fontWeight:700,boxSizing:"border-box"}}/></div>
          {selProd.needsModel&&!selProd.needsImei&&<div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:3}}>Modello</div><input value={model} onChange={e=>setModel(e.target.value)} placeholder="es. iPhone 15..." style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"1px solid var(--tf-w100)",fontSize:13,boxSizing:"border-box"}}/></div>}
          {/* TELEFONO CASH: modello dalla lista condivisa + IMEI libero (nessun collegamento
              al magazzino usato) + importo di vendita (base del 4%). */}
          {selProd.isTelCash&&<div style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--tf-6f42c1)",marginBottom:6,textTransform:"uppercase"}}>IMEI Dispositivo</div>
            <div style={{padding:10,borderRadius:10,border:"1px solid var(--tf-w60)",background:"var(--tf-w30)"}}>
              <div style={{marginBottom:8}}><DD l="Modello" r v={model} o={v=>setModel(v)} vals={SOLO_ALTRO} cerca={cercaTerminali}/></div>
              <div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:3}}>IMEI</div>
              <input value={imei} onChange={e=>setImei(e.target.value.replace(/\D/g,"").slice(0,15))} placeholder="IMEI (15 cifre)"
                style={{width:"100%",padding:"9px 12px",borderRadius:8,border:String(imei).length===15?"2px solid #28a745":"1px solid var(--tf-w100)",fontSize:13,boxSizing:"border-box",fontFamily:"monospace"}}/>
            </div>
          </div>}
          {selProd.needsImei&&<div style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--tf-6f42c1)",marginBottom:6,textTransform:"uppercase"}}>Dispositivi usati ({usatoUnits.length}) — magazzino di {negozio||"—"}</div>
            {magUsati.length===0&&<div style={{fontSize:11,color:"var(--tf-fd7e14)",fontWeight:600,marginBottom:8}}>⚠ Nessun telefono In Vendita nel magazzino di {negozio||"questo negozio"}: per venderlo, l'usato deve prima essere In Vendita su Gestione Usati.</div>}
            {usatoUnits.map((u,i)=>{
              const _di=String(u.imei||"").replace(/\D/g,"");const done=_di.length===15;
              const dup=done&&usatoUnits.some((x,j)=>j!==i&&String(x.imei||"").replace(/\D/g,"")===_di);
              const q=String(u.cerca||"").trim().toLowerCase();
              const qd=q.replace(/\D/g,"");
              const presi=usatoUnits.map((x,j)=>j!==i?x.usatoId:null).filter(Boolean);
              const hits=q.length>=2?magUsati.filter(m=>!presi.includes(m.id)&&(m.model.toLowerCase().includes(q)||(qd.length>=4&&m.imei.replace(/\D/g,"").includes(qd)))).slice(0,8):[];
              return (
              <div key={i} style={{marginBottom:8,padding:10,borderRadius:10,border:"1px solid var(--tf-w60)",background:"var(--tf-w30)"}}>
                <div style={{fontSize:10,fontWeight:800,color:"var(--tf-6f42c1)",marginBottom:5}}>Unità #{i+1}</div>
                {u.usatoId?(
                  <div style={{padding:10,borderRadius:8,border:"2px solid #28a745",background:"rgba(40,167,69,0.10)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:800,color:"var(--tf-e2e8f0)"}}>✓ {u.model||"—"}</div>
                        <div style={{fontSize:11,color:"var(--tf-8892b0)",fontFamily:"monospace"}}>IMEI {u.imei}</div>
                        <div style={{fontSize:10,color:"var(--tf-28a745)",fontWeight:700,marginTop:2}}>Dal magazzino usati — verrà scaricato alla registrazione</div>
                      </div>
                      <button onClick={()=>clearUnit(i)} style={{padding:"5px 10px",borderRadius:8,border:"1px solid var(--tf-w150)",background:"var(--tf-w40)",color:"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>✕ cambia</button>
                    </div>
                    {/* MOD-44 (Luca 10/08): prezzo RISTRETTO + "Finanziato?" a destra
                        nello stesso quadrato; con Sì e' obbligatorio il n. rate */}
                    <div style={{marginTop:8,display:"flex",gap:14,alignItems:"flex-end",flexWrap:"wrap"}}>
                      <div style={{width:150}}>
                        <div style={{fontSize:10,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:3}}>Prezzo di VENDITA €</div>
                        <input value={u.prezzo??""} onChange={e=>setUnit(i,"prezzo",e.target.value)} type="number" min="0" step="0.01" placeholder="es. 199"
                          style={{width:"100%",padding:"9px 12px",borderRadius:8,border:String(u.prezzo??"").trim()===""?"2px solid #fd7e14":"1px solid var(--tf-w100)",fontSize:14,fontWeight:800,boxSizing:"border-box"}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:3}}>Ha fatto un FINANZIAMENTO? <span style={{color:"var(--tf-dc3545)"}}>*</span></div>
                        <div style={{display:"flex",gap:6}}>
                          {["si","no"].map(v=>(
                            <button key={v} type="button" onClick={()=>setUnit(i,"finanziato",v)}
                              style={{padding:"8px 18px",borderRadius:8,fontSize:13,fontWeight:800,cursor:"pointer",
                                border:u.finanziato===v?(v==="si"?"2px solid #f59e0b":"2px solid #28a745"):(!u.finanziato?"2px solid #fd7e14":"1px solid var(--tf-w100)"),
                                background:u.finanziato===v?(v==="si"?"rgba(245,158,11,0.18)":"rgba(40,167,69,0.15)"):"var(--tf-w30)",
                                color:u.finanziato===v?(v==="si"?"#fbbf24":"#4ade80"):"var(--tf-8892b0)"}}>
                              {v==="si"?"Sì":"No"}
                            </button>
                          ))}
                        </div>
                      </div>
                      {u.finanziato==="si"&&(
                        <div style={{width:110}}>
                          <div style={{fontSize:10,fontWeight:700,color:"var(--tf-fbbf24)",marginBottom:3}}>N. RATE <span style={{color:"var(--tf-dc3545)"}}>*</span></div>
                          <input value={u.rate??""} onChange={e=>setUnit(i,"rate",e.target.value.replace(/\D/g,"").slice(0,3))} type="number" min="1" placeholder="es. 24"
                            style={{width:"100%",padding:"9px 12px",borderRadius:8,border:!(parseInt(u.rate)>0)?"2px solid #fd7e14":"2px solid #f59e0b",fontSize:14,fontWeight:800,boxSizing:"border-box"}}/>
                        </div>
                      )}
                    </div>
                  </div>
                ):(
                  <>
                    <input value={u.cerca||""} onChange={e=>setUnit(i,"cerca",e.target.value)} placeholder={`Cerca per modello o IMEI nel magazzino di ${negozio||"—"}…`}
                      style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid var(--tf-w100)",fontSize:13,boxSizing:"border-box"}}/>
                    {hits.length>0&&<div style={{marginTop:6,borderRadius:8,border:"1px solid var(--tf-w80)",overflow:"hidden"}}>
                      {hits.map(m=>(
                        <button key={m.id} onClick={()=>{setUsatoUnits(prev=>{const a=[...prev];a[i]={imei:m.imei,model:m.model,usatoId:m.id,prezzo:m.prezzo>0?String(m.prezzo):""};return a;});}}
                          style={{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",border:"none",borderBottom:"1px solid var(--tf-w50)",background:"var(--tf-w20)",cursor:"pointer"}}>
                          <span style={{fontSize:13,fontWeight:700,color:"var(--tf-e2e8f0)"}}>📱 {m.model}</span>
                          <span style={{fontSize:11,color:"var(--tf-8892b0)",fontFamily:"monospace",marginLeft:8}}>IMEI {m.imei}</span>
                          {m.prezzo>0&&<span style={{fontSize:12,fontWeight:800,color:"var(--tf-28a745)",marginLeft:8}}>€ {m.prezzo}</span>}
                        </button>
                      ))}
                    </div>}
                    {q.length>=2&&hits.length===0&&<div style={{fontSize:10,color:"var(--tf-fd7e14)",fontWeight:700,marginTop:4}}>Nessun telefono In Vendita corrisponde nel magazzino di {negozio||"—"}: si vendono solo usati presenti a magazzino.</div>}
                  </>
                )}
              </div>
            );})}
          </div>}
          {!selProd.needsImei&&<div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:3}}>{selProd.isTelCash?"Importo di vendita €":"Importo €"}{needImporto&&<span style={{color:"var(--tf-dc3545)"}}> *</span>}</div>
            <input value={importo} onChange={e=>setImporto(e.target.value)} type="number" min="0" step="0.01" placeholder="es. 29.90" style={{width:"100%",padding:"10px 14px",borderRadius:10,border:importoMissing?"2px solid #dc3545":"1px solid var(--tf-w100)",fontSize:14,fontWeight:700,boxSizing:"border-box"}}/>
            {selProd.isTelCash&&<div style={{fontSize:10,color:"var(--tf-28a745)",fontWeight:700,marginTop:4}}>Margine 4% = € {(((parseFloat(importo)||0)*4)/100).toFixed(2)}</div>}</div>}
          {hasDupImei&&<div style={{marginBottom:8,padding:"8px 12px",borderRadius:8,background:"rgba(220,53,69,0.12)",border:"1px solid #f5c2c2",color:"var(--tf-dc3545)",fontSize:12,fontWeight:700,textAlign:"center"}}>⛔ Sono presenti IMEI duplicati: correggili per registrare</div>}
          {/* MOD-44: via i banner ridondanti del flusso usato — la card unità
              guida gia' (bordi arancio sui campi mancanti) */}
          {importoMissing&&!selProd.needsImei&&<div style={{marginBottom:8,padding:"8px 12px",borderRadius:8,background:"rgba(220,53,69,0.12)",border:"1px solid #f5c2c2",color:"var(--tf-dc3545)",fontSize:12,fontWeight:700,textAlign:"center"}}>⛔ Inserisci il prezzo di vendita per registrare {selProd.name}</div>}
          <button onClick={handleAdd} disabled={hasDupImei||importoMissing||unitMissing||finMissing} style={{width:"100%",padding:14,borderRadius:12,border:"none",background:(hasDupImei||importoMissing||unitMissing||finMissing)?"var(--tf-cfcfcf)":"linear-gradient(135deg,#6f42c1,#9b59b6)",color:"#fff",fontSize:14,fontWeight:800,cursor:(hasDupImei||importoMissing||unitMissing||finMissing)?"not-allowed":"pointer"}}>✅ Registra {selProd.name}</button>
        </div>)}
      </div>
    </div>
  </div>);
});

const MargList=memo(({items,onRemove,show,onClose})=>{
  if(!show)return null;
  const total=items.reduce((s,i)=>s+i.totalMargin,0);
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
    <div style={{background:"var(--tf-w20)",borderRadius:16,width:"100%",maxWidth:500,maxHeight:"80vh",overflow:"auto",padding:20,boxShadow:"0 8px 30px rgba(0,0,0,.2)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <span style={{fontSize:16,fontWeight:800,color:"var(--tf-f8fafc)"}}>📦 Prodotti ({items.length})</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:"var(--tf-64748b)",cursor:"pointer",fontSize:16}}>✕</button>
      </div>
      {items.length===0?<div style={{textAlign:"center",padding:20,color:"var(--tf-64748b)"}}>Nessun prodotto</div>:items.map((it,i)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid var(--tf-w30)"}}>
          <div><div style={{fontSize:12,fontWeight:600,color:"var(--tf-f8fafc)"}}>{it.product} ×{it.qty||1}</div><div style={{fontSize:10,color:"var(--tf-64748b)"}}>{it.model||""}{it.importo!=null?` — €${Number(it.importo).toFixed(2)}`:""}</div></div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={()=>onRemove(i)} style={{background:"none",border:"none",color:"var(--tf-dc3545)",cursor:"pointer",fontSize:11}}>✕</button>
          </div>
        </div>
      ))}
      {items.length>0&&<div style={{marginTop:12,padding:12,background:"rgba(0,114,198,0.10)",borderRadius:10,display:"flex",justifyContent:"space-between"}}>
        <span style={{fontWeight:700}}>Totale prodotti</span>
        <span style={{fontWeight:900,fontSize:18,color:"var(--tf-6f42c1)"}}>{items.length}</span>
      </div>}
    </div>
  </div>);
});


const BRANDS = [
  { id: "windtre", logo: "/windtre.png", label: "WindTre", short: "W3", color: "var(--tf-ff6b00)", gradient: "linear-gradient(135deg, #C24A00 0%, #FF6B00 100%)", icon: "📶", desc: "Mobile, Fisso, Luce & Gas, Assicurazioni, Protecta", ready: true },
  { id: "sky", logo: "/sky.png", label: "Sky", short: "SKY", color: "var(--tf-0072c6)", gradient: "linear-gradient(135deg, #003366 0%, #0072C6 100%)", icon: "📺", desc: "TV, Fibra, Mobile, Glass, Pacchetti combinati", ready: true },
  { id: "vodafone", logo: "/vodaphone - Copy.png", label: "Vodafone", short: "VF", color: "var(--tf-e60000)", gradient: "linear-gradient(135deg, #990000 0%, #E60000 100%)", icon: "📱", desc: "Mobile, Fisso, Multi-Servizi, Verisure", ready: true },
  { id: "fastweb", logo: "/fastweb.png", label: "Fastweb", short: "FW", color: "var(--tf-cc9900)", gradient: "linear-gradient(135deg, #CC9900 0%, #FFD800 100%)", icon: "⚡", desc: "Mobile, Fisso, Energy", ready: true },
  { id: "iliad", logo: "/iliad.png", label: "Iliad", short: "IL", color: "var(--tf-c00028)", gradient: "linear-gradient(135deg, #800018 0%, #C00028 100%)", icon: "📡", desc: "Mobile e Fisso (Fibra)", ready: true },
  { id: "energy", logo: "/energy - Copy.png", label: "S4", short: "S4", color: "var(--tf-28a745)", gradient: "linear-gradient(135deg, #1a6b2d 0%, #28a745 100%)", icon: "🔋", desc: "Forniture Luce e Gas", ready: true },
  { id: "dojo", logo: "/dojo-round.png", label: "Dojo", short: "DOJO", color: "var(--tf-14b8a6)", gradient: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)", icon: "🏧", desc: "POS e pagamenti", ready: true },
  { id: "tim", logo: "/tim-logo-v2.png", label: "TIM", short: "TIM", color: "var(--tf-0050ff)", gradient: "linear-gradient(135deg, #0033A0 0%, #0050FF 100%)", icon: "☎️", desc: "Mobile, Fisso, Multi-Servizi", ready: true },
  { id: "very", logo: "/very-mobile.png", label: "Very Mobile", short: "VERY", color: "var(--tf-1fa300)", gradient: "linear-gradient(135deg, #137A00 0%, #1FA300 100%)", icon: "🟢", desc: "Mobile", ready: true },
  { id: "ho", logo: "/ho-mobile.png", label: "Ho. Mobile", short: "HO", color: "var(--tf-e6007e)", gradient: "linear-gradient(135deg, #B0005F 0%, #E6007E 100%)", icon: "💗", desc: "Mobile", ready: true },
  { id: "kena", logo: "/kena-mobile-v2.png", label: "Kena Mobile", short: "KENA", color: "var(--tf-f5a623)", gradient: "linear-gradient(135deg, #C77F00 0%, #F5A623 100%)", icon: "🟠", desc: "Mobile", ready: true },
  // KIPOINT (Luca 06/08): spedizioni e ritiro pacchi — brand a matrice, spento
  // di default: lo vede solo chi ha la riga in store_brand_rules (Collatina, Libia)
  { id: "kipoint", logo: "/kipoint.png", label: "Kipoint", short: "KP", color: "#0a58ca", gradient: "linear-gradient(135deg, #043b8f 0%, #0a58ca 100%)", icon: "📦", desc: "Spedizioni e ritiro pacchi", ready: true, matrixOnly: true },
];
// Codici inserimento WindTre. "Garbatella" mancava (richiesta dell'ufficio):
// era gia' presente nelle liste di Vodafone, Fastweb, Iliad, Sky e Very.
const codiciW3 = ["Magliana","Libia","San Paolo","Mazzini","Donna","Promontori","Collatina","Garbatella"];
const SKY_CODICI_NEGOZIO = ["Acilia","Donna","Magliana","Garbatella","Promontori","Collatina"];
// Venditori dal DB (app_users attivi), stesso schema di `negozi`: l'array viene
// riempito IN PLACE perche' i componenti ne tengono il riferimento.
// Prima era una lista fissa di 37 soprannomi ("Alberto", "Ben Aziza", "Daniele2",
// "Marta2", "Sheekell"...) che non corrispondevano a nessun account: e' il motivo
// per cui in contracts.venditore sono finiti nomi inesistenti. Richiesta Francesco:
// "Tutti i nomi presenti nel menu a tendina Venditore devono corrispondere agli
// username delle credenziali di accesso."
const venditori=[];
const _vendSubs=new Set();
let _vendLoaded=false;
async function loadVenditori(){
  if(_vendLoaded)return;_vendLoaded=true;
  try{
    const {data}=await supabase.from("app_users").select("full_name").eq("active",true).order("full_name");
    const names=(data||[]).map(r=>r.full_name).filter(Boolean);
    venditori.length=0;venditori.push(...names);
    _vendSubs.forEach(fn=>fn());
  }catch{_vendLoaded=false;}
}
if(typeof window!=="undefined")loadVenditori();
function useVenditori(){
  const [,bump]=useState(0);
  useEffect(()=>{const fn=()=>bump(v=>v+1);_vendSubs.add(fn);loadVenditori();return()=>{_vendSubs.delete(fn);};},[]);
  return venditori;
}
// Negozi dal DB. L'array viene riempito IN PLACE perche' EN_CODICI_NEGOZIO punta
// allo stesso riferimento. Prima era hardcoded e conteneva ancora "Telefonico".
const negozi=[];
const _negoziSubs=new Set();
let _negoziLoaded=false;
async function loadNegozi(){
  if(_negoziLoaded)return;_negoziLoaded=true;
  try{
    const {data}=await supabase.from("stores").select("name").order("name");
    const names=(data||[]).map(r=>r.name).filter(Boolean);
    negozi.length=0;negozi.push(...names);
    _negoziSubs.forEach(fn=>fn());
  }catch{_negoziLoaded=false;}
}
if(typeof window!=="undefined")loadNegozi();
function useNegozi(){
  const [,bump]=useState(0);
  useEffect(()=>{const fn=()=>bump(v=>v+1);_negoziSubs.add(fn);loadNegozi();return()=>{_negoziSubs.delete(fn);};},[]);
  return negozi;
}
const opProv = ["Enel Energia","Eni Plenitude","A2A Energia","Edison Energia","Iren Mercato","Hera Comm","Sorgenia","Acea Energia","Engie","E.ON","Illumia","Wekiwi","Pulsee","Octopus Energy","Green Network","Dolomiti Energia","Axpo","NeN","Tate","WindTre Luce e Gas","Fastweb Energia","S4","Barton Energy","Altro"];
const opProvNoW3 = opProv.filter(o=>o!=="WindTre Luce e Gas");
const brandMNP = ["TIM","Vodafone","WindTre","Iliad","Sky Mobile","Fastweb Mobile","PosteMobile","ho. Mobile","Kena Mobile","Very Mobile","CoopVoce","Spusu","Lyca Mobile","1Mobile","Tiscali Mobile","Digi Mobil","Noitel","Optima Mobile","Feder Mobile","Rabona Mobile","Elimobile","BT Italia","Segnoverde Mobile","Uno Mobile","Saily","Visitel","Ops! Mobile"];
const SKY_TV = ["TV","TV 14,90","Sky Glass"];
const SKY_FIBRA = ["Fibra","3P","3P 35,80","4P"];
const SKY_BIZ_TV = ["TV Uffici"];
const SKY_BIZ_FIBRA = ["Sky Business"];
const SKY_BRAND_FIBRA = ["TIM","Vodafone","Fastweb","WINDTRE","Tiscali","Sky","BT Enia","Ehiweb","Open Fiber","Infratel","Vianova","Isiline","Convergenze","Full Telecom","Optima","Fibra.tn"];
const emS = () => ({active:true,fields:{},contract:{},gnp:false,gnpNum:"",gnpOp:"",secondaLinea:false,gnp2L:null,gnp2LBrand:"",gnp2LNum:"",domiciliazione:false,opProvenienza:"",codiceOverride:"",addons:{},domiciliato:null,convergente:null,tipMob:null,mnp:null,easyPay:null,tnpGa:null,tnpTipo:"",tnpModello:"",tnpImei:"",tnpCount:null,tnpModelli:[],tnpImeis:[],packAccessori:null,packAccessoriVal:"",packAccessoriQta:"",cbTnp:false,cbTnpTipo:"",cbTnpModello:"",cbTnpImei:"",cbTnpCount:null,cbTnpModelli:[],cbTnpImeis:[],cbPackAccessori:null,cbPackAccessoriVal:"",cbPackAccessoriQta:"",cbTnpCell:"",cbTnpCC:"",cbTnpCodIns:"",cbTnpReload:null,cbTnpReloadSel:{},cbCambio:false,cbCambioVal:"",cbCambioCell:"",cbCambioCC:"",cbCambioCodIns:"",cbAddon:false,cbAddonSel:{},rfModello:"",rfImei:"",cbRf:false,cbAddonCodIns:"",cbAddonSecCell:"",cbAddonRoCell:"",cbAddonRoImei:"",cbRfCodIns:"",tnpGaReload:null,tnpGaReloadSel:{},reloadForever:null,securitySel:{},voceCasaCb:null,protectaCodIns:"",vfOffers:{},vfContratti:{},vfOffer:null,vfMnp:null,vfMnpBrand:"",vfMnpNum:"",vfDomicilio:null,vfConvergenza:null,vfNumFisso:"",vfTnp:null,vfTnpList:[],dcNumProv:"",dcNum:"",dcIccid:"",dcCodIns:"",dcRicaricaAuto:null,vfSecurity:null,cbTnpList:[],cbTraslochi:false,cbTraslochiNum:"",cbTraslochiCodIns:"",cbSecurityCodIns:"",vfFIccid:"",cbCellulare:"",cbCodContratto:"",cbCodIns2:"",cbTaglia:null,dcCbNumProv:"",dcCbIccid:"",cbCambio2:false,cbCambioCell:"",cbCambioNumMod:"",cbCambioCodIns2:"",cbSecurity:false,cbSecurityCell:"",vfFLockIn:null,vfFConvergenza:null,vfFGnp:null,vfFGnpBrand:"",vfFGnpNum:"",vfFAddons:{},vfFCodIns:"",vfFNumProvVisorio:"",vfFNumDef:"",vfbOffer:null,vfbMnp:null,vfbMnpBrand:"",vfbMnpNum:"",vfbTnp:null,vfbModello:"",vfbImei:"",vfbRataPiva:null,vfbKaskoSel:{},vfbCodIns:"",vfbCbOn:false,vfbCbCell:"",vfbCbCodIns:"",vfbFGnp:null,vfbFGnpBrand:"",vfbFGnpNum:"",vfbFCodIns:"",vfbFNumProv:"",vfbFNumDef:"",vfbFMnp:null,vfbFMnpBrand:"",vfbFMnpNum:"",vfbFCombNumProv:"",vfbFCombIccid:"",vfbNum:"",vfbIccid:"",vfbFIccid:"",vfSolDigCodIns:"",verisureCodIns:"",kfCodIns:"",vcCodIns:"",fwOffer:null,fwMnp:null,fwFSecLineCount:0,fwFSecLines:[],fwMnpBrand:"",fwMnpNum:"",fwCodIns:"",fwNumProv:"",fwNumDef:"",fwIccid:"",fwFGnp:null,fwFGnpBrand:"",fwFGnpNum:"",fwFCodIns:"",fwFNumProv:"",fwFNumDef:"",fwPod:"",fwPdr:"",fwEnCodIns:"",ilOffer:null,ilMnp:null,ilDom:null,ilMnpBrand:"",ilMnpNum:"",ilCodIns:"",ilNumProv:"",ilNumDef:"",ilIccid:"",ilFGnp:null,ilFCodIns:"",ilFNumProv:"",ilFNumDef:"",ilFwaCodIns:"",ilFwaIccid:"",ilBizOffer:null,ilBizMnp:null,ilBizMnpBrand:"",ilBizDom:null,ilBizNum:"",ilBizIccid:"",ilBizNumDef:"",ilBizCodIns:"",enCodIns:"",enPod:"",enPdr:"",enProv:"",fwEnProv:"",w3SostCell:"",w3SostIccid:"",w3SostCodContr:"",w3SostCodIns:"",fwSostCell:"",fwSostIccid:"",fwSostCodContr:"",fwSostCodIns:"",vfSostCell:"",vfSostCodIns:"",timOffer:null,timMnp:null,timMnpBrand:"",timMnpNum:"",timTnp:null,timModello:"",timSpedizione:null,timFinanziato:null,timCodPratica:"",timVisionBox:null,timVisionTaglia:null,timVisionNumContr:"",timImei:"",timNumProv:"",timNum:"",timIccid:"",timCodIns:"",timFOffer:null,timFGnp:null,timFGnpBrand:"",timFGnpNum:"",timFNumProv:"",timFCodIns:"",timFVision:null,timFVisionTaglia:null,timFVisionNumContr:"",timTpTwin:null,timTpSeriale:"",timTpRecapito:"",timTpCodIns:"",veryOffer:null,veryMnp:null,veryMnpBrand:"",veryMnpNum:"",veryRicaricaAuto:null,veryFascia:null,veryCodIns:"",veryNumProv:"",veryNum:"",veryIccid:"",hoOffer:null,hoMnp:null,hoMnpBrand:"",hoMnpNum:"",hoRicaricaAuto:null,hoFascia:null,hoCodIns:"",hoNumProv:"",hoNum:"",hoIccid:"",kenaOffer:null,kenaMnp:null,kenaMnpBrand:"",kenaMnpNum:"",kenaRicaricaAuto:null,kenaFascia:null,kenaCodIns:"",kenaNumProv:"",kenaNum:"",kenaIccid:""});

const DET_LABELS={gnp:"GNP",gnpNum:"N. GNP",gnpOp:"Op. GNP",secondaLinea:"2ª Linea",gnp2L:"GNP 2ª Linea",gnp2LBrand:"Brand GNP 2L",gnp2LNum:"N. GNP 2L",domiciliazione:"Domiciliazione",opProvenienza:"Op. Provenienza",domiciliato:"Domiciliato",convergente:"Convergente",tipMob:"Tipologia",mnp:"MNP",easyPay:"EasyPay",tnpGa:"TNP GA",tnpTipo:"Tipo TNP",tnpModello:"Terminale",tnpImei:"IMEI TNP",tnpCount:"Q.tà TNP",packAccessori:"Pack Accessori",packAccessoriVal:"Importo Pack",packAccessoriQta:"Q.tà Accessori",cbTnp:"TNP CB",cbTnp2:"TNP CB",cbTnpTipo:"Tipo CB",cbTnpModello:"Term. CB",cbTnpImei:"IMEI CB",cbTnpCount:"Q.tà TNP CB",cbPackAccessori:"Pack Acc. CB",cbPackAccessoriVal:"Importo Pack CB",cbPackAccessoriQta:"Q.tà Acc. CB",cbTnpCell:"Cell. CB",cbTnpCC:"Cod.Cliente CB",cbTnpCodIns:"Cod.Ins. CB",cbTnpReload:"Reload CB",cbCambio:"Cambio Offerta",cbCambio2:"Cambio Offerta",cbCambioVal:"Offerta CB",cbCambioCell:"Cell. Cambio",cbCambioCC:"Cod.Cliente Cambio",cbCambioCodIns:"Cod.Ins. Cambio",cbCambioNumMod:"Numero Cambio",cbCambioCodIns2:"Cod.Ins. Cambio",cbCellulare:"Cellulare CB",cbCodContratto:"Cod. Contratto CB",cbCodIns2:"Cod.Ins. CB",cbTaglia:"Taglia CB",dcCbNumProv:"N. Provvisorio CB",dcCbIccid:"ICCID CB",cbSecurity:"Rete Sicura CB",cbSecurityCell:"Cell. Rete Sicura",cbSecurityCodIns:"Cod.Ins. Rete Sicura",cbTraslochi:"Traslochi",cbTraslochiNum:"N. Fisso Trasloco",cbTraslochiCodIns:"Cod.Ins. Trasloco",rfModello:"Modello Reload Forever",rfImei:"IMEI RF",cbRf:"Reload Forever CB",cbRfCodIns:"Cod.Ins. RF",cbAddonCodIns:"Cod.Ins. Add-on",cbAddonSecCell:"Cell. Security",cbAddonRoCell:"Cell. Reload Open",cbAddonRoImei:"IMEI Reload Open",tnpGaReload:"Reload GA",reloadForever:"Reload Forever",voceCasaCb:"Voce Casa CB",protectaCodIns:"Cod.Ins. Protecta",vfOffer:"Offerta",vfMnp:"MNP",vfMnpBrand:"Op. MNP",vfMnpNum:"N. MNP",vfDomicilio:"Domiciliata",vfConvergenza:"Convergenza",vfNumFisso:"N. Fisso Conv.",vfTnp:"TNP",vfSecurity:"Security",dcNumProv:"N. Provvisorio",dcNum:"Numero",dcIccid:"ICCID",dcCodIns:"Cod.Ins.",dcRicaricaAuto:"Ricarica Auto",vfFLockIn:"Lock In",vfFConvergenza:"Convergenza",vfFGnp:"GNP",vfFGnpBrand:"Op. GNP",vfFGnpNum:"N. GNP",vfFCodIns:"Cod.Ins.",vfFNumProvVisorio:"N. Provvisorio",vfFNumProv:"N. Provvisorio",vfFNumDef:"N. Definitivo",vfFIccid:"ICCID",vfbOffer:"Offerta",vfbMnp:"MNP",vfbMnpBrand:"Op. MNP",vfbMnpNum:"N. MNP",vfbTnp:"TNP",vfbModello:"Modello",vfbImei:"IMEI",vfbRataPiva:"Finanz.",vfbEasyRent:"Easy Rent",vfbCodIns:"Cod.Ins.",vfbNum:"Numero",vfbIccid:"ICCID",vfbCbOn:"Cambio Offerta",vfbCbCell:"Cellulare CB",vfbCbCodIns:"Cod.Ins. CB",vfbFGnp:"GNP",vfbFGnpBrand:"Op. GNP",vfbFGnpNum:"N. GNP",vfbFCodIns:"Cod.Ins.",vfbFNumProv:"N. Provvisorio",vfbFNumDef:"N. Definitivo",vfbFIccid:"ICCID",vfbFMnp:"MNP",vfbFMnpBrand:"Op. MNP",vfbFMnpNum:"N. MNP",vfbFCombNumProv:"N. Provv. Mobile",vfbFCombIccid:"ICCID Mobile",vfSolDigCodIns:"Cod.Ins.",verisureCodIns:"Cod.Ins.",kfCodIns:"Cod.Ins.",vcCodIns:"Cod.Ins.",fwOffer:"Offerta",fwMnp:"MNP",fwMnpBrand:"Op. MNP",fwMnpNum:"N. MNP",fwCodIns:"Cod.Ins.",fwNumProv:"N. Provvisorio",fwNumDef:"Numero",fwIccid:"ICCID",fwFGnp:"GNP",fwFGnpBrand:"Op. GNP",fwFGnpNum:"N. GNP",fwFCodIns:"Cod.Ins.",fwFNumProv:"N. Provvisorio",fwFNumDef:"N. Definitivo",fwPod:"POD",fwPdr:"PDR",fwEnCodIns:"Cod.Ins.",ilOffer:"Offerta",ilMnp:"MNP",ilDom:"Domiciliata",ilMnpBrand:"Op. MNP",ilMnpNum:"N. MNP",ilCodIns:"Cod.Ins.",ilNumProv:"N. Provvisorio",ilNumDef:"Numero",ilIccid:"ICCID",ilFGnp:"GNP",ilFGnpBrand:"Op. GNP",ilFGnpNum:"N. GNP",ilFCodIns:"Cod.Ins.",ilFNumProv:"N. Provvisorio",ilFNumDef:"N. Definitivo",ilFwaCodIns:"Cod.Ins.",ilFwaIccid:"ICCID",ilBizOffer:"Offerta",ilBizMnp:"MNP",ilBizMnpBrand:"Op. MNP",ilBizDom:"Domiciliazione",ilBizNum:"Numero",ilBizIccid:"ICCID",ilBizNumDef:"N. Definitivo",ilBizCodIns:"Cod.Ins.",enPod:"POD",enPdr:"PDR",enCodIns:"Cod.Ins.",enProv:"Op. Provenienza",fwEnProv:"Op. Provenienza",w3SostCell:"Numero",w3SostIccid:"ICCID",w3SostCodContr:"Cod. Contratto",w3SostCodIns:"Cod.Ins.",fwSostCell:"Numero",fwSostIccid:"ICCID",fwSostCodContr:"Cod. Contratto",fwSostCodIns:"Cod.Ins.",vfSostCell:"Numero",vfSostCodIns:"Cod.Ins.",timOffer:"Offerta",timMnp:"MNP",timMnpBrand:"Op. MNP",timMnpNum:"N. MNP",timTnp:"TNP",timModello:"Terminale",timSpedizione:"Spedizione",timFinanziato:"Finanziato",timCodPratica:"Codice Pratica",timVisionBox:"Box TIM Vision",timVisionTaglia:"TIM Vision",timVisionNumContr:"N. Contratto Vision",timImei:"IMEI",timNumProv:"N. Provvisorio",timNum:"Numero",timIccid:"ICCID",timCodIns:"Cod.Ins.",timFOffer:"Prodotto Fisso",timFGnp:"GNP",timFGnpBrand:"Op. GNP",timFGnpNum:"N. GNP",timFNumProv:"N. Fisso Provvisorio",timFCodIns:"Codice",timFVision:"TIM Vision",timFVisionTaglia:"TIM Vision",timFVisionNumContr:"N. Contratto Vision",timTpTwin:"Twin",timTpSeriale:"Seriale Telepass",timTpRecapito:"Recapito",timTpCodIns:"Cod.Ins.",veryOffer:"Offerta",veryMnp:"MNP",veryMnpBrand:"Op. MNP",veryMnpNum:"N. MNP",veryRicaricaAuto:"Ricarica Auto",veryFascia:"Tipologia offerta",veryCodIns:"Cod.Ins.",veryNumProv:"N. Provvisorio",veryNum:"Numero",veryIccid:"ICCID",hoOffer:"Offerta",hoMnp:"MNP",hoMnpBrand:"Op. MNP",hoMnpNum:"N. MNP",hoRicaricaAuto:"Ricarica Auto",hoFascia:"Tipologia offerta",hoCodIns:"Cod.Ins.",hoNumProv:"N. Provvisorio",hoNum:"Numero",hoIccid:"ICCID",kenaOffer:"Offerta",kenaMnp:"MNP",kenaMnpBrand:"Op. MNP",kenaMnpNum:"N. MNP",kenaRicaricaAuto:"Ricarica Auto",kenaFascia:"Tipologia offerta",kenaCodIns:"Cod.Ins.",kenaNumProv:"N. Provvisorio",kenaNum:"Numero",kenaIccid:"ICCID"};
const DET_SKIP={active:1,fields:1,contract:1,hasContract:1,codiceOverride:1,vfOffers:1,vfContratti:1,vfCompassItems:1,fwFSecLineCount:1};
const DET_SELOBJ={securitySel:"Security",tnpGaReloadSel:"Reload GA",cbTnpReloadSel:"Reload CB",cbAddonSel:"Add-on CB",vfbKaskoSel:"Kasko",addons:"Add-on",vfFAddons:"Add-on"};
const detYN=(v)=>(v===true||v==="Sì")?"Sì":(v===false?null:v);
const extractDetails=(d)=>{
  const out={};
  Object.keys(DET_SELOBJ).forEach(k=>{const o=d[k];if(o&&typeof o==="object"){const ks=Object.keys(o).filter(x=>o[x]);if(ks.length)out[DET_SELOBJ[k]]=ks.join(", ");}});
  const slotSum=(s)=>{let x=s.tipo;if(s.modello)x+=" - "+s.modello+(s.imei?" ("+s.imei+")":"");if(Array.isArray(s.compassItems)){const ci=s.compassItems.filter(it=>it&&it.modello).map(it=>it.modello+(it.imei?" ("+it.imei+")":""));if(ci.length)x+=" - "+ci.join(", ");}return x;};
  if(Array.isArray(d.vfTnpList)&&d.vfTnpList.length){const parts=d.vfTnpList.filter(s=>s&&s.tipo).map(slotSum);if(parts.length)out["TNP Dispositivi"]=parts.join(" | ");}
  if(Array.isArray(d.cbTnpList)&&d.cbTnpList.length){const parts=d.cbTnpList.filter(s=>s&&s.tipo).map(slotSum);if(parts.length)out["TNP CB Dispositivi"]=parts.join(" | ");}
  const joinPairs=(mods,imeis,lbl)=>{if(Array.isArray(mods)){const p=mods.map((m,i)=>m?(m+(imeis&&imeis[i]?" ("+imeis[i]+")":"")):"").filter(Boolean);if(p.length)out[lbl]=p.join(" | ");}};
  // Si salvano SOLO i terminali fino alla quantita' scelta: abbassando la
  // "Q.ta TNP" i terminali in eccesso restavano nell'elenco (nascosti a schermo)
  // e finivano lo stesso nel contratto, facendo comparire il terminale di
  // un'altra vendita.
  const finoA=(n,arr)=>(Array.isArray(arr)&&n>0)?arr.slice(0,n):arr;
  joinPairs(finoA(d.tnpCount,d.tnpModelli),finoA(d.tnpCount,d.tnpImeis),"Terminali TNP");
  joinPairs(finoA(d.cbTnpCount,d.cbTnpModelli),finoA(d.cbTnpCount,d.cbTnpImeis),"Terminali CB");
  if(Array.isArray(d.fwFSecLines)){const sl=d.fwFSecLines.filter(Boolean);if(sl.length)out["2e Linee"]=sl.join(", ");}
  Object.keys(d).forEach(k=>{if(DET_SKIP[k]||DET_SELOBJ[k])return;const v=d[k];if(v===null||v===undefined||v===""||v===false)return;if(typeof v==="object")return;const lbl=DET_LABELS[k]||k;const yv=detYN(v);if(yv!==null&&yv!==undefined&&yv!=="")out[lbl]=yv;});
  // Il codice del box "Dati contratto" (usato da WindTre e da tutti i prodotti
  // senza un campo Cod.Ins. dedicato) sta in codiceOverride, che pero' e' in
  // DET_SKIP: non veniva MAI salvato e il contratto restava senza Codice
  // Inserimento. Lo scriviamo qui, senza sovrascrivere un Cod.Ins. gia' presente.
  const _codIns=String(d.codiceOverride==null?"":d.codiceOverride).trim();
  if(_codIns&&!out["Cod.Ins."])out["Cod.Ins."]=_codIns;
  return out;
};


const VF_SMARTPHONES_GROUPED = [
  {group:"APPLE", items:[
    "APPLE iPhone Air 1TB",
    "APPLE iPhone Air 512GB",
    "APPLE iPhone Air 256GB",
    "APPLE iPhone 17 ProMax 2TB",
    "APPLE iPhone 17 ProMax 1TB",
    "APPLE iPhone 17 ProMax 512GB",
    "APPLE iPhone 17 ProMax 256GB",
    "APPLE iPhone 17 Pro 1TB",
    "APPLE iPhone 17 Pro 512GB",
    "APPLE iPhone 17 Pro 256GB",
    "APPLE iPhone 17 512GB",
    "APPLE iPhone 17 256GB",
    "APPLE iPhone 17E 512GB",
    "APPLE iPhone 17E 256GB",
    "APPLE iPhone 16 Pro Max 512GB",
    "APPLE iPhone 16 Pro Max 256GB",
    "APPLE iPhone 16 Pro 256GB",
    "APPLE iPhone 16 Pro 128GB",
    "APPLE iPhone 16 Plus 256GB",
    "APPLE iPhone 16 Plus 128GB",
    "APPLE iPhone 16 256GB",
    "APPLE iPhone 16 128GB",
    "APPLE iPhone 16E 512GB",
    "APPLE iPhone 16E 256GB",
    "APPLE iPhone 16E 128GB"
  ]},
  {group:"SAMSUNG", items:[
    "SAMSUNG Galaxy S26 Ultra 5G 512GB",
    "SAMSUNG Galaxy S26 Ultra 5G 256GB",
    "SAMSUNG Galaxy S26 Plus 5G 512GB",
    "SAMSUNG Galaxy S26 Plus 5G 256GB",
    "SAMSUNG Galaxy S26 5G 512GB",
    "SAMSUNG Galaxy S26 5G 256GB",
    "SAMSUNG Galaxy S25 Ultra 5G 512GB",
    "SAMSUNG Galaxy S25 Ultra 5G 256GB",
    "SAMSUNG Galaxy S25 Edge 512GB",
    "SAMSUNG Galaxy S25 Edge 256GB",
    "SAMSUNG Galaxy S25 Plus 5G 512GB",
    "SAMSUNG Galaxy S25 Plus 5G 256GB",
    "SAMSUNG Galaxy S25 5G 256GB",
    "SAMSUNG Galaxy S25 5G 128GB",
    "SAMSUNG Galaxy S25 FE 256GB",
    "SAMSUNG Galaxy S25 FE 128GB",
    "SAMSUNG Galaxy ZFold7 512GB",
    "SAMSUNG Galaxy ZFold7 256GB",
    "SAMSUNG Galaxy ZFlip7 512GB",
    "SAMSUNG Galaxy ZFlip7 256GB",
    "SAMSUNG Galaxy ZFlip7 FE 256GB",
    "SAMSUNG Galaxy ZFlip7 FE 128GB",
    "SAMSUNG Galaxy A57 256GB",
    "SAMSUNG Galaxy A57 128GB",
    "SAMSUNG Galaxy A56 256GB",
    "SAMSUNG Galaxy A56 128GB EE",
    "SAMSUNG Galaxy A56 128GB",
    "SAMSUNG Galaxy A37 256GB",
    "SAMSUNG Galaxy A37 128GB",
    "SAMSUNG Galaxy A36 256GB",
    "SAMSUNG Galaxy A36 128GB",
    "SAMSUNG Galaxy A34 Enterprise Ed",
    "SAMSUNG Galaxy A26 256GB",
    "SAMSUNG Galaxy A26 128GB",
    "SAMSUNG Galaxy A17 5G 256GB",
    "SAMSUNG Galaxy A17 5G 128GB",
    "SAMSUNG Galaxy A17 4G",
    "SAMSUNG Galaxy A16 5G",
    "SAMSUNG Galaxy A16 4G"
  ]},
  {group:"MOTOROLA", items:[
    "MOTOROLA Razr 60 Ultra",
    "MOTOROLA Razr 70",
    "MOTOROLA Edge 70 512GB",
    "MOTOROLA Edge 60 Pro",
    "MOTOROLA Edge60 Neo",
    "MOTOROLA Edge 60",
    "MOTOROLA G86 8 256GB",
    "MOTOROLA G85 8 256GB",
    "MOTOROLA G77 + Moto Buds",
    "MOTOROLA G57 5G 256GB",
    "MOTOROLA G37 5G 128GB",
    "MOTOROLA G35 256GB",
    "MOTOROLA G35 128GB",
    "MOTOROLA G17 4G 256GB",
    "MOTOROLA G17 4G 128GB",
    "MOTOROLA G15 128GB",
    "MOTOROLA G06 64GB",
    "MOTOROLA G05 128GB"
  ]},
  {group:"OPPO", items:[
    "OPPO Find X9 Ultra",
    "OPPO Find X9 Pro",
    "OPPO Reno 15 5G",
    "OPPO Reno 15F 5G",
    "OPPO Reno 14 5G",
    "OPPO Reno 14FS 5G",
    "OPPO Reno 13 Pro",
    "OPPO Reno 13 FS",
    "OPPO Reno 13F",
    "OPPO A6 Pro 5G 256GB",
    "OPPO A5 Pro 5G",
    "OPPO A6 5G 256GB",
    "OPPO A6K 4G 256GB",
    "OPPO A6X 5G 128GB",
    "OPPO A60 5G",
    "OPPO A5 5G",
    "OPPO A5M 4G",
    "OPPO A40 256GB",
    "OPPO A40 128GB",
    "OPPO A5X 4G"
  ]},
  {group:"REALME", items:[
    "REALME GT7 5G",
    "REALME 14Pro",
    "REALME 14 5G",
    "REALME 14X",
    "REALME C75 4G",
    "REALME C71",
    "REALME C61 4G 128GB"
  ]},
  {group:"HONOR", items:[
    "HONOR Magic V5",
    "HONOR Magic V3",
    "HONOR Magic 8 Pro",
    "HONOR Magic 7 Pro",
    "HONOR 600 + Watch",
    "HONOR 400 5G",
    "HONOR Magic 8 Lite + Earbuds X7 Lite",
    "HONOR Magic 7 Lite",
    "HONOR 600 Lite + Buds",
    "HONOR 400 Lite",
    "HONOR 200 Smart",
    "HONOR X6B",
    "HONOR X5C Plus 4G"
  ]},
  {group:"ZTE", items:[
    "ZTE Nubia Flip"
  ]},
  {group:"TCL", items:[
    "TCL K70 5G",
    "TCL 50NextPaper 5G",
    "TCL 60R 5G"
  ]},
  {group:"VIVO", items:[
    "VIVO V70 5G 512GB",
    "VIVO V70 FE 5G 256GB",
    "VIVO Y31 5G 256GB"
  ]},
  {group:"ALTRO", items:[
    "APPLE Watch S11 Titanium 46mm",
    "APPLE Watch S11 Titanium 42mm",
    "APPLE Watch S11 Aluminium 46mm",
    "APPLE Watch S11 Aluminium 42mm",
    "APPLE Watch10 46mm",
    "APPLE Watch10 42mm",
    "APPLE AirPods Pro3",
    "APPLE AirPods 4",
    "SAMSUNG Watch7 Ultra",
    "SAMSUNG Watch7",
    "SAMSUNG Buds3",
    "GOOGLE Watch3 45mm",
    "GOOGLE Watch3 41mm",
    "GOOGLE Buds Pro",
    "Altro"
  ]}
];
const VFB_SMARTPHONES_GROUPED = [
  {group:"APPLE", items:[
    "APPLE IPHONE AIR 512GB",
    "APPLE IPHONE AIR 256GB",
    "APPLE IPHONE AIR 1TB",
    "APPLE IPHONE 17E 512GB",
    "APPLE IPHONE 17E 256GB",
    "APPLE IPHONE 17 PROMX 256",
    "APPLE IPHONE 17 PROMAX 512",
    "APPLE IPHONE 17 PROMAX 2TB",
    "APPLE IPHONE 17 PROMAX 1TB",
    "APPLE IPHONE 17 PRO 512GB",
    "APPLE IPHONE 17 PRO 256",
    "APPLE IPHONE 17 PRO 1TB",
    "APPLE IPHONE 17 512GB",
    "APPLE IPHONE 17 256GB",
    "APPLE IPHONE 16E 512GB",
    "APPLE IPHONE 16E 128GB",
    "APPLE IPHONE 16 128GB",
    "APPLE IPHONE 15 256GB"
  ]},
  {group:"SAMSUNG", items:[
    "SAMSUNG XCOVER 7 5G 128GB EE",
    "SAMSUNG GLXY ZFOLD 7 5G 256",
    "SAMSUNG GLXY ZFLIP7 FE 5G 256",
    "SAMSUNG GLXY S26 ULTRA 5G 512",
    "SAMSUNG GLXY S26 ULTRA 5G 256",
    "SAMSUNG GLXY S26 ULTR 5G 256 EE",
    "SAMSUNG GLXY S26 PLUS 5G 512",
    "SAMSUNG GLXY S26 PLUS 5G 256",
    "SAMSUNG GLXY S25 ULTRA 256 EE",
    "SAMSUNG GLXY S25 EDGE 12GB 256",
    "SAMSUNG GALXY S25 ULTRA 5G 256",
    "SAMSUNG GALAXY ZFLIP 7 5G 256",
    "SAMSUNG GALAXY S26 5G 512",
    "SAMSUNG GALAXY S26 5G 256 EE",
    "SAMSUNG GALAXY S26 5G 256",
    "SAMSUNG GALAXY S25 FE 128 EE",
    "SAMSUNG GALAXY A57 5G 128 EE",
    "SAMSUNG GALAXY A37 5G 128 EE",
    "SAMSUNG GALAXY A34 5G 256GB EE",
    "SAMSUNG GALAXY A26 5G 128GB",
    "SAMSUNG GALAXY A17 5G 128GB",
    "SAMSUNG GALAXY A16 4G 128GB",
    "SAMSUNG A17 LTE 4G 256GB",
    "SAMSUNG A17 5G 256GB"
  ]},
  {group:"MOTOROLA", items:[
    "MOTOROLA THINKPHONE 5G 8GB 256",
    "MOTOROLA RAZR 60 ULTRA 16 512",
    "MOTOROLA G57 5G 8GB 256GB",
    "MOTOROLA G37 5G 4GB 128",
    "MOTOROLA G06 4G 4GB 128GB",
    "MOTOROLA EDGE 70 5G 12GB 512GB",
    "MOTOROLA EDGE 60 NEO 5G 12 256"
  ]},
  {group:"HONOR", items:[
    "HONOR MAGIC V5 5G 16GB 512GB"
  ]},
  {group:"ALTRO", items:[
    "ADBB CLASSIC 2016 S",
    "ADBB CLASSIC 2G S 2018 VRU",
    "ADOC D15 DESKPHONE",
    "ADOC K4 SUPERCORDLESS",
    "APPLE IPAD 2025 11 128GB",
    "APPLE IPAD 2025 11 256GB",
    "APPLE IPAD AIR 2025 11 128",
    "APPLE IPAD AIR 2025 13 128",
    "APPLE IPAD AIR 2026 11 128",
    "APPLE IPAD AIR 2026 13 128",
    "APPLE IPADPRO M5 11INC 256",
    "APPLE IPADPRO M5 11INC 512",
    "APPLE IPADPRO M5 13INC 256",
    "APPLE IPADPRO M5 13INC 512",
    "CISCO CP 6851 + KEYBOARD 6800 IND",
    "CISCO CP 6851 IND",
    "CISCO CP 7841 IND",
    "CISCO CP 8851",
    "CISCO CP 8851 + 2 BEKEM CP 8800A KEM",
    "COCOMM DT200 SUPERCORDLESS",
    "COCOMM F740 DESKPHONE",
    "ESPRINET SUM AIR",
    "GIGASET CORNETTA R700 H PRO",
    "GIGASET CORNETTA S700 H PRO",
    "GIGASET CORNETTA SL800 H PRO",
    "GIGASET R700H PRO BASETTA N610",
    "GIGASET S700H PRO BASETTA N610",
    "GIGASET SL800 H PRO BASETTA N610",
    "HUAWEI CPE B311 221",
    "HUAWEI CPE B530 CAT7 4G",
    "HUAWEI CPE MIFI 5G",
    "SAMSUNG GALAXY BOOK 5 5G 512GB",
    "SAMSUNG GALAXY TAB S11 128 EE",
    "SAMSUNG GALAXY TAB S9 5G 128GB",
    "SAMSUNG GALAXY WATCH 4 40MM",
    "SAMSUNG GLXY TABS10 LTE 5 128 EE GRY",
    "SAMSUNG TAB A11 PLUS 5G 128",
    "SAMSUNG TAB ACTIVE 5 5G 128 EE",
    "SAMSUNG TAB S10 FE 5G 12EE",
    "SAMSUNG TAB S10 FE PLUS 5G 128",
    "SAMSUNG TABACTIVE 5 PRO 128 EE",
    "SAMSUNG THE FREESTYLE",
    "TCT KEYBOARD EM20",
    "TCT M5",
    "TCT M5 E KEYBOARD EM20",
    "TCT M5 E TENDA DOUNGLE U3",
    "TCT M7",
    "YEALINK W73H",
    "YEALINK W73P",
    "YEALINK W74H",
    "YEALINK W74P",
    "ZTE MF920C",
    "ZTE MIFI U50 5G",
    "ZTE VIK K5161 4G",
    "Altro"
  ]}
];
const WT_SMARTPHONES_GROUPED = [
  {group:"XIAOMI", items:[
    "XIAOMI 17T Pro 12+512 GB + Redmi Pad 2",
    "XIAOMI 17T 12+256 GB + Redmi Pad 2",
    "XIAOMI 17T Pro 12+512 GB",
    "XIAOMI 17T 12+256 GB",
    "XIAOMI 17 Ultra",
    "XIAOMI 17 Ultra 5G 512GB + Photo Kit",
    "XIAOMI Redmi Note 15 5G 8+256",
    "XIAOMI Redmi Note 15 Pro 5G 8+256",
    "XIAOMI Redmi Note 15 Pro+ 5G 8+256",
    "XIAOMI Redmi 15C 5G 4+128GB",
    "XIAOMI Redmi 15 5G 8+256GB"
  ]},
  {group:"ZTE", items:[
    "ZTE Blade A36 4+64 GB",
    "ZTE nubia Air 5G 8+512 GB",
    "ZTE Blade A76 5G (4+128)",
    "ZTE nubia Flip 2",
    "ZTE nubia Focus 2 5G",
    "ZTE Blade A35e (2+64)"
  ]},
  {group:"HONOR", items:[
    "HONOR 600 8+256GB 5G Bundle Watch",
    "HONOR 600 Lite 8+256GB 5G Bundle Buds",
    "HONOR Magic 8 Lite",
    "HONOR Magic 8 Pro",
    "HONOR 400 Lite",
    "HONOR 400 Smart",
    "HONOR 200 Lite 5G"
  ]},
  {group:"MOTOROLA", items:[
    "MOTOROLA Edge 70 Fusion 8+512GB Bundle Watch",
    "MOTOROLA Razr 70 Plus 12+512GB 5G",
    "MOTOROLA Razr Fold 16+512GB 5G",
    "MOTOROLA Signature 16+512GB 5G",
    "MOTOROLA Moto G57 5G 8+256GB",
    "MOTOROLA Edge 70",
    "MOTOROLA Moto G86 5G 8GB+256GB",
    "MOTOROLA Moto G35 5G 4+128GB"
  ]},
  {group:"OPPO", items:[
    "OPPO A6 5G, 6+256",
    "OPPO A6X 5G, 4+128",
    "OPPO Reno15 5G, 8+512",
    "OPPO Reno15 F 5G, 8+256"
  ]},
  {group:"SAMSUNG", items:[
    "SAMSUNG Galaxy A37 5G 256GB",
    "SAMSUNG Galaxy A37 5G 128GB",
    "SAMSUNG Galaxy A57 5G 256GB",
    "SAMSUNG Galaxy S26 256GB",
    "SAMSUNG Galaxy S26 512GB",
    "SAMSUNG Galaxy S26+ 256GB",
    "SAMSUNG Galaxy S26+ 512GB",
    "SAMSUNG Galaxy S26 Ultra 256GB",
    "SAMSUNG Galaxy S26 Ultra 512GB",
    "SAMSUNG Galaxy S26 Ultra 1TB",
    "SAMSUNG Galaxy A17 4G 128GB",
    "SAMSUNG Galaxy A17 5G 128GB",
    "SAMSUNG Galaxy A17 4G 256GB",
    "SAMSUNG Galaxy S25 FE 256GB",
    "SAMSUNG Galaxy Z Fold7 256GB",
    "SAMSUNG Galaxy Z Fold7 512GB",
    "SAMSUNG Galaxy Z Fold7 1TB",
    "SAMSUNG Galaxy Z Flip7 256GB",
    "SAMSUNG Galaxy Z Flip7 512GB",
    "SAMSUNG Galaxy A56 5G 256GB",
    "SAMSUNG Galaxy A36 5G 128GB",
    "SAMSUNG Galaxy A26 5G 128GB",
    "SAMSUNG Galaxy Z Flip6 256GB"
  ]},
  {group:"APPLE", items:[
    "APPLE iPhone 17e 256GB",
    "APPLE iPhone 17 256GB",
    "APPLE iPhone 17 512GB",
    "APPLE iPhone Air 256GB",
    "APPLE iPhone Air 1TB",
    "APPLE iPhone 17 Pro 256GB",
    "APPLE iPhone 17 Pro 512GB",
    "APPLE iPhone 17 Pro Max 256GB",
    "APPLE iPhone 17 Pro Max 512GB",
    "APPLE iPhone 17 Pro Max 2TB",
    "APPLE iPhone 16e 128GB",
    "APPLE iPhone 16 128GB"
  ]},
  {group:"VIVO", items:[
    "VIVO V70 5G",
    "VIVO V70 5G FE",
    "VIVO Y21 5G",
    "VIVO X300"
  ]},
  {group:"TCL", items:[
    "TCL K70 5G",
    "TCL NXTPAPER 70 PRO 8+256GB",
    "TCL NXTPAPER 60 Ultra",
    "TCL 501 2+64GB"
  ]},
  {group:"REALME", items:[
    "REALME Note 50"
  ]},
  {group:"ALTRO", items:[
    "APPLE AirTag (2nd generation)",
    "RAY-BAN META Gen2 Wayfarer Sun Polar_ Matte Black",
    "RAY-BAN META Gen2 Wayfarer Transitions_Shiny Black",
    "RAY-BAN META Gen2 Wayfarer Transitions_Matte Black",
    "RAY-BAN META Gen2 Wayfarer Sun Plano_Shiny Black",
    "SAMSUNG Galaxy Buds4",
    "MOTOROLA moto tag 2",
    "ZYXEL FWA indoor 5G Zyxel NR5309",
    "TP-LINK FWA indoor 5G TP-LINK NX620v",
    "GREENPACKET FWA H5 + TH-40M",
    "TP-LINK CAM TC72",
    "EZVIZ CAM TY1 3M",
    "SAMSUNG Galaxy Buds3 FE",
    "OAKLEY META Vanguard (Matte Black)",
    "SAMSUNG Galaxy Tab S11 5G (12GB / 128GB)",
    "SAMSUNG Galaxy Tab S10 Lite 5G (6GB / 128GB)",
    "APPLE Air Pods Pro 3",
    "APPLE Watch Series 11 46mm",
    "ZTE WebPocket. 4G+ (ZTE U20)",
    "RAY-BAN META Wayfarer (Shiny Black/Green)",
    "RAY-BAN META Wayfarer (Matte Black/Grey)",
    "RAY-BAN META Wayfarer Large (Matte Black/Grey)",
    "SAMSUNG Galaxy Watch8 Classic 46mm BT",
    "APPLE iPad 11 128GB",
    "APPLE AirTag",
    "APPLE iPad 11 256GB",
    "TELSEY W52 5G",
    "TCL Onetouch 5041",
    "TCL Internet Key TCL IK41",
    "SAMSUNG Galaxy Watch7 44mm BT",
    "SAMSUNG Galaxy Buds3",
    "APPLE Watch 10 46mm",
    "APPLE AirPods 4",
    "APPLE AirPods 4 con cancellazione attiva del rumore",
    "TCL Onetouch 5023 + ECO SIM",
    "TCL WebPocket. 4G+ (TCL)",
    "ALCATEL Internet Key Alcatel IK41",
    "EZVIZ Lampadina Ezviz LB1",
    "EZVIZ C6N",
    "Altro"
  ]}
];
// Le tendine del terminale non hanno piu' liste cablate (Luca 02/08): i
// modelli arrivano dal listino ufficiale del brand, qui resta solo la via di
// fuga "Altro" per i prodotti che il listino non copre.
const SOLO_ALTRO = ["Altro"];
const SMARTPHONES = WT_SMARTPHONES_GROUPED;

// MEGA LISTINO (Luca 02/08): oltre al listino commerciale dell'operatore,
// i campi "Modello Terminale" cercano nel catalogo dispositivi universale
// (mig. 133, ~39k smartphone) — i risultati compaiono nel gruppo
// "Catalogo dispositivi" della stessa tendina.
// LISTINI TERMINALI (mig. 135/136): prezzi, margini e piani rate importati
// dai listini ufficiali degli operatori in Documentazione. Si caricano UNA
// volta (poche centinaia di righe) e si indicizzano con una CHIAVE RIGOROSA:
// due nomi coincidono solo se, ripuliti, hanno gli STESSI token — numero di
// modello e taglio compresi. Un abbinamento "somigliante" aggancerebbe
// l'iPhone 16 Pro Max al prezzo del 17 Pro Max: meglio NESSUN prezzo che uno
// sbagliato, perche' da qui esce il margine.
let _listiniTutti = null, _listiniAttesa = null;
const chiaveListino = (s) => String(s || "").toUpperCase()
  .replace(/\(.*?\)/g, " ")
  .replace(/PRO\s*MAX/g, "PROMAX")
  .replace(/[^A-Z0-9]+/g, " ")
  .replace(/\b(\d+)\s+(GB|TB|G)\b/g, "$1$2")
  .replace(/\b(\d+)(GB|G)\b/g, "$1")
  .replace(/\b(\d+)TB\b/g, (_m, x) => String(Number(x) * 1024))
  .split(" ")
  .filter(x => x && !["5G", "4G", "GB", "TB", "DUAL", "SIM", "IT", "EU", "NEW"].includes(x))
  .sort().join(" ");
const caricaListini = () => {
  if (_listiniTutti) return Promise.resolve(_listiniTutti);
  if (!_listiniAttesa) _listiniAttesa = supabase.from("listini_terminali")
    .select("brand,modello,prezzo,rate,margine_pct,lista").limit(3000)
    .then(({ data }) => { _listiniTutti = data || []; return _listiniTutti; })
    .catch(() => { _listiniTutti = []; return _listiniTutti; });
  return _listiniAttesa;
};
// ── VALORI CONTO ECONOMICO (cantiere 07/08): coefficiente bundle Vodafone
//    (ce_parametri 'bundle_coeff_default', frazione es. 0.60) + tariffe Kipoint
//    (catalog_valori per offerta/dimensione). Cache di modulo come i listini.
let _ceBundleCoeff = null, _ceTariffe = null, _ceValoriAttesa = null;
const caricaCeValori = () => {
  if (_ceValoriAttesa) return _ceValoriAttesa;
  _ceValoriAttesa = Promise.all([
    supabase.from("ce_parametri").select("valore_num").eq("chiave", "bundle_coeff_default").is("month", null),
    supabase.from("catalog_valori").select("prezzo, margine_tipo, margine_valore, opzione:catalog_opzioni(nome, offerta:catalog_offerte(nome)), offerta_diretta:catalog_offerte(nome)").eq("attivo", true),
  ]).then(([p, v]) => {
    _ceBundleCoeff = Number(p.data?.[0]?.valore_num ?? 0.60);
    _ceTariffe = v.data || [];
    return true;
  }).catch(() => { _ceBundleCoeff = 0.60; _ceTariffe = []; return true; });
  return _ceValoriAttesa;
};
const _tariffaKipoint = (offertaNome, dimNome) => {
  if (!_ceTariffe) return null;
  const nrm = (s) => String(s || "").trim().toLowerCase();
  if (dimNome) {
    const r = _ceTariffe.find(t => t.opzione && nrm(t.opzione.nome) === nrm(dimNome) && nrm(t.opzione.offerta?.nome) === nrm(offertaNome));
    if (r) return r;
  }
  return _ceTariffe.find(t => t.offerta_diretta && nrm(t.offerta_diretta.nome) === nrm(offertaNome)) || null;
};
// MOD-15: tariffa di UNA OPZIONE kipoint (servizio/assicurazione/supplemento).
// SOLO match per opzione — niente fallback sull'offerta come _tariffaKipoint,
// altrimenti un'opzione senza listino erediterebbe il prezzo della fascia.
const _tariffaKipointOpz = (offertaNome, opzNome) => {
  if (!_ceTariffe) return null;
  const nrm = (s) => String(s || "").trim().toLowerCase();
  return _ceTariffe.find(t => t.opzione && nrm(t.opzione.nome) === nrm(opzNome) && nrm(t.opzione.offerta?.nome) === nrm(offertaNome)) || null;
};
// MOD-15: range di peso codificato nel NOME offerta ("TBASE 0-2 kg" → {0,2}).
// Data-driven: le fasce arrivano dal catalogo, niente soglie cablate.
const _fasciaKg = (nome) => {
  const m = String(nome || "").match(/(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*kg/i);
  return m ? { min: parseFloat(m[1].replace(",", ".")), max: parseFloat(m[2].replace(",", ".")) } : null;
};
const listinoPerModello = async (modello) => {
  const k = chiaveListino(modello);
  if (!k || String(modello || "").toUpperCase().startsWith("ALTRO")) return [];
  const tutti = await caricaListini();
  // dentro una vendita di brand si mostra SOLO il suo listino (per Fastweb: Vodafone)
  const b = _brandListino(_brandVendita);
  return tutti.filter(r => chiaveListino(r.modello) === k && (!b || _compBrand(r.brand) === b)).slice(0, 3);
};
// Brand della vendita in corso: le tendine del terminale devono proporre SOLO
// il listino ufficiale di QUEL brand (Luca 02/08). Il form di vendita e' uno
// solo per volta, quindi basta un riferimento di modulo aggiornato dal render.
let _brandVendita = null;
// RV-03: tipo cliente della vendita in corso ("privato"/"business"), settato al
// render come _brandVendita — serve a _senzaMargine per il telefono a rate business
let _tipoVendita = null;
let _numeriMobiliVendita = [];
const _compBrand = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// FASTWEB usa il listino VODAFONE in vigore (Luca 03/08): stesso street
// price, ma SENZA marginalita' sul prodotto — il margine non si mostra.
const _brandListino = (b) => { const x = _compBrand(b); return x === "FASTWEB" ? "VODAFONE" : x; };
// RV-03: il telefono a rate BUSINESS ha marginalita' solo su WindTre — per
// Vodafone business street price visibile ma margine nascosto (come Fastweb).
const _senzaMargine = () => _compBrand(_brandVendita) === "FASTWEB" || (_compBrand(_brandVendita) === "VODAFONE" && String(_tipoVendita || "").toLowerCase() === "business");
const cercaListino = async (term) => {
  const tutti = await caricaListini();
  const b = _brandListino(_brandVendita);
  const delBrand = b ? tutti.filter(r => _compBrand(r.brand) === b) : [];
  const t = String(term || "").trim().toLowerCase();
  if (!t) return delBrand.slice(0, 300).map(r => r.modello);
  const paro = t.split(/\s+/).filter(Boolean);
  return delBrand.filter(r => { const m = String(r.modello).toLowerCase(); return paro.every(w => m.includes(w)); })
    .slice(0, 60).map(r => r.modello);
};

/** Tendine del TERMINALE (telefoni a rate/finanziamenti, dentro i brand):
 *  SOLO il listino ufficiale del brand in vendita — da li' escono prezzo,
 *  margine e rate. Niente cataloghi generici: un modello fuori listino non ha
 *  prezzo e falserebbe la marginalita'. Se il listino non copre un prodotto
 *  resta la voce "Altro", che chiude la vendita SENZA importo ne' margine. */
const cercaTerminali = async (term) => {
  const tutti = await caricaListini();
  const bb = _brandListino(_brandVendita);
  const delBrand = bb ? tutti.filter(r => _compBrand(r.brand) === bb) : [];
  const t = String(term || "").trim().toLowerCase();
  const paro = t.split(/\s+/).filter(Boolean);
  const match = (r) => !t || paro.every(w => String(r.modello).toLowerCase().includes(w));
  // DUE LISTE (Luca 05/08): ordinabili in testa, poi il magazzino W3 (telefoni
  // non più ordinabili ma rateizzabili se ancora a stock) in un gruppo suo
  const ordinabili = delBrand.filter(r => (r.lista || "ordinabili") !== "magazzino" && match(r)).slice(0, t ? 60 : 300).map(r => r.modello);
  const magazzino = delBrand.filter(r => r.lista === "magazzino" && match(r)).slice(0, t ? 60 : 300).map(r => r.modello);
  if (!ordinabili.length && !magazzino.length) return [];
  const b = delBrand[0];
  const suff = _senzaMargine() ? (_compBrand(_brandVendita) === "FASTWEB" ? " (per Fastweb, senza margine)" : " (senza margine)") : "";
  const out = [];
  if (ordinabili.length) out.push({ gruppo: "💰 Listino " + (b ? b.brand : "ufficiale") + suff, voci: ordinabili });
  if (magazzino.length) out.push({ gruppo: "🏬 Magazzino — non ordinabili, a rate" + suff, voci: magazzino });
  return out;
};

const cercaModelliCatalogo = async (term) => {
  try {
    const t = (term || "").trim().replace(/[,()%]/g, " ").replace(/\s+/g, " ");
    if (t.length < 2) return [];
    const { data } = await supabase.from("dispositivi_catalogo")
      .select("brand,modello").eq("categoria", "smartphone").eq("attivo", true)
      .or(`modello.ilike.%${t}%,brand.ilike.%${t}%`)
      .order("brand").limit(40);
    return (data || []).map(r => `${r.brand} ${r.modello}`);
  } catch { return []; }
};

const getW3 = (tc) => {
  const biz = tc === "business";
  return [
    { id:"mobile", title:"MOBILE", icon:"📱", color:"var(--tf-2e75b6)", radio:true, subs:[
      { id:"ga", title:"MOBILE", hasContract:true, ct:"ga",
        isMobile: !biz,
        isMobileBiz: biz,
        bizOffers: biz ? ["FWA Indoor PIVA","Professional Full","Professional Staff","Professional Special","Professional Flexy/Sim Dati","Professional World"] : null,
        mobOffers: biz ? null : {
          "Underground_Sì": ["EP LOCAL 4,99","EP LOCAL 5,99","EP LOCAL 6,99","EP LOCAL 7,99","EP LOCAL 8,99","EP LOCAL 9,99","EP LOCAL 10,99"],
          "Underground_No": ["RIC LOCAL 4,99","RIC LOCAL 5,99","RIC LOCAL 6,99","RIC LOCAL 7,99","RIC LOCAL 8,99","RIC LOCAL 9,99","RIC LOCAL 10,99"],
          "Mass Market_Sì": ["SPECIAL 5G","START UNLIMITED 5G","UNLIMITED 5G","UNLIMITED PRO 5G","UNLIMITED 5G SUPER FIBRA","FAMILY UNLIMITED 200","FAMILY 7,99","MULTISERVICE","SUPER 5G UNDER 14 6.99","SUPER 5G UNDER 14 9.99","CYC UNLIMITED PLUS","CYC UNLIMITED SUPER","CYC UNLIMITED ULTRA","CYC UNLIMITED FULL","CYC UNLIMITED MARTISOR","CYC UNLIMITED RAMADAM","FAMILY CYC 7,99","PACK 5G RELOAD EXCHANGE","GIGA SPECIAL","FWA INDOOR"],
          "Mass Market_No": ["SPECIAL 5G","START UNLIMITED 5G","UNLIMITED 5G","UNLIMITED PRO 5G","UNLIMITED 5G SUPER FIBRA","FAMILY UNLIMITED 200","FAMILY 7,99","MULTISERVICE","SUPER 5G UNDER 14 6.99","SUPER 5G UNDER 14 9.99","CYC UNLIMITED PLUS","CYC UNLIMITED SUPER","CYC UNLIMITED ULTRA","CYC UNLIMITED FULL","CYC UNLIMITED MARTISOR","CYC UNLIMITED RAMADAM","FAMILY CYC 7,99","PACK 5G RELOAD EXCHANGE","GIGA 150 5G","GIGA 250 5G","GIGA UNLIMITED 5G","GIGA START&STOP","SMART SECURITY"],
        },
        fields: [{key:"offerta",label:"Offerta Mobile",values:[]}]
      },
      ...(biz?[]:[{ id:"cb", title:"CB", isCB:true,
          cbTnpVals:["Rata 0","Finanziamento 0","Rata >0","Finanziamento > 0"],
          cbCambioVals:["Caring","CL0","CL1","CL1 EP","CL2","CL2 EP","CL3","CL3 EP","Migrazione FTTH"],
          cbAddonVals:["Add-on","Security Ric","Security EP","Security Pro Ric","Security Pro EP","Home Protect Fisso","Netflix Fisso"],
          fields:[]}]
      ),
      ...(biz?[{ id:"cb", title:"CB", isCB:true, isCBBiz:true,
          cbTnpVals:["Rata 0","Rata >0"],
          cbCambioVals:["CL1 EP"],
          cbAddonVals:["Security"],
          fields:[]}]:[]),
      { id:"sost_sim", title:"Sostituzione Sim", isW3SostSim:true, hasContract:true, ct:"multi", fields:[]},
    ]},
    { id:"fisso", title:"FISSO", icon:"🏠", color:"var(--tf-28a745)", radio:true, subs:[
      { id:"fisso_std", title:"FISSO", hasContract:true, ct:"fisso", isFisso:true, hasGnpQ:true, has2LQ:biz, hasAddons:true, addonList:biz?["Più Sicuri Ufficio","FTTH","DNS DINAMICO","FritzBox"]:["Netflix","Home Protect","FTTH","Chiamate Illimitate","CYC HOME"], fields:[]},
      { id:"fisso_cb", title:"FISSO CB", hasContract:true, ct:"fisso", isFisso:true, hasGnpQ:true, has2LQ:biz, hasVoceCasaQ:!biz, hasAddons:true, addonList:biz?["Più Sicuri Ufficio","FTTH","DNS DINAMICO","FritzBox"]:["Netflix","Home Protect","FTTH","Chiamate Illimitate","CYC HOME"], fields:[]},
      { id:"fwa_indoor", title:"FWA INDOOR 2P", hasContract:true, ct:"fisso", isFisso:true, hasGnpQ:true, has2LQ:biz, hasAddons:true, hasFwaImei:true, domLocked:true, addonList:biz?["Più Sicuri Ufficio","FTTH","DNS DINAMICO","FritzBox"]:["Netflix","Home Protect","FTTH","Chiamate Illimitate","CYC HOME"], fields:[]},
      { id:"fwa_outdoor", title:"FWA OUTDOOR", hasContract:true, ct:"fisso", isFisso:true, hasGnpQ:true, has2LQ:biz, hasAddons:true, domLocked:true, addonList:biz?["Più Sicuri Ufficio","FTTH","DNS DINAMICO","FritzBox"]:["Netflix","Home Protect","FTTH","Chiamate Illimitate","CYC HOME"], fields:[]},
      ...(!biz?[{ id:"voce_casa", title:"VOCE CASA", hasContract:true, ct:"fisso", isFisso:true, isVoceCasa:true, hasGnpQ:true, has2LQ:false, fields:[]}]:[]),
    ]},
    { id:"luce_gas", title:"LUCE E GAS", icon:"💡", color:"var(--tf-fd7e14)", radio:true, subs:[
      { id:"luce", title:"Luce", hasContract:true, ct:"lg", hasDom:true, hasConvLG:true, fields:[]},
      { id:"gas", title:"Gas", hasContract:true, ct:"lg", hasDom:true, hasConvLG:true, fields:[]},
    ]},
    { id:"multi", title:"MULTI-SERVIZI", icon:"🛡️", color:"var(--tf-6f42c1)", radio:true, subs:[
      ...(!biz?[{id:"assicurazioni",title:"Assicurazioni",hasAddons:true,hasContract:true,ct:"multi",addonList:["Casa Start","Casa Plus","Casa Full","Sport","Micio e Fido","Viaggi","Sport Famiglia","Elettrodomestici"],fields:[]}]:[]),
      ...(biz?[{id:"assicurazioni",title:"Assicurazioni",isAssicBiz:true,hasContract:true,ct:"multi",fields:[]}]:[]),
      { id:"protecta", title:"Protecta", isProtecta:true, isBizProtecta:biz, hasContract:true, ct:"multi", fields:[]},
    ]},
  ];
};

const getVF = (tc) => {
  const biz = tc === "business";
  return [
    { id:"mobile", title:"MOBILE", icon:"📱", color:"var(--tf-e60000)", radio:true, subs:[
      { id:"ga", title:biz?"MOBILE":"MOBILE GA", hasContract:true, ct:"ga",
        isVFMobile: !biz,
        isVFBizMobile: biz,
        vfBizOffers: biz ? ["MOBILE SMART","MOBILE COMFORT","MOBILE EXTRA","DATI SMART","DATI COMFORT","RED DATA NOW"] : null,
        vfBizOffersTablet: biz ? ["DATI SMART","DATI COMFORT","RED DATA NOW"] : null,
        vfOffers: !biz ? ["MOBILE START","MOBILE PRO","MOBILE POWER","MOBILE ULTRA","MOBILE START UNDER 18","C'ALL POWER EDITION","C'ALL MAX","C'ALL POWER PRO","DOLCE VITA","DOLCE VITA+","DATI","SMART HOME"] : null,
        fields: []
      },
      ...(!biz?[{ id:"cb", title:"CB", isCBVF:true, fields:[]}]:[]),
      ...(biz?[{ id:"cb", title:"CB", isCBVFBiz:true, fields:[]}]:[]),
      { id:"sost_sim", title:"Sostituzione Sim", isVFSostSim:true, hasContract:true, ct:"multi", fields:[]},
    ]},
    { id:"fisso", title:"FISSO", icon:"🏠", color:"var(--tf-28a745)", radio:true, subs:[
      ...(!biz?[
        { id:"casa_fwa", title:"CASA FWA", hasContract:true, ct:"fisso", isVFFisso:true, fields:[]},
        { id:"casa_fwa_pro", title:"CASA FWA PRO", hasContract:true, ct:"fisso", isVFFisso:true, fields:[]},
        { id:"casa_start", title:"CASA START", hasContract:true, ct:"fisso", isVFFisso:true, fields:[]},
        { id:"casa_pro", title:"CASA PRO", hasContract:true, ct:"fisso", isVFFisso:true, fields:[]},
        { id:"casa_ultra", title:"CASA ULTRA", hasContract:true, ct:"fisso", isVFFisso:true, fields:[]},
      ]:[]),
      ...(biz?[
        { id:"fissa_smart", title:"FISSA SMART", hasContract:true, ct:"fisso", isVFFissoBiz:true, fields:[]},
        { id:"fissa_comfort", title:"FISSA COMFORT", hasContract:true, ct:"fisso", isVFFissoBiz:true, fields:[]},
        { id:"fissa_extra", title:"FISSA EXTRA", hasContract:true, ct:"fisso", isVFFissoBiz:true, fields:[]},
        { id:"fissa_wireless_5g", title:"FISSA WIRELESS 5G", hasContract:true, ct:"fisso", isVFFissoBiz:true, fields:[]},
        { id:"onpi_tw_plus", title:"ONPI TW PLUS", hasContract:true, ct:"fisso", isVFFissoBiz:true, fields:[]},
        { id:"onpi_premium", title:"ONPI PREMIUM", hasContract:true, ct:"fisso", isVFFissoBiz:true, fields:[]},
        { id:"one_biz_smart", title:"ONE BUSINESS SMART", hasContract:true, ct:"fisso", isVFFissoBiz:true, fields:[]},
        { id:"one_biz_comfort", title:"ONE BUSINESS COMFORT", hasContract:true, ct:"fisso", isVFFissoBiz:true, fields:[]},
        { id:"fissa_wireless_5g_mob", title:"FISSA WIRELESS 5G + MOBILE COMFORT", hasContract:true, ct:"fisso", isVFFissoBiz:true, isCombinatoFissoBiz:true, fields:[]},
      ]:[]),
    ]},
    ...(biz?[{ id:"sol_dig", title:"SOLUZIONI DIGITALI", icon:"💼", color:"var(--tf-6f42c1)", radio:false, subs:[
      { id:"backup_facile", title:"BACKUP FACILE", isVFSolDig:true, hasContract:true, ct:"multi", fields:[]},
      { id:"worry_free", title:"WORRY FREE ADVANCED", isVFSolDig:true, hasContract:true, ct:"multi", fields:[]},
      { id:"secure_drive", title:"SECURE DRIVE", isVFSolDig:true, hasContract:true, ct:"multi", fields:[]},
      { id:"fastweb_ai_ess", title:"FASTWEB AI WORK ESSENTIAL", isVFSolDig:true, hasContract:true, ct:"multi", fields:[]},
      { id:"fastweb_ai_std", title:"FASTWEB AI WORK STANDARD", isVFSolDig:true, hasContract:true, ct:"multi", fields:[]},
    ]}]:[]),
    { id:"multi", title:"MULTI-SERVIZI", icon:"🛡️", color:"var(--tf-6f42c1)", radio:true, subs:[
      { id:"verisure", title:"Verisure", isVerisure:true, hasContract:true, ct:"multi", fields:[]},
      { id:"kasko_facile", title:"Kasko Facile", isKaskoFacile:true, hasContract:true, ct:"multi", fields:[]},
      { id:"vf_care", title:"Vodafone Care", isVFCare:true, hasContract:true, ct:"multi", fields:[]},
    ]},
  ];
};


// ── Small components (no return keyword needed with arrow implicit) ──────

const YN = ({val,onCh,label}) => (
  <div style={{marginTop:8,padding:10,background:"var(--tf-w30)",borderRadius:8,border:"1px solid var(--tf-w100)"}}>
    <div style={{fontSize:12,fontWeight:700,color:"var(--tf-f8fafc)",marginBottom:6}}>{label}</div>
    <div style={{display:"flex",gap:8}}>
      <button onClick={()=>onCh(true)} style={{padding:"6px 20px",borderRadius:6,border:val===true?"2px solid #28a745":"2px solid var(--tf-w100)",background:val===true?"rgba(40,167,69,0.12)":"var(--tf-w40)",color:val===true?"var(--tf-28a745)":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>Sì</button>
      <button onClick={()=>onCh(false)} style={{padding:"6px 20px",borderRadius:6,border:val===false?"2px solid #dc3545":"2px solid var(--tf-w100)",background:val===false?"rgba(220,53,69,0.12)":"var(--tf-w40)",color:val===false?"var(--tf-f87171)":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>No</button>
    </div>
  </div>
);

const TF = ({l,r,v,o,p,pf,dis,nt,err}) => {
  const _rep=useContext(ReqCtx),_sk=useContext(SubKeyCtx),_fid=useRef(0),_last=useRef(null);if(_fid.current===0)_fid.current=++_FUID;
  const _emptyNow=!!r&&_isEmptyVal(v);
  useEffect(()=>{if(!(_rep&&_sk&&r))return;if(_last.current!==_emptyNow){_last.current=_emptyNow;_rep.report(_sk,_fid.current,_emptyNow);}},[_rep,_sk,r,_emptyNow]);
  useEffect(()=>{return ()=>{if(_rep&&_sk)_rep.report(_sk,_fid.current,undefined);};},[_rep,_sk]);
  const L=(l||"").toLowerCase();
  const isIccid=L.includes("iccid");
  const isImei=L.includes("imei");
  const isIban=L.includes("iban");   // segnalazione 88: IBAN IT = 27 alfanumerici
  const isPod=L==="pod";
  const isPdr=L==="pdr";
  const isNum=!isIccid&&!isImei&&!isPod&&!isPdr&&(L.includes("provvisorio")||L.includes("portabil")||L.includes("definitivo")||L.includes("cellulare")||L.includes("telefono")||L.includes("fisso")||L==="numero"||L==="numero portabilità");
  const isFixedNum=isNum&&(L.includes("fiss")||L.includes("gnp"));
  const numMin=isFixedNum?7:9, numMax=isFixedNum?11:10;
  const onCh=(raw)=>{if(!o)return;let val=raw;if(isIccid)val=raw.replace(/\D/g,"").slice(0,19);else if(isImei)val=raw.replace(/\D/g,"").slice(0,15);else if(isIban)val=raw.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,27);else if(isPod)val=raw.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,15);else if(isPdr)val=raw.replace(/\D/g,"").slice(0,14);else if(isNum)val=raw.replace(/\D/g,"").slice(0,numMax);o(val);};
  const paresIban=/^IT\d{2}[A-Z0-9]{18,}$/i.test(String(v||"").replace(/\s/g,""));
  let vErr="";
  if(err)vErr=err;
  else if(paresIban&&(L.includes("cod")||isImei))vErr="Sembra un IBAN: qui va il codice, non l'IBAN";
  else if(isIccid&&v&&v.length!==19)vErr="ICCID: 19 cifre richieste";
  else if(isImei&&v&&v.length!==15)vErr="IMEI: 15 cifre richieste";
  else if(isIban&&v&&erroreIbanIT(v))vErr=erroreIbanIT(v)||"";
  else if(isPod&&v&&!(v.length>=14&&v.length<=15&&/^IT/.test(v)))vErr="POD: IT + 14-15 caratteri";
  else if(isPdr&&v&&v.length!==14)vErr="PDR: 14 cifre richieste";
  else if(isNum&&v&&v.length<numMin)vErr="Min "+numMin+" cifre";
  const bad=!!vErr;
  const content = (
  <div>
    <div className="rvLab">{l} {r&&<span style={{color:"var(--tf-f87171)"}}>*</span>}</div>
    <input value={v||""} onChange={e=>onCh(e.target.value)} placeholder={p} disabled={dis} readOnly={dis}
      className="rvIn"
      style={bad?{border:"1.5px solid #ef4444",background:"rgba(239,68,68,0.10)"}
        :dis?{border:"1.5px solid rgba(34,211,238,0.45)",background:"rgba(23,162,184,0.10)",color:"var(--tf-7dd3fc)",fontStyle:"italic"}
        :pf?{border:"1.5px solid rgba(52,211,153,0.55)",background:"rgba(40,167,69,0.10)"}:undefined} />
    {bad?<div style={{fontSize:11,color:"var(--tf-f87171)",marginTop:3,fontWeight:700}}>⚠ {vErr}</div>:(nt&&<div style={{fontSize:11,color:dis?"var(--tf-67e8f9)":"var(--tf-64748b)",marginTop:3}}>{nt}</div>)}
  </div>
  );
  return content;
};

// VIA con AUTOCOMPLETE (Luca 28/07): stessa veste di TF, ma la via si sceglie
// dalla lista e CAP + città dell'anagrafica si compilano da soli (onPick).
const TFVia = ({v,o,pf,onPick}) => (
  <div>
    <div className="rvLab">Via</div>
    <IndirizzoAutocomplete value={v||""} onChange={o} onPick={onPick} placeholder="Via Roma 12"
      inputStyle={{width:"100%",padding:"10px 12px",borderRadius:10,border:pf?"1.5px solid rgba(52,211,153,0.55)":"1px solid var(--tf-w120)",fontSize:13,boxSizing:"border-box",background:pf?"rgba(40,167,69,0.10)":"var(--tf-w40)",color:"var(--tf-f8fafc)",outline:"none"}} />
  </div>
);

const DD = ({l,r,v,o,vals,nt,cerca}) => {
  const _rep=useContext(ReqCtx),_sk=useContext(SubKeyCtx),_fid=useRef(0),_last=useRef(null);if(_fid.current===0)_fid.current=++_FUID;
  const _emptyNow=!!r&&_isEmptyVal(v);
  useEffect(()=>{if(!(_rep&&_sk&&r))return;if(_last.current!==_emptyNow){_last.current=_emptyNow;_rep.report(_sk,_fid.current,_emptyNow);}},[_rep,_sk,r,_emptyNow]);
  useEffect(()=>{return ()=>{if(_rep&&_sk)_rep.report(_sk,_fid.current,undefined);};},[_rep,_sk]);
  const isGrouped = vals && vals.length>0 && typeof vals[0]==="object" && vals[0].group;
  const [q,setQ]=useState("");
  const [open,setOpen]=useState(false);
  // fonte aggiuntiva async (mega listino): debounce sui tasti, dedup in resa
  const [extra,setExtra]=useState([]);   // [{gruppo, voci[]}]
  // prezzo di listino del modello selezionato (solo tendine terminale)
  const [listini,setListini]=useState([]);
  useEffect(()=>{
    if(!cerca||!v){setListini([]);return;}
    let vivo=true;
    listinoPerModello(v).then(r=>{if(vivo)setListini(r||[]);});
    return()=>{vivo=false;};
  },[v,cerca]);
  const _cercaTO=useRef(null);
  useEffect(()=>{
    if(!cerca||!open){setExtra([]);return;}
    const t=q.trim();
    if(_cercaTO.current)clearTimeout(_cercaTO.current);
    // query vuota = elenco completo della fonte (il listino del brand)
    _cercaTO.current=setTimeout(async()=>{const r=await cerca(t);setExtra(Array.isArray(r)?r:[]);},t?250:0);
    return()=>{if(_cercaTO.current)clearTimeout(_cercaTO.current);};
  },[q,open,cerca]);
  // flatten for searching
  const flat=[];
  if(isGrouped){vals.forEach(g=>g.items.forEach(it=>flat.push({g:g.group,it})));}
  else if(vals){vals.forEach(it=>flat.push({g:"",it}));}
  const ql=q.trim().toLowerCase();
  const filtered=ql?flat.filter(x=>x.it.toLowerCase().includes(ql)):flat;
  // group filtered back
  const byGroup={};
  filtered.forEach(x=>{const k=x.g||"";if(!byGroup[k])byGroup[k]=[];byGroup[k].push(x.it);});
  const content = (
    <div style={{position:"relative"}}>
      <div className="rvLab">{l} {r&&<span style={{color:"var(--tf-f87171)"}}>*</span>}</div>
      <input value={open?q:(v||"")} placeholder={v?v:"Scrivi per filtrare o scegli…"}
        onFocus={()=>{setOpen(true);setQ("");}}
        onChange={e=>{setQ(e.target.value);setOpen(true);}}
        onBlur={()=>setTimeout(()=>setOpen(false),180)}
        className="rvIn"
        style={v?{border:"1.5px solid rgba(52,211,153,0.55)",background:open?undefined:"rgba(40,167,69,0.10)"}:undefined}/>
      {open&&(
        <div className="rvMenu">
          {v&&<div onMouseDown={()=>{o&&o("");setOpen(false);}} style={{padding:"8px 12px",fontSize:12,color:"var(--tf-f87171)",cursor:"pointer",borderBottom:"1px solid var(--tf-w60)",fontWeight:700}}>✕ Deseleziona</div>}
          {filtered.length===0&&!extra.some(g=>g.voci&&g.voci.length)&&<div style={{padding:"12px",fontSize:13,color:"var(--tf-64748b)"}}>Nessun risultato — scrivi per cercare</div>}
          {Object.keys(byGroup).map(gk=>(
            <div key={gk||"_"}>
              {gk&&<div className="rvGrp">{gk}</div>}
              {byGroup[gk].map(it=><div key={it} onMouseDown={()=>{o&&o(it);setOpen(false);setQ("");}} className="rvOpt" style={v===it?{background:"rgba(40,167,69,0.16)",fontWeight:700}:undefined}>{it}</div>)}
            </div>
          ))}
          {(()=>{const visti=new Set(flat.map(x=>x.it.toLowerCase()));return extra.map(g=>{
            const ex=(g.voci||[]).filter(it=>!visti.has(it.toLowerCase()));
            ex.forEach(it=>visti.add(it.toLowerCase()));
            if(!ex.length)return null;
            const oro=String(g.gruppo||"").includes("Listino");
            return (
            <div key={g.gruppo}>
              <div className="rvGrp" style={{color:oro?"var(--tf-6ee7b7)":"var(--tf-a5b4fc)"}}>{g.gruppo}</div>
              {ex.map(it=><div key={g.gruppo+"_"+it} onMouseDown={()=>{o&&o(it);setOpen(false);setQ("");}} className="rvOpt" style={v===it?{background:"rgba(40,167,69,0.16)",fontWeight:700}:undefined}>{it}</div>)}
            </div>);});})()}
        </div>
      )}
      {listini.length>0&&(
        <div style={{marginTop:3,fontSize:11,color:"var(--tf-34d399)",fontWeight:600,lineHeight:1.5}}>
          {listini.map(li=>{
            const pz=Number(li.prezzo||0), mp=Number(li.margine_pct??0);
            const marg=_senzaMargine()?(_compBrand(_brandVendita)==="FASTWEB"?" · senza marginalità (Fastweb)":" · senza marginalità (business)"):(mp>0?` · margine ${mp}% = € ${(pz*mp/100).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"");
            // SOLO street price + marginalità (Luca 03/08): le rate mostrate
            // dal listino erano sbagliate — via tutto il resto
            const daMag=li.lista==="magazzino"?" · 🏬 da magazzino (non più ordinabile)":"";
            return `💰 Listino ${li.brand}: € ${pz.toLocaleString("it-IT",{minimumFractionDigits:2})}${marg}${daMag}`;
          }).join("  ·  ")}
        </div>
      )}
      {nt&&<div style={{fontSize:10,color:"var(--tf-64748b)",marginTop:2}}>{nt}</div>}
      {/* Se e' selezionato "Altro", compare un campo per inserire il modello non in lista.
          Il valore viene salvato come "Altro: <modello>" cosi' il campo resta visibile. */}
      {typeof v==="string"&&(v==="Altro"||v.startsWith("Altro:"))&&(
        <input autoFocus value={v.replace(/^Altro:?\s*/,"")} placeholder="Inserisci il modello non in lista…"
          onChange={e=>{const t=e.target.value;o&&o(t?("Altro: "+t):"Altro");}}
          className="rvIn" style={{marginTop:6,border:"1.5px solid rgba(139,92,246,0.55)",background:"rgba(111,66,193,0.10)"}}/>
      )}
    </div>
  );
  return content;
};

const SCd = ({session,codici,val,onCh}) => {
  const actual=val||session||"";
  const _rep=useContext(ReqCtx),_sk=useContext(SubKeyCtx),_fid=useRef(0),_last=useRef(null);if(_fid.current===0)_fid.current=++_FUID;
  const _emptyNow=_isEmptyVal(actual);
  useEffect(()=>{if(!(_rep&&_sk))return;if(_last.current!==_emptyNow){_last.current=_emptyNow;_rep.report(_sk,_fid.current,_emptyNow);}},[_rep,_sk,_emptyNow]);
  useEffect(()=>{return ()=>{if(_rep&&_sk)_rep.report(_sk,_fid.current,undefined);};},[_rep,_sk]);
  useEffect(()=>{if(_isEmptyVal(val)&&!_isEmptyVal(session))onCh(session);},[session]);
  const isOv=val&&val!==session;
  const content = (
    <div>
      <div className="rvLab">Codice <span style={{color:"var(--tf-f87171)"}}>*</span></div>
      <select value={actual} onChange={e=>onCh(e.target.value)} className="rvIn"
        style={actual?{border:"1.5px solid rgba(52,211,153,0.55)",background:isOv?undefined:"rgba(40,167,69,0.10)"}:undefined}>
        <option value="">— Seleziona —</option>
        {codici.map(c=><option key={c} value={c}>{c}</option>)}
      </select>
      {actual&&!isOv&&<div style={{fontSize:11,color:"var(--tf-34d399)",marginTop:3}}>✓ Da codice inserimento</div>}
      {isOv&&<div style={{fontSize:11,color:"var(--tf-fb923c)",marginTop:3}}>⚠ Modificato</div>}
    </div>
  );
  return content;
};

// ACCENTO DEL BRAND ATTIVO (Luca 03/08): i componenti di modulo (RB, header
// "Dati Contratto"…) leggono da qui il colore del brand in corso — prima i
// dettagli restavano BLU (o rosso Vodafone) dentro qualsiasi operatore.
let _brandAccento = "var(--tf-6366f1)";

const CartItem = ({it,ii,gi,total,expI,setExpI}) => {
  const exp = expI[gi+"_"+ii];
  const dets = it.details ? Object.entries(it.details).filter(([k,v])=>v&&k!=="hasContract") : [];
  // DETTAGLIO MODERNO (Luca 03/08): chip di categoria, schedine dettagli,
  // via il look bootstrap blu del vecchio carrello
  const content = (
    <div style={{borderBottom:ii<total-1?"1px solid var(--tf-w50)":"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 0",flexWrap:"wrap"}}>
        <span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 12px",borderRadius:999,background:it.macroColor+"1f",border:"1px solid "+it.macroColor+"55",fontSize:11,fontWeight:800,color:it.macroColor}}>{it.macroIcon} {it.macro}</span>
        <span style={{fontSize:13.5,fontWeight:700,color:"var(--tf-f8fafc)"}}>{it.sub}</span>
        {it.details&&it.details.hasContract&&<span style={{fontSize:9,fontWeight:800,color:"#fff",background:it.macroColor,padding:"2px 8px",borderRadius:5,letterSpacing:.5}}>CONTRATTO</span>}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:10,fontWeight:700,color:"var(--tf-64748b)",background:"var(--tf-w50)",borderRadius:999,padding:"2px 9px"}}>V.{it.saleNum}</span>
          <button onClick={()=>setExpI(p=>({...p,[gi+"_"+ii]:!p[gi+"_"+ii]}))} style={{background:exp?"rgba(99,102,241,0.18)":"var(--tf-w40)",border:exp?"1px solid rgba(129,140,248,0.6)":"1px solid var(--tf-w120)",borderRadius:8,padding:"5px 13px",fontSize:11,fontWeight:800,cursor:"pointer",color:exp?"var(--tf-c7d2fe)":"var(--tf-94a3b8)",transition:"all .15s"}}>{exp?"▲ Nascondi":"👁 Dettagli"}</button>
        </div>
      </div>
      {exp&&<div style={{padding:"0 0 12px 6px"}}><div style={{background:"var(--tf-w30)",borderRadius:12,padding:14,border:"1px solid var(--tf-w80)",borderLeft:"3px solid "+it.macroColor}}>
        {dets.length>0?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:8}}>{dets.map(([k,v])=><div key={k} style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w60)",borderRadius:9,padding:"7px 11px"}}><div style={{fontSize:9,fontWeight:800,color:"var(--tf-64748b)",textTransform:"uppercase",letterSpacing:.6}}>{k}</div><div style={{fontSize:12.5,fontWeight:600,color:"var(--tf-f8fafc)",marginTop:2,wordBreak:"break-word"}}>{String(v)}</div></div>)}</div>
        :<div style={{fontSize:12,color:"var(--tf-64748b)"}}>Nessun dettaglio — premi ✏️ Modifica</div>}
      </div></div>}
    </div>
  );
  return content;
};

// ── VF Mobile GA component ────────────────────────────────────────────────

const VF_C="var(--tf-e60000)";
const VF_LIGHT="rgba(220,53,69,0.12)";
const VF_BORDER="rgba(230,0,0,0.30)";
const VF_BRANDS=["TIM","Vodafone","WindTre","Iliad","Fastweb","Sky","Sky Mobile","Very Mobile","Ho Mobile","Postemobile","Coop Voce","Tiscali","Lyca Mobile","Altro"];
const VF_SMARTPHONES = VF_SMARTPHONES_GROUPED;
const GNP_FISSO_BRANDS=["TIM","Vodafone","WindTre","Fastweb","Tiscali","Sky Wifi","Enel Fibra","EniPlenitude Fibra","Iliad","Poste","Altro"];
const VF_GNP_BRANDS=["TIM","Vodafone","WindTre","Fastweb","Tiscali","Sky Wifi","Enel Fibra","EniPlenitude Fibra","Iliad","Poste","Altro"];
const VF_CODICI_NEGOZIO=["Acilia","Baleniere","Castani","Merulana","Donna","Magliana","Collatina","Garbatella"];
const FW_C = "var(--tf-cc9900)";

const FW_MOBILE_OFFERS = [
  "Start","Start MNP","Start Tied","Start MNP Tied",
  "Ultra","Ultra MNP","Ultra Tied","Ultra Tied MNP",
  "Pro","Pro MNP","Pro Tied","Pro MNP Tied",
  "Power","Power MNP","Power Tied","Power MNP Tied"
];
const FW_FISSO_OFFERS = ["Start","Pro","Ultra"];
const FW_FISSO_BIZ_OFFERS = ["Fastweb Business Light","Fastweb Business","Fastweb Business Plus","Fastweb Business Pro","Centralino"];
const FW_MOBILE_BIZ_OFFERS = ["Fastweb Mobile Business","Fastweb Mobile Freedom","Fastweb Mobile Business Unlimited"];
const FW_FISSO_BIZ_SECLINE = ["Fastweb Business Pro","Centralino"];
const FW_ENERGIA_OFFERS = ["Energy Flex","Energy Core","Energy Fix","GAS"];
const FW_BRANDS_MNP = ["TIM","Vodafone","WindTre","Iliad","Fastweb","Sky","Sky Mobile","Very Mobile","Ho Mobile","Postemobile","Coop Voce","Tiscali","Lyca Mobile","Altro"];
const FW_CODICI_NEGOZIO = ["Acilia","Baleniere","Castani","Merulana","Magliana","Donna","Garbatella","Promontori"];
const FW_GNP_BRANDS = ["TIM","Vodafone","WindTre","Fastweb","Tiscali","Sky Wifi","Enel Fibra","EniPlenitude Fibra","Iliad","Poste","Altro"];

const getFW = (tc) => {
  const biz = tc === "business";
  return [
    { id:"mobile", title:"MOBILE", icon:"📱", color:FW_C, radio:true, subs:[
      { id:"ga", title:"MOBILE", isFWMobile:true, fwBiz:biz, hasContract:true, ct:"ga", fields:[] },
      // Segnalazione 34: mancava la sostituzione SIM, presente su WindTre e Vodafone.
      { id:"sost_sim", title:"Sostituzione Sim", isFWSostSim:true, hasContract:true, ct:"multi", fields:[] },
    ]},
    { id:"fisso", title:"FISSO", icon:"🏠", color:"var(--tf-28a745)", radio:true, subs:
      (biz?FW_FISSO_BIZ_OFFERS:FW_FISSO_OFFERS).map(o=>({ id:o.toLowerCase().replace(/ /g,"_"), title:o, isFWFisso:true, fwBiz:biz, hasContract:true, ct:"fisso", fields:[] }))
    },
    { id:"energia", title:"ENERGIA", icon:"🔋", color:"var(--tf-28a745)", radio:false, subs:
      FW_ENERGIA_OFFERS.filter(o=>biz?o!=="Energy Core":true).map(o=>({ id:o.toLowerCase().replace(/ /g,"_"), title:o, isFWEnergia:true, hasContract:true, ct:"multi", fields:[] }))
    },
  ];
};

const FWMobile = ({sd, uP, sc, biz}) => {
  const upv=(k,v)=>uP(k,v);
  const hasMNP = biz ? (sd.fwMnp==="Sì") : (sd.fwOffer && sd.fwOffer.includes("MNP"));
  const offerList = biz ? FW_MOBILE_BIZ_OFFERS : FW_MOBILE_OFFERS;
  const content = (
    <div>
      {/* DATI e SMART HOME (richieste Francesco): selezionata l'offerta si va
          dritti al box "Dati Contratto" — niente MNP, domiciliazione,
          convergenza, TNP o Security, che per una SIM dati non hanno senso. */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--tf-64748b)",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Offerta Mobile</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {offerList.map(offer=>{
          const isActive=sd.fwOffer===offer;
          return (
            <button key={offer} onClick={()=>{const nw=isActive?null:offer;upv("fwOffer",nw);if(nw&&!biz){const nowMnp=nw.indexOf("MNP")>=0;if(nowMnp&&!sd.fwNumProv&&sd.fwNumDef)upv("fwNumProv",sd.fwNumDef);if(!nowMnp&&!sd.fwNumDef&&sd.fwNumProv)upv("fwNumDef",sd.fwNumProv);}}}
              style={{padding:"8px 14px",borderRadius:10,border:isActive?"2px solid "+FW_C:"2px solid var(--tf-w100)",background:isActive?FW_C:"var(--tf-w40)",color:isActive?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {offer}
            </button>
          );
        })}
      </div>
      {sd.fwOffer&&biz&&(
        <RB label="MNP?" val={sd.fwMnp} opts={["Sì","No"]} onCh={v=>{upv("fwMnp",v);if(v==="No"){upv("fwMnpBrand","");upv("fwMnpNum","");}}}/>
      )}
      {sd.fwOffer&&(!biz||sd.fwMnp)&&(
        <div>
          {hasMNP&&(
            <div style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w60)",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--tf-64748b)",marginBottom:8,textTransform:"uppercase"}}>Portabilità (MNP)</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Operatore provenienza" r v={sd.fwMnpBrand||""} o={v=>upv("fwMnpBrand",v)} vals={FW_BRANDS_MNP}/>
                <TF l="Numero Portabilità" r v={sd.fwMnpNum||""} o={v=>upv("fwMnpNum",v)} p="3XXXXXXXXX"/>
              </div>
            </div>
          )}

          <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
            <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
              <SCd session={sc} codici={FW_CODICI_NEGOZIO} val={sd.fwCodIns||""} onCh={v=>upv("fwCodIns",v)}/>
              {hasMNP?(
                <TF l="Numero Provvisorio" r v={sd.fwNumProv||""} o={v=>upv("fwNumProv",v)} p="393XXXXXXX"/>
              ):(
                <TF l="Numero" v={sd.fwNumDef||""} o={v=>upv("fwNumDef",v)} p="3XXXXXXXXX"/>
              )}
              <TF l="ICCID" r v={sd.fwIccid||""} o={v=>upv("fwIccid",v)} p="8939..." nt="Barcode 📷"/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  return content;
};

const FWFisso = ({sd, uP, sc, biz, offer}) => {
  const upv=(k,v)=>uP(k,v);
  const hasSecLines = biz && FW_FISSO_BIZ_SECLINE.includes(offer);
  const isCentr = offer==="Centralino";
  const secCount = sd.fwFSecLineCount||0;
  const setSecCount=(n)=>{upv("fwFSecLineCount",n);const arr=[...(sd.fwFSecLines||[])];arr.length=n;for(let i=0;i<n;i++)if(!arr[i])arr[i]="";upv("fwFSecLines",arr);};
  const setSecLine=(i,v)=>{const arr=[...(sd.fwFSecLines||[])];arr[i]=v;upv("fwFSecLines",arr);};
  const content = (
    <div>
      <RB label="GNP?" val={sd.fwFGnp} opts={["Sì","No"]} onCh={v=>{upv("fwFGnp",v);if(v==="No"){upv("fwFGnpBrand","");upv("fwFGnpNum","");upv("fwFSecLineCount",0);upv("fwFSecLines",[]);}}}/>
      {sd.fwFGnp==="Sì"&&(
        <div style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w100)",borderRadius:8,padding:12,marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
            <DD l="Operatore GNP" r v={sd.fwFGnpBrand||""} o={v=>upv("fwFGnpBrand",v)} vals={FW_GNP_BRANDS}/>
            {/* Segnalazione 78: il numero fisso GNP E' il numero definitivo, quindi
                lo riportiamo da solo su N. Fisso Definitivo e non lo richiediamo
                una seconda volta nel box Dati contratto. */}
            <TF l="Numero Fisso GNP" r v={sd.fwFGnpNum||""} o={v=>{upv("fwFGnpNum",v);upv("fwFNumDef",v);}} p="06XXXXXXXX"/>
          </div>
          {hasSecLines&&(
            <div style={{marginTop:12,borderTop:"1px solid var(--tf-w100)",paddingTop:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--tf-64748b)",marginBottom:6,textTransform:"uppercase"}}>Seconde linee da migrare</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                {[0,1,2,3,4,5].map(n=>(
                  <button key={n} onClick={()=>setSecCount(n)} style={{width:36,height:34,borderRadius:8,border:secCount===n?"2px solid "+FW_C:"2px solid var(--tf-w100)",background:secCount===n?FW_C:"var(--tf-w40)",color:secCount===n?"#fff":"var(--tf-8892b0)",fontSize:13,fontWeight:700,cursor:"pointer"}}>{n}</button>
                ))}
              </div>
              {secCount>0&&[...Array(secCount)].map((_,i)=>(
                <div key={i} style={{marginBottom:6}}>
                  <TF l={"Numero 2ª linea "+(i+1)} r v={(sd.fwFSecLines&&sd.fwFSecLines[i])||""} o={v=>setSecLine(i,v)} p="06XXXXXXXX"/>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {sd.fwFGnp&&(
        <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
          <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:12,textTransform:"uppercase"}}>📋 Dati Contratto</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
            <SCd session={sc} codici={FW_CODICI_NEGOZIO} val={sd.fwFCodIns||""} onCh={v=>upv("fwFCodIns",v)}/>
            {sd.fwFGnp==="Sì"?(
              <TF l="N. Fisso Provvisorio" r v={sd.fwFNumProv||""} o={v=>upv("fwFNumProv",v)} p="06XXXXXXXX"/>
            ):(
              <TF l="N. Fisso Definitivo" r v={sd.fwFNumDef||""} o={v=>upv("fwFNumDef",v)} p="06XXXXXXXX"/>
            )}
            {/* Segnalazione 78: con GNP = Si il definitivo arriva dal Numero Fisso GNP:
                non si chiede di nuovo. Lo mostriamo solo in lettura per conferma. */}
            {sd.fwFGnp==="Sì"&&sd.fwFGnpNum&&(
              <div>
                <div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:3}}>N. Fisso Definitivo</div>
                <div style={{padding:"7px 10px",borderRadius:6,fontSize:12,background:"var(--tf-w40)",border:"1px solid var(--tf-w100)",color:"var(--tf-f8fafc)"}}>
                  {sd.fwFGnpNum} <span style={{color:"var(--tf-64748b)",fontSize:11}}>— da Numero Fisso GNP</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
  return content;
};

const FWEnergia = ({sd, uP, sc, subTitle, dupCheck}) => {
  const upv=(k,v)=>uP(k,v);
  const isGas = subTitle === "GAS";
  const content = (
    <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
      <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
        <SCd session={sc} codici={FW_CODICI_NEGOZIO} val={sd.fwEnCodIns||""} onCh={v=>upv("fwEnCodIns",v)}/>
        <DD l="Operatore provenienza" r v={sd.fwEnProv||""} o={v=>upv("fwEnProv",v)} vals={opProv}/>
        {isGas
          ? <TF l="PDR" r v={sd.fwPdr||""} o={v=>upv("fwPdr",v)} p="14 cifre" err={dupCheck&&dupCheck("PDR",sd.fwPdr)?"PDR già inserito in questo contratto":""}/>
          : <TF l="POD" r v={sd.fwPod||""} o={v=>upv("fwPod",v)} p="IT001E..." err={dupCheck&&dupCheck("POD",sd.fwPod)?"POD già inserito in questo contratto":""}/>}
      </div>
    </div>
  );
  return content;
};


// Offerte che saltano MNP/domiciliazione/convergenza/TNP/Security e mostrano
// subito il box "Dati Contratto" (segnalazioni 13 e 16).
const VF_DIRECT_OFFERS=["DATI","SMART HOME"];
const VF_MOBILE_OFFERS=["MOBILE START","MOBILE PRO","MOBILE POWER","MOBILE ULTRA","MOBILE START UNDER 18","C'ALL POWER EDITION","C'ALL MAX","C'ALL POWER PRO","DOLCE VITA","DOLCE VITA+","DATI","SMART HOME"];
const emTnpSlot=()=>({tipo:null,tnpCount:null,tnpItems:[],compassTipo:null,compassItems:[]});

const MiniC = ({label,val,opts,onCh,locked,lockVal}) => {
  const content = (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:10,fontWeight:700,color:"var(--tf-64748b)",marginBottom:4,textTransform:"uppercase",letterSpacing:.4}}>{label}</div>
      <div style={{display:"flex",gap:6}}>
        {opts.map(o=>{
          const isActive=locked?(o===(lockVal===true?"Sì":lockVal===false?"No":lockVal)):val===o||val===(o==="Sì"?true:o==="No"?false:o);
          return (
            <button key={o} onClick={()=>!locked&&onCh(val===o?null:o)} disabled={locked}
              style={{padding:"5px 16px",borderRadius:6,border:isActive?"2px solid #2E75B6":"2px solid var(--tf-w100)",background:isActive?"var(--tf-2e75b6)":"var(--tf-w40)",color:isActive?"#fff":"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:locked?"not-allowed":"pointer",opacity:locked?0.8:1}}>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
  return content;
};

const RB = ({label,val,opts,onCh}) => {
  const content = (
    <div style={{marginBottom:12}}>
      <div className="rvLab">{label}</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {opts.map(o=>(
          <button key={o} onClick={()=>onCh(val===o?null:o)}
            style={{padding:"9px 22px",borderRadius:999,border:val===o?"1.5px solid "+_brandAccento:"1px solid var(--tf-w120)",background:val===o?_brandAccento:"var(--tf-w40)",color:val===o?"#fff":"var(--tf-8892b0)",fontSize:13,fontWeight:700,cursor:"pointer",transition:"all .15s",boxShadow:val===o?"0 4px 14px "+_brandAccento+"55":"none"}}>
            {val===o?"✓ ":""}{o}
          </button>
        ))}
      </div>
    </div>
  );
  return content;
};

const BUNDLE_VALORI = ["39.9","54.9","69.9","99.99"];

const RigaBundleAccessorio = ({riga, onUpd, modoRiga}) => {
  const content = (
    <div style={{marginBottom:10,padding:10,background:"var(--tf-w30)",borderRadius:8,border:"1px solid rgba(220,53,69,0.12)"}}>
      {modoRiga==="Entrambi"&&(
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          {["Bundle","Accessorio"].map(t=>(
            <button key={t} onClick={()=>onUpd("tipo",riga.tipo===t?null:t)}
              style={{padding:"4px 14px",borderRadius:6,border:riga.tipo===t?"2px solid "+VF_C:"2px solid var(--tf-w100)",background:riga.tipo===t?VF_C:"var(--tf-w40)",color:riga.tipo===t?"#fff":"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              {t}
            </button>
          ))}
        </div>
      )}
      {(modoRiga==="Bundle"||(modoRiga==="Entrambi"&&riga.tipo==="Bundle"))&&(
        <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
          <div style={{flex:2}}>
            <div style={{fontSize:10,fontWeight:600,color:"var(--tf-64748b)",marginBottom:2}}>Codice Bundle</div>
            <input value={riga.codice||""} onChange={e=>onUpd("codice",e.target.value)} placeholder="Codice..."
              style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12,boxSizing:"border-box"}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,fontWeight:600,color:"var(--tf-64748b)",marginBottom:2}}>Tipologia €</div>
            <select value={riga.tipoBundleVal||""} onChange={e=>onUpd("tipoBundleVal",e.target.value)}
              style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12,boxSizing:"border-box",background:"var(--tf-w20)"}}>
              <option value="">--</option>
              {BUNDLE_VALORI.map(v=><option key={v} value={v}>{v} €</option>)}
            </select>
          </div>
        </div>
      )}
      {(modoRiga==="Accessorio"||(modoRiga==="Entrambi"&&riga.tipo==="Accessorio"))&&(
        <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
          <div style={{flex:2}}>
            <div style={{fontSize:10,fontWeight:600,color:"var(--tf-64748b)",marginBottom:2}}>IMEI Accessorio</div>
            <input value={riga.imei2||""} onChange={e=>onUpd("imei2",e.target.value)} placeholder="IMEI..."
              style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12,boxSizing:"border-box",fontFamily:"monospace"}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,fontWeight:600,color:"var(--tf-64748b)",marginBottom:2}}>Valore €</div>
            <input value={riga.valore||""} onChange={e=>onUpd("valore",e.target.value)} placeholder="0.00"
              style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12,boxSizing:"border-box"}}/>
          </div>
        </div>
      )}
      {modoRiga==="Entrambi"&&!riga.tipo&&(
        <div style={{fontSize:11,color:"var(--tf-64748b)",fontStyle:"italic"}}>Seleziona Bundle o Accessorio</div>
      )}
    </div>
  );
  return content;
};

const emRiga = () => ({tipo:null,codice:"",tipoBundleVal:"",imei2:"",valore:""});

const CompassDatiTNP = ({sd, upv}) => {
  const items = sd.vfCompassItems||[{modello:"",imei:"",bundleOn:false,accessorioOn:false,righe:[emRiga()],kasko:false,kaskoSerial:""}];

  const updItem=(i,k,v)=>{
    const arr=[...items];
    arr[i]={...arr[i],[k]:v};
    upv("vfCompassItems",arr);
  };
  const updRiga=(ii,ri,k,v)=>{
    const arr=[...items];
    const righe=[...arr[ii].righe];
    righe[ri]={...righe[ri],[k]:v};
    arr[ii]={...arr[ii],righe};
    upv("vfCompassItems",arr);
  };
  const addRiga=(i)=>{
    if((items[i].righe||[]).length>=3)return;
    const arr=[...items];
    arr[i]={...arr[i],righe:[...(arr[i].righe||[]),emRiga()]};
    upv("vfCompassItems",arr);
  };
  const removeRiga=(ii,ri)=>{
    const arr=[...items];
    const righe=[...arr[ii].righe];
    righe.splice(ri,1);
    arr[ii]={...arr[ii],righe};
    upv("vfCompassItems",arr);
  };
  const toggleMode=(i,mode)=>{
    const arr=[...items];
    const item={...arr[i]};
    if(mode==="Bundle") item.bundleOn=!item.bundleOn;
    if(mode==="Accessorio") item.accessorioOn=!item.accessorioOn;
    item.righe=[emRiga()];
    arr[i]=item;
    upv("vfCompassItems",arr);
  };

  const content = (
    <div style={{marginTop:12,background:"var(--tf-w20)",border:"1px solid "+VF_BORDER,borderRadius:8,padding:12}}>
      <div style={{fontSize:11,fontWeight:800,color:VF_C,marginBottom:10,textTransform:"uppercase"}}>Dati TNP</div>
      {items.map((item,i)=>{
        const bundleOn=item.bundleOn||false;
        const accessorioOn=item.accessorioOn||false;
        const modoRiga=bundleOn&&accessorioOn?"Entrambi":bundleOn?"Bundle":accessorioOn?"Accessorio":null;
        return (
          <div key={i} style={{marginBottom:i<items.length-1?16:0}}>
            {items.length>1&&<div style={{fontSize:10,fontWeight:700,color:"var(--tf-64748b)",marginBottom:6}}>Compass #{i+1}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px",marginBottom:8}}>
              <DD l="Modello terminale" v={item.modello||""} o={v=>updItem(i,"modello",v)} vals={SOLO_ALTRO} cerca={cercaTerminali}/>
              <TF l="IMEI" v={item.imei||""} o={v=>updItem(i,"imei",v)} p="15 cifre" nt="Barcode 📷"/>
            </div>
            <div style={{marginBottom:10}}>
              <TF l="Codice pratica finanziamento" r v={item.codicePratica||""} o={v=>updItem(i,"codicePratica",v)} p="es. FIN-000123"/>
            </div>

            {/* Bundle / Accessori toggle */}
            <div style={{borderTop:"1px solid rgba(220,53,69,0.12)",paddingTop:10,marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:700,color:"var(--tf-64748b)",textTransform:"uppercase"}}>Bundle / Accessori</div>
                <div style={{display:"flex",gap:6}}>
                  {["Bundle","Accessorio"].map(t=>{
                    const isOn=t==="Bundle"?bundleOn:accessorioOn;
                    return (
                      <button key={t} onClick={()=>toggleMode(i,t)}
                        style={{padding:"4px 14px",borderRadius:6,border:isOn?"2px solid "+VF_C:"2px solid var(--tf-w100)",background:isOn?VF_C:"var(--tf-w40)",color:isOn?"#fff":"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {modoRiga&&(
                <div>
                  {(item.righe||[]).map((riga,ri)=>(
                    <div key={ri} style={{display:"flex",alignItems:"flex-start",gap:4}}>
                      <div style={{flex:1}}>
                        <RigaBundleAccessorio riga={riga} onUpd={(k,v)=>updRiga(i,ri,k,v)} modoRiga={modoRiga}/>
                      </div>
                      {(item.righe||[]).length>1&&(
                        <button onClick={()=>removeRiga(i,ri)} style={{background:"none",border:"none",color:"var(--tf-dc3545)",cursor:"pointer",fontSize:13,padding:"14px 2px"}}>✕</button>
                      )}
                    </div>
                  ))}
                  {(item.righe||[]).length<3&&(
                    <button onClick={()=>addRiga(i)}
                      style={{fontSize:11,fontWeight:600,color:VF_C,background:"none",border:"1px dashed "+VF_C,borderRadius:6,padding:"4px 12px",cursor:"pointer",marginTop:2}}>
                      + Aggiungi ({(item.righe||[]).length}/3)
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Kasko */}
            <div style={{borderTop:"1px solid rgba(220,53,69,0.12)",paddingTop:8}}>
              <button onClick={()=>updItem(i,"kasko",!item.kasko)}
                style={{padding:"5px 16px",borderRadius:7,border:item.kasko?"2px solid #6f42c1":"2px solid var(--tf-w100)",background:item.kasko?"rgba(111,66,193,0.12)":"var(--tf-w40)",color:item.kasko?"var(--tf-6f42c1)":"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                🛡️ Kasko{item.kasko?" ✓":""}
              </button>
              {item.kasko&&(
                <div style={{marginTop:8}}>
                  <TF l="Numero seriale Kasko" v={item.kaskoSerial||""} o={v=>updItem(i,"kaskoSerial",v)} p="Numero seriale..."/>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
  return content;
};

const COMPASS_OPTS = ["Smartphone Easy S-M","Smartphone Easy L-XL","Compass Flexypay S-M","Compass Flexypay L-XL"];
const TNP_TAGLIA_OPTS = ["TNP S-M","TNP L-XL"];

const emCompassItem = () => ({modello:"",imei:"",bundleOn:false,accessorioOn:false,righe:[emRiga()],kasko:false,kaskoSerial:""});

const TnpSlot = ({slot, idx, total, isWallet, upSlot, onAddSlot, onRemoveSlot}) => {
  const isTnpTaglia = TNP_TAGLIA_OPTS.includes(slot.tipo);
  const isCompass = COMPASS_OPTS.includes(slot.tipo) || slot.tipo==="Forward";
  const set=(k,v)=>upSlot(idx,k,v);
  const setFn=(k,fn)=>upSlot(idx,"__fn__",prev=>({...prev,[k]:fn(prev[k])}));
  const allOpts = isWallet ? ["Compass Flexypay S-M","Compass Flexypay L-XL"] : [...COMPASS_OPTS, ...TNP_TAGLIA_OPTS,"Forward"];
  const compassItems = (slot.compassItems&&slot.compassItems.length>0)?slot.compassItems:[emCompassItem()];
  const content = (
    <div style={{background:VF_LIGHT,border:"1px solid "+VF_BORDER,borderRadius:8,padding:14,marginBottom:12}}>
      {total>1&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:800,color:VF_C,textTransform:"uppercase"}}>TNP #{idx+1}</div>
          <button onClick={()=>onRemoveSlot(idx)} style={{background:"none",border:"1px solid #dc3545",borderRadius:6,padding:"2px 10px",color:"var(--tf-dc3545)",fontSize:10,cursor:"pointer",fontWeight:600}}>✕ Rimuovi</button>
        </div>
      )}
      <div style={{fontSize:11,fontWeight:700,color:"var(--tf-64748b)",marginBottom:8,textTransform:"uppercase"}}>Tipologia dispositivo</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
        {allOpts.map(t=>{
          const isOn=slot.tipo===t;
          const initCompass=(COMPASS_OPTS.includes(t)||t==="Forward")?[emCompassItem()]:[];
          return (
            <button key={t} onClick={()=>set("__replace__",isOn?emTnpSlot():{...emTnpSlot(),tipo:t,compassItems:initCompass})}
              style={{padding:"7px 14px",borderRadius:8,border:isOn?"2px solid "+VF_C:"2px solid var(--tf-w100)",background:isOn?VF_C:"var(--tf-w40)",color:isOn?"#fff":"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              {t}
            </button>
          );
        })}
      </div>

      {isTnpTaglia&&(
        <div style={{background:"var(--tf-w20)",border:"1px solid "+VF_BORDER,borderRadius:8,padding:12,marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--tf-64748b)",marginBottom:8,textTransform:"uppercase"}}>Dati TNP</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
            <DD l="Modello terminale" r v={slot.modello||""} o={v=>set("modello",v)} vals={SOLO_ALTRO} cerca={cercaTerminali}/>
            <TF l="IMEI" r v={slot.imei||""} o={v=>set("imei",v)} p="15 cifre" nt="Barcode 📷"/>
          </div>
        </div>
      )}

      {isCompass&&(
        <CompassDatiTNP sd={{vfCompassItems:compassItems}} upv={(k,v)=>set("compassItems",v)}/>
      )}

      {slot.tipo&&(
        <div style={{marginTop:12,borderTop:"1px solid "+VF_BORDER,paddingTop:10}}>
          {total<3&&idx===total-1?(
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--tf-8892b0)"}}>Aggiungi altra TNP?</div>
              <button onClick={onAddSlot}
                style={{padding:"5px 16px",borderRadius:7,border:"2px solid "+VF_C,background:"var(--tf-w20)",color:VF_C,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                + Sì
              </button>
            </div>
          ):(
            idx===total-1&&total>=3&&(
              <div style={{fontSize:11,color:"var(--tf-64748b)",fontStyle:"italic"}}>Massimo 3 TNP per vendita</div>
            )
          )}
        </div>
      )}
    </div>
  );
  return content;
};

const VFMobileGA = ({sd,uP,sc}) => {
  const upv=(k,v)=>uP(k,v);
  const isDV=sd.vfOffer==="DOLCE VITA"||sd.vfOffer==="DOLCE VITA+";
  const isDati=VF_DIRECT_OFFERS.includes(sd.vfOffer);

  const updTnpSlot=(slotIdx,updater)=>{
    uP("vfTnpList",prev=>{const list=[...(prev||[])];list[slotIdx]=updater(list[slotIdx]||emTnpSlot());return list;});
  };
  const addTnpSlot=()=>{
    uP("vfTnpList",prev=>{const l=prev||[];return l.length<3?[...l,emTnpSlot()]:l;});
  };
  const removeTnpSlot=(slotIdx)=>{
    uP("vfTnpList",prev=>{const l=prev||[];const n=[...l];n.splice(slotIdx,1);return n.length?n:[emTnpSlot()];});
  };
  const content = (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"var(--tf-64748b)",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Offerta Mobile</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {VF_MOBILE_OFFERS.map(offer=>{
          const isActive=sd.vfOffer===offer;
          const isBecomesDV=!isActive&&(offer==="DOLCE VITA"||offer==="DOLCE VITA+");
          return (
            <button key={offer} onClick={()=>{
              if(isActive){
                uP("__resetVFOffer__",null);
              } else {
                uP("__resetVFOfferTo__",{offer,isDV:isBecomesDV});
              }
            }}
              style={{padding:"8px 14px",borderRadius:10,border:isActive?"2px solid "+VF_C:"2px solid var(--tf-w100)",background:isActive?VF_C:"var(--tf-w40)",color:isActive?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {offer}
            </button>
          );
        })}
      </div>
      {sd.vfOffer&&(
        <div>
          {/* MNP — bloccato a No per DV/DV+ */}
          {isDati?null:isDV?(
            <div style={{marginBottom:12,padding:"8px 12px",background:"rgba(245,158,11,0.14)",border:"1px solid #ffc107",borderRadius:8,fontSize:11,color:"var(--tf-f59e0b)"}}>
              MNP: <strong>No</strong> — non disponibile per {sd.vfOffer}
            </div>
          ):(
            <RB label="MNP?" val={sd.vfMnp} opts={["Sì","No"]} onCh={v=>{upv("vfMnp",v);if(v==="No"){upv("vfMnpBrand","");upv("vfMnpNum","")}}}/>
          )}
          {!isDV&&!isDati&&sd.vfMnp==="Sì"&&(
            <div style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w60)",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Operatore provenienza" r v={sd.vfMnpBrand||""} o={v=>upv("vfMnpBrand",v)} vals={VF_BRANDS}/>
                <TF l="Numero Portabilità" r v={sd.vfMnpNum||""} o={v=>upv("vfMnpNum",v)} p="3XXXXXXXXX"/>
              </div>
            </div>
          )}
          {(sd.vfMnp||isDV||isDati)&&(
            <div>
              {/* Domiciliata — solo Wallet per DV/DV+ */}
              {isDati?null:isDV?(
                <div style={{marginBottom:12,padding:"8px 12px",background:"rgba(245,158,11,0.14)",border:"1px solid #ffc107",borderRadius:8,fontSize:11,color:"var(--tf-f59e0b)"}}>
                  Domiciliata: <strong>Wallet</strong> — unica opzione per {sd.vfOffer}
                </div>
              ):(
                <RB label="Domiciliata?" val={sd.vfDomicilio} opts={["Smart","Wallet"]} onCh={v=>{upv("vfDomicilio",v);upv("vfTnpList",[]);upv("vfTnp",null);upv("vfConvergenza",null)}}/>
              )}
              {(sd.vfDomicilio||isDV||isDati)&&(
                <div>
                  {!isDV&&!isDati&&(
                    <div>
                      <RB label="Convergenza?" val={sd.vfConvergenza} opts={["Sì","No"]} onCh={v=>upv("vfConvergenza",v)}/>
                      {sd.vfConvergenza==="Sì"&&(
                        <div style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w60)",borderRadius:8,padding:12,marginBottom:12}}>
                          <TF l="Numero Fisso Convergenza" v={sd.vfNumFisso||""} o={v=>upv("vfNumFisso",v)} p="06XXXXXXXX"/>
                        </div>
                      )}
                    </div>
                  )}
                  {(sd.vfConvergenza||isDV||isDati)&&(
                    <div>
                      {isDati?null:isDV?(
                        <div style={{marginBottom:12,padding:"8px 12px",background:"rgba(245,158,11,0.14)",border:"1px solid #ffc107",borderRadius:8,fontSize:11,color:"var(--tf-f59e0b)"}}>
                          TNP: <strong>non disponibile</strong> per {sd.vfOffer}
                        </div>
                      ):(
                        <RB label="TNP?" val={sd.vfTnp} opts={["Sì","No"]} onCh={v=>{upv("vfTnp",v);if(v==="Sì"){upv("vfTnpList",[emTnpSlot()])}else{upv("vfTnpList",[])}}}/>
                      )}
                      {!isDV&&!isDati&&sd.vfTnp==="Sì"&&(
                        <div>
                          {(sd.vfTnpList||[emTnpSlot()]).map((slot,idx)=>(
                            <TnpSlot key={idx} slot={slot} idx={idx} total={(sd.vfTnpList||[emTnpSlot()]).length}
                              isWallet={isDV||sd.vfDomicilio==="Wallet"}
                              upSlot={(i,k,v)=>updTnpSlot(i,k==="__replace__"?()=>v:k==="__fn__"?prev=>v(prev):prev=>({...prev,[k]:v}))}
                              onAddSlot={addTnpSlot}
                              onRemoveSlot={removeTnpSlot}/>
                          ))}
                        </div>
                      )}
                      {/* Security */}
                      {sd.vfTnp&&!isDV&&!isDati&&sd.vfOffer!=="MOBILE START UNDER 18"&&(
                        <div style={{marginTop:12,background:VF_LIGHT,border:"1px solid "+VF_BORDER,borderRadius:8,padding:14}}>
                          <div style={{fontSize:11,fontWeight:700,color:"var(--tf-64748b)",marginBottom:6,textTransform:"uppercase"}}>Security</div>
                          <div style={{display:"flex",gap:8}}>
                            {["Sì","No"].map(o=>(
                              <button key={o} onClick={()=>upv("vfSecurity",sd.vfSecurity===o?null:o)}
                                style={{padding:"7px 22px",borderRadius:8,border:sd.vfSecurity===o?"2px solid "+VF_C:"2px solid var(--tf-w100)",background:sd.vfSecurity===o?VF_C:"var(--tf-w40)",color:sd.vfSecurity===o?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                                {o}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Dati Contratto */}
                      {(sd.vfTnp||isDV||isDati)&&(
                        <div style={{marginTop:12,background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
                          <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:12,textTransform:"uppercase"}}>📋 Dati Contratto</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
                            {sd.vfMnp==="Sì"?(
                              <TF l="Numero Provvisorio" r v={sd.dcNumProv||""} o={v=>upv("dcNumProv",v)} p="393XXXXXXX"/>
                            ):(
                              <TF l="Numero" r v={sd.dcNum||""} o={v=>upv("dcNum",v)} p="3XXXXXXXXX"/>
                            )}
                            <TF l="ICCID" r v={sd.dcIccid||""} o={v=>upv("dcIccid",v)} p="8939..." nt="Barcode 📷"/>
                            <SCd session={sc} codici={VF_CODICI_NEGOZIO} val={sd.dcCodIns||""} onCh={v=>upv("dcCodIns",v)}/>
                            {sd.vfDomicilio==="Smart"&&(
                              <div>
                                <div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:3}}>Ricarica Automatica <span style={{color:"var(--tf-dc3545)"}}>*</span></div>
                                <div style={{display:"flex",gap:8}}>
                                  {["Sì","No"].map(o=>(
                                    <button key={o} onClick={()=>upv("dcRicaricaAuto",sd.dcRicaricaAuto===o?null:o)}
                                      style={{padding:"6px 18px",borderRadius:8,border:sd.dcRicaricaAuto===o?"2px solid "+VF_C:"2px solid var(--tf-w100)",background:sd.dcRicaricaAuto===o?VF_C:"var(--tf-w40)",color:sd.dcRicaricaAuto===o?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                                      {o}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
  return content;
};

const VF_ADDON_FISSO = ["Chiamate Estero","Rete Sicura Family","Sim Dati 150","Quixa Cane Gatto","Quixa Casa"];


const VFMobileGAFisso = ({sd,uP,sc}) => {
  const upv=(k,v)=>uP(k,v);
  const toggleAddon=(name)=>{const cur=sd.vfFAddons||{};upv("vfFAddons",{...cur,[name]:!cur[name]})};
  const content = (
    <div>
      {/* Lock In */}
      <RB label="Lock In?" val={sd.vfFLockIn} opts={["Sì","No"]} onCh={v=>{upv("vfFLockIn",v);upv("vfFConvergenza",null);upv("vfFGnp",null);upv("vfFGnpBrand","");upv("vfFGnpNum","");upv("vfFAddons",{});upv("vfFCodIns","");upv("vfFNumProv","");upv("vfFNumDef","");upv("vfFNumProvVisorio","")}}/>

      {/* Convergenza — appare dopo Lock In */}
      {sd.vfFLockIn&&(
        <div>
          {sd.vfFLockIn==="No"&&<RB label="Convergenza?" val={sd.vfFConvergenza} opts={["Sì","No"]} onCh={v=>{upv("vfFConvergenza",v);upv("vfFGnp",null);upv("vfFGnpBrand","");upv("vfFGnpNum","");upv("vfFAddons",{});upv("vfFCodIns","");upv("vfFNumProv","");upv("vfFNumDef","");upv("vfFNumProvVisorio","")}}/>}

          {/* GNP — dopo Convergenza, oppure subito se Lock In Sì */}
          {(sd.vfFLockIn==="Sì"||sd.vfFConvergenza)&&(
            <div>
              <RB label="GNP?" val={sd.vfFGnp} opts={["Sì","No"]} onCh={v=>{upv("vfFGnp",v);upv("vfFGnpBrand","");upv("vfFGnpNum","");upv("vfFAddons",{});upv("vfFCodIns","");upv("vfFNumProv","");upv("vfFNumDef","");upv("vfFNumProvVisorio","")}}/>

              {/* Add-on Fisso — appare dopo GNP */}
              {sd.vfFGnp&&(
                <div>
                  <div style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:12,marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:8,textTransform:"uppercase"}}>Add-on Fisso</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {VF_ADDON_FISSO.map(a=>{
                        const on=(sd.vfFAddons||{})[a];
                        return (
                          <button key={a} onClick={()=>toggleAddon(a)}
                            style={{padding:"5px 14px",borderRadius:6,border:on?"2px solid #28a745":"2px solid var(--tf-w100)",background:on?"rgba(40,167,69,0.12)":"var(--tf-w40)",color:on?"var(--tf-28a745)":"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                            <span>{on?"☑":"☐"}</span>{a}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dati Contratto */}
                  <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
                    <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:12,textTransform:"uppercase"}}>📋 Dati Contratto</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
                      <SCd session={sc} codici={VF_CODICI_NEGOZIO} val={sd.vfFCodIns||""} onCh={v=>upv("vfFCodIns",v)}/>
                      {sd.vfFGnp==="Sì"?(
                        <TF l="N. Fisso Provvisorio" r v={sd.vfFNumProvVisorio||""} o={v=>upv("vfFNumProvVisorio",v)} p="06XXXXXXXX"/>
                      ):(
                        <TF l="N. Fisso Definitivo" r v={sd.vfFNumDef||""} o={v=>upv("vfFNumDef",v)} p="06XXXXXXXX"/>
                      )}
                      {sd.vfFGnp==="Sì"&&(
                        <DD l="Operatore GNP" r v={sd.vfFGnpBrand||""} o={v=>upv("vfFGnpBrand",v)} vals={VF_GNP_BRANDS}/>
                      )}
                      {sd.vfFGnp==="Sì"&&(
                        <TF l="N. Fisso Definitivo" r v={sd.vfFNumDef||""} o={v=>upv("vfFNumDef",v)} p="06XXXXXXXX"/>
                      )}
                      <TF l="ICCID" r v={sd.vfFIccid||""} o={v=>upv("vfFIccid",v)} p="8939..." nt="Barcode 📷"/>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
  return content;
};


const emCB = () => ({
  cbTnp:false, cbCellulare:"", cbCodContratto:"", cbCodIns:"", cbTnpList:[],
  dcCbNumProv:"", dcCbIccid:"",
  cbCambio:false, cbCambioCell:"", cbCambioNumMod:"", cbCambioCodIns:"",
  cbSecurity:false, cbSecurityCell:""
});

const VFCB = ({sd, uP, sc, dupCheck}) => {
  const upv=(k,v)=>uP(k,v);

  const updCbTnpSlot=(slotIdx,updater)=>{
    uP("cbTnpList",prev=>{const list=[...(prev||[])];list[slotIdx]=updater(list[slotIdx]||emTnpSlot());return list;});
  };
  const addCbTnpSlot=()=>{
    uP("cbTnpList",prev=>{const l=prev||[];return l.length<3?[...l,emTnpSlot()]:l;});
  };
  const removeCbTnpSlot=(slotIdx)=>{
    uP("cbTnpList",prev=>{const l=prev||[];const n=[...l];n.splice(slotIdx,1);return n.length?n:[emTnpSlot()];});
  };

  const content = (
    <div>
      {/* ── Toggle orizzontali ── */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
        <button onClick={()=>{upv("cbTnp",!sd.cbTnp);if(!sd.cbTnp)upv("cbTnpList",[emTnpSlot()]);else upv("cbTnpList",[]);}}
          style={{padding:"8px 20px",borderRadius:8,border:sd.cbTnp?"2px solid "+VF_C:"2px solid var(--tf-w100)",background:sd.cbTnp?VF_C:"var(--tf-w40)",color:sd.cbTnp?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>TNP CB</button>
        <button onClick={()=>upv("cbCambio2",!sd.cbCambio2)}
          style={{padding:"8px 20px",borderRadius:8,border:sd.cbCambio2?"2px solid "+VF_C:"2px solid var(--tf-w100)",background:sd.cbCambio2?VF_C:"var(--tf-w40)",color:sd.cbCambio2?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>Cambio Offerta</button>
        <button onClick={()=>upv("cbTraslochi",!sd.cbTraslochi)}
          style={{padding:"8px 20px",borderRadius:8,border:sd.cbTraslochi?"2px solid "+VF_C:"2px solid var(--tf-w100)",background:sd.cbTraslochi?VF_C:"var(--tf-w40)",color:sd.cbTraslochi?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>Traslochi</button>
        <button onClick={()=>upv("cbSecurity",!sd.cbSecurity)}
          style={{padding:"8px 20px",borderRadius:8,border:sd.cbSecurity?"2px solid "+VF_C:"2px solid var(--tf-w100)",background:sd.cbSecurity?VF_C:"var(--tf-w40)",color:sd.cbSecurity?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>Rete Sicura</button>
      </div>
      {sd.cbTnp&&(
        <div style={{marginBottom:12}}>
          <div style={{background:VF_LIGHT,border:"1px solid "+VF_BORDER,borderRadius:8,padding:14,marginBottom:10}}>
            {/* Segnalazione 44: nel primo box il codice contratto non va chiesto,
                servono solo il cellulare del cliente e il codice inserimento. */}
            <div style={{display:"grid",gridTemplateColumns:"1fr",gap:"10px 14px",marginBottom:10}}>
              <TF l="Cellulare cliente" r v={sd.cbCellulare||""} o={v=>upv("cbCellulare",v)} p="3XXXXXXXXX"/>
            </div>
            <SCd session={sc} codici={VF_CODICI_NEGOZIO} val={sd.cbCodIns2||""} onCh={v=>upv("cbCodIns2",v)}/>
          </div>
          {(sd.cbTnpList||[emTnpSlot()]).map((slot,idx)=>(
            <TnpSlot key={idx} slot={slot} idx={idx} total={(sd.cbTnpList||[emTnpSlot()]).length}
              isWallet={false}
              upSlot={(i,k,v)=>updCbTnpSlot(i,k==="__replace__"?()=>v:k==="__fn__"?prev=>v(prev):prev=>({...prev,[k]:v}))}
              onAddSlot={addCbTnpSlot}
              onRemoveSlot={removeCbTnpSlot}/>
          ))}
        </div>
      )}
      {sd.cbCambio2&&(
        <div style={{background:VF_LIGHT,border:"1px solid "+VF_BORDER,borderRadius:8,padding:14,marginBottom:12}}>
          <div style={{marginBottom:10}}>
            <TF l="Numero di Cellulare" r v={sd.cbCambioNumMod||""} o={v=>upv("cbCambioNumMod",v)} p="3XXXXXXXXX"/>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:3}}>Offerta <span style={{color:"var(--tf-dc3545)"}}>*</span></div>
            <div style={{padding:"10px 14px",borderRadius:8,border:"2px solid "+VF_C,background:"rgba(220,53,69,0.12)",color:VF_C,fontWeight:700,fontSize:13}}>MM4M</div>
          </div>
          <SCd session={sc} codici={VF_CODICI_NEGOZIO} val={sd.cbCambioCodIns2||""} onCh={v=>upv("cbCambioCodIns2",v)}/>
        </div>
      )}
      {sd.cbTraslochi&&(
        <div style={{background:VF_LIGHT,border:"1px solid "+VF_BORDER,borderRadius:8,padding:14,marginBottom:12}}>
          <TF l="Numero Fisso" r v={sd.cbTraslochiNum||""} o={v=>upv("cbTraslochiNum",v)} p="06XXXXXXXX"/>
          <div style={{marginTop:10}}>
            <SCd session={sc} codici={VF_CODICI_NEGOZIO} val={sd.cbTraslochiCodIns||""} onCh={v=>upv("cbTraslochiCodIns",v)}/>
          </div>
        </div>
      )}
      {sd.cbSecurity&&(
        <div style={{background:VF_LIGHT,border:"1px solid "+VF_BORDER,borderRadius:8,padding:14,marginTop:0}}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--tf-64748b)",marginBottom:10,textTransform:"uppercase"}}>Dati Rete Sicura CB</div>
          <TF l="Numero di cellulare" r v={sd.cbSecurityCell||""} o={v=>upv("cbSecurityCell",v)} p="3XXXXXXXXX"/>
          <div style={{marginTop:10}}>
            <SCd session={sc} codici={VF_CODICI_NEGOZIO} val={sd.cbSecurityCodIns||""} onCh={v=>upv("cbSecurityCodIns",v)}/>
          </div>
        </div>
      )}
    </div>
  );
  return content;
};


const VFB_MOBILE_TABLETS = ["Samsung Galaxy Tab S9","Samsung Galaxy Tab A9","iPad Pro","iPad Air","iPad","Lenovo Tab P12","Altro tablet"];

const VFBizMobile = ({sd,uP,sc}) => {
  const upv=(k,v)=>uP(k,v);
  const offers=["MOBILE SMART","MOBILE COMFORT","MOBILE EXTRA","ONE BUSINESS SMART MOBILE","ONE BUSINESS COMFORT MOBILE","DATI SMART","DATI COMFORT","RED DATA NOW"];
  const tabletOffers=["DATI SMART","DATI COMFORT","RED DATA NOW"];
  const isTablet=tabletOffers.includes(sd.vfbOffer);
  const deviceList=isTablet?[...VFB_SMARTPHONES_GROUPED,{group:"Tablet",items:VFB_MOBILE_TABLETS}]:VFB_SMARTPHONES_GROUPED;
  const content = (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"var(--tf-64748b)",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Offerta Mobile</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {offers.map(offer=>{
          const isActive=sd.vfbOffer===offer;
          return (
            <button key={offer} onClick={()=>{upv("vfbOffer",isActive?null:offer);if(!isActive){upv("vfbMnp",null);upv("vfbTnp",null);upv("vfbModello","");upv("vfbImei","");upv("vfbEasyRent",null);upv("vfbRataPiva",null);upv("vfbCodIns","");}}}
              style={{padding:"8px 14px",borderRadius:10,border:isActive?"2px solid "+VF_C:"2px solid var(--tf-w100)",background:isActive?VF_C:"var(--tf-w40)",color:isActive?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {offer}
            </button>
          );
        })}
      </div>
      {sd.vfbOffer&&(
        <div>
          <RB label="MNP?" val={sd.vfbMnp} opts={["Sì","No"]} onCh={v=>{upv("vfbMnp",v);if(v==="No"){upv("vfbMnpBrand","");upv("vfbMnpNum","")}}}/>
          {sd.vfbMnp==="Sì"&&(
            <div style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w60)",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Operatore provenienza" r v={sd.vfbMnpBrand||""} o={v=>upv("vfbMnpBrand",v)} vals={VF_BRANDS}/>
                <TF l="Numero Portabilità" r v={sd.vfbMnpNum||""} o={v=>upv("vfbMnpNum",v)} p="3XXXXXXXXX"/>
              </div>
            </div>
          )}
          {sd.vfbMnp&&(
            <div>
              <RB label="TNP?" val={sd.vfbTnp} opts={["Sì","No"]} onCh={v=>{upv("vfbTnp",v);if(v==="No"){upv("vfbModello","");upv("vfbImei","");upv("vfbEasyRent",null);upv("vfbRataPiva",null);}}}/>
              {sd.vfbTnp==="Sì"&&(
                <div style={{background:VF_LIGHT,border:"1px solid "+VF_BORDER,borderRadius:8,padding:14,marginBottom:12}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px",marginBottom:10}}>
                    <DD l="Modello terminale" r v={sd.vfbModello||""} o={v=>upv("vfbModello",v)} vals={deviceList}/>
                    <TF l="IMEI" r v={sd.vfbImei||""} o={v=>upv("vfbImei",v)} p="15 cifre" nt="Barcode 📷"/>
                  </div>
                  <div style={{display:"flex",gap:8,marginBottom:8}}>
                    {["Easy Rent","Rata P.IVA"].map(opt=>{
                      const isOn=sd.vfbRataPiva===opt;
                      return (
                        <button key={opt} onClick={()=>{upv("vfbRataPiva",isOn?null:opt);if(opt!=="Easy Rent"||isOn)upv("vfbKaskoSel",{});}}
                          style={{padding:"7px 18px",borderRadius:8,border:isOn?"2px solid "+VF_C:"2px solid var(--tf-w100)",background:isOn?VF_C:"var(--tf-w40)",color:isOn?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  {sd.vfbRataPiva==="Easy Rent"&&(
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:2}}>
                      {["Kasko Smart","Kasko Comfort","Kasko Extra"].map(k=>{
                        const sel=(sd.vfbKaskoSel||{})[k];
                        return (
                          <button key={k} onClick={()=>{const cur={...(sd.vfbKaskoSel||{})};if(cur[k])delete cur[k];else cur[k]=true;upv("vfbKaskoSel",cur);}}
                            style={{padding:"6px 14px",borderRadius:7,border:sel?"2px solid "+VF_C:"2px solid var(--tf-w100)",background:sel?"rgba(111,66,193,0.12)":"var(--tf-w40)",color:sel?VF_C:"var(--tf-8892b0)",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                            <span>{sel?"☑":"☐"}</span>{k}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <div style={{marginTop:8,background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
                <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
                  <SCd session={sc} codici={VF_CODICI_NEGOZIO} val={sd.vfbCodIns||""} onCh={v=>upv("vfbCodIns",v)}/>
                  <TF l="Numero" v={sd.vfbNum||""} o={v=>upv("vfbNum",v)} p="3XXXXXXXXX"/>
                  <TF l="ICCID" r v={sd.vfbIccid||""} o={v=>upv("vfbIccid",v)} p="8939..." nt="Barcode 📷"/>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
  return content;
};

const VFBizMobileCB = ({sd,uP,sc}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div>
      <div style={{marginBottom:10}}>
        <button onClick={()=>upv("vfbCbOn",!sd.vfbCbOn)}
          style={{padding:"8px 20px",borderRadius:8,border:sd.vfbCbOn?"2px solid "+VF_C:"2px solid var(--tf-w100)",background:sd.vfbCbOn?VF_C:"var(--tf-w40)",color:sd.vfbCbOn?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
          CB
        </button>
      </div>
      {sd.vfbCbOn&&(
        <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
          <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
          <div style={{marginBottom:10}}>
            <TF l="Numero di cellulare" r v={sd.vfbCbCell||""} o={v=>upv("vfbCbCell",v)} p="3XXXXXXXXX"/>
          </div>
          <SCd session={sc} codici={VF_CODICI_NEGOZIO} val={sd.vfbCbCodIns||""} onCh={v=>upv("vfbCbCodIns",v)}/>
        </div>
      )}
    </div>
  );
  return content;
};

const VFBizFisso = ({sd,uP,isCombo,sc}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div>
      {isCombo&&(
        <div>
          <RB label="MNP?" val={sd.vfbFMnp} opts={["Sì","No"]} onCh={v=>{upv("vfbFMnp",v);if(v==="No"){upv("vfbFMnpBrand","");upv("vfbFMnpNum","");}}}/>
          {sd.vfbFMnp==="Sì"&&(
            <div style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w60)",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Operatore provenienza" r v={sd.vfbFMnpBrand||""} o={v=>upv("vfbFMnpBrand",v)} vals={VF_BRANDS}/>
                <TF l="Numero Portabilità" r v={sd.vfbFMnpNum||""} o={v=>upv("vfbFMnpNum",v)} p="3XXXXXXXXX"/>
              </div>
            </div>
          )}
        </div>
      )}
      <RB label="GNP?" val={sd.vfbFGnp} opts={["Sì","No"]} onCh={v=>{upv("vfbFGnp",v);if(v==="No"){upv("vfbFGnpBrand","");upv("vfbFGnpNum","");}}}/>
      {sd.vfbFGnp==="Sì"&&(
        <div style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w100)",borderRadius:8,padding:12,marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
            <DD l="Operatore GNP" r v={sd.vfbFGnpBrand||""} o={v=>upv("vfbFGnpBrand",v)} vals={VF_GNP_BRANDS}/>
            {/* Segnalazione 78: il numero fisso GNP e' anche il definitivo, quindi lo
                riportiamo da solo e non lo si richiede una seconda volta. */}
            <TF l="Numero Fisso GNP" r v={sd.vfbFGnpNum||""} o={v=>{upv("vfbFGnpNum",v);upv("vfbFNumDef",v);}} p="06XXXXXXXX"/>
          </div>
        </div>
      )}
      {sd.vfbFGnp&&(
        <div>
          <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
            <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:12,textTransform:"uppercase"}}>📋 Dati Contratto</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
              <SCd session={sc} codici={VF_CODICI_NEGOZIO} val={sd.vfbFCodIns||""} onCh={v=>upv("vfbFCodIns",v)}/>
              {sd.vfbFGnp==="Sì"?(
                <TF l="N. Fisso Provvisorio" r v={sd.vfbFNumProv||""} o={v=>upv("vfbFNumProv",v)} p="06XXXXXXXX"/>
              ):(
                <TF l="N. Fisso Definitivo" r v={sd.vfbFNumDef||""} o={v=>upv("vfbFNumDef",v)} p="06XXXXXXXX"/>
              )}
              <TF l="ICCID" r v={sd.vfbFIccid||""} o={v=>upv("vfbFIccid",v)} p="8939..." nt="Barcode 📷"/>
              {isCombo&&(
                <TF l="Numero Provvisorio Mobile" r v={sd.vfbFCombNumProv||""} o={v=>upv("vfbFCombNumProv",v)} p="393XXXXXXX"/>
              )}
              {isCombo&&(
                <TF l="ICCID Mobile" r v={sd.vfbFCombIccid||""} o={v=>upv("vfbFCombIccid",v)} p="8939..." nt="Barcode 📷"/>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
  return content;
};

const IL_C = "var(--tf-c00028)";
const IL_MOBILE_OFFERS = ["Iliad Voce","Iliad 120GB","Iliad 180GB","Iliad 250GB","Iliad Dati 350"];
const IL_FISSO_OFFERS = ["Fisso Base","Fisso Plus"];
const IL_GNP_BRANDS = ["TIM","Vodafone","WindTre","Fastweb","Iliad","Sky Mobile","Tiscali","Altro"];
const IL_CODICI_NEGOZIO = ["Magliana","Donna","Garbatella","Promontori","Acilia"];

const IL_BIZ_MOBILE_OFFERS = ["Giga300","Dati180"];

const getIL = (tc) => {
  const biz = tc === "business";
  if(biz) return [
    { id:"mobile", title:"MOBILE", icon:"📱", color:IL_C, radio:true, subs:[
      { id:"ga", title:"MOBILE", isILBizMobile:true, hasContract:true, ct:"ga", fields:[] },
    ]},
  ];
  return [
    { id:"mobile", title:"MOBILE", icon:"📱", color:IL_C, radio:true, subs:[
      { id:"ga", title:"MOBILE", isILMobile:true, hasContract:true, ct:"ga", fields:[] },
    ]},
    { id:"fisso", title:"FISSO", icon:"🏠", color:"var(--tf-28a745)", radio:true, subs:
      IL_FISSO_OFFERS.map(o=>({ id:o.toLowerCase().replace(/ /g,"_"), title:o, isILFisso:true, hasContract:true, ct:"fisso", fields:[] }))
      .concat([{ id:"fwa", title:"FWA", isILFwa:true, hasContract:true, ct:"fisso", fields:[] }])
    },
  ];
};

const ILMobile = ({sd, uP, sc}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"var(--tf-64748b)",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Offerta Mobile</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {IL_MOBILE_OFFERS.map(offer=>{
          const isActive=sd.ilOffer===offer;
          return (
            <button key={offer} onClick={()=>{upv("ilOffer",isActive?null:offer);upv("ilMnp",null);upv("ilDom",null);upv("ilMnpBrand","");upv("ilMnpNum","");upv("ilCodIns","");upv("ilNumProv","");upv("ilNumDef","");upv("ilIccid","");}}
              style={{padding:"8px 14px",borderRadius:10,border:isActive?"2px solid "+IL_C:"2px solid var(--tf-w100)",background:isActive?IL_C:"var(--tf-w40)",color:isActive?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {offer}
            </button>
          );
        })}
      </div>
      {sd.ilOffer&&(
        <div>
          <RB label="MNP?" val={sd.ilMnp} opts={["Sì","No"]} onCh={v=>{upv("ilMnp",v);if(v==="No"){upv("ilMnpBrand","");upv("ilMnpNum","");}}}/>
          {sd.ilMnp==="Sì"&&(
            <div style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w60)",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Operatore provenienza" r v={sd.ilMnpBrand||""} o={v=>upv("ilMnpBrand",v)} vals={IL_GNP_BRANDS}/>
                <TF l="Numero Portabilità" r v={sd.ilMnpNum||""} o={v=>upv("ilMnpNum",v)} p="3XXXXXXXXX"/>
              </div>
            </div>
          )}
          {sd.ilMnp&&<RB label="Domiciliata?" val={sd.ilDom} opts={["Sì","No"]} onCh={v=>upv("ilDom",v)}/>}
          {sd.ilDom&&(
            <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
              <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
                <SCd session={sc} codici={IL_CODICI_NEGOZIO} val={sd.ilCodIns||""} onCh={v=>upv("ilCodIns",v)}/>
                {sd.ilMnp==="Sì"?(
                  <TF l="Numero Provvisorio" r v={sd.ilNumProv||""} o={v=>upv("ilNumProv",v)} p="393XXXXXXX"/>
                ):(
                  <TF l="Numero" r v={sd.ilNumDef||""} o={v=>upv("ilNumDef",v)} p="3XXXXXXXXX"/>
                )}
                <TF l="ICCID" r v={sd.ilIccid||""} o={v=>upv("ilIccid",v)} p="8939..." nt="Barcode 📷"/>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
  return content;
};

const ILFisso = ({sd, uP, sc}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div>
      <RB label="GNP?" val={sd.ilFGnp} opts={["Sì","No"]} onCh={v=>{upv("ilFGnp",v);if(v==="No"){upv("ilFGnpBrand","");upv("ilFGnpNum","");}}}/>
      {sd.ilFGnp&&(
        <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
          <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
            <SCd session={sc} codici={IL_CODICI_NEGOZIO} val={sd.ilFCodIns||""} onCh={v=>upv("ilFCodIns",v)}/>
            {sd.ilFGnp==="Sì"?(
              <TF l="Numero Fisso Provvisorio" r v={sd.ilFNumProv||""} o={v=>upv("ilFNumProv",v)} p="06XXXXXXXX"/>
            ):(
              <TF l="Numero Fisso Definitivo" r v={sd.ilFNumDef||""} o={v=>upv("ilFNumDef",v)} p="06XXXXXXXX"/>
            )}
            {sd.ilFGnp==="Sì"&&(
              <TF l="Numero Fisso Definitivo" r v={sd.ilFNumDef||""} o={v=>upv("ilFNumDef",v)} p="06XXXXXXXX"/>
            )}
          </div>
        </div>
      )}
    </div>
  );
  return content;
};

const ILFwa = ({sd, uP, sc}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
      <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
        <SCd session={sc} codici={IL_CODICI_NEGOZIO} val={sd.ilFwaCodIns||""} onCh={v=>upv("ilFwaCodIns",v)}/>
        <TF l="ICCID" r v={sd.ilFwaIccid||""} o={v=>upv("ilFwaIccid",v)} p="8939..." nt="Barcode 📷"/>
      </div>
    </div>
  );
  return content;
};

// ── ENERGY ──────────────────────────────────────────────────────
const EN_C = "var(--tf-28a745)";
const EN_CODICI_NEGOZIO = negozi;

const getEN = (tc) => {
  return [
    { id:"s4", title:"S4 ENERGIA", icon:"⚡", color:EN_C, radio:false, subs:[
      { id:"s4_luce", title:"Luce", isENLuceGas:true, enBrand:"S4", enProd:"Luce", hasContract:true, ct:"multi", fields:[]},
      { id:"s4_gas", title:"Gas", isENLuceGas:true, enBrand:"S4", enProd:"Gas", hasContract:true, ct:"multi", fields:[]},
    ]},
  ];
};

// ── TIM / VERY / HO ─────────────────────────────────────────────────────
const TIM_SMARTPHONES_GROUPED = [
  {group:"APPLE", items:[
    "APPLE iPhone Air 1TB",
    "APPLE iPhone Air 512GB",
    "APPLE iPhone Air 256GB",
    "APPLE iPhone 17 ProMax 2TB",
    "APPLE iPhone 17 ProMax 1TB",
    "APPLE iPhone 17 ProMax 512GB",
    "APPLE iPhone 17 ProMax 256GB",
    "APPLE iPhone 17 Pro 1TB",
    "APPLE iPhone 17 Pro 512GB",
    "APPLE iPhone 17 Pro 256GB",
    "APPLE iPhone 17 512GB",
    "APPLE iPhone 17 256GB",
    "APPLE iPhone 17E 512GB",
    "APPLE iPhone 17E 256GB",
    "APPLE iPhone 16 Pro Max 512GB",
    "APPLE iPhone 16 Pro Max 256GB",
    "APPLE iPhone 16 Pro 256GB",
    "APPLE iPhone 16 Pro 128GB",
    "APPLE iPhone 16 Plus 256GB",
    "APPLE iPhone 16 Plus 128GB",
    "APPLE iPhone 16 256GB",
    "APPLE iPhone 16 128GB",
    "APPLE iPhone 16E 512GB",
    "APPLE iPhone 16E 256GB",
    "APPLE iPhone 16E 128GB",
    "APPLE iPhone 17e 256GB",
    "APPLE iPhone 17 Pro Max 256GB",
    "APPLE iPhone 17 Pro Max 512GB",
    "APPLE iPhone 17 Pro Max 2TB",
    "APPLE iPhone 16e 128GB"
  ]},
  {group:"SAMSUNG", items:[
    "SAMSUNG Galaxy S26 Ultra 5G 512GB",
    "SAMSUNG Galaxy S26 Ultra 5G 256GB",
    "SAMSUNG Galaxy S26 Plus 5G 512GB",
    "SAMSUNG Galaxy S26 Plus 5G 256GB",
    "SAMSUNG Galaxy S26 5G 512GB",
    "SAMSUNG Galaxy S26 5G 256GB",
    "SAMSUNG Galaxy S25 Ultra 5G 512GB",
    "SAMSUNG Galaxy S25 Ultra 5G 256GB",
    "SAMSUNG Galaxy S25 Edge 512GB",
    "SAMSUNG Galaxy S25 Edge 256GB",
    "SAMSUNG Galaxy S25 Plus 5G 512GB",
    "SAMSUNG Galaxy S25 Plus 5G 256GB",
    "SAMSUNG Galaxy S25 5G 256GB",
    "SAMSUNG Galaxy S25 5G 128GB",
    "SAMSUNG Galaxy S25 FE 256GB",
    "SAMSUNG Galaxy S25 FE 128GB",
    "SAMSUNG Galaxy ZFold7 512GB",
    "SAMSUNG Galaxy ZFold7 256GB",
    "SAMSUNG Galaxy ZFlip7 512GB",
    "SAMSUNG Galaxy ZFlip7 256GB",
    "SAMSUNG Galaxy ZFlip7 FE 256GB",
    "SAMSUNG Galaxy ZFlip7 FE 128GB",
    "SAMSUNG Galaxy A57 256GB",
    "SAMSUNG Galaxy A57 128GB",
    "SAMSUNG Galaxy A56 256GB",
    "SAMSUNG Galaxy A56 128GB EE",
    "SAMSUNG Galaxy A56 128GB",
    "SAMSUNG Galaxy A37 256GB",
    "SAMSUNG Galaxy A37 128GB",
    "SAMSUNG Galaxy A36 256GB",
    "SAMSUNG Galaxy A36 128GB",
    "SAMSUNG Galaxy A34 Enterprise Ed",
    "SAMSUNG Galaxy A26 256GB",
    "SAMSUNG Galaxy A26 128GB",
    "SAMSUNG Galaxy A17 5G 256GB",
    "SAMSUNG Galaxy A17 5G 128GB",
    "SAMSUNG Galaxy A17 4G",
    "SAMSUNG Galaxy A16 5G",
    "SAMSUNG Galaxy A16 4G",
    "SAMSUNG Galaxy A37 5G 256GB",
    "SAMSUNG Galaxy A37 5G 128GB",
    "SAMSUNG Galaxy A57 5G 256GB",
    "SAMSUNG Galaxy S26 256GB",
    "SAMSUNG Galaxy S26 512GB",
    "SAMSUNG Galaxy S26+ 256GB",
    "SAMSUNG Galaxy S26+ 512GB",
    "SAMSUNG Galaxy S26 Ultra 256GB",
    "SAMSUNG Galaxy S26 Ultra 512GB",
    "SAMSUNG Galaxy S26 Ultra 1TB",
    "SAMSUNG Galaxy A17 4G 128GB",
    "SAMSUNG Galaxy A17 4G 256GB",
    "SAMSUNG Galaxy Z Fold7 256GB",
    "SAMSUNG Galaxy Z Fold7 512GB",
    "SAMSUNG Galaxy Z Fold7 1TB",
    "SAMSUNG Galaxy Z Flip7 256GB",
    "SAMSUNG Galaxy Z Flip7 512GB",
    "SAMSUNG Galaxy A56 5G 256GB",
    "SAMSUNG Galaxy A36 5G 128GB",
    "SAMSUNG Galaxy A26 5G 128GB",
    "SAMSUNG Galaxy Z Flip6 256GB"
  ]},
  {group:"MOTOROLA", items:[
    "MOTOROLA Razr 60 Ultra",
    "MOTOROLA Razr 70",
    "MOTOROLA Edge 70 512GB",
    "MOTOROLA Edge 60 Pro",
    "MOTOROLA Edge60 Neo",
    "MOTOROLA Edge 60",
    "MOTOROLA G86 8 256GB",
    "MOTOROLA G85 8 256GB",
    "MOTOROLA G77 + Moto Buds",
    "MOTOROLA G57 5G 256GB",
    "MOTOROLA G37 5G 128GB",
    "MOTOROLA G35 256GB",
    "MOTOROLA G35 128GB",
    "MOTOROLA G17 4G 256GB",
    "MOTOROLA G17 4G 128GB",
    "MOTOROLA G15 128GB",
    "MOTOROLA G06 64GB",
    "MOTOROLA G05 128GB",
    "MOTOROLA Edge 70 Fusion 8+512GB Bundle Watch",
    "MOTOROLA Razr 70 Plus 12+512GB 5G",
    "MOTOROLA Razr Fold 16+512GB 5G",
    "MOTOROLA Signature 16+512GB 5G",
    "MOTOROLA Moto G57 5G 8+256GB",
    "MOTOROLA Edge 70",
    "MOTOROLA Moto G86 5G 8GB+256GB",
    "MOTOROLA Moto G35 5G 4+128GB"
  ]},
  {group:"OPPO", items:[
    "OPPO Find X9 Ultra",
    "OPPO Find X9 Pro",
    "OPPO Reno 15 5G",
    "OPPO Reno 15F 5G",
    "OPPO Reno 14 5G",
    "OPPO Reno 14FS 5G",
    "OPPO Reno 13 Pro",
    "OPPO Reno 13 FS",
    "OPPO Reno 13F",
    "OPPO A6 Pro 5G 256GB",
    "OPPO A5 Pro 5G",
    "OPPO A6 5G 256GB",
    "OPPO A6K 4G 256GB",
    "OPPO A6X 5G 128GB",
    "OPPO A60 5G",
    "OPPO A5 5G",
    "OPPO A5M 4G",
    "OPPO A40 256GB",
    "OPPO A40 128GB",
    "OPPO A5X 4G",
    "OPPO A6 5G, 6+256",
    "OPPO A6X 5G, 4+128",
    "OPPO Reno15 5G, 8+512",
    "OPPO Reno15 F 5G, 8+256"
  ]},
  {group:"REALME", items:[
    "REALME GT7 5G",
    "REALME 14Pro",
    "REALME 14 5G",
    "REALME 14X",
    "REALME C75 4G",
    "REALME C71",
    "REALME C61 4G 128GB",
    "REALME Note 50"
  ]},
  {group:"HONOR", items:[
    "HONOR Magic V5",
    "HONOR Magic V3",
    "HONOR Magic 8 Pro",
    "HONOR Magic 7 Pro",
    "HONOR 600 + Watch",
    "HONOR 400 5G",
    "HONOR Magic 8 Lite + Earbuds X7 Lite",
    "HONOR Magic 7 Lite",
    "HONOR 600 Lite + Buds",
    "HONOR 400 Lite",
    "HONOR 200 Smart",
    "HONOR X6B",
    "HONOR X5C Plus 4G",
    "HONOR 600 8+256GB 5G Bundle Watch",
    "HONOR 600 Lite 8+256GB 5G Bundle Buds",
    "HONOR Magic 8 Lite",
    "HONOR 400 Smart",
    "HONOR 200 Lite 5G"
  ]},
  {group:"ZTE", items:[
    "ZTE Nubia Flip",
    "ZTE Blade A36 4+64 GB",
    "ZTE nubia Air 5G 8+512 GB",
    "ZTE Blade A76 5G (4+128)",
    "ZTE nubia Flip 2",
    "ZTE nubia Focus 2 5G",
    "ZTE Blade A35e (2+64)"
  ]},
  {group:"TCL", items:[
    "TCL K70 5G",
    "TCL 50NextPaper 5G",
    "TCL 60R 5G",
    "TCL NXTPAPER 70 PRO 8+256GB",
    "TCL NXTPAPER 60 Ultra",
    "TCL 501 2+64GB"
  ]},
  {group:"VIVO", items:[
    "VIVO V70 5G 512GB",
    "VIVO V70 FE 5G 256GB",
    "VIVO Y31 5G 256GB",
    "VIVO V70 5G",
    "VIVO V70 5G FE",
    "VIVO Y21 5G",
    "VIVO X300"
  ]},
  {group:"ALTRO", items:[
    "APPLE Watch S11 Titanium 46mm",
    "APPLE Watch S11 Titanium 42mm",
    "APPLE Watch S11 Aluminium 46mm",
    "APPLE Watch S11 Aluminium 42mm",
    "APPLE Watch10 46mm",
    "APPLE Watch10 42mm",
    "APPLE AirPods Pro3",
    "APPLE AirPods 4",
    "SAMSUNG Watch7 Ultra",
    "SAMSUNG Watch7",
    "SAMSUNG Buds3",
    "GOOGLE Watch3 45mm",
    "GOOGLE Watch3 41mm",
    "GOOGLE Buds Pro",
    "Altro",
    "APPLE AirTag (2nd generation)",
    "RAY-BAN META Gen2 Wayfarer Sun Polar_ Matte Black",
    "RAY-BAN META Gen2 Wayfarer Transitions_Shiny Black",
    "RAY-BAN META Gen2 Wayfarer Transitions_Matte Black",
    "RAY-BAN META Gen2 Wayfarer Sun Plano_Shiny Black",
    "SAMSUNG Galaxy Buds4",
    "MOTOROLA moto tag 2",
    "ZYXEL FWA indoor 5G Zyxel NR5309",
    "TP-LINK FWA indoor 5G TP-LINK NX620v",
    "GREENPACKET FWA H5 + TH-40M",
    "TP-LINK CAM TC72",
    "EZVIZ CAM TY1 3M",
    "SAMSUNG Galaxy Buds3 FE",
    "OAKLEY META Vanguard (Matte Black)",
    "SAMSUNG Galaxy Tab S11 5G (12GB / 128GB)",
    "SAMSUNG Galaxy Tab S10 Lite 5G (6GB / 128GB)",
    "APPLE Air Pods Pro 3",
    "APPLE Watch Series 11 46mm",
    "ZTE WebPocket. 4G+ (ZTE U20)",
    "RAY-BAN META Wayfarer (Shiny Black/Green)",
    "RAY-BAN META Wayfarer (Matte Black/Grey)",
    "RAY-BAN META Wayfarer Large (Matte Black/Grey)",
    "SAMSUNG Galaxy Watch8 Classic 46mm BT",
    "APPLE iPad 11 128GB",
    "APPLE AirTag",
    "APPLE iPad 11 256GB",
    "TELSEY W52 5G",
    "TCL Onetouch 5041",
    "TCL Internet Key TCL IK41",
    "SAMSUNG Galaxy Watch7 44mm BT",
    "SAMSUNG Galaxy Buds3",
    "APPLE Watch 10 46mm",
    "APPLE AirPods 4 con cancellazione attiva del rumore",
    "TCL Onetouch 5023 + ECO SIM",
    "TCL WebPocket. 4G+ (TCL)",
    "ALCATEL Internet Key Alcatel IK41",
    "EZVIZ Lampadina Ezviz LB1",
    "EZVIZ C6N"
  ]},
  {group:"XIAOMI", items:[
    "XIAOMI 17T Pro 12+512 GB + Redmi Pad 2",
    "XIAOMI 17T 12+256 GB + Redmi Pad 2",
    "XIAOMI 17T Pro 12+512 GB",
    "XIAOMI 17T 12+256 GB",
    "XIAOMI 17 Ultra",
    "XIAOMI 17 Ultra 5G 512GB + Photo Kit",
    "XIAOMI Redmi Note 15 5G 8+256",
    "XIAOMI Redmi Note 15 Pro 5G 8+256",
    "XIAOMI Redmi Note 15 Pro+ 5G 8+256",
    "XIAOMI Redmi 15C 5G 4+128GB",
    "XIAOMI Redmi 15 5G 8+256GB"
  ]}
];
const TIM_C = "var(--tf-0050ff)";
const TIM_MOBILE_OFFERS = ["Tim Mobile","Tim Power Supreme Orange","Tim Power Supreme Red"];
const TIM_FISSO_OFFERS = ["Fibra","Fwa"];
const TIM_VISION_TAGLIE = ["Tim Vision S","Tim Vision M","Tim Vision L"];
const TIM_CODICI_NEGOZIO = ["Collatina"];
const VERY_C = "var(--tf-1fa300)";
const HO_C = "var(--tf-e6007e)";
const VERY_CODICI_NEGOZIO = ["Donna","Promontori","Garbatella"];
const HO_CODICI_NEGOZIO = ["Collatina","Donna","Magliana","Promontori"];
const KENA_C = "var(--tf-f5a623)";
// Segnalazione 68: per Kena l'unico codice che deve comparire e' Collatina.
// Preso dall'elenco unico condiviso con Ricerca Contratto, cosi' non possono
// piu' divergere.
const KENA_CODICI_NEGOZIO = CODICI_KENA;
const FASCIA_OPTS = ["< 6,99 €","> 6,99 €"];

const getTIM = (tc) => {
  const biz = tc === "business";
  if(biz) return [];
  return [
    { id:"mobile", title:"MOBILE", icon:"📱", color:TIM_C, radio:true, subs:[
      { id:"ga", title:"MOBILE", isTimMobile:true, hasContract:true, ct:"ga", fields:[] },
    ]},
    { id:"fisso", title:"FISSO", icon:"🏠", color:"var(--tf-28a745)", radio:true, subs:[
      { id:"ga", title:"FISSO", isTimFisso:true, hasContract:true, ct:"fisso", fields:[] },
    ]},
    { id:"multi", title:"MULTI-SERVIZI", icon:"🧩", color:"var(--tf-6f42c1)", radio:false, subs:[
      { id:"telepass", title:"Telepass", isTimTelepass:true, hasContract:true, ct:"multi", fields:[] },
    ]},
  ];
};

const TIMMobile = ({sd, uP, sc}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"var(--tf-64748b)",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Offerta Mobile</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {TIM_MOBILE_OFFERS.map(offer=>{
          const isActive=sd.timOffer===offer;
          return (
            <button key={offer} onClick={()=>{upv("timOffer",isActive?null:offer);if(isActive){upv("timMnp",null);upv("timMnpBrand","");upv("timMnpNum","");upv("timTnp",null);upv("timModello","");upv("timSpedizione",null);upv("timFinanziato",null);upv("timCodPratica","");upv("timVisionBox",null);upv("timVisionTaglia",null);upv("timVisionNumContr","");upv("timImei","");upv("timNumProv","");upv("timNum","");upv("timIccid","");upv("timCodIns","");}}}
              style={{padding:"8px 14px",borderRadius:10,border:isActive?"2px solid "+TIM_C:"2px solid var(--tf-w100)",background:isActive?TIM_C:"var(--tf-w40)",color:isActive?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>{offer}</button>
          );
        })}
      </div>
      {sd.timOffer&&(
        <div>
          <RB label="MNP?" val={sd.timMnp} opts={["Sì","No"]} onCh={v=>{upv("timMnp",v);if(v==="No"){upv("timMnpBrand","");upv("timMnpNum","");}}}/>
          {sd.timMnp==="Sì"&&(
            <div style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w60)",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Operatore provenienza" r v={sd.timMnpBrand||""} o={v=>upv("timMnpBrand",v)} vals={brandMNP}/>
                <TF l="Numero Portabilità" r v={sd.timMnpNum||""} o={v=>upv("timMnpNum",v)} p="3XXXXXXXXX"/>
              </div>
            </div>
          )}
          {sd.timMnp&&<RB label="TNP?" val={sd.timTnp} opts={["Sì","No"]} onCh={v=>{upv("timTnp",v);if(v==="No"){upv("timModello","");upv("timSpedizione",null);upv("timFinanziato",null);upv("timCodPratica","");upv("timImei","");}}}/>}
          {sd.timTnp==="Sì"&&(
            <div style={{background:VF_LIGHT,border:"1px solid rgba(0,114,198,0.3)",borderRadius:8,padding:14,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px",marginBottom:10}}>
                <DD l="Modello terminale" r v={sd.timModello||""} o={v=>upv("timModello",v)} vals={TIM_SMARTPHONES_GROUPED}/>
              </div>
              <RB label="Spedizione?" val={sd.timSpedizione} opts={["Sì","No"]} onCh={v=>upv("timSpedizione",v)}/>
              <RB label="Finanziato?" val={sd.timFinanziato} opts={["Sì","No"]} onCh={v=>{upv("timFinanziato",v);if(v==="No")upv("timCodPratica","");}}/>
              {sd.timFinanziato==="Sì"&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px",marginTop:4}}>
                  <TF l="Codice Pratica" r v={sd.timCodPratica||""} o={v=>upv("timCodPratica",v)} p="es. PR123456"/>
                </div>
              )}
            </div>
          )}
          {sd.timTnp&&<RB label="Box TIM Vision?" val={sd.timVisionBox} opts={["Sì","No"]} onCh={v=>{upv("timVisionBox",v);if(v==="No"){upv("timVisionTaglia",null);upv("timVisionNumContr","");}}}/>}
          {sd.timVisionBox==="Sì"&&(
            <div style={{background:"rgba(111,66,193,0.12)",border:"1px solid rgba(111,66,193,0.3)",borderRadius:8,padding:14,marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--tf-6f42c1)",marginBottom:8,textTransform:"uppercase"}}>TIM Vision <span style={{color:"var(--tf-dc3545)"}}>*</span></div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                {TIM_VISION_TAGLIE.map(t=>{const on=sd.timVisionTaglia===t;return <button key={t} onClick={()=>upv("timVisionTaglia",on?null:t)} style={{padding:"7px 16px",borderRadius:8,border:on?"2px solid #6f42c1":"2px solid var(--tf-w100)",background:on?"var(--tf-6f42c1)":"var(--tf-w40)",color:on?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>{t}</button>;})}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <TF l="Numero Contratto" r v={sd.timVisionNumContr||""} o={v=>upv("timVisionNumContr",v)} p="N. contratto Vision"/>
              </div>
            </div>
          )}
          {sd.timTnp&&(
            <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
              <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
                <SCd session={sc} codici={TIM_CODICI_NEGOZIO} val={sd.timCodIns||""} onCh={v=>upv("timCodIns",v)}/>
                {sd.timMnp==="Sì"?(
                  <TF l="Numero Provvisorio" r v={sd.timNumProv||""} o={v=>upv("timNumProv",v)} p="393XXXXXXX"/>
                ):(
                  <TF l="Numero" v={sd.timNum||""} o={v=>upv("timNum",v)} p="3XXXXXXXXX"/>
                )}
                <TF l="ICCID" r v={sd.timIccid||""} o={v=>upv("timIccid",v)} p="8939..." nt="Barcode 📷"/>
                {sd.timSpedizione==="No"&&<TF l="IMEI" r v={sd.timImei||""} o={v=>upv("timImei",v)} p="15 cifre" nt="Barcode 📷"/>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
  return content;
};

const TIMFisso = ({sd, uP, sc}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"var(--tf-64748b)",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Prodotto Fisso</div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {TIM_FISSO_OFFERS.map(offer=>{const isActive=sd.timFOffer===offer;return (
          <button key={offer} onClick={()=>{upv("timFOffer",isActive?null:offer);if(isActive){upv("timFGnp",null);upv("timFGnpBrand","");upv("timFGnpNum","");upv("timFNumProv","");upv("timFCodIns","");upv("timFVision",null);upv("timFVisionTaglia",null);upv("timFVisionNumContr","");}}}
            style={{padding:"8px 18px",borderRadius:10,border:isActive?"2px solid "+TIM_C:"2px solid var(--tf-w100)",background:isActive?TIM_C:"var(--tf-w40)",color:isActive?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>{offer}</button>
        );})}
      </div>
      {sd.timFOffer&&(
        <div>
          <RB label="GNP?" val={sd.timFGnp} opts={["Sì","No"]} onCh={v=>{upv("timFGnp",v);if(v==="No"){upv("timFGnpBrand","");upv("timFGnpNum","");}}}/>
          {sd.timFGnp==="Sì"&&(
            <div style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w100)",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Operatore GNP" r v={sd.timFGnpBrand||""} o={v=>upv("timFGnpBrand",v)} vals={GNP_FISSO_BRANDS}/>
                <TF l="Numero Fisso Portabilità" r v={sd.timFGnpNum||""} o={v=>upv("timFGnpNum",v)} p="06XXXXXXXX"/>
              </div>
            </div>
          )}
          {sd.timFGnp&&(
            <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14,marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
                <TF l="Numero Fisso Provvisorio" r v={sd.timFNumProv||""} o={v=>upv("timFNumProv",v)} p="06XXXXXXXX"/>
                <SCd session={sc} codici={TIM_CODICI_NEGOZIO} val={sd.timFCodIns||""} onCh={v=>upv("timFCodIns",v)}/>
              </div>
            </div>
          )}
          {sd.timFGnp&&<RB label="TIM Vision?" val={sd.timFVision} opts={["Sì","No"]} onCh={v=>{upv("timFVision",v);if(v==="No"){upv("timFVisionTaglia",null);upv("timFVisionNumContr","");}}}/>}
          {sd.timFVision==="Sì"&&(
            <div style={{background:"rgba(111,66,193,0.12)",border:"1px solid rgba(111,66,193,0.3)",borderRadius:8,padding:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--tf-6f42c1)",marginBottom:8,textTransform:"uppercase"}}>TIM Vision <span style={{color:"var(--tf-dc3545)"}}>*</span></div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                {TIM_VISION_TAGLIE.map(t=>{const on=sd.timFVisionTaglia===t;return <button key={t} onClick={()=>upv("timFVisionTaglia",on?null:t)} style={{padding:"7px 16px",borderRadius:8,border:on?"2px solid #6f42c1":"2px solid var(--tf-w100)",background:on?"var(--tf-6f42c1)":"var(--tf-w40)",color:on?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>{t}</button>;})}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <TF l="Numero Contratto" r v={sd.timFVisionNumContr||""} o={v=>upv("timFVisionNumContr",v)} p="N. contratto Vision"/>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
  return content;
};

const TIMTelepass = ({sd, uP, sc}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div>
      <RB label="Twin?" val={sd.timTpTwin} opts={["Sì","No"]} onCh={v=>upv("timTpTwin",v)}/>
      {sd.timTpTwin&&(
        <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
          <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
            <TF l="Seriale Telepass" r v={sd.timTpSeriale||""} o={v=>upv("timTpSeriale",v)} p="Seriale"/>
            <TF l="Recapito Cliente" r v={sd.timTpRecapito||""} o={v=>upv("timTpRecapito",v)} p="Tel/Email"/>
            <SCd session={sc} codici={TIM_CODICI_NEGOZIO} val={sd.timTpCodIns||""} onCh={v=>upv("timTpCodIns",v)}/>
          </div>
        </div>
      )}
    </div>
  );
  return content;
};

const getVERY = (tc) => (tc==="business")?[]:[
  { id:"mobile", title:"MOBILE", icon:"📱", color:VERY_C, radio:true, subs:[
    { id:"ga", title:"MOBILE", isVeryMobile:true, hasContract:true, ct:"ga", fields:[] },
  ]},
];
const getHO = (tc) => (tc==="business")?[]:[
  { id:"mobile", title:"MOBILE", icon:"📱", color:HO_C, radio:true, subs:[
    { id:"ga", title:"MOBILE", isHoMobile:true, hasContract:true, ct:"ga", fields:[] },
  ]},
];
// Segnalazione 68: Kena Mobile segue il flusso identico a Ho Mobile.
// Dojo: brand POS — consumer e business, prodotti della categoria POS
const DOJO_CODICI_NEGOZIO=[];
const getDOJO = () => [
  { id:"pos", title:"POS", icon:"🏧", color:"var(--tf-14b8a6)", radio:false, subs:[
    { id:"pos_dojo", title:"POS Dojo", hasContract:true, ct:"multi", fields:[]},
  ]},
];

const getKena = (tc) => (tc==="business")?[]:[
  { id:"mobile", title:"MOBILE", icon:"📱", color:KENA_C, radio:true, subs:[
    { id:"ga", title:"MOBILE", isKenaMobile:true, hasContract:true, ct:"ga", fields:[] },
  ]},
];

const SimpleMobile = ({sd, uP, pfx, accent, codici, sc}) => {
  const upv=(k,v)=>uP(k,v);
  const K=(s)=>pfx+s;
  const offSel=sd[K("Offer")];
  const content = (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"var(--tf-64748b)",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Tipologia offerta</div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <button onClick={()=>{const on=offSel==="MOBILE";upv(K("Offer"),on?null:"MOBILE");if(on){upv(K("Mnp"),null);upv(K("MnpBrand"),"");upv(K("MnpNum"),"");upv(K("RicaricaAuto"),null);upv(K("Fascia"),null);upv(K("CodIns"),"");upv(K("NumProv"),"");upv(K("Num"),"");upv(K("Iccid"),"");}}}
          style={{padding:"8px 22px",borderRadius:10,border:offSel==="MOBILE"?"2px solid "+accent:"2px solid var(--tf-w100)",background:offSel==="MOBILE"?accent:"var(--tf-w40)",color:offSel==="MOBILE"?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>MOBILE</button>
      </div>
      {offSel&&(
        <div>
          <RB label="MNP?" val={sd[K("Mnp")]} opts={["Sì","No"]} onCh={v=>{upv(K("Mnp"),v);if(v==="No"){upv(K("MnpBrand"),"");upv(K("MnpNum"),"");}}}/>
          {sd[K("Mnp")]==="Sì"&&(
            <div style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w60)",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Operatore provenienza" r v={sd[K("MnpBrand")]||""} o={v=>upv(K("MnpBrand"),v)} vals={brandMNP}/>
                <TF l="Numero Portabilità" r v={sd[K("MnpNum")]||""} o={v=>upv(K("MnpNum"),v)} p="3XXXXXXXXX"/>
              </div>
            </div>
          )}
          {sd[K("Mnp")]&&<RB label="Ricarica Automatica?" val={sd[K("RicaricaAuto")]} opts={["Sì","No"]} onCh={v=>upv(K("RicaricaAuto"),v)}/>}
          {sd[K("RicaricaAuto")]&&(
            <div style={{marginBottom:12}}>
              <DD l="Tipologia offerta" r v={sd[K("Fascia")]||""} o={v=>upv(K("Fascia"),v)} vals={FASCIA_OPTS}/>
            </div>
          )}
          {sd[K("RicaricaAuto")]&&(
            <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
              <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
                <SCd session={sc} codici={codici} val={sd[K("CodIns")]||""} onCh={v=>upv(K("CodIns"),v)}/>
                {sd[K("Mnp")]==="Sì"?(
                  <TF l="Numero Provvisorio" r v={sd[K("NumProv")]||""} o={v=>upv(K("NumProv"),v)} p="393XXXXXXX"/>
                ):(
                  <TF l="Numero" v={sd[K("Num")]||""} o={v=>upv(K("Num"),v)} p="3XXXXXXXXX"/>
                )}
                <TF l="ICCID" r v={sd[K("Iccid")]||""} o={v=>upv(K("Iccid"),v)} p="8939..." nt="Barcode 📷"/>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
  return content;
};


const ILBizMobile = ({sd, uP, sc}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"var(--tf-64748b)",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Offerta Mobile</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {IL_BIZ_MOBILE_OFFERS.map(offer=>{
          const isActive=sd.ilBizOffer===offer;
          return (
            <button key={offer} onClick={()=>{upv("ilBizOffer",isActive?null:offer);upv("ilBizMnp",null);upv("ilBizMnpBrand","");upv("ilBizDom",null);upv("ilBizNum","");upv("ilBizIccid","");upv("ilBizNumDef","");upv("ilBizCodIns","");}}
              style={{padding:"8px 18px",borderRadius:10,border:isActive?"2px solid "+IL_C:"2px solid var(--tf-w100)",background:isActive?IL_C:"var(--tf-w40)",color:isActive?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {offer}
            </button>
          );
        })}
      </div>
      {sd.ilBizOffer&&(
        <div>
          <RB label="MNP?" val={sd.ilBizMnp} opts={["Sì","No"]} onCh={v=>{upv("ilBizMnp",v);if(v==="No"){upv("ilBizMnpBrand","");}}}/>
          {sd.ilBizMnp==="Sì"&&(
            <div style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w60)",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Operatore provenienza" r v={sd.ilBizMnpBrand||""} o={v=>upv("ilBizMnpBrand",v)} vals={IL_GNP_BRANDS}/>
                <TF l="Numero Definitivo" r v={sd.ilBizNumDef||""} o={v=>upv("ilBizNumDef",v)} p="3XXXXXXXXX"/>
              </div>
            </div>
          )}
          {sd.ilBizMnp&&(
            <div>
              <RB label="Domiciliata?" val={sd.ilBizDom} opts={["Sì","No"]} onCh={v=>upv("ilBizDom",v)}/>
              {sd.ilBizDom&&(
                <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14,marginTop:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
                    <SCd session={sc} codici={IL_CODICI_NEGOZIO} val={sd.ilBizCodIns||""} onCh={v=>upv("ilBizCodIns",v)}/>
                    <TF l="Numero Provvisorio" r v={sd.ilBizNum||""} o={v=>upv("ilBizNum",v)} p="3XXXXXXXXX"/>
                    <TF l="ICCID" r v={sd.ilBizIccid||""} o={v=>upv("ilBizIccid",v)} p="8939..." nt="Barcode 📷"/>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
  return content;
};

const W3SostSim = ({sd, uP, sc, dupCheck}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
      <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>🔄 Sostituzione SIM — Dati Contratto</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
        <TF l="Numero" r v={sd.w3SostCell||""} o={v=>upv("w3SostCell",v)} p="3XXXXXXXXX"/>
        <TF l="ICCID" r v={sd.w3SostIccid||""} o={v=>upv("w3SostIccid",v)} p="19 cifre" nt="Barcode 📷"/>
        <TF l="Codice Contratto" r v={sd.w3SostCodContr||""} o={v=>upv("w3SostCodContr",v)} p="Codice contratto"/>
        <SCd session={sc} codici={codiciW3} val={sd.w3SostCodIns||""} onCh={v=>upv("w3SostCodIns",v)}/>
      </div>
    </div>
  );
  return content;
};

// Sostituzione SIM Fastweb (segnalazione 34): stessi campi della versione WindTre.
const FWSostSim = ({sd, uP, sc, dupCheck}) => {
  const upv=(k,v)=>uP(k,v);
  return (
    <div style={{background:"rgba(204,153,0,0.10)",border:"1px solid rgba(204,153,0,0.25)",borderRadius:8,padding:14}}>
      <div style={{fontSize:11,fontWeight:700,color:"var(--tf-cc9900)",marginBottom:10,textTransform:"uppercase"}}>🔄 Sostituzione SIM — Dati Contratto</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
        <TF l="Numero" r v={sd.fwSostCell||""} o={v=>upv("fwSostCell",v)} p="3XXXXXXXXX"/>
        <TF l="ICCID" r v={sd.fwSostIccid||""} o={v=>upv("fwSostIccid",v)} p="8939..." nt="Barcode 📷"/>
        <SCd session={sc} codici={FW_CODICI_NEGOZIO} val={sd.fwSostCodIns||""} onCh={v=>upv("fwSostCodIns",v)}/>
      </div>
    </div>
  );
};

const VFSostSim = ({sd, uP, sc}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
      <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>🔄 Sostituzione SIM — Dati Contratto</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
        <TF l="Numero" r v={sd.vfSostCell||""} o={v=>upv("vfSostCell",v)} p="3XXXXXXXXX"/>
        <SCd session={sc} codici={VF_CODICI_NEGOZIO} val={sd.vfSostCodIns||""} onCh={v=>upv("vfSostCodIns",v)}/>
      </div>
    </div>
  );
  return content;
};

const ENLuceGas = ({sd, uP, sub, dupCheck, sc}) => {
  const upv=(k,v)=>uP(k,v);
  const isLuce = sub.enProd==="Luce"||sub.enProd==="LuceRID";
  const content = (
    <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:14}}>
      <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto — {sub.enBrand} {sub.title}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
        <SCd session={sc} codici={EN_CODICI_NEGOZIO} val={sd.enCodIns||""} onCh={v=>upv("enCodIns",v)}/>
        <DD l="Operatore provenienza" r v={sd.enProv||""} o={v=>upv("enProv",v)} vals={opProv}/>
        {isLuce?(
          <TF l="POD" r v={sd.enPod||""} o={v=>upv("enPod",v)} p="IT001E..." err={dupCheck&&dupCheck("POD",sd.enPod)?"POD già inserito in questo contratto":""}/>
        ):(
          <TF l="PDR" r v={sd.enPdr||""} o={v=>upv("enPdr",v)} p="14 cifre" err={dupCheck&&dupCheck("PDR",sd.enPdr)?"PDR già inserito in questo contratto":""}/>
        )}
      </div>
    </div>
  );
  return content;
};


const FIXED_NUM_KEYS={num_fisso_prov:1,cbTraslochiNum:1,num_fisso_def:1,vfFNumProv:1,vfFNumDef:1,vfFNumProvVisorio:1,fwFNumProv:1,fwFNumDef:1,ilFNumProv:1,ilFNumDef:1,timFNumProv:1,vfbFNumProv:1,vfbFNumDef:1,vfFGnpNum:1,fwFGnpNum:1,ilFGnpNum:1,timFGnpNum:1,vfbFGnpNum:1,gnpNum:1,gnp2LNum:1,vfNumFisso:1};
const MK_NUM={dcNumProv:1,dcNum:1,vfMnpNum:1,dcCbNumProv:1,cbCambioNumMod:1,fwNumProv:1,fwNumDef:1,fwMnpNum:1,ilNumProv:1,ilNumDef:1,ilMnpNum:1,ilBizNum:1,ilBizNumDef:1,timNumProv:1,timNum:1,timMnpNum:1,timFNumProv:1,veryNumProv:1,veryNum:1,veryMnpNum:1,hoNumProv:1,hoNum:1,hoMnpNum:1,vfbNum:1,vfbMnpNum:1,vfbFNumProv:1,vfbFNumDef:1,vfbFMnpNum:1,vfbFCombNumProv:1,vfFNumProv:1,vfFNumDef:1,vfFNumProvVisorio:1,numProvv:1,numDef:1,numProv:1,numero:1,mobNumProv:1,mobNumDef:1,mobNum:1,w3SostCell:1,vfSostCell:1};
const MK_IMEI={tnpImei:1,cbTnpImei:1,rfImei:1,vfbImei:1,timImei:1,imei:1};
const _bNum=(v)=>{const s=String(v||"");return s.length>0&&(s.length<9||s.length>10||/\D/.test(s));};
const _bNumFx=(v)=>{const s=String(v||"");return s.length>0&&(s.length<7||s.length>11||/\D/.test(s));};
const _bIc=(v)=>{const s=String(v||"");return s.length>0&&(s.length!==19||/\D/.test(s));};
const _bIm=(v)=>{const s=String(v||"");return s.length>0&&(s.length!==15||/[^A-Za-z0-9]/.test(s));};
const _bPod=(v)=>{const s=String(v||"").toUpperCase();return s.length>0&&(s.length<14||s.length>15||!/^IT/.test(s)||/[^A-Z0-9]/.test(s));};
const _bPdr=(v)=>{const s=String(v||"");return s.length>0&&(s.length!==14||/\D/.test(s));};
const _subHasInvalid=(d)=>{let bad=false;const ck=(o)=>{if(!o||typeof o!=="object")return;Object.keys(o).forEach(k=>{const val=o[k];if(val&&typeof val==="object"){if(Array.isArray(val)){val.forEach(it=>{if(it&&typeof it==="object"){if(_bIm(it.imei))bad=true;if(_bIm(it.imei2))bad=true;if(Array.isArray(it.compassItems))it.compassItems.forEach(ci=>{if(ci&&_bIm(ci.imei))bad=true;if(ci&&_bIm(ci.imei2))bad=true;});}});}else{ck(val);}return;}if(/iccid/i.test(k)){if(_bIc(val))bad=true;}else if(MK_IMEI[k]||/imei/i.test(k)){if(_bIm(val))bad=true;}else if(/pdr/i.test(k)){if(_bPdr(val))bad=true;}else if(/pod/i.test(k)){if(_bPod(val))bad=true;}else if(FIXED_NUM_KEYS[k]){if(_bNumFx(val))bad=true;}else if(MK_NUM[k]||/tel|cell|phone/i.test(k)){if(_bNum(val))bad=true;}});};ck(d);return bad;};
const _NE=(v)=>v!==undefined&&v!==null&&String(v).trim()!=="";
const _vfRigaOk=(r,modo)=>{if(modo==="Entrambi"){if(!r.tipo)return false;if(r.tipo==="Bundle")return _NE(r.codice)&&_NE(r.tipoBundleVal);return _NE(r.imei2)&&_NE(r.valore);}if(modo==="Bundle")return _NE(r.codice)&&_NE(r.tipoBundleVal);if(modo==="Accessorio")return _NE(r.imei2)&&_NE(r.valore);return true;};
const _vfCompassOk=(it)=>{if(!_NE(it.codicePratica))return false;if(it.bundleOn||it.accessorioOn){const modo=it.bundleOn&&it.accessorioOn?"Entrambi":it.bundleOn?"Bundle":"Accessorio";const righe=it.righe||[];if(!righe.length||!righe.every(r=>_vfRigaOk(r,modo)))return false;}return true;};
const _vfSlotOk=(s)=>{if(!s||!s.tipo)return false;if(TNP_TAGLIA_OPTS.indexOf(s.tipo)>=0)return _NE(s.modello)&&_NE(s.imei);if(COMPASS_OPTS.indexOf(s.tipo)>=0||s.tipo==="Forward"){const items=(s.compassItems&&s.compassItems.length)?s.compassItems:[];if(!items.length)return false;return items.every(_vfCompassOk);}return true;};
const _vfTnpListOk=(list)=>Array.isArray(list)&&list.length>0&&list.every(_vfSlotOk);
const _vfStartedSlotsOk=(list)=>!Array.isArray(list)||list.filter(s=>s&&s.tipo).every(_vfSlotOk);
// ══ FLUSSO CATALOGO A 6 LIVELLI (aggancio 27/07): UN componente per TUTTI i
// brand al posto degli 11 flussi cablati. Brand > Tipo Cliente > Categoria >
// Prodotto arrivano dai gruppi (tabelle catalog_*); qui si scelgono Offerta
// (una sola) e Opzioni (multiple; gruppo "¹" = una sola del gruppo, es.
// Reload; opzioni a quantità), poi i CAMPI dallo strato dati dell'artifatto
// (risolviCampi). Grafica: gli stessi TF/DD/SCd del flusso storico.
const _sesRef={v:""}; // codice sessione corrente (per il fallback Cod.Ins. in subComplete)
const _codiciDi=(pageBrand)=>pageBrand==="vodafone"?VF_CODICI_NEGOZIO:pageBrand==="fastweb"?FW_CODICI_NEGOZIO:pageBrand==="iliad"?IL_CODICI_NEGOZIO:pageBrand==="energy"?EN_CODICI_NEGOZIO:pageBrand==="tim"?TIM_CODICI_NEGOZIO:pageBrand==="very"?VERY_CODICI_NEGOZIO:pageBrand==="ho"?HO_CODICI_NEGOZIO:pageBrand==="kena"?KENA_CODICI_NEGOZIO:pageBrand==="dojo"?DOJO_CODICI_NEGOZIO:pageBrand==="sky"?SKY_CODICI_NEGOZIO:codiciW3;
const _sceltaVals=(nome,categoria)=>{
  if(nome==="Operatore di Provenienza")return categoria==="Energia"?opProv:brandMNP;
  if(nome==="Operatore GNP")return GNP_FISSO_BRANDS;
  if(nome==="GNP")return ["Sì","No"];
  return [];
};
// TELEFONO A RATE su nuova attivazione (Luca 01/08): il telefono venduto a
// rate FUORI customer base sta quasi sempre sul mobile appena registrato —
// invece di far ridigitare codice contratto e numero, si propone l'aggancio
// al mobile della selezione/carrello e i due campi si compilano da soli.
// Restano da chiedere solo IMEI, modello, importo rata e codice pratica.
const MOBILE_CATS_AGGANCIO=["Mobile Wallet","Mobile Ric. Auto"];
const _numeroMobile=(v)=>String(v["Numero di Cellulare"]||v["Numero Definitivo"]||v["Numero Provvisorio"]||"").trim();
const mobiliAgganciabili=(cats,sales,cart,brandId)=>{
  const out=[];
  // selezione corrente: TUTTI i gruppi (il mobile sta in "Mobile Ric. Auto"/
  // "Mobile Wallet", il telefono a rate in un ALTRO gruppo)
  (cats||[]).forEach(g=>((sales||{})[g.id]||[]).forEach((row,ri)=>{if(!row)return;(g.subs||[]).forEach(s2=>{
    const d=row[s2.id];if(!(d&&d.active)||!s2.isCatalogo)return;
    if(!MOBILE_CATS_AGGANCIO.includes(s2.catCategoria))return;
    const f=d.fields||{};
    const codice=String(f["Codice Contratto"]||"").trim();
    const numero=_numeroMobile(f);
    // proposta Francesco 10/08: l'aggancio riporta anche il codice inserimento
    const codIns=String(f["Codice Inserimento"]||"").trim();
    if(codice||numero)out.push({etichetta:`${s2.catProdotto} #${ri+1}${numero?" · "+numero:""}`,codice,numero,codIns});
  });}));
  // mobile gia' nel CARRELLO dello stesso brand
  (cart||[]).forEach(gr=>{if(gr.brandId!==brandId)return;(gr.items||[]).forEach(it=>{
    if(!MOBILE_CATS_AGGANCIO.includes(it.catalogo?.categoria))return;
    const det=it.details||{};
    const codice=String(det["Codice Contratto"]||"").trim();
    const numero=_numeroMobile(det);
    const codIns=String(det["Codice Inserimento"]||"").trim();
    if(codice||numero)out.push({etichetta:`${it.catalogo?.prodotto||"Mobile"} (carrello)${numero?" · "+numero:""}`,codice,numero,codIns});
  });});
  // dedup su codice+numero (stesso mobile visto due volte)
  const visti=new Set();
  return out.filter(m=>{const k=m.codice+"|"+m.numero;if(visti.has(k))return false;visti.add(k);return true;});
};
// ── BUNDLE / ACCESSORI / KASKO (Luca 07/08, segnalazione collaboratore) ────
// Tetto CONDIVISO: (somma quantità Bundle) + (quantità Accessori) ≤ 3 — al
// raggiungimento il 4° elemento si blocca. Il Kasko è FUORI dal tetto.
// Ogni unità genera il suo campo nei Dati Contratto: "Codice bundle N" /
// "Imei Accessorio N" / "Seriale Kasko" (obbligatori, numerazione progressiva).
const MAX_BUNDLE_ACC=3;
const _opzKasko=(n)=>/kasko/i.test(n);
const _opzBundle=(n)=>!_opzKasko(n)&&/bundle/i.test(n);
const _opzAccessorio=(n)=>!_opzKasko(n)&&/accessori/i.test(n);
const _qtaOpz=(v)=>v===true?1:Math.max(1,parseInt(v,10)||1);
const contaVincolate=(opz)=>{let t=0;Object.keys(opz||{}).forEach(k=>{if(!opz[k])return;if(_opzBundle(k)||_opzAccessorio(k))t+=_qtaOpz(opz[k]);});return t;};
const campiDinamiciOpzioni=(opz)=>{
  const out=[];let nA=0,kasko=false;
  Object.keys(opz||{}).forEach(k=>{
    if(!opz[k])return;
    if(_opzKasko(k)){kasko=true;return;}
    if(_opzBundle(k)){
      // ETICHETTA PARLANTE (correzione Luca 07/08): il campo dice QUALE bundle —
      // "Codice Bundle 99.99"; più unità dello stesso tipo → "(1)", "(2)", …
      const q=_qtaOpz(opz[k]);
      for(let i=1;i<=q;i++)out.push({nome:"Codice "+k+(q>1?" ("+i+")":""),tipo:"testo",nota:"",conferma:false});
    }
    else if(_opzAccessorio(k))nA+=_qtaOpz(opz[k]);
  });
  for(let i=1;i<=nA;i++)out.push({nome:"Imei Accessorio "+i,tipo:"testo",nota:"",conferma:false});
  if(kasko)out.push({nome:"Seriale Kasko",tipo:"testo",nota:"",conferma:false});
  return out;
};
// campi base + dinamici, senza doppioni (una regola a DB potrebbe già definirli)
const campiConOpzioni=(base,opz)=>{const noti=new Set(base.map(c=>c.nome));return [...base,...campiDinamiciOpzioni(opz).filter(c=>!noti.has(c.nome))];};

const CatalogoSub=({sub,sd,uF,gid,si,sc,color,mobili})=>{
  const f=sd.fields||{};
  const off=f["Offerta"]||"";
  const offerte=sub.catOfferte||[];
  const offSel=offerte.find(o=>o.nome===off)||null;
  const opz=f.__opzioni||{};
  const attive=Object.keys(opz).filter(k=>opz[k]);
  const setF=(k,v)=>uF(gid,si,sub.id,k,v);
  const pickOff=(v)=>{setF("Offerta",v);setF("__opzioni",{});};
  const togOpz=(o)=>{const cur=!!opz[o.nome];const next={...opz};
    if(cur){delete next[o.nome];}
    else{
      // TETTO 3 condiviso Bundle+Accessori (il Kasko non conta)
      if((_opzBundle(o.nome)||_opzAccessorio(o.nome))&&contaVincolate(opz)>=MAX_BUNDLE_ACC)return;
      if(o.gruppo){(offSel?offSel.opzioni:[]).forEach(x=>{if(x.gruppo===o.gruppo)delete next[x.nome];});}
      // Bundle e Accessori hanno SEMPRE la quantità (Luca 07/08, Regola 1):
      // il contatore appare anche se l'opzione a catalogo non è tipo "numero"
      next[o.nome]=(o.tipo==="numero"||_opzBundle(o.nome)||_opzAccessorio(o.nome))?1:true;}
    setF("__opzioni",next);};
  const _vinc=contaVincolate(opz);
  const _haVincolabili=(offSel?offSel.opzioni:[]).some(o=>_opzBundle(o.nome)||_opzAccessorio(o.nome));
  const campi=campiConOpzioni(risolviCampi(sub.catBrand,sub.catTipo,sub.catCategoria,sub.catProdotto,off,attive),opz);
  // RV-05: la tendina "Operatore GNP" si lega a f["GNP"] SOLO se tra i campi c'e'
  // davvero il campo GNP Si'/No (fisso VFB, mig. 152); quando arriva dall'OPZIONE
  // GNP del catalogo (W3/VF/FW/Sky) deve comparire sempre ed essere obbligatoria.
  const hasCampoGnp=campi.some(c=>/^gnp$/i.test(c.nome));
  const pageBrand=sub.catBrand==="s4"?"energy":sub.catBrand;
  const codici=_codiciDi(pageBrand);
  // MOD-15 (Luca 10/08): SIMULATORE PESO VOLUMETRICO per le spedizioni Kipoint
  // a fasce di peso (offerte "TBASE a-b kg"). pesoTassabile = max(pesoReale,
  // h×l×p/6000) → seleziona la fascia con setF DIRETTO (non pickOff: azzererebbe
  // le opzioni già scelte — i nomi opzione sono identici su tutte le fasce).
  const fasceKg=offerte.map(o=>({o,r:_fasciaKg(o.nome)})).filter(x=>x.r).sort((a,b)=>a.r.min-b.r.min);
  const isKipointSped=sub.catBrand==="kipoint"&&sub.catCategoria==="Spedizioni"&&fasceKg.length>=2;
  const _spNum=(x)=>{const v=parseFloat(String(x??"").replace(",","."));return isFinite(v)&&v>0?v:null;};
  const sp=f.__sped||{};
  const _spVol=(()=>{const h=_spNum(sp.h),l=_spNum(sp.l),p=_spNum(sp.p);return (h&&l&&p)?h*l*p/6000:null;})();
  const _spTass=(()=>{const kg=_spNum(sp.kg);return (_spVol!=null||kg!=null)?Math.max(_spVol||0,kg||0):null;})();
  const _spOltre=isKipointSped&&_spTass!=null&&fasceKg.length>0&&_spTass>fasceKg[fasceKg.length-1].r.max;
  const upSped=(k,v)=>{
    const nx={...sp,[k]:v};setF("__sped",nx);
    const h=_spNum(nx.h),l=_spNum(nx.l),p=_spNum(nx.p),kg=_spNum(nx.kg);
    const vol=(h&&l&&p)?h*l*p/6000:null;
    const tass=(vol!=null||kg!=null)?Math.max(vol||0,kg||0):null;
    if(tass==null||!fasceKg.length)return;
    const last=fasceKg[fasceKg.length-1];
    const hit=fasceKg.find(x=>tass>=x.r.min&&tass<x.r.max)||((tass>=last.r.min&&tass<=last.r.max)?last:null);
    if(hit){
      setF("Offerta",hit.o.nome);
      setF("Peso tassabile (kg)",String(Math.round(tass*100)/100));
      if(kg)setF("Peso reale (kg)",String(kg));
      if(h&&l&&p)setF("Dimensioni (cm)",h+"×"+l+"×"+p);
    }
  };
  return (<div>
    {isKipointSped&&(
      <div style={{marginTop:6,padding:"10px 12px",background:"rgba(10,88,202,0.08)",borderRadius:8,border:"1px dashed rgba(10,88,202,0.55)"}}>
        <div style={{fontSize:12,fontWeight:700,color:"var(--tf-60a5fa)",marginBottom:6}}>⚖️ Simulatore peso volumetrico <span style={{fontWeight:400,color:"var(--tf-64748b)"}}>(H×L×P ÷ 6000 vs peso reale: vince il maggiore)</span></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(70px,1fr))",gap:"8px 12px",maxWidth:520}}>
          <TF l="Altezza (cm)" v={sp.h||""} o={v=>upSped("h",v)} p="es. 30"/>
          <TF l="Larghezza (cm)" v={sp.l||""} o={v=>upSped("l",v)} p="es. 40"/>
          <TF l="Profondità (cm)" v={sp.p||""} o={v=>upSped("p",v)} p="es. 20"/>
          <TF l="Peso reale (kg)" v={sp.kg||""} o={v=>upSped("kg",v)} p="es. 3,5"/>
        </div>
        {_spTass!=null&&(
          <div style={{marginTop:8,fontSize:12,fontWeight:700,color:_spOltre?"var(--tf-fbbf24)":"var(--tf-34d399)"}}>
            {_spVol!=null&&<span>Volumetrico {Math.round(_spVol*100)/100} kg · </span>}
            Tassabile <span style={{fontSize:14}}>{Math.round(_spTass*100)/100} kg</span>
            {_spOltre
              ? <span> — ⚠️ oltre l'ultima fascia ({fasceKg[fasceKg.length-1].r.max} kg): spedizione a preventivo</span>
              : off?<span> → {off}</span>:null}
          </div>
        )}
      </div>
    )}
    {offerte.length>0&&(
      /* Bottoni fino a 14 offerte, tendina oltre (Luca 10/08: VF privato GA/MNP
         Wallet e GA Ric. Auto hanno 13-14 offerte e devono mostrare i bottoni
         come MNP Ric. Auto; i muri da 24-36 offerte — W3 MNP — restano tendina) */
      offerte.length>14
        ? <div style={{marginTop:6,maxWidth:420}}><DD l="Offerta" r v={off} o={pickOff} vals={offerte.map(o=>o.nome)}/></div>
        : <div style={{marginTop:6}}>
            <div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:4}}>Offerta <span style={{color:"var(--tf-dc3545)"}}>*</span></div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {offerte.map(o=><button key={o.nome} onClick={()=>pickOff(off===o.nome?"":o.nome)} style={{padding:"8px 14px",borderRadius:8,cursor:"pointer",border:off===o.nome?"2px solid "+color:"2px solid var(--tf-w100)",background:off===o.nome?color:"var(--tf-w40)",color:off===o.nome?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:600}}>{o.nome}</button>)}
            </div>
          </div>
    )}
    {offSel&&offSel.opzioni.length>0&&(
      <div style={{marginTop:10}}>
        <div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:4}}>Opzioni <span style={{fontWeight:400,color:"var(--tf-64748b)"}}>(facoltative{offSel.opzioni.some(o=>o.gruppo)?" · ¹ una sola per gruppo":""})</span>{_haVincolabili&&<span style={{fontWeight:700,color:_vinc>=MAX_BUNDLE_ACC?"var(--tf-fbbf24)":"var(--tf-64748b)",marginLeft:8}}>Bundle+Accessori: {_vinc}/{MAX_BUNDLE_ACC}</span>}</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {offSel.opzioni.map(o=>{const on=!!opz[o.nome];
            const bloccata=!on&&(_opzBundle(o.nome)||_opzAccessorio(o.nome))&&_vinc>=MAX_BUNDLE_ACC;
            return(
            <span key={o.nome} style={{display:"inline-flex",alignItems:"center",gap:6}}>
              <button onClick={()=>togOpz(o)} disabled={bloccata} title={bloccata?"Massimo "+MAX_BUNDLE_ACC+" elementi tra Bundle e Accessori":undefined} className={on?"opz-on":undefined} style={{padding:"6px 12px",borderRadius:999,cursor:bloccata?"not-allowed":"pointer",opacity:bloccata?0.35:1,border:on?"2px solid "+color:"1px solid var(--tf-w150)",background:on?color+"26":"var(--tf-w30)",color:on?"#fff":"var(--tf-8892b0)",fontSize:11,fontWeight:700}}>{on?"✓ ":""}{o.nome}{o.gruppo?" ¹":""}</button>
              {on&&(o.tipo==="numero"||_opzBundle(o.nome)||_opzAccessorio(o.nome))&&<input type="number" min="1" max={(_opzBundle(o.nome)||_opzAccessorio(o.nome))?(MAX_BUNDLE_ACC-(_vinc-_qtaOpz(opz[o.nome]))):undefined} value={opz[o.nome]===true?1:opz[o.nome]} onChange={e=>{let q=Math.max(1,parseInt(e.target.value||"1",10)||1);
                if(_opzBundle(o.nome)||_opzAccessorio(o.nome)){const altre=_vinc-_qtaOpz(opz[o.nome]);q=Math.max(1,Math.min(q,MAX_BUNDLE_ACC-altre));}
                setF("__opzioni",{...opz,[o.nome]:q});}} style={{width:64,padding:"5px 8px",borderRadius:6,border:"1px solid var(--tf-w150)",fontSize:12,background:"var(--tf-w40)",color:"var(--tf-f8fafc)"}}/>}
            </span>);})}
        </div>
      </div>
    )}
    {sub.catCategoria==="Telefono a Rate"&&!/\bCB\b/i.test(sub.catProdotto)&&(mobili||[]).length>0&&(!_NE(f["Codice Contratto"])||!_NE(f["Numero di Cellulare"]))&&(
      <div style={{marginTop:10,padding:"10px 12px",background:"rgba(111,66,193,0.08)",borderRadius:8,border:"1px dashed rgba(111,66,193,0.55)"}}>
        <div style={{fontSize:12,fontWeight:700,color:"var(--tf-a78bfa)",marginBottom:6}}>📎 Nuova attivazione: vuoi agganciarlo al mobile che stai registrando?</div>
        <div style={{fontSize:10,color:"var(--tf-8892b0)",marginBottom:8}}>Codice contratto, numero e codice inserimento si compilano da soli — restano da inserire solo IMEI, modello, rata e pratica di finanziamento.</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {(mobili||[]).map((m,mi)=>(
            <button key={mi} onClick={()=>{if(m.codice)setF("Codice Contratto",m.codice);if(m.numero)setF("Numero di Cellulare",m.numero);if(m.codIns)setF("Codice Inserimento",m.codIns);}}
              style={{padding:"7px 14px",borderRadius:8,border:"2px solid rgba(111,66,193,0.7)",background:"rgba(111,66,193,0.18)",color:"var(--tf-c4b5fd)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              ✓ Aggancia a {m.etichetta}
            </button>
          ))}
        </div>
      </div>
    )}
    {(offerte.length===0||off)&&campi.length>0&&(
      <div style={{marginTop:10,padding:10,background:"var(--tf-w30)",borderRadius:8,border:"1px solid var(--tf-w100)"}}>
        <div style={{fontSize:11,fontWeight:700,color,marginBottom:8,textTransform:"uppercase"}}>📄 Dati contratto</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px"}}>
          {campi.map(cmp=>{
            if(cmp.nome==="Codice Inserimento")return <SCd key={cmp.nome} session={sc} codici={codici} val={f[cmp.nome]||""} onCh={v=>setF(cmp.nome,v)}/>;
            if(/^gnp$/i.test(cmp.nome))return <DD key={cmp.nome} l={cmp.nome} r={!cmp.facoltativo} v={f[cmp.nome]||""} o={v=>{setF(cmp.nome,v);if(v!=="Sì")setF("Operatore GNP","");}} vals={["Sì","No"]} nt={cmp.nota||undefined}/>;
            if(/^operatore gnp$/i.test(cmp.nome)&&hasCampoGnp&&(f["GNP"]||"")!=="Sì")return null;
            // CAT-02: se la regola porta i suoi valori (jsonb valori:[…]) vincono quelli, altrimenti il lookup storico
            if(cmp.tipo==="scelta")return <DD key={cmp.nome} l={cmp.nome} r={!cmp.facoltativo} v={f[cmp.nome]||""} o={v=>setF(cmp.nome,v)} vals={Array.isArray(cmp.valori)&&cmp.valori.length?cmp.valori:_sceltaVals(cmp.nome,sub.catCategoria)} nt={cmp.nota||undefined}/>;
            if(cmp.tipo==="data")return (<div key={cmp.nome}><div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:3}}>{cmp.nome} {!cmp.facoltativo&&<span style={{color:"var(--tf-dc3545)"}}>*</span>}</div><input type="date" value={f[cmp.nome]||""} onChange={e=>setF(cmp.nome,e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12,boxSizing:"border-box",background:"var(--tf-w40)",color:"var(--tf-f8fafc)"}}/>{cmp.nota&&<div style={{fontSize:10,color:"var(--tf-64748b)",marginTop:2}}>{cmp.nota}</div>}</div>);
            if(cmp.nome==="Modello Terminale")return <DD key={cmp.nome} l={cmp.nome} r={!cmp.facoltativo} v={f[cmp.nome]||""} o={v=>setF(cmp.nome,v)} vals={SOLO_ALTRO} cerca={cercaTerminali} nt={cmp.nota||undefined}/>;
            if(/mobile di convergenza/i.test(cmp.nome))return (
              <div key={cmp.nome}>
                <TF l={cmp.nome} r={!cmp.facoltativo} v={f[cmp.nome]||""} o={v=>setF(cmp.nome,v)} p="3XXXXXXXXX" nt={cmp.nota||undefined}/>
                {/* AGGANCIO SMART (03/08): se in questa vendita c'e' gia' un
                    numero mobile, si propone — un click e la convergenza e' fatta */}
                {_numeriMobiliVendita.filter(n=>n!==(f[cmp.nome]||"")).length>0&&(
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
                    {_numeriMobiliVendita.filter(n=>n!==(f[cmp.nome]||"")).slice(0,4).map(n=>(
                      <button key={n} type="button" onClick={()=>setF(cmp.nome,n)}
                        title="Numero mobile trovato in questa vendita: clicca per agganciarlo alla convergenza"
                        style={{padding:"4px 10px",borderRadius:999,border:"1px solid rgba(52,211,153,0.5)",background:"rgba(52,211,153,0.10)",color:"var(--tf-34d399)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                        📱 Aggancia {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
            // MOD-15: l'indirizzo del destinatario esige il NUMERO CIVICO —
            // avviso qui + blocco vero in subComplete (civicoMancante)
            if(/^indirizzo destinatario$/i.test(cmp.nome))return (
              <div key={cmp.nome}>
                <TF l={cmp.nome} r={!cmp.facoltativo} v={f[cmp.nome]||""} o={v=>setF(cmp.nome,v)} p="Via Roma 12"/>
                {_NE(f[cmp.nome])&&civicoMancante(String(f[cmp.nome]))&&<div style={{fontSize:10,color:"var(--tf-fbbf24)",marginTop:2}}>⚠️ Manca il numero civico (es. "Via Roma 12")</div>}
              </div>
            );
            return <TF key={cmp.nome} l={cmp.nome} r={!cmp.facoltativo} v={f[cmp.nome]||""} o={v=>setF(cmp.nome,v)} p={cmp.nota||""}/>;
          })}
        </div>
      </div>
    )}
  </div>);
};

const subComplete=(sub,d)=>{
  if(!d)return false;
  const F=(k)=>_NE(d[k]);
  const C=d.contract||{};
  const CF=(k)=>_NE(C[k]);
  // CATALOGO 6 LIVELLI: offerta obbligatoria (se il prodotto ne ha) + tutti i
  // campi dello strato dati; Cod.Ins. soddisfatto anche dal codice sessione.
  if(sub.isCatalogo){
    const f=d.fields||{};
    if((sub.catOfferte||[]).length&&!_NE(f["Offerta"]))return false;
    const _opz=f.__opzioni||{};
    const _att=Object.keys(_opz).filter(k=>_opz[k]);
    const _campi=campiConOpzioni(risolviCampi(sub.catBrand,sub.catTipo,sub.catCategoria,sub.catProdotto,f["Offerta"]||"",_att),_opz);
    for(const cmp of _campi){
      if(cmp.nome==="Codice Inserimento"){if(!_NE(f[cmp.nome])&&!_NE(_sesRef.v))return false;}
      else if(/^operatore gnp$/i.test(cmp.nome)){
        // RV-05 (speculare al render): senza campo GNP la tendina e' sempre
        // dovuta; col campo GNP resta legata a f["GNP"]==="Sì"
        const _hasG=_campi.some(c=>/^gnp$/i.test(c.nome));
        if((!_hasG||(f["GNP"]||"")==="Sì")&&!cmp.facoltativo&&!_NE(f[cmp.nome]))return false;
      }
      else if(!cmp.facoltativo&&!_NE(f[cmp.nome]))return false;
    }
    // MOD-15: spedizioni Kipoint — l'indirizzo del destinatario senza numero
    // civico tiene la vendita "Incompleta" (stesso criterio del cliente)
    if(sub.catBrand==="kipoint"&&sub.catCategoria==="Spedizioni"){
      const _ind=f["Indirizzo Destinatario"];
      if(_NE(_ind)&&civicoMancante(String(_ind)))return false;
    }
    return true;
  }
  // VODAFONE privato GA
  if(sub.isVFMobile){
    if(!F("vfOffer"))return false;
    const dv=d.vfOffer==="DOLCE VITA"||d.vfOffer==="DOLCE VITA+";
    // DATI: SIM dati, si valida solo il box Dati Contratto (Numero, ICCID, Codice).
    if(VF_DIRECT_OFFERS.includes(d.vfOffer)){return F("dcNum")&&F("dcIccid")&&F("dcCodIns");}
    if(!dv){if(d.vfMnp==null)return false;if(d.vfMnp==="Sì"&&!(F("vfMnpBrand")&&F("vfMnpNum")))return false;if(d.vfDomicilio==null)return false;if(d.vfConvergenza==null)return false;if(d.vfConvergenza==="Sì"&&!F("vfNumFisso"))return false;if(d.vfTnp==null)return false;if(d.vfSecurity==null)return false;}
    if(d.vfTnp==="Sì"){if(!_vfTnpListOk(d.vfTnpList))return false;}
    if(d.vfMnp==="Sì"){if(!F("dcNumProv"))return false;}else{if(!F("dcNum"))return false;}
    if(!F("dcIccid"))return false;
    if(d.vfDomicilio==="Smart"&&d.dcRicaricaAuto==null)return false;
    return true;
  }
  if(sub.isCBVF){ // VF CB privato: almeno un'azione completa
    let any=false;
    if(d.cbTnp===true){any=true;if(!F("cbCellulare"))return false;if(!_vfTnpListOk(d.cbTnpList))return false;}
    if(d.cbCambio2===true){any=true;if(!F("cbCambioNumMod"))return false;}
    if(d.cbSecurity===true){any=true;if(!F("cbSecurityCell"))return false;}
    if(d.cbTraslochi===true){any=true;if(!F("cbTraslochiNum"))return false;}
    return any;
  }
  if(sub.isAssicBiz){return _NE((d.fields||{}).assicBizSel);}
  if(sub.isProtecta){if(sub.isBizProtecta)return _NE(d.protectaCodIns);return _NE((d.fields||{}).protectaKit);}
  if(sub.isVerisure){return true;}
  if(sub.isKaskoFacile){const f=d.fields||{};return _NE(f.kfImei)&&_NE(f.kfTelefono)&&_NE(f.kfSeriale)&&_NE(f.kfTipologia);}
  if(sub.isVFCare){const f=d.fields||{};return _NE(f.vcTelefono)&&_NE(f.vcImei);}
  if(sub.isVFBizMobile){
    if(!F("vfbOffer"))return false;
    if(d.vfbMnp==="Sì"&&!(F("vfbMnpBrand")&&F("vfbMnpNum")))return false;
    if(d.vfbTnp==null)return false;
    if(d.vfbTnp==="Sì"&&!(F("vfbModello")&&F("vfbImei")&&_NE(d.vfbRataPiva)))return false;
    if(d.vfbCbOn&&!F("vfbCbCell"))return false;
    if(!F("vfbIccid")||!F("vfbCodIns"))return false;
    return true;
  }
  if(sub.isVFFisso){return F("vfFCodIns");}
  if(sub.isVFFissoBiz){return F("vfbFCodIns")&&(F("vfbFNumProv")||F("vfbFNumDef"));}
  if(sub.isVFSolDig){return F("vfSolDigCodIns");}
  if(sub.isVFSostSim){return F("vfSostCell")&&F("vfSostCodIns");}
  if(sub.isW3SostSim){return F("w3SostCell")&&F("w3SostIccid")&&F("w3SostCodContr")&&F("w3SostCodIns");}
  // Segnalazione 34 (commento): "Codice contratto non va richiesto".
  if(sub.isFWSostSim){return F("fwSostCell")&&F("fwSostIccid")&&F("fwSostCodIns");}
  // FASTWEB
  if(sub.isFWMobile){if(!F("fwOffer"))return false;const isMnp=(d.fwMnp!=null)?(d.fwMnp==="Sì"):(!!d.fwOffer&&d.fwOffer.indexOf("MNP")>=0);if(isMnp&&!(F("fwMnpBrand")&&F("fwMnpNum")))return false;return F("fwCodIns")&&F("fwIccid")&&(isMnp?F("fwNumProv"):(F("fwNumDef")||F("fwNumProv")));}
  if(sub.isFWFisso){if(d.fwFGnp==="Sì"&&!(F("fwFGnpBrand")&&F("fwFGnpNum")))return false;return F("fwFCodIns")&&(F("fwFNumProv")||F("fwFNumDef"));}
  if(sub.isFWEnergia){const gas=sub.title==="GAS";return F("fwEnCodIns")&&(gas?F("fwPdr"):F("fwPod"));}
  // ILIAD
  if(sub.isILMobile){if(!F("ilOffer"))return false;if(d.ilMnp==null)return false;if(d.ilMnp==="Sì"&&!(F("ilMnpBrand")&&F("ilMnpNum")))return false;if(d.ilDom==null)return false;return F("ilCodIns")&&F("ilIccid")&&(F("ilNumProv")||F("ilNumDef"));}
  if(sub.isILBizMobile){if(d.ilBizMnp==="Sì"&&!F("ilBizMnpBrand"))return false;return F("ilBizCodIns")&&F("ilBizIccid")&&(F("ilBizNum")||F("ilBizNumDef"));}
  if(sub.isILFisso){if(d.ilFGnp==null)return false;if(d.ilFGnp==="Sì")return F("ilFCodIns")&&F("ilFNumProv")&&F("ilFNumDef");return F("ilFCodIns")&&F("ilFNumDef");}
  if(sub.isILFwa){return F("ilFwaCodIns")&&F("ilFwaIccid");}
  // TIM
  if(sub.isTimMobile){if(!F("timOffer"))return false;if(d.timMnp==null)return false;if(d.timMnp==="Sì"&&!(F("timMnpBrand")&&F("timMnpNum")))return false;if(d.timTnp==null)return false;if(d.timTnp==="Sì"){if(!F("timModello"))return false;if(d.timSpedizione==null)return false;if(d.timFinanziato==null)return false;if(d.timFinanziato==="Sì"&&!F("timCodPratica"))return false;}if(d.timVisionBox==null)return false;if(d.timVisionBox==="Sì"&&!(F("timVisionTaglia")&&F("timVisionNumContr")))return false;if(!F("timCodIns")||!F("timIccid"))return false;if(d.timMnp==="Sì"?!F("timNumProv"):!F("timNum"))return false;if(d.timSpedizione==="No"&&!F("timImei"))return false;return true;}
  if(sub.isTimFisso){if(!F("timFOffer"))return false;if(d.timFGnp==null)return false;if(d.timFGnp==="Sì"&&!(F("timFGnpBrand")&&F("timFGnpNum")))return false;if(!F("timFNumProv")||!F("timFCodIns"))return false;if(d.timFVision==null)return false;if(d.timFVision==="Sì"&&!(F("timFVisionTaglia")&&F("timFVisionNumContr")))return false;return true;}
  if(sub.isTimTelepass){if(d.timTpTwin==null)return false;return F("timTpSeriale")&&F("timTpRecapito")&&F("timTpCodIns");}
  if(sub.isVeryMobile){if(!F("veryOffer")||d.veryMnp==null)return false;if(d.veryMnp==="Sì"&&!(F("veryMnpBrand")&&F("veryMnpNum")))return false;if(d.veryRicaricaAuto==null||!F("veryFascia"))return false;return F("veryCodIns")&&F("veryIccid")&&(d.veryMnp==="Sì"?F("veryNumProv"):F("veryNum"));}
  if(sub.isHoMobile){if(!F("hoOffer")||d.hoMnp==null)return false;if(d.hoMnp==="Sì"&&!(F("hoMnpBrand")&&F("hoMnpNum")))return false;if(d.hoRicaricaAuto==null||!F("hoFascia"))return false;return F("hoCodIns")&&F("hoIccid")&&(d.hoMnp==="Sì"?F("hoNumProv"):F("hoNum"));}
  if(sub.isKenaMobile){if(!F("kenaOffer")||d.kenaMnp==null)return false;if(d.kenaMnp==="Sì"&&!(F("kenaMnpBrand")&&F("kenaMnpNum")))return false;if(d.kenaRicaricaAuto==null||!F("kenaFascia"))return false;return F("kenaCodIns")&&F("kenaIccid")&&(d.kenaMnp==="Sì"?F("kenaNumProv"):F("kenaNum"));}
  // ENERGY
  if(sub.isENLuceGas){const luce=sub.enProd==="Luce"||sub.enProd==="LuceRID";return F("enCodIns")&&(luce?F("enPod"):F("enPdr"));}
  // WINDTRE Mobile GA
  if(sub.isMobile){
    const f=d.fields||{};
    if(d.tipMob==null)return false;
    const isUnd=d.tipMob==="Underground";
    if(!isUnd&&d.mnp==null)return false;
    if(d.easyPay==null)return false;
    if(sub.mobOffers&&!_NE(f.offerta))return false;
    if(d.easyPay==="Sì"||d.easyPay===true){
      if(d.tnpGa==null)return false;
      if(d.tnpGa==="Sì"||d.tnpGa===true){
        if(!_NE(d.tnpTipo))return false;
        if(!String(d.tnpTipo).startsWith("Finanziamento")){if(!_NE(d.tnpModello)||!_NE(d.tnpImei))return false;}
        if(d.packAccessori===true&&!(_NE(d.packAccessoriVal)&&_NE(d.packAccessoriQta)))return false;
        if(d.tnpGaReload==null)return false;
        if((d.tnpGaReload==="Sì"||d.tnpGaReload===true)&&!(d.tnpGaReloadSel&&Object.keys(d.tnpGaReloadSel).some(k=>d.tnpGaReloadSel[k])))return false;
      }
      if((d.tnpGa==="No"||d.tnpGa===false)&&d.reloadForever==null)return false;
    }
    // Il box "Dati contratto" non veniva MAI controllato: i campi erano segnati
    // obbligatori a schermo ma il contratto si salvava lo stesso, finendo in
    // Ricerca Contratto senza Codice contratto (segnalato su WindTre MOBILE).
    if(sub.ct==="ga"){
      const cc=d.contract||{};
      if(!_NE(cc.codice_contratto)||!_NE(cc.num_provvisorio)||!_NE(cc.iccid))return false;
      const isMnp=(d.mnp===true||d.mnp==="Sì");
      if(isMnp&&!sub.isMobileBiz&&(!_NE(cc.num_definitivo)||!_NE(cc.brand_mnp)))return false;
      if(isMnp&&sub.isMobileBiz&&!_NE(cc.num_definitivo))return false;
    }
    return true;
  }
  // WINDTRE Mobile Business
  if(sub.isMobileBiz){
    const f=d.fields||{};
    if(d.mnp==null)return false;
    if(sub.bizOffers&&!_NE(f.offerta))return false;
    if(d.tnpGa==null)return false;
    if((d.tnpGa==="Sì"||d.tnpGa===true)&&!_NE(d.tnpTipo))return false;
    // stesso controllo del box "Dati contratto" (vedi mobile privato)
    if(sub.ct==="ga"){
      const cc=d.contract||{};
      if(!_NE(cc.codice_contratto)||!_NE(cc.num_provvisorio)||!_NE(cc.iccid))return false;
      if((d.mnp===true||d.mnp==="Sì")&&!_NE(cc.num_definitivo))return false;
    }
    return true;
  }
  // WINDTRE CB (privato): almeno un'azione completa
  if(sub.isCB){
    let any=false;
    if(d.cbTnp===true){any=true;if(!(_NE(d.cbTnpCell)&&_NE(d.cbTnpCC)&&_NE(d.cbTnpCodIns)))return false;if(_NE(d.cbTnpTipo)&&!String(d.cbTnpTipo).startsWith("Finanziamento")){if(!_NE(d.cbTnpModello)||!_NE(d.cbTnpImei))return false;}if(d.cbTnpReload==null)return false;if(d.cbTnpReload===true&&!(d.cbTnpReloadSel&&Object.keys(d.cbTnpReloadSel).some(k=>d.cbTnpReloadSel[k])))return false;}
    if(d.cbCambio===true){any=true;if(!_NE(d.cbCambioVal))return false;if(!(_NE(d.cbCambioCell)&&_NE(d.cbCambioCodIns)))return false;const _needCC=["Caring","CL0","CL1","CL2","CL3"].indexOf(d.cbCambioVal)<0;if(_needCC&&!_NE(d.cbCambioCC))return false;}
    if(d.cbRf===true){any=true;if(!(_NE(d.rfModello)&&_NE(d.rfImei)&&_NE(d.cbRfCodIns)))return false;}
    if(d.cbAddon===true){any=true;const _addCod=_NE(d.cbAddonCodIns)||_NE(d.cbTnpCodIns)||_NE(d.cbCambioCodIns);if(!(d.cbAddonSel&&Object.keys(d.cbAddonSel).some(k=>d.cbAddonSel[k]))||!_addCod)return false;if(d.cbAddonSel&&d.cbAddonSel["Security"]&&!_NE(d.cbAddonSecCell))return false;if(d.cbAddonSel&&d.cbAddonSel["Reload Open"]&&!(_NE(d.cbAddonRoCell)&&_NE(d.cbAddonRoImei)))return false;}
    return any;
  }
  if(sub.isFisso){const _isVC=sub.isVoceCasa||(sub.hasVoceCasaQ&&(d.voceCasaCb===true||d.voceCasaCb==="Sì"));if(_isVC&&!(CF("codice_contratto")&&CF("num_fisso_prov")&&CF("imei")))return false;if(sub.hasFwaImei&&!CF("imei"))return false;if(sub.has2LQ&&(d.secondaLinea===true||d.secondaLinea==="Sì")){if(d.gnp2L==null)return false;if((d.gnp2L==="Sì"||d.gnp2L===true)&&!(_NE(d.gnp2LBrand)&&_NE(d.gnp2LNum)))return false;}return true;}
  if(sub.id==="luce"){return CF("pod");}
  if(sub.id==="gas"){return CF("pdr");}
  // default: completo se ci sono dettagli (flussi senza campi testuali obbligatori specifici)
  return Object.keys(extractDetails(d)).length>0;
};
const subBadge=(d,dupFn,sub,missing)=>{
  if(!d||!d.active)return null;
  const det=extractDetails(d);
  const n=Object.keys(det).length;
  const _truthy=(o)=>o&&Object.keys(o).some(k=>{const v=o[k];return v!==null&&v!==undefined&&v!==""&&v!==false;});
  const hasData=n>0||_truthy(d.contract)||_truthy(d.fields)||(sub&&sub.isVerisure);
  let invalid=_subHasInvalid(d);
  if(!invalid&&dupFn){if(dupFn("POD",d.fwPod)||dupFn("POD",d.enPod)||(d.contract&&dupFn("POD",d.contract.pod))||dupFn("PDR",d.fwPdr)||dupFn("PDR",d.enPdr)||(d.contract&&dupFn("PDR",d.contract.pdr))||dupFn("CODCONTR",d.cbCodContratto)||dupFn("CODCONTR",d.cbTnpCC)||dupFn("CODCONTR",d.cbCambioCC)||dupFn("CODCONTR",d.w3SostCodContr)||(d.contract&&dupFn("CODCONTR",d.contract.codice_contratto)))invalid=true;}
  if(!hasData)return {st:"empty",label:"● Da compilare",bg:"var(--tf-e9ecef)",fg:"var(--tf-64748b)"};
  if(invalid||missing||(sub&&!subComplete(sub,d)))return {st:"warn",label:"⚠ Incompleto",bg:"rgba(245,158,11,0.14)",fg:"var(--tf-f59e0b)"};
  return {st:"ok",label:"✓ Completo",bg:"rgba(40,167,69,0.12)",fg:"var(--tf-28a745)"};
};

const SubCard = ({sub,rawSd,group,si,sessionCode,sale,uF,uC,uP,catSales,anaCel,onOpenVFModal,dupCheck,mobiliRate}) => {
  const _r = rawSd || {};
  const sd = {active:true,fields:_r.fields||{},contract:_r.contract||{},gnp:_r.gnp||false,gnpNum:_r.gnpNum||"",gnpOp:_r.gnpOp||"",secondaLinea:_r.secondaLinea||false,gnp2L:_r.gnp2L!=null?_r.gnp2L:null,gnp2LBrand:_r.gnp2LBrand||"",gnp2LNum:_r.gnp2LNum||"",domiciliazione:_r.domiciliazione||false,opProvenienza:_r.opProvenienza||"",codiceOverride:_r.codiceOverride||"",addons:_r.addons||{},domiciliato:_r.domiciliato!=null?_r.domiciliato:null,convergente:_r.convergente!=null?_r.convergente:null,tipMob:_r.tipMob!=null?_r.tipMob:null,mnp:_r.mnp!=null?_r.mnp:null,easyPay:_r.easyPay!=null?_r.easyPay:null,tnpGa:_r.tnpGa!=null?_r.tnpGa:null,tnpTipo:_r.tnpTipo||"",tnpModello:_r.tnpModello||"",tnpImei:_r.tnpImei||"",tnpCount:_r.tnpCount||null,tnpModelli:_r.tnpModelli||[],tnpImeis:_r.tnpImeis||[],packAccessori:_r.packAccessori!=null?_r.packAccessori:null,packAccessoriVal:_r.packAccessoriVal||"",packAccessoriQta:_r.packAccessoriQta||"",cbTnp:_r.cbTnp||false,cbTnpTipo:_r.cbTnpTipo||"",cbTnpModello:_r.cbTnpModello||"",cbTnpImei:_r.cbTnpImei||"",cbTnpCount:_r.cbTnpCount||null,cbTnpModelli:_r.cbTnpModelli||[],cbTnpImeis:_r.cbTnpImeis||[],cbPackAccessori:_r.cbPackAccessori!=null?_r.cbPackAccessori:null,cbPackAccessoriVal:_r.cbPackAccessoriVal||"",cbPackAccessoriQta:_r.cbPackAccessoriQta||"",cbTnpCell:_r.cbTnpCell||"",cbTnpCC:_r.cbTnpCC||"",cbTnpCodIns:_r.cbTnpCodIns||"",cbTnpReload:_r.cbTnpReload!=null?_r.cbTnpReload:null,cbTnpReloadSel:_r.cbTnpReloadSel||{},cbCambio:_r.cbCambio||false,cbCambioVal:_r.cbCambioVal||"",cbCambioCell:_r.cbCambioCell||"",cbCambioCC:_r.cbCambioCC||"",cbCambioCodIns:_r.cbCambioCodIns||"",cbAddon:_r.cbAddon||false,cbAddonSel:_r.cbAddonSel||{},rfModello:_r.rfModello||"",rfImei:_r.rfImei||"",cbRf:_r.cbRf||false,cbAddonCodIns:_r.cbAddonCodIns||"",cbAddonSecCell:_r.cbAddonSecCell||"",cbAddonRoCell:_r.cbAddonRoCell||"",cbAddonRoImei:_r.cbAddonRoImei||"",cbRfCodIns:_r.cbRfCodIns||"",tnpGaReload:_r.tnpGaReload!=null?_r.tnpGaReload:null,tnpGaReloadSel:_r.tnpGaReloadSel||{},reloadForever:_r.reloadForever!=null?_r.reloadForever:null,securitySel:_r.securitySel||{},voceCasaCb:_r.voceCasaCb!=null?_r.voceCasaCb:null,protectaCodIns:_r.protectaCodIns||"",vfOffers:_r.vfOffers||{},vfContratti:_r.vfContratti||{},vfOffer:_r.vfOffer||null,vfMnp:_r.vfMnp||null,vfMnpBrand:_r.vfMnpBrand||"",vfMnpNum:_r.vfMnpNum||"",vfDomicilio:_r.vfDomicilio||null,vfConvergenza:_r.vfConvergenza||null,vfNumFisso:_r.vfNumFisso||"",vfTnp:_r.vfTnp||null,vfFConvergenza:_r.vfFConvergenza||null,vfFGnp:_r.vfFGnp||null,vfFGnpBrand:_r.vfFGnpBrand||"",vfFGnpNum:_r.vfFGnpNum||"",vfFLockIn:_r.vfFLockIn||null,
    vfTnpList:_r.vfTnpList||[],cbTnpList:_r.cbTnpList||[],
    dcNumProv:_r.dcNumProv||"",dcNum:_r.dcNum||"",dcIccid:_r.dcIccid||"",dcCodIns:_r.dcCodIns||"",dcRicaricaAuto:_r.dcRicaricaAuto!=null?_r.dcRicaricaAuto:null,
    vfSecurity:_r.vfSecurity!=null?_r.vfSecurity:null,
    cbCellulare:_r.cbCellulare||"",cbCodContratto:_r.cbCodContratto||"",cbTaglia:_r.cbTaglia||null,cbCodIns2:_r.cbCodIns2||"",
    dcCbNumProv:_r.dcCbNumProv||"",dcCbIccid:_r.dcCbIccid||"",
    cbCambio2:_r.cbCambio2||false,cbCambioNumMod:_r.cbCambioNumMod||"",cbCambioCodIns2:_r.cbCambioCodIns2||"",
    cbSecurity:_r.cbSecurity||false,cbSecurityCell:_r.cbSecurityCell||"",cbTraslochi:_r.cbTraslochi||false,cbTraslochiNum:_r.cbTraslochiNum||"",cbTraslochiCodIns:_r.cbTraslochiCodIns||"",cbSecurityCodIns:_r.cbSecurityCodIns||"",
    vfFAddons:_r.vfFAddons||{},vfFCodIns:_r.vfFCodIns||"",vfFNumProvVisorio:_r.vfFNumProvVisorio||"",vfFNumDef:_r.vfFNumDef||"",vfFIccid:_r.vfFIccid||"",
    vfbOffer:_r.vfbOffer||null,vfbMnp:_r.vfbMnp||null,vfbMnpBrand:_r.vfbMnpBrand||"",vfbMnpNum:_r.vfbMnpNum||"",vfbTnp:_r.vfbTnp||null,vfbModello:_r.vfbModello||"",vfbImei:_r.vfbImei||"",vfbRataPiva:_r.vfbRataPiva||null,vfbKaskoSel:_r.vfbKaskoSel||{},vfbCodIns:_r.vfbCodIns||"",
    vfbCbOn:_r.vfbCbOn||false,vfbCbCell:_r.vfbCbCell||"",vfbCbCodIns:_r.vfbCbCodIns||"",
    vfbFGnp:_r.vfbFGnp||null,vfbFGnpBrand:_r.vfbFGnpBrand||"",vfbFGnpNum:_r.vfbFGnpNum||"",vfbFCodIns:_r.vfbFCodIns||"",vfbFNumProv:_r.vfbFNumProv||"",vfbFNumDef:_r.vfbFNumDef||"",vfbFMnp:_r.vfbFMnp||null,vfbFMnpBrand:_r.vfbFMnpBrand||"",vfbFMnpNum:_r.vfbFMnpNum||"",vfbFCombNumProv:_r.vfbFCombNumProv||"",vfbFCombIccid:_r.vfbFCombIccid||"",vfbNum:_r.vfbNum||"",vfbIccid:_r.vfbIccid||"",vfbFIccid:_r.vfbFIccid||"",
    vfSolDigCodIns:_r.vfSolDigCodIns||"",verisureCodIns:_r.verisureCodIns||"",kfCodIns:_r.kfCodIns||"",vcCodIns:_r.vcCodIns||"",fwOffer:_r.fwOffer||null,fwMnp:_r.fwMnp||null,fwFSecLineCount:_r.fwFSecLineCount||0,fwFSecLines:_r.fwFSecLines||[],fwMnpBrand:_r.fwMnpBrand||"",fwMnpNum:_r.fwMnpNum||"",fwCodIns:_r.fwCodIns||"",fwNumProv:_r.fwNumProv||"",fwNumDef:_r.fwNumDef||"",fwIccid:_r.fwIccid||"",fwFGnp:_r.fwFGnp||null,fwFGnpBrand:_r.fwFGnpBrand||"",fwFGnpNum:_r.fwFGnpNum||"",fwFCodIns:_r.fwFCodIns||"",fwFNumProv:_r.fwFNumProv||"",fwFNumDef:_r.fwFNumDef||"",fwPod:_r.fwPod||"",fwPdr:_r.fwPdr||"",fwEnCodIns:_r.fwEnCodIns||"",ilOffer:_r.ilOffer||null,ilMnp:_r.ilMnp||null,ilDom:_r.ilDom||null,ilMnpBrand:_r.ilMnpBrand||"",ilMnpNum:_r.ilMnpNum||"",ilCodIns:_r.ilCodIns||"",ilNumProv:_r.ilNumProv||"",ilNumDef:_r.ilNumDef||"",ilIccid:_r.ilIccid||"",ilFGnp:_r.ilFGnp||null,ilFCodIns:_r.ilFCodIns||"",ilFNumProv:_r.ilFNumProv||"",ilFNumDef:_r.ilFNumDef||"",ilFwaCodIns:_r.ilFwaCodIns||"",ilFwaIccid:_r.ilFwaIccid||"",ilBizOffer:_r.ilBizOffer||null,ilBizMnp:_r.ilBizMnp||null,ilBizMnpBrand:_r.ilBizMnpBrand||"",ilBizDom:_r.ilBizDom||null,ilBizNum:_r.ilBizNum||"",ilBizIccid:_r.ilBizIccid||"",ilBizNumDef:_r.ilBizNumDef||"",ilBizCodIns:_r.ilBizCodIns||"",enCodIns:_r.enCodIns||"",enPod:_r.enPod||"",enPdr:_r.enPdr||"",enProv:_r.enProv||"",fwEnProv:_r.fwEnProv||"",w3SostCell:_r.w3SostCell||"",w3SostIccid:_r.w3SostIccid||"",w3SostCodContr:_r.w3SostCodContr||"",w3SostCodIns:_r.w3SostCodIns||"",fwSostCell:_r.fwSostCell||"",fwSostIccid:_r.fwSostIccid||"",fwSostCodContr:_r.fwSostCodContr||"",fwSostCodIns:_r.fwSostCodIns||"",vfSostCell:_r.vfSostCell||"",vfSostCodIns:_r.vfSostCodIns||"",timOffer:_r.timOffer||null,timMnp:_r.timMnp||null,timMnpBrand:_r.timMnpBrand||"",timMnpNum:_r.timMnpNum||"",timTnp:_r.timTnp||null,timModello:_r.timModello||"",timSpedizione:_r.timSpedizione||null,timFinanziato:_r.timFinanziato||null,timCodPratica:_r.timCodPratica||"",timVisionBox:_r.timVisionBox||null,timVisionTaglia:_r.timVisionTaglia||null,timVisionNumContr:_r.timVisionNumContr||"",timImei:_r.timImei||"",timNumProv:_r.timNumProv||"",timNum:_r.timNum||"",timIccid:_r.timIccid||"",timCodIns:_r.timCodIns||"",timFOffer:_r.timFOffer||null,timFGnp:_r.timFGnp||null,timFGnpBrand:_r.timFGnpBrand||"",timFGnpNum:_r.timFGnpNum||"",timFNumProv:_r.timFNumProv||"",timFCodIns:_r.timFCodIns||"",timFVision:_r.timFVision||null,timFVisionTaglia:_r.timFVisionTaglia||null,timFVisionNumContr:_r.timFVisionNumContr||"",timTpTwin:_r.timTpTwin||null,timTpSeriale:_r.timTpSeriale||"",timTpRecapito:_r.timTpRecapito||"",timTpCodIns:_r.timTpCodIns||"",veryOffer:_r.veryOffer||null,veryMnp:_r.veryMnp||null,veryMnpBrand:_r.veryMnpBrand||"",veryMnpNum:_r.veryMnpNum||"",veryRicaricaAuto:_r.veryRicaricaAuto||null,veryFascia:_r.veryFascia||null,veryCodIns:_r.veryCodIns||"",veryNumProv:_r.veryNumProv||"",veryNum:_r.veryNum||"",veryIccid:_r.veryIccid||"",hoOffer:_r.hoOffer||null,hoMnp:_r.hoMnp||null,hoMnpBrand:_r.hoMnpBrand||"",hoMnpNum:_r.hoMnpNum||"",hoRicaricaAuto:_r.hoRicaricaAuto||null,hoFascia:_r.hoFascia||null,hoCodIns:_r.hoCodIns||"",hoNumProv:_r.hoNumProv||"",hoNum:_r.hoNum||"",hoIccid:_r.hoIccid||"",kenaOffer:_r.kenaOffer||null,kenaMnp:_r.kenaMnp||null,kenaMnpBrand:_r.kenaMnpBrand||"",kenaMnpNum:_r.kenaMnpNum||"",kenaRicaricaAuto:_r.kenaRicaricaAuto||null,kenaFascia:_r.kenaFascia||null,kenaCodIns:_r.kenaCodIns||"",kenaNumProv:_r.kenaNumProv||"",kenaNum:_r.kenaNum||"",kenaIccid:_r.kenaIccid||""};
  const f=sd.fields;
  const c=sd.contract;
  const gaOn=sale.ga&&sale.ga.active;
  const gaC=gaOn&&sale.ga.contract?sale.ga.contract:{};
  const toggleAddon=(name)=>{const cur=sd.addons[name];uP(group.id,si,sub.id,"addons",{...sd.addons,[name]:!cur})};
  const fissoDefVal = (sd.gnp && sd.gnpNum) ? sd.gnpNum : (c.num_fisso_def || "");
  const fissoDefLocked = !!(sd.gnp && sd.gnpNum);
  const lgConvLocked = (() => {
    if (!sub.hasConvLG || !catSales) return false;
    for (let sx = 0; sx < catSales.length; sx++) {
      const s = catSales[sx]; if (!s) continue;
      const ids = ["luce","gas"];
      for (let k = 0; k < ids.length; k++) { const d = s[ids[k]]; if (d && d.active && d.convergente === true && (sx !== si || ids[k] !== sub.id)) return true; }
    }
    return false;
  })();
  const isUnd = sd.tipMob === "Underground";
  const mnpVal = isUnd ? true : sd.mnp;
  const showMnpF = mnpVal === true || mnpVal === "Sì";
  const mobDone = sd.tipMob !== null && (isUnd || sd.mnp !== null) && sd.easyPay !== null;
  const bizMnpDone = sd.mnp !== null;
  const bizMobDone = bizMnpDone && !!(sub.bizOffers && f.offerta);
  const isVCMode = sub.isVoceCasa || (sub.hasVoceCasaQ && (sd.voceCasaCb === true || sd.voceCasaCb === "Sì"));
  const bizDomLocked = sub.domLocked === true;

  const _reqApiSub=useContext(ReqCtx);
  const _subKey=group.id+"-"+si+"-"+sub.id;
  const _bd = subBadge(sd, dupCheck, sub, _reqApiSub?_reqApiSub.reqMissing(_subKey):false);
  const _inner = (
    <div style={{marginBottom:10,padding:10,background:"var(--tf-w20)",borderRadius:8,border:"1px solid "+group.color+"30"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <div style={{fontSize:11,fontWeight:700,color:group.color}}>{sub.title}</div>
        {_bd&&<span style={{fontSize:10,fontWeight:800,padding:"2px 9px",borderRadius:999,background:_bd.bg,color:_bd.fg,whiteSpace:"nowrap"}}>{_bd.label}</span>}
      </div>

      {sub.isCatalogo&&<CatalogoSub sub={sub} sd={sd} uF={uF} gid={group.id} si={si} sc={sessionCode} color={group.color} mobili={sub.catCategoria==="Telefono a Rate"?(mobiliRate||[]):[]}/>}

      {/* MOBILE flow: Tipologia → MNP → EasyPay → Dropdown */}
      {sub.isMobile&&(
        <div>
          <MiniC label="Tipologia Mobile" val={sd.tipMob} onCh={v=>{uP(group.id,si,sub.id,"tipMob",v);if(v==="Underground"){uP(group.id,si,sub.id,"mnp",true);uP(group.id,si,sub.id,"easyPay","Sì")}else if(v==="Mass Market"){uP(group.id,si,sub.id,"mnp","Sì");uP(group.id,si,sub.id,"easyPay","Sì")};if(v!==sd.tipMob)uF(group.id,si,sub.id,"offerta","")}} opts={["Underground","Mass Market"]}/>
          {sd.tipMob!==null&&(
            isUnd
              ? <MiniC label="MNP" val={true} onCh={()=>{}} locked lockVal={true} opts={["Sì","No"]}/>
              : <MiniC label="MNP" val={sd.mnp} onCh={v=>uP(group.id,si,sub.id,"mnp",v)} opts={["Sì","No"]}/>
          )}
          {sd.tipMob!==null&&(isUnd||sd.mnp!==null)&&(
            <MiniC label="Easy Pay" val={sd.easyPay} onCh={v=>{uP(group.id,si,sub.id,"easyPay",v);uF(group.id,si,sub.id,"offerta","");if(v==="No"||v===false){uP(group.id,si,sub.id,"tnpGa",null)}else{uP(group.id,si,sub.id,"tnpGa","Sì")}}} opts={["Sì","No"]}/>
          )}
          {mobDone&&(
            sub.mobOffers
              ? <div style={{marginTop:6}}><DD l="Offerta Mobile" v={f.offerta||""} o={v=>uF(group.id,si,sub.id,"offerta",v)} vals={sub.mobOffers[sd.tipMob+"_"+sd.easyPay]||[]}/></div>
              : sub.fields&&sub.fields.length>0&&<div style={{marginTop:6}}>{sub.fields.map(fl=><DD key={fl.key} l={fl.label} v={f[fl.key]||""} o={v=>uF(group.id,si,sub.id,fl.key,v)} vals={fl.values}/>)}</div>
          )}
          {/* Security when Easy Pay = No (after Offerta Mobile) */}
          {mobDone&&(sd.easyPay==="No"||sd.easyPay===false)&&(
            <div style={{marginTop:8,padding:8,background:"var(--tf-w30)",borderRadius:6,border:"1px solid var(--tf-w100)"}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:6}}>Security</div>
              <div style={{display:"flex",gap:6}}>
                {["Security","Security PRO"].map(s=>
                  <button key={s} onClick={()=>uP(group.id,si,sub.id,"securitySel",sd.securitySel[s]?{}:{[s]:true})} style={{padding:"5px 14px",borderRadius:6,border:sd.securitySel[s]?"2px solid #fd7e14":"2px solid var(--tf-w100)",background:sd.securitySel[s]?"rgba(245,158,11,0.14)":"var(--tf-w40)",color:sd.securitySel[s]?"var(--tf-e8590c)":"var(--tf-8892b0)",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                    <span>{sd.securitySel[s]?"◉":"○"}</span>{s}
                  </button>
                )}
              </div>
            </div>
          )}
          {/* TNP GA: only when Easy Pay = Sì */}
          {mobDone&&(sd.easyPay==="Sì"||sd.easyPay===true)&&(
            <div style={{marginTop:8}}>
              <MiniC label="TNP GA" val={sd.tnpGa} onCh={v=>{uP(group.id,si,sub.id,"tnpGa",v);if(v==="No"||v===false){uP(group.id,si,sub.id,"tnpTipo","");uP(group.id,si,sub.id,"tnpModello","");uP(group.id,si,sub.id,"tnpImei","");uP(group.id,si,sub.id,"tnpGaReload",null);uP(group.id,si,sub.id,"tnpGaReloadSel",{})}}} opts={["Sì","No"]}/>
              {(sd.tnpGa==="Sì"||sd.tnpGa===true)&&(
                <div style={{padding:10,background:"rgba(0,114,198,0.10)",borderRadius:8,border:"1px solid var(--tf-w120)",marginTop:4}}>
                  <div style={{fontSize:10,fontWeight:700,color:"var(--tf-2e75b6)",marginBottom:8,textTransform:"uppercase"}}>Dati TNP GA</div>
                  <div style={{display:"flex",gap:6,marginBottom:sd.tnpTipo?8:0}}>
                    {["Rata 5G","Finanziamento > 600€","Finanziamento < 600€"].map(opt=>
                      <button key={opt} onClick={()=>uP(group.id,si,sub.id,"tnpTipo",opt)} style={{padding:"6px 14px",borderRadius:6,border:sd.tnpTipo===opt?"2px solid #2E75B6":"2px solid var(--tf-w100)",background:sd.tnpTipo===opt?"var(--tf-2e75b6)":"var(--tf-w40)",color:sd.tnpTipo===opt?"#fff":"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:"pointer"}}>{opt}</button>
                    )}
                  </div>
                  {sd.tnpTipo&&(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                      {!sd.tnpTipo.startsWith("Finanziamento")&&<DD l="Modello Terminale" r v={sd.tnpModello||""} o={v=>uP(group.id,si,sub.id,"tnpModello",v)} vals={SOLO_ALTRO} cerca={cercaTerminali}/>}
                      {!sd.tnpTipo.startsWith("Finanziamento")&&<TF l="IMEI" r v={sd.tnpImei||""} o={v=>uP(group.id,si,sub.id,"tnpImei",v)} p="15 cifre" nt="Barcode 📷"/>}
                    </div>
                  )}
                  {/* Quanti TNP finanziati — solo per Finanziamento */}
                  {sd.tnpTipo&&sd.tnpTipo.startsWith("Finanziamento")&&(
                    <div style={{marginTop:8}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--tf-2e75b6)",marginBottom:6}}>Quanti TNP hai finanziato?</div>
                      <div style={{display:"flex",gap:6,marginBottom:8}}>
                        {[1,2,3].map(n=>
                          <button key={n} onClick={()=>{const nuovo=sd.tnpCount===n?null:n;uP(group.id,si,sub.id,"tnpCount",nuovo);
                            /* abbassando la quantita' i terminali in eccesso vanno tolti,
                               altrimenti restano nascosti e finiscono nel contratto */
                            const lim=nuovo||0;
                            uP(group.id,si,sub.id,"tnpModelli",(sd.tnpModelli||[]).slice(0,lim));
                            uP(group.id,si,sub.id,"tnpImeis",(sd.tnpImeis||[]).slice(0,lim));}} style={{width:40,height:40,borderRadius:8,border:sd.tnpCount===n?"2px solid #2E75B6":"2px solid var(--tf-w100)",background:sd.tnpCount===n?"var(--tf-2e75b6)":"var(--tf-w40)",color:sd.tnpCount===n?"#fff":"var(--tf-8892b0)",fontSize:14,fontWeight:700,cursor:"pointer"}}>{n}</button>
                        )}
                      </div>
                      {sd.tnpCount&&[...Array(sd.tnpCount)].map((_,idx)=>(
                        <div key={idx} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px",marginBottom:8,padding:8,background:"var(--tf-w20)",borderRadius:6,border:"1px solid var(--tf-w100)"}}>
                          <div style={{gridColumn:"1/-1",fontSize:10,fontWeight:700,color:"var(--tf-2e75b6)",marginBottom:2}}>Terminale {sd.tnpCount>1?idx+1:""}</div>
                          <DD l="Modello Terminale" r v={(sd.tnpModelli&&sd.tnpModelli[idx])||""} o={v=>{const m=[...(sd.tnpModelli||[])];m[idx]=v;uP(group.id,si,sub.id,"tnpModelli",m)}} vals={SOLO_ALTRO} cerca={cercaTerminali}/>
                          <TF l="IMEI" r v={(sd.tnpImeis&&sd.tnpImeis[idx])||""} o={v=>{const im=[...(sd.tnpImeis||[])];im[idx]=v;uP(group.id,si,sub.id,"tnpImeis",im)}} p="15 cifre" nt="Barcode 📷"/>
                        </div>
                      ))}
                      {sd.tnpCount&&(
                        <div style={{marginTop:4,padding:8,background:"var(--tf-w20)",borderRadius:6,border:"1px solid var(--tf-w100)"}}>
                          <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                            <YN val={sd.packAccessori} onCh={v=>uP(group.id,si,sub.id,"packAccessori",v)} label="Pack Accessori?"/>
                            {(sd.packAccessori===true)&&(
                              <TF l="Quanti accessori?" v={sd.packAccessoriQta||""} o={v=>uP(group.id,si,sub.id,"packAccessoriQta",v)} p="es. 2"/>
                            )}
                          </div>
                          {(sd.packAccessori===true)&&(
                            <div style={{marginTop:10}}>
                              <div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:6}}>Importo Pack Accessori <span style={{color:"var(--tf-2e75b6)",fontWeight:700}}>€{sd.packAccessoriVal||29}</span></div>
                              <div style={{display:"flex",alignItems:"center",gap:10}}>
                                <input type="range" min={29} max={240} value={sd.packAccessoriVal||29} onChange={e=>uP(group.id,si,sub.id,"packAccessoriVal",parseInt(e.target.value))} style={{flex:1,accentColor:"var(--tf-2e75b6)"}}/>
                                <input type="number" min={29} max={240} value={sd.packAccessoriVal||""} onChange={e=>uP(group.id,si,sub.id,"packAccessoriVal",e.target.value===""?"":parseInt(e.target.value))} onBlur={e=>{const raw=parseInt(e.target.value);if(!isNaN(raw))uP(group.id,si,sub.id,"packAccessoriVal",Math.min(240,Math.max(29,raw)));else uP(group.id,si,sub.id,"packAccessoriVal",29)}} style={{width:72,padding:"5px 8px",borderRadius:6,border:"1px solid var(--tf-w120)",fontSize:12,fontWeight:600,textAlign:"center"}} placeholder="29-240"/>
                                <span style={{fontSize:11,color:"var(--tf-64748b)"}}>€</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--tf-64748b)",marginTop:2}}><span>€29</span><span>€240</span></div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Reload inside TNP GA */}
                  {sd.tnpTipo&&(
                    <div style={{marginTop:10,padding:8,background:"var(--tf-w20)",borderRadius:6,border:"1px solid var(--tf-w100)"}}>
                      <YN val={sd.tnpGaReload} onCh={v=>{uP(group.id,si,sub.id,"tnpGaReload",v);if(!v)uP(group.id,si,sub.id,"tnpGaReloadSel",{})}} label="Reload?"/>
                      {(sd.tnpGaReload===true)&&(
                        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6}}>
                          {["Reload","Reload Plus","Reload Exchange"].map(rl=>
                            <button key={rl} onClick={()=>uP(group.id,si,sub.id,"tnpGaReloadSel",sd.tnpGaReloadSel[rl]?{}:{[rl]:true})} style={{padding:"5px 12px",borderRadius:6,border:sd.tnpGaReloadSel[rl]?"2px solid #28a745":"2px solid var(--tf-w100)",background:sd.tnpGaReloadSel[rl]?"rgba(40,167,69,0.12)":"var(--tf-w40)",color:sd.tnpGaReloadSel[rl]?"var(--tf-28a745)":"var(--tf-8892b0)",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                              <span>{sd.tnpGaReloadSel[rl]?"◉":"○"}</span>{rl}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Security for TNP GA = Sì: OUTSIDE blue box, before dati contratto */}
              {(sd.tnpGa==="Sì"||sd.tnpGa===true)&&sd.tnpTipo&&(
                <div style={{marginTop:8,padding:8,background:"var(--tf-w30)",borderRadius:6,border:"1px solid var(--tf-w100)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:6}}>Security</div>
                  <div style={{display:"flex",gap:6}}>
                    {["Security","Security PRO"].map(s=>
                      <button key={s} onClick={()=>uP(group.id,si,sub.id,"securitySel",sd.securitySel[s]?{}:{[s]:true})} style={{padding:"5px 14px",borderRadius:6,border:sd.securitySel[s]?"2px solid #fd7e14":"2px solid var(--tf-w100)",background:sd.securitySel[s]?"rgba(245,158,11,0.14)":"var(--tf-w40)",color:sd.securitySel[s]?"var(--tf-e8590c)":"var(--tf-8892b0)",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                        <span>{sd.securitySel[s]?"◉":"○"}</span>{s}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Reload Forever: when TNP GA = No, before dati contratto */}
          {mobDone&&(sd.easyPay==="Sì"||sd.easyPay===true)&&(sd.tnpGa==="No"||sd.tnpGa===false)&&(
            <div style={{marginTop:6}}>
              <YN val={sd.reloadForever} onCh={v=>uP(group.id,si,sub.id,"reloadForever",v)} label="Reload Forever?"/>
              {/* Security when TNP GA = No (after Reload Forever) */}
              <div style={{marginTop:8,padding:8,background:"var(--tf-w30)",borderRadius:6,border:"1px solid var(--tf-w100)"}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:6}}>Security</div>
                <div style={{display:"flex",gap:6}}>
                  {["Security","Security PRO"].map(s=>
                    <button key={s} onClick={()=>uP(group.id,si,sub.id,"securitySel",sd.securitySel[s]?{}:{[s]:true})} style={{padding:"5px 14px",borderRadius:6,border:sd.securitySel[s]?"2px solid #fd7e14":"2px solid var(--tf-w100)",background:sd.securitySel[s]?"rgba(245,158,11,0.14)":"var(--tf-w40)",color:sd.securitySel[s]?"var(--tf-e8590c)":"var(--tf-8892b0)",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                      <span>{sd.securitySel[s]?"◉":"○"}</span>{s}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VF MOBILE GA — flusso completo */}
      {sub.isVFMobile&&<VFMobileGA sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode}/>}
      {sub.isVFBizMobile&&<VFBizMobile sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode}/>}

      {/* VF MOBILE CB */}
      {sub.isCBVF&&<VFCB sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode} dupCheck={dupCheck}/>}
      {sub.isCBVFBiz&&<VFBizMobileCB sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode}/>}

      {/* FASTWEB */}
      {sub.isFWMobile&&<FWMobile sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode} biz={sub.fwBiz}/>}
      {sub.isFWFisso&&<FWFisso sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode} biz={sub.fwBiz} offer={sub.title}/>}
      {sub.isFWEnergia&&<FWEnergia sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode} subTitle={sub.title} dupCheck={dupCheck}/>}

      {/* ILIAD */}
      {sub.isILMobile&&<ILMobile sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode}/>}
      {sub.isILBizMobile&&<ILBizMobile sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode}/>}
      {sub.isILFisso&&<ILFisso sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode}/>}
      {sub.isILFwa&&<ILFwa sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode}/>}
      {sub.isTimMobile&&<TIMMobile sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode}/>}
      {sub.isTimFisso&&<TIMFisso sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode}/>}
      {sub.isTimTelepass&&<TIMTelepass sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode}/>}
      {sub.isVeryMobile&&<SimpleMobile sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} pfx="very" accent={VERY_C} codici={VERY_CODICI_NEGOZIO} sc={sessionCode}/>}
      {sub.isHoMobile&&<SimpleMobile sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} pfx="ho" accent={HO_C} codici={HO_CODICI_NEGOZIO} sc={sessionCode}/>}
      {sub.isKenaMobile&&<SimpleMobile sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} pfx="kena" accent={KENA_C} codici={KENA_CODICI_NEGOZIO} sc={sessionCode}/>}

      {/* ENERGY */}
      {sub.isENLuceGas&&<ENLuceGas sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sub={sub} dupCheck={dupCheck} sc={sessionCode}/>}
      {sub.isW3SostSim&&<W3SostSim sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode} dupCheck={dupCheck}/>}
      {sub.isVFSostSim&&<VFSostSim sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode}/>}
      {sub.isFWSostSim&&<FWSostSim sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode} dupCheck={dupCheck}/>}

      {/* MOBILE BUSINESS flow: MNP → Brand MNP → Offerta → TNP GA → Security */}
      {sub.isMobileBiz&&(
        <div>
          <MiniC label="MNP" val={sd.mnp} onCh={v=>{uP(group.id,si,sub.id,"mnp",v);if(v==="No"||v===false)uC(group.id,si,sub.id,"brand_mnp","")}} opts={["Sì","No"]}/>
          {bizMnpDone&&(sd.mnp==="Sì"||sd.mnp===true)&&(
            <div style={{marginTop:6}}>
              <DD l="Brand MNP" r v={f.brandMnpBiz||""} o={v=>uF(group.id,si,sub.id,"brandMnpBiz",v)} vals={brandMNP}/>
            </div>
          )}
          {bizMnpDone&&(
            <div style={{marginTop:6}}>
              <DD l="Offerta Mobile" r v={f.offerta||""} o={v=>uF(group.id,si,sub.id,"offerta",v)} vals={(sub.bizOffers||[]).filter(o=>(sd.mnp==="Sì"||sd.mnp===true)?o!=="FWA Indoor PIVA":true)}/>
            </div>
          )}
          {bizMobDone&&(
            <div style={{marginTop:8}}>
              <MiniC label="TNP GA" val={sd.tnpGa} onCh={v=>{uP(group.id,si,sub.id,"tnpGa",v);if(v==="No"||v===false){uP(group.id,si,sub.id,"tnpTipo","");uP(group.id,si,sub.id,"tnpModello","");uP(group.id,si,sub.id,"tnpImei","");uP(group.id,si,sub.id,"tnpGaReload",null);uP(group.id,si,sub.id,"tnpGaReloadSel",{})}}} opts={["Sì","No"]}/>
              {(sd.tnpGa==="Sì"||sd.tnpGa===true)&&(
                <div style={{marginTop:8}}>
                  <div style={{padding:10,background:"rgba(0,114,198,0.10)",borderRadius:8,border:"1px solid var(--tf-w120)",marginBottom:8}}>
                    <div style={{fontSize:10,fontWeight:700,color:"var(--tf-2e75b6)",marginBottom:8,textTransform:"uppercase"}}>Tipologia TNP GA</div>
                    <div style={{display:"flex",gap:6}}>
                      {["Rata P.IVA","Rata P.IVA 5G"].map(opt=>
                        <button key={opt} onClick={()=>uP(group.id,si,sub.id,"tnpTipo",sd.tnpTipo===opt?"":opt)} style={{padding:"6px 14px",borderRadius:6,border:sd.tnpTipo===opt?"2px solid #2E75B6":"2px solid var(--tf-w100)",background:sd.tnpTipo===opt?"var(--tf-2e75b6)":"var(--tf-w40)",color:sd.tnpTipo===opt?"#fff":"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:"pointer"}}>{opt}</button>
                      )}
                    </div>
                  </div>
                  <div style={{padding:8,background:"var(--tf-w30)",borderRadius:6,border:"1px solid var(--tf-w100)"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:6}}>Security / Reload</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <button onClick={()=>uP(group.id,si,sub.id,"securitySel",sd.securitySel["Security"]?{}:{"Security":true})} style={{padding:"5px 14px",borderRadius:6,border:sd.securitySel["Security"]?"2px solid #fd7e14":"2px solid var(--tf-w100)",background:sd.securitySel["Security"]?"rgba(245,158,11,0.14)":"var(--tf-w40)",color:sd.securitySel["Security"]?"var(--tf-e8590c)":"var(--tf-8892b0)",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                        <span>{sd.securitySel["Security"]?"☑":"☐"}</span>Security
                      </button>
                      {["Reload","Reload EU"].map(rl=>
                        <button key={rl} onClick={()=>uP(group.id,si,sub.id,"tnpGaReloadSel",sd.tnpGaReloadSel[rl]?{}:{[rl]:true})} style={{padding:"5px 14px",borderRadius:6,border:sd.tnpGaReloadSel[rl]?"2px solid #28a745":"2px solid var(--tf-w100)",background:sd.tnpGaReloadSel[rl]?"rgba(40,167,69,0.12)":"var(--tf-w40)",color:sd.tnpGaReloadSel[rl]?"var(--tf-28a745)":"var(--tf-8892b0)",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                          <span>{sd.tnpGaReloadSel[rl]?"◉":"○"}</span>{rl}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {(sd.tnpGa==="No"||sd.tnpGa===false)&&(
                <div style={{marginTop:8,padding:8,background:"var(--tf-w30)",borderRadius:6,border:"1px solid var(--tf-w100)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:6}}>Security / Reload</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <button onClick={()=>uP(group.id,si,sub.id,"securitySel",sd.securitySel["Security"]?{}:{"Security":true})} style={{padding:"5px 14px",borderRadius:6,border:sd.securitySel["Security"]?"2px solid #fd7e14":"2px solid var(--tf-w100)",background:sd.securitySel["Security"]?"rgba(245,158,11,0.14)":"var(--tf-w40)",color:sd.securitySel["Security"]?"var(--tf-e8590c)":"var(--tf-8892b0)",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                      <span>{sd.securitySel["Security"]?"◉":"○"}</span>Security
                    </button>
                    <button onClick={()=>uP(group.id,si,sub.id,"tnpGaReloadSel",sd.tnpGaReloadSel["Reload Open"]?{}:{"Reload Open":true})} style={{padding:"5px 14px",borderRadius:6,border:sd.tnpGaReloadSel["Reload Open"]?"2px solid #28a745":"2px solid var(--tf-w100)",background:sd.tnpGaReloadSel["Reload Open"]?"rgba(40,167,69,0.12)":"var(--tf-w40)",color:sd.tnpGaReloadSel["Reload Open"]?"var(--tf-28a745)":"var(--tf-8892b0)",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                      <span>{sd.tnpGaReloadSel["Reload Open"]?"◉":"○"}</span>Reload Open
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}


      {sub.isProtecta&&(
        sub.isBizProtecta
          ? <div style={{padding:"10px 14px",borderRadius:8,background:"rgba(111,66,193,0.12)",border:"2px solid #6f42c1"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:16}}>✅</span>
                <span style={{fontSize:13,fontWeight:700,color:"var(--tf-6f42c1)"}}>Protecta PRO attivato</span>
              </div>
              <div style={{maxWidth:260}}><SCd session={sessionCode} codici={codiciW3} val={sd.protectaCodIns||""} onCh={v=>uP(group.id,si,sub.id,"protectaCodIns",v)}/></div>
            </div>
          : <div style={{display:"flex",gap:8}}>
              {["Kit Base","Kit Plus"].map(k=>
                <button key={k} onClick={()=>uF(group.id,si,sub.id,"protectaKit",f.protectaKit===k?"":k)} style={{padding:"8px 18px",borderRadius:8,border:f.protectaKit===k?"2px solid #6f42c1":"2px solid var(--tf-w100)",background:f.protectaKit===k?"var(--tf-6f42c1)":"var(--tf-w40)",color:f.protectaKit===k?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>{k}</button>
              )}
            </div>
      )}

      {/* Verisure */}
      {sub.isVerisure&&(
        <div style={{padding:"12px 16px",borderRadius:8,background:"rgba(111,66,193,0.12)",border:"2px solid #6f42c1"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <span style={{fontSize:20}}>🛡️</span>
            <span style={{fontSize:13,fontWeight:700,color:"var(--tf-6f42c1)"}}>Verisure</span>
            <span style={{marginLeft:"auto",fontSize:12,fontWeight:800,color:"var(--tf-6f42c1)",background:"rgba(111,66,193,0.18)",borderRadius:6,padding:"3px 12px"}}>✅ CONTATTO INSERITO - In attesa di approvazione</span>
          </div>
          <SCd session={sessionCode} codici={VF_CODICI_NEGOZIO} val={sd.verisureCodIns||""} onCh={v=>uP(group.id,si,sub.id,"verisureCodIns",v)}/>
        </div>
      )}

      {/* VF Fisso — Convergenza / GNP / Lock In */}
      {sub.isVFFisso&&<VFMobileGAFisso sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode}/>}
      {sub.isVFFissoBiz&&<VFBizFisso sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} isCombo={!!sub.isCombinatoFissoBiz} sc={sessionCode}/>}
      {sub.isVFSolDig&&(
        <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
          <SCd session={sessionCode} codici={VF_CODICI_NEGOZIO} val={sd.vfSolDigCodIns||""} onCh={v=>uP(group.id,si,sub.id,"vfSolDigCodIns",v)}/>
        </div>
      )}

      {/* Kasko Facile */}
      {sub.isKaskoFacile&&(
        <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto — Kasko Facile</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
            <TF l="IMEI" r v={f.kfImei||""} o={v=>uF(group.id,si,sub.id,"kfImei",v)} p="15 cifre" nt="Barcode 📷"/>
            <TF l="Numero di telefono" r v={f.kfTelefono||""} o={v=>uF(group.id,si,sub.id,"kfTelefono",v)} p="3XXXXXXXXX"/>
            <TF l="Seriale Kasko" r v={f.kfSeriale||""} o={v=>uF(group.id,si,sub.id,"kfSeriale",v)} p="es. KF-000123"/>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:3}}>Tipologia Kasko <span style={{color:"var(--tf-dc3545)"}}>*</span></div>
              <select value={f.kfTipologia||""} onChange={e=>uF(group.id,si,sub.id,"kfTipologia",e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12,boxSizing:"border-box",background:"var(--tf-w20)"}}>
                <option value="">— Seleziona —</option>
                {["29,90","39,90","59,90","89,90","109,99","129,99","149,99","179,99","189,99","219,99"].map(v=><option key={v} value={v}>{v} €</option>)}
              </select>
            </div>
            <SCd session={sessionCode} codici={VF_CODICI_NEGOZIO} val={sd.kfCodIns||""} onCh={v=>uP(group.id,si,sub.id,"kfCodIns",v)}/>
          </div>
        </div>
      )}

      {/* Vodafone Care */}
      {sub.isVFCare&&(
        <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid var(--tf-w120)",borderRadius:8,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:_brandAccento,marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto — Vodafone Care</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
            <TF l="Numero di telefono" r v={f.vcTelefono||""} o={v=>uF(group.id,si,sub.id,"vcTelefono",v)} p="3XXXXXXXXX"/>
            <TF l="IMEI" r v={f.vcImei||""} o={v=>uF(group.id,si,sub.id,"vcImei",v)} p="15 cifre" nt="Barcode 📷"/>
            <SCd session={sessionCode} codici={VF_CODICI_NEGOZIO} val={sd.vcCodIns||""} onCh={v=>uP(group.id,si,sub.id,"vcCodIns",v)}/>
          </div>
        </div>
      )}
      {/* Assicurazioni Business: radio esclusivo */}
      {sub.isAssicBiz&&(
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {["Protezione PRO Negozi - Affittuario","Protezione PRO Negozi - Proprietario"].map(opt=>
            <button key={opt} onClick={()=>uF(group.id,si,sub.id,"assicBizSel",f.assicBizSel===opt?"":opt)} style={{padding:"8px 16px",borderRadius:8,border:f.assicBizSel===opt?"2px solid #6f42c1":"2px solid var(--tf-w100)",background:f.assicBizSel===opt?"var(--tf-6f42c1)":"var(--tf-w40)",color:f.assicBizSel===opt?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:14}}>{f.assicBizSel===opt?"◉":"○"}</span>{opt}
            </button>
          )}
        </div>
      )}


      {sub.isCB&&(
        <div>
          {/* Three toggleable sub-options */}
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <button onClick={()=>{const on=!sd.cbTnp;uP(group.id,si,sub.id,"cbTnp",on);if(on){if(!sd.cbTnpCell){const pre=sd.cbCambioCell||anaCel||"";if(pre)uP(group.id,si,sub.id,"cbTnpCell",pre)};if(!sd.cbTnpCC){const pre=sd.cbCambioCC||(c.codice_contratto||"");if(pre)uP(group.id,si,sub.id,"cbTnpCC",pre)}}}} style={{padding:"8px 16px",borderRadius:8,border:sd.cbTnp?"2px solid #2E75B6":"2px solid var(--tf-w100)",background:sd.cbTnp?"var(--tf-2e75b6)":"var(--tf-w40)",color:sd.cbTnp?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>TNP CB</button>
            <button onClick={()=>{const on=!sd.cbCambio;uP(group.id,si,sub.id,"cbCambio",on);if(on){if(!sd.cbCambioCell){const pre=sd.cbTnpCell||anaCel||"";if(pre)uP(group.id,si,sub.id,"cbCambioCell",pre)};if(!sd.cbCambioCC){const pre=sd.cbTnpCC||(c.codice_contratto||"");if(pre)uP(group.id,si,sub.id,"cbCambioCC",pre)}}}} style={{padding:"8px 16px",borderRadius:8,border:sd.cbCambio?"2px solid #6f42c1":"2px solid var(--tf-w100)",background:sd.cbCambio?"var(--tf-6f42c1)":"var(--tf-w40)",color:sd.cbCambio?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>Cambio Offerta</button>
            {!sub.isCBBiz&&<button onClick={()=>uP(group.id,si,sub.id,"cbRf",!sd.cbRf)} style={{padding:"8px 16px",borderRadius:8,border:sd.cbRf?"2px solid #28a745":"2px solid var(--tf-w100)",background:sd.cbRf?"var(--tf-28a745)":"var(--tf-w40)",color:sd.cbRf?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>Reload Forever</button>}
            {sub.cbAddonVals&&<button onClick={()=>uP(group.id,si,sub.id,"cbAddon",!sd.cbAddon)} style={{padding:"8px 16px",borderRadius:8,border:sd.cbAddon?"2px solid #17a589":"2px solid var(--tf-w100)",background:sd.cbAddon?"var(--tf-17a589)":"var(--tf-w40)",color:sd.cbAddon?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>{sub.isCBBiz?"Add-on / Security":"Add-on"}</button>}
          </div>

          {/* TNP CB section */}
          {sd.cbTnp&&(
            <div style={{padding:10,background:"rgba(0,114,198,0.10)",borderRadius:8,border:"1px solid var(--tf-w120)",marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--tf-2e75b6)",marginBottom:8,textTransform:"uppercase"}}>Dati TNP CB</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px 14px",marginBottom:8}}>
                <SCd session={sessionCode} codici={codiciW3} val={sd.cbTnpCodIns||""} onCh={v=>uP(group.id,si,sub.id,"cbTnpCodIns",v)}/>
                <TF l="Cellulare" r v={sd.cbTnpCell||""} o={v=>{uP(group.id,si,sub.id,"cbTnpCell",v);if(sd.cbCambio)uP(group.id,si,sub.id,"cbCambioCell",v)}} p="3XXXXXXXXX" nt={sd.cbTnpCell===anaCel&&anaCel?"Da anagrafica":""}/>
                <TF l="Codice Contratto" r v={sd.cbTnpCC||""} o={v=>{uP(group.id,si,sub.id,"cbTnpCC",v);if(sd.cbCambio)uP(group.id,si,sub.id,"cbCambioCC",v)}} p="es. 167942" err={dupCheck&&dupCheck("CODCONTR",sd.cbTnpCC)?"Codice contratto già usato in un altro prodotto":""}/>
              </div>
              {sub.isCBBiz&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px",marginBottom:8}}>
                  <DD l="Modello Terminale" r v={sd.cbTnpModello||""} o={v=>uP(group.id,si,sub.id,"cbTnpModello",v)} vals={SOLO_ALTRO} cerca={cercaTerminali}/>
                  <TF l="IMEI" r v={sd.cbTnpImei||""} o={v=>uP(group.id,si,sub.id,"cbTnpImei",v)} p="15 cifre" nt="Barcode 📷"/>
                </div>
              )}
              <div style={{display:"flex",gap:6,marginBottom:sd.cbTnpTipo?8:0}}>
                {!sub.isCBBiz&&sub.cbTnpVals.map(opt=>
                  <button key={opt} onClick={()=>uP(group.id,si,sub.id,"cbTnpTipo",opt)} style={{padding:"6px 14px",borderRadius:6,border:sd.cbTnpTipo===opt?"2px solid #2E75B6":"2px solid var(--tf-w100)",background:sd.cbTnpTipo===opt?"var(--tf-2e75b6)":"var(--tf-w40)",color:sd.cbTnpTipo===opt?"#fff":"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:"pointer"}}>{opt}</button>
                )}
              </div>
              {!sub.isCBBiz&&sd.cbTnpTipo&&(
                <div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                    {!sd.cbTnpTipo.startsWith("Finanziamento")&&<DD l="Modello Terminale" r v={sd.cbTnpModello||""} o={v=>uP(group.id,si,sub.id,"cbTnpModello",v)} vals={SOLO_ALTRO} cerca={cercaTerminali}/>}
                    {!sd.cbTnpTipo.startsWith("Finanziamento")&&<TF l="IMEI" r v={sd.cbTnpImei||""} o={v=>uP(group.id,si,sub.id,"cbTnpImei",v)} p="15 cifre" nt="Barcode 📷"/>}
                  </div>
                  {sd.cbTnpTipo.startsWith("Finanziamento")&&(
                    <div style={{marginTop:8}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--tf-2e75b6)",marginBottom:6}}>Quanti TNP hai finanziato?</div>
                      <div style={{display:"flex",gap:6,marginBottom:8}}>
                        {[1,2,3].map(n=>
                          <button key={n} onClick={()=>{const nuovo=sd.cbTnpCount===n?null:n;uP(group.id,si,sub.id,"cbTnpCount",nuovo);
                            const lim=nuovo||0;
                            uP(group.id,si,sub.id,"cbTnpModelli",(sd.cbTnpModelli||[]).slice(0,lim));
                            uP(group.id,si,sub.id,"cbTnpImeis",(sd.cbTnpImeis||[]).slice(0,lim));}} style={{width:40,height:40,borderRadius:8,border:sd.cbTnpCount===n?"2px solid #2E75B6":"2px solid var(--tf-w100)",background:sd.cbTnpCount===n?"var(--tf-2e75b6)":"var(--tf-w40)",color:sd.cbTnpCount===n?"#fff":"var(--tf-8892b0)",fontSize:14,fontWeight:700,cursor:"pointer"}}>{n}</button>
                        )}
                      </div>
                      {sd.cbTnpCount&&[...Array(sd.cbTnpCount)].map((_,idx)=>(
                        <div key={idx} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px",marginBottom:8,padding:8,background:"var(--tf-w20)",borderRadius:6,border:"1px solid var(--tf-w100)"}}>
                          <div style={{gridColumn:"1/-1",fontSize:10,fontWeight:700,color:"var(--tf-2e75b6)",marginBottom:2}}>Terminale {sd.cbTnpCount>1?idx+1:""}</div>
                          <DD l="Modello Terminale" r v={(sd.cbTnpModelli&&sd.cbTnpModelli[idx])||""} o={v=>{const m=[...(sd.cbTnpModelli||[])];m[idx]=v;uP(group.id,si,sub.id,"cbTnpModelli",m)}} vals={SOLO_ALTRO} cerca={cercaTerminali}/>
                          <TF l="IMEI" r v={(sd.cbTnpImeis&&sd.cbTnpImeis[idx])||""} o={v=>{const im=[...(sd.cbTnpImeis||[])];im[idx]=v;uP(group.id,si,sub.id,"cbTnpImeis",im)}} p="15 cifre" nt="Barcode 📷"/>
                        </div>
                      ))}
                      {sd.cbTnpCount&&(
                        <div style={{marginTop:4,padding:8,background:"var(--tf-w20)",borderRadius:6,border:"1px solid var(--tf-w100)"}}>
                          <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                            <YN val={sd.cbPackAccessori} onCh={v=>uP(group.id,si,sub.id,"cbPackAccessori",v)} label="Pack Accessori?"/>
                            {(sd.cbPackAccessori===true)&&(
                              <TF l="Quanti accessori?" v={sd.cbPackAccessoriQta||""} o={v=>uP(group.id,si,sub.id,"cbPackAccessoriQta",v)} p="es. 2"/>
                            )}
                          </div>
                          {(sd.cbPackAccessori===true)&&(
                            <div style={{marginTop:10}}>
                              <div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:6}}>Importo Pack Accessori <span style={{color:"var(--tf-2e75b6)",fontWeight:700}}>€{sd.cbPackAccessoriVal||29}</span></div>
                              <div style={{display:"flex",alignItems:"center",gap:10}}>
                                <input type="range" min={29} max={240} value={sd.cbPackAccessoriVal||29} onChange={e=>uP(group.id,si,sub.id,"cbPackAccessoriVal",parseInt(e.target.value))} style={{flex:1,accentColor:"var(--tf-2e75b6)"}}/>
                                <input type="number" min={29} max={240} value={sd.cbPackAccessoriVal||""} onChange={e=>uP(group.id,si,sub.id,"cbPackAccessoriVal",e.target.value===""?"":parseInt(e.target.value))} onBlur={e=>{const raw=parseInt(e.target.value);if(!isNaN(raw))uP(group.id,si,sub.id,"cbPackAccessoriVal",Math.min(240,Math.max(29,raw)));else uP(group.id,si,sub.id,"cbPackAccessoriVal",29)}} style={{width:72,padding:"5px 8px",borderRadius:6,border:"1px solid var(--tf-w120)",fontSize:12,fontWeight:600,textAlign:"center"}} placeholder="29-240"/>
                                <span style={{fontSize:11,color:"var(--tf-64748b)"}}>€</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--tf-64748b)",marginTop:2}}><span>€29</span><span>€240</span></div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Reload inside TNP CB */}
              <div style={{marginTop:8,padding:8,background:"var(--tf-w20)",borderRadius:6,border:"1px solid var(--tf-w100)"}}>
                <YN val={sd.cbTnpReload} onCh={v=>{uP(group.id,si,sub.id,"cbTnpReload",v);if(!v)uP(group.id,si,sub.id,"cbTnpReloadSel",{})}} label="Reload?"/>
                {(sd.cbTnpReload===true)&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6}}>
                    {(sub.isCBBiz?["Reload","Reload EU"]:["Reload","Reload Plus","Reload Exchange"]).map(rl=>
                      <button key={rl} onClick={()=>uP(group.id,si,sub.id,"cbTnpReloadSel",sd.cbTnpReloadSel[rl]?{}:{[rl]:true})} style={{padding:"5px 12px",borderRadius:6,border:sd.cbTnpReloadSel[rl]?"2px solid #28a745":"2px solid var(--tf-w100)",background:sd.cbTnpReloadSel[rl]?"rgba(40,167,69,0.12)":"var(--tf-w40)",color:sd.cbTnpReloadSel[rl]?"var(--tf-28a745)":"var(--tf-8892b0)",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                        <span>{sd.cbTnpReloadSel[rl]?"◉":"○"}</span>{rl}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cambio Offerta section */}
          {sd.cbCambio&&(
            <div style={{padding:10,background:"rgba(111,66,193,0.10)",borderRadius:8,border:"1px solid rgba(111,66,193,0.3)",marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--tf-6f42c1)",marginBottom:8,textTransform:"uppercase"}}>Cambio Offerta</div>
              <div style={{marginBottom:8,maxWidth:250}}>
                <SCd session={sessionCode} codici={codiciW3} val={sd.cbCambioCodIns||""} onCh={v=>uP(group.id,si,sub.id,"cbCambioCodIns",v)}/>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                {sub.cbCambioVals.map(opt=>
                  <button key={opt} onClick={()=>uP(group.id,si,sub.id,"cbCambioVal",sd.cbCambioVal===opt?"":opt)} style={{padding:"6px 14px",borderRadius:6,border:sd.cbCambioVal===opt?"2px solid #6f42c1":"2px solid var(--tf-w100)",background:sd.cbCambioVal===opt?"var(--tf-6f42c1)":"var(--tf-w40)",color:sd.cbCambioVal===opt?"#fff":"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:"pointer"}}>{opt}</button>
                )}
              </div>
              {sd.cbCambioVal&&(
                <div style={{display:"grid",gridTemplateColumns:["Caring","CL0","CL1","CL2","CL3"].indexOf(sd.cbCambioVal)>=0?"1fr":"1fr 1fr",gap:"8px 14px"}}>
                  <TF l="Cellulare" r v={sd.cbCambioCell||""} o={v=>{uP(group.id,si,sub.id,"cbCambioCell",v);if(sd.cbTnp)uP(group.id,si,sub.id,"cbTnpCell",v)}} p="3XXXXXXXXX" nt={sd.cbCambioCell===anaCel&&anaCel?"Da anagrafica":""}/>
                  {["Caring","CL0","CL1","CL2","CL3"].indexOf(sd.cbCambioVal)<0&&(
                    <TF l="Codice Contratto" r v={sd.cbCambioCC||""} o={v=>{uP(group.id,si,sub.id,"cbCambioCC",v);if(sd.cbTnp)uP(group.id,si,sub.id,"cbTnpCC",v)}} p="es. 167942" err={dupCheck&&dupCheck("CODCONTR",sd.cbCambioCC)?"Codice contratto già usato in un altro prodotto":""}/>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Add-on section inside CB */}
          {sub.cbAddonVals&&sd.cbAddon&&(
            <div style={{padding:10,background:"rgba(40,167,69,0.10)",borderRadius:8,border:"1px solid rgba(40,167,69,0.3)",marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--tf-28a745)",marginBottom:8,textTransform:"uppercase"}}>{sub.isCBBiz?"Add-on / Security":"Add-on"}</div>
              <div style={{marginBottom:8,maxWidth:250}}>
                <SCd session={sessionCode} codici={codiciW3} val={sd.cbAddonCodIns||(sd.cbTnpCodIns||sd.cbCambioCodIns||"")} onCh={v=>uP(group.id,si,sub.id,"cbAddonCodIns",v)}/>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {sub.cbAddonVals.map(opt=>
                  <button key={opt} onClick={()=>{const cur=sd.cbAddonSel[opt];uP(group.id,si,sub.id,"cbAddonSel",{...sd.cbAddonSel,[opt]:!cur});if(!cur&&opt==="Security"&&!sd.cbAddonSecCell&&anaCel)uP(group.id,si,sub.id,"cbAddonSecCell",anaCel)}} style={{padding:"6px 14px",borderRadius:6,border:sd.cbAddonSel[opt]?"2px solid #28a745":"2px solid var(--tf-w100)",background:sd.cbAddonSel[opt]?"rgba(40,167,69,0.12)":"var(--tf-w40)",color:sd.cbAddonSel[opt]?"var(--tf-28a745)":"var(--tf-8892b0)",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                    <span>{sd.cbAddonSel[opt]?"☑":"☐"}</span>{opt}
                  </button>
                )}
                {sub.isCBBiz&&(!sd.cbTnp||(sd.cbTnp&&sd.cbCambio&&(sd.cbTnpReload===false||sd.cbTnpReload===null)))&&(
                  <button onClick={()=>{const cur=sd.cbAddonSel["Reload Open"];uP(group.id,si,sub.id,"cbAddonSel",{...sd.cbAddonSel,"Reload Open":!cur});if(!cur&&!sd.cbAddonRoCell&&anaCel)uP(group.id,si,sub.id,"cbAddonRoCell",anaCel)}} style={{padding:"6px 14px",borderRadius:6,border:sd.cbAddonSel["Reload Open"]?"2px solid #28a745":"2px solid var(--tf-w100)",background:sd.cbAddonSel["Reload Open"]?"rgba(40,167,69,0.12)":"var(--tf-w40)",color:sd.cbAddonSel["Reload Open"]?"var(--tf-28a745)":"var(--tf-8892b0)",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                    <span>{sd.cbAddonSel["Reload Open"]?"☑":"☐"}</span>Reload Open
                  </button>
                )}
              </div>
              {sd.cbAddonSel&&sd.cbAddonSel["Security"]&&(
                <div style={{marginTop:10,maxWidth:260}}>
                  <TF l="Cellulare" r v={sd.cbAddonSecCell||""} o={v=>uP(group.id,si,sub.id,"cbAddonSecCell",v)} p="3XXXXXXXXX" nt={sd.cbAddonSecCell===anaCel&&anaCel?"Da anagrafica":""}/>
                </div>
              )}
              {sd.cbAddonSel&&sd.cbAddonSel["Reload Open"]&&(
                <div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                  <TF l="Cellulare" r v={sd.cbAddonRoCell||""} o={v=>uP(group.id,si,sub.id,"cbAddonRoCell",v)} p="3XXXXXXXXX" nt={sd.cbAddonRoCell===anaCel&&anaCel?"Da anagrafica":""}/>
                  <TF l="IMEI" r v={sd.cbAddonRoImei||""} o={v=>uP(group.id,si,sub.id,"cbAddonRoImei",v)} p="15 cifre" nt="Barcode 📷"/>
                </div>
              )}
            </div>
          )}
          {!sub.isCBBiz&&sd.cbRf&&(
            <div style={{padding:10,background:"rgba(0,114,198,0.10)",borderRadius:8,border:"1px solid var(--tf-w120)",marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--tf-2e75b6)",marginBottom:8,textTransform:"uppercase"}}>Dati Reload Forever</div>
              <div style={{marginBottom:8,maxWidth:250}}>
                <SCd session={sessionCode} codici={codiciW3} val={sd.cbRfCodIns||(sd.cbTnpCodIns||sd.cbCambioCodIns||"")} onCh={v=>uP(group.id,si,sub.id,"cbRfCodIns",v)}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Modello Terminale" r v={sd.rfModello||""} o={v=>uP(group.id,si,sub.id,"rfModello",v)} vals={SOLO_ALTRO} cerca={cercaTerminali}/>
                <TF l="IMEI" r v={sd.rfImei||""} o={v=>uP(group.id,si,sub.id,"rfImei",v)} p="15 cifre" nt="Barcode 📷"/>
              </div>
            </div>
          )}
        </div>
      )}
      {!sub.isMobile&&!sub.isMobileBiz&&!sub.isProtecta&&!sub.isFisso&&!sub.isCB&&!sub.hasAddons&&sub.fields&&sub.fields.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:sub.fields.length>1?"1fr 1fr":"1fr",gap:"8px 14px"}}>
          {sub.fields.map(fl=><DD key={fl.key} l={fl.label} v={f[fl.key]||""} o={v=>uF(group.id,si,sub.id,fl.key,v)} vals={fl.values}/>)}
        </div>
      )}

      {/* Fisso: VoceCasaCB question (only FISSO CB) */}
      {sub.hasVoceCasaQ&&(
        <div style={{marginBottom:8}}>
          <YN val={sd.voceCasaCb} onCh={v=>{uP(group.id,si,sub.id,"voceCasaCb",v);if(v===true||v==="Sì")uP(group.id,si,sub.id,"domiciliato",true)}} label="Trattasi di Voce Casa CB?"/>
        </div>
      )}

      {/* Fisso: DOMICILIATO + CONVERGENTE */}
      {sub.isFisso&&(
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:140}}><div style={{fontSize:12,fontWeight:700,color:(isVCMode||bizDomLocked)?"var(--tf-64748b)":"var(--tf-f8fafc)",marginBottom:6}}>Domiciliato?</div><div style={{display:"flex",gap:8}}>
            {(isVCMode||bizDomLocked)?(
              <div style={{display:"flex",alignItems:"center",gap:6}}><button disabled style={{padding:"6px 20px",borderRadius:6,border:"2px solid #28a745",background:"rgba(40,167,69,0.12)",color:"var(--tf-28a745)",fontSize:12,fontWeight:700,cursor:"not-allowed"}}>Sì</button><span style={{fontSize:10,color:"var(--tf-64748b)",fontStyle:"italic"}}>{isVCMode||sub.domLocked?"Obbligatorio":"Business"}</span></div>
            ):(<>
              <button onClick={()=>uP(group.id,si,sub.id,"domiciliato",true)} style={{padding:"6px 20px",borderRadius:6,border:sd.domiciliato===true?"2px solid #28a745":"2px solid var(--tf-w100)",background:sd.domiciliato===true?"rgba(40,167,69,0.12)":"var(--tf-w40)",color:sd.domiciliato===true?"var(--tf-28a745)":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>Sì</button>
              <button onClick={()=>uP(group.id,si,sub.id,"domiciliato",false)} style={{padding:"6px 20px",borderRadius:6,border:sd.domiciliato===false?"2px solid #dc3545":"2px solid var(--tf-w100)",background:sd.domiciliato===false?"rgba(220,53,69,0.12)":"var(--tf-w40)",color:sd.domiciliato===false?"var(--tf-f87171)":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>No</button>
            </>)}
          </div></div>
          <div style={{flex:1,minWidth:140}}><div style={{fontSize:12,fontWeight:700,color:"var(--tf-f8fafc)",marginBottom:6}}>Convergente?</div><div style={{display:"flex",gap:8}}>
            <button onClick={()=>uP(group.id,si,sub.id,"convergente",true)} style={{padding:"6px 20px",borderRadius:6,border:sd.convergente===true?"2px solid #28a745":"2px solid var(--tf-w100)",background:sd.convergente===true?"rgba(40,167,69,0.12)":"var(--tf-w40)",color:sd.convergente===true?"var(--tf-28a745)":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>Sì</button>
            <button onClick={()=>uP(group.id,si,sub.id,"convergente",false)} style={{padding:"6px 20px",borderRadius:6,border:sd.convergente===false?"2px solid #dc3545":"2px solid var(--tf-w100)",background:sd.convergente===false?"rgba(220,53,69,0.12)":"var(--tf-w40)",color:sd.convergente===false?"var(--tf-f87171)":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>No</button>
          </div></div>
        </div>
      )}

      {/* GNP */}
      {sub.hasGnpQ&&<><YN val={sd.gnp} onCh={v=>uP(group.id,si,sub.id,"gnp",v)} label="C'è una GNP?"/>
        {sd.gnp&&<div style={{padding:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
          <TF l="N. Fisso Definitivo da portare" r v={sd.gnpNum||""} o={v=>uP(group.id,si,sub.id,"gnpNum",v)} p="Numero"/>
          <DD l="Op. provenienza GNP" r v={sd.gnpOp||""} o={v=>uP(group.id,si,sub.id,"gnpOp",v)} vals={GNP_FISSO_BRANDS}/>
        </div>}</>}

      {sub.has2LQ&&<YN val={sd.secondaLinea} onCh={v=>uP(group.id,si,sub.id,"secondaLinea",v)} label="C'è una seconda linea?"/>}
      {sub.has2LQ&&(sd.secondaLinea===true||sd.secondaLinea==="Sì")&&(
        <div style={{padding:10,background:"rgba(0,114,198,0.10)",borderRadius:8,border:"1px solid var(--tf-w120)",marginTop:4}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--tf-2e75b6)",marginBottom:8,textTransform:"uppercase"}}>2° Linea</div>
          <MiniC label="GNP 2° Linea" val={sd.gnp2L} onCh={v=>{uP(group.id,si,sub.id,"gnp2L",v);if(v==="No"||v===false){uP(group.id,si,sub.id,"gnp2LBrand","");uP(group.id,si,sub.id,"gnp2LNum","")}}} opts={["Sì","No"]}/>
          {(sd.gnp2L==="Sì"||sd.gnp2L===true)&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px",marginTop:6}}>
              <DD l="Brand MNP 2° Linea" r v={sd.gnp2LBrand||""} o={v=>uP(group.id,si,sub.id,"gnp2LBrand",v)} vals={["TIM","Vodafone","Fastweb","Sky","Tiscali","WINDTRE","BT Enia","Ehiweb","Infratel","Vianova","Isiline","Convergenze","Full Telecom","Optima","Fibra.tn"]}/>
              <TF l="N. Fisso Portabilità 2° Linea" r v={sd.gnp2LNum||""} o={v=>uP(group.id,si,sub.id,"gnp2LNum",v)} p="06XXXXXXXX"/>
            </div>
          )}
        </div>
      )}

      {/* Addon/Checklist checkboxes (hidden for Voce Casa) */}
      {sub.hasAddons&&sub.addonList&&!isVCMode&&(
        <div style={{marginTop:10,padding:10,background:"var(--tf-w30)",borderRadius:8,border:"1px solid var(--tf-w100)"}}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--tf-f8fafc)",marginBottom:8}}>{sub.isFisso?"Add-on Fisso":"Seleziona prodotti"}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {sub.addonList.map(ad=>
              <button key={ad} onClick={()=>toggleAddon(ad)} style={{padding:"6px 14px",borderRadius:6,border:sd.addons[ad]?"2px solid #28a745":"2px solid var(--tf-w100)",background:sd.addons[ad]?"rgba(40,167,69,0.12)":"var(--tf-w40)",color:sd.addons[ad]?"var(--tf-28a745)":"var(--tf-8892b0)",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:14}}>{sd.addons[ad]?"☑":"☐"}</span>{ad}
              </button>
            )}
          </div>
        </div>
      )}

      {sub.hasDom&&<YN val={sd.domiciliazione} onCh={v=>uP(group.id,si,sub.id,"domiciliazione",v)} label="Domiciliazione bancaria?"/>}

      {/* LG Convergente */}
      {sub.hasConvLG&&(
        <div style={{marginTop:8,padding:10,background:"var(--tf-w30)",borderRadius:8,border:"1px solid var(--tf-w100)"}}>
          <div style={{fontSize:12,fontWeight:700,color:lgConvLocked?"var(--tf-64748b)":"var(--tf-f8fafc)",marginBottom:6}}>Convergente?</div>
          {lgConvLocked?<div style={{display:"flex",alignItems:"center",gap:8}}><button disabled style={{padding:"6px 20px",borderRadius:6,border:"2px solid #dc3545",background:"rgba(220,53,69,0.12)",color:"var(--tf-f87171)",fontSize:12,fontWeight:700,cursor:"not-allowed",opacity:.7}}>No</button><span style={{fontSize:10,color:"var(--tf-64748b)",fontStyle:"italic"}}>Già selezionato altrove</span></div>
          :<div style={{display:"flex",gap:8}}>
            <button onClick={()=>uP(group.id,si,sub.id,"convergente",true)} style={{padding:"6px 20px",borderRadius:6,border:sd.convergente===true?"2px solid #28a745":"2px solid var(--tf-w100)",background:sd.convergente===true?"rgba(40,167,69,0.12)":"var(--tf-w40)",color:sd.convergente===true?"var(--tf-28a745)":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>Sì</button>
            <button onClick={()=>uP(group.id,si,sub.id,"convergente",false)} style={{padding:"6px 20px",borderRadius:6,border:sd.convergente===false?"2px solid #dc3545":"2px solid var(--tf-w100)",background:sd.convergente===false?"rgba(220,53,69,0.12)":"var(--tf-w40)",color:sd.convergente===false?"var(--tf-f87171)":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>No</button>
          </div>}
        </div>
      )}

      {/* Contract data */}
      {sub.hasContract&&!sub.isVFMobile&&!sub.isCBVF&&!sub.isVFFisso&&!sub.isVerisure&&!sub.isKaskoFacile&&!sub.isVFCare&&!sub.isVFBizMobile&&!sub.isCBVFBiz&&!sub.isVFFissoBiz&&!sub.isVFSolDig&&!sub.isFWMobile&&!sub.isFWFisso&&!sub.isFWEnergia&&!sub.isILMobile&&!sub.isILBizMobile&&!sub.isILFisso&&!sub.isILFwa&&!sub.isENLuceGas&&!sub.isTimMobile&&!sub.isTimFisso&&!sub.isTimTelepass&&!sub.isVeryMobile&&!sub.isHoMobile&&!sub.isKenaMobile&&!sub.isW3SostSim&&!sub.isVFSostSim&&!sub.isFWSostSim&&!sub.isBizProtecta&&(
        <div style={{borderTop:"1px solid "+group.color+"20",paddingTop:8,marginTop:8}}>
          <div style={{fontSize:10,fontWeight:600,color:"var(--tf-64748b)",marginBottom:6,textTransform:"uppercase"}}>Dati contratto</div>
          <div style={{marginBottom:8,maxWidth:250}}><SCd session={sessionCode} codici={codiciW3} val={sd.codiceOverride||""} onCh={v=>uP(group.id,si,sub.id,"codiceOverride",v)}/></div>
          {sub.ct==="ga"&&<div style={{display:"grid",gridTemplateColumns:showMnpF&&!sub.isMobileBiz?"1fr 1fr 1fr":"1fr 1fr",gap:"8px 14px"}}>
            <TF l="Codice Contratto" r v={c.codice_contratto||""} o={v=>uC(group.id,si,sub.id,"codice_contratto",v)} p="es. 167942" err={dupCheck&&dupCheck("CODCONTR",c.codice_contratto)?"Codice contratto già usato in un altro prodotto":""}/>
            <TF l="Numero Provvisorio" r v={c.num_provvisorio||""} o={v=>uC(group.id,si,sub.id,"num_provvisorio",v)} p="393XXX"/>
            {showMnpF&&!sub.isMobileBiz&&<TF l="N. Definitivo MNP" r v={c.num_definitivo||""} o={v=>uC(group.id,si,sub.id,"num_definitivo",v)} p="Portare"/>}
            {showMnpF&&!sub.isMobileBiz&&<DD l="Brand MNP" r v={c.brand_mnp||""} o={v=>uC(group.id,si,sub.id,"brand_mnp",v)} vals={brandMNP}/>}
            {showMnpF&&sub.isMobileBiz&&<TF l="N. Definitivo MNP" r v={c.num_definitivo||""} o={v=>uC(group.id,si,sub.id,"num_definitivo",v)} p="Portare"/>}
            <TF l="ICCID" r v={c.iccid||""} o={v=>uC(group.id,si,sub.id,"iccid",v)} p="893..." nt="Barcode 📷"/>
            {sub.isMobileBiz&&(sd.tnpGa==="Sì"||sd.tnpGa===true)&&sd.tnpTipo&&<DD l="Modello Terminale" r v={c.modello||""} o={v=>uC(group.id,si,sub.id,"modello",v)} vals={SOLO_ALTRO} cerca={cercaTerminali}/>}
            {sub.isMobileBiz&&(sd.tnpGa==="Sì"||sd.tnpGa===true)&&sd.tnpTipo&&<TF l="IMEI" r v={c.imei||""} o={v=>uC(group.id,si,sub.id,"imei",v)} p="15 cifre" nt="Barcode 📷"/>}
          </div>}
          {sub.ct==="tnp_ga"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px 14px"}}>
            <TF l="Codice Contratto" r v={gaOn?(gaC.codice_contratto||""):(c.codice_contratto||"")} o={v=>uC(group.id,si,sub.id,"codice_contratto",v)} p={gaOn?"← da Mobile GA":"es. 167942"} dis={gaOn} nt={gaOn?"Auto da Mobile GA":""} err={dupCheck&&dupCheck("CODCONTR",gaOn?gaC.codice_contratto:c.codice_contratto)?"Codice contratto già usato in un altro prodotto":""}/>
            <DD l="Modello Terminale" v={c.modello||""} o={v=>uC(group.id,si,sub.id,"modello",v)} vals={SOLO_ALTRO} cerca={cercaTerminali}/>
            <TF l="IMEI" v={c.imei||""} o={v=>uC(group.id,si,sub.id,"imei",v)} p="15 cifre" nt="Barcode 📷"/>
          </div>}
          {sub.ct==="tnp_cb"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px 14px"}}>
            <TF l="Codice Contratto" r v={c.codice_contratto||""} o={v=>uC(group.id,si,sub.id,"codice_contratto",v)} p="es. 167942" err={dupCheck&&dupCheck("CODCONTR",c.codice_contratto)?"Codice contratto già usato in un altro prodotto":""}/>
            <DD l="Modello Terminale" v={c.modello||""} o={v=>uC(group.id,si,sub.id,"modello",v)} vals={SOLO_ALTRO} cerca={cercaTerminali}/>
            <TF l="IMEI" v={c.imei||""} o={v=>uC(group.id,si,sub.id,"imei",v)} p="15 cifre" nt="Barcode 📷"/>
          </div>}
          {sub.ct==="fisso"&&!isVCMode&&<div style={{display:"grid",gridTemplateColumns:sub.hasFwaImei?"1fr 1fr 1fr":"1fr 1fr",gap:"8px 14px"}}>
            <TF l="Codice Contratto" r v={c.codice_contratto||""} o={v=>uC(group.id,si,sub.id,"codice_contratto",v)} p="es. 167942" err={dupCheck&&dupCheck("CODCONTR",c.codice_contratto)?"Codice contratto già usato in un altro prodotto":""}/>
            <TF l="N. Fisso Provvisorio" r v={c.num_fisso_prov||""} o={v=>uC(group.id,si,sub.id,"num_fisso_prov",v)} p="06XXXX"/>
            {sub.hasFwaImei&&<TF l="IMEI" r v={c.imei||""} o={v=>uC(group.id,si,sub.id,"imei",v)} p="15 cifre" nt="Barcode 📷"/>}
          </div>}
          {sub.ct==="fisso"&&isVCMode&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px 14px"}}>
            <TF l="Codice Contratto" r v={c.codice_contratto||""} o={v=>uC(group.id,si,sub.id,"codice_contratto",v)} p="es. 167942" err={dupCheck&&dupCheck("CODCONTR",c.codice_contratto)?"Codice contratto già usato in un altro prodotto":""}/>
            <TF l="N. Fisso Provvisorio" r v={c.num_fisso_prov||""} o={v=>uC(group.id,si,sub.id,"num_fisso_prov",v)} p="06XXXX"/>
            <TF l="IMEI" r v={c.imei||""} o={v=>uC(group.id,si,sub.id,"imei",v)} p="15 cifre" nt="Barcode 📷"/>
          </div>}
          {sub.ct==="lg"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px 14px"}}>
            <DD l="Operatore provenienza" r v={sd.opProvenienza||""} o={v=>uP(group.id,si,sub.id,"opProvenienza",v)} vals={opProvNoW3}/>
            <TF l="Codice Contratto" r v={c.codice_contratto||""} o={v=>uC(group.id,si,sub.id,"codice_contratto",v)} p="es. 167942" err={dupCheck&&dupCheck("CODCONTR",c.codice_contratto)?"Codice contratto già usato in un altro prodotto":""}/>
            {sub.id==="luce"&&<TF l="POD" r v={c.pod||""} o={v=>uC(group.id,si,sub.id,"pod",v.toUpperCase().replace(/[^A-Z0-9]/g,""))} p="IT001E..." nt="IT + 14-15 caratteri" err={dupCheck&&dupCheck("POD",c.pod)?"POD già inserito in questo contratto":""}/>}
            {sub.id==="gas"&&<TF l="PDR" r v={c.pdr||""} o={v=>uC(group.id,si,sub.id,"pdr",v.replace(/\D/g,""))} p="14 cifre" nt="14 cifre numeriche" err={dupCheck&&dupCheck("PDR",c.pdr)?"PDR già inserito in questo contratto":""}/>}
          </div>}
          {sub.ct==="multi"&&(sub.isAssicBiz||sub.id==="assicurazioni")&&(
            <div style={{maxWidth:260}}>
              <TF l="Numero Polizza" v={c.nPolizza||""} o={v=>uC(group.id,si,sub.id,"nPolizza",v)} p="es. 12345678"/>
            </div>
          )}
        </div>
      )}
    </div>
  );
  const content = <SubKeyCtx.Provider value={_subKey}>{_inner}</SubKeyCtx.Provider>;
  return content;
};

// Segnalazione 21: l'intero Step 7 era scollegato. La textarea della nota e i
// campi del promemoria non avevano ne' value ne' onChange, quindi quello che
// l'operatore scriveva restava nel DOM e spariva al salvataggio: 0 contratti su
// 62 avevano una nota. Ora lo stato vive nel genitore e viene salvato.
// SCELTA ESPLICITA Sì/NO (Luca 05/08): prima il "No" sembrava gia' flaggato
// (i bottoni coloravano sul booleano notaOn, che parte a false) e lo step non
// risultava mai "completo". Ora `scelta` e' un tri-stato null|"si"|"no":
// NESSUN bottone preselezionato; appena l'operatore ne flagga uno lo step
// diventa verde nella barra e compare "Vai al carrello →" nel footer.
const NoteStep = ({store,show,setShow,scelta,setScelta,nota,setNota,pData,setPData,pOra,setPOra,pNeg,setPNeg,pDesc,setPDesc}) => {
  const negozioPro=pNeg, setNegozioPro=setPNeg;
  useEffect(()=>{if(store)setNegozioPro(p=>p||store);},[store]);
  const si=scelta==="si", no=scelta==="no";
  const content = (
    <div style={{background:"var(--tf-w20)",borderRadius:14,padding:18,marginBottom:12,borderLeft:"4px solid #e83e8c",boxShadow:"var(--rv-shadow)"}}>
      <div style={{fontSize:11,fontWeight:700,color:"var(--tf-e83e8c)",marginBottom:14,textTransform:"uppercase"}}>📝 Step 7 — Note / Promemoria</div>
      <div style={{textAlign:"center",marginBottom:show?16:0}}>
        <div style={{fontSize:13,fontWeight:600,color:"var(--tf-f8fafc)",marginBottom:10}}>Vuoi aggiungere delle note?</div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={()=>{setScelta("si");setShow(true);}} style={{padding:"8px 28px",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",border:si?"2px solid #28a745":"2px solid var(--tf-w100)",background:si?"rgba(40,167,69,0.12)":"var(--tf-w40)",color:si?"var(--tf-28a745)":"var(--tf-8892b0)"}}>Sì</button>
          <button onClick={()=>{setScelta("no");setShow(false);}} style={{padding:"8px 28px",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",border:no?"2px solid #dc3545":"2px solid var(--tf-w100)",background:no?"rgba(220,53,69,0.12)":"var(--tf-w40)",color:no?"var(--tf-f87171)":"var(--tf-8892b0)"}}>No</button>
        </div>
        {!scelta&&<div style={{fontSize:11,color:"var(--tf-64748b)",marginTop:8}}>Scegli Sì o No per completare lo step</div>}
      </div>
      {show&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={{border:"1px solid var(--tf-w100)",borderRadius:10,padding:14,background:"var(--tf-w30)"}}><div style={{fontSize:13,fontWeight:700,marginBottom:8}}>📋 Nota</div><textarea placeholder="Nota…" rows={3} value={nota} onChange={e=>setNota(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/></div>
        <div style={{border:"1px solid var(--tf-w100)",borderRadius:10,padding:14,background:"var(--tf-w30)"}}><div style={{fontSize:13,fontWeight:700,marginBottom:8}}>📅 Promemoria</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><div><div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:3}}>Data</div><input type="date" value={pData} onChange={e=>setPData(e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12,boxSizing:"border-box"}}/></div><div><div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:3}}>Ora</div><input type="time" value={pOra} onChange={e=>setPOra(e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12,boxSizing:"border-box"}}/></div></div>
          {/* Negozio: si auto-compila dal login ma resta modificabile a mano. */}
          <div style={{marginTop:8}}><DD l="Negozio" v={negozioPro} o={v=>setNegozioPro(v)} vals={negozi} nt="Dal login — modificabile"/></div>
          <div style={{marginTop:8}}><div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:3}}>Descrizione</div><textarea placeholder="Dettagli…" rows={2} value={pDesc} onChange={e=>setPDesc(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/></div>
        </div>
      </div>}
    </div>
  );
  return content;
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

function CRM() {
  // Sottoscrizione alle liste caricate dal DB: senza queste, `venditori` e
  // `negozi` si riempiono dopo il primo render e il menu a tendina resta vuoto
  // finche' qualcos'altro non provoca un aggiornamento. useNegozi() esisteva
  // gia' ma non era mai stata chiamata da nessuno.
  useVenditori();
  useNegozi();
  const [brand,setBrand]=useState(null);
  const [showMargPOS,setShowMargPOS]=useState(false);
  // P&M come un BRAND (Luca 03/08): step Prodotti a piena pagina, non più
  // il foglietto dal basso. margFlow = flusso marginalità attivo.
  const [margFlow,setMargFlow]=useState(false);
  // MOD-44c (Luca 10/08): anche la marginalità PASSA dallo step Cliente.
  // Lo skip è una scelta esplicita (popup CRM) e viene TRACCIATA sulla vendita.
  const [margSkipCli,setMargSkipCli]=useState(false);
  const [margSkipPopup,setMargSkipPopup]=useState(false);
  const [margEditItem,setMargEditItem]=useState(null);
  const [showMargList,setShowMargList]=useState(false);
  const [showMargSection,setShowMargSection]=useState(false);
  const [showMargSave,setShowMargSave]=useState(false);
  // anagrafica COMPLETA come nel flusso brand (Luca 31/07): privato/business
  // con CF/P.IVA, residenza, email — non solo nome+telefono
  const MARG_FORM_VUOTO={tipo:"privato",nome:"",cognome:"",ragioneSociale:"",nomeRef:"",cognomeRef:"",cfRef:"",cf:"",tel:"",fisso:"",email:"",via:"",cap:"",citta:"",anonimo:false};
  const [margSaveForm,setMargSaveForm]=useState({...MARG_FORM_VUOTO});
  // RICERCA ANAGRAFICA nel checkout (Luca 31/07): stesso campo unico di
  // Registra Vendita / Registra Usato — cognome, nome, cellulare o CF; se
  // esiste si seleziona, altrimenti si crea con i campi sotto.
  const [margCliCerca,setMargCliCerca]=useState("");
  const [margCliHits,setMargCliHits]=useState([]);
  const [margCliSel,setMargCliSel]=useState(null);
  useEffect(()=>{
    if(!showMargSave||margSaveForm.anonimo||margCliSel){setMargCliHits([]);return;}
    const v=margCliCerca.trim().replace(/[(),]/g," ").replace(/\s+/g," ");
    if(v.length<3){setMargCliHits([]);return;}
    let vivo=true;
    const t=setTimeout(async()=>{
      const parole=v.split(" ").filter(Boolean);
      const cifre=v.replace(/\D/g,"");
      let q=supabase.from("clients").select("id,tipo,nome,cognome,ragione_sociale,cf_piva,cellulare").limit(6);
      if(parole.length>=2){
        q=q.or(`and(nome.ilike.%${parole[0]}%,cognome.ilike.%${parole[1]}%),and(nome.ilike.%${parole[1]}%,cognome.ilike.%${parole[0]}%),ragione_sociale.ilike.%${v}%`);
      }else{
        q=q.or(`cf_piva.ilike.%${v}%,nome.ilike.%${v}%,cognome.ilike.%${v}%,ragione_sociale.ilike.%${v}%${cifre.length>=4?`,cellulare.ilike.%${cifre}%`:""}`);
      }
      const {data}=await q;
      if(vivo)setMargCliHits(data||[]);
    },300);
    return()=>{vivo=false;clearTimeout(t)};
  },[margCliCerca,showMargSave,margSaveForm.anonimo,margCliSel]);
  const margCliLabel=(c)=>c.ragione_sociale||`${c.nome||""} ${c.cognome||""}`.trim()||c.cf_piva||c.id;
  const chiudiMargSave=()=>{setShowMargSave(false);setMargCliCerca("");setMargCliHits([]);setMargCliSel(null);};
  const [margItems,setMargItems]=useState([]);
  const [expR,setExpR]=useState({}); // riepilogo destro: gruppi esplosi/chiusi
  const [cambioBrand,setCambioBrand]=useState(false); // (legacy, non piu' in UI)
  // UNO STEP ALLA VOLTA (Luca 03/08 sera): la pagina mostra SOLO lo step
  // attivo; si naviga dalla barra in alto. Il flusso dati (showAna/showStep4)
  // resta com'era: questa e' solo la vista.
  const [vistaStep,setVistaStep]=useState("brand");
  // gli step "si compilano" solo quando ci APPRODI (Luca: niente 100% regalati)
  const [stepVisti,setStepVisti]=useState({});
  useEffect(()=>{setStepVisti(p=>p[vistaStep]?p:{...p,[vistaStep]:true});},[vistaStep]);
  // Step 7 — nota e promemoria (segnalazione 21)
  const [notaOn,setNotaOn]=useState(false);
  // Scelta ESPLICITA Sì/No sulle note (Luca 05/08): null = non ancora scelto.
  // Lo step Note e' "completo" (cerchio verde + bottone "Vai al carrello")
  // SOLO dopo la scelta; notaOn resta il booleano usato dal submit e viene
  // tenuto in sincrono (si -> true, no -> false).
  const [notaScelta,setNotaScelta]=useState(null);
  const [nota,setNota]=useState("");
  const [promData,setPromData]=useState("");
  const [promOra,setPromOra]=useState("");
  const [promNeg,setPromNeg]=useState("");
  const [promDesc,setPromDesc]=useState("");
  // Data della vendita: prima i due campi "Data"/"Giorno" del carrello erano
  // input non controllati (defaultValue), quindi quello che sceglieva l'operatore
  // non veniva mai letto; in piu' il ramo solo-marginalita' aveva la data fissa
  // "2026-03-07". Ora e' un unico stato, inizializzato a oggi.
  const [dataVendita,setDataVendita]=useState(()=>new Date().toISOString().split("T")[0]);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  // NB: materializzare SUBITO la FileList. Se si costruisce l'array dentro
  // l'updater di setState, quando l'updater viene eseguito l'input e' gia' stato
  // svuotato (e.target.value="") e la FileList risulta vuota.
  // ALLEGATI PER CONTRATTO (Luca 05/08): contratto/altro portano una `rowKey`
  // (la chiave della riga di carrello a cui appartengono); documento/fattura
  // restano a livello carrello (rowKey null) e valgono per tutta la vendita.
  const addFiles = (fileList, type, rowKey = null) => {
    const nf = Array.from(fileList || []).map(file => ({ file, name: file.name, type, rowKey: rowKey || null }));
    if (nf.length) setAttachments(prev => [...prev, ...nf]);
    return nf.length;
  };
  const handleFileChange = (e, type, rowKey = null) => { addFiles(e.target.files, type, rowKey); e.target.value = ""; };
  // Trascinamento file sulle caselle Documento / Contratti / Altro (richiesta Francesco).
  // dragBox contiene l'ID univoco della casella (tipo + rowKey), perche' ora
  // le caselle Contratto/Altro sono UNA PER RIGA di carrello.
  const [dragBox, setDragBox] = useState(null);   // quale casella e' sotto il cursore
  const boxIdDi = (t, rowKey) => t + "::" + (rowKey || "");
  const onBoxDragOver = (e, boxId) => { e.preventDefault(); e.stopPropagation(); if (dragBox !== boxId) setDragBox(boxId); };
  const onBoxDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragBox(null); };
  const onBoxDrop = (e, t, rowKey = null) => {
    e.preventDefault(); e.stopPropagation(); setDragBox(null);
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length) addFiles(dt.files, t, rowKey);
  };
  // ── Carica dal telefono via QR ─────────────────────────────────────
  // Crea una sessione effimera, mostra un QR; il telefono apre /m/u/<token>,
  // carica il file (foto per Documento, PDF per gli altri) e il desktop lo tira
  // dentro `attachments` come un normale allegato (stesso salvataggio al submit).
  const [qrBox, setQrBox] = useState(null);     // tipo casella con QR aperto
  const [qrRow, setQrRow] = useState(null);     // rowKey della riga (caselle per-contratto)
  const [qrToken, setQrToken] = useState(null);
  const [qrImg, setQrImg] = useState(null);     // dataURL del QR
  const [qrRecv, setQrRecv] = useState(null);   // {name} a ricezione avvenuta
  // anteprima allegato: clic sul nome -> mostra foto o PDF
  const [preview, setPreview] = useState(null); // {url,name,mime}
  // mime "indovinato" dall'estensione: serve per gli allegati RIUSATI
  // dall'archivio (righe contract_attachments), dove non c'e' un File in memoria.
  const _mimeDaNome = (s) => /\.pdf(\?.*)?$/i.test(s || "") ? "application/pdf" : (/\.(jpe?g|png|gif|webp|bmp|heic)(\?.*)?$/i.test(s || "") ? "image/jpeg" : "");
  const apriAnteprima = (att) => {
    // allegato riusato dall'archivio: niente objectURL, si apre il file gia' nel bucket
    if (att && att.reused && att.url) { setPreview({ url: att.url, name: att.name, mime: _mimeDaNome(att.name || att.url) }); return; }
    try { setPreview({ url: URL.createObjectURL(att.file), name: att.name, mime: att.file?.type || "" }); }
    catch { /* file non disponibile */ }
  };
  const chiudiAnteprima = () => { if (preview?.url) { try { URL.revokeObjectURL(preview.url); } catch { } } setPreview(null); };
  const openQr = async (type, rowKey = null) => {
    try {
      const token = (window.crypto?.randomUUID?.() || (Date.now() + "-" + Math.random().toString(36).slice(2)));
      // documento = solo foto (una o piu'); contratti/altro = foto o scansione PDF
      const kind = type === "documento" ? "foto" : "doc";
      const { error } = await supabase.from("qr_uploads").insert({ token, box_type: type, kind, status: "attesa" });
      if (error) { alert("QR non generato: " + error.message); return; }
      const url = `${window.location.origin}/m/u/${token}`;
      const img = await QRCode.toDataURL(url, { width: 240, margin: 1 });
      setQrBox(type); setQrRow(rowKey || null); setQrToken(token); setQrImg(img); setQrRecv(null);
    } catch (e) { alert("QR non generato: " + (e?.message || e)); }
  };
  const closeQr = () => { setQrBox(null); setQrRow(null); setQrToken(null); setQrImg(null); setQrRecv(null); };
  useEffect(() => {
    if (!qrToken) return;
    let alive = true;
    const t = setInterval(async () => {
      const { data } = await supabase.from("qr_uploads").select("status,files").eq("token", qrToken).maybeSingle();
      if (!alive || !data) return;
      const files = Array.isArray(data.files) ? data.files : [];
      if (data.status === "caricato" && files.length) {
        clearInterval(t);
        try {
          for (const f of files) {
            const resp = await fetch(f.url);
            const blob = await resp.blob();
            const file = new File([blob], f.name || "allegato", { type: f.mime || blob.type });
            setAttachments(p => [...p, { file, name: file.name, type: qrBox, rowKey: qrRow || null }]);
          }
          setQrRecv({ n: files.length });
        } catch (e) { alert("Ricezione file non riuscita: " + (e?.message || e)); }
        // pulizia: rimuovi i file di staging + riga sessione
        try {
          for (const f of files) {
            const marker = "/qr-uploads/"; const i = String(f.url).indexOf(marker);
            if (i >= 0) await supabase.storage.from("qr-uploads").remove([decodeURIComponent(String(f.url).slice(i + marker.length))]);
          }
        } catch { }
        try { await supabase.from("qr_uploads").delete().eq("token", qrToken); } catch { }
        setTimeout(() => { if (alive) closeQr(); }, 1600);
      }
    }, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [qrToken, qrBox, qrRow]);
  const [draftLoaded,setDraftLoaded]=useState(false);
  const [showCart,setShowCart]=useState(false);
  // DRAWER carrello (revamp 03/08): il riepilogo live si apre su QUALSIASI
  // schermo dal bottone flottante; sui monitor >=1600px resta fisso come prima
  const [drawerCarrello,setDrawerCarrello]=useState(false);
  const [toast,setToast]=useState(null);
  const [expI,setExpI]=useState({});
  const [tipoCliente,setTipoCliente]=useState(null);
  const [lookupValue,setLookupValue]=useState("");
  const [clienteFound,setClienteFound]=useState(false);
  const [lookupDone,setLookupDone]=useState(false);
  const [lookupBusy,setLookupBusy]=useState(false);
  // MATCH APPUNTAMENTO (cantiere 08/08): avviso quando il CF cercato ha un
  // appuntamento aperto preso da un caller — la vendita lo attivera' al salvataggio.
  const [apptAvviso,setApptAvviso]=useState(null);
  const verificaAppuntamentoBanner=async(cf,cfRef)=>{
    try{
      if(!cf&&!cfRef){setApptAvviso(null);return;}
      const apps=await appuntamentiPerCF(cf||"",cfRef||"");
      const aperto=apps.find(a=>!["attivato","attivato_diverso_negozio","ko","annullato"].includes(String(a.status||"")));
      setApptAvviso(aperto?{da:aperto.created_by||"un caller",data:aperto.date,store:aperto.store}:null);
    }catch{setApptAvviso(null);}
  };
  // POPUP decisionale (Luca 08/08): quando la vendita chiude un appuntamento
  // dello STESSO negozio, si CHIEDE al venditore se associarla (l'appuntamento
  // puo' essere vecchio). {app, contractIds, firma}. Il caso "altro negozio" e'
  // automatico (attivato_diverso_negozio, nessuna cooperation) senza popup.
  const [matchPending,setMatchPending]=useState(null);
  const [matchBusy,setMatchBusy]=useState(false);
  const confermaMatch=async(assoc)=>{
    const mp=matchPending; if(!mp)return;
    if(!assoc){setMatchPending(null);return;}
    setMatchBusy(true);
    try{ await agganciaVenditaAppuntamento(mp.app.id, mp.contractIds, mp.firma, true); }
    catch(e){ console.error("[MATCH-APP]",e); }
    setMatchBusy(false); setMatchPending(null);
  };
  const [showAna,setShowAna]=useState(false);
  const [ana,setAna]=useState({nome:"",cognome:"",cellulare:"",email:"",via:"",cap:"",citta:"",iban:"",cf:"",ragioneSociale:"",nomeRef:"",cognomeRef:"",cfRef:"",recapito:"",fisso:"",intDiverso:false,intNome:"",intCognome:"",intCf:""});
  // FLAG TURISTA (03/08, mig. 140): cliente di passaggio SENZA CF italiano.
  // Col flag attivo il CF non e' richiesto, ma la vendita e' limitata a
  // WindTre PRIVATO (categorie Mobile Wallet e Customer Base) o Marginalita'.
  const [turista,setTurista]=useState(false);
  useEffect(()=>{if(tipoCliente==="business"&&turista)setTurista(false);},[tipoCliente,turista]);
  const [sales,setSales]=useState({});
  const [sesCode,setSesCode]=useState("");
  const [cart,setCart]=useState([]);

  // ── CATALOGO A 6 LIVELLI: albero del brand selezionato (tabelle catalog_*,
  //    solo voci attive), con cache per sessione. È LA fonte di voci e livelli:
  //    i vecchi getW3/getVF/... restano nel file solo come riferimento storico.
  const [catTree,setCatTree]=useState(null);
  const _catCacheRef=useRef({});
  // Regole CAMPI amministrabili (mig. 094): caricate una volta; finché non
  // arrivano vale il generato dall'artifatto, quindi mai senza campi.
  useEffect(()=>{(async()=>{try{
    const {data}=await supabase.from("catalog_campi_regole").select("*").order("ordine");
    if(data&&data.length)impostaRegoleCampi(data);
  }catch(e){/* fallback al generato */}})();},[]);
  useEffect(()=>{let al=true;const slug=brand?SLUG_CATALOGO[brand]:null;
    if(!slug){setCatTree(null);return;}
    const hit=_catCacheRef.current[slug];
    if(hit){setCatTree(hit);return;}
    (async()=>{try{
      const [rc,rp]=await Promise.all([
        supabase.from("catalog_categorie").select("*").eq("attivo",true).order("ordine"),
        supabase.from("catalog_prodotti").select("*").eq("brand_id",slug).eq("attivo",true),
      ]);
      if(rc.error||rp.error)throw (rc.error||rp.error);
      const prods=rp.data||[];
      let offs=[];
      if(prods.length){
        const ro=await supabase.from("catalog_offerte").select("*, catalog_opzioni(*)").in("prodotto_id",prods.map(x=>x.id)).eq("attivo",true);
        if(ro.error)throw ro.error;
        offs=ro.data||[];
      }
      const t={categorie:rc.data||[],prodotti:prods,offerte:offs};
      // MOD-31: registro della regola "contratto richiesto" (colonne del
      // catalogo, risolte offerta→prodotto→categoria→brand allo step Allegati)
      registraContrattoAlbero(slug,t.categorie,prods,offs);
      _catCacheRef.current[slug]=t;
      if(al)setCatTree(t);
    }catch(e){if(al){setCatTree({categorie:[],prodotti:[],offerte:[]});sT("⚠️ Catalogo non raggiungibile: "+String((e&&e.message)||e));}}})();
    return()=>{al=false};
  },[brand]); // eslint-disable-line react-hooks/exhaustive-deps

  // Venditore e Negozio: precompilati dal login (prima erano fissi "Alberto"/"Magliana").
  const { user } = useAuth();
  const [selVend,setSelVend]=useState("");
  const [selNeg,setSelNeg]=useState("");
  const _loginPrefill=useRef(false);
  useEffect(()=>{
    if(_loginPrefill.current||!user)return;
    _loginPrefill.current=true;
    setSelVend(p=>p||user.name||"");
    setSelNeg(p=>p||user.negozio||"");
  },[user]);
  // ── MATRICE BRAND × NEGOZIO (Luca 06/08): il negozio vede/registra solo i
  // brand concessi da Amministrazione → Catalogo → Brand × Negozio. Senza riga
  // specifica vale il default del brand (catalog_brands.default_abilitato:
  // brand storici true, Kipoint false) — così i negozi mai configurati
  // continuano a vedere tutto tranne i brand "a matrice".
  const [brandRules,setBrandRules]=useState(null);        // {slugCatalogo:{vede,registra}}
  const [brandDefaults,setBrandDefaults]=useState(null);  // {slugCatalogo:boolean}
  useEffect(()=>{let al=true;(async()=>{
    try{
      const neg=user?.negozio||"";
      const [rb,rr]=await Promise.all([
        // select * (non colonne puntuali): cosi' contratto_richiesto arriva
        // quando la migrazione MOD-31 c'e', senza rompere la query quando manca
        supabase.from("catalog_brands").select("*"),
        neg?supabase.from("store_brand_rules").select("brand,vede,registra").eq("store",neg):Promise.resolve({data:[]}),
      ]);
      if(!al)return;
      // MOD-31: regola contratto a livello BRAND nel registro condiviso
      registraContrattoBrands((rb&&rb.data)||[]);
      const defs={};((rb&&rb.data)||[]).forEach(r=>{defs[r.id]=r.default_abilitato!==false;});
      const map={};((rr&&rr.data)||[]).forEach(r=>{map[r.brand]={vede:r.vede!==false,registra:r.registra!==false};});
      setBrandDefaults(defs);setBrandRules(map);
    }catch{if(al){setBrandDefaults({});setBrandRules({});}}
  })();return()=>{al=false};},[user?.negozio]);
  const _brandEff=(b)=>{
    const slug=SLUG_CATALOGO[b.id]||b.id;
    const r=brandRules?brandRules[slug]:null;
    if(r)return r;
    // fallback (regole non caricate o brand senza default a DB): i brand
    // "a matrice" restano nascosti, gli altri liberi come sempre
    const def=(brandDefaults&&(slug in brandDefaults))?brandDefaults[slug]:!b.matrixOnly;
    return {vede:def,registra:def};
  };
  const brandVisibili=BRANDS.filter(b=>_brandEff(b).vede);
  const [confirmReset,setConfirmReset]=useState(false);
  // MOD-2b (Luca 08/08): conferma "nessuna opzione da collegare?" quando si mette
  // in carrello un'offerta che HA opzioni disponibili ma non ne ha scelta nessuna.
  // {offerte:string[], after:fn|null} mentre il popup è aperto; null = chiuso.
  const [confirmNoOpz,setConfirmNoOpz]=useState(null);
  const [showStep4,setShowStep4]=useState(false);
  // quando il flusso apre i prodotti, la vista segue (qui e NON piu' in alto:
  // le dipendenze dell'effect si valutano subito → showStep4 deve esistere)
  useEffect(()=>{if(showStep4)setVistaStep("prodotti");},[showStep4]);
  const [vfQtyModal,setVfQtyModal]=useState(null);
  // Griglia W3 privato (concept Gemini, Luca 03/08): i campi del prodotto si
  // compilano in un MODALE centrale invece che inline. {gid,si,subId}
  const [prodModal,setProdModal]=useState(null);
  // icone su richiesta: Wallet=portafogli, Ric.Auto=banca, il resto invariato
  const iconW3Cat=(g)=>{const n=String(g.title||"").toLowerCase();if(n.includes("wallet"))return "💲";if(n.includes("ric."))return "💳";if(n.includes("ric auto"))return "💳";if(n.includes("sostituz"))return "🪪";return g.icon;};

  const bObj=brand?BRANDS.find(b=>b.id===brand):null;
  // le tendine del terminale leggono il listino di QUESTO brand
  _brandVendita = brand || null;
  _tipoVendita = tipoCliente || null;
  // NUMERI MOBILI della vendita in corso (03/08): per l'aggancio della
  // CONVERGENZA — si scandaglia tutto (vendita corrente + carrello) e ogni
  // numero che sembra un cellulare diventa proponibile con un click
  _numeriMobiliVendita = [...new Set(((JSON.stringify({ sales, cart }) || "").match(/\b3\d{8,9}\b/g) || []))];
  // GRUPPI DAL CATALOGO (stessa forma dei vecchi getXX, per TUTTI i brand,
  // Sky compreso): una card per CATEGORIA con i PRODOTTI del tipo cliente.
  const cats=useMemo(()=>{
    if(!brand||!catTree)return [];
    const tipoCat=tipoCliente==="business"?"Business":"Consumer";
    // TURISTA: si vendono solo Mobile Wallet e Customer Base (03/08)
    const catTurista=turista?["mobile wallet","customer base"]:null;
    const slug=SLUG_CATALOGO[brand];
    const offByProd={};
    (catTree.offerte||[]).forEach(o=>{(offByProd[o.prodotto_id]=offByProd[o.prodotto_id]||[]).push(o);});
    return (catTree.categorie||[]).map(cat=>{
      if(catTurista&&!catTurista.includes(String(cat.nome||"").toLowerCase()))return null;
      const prods=(catTree.prodotti||[]).filter(x=>x.categoria_id===cat.id&&x.tipo_cliente===tipoCat).sort((a,b)=>a.ordine-b.ordine||a.nome.localeCompare(b.nome));
      if(!prods.length)return null;
      const macro=CAT_MACRO_ID[cat.nome]||"extra";
      const def=categoriaDef(macro);
      return {id:"cat_"+cat.id,title:cat.nome.toUpperCase(),icon:def.icon,color:def.color,radio:true,catMacro:macro,subs:prods.map(x=>({
        id:"p_"+x.id,title:x.nome,isCatalogo:true,hasContract:false,ct:"cat",fields:[],
        catBrand:slug,catTipo:tipoCat,catCategoria:cat.nome,catProdotto:x.nome,
        catOfferte:(offByProd[x.id]||[]).sort((a,b)=>a.ordine-b.ordine||a.nome.localeCompare(b.nome)).map(o=>({nome:o.nome,opzioni:((o.catalog_opzioni||[]).filter(k=>k.attivo)).sort((a,b)=>a.ordine-b.ordine).map(k=>({nome:k.nome,tipo:k.tipo,gruppo:k.gruppo_singolo}))})),
      }))};
    }).filter(Boolean);
  },[brand,catTree,tipoCliente,turista]);
  _sesRef.v=sesCode; // per il fallback Cod.Ins. dentro subComplete
  // Segnalazione 84: con un contratto energia serve la cartella "Fattura".
  const haEnergia=cats.some(g=>g.catMacro==="energia"&&(sales[g.id]||[]).some(sale=>sale&&g.subs.some(sub=>sale[sub.id]&&sale[sub.id].active)));
  // FISARMONICA CATEGORIE (Luca 28/07): tutte esplose SOLO alla prima entrata
  // (nessun prodotto ancora selezionato); appena si seleziona un prodotto, le
  // categorie senza selezione si RACCOLGONO nel solo titolo cliccabile
  // (esplodi/chiudi a piacere), per dare spazio alla compilazione. Vale per
  // ogni brand e tipo cliente. Cambio brand/tipo = si riparte da tutte aperte.
  const [catOpen,setCatOpen]=useState({});
  useEffect(()=>{setCatOpen({});},[brand,tipoCliente]);
  const catHaSelezione=(g)=>(sales[g.id]||[]).some(row=>row&&g.subs.some(sub=>row[sub.id]&&row[sub.id].active));
  const nessunaSelezione=!cats.some(catHaSelezione);
  const catAperta=(g)=>catOpen[g.id]!==undefined?catOpen[g.id]:(nessunaSelezione||catHaSelezione(g));
  const togCat=(g)=>setCatOpen(p=>{const cur=p[g.id]!==undefined?p[g.id]:(nessunaSelezione||catHaSelezione(g));return {...p,[g.id]:!cur};});
  const sT=m=>{setToast(m);setTimeout(()=>setToast(null),3500)};
  // alias: sei punti del percorso marginalità chiamavano showToast MAI definito
  // (@ts-nocheck lo nascondeva → ReferenceError a runtime, scoperto 05/08)
  const showToast=sT;
  const uA=(k,v)=>setAna(p=>({...p,[k]:v}));
  const gS=catId=>sales[catId]||[{}];
  const _reqReg=useRef({});
  const [,_reqTick]=useReducer(x=>x+1,0);
  const _reqTO=useRef(null);
  const _scheduleTick=useCallback(()=>{if(_reqTO.current)clearTimeout(_reqTO.current);_reqTO.current=setTimeout(()=>{_reqTO.current=null;_reqTick();},250);},[]);
  const _report=useCallback((sk,fid,empty)=>{const reg=_reqReg.current;if(!reg[sk])reg[sk]={};const prev=reg[sk][fid];if(empty===undefined){if(prev!==undefined){delete reg[sk][fid];_scheduleTick();}return;}if(prev!==empty){reg[sk][fid]=empty;_scheduleTick();}},[_scheduleTick]);
  const _reqMissing=useCallback((sk)=>{const o=_reqReg.current[sk]||{};for(const k in o)if(o[k])return true;return false;},[]);
  const _reqApi=useMemo(()=>({report:_report,reqMissing:_reqMissing}),[_report,_reqMissing]);
  const catCounts=(gid,subs)=>{let tot=0,ok=0,warn=0,empty=0;(sales[gid]||[]).forEach((row,si)=>{if(!row)return;subs.forEach(s=>{const d=row[s.id];if(d&&d.active){tot++;const b=subBadge(d,dupCheck,s,_reqMissing(gid+"-"+si+"-"+s.id));if(b){if(b.st==="ok")ok++;else if(b.st==="warn")warn++;else empty++;}}});});return {tot,ok,warn,empty};};

  const togSub=(catId,si,subId,radioSubs)=>{setSales(p=>{const cs=[...(p[catId]||[{}])];if(!cs[si])cs[si]={};const cur=cs[si][subId];if(cur&&cur.active){cs[si]={...cs[si],[subId]:null}}else{if(radioSubs){const updated={...cs[si]};radioSubs.forEach(rs=>{if(rs!==subId)updated[rs]=null});updated[subId]=emS();cs[si]=updated}else{cs[si]={...cs[si],[subId]:emS()}}};return{...p,[catId]:cs}})};
  const uF=(catId,si,subId,fk,val)=>{setSales(p=>{const cs=[...(p[catId]||[{}])];if(!cs[si])cs[si]={};const sub=cs[si][subId]||emS();cs[si]={...cs[si],[subId]:{...sub,fields:{...(sub.fields||{}),[fk]:val}}};return{...p,[catId]:cs}})};
  const uC=(catId,si,subId,fk,val)=>{setSales(p=>{const cs=[...(p[catId]||[{}])];if(!cs[si])cs[si]={};const sub=cs[si][subId]||emS();cs[si]={...cs[si],[subId]:{...sub,contract:{...(sub.contract||{}),[fk]:val}}};return{...p,[catId]:cs}})};
  const uP=(catId,si,subId,prop,val)=>{setSales(p=>{const cs=[...(p[catId]||[{}])];if(!cs[si])cs[si]={};const sub=cs[si][subId]||emS();if(prop==="__resetVFOffer__"){cs[si]={...cs[si],[subId]:{...sub,vfOffer:null,vfMnp:null,vfMnpBrand:"",vfMnpNum:"",vfDomicilio:null,vfConvergenza:null,vfNumFisso:"",vfTnp:null,vfTnpList:[],dcNumProv:"",dcNum:"",dcIccid:"",dcCodIns:"",dcRicaricaAuto:null,vfSecurity:null}};}else if(prop==="__resetVFOfferTo__"){const{offer,isDV}=val;cs[si]={...cs[si],[subId]:{...emS(),active:true,vfOffer:offer,vfMnp:isDV?"No":null,vfDomicilio:isDV?"Wallet":null}};}else{const newVal=typeof val==="function"?val(sub[prop]):val;cs[si]={...cs[si],[subId]:{...sub,[prop]:newVal}};}return{...p,[catId]:cs}})};
  const addSl=catId=>setSales(p=>({...p,[catId]:[...(p[catId]||[{}]),{}]}));
  const rmSl=(catId,idx)=>setSales(p=>{const c=[...(p[catId]||[{}])];c.splice(idx,1);return{...p,[catId]:c.length?c:[{}]}});
  const resetSale=(catId,si)=>setSales(p=>{const cs=[...(p[catId]||[{}])];const row=cs[si]||{};const nr={};Object.keys(row).forEach(subId=>{const d=row[subId];if(d&&d.active)nr[subId]=emS();});cs[si]=nr;return{...p,[catId]:cs}});
  const [skyS,setSkyS]=useState([{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:"",tvCodIns:"",fibraCodIns:"",mobCodIns:""}]);
  const uSkyF=(si,field,val)=>setSkyS(p=>{const n=[...p];n[si]={...n[si],[field]:val};return n});
  const togSky=(si,pr)=>{setSkyS(p=>{const n=[...p];const s={...n[si]};const allTV=[...SKY_TV,...SKY_BIZ_TV];const allFibra=[...SKY_FIBRA,...SKY_BIZ_FIBRA];if(allTV.indexOf(pr)>=0){s.tvSel=s.tvSel===pr?null:pr;s.tvCC="";}else if(allFibra.indexOf(pr)>=0){s.fibraSel=s.fibraSel===pr?null:pr;s.fibraCC="";s.fibraGnp=null;s.fibraGnpBrand="";s.fibraGnpNum="";}else if(pr==="Sky Mobile"){s.mobileSel=!s.mobileSel;s.mobMnp=null;s.mobNumProv="";s.mobNumDef="";s.mobBrandMnp="";s.mobIccid="";s.mobNum="";s.mobIccidNo="";}n[si]=s;return n;});};
  const skyTv=(s)=>!s||!s.tvSel?{sel:false}:{sel:true,ok:!!s.tvCC&&!!(s.tvCodIns||sesCode)};
  const skyFib=(s)=>{if(!s||!s.fibraSel)return{sel:false};let ok=!!s.fibraCC&&s.fibraGnp!=null&&!!(s.fibraCodIns||sesCode);if(s.fibraGnp==="Sì"&&(!s.fibraGnpBrand||!s.fibraGnpNum))ok=false;return{sel:true,ok};};
  const skyMob=(s)=>{if(!s||!s.mobileSel)return{sel:false};let ok=s.mobMnp!=null&&s.mobTied!=null&&!!(s.mobCodIns||sesCode);if(s.mobMnp==="Sì"){if(!s.mobBrandMnp||!s.mobNumProv||!s.mobNumDef||!s.mobIccid)ok=false;if(_bNum(s.mobNumProv)||_bNum(s.mobNumDef)||_bIc(s.mobIccid))ok=false;}if(s.mobMnp==="No"){if(!s.mobNum||!s.mobIccidNo)ok=false;if(_bNum(s.mobNum)||_bIc(s.mobIccidNo))ok=false;}return{sel:true,ok};};
  const skyBadge=(r)=>!r.sel?null:(r.ok?{l:"✓ Completo",bg:"rgba(40,167,69,0.12)",fg:"var(--tf-28a745)"}:{l:"⚠ Incompleto",bg:"rgba(245,158,11,0.14)",fg:"var(--tf-f59e0b)"});
  const skyReset=(si)=>setSkyS(p=>{const n=[...p];const s={...n[si]};s.tvCC="";s.fibraCC="";s.fibraGnp=null;s.fibraGnpBrand="";s.fibraGnpNum="";s.mobMnp=null;s.mobNumProv="";s.mobNumDef="";s.mobBrandMnp="";s.mobIccid="";s.mobNum="";s.mobIccidNo="";s.mobTied=null;n[si]=s;return n;});
  const openVFModal=({catId,si,subId,offer})=>{const cur=((sales[catId]||[{}])[si]||{})[subId];const existQty=cur&&cur.vfOffers&&cur.vfOffers[offer]?cur.vfOffers[offer]:1;setVfQtyModal({catId,si,subId,offer,tempQty:existQty});};
  const confirmVFQty=()=>{if(!vfQtyModal)return;const{catId,si,subId,offer,tempQty}=vfQtyModal;const cur=((sales[catId]||[{}])[si]||{})[subId];const baseO=(cur&&cur.vfOffers)||{};const newVfOffers={...baseO};if(tempQty>0)newVfOffers[offer]=tempQty;else delete newVfOffers[offer];const existC=(cur&&cur.vfContratti&&cur.vfContratti[offer])||[];const newC=Array.from({length:tempQty},(_,i)=>existC[i]||{codIns:"",codContratto:"",numProv:"",iccid:""});const newVfC={...((cur&&cur.vfContratti)||{}),[offer]:newC};uP(catId,si,subId,"vfOffers",newVfOffers);uP(catId,si,subId,"vfContratti",newVfC);setVfQtyModal(null);};

  const colItems=useCallback(()=>{
    // Carrello dal flusso catalogo: dettagli = Offerta + Opzioni + campi dello
    // strato dati (Cod.Ins. col fallback sessione, ICCID normalizzato); MNP e
    // Tipo TNP scritti nei dettagli così controlliDi/Tracking/auto-marginalità
    // continuano a funzionare come prima.
    const items=[];
    cats.forEach(g=>{(sales[g.id]||[{}]).forEach((sale,si)=>{if(!sale)return;g.subs.forEach(sub=>{const d=sale[sub.id];if(!(d&&d.active))return;
      const f=d.fields||{};
      const det={};
      if((sub.catOfferte||[]).length)det["Offerta"]=f["Offerta"]||"";
      const opz=f.__opzioni||{};
      const attive=Object.keys(opz).filter(k=>opz[k]);
      if(attive.length)det["Opzioni"]=attive.map(k=>opz[k]===true?k:k+" ("+opz[k]+")").join(", ");
      if(/\bMNP\b/i.test(sub.catProdotto))det["MNP"]="Sì";
      if(sub.catCategoria==="Telefono a Rate")det["Tipo TNP"]=/finanziato/i.test(sub.catProdotto)?"Finanziamento":"Rata";
      campiConOpzioni(risolviCampi(sub.catBrand,sub.catTipo,sub.catCategoria,sub.catProdotto,f["Offerta"]||"",attive),opz).forEach(cmp=>{
        const raw=f[cmp.nome];
        if(cmp.nome==="Codice Inserimento")det["Cod.Ins."]=raw||sesCode||"";
        else if(cmp.nome==="Seriale SIM (ICCID)")det["ICCID"]=raw||"";
        else det[cmp.nome]=raw||"";
      });
      items.push({macro:g.title,macroColor:g.color,macroIcon:g.icon,sub:sub.title,saleNum:si+1,details:det,
        catalogo:{tipo:sub.catTipo,categoria:sub.catCategoria,prodotto:sub.catProdotto,offerta:f["Offerta"]||null,
          opzioni:attive.map(k=>({nome:k,quantita:opz[k]===true?null:opz[k]})),macro:g.catMacro}});
    });});});
    return items;
  },[cats,sales,sesCode]);

  // candidati per l'aggancio del telefono a rate: TUTTA la selezione + carrello
  const mobiliAggancioRate=mobiliAgganciabili(cats,sales,cart,brand);
  const podPdrMap=(()=>{const map={};const scan=(so)=>{if(!so)return;Object.keys(so).forEach(cat=>{(so[cat]||[]).forEach(row=>{if(!row||typeof row!=="object")return;Object.keys(row).forEach(sid=>{const d=row[sid];if(!d||typeof d!=="object")return;const add=(t,val)=>{if(val&&String(val).trim()){const k=t+":"+String(val).trim().toUpperCase();map[k]=(map[k]||0)+1;}};add("POD",d.fwPod);add("PDR",d.fwPdr);add("POD",d.enPod);add("PDR",d.enPdr);// Codice contratto ripetuto fra piu' prodotti dello stesso brand (segnalazione 17):
                     // prima passava senza alcun avviso.
                     if(d.contract){add("POD",d.contract.pod);add("PDR",d.contract.pdr);}// Segnalazione 28: dentro UN prodotto lo stesso codice puo' comparire piu' volte
                     // di proposito — con TNP CB + Cambio Offerta attivi la UI lo copia in
                     // entrambi i campi. Contarlo due volte lo faceva passare per duplicato e
                     // bloccava una vendita legittima. Qui i codici del singolo prodotto
                     // vengono deduplicati: il conteggio sale solo se lo stesso codice compare
                     // in un ALTRO prodotto.
                     const _codes=new Set();
                     const _addCode=(val)=>{if(val&&String(val).trim())_codes.add(String(val).trim().toUpperCase());};
                     _addCode(d.cbCodContratto);_addCode(d.cbTnpCC);_addCode(d.cbCambioCC);_addCode(d.w3SostCodContr);_addCode(d.fwSostCodContr);
                     if(d.contract)_addCode(d.contract.codice_contratto);
                     _codes.forEach(cv=>{const k="CODCONTR:"+cv;map[k]=(map[k]||0)+1;});});});});};cart.forEach(g=>{if(g.sv)scan(g.sv.sales);});scan(sales);return map;})();
  const dupCheck=(t,val)=>{if(!val||!String(val).trim())return false;return (podPdrMap[t+":"+String(val).trim().toUpperCase()]||0)>1;};
  const hasDupPodPdr=Object.keys(podPdrMap).some(k=>k.startsWith("POD:")||k.startsWith("PDR:")?podPdrMap[k]>1:false);
  const hasDupCodContr=Object.keys(podPdrMap).some(k=>k.startsWith("CODCONTR:")&&podPdrMap[k]>1);
  const NUM_KEYS={dcNumProv:1,dcNum:1,vfMnpNum:1,dcCbNumProv:1,cbCambioNumMod:1,fwNumProv:1,fwNumDef:1,fwMnpNum:1,ilNumProv:1,ilNumDef:1,ilMnpNum:1,ilBizNum:1,ilBizNumDef:1,timNumProv:1,timNum:1,timMnpNum:1,timFNumProv:1,veryNumProv:1,veryNum:1,veryMnpNum:1,hoNumProv:1,hoNum:1,hoMnpNum:1,vfbNum:1,vfbMnpNum:1,vfbFNumProv:1,vfbFNumDef:1,vfbFMnpNum:1,vfbFCombNumProv:1,vfFNumProv:1,vfFNumDef:1,vfFNumProvVisorio:1,numProvv:1,numDef:1,numProv:1,numero:1,mobNumProv:1,mobNumDef:1,mobNum:1,w3SostCell:1,vfSostCell:1};
  const _numBad=(v)=>{const s=String(v||"");return s.length>0&&(s.length<9||s.length>10||/\D/.test(s));};
  const _numBadFx=(v)=>{const s=String(v||"");return s.length>0&&(s.length<7||s.length>11||/\D/.test(s));};
  const _icBad=(v)=>{const s=String(v||"");return s.length>0&&(s.length!==19||/\D/.test(s));};
  const IMEI_KEYS={tnpImei:1,cbTnpImei:1,rfImei:1,vfbImei:1,timImei:1,imei:1};
  const _imBad=(v)=>{const s=String(v||"");return s.length>0&&(s.length!==15||/[^A-Za-z0-9]/.test(s));};
  const hasInvalidNumIccid=(()=>{
    let bad=false;
    const chkObj=(d)=>{if(!d||typeof d!=="object")return;Object.keys(d).forEach(k=>{const val=d[k];if(val&&typeof val==="object"){if(Array.isArray(val)){val.forEach(it=>{if(it&&typeof it==="object"){if(_imBad(it.imei))bad=true;if(_imBad(it.imei2))bad=true;if(Array.isArray(it.compassItems))it.compassItems.forEach(ci=>{if(ci&&_imBad(ci.imei))bad=true;if(ci&&_imBad(ci.imei2))bad=true;});}});}else{chkObj(val);}return;}if(/iccid/i.test(k)){if(_icBad(val))bad=true;}else if(IMEI_KEYS[k]||/imei/i.test(k)){if(_imBad(val))bad=true;}else if(/pdr/i.test(k)){if(_bPdr(val))bad=true;}else if(/pod/i.test(k)){if(_bPod(val))bad=true;}else if(FIXED_NUM_KEYS[k]){if(_numBadFx(val))bad=true;}else if(NUM_KEYS[k]||/tel|cell|phone/i.test(k)){if(_numBad(val))bad=true;}});};
    Object.keys(sales).forEach(cat=>{(sales[cat]||[]).forEach(row=>{if(row)Object.keys(row).forEach(sid=>chkObj(row[sid]));});});
    (skyS||[]).forEach(r=>chkObj(r));
    return bad;
  })();
  const blockSave=hasDupPodPdr||hasDupCodContr||hasInvalidNumIccid;
  const hasIncomplete=(()=>{let bad=false;cats.forEach(g=>{(sales[g.id]||[]).forEach((row,si)=>{if(!row)return;g.subs.forEach(s=>{const d=row[s.id];if(d&&d.active){const b=subBadge(d,dupCheck,s,_reqMissing(g.id+"-"+si+"-"+s.id));if(b&&b.st!=="ok")bad=true;}});});});return bad;})();
  const skyIncomplete=false; // Sky ora passa dal flusso catalogo (macchinario skyS dormiente)
  const blockSaveAll=blockSave||hasIncomplete||skyIncomplete;
  // MOD-2b: offerte del brand corrente che HANNO opzioni a catalogo ma per cui il
  // venditore non ne ha collegata NESSUNA (nomi unici, per il popup di conferma).
  const _offerteSenzaOpzioni=()=>{
    const out=[];
    cats.forEach(g=>{(sales[g.id]||[]).forEach(row=>{if(!row)return;g.subs.forEach(s=>{
      if(!s.isCatalogo)return;
      const d=row[s.id];if(!(d&&d.active))return;
      const f=d.fields||{};const offName=f["Offerta"]||"";if(!offName)return;
      const offSel=(s.catOfferte||[]).find(o=>o.nome===offName);
      if(!offSel||!(offSel.opzioni||[]).length)return;   // offerta senza opzioni a catalogo → niente conferma
      const opz=f.__opzioni||{};
      if(Object.keys(opz).filter(k=>opz[k]).length===0&&out.indexOf(offName)<0)out.push(offName);
    });});});
    return out;
  };
  const addCart=(after,skipOpz)=>{
    const items=colItems();
    if(blockSaveAll){sT(hasIncomplete?"⚠ Ci sono prodotti Incompleti: completali prima di salvare":(hasDupPodPdr?"⚠ POD/PDR duplicato: correggi prima di salvare":(hasDupCodContr?"⚠ Codice contratto duplicato: correggi prima di salvare":"⚠ Numero/ICCID non valido: correggi prima di salvare")));return;}
    // MOD-2b (Luca 08/08): prima di mettere in carrello, se c'è un'offerta con
    // opzioni disponibili ma nessuna collegata, chiedi conferma. Il commit vero
    // (e la navigazione "after") avviene solo dopo il sì (addCart(after,true)).
    if(!skipOpz){const senza=_offerteSenzaOpzioni();if(senza.length){setConfirmNoOpz({offerte:senza,after:after||null});return;}}
    if(items.length>0&&bObj){const snap={sales:JSON.parse(JSON.stringify(sales)),sesCode,skyS:JSON.parse(JSON.stringify(skyS))};setCart(p=>[...p,{brandId:brand,brandLabel:bObj.label,brandIcon:bObj.icon,brandColor:bObj.color,items,sv:snap}]);setMargItems(p=>computeAutoMarg(p,brand,bObj.label,items));sT("✅ "+items.length+" prodotti "+bObj.label)}
    setSales({});setSesCode("");setSkyS([{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:"",tvCodIns:"",fibraCodIns:"",mobCodIns:""}]);setBrand(null);
    if(after)after();
  };
  const editCG=idx=>{const g=cart[idx];if(!g)return;setBrand(g.brandId);if(g.sv){setSales(g.sv.sales||{});setSesCode(g.sv.sesCode||"");setSkyS(g.sv.skyS||[{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:"",tvCodIns:"",fibraCodIns:"",mobCodIns:""}])}setCart(p=>p.filter((_,i)=>i!==idx));setShowCart(false);sT("✏️ Modifica "+g.brandLabel)};
  const rmCG=idx=>setCart(p=>p.filter((_,i)=>i!==idx));
  // SCELTA/CAMBIO BRAND (estratta per il pannello "cambia brand", revamp 03/08):
  // stessa logica storica — conferma se c'e' lavoro fuori carrello, ripresa
  // del gruppo dal carrello se il brand c'era gia'.
  const _pickBrand=(b)=>{if(!b.ready)return;if(turista&&b.id!=="windtre"){sT("🌍 Cliente turista: consentiti solo WindTre (privato) e Marginalità");return;}if(b.id===brand)return;/* stesso brand: niente reset a sorpresa (03/08) */const _lavoro=Object.values(sales).some(r=>Array.isArray(r)&&r.some(row=>row&&Object.values(row).some(sub=>sub&&sub.active)));if(brand&&_lavoro&&cart.findIndex(g=>g.brandId===brand)<0&&!window.confirm("Hai una vendita in corso su questo brand non ancora nel carrello: cambiando brand la perdi.\n\nCambiare comunque?"))return;setMargFlow(false);const cont=cart.length>0||(tipoCliente&&(ana.nome||ana.cognome||ana.ragioneSociale));const ei=cart.findIndex(g=>g.brandId===b.id);setBrand(b.id);setCambioBrand(false);const dSky=[{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:"",tvCodIns:"",fibraCodIns:"",mobCodIns:""}];if(ei>=0){const g=cart[ei];setSales(g.sv&&g.sv.sales?g.sv.sales:{});setSesCode(g.sv&&g.sv.sesCode?g.sv.sesCode:"");setSkyS(g.sv&&g.sv.skyS?g.sv.skyS:dSky);setCart(p=>p.filter((_,i)=>i!==ei));}else{setSales({});setSesCode("");setSkyS(dSky);}if(b.id==="very"||b.id==="ho"){setTipoCliente("privato");if(!cont)setClienteFound(false);setShowAna(true);setShowStep4(cont||ei>=0?true:false);}else if(cont||ei>=0){setShowAna(true);setShowStep4(true);}else{setTipoCliente(null);setShowAna(false);setShowStep4(false);}};
  const fullReset=()=>{setMargFlow(false);setBrand(null);setTipoCliente(null);setTurista(false);setLookupValue("");setClienteFound(false);setLookupDone(false);setShowAna(false);setSales({});setSesCode("");setSkyS([{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:"",tvCodIns:"",fibraCodIns:"",mobCodIns:""}]);setCart([]);setShowCart(false);setExpI({});setConfirmReset(false);setShowStep4(false);setMargItems([]);setAttachments([]);setDocRiuso(null);setNotaOn(false);setNotaScelta(null);setNota("");setPromData("");setPromOra("");setPromNeg("");setPromDesc("");setVistaStep("brand");setStepVisti({});clearDraft("crm_v9");setAna({nome:"",cognome:"",cellulare:"",email:"",via:"",cap:"",citta:"",iban:"",cf:"",ragioneSociale:"",nomeRef:"",cognomeRef:"",cfRef:"",recapito:"",fisso:"",intDiverso:false,intNome:"",intCognome:"",intCf:""});
    // Segnalazione 89: dopo il salvataggio operatore e negozio restavano quelli
    // dell'ultima vendita (es. il collaboratore per cui avevo registrato). Ora
    // tornano al MIO nominativo e al MIO negozio, come a inizio giornata.
    setSelVend(user?.name||"");setSelNeg(user?.negozio||"");};
  // ── Auto-save every state change (solo dopo il ripristino della bozza) ──
  // #118: si salva l'intera vendita in corso (brand, prodotti, carrello, flusso).
  useAutoSave("crm_v9",{brand,tipoCliente,ana,sales,sesCode,skyS,cart,selVend,selNeg,lookupValue,margItems,clienteFound,lookupDone,showAna,showStep4,notaOn,notaScelta,nota,promData,promOra,promNeg,promDesc,turista},draftLoaded);

  // ── Load draft on mount (once) ──
  // #118: ripristino COMPLETO della vendita in corso. Prima si ricaricava solo un
  // sottoinsieme e — soprattutto — l'auto-save al mount cancellava la bozza; ora
  // l'auto-save e' gated su draftLoaded, quindi navigando fuori e rientrando la
  // pratica resta. L'azzeramento avviene solo con: salvataggio (fullReset),
  // logout esplicito (AuthContext) o chiusura scheda/browser (sessionStorage).
  useEffect(()=>{if(draftLoaded)return;setDraftLoaded(true);const d=loadDraft("crm_v9");if(d){
    if(d.tipoCliente)setTipoCliente(d.tipoCliente);if(d.ana)setAna(d.ana);
    if(d.selVend)setSelVend(d.selVend);if(d.selNeg)setSelNeg(d.selNeg);if(d.margItems)setMargItems(d.margItems);
    if(d.brand)setBrand(d.brand);if(d.sales)setSales(d.sales);if(d.sesCode)setSesCode(d.sesCode);
    if(Array.isArray(d.skyS))setSkyS(d.skyS);if(Array.isArray(d.cart))setCart(d.cart);
    if(d.lookupValue)setLookupValue(d.lookupValue);
    if(typeof d.turista==="boolean")setTurista(d.turista);
    if(typeof d.clienteFound==="boolean")setClienteFound(d.clienteFound);
    if(typeof d.lookupDone==="boolean")setLookupDone(d.lookupDone);
    if(typeof d.showAna==="boolean")setShowAna(d.showAna);
    if(typeof d.showStep4==="boolean")setShowStep4(d.showStep4);
    if(typeof d.notaOn==="boolean")setNotaOn(d.notaOn);if(d.nota)setNota(d.nota);
    // MIGRAZIONE bozze (05/08): le bozze vecchie non hanno notaScelta. Se
    // l'operatore aveva gia' attivato le note (notaOn=true) la scelta era
    // esplicita -> "si"; il vecchio "no" era preselezionato di default e NON
    // vale come scelta: resta null e va riflaggato. Valori sconosciuti ignorati.
    if(d.notaScelta==="si"||d.notaScelta==="no")setNotaScelta(d.notaScelta);
    else if(d.notaOn===true)setNotaScelta("si");
    if(d.promData)setPromData(d.promData);if(d.promOra)setPromOra(d.promOra);
    if(d.promNeg)setPromNeg(d.promNeg);if(d.promDesc)setPromDesc(d.promDesc);
  }},[]);
  
  // ── Remember last brand+tipo for next session ──
  useEffect(()=>{if(tipoCliente)try{sessionStorage.setItem("crm_lastTipo",tipoCliente)}catch(e){}},[tipoCliente]);
  
  // ── Marginalità handlers ──
  const addMargItem=(item)=>{setMargItems(p=>[...p,item]);setShowMargPOS(false)};
  // AUTO-MARGINALITÀ dal flusso brand: GA mobile -> SIM del brand (prezzo obbligatorio al
  // checkout); Sostituzione Sim -> voce Sost; telefono TNP -> prodotto a prezzo di listino.
  const AUTO_SIM={windtre:"Sim Wind3",vodafone:"Sim Vodafone",fastweb:"Sim Fastweb",iliad:"Sim Iliad",sky:"Sim Sky",ho:"Sim Ho.",tim:"Sim TIM",very:"Sim Very",kena:"Sim Kena"};
  const AUTO_SOST={windtre:"Sost Wind3",fastweb:"Sost Fastweb",tim:"Sost TIM",vodafone:"Sost Vodafone",very:"Sost Very"};
  const computeAutoMarg=(prev,brandId,brandLabel,items)=>{
    if(!brandLabel)return prev;
    const adds=[];
    // UNA VOCE PER OCCORRENZA (bug Luca 06/08, screenshot "Tel. Rate CB" x2):
    // la chiave era il NOME prodotto, quindi con la multi-vendita la seconda
    // vendita gemella NON generava la sua voce — due telefoni a rate, UN solo
    // "Telefono TNP (listino)". Ora ogni vendita spinge la SUA voce (autoKey=
    // nome#n, n = occorrenza nell'ordine deterministico di colItems), ognuna
    // coi dati (modello/prezzo/margine) della PROPRIA vendita.
    const _occ={};
    // niente doppioni con le voci MANUALI: ogni voce uguale aggiunta A MANO dal
    // pannello copre UNA occorrenza auto (prima ne copriva tutte: stesso collasso)
    const push=(name,locked,extra)=>{const n=(_occ[name]=(_occ[name]||0)+1);if(n<=prev.filter(m=>!m.auto&&m.product===name).length)return;adds.push({product:name,productId:"auto",price:0,qty:1,importo:null,margin:0,totalMargin:0,model:null,imei:null,venditore:selVend,negozio:selNeg,date:new Date().toISOString().split("T")[0],auto:true,autoFrom:brandLabel,autoKey:name+"#"+n,priceLocked:!!locked,priceRequired:!locked,...(extra||{})})};
    // TNP dal listino (Luca 05/08): la voce auto entrava nel carrello VUOTA
    // ("Telefono TNP (listino)" e basta) — ora porta modello, prezzo di
    // listino e margine %, e il prezzo popola il valore del carrello.
    const _tnpDaListino=(det)=>{try{
      const mod=String(det["Modello Terminale"]||"").trim()
        ||String(det["TNP CB Dispositivi"]||"").replace(/^TNP[^-]*-\s*/i,"").replace(/\s*\([^)]*\)\s*$/,"").trim();
      if(!mod||/^altro/i.test(mod))return null;
      if(!_listiniTutti)return {model:mod};   // cache fredda: il modello intanto si vede
      const k=chiaveListino(mod);
      const lb=_brandListino(brandLabel);
      const r=_listiniTutti.find(x=>chiaveListino(x.modello)===k&&(!lb||_compBrand(x.brand)===lb));
      if(!r)return {model:mod};
      const pz=Number(r.prezzo||0);
      const pct=_senzaMargine()?0:Number(r.margine_pct??4);
      const mg=pz*pct/100;
      return {model:mod,price:pz,importo:pz,margin:mg,totalMargin:mg,priceLocked:true,priceRequired:false};
    }catch(e){console.error("[TNP-LISTINO]",e);return null;}};   // mai far sparire la voce per un dato storto
    for(const it of (items||[])){
      const macro=String(it.macro||"").toUpperCase();const sub=String(it.sub||"");
      // SIM VODAFONE = PRODOTTO DI MAGAZZINO GIUSTO (Luca 07/08, fiscalità):
      // Business → SEMPRE "Sost Vodafone" (anche sul FISSO, che prima non
      // scaricava nulla); Consumer → Fisso e Sostituzione SIM scaricano
      // "Sim Vodafone" (la sostituzione consumer prima scaricava la Sost).
      const _vfBiz=brandId==="vodafone"&&it.catalogo?.tipo==="Business";
      if(/sostituzione\s*sim/i.test(sub)){
        if(brandId==="vodafone")push(_vfBiz?"Sost Vodafone":"Sim Vodafone");
        else if(AUTO_SOST[brandId])push(AUTO_SOST[brandId]);
      }
      else if(macro.includes("MOBILE")&&!/\bcb\b/i.test(sub)){
        if(brandId==="vodafone")push(_vfBiz?"Sost Vodafone":"Sim Vodafone");
        else if(AUTO_SIM[brandId])push(AUTO_SIM[brandId]);
      }
      else if(brandId==="vodafone"&&macro.includes("FISSO"))push(_vfBiz?"Sost Vodafone":"Sim Vodafone");
      const det=it.details||{};
      const tnp=[det["Tipo TNP"],det.tnpTipo,det.cbTnpTipo].map(v=>String(v||"").trim().toLowerCase());
      // RV-03: telefono a rate BUSINESS a marginalita' SOLO su WindTre — per gli
      // altri brand niente voce auto. Le voci legacy (senza .catalogo) invariate.
      const skipTnpMarg=it.catalogo?.tipo==="Business"&&brandId!=="windtre";
      if(!skipTnpMarg&&tnp.some(t=>t&&t!=="no"&&t!=="—"&&t!=="-"))push("Telefono TNP (listino)",true,_tnpDaListino(det));
      // BUNDLE VODAFONE (Luca 06/08): l'opzione "Bundle <importo>" e' a tutti
      // gli effetti un prodotto in marginalita' — entra nel CARRELLO come voce
      // auto (non un telefono: resta un bundle) con l'importo esplicito nel
      // nome dell'opzione × quantita'. MARGINE = importo × coefficiente
      // (ce_parametri 'bundle_coeff_default', come il 'Bundel Systema' del
      // foglio Costi & Ricavi — cantiere CE 07/08); cache fredda → 0 e il
      // ricalcolo live lo aggiorna appena il coefficiente arriva.
      if(brandId==="vodafone"){
        for(const op of (it.catalogo?.opzioni||[])){
          if(!/bundle/i.test(String(op?.nome||"")))continue;
          const mAmt=String(op.nome).match(/(\d+(?:[.,]\d+)?)\s*€?\s*$/);
          if(!mAmt)continue;
          const unit=parseFloat(mAmt[1].replace(",","."));
          if(!(unit>0))continue;
          const q=Math.max(1,Number(op.quantita||1));
          const coeff=_ceBundleCoeff??0;
          push(String(op.nome).trim(),true,{qty:q,price:unit,importo:Math.round(unit*q*100)/100,margin:Math.round(unit*coeff*100)/100,totalMargin:Math.round(unit*q*coeff*100)/100,priceLocked:true,priceRequired:false,bundle:true});
        }
      }
      // KIPOINT (cantiere CE 07/08): spedizioni/ritiri = servizi che vivono in
      // MARGINALITA'. Tariffa da catalog_valori (offerta + dimensione scelta);
      // senza tariffa la voce chiede l'importo al negozio e il margine
      // arrivera' col listino tariffe (file di Luca).
      if(brandId==="kipoint"){
        const off=String(it.catalogo?.offerta||it.catalogo?.prodotto||"Kipoint").trim();
        const dim=(it.catalogo?.opzioni||[]).map(o=>String(o?.nome||"")).find(n=>/^dimensione\s/i.test(n))||null;
        const nome=("Kipoint "+off+(dim?" — "+dim.replace(/^dimensione\s*/i,""):"")).trim();
        const t=_tariffaKipoint(off,dim);
        if(t&&t.prezzo!=null){
          const pz=Number(t.prezzo)||0;
          const mg=t.margine_tipo==="fisso"?Number(t.margine_valore||0):t.margine_tipo==="percent"?Math.round(pz*Number(t.margine_valore||0))/100:0;
          push(nome,true,{price:pz,importo:pz,margin:mg,totalMargin:mg,priceLocked:true,priceRequired:false});
        } else push(nome,false);
        // MOD-15 (Luca 10/08): OGNI opzione kipoint è un costo AGGIUNTIVO —
        // una voce prezzata per ciascuna (servizi, assicurazione, RFS, SCS).
        // Tariffa SOLO per match opzione (niente fallback fascia); le vecchie
        // "Dimensione XS-XL" restano dentro la voce principale come prima.
        for(const _op of (it.catalogo?.opzioni||[])){
          const _n=String(_op?.nome||"").trim();
          if(!_n||/^dimensione\s/i.test(_n))continue;
          const _t=_tariffaKipointOpz(off,_n);
          const _nomeOpz=("Kipoint "+_n).trim();
          if(_t&&_t.prezzo!=null){
            const _pz=Number(_t.prezzo)||0;
            const _mg=_t.margine_tipo==="fisso"?Number(_t.margine_valore||0):_t.margine_tipo==="percent"?Math.round(_pz*Number(_t.margine_valore||0))/100:0;
            push(_nomeOpz,true,{price:_pz,importo:_pz,margin:_mg,totalMargin:_mg,priceLocked:true,priceRequired:false});
          } else push(_nomeOpz,false);
        }
      }
    }
    const kept=prev.filter(m=>!(m.auto&&m.autoFrom===brandLabel));
    // preserva i prezzi già digitati sugli auto identici — match per OCCORRENZA
    // (autoKey); le voci di bozze vecchie senza autoKey valgono come occorrenza #1.
    // GEMELLE (verifica 06/08): se le occorrenze di un nome CALANO (vendita
    // eliminata), le superstiti vengono rinumerate e il match posizionale
    // aggancerebbe il prezzo digitato della vendita SBAGLIATA — in quel caso
    // per quel nome NIENTE eredità: prezzi freschi, si ridigitano.
    const _contaNome=(list,pred)=>{const c={};list.forEach(m=>{if(pred(m))c[m.product]=(c[m.product]||0)+1;});return c;};
    const _nOld=_contaNome(prev,m=>m.auto&&m.autoFrom===brandLabel);
    const _nNew=_contaNome(adds,()=>true);
    const merged=adds.map(a=>{
      if((_nNew[a.product]||0)<(_nOld[a.product]||0))return a;   // calo: no eredità
      const old=prev.find(m=>m.auto&&m.autoFrom===brandLabel&&(m.autoKey||m.product+"#1")===a.autoKey);
      return old?{...a,importo:a.importo!=null?a.importo:old.importo}:a;
    });
    return adds.length||kept.length!==prev.length?[...kept,...merged]:prev;
  };
  // Blocca il salvataggio se manca il prezzo di vendita: voci AUTO obbligatorie
  // (priceRequired), voci manuali marcate priceRequired dal pannello, e — per le
  // bozze salvate prima di questo flag — qualsiasi voce di brand (linked: SIM/Sost).
  const margPriceMissing=(list)=>list.filter(m=>(m.priceRequired||m.linked)&&!m.priceLocked&&(m.importo==null||m.importo===""));
  // live: le voci auto seguono in tempo reale la selezione dei prodotti del brand corrente
  useEffect(()=>{
    if(!bObj)return;
    setMargItems(p=>computeAutoMarg(p,brand,bObj.label,colItems()));
    // cache listini fredda: si carica e si ricalcola (il TNP prende il prezzo)
    if(!_listiniTutti)caricaListini().then(()=>{ setMargItems(p=>computeAutoMarg(p,brand,bObj.label,colItems())); });
    // valori CE freddi: coefficiente bundle e tariffe Kipoint, poi ricalcolo
    if(_ceBundleCoeff==null)caricaCeValori().then(()=>{ setMargItems(p=>computeAutoMarg(p,brand,bObj.label,colItems())); });
  },[sales,skyS,brand]); // eslint-disable-line react-hooks/exhaustive-deps
  const rmMargItem=(idx)=>setMargItems(p=>p.filter((_,i)=>i!==idx));

  // ── RIUSO DOCUMENTI D'ARCHIVIO (Luca 05/08): se il cliente ha gia' un
  // documento d'identita' agli atti (righe contract_attachments con
  // file_type='documento' sui suoi contratti), allo step Allegati compare un
  // mini-flusso "gaming" a 3 tappe (Trovati → Verifica → Esito): l'operatore
  // VISIONA i documenti, spunta il check "non sono scaduti" e la vendita
  // AGGANCIA gli stessi file_url (nuove righe contract_attachments sul nuovo
  // contratto, NESSUN nuovo file nel bucket → niente doppioni). Se invece sono
  // scaduti carica i nuovi come sempre e, al salvataggio, le righe vecchie
  // passano a file_type='documento_archiviato': le viste che filtrano
  // 'documento' non le contano piu' — validi solo i nuovi.
  // docRiuso={cid,docs:[{id,url,name,created}],fase:'trovati'|'verifica'|'conferma'|'esito',esito:null|'validi'|'scaduti',check:bool}
  const [docRiuso, setDocRiuso] = useState(null);
  useEffect(() => {
    if (vistaStep !== "allegati") return;
    // il cliente e' identificato con certezza SOLO dal CF/P.IVA (stessa regola
    // del submit): senza CF (es. turista, cliente nuovo) lo step resta identico a oggi.
    const cf = (ana.cf || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!cf) return;
    if (docRiuso && docRiuso.cid === cf) return; // gia' caricato per questo cliente
    // CF cambiato dopo un riuso gia' applicato: via gli agganci del cliente precedente
    if (docRiuso && docRiuso.cid !== cf) setAttachments(prev => prev.filter(a => !a.reused));
    let alive = true;
    (async () => {
      try {
        const { data: cli } = await supabase.from("clients").select("id").eq("cf_piva", cf).limit(1);
        const cliId = cli && cli[0] && cli[0].id;
        if (!cliId) { if (alive) setDocRiuso({ cid: cf, docs: [] }); return; }
        const { data: ctr } = await supabase.from("contracts").select("id").eq("client_id", cliId).limit(500);
        const ids = (ctr || []).map(c => c.id);
        if (!ids.length) { if (alive) setDocRiuso({ cid: cf, docs: [] }); return; }
        const { data: atts } = await supabase.from("contract_attachments")
          .select("id,file_url,file_name,created_at")
          .in("contract_id", ids).eq("file_type", "documento")
          .order("created_at", { ascending: false }).limit(40);
        // i piu' recenti vincono; dedup per URL (fix Luca 10/08, caso
        // CLBNNA63T67A662A): lo STESSO file riagganciato su piu' vendite ha lo
        // stesso file_url → una sola card. Prima si deduplicava per NOME file e
        // fronte+retro con lo stesso nome (es. "documento-1.jpg" da due sessioni
        // QR) collassavano in una card sola: il retro spariva dalla proposta,
        // dal riaggancio E dall'archiviazione con esito scaduti/smarrito.
        const visti = {}; const docs = [];
        (atts || []).forEach(a => {
          const k = String(a.file_url || a.id).trim();
          if (visti[k]) return; visti[k] = true;
          docs.push({ id: a.id, url: a.file_url, name: a.file_name || "documento", created: a.created_at });
        });
        if (alive) setDocRiuso({ cid: cf, docs: docs.slice(0, 6), fase: "trovati", esito: null, check: false });
      } catch { if (alive) setDocRiuso({ cid: cf, docs: [] }); }
    })();
    return () => { alive = false; };
  }, [vistaStep, ana.cf]); // eslint-disable-line react-hooks/exhaustive-deps
  // nuovi documenti caricati a mano in QUESTA vendita (esclusi i riusati)
  const _nuoviDocCaricati = attachments.filter(a => a.type === "documento" && !a.reused).length;
  const riusaDocumenti = () => {
    if (!docRiuso || !(docRiuso.docs || []).length || !docRiuso.check) return;
    setAttachments(prev => [
      ...prev.filter(a => !a.reused),
      // stesso file_url dell'archivio: al submit NIENTE upload, solo la nuova
      // riga contract_attachments sul contratto di questa vendita
      ...docRiuso.docs.map(d => ({ reused: true, file: null, url: d.url, attId: d.id, name: d.name, type: "documento" }))
    ]);
    setDocRiuso(p => ({ ...p, fase: "esito", esito: "validi" }));
    sT("♻️ Documenti agganciati alla vendita: zero ricaricamenti, zero doppioni");
  };
  const docScaduti = () => {
    setAttachments(prev => prev.filter(a => !a.reused));
    setDocRiuso(p => ({ ...p, fase: "esito", esito: "scaduti", check: false }));
  };
  // MOD-14 (Luca 08/08): due esiti in più oltre a validi/scaduti.
  // ALTRO documento (tipo diverso, ENTRAMBI validi): si carica il nuovo e i
  // vecchi RESTANO validi in parallelo (nessuna archiviazione al submit).
  const docAltro = () => {
    setAttachments(prev => prev.filter(a => !a.reused));
    setDocRiuso(p => ({ ...p, fase: "esito", esito: "altro", check: false }));
  };
  // SMARRITO: i vecchi vanno nello storico come "smarriti" (non vecchi), tolti
  // dalla disponibilità; l'amministrativo li vede marcati. Si carica il nuovo.
  const docSmarrito = () => {
    setAttachments(prev => prev.filter(a => !a.reused));
    setDocRiuso(p => ({ ...p, fase: "esito", esito: "smarrito", check: false }));
  };
  const docRiusoReset = () => {
    setAttachments(prev => prev.filter(a => !a.reused));
    setDocRiuso(p => ({ ...p, fase: "trovati", esito: null, check: false }));
  };
  // Pannello del mini-flusso: FUNZIONE chiamata nel JSX (mai componente
  // dentro il componente: si perderebbe il focus a ogni render).
  const pannelloDocRiuso = () => {
    if (!docRiuso || !(docRiuso.docs || []).length) return null;
    const fase = docRiuso.fase || "trovati";
    const dotAttivo = fase === "trovati" ? 0 : (fase === "esito" ? 2 : 1);
    const doneOk = fase === "esito" && docRiuso.esito === "validi";
    const doneExp = fase === "esito" && docRiuso.esito === "scaduti";
    const doneAltro = fase === "esito" && docRiuso.esito === "altro";
    const doneSmarrito = fase === "esito" && docRiuso.esito === "smarrito";
    const thumb = (d, h) => {
      const mime = _mimeDaNome(d.name || d.url);
      return mime.startsWith("image/")
        ? <img src={d.url} alt={d.name} style={{ width: "100%", height: h, objectFit: "cover", borderRadius: 8, display: "block", background: "var(--tf-w30)" }} />
        : <div style={{ width: "100%", height: h, borderRadius: 8, background: "var(--tf-w30)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: h > 80 ? 42 : 30 }}>{mime.includes("pdf") ? "📄" : "🪪"}</div>;
    };
    return (
      <div style={{ background: "var(--tf-w20)", borderRadius: 14, padding: 18, marginBottom: 12, marginTop: 12, borderLeft: "4px solid " + (doneOk ? "#28a745" : doneExp ? "#f59e0b" : "#a78bfa") }}>
        <style>{`@keyframes docRiusoIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}@keyframes docRiusoPulse{0%,100%{box-shadow:0 0 0 0 rgba(167,139,250,.45)}50%{box-shadow:0 0 0 7px rgba(167,139,250,0)}}`}</style>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tf-a78bfa)", textTransform: "uppercase" }}>📇 Documenti già in archivio</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {["Trovati", "Verifica", "Esito"].map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <div style={{ width: 18, height: 2, borderRadius: 1, background: i <= dotAttivo ? "var(--tf-a78bfa)" : "var(--tf-w100)" }} />}
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: i < dotAttivo ? "var(--tf-34d399)" : i === dotAttivo ? "var(--tf-a78bfa)" : "var(--tf-w100)", display: "inline-block", animation: i === dotAttivo && fase !== "esito" ? "docRiusoPulse 1.6s infinite" : "none" }} />
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, color: i === dotAttivo ? "var(--tf-f8fafc)" : "var(--tf-64748b)" }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
        {fase === "trovati" && <div style={{ animation: "docRiusoIn .25s ease both" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tf-f8fafc)", marginBottom: 4 }}>🎁 Bonus tempo! Questo cliente ha già consegnato i documenti.</div>
          <div style={{ fontSize: 11, color: "var(--tf-8892b0)", marginBottom: 12 }}>Niente scanner e niente doppioni in archivio: dagli un&apos;occhiata e decidi se valgono ancora.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 10, marginBottom: 14 }}>
            {docRiuso.docs.map(d => (
              <div key={d.id} style={{ background: "var(--tf-w30)", border: "1px solid var(--tf-w60)", borderRadius: 10, padding: 8 }}>
                {thumb(d, 64)}
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tf-f8fafc)", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                <div style={{ fontSize: 9, color: "var(--tf-64748b)" }}>caricato il {d.created ? new Date(d.created).toLocaleDateString("it-IT") : "—"}</div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setDocRiuso(p => ({ ...p, fase: "verifica" }))} style={{ padding: "11px 26px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 16px rgba(124,58,237,.35)" }}>👀 Verificali</button>
        </div>}
        {fase === "verifica" && <div style={{ animation: "docRiusoIn .25s ease both" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tf-f8fafc)", marginBottom: 4 }}>🔍 Missione verifica: aprili e guardali bene.</div>
          <div style={{ fontSize: 11, color: "var(--tf-8892b0)", marginBottom: 12 }}>Clicca una card per l&apos;anteprima grande. Nitidi, leggibili e con la scadenza a posto?</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
            {docRiuso.docs.map(d => (
              <div key={d.id} onClick={() => apriAnteprima({ reused: true, url: d.url, name: d.name })} title="Anteprima grande" style={{ background: "var(--tf-w30)", border: "1px solid var(--tf-w60)", borderRadius: 10, padding: 8, cursor: "zoom-in" }}>
                {thumb(d, 110)}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--tf-f8fafc)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                  <span style={{ fontSize: 10 }}>🔎</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--tf-f8fafc)", marginBottom: 8 }}>Come li vedi?</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setDocRiuso(p => ({ ...p, fase: "conferma", esito: null }))} style={{ padding: "11px 22px", borderRadius: 10, border: "2px solid var(--tf-28a745)", background: "rgba(40,167,69,0.12)", color: "var(--tf-28a745)", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>✅ Validi e leggibili</button>
            {/* MOD-14: altro documento valido (si archiviano ENTRAMBI) */}
            <button type="button" onClick={docAltro} style={{ padding: "11px 22px", borderRadius: 10, border: "2px solid var(--tf-38bdf8)", background: "rgba(56,189,248,0.12)", color: "var(--tf-38bdf8)", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>📄 Ha un altro documento (entrambi validi)</button>
            <button type="button" onClick={docScaduti} style={{ padding: "11px 22px", borderRadius: 10, border: "2px solid var(--tf-f59e0b)", background: "rgba(245,158,11,0.12)", color: "var(--tf-f59e0b)", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>⏰ Scaduti o da sostituire</button>
            {/* MOD-14: smarrito (storico "smarrito", tolto dalla disponibilità) */}
            <button type="button" onClick={docSmarrito} style={{ padding: "11px 22px", borderRadius: 10, border: "2px solid var(--tf-f87171)", background: "rgba(248,113,113,0.12)", color: "var(--tf-f87171)", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>🔴 Smarrito</button>
          </div>
        </div>}
        {fase === "conferma" && <div style={{ animation: "docRiusoIn .25s ease both" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tf-f8fafc)", marginBottom: 10 }}>🛡️ Ultimo check e sblocchi il riuso.</div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "var(--tf-w30)", border: "1px solid var(--tf-w60)", borderRadius: 10, padding: "12px 14px", cursor: "pointer", marginBottom: 14 }}>
            <input type="checkbox" checked={!!docRiuso.check} onChange={e => { const on = e.target.checked; setDocRiuso(p => ({ ...p, check: on })); }} style={{ marginTop: 2, width: 16, height: 16, accentColor: "#28a745", cursor: "pointer" }} />
            <span style={{ fontSize: 12, color: "var(--tf-f8fafc)", fontWeight: 600 }}>Confermo di aver verificato che i documenti <b>non sono scaduti</b> e sono leggibili.</span>
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" onClick={riusaDocumenti} disabled={!docRiuso.check} style={{ padding: "11px 26px", borderRadius: 10, border: "none", background: docRiuso.check ? "linear-gradient(135deg,#16a34a,#34d399)" : "var(--tf-w30)", color: docRiuso.check ? "#fff" : "var(--tf-64748b)", fontSize: 13, fontWeight: 800, cursor: docRiuso.check ? "pointer" : "not-allowed", boxShadow: docRiuso.check ? "0 4px 16px rgba(22,163,74,.35)" : "none" }}>♻️ Riusa senza ricaricare</button>
            <button type="button" onClick={() => setDocRiuso(p => ({ ...p, fase: "verifica", check: false }))} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--tf-w100)", background: "var(--tf-w20)", color: "var(--tf-8892b0)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>← Torna alla verifica</button>
          </div>
        </div>}
        {doneOk && <div style={{ animation: "docRiusoIn .25s ease both" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--tf-34d399)", marginBottom: 4 }}>🏆 Combo! Documenti agganciati alla vendita.</div>
          <div style={{ fontSize: 11, color: "var(--tf-8892b0)", marginBottom: 10 }}>Zero caricamenti e zero doppioni: al salvataggio la vendita punterà agli stessi file già in archivio.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {docRiuso.docs.map(d => <span key={d.id} style={{ fontSize: 10, fontWeight: 700, color: "var(--tf-34d399)", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.4)", borderRadius: 999, padding: "4px 10px" }}>♻️ {d.name}</span>)}
          </div>
          <button type="button" onClick={docRiusoReset} style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid var(--tf-w100)", background: "var(--tf-w20)", color: "var(--tf-8892b0)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>↩︎ Cambia scelta</button>
        </div>}
        {doneExp && <div style={{ animation: "docRiusoIn .25s ease both" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--tf-f59e0b)", marginBottom: 4 }}>🔄 Nuova run: servono documenti freschi.</div>
          <div style={{ fontSize: 11, color: "var(--tf-8892b0)", marginBottom: 10 }}>Carica i nuovi nella casella 🪪 Documento qui sotto. Al salvataggio i vecchi passano in archivio: da lì in poi valgono solo i nuovi.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: _nuoviDocCaricati > 0 ? "var(--tf-34d399)" : "var(--tf-w100)", display: "inline-block" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: _nuoviDocCaricati > 0 ? "var(--tf-34d399)" : "var(--tf-8892b0)" }}>{_nuoviDocCaricati > 0 ? (_nuoviDocCaricati === 1 ? "✅ 1 nuovo documento caricato — obiettivo completato!" : `✅ ${_nuoviDocCaricati} nuovi documenti caricati — obiettivo completato!`) : "In attesa del nuovo documento… 🎯"}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {docRiuso.docs.map(d => <span key={d.id} style={{ fontSize: 10, fontWeight: 700, color: "var(--tf-64748b)", background: "var(--tf-w30)", border: "1px solid var(--tf-w60)", borderRadius: 999, padding: "4px 10px", textDecoration: "line-through" }}>🗄️ {d.name}</span>)}
          </div>
          <button type="button" onClick={docRiusoReset} style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid var(--tf-w100)", background: "var(--tf-w20)", color: "var(--tf-8892b0)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>↩︎ Cambia scelta</button>
        </div>}
        {/* MOD-14: ALTRO documento — si carica il nuovo, i vecchi restano VALIDI (parallelo) */}
        {doneAltro && <div style={{ animation: "docRiusoIn .25s ease both" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--tf-38bdf8)", marginBottom: 4 }}>📄 Due documenti validi in parallelo.</div>
          <div style={{ fontSize: 11, color: "var(--tf-8892b0)", marginBottom: 10 }}>Carica il NUOVO documento nella casella 🪪 Documento qui sotto: al salvataggio resteranno validi <b>sia quelli in archivio sia il nuovo</b> (niente sostituzione).</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: _nuoviDocCaricati > 0 ? "var(--tf-34d399)" : "var(--tf-w100)", display: "inline-block" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: _nuoviDocCaricati > 0 ? "var(--tf-34d399)" : "var(--tf-8892b0)" }}>{_nuoviDocCaricati > 0 ? `✅ ${_nuoviDocCaricati} nuovo/i caricato/i — resteranno affiancati ai precedenti` : "In attesa del nuovo documento…"}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {docRiuso.docs.map(d => <span key={d.id} style={{ fontSize: 10, fontWeight: 700, color: "var(--tf-38bdf8)", background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.4)", borderRadius: 999, padding: "4px 10px" }}>📎 {d.name} (resta valido)</span>)}
          </div>
          <button type="button" onClick={docRiusoReset} style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid var(--tf-w100)", background: "var(--tf-w20)", color: "var(--tf-8892b0)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>↩︎ Cambia scelta</button>
        </div>}
        {/* MOD-14: SMARRITO — i vecchi diventano "smarriti" (storico), tolti dai validi */}
        {doneSmarrito && <div style={{ animation: "docRiusoIn .25s ease both" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--tf-f87171)", marginBottom: 4 }}>🔴 Documento segnato come smarrito.</div>
          <div style={{ fontSize: 11, color: "var(--tf-8892b0)", marginBottom: 10 }}>Carica il NUOVO documento qui sotto. Al salvataggio i vecchi passano a <b>smarrito</b> nello storico: tolti dalla disponibilità, resta traccia visibile all&apos;amministrazione (non &quot;vecchi&quot; ma smarriti).</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: _nuoviDocCaricati > 0 ? "var(--tf-34d399)" : "var(--tf-w100)", display: "inline-block" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: _nuoviDocCaricati > 0 ? "var(--tf-34d399)" : "var(--tf-8892b0)" }}>{_nuoviDocCaricati > 0 ? `✅ ${_nuoviDocCaricati} nuovo/i caricato/i` : "In attesa del nuovo documento…"}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {docRiuso.docs.map(d => <span key={d.id} style={{ fontSize: 10, fontWeight: 700, color: "var(--tf-f87171)", background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.4)", borderRadius: 999, padding: "4px 10px" }}>🔴 {d.name} (smarrito)</span>)}
          </div>
          <button type="button" onClick={docRiusoReset} style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid var(--tf-w100)", background: "var(--tf-w20)", color: "var(--tf-8892b0)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>↩︎ Cambia scelta</button>
        </div>}
      </div>
    );
  };

  // Segnalazione 27: i contratti si duplicavano perche' "Salva contratto" non
  // aveva alcun blocco mentre il salvataggio era in corso. Un secondo clic (o un
  // doppio clic) rieseguiva tutto: nei dati si vedono coppie identiche a
  // 0,6-2,9 secondi di distanza. Il blocco usa un ref e non lo stato, perche'
  // due clic nello stesso tick leggerebbero entrambi lo stato ancora a false.
  const submitLock = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  // Univocita' cellulare (regola Luca): se il numero e' di un ALTRO cliente si
  // sceglie se spostarlo qui o cambiarlo — stessa logica della sezione Clienti.
  const [dupCellCliente, setDupCellCliente] = useState<{ id: string; label: string } | null>(null);
  const spostaCellRef = useRef(false);
  // GATE DI COMPLETEZZA (Luca 04/08): la vendita BRAND si registra SOLO con
  // tutti e 5 gli step superati — sono state salvate vendite SENZA documento
  // del cliente e senza contratto, saltando Allegati/Attribuzione dal
  // riepilogo. Documento + contratto sono OBBLIGATORI.
  // ── RIGHE DI CARRELLO = CONTRATTI (Luca 05/08) ─────────────────────────
  // Ogni offerta selezionata e' UN contratto e vuole i SUOI allegati: qui si
  // enumerano le righe (gruppi del carrello + brand in corso, nello STESSO
  // ordine del submit) con una chiave deterministica brand+offerta+occorrenza.
  // La stessa enumerazione gira nel submit per mappare riga -> contract_id
  // senza ambiguita' (l'id contratto e' generato lato client PRIMA dell'insert).
  const _etichettaRiga = (it) => String((it && it.catalogo && it.catalogo.offerta) || (it && it.sub) || "prodotto");
  // MOD-32: identificativi che legano due righe alla STESSA pratica (telefono
  // a rate agganciato al mobile: codice contratto/numero copiati; W3 CB
  // agganciato al cambio offerta: cellulare/cod. cliente). Prefix-match sui
  // nomi campo cosi' valgono anche le varianti ("Cellulare CB", ...).
  const _identRiga = (det) => Object.keys(det || {})
    .filter(k => /^(codice contratto|cod\.? ?cliente|numero di cellulare|numero definitivo|numero provvisorio|cellulare)/i.test(k))
    .map(k => String(det[k] || "").trim()).filter(v => v.length >= 5);
  const righeCarrello = () => {
    const gruppi = [...cart];
    const curI = colItems();
    if (curI.length > 0 && bObj) gruppi.push({ brandId: brand, brandLabel: bObj.label, brandIcon: bObj.icon, brandColor: bObj.color, items: curI, isCurrent: true });
    const rows = []; const conta = {};
    gruppi.forEach(g => (g.items || []).forEach(it => {
      const base = String(g.brandId || "") + "::" + _etichettaRiga(it);
      conta[base] = (conta[base] || 0) + 1;
      const slug = SLUG_CATALOGO[g.brandId] || String(g.brandId || "").toLowerCase();
      const cat = (it && it.catalogo) || null;
      rows.push({
        key: base + "::" + conta[base], base, nCopia: conta[base], brandId: g.brandId, brandLabel: g.brandLabel,
        brandIcon: g.brandIcon, brandColor: g.brandColor, isCurrent: !!g.isCurrent, label: _etichettaRiga(it),
        // MOD-31: stato del contratto dal CATALOGO (offerta→prodotto→categoria→
        // brand; fallback storico: iliad assente, sky facoltativo)
        contratto: contrattoRichiestoPer(slug, cat ? cat.tipo : "", cat ? cat.categoria : "", cat ? cat.prodotto : "", cat ? cat.offerta : ""),
        _cat: cat, _det: (it && it.details) || {},
      });
    }));
    // MOD-32: telefono a rate AGGANCIATO a un'altra riga dello stesso brand
    // (identificativo condiviso) = vendita unica → il contratto lo porta la
    // riga principale, qui non si chiede
    rows.forEach(r => {
      if (r.contratto === "assente") return;
      if (!/telefono a rate/i.test((r._cat && r._cat.categoria) || "")) return;
      // REGOLA ASSOLUTA (caso Guido Terzi, 10/08): il telefono a rate venduto
      // INSIEME a un'attivazione mobile / customer base dello stesso brand ha
      // SEMPRE il contratto unico — non serve che i campi coincidano
      const miei = _identRiga(r._det);
      const principale = rows.find(o => o !== r && o.brandId === r.brandId
        && !/telefono a rate/i.test((o._cat && o._cat.categoria) || "")
        && (/mobile|customer base/i.test((o._cat && o._cat.categoria) || "")
          || (miei.length && _identRiga(o._det).some(v => miei.includes(v)))));
      if (principale) { r.contratto = "associato"; r._mainKey = principale.key; }
    });
    rows.forEach(r => { r.multi = (conta[r.base] || 0) > 1; });
    return rows;
  };
  // allegati di contratto/altro la cui riga non esiste piu' (riga eliminata o
  // offerta cambiata dopo l'upload): non si perdono — restano visibili in una
  // lista a parte e al submit finiscono sul PRIMO contratto (fallback storico)
  const allegatiOrfani = () => {
    const chiavi = {}; righeCarrello().forEach(r => { chiavi[r.key] = true; });
    return attachments.map((a, i) => ({ a, i })).filter(({ a }) => (a.type === "contratti" || a.type === "altro") && !chiavi[a.rowKey || ""]);
  };
  // GEMELLE (verifica avversaria 05/08): tra offerte IDENTICHE dello stesso
  // brand la chiave e' posizionale (::1, ::2…) — se una gemella sparisce dopo
  // l'upload, la superstite EREDITEREBBE in silenzio il contratto della riga
  // cancellata (PDF firmato sulla pratica sbagliata). Quando il numero di
  // gemelle di un'etichetta SCENDE, gli allegati di quell'etichetta si
  // STACCANO (rowKey azzerata → lista "da ricollegare", il gate torna rosso):
  // meglio un riaggancio esplicito che un documento legale sbagliato.
  const _gemelleRef = useRef({});
  useEffect(() => {
    const conta = {};
    righeCarrello().forEach(r => { conta[r.base] = (conta[r.base] || 0) + 1; });
    const prima = _gemelleRef.current || {};
    const calate = Object.keys(prima).filter(b => prima[b] > 1 && (conta[b] || 0) < prima[b]);
    if (calate.length) {
      setAttachments(p => p.map(a => (a.type === "contratti" || a.type === "altro") && a.rowKey && calate.some(b => String(a.rowKey).indexOf(b + "::") === 0)
        ? { ...a, rowKey: "" } : a));
      showToast("⚠️ Hai tolto una di più offerte identiche: ricollega i contratti alle righe giuste (lista allegati da ricollegare).");
    }
    _gemelleRef.current = conta;
  });
  // ── Renderer dello step Allegati (FUNZIONI chiamate nel JSX, mai componenti
  // dentro il componente: si perderebbe il focus a ogni render) ─────────────
  // Casella di upload (click, drag&drop, QR): per documento/fattura rowKey e'
  // null (livello carrello), per contratto/altro e' la chiave della riga.
  const boxAllegato = (a, rowKey = null, notaBox = null) => {
    const boxId = boxIdDi(a.t, rowKey);
    const cnt = attachments.filter(x => x.type === a.t && ((a.t === "contratti" || a.t === "altro") ? (x.rowKey || "") === (rowKey || "") : true)).length;
    const over = dragBox === boxId;
    return <label key={boxId}
      onDragOver={e => onBoxDragOver(e, boxId)} onDragEnter={e => onBoxDragOver(e, boxId)}
      onDragLeave={onBoxDragLeave} onDrop={e => onBoxDrop(e, a.t, rowKey)}
      style={{ display: "block", border: "2px dashed " + (over ? "var(--tf-17a2b8)" : (cnt > 0 ? "rgba(23,162,184,0.55)" : "var(--tf-w100)")), borderRadius: 10, padding: "14px 10px", textAlign: "center", cursor: "pointer", background: over ? "rgba(23,162,184,0.22)" : (cnt > 0 ? "rgba(23,162,184,0.08)" : "var(--tf-w30)"), transform: over ? "scale(1.02)" : "none", transition: "all .12s" }}>
      <input type="file" multiple onChange={e => handleFileChange(e, a.t, rowKey)} style={{ display: "none" }} />
      <div style={{ fontSize: 24, marginBottom: 4 }}>{a.i}</div>
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>{a.l}</div>
      <div style={{ display: "inline-flex", gap: 6, alignItems: "center", justifyContent: "center" }}>
        <span style={{ display: "inline-block", padding: "5px 14px", borderRadius: 6, background: "var(--tf-17a2b8)", color: "#fff", fontSize: 10, fontWeight: 700 }}>Carica</span>
        <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); openQr(a.t, rowKey); }} title="Carica dal telefono via QR" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: "rgba(23,162,184,0.12)", border: "1px solid rgba(23,162,184,0.5)", color: "var(--tf-5fd3e6)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>📱 QR</button>
      </div>
      <div style={{ fontSize: 9, color: "var(--tf-64748b)", marginTop: 5 }}>{over ? "Rilascia qui" : "o trascina i file"}</div>
      {notaBox && <div style={{ fontSize: 9, fontWeight: 700, color: "var(--tf-8892b0)", marginTop: 4 }}>{notaBox}</div>}
      {cnt > 0 && <div style={{ marginTop: 6, fontSize: 10, color: "var(--tf-17a2b8)", fontWeight: 700 }}>{cnt} file</div>}
    </label>;
  };
  // Lista file: `voci` = [{a: allegato, i: indice REALE in attachments}] cosi'
  // la ✕ rimuove l'elemento giusto anche dentro le liste filtrate per riga.
  const listaFileAllegati = (voci) => !voci.length ? null : (
    <div style={{ marginTop: 10, padding: 10, background: "var(--tf-w30)", borderRadius: 8, border: "1px solid var(--tf-w60)" }}>
      {voci.map(({ a: file, i: fi }, k) => <div key={fi} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", borderBottom: k < voci.length - 1 ? "1px solid var(--tf-w50)" : "none" }}>
        <div style={{ fontSize: 11, color: "var(--tf-f8fafc)" }}>
          <span onClick={() => apriAnteprima(file)} title="Anteprima" style={{ cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--tf-w300)", textUnderlineOffset: 2 }}>{file.name}</span>
          {" "}<span style={{ color: "var(--tf-64748b)", fontSize: 10 }}>· {file.type}</span>
          {file.reused && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: "var(--tf-34d399)", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.4)", borderRadius: 999, padding: "1px 8px" }}>♻️ dall&apos;archivio</span>}
        </div>
        <button type="button" onClick={() => setAttachments(p => p.filter((_, j) => j !== fi))} style={{ background: "none", border: "none", color: "var(--tf-dc3545)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✕</button>
      </div>)}
    </div>
  );
  const mancanzeVendita = () => {
    const m = [];
    // SOLO MARGINALITÀ (Luca 06/08): allegati tutti facoltativi — per un
    // accessorio spesso non ci sono i dati del cliente
    if (!(margFlow && !brand) && !attachments.some(a => a.type === "documento")) m.push("🪪 documento del cliente (step Allegati)");
    // CONTRATTO PER OGNI RIGA (Luca 05/08): ogni offerta non-Sky del carrello
    // vuole il SUO upload di contratto, agganciato alla riga (rowKey).
    // ECCEZIONE SKY (Luca 04/08): Sky non rilascia il contratto — le righe
    // Sky non lo richiedono mai (la casella resta disponibile, facoltativa).
    righeCarrello().forEach(r => {
      // MOD-31/32: blocca SOLO gli obbligatori — facoltativo/assente/associato
      // (vendita agganciata: contratto unico sulla riga principale) non fermano
      if (r.contratto !== "obbligatorio") return;
      if (!attachments.some(a => a.type === "contratti" && (a.rowKey || "") === r.key))
        m.push(`📄 contratto per ${r.brandLabel} — ${r.label}${r.multi ? " (n°" + r.nCopia + ")" : ""} (step Allegati)`);
    });
    if (!selVend || !selNeg || !dataVendita) m.push("🏪 attribuzione: venditore, negozio e data");
    // scelta ESPLICITA Sì/No sulle note (Luca 05/08): non basta passare dallo step
    if (!notaScelta) m.push("📝 la scelta Sì/No sulle note (step Note)");
    // Bug indirizzo (Luca 04/08): la via resta facoltativa, ma se è compilata
    // SENZA numero civico l'anagrafica va completata prima di salvare.
    if (String(ana.via || "").trim() && civicoMancante(ana.via)) m.push("🏠 numero civico nell'indirizzo (step Cliente)");
    return m;
  };
  const finalSubmit = async () => {
    if (submitLock.current) return;
    // auto-marginalità anche per il brand corrente non ancora "aggiunto al carrello"
    const nextMarg = bObj ? computeAutoMarg(margItems, brand, bObj.label, colItems()) : margItems;
    if (nextMarg !== margItems) setMargItems(nextMarg);
    const senzaPrezzo = margPriceMissing(nextMarg);
    if (senzaPrezzo.length) { setShowCart(true); sT("⚠️ Inserisci il prezzo di vendita per: " + senzaPrezzo.map(m => m.product).join(", ")); return; }
    submitLock.current = true;
    setSubmitting(true);
    let ok = false;
    try { ok = await _finalSubmitInner(nextMarg); }
    finally { if (!ok) { submitLock.current = false; setSubmitting(false); } }
  };
  const _finalSubmitInner = async (margList = margItems) => {
    if(blockSaveAll){sT("⚠ Completa tutti i prodotti (Incompleto) prima di salvare");return;}
    {
      // il gate vale per il ramo BRAND (la marginalità pura passa da saveMargOnly)
      const _manca = mancanzeVendita();
      if (_manca.length) {
        setShowCart(false);
        setVistaStep(_manca.some((x) => x.includes("Allegati") || x.includes("attribuzione")) ? "allegati" : _manca.some((x) => x.includes("civico")) ? "cliente" : "note");
        sT("⚠️ Per salvare la vendita completa prima: " + _manca.join(" · "));
        return;
      }
    }
    const _mm2 = margPriceMissing(margList);
    if(_mm2.length){setShowCart(true);sT("⚠️ Inserisci il prezzo di vendita per: "+_mm2.map(m=>m.product).join(", "));return;}
    const cur = colItems();
    // MATRICE BRAND×NEGOZIO sull'ATTRIBUZIONE (Luca 07/08): la griglia filtra
    // sul negozio dell'UTENTE loggato, ma il negozio della vendita si sceglie
    // ALLA FINE — qui si ricontrolla che il negozio attribuito possa
    // registrare OGNI brand del carrello (regola esplicita del negozio,
    // altrimenti default di rete del brand). Doppio livello: griglia = UX,
    // questa guardia = garanzia.
    try{
      const brandsVendita=[...new Set([...cart.map(g=>g.brandId),...((cur.length>0&&brand)?[brand]:[])])].filter(Boolean);
      if(brandsVendita.length&&selNeg){
        const [rr,rb]=await Promise.all([
          supabase.from("store_brand_rules").select("brand,registra").eq("store",selNeg),
          supabase.from("catalog_brands").select("id,default_abilitato"),
        ]);
        const rmap={};((rr&&rr.data)||[]).forEach(r=>{rmap[r.brand]=r.registra!==false;});
        const dmap={};((rb&&rb.data)||[]).forEach(r=>{dmap[r.id]=r.default_abilitato!==false;});
        const bloccati=brandsVendita.filter(bid=>{const slug=SLUG_CATALOGO[bid]||bid;
          return !((slug in rmap)?rmap[slug]:((slug in dmap)?dmap[slug]:true));});
        if(bloccati.length){
          const nomi=bloccati.map(bid=>(BRANDS.find(x=>x.id===bid)||{}).label||bid).join(", ");
          setShowCart(false);setVistaStep("allegati");
          sT("⛔ Il negozio "+selNeg+" non può registrare "+nomi+" (Amministrazione → Catalogo → Brand × Negozio): cambia il negozio di attribuzione o togli quei prodotti.");
          return;
        }
      }
    }catch{/* matrice non raggiungibile: la vendita non si blocca per un errore di rete */}
    const fc = [...cart];
    if (cur.length > 0 && bObj) {
      fc.push({
        brandId: brand,
        brandLabel: bObj.label,
        brandIcon: bObj.icon,
        brandColor: bObj.color,
        items: cur,
        sv: { sales: JSON.parse(JSON.stringify(sales)), sesCode, skyS: JSON.parse(JSON.stringify(skyS)) }
      });
    }

    if (fc.length === 0 && margList.length === 0) {
      sT("⚠️ Nessun prodotto da salvare");
      return;
    }

    try {
      // 1. CF/P.IVA OBBLIGATORIO (Luca 02/08) e letto dall'ANAGRAFICA:
      //    lookupValue e' il campo di ricerca e puo' contenere un cognome —
      //    prima finiva dritto in cf_piva. Il valore qui e' gia' validato
      //    da anaMissing; per i clienti esistenti senza CF risana la scheda.
      const cfPiva = (ana.cf || "").trim().toUpperCase().replace(/\s+/g, "");
      if (anaMissing.length > 0) {
        sT("⚠️ Campi obbligatori mancanti: " + anaMissing.join(", "));
        return;
      }
      const _ibanErr = (ana.iban || "").trim() ? erroreIbanIT(ana.iban) : null;
      if (_ibanErr) { sT("⚠️ IBAN non valido: " + _ibanErr); return; }

      // 2. Cliente gia' in anagrafica? Con il CF e' un match certo; senza CF
      //    riconosciamo lo stesso cliente solo se coincidono telefono E nome
      //    (o ragione sociale), per non fondere due persone diverse.
      const tel = (ana.cellulare || ana.recapito || "").trim();
      let existingClient = null;
      if (cfPiva) {
        const { data } = await supabase.from("clients").select("id").eq("cf_piva", cfPiva).limit(1);
        existingClient = data && data[0];
      } else if (tel) {
        let q = supabase.from("clients").select("id").eq("cellulare", tel);
        q = tipoCliente === "business"
          ? q.ilike("ragione_sociale", (ana.ragioneSociale || "").trim())
          : q.ilike("nome", (ana.nome || "").trim()).ilike("cognome", (ana.cognome || "").trim());
        const { data } = await q.limit(1);
        existingClient = data && data[0];
      }

      // UNIVOCITA' (regole Luca, agg. 01/08): se stiamo per creare un cliente
      // NUOVO ma il cellulare appartiene gia' a un altro DELLO STESSO TIPO, ci
      // si ferma e si sceglie: spostare il numero qui o inserirne un altro.
      // La coppia consumer+business (amministratore di societa') puo' invece
      // condividere il numero. L'email non blocca ma avvisa.
      if (!existingClient && tel) {
        const dup = await trovaDuplicati({ cellulare: tel, tipoNuovo: tipoCliente === "business" ? "business" : "consumer" });
        if (dup.cellulare) {
          if (spostaCellRef.current) {
            await liberaCellulare(dup.cellulare.id);
            spostaCellRef.current = false;
          } else {
            setDupCellCliente(dup.cellulare);
            setShowCart(true);
            sT("⚠️ Cellulare già associato a un altro cliente: scegli come procedere");
            return false;
          }
        }
      }
      if ((ana.email || "").trim()) {
        const dupM = await trovaDuplicati({ excludeId: existingClient?.id || null, email: ana.email });
        if (dupM.email) sT(`ℹ️ Email già registrata sotto “${dupM.email.label}” — si prosegue comunque`);
      }

      const idBase = cfPiva || tel.replace(/\D/g, "") || "ND";
      const clientId = existingClient?.id || `CL-${idBase.replace(/\s/g, "")}-${Date.now()}`;

      // Segnalazione 40: l'upsert riscrive TUTTA la riga. Registrando un secondo
      // contratto per un cliente gia' noto, i campi lasciati vuoti nel form
      // (indirizzo, CAP, citta', email...) sovrascrivevano con "" quelli gia'
      // salvati, e l'anagrafica si riduceva a nome e cognome. Ora si rilegge la
      // riga esistente e il vuoto non cancella: tiene il valore precedente.
      let prev: Record<string, unknown> = {};
      if (existingClient?.id) {
        const { data: full } = await supabase.from("clients").select("*").eq("id", existingClient.id).maybeSingle();
        if (full) prev = full as Record<string, unknown>;
      }
      const keep = (nuovo: string, campo: string) => {
        const v = (nuovo ?? "").toString().trim();
        if (v) return v;
        const old = prev[campo];
        return old == null ? "" : String(old);
      };

      const clientData = {
        id: clientId,
        tipo: tipoCliente === "privato" ? "consumer" : "business",
        nome: keep(ana.nome, "nome"),
        cognome: keep(ana.cognome, "cognome"),
        ragione_sociale: keep(ana.ragioneSociale, "ragione_sociale"),
        nome_ref: keep(ana.nomeRef, "nome_ref"),
        cognome_ref: keep(ana.cognomeRef, "cognome_ref"),
        // CF del referente business (mig. 139): obbligatorio in questo flusso
        cf_ref: tipoCliente === "business" ? (keep(ana.cfRef, "cf_ref") || null) : ((prev.cf_ref as string | null) ?? null),
        // archivio SENZA +39 (Luca 31/07): prefisso solo all'invio nelle integrazioni
        cellulare: numeroNazionale(keep(ana.cellulare || ana.recapito, "cellulare")) || keep(ana.cellulare || ana.recapito, "cellulare"),
        // recapito FISSO facoltativo delle business (mig. 124)
        telefono_fisso: tipoCliente === "business" ? (keep(ana.fisso, "telefono_fisso") || null) : ((prev.telefono_fisso as string | null) ?? null),
        email: keep(ana.email, "email"),
        cf_piva: cfPiva || null,
        // data di nascita derivata dal CF; se il CF manca resta quella nota
        data_nascita: dataNascitaDaCF(cfPiva) || ((prev.data_nascita as string | null) ?? null),
        // Segnalazioni 19 e 20: l'IBAN veniva raccolto dal form e poi scartato,
        // perche' la colonna non esisteva (migrazione 066).
        iban: keep(ana.iban, "iban") || null,
        intestatario_diverso: !!ana.intDiverso,
        intestatario_nome: ana.intDiverso ? (ana.intNome || null) : null,
        intestatario_cognome: ana.intDiverso ? (ana.intCognome || null) : null,
        intestatario_cf: ana.intDiverso ? (ana.intCf || null) : null,
        indirizzo: keep(ana.via, "indirizzo"),
        cap: keep(ana.cap, "cap"),
        citta: keep(ana.citta, "citta"),
        // Segnalazione 56: negozio di acquisizione. Storico: il primo contratto
        // vince, i successivi non lo modificano.
        acquisito_da: (prev.acquisito_da as string) || selNeg || null,
        is_demo: false,
        // cliente turista (mig. 140): resta sull'anagrafica per le prossime vendite
        turista: tipoCliente === "privato" ? !!turista : false
      };

      const { error: clientErr } = await supabase.from("clients").upsert(clientData, { onConflict: "id" });
      if (clientErr) throw clientErr;

      // 3. Upload Attachments
      setUploading(true);
      const uploadedFiles = [];
      let uploadFailCount = 0;
      for (const att of attachments) {
        // RIUSO ARCHIVIO (Luca 05/08): l'allegato punta a un file GIA' nel
        // bucket — niente nuovo upload, si riaggancia lo stesso file_url al
        // contratto di questa vendita (nessun doppione in storage).
        if (att.reused && att.url) { uploadedFiles.push({ url: att.url, name: att.name, type: att.type, rowKey: att.rowKey || null }); continue; }
        const fileExt = att.name.split(".").pop();
        const fileName = `${clientId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${clientId}/${fileName}`;

        const { error: uploadErr } = await supabase.storage
          .from("contracts")
          .upload(filePath, att.file);

        if (uploadErr) {
          console.error(`Upload failed for ${att.name}:`, uploadErr);
          uploadFailCount++;
        } else {
          const { data: { publicUrl } } = supabase.storage.from("contracts").getPublicUrl(filePath);
          uploadedFiles.push({ url: publicUrl, name: att.name, type: att.type, rowKey: att.rowKey || null });
        }
      }
      if (uploadFailCount > 0) {
        sT(`⚠️ ${uploadFailCount} file non caricati — controlla la connessione`);
      }

      // 4. Prepare Contract Rows
      const contractRows = [];
      const dateStr = dataVendita || new Date().toISOString().split("T")[0];

      // MAPPA riga carrello -> contract_id (Luca 05/08): l'id del contratto e'
      // generato QUI, prima dell'insert, quindi non serve fidarsi dell'ordine
      // delle righe restituite dal DB. La chiave e' la STESSA enumerazione
      // deterministica di righeCarrello() (fc = [...cart] + brand in corso,
      // stessi gruppi nello stesso ordine, stessa etichetta, stessa occorrenza).
      const _ctrIdPerRiga = {};   // rowKey -> contract id
      const _contaRighe = {};
      const _energiaIds = [];     // contratti energia: ci va la fattura
      fc.forEach(group => {
        (group.items || []).forEach((item) => {
          // Segnalazione 39: la colonna "Codice attivazione" funzionava solo per
          // Sky, l'unico che scrive la chiave "Codice Contratto". Gli altri brand
          // salvano il codice sotto il nome del campo di origine: WindTre come
          // `codice_contratto` (da d.contract) e, per il prodotto CB, come
          // "Cod.Cliente CB". Vodafone non rilascia un codice contratto, quindi
          // non va inventato: resta vuoto.
          const _d = item.details || {};
          const _brand = String(group.brandId || "").toLowerCase();
          const actCode = _brand === "vodafone" ? "—" : (
            _d["Codice Contratto"] ||          // Sky
            _d["codice_contratto"] ||          // WindTre, Fastweb, Iliad, TIM…
            _d["Cod. Contratto"] ||            // W3 sostituzione SIM
            _d["Cod. Contratto CB"] ||         // WindTre CB: prima il codice CONTRATTO...
            _d["Cod.Cliente CB"] ||            // ...e solo se manca il codice CLIENTE (TNP)
            _d["Cod.Cliente Cambio"] ||        // WindTre CB cambio offerta
            _d["Codice Proposta"] ||
            _d["Codice Ordine"] ||
            "—"
          );
          // Tassonomia unica: in `categoria` va l'ETICHETTA CANONICA (Mobile, Fisso,
          // Energia, ...) — mai piu' il titolo del menu' del brand, che resta nei
          // dettagli (menu_brand) per non perdere nulla. Layer 1 del flusso (Luca 25/07).
          // Vendite dal flusso catalogo: macro-categoria ESPLICITA (perimetro
          // chiuso, niente inferenza); il legacy resta per il carrello storico.
          const macroId = item.catalogo ? (item.catalogo.macro || "extra") : categoriaDi(group.brandLabel, item.macro, item.sub);
          // MOD-23 (Luca 10/08): criterio UNICO condiviso col Tracking — tutto
          // ciò che NON entra nel Tracking PDA (vaInTracking false) nasce già
          // "Attivo" in Ricerca Vendite: Very, CB, Multi-Servizi, POS, digitale,
          // extra, sostituzioni e mobile consumer semplice. Prima un'euristica
          // locale divergeva (Segnalazione 91): Very/CB/POS nascevano "Nuovo"
          // per sempre e il mobile BUSINESS semplice nasceva "Attivo" per errore
          // pur entrando in tracking. Le chiavi passate coincidono con la riga
          // scritta nel push qui sotto, così nascita e Tracking non divergono.
          const _ctrl = controlliDi(item.details);
          const giaAttivo = !vaInTracking({
            brand: group.brandLabel, prodotto: item.sub, categoria: item.macro,
            categoria_macro: macroId, controlli: _ctrl,
            tipo_cliente: item.catalogo ? item.catalogo.tipo : null, dettagli: item.details,
          });
          // chiave riga identica a righeCarrello(): brand + etichetta + occorrenza
          const _rigaBase = String(group.brandId || "") + "::" + _etichettaRiga(item);
          _contaRighe[_rigaBase] = (_contaRighe[_rigaBase] || 0) + 1;
          const _ctrId = `CTR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
          _ctrIdPerRiga[_rigaBase + "::" + _contaRighe[_rigaBase]] = _ctrId;
          if (macroId === "energia") _energiaIds.push(_ctrId);
          contractRows.push({
            id: _ctrId,
            client_id: clientId,
            data: dateStr,
            brand: group.brandLabel,
            categoria: CANONICA_BY_ID[macroId],
            categoria_macro: macroId,
            controlli: controlliDi(item.details),
            prodotto: item.sub,
            // 6 LIVELLI (mig. 093): tipo cliente, offerta e opzioni della vendita.
            tipo_cliente: item.catalogo ? item.catalogo.tipo : null,
            offerta: item.catalogo ? item.catalogo.offerta : null,
            opzioni: item.catalogo ? item.catalogo.opzioni : null,
            // Segnalazione 52: Extra e Sostituzione SIM nascono gia' attivi
            // (Completato nel Tracking), non "Nuovo".
            stato: giaAttivo ? "Attivo" : "Nuovo",
            stato_negozio: giaAttivo ? "attivato" : "nuovo",
            venditore: selVend,
            negozio: selNeg,
            codice_attivazione: String(actCode),
            data_registrazione: dateStr,
            data_attivazione: dateStr,   // compilata subito: e' la data di registrazione (Luca)
            note: (notaOn && nota.trim()) ? nota.trim() : null,
            // categoria_catalogo: la categoria FINE del catalogo (es. "Mobile
            // Wallet" vs "Mobile Ric. Auto") — la macro in `categoria` non basta
            // a distinguerle e la Ricerca filtra su questa (Luca 28/07).
            dettagli: { ...(item.details || {}), menu_brand: item.macro, ...(item.catalogo?.categoria ? { categoria_catalogo: item.catalogo.categoria } : {}) },
            is_demo: false
          });
        });
      });

      margList.forEach(mi => {
        contractRows.push(_margRigaFin({
          id: `EXT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          client_id: clientId,
          data: dateStr,
          brand: "Marginalità",
          categoria: "Marginalità",
          categoria_macro: "extra",
          controlli: [],
          prodotto: mi.product,
          // Segnalazione 52: anche i prodotti a marginalita' salvati INSIEME a una
          // registrazione brand sono vendite Extra, quindi nascono gia' Attivi.
          // Questo percorso era rimasto su "Nuovo" (l'altro, la vendita diretta
          // senza brand, era gia' stato corretto).
          stato: "Attivo",
          stato_negozio: "attivato",
          venditore: mi.vendor || selVend,
          negozio: mi.store || selNeg,
          codice_attivazione: "VENDITA-DIRETTA",
          data_registrazione: dateStr,
          data_attivazione: dateStr,   // compilata subito: e' la data di registrazione (Luca)
          dettagli: { product: mi.product, price: (mi.importo != null ? mi.importo : mi.price), importo: mi.importo ?? null, margin: mi.margin, qty: mi.qty, model: mi.model, imei: mi.imei, units: Array.isArray(mi.units) ? mi.units : null },
          is_demo: false
        }, mi));
      });

      // Promemoria di Step 7 -> task in calendario (tabella gia' esistente).
      if (notaOn && promData) {
        await supabase.from("calendar_tasks").insert({
          title: `Promemoria contratto — ${ana.cognome || ana.ragioneSociale || "cliente"}`,
          date: promData,
          time: promOra || null,
          status: "da_fare",
          notes: promDesc || nota || null,
          client_ref: clientId,
          created_by: user?.name || selVend || "—",
          assigned_to: selVend || user?.name || "—",
          assigned_to_store: promNeg || selNeg || null,
          is_demo: false,
        });
      }

      // 5. Insert contracts then link attachments
      if (contractRows.length > 0) {
        const { error: contractErr } = await supabase.from("contracts").insert(contractRows);
        if (contractErr) throw contractErr;

        // ALLEGATI PER CONTRATTO (Luca 05/08): prima TUTTI gli allegati
        // finivano sul primo contratto del carrello. Ora:
        //  - documento d'identita' (caricato o riusato): replicato su OGNI
        //    PRATICA BRAND (righe CTR-) della vendita — stesso file_url, una
        //    riga per contratto, cosi' ogni pratica e' completa nel modale di
        //    Ricerca Vendite. MAI sulle voci marginalita' EXT- (caso D'Atria
        //    07/08: 4 documenti × 5 righe = 23 allegati in scheda cliente);
        //    senza righe CTR (solo marginalita' nel carrello brand) fallback
        //    su tutte, altrimenti il documento resterebbe orfano;
        //  - contratto/altro: sulla riga corrispondente via rowKey; se la
        //    riga non esiste piu' (orfano) fallback sul primo contratto;
        //  - fattura (energia): sui contratti energia, o primo se non ce ne sono.
        if (uploadedFiles.length > 0) {
          const _tuttiIds = contractRows.map(r => r.id);
          const _ctrIds = _tuttiIds.filter(id => String(id).startsWith("CTR-"));
          const _primoId = _tuttiIds[0];
          const attendanceRows = [];
          uploadedFiles.forEach(f => {
            const aggiungi = (cid) => attendanceRows.push({ contract_id: cid, client_id: contractRows[0]?.client_id || null, file_url: f.url, file_name: f.name, file_type: f.type });
            if (f.type === "documento") (_ctrIds.length ? _ctrIds : _tuttiIds).forEach(aggiungi);
            else if (f.type === "fattura") (_energiaIds.length ? _energiaIds : [_primoId]).forEach(aggiungi);
            else {
          aggiungi((f.rowKey && _ctrIdPerRiga[f.rowKey]) || _primoId);
          // contratto UNICO (10/08): stesso file_url anche sulle righe rate
          // associate alla riga principale (riferimento, non copia)
          if (f.type === "contratti" && f.rowKey) {
            righeCarrello().filter(r => r.contratto === "associato" && r._mainKey === f.rowKey && _ctrIdPerRiga[r.key])
              .forEach(r => aggiungi(_ctrIdPerRiga[r.key]));
          }
        }
          });
          const { error: attErr } = await supabase.from("contract_attachments").insert(attendanceRows);
          if (attErr) console.error("Attachment Meta Error:", attErr);
        }

        // DOCUMENTI — ESITO RIUSO (Luca 05/08 + MOD-14 08/08): al salvataggio
        // della vendita coi NUOVI documenti, le righe vecchie cambiano stato in
        // base all'esito scelto in verifica. SOLO se sono stati davvero caricati
        // nuovi documenti. Idempotente. 'altro' = restano validi (niente update):
        //   · scaduti  → documento_archiviato (vecchio, fuori dai validi)
        //   · smarrito → documento_smarrito  (fuori dai validi, visibile ad admin)
        //   · altro    → nessuna modifica: i vecchi restano validi in parallelo
        if (docRiuso && (docRiuso.esito === "scaduti" || docRiuso.esito === "smarrito") && (docRiuso.docs || []).length && uploadedFiles.some(f => f.type === "documento")) {
          const nuovoType = docRiuso.esito === "smarrito" ? "documento_smarrito" : "documento_archiviato";
          const { error: archErr } = await supabase.from("contract_attachments")
            .update({ file_type: nuovoType })
            .in("id", docRiuso.docs.map(d => d.id));
          if (archErr) console.error("Aggiornamento stato documenti riuso error:", archErr);
        }
        // MATCH APPUNTAMENTO (cantiere 08/08): se questa vendita chiude un
        // appuntamento del call center (stesso CF, entro 30gg dalla data
        // fissata) lo aggancia. STESSO negozio + venditore che ci lavora →
        // POPUP: il venditore decide se associare (cooperation al caller).
        // ALTRO negozio → automatico "attivato_diverso_negozio" (visibilita',
        // niente cooperation). Non blocca MAI il salvataggio.
        try {
          const _ctrDaMatch = contractRows.filter(r => String(r.id).startsWith("CTR-")).map(r => r.id);
          if (_ctrDaMatch.length && (ana.cf || ana.cfRef)) {
            const cand = await trovaAppuntamentoDaAgganciare(ana.cf, ana.cfRef || null, selNeg, dateStr);
            if (cand) {
              const radiceApp = cand.appuntamento.store ? _storeRoot(cand.appuntamento.store) : null;
              const vendOk = !radiceApp || await venditoreLavoraIn(selVend || user?.name || null, radiceApp);
              if (cand.stessoNegozio && vendOk) {
                // stesso negozio: chiedo al venditore (popup dopo il reset)
                setMatchPending({ app: cand.appuntamento, contractIds: _ctrDaMatch, firma: user?.name || selVend || "match" });
              } else {
                // altro negozio: attivato ma senza cooperation, in automatico
                await agganciaVenditaAppuntamento(cand.appuntamento.id, _ctrDaMatch, user?.name || selVend || "match", false);
              }
            }
          }
        } catch (e) { console.error("[MATCH-APP]", e); }
      }

      // scarico magazzino usati: i telefoni scelti dal magazzino passano a
      // "venduto" su Gestione Usati, con prezzo effettivo e cliente collegato
      await scaricaUsatiVenduti(margList, clientId, dateStr, selVend);

      setUploading(false);
      sT(`✅ Salvato! ${fc.length} brand, ${contractRows.length} prodotti in totale`);
      // Il blocco resta attivo fino al reset: altrimenti nei 2 secondi di attesa
      // il carrello e' ancora pieno e un altro clic risalverebbe tutto.
      setTimeout(() => { fullReset(); submitLock.current = false; setSubmitting(false); }, 2000);
      return true;
    } catch (err) {
      setUploading(false);
      console.error("Submit Error:", err);
      sT("❌ Errore durante il salvataggio: " + (err.message || "Verifica connessione"));
    }
    return false;
  };
  // Salvataggio della vendita di soli prodotti (nessuna attivazione brand).
  // Prima il bottone "Salva vendita" faceva soltanto fullReset() + toast:
  // mostrava "Vendita salvata!" senza scrivere NULLA a database, quindi la
  // marginalita' venduta senza brand andava persa. Ora crea le righe EXT-
  // come fa handleSubmit per il ramo con brand.
  const [margSaving,setMargSaving]=useState(false);
  // ── MOD-44 (Luca 10/08): vendita USATO con FINANZIAMENTO ──
  // La riga marginalità della vendita usato con unità finanziate diventa una
  // PRATICA DI FINANZIAMENTO nel Tracking PDA: brand "Prodotti e Marginalità"
  // (non inizia per "Marginal" → passa il perimetro vaInTracking), macro
  // mobile + controllo finanziamento → riga Finanziamento; nasce "Nuovo"
  // (da lavorare), non gia' attiva.
  const _usatoFinanziato=(mi)=>mi&&mi.productId==="vendita_usato"&&Array.isArray(mi.units)&&mi.units.some(u=>u&&u.finanziato==="si");
  const _margRigaFin=(riga,mi)=>{
    if(!_usatoFinanziato(mi))return riga;
    const rate=mi.units.filter(u=>u&&u.finanziato==="si").map(u=>u.rate).filter(Boolean);
    return {...riga,
      // brand INVARIATO "Marginalità" (Luca 10/08: niente tessera doppia in
      // Ricerca Vendite, categoria resta Marginalità) — nel Tracking entra
      // per l'eccezione margFinanziata come riga Finanziamento
      brand:"Marginalità",categoria_macro:"extra",controlli:["finanziamento"],
      stato:"Nuovo",stato_negozio:"nuovo",data_attivazione:null,
      dettagli:{...riga.dettagli,"Finanziato":"Sì","N. Rate":rate.join(", ")||null},
    };
  };
  // MOD-44b (Luca 10/08): col finanziamento l'anagrafica e' quella dello
  // STEP CLIENTE (step 2) — niente raccolta "diversa" nella finestrina: se
  // manca, si torna sullo step 2 a compilarla, e il salvataggio la usa.
  const _anaComeForm=()=>({anonimo:false,tipo:(ana.ragioneSociale||"").trim()?"business":"consumer",
    nome:ana.nome||"",cognome:ana.cognome||"",ragioneSociale:ana.ragioneSociale||"",
    nomeRef:ana.nomeRef||"",cognomeRef:ana.cognomeRef||"",cfRef:ana.cfRef||"",
    tel:ana.cellulare||"",fisso:ana.fisso||"",email:ana.email||"",cf:ana.cf||"",
    via:ana.via||"",cap:ana.cap||"",citta:ana.citta||""});
  const _anaStep2Ok=()=>((ana.cf||"").trim().length>=11)
    &&((((ana.nome||"").trim()&&(ana.cognome||"").trim()))||(ana.ragioneSociale||"").trim())
    &&(ana.cellulare||"").trim().length>0;
  // MOD-44c: per la marginalità SENZA finanziamento basta anche UN solo dato
  // identificativo (solo nome, solo cognome, solo CF o ragione sociale)
  const margMinOk=!!((ana.nome||"").trim()||(ana.cognome||"").trim()||(ana.cf||"").trim()||(ana.ragioneSociale||"").trim());
  const saveMargOnly=async()=>{
    const _mm = margPriceMissing(margItems);
    if (_mm.length) { sT("⚠️ Inserisci il prezzo di vendita per: " + _mm.map(m => m.product).join(", ")); return; }
    if(margSaving)return;
    // MOD-44c: i dati cliente vengono SOLO dallo step Cliente; "anonimo" = skip
    // esplicito confermato dal popup (tracciato sulla vendita)
    const anon=margSkipCli;
    // MOD-44: con un USATO FINANZIATO servono anagrafica VERA (niente skip)
    // e allegati documento + contratto obbligatori
    const _conFin=margItems.some(_usatoFinanziato);
    if(_conFin){
      if(anon){setShowMargSave(false);setMargSkipCli(false);setVistaStep("cliente");setShowAna(true);sT("💳 Usato con finanziamento: i dati del cliente sono OBBLIGATORI, non si possono saltare — compilali nello step Cliente");return;}
      if(!margCliSel&&!_anaStep2Ok()){
        setShowMargSave(false);setVistaStep("cliente");setShowAna(true);
        sT("💳 Usato con finanziamento: compila l'anagrafica del cliente nello step Cliente (CF, nome/ragione sociale e cellulare), poi torna a salvare");
        return;
      }
      if(!attachments.some(a=>a.type==="documento")){sT("⚠️ Usato con finanziamento: carica il DOCUMENTO del cliente nello step Allegati");setShowMargSave(false);setVistaStep("allegati");return;}
      if(!attachments.some(a=>a.type==="contratti")){sT("⚠️ Usato con finanziamento: carica il CONTRATTO di finanziamento nello step Allegati");setShowMargSave(false);setVistaStep("allegati");return;}
    }
    if(!anon&&!margCliSel){
      const f=_anaComeForm();
      // MOD-44c: basta UN dato identificativo (anche solo nome, solo cognome o
      // solo CF) — senza nulla si torna allo step Cliente, dove al limite si
      // salta in modo esplicito e tracciato
      const haId=!!(f.nome.trim()||f.cognome.trim()||f.cf.trim()||f.ragioneSociale.trim());
      if(!haId){
        setShowMargSave(false);setVistaStep("cliente");setShowAna(true);
        sT("👤 Compila almeno un dato del cliente nello step Cliente (basta anche solo nome, cognome o CF) — oppure salta da lì in modo esplicito");
        return;
      }
      // Bug indirizzo (Luca 04/08): via facoltativa, ma se compilata il civico va messo
      if(f.via.trim()&&civicoMancante(f.via)){showToast("⚠️ Nell'indirizzo manca il numero civico (es. \"Via Roma 12\"): aggiungilo o lascia il campo vuoto");return;}
    }
    setMargSaving(true);
    try{
      const dateStr=dataVendita||new Date().toISOString().split("T")[0];
      let clientId;
      if(anon){
        // Un unico cliente segnaposto condiviso: client_id e' NOT NULL con FK,
        // ma non inventiamo un anagrafica finta per ogni vendita anonima.
        clientId="CL-VENDITA-DIRETTA";
        await supabase.from("clients").upsert({
          id:clientId,tipo:"consumer",nome:"Vendita diretta",cognome:"",
          cellulare:"",email:"",cf_piva:null,indirizzo:"",cap:"",citta:"",is_demo:false,
        },{onConflict:"id"});
      }else if(margCliSel){
        // anagrafica ESISTENTE scelta dalla ricerca: si usa quella, niente doppioni
        clientId=margCliSel.id;
      }else{
        // stessa logica del flusso brand: CF = match certo; senza CF si
        // riconosce solo con telefono + nome (o ragione sociale); univocita'
        // cellulare; il merge non cancella i dati gia' salvati (segn. 40)
        // MOD-44c: i dati sono SEMPRE quelli dello STEP CLIENTE
        const f=_anaComeForm();
        const business=f.tipo==="business";
        const cfPiva=(f.cf||"").trim();
        const tel=f.tel.trim();
        let existing=null;
        if(cfPiva){
          const {data}=await supabase.from("clients").select("id").eq("cf_piva",cfPiva).limit(1);
          existing=data&&data[0];
        }else if(tel){
          let q=supabase.from("clients").select("id").eq("cellulare",tel);
          q=business?q.ilike("ragione_sociale",(f.ragioneSociale||"").trim()):q.ilike("nome",f.nome.trim()).ilike("cognome",f.cognome.trim());
          const {data}=await q.limit(1);
          existing=data&&data[0];
        }
        if(!existing&&tel){
          // stesso tipo = blocco; coppia consumer+business ammessa (Luca 01/08)
          const dup=await trovaDuplicati({cellulare:tel,tipoNuovo:business?"business":"consumer"});
          if(dup.cellulare){showToast(`⚠️ Cellulare già associato a “${dup.cellulare.label}” (stesso tipo): usa un altro numero o registra dalla sua scheda`);setMargSaving(false);return;}
        }
        let prev={};
        if(existing&&existing.id){const {data:full}=await supabase.from("clients").select("*").eq("id",existing.id).maybeSingle();if(full)prev=full;}
        const keep=(nuovo,campo)=>{const v=(nuovo??"").toString().trim();if(v)return v;const old=prev[campo];return old==null?"":String(old);};
        const idBase=cfPiva||tel.replace(/\D/g,"")||"ND";
        clientId=(existing&&existing.id)||`CL-${idBase.replace(/\s/g,"")}-${Date.now()}`;
        const {error:ce}=await supabase.from("clients").upsert({
          id:clientId,tipo:business?"business":"consumer",
          nome:keep(f.nome,"nome"),cognome:keep(f.cognome,"cognome"),
          ragione_sociale:keep(f.ragioneSociale,"ragione_sociale"),
          nome_ref:keep(f.nomeRef,"nome_ref"),cognome_ref:keep(f.cognomeRef,"cognome_ref"),
          cf_ref:business?(keep(f.cfRef,"cf_ref")||null):(prev.cf_ref??null),
          cellulare:numeroNazionale(keep(f.tel,"cellulare"))||keep(f.tel,"cellulare"),
          telefono_fisso:business?(keep(f.fisso,"telefono_fisso")||null):(prev.telefono_fisso??null),
          email:keep(f.email,"email"),cf_piva:cfPiva||null,
          data_nascita:dataNascitaDaCF(cfPiva)||(prev.data_nascita??null),
          indirizzo:keep(f.via,"indirizzo"),cap:keep(f.cap,"cap"),citta:keep(f.citta,"citta"),
          acquisito_da:prev.acquisito_da||selNeg||null,
          is_demo:false,
        },{onConflict:"id"});
        if(ce)throw ce;
      }
      const rows=margItems.map(mi=>_margRigaFin({
        id:`EXT-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
        client_id:clientId,data:dateStr,brand:"Marginalità",categoria:"Marginalità",categoria_macro:"extra",controlli:[],
        // Segnalazione 52: le vendite a marginalita' sono brand Extra, quindi
        // nascono gia' Attive (non sono pratiche da attivare). Questo percorso di
        // salvataggio scriveva "Nuovo" fisso e non valorizzava l'esito negozio.
        prodotto:mi.product,stato:"Attivo",stato_negozio:"attivato",venditore:mi.vendor||selVend,negozio:mi.store||selNeg,
        codice_attivazione:"VENDITA-DIRETTA",data_registrazione:dateStr,data_attivazione:dateStr,
        // MOD-44c: lo skip dei dati cliente resta TRACCIATO sulla vendita
        dettagli:{product:mi.product,price:(mi.importo!=null?mi.importo:mi.price),importo:mi.importo??null,margin:mi.margin,qty:mi.qty,model:mi.model,imei:mi.imei,units:Array.isArray(mi.units)?mi.units:null,...(anon?{"Anagrafica saltata":"Sì","Saltata da":selVend||""}:{})},
        is_demo:false,
      },mi));
      const {error}=await supabase.from("contracts").insert(rows);
      if(error)throw error;
      // MOD-44: allegati della vendita marginalità — con FINANZIAMENTO sono
      // gia' stati verificati obbligatori; si caricano e si agganciano alla
      // pratica di finanziamento (o alla prima riga)
      try{
        const praticaFin=rows.find(r=>Array.isArray(r.controlli)&&r.controlli.includes("finanziamento"));
        const targetId=(praticaFin||rows[0])?.id;
        if(targetId&&attachments.length){
          const attRows=[];
          for(const att of attachments){
            let url=att.reused?att.url:null;
            if(!url&&att.file){
              const ext=(att.name.split(".").pop()||"bin").toLowerCase();
              const path=`${clientId}/${clientId}_${Date.now()}_${Math.random().toString(36).slice(2,7)}.${ext}`;
              const {error:eUp}=await supabase.storage.from("contracts").upload(path,att.file);
              if(eUp)continue;
              url=supabase.storage.from("contracts").getPublicUrl(path).data.publicUrl;
            }
            if(url)attRows.push({contract_id:targetId,client_id:clientId,file_url:url,file_name:att.name,file_type:att.type});
          }
          if(attRows.length)await supabase.from("contract_attachments").insert(attRows);
        }
      }catch{/* allegati best-effort: la vendita e' gia' salva */}
      await scaricaUsatiVenduti(margItems, clientId, dateStr, selVend);
      setMargSaveForm({...MARG_FORM_VUOTO});
      setMargCliCerca("");setMargCliHits([]);setMargCliSel(null);
      setMargSkipCli(false);
      setShowMargSave(false);
      fullReset();
      showToast(`Vendita salvata! ${rows.length} prodott${rows.length===1?"o":"i"} registrat${rows.length===1?"o":"i"}`);
    }catch(e){
      showToast("Errore salvataggio: "+(e?.message||"riprova"));
    }finally{setMargSaving(false);}
  };

  // Ricerca REALE del cliente. Prima questa funzione non interrogava nulla:
  // dichiarava "Trovato!" e riempiva l'anagrafica con un cliente inventato
  // (Mario Rossi / Rossi S.r.l. / IBAN fittizio), qualunque CF si digitasse.
  // Prosegue senza cercare: il cliente non ha (o non ricorda) il CF.
  const skipLookup=()=>{
    setClienteFound(false);setLookupDone(true);
    setShowAna(true);setShowStep4(false);
  };
  // Compila l'anagrafica da una riga clients (usata dal CF esatto e dai
  // suggerimenti per nome) e sblocca il passo successivo.
  const applicaCliente=(c)=>{
    setClienteFound(true);
    setLookupDone(true);
    setShowAna(true);setShowStep4(false);
    setAna({
      nome:c.nome||"",cognome:c.cognome||"",cellulare:c.cellulare||"",email:c.email||"",
      via:c.indirizzo||"",cap:c.cap||"",citta:c.citta||"",iban:c.iban||"",cf:c.cf_piva||"",
      intDiverso:!!c.intestatario_diverso,intNome:c.intestatario_nome||"",
      intCognome:c.intestatario_cognome||"",intCf:c.intestatario_cf||"",
      // referente business: ripiego su nome/cognome per lo storico caller pre-mig. 124
      ragioneSociale:c.ragione_sociale||"",
      nomeRef:c.nome_ref||(c.tipo==="business"?c.nome||"":""),
      cognomeRef:c.cognome_ref||(c.tipo==="business"?c.cognome||"":""),
      cfRef:c.cf_ref||"",
      recapito:c.cellulare||"",fisso:c.telefono_fisso||"",
    });
    if(c.tipo==="business"&&tipoCliente!=="business")setTipoCliente("business");
    if(c.tipo==="consumer"&&tipoCliente!=="privato")setTipoCliente("privato");
    setTurista(!!c.turista&&c.tipo!=="business");
    verificaAppuntamentoBanner(c.cf_piva,c.cf_ref);
  };
  const doLookup=async()=>{
    const v=(lookupValue||"").trim();
    if(lookupBusy)return;
    if(!v){skipLookup();return;}
    // se sto cercando per NOME e c'è un solo suggerimento, Invio lo seleziona
    if(sugg.length===1){await scegliSugg(sugg[0]);return;}
    setLookupBusy(true);
    try{
      const {data}=await supabase.from("clients").select("*").ilike("cf_piva",v).limit(1);
      const c=data&&data[0];
      setLookupDone(true);
      setShowAna(true);setShowStep4(false);
      if(!c){
        setClienteFound(false);
        setAna({nome:"",cognome:"",cellulare:"",email:"",via:"",cap:"",citta:"",iban:"",cf:/^[A-Z0-9]{11,16}$/.test(v.replace(/\s+/g,""))?v.replace(/\s+/g,""):"",ragioneSociale:"",nomeRef:"",cognomeRef:"",cfRef:"",recapito:"",fisso:"",intDiverso:false,intNome:"",intCognome:"",intCf:""});
        setTurista(false);
        // il cliente non e' a sistema ma il CF potrebbe avere un appuntamento
        verificaAppuntamentoBanner(v.replace(/\s+/g,""),"");
        return;
      }
      applicaCliente(c);
    }finally{setLookupBusy(false);}
  };

  // ── RICERCA PER NOME nel campo CF (Luca 28/07): suggerimenti live tra i
  //    clienti IN VISIBILITÀ (acquisiti/gestiti nei negozi visibili; sede e
  //    direzione vedono tutto). Il CF esatto resta invece GLOBALE: digitare
  //    il codice è la prova di conoscere il cliente. ──
  const visCli=useClientiVisibili();   // FONTE UNICA: stessa regola della pagina Clienti (accessi concessi compresi)
  const [sugg,setSugg]=useState([]);
  const _suggTO=useRef(null);
  useEffect(()=>{
    const v=(lookupValue||"").trim();
    if(_suggTO.current)clearTimeout(_suggTO.current);
    const compat=v.replace(/\s+/g,"");
    // P.IVA MODE (Luca 03/08): mentre scrivo cifre, filtro i clienti per
    // cf_piva — stesso comportamento dei suggerimenti per cognome
    const pivaMode=/^\d{4,}$/.test(compat);
    const nomeMode=v.length>=3&&/[A-ZÀ-Ù]/i.test(v)&&(v.includes(" ")||/^[A-ZÀ-Ù' ]+$/i.test(v));
    if(!nomeMode&&!pivaMode){setSugg([]);return;}
    _suggTO.current=setTimeout(async()=>{
      if(pivaMode){
        const {data}=await supabase.from("clients")
          .select("id,nome,cognome,ragione_sociale,cf_piva,cellulare,tipo")
          .ilike("cf_piva",`%${compat}%`)
          .limit(25);
        setSugg((data||[]).filter(c=>visCli.visibile(c.id)).slice(0,6));
        return;
      }
      const termini=v.toLowerCase().split(/\s+/).filter(Boolean);
      const chiave=[...termini].sort((a,b)=>b.length-a.length)[0].replace(/[,()%]/g,"");
      if(!chiave){setSugg([]);return;}
      const {data}=await supabase.from("clients")
        .select("id,nome,cognome,ragione_sociale,cf_piva,cellulare,tipo")
        .or(`nome.ilike.%${chiave}%,cognome.ilike.%${chiave}%,ragione_sociale.ilike.%${chiave}%`)
        .limit(25);
      const rows=(data||[]).filter(c=>{
        const full=`${c.nome||""} ${c.cognome||""} ${c.ragione_sociale||""}`.toLowerCase();
        if(!termini.every(t=>full.includes(t)))return false;
        return visCli.visibile(c.id);
      }).slice(0,6);
      setSugg(rows);
    },350);
    return()=>{if(_suggTO.current)clearTimeout(_suggTO.current);};
  },[lookupValue,visCli.visibile]); // eslint-disable-line react-hooks/exhaustive-deps
  const scegliSugg=async(r)=>{
    setSugg([]);
    const {data}=await supabase.from("clients").select("*").eq("id",r.id).maybeSingle();
    if(data){setLookupValue(data.cf_piva||"");applicaCliente(data);}
  };


  const tCI=cart.reduce((s,g)=>s+g.items.length,0)+colItems().length+margItems.length;
  // SENZA brand niente grigio topo (Luca 03/08): il colore di piattaforma
  // e' l'indigo del CRM — il grigio compariva su stepper, riepilogo e carrello
  const bC=bObj?bObj.color:"var(--tf-6366f1)";
  _brandAccento=bC;   // i dettagli dei flussi seguono il brand (Luca 03/08)
  const bG=bObj?bObj.gradient:"linear-gradient(135deg,#4f46e5,#6366f1)";
  // CF/P.IVA SEMPRE OBBLIGATORIO su qualsiasi brand (Luca 02/08): senza,
  // la vendita non si registra. Il campo sta nell'anagrafica, cosi' anche
  // per i clienti gia' in archivio SENZA codice lo si aggiunge a mano e
  // il salvataggio risana la scheda cliente.
  const anaMissing = (()=>{
    const miss=[];
    const cf=(ana.cf||"").trim().toUpperCase().replace(/\s+/g,"");
    if(tipoCliente==="business"){
      if(!(ana.ragioneSociale||"").trim())miss.push("Ragione Sociale");
      if(!(ana.nomeRef||"").trim())miss.push("Nome Ref.");
      if(!(ana.cognomeRef||"").trim())miss.push("Cognome Ref.");
      // CF del REFERENTE obbligatorio (03/08, mig. 139): serve la persona
      // fisica dietro l'azienda, non basta la P.IVA
      const cfR=(ana.cfRef||"").trim().toUpperCase().replace(/\s+/g,"");
      if(!cfR)miss.push("CF Ref.");
      else if(!/^[A-Z0-9]{16}$/.test(cfR))miss.push("CF Ref. (16 caratteri)");
      if(!(ana.recapito||"").trim())miss.push("Recapito");
      if(!cf)miss.push("P.IVA");
      else if(!/^\d{11}$/.test(cf)&&!/^[A-Z0-9]{16}$/.test(cf))miss.push("P.IVA (11 cifre, o CF 16 caratteri per le ditte individuali)");
    }else{
      if(!(ana.nome||"").trim())miss.push("Nome");
      if(!(ana.cognome||"").trim())miss.push("Cognome");
      if(!(ana.cellulare||"").trim())miss.push("Cellulare");
      // TURISTA (03/08, mig. 140): cliente senza CF italiano — il codice
      // non si chiede, ma la vendita resta limitata (vedi guardie sotto)
      if(!turista){
        if(!cf)miss.push("Codice Fiscale");
        else if(!/^[A-Z0-9]{16}$/.test(cf))miss.push("Codice Fiscale (16 caratteri)");
      }
    }
    if(turista){
      if(tipoCliente==="business")miss.push("Turista: solo clienti privati");
      if(brand&&brand!=="windtre")miss.push("Turista: consentiti solo WindTre e Marginalità");
    }
    return miss;
  })();

  // stati VERI anche per le tappe finali (revamp 03/08): Prodotti = qualcosa
  // in carrello/selezione, Allegati = almeno un file, Attribuzione = completa,
  // Note = facoltativa (fatta solo se scritta)
  const gSS=i=>{
    if(i===0)return brand?"done":"active";
    if(i===1)return !brand?"pending":tipoCliente?"done":"active";
    if(i===2)return !tipoCliente?"pending":showAna?"done":"active";
    if(!showAna)return "pending";
    if(i===3)return (showStep4&&tCI>0)?"done":"active";
    if(i===4)return attachments.length>0?"done":"active";
    if(i===5)return (selVend&&selNeg&&dataVendita)?"done":"active";
    return notaScelta?"done":"active";
  };

  // #124: il popup di conferma reset è condiviso da form E carrello (il carrello
  // fa un return anticipato, quindi il modal inline nel form non lo raggiunge).
  const confirmResetModal = confirmReset && (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)setConfirmReset(false)}}>
      <div style={{background:"var(--tf-0e1526)",border:"1px solid var(--tf-w120)",borderRadius:16,padding:"28px 30px",width:"min(420px,92vw)",boxShadow:"0 18px 50px rgba(0,0,0,.55)",textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:10}}>⚠️</div>
        <div style={{fontSize:17,fontWeight:800,color:"var(--tf-f8fafc)",marginBottom:6}}>Reset del form</div>
        <div style={{fontSize:14,color:"var(--tf-8892b0)",marginBottom:22,lineHeight:1.5}}>Sei sicuro di voler procedere?<br/>Tutti i dati non salvati andranno persi.</div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={()=>setConfirmReset(false)} style={{padding:"11px 28px",borderRadius:10,border:"1px solid var(--tf-w100)",background:"var(--tf-w20)",color:"var(--tf-8892b0)",fontSize:14,fontWeight:700,cursor:"pointer"}}>No</button>
          <button onClick={fullReset} style={{padding:"11px 28px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#dc3545,#b02a37)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>Sì, resetta</button>
        </div>
      </div>
    </div>
  );

  // MOD-2b: conferma "nessuna opzione da collegare?" — condivisa da form e carrello
  // come confirmResetModal. Il sì rilancia addCart saltando il check (skipOpz=true)
  // e riesegue la navigazione "after" salvata all'apertura del popup.
  const confirmNoOpzModal = confirmNoOpz && (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)setConfirmNoOpz(null)}}>
      <div style={{background:"var(--tf-0e1526)",border:"1px solid var(--tf-w120)",borderRadius:16,padding:"28px 30px",width:"min(460px,92vw)",boxShadow:"0 18px 50px rgba(0,0,0,.55)",textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:10}}>🧩</div>
        <div style={{fontSize:17,fontWeight:800,color:"var(--tf-f8fafc)",marginBottom:6}}>Nessuna opzione da collegare?</div>
        <div style={{fontSize:14,color:"var(--tf-8892b0)",marginBottom:14,lineHeight:1.5}}>
          {(confirmNoOpz.offerte||[]).length>1?"Queste offerte hanno":"Questa offerta ha"} opzioni disponibili, ma non ne {(confirmNoOpz.offerte||[]).length>1?"hai collegata nessuna":"hai collegata nessuna"}:
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginBottom:20}}>
          {(confirmNoOpz.offerte||[]).map(n=><span key={n} style={{padding:"6px 12px",borderRadius:999,border:"1px solid var(--tf-w150)",background:"var(--tf-w30)",color:"var(--tf-c4b5fd)",fontSize:12,fontWeight:700}}>{n}</span>)}
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={()=>setConfirmNoOpz(null)} style={{padding:"11px 24px",borderRadius:10,border:"1px solid var(--tf-w100)",background:"var(--tf-w20)",color:"var(--tf-8892b0)",fontSize:14,fontWeight:700,cursor:"pointer"}}>No, torno a collegarle</button>
          <button onClick={()=>{const a=confirmNoOpz&&confirmNoOpz.after;setConfirmNoOpz(null);addCart(a,true);}} style={{padding:"11px 24px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#28a745,#1f8a3a)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>Sì, prosegui senza opzioni</button>
        </div>
      </div>
    </div>
  );

  // ═══════════ CART ═══════════
  if(showCart){
    const curI=colItems();const allG=[...cart];
    if(curI.length>0&&bObj)allG.push({brandId:brand,brandLabel:bObj.label,brandIcon:bObj.icon,brandColor:bObj.color,items:curI,isCurrent:true});
    const tp=allG.reduce((s,g)=>s+g.items.length,0)+margItems.length;
    const onlyMarg=allG.length===0&&margItems.length>0;
    const cartContent = (
      <div style={{fontFamily:"Inter,-apple-system,sans-serif",background:"transparent",minHeight:"100vh",padding:16,maxWidth:1100,margin:"0 auto"}}>
        {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"var(--tf-28a745)",color:"#fff",padding:"12px 28px",borderRadius:10,fontSize:14,fontWeight:700,boxShadow:"0 6px 20px rgba(0,0,0,.2)",zIndex:9999}}>{toast}</div>}
        <div className="cart-head" style={{background:"linear-gradient(135deg,#1e293b,#16213e,#0f3460)",borderRadius:16,padding:"24px 28px",marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div><div className="cart-ink" style={{color:"#fff",fontWeight:800,fontSize:22,marginBottom:4}}>🛒 Carrello</div><div style={{color:"var(--tf-w600)",fontSize:13}}>{onlyMarg?"Riepilogo vendite 💰":((tipoCliente==="privato"?(ana.nome+" "+ana.cognome):ana.ragioneSociale)+" - Riepilogo vendite 💰")}</div>
              {!onlyMarg&&(ana.cf||ana.cellulare||ana.email||ana.iban)&&<div style={{marginTop:4,display:"flex",gap:12,flexWrap:"wrap"}}>
                {ana.cf&&<span style={{fontSize:11,color:"var(--tf-w750)",fontFamily:"monospace"}}>🪪 {ana.cf}</span>}
                {ana.cellulare&&<span style={{fontSize:11,color:"var(--tf-w750)"}}>📱 {ana.cellulare}</span>}
                {ana.email&&<span style={{fontSize:11,color:"var(--tf-w750)"}}>✉️ {ana.email}</span>}
                {ana.iban&&<span style={{fontSize:11,color:"var(--tf-w750)",fontFamily:"monospace"}}>🏦 {ana.iban}</span>}
              </div>}
            </div>
            <div style={{display:"flex",gap:8}}>
              <div className="cart-stat" style={{background:"var(--tf-w150)",borderRadius:10,padding:"8px 16px",textAlign:"center"}}><div className="cart-ink" style={{color:"#fff",fontWeight:800,fontSize:22}}>{allG.length}</div><div style={{color:"var(--tf-w600)",fontSize:10}}>BRAND</div></div>
              <div className="cart-stat" style={{background:"var(--tf-w150)",borderRadius:10,padding:"8px 16px",textAlign:"center"}}><div className="cart-ink" style={{color:"#fff",fontWeight:800,fontSize:22}}>{tp}</div><div style={{color:"var(--tf-w600)",fontSize:10}}>PRODOTTI</div></div>
            </div>
          </div>
        </div>
        {!onlyMarg&&(allG.length===0?<div style={{background:"var(--tf-w20)",borderRadius:12,padding:40,textAlign:"center",color:"var(--tf-64748b)"}}><div style={{fontSize:40}}>🛒</div><div style={{fontSize:15,fontWeight:600,marginTop:10}}>Vuoto</div></div>:
          allG.map((g,gi)=>(
            <div key={gi} style={{background:"var(--tf-w20)",borderRadius:12,marginBottom:12,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
              <div style={{background:g.brandColor,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>{(()=>{const bd=BRANDS.find(x=>x.id===g.brandId||x.label===g.brandLabel);
                  // logo ORIGINALE su chip bianca (Luca 04/08): l'invert bianco
                  // sulla banda rossa Vodafone rendeva il logo invisibile
                  return bd&&bd.logo?<span style={{background:"#fff",borderRadius:8,padding:"3px 10px",display:"inline-flex",alignItems:"center"}}><Image src={bd.logo} alt={g.brandLabel} width={190} height={46} style={{height:32,width:"auto",maxWidth:150,objectFit:"contain"}}/></span>:<span style={{color:"#fff",fontWeight:700,fontSize:15}}>{g.brandIcon} {g.brandLabel}</span>;})()}<span style={{background:"var(--tf-w250)",borderRadius:12,padding:"2px 10px",color:"#fff",fontSize:11,fontWeight:600}}>{g.items.length}</span>{g.isCurrent&&<span style={{background:"var(--tf-ffd800)",borderRadius:12,padding:"2px 10px",color:"var(--tf-f8fafc)",fontSize:10,fontWeight:700}}>IN CORSO</span>}</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>g.isCurrent?setShowCart(false):editCG(gi)} style={{background:"var(--tf-w250)",border:"none",borderRadius:6,padding:"5px 14px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:700}}>✏️ Modifica</button>
                  {/* 🗑 elimina la vendita dal carrello (Luca 04/08) — la "in
                      corso" si azzera invece col Reset form in pagina */}
                  {!g.isCurrent&&<button onClick={()=>{if(window.confirm("Eliminare la vendita "+g.brandLabel+" ("+g.items.length+" prodotti) dal carrello?"))rmCG(gi);}} title={"Elimina la vendita "+g.brandLabel} style={{background:"rgba(220,53,69,0.25)",border:"1px solid rgba(255,255,255,0.35)",borderRadius:6,padding:"5px 12px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:700}}>🗑️</button>}
                  {!g.isCurrent&&<button onClick={()=>rmCG(gi)} style={{background:"rgba(255,0,0,.25)",border:"none",borderRadius:6,padding:"5px 14px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:600}}>✕ Rimuovi</button>}
                </div>
              </div>
              <div style={{padding:"6px 16px"}}>
                {g.items.map((it,ii)=><CartItem key={ii} it={it} ii={ii} gi={gi} total={g.items.length} expI={expI} setExpI={setExpI}/>)}              </div>
            </div>
          ))
        )}
        {margItems.length>0&&<div style={{background:"var(--tf-w20)",borderRadius:12,padding:16,marginBottom:12,marginTop:12,boxShadow:"0 2px 8px rgba(0,0,0,.06)",overflow:"hidden"}}>
          <div style={{background:"linear-gradient(135deg,#6f42c1,#9b59b6)",padding:"10px 16px",borderRadius:"8px 8px 0 0",margin:"-16px -16px 14px -16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>📦</span><span style={{color:"#fff",fontWeight:700,fontSize:14}}>Prodotti & Marginalità</span><span style={{background:"var(--tf-w250)",borderRadius:12,padding:"2px 10px",color:"#fff",fontSize:11,fontWeight:600}}>{margItems.length}</span>{(()=>{const ph=margItems.filter(i=>i.countsPhone).reduce((s,i)=>s+(i.qty||1),0);return ph>0?<span style={{background:"var(--tf-w250)",borderRadius:12,padding:"2px 10px",color:"#fff",fontSize:11,fontWeight:700}}>📱 {ph} telefon{ph===1?"o":"i"} vendut{ph===1?"o":"i"}</span>:null;})()}</div>
            <button onClick={()=>{setMargEditItem(null);setShowMargPOS(true)}} style={{background:"var(--tf-w200)",border:"none",borderRadius:6,padding:"5px 14px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:700}}>+ Aggiungi</button>
          </div>
          {margItems.map((item,idx)=>(
            <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid var(--tf-w30)"}}>
              <div>
                <span style={{fontWeight:700,fontSize:13}}>{item.product}</span>
                {item.model&&<span style={{fontSize:11,color:"var(--tf-64748b)",marginLeft:6}}>{item.model}</span>}
                <span style={{fontSize:11,color:"var(--tf-6f42c1)",marginLeft:8}}>x{item.qty||1}</span>
                {item.auto&&<span style={{fontSize:9,fontWeight:800,color:"var(--tf-6f42c1)",border:"1px solid rgba(111,66,193,.4)",borderRadius:5,padding:"1px 6px",marginLeft:8}}>AUTO · {item.autoFrom}</span>}
                {item.priceLocked?<span style={{fontSize:10,fontWeight:800,color:"var(--tf-17a2b8)",marginLeft:8}}>listino € {Number(item.importo||0).toFixed(2)}{(item.totalMargin!=null||item.margin!=null)?<span style={{color:"var(--tf-28a745)"}}> → margine € {Number(item.totalMargin??item.margin).toFixed(2)}</span>:null}</span>:(item.auto||item.priceRequired||item.linked)?null:(item.importo!=null&&<span style={{fontSize:11,color:"var(--tf-28a745)",marginLeft:6,fontWeight:700}}>€ {Number(item.importo).toFixed(2)}</span>)}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {(item.auto||item.priceRequired||item.linked)&&!item.priceLocked&&<span style={{display:"flex",alignItems:"center",gap:4}}>
                  <input type="number" step="0.01" min="0" value={item.importo??""} placeholder="prezzo *"
                    onChange={e=>{const v=e.target.value===""?null:Number(e.target.value);setMargItems(p=>p.map((m,i)=>i===idx?{...m,importo:v}:m))}}
                    style={{width:92,padding:"6px 8px",borderRadius:7,fontSize:12,textAlign:"right",border:(item.importo==null||item.importo==="")?"2px solid #dc3545":"2px solid #28a745",background:"var(--tf-w40)",color:"var(--tf-f8fafc)"}}/>
                  <span style={{fontSize:11,color:"var(--tf-8892b0)"}}>€</span>
                </span>}
                {item.auto?<button onClick={()=>setMargItems(p=>p.filter((_,i)=>i!==idx))} title="Rimuovi" style={{padding:"4px 10px",borderRadius:6,border:"1px solid rgba(220,53,69,.5)",background:"rgba(220,53,69,0.1)",color:"var(--tf-dc3545)",fontSize:11,fontWeight:700,cursor:"pointer"}}>✕</button>
                :<span style={{display:"inline-flex",gap:6}}><button onClick={()=>{const it=margItems[idx];setMargItems(p=>p.filter((_,i)=>i!==idx));setMargEditItem(it);setShowCart(false);setShowMargPOS(true)}} style={{padding:"4px 12px",borderRadius:6,border:"1px solid #6f42c1",background:"rgba(111,66,193,0.12)",color:"var(--tf-6f42c1)",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>✏️ Modifica</button><button onClick={()=>{const it=margItems[idx];if(window.confirm("Eliminare \""+(it?.product||"voce")+"\" dal carrello?"))setMargItems(p=>p.filter((_,i)=>i!==idx));}} title="Elimina la voce" style={{padding:"4px 10px",borderRadius:6,border:"1px solid rgba(220,53,69,0.5)",background:"rgba(220,53,69,0.10)",color:"var(--tf-dc3545)",fontSize:11,fontWeight:700,cursor:"pointer"}}>🗑️</button></span>}
              </div>
            </div>
          ))}
        </div>}
        {/* riga riassunto UNICA (segnalazione 06/08): anche in solo-marginalità
            l'Attribuzione si modifica IN PAGINA (step Allegati del flusso marg,
            che esiste già) — il vecchio box editabile del carrello stonava
            graficamente col resto ed è stato allineato al riepilogo compatto */}
        <div style={{background:"var(--tf-w20)",border:"1px solid var(--tf-w60)",borderRadius:10,padding:"12px 16px",marginTop:12,marginBottom:10,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:"var(--tf-94a3b8)",fontWeight:700}}>📎 {attachments.length} allegat{attachments.length===1?"o":"i"}</span>
          <span style={{fontSize:12,color:"var(--tf-94a3b8)",fontWeight:700}}>🏪 {selVend||"—"} · {selNeg||"—"} · {dataVendita?dataVendita.split("-").reverse().join("/"):"—"}</span>
          <span style={{fontSize:12,color:"var(--tf-94a3b8)",fontWeight:700}}>📝 {notaScelta==="si"&&nota.trim()?"nota inserita":notaScelta?"nessuna nota":"scelta Sì/No da fare"}</span>
          <button onClick={()=>setShowCart(false)} style={{marginLeft:"auto",padding:"7px 14px",borderRadius:8,border:"1px solid var(--tf-w150)",background:"var(--tf-w40)",color:"var(--tf-cbd5e1)",fontSize:11,fontWeight:800,cursor:"pointer"}}>✏️ Modifica in pagina</button>
        </div>
        {dupCellCliente&&<div style={{marginTop:14,padding:"12px 16px",borderRadius:10,background:"rgba(245,158,11,0.10)",border:"1px solid rgba(245,158,11,0.45)"}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--tf-fbbf24)",marginBottom:8}}>📱 Questo cellulare è già associato a “{dupCellCliente.label}”, un&apos;anagrafica dello STESSO tipo — lo stesso numero può stare solo su una consumer e una business insieme.</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>{spostaCellRef.current=true;setDupCellCliente(null);finalSubmit();}} style={{padding:"8px 14px",borderRadius:8,border:"1px solid rgba(245,158,11,0.6)",background:"rgba(245,158,11,0.18)",color:"var(--tf-fbbf24)",fontSize:12,fontWeight:800,cursor:"pointer"}}>Sposta il numero su questo cliente</button>
            <button onClick={()=>setDupCellCliente(null)} style={{padding:"8px 14px",borderRadius:8,border:"1px solid var(--tf-w150)",background:"var(--tf-w50)",color:"var(--tf-cbd5e1)",fontSize:12,fontWeight:700,cursor:"pointer"}}>Inserisco un altro numero</button>
          </div>
        </div>}
        <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
          <button onClick={()=>setShowCart(false)} style={{padding:"12px 24px",borderRadius:10,border:"1px solid var(--tf-w100)",background:"var(--tf-w20)",color:"var(--tf-8892b0)",fontSize:13,fontWeight:600,cursor:"pointer"}}>← Torna</button>
          {/* #124: reset TOTALE del form disponibile anche nel carrello */}
          <button onClick={()=>setConfirmReset(true)} style={{padding:"12px 24px",borderRadius:10,border:"2px solid #dc3545",background:"var(--tf-w20)",color:"var(--tf-dc3545)",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>🗑️ Reset form</button>
          {!onlyMarg&&<button onClick={()=>{const nav=()=>{setBrand(null);setShowCart(false);};if(brand&&colItems().length>0){addCart(nav);}else{nav();}}} style={{padding:"12px 24px",borderRadius:10,border:"2px solid #6f42c1",background:"rgba(111,66,193,0.12)",color:"var(--tf-6f42c1)",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Altro brand</button>}
          {onlyMarg&&<button onClick={()=>setShowMargSave(true)} style={{padding:"12px 36px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#6f42c1,#9b59b6)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",marginLeft:"auto"}}>💾 Salva Marginalità ({margItems.length})</button>}
          {!onlyMarg&&(()=>{const _m=mancanzeVendita();const _ok=tp>0&&!submitting&&_m.length===0;
            // col gate non superato il bottone RESTA cliccabile (Luca 04/08):
            // il click chiude il riepilogo e porta dritto allo step mancante
            // (lo fa la guardia dentro finalSubmit, col toast di cosa manca)
            return <button onClick={finalSubmit} disabled={tp===0||submitting}
            title={_m.length?"Portami allo step mancante — completa: "+_m.join(" · "):""}
            style={{padding:"12px 36px",borderRadius:10,border:_m.length&&tp>0?"1.5px solid rgba(245,158,11,0.7)":"none",background:_ok?"linear-gradient(135deg,#28a745,#20c997)":(_m.length&&tp>0?"rgba(245,158,11,0.15)":"var(--tf-w100)"),color:_m.length&&tp>0?"var(--tf-fbbf24)":"#fff",fontSize:14,fontWeight:800,cursor:(tp>0&&!submitting)?"pointer":"not-allowed",marginLeft:"auto"}}>{submitting?"⏳ Salvataggio in corso…":_m.length?"🔒 Completa gli step per salvare →":`💾 Salva contratto (${tp})`}</button>;})()}
        </div>
        {showMargSave&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
          <div style={{background:"var(--tf-w20)",borderRadius:16,width:"100%",maxWidth:480,padding:24,boxShadow:"0 8px 40px rgba(0,0,0,.25)",margin:"0 16px",maxHeight:"88vh",overflowY:"auto"}}>
            <div style={{fontWeight:800,fontSize:17,color:"var(--tf-f8fafc)",marginBottom:4}}>💾 Salva Vendita Prodotti</div>
            <div style={{fontSize:12,color:"var(--tf-64748b)",marginBottom:16}}>Riepilogo: {margItems.length} prodott{margItems.length===1?"o":"i"} registrat{margItems.length===1?"o":"i"}</div>
            <div style={{background:"rgba(111,66,193,0.12)",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
              {margItems.map((item,idx)=>(
                <div key={idx} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0",borderBottom:"1px solid rgba(111,66,193,0.12)"}}>
                  <span style={{fontWeight:600}}>{item.product} x{item.qty||1}{item.importo!=null?` — €${Number(item.importo).toFixed(2)}`:""}</span>
                  {item.model&&<span style={{color:"var(--tf-64748b)"}}>{item.model}</span>}
                </div>
              ))}
            </div>
            {/* MOD-44c: i dati cliente vivono nello STEP CLIENTE — qui solo il
                riepilogo; per modificarli si torna allo step 2 */}
            {margSkipCli?(
              <div style={{marginBottom:14,padding:"10px 14px",borderRadius:10,border:"1px dashed rgba(245,158,11,0.6)",background:"rgba(245,158,11,0.10)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"var(--tf-fbbf24)"}}>🚫 Vendita senza dati cliente</div>
                  <div style={{fontSize:11,color:"var(--tf-8892b0)"}}>Skip scelto nello step Cliente — viene registrato sulla vendita</div>
                </div>
                <button onClick={()=>{setShowMargSave(false);setVistaStep("cliente");}} style={{padding:"5px 10px",borderRadius:8,border:"1px solid var(--tf-w150)",background:"var(--tf-w40)",color:"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>👤 Aggiungi dati</button>
              </div>
            ):(margCliSel?(
              <div style={{marginBottom:14,padding:"10px 14px",borderRadius:10,border:"2px solid #28a745",background:"rgba(40,167,69,0.10)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"var(--tf-e2e8f0)"}}>✓ {margCliLabel(margCliSel)}</div>
                  <div style={{fontSize:11,color:"var(--tf-8892b0)"}}>{[margCliSel.cf_piva,margCliSel.cellulare].filter(Boolean).join(" • ")||"anagrafica esistente"}</div>
                </div>
                <button onClick={()=>setMargCliSel(null)} style={{padding:"5px 10px",borderRadius:8,border:"1px solid var(--tf-w150)",background:"var(--tf-w40)",color:"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>✕ cambia</button>
              </div>
            ):((()=>{
              // riepilogo dei dati compilati nello STEP CLIENTE (MOD-44c)
              const f=_anaComeForm();
              const nomeCli=(f.ragioneSociale||`${f.nome} ${f.cognome}`.trim()||f.cf||"").trim();
              const sub=[f.cf,f.tel].filter(Boolean).join(" • ");
              return nomeCli?(
                <div style={{marginBottom:14,padding:"10px 14px",borderRadius:10,border:"2px solid #28a745",background:"rgba(40,167,69,0.10)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:800,color:"var(--tf-e2e8f0)"}}>✓ {nomeCli}</div>
                    <div style={{fontSize:11,color:"var(--tf-8892b0)"}}>{sub||"dati dallo step Cliente"}</div>
                  </div>
                  <button onClick={()=>{setShowMargSave(false);setVistaStep("cliente");setShowAna(true);}} style={{padding:"5px 10px",borderRadius:8,border:"1px solid var(--tf-w150)",background:"var(--tf-w40)",color:"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>✏️ Modifica</button>
                </div>
              ):(
                <div style={{marginBottom:14,padding:"10px 14px",borderRadius:10,border:"1px dashed rgba(245,158,11,0.6)",background:"rgba(245,158,11,0.10)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:800,color:"var(--tf-fbbf24)"}}>⚠️ Nessun dato cliente</div>
                    <div style={{fontSize:11,color:"var(--tf-8892b0)"}}>Compila lo step Cliente (basta anche solo nome, cognome o CF) o salta da lì</div>
                  </div>
                  <button onClick={()=>{setShowMargSave(false);setVistaStep("cliente");setShowAna(true);}} style={{padding:"5px 10px",borderRadius:8,border:"1px solid var(--tf-w150)",background:"var(--tf-w40)",color:"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>👤 Compila</button>
                </div>
              );
            })()))}
            <div style={{display:"flex",gap:10,marginTop:4}}>
              <button onClick={chiudiMargSave} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1px solid var(--tf-w100)",background:"var(--tf-w20)",color:"var(--tf-8892b0)",fontSize:13,fontWeight:700,cursor:"pointer"}}>← Annulla</button>
              <button onClick={saveMargOnly} disabled={margSaving} style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:"linear-gradient(135deg,#28a745,#218838)",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>{margSaving?"Salvataggio...":"✅ Salva vendita"}</button>
            </div>
          </div>
        </div>}
        {/* #124: popup di conferma reset anche dentro il carrello */}
        {confirmResetModal}{confirmNoOpzModal}
      </div>
    );
    return cartContent;
  }

  // ═══════════ FORM ═══════════
  const formContent = (
    <div className="crmShell" style={{fontFamily:"Inter,-apple-system,sans-serif",background:"transparent",minHeight:"100vh",padding:0}}>
      {/* ═══════════════════════════════════════════════════════════════════
          RIEPILOGO VENDITE — SIDEBAR DESKTOP
          Per gli SVILUPPATORI: questa sidebar (className "crmSidebar") è
          NASCOSTA di default (display:none) e viene MOSTRATA AUTOMATICAMENTE
          su schermi desktop ≥1600px tramite la media query qui sotto, che
          aggiunge anche margin-right al form (.crmShell) per fare spazio.
          → Su monitor da negozio (1920×1080) il riepilogo vendite live appare
            sempre a destra. Su schermi piccoli/anteprima resta nascosto.
          Nessuna configurazione extra richiesta lato sviluppatore.
      ═══════════════════════════════════════════════════════════════════ */}
      <style>{`@media(min-width:1100px){.crmSidebar{display:flex!important;width:clamp(320px,24vw,480px)!important}.crmShell{margin-right:calc(clamp(320px,24vw,480px) + 26px)!important}}
.rvLab{font-size:11.5px;font-weight:800;color:#8892b0;letter-spacing:.8px;text-transform:uppercase;margin-bottom:5px}
.rvIn{width:100%;padding:11px 13px;border-radius:10px;font-size:14.5px;box-sizing:border-box;background:var(--tf-w40);border:1px solid var(--tf-w120);color:#f8fafc;outline:none;transition:border-color .15s,box-shadow .15s,background .15s}
.rvIn:focus{border-color:rgba(129,140,248,.75);box-shadow:0 0 0 3px rgba(99,102,241,.15);background:rgba(99,102,241,.06)}
.rvIn::placeholder{color:#586174}
select.rvIn{cursor:pointer}
.rvMenu{position:absolute;z-index:200;left:0;right:0;top:100%;margin-top:4px;background:#161a2c;border:1px solid var(--tf-w150);border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.65);max-height:280px;overflow-y:auto}
.rvOpt{padding:10px 14px;font-size:14px;cursor:pointer;color:#f8fafc}
.rvOpt:hover{background:rgba(99,102,241,.18)}
.rvGrp{padding:6px 12px;font-size:11px;font-weight:800;letter-spacing:.6px;color:#94a3b8;background:#1b2030;text-transform:uppercase;position:sticky;top:0}
.crmFab{position:fixed;bottom:18px;right:18px;z-index:4300;display:flex;align-items:center;gap:8px;padding:13px 18px;border-radius:999px;border:none;cursor:pointer;color:#fff;font-size:14px;font-weight:800;box-shadow:0 10px 30px rgba(0,0,0,.45)}
@media(min-width:1100px){.crmFab{display:none}}`}</style>
      {/* SIDEBAR CARRELLO LIVE (desktop) + DRAWER su richiesta (ogni schermo) */}
      {drawerCarrello&&<div onClick={()=>setDrawerCarrello(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",backdropFilter:"blur(2px)",zIndex:4400}}/>}
      {/* stessa pelle delle card del CRM (glass-panel): niente piu' grigio
          fuori tema, e sul tema chiaro diventa bianca come tutto il resto */}
      <div className="crmSidebar glass-panel" style={{display:drawerCarrello?"flex":"none",position:"fixed",top:drawerCarrello?0:96,right:drawerCarrello?0:16,width:drawerCarrello?"min(380px,94vw)":undefined,height:drawerCarrello?"100vh":undefined,maxHeight:drawerCarrello?"100vh":"calc(100vh - 112px)",overflowY:"auto",overscrollBehavior:"contain",flexDirection:"column",background:drawerCarrello?"var(--tf-12141f)":undefined,borderRadius:drawerCarrello?0:undefined,boxShadow:"0 8px 30px rgba(0,0,0,.35)",zIndex:drawerCarrello?4500:30}}>
        <div className="cart-head" style={{background:bG,borderRadius:drawerCarrello?0:"15px 15px 0 0",padding:"16px 18px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="cart-ink" style={{color:"#fff",fontWeight:800,fontSize:16}}>🛒 Riepilogo vendite</div>
            {drawerCarrello&&<button className="cart-x" onClick={()=>setDrawerCarrello(false)} style={{background:"var(--tf-w150)",border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:800,padding:"4px 10px",cursor:"pointer"}}>✕</button>}
          </div>
          <div style={{color:"var(--tf-w600)",fontSize:11,marginTop:2}}>{(tipoCliente==="privato"?(ana.nome+" "+ana.cognome).trim():ana.ragioneSociale)||"In compilazione"}</div>
          {/* dati chiave del cliente SOTTO il nome (Luca 03/08): solo se compilati nello Step 3 */}
          {(ana.cf||ana.cellulare||ana.email||ana.iban)&&<div style={{marginTop:7,display:"flex",flexDirection:"column",gap:3}}>
            {ana.cf&&<div style={{fontSize:10.5,color:"var(--tf-w800)",fontFamily:"monospace",letterSpacing:.5}}>🪪 {ana.cf}</div>}
            {ana.cellulare&&<div style={{fontSize:10.5,color:"var(--tf-w800)"}}>📱 {ana.cellulare}</div>}
            {ana.email&&<div style={{fontSize:10.5,color:"var(--tf-w800)"}}>✉️ {ana.email}</div>}
            {ana.iban&&<div style={{fontSize:10.5,color:"var(--tf-w800)",fontFamily:"monospace",letterSpacing:.5}}>🏦 {ana.iban}</div>}
          </div>}
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <div className="cart-stat" style={{flex:1,background:"var(--tf-w120)",borderRadius:8,padding:"6px 0",textAlign:"center"}}><div className="cart-ink" style={{color:"#fff",fontWeight:800,fontSize:18}}>{cart.length+(colItems().length>0?1:0)}</div><div style={{color:"var(--tf-w600)",fontSize:9}}>BRAND</div></div>
            <div className="cart-stat" style={{flex:1,background:"var(--tf-w120)",borderRadius:8,padding:"6px 0",textAlign:"center"}}><div className="cart-ink" style={{color:"#fff",fontWeight:800,fontSize:18}}>{tCI}</div><div style={{color:"var(--tf-w600)",fontSize:9}}>PRODOTTI</div></div>
            <div className="cart-stat" style={{flex:1,background:"var(--tf-w120)",borderRadius:8,padding:"6px 0",textAlign:"center"}}><div className="cart-ink" style={{color:"#fff",fontWeight:800,fontSize:18}}>{margItems.length}</div><div style={{color:"var(--tf-w600)",fontSize:9}}>P&M</div></div>
          </div>
          {/* il contatore piu' bello: i SOLDONI del carrello (Luca 03/08) */}
          {(()=>{
            // MARGINE, non prezzo (Luca 06/08): per i telefoni a listino conta
            // il MARGINE generato (4%), non il costo del telefono — il valore
            // del carrello e' quello che ci portiamo a casa
            // VALORE CARRELLO (fix Luca 07/08, bundle 2°/3° "×10"): totalMargin
            // e importo sono GIÀ totali (unità × qtà) — moltiplicare ancora per
            // la quantità elevava al quadrato (3 bundle → ×9). Solo il margin
            // unitario va moltiplicato per la qtà.
            const contrib=(m)=>{if(m.totalMargin!=null)return Number(m.totalMargin);const q=Number(m.qty)||1;if(m.margin!=null)return Number(m.margin)*q;return Number(m.importo)||0;};
            const val=margItems.reduce((t,m)=>t+contrib(m),0);
            const tel=margItems.filter(m=>m.priceLocked&&(m.totalMargin!=null||m.margin!=null));
            const telListino=tel.reduce((t,m)=>t+(Number(m.importo)||0)*(Number(m.qty)||1),0);
            return (
            <div className="cart-val" style={{marginTop:8,background:"var(--tf-w160)",border:"1px solid var(--tf-w250)",borderRadius:10,padding:"9px 14px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{color:"var(--tf-w750)",fontSize:11,fontWeight:800,letterSpacing:.6}}>💰 VALORE CARRELLO (margine)</span>
                <span className="cart-valv" style={{color:"#fff",fontWeight:900,fontSize:21}}>€ {val.toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
              </div>
              {tel.length>0&&<div style={{fontSize:10,color:"var(--tf-w600)",fontWeight:700,marginTop:2,textAlign:"right"}}>telefoni a listino € {telListino.toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2})} → il margine è nel valore</div>}
            </div>);})()}
        </div>
        <div style={{padding:14,flex:1}}>
          {[...cart,...(colItems().length>0&&bObj?[{brandLabel:bObj.label,brandIcon:bObj.icon,brandColor:bObj.color,items:colItems(),isCurrent:true}]:[])].length===0&&margItems.length===0?(
            <div style={{textAlign:"center",color:"var(--tf-64748b)",padding:"30px 10px"}}><div style={{fontSize:34}}>📭</div><div style={{fontSize:12,marginTop:6}}>Nessuna vendita</div></div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[...cart,...(colItems().length>0&&bObj?[{brandLabel:bObj.label,brandIcon:bObj.icon,brandColor:bObj.color,items:colItems(),isCurrent:true}]:[])].map((g,gi)=>(
                <div key={gi} onClick={()=>setExpR(p=>({...p,["g"+gi]:!p["g"+gi]}))} style={{border:"1px solid var(--tf-w60)",borderLeft:"4px solid "+(g.brandColor||"var(--tf-64748b)"),borderRadius:8,padding:"8px 10px",cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{display:"flex",alignItems:"center",gap:6}}>{(()=>{const bd=BRANDS.find(x=>x.id===g.brandId||x.label===g.brandLabel);return bd&&bd.logo?<Image src={bd.logo} alt={g.brandLabel} width={130} height={32} style={{height:27,width:"auto",maxWidth:125,objectFit:"contain"}}/>:<span style={{fontSize:12,fontWeight:800,color:"var(--tf-f8fafc)"}}>{g.brandIcon} {g.brandLabel}</span>;})()}{g.isCurrent?<span style={{color:"var(--tf-ffd800)",fontWeight:900}}>•</span>:null}</div><div style={{fontSize:11,fontWeight:700,color:g.brandColor||"var(--tf-64748b)"}}>{g.items.length} {expR["g"+gi]?"▾":"▸"}</div></div>
                  {!expR["g"+gi]&&<div style={{fontSize:10,color:"var(--tf-64748b)",marginTop:2}}>{g.items.map(it=>it.sub).join(", ")}</div>}
                  {expR["g"+gi]&&<div style={{marginTop:6,display:"flex",flexDirection:"column",gap:4}}>
                    {g.items.map((it,ii)=>{const det=it.details||{};const off=det["Offerta Mobile"]||det.offerta||det["Offerta"]||"";return (
                      <div key={ii} style={{background:"var(--tf-w30)",borderRadius:6,padding:"5px 8px"}}>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--tf-e2e8f0)"}}>{it.macroIcon} {it.sub}<span style={{color:"var(--tf-64748b)",fontWeight:600}}> · vendita {it.saleNum}</span></div>
                        {off&&<div style={{fontSize:10,color:"var(--tf-8892b0)",marginTop:1}}>{String(off)}</div>}
                      </div>);})}
                  </div>}
                </div>
              ))}
              {margItems.length>0&&<div onClick={()=>setExpR(p=>({...p,marg:(p.marg??true)?false:true}))} style={{border:"1px solid var(--tf-w60)",borderLeft:"4px solid #6f42c1",borderRadius:8,padding:"8px 10px",cursor:"pointer"}}>
                <div style={{display:"flex",justifyContent:"space-between"}}><div style={{fontSize:12,fontWeight:800,color:"var(--tf-6f42c1)"}}>📦 Prodotti & Marginalità</div><div style={{fontSize:11,fontWeight:700,color:"var(--tf-6f42c1)"}}>{margItems.length} {(expR.marg??true)?"▾":"▸"}</div></div>
                {(expR.marg??true)&&<div style={{marginTop:6,display:"flex",flexDirection:"column",gap:4}}>
                  {margItems.map((m,mi)=>(
                    <div key={mi} style={{background:"var(--tf-w30)",borderRadius:6,padding:"5px 8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--tf-e2e8f0)"}}>{m.product}{m.model&&<span style={{color:"var(--tf-94a3b8)",fontWeight:700}}> · {m.model}</span>}<span style={{color:"var(--tf-64748b)",fontWeight:600}}> x{m.qty||1}</span>{m.auto&&<span style={{fontSize:8,fontWeight:800,color:"var(--tf-6f42c1)",border:"1px solid rgba(111,66,193,.4)",borderRadius:4,padding:"0 4px",marginLeft:5}}>AUTO</span>}</div>
                      {m.priceLocked?<div style={{fontSize:10,fontWeight:700,color:"var(--tf-17a2b8)",whiteSpace:"nowrap"}}>€ {Number(m.importo||0).toFixed(2)}{(m.totalMargin!=null||m.margin!=null)?<span style={{color:"var(--tf-28a745)"}}> → marg. € {Number(m.totalMargin??m.margin).toFixed(2)}</span>:null}</div>
                      :(m.auto||m.priceRequired||m.linked)?<span onClick={e=>e.stopPropagation()} style={{display:"flex",alignItems:"center",gap:3}}>
                        <input type="number" step="0.01" min="0" value={m.importo??""} placeholder="prezzo *"
                          onChange={e=>{const v=e.target.value===""?null:Number(e.target.value);setMargItems(p=>p.map((x,i)=>i===mi?{...x,importo:v}:x))}}
                          style={{width:74,padding:"4px 6px",borderRadius:6,fontSize:11,textAlign:"right",border:(m.importo==null||m.importo==="")?"2px solid #dc3545":"2px solid #28a745",background:"var(--tf-w50)",color:"var(--tf-f8fafc)"}}/>
                        <span style={{fontSize:10,color:"var(--tf-8892b0)"}}>€</span>
                      </span>
                      :<div style={{fontSize:10,fontWeight:700,color:m.importo!=null?"var(--tf-28a745)":"var(--tf-dc3545)"}}>{m.importo!=null?("€ "+Number(m.importo).toFixed(2)):"prezzo da inserire"}</div>}
                      {/* 🗑 riga per errore (Luca 10/08 via Verifiche) — le AUTO no: derivano dalla vendita brand */}
                      {!m.auto&&<button onClick={e=>{e.stopPropagation();setMargItems(p=>p.filter((_,i)=>i!==mi));}} title="Elimina questa riga dal carrello"
                        style={{marginLeft:4,background:"none",border:"none",color:"var(--tf-dc3545)",cursor:"pointer",fontSize:13,lineHeight:1,padding:"2px 2px",flexShrink:0}}>🗑</button>}
                    </div>
                  ))}
                </div>}
              </div>}
            </div>
          )}
        </div>
        <div style={{padding:14,borderTop:"1px solid var(--tf-w60)"}}>
          <button onClick={()=>setShowCart(true)} style={{width:"100%",padding:"11px 0",borderRadius:10,border:"none",background:bG,color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>🛒 Riepilogo carrello →</button>
        </div>
      </div>
      {!drawerCarrello&&<button className="crmFab" onClick={()=>setDrawerCarrello(true)} title="Apri il riepilogo vendite" style={{background:bG}}>🛒{tCI>0&&<span style={{background:"var(--tf-ffd800)",color:"#111",borderRadius:10,padding:"1px 9px",fontSize:12,fontWeight:900}}>{tCI}</span>}</button>}
      {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"var(--tf-28a745)",color:"#fff",padding:"12px 28px",borderRadius:10,fontSize:14,fontWeight:700,boxShadow:"0 6px 20px rgba(0,0,0,.2)",zIndex:9999}}>{toast}</div>}
      {/* POPUP MATCH APPUNTAMENTO (Luca 08/08): centrale, decisione esplicita —
          "Sì, associa" grande, "No" piccolo a destra (stile "Più tardi"). */}
      {matchPending&&createPortal(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",zIndex:12000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(4px)"}}>
          <div style={{background:"var(--tf-0e1526)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:16,maxWidth:480,width:"100%",padding:24,boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
            <div style={{fontSize:40,textAlign:"center",marginBottom:8}}>📞</div>
            <div style={{fontSize:18,fontWeight:800,color:"var(--tf-f8fafc)",textAlign:"center",marginBottom:10}}>Appuntamento del call center</div>
            <div style={{fontSize:14,lineHeight:1.55,color:"var(--tf-cbd5e1)",textAlign:"center",marginBottom:20}}>
              Questo cliente aveva un appuntamento preso da <b style={{color:"#fff"}}>{matchPending.app.created_by||"un caller"}</b>
              {matchPending.app.date?<> per il <b style={{color:"#fff"}}>{matchPending.app.date}</b></>:null}
              {matchPending.app.store?<> ({matchPending.app.store})</>:null}.<br/>
              Vuoi <b style={{color:"var(--tf-a5b4fc)"}}>associare questa vendita</b> all&apos;appuntamento? Risulterà <b>attivato</b> e la cooperation andrà al caller.
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <button onClick={()=>confermaMatch(true)} disabled={matchBusy} style={{flex:1,padding:"13px 0",borderRadius:12,border:"none",background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",opacity:matchBusy?0.6:1}}>{matchBusy?"Associo…":"✓ Sì, associa"}</button>
              <button onClick={()=>confermaMatch(false)} disabled={matchBusy} style={{padding:"13px 16px",borderRadius:12,border:"none",background:"transparent",color:"var(--tf-8892b0)",fontSize:13,fontWeight:600,cursor:"pointer"}}>No</button>
            </div>
          </div>
        </div>, document.body)}
      {/* titolo in alto a sinistra + contenuto a tutta pagina, come Ricerca Vendite (Luca 03/08) */}
      <div style={{marginBottom:18}}>
        <h1 style={{fontSize:28,fontWeight:800,color:"var(--tf-f8fafc)",margin:0,letterSpacing:-0.3}}>Registra Vendita</h1>
      </div>

      {/* BARRA STEP RICCA (Luca 03/08 sera): piu' alta, logo del brand scelto,
          👤/🏢 per il cliente (tipo+anagrafica FUSI: 50% col tipo, 100% con
          l'anagrafica), icone e barrette di avanzamento; la navigazione
          indietro/avanti passa SOLO da qui — niente piu' righe riassunto. */}
      {(()=>{
        const anagOk=tipoCliente==="business"?!!(ana.ragioneSociale||"").trim():!!((ana.nome||"").trim()&&(ana.cognome||"").trim());
        // MOD-44c: in marginalità lo step Cliente e' OBBLIGATORIO (dati minimi
        // o skip esplicito) — prodotti/allegati/note si sbloccano solo dopo
        const margCliOk=margMinOk||margSkipCli;
        const percCliente=(margFlow&&!brand)?(margCliOk?100:(tipoCliente?50:0)):(!tipoCliente?0:(anagOk?100:50));
        const cAtt=bObj?bC:"var(--tf-6366f1)";
        const STEPS=[
          {id:"brand",label:margFlow&&!brand?"Marginalità":"Brand",icona:(bObj&&bObj.logo)?<Image src={bObj.logo} alt={bObj.label} width={84} height={30} style={{height:26,width:"auto",maxWidth:82,objectFit:"contain"}}/>:<span style={{fontSize:20}}>{margFlow&&!brand?"📦":(bObj?bObj.icon:"⚡")}</span>,perc:(brand||margFlow)?100:0,abil:true},
          {id:"cliente",label:"Cliente",icona:<span style={{fontSize:23}}>{tipoCliente?(tipoCliente==="privato"?"👤":"🏢"):"🧑‍💼"}</span>,perc:percCliente,abil:!!brand||(margFlow&&!brand)},
          {id:"prodotti",label:"Prodotti",icona:<span style={{fontSize:23}}>🛒</span>,perc:margFlow&&!brand?(margItems.length>0?100:50):((showStep4&&tCI>0)?100:(showStep4?50:0)),abil:(margFlow&&!brand&&margCliOk)||!!(showAna&&showStep4)},
          {id:"allegati",label:"Allegati",icona:<span style={{fontSize:23}}>📎</span>,perc:((((margFlow&&!brand)?true:(attachments.some(a=>a.type==="documento")&&righeCarrello().every(r=>r.contratto!=="obbligatorio"||attachments.some(a=>a.type==="contratti"&&(a.rowKey||"")===r.key))))?50:0))+((stepVisti.allegati&&selVend&&selNeg&&dataVendita)?50:0),abil:(margFlow&&!brand&&margCliOk)||!!(showAna&&showStep4)},
          // verde APPENA si flagga Sì o No (Luca 05/08): la scelta completa lo step
          {id:"note",label:"Note",icona:<span style={{fontSize:23}}>📝</span>,perc:notaScelta?100:0,abil:(margFlow&&!brand&&margCliOk)||!!(showAna&&showStep4),opz:true},
        ];
        const _doneCount=STEPS.filter(s=>s.perc>=100).length;
        const _railPct=Math.min(100,(_doneCount/(STEPS.length-1))*100);
        return (
          <div className="rvsteps">
            <div className="rvsteps-rail"><i style={{width:_railPct+"%"}}/></div>
            {STEPS.map(st=>{
              const attivo=vistaStep===st.id;
              const fatto=st.perc>=100;
              const ringC=fatto?"#22c55e":"#6d5cff";
              const sub=fatto?"Completo":attivo?"Sei qui":st.perc>0?st.perc+"%":st.opz?"Opzionale":st.abil?"Da fare":"Bloccato";
              return (
                <button key={st.id} type="button" disabled={!st.abil}
                  className={"rvnode-step"+(attivo?" is-active":"")+(fatto?" is-done":"")+(st.abil?"":" is-locked")}
                  onClick={()=>{if(st.abil)setVistaStep(st.id);}}
                  title={!st.abil?"Completa prima gli step precedenti":attivo?"Sei qui":"Vai a "+st.label}>
                  <span className="rvnode-ring" style={{background:`conic-gradient(${ringC} ${st.perc}%, var(--rv-track) 0)`}}>
                    <span className="rvnode">{st.icona}</span>
                    {fatto&&<span className="rvnode-check">✓</span>}
                  </span>
                  <span className="rvnode-lab">{st.label}</span>
                  <span className="rvnode-sub">{sub}</span>
                </button>
              );})}
          </div>
        );
      })()}



      {vistaStep==="brand"&&<div style={{background:"var(--tf-w20)",borderRadius:14,padding:20,marginBottom:12}}>
        <div style={{fontSize:12.5,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:14,textTransform:"uppercase"}}>Scegli il brand</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:14}}>
          {brandVisibili.map(b=><button key={b.id} onClick={()=>{if(!b.ready)return;if(!_brandEff(b).registra){sT("⛔ "+b.label+" è in sola consultazione per il tuo negozio: la registrazione non è abilitata (Amministrazione → Catalogo → Brand × Negozio).");return;}const cliPronto=tipoCliente&&(tipoCliente==="business"?!!(ana.ragioneSociale||"").trim():!!((ana.nome||"").trim()&&(ana.cognome||"").trim()));if(b.id===brand){setVistaStep(cliPronto?"prodotti":"cliente");return;}_pickBrand(b);setVistaStep(cliPronto?"prodotti":"cliente");}} title={b.label+(!_brandEff(b).registra?" — solo consultazione":"")} style={{padding:"26px 16px",borderRadius:14,border:b.id===brand?"2px solid "+b.color:"2px solid var(--tf-w60)",background:b.id===brand?b.color+"14":"var(--tf-w20)",cursor:b.ready?"pointer":"default",textAlign:"center",opacity:!b.ready?.6:(!_brandEff(b).registra?0.35:(turista&&b.id!=="windtre"?0.35:1)),position:"relative",overflow:"hidden",transition:"border-color .15s,background .15s"}} onMouseEnter={e=>{if(b.ready&&b.id!==brand){e.currentTarget.style.borderColor=b.color;e.currentTarget.style.background="var(--tf-w50)";}}} onMouseLeave={e=>{if(b.id!==brand){e.currentTarget.style.borderColor="var(--tf-w60)";e.currentTarget.style.background="var(--tf-w20)";}}}>
            {!b.ready&&<div style={{position:"absolute",top:0,left:0,right:0,bottom:0,background:"var(--tfx15_17_26_880)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:2}}><div style={{fontSize:22}}>🔧</div><div style={{fontSize:10,fontWeight:700,color:"var(--tf-64748b)"}}>Manutenzione</div></div>}
            {(()=>{const nBr=(cart.find(g=>g.brandId===b.id)?.items.length)||0;return nBr>0?<span style={{position:"absolute",top:8,right:8,background:b.color,color:"#fff",borderRadius:10,padding:"2px 10px",fontSize:12,fontWeight:800,zIndex:3}}>{nBr}</span>:null;})()}
            {/* SOLO il logo, grande (Luca 03/08). ZOOM PER-BRAND (Luca 07/08):
                i PNG hanno margini trasparenti molto diversi (WindTre/TIM/Kena
                ~60% di vuoto, Fastweb quasi pieno, Kipoint pieno) — le scale
                sono tarate sulle misure reali per rendere le scritte OMOGENEE.
                S4 e Dojo (i tondi) restano com'erano; Kipoint renderizza più
                basso perché il suo file è già tutto contenuto. */}
            {(()=>{const tondo=b.id==="energy"||b.id==="dojo";
              const ZOOM={windtre:2.0,tim:2.2,kena:2.2,fastweb:1.9,vodafone:1.7,sky:1.35,iliad:1.14,very:1.14,ho:1.14,kipoint:1};
              const z=ZOOM[b.id]??1.14;
              const hh=b.id==="kipoint"?58:(tondo?84:88);
              return(
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:88}}>{b.logo?<Image src={b.logo} alt={b.label} width={260} height={88} style={{height:hh,width:"auto",maxWidth:tondo?"92%":"98%",objectFit:"contain",transform:(tondo||z===1)?"none":"scale("+z+")",transformOrigin:"center"}}/>:<span style={{fontSize:52}}>{b.icon}</span>}</div>);})()}
          </button>)}
          {/* Segnalazione 68: "Prodotti & Marginalita'" non e' piu' una barra a tutta
              larghezza sotto la griglia, ma una casella della griglia accanto ai brand. */}
          <button onClick={()=>{
            // P&M = come cambiare brand (bug Luca 04/08: il brand restava
            // attivo e i gate margFlow&&!brand mostravano i SUOI prodotti).
            // Conferma se c'e' lavoro brand non in carrello; il CLIENTE resta.
            const _lavoro=Object.values(sales).some(r=>Array.isArray(r)&&r.some(row=>row&&Object.values(row).some(sub=>sub&&sub.active)));
            if(brand&&_lavoro&&cart.findIndex(g=>g.brandId===brand)<0&&!window.confirm("Hai una vendita in corso su questo brand non ancora nel carrello: passando a Prodotti & Marginalità la perdi.\n\nContinuare?"))return;
            setBrand(null);setSales({});setSesCode("");setShowStep4(false);setShowAna(false);setCambioBrand(false);
            setSkyS([{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:"",tvCodIns:"",fibraCodIns:"",mobCodIns:""}]);
            // MOD-44c (Luca 10/08): anche la marginalità passa dallo step
            // Cliente — niente salto diretto ai prodotti
            setMargFlow(true);setVistaStep("cliente");setStepVisti(pv=>({...pv,prodotti:true}));
          }} title="Prodotti & Marginalità" style={{padding:"26px 16px",borderRadius:14,border:margFlow?"2px solid #6f42c1":"2px dashed #6f42c1",background:"rgba(111,66,193,0.12)",cursor:"pointer",textAlign:"center",position:"relative",overflow:"hidden",boxShadow:margFlow?"0 0 0 3px rgba(111,66,193,0.25)":"none"}}>
            {margItems.length>0&&<span style={{position:"absolute",top:8,right:8,background:"var(--tf-6f42c1)",color:"#fff",borderRadius:10,padding:"2px 10px",fontSize:12,fontWeight:800}}>{margItems.length}</span>}
            {/* stesso simbolo della tessera Marginalità di Ricerca Vendite: 💰
                (correzione Luca 07/08 — avevo messo il Database del menu) */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:88}}><span style={{fontSize:52}}>💰</span></div>
            <div style={{fontWeight:800,fontSize:14,color:"var(--tf-6f42c1)",marginTop:6}}>Prodotti & Marginalità</div>
          </button>
        </div>
      </div>}


      {vistaStep==="cliente"&&(brand||(margFlow&&!brand))&&<div style={{background:"var(--tf-w20)",borderRadius:14,padding:18,marginBottom:12,borderLeft:"4px solid #6f42c1"}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--tf-6f42c1)",marginBottom:12,textTransform:"uppercase"}}>👥 Cliente — tipo e ricerca</div>
        {margFlow&&!brand&&<div style={{marginBottom:12,padding:"9px 12px",borderRadius:8,background:"rgba(111,66,193,0.10)",border:"1px dashed rgba(111,66,193,0.5)",fontSize:12,color:"var(--tf-a78bfa)",fontWeight:600}}>
          💰 Vendita a marginalità: bastano anche <b>solo nome</b>, <b>solo cognome</b> o <b>solo il CF</b>. Se il cliente non vuole lasciare nulla puoi saltare, ma la scelta viene registrata.
        </div>}
        <div style={{display:"flex",gap:12,marginBottom:tipoCliente?16:0}}>
          {(brand==="very"||brand==="ho"||brand==="kena"?["privato"]:["privato","business"]).map(t=><button key={t} onClick={()=>{setTipoCliente(t);setShowAna(false);setClienteFound(false);setLookupValue("");setSales({});setSkyS([{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:"",tvCodIns:"",fibraCodIns:"",mobCodIns:""}]);setShowStep4(false)}} style={{flex:1,padding:12,borderRadius:10,border:tipoCliente===t?"2px solid #6f42c1":"2px solid var(--tf-w60)",background:tipoCliente===t?"rgba(111,66,193,0.12)":"var(--tf-w40)",cursor:"pointer",textAlign:"center"}}><div style={{fontSize:22,marginBottom:2}}>{t==="privato"?"👤":"🏢"}</div><div style={{fontWeight:700,fontSize:14,color:tipoCliente===t?"var(--tf-6f42c1)":"var(--tf-f8fafc)"}}>{t==="privato"?"Privato":"Business"}</div></button>)}
        </div>
        {tipoCliente&&<div style={{background:"var(--tf-w30)",borderRadius:8,padding:14,position:"relative"}}>
          <div style={{fontSize:12,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:8}}>{tipoCliente==="privato"?"Codice Fiscale":"Partita IVA"}</div>
          <div style={{display:"flex",gap:8}}>
            <input placeholder={tipoCliente==="privato"?"RSSMRA80A01H501Z — o nome":"12345678901 — o ragione sociale"} value={lookupValue} onChange={e=>setLookupValue(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();doLookup();}}} style={{flex:1,minWidth:220,padding:"10px 12px",borderRadius:8,border:"1px solid var(--tf-w100)",fontSize:14,fontFamily:"monospace",letterSpacing:1.2}}/>
            <button onClick={doLookup} style={{padding:"10px 18px",borderRadius:8,border:"none",background:"var(--tf-6f42c1)",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>🔍 Cerca</button>
            <button onClick={skipLookup} title="Apri l'anagrafica e compila a mano — il Codice Fiscale resta comunque obbligatorio" style={{padding:"10px 16px",borderRadius:8,border:"1px solid var(--tf-w180)",background:"var(--tf-w40)",color:"var(--tf-cbd5e1)",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>✏️ Compila</button>
            {tipoCliente==="privato"&&(
              /* TURISTA qui, accanto a Compila (03/08): cliente di passaggio senza
                 CF italiano — attiva il flag e apre l'anagrafica; ricliccando si spegne */
              <button onClick={()=>{if(turista){setTurista(false);}else{setTurista(true);if(!showAna)skipLookup();}}}
                title="Cliente turista senza Codice Fiscale italiano: CF non richiesto, vendita limitata a WindTre privato (Mobile Wallet e CB) o Marginalità"
                style={{padding:"10px 16px",borderRadius:8,border:turista?"1px solid rgba(245,158,11,0.7)":"1px solid var(--tf-w180)",background:turista?"rgba(245,158,11,0.15)":"var(--tf-w40)",color:turista?"var(--tf-fbbf24)":"var(--tf-cbd5e1)",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                🌍 Turista{turista?" ✓":""}
              </button>
            )}
          </div>
          {(()=>{
            // CONTROLLO P.IVA (Luca 03/08): 11 cifre e basta — oltre, lo dico subito
            const num=(lookupValue||"").replace(/\s+/g,"");
            if(/^\d{12,}$/.test(num))return <div style={{marginTop:8,background:"rgba(220,38,38,0.12)",border:"1px solid rgba(220,38,38,0.35)",borderRadius:6,padding:"7px 12px",fontSize:12,color:"var(--tf-fca5a5)",fontWeight:700}}>⚠️ Una Partita IVA italiana ha 11 cifre — ne hai scritte {num.length}</div>;
            if(/^\d{11}$/.test(num))return <div style={{marginTop:8,background:"rgba(40,167,69,0.10)",borderRadius:6,padding:"6px 12px",fontSize:11,color:"var(--tf-28a745)",fontWeight:600}}>✓ P.IVA — 11 cifre</div>;
            return null;
          })()}
          {sugg.length>0&&(
            <div style={{marginTop:8,borderRadius:8,border:"1px solid var(--tf-w100)",background:"var(--tfx15_17_26_980)",overflow:"hidden"}}>
              <div style={{padding:"6px 12px",fontSize:10,fontWeight:700,color:"var(--tf-8892b0)",textTransform:"uppercase",letterSpacing:1,borderBottom:"1px solid var(--tf-w60)"}}>Clienti in visibilità</div>
              {sugg.map(r=>(
                <button key={r.id} onClick={()=>scegliSugg(r)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",padding:"9px 12px",background:"transparent",border:"none",borderBottom:"1px solid var(--tf-w40)",cursor:"pointer",color:"var(--tf-f8fafc)"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(111,66,193,0.14)";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                  <span style={{fontSize:15}}>{r.tipo==="business"?"🏢":"👤"}</span>
                  <span style={{fontSize:13,fontWeight:700}}>{r.tipo==="business"?(r.ragione_sociale||"—"):`${r.nome||""} ${r.cognome||""}`.trim()||"—"}</span>
                  <span style={{fontSize:11,color:r.cf_piva?"var(--tf-8892b0)":"var(--tf-f59e0b)",fontFamily:"monospace",fontWeight:r.cf_piva?400:700}}>{r.cf_piva||"senza CF — da inserire"}</span>
                  {r.cellulare&&<span style={{fontSize:11,color:"var(--tf-64748b)"}}>· {r.cellulare}</span>}
                  <span style={{marginLeft:"auto",fontSize:11,color:"var(--tf-6f42c1)",fontWeight:700}}>Usa →</span>
                </button>
              ))}
            </div>
          )}
          {lookupDone&&(clienteFound?<div style={{marginTop:10,background:"rgba(40,167,69,0.12)",borderRadius:6,padding:"8px 12px",fontSize:12,color:"var(--tf-28a745)"}}>✅ Cliente trovato in anagrafica</div>:<div style={{marginTop:10,background:"rgba(245,158,11,0.12)",borderRadius:6,padding:"8px 12px",fontSize:12,color:"var(--tf-f59e0b)"}}>⚠ Cliente non presente in anagrafica — compila i dati a mano (bastano nome, cognome e cellulare)</div>)}
          {apptAvviso&&<div style={{marginTop:8,background:"rgba(99,102,241,0.14)",border:"1px solid rgba(99,102,241,0.4)",borderRadius:6,padding:"8px 12px",fontSize:12,color:"var(--tf-a5b4fc)",fontWeight:600}}>📞 Questo cliente ha un appuntamento aperto preso da {apptAvviso.da}{apptAvviso.data?` (fissato per il ${apptAvviso.data})`:""}{apptAvviso.store?` · ${apptAvviso.store}`:""} — registrando la vendita l&apos;appuntamento verrà attivato e il merito assegnato al caller.</div>}
        </div>}
        {/* MOD-44c: navigazione dello step Cliente in MARGINALITÀ — avanti coi
            dati minimi oppure skip esplicito col popup (tracciato) */}
        {margFlow&&!brand&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14,paddingTop:12,borderTop:"1px solid var(--tf-w60)",gap:10,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={()=>setVistaStep("brand")} style={{padding:"9px 18px",borderRadius:8,border:"1px solid var(--tf-w140)",background:"var(--tf-w20)",color:"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>← Indietro</button>
            <button onClick={()=>setMargSkipPopup(true)} style={{padding:"9px 18px",borderRadius:8,border:"1px dashed rgba(245,158,11,0.6)",background:margSkipCli?"rgba(245,158,11,0.15)":"var(--tf-w20)",color:"var(--tf-fbbf24)",fontSize:12,fontWeight:700,cursor:"pointer"}}>🚫 Salta dati cliente{margSkipCli?" ✓":""}</button>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            {!margMinOk&&!margSkipCli&&<span style={{fontSize:11,fontWeight:600,color:"var(--tf-f59e0b)"}}>Inserisci almeno un dato (nome, cognome o CF) o salta</span>}
            <button disabled={!margMinOk&&!margSkipCli} onClick={()=>{if(margMinOk)setMargSkipCli(false);setVistaStep("prodotti");setStepVisti(pv=>({...pv,prodotti:true}));}} style={{padding:"9px 22px",borderRadius:8,border:"none",background:(!margMinOk&&!margSkipCli)?"var(--tf-w80)":"linear-gradient(135deg,#6f42c1,#59359c)",color:(!margMinOk&&!margSkipCli)?"var(--tf-64748b)":"#fff",fontSize:13,fontWeight:700,cursor:(!margMinOk&&!margSkipCli)?"not-allowed":"pointer"}}>Avanti → Prodotti</button>
          </div>
        </div>}
      </div>}
      {/* MOD-44c: popup CRM (non di Chrome) di conferma skip dati cliente */}
      {margSkipPopup&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:2100,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
        <div style={{background:"var(--tf-w20)",borderRadius:16,width:"100%",maxWidth:440,padding:24,boxShadow:"0 8px 40px rgba(0,0,0,.35)",margin:"0 16px"}}>
          <div style={{fontSize:34,textAlign:"center",marginBottom:8}}>⚠️</div>
          <div style={{fontWeight:800,fontSize:16,color:"var(--tf-f8fafc)",textAlign:"center",marginBottom:8}}>Vuoi davvero saltare i dati del cliente?</div>
          <div style={{fontSize:13,color:"var(--tf-cbd5e1)",lineHeight:1.5,marginBottom:6}}>Saltare i dati <b style={{color:"var(--tf-fbbf24)"}}>inciderà sul commissioning</b> in termini di bonus. I dati del cliente sono importanti per le attività di marketing e per lo storico: basta anche <b>solo il nome</b>, <b>solo il cognome</b> o <b>solo il CF</b>.</div>
          <div style={{fontSize:11.5,color:"var(--tf-8892b0)",marginBottom:16}}>Lo skip viene registrato sulla vendita con il nome del venditore.</div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setMargSkipPopup(false)} style={{flex:1.4,padding:"11px 0",borderRadius:10,border:"none",background:"linear-gradient(135deg,#28a745,#218838)",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>← Torna ai dati</button>
            <button onClick={()=>{setMargSkipCli(true);setMargSkipPopup(false);setVistaStep("prodotti");setStepVisti(pv=>({...pv,prodotti:true}));}} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1px solid rgba(220,53,69,0.6)",background:"rgba(220,53,69,0.12)",color:"var(--tf-f87171)",fontSize:13,fontWeight:800,cursor:"pointer"}}>Salta comunque</button>
          </div>
        </div>
      </div>}



      {vistaStep==="cliente"&&showAna&&<div style={{background:"var(--tf-w20)",borderRadius:14,padding:18,marginBottom:12,borderLeft:"4px solid #1B3A5C"}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--tf-8fb4dd)",marginBottom:14,textTransform:"uppercase"}}>📝 Anagrafica</div>
        {tipoCliente==="privato"?<><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 16px"}}><TF l="Nome" r v={ana.nome} o={v=>uA("nome",v)} p="Mario" pf={clienteFound}/><TF l="Cognome" r v={ana.cognome} o={v=>uA("cognome",v)} p="Rossi" pf={clienteFound}/>{!turista&&<TF l="Codice Fiscale" r v={ana.cf} o={v=>uA("cf",v.toUpperCase().replace(/\s+/g,""))} p="RSSMRA80A01H501Z" pf={clienteFound&&!!ana.cf}/>}<TF l="Cellulare" r v={ana.cellulare} o={v=>uA("cellulare",v)} p="333..." pf={clienteFound}/><TF l="Email" v={ana.email} o={v=>uA("email",v)} p="email" pf={clienteFound}/></div>{turista&&<p style={{marginTop:10,fontSize:12,fontWeight:700,color:"var(--tf-f59e0b)"}}>🌍 Cliente TURISTA — CF non richiesto (consentiti solo WindTre privato: Mobile Wallet e CB, oppure Marginalità)</p>}<div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--tf-w60)",display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:"10px 16px"}}><TFVia v={ana.via} o={v=>uA("via",v)} pf={clienteFound} onPick={s=>{uA("via",s.indirizzo);if(s.cap)uA("cap",s.cap);if(s.citta)uA("citta",s.citta);}}/><TF l="CAP" v={ana.cap} o={v=>uA("cap",v)} p="00100" pf={clienteFound}/><TF l="Città" v={ana.citta} o={v=>uA("citta",v)} p="Roma" pf={clienteFound}/></div><div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr",gap:"10px 16px"}}><TF l="IBAN" v={ana.iban} o={v=>uA("iban",v.toUpperCase())} p="IT60 X054 2811 1010 0000 0123 456" pf={clienteFound}/></div>
        <label style={{display:"flex",alignItems:"center",gap:8,marginTop:8,cursor:"pointer",fontSize:12,fontWeight:600,color:"var(--tf-8892b0)"}}>
          <input type="checkbox" checked={!!ana.intDiverso} onChange={e=>uA("intDiverso",e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
          Diverso intestatario
        </label>
        {ana.intDiverso&&<div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px 16px",background:"rgba(111,66,193,0.08)",border:"1px solid rgba(111,66,193,0.25)",borderRadius:8,padding:12}}>
          <TF l="Nome intestatario" r v={ana.intNome} o={v=>uA("intNome",v)} p="Mario"/>
          <TF l="Cognome intestatario" r v={ana.intCognome} o={v=>uA("intCognome",v)} p="Rossi"/>
          <TF l="Codice Fiscale intestatario" r v={ana.intCf} o={v=>uA("intCf",v.toUpperCase())} p="RSSMRA80A01H501Z"/>
        </div>}</>
        :<><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 16px"}}><TF l="Ragione Sociale" r v={ana.ragioneSociale} o={v=>uA("ragioneSociale",v)} p="Rossi Srl" pf={clienteFound}/><TF l="Partita IVA" r v={ana.cf} o={v=>uA("cf",v.toUpperCase().replace(/\s+/g,""))} p="12345678901" pf={clienteFound&&!!ana.cf}/><TF l="Nome Ref." r v={ana.nomeRef} o={v=>uA("nomeRef",v)} p="Mario" pf={clienteFound}/><TF l="Cognome Ref." r v={ana.cognomeRef} o={v=>uA("cognomeRef",v)} p="Rossi" pf={clienteFound}/><TF l="CF Ref." r v={ana.cfRef} o={v=>uA("cfRef",v.toUpperCase().replace(/\s+/g,""))} p="RSSMRA80A01H501B" pf={clienteFound&&!!ana.cfRef}/><TF l="Recapito" r v={ana.recapito} o={v=>uA("recapito",v)} p="333..." pf={clienteFound}/><TF l="Telefono Fisso" v={ana.fisso} o={v=>uA("fisso",v)} p="06..." pf={clienteFound}/><TF l="Email" v={ana.email} o={v=>uA("email",v)} p="info@" pf={clienteFound}/></div><div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--tf-w60)",display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:"10px 16px"}}><TFVia v={ana.via} o={v=>uA("via",v)} pf={clienteFound} onPick={s=>{uA("via",s.indirizzo);if(s.cap)uA("cap",s.cap);if(s.citta)uA("citta",s.citta);}}/><TF l="CAP" v={ana.cap} o={v=>uA("cap",v)} p="00100" pf={clienteFound}/><TF l="Città" v={ana.citta} o={v=>uA("citta",v)} p="Roma" pf={clienteFound}/></div><div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr",gap:"10px 16px"}}><TF l="IBAN" v={ana.iban} o={v=>uA("iban",v.toUpperCase())} p="IT60 X054 2811 1010 0000 0123 456" pf={clienteFound}/></div>
        <label style={{display:"flex",alignItems:"center",gap:8,marginTop:8,cursor:"pointer",fontSize:12,fontWeight:600,color:"var(--tf-8892b0)"}}>
          <input type="checkbox" checked={!!ana.intDiverso} onChange={e=>uA("intDiverso",e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
          Diverso intestatario
        </label>
        {ana.intDiverso&&<div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px 16px",background:"rgba(111,66,193,0.08)",border:"1px solid rgba(111,66,193,0.25)",borderRadius:8,padding:12}}>
          <TF l="Nome intestatario" r v={ana.intNome} o={v=>uA("intNome",v)} p="Mario"/>
          <TF l="Cognome intestatario" r v={ana.intCognome} o={v=>uA("intCognome",v)} p="Rossi"/>
          <TF l="Codice Fiscale intestatario" r v={ana.intCf} o={v=>uA("intCf",v.toUpperCase())} p="RSSMRA80A01H501Z"/>
        </div>}</>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14,paddingTop:12,borderTop:"1px solid var(--tf-w60)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>{setAna({nome:"",cognome:"",cellulare:"",email:"",via:"",cap:"",citta:"",iban:"",cf:"",ragioneSociale:"",nomeRef:"",cognomeRef:"",cfRef:"",recapito:"",fisso:"",intDiverso:false,intNome:"",intCognome:"",intCf:""});setLookupValue("");setClienteFound(false);setShowStep4(false)}} style={{padding:"9px 18px",borderRadius:8,border:"1px solid var(--tf-w140)",background:"var(--tf-w20)",color:"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>↺ Reset anagrafica</button>
            {/* #124: reset TOTALE del form disponibile anche allo step 3 (prima solo dallo step 4) */}
            <button onClick={()=>setConfirmReset(true)} style={{padding:"9px 18px",borderRadius:8,border:"2px solid #dc3545",background:"var(--tf-w20)",color:"var(--tf-dc3545)",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>🗑️ Reset form</button>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            {/* MOD-44c: in marginalità niente campi obbligatori — basta un dato */}
            {margFlow&&!brand
              ?<>
                {!margMinOk&&<span style={{fontSize:11,fontWeight:600,color:"var(--tf-f59e0b)"}}>Basta anche solo nome, cognome o CF</span>}
                <button disabled={!margMinOk} onClick={()=>{if(!margMinOk)return;setMargSkipCli(false);setVistaStep("prodotti");setStepVisti(pv=>({...pv,prodotti:true}));}} style={{padding:"9px 22px",borderRadius:8,border:"none",background:!margMinOk?"var(--tf-w80)":"linear-gradient(135deg,#6f42c1,#59359c)",color:!margMinOk?"var(--tf-64748b)":"#fff",fontSize:13,fontWeight:700,cursor:!margMinOk?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:6}}>Avanti → Prodotti</button>
              </>
              :<>
                {anaMissing.length>0&&<span style={{fontSize:11,fontWeight:600,color:"var(--tf-f59e0b)"}}>Obbligatori: {anaMissing.join(", ")}</span>}
                <button disabled={anaMissing.length>0} onClick={()=>{if(anaMissing.length===0)setShowStep4(true)}} title={anaMissing.length>0?"Compila "+anaMissing.join(", "):""} style={{padding:"9px 22px",borderRadius:8,border:"none",background:anaMissing.length>0?"var(--tf-w80)":"linear-gradient(135deg,#2E75B6,#1B3A5C)",color:anaMissing.length>0?"var(--tf-64748b)":"#fff",fontSize:13,fontWeight:700,cursor:anaMissing.length>0?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:6}}>Avanti →</button>
              </>}
          </div>
        </div>
      </div>}

      {vistaStep==="prodotti"&&margFlow&&!brand&&<div style={{background:"var(--tf-w20)",borderRadius:14,padding:18,marginBottom:12,borderLeft:"4px solid #6f42c1"}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--tf-6f42c1)",marginBottom:14,textTransform:"uppercase"}}>📦 Prodotti & Marginalità</div>
        <MargPOS inline show onClose={()=>{}} venditore={selVend} negozio={selNeg} onAdd={(item)=>{addMargItem(item);setMargEditItem(null)}} editItem={margEditItem}/>
      </div>}

      {vistaStep==="prodotti"&&showAna&&showStep4&&(brand==="windtre"||brand==="vodafone"||brand==="fastweb"||brand==="iliad"||brand==="energy"||brand==="tim"||brand==="very"||brand==="ho"||brand==="kena"||brand==="dojo"||brand==="sky")&&<div style={{background:"var(--tf-w20)",borderRadius:14,padding:18,marginBottom:12,borderLeft:"4px solid "+bC}}>
        <div style={{fontSize:12.5,fontWeight:700,color:bC,marginBottom:14,textTransform:"uppercase"}}>📂 Prodotti e Contratto</div>
        <div style={{background:"rgba(0,114,198,0.10)",borderRadius:10,padding:"14px 12px",marginBottom:14,display:"flex",flexDirection:"column",alignItems:"center",gap:10,border:"1px solid var(--tf-w120)"}}>
          <span style={{fontSize:12,fontWeight:800,color:"var(--tf-8892b0)",textTransform:"uppercase",letterSpacing:.8}}>Codice inserimento</span>
          {/* RIQUADRI negozio a selezione SINGOLA (Luca 03/08): via la tendina
              nativa — un click sceglie, ricliccando lo stesso si toglie */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
            {(brand==="vodafone"?VF_CODICI_NEGOZIO:brand==="fastweb"?FW_CODICI_NEGOZIO:brand==="iliad"?IL_CODICI_NEGOZIO:brand==="energy"?EN_CODICI_NEGOZIO:brand==="tim"?TIM_CODICI_NEGOZIO:brand==="very"?VERY_CODICI_NEGOZIO:brand==="ho"?HO_CODICI_NEGOZIO:brand==="kena"?KENA_CODICI_NEGOZIO:brand==="dojo"?DOJO_CODICI_NEGOZIO:brand==="sky"?SKY_CODICI_NEGOZIO:codiciW3).map(c=>{
              const on=sesCode===c;
              return <button key={c} type="button" onClick={()=>setSesCode(on?"":c)}
                title={on?"Selezionato — clicca per togliere":"Usa il codice di "+c}
                style={{padding:"10px 20px",borderRadius:10,cursor:"pointer",fontSize:14,fontWeight:800,transition:"all .15s",
                  border:on?"1.5px solid "+bC:"1px solid var(--tf-w120)",
                  background:on?bC:"var(--tf-w40)",
                  color:on?"#fff":(sesCode?"var(--tf-586174)":"var(--tf-cbd5e1)"),
                  opacity:sesCode&&!on?0.5:1,
                  boxShadow:on?"0 4px 14px "+bC+"55":"none"}}>
                {on?"✓ ":""}{c}
              </button>;})}
          </div>
        </div>
        {(
          /* GRIGLIA A CARD (per TUTTI i brand e tipi cliente, Luca 03/08):
             3 colonne responsive, prodotti a quadratoni dentro la card,
             compilazione nel MODALE — la griglia resta ferma, niente piu'
             fisarmonica. Stato e validazioni del flusso classico INTATTI. */
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
            {cats.map(group=>{const cc=catCounts(group.id,group.subs);const righe=gS(group.id);return <div key={group.id} style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w100)",borderRadius:14,padding:16,display:"flex",flexDirection:"column"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:12,textAlign:"center"}}>
                <span style={{fontSize:23}}>{iconW3Cat(group)}</span>
                <span style={{fontSize:14.5,fontWeight:800,color:group.color,textTransform:"uppercase",letterSpacing:.4}}>{group.title}</span>
                {cc.tot>0&&<span style={{fontSize:10,fontWeight:800,color:"var(--tf-8892b0)",whiteSpace:"nowrap"}}>{cc.ok>0&&<span style={{color:"var(--tf-28a745)"}}>✓{cc.ok} </span>}{cc.warn>0&&<span style={{color:"var(--tf-f59e0b)"}}>⚠{cc.warn} </span>}{cc.empty>0&&<span>●{cc.empty}</span>}</span>}
              </div>
              {righe.map((sale,si)=><div key={si} style={{marginBottom:8,paddingBottom:si<righe.length-1?10:0,borderBottom:si<righe.length-1?"1px dashed var(--tf-w90)":"none"}}>
                {righe.length>1&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:10,fontWeight:800,color:group.color}}>Vendita #{si+1}</span>
                  <div style={{display:"flex",gap:5}}>
                    <button onClick={()=>resetSale(group.id,si)} title="Reset questa vendita" style={{padding:"2px 8px",borderRadius:6,border:"1px solid var(--tf-w150)",background:"transparent",color:"var(--tf-8892b0)",fontSize:11,fontWeight:700,cursor:"pointer"}}>↺</button>
                    {si>0&&<button onClick={()=>rmSl(group.id,si)} style={{padding:"2px 8px",borderRadius:6,border:"1px solid rgba(220,53,69,0.5)",background:"transparent",color:"var(--tf-dc3545)",fontSize:10,fontWeight:700,cursor:"pointer"}}>✕</button>}
                  </div>
                </div>}
                {/* QUADRATONI stondati (Luca 03/08): stesse forme dei brand */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
                  {group.subs.map(sub=>{const d=sale[sub.id];const att=!!(d&&d.active);const b=att?subBadge(d,dupCheck,sub,_reqMissing(group.id+"-"+si+"-"+sub.id)):null;
                    const spia=att?(b&&b.st==="ok"?"✓":b&&b.st==="warn"?"⚠":"●"):"+";
                    const cSpia=att?(b&&b.st==="ok"?"var(--tf-28a745)":b&&b.st==="warn"?"var(--tf-f59e0b)":"var(--tf-94a3b8)"):bC;
                    return <button key={sub.id}
                      onClick={()=>{if(!att)togSub(group.id,si,sub.id,group.radio?group.subs.map(x=>x.id):null);setProdModal({gid:group.id,si,subId:sub.id});}}
                      title={att?"Apri e modifica i campi":"Aggiungi e compila nel riquadro"}
                      style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,minHeight:54,padding:"11px 8px",borderRadius:12,cursor:"pointer",fontSize:14,fontWeight:700,textAlign:"center",transition:"all .15s",
                        border:att?"2px solid "+group.color:"1px solid var(--tf-w100)",
                        background:att?group.color+"22":"var(--tf-w40)",
                        color:att?"var(--tf-f8fafc)":"var(--tf-8892b0)"}}>
                      <span style={{lineHeight:1.25}}>{sub.title}</span>
                      {att&&<span style={{fontSize:13,fontWeight:900,color:cSpia}}>{spia}</span>}
                    </button>;})}
                </div>
              </div>)}
              <div style={{marginTop:"auto",paddingTop:8}}>
                <button onClick={()=>addSl(group.id)} style={{width:"100%",padding:"8px 0",borderRadius:9,border:"1px dashed "+group.color+"66",background:"transparent",color:group.color,fontSize:11.5,fontWeight:800,cursor:"pointer"}}>+ Aggiungi vendita</button>
              </div>
            </div>;})}
          </div>
        )}
      </div>}

      {/* MODALE PRODOTTO (griglia W3 privato): dentro c'e' lo STESSO SubCard
          del flusso classico — cambiare qui non tocca le validazioni. */}
      {showStep4&&prodModal&&(()=>{
        const group=cats.find(g=>g.id===prodModal.gid);if(!group)return null;
        const sale=(sales[prodModal.gid]||[{}])[prodModal.si]||{};
        const sub=group.subs.find(x=>x.id===prodModal.subId);if(!sub)return null;
        const d=sale[sub.id];if(!(d&&d.active))return null;
        const b=subBadge(d,dupCheck,sub,_reqMissing(group.id+"-"+prodModal.si+"-"+sub.id));
        return <div onClick={()=>setProdModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:1300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"min(920px,94vw)",height:"86vh",overflowY:"auto",background:"var(--tf-12141f)",border:"1px solid "+bC+"55",borderRadius:16,boxShadow:"0 18px 50px rgba(0,0,0,.55)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"15px 20px",borderBottom:"1px solid var(--tf-w80)",position:"sticky",top:0,background:"var(--tf-12141f)",zIndex:1}}>
              <span style={{fontSize:21}}>{iconW3Cat(group)}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:800,color:"var(--tf-f8fafc)"}}>{sub.title}</div>
                <div style={{fontSize:10.5,color:group.color,fontWeight:800,textTransform:"uppercase",letterSpacing:.5}}>{group.title} · Vendita #{prodModal.si+1}</div>
              </div>
              {b&&<span style={{fontSize:11,fontWeight:800,padding:"4px 10px",borderRadius:999,background:b.bg,color:b.fg,whiteSpace:"nowrap"}}>{b.label}</span>}
              <button onClick={()=>setProdModal(null)} style={{background:"transparent",border:"none",color:"var(--tf-64748b)",fontSize:20,cursor:"pointer",lineHeight:1,padding:0}}>✕</button>
            </div>
            <div style={{padding:"16px 20px"}}>
              <SubCard sub={sub} rawSd={d||{}} group={group} si={prodModal.si} sessionCode={sesCode} sale={sale} uF={uF} uC={uC} uP={uP} catSales={gS(group.id)} anaCel={(ana.cellulare||"").replace(/\D/g,"")} onOpenVFModal={openVFModal} dupCheck={dupCheck} mobiliRate={mobiliAggancioRate}/>
            </div>
            <div style={{display:"flex",gap:10,padding:"13px 20px",borderTop:"1px solid var(--tf-w80)",position:"sticky",bottom:0,background:"var(--tf-12141f)"}}>
              <button onClick={()=>{togSub(prodModal.gid,prodModal.si,prodModal.subId,null);setProdModal(null);}} style={{padding:"11px 16px",borderRadius:10,border:"1px solid rgba(220,53,69,0.5)",background:"rgba(220,53,69,0.08)",color:"var(--tf-f87171)",fontSize:12.5,fontWeight:800,cursor:"pointer"}}>🗑 Rimuovi</button>
              <button onClick={()=>setProdModal(null)} style={{flex:1,padding:"11px 16px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#16a34a,#22c55e)",color:"#fff",fontSize:13.5,fontWeight:900,cursor:"pointer"}}>✔️ Fatto — torna ai prodotti</button>
            </div>
          </div>
        </div>;
      })()}

      {showAna&&showStep4&&brand==="tim"&&tipoCliente==="business"&&(
        <div style={{background:"linear-gradient(135deg,var(--tf-w60) 0%,var(--tf-w20) 100%)",borderRadius:16,padding:"44px 24px",marginBottom:10,border:"2px solid "+TIM_C+"33",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",boxShadow:"0 6px 20px rgba(0,0,0,.07)"}}>
          <svg width="200" height="150" viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg">
            <g opacity="0.9">
              <line x1="40" y1="26" x2="160" y2="26" stroke={TIM_C+"33"} strokeWidth="2"/>
              <circle cx="40" cy="26" r="5" fill={TIM_C}/>
              <circle cx="100" cy="26" r="5" fill="#5B9BD5"/>
              <circle cx="160" cy="26" r="5" fill={TIM_C}/>
            </g>
            <g>
              <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 82 92" to="360 82 92" dur="9s" repeatCount="indefinite"/>
              <circle cx="82" cy="92" r="28" fill="none" stroke={TIM_C} strokeWidth="9"/>
              <circle cx="82" cy="92" r="9" fill={TIM_C}/>
              {[0,45,90,135,180,225,270,315].map(a=><rect key={a} x="77" y="54" width="10" height="14" rx="2" fill={TIM_C} transform={"rotate("+a+" 82 92)"}/>)}
            </g>
            <g>
              <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="360 132 108" to="0 132 108" dur="9s" repeatCount="indefinite"/>
              <circle cx="132" cy="108" r="18" fill="none" stroke="#5B9BD5" strokeWidth="7"/>
              <circle cx="132" cy="108" r="6" fill="#5B9BD5"/>
              {[0,60,120,180,240,300].map(a=><rect key={a} x="128.5" y="84" width="7" height="10" rx="1.5" fill="#5B9BD5" transform={"rotate("+a+" 132 108)"}/>)}
            </g>
          </svg>
          <div style={{fontSize:23,fontWeight:800,color:TIM_C,marginTop:16,letterSpacing:.3}}>TIM Business</div>
          <div style={{fontSize:15,fontWeight:600,color:"var(--tf-64748b)",marginTop:6}}>Manutenzione in corso...</div>
          <div style={{fontSize:12,color:"var(--tf-9aa0a6)",marginTop:8,maxWidth:440,lineHeight:1.5}}>Questa sezione è temporaneamente in aggiornamento tecnologico. I prodotti TIM Business saranno disponibili a breve.</div>
        </div>
      )}

      {/* SKY LEGACY: disattivato — Sky passa dal flusso catalogo come gli altri
          brand (aggancio 27/07). Il blocco resta come riferimento storico. */}
      {showAna&&showStep4&&brand==="__sky_legacy__"&&(()=>{
        const SKY_COLOR="var(--tf-0072c6)";
        const btnSky=(label,active,onClick)=><button onClick={onClick} style={{padding:"10px 18px",borderRadius:8,cursor:"pointer",border:active?"2px solid "+SKY_COLOR:"2px solid var(--tf-w100)",background:active?SKY_COLOR:"var(--tf-w40)",color:active?"#fff":"var(--tf-8892b0)",fontSize:13,fontWeight:600,whiteSpace:"nowrap"}}>{label}</button>;
        const ynSky=(val,onYes,onNo)=><div style={{display:"flex",gap:6}}>{[{v:"Sì",fn:onYes},{v:"No",fn:onNo}].map(({v,fn})=><button key={v} onClick={fn} style={{padding:"7px 22px",borderRadius:8,border:val===v?"2px solid "+SKY_COLOR:"2px solid var(--tf-w100)",background:val===v?SKY_COLOR:"var(--tf-w40)",color:val===v?"#fff":"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>{v}</button>)}</div>;
        const dBox=(children)=><div style={{marginTop:10,background:"rgba(0,114,198,0.10)",borderRadius:8,padding:12,border:"1px solid var(--tf-w120)"}}><div style={{fontSize:11,fontWeight:700,color:SKY_COLOR,marginBottom:8,textTransform:"uppercase"}}>📄 Dati contratto</div>{children}</div>;
        const venditeBar=(si,bd)=>{return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:11,fontWeight:700,color:SKY_COLOR}}>Vendita #{si+1}</span>{bd&&<span style={{fontSize:10,fontWeight:800,padding:"2px 9px",borderRadius:999,background:bd.bg,color:bd.fg,whiteSpace:"nowrap"}}>{bd.l}</span>}</div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>skyReset(si)} title="Reset questa vendita" style={{padding:"4px 10px",borderRadius:6,border:"1px solid #b0b0b0",background:"var(--tf-w20)",color:"var(--tf-8892b0)",fontSize:12,fontWeight:700,cursor:"pointer"}}>↺</button>
            {si===skyS.length-1&&<button onClick={()=>setSkyS(p=>[...p,{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:"",tvCodIns:"",fibraCodIns:"",mobCodIns:""}])} style={{padding:"4px 12px",borderRadius:6,border:"1px solid "+SKY_COLOR,background:"var(--tf-w20)",color:SKY_COLOR,fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Vendita</button>}
            {si>0&&<button onClick={()=>setSkyS(p=>{const n=[...p];n.splice(si,1);return n})} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #dc3545",background:"var(--tf-w20)",color:"var(--tf-dc3545)",fontSize:10,fontWeight:700,cursor:"pointer"}}>✕</button>}
          </div>
        </div>;};
        return (<div>
          {/* ── BOX TV ── */}
          <div style={{background:"var(--tf-w20)",borderRadius:14,padding:18,marginBottom:12,borderLeft:"4px solid "+SKY_COLOR}}>
            <div style={{fontSize:11,fontWeight:700,color:SKY_COLOR,marginBottom:12,textTransform:"uppercase"}}>📺 TV</div>
            {skyS.map((sale,si)=><div key={si} style={{padding:12,borderRadius:8,marginBottom:6,background:"var(--tf-w30)",borderLeft:"3px solid "+SKY_COLOR}}>
              {venditeBar(si,skyBadge(skyTv(sale)))}
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {(tipoCliente==="business"?SKY_BIZ_TV:SKY_TV).map(pr=>btnSky(pr,sale.tvSel===pr,()=>togSky(si,pr)))}
              </div>
              {sale.tvSel&&dBox(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px"}}>
                  <div><div style={{fontSize:10,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:3}}>Codice contratto <span style={{color:"var(--tf-dc3545)"}}>*</span></div>
                  <input value={sale.tvCC||""} onChange={e=>uSkyF(si,"tvCC",e.target.value)} placeholder="es. 1679428185586" style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12,boxSizing:"border-box"}}/></div>
                  <SCd session={sesCode} codici={SKY_CODICI_NEGOZIO} val={sale.tvCodIns||""} onCh={v=>uSkyF(si,"tvCodIns",v)}/>
                </div>
              )}
            </div>)}
          </div>

          {/* ── BOX FIBRA ── */}
          <div style={{background:"var(--tf-w20)",borderRadius:14,padding:18,marginBottom:12,borderLeft:"4px solid "+SKY_COLOR}}>
            <div style={{fontSize:11,fontWeight:700,color:SKY_COLOR,marginBottom:12,textTransform:"uppercase"}}>🌐 Fibra</div>
            {skyS.map((sale,si)=><div key={si} style={{padding:12,borderRadius:8,marginBottom:6,background:"var(--tf-w30)",borderLeft:"3px solid "+SKY_COLOR}}>
              {venditeBar(si,skyBadge(skyFib(sale)))}
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {(tipoCliente==="business"?SKY_BIZ_FIBRA:SKY_FIBRA).map(pr=>btnSky(pr,sale.fibraSel===pr,()=>togSky(si,pr)))}
              </div>
              {sale.fibraSel&&dBox(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px"}}>
                <div><div style={{fontSize:10,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:3}}>Codice contratto <span style={{color:"var(--tf-dc3545)"}}>*</span></div>
                <input value={sale.fibraCC||""} onChange={e=>uSkyF(si,"fibraCC",e.target.value)} placeholder="es. 1679428185586" style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12,boxSizing:"border-box"}}/></div>
                <SCd session={sesCode} codici={SKY_CODICI_NEGOZIO} val={sale.fibraCodIns||""} onCh={v=>uSkyF(si,"fibraCodIns",v)}/>
                <div><div style={{fontSize:10,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:3}}>GNP?</div>
                {ynSky(sale.fibraGnp,()=>uSkyF(si,"fibraGnp","Sì"),()=>{uSkyF(si,"fibraGnp","No");uSkyF(si,"fibraGnpBrand","");uSkyF(si,"fibraGnpNum","");})}</div>
                {sale.fibraGnp==="Sì"&&<>
                  <div><div style={{fontSize:10,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:3}}>Brand GNP</div>
                  <select value={sale.fibraGnpBrand||""} onChange={e=>uSkyF(si,"fibraGnpBrand",e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12}}>
                    <option value="">— Seleziona —</option>
                    {SKY_BRAND_FIBRA.map(b=><option key={b} value={b}>{b}</option>)}
                  </select></div>
                  <div><div style={{fontSize:10,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:3}}>Numero fisso in portabilità</div>
                  <input value={sale.fibraGnpNum||""} onChange={e=>uSkyF(si,"fibraGnpNum",e.target.value)} placeholder="es. 060000000" style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12,boxSizing:"border-box"}}/></div>
                </>}
              </div>)}
            </div>)}
          </div>

          {/* ── BOX MOBILE — solo privato ── */}
          {tipoCliente!=="business"&&<div style={{background:"var(--tf-w20)",borderRadius:14,padding:18,marginBottom:12,borderLeft:"4px solid "+SKY_COLOR}}>
            <div style={{fontSize:11,fontWeight:700,color:SKY_COLOR,marginBottom:12,textTransform:"uppercase"}}>📱 Mobile</div>
            {skyS.map((sale,si)=><div key={si} style={{padding:12,borderRadius:8,marginBottom:6,background:"var(--tf-w30)",borderLeft:"3px solid "+SKY_COLOR}}>
              {venditeBar(si,skyBadge(skyMob(sale)))}
              <div style={{display:"flex",gap:6}}>
                {btnSky("Sky Mobile",sale.mobileSel,()=>togSky(si,"Sky Mobile"))}
              </div>
              {sale.mobileSel&&dBox(<div>
                <div style={{marginBottom:10,maxWidth:240}}><SCd session={sesCode} codici={SKY_CODICI_NEGOZIO} val={sale.mobCodIns||""} onCh={v=>uSkyF(si,"mobCodIns",v)}/></div>
                <div style={{fontSize:10,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:4}}>MNP? <span style={{color:"var(--tf-dc3545)"}}>*</span></div>
                {ynSky(sale.mobMnp,()=>uSkyF(si,"mobMnp","Sì"),()=>{uSkyF(si,"mobMnp","No");uSkyF(si,"mobNumProv","");uSkyF(si,"mobNumDef","");uSkyF(si,"mobBrandMnp","");uSkyF(si,"mobIccid","");})}
                {sale.mobMnp==="Sì"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px",marginTop:8}}>
                  <TF l="Numero provvisorio" r v={sale.mobNumProv||""} o={v=>uSkyF(si,"mobNumProv",v)} p="es. 393XXXXXXX"/>
                  <TF l="Numero definitivo" r v={sale.mobNumDef||""} o={v=>uSkyF(si,"mobNumDef",v)} p="Numero da portare"/>
                  <div><div style={{fontSize:10,fontWeight:700,color:"var(--tf-8892b0)",marginBottom:3}}>Brand MNP <span style={{color:"var(--tf-dc3545)"}}>*</span></div>
                  <select value={sale.mobBrandMnp||""} onChange={e=>uSkyF(si,"mobBrandMnp",e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12}}>
                    <option value="">— Seleziona —</option>
                    {["TIM","Vodafone","Fastweb","WINDTRE","Iliad","PosteMobile","CoopVoce","ho.","Very Mobile","Rabona","Lyca","Kena","MVNO altro"].map(b=><option key={b} value={b}>{b}</option>)}
                  </select></div>
                  <TF l="ICCID" r v={sale.mobIccid||""} o={v=>uSkyF(si,"mobIccid",v)} p="893XXXXXXXXXXXXXXXX"/>
                </div>}
                {sale.mobMnp==="No"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px",marginTop:8}}>
                  <TF l="Numero" r v={sale.mobNum||""} o={v=>uSkyF(si,"mobNum",v)} p="es. 393XXXXXXX"/>
                  <TF l="ICCID" r v={sale.mobIccidNo||""} o={v=>uSkyF(si,"mobIccidNo",v)} p="893XXXXXXXXXXXXXXXX"/>
                </div>}
                <div style={{fontSize:10,fontWeight:700,color:"var(--tf-8892b0)",margin:"10px 0 4px"}}>TIED? <span style={{color:"var(--tf-dc3545)"}}>*</span></div>
                {ynSky(sale.mobTied,()=>uSkyF(si,"mobTied","Sì"),()=>uSkyF(si,"mobTied","No"))}
              </div>)}
            </div>)}
          </div>}
        </div>);
      })()}


      
      <MargPOS show={showMargPOS} onClose={()=>{setShowMargPOS(false);setMargEditItem(null)}} venditore={selVend} negozio={selNeg} onAdd={(item)=>{addMargItem(item);setMargEditItem(null)}} editItem={margEditItem}/>
      <MargList items={margItems} onRemove={rmMargItem} show={showMargList} onClose={()=>setShowMargList(false)}/>

      {showMargSection&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(4px)"}}>
        <style>{`@keyframes margSecSlideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
        <div style={{background:"var(--tf-w20)",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:640,maxHeight:"80vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 -4px 30px rgba(0,0,0,.2)",animation:"margSecSlideUp 0.32s cubic-bezier(0.22,1,0.36,1)"}}>
          <div style={{background:"linear-gradient(135deg,#6f42c1,#9b59b6)",padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{color:"#fff",fontWeight:800,fontSize:17}}>📦 Prodotti in Marginalità</div><div style={{color:"var(--tf-w750)",fontSize:11,marginTop:2}}>{margItems.length} prodott{margItems.length===1?"o":"i"} registrat{margItems.length===1?"o":"i"}</div></div>
            <button onClick={()=>setShowMargSection(false)} style={{padding:"6px 14px",borderRadius:8,border:"1px solid var(--tf-w400)",background:"var(--tf-w150)",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>✕ Chiudi</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:16}}>
            {margItems.length===0?<div style={{textAlign:"center",padding:"40px 20px",color:"var(--tf-64748b)"}}><div style={{fontSize:40}}>📦</div><div style={{fontSize:14,fontWeight:600,marginTop:10}}>Nessun prodotto registrato</div><div style={{fontSize:12,marginTop:4}}>Aggiungi prodotti dal catalogo</div></div>:
              margItems.map((item,idx)=>(
                <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--tf-w30)"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13}}>{item.product}</div>
                    {item.model&&<div style={{fontSize:11,color:"var(--tf-64748b)"}}>{item.model}</div>}
                    <div style={{fontSize:12,color:"var(--tf-8892b0)",marginTop:2}}>x{item.qty||1}{item.importo!=null&&<span style={{color:"var(--tf-28a745)",marginLeft:6,fontWeight:700}}>€ {Number(item.importo).toFixed(2)}</span>}</div>
                  </div>
                  <button onClick={()=>setMargItems(p=>p.filter((_,i)=>i!==idx))} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #dc3545",background:"rgba(220,53,69,0.12)",color:"var(--tf-dc3545)",fontSize:11,fontWeight:700,cursor:"pointer"}}>✕</button>
                </div>
              ))
            }
          </div>
          <div style={{padding:"14px 16px",borderTop:"1px solid var(--tf-w60)",display:"flex",gap:10}}>
            <button onClick={()=>{setShowMargSection(false);setShowMargPOS(true)}} style={{flex:1,padding:"12px 0",borderRadius:10,border:"2px solid #6f42c1",background:"rgba(111,66,193,0.12)",color:"var(--tf-6f42c1)",fontSize:13,fontWeight:800,cursor:"pointer"}}>+ Aggiungi prodotto</button>
            {margItems.length>0&&<button onClick={()=>setShowCart(true)} style={{flex:1,padding:"12px 0",borderRadius:10,border:"none",background:"linear-gradient(135deg,#6f42c1,#9b59b6)",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>🛒 Vai al carrello</button>}
          </div>
        </div>
      </div>}

        {/* RIUSO DOCUMENTI D'ARCHIVIO: pannello gaming (Trovati → Verifica →
            Esito) sopra le caselle di upload; compare solo se il cliente ha
            gia' documenti d'identita' agli atti. */}
        {vistaStep==="allegati"&&((margFlow&&!brand)||(showAna&&showStep4))&&pannelloDocRiuso()}
        {/* STEP ALLEGATI PER CONTRATTO (Luca 05/08): il documento d'identita'
            e' UNICO per tutto il carrello (e' sempre lo stesso cliente);
            contratto e "altro" si caricano PER OGNI riga/offerta del carrello
            (piu' offerte dello stesso brand = piu' contratti = piu' upload).
            Le righe solo-marginalita' non hanno gruppo. ECCEZIONE SKY: il
            gruppo c'e' ma il contratto e' FACOLTATIVO (Sky non lo rilascia). */}
        {vistaStep==="allegati"&&((margFlow&&!brand)||(showAna&&showStep4))&&<div style={{background:"var(--tf-w20)",borderRadius:14,padding:18,marginBottom:12,borderLeft:"4px solid #17a2b8",marginTop:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--tf-17a2b8)",marginBottom:14,textTransform:"uppercase"}}>📎 Allegati</div>
          {(margFlow&&!brand)?(<>
            {/* SOLO MARGINALITÀ (Luca 06/08): niente riquadro Contratto — solo
                Documento e Altro, ENTRAMBI facoltativi (per un accessorio
                spesso non ci sono i dati del cliente) */}
            <div style={{fontSize:10,color:"var(--tf-8892b0)",marginBottom:10}}>Per le vendite di sola marginalità gli allegati sono FACOLTATIVI: carica documento o altro solo se li hai.</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12}}>
              {(margItems.some(_usatoFinanziato)
                ? [{l:"Documento",i:"🪪",t:"documento",n:"OBBLIGATORIO per il finanziamento"},{l:"Contratto",i:"📄",t:"contratti",n:"OBBLIGATORIO per il finanziamento"},{l:"Altro",i:"📁",t:"altro",n:"facoltativo"}]
                : [{l:"Documento",i:"🪪",t:"documento",n:"facoltativo"},{l:"Altro",i:"📁",t:"altro",n:"facoltativo"}]
              ).map(a=>boxAllegato(a,null,a.n))}
            </div>
            {listaFileAllegati(attachments.map((a,i)=>({a,i})))}
          </>):(<>
            {/* sezione CONDIVISA: un solo documento d'identita' per tutta la vendita */}
            <div style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w60)",borderRadius:12,padding:14,marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:800,color:"var(--tf-f8fafc)",marginBottom:4}}>🪪 Documento d&apos;identità del cliente</div>
              <div style={{fontSize:10,color:"var(--tf-8892b0)",marginBottom:10}}>Vale per TUTTO il carrello: si carica (o si riusa dall&apos;archivio) una volta sola e al salvataggio viene agganciato a ogni contratto.</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12}}>
                {boxAllegato({l:"Documento",i:"🪪",t:"documento"})}
                {haEnergia&&boxAllegato({l:"Fattura",i:"🧾",t:"fattura"},null,"per i contratti energia")}
              </div>
              {listaFileAllegati(attachments.map((a,i)=>({a,i})).filter(({a})=>a.type==="documento"||a.type==="fattura"))}
            </div>
            {/* UN GRUPPO PER OGNI CONTRATTO del carrello (riga = offerta) */}
            {righeCarrello().map(r=>{
              const bd=BRANDS.find(x=>x.id===r.brandId||x.label===r.brandLabel);
              return <div key={r.key} style={{background:"var(--tf-w30)",border:"1px solid var(--tf-w60)",borderLeft:"4px solid "+(r.brandColor||"#17a2b8"),borderRadius:12,padding:14,marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:10}}>
                  {bd&&bd.logo?<span style={{background:"#fff",borderRadius:8,padding:"2px 8px",display:"inline-flex",alignItems:"center"}}><Image src={bd.logo} alt={r.brandLabel} width={120} height={30} style={{height:20,width:"auto",maxWidth:96,objectFit:"contain"}}/></span>:<span style={{fontSize:13,fontWeight:800,color:"var(--tf-f8fafc)"}}>{r.brandIcon} {r.brandLabel}</span>}
                  <span style={{fontSize:12,fontWeight:800,color:"var(--tf-f8fafc)"}}>{r.label}{r.multi?<span style={{color:"var(--tf-8892b0)",fontWeight:700}}> · n°{r.nCopia}</span>:null}</span>
                  {r.isCurrent&&<span style={{background:"var(--tf-ffd800)",borderRadius:12,padding:"2px 10px",color:"#111",fontSize:9,fontWeight:800}}>IN CORSO</span>}
                  {/* MOD-31/32: badge dallo stato risolto (catalogo + aggancio) */}
                  {r.contratto==="assente"?<span style={{fontSize:9,fontWeight:800,color:"var(--tf-f59e0b)",background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.4)",borderRadius:999,padding:"2px 10px"}}>senza contratto</span>
                    :r.contratto==="associato"?<span style={{fontSize:9,fontWeight:800,color:"var(--tf-c4b5fd)",background:"rgba(111,66,193,0.14)",border:"1px solid rgba(111,66,193,0.5)",borderRadius:999,padding:"2px 10px"}}>📎 vendita agganciata: contratto unico</span>
                    :r.contratto==="facoltativo"?(attachments.some(a=>a.type==="contratti"&&(a.rowKey||"")===r.key)
                      ?<span style={{fontSize:9,fontWeight:800,color:"var(--tf-34d399)",background:"rgba(52,211,153,0.12)",border:"1px solid rgba(52,211,153,0.4)",borderRadius:999,padding:"2px 10px"}}>✓ contratto caricato</span>
                      :<span style={{fontSize:9,fontWeight:800,color:"var(--tf-f59e0b)",background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.4)",borderRadius:999,padding:"2px 10px"}}>contratto facoltativo</span>)
                    :(attachments.some(a=>a.type==="contratti"&&(a.rowKey||"")===r.key)
                      ?<span style={{fontSize:9,fontWeight:800,color:"var(--tf-34d399)",background:"rgba(52,211,153,0.12)",border:"1px solid rgba(52,211,153,0.4)",borderRadius:999,padding:"2px 10px"}}>✓ contratto caricato</span>
                      :<span style={{fontSize:9,fontWeight:800,color:"var(--tf-f87171)",background:"rgba(220,53,69,0.10)",border:"1px solid rgba(220,53,69,0.4)",borderRadius:999,padding:"2px 10px"}}>contratto mancante</span>)}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12}}>
                  {r.contratto!=="assente"&&r.contratto!=="associato"&&boxAllegato({l:"Contratto",i:"📄",t:"contratti"},r.key,r.contratto==="facoltativo"?"facoltativo per questa offerta":"obbligatorio per questa offerta")}
                  {boxAllegato({l:"Altro",i:"📁",t:"altro"},r.key,"facoltativo")}
                </div>
                {listaFileAllegati(attachments.map((a,i)=>({a,i})).filter(({a})=>(a.type==="contratti"||a.type==="altro")&&(a.rowKey||"")===r.key))}
              </div>;
            })}
            {righeCarrello().length===0&&<div style={{fontSize:11,color:"var(--tf-8892b0)",background:"var(--tf-w30)",border:"1px dashed var(--tf-w100)",borderRadius:10,padding:"12px 14px",marginBottom:4}}>🛒 Nessuna offerta nel carrello: le caselle del contratto compaiono qui, una per ogni offerta selezionata.</div>}
            {/* file rimasti senza riga (offerta cambiata/eliminata dopo l'upload) */}
            {allegatiOrfani().length>0&&<div style={{background:"var(--tf-w30)",border:"1px dashed var(--tf-w100)",borderRadius:12,padding:14,marginBottom:4}}>
              <div style={{fontSize:10,fontWeight:800,color:"var(--tf-f59e0b)",marginBottom:4}}>📁 File non più associati a un&apos;offerta del carrello</div>
              <div style={{fontSize:10,color:"var(--tf-8892b0)"}}>L&apos;offerta è stata modificata o rimossa: ricarica il contratto nella sua casella. Se li lasci qui, al salvataggio verranno agganciati al primo contratto.</div>
              {listaFileAllegati(allegatiOrfani())}
            </div>}
          </>)}
        </div>}
        {preview&&createPortal(<div onClick={chiudiAnteprima} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:3100,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(4px)"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--tf-11141d)",border:"1px solid var(--tf-w100)",borderRadius:14,width:"100%",maxWidth:840,maxHeight:"92vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid var(--tf-w80)"}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--tf-f8fafc)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{preview.name}</div>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                <a href={preview.url} target="_blank" rel="noreferrer" style={{fontSize:12,color:"var(--tf-5fd3e6)",textDecoration:"none",fontWeight:700}}>Apri ↗</a>
                <button onClick={chiudiAnteprima} style={{background:"none",border:"none",color:"var(--tf-94a3b8)",fontSize:18,cursor:"pointer"}}>✕</button>
              </div>
            </div>
            <div style={{flex:1,minHeight:0,background:"var(--tf-0b0d14)",display:"flex",alignItems:"center",justifyContent:"center",overflow:"auto"}}>
              {(preview.mime||"").startsWith("image/")
                ? <img src={preview.url} alt={preview.name} style={{maxWidth:"100%",maxHeight:"80vh",objectFit:"contain"}}/>
                : (preview.mime||"").includes("pdf")
                  ? <iframe src={preview.url} title={preview.name} style={{width:"100%",height:"80vh",border:"none",background:"#fff"}}/>
                  : <div style={{padding:40,color:"var(--tf-94a3b8)",textAlign:"center"}}>Anteprima non disponibile.<br/><a href={preview.url} target="_blank" rel="noreferrer" style={{color:"var(--tf-5fd3e6)"}}>Scarica il file</a></div>}
            </div>
          </div>
        </div>, document.body)}
        {qrBox&&createPortal(<div onClick={closeQr} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--tf-11141d)",border:"1px solid var(--tf-w80)",borderRadius:16,width:"100%",maxWidth:360,padding:24,margin:"0 16px",textAlign:"center"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontWeight:800,fontSize:16,color:"var(--tf-f8fafc)"}}>📱 Carica dal telefono</div>
              <button onClick={closeQr} style={{background:"none",border:"none",color:"var(--tf-94a3b8)",fontSize:18,cursor:"pointer"}}>✕</button>
            </div>
            {qrRecv?(
              <div style={{padding:"22px 0"}}><div style={{fontSize:48,marginBottom:8}}>✅</div><div style={{fontSize:16,fontWeight:800,color:"var(--tf-34d399)"}}>Ricevuto!</div><div style={{fontSize:12,color:"var(--tf-94a3b8)",marginTop:6}}>{qrRecv.n} file aggiunt{qrRecv.n===1?"o":"i"} agli allegati.</div></div>
            ):(<>
              <div style={{fontSize:12,color:"var(--tf-94a3b8)",marginBottom:14}}>Inquadra il QR con la fotocamera del telefono e carica {qrBox==="documento"?"la foto del documento (PNG/JPEG)":"il PDF — se scansioni più pagine verranno unite in un unico file"}.</div>
              {qrImg?<img src={qrImg} alt="QR" style={{width:216,height:216,borderRadius:12,background:"#fff",padding:8,boxSizing:"border-box",display:"block",margin:"0 auto"}}/>:<div style={{width:216,height:216,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--tf-64748b)"}}>Genero…</div>}
              <div style={{fontSize:11,color:"var(--tf-f59e0b)",marginTop:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><span style={{width:8,height:8,borderRadius:4,background:"var(--tf-f59e0b)",display:"inline-block"}}/>In attesa della scansione…</div>
            </>)}
          </div>
        </div>, document.body)}
        {vistaStep==="allegati"&&((margFlow&&!brand)||(showAna&&showStep4))&&<div style={{background:"var(--tf-w20)",borderRadius:14,padding:18,marginBottom:12,borderLeft:"4px solid #28a745"}}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--tf-28a745)",marginBottom:14,textTransform:"uppercase"}}>🏪 Attribuzione</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px 16px"}}>
            <DD l="Venditore" r v={selVend} o={v=>setSelVend(v)} vals={venditori} nt="Dal login — editabile"/><DD l="Negozio" r v={selNeg} o={v=>setSelNeg(v)} vals={negozi} nt="Dal login — editabile"/>
            <div><div style={{fontSize:11,fontWeight:600,color:"var(--tf-8892b0)",marginBottom:3}}>Data <span style={{color:"var(--tf-dc3545)"}}>*</span></div><input type="date" value={dataVendita} onChange={e=>setDataVendita(e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid var(--tf-w100)",fontSize:12,boxSizing:"border-box"}}/></div>
          </div>
        </div>}
        {vistaStep==="note"&&((margFlow&&!brand)||(showAna&&showStep4))&&<NoteStep store={selNeg} show={notaOn} setShow={setNotaOn} scelta={notaScelta} setScelta={setNotaScelta} nota={nota} setNota={setNota} pData={promData} setPData={setPromData} pOra={promOra} setPOra={setPromOra} pNeg={promNeg} setPNeg={setPromNeg} pDesc={promDesc} setPDesc={setPromDesc}/>}

      {["prodotti","allegati","note"].includes(vistaStep)&&((margFlow&&!brand)||(showAna&&showStep4))&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:20,marginTop:8,gap:10}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {/* MOD-44c: anche in marginalità l'indietro dai prodotti passa dal Cliente */}
          <button onClick={()=>{const PREV={prodotti:"cliente",allegati:"prodotti",note:"allegati"};setVistaStep(PREV[vistaStep]||"brand");}} style={{padding:"11px 20px",borderRadius:10,border:"1px solid var(--tf-w100)",background:"var(--tf-w20)",color:"var(--tf-8892b0)",fontSize:14,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>← Indietro</button>
          <button onClick={()=>setConfirmReset(true)} style={{padding:"11px 22px",borderRadius:10,border:"2px solid #dc3545",background:"var(--tf-w20)",color:"var(--tf-dc3545)",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>🗑️ Reset form</button>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {/* Avanti sta a DESTRA (Luca 04/08): convenzione dei wizard */}
          {({prodotti:"allegati",allegati:"note"})[vistaStep]&&<button onClick={()=>setVistaStep(({prodotti:"allegati",allegati:"note"})[vistaStep])} style={{padding:"11px 30px",borderRadius:10,border:"1.5px solid rgba(99,102,241,0.6)",background:"rgba(99,102,241,0.14)",color:"var(--tf-c7d2fe)",fontSize:14,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>Avanti →</button>}
          {/* Luca 04/08: NIENTE scorciatoia al riepilogo da qui (si saltavano
              Allegati/Note e partivano vendite senza documenti) — l'utente
              avanza con "Avanti"; il riepilogo si apre dal pannello/🛒 laterale. */}
          {/* Luca 05/08: il bottone si chiama "Vai al carrello →" (non piu'
              "Salva vendita", che dava l'impressione di uscire: il salvataggio
              VERO resta nel riepilogo) e compare SOLO dopo la scelta Sì/No
              sulle note. Apre il RIEPILOGO (caso Damiano 04/08: col ritorno
              alla griglia brand la registrazione finale non partiva mai). */}
          {brand&&vistaStep==="note"&&notaScelta&&<button onClick={()=>{addCart(()=>{setVistaStep("brand");setShowCart(true);});}} disabled={blockSaveAll} title={blockSaveAll?(hasIncomplete?"Completa tutti i prodotti (stato Incompleto) prima di salvare":(hasDupPodPdr?"POD/PDR duplicato — correggi prima di salvare":(hasDupCodContr?"Codice contratto duplicato — correggi prima di salvare":"Numero/ICCID non valido — correggi prima di salvare"))):""} style={{padding:"11px 22px",borderRadius:10,border:"2px solid "+(blockSaveAll?"var(--tf-w100)":"var(--tf-28a745)"),background:blockSaveAll?"var(--tf-w30)":"rgba(40,167,69,0.12)",color:blockSaveAll?"var(--tf-64748b)":"var(--tf-28a745)",fontSize:13,fontWeight:800,cursor:blockSaveAll?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:8}}>🛒 Vai al carrello →</button>}
        </div>
      </div>}

      {/* ── CONFIRM RESET POPUP (condiviso, #124) ────────────────────────── */}
      {confirmResetModal}{confirmNoOpzModal}

      {/* ── VF QTY MODAL OVERLAY ─────────────────────────────────────────── */}
      {vfQtyModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)setVfQtyModal(null)}}>
          <style>{`@keyframes vfModalIn{from{opacity:0;transform:translateY(48px) scale(0.93)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
          <div style={{background:"var(--tf-w20)",borderRadius:20,padding:32,width:360,boxShadow:"0 24px 80px rgba(0,0,0,0.35)",animation:"vfModalIn .28s cubic-bezier(.22,1,.36,1) both",textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:8}}>📱</div>
            <div style={{fontSize:18,fontWeight:800,color:"var(--tf-f8fafc)",marginBottom:4}}>Quante SIM hai venduto?</div>
            <div style={{fontSize:13,fontWeight:600,color:"var(--tf-e60000)",background:"rgba(220,53,69,0.12)",borderRadius:8,padding:"6px 16px",display:"inline-block",marginBottom:24}}>{vfQtyModal.offer}</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:20,marginBottom:28}}>
              <button onClick={()=>setVfQtyModal(p=>({...p,tempQty:Math.max(1,p.tempQty-1)}))} style={{width:52,height:52,borderRadius:"50%",border:"2px solid var(--tf-w100)",background:"var(--tf-w30)",fontSize:26,fontWeight:700,cursor:"pointer",color:"var(--tf-8892b0)",lineHeight:"1",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:52,fontWeight:900,color:"var(--tf-e60000)",lineHeight:1}}>{vfQtyModal.tempQty}</div>
                <div style={{fontSize:11,color:"var(--tf-64748b)",marginTop:2}}>SIM</div>
              </div>
              <button onClick={()=>setVfQtyModal(p=>({...p,tempQty:Math.min(9,p.tempQty+1)}))} style={{width:52,height:52,borderRadius:"50%",border:"2px solid #E60000",background:"var(--tf-e60000)",fontSize:26,fontWeight:700,cursor:"pointer",color:"#fff",lineHeight:"1",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={()=>setVfQtyModal(null)} style={{padding:"11px 28px",borderRadius:10,border:"1px solid var(--tf-w100)",background:"var(--tf-w30)",color:"var(--tf-8892b0)",fontSize:13,fontWeight:600,cursor:"pointer"}}>Annulla</button>
              {vfQtyModal&&vfQtyModal.tempQty>0&&((sales[vfQtyModal.catId]||[{}])[vfQtyModal.si]||{})[vfQtyModal.subId]&&((((sales[vfQtyModal.catId]||[{}])[vfQtyModal.si]||{})[vfQtyModal.subId]||{}).vfOffers||{})[vfQtyModal.offer]>0&&<button onClick={()=>{if(!vfQtyModal)return;const{catId,si,subId,offer}=vfQtyModal;const cur=((sales[catId]||[{}])[si]||{})[subId];const newVfO={...((cur&&cur.vfOffers)||{})};delete newVfO[offer];const newVfC={...((cur&&cur.vfContratti)||{})};delete newVfC[offer];uP(catId,si,subId,"vfOffers",newVfO);uP(catId,si,subId,"vfContratti",newVfC);setVfQtyModal(null);}} style={{padding:"11px 20px",borderRadius:10,border:"1px solid #dc3545",background:"var(--tf-w20)",color:"var(--tf-dc3545)",fontSize:13,fontWeight:600,cursor:"pointer"}}>✕ Rimuovi</button>}
              <button onClick={confirmVFQty} style={{padding:"11px 36px",borderRadius:10,border:"none",background:"var(--tf-e60000)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 16px rgba(230,0,0,0.35)"}}>Conferma</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
  return <ReqCtx.Provider value={_reqApi}>{formContent}</ReqCtx.Provider>;
}

// PARACADUTE (Luca 03/08): se il render di Registra Vendita esplode, invece
// della schermata bianca compare un riquadro con l'errore leggibile + Ricarica.
export default function RegistraVenditaPage() {
  return <ErrorBoundaryClient nome="Registra Vendita"><CRM /></ErrorBoundaryClient>;
}
