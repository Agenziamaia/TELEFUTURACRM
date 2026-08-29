/* RIPARAZIONE DEI FLUSSI RESETTATI DAL WEBHOOK AIRCALL (Luca 29/08).
   ESEGUITO IL 29/08/2026: 3 pratiche riparate, 14 lasciate stare, fotografia
   del prima in scripts/dump_caller_nr_pre_*.json (gitignorato: dati clienti).
   Rieseguirlo e' innocuo — oggi trova 0 da riparare. Serve da traccia di cosa
   e' stato toccato, e da diagnosi se il difetto si ripresentasse.

   Senza --scrivi non modifica NIENTE: stampa solo cosa farebbe.
   Il webhook riportava a «Cold NR1» qualunque stato non fosse nella scala NR:
   appuntamenti, richiami e definitivi tornavano all'inizio.

   ⚠️ NON SI RIPRISTINA TUTTO ALLA CIECA. Se DOPO il salto sbagliato una PERSONA
   ha rimesso mano allo stato, la sua decisione è più recente e meglio informata
   della nostra: quella pratica non si tocca. Si ripara solo dove il valore di
   oggi è ancora quello messo dall'automatismo (o un suo avanzamento). */
const fs = require("fs"); const { Client } = require("pg");
const pw = fs.readFileSync(".env.local","utf8").match(/SUPABASE_DB_PASSWORD=(.+)/)[1].trim();
const SCRIVI = process.argv.includes("--scrivi");
const NR = /^(Cold|Hot) NR[123]$/;

(async () => {
  const c = new Client({ host:"aws-1-eu-central-2.pooler.supabase.com", port:5432,
    user:"postgres.akawmrqvdtufqkaaiivv", password:pw, database:"postgres", ssl:{rejectUnauthorized:false} });
  await c.connect();

  const { rows } = await c.query(`
    select id, stato, storico,
           coalesce(nome||' '||coalesce(cognome,''), ragione_sociale) as cliente
    from calls
    where exists (select 1 from jsonb_array_elements(coalesce(storico,'[]'::jsonb)) v
                  where v->>'caller'='automatico (non risposto)' and v->>'campo'='Stato'
                    and coalesce(v->>'da','') <> '' and v->>'da' !~ '^(Cold|Hot) NR[123]$'
                    and v->>'da' <> 'Nuovo')`);

  const daRiparare = [], saltate = [];
  for (const r of rows) {
    const st = Array.isArray(r.storico) ? r.storico : [];
    // il PRIMO salto sbagliato: è lì che il flusso è stato rotto
    const rotto = st.filter((v) => v?.caller === "automatico (non risposto)" && v?.campo === "Stato"
      && v.da && v.da !== "Nuovo" && !NR.test(v.da))
      .sort((a,b) => String(a.data||"").localeCompare(String(b.data||"")))[0];
    if (!rotto) continue;

    // qualcuno ci ha messo mano DOPO?
    const umanoDopo = st.some((v) => v?.campo === "Stato" && v?.caller
      && v.caller !== "automatico (non risposto)"
      && String(v.data || "") > String(rotto.data || ""));
    if (umanoDopo) { saltate.push({ ...r, rotto, motivo: "ci ha messo mano una persona dopo" }); continue; }

    // lo stato di oggi deve essere ancora quello dell'automatismo (o un suo avanzamento)
    if (!NR.test(String(r.stato || ""))) { saltate.push({ ...r, rotto, motivo: `stato attuale «${r.stato}» non è dell'automatismo` }); continue; }

    daRiparare.push({ id: r.id, cliente: r.cliente, ora: r.stato, torna: rotto.da, quando: rotto.data });
  }

  console.log(`\n═══ PRATICHE ESAMINATE: ${rows.length} ═══\n`);
  console.log(`✅ DA RIPARARE: ${daRiparare.length}`);
  daRiparare.forEach((x) => console.log(`   ${String(x.quando).slice(0,16)}  ${String(x.ora).padEnd(10)} → ${String(x.torna).padEnd(24)} ${String(x.cliente||"").slice(0,30)}`));
  console.log(`\n⏭️  LASCIATE STARE: ${saltate.length}`);
  saltate.forEach((x) => console.log(`   ${String(x.stato).padEnd(24)} ${String(x.motivo).padEnd(46)} ${String(x.cliente||"").slice(0,26)}`));

  if (!SCRIVI) { console.log("\n(prova a vuoto — niente è stato modificato. Con --scrivi si applica.)"); await c.end(); return; }

  const dump = `scripts/dump_caller_nr_pre_${Date.now()}.json`;
  fs.writeFileSync(dump, JSON.stringify(rows, null, 1));
  console.log(`\n💾 fotografia del prima: ${dump}`);

  for (const x of daRiparare) {
    const voce = { data: new Date().toISOString(), caller: "correzione automatica",
      campo: "Stato", da: x.ora, a: x.torna, dettagli: null,
      nota: "ripristino: una chiamata senza risposta aveva riportato il flusso a Cold NR1" };
    await c.query(
      `update calls set stato = $1, storico = coalesce(storico,'[]'::jsonb) || $2::jsonb where id = $3`,
      [x.torna, JSON.stringify([voce]), x.id]);
  }
  console.log(`\n✅ RIPARATE ${daRiparare.length} pratiche, ognuna con la sua riga nello storico.`);
  await c.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
