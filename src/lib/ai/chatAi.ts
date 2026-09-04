// UN SOLO INGRESSO, DUE FORNITORI (Luca 04/09/2026).
//
// Da qui in poi chi vuole parlare con un modello chiama `chatAi()` e basta:
// l'id del modello decide da solo dove finisce la richiesta. `claude-*` va ad
// Anthropic, tutto il resto a DeepSeek.
//
// ⚠️ NON è un livello di astrazione messo lì per bellezza: serve a evitare che
// ogni rotta si scriva il suo `if (modello.startsWith(...))`. Quando fra sei
// mesi si aggiunge il terzo fornitore, il posto da toccare è UNO — e le rotte
// che decidono i compensi non si accorgono di niente.
import { chat, hasKey, type ChatMessage, type ChatResult, type ToolDef } from "@/lib/ai/deepseek";
import { chatClaude, hasClaudeKey, eClaude } from "@/lib/ai/claude";

export type OpzioniChat = {
    messages: ChatMessage[];
    tools?: ToolDef[];
    model?: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
    responseFormat?: "json_object";
    senzaRagionamento?: boolean;
};

/** C'è la chiave per far parlare QUESTO modello? */
export function chiavePer(model?: string | null): boolean {
    return eClaude(model) ? hasClaudeKey() : hasKey();
}

export async function chatAi(opts: OpzioniChat): Promise<ChatResult> {
    return eClaude(opts.model) ? chatClaude(opts) : chat(opts);
}
