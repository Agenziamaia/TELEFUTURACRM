#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   IMPORTA UN MAGAZZINO da un export di Suite Mobile (Luca 29/08)

   «Il magazzino Wind3 è legato a Telefutura SRL, il magazzino Multi è legato
    a Telefutura 2 SRL.»  Nel CRM: T1 e T2.

   Uso:
     node scripts/importa-magazzino.mjs <file.xlsx> --negozio "Donna" --azienda T2
     …aggiungere --prova per vedere cosa farebbe SENZA scrivere niente.

   Cosa fa, in quest'ordine:
     1. legge il foglio e riconosce da solo le colonne (i nomi cambiano fra un
        export e l'altro: «Codice», «Cod. Art.», «Articolo»…)
     2. NON inventa articoli: se un codice non esiste in mag_articoli lo dice e
        lo salta — un magazzino con articoli fantasma è peggio di uno vuoto
     3. scrive un movimento di CARICO per riga: la giacenza si muove da sé, e
        resta la storia di come ci è arrivata
     4. non ricarica due volte lo stesso file: se per quel negozio+società
        esistono già dei carichi, si ferma e lo dice (serve --forza per farlo
        davvero)
   ═══════════════════════════════════════════════════════════════════════ */
import XLSX from "xlsx";
import pg from "pg";
import { readFileSync } from "fs";

const R="\x1b[31m",G="\x1b[32m",Y="\x1b[33m",B="\x1b[1m",X="\x1b[0m";
const arg=(n,d=null)=>{const i=process.argv.indexOf("--"+n);return i>0?process.argv[i+1]:d;};
const flag=(n)=>process.argv.includes("--"+n);

const file=process.argv[2];
const negozio=arg("negozio");
const azienda=(arg("azienda")||"").toUpperCase();
if(!file||!negozio||!["T1","T2"].includes(azienda)){
  console.log(`${B}Uso:${X} node scripts/importa-magazzino.mjs <file.xlsx> --negozio "Donna" --azienda T1|T2 [--prova] [--forza]`);
  console.log(`     T1 = Telefutura S.R.L. (magazzino Wind3) · T2 = Telefutura 2 S.R.L. (magazzino Multi)`);
  process.exit(1);
}

/* I NOMI DELLE COLONNE cambiano da un export all'altro: si riconoscono per
   quello che contengono, non per una posizione fissa. */
const CANDIDATI={
  codice:[/^cod/i,/articolo/i,/^art/i],
  barcode:[/barcode/i,/ean/i],
  descrizione:[/descr/i,/nome/i],
  quantita:[/giac/i,/^q\.?t[àa]/i,/quantit/i,/^disp/i,/pezzi/i],
  costo:[/costo/i,/acquist/i],
  prezzo:[/prezzo/i,/vendita/i,/listino/i],
  seriale:[/imei/i,/serial/i,/iccid/i],
};
function mappa(colonne){
  const m={};
  for(const [campo,regexi] of Object.entries(CANDIDATI)){
    m[campo]=colonne.find(c=>regexi.some(rx=>rx.test(String(c))))||null;
  }
  return m;
}
const num=(v)=>{
  if(v==null||v==="")return null;
  const n=parseFloat(String(v).replace(/\s/g,"").replace(/\.(?=\d{3}\b)/g,"").replace(",","."));
  return isFinite(n)?n:null;
};

const wb=XLSX.readFile(file);
const foglio=wb.SheetNames[0];
const righe=XLSX.utils.sheet_to_json(wb.Sheets[foglio],{defval:null});
if(!righe.length){ console.log(`${R}Il foglio «${foglio}» è vuoto.${X}`); process.exit(1); }
const col=mappa(Object.keys(righe[0]));

console.log(`\n${B}File:${X} ${file}`);
console.log(`${B}Foglio:${X} ${foglio} — ${righe.length} righe`);
console.log(`${B}Destinazione:${X} ${negozio} · ${azienda} (${azienda==="T1"?"Telefutura S.R.L. — Wind3":"Telefutura 2 S.R.L. — Multi"})`);
console.log(`${B}Colonne riconosciute:${X}`);
Object.entries(col).forEach(([k,v])=>console.log(`   ${k.padEnd(12)} ${v?G+v+X:Y+"non trovata"+X}`));
if(!col.codice){ console.log(`\n${R}Senza una colonna di CODICE non si può importare niente.${X}`); process.exit(1); }
if(!col.quantita) console.log(`\n${Y}Nessuna colonna di giacenza: ogni riga varrà 1 pezzo.${X}`);

const env=Object.fromEntries(readFileSync(new URL("../.env.local",import.meta.url),"utf8")
  .split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).trim()]));
