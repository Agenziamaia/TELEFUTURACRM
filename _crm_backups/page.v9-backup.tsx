// @ts-nocheck
"use client";

import Image from "next/image";
import { generateContractPDF } from "@/utils/contract-pdf";
import { FileDown, Search, CheckCircle2, UserPlus, UserCheck, Building, User, ChevronRight, Calculator, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

import { useState, useCallback, useEffect, memo, useRef } from "react";
import { calculateCF, _CNA } from "@/lib/cf";


// ═══════════════════════════════════════════════════════════════
// v9 ENHANCEMENTS: Auto-save, Smart Defaults, Validation, Marginalità
// ═══════════════════════════════════════════════════════════════

// ── AUTO-SAVE ──
const useAutoSave=(key,state)=>{useEffect(()=>{try{sessionStorage.setItem(key,JSON.stringify(state))}catch(e){}},[key,state])};
const loadDraft=(key)=>{try{const d=sessionStorage.getItem(key);return d?JSON.parse(d):null}catch(e){return null}};
const clearDraft=(key)=>{try{sessionStorage.removeItem(key)}catch(e){}};

// ── VALIDATION ──
const vIMEI=(v)=>{if(!v)return null;const d=v.replace(/\D/g,"");if(!d.length)return null;if(d.length!==15)return{ok:false,msg:`${d.length}/15`};let s=0;for(let i=0;i<14;i++){let n=parseInt(d[i]);if(i%2===1)n*=2;if(n>9)n-=9;s+=n}return{ok:(10-s%10)%10===parseInt(d[14]),msg:d.length===15?"✓ Valido":""}};
const vICCID=(v)=>{if(!v)return null;const d=v.replace(/\D/g,"");if(!d.length)return null;return{ok:d.length>=19&&d.length<=20,msg:d.length>=19?`✓ ${d.length}`:`${d.length}/19-20`}};
const vCF=(v)=>{if(!v)return null;const u=v.toUpperCase().replace(/\s/g,"");if(!u.length)return null;if(u.length===11&&/^\d{11}$/.test(u))return{ok:true,msg:"P.IVA"};if(u.length!==16)return{ok:false,msg:`${u.length}/16`};return{ok:/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(u),msg:u.length===16?"✓":"err"}};

// ── MARGINALITÀ DATA ──
const MARG_PRODUCTS=[
  {cat:"📦 Prodotti",items:[
    {id:"plx",name:"PLX",price:null,fixedMargin:8,hasQty:true,icon:"📦",type:"fixed"},
    {id:"cncp",name:"CN/CP",price:null,fixedMargin:2,hasQty:true,icon:"💳",type:"fixed"},
    {id:"new_cover",name:"New Cover",price:null,fixedMargin:8,hasQty:true,icon:"🔲",type:"fixed"},
    {id:"mem_pen",name:"Mem / Pen",price:null,fixedMargin:11,icon:"💾",type:"fixed"},
    {id:"orologio",name:"Orologio Cash",price:null,fixedMargin:25,icon:"⌚",type:"fixed"},
    {id:"miband",name:"Mi Band 6",price:null,fixedMargin:15,icon:"⌚",type:"fixed"},
    {id:"powerbank",name:"PowerBank",price:null,fixedMargin:8,icon:"🔋",type:"fixed"},
  ]},
  {cat:"🔧 Servizi",items:[
    {id:"assistenza",name:"Assistenza Tecnico",price:null,pctMargin:81.97,icon:"🔧",type:"pct"},
    {id:"backup",name:"Backup",price:null,pctMargin:81.97,icon:"💿",type:"pct"},
    {id:"riparazione",name:"Riparazione",price:null,pctMargin:24.59,needsModel:true,icon:"🔨",type:"pct"},
    {id:"vendita_usato",name:"Vendita Usato",price:null,pctMargin:13.00,needsModel:true,needsImei:true,icon:"♻️",type:"pct"},
    {id:"chiusura",name:"Chiusura Sim/Fisso",price:null,pctMargin:81.97,icon:"✂️",type:"pct"},
    {id:"etelefono",name:"E.Telefono",price:null,pctMargin:81.97,icon:"📞",type:"pct"},
    {id:"accessori",name:"Accessori",price:null,pctMargin:24.59,hasQty:true,icon:"🎧",type:"pct"},
    {id:"extra_acc",name:"Extra Acc. Compass",price:null,pctMargin:65.00,icon:"🧭",type:"pct"},
    {id:"tel_senior",name:"Telefoni Senior",price:null,pctMargin:12.30,needsModel:true,icon:"📱",type:"pct"},
    {id:"earbuds",name:"Ear Buds",price:null,pctMargin:40.98,icon:"🎵",type:"pct"},
    {id:"salva_scontrino",name:"Salva Scontrino",price:null,fixedMargin:3,icon:"🧾",type:"fixed"},
  ]},
  {cat:"🛡️ Kasko",items:[
    {id:"extra_kasko",name:"Extra Margine Kasko",price:null,pctMargin:40.00,icon:"🛡️",type:"pct"},
    {id:"plkasko",name:"PLKasko",price:null,pctMargin:60.00,icon:"🏷️",type:"pct"},
    {id:"kasko_sv",name:"Kasko SV",price:null,pctMargin:60.00,icon:"🔖",type:"pct"},
  ]},
  {cat:"📶 SIM",items:[
    {id:"family_ontop",name:"Family+ On Top",price:null,fixedMargin:10,icon:"👨‍👩‍👧",type:"fixed"},
    {id:"sim_w3",name:"Sim Wind3",price:null,fixedMargin:-5,linked:true,icon:"📶",type:"fixed"},
    {id:"sim_fw",name:"Sim Fastweb",price:0,fixedMargin:-23,linked:true,icon:"📶",type:"fixed"},
    {id:"sost_fw",name:"Sost Fastweb",price:0,fixedMargin:0,linked:true,icon:"🔄",type:"fixed"},
    {id:"sim_iliad",name:"Sim Iliad",price:0,fixedMargin:-10,linked:true,icon:"📶",type:"fixed"},
    {id:"sost_vod",name:"Sost Vodafone",price:0,fixedMargin:-10,linked:true,icon:"🔄",type:"fixed"},
    {id:"sost_w3",name:"Sost Wind3",price:0,fixedMargin:-15,linked:true,icon:"🔄",type:"fixed"},
    {id:"sim_very",name:"Sim Very",price:0,fixedMargin:-7,linked:true,icon:"📶",type:"fixed"},
    {id:"sost_very",name:"Sost Very",price:0,fixedMargin:-7,linked:true,icon:"🔄",type:"fixed"},
    {id:"sim_l",name:"Sim L",price:0,fixedMargin:-15,linked:true,icon:"📶",type:"fixed"},
    {id:"sim_next",name:"Sim Next",price:0,fixedMargin:-7,linked:true,icon:"📶",type:"fixed"},
    {id:"subentro",name:"Subentro/Reale Util.",price:0,fixedMargin:-10,linked:true,icon:"🔄",type:"fixed"},
  ]},
];

// ── MARGINALITÀ POS OVERLAY ──
const calcMargLabel=(selProd,price,qty)=>{
  if(!selProd)return"";
  const pVal=selProd.price!==null?selProd.price:parseFloat(price)||0;
  const mVal=selProd.type==="fixed"?(selProd.fixedMargin||0):selProd.type==="pct"?(pVal*(selProd.pctMargin||0)/100):0;
  const q=parseInt(qty)||1;
  const label=selProd.type==="pct"?`${selProd.pctMargin}% di €${pVal.toFixed(2)} = €${mVal.toFixed(2)}`:`€${mVal.toFixed(2)}`;
  return`${label}${q>1?` × ${q} = €${(mVal*q).toFixed(2)}`:""}`;
};
const MargPOS=memo(({show,onClose,venditore,negozio,onAdd,editItem})=>{
  const [selCat,setSelCat]=useState(0);
  const [selProd,setSelProd]=useState(null);
  const [price,setPrice]=useState("");
  const [qty,setQty]=useState("1");
  const [importo,setImporto]=useState("");
  const [model,setModel]=useState("");
  const [imei,setImei]=useState("");
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
        if(found.price===null)setPrice(String(editItem.price||""));
      }
    } else if(show&&!editItem){
      setSelProd(null);setPrice("");setQty("1");setImporto("");setModel("");setImei("");
    }
  },[show,editItem]);
  if(!show)return null;
  const handleAdd=()=>{
    if(!selProd)return;
    const p=selProd;
    const pVal=p.price!==null?p.price:parseFloat(price)||0;
    const mVal=p.type==="fixed"?(p.fixedMargin||0):p.type==="pct"?(pVal*(p.pctMargin||0)/100):0;
    onAdd({product:p.name,productId:p.id,price:pVal,qty:parseInt(qty)||1,importo:parseFloat(importo)||null,margin:mVal,totalMargin:mVal*(parseInt(qty)||1),model:model||null,imei:imei||null,venditore,negozio,date:new Date().toISOString().split("T")[0],linked:p.linked||false});
    setSelProd(null);setPrice("");setQty("1");setImporto("");setModel("");setImei("");
  };
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(4px)"}}>
    <style>{`@keyframes margSlideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    <div style={{background:"rgba(255,255,255,0.02)",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:640,maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 -4px 30px rgba(0,0,0,.2)",animation:"margSlideUp 0.32s cubic-bezier(0.22,1,0.36,1)"}}>
      <div style={{padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.08)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontSize:16,fontWeight:800,color:"#f8fafc"}}>📦 Registra Prodotto</div><div style={{fontSize:11,color:"#64748b"}}>{venditore||"—"} • {negozio||"—"} • {new Date().toLocaleDateString("it-IT")}</div></div>
        <button onClick={onClose} style={{padding:"6px 14px",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.02)",color:"#8892b0",fontSize:12,fontWeight:600,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{display:"flex",gap:4,padding:"10px 16px",overflowX:"auto",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
        {MARG_PRODUCTS.map((cat,ci)=>(<button key={ci} onClick={()=>{setSelCat(ci);setSelProd(null)}} style={{padding:"6px 14px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",border:selCat===ci?"2px solid #6f42c1":"1px solid rgba(255,255,255,0.1)",background:selCat===ci?"rgba(111,66,193,0.15)":"rgba(255,255,255,0.03)",color:selCat===ci?"#c084fc":"#94a3b8"}}>{cat.cat}</button>))}
      </div>
      <div style={{flex:1,overflow:"auto",padding:16}}>
        {!selProd?(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8}}>
          {MARG_PRODUCTS[selCat].items.map(p=>(<button key={p.id} onClick={()=>{setSelProd(p);if(p.price!==null)setPrice(String(p.price))}} style={{padding:"14px 8px",borderRadius:12,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.03)",cursor:"pointer",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <span style={{fontSize:22}}>{p.icon}</span>
            <span style={{fontSize:10,fontWeight:600,color:"#f8fafc",lineHeight:1.2}}>{p.name}</span>
          </button>))}
        </div>):(<div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <button onClick={()=>setSelProd(null)} style={{background:"none",border:"none",color:"#6f42c1",fontSize:13,cursor:"pointer",fontWeight:600}}>← Indietro</button>
            <span style={{fontSize:22}}>{selProd.icon}</span>
            <span style={{fontSize:16,fontWeight:800,color:"#f8fafc"}}>{selProd.name}</span>
          </div>
          {selProd.hasQty&&<div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Quantità</div>
            <input value={qty} onChange={e=>setQty(e.target.value)} type="number" min="1" className="glass-input" style={{width:"100%",padding:"10px 14px",borderRadius:10,fontSize:14,fontWeight:700,boxSizing:"border-box"}}/></div>}
          {selProd.needsModel&&<div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Modello</div><input value={model} onChange={e=>setModel(e.target.value)} placeholder="es. iPhone 15..." className="glass-input" style={{width:"100%",padding:"10px 14px",borderRadius:10,fontSize:13,boxSizing:"border-box"}}/></div>}
          {selProd.needsImei&&<div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>IMEI</div><input value={imei} onChange={e=>setImei(e.target.value)} placeholder="15 cifre" className="glass-input" style={{width:"100%",padding:"10px 14px",borderRadius:10,fontSize:13,boxSizing:"border-box",fontFamily:"monospace"}}/></div>}
          <div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Importo €</div>
            <input value={importo} onChange={e=>setImporto(e.target.value)} type="number" min="0" step="0.01" placeholder="es. 29.90" className="glass-input" style={{width:"100%",padding:"10px 14px",borderRadius:10,fontSize:14,fontWeight:700,boxSizing:"border-box"}}/></div>
          <button onClick={handleAdd} style={{width:"100%",padding:14,borderRadius:12,border:"none",background:"linear-gradient(135deg,#6f42c1,#9b59b6)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>✅ Registra {selProd.name}</button>
        </div>)}
      </div>
    </div>
  </div>);
});

const MargList=memo(({items,onRemove,show,onClose})=>{
  if(!show)return null;
  const total=items.reduce((s,i)=>s+i.totalMargin,0);
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
    <div style={{background:"rgba(255,255,255,0.02)",borderRadius:16,width:"100%",maxWidth:500,maxHeight:"80vh",overflow:"auto",padding:20,boxShadow:"0 8px 30px rgba(0,0,0,.2)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <span style={{fontSize:16,fontWeight:800,color:"#f8fafc"}}>📦 Prodotti ({items.length})</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:16}}>✕</button>
      </div>
      {items.length===0?<div style={{textAlign:"center",padding:20,color:"#64748b"}}>Nessun prodotto</div>:items.map((it,i)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
          <div><div style={{fontSize:12,fontWeight:600,color:"#f8fafc"}}>{it.product} {it.qty>1&&`×${it.qty}`}</div><div style={{fontSize:10,color:"#64748b"}}>{it.model||""}</div></div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={()=>onRemove(i)} style={{background:"none",border:"none",color:"#dc3545",cursor:"pointer",fontSize:11}}>✕</button>
          </div>
        </div>
      ))}
      {items.length>0&&<div style={{marginTop:12,padding:12,background:"rgba(255,255,255,0.04)",borderRadius:10,display:"flex",justifyContent:"space-between"}}>
        <span style={{fontWeight:700}}>Totale prodotti</span>
        <span style={{fontWeight:900,fontSize:18,color:"#6f42c1"}}>{items.length}</span>
      </div>}
    </div>
  </div>);
});


const BRANDS = [
  { id: "windtre", label: "WindTre", short: "W3", color: "#FF6B00", gradient: "linear-gradient(135deg, #1B3A5C 0%, #2E75B6 100%)", icon: "📶", logo: "/windtre.webp", desc: "Mobile, Fisso, Luce & Gas, Assicurazioni, Protecta", ready: true },
  { id: "sky", label: "Sky", short: "SKY", color: "#0072C6", gradient: "linear-gradient(135deg, #003366 0%, #0072C6 100%)", icon: "📺", logo: "/sky.png", desc: "TV, Fibra, Mobile, Glass, Pacchetti combinati", ready: true },
  { id: "vodafone", label: "Vodafone", short: "VF", color: "#E60000", gradient: "linear-gradient(135deg, #990000 0%, #E60000 100%)", icon: "📱", logo: "/vodaphone - Copy.png", desc: "Mobile, Fisso, Multi-Servizi", ready: true },
  { id: "fastweb", label: "Fastweb", short: "FW", color: "#CC9900", gradient: "linear-gradient(135deg, #CC9900 0%, #FFD800 100%)", icon: "⚡", logo: "/fastweb.png", desc: "Mobile, Fisso, Energy", ready: true },
  { id: "iliad", label: "Iliad", short: "IL", color: "#C00028", gradient: "linear-gradient(135deg, #800018 0%, #C00028 100%)", icon: "📡", logo: "/iliad.png", desc: "Mobile e Fisso (Fibra)", ready: true },
  { id: "energy", label: "Energy", short: "EN", color: "#28a745", gradient: "linear-gradient(135deg, #1a6b2d 0%, #28a745 100%)", icon: "🔋", logo: "/energy - Copy.png", desc: "Forniture Luce e Gas (S4, Barton)", ready: true },
];
const codiciW3 = ["Magliana","Libia","San Paolo","Mazzini","Donna","Promontori","Collatina"];
const venditori = ["Alberto","Alex","Alin","Asad","Ben Aziza","Cristhian","Cristi","Damiano","Daniel","Daniele2","Denise","Dimitri","Eloise","Eros","Fadel","Federico","Francesca","Francesco","George","Giacomo","Gian","Giulia","Giuseppe B.","Ilaria","Lorenzo","Manu","Marta","Marta2","Marta3","Matteo","Michele","Riccardo","Roberto","Samantha","Sheekell","Tommaso","Veronica"];
const negozi = ["Magliana","Donna","Libia","Collatina","Mazzini","San Paolo","Garbatella","Promontori","Acilia","Baleniere","Castani","Merulana","Telefonico"];
const opProv = ["WindTre","Vodafone","Tim","Fastweb","Iliad","Enel","Eni","A2A","Edison","Hera","Sorgenia","Plenitude","Altro"];
const brandMNP = ["TIM","Vodafone","WindTre","Iliad","Fastweb Mobile","PosteMobile","ho. Mobile","Kena Mobile","Very Mobile","CoopVoce","Spusu","Lyca Mobile","1Mobile","Tiscali Mobile","Digi Mobil","Noitel","Optima Mobile","Feder Mobile","Rabona Mobile","Elimobile","BT Italia","Segnoverde Mobile","Uno Mobile","Saily","Visitel","Ops! Mobile"];
const SKY_P = { privato: ["TV","TV 14,90","Sky Glass","Fibra","3P","4P","Sky Mobile"], business: ["Sky TV Uffici","Sky Fibra P.IVA"] };
const SKY_TV = ["TV","TV 14,90","Sky Glass"];
const SKY_FIBRA = ["Fibra","3P","4P"];
const SKY_BRAND_FIBRA = ["TIM","Vodafone","Fastweb","WINDTRE","Tiscali","Sky","BT Enia","Ehiweb","Open Fiber","Infratel","Vianova","Isiline","Convergenze","Full Telecom","Optima","Fibra.tn"];
const emS = () => ({active:true,fields:{},contract:{},gnp:false,gnpNum:"",gnpOp:"",secondaLinea:false,gnp2L:null,gnp2LBrand:"",gnp2LNum:"",domiciliazione:false,opProvenienza:"",codiceOverride:"",addons:{},domiciliato:null,convergente:null,tipMob:null,mnp:null,easyPay:null,tnpGa:null,tnpTipo:"",tnpModello:"",tnpImei:"",tnpCount:null,tnpModelli:[],tnpImeis:[],packAccessori:null,packAccessoriVal:"",packAccessoriQta:"",cbTnp:false,cbTnpTipo:"",cbTnpModello:"",cbTnpImei:"",cbTnpCount:null,cbTnpModelli:[],cbTnpImeis:[],cbPackAccessori:null,cbPackAccessoriVal:"",cbPackAccessoriQta:"",cbTnpCell:"",cbTnpCC:"",cbTnpCodIns:"",cbTnpReload:null,cbTnpReloadSel:{},cbCambio:false,cbCambioVal:"",cbCambioCell:"",cbCambioCC:"",cbCambioCodIns:"",cbAddonSel:{},rfModello:"",rfImei:"",cbRf:false,cbAddonCodIns:"",cbRfCodIns:"",tnpGaReload:null,tnpGaReloadSel:{},reloadForever:null,securitySel:{},voceCasaCb:null,vfOffers:{},vfContratti:{},vfOffer:null,vfMnp:null,vfMnpBrand:"",vfMnpNum:"",vfDomicilio:null,vfConvergenza:null,vfNumFisso:"",vfTnp:null,vfTnpList:[],dcNumProv:"",dcNum:"",dcIccid:"",dcCodIns:"",dcRicaricaAuto:null,vfSecurity:null,cbTnp2:false,cbCellulare:"",cbCodContratto:"",cbCodIns2:"",cbTaglia:null,dcCbNumProv:"",dcCbIccid:"",cbCambio2:false,cbCambioCell:"",cbCambioNumMod:"",cbCambioCodIns2:"",cbSecurity:false,cbSecurityCell:"",vfFLockIn:null,vfFConvergenza:null,vfFGnp:null,vfFGnpBrand:"",vfFGnpNum:"",vfFAddons:{},vfFCodIns:"",vfFNumProvVisorio:"",vfFNumDef:"",vfbOffer:null,vfbMnp:null,vfbMnpBrand:"",vfbMnpNum:"",vfbTnp:null,vfbModello:"",vfbImei:"",vfbRataPiva:null,vfbCodIns:"",vfbCbOn:false,vfbCbCodIns:"",vfbFGnp:null,vfbFGnpBrand:"",vfbFGnpNum:"",vfbFCodIns:"",vfbFNumProv:"",vfbFNumDef:"",vfbFMnp:null,vfbFMnpBrand:"",vfbFMnpNum:"",vfbFCombNumProv:"",vfbFCombIccid:"",vfbNum:"",vfbIccid:"",vfbFIccid:"",vfSolDigCodIns:"",fwOffer:null,fwMnpBrand:"",fwMnpNum:"",fwModello:"",fwImei:"",fwCodIns:"",fwNumProv:"",fwNumDef:"",fwIccid:"",fwFGnp:null,fwFGnpBrand:"",fwFGnpNum:"",fwFCodIns:"",fwFNumProv:"",fwFNumDef:"",fwPod:"",ilOffer:null,ilMnp:null,ilMnpBrand:"",ilMnpNum:"",ilCodIns:"",ilNumProv:"",ilNumDef:"",ilIccid:"",ilFGnp:null,ilFCodIns:"",ilFNumProv:"",ilFNumDef:"",enCodIns:"",enPod:"",enPdr:""});

const SMARTPHONES = ["Samsung Galaxy S25 Ultra","Samsung Galaxy S25+","Samsung Galaxy S25","Samsung Galaxy S24 FE","Samsung Galaxy A56","Samsung Galaxy A36","Samsung Galaxy A16","iPhone 16 Pro Max","iPhone 16 Pro","iPhone 16 Plus","iPhone 16","iPhone 15","iPhone SE 4","Xiaomi 15 Ultra","Xiaomi 15 Pro","Xiaomi 15","Xiaomi 14T Pro","Xiaomi Redmi Note 14 Pro+","Xiaomi Redmi Note 14 Pro","Xiaomi Redmi Note 14","OPPO Find X8 Pro","OPPO Reno 12 Pro","OPPO A80","Google Pixel 9 Pro","Google Pixel 9","Google Pixel 8a","Motorola Edge 50 Ultra","Motorola Edge 50 Pro","Motorola Moto G85","Honor Magic 7 Pro","Honor 200 Pro","Nothing Phone (2a)","Realme GT 7 Pro"];

const getW3 = (tc) => {
  const biz = tc === "business";
  return [
    { id:"mobile", title:"MOBILE", icon:"📱", color:"#2E75B6", radio:true, subs:[
      { id:"ga", title:"MOBILE", hasContract:true, ct:"ga",
        isMobile: !biz,
        isMobileBiz: biz,
        bizOffers: biz ? ["FWA Indoor PIVA","Professional Full","Professional Staff","Professional Special","Professional Flexy/Sim Dati","Professional World"] : null,
        mobOffers: biz ? null : {
          "Underground_Sì": ["EP LOCAL 4,99","EP LOCAL 5,99","EP LOCAL 6,99","EP LOCAL 7,99","EP LOCAL 8,99","EP LOCAL 9,99","EP LOCAL 10,99"],
          "Underground_No": ["RIC LOCAL 4,99","RIC LOCAL 5,99","RIC LOCAL 6,99","RIC LOCAL 7,99","RIC LOCAL 8,99","RIC LOCAL 9,99","RIC LOCAL 10,99"],
          "Mass Market_Sì": ["SPECIAL 5G","START UNLIMITED 5G","UNLIMITED 5G","UNLIMITED PRO 5G","UNLIMITED 5G SUPER FIBRA","FAMILY UNLIMITED 200","MULTISERVICE","SUPER 5G UNDER 14 6.99","SUPER 5G UNDER 14 9.99","CYC UNLIMITED PLUS","CYC UNLIMITED SUPER","CYC UNLIMITED ULTRA","CYC UNLIMITED FULL","CYC UNLIMITED MARTISOR","CYC UNLIMITED RAMADAM","PACK 5G RELOAD EXCHANGE","GIGA SPECIAL","FWA INDOOR"],
          "Mass Market_No": ["SPECIAL 5G","START UNLIMITED 5G","UNLIMITED 5G","UNLIMITED PRO 5G","UNLIMITED 5G SUPER FIBRA","FAMILY UNLIMITED 200","MULTISERVICE","SUPER 5G UNDER 14 6.99","SUPER 5G UNDER 14 9.99","CYC UNLIMITED PLUS","CYC UNLIMITED SUPER","CYC UNLIMITED ULTRA","CYC UNLIMITED FULL","CYC UNLIMITED MARTISOR","CYC UNLIMITED RAMADAM","PACK 5G RELOAD EXCHANGE","GIGA 150 5G","GIGA 250 5G","GIGA UNLIMITED 5G","GIGA START&STOP","SMART SECURITY"],
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
    ]},
    { id:"fisso", title:"FISSO", icon:"🏠", color:"#28a745", radio:true, subs:[
      { id:"fisso_std", title:"FISSO", hasContract:true, ct:"fisso", isFisso:true, hasGnpQ:true, has2LQ:biz, hasAddons:true, addonList:biz?["Più Sicuri Ufficio","FTTH","DNS DINAMICO","FritzBox"]:["Netflix","Home Protect","FTTH","Chiamate Illimitate","CYC HOME"], fields:[]},
      { id:"fisso_cb", title:"FISSO CB", hasContract:true, ct:"fisso", isFisso:true, hasGnpQ:true, has2LQ:biz, hasVoceCasaQ:!biz, hasAddons:true, addonList:biz?["Più Sicuri Ufficio","FTTH","DNS DINAMICO","FritzBox"]:["Netflix","Home Protect","FTTH","Chiamate Illimitate","CYC HOME"], fields:[]},
      { id:"fwa_indoor", title:"FWA INDOOR 2P", hasContract:true, ct:"fisso", isFisso:true, hasGnpQ:true, has2LQ:biz, hasAddons:true, hasFwaImei:true, domLocked:true, addonList:biz?["Più Sicuri Ufficio","FTTH","DNS DINAMICO","FritzBox"]:["Netflix","Home Protect","FTTH","Chiamate Illimitate","CYC HOME"], fields:[]},
      { id:"fwa_outdoor", title:"FWA OUTDOOR", hasContract:true, ct:"fisso", isFisso:true, hasGnpQ:true, has2LQ:biz, hasAddons:true, domLocked:true, addonList:biz?["Più Sicuri Ufficio","FTTH","DNS DINAMICO","FritzBox"]:["Netflix","Home Protect","FTTH","Chiamate Illimitate","CYC HOME"], fields:[]},
      ...(!biz?[{ id:"voce_casa", title:"VOCE CASA", hasContract:true, ct:"fisso", isFisso:true, isVoceCasa:true, hasGnpQ:true, has2LQ:false, fields:[]}]:[]),
    ]},
    { id:"luce_gas", title:"LUCE E GAS", icon:"💡", color:"#fd7e14", radio:true, subs:[
      { id:"luce", title:"Luce", hasContract:true, ct:"lg", hasDom:true, hasConvLG:true, fields:[]},
      { id:"gas", title:"Gas", hasContract:true, ct:"lg", hasDom:true, hasConvLG:true, fields:[]},
    ]},
    { id:"multi", title:"MULTI-SERVIZI", icon:"🛡️", color:"#6f42c1", radio:true, subs:[
      ...(!biz?[{id:"assicurazioni",title:"Assicurazioni",hasAddons:true,hasContract:true,ct:"multi",addonList:["Casa Start","Casa Plus","Casa Full","Sport","Micio e Fido","Viaggi","Sport Famiglia","Elettrodomestici"],fields:[]}]:[]),
      ...(biz?[{id:"assicurazioni",title:"Assicurazioni",isAssicBiz:true,hasContract:true,ct:"multi",fields:[]}]:[]),
      { id:"protecta", title:"Protecta", isProtecta:true, isBizProtecta:biz, hasContract:true, ct:"multi", fields:[]},
    ]},
  ];
};

const getVF = (tc) => {
  const biz = tc === "business";
  return [
    { id:"mobile", title:"MOBILE", icon:"📱", color:"#E60000", radio:true, subs:[
      { id:"ga", title:biz?"MOBILE":"MOBILE GA", hasContract:true, ct:"ga",
        isVFMobile: !biz,
        isVFBizMobile: biz,
        vfBizOffers: biz ? ["MOBILE SMART","MOBILE COMFORT","MOBILE EXTRA","DATI SMART","DATI COMFORT","RED DATA NOW"] : null,
        vfBizOffersTablet: biz ? ["DATI SMART","DATI COMFORT","RED DATA NOW"] : null,
        vfOffers: !biz ? ["MOBILE START","MOBILE PRO","MOBILE POWER","MOBILE ULTRA","MOBILE START UNDER 18","C'ALL POWER EDITION","C'ALL MAX","C'ALL POWER PRO","DOLCE VITA","DOLCE VITA+"] : null,
        fields: []
      },
      ...(!biz?[{ id:"cb", title:"CB", isCBVF:true, fields:[]}]:[]),
      ...(biz?[{ id:"cb", title:"CB", isCBVFBiz:true, fields:[]}]:[]),
    ]},
    { id:"fisso", title:"FISSO", icon:"🏠", color:"#28a745", radio:true, subs:[
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
    ...(biz?[{ id:"sol_dig", title:"SOLUZIONI DIGITALI", icon:"💼", color:"#6f42c1", radio:false, subs:[
      { id:"backup_facile", title:"BACKUP FACILE", isVFSolDig:true, hasContract:true, ct:"multi", fields:[]},
      { id:"worry_free", title:"WORRY FREE ADVANCED", isVFSolDig:true, hasContract:true, ct:"multi", fields:[]},
      { id:"secure_drive", title:"SECURE DRIVE", isVFSolDig:true, hasContract:true, ct:"multi", fields:[]},
      { id:"fastweb_ai_ess", title:"FASTWEB AI WORK ESSENTIAL", isVFSolDig:true, hasContract:true, ct:"multi", fields:[]},
      { id:"fastweb_ai_std", title:"FASTWEB AI WORK STANDARD", isVFSolDig:true, hasContract:true, ct:"multi", fields:[]},
    ]}]:[]),
    { id:"multi", title:"MULTI-SERVIZI", icon:"🛡️", color:"#6f42c1", radio:true, subs:[
      { id:"verisure", title:"Verisure", isVerisure:true, hasContract:true, ct:"multi", fields:[]},
      { id:"kasko_facile", title:"Kasko Facile", isKaskoFacile:true, hasContract:true, ct:"multi", fields:[]},
      { id:"vf_care", title:"Vodafone Care", isVFCare:true, hasContract:true, ct:"multi", fields:[]},
    ]},
  ];
};


// ── Small components (no return keyword needed with arrow implicit) ──────

const YN = ({val,onCh,label}) => (
  <div style={{marginTop:8,padding:10,background:"rgba(255,255,255,0.03)",borderRadius:8,border:"1px solid rgba(255,255,255,0.08)"}}>
    <div style={{fontSize:12,fontWeight:700,color:"#f8fafc",marginBottom:6}}>{label}</div>
    <div style={{display:"flex",gap:8}}>
      <button onClick={()=>onCh(true)} style={{padding:"6px 20px",borderRadius:6,border:val===true?"2px solid #28a745":"1px solid rgba(255,255,255,0.12)",background:val===true?"rgba(40,167,69,0.15)":"rgba(255,255,255,0.03)",color:val===true?"#4ade80":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>Sì</button>
      <button onClick={()=>onCh(false)} style={{padding:"6px 20px",borderRadius:6,border:val===false?"2px solid #dc3545":"1px solid rgba(255,255,255,0.12)",background:val===false?"rgba(220,53,69,0.15)":"rgba(255,255,255,0.03)",color:val===false?"#f87171":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>No</button>
    </div>
  </div>
);

const TF = ({l,r,v,o,p,pf,dis,nt}) => (
  <div className="space-y-1.5">
    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">{l} {r&&<span className="text-rose-400">*</span>}</label>
    <input value={v||""} onChange={e=>o&&o(e.target.value)} placeholder={p} disabled={dis} readOnly={dis}
      className={`glass-input w-full text-sm rounded-xl py-3 ${dis?"border-cyan-500/30 bg-cyan-500/5 text-cyan-300 italic":pf?"border-emerald-500/30 bg-emerald-500/5 text-emerald-300":""}`} />
    {nt&&<span className={`text-[10px] ${dis?"text-cyan-400":"text-slate-600"}`}>{nt}</span>}
  </div>
);

const DD = ({l,r,v,o,vals,nt}) => (
  <div className="space-y-1.5">
    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">{l} {r&&<span className="text-rose-400">*</span>}</label>
    <select value={v||""} onChange={e=>o&&o(e.target.value)} className="glass-input w-full text-sm rounded-xl py-3">
      <option value="">— Seleziona —</option>
      {vals.map(x=><option key={x} value={x}>{x}</option>)}
    </select>
    {nt&&<span className="text-[10px] text-slate-600">{nt}</span>}
  </div>
);

const SCd = ({session,codici,val,onCh}) => {
  const actual=val||session||"";
  const isOv=val&&val!==session;
  const content = (
    <div>
      <div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Codice <span style={{color:"#dc3545"}}>*</span></div>
      <select value={actual} onChange={e=>onCh(e.target.value)} className="glass-input" style={{width:"100%",padding:"7px 10px",borderRadius:6,fontSize:12,border:actual?"2px solid rgba(40,167,69,0.4)":"1px solid rgba(255,255,255,0.08)",background:actual&&!isOv?"rgba(40,167,69,0.08)":"rgba(15,23,42,0.6)",color:"#f8fafc"}}>
        <option value="">— Seleziona —</option>
        {codici.map(c=><option key={c} value={c}>{c}</option>)}
      </select>
      {actual&&!isOv&&<div style={{fontSize:10,color:"#28a745",marginTop:2}}>✓ Da codice inserimento</div>}
      {isOv&&<div style={{fontSize:10,color:"#fd7e14",marginTop:2}}>⚠ Modificato</div>}
    </div>
  );
  return content;
};

const CartItem = ({it,ii,gi,total,expI,setExpI}) => {
  const exp = expI[gi+"_"+ii];
  const dets = it.details ? Object.entries(it.details).filter(([k,v])=>v&&k!=="hasContract") : [];
  const content = (
    <div style={{borderBottom:ii<total-1?"1px solid rgba(255,255,255,0.06)":"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0"}}>
        <span style={{fontSize:14}}>{it.macroIcon}</span><span style={{fontSize:12,fontWeight:600,color:it.macroColor}}>{it.macro}</span><span style={{color:"#475569"}}>›</span><span style={{fontSize:12,color:"#f8fafc"}}>{it.sub}</span>
        {it.details&&it.details.hasContract&&<span style={{fontSize:9,fontWeight:600,color:"#fff",background:it.macroColor,padding:"1px 6px",borderRadius:4}}>CONTRATTO</span>}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:10,color:"#64748b"}}>V.#{it.saleNum}</span>
          <button onClick={()=>setExpI(p=>({...p,[gi+"_"+ii]:!p[gi+"_"+ii]}))} style={{background:exp?"rgba(46,117,182,0.1)":"rgba(255,255,255,0.03)",border:exp?"1px solid rgba(46,117,182,0.3)":"1px solid rgba(255,255,255,0.1)",borderRadius:5,padding:"3px 10px",fontSize:10,fontWeight:600,cursor:"pointer",color:exp?"#60a5fa":"#94a3b8"}}>{exp?"▲ Nascondi":"👁 Mostra"}</button>
        </div>
      </div>
      {exp&&<div style={{padding:"8px 12px 12px 32px"}}><div style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:12,border:"1px solid rgba(255,255,255,0.06)"}}><div style={{fontSize:11,fontWeight:700,color:it.macroColor,marginBottom:8}}>📋 {it.sub}</div>
        {dets.length>0?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 16px"}}>{dets.map(([k,v])=><div key={k}><span style={{fontSize:10,fontWeight:600,color:"#64748b",textTransform:"uppercase"}}>{k}</span><div style={{fontSize:12,color:"#f8fafc",marginTop:1}}>{String(v)}</div></div>)}</div>
        :<div style={{fontSize:12,color:"#64748b"}}>Nessun dettaglio — premi ✏️ Modifica</div>}
      </div></div>}
    </div>
  );
  return content;
};

// ── VF Mobile GA component ────────────────────────────────────────────────

const VF_C="#E60000";
const VF_LIGHT="rgba(230,0,0,0.06)";
const VF_BORDER="rgba(230,0,0,0.2)";
const VF_BRANDS=["TIM","Vodafone","WindTre","Iliad","Fastweb","Sky","Very Mobile","Ho Mobile","Postemobile","Coop Voce","Tiscali","Lyca Mobile","Altro"];
const VF_SMARTPHONES=["Samsung Galaxy S25","Samsung Galaxy S25+","Samsung Galaxy S25 Ultra","iPhone 16","iPhone 16 Plus","iPhone 16 Pro","iPhone 16 Pro Max","Google Pixel 9","Google Pixel 9 Pro","Xiaomi 14","Xiaomi 14 Ultra","OnePlus 13","Oppo Find X8 Pro","Altro"];
const VF_GNP_BRANDS=["TIM","Vodafone","WindTre","Fastweb","Tiscali","Altro"];
const VF_CODICI_NEGOZIO=["VF-RM001","VF-RM002","VF-RM003","VF-RM004","VF-RM005","VF-RM006","VF-RM007","VF-RM008","VF-RM009","VF-RM010"];
const FW_C = "#CC9900";
const FW_LIGHT = "rgba(204,153,0,0.06)";
const FW_BORDER = "rgba(204,153,0,0.2)";

const FW_MOBILE_OFFERS = [
  "Start","Start MNP","Start Tied","Start MNP Tied",
  "Ultra","Ultra MNP","Ultra Tied","Ultra Tied MNP",
  "Pro","Pro MNP","Pro Tied","Pro MNP Tied",
  "Power","Power MNP","Power Tied","Power MNP Tied"
];
const FW_FISSO_OFFERS = ["Start","Pro","Ultra"];
const FW_ENERGIA_OFFERS = ["Energy Flex","Energy Core"];
const FW_BRANDS_MNP = ["TIM","Vodafone","WindTre","Iliad","Fastweb","Sky","Very Mobile","Ho Mobile","Postemobile","Coop Voce","Tiscali","Lyca Mobile","Altro"];
const FW_SMARTPHONES = VF_SMARTPHONES;
const FW_CODICI_NEGOZIO = ["FW-RM001","FW-RM002","FW-RM003","FW-RM004","FW-RM005","FW-RM006","FW-RM007","FW-RM008","FW-RM009","FW-RM010"];
const FW_GNP_BRANDS = ["TIM","Vodafone","WindTre","Fastweb","Tiscali","Altro"];

const getFW = (tc) => {
  const biz = tc === "business";
  return [
    { id:"mobile", title:"MOBILE", icon:"📱", color:FW_C, radio:true, subs:[
      { id:"ga", title:"MOBILE", isFWMobile:true, hasContract:true, ct:"ga", fields:[] },
    ]},
    { id:"fisso", title:"FISSO", icon:"🏠", color:"#28a745", radio:true, subs:
      FW_FISSO_OFFERS.map(o=>({ id:o.toLowerCase().replace(/ /g,"_"), title:o, isFWFisso:true, hasContract:true, ct:"fisso", fields:[] }))
    },
    { id:"energia", title:"ENERGIA", icon:"🔋", color:"#28a745", radio:false, subs:
      FW_ENERGIA_OFFERS.map(o=>({ id:o.toLowerCase().replace(/ /g,"_"), title:o, isFWEnergia:true, hasContract:true, ct:"multi", fields:[] }))
    },
  ];
};

const FWMobile = ({sd, uP}) => {
  const upv=(k,v)=>uP(k,v);
  const hasMNP = sd.fwOffer && sd.fwOffer.includes("MNP");
  const content = (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Offerta Mobile</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {FW_MOBILE_OFFERS.map(offer=>{
          const isActive=sd.fwOffer===offer;
          return (
            <button key={offer} onClick={()=>{upv("fwOffer",isActive?null:offer);upv("fwMnpBrand","");upv("fwMnpNum","");upv("fwModello","");upv("fwImei","");upv("fwCodIns","");upv("fwNumProv","");upv("fwIccid","");}}
              style={{padding:"8px 14px",borderRadius:10,border:isActive?"2px solid "+FW_C:"1px solid rgba(255,255,255,0.12)",background:isActive?FW_C:"rgba(255,255,255,0.03)",color:isActive?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {offer}
            </button>
          );
        })}
      </div>
      {sd.fwOffer&&(
        <div>
          {hasMNP&&(
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase"}}>Portabilità (MNP)</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Operatore provenienza" r v={sd.fwMnpBrand||""} o={v=>upv("fwMnpBrand",v)} vals={FW_BRANDS_MNP}/>
                <TF l="Numero Portabilità" r v={sd.fwMnpNum||""} o={v=>upv("fwMnpNum",v)} p="3XXXXXXXXX"/>
              </div>
            </div>
          )}

          <div style={{background:"rgba(0,114,198,0.05)",border:"1px solid rgba(0,114,198,0.2)",borderRadius:8,padding:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
              <DD l="Codice Inserimento" r v={sd.fwCodIns||""} o={v=>upv("fwCodIns",v)} vals={FW_CODICI_NEGOZIO}/>
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

const FWFisso = ({sd, uP}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div>
      <RB label="GNP?" val={sd.fwFGnp} opts={["Sì","No"]} onCh={v=>{upv("fwFGnp",v);if(v==="No"){upv("fwFGnpBrand","");upv("fwFGnpNum","");}}}/>
      {sd.fwFGnp==="Sì"&&(
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:12,marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
            <DD l="Operatore GNP" r v={sd.fwFGnpBrand||""} o={v=>upv("fwFGnpBrand",v)} vals={FW_GNP_BRANDS}/>
            <TF l="Numero Fisso GNP" r v={sd.fwFGnpNum||""} o={v=>upv("fwFGnpNum",v)} p="06XXXXXXXX"/>
          </div>
        </div>
      )}
      {sd.fwFGnp&&(
        <div style={{background:"rgba(0,114,198,0.05)",border:"1px solid rgba(0,114,198,0.2)",borderRadius:8,padding:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:12,textTransform:"uppercase"}}>📋 Dati Contratto</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
            <DD l="Codice Inserimento" r v={sd.fwFCodIns||""} o={v=>upv("fwFCodIns",v)} vals={FW_CODICI_NEGOZIO}/>
            {sd.fwFGnp==="Sì"?(
              <TF l="N. Fisso Provvisorio" r v={sd.fwFNumProv||""} o={v=>upv("fwFNumProv",v)} p="06XXXXXXXX"/>
            ):(
              <TF l="N. Fisso Definitivo" r v={sd.fwFNumDef||""} o={v=>upv("fwFNumDef",v)} p="06XXXXXXXX"/>
            )}
            {sd.fwFGnp==="Sì"&&(
              <TF l="N. Fisso Definitivo" r v={sd.fwFNumDef||""} o={v=>upv("fwFNumDef",v)} p="06XXXXXXXX"/>
            )}
          </div>
        </div>
      )}
    </div>
  );
  return content;
};

const FWEnergia = ({sd, uP}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div style={{background:"rgba(0,114,198,0.05)",border:"1px solid rgba(0,114,198,0.2)",borderRadius:8,padding:14}}>
      <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
      <TF l="POD" r v={sd.fwPod||""} o={v=>upv("fwPod",v)} p="IT001E..."/>
    </div>
  );
  return content;
};


const VF_MOBILE_OFFERS=["MOBILE START","MOBILE PRO","MOBILE POWER","MOBILE ULTRA","MOBILE START UNDER 18","C'ALL POWER EDITION","C'ALL MAX","C'ALL POWER PRO","DOLCE VITA","DOLCE VITA+"];
const emTnpSlot=()=>({tipo:null,tnpCount:null,tnpItems:[],compassTipo:null,compassItems:[]});

const MiniC = ({label,val,opts,onCh,locked,lockVal}) => {
  const content = (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:10,fontWeight:700,color:"#64748b",marginBottom:4,textTransform:"uppercase",letterSpacing:.4}}>{label}</div>
      <div style={{display:"flex",gap:6}}>
        {opts.map(o=>{
          const isActive=locked?(o===(lockVal===true?"Sì":lockVal===false?"No":lockVal)):val===o||val===(o==="Sì"?true:o==="No"?false:o);
          return (
            <button key={o} onClick={()=>!locked&&onCh(val===o?null:o)} disabled={locked}
              style={{padding:"5px 16px",borderRadius:6,border:isActive?"2px solid #2E75B6":"1px solid rgba(255,255,255,0.12)",background:isActive?"#2E75B6":"rgba(255,255,255,0.03)",color:isActive?"#fff":"#94a3b8",fontSize:11,fontWeight:700,cursor:locked?"not-allowed":"pointer",opacity:locked?0.8:1}}>
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
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:6,textTransform:"uppercase",letterSpacing:.4}}>{label}</div>
      <div style={{display:"flex",gap:8}}>
        {opts.map(o=>(
          <button key={o} onClick={()=>onCh(val===o?null:o)}
            style={{padding:"7px 20px",borderRadius:8,border:val===o?"2px solid "+VF_C:"1px solid rgba(255,255,255,0.12)",background:val===o?VF_C:"rgba(255,255,255,0.03)",color:val===o?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>
            {o}
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
    <div style={{marginBottom:10,padding:10,background:"rgba(255,255,255,0.03)",borderRadius:8,border:"1px solid rgba(255,255,255,0.08)"}}>
      {modoRiga==="Entrambi"&&(
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          {["Bundle","Accessorio"].map(t=>(
            <button key={t} onClick={()=>onUpd("tipo",riga.tipo===t?null:t)}
              style={{padding:"4px 14px",borderRadius:6,border:riga.tipo===t?"2px solid "+VF_C:"1px solid rgba(255,255,255,0.12)",background:riga.tipo===t?VF_C:"rgba(255,255,255,0.03)",color:riga.tipo===t?"#fff":"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              {t}
            </button>
          ))}
        </div>
      )}
      {(modoRiga==="Bundle"||(modoRiga==="Entrambi"&&riga.tipo==="Bundle"))&&(
        <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
          <div style={{flex:2}}>
            <div style={{fontSize:10,fontWeight:600,color:"#64748b",marginBottom:2}}>Codice Bundle</div>
            <input value={riga.codice||""} onChange={e=>onUpd("codice",e.target.value)} placeholder="Codice..."
              className="glass-input w-full text-sm rounded-lg py-2"/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,fontWeight:600,color:"#64748b",marginBottom:2}}>Tipologia €</div>
            <select value={riga.tipoBundleVal||""} onChange={e=>onUpd("tipoBundleVal",e.target.value)}
              className="glass-input w-full text-sm rounded-lg py-2">
              <option value="">--</option>
              {BUNDLE_VALORI.map(v=><option key={v} value={v}>{v} €</option>)}
            </select>
          </div>
        </div>
      )}
      {(modoRiga==="Accessorio"||(modoRiga==="Entrambi"&&riga.tipo==="Accessorio"))&&(
        <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
          <div style={{flex:2}}>
            <div style={{fontSize:10,fontWeight:600,color:"#64748b",marginBottom:2}}>IMEI Accessorio</div>
            <input value={riga.imei2||""} onChange={e=>onUpd("imei2",e.target.value)} placeholder="IMEI..."
              className="glass-input w-full text-sm rounded-lg py-2 font-mono"/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,fontWeight:600,color:"#64748b",marginBottom:2}}>Valore €</div>
            <input value={riga.valore||""} onChange={e=>onUpd("valore",e.target.value)} placeholder="0.00"
              className="glass-input w-full text-sm rounded-lg py-2"/>
          </div>
        </div>
      )}
      {modoRiga==="Entrambi"&&!riga.tipo&&(
        <div style={{fontSize:11,color:"#bbb",fontStyle:"italic"}}>Seleziona Bundle o Accessorio</div>
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
    <div style={{marginTop:12,background:"rgba(255,255,255,0.02)",border:"1px solid "+VF_BORDER,borderRadius:8,padding:12}}>
      <div style={{fontSize:11,fontWeight:800,color:VF_C,marginBottom:10,textTransform:"uppercase"}}>Dati TNP</div>
      {items.map((item,i)=>{
        const bundleOn=item.bundleOn||false;
        const accessorioOn=item.accessorioOn||false;
        const modoRiga=bundleOn&&accessorioOn?"Entrambi":bundleOn?"Bundle":accessorioOn?"Accessorio":null;
        return (
          <div key={i} style={{marginBottom:i<items.length-1?16:0}}>
            {items.length>1&&<div style={{fontSize:10,fontWeight:700,color:"#64748b",marginBottom:6}}>Compass #{i+1}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px",marginBottom:8}}>
              <DD l="Modello terminale" v={item.modello||""} o={v=>updItem(i,"modello",v)} vals={VF_SMARTPHONES}/>
              <TF l="IMEI" v={item.imei||""} o={v=>updItem(i,"imei",v)} p="15 cifre" nt="Barcode 📷"/>
            </div>
            <div style={{marginBottom:10}}>
              <TF l="Codice pratica finanziamento" r v={item.codicePratica||""} o={v=>updItem(i,"codicePratica",v)} p="es. FIN-000123"/>
            </div>

            {/* Bundle / Accessori toggle */}
            <div style={{borderTop:"1px solid #f0e0e0",paddingTop:10,marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase"}}>Bundle / Accessori</div>
                <div style={{display:"flex",gap:6}}>
                  {["Bundle","Accessorio"].map(t=>{
                    const isOn=t==="Bundle"?bundleOn:accessorioOn;
                    return (
                      <button key={t} onClick={()=>toggleMode(i,t)}
                        style={{padding:"4px 14px",borderRadius:6,border:isOn?"2px solid "+VF_C:"1px solid rgba(255,255,255,0.12)",background:isOn?VF_C:"rgba(255,255,255,0.03)",color:isOn?"#fff":"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer"}}>
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
                        <button onClick={()=>removeRiga(i,ri)} style={{background:"none",border:"none",color:"#dc3545",cursor:"pointer",fontSize:13,padding:"14px 2px"}}>✕</button>
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
            <div style={{borderTop:"1px solid #f0e0e0",paddingTop:8}}>
              <button onClick={()=>updItem(i,"kasko",!item.kasko)}
                style={{padding:"5px 16px",borderRadius:7,border:item.kasko?"2px solid #6f42c1":"1px solid rgba(255,255,255,0.12)",background:item.kasko?"rgba(111,66,193,0.15)":"rgba(255,255,255,0.03)",color:item.kasko?"#c084fc":"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer"}}>
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
  const isCompass = COMPASS_OPTS.includes(slot.tipo);
  const set=(k,v)=>upSlot(idx,k,v);
  const setFn=(k,fn)=>upSlot(idx,"__fn__",prev=>({...prev,[k]:fn(prev[k])}));
  const allOpts = isWallet ? [...COMPASS_OPTS] : [...COMPASS_OPTS, ...TNP_TAGLIA_OPTS];
  const compassItems = (slot.compassItems&&slot.compassItems.length>0)?slot.compassItems:[emCompassItem()];
  const content = (
    <div style={{background:VF_LIGHT,border:"1px solid "+VF_BORDER,borderRadius:8,padding:14,marginBottom:12}}>
      {total>1&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:800,color:VF_C,textTransform:"uppercase"}}>TNP #{idx+1}</div>
          <button onClick={()=>onRemoveSlot(idx)} style={{background:"none",border:"1px solid #dc3545",borderRadius:6,padding:"2px 10px",color:"#dc3545",fontSize:10,cursor:"pointer",fontWeight:600}}>✕ Rimuovi</button>
        </div>
      )}
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase"}}>Tipologia dispositivo</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
        {allOpts.map(t=>{
          const isOn=slot.tipo===t;
          const initCompass=COMPASS_OPTS.includes(t)?[emCompassItem()]:[];
          return (
            <button key={t} onClick={()=>set("__replace__",isOn?emTnpSlot():{...emTnpSlot(),tipo:t,compassItems:initCompass})}
              style={{padding:"7px 14px",borderRadius:8,border:isOn?"2px solid "+VF_C:"1px solid rgba(255,255,255,0.12)",background:isOn?VF_C:"rgba(255,255,255,0.03)",color:isOn?"#fff":"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              {t}
            </button>
          );
        })}
      </div>

      {isTnpTaglia&&(
        <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid "+VF_BORDER,borderRadius:8,padding:12,marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase"}}>Dati TNP</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
            <DD l="Modello terminale" v={slot.modello||""} o={v=>set("modello",v)} vals={VF_SMARTPHONES_LIST}/>
            <TF l="IMEI" v={slot.imei||""} o={v=>set("imei",v)} p="15 cifre" nt="Barcode 📷"/>
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
              <div style={{fontSize:11,fontWeight:700,color:"#8892b0"}}>Aggiungi altra TNP?</div>
              <button onClick={onAddSlot}
                style={{padding:"5px 16px",borderRadius:7,border:"2px solid "+VF_C,background:"rgba(255,255,255,0.02)",color:VF_C,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                + Sì
              </button>
            </div>
          ):(
            idx===total-1&&total>=3&&(
              <div style={{fontSize:11,color:"#64748b",fontStyle:"italic"}}>Massimo 3 TNP per vendita</div>
            )
          )}
        </div>
      )}
    </div>
  );
  return content;
};

const VFMobileGA = ({sd,uP}) => {
  const upv=(k,v)=>uP(k,v);
  const isDV=sd.vfOffer==="DOLCE VITA"||sd.vfOffer==="DOLCE VITA+";

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
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Offerta Mobile</div>
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
              style={{padding:"8px 14px",borderRadius:10,border:isActive?"2px solid "+VF_C:"1px solid rgba(255,255,255,0.12)",background:isActive?VF_C:"rgba(255,255,255,0.03)",color:isActive?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {offer}
            </button>
          );
        })}
      </div>
      {sd.vfOffer&&(
        <div>
          {/* MNP — bloccato a No per DV/DV+ */}
          {isDV?(
            <div style={{marginBottom:12,padding:"8px 12px",background:"rgba(255,193,7,0.08)",border:"1px solid rgba(255,193,7,0.2)",borderRadius:8,fontSize:11,color:"#fbbf24"}}>
              MNP: <strong>No</strong> — non disponibile per {sd.vfOffer}
            </div>
          ):(
            <RB label="MNP?" val={sd.vfMnp} opts={["Sì","No"]} onCh={v=>{upv("vfMnp",v);if(v==="No"){upv("vfMnpBrand","");upv("vfMnpNum","")}}}/>
          )}
          {!isDV&&sd.vfMnp==="Sì"&&(
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Operatore provenienza" r v={sd.vfMnpBrand||""} o={v=>upv("vfMnpBrand",v)} vals={VF_BRANDS}/>
                <TF l="Numero Portabilità" r v={sd.vfMnpNum||""} o={v=>upv("vfMnpNum",v)} p="3XXXXXXXXX"/>
              </div>
            </div>
          )}
          {(sd.vfMnp||isDV)&&(
            <div>
              {/* Domiciliata — solo Wallet per DV/DV+ */}
              {isDV?(
                <div style={{marginBottom:12,padding:"8px 12px",background:"rgba(255,193,7,0.08)",border:"1px solid rgba(255,193,7,0.2)",borderRadius:8,fontSize:11,color:"#fbbf24"}}>
                  Domiciliata: <strong>Wallet</strong> — unica opzione per {sd.vfOffer}
                </div>
              ):(
                <RB label="Domiciliata?" val={sd.vfDomicilio} opts={["Smart","Wallet"]} onCh={v=>{upv("vfDomicilio",v);upv("vfTnpList",[]);upv("vfTnp",null);upv("vfConvergenza",null)}}/>
              )}
              {(sd.vfDomicilio||isDV)&&(
                <div>
                  {!isDV&&(
                    <div>
                      <RB label="Convergenza?" val={sd.vfConvergenza} opts={["Sì","No"]} onCh={v=>upv("vfConvergenza",v)}/>
                      {sd.vfConvergenza==="Sì"&&(
                        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:12,marginBottom:12}}>
                          <TF l="Numero Fisso Convergenza" v={sd.vfNumFisso||""} o={v=>upv("vfNumFisso",v)} p="06XXXXXXXX"/>
                        </div>
                      )}
                    </div>
                  )}
                  {(sd.vfConvergenza||isDV)&&(
                    <div>
                      {isDV?(
                        <div style={{marginBottom:12,padding:"8px 12px",background:"rgba(255,193,7,0.08)",border:"1px solid rgba(255,193,7,0.2)",borderRadius:8,fontSize:11,color:"#fbbf24"}}>
                          TNP: <strong>non disponibile</strong> per {sd.vfOffer}
                        </div>
                      ):(
                        <RB label="TNP?" val={sd.vfTnp} opts={["Sì","No"]} onCh={v=>{upv("vfTnp",v);if(v==="Sì"){upv("vfTnpList",[emTnpSlot()])}else{upv("vfTnpList",[])}}}/>
                      )}
                      {!isDV&&sd.vfTnp==="Sì"&&(
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
                      {sd.vfTnp&&!isDV&&sd.vfOffer!=="MOBILE START UNDER 18"&&(
                        <div style={{marginTop:12,background:VF_LIGHT,border:"1px solid "+VF_BORDER,borderRadius:8,padding:14}}>
                          <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:6,textTransform:"uppercase"}}>Security</div>
                          <div style={{display:"flex",gap:8}}>
                            {["Sì","No"].map(o=>(
                              <button key={o} onClick={()=>upv("vfSecurity",sd.vfSecurity===o?null:o)}
                                style={{padding:"7px 22px",borderRadius:8,border:sd.vfSecurity===o?"2px solid "+VF_C:"1px solid rgba(255,255,255,0.12)",background:sd.vfSecurity===o?VF_C:"rgba(255,255,255,0.03)",color:sd.vfSecurity===o?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                                {o}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Dati Contratto */}
                      {(sd.vfTnp||isDV)&&(
                        <div style={{marginTop:12,background:"rgba(0,114,198,0.05)",border:"1px solid rgba(0,114,198,0.2)",borderRadius:8,padding:14}}>
                          <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:12,textTransform:"uppercase"}}>📋 Dati Contratto</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
                            {sd.vfMnp==="Sì"?(
                              <TF l="Numero Provvisorio" r v={sd.dcNumProv||""} o={v=>upv("dcNumProv",v)} p="393XXXXXXX"/>
                            ):(
                              <TF l="Numero" r v={sd.dcNum||""} o={v=>upv("dcNum",v)} p="3XXXXXXXXX"/>
                            )}
                            <TF l="ICCID" r v={sd.dcIccid||""} o={v=>upv("dcIccid",v)} p="8939..." nt="Barcode 📷"/>
                            <DD l="Codice Inserimento" r v={sd.dcCodIns||""} o={v=>upv("dcCodIns",v)} vals={VF_CODICI_NEGOZIO}/>
                            {sd.vfDomicilio==="Smart"&&(
                              <div>
                                <div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Ricarica Automatica <span style={{color:"#dc3545"}}>*</span></div>
                                <div style={{display:"flex",gap:8}}>
                                  {["Sì","No"].map(o=>(
                                    <button key={o} onClick={()=>upv("dcRicaricaAuto",sd.dcRicaricaAuto===o?null:o)}
                                      style={{padding:"6px 18px",borderRadius:8,border:sd.dcRicaricaAuto===o?"2px solid "+VF_C:"1px solid rgba(255,255,255,0.12)",background:sd.dcRicaricaAuto===o?VF_C:"rgba(255,255,255,0.03)",color:sd.dcRicaricaAuto===o?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>
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
const VF_CODICI_NEGOZIO_FISSO = VF_CODICI_NEGOZIO;

const VFMobileGAFisso = ({sd,uP}) => {
  const upv=(k,v)=>uP(k,v);
  const toggleAddon=(name)=>{const cur=sd.vfFAddons||{};upv("vfFAddons",{...cur,[name]:!cur[name]})};
  const content = (
    <div>
      {/* Lock In */}
      <RB label="Lock In?" val={sd.vfFLockIn} opts={["Sì","No"]} onCh={v=>{upv("vfFLockIn",v);upv("vfFConvergenza",null);upv("vfFGnp",null);upv("vfFGnpBrand","");upv("vfFGnpNum","");upv("vfFAddons",{});upv("vfFCodIns","");upv("vfFNumProv","");upv("vfFNumDef","");upv("vfFNumProvVisorio","")}}/>

      {/* Convergenza — appare dopo Lock In */}
      {sd.vfFLockIn&&(
        <div>
          <RB label="Convergenza?" val={sd.vfFConvergenza} opts={["Sì","No"]} onCh={v=>{upv("vfFConvergenza",v);upv("vfFGnp",null);upv("vfFGnpBrand","");upv("vfFGnpNum","");upv("vfFAddons",{});upv("vfFCodIns","");upv("vfFNumProv","");upv("vfFNumDef","");upv("vfFNumProvVisorio","")}}/>

          {/* GNP — appare dopo Convergenza */}
          {sd.vfFConvergenza&&(
            <div>
              <RB label="GNP?" val={sd.vfFGnp} opts={["Sì","No"]} onCh={v=>{upv("vfFGnp",v);upv("vfFGnpBrand","");upv("vfFGnpNum","");upv("vfFAddons",{});upv("vfFCodIns","");upv("vfFNumProv","");upv("vfFNumDef","");upv("vfFNumProvVisorio","")}}/>

              {/* Add-on Fisso — appare dopo GNP */}
              {sd.vfFGnp&&(
                <div>
                  <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:12,marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:8,textTransform:"uppercase"}}>Add-on Fisso</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {VF_ADDON_FISSO.map(a=>{
                        const on=(sd.vfFAddons||{})[a];
                        return (
                          <button key={a} onClick={()=>toggleAddon(a)}
                            style={{padding:"5px 14px",borderRadius:6,border:on?"2px solid #28a745":"1px solid rgba(255,255,255,0.12)",background:on?"rgba(40,167,69,0.15)":"rgba(255,255,255,0.03)",color:on?"#4ade80":"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                            <span>{on?"☑":"☐"}</span>{a}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dati Contratto */}
                  <div style={{background:"rgba(0,114,198,0.05)",border:"1px solid rgba(0,114,198,0.2)",borderRadius:8,padding:14}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:12,textTransform:"uppercase"}}>📋 Dati Contratto</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
                      <DD l="Codice Inserimento" r v={sd.vfFCodIns||""} o={v=>upv("vfFCodIns",v)} vals={VF_CODICI_NEGOZIO_FISSO}/>
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

const VFCB = ({sd, uP}) => {
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
      {/* ── TNP CB ── */}
      <div style={{marginBottom:10}}>
        <button onClick={()=>{upv("cbTnp",!sd.cbTnp);if(!sd.cbTnp)upv("cbTnpList",[emTnpSlot()]);else upv("cbTnpList",[]);}}
          style={{padding:"8px 20px",borderRadius:8,border:sd.cbTnp?"2px solid "+VF_C:"1px solid rgba(255,255,255,0.12)",background:sd.cbTnp?VF_C:"rgba(255,255,255,0.03)",color:sd.cbTnp?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>
          TNP CB
        </button>
      </div>
      {sd.cbTnp&&(
        <div style={{marginBottom:12}}>
          <div style={{background:VF_LIGHT,border:"1px solid "+VF_BORDER,borderRadius:8,padding:14,marginBottom:10}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px",marginBottom:10}}>
              <TF l="Cellulare cliente" r v={sd.cbCellulare||""} o={v=>{upv("cbCellulare",v);if(!sd.cbCambioCell)upv("cbCambioCell",v)}} p="3XXXXXXXXX"/>
              <TF l="Codice Contratto" r v={sd.cbCodContratto||""} o={v=>upv("cbCodContratto",v)} p="es. 167942"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px",marginBottom:10}}>
              <DD l="Modello terminale" r v={sd.cbModello||""} o={v=>upv("cbModello",v)} vals={VF_SMARTPHONES}/>
              <TF l="IMEI" r v={sd.cbImei||""} o={v=>upv("cbImei",v)} p="15 cifre" nt="Barcode 📷"/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:6,textTransform:"uppercase"}}>Taglia</div>
              <div style={{display:"flex",gap:8}}>
                {["TNP XS-S","TNP M-L"].map(t=>(
                  <button key={t} onClick={()=>upv("cbTaglia",sd.cbTaglia===t?null:t)}
                    style={{padding:"5px 16px",borderRadius:7,border:sd.cbTaglia===t?"2px solid "+VF_C:"1px solid rgba(255,255,255,0.12)",background:sd.cbTaglia===t?VF_C:"rgba(255,255,255,0.03)",color:sd.cbTaglia===t?"#fff":"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <DD l="Codice Inserimento" r v={sd.cbCodIns2||""} o={v=>upv("cbCodIns2",v)} vals={VF_CODICI_NEGOZIO}/>
            <div style={{marginTop:12,background:"rgba(0,114,198,0.05)",border:"1px solid rgba(0,114,198,0.2)",borderRadius:8,padding:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
                <TF l="Numero Provvisorio" r v={sd.dcCbNumProv||""} o={v=>upv("dcCbNumProv",v)} p="393XXXXXXX"/>
                <TF l="ICCID" r v={sd.dcCbIccid||""} o={v=>upv("dcCbIccid",v)} p="8939..." nt="Barcode 📷"/>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Cambio Offerta ── */}
      <div style={{marginBottom:10}}>
        <button onClick={()=>upv("cbCambio2",!sd.cbCambio2)}
          style={{padding:"8px 20px",borderRadius:8,border:sd.cbCambio2?"2px solid "+VF_C:"1px solid rgba(255,255,255,0.12)",background:sd.cbCambio2?VF_C:"rgba(255,255,255,0.03)",color:sd.cbCambio2?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>
          Cambio Offerta
        </button>
      </div>
      {sd.cbCambio2&&(
        <div style={{background:VF_LIGHT,border:"1px solid "+VF_BORDER,borderRadius:8,padding:14,marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px",marginBottom:10}}>
            <TF l="Cellulare cliente" r v={sd.cbCambioCell||""} o={v=>{upv("cbCambioCell",v);if(!sd.cbCellulare)upv("cbCellulare",v)}} p="3XXXXXXXXX"/>
            <TF l="Numero soggetto a modifica" r v={sd.cbCambioNumMod||""} o={v=>upv("cbCambioNumMod",v)} p="3XXXXXXXXX"/>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Offerta <span style={{color:"#dc3545"}}>*</span></div>
            <div style={{padding:"10px 14px",borderRadius:8,border:"2px solid "+VF_C,background:"rgba(220,53,69,0.1)",color:VF_C,fontWeight:700,fontSize:13}}>MM4M</div>
          </div>
          <DD l="Codice Inserimento" r v={sd.cbCambioCodIns2||""} o={v=>upv("cbCambioCodIns2",v)} vals={VF_CODICI_NEGOZIO}/>
        </div>
      )}

      {/* ── Rete Sicura ── */}
      <div style={{marginTop:4}}>
        <button onClick={()=>upv("cbSecurity",!sd.cbSecurity)}
          style={{padding:"8px 20px",borderRadius:8,border:sd.cbSecurity?"2px solid "+VF_C:"1px solid rgba(255,255,255,0.12)",background:sd.cbSecurity?VF_C:"rgba(255,255,255,0.03)",color:sd.cbSecurity?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>
          Rete Sicura
        </button>
      </div>
      {sd.cbSecurity&&(
        <div style={{background:VF_LIGHT,border:"1px solid "+VF_BORDER,borderRadius:8,padding:14,marginTop:10}}>
          <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:10,textTransform:"uppercase"}}>Dati Rete Sicura CB</div>
          <TF l="Numero di cellulare" r v={sd.cbSecurityCell||""} o={v=>upv("cbSecurityCell",v)} p="3XXXXXXXXX"/>
        </div>
      )}
    </div>
  );
  return content;
};


const VFB_MOBILE_TABLETS = ["Samsung Galaxy Tab S9","Samsung Galaxy Tab A9","iPad Pro","iPad Air","iPad","Lenovo Tab P12","Altro tablet"];
const VFB_FISSO_BIZ_OFFERS = ["FISSA SMART","FISSA COMFORT","FISSA EXTRA","FISSA WIRELESS 5G","ONPI TW PLUS","ONPI PREMIUM","ONE BUSINESS SMART","ONE BUSINESS COMFORT","FISSA WIRELESS 5G + MOBILE COMFORT"];

const VFBizMobile = ({sd,uP}) => {
  const upv=(k,v)=>uP(k,v);
  const offers=["MOBILE SMART","MOBILE COMFORT","MOBILE EXTRA","DATI SMART","DATI COMFORT","RED DATA NOW"];
  const tabletOffers=["DATI SMART","DATI COMFORT","RED DATA NOW"];
  const isTablet=tabletOffers.includes(sd.vfbOffer);
  const deviceList=isTablet?[...VF_SMARTPHONES,...VFB_MOBILE_TABLETS]:VF_SMARTPHONES;
  const content = (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Offerta Mobile</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {offers.map(offer=>{
          const isActive=sd.vfbOffer===offer;
          return (
            <button key={offer} onClick={()=>{upv("vfbOffer",isActive?null:offer);if(!isActive){upv("vfbMnp",null);upv("vfbTnp",null);upv("vfbModello","");upv("vfbImei","");upv("vfbEasyRent",null);upv("vfbRataPiva",null);upv("vfbCodIns","");}}}
              style={{padding:"8px 14px",borderRadius:10,border:isActive?"2px solid "+VF_C:"1px solid rgba(255,255,255,0.12)",background:isActive?VF_C:"rgba(255,255,255,0.03)",color:isActive?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {offer}
            </button>
          );
        })}
      </div>
      {sd.vfbOffer&&(
        <div>
          <RB label="MNP?" val={sd.vfbMnp} opts={["Sì","No"]} onCh={v=>{upv("vfbMnp",v);if(v==="No"){upv("vfbMnpBrand","");upv("vfbMnpNum","")}}}/>
          {sd.vfbMnp==="Sì"&&(
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:12,marginBottom:12}}>
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
                        <button key={opt} onClick={()=>upv("vfbRataPiva",isOn?null:opt)}
                          style={{padding:"7px 18px",borderRadius:8,border:isOn?"2px solid "+VF_C:"1px solid rgba(255,255,255,0.12)",background:isOn?VF_C:"rgba(255,255,255,0.03)",color:isOn?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div style={{marginTop:8,background:"rgba(0,114,198,0.05)",border:"1px solid rgba(0,114,198,0.2)",borderRadius:8,padding:14}}>
                <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
                  <DD l="Codice Inserimento" r v={sd.vfbCodIns||""} o={v=>upv("vfbCodIns",v)} vals={VF_CODICI_NEGOZIO}/>
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

const VFBizMobileCB = ({sd,uP}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div>
      <div style={{marginBottom:10}}>
        <button onClick={()=>upv("vfbCbOn",!sd.vfbCbOn)}
          style={{padding:"8px 20px",borderRadius:8,border:sd.vfbCbOn?"2px solid "+VF_C:"1px solid rgba(255,255,255,0.12)",background:sd.vfbCbOn?VF_C:"rgba(255,255,255,0.03)",color:sd.vfbCbOn?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>
          CB
        </button>
      </div>
      {sd.vfbCbOn&&(
        <div style={{background:"rgba(0,114,198,0.05)",border:"1px solid rgba(0,114,198,0.2)",borderRadius:8,padding:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
          <DD l="Codice Inserimento" r v={sd.vfbCbCodIns||""} o={v=>upv("vfbCbCodIns",v)} vals={VF_CODICI_NEGOZIO}/>
        </div>
      )}
    </div>
  );
  return content;
};

const VFBizFisso = ({sd,uP,isCombo}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div>
      {isCombo&&(
        <div>
          <RB label="MNP?" val={sd.vfbFMnp} opts={["Sì","No"]} onCh={v=>{upv("vfbFMnp",v);if(v==="No"){upv("vfbFMnpBrand","");upv("vfbFMnpNum","");}}}/>
          {sd.vfbFMnp==="Sì"&&(
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:12,marginBottom:12}}>
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
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:12,marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
            <DD l="Operatore GNP" r v={sd.vfbFGnpBrand||""} o={v=>upv("vfbFGnpBrand",v)} vals={VF_GNP_BRANDS}/>
            <TF l="Numero Fisso GNP" r v={sd.vfbFGnpNum||""} o={v=>upv("vfbFGnpNum",v)} p="06XXXXXXXX"/>
          </div>
        </div>
      )}
      {sd.vfbFGnp&&(
        <div>
          <div style={{background:"rgba(0,114,198,0.05)",border:"1px solid rgba(0,114,198,0.2)",borderRadius:8,padding:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:12,textTransform:"uppercase"}}>📋 Dati Contratto</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
              <DD l="Codice Inserimento" r v={sd.vfbFCodIns||""} o={v=>upv("vfbFCodIns",v)} vals={VF_CODICI_NEGOZIO}/>
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

const IL_C = "#C00028";
const IL_MOBILE_OFFERS = ["Iliad Voce","Iliad 120GB","Iliad 180GB","Iliad 250GB","Iliad Dati 350"];
const IL_FISSO_OFFERS = ["Fisso Base","Fisso Plus"];
const IL_GNP_BRANDS = ["TIM","Vodafone","WindTre","Fastweb","Iliad","Tiscali","Altro"];
const IL_CODICI_NEGOZIO = ["IL-RM001","IL-RM002","IL-RM003","IL-RM004","IL-RM005","IL-RM006","IL-RM007","IL-RM008"];

const getIL = (tc) => {
  return [
    { id:"mobile", title:"MOBILE", icon:"📱", color:IL_C, radio:true, subs:[
      { id:"ga", title:"MOBILE", isILMobile:true, hasContract:true, ct:"ga", fields:[] },
    ]},
    { id:"fisso", title:"FISSO", icon:"🏠", color:"#28a745", radio:true, subs:
      IL_FISSO_OFFERS.map(o=>({ id:o.toLowerCase().replace(/ /g,"_"), title:o, isILFisso:true, hasContract:true, ct:"fisso", fields:[] }))
    },
  ];
};

const ILMobile = ({sd, uP}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Offerta Mobile</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {IL_MOBILE_OFFERS.map(offer=>{
          const isActive=sd.ilOffer===offer;
          return (
            <button key={offer} onClick={()=>{upv("ilOffer",isActive?null:offer);upv("ilMnp",null);upv("ilMnpBrand","");upv("ilMnpNum","");upv("ilCodIns","");upv("ilNumProv","");upv("ilNumDef","");upv("ilIccid","");}}
              style={{padding:"8px 14px",borderRadius:10,border:isActive?"2px solid "+IL_C:"1px solid rgba(255,255,255,0.12)",background:isActive?IL_C:"rgba(255,255,255,0.03)",color:isActive?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {offer}
            </button>
          );
        })}
      </div>
      {sd.ilOffer&&(
        <div>
          <RB label="MNP?" val={sd.ilMnp} opts={["Sì","No"]} onCh={v=>{upv("ilMnp",v);if(v==="No"){upv("ilMnpBrand","");upv("ilMnpNum","");}}}/>
          {sd.ilMnp==="Sì"&&(
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Operatore provenienza" r v={sd.ilMnpBrand||""} o={v=>upv("ilMnpBrand",v)} vals={IL_GNP_BRANDS}/>
                <TF l="Numero Portabilità" r v={sd.ilMnpNum||""} o={v=>upv("ilMnpNum",v)} p="3XXXXXXXXX"/>
              </div>
            </div>
          )}
          {sd.ilMnp&&(
            <div style={{background:"rgba(0,114,198,0.05)",border:"1px solid rgba(0,114,198,0.2)",borderRadius:8,padding:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
                <DD l="Codice Inserimento" r v={sd.ilCodIns||""} o={v=>upv("ilCodIns",v)} vals={IL_CODICI_NEGOZIO}/>
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

const ILFisso = ({sd, uP}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div>
      <RB label="GNP?" val={sd.ilFGnp} opts={["Sì","No"]} onCh={v=>{upv("ilFGnp",v);if(v==="No"){upv("ilFGnpBrand","");upv("ilFGnpNum","");}}}/>
      {sd.ilFGnp&&(
        <div style={{background:"rgba(0,114,198,0.05)",border:"1px solid rgba(0,114,198,0.2)",borderRadius:8,padding:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
            <DD l="Codice Inserimento" r v={sd.ilFCodIns||""} o={v=>upv("ilFCodIns",v)} vals={IL_CODICI_NEGOZIO}/>
            {sd.ilFGnp==="Sì"?(
              <TF l="Numero Provvisorio" r v={sd.ilFNumProv||""} o={v=>upv("ilFNumProv",v)} p="06XXXXXXXX"/>
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

// ── ENERGY ──────────────────────────────────────────────────────
const EN_C = "#28a745";
const EN_CODICI_NEGOZIO = ["EN-RM001","EN-RM002","EN-RM003","EN-RM004","EN-RM005"];

const getEN = (tc) => {
  return [
    { id:"s4", title:"S4 ENERGIA", icon:"⚡", color:EN_C, radio:false, subs:[
      { id:"s4_luce", title:"Luce", isENLuceGas:true, enBrand:"S4", enProd:"Luce", hasContract:true, ct:"multi", fields:[]},
      { id:"s4_gas", title:"Gas", isENLuceGas:true, enBrand:"S4", enProd:"Gas", hasContract:true, ct:"multi", fields:[]},
    ]},
    { id:"barton", title:"BARTON ENERGY", icon:"🔋", color:"#1a6b2d", radio:false, subs:[
      { id:"bt_luce", title:"Luce", isENLuceGas:true, enBrand:"Barton", enProd:"Luce", hasContract:true, ct:"multi", fields:[]},
      { id:"bt_luce_rid", title:"Luce RID", isENLuceGas:true, enBrand:"Barton", enProd:"LuceRID", hasContract:true, ct:"multi", fields:[]},
      { id:"bt_gas", title:"Gas", isENLuceGas:true, enBrand:"Barton", enProd:"Gas", hasContract:true, ct:"multi", fields:[]},
      { id:"bt_gas_rid", title:"Gas RID", isENLuceGas:true, enBrand:"Barton", enProd:"GasRID", hasContract:true, ct:"multi", fields:[]},
    ]},
  ];
};

const ENLuceGas = ({sd, uP, sub}) => {
  const upv=(k,v)=>uP(k,v);
  const isLuce = sub.enProd==="Luce"||sub.enProd==="LuceRID";
  const content = (
    <div style={{background:"rgba(0,114,198,0.05)",border:"1px solid rgba(0,114,198,0.2)",borderRadius:8,padding:14}}>
      <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto — {sub.enBrand} {sub.title}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
        <DD l="Codice Inserimento" r v={sd.enCodIns||""} o={v=>upv("enCodIns",v)} vals={EN_CODICI_NEGOZIO}/>
        {isLuce?(
          <TF l="POD" r v={sd.enPod||""} o={v=>upv("enPod",v)} p="IT001E..."/>
        ):(
          <TF l="PDR" r v={sd.enPdr||""} o={v=>upv("enPdr",v)} p="Codice PDR"/>
        )}
      </div>
    </div>
  );
  return content;
};


const SubCard = ({sub,rawSd,group,si,sessionCode,sale,uF,uC,uP,catSales,anaCel,onOpenVFModal}) => {
  const _r = rawSd || {};
  const sd = {active:true,fields:_r.fields||{},contract:_r.contract||{},gnp:_r.gnp||false,gnpNum:_r.gnpNum||"",gnpOp:_r.gnpOp||"",secondaLinea:_r.secondaLinea||false,gnp2L:_r.gnp2L!=null?_r.gnp2L:null,gnp2LBrand:_r.gnp2LBrand||"",gnp2LNum:_r.gnp2LNum||"",domiciliazione:_r.domiciliazione||false,opProvenienza:_r.opProvenienza||"",codiceOverride:_r.codiceOverride||"",addons:_r.addons||{},domiciliato:_r.domiciliato!=null?_r.domiciliato:null,convergente:_r.convergente!=null?_r.convergente:null,tipMob:_r.tipMob!=null?_r.tipMob:null,mnp:_r.mnp!=null?_r.mnp:null,easyPay:_r.easyPay!=null?_r.easyPay:null,tnpGa:_r.tnpGa!=null?_r.tnpGa:null,tnpTipo:_r.tnpTipo||"",tnpModello:_r.tnpModello||"",tnpImei:_r.tnpImei||"",tnpCount:_r.tnpCount||null,tnpModelli:_r.tnpModelli||[],tnpImeis:_r.tnpImeis||[],packAccessori:_r.packAccessori!=null?_r.packAccessori:null,packAccessoriVal:_r.packAccessoriVal||"",packAccessoriQta:_r.packAccessoriQta||"",cbTnp:_r.cbTnp||false,cbTnpTipo:_r.cbTnpTipo||"",cbTnpModello:_r.cbTnpModello||"",cbTnpImei:_r.cbTnpImei||"",cbTnpCount:_r.cbTnpCount||null,cbTnpModelli:_r.cbTnpModelli||[],cbTnpImeis:_r.cbTnpImeis||[],cbPackAccessori:_r.cbPackAccessori!=null?_r.cbPackAccessori:null,cbPackAccessoriVal:_r.cbPackAccessoriVal||"",cbPackAccessoriQta:_r.cbPackAccessoriQta||"",cbTnpCell:_r.cbTnpCell||"",cbTnpCC:_r.cbTnpCC||"",cbTnpCodIns:_r.cbTnpCodIns||"",cbTnpReload:_r.cbTnpReload!=null?_r.cbTnpReload:null,cbTnpReloadSel:_r.cbTnpReloadSel||{},cbCambio:_r.cbCambio||false,cbCambioVal:_r.cbCambioVal||"",cbCambioCell:_r.cbCambioCell||"",cbCambioCC:_r.cbCambioCC||"",cbCambioCodIns:_r.cbCambioCodIns||"",cbAddonSel:_r.cbAddonSel||{},rfModello:_r.rfModello||"",rfImei:_r.rfImei||"",cbRf:_r.cbRf||false,cbAddonCodIns:_r.cbAddonCodIns||"",cbRfCodIns:_r.cbRfCodIns||"",tnpGaReload:_r.tnpGaReload!=null?_r.tnpGaReload:null,tnpGaReloadSel:_r.tnpGaReloadSel||{},reloadForever:_r.reloadForever!=null?_r.reloadForever:null,securitySel:_r.securitySel||{},voceCasaCb:_r.voceCasaCb!=null?_r.voceCasaCb:null,vfOffers:_r.vfOffers||{},vfContratti:_r.vfContratti||{},vfOffer:_r.vfOffer||null,vfMnp:_r.vfMnp||null,vfMnpBrand:_r.vfMnpBrand||"",vfMnpNum:_r.vfMnpNum||"",vfDomicilio:_r.vfDomicilio||null,vfConvergenza:_r.vfConvergenza||null,vfNumFisso:_r.vfNumFisso||"",vfTnp:_r.vfTnp||null,vfTnpTipo:_r.vfTnpTipo||null,vfTnpCount:_r.vfTnpCount||null,vfTnpItems:_r.vfTnpItems||[],vfCompassTipo:_r.vfCompassTipo||null,vfFConvergenza:_r.vfFConvergenza||null,vfFGnp:_r.vfFGnp||null,vfFGnpBrand:_r.vfFGnpBrand||"",vfFGnpNum:_r.vfFGnpNum||"",vfFLockIn:_r.vfFLockIn||null,
    vfTnpList:_r.vfTnpList||[],cbTnpList:_r.cbTnpList||[],
    dcNumProv:_r.dcNumProv||"",dcNum:_r.dcNum||"",dcIccid:_r.dcIccid||"",dcCodIns:_r.dcCodIns||"",dcRicaricaAuto:_r.dcRicaricaAuto!=null?_r.dcRicaricaAuto:null,
    vfSecurity:_r.vfSecurity!=null?_r.vfSecurity:null,
    cbCellulare:_r.cbCellulare||"",cbCodContratto:_r.cbCodContratto||"",cbModello:_r.cbModello||"",cbImei:_r.cbImei||"",cbTaglia:_r.cbTaglia||null,cbCodIns2:_r.cbCodIns2||"",
    dcCbNumProv:_r.dcCbNumProv||"",dcCbIccid:_r.dcCbIccid||"",
    cbCambio2:_r.cbCambio2||false,cbCambioNumMod:_r.cbCambioNumMod||"",cbCambioCodIns2:_r.cbCambioCodIns2||"",
    cbSecurity:_r.cbSecurity||false,cbSecurityCell:_r.cbSecurityCell||"",
    vfFAddons:_r.vfFAddons||{},vfFCodIns:_r.vfFCodIns||"",vfFNumProvVisorio:_r.vfFNumProvVisorio||"",vfFNumDef:_r.vfFNumDef||"",
    vfbOffer:_r.vfbOffer||null,vfbMnp:_r.vfbMnp||null,vfbMnpBrand:_r.vfbMnpBrand||"",vfbMnpNum:_r.vfbMnpNum||"",vfbTnp:_r.vfbTnp||null,vfbModello:_r.vfbModello||"",vfbImei:_r.vfbImei||"",vfbRataPiva:_r.vfbRataPiva||null,vfbCodIns:_r.vfbCodIns||"",
    vfbCbOn:_r.vfbCbOn||false,vfbCbCodIns:_r.vfbCbCodIns||"",
    vfbFGnp:_r.vfbFGnp||null,vfbFGnpBrand:_r.vfbFGnpBrand||"",vfbFGnpNum:_r.vfbFGnpNum||"",vfbFCodIns:_r.vfbFCodIns||"",vfbFNumProv:_r.vfbFNumProv||"",vfbFNumDef:_r.vfbFNumDef||"",vfbFMnp:_r.vfbFMnp||null,vfbFMnpBrand:_r.vfbFMnpBrand||"",vfbFMnpNum:_r.vfbFMnpNum||"",vfbFCombNumProv:_r.vfbFCombNumProv||"",vfbFCombIccid:_r.vfbFCombIccid||"",vfbNum:_r.vfbNum||"",vfbIccid:_r.vfbIccid||"",vfbFIccid:_r.vfbFIccid||"",
    vfSolDigCodIns:_r.vfSolDigCodIns||"",fwOffer:_r.fwOffer||null,fwMnpBrand:_r.fwMnpBrand||"",fwMnpNum:_r.fwMnpNum||"",fwModello:_r.fwModello||"",fwImei:_r.fwImei||"",fwCodIns:_r.fwCodIns||"",fwNumProv:_r.fwNumProv||"",fwNumDef:_r.fwNumDef||"",fwIccid:_r.fwIccid||"",fwFGnp:_r.fwFGnp||null,fwFGnpBrand:_r.fwFGnpBrand||"",fwFGnpNum:_r.fwFGnpNum||"",fwFCodIns:_r.fwFCodIns||"",fwFNumProv:_r.fwFNumProv||"",fwFNumDef:_r.fwFNumDef||"",fwPod:_r.fwPod||"",ilOffer:_r.ilOffer||null,ilMnp:_r.ilMnp||null,ilMnpBrand:_r.ilMnpBrand||"",ilMnpNum:_r.ilMnpNum||"",ilCodIns:_r.ilCodIns||"",ilNumProv:_r.ilNumProv||"",ilNumDef:_r.ilNumDef||"",ilIccid:_r.ilIccid||"",ilFGnp:_r.ilFGnp||null,ilFCodIns:_r.ilFCodIns||"",ilFNumProv:_r.ilFNumProv||"",ilFNumDef:_r.ilFNumDef||"",enCodIns:_r.enCodIns||"",enPod:_r.enPod||"",enPdr:_r.enPdr||""};
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

  const content = (
    <div style={{marginBottom:10,padding:10,background:"rgba(255,255,255,0.02)",borderRadius:8,border:"1px solid "+group.color+"30"}}>
      <div style={{fontSize:11,fontWeight:700,color:group.color,marginBottom:6}}>{sub.title}</div>

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
              ? <div style={{marginTop:6,maxWidth:"50%"}}><DD l="Offerta Mobile" v={f.offerta||""} o={v=>uF(group.id,si,sub.id,"offerta",v)} vals={sub.mobOffers[sd.tipMob+"_"+sd.easyPay]||[]}/></div>
              : sub.fields&&sub.fields.length>0&&<div style={{marginTop:6,display:"grid",gridTemplateColumns:sub.fields.length>1?"1fr 1fr":"1fr",gap:"8px 14px"}}>{sub.fields.map(fl=><DD key={fl.key} l={fl.label} v={f[fl.key]||""} o={v=>uF(group.id,si,sub.id,fl.key,v)} vals={fl.values}/>)}</div>
          )}
          {/* Security when Easy Pay = No (after Offerta Mobile) */}
          {mobDone&&(sd.easyPay==="No"||sd.easyPay===false)&&(
            <div style={{marginTop:8,padding:8,background:"rgba(255,255,255,0.03)",borderRadius:6,border:"1px solid rgba(255,255,255,0.08)"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:6}}>Security</div>
              <div style={{display:"flex",gap:6}}>
                {["Security","Security PRO"].map(s=>
                  <button key={s} onClick={()=>uP(group.id,si,sub.id,"securitySel",sd.securitySel[s]?{}:{[s]:true})} style={{padding:"5px 14px",borderRadius:6,border:sd.securitySel[s]?"2px solid #fd7e14":"1px solid rgba(255,255,255,0.12)",background:sd.securitySel[s]?"rgba(253,126,20,0.12)":"rgba(255,255,255,0.03)",color:sd.securitySel[s]?"#fb923c":"#94a3b8",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
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
                <div style={{padding:10,background:"rgba(255,255,255,0.04)",borderRadius:8,border:"1px solid rgba(0,114,198,0.3)",marginTop:4}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#2E75B6",marginBottom:8,textTransform:"uppercase"}}>Dati TNP GA</div>
                  <div style={{display:"flex",gap:6,marginBottom:sd.tnpTipo?8:0}}>
                    {["Rata 5G","Finanziamento > 600€","Finanziamento < 600€"].map(opt=>
                      <button key={opt} onClick={()=>uP(group.id,si,sub.id,"tnpTipo",opt)} style={{padding:"6px 14px",borderRadius:6,border:sd.tnpTipo===opt?"2px solid #2E75B6":"1px solid rgba(255,255,255,0.12)",background:sd.tnpTipo===opt?"#2E75B6":"rgba(255,255,255,0.03)",color:sd.tnpTipo===opt?"#fff":"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer"}}>{opt}</button>
                    )}
                  </div>
                  {sd.tnpTipo&&(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                      {!sd.tnpTipo.startsWith("Finanziamento")&&<DD l="Modello Terminale" r v={sd.tnpModello||""} o={v=>uP(group.id,si,sub.id,"tnpModello",v)} vals={SMARTPHONES}/>}
                      {!sd.tnpTipo.startsWith("Finanziamento")&&<TF l="IMEI" r v={sd.tnpImei||""} o={v=>uP(group.id,si,sub.id,"tnpImei",v)} p="15 cifre" nt="Barcode 📷"/>}
                    </div>
                  )}
                  {/* Quanti TNP finanziati — solo per Finanziamento */}
                  {sd.tnpTipo&&sd.tnpTipo.startsWith("Finanziamento")&&(
                    <div style={{marginTop:8}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#2E75B6",marginBottom:6}}>Quanti TNP hai finanziato?</div>
                      <div style={{display:"flex",gap:6,marginBottom:8}}>
                        {[1,2,3].map(n=>
                          <button key={n} onClick={()=>uP(group.id,si,sub.id,"tnpCount",sd.tnpCount===n?null:n)} style={{width:40,height:40,borderRadius:8,border:sd.tnpCount===n?"2px solid #2E75B6":"1px solid rgba(255,255,255,0.12)",background:sd.tnpCount===n?"#2E75B6":"rgba(255,255,255,0.03)",color:sd.tnpCount===n?"#fff":"#94a3b8",fontSize:14,fontWeight:700,cursor:"pointer"}}>{n}</button>
                        )}
                      </div>
                      {sd.tnpCount&&[...Array(sd.tnpCount)].map((_,idx)=>(
                        <div key={idx} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px",marginBottom:8,padding:8,background:"rgba(255,255,255,0.02)",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)"}}>
                          <div style={{gridColumn:"1/-1",fontSize:10,fontWeight:700,color:"#2E75B6",marginBottom:2}}>Terminale {sd.tnpCount>1?idx+1:""}</div>
                          <DD l="Modello Terminale" r v={(sd.tnpModelli&&sd.tnpModelli[idx])||""} o={v=>{const m=[...(sd.tnpModelli||[])];m[idx]=v;uP(group.id,si,sub.id,"tnpModelli",m)}} vals={SMARTPHONES}/>
                          <TF l="IMEI" r v={(sd.tnpImeis&&sd.tnpImeis[idx])||""} o={v=>{const im=[...(sd.tnpImeis||[])];im[idx]=v;uP(group.id,si,sub.id,"tnpImeis",im)}} p="15 cifre" nt="Barcode 📷"/>
                        </div>
                      ))}
                      {sd.tnpCount&&(
                        <div style={{marginTop:4,padding:8,background:"rgba(255,255,255,0.02)",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)"}}>
                          <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                            <YN val={sd.packAccessori} onCh={v=>uP(group.id,si,sub.id,"packAccessori",v)} label="Pack Accessori?"/>
                            {(sd.packAccessori===true)&&(
                              <TF l="Quanti accessori?" v={sd.packAccessoriQta||""} o={v=>uP(group.id,si,sub.id,"packAccessoriQta",v)} p="es. 2"/>
                            )}
                          </div>
                          {(sd.packAccessori===true)&&(
                            <div style={{marginTop:10}}>
                              <div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:6}}>Importo Pack Accessori <span style={{color:"#2E75B6",fontWeight:700}}>€{sd.packAccessoriVal||29}</span></div>
                              <div style={{display:"flex",alignItems:"center",gap:10}}>
                                <input type="range" min={29} max={240} value={sd.packAccessoriVal||29} onChange={e=>uP(group.id,si,sub.id,"packAccessoriVal",parseInt(e.target.value))} style={{flex:1,accentColor:"#2E75B6"}}/>
                                <input type="number" min={29} max={240} value={sd.packAccessoriVal||""} onChange={e=>uP(group.id,si,sub.id,"packAccessoriVal",e.target.value===""?"":parseInt(e.target.value))} onBlur={e=>{const raw=parseInt(e.target.value);if(!isNaN(raw))uP(group.id,si,sub.id,"packAccessoriVal",Math.min(240,Math.max(29,raw)));else uP(group.id,si,sub.id,"packAccessoriVal",29)}} style={{width:72,padding:"5px 8px",borderRadius:6,border:"1px solid rgba(0,114,198,0.3)",fontSize:12,fontWeight:600,textAlign:"center"}} placeholder="29-240"/>
                                <span style={{fontSize:11,color:"#64748b"}}>€</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#aaa",marginTop:2}}><span>€29</span><span>€240</span></div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Reload inside TNP GA */}
                  {sd.tnpTipo&&(
                    <div style={{marginTop:10,padding:8,background:"rgba(255,255,255,0.02)",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)"}}>
                      <YN val={sd.tnpGaReload} onCh={v=>{uP(group.id,si,sub.id,"tnpGaReload",v);if(!v)uP(group.id,si,sub.id,"tnpGaReloadSel",{})}} label="Reload?"/>
                      {(sd.tnpGaReload===true)&&(
                        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6}}>
                          {["Reload","Reload Plus","Reload Exchange"].map(rl=>
                            <button key={rl} onClick={()=>uP(group.id,si,sub.id,"tnpGaReloadSel",sd.tnpGaReloadSel[rl]?{}:{[rl]:true})} style={{padding:"5px 12px",borderRadius:6,border:sd.tnpGaReloadSel[rl]?"2px solid #28a745":"1px solid rgba(255,255,255,0.12)",background:sd.tnpGaReloadSel[rl]?"rgba(40,167,69,0.15)":"rgba(255,255,255,0.03)",color:sd.tnpGaReloadSel[rl]?"#4ade80":"#94a3b8",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
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
                <div style={{marginTop:8,padding:8,background:"rgba(255,255,255,0.03)",borderRadius:6,border:"1px solid rgba(255,255,255,0.08)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:6}}>Security</div>
                  <div style={{display:"flex",gap:6}}>
                    {["Security","Security PRO"].map(s=>
                      <button key={s} onClick={()=>uP(group.id,si,sub.id,"securitySel",sd.securitySel[s]?{}:{[s]:true})} style={{padding:"5px 14px",borderRadius:6,border:sd.securitySel[s]?"2px solid #fd7e14":"1px solid rgba(255,255,255,0.12)",background:sd.securitySel[s]?"rgba(253,126,20,0.12)":"rgba(255,255,255,0.03)",color:sd.securitySel[s]?"#fb923c":"#94a3b8",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
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
              <div style={{marginTop:8,padding:8,background:"rgba(255,255,255,0.03)",borderRadius:6,border:"1px solid rgba(255,255,255,0.08)"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:6}}>Security</div>
                <div style={{display:"flex",gap:6}}>
                  {["Security","Security PRO"].map(s=>
                    <button key={s} onClick={()=>uP(group.id,si,sub.id,"securitySel",sd.securitySel[s]?{}:{[s]:true})} style={{padding:"5px 14px",borderRadius:6,border:sd.securitySel[s]?"2px solid #fd7e14":"1px solid rgba(255,255,255,0.12)",background:sd.securitySel[s]?"rgba(253,126,20,0.12)":"rgba(255,255,255,0.03)",color:sd.securitySel[s]?"#fb923c":"#94a3b8",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
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
      {sub.isVFMobile&&<VFMobileGA sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)}/>}
      {sub.isVFBizMobile&&<VFBizMobile sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)}/>}

      {/* VF MOBILE CB */}
      {sub.isCBVF&&<VFCB sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)}/>}
      {sub.isCBVFBiz&&<VFBizMobileCB sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)}/>}

      {/* FASTWEB */}
      {sub.isFWMobile&&<FWMobile sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)}/>}
      {sub.isFWFisso&&<FWFisso sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)}/>}
      {sub.isFWEnergia&&<FWEnergia sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)}/>}

      {/* ILIAD */}
      {sub.isILMobile&&<ILMobile sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)}/>}
      {sub.isILFisso&&<ILFisso sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)}/>}

      {/* ENERGY */}
      {sub.isENLuceGas&&<ENLuceGas sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sub={sub}/>}

      {/* MOBILE BUSINESS flow: MNP → Brand MNP → Offerta → TNP GA → Security */}
      {sub.isMobileBiz&&(
        <div>
          <MiniC label="MNP" val={sd.mnp} onCh={v=>{uP(group.id,si,sub.id,"mnp",v);if(v==="No"||v===false)uC(group.id,si,sub.id,"brand_mnp","")}} opts={["Sì","No"]}/>
          {bizMnpDone&&(
            <div style={{marginTop:6,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
              {(sd.mnp==="Sì"||sd.mnp===true)&&<DD l="Brand MNP" r v={f.brandMnpBiz||""} o={v=>uF(group.id,si,sub.id,"brandMnpBiz",v)} vals={brandMNP}/>}
              <DD l="Offerta Mobile" r v={f.offerta||""} o={v=>uF(group.id,si,sub.id,"offerta",v)} vals={(sub.bizOffers||[]).filter(o=>(sd.mnp==="Sì"||sd.mnp===true)?o!=="FWA Indoor PIVA":true)}/>
            </div>
          )}
          {bizMobDone&&(
            <div style={{marginTop:8}}>
              <MiniC label="TNP GA" val={sd.tnpGa} onCh={v=>{uP(group.id,si,sub.id,"tnpGa",v);if(v==="No"||v===false){uP(group.id,si,sub.id,"tnpTipo","");uP(group.id,si,sub.id,"tnpModello","");uP(group.id,si,sub.id,"tnpImei","");uP(group.id,si,sub.id,"tnpGaReload",null);uP(group.id,si,sub.id,"tnpGaReloadSel",{})}}} opts={["Sì","No"]}/>
              {(sd.tnpGa==="Sì"||sd.tnpGa===true)&&(
                <div style={{marginTop:8}}>
                  <div style={{padding:8,background:"rgba(255,255,255,0.03)",borderRadius:6,border:"1px solid rgba(255,255,255,0.08)"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:6}}>Security / Reload</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <button onClick={()=>uP(group.id,si,sub.id,"securitySel",sd.securitySel["Security"]?{}:{"Security":true})} style={{padding:"5px 14px",borderRadius:6,border:sd.securitySel["Security"]?"2px solid #fd7e14":"1px solid rgba(255,255,255,0.12)",background:sd.securitySel["Security"]?"rgba(253,126,20,0.12)":"rgba(255,255,255,0.03)",color:sd.securitySel["Security"]?"#fb923c":"#94a3b8",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                        <span>{sd.securitySel["Security"]?"☑":"☐"}</span>Security
                      </button>
                      {["Reload","Reload EU"].map(rl=>
                        <button key={rl} onClick={()=>uP(group.id,si,sub.id,"tnpGaReloadSel",sd.tnpGaReloadSel[rl]?{}:{[rl]:true})} style={{padding:"5px 14px",borderRadius:6,border:sd.tnpGaReloadSel[rl]?"2px solid #28a745":"1px solid rgba(255,255,255,0.12)",background:sd.tnpGaReloadSel[rl]?"rgba(40,167,69,0.15)":"rgba(255,255,255,0.03)",color:sd.tnpGaReloadSel[rl]?"#4ade80":"#94a3b8",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                          <span>{sd.tnpGaReloadSel[rl]?"◉":"○"}</span>{rl}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {(sd.tnpGa==="No"||sd.tnpGa===false)&&(
                <div style={{marginTop:8,padding:8,background:"rgba(255,255,255,0.03)",borderRadius:6,border:"1px solid rgba(255,255,255,0.08)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:6}}>Security / Reload</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <button onClick={()=>uP(group.id,si,sub.id,"securitySel",sd.securitySel["Security"]?{}:{"Security":true})} style={{padding:"5px 14px",borderRadius:6,border:sd.securitySel["Security"]?"2px solid #fd7e14":"1px solid rgba(255,255,255,0.12)",background:sd.securitySel["Security"]?"rgba(253,126,20,0.12)":"rgba(255,255,255,0.03)",color:sd.securitySel["Security"]?"#fb923c":"#94a3b8",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                      <span>{sd.securitySel["Security"]?"◉":"○"}</span>Security
                    </button>
                    <button onClick={()=>uP(group.id,si,sub.id,"tnpGaReloadSel",sd.tnpGaReloadSel["Reload Open"]?{}:{"Reload Open":true})} style={{padding:"5px 14px",borderRadius:6,border:sd.tnpGaReloadSel["Reload Open"]?"2px solid #28a745":"1px solid rgba(255,255,255,0.12)",background:sd.tnpGaReloadSel["Reload Open"]?"rgba(40,167,69,0.15)":"rgba(255,255,255,0.03)",color:sd.tnpGaReloadSel["Reload Open"]?"#4ade80":"#94a3b8",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
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
          ? <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:8,background:"rgba(111,66,193,0.12)",border:"2px solid #6f42c1"}}>
              <span style={{fontSize:16}}>✅</span>
              <span style={{fontSize:13,fontWeight:700,color:"#6f42c1"}}>Protecta PRO attivato</span>
            </div>
          : <div style={{display:"flex",gap:8}}>
              {["Kit Base","Kit Plus"].map(k=>
                <button key={k} onClick={()=>uF(group.id,si,sub.id,"protectaKit",f.protectaKit===k?"":k)} style={{padding:"8px 18px",borderRadius:8,border:f.protectaKit===k?"2px solid #6f42c1":"1px solid rgba(255,255,255,0.12)",background:f.protectaKit===k?"#6f42c1":"rgba(255,255,255,0.03)",color:f.protectaKit===k?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>{k}</button>
              )}
            </div>
      )}

      {/* Verisure */}
      {sub.isVerisure&&(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderRadius:8,background:"rgba(111,66,193,0.12)",border:"2px solid #6f42c1"}}>
          <span style={{fontSize:20}}>🛡️</span>
          <span style={{fontSize:13,fontWeight:700,color:"#6f42c1"}}>Verisure</span>
          <span style={{marginLeft:"auto",fontSize:12,fontWeight:800,color:"#c084fc",background:"rgba(111,66,193,0.15)",borderRadius:6,padding:"3px 12px"}}>VERISURE ATTIVO</span>
        </div>
      )}

      {/* VF Fisso — Convergenza / GNP / Lock In */}
      {sub.isVFFisso&&<VFMobileGAFisso sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)}/>}
      {sub.isVFFissoBiz&&<VFBizFisso sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} isCombo={!!sub.isCombinatoFissoBiz}/>}
      {sub.isVFSolDig&&(
        <div style={{background:"rgba(0,114,198,0.05)",border:"1px solid rgba(0,114,198,0.2)",borderRadius:8,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
          <DD l="Codice Inserimento" r v={sd.vfSolDigCodIns||""} o={v=>uP(group.id,si,sub.id,"vfSolDigCodIns",v)} vals={VF_CODICI_NEGOZIO}/>
        </div>
      )}

      {/* Kasko Facile */}
      {sub.isKaskoFacile&&(
        <div style={{background:"rgba(0,114,198,0.05)",border:"1px solid rgba(0,114,198,0.2)",borderRadius:8,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto — Kasko Facile</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
            <TF l="IMEI" r v={f.kfImei||""} o={v=>uF(group.id,si,sub.id,"kfImei",v)} p="15 cifre" nt="Barcode 📷"/>
            <TF l="Numero di telefono" r v={f.kfTelefono||""} o={v=>uF(group.id,si,sub.id,"kfTelefono",v)} p="3XXXXXXXXX"/>
            <TF l="Seriale Kasko" r v={f.kfSeriale||""} o={v=>uF(group.id,si,sub.id,"kfSeriale",v)} p="es. KF-000123"/>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Tipologia Kasko <span style={{color:"#dc3545"}}>*</span></div>
              <select value={f.kfTipologia||""} onChange={e=>uF(group.id,si,sub.id,"kfTipologia",e.target.value)} className="glass-input w-full text-sm rounded-xl py-3">
                <option value="">— Seleziona —</option>
                <option value="da_definire">Da definire</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Vodafone Care */}
      {sub.isVFCare&&(
        <div style={{background:"rgba(0,114,198,0.05)",border:"1px solid rgba(0,114,198,0.2)",borderRadius:8,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto — Vodafone Care</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
            <TF l="Numero di telefono" r v={f.vcTelefono||""} o={v=>uF(group.id,si,sub.id,"vcTelefono",v)} p="3XXXXXXXXX"/>
            <TF l="IMEI" r v={f.vcImei||""} o={v=>uF(group.id,si,sub.id,"vcImei",v)} p="15 cifre" nt="Barcode 📷"/>
          </div>
        </div>
      )}
      {/* Assicurazioni Business: radio esclusivo */}
      {sub.isAssicBiz&&(
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {["Protezione PRO Negozi - Affittuario","Protezione PRO Negozi - Proprietario"].map(opt=>
            <button key={opt} onClick={()=>uF(group.id,si,sub.id,"assicBizSel",f.assicBizSel===opt?"":opt)} style={{padding:"8px 16px",borderRadius:8,border:f.assicBizSel===opt?"2px solid #6f42c1":"1px solid rgba(255,255,255,0.12)",background:f.assicBizSel===opt?"#6f42c1":"rgba(255,255,255,0.03)",color:f.assicBizSel===opt?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:14}}>{f.assicBizSel===opt?"◉":"○"}</span>{opt}
            </button>
          )}
        </div>
      )}


      {sub.isCB&&(
        <div>
          {/* Three toggleable sub-options */}
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <button onClick={()=>{const on=!sd.cbTnp;uP(group.id,si,sub.id,"cbTnp",on);if(on){if(!sd.cbTnpCell){const pre=sd.cbCambioCell||anaCel||"";if(pre)uP(group.id,si,sub.id,"cbTnpCell",pre)};if(!sd.cbTnpCC){const pre=sd.cbCambioCC||(c.codice_contratto||"");if(pre)uP(group.id,si,sub.id,"cbTnpCC",pre)}}}} style={{padding:"8px 16px",borderRadius:8,border:sd.cbTnp?"2px solid #2E75B6":"1px solid rgba(255,255,255,0.12)",background:sd.cbTnp?"#2E75B6":"rgba(255,255,255,0.03)",color:sd.cbTnp?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>TNP CB</button>
            <button onClick={()=>{const on=!sd.cbCambio;uP(group.id,si,sub.id,"cbCambio",on);if(on){if(!sd.cbCambioCell){const pre=sd.cbTnpCell||anaCel||"";if(pre)uP(group.id,si,sub.id,"cbCambioCell",pre)};if(!sd.cbCambioCC){const pre=sd.cbTnpCC||(c.codice_contratto||"");if(pre)uP(group.id,si,sub.id,"cbCambioCC",pre)}}}} style={{padding:"8px 16px",borderRadius:8,border:sd.cbCambio?"2px solid #6f42c1":"1px solid rgba(255,255,255,0.12)",background:sd.cbCambio?"#6f42c1":"rgba(255,255,255,0.03)",color:sd.cbCambio?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>Cambio Offerta</button>
            {!sub.isCBBiz&&<button onClick={()=>uP(group.id,si,sub.id,"cbRf",!sd.cbRf)} style={{padding:"8px 16px",borderRadius:8,border:sd.cbRf?"2px solid #28a745":"1px solid rgba(255,255,255,0.12)",background:sd.cbRf?"#28a745":"rgba(255,255,255,0.03)",color:sd.cbRf?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>Reload Forever</button>}
          </div>

          {/* TNP CB section */}
          {sd.cbTnp&&(
            <div style={{padding:10,background:"rgba(255,255,255,0.04)",borderRadius:8,border:"1px solid rgba(0,114,198,0.3)",marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"#2E75B6",marginBottom:8,textTransform:"uppercase"}}>Dati TNP CB</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px 14px",marginBottom:8}}>
                <SCd session={sessionCode} codici={codiciW3} val={sd.cbTnpCodIns||""} onCh={v=>uP(group.id,si,sub.id,"cbTnpCodIns",v)}/>
                <TF l="Cellulare" r v={sd.cbTnpCell||""} o={v=>{uP(group.id,si,sub.id,"cbTnpCell",v);if(sd.cbCambio)uP(group.id,si,sub.id,"cbCambioCell",v)}} p="3XXXXXXXXX" nt={sd.cbTnpCell===anaCel&&anaCel?"Da anagrafica":""}/>
                <TF l="Codice Contratto" r v={sd.cbTnpCC||""} o={v=>{uP(group.id,si,sub.id,"cbTnpCC",v);if(sd.cbCambio)uP(group.id,si,sub.id,"cbCambioCC",v)}} p="es. 167942"/>
              </div>
              {sub.isCBBiz&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px",marginBottom:8}}>
                  <DD l="Modello Terminale" r v={sd.cbTnpModello||""} o={v=>uP(group.id,si,sub.id,"cbTnpModello",v)} vals={SMARTPHONES}/>
                  <TF l="IMEI" r v={sd.cbTnpImei||""} o={v=>uP(group.id,si,sub.id,"cbTnpImei",v)} p="15 cifre" nt="Barcode 📷"/>
                </div>
              )}
              <div style={{display:"flex",gap:6,marginBottom:sd.cbTnpTipo?8:0}}>
                {!sub.isCBBiz&&sub.cbTnpVals.map(opt=>
                  <button key={opt} onClick={()=>uP(group.id,si,sub.id,"cbTnpTipo",opt)} style={{padding:"6px 14px",borderRadius:6,border:sd.cbTnpTipo===opt?"2px solid #2E75B6":"1px solid rgba(255,255,255,0.12)",background:sd.cbTnpTipo===opt?"#2E75B6":"rgba(255,255,255,0.03)",color:sd.cbTnpTipo===opt?"#fff":"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer"}}>{opt}</button>
                )}
              </div>
              {!sub.isCBBiz&&sd.cbTnpTipo&&(
                <div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                    {!sd.cbTnpTipo.startsWith("Finanziamento")&&<DD l="Modello Terminale" r v={sd.cbTnpModello||""} o={v=>uP(group.id,si,sub.id,"cbTnpModello",v)} vals={SMARTPHONES}/>}
                    {!sd.cbTnpTipo.startsWith("Finanziamento")&&<TF l="IMEI" r v={sd.cbTnpImei||""} o={v=>uP(group.id,si,sub.id,"cbTnpImei",v)} p="15 cifre" nt="Barcode 📷"/>}
                  </div>
                  {sd.cbTnpTipo.startsWith("Finanziamento")&&(
                    <div style={{marginTop:8}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#2E75B6",marginBottom:6}}>Quanti TNP hai finanziato?</div>
                      <div style={{display:"flex",gap:6,marginBottom:8}}>
                        {[1,2,3].map(n=>
                          <button key={n} onClick={()=>uP(group.id,si,sub.id,"cbTnpCount",sd.cbTnpCount===n?null:n)} style={{width:40,height:40,borderRadius:8,border:sd.cbTnpCount===n?"2px solid #2E75B6":"1px solid rgba(255,255,255,0.12)",background:sd.cbTnpCount===n?"#2E75B6":"rgba(255,255,255,0.03)",color:sd.cbTnpCount===n?"#fff":"#94a3b8",fontSize:14,fontWeight:700,cursor:"pointer"}}>{n}</button>
                        )}
                      </div>
                      {sd.cbTnpCount&&[...Array(sd.cbTnpCount)].map((_,idx)=>(
                        <div key={idx} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px",marginBottom:8,padding:8,background:"rgba(255,255,255,0.02)",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)"}}>
                          <div style={{gridColumn:"1/-1",fontSize:10,fontWeight:700,color:"#2E75B6",marginBottom:2}}>Terminale {sd.cbTnpCount>1?idx+1:""}</div>
                          <DD l="Modello Terminale" r v={(sd.cbTnpModelli&&sd.cbTnpModelli[idx])||""} o={v=>{const m=[...(sd.cbTnpModelli||[])];m[idx]=v;uP(group.id,si,sub.id,"cbTnpModelli",m)}} vals={SMARTPHONES}/>
                          <TF l="IMEI" r v={(sd.cbTnpImeis&&sd.cbTnpImeis[idx])||""} o={v=>{const im=[...(sd.cbTnpImeis||[])];im[idx]=v;uP(group.id,si,sub.id,"cbTnpImeis",im)}} p="15 cifre" nt="Barcode 📷"/>
                        </div>
                      ))}
                      {sd.cbTnpCount&&(
                        <div style={{marginTop:4,padding:8,background:"rgba(255,255,255,0.02)",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)"}}>
                          <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                            <YN val={sd.cbPackAccessori} onCh={v=>uP(group.id,si,sub.id,"cbPackAccessori",v)} label="Pack Accessori?"/>
                            {(sd.cbPackAccessori===true)&&(
                              <TF l="Quanti accessori?" v={sd.cbPackAccessoriQta||""} o={v=>uP(group.id,si,sub.id,"cbPackAccessoriQta",v)} p="es. 2"/>
                            )}
                          </div>
                          {(sd.cbPackAccessori===true)&&(
                            <div style={{marginTop:10}}>
                              <div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:6}}>Importo Pack Accessori <span style={{color:"#2E75B6",fontWeight:700}}>€{sd.cbPackAccessoriVal||29}</span></div>
                              <div style={{display:"flex",alignItems:"center",gap:10}}>
                                <input type="range" min={29} max={240} value={sd.cbPackAccessoriVal||29} onChange={e=>uP(group.id,si,sub.id,"cbPackAccessoriVal",parseInt(e.target.value))} style={{flex:1,accentColor:"#2E75B6"}}/>
                                <input type="number" min={29} max={240} value={sd.cbPackAccessoriVal||""} onChange={e=>uP(group.id,si,sub.id,"cbPackAccessoriVal",e.target.value===""?"":parseInt(e.target.value))} onBlur={e=>{const raw=parseInt(e.target.value);if(!isNaN(raw))uP(group.id,si,sub.id,"cbPackAccessoriVal",Math.min(240,Math.max(29,raw)));else uP(group.id,si,sub.id,"cbPackAccessoriVal",29)}} style={{width:72,padding:"5px 8px",borderRadius:6,border:"1px solid rgba(0,114,198,0.3)",fontSize:12,fontWeight:600,textAlign:"center"}} placeholder="29-240"/>
                                <span style={{fontSize:11,color:"#64748b"}}>€</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#aaa",marginTop:2}}><span>€29</span><span>€240</span></div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Reload inside TNP CB */}
              <div style={{marginTop:8,padding:8,background:"rgba(255,255,255,0.02)",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)"}}>
                <YN val={sd.cbTnpReload} onCh={v=>{uP(group.id,si,sub.id,"cbTnpReload",v);if(!v)uP(group.id,si,sub.id,"cbTnpReloadSel",{})}} label="Reload?"/>
                {(sd.cbTnpReload===true)&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6}}>
                    {(sub.isCBBiz?["Reload","Reload EU"]:["Reload","Reload Plus","Reload Exchange"]).map(rl=>
                      <button key={rl} onClick={()=>uP(group.id,si,sub.id,"cbTnpReloadSel",sd.cbTnpReloadSel[rl]?{}:{[rl]:true})} style={{padding:"5px 12px",borderRadius:6,border:sd.cbTnpReloadSel[rl]?"2px solid #28a745":"1px solid rgba(255,255,255,0.12)",background:sd.cbTnpReloadSel[rl]?"rgba(40,167,69,0.15)":"rgba(255,255,255,0.03)",color:sd.cbTnpReloadSel[rl]?"#4ade80":"#94a3b8",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
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
            <div style={{padding:10,background:"rgba(139,92,246,0.08)",borderRadius:8,border:"1px solid rgba(139,92,246,0.2)",marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"#6f42c1",marginBottom:8,textTransform:"uppercase"}}>Cambio Offerta</div>
              <div style={{marginBottom:8,maxWidth:250}}>
                <SCd session={sessionCode} codici={codiciW3} val={sd.cbCambioCodIns||""} onCh={v=>uP(group.id,si,sub.id,"cbCambioCodIns",v)}/>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                {sub.cbCambioVals.map(opt=>
                  <button key={opt} onClick={()=>uP(group.id,si,sub.id,"cbCambioVal",sd.cbCambioVal===opt?"":opt)} style={{padding:"6px 14px",borderRadius:6,border:sd.cbCambioVal===opt?"2px solid #6f42c1":"1px solid rgba(255,255,255,0.12)",background:sd.cbCambioVal===opt?"#6f42c1":"rgba(255,255,255,0.03)",color:sd.cbCambioVal===opt?"#fff":"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer"}}>{opt}</button>
                )}
              </div>
              {sd.cbCambioVal&&(
                <div style={{display:"grid",gridTemplateColumns:["Caring","CL0","CL1","CL2","CL3"].indexOf(sd.cbCambioVal)>=0?"1fr":"1fr 1fr",gap:"8px 14px"}}>
                  <TF l="Cellulare" r v={sd.cbCambioCell||""} o={v=>{uP(group.id,si,sub.id,"cbCambioCell",v);if(sd.cbTnp)uP(group.id,si,sub.id,"cbTnpCell",v)}} p="3XXXXXXXXX" nt={sd.cbCambioCell===anaCel&&anaCel?"Da anagrafica":""}/>
                  {["Caring","CL0","CL1","CL2","CL3"].indexOf(sd.cbCambioVal)<0&&(
                    <TF l="Codice Contratto" r v={sd.cbCambioCC||""} o={v=>{uP(group.id,si,sub.id,"cbCambioCC",v);if(sd.cbTnp)uP(group.id,si,sub.id,"cbTnpCC",v)}} p="es. 167942"/>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Add-on section inside CB */}
          {sub.cbAddonVals&&(
            <div style={{padding:10,background:"rgba(40,167,69,0.08)",borderRadius:8,border:"1px solid rgba(40,167,69,0.2)",marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"#28a745",marginBottom:8,textTransform:"uppercase"}}>{sub.isCBBiz?"Add-on / Security":"Add-on"}</div>
              <div style={{marginBottom:8,maxWidth:250}}>
                <SCd session={sessionCode} codici={codiciW3} val={sd.cbAddonCodIns||(sd.cbTnpCodIns||sd.cbCambioCodIns||"")} onCh={v=>uP(group.id,si,sub.id,"cbAddonCodIns",v)}/>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {sub.cbAddonVals.map(opt=>
                  <button key={opt} onClick={()=>{const cur=sd.cbAddonSel[opt];uP(group.id,si,sub.id,"cbAddonSel",{...sd.cbAddonSel,[opt]:!cur})}} style={{padding:"6px 14px",borderRadius:6,border:sd.cbAddonSel[opt]?"2px solid #28a745":"1px solid rgba(255,255,255,0.12)",background:sd.cbAddonSel[opt]?"rgba(40,167,69,0.15)":"rgba(255,255,255,0.03)",color:sd.cbAddonSel[opt]?"#4ade80":"#94a3b8",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                    <span>{sd.cbAddonSel[opt]?"☑":"☐"}</span>{opt}
                  </button>
                )}
                {sub.isCBBiz&&(!sd.cbTnp||(sd.cbTnp&&sd.cbCambio&&(sd.cbTnpReload===false||sd.cbTnpReload===null)))&&(
                  <button onClick={()=>{const cur=sd.cbAddonSel["Reload Open"];uP(group.id,si,sub.id,"cbAddonSel",{...sd.cbAddonSel,"Reload Open":!cur})}} style={{padding:"6px 14px",borderRadius:6,border:sd.cbAddonSel["Reload Open"]?"2px solid #28a745":"1px solid rgba(255,255,255,0.12)",background:sd.cbAddonSel["Reload Open"]?"rgba(40,167,69,0.15)":"rgba(255,255,255,0.03)",color:sd.cbAddonSel["Reload Open"]?"#4ade80":"#94a3b8",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                    <span>{sd.cbAddonSel["Reload Open"]?"☑":"☐"}</span>Reload Open
                  </button>
                )}
              </div>
            </div>
          )}
          {!sub.isCBBiz&&sd.cbRf&&(
            <div style={{padding:10,background:"rgba(255,255,255,0.04)",borderRadius:8,border:"1px solid rgba(0,114,198,0.3)",marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"#2E75B6",marginBottom:8,textTransform:"uppercase"}}>Dati Reload Forever</div>
              <div style={{marginBottom:8,maxWidth:250}}>
                <SCd session={sessionCode} codici={codiciW3} val={sd.cbRfCodIns||(sd.cbTnpCodIns||sd.cbCambioCodIns||"")} onCh={v=>uP(group.id,si,sub.id,"cbRfCodIns",v)}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Modello Terminale" r v={sd.rfModello||""} o={v=>uP(group.id,si,sub.id,"rfModello",v)} vals={SMARTPHONES}/>
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
          <div style={{flex:1,minWidth:140}}><div style={{fontSize:12,fontWeight:700,color:(isVCMode||bizDomLocked)?"#999":"#333",marginBottom:6}}>Domiciliato?</div><div style={{display:"flex",gap:8}}>
            {(isVCMode||bizDomLocked)?(
              <div style={{display:"flex",alignItems:"center",gap:6}}><button disabled style={{padding:"6px 20px",borderRadius:6,border:"2px solid #28a745",background:"rgba(40,167,69,0.1)",color:"#28a745",fontSize:12,fontWeight:700,cursor:"not-allowed"}}>Sì</button><span style={{fontSize:10,color:"#64748b",fontStyle:"italic"}}>{isVCMode||sub.domLocked?"Obbligatorio":"Business"}</span></div>
            ):(<>
              <button onClick={()=>uP(group.id,si,sub.id,"domiciliato",true)} style={{padding:"6px 20px",borderRadius:6,border:sd.domiciliato===true?"2px solid #28a745":"1px solid rgba(255,255,255,0.12)",background:sd.domiciliato===true?"rgba(40,167,69,0.15)":"rgba(255,255,255,0.03)",color:sd.domiciliato===true?"#4ade80":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>Sì</button>
              <button onClick={()=>uP(group.id,si,sub.id,"domiciliato",false)} style={{padding:"6px 20px",borderRadius:6,border:sd.domiciliato===false?"2px solid #dc3545":"1px solid rgba(255,255,255,0.12)",background:sd.domiciliato===false?"rgba(220,53,69,0.15)":"rgba(255,255,255,0.03)",color:sd.domiciliato===false?"#f87171":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>No</button>
            </>)}
          </div></div>
          <div style={{flex:1,minWidth:140}}><div style={{fontSize:12,fontWeight:700,color:"#f8fafc",marginBottom:6}}>Convergente?</div><div style={{display:"flex",gap:8}}>
            <button onClick={()=>uP(group.id,si,sub.id,"convergente",true)} style={{padding:"6px 20px",borderRadius:6,border:sd.convergente===true?"2px solid #28a745":"1px solid rgba(255,255,255,0.12)",background:sd.convergente===true?"rgba(40,167,69,0.15)":"rgba(255,255,255,0.03)",color:sd.convergente===true?"#4ade80":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>Sì</button>
            <button onClick={()=>uP(group.id,si,sub.id,"convergente",false)} style={{padding:"6px 20px",borderRadius:6,border:sd.convergente===false?"2px solid #dc3545":"1px solid rgba(255,255,255,0.12)",background:sd.convergente===false?"rgba(220,53,69,0.15)":"rgba(255,255,255,0.03)",color:sd.convergente===false?"#f87171":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>No</button>
          </div></div>
        </div>
      )}

      {/* GNP */}
      {sub.hasGnpQ&&<><YN val={sd.gnp} onCh={v=>uP(group.id,si,sub.id,"gnp",v)} label="C'è una GNP?"/>
        {sd.gnp&&<div style={{padding:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
          <TF l="N. Definitivo da portare" r v={sd.gnpNum||""} o={v=>uP(group.id,si,sub.id,"gnpNum",v)} p="Numero"/>
          <DD l="Op. provenienza GNP" r v={sd.gnpOp||""} o={v=>uP(group.id,si,sub.id,"gnpOp",v)} vals={opProv}/>
        </div>}</>}

      {sub.has2LQ&&<YN val={sd.secondaLinea} onCh={v=>uP(group.id,si,sub.id,"secondaLinea",v)} label="C'è una seconda linea?"/>}
      {sub.has2LQ&&(sd.secondaLinea===true||sd.secondaLinea==="Sì")&&(
        <div style={{padding:10,background:"rgba(255,255,255,0.04)",borderRadius:8,border:"1px solid rgba(0,114,198,0.3)",marginTop:4}}>
          <div style={{fontSize:10,fontWeight:700,color:"#2E75B6",marginBottom:8,textTransform:"uppercase"}}>2° Linea</div>
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
        <div style={{marginTop:10,padding:10,background:"rgba(255,255,255,0.03)",borderRadius:8,border:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#f8fafc",marginBottom:8}}>{sub.isFisso?"Add-on Fisso":"Seleziona prodotti"}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {sub.addonList.map(ad=>
              <button key={ad} onClick={()=>toggleAddon(ad)} style={{padding:"6px 14px",borderRadius:6,border:sd.addons[ad]?"2px solid #28a745":"1px solid rgba(255,255,255,0.12)",background:sd.addons[ad]?"rgba(40,167,69,0.15)":"rgba(255,255,255,0.03)",color:sd.addons[ad]?"#4ade80":"#94a3b8",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:14}}>{sd.addons[ad]?"☑":"☐"}</span>{ad}
              </button>
            )}
          </div>
        </div>
      )}

      {sub.hasDom&&<YN val={sd.domiciliazione} onCh={v=>uP(group.id,si,sub.id,"domiciliazione",v)} label="Domiciliazione bancaria?"/>}

      {/* LG Convergente */}
      {sub.hasConvLG&&(
        <div style={{marginTop:8,padding:10,background:"rgba(255,255,255,0.03)",borderRadius:8,border:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{fontSize:12,fontWeight:700,color:lgConvLocked?"#64748b":"#f8fafc",marginBottom:6}}>Convergente?</div>
          {lgConvLocked?<div style={{display:"flex",alignItems:"center",gap:8}}><button disabled style={{padding:"6px 20px",borderRadius:6,border:"2px solid #dc3545",background:"rgba(220,53,69,0.15)",color:"#f87171",fontSize:12,fontWeight:700,cursor:"not-allowed",opacity:.7}}>No</button><span style={{fontSize:10,color:"#64748b",fontStyle:"italic"}}>Già selezionato altrove</span></div>
          :<div style={{display:"flex",gap:8}}>
            <button onClick={()=>uP(group.id,si,sub.id,"convergente",true)} style={{padding:"6px 20px",borderRadius:6,border:sd.convergente===true?"2px solid #28a745":"1px solid rgba(255,255,255,0.12)",background:sd.convergente===true?"rgba(40,167,69,0.15)":"rgba(255,255,255,0.03)",color:sd.convergente===true?"#4ade80":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>Sì</button>
            <button onClick={()=>uP(group.id,si,sub.id,"convergente",false)} style={{padding:"6px 20px",borderRadius:6,border:sd.convergente===false?"2px solid #dc3545":"1px solid rgba(255,255,255,0.12)",background:sd.convergente===false?"rgba(220,53,69,0.15)":"rgba(255,255,255,0.03)",color:sd.convergente===false?"#f87171":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>No</button>
          </div>}
        </div>
      )}

      {/* Contract data */}
      {sub.hasContract&&!sub.isVFMobile&&!sub.isCBVF&&!sub.isVFFisso&&!sub.isVerisure&&!sub.isKaskoFacile&&!sub.isVFCare&&!sub.isVFBizMobile&&!sub.isCBVFBiz&&!sub.isVFFissoBiz&&!sub.isVFSolDig&&!sub.isFWMobile&&!sub.isFWFisso&&!sub.isFWEnergia&&!sub.isILMobile&&!sub.isILFisso&&!sub.isENLuceGas&&(
        <div style={{borderTop:"1px solid "+group.color+"20",paddingTop:12,marginTop:12}}>
          <div style={{fontSize:10,fontWeight:700,color:group.color,marginBottom:10,textTransform:"uppercase"}}>📋 Dati contratto</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
            <SCd session={sessionCode} codici={codiciW3} val={sd.codiceOverride||""} onCh={v=>uP(group.id,si,sub.id,"codiceOverride",v)}/>
          {sub.ct==="ga"&&<>
            <TF l="Codice Contratto" r v={c.codice_contratto||""} o={v=>uC(group.id,si,sub.id,"codice_contratto",v)} p="es. 167942"/>
            <TF l="Numero Provvisorio" v={c.num_provvisorio||""} o={v=>uC(group.id,si,sub.id,"num_provvisorio",v)} p="393XXX"/>
            {showMnpF&&!sub.isMobileBiz&&<TF l="N. Definitivo MNP" v={c.num_definitivo||""} o={v=>uC(group.id,si,sub.id,"num_definitivo",v)} p="Portare"/>}
            {showMnpF&&!sub.isMobileBiz&&<DD l="Brand MNP" v={c.brand_mnp||""} o={v=>uC(group.id,si,sub.id,"brand_mnp",v)} vals={brandMNP}/>}
            {showMnpF&&sub.isMobileBiz&&<TF l="N. Definitivo MNP" v={c.num_definitivo||""} o={v=>uC(group.id,si,sub.id,"num_definitivo",v)} p="Portare"/>}
            <TF l="ICCID" v={c.iccid||""} o={v=>uC(group.id,si,sub.id,"iccid",v)} p="893..." nt="Barcode 📷"/>
            {sub.isMobileBiz&&(sd.tnpGa==="Sì"||sd.tnpGa===true)&&sd.tnpTipo&&<DD l="Modello Terminale" r v={c.modello||""} o={v=>uC(group.id,si,sub.id,"modello",v)} vals={SMARTPHONES}/>}
            {sub.isMobileBiz&&(sd.tnpGa==="Sì"||sd.tnpGa===true)&&sd.tnpTipo&&<TF l="IMEI" r v={c.imei||""} o={v=>uC(group.id,si,sub.id,"imei",v)} p="15 cifre" nt="Barcode 📷"/>}
          </>}
          {sub.ct==="tnp_ga"&&<>
            <TF l="Codice Contratto" r v={gaOn?(gaC.codice_contratto||""):(c.codice_contratto||"")} o={v=>uC(group.id,si,sub.id,"codice_contratto",v)} p={gaOn?"← da Mobile GA":"es. 167942"} dis={gaOn} nt={gaOn?"Auto da Mobile GA":""}/>
            <TF l="Modello Terminale" v={c.modello||""} o={v=>uC(group.id,si,sub.id,"modello",v)} p="Samsung S25"/>
            <TF l="IMEI" v={c.imei||""} o={v=>uC(group.id,si,sub.id,"imei",v)} p="15 cifre" nt="Barcode 📷"/>
          </>}
          {sub.ct==="tnp_cb"&&<>
            <TF l="Codice Contratto" r v={c.codice_contratto||""} o={v=>uC(group.id,si,sub.id,"codice_contratto",v)} p="es. 167942"/>
            <TF l="Modello Terminale" v={c.modello||""} o={v=>uC(group.id,si,sub.id,"modello",v)} p="iPhone 16"/>
            <TF l="IMEI" v={c.imei||""} o={v=>uC(group.id,si,sub.id,"imei",v)} p="15 cifre" nt="Barcode 📷"/>
          </>}
          {sub.ct==="fisso"&&!isVCMode&&<>
            <TF l="Codice Contratto" r v={c.codice_contratto||""} o={v=>uC(group.id,si,sub.id,"codice_contratto",v)} p="es. 167942"/>
            <TF l="N. Fisso Provvisorio" v={c.num_fisso_prov||""} o={v=>uC(group.id,si,sub.id,"num_fisso_prov",v)} p="06XXXX"/>
            {sub.hasFwaImei&&<TF l="IMEI" v={c.imei||""} o={v=>uC(group.id,si,sub.id,"imei",v)} p="15 cifre" nt="Barcode 📷"/>}
          </>}
          {sub.ct==="fisso"&&isVCMode&&<>
            <TF l="Codice Contratto" r v={c.codice_contratto||""} o={v=>uC(group.id,si,sub.id,"codice_contratto",v)} p="es. 167942"/>
            <TF l="N. Fisso Provvisorio" v={c.num_fisso_prov||""} o={v=>uC(group.id,si,sub.id,"num_fisso_prov",v)} p="06XXXX"/>
            <TF l="IMEI" v={c.imei||""} o={v=>uC(group.id,si,sub.id,"imei",v)} p="15 cifre" nt="Barcode 📷"/>
          </>}
          {sub.ct==="lg"&&<>
            <DD l="Operatore provenienza" r v={sd.opProvenienza||""} o={v=>uP(group.id,si,sub.id,"opProvenienza",v)} vals={opProv}/>
            <TF l="Codice Contratto" r v={c.codice_contratto||""} o={v=>uC(group.id,si,sub.id,"codice_contratto",v)} p="es. 167942"/>
            {sub.id==="luce"&&<TF l="POD" v={c.pod||""} o={v=>uC(group.id,si,sub.id,"pod",v.toUpperCase().replace(/[^A-Z0-9]/g,""))} p="IT001E..." nt="Alfanumerico"/>}
            {sub.id==="gas"&&<TF l="PDR" v={c.pdr||""} o={v=>uC(group.id,si,sub.id,"pdr",v.replace(/[^A-Za-z0-9]/g,""))} p="Codice PDR" nt="Alfanumerico"/>}
          </>}
          {sub.ct==="multi"&&(sub.isAssicBiz||sub.id==="assicurazioni")&&(
            <TF l="Numero Polizza" v={c.nPolizza||""} o={v=>uC(group.id,si,sub.id,"nPolizza",v)} p="es. 12345678"/>
          )}
          </div>
        </div>
      )}
    </div>
  );
  return content;
};

const NoteStep = () => {
  const [show,setShow]=useState(false);
  const content = (
    <div className="glass-card mb-6 p-6" style={{borderLeft:"4px solid #e83e8c"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#e83e8c",marginBottom:14,textTransform:"uppercase"}}>📝 Step 7 — Note / Promemoria</div>
      <div style={{textAlign:"center",marginBottom:show?16:0}}>
        <div style={{fontSize:13,fontWeight:600,color:"#f8fafc",marginBottom:10}}>Nota o promemoria?</div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={()=>setShow(true)} style={{padding:"8px 28px",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",border:show?"2px solid #28a745":"1px solid rgba(255,255,255,0.12)",background:show?"rgba(40,167,69,0.15)":"rgba(255,255,255,0.03)",color:show?"#4ade80":"#94a3b8"}}>Sì</button>
          <button onClick={()=>setShow(false)} style={{padding:"8px 28px",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",border:!show?"2px solid #dc3545":"1px solid rgba(255,255,255,0.12)",background:!show?"rgba(220,53,69,0.15)":"rgba(255,255,255,0.03)",color:!show?"#f87171":"#94a3b8"}}>No</button>
        </div>
      </div>
      {show&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={{border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:14,background:"rgba(255,255,255,0.03)"}}><div style={{fontSize:13,fontWeight:700,marginBottom:8}}>📋 Nota</div><textarea placeholder="Nota…" rows={3} style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/></div>
        <div style={{border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:14,background:"rgba(255,255,255,0.03)"}}><div style={{fontSize:13,fontWeight:700,marginBottom:8}}>📅 Promemoria</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><div><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Data</div><input type="date" className="glass-input w-full"/></div><div><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Ora</div><input type="time" className="glass-input w-full"/></div></div>
          <div style={{marginTop:8}}><DD l="Negozio" vals={negozi}/></div>
          <div style={{marginTop:8}}><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Descrizione</div><textarea placeholder="Dettagli…" rows={2} style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/></div>
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
  const [brand,setBrand]=useState(null);
  const [showMargPOS,setShowMargPOS]=useState(false);
  const [margEditItem,setMargEditItem]=useState(null);
  const [showMargList,setShowMargList]=useState(false);
  const [showMargSection,setShowMargSection]=useState(false);
  const [showMargSave,setShowMargSave]=useState(false);
  const [margSaveForm,setMargSaveForm]=useState({nome:"",cognome:"",tel:"",anonimo:false});
  const [margItems,setMargItems]=useState([]);
  const [draftLoaded,setDraftLoaded]=useState(false);
  const [showCart,setShowCart]=useState(false);
    const [toast,setToast]=useState(null);
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState([]);

  const [expI,setExpI]=useState({});
  const [tipoCliente,setTipoCliente]=useState(null);
  const [lookupValue,setLookupValue]=useState("");
  const [clienteFound,setClienteFound]=useState(false);
  const [showAna,setShowAna]=useState(false);
  const [ana,setAna]=useState({nome:"",cognome:"",cellulare:"",email:"",via:"",cap:"",citta:"",ragioneSociale:"",nomeRef:"",cognomeRef:"",recapito:""});
  const [sales,setSales]=useState({});
  const [sesCode,setSesCode]=useState("");
  const [cart,setCart]=useState([]);

  const [selVend,setSelVend]=useState("Alberto");
  const [selNeg,setSelNeg]=useState("Magliana");
  const [confirmReset,setConfirmReset]=useState(false);
  const [showStep4,setShowStep4]=useState(false);
  const [vfQtyModal,setVfQtyModal]=useState(null);

  // ── CF Generator state ──
  const [showCFGen,setShowCFGen]=useState(false);
  const [cfGen,setCfGen]=useState({nome:"",cognome:"",sesso:"M",giorno:"",mese:"",anno:"",comune:"",estero:false,paese:""});
  const [cfSearch,setCfSearch]=useState("");
  const [cfResult,setCfResult]=useState("");
  const cfComuneRef=useRef(null);
  const uCF=(k,v)=>setCfGen(p=>({...p,[k]:v}));
  const filteredComuni=cfSearch.length>=2?_CNA.filter(c=>c.toLowerCase().startsWith(cfSearch.toLowerCase())).slice(0,8):[];
  const doCalcolaCF=()=>{
    const result=calculateCF({nome:cfGen.nome,cognome:cfGen.cognome,sesso:cfGen.sesso,giorno:cfGen.giorno,mese:cfGen.mese,anno:cfGen.anno,comune:cfGen.comune,estero:cfGen.estero,paese:cfGen.paese});
    if(result){setCfResult(result);setLookupValue(result);}
  };

  const bObj=brand?BRANDS.find(b=>b.id===brand):null;
  const cats=(brand==="windtre"?getW3(tipoCliente):brand==="vodafone"?getVF(tipoCliente):brand==="fastweb"?getFW(tipoCliente):brand==="iliad"?getIL(tipoCliente):brand==="energy"?getEN(tipoCliente):[]);
  const sT=m=>{setToast(m);setTimeout(()=>setToast(null),3500)};
  const uA=(k,v)=>setAna(p=>({...p,[k]:v}));
  const gS=catId=>sales[catId]||[{}];

  const togSub=(catId,si,subId,radioSubs)=>{setSales(p=>{const cs=[...(p[catId]||[{}])];if(!cs[si])cs[si]={};const cur=cs[si][subId];if(cur&&cur.active){cs[si]={...cs[si],[subId]:null}}else{if(radioSubs){const updated={...cs[si]};radioSubs.forEach(rs=>{if(rs!==subId)updated[rs]=null});updated[subId]=emS();cs[si]=updated}else{cs[si]={...cs[si],[subId]:emS()}}};return{...p,[catId]:cs}})};
  const uF=(catId,si,subId,fk,val)=>{setSales(p=>{const cs=[...(p[catId]||[{}])];if(!cs[si])cs[si]={};const sub=cs[si][subId]||emS();cs[si]={...cs[si],[subId]:{...sub,fields:{...(sub.fields||{}),[fk]:val}}};return{...p,[catId]:cs}})};
  const uC=(catId,si,subId,fk,val)=>{setSales(p=>{const cs=[...(p[catId]||[{}])];if(!cs[si])cs[si]={};const sub=cs[si][subId]||emS();cs[si]={...cs[si],[subId]:{...sub,contract:{...(sub.contract||{}),[fk]:val}}};return{...p,[catId]:cs}})};
  const uP=(catId,si,subId,prop,val)=>{setSales(p=>{const cs=[...(p[catId]||[{}])];if(!cs[si])cs[si]={};const sub=cs[si][subId]||emS();if(prop==="__resetVFOffer__"){cs[si]={...cs[si],[subId]:{...sub,vfOffer:null,vfMnp:null,vfMnpBrand:"",vfMnpNum:"",vfDomicilio:null,vfConvergenza:null,vfNumFisso:"",vfTnp:null,vfTnpList:[],dcNumProv:"",dcNum:"",dcIccid:"",dcCodIns:"",dcRicaricaAuto:null,vfSecurity:null}};}else if(prop==="__resetVFOfferTo__"){const{offer,isDV}=val;cs[si]={...cs[si],[subId]:{...emS(),active:true,vfOffer:offer,vfMnp:isDV?"No":null,vfDomicilio:isDV?"Wallet":null}};}else{const newVal=typeof val==="function"?val(sub[prop]):val;cs[si]={...cs[si],[subId]:{...sub,[prop]:newVal}};}return{...p,[catId]:cs}})};
  const addSl=catId=>setSales(p=>({...p,[catId]:[...(p[catId]||[{}]),{}]}));
  const rmSl=(catId,idx)=>setSales(p=>{const c=[...(p[catId]||[{}])];c.splice(idx,1);return{...p,[catId]:c.length?c:[{}]}});
  const [skyS,setSkyS]=useState([{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:""}]);
  const uSkyF=(si,field,val)=>setSkyS(p=>{const n=[...p];n[si]={...n[si],[field]:val};return n});
  const togSky=(si,pr)=>{setSkyS(p=>{const n=[...p];const s={...n[si]};if(SKY_TV.indexOf(pr)>=0){s.tvSel=s.tvSel===pr?null:pr;s.tvCC="";}else if(SKY_FIBRA.indexOf(pr)>=0){s.fibraSel=s.fibraSel===pr?null:pr;s.fibraCC="";s.fibraGnp=null;s.fibraGnpBrand="";s.fibraGnpNum="";}else if(pr==="Sky Mobile"){s.mobileSel=!s.mobileSel;s.mobMnp=null;s.mobNumProv="";s.mobNumDef="";s.mobBrandMnp="";s.mobIccid="";s.mobNum="";s.mobIccidNo="";}n[si]=s;return n;});};
  const openVFModal=({catId,si,subId,offer})=>{const cur=((sales[catId]||[{}])[si]||{})[subId];const existQty=cur&&cur.vfOffers&&cur.vfOffers[offer]?cur.vfOffers[offer]:1;setVfQtyModal({catId,si,subId,offer,tempQty:existQty});};
  const confirmVFQty=()=>{if(!vfQtyModal)return;const{catId,si,subId,offer,tempQty}=vfQtyModal;const cur=((sales[catId]||[{}])[si]||{})[subId];const baseO=(cur&&cur.vfOffers)||{};const newVfOffers={...baseO};if(tempQty>0)newVfOffers[offer]=tempQty;else delete newVfOffers[offer];const existC=(cur&&cur.vfContratti&&cur.vfContratti[offer])||[];const newC=Array.from({length:tempQty},(_,i)=>existC[i]||{codIns:"",codContratto:"",numProv:"",iccid:""});const newVfC={...((cur&&cur.vfContratti)||{}),[offer]:newC};uP(catId,si,subId,"vfOffers",newVfOffers);uP(catId,si,subId,"vfContratti",newVfC);setVfQtyModal(null);};

  const colItems=useCallback(()=>{
    const items=[];
    if(brand==="windtre"||brand==="vodafone"||brand==="fastweb"||brand==="iliad"||brand==="energy"){const getCats=brand==="windtre"?getW3(tipoCliente):getVF(tipoCliente);getCats.forEach(g=>{(sales[g.id]||[{}]).forEach((sale,si)=>{g.subs.forEach(sub=>{const d=sale[sub.id];if(d&&d.active){const det={...(d.fields||{}),...(d.contract||{}),hasContract:!!sub.hasContract};if(d.tipMob)det["Tipologia"]=d.tipMob;if(d.mnp!=null)det["MNP"]=d.mnp===true||d.mnp==="Sì"?"Sì":"No";if(d.easyPay!=null)det["EasyPay"]=d.easyPay==="Sì"||d.easyPay===true?"Sì":"No";if(d.tnpGa==="Sì"||d.tnpGa===true){det["TNP GA"]="Sì";if(d.tnpTipo)det["Tipo TNP"]=d.tnpTipo;if(d.tnpModello)det["Terminale"]=d.tnpModello;if(d.tnpImei)det["IMEI TNP"]=d.tnpImei;if(d.tnpTipo&&d.tnpTipo.startsWith("Finanziamento"))det["Finanziamento"]="Approvato"};const gaRl=d.tnpGaReloadSel?Object.keys(d.tnpGaReloadSel).filter(k=>d.tnpGaReloadSel[k]):[];if(gaRl.length)det["Reload GA"]=gaRl.join(", ");if(d.reloadForever)det["Reload Forever"]="Sì";const secK=d.securitySel?Object.keys(d.securitySel).filter(k=>d.securitySel[k]):[];if(secK.length)det["Security"]=secK.join(", ");if(d.cbTnp){det["TNP CB"]="Sì";if(d.cbTnpCodIns)det["Cod.Ins.CB"]=d.cbTnpCodIns;if(d.cbTnpCell)det["Cell.CB"]=d.cbTnpCell;if(d.cbTnpCC)det["CC.CB"]=d.cbTnpCC;if(d.cbTnpTipo)det["Tipo CB"]=d.cbTnpTipo;if(d.cbTnpModello)det["Term.CB"]=d.cbTnpModello;if(d.cbTnpImei)det["IMEI CB"]=d.cbTnpImei;if(d.cbTnpTipo&&d.cbTnpTipo.startsWith("Finanziamento"))det["Fin.CB"]="Approvato"};const cbRl=d.cbTnpReloadSel?Object.keys(d.cbTnpReloadSel).filter(k=>d.cbTnpReloadSel[k]):[];if(cbRl.length)det["Reload CB"]=cbRl.join(", ");if(d.cbCambio&&d.cbCambioVal){det["Cambio Off."]=d.cbCambioVal;if(d.cbCambioCodIns)det["Cod.Ins.Cambio"]=d.cbCambioCodIns;if(d.cbCambioCell)det["Cell.Cambio"]=d.cbCambioCell;if(d.cbCambioCC)det["CC.Cambio"]=d.cbCambioCC};const cbAd=d.cbAddonSel?Object.keys(d.cbAddonSel).filter(k=>d.cbAddonSel[k]):[];if(cbAd.length)det["Add-on CB"]=cbAd.join(", ");if(d.gnp)det.GNP="Sì";if(d.gnpNum)det["N.GNP"]=d.gnpNum;if(d.gnpOp)det["Op.GNP"]=d.gnpOp;if(d.secondaLinea)det["2°Linea"]="Sì";if(d.domiciliazione)det["Domic."]="Sì";if(d.opProvenienza)det["Op.Prov."]=d.opProvenienza;if(d.domiciliato!=null)det["Domiciliato"]=d.domiciliato?"Sì":"No";if(d.voceCasaCb===true||d.voceCasaCb==="Sì")det["Voce Casa CB"]="Sì";if(d.convergente!=null)det["Convergente"]=d.convergente?"Sì":"No";const adks=d.addons?Object.keys(d.addons).filter(k=>d.addons[k]):[];if(adks.length)det["Add-on"]=adks.join(", ");items.push({macro:g.title,macroColor:g.color,macroIcon:g.icon,sub:sub.title,saleNum:si+1,details:det})}})})})
    }else if(brand==="sky"){skyS.forEach((s,si)=>{if(s.tvSel)items.push({macro:"SKY TV",macroColor:"#0072C6",macroIcon:"📺",sub:s.tvSel,saleNum:si+1,details:{hasContract:true,"Codice Contratto":s.tvCC||""}});if(s.fibraSel){const det={hasContract:true,"Codice Contratto":s.fibraCC||"","GNP":s.fibraGnp==="Sì"?"Sì":"No"};if(s.fibraGnp==="Sì"){det["Brand GNP"]=s.fibraGnpBrand||"";det["N.Fisso Portabilità"]=s.fibraGnpNum||""}items.push({macro:"SKY FIBRA",macroColor:"#0072C6",macroIcon:"🌐",sub:s.fibraSel,saleNum:si+1,details:det})}if(s.mobileSel){const det={hasContract:false,"MNP":s.mobMnp==="Sì"?"Sì":"No"};if(s.mobMnp==="Sì"){det["N.Provvisorio"]=s.mobNumProv||"";det["N.Definitivo"]=s.mobNumDef||"";det["Brand MNP"]=s.mobBrandMnp||"";det["ICCID"]=s.mobIccid||""}else if(s.mobMnp==="No"){det["Numero"]=s.mobNum||"";det["ICCID"]=s.mobIccidNo||""}items.push({macro:"SKY MOBILE",macroColor:"#0072C6",macroIcon:"📱",sub:"Sky Mobile",saleNum:si+1,details:det})}});}
    return items;
  },[brand,sales,skyS,tipoCliente]);

  const addCart=()=>{
    const items=colItems();
    if(items.length>0&&bObj){const snap={sales:JSON.parse(JSON.stringify(sales)),sesCode,skyS:JSON.parse(JSON.stringify(skyS))};setCart(p=>[...p,{brandId:brand,brandLabel:bObj.label,brandIcon:bObj.icon,brandColor:bObj.color,items,sv:snap}]);sT("✅ "+items.length+" prodotti "+bObj.label)}
    setSales({});setSesCode("");setSkyS([{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:""}]);setBrand(null);
  };
  const editCG=idx=>{const g=cart[idx];if(!g)return;setBrand(g.brandId);if(g.sv){setSales(g.sv.sales||{});setSesCode(g.sv.sesCode||"");setSkyS(g.sv.skyS||[{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:""}])}setCart(p=>p.filter((_,i)=>i!==idx));setShowCart(false);sT("✏️ Modifica "+g.brandLabel)};
  const rmCG=idx=>setCart(p=>p.filter((_,i)=>i!==idx));
  const fullReset=()=>{setBrand(null);setTipoCliente(null);setLookupValue("");setClienteFound(false);setShowAna(false);setSales({});setSesCode("");setSkyS([{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:""}]);setCart([]);setShowCart(false);setExpI({});setConfirmReset(false);setShowStep4(false);setMargItems([]);clearDraft("crm_v9");setAna({nome:"",cognome:"",cellulare:"",email:"",via:"",cap:"",citta:"",ragioneSociale:"",nomeRef:"",cognomeRef:"",recapito:""})};
  // ── Auto-save every state change ──
  useAutoSave("crm_v9",{brand,tipoCliente,ana,sales,sesCode,skyS,selVend,selNeg,lookupValue,margItems});
  
  // ── Load draft on mount (once) ──
  useEffect(()=>{if(draftLoaded)return;setDraftLoaded(true);const d=loadDraft("crm_v9");if(d){if(d.tipoCliente)setTipoCliente(d.tipoCliente);if(d.ana)setAna(d.ana);if(d.selVend)setSelVend(d.selVend);if(d.selNeg)setSelNeg(d.selNeg);if(d.margItems)setMargItems(d.margItems)}},[]);
  
  // ── Remember last brand+tipo for next session ──
  useEffect(()=>{if(tipoCliente)try{sessionStorage.setItem("crm_lastTipo",tipoCliente)}catch(e){}},[tipoCliente]);
  
  // ── Marginalità handlers ──
  const addMargItem=(item)=>{setMargItems(p=>[...p,item]);setShowMargPOS(false)};
  const rmMargItem=(idx)=>setMargItems(p=>p.filter((_,i)=>i!==idx));

  
  const handleDownloadPDF = async () => {
    try {
      const pdfBytes = await generateContractPDF(ana, cart, margItems);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUri = reader.result;
        const link = document.createElement("a");
        const cleanNome = (ana.nome || "Cliente").trim().replace(/\s+/g, "_");
        const cleanCognome = (ana.cognome || "Sconosciuto").trim().replace(/\s+/g, "_");
        const filename = `Contratto_${cleanNome}_${cleanCognome}.pdf`;
        link.href = dataUri;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast("✓ PDF generato e scaricato");
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error("PDF Error:", err);
      showToast("? Errore generazione PDF");
    }
  };

const finalSubmit = async () => {
    const cur = colItems();
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

    if (fc.length === 0 && margItems.length === 0) {
      showToast("⚠️ Nessun prodotto da salvare");
      return;
    }

    try {
      // 1. Resolve CF/PIVA — ensure it's never empty
      const cfPiva = lookupValue || "";
      if (!cfPiva) {
        showToast("⚠️ Codice Fiscale / P.IVA obbligatorio");
        return;
      }

      // 2. Check if client already exists by cf_piva
      const { data: existingClient } = await supabase
        .from("clients")
        .select("id")
        .eq("cf_piva", cfPiva)
        .maybeSingle();

      const clientId = existingClient?.id || `CL-${cfPiva.replace(/\s/g, "")}-${Date.now()}`;

      const clientData = {
        id: clientId,
        tipo: tipoCliente === "privato" ? "consumer" : "business",
        nome: ana.nome || "",
        cognome: ana.cognome || "",
        ragione_sociale: ana.ragioneSociale || "",
        nome_ref: ana.nomeRef || "",
        cognome_ref: ana.cognomeRef || "",
        cellulare: ana.cellulare || ana.recapito || "",
        email: ana.email || "",
        cf_piva: cfPiva,
        indirizzo: ana.via || "",
        cap: ana.cap || "",
        citta: ana.citta || "",
        is_demo: false
      };

      const { error: clientErr } = await supabase.from("clients").upsert(clientData, { onConflict: "id" });
      if (clientErr) throw clientErr;

      // 3. Upload Attachments
      setUploading(true);
      const uploadedFiles = [];
      let uploadFailCount = 0;
      for (const att of attachments) {
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
          uploadedFiles.push({ url: publicUrl, name: att.name, type: att.type });
        }
      }
      if (uploadFailCount > 0) {
        showToast(`⚠️ ${uploadFailCount} file non caricati — controlla la connessione`);
      }

      // 4. Prepare Contract Rows
      const contractRows = [];
      const dateStr = new Date().toISOString().split("T")[0];

      fc.forEach(group => {
        (group.items || []).forEach((item) => {
          const actCode = item.details["Codice Contratto"] || item.details["Codice Proposta"] || item.details["Codice Ordine"] || item.details["Codice"] || "—";
          contractRows.push({
            id: `CTR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            client_id: clientId,
            data: dateStr,
            brand: group.brandLabel,
            categoria: item.macro,
            prodotto: item.sub,
            stato: "Attivo",
            venditore: selVend,
            negozio: selNeg,
            codice_attivazione: String(actCode),
            data_registrazione: dateStr,
            data_attivazione: dateStr,
            dettagli: item.details || {},
            is_demo: false
          });
        });
      });

      margItems.forEach(mi => {
        contractRows.push({
          id: `EXT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          client_id: clientId,
          data: dateStr,
          brand: "Extra",
          categoria: "Prodotto/Servizio",
          prodotto: mi.product,
          stato: "Attivo",
          venditore: mi.vendor || selVend,
          negozio: mi.store || selNeg,
          codice_attivazione: "VENDITA-DIRETTA",
          data_registrazione: dateStr,
          data_attivazione: dateStr,
          dettagli: { product: mi.product, price: mi.price, margin: mi.margin, qty: mi.qty, model: mi.model, imei: mi.imei },
          is_demo: false
        });
      });

      // 5. Insert contracts then link attachments
      if (contractRows.length > 0) {
        const { data: createdContracts, error: contractErr } = await supabase.from("contracts").insert(contractRows).select();
        if (contractErr) throw contractErr;

        if (uploadedFiles.length > 0 && createdContracts && createdContracts.length > 0) {
          const firstContractId = createdContracts[0].id;
          const attendanceRows = uploadedFiles.map(f => ({
            contract_id: firstContractId,
            file_url: f.url,
            file_name: f.name,
            file_type: f.type
          }));
          const { error: attErr } = await supabase.from("contract_attachments").insert(attendanceRows);
          if (attErr) console.error("Attachment Meta Error:", attErr);
        }
      }

      setUploading(false);
      showToast(`✅ Salvato! ${fc.length} brand, ${contractRows.length} prodotti in totale`);
      setTimeout(fullReset, 2000);
    } catch (err) {
      setUploading(false);
      console.error("Submit Error:", err);
      showToast("❌ Errore durante il salvataggio: " + (err.message || "Verifica connessione"));
    }
  };
  
  const handleFileChange = (e, type) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({
        file,
        name: file.name,
        type
      }));
      setAttachments(prev => [...prev, ...newFiles]);
    }
  };

  const doLookup = async () => {
    if (!lookupValue) return;
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("cf_piva", lookupValue)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setClienteFound(true);
        setShowAna(true);
        setShowStep4(false);
        setAna({
          nome: data.nome || "",
          cognome: data.cognome || "",
          cellulare: data.cellulare || "",
          email: data.email || "",
          via: data.indirizzo || "",
          cap: data.cap || "",
          citta: data.citta || "",
          ragioneSociale: data.ragione_sociale || "",
          nomeRef: data.nome_ref || "",
          cognomeRef: data.cognome_ref || "",
          recapito: data.cellulare || ""
        });
        showToast("✓ Cliente trovato nel database");
      } else {
        setClienteFound(false);
        setShowAna(true);
        setShowStep4(false);
        showToast("✨ Cliente non trovato: Modalità acquisizione nuovo cliente attivata");
      }
    } catch (err) {
      console.error("Lookup error:", err);
      showToast("❌ Errore ricerca cliente");
    }
  };


  const tCI=cart.reduce((s,g)=>s+g.items.length,0)+colItems().length;
  const bC=bObj?bObj.color:"#8892b0";
  const bG=bObj?bObj.gradient:"linear-gradient(135deg,#374151,#6b7280)";
  const gSS=i=>{if(i===0)return brand?"done":"active";if(i===1)return !brand?"pending":tipoCliente?"done":"active";if(i===2)return !tipoCliente?"pending":showAna?"done":"active";return showAna?"active":"pending"};

  // ═══════════ CART ═══════════
  if(showCart){
    const curI=colItems();const allG=[...cart];
    if(curI.length>0&&bObj)allG.push({brandId:brand,brandLabel:bObj.label,brandIcon:bObj.icon,brandColor:bObj.color,items:curI,isCurrent:true});
    const tp=allG.reduce((s,g)=>s+g.items.length,0);
    const onlyMarg=allG.length===0&&margItems.length>0;
    const cartContent = (
      <div className="w-full max-w-[1600px] mx-auto p-4 md:p-6 space-y-4" style={{fontFamily:"Inter,-apple-system,sans-serif",minHeight:"100vh"}}>
        {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"#28a745",color:"#fff",padding:"12px 28px",borderRadius:10,fontSize:14,fontWeight:700,boxShadow:"0 6px 20px rgba(0,0,0,.2)",zIndex:9999}}>{toast}</div>}
        <div style={{background:"linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)",borderRadius:16,padding:"24px 28px",marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div><div style={{color:"#fff",fontWeight:800,fontSize:22,marginBottom:4}}>🛒 Carrello</div><div style={{color:"rgba(255,255,255,.6)",fontSize:13}}>{tipoCliente==="privato"?(ana.nome+" "+ana.cognome):ana.ragioneSociale} · {lookupValue}</div></div>
            <div style={{display:"flex",gap:8}}>
              <div style={{background:"rgba(255,255,255,.15)",borderRadius:10,padding:"8px 16px",textAlign:"center"}}><div style={{color:"#fff",fontWeight:800,fontSize:22}}>{allG.length}</div><div style={{color:"rgba(255,255,255,.6)",fontSize:10}}>BRAND</div></div>
              <div style={{background:"rgba(255,255,255,.15)",borderRadius:10,padding:"8px 16px",textAlign:"center"}}><div style={{color:"#fff",fontWeight:800,fontSize:22}}>{tp}</div><div style={{color:"rgba(255,255,255,.6)",fontSize:10}}>PRODOTTI</div></div>
            </div>
          </div>
        </div>
        {!onlyMarg&&(allG.length===0?<div style={{background:"rgba(255,255,255,0.02)",borderRadius:12,padding:40,textAlign:"center",color:"#64748b"}}><div style={{fontSize:40}}>🛒</div><div style={{fontSize:15,fontWeight:600,marginTop:10}}>Vuoto</div></div>:
          allG.map((g,gi)=>(
            <div key={gi} style={{background:"rgba(255,255,255,0.02)",borderRadius:12,marginBottom:12,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
              <div style={{background:g.brandColor,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>{g.brandIcon}</span><span style={{color:"#fff",fontWeight:700,fontSize:15}}>{g.brandLabel}</span><span style={{background:"rgba(255,255,255,.25)",borderRadius:12,padding:"2px 10px",color:"#fff",fontSize:11,fontWeight:600}}>{g.items.length}</span>{g.isCurrent&&<span style={{background:"#FFD800",borderRadius:12,padding:"2px 10px",color:"#f8fafc",fontSize:10,fontWeight:700}}>IN CORSO</span>}</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>g.isCurrent?setShowCart(false):editCG(gi)} style={{background:"rgba(255,255,255,.25)",border:"none",borderRadius:6,padding:"5px 14px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:700}}>✏️ Modifica</button>
                  {!g.isCurrent&&<button onClick={()=>rmCG(gi)} style={{background:"rgba(255,0,0,.25)",border:"none",borderRadius:6,padding:"5px 14px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:600}}>✕ Rimuovi</button>}
                </div>
              </div>
              <div style={{padding:"6px 16px"}}>
                {g.items.map((it,ii)=><CartItem key={ii} it={it} ii={ii} gi={gi} total={g.items.length} expI={expI} setExpI={setExpI}/>)}              </div>
            </div>
          ))
        )}
        {margItems.length>0&&<div className="glass-card mb-6 p-6" style={{marginTop:12,boxShadow:"0 2px 8px rgba(0,0,0,.06)",overflow:"hidden"}}>
          <div style={{background:"linear-gradient(135deg,#6f42c1,#9b59b6)",padding:"10px 16px",borderRadius:"8px 8px 0 0",margin:"-16px -16px 14px -16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>📦</span><span style={{color:"#fff",fontWeight:700,fontSize:14}}>Prodotti & Marginalità</span><span style={{background:"rgba(255,255,255,.25)",borderRadius:12,padding:"2px 10px",color:"#fff",fontSize:11,fontWeight:600}}>{margItems.length}</span></div>
            <button onClick={()=>{setMargEditItem(null);setShowMargPOS(true)}} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:6,padding:"5px 14px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:700}}>+ Aggiungi</button>
          </div>
          {margItems.map((item,idx)=>(
            <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
              <div>
                <span style={{fontWeight:700,fontSize:13}}>{item.product}</span>
                {item.model&&<span style={{fontSize:11,color:"#64748b",marginLeft:6}}>{item.model}</span>}
                <span style={{fontSize:11,color:"#6f42c1",marginLeft:8}}>x{item.qty||1}</span>
              </div>
              <button onClick={()=>{const it=margItems[idx];setMargItems(p=>p.filter((_,i)=>i!==idx));setMargEditItem(it);setShowCart(false);setShowMargPOS(true)}} style={{padding:"4px 12px",borderRadius:6,border:"1px solid #6f42c1",background:"rgba(255,255,255,0.04)",color:"#6f42c1",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>✏️ Modifica</button>
            </div>
          ))}
        </div>}
        {!onlyMarg&&<div className="glass-card mb-6 p-6" style={{borderLeft:"4px solid #17a2b8",marginTop:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#17a2b8",marginBottom:14,textTransform:"uppercase"}}>📎 Step 5 — Allegati</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            {[{l:"Documento",i:"🪪",t:"documento"},{l:"Contratti",i:"📄",t:"contratto"},{l:"Altro",i:"📁",t:"altro"}].map((a,i)=>(
              <label key={i} style={{border:"2px dashed rgba(255,255,255,0.15)",borderRadius:10,padding:"14px 10px",textAlign:"center",cursor:"pointer",background:"rgba(255,255,255,0.03)",transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(23,162,184,0.5)";e.currentTarget.style.background="rgba(23,162,184,0.05)"}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.15)";e.currentTarget.style.background="rgba(255,255,255,0.03)"}}>
                <input type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={e=>handleFileChange(e,a.t)} style={{display:"none"}}/>
                <div style={{fontSize:24,marginBottom:4}}>{a.i}</div>
                <div style={{fontSize:11,fontWeight:700,color:"#f8fafc",marginBottom:2}}>{a.l}</div>
                <div style={{fontSize:10,color:"#64748b",marginBottom:6}}>Trascina o clicca</div>
                <div style={{display:"inline-block",padding:"4px 12px",borderRadius:6,background:"#17a2b8",color:"#fff",fontSize:10,fontWeight:600}}>Carica</div>
                {attachments.filter(f=>f.type===a.t).length>0&&<div style={{marginTop:6,fontSize:10,color:"#17a2b8",fontWeight:700}}>{attachments.filter(f=>f.type===a.t).length} file</div>}
              </label>
            ))}
          </div>
          {attachments.length>0&&<div style={{marginTop:12,padding:12,background:"rgba(255,255,255,0.03)",borderRadius:8,border:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:8,textTransform:"uppercase"}}>File caricati ({attachments.length})</div>
            {attachments.map((f,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:i<attachments.length-1?"1px solid rgba(255,255,255,0.05)":"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:10,color:"#17a2b8",fontWeight:700,textTransform:"uppercase",background:"rgba(23,162,184,0.1)",padding:"2px 6px",borderRadius:4}}>{f.type}</span>
                <span style={{fontSize:12,color:"#f8fafc"}}>{f.name}</span>
              </div>
              <button onClick={()=>setAttachments(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#dc3545",cursor:"pointer",fontSize:11,fontWeight:700}}>✕</button>
            </div>)}
          </div>}
        </div>}
        {!onlyMarg&&<div className="glass-card mb-6 p-6" style={{borderLeft:"4px solid #28a745"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#28a745",marginBottom:14,textTransform:"uppercase"}}>🏪 Step 6 — Attribuzione</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px 16px"}}>
            <DD l="Venditore" r v={selVend} o={v=>setSelVend(v)} vals={venditori} nt="Dal login — editabile"/><DD l="Negozio" r v={selNeg} o={v=>setSelNeg(v)} vals={negozi} nt="Dal login — editabile"/>
            <div><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Data <span style={{color:"#dc3545"}}>*</span></div><input type="date" defaultValue="2026-03-07" className="glass-input w-full"/></div>
          </div>
        </div>}
        {!onlyMarg&&<NoteStep/>}
        <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
          <button onClick={()=>setShowCart(false)} style={{padding:"12px 24px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.02)",color:"#8892b0",fontSize:13,fontWeight:600,cursor:"pointer"}}>← Torna</button>
<button onClick={handleDownloadPDF} disabled={!ana.nome && cart.length === 0} style={{padding:"11px 26px",borderRadius:10,border:"1px solid rgba(99, 102, 241, 0.3)",background:"rgba(99, 102, 241, 0.1)",color:"#818cf8",fontSize:13,fontWeight:700,cursor:(ana.nome || cart.length > 0) ? "pointer":"not-allowed",display:"flex",alignItems:"center",gap:8,opacity:(ana.nome || cart.length > 0)?1:0.5}}>Scarica PDF</button>
          {!onlyMarg&&<button onClick={()=>{if(brand&&colItems().length>0)addCart();else{setBrand(null);setShowCart(false)}}} style={{padding:"12px 24px",borderRadius:10,border:"2px solid #6f42c1",background:"rgba(111,66,193,0.1)",color:"#6f42c1",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Altro brand</button>}
          {onlyMarg&&<button onClick={()=>setShowMargSave(true)} style={{padding:"12px 36px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#6f42c1,#9b59b6)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",marginLeft:"auto"}}>💾 Salva Marginalità ({margItems.length})</button>}
          {!onlyMarg&&<button onClick={finalSubmit} disabled={tp===0} style={{padding:"12px 36px",borderRadius:10,border:"none",background:tp>0?"linear-gradient(135deg,#28a745,#20c997)":"#ccc",color:"#fff",fontSize:14,fontWeight:800,cursor:tp>0?"pointer":"not-allowed",marginLeft:"auto"}}>💾 Salva contratto ({tp})</button>}
        </div>
        {showMargSave&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
          <div style={{background:"rgba(255,255,255,0.02)",borderRadius:16,width:"100%",maxWidth:420,padding:24,boxShadow:"0 8px 40px rgba(0,0,0,.25)",margin:"0 16px"}}>
            <div style={{fontWeight:800,fontSize:17,color:"#f8fafc",marginBottom:4}}>💾 Salva Vendita Prodotti</div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:16}}>Riepilogo: {margItems.length} prodott{margItems.length===1?"o":"i"} registrat{margItems.length===1?"o":"i"}</div>
            <div style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
              {margItems.map((item,idx)=>(
                <div key={idx} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                  <span style={{fontWeight:600}}>{item.product} x{item.qty||1}</span>
                  {item.model&&<span style={{color:"#64748b"}}>{item.model}</span>}
                </div>
              ))}
            </div>
            <label style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,cursor:"pointer",background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"10px 14px"}}>
              <input type="checkbox" checked={margSaveForm.anonimo} onChange={e=>setMargSaveForm(p=>({...p,anonimo:e.target.checked}))} style={{width:18,height:18,cursor:"pointer"}}/>
              <div><div style={{fontWeight:700,fontSize:13,color:"#f8fafc"}}>Vendi senza dati cliente</div><div style={{fontSize:11,color:"#64748b"}}>Salta nome, cognome e telefono</div></div>
            </label>
            {!margSaveForm.anonimo&&<div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Nome <span style={{color:"#dc3545"}}>*</span></div><input value={margSaveForm.nome} onChange={e=>setMargSaveForm(p=>({...p,nome:e.target.value}))} placeholder="Es. Mario" style={{width:"100%",padding:"8px 10px",borderRadius:7,border:"1px solid rgba(255,255,255,0.1)",fontSize:13,boxSizing:"border-box"}}/></div>
                <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Cognome <span style={{color:"#dc3545"}}>*</span></div><input value={margSaveForm.cognome} onChange={e=>setMargSaveForm(p=>({...p,cognome:e.target.value}))} placeholder="Es. Rossi" style={{width:"100%",padding:"8px 10px",borderRadius:7,border:"1px solid rgba(255,255,255,0.1)",fontSize:13,boxSizing:"border-box"}}/></div>
              </div>
              <div><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Telefono <span style={{color:"#dc3545"}}>*</span></div><input value={margSaveForm.tel} onChange={e=>setMargSaveForm(p=>({...p,tel:e.target.value}))} placeholder="Es. 3391234567" style={{width:"100%",padding:"8px 10px",borderRadius:7,border:"1px solid rgba(255,255,255,0.1)",fontSize:13,boxSizing:"border-box"}}/></div>
            </div>}
            <div style={{display:"flex",gap:10,marginTop:4}}>
              <button onClick={()=>setShowMargSave(false)} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.02)",color:"#8892b0",fontSize:13,fontWeight:700,cursor:"pointer"}}>← Annulla</button>
              <button onClick={()=>{const ok=margSaveForm.anonimo||(margSaveForm.nome.trim()&&margSaveForm.cognome.trim()&&margSaveForm.tel.trim());if(!ok)return;setMargSaveForm({nome:"",cognome:"",tel:"",anonimo:false});setShowMargSave(false);fullReset();showToast("Vendita salvata!");}} style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:"linear-gradient(135deg,#28a745,#218838)",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>✅ Salva vendita</button>
            </div>
          </div>
        </div>}
      </div>
    );
    return cartContent;
  }

  const formContent = (
    <div className="w-full max-w-[1600px] mx-auto p-4 md:p-6 space-y-4" style={{fontFamily:"Inter,-apple-system,sans-serif",minHeight:"100vh"}}>
      {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"#28a745",color:"#fff",padding:"12px 28px",borderRadius:10,fontSize:14,fontWeight:700,boxShadow:"0 6px 20px rgba(0,0,0,.2)",zIndex:9999}}>{toast}</div>}
      <div className="mb-6 px-6 py-5 flex items-center justify-between rounded-2xl border border-white/10" style={{background:bObj?`linear-gradient(135deg, ${bObj.color}18, ${bObj.color}08)`:"rgba(255,255,255,0.04)"}}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center shrink-0" style={{background:bObj?`${bObj.color}20`:"rgba(255,255,255,0.05)"}}>
            {bObj?<Image src={bObj.logo} alt={bObj.label} width={40} height={40} className="w-full h-full object-cover rounded-xl"/>:<span className="text-xl">📋</span>}
          </div>
          <div>
            <div className="text-lg font-bold text-white tracking-tight">Inserimento Contratto</div>
            <div className="flex items-center gap-2 mt-1">
              {bObj&&<span className="px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider" style={{background:`${bObj.color}20`,color:bObj.color}}>{bObj.label}</span>}
              {tipoCliente&&<span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">{tipoCliente}</span>}
              {!bObj&&<span className="text-xs text-slate-500">Seleziona brand</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2.5 items-center">
          <button onClick={()=>setShowMargSection(true)} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 text-sm font-bold transition-all flex items-center gap-2">
            📦 <span className="hidden sm:inline">Marginalità</span>{margItems.length>0&&<span className="px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-300 text-xs font-bold">{margItems.length}</span>}
          </button>
          <button onClick={()=>setShowCart(true)} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 text-sm font-bold transition-all flex items-center gap-2">
            🛒 <span className="hidden sm:inline">Carrello</span>{tCI>0&&<span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-xs font-bold">{tCI}</span>}
          </button>
          {brand&&<button onClick={addCart} className="px-4 py-2.5 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 text-violet-300 text-sm font-bold transition-all flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4"/> <span className="hidden sm:inline">Salva brand</span>
          </button>}
          <button onClick={fullReset} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-slate-400 transition-all" title="Reset">
            <RotateCcw className="w-4 h-4"/>
          </button>
        </div>
      </div>

      <div style={{display:"flex",gap:3,marginBottom:16}}>
        {["Brand","Tipo Cliente","Anagrafica","Prodotti","Allegati","Attribuzione","Note"].map((st,i)=>{
          const s=gSS(i);
          return <div key={i} className="flex flex-col items-center gap-1.5" style={{flex:1}}>
            <div className={`w-full h-1.5 rounded-full transition-all duration-500 ${s==="active"?"shadow-[0_0_12px_rgba(139,92,246,0.4)]":s==="done"?"shadow-[0_0_8px_rgba(16,185,129,0.3)]":""}`} style={{background:s==="active"?bC:s==="done"?"#10b981":"rgba(255,255,255,0.08)"}}/>
            <span className={`text-[9px] font-bold uppercase tracking-wider transition-colors duration-300 ${s==="active"?"text-white":s==="done"?"text-emerald-400":"text-slate-600"}`}>{s==="done"?"✓ ":""}{st}</span>
          </div>
        })}
      </div>

      {(cart.length>0||margItems.length>0)&&<div onClick={()=>setShowCart(true)} style={{background:"linear-gradient(90deg,#1a1a2e,#16213e)",borderRadius:10,padding:"10px 16px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}><div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}><span>🛒</span><span style={{color:"#fff",fontSize:12,fontWeight:600}}>Carrello:</span>{cart.map((g,i)=><span key={i} style={{background:g.brandColor,color:"#fff",borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>{g.brandIcon} {g.items.length}</span>)}{margItems.length>0&&<span style={{background:"#6f42c1",color:"#fff",borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>📦 {margItems.length}</span>}</div><span style={{color:"rgba(255,255,255,.5)",fontSize:11}}>Vedi →</span></div>}

      {!brand?<div className="mb-6 max-w-4xl mx-auto">
        <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:14,textTransform:"uppercase"}}>Step 1 — Seleziona Brand</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {BRANDS.map(b=>(
            <div key={b.id} onClick={()=>{if(b.ready){setBrand(b.id);setSales({});setSkyS([{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:""}]);setSesCode("")}}}
              className={`glass-card p-5 cursor-pointer group hover:bg-white/[0.04] transition-all relative overflow-hidden border ${b.ready?"":"opacity-50 cursor-default"}`}
              style={{borderColor:"rgba(255,255,255,0.08)"}}>
              <div className="absolute top-0 left-0 right-0 h-1" style={{background:`linear-gradient(to right, ${b.color}, ${b.color}88)`}}/>
              {!b.ready&&<div className="absolute inset-0 bg-[rgba(15,17,26,0.85)] flex flex-col items-center justify-center z-10 rounded-2xl backdrop-blur-sm"><span className="text-xl">🔧</span><span className="text-[10px] font-bold text-slate-500">Manutenzione</span></div>}
              <div className="flex flex-col items-center justify-center text-center gap-3 py-2">
                <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center" style={{background:`${b.color}15`}}>
                  <Image src={b.logo} alt={b.label} width={56} height={56} className="w-full h-full object-cover rounded-xl"/>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{b.label}</h3>
                  <p className="text-[10px] font-semibold mt-0.5" style={{color:b.color}}>{b.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <div onClick={()=>setShowMargPOS(true)}
            className="glass-card p-4 cursor-pointer group hover:bg-white/[0.04] transition-all relative overflow-hidden border flex items-center gap-4" style={{borderColor:"rgba(255,255,255,0.08)"}}>
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-violet-600"/>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-violet-500/10 text-2xl shrink-0">📦</div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white">Prodotti & Marginalità</h3>
              <p className="text-[10px] font-semibold text-violet-400 mt-0.5">Registra vendite senza attivazione brand</p>
            </div>
            {margItems.length>0&&<span className="ml-auto px-2.5 py-0.5 rounded-lg bg-violet-500/20 border border-violet-500/20 text-xs font-bold text-violet-300 shrink-0">{margItems.length}</span>}
          </div>
        </div>
      </div>:<div className="glass-panel p-4 mb-3 flex items-center gap-3">
        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">✓ 1</span>
        <div className="w-7 h-7 rounded-xl overflow-hidden flex items-center justify-center shrink-0"><Image src={bObj.logo} alt={bObj.label} width={28} height={28} className="w-full h-full object-cover rounded-xl"/></div>
        <span className="font-bold text-sm text-white tracking-tight">Brand: <span style={{color:bObj.color}}>{bObj.label}{tipoCliente==="business"?" Business":""}</span></span>
      </div>}

      {brand&&!showStep4&&<div className="glass-card mb-6 p-6 space-y-5">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
          <User className="w-3.5 h-3.5" /> Step 2 — Tipo Cliente
        </h3>

        {/* Tipo toggle - pill style matching clienti */}
        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 w-max">
          {(["privato","business"] as const).map(t=>(
            <button key={t} onClick={()=>{setTipoCliente(t);setShowAna(false);setClienteFound(false);setLookupValue("");setSales({});setSkyS([{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:""}]);setShowStep4(false)}}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 flex items-center gap-2 ${tipoCliente===t?"bg-violet-500/20 text-violet-300 border border-violet-500/20 shadow-lg shadow-violet-500/5":"text-slate-500 hover:text-white border border-transparent"}`}>
              {t==="privato"?<User className="w-4 h-4"/>:<Building className="w-4 h-4"/>}
              {t==="privato"?"Privato":"Business"}
            </button>
          ))}
        </div>

        {/* CF/PIVA lookup */}
        {tipoCliente&&<div className="space-y-4">
          <div className="glass-panel p-4 rounded-xl space-y-3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">{tipoCliente==="privato"?"Codice Fiscale":"Partita IVA"}</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"/>
                <input placeholder={tipoCliente==="privato"?"RSSMRA80A01H501Z":"12345678901"} value={lookupValue} onChange={e=>setLookupValue(e.target.value.toUpperCase())} className="glass-input w-full text-sm rounded-xl py-3 pl-10 font-mono tracking-wider"/>
              </div>
              <button onClick={doLookup} className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-violet-500/20 flex items-center gap-2 whitespace-nowrap">
                <Search className="w-3.5 h-3.5"/> Cerca
              </button>
              <button onClick={()=>{setClienteFound(false);setShowAna(true);setShowStep4(false);showToast("Modalità nuovo cliente attivata")}} className="px-5 py-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 font-bold text-xs uppercase tracking-widest transition-all border border-emerald-500/20 flex items-center gap-2 whitespace-nowrap">
                <UserPlus className="w-3.5 h-3.5"/> Nuovo
              </button>
            </div>

            {/* Result feedback */}
            {clienteFound&&<div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <UserCheck className="w-4 h-4 text-emerald-400"/>
              <span className="text-sm font-semibold text-emerald-400">Cliente trovato nel database — dati pre-compilati</span>
            </div>}
            {showAna&&!clienteFound&&lookupValue&&<div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <UserPlus className="w-4 h-4 text-amber-400"/>
              <span className="text-sm font-semibold text-amber-400">Nuovo cliente — compila i dati anagrafici</span>
            </div>}
          </div>

          {/* CF Generator - only for privato */}
          {tipoCliente==="privato"&&<div>
            <button onClick={()=>setShowCFGen(!showCFGen)} className="flex items-center gap-2 text-xs font-bold text-violet-400 hover:text-violet-300 uppercase tracking-widest transition-colors">
              <Calculator className="w-3.5 h-3.5"/>{showCFGen?"Nascondi":"Calcola Codice Fiscale"}<ChevronRight className={`w-3 h-3 transition-transform ${showCFGen?"rotate-90":""}`}/>
            </button>
            {showCFGen&&<div className="glass-panel mt-3 p-5 rounded-xl border border-violet-500/10 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cognome *</label>
                  <input value={cfGen.cognome} onChange={e=>uCF("cognome",e.target.value)} placeholder="es. Rossi" className="glass-input w-full text-sm rounded-xl py-3"/>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nome *</label>
                  <input value={cfGen.nome} onChange={e=>uCF("nome",e.target.value)} placeholder="es. Mario" className="glass-input w-full text-sm rounded-xl py-3"/>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sesso *</label>
                  <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                    {["M","F"].map(s=><button key={s} onClick={()=>uCF("sesso",s)} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${cfGen.sesso===s?"bg-violet-500/20 text-violet-300 border border-violet-500/20":"text-slate-500 hover:text-white border border-transparent"}`}>{s==="M"?"Maschio":"Femmina"}</button>)}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Data di Nascita *</label>
                  <div className="flex gap-2">
                    <input value={cfGen.giorno} onChange={e=>uCF("giorno",e.target.value)} placeholder="GG" maxLength={2} className="glass-input text-center text-sm rounded-xl py-3 w-[28%]"/>
                    <select value={cfGen.mese} onChange={e=>uCF("mese",e.target.value)} className="glass-input text-sm rounded-xl py-3 w-[44%]"><option value="">Mese</option>{["01","02","03","04","05","06","07","08","09","10","11","12"].map((m,i)=><option key={m} value={m}>{["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][i]}</option>)}</select>
                    <input value={cfGen.anno} onChange={e=>uCF("anno",e.target.value)} placeholder="AAAA" maxLength={4} className="glass-input text-center text-sm rounded-xl py-3 w-[28%]"/>
                  </div>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Luogo di Nascita *</label>
                    <label className="flex items-center gap-1.5 text-[10px] text-slate-500 cursor-pointer"><input type="checkbox" checked={cfGen.estero} onChange={e=>{uCF("estero",e.target.checked);uCF("comune","");uCF("paese","");setCfSearch("")}} className="accent-violet-500 rounded"/> Nato/a all&apos;estero</label>
                  </div>
                  {cfGen.estero?<input value={cfGen.paese} onChange={e=>uCF("paese",e.target.value)} placeholder="es. GERMANIA" className="glass-input w-full text-sm rounded-xl py-3"/>
                  :<div className="relative" ref={cfComuneRef}><input value={cfSearch} onChange={e=>{setCfSearch(e.target.value);uCF("comune","")}} placeholder="Cerca comune..." className={`glass-input w-full text-sm rounded-xl py-3 ${cfGen.comune?"border-emerald-500/40":""}`}/>{cfGen.comune&&<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-emerald-400 font-bold">{cfGen.comune}</span>}
                    {filteredComuni.length>0&&!cfGen.comune&&<div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[rgba(26,29,41,0.98)] border border-white/10 rounded-xl overflow-hidden shadow-2xl shadow-black/50 max-h-[200px] overflow-auto">
                      {filteredComuni.map(c=><button key={c} onClick={()=>{uCF("comune",c);setCfSearch(c)}} className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-violet-500/10 hover:text-white transition-colors border-b border-white/5 last:border-0">{c}</button>)}
                    </div>}
                  </div>}
                </div>
              </div>
              <div className="flex gap-3 items-center pt-3 border-t border-white/5">
                <button onClick={doCalcolaCF} className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-violet-500/20 flex items-center gap-2">
                  <Calculator className="w-3.5 h-3.5"/> Calcola CF
                </button>
                {cfResult&&<div className="flex items-center gap-2"><span className="font-mono text-sm font-bold tracking-widest text-violet-300 bg-violet-500/10 px-4 py-2 rounded-lg border border-violet-500/20">{cfResult}</span><CheckCircle2 className="w-4 h-4 text-emerald-400"/></div>}
              </div>
            </div>}
          </div>}
        </div>}
      </div>}

      {showAna&&!showStep4&&<div className="glass-card mb-6 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
            <User className="w-3.5 h-3.5" /> Step 3 — Anagrafica
          </h3>
          {!clienteFound && <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-black px-3 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1.5"><UserPlus className="w-3 h-3"/> NUOVO CLIENTE</span>}
          {clienteFound && <span className="bg-blue-500/10 text-blue-400 text-[10px] font-black px-3 py-1 rounded-lg border border-blue-500/20 flex items-center gap-1.5"><UserCheck className="w-3 h-3"/> ESISTENTE</span>}
        </div>

        {tipoCliente==="privato"?<>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TF l="Nome" r v={ana.nome} o={v=>uA("nome",v)} p="Es. Mario" pf={clienteFound}/>
            <TF l="Cognome" r v={ana.cognome} o={v=>uA("cognome",v)} p="Es. Rossi" pf={clienteFound}/>
            <TF l="Cellulare" v={ana.cellulare} o={v=>uA("cellulare",v)} p="333 123 4567" pf={clienteFound}/>
            <TF l="Email" v={ana.email} o={v=>uA("email",v)} p="mario.rossi@email.com" pf={clienteFound}/>
          </div>
          <div className="pt-4 border-t border-white/5 grid grid-cols-3 gap-4">
            <TF l="Via" v={ana.via} o={v=>uA("via",v)} p="Via Roma 1" pf={clienteFound}/>
            <TF l="CAP" v={ana.cap} o={v=>uA("cap",v)} p="00100" pf={clienteFound}/>
            <TF l="Città" v={ana.citta} o={v=>uA("citta",v)} p="Roma" pf={clienteFound}/>
          </div>
        </>:<>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><TF l="Ragione Sociale" r v={ana.ragioneSociale} o={v=>uA("ragioneSociale",v)} p="Nome Azienda Srl" pf={clienteFound}/></div>
            <TF l="Nome Referente" r v={ana.nomeRef} o={v=>uA("nomeRef",v)} p="Es. Mario" pf={clienteFound}/>
            <TF l="Cognome Referente" r v={ana.cognomeRef} o={v=>uA("cognomeRef",v)} p="Es. Rossi" pf={clienteFound}/>
            <TF l="Recapito" v={ana.recapito} o={v=>uA("recapito",v)} p="333 123 4567" pf={clienteFound}/>
            <TF l="Email" v={ana.email} o={v=>uA("email",v)} p="info@azienda.it" pf={clienteFound}/>
          </div>
          <div className="pt-4 border-t border-white/5 grid grid-cols-3 gap-4">
            <TF l="Via" v={ana.via} o={v=>uA("via",v)} p="Via Roma 1" pf={clienteFound}/>
            <TF l="CAP" v={ana.cap} o={v=>uA("cap",v)} p="00100" pf={clienteFound}/>
            <TF l="Città" v={ana.citta} o={v=>uA("citta",v)} p="Roma" pf={clienteFound}/>
          </div>
        </>}

        <div className="flex justify-between items-center pt-4 border-t border-white/5">
          <button onClick={()=>{setAna({nome:"",cognome:"",cellulare:"",email:"",via:"",cap:"",citta:"",ragioneSociale:"",nomeRef:"",cognomeRef:"",recapito:""});setLookupValue("");setClienteFound(false);setShowStep4(false)}} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 font-bold text-xs uppercase tracking-widest transition-all border border-white/5 hover:border-rose-500/20 flex items-center gap-2">
            <RotateCcw className="w-3.5 h-3.5"/> Reset
          </button>
          <button onClick={()=>setShowStep4(true)} className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-violet-500/20 flex items-center gap-2">
            Avanti <ChevronRight className="w-3.5 h-3.5"/>
          </button>
        </div>
      </div>}

      {showAna&&showStep4&&(brand==="windtre"||brand==="vodafone"||brand==="fastweb"||brand==="iliad"||brand==="energy")&&<div className="glass-card mb-6 p-6" style={{borderLeft:"4px solid "+(brand==="vodafone"?"#E60000":brand==="fastweb"?"#CC9900":brand==="iliad"?"#C00028":brand==="energy"?"#28a745":"#2E75B6")}}>
        <div style={{fontSize:11,fontWeight:700,color:brand==="vodafone"?"#E60000":brand==="fastweb"?"#CC9900":brand==="iliad"?"#C00028":brand==="energy"?"#28a745":"#2E75B6",marginBottom:14,textTransform:"uppercase"}}>📂 Step 4 — Prodotti e Contratto</div>
        <div className="glass-panel mb-6 p-4" style={{display:"flex",alignItems:"center",gap:12,border:"1px solid rgba(0,114,198,0.3)",flexWrap:"wrap"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#1B3A5C"}}>Codice inserimento:</span>
          <select value={sesCode} onChange={e=>setSesCode(e.target.value)} className="glass-input min-w-[140px] font-bold border-blue-500/30 bg-white/5"><option value="">— Seleziona —</option>{(brand==="vodafone"?VF_CODICI_NEGOZIO:brand==="fastweb"?FW_CODICI_NEGOZIO:brand==="iliad"?IL_CODICI_NEGOZIO:brand==="energy"?EN_CODICI_NEGOZIO:codiciW3).map(c=><option key={c} value={c}>{c}</option>)}</select>
        </div>
        {cats.map(group=><div key={group.id} style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{fontSize:16}}>{group.icon}</span><span style={{fontSize:13,fontWeight:700,color:group.color,textTransform:"uppercase"}}>{group.title}</span></div>
          {gS(group.id).map((sale,si)=><div key={si} className="glass-panel mb-4 p-4" style={{borderLeft:"3px solid "+group.color}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <span style={{fontSize:11,fontWeight:700,color:group.color}}>Vendita #{si+1}</span>
              <div style={{display:"flex",gap:6}}>
                {si===gS(group.id).length-1&&<button onClick={()=>addSl(group.id)} style={{padding:"4px 12px",borderRadius:6,border:"1px solid "+group.color,background:"rgba(255,255,255,0.02)",color:group.color,fontSize:11,fontWeight:700,cursor:"pointer"}}>+</button>}
                {si>0&&<button onClick={()=>rmSl(group.id,si)} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #dc3545",background:"rgba(255,255,255,0.02)",color:"#dc3545",fontSize:10,fontWeight:700,cursor:"pointer"}}>✕</button>}
              </div>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:group.subs.some(s=>sale[s.id]&&sale[s.id].active)?10:0}}>
              {group.subs.map(sub=><button key={sub.id} onClick={()=>togSub(group.id,si,sub.id,group.radio?group.subs.map(s=>s.id):null)} style={{padding:"8px 14px",borderRadius:8,border:(sale[sub.id]&&sale[sub.id].active)?`2px solid ${group.color}`:"1px solid rgba(255,255,255,0.12)",background:(sale[sub.id]&&sale[sub.id].active)?group.color:"rgba(255,255,255,0.03)",color:(sale[sub.id]&&sale[sub.id].active)?"#fff":"#94a3b8",cursor:"pointer",fontSize:12,fontWeight:600,transition:"all 0.15s"}}>{sub.title}</button>)}
            </div>
            {group.subs.filter(sub=>sale[sub.id]&&sale[sub.id].active).map(sub=>
              <SubCard key={sub.id} sub={sub} rawSd={sale[sub.id]||{}} group={group} si={si} sessionCode={sesCode} sale={sale} uF={uF} uC={uC} uP={uP} catSales={gS(group.id)} anaCel={ana.cellulare||""} onOpenVFModal={openVFModal}/>
            )}
          </div>)}
        </div>)}
      </div>}

      {showAna&&showStep4&&brand==="sky"&&<div className="glass-card mb-6 p-6" style={{borderLeft:"4px solid #0072C6"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#0072C6",marginBottom:14,textTransform:"uppercase"}}>📺 Step 4 — Sky</div>
        {skyS.map((sale,si)=>{
          const SKY_COLOR="#0072C6";
          const btnSky=(label,active,onClick)=><button onClick={onClick} style={{padding:"10px 18px",borderRadius:8,cursor:"pointer",border:active?"2px solid "+SKY_COLOR:"1px solid rgba(255,255,255,0.12)",background:active?SKY_COLOR:"rgba(255,255,255,0.03)",color:active?"#fff":"#94a3b8",fontSize:13,fontWeight:600}}>{label}</button>;
          const ynSky=(val,onYes,onNo)=><div style={{display:"flex",gap:6}}>{[{v:"Sì",fn:onYes},{v:"No",fn:onNo}].map(({v,fn})=><button key={v} onClick={fn} style={{padding:"7px 22px",borderRadius:8,border:val===v?"2px solid "+SKY_COLOR:"1px solid rgba(255,255,255,0.12)",background:val===v?SKY_COLOR:"rgba(255,255,255,0.03)",color:val===v?"#fff":"#94a3b8",fontSize:12,fontWeight:700,cursor:"pointer"}}>{v}</button>)}</div>;
          const dBox=(children)=><div style={{marginTop:10,background:"rgba(0,114,198,0.1)",borderRadius:8,padding:12,border:"1px solid rgba(0,114,198,0.3)"}}><div style={{fontSize:11,fontWeight:700,color:SKY_COLOR,marginBottom:8,textTransform:"uppercase"}}>📄 Dati contratto</div>{children}</div>;
          return (<div key={si} style={{padding:12,borderRadius:8,marginBottom:8,background:"rgba(255,255,255,0.03)",borderLeft:"3px solid #0072C6"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <span style={{fontSize:11,fontWeight:700,color:"#0072C6"}}>Vendita #{si+1}</span>
              <div style={{display:"flex",gap:6}}>
                {si===skyS.length-1&&<button onClick={()=>setSkyS(p=>[...p,{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:""}])} style={{padding:"4px 12px",borderRadius:6,border:"1px solid #0072C6",background:"rgba(255,255,255,0.02)",color:"#0072C6",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Vendita</button>}
                {si>0&&<button onClick={()=>setSkyS(p=>{const n=[...p];n.splice(si,1);return n})} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #dc3545",background:"rgba(255,255,255,0.02)",color:"#dc3545",fontSize:10,fontWeight:700,cursor:"pointer"}}>✕</button>}
              </div>
            </div>

            {/* ── MACRO 1: TV ─────────────────────────────────── */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>📺 TV</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {SKY_TV.map(pr=>btnSky(pr,sale.tvSel===pr,()=>togSky(si,pr)))}
              </div>
              {sale.tvSel&&dBox(
                <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>Codice contratto <span style={{color:"#dc3545"}}>*</span></div>
                <input value={sale.tvCC||""} onChange={e=>uSkyF(si,"tvCC",e.target.value)} placeholder="es. 1679428185586" className="glass-input w-full"/></div>
              )}
            </div>

            {/* ── MACRO 2: FIBRA ──────────────────────────────── */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>🌐 Fibra</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {SKY_FIBRA.map(pr=>btnSky(pr,sale.fibraSel===pr,()=>togSky(si,pr)))}
              </div>
              {sale.fibraSel&&dBox(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px"}}>
                <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>Codice contratto <span style={{color:"#dc3545"}}>*</span></div>
                <input value={sale.fibraCC||""} onChange={e=>uSkyF(si,"fibraCC",e.target.value)} placeholder="es. 1679428185586" className="glass-input w-full"/></div>
                <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>GNP?</div>
                {ynSky(sale.fibraGnp,()=>uSkyF(si,"fibraGnp","Sì"),()=>{uSkyF(si,"fibraGnp","No");uSkyF(si,"fibraGnpBrand","");uSkyF(si,"fibraGnpNum","");})}</div>
                {sale.fibraGnp==="Sì"&&<>
                  <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>Brand GNP</div>
                  <select value={sale.fibraGnpBrand||""} onChange={e=>uSkyF(si,"fibraGnpBrand",e.target.value)} className="glass-input w-full text-sm rounded-xl py-3">
                    <option value="">— Seleziona —</option>
                    {SKY_BRAND_FIBRA.map(b=><option key={b} value={b}>{b}</option>)}
                  </select></div>
                  <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>Numero fisso in portabilità</div>
                  <input value={sale.fibraGnpNum||""} onChange={e=>uSkyF(si,"fibraGnpNum",e.target.value)} placeholder="es. 060000000" className="glass-input w-full"/></div>
                </>}
              </div>)}
            </div>

            {/* ── MACRO 3: MOBILE ─────────────────────────────── */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>📱 Mobile</div>
              <div style={{display:"flex",gap:6}}>
                {btnSky("Sky Mobile",sale.mobileSel,()=>togSky(si,"Sky Mobile"))}
              </div>
              {sale.mobileSel&&dBox(<div>
                <div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:4}}>MNP?</div>
                {ynSky(sale.mobMnp,()=>uSkyF(si,"mobMnp","Sì"),()=>{uSkyF(si,"mobMnp","No");uSkyF(si,"mobNumProv","");uSkyF(si,"mobNumDef","");uSkyF(si,"mobBrandMnp","");uSkyF(si,"mobIccid","");})}
                {sale.mobMnp==="Sì"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px",marginTop:8}}>
                  <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>Numero provvisorio</div><input value={sale.mobNumProv||""} onChange={e=>uSkyF(si,"mobNumProv",e.target.value)} placeholder="es. 393XXXXXXX" className="glass-input w-full"/></div>
                  <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>Numero definitivo</div><input value={sale.mobNumDef||""} onChange={e=>uSkyF(si,"mobNumDef",e.target.value)} placeholder="Numero da portare" className="glass-input w-full"/></div>
                  <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>Brand MNP</div>
                  <select value={sale.mobBrandMnp||""} onChange={e=>uSkyF(si,"mobBrandMnp",e.target.value)} className="glass-input w-full text-sm rounded-xl py-3">
                    <option value="">— Seleziona —</option>
                    {["TIM","Vodafone","Fastweb","WINDTRE","Iliad","PosteMobile","CoopVoce","ho.","Very Mobile","Rabona","Lyca","Kena","MVNO altro"].map(b=><option key={b} value={b}>{b}</option>)}
                  </select></div>
                  <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>ICCID</div><input value={sale.mobIccid||""} onChange={e=>uSkyF(si,"mobIccid",e.target.value)} placeholder="893XXXXXXXXXXXXXXXX" className="glass-input w-full"/></div>
                </div>}
                {sale.mobMnp==="No"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px",marginTop:8}}>
                  <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>Numero</div><input value={sale.mobNum||""} onChange={e=>uSkyF(si,"mobNum",e.target.value)} placeholder="es. 393XXXXXXX" className="glass-input w-full"/></div>
                  <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>ICCID</div><input value={sale.mobIccidNo||""} onChange={e=>uSkyF(si,"mobIccidNo",e.target.value)} placeholder="893XXXXXXXXXXXXXXXX" className="glass-input w-full"/></div>
                </div>}
              </div>)}
            </div>

          </div>);
        })}
      </div>}


      
      {/* ── PRODOTTI & MARGINALITÀ ── */}
      {showAna&&showStep4&&<div className="glass-card mb-6 p-6" style={{borderLeft:"4px solid #6f42c1"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:"#6f42c1",textTransform:"uppercase"}}>📦 Prodotti & Marginalità</div>
          <button onClick={()=>setShowMargPOS(true)} style={{padding:"6px 16px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#6f42c1,#9b59b6)",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Aggiungi</button>
        </div>
        {margItems.length>0?(<div>
          {margItems.map((it,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
            <span style={{fontSize:12,color:"#f8fafc"}}>{it.product}{it.qty>1?` ×${it.qty}`:""}{it.model?` (${it.model})`:""}</span>
            <button onClick={()=>rmMargItem(i)} style={{background:"none",border:"none",color:"#dc3545",cursor:"pointer",fontSize:10}}>✕</button>
          </div>))}
        </div>):(<div style={{textAlign:"center",padding:14,color:"#64748b",fontSize:12}}>Nessun prodotto. Usa "+ Aggiungi" o 📦 nella topbar.</div>)}
      </div>}
      <MargPOS show={showMargPOS} onClose={()=>{setShowMargPOS(false);setMargEditItem(null)}} venditore={selVend} negozio={selNeg} onAdd={(item)=>{addMargItem(item);setMargEditItem(null)}} editItem={margEditItem}/>
      <MargList items={margItems} onRemove={rmMargItem} show={showMargList} onClose={()=>setShowMargList(false)}/>

      {showMargSection&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(4px)"}}>
        <style>{`@keyframes margSecSlideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
        <div style={{background:"rgba(255,255,255,0.02)",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:640,maxHeight:"80vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 -4px 30px rgba(0,0,0,.2)",animation:"margSecSlideUp 0.32s cubic-bezier(0.22,1,0.36,1)"}}>
          <div style={{background:"linear-gradient(135deg,#6f42c1,#9b59b6)",padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{color:"#fff",fontWeight:800,fontSize:17}}>📦 Prodotti in Marginalità</div><div style={{color:"rgba(255,255,255,.75)",fontSize:11,marginTop:2}}>{margItems.length} prodott{margItems.length===1?"o":"i"} registrat{margItems.length===1?"o":"i"}</div></div>
            <button onClick={()=>setShowMargSection(false)} style={{padding:"6px 14px",borderRadius:8,border:"1px solid rgba(255,255,255,.4)",background:"rgba(255,255,255,.15)",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>✕ Chiudi</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:16}}>
            {margItems.length===0?<div style={{textAlign:"center",padding:"40px 20px",color:"#64748b"}}><div style={{fontSize:40}}>📦</div><div style={{fontSize:14,fontWeight:600,marginTop:10}}>Nessun prodotto registrato</div><div style={{fontSize:12,marginTop:4}}>Aggiungi prodotti dal catalogo</div></div>:
              margItems.map((item,idx)=>(
                <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13}}>{item.product}</div>
                    {item.model&&<div style={{fontSize:11,color:"#64748b"}}>{item.model}</div>}
                    <div style={{fontSize:12,color:"#8892b0",marginTop:2}}>x{item.qty||1}</div>
                  </div>
                  <button onClick={()=>setMargItems(p=>p.filter((_,i)=>i!==idx))} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #dc3545",background:"rgba(220,53,69,0.1)",color:"#dc3545",fontSize:11,fontWeight:700,cursor:"pointer"}}>✕</button>
                </div>
              ))
            }
          </div>
          <div style={{padding:"14px 16px",borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",gap:10}}>
            <button onClick={()=>{setShowMargSection(false);setShowMargPOS(true)}} style={{flex:1,padding:"12px 0",borderRadius:10,border:"2px solid #6f42c1",background:"rgba(255,255,255,0.04)",color:"#6f42c1",fontSize:13,fontWeight:800,cursor:"pointer"}}>+ Aggiungi prodotto</button>
            {margItems.length>0&&<button onClick={()=>setShowCart(true)} style={{flex:1,padding:"12px 0",borderRadius:10,border:"none",background:"linear-gradient(135deg,#6f42c1,#9b59b6)",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>🛒 Vai al carrello</button>}
          </div>
        </div>
      </div>}

{showAna&&showStep4&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:20,marginTop:8,gap:10}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>setShowStep4(false)} style={{padding:"11px 20px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.02)",color:"#8892b0",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>← Indietro</button>
          {confirmReset
            ? <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:12,fontWeight:600,color:"#dc3545"}}>Sei sicuro?</span>
                <button onClick={fullReset} style={{padding:"8px 16px",borderRadius:8,border:"none",background:"#dc3545",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Sì, resetta</button>
                <button onClick={()=>setConfirmReset(false)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.02)",color:"#8892b0",fontSize:12,fontWeight:600,cursor:"pointer"}}>Annulla</button>
              </div>
            : <button onClick={()=>setConfirmReset(true)} style={{padding:"11px 22px",borderRadius:10,border:"2px solid #dc3545",background:"rgba(255,255,255,0.02)",color:"#dc3545",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>🗑️ Reset form</button>
          }
        </div>
        <button onClick={()=>setShowCart(true)} style={{padding:"11px 26px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#1a1a2e,#0f3460)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>🛒 Riepilogo carrello{tCI>0&&<span style={{background:"#FFD800",color:"#f8fafc",borderRadius:10,padding:"1px 8px",fontSize:12,fontWeight:800}}>{tCI}</span>}</button>
      </div>}

      {/* ── VF QTY MODAL OVERLAY ─────────────────────────────────────────── */}
      {vfQtyModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)setVfQtyModal(null)}}>
          <style>{`@keyframes vfModalIn{from{opacity:0;transform:translateY(48px) scale(0.93)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
          <div style={{background:"rgba(255,255,255,0.02)",borderRadius:20,padding:32,width:360,boxShadow:"0 24px 80px rgba(0,0,0,0.35)",animation:"vfModalIn .28s cubic-bezier(.22,1,.36,1) both",textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:8}}>📱</div>
            <div style={{fontSize:18,fontWeight:800,color:"#f8fafc",marginBottom:4}}>Quante SIM hai venduto?</div>
            <div style={{fontSize:13,fontWeight:600,color:"#E60000",background:"rgba(230,0,0,0.1)",borderRadius:8,padding:"6px 16px",display:"inline-block",marginBottom:24}}>{vfQtyModal.offer}</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:20,marginBottom:28}}>
              <button onClick={()=>setVfQtyModal(p=>({...p,tempQty:Math.max(1,p.tempQty-1)}))} style={{width:52,height:52,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",fontSize:26,fontWeight:700,cursor:"pointer",color:"#8892b0",lineHeight:"1",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:52,fontWeight:900,color:"#E60000",lineHeight:1}}>{vfQtyModal.tempQty}</div>
                <div style={{fontSize:11,color:"#64748b",marginTop:2}}>SIM</div>
              </div>
              <button onClick={()=>setVfQtyModal(p=>({...p,tempQty:Math.min(9,p.tempQty+1)}))} style={{width:52,height:52,borderRadius:"50%",border:"2px solid #E60000",background:"#E60000",fontSize:26,fontWeight:700,cursor:"pointer",color:"#fff",lineHeight:"1",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={()=>setVfQtyModal(null)} style={{padding:"11px 28px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"#8892b0",fontSize:13,fontWeight:600,cursor:"pointer"}}>Annulla</button>
              {vfQtyModal&&vfQtyModal.tempQty>0&&((sales[vfQtyModal.catId]||[{}])[vfQtyModal.si]||{})[vfQtyModal.subId]&&((((sales[vfQtyModal.catId]||[{}])[vfQtyModal.si]||{})[vfQtyModal.subId]||{}).vfOffers||{})[vfQtyModal.offer]>0&&<button onClick={()=>{if(!vfQtyModal)return;const{catId,si,subId,offer}=vfQtyModal;const cur=((sales[catId]||[{}])[si]||{})[subId];const newVfO={...((cur&&cur.vfOffers)||{})};delete newVfO[offer];const newVfC={...((cur&&cur.vfContratti)||{})};delete newVfC[offer];uP(catId,si,subId,"vfOffers",newVfO);uP(catId,si,subId,"vfContratti",newVfC);setVfQtyModal(null);}} style={{padding:"11px 20px",borderRadius:10,border:"1px solid #dc3545",background:"rgba(255,255,255,0.02)",color:"#dc3545",fontSize:13,fontWeight:600,cursor:"pointer"}}>✕ Rimuovi</button>}
              <button onClick={confirmVFQty} style={{padding:"11px 36px",borderRadius:10,border:"none",background:"#E60000",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 16px rgba(230,0,0,0.35)"}}>Conferma</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
  return formContent;
}

import dynamic from "next/dynamic";
const CRM_NoSSR = dynamic(() => Promise.resolve(CRM), { ssr: false });
export default CRM_NoSSR;
