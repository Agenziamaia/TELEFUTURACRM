/**
 * IMPORT VDL LUGLIO 2026 (Luca 06/08) — appuntamenti presi a luglio dai caller
 * che non si sono concretizzati: entrano nella sezione Caller come pratiche.
 * Regole (risposte Luca):
 *  - righe SENZA numero di telefono: NON importate;
 *  - numero GIÀ presente in una pratica caller: NON importata (il CRM ha lo
 *    stato più fresco — molte le ha già create il ponte Aircall ad agosto);
 *  - "In Attesa Appuntamento" → "Da richiamare"; obiettivo tab Sky = "Sky";
 *  - Wind3: brand Wind3, obiettivo CB, provenienza Esterno, tipologia DTS;
 *  - Vodafone/Energy: brand Vodafone, obiettivo Energia, Esterno, DTS;
 *  - Sky: brand dalla colonna J (VODAFONE/FASTWEB/3P SKY), provenienza
 *    Interno con negozio di origine (col. K), obiettivo Sky, DTS;
 *  - nome/cognome disambiguati col codice fiscale (a volte invertiti);
 *  - voce di STORICO datata OGGI: il conteggio warning/malus riparte da oggi,
 *    niente malus retroattivi di luglio.
 * USO: node scripts/import_vdl_luglio.js [--esegui]
 */
const XLSX = require(process.cwd() + "/node_modules/xlsx");
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

const CALLER_MAP = { "maria": "Maria Evangelisti", "tommaso e.": "Tommaso Evangelisti", "tommaso": "Tommaso Evangelisti", "sheekell": "Sheekel Eban", "sheekel": "Sheekel Eban", "valentina": "Valentina Massullo", "andrea": "Andrea Argiolas" };
const ESITO_MAP = {
    "appuntamento": "1° Appuntamento", "appuntamento 2": "2° Appuntamento", "appuntamento 3": "3° Appuntamento",
    "non risponde 1": "Hot NR1", "non risponde 2": "Hot NR2", "non risponde 3": "Hot NR3",
    "da richiamare": "Da richiamare", "in attesa appuntamento": "Da richiamare",
    "non interessato": "Non interessato", "andato non interessato": "Andato Non Interessato",
};
const BRAND_J = { "VODAFONE": "Vodafone", "FASTWEB": "Fastweb", "3P SKY": "Sky" };
const TABS = [
    { tab: "Wind3 App. prova", brand: "WindTre", obiettivo: "CB", prov: "Esterno", note: null, caller: 5, esito: 6, negozio: 7 },
    { tab: "Vodafone App. Prova", brand: "Vodafone", obiettivo: "Energia", prov: "Esterno", note: null, caller: 5, esito: 6, negozio: 7 },
    { tab: "Energy App. Prova", brand: "Vodafone", obiettivo: "Energia", prov: "Esterno", note: 5, caller: 6, esito: 7, negozio: 8 },
    { tab: "Sky App. Prova", brand: null, obiettivo: "Sky", prov: "Interno", note: 5, caller: 6, esito: 7, negozio: 8, brandCol: 9, negOrigine: 10 },
];

// consonanti/vocali per il confronto col CF (regole standard del codice fiscale)
const cons = (s) => (s.toUpperCase().replace(/[^A-Z]/g, "").match(/[^AEIOU]/g) || []).join("");
const voc = (s) => (s.toUpperCase().replace(/[^A-Z]/g, "").match(/[AEIOU]/g) || []).join("");
function codeCognome(s) { return (cons(s) + voc(s) + "XXX").slice(0, 3); }
function codeNome(s) {
    const c = cons(s);
    const base = c.length >= 4 ? c[0] + c[2] + c[3] : c;   // regola: 1°,3°,4° se ≥4 consonanti
    return (base + voc(s) + "XXX").slice(0, 3);
}
/** Divide "parole" in (nome, cognome) provando tutte le spezzature e i due
 *  ordini, scegliendo quella che combacia col CF. Fallback: prime parole=nome. */
