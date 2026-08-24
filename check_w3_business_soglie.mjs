// DIAGNOSI business W3 che non avanza nelle soglie consumer (Luca 24/08).
// Specifica (docs/MOTORE_GARE_W3.md): il business e' una COMPONENTE delle
// piste mobile/fisso (flag piva: molt +1; fisso anche punti +0,5) → i suoi
// punti DEVONO sommarsi alle soglie consumer. Qui: tutte le vendite W3
// Business del mese → match col tabellare ragazzi → pista e punti agganciati.
// Uso: npx tsx check_w3_business_soglie.mjs   (sola lettura)
import { readFileSync } from "fs";

const env = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
for (const riga of env.split("\n")) {
    const m = riga.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
}

async function main() {
    const { caricaContrattiMese, caricaTabellare, matchRigheAttivazione, puntiPerRighe, brandIdDaLabel } =
        await import("./src/lib/commissioning");
    const YM = "2026-08-01";
    const [rw3, tw3] = await Promise.all([
        caricaContrattiMese("WindTre", YM),
        caricaTabellare("windtre", YM),
    ]);
    const biz = rw3.filter((c) => String(c.tipo_cliente || "").toLowerCase() === "business");
    console.log(`Contratti W3 ${YM}: ${rw3.length} · BUSINESS: ${biz.length}`);

    let ok = 0, zero = 0, ptTot = 0;
    const perPista = new Map();
    const senza = [];
    for (const c of biz) {
        const set = matchRigheAttivazione(tw3.righe, c, brandIdDaLabel(c.brand) || "windtre");
        if (set.length) {
            ok++;
            const p = puntiPerRighe(set);
            ptTot += p;
            const k = set[0]?.pista || "?";
            const r = perPista.get(k) || { n: 0, pt: 0 };
            r.n++; r.pt += p;
            perPista.set(k, r);
        } else {
            zero++;
            senza.push(c);
        }
    }
    console.log(`agganciate: ${ok} (${Math.round(ptTot * 100) / 100} pt) · SENZA riga: ${zero}`);
    for (const [k, r] of perPista) console.log(`  pista ${k}: ${r.n} vendite · ${Math.round(r.pt * 100) / 100} pt`);

    console.log(`\n── BUSINESS senza aggancio (categoria · prodotto · offerta) ──`);
    const gruppi = new Map();
    for (const c of senza) {
        const k = `${c.categoria || "—"} · ${c.prodotto || "—"} · ${c.offerta || "—"}`;
        gruppi.set(k, (gruppi.get(k) || 0) + 1);
    }
    for (const [k, n] of [...gruppi.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)} × ${k}`);

    // dettaglio delle agganciate: punti per vendita (per capire se il flag
    // piva sta scattando — il moltiplicatore non si vede dai punti, ma la
    // pista sì; stampo anche le prime 8 con le righe matchate)
    console.log(`\n── Prime agganciate (pista · punti · righe) ──`);
    let mostrate = 0;
    for (const c of biz) {
        if (mostrate >= 8) break;
        const set = matchRigheAttivazione(tw3.righe, c, brandIdDaLabel(c.brand) || "windtre");
        if (!set.length) continue;
        mostrate++;
        console.log(`  ${c.id} · ${c.categoria} · ${c.prodotto} · ${c.offerta} → pista ${set[0]?.pista} · ${puntiPerRighe(set)} pt · [${set.map((r) => r.prodotto || r.nome || r.pista).join(" + ")}]`);
    }
}
main().catch((e) => { console.error("ERRORE:", e.message); process.exit(1); });
