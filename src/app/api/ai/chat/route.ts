import { NextResponse } from "next/server";
import { richiedeSessione, rispostaSessioneNonValida } from "@/lib/sessioneServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { chat, estimateCost, hasKey, MODEL_FAST, type ChatMessage } from "@/lib/ai/deepseek";
import { getScope } from "@/lib/ai/scope";
import { canUseAI } from "@/lib/roles";
import { TOOL_DEFS, WRITE_TOOL_DEFS, WRITE_TOOL_NAMES, runTool } from "@/lib/ai/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_STEPS = 6;

type Personale = { personalita?: string | null; memorie?: string | null; nome_assistente?: string | null; progetto?: { nome: string; istruzioni?: string | null } | null };

function systemPrompt(scope: any, p?: Personale) {
  const ambito = scope.seesAll
    ? "Vedi i dati di TUTTI i negozi."
    : `Vedi SOLO i negozi: ${scope.stores.join(", ") || "(nessuno)"}. Non hai accesso ad altri negozi.`;
  // LO SPAZIO PERSONALE (Luca 28/08): chi vuole, si regola l'assistente come
  // preferisce — il tono, cosa deve ricordarsi di lui, e il contesto del
  // progetto in cui sta lavorando. Vale solo per lui: nessuno vede il resto.
  const suo: string[] = [];
  if (p?.nome_assistente) suo.push(`Ti chiami ${p.nome_assistente}: è il nome che ti ha dato questa persona.`);
  if (p?.personalita) suo.push(`COME VUOLE CHE TU RISPONDA (istruzioni sue, hanno la precedenza sullo stile di default):\n${p.personalita}`);
  if (p?.memorie) suo.push(`COSA DEVI RICORDARE DI LUI (te l'ha scritto lui stesso):\n${p.memorie}`);
  if (p?.progetto) suo.push(`STATE LAVORANDO NEL PROGETTO «${p.progetto.nome}»${p.progetto.istruzioni ? `:\n${p.progetto.istruzioni}` : "."}`);
  return [
    "Sei l'assistente interno del CRM Telefutura. Rispondi in italiano, conciso e concreto.",
    `Utente: ${scope.fullName} — ruolo ${scope.role}. ${ambito}`,
    ...(suo.length ? ["", ...suo] : []),
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
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    const _sess = richiedeSessione(req);
    if (!_sess) return rispostaSessioneNonValida();

  const started = Date.now();
  if (!hasKey()) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY non configurata sul server" }, { status: 500 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON non valido" }, { status: 400 }); }

  const { messages, conversazioneId } = body || {};
  // 🔒 l'identità viene dalla SESSIONE, non da quello che dichiara il client
  const userId = _sess.id;
  if (!userId || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "userId e messages sono obbligatori" }, { status: 400 });
  }

  const scope = await getScope(userId);
  if (!scope) return NextResponse.json({ error: "Utente non valido o non attivo" }, { status: 403 });
  // Il controllo che conta: la pagina si puo' aggirare, questa chiamata no.
  if (!canUseAI(scope.role)) {
    return NextResponse.json({ error: "Assistente riservato ai ruoli manageriali" }, { status: 403 });
  }

  // preferenze personali + contesto del progetto della conversazione
  let personale: Personale | undefined;
  try {
    const [pref, conv] = await Promise.all([
      supabase.from("ai_preferenze").select("personalita, memorie, nome_assistente").eq("user_id", userId).maybeSingle(),
      conversazioneId
        ? supabase.from("ai_conversazioni").select("progetto_id").eq("id", conversazioneId).eq("user_id", userId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    personale = { ...(pref.data || {}) };
    const progId = (conv.data as { progetto_id?: string | null } | null)?.progetto_id;
    if (progId) {
      const { data: pr } = await supabase.from("ai_progetti").select("nome, istruzioni").eq("id", progId).eq("user_id", userId).maybeSingle();
      if (pr) personale.progetto = pr as { nome: string; istruzioni?: string | null };
    }
  } catch { /* senza preferenze l'assistente resta quello di sempre */ }

  const convo: ChatMessage[] = [
    { role: "system", content: systemPrompt(scope, personale) },
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
        // 400 non bastavano: il ragionamento del modello li consuma tutti e
        // la proposta usciva vuota (stesso difetto trovato nell'Omnichat il
        // 27/08) — restava il fallback «Confermi l'azione proposta?»
        const res2 = await chat({ messages: convo, model: MODEL_FAST, maxTokens: 1500 });
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

    // ── LA CONVERSAZIONE RESTA (Luca 28/08): domanda e risposta finiscono
    //    nello spazio personale, così la si ritrova da qualsiasi computer.
    //    Il titolo si scrive da sé dalla prima domanda.
    if (conversazioneId) {
      try {
        const ultimaDomanda = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
        await supabase.from("ai_messaggi").insert([
          { conversazione_id: conversazioneId, user_id: userId, ruolo: "user", contenuto: String(ultimaDomanda) },
          { conversazione_id: conversazioneId, user_id: userId, ruolo: "assistant", contenuto: answer,
            meta: { strumenti: trace.map((t) => t.tool), token: promptTokens + completionTokens } },
        ]);
        const patch: Record<string, unknown> = { ultimo_messaggio_at: new Date().toISOString() };
        const { data: conv } = await supabase.from("ai_conversazioni").select("titolo").eq("id", conversazioneId).eq("user_id", userId).maybeSingle();
        if (conv && !conv.titolo) {
          patch.titolo = String(ultimaDomanda).replace(/\s+/g, " ").trim().slice(0, 60) || "Nuova conversazione";
        }
        await supabase.from("ai_conversazioni").update(patch).eq("id", conversazioneId).eq("user_id", userId);
      } catch { /* la risposta è più importante del salvataggio */ }
    }

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
