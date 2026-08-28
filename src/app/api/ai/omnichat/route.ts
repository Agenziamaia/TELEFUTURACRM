// ═══ OMNICHAT — recap, analisi e suggerimenti di risposta ══════════════════
// Il cuore dell'Omnichat (Luca 26/08): «utilizza l'AI per fare il recap e
// l'analisi della chat, e ti dà anche dei suggerimenti rispetto a eventuali
// risposte e soluzioni».
//
// Riusa lo stesso motore del triage e dell'assistente (DeepSeek), e riceve
// dal client SOLO quello che serve: gli ultimi messaggi e, se il contatto è
// un cliente, i quattro numeri del radar. Niente tool e niente accesso al DB
// da qui: il perimetro è già stato applicato a monte, e questa route non deve
// poter leggere niente che l'utente non stesse già guardando.

import { NextResponse } from "next/server";
import { richiedeSessione, rispostaSessioneNonValida } from "@/lib/sessioneServer";
import { chat, hasKey, MODEL_FAST, type ChatMessage } from "@/lib/ai/deepseek";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Corpo = {
    canale?: "wa" | "email" | "interna";
    nome?: string;
    stato?: string;                     // Cliente Registrato · Non Registrato · Staff
    messaggi?: { verso: "in" | "out"; testo: string; ora?: string }[];
    contesto?: string | null;           // due righe di radar, già composte dal client
};

const SISTEMA = [
    "Sei l'assistente di un negozio di telefonia italiano (Telefutura). Un venditore ha davanti",
    "una conversazione con un contatto e ha pochi secondi per capire cosa fare.",
    "",
    "Rispondi SOLO con un oggetto JSON, senza testo intorno e senza blocchi di codice:",
    '{"recap": "...", "analisi": "...", "risposte": ["...", "...", "..."]}',
    "",
    "· recap: UNA frase che dice cosa vuole il contatto e a che punto è la conversazione.",
    "· analisi: UNA frase su cosa conviene fare adesso — l'azione, non la teoria. Se dal",
    "  contesto emerge un'occasione o un rischio (una rata che sta finendo, un cliente che",
    "  ha speso molto, una richiesta rimasta senza risposta), dillo qui.",
    "· risposte: DUE o TRE messaggi pronti da inviare, scritti come li scriverebbe il",
    "  venditore: in italiano, del tu, cordiali, brevi, senza formule da call center e senza",
    "  emoji. Devono essere diversi fra loro, non tre modi di dire la stessa cosa.",
    "",
    "REGOLE FERREE:",
    "- Non inventare MAI dati: prezzi, date, scadenze, offerte o promozioni che non siano",
    "  scritti nella conversazione o nel contesto. Se non sai, scrivi una risposta che chiede.",
    "- Non promettere tempi, sconti o attivazioni.",
    "- Se il contatto non è un cliente registrato, non parlare della sua storia: non ce l'hai.",
    "- Se la conversazione è con un collega (Staff), le risposte sono da collega a collega.",
].join("\n");

export async function POST(req: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        const _s = richiedeSessione(req);
        if (!_s) return rispostaSessioneNonValida();
    }

    if (!hasKey()) {
        return NextResponse.json({ ok: false, error: "AI non configurata su questo ambiente" }, { status: 200 });
    }
    let body: Corpo;
    try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "richiesta non valida" }, { status: 400 }); }

    const messaggi = (body.messaggi || []).slice(-25);   // basta la coda: il resto è rumore
    if (!messaggi.length) {
        return NextResponse.json({ ok: true, recap: "Nessun messaggio da leggere in questa conversazione.", analisi: "", risposte: [] });
    }

    const canale = body.canale === "wa" ? "WhatsApp" : body.canale === "email" ? "email" : "chat interna";
    const trascrizione = messaggi
        .map((m) => `${m.verso === "out" ? "NOI" : "LORO"}: ${String(m.testo || "").slice(0, 600)}`)
        .join("\n");

    const utente: ChatMessage = {
        role: "user",
        content: [
            `Canale: ${canale}. Contatto: ${body.nome || "senza nome"} (${body.stato || "sconosciuto"}).`,
            body.contesto ? `Cosa sappiamo di lui: ${body.contesto}` : "Non è nei nostri clienti: non sappiamo altro.",
            "",
            "Conversazione (dal più vecchio al più recente):",
            trascrizione,
        ].join("\n"),
    };

    try {
        const r = await chat({
            messages: [{ role: "system", content: SISTEMA }, utente],
            model: MODEL_FAST,
            // ⚠️ IL TETTO DEVE COMPRENDERE IL RAGIONAMENTO. deepseek-v4-flash
            // pensa prima di rispondere e i token del pensiero SONO token di
            // completamento: con 700 se li mangiava tutti (finish_reason
            // «length», reasoning_tokens 700) e il testo usciva VUOTO. Misurato
            // sulla chat di Rita: ~730 di ragionamento + ~160 di risposta.
            // È lo stesso tranello già annotato in waTriage.
            maxTokens: 3000,
            // il prompt cita JSON: con questo l'API lo garantisce, invece di
            // sperare che il modello non incarti la risposta in un blocco
            responseFormat: "json_object",
        });
        // ⚠️ IL CONTENUTO STA IN `message.content`. Leggerlo da `r.content`
        // (che non esiste) dava sempre stringa vuota: JSON.parse("") falliva,
        // la route rispondeva ok con tutti i campi vuoti e il riquadro
        // dell'assistente restava BIANCO. È il motivo per cui l'AI
        // dell'Omnichat non ha mai detto niente (Luca 27/08).
        const testo = String((r as { message?: { content?: string } })?.message?.content || "").trim();
        if (!testo) {
            return NextResponse.json({ ok: false, error: "l'AI ha risposto senza testo: riprova fra poco" }, { status: 200 });
        }
        // il modello ogni tanto incarta il JSON in un blocco di codice
        const pulito = testo.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
        let out: { recap?: string; analisi?: string; risposte?: unknown };
        try { out = JSON.parse(pulito); } catch {
            // meglio il testo grezzo di un errore: il venditore legge comunque qualcosa
            return NextResponse.json({ ok: true, recap: pulito.slice(0, 400), analisi: "", risposte: [] });
        }
        return NextResponse.json({
            ok: true,
            recap: String(out.recap || "").slice(0, 400),
            analisi: String(out.analisi || "").slice(0, 400),
            risposte: (Array.isArray(out.risposte) ? out.risposte : []).slice(0, 3).map((x) => String(x).slice(0, 600)),
        });
    } catch (e) {
        return NextResponse.json({ ok: false, error: String((e as Error)?.message || e) }, { status: 200 });
    }
}
