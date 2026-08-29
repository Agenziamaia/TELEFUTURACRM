#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   L'ANAGRAFICA ARTICOLI DAL LISTINO SUITE MOBILE  (npm run anagrafica)

   Luca 29/08: «ti allego un file dove ci sono tutti gli articoli GENERALI,
   nel file trovi anche alcune giacenze, non considerarle: usa l'excel solo
   per arricchire gli articoli».

   Questo script NON tocca le giacenze. Scrive solo `mag_articoli`: codice,
   barcode, descrizione, regime IVA, gruppo, sottogruppo, marca, prezzo,
   costo. Un articolo che esiste già viene aggiornato solo nei campi VUOTI —
   quello che c'è già l'ha messo l'import del magazzino, che viene dai conteggi
   veri del negozio e vale di più di un listino.

   DUE COSE CHE IL FILE HA DI SUO:

   1. È UNO ZIP TRONCATO. L'export arriva per email e il download si taglia:
      manca la coda dell'archivio, quindi nessun lettore xlsx lo apre. I dati
      però ci sono tutti — si recuperano leggendo le voci una per una dalle
      intestazioni locali (`PK\x03\x04`) invece che dall'indice finale.

   2. È SPACCATO PER NEGOZIO. Dopo le nove colonne dell'articolo ci sono
      quindici blocchi da sette (nome negozio + sei numeri). Prezzo e costo si
      prendono dal primo blocco che li ha: sono dell'articolo, non del negozio.

   Uso:  node scripts/importa-anagrafica.mjs <file.xlsx> [--prova]
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "fs";
import zlib from "zlib";
import pg from "pg";

const FILE = process.argv[2];
const PROVA = process.argv.includes("--prova");
if (!FILE) { console.error("uso: node scripts/importa-anagrafica.mjs <file.xlsx> [--prova]"); process.exit(1); }

