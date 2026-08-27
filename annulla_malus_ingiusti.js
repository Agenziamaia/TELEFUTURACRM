// ANNULLA I MALUS NATI DALL'ESITO ADMIN (incidente 27/08).
//
// Cosa è successo: il ricostruttore degli episodi congelava il ritardo del
// negozio ogni volta che un evento CHIUDEVA il segmento aperto — compreso
// l'esito dell'AMMINISTRAZIONE. Così una pratica già chiusa (attivata, KO…),
// che dal vivo non genera niente, al primo «Confermato» del back office si
// vedeva materializzare tutto il passato come malus del venditore.
//
// Qui si annullano quegli episodi. NON si cancellano: si marcano `eliminato`
// come fa il cestino del pannello, così restano leggibili e la storia non
// sparisce. I malus VERI (Non Conforme, e i ritardi con eventi di negozio a
// provarli) non si toccano.
//
// Idempotente. Lancio: NODE_PATH=<dir pg> node annulla_malus_ingiusti.js
const fs = require("fs");
const path = require("path");

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

// il profilo esatto dell'episodio ingiusto:
//  · nato nelle ultime 48 ore (da quando il back office ha iniziato)
//  · la pratica OGGI è in uno stato che ferma il malus (attivata/KO/annullata)
//  · e nella sua storia NON c'è nessun evento di negozio a datare quel passaggio
//    → non possiamo provare che fosse aperta in quei giorni
const SELEZIONE = `
  from malus_storico m
  join contracts c on c.id = m.contract_id
 where m.created_at > now() - interval '48 hours'
   and coalesce(m.eliminato, false) = false
   and c.stato_admin is not null
   and coalesce(c.stato_negozio, '') in ('attivato', 'liquidato', 're_inserita', 'ko', 'annullato', 'nuovo')
   and not exists (
       select 1 from jsonb_array_elements(coalesce(c.storia, '[]'::jsonb)) ev
        where ev->>'tipo' = 'stato_negozio')`;

(async () => {
  await client.connect();
  try {
    const { rows: prima } = await client.query(`
      select m.id, m.contract_id, m.categoria, m.venditore, m.giorni, m.importo, m.stato,
             c.stato_negozio, c.stato_admin ${SELEZIONE} order by m.categoria, m.contract_id`);
    const file = path.join(__dirname, `dump_malus_ingiusti_${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(prima, null, 2));
    console.log(`Dump di ${prima.length} episodi → ${path.basename(file)}`);
    if (!prima.length) { console.log("Niente da annullare."); await client.end(); return; }
    console.table(prima);

    await client.query("begin");
    const { rows: fatti } = await client.query(`
      update malus_storico set eliminato = true, eliminato_il = now(),
             eliminato_da = 'correzione 27/08: malus nato da un esito admin, non da un ritardo del negozio'
       where id in (select m.id ${SELEZIONE})
      returning id, importo`);
    await client.query("commit");
    const tot = fatti.reduce((a, r) => a + Number(r.importo || 0), 0);
    console.log(`\nAnnullati ${fatti.length} episodi, ${tot} € tolti dalle spalle dei venditori.`);

    const { rows: resta } = await client.query(`
      select categoria, count(*) episodi, round(sum(importo)::numeric, 2) euro
        from malus_storico where created_at > now() - interval '48 hours'
         and coalesce(eliminato, false) = false group by 1 order by 1`);
    console.log("\nCosa resta delle ultime 48 ore (i malus veri):");
    console.table(resta);
  } catch (e) {
    await client.query("rollback").catch(() => { });
    console.error("ERRORE (rollback fatto):", e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
