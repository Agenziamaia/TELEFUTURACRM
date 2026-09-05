import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { MODEL_FAST } from "@/lib/ai/deepseek";
import { chatAi as chat, chiavePer as hasKey } from "@/lib/ai/chatAi";
import { registraConsumo } from "@/lib/ai/consumi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* ═══ I TARGET PER PUNTO VENDITA DI WINDTRE, IN DUE TEMPI ══════════════════
   Luca 05/09/2026, il giro vero del mese:

     «A inizio mese ci arriva questo PowerPoint con le novità di commissioning
      e le soglie, ma generalizzate per categoria. Dopo 5-6 giorni arriva il
      file Excel con i target precisi di tutto. Lui dovrebbe conoscere la
      percentuale di sconto che abbiamo sui punti vendita rispetto al target
      generalizzato che trova nel PowerPoint e applicare quello; poi, appena
      inserisco il file dei target, va semplicemente ad aggiustare i target.»

   ── COME FUNZIONA DAVVERO, misurato sul «Target Wind3 Agosto.xlsx» ────────
   Il target di un negozio è il target del suo CLUSTER moltiplicato per il suo
   PESO. Non è una teoria: San Paolo è STRADA 1 a peso pieno e ha 60/90/115/140;
   Mazzini è lo stesso cluster a 0,8 e ha 48/72/92/112 — cioè 60×0,8, 90×0,8,
   115×0,8, 140×0,8. Collatina a 0,5 aveva 30/45/58/70 (115×0,5 = 57,5, arrotondato
   a 58). Da settembre Collatina passa a 0,7 (Luca 05/09).

   Cluster e peso NON si indovinano: stanno scritti nel file dell'operatore
   (colonna J e colonne E/F/G) e li teniamo su `pay_target_pdv`. Il mese nuovo
   se li porta avanti dal mese prima, e il file quando arriva li riallinea.

   ⚠️ NIENTE SI SCRIVE SENZA ANTEPRIMA. Ogni azione, chiamata senza
   `applica:true`, torna la tabella di quello che FAREBBE — negozio per
   negozio, vecchio → nuovo — e basta. Questi numeri sono la soglia che una
   persona deve raggiungere per essere pagata: si guardano prima.

   ⚠️ E IL LATO RAGAZZI NON SI TOCCA. I loro target sono impostati a mano e
   non discendono da questi (Luca 04/09): qui dentro non c'è una riga che
   scriva su `pay_piste`/`pay_soglie` lato ragazzi. */

