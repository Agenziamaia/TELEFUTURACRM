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
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
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
        max_tokens: opts.maxTokens ?? 1500,
        temperature: opts.temperature ?? 0.2,
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

// Costo stimato in USD (prezzi luglio 2026, per 1M token).
export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const p = model === MODEL_PRO ? { in: 0.435, out: 0.87 } : { in: 0.14, out: 0.28 };
  return (promptTokens / 1e6) * p.in + (completionTokens / 1e6) * p.out;
}
