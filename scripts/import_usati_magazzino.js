/**
 * IMPORT USATI DA INVENTARIO MAGAZZINO (Luca 06/08).
 * File: "usati in magazzino.xlsx", foglio IMEI — solo righe con colonna E = 1.
 * Colonna B = IMEI (anche numerico Excel: 15 cifre, precisione garantita),
 * colonna D = modello (con capacità/colore quando presenti), colonna A = codice
 * inventario (conservato in note_tecnico per tracciabilità).
 * Stati: MOTOROLA → "pronto" (pronti al trasferimento dall'amministrativo);
 * tutti gli altri → "ricevuto" (in laboratorio, li lavorano loro).
 * Capacità mancante → dedotta dal modello (righe esplicite dello stesso lotto
 * o taglio base italiano). Colore solo se presente ("PANTONE" da solo non è
 * un colore e si scarta).
 * USO: node scripts/import_usati_magazzino.js [--esegui]
 */
const { Client } = require(process.cwd() + "/node_modules/pg");
const XLSX = require(process.cwd() + "/node_modules/xlsx");
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

const COLORI = { black: "Nero", nero: "Nero", blu: "Blu", blue: "Blu", verde: "Verde", green: "Verde", white: "Bianco", bianco: "Bianco", grigio: "Grigio", gray: "Grigio", grey: "Grigio", rosso: "Rosso", red: "Rosso" };

function normalizza(descRaw) {
    let d = " " + descRaw.toUpperCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim() + " ";
    // capacità: "128GB", "128 GB", "128G", "NOTE 10 128 GB"
    let cap = null;
    const mCap = d.match(/\b(16|32|64|128|256|512|1024)\s*G[BO]?\b/);
    if (mCap) { cap = mCap[1] + "GB"; d = d.replace(mCap[0], " "); }
    // colore (parola secca; "PANTONE" non è un colore)
    let colore = null;
    for (const [k, v] of Object.entries(COLORI)) {
        const re = new RegExp("\\b" + k.toUpperCase() + "\\b");
        if (re.test(d)) { colore = v; d = d.replace(re, " "); break; }
    }
    d = d.replace(/\bPANTONE\b/g, " ").replace(/\s+/g, " ").trim();
    // modello canonico
    const has5G = /\b5G\b/.test(d);
    let modello = null, brand = null, capDefault = null;
    const is = (re) => re.test(d);
    if (is(/MOTO\s*G\s*0?5\b|MOTOROLA\s*G\s*0?5\b|MOTOG05/)) { brand = "Motorola"; modello = "Motorola Moto G05"; capDefault = "128GB"; }
    else if (is(/G35/)) { brand = "Motorola"; modello = "Motorola Moto G35" + (has5G ? " 5G" : ""); capDefault = "128GB"; }
    else if (is(/G37/)) { brand = "Motorola"; modello = "Motorola Moto G37"; capDefault = "128GB"; }
    else if (is(/G50/)) { brand = "Motorola"; modello = "Motorola Moto G50"; capDefault = "64GB"; }
    else if (is(/S26 ULTRA/)) { brand = "Samsung"; modello = "Samsung Galaxy S26 Ultra"; capDefault = "256GB"; }
    else if (is(/S22 ULTRA/)) { brand = "Samsung"; modello = "Samsung Galaxy S22 Ultra"; capDefault = "256GB"; }
    else if (is(/A17/)) { brand = "Samsung"; modello = "Samsung Galaxy A17 4G"; capDefault = "128GB"; }
    else if (is(/NOTE 10/)) { brand = "Samsung"; modello = "Samsung Galaxy Note 10"; capDefault = "256GB"; }
    else if (is(/IPHONE 8 PLUS/)) { brand = "Apple"; modello = "Apple iPhone 8 Plus"; capDefault = "64GB"; }
    else if (is(/IPAD PRO 12\.?9/)) { brand = "Apple"; modello = "Apple iPad Pro 12.9 (2017) WiFi"; capDefault = "256GB"; }
    else if (is(/MAGIC 5 LITE|MAGIC5 LITE/)) { brand = "Honor"; modello = "Honor Magic5 Lite"; capDefault = "256GB"; }
    else if (is(/NOVA 5T/)) { brand = "Huawei"; modello = "Huawei Nova 5T"; capDefault = "128GB"; }
    if (!modello) return null;
    return { model: modello + " " + (cap || capDefault) + (colore ? " " + colore : ""), brand, capDedotta: !cap };
}

