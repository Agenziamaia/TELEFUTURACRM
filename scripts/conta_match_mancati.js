/* SOLA LETTURA — quanti appuntamenti NON sono stati collegati alla loro vendita
   perché il match scatta solo dal lato vendita: se il caller crea/aggiorna
   l'appuntamento DOPO che il negozio ha registrato la vendita, nessuno lo
   rilancia e il collegamento non avviene mai. */
const fs=require("fs"); const {Client}=require("pg");
const pw=fs.readFileSync(".env.local","utf8").match(/SUPABASE_DB_PASSWORD=(.+)/)[1].trim();
(async()=>{
 const c=new Client({host:"aws-1-eu-central-2.pooler.supabase.com",port:5432,
  user:"postgres.akawmrqvdtufqkaaiivv",password:pw,database:"postgres",ssl:{rejectUnauthorized:false}});
 await c.connect();
 const cols=await c.query("select column_name from information_schema.columns where table_name='clients'");
 console.log("colonne clients:", cols.rows.map(x=>x.column_name).join(", "), "\n");

 const fin = await c.query("select finestra_giorni from caller_match_config where id=1").catch(()=>({rows:[]}));
 const gg = Number(fin.rows?.[0]?.finestra_giorni) || 30;
 console.log(`finestra configurata: ${gg} giorni\n`);

 const r = await c.query(`
   with app as (
     select a.id, a.date, a.store, a.status, a.created_at, upper(trim(a.cf_piva)) cf, a.customer_name
     from appointments a
     where a.type is distinct from 'richiamo' and coalesce(a.cf_piva,'') <> ''
       and a.status not in ('attivato','attivato_diverso_negozio')
   ), ven as (
     select k.id, k.data, k.negozio, k.created_at, k.appointment_id,
            upper(substring(k.client_id from 'CL-([A-Z0-9]+)-')) cf
     from contracts k
     where k.id like 'CTR-%' and coalesce(k.non_valida,false)=false
       and coalesce(k.nascosta_gestione,false)=false
       and coalesce(k.client_id,'') like 'CL-%'
   )
   select app.id appt, app.date, app.store, app.status, app.customer_name,
          ven.id vendita, ven.data vdata, ven.negozio vneg, ven.appointment_id,
          (ven.created_at < app.created_at) as vendita_prima
   from app join ven on ven.cf = app.cf
   where ven.appointment_id is null
     and ven.data::date between (app.created_at::date) - 1 and (app.date::date + ($1)::int)
   order by ven.created_at desc`, [gg]);

 console.log(`═══ APPUNTAMENTI CON UNA VENDITA NON COLLEGATA: ${r.rows.length} ═══\n`);
 const prima = r.rows.filter(x=>x.vendita_prima), dopo = r.rows.filter(x=>!x.vendita_prima);
 console.log(`   ⚠️ vendita registrata PRIMA che l'appuntamento esistesse: ${prima.length}  ← il ponte a senso unico`);
 console.log(`      vendita registrata dopo (altra causa)               : ${dopo.length}\n`);
 const mostra=(l,t)=>{console.log(`── ${t}`); l.slice(0,20).forEach(x=>console.log(
   `   appt ${String(x.appt).padEnd(5)} ${x.date} ${String(x.store||"—").padEnd(12)} ${String(x.status).padEnd(12)} | vendita ${x.vendita} ${x.vdata} ${String(x.vneg).padEnd(12)} ${String(x.customer_name||"").slice(0,26)}`));
   if(l.length>20) console.log(`   … e altri ${l.length-20}`);};
 mostra(prima,"VENDITA PRIMA DELL'APPUNTAMENTO");
 console.log("");
 mostra(dopo,"vendita dopo l'appuntamento");
 await c.end();
})().catch(e=>{console.error("ERR:",e.message);process.exit(1);});
