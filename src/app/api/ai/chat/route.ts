import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { chat, estimateCost, hasKey, MODEL_FAST, type ChatMessage } from "@/lib/ai/deepseek";
import { getScope } from "@/lib/ai/scope";
import { TOOL_DEFS, WRITE_TOOL_DEFS, WRITE_TOOL_NAMES, runTool } from "@/lib/ai/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_STEPS = 6;

function systemPrompt(scope: any) {
  const ambito = scope.seesAll
    ? "Vedi i dati di TUTTI i negozi."
    : `Vedi SOLO i negozi: ${scope.stores.join(", ") || "(nessuno)"}. Non hai accesso ad altri negozi.`;
  return [
    "Sei l'assistente interno del CRM Telefutura. Rispondi in italiano, conciso e concreto.",
    `Utente: ${scope.fullName} — ruolo ${scope.role}. ${ambito}`,
    "",
    "REGOLE:",
    "- Per qualsiasi dato del CRM DEVI usare i tool. Non inventare MAI numeri, nomi o stati.",
    "- Per domande di conteggio usa contracts_breakdown, non elencare i contratti uno per uno.",
    "- Se un tool torna 0 risultati, dillo chiaramente invece di ipotizzare.",
    "- Non puoi accedere a credenziali, password, IBAN o dati retributivi: se richiesti, rifiuta.",
    "",
    "NOTE SUI DATI (importanti per non dare risposte fuorvianti):",
    "- Gran parte dei contratti sono dati DEMO (is_demo=true). Se il risultato contiene righe demo,",
    "  segnalalo esplicitamente nella risposta (es. 'di cui X demo').",
    "- I brand sono scritti in modo incoerente (WindTre/WIND3, VODAFONE/Vodafone): i tool",
    "  normalizzano gia' gli alias, non filtrare a mano.",
    "",
    "AZIONI DI SCRITTURA (broadcast chat, comunicazioni):",
    "- Quando l'utente chiede un'azione, CHIAMA DIRETTAMENTE il tool corrispondente con i parametri completi.",
    "- NON chiedere conferma a parole e non aspettare un 'sì': il sistema intercetta il tool e mostra",
    "  automaticamente all'utente una scheda di conferma. Nulla viene eseguito senza il suo clic.",
    "- Se mancano informazioni essenziali (es. il testo del messaggio), allora sì, chiedile prima.",
  ].join("\n");
}

export async function POST(req: Request) {
  const started = Date.now();
  if (!hasKey()) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY non configurata sul server" }, { status: 500 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON non valido" }, { status: 400 }); }

  const { userId, messages } = body || {};
  if (!userId || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "userId e messages sono obbligatori" }, { status: 400 });
  }

  const scope = await getScope(userId);
  if (!scope) return NextResponse.json({ error: "Utente non valido o non attivo" }, { status: 403 });

  const convo: ChatMessage[] = [
    { role: "system", content: systemPrompt(scope) },
    ...messages.slice(-12).map((m: any) => ({ role: m.role, content: String(m.content ?? "") })),
  ];

  const tools = [...TOOL_DEFS, ...WRITE_TOOL_DEFS];
  const trace: { tool: string; args: any; ok: boolean; summary?: string }[] = [];
  let promptTokens = 0, completionTokens = 0, toolCalls = 0;
  let pendingAction: { tool: string; args: any } | null = null;
  let answer = "";

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await chat({ messages: convo, tools, model: MODEL_FAST, maxTokens: 1500 });
      promptTokens += res.usage?.prompt_tokens ?? 0;
      completionTokens += res.usage?.completion_tokens ?? 0;

      const msg = res.message;
      const calls = msg.tool_calls || [];
      if (!calls.length) { answer = msg.content || ""; break; }

      convo.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });

      for (const call of calls) {
        toolCalls++;
        let args: any = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch {}

        // I tool di scrittura NON vengono eseguiti: diventano un'azione da confermare.
        if (WRITE_TOOL_NAMES.has(call.function.name)) {
          pendingAction = { tool: call.function.name, args };
          trace.push({ tool: call.function.name, args, ok: true, summary: "in attesa di conferma" });
          convo.push({
            role: "tool", tool_call_id: call.id,
            content: JSON.stringify({ status: "pending_confirmation", note: "Azione proposta all'utente, non ancora eseguita." }),
          });
          continue;
        }

        try {
          const out = await runTool(call.function.name, args, scope);
          trace.push({ tool: call.function.name, args, ok: true });
          convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out).slice(0, 12000) });
        } catch (e: any) {
          trace.push({ tool: call.function.name, args, ok: false, summary: e?.message });
          convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: e?.message || "errore tool" }) });
        }
      }

      if (pendingAction) {
        // chiudi il giro chiedendo al modello di formulare la proposta
        const res2 = await chat({ messages: convo, model: MODEL_FAST, maxTokens: 400 });
        promptTokens += res2.usage?.prompt_tokens ?? 0;
        completionTokens += res2.usage?.completion_tokens ?? 0;
        answer = res2.message.content || "Confermi l'azione proposta?";
        break;
      }
    }

    if (!answer) answer = "Non sono riuscito a completare la richiesta entro i passaggi disponibili.";

    const cost = estimateCost(MODEL_FAST, promptTokens, completionTokens);
    supabase.from("ai_usage").insert({
      user_id: scope.userId, model: MODEL_FAST, prompt_tokens: promptTokens,
      completion_tokens: completionTokens, cost_usd: cost, latency_ms: Date.now() - started,
      tool_calls: toolCalls, ok: true,
    }).then(() => {}, () => {});

    return NextResponse.json({
      answer, trace, pending_action: pendingAction,
      usage: { promptTokens, completionTokens, costUsd: Number(cost.toFixed(6)), ms: Date.now() - started },
    });
  } catch (e: any) {
    supabase.from("ai_usage").insert({
      user_id: scope.userId, model: MODEL_FAST, prompt_tokens: promptTokens,
      completion_tokens: completionTokens, latency_ms: Date.now() - started,
      tool_calls: toolCalls, ok: false, error: String(e?.message || e).slice(0, 500),
    }).then(() => {}, () => {});
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
