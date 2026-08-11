// FIX CASO FEI/BUTNARU (10/08): lo spostamento guidato ha portato su FEI anche
// la sostituzione SIM di BUTNARU (la vendita di Libia era MISTA: prodotti di due
// persone nella stessa registrazione). Questo runner:
//  1. riporta CTR-8E78F498 (Sost. SIM Volontaria) e EXT-93B1D684 (marg. Sost
//     Wind3) sulla scheda di MIHAI BUTNARU, con riga di storia;
//  2. toglie a quelle 2 righe l'appointment_id 457 (l'appuntamento è di Fei);
//  3. fa puntare la pratica caller di Tommaso al contratto GIUSTO (il telefono
//     CTR-861C8F2A, non la sost. SIM).
// Restano su FEI: CTR-861C8F2A + EXT-D2358E3C con appointment_id 457 (corretti).
// Idempotente. Lancio: node fix_caso_fei.js
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

const BUTNARU = "CL-BTNMHI58P30Z129W-1786180811971";
const FEI = "CL-FEIRTR59H08H501G-1785490802373";
const TORNANO = ["CTR-8E78F498", "EXT-93B1D684"];   // sost. SIM + sua marginalità
const CALL_ID = "ae3cbc95-3cc6-4ecc-aa55-fff74db8368f";
const CTR_TELEFONO = "CTR-861C8F2A";

(async () => {
  await client.connect();
  await client.query("begin");
  try {
    for (const id of TORNANO) {
      const { rows } = await client.query("select client_id, storia from contracts where id=$1", [id]);
      if (!rows.length) throw new Error("riga " + id + " non trovata");
      if (rows[0].client_id === BUTNARU) { console.log("già a posto:", id); continue; }
      const storia = Array.isArray(rows[0].storia) ? rows[0].storia : [];
      storia.push({ at: new Date().toISOString(), user: "Sistema (fix caso Fei 10/08)", campo: "Cliente", da: "ARTURO  FEI", a: "MIHAI BUTNARU" });
      await client.query("update contracts set client_id=$1, appointment_id=null, storia=$2 where id=$3",
        [BUTNARU, JSON.stringify(storia), id]);
      console.log("riportata su Butnaru (senza appuntamento):", id);
    }
    await client.query("update calls set contract_id=$1 where id=$2 and coalesce(contract_id,'') <> $1", [CTR_TELEFONO, CALL_ID]);
    await client.query("commit");
  } catch (e) { await client.query("rollback"); console.error("FAIL →", e.message); process.exit(1); }

  const q = async (s, p) => (await client.query(s, p)).rows;
  console.log("--- VERIFICHE ---");
  for (const r of await q("select id, client_id, appointment_id from contracts where id = any($1) order by id", [["CTR-861C8F2A", "EXT-D2358E3C", ...TORNANO]]))
    console.log(`  ${r.id} → ${r.client_id === FEI ? "FEI" : r.client_id === BUTNARU ? "BUTNARU" : r.client_id} · app=${r.appointment_id || "—"}`);
  console.log("  attesi: CTR-861C8F2A/EXT-D2358E3C su FEI con app=457 · CTR-8E78F498/EXT-93B1D684 su BUTNARU senza app");
  for (const r of await q("select stato, contract_id from calls where id=$1", [CALL_ID]))
    console.log(`  call Tommaso → stato=${r.stato} · contract=${r.contract_id} (atteso ${CTR_TELEFONO})`);
  await client.end();
})().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
