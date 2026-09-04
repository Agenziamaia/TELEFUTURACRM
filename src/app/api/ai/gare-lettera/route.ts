import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { chat, hasKey, MODEL_FAST } from "@/lib/ai/deepseek";
import { registraConsumo } from "@/lib/ai/consumi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* ═══ LA LETTERA DELL'OPERATORE, LETTA DALL'AI ═════════════════════════════
   Luca 04/09/2026: ogni mese arriva la lettera di gara (W3, Vodafone/Fastweb,
   Sky). Oggi il mese nuovo si costruisce copiando quello prima e correggendo
   a mano 138 soglie e 180 voci contro il PDF. Qui il modello legge la lettera,
   confronta con il mese base e propone SOLO le differenze.

   ⚠️ LA PROPOSTA NON SCRIVE MAI DA SOLA. Resta una bozza in gare_ai_proposte
   finché una persona non la approva. Queste tabelle decidono i compensi: un
   numero letto male si propagherebbe su Analisi, Calcolatore e pagamenti.

   Si lavora SEMPRE sul lato azienda: il lato ragazzi è una percentuale di
   quello (pay_mappa_soglie / pay_piste.perc_ragazzi) e si ricalcola da sé. */

const TAB = {
    piste: "gare_azienda_piste",
    soglie: "gare_azienda_soglie",
    voci: "gare_azienda_voci",
    regole: "gare_azienda_regole",
} as const;
type NomeTab = keyof typeof TAB;

const CAMPI: Record<NomeTab, string[]> = {
    piste: ["gara", "codice", "nome", "descrizione", "sort_order"],
    soglie: ["pista", "scope", "cluster", "store_name", "tier", "soglia_valore", "soglia_um",
             "reward_tipo", "reward_valore", "reward_um", "reward_descr", "note"],
    voci: ["pista", "nome", "tipo", "valore", "um", "condizione", "scope", "tier", "note"],
    regole: ["pista", "tipo", "condizione", "effetto", "valore", "um", "bersaglio", "scope", "note"],
};