(async () => {
    await db.connect();
    console.log(ESEGUI ? "⚠️  MODALITÀ ESECUZIONE" : "👀 DRY RUN — aggiungi --esegui per applicare");
    const wb = XLSX.readFile("/Users/macbookl/My Drive/Downloads D/usati in magazzino.xlsx");
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["IMEI"], { header: 1, raw: true });

    const esistenti = new Set((await db.query(`select imei from usati where imei is not null and imei <> ''`)).rows.map((r) => r.imei));
    const visti = new Set();
    const now = new Date().toISOString();
    let ok = 0, doppiDb = 0, doppiFile = 0, scartati = 0, senzaImei = 0;
    const inserimenti = [];

    for (let i = 2; i < rows.length; i++) {
        const r = rows[i] || [];
        if (String(r[4] ?? "").trim() !== "1") continue;
        const codice = String(r[0] || "").trim();
        let imei = r[1];
        if (typeof imei === "number") imei = String(Math.round(imei));
        imei = String(imei || "").replace(/\D/g, "");
        const desc = String(r[3] || "").trim();
        if (!desc) continue;
        const n = normalizza(desc);
        if (!n) { scartati++; console.log("  ❓ NON RICONOSCIUTO:", desc, "(saltato)"); continue; }
        let notaImei = "";
        if (imei.length !== 15) { senzaImei++; notaImei = ` — colonna B non valida ("${imei}")`; imei = ""; }
        if (imei && esistenti.has(imei)) { doppiDb++; console.log("  ↩︎ GIÀ A SISTEMA:", imei, n.model); continue; }
        if (imei && visti.has(imei)) { doppiFile++; console.log("  ↩︎ DOPPIO NEL FILE:", imei, n.model); continue; }
        if (imei) visti.add(imei);
        const status = n.brand === "Motorola" ? "pronto" : "ricevuto";
        inserimenti.push({
            model: n.model, imei, status,
            note: `Import inventario laboratorio 06/08 — ${codice}${n.capDedotta ? " · capacità dedotta dal modello" : ""}${notaImei}`,
        });
        ok++;
    }

    // EXTRA (foto DDT Wind3 25/4 del 31/07, Luca 06/08): ZTE Blade A36 → pronto
    const EXTRA = [{ model: "ZTE Blade A36 64GB", imei: "863644087451762", status: "pronto", note: "Import inventario laboratorio 06/08 — RITUSATO.04.59 (DDT Wind3 25/4 del 31/07/2026) · capacità dedotta dal modello" }];
    for (const x of EXTRA) {
        if (esistenti.has(x.imei) || visti.has(x.imei)) { console.log("  ↩︎ EXTRA già presente:", x.imei); continue; }
        visti.add(x.imei); inserimenti.push(x); ok++;
    }

    const perStato = {};
    inserimenti.forEach((x) => { perStato[x.status] = (perStato[x.status] || 0) + 1; });
    console.log(`\nDA INSERIRE: ${ok} (pronto: ${perStato.pronto || 0}, ricevuto/laboratorio: ${perStato.ricevuto || 0})`);
    console.log(`già a sistema: ${doppiDb} · doppi nel file: ${doppiFile} · non riconosciuti: ${scartati} · senza IMEI valido: ${senzaImei}`);
    inserimenti.forEach((x) => console.log(`  [${x.status === "pronto" ? "✅ pronto" : "🔬 ricevuto"}] ${x.model} · ${x.imei || "SENZA IMEI"}`));

    if (ESEGUI && inserimenti.length) {
        for (const x of inserimenti) {
            await db.query(
                `insert into usati (model, imei, status, sale_price, purchase_price, store, ricambi, note_tecnico, status_history, provenienza_subito, purchase_date, created_at)
                 values ($1,$2,$3,0,0,'Laboratorio','[]'::jsonb,$4,$5,false,$6,$6)`,
                [x.model, x.imei || null, x.status, x.note,
                 JSON.stringify({ [x.status]: { date: now, operatore: "Import magazzino" } }), now]);
        }
        console.log(`\nAPPLICATO ✅ — inseriti ${inserimenti.length} usati`);
    }
    await db.end();
})().catch((e) => { console.error("ERRORE:", e.message); process.exit(1); });
