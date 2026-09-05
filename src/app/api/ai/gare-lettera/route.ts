import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { MODEL_FAST } from "@/lib/ai/deepseek";
import { chatAi as chat, chiavePer as hasKey } from "@/lib/ai/chatAi";
import { registraConsumo } from "@/lib/ai/consumi";
import {
    type NomeTab, type Riga, type Foto, type Grezza, type NomeModello,
    schema, modelloDiBrand, recuperaTroncato, setaccia, riassuntoDa,
} from "@/lib/gareLettera";

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
   quello (pay_mappa_soglie / pay_piste.perc_ragazzi) e si ricalcola da sé.

   Qui dentro c'è il GIRO: cosa si chiede al modello e in che pezzi. Le regole
   che decidono cosa di quella risposta è verificabile — e come si legge in
   italiano — stanno in `src/lib/gareLettera.ts`, fuori dalla rete, così si
   rileggono e si provano da sole.

   ⚠️ IL FORNITORE PASSA DAL CENTRALINO (`ai/chatAi`), non da DeepSeek diretto:
   l'id del modello decide chi risponde. Oggi è `MODEL_FAST` perché è quello su
   cui il prompt qui sotto è stato MISURATO (04/09). Il giorno che in
   `.env.local` e sul server c'è una ANTHROPIC_API_KEY vera — quella di adesso
   è il segnaposto «sk-ant-...», e l'API la rifiuta — per spostare la lettura
   della lettera su `claude-sonnet-5` basta cambiare questa costante: è la
   sezione che riscrive gli stipendi, ed è il posto giusto dove pagare il
   modello migliore. Ma prima si rimisura, non si dà per scontato. */
const MODELLO = MODEL_FAST;

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
async function fotografia(brand: string, month: string, divisione: string | undefined, mod: NomeModello): Promise<Foto> {
    const out = {} as Foto;
    const S = schema(mod);
    const bdb = S.brandDb(brand);
    /* ⚠️ SOLO IL LATO AZIENDA. Su pay_* la stessa tabella tiene i due lati
       distinti dalla colonna `lato`: senza questo filtro il modello si
       ritroverebbe davanti le righe dei ragazzi — che sono una percentuale di
       quelle dell'azienda — e proporrebbe di correggere le derivate invece
       delle sorgenti. */
    const leggi = (nome: string) => {
        let q = supabase.from(S.tab[nome]).select(["id", ...S.campi[nome]].join(","))
            .eq("brand", bdb).eq("month", month);
        if (S.colonnaLato) q = q.eq(S.colonnaLato, "azienda");
        return q.order(S.ordinaPer, { ascending: true });
    };

    const { data: piste } = await leggi("piste");
    /* ⚠️ UNA DIVISIONE ALLA VOLTA (solo W3: gli altri operatori non le hanno).
       Con tutte insieme il prompt arriva a 48k token e la risposta satura il
       tetto: il JSON torna TRONCATO e si perde tutto il lavoro (misurato:
       16.000 token di output, tagliato a metà). La lettera del franchising
       parla solo delle piste franchising, quindi mandarle anche il multibrand
       è rumore che paghiamo due volte.
       ⚠️ MISURATO IL 04/09: dando la lettera del franchising anche alle altre
       due divisioni sono uscite 109 proposte su piste che quella lettera non
       nomina nemmeno — il modello lo scriveva pure negli avvisi e le proponeva
       lo stesso. Per questo la card fa scegliere la divisione. */
    const mie = ((piste || []) as unknown as Riga[]).filter((p) => !divisione || !S.conDivisioni || p.gara === divisione);
    const codici = new Set(mie.map((p) => p[S.rifPista]));
    out.piste = mie;
    for (const nome of S.tabelle.filter((t) => t !== "piste")) {
        const { data } = await leggi(nome);
        out[nome] = ((data || []) as unknown as Riga[]).filter((r) => !divisione || !S.conDivisioni || codici.has(r.pista));
    }
    return out;
}