/* ── 1. il foglio, anche da uno zip senza coda ─────────────────────────── */
function estraiFoglio(percorso) {
    const buf = readFileSync(percorso);
    let i = 0;
    while (true) {
        const k = buf.indexOf("PK\x03\x04", i, "binary");
        if (k < 0) break;
        const metodo = buf.readUInt16LE(k + 8);
        const compressa = buf.readUInt32LE(k + 18);
        const lnome = buf.readUInt16LE(k + 26), lextra = buf.readUInt16LE(k + 28);
        const nome = buf.slice(k + 30, k + 30 + lnome).toString();
        const dati = k + 30 + lnome + lextra;
        if (/worksheets\/sheet1\.xml$/.test(nome)) {
            const prossimo = buf.indexOf("PK\x03\x04", dati, "binary");
            const fine = compressa > 0 ? dati + compressa : (prossimo > 0 ? prossimo : buf.length);
            const pezzo = buf.slice(dati, fine);
            return metodo === 0 ? pezzo.toString("latin1")
                : zlib.inflateRawSync(pezzo, { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString("latin1");
        }
        i = k + 4;
    }
    throw new Error("foglio non trovato nell'archivio");
}

/* ── 2. le righe ────────────────────────────────────────────────────────── */
const dec = (s) => String(s || "").replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
const numCol = (r) => { let n = 0; for (const c of r) n = n * 26 + (c.charCodeAt(0) - 64); return n; };
const CAMPI = { 1: "codice", 2: "barcode", 3: "descrizione", 4: "iva_a", 5: "iva_v", 6: "insiemi", 7: "gruppo", 8: "sottogruppo", 9: "marca" };
const COSTO = new Set(), PREZZO = new Set();
for (let k = 0; k < 15; k++) { COSTO.add(15 + 7 * k); PREZZO.add(16 + 7 * k); }

/* il reparto del registratore, dal regime che dice il fornitore. È la stessa
   tabella usata il 29/08 per il magazzino: ART.74 = SIM in regime monofase
   (non soggetta), ART.36 = beni usati (regime del margine). */
const REPARTO = { "22": 2, "4": 3, "ART.36": 7, "ART.74": 1, "EX ART.15": 5 };

function leggi(xml) {
    const out = [];
    let da = 0;
    while (true) {
        const i = xml.indexOf("</x:row>", da);
        if (i < 0) break;
        const riga = xml.slice(da, i); da = i + 8;
        const o = {}; let prezzo = null, costo = null;
        for (const m of riga.matchAll(/<x:c r="([A-Z]+)\d+"[^>]*>(?:<x:v>([^<]*)<\/x:v>)?/g)) {
            const c = numCol(m[1]), v = dec(m[2]);
            if (CAMPI[c]) { o[CAMPI[c]] = v; continue; }
            if (!v) continue;
            const n = parseFloat(v.replace(",", "."));
            if (!Number.isFinite(n) || n <= 0) continue;
            if (prezzo == null && PREZZO.has(c)) prezzo = n;
            if (costo == null && COSTO.has(c)) costo = n;
        }
        if (o.codice && o.codice !== "Codice") out.push({ ...o, prezzo, costo });
    }
    return out;
}

/* ── 3. si scrive ──────────────────────────────────────────────────────── */
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace(/https:\/\/([^.]+).*/, "$1");
const db = new pg.Client({ host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres", user: "postgres." + ref, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });

const art = leggi(estraiFoglio(FILE));
console.log(`letti ${art.length} articoli dal listino`);

await db.connect();
await db.query("begin");
try {
    const prima = Number((await db.query("select count(*) n from mag_articoli")).rows[0].n);
    let scritti = 0;
    for (let i = 0; i < art.length; i += 500) {
        const lotto = art.slice(i, i + 500);
        const val = [], par = [];
        lotto.forEach((a, k) => {
            const b = k * 9;
            val.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`);
            par.push(a.codice, a.barcode || null, a.descrizione || a.codice, a.iva_v || null,
                REPARTO[String(a.iva_v || "").toUpperCase()] ?? null,
                a.gruppo || null, a.sottogruppo || null, a.marca || null, a.prezzo);
        });
        // COALESCE: quello che c'è già non si tocca — l'import del magazzino
        // viene dai conteggi veri, un listino no
        await db.query(`
      insert into mag_articoli (codice, barcode, descrizione, iva_vendita, reparto, gruppo, sottogruppo, marca, prezzo, attivo, fonte)
      select v.codice, v.barcode, v.descrizione, v.iva_vendita, v.reparto::int, v.gruppo, v.sottogruppo, v.marca, v.prezzo::numeric, true, 'listino-generale'
        from (values ${val.join(",")}) as v(codice,barcode,descrizione,iva_vendita,reparto,gruppo,sottogruppo,marca,prezzo)
      on conflict (codice) do update set
        barcode     = coalesce(mag_articoli.barcode, excluded.barcode),
        descrizione = coalesce(nullif(mag_articoli.descrizione,''), excluded.descrizione),
        iva_vendita = coalesce(mag_articoli.iva_vendita, excluded.iva_vendita),
        reparto     = coalesce(mag_articoli.reparto, excluded.reparto),
        gruppo      = coalesce(nullif(mag_articoli.gruppo,''), excluded.gruppo),
        sottogruppo = coalesce(nullif(mag_articoli.sottogruppo,''), excluded.sottogruppo),
        marca       = coalesce(nullif(mag_articoli.marca,''), excluded.marca),
        prezzo      = coalesce(mag_articoli.prezzo, excluded.prezzo)`, par);
        scritti += lotto.length;
        if (scritti % 2500 === 0) process.stderr.write(`  ${scritti}…\n`);
    }
    /* il costo a parte, e A LOTTI: una UPDATE per articolo erano settemila
       viaggi al database e lo script non finiva più. Solo dove manca, e solo
       se plausibile — un «costo» da cinquemila euro su un accessorio è un
       dato sporco, non un costo. */
    let conCosto = 0;
    const conC = art.filter(x => x.costo != null && x.costo < 5000);
    for (let i = 0; i < conC.length; i += 500) {
        const lotto = conC.slice(i, i + 500);
        const val = [], par = [];
        lotto.forEach((a, k) => { val.push(`($${k * 2 + 1},$${k * 2 + 2})`); par.push(a.codice, a.costo); });
        const r = await db.query(`update mag_articoli m set costo_ultimo = v.costo::numeric
      from (values ${val.join(",")}) as v(codice, costo)
      where m.codice = v.codice and m.costo_ultimo is null`, par);
        conCosto += r.rowCount;
    }
    const dopo = Number((await db.query("select count(*) n from mag_articoli")).rows[0].n);
    console.log(`\narticoli in anagrafica: ${prima} → ${dopo}  (+${dopo - prima})`);
    console.log(`costi valorizzati dove mancavano: ${conCosto}`);
    const senza = (await db.query("select count(*) n from mag_articoli where attivo and reparto is null")).rows[0].n;
    console.log(`senza reparto IVA (non stampabili): ${senza}`);
    console.log(`giacenze toccate: 0 — questo script non le guarda nemmeno`);
    if (PROVA) { await db.query("rollback"); console.log("\n↩️  PROVA: annullato tutto"); }
    else { await db.query("commit"); console.log("\n✅ scritto"); }
} catch (e) { await db.query("rollback"); console.error("\n❌ " + e.message); process.exitCode = 1; }
await db.end();