function splitNome(raw, cf) {
    const words = String(raw || "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
    if (words.length < 2) return { nome: raw.trim(), cognome: "" };
    const cfU = String(cf || "").toUpperCase();
    const okCf = /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/.test(cfU);
    const tent = [];
    for (let k = 1; k < words.length; k++) {
        tent.push({ cognome: words.slice(0, k).join(" "), nome: words.slice(k).join(" ") });   // COGNOME NOME
        tent.push({ nome: words.slice(0, k).join(" "), cognome: words.slice(k).join(" ") });   // NOME COGNOME
    }
    if (okCf) {
        for (const t of tent) {
            if (codeCognome(t.cognome) === cfU.slice(0, 3) && codeNome(t.nome) === cfU.slice(3, 6)) return t;
        }
        for (const t of tent) if (codeCognome(t.cognome) === cfU.slice(0, 3)) return t;
    }
    return { nome: words.slice(0, -1).join(" "), cognome: words[words.length - 1] };   // fallback: ultima parola = cognome
}
const titolo = (s) => String(s || "").trim().toLowerCase().replace(/(^|\s)\w/g, (c) => c.toUpperCase());
function dataUs(s) {   // formati MISTI nel file: "7/3/26" (M/D/YY) ma anche "18/07/26" (D/M) → normalizza; fuori range → null
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(s || "").trim());
    if (!m) return null;
    let a = Number(m[1]), b = Number(m[2]);
    let y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    let mese = a, giorno = b;
    if (a > 12 && b <= 12) { mese = b; giorno = a; }        // era D/M
    if (mese < 1 || mese > 12 || giorno < 1 || giorno > 31 || y < 2025 || y > 2027) return null;
    return `${y}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`;
}