/** le divisioni di gara impostate nel mese base (franchising, multibrand, …) */
async function divisioni(brand: string, month: string, mod: NomeModello): Promise<string[]> {
    const S = schema(mod);
    /* Gli operatori su pay_* non hanno divisioni: la loro lettera è una sola e
       vale per tutto. Si restituisce una divisione finta — «unica» — così il
       giro resta identico e non serve un secondo percorso nel codice. */
    if (!S.conDivisioni) {
        const { count } = await supabase.from(S.tab.piste).select("id", { count: "exact", head: true })
            .eq("brand", S.brandDb(brand)).eq("month", month).eq(S.colonnaLato || "lato", "azienda");
        return (count || 0) > 0 ? ["unica"] : [];
    }
    const { data } = await supabase.from(S.tab.piste).select("gara").eq("brand", S.brandDb(brand)).eq("month", month);
    return [...new Set(((data || []) as unknown as { gara?: string }[]).map((r) => r.gara).filter(Boolean) as string[])];
}

/* ── IL PROMPT ────────────────────────────────────────────────────────────
   UNA TABELLA PER GIRO, e nella risposta la tabella NON si nomina: il modello
   può parlare solo di quella che gli abbiamo mostrato.

   ⚠️ PERCHÉ COSÌ. Il 04/09 la prima lettura vera ha prodotto 334 proposte, di
   cui 319 «aggiungi». Misurato riga per riga: nel giro delle PISTE — dove la
   fotografia conteneva sei righe di piste e nient'altro — il modello ha
   risposto con 34 aggiunte di VOCI e 11 di REGOLE, tabelle che in quel giro
   non vedeva nemmeno. La vecchia regola «se la lettera introduce una pista
   nuova proponi anche le sue soglie e voci» era un invito a farlo, e ogni giro
   riproponeva le stesse voci della lettera: 99 copie ridondanti su 274.
   Togliendo il campo `tabella` dalla risposta il problema non si corregge, si
   estingue: non c'è più modo di scriverlo.

   L'altro pezzo è la LUNGHEZZA. Con il prompt vecchio il giro «soglie» (86
   righe) tornava con finish_reason=length e completion_tokens=16000 — il tetto
   intero — e il JSON monco si buttava; stessa cosa su «voci» (33 righe). Il
   tetto ARRIVA al modello (provato: `max_tokens` 16000 accettato da
   deepseek-v4-flash) e `reasoning_effort:"none"` funziona (zero token di
   ragionamento): era proprio la risposta a essere lunghissima. Con questo
   prompt, sulla STESSA lettera e sulle STESSE righe: soglie 153 token, voci
   4.102, piste 177, regole 1.982 — tutte con finish_reason=stop. I vincoli che
   contano sono «non riscrivere ciò che non cambia», «non scrivere il valore
   vecchio» e «perche in dieci parole». */
/* ⚠️ LE PAROLE SONO QUELLE DEL DATABASE, non quelle che suonano bene. Il
   CHECK di `voci.tipo` ammette punti|gettone|bonus|moltiplicatore|
   pay_ricorrente: qui c'era scritto «euro», ed era pure l'esempio da copiare —
   ogni voce nuova che lo seguiva sarebbe esplosa all'inserimento, in fondo
   all'elenco, dopo essere stata letta e spuntata. Stessa storia per
   `reward_tipo` (niente «gettone»), per `scope` (niente «cluster») e per
   `regole.tipo` (malus|gate|storno, non «cap» o «esclusioni»). */