const meseIso = (m: string) => String(m).slice(0, 7) + "-01";
const mesePrima = (m: string) => {
    const [y, mm] = meseIso(m).split("-").map(Number);
    const d = new Date(y, mm - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

/** la fotografia del mese base, in forma compatta: è l'esempio migliore che
 *  possiamo dare al modello — sa già che forma devono avere le righe */
async function fotografia(brand: string, month: string, divisione?: string) {
    const out: Record<string, any[]> = {};
    const { data: piste } = await supabase.from(TAB.piste)
        .select(["id", ...CAMPI.piste].join(","))
        .eq("brand", brand).eq("month", month).order("sort_order", { ascending: true });
    /* ⚠️ UNA DIVISIONE ALLA VOLTA. Con tutte insieme il prompt arriva a 48k
       token e la risposta satura il tetto: il JSON torna TRONCATO e si perde
       tutto il lavoro (misurato: 16.000 token di output, tagliato a metà).
       La lettera del franchising parla solo delle piste franchising, quindi
       mandarle anche il multibrand è rumore che paghiamo due volte. */
    const mie = (piste || []).filter((p: any) => !divisione || p.gara === divisione);
    const codici = new Set(mie.map((p: any) => p.codice));
    out.piste = mie;
    for (const nome of ["soglie", "voci", "regole"] as NomeTab[]) {
        const { data } = await supabase.from(TAB[nome])
            .select(["id", ...CAMPI[nome]].join(","))
            .eq("brand", brand).eq("month", month).order("sort_order", { ascending: true });
        out[nome] = (data || []).filter((r: any) => !divisione || codici.has(r.pista));
    }
    return out;
}

/** le divisioni di gara impostate nel mese base (franchising, multibrand, …) */
async function divisioni(brand: string, month: string): Promise<string[]> {
    const { data } = await supabase.from(TAB.piste).select("gara").eq("brand", brand).eq("month", month);
    return [...new Set((data || []).map((r: any) => r.gara).filter(Boolean))];
}

function prompt(brand: string, mese: string, base: string, foto: Record<string, any[]>, lettera: string, divisione?: string) {
    const nomiBrand: Record<string, string> = {
        w3: "WindTre", vs: "Vodafone e Fastweb", sky: "Sky", fastweb: "Fastweb", s4: "S4 Energia",
    };
    return `Sei l'analista che tiene aggiornate le gare di Telefutura, un gruppo di negozi di telefonia a Roma.

Ogni mese l'operatore ${nomiBrand[brand] || brand} manda una LETTERA DI GARA con i target e i compensi del mese. Il tuo compito: leggere la lettera nuova e dire COSA CAMBIA rispetto al mese precedente, già impostato nel gestionale.\n\n${divisione ? `⚠️ Stai lavorando SOLO sulla divisione «${divisione}». Nel mese base qui sotto ci sono solo le sue piste: se la lettera parla di altre divisioni, ignorale.` : ""}

## Come è fatto il gestionale (lato azienda)

Quattro tabelle, tutte per brand e per mese:

- **piste**: le gare del mese. Campi: gara (franchising | multibrand | multibrand_t2), codice, nome, descrizione, sort_order.
- **soglie**: gli scalini di ogni pista. Campi: pista (il codice della pista), scope (pdv | ragione_sociale | cluster), cluster, store_name, tier (1,2,3...), soglia_valore, soglia_um (punti | pezzi | eur), reward_tipo (bonus | moltiplicatore | gettone), reward_valore, reward_um, reward_descr, note.
- **voci**: quanto vale ogni cosa dentro una pista. Campi: pista, nome, tipo (punti | gettone | euro | moltiplicatore), valore, um, condizione (quando si applica), scope, tier, note.
- **regole**: i vincoli (gate, malus, cap, esclusioni). Campi: pista, tipo, condizione, effetto, valore, um, bersaglio, scope, note.

## Il mese base già impostato (${base})

\`\`\`json
${JSON.stringify(foto, null, 0)}
\`\`\`

## La lettera nuova (${mese})

"""
${lettera}
"""

## Cosa devi restituire

SOLO un oggetto JSON con questa forma, senza testo attorno:

{
  "riassunto": "tre o quattro righe in italiano su cosa cambia davvero questo mese",
  "avvisi": ["cose che non sei riuscito a leggere con certezza dalla lettera"],
  "modifiche": [
    {"tabella":"soglie","operazione":"aggiorna","id":"<id della riga base>","campo":"soglia_valore","da":39,"a":42,"motivo":"nella lettera la 1ª soglia fisso di Magliana passa da 39 a 42 punti"},
    {"tabella":"voci","operazione":"aggiungi","dati":{"pista":"mobile","nome":"Roaming ITZ P.IVA","tipo":"euro","valore":null,"um":"eur","condizione":"50% del canone"},"motivo":"voce nuova di settembre"},
    {"tabella":"voci","operazione":"rimuovi","id":"<id>","motivo":"non compare più nella lettera"}
  ]
}

## Regole a cui devi attenerti

1. **Solo le differenze.** Se un valore è identico al mese base non metterlo fra le modifiche. Meglio dieci modifiche giuste che cento righe rumorose.
2. **Un campo per modifica.** Se di una riga cambiano due campi, scrivi due modifiche.
3. **Gli id li prendi dal mese base** che ti ho dato: per "aggiorna" e "rimuovi" l'id è obbligatorio e deve esistere in quella fotografia.
4. **Non inventare.** Se la lettera è ambigua o non copre una parte, NON proporre la modifica: scrivila in "avvisi". Un numero inventato qui diventa un compenso sbagliato per una persona vera.
5. **I valori numerici in cifre**, con il punto decimale (42.5, non "42,5 punti"). L'unità va nel campo um.
6. Se la lettera introduce una pista che non esiste nel mese base, proponi prima la pista (tabella "piste") e poi le sue soglie e voci.
7. Se non cambia nulla, restituisci "modifiche": [] e spiegalo nel riassunto.

Rispondi solo con il JSON.`;
}

export async function GET(request: Request) {
    const g = await accesso(request, "gare");
    if (!g.ok) return g.risposta;
    const url = new URL(request.url);
    const brand = url.searchParams.get("brand") || "";
    const month = meseIso(url.searchParams.get("month") || "");
    const { data } = await supabase.from("gare_ai_proposte")
        .select("*").eq("brand", brand).eq("month", month)
        .order("created_at", { ascending: false }).limit(20);
    return NextResponse.json({ proposte: data || [] });
}

export async function POST(request: Request) {
    const g = await accesso(request, "gare");
    if (!g.ok) return g.risposta;
    const sess = g.sess;
    // il nome per la firma della proposta: la sessione porta solo l'id
    const { data: chiSono } = await supabase.from("profiles").select("name").eq("id", sess.id).maybeSingle();
    const autore = chiSono?.name || null;
    const body = await request.json().catch(() => ({}));
    const azione = String(body.azione || "proponi");
    const brand = String(body.brand || "");
    const month = meseIso(String(body.month || ""));
    if (!brand || !month) return NextResponse.json({ error: "Servono brand e mese" }, { status: 400 });

    // ───────────────────────────────────────────── proponi
    if (azione === "proponi") {
        if (!hasKey()) return NextResponse.json({ error: "DEEPSEEK_API_KEY non configurata sul server" }, { status: 400 });
        const testo = String(body.testo || "").trim();
        if (testo.length < 200) return NextResponse.json({ error: "Il testo della lettera è troppo corto: il file non è stato letto." }, { status: 400 });

        const base = body.mese_base ? meseIso(String(body.mese_base)) : mesePrima(month);
        const tutte = await divisioni(brand, base);
        if (!tutte.length) return NextResponse.json({ error: `Il mese base (${base}) è vuoto: non c'è niente con cui confrontare la lettera.` }, { status: 400 });
        // la lettera può riguardare una sola divisione: se il chiamante la indica
        // si fa un giro solo, altrimenti un giro per divisione
        const dovute = body.divisione ? [String(body.divisione)] : tutte;

        const t0 = Date.now();
        const parsed: any = { riassunto: [], avvisi: [], modifiche: [] };
        const foto: Record<string, any[]> = { piste: [], soglie: [], voci: [], regole: [] };
        let usoIn = 0, usoOut = 0, usoCache = 0;
        for (const div of dovute) {
            const f = await fotografia(brand, base, div);
            if (!Object.values(f).reduce((a, r) => a + r.length, 0)) continue;
            Object.keys(foto).forEach((k) => foto[k].push(...(f[k] || [])));
            let res;
            try {
                res = await chat({
                    messages: [{ role: "user", content: prompt(brand, month, base, f, testo.slice(0, 60000), div) }],
                    model: MODEL_FAST, responseFormat: "json_object",
                    maxTokens: 8000, temperature: 0, timeoutMs: 280_000, senzaRagionamento: true,
                });
            } catch (e: any) {
                parsed.avvisi.push(`divisione ${div}: il modello non ha risposto (${e?.message || e})`);
                continue;
            }
            usoIn += res.usage?.prompt_tokens || 0;
            usoOut += res.usage?.completion_tokens || 0;
            usoCache += res.usage?.prompt_cache_hit_tokens || 0;
            /* ⚠️ se la risposta è stata tagliata dal tetto, il JSON è monco:
               si dice e si va avanti, invece di far fallire tutto il giro. */
            if (res.finish_reason === "length") {
                parsed.avvisi.push(`divisione ${div}: la risposta era troppo lunga ed è stata troncata — questa divisione va rivista a mano`);
                continue;
            }
            let d: any = null;
            try { d = JSON.parse(res.message.content || "{}"); }
            catch { parsed.avvisi.push(`divisione ${div}: risposta non in JSON valido`); continue; }
            if (d.riassunto) parsed.riassunto.push(`${div}: ${d.riassunto}`);
            if (Array.isArray(d.avvisi)) parsed.avvisi.push(...d.avvisi.map((a: string) => `${div}: ${a}`));
            if (Array.isArray(d.modifiche)) parsed.modifiche.push(...d.modifiche);
        }
        parsed.riassunto = parsed.riassunto.join("\n");

        // ⚠️ si tiene solo ciò che è verificabile: gli id devono esistere davvero
        // nella fotografia del mese base, altrimenti "aggiorna" scriverebbe nel vuoto.
        const idsBase = new Set<string>();
        Object.values(foto).forEach((righe) => righe.forEach((r: any) => idsBase.add(r.id)));
        const buone: any[] = []; const scartate: string[] = [];
        for (const m of (Array.isArray(parsed.modifiche) ? parsed.modifiche : [])) {
            const t = String(m.tabella || "");
            if (!(t in TAB)) { scartate.push(`tabella sconosciuta: ${t}`); continue; }
            const op = String(m.operazione || "");
            if (op === "aggiungi") {
                if (!m.dati || typeof m.dati !== "object") { scartate.push("aggiunta senza dati"); continue; }
            } else if (op === "aggiorna" || op === "rimuovi") {
                if (!m.id || !idsBase.has(String(m.id))) { scartate.push(`${op} con id inesistente nel mese base`); continue; }
                if (op === "aggiorna" && !m.campo) { scartate.push("aggiornamento senza campo"); continue; }
                if (op === "aggiorna" && !CAMPI[t as NomeTab].includes(String(m.campo))) { scartate.push(`campo non modificabile: ${m.campo}`); continue; }
            } else { scartate.push(`operazione sconosciuta: ${op}`); continue; }
            buone.push(m);
        }

        const avvisi = [...(Array.isArray(parsed.avvisi) ? parsed.avvisi : []), ...scartate.map((s) => "scartata dal controllo: " + s)];
        const { data: salvata, error } = await supabase.from("gare_ai_proposte").insert({
            brand, month, lato: "azienda", stato: "bozza",
            lettera_id: body.lettera_id || null, lettera_nome: body.lettera_nome || null,
            mese_base: base, modello: MODEL_FAST,
            diff: buone, riassunto: String(parsed.riassunto || ""), avvisi,
            creata_da: autore,
        }).select("*").single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        await registraConsumo({
            sezione: "gare_lettera", funzione: "leggi_lettera", automatica: false,
            modello: MODEL_FAST,
            chiamate: dovute.length,
            tokenIn: usoIn, tokenOut: usoOut, tokenInCache: usoCache, tokenRagionamento: 0,
            userId: sess.id, durataMs: Date.now() - t0, esito: "ok",
        }).catch(() => {});

        return NextResponse.json({ proposta: salvata, scartate: scartate.length });
    }

    // ───────────────────────────────────────────── applica / scarta
    if (azione === "applica" || azione === "scarta") {
        const id = String(body.id || "");
        const { data: p } = await supabase.from("gare_ai_proposte").select("*").eq("id", id).maybeSingle();
        if (!p) return NextResponse.json({ error: "Proposta non trovata" }, { status: 404 });
        if (p.stato !== "bozza") return NextResponse.json({ error: `Questa proposta è già ${p.stato}.` }, { status: 400 });

        if (azione === "scarta") {
            await supabase.from("gare_ai_proposte").update({
                stato: "scartata", decisa_da: autore, decisa_il: new Date().toISOString(),
            }).eq("id", id);
            return NextResponse.json({ ok: true });
        }

        // si applicano SOLO le modifiche che la persona ha spuntato
        const scelte: string[] = Array.isArray(body.scelte) ? body.scelte.map(String) : [];
        const diff: any[] = Array.isArray(p.diff) ? p.diff : [];
        const daFare = scelte.length ? diff.filter((_, i) => scelte.includes(String(i))) : diff;

        const fatto: any[] = []; const errori: string[] = [];
        for (const m of daFare) {
            const tabella = TAB[m.tabella as NomeTab];
            try {
                if (m.operazione === "aggiorna") {
                    const { error } = await supabase.from(tabella).update({ [m.campo]: m.a }).eq("id", m.id);
                    if (error) throw error;
                    fatto.push({ ...m, esito: "aggiornata" });
                } else if (m.operazione === "rimuovi") {
                    const { error } = await supabase.from(tabella).delete().eq("id", m.id);
                    if (error) throw error;
                    fatto.push({ ...m, esito: "rimossa" });
                } else if (m.operazione === "aggiungi") {
                    const pulito: Record<string, any> = { brand, month };
                    CAMPI[m.tabella as NomeTab].forEach((c) => { if (m.dati[c] !== undefined) pulito[c] = m.dati[c]; });
                    const { error } = await supabase.from(tabella).insert(pulito);
                    if (error) throw error;
                    fatto.push({ ...m, esito: "aggiunta" });
                }
            } catch (e: any) { errori.push(`${m.tabella}/${m.operazione}: ${e?.message || e}`); }
        }

        await supabase.from("gare_ai_proposte").update({
            stato: "applicata", decisa_da: autore, decisa_il: new Date().toISOString(),
            applicato: { fatto, errori },
        }).eq("id", id);
        return NextResponse.json({ ok: true, applicate: fatto.length, errori });
    }

    return NextResponse.json({ error: "Azione non riconosciuta" }, { status: 400 });
}
