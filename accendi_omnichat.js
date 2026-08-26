// OMNICHAT — accende la scheda a Francesco Latina (Luca 26/08: «per ora
// lasciala aperta solamente a me e Francesco Latina che continuiamo a
// lavorarci sopra»).
//
// Luca è admin e la vede dal default della capability, senza bisogno di una
// riga. Francesco è store_manager: il permesso va acceso sulla PERSONA
// (`user:<id>`), non sul ruolo — gli altri store manager non devono vederla.
// Da qui in poi la si accende e spegne dalla rotellina in Collaboratori.
//
// Idempotente. Lancio: NODE_PATH=<dir pg> node accendi_omnichat.js
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

const CHIAVE = "cap:/chat:omnichat";
const FRANCESCO = "user:d0c58588-4b23-42cc-84b1-adf9ccd0d145";   // Francesco Latina

(async () => {
  await client.connect();
  try {
    await client.query(
      `insert into role_permissions (role, perm_key, allowed, updated_by)
       values ($1, $2, true, $3)
       on conflict (role, perm_key) do update set allowed = true, updated_by = $3, updated_at = now()`,
      [FRANCESCO, CHIAVE, "task Luca 26/08"]);
    const { rows } = await client.query(
      `select rp.role, rp.allowed, u.full_name
       from role_permissions rp
       left join app_users u on ('user:' || u.id::text) = rp.role
       where rp.perm_key = $1 order by rp.role`, [CHIAVE]);
    console.log("Chi vede l'Omnichat, per riga esplicita:");
    for (const r of rows) console.log(`  ${r.full_name || r.role} → ${r.allowed ? "SÌ" : "no"}`);
    console.log("\n  + admin e dev, che la vedono dal default (Luca compreso: nessuna riga necessaria)");
  } catch (e) {
    console.error("ERRORE:", e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
