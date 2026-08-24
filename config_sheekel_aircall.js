// CONFIG SHEEKEL + BONIFICA POSSESSO LEAD (Luca 24/08).
// ① Mappa l'utenza Aircall di Sheekel Eban (id 1860495, a listino "Sheekell"
//    con due L — per questo l'auto-aggancio per nome non è mai scattato) e la
//    sua linea "solo caller" 06 9480 1577 (id 1182351).
// ② Le 3 chiamate outbound di stamattina (09:37-09:40), scartate dal ponte
//    («agente non mappato»), vengono riversate a posteriori sulle pratiche:
//    voce storico, data_chiamata, da_esitare/NR e PASSAGGIO DI POSSESSO.
// ③ Lead lavorate da Sheekel dal 22/08 (cambi stato a suo nome nello storico,
//    caso Miozzi) con Caller ancora vecchio → possesso a lui, con voce storico.
// Lancio: node config_sheekel_aircall.js [--apply]   (senza flag: recap)
const fs = require("fs");
const path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const APPLY = process.argv.includes("--apply");
const NOME = "Sheekel Eban";
const AIRCALL_USER = 1860495;
const LINEA = "0694801577";
const DAL = "2026-08-22";

const soloCifre = (s) => String(s || "").replace(/\D/g, "");
const coda9 = (s) => { const d = soloCifre(s); return d.length >= 9 ? d.slice(-9) : d; };
const prossimoNR = (st) => { const m = /^(Cold|Hot) NR([123])$/.exec(st || ""); return m ? `${m[1]} NR${Math.min(3, Number(m[2]) + 1)}` : "Cold NR1"; };

(async () => {
    // ① mapping utenza + linea
    console.log(`① ${NOME}: aircall_user_id=${AIRCALL_USER} · linea solo-caller ${LINEA}`);
    if (APPLY) {
        const { error } = await sb.from("app_users")
            .update({ aircall_user_id: AIRCALL_USER, aircall_solo_linea: LINEA }).eq("full_name", NOME);
        console.log(error ? "  ERRORE: " + error.message : "  ✅ configurato");
    }

    // ② chiamate di stamattina non bridgiate
    const { data: evs } = await sb.from("call_events")
        .select("aircall_call_id, direction, cliente_num, answered, duration_sec, started_at, bridged, call_id")
        .eq("aircall_user_id", AIRCALL_USER).gte("started_at", "2026-08-24T00:00:00").order("started_at");
    console.log(`\n② chiamate Aircall di oggi da riversare: ${(evs || []).length}`);
    for (const ev of (evs || [])) {
        const c9 = coda9(ev.cliente_num);
        const { data: prat } = await sb.from("calls")
            .select("id, stato, caller, storico, nome, cognome, data_chiamata")
            .or(`numero.ilike.%${c9}%,cellulare.ilike.%${c9}%`)
            .order("created_at", { ascending: false }).limit(1);
        const p = prat && prat[0];
        if (!p) { console.log(`  ⚠ ${ev.cliente_num}: nessuna pratica trovata (outbound nuova? non creo a posteriori)`); continue; }
        const esito = ev.answered ? `risposta · ${ev.duration_sec ?? 0}s` : "nessuna risposta";
        console.log(`  ${APPLY ? "＋" : "·"} ${p.nome} ${p.cognome} (${p.stato}, caller ${p.caller || "—"}) ← ${esito} delle ${String(ev.started_at).slice(11, 16)}`);
        if (!APPLY) continue;
        const storico = Array.isArray(p.storico) ? [...p.storico] : [];
        storico.push({ data: ev.started_at, caller: NOME, campo: "Chiamata Aircall", da: "", a: `${ev.direction || "outbound"} · ${esito}`, aircall_call_id: ev.aircall_call_id, dettagli: null });
        const upd = { data_chiamata: ev.started_at, storico };
        if (ev.answered) upd.da_esitare = true; else upd.stato = prossimoNR(p.stato);
        if (p.caller !== NOME) {
            upd.caller = NOME;
            if (p.caller) storico.push({ data: ev.started_at, caller: NOME, campo: "caller", da: p.caller, a: NOME });
        }
        const { error } = await sb.from("calls").update(upd).eq("id", p.id);
        if (error) { console.log("    ERRORE: " + error.message); continue; }
        await sb.from("call_events").update({ call_id: p.id, bridged: true }).eq("aircall_call_id", ev.aircall_call_id);
    }

    // ③ lead con lavorazioni di Sheekel dal 22/08 e Caller vecchio
    const { data: lav } = await sb.from("calls")
        .select("id, stato, caller, storico, nome, cognome")
        .neq("caller", NOME)
        .contains("storico", JSON.stringify([{ caller: NOME }]))
        .limit(500);
    const daSwitchare = [];
    for (const c of (lav || [])) {
        const voci = (Array.isArray(c.storico) ? c.storico : [])
            .filter((v) => v && (v.campo === "Stato" || v.campo === "Chiamata Aircall"))
            .sort((a, b) => String(a.data).localeCompare(String(b.data)));
        const ultima = voci[voci.length - 1];
        if (ultima && ultima.caller === NOME && String(ultima.data).slice(0, 10) >= DAL) daSwitchare.push({ c, ultima });
    }
    console.log(`\n③ lead con ULTIMA lavorazione di ${NOME} dal ${DAL} e possesso vecchio: ${daSwitchare.length}`);
    for (const { c, ultima } of daSwitchare) {
        console.log(`  ${APPLY ? "＋" : "·"} ${c.nome} ${c.cognome} (${c.stato}) · era di ${c.caller || "—"} · ultima lavorazione ${String(ultima.data).slice(0, 10)}`);
        if (!APPLY) continue;
        const storico = [...c.storico, { data: new Date().toISOString(), caller: NOME, campo: "caller", da: c.caller || "", a: NOME, dettagli: { nota: "bonifica possesso 24/08 — la lead è di chi la lavora" } }];
        const { error } = await sb.from("calls").update({ caller: NOME, storico }).eq("id", c.id);
        if (error) console.log("    ERRORE: " + error.message);
    }
    if (!APPLY) console.log("\n(recap — rilancia con --apply per applicare)");
})().catch((e) => { console.error("ERRORE:", e.message); process.exit(1); });
