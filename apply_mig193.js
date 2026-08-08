const fs=require("fs"),path=require("path");
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,".env.local"),"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const ref=(env.NEXT_PUBLIC_SUPABASE_URL||"").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const {Client}=require("pg");
const client=new Client({host:"aws-1-eu-central-2.pooler.supabase.com",port:5432,database:"postgres",user:`postgres.${ref}`,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
(async()=>{await client.connect();
const sql=fs.readFileSync(path.join(__dirname,"supabase/migrations","20260808130000_esito_attivato_diverso_negozio.sql"),"utf8");
await client.query("begin");try{await client.query(sql);await client.query("commit");}catch(e){await client.query("rollback");throw e;}
console.log("APPLICATA: 193");
const {rows}=await client.query(`select tipo,chiave,etichetta from calendario_esiti where chiave='attivato_diverso_negozio' order by tipo`);
rows.forEach(r=>console.log("  "+r.tipo+" · "+r.etichetta));
await client.end();})().catch(e=>{console.error("ERRORE:",e.message);process.exit(1);});
