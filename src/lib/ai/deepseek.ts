// Client DeepSeek (API OpenAI-compatible). SOLO server: legge DEEPSEEK_API_KEY, che non ha
// prefisso NEXT_PUBLIC_ e quindi non finisce mai nel bundle del browser. Importare questo
// modulo solo da route handler / codice server.
const BASE = "https://api.deepseek.com";
export const MODEL_FAST = "deepseek-v4-flash"; // default: 1M ctx, ~$0.14/$0.28 per M token
export const MODEL_PRO = "deepseek-v4-pro";    // solo per analisi pesanti

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, any> };
}
export interface ChatResult {
  message: ChatMessage & { tool_calls?: ToolCall[] };
  finish_reason: string;
  /* ⚠️ `prompt_cache_hit_tokens` e `reasoning_tokens` arrivano dal fornitore
     e finora si buttavano via. Il primo vale trenta volte meno di un token
     nuovo (0,007 contro 0,22): ignorarlo significa contare più del vero. Il
     secondo è il PENSIERO, già dentro completion_tokens: si tiene a parte per
     poter dire «paghiamo più pensiero che risposta», che è la spia di un
     prompt scritto male. */
  usage: {
    prompt_tokens: number; completion_tokens: number; total_tokens: number;
    prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  } | null;
}

export function hasKey(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

export async function chat(opts: {
  messages: ChatMessage[];
  tools?: ToolDef[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  // "json_object" forza la risposta a JSON puro (il prompt DEVE citare la
  // parola JSON, requisito dell'API) — usato dal triage WhatsApp
  responseFormat?: "json_object";
  /** Spegne il ragionamento del modello.
   *
   *  ⚠️ SERVE PIÙ DI QUANTO SEMBRI. `deepseek-v4-flash` pensa prima di
   *  rispondere, e il pensiero consuma il tetto della risposta — MISURATO sulla
   *  STESSA chat: 1.997 token di ragionamento a un tentativo e 5.414 a un
   *  altro. Con un tetto fisso è una scommessa: quando il pensiero se lo mangia
   *  tutto, `content` torna VUOTO e la chat resta non classificata.
   *  Su un compito di classificazione — quattro etichette — il ragionamento è
   *  un lusso: qui si può spegnere, e la risposta arriva in una trentina di
   *  token invece che in cinquemila. */
  senzaRagionamento?: boolean;
}): Promise<ChatResult> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY non configurata");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: opts.model ?? MODEL_FAST,
        messages: opts.messages,
        ...(opts.tools?.length ? { tools: opts.tools, tool_choice: "auto" } : {}),
        ...(opts.responseFormat ? { response_format: { type: opts.responseFormat } } : {}),
        max_tokens: opts.maxTokens ?? 1500,
        temperature: opts.temperature ?? 0.2,
        ...(opts.senzaRagionamento ? { reasoning_effort: "none" } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`DeepSeek ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const choice = data?.choices?.[0];
    if (!choice) throw new Error("Risposta DeepSeek senza choices");
    return { message: choice.message, finish_reason: choice.finish_reason, usage: data.usage ?? null };
  } finally {
    clearTimeout(timer);
  }
}

// Costo stimato in USD. UN SOLO LISTINO (rilievo del revisore): i prezzi
// vivono in `modelli.ts` insieme ai modelli, e qui si delega. Con due tabelle
// il prossimo ritocco ne aggiornava una sola e il costo del triage diventava
// falso senza dare errore. In più il vecchio calcolo fatturava per differenza
// (pro = caro, «tutto il resto» = economico): un modello nuovo sarebbe stato
// contabilizzato al prezzo sbagliato.
export { costoChiamata as estimateCost } from "@/lib/ai/modelli";
