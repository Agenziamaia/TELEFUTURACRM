// MOD-25 (Luca 10/08): collega "Marcello Marciello" alla sua utenza Aircall.
// Legge le utenze da Aircall (API v1, credenziali in .env.local), trova quella
// di Marcello per nome, e scrive app_users.aircall_user_id. Idempotente.
// Lancio: node fix_aircall_marcello.js
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
const NOME = "Marcello Marciello";

(async () => {
  if (!env.AIRCALL_API_ID || !env.AIRCALL_API_TOKEN) { console.error("Credenziali Aircall assenti in .env.local"); process.exit(1); }
  const auth = "Basic " + Buffer.from(env.AIRCALL_API_ID + ":" + env.AIRCALL_API_TOKEN).toString("base64");
  // utenze Aircall (paginato)
  let users = [], page = 1;
  while (page <= 5) {
    const r = await fetch(`https://api.aircall.io/v1/users?per_page=50&page=${page}`, { headers: { Authorization: auth } });
    if (!r.ok) { console.error("Aircall API:", r.status, await r.text()); process.exit(1); }
    const j = await r.json();
    users = users.concat(j.users || []);
    if (!j.meta || !j.meta.next_page_link) break;
    page++;
  }
  console.log(`Utenze Aircall trovate: ${users.length}`);
  const norm = (s) => String(s || "").trim().toLowerCase();
  const hit = users.find(u => norm(u.name) === norm(NOME))
    || users.find(u => norm(u.name).includes("marciello"))
    || users.find(u => norm(u.name).includes("marcello"));
  if (!hit) {
    console.log("❌ Nessuna utenza Aircall col nome atteso. Elenco nomi:");
    users.forEach(u => console.log(`   ${u.id} — ${u.name} (${u.email || "—"})`));
    process.exit(1);
  }
  console.log(`✓ Utenza Aircall: id=${hit.id} — ${hit.name} (${hit.email || "—"})`);

  await client.connect();
  const { rows: au } = await client.query(
    "select id, full_name, role, aircall_user_id from app_users where full_name ilike $1", ["%marciello%"]);
  if (!au.length) { console.error("❌ Nessun utente CRM con cognome Marciello."); process.exit(1); }
  for (const u of au) console.log(`utente CRM: ${u.full_name} (${u.role}) — aircall_user_id attuale: ${u.aircall_user_id || "—"}`);
  const target = au.find(u => String(u.full_name).toLowerCase().includes("marcello")) || au[0];
  await client.query("update app_users set aircall_user_id=$1 where id=$2", [hit.id, target.id]);
  const { rows: chk } = await client.query("select full_name, aircall_user_id from app_users where id=$1", [target.id]);
  console.log(`✅ Collegato: ${chk[0].full_name} → aircall_user_id ${chk[0].aircall_user_id}`);
  console.log("Da adesso le sue chiamate sono riconosciute (risposta CC, pratiche, click-to-call).");
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