const TAB = "pay_target_pdv";
const BRAND = "windtre";
const meseIso = (m: string) => String(m).slice(0, 7) + "-01";
const mesePrima = (m: string) => {
    const [y, mm] = meseIso(m).split("-").map(Number);
    const d = new Date(y, mm - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const meseLungo = (m: string) => {
    const [y, mm] = meseIso(m).split("-").map(Number);
    const s = new Date(y, mm - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
};

/* ⚠️ MEZZO PUNTO SI ARROTONDA IN SU, come fa l'operatore: 115 × 0,5 = 57,5 e
   nel loro file c'è scritto 58. Con `Math.round` di JavaScript ci si arriva,
   ma solo per i positivi — e questi lo sono sempre: un target non è mai
   negativo. Lo si scrive lo stesso, perché la prossima persona che legge non
   deve chiederselo. */
const arrotonda = (n: number) => Math.round(Math.abs(n)) * Math.sign(n || 1);

type Riga = {
    id: string; cod_gara: string | null; negozio: string | null; ragione_sociale: string | null;
    peso_mobile: number | null; peso_biz: number | null; peso_fix: number | null;
    cluster_mobile: string | null; soglie_mobile: number[] | null; soglie_mobile_lettera: number[] | null;
    cluster_piva: string | null; soglie_piva: number[] | null;
    cluster_fisso: string | null; soglie_fisso: number[] | null; soglie_fisso_lettera: number[] | null;
    extra: Record<string, unknown> | null;
};
const CAMPI = "id, cod_gara, negozio, ragione_sociale, peso_mobile, peso_biz, peso_fix, " +
    "cluster_mobile, soglie_mobile, soglie_mobile_lettera, cluster_piva, soglie_piva, " +
    "cluster_fisso, soglie_fisso, soglie_fisso_lettera, extra";

async function righeDi(month: string): Promise<Riga[]> {
    const { data, error } = await supabase.from(TAB).select(CAMPI)
        .eq("brand", BRAND).eq("month", month).order("negozio");
    if (error) throw new Error(`non riesco a leggere i target: ${error.message}`);
    return (data || []) as unknown as Riga[];
}

/** il cluster scritto nel file ha la posizione attaccata («STRADA 1 - 3»):
 *  per confrontarlo con quello della lettera conta la parte davanti */
const normCluster = (v: unknown) => String(v ?? "").toUpperCase().replace(/\s+/g, " ")
    .split(/[-–—]/)[0].trim();

const listaUguale = (a: unknown, b: unknown) => {
    const x = Array.isArray(a) ? a.map(Number) : null;
    const y = Array.isArray(b) ? b.map(Number) : null;
    if (!x || !y) return !x && !y;
    return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 1e-9);
};

export async function GET(request: Request) {
    const g = await accesso(request, "gare/w3-target"); if (!g.ok) return g.risposta;
    const url = new URL(request.url);
    const month = meseIso(url.searchParams.get("month") || "");
    const righe = await righeDi(month).catch(() => [] as Riga[]);
    const prima = righe.length ? [] : await righeDi(mesePrima(month)).catch(() => [] as Riga[]);
    return NextResponse.json({
        month, righe,
        mesePrima: mesePrima(month),
        prevHas: prima.length,
    });
}

export async function POST(request: Request) {
    const g = await accesso(request, "gare/w3-target"); if (!g.ok) return g.risposta;
    const body = await request.json().catch(() => ({}));
    const azione = String(body.azione || "");
    const month = meseIso(String(body.month || ""));
    const applica = body.applica === true;
    if (!month) return NextResponse.json({ error: "Serve il mese" }, { status: 400 });

    /* ── 1. PORTA AVANTI I NEGOZI ─────────────────────────────────────────
       Le anagrafiche (chi è in gara, con che codice, in che cluster, con che
       peso) cambiano di rado; i target cambiano ogni mese. Quindi il mese
       nuovo eredita le prime e nasce SENZA i secondi: una soglia vecchia
       lasciata lì per distrazione è peggio di una casella vuota, perché
       sembra un dato. */
    if (azione === "porta-avanti") {
        const gia = await righeDi(month);
        if (gia.length) {
            return NextResponse.json({ error: `${meseLungo(month)} ha già ${gia.length} punti vendita: non li sovrascrivo.` }, { status: 400 });
        }
        const prec = await righeDi(mesePrima(month));
        if (!prec.length) {
            return NextResponse.json({ error: `Non trovo nessun punto vendita su ${meseLungo(mesePrima(month))} da cui partire.` }, { status: 400 });
        }
        const nuove = prec.map((r) => ({
            brand: BRAND, month,
            cod_gara: r.cod_gara, negozio: r.negozio, ragione_sociale: r.ragione_sociale,
            peso_mobile: r.peso_mobile, peso_biz: r.peso_biz, peso_fix: r.peso_fix,
            cluster_mobile: r.cluster_mobile, cluster_piva: r.cluster_piva, cluster_fisso: r.cluster_fisso,
            extra: r.extra,
        }));
        if (!applica) return NextResponse.json({ anteprima: nuove.map((n) => ({ negozio: n.negozio, cod_gara: n.cod_gara, cluster_mobile: n.cluster_mobile, peso_mobile: n.peso_mobile, peso_fix: n.peso_fix })) });
        const { error } = await supabase.from(TAB).insert(nuove);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, creati: nuove.length });
    }

    /* ── 2. DAL POWERPOINT: cluster × peso ────────────────────────────────
       La lettera porta i target PER CLUSTER. Qui si moltiplicano per il peso
       del negozio e si scrive il target provvisorio. Va in `soglie_*` e in
       `soglie_*_lettera`: la seconda è la traccia di «cosa diceva la lettera»,
       quella a cui il pulsante ↺ del pannello riporta indietro. */
    if (azione === "da-lettera") {
        const perCluster = (body.cluster || {}) as { mobile?: Record<string, number[]>; fisso?: Record<string, number[]> };
        const righe = await righeDi(month);
        if (!righe.length) return NextResponse.json({ error: `${meseLungo(month)} non ha ancora i punti vendita: portali avanti dal mese prima.` }, { status: 400 });

        const cambi: Record<string, unknown>[] = [];
        const senza: string[] = [];
        for (const r of righe) {
            const patch: Record<string, unknown> = {};
            const riga: Record<string, unknown> = { negozio: r.negozio };
            for (const [pista, campo, peso, cluster] of [
                ["mobile", "soglie_mobile", r.peso_mobile, r.cluster_mobile],
                ["fisso", "soglie_fisso", r.peso_fix, r.cluster_fisso],
            ] as const) {
                const tabella = (perCluster as Record<string, Record<string, number[]>>)[pista] || {};
                const chiave = Object.keys(tabella).find((k) => normCluster(k) === normCluster(cluster));
                if (!cluster) continue;                       // niente cluster: non è una gara per PDV
                if (!chiave) { senza.push(`${r.negozio}: cluster ${pista} «${cluster}» non è nella lettera`); continue; }
                const p = Number(peso ?? 1);
                const nuove = tabella[chiave].map((v) => arrotonda(Number(v) * p));
                riga[pista] = { cluster, peso: p, da: (r as unknown as Record<string, number[]>)[campo] || null, a: nuove };
                if (!listaUguale((r as unknown as Record<string, unknown>)[campo], nuove)) {
                    patch[campo] = nuove;
                    patch[`${campo}_lettera`] = nuove;
                }
            }
            if (Object.keys(patch).length) cambi.push({ id: r.id, patch, riga });
        }
        if (!applica) return NextResponse.json({ anteprima: cambi.map((c) => c.riga), senza, quanti: cambi.length });

        let scritti = 0; const errori: string[] = [];
        for (const c of cambi) {
            const { error } = await supabase.from(TAB).update(c.patch as Record<string, unknown>)
                .eq("id", c.id as string).eq("brand", BRAND).eq("month", month);
            if (error) errori.push(`${(c.riga as Record<string, string>).negozio}: ${error.message}`); else scritti++;
        }
        return NextResponse.json({ ok: true, scritti, errori, senza });
    }

    /* ── 3. DAL FILE DELL'OPERATORE: i target veri ────────────────────────
       Arriva dopo cinque o sei giorni e vince su tutto: sostituisce i target
       provvisori e RIALLINEA cluster e pesi, che è il modo in cui il sistema
       impara da sé il mese dopo. Le righe si agganciano per `cod_gara`, che è
       il codice dell'operatore e non cambia mai. */
    if (azione === "da-file") {
        const arrivate = Array.isArray(body.righe) ? body.righe as Record<string, unknown>[] : [];
        if (!arrivate.length) return NextResponse.json({ error: "Il file non contiene righe leggibili." }, { status: 400 });
        const righe = await righeDi(month);
        if (!righe.length) return NextResponse.json({ error: `${meseLungo(month)} non ha ancora i punti vendita: portali avanti dal mese prima.` }, { status: 400 });
        const perCodice = new Map(righe.filter((r) => r.cod_gara).map((r) => [String(r.cod_gara).trim(), r]));

        const cambi: Record<string, unknown>[] = []; const ignorate: string[] = [];
        for (const a of arrivate) {
            const cod = String(a.cod_gara ?? "").trim();
            const r = perCodice.get(cod);
            if (!r) { ignorate.push(cod || "(senza codice)"); continue; }
            const patch: Record<string, unknown> = {};
            const diff: Record<string, unknown> = { negozio: r.negozio, cod_gara: cod };
            const metti = (campo: keyof Riga, valore: unknown, etichetta: string) => {
                const ora = r[campo];
                const uguale = Array.isArray(valore) ? listaUguale(ora, valore)
                    : String(ora ?? "") === String(valore ?? "");
                if (valore === null || valore === undefined || uguale) return;
                patch[campo] = valore;
                diff[etichetta] = { da: ora, a: valore };
            };
            metti("peso_mobile", a.peso_mobile ?? null, "peso mobile");
            metti("peso_biz", a.peso_biz ?? null, "peso business");
            metti("peso_fix", a.peso_fix ?? null, "peso fisso");
            metti("cluster_mobile", a.cluster_mobile ?? null, "cluster mobile");
            metti("cluster_piva", a.cluster_piva ?? null, "cluster P.IVA");
            metti("cluster_fisso", a.cluster_fisso ?? null, "cluster fisso");
            /* i target del file sono la verità: vanno sia in `soglie_*` sia
               nella traccia `_lettera`, così il ↺ riporta a QUESTI e non ai
               provvisori calcolati col peso. */
            for (const [campo, dal] of [["soglie_mobile", "soglie_mobile"], ["soglie_fisso", "soglie_fisso"], ["soglie_piva", "soglie_piva"]] as const) {
                const v = a[dal];
                if (!Array.isArray(v) || !v.length) continue;
                const nums = (v as unknown[]).map(Number).filter((x) => Number.isFinite(x));
                if (nums.length !== (v as unknown[]).length) continue;
                if (listaUguale((r as unknown as Record<string, unknown>)[campo], nums)) continue;
                patch[campo] = nums;
                if (campo !== "soglie_piva") patch[`${campo}_lettera`] = nums;
                diff[campo] = { da: (r as unknown as Record<string, unknown>)[campo], a: nums };
            }
            if (Object.keys(patch).length) cambi.push({ id: r.id, patch, diff });
        }
        if (!applica) return NextResponse.json({ anteprima: cambi.map((c) => c.diff), ignorate, quanti: cambi.length });

        let scritti = 0; const errori: string[] = [];
        for (const c of cambi) {
            const { error } = await supabase.from(TAB).update(c.patch as Record<string, unknown>)
                .eq("id", c.id as string).eq("brand", BRAND).eq("month", month);
            if (error) errori.push(`${(c.diff as Record<string, string>).negozio}: ${error.message}`); else scritti++;
        }
        return NextResponse.json({ ok: true, scritti, errori, ignorate });
    }

    /* ── 4. I TARGET DI CLUSTER, LETTI DALLA LETTERA ──────────────────────
       Un compito piccolo e chiuso: dal PowerPoint tirare fuori SOLO la
       tabella dei cluster. Non tocca niente — restituisce i numeri, che poi
       si vedono in anteprima moltiplicati per i pesi. */
    if (azione === "leggi-cluster") {
        if (!hasKey(MODEL_FAST)) return NextResponse.json({ error: "Modello AI non configurato sul server" }, { status: 400 });
        const testo = String(body.testo || "").trim();
        if (testo.length < 200) return NextResponse.json({ error: "Il testo della lettera è troppo corto: il file non è stato letto." }, { status: 400 });
        const clusterNoti = [...new Set((await righeDi(month)).flatMap((r) => [r.cluster_mobile, r.cluster_fisso]).filter(Boolean).map((c) => normCluster(c)))];

        const p = `Sei l'analista che tiene aggiornate le gare di Telefutura, un gruppo di negozi di telefonia a Roma.

Questa è la lettera di gara WindTre. Contiene una tabella di TARGET PER CLUSTER: i punti vendita sono raggruppati per categoria (per esempio "STRADA 1", "STRADA 2", "STRADA 3", "CENTRO COMMERCIALE 1"…) e per ogni categoria ci sono le soglie, in ordine crescente.

Nel gestionale i cluster in uso sono: ${clusterNoti.join(", ") || "(nessuno noto)"}.

## La lettera

"""
${testo.slice(0, 60000)}
"""

## Cosa devi restituire

Un solo oggetto JSON, senza testo attorno:

{"mobile":{"STRADA 1":[60,90,115,140],"STRADA 2":[60,95,135,170]},"fisso":{"STRADA 1":[25,40,50,60,70]},"avvisi":["…"]}

## Regole

1. **Solo i target di cluster**, mobile e fisso. Niente commissioning, niente premi, niente target di singoli negozi.
2. **I numeri in ordine di soglia**, dalla 1ª in poi, in cifre.
3. **Il nome del cluster esattamente come sta nella lettera**, in maiuscolo.
4. **Se una pista non c'è nella lettera**, lasciala fuori e scrivilo in "avvisi".
5. **Non inventare.** Se un numero non si legge con certezza, non metterlo e dillo in "avvisi". Un numero inventato qui diventa la soglia sbagliata di un negozio vero.

Rispondi solo con il JSON.`;

        const res = await chat({
            messages: [{ role: "user", content: p }],
            model: MODEL_FAST, responseFormat: "json_object",
            maxTokens: 4000, temperature: 0, timeoutMs: 280_000, senzaRagionamento: true,
        });
        if (res.finish_reason === "length") return NextResponse.json({ error: "La risposta si è interrotta a metà: la tabella dei cluster va letta a mano." }, { status: 502 });
        let d: Record<string, unknown> = {};
        try { d = JSON.parse(res.message.content || "{}"); }
        catch { return NextResponse.json({ error: "Il modello non ha risposto in JSON leggibile." }, { status: 502 }); }
        await registraConsumo({
            sezione: "gare_lettera", funzione: "target_cluster", automatica: false,
            modello: MODEL_FAST, tokenIn: res.usage?.prompt_tokens || 0, tokenOut: res.usage?.completion_tokens || 0,
            tokenInCache: res.usage?.prompt_cache_hit_tokens || 0, esito: "ok",
            userId: g.sess.id, chiamate: 1,
        }).catch(() => {});
        return NextResponse.json({ cluster: { mobile: d.mobile || {}, fisso: d.fisso || {} }, avvisi: d.avvisi || [] });
    }

    /* ── 5. IL PESO DI UN NEGOZIO ─────────────────────────────────────────
       È «lo sconto»: quanto del target di cluster tocca a quel punto vendita.
       Cambia di rado ma cambia — Collatina passa da 0,5 a 0,7 da settembre
       (Luca 05/09) — e da qui si propaga sui target al primo ricalcolo dalla
       lettera. Si tocca il peso di mobile e fisso, che sono le due gare per
       punto vendita; quello business lo porta il file dell'operatore, dove
       vive per conto suo (Collatina: business a 1 mentre mobile e fisso a 0,5). */
    if (azione === "peso") {
        const id = String(body.id || "");
        const peso = body.peso === null || body.peso === undefined ? null : Number(body.peso);
        if (!id) return NextResponse.json({ error: "Serve la riga" }, { status: 400 });
        if (peso !== null && (!Number.isFinite(peso) || peso < 0 || peso > 1)) {
            return NextResponse.json({ error: "Il peso è una frazione fra 0 e 1." }, { status: 400 });
        }
        const { data, error } = await supabase.from(TAB)
            .update({ peso_mobile: peso, peso_fix: peso })
            .eq("id", id).eq("brand", BRAND).eq("month", month).select("negozio");
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!(data || []).length) return NextResponse.json({ error: "Riga non trovata in questo mese." }, { status: 404 });
        return NextResponse.json({ ok: true, negozio: (data as { negozio: string }[])[0].negozio });
    }

    return NextResponse.json({ error: "Azione non riconosciuta" }, { status: 400 });
}
