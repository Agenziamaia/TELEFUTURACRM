// Seed righe SMARTPHONE pista mobile Vodafone (lettera agosto, §Pista Mobile
// Consumer riga «gli Smartphone GA e CB, con valore 0,5 in modalità rateale e
// 1 in finanziamento Compass/Findomestic, fino ad un cap del 35%…»):
// 4 combinazioni (rateale/finanziato × GA/CB) × 2 lati × 2 brand di vendita
// (vodafone + fastweb: la lettera fa calderone unico sui VS). Il CAP 35% vive
// nel motore (calcolaAvanzamento) e nel widget, non nelle righe.
// Uso: node seed_vf_smartphone_punti.js [--apply]
const fs = require("fs");
const env = fs.readFileSync(__dirname + "/.env.local", "utf8");
const url = (env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/) || [])[1].trim();
const key = (env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/) || [])[1].trim();
const H = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation" };
const APPLY = process.argv.includes("--apply");

const NOTE = "Lettera VF agosto §Pista Mobile Consumer: smartphone GA/CB 0,5 rateale · 1 finanziamento, fino al cap 35% del valore SIM (il cap lo applica il motore). Commissionale tabella 3.1 da seminare a parte.";
const COMBOS = [
    { prodotto: "Tel. Rate", punti: 0.5, nome: "Smartphone rateale · GA" },
    { prodotto: "Tel. Rate CB", punti: 0.5, nome: "Smartphone rateale · CB" },
    { prodotto: "Finanziato", punti: 1, nome: "Smartphone finanziato · GA" },
    { prodotto: "Finanziato CB", punti: 1, nome: "Smartphone finanziato · CB" },
];

(async () => {
    // guardia anti-doppio: righe telefono già presenti?
    const esistenti = await fetch(url + "/rest/v1/pay_righe?select=id,nome,lato,brand_vendita&brand=eq.vodafone&month=eq.2026-08-01&pista=eq.mobile&categoria=eq.Telefono a Rate", { headers: H }).then((r) => r.json());
    console.log("Righe telefono già presenti:", Array.isArray(esistenti) ? esistenti.length : JSON.stringify(esistenti).slice(0, 120));
    if (Array.isArray(esistenti) && esistenti.length) { console.log("Niente da fare (già seminate):"); esistenti.forEach((r) => console.log("  " + r.lato + "/" + r.brand_vendita + " " + r.nome)); return; }

    const righe = [];
    let ordine = 900;
    for (const lato of ["azienda", "ragazzi"]) {
        for (const bv of ["vodafone", "fastweb"]) {
            for (const c of COMBOS) {
                righe.push({
                    brand: "vodafone", month: "2026-08-01", lato, pista: "mobile",
                    nome: c.nome + (bv === "fastweb" ? " FW" : ""),
                    tipo_cliente: null, categoria: "Telefono a Rate", prodotto: c.prodotto, offerta: null,
                    punti: c.punti, pay_base: 0, pay_tiers: [0, 0, 0, 0, 0, 0],
                    gettone: false, attivo: true, note: NOTE, ordine: ordine++, brand_vendita: bv,
                });
            }
        }
    }
    console.log("Da inserire:", righe.length, "righe");
    righe.forEach((r) => console.log("  " + r.lato.padEnd(8) + r.brand_vendita.padEnd(9) + r.nome.padEnd(28) + " " + r.prodotto.padEnd(14) + " punti:" + r.punti));
    if (!APPLY) { console.log("\n(anteprima — rilancia con --apply per scrivere)"); return; }
    const res = await fetch(url + "/rest/v1/pay_righe", { method: "POST", headers: H, body: JSON.stringify(righe) }).then((r) => r.json());
    console.log(Array.isArray(res) ? "✅ inserite " + res.length + " righe" : "ERR " + JSON.stringify(res).slice(0, 200));
})();