const ref=env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)[1];
const db=new pg.Client({host:"aws-1-eu-central-2.pooler.supabase.com",port:5432,database:"postgres",
  user:`postgres.${ref}`,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await db.connect();

const gia=(await db.query("select count(*) n from mag_movimenti where negozio=$1 and azienda=$2 and tipo='carico'",[negozio,azienda])).rows[0].n;
if(Number(gia)>0 && !flag("forza")){
  console.log(`\n${R}Per ${negozio}/${azienda} risultano già ${gia} carichi.${X}`);
  console.log(`Rifarlo raddoppierebbe le giacenze. Se è quello che vuoi: --forza\n`);
  process.exit(1);
}

const noti=new Set((await db.query("select codice from mag_articoli")).rows.map(r=>String(r.codice).trim()));
const daFare=[]; const ignoti=[]; const senzaQta=[];
for(const r of righe){
  const codice=String(r[col.codice]??"").trim();
  if(!codice)continue;
  const q=col.quantita?num(r[col.quantita]):1;
  if(!noti.has(codice)){ ignoti.push({codice,descr:String(r[col.descrizione]??"").slice(0,42)}); continue; }
  if(q==null||q<=0){ senzaQta.push(codice); continue; }
  daFare.push({codice,quantita:q,costo:col.costo?num(r[col.costo]):null,seriale:col.seriale?String(r[col.seriale]??"").trim()||null:null});
}

console.log(`\n${B}Riepilogo${X}`);
console.log(`   ${G}${daFare.length}${X} righe da caricare — ${daFare.reduce((s,x)=>s+x.quantita,0)} pezzi in tutto`);
if(senzaQta.length) console.log(`   ${Y}${senzaQta.length}${X} righe con giacenza zero o assente: saltate`);
if(ignoti.length){
  console.log(`   ${R}${ignoti.length}${X} codici NON presenti in anagrafica: saltati (un magazzino con articoli fantasma è peggio di uno vuoto)`);
  ignoti.slice(0,8).forEach(x=>console.log(`      · ${x.codice}  ${x.descr}`));
  if(ignoti.length>8) console.log(`      · …e altri ${ignoti.length-8}`);
}

if(flag("prova")){ console.log(`\n${Y}${B}Prova: non ho scritto niente.${X}\n`); await db.end(); process.exit(0); }
if(!daFare.length){ console.log(`\n${R}Niente da caricare.${X}\n`); await db.end(); process.exit(1); }

await db.query("begin");
try{
  for(let i=0;i<daFare.length;i+=200){
    const lotto=daFare.slice(i,i+200);
    const val=[]; const par=[];
    lotto.forEach((x,k)=>{ const b=k*6;
      val.push(`($${b+1},$${b+2},$${b+3},'carico',$${b+4},$${b+5},$${b+6})`);
      par.push(x.codice,negozio,azienda,x.quantita,x.costo,`importazione ${file.split("/").pop()}`);
    });
    await db.query(`insert into mag_movimenti (codice,negozio,azienda,tipo,quantita,costo_unitario,nota) values ${val.join(",")}`,par);
  }
  await db.query("commit");
}catch(e){ await db.query("rollback"); console.log(`\n${R}ANNULLATO: ${e.message}${X}\n`); process.exit(1); }

const dopo=(await db.query("select count(*) articoli, sum(quantita) pezzi from mag_giacenze where negozio=$1 and azienda=$2",[negozio,azienda])).rows[0];
console.log(`\n${G}${B}✓ Caricato.${X} ${negozio}/${azienda} ha ora ${dopo.articoli} articoli per ${dopo.pezzi} pezzi.\n`);
await db.end();
