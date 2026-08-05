/**
 * RE-SPLIT RETROATTIVO DELLE CONVERSAZIONI EMAIL (EML-06, Luca 05/08).
 * Finora una conversazione = un mittente per casella: tutte le mail dello
 * stesso indirizzo impilate in un thread unico. Questo script ricostruisce le
 * conversazioni a THREAD con lo stesso algoritmo del poll:
 *   1) In-Reply-To → stesso thread del messaggio citato;
 *   2) oggetto da risposta (Re:/R:/Fwd:/I:) → ultimo thread dello stesso
 *      interlocutore con la stessa radice d'oggetto;
 *   3) altrimenti thread nuovo.
 * Il gruppo col messaggio PIÙ RECENTE tiene l'id della vecchia conversazione
 * (stella/cartella/cliente restano); gli altri diventano conversazioni nuove
 * che ereditano cartella e cliente. unread dei nuovi = 0: ci pensa il
 * riallineamento \Seen del poll (EML-05) a rimettere i contatori veri.
 *
 * USO:  node scripts/rethread_email.js          → DRY RUN (solo numeri)
 *       node scripts/rethread_email.js --esegui → applica davvero
 * Da lanciare DOPO il deploy del threading (poll/send/backfill nuovi), con la
 * migrazione 20260805050000 applicata (via il vincolo unique account+email).
 */
const { Client } = require(process.cwd() + "/node_modules/pg");
const fs = require("fs");
const path = require("path");

const ESEGUI = process.argv.includes("--esegui");

const env = {};
for (const l of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
    if (m) env[m[1]] = m[2];
}
const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(env.NEXT_PUBLIC_SUPABASE_URL)[1];
const db = new Client({
    host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432,
    user: "postgres." + ref, password: env.SUPABASE_DB_PASSWORD,
    database: "postgres", ssl: { rejectUnauthorized: false },
});

// stesse regole di src/lib/email.ts (oggettoRadice / pareRisposta)
function radice(s) {
    let t = String(s || "").trim();
    for (let i = 0; i < 6; i++) {
        const m = /^(re|r|fw|fwd|i|rif)\s*:\s*/i.exec(t);
        if (!m) break;
        t = t.slice(m[0].length).trim();
    }
    return t.toLowerCase().replace(/\s+/g, " ");
}
const pareRisposta = (s) => /^\s*(re|r|fw|fwd|i|rif)\s*:/i.test(String(s || ""));
const normId = (s) => String(s || "").trim();
function primoIndirizzo(toAddrs) {
    const m = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.exec(String(toAddrs || ""));
    return m ? m[0].toLowerCase() : null;
}

