// @ts-nocheck
"use client";
import { useState, useCallback, useEffect, memo, useContext, useRef, useReducer, useMemo, createContext } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
const ReqCtx = createContext(null);
const SubKeyCtx = createContext(null);
let _FUID = 0;
const _isEmptyVal=(v)=>!(v!==undefined&&v!==null&&String(v).trim()!=="");


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
    {id:"sim_sky",name:"Sim Sky",price:0,fixedMargin:0,linked:true,icon:"📶",type:"fixed"},
    {id:"sim_ho",name:"Sim Ho.",price:0,fixedMargin:0,linked:true,icon:"📶",type:"fixed"},
    {id:"sim_tim",name:"Sim TIM",price:0,fixedMargin:0,linked:true,icon:"📶",type:"fixed"},
    {id:"sost_tim",name:"Sost TIM",price:0,fixedMargin:0,linked:true,icon:"🔄",type:"fixed"},
    {id:"sost_vod",name:"Sost Vodafone",price:0,fixedMargin:-10,linked:true,icon:"🔄",type:"fixed"},
    {id:"sost_w3",name:"Sost Wind3",price:0,fixedMargin:-15,linked:true,icon:"🔄",type:"fixed"},
    {id:"sim_very",name:"Sim Very",price:0,fixedMargin:-7,linked:true,icon:"📶",type:"fixed"},
    {id:"sost_very",name:"Sost Very",price:0,fixedMargin:-7,linked:true,icon:"🔄",type:"fixed"},
    {id:"sim_l",name:"Sim L",price:0,fixedMargin:-15,linked:true,icon:"📶",type:"fixed"},
    {id:"sim_next",name:"Sim Next",price:0,fixedMargin:-7,linked:true,icon:"📶",type:"fixed"},
    {id:"subentro",name:"Subentro/Reale Util.",price:0,fixedMargin:-10,linked:true,icon:"🔄",type:"fixed"},
  ]},
  {cat:"📲 ESIM",items:[
    {id:"esim_vod",name:"ESIM Vodafone",price:0,fixedMargin:0,linked:true,icon:"📲",type:"fixed"},
    {id:"esim_fw",name:"ESIM Fastweb",price:0,fixedMargin:0,linked:true,icon:"📲",type:"fixed"},
    {id:"esim_sost_fw",name:"ESIM Sost Fastweb",price:0,fixedMargin:0,linked:true,icon:"🔄",type:"fixed"},
    {id:"esim_w3",name:"ESIM Windtre",price:0,fixedMargin:0,linked:true,icon:"📲",type:"fixed"},
    {id:"esim_sost_w3",name:"ESIM Sost Windtre",price:0,fixedMargin:0,linked:true,icon:"🔄",type:"fixed"},
  ]},
  // 6a categoria (richiesta Luca #10): registra IMEI + € (ricavo), margine 4%,
  // conta come +1 telefono venduto (countsPhone).
  {cat:"📱 Telefono Cash",items:[
    // isTelCash: blocco dedicato (modello da lista + IMEI + importo di vendita).
    // NON usa needsImei: quello e' il magazzino usato, qui l'IMEI non va collegato.
    {id:"telefono_cash",name:"Telefono Cash",price:null,pctMargin:4.00,isTelCash:true,countsPhone:true,icon:"📱",type:"pct"},
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
const MargPOS=memo(({show,onClose,venditore,negozio,onAdd,editItem})=>{
  const [selCat,setSelCat]=useState(0);
  const [selProd,setSelProd]=useState(null);
  const [price,setPrice]=useState("");
  const [qty,setQty]=useState("1");
  const [importo,setImporto]=useState("");
  const [model,setModel]=useState("");
  const [imei,setImei]=useState("");
  const [usatoUnits,setUsatoUnits]=useState([{imei:"",model:""}]);
  const setUnit=(i,k,v)=>{setUsatoUnits(prev=>{const a=[...prev];a[i]={...a[i],[k]:v};return a;});};
  const onUnitImei=(i,raw)=>{const v=raw.replace(/\D/g,"").slice(0,15);setUsatoUnits(prev=>{const a=[...prev];a[i]={...a[i],imei:v};return a;});if(v.length===15){supabase.from("usati").select("model").eq("imei",v).maybeSingle().then(r=>{if(r&&r.data&&r.data.model)setUsatoUnits(prev=>{const a=[...prev];if(a[i])a[i]={...a[i],model:r.data.model};return a;})}).catch(()=>{})}};
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
        if(found.needsImei&&Array.isArray(editItem.units)&&editItem.units.length)setUsatoUnits(editItem.units.map(u=>({imei:u.imei||"",model:u.model||""})));
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
  const handleAdd=()=>{
    if(!selProd)return;
    const p=selProd;
    // Telefono Cash: la base del 4% e' l'importo di VENDITA inserito.
    const pVal=p.isTelCash?(parseFloat(importo)||0):(p.price!==null?p.price:parseFloat(price)||0);
    const mVal=p.type==="fixed"?(p.fixedMargin||0):p.type==="pct"?(pVal*(p.pctMargin||0)/100):0;
    if(p.needsImei){
      const units=usatoUnits.filter(u=>u.imei||u.model);
      const _im=units.map(u=>String(u.imei||"").replace(/\D/g,"")).filter(x=>x.length===15);
      if(new Set(_im).size!==_im.length)return;
      const q=units.length||1;
      onAdd({product:p.name,productId:p.id,price:pVal,qty:q,importo:parseFloat(importo)||null,margin:mVal,totalMargin:mVal*q,model:units.map(u=>u.model).filter(Boolean).join(", ")||null,imei:units.map(u=>u.imei).filter(Boolean).join(", ")||null,units,venditore,negozio,date:new Date().toISOString().split("T")[0],linked:p.linked||false,countsPhone:p.countsPhone||false});
    }else{
      onAdd({product:p.name,productId:p.id,price:pVal,qty:parseInt(qty)||1,importo:parseFloat(importo)||null,margin:mVal,totalMargin:mVal*(parseInt(qty)||1),model:model||null,imei:imei||null,venditore,negozio,date:new Date().toISOString().split("T")[0],linked:p.linked||false,countsPhone:p.countsPhone||false});
    }
    setSelProd(null);setPrice("");setQty("1");setImporto("");setModel("");setImei("");setUsatoUnits([{imei:"",model:""}]);
  };
  const _usImeis=usatoUnits.map(u=>String(u.imei||"").replace(/\D/g,"")).filter(x=>x.length===15);
  const hasDupImei=!!(selProd&&selProd.needsImei)&&(new Set(_usImeis).size!==_usImeis.length);
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(4px)"}}>
    <style>{`@keyframes margSlideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    <div style={{background:"rgba(255,255,255,0.02)",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:640,maxHeight:"85vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 -4px 30px rgba(0,0,0,.2)",animation:"margSlideUp 0.32s cubic-bezier(0.22,1,0.36,1)"}}>
      <div style={{padding:"16px 20px",borderBottom:"2px solid rgba(255,255,255,0.03)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontSize:16,fontWeight:800,color:"#f8fafc"}}>📦 Registra Prodotto</div><div style={{fontSize:11,color:"#64748b"}}>{venditore||"—"} • {negozio||"—"} • {new Date().toLocaleDateString("it-IT")}</div></div>
        <button onClick={onClose} style={{padding:"6px 14px",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.02)",color:"#8892b0",fontSize:12,fontWeight:600,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{display:"flex",gap:4,padding:"10px 16px",overflowX:"auto",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
        {MARG_PRODUCTS.map((cat,ci)=>(<button key={ci} onClick={()=>{setSelCat(ci);setSelProd(null)}} style={{padding:"6px 14px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",border:selCat===ci?"2px solid #6f42c1":"2px solid rgba(255,255,255,0.1)",background:selCat===ci?"rgba(111,66,193,0.12)":"rgba(255,255,255,0.04)",color:selCat===ci?"#6f42c1":"#8892b0"}}>{cat.cat}</button>))}
      </div>
      <div style={{flex:1,overflow:"auto",padding:16}}>
        {!selProd?(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8}}>
          {MARG_PRODUCTS[selCat].items.map(p=>(<button key={p.id} onClick={()=>{setSelProd(p);if(p.price!==null)setPrice(String(p.price))}} style={{padding:"14px 8px",borderRadius:12,border:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.03)",cursor:"pointer",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <span style={{fontSize:22}}>{p.icon}</span>
            <span style={{fontSize:10,fontWeight:600,color:"#f8fafc",lineHeight:1.2}}>{p.name}</span>
          </button>))}
        </div>):(<div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <button onClick={()=>setSelProd(null)} style={{background:"none",border:"none",color:"#6f42c1",fontSize:13,cursor:"pointer",fontWeight:600}}>← Indietro</button>
            <span style={{fontSize:22}}>{selProd.icon}</span>
            <span style={{fontSize:16,fontWeight:800,color:"#f8fafc"}}>{selProd.name}</span>
          </div>
          <div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Quantità</div>
            <input value={qty} onChange={e=>setQty(e.target.value)} type="number" min="1" style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",fontSize:14,fontWeight:700,boxSizing:"border-box"}}/></div>
          {selProd.needsModel&&!selProd.needsImei&&<div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Modello</div><input value={model} onChange={e=>setModel(e.target.value)} placeholder="es. iPhone 15..." style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",fontSize:13,boxSizing:"border-box"}}/></div>}
          {/* TELEFONO CASH: modello dalla lista condivisa + IMEI libero (nessun collegamento
              al magazzino usato) + importo di vendita (base del 4%). */}
          {selProd.isTelCash&&<div style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#6f42c1",marginBottom:6,textTransform:"uppercase"}}>IMEI Dispositivo</div>
            <div style={{padding:10,borderRadius:10,border:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.03)"}}>
              <div style={{marginBottom:8}}><DD l="Modello" r v={model} o={v=>setModel(v)} vals={SMARTPHONES}/></div>
              <div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>IMEI</div>
              <input value={imei} onChange={e=>setImei(e.target.value.replace(/\D/g,"").slice(0,15))} placeholder="IMEI (15 cifre)"
                style={{width:"100%",padding:"9px 12px",borderRadius:8,border:String(imei).length===15?"2px solid #28a745":"1px solid rgba(255,255,255,0.1)",fontSize:13,boxSizing:"border-box",fontFamily:"monospace"}}/>
            </div>
          </div>}
          {selProd.needsImei&&<div style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#6f42c1",marginBottom:6,textTransform:"uppercase"}}>Dispositivi usati ({usatoUnits.length})</div>
            {usatoUnits.map((u,i)=>{const found=lookupUsato(u.imei);const _di=String(u.imei||"").replace(/\D/g,"");const done=_di.length===15;const dup=done&&usatoUnits.some((x,j)=>j!==i&&String(x.imei||"").replace(/\D/g,"")===_di);return (
              <div key={i} style={{marginBottom:8,padding:10,borderRadius:10,border:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.03)"}}>
                <div style={{fontSize:10,fontWeight:800,color:"#6f42c1",marginBottom:5}}>Unità #{i+1}</div>
                <input value={u.imei} onChange={e=>onUnitImei(i,e.target.value)} placeholder="IMEI (15 cifre)" style={{width:"100%",padding:"9px 12px",borderRadius:8,border:dup?"2px solid #dc3545":done?(found?"2px solid #28a745":"2px solid #fd7e14"):"1px solid rgba(255,255,255,0.1)",fontSize:13,boxSizing:"border-box",fontFamily:"monospace",marginBottom:6}}/>
                <input value={u.model} onChange={e=>setUnit(i,"model",e.target.value)} placeholder="Modello (auto da magazzino)" style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)",fontSize:13,boxSizing:"border-box",background:(found&&u.model===found)?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)"}}/>
                {dup?<div style={{fontSize:10,color:"#dc3545",fontWeight:700,marginTop:4}}>⛔ IMEI duplicato — già inserito in un'altra unità</div>:done&&(found?<div style={{fontSize:10,color:"#28a745",fontWeight:700,marginTop:4}}>✓ Trovato a magazzino — modello auto-compilato</div>:<div style={{fontSize:10,color:"#fd7e14",fontWeight:700,marginTop:4}}>⚠ IMEI non presente a magazzino — inserisci il modello a mano</div>)}
              </div>
            );})}
          </div>}
          <div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>{selProd.isTelCash?"Importo di vendita €":"Importo €"}</div>
            <input value={importo} onChange={e=>setImporto(e.target.value)} type="number" min="0" step="0.01" placeholder="es. 29.90" style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",fontSize:14,fontWeight:700,boxSizing:"border-box"}}/>
            {selProd.isTelCash&&<div style={{fontSize:10,color:"#28a745",fontWeight:700,marginTop:4}}>Margine 4% = € {(((parseFloat(importo)||0)*4)/100).toFixed(2)}</div>}</div>
          {hasDupImei&&<div style={{marginBottom:8,padding:"8px 12px",borderRadius:8,background:"rgba(220,53,69,0.12)",border:"1px solid #f5c2c2",color:"#dc3545",fontSize:12,fontWeight:700,textAlign:"center"}}>⛔ Sono presenti IMEI duplicati: correggili per registrare</div>}
          <button onClick={handleAdd} disabled={hasDupImei} style={{width:"100%",padding:14,borderRadius:12,border:"none",background:hasDupImei?"#cfcfcf":"linear-gradient(135deg,#6f42c1,#9b59b6)",color:"#fff",fontSize:14,fontWeight:800,cursor:hasDupImei?"not-allowed":"pointer"}}>✅ Registra {selProd.name}</button>
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
        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
          <div><div style={{fontSize:12,fontWeight:600,color:"#f8fafc"}}>{it.product} ×{it.qty||1}</div><div style={{fontSize:10,color:"#64748b"}}>{it.model||""}{it.importo!=null?` — €${Number(it.importo).toFixed(2)}`:""}</div></div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={()=>onRemove(i)} style={{background:"none",border:"none",color:"#dc3545",cursor:"pointer",fontSize:11}}>✕</button>
          </div>
        </div>
      ))}
      {items.length>0&&<div style={{marginTop:12,padding:12,background:"rgba(0,114,198,0.10)",borderRadius:10,display:"flex",justifyContent:"space-between"}}>
        <span style={{fontWeight:700}}>Totale prodotti</span>
        <span style={{fontWeight:900,fontSize:18,color:"#6f42c1"}}>{items.length}</span>
      </div>}
    </div>
  </div>);
});


const BRANDS = [
  { id: "windtre", logo: "/windtre.png", label: "WindTre", short: "W3", color: "#FF6B00", gradient: "linear-gradient(135deg, #1B3A5C 0%, #2E75B6 100%)", icon: "📶", desc: "Mobile, Fisso, Luce & Gas, Assicurazioni, Protecta", ready: true },
  { id: "sky", logo: "/sky.png", label: "Sky", short: "SKY", color: "#0072C6", gradient: "linear-gradient(135deg, #003366 0%, #0072C6 100%)", icon: "📺", desc: "TV, Fibra, Mobile, Glass, Pacchetti combinati", ready: true },
  { id: "vodafone", logo: "/vodaphone - Copy.png", label: "Vodafone", short: "VF", color: "#E60000", gradient: "linear-gradient(135deg, #990000 0%, #E60000 100%)", icon: "📱", desc: "Mobile, Fisso, Multi-Servizi, Verisure", ready: true },
  { id: "fastweb", logo: "/fastweb.png", label: "Fastweb", short: "FW", color: "#CC9900", gradient: "linear-gradient(135deg, #CC9900 0%, #FFD800 100%)", icon: "⚡", desc: "Mobile, Fisso, Energy", ready: true },
  { id: "iliad", logo: "/iliad.png", label: "Iliad", short: "IL", color: "#C00028", gradient: "linear-gradient(135deg, #800018 0%, #C00028 100%)", icon: "📡", desc: "Mobile e Fisso (Fibra)", ready: true },
  { id: "energy", logo: "/energy - Copy.png", label: "Energy", short: "EN", color: "#28a745", gradient: "linear-gradient(135deg, #1a6b2d 0%, #28a745 100%)", icon: "🔋", desc: "Forniture Luce e Gas (S4, Barton)", ready: true },
  { id: "tim", logo: "/tim-logo.png", label: "TIM", short: "TIM", color: "#0050FF", gradient: "linear-gradient(135deg, #0033A0 0%, #0050FF 100%)", icon: "☎️", desc: "Mobile, Fisso, Multi-Servizi", ready: true },
  { id: "very", logo: "/very-mobile.png", label: "Very Mobile", short: "VERY", color: "#1FA300", gradient: "linear-gradient(135deg, #137A00 0%, #1FA300 100%)", icon: "🟢", desc: "Mobile", ready: true },
  { id: "ho", logo: "/ho-mobile.png", label: "Ho. Mobile", short: "HO", color: "#E6007E", gradient: "linear-gradient(135deg, #B0005F 0%, #E6007E 100%)", icon: "💗", desc: "Mobile", ready: true },
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
const opProv = ["Enel Energia","Eni Plenitude","A2A Energia","Edison Energia","Iren Mercato","Hera Comm","Sorgenia","Acea Energia","Engie","E.ON","Illumia","Wekiwi","Pulsee","Octopus Energy","Green Network","Dolomiti Energia","Axpo","NeN","Tate","WindTre Luce e Gas","Fastweb Energia","S4 Energy","Barton Energy","Altro"];
const opProvNoW3 = opProv.filter(o=>o!=="WindTre Luce e Gas");
const brandMNP = ["TIM","Vodafone","WindTre","Iliad","Sky Mobile","Fastweb Mobile","PosteMobile","ho. Mobile","Kena Mobile","Very Mobile","CoopVoce","Spusu","Lyca Mobile","1Mobile","Tiscali Mobile","Digi Mobil","Noitel","Optima Mobile","Feder Mobile","Rabona Mobile","Elimobile","BT Italia","Segnoverde Mobile","Uno Mobile","Saily","Visitel","Ops! Mobile"];
const SKY_TV = ["TV","TV 14,90","Sky Glass"];
const SKY_FIBRA = ["Fibra","3P","3P 35,80","4P"];
const SKY_BIZ_TV = ["TV Uffici"];
const SKY_BIZ_FIBRA = ["Sky Business"];
const SKY_BRAND_FIBRA = ["TIM","Vodafone","Fastweb","WINDTRE","Tiscali","Sky","BT Enia","Ehiweb","Open Fiber","Infratel","Vianova","Isiline","Convergenze","Full Telecom","Optima","Fibra.tn"];
const emS = () => ({active:true,fields:{},contract:{},gnp:false,gnpNum:"",gnpOp:"",secondaLinea:false,gnp2L:null,gnp2LBrand:"",gnp2LNum:"",domiciliazione:false,opProvenienza:"",codiceOverride:"",addons:{},domiciliato:null,convergente:null,tipMob:null,mnp:null,easyPay:null,tnpGa:null,tnpTipo:"",tnpModello:"",tnpImei:"",tnpCount:null,tnpModelli:[],tnpImeis:[],packAccessori:null,packAccessoriVal:"",packAccessoriQta:"",cbTnp:false,cbTnpTipo:"",cbTnpModello:"",cbTnpImei:"",cbTnpCount:null,cbTnpModelli:[],cbTnpImeis:[],cbPackAccessori:null,cbPackAccessoriVal:"",cbPackAccessoriQta:"",cbTnpCell:"",cbTnpCC:"",cbTnpCodIns:"",cbTnpReload:null,cbTnpReloadSel:{},cbCambio:false,cbCambioVal:"",cbCambioCell:"",cbCambioCC:"",cbCambioCodIns:"",cbAddon:false,cbAddonSel:{},rfModello:"",rfImei:"",cbRf:false,cbAddonCodIns:"",cbAddonSecCell:"",cbAddonRoCell:"",cbAddonRoImei:"",cbRfCodIns:"",tnpGaReload:null,tnpGaReloadSel:{},reloadForever:null,securitySel:{},voceCasaCb:null,protectaCodIns:"",vfOffers:{},vfContratti:{},vfOffer:null,vfMnp:null,vfMnpBrand:"",vfMnpNum:"",vfDomicilio:null,vfConvergenza:null,vfNumFisso:"",vfTnp:null,vfTnpList:[],dcNumProv:"",dcNum:"",dcIccid:"",dcCodIns:"",dcRicaricaAuto:null,vfSecurity:null,cbTnpList:[],cbTraslochi:false,cbTraslochiNum:"",cbTraslochiCodIns:"",cbSecurityCodIns:"",vfFIccid:"",cbCellulare:"",cbCodContratto:"",cbCodIns2:"",cbTaglia:null,dcCbNumProv:"",dcCbIccid:"",cbCambio2:false,cbCambioCell:"",cbCambioNumMod:"",cbCambioCodIns2:"",cbSecurity:false,cbSecurityCell:"",vfFLockIn:null,vfFConvergenza:null,vfFGnp:null,vfFGnpBrand:"",vfFGnpNum:"",vfFAddons:{},vfFCodIns:"",vfFNumProvVisorio:"",vfFNumDef:"",vfbOffer:null,vfbMnp:null,vfbMnpBrand:"",vfbMnpNum:"",vfbTnp:null,vfbModello:"",vfbImei:"",vfbRataPiva:null,vfbKaskoSel:{},vfbCodIns:"",vfbCbOn:false,vfbCbCell:"",vfbCbCodIns:"",vfbFGnp:null,vfbFGnpBrand:"",vfbFGnpNum:"",vfbFCodIns:"",vfbFNumProv:"",vfbFNumDef:"",vfbFMnp:null,vfbFMnpBrand:"",vfbFMnpNum:"",vfbFCombNumProv:"",vfbFCombIccid:"",vfbNum:"",vfbIccid:"",vfbFIccid:"",vfSolDigCodIns:"",verisureCodIns:"",kfCodIns:"",vcCodIns:"",fwOffer:null,fwMnp:null,fwFSecLineCount:0,fwFSecLines:[],fwMnpBrand:"",fwMnpNum:"",fwCodIns:"",fwNumProv:"",fwNumDef:"",fwIccid:"",fwFGnp:null,fwFGnpBrand:"",fwFGnpNum:"",fwFCodIns:"",fwFNumProv:"",fwFNumDef:"",fwPod:"",fwPdr:"",fwEnCodIns:"",ilOffer:null,ilMnp:null,ilDom:null,ilMnpBrand:"",ilMnpNum:"",ilCodIns:"",ilNumProv:"",ilNumDef:"",ilIccid:"",ilFGnp:null,ilFCodIns:"",ilFNumProv:"",ilFNumDef:"",ilFwaCodIns:"",ilFwaIccid:"",ilBizOffer:null,ilBizMnp:null,ilBizMnpBrand:"",ilBizDom:null,ilBizNum:"",ilBizIccid:"",ilBizNumDef:"",ilBizCodIns:"",enCodIns:"",enPod:"",enPdr:"",enProv:"",fwEnProv:"",w3SostCell:"",w3SostIccid:"",w3SostCodContr:"",w3SostCodIns:"",fwSostCell:"",fwSostIccid:"",fwSostCodContr:"",fwSostCodIns:"",vfSostCell:"",vfSostCodIns:"",timOffer:null,timMnp:null,timMnpBrand:"",timMnpNum:"",timTnp:null,timModello:"",timSpedizione:null,timFinanziato:null,timCodPratica:"",timVisionBox:null,timVisionTaglia:null,timVisionNumContr:"",timImei:"",timNumProv:"",timNum:"",timIccid:"",timCodIns:"",timFOffer:null,timFGnp:null,timFGnpBrand:"",timFGnpNum:"",timFNumProv:"",timFCodIns:"",timFVision:null,timFVisionTaglia:null,timFVisionNumContr:"",timTpTwin:null,timTpSeriale:"",timTpRecapito:"",timTpCodIns:"",veryOffer:null,veryMnp:null,veryMnpBrand:"",veryMnpNum:"",veryRicaricaAuto:null,veryFascia:null,veryCodIns:"",veryNumProv:"",veryNum:"",veryIccid:"",hoOffer:null,hoMnp:null,hoMnpBrand:"",hoMnpNum:"",hoRicaricaAuto:null,hoFascia:null,hoCodIns:"",hoNumProv:"",hoNum:"",hoIccid:""});

const DET_LABELS={gnp:"GNP",gnpNum:"N. GNP",gnpOp:"Op. GNP",secondaLinea:"2ª Linea",gnp2L:"GNP 2ª Linea",gnp2LBrand:"Brand GNP 2L",gnp2LNum:"N. GNP 2L",domiciliazione:"Domiciliazione",opProvenienza:"Op. Provenienza",domiciliato:"Domiciliato",convergente:"Convergente",tipMob:"Tipologia",mnp:"MNP",easyPay:"EasyPay",tnpGa:"TNP GA",tnpTipo:"Tipo TNP",tnpModello:"Terminale",tnpImei:"IMEI TNP",tnpCount:"Q.tà TNP",packAccessori:"Pack Accessori",packAccessoriVal:"Importo Pack",packAccessoriQta:"Q.tà Accessori",cbTnp:"TNP CB",cbTnp2:"TNP CB",cbTnpTipo:"Tipo CB",cbTnpModello:"Term. CB",cbTnpImei:"IMEI CB",cbTnpCount:"Q.tà TNP CB",cbPackAccessori:"Pack Acc. CB",cbPackAccessoriVal:"Importo Pack CB",cbPackAccessoriQta:"Q.tà Acc. CB",cbTnpCell:"Cell. CB",cbTnpCC:"Cod.Cliente CB",cbTnpCodIns:"Cod.Ins. CB",cbTnpReload:"Reload CB",cbCambio:"Cambio Offerta",cbCambio2:"Cambio Offerta",cbCambioVal:"Offerta CB",cbCambioCell:"Cell. Cambio",cbCambioCC:"Cod.Cliente Cambio",cbCambioCodIns:"Cod.Ins. Cambio",cbCambioNumMod:"Numero Cambio",cbCambioCodIns2:"Cod.Ins. Cambio",cbCellulare:"Cellulare CB",cbCodContratto:"Cod. Contratto CB",cbCodIns2:"Cod.Ins. CB",cbTaglia:"Taglia CB",dcCbNumProv:"N. Provvisorio CB",dcCbIccid:"ICCID CB",cbSecurity:"Rete Sicura CB",cbSecurityCell:"Cell. Rete Sicura",cbSecurityCodIns:"Cod.Ins. Rete Sicura",cbTraslochi:"Traslochi",cbTraslochiNum:"N. Fisso Trasloco",cbTraslochiCodIns:"Cod.Ins. Trasloco",rfModello:"Modello Reload Forever",rfImei:"IMEI RF",cbRf:"Reload Forever CB",cbRfCodIns:"Cod.Ins. RF",cbAddonCodIns:"Cod.Ins. Add-on",cbAddonSecCell:"Cell. Security",cbAddonRoCell:"Cell. Reload Open",cbAddonRoImei:"IMEI Reload Open",tnpGaReload:"Reload GA",reloadForever:"Reload Forever",voceCasaCb:"Voce Casa CB",protectaCodIns:"Cod.Ins. Protecta",vfOffer:"Offerta",vfMnp:"MNP",vfMnpBrand:"Op. MNP",vfMnpNum:"N. MNP",vfDomicilio:"Domiciliata",vfConvergenza:"Convergenza",vfNumFisso:"N. Fisso Conv.",vfTnp:"TNP",vfSecurity:"Security",dcNumProv:"N. Provvisorio",dcNum:"Numero",dcIccid:"ICCID",dcCodIns:"Cod.Ins.",dcRicaricaAuto:"Ricarica Auto",vfFLockIn:"Lock In",vfFConvergenza:"Convergenza",vfFGnp:"GNP",vfFGnpBrand:"Op. GNP",vfFGnpNum:"N. GNP",vfFCodIns:"Cod.Ins.",vfFNumProvVisorio:"N. Provvisorio",vfFNumProv:"N. Provvisorio",vfFNumDef:"N. Definitivo",vfFIccid:"ICCID",vfbOffer:"Offerta",vfbMnp:"MNP",vfbMnpBrand:"Op. MNP",vfbMnpNum:"N. MNP",vfbTnp:"TNP",vfbModello:"Modello",vfbImei:"IMEI",vfbRataPiva:"Finanz.",vfbEasyRent:"Easy Rent",vfbCodIns:"Cod.Ins.",vfbNum:"Numero",vfbIccid:"ICCID",vfbCbOn:"Cambio Offerta",vfbCbCell:"Cellulare CB",vfbCbCodIns:"Cod.Ins. CB",vfbFGnp:"GNP",vfbFGnpBrand:"Op. GNP",vfbFGnpNum:"N. GNP",vfbFCodIns:"Cod.Ins.",vfbFNumProv:"N. Provvisorio",vfbFNumDef:"N. Definitivo",vfbFIccid:"ICCID",vfbFMnp:"MNP",vfbFMnpBrand:"Op. MNP",vfbFMnpNum:"N. MNP",vfbFCombNumProv:"N. Provv. Mobile",vfbFCombIccid:"ICCID Mobile",vfSolDigCodIns:"Cod.Ins.",verisureCodIns:"Cod.Ins.",kfCodIns:"Cod.Ins.",vcCodIns:"Cod.Ins.",fwOffer:"Offerta",fwMnp:"MNP",fwMnpBrand:"Op. MNP",fwMnpNum:"N. MNP",fwCodIns:"Cod.Ins.",fwNumProv:"N. Provvisorio",fwNumDef:"Numero",fwIccid:"ICCID",fwFGnp:"GNP",fwFGnpBrand:"Op. GNP",fwFGnpNum:"N. GNP",fwFCodIns:"Cod.Ins.",fwFNumProv:"N. Provvisorio",fwFNumDef:"N. Definitivo",fwPod:"POD",fwPdr:"PDR",fwEnCodIns:"Cod.Ins.",ilOffer:"Offerta",ilMnp:"MNP",ilDom:"Domiciliata",ilMnpBrand:"Op. MNP",ilMnpNum:"N. MNP",ilCodIns:"Cod.Ins.",ilNumProv:"N. Provvisorio",ilNumDef:"Numero",ilIccid:"ICCID",ilFGnp:"GNP",ilFGnpBrand:"Op. GNP",ilFGnpNum:"N. GNP",ilFCodIns:"Cod.Ins.",ilFNumProv:"N. Provvisorio",ilFNumDef:"N. Definitivo",ilFwaCodIns:"Cod.Ins.",ilFwaIccid:"ICCID",ilBizOffer:"Offerta",ilBizMnp:"MNP",ilBizMnpBrand:"Op. MNP",ilBizDom:"Domiciliazione",ilBizNum:"Numero",ilBizIccid:"ICCID",ilBizNumDef:"N. Definitivo",ilBizCodIns:"Cod.Ins.",enPod:"POD",enPdr:"PDR",enCodIns:"Cod.Ins.",enProv:"Op. Provenienza",fwEnProv:"Op. Provenienza",w3SostCell:"Numero",w3SostIccid:"ICCID",w3SostCodContr:"Cod. Contratto",w3SostCodIns:"Cod.Ins.",fwSostCell:"Numero",fwSostIccid:"ICCID",fwSostCodContr:"Cod. Contratto",fwSostCodIns:"Cod.Ins.",vfSostCell:"Numero",vfSostCodIns:"Cod.Ins.",timOffer:"Offerta",timMnp:"MNP",timMnpBrand:"Op. MNP",timMnpNum:"N. MNP",timTnp:"TNP",timModello:"Terminale",timSpedizione:"Spedizione",timFinanziato:"Finanziato",timCodPratica:"Codice Pratica",timVisionBox:"Box TIM Vision",timVisionTaglia:"TIM Vision",timVisionNumContr:"N. Contratto Vision",timImei:"IMEI",timNumProv:"N. Provvisorio",timNum:"Numero",timIccid:"ICCID",timCodIns:"Cod.Ins.",timFOffer:"Prodotto Fisso",timFGnp:"GNP",timFGnpBrand:"Op. GNP",timFGnpNum:"N. GNP",timFNumProv:"N. Fisso Provvisorio",timFCodIns:"Codice",timFVision:"TIM Vision",timFVisionTaglia:"TIM Vision",timFVisionNumContr:"N. Contratto Vision",timTpTwin:"Twin",timTpSeriale:"Seriale Telepass",timTpRecapito:"Recapito",timTpCodIns:"Cod.Ins.",veryOffer:"Offerta",veryMnp:"MNP",veryMnpBrand:"Op. MNP",veryMnpNum:"N. MNP",veryRicaricaAuto:"Ricarica Auto",veryFascia:"Tipologia offerta",veryCodIns:"Cod.Ins.",veryNumProv:"N. Provvisorio",veryNum:"Numero",veryIccid:"ICCID",hoOffer:"Offerta",hoMnp:"MNP",hoMnpBrand:"Op. MNP",hoMnpNum:"N. MNP",hoRicaricaAuto:"Ricarica Auto",hoFascia:"Tipologia offerta",hoCodIns:"Cod.Ins.",hoNumProv:"N. Provvisorio",hoNum:"Numero",hoIccid:"ICCID"};
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
  joinPairs(d.tnpModelli,d.tnpImeis,"Terminali TNP");
  joinPairs(d.cbTnpModelli,d.cbTnpImeis,"Terminali CB");
  if(Array.isArray(d.fwFSecLines)){const sl=d.fwFSecLines.filter(Boolean);if(sl.length)out["2e Linee"]=sl.join(", ");}
  Object.keys(d).forEach(k=>{if(DET_SKIP[k]||DET_SELOBJ[k])return;const v=d[k];if(v===null||v===undefined||v===""||v===false)return;if(typeof v==="object")return;const lbl=DET_LABELS[k]||k;const yv=detYN(v);if(yv!==null&&yv!==undefined&&yv!=="")out[lbl]=yv;});
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
const SMARTPHONES = WT_SMARTPHONES_GROUPED;

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
        vfOffers: !biz ? ["MOBILE START","MOBILE PRO","MOBILE POWER","MOBILE ULTRA","MOBILE START UNDER 18","C'ALL POWER EDITION","C'ALL MAX","C'ALL POWER PRO","DOLCE VITA","DOLCE VITA+","DATI","SMART HOME"] : null,
        fields: []
      },
      ...(!biz?[{ id:"cb", title:"CB", isCBVF:true, fields:[]}]:[]),
      ...(biz?[{ id:"cb", title:"CB", isCBVFBiz:true, fields:[]}]:[]),
      { id:"sost_sim", title:"Sostituzione Sim", isVFSostSim:true, hasContract:true, ct:"multi", fields:[]},
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
  <div style={{marginTop:8,padding:10,background:"rgba(255,255,255,0.03)",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)"}}>
    <div style={{fontSize:12,fontWeight:700,color:"#f8fafc",marginBottom:6}}>{label}</div>
    <div style={{display:"flex",gap:8}}>
      <button onClick={()=>onCh(true)} style={{padding:"6px 20px",borderRadius:6,border:val===true?"2px solid #28a745":"2px solid rgba(255,255,255,0.1)",background:val===true?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)",color:val===true?"#28a745":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>Sì</button>
      <button onClick={()=>onCh(false)} style={{padding:"6px 20px",borderRadius:6,border:val===false?"2px solid #dc3545":"2px solid rgba(255,255,255,0.1)",background:val===false?"rgba(220,53,69,0.12)":"rgba(255,255,255,0.04)",color:val===false?"#f87171":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>No</button>
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
  const isPod=L==="pod";
  const isPdr=L==="pdr";
  const isNum=!isIccid&&!isImei&&!isPod&&!isPdr&&(L.includes("provvisorio")||L.includes("portabil")||L.includes("definitivo")||L.includes("cellulare")||L.includes("telefono")||L.includes("fisso")||L==="numero"||L==="numero portabilità");
  const isFixedNum=isNum&&(L.includes("fiss")||L.includes("gnp"));
  const numMin=isFixedNum?7:9, numMax=isFixedNum?11:10;
  const onCh=(raw)=>{if(!o)return;let val=raw;if(isIccid)val=raw.replace(/\D/g,"").slice(0,19);else if(isImei)val=raw.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,15);else if(isPod)val=raw.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,15);else if(isPdr)val=raw.replace(/\D/g,"").slice(0,14);else if(isNum)val=raw.replace(/\D/g,"").slice(0,numMax);o(val);};
  let vErr="";
  if(err)vErr=err;
  else if(isIccid&&v&&v.length!==19)vErr="ICCID: 19 cifre richieste";
  else if(isImei&&v&&v.length!==15)vErr="IMEI: 15 caratteri richiesti";
  else if(isPod&&v&&!(v.length>=14&&v.length<=15&&/^IT/.test(v)))vErr="POD: IT + 14-15 caratteri";
  else if(isPdr&&v&&v.length!==14)vErr="PDR: 14 cifre richieste";
  else if(isNum&&v&&v.length<numMin)vErr="Min "+numMin+" cifre";
  const bad=!!vErr;
  const content = (
  <div>
    <div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>{l} {r&&<span style={{color:"#dc3545"}}>*</span>}</div>
    <input value={v||""} onChange={e=>onCh(e.target.value)} placeholder={p} disabled={dis} readOnly={dis}
      style={{width:"100%",padding:"7px 10px",borderRadius:6,border:bad?"2px solid #dc3545":dis?"2px solid #17a2b8":pf?"2px solid #28a745":"1px solid rgba(255,255,255,0.1)",fontSize:12,boxSizing:"border-box",background:bad?"rgba(220,53,69,0.12)":dis?"#e8f4f8":pf?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)",color:dis?"#17a2b8":"#f8fafc",fontStyle:dis?"italic":"normal"}} />
    {bad?<div style={{fontSize:10,color:"#dc3545",marginTop:2,fontWeight:700}}>⚠ {vErr}</div>:(nt&&<div style={{fontSize:10,color:dis?"#17a2b8":"#64748b",marginTop:2}}>{nt}</div>)}
  </div>
  );
  return content;
};

const DD = ({l,r,v,o,vals,nt}) => {
  const _rep=useContext(ReqCtx),_sk=useContext(SubKeyCtx),_fid=useRef(0),_last=useRef(null);if(_fid.current===0)_fid.current=++_FUID;
  const _emptyNow=!!r&&_isEmptyVal(v);
  useEffect(()=>{if(!(_rep&&_sk&&r))return;if(_last.current!==_emptyNow){_last.current=_emptyNow;_rep.report(_sk,_fid.current,_emptyNow);}},[_rep,_sk,r,_emptyNow]);
  useEffect(()=>{return ()=>{if(_rep&&_sk)_rep.report(_sk,_fid.current,undefined);};},[_rep,_sk]);
  const isGrouped = vals && vals.length>0 && typeof vals[0]==="object" && vals[0].group;
  const [q,setQ]=useState("");
  const [open,setOpen]=useState(false);
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
      <div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>{l} {r&&<span style={{color:"#dc3545"}}>*</span>}</div>
      <input value={open?q:(v||"")} placeholder={v?v:"Cerca o seleziona…"}
        onFocus={()=>{setOpen(true);setQ("");}}
        onChange={e=>{setQ(e.target.value);setOpen(true);}}
        onBlur={()=>setTimeout(()=>setOpen(false),180)}
        style={{width:"100%",padding:"7px 10px",borderRadius:6,border:v?"2px solid #28a745":"1px solid rgba(255,255,255,0.1)",fontSize:12,boxSizing:"border-box",background:v&&!open?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)"}}/>
      {open&&(
        <div style={{position:"absolute",zIndex:200,left:0,right:0,top:"100%",marginTop:2,background:"#161a26",border:"1px solid rgba(255,255,255,0.14)",borderRadius:8,boxShadow:"0 12px 32px rgba(0,0,0,.6)",maxHeight:260,overflowY:"auto"}}>
          {v&&<div onMouseDown={()=>{o&&o("");setOpen(false);}} style={{padding:"7px 10px",fontSize:11,color:"#dc3545",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>✕ Deseleziona</div>}
          {filtered.length===0&&<div style={{padding:"10px",fontSize:12,color:"#64748b"}}>Nessun risultato</div>}
          {Object.keys(byGroup).map(gk=>(
            <div key={gk||"_"}>
              {gk&&<div style={{padding:"5px 10px",fontSize:10,fontWeight:700,color:"#94a3b8",background:"#1f2533",textTransform:"uppercase",position:"sticky",top:0}}>{gk}</div>}
              {byGroup[gk].map(it=><div key={it} onMouseDown={()=>{o&&o(it);setOpen(false);setQ("");}} style={{padding:"7px 12px",fontSize:12,cursor:"pointer",background:v===it?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)",color:"#f8fafc"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.08)"} onMouseLeave={e=>e.currentTarget.style.background=v===it?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)"}>{it}</div>)}
            </div>
          ))}
        </div>
      )}
      {nt&&<div style={{fontSize:10,color:"#64748b",marginTop:2}}>{nt}</div>}
      {/* Se e' selezionato "Altro", compare un campo per inserire il modello non in lista.
          Il valore viene salvato come "Altro: <modello>" cosi' il campo resta visibile. */}
      {typeof v==="string"&&(v==="Altro"||v.startsWith("Altro:"))&&(
        <input autoFocus value={v.replace(/^Altro:?\s*/,"")} placeholder="Inserisci il modello non in lista…"
          onChange={e=>{const t=e.target.value;o&&o(t?("Altro: "+t):"Altro");}}
          style={{width:"100%",marginTop:6,padding:"7px 10px",borderRadius:6,fontSize:12,boxSizing:"border-box",border:"1px solid rgba(111,66,193,0.5)",background:"rgba(111,66,193,0.10)",color:"#f8fafc"}}/>
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
      <div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Codice <span style={{color:"#dc3545"}}>*</span></div>
      <select value={actual} onChange={e=>onCh(e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,fontSize:12,border:actual?"2px solid #28a745":"1px solid rgba(255,255,255,0.1)",background:actual&&!isOv?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)"}}>
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
    <div style={{borderBottom:ii<total-1?"1px solid rgba(255,255,255,0.03)":"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0"}}>
        <span style={{fontSize:14}}>{it.macroIcon}</span><span style={{fontSize:12,fontWeight:600,color:it.macroColor}}>{it.macro}</span><span style={{color:"rgba(255,255,255,0.1)"}}>›</span><span style={{fontSize:12,color:"#f8fafc"}}>{it.sub}</span>
        {it.details&&it.details.hasContract&&<span style={{fontSize:9,fontWeight:600,color:"#fff",background:it.macroColor,padding:"1px 6px",borderRadius:4}}>CONTRATTO</span>}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:10,color:"#64748b"}}>V.#{it.saleNum}</span>
          <button onClick={()=>setExpI(p=>({...p,[gi+"_"+ii]:!p[gi+"_"+ii]}))} style={{background:exp?"rgba(0,114,198,0.10)":"rgba(255,255,255,0.03)",border:exp?"1px solid #2E75B6":"1px solid rgba(255,255,255,0.1)",borderRadius:5,padding:"3px 10px",fontSize:10,fontWeight:600,cursor:"pointer",color:exp?"#2E75B6":"#64748b"}}>{exp?"▲ Nascondi":"👁 Mostra"}</button>
        </div>
      </div>
      {exp&&<div style={{padding:"8px 12px 12px 32px"}}><div style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:12,border:"1px solid rgba(255,255,255,0.12)"}}><div style={{fontSize:11,fontWeight:700,color:it.macroColor,marginBottom:8}}>📋 {it.sub}</div>
        {dets.length>0?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 16px"}}>{dets.map(([k,v])=><div key={k}><span style={{fontSize:10,fontWeight:600,color:"#64748b",textTransform:"uppercase"}}>{k}</span><div style={{fontSize:12,color:"#f8fafc",marginTop:1}}>{String(v)}</div></div>)}</div>
        :<div style={{fontSize:12,color:"#64748b"}}>Nessun dettaglio — premi ✏️ Modifica</div>}
      </div></div>}
    </div>
  );
  return content;
};

// ── VF Mobile GA component ────────────────────────────────────────────────

const VF_C="#E60000";
const VF_LIGHT="rgba(220,53,69,0.12)";
const VF_BORDER="#F5C6C6";
const VF_BRANDS=["TIM","Vodafone","WindTre","Iliad","Fastweb","Sky","Sky Mobile","Very Mobile","Ho Mobile","Postemobile","Coop Voce","Tiscali","Lyca Mobile","Altro"];
const VF_SMARTPHONES = VF_SMARTPHONES_GROUPED;
const GNP_FISSO_BRANDS=["TIM","Vodafone","WindTre","Fastweb","Tiscali","Sky Wifi","Enel Fibra","EniPlenitude Fibra","Iliad","Altro"];
const VF_GNP_BRANDS=["TIM","Vodafone","WindTre","Fastweb","Tiscali","Sky Wifi","Enel Fibra","EniPlenitude Fibra","Iliad","Altro"];
const VF_CODICI_NEGOZIO=["Acilia","Baleniere","Castani","Merulana","Donna","Magliana","Collatina","Garbatella"];
const FW_C = "#CC9900";

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
const FW_GNP_BRANDS = ["TIM","Vodafone","WindTre","Fastweb","Tiscali","Sky Wifi","Enel Fibra","EniPlenitude Fibra","Iliad","Altro"];

const getFW = (tc) => {
  const biz = tc === "business";
  return [
    { id:"mobile", title:"MOBILE", icon:"📱", color:FW_C, radio:true, subs:[
      { id:"ga", title:"MOBILE", isFWMobile:true, fwBiz:biz, hasContract:true, ct:"ga", fields:[] },
      // Segnalazione 34: mancava la sostituzione SIM, presente su WindTre e Vodafone.
      { id:"sost_sim", title:"Sostituzione Sim", isFWSostSim:true, hasContract:true, ct:"multi", fields:[] },
    ]},
    { id:"fisso", title:"FISSO", icon:"🏠", color:"#28a745", radio:true, subs:
      (biz?FW_FISSO_BIZ_OFFERS:FW_FISSO_OFFERS).map(o=>({ id:o.toLowerCase().replace(/ /g,"_"), title:o, isFWFisso:true, fwBiz:biz, hasContract:true, ct:"fisso", fields:[] }))
    },
    { id:"energia", title:"ENERGIA", icon:"🔋", color:"#28a745", radio:false, subs:
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
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Offerta Mobile</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {offerList.map(offer=>{
          const isActive=sd.fwOffer===offer;
          return (
            <button key={offer} onClick={()=>{const nw=isActive?null:offer;upv("fwOffer",nw);if(nw&&!biz){const nowMnp=nw.indexOf("MNP")>=0;if(nowMnp&&!sd.fwNumProv&&sd.fwNumDef)upv("fwNumProv",sd.fwNumDef);if(!nowMnp&&!sd.fwNumDef&&sd.fwNumProv)upv("fwNumDef",sd.fwNumProv);}}}
              style={{padding:"8px 14px",borderRadius:10,border:isActive?"2px solid "+FW_C:"2px solid rgba(255,255,255,0.1)",background:isActive?FW_C:"rgba(255,255,255,0.04)",color:isActive?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
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
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase"}}>Portabilità (MNP)</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Operatore provenienza" r v={sd.fwMnpBrand||""} o={v=>upv("fwMnpBrand",v)} vals={FW_BRANDS_MNP}/>
                <TF l="Numero Portabilità" r v={sd.fwMnpNum||""} o={v=>upv("fwMnpNum",v)} p="3XXXXXXXXX"/>
              </div>
            </div>
          )}

          <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
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
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:12,marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
            <DD l="Operatore GNP" r v={sd.fwFGnpBrand||""} o={v=>upv("fwFGnpBrand",v)} vals={FW_GNP_BRANDS}/>
            <TF l="Numero Fisso GNP" r v={sd.fwFGnpNum||""} o={v=>{upv("fwFGnpNum",v);if(isCentr)upv("fwFNumDef",v);}} p="06XXXXXXXX"/>
          </div>
          {hasSecLines&&(
            <div style={{marginTop:12,borderTop:"1px solid rgba(255,255,255,0.1)",paddingTop:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:6,textTransform:"uppercase"}}>Seconde linee da migrare</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                {[0,1,2,3,4,5].map(n=>(
                  <button key={n} onClick={()=>setSecCount(n)} style={{width:36,height:34,borderRadius:8,border:secCount===n?"2px solid "+FW_C:"2px solid rgba(255,255,255,0.1)",background:secCount===n?FW_C:"rgba(255,255,255,0.04)",color:secCount===n?"#fff":"#8892b0",fontSize:13,fontWeight:700,cursor:"pointer"}}>{n}</button>
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
        <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:12,textTransform:"uppercase"}}>📋 Dati Contratto</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
            <SCd session={sc} codici={FW_CODICI_NEGOZIO} val={sd.fwFCodIns||""} onCh={v=>upv("fwFCodIns",v)}/>
            {sd.fwFGnp==="Sì"?(
              <TF l="N. Fisso Provvisorio" r v={sd.fwFNumProv||""} o={v=>upv("fwFNumProv",v)} p="06XXXXXXXX"/>
            ):(
              <TF l="N. Fisso Definitivo" r v={sd.fwFNumDef||""} o={v=>upv("fwFNumDef",v)} p="06XXXXXXXX"/>
            )}
            {sd.fwFGnp==="Sì"&&(
              <TF l="N. Fisso Definitivo" r v={sd.fwFNumDef||""} o={v=>{upv("fwFNumDef",v);if(isCentr)upv("fwFGnpNum",v);}} p="06XXXXXXXX"/>
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
    <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
      <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
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
      <div style={{fontSize:10,fontWeight:700,color:"#64748b",marginBottom:4,textTransform:"uppercase",letterSpacing:.4}}>{label}</div>
      <div style={{display:"flex",gap:6}}>
        {opts.map(o=>{
          const isActive=locked?(o===(lockVal===true?"Sì":lockVal===false?"No":lockVal)):val===o||val===(o==="Sì"?true:o==="No"?false:o);
          return (
            <button key={o} onClick={()=>!locked&&onCh(val===o?null:o)} disabled={locked}
              style={{padding:"5px 16px",borderRadius:6,border:isActive?"2px solid #2E75B6":"2px solid rgba(255,255,255,0.1)",background:isActive?"#2E75B6":"rgba(255,255,255,0.04)",color:isActive?"#fff":"#8892b0",fontSize:11,fontWeight:700,cursor:locked?"not-allowed":"pointer",opacity:locked?0.8:1}}>
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
            style={{padding:"7px 20px",borderRadius:8,border:val===o?"2px solid "+VF_C:"2px solid rgba(255,255,255,0.1)",background:val===o?VF_C:"rgba(255,255,255,0.04)",color:val===o?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
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
    <div style={{marginBottom:10,padding:10,background:"rgba(255,255,255,0.03)",borderRadius:8,border:"1px solid rgba(220,53,69,0.12)"}}>
      {modoRiga==="Entrambi"&&(
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          {["Bundle","Accessorio"].map(t=>(
            <button key={t} onClick={()=>onUpd("tipo",riga.tipo===t?null:t)}
              style={{padding:"4px 14px",borderRadius:6,border:riga.tipo===t?"2px solid "+VF_C:"2px solid rgba(255,255,255,0.1)",background:riga.tipo===t?VF_C:"rgba(255,255,255,0.04)",color:riga.tipo===t?"#fff":"#8892b0",fontSize:11,fontWeight:700,cursor:"pointer"}}>
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
              style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,boxSizing:"border-box"}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,fontWeight:600,color:"#64748b",marginBottom:2}}>Tipologia €</div>
            <select value={riga.tipoBundleVal||""} onChange={e=>onUpd("tipoBundleVal",e.target.value)}
              style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,boxSizing:"border-box",background:"rgba(255,255,255,0.02)"}}>
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
              style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,boxSizing:"border-box",fontFamily:"monospace"}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,fontWeight:600,color:"#64748b",marginBottom:2}}>Valore €</div>
            <input value={riga.valore||""} onChange={e=>onUpd("valore",e.target.value)} placeholder="0.00"
              style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,boxSizing:"border-box"}}/>
          </div>
        </div>
      )}
      {modoRiga==="Entrambi"&&!riga.tipo&&(
        <div style={{fontSize:11,color:"#64748b",fontStyle:"italic"}}>Seleziona Bundle o Accessorio</div>
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
            <div style={{borderTop:"1px solid rgba(220,53,69,0.12)",paddingTop:10,marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase"}}>Bundle / Accessori</div>
                <div style={{display:"flex",gap:6}}>
                  {["Bundle","Accessorio"].map(t=>{
                    const isOn=t==="Bundle"?bundleOn:accessorioOn;
                    return (
                      <button key={t} onClick={()=>toggleMode(i,t)}
                        style={{padding:"4px 14px",borderRadius:6,border:isOn?"2px solid "+VF_C:"2px solid rgba(255,255,255,0.1)",background:isOn?VF_C:"rgba(255,255,255,0.04)",color:isOn?"#fff":"#8892b0",fontSize:11,fontWeight:700,cursor:"pointer"}}>
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
            <div style={{borderTop:"1px solid rgba(220,53,69,0.12)",paddingTop:8}}>
              <button onClick={()=>updItem(i,"kasko",!item.kasko)}
                style={{padding:"5px 16px",borderRadius:7,border:item.kasko?"2px solid #6f42c1":"2px solid rgba(255,255,255,0.1)",background:item.kasko?"rgba(111,66,193,0.12)":"rgba(255,255,255,0.04)",color:item.kasko?"#6f42c1":"#8892b0",fontSize:11,fontWeight:700,cursor:"pointer"}}>
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
          <button onClick={()=>onRemoveSlot(idx)} style={{background:"none",border:"1px solid #dc3545",borderRadius:6,padding:"2px 10px",color:"#dc3545",fontSize:10,cursor:"pointer",fontWeight:600}}>✕ Rimuovi</button>
        </div>
      )}
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase"}}>Tipologia dispositivo</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
        {allOpts.map(t=>{
          const isOn=slot.tipo===t;
          const initCompass=(COMPASS_OPTS.includes(t)||t==="Forward")?[emCompassItem()]:[];
          return (
            <button key={t} onClick={()=>set("__replace__",isOn?emTnpSlot():{...emTnpSlot(),tipo:t,compassItems:initCompass})}
              style={{padding:"7px 14px",borderRadius:8,border:isOn?"2px solid "+VF_C:"2px solid rgba(255,255,255,0.1)",background:isOn?VF_C:"rgba(255,255,255,0.04)",color:isOn?"#fff":"#8892b0",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              {t}
            </button>
          );
        })}
      </div>

      {isTnpTaglia&&(
        <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid "+VF_BORDER,borderRadius:8,padding:12,marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase"}}>Dati TNP</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
            <DD l="Modello terminale" r v={slot.modello||""} o={v=>set("modello",v)} vals={VF_SMARTPHONES}/>
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
              style={{padding:"8px 14px",borderRadius:10,border:isActive?"2px solid "+VF_C:"2px solid rgba(255,255,255,0.1)",background:isActive?VF_C:"rgba(255,255,255,0.04)",color:isActive?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {offer}
            </button>
          );
        })}
      </div>
      {sd.vfOffer&&(
        <div>
          {/* MNP — bloccato a No per DV/DV+ */}
          {isDati?null:isDV?(
            <div style={{marginBottom:12,padding:"8px 12px",background:"rgba(245,158,11,0.14)",border:"1px solid #ffc107",borderRadius:8,fontSize:11,color:"#f59e0b"}}>
              MNP: <strong>No</strong> — non disponibile per {sd.vfOffer}
            </div>
          ):(
            <RB label="MNP?" val={sd.vfMnp} opts={["Sì","No"]} onCh={v=>{upv("vfMnp",v);if(v==="No"){upv("vfMnpBrand","");upv("vfMnpNum","")}}}/>
          )}
          {!isDV&&!isDati&&sd.vfMnp==="Sì"&&(
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:12,marginBottom:12}}>
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
                <div style={{marginBottom:12,padding:"8px 12px",background:"rgba(245,158,11,0.14)",border:"1px solid #ffc107",borderRadius:8,fontSize:11,color:"#f59e0b"}}>
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
                        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:12,marginBottom:12}}>
                          <TF l="Numero Fisso Convergenza" v={sd.vfNumFisso||""} o={v=>upv("vfNumFisso",v)} p="06XXXXXXXX"/>
                        </div>
                      )}
                    </div>
                  )}
                  {(sd.vfConvergenza||isDV||isDati)&&(
                    <div>
                      {isDati?null:isDV?(
                        <div style={{marginBottom:12,padding:"8px 12px",background:"rgba(245,158,11,0.14)",border:"1px solid #ffc107",borderRadius:8,fontSize:11,color:"#f59e0b"}}>
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
                          <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:6,textTransform:"uppercase"}}>Security</div>
                          <div style={{display:"flex",gap:8}}>
                            {["Sì","No"].map(o=>(
                              <button key={o} onClick={()=>upv("vfSecurity",sd.vfSecurity===o?null:o)}
                                style={{padding:"7px 22px",borderRadius:8,border:sd.vfSecurity===o?"2px solid "+VF_C:"2px solid rgba(255,255,255,0.1)",background:sd.vfSecurity===o?VF_C:"rgba(255,255,255,0.04)",color:sd.vfSecurity===o?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                                {o}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Dati Contratto */}
                      {(sd.vfTnp||isDV||isDati)&&(
                        <div style={{marginTop:12,background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
                          <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:12,textTransform:"uppercase"}}>📋 Dati Contratto</div>
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
                                <div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Ricarica Automatica <span style={{color:"#dc3545"}}>*</span></div>
                                <div style={{display:"flex",gap:8}}>
                                  {["Sì","No"].map(o=>(
                                    <button key={o} onClick={()=>upv("dcRicaricaAuto",sd.dcRicaricaAuto===o?null:o)}
                                      style={{padding:"6px 18px",borderRadius:8,border:sd.dcRicaricaAuto===o?"2px solid "+VF_C:"2px solid rgba(255,255,255,0.1)",background:sd.dcRicaricaAuto===o?VF_C:"rgba(255,255,255,0.04)",color:sd.dcRicaricaAuto===o?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
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
                  <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:12,marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:8,textTransform:"uppercase"}}>Add-on Fisso</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {VF_ADDON_FISSO.map(a=>{
                        const on=(sd.vfFAddons||{})[a];
                        return (
                          <button key={a} onClick={()=>toggleAddon(a)}
                            style={{padding:"5px 14px",borderRadius:6,border:on?"2px solid #28a745":"2px solid rgba(255,255,255,0.1)",background:on?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)",color:on?"#28a745":"#8892b0",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                            <span>{on?"☑":"☐"}</span>{a}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dati Contratto */}
                  <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:12,textTransform:"uppercase"}}>📋 Dati Contratto</div>
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
          style={{padding:"8px 20px",borderRadius:8,border:sd.cbTnp?"2px solid "+VF_C:"2px solid rgba(255,255,255,0.1)",background:sd.cbTnp?VF_C:"rgba(255,255,255,0.04)",color:sd.cbTnp?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>TNP CB</button>
        <button onClick={()=>upv("cbCambio2",!sd.cbCambio2)}
          style={{padding:"8px 20px",borderRadius:8,border:sd.cbCambio2?"2px solid "+VF_C:"2px solid rgba(255,255,255,0.1)",background:sd.cbCambio2?VF_C:"rgba(255,255,255,0.04)",color:sd.cbCambio2?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>Cambio Offerta</button>
        <button onClick={()=>upv("cbTraslochi",!sd.cbTraslochi)}
          style={{padding:"8px 20px",borderRadius:8,border:sd.cbTraslochi?"2px solid "+VF_C:"2px solid rgba(255,255,255,0.1)",background:sd.cbTraslochi?VF_C:"rgba(255,255,255,0.04)",color:sd.cbTraslochi?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>Traslochi</button>
        <button onClick={()=>upv("cbSecurity",!sd.cbSecurity)}
          style={{padding:"8px 20px",borderRadius:8,border:sd.cbSecurity?"2px solid "+VF_C:"2px solid rgba(255,255,255,0.1)",background:sd.cbSecurity?VF_C:"rgba(255,255,255,0.04)",color:sd.cbSecurity?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>Rete Sicura</button>
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
            <div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Offerta <span style={{color:"#dc3545"}}>*</span></div>
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
          <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:10,textTransform:"uppercase"}}>Dati Rete Sicura CB</div>
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
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Offerta Mobile</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {offers.map(offer=>{
          const isActive=sd.vfbOffer===offer;
          return (
            <button key={offer} onClick={()=>{upv("vfbOffer",isActive?null:offer);if(!isActive){upv("vfbMnp",null);upv("vfbTnp",null);upv("vfbModello","");upv("vfbImei","");upv("vfbEasyRent",null);upv("vfbRataPiva",null);upv("vfbCodIns","");}}}
              style={{padding:"8px 14px",borderRadius:10,border:isActive?"2px solid "+VF_C:"2px solid rgba(255,255,255,0.1)",background:isActive?VF_C:"rgba(255,255,255,0.04)",color:isActive?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {offer}
            </button>
          );
        })}
      </div>
      {sd.vfbOffer&&(
        <div>
          <RB label="MNP?" val={sd.vfbMnp} opts={["Sì","No"]} onCh={v=>{upv("vfbMnp",v);if(v==="No"){upv("vfbMnpBrand","");upv("vfbMnpNum","")}}}/>
          {sd.vfbMnp==="Sì"&&(
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:12,marginBottom:12}}>
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
                          style={{padding:"7px 18px",borderRadius:8,border:isOn?"2px solid "+VF_C:"2px solid rgba(255,255,255,0.1)",background:isOn?VF_C:"rgba(255,255,255,0.04)",color:isOn?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
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
                            style={{padding:"6px 14px",borderRadius:7,border:sel?"2px solid "+VF_C:"2px solid rgba(255,255,255,0.1)",background:sel?"rgba(111,66,193,0.12)":"rgba(255,255,255,0.04)",color:sel?VF_C:"#8892b0",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                            <span>{sel?"☑":"☐"}</span>{k}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <div style={{marginTop:8,background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
                <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
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
          style={{padding:"8px 20px",borderRadius:8,border:sd.vfbCbOn?"2px solid "+VF_C:"2px solid rgba(255,255,255,0.1)",background:sd.vfbCbOn?VF_C:"rgba(255,255,255,0.04)",color:sd.vfbCbOn?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
          CB
        </button>
      </div>
      {sd.vfbCbOn&&(
        <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
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
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:12,marginBottom:12}}>
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
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:12,marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
            <DD l="Operatore GNP" r v={sd.vfbFGnpBrand||""} o={v=>upv("vfbFGnpBrand",v)} vals={VF_GNP_BRANDS}/>
            <TF l="Numero Fisso GNP" r v={sd.vfbFGnpNum||""} o={v=>upv("vfbFGnpNum",v)} p="06XXXXXXXX"/>
          </div>
        </div>
      )}
      {sd.vfbFGnp&&(
        <div>
          <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:12,textTransform:"uppercase"}}>📋 Dati Contratto</div>
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

const IL_C = "#C00028";
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
    { id:"fisso", title:"FISSO", icon:"🏠", color:"#28a745", radio:true, subs:
      IL_FISSO_OFFERS.map(o=>({ id:o.toLowerCase().replace(/ /g,"_"), title:o, isILFisso:true, hasContract:true, ct:"fisso", fields:[] }))
      .concat([{ id:"fwa", title:"FWA", isILFwa:true, hasContract:true, ct:"fisso", fields:[] }])
    },
  ];
};

const ILMobile = ({sd, uP, sc}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Offerta Mobile</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {IL_MOBILE_OFFERS.map(offer=>{
          const isActive=sd.ilOffer===offer;
          return (
            <button key={offer} onClick={()=>{upv("ilOffer",isActive?null:offer);upv("ilMnp",null);upv("ilDom",null);upv("ilMnpBrand","");upv("ilMnpNum","");upv("ilCodIns","");upv("ilNumProv","");upv("ilNumDef","");upv("ilIccid","");}}
              style={{padding:"8px 14px",borderRadius:10,border:isActive?"2px solid "+IL_C:"2px solid rgba(255,255,255,0.1)",background:isActive?IL_C:"rgba(255,255,255,0.04)",color:isActive?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {offer}
            </button>
          );
        })}
      </div>
      {sd.ilOffer&&(
        <div>
          <RB label="MNP?" val={sd.ilMnp} opts={["Sì","No"]} onCh={v=>{upv("ilMnp",v);if(v==="No"){upv("ilMnpBrand","");upv("ilMnpNum","");}}}/>
          {sd.ilMnp==="Sì"&&(
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Operatore provenienza" r v={sd.ilMnpBrand||""} o={v=>upv("ilMnpBrand",v)} vals={IL_GNP_BRANDS}/>
                <TF l="Numero Portabilità" r v={sd.ilMnpNum||""} o={v=>upv("ilMnpNum",v)} p="3XXXXXXXXX"/>
              </div>
            </div>
          )}
          {sd.ilMnp&&<RB label="Domiciliata?" val={sd.ilDom} opts={["Sì","No"]} onCh={v=>upv("ilDom",v)}/>}
          {sd.ilDom&&(
            <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
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
        <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
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
    <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
      <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
        <SCd session={sc} codici={IL_CODICI_NEGOZIO} val={sd.ilFwaCodIns||""} onCh={v=>upv("ilFwaCodIns",v)}/>
        <TF l="ICCID" r v={sd.ilFwaIccid||""} o={v=>upv("ilFwaIccid",v)} p="8939..." nt="Barcode 📷"/>
      </div>
    </div>
  );
  return content;
};

// ── ENERGY ──────────────────────────────────────────────────────
const EN_C = "#28a745";
const EN_CODICI_NEGOZIO = negozi;

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
const TIM_C = "#0050FF";
const TIM_MOBILE_OFFERS = ["Tim Mobile","Tim Power Supreme Orange","Tim Power Supreme Red"];
const TIM_FISSO_OFFERS = ["Fibra","Fwa"];
const TIM_VISION_TAGLIE = ["Tim Vision S","Tim Vision M","Tim Vision L"];
const TIM_CODICI_NEGOZIO = ["Collatina"];
const VERY_C = "#1FA300";
const HO_C = "#E6007E";
const VERY_CODICI_NEGOZIO = ["Donna","Promontori","Garbatella"];
const HO_CODICI_NEGOZIO = ["Collatina","Donna","Magliana","Promontori"];
const FASCIA_OPTS = ["< 6,99 €","> 6,99 €"];

const getTIM = (tc) => {
  const biz = tc === "business";
  if(biz) return [];
  return [
    { id:"mobile", title:"MOBILE", icon:"📱", color:TIM_C, radio:true, subs:[
      { id:"ga", title:"MOBILE", isTimMobile:true, hasContract:true, ct:"ga", fields:[] },
    ]},
    { id:"fisso", title:"FISSO", icon:"🏠", color:"#28a745", radio:true, subs:[
      { id:"ga", title:"FISSO", isTimFisso:true, hasContract:true, ct:"fisso", fields:[] },
    ]},
    { id:"multi", title:"MULTI-SERVIZI", icon:"🧩", color:"#6f42c1", radio:false, subs:[
      { id:"telepass", title:"Telepass", isTimTelepass:true, hasContract:true, ct:"multi", fields:[] },
    ]},
  ];
};

const TIMMobile = ({sd, uP, sc}) => {
  const upv=(k,v)=>uP(k,v);
  const content = (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Offerta Mobile</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {TIM_MOBILE_OFFERS.map(offer=>{
          const isActive=sd.timOffer===offer;
          return (
            <button key={offer} onClick={()=>{upv("timOffer",isActive?null:offer);if(isActive){upv("timMnp",null);upv("timMnpBrand","");upv("timMnpNum","");upv("timTnp",null);upv("timModello","");upv("timSpedizione",null);upv("timFinanziato",null);upv("timCodPratica","");upv("timVisionBox",null);upv("timVisionTaglia",null);upv("timVisionNumContr","");upv("timImei","");upv("timNumProv","");upv("timNum","");upv("timIccid","");upv("timCodIns","");}}}
              style={{padding:"8px 14px",borderRadius:10,border:isActive?"2px solid "+TIM_C:"2px solid rgba(255,255,255,0.1)",background:isActive?TIM_C:"rgba(255,255,255,0.04)",color:isActive?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>{offer}</button>
          );
        })}
      </div>
      {sd.timOffer&&(
        <div>
          <RB label="MNP?" val={sd.timMnp} opts={["Sì","No"]} onCh={v=>{upv("timMnp",v);if(v==="No"){upv("timMnpBrand","");upv("timMnpNum","");}}}/>
          {sd.timMnp==="Sì"&&(
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:12,marginBottom:12}}>
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
              <div style={{fontSize:11,fontWeight:700,color:"#6f42c1",marginBottom:8,textTransform:"uppercase"}}>TIM Vision <span style={{color:"#dc3545"}}>*</span></div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                {TIM_VISION_TAGLIE.map(t=>{const on=sd.timVisionTaglia===t;return <button key={t} onClick={()=>upv("timVisionTaglia",on?null:t)} style={{padding:"7px 16px",borderRadius:8,border:on?"2px solid #6f42c1":"2px solid rgba(255,255,255,0.1)",background:on?"#6f42c1":"rgba(255,255,255,0.04)",color:on?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>{t}</button>;})}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <TF l="Numero Contratto" r v={sd.timVisionNumContr||""} o={v=>upv("timVisionNumContr",v)} p="N. contratto Vision"/>
              </div>
            </div>
          )}
          {sd.timTnp&&(
            <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
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
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Prodotto Fisso</div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {TIM_FISSO_OFFERS.map(offer=>{const isActive=sd.timFOffer===offer;return (
          <button key={offer} onClick={()=>{upv("timFOffer",isActive?null:offer);if(isActive){upv("timFGnp",null);upv("timFGnpBrand","");upv("timFGnpNum","");upv("timFNumProv","");upv("timFCodIns","");upv("timFVision",null);upv("timFVisionTaglia",null);upv("timFVisionNumContr","");}}}
            style={{padding:"8px 18px",borderRadius:10,border:isActive?"2px solid "+TIM_C:"2px solid rgba(255,255,255,0.1)",background:isActive?TIM_C:"rgba(255,255,255,0.04)",color:isActive?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>{offer}</button>
        );})}
      </div>
      {sd.timFOffer&&(
        <div>
          <RB label="GNP?" val={sd.timFGnp} opts={["Sì","No"]} onCh={v=>{upv("timFGnp",v);if(v==="No"){upv("timFGnpBrand","");upv("timFGnpNum","");}}}/>
          {sd.timFGnp==="Sì"&&(
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px"}}>
                <DD l="Operatore GNP" r v={sd.timFGnpBrand||""} o={v=>upv("timFGnpBrand",v)} vals={GNP_FISSO_BRANDS}/>
                <TF l="Numero Fisso Portabilità" r v={sd.timFGnpNum||""} o={v=>upv("timFGnpNum",v)} p="06XXXXXXXX"/>
              </div>
            </div>
          )}
          {sd.timFGnp&&(
            <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14,marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
                <TF l="Numero Fisso Provvisorio" r v={sd.timFNumProv||""} o={v=>upv("timFNumProv",v)} p="06XXXXXXXX"/>
                <SCd session={sc} codici={TIM_CODICI_NEGOZIO} val={sd.timFCodIns||""} onCh={v=>upv("timFCodIns",v)}/>
              </div>
            </div>
          )}
          {sd.timFGnp&&<RB label="TIM Vision?" val={sd.timFVision} opts={["Sì","No"]} onCh={v=>{upv("timFVision",v);if(v==="No"){upv("timFVisionTaglia",null);upv("timFVisionNumContr","");}}}/>}
          {sd.timFVision==="Sì"&&(
            <div style={{background:"rgba(111,66,193,0.12)",border:"1px solid rgba(111,66,193,0.3)",borderRadius:8,padding:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6f42c1",marginBottom:8,textTransform:"uppercase"}}>TIM Vision <span style={{color:"#dc3545"}}>*</span></div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                {TIM_VISION_TAGLIE.map(t=>{const on=sd.timFVisionTaglia===t;return <button key={t} onClick={()=>upv("timFVisionTaglia",on?null:t)} style={{padding:"7px 16px",borderRadius:8,border:on?"2px solid #6f42c1":"2px solid rgba(255,255,255,0.1)",background:on?"#6f42c1":"rgba(255,255,255,0.04)",color:on?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>{t}</button>;})}
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
        <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
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

const SimpleMobile = ({sd, uP, pfx, accent, codici, sc}) => {
  const upv=(k,v)=>uP(k,v);
  const K=(s)=>pfx+s;
  const offSel=sd[K("Offer")];
  const content = (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Tipologia offerta</div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <button onClick={()=>{const on=offSel==="MOBILE";upv(K("Offer"),on?null:"MOBILE");if(on){upv(K("Mnp"),null);upv(K("MnpBrand"),"");upv(K("MnpNum"),"");upv(K("RicaricaAuto"),null);upv(K("Fascia"),null);upv(K("CodIns"),"");upv(K("NumProv"),"");upv(K("Num"),"");upv(K("Iccid"),"");}}}
          style={{padding:"8px 22px",borderRadius:10,border:offSel==="MOBILE"?"2px solid "+accent:"2px solid rgba(255,255,255,0.1)",background:offSel==="MOBILE"?accent:"rgba(255,255,255,0.04)",color:offSel==="MOBILE"?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>MOBILE</button>
      </div>
      {offSel&&(
        <div>
          <RB label="MNP?" val={sd[K("Mnp")]} opts={["Sì","No"]} onCh={v=>{upv(K("Mnp"),v);if(v==="No"){upv(K("MnpBrand"),"");upv(K("MnpNum"),"");}}}/>
          {sd[K("Mnp")]==="Sì"&&(
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:12,marginBottom:12}}>
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
            <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
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
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.4}}>Offerta Mobile</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {IL_BIZ_MOBILE_OFFERS.map(offer=>{
          const isActive=sd.ilBizOffer===offer;
          return (
            <button key={offer} onClick={()=>{upv("ilBizOffer",isActive?null:offer);upv("ilBizMnp",null);upv("ilBizMnpBrand","");upv("ilBizDom",null);upv("ilBizNum","");upv("ilBizIccid","");upv("ilBizNumDef","");upv("ilBizCodIns","");}}
              style={{padding:"8px 18px",borderRadius:10,border:isActive?"2px solid "+IL_C:"2px solid rgba(255,255,255,0.1)",background:isActive?IL_C:"rgba(255,255,255,0.04)",color:isActive?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {offer}
            </button>
          );
        })}
      </div>
      {sd.ilBizOffer&&(
        <div>
          <RB label="MNP?" val={sd.ilBizMnp} opts={["Sì","No"]} onCh={v=>{upv("ilBizMnp",v);if(v==="No"){upv("ilBizMnpBrand","");}}}/>
          {sd.ilBizMnp==="Sì"&&(
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:12,marginBottom:12}}>
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
                <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14,marginTop:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
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
    <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
      <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>🔄 Sostituzione SIM — Dati Contratto</div>
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
      <div style={{fontSize:11,fontWeight:700,color:"#CC9900",marginBottom:10,textTransform:"uppercase"}}>🔄 Sostituzione SIM — Dati Contratto</div>
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
    <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
      <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>🔄 Sostituzione SIM — Dati Contratto</div>
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
    <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:14}}>
      <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto — {sub.enBrand} {sub.title}</div>
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
const subComplete=(sub,d)=>{
  if(!d)return false;
  const F=(k)=>_NE(d[k]);
  const C=d.contract||{};
  const CF=(k)=>_NE(C[k]);
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
    return true;
  }
  // WINDTRE Mobile Business
  if(sub.isMobileBiz){
    const f=d.fields||{};
    if(d.mnp==null)return false;
    if(sub.bizOffers&&!_NE(f.offerta))return false;
    if(d.tnpGa==null)return false;
    if((d.tnpGa==="Sì"||d.tnpGa===true)&&!_NE(d.tnpTipo))return false;
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
  if(!hasData)return {st:"empty",label:"● Da compilare",bg:"#e9ecef",fg:"#64748b"};
  if(invalid||missing||(sub&&!subComplete(sub,d)))return {st:"warn",label:"⚠ Incompleto",bg:"rgba(245,158,11,0.14)",fg:"#f59e0b"};
  return {st:"ok",label:"✓ Completo",bg:"rgba(40,167,69,0.12)",fg:"#28a745"};
};

const SubCard = ({sub,rawSd,group,si,sessionCode,sale,uF,uC,uP,catSales,anaCel,onOpenVFModal,dupCheck}) => {
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
    vfSolDigCodIns:_r.vfSolDigCodIns||"",verisureCodIns:_r.verisureCodIns||"",kfCodIns:_r.kfCodIns||"",vcCodIns:_r.vcCodIns||"",fwOffer:_r.fwOffer||null,fwMnp:_r.fwMnp||null,fwFSecLineCount:_r.fwFSecLineCount||0,fwFSecLines:_r.fwFSecLines||[],fwMnpBrand:_r.fwMnpBrand||"",fwMnpNum:_r.fwMnpNum||"",fwCodIns:_r.fwCodIns||"",fwNumProv:_r.fwNumProv||"",fwNumDef:_r.fwNumDef||"",fwIccid:_r.fwIccid||"",fwFGnp:_r.fwFGnp||null,fwFGnpBrand:_r.fwFGnpBrand||"",fwFGnpNum:_r.fwFGnpNum||"",fwFCodIns:_r.fwFCodIns||"",fwFNumProv:_r.fwFNumProv||"",fwFNumDef:_r.fwFNumDef||"",fwPod:_r.fwPod||"",fwPdr:_r.fwPdr||"",fwEnCodIns:_r.fwEnCodIns||"",ilOffer:_r.ilOffer||null,ilMnp:_r.ilMnp||null,ilDom:_r.ilDom||null,ilMnpBrand:_r.ilMnpBrand||"",ilMnpNum:_r.ilMnpNum||"",ilCodIns:_r.ilCodIns||"",ilNumProv:_r.ilNumProv||"",ilNumDef:_r.ilNumDef||"",ilIccid:_r.ilIccid||"",ilFGnp:_r.ilFGnp||null,ilFCodIns:_r.ilFCodIns||"",ilFNumProv:_r.ilFNumProv||"",ilFNumDef:_r.ilFNumDef||"",ilFwaCodIns:_r.ilFwaCodIns||"",ilFwaIccid:_r.ilFwaIccid||"",ilBizOffer:_r.ilBizOffer||null,ilBizMnp:_r.ilBizMnp||null,ilBizMnpBrand:_r.ilBizMnpBrand||"",ilBizDom:_r.ilBizDom||null,ilBizNum:_r.ilBizNum||"",ilBizIccid:_r.ilBizIccid||"",ilBizNumDef:_r.ilBizNumDef||"",ilBizCodIns:_r.ilBizCodIns||"",enCodIns:_r.enCodIns||"",enPod:_r.enPod||"",enPdr:_r.enPdr||"",enProv:_r.enProv||"",fwEnProv:_r.fwEnProv||"",w3SostCell:_r.w3SostCell||"",w3SostIccid:_r.w3SostIccid||"",w3SostCodContr:_r.w3SostCodContr||"",w3SostCodIns:_r.w3SostCodIns||"",fwSostCell:_r.fwSostCell||"",fwSostIccid:_r.fwSostIccid||"",fwSostCodContr:_r.fwSostCodContr||"",fwSostCodIns:_r.fwSostCodIns||"",vfSostCell:_r.vfSostCell||"",vfSostCodIns:_r.vfSostCodIns||"",timOffer:_r.timOffer||null,timMnp:_r.timMnp||null,timMnpBrand:_r.timMnpBrand||"",timMnpNum:_r.timMnpNum||"",timTnp:_r.timTnp||null,timModello:_r.timModello||"",timSpedizione:_r.timSpedizione||null,timFinanziato:_r.timFinanziato||null,timCodPratica:_r.timCodPratica||"",timVisionBox:_r.timVisionBox||null,timVisionTaglia:_r.timVisionTaglia||null,timVisionNumContr:_r.timVisionNumContr||"",timImei:_r.timImei||"",timNumProv:_r.timNumProv||"",timNum:_r.timNum||"",timIccid:_r.timIccid||"",timCodIns:_r.timCodIns||"",timFOffer:_r.timFOffer||null,timFGnp:_r.timFGnp||null,timFGnpBrand:_r.timFGnpBrand||"",timFGnpNum:_r.timFGnpNum||"",timFNumProv:_r.timFNumProv||"",timFCodIns:_r.timFCodIns||"",timFVision:_r.timFVision||null,timFVisionTaglia:_r.timFVisionTaglia||null,timFVisionNumContr:_r.timFVisionNumContr||"",timTpTwin:_r.timTpTwin||null,timTpSeriale:_r.timTpSeriale||"",timTpRecapito:_r.timTpRecapito||"",timTpCodIns:_r.timTpCodIns||"",veryOffer:_r.veryOffer||null,veryMnp:_r.veryMnp||null,veryMnpBrand:_r.veryMnpBrand||"",veryMnpNum:_r.veryMnpNum||"",veryRicaricaAuto:_r.veryRicaricaAuto||null,veryFascia:_r.veryFascia||null,veryCodIns:_r.veryCodIns||"",veryNumProv:_r.veryNumProv||"",veryNum:_r.veryNum||"",veryIccid:_r.veryIccid||"",hoOffer:_r.hoOffer||null,hoMnp:_r.hoMnp||null,hoMnpBrand:_r.hoMnpBrand||"",hoMnpNum:_r.hoMnpNum||"",hoRicaricaAuto:_r.hoRicaricaAuto||null,hoFascia:_r.hoFascia||null,hoCodIns:_r.hoCodIns||"",hoNumProv:_r.hoNumProv||"",hoNum:_r.hoNum||"",hoIccid:_r.hoIccid||""};
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
    <div style={{marginBottom:10,padding:10,background:"rgba(255,255,255,0.02)",borderRadius:8,border:"1px solid "+group.color+"30"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <div style={{fontSize:11,fontWeight:700,color:group.color}}>{sub.title}</div>
        {_bd&&<span style={{fontSize:10,fontWeight:800,padding:"2px 9px",borderRadius:999,background:_bd.bg,color:_bd.fg,whiteSpace:"nowrap"}}>{_bd.label}</span>}
      </div>

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
            <div style={{marginTop:8,padding:8,background:"rgba(255,255,255,0.03)",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:6}}>Security</div>
              <div style={{display:"flex",gap:6}}>
                {["Security","Security PRO"].map(s=>
                  <button key={s} onClick={()=>uP(group.id,si,sub.id,"securitySel",sd.securitySel[s]?{}:{[s]:true})} style={{padding:"5px 14px",borderRadius:6,border:sd.securitySel[s]?"2px solid #fd7e14":"2px solid rgba(255,255,255,0.1)",background:sd.securitySel[s]?"rgba(245,158,11,0.14)":"rgba(255,255,255,0.04)",color:sd.securitySel[s]?"#e8590c":"#8892b0",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
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
                <div style={{padding:10,background:"rgba(0,114,198,0.10)",borderRadius:8,border:"1px solid rgba(0,114,198,0.18)",marginTop:4}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#2E75B6",marginBottom:8,textTransform:"uppercase"}}>Dati TNP GA</div>
                  <div style={{display:"flex",gap:6,marginBottom:sd.tnpTipo?8:0}}>
                    {["Rata 5G","Finanziamento > 600€","Finanziamento < 600€"].map(opt=>
                      <button key={opt} onClick={()=>uP(group.id,si,sub.id,"tnpTipo",opt)} style={{padding:"6px 14px",borderRadius:6,border:sd.tnpTipo===opt?"2px solid #2E75B6":"2px solid rgba(255,255,255,0.1)",background:sd.tnpTipo===opt?"#2E75B6":"rgba(255,255,255,0.04)",color:sd.tnpTipo===opt?"#fff":"#8892b0",fontSize:11,fontWeight:700,cursor:"pointer"}}>{opt}</button>
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
                          <button key={n} onClick={()=>uP(group.id,si,sub.id,"tnpCount",sd.tnpCount===n?null:n)} style={{width:40,height:40,borderRadius:8,border:sd.tnpCount===n?"2px solid #2E75B6":"2px solid rgba(255,255,255,0.1)",background:sd.tnpCount===n?"#2E75B6":"rgba(255,255,255,0.04)",color:sd.tnpCount===n?"#fff":"#8892b0",fontSize:14,fontWeight:700,cursor:"pointer"}}>{n}</button>
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
                                <input type="number" min={29} max={240} value={sd.packAccessoriVal||""} onChange={e=>uP(group.id,si,sub.id,"packAccessoriVal",e.target.value===""?"":parseInt(e.target.value))} onBlur={e=>{const raw=parseInt(e.target.value);if(!isNaN(raw))uP(group.id,si,sub.id,"packAccessoriVal",Math.min(240,Math.max(29,raw)));else uP(group.id,si,sub.id,"packAccessoriVal",29)}} style={{width:72,padding:"5px 8px",borderRadius:6,border:"1px solid rgba(0,114,198,0.18)",fontSize:12,fontWeight:600,textAlign:"center"}} placeholder="29-240"/>
                                <span style={{fontSize:11,color:"#64748b"}}>€</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#64748b",marginTop:2}}><span>€29</span><span>€240</span></div>
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
                            <button key={rl} onClick={()=>uP(group.id,si,sub.id,"tnpGaReloadSel",sd.tnpGaReloadSel[rl]?{}:{[rl]:true})} style={{padding:"5px 12px",borderRadius:6,border:sd.tnpGaReloadSel[rl]?"2px solid #28a745":"2px solid rgba(255,255,255,0.1)",background:sd.tnpGaReloadSel[rl]?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)",color:sd.tnpGaReloadSel[rl]?"#28a745":"#8892b0",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
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
                <div style={{marginTop:8,padding:8,background:"rgba(255,255,255,0.03)",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:6}}>Security</div>
                  <div style={{display:"flex",gap:6}}>
                    {["Security","Security PRO"].map(s=>
                      <button key={s} onClick={()=>uP(group.id,si,sub.id,"securitySel",sd.securitySel[s]?{}:{[s]:true})} style={{padding:"5px 14px",borderRadius:6,border:sd.securitySel[s]?"2px solid #fd7e14":"2px solid rgba(255,255,255,0.1)",background:sd.securitySel[s]?"rgba(245,158,11,0.14)":"rgba(255,255,255,0.04)",color:sd.securitySel[s]?"#e8590c":"#8892b0",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
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
              <div style={{marginTop:8,padding:8,background:"rgba(255,255,255,0.03)",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:6}}>Security</div>
                <div style={{display:"flex",gap:6}}>
                  {["Security","Security PRO"].map(s=>
                    <button key={s} onClick={()=>uP(group.id,si,sub.id,"securitySel",sd.securitySel[s]?{}:{[s]:true})} style={{padding:"5px 14px",borderRadius:6,border:sd.securitySel[s]?"2px solid #fd7e14":"2px solid rgba(255,255,255,0.1)",background:sd.securitySel[s]?"rgba(245,158,11,0.14)":"rgba(255,255,255,0.04)",color:sd.securitySel[s]?"#e8590c":"#8892b0",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
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
                  <div style={{padding:10,background:"rgba(0,114,198,0.10)",borderRadius:8,border:"1px solid rgba(0,114,198,0.18)",marginBottom:8}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#2E75B6",marginBottom:8,textTransform:"uppercase"}}>Tipologia TNP GA</div>
                    <div style={{display:"flex",gap:6}}>
                      {["Rata P.IVA","Rata P.IVA 5G"].map(opt=>
                        <button key={opt} onClick={()=>uP(group.id,si,sub.id,"tnpTipo",sd.tnpTipo===opt?"":opt)} style={{padding:"6px 14px",borderRadius:6,border:sd.tnpTipo===opt?"2px solid #2E75B6":"2px solid rgba(255,255,255,0.1)",background:sd.tnpTipo===opt?"#2E75B6":"rgba(255,255,255,0.04)",color:sd.tnpTipo===opt?"#fff":"#8892b0",fontSize:11,fontWeight:700,cursor:"pointer"}}>{opt}</button>
                      )}
                    </div>
                  </div>
                  <div style={{padding:8,background:"rgba(255,255,255,0.03)",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:6}}>Security / Reload</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <button onClick={()=>uP(group.id,si,sub.id,"securitySel",sd.securitySel["Security"]?{}:{"Security":true})} style={{padding:"5px 14px",borderRadius:6,border:sd.securitySel["Security"]?"2px solid #fd7e14":"2px solid rgba(255,255,255,0.1)",background:sd.securitySel["Security"]?"rgba(245,158,11,0.14)":"rgba(255,255,255,0.04)",color:sd.securitySel["Security"]?"#e8590c":"#8892b0",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                        <span>{sd.securitySel["Security"]?"☑":"☐"}</span>Security
                      </button>
                      {["Reload","Reload EU"].map(rl=>
                        <button key={rl} onClick={()=>uP(group.id,si,sub.id,"tnpGaReloadSel",sd.tnpGaReloadSel[rl]?{}:{[rl]:true})} style={{padding:"5px 14px",borderRadius:6,border:sd.tnpGaReloadSel[rl]?"2px solid #28a745":"2px solid rgba(255,255,255,0.1)",background:sd.tnpGaReloadSel[rl]?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)",color:sd.tnpGaReloadSel[rl]?"#28a745":"#8892b0",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                          <span>{sd.tnpGaReloadSel[rl]?"◉":"○"}</span>{rl}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {(sd.tnpGa==="No"||sd.tnpGa===false)&&(
                <div style={{marginTop:8,padding:8,background:"rgba(255,255,255,0.03)",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:6}}>Security / Reload</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <button onClick={()=>uP(group.id,si,sub.id,"securitySel",sd.securitySel["Security"]?{}:{"Security":true})} style={{padding:"5px 14px",borderRadius:6,border:sd.securitySel["Security"]?"2px solid #fd7e14":"2px solid rgba(255,255,255,0.1)",background:sd.securitySel["Security"]?"rgba(245,158,11,0.14)":"rgba(255,255,255,0.04)",color:sd.securitySel["Security"]?"#e8590c":"#8892b0",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                      <span>{sd.securitySel["Security"]?"◉":"○"}</span>Security
                    </button>
                    <button onClick={()=>uP(group.id,si,sub.id,"tnpGaReloadSel",sd.tnpGaReloadSel["Reload Open"]?{}:{"Reload Open":true})} style={{padding:"5px 14px",borderRadius:6,border:sd.tnpGaReloadSel["Reload Open"]?"2px solid #28a745":"2px solid rgba(255,255,255,0.1)",background:sd.tnpGaReloadSel["Reload Open"]?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)",color:sd.tnpGaReloadSel["Reload Open"]?"#28a745":"#8892b0",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
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
                <span style={{fontSize:13,fontWeight:700,color:"#6f42c1"}}>Protecta PRO attivato</span>
              </div>
              <div style={{maxWidth:260}}><SCd session={sessionCode} codici={codiciW3} val={sd.protectaCodIns||""} onCh={v=>uP(group.id,si,sub.id,"protectaCodIns",v)}/></div>
            </div>
          : <div style={{display:"flex",gap:8}}>
              {["Kit Base","Kit Plus"].map(k=>
                <button key={k} onClick={()=>uF(group.id,si,sub.id,"protectaKit",f.protectaKit===k?"":k)} style={{padding:"8px 18px",borderRadius:8,border:f.protectaKit===k?"2px solid #6f42c1":"2px solid rgba(255,255,255,0.1)",background:f.protectaKit===k?"#6f42c1":"rgba(255,255,255,0.04)",color:f.protectaKit===k?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>{k}</button>
              )}
            </div>
      )}

      {/* Verisure */}
      {sub.isVerisure&&(
        <div style={{padding:"12px 16px",borderRadius:8,background:"rgba(111,66,193,0.12)",border:"2px solid #6f42c1"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <span style={{fontSize:20}}>🛡️</span>
            <span style={{fontSize:13,fontWeight:700,color:"#6f42c1"}}>Verisure</span>
            <span style={{marginLeft:"auto",fontSize:12,fontWeight:800,color:"#6f42c1",background:"rgba(111,66,193,0.18)",borderRadius:6,padding:"3px 12px"}}>✅ CONTATTO INSERITO - In attesa di approvazione</span>
          </div>
          <SCd session={sessionCode} codici={VF_CODICI_NEGOZIO} val={sd.verisureCodIns||""} onCh={v=>uP(group.id,si,sub.id,"verisureCodIns",v)}/>
        </div>
      )}

      {/* VF Fisso — Convergenza / GNP / Lock In */}
      {sub.isVFFisso&&<VFMobileGAFisso sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} sc={sessionCode}/>}
      {sub.isVFFissoBiz&&<VFBizFisso sd={sd} uP={(k,v)=>uP(group.id,si,sub.id,k,v)} isCombo={!!sub.isCombinatoFissoBiz} sc={sessionCode}/>}
      {sub.isVFSolDig&&(
        <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto</div>
          <SCd session={sessionCode} codici={VF_CODICI_NEGOZIO} val={sd.vfSolDigCodIns||""} onCh={v=>uP(group.id,si,sub.id,"vfSolDigCodIns",v)}/>
        </div>
      )}

      {/* Kasko Facile */}
      {sub.isKaskoFacile&&(
        <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto — Kasko Facile</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 14px"}}>
            <TF l="IMEI" r v={f.kfImei||""} o={v=>uF(group.id,si,sub.id,"kfImei",v)} p="15 cifre" nt="Barcode 📷"/>
            <TF l="Numero di telefono" r v={f.kfTelefono||""} o={v=>uF(group.id,si,sub.id,"kfTelefono",v)} p="3XXXXXXXXX"/>
            <TF l="Seriale Kasko" r v={f.kfSeriale||""} o={v=>uF(group.id,si,sub.id,"kfSeriale",v)} p="es. KF-000123"/>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Tipologia Kasko <span style={{color:"#dc3545"}}>*</span></div>
              <select value={f.kfTipologia||""} onChange={e=>uF(group.id,si,sub.id,"kfTipologia",e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,boxSizing:"border-box",background:"rgba(255,255,255,0.02)"}}>
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
        <div style={{background:"rgba(0,114,198,0.10)",border:"1px solid rgba(0,114,198,0.18)",borderRadius:8,padding:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#0066cc",marginBottom:10,textTransform:"uppercase"}}>📋 Dati Contratto — Vodafone Care</div>
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
            <button key={opt} onClick={()=>uF(group.id,si,sub.id,"assicBizSel",f.assicBizSel===opt?"":opt)} style={{padding:"8px 16px",borderRadius:8,border:f.assicBizSel===opt?"2px solid #6f42c1":"2px solid rgba(255,255,255,0.1)",background:f.assicBizSel===opt?"#6f42c1":"rgba(255,255,255,0.04)",color:f.assicBizSel===opt?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:14}}>{f.assicBizSel===opt?"◉":"○"}</span>{opt}
            </button>
          )}
        </div>
      )}


      {sub.isCB&&(
        <div>
          {/* Three toggleable sub-options */}
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <button onClick={()=>{const on=!sd.cbTnp;uP(group.id,si,sub.id,"cbTnp",on);if(on){if(!sd.cbTnpCell){const pre=sd.cbCambioCell||anaCel||"";if(pre)uP(group.id,si,sub.id,"cbTnpCell",pre)};if(!sd.cbTnpCC){const pre=sd.cbCambioCC||(c.codice_contratto||"");if(pre)uP(group.id,si,sub.id,"cbTnpCC",pre)}}}} style={{padding:"8px 16px",borderRadius:8,border:sd.cbTnp?"2px solid #2E75B6":"2px solid rgba(255,255,255,0.1)",background:sd.cbTnp?"#2E75B6":"rgba(255,255,255,0.04)",color:sd.cbTnp?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>TNP CB</button>
            <button onClick={()=>{const on=!sd.cbCambio;uP(group.id,si,sub.id,"cbCambio",on);if(on){if(!sd.cbCambioCell){const pre=sd.cbTnpCell||anaCel||"";if(pre)uP(group.id,si,sub.id,"cbCambioCell",pre)};if(!sd.cbCambioCC){const pre=sd.cbTnpCC||(c.codice_contratto||"");if(pre)uP(group.id,si,sub.id,"cbCambioCC",pre)}}}} style={{padding:"8px 16px",borderRadius:8,border:sd.cbCambio?"2px solid #6f42c1":"2px solid rgba(255,255,255,0.1)",background:sd.cbCambio?"#6f42c1":"rgba(255,255,255,0.04)",color:sd.cbCambio?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>Cambio Offerta</button>
            {!sub.isCBBiz&&<button onClick={()=>uP(group.id,si,sub.id,"cbRf",!sd.cbRf)} style={{padding:"8px 16px",borderRadius:8,border:sd.cbRf?"2px solid #28a745":"2px solid rgba(255,255,255,0.1)",background:sd.cbRf?"#28a745":"rgba(255,255,255,0.04)",color:sd.cbRf?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>Reload Forever</button>}
            {sub.cbAddonVals&&<button onClick={()=>uP(group.id,si,sub.id,"cbAddon",!sd.cbAddon)} style={{padding:"8px 16px",borderRadius:8,border:sd.cbAddon?"2px solid #17a589":"2px solid rgba(255,255,255,0.1)",background:sd.cbAddon?"#17a589":"rgba(255,255,255,0.04)",color:sd.cbAddon?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>{sub.isCBBiz?"Add-on / Security":"Add-on"}</button>}
          </div>

          {/* TNP CB section */}
          {sd.cbTnp&&(
            <div style={{padding:10,background:"rgba(0,114,198,0.10)",borderRadius:8,border:"1px solid rgba(0,114,198,0.18)",marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:"#2E75B6",marginBottom:8,textTransform:"uppercase"}}>Dati TNP CB</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px 14px",marginBottom:8}}>
                <SCd session={sessionCode} codici={codiciW3} val={sd.cbTnpCodIns||""} onCh={v=>uP(group.id,si,sub.id,"cbTnpCodIns",v)}/>
                <TF l="Cellulare" r v={sd.cbTnpCell||""} o={v=>{uP(group.id,si,sub.id,"cbTnpCell",v);if(sd.cbCambio)uP(group.id,si,sub.id,"cbCambioCell",v)}} p="3XXXXXXXXX" nt={sd.cbTnpCell===anaCel&&anaCel?"Da anagrafica":""}/>
                <TF l="Codice Contratto" r v={sd.cbTnpCC||""} o={v=>{uP(group.id,si,sub.id,"cbTnpCC",v);if(sd.cbCambio)uP(group.id,si,sub.id,"cbCambioCC",v)}} p="es. 167942" err={dupCheck&&dupCheck("CODCONTR",sd.cbTnpCC)?"Codice contratto già usato in un altro prodotto":""}/>
              </div>
              {sub.isCBBiz&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px",marginBottom:8}}>
                  <DD l="Modello Terminale" r v={sd.cbTnpModello||""} o={v=>uP(group.id,si,sub.id,"cbTnpModello",v)} vals={SMARTPHONES}/>
                  <TF l="IMEI" r v={sd.cbTnpImei||""} o={v=>uP(group.id,si,sub.id,"cbTnpImei",v)} p="15 cifre" nt="Barcode 📷"/>
                </div>
              )}
              <div style={{display:"flex",gap:6,marginBottom:sd.cbTnpTipo?8:0}}>
                {!sub.isCBBiz&&sub.cbTnpVals.map(opt=>
                  <button key={opt} onClick={()=>uP(group.id,si,sub.id,"cbTnpTipo",opt)} style={{padding:"6px 14px",borderRadius:6,border:sd.cbTnpTipo===opt?"2px solid #2E75B6":"2px solid rgba(255,255,255,0.1)",background:sd.cbTnpTipo===opt?"#2E75B6":"rgba(255,255,255,0.04)",color:sd.cbTnpTipo===opt?"#fff":"#8892b0",fontSize:11,fontWeight:700,cursor:"pointer"}}>{opt}</button>
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
                          <button key={n} onClick={()=>uP(group.id,si,sub.id,"cbTnpCount",sd.cbTnpCount===n?null:n)} style={{width:40,height:40,borderRadius:8,border:sd.cbTnpCount===n?"2px solid #2E75B6":"2px solid rgba(255,255,255,0.1)",background:sd.cbTnpCount===n?"#2E75B6":"rgba(255,255,255,0.04)",color:sd.cbTnpCount===n?"#fff":"#8892b0",fontSize:14,fontWeight:700,cursor:"pointer"}}>{n}</button>
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
                                <input type="number" min={29} max={240} value={sd.cbPackAccessoriVal||""} onChange={e=>uP(group.id,si,sub.id,"cbPackAccessoriVal",e.target.value===""?"":parseInt(e.target.value))} onBlur={e=>{const raw=parseInt(e.target.value);if(!isNaN(raw))uP(group.id,si,sub.id,"cbPackAccessoriVal",Math.min(240,Math.max(29,raw)));else uP(group.id,si,sub.id,"cbPackAccessoriVal",29)}} style={{width:72,padding:"5px 8px",borderRadius:6,border:"1px solid rgba(0,114,198,0.18)",fontSize:12,fontWeight:600,textAlign:"center"}} placeholder="29-240"/>
                                <span style={{fontSize:11,color:"#64748b"}}>€</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#64748b",marginTop:2}}><span>€29</span><span>€240</span></div>
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
                      <button key={rl} onClick={()=>uP(group.id,si,sub.id,"cbTnpReloadSel",sd.cbTnpReloadSel[rl]?{}:{[rl]:true})} style={{padding:"5px 12px",borderRadius:6,border:sd.cbTnpReloadSel[rl]?"2px solid #28a745":"2px solid rgba(255,255,255,0.1)",background:sd.cbTnpReloadSel[rl]?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)",color:sd.cbTnpReloadSel[rl]?"#28a745":"#8892b0",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
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
              <div style={{fontSize:10,fontWeight:700,color:"#6f42c1",marginBottom:8,textTransform:"uppercase"}}>Cambio Offerta</div>
              <div style={{marginBottom:8,maxWidth:250}}>
                <SCd session={sessionCode} codici={codiciW3} val={sd.cbCambioCodIns||""} onCh={v=>uP(group.id,si,sub.id,"cbCambioCodIns",v)}/>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                {sub.cbCambioVals.map(opt=>
                  <button key={opt} onClick={()=>uP(group.id,si,sub.id,"cbCambioVal",sd.cbCambioVal===opt?"":opt)} style={{padding:"6px 14px",borderRadius:6,border:sd.cbCambioVal===opt?"2px solid #6f42c1":"2px solid rgba(255,255,255,0.1)",background:sd.cbCambioVal===opt?"#6f42c1":"rgba(255,255,255,0.04)",color:sd.cbCambioVal===opt?"#fff":"#8892b0",fontSize:11,fontWeight:700,cursor:"pointer"}}>{opt}</button>
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
              <div style={{fontSize:10,fontWeight:700,color:"#28a745",marginBottom:8,textTransform:"uppercase"}}>{sub.isCBBiz?"Add-on / Security":"Add-on"}</div>
              <div style={{marginBottom:8,maxWidth:250}}>
                <SCd session={sessionCode} codici={codiciW3} val={sd.cbAddonCodIns||(sd.cbTnpCodIns||sd.cbCambioCodIns||"")} onCh={v=>uP(group.id,si,sub.id,"cbAddonCodIns",v)}/>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {sub.cbAddonVals.map(opt=>
                  <button key={opt} onClick={()=>{const cur=sd.cbAddonSel[opt];uP(group.id,si,sub.id,"cbAddonSel",{...sd.cbAddonSel,[opt]:!cur});if(!cur&&opt==="Security"&&!sd.cbAddonSecCell&&anaCel)uP(group.id,si,sub.id,"cbAddonSecCell",anaCel)}} style={{padding:"6px 14px",borderRadius:6,border:sd.cbAddonSel[opt]?"2px solid #28a745":"2px solid rgba(255,255,255,0.1)",background:sd.cbAddonSel[opt]?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)",color:sd.cbAddonSel[opt]?"#28a745":"#8892b0",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                    <span>{sd.cbAddonSel[opt]?"☑":"☐"}</span>{opt}
                  </button>
                )}
                {sub.isCBBiz&&(!sd.cbTnp||(sd.cbTnp&&sd.cbCambio&&(sd.cbTnpReload===false||sd.cbTnpReload===null)))&&(
                  <button onClick={()=>{const cur=sd.cbAddonSel["Reload Open"];uP(group.id,si,sub.id,"cbAddonSel",{...sd.cbAddonSel,"Reload Open":!cur});if(!cur&&!sd.cbAddonRoCell&&anaCel)uP(group.id,si,sub.id,"cbAddonRoCell",anaCel)}} style={{padding:"6px 14px",borderRadius:6,border:sd.cbAddonSel["Reload Open"]?"2px solid #28a745":"2px solid rgba(255,255,255,0.1)",background:sd.cbAddonSel["Reload Open"]?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)",color:sd.cbAddonSel["Reload Open"]?"#28a745":"#8892b0",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
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
            <div style={{padding:10,background:"rgba(0,114,198,0.10)",borderRadius:8,border:"1px solid rgba(0,114,198,0.18)",marginBottom:8}}>
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
          <div style={{flex:1,minWidth:140}}><div style={{fontSize:12,fontWeight:700,color:(isVCMode||bizDomLocked)?"#64748b":"#f8fafc",marginBottom:6}}>Domiciliato?</div><div style={{display:"flex",gap:8}}>
            {(isVCMode||bizDomLocked)?(
              <div style={{display:"flex",alignItems:"center",gap:6}}><button disabled style={{padding:"6px 20px",borderRadius:6,border:"2px solid #28a745",background:"rgba(40,167,69,0.12)",color:"#28a745",fontSize:12,fontWeight:700,cursor:"not-allowed"}}>Sì</button><span style={{fontSize:10,color:"#64748b",fontStyle:"italic"}}>{isVCMode||sub.domLocked?"Obbligatorio":"Business"}</span></div>
            ):(<>
              <button onClick={()=>uP(group.id,si,sub.id,"domiciliato",true)} style={{padding:"6px 20px",borderRadius:6,border:sd.domiciliato===true?"2px solid #28a745":"2px solid rgba(255,255,255,0.1)",background:sd.domiciliato===true?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)",color:sd.domiciliato===true?"#28a745":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>Sì</button>
              <button onClick={()=>uP(group.id,si,sub.id,"domiciliato",false)} style={{padding:"6px 20px",borderRadius:6,border:sd.domiciliato===false?"2px solid #dc3545":"2px solid rgba(255,255,255,0.1)",background:sd.domiciliato===false?"rgba(220,53,69,0.12)":"rgba(255,255,255,0.04)",color:sd.domiciliato===false?"#f87171":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>No</button>
            </>)}
          </div></div>
          <div style={{flex:1,minWidth:140}}><div style={{fontSize:12,fontWeight:700,color:"#f8fafc",marginBottom:6}}>Convergente?</div><div style={{display:"flex",gap:8}}>
            <button onClick={()=>uP(group.id,si,sub.id,"convergente",true)} style={{padding:"6px 20px",borderRadius:6,border:sd.convergente===true?"2px solid #28a745":"2px solid rgba(255,255,255,0.1)",background:sd.convergente===true?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)",color:sd.convergente===true?"#28a745":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>Sì</button>
            <button onClick={()=>uP(group.id,si,sub.id,"convergente",false)} style={{padding:"6px 20px",borderRadius:6,border:sd.convergente===false?"2px solid #dc3545":"2px solid rgba(255,255,255,0.1)",background:sd.convergente===false?"rgba(220,53,69,0.12)":"rgba(255,255,255,0.04)",color:sd.convergente===false?"#f87171":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>No</button>
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
        <div style={{padding:10,background:"rgba(0,114,198,0.10)",borderRadius:8,border:"1px solid rgba(0,114,198,0.18)",marginTop:4}}>
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
        <div style={{marginTop:10,padding:10,background:"rgba(255,255,255,0.03)",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#f8fafc",marginBottom:8}}>{sub.isFisso?"Add-on Fisso":"Seleziona prodotti"}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {sub.addonList.map(ad=>
              <button key={ad} onClick={()=>toggleAddon(ad)} style={{padding:"6px 14px",borderRadius:6,border:sd.addons[ad]?"2px solid #28a745":"2px solid rgba(255,255,255,0.1)",background:sd.addons[ad]?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)",color:sd.addons[ad]?"#28a745":"#8892b0",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:14}}>{sd.addons[ad]?"☑":"☐"}</span>{ad}
              </button>
            )}
          </div>
        </div>
      )}

      {sub.hasDom&&<YN val={sd.domiciliazione} onCh={v=>uP(group.id,si,sub.id,"domiciliazione",v)} label="Domiciliazione bancaria?"/>}

      {/* LG Convergente */}
      {sub.hasConvLG&&(
        <div style={{marginTop:8,padding:10,background:"rgba(255,255,255,0.03)",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)"}}>
          <div style={{fontSize:12,fontWeight:700,color:lgConvLocked?"#64748b":"#f8fafc",marginBottom:6}}>Convergente?</div>
          {lgConvLocked?<div style={{display:"flex",alignItems:"center",gap:8}}><button disabled style={{padding:"6px 20px",borderRadius:6,border:"2px solid #dc3545",background:"rgba(220,53,69,0.12)",color:"#f87171",fontSize:12,fontWeight:700,cursor:"not-allowed",opacity:.7}}>No</button><span style={{fontSize:10,color:"#64748b",fontStyle:"italic"}}>Già selezionato altrove</span></div>
          :<div style={{display:"flex",gap:8}}>
            <button onClick={()=>uP(group.id,si,sub.id,"convergente",true)} style={{padding:"6px 20px",borderRadius:6,border:sd.convergente===true?"2px solid #28a745":"2px solid rgba(255,255,255,0.1)",background:sd.convergente===true?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)",color:sd.convergente===true?"#28a745":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>Sì</button>
            <button onClick={()=>uP(group.id,si,sub.id,"convergente",false)} style={{padding:"6px 20px",borderRadius:6,border:sd.convergente===false?"2px solid #dc3545":"2px solid rgba(255,255,255,0.1)",background:sd.convergente===false?"rgba(220,53,69,0.12)":"rgba(255,255,255,0.04)",color:sd.convergente===false?"#f87171":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>No</button>
          </div>}
        </div>
      )}

      {/* Contract data */}
      {sub.hasContract&&!sub.isVFMobile&&!sub.isCBVF&&!sub.isVFFisso&&!sub.isVerisure&&!sub.isKaskoFacile&&!sub.isVFCare&&!sub.isVFBizMobile&&!sub.isCBVFBiz&&!sub.isVFFissoBiz&&!sub.isVFSolDig&&!sub.isFWMobile&&!sub.isFWFisso&&!sub.isFWEnergia&&!sub.isILMobile&&!sub.isILBizMobile&&!sub.isILFisso&&!sub.isILFwa&&!sub.isENLuceGas&&!sub.isTimMobile&&!sub.isTimFisso&&!sub.isTimTelepass&&!sub.isVeryMobile&&!sub.isHoMobile&&!sub.isW3SostSim&&!sub.isVFSostSim&&!sub.isFWSostSim&&!sub.isBizProtecta&&(
        <div style={{borderTop:"1px solid "+group.color+"20",paddingTop:8,marginTop:8}}>
          <div style={{fontSize:10,fontWeight:600,color:"#64748b",marginBottom:6,textTransform:"uppercase"}}>Dati contratto</div>
          <div style={{marginBottom:8,maxWidth:250}}><SCd session={sessionCode} codici={codiciW3} val={sd.codiceOverride||""} onCh={v=>uP(group.id,si,sub.id,"codiceOverride",v)}/></div>
          {sub.ct==="ga"&&<div style={{display:"grid",gridTemplateColumns:showMnpF&&!sub.isMobileBiz?"1fr 1fr 1fr":"1fr 1fr",gap:"8px 14px"}}>
            <TF l="Codice Contratto" r v={c.codice_contratto||""} o={v=>uC(group.id,si,sub.id,"codice_contratto",v)} p="es. 167942" err={dupCheck&&dupCheck("CODCONTR",c.codice_contratto)?"Codice contratto già usato in un altro prodotto":""}/>
            <TF l="Numero Provvisorio" r v={c.num_provvisorio||""} o={v=>uC(group.id,si,sub.id,"num_provvisorio",v)} p="393XXX"/>
            {showMnpF&&!sub.isMobileBiz&&<TF l="N. Definitivo MNP" r v={c.num_definitivo||""} o={v=>uC(group.id,si,sub.id,"num_definitivo",v)} p="Portare"/>}
            {showMnpF&&!sub.isMobileBiz&&<DD l="Brand MNP" r v={c.brand_mnp||""} o={v=>uC(group.id,si,sub.id,"brand_mnp",v)} vals={brandMNP}/>}
            {showMnpF&&sub.isMobileBiz&&<TF l="N. Definitivo MNP" r v={c.num_definitivo||""} o={v=>uC(group.id,si,sub.id,"num_definitivo",v)} p="Portare"/>}
            <TF l="ICCID" r v={c.iccid||""} o={v=>uC(group.id,si,sub.id,"iccid",v)} p="893..." nt="Barcode 📷"/>
            {sub.isMobileBiz&&(sd.tnpGa==="Sì"||sd.tnpGa===true)&&sd.tnpTipo&&<DD l="Modello Terminale" r v={c.modello||""} o={v=>uC(group.id,si,sub.id,"modello",v)} vals={SMARTPHONES}/>}
            {sub.isMobileBiz&&(sd.tnpGa==="Sì"||sd.tnpGa===true)&&sd.tnpTipo&&<TF l="IMEI" r v={c.imei||""} o={v=>uC(group.id,si,sub.id,"imei",v)} p="15 cifre" nt="Barcode 📷"/>}
          </div>}
          {sub.ct==="tnp_ga"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px 14px"}}>
            <TF l="Codice Contratto" r v={gaOn?(gaC.codice_contratto||""):(c.codice_contratto||"")} o={v=>uC(group.id,si,sub.id,"codice_contratto",v)} p={gaOn?"← da Mobile GA":"es. 167942"} dis={gaOn} nt={gaOn?"Auto da Mobile GA":""} err={dupCheck&&dupCheck("CODCONTR",gaOn?gaC.codice_contratto:c.codice_contratto)?"Codice contratto già usato in un altro prodotto":""}/>
            <TF l="Modello Terminale" v={c.modello||""} o={v=>uC(group.id,si,sub.id,"modello",v)} p="Samsung S25"/>
            <TF l="IMEI" v={c.imei||""} o={v=>uC(group.id,si,sub.id,"imei",v)} p="15 cifre" nt="Barcode 📷"/>
          </div>}
          {sub.ct==="tnp_cb"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px 14px"}}>
            <TF l="Codice Contratto" r v={c.codice_contratto||""} o={v=>uC(group.id,si,sub.id,"codice_contratto",v)} p="es. 167942" err={dupCheck&&dupCheck("CODCONTR",c.codice_contratto)?"Codice contratto già usato in un altro prodotto":""}/>
            <TF l="Modello Terminale" v={c.modello||""} o={v=>uC(group.id,si,sub.id,"modello",v)} p="iPhone 16"/>
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
const NoteStep = ({store,show,setShow,nota,setNota,pData,setPData,pOra,setPOra,pNeg,setPNeg,pDesc,setPDesc}) => {
  const negozioPro=pNeg, setNegozioPro=setPNeg;
  useEffect(()=>{if(store)setNegozioPro(p=>p||store);},[store]);
  const content = (
    <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:16,marginBottom:10,borderLeft:"4px solid #e83e8c"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#e83e8c",marginBottom:14,textTransform:"uppercase"}}>📝 Step 7 — Note / Promemoria</div>
      <div style={{textAlign:"center",marginBottom:show?16:0}}>
        <div style={{fontSize:13,fontWeight:600,color:"#f8fafc",marginBottom:10}}>Nota o promemoria?</div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={()=>setShow(true)} style={{padding:"8px 28px",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",border:show?"2px solid #28a745":"2px solid rgba(255,255,255,0.1)",background:show?"rgba(40,167,69,0.12)":"rgba(255,255,255,0.04)",color:show?"#28a745":"#8892b0"}}>Sì</button>
          <button onClick={()=>setShow(false)} style={{padding:"8px 28px",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",border:!show?"2px solid #dc3545":"2px solid rgba(255,255,255,0.1)",background:!show?"rgba(220,53,69,0.12)":"rgba(255,255,255,0.04)",color:!show?"#f87171":"#8892b0"}}>No</button>
        </div>
      </div>
      {show&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={{border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:14,background:"rgba(255,255,255,0.03)"}}><div style={{fontSize:13,fontWeight:700,marginBottom:8}}>📋 Nota</div><textarea placeholder="Nota…" rows={3} value={nota} onChange={e=>setNota(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/></div>
        <div style={{border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:14,background:"rgba(255,255,255,0.03)"}}><div style={{fontSize:13,fontWeight:700,marginBottom:8}}>📅 Promemoria</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><div><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Data</div><input type="date" value={pData} onChange={e=>setPData(e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,boxSizing:"border-box"}}/></div><div><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Ora</div><input type="time" value={pOra} onChange={e=>setPOra(e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,boxSizing:"border-box"}}/></div></div>
          {/* Negozio: si auto-compila dal login ma resta modificabile a mano. */}
          <div style={{marginTop:8}}><DD l="Negozio" v={negozioPro} o={v=>setNegozioPro(v)} vals={negozi} nt="Dal login — modificabile"/></div>
          <div style={{marginTop:8}}><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Descrizione</div><textarea placeholder="Dettagli…" rows={2} value={pDesc} onChange={e=>setPDesc(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/></div>
        </div>
      </div>}
    </div>
  );
  return content;
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

export default function CRM() {
  // Sottoscrizione alle liste caricate dal DB: senza queste, `venditori` e
  // `negozi` si riempiono dopo il primo render e il menu a tendina resta vuoto
  // finche' qualcos'altro non provoca un aggiornamento. useNegozi() esisteva
  // gia' ma non era mai stata chiamata da nessuno.
  useVenditori();
  useNegozi();
  const [brand,setBrand]=useState(null);
  const [showMargPOS,setShowMargPOS]=useState(false);
  const [margEditItem,setMargEditItem]=useState(null);
  const [showMargList,setShowMargList]=useState(false);
  const [showMargSection,setShowMargSection]=useState(false);
  const [showMargSave,setShowMargSave]=useState(false);
  const [margSaveForm,setMargSaveForm]=useState({nome:"",cognome:"",tel:"",anonimo:false});
  const [margItems,setMargItems]=useState([]);
  // Step 7 — nota e promemoria (segnalazione 21)
  const [notaOn,setNotaOn]=useState(false);
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
  const addFiles = (fileList, type) => {
    const nf = Array.from(fileList || []).map(file => ({ file, name: file.name, type }));
    if (nf.length) setAttachments(prev => [...prev, ...nf]);
    return nf.length;
  };
  const handleFileChange = (e, type) => { addFiles(e.target.files, type); e.target.value = ""; };
  // Trascinamento file sulle caselle Documento / Contratti / Altro (richiesta Francesco).
  const [dragBox, setDragBox] = useState(null);   // quale casella e' sotto il cursore
  const onBoxDragOver = (e, t) => { e.preventDefault(); e.stopPropagation(); if (dragBox !== t) setDragBox(t); };
  const onBoxDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragBox(null); };
  const onBoxDrop = (e, t) => {
    e.preventDefault(); e.stopPropagation(); setDragBox(null);
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length) addFiles(dt.files, t);
  };
  const [draftLoaded,setDraftLoaded]=useState(false);
  const [showCart,setShowCart]=useState(false);
  const [toast,setToast]=useState(null);
  const [expI,setExpI]=useState({});
  const [tipoCliente,setTipoCliente]=useState(null);
  const [lookupValue,setLookupValue]=useState("");
  const [clienteFound,setClienteFound]=useState(false);
  const [lookupDone,setLookupDone]=useState(false);
  const [lookupBusy,setLookupBusy]=useState(false);
  const [showAna,setShowAna]=useState(false);
  const [ana,setAna]=useState({nome:"",cognome:"",cellulare:"",email:"",via:"",cap:"",citta:"",iban:"",ragioneSociale:"",nomeRef:"",cognomeRef:"",recapito:"",intDiverso:false,intNome:"",intCognome:"",intCf:""});
  const [sales,setSales]=useState({});
  const [sesCode,setSesCode]=useState("");
  const [cart,setCart]=useState([]);

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
  const [confirmReset,setConfirmReset]=useState(false);
  const [showStep4,setShowStep4]=useState(false);
  const [vfQtyModal,setVfQtyModal]=useState(null);

  const bObj=brand?BRANDS.find(b=>b.id===brand):null;
  const cats=(brand==="windtre"?getW3(tipoCliente):brand==="vodafone"?getVF(tipoCliente):brand==="fastweb"?getFW(tipoCliente):brand==="iliad"?getIL(tipoCliente):brand==="energy"?getEN(tipoCliente):brand==="tim"?getTIM(tipoCliente):brand==="very"?getVERY(tipoCliente):brand==="ho"?getHO(tipoCliente):[]);
  const sT=m=>{setToast(m);setTimeout(()=>setToast(null),3500)};
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
  const skyBadge=(r)=>!r.sel?null:(r.ok?{l:"✓ Completo",bg:"rgba(40,167,69,0.12)",fg:"#28a745"}:{l:"⚠ Incompleto",bg:"rgba(245,158,11,0.14)",fg:"#f59e0b"});
  const skyReset=(si)=>setSkyS(p=>{const n=[...p];const s={...n[si]};s.tvCC="";s.fibraCC="";s.fibraGnp=null;s.fibraGnpBrand="";s.fibraGnpNum="";s.mobMnp=null;s.mobNumProv="";s.mobNumDef="";s.mobBrandMnp="";s.mobIccid="";s.mobNum="";s.mobIccidNo="";s.mobTied=null;n[si]=s;return n;});
  const openVFModal=({catId,si,subId,offer})=>{const cur=((sales[catId]||[{}])[si]||{})[subId];const existQty=cur&&cur.vfOffers&&cur.vfOffers[offer]?cur.vfOffers[offer]:1;setVfQtyModal({catId,si,subId,offer,tempQty:existQty});};
  const confirmVFQty=()=>{if(!vfQtyModal)return;const{catId,si,subId,offer,tempQty}=vfQtyModal;const cur=((sales[catId]||[{}])[si]||{})[subId];const baseO=(cur&&cur.vfOffers)||{};const newVfOffers={...baseO};if(tempQty>0)newVfOffers[offer]=tempQty;else delete newVfOffers[offer];const existC=(cur&&cur.vfContratti&&cur.vfContratti[offer])||[];const newC=Array.from({length:tempQty},(_,i)=>existC[i]||{codIns:"",codContratto:"",numProv:"",iccid:""});const newVfC={...((cur&&cur.vfContratti)||{}),[offer]:newC};uP(catId,si,subId,"vfOffers",newVfOffers);uP(catId,si,subId,"vfContratti",newVfC);setVfQtyModal(null);};

  const colItems=useCallback(()=>{
    const items=[];
    if(brand==="windtre"||brand==="vodafone"||brand==="fastweb"||brand==="iliad"||brand==="energy"||brand==="tim"||brand==="very"||brand==="ho"){const getCats=brand==="windtre"?getW3(tipoCliente):brand==="fastweb"?getFW(tipoCliente):brand==="iliad"?getIL(tipoCliente):brand==="energy"?getEN(tipoCliente):brand==="tim"?getTIM(tipoCliente):brand==="very"?getVERY(tipoCliente):brand==="ho"?getHO(tipoCliente):getVF(tipoCliente);getCats.forEach(g=>{(sales[g.id]||[{}]).forEach((sale,si)=>{g.subs.forEach(sub=>{const d=sale[sub.id];if(d&&d.active){const det={...(d.fields||{}),...(d.contract||{}),hasContract:!!sub.hasContract};const _ed=extractDetails(d);for(const _k in _ed)det[_k]=_ed[_k];items.push({macro:g.title,macroColor:g.color,macroIcon:g.icon,sub:sub.title,saleNum:si+1,details:det})}})})})
    }else if(brand==="sky"){skyS.forEach((s,si)=>{if(s.tvSel)items.push({macro:"SKY TV",macroColor:"#0072C6",macroIcon:"📺",sub:s.tvSel,saleNum:si+1,details:{hasContract:true,"Codice Contratto":s.tvCC||"","Cod.Ins.":s.tvCodIns||sesCode||""}});if(s.fibraSel){const det={hasContract:true,"Codice Contratto":s.fibraCC||"","Cod.Ins.":s.fibraCodIns||sesCode||"","GNP":s.fibraGnp==="Sì"?"Sì":"No"};if(s.fibraGnp==="Sì"){det["Brand GNP"]=s.fibraGnpBrand||"";det["N.Fisso Portabilità"]=s.fibraGnpNum||""}items.push({macro:"SKY FIBRA",macroColor:"#0072C6",macroIcon:"🌐",sub:s.fibraSel,saleNum:si+1,details:det})}if(s.mobileSel){const det={hasContract:false,"Cod.Ins.":s.mobCodIns||sesCode||"","MNP":s.mobMnp==="Sì"?"Sì":"No"};if(s.mobMnp==="Sì"){det["N.Provvisorio"]=s.mobNumProv||"";det["N.Definitivo"]=s.mobNumDef||"";det["Brand MNP"]=s.mobBrandMnp||"";det["ICCID"]=s.mobIccid||""}else if(s.mobMnp==="No"){det["Numero"]=s.mobNum||"";det["ICCID"]=s.mobIccidNo||""}if(s.mobTied)det["TIED"]=s.mobTied;items.push({macro:"SKY MOBILE",macroColor:"#0072C6",macroIcon:"📱",sub:"Sky Mobile",saleNum:si+1,details:det})}});}
    return items;
  },[brand,sales,skyS,tipoCliente]);

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
  const skyIncomplete=brand==="sky"&&skyS.some(s=>{const t=skyTv(s),f=skyFib(s),m=skyMob(s);return (t.sel&&!t.ok)||(f.sel&&!f.ok)||(m.sel&&!m.ok);});
  const blockSaveAll=blockSave||hasIncomplete||skyIncomplete;
  const addCart=()=>{
    const items=colItems();
    if(blockSaveAll){sT(hasIncomplete?"⚠ Ci sono prodotti Incompleti: completali prima di salvare":(hasDupPodPdr?"⚠ POD/PDR duplicato: correggi prima di salvare":(hasDupCodContr?"⚠ Codice contratto duplicato: correggi prima di salvare":"⚠ Numero/ICCID non valido: correggi prima di salvare")));return;}
    if(items.length>0&&bObj){const snap={sales:JSON.parse(JSON.stringify(sales)),sesCode,skyS:JSON.parse(JSON.stringify(skyS))};setCart(p=>[...p,{brandId:brand,brandLabel:bObj.label,brandIcon:bObj.icon,brandColor:bObj.color,items,sv:snap}]);sT("✅ "+items.length+" prodotti "+bObj.label)}
    setSales({});setSesCode("");setSkyS([{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:"",tvCodIns:"",fibraCodIns:"",mobCodIns:""}]);setBrand(null);
  };
  const editCG=idx=>{const g=cart[idx];if(!g)return;setBrand(g.brandId);if(g.sv){setSales(g.sv.sales||{});setSesCode(g.sv.sesCode||"");setSkyS(g.sv.skyS||[{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:"",tvCodIns:"",fibraCodIns:"",mobCodIns:""}])}setCart(p=>p.filter((_,i)=>i!==idx));setShowCart(false);sT("✏️ Modifica "+g.brandLabel)};
  const rmCG=idx=>setCart(p=>p.filter((_,i)=>i!==idx));
  const fullReset=()=>{setBrand(null);setTipoCliente(null);setLookupValue("");setClienteFound(false);setLookupDone(false);setShowAna(false);setSales({});setSesCode("");setSkyS([{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:"",tvCodIns:"",fibraCodIns:"",mobCodIns:""}]);setCart([]);setShowCart(false);setExpI({});setConfirmReset(false);setShowStep4(false);setMargItems([]);setAttachments([]);setNotaOn(false);setNota("");setPromData("");setPromOra("");setPromNeg("");setPromDesc("");clearDraft("crm_v9");setAna({nome:"",cognome:"",cellulare:"",email:"",via:"",cap:"",citta:"",iban:"",ragioneSociale:"",nomeRef:"",cognomeRef:"",recapito:"",intDiverso:false,intNome:"",intCognome:"",intCf:""})};
  // ── Auto-save every state change ──
  useAutoSave("crm_v9",{brand,tipoCliente,ana,sales,sesCode,skyS,selVend,selNeg,lookupValue,margItems});
  
  // ── Load draft on mount (once) ──
  useEffect(()=>{if(draftLoaded)return;setDraftLoaded(true);const d=loadDraft("crm_v9");if(d){if(d.tipoCliente)setTipoCliente(d.tipoCliente);if(d.ana)setAna(d.ana);if(d.selVend)setSelVend(d.selVend);if(d.selNeg)setSelNeg(d.selNeg);if(d.margItems)setMargItems(d.margItems)}},[]);
  
  // ── Remember last brand+tipo for next session ──
  useEffect(()=>{if(tipoCliente)try{sessionStorage.setItem("crm_lastTipo",tipoCliente)}catch(e){}},[tipoCliente]);
  
  // ── Marginalità handlers ──
  const addMargItem=(item)=>{setMargItems(p=>[...p,item]);setShowMargPOS(false)};
  const rmMargItem=(idx)=>setMargItems(p=>p.filter((_,i)=>i!==idx));

  // Segnalazione 27: i contratti si duplicavano perche' "Salva contratto" non
  // aveva alcun blocco mentre il salvataggio era in corso. Un secondo clic (o un
  // doppio clic) rieseguiva tutto: nei dati si vedono coppie identiche a
  // 0,6-2,9 secondi di distanza. Il blocco usa un ref e non lo stato, perche'
  // due clic nello stesso tick leggerebbero entrambi lo stato ancora a false.
  const submitLock = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const finalSubmit = async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    let ok = false;
    try { ok = await _finalSubmitInner(); }
    finally { if (!ok) { submitLock.current = false; setSubmitting(false); } }
  };
  const _finalSubmitInner = async () => {
    if(blockSaveAll){sT("⚠ Completa tutti i prodotti (Incompleto) prima di salvare");return;}
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
      sT("⚠️ Nessun prodotto da salvare");
      return;
    }

    try {
      // 1. CF/P.IVA facoltativo (migrazione 065: colonna nullable, unicita'
      //    parziale). Obbligatori sono invece nome/cognome/cellulare.
      const cfPiva = (lookupValue || "").trim();
      if (anaMissing.length > 0) {
        sT("⚠️ Campi obbligatori mancanti: " + anaMissing.join(", "));
        return;
      }

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
        cellulare: keep(ana.cellulare || ana.recapito, "cellulare"),
        email: keep(ana.email, "email"),
        cf_piva: cfPiva || null,
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
        sT(`⚠️ ${uploadFailCount} file non caricati — controlla la connessione`);
      }

      // 4. Prepare Contract Rows
      const contractRows = [];
      const dateStr = dataVendita || new Date().toISOString().split("T")[0];

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
            _d["Cod.Cliente CB"] ||            // WindTre CB (TNP)
            _d["Cod. Contratto CB"] ||         // WindTre CB
            _d["Cod.Cliente Cambio"] ||        // WindTre CB cambio offerta
            _d["Codice Proposta"] ||
            _d["Codice Ordine"] ||
            "—"
          );
          contractRows.push({
            id: `CTR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            client_id: clientId,
            data: dateStr,
            brand: group.brandLabel,
            categoria: item.macro,
            prodotto: item.sub,
            stato: "Nuovo",
            venditore: selVend,
            negozio: selNeg,
            codice_attivazione: String(actCode),
            data_registrazione: dateStr,
            data_attivazione: dateStr,   // compilata subito: e' la data di registrazione (Luca)
            note: (notaOn && nota.trim()) ? nota.trim() : null,
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
          stato: "Nuovo",
          venditore: mi.vendor || selVend,
          negozio: mi.store || selNeg,
          codice_attivazione: "VENDITA-DIRETTA",
          data_registrazione: dateStr,
          data_attivazione: dateStr,   // compilata subito: e' la data di registrazione (Luca)
          dettagli: { product: mi.product, price: (mi.importo != null ? mi.importo : mi.price), importo: mi.importo ?? null, margin: mi.margin, qty: mi.qty, model: mi.model, imei: mi.imei },
          is_demo: false
        });
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
  const saveMargOnly=async()=>{
    if(margSaving)return;
    const anon=margSaveForm.anonimo;
    if(!anon&&!(margSaveForm.nome.trim()&&margSaveForm.cognome.trim()&&margSaveForm.tel.trim()))return;
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
      }else{
        const tel=margSaveForm.tel.trim();
        const {data:ex}=await supabase.from("clients").select("id")
          .eq("cellulare",tel).ilike("nome",margSaveForm.nome.trim())
          .ilike("cognome",margSaveForm.cognome.trim()).limit(1);
        clientId=(ex&&ex[0]&&ex[0].id)||`CL-${tel.replace(/\D/g,"")||"ND"}-${Date.now()}`;
        const {error:ce}=await supabase.from("clients").upsert({
          id:clientId,tipo:"consumer",nome:margSaveForm.nome.trim(),cognome:margSaveForm.cognome.trim(),
          cellulare:tel,email:"",cf_piva:null,indirizzo:"",cap:"",citta:"",is_demo:false,
        },{onConflict:"id"});
        if(ce)throw ce;
      }
      const rows=margItems.map(mi=>({
        id:`EXT-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
        client_id:clientId,data:dateStr,brand:"Extra",categoria:"Prodotto/Servizio",
        prodotto:mi.product,stato:"Nuovo",venditore:mi.vendor||selVend,negozio:mi.store||selNeg,
        codice_attivazione:"VENDITA-DIRETTA",data_registrazione:dateStr,data_attivazione:dateStr,
        dettagli:{product:mi.product,price:(mi.importo!=null?mi.importo:mi.price),importo:mi.importo??null,margin:mi.margin,qty:mi.qty,model:mi.model,imei:mi.imei},
        is_demo:false,
      }));
      const {error}=await supabase.from("contracts").insert(rows);
      if(error)throw error;
      setMargSaveForm({nome:"",cognome:"",tel:"",anonimo:false});
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
  const doLookup=async()=>{
    const v=(lookupValue||"").trim();
    if(lookupBusy)return;
    if(!v){skipLookup();return;}
    setLookupBusy(true);
    try{
      const {data}=await supabase.from("clients").select("*").ilike("cf_piva",v).limit(1);
      const c=data&&data[0];
      setLookupDone(true);
      setShowAna(true);setShowStep4(false);
      if(!c){
        setClienteFound(false);
        setAna({nome:"",cognome:"",cellulare:"",email:"",via:"",cap:"",citta:"",iban:"",ragioneSociale:"",nomeRef:"",cognomeRef:"",recapito:"",intDiverso:false,intNome:"",intCognome:"",intCf:""});
        return;
      }
      setClienteFound(true);
      setAna({
        nome:c.nome||"",cognome:c.cognome||"",cellulare:c.cellulare||"",email:c.email||"",
        via:c.indirizzo||"",cap:c.cap||"",citta:c.citta||"",iban:c.iban||"",
        intDiverso:!!c.intestatario_diverso,intNome:c.intestatario_nome||"",
        intCognome:c.intestatario_cognome||"",intCf:c.intestatario_cf||"",
        ragioneSociale:c.ragione_sociale||"",nomeRef:c.nome_ref||"",cognomeRef:c.cognome_ref||"",
        recapito:c.cellulare||"",
      });
      if(c.tipo==="business"&&tipoCliente!=="business")setTipoCliente("business");
      if(c.tipo==="consumer"&&tipoCliente!=="privato")setTipoCliente("privato");
    }finally{setLookupBusy(false);}
  };


  const tCI=cart.reduce((s,g)=>s+g.items.length,0)+colItems().length+margItems.length;
  const bC=bObj?bObj.color:"#8892b0";
  const bG=bObj?bObj.gradient:"linear-gradient(135deg,#374151,#8892b0)";
  // Richiesta Luca: si puo' proseguire anche senza codice fiscale e senza
  // compilare tutto, ma nome/cognome/cellulare (per il business: ragione
  // sociale, referente e recapito) restano obbligatori.
  const anaMissing = (()=>{
    const miss=[];
    if(tipoCliente==="business"){
      if(!(ana.ragioneSociale||"").trim())miss.push("Ragione Sociale");
      if(!(ana.nomeRef||"").trim())miss.push("Nome Ref.");
      if(!(ana.cognomeRef||"").trim())miss.push("Cognome Ref.");
      if(!(ana.recapito||"").trim())miss.push("Recapito");
    }else{
      if(!(ana.nome||"").trim())miss.push("Nome");
      if(!(ana.cognome||"").trim())miss.push("Cognome");
      if(!(ana.cellulare||"").trim())miss.push("Cellulare");
    }
    return miss;
  })();

  const gSS=i=>{if(i===0)return brand?"done":"active";if(i===1)return !brand?"pending":tipoCliente?"done":"active";if(i===2)return !tipoCliente?"pending":showAna?"done":"active";return showAna?"active":"pending"};

  // ═══════════ CART ═══════════
  if(showCart){
    const curI=colItems();const allG=[...cart];
    if(curI.length>0&&bObj)allG.push({brandId:brand,brandLabel:bObj.label,brandIcon:bObj.icon,brandColor:bObj.color,items:curI,isCurrent:true});
    const tp=allG.reduce((s,g)=>s+g.items.length,0)+margItems.length;
    const onlyMarg=allG.length===0&&margItems.length>0;
    const cartContent = (
      <div style={{fontFamily:"Inter,-apple-system,sans-serif",background:"transparent",minHeight:"100vh",padding:16,maxWidth:1100,margin:"0 auto"}}>
        {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"#28a745",color:"#fff",padding:"12px 28px",borderRadius:10,fontSize:14,fontWeight:700,boxShadow:"0 6px 20px rgba(0,0,0,.2)",zIndex:9999}}>{toast}</div>}
        <div style={{background:"linear-gradient(135deg,#1e293b,#16213e,#0f3460)",borderRadius:16,padding:"24px 28px",marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div><div style={{color:"#fff",fontWeight:800,fontSize:22,marginBottom:4}}>🛒 Carrello</div><div style={{color:"rgba(255,255,255,.6)",fontSize:13}}>{onlyMarg?"Riepilogo vendite 💰":((tipoCliente==="privato"?(ana.nome+" "+ana.cognome):ana.ragioneSociale)+" - Riepilogo vendite 💰")}</div></div>
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
        {margItems.length>0&&<div style={{background:"rgba(255,255,255,0.02)",borderRadius:12,padding:16,marginBottom:12,marginTop:12,boxShadow:"0 2px 8px rgba(0,0,0,.06)",overflow:"hidden"}}>
          <div style={{background:"linear-gradient(135deg,#6f42c1,#9b59b6)",padding:"10px 16px",borderRadius:"8px 8px 0 0",margin:"-16px -16px 14px -16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>📦</span><span style={{color:"#fff",fontWeight:700,fontSize:14}}>Prodotti & Marginalità</span><span style={{background:"rgba(255,255,255,.25)",borderRadius:12,padding:"2px 10px",color:"#fff",fontSize:11,fontWeight:600}}>{margItems.length}</span>{(()=>{const ph=margItems.filter(i=>i.countsPhone).reduce((s,i)=>s+(i.qty||1),0);return ph>0?<span style={{background:"rgba(255,255,255,.25)",borderRadius:12,padding:"2px 10px",color:"#fff",fontSize:11,fontWeight:700}}>📱 {ph} telefon{ph===1?"o":"i"} vendut{ph===1?"o":"i"}</span>:null;})()}</div>
            <button onClick={()=>{setMargEditItem(null);setShowMargPOS(true)}} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:6,padding:"5px 14px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:700}}>+ Aggiungi</button>
          </div>
          {margItems.map((item,idx)=>(
            <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
              <div>
                <span style={{fontWeight:700,fontSize:13}}>{item.product}</span>
                {item.model&&<span style={{fontSize:11,color:"#64748b",marginLeft:6}}>{item.model}</span>}
                <span style={{fontSize:11,color:"#6f42c1",marginLeft:8}}>x{item.qty||1}</span>
                {item.importo!=null&&<span style={{fontSize:11,color:"#28a745",marginLeft:6,fontWeight:700}}>€ {Number(item.importo).toFixed(2)}</span>}
              </div>
              <button onClick={()=>{const it=margItems[idx];setMargItems(p=>p.filter((_,i)=>i!==idx));setMargEditItem(it);setShowCart(false);setShowMargPOS(true)}} style={{padding:"4px 12px",borderRadius:6,border:"1px solid #6f42c1",background:"rgba(111,66,193,0.12)",color:"#6f42c1",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>✏️ Modifica</button>
            </div>
          ))}
        </div>}
        {!onlyMarg&&<div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:16,marginBottom:10,borderLeft:"4px solid #17a2b8",marginTop:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#17a2b8",marginBottom:14,textTransform:"uppercase"}}>📎 Step 5 — Allegati</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            {[{l:"Documento",i:"🪪",t:"documento"},{l:"Contratti",i:"📄",t:"contratti"},{l:"Altro",i:"📁",t:"altro"}].map((a,i)=>{const cnt=attachments.filter(x=>x.type===a.t).length;const over=dragBox===a.t;return <label key={i}
              onDragOver={e=>onBoxDragOver(e,a.t)} onDragEnter={e=>onBoxDragOver(e,a.t)}
              onDragLeave={onBoxDragLeave} onDrop={e=>onBoxDrop(e,a.t)}
              style={{display:"block",border:"2px dashed "+(over?"#17a2b8":(cnt>0?"rgba(23,162,184,0.55)":"rgba(255,255,255,0.1)")),borderRadius:10,padding:"14px 10px",textAlign:"center",cursor:"pointer",background:over?"rgba(23,162,184,0.22)":(cnt>0?"rgba(23,162,184,0.08)":"rgba(255,255,255,0.03)"),transform:over?"scale(1.02)":"none",transition:"all .12s"}}><input type="file" multiple onChange={e=>handleFileChange(e,a.t)} style={{display:"none"}}/><div style={{fontSize:24,marginBottom:4}}>{a.i}</div><div style={{fontSize:11,fontWeight:700,marginBottom:6}}>{a.l}</div><div style={{display:"inline-block",padding:"5px 14px",borderRadius:6,background:"#17a2b8",color:"#fff",fontSize:10,fontWeight:700}}>Carica</div><div style={{fontSize:9,color:"#64748b",marginTop:5}}>{over?"Rilascia qui":"o trascina i file"}</div>{cnt>0&&<div style={{marginTop:6,fontSize:10,color:"#17a2b8",fontWeight:700}}>{cnt} file</div>}</label>;})}
          </div>
          {attachments.length>0&&<div style={{marginTop:12,padding:12,background:"rgba(255,255,255,0.03)",borderRadius:8,border:"1px solid rgba(255,255,255,0.06)"}}><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:8,textTransform:"uppercase"}}>File caricati ({attachments.length})</div>{attachments.map((file,fi)=><div key={fi} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:fi<attachments.length-1?"1px solid rgba(255,255,255,0.05)":"none"}}><div style={{fontSize:11,color:"#f8fafc"}}>{file.name} <span style={{color:"#64748b",fontSize:10}}>· {file.type}</span></div><button type="button" onClick={()=>setAttachments(p=>p.filter((_,j)=>j!==fi))} style={{background:"none",border:"none",color:"#dc3545",cursor:"pointer",fontSize:11,fontWeight:700}}>✕</button></div>)}</div>}
        </div>}
        {!onlyMarg&&<div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:16,marginBottom:10,borderLeft:"4px solid #28a745"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#28a745",marginBottom:14,textTransform:"uppercase"}}>🏪 Step 6 — Attribuzione</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px 16px"}}>
            <DD l="Venditore" r v={selVend} o={v=>setSelVend(v)} vals={venditori} nt="Dal login — editabile"/><DD l="Negozio" r v={selNeg} o={v=>setSelNeg(v)} vals={negozi} nt="Dal login — editabile"/>
            <div><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Data <span style={{color:"#dc3545"}}>*</span></div><input type="date" value={dataVendita} onChange={e=>setDataVendita(e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,boxSizing:"border-box"}}/></div>
          </div>
        </div>}
        {onlyMarg&&<div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:16,marginBottom:10,borderLeft:"4px solid #28a745",marginTop:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#28a745",marginBottom:14,textTransform:"uppercase"}}>🏪 Attribuzione</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px 16px"}}>
            <DD l="Venditore" r v={selVend} o={v=>setSelVend(v)} vals={venditori} nt="Dal login — editabile"/>
            <DD l="Negozio" r v={selNeg} o={v=>setSelNeg(v)} vals={negozi} nt="Dal login — editabile"/>
            <div><div style={{fontSize:11,fontWeight:600,color:"#8892b0",marginBottom:3}}>Giorno <span style={{color:"#dc3545"}}>*</span></div><input type="date" value={dataVendita} onChange={e=>setDataVendita(e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,boxSizing:"border-box"}}/></div>
          </div>
        </div>}
        {!onlyMarg&&<NoteStep store={selNeg} show={notaOn} setShow={setNotaOn} nota={nota} setNota={setNota} pData={promData} setPData={setPromData} pOra={promOra} setPOra={setPromOra} pNeg={promNeg} setPNeg={setPromNeg} pDesc={promDesc} setPDesc={setPromDesc}/>}
        <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
          <button onClick={()=>setShowCart(false)} style={{padding:"12px 24px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.02)",color:"#8892b0",fontSize:13,fontWeight:600,cursor:"pointer"}}>← Torna</button>
          {!onlyMarg&&<button onClick={()=>{if(brand&&colItems().length>0){addCart();}setBrand(null);setShowCart(false);}} style={{padding:"12px 24px",borderRadius:10,border:"2px solid #6f42c1",background:"rgba(111,66,193,0.12)",color:"#6f42c1",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Altro brand</button>}
          {onlyMarg&&<button onClick={()=>setShowMargSave(true)} style={{padding:"12px 36px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#6f42c1,#9b59b6)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",marginLeft:"auto"}}>💾 Salva Marginalità ({margItems.length})</button>}
          {!onlyMarg&&<button onClick={finalSubmit} disabled={tp===0||submitting} style={{padding:"12px 36px",borderRadius:10,border:"none",background:(tp>0&&!submitting)?"linear-gradient(135deg,#28a745,#20c997)":"rgba(255,255,255,0.1)",color:"#fff",fontSize:14,fontWeight:800,cursor:(tp>0&&!submitting)?"pointer":"not-allowed",marginLeft:"auto"}}>{submitting?"⏳ Salvataggio in corso…":`💾 Salva contratto (${tp})`}</button>}
        </div>
        {showMargSave&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
          <div style={{background:"rgba(255,255,255,0.02)",borderRadius:16,width:"100%",maxWidth:420,padding:24,boxShadow:"0 8px 40px rgba(0,0,0,.25)",margin:"0 16px"}}>
            <div style={{fontWeight:800,fontSize:17,color:"#f8fafc",marginBottom:4}}>💾 Salva Vendita Prodotti</div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:16}}>Riepilogo: {margItems.length} prodott{margItems.length===1?"o":"i"} registrat{margItems.length===1?"o":"i"}</div>
            <div style={{background:"rgba(111,66,193,0.12)",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
              {margItems.map((item,idx)=>(
                <div key={idx} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0",borderBottom:"1px solid rgba(111,66,193,0.12)"}}>
                  <span style={{fontWeight:600}}>{item.product} x{item.qty||1}{item.importo!=null?` — €${Number(item.importo).toFixed(2)}`:""}</span>
                  {item.model&&<span style={{color:"#64748b"}}>{item.model}</span>}
                </div>
              ))}
            </div>
            <label style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,cursor:"pointer",background:"rgba(0,114,198,0.10)",borderRadius:8,padding:"10px 14px"}}>
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
              <button onClick={saveMargOnly} disabled={margSaving} style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:"linear-gradient(135deg,#28a745,#218838)",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>{margSaving?"Salvataggio...":"✅ Salva vendita"}</button>
            </div>
          </div>
        </div>}
      </div>
    );
    return cartContent;
  }

  // ═══════════ FORM ═══════════
  const formContent = (
    <div className="crmShell" style={{fontFamily:"Inter,-apple-system,sans-serif",background:"transparent",minHeight:"100vh",padding:16,maxWidth:1180,margin:"0 auto"}}>
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
      <style>{`@media(min-width:1600px){.crmSidebar{display:flex!important}.crmShell{margin-right:380px!important}}`}</style>
      {/* SIDEBAR CARRELLO LIVE (desktop) */}
      <div className="crmSidebar" style={{display:"none",position:"fixed",top:76,right:16,width:344,maxHeight:"calc(100vh - 92px)",overflowY:"auto",flexDirection:"column",background:"rgba(255,255,255,0.02)",borderRadius:14,boxShadow:"0 8px 30px rgba(0,0,0,.12)",zIndex:30,border:"2px solid "+bC}}>
        <div style={{background:bG,borderRadius:"14px 14px 0 0",padding:"16px 18px"}}>
          <div style={{color:"#fff",fontWeight:800,fontSize:16}}>🛒 Riepilogo vendite</div>
          <div style={{color:"rgba(255,255,255,.6)",fontSize:11,marginTop:2}}>{(tipoCliente==="privato"?(ana.nome+" "+ana.cognome).trim():ana.ragioneSociale)||"In compilazione"}</div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <div style={{flex:1,background:"rgba(255,255,255,.12)",borderRadius:8,padding:"6px 0",textAlign:"center"}}><div style={{color:"#fff",fontWeight:800,fontSize:18}}>{cart.length+(colItems().length>0?1:0)}</div><div style={{color:"rgba(255,255,255,.6)",fontSize:9}}>BRAND</div></div>
            <div style={{flex:1,background:"rgba(255,255,255,.12)",borderRadius:8,padding:"6px 0",textAlign:"center"}}><div style={{color:"#fff",fontWeight:800,fontSize:18}}>{tCI}</div><div style={{color:"rgba(255,255,255,.6)",fontSize:9}}>PRODOTTI</div></div>
            <div style={{flex:1,background:"rgba(255,255,255,.12)",borderRadius:8,padding:"6px 0",textAlign:"center"}}><div style={{color:"#fff",fontWeight:800,fontSize:18}}>{margItems.length}</div><div style={{color:"rgba(255,255,255,.6)",fontSize:9}}>P&M</div></div>
          </div>
        </div>
        <div style={{padding:14,flex:1}}>
          {[...cart,...(colItems().length>0&&bObj?[{brandLabel:bObj.label,brandIcon:bObj.icon,brandColor:bObj.color,items:colItems(),isCurrent:true}]:[])].length===0&&margItems.length===0?(
            <div style={{textAlign:"center",color:"#64748b",padding:"30px 10px"}}><div style={{fontSize:34}}>📭</div><div style={{fontSize:12,marginTop:6}}>Nessuna vendita</div></div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[...cart,...(colItems().length>0&&bObj?[{brandLabel:bObj.label,brandIcon:bObj.icon,brandColor:bObj.color,items:colItems(),isCurrent:true}]:[])].map((g,gi)=>(
                <div key={gi} style={{border:"1px solid rgba(255,255,255,0.06)",borderLeft:"4px solid "+(g.brandColor||"#64748b"),borderRadius:8,padding:"8px 10px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{fontSize:12,fontWeight:800,color:"#f8fafc"}}>{g.brandIcon} {g.brandLabel}{g.isCurrent?" •":""}</div><div style={{fontSize:11,fontWeight:700,color:g.brandColor||"#64748b"}}>{g.items.length}</div></div>
                  <div style={{fontSize:10,color:"#64748b",marginTop:2}}>{g.items.map(it=>it.sub).join(", ")}</div>
                </div>
              ))}
              {margItems.length>0&&<div style={{border:"1px solid rgba(255,255,255,0.06)",borderLeft:"4px solid #6f42c1",borderRadius:8,padding:"8px 10px"}}><div style={{display:"flex",justifyContent:"space-between"}}><div style={{fontSize:12,fontWeight:800,color:"#6f42c1"}}>📦 Prodotti & Marginalità</div><div style={{fontSize:11,fontWeight:700,color:"#6f42c1"}}>{margItems.length}</div></div></div>}
            </div>
          )}
        </div>
        <div style={{padding:14,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
          <button onClick={()=>setShowCart(true)} style={{width:"100%",padding:"11px 0",borderRadius:10,border:"none",background:bG,color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>Apri carrello →</button>
        </div>
      </div>
      {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:"#28a745",color:"#fff",padding:"12px 28px",borderRadius:10,fontSize:14,fontWeight:700,boxShadow:"0 6px 20px rgba(0,0,0,.2)",zIndex:9999}}>{toast}</div>}
      <div style={{background:bG,borderRadius:12,padding:"14px 20px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}><div style={{width:36,height:36,background:"rgba(255,255,255,.2)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{bObj?bObj.icon:"⚡"}</div><div><div style={{color:"#fff",fontWeight:700,fontSize:16}}>Registra Contratto</div><div style={{color:"rgba(255,255,255,.7)",fontSize:11}}>{bObj?bObj.label:"Seleziona brand"}{tipoCliente?" · "+(tipoCliente==="privato"?"Privato":"Business"):""}</div></div></div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>setShowMargSection(true)} title="Prodotti & Marginalità" style={{padding:"8px 16px",borderRadius:8,border:"1px solid rgba(255,255,255,.4)",background:"rgba(255,255,255,.15)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>📦 Prodotti&Marginalità{margItems.length>0&&<span style={{background:"#FFD800",color:"#f8fafc",borderRadius:8,padding:"1px 7px",fontSize:11,fontWeight:800}}>{margItems.length}</span>}</button><button onClick={()=>setShowCart(true)} style={{background:tCI>0?"rgba(255,255,255,.25)":"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.3)",borderRadius:8,padding:"8px 16px",color:"#fff",fontSize:13,cursor:"pointer",fontWeight:700,display:"flex",alignItems:"center",gap:6}}>🛒 Carrello{tCI>0&&<span style={{background:"#FFD800",color:"#f8fafc",borderRadius:10,padding:"1px 7px",fontSize:11,fontWeight:800}}>{tCI}</span>}</button>
          <button onClick={()=>setConfirmReset(true)} title="Reset tutto" style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.25)",borderRadius:8,padding:"8px 14px",color:"rgba(255,255,255,.85)",fontSize:13,cursor:"pointer",fontWeight:700}}>🔄 Reset</button>
        </div>
      </div>

      <div style={{display:"flex",gap:3,marginBottom:16}}>
        {["Brand","Tipo Cliente","Anagrafica","Prodotti","Allegati","Attribuzione","Note"].map((st,i)=>{const ss=gSS(i);const clk=ss==="done";return <div key={i} onClick={()=>{if(clk){if(i<=2){setShowAna(true);setShowStep4(false);}else{setShowStep4(true);}}}} style={{flex:1,textAlign:"center",padding:"9px 2px",borderRadius:6,fontSize:11,fontWeight:700,background:ss==="active"?bC:ss==="done"?"#28a745":"#e9ecef",color:ss==="pending"?"#64748b":"#fff",cursor:clk?"pointer":"default",transition:"transform .1s"}}>{ss==="done"?"✓ ":""}{st}</div>;})}
      </div>

      {(cart.length>0||margItems.length>0)&&<div onClick={()=>setShowCart(true)} style={{background:"linear-gradient(90deg,#1e293b,#16213e)",borderRadius:10,padding:"10px 16px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}><div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}><span>🛒</span><span style={{color:"#fff",fontSize:12,fontWeight:600}}>Carrello:</span>{cart.map((g,i)=><span key={i} style={{background:g.brandColor,color:"#fff",borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>{g.brandIcon} {g.items.length}</span>)}{margItems.length>0&&<span style={{background:"#6f42c1",color:"#fff",borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>📦 {margItems.length}</span>}</div><span style={{color:"rgba(255,255,255,.5)",fontSize:11}}>Vedi →</span></div>}

      {!brand?<div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:20,marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:700,color:"#8892b0",marginBottom:14,textTransform:"uppercase"}}>Step 1 — Brand</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          {BRANDS.map(b=><button key={b.id} onClick={()=>{if(!b.ready)return;const cont=cart.length>0||(tipoCliente&&(ana.nome||ana.cognome||ana.ragioneSociale));const ei=cart.findIndex(g=>g.brandId===b.id);setBrand(b.id);const dSky=[{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:"",tvCodIns:"",fibraCodIns:"",mobCodIns:""}];if(ei>=0){const g=cart[ei];setSales(g.sv&&g.sv.sales?g.sv.sales:{});setSesCode(g.sv&&g.sv.sesCode?g.sv.sesCode:"");setSkyS(g.sv&&g.sv.skyS?g.sv.skyS:dSky);setCart(p=>p.filter((_,i)=>i!==ei));}else{setSales({});setSesCode("");setSkyS(dSky);}if(b.id==="very"||b.id==="ho"){setTipoCliente("privato");if(!cont)setClienteFound(false);setShowAna(true);setShowStep4(cont||ei>=0?true:false);}else if(cont||ei>=0){setShowAna(true);setShowStep4(true);}else{setTipoCliente(null);setShowAna(false);setShowStep4(false);}}} style={{padding:16,borderRadius:12,border:"2px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.02)",cursor:b.ready?"pointer":"default",textAlign:"center",opacity:b.ready?1:.6,position:"relative",overflow:"hidden"}}>
            {!b.ready&&<div style={{position:"absolute",top:0,left:0,right:0,bottom:0,background:"rgba(15,17,26,0.88)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:2}}><div style={{fontSize:22}}>🔧</div><div style={{fontSize:10,fontWeight:700,color:"#64748b"}}>Manutenzione</div></div>}
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:56,marginBottom:12}}>{b.logo?<Image src={b.logo} alt={b.label} width={180} height={56} style={{height:56,width:"auto",maxWidth:"85%",objectFit:"contain"}}/>:<span style={{fontSize:36}}>{b.icon}</span>}</div><div style={{fontWeight:800,fontSize:15,color:b.color}}>{b.label}</div><div style={{fontSize:10,color:"#64748b",marginTop:3}}>{b.desc}</div>
          </button>)}
        </div>
        <div style={{marginTop:12}}>
          <button onClick={()=>setShowMargPOS(true)} style={{width:"100%",padding:"14px 20px",borderRadius:12,border:"2px dashed #6f42c1",background:"rgba(111,66,193,0.12)",cursor:"pointer",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
            <span style={{fontSize:24}}>📦</span>
            <div style={{textAlign:"left"}}>
              <div style={{fontWeight:800,fontSize:14,color:"#6f42c1"}}>Prodotti & Marginalità</div>
              <div style={{fontSize:11,color:"#9b59b6",marginTop:2}}>Registra vendite prodotti senza attivazione brand</div>
            </div>
            {margItems.length>0&&<span style={{marginLeft:"auto",background:"#6f42c1",color:"#fff",borderRadius:10,padding:"2px 10px",fontSize:12,fontWeight:800}}>{margItems.length}</span>}
          </button>
        </div>
      </div>:<div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:"12px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:11,fontWeight:700,color:"#28a745"}}>✓ 1</span><span style={{fontSize:13,fontWeight:600}}>Brand: <span style={{color:bObj.color}}>{bObj.icon} {bObj.label}{tipoCliente==="business"?" Business":""}</span></span></div>}

      {brand&&!showStep4&&<div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:16,marginBottom:10,borderLeft:"4px solid #6f42c1"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#6f42c1",marginBottom:12,textTransform:"uppercase"}}>Step 2 — Tipo Cliente</div>
        <div style={{display:"flex",gap:12,marginBottom:tipoCliente?16:0}}>
          {(brand==="very"||brand==="ho"?["privato"]:["privato","business"]).map(t=><button key={t} onClick={()=>{setTipoCliente(t);setShowAna(false);setClienteFound(false);setLookupValue("");setSales({});setSkyS([{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:"",tvCodIns:"",fibraCodIns:"",mobCodIns:""}]);setShowStep4(false)}} style={{flex:1,padding:12,borderRadius:10,border:tipoCliente===t?"2px solid #6f42c1":"2px solid rgba(255,255,255,0.06)",background:tipoCliente===t?"rgba(111,66,193,0.12)":"rgba(255,255,255,0.04)",cursor:"pointer",textAlign:"center"}}><div style={{fontSize:22,marginBottom:2}}>{t==="privato"?"👤":"🏢"}</div><div style={{fontWeight:700,fontSize:14,color:tipoCliente===t?"#6f42c1":"#f8fafc"}}>{t==="privato"?"Privato":"Business"}</div></button>)}
        </div>
        {tipoCliente&&<div style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:14,position:"relative"}}>
          <div style={{fontSize:12,fontWeight:600,color:"#8892b0",marginBottom:8}}>{tipoCliente==="privato"?"Codice Fiscale":"Partita IVA"}</div>
          <div style={{display:"flex",gap:8}}>
            <input placeholder={tipoCliente==="privato"?"RSSMRA80A01H501Z":"12345678901"} value={lookupValue} onChange={e=>setLookupValue(e.target.value.toUpperCase())} style={{flex:1,padding:"10px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)",fontSize:14,fontFamily:"monospace",letterSpacing:1.2}}/>
            <button onClick={doLookup} style={{padding:"10px 18px",borderRadius:8,border:"none",background:"#6f42c1",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>🔍 Cerca</button>
            <button onClick={skipLookup} title="Il cliente non ha un codice fiscale a disposizione" style={{padding:"10px 16px",borderRadius:8,border:"1px solid rgba(255,255,255,0.18)",background:"rgba(255,255,255,0.04)",color:"#cbd5e1",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>Prosegui senza CF →</button>
          </div>
          {lookupDone&&(clienteFound?<div style={{marginTop:10,background:"rgba(40,167,69,0.12)",borderRadius:6,padding:"8px 12px",fontSize:12,color:"#28a745"}}>✅ Cliente trovato in anagrafica</div>:<div style={{marginTop:10,background:"rgba(245,158,11,0.12)",borderRadius:6,padding:"8px 12px",fontSize:12,color:"#f59e0b"}}>⚠ Cliente non presente in anagrafica — compila i dati a mano (bastano nome, cognome e cellulare)</div>)}
        </div>}
      </div>}

      {showAna&&!showStep4&&<div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:16,marginBottom:10,borderLeft:"4px solid #1B3A5C"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#1B3A5C",marginBottom:14,textTransform:"uppercase"}}>📝 Step 3 — Anagrafica</div>
        {tipoCliente==="privato"?<><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 16px"}}><TF l="Nome" r v={ana.nome} o={v=>uA("nome",v)} p="Mario" pf={clienteFound}/><TF l="Cognome" r v={ana.cognome} o={v=>uA("cognome",v)} p="Rossi" pf={clienteFound}/><TF l="Cellulare" r v={ana.cellulare} o={v=>uA("cellulare",v)} p="333..." pf={clienteFound}/><TF l="Email" v={ana.email} o={v=>uA("email",v)} p="email" pf={clienteFound}/></div><div style={{marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.06)",display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:"10px 16px"}}><TF l="Via" v={ana.via} o={v=>uA("via",v)} p="Via Roma" pf={clienteFound}/><TF l="CAP" v={ana.cap} o={v=>uA("cap",v)} p="00100" pf={clienteFound}/><TF l="Città" v={ana.citta} o={v=>uA("citta",v)} p="Roma" pf={clienteFound}/></div><div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr",gap:"10px 16px"}}><TF l="IBAN" v={ana.iban} o={v=>uA("iban",v.toUpperCase())} p="IT60 X054 2811 1010 0000 0123 456" pf={clienteFound}/></div>
        <label style={{display:"flex",alignItems:"center",gap:8,marginTop:8,cursor:"pointer",fontSize:12,fontWeight:600,color:"#8892b0"}}>
          <input type="checkbox" checked={!!ana.intDiverso} onChange={e=>uA("intDiverso",e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
          Diverso intestatario
        </label>
        {ana.intDiverso&&<div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px 16px",background:"rgba(111,66,193,0.08)",border:"1px solid rgba(111,66,193,0.25)",borderRadius:8,padding:12}}>
          <TF l="Nome intestatario" r v={ana.intNome} o={v=>uA("intNome",v)} p="Mario"/>
          <TF l="Cognome intestatario" r v={ana.intCognome} o={v=>uA("intCognome",v)} p="Rossi"/>
          <TF l="Codice Fiscale intestatario" r v={ana.intCf} o={v=>uA("intCf",v.toUpperCase())} p="RSSMRA80A01H501Z"/>
        </div>}</>
        :<><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 16px"}}><TF l="Ragione Sociale" r v={ana.ragioneSociale} o={v=>uA("ragioneSociale",v)} p="Rossi Srl" pf={clienteFound}/><TF l="Nome Ref." r v={ana.nomeRef} o={v=>uA("nomeRef",v)} p="Mario" pf={clienteFound}/><TF l="Cognome Ref." r v={ana.cognomeRef} o={v=>uA("cognomeRef",v)} p="Rossi" pf={clienteFound}/><TF l="Recapito" r v={ana.recapito} o={v=>uA("recapito",v)} p="333..." pf={clienteFound}/><TF l="Email" v={ana.email} o={v=>uA("email",v)} p="info@" pf={clienteFound}/></div><div style={{marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.06)",display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:"10px 16px"}}><TF l="Via" v={ana.via} o={v=>uA("via",v)} p="Via Roma" pf={clienteFound}/><TF l="CAP" v={ana.cap} o={v=>uA("cap",v)} p="00100" pf={clienteFound}/><TF l="Città" v={ana.citta} o={v=>uA("citta",v)} p="Roma" pf={clienteFound}/></div><div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr",gap:"10px 16px"}}><TF l="IBAN" v={ana.iban} o={v=>uA("iban",v.toUpperCase())} p="IT60 X054 2811 1010 0000 0123 456" pf={clienteFound}/></div>
        <label style={{display:"flex",alignItems:"center",gap:8,marginTop:8,cursor:"pointer",fontSize:12,fontWeight:600,color:"#8892b0"}}>
          <input type="checkbox" checked={!!ana.intDiverso} onChange={e=>uA("intDiverso",e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
          Diverso intestatario
        </label>
        {ana.intDiverso&&<div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px 16px",background:"rgba(111,66,193,0.08)",border:"1px solid rgba(111,66,193,0.25)",borderRadius:8,padding:12}}>
          <TF l="Nome intestatario" r v={ana.intNome} o={v=>uA("intNome",v)} p="Mario"/>
          <TF l="Cognome intestatario" r v={ana.intCognome} o={v=>uA("intCognome",v)} p="Rossi"/>
          <TF l="Codice Fiscale intestatario" r v={ana.intCf} o={v=>uA("intCf",v.toUpperCase())} p="RSSMRA80A01H501Z"/>
        </div>}</>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
          <button onClick={()=>{setAna({nome:"",cognome:"",cellulare:"",email:"",via:"",cap:"",citta:"",iban:"",ragioneSociale:"",nomeRef:"",cognomeRef:"",recapito:"",intDiverso:false,intNome:"",intCognome:"",intCf:""});setLookupValue("");setClienteFound(false);setShowStep4(false)}} style={{padding:"9px 18px",borderRadius:8,border:"2px solid #dc3545",background:"rgba(255,255,255,0.02)",color:"#dc3545",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>↺ Reset anagrafica</button>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            {anaMissing.length>0&&<span style={{fontSize:11,fontWeight:600,color:"#f59e0b"}}>Obbligatori: {anaMissing.join(", ")}</span>}
            <button disabled={anaMissing.length>0} onClick={()=>{if(anaMissing.length===0)setShowStep4(true)}} title={anaMissing.length>0?"Compila "+anaMissing.join(", "):""} style={{padding:"9px 22px",borderRadius:8,border:"none",background:anaMissing.length>0?"rgba(255,255,255,0.08)":"linear-gradient(135deg,#2E75B6,#1B3A5C)",color:anaMissing.length>0?"#64748b":"#fff",fontSize:13,fontWeight:700,cursor:anaMissing.length>0?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:6}}>Avanti →</button>
          </div>
        </div>
      </div>}

      {showAna&&showStep4&&(brand==="windtre"||brand==="vodafone"||brand==="fastweb"||brand==="iliad"||brand==="energy"||brand==="tim"||brand==="very"||brand==="ho"||brand==="sky")&&<div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:16,marginBottom:10,borderLeft:"4px solid "+(brand==="vodafone"?"#E60000":brand==="fastweb"?"#CC9900":brand==="iliad"?"#C00028":brand==="energy"?"#28a745":brand==="tim"?TIM_C:brand==="very"?VERY_C:brand==="ho"?HO_C:brand==="sky"?"#0072C6":"#2E75B6")}}>
        <div style={{fontSize:11,fontWeight:700,color:brand==="vodafone"?"#E60000":brand==="fastweb"?"#CC9900":brand==="iliad"?"#C00028":brand==="energy"?"#28a745":brand==="tim"?TIM_C:brand==="very"?VERY_C:brand==="ho"?HO_C:brand==="sky"?"#0072C6":"#2E75B6",marginBottom:14,textTransform:"uppercase"}}>📂 Step 4 — Prodotti e Contratto</div>
        <div style={{background:"rgba(0,114,198,0.10)",borderRadius:8,padding:10,marginBottom:14,display:"flex",alignItems:"center",gap:12,border:"1px solid rgba(0,114,198,0.18)",flexWrap:"wrap"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#1B3A5C"}}>Codice inserimento:</span>
          <select value={sesCode} onChange={e=>setSesCode(e.target.value)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid rgba(0,114,198,0.18)",fontSize:12,fontWeight:600,background:"rgba(255,255,255,0.02)",minWidth:140}}><option value="">— Seleziona —</option>{(brand==="vodafone"?VF_CODICI_NEGOZIO:brand==="fastweb"?FW_CODICI_NEGOZIO:brand==="iliad"?IL_CODICI_NEGOZIO:brand==="energy"?EN_CODICI_NEGOZIO:brand==="tim"?TIM_CODICI_NEGOZIO:brand==="very"?VERY_CODICI_NEGOZIO:brand==="ho"?HO_CODICI_NEGOZIO:brand==="sky"?SKY_CODICI_NEGOZIO:codiciW3).map(c=><option key={c} value={c}>{c}</option>)}</select>
        </div>
        {cats.map(group=>{const cc=catCounts(group.id,group.subs);return <div key={group.id} style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{fontSize:16}}>{group.icon}</span><span style={{fontSize:13,fontWeight:700,color:group.color,textTransform:"uppercase"}}>{group.title}</span>{cc.tot>0&&<span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:10,fontWeight:700,color:"#8892b0",background:"transparent",borderRadius:999,padding:"2px 10px"}}>{cc.tot} {cc.tot===1?"vendita":"vendite"}{cc.ok>0&&<span style={{color:"#28a745"}}>· {cc.ok} ✓</span>}{cc.warn>0&&<span style={{color:"#f59e0b"}}>· {cc.warn} ⚠</span>}{cc.empty>0&&<span style={{color:"#64748b"}}>· {cc.empty} ●</span>}</span>}</div>
          {gS(group.id).map((sale,si)=><div key={si} style={{padding:12,borderRadius:8,marginBottom:6,background:"rgba(255,255,255,0.03)",borderLeft:"3px solid "+group.color}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <span style={{fontSize:11,fontWeight:700,color:group.color}}>Vendita #{si+1}</span>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>resetSale(group.id,si)} title="Reset questa vendita" style={{padding:"4px 10px",borderRadius:6,border:"1px solid #b0b0b0",background:"rgba(255,255,255,0.02)",color:"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>↺</button>
                {si===gS(group.id).length-1&&<button onClick={()=>addSl(group.id)} style={{padding:"4px 12px",borderRadius:6,border:"1px solid "+group.color,background:"rgba(255,255,255,0.02)",color:group.color,fontSize:11,fontWeight:700,cursor:"pointer"}}>+</button>}
                {si>0&&<button onClick={()=>rmSl(group.id,si)} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #dc3545",background:"rgba(255,255,255,0.02)",color:"#dc3545",fontSize:10,fontWeight:700,cursor:"pointer"}}>✕</button>}
              </div>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:10,marginBottom:group.subs.some(s=>sale[s.id]&&sale[s.id].active)?12:0}}>
              {group.subs.map(sub=><button key={sub.id} onClick={()=>togSub(group.id,si,sub.id,group.radio?group.subs.map(s=>s.id):null)} style={{padding:"13px 28px",borderRadius:10,border:(sale[sub.id]&&sale[sub.id].active)?"2px solid "+group.color:"2px solid rgba(255,255,255,0.1)",background:(sale[sub.id]&&sale[sub.id].active)?group.color:"rgba(255,255,255,0.04)",color:(sale[sub.id]&&sale[sub.id].active)?"#fff":"#8892b0",cursor:"pointer",fontSize:13,fontWeight:700}}>{sub.title}</button>)}
            </div>
            {group.subs.filter(sub=>sale[sub.id]&&sale[sub.id].active).map(sub=>
              <SubCard key={sub.id} sub={sub} rawSd={sale[sub.id]||{}} group={group} si={si} sessionCode={sesCode} sale={sale} uF={uF} uC={uC} uP={uP} catSales={gS(group.id)} anaCel={(ana.cellulare||"").replace(/\D/g,"")} onOpenVFModal={openVFModal} dupCheck={dupCheck}/>
            )}
          </div>)}
        </div>;})}
      </div>}

      {showAna&&showStep4&&brand==="tim"&&tipoCliente==="business"&&(
        <div style={{background:"linear-gradient(135deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 100%)",borderRadius:16,padding:"44px 24px",marginBottom:10,border:"2px solid "+TIM_C+"33",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",boxShadow:"0 6px 20px rgba(0,0,0,.07)"}}>
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
          <div style={{fontSize:15,fontWeight:600,color:"#64748b",marginTop:6}}>Manutenzione in corso...</div>
          <div style={{fontSize:12,color:"#9aa0a6",marginTop:8,maxWidth:440,lineHeight:1.5}}>Questa sezione è temporaneamente in aggiornamento tecnologico. I prodotti TIM Business saranno disponibili a breve.</div>
        </div>
      )}

      {showAna&&showStep4&&brand==="sky"&&(()=>{
        const SKY_COLOR="#0072C6";
        const btnSky=(label,active,onClick)=><button onClick={onClick} style={{padding:"10px 18px",borderRadius:8,cursor:"pointer",border:active?"2px solid "+SKY_COLOR:"2px solid rgba(255,255,255,0.1)",background:active?SKY_COLOR:"rgba(255,255,255,0.04)",color:active?"#fff":"#8892b0",fontSize:13,fontWeight:600,whiteSpace:"nowrap"}}>{label}</button>;
        const ynSky=(val,onYes,onNo)=><div style={{display:"flex",gap:6}}>{[{v:"Sì",fn:onYes},{v:"No",fn:onNo}].map(({v,fn})=><button key={v} onClick={fn} style={{padding:"7px 22px",borderRadius:8,border:val===v?"2px solid "+SKY_COLOR:"2px solid rgba(255,255,255,0.1)",background:val===v?SKY_COLOR:"rgba(255,255,255,0.04)",color:val===v?"#fff":"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>{v}</button>)}</div>;
        const dBox=(children)=><div style={{marginTop:10,background:"rgba(0,114,198,0.10)",borderRadius:8,padding:12,border:"1px solid rgba(0,114,198,0.18)"}}><div style={{fontSize:11,fontWeight:700,color:SKY_COLOR,marginBottom:8,textTransform:"uppercase"}}>📄 Dati contratto</div>{children}</div>;
        const venditeBar=(si,bd)=>{return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:11,fontWeight:700,color:SKY_COLOR}}>Vendita #{si+1}</span>{bd&&<span style={{fontSize:10,fontWeight:800,padding:"2px 9px",borderRadius:999,background:bd.bg,color:bd.fg,whiteSpace:"nowrap"}}>{bd.l}</span>}</div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>skyReset(si)} title="Reset questa vendita" style={{padding:"4px 10px",borderRadius:6,border:"1px solid #b0b0b0",background:"rgba(255,255,255,0.02)",color:"#8892b0",fontSize:12,fontWeight:700,cursor:"pointer"}}>↺</button>
            {si===skyS.length-1&&<button onClick={()=>setSkyS(p=>[...p,{tvSel:null,tvCC:"",fibraSel:null,fibraCC:"",fibraGnp:null,fibraGnpBrand:"",fibraGnpNum:"",mobileSel:false,mobMnp:null,mobNumProv:"",mobNumDef:"",mobBrandMnp:"",mobIccid:"",mobNum:"",mobIccidNo:"",tvCodIns:"",fibraCodIns:"",mobCodIns:""}])} style={{padding:"4px 12px",borderRadius:6,border:"1px solid "+SKY_COLOR,background:"rgba(255,255,255,0.02)",color:SKY_COLOR,fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Vendita</button>}
            {si>0&&<button onClick={()=>setSkyS(p=>{const n=[...p];n.splice(si,1);return n})} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #dc3545",background:"rgba(255,255,255,0.02)",color:"#dc3545",fontSize:10,fontWeight:700,cursor:"pointer"}}>✕</button>}
          </div>
        </div>;};
        return (<div>
          {/* ── BOX TV ── */}
          <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:16,marginBottom:10,borderLeft:"4px solid "+SKY_COLOR}}>
            <div style={{fontSize:11,fontWeight:700,color:SKY_COLOR,marginBottom:12,textTransform:"uppercase"}}>📺 TV</div>
            {skyS.map((sale,si)=><div key={si} style={{padding:12,borderRadius:8,marginBottom:6,background:"rgba(255,255,255,0.03)",borderLeft:"3px solid "+SKY_COLOR}}>
              {venditeBar(si,skyBadge(skyTv(sale)))}
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {(tipoCliente==="business"?SKY_BIZ_TV:SKY_TV).map(pr=>btnSky(pr,sale.tvSel===pr,()=>togSky(si,pr)))}
              </div>
              {sale.tvSel&&dBox(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px"}}>
                  <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>Codice contratto <span style={{color:"#dc3545"}}>*</span></div>
                  <input value={sale.tvCC||""} onChange={e=>uSkyF(si,"tvCC",e.target.value)} placeholder="es. 1679428185586" style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,boxSizing:"border-box"}}/></div>
                  <SCd session={sesCode} codici={SKY_CODICI_NEGOZIO} val={sale.tvCodIns||""} onCh={v=>uSkyF(si,"tvCodIns",v)}/>
                </div>
              )}
            </div>)}
          </div>

          {/* ── BOX FIBRA ── */}
          <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:16,marginBottom:10,borderLeft:"4px solid "+SKY_COLOR}}>
            <div style={{fontSize:11,fontWeight:700,color:SKY_COLOR,marginBottom:12,textTransform:"uppercase"}}>🌐 Fibra</div>
            {skyS.map((sale,si)=><div key={si} style={{padding:12,borderRadius:8,marginBottom:6,background:"rgba(255,255,255,0.03)",borderLeft:"3px solid "+SKY_COLOR}}>
              {venditeBar(si,skyBadge(skyFib(sale)))}
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {(tipoCliente==="business"?SKY_BIZ_FIBRA:SKY_FIBRA).map(pr=>btnSky(pr,sale.fibraSel===pr,()=>togSky(si,pr)))}
              </div>
              {sale.fibraSel&&dBox(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px"}}>
                <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>Codice contratto <span style={{color:"#dc3545"}}>*</span></div>
                <input value={sale.fibraCC||""} onChange={e=>uSkyF(si,"fibraCC",e.target.value)} placeholder="es. 1679428185586" style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,boxSizing:"border-box"}}/></div>
                <SCd session={sesCode} codici={SKY_CODICI_NEGOZIO} val={sale.fibraCodIns||""} onCh={v=>uSkyF(si,"fibraCodIns",v)}/>
                <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>GNP?</div>
                {ynSky(sale.fibraGnp,()=>uSkyF(si,"fibraGnp","Sì"),()=>{uSkyF(si,"fibraGnp","No");uSkyF(si,"fibraGnpBrand","");uSkyF(si,"fibraGnpNum","");})}</div>
                {sale.fibraGnp==="Sì"&&<>
                  <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>Brand GNP</div>
                  <select value={sale.fibraGnpBrand||""} onChange={e=>uSkyF(si,"fibraGnpBrand",e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12}}>
                    <option value="">— Seleziona —</option>
                    {SKY_BRAND_FIBRA.map(b=><option key={b} value={b}>{b}</option>)}
                  </select></div>
                  <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>Numero fisso in portabilità</div>
                  <input value={sale.fibraGnpNum||""} onChange={e=>uSkyF(si,"fibraGnpNum",e.target.value)} placeholder="es. 060000000" style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12,boxSizing:"border-box"}}/></div>
                </>}
              </div>)}
            </div>)}
          </div>

          {/* ── BOX MOBILE — solo privato ── */}
          {tipoCliente!=="business"&&<div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:16,marginBottom:10,borderLeft:"4px solid "+SKY_COLOR}}>
            <div style={{fontSize:11,fontWeight:700,color:SKY_COLOR,marginBottom:12,textTransform:"uppercase"}}>📱 Mobile</div>
            {skyS.map((sale,si)=><div key={si} style={{padding:12,borderRadius:8,marginBottom:6,background:"rgba(255,255,255,0.03)",borderLeft:"3px solid "+SKY_COLOR}}>
              {venditeBar(si,skyBadge(skyMob(sale)))}
              <div style={{display:"flex",gap:6}}>
                {btnSky("Sky Mobile",sale.mobileSel,()=>togSky(si,"Sky Mobile"))}
              </div>
              {sale.mobileSel&&dBox(<div>
                <div style={{marginBottom:10,maxWidth:240}}><SCd session={sesCode} codici={SKY_CODICI_NEGOZIO} val={sale.mobCodIns||""} onCh={v=>uSkyF(si,"mobCodIns",v)}/></div>
                <div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:4}}>MNP? <span style={{color:"#dc3545"}}>*</span></div>
                {ynSky(sale.mobMnp,()=>uSkyF(si,"mobMnp","Sì"),()=>{uSkyF(si,"mobMnp","No");uSkyF(si,"mobNumProv","");uSkyF(si,"mobNumDef","");uSkyF(si,"mobBrandMnp","");uSkyF(si,"mobIccid","");})}
                {sale.mobMnp==="Sì"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px",marginTop:8}}>
                  <TF l="Numero provvisorio" r v={sale.mobNumProv||""} o={v=>uSkyF(si,"mobNumProv",v)} p="es. 393XXXXXXX"/>
                  <TF l="Numero definitivo" r v={sale.mobNumDef||""} o={v=>uSkyF(si,"mobNumDef",v)} p="Numero da portare"/>
                  <div><div style={{fontSize:10,fontWeight:700,color:"#8892b0",marginBottom:3}}>Brand MNP <span style={{color:"#dc3545"}}>*</span></div>
                  <select value={sale.mobBrandMnp||""} onChange={e=>uSkyF(si,"mobBrandMnp",e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",fontSize:12}}>
                    <option value="">— Seleziona —</option>
                    {["TIM","Vodafone","Fastweb","WINDTRE","Iliad","PosteMobile","CoopVoce","ho.","Very Mobile","Rabona","Lyca","Kena","MVNO altro"].map(b=><option key={b} value={b}>{b}</option>)}
                  </select></div>
                  <TF l="ICCID" r v={sale.mobIccid||""} o={v=>uSkyF(si,"mobIccid",v)} p="893XXXXXXXXXXXXXXXX"/>
                </div>}
                {sale.mobMnp==="No"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px",marginTop:8}}>
                  <TF l="Numero" r v={sale.mobNum||""} o={v=>uSkyF(si,"mobNum",v)} p="es. 393XXXXXXX"/>
                  <TF l="ICCID" r v={sale.mobIccidNo||""} o={v=>uSkyF(si,"mobIccidNo",v)} p="893XXXXXXXXXXXXXXXX"/>
                </div>}
                <div style={{fontSize:10,fontWeight:700,color:"#8892b0",margin:"10px 0 4px"}}>TIED? <span style={{color:"#dc3545"}}>*</span></div>
                {ynSky(sale.mobTied,()=>uSkyF(si,"mobTied","Sì"),()=>uSkyF(si,"mobTied","No"))}
              </div>)}
            </div>)}
          </div>}
        </div>);
      })()}


      
      {/* ── PRODOTTI & MARGINALITÀ ── */}
      {(margItems.length>0||(showAna&&showStep4&&brand))&&<div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:16,marginBottom:10,borderLeft:"4px solid #6f42c1"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:"#6f42c1",textTransform:"uppercase"}}>📦 Prodotti & Marginalità</div>
          <button onClick={()=>setShowMargPOS(true)} style={{padding:"6px 16px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#6f42c1,#9b59b6)",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Aggiungi</button>
        </div>
        {margItems.length>0?(<div>
          {margItems.map((it,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
            <span style={{fontSize:12,color:"#f8fafc"}}>{it.product} ×{it.qty||1}{it.model?` (${it.model})`:""}{it.importo!=null?` — €${Number(it.importo).toFixed(2)}`:""}</span>
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
                <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13}}>{item.product}</div>
                    {item.model&&<div style={{fontSize:11,color:"#64748b"}}>{item.model}</div>}
                    <div style={{fontSize:12,color:"#8892b0",marginTop:2}}>x{item.qty||1}{item.importo!=null&&<span style={{color:"#28a745",marginLeft:6,fontWeight:700}}>€ {Number(item.importo).toFixed(2)}</span>}</div>
                  </div>
                  <button onClick={()=>setMargItems(p=>p.filter((_,i)=>i!==idx))} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #dc3545",background:"rgba(220,53,69,0.12)",color:"#dc3545",fontSize:11,fontWeight:700,cursor:"pointer"}}>✕</button>
                </div>
              ))
            }
          </div>
          <div style={{padding:"14px 16px",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",gap:10}}>
            <button onClick={()=>{setShowMargSection(false);setShowMargPOS(true)}} style={{flex:1,padding:"12px 0",borderRadius:10,border:"2px solid #6f42c1",background:"rgba(111,66,193,0.12)",color:"#6f42c1",fontSize:13,fontWeight:800,cursor:"pointer"}}>+ Aggiungi prodotto</button>
            {margItems.length>0&&<button onClick={()=>setShowCart(true)} style={{flex:1,padding:"12px 0",borderRadius:10,border:"none",background:"linear-gradient(135deg,#6f42c1,#9b59b6)",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>🛒 Vai al carrello</button>}
          </div>
        </div>
      </div>}

{showAna&&showStep4&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:20,marginTop:8,gap:10}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>setShowStep4(false)} style={{padding:"11px 20px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.02)",color:"#8892b0",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>← Indietro</button>
          <button onClick={()=>setConfirmReset(true)} style={{padding:"11px 22px",borderRadius:10,border:"2px solid #dc3545",background:"rgba(255,255,255,0.02)",color:"#dc3545",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>🗑️ Reset form</button>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {brand&&<button onClick={()=>{addCart();}} disabled={blockSaveAll} title={blockSaveAll?(hasIncomplete?"Completa tutti i prodotti (stato Incompleto) prima di salvare":(hasDupPodPdr?"POD/PDR duplicato — correggi prima di salvare":(hasDupCodContr?"Codice contratto duplicato — correggi prima di salvare":"Numero/ICCID non valido — correggi prima di salvare"))):""} style={{padding:"11px 22px",borderRadius:10,border:"2px solid "+(blockSaveAll?"rgba(255,255,255,0.1)":"#28a745"),background:blockSaveAll?"rgba(255,255,255,0.03)":"rgba(40,167,69,0.12)",color:blockSaveAll?"#64748b":"#28a745",fontSize:13,fontWeight:800,cursor:blockSaveAll?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:8}}>📦 Salva brand</button>}
          <button onClick={()=>setShowCart(true)} style={{padding:"11px 26px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#1e293b,#0f3460)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>🛒 Riepilogo carrello{tCI>0&&<span style={{background:"#FFD800",color:"#f8fafc",borderRadius:10,padding:"1px 8px",fontSize:12,fontWeight:800}}>{tCI}</span>}</button>
        </div>
      </div>}

      {/* ── CONFIRM RESET POPUP ──────────────────────────────────────────── */}
      {confirmReset&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)setConfirmReset(false)}}>
          <div style={{background:"rgba(255,255,255,0.02)",borderRadius:16,padding:"28px 30px",width:"min(420px,92vw)",boxShadow:"0 18px 50px rgba(0,0,0,.3)",textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:10}}>⚠️</div>
            <div style={{fontSize:17,fontWeight:800,color:"#f8fafc",marginBottom:6}}>Reset del form</div>
            <div style={{fontSize:14,color:"#8892b0",marginBottom:22,lineHeight:1.5}}>Sei sicuro di voler procedere?<br/>Tutti i dati non salvati andranno persi.</div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={()=>setConfirmReset(false)} style={{padding:"11px 28px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.02)",color:"#8892b0",fontSize:14,fontWeight:700,cursor:"pointer"}}>No</button>
              <button onClick={fullReset} style={{padding:"11px 28px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#dc3545,#b02a37)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>Sì, resetta</button>
            </div>
          </div>
        </div>
      )}

      {/* ── VF QTY MODAL OVERLAY ─────────────────────────────────────────── */}
      {vfQtyModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)setVfQtyModal(null)}}>
          <style>{`@keyframes vfModalIn{from{opacity:0;transform:translateY(48px) scale(0.93)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
          <div style={{background:"rgba(255,255,255,0.02)",borderRadius:20,padding:32,width:360,boxShadow:"0 24px 80px rgba(0,0,0,0.35)",animation:"vfModalIn .28s cubic-bezier(.22,1,.36,1) both",textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:8}}>📱</div>
            <div style={{fontSize:18,fontWeight:800,color:"#f8fafc",marginBottom:4}}>Quante SIM hai venduto?</div>
            <div style={{fontSize:13,fontWeight:600,color:"#E60000",background:"rgba(220,53,69,0.12)",borderRadius:8,padding:"6px 16px",display:"inline-block",marginBottom:24}}>{vfQtyModal.offer}</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:20,marginBottom:28}}>
              <button onClick={()=>setVfQtyModal(p=>({...p,tempQty:Math.max(1,p.tempQty-1)}))} style={{width:52,height:52,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.03)",fontSize:26,fontWeight:700,cursor:"pointer",color:"#8892b0",lineHeight:"1",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:52,fontWeight:900,color:"#E60000",lineHeight:1}}>{vfQtyModal.tempQty}</div>
                <div style={{fontSize:11,color:"#64748b",marginTop:2}}>SIM</div>
              </div>
              <button onClick={()=>setVfQtyModal(p=>({...p,tempQty:Math.min(9,p.tempQty+1)}))} style={{width:52,height:52,borderRadius:"50%",border:"2px solid #E60000",background:"#E60000",fontSize:26,fontWeight:700,cursor:"pointer",color:"#fff",lineHeight:"1",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={()=>setVfQtyModal(null)} style={{padding:"11px 28px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.03)",color:"#8892b0",fontSize:13,fontWeight:600,cursor:"pointer"}}>Annulla</button>
              {vfQtyModal&&vfQtyModal.tempQty>0&&((sales[vfQtyModal.catId]||[{}])[vfQtyModal.si]||{})[vfQtyModal.subId]&&((((sales[vfQtyModal.catId]||[{}])[vfQtyModal.si]||{})[vfQtyModal.subId]||{}).vfOffers||{})[vfQtyModal.offer]>0&&<button onClick={()=>{if(!vfQtyModal)return;const{catId,si,subId,offer}=vfQtyModal;const cur=((sales[catId]||[{}])[si]||{})[subId];const newVfO={...((cur&&cur.vfOffers)||{})};delete newVfO[offer];const newVfC={...((cur&&cur.vfContratti)||{})};delete newVfC[offer];uP(catId,si,subId,"vfOffers",newVfO);uP(catId,si,subId,"vfContratti",newVfC);setVfQtyModal(null);}} style={{padding:"11px 20px",borderRadius:10,border:"1px solid #dc3545",background:"rgba(255,255,255,0.02)",color:"#dc3545",fontSize:13,fontWeight:600,cursor:"pointer"}}>✕ Rimuovi</button>}
              <button onClick={confirmVFQty} style={{padding:"11px 36px",borderRadius:10,border:"none",background:"#E60000",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 16px rgba(230,0,0,0.35)"}}>Conferma</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
  return <ReqCtx.Provider value={_reqApi}>{formContent}</ReqCtx.Provider>;
}