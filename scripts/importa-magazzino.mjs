#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   IMPORTA UN MAGAZZINO da Suite Mobile (Luca 29/08)

   Gli export sono DUE per negozio e società:
     · disponibilità — un articolo per riga, con quanti pezzi ce ne sono
     · IMEI          — un pezzo per riga, per gli articoli che hanno un seriale

   LA TRAPPOLA, verificata sui file veri: i telefoni stanno in TUTTI E DUE.
   Su Wind3, 73 codici compaiono nella disponibilità (135 pezzi) e ricompaiono
   nel file IMEI con lo stesso identico conteggio. Caricandoli da entrambi si
   raddoppierebbero — 135 telefoni diventerebbero 270.
   Quindi: un articolo che ha un IMEI si carica SOLO come pezzo serializzato;
   la quantità vale per tutto il resto.

   Uso:
     node scripts/importa-magazzino.mjs --negozio "Donna" --azienda T1 \
          --disponibilita "w3.xlsx" --imei "w3 imei.xlsx" [--prova] [--forza]

     T1 = Telefutura S.R.L. (Wind3)  ·  T2 = Telefutura 2 S.R.L. (Multi)
   ═══════════════════════════════════════════════════════════════════════ */
import XLSX from "xlsx";
import pg from "pg";
import { readFileSync } from "fs";

const R="\x1b[31m",G="\x1b[32m",Y="\x1b[33m",C="\x1b[36m",B="\x1b[1m",X="\x1b[0m";
const arg=(n,d=null)=>{const i=process.argv.indexOf("--"+n);return i>0?process.argv[i+1]:d;};
const flag=(n)=>process.argv.includes("--"+n);

const negozio=arg("negozio"), azienda=(arg("azienda")||"").toUpperCase();
const fDisp=arg("disponibilita"), fImei=arg("imei");
if(!negozio||!["T1","T2"].includes(azienda)||(!fDisp&&!fImei)){
  console.log(`${B}Uso:${X} node scripts/importa-magazzino.mjs --negozio "Donna" --azienda T1|T2 \\`);
  console.log(`          --disponibilita <file.xlsx> --imei <file.xlsx> [--prova] [--forza]`);
  console.log(`     T1 = Telefutura S.R.L. (Wind3) · T2 = Telefutura 2 S.R.L. (Multi)\n`);
  process.exit(1);
}

/* I nomi delle colonne cambiano fra un export e l'altro, e l'accento di
   «Disponibilità» arriva rotto dal gestionale («Disponibilit�»): si
   riconoscono per quello che contengono, non per come sono scritti. */
const trova=(cols,...rx)=>cols.find(c=>rx.some(r=>r.test(String(c))))||null;
const num=(v)=>{ if(v==null||v==="")return null;
  const n=parseFloat(String(v).replace(/\s/g,"").replace(/\.(?=\d{3}\b)/g,"").replace(",","."));
  return isFinite(n)?n:null; };
const leggi=(p)=>{const wb=XLSX.readFile(p);return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:null});};

console.log(`\n${B}Destinazione:${X} ${negozio} · ${azienda} (${azienda==="T1"?"Telefutura S.R.L. — Wind3":"Telefutura 2 S.R.L. — Multi"})`);

// ── 1. i pezzi con un seriale ────────────────────────────────────────────
let pezzi=[];
if(fImei){
  const r=leggi(fImei); const c=Object.keys(r[0]||{});
  const cCod=trova(c,/^cod/i), cImei=trova(c,/imei/i), cDes=trova(c,/descr/i),
        cCosto=trova(c,/costo\s*imei/i)||trova(c,/costo\s*ultimo/i)||trova(c,/costo/i),
        cPrezzo=trova(c,/^prezzo/i), cIvaP=trova(c,/iva\s*v/i), cBarP=trova(c,/barcode/i),
        cGrpP=trova(c,/^gruppo/i), cMarP=trova(c,/^marca/i);
  /* NON TUTTI I SERIALI SONO NUMERI. Verificato sul file vero: su 135 pezzi,
     4 hanno un seriale alfanumerico — un Apple Watch («4S44MM»), un iPad
     («DLXTM0FKHND6») e due paia di occhiali Meta. Togliendo le lettere
     diventavano «444» e sparivano dal caricamento: quattro pezzi veri che
     restavano sullo scaffale e fuori dal software. */
  pezzi=r.map(x=>{
    const s=String(x[cImei]??"").trim().toUpperCase().replace(/\s+/g,"");
    const soloCifre=/^\d+$/.test(s);
    return {
      codice:String(x[cCod]??"").trim()||null,
      seriale:s,
      tipo:soloCifre&&s.length===19?"sim":soloCifre&&s.length===15?"imei":"seriale",
      descrizione:String(x[cDes]??"").trim(),
      costo:num(x[cCosto]), prezzo:num(x[cPrezzo]),
      // servono a creare l'articolo se in anagrafica non c'è (vedi sotto)
      iva:cIvaP?String(x[cIvaP]??"").trim():null,
      barcode:cBarP?String(x[cBarP]??"").trim():null,
      gruppo:cGrpP?String(x[cGrpP]??"").trim():null,
      marca:cMarP?String(x[cMarP]??"").trim():null,
    };
  }).filter(x=>x.seriale.length>=5);
  const alfa=pezzi.filter(x=>x.tipo==="seriale").length;
  console.log(`${B}Seriali:${X} ${fImei.split("/").pop()} — ${pezzi.length} pezzi${alfa?` (${alfa} con seriale alfanumerico: orologi, tablet, occhiali)`:""}`);
}

// ── 2. le quantità, TOLTI gli articoli che hanno un seriale ──────────────
const conSeriale=new Set(pezzi.map(p=>p.codice).filter(Boolean));
let quantita=[];
if(fDisp){
  const r=leggi(fDisp); const c=Object.keys(r[0]||{});
  const cCod=trova(c,/^cod/i), cQta=trova(c,/^disponibilit/i,/^disp/i,/giac/i,/^q\.?t[àa]/i),
        cCosto=trova(c,/costo\s*ult/i)||trova(c,/costo/i), cDes=trova(c,/descr/i),
        // servono per creare l'articolo se in anagrafica non c'è (vedi sotto)
        cBar=trova(c,/barcode/i), cIva=trova(c,/iva\s*v/i), cGrp=trova(c,/^gruppo/i),
        cSot=trova(c,/sottogruppo/i), cMar=trova(c,/^marca/i), cPrz=trova(c,/^prezzo/i),
        cArr=trova(c,/^arrivo/i);
  console.log(`${B}Disponibilità:${X} ${fDisp.split("/").pop()} — ${r.length} righe (colonna «${cQta}»)`);
  quantita=r.map(x=>({
    codice:String(x[cCod]??"").trim(),
    quantita:num(x[cQta]), costo:num(x[cCosto]),
    descrizione:String(x[cDes]??"").trim(),
    barcode:cBar?String(x[cBar]??"").trim():null,
    iva:cIva?String(x[cIva]??"").trim():null,
    gruppo:cGrp?String(x[cGrp]??"").trim():null,
    sottogruppo:cSot?String(x[cSot]??"").trim():null,
    marca:cMar?String(x[cMar]??"").trim():null,
    prezzo:cPrz?num(x[cPrz]):null,
    arrivo:cArr?(num(x[cArr])||0):0,
  })).filter(x=>x.codice&&(x.quantita>0||x.arrivo>0));
  const prima=quantita.length;
  quantita=quantita.filter(x=>!conSeriale.has(x.codice));
  if(prima!==quantita.length)
    console.log(`   ${C}${prima-quantita.length} articoli tolti dalle quantità perché hanno i loro IMEI${X} (se no si raddoppiavano)`);
}

// ── 3. i codici devono esistere in anagrafica ────────────────────────────
const env=Object.fromEntries(readFileSync(new URL("../.env.local",import.meta.url),"utf8")
  .split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).trim()]));
const ref=env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)[1];
const db=new pg.Client({host:"aws-1-eu-central-2.pooler.supabase.com",port:5432,database:"postgres",
  user:`postgres.${ref}`,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await db.connect();

const noti=new Set((await db.query("select codice from mag_articoli")).rows.map(r=>String(r.codice).trim()));
const ignotiQ=quantita.filter(x=>!noti.has(x.codice));
const ignotiP=pezzi.filter(x=>x.codice&&!noti.has(x.codice));

/* L'ARTICOLO CHE MANCA SI CREA, NON SI SALTA (Luca 31/08, Magliana Multi).
   Il file di disponibilità porta con sé tutto quello che serve — codice,
   barcode, descrizione, regime IVA, gruppo, marca, prezzo, costo: sono le
   stesse colonne del listino generale. Saltare la riga voleva dire lasciare
   fuori merce vera che sullo scaffale c'è (una batteria Realme da 55 €), e
   con undici negozi da caricare domani non è un caso isolato: è la regola.
   Il reparto si ricava dal regime, come per il listino. */
const REPARTO={"22":2,"4":3,"ART.36":7,"ART.74":1,"EX ART.15":5};
/* ANCHE I PEZZI CON SERIALE CREANO IL LORO ARTICOLO (revisore 31/08).
   Il fix di stamattina valeva solo per il file delle quantità: dal file IMEI
   il pezzo entrava con `codice = null`, e siccome `mag_disponibilita` esige un
   codice, quei telefoni NON contavano come giacenza e non comparivano in
   cassa cercandoli per nome — si vendevano solo sparando l'IMEI.
   A Magliana W3 erano 16 telefoni per 7.798 €: un iPhone 17, quattro Galaxy
   S26 FE, undici Xiaomi. E i codici nel file c'erano tutti. */
const daCreare=[...ignotiQ, ...ignotiP];
for(const a of daCreare){
  // in prova NON si scrive, ma il codice si conta lo stesso: una prova che
  // annuncia numeri diversi da quelli veri non serve a controllare niente
  noti.add(a.codice);
}
if(daCreare.length && !flag("prova")){
  for(const a of daCreare){
    await db.query(`insert into mag_articoli
        (codice,barcode,descrizione,iva_vendita,reparto,gruppo,sottogruppo,marca,prezzo,costo_ultimo,attivo,fonte)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'magazzino-negozio')
      on conflict (codice) do nothing`,
      [a.codice, a.barcode||null, a.descrizione||a.codice, a.iva||null,
       REPARTO[String(a.iva||"").toUpperCase()] ?? null,
       a.gruppo||null, a.sottogruppo||null, a.marca||null, a.prezzo, a.costo]);
  }
}
quantita=quantita.filter(x=>noti.has(x.codice));
// un pezzo con un seriale si carica anche senza codice in anagrafica: il
// seriale lo identifica da solo, e non lasciarlo entrare vorrebbe dire un
// telefono che c'è sullo scaffale ma non nel software
// (l'articolo mancante viene creato qui sotto: il pezzo tiene il suo codice)

console.log(`\n${B}Riepilogo${X}`);
console.log(`   ${G}${pezzi.length}${X} pezzi con seriale (telefoni, modem, usato)`);
console.log(`   ${G}${quantita.length}${X} articoli a quantità — ${quantita.reduce((s,x)=>s+x.quantita,0)} pezzi`);
if(ignotiQ.length){
  console.log(`   ${Y}${ignotiQ.length} codici a quantità non erano in anagrafica: CREATI dal file${X}`);
  ignotiQ.slice(0,6).forEach(x=>console.log(`      · ${x.codice}  ${x.descrizione.slice(0,44)}`));
  if(ignotiQ.length>6) console.log(`      · …e altri ${ignotiQ.length-6}`);
}
if(ignotiP.length) console.log(`   ${Y}${ignotiP.length} pezzi con un codice non in anagrafica: articolo CREATO dal file${X}`);

const gia=(await db.query("select (select count(*) from mag_movimenti where negozio=$1 and azienda=$2 and tipo='carico') m,(select count(*) from mag_unita where negozio=$1 and coalesce(azienda,'T1')=$2) u",[negozio,azienda])).rows[0];
if((Number(gia.m)+Number(gia.u))>0 && !flag("forza")){
  console.log(`\n${R}Per ${negozio}/${azienda} risultano già ${gia.m} carichi e ${gia.u} pezzi.${X}`);
  console.log(`Rifarlo raddoppierebbe tutto. Se è quello che vuoi: --forza\n`);
  process.exit(1);
}
if(flag("prova")){ console.log(`\n${Y}${B}Prova: non ho scritto niente.${X}\n`); await db.end(); process.exit(0); }

await db.query("begin");
try{
  const conPezzi=quantita.filter(x=>x.quantita>0);
  for(let i=0;i<conPezzi.length;i+=200){
    const l=conPezzi.slice(i,i+200); const v=[],p=[];
    l.forEach((x,k)=>{const b=k*6; v.push(`($${b+1},$${b+2},$${b+3},'carico',$${b+4},$${b+5},$${b+6})`);
      p.push(x.codice,negozio,azienda,x.quantita,x.costo,`import ${(fDisp||"").split("/").pop()}`);});
    await db.query(`insert into mag_movimenti (codice,negozio,azienda,tipo,quantita,costo_unitario,nota) values ${v.join(",")}`,p);
  }
  for(let i=0;i<pezzi.length;i+=200){
    const l=pezzi.slice(i,i+200); const v=[],p=[];
    l.forEach((x,k)=>{const b=k*8; v.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},'disponibile',$${b+6},$${b+7},$${b+8})`);
      p.push(x.seriale,x.tipo,x.codice,x.descrizione||x.codice||x.seriale,negozio,azienda,x.prezzo,"importazione Suite Mobile");});
    await db.query(`insert into mag_unita (seriale,tipo_seriale,codice,descrizione,negozio,stato,azienda,valore,caricato_da) values ${v.join(",")}
                    on conflict do nothing`,p);
  }
  /* LA MERCE IN ARRIVO (Luca 31/08). Lo script non leggeva affatto la colonna
     «Arrivo»: i 96 pezzi in arrivo di Donna li avevo caricati a mano il 29,
     e ogni import successivo li avrebbe persi in silenzio — a Magliana Multi
     un display su cui il negozio conta.
     Va in una colonna SUA, mai sommata alla giacenza: non si vende quello che
     sullo scaffale non c'è ancora. Ma sapere che sta arrivando serve, se non
     altro per non riordinarlo due volte. */
  const inArrivo=quantita.filter(x=>x.arrivo>0);
  for(const x of inArrivo){
    await db.query(`insert into mag_giacenze (codice,negozio,azienda,quantita,in_arrivo)
      values ($1,$2,$3,0,$4)
      on conflict (codice,negozio,azienda) do update set in_arrivo = excluded.in_arrivo`,
      [x.codice,negozio,azienda,x.arrivo]);
  }
  await db.query("commit");
}catch(e){ await db.query("rollback"); console.log(`\n${R}ANNULLATO: ${e.message}${X}\n`); process.exit(1); }

const d=(await db.query("select coalesce(sum(quantita),0) pezzi, count(*) articoli from mag_disponibilita where negozio=$1 and azienda=$2",[negozio,azienda])).rows[0];
const arr=(await db.query("select coalesce(sum(in_arrivo),0) a from mag_giacenze where negozio=$1 and azienda=$2",[negozio,azienda])).rows[0].a;
console.log(`\n${G}${B}✓ Caricato.${X} ${negozio}/${azienda}: ${d.articoli} articoli, ${d.pezzi} pezzi${Number(arr)>0?`, ${arr} in arrivo`:""}.\n`);
await db.end();
