// ONE-SHOT VF dalla lettera agosto (correzioni Luca 19/08 sera):
// ① smartphone = categoria GETTONE (pay one-shot fuori dalle griglie a soglia;
//    i punti 0,5/1 restano sulla pista mobile per il conteggio col cap):
//    tab 3.1 → rateale XS-M 8€ · rateale L-XL 20€ · finanziamento S-M 20€ · L 40€;
// ② SIM dati: 0 punti in soglia (lettera riga «non saranno considerate») ma
//    pay one-shot da 3.1 (Wallet 10€ · Smart Pay 25€) — così escono dalla sonda;
// ③ CB minori in Gettoni: MM4M Start 5€ · MM4M Pro/Ultra 10€ (tab 2.1) ·
//    Trasloco 40€ in promo (tab 3.1).
// Uso: node fix_vf_oneshot_lettera.js [--apply]
const fs = require("fs");
const env = fs.readFileSync(__dirname + "/.env.local", "utf8");
const url = (env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/) || [])[1].trim();
const key = (env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/) || [])[1].trim();
const H = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation" };
const APPLY = process.argv.includes("--apply");
const M = "2026-08-01", B = "vodafone";

const PAY_FASCE = [
    { offerta: "TNP XS-M", pay: 8 },
    { offerta: "TNP L-XL", pay: 20 },
    { offerta: "Smartphone Easy S-M", pay: 20 }, { offerta: "Smartphone Easy S-M CB", pay: 20 },
    { offerta: "Smartphone Easy L-XL", pay: 40 }, { offerta: "Smartphone Easy L-XL CB", pay: 40 },
];
const NUOVE_FASCE = [
    { prodotto: "Finanziato CB", offerta: "Compass Flexypay S-M CB", pay: 20, punti: 1, nome: "Finanziamento S-M (Compass Flexypay)" },
    { prodotto: "Finanziato CB", offerta: "Compass Flexypay L-XL CB", pay: 40, punti: 1, nome: "Finanziamento L (Compass Flexypay)" },
];
const SIM_DATI = [
    { offerta: "Ric Dati", pay: 10, nome: "SIM dati Wallet (fuori soglia)" },
    { offerta: "Abbonamento Dati", pay: 25, nome: "SIM dati Smart Pay (fuori soglia)" },
];
const CB = [
    { offerta: "MM4M Start", pay: 5, nome: "MM4M Start" },
    { offerta: "MM4M Pro", pay: 10, nome: "MM4M Pro" },
    { offerta: "MM4M Ultra", pay: 10, nome: "MM4M Ultra" },
    { offerta: "Trasloco", pay: 40, nome: "Trasloco rete fissa (in promo)" },
];

(async () => {
    const righe = await fetch(`${url}/rest/v1/pay_righe?select=id,nome,lato,pista,categoria,prodotto,offerta,punti,pay_base,gettone,brand_vendita&brand=eq.${B}&month=eq.${M}&limit=400`, { headers: H }).then((r) => r.json());
    const patch = [], inserts = [];

    // ① smartphone → gettone (tutte le righe telefono, generiche e per fascia)
    for (const r of righe.filter((x) => /telefono a rate/i.test(String(x.categoria || "")) || /TNP|Smartphone Easy/i.test(String(x.offerta || "")))) {
        const fascia = PAY_FASCE.find((f) => String(r.offerta || "").trim() === f.offerta);
        const upd = { gettone: true };
        if (fascia && r.pay_base !== fascia.pay) upd.pay_base = fascia.pay;
        if (!r.gettone || (fascia && r.pay_base !== fascia.pay)) patch.push({ id: r.id, nome: r.nome, lato: r.lato, upd });
    }
    // fasce Compass Flexypay mancanti (entrambi i lati)
    for (const lato of ["azienda", "ragazzi"]) {
        for (const f of NUOVE_FASCE) {
            if (!righe.some((r) => r.lato === lato && String(r.offerta || "") === f.offerta)) {
                inserts.push({ brand: B, month: M, lato, pista: "mobile", nome: f.nome, categoria: "Telefono a Rate", prodotto: f.prodotto, offerta: f.offerta, punti: f.punti, pay_base: f.pay, pay_tiers: [], gettone: true, attivo: true, ordine: 920, brand_vendita: "vodafone", note: "Tab 3.1 lettera agosto; punti in pista mobile col cap 35%." });
            }
        }
    }
    // ② SIM dati (0 punti, pay one-shot) — entrambi i lati
    for (const lato of ["azienda", "ragazzi"]) {
        for (const s of SIM_DATI) {
            if (!righe.some((r) => r.lato === lato && String(r.offerta || "") === s.offerta)) {
                inserts.push({ brand: B, month: M, lato, pista: "mobile", nome: s.nome, categoria: null, prodotto: null, offerta: s.offerta, punti: 0, pay_base: s.pay, pay_tiers: [], gettone: true, attivo: true, ordine: 930, brand_vendita: "vodafone", note: "Lettera agosto: le SIM dati non concorrono alla soglia; pay one-shot da tab 3.1." });
            }
        }
    }
    // ③ CB minori in Gettoni — entrambi i lati
    for (const lato of ["azienda", "ragazzi"]) {
        for (const cb of CB) {
            if (!righe.some((r) => r.lato === lato && String(r.offerta || "") === cb.offerta)) {
                inserts.push({ brand: B, month: M, lato, pista: null, nome: cb.nome, categoria: "Customer Base", prodotto: null, offerta: cb.offerta, punti: 0, pay_base: cb.pay, pay_tiers: [], gettone: true, attivo: true, ordine: 940, brand_vendita: "vodafone", note: cb.offerta === "Trasloco" ? "Tab 3.1: 40€ in promo (mese di agosto)." : "Tab 2.1 lettera agosto (rinnovo a M+1); concorre al volume upselling della completezza (tab 4.2)." });
            }
        }
    }

    console.log("PATCH gettone/pay su righe esistenti:", patch.length);
    patch.forEach((p) => console.log(`  [${p.lato}] «${p.nome}» → ${JSON.stringify(p.upd)}`));
    console.log("INSERT nuove righe:", inserts.length);
    inserts.forEach((i) => console.log(`  [${i.lato}] «${i.nome}» off:${i.offerta} pay:${i.pay_base} punti:${i.punti}`));
    if (!APPLY) { console.log("\n(anteprima — rilancia con --apply)"); return; }
    for (const p of patch) {
        const r = await fetch(`${url}/rest/v1/pay_righe?id=eq.${p.id}`, { method: "PATCH", headers: H, body: JSON.stringify(p.upd) }).then((x) => x.json());
        if (!Array.isArray(r) || !r.length) console.log("PATCH ERR", p.nome);
    }
    if (inserts.length) {
        const r = await fetch(`${url}/rest/v1/pay_righe`, { method: "POST", headers: H, body: JSON.stringify(inserts) }).then((x) => x.json());
        console.log(Array.isArray(r) ? `✅ inserite ${r.length}` : "INSERT ERR " + JSON.stringify(r).slice(0, 150));
    }
    console.log("✅ fatto");
})();
