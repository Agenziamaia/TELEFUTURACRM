/* RIPARAZIONE DELLE ATTIVAZIONI PERSE (Luca 29/08) — a vuoto senza --scrivi.
   Due difetti diversi, stesso effetto: un cliente che ha comprato non risulta
   convertito, e in un caso il caller si e' preso un malus per colpa nostra.

   A) L'ESITO CHE CANCELLA — il match attiva, poi un esito «No Show» dal
      calendario sovrascrive lo stato. Si ripristina «Attivato».
   B) IL PONTE A SENSO UNICO — il match scatta solo alla registrazione della
      vendita: se l'appuntamento nasce DOPO, non lo collega mai. Si collega
      adesso, si attiva, e cade il malus.

   ⚠️ Non tocca le pratiche dove una PERSONA ha deciso lo stato dopo il guasto.
   ⚠️ Salva la fotografia del prima. Ogni modifica lascia la sua riga nello storico. */
const fs=require("fs"); const {Client}=require("pg");
const pw=fs.readFileSync(".env.local","utf8").match(/SUPABASE_DB_PASSWORD=(.+)/)[1].trim();
const SCRIVI=process.argv.includes("--scrivi");
const FIRMA="correzione automatica 29/08 (attivazioni perse)";

(async()=>{
 const c=new Client({host:"aws-1-eu-central-2.pooler.supabase.com",port:5432,
  user:"postgres.akawmrqvdtufqkaaiivv",password:pw,database:"postgres",ssl:{rejectUnauthorized:false}});
 await c.connect();
 const azioni=[];

 // ── A) attivazioni cancellate da un esito ────────────────────────────────
 const a=await c.query(`select id,nome,cognome,stato,appointment_id,contract_id,storico from calls
   where contract_id is not null and stato !~* '^attivat'
     and exists (select 1 from jsonb_array_elements(coalesce(storico,'[]'::jsonb)) v
                 where lower(coalesce(v->>'campo',''))='esito negozio' and v->>'da' ilike 'Attivat%')`);
 for (const p of a.rows) {
   const st=Array.isArray(p.storico)?p.storico:[];
   const salto=st.filter(v=>String(v.campo||"").toLowerCase()==="esito negozio" && /^attivat/i.test(String(v.da||"")))
     .sort((x,y)=>String(x.data||"").localeCompare(String(y.data||"")))[0];
   const umanoDopo=st.some(v=>String(v.campo||"").toLowerCase()==="stato" && v.caller
     && !/^(automatico|correzione)/i.test(String(v.caller)) && String(v.data||"")>String(salto?.data||""));
   if (umanoDopo) continue;
   azioni.push({ tipo:"A", callId:p.id, chi:`${p.nome} ${p.cognome}`, da:p.stato, a:salto.da,
     apptId:p.appointment_id, perche:"attivazione cancellata da un esito negozio" });
 }

 // ── B) vendite mai collegate al loro appuntamento ────────────────────────
 const gg=Number((await c.query("select finestra_giorni from caller_match_config where id=1").catch(()=>({rows:[]}))).rows?.[0]?.finestra_giorni)||30;
 // gli stati «definitivi» li dice il database, non una lista scritta qui
 const definitivi=new Set((await c.query("select voce from caller_opzioni where categoria='stato' and comportamento='definitivo'")).rows.map(r=>r.voce));
 const b=await c.query(`
   with app as (select a.id,a.date,a.store,a.status,a.created_at,upper(trim(a.cf_piva)) cf,a.customer_name
                from appointments a
                where a.type is distinct from 'richiamo' and coalesce(a.cf_piva,'')<>''
                  and a.status not in ('attivato','attivato_diverso_negozio')),
        ven as (select k.id,k.data,k.negozio,k.created_at,upper(substring(k.client_id from 'CL-([A-Z0-9]+)-')) cf
                from contracts k
                where k.id like 'CTR-%' and coalesce(k.non_valida,false)=false
                  and coalesce(k.nascosta_gestione,false)=false and k.appointment_id is null
                  and coalesce(k.client_id,'') like 'CL-%')
   select app.id appt, app.date, app.store, app.customer_name, app.cf,
          array_agg(ven.id) vendite, min(ven.negozio) vneg
   from app join ven on ven.cf=app.cf
   /* ⚠️ LA STESSA FINESTRA DELLA REGOLA VERA, senza tolleranze.
      Avevo messo «-1 giorno» di margine: ha agganciato l'appuntamento 1059
      (Beltrame) che matchAppuntamento avrebbe RIFIUTATO — un appuntamento non
      ancora avvenuto, con una vendita di un altro prodotto chiusa prima che la
      caller contattasse il cliente. Annullato a mano il 29/08.
      La regola live (matchAppuntamento.ts): la vendita deve stare fra la data
      della CHIAMATA (created_at dell'appuntamento) e +N giorni dalla data
      fissata — «il cliente in anticipo conta, prima della chiamata no». */
   where ven.data::date between (app.created_at::date) and (app.date::date+($1)::int)
   group by 1,2,3,4,5`,[gg]);
 for (const r of b.rows) {
   const p=await c.query("select id,nome,cognome,stato,storico from calls where appointment_id=$1",[r.appt]);
   /* ⚠️ DUE MOTIVI PER NON TOCCARE (visti nella prova a vuoto, caso Popescu):
      1. il match AVEVA gia' funzionato — nello storico c'e' un passaggio ad
         «Attivato*»: quello che manca e' solo il collegamento del contratto,
         che per le vendite in ALTRO negozio il progetto non fa apposta;
      2. dopo il guasto una PERSONA ha deciso lo stato: la sua decisione e' piu'
         recente e meglio informata di questa ricostruzione. */
   const motivoSalto = (() => {
     for (const x of p.rows) {
       const st = Array.isArray(x.storico) ? x.storico : [];
       // il match AVEVA gia' funzionato: quello che manca e' solo il
       // collegamento del contratto, che per le vendite in ALTRO negozio il
       // progetto non fa apposta. Non e' il nostro difetto.
       if (st.some(v => /^attivat/i.test(String(v.a||"")))) return "il match aveva gia' funzionato";
       // una persona ha chiuso la pratica con un definitivo: la sua decisione
       // e' piu' informata di questa ricostruzione
       if (definitivi.has(String(x.stato||""))) return `chiusa a mano come «${x.stato}»`;
     }
     return null;
   })();
   if (motivoSalto) { console.log(`   ⏭️  appt ${r.appt} ${r.customer_name}: ${motivoSalto}`); continue; }
   azioni.push({ tipo:"B", apptId:r.appt, chi:r.customer_name, vendite:r.vendite,
     stessoNegozio:String(r.store||"").split(" ")[0].toLowerCase()===String(r.vneg||"").split(" ")[0].toLowerCase(),
     negozioApp:r.store, negozioVendita:r.vneg,
     pratiche:p.rows.map(x=>({id:x.id, stato:x.stato, chi:`${x.nome} ${x.cognome}`})) });
 }

 // ── malus in ballo su queste pratiche ────────────────────────────────────
 const callIds=[...azioni.filter(x=>x.tipo==="A").map(x=>x.callId),
                ...azioni.filter(x=>x.tipo==="B").flatMap(x=>x.pratiche.map(p=>p.id))];
 const mal=callIds.length ? await c.query(
   /* i COMPENSATI non si toccano: un malus gia' liquidato in gara non si
      cancella dall'archivio (matchAppuntamento.ts fa lo stesso). */
   "select id,call_id,caller,importo,giorni,stato,eliminato from caller_malus where call_id=any($1) and coalesce(eliminato,false)=false and coalesce(stato,'') <> 'compensato'",[callIds])
   : {rows:[]};

 console.log("\n═══ A) ATTIVAZIONI CANCELLATE DA UN ESITO ═══");
 azioni.filter(x=>x.tipo==="A").forEach(x=>console.log(`   ${String(x.chi).padEnd(26)} ${String(x.da).padEnd(16)} → ${x.a}`));
 if(!azioni.some(x=>x.tipo==="A")) console.log("   (nessuna)");

 console.log("\n═══ B) VENDITE MAI COLLEGATE AL LORO APPUNTAMENTO ═══");
 azioni.filter(x=>x.tipo==="B").forEach(x=>console.log(
   `   appt ${String(x.apptId).padEnd(5)} ${String(x.chi).padEnd(26)} ${x.stessoNegozio?"stesso negozio":"ALTRO negozio"} (${x.negozioApp} / ${x.negozioVendita})\n` +
   `      vendite: ${x.vendite.join(", ")}\n` +
   `      pratiche: ${x.pratiche.map(p=>`${p.chi} [${p.stato}]`).join(" · ")||"(nessuna)"}`));
 if(!azioni.some(x=>x.tipo==="B")) console.log("   (nessuna)");

 console.log("\n═══ MALUS ATTIVI SU QUESTE PRATICHE ═══");
 mal.rows.forEach(m=>console.log(`   #${m.id} · ${m.caller} · ${m.importo}€ · ${m.giorni}gg · ${m.stato}`));
 if(!mal.rows.length) console.log("   (nessuno)");

 if(!SCRIVI){ console.log("\n(prova a vuoto — non ho modificato niente. Con --scrivi si applica.)"); await c.end(); return; }

 const dump=`scripts/dump_attivazioni_pre_${Date.now()}.json`;
 fs.writeFileSync(dump, JSON.stringify({azioni, malus:mal.rows}, null, 1));
 console.log(`\n💾 fotografia del prima: ${dump}`);

 for (const x of azioni.filter(v=>v.tipo==="A")) {
   const voce={data:new Date().toISOString(),caller:FIRMA,campo:"Stato",da:x.da,a:x.a,dettagli:null,
     nota:"ripristino: un esito del negozio aveva cancellato un'attivazione con vendita collegata"};
   await c.query("update calls set stato=$1, storico=coalesce(storico,'[]'::jsonb)||$2::jsonb where id=$3",[x.a,JSON.stringify([voce]),x.callId]);
   if (x.apptId) await c.query("update appointments set status='attivato' where id=$1 and status<>'attivato'",[x.apptId]);
 }
 for (const x of azioni.filter(v=>v.tipo==="B")) {
   const nuovo=x.stessoNegozio?"Attivato":"Attivato Altro Negozio";
   await c.query("update contracts set appointment_id=$1 where id=any($2)",[x.apptId,x.vendite]);
   await c.query("update appointments set status=$1 where id=$2",[x.stessoNegozio?"attivato":"attivato_diverso_negozio",x.apptId]);
   for (const p of x.pratiche) {
     const voce={data:new Date().toISOString(),caller:FIRMA,campo:"Stato",da:p.stato,a:nuovo,dettagli:null,
       nota:`collegamento tardivo: la vendita era stata registrata prima che l'appuntamento esistesse (${x.vendite.join(", ")})`};
     await c.query("update calls set stato=$1, contract_id=$2, storico=coalesce(storico,'[]'::jsonb)||$3::jsonb where id=$4",
       [nuovo, x.stessoNegozio?x.vendite[0]:null, JSON.stringify([voce]), p.id]);
   }
 }
 if (mal.rows.length) {
   await c.query("update caller_malus set eliminato=true, eliminato_il=now(), eliminato_da=$1 where id=any($2)",
     [FIRMA, mal.rows.map(m=>m.id)]);
   console.log(`   ✅ ${mal.rows.length} malus annullati (${mal.rows.reduce((t,m)=>t+Number(m.importo||0),0)}€ restituiti)`);
 }
 console.log(`\n✅ FATTO: ${azioni.filter(v=>v.tipo==="A").length} attivazioni ripristinate, ${azioni.filter(v=>v.tipo==="B").length} appuntamenti collegati.`);
 await c.end();
})().catch(e=>{console.error("ERRORE:",e.message);process.exit(1);});
