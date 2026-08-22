// BONIFICA MALUS POST-RIAPERTURE (bug 19/08, caso Anna Micone): gli episodi
// CHIUSI nascevano misurando i segmenti coi giorni lavorativi di CALENDARIO —
// al primo tocco della pratica il congelamento (chiusure negozio) evaporava
// retroattivamente. Il codice è fixato (apertiTra in ricostruisciEpisodi);
// qui si RICALCOLANO gli episodi chiusi con fine ≥ 13/08 sul calendario
// APERTO del negozio: misura sotto soglia → tombstone; sopra ma più corta →
// giorni/importo ridotti. Mai creati episodi nuovi. Ferie BO non considerate
// (prudenziale: al massimo NON si toglie un malus d'agente).
// Uso: node bonifica_malus_riaperture.js [--apply]
const fs = require("fs");
const env = fs.readFileSync(__dirname + "/.env.local", "utf8");
const url = (env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/) || [])[1].trim();
const key = (env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/) || [])[1].trim();
const H = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation" };
const APPLY = process.argv.includes("--apply");
const DA = "2026-08-13";

const norm = (s) => String(s || "").trim().toLowerCase();
const sameStore = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };
const parseIta = (s) => { const m = String(s || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
const parseAny = (s) => { const it = parseIta(s); if (it) return it; const d = new Date(String(s || "")); return isNaN(d.getTime()) ? null : d; };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

(async () => {
    const [festivi, chiusure, stores, regole, episodi] = await Promise.all([
        fetch(`${url}/rest/v1/giorni_festivi?select=giorno`, { headers: H }).then((r) => r.json()),
        fetch(`${url}/rest/v1/chiusure_negozio?select=store,dal,al`, { headers: H }).then((r) => r.json()),
        fetch(`${url}/rest/v1/stores?select=name,domenica_aperta`, { headers: H }).then((r) => r.json()),
        fetch(`${url}/rest/v1/tracking_regole?select=categoria,senza_malus,succ_malus,malus_euro`, { headers: H }).then((r) => r.json()),
        fetch(`${url}/rest/v1/malus_storico?select=id,contract_id,categoria,negozio,venditore,nominativo,data_inizio,data_fine,giorni,importo,stato,eliminato&data_fine=gte.${DA}&order=data_fine&limit=500`, { headers: H }).then((r) => r.json()),
    ]);
    const FESTIVI = new Set((festivi || []).map((f) => String(f.giorno).slice(0, 10)));
    const DOMENICALI = (stores || []).filter((s) => s.domenica_aperta).map((s) => s.name);
    const REGOLE = Object.fromEntries((regole || []).map((r) => [r.categoria, r]));
    const giornoChiuso = (d, negozio) => {
        if (d.getDay() === 0 && !(negozio && DOMENICALI.some((s) => sameStore(s, negozio)))) return true;
        const g = ymd(d);
        if (FESTIVI.has(g)) return true;
        return (chiusure || []).some((c) => sameStore(c.store, negozio) && g >= String(c.dal).slice(0, 10) && g <= String(c.al).slice(0, 10));
    };
    const apertiTra = (a, b, negozio) => {
        const cur = new Date(a); cur.setHours(0, 0, 0, 0);
        const to = new Date(b); to.setHours(0, 0, 0, 0);
        let n = 0;
        while (cur < to) { cur.setDate(cur.getDate() + 1); if (!giornoChiuso(cur, negozio)) n++; }
        return n;
    };

    const vivi = (episodi || []).filter((e) => !e.eliminato && e.stato !== "compensato");
    console.log(`Episodi chiusi vivi con fine ≥ ${DA}: ${vivi.length}`);
    const ids = [...new Set(vivi.map((e) => e.contract_id))];
    const contratti = {};
    for (let i = 0; i < ids.length; i += 60) {
        const b = await fetch(`${url}/rest/v1/contracts?select=id,data,storia&id=in.(${ids.slice(i, i + 60).map((x) => `"${x}"`).join(",")})`, { headers: H }).then((r) => r.json());
        (b || []).forEach((c) => { contratti[c.id] = c; });
    }

    fs.writeFileSync(__dirname + "/dump_malus_riaperture_pre.json", JSON.stringify(vivi, null, 1));
    const tombstone = [], riduzioni = [], invariati = [];
    for (const e of vivi) {
        const c = contratti[e.contract_id];
        if (!c) { invariati.push([e, "contratto non trovato"]); continue; }
        const fine = new Date(e.data_fine + "T12:00:00");
        // start del segmento: ultimo evento DATATO prima della data di chiusura
        // dell'episodio; se non c'è, la data di inserimento della pratica
        const eventi = (c.storia || []).map((ev) => parseAny(ev.data)).filter((d) => d && ymd(d) < e.data_fine).sort((a, b) => a - b);
        const t0 = parseAny(c.data);
        const start = eventi.length ? eventi[eventi.length - 1] : t0;
        const primoSegmento = !eventi.length;
        if (!start) { invariati.push([e, "date non parsabili"]); continue; }
        const r = REGOLE[e.categoria] || {};
        const soglia = primoSegmento ? r.senza_malus : r.succ_malus;
        if (soglia == null) { invariati.push([e, "soglia assente"]); continue; }
        const misura = apertiTra(start, fine, e.negozio);
        const euro = Number(r.malus_euro) || Math.round(Number(e.importo) / Math.max(1, e.giorni));
        const nuoviGiorni = misura - soglia + 1;
        if (nuoviGiorni <= 0) tombstone.push({ e, misura, soglia });
        else if (nuoviGiorni < e.giorni) riduzioni.push({ e, misura, soglia, nuoviGiorni, nuovoImporto: nuoviGiorni * euro });
        else invariati.push([e, `ok (${misura} aperti ≥ soglia ${soglia})`]);
    }
    const totT = tombstone.reduce((a, x) => a + Number(x.e.importo), 0);
    const totR = riduzioni.reduce((a, x) => a + (Number(x.e.importo) - x.nuovoImporto), 0);
    console.log(`\n🗑 DA ELIMINARE (sotto soglia sul calendario aperto): ${tombstone.length} episodi · ${totT} €`);
    tombstone.forEach(({ e, misura, soglia }) => console.log(`  ${e.categoria.padEnd(14)} ${String(e.negozio).padEnd(16)} ${String(e.venditore).slice(0, 24).padEnd(24)} ${e.data_inizio}→${e.data_fine} ${e.giorni}gg ${e.importo}€ (aperti ${misura} < soglia ${soglia})`));
    console.log(`\n✂️ DA RIDURRE: ${riduzioni.length} episodi · −${totR} €`);
    riduzioni.forEach(({ e, nuoviGiorni, nuovoImporto, misura, soglia }) => console.log(`  ${e.categoria.padEnd(14)} ${String(e.negozio).padEnd(16)} ${e.data_inizio}→${e.data_fine} ${e.giorni}gg ${e.importo}€ → ${nuoviGiorni}gg ${nuovoImporto}€ (aperti ${misura}, soglia ${soglia})`));
    console.log(`\n✓ invariati: ${invariati.length}`);
    console.log(`TOTALE restituito ai ragazzi: ${totT + totR} €`);
    if (!APPLY) { console.log("\n(anteprima — rilancia con --apply)"); return; }
    const oggi = new Date().toISOString();
    for (const { e } of tombstone) {
        await fetch(`${url}/rest/v1/malus_storico?id=eq.${e.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ eliminato: true, eliminato_il: oggi, eliminato_da: "Bonifica riaperture 19/08 (bug calendario aperto)" }) });
    }
    for (const { e, nuoviGiorni, nuovoImporto } of riduzioni) {
        await fetch(`${url}/rest/v1/malus_storico?id=eq.${e.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ giorni: nuoviGiorni, importo: nuovoImporto }) });
    }
    console.log("✅ bonifica applicata (dump in dump_malus_riaperture_pre.json)");
})();
