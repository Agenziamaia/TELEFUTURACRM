// Client Anthropic (Claude). SOLO server: legge ANTHROPIC_API_KEY, che non ha
// prefisso NEXT_PUBLIC_ e quindi non finisce mai nel bundle del browser.
//
// PERCHÉ UN SECONDO FORNITORE (Luca 04/09/2026). Non per sostituire DeepSeek:
// per le gare. La lettura della lettera di gara è l'unico posto del CRM dove
// l'uscita del modello diventa, riga per riga, lo stipendio di una persona — e
// dove sbagliare costa infinitamente più del modello. Il volume è ridicolo
// (tre o quattro lettere al mese), quindi lì si paga il cervello migliore e
// non si guarda al prezzo. Tutto il resto — triage WhatsApp, posta,
// assistente, migliaia di chiamate al giorno — resta su DeepSeek, dove il
// prezzo è invece l'unica cosa che conta.
//
// L'interfaccia è IDENTICA a quella di `deepseek.ts`: stesso `chat()`, stesso
// `ChatResult`. Chi chiama non deve sapere chi risponde.
import type { ChatMessage, ChatResult, ToolDef } from "@/lib/ai/deepseek";

const BASE = "https://api.anthropic.com/v1/messages";
const VERSIONE = "2023-06-01";

export const CLAUDE_SONNET = "claude-sonnet-5";
export const CLAUDE_OPUS = "claude-opus-5";

export function hasClaudeKey(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
}

/** Un id di modello appartiene a questo fornitore? */
export function eClaude(id: string | null | undefined): boolean {
    return String(id || "").startsWith("claude-");
}

export async function chatClaude(opts: {
    messages: ChatMessage[];
    tools?: ToolDef[];
    model?: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
    responseFormat?: "json_object";
    senzaRagionamento?: boolean;
}): Promise<ChatResult> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY non configurata");

    /* Il ruolo «system» qui non è un messaggio: è un parametro a sé. Lasciarlo
       nella lista lo farebbe rifiutare dall'API con un 400 poco chiaro. */
    const sistema = opts.messages.filter((m) => m.role === "system")
        .map((m) => String(m.content || "")).join("\n\n");
    const dialogo = opts.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content || "") }));

    /* JSON PURO SENZA CHIACCHIERE. Qui non esiste il `response_format` di
       OpenAI: si ottiene la stessa cosa mettendo in bocca al modello la prima
       graffa, così non può che continuare un oggetto JSON. Il pezzo messo in
       bocca non torna nella risposta: va rimesso davanti a mano. */
    const conPrefill = opts.responseFormat === "json_object";
    if (conPrefill) dialogo.push({ role: "assistant", content: "{" });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
    try {
        const res = await fetch(BASE, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": key,
                "anthropic-version": VERSIONE,
            },
            body: JSON.stringify({
                model: opts.model ?? CLAUDE_SONNET,
                max_tokens: opts.maxTokens ?? 4000,
                temperature: opts.temperature ?? 0.2,
                ...(sistema ? { system: sistema } : {}),
                messages: dialogo,
            }),
            signal: ctrl.signal,
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Claude ${res.status}: ${body.slice(0, 300)}`);
        }
        const data = await res.json();
        const testo = (data?.content || [])
            .filter((b: any) => b?.type === "text").map((b: any) => b.text).join("");
        if (!testo && data?.stop_reason !== "max_tokens") throw new Error("Risposta Claude senza testo");

        /* `stop_reason` si traduce nel vocabolario che il CRM già conosce:
           «max_tokens» deve arrivare a chi chiama come «length», se no la
           gestione della risposta troncata — che esiste già ed è costata — non
           scatta e ci si ritrova con JSON monchi presi per buoni. */
        const finish = data?.stop_reason === "max_tokens" ? "length"
            : data?.stop_reason === "tool_use" ? "tool_calls" : "stop";

        const u = data?.usage || {};
        const cache = Number(u.cache_read_input_tokens || 0);
        const nuovi = Number(u.input_tokens || 0) + Number(u.cache_creation_input_tokens || 0);
        return {
            message: { role: "assistant", content: (conPrefill ? "{" : "") + testo },
            finish_reason: finish,
            usage: {
                prompt_tokens: nuovi + cache,
                completion_tokens: Number(u.output_tokens || 0),
                total_tokens: nuovi + cache + Number(u.output_tokens || 0),
                prompt_cache_hit_tokens: cache,
                prompt_cache_miss_tokens: nuovi,
            },
        };
    } finally {
        clearTimeout(timer);
    }
}