const SCHEMA_TAB: Record<string, string> = {
    piste: "Le gare del mese. Campi: gara (franchising | multibrand | multibrand_t2), codice, nome, descrizione, sort_order.",
    soglie: "Gli scalini di ogni pista. Campi: pista (il codice della pista), scope (pdv | ragione_sociale), cluster, store_name, tier (1,2,3...), soglia_valore, soglia_um (punti | pezzi | percent), reward_tipo (bonus | moltiplicatore | pay | sblocco), reward_valore, reward_um, reward_descr, note.",
    voci: "Quanto vale ogni cosa dentro una pista. È una MATRICE: la stessa voce può esistere una volta per soglia, con `tier` diverso e valore diverso. Campi: pista, nome, tipo (punti | gettone | bonus | moltiplicatore | pay_ricorrente), valore, um, condizione (quando si applica), scope (pdv | ragione_sociale), tier (la soglia a cui vale quel valore, vuoto se vale sempre), note.",
    regole: "I vincoli della gara. Campi: pista, tipo (malus | gate | storno), condizione, effetto, valore, um, bersaglio, scope (pdv | ragione_sociale), note.",
};
const CAMPO_ESEMPIO: Record<string, string> = { piste: "nome", soglie: "soglia_valore", voci: "valore", regole: "valore" };
const CHE_CONTA: Record<string, string> = {
    piste: "i codici e i nomi delle piste",
    soglie: "`soglia_valore` e `reward_valore`",
    voci: "`valore`",
    regole: "`valore` e `effetto`",
};
const ESEMPIO_NUOVA: Record<string, string> = {
    piste: '"gara":"franchising","codice":"extra_piva","nome":"Extra Gara P.IVA","sort_order":90',
    soglie: '"pista":"mobile","scope":"pdv","store_name":"Mazzini","tier":1,"soglia_valore":42,"soglia_um":"punti"',
    voci: '"pista":"mobile","nome":"Roaming ITZ P.IVA","tipo":"gettone","valore":15,"um":"eur","condizione":"50% del canone","tier":null',
    regole: '"pista":"fisso","tipo":"gate","condizione":"Raggiunta la 2ª soglia Fisso","effetto":"abilita 4ª soglia mobile"',
};
/* Gli operatori su pay_* hanno tre tabelle sole e un vocabolario diverso: il
   commissioning non è una riga per soglia ma un ELENCO di importi (`pay_tiers`),
   e la pista si chiama per `chiave`, non per `codice`. */
const SCHEMA_TAB_PAY: Record<string, string> = {
    piste: "Le gare del mese. Campi: chiave (il codice breve, es. \"mobile\"), nome, um (punti | pezzi | gettoni), ordine, perc_ragazzi (la quota che va ai ragazzi), soglie_pct, soglie_max, soglie_di.",
    soglie: "Gli scalini di ogni pista. Campi: pista (la CHIAVE della pista), tier (1,2,3...), soglia_da (il valore da cui scatta lo scalino), soglia_a (fino a quanto; vuoto sull'ultimo), bonus.",
    righe: "Il listino del commissioning. Campi: pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione, punti (quanto vale per la soglia), pay_base, pay_tiers (un ELENCO di importi, UNO PER SOGLIA, es. [45,48,51,55]), gettone (true/false), attivo, note, ordine, brand_vendita, moltiplicatore, provenienza, componente, ricorrente.",
};
const CAMPO_ESEMPIO_PAY: Record<string, string> = { piste: "nome", soglie: "soglia_da", righe: "pay_tiers" };
const CHE_CONTA_PAY: Record<string, string> = {
    piste: "i nomi e le chiavi delle piste",
    soglie: "`soglia_da` e `bonus`",
    righe: "`pay_tiers` (l'importo per ogni soglia), `punti` e `pay_base`",
};
const ESEMPIO_NUOVA_PAY: Record<string, string> = {
    piste: '"chiave":"vas","nome":"VAS Business","um":"punti","ordine":50',
    soglie: '"pista":"mobile","tier":1,"soglia_da":287,"soglia_a":375',
    righe: '"pista":"mobile","nome":"Mobile Start Smart Pay MNP","offerta":"Mobile Start","opzione":"Smart Pay MNP","punti":1,"pay_tiers":[45,48,51,55,60,65]',
};

