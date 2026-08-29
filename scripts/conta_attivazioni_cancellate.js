/* SOLA LETTURA — quante attivazioni sono state cancellate da un esito negozio?
   Il match vendita↔appuntamento porta la pratica ad «Attivato». Se DOPO qualcuno
   mette un esito («No Show», «KO», «Annullato») dal calendario, lo stato viene
   sovrascritto e l'attivazione sparisce — anche se la vendita c'è ed è collegata. */
const fs=require("fs"); const {Client}=require("pg");
const pw=fs.readFileSync(".env.local","utf8").match(/SUPABASE_DB_PASSWORD=(.+)/)[1].trim();
(async()=>{
 const c=new Client({host:"aws-1-eu-central-2.pooler.supabase.com",port:5432,
  user:"postgres.akawmrqvdtufqkaaiivv",password:pw,database:"postgres",ssl:{rejectUnauthorized:false}});
 await c.connect();
 const r = await c.query(`
   select id, nome, cognome, cf, stato, appointment_id, contract_id, storico
   from calls
   where exists (select 1 from jsonb_array_elements(coalesce(storico,'[]'::jsonb)) v
                 where lower(coalesce(v->>'campo','')) in ('esito negozio')
                   and v->>'da' ilike 'Attivat%')`);
 console.log(`\n═══ PRATICHE dove un ESITO NEGOZIO ha scavalcato un «Attivato»: ${r.rows.length} ═══\n`);
 const conVendita = [], senzaVendita = [];
 for (const p of r.rows) {
   const st = Array.isArray(p.storico)?p.storico:[];
   const salto = st.filter(v => String(v.campo||"").toLowerCase()==="esito negozio" && /^attivat/i.test(String(v.da||"")))
     .sort((a,b)=>String(a.data||"").localeCompare(String(b.data||"")))[0];
   const attivataDopo = /^attivat/i.test(String(p.stato||""));
   const riga = { ...p, salto, attivataDopo };
   (p.contract_id ? conVendita : senzaVendita).push(riga);
 }
 const mostra = (lista, titolo) => {
   console.log(`── ${titolo}: ${lista.length}`);
   lista.forEach(x => console.log(
     `   ${String(x.salto?.data||"").slice(0,16)}  ${String(x.salto?.da).padEnd(22)} → ${String(x.salto?.a||"").padEnd(22)}` +
     ` ora: ${String(x.stato).padEnd(22)} vendita: ${String(x.contract_id||"—").padEnd(14)} ${String(x.nome||"")} ${String(x.cognome||"")}`));
 };
 mostra(conVendita, "CON una vendita collegata (l'attivazione era vera)");
 mostra(senzaVendita, "senza vendita collegata");
 console.log(`\n   → da riparare (vendita collegata e stato non più attivato): ${conVendita.filter(x=>!x.attivataDopo).length}`);
 await c.end();
})().catch(e=>{console.error("ERR:",e.message);process.exit(1);});
