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
const meseLungo = (m: string) => {
    const [y, mm] = meseIso(m).split("-").map(Number);
    const s = new Date(y, mm - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
};
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

## La lettera nuova (${mese})

"""
${lettera}
"""

## Il mese base già impostato (${base})

⚠️ Qui sotto c'è SOLO la tabella su cui devi lavorare adesso. Non proporre
modifiche a righe che non vedi: di quelle si occupa un altro giro.

\`\`\`json
${JSON.stringify(foto, null, 0)}
\`\`\`

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

/* CHI PUÒ. Il lucchetto è `accesso(request, "ai/gare-lettera")`: la mappa di
   permessiServer manda questa chiave sulla sezione «/gare», che nel menù è
   admin+dev e che Luca accende e spegne dal pannello. UNA sola verità.
   ⚠️ Qui prima c'era una lista di ruoli scritta a mano che leggeva una tabella
   `profiles` INESISTENTE — l'anagrafica del CRM è `app_users`, e il nome sta in
   `full_name`. La riga tornava vuota, il ruolo vuoto, e la rotta rispondeva
   «Non hai i permessi per le gare» perfino all'amministratore (04/09). */
async function nomeDi(id: string): Promise<string | null> {
    const { data } = await supabase.from("app_users").select("full_name").eq("id", id).maybeSingle();
    return data?.full_name || null;
}

export async function GET(request: Request) {
    const g = await accesso(request, "ai/gare-lettera"); if (!g.ok) return g.risposta;
    const url = new URL(request.url);
    const brand = url.searchParams.get("brand") || "";
    const month = meseIso(url.searchParams.get("month") || "");
    const { data } = await supabase.from("gare_ai_proposte")
        .select("*").eq("brand", brand).eq("month", month)
        .order("created_at", { ascending: false }).limit(20);
    return NextResponse.json({ proposte: data || [] });
}

export async function POST(request: Request) {
    const g = await accesso(request, "ai/gare-lettera"); if (!g.ok) return g.risposta;
    const sess = g.sess;
    const autore = await nomeDi(sess.id);
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

        /* ⚠️ SI LAVORA SUL MESE CHE SI STA IMPOSTANDO, NON SU QUELLO PRIMA.
           Prendendo la fotografia del mese precedente, gli id delle righe erano
           quelli di AGOSTO: un "aggiorna" avrebbe riscritto le regole del mese
           già pagato, e un "rimuovi" le avrebbe cancellate. Il flusso giusto è
           copiare il mese prima (le righe nascono in settembre con id propri) e
           poi correggere QUELLE con la lettera. */
        const base = month;
        const tutte = await divisioni(brand, base);
        if (!tutte.length) {
            const prima = mesePrima(month);
            const hasPrima = (await divisioni(brand, prima)).length > 0;
            return NextResponse.json({
                error: hasPrima
                    ? `${meseLungo(month)} è ancora vuoto. Copia prima le regole di ${meseLungo(prima)}: la lettera serve a correggere quelle, non a scriverle da zero.`
                    : `Non c'è nessun mese impostato per questo operatore: la lettera si può leggere solo per correggere un mese già esistente.`,
            }, { status: 400 });
        }
        // la lettera può riguardare una sola divisione: se il chiamante la indica
        // si fa un giro solo, altrimenti un giro per divisione
        const dovute = body.divisione ? [String(body.divisione)] : tutte;

        const t0 = Date.now();
        const parsed: any = { riassunto: [], avvisi: [], modifiche: [] };
        const foto: Record<string, any[]> = { piste: [], soglie: [], voci: [], regole: [] };
        let usoIn = 0, usoOut = 0, usoCache = 0;
        const lettera = testo.slice(0, 60000);

        /* UN PEZZO ALLA VOLTA, E SE SFORA SI DIMEZZA DA SÉ.
           Il 04/09 la prima lettura vera è tornata con «0 modifiche proposte» su
           tutte e tre le divisioni: la risposta sbatteva contro il tetto dei
           token e il JSON arrivava monco. Una divisione del franchising sono
           centotrenta righe fra soglie e voci — chiedere il confronto di tutte
           in un colpo solo è una scommessa, non un metodo.
           Adesso si chiede una TABELLA alla volta, e se quel pezzo sfora lo si
           spacca in due e si richiede: il giro finisce sempre, e il costo lo
           paghiamo solo sui pezzi che servivano davvero. */
        const chiediPezzo = async (div: string, tab: NomeTab, righe: any[], piste: any[]): Promise<void> => {
            if (!righe.length) return;
            const pezzo: Record<string, any[]> = { piste: tab === "piste" ? righe : piste };
            if (tab !== "piste") pezzo[tab] = righe;
            let res;
            try {
                res = await chat({
                    messages: [{ role: "user", content: prompt(brand, month, base, pezzo, lettera, div) }],
                    model: MODEL_FAST, responseFormat: "json_object",
                    maxTokens: 16000, temperature: 0, timeoutMs: 280_000, senzaRagionamento: true,
                });
            } catch (e: any) {
                parsed.avvisi.push(`${div} · ${tab}: il modello non ha risposto (${e?.message || e})`);
                return;
            }
            usoIn += res.usage?.prompt_tokens || 0;
            usoOut += res.usage?.completion_tokens || 0;
            usoCache += res.usage?.prompt_cache_hit_tokens || 0;

            if (res.finish_reason === "length") {
                if (righe.length > 8) {                       // si spacca e si riprova
                    const m = Math.ceil(righe.length / 2);
                    await chiediPezzo(div, tab, righe.slice(0, m), piste);
                    await chiediPezzo(div, tab, righe.slice(m), piste);
                    return;
                }
                parsed.avvisi.push(`${div} · ${tab}: risposta troncata anche su ${righe.length} righe — questo pezzo va rivisto a mano`);
                return;
            }
            let d: any = null;
            try { d = JSON.parse(res.message.content || "{}"); }
            catch { parsed.avvisi.push(`${div} · ${tab}: risposta non in JSON valido`); return; }
            if (d.riassunto && tab === "soglie") parsed.riassunto.push(`${div}: ${d.riassunto}`);
            if (Array.isArray(d.avvisi)) parsed.avvisi.push(...d.avvisi.map((a: string) => `${div} · ${tab}: ${a}`));
            if (Array.isArray(d.modifiche)) parsed.modifiche.push(...d.modifiche);
        };

        for (const div of dovute) {
            const f = await fotografia(brand, base, div);
            if (!Object.values(f).reduce((a, r) => a + r.length, 0)) continue;
            Object.keys(foto).forEach((k) => foto[k].push(...(f[k] || [])));
            for (const tab of ["piste", "soglie", "voci", "regole"] as NomeTab[]) {
                await chiediPezzo(div, tab, f[tab] || [], f.piste || []);
            }
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
        /* la proposta si carica per id, ma poi si scrive con brand/month del
           BODY: se non combaciano, una proposta di un altro mese scriverebbe
           qui. Dall'interfaccia non capita — il GET filtra per mese — ma è
           l'unico punto in cui una scrittura può cambiare mese, e chiuderlo
           costa una riga. */
        if (p.brand !== brand || String(p.month).slice(0, 7) !== String(month).slice(0, 7)) {
            return NextResponse.json({ error: "Questa proposta appartiene a un altro mese o operatore." }, { status: 400 });
        }
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
                    /* brand e mese anche qui: nessuna proposta può toccare un altro mese.
                       ⚠️ `.select()` NON è cosmetico: senza, un update che non trova la
                       riga torna 204 con error null e qui si scriveva «aggiornata» su
                       una riga mai toccata. Capita davvero — se le righe del mese sono
                       state rigenerate dopo la lettura, gli id della proposta sono
                       vecchi. Su tabelle che pagano le persone il registro deve dire il
                       vero, se no il conto non si ricostruisce più. */
                    const { data: tocc, error } = await supabase.from(tabella).update({ [m.campo]: m.a })
                        .eq("id", m.id).eq("brand", brand).eq("month", month).select("id");
                    if (error) throw error;
                    fatto.push({ ...m, esito: (tocc || []).length ? "aggiornata" : "riga non trovata" });
                } else if (m.operazione === "rimuovi") {
                    const { data: tocc, error } = await supabase.from(tabella).delete()
                        .eq("id", m.id).eq("brand", brand).eq("month", month).select("id");
                    if (error) throw error;
                    fatto.push({ ...m, esito: (tocc || []).length ? "rimossa" : "riga non trovata" });
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
        const vere = fatto.filter((x) => x.esito !== "riga non trovata");
        const mancate = fatto.length - vere.length;
        return NextResponse.json({
            ok: true, applicate: vere.length, errori,
            ...(mancate ? { avviso: `${mancate} ${mancate === 1 ? "riga non è stata trovata" : "righe non sono state trovate"}: erano già cambiate dopo la lettura.` } : {}),
        });
    }

    return NextResponse.json({ error: "Azione non riconosciuta" }, { status: 400 });
}