function prompt(brand: string, mese: string, tab: NomeTab, righe: Riga[], piste: Riga[], lettera: string, divisione: string, mod: NomeModello) {
    const nomiBrand: Record<string, string> = {
        w3: "WindTre", vs: "Vodafone e Fastweb", sky: "Sky", fastweb: "Fastweb", s4: "S4 Energia",
    };
    const S = schema(mod);
    const pay = mod === "pay";
    const descr = (pay ? SCHEMA_TAB_PAY : SCHEMA_TAB)[tab] || "";
    const campoEs = (pay ? CAMPO_ESEMPIO_PAY : CAMPO_ESEMPIO)[tab] || "valore";
    const cheConta = (pay ? CHE_CONTA_PAY : CHE_CONTA)[tab] || "i valori";
    const esNuova = (pay ? ESEMPIO_NUOVA_PAY : ESEMPIO_NUOVA)[tab] || "";
    const elencoPiste = piste.map((p) => `${p[S.rifPista]} = ${p.nome}`).join(" · ");
    return `Sei l'analista che tiene aggiornate le gare di Telefutura, un gruppo di negozi di telefonia a Roma.

Ogni mese l'operatore ${nomiBrand[brand] || brand} manda una LETTERA DI GARA con i target e i compensi del mese. Il tuo compito: leggere la lettera e dire cosa cambia nella tabella «${tab}»${pay ? "" : ` della divisione «${divisione}»`} rispetto a com'è impostata adesso nel gestionale.

## La tabella «${tab}»

${descr}

Le piste${pay ? "" : " di questa divisione"}: ${elencoPiste || "(nessuna)"}

## La lettera (${mese})

"""
${lettera}
"""

## Com'è adesso la tabella «${tab}»${pay ? "" : ` (divisione ${divisione})`}

Queste sono TUTTE e SOLE le righe su cui puoi lavorare.

\`\`\`json
${JSON.stringify(righe)}
\`\`\`

## Cosa devi restituire

Un solo oggetto JSON, scritto su UNA RIGA, senza spazi superflui e senza testo attorno:

{"avvisi":["…"],"modifiche":[
{"op":"mod","id":"<id di una riga qui sopra>","campo":"${campoEs}","a":42,"perche":"1ª soglia Mazzini"},
{"op":"new","dati":{${esNuova}},"perche":"voce nuova del mese"},
{"op":"del","id":"<id di una riga qui sopra>","perche":"non c'è più nella lettera"}]}

## Regole (violarle rende la risposta inutilizzabile)

1. **SOLO la tabella «${tab}».** Non esistono altri \`op\` e non si nominano altre tabelle: qui dentro non si propongono righe di tabelle diverse da questa. Se la lettera cambia qualcos'altro NON scriverlo, se ne occupa un altro giro.
2. **Solo ciò che CAMBIA.** Una riga già uguale a quello che dice la lettera NON si riscrive. Se non cambia niente rispondi "modifiche":[].
3. **Prima i NUMERI.** Ciò che conta sono ${cheConta}. Descrizioni, note e ordinamenti proponili solo se la lettera li cambia davvero.
4. **Non scrivere il valore vecchio**: lo leggo io dal gestionale. Metti solo \`a\`, il valore nuovo, in cifre con il punto decimale (42.5). L'unità va nel suo campo.
5. **\`perche\`: dieci parole al massimo.** Non ripetere il contenuto di \`dati\`.
6. **Un campo per modifica.** Se di una riga cambiano due campi, scrivi due \`mod\`.
7. **Gli id esistono solo se li vedi qui sopra.** Non inventarli.
8. **Non inventare numeri.** Se la lettera è ambigua, o non parla di quello che vedi qui, non proporre nulla e scrivilo in \`avvisi\` (al massimo 5 avvisi, una riga ciascuno). Un numero inventato qui diventa lo stipendio sbagliato di una persona vera.

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
    return (data as { full_name?: string } | null)?.full_name || null;
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
    /* QUALE MODELLO DI DATI. WindTre ha il suo motore (`gare_azienda_*`), tutti
       gli altri operatori vivono su `pay_*` con la colonna `lato`. Da qui in
       giù non si nominano più tabelle a mano: si passa da `S`. */
    const mod = modelloDiBrand(brand);
    const S = schema(mod);
    const bdb = S.brandDb(brand);

    // ───────────────────────────────────────────── proponi
    if (azione === "proponi") {
        if (!hasKey(MODELLO)) return NextResponse.json({ error: `Manca la chiave del modello ${MODELLO} sul server` }, { status: 400 });
        const testo = String(body.testo || "").trim();
        if (testo.length < 200) return NextResponse.json({ error: "Il testo della lettera è troppo corto: il file non è stato letto." }, { status: 400 });

        /* ⚠️ SI LAVORA SUL MESE CHE SI STA IMPOSTANDO, NON SU QUELLO PRIMA.
           Prendendo la fotografia del mese precedente, gli id delle righe erano
           quelli di AGOSTO: un "aggiorna" avrebbe riscritto le regole del mese
           già pagato, e un "rimuovi" le avrebbe cancellate. Il flusso giusto è
           copiare il mese prima (le righe nascono in settembre con id propri) e
           poi correggere QUELLE con la lettera. */
        const base = month;
        const tutte = await divisioni(brand, base, mod);
        if (!tutte.length) {
            const prima = mesePrima(month);
            const hasPrima = (await divisioni(brand, prima, mod)).length > 0;
            return NextResponse.json({
                error: hasPrima
                    ? `${meseLungo(month)} è ancora vuoto. Copia prima le regole di ${meseLungo(prima)}: la lettera serve a correggere quelle, non a scriverle da zero.`
                    : `Non c'è nessun mese impostato per questo operatore: la lettera si può leggere solo per correggere un mese già esistente.`,
            }, { status: 400 });
        }
        /* la lettera riguarda quasi sempre UNA divisione: se il chiamante la
           indica si fa un giro solo — è il taglio di rumore più grosso che c'è
           (04/09: 109 proposte su piste che la lettera non nominava).
           ⚠️ una divisione che non esiste è un ERRORE, non un «allora leggile
           tutte»: ripiegare in silenzio riporterebbe esattamente il rumore che
           si voleva togliere, e senza dirlo a nessuno. */
        const chiesta = String(body.divisione || "").trim();
        if (chiesta && !tutte.includes(chiesta)) {
            return NextResponse.json({ error: `La divisione «${chiesta}» non esiste in ${meseLungo(month)} (ci sono: ${tutte.join(", ")}).` }, { status: 400 });
        }
        const dovute = chiesta ? [chiesta] : tutte;

        const t0 = Date.now();
        const avvisi: string[] = [];
        const grezze: Grezza[] = [];
        const foto: Foto = { piste: [], soglie: [], voci: [], regole: [] };
        let usoIn = 0, usoOut = 0, usoCache = 0, chiamate = 0;
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
        const chiediPezzo = async (div: string, tab: NomeTab, righe: Riga[], piste: Riga[]): Promise<void> => {
            if (!righe.length) return;
            let res;
            chiamate++;
            try {
                res = await chat({
                    messages: [{ role: "user", content: prompt(brand, meseLungo(month), tab, righe, piste, lettera, div, mod) }],
                    model: MODELLO, responseFormat: "json_object",
                    maxTokens: 16000, temperature: 0, timeoutMs: 280_000, senzaRagionamento: true,
                });
            } catch (e) {
                avvisi.push(`!${div} · ${tab}: il modello non ha risposto (${(e as Error)?.message || e})`);
                return;
            }
            usoIn += res.usage?.prompt_tokens || 0;
            usoOut += res.usage?.completion_tokens || 0;
            usoCache += res.usage?.prompt_cache_hit_tokens || 0;

            const contenuto = res.message.content || "";
            if (res.finish_reason === "length") {
                if (righe.length > 8) {                       // si spacca e si riprova
                    const m = Math.ceil(righe.length / 2);
                    await chiediPezzo(div, tab, righe.slice(0, m), piste);
                    await chiediPezzo(div, tab, righe.slice(m), piste);
                    return;
                }
                const salvate = recuperaTroncato(contenuto);
                salvate.forEach((m) => grezze.push({ tab, div, m }));
                avvisi.push(salvate.length
                    ? `!${div} · ${tab}: la risposta si è interrotta a metà — recuperate le prime ${salvate.length} modifiche, il resto di questa tabella va riletto a mano`
                    : `!${div} · ${tab}: risposta troncata anche su ${righe.length} righe — questo pezzo va rivisto a mano`);
                return;
            }
            let d: Record<string, unknown>;
            try { d = JSON.parse(contenuto || "{}"); }
            catch { avvisi.push(`!${div} · ${tab}: risposta non in JSON valido`); return; }
            if (Array.isArray(d.avvisi)) avvisi.push(...(d.avvisi as unknown[]).slice(0, 5).map((a) => `${div} · ${tab}: ${String(a)}`));
            if (Array.isArray(d.modifiche)) (d.modifiche as Riga[]).forEach((m) => grezze.push({ tab, div, m }));
        };

        const gaDi: Record<string, string> = {};     // codice pista -> divisione
        const nomePista: Record<string, string> = {};
        for (const div of dovute) {
            const f = await fotografia(brand, base, S.conDivisioni ? div : undefined, mod);
            if (!S.tabelle.reduce((a: number, k: string) => a + (f[k] || []).length, 0)) continue;
            S.tabelle.forEach((k: string) => { if (!foto[k]) foto[k] = []; foto[k].push(...(f[k] || [])); });
            (f.piste || []).forEach((p) => {
                const cod = String(p[S.rifPista]);
                gaDi[cod] = div; nomePista[cod] = String(p.nome || cod);
            });
            for (const tab of S.tabelle) await chiediPezzo(div, tab, f[tab] || [], f.piste || []);
        }

        // il setaccio e il riassunto stanno in `@/lib/gareLettera`
        const { buone, scarti } = setaccia(grezze, foto, nomePista, gaDi, mod);
        const riassunto = riassuntoDa(buone, foto, nomePista, !S.conDivisioni
            ? `Confronto con ${meseLungo(base)}`
            : dovute.length === 1
                ? `Divisione letta: ${dovute[0]} · confronto con ${meseLungo(base)}`
                : `Divisioni lette: ${dovute.join(", ")} · confronto con ${meseLungo(base)}`, mod);

        const scartateTot = Object.values(scarti).reduce((a, b) => a + b, 0);
        /* ⚠️ IL TETTO VALE SOLO SULLA CHIACCHIERA DEL MODELLO. Gli avvisi di
           sistema — «la risposta si è interrotta a metà», «non ha risposto»,
           «non in JSON valido» — sono gli unici che dicono che la lettura è
           INCOMPLETA: se il taglio li mangia insieme ai «si assume che non ci
           siano variazioni», la lettura sembra finita e non lo è. */
        const dsistema = [...new Set(avvisi.filter((a) => a.startsWith("!")))].map((a) => a.slice(1));
        const dmodello = [...new Set(avvisi.filter((a) => !a.startsWith("!")))];
        const avvisiFinali = [
            ...dsistema,
            ...dmodello.slice(0, 12),
            ...Object.entries(scarti).map(([k, v]) => `scartate dal controllo — ${k}: ${v}`),
        ];
        const { data: salvata, error } = await supabase.from("gare_ai_proposte").insert({
            brand, month, lato: "azienda", stato: "bozza",
            lettera_id: body.lettera_id || null, lettera_nome: body.lettera_nome || null,
            mese_base: base, modello: MODELLO,
            diff: buone, riassunto, avvisi: avvisiFinali,
            creata_da: autore,
        }).select("*").single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        await registraConsumo({
            sezione: "gare_lettera", funzione: "leggi_lettera", automatica: false,
            modello: MODELLO,
            chiamate,
            tokenIn: usoIn, tokenOut: usoOut, tokenInCache: usoCache, tokenRagionamento: 0,
            userId: sess.id, durataMs: Date.now() - t0, esito: "ok",
        }).catch(() => {});

        return NextResponse.json({ proposta: salvata, scartate: scartateTot });
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

        /* SI APPLICA SOLO QUELLO CHE È SPUNTATO.
           ⚠️ `scelte` vuoto NON vuol dire «tutte»: la card adesso spunta di
           default solo le modifiche sui numeri, e chi le toglie tutte sta
           dicendo «nessuna». Prima un array vuoto faceva scattare il ramo
           «tutte» — con 334 righe in elenco era un piede sul grilletto. */
        const diff: Riga[] = Array.isArray(p.diff) ? p.diff : [];
        /* ⚠️ SI PUÒ APPLICARE IN PIÙ VOLTE, e una riga non si applica DUE volte.
           Da quando le modifiche stanno in due gruppi — i numeri spuntati, le
           accessorie no — il giro naturale è: applico i numeri, poi rileggo le
           altre con calma. Se la proposta si chiudesse al primo Applica, il
           secondo gruppo non si potrebbe più usare. Quindi: si tiene il conto
           degli indici già applicati dentro `applicato` (nessuna colonna nuova),
           si rifiutano quelli già fatti, e la proposta diventa «applicata» solo
           quando non resta più niente. Riapplicare un "aggiungi" due volte
           avrebbe creato una riga doppia che paga due volte. */
        const gia = new Set(((p.applicato?.indici as unknown[]) || []).map(String));
        /* ⚠️ LA SCELTA È OBBLIGATORIA. Prima, un corpo SENZA `scelte` valeva
           «tutte»: bastava una chiamata da fuori, un bundle vecchio rimasto in
           cache o un replay per riaprire esattamente il grilletto che si era
           appena chiuso — trecento righe applicate insieme, accessorie
           comprese. Adesso chi applica dice quali, sempre.
           Gli indici arrivano dal browser: si tengono solo quelli INTERI e
           dentro l'elenco, e una sola volta ciascuno — mandato due volte, un
           "aggiungi" avrebbe inserito la riga due volte. */
        if (!Array.isArray(body.scelte)) {
            return NextResponse.json({ error: "Vanno indicate le modifiche da applicare." }, { status: 400 });
        }
        const scelte = [...new Set((body.scelte as unknown[]).map(String))];
        /* ⚠️ L'ORDINE NON PUÒ VENIRE DAL BROWSER. Gli indici arrivano da un Set
           costruito spuntando e togliendo caselle: chi toglie e rimette la
           spunta a una pista nuova la manda per ULTIMA, e il server inserirebbe
           le sue soglie prima della pista — chiave esterna violata, metà
           applicazione andata a vuoto. Si riordina come sta nella proposta,
           dove la pista viene prima delle sue righe. */
        const indiciDaFare = scelte.filter((i) => !gia.has(i) && /^\d+$/.test(i) && Number(i) < diff.length)
            .sort((a, b) => Number(a) - Number(b));
        const daFare = indiciDaFare.map((i) => ({ i, m: diff[Number(i)] }));
        if (!daFare.length) {
            return NextResponse.json({
                error: scelte.length ? "Le modifiche che hai spuntato sono già state applicate." : "Non hai spuntato nessuna modifica.",
            }, { status: 400 });
        }

        /* ⚠️ UN APPLICA ALLA VOLTA. Il registro `applicato` si legge qui e si
           riscrive in fondo: fra le due cose ci sono decine di scritture, e due
           richieste sovrapposte — due schede aperte, un ricarico impaziente, un
           tentativo ripetuto dopo i 300 secondi — leggerebbero lo stesso
           registro e inserirebbero la stessa voce DUE VOLTE. Su `voci` e
           `regole` non c'è nessun vincolo unico che le fermi: «Netflix senza
           ADV 10 €» battuto due volte diventa 20 € a pezzo.
           Qui la proposta si PRENDE prima di toccarla, con uno scambio
           condizionato sul timbro che avevamo letto: se qualcun altro l'ha già
           presa, la condizione non combacia e questa richiesta si ferma. */
        const timbro = new Date().toISOString();
        const presa = supabase.from("gare_ai_proposte").update({ decisa_da: autore, decisa_il: timbro })
            .eq("id", id).eq("stato", "bozza");
        const { data: mia } = await (p.decisa_il ? presa.eq("decisa_il", p.decisa_il) : presa.is("decisa_il", null)).select("id");
        if (!(mia || []).length) {
            return NextResponse.json({ error: "Qualcun altro sta applicando questa proposta in questo momento. Ricarica la pagina e guarda com'è finita prima di riprovare." }, { status: 409 });
        }

        const fatto: Riga[] = []; const errori: string[] = []; const finite: string[] = [];
        // indice -> com'è finita: la card deve poter dire «applicata» solo a
        // quelle che LO SONO, e non spegnere in silenzio quelle che non lo sono
        const esiti: Record<string, string> = {};
        const segna = (i: string, esito: string) => { finite.push(i); esiti[i] = esito; };
        for (const { i, m } of daFare) {
            const tabella = S.tab[String(m.tabella)];
            // rifiuti definitivi: si segnano come chiusi, se no la proposta
            // non arriverebbe mai a «applicata» e resterebbe lì in eterno
            if (!tabella) { errori.push(`tabella sconosciuta: ${m.tabella}`); segna(i, "rifiutata"); continue; }
            try {
                if (m.operazione === "aggiorna") {
                    /* brand e mese anche qui: nessuna proposta può toccare un altro mese.
                       ⚠️ `.select()` NON è cosmetico: senza, un update che non trova la
                       riga torna 204 con error null e qui si scriveva «aggiornata» su
                       una riga mai toccata. Capita davvero — se le righe del mese sono
                       state rigenerate dopo la lettura, gli id della proposta sono
                       vecchi. Su tabelle che pagano le persone il registro deve dire il
                       vero, se no il conto non si ricostruisce più. */
                    if (!(S.campi[String(m.tabella)] || []).includes(String(m.campo))) { errori.push(`campo non modificabile: ${m.campo}`); segna(i, "rifiutata"); continue; }
                    /* ⚠️ SI SCRIVE SOLO SE IL VALORE È ANCORA QUELLO CHE HAI
                       LETTO. Fra la lettura della lettera e l'Applica passano
                       ore, e nel frattempo quelle stesse righe si correggono a
                       mano nella schermata Gare qui accanto: senza questo
                       vincolo la proposta sovrascriveva la correzione umana in
                       silenzio, e il registro diceva «aggiornata» da un valore
                       che non c'era più. Se non combacia non si scrive e lo si
                       dice: la riga va riletta. */
                    const q = supabase.from(tabella).update({ [String(m.campo)]: m.a })
                        .eq("id", m.id).eq("brand", bdb).eq("month", month);
                    const { data: tocc, error } = await (m.da === null || m.da === undefined
                        ? q.is(String(m.campo), null) : q.eq(String(m.campo), m.da as never)).select("id");
                    if (error) throw error;
                    const esito = (tocc || []).length ? "aggiornata" : "non scritta: la riga è cambiata dopo la lettura";
                    fatto.push({ ...m, esito }); segna(i, esito);
                } else if (m.operazione === "rimuovi") {
                    const { data: tocc, error } = await supabase.from(tabella).delete()
                        .eq("id", m.id).eq("brand", bdb).eq("month", month).select("id");
                    if (error) throw error;
                    const esito = (tocc || []).length ? "rimossa" : "non trovata: era già sparita";
                    fatto.push({ ...m, esito }); segna(i, esito);
                } else if (m.operazione === "aggiungi") {
                    /* ⚠️ IL LATO SI SCRIVE SEMPRE. Su pay_* il default della
                       colonna è «ragazzi»: una riga aggiunta senza dirlo
                       nascerebbe dal lato sbagliato — invisibile qui e in
                       mezzo ai piedi di là. */
                    const pulito: Riga = { brand: bdb, month, ...(S.colonnaLato ? { [S.colonnaLato]: "azienda" } : {}) };
                    const dati = (m.dati || {}) as Riga;
                    (S.campi[String(m.tabella)] || []).forEach((c: string) => { if (dati[c] !== undefined) pulito[c] = dati[c]; });
                    const { error } = await supabase.from(tabella).insert(pulito);
                    if (error) throw error;
                    fatto.push({ ...m, esito: "aggiunta" }); segna(i, "aggiunta");
                } else { errori.push(`operazione sconosciuta: ${m.operazione}`); segna(i, "rifiutata"); }
            } catch (e) { errori.push(`${m.tabella}/${m.operazione}: ${(e as Error)?.message || e}`); }
        }

        /* il registro si SOMMA a quello di prima: chi ricostruisce il conto
           deve vedere tutti i passaggi, non solo l'ultimo. Gli errori veri
           (eccezioni) non entrano fra gli indici finiti: quelli si riprovano. */
        const indici = [...gia, ...finite];
        const prima = (p.applicato || {}) as { fatto?: Riga[]; errori?: string[]; esiti?: Record<string, string> };
        const tuttiEsiti = { ...(prima.esiti || {}), ...esiti };
        /* «applicata» vuol dire che è tutto a posto. Una riga che NON si è
           scritta — perché il valore era cambiato sotto le mani — non è a
           posto: la proposta resta bozza, con l'esito ambra bene in vista,
           finché una persona non la guarda. */
        const nonScritte = Object.values(tuttiEsiti).filter((e) => String(e).startsWith("non scritta")).length;
        const tutteFatte = indici.length >= diff.length && !nonScritte;
        await supabase.from("gare_ai_proposte").update({
            stato: tutteFatte ? "applicata" : "bozza",
            decisa_da: autore, decisa_il: new Date().toISOString(),
            applicato: {
                fatto: [...(prima.fatto || []), ...fatto],
                errori: [...(prima.errori || []), ...errori],
                indici, esiti: tuttiEsiti,
            },
        }).eq("id", id);
        const scritte = ["aggiornata", "rimossa", "aggiunta"];
        const vere = fatto.filter((x) => scritte.includes(String(x.esito)));
        const mancate = fatto.length - vere.length;
        const restano = diff.length - indici.length;
        return NextResponse.json({
            ok: true, applicate: vere.length, errori, restano,
            ...(mancate ? { avviso: `${mancate} ${mancate === 1 ? "riga NON è stata scritta" : "righe NON sono state scritte"}: erano già cambiate dopo la lettura. Rileggile a mano.` } : {}),
        });
    }

    return NextResponse.json({ error: "Azione non riconosciuta" }, { status: 400 });
}
