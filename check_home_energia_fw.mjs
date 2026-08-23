// DIAGNOSI Luce&Gas Fastweb assenti dalla Home (Luca 23/08, caso Bazzucchi).
// Replica del percorso dati dei widget: caricaContrattiMese("Fastweb") →
// smistamento contestoVfFw (T1 → gara Vodafone, altrimenti T2 → widget FW).
// Uso: npx tsx check_home_energia_fw.mjs   (sola lettura)
import { readFileSync } from "fs";

const env = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
for (const riga of env.split("\n")) {
    const m = riga.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
}

async function main() {
    const { caricaContrattiMese, contestoVfFw } = await import("./src/lib/commissioning");
    const YM = "2026-08-01";
    const rfw = await caricaContrattiMese("Fastweb", YM);
    console.log(`Contratti Fastweb ${YM}: ${rfw.length}`);
    const energia = rfw.filter((c) => /^energia/i.test(String(c.categoria || "")));
    console.log(`di cui ENERGIA: ${energia.length}`);
    let t1 = 0, t2 = 0;
    for (const c of energia) {
        const ctx = contestoVfFw("fastweb", c.cod_ins, c.negozio, c.categoria);
        if (ctx === "vodafone") t1++; else t2++;
    }
    console.log(`smistamento: T1 (→ widget Vodafone) = ${t1} · T2 (→ widget Fastweb) = ${t2}`);
    console.log("\n── Le vendite energia di Bazzucchi ──");
    for (const c of energia.filter((c) => /bazzucchi/i.test(String(c.venditore || "")))) {
        console.log(`  ${c.id} · ${c.prodotto} · ${c.offerta} · negozio=${c.negozio} · cod_ins=${c.cod_ins ?? "(vuoto)"} · data=${c.data} · stato=${c.stato} → ${contestoVfFw("fastweb", c.cod_ins, c.negozio, c.categoria) === "vodafone" ? "T1/Vodafone" : "T2/Fastweb"}`);
    }
    console.log("\n── Tutta l'energia FW del mese (venditore · negozio · cod_ins → lato) ──");
    for (const c of energia) {
        console.log(`  ${String(c.venditore || "—").padEnd(24)} ${String(c.negozio || "—").padEnd(14)} ${String(c.cod_ins ?? "—").padEnd(12)} → ${contestoVfFw("fastweb", c.cod_ins, c.negozio, c.categoria) === "vodafone" ? "T1" : "T2"}`);
    }
}
main().catch((e) => { console.error("ERRORE:", e.message); process.exit(1); });
