const fs=require("fs"),path=require("path");
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,".env.local"),"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const ref=(env.NEXT_PUBLIC_SUPABASE_URL||"").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const {Client}=require("pg");
const client=new Client({host:"aws-1-eu-central-2.pooler.supabase.com",port:5432,database:"postgres",user:`postgres.${ref}`,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
(async()=>{await client.connect();
const sql=fs.readFileSync(path.join(__dirname,"supabase/migrations","20260808150000_kipoint_click_and_collect.sql"),"utf8");
await client.query("begin");try{await client.query(sql);await client.query("commit");}catch(e){await client.query("rollback");throw e;}
console.log("APPLICATA: 195");
const {rows}=await client.query(`select p.nome prod, o.nome off from catalog_prodotti p join catalog_offerte o on o.prodotto_id=p.id join catalog_categorie c on c.id=p.categoria_id where c.nome='Click and Collect' and p.brand_id='kipoint' order by p.nome,o.ordine`);
rows.forEach(r=>console.log("  "+r.prod+" → "+r.off));
const {rows:reg}=await client.query(`select etichetta,campi from catalog_campi_regole where etichetta='Kipoint — Click and Collect'`);
console.log("  regola:",JSON.stringify(reg));
await client.end();})().catch(e=>{console.error("ERRORE:",e.message);process.exit(1);});
