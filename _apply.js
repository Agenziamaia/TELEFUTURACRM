const fs=require("fs"),path=require("path");
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,".env.local"),"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const ref=(env.NEXT_PUBLIC_SUPABASE_URL||"").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const {Client}=require("/Users/macbookl/Developer/TELEFUTURACRM-FW/node_modules/pg");
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const f=process.argv[2];
 for(let t=1;t<=8;t++){
  const c=new Client({host:"aws-1-eu-central-2.pooler.supabase.com",port:5432,database:"postgres",user:`postgres.${ref}`,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
  try{ await c.connect();
   const sql=fs.readFileSync(path.join(__dirname,"supabase/migrations",f),"utf8");
   await c.query("begin");
   try{ const r=await c.query(sql); await c.query("commit");
     const rs=Array.isArray(r)?r:[r]; console.log("APPLICATA:",f, rs.map(x=>x.command+":"+(x.rowCount??0)).join(" · "));
   }catch(e){ await c.query("rollback"); console.error("ERRORE:",e.message); }
   await c.end(); return;
  }catch(e){ try{await c.end();}catch{} if(/ECHECKOUT|authentication did not complete|Connection terminated/.test(e.message)&&t<8){await sleep(3000*t);continue;} console.error("ERRORE:",e.message); return; }
 }
})();
