const fs=require("fs"),path=require("path");
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,".env.local"),"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const ref=(env.NEXT_PUBLIC_SUPABASE_URL||"").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const {Client}=require("/Users/macbookl/Developer/TELEFUTURACRM-FW/node_modules/pg");
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{ const sql=process.argv[2];
 for(let t=1;t<=8;t++){
  const c=new Client({host:"aws-1-eu-central-2.pooler.supabase.com",port:5432,database:"postgres",user:`postgres.${ref}`,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
  try{ await c.connect(); const r=await c.query(sql); (Array.isArray(r)?r:[r]).forEach(x=>{if(x.rows)console.log(JSON.stringify(x.rows,null,1));}); await c.end(); return; }
  catch(e){ try{await c.end();}catch{} if(/ECHECKOUT|authentication did not|Connection terminated/.test(e.message)&&t<8){await sleep(3000*t);continue;} console.error("ERRORE:",e.message); return; }
 }})();
