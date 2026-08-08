const fs=require("fs"),path=require("path");
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,".env.local"),"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const ref=(env.NEXT_PUBLIC_SUPABASE_URL||"").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const {Client}=require("pg");
const client=new Client({host:"aws-1-eu-central-2.pooler.supabase.com",port:5432,database:"postgres",user:`postgres.${ref}`,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
(async()=>{await client.connect();
const sql=fs.readFileSync(path.join(__dirname,"supabase/migrations","20260808160000_realtime_comunicazioni_ricevute.sql"),"utf8");
await client.query("begin");try{await client.query(sql);await client.query("commit");}catch(e){await client.query("rollback");throw e;}
console.log("APPLICATA: 196");
const {rows}=await client.query(`select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('comunicazioni','comunicazioni_ricevute') order by tablename`);
console.log("  in publication:",rows.map(r=>r.tablename).join(", "));
await client.end();})().catch(e=>{console.error("ERRORE:",e.message);process.exit(1);});
