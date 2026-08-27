// TASK RIMANDATA INDIETRO (Luca 27/08): «se io do una task a Francesco,
// Francesco deve poterla esitare come "ho riscontrato un problema" e
// aggiungere una nota rispetto alla nota che gli avevo messo io,
// rimandandomela indietro».
//
// Non serve una tabella nuova: la task ha già `outcome_note` (la nota di chi
// la esegue, distinta da `notes` che è quella di chi l'ha data) e
// `esito_visto`, che è il modo con cui chi l'ha assegnata si accorge che è
// tornata. Serve solo l'ESITO in più, e sta nella tabella amministrabile.
//
// Idempotente. Lancio: NODE_PATH=<dir pg> node crea_task_problema.js
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

const NUOVI = [
  // chiave, etichetta, colore, ordine
  ["in_corso", "In corso", "blue", 15],
  ["problema", "Problema — rimandata al mittente", "orange", 35],
];

(async () => {
  await client.connect();
  try {
    await client.query("begin");
    for (const [chiave, etichetta, colore, ordine] of NUOVI) {
      await client.query(`
        insert into calendario_esiti (tipo, chiave, etichetta, colore, attiva, ordine)
        values ('task', $1, $2, $3, true, $4)
        on conflict (tipo, chiave) do update
           set etichetta = excluded.etichetta, colore = excluded.colore, attiva = true`,
        [chiave, etichetta, colore, ordine]);
    }
    await client.query("commit");
    const { rows } = await client.query(
      `select chiave, etichetta, colore, ordine, attiva from calendario_esiti where tipo = 'task' order by ordine`);
    console.log("Esiti delle task:");
    console.table(rows);
  } catch (e) {
    await client.query("rollback").catch(() => { });
    console.error("ERRORE (rollback fatto):", e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
