// BONIFICA delle 9 conversazioni coi «messaggi fantasma» (reazioni salvate
// vuote, 25/08): last_message_at e last_preview tornano all'ultimo messaggio
// VERO (con testo o media). Le 14 righe vuote restano a DB (filtrate ovunque
// dalla UI) — qui si sistemano solo anteprima e ordinamento. Idempotente.
const fs = require("fs"); const path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const c = new Client({ host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
(async () => {
  await c.connect();
  const dumpPath = path.join(__dirname, "dump_wa_fantasmi_pre.json");
  if (!fs.existsSync(dumpPath)) {
    const { rows } = await c.query(`
      select id, customer_name, last_message_at::text, last_preview from wa_conversations
      where id in (select conversation_id from wa_messages
                   where (body is null or btrim(body)='') and media_mime is null and media_url is null and deleted_at is null)`);
    fs.writeFileSync(dumpPath, JSON.stringify(rows, null, 2));
    console.log(`Dump pre: ${rows.length} conversazioni fotografate`);
  } else console.log("Dump pre già presente: non lo sovrascrivo");
  const res = await c.query(`
    update wa_conversations cv
    set last_message_at = m.ts, last_preview = m.prev
    from (
      select distinct on (conversation_id) conversation_id,
             coalesce(wa_timestamp, created_at) ts,
             left(coalesce(body, ''), 120) prev
      from wa_messages
      where deleted_at is null and (btrim(coalesce(body,'')) <> '' or media_mime is not null or media_url is not null)
      order by conversation_id, coalesce(wa_timestamp, created_at) desc
    ) m
    where cv.id = m.conversation_id
      and cv.id in (select conversation_id from wa_messages
                    where (body is null or btrim(body)='') and media_mime is null and media_url is null and deleted_at is null)
      and (cv.last_message_at is distinct from m.ts or cv.last_preview is distinct from m.prev)`);
  console.log(`Conversazioni riallineate: ${res.rowCount}`);
  const { rows: dopo } = await c.query(`
    select customer_name, last_message_at::text, left(coalesce(last_preview,''),50) prev from wa_conversations
    where id in (select conversation_id from wa_messages
                 where (body is null or btrim(body)='') and media_mime is null and media_url is null and deleted_at is null)
    order by last_message_at desc`);
  dopo.forEach(r => console.log(`  ${r.customer_name} → ${r.last_message_at} | ${JSON.stringify(r.prev)}`));
  await c.end(); console.log("FATTO ✓");
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