(async () => {
    await db.connect();
    console.log(ESEGUI ? "⚠️  MODALITÀ ESECUZIONE" : "👀 DRY RUN (niente scritture) — aggiungi --esegui per applicare");

    // le bozze agganciano conversazioni? (colonna presente solo se esiste)
    const colDraft = await db.query(`select 1 from information_schema.columns where table_name='email_drafts' and column_name='conversation_id'`);
    const draftsAgganciano = colDraft.rowCount > 0;

    const accs = (await db.query(`select id, email_address from email_accounts order by email_address`)).rows;
    let totNuove = 0, totTenute = 0, totMsgSpostati = 0;

    for (const acc of accs) {
        const msgs = (await db.query(
            `select id, conversation_id, message_id, in_reply_to, direction,
                    lower(coalesce(from_addr,'')) as from_addr, from_name, to_addrs, subject,
                    email_date, created_at, left(coalesce(body_text,''),200) as anteprima
             from email_messages where account_id=$1
             order by email_date asc nulls first, created_at asc`, [acc.id])).rows;
        if (!msgs.length) continue;
        const convs = new Map((await db.query(
            `select id, customer_email, customer_name, client_id, starred, spam, trashed, archived
             from email_conversations where account_id=$1`, [acc.id])).rows.map((r) => [r.id, r]));

        // ── raggruppamento a thread ──────────────────────────────────────
        const byMsgId = new Map();       // message_id → gruppo
        const perChiave = new Map();     // interlocutore||radice → ultimo gruppo
        const gruppi = [];
        for (const m of msgs) {
            const vecchia = convs.get(m.conversation_id);
            const interloc = (m.direction === "in" ? m.from_addr : primoIndirizzo(m.to_addrs))
                || (vecchia ? vecchia.customer_email : null) || "sconosciuto";
            let g = null;
            if (m.in_reply_to && byMsgId.has(normId(m.in_reply_to))) g = byMsgId.get(normId(m.in_reply_to));
            const rad = radice(m.subject);
            const chiave = interloc + "||" + rad;
            if (!g && pareRisposta(m.subject) && perChiave.has(chiave)) g = perChiave.get(chiave);
            if (!g) {
                g = { interloc, rad, msgs: [], oldConv: m.conversation_id };
                gruppi.push(g);
            }
            g.msgs.push(m);
            if (m.message_id) byMsgId.set(normId(m.message_id), g);
            perChiave.set(g.interloc + "||" + g.rad, g);
        }

        // ── per ogni vecchia conversazione: chi tiene l'id, chi nasce nuovo ──
        const perVecchia = new Map();
        for (const g of gruppi) {
            if (!perVecchia.has(g.oldConv)) perVecchia.set(g.oldConv, []);
            perVecchia.get(g.oldConv).push(g);
        }
        let nuove = 0, tenute = 0, spostati = 0;
        for (const [oldId, gs] of perVecchia) {
            const vecchia = convs.get(oldId) || {};
            // il gruppo col messaggio più recente tiene la riga esistente
            gs.sort((a, b) => {
                const ta = new Date(a.msgs[a.msgs.length - 1].email_date || 0).getTime();
                const tb = new Date(b.msgs[b.msgs.length - 1].email_date || 0).getTime();
                return tb - ta;
            });
            for (let i = 0; i < gs.length; i++) {
                const g = gs[i];
                const ultimo = g.msgs[g.msgs.length - 1];
                const quando = ultimo.email_date || ultimo.created_at || null;
                const anteprima = String(ultimo.anteprima || ultimo.subject || "").replace(/\s+/g, " ").trim().slice(0, 140);
                const nome = g.msgs.find((x) => x.direction === "in" && x.from_name)?.from_name || vecchia.customer_name || null;
                if (i === 0) {
                    tenute++;
                    if (ESEGUI) await db.query(
                        `update email_conversations set subject=$2, last_message_at=$3, last_preview=$4 where id=$1`,
                        [oldId, ultimo.subject || null, quando, anteprima]);
                } else {
                    nuove++;
                    spostati += g.msgs.length;
                    if (ESEGUI) {
                        const ins = await db.query(
                            `insert into email_conversations
                               (account_id, customer_email, customer_name, client_id, subject,
                                last_message_at, last_preview, unread, starred, spam, trashed, archived)
                             values ($1,$2,$3,$4,$5,$6,$7,0,coalesce($8,false),coalesce($9,false),coalesce($10,false),coalesce($11,false))
                             returning id`,
                            [acc.id, g.interloc, nome, vecchia.client_id || null, ultimo.subject || null,
                             quando, anteprima, vecchia.starred, vecchia.spam, vecchia.trashed, vecchia.archived]);
                        const nuovoId = ins.rows[0].id;
                        const ids = g.msgs.map((x) => x.id);
                        for (let k = 0; k < ids.length; k += 500) {
                            await db.query(`update email_messages set conversation_id=$1 where id = any($2::uuid[])`, [nuovoId, ids.slice(k, k + 500)]);
                        }
                    }
                }
            }
        }

        // conversazioni rimaste senza messaggi (non referenziate da bozze)
        if (ESEGUI) {
            const orfane = await db.query(
                `delete from email_conversations c
                 where c.account_id=$1
                   and not exists (select 1 from email_messages m where m.conversation_id=c.id)
                   ${draftsAgganciano ? "and not exists (select 1 from email_drafts d where d.conversation_id=c.id)" : ""}
                 returning c.id`, [acc.id]);
            if (orfane.rowCount) console.log(`   🧹 ${acc.email_address}: eliminate ${orfane.rowCount} conversazioni vuote`);
        }

        totNuove += nuove; totTenute += tenute; totMsgSpostati += spostati;
        console.log(`📬 ${acc.email_address}: ${msgs.length} msg · conv prima ${convs.size} → thread ${gruppi.length} (tenute ${tenute}, nuove ${nuove}, msg spostati ${spostati})`);
    }

    console.log(`\nTOTALE: thread tenuti ${totTenute}, nuovi ${totNuove}, messaggi spostati ${totMsgSpostati}${ESEGUI ? " — APPLICATO" : " — dry run, nessuna modifica"}`);
    await db.end();
})().catch((e) => { console.error("ERRORE:", e.message); process.exit(1); });