(async () => {
    await db.connect();
    console.log(ESEGUI ? "⚠️  MODALITÀ ESECUZIONE" : "👀 DRY RUN — aggiungi --esegui per applicare");
    const wb = XLSX.readFile("/Users/macbookl/My Drive/Downloads D/VDL Luglio 2026.xlsx");

    // brand esatti in uso nelle pratiche (per non inventare grafie)
    const brandsDb = (await db.query(`select distinct brand from calls where brand <> ''`)).rows.map((r) => r.brand);
    console.log("brand in uso a DB:", brandsDb.join(" | "));

    // code a 9 cifre già presenti (numero o cellulare di qualsiasi pratica)
    const esist = new Set();
    (await db.query(`select regexp_replace(coalesce(numero,''),'\\D','','g') n1, regexp_replace(coalesce(cellulare,''),'\\D','','g') n2 from calls`)).rows
        .forEach((r) => { [r.n1, r.n2].forEach((n) => { if (n && n.length >= 9) esist.add(n.slice(-9)); }); });

    const now = new Date().toISOString();
    const out = [];
    const saltate = { senzaNumero: 0, giaPresenti: 0, doppiFile: 0, esitoIgnoto: 0 };
    const vistiFile = new Set();
    const perCaller = {}, perStato = {}, perTab = {};

    for (const cfg of TABS) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[cfg.tab], { header: 1, raw: false }).slice(1);
        const rowsRaw = XLSX.utils.sheet_to_json(wb.Sheets[cfg.tab], { header: 1, raw: true }).slice(1);
        for (let ri = 0; ri < rows.length; ri++) {
            const r = rows[ri];
            if (!r) continue;
            const cfRaw = String(r[1] || "").trim().toUpperCase().replace(/\s+/g, "");
            // NUMERO dal valore GREZZO (le celle numeriche col +39 finivano in
            // notazione scientifica e il testo formattato le troncava: 3.93398E+11)
            const rawCell = (rowsRaw[ri] || [])[2];
            let num = typeof rawCell === "number" ? String(Math.round(rawCell)) : String(r[2] || "").replace(/\D/g, "");
            num = num.replace(/\D/g, "");
            if (num.length >= 12 && num.startsWith("39")) num = num.slice(2);   // via il prefisso internazionale
            if (cfRaw.length < 6 && num.length < 8) continue;   // riga vuota
            if (num.length < 8) { saltate.senzaNumero++; continue; }                 // regola Luca #3
            const coda = num.slice(-9);
            if (esist.has(coda)) { saltate.giaPresenti++; continue; }                // regola Luca #4
            if (vistiFile.has(coda)) { saltate.doppiFile++; continue; }
            vistiFile.add(coda);

            const esitoRaw = String(r[cfg.esito] || "").trim().toLowerCase();
            const stato = ESITO_MAP[esitoRaw] || (esitoRaw ? null : "Da richiamare");
            if (stato === null) { saltate.esitoIgnoto++; console.log("  ❓ esito ignoto:", esitoRaw, "→ riga saltata (", r[0], ")"); continue; }

            const { nome, cognome } = splitNome(String(r[0] || ""), cfRaw);
            const callerRaw = String(r[cfg.caller] || "").trim().toLowerCase();
            const caller = CALLER_MAP[callerRaw] || "";
            const brand = cfg.brand || BRAND_J[String(r[cfg.brandCol] || "").trim().toUpperCase()] || "Sky";
            const negozio = titolo(r[cfg.negozio]);
            const dataPresa = dataUs(r[3]);
            const dataApp = dataUs(r[4]);
            const note = cfg.note != null ? String(r[cfg.note] || "").trim() : "";
            const esitoOrig = String(r[cfg.esito] || "").trim();

            out.push({
                tipo_cliente: "consumer",
                nome: titolo(nome), cognome: titolo(cognome),
                cf: /^[A-Z0-9]{16}$/.test(cfRaw) ? cfRaw : "", piva: "",
                numero: num, cellulare: num,
                brand, obiettivo: cfg.obiettivo, provenienza: cfg.prov, tipologia: "DTS",
                stato, caller,
                negozio_appuntamento: negozio,
                data_appuntamento: dataApp,
                data_chiamata: dataPresa ? dataPresa + "T12:00:00+02:00" : now,
                negozio_provenienza: cfg.negOrigine != null ? titolo(r[cfg.negOrigine]) : "",
                mese_provenienza: "", anno_provenienza: "",
                agente: "", indirizzo: "", segnalatore: "", campagna: "", whatsapp: "",
                note, data_richiamo: null, da_esitare: false,
                storico: JSON.stringify([{
                    data: now, caller: "Import VDL", campo: "Importazione", da: "",
                    a: `Import VDL Luglio 2026 (tab ${cfg.tab.split(" ")[0]}) — esito di luglio: ${esitoOrig || "—"}${dataPresa ? " · presa app. " + dataPresa : ""}`,
                }]),
                _tab: cfg.tab.split(" ")[0],
            });
            perTab[cfg.tab.split(" ")[0]] = (perTab[cfg.tab.split(" ")[0]] || 0) + 1;
            perCaller[caller || "(senza caller)"] = (perCaller[caller || "(senza caller)"] || 0) + 1;
            perStato[stato] = (perStato[stato] || 0) + 1;
        }
    }

    console.log(`\nDA IMPORTARE: ${out.length}`);
    console.log("per tab:    ", JSON.stringify(perTab));
    console.log("per caller: ", JSON.stringify(perCaller));
    console.log("per stato:  ", JSON.stringify(perStato));
    console.log("saltate:    ", JSON.stringify(saltate));
    console.log("\nCAMPIONE (5):");
    out.slice(0, 5).forEach((x) => console.log(`  ${x._tab} | ${x.cognome} ${x.nome} | ${x.cf || "no-CF"} | ${x.numero} | ${x.brand}/${x.obiettivo} | ${x.stato} | app.${x.data_appuntamento || "—"} | ${x.caller} | neg.${x.negozio_appuntamento}`));

    if (ESEGUI && out.length) {
        let n = 0;
        for (const x of out) {
            const { _tab, ...row } = x;
            const cols = Object.keys(row);
            const vals = cols.map((_, i) => "$" + (i + 1));
            await db.query(`insert into calls (${cols.join(",")}) values (${vals.join(",")})`, cols.map((k) => row[k]));
            n++;
        }
        console.log(`\nAPPLICATO ✅ — inserite ${n} pratiche`);
    }
    await db.end();
})().catch((e) => { console.error("ERRORE:", e.message); process.exit(1); });
