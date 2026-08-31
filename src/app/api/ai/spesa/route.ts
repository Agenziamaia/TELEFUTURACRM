import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { canUseAI } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ I NUMERI DELLA SEZIONE AI ═══════════════════════════════════════════
   Li calcola il SERVER, e non è un dettaglio: il registro dei consumi è
   chiuso al browser — lì dentro c'è scritto quanto spende ogni persona.

   ⚠️ QUI NON PASSA MAI UN CONTENUTO. Si contano gesti: chiamate, token,
   euro, esiti. Il testo delle domande non entra in questa rotta nemmeno per
   sbaglio, perché non lo legge nessuna delle query qui sotto.

   GET ?da=YYYY-MM-DD&a=YYYY-MM-DD&persona=<id>
   Il periodo si sceglie come in Analisi (mese o intervallo), e il filtro per
   persona vale su TUTTO: chiedendo di qualcuno, ogni riquadro parla di lui. */

type Riga = {
    sezione: string; automatica: boolean; costo_eur: number | null; cost_usd: number | null;
    chiamate: number | null; prompt_tokens: number | null; completion_tokens: number | null;
    utenza_tipo: string | null; utenza_id: string | null; utenza_label: string | null;
    user_id: string | null; negozio: string | null; ruolo: string | null; esito: string | null;
    passaggi: number | null; latency_ms: number | null; created_at: string;
};

const euro = (r: Riga) => Number(r.costo_eur ?? (Number(r.cost_usd || 0) * 0.92));
const giorno = (iso: string) => iso.slice(0, 10);

/** tutti i giorni fra due date, anche quelli senza spesa: un grafico con i
 *  buchi saltati mente sull'andamento */
function giorniFra(da: string, a: string): string[] {
    const out: string[] = [];
    const d = new Date(da + "T00:00:00Z"), fine = new Date(a + "T00:00:00Z");
    while (d <= fine) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
    return out.slice(-186);
}

