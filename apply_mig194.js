const fs=require("fs"),path=require("path");
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,".env.local"),"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const ref=(env.NEXT_PUBLIC_SUPABASE_URL||"").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const {Client}=require("pg");
const client=new Client({host:"aws-1-eu-central-2.pooler.supabase.com",port:5432,database:"postgres",user:`postgres.${ref}`,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
(async()=>{await client.connect();
const sql=fs.readFileSync(path.join(__dirname,"supabase/migrations","20260808140000_sicurezza_cerotto1.sql"),"utf8");
await client.query("begin");try{await client.query(sql);await client.query("commit");}catch(e){await client.query("rollback");throw e;}
console.log("APPLICATA: 194 (cerotto sicurezza 1.1)");
const {rows:t}=await client.query(`select count(*)::int n from information_schema.role_table_grants where grantee in ('anon','authenticated') and privilege_type='TRUNCATE' and table_schema='public'`);
console.log("  grant TRUNCATE anon/authenticated ora:",t[0].n,"(atteso 0)");
const {rows:f}=await client.query(`select has_function_privilege('anon','public.rls_auto_enable()','execute') as anon_exec`);
console.log("  anon puo' eseguire rls_auto_enable:",f[0].anon_exec,"(atteso false)");
await client.end();})().catch(e=>{console.error("ERRORE:",e.message);process.exit(1);});
