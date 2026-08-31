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

   GET ?giorni=30 */

type Riga = {
    sezione: string; automatica: boolean; costo_eur: number | null; cost_usd: number | null;
    chiamate: number | null; prompt_tokens: number | null; completion_tokens: number | null;
    utenza_tipo: string | null; utenza_id: string | null; utenza_label: string | null;
    user_id: string | null; negozio: string | null; esito: string | null;
    passaggi: number | null; created_at: string;
};

const euro = (r: Riga) => Number(r.costo_eur ?? (Number(r.cost_usd || 0) * 0.92));

export async function GET(request: Request) {
    const g = await accesso(request, "ai/spesa");
    if (!g.ok) return g.risposta;

    const url = new URL(request.url);
    const giorni = Math.min(120, Math.max(1, Number(url.searchParams.get("giorni")) || 30));
    const da = new Date(Date.now() - giorni * 86400000).toISOString();

    /* il mese corrente serve per il tetto: è quello il periodo su cui si
       ragiona quando si dice «quanto stiamo spendendo» */
    const ora = new Date();
    const inizioMese = new Date(Date.UTC(ora.getUTCFullYear(), ora.getUTCMonth(), 1)).toISOString();

    const [{ data: righe }, { data: imp }, { data: utenti }] = await Promise.all([
        supabase.from("ai_usage")
            .select("sezione, automatica, costo_eur, cost_usd, chiamate, prompt_tokens, completion_tokens, utenza_tipo, utenza_id, utenza_label, user_id, negozio, esito, passaggi, created_at")
            .gte("created_at", da).order("created_at", { ascending: false }).limit(20000),
        supabase.from("impostazioni_servizio").select("ai_tetto_mensile_eur, ai_soglia_avviso, ai_soglia_allarme").eq("id", 1).maybeSingle(),
        supabase.from("app_users").select("id, full_name, role, primary_store").eq("active", true),
    ]);

    const R = (righe || []) as Riga[];
    const delMese = R.filter((r) => r.created_at >= inizioMese);
    const tetto = Number(imp?.ai_tetto_mensile_eur ?? 30);

    // ── il mese: speso, e dove va a finire ────────────────────────────────
    const spesoMese = delMese.reduce((s, r) => s + euro(r), 0);
    /* la proiezione sui giorni TRASCORSI del mese, non su quelli di
       calendario: a metà mese dice quanto si finirà per spendere */
    const giorniPassati = Math.max(1, ora.getUTCDate());
    const giorniMese = new Date(Date.UTC(ora.getUTCFullYear(), ora.getUTCMonth() + 1, 0)).getUTCDate();
    const proiezione = (spesoMese / giorniPassati) * giorniMese;

    const perSezione: Record<string, { euro: number; chiamate: number; righe: number }> = {};
    for (const r of delMese) {
        const k = r.sezione || "assistente";
        (perSezione[k] ||= { euro: 0, chiamate: 0, righe: 0 });
        perSezione[k].euro += euro(r);
        perSezione[k].chiamate += Number(r.chiamate || 1);
        perSezione[k].righe += 1;
    }

    /* ⭐ LA DIVISIONE CHE CONTA. La spesa che una persona ha chiesto non si
       taglia: è il prodotto. Quella che gira da sola sì. */
    const chiesta = delMese.filter((r) => !r.automatica).reduce((s, r) => s + euro(r), 0);
    const automatica = spesoMese - chiesta;

    // ── le utenze: su cosa si spende ──────────────────────────────────────
    const perUtenza: Record<string, { tipo: string; label: string; euro: number; chiamate: number }> = {};
    for (const r of delMese) {
        if (!r.utenza_id) continue;
        const k = `${r.utenza_tipo}:${r.utenza_id}`;
        (perUtenza[k] ||= { tipo: r.utenza_tipo || "", label: r.utenza_label || r.utenza_id, euro: 0, chiamate: 0 });
        perUtenza[k].euro += euro(r);
        perUtenza[k].chiamate += Number(r.chiamate || 1);
    }

    // ── gli sprechi: pagato e non consegnato ──────────────────────────────
    const troncate = delMese.filter((r) => r.esito === "troncata").length;
    const errori = delMese.filter((r) => r.esito === "errore").length;
    const senzaCredito = delMese.filter((r) => r.esito === "senza_credito").length;
    const conPassaggi = delMese.filter((r) => r.passaggi != null);
    const passaggiMedi = conPassaggi.length
        ? conPassaggi.reduce((s, r) => s + Number(r.passaggi), 0) / conPassaggi.length : null;

    // ── l'andamento giorno per giorno ─────────────────────────────────────
    const perGiorno: Record<string, { euro: number; richieste: number }> = {};
    for (const r of R) {
        const k = r.created_at.slice(0, 10);
        (perGiorno[k] ||= { euro: 0, richieste: 0 });
        perGiorno[k].euro += euro(r);
        if (!r.automatica) perGiorno[k].richieste += Number(r.chiamate || 1);
    }

    /* ── CHI LA USA, fra quelli che ce l'hanno (Luca 31/08: «monitora
       chiaramente quelli che hanno l'accesso»). Solo conteggi: quante
       domande, quanti giorni, quanto è costato. Mai di cosa parlano. */
    const perPersona: Record<string, { domande: number; giorni: Set<string>; euro: number; ultima: string }> = {};
    for (const r of R) {
        if (r.automatica || !r.user_id) continue;
        (perPersona[r.user_id] ||= { domande: 0, giorni: new Set(), euro: 0, ultima: r.created_at });
        const p = perPersona[r.user_id];
        p.domande += Number(r.chiamate || 1);
        p.giorni.add(r.created_at.slice(0, 10));
        p.euro += euro(r);
        if (r.created_at > p.ultima) p.ultima = r.created_at;
    }
    /* ⚠️ SOLO CHI L'ASSISTENTE CE L'HA (Luca 31/08: «monitora chiaramente
       quelli che hanno l'accesso»). Elencare anche gli altri farebbe una lista
       lunghissima che dice sempre la stessa cosa — «non gliel'abbiamo dato» —
       e sommergerebbe i pochi nomi su cui vale la pena fare una telefonata. */
    const persone = (utenti || []).filter((u) => canUseAI(String(u.role || ""))).map((u) => {
        const p = perPersona[u.id];
        return {
            id: u.id, nome: u.full_name, ruolo: u.role, negozio: u.primary_store,
            domande: p?.domande || 0, giorniAttivi: p ? p.giorni.size : 0,
            euro: p?.euro || 0, ultima: p?.ultima || null,
        };
    });

    return NextResponse.json({
        ok: true, giorni,
        mese: {
            speso: spesoMese, proiezione, tetto,
            avviso: Number(imp?.ai_soglia_avviso ?? 0.6), allarme: Number(imp?.ai_soglia_allarme ?? 0.85),
            chiesta, automatica,
        },
        perSezione, perUtenza, perGiorno,
        sprechi: { troncate, errori, senzaCredito, passaggiMedi },
        persone,
        totali: {
            righe: R.length,
            chiamate: R.reduce((s, r) => s + Number(r.chiamate || 1), 0),
            tokenIn: R.reduce((s, r) => s + Number(r.prompt_tokens || 0), 0),
            tokenOut: R.reduce((s, r) => s + Number(r.completion_tokens || 0), 0),
        },
    });
}