export async function GET(request: Request) {
    const g = await accesso(request, "ai/spesa");
    if (!g.ok) return g.risposta;

    const q = new URL(request.url).searchParams;
    const oggi = new Date().toISOString().slice(0, 10);
    const primoDelMese = oggi.slice(0, 8) + "01";
    const da = (q.get("da") || primoDelMese).slice(0, 10);
    const a = (q.get("a") || oggi).slice(0, 10);
    const persona = q.get("persona") || "";
    /* il canale (= la sezione) come filtro trasversale: chiedendo «solo
       WhatsApp», ogni riquadro parla di quello — compreso il giorno per
       giorno, che è la domanda con cui si comincia sempre */
    const canale = q.get("canale") || "";

    /* il periodo PRECEDENTE di pari lunghezza, per il confronto: «quanto
       spendevamo prima» è la metà della domanda «quanto spendiamo» */
    const giorniPeriodo = Math.max(1, giorniFra(da, a).length);
    const primaFine = new Date(new Date(da + "T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
    const primaInizio = new Date(new Date(primaFine + "T00:00:00Z").getTime() - (giorniPeriodo - 1) * 86400000).toISOString().slice(0, 10);

    const campi = "sezione, automatica, costo_eur, cost_usd, chiamate, prompt_tokens, completion_tokens, utenza_tipo, utenza_id, utenza_label, user_id, negozio, ruolo, esito, passaggi, latency_ms, created_at";
    const [{ data: righe }, { data: prima }, { data: imp }, { data: utenti }] = await Promise.all([
        supabase.from("ai_usage").select(campi)
            .gte("created_at", da + "T00:00:00Z").lte("created_at", a + "T23:59:59Z")
            .order("created_at", { ascending: true }).limit(50000),
        supabase.from("ai_usage").select("costo_eur, cost_usd, automatica, user_id")
            .gte("created_at", primaInizio + "T00:00:00Z").lte("created_at", primaFine + "T23:59:59Z").limit(50000),
        supabase.from("impostazioni_servizio").select("ai_tetto_mensile_eur, ai_soglia_avviso, ai_soglia_allarme").eq("id", 1).maybeSingle(),
        supabase.from("app_users").select("id, full_name, role, primary_store").eq("active", true),
    ]);

    const tutte = (righe || []) as Riga[];
    // il filtro persona vale su tutto: se chiedi di qualcuno, ogni riquadro parla di lui
    let R = persona ? tutte.filter((r) => r.user_id === persona) : tutte;
    if (canale) R = R.filter((r) => (r.sezione || "assistente") === canale);
    const Rprima = (prima || []).filter((r) => !persona || r.user_id === persona) as Riga[];

    const speso = R.reduce((s, r) => s + euro(r), 0);
    const spesoPrima = Rprima.reduce((s, r) => s + euro(r), 0);
    const chiesta = R.filter((r) => !r.automatica).reduce((s, r) => s + euro(r), 0);

    /* la proiezione ha senso solo sul MESE in corso: su un intervallo scelto a
       mano proiettare non vuol dire niente */
    const suMeseCorrente = da === primoDelMese && a === oggi;
    const gPassati = Math.max(1, Number(oggi.slice(8, 10)));
    const gMese = new Date(Date.UTC(Number(oggi.slice(0, 4)), Number(oggi.slice(5, 7)), 0)).getUTCDate();
    const proiezione = suMeseCorrente ? (speso / gPassati) * gMese : null;

    // ── il giorno per giorno, con dentro le sezioni (per le barre) ────────
    const sezioniViste = [...new Set(R.map((r) => r.sezione || "assistente"))];
    const giorni = giorniFra(da, a).map((gg) => {
        const delGiorno = R.filter((r) => giorno(r.created_at) === gg);
        const parti = sezioniViste.map((sz) => ({
            sezione: sz,
            euro: delGiorno.filter((r) => (r.sezione || "assistente") === sz).reduce((s, r) => s + euro(r), 0),
        })).filter((p) => p.euro > 0);
        return {
            giorno: gg,
            euro: delGiorno.reduce((s, r) => s + euro(r), 0),
            richieste: delGiorno.filter((r) => !r.automatica).reduce((s, r) => s + Number(r.chiamate || 1), 0),
            chiamate: delGiorno.reduce((s, r) => s + Number(r.chiamate || 1), 0),
            parti,
        };
    });

    const perSezione = sezioniViste.map((sz) => {
        const d = R.filter((r) => (r.sezione || "assistente") === sz);
        return {
            sezione: sz, euro: d.reduce((s, r) => s + euro(r), 0),
            chiamate: d.reduce((s, r) => s + Number(r.chiamate || 1), 0),
            automatica: d.every((r) => r.automatica),
            tokenIn: d.reduce((s, r) => s + Number(r.prompt_tokens || 0), 0),
            tokenOut: d.reduce((s, r) => s + Number(r.completion_tokens || 0), 0),
        };
    }).sort((x, y) => y.euro - x.euro);

    const perUtenza = Object.values(R.reduce((acc, r) => {
        if (!r.utenza_id) return acc;
        const k = `${r.utenza_tipo}:${r.utenza_id}`;
        (acc[k] ||= { tipo: r.utenza_tipo || "", id: r.utenza_id, label: r.utenza_label || r.utenza_id, euro: 0, chiamate: 0 });
        acc[k].euro += euro(r); acc[k].chiamate += Number(r.chiamate || 1);
        return acc;
    }, {} as Record<string, { tipo: string; id: string; label: string; euro: number; chiamate: number }>))
        .sort((x, y) => y.euro - x.euro);

    /* ── LE PERSONE, e per ognuna QUANDO ha speso. È la cosa che mancava:
       vedere il totale senza poter chiedere «quando?» lascia a metà. */
    const perPersona: Record<string, { domande: number; giorni: Record<string, number>; euro: number; ultima: string }> = {};
    for (const r of tutte) {
        if (r.automatica || !r.user_id) continue;
        const p = (perPersona[r.user_id] ||= { domande: 0, giorni: {}, euro: 0, ultima: r.created_at });
        p.domande += Number(r.chiamate || 1);
        p.giorni[giorno(r.created_at)] = (p.giorni[giorno(r.created_at)] || 0) + euro(r);
        p.euro += euro(r);
        if (r.created_at > p.ultima) p.ultima = r.created_at;
    }
    const primaPersona: Record<string, number> = {};
    for (const r of Rprima) if (!r.automatica && r.user_id) primaPersona[r.user_id] = (primaPersona[r.user_id] || 0) + euro(r);

    /* ⚠️ SOLO CHI L'ASSISTENTE CE L'HA (Luca: «monitora quelli che hanno
       l'accesso»): elencare gli altri farebbe una lista lunga che dice sempre
       «non gliel'abbiamo dato», e sommergerebbe i nomi che contano. */
    const persone = (utenti || []).filter((u) => canUseAI(String(u.role || ""))).map((u) => {
        const p = perPersona[u.id];
        return {
            id: u.id, nome: u.full_name, ruolo: u.role, negozio: u.primary_store,
            domande: p?.domande || 0,
            giorniAttivi: p ? Object.keys(p.giorni).length : 0,
            euro: p?.euro || 0, ultima: p?.ultima || null,
            delta: (p?.euro || 0) - (primaPersona[u.id] || 0),
            serie: giorniFra(da, a).map((gg) => p?.giorni[gg] || 0),
        };
    }).sort((x, y) => y.giorniAttivi - x.giorniAttivi || y.domande - x.domande);

    const conPassaggi = R.filter((r) => r.passaggi != null);
    const conDurata = R.filter((r) => r.latency_ms != null);

    return NextResponse.json({
        ok: true, da, a, persona, canale,
        /* i canali che ESISTONO nel periodo, per i chip del filtro: mostrarne
           uno che non ha mai speso niente è un pulsante che non fa niente */
        canaliVisti: [...new Set(tutte.map((r) => r.sezione || "assistente"))],
        mese: {
            speso, spesoPrima, delta: speso - spesoPrima, proiezione,
            tetto: Number(imp?.ai_tetto_mensile_eur ?? 30),
            avviso: Number(imp?.ai_soglia_avviso ?? 0.6),
            allarme: Number(imp?.ai_soglia_allarme ?? 0.85),
            chiesta, automatica: speso - chiesta, suMeseCorrente,
        },
        giorni, perSezione, perUtenza, persone,
        sprechi: {
            troncate: R.filter((r) => r.esito === "troncata").length,
            errori: R.filter((r) => r.esito === "errore").length,
            senzaCredito: R.filter((r) => r.esito === "senza_credito").length,
            passaggiMedi: conPassaggi.length ? conPassaggi.reduce((s, r) => s + Number(r.passaggi), 0) / conPassaggi.length : null,
            attesaMedia: conDurata.length ? conDurata.reduce((s, r) => s + Number(r.latency_ms), 0) / conDurata.length : null,
        },
        totali: {
            righe: R.length,
            chiamate: R.reduce((s, r) => s + Number(r.chiamate || 1), 0),
            tokenIn: R.reduce((s, r) => s + Number(r.prompt_tokens || 0), 0),
            tokenOut: R.reduce((s, r) => s + Number(r.completion_tokens || 0), 0),
        },
    });
}
