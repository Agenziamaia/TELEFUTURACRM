// PROVA DELLA LETTURA DEL FOGLIO UFFICIALE.
// Lancio:  node scripts/prova_avanzamento.mjs
// Costruisce a mano dei fogli come quelli che mandano gli operatori (titolo in
// cima, numeri all'italiana, colonne di troppo) e controlla che ne esca quello
// che deve uscire. Nessun browser, nessun database.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url ? new URL(".", import.meta.url).pathname : __dirname, { interopDefault: true });
const F = jiti("../src/lib/avanzamentoFoglio.ts");
const XLSX = require("xlsx");

const PISTE = [{ chiave: "mobile", nome: "Mobile" }, { chiave: "fisso", nome: "Fisso" }, { chiave: "cb", nome: "Customer Base" }];
let ko = 0;
const dico = (t, atteso, avuto) => {
    const a = JSON.stringify(atteso), b = JSON.stringify(avuto);
    if (a === b) { console.log("  ok  " + t); return; }
    ko++; console.log("  KO  " + t + "\n      atteso: " + a + "\n      avuto:  " + b);
};

// ── 1. foglio tipico: titolo in cima, intestazione alla riga 3 ──────────────
{
    const aoa = [
        ["AVANZAMENTO GARA AGOSTO 2026", "", "", ""],
        ["aggiornato al 25/08/2026", "", "", ""],
        ["Cod. Ins.", "Mobile", "Fisso", "Customer Base"],
        ["MAGLIANA", "30", "12,5", "8"],
        ["COLLATINA", "1.240", "", "3"],
        ["", "", "", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const righe = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
    const pulite = F.pulisciGriglia(righe);
    const { head, corpo } = F.trovaIntestazione(pulite);
    dico("intestazione trovata", ["Cod. Ins.", "Mobile", "Fisso", "Customer Base"], head);
    dico("corpo senza righe vuote", 2, corpo.length);
    const mappa = F.proponiMappa(head, PISTE);
    dico("mappa proposta", [F.COL_CODICE, "Mobile", "Fisso", "Customer Base"], mappa);
    const out = F.righeDaGriglia(corpo, mappa, PISTE);
    dico("righe lette", [
        { cod_gara: "MAGLIANA", pista: "mobile", punti: 30, pezzi: null },
        { cod_gara: "MAGLIANA", pista: "fisso", punti: 12.5, pezzi: null },
        { cod_gara: "MAGLIANA", pista: "cb", punti: 8, pezzi: null },
        { cod_gara: "COLLATINA", pista: "mobile", punti: 1240, pezzi: null },
        { cod_gara: "COLLATINA", pista: "cb", punti: 3, pezzi: null },
    ], out);
}

// ── 2. la cella VUOTA non è uno zero ────────────────────────────────────────
dico("cella vuota → null", null, F.numeroIt(""));
dico("zero vero → 0", 0, F.numeroIt("0"));
dico("migliaia all'italiana", 1240, F.numeroIt("1.240"));
dico("decimale all'italiana", 12.5, F.numeroIt("12,5"));
dico("testo → null", null, F.numeroIt("n.d."));
dico("numero sporco", 30, F.numeroIt(" 30 pt"));

// ── 3. senza la colonna del codice non si salva niente ──────────────────────
{
    const out = F.righeDaGriglia([["MAGLIANA", "30"]], [F.COL_IGNORA, "Mobile"], PISTE);
    dico("senza colonna codice → niente", [], out);
}

// ── 4. le colonne ignorate restano fuori ────────────────────────────────────
{
    const out = F.righeDaGriglia([["MAGLIANA", "30", "999"]], [F.COL_CODICE, "Mobile", F.COL_IGNORA], PISTE);
    dico("colonna ignorata esclusa", [{ cod_gara: "MAGLIANA", pista: "mobile", punti: 30, pezzi: null }], out);
}

// ── 5. intestazione già in prima riga (file senza titolo) ───────────────────
{
    const pulite = F.pulisciGriglia([["Codice", "Mobile"], ["MAGLIANA", "5"]]);
    const { i, head } = F.trovaIntestazione(pulite);
    dico("intestazione in riga 1", [0, ["Codice", "Mobile"]], [i, head]);
}

// ── 6. casi che avevano fatto sbagliare la prima versione ───────────────────
dico("trattino → null", null, F.numeroIt("-"));
dico("trattino lungo → null", null, F.numeroIt("—"));
dico("decimale all'inglese resta tale", 1.5, F.numeroIt("1.5"));
dico("due gruppi di migliaia", 1234567, F.numeroIt("1.234.567"));
dico("migliaia + decimali", 1234.5, F.numeroIt("1.234,5"));

// ── 7. i difetti trovati dal revisore del 31/08 ─────────────────────────────
{
    // «Insegna» non è il codice di inserimento
    const head = ["Cod. Ins.", "Mobile Consumer", "Mobile Business", "Fisso", "Insegna", "Codice PDV"];
    const m = F.proponiMappa(head, PISTE);
    dico("«Insegna» non è il codice", F.COL_IGNORA, m[4]);
    dico("«Cod. Ins.» è il codice", F.COL_CODICE, m[0]);
    dico("«Codice PDV» dice di essere il codice", F.COL_CODICE, m[5]);
    const d = F.diagnosiMappa(head, m, PISTE);
    dico("due colonne rivendicano il codice", [0, 5], d.codici);
    dico("due colonne sulla stessa pista", [{ pista: "Mobile", colonne: ["Mobile Consumer", "Mobile Business"] }], d.sommate);
    // e i due mobile si SOMMANO invece di sovrascriversi
    const out = F.righeDaGriglia([["MAGLIANA", "28", "5", "12", "x", "y"]], m, PISTE);
    dico("consumer + business = un mobile solo", [
        { cod_gara: "MAGLIANA", pista: "mobile", punti: 33, pezzi: null },
        { cod_gara: "MAGLIANA", pista: "fisso", punti: 12, pezzi: null },
    ], out);
}
{
    const d = F.diagnosiMappa(["A", "B"], [F.COL_IGNORA, "Mobile"], PISTE);
    dico("nessuna colonna codice", true, d.senzaCodice);
    const d2 = F.diagnosiMappa(["A", "B"], [F.COL_CODICE, F.COL_IGNORA], PISTE);
    dico("nessuna pista", true, d2.senzaPiste);
}

// ── 8. i numeri INVENTATI trovati dal revisore ──────────────────────────────
for (const [cella, atteso] of [
    ["30/40", null], ["12,5 pt su 20", null], ["3 (di cui 1 biz)", null], ["25/08/2026", null],
    ["1,234.5", 1234.5], ["(12,5)", -12.5], ["85%", 85], ["12,50 €", 12.5],
    ["1'240", 1240], ["1 240", 1240], ["0,500", 0.5], ["1.234.567", 1234567],
    ["30.5", 30.5], ["1.234,5", 1234.5], ["-3", -3], ["10 pz", 10], ["3 punti", 3],
]) dico(`cella «${cella}»`, atteso, F.numeroIt(cella));

// e le celle scartate si contano
{
    const g = [["MAGLIANA", "30/40", "12"], ["COLLATINA", "n.d.", "8"]];
    const m = [F.COL_CODICE, "Mobile", "Fisso"];
    dico("celle scartate elencate", ["30/40", "n.d."], F.celleScartate(g, m, PISTE).map((x) => x.valore));
    dico("le righe buone restano", 2, F.righeDaGriglia(g, m, PISTE).length);
}

// ── 9. il foglio di UNA pista sola (i tre file di WindTre) ──────────────────
{
    const head = ["Punto vendita", "Cod. Ins.", "Progressivo", "Note"];
    const corpo = [["Magliana", "9000721835", "33", "ok"], ["Collatina", "9001426666", "18", ""]];
    const m = F.proponiMappaUnaPista(head, corpo, "Mobile");
    dico("una pista: codice e valore riconosciuti", [F.COL_IGNORA, F.COL_CODICE, "Mobile", F.COL_IGNORA], m);
    dico("una pista: righe lette", [
        { cod_gara: "9000721835", pista: "mobile", punti: 33, pezzi: null },
        { cod_gara: "9001426666", pista: "mobile", punti: 18, pezzi: null },
    ], F.righeDaGriglia(corpo, m, PISTE));
}
{
    // senza una colonna che si chiami «codice»: vince la prima non numerica
    const head = ["Negozio", "Agosto"];
    const corpo = [["MAGLIANA", "30"], ["COLLATINA", "12"]];
    dico("una pista: senza titolo «codice»", [F.COL_CODICE, "Fisso"], F.proponiMappaUnaPista(head, corpo, "Fisso"));
}

// ── 10. il caso vero di WindTre: due colonne che si chiamano «COD» ──────────
{
    const NOSTRI = ["9000721835", "9001154565", "9001297833", "9001426666", "9001302496"];
    const head = ["Ragione Sociale", "COD_GARA", "COD Lettera di Gara", "Canale", "Mobile Progressivo"];
    const corpo = [
        ["TELEFUTURA MAGLIANA", "9000721835", "8000788537", "Franchising", "33"],
        ["TELEFUTURA LIBIA", "9001154565", "8000299986", "Franchising", "21"],
        ["TELEFUTURA MAZZINI", "9001297833", "8000003219", "Franchising", "12"],
    ];
    // anche senza i nostri codici, adesso «COD_GARA» vince: il titolo la
    // riconosce (prima lo stacco di «COD Lettera di Gara» la batteva)
    const senza = F.proponiMappaUnaPista(head, corpo, "Mobile");
    dico("senza i codici noti: vince COD_GARA", [F.COL_CODICE, F.COL_IGNORA], [senza[1], senza[2]]);
    // con i codici noti vince la colonna che li contiene davvero
    const con = F.proponiMappaUnaPista(head, corpo, "Mobile", NOSTRI);
    dico("con i codici noti: COD_GARA è il codice", F.COL_CODICE, con[1]);
    dico("con i codici noti: la lettera si ignora", F.COL_IGNORA, con[2]);
    dico("con i codici noti: il valore è il progressivo", "Mobile", con[4]);
    dico("righe lette", [
        { cod_gara: "9000721835", pista: "mobile", punti: 33, pezzi: null },
        { cod_gara: "9001154565", pista: "mobile", punti: 21, pezzi: null },
        { cod_gara: "9001297833", pista: "mobile", punti: 12, pezzi: null },
    ], F.righeDaGriglia(corpo, con, PISTE));
    // e i codici con i punti di migliaia si riconoscono lo stesso
    dico("codice con i punti", 1, Math.round(F.quotaCodiciNoti(["9.000.721.835"], NOSTRI)));
}

console.log(ko ? `\n✗ ${ko} controlli falliti` : "\n✓ tutti i controlli passati");
process.exit(ko ? 1 : 0);
