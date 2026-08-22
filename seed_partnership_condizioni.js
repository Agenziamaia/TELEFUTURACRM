// PARTNERSHIP REWARD W3 — condiziona le righe evento (Luca 21/08 notte:
// «della gara CB a punti hai tutti i target e i valori: costruisci tutto»).
// Le righe erano segnaposto a condizioni vuote (il catch-all del 20/08, oggi
// escluse dal pick-one): qui prendono le CONDIZIONI vere mappate sul
// catalogo CB del CRM, sdoppiandosi dove l'evento copre più offerte (il
// matcher è a uguaglianze esatte). Le voci non ancora registrabili restano
// SENZA condizioni (per costruzione non matchano mai) con la nota del perché.
// Mappatura (lettera → CRM):
//   MIA/CYC Untied 2pt      → Cambio Offerta · CL0 | CL1 | CL2
//   MIA Easy Pay 4pt        → Cambio Offerta · CL1 EP | CL2 EP
//   Telefono a rate 6pt     → Telefono a Rate · Tel. Rate CB
//   Telefono finanziato 8pt → Telefono a Rate · Finanziato CB
//   Migrazione CB fibra 2pt → Cambio Offerta · Migrazione FTTH
//   Netflix su CB 4pt       → Add-On · Fissi · opzione Netflix (da confermare)
//   Reload Exchange 2pt     → Add-On · Mobili · opzione Reload Forever (da confermare)
//   Caring 1pt              → Cambio Offerta · Caring
//   Rivincoli / Microbusiness / WLR→FTTC / PSCU add-on → NON a catalogo: senza condizioni.
// Uso: node seed_partnership_condizioni.js [--apply]
const { readFileSync, writeFileSync } = require("fs");
const env = readFileSync(new URL("./.env.local", "file://" + __dirname + "/"), "utf8");
for (const r of env.split("\n")) { const m = r.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim(); }
const U = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: K, Authorization: "Bearer " + K, "Content-Type": "application/json" };
const APPLY = process.argv.includes("--apply");
const CB = "Customer Base", CO = "Cambio Offerta", TR = "Telefono a Rate";

(async () => {
    const righe = await fetch(`${U}/rest/v1/pay_righe?brand=eq.windtre&month=eq.2026-08-01&lato=eq.azienda&pista=eq.partnership&select=*&order=ordine`, { headers: H }).then((x) => x.json());
    if (!Array.isArray(righe) || !righe.length) { console.log("righe partnership non trovate", JSON.stringify(righe).slice(0, 150)); process.exit(1); }
    writeFileSync("dump_partnership_pre.json", JSON.stringify(righe, null, 1));
    console.log(`dump pre: dump_partnership_pre.json (${righe.length} righe, locale/gitignorato)`);
    const perOrd = new Map(righe.map((r) => [r.ordine, r]));

    // update del capo-riga + eventuali cloni per le offerte sorelle
    const piani = [
        { ord: 1, patch: { categoria: CB, prodotto: CO, offerta: "CL0", note: "evento Partnership · vale per CL0/CL1/CL2 (righe gemelle)" }, cloni: ["CL1", "CL2"] },
        { ord: 2, patch: { categoria: CB, prodotto: CO, offerta: "CL1 EP", note: "evento Partnership · vale per CL1 EP/CL2 EP (righe gemelle)" }, cloni: ["CL2 EP"] },
        { ord: 3, patch: { note: "NON registrabile oggi (Rivincoli non a catalogo): resta fuori dal conteggio finché non si traccia" } },
        { ord: 4, patch: { categoria: TR, prodotto: "Tel. Rate CB", note: "evento Partnership · telefono a rate su Customer Base" } },
        { ord: 5, patch: { categoria: TR, prodotto: "Finanziato CB", note: "evento Partnership · telefono finanziato su Customer Base" } },
        { ord: 6, patch: { note: "NON registrabile oggi (cambio Microbusiness non a catalogo)" } },
        { ord: 7, patch: { categoria: CB, prodotto: CO, offerta: "Migrazione FTTH", note: "evento Partnership · migrazione CB verso fibra" } },
        { ord: 8, patch: { note: "NON registrabile oggi (migrazione WLR→FTTC non a catalogo)" } },
        { ord: 9, patch: { categoria: CB, prodotto: "Add-On", offerta: "Fissi", opzione: "Netflix", note: "evento Partnership · mappato su Add-On Fissi + Netflix — da confermare con Luca" } },
        { ord: 10, patch: { categoria: CB, prodotto: "Add-On", offerta: "Mobili", opzione: "Reload Forever", note: "evento Partnership · lettera dice Reload Exchange: mappato su Reload Forever — da confermare con Luca" } },
        { ord: 11, patch: { note: "NON registrabile oggi (Più Sicuri C&U come add-on CB non a catalogo)" } },
        { ord: 12, patch: { categoria: CB, prodotto: CO, offerta: "Caring", note: "evento Partnership · offerte speciali di Caring" } },
    ];

    for (const p of piani) {
        const r = perOrd.get(p.ord);
        if (!r) { console.log(`⚠ ordine ${p.ord} assente`); continue; }
        console.log(`${APPLY ? "→" : "(anteprima)"} ord${p.ord} ${r.nome.slice(0, 48)}…  ${JSON.stringify(p.patch)}${p.cloni ? ` + cloni ${p.cloni.join(",")}` : ""}`);
        if (!APPLY) continue;
        let res = await fetch(`${U}/rest/v1/pay_righe?id=eq.${r.id}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(p.patch) });
        if (!res.ok) { console.log("  ✗ patch:", res.status, await res.text()); continue; }
        for (const off of p.cloni || []) {
            const { id, created_at, ...resto } = r;
            const clone = { ...resto, ...p.patch, offerta: off };
            res = await fetch(`${U}/rest/v1/pay_righe`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(clone) });
            if (!res.ok) console.log(`  ✗ clone ${off}:`, res.status, await res.text());
        }
    }
    console.log(APPLY ? "APPLICATO ✅" : "\n(anteprima — rilancia con --apply)");
})();
