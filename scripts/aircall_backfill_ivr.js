/**
 * BACKFILL PERCORSO IVR (AIR-04b, Luca 05/08 sera).
 * Il percorso IVR attraversato dal cliente viaggia in raw->data->ivr_options
 * (tappe con transition_*: livello 1 = brand, livello 2 = punto vendita).
 * Questo script lo rilegge su TUTTE le chiamate storiche e:
 *   - salva ivr_scelta (ultima tappa utile);
 *   - se la chiamata non ha negozio → lo attribuisce dal percorso
 *     (perse del numero unico e risposte del call center tornano al negozio);
 *   - marca risposta_cc dove ha risposto un utente del call center.
 * USO: node scripts/aircall_backfill_ivr.js [--esegui]   (default: dry run)
 */
const { Client } = require(process.cwd() + "/node_modules/pg");
const fs = require("fs");
const ESEGUI = process.argv.includes("--esegui");
const env = {};
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
    if (m) env[m[1]] = m[2];
}
const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(env.NEXT_PUBLIC_SUPABASE_URL)[1];
const db = new Client({
    host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432,
    user: "postgres." + ref, password: env.SUPABASE_DB_PASSWORD,
    database: "postgres", ssl: { rejectUnauthorized: false },
});

// stessa radice-comune del webhook (gemelli Collatina Multi/W3 → "Collatina")
function nomeDaStores(nomi) {
    if (!nomi.length) return null;
    if (nomi.length === 1) return nomi[0];
    const radice = nomi[0].trim().split(" ")[0];
    return nomi.every((n) => n.trim().split(" ")[0] === radice) ? radice : nomi.sort()[0];
}

(async () => {
    await db.connect();
    console.log(ESEGUI ? "⚠️  MODALITÀ ESECUZIONE" : "👀 DRY RUN — aggiungi --esegui per applicare");

    const stores = (await db.query(`select name from stores where active`)).rows.map((r) => r.name);
    const ccUsers = new Set((await db.query(
        `select aircall_user_id::text from app_users where aircall_user_id is not null and (role in ('caller','direttore_cc','back_office_caller'))`)).rows.map((r) => r.aircall_user_id));
    const negozioDaBranch = (branch) => {
        const b = branch.toLowerCase();
        const hits = stores.filter((s) => s.toLowerCase().startsWith(b));
        return nomeDaStores(hits);
    };

    const rows = (await db.query(`
        select id, aircall_call_id, negozio, answered, aircall_user_id::text as user_id, ivr_scelta, risposta_cc,
               raw->'data'->'ivr_options' as tappe
        from call_events
        where jsonb_typeof(raw->'data'->'ivr_options')='array' and jsonb_array_length(raw->'data'->'ivr_options')>0`)).rows;
    console.log(`chiamate col percorso IVR: ${rows.length}`);

    let conNegozio = 0, giaNegozio = 0, soloScelta = 0, cc = 0;
    const perNegozio = {};
    for (const r of rows) {
        const tappe = [...(r.tappe || [])].reverse();
        let scelta = null, negozio = null;
        for (const t of tappe) {
            const branch = String((t && (t.branch || t.title)) || "").trim();
            if (!branch) continue;
            if (!scelta) scelta = branch;
            const hit = negozioDaBranch(branch);
            if (hit) { negozio = hit; scelta = branch; break; }
        }
        if (!scelta) continue;
        const upd = {};
        if (scelta !== r.ivr_scelta) upd.ivr_scelta = scelta;
        if (negozio && !r.negozio) { upd.negozio = negozio; conNegozio++; perNegozio[negozio] = (perNegozio[negozio] || 0) + 1; }
        else if (negozio && r.negozio) giaNegozio++;
        else soloScelta++;
        // risposta dal call center: risposto, utenza cc, e il negozio NON viene dall'utenza
        if (r.answered && r.user_id && ccUsers.has(r.user_id) && !r.risposta_cc && (upd.negozio || (!r.negozio && !negozio))) {
            upd.risposta_cc = true; cc++;
        }
        if (ESEGUI && Object.keys(upd).length) {
            const set = Object.keys(upd).map((k, i) => `${k}=$${i + 2}`).join(", ");
            await db.query(`update call_events set ${set} where id=$1`, [r.id, ...Object.keys(upd).map((k) => upd[k])]);
        }
    }
    console.log(`negozio ATTRIBUITO dal percorso: ${conNegozio} (già attribuito per altra via: ${giaNegozio}, percorso senza negozio: ${soloScelta})`);
    console.log("per negozio:", JSON.stringify(perNegozio));
    console.log(`risposte dal call center marcate: ${cc}`);
    console.log(ESEGUI ? "APPLICATO ✅" : "(dry run, nessuna modifica)");
    await db.end();
})().catch((e) => { console.error("ERRORE:", e.message); process.exit(1); });
