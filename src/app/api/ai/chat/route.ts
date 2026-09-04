import { NextResponse } from "next/server";
import { registraConsumo, codiceErrore } from "@/lib/ai/consumi";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { type ChatMessage } from "@/lib/ai/deepseek";
import { chatAi as chat, chiavePer as hasKey } from "@/lib/ai/chatAi";
import { modelloDi } from "@/lib/ai/modelloDi";
import { tettoPer, costoChiamata, MODELLO_DI_SISTEMA } from "@/lib/ai/modelli";
import { getScope } from "@/lib/ai/scope";
import { canUseAI } from "@/lib/roles";
import { TOOL_DEFS, WRITE_TOOL_DEFS, WRITE_TOOL_NAMES, runTool } from "@/lib/ai/tools";
import { REGOLE_DI_CASA, MAPPA_ESSENZIALE } from "@/lib/ai/interroga";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* Sei erano pochi da quando l'assistente può interrogare il database: una
   domanda vera vuole un paio di tentativi (una query sbagliata, la si corregge,
   poi si risponde). Dieci danno respiro senza far girare a vuoto — e con la
   mappa essenziale nel prompt i giri sprecati sono molti meno. */
const MAX_STEPS = 10;

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
    /* GLI STRUMENTI PER GUARDARE DAVVERO (Luca 29/08). Gli altri tool
       rispondono a domande previste; queste tre servono a tutte le altre. */
    "- Se la domanda riguarda dati che gli altri tool non coprono — call center, appuntamenti,",
    "  malus, magazzino, gare — NON dire che non puoi: usa `interroga`.",
    "- VAI DIRETTA. Per le tabelle qui sotto hai già la mappa: scrivi subito l'interrogazione,",
    "  senza passare da `elenco_tabelle` o `descrivi_tabella`. Quelli servono SOLO per le tabelle",
    "  che non trovi nella mappa.",
    "- Meglio UNA interrogazione che risponde che cinque che esplorano: hai pochi passaggi, e se",
    "  li finisci l'utente resta senza risposta.",
    "- La risposta di `interroga` ti dice se sono state nascoste righe o colonne perché fuori",
    "  dai permessi di chi ha chiesto: se è successo, DILLO invece di far finta di niente.",
    "- Quando dai un numero che viene da `interroga`, di' in una riga come l'hai contato.",
    "",
    MAPPA_ESSENZIALE,
    REGOLE_DI_CASA,
    "",
    "NOTE SUI DATI (importanti per non dare risposte fuorvianti):",
    /* LE RIGHE DEMO NON CI SONO PIÙ (verificato il 29/08: 5265 contratti, tutti
       is_demo=false). La nota che c'era prima faceva aggiungere all'assistente
       un «di cui X demo» che non voleva dire niente e faceva dubitare di
       numeri giusti. */
    "- I contratti demo sono stati azzerati: NON aggiungere avvertenze sui dati demo.",
    "- I brand sono scritti in modo incoerente (WindTre/WIND3, VODAFONE/Vodafone): i tool",
    "  normalizzano gia' gli alias, non filtrare a mano.",
    /* L'ANALISI DI RETE LA VEDONO TUTTI (Luca 29/08). Il totale d'azienda è una
       domanda legittima anche per chi gestisce due negozi; il dettaglio di un
       punto vendita che non gestisce no. */
    "- Il TOTALE DI RETE (senza distinguere i negozi) lo puoi dare a chiunque: l'Analisi di rete",
    "  la vedono tutti. Il DETTAGLIO di un singolo punto vendita solo a chi quel negozio lo vede.",
    "- Quando dai un totale a chi NON vede tutti i negozi, di' se è il totale dell'azienda o solo",
    "  dei suoi punti vendita: confondere i due è il modo più facile di dare un numero sbagliato.",
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
    // 🔒 sessione + permesso della sezione, come nel pannello
    const _g = await accesso(req, "ai/chat");
    if (!_g.ok) return _g.risposta;
    const _sess = _g.sess;

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

  /* IL MODELLO È DI CHI SCRIVE (Luca 28/08 sera): lo decide il pannello
     Permessi, o l'utente stesso se gli è stata data la libertà. Il tetto
     viene DAL MODELLO: i modelli che ragionano consumano il tetto per
     pensare, e con un tetto basso rispondono il vuoto. */
  const scelta = await modelloDi(String(userId || ""));
  let MODELLO = scelta.modello;
  let TETTO = tettoPer(MODELLO, 1500);

  /* SE IL MODELLO SCELTO NON RISPONDE, SI RIPIEGA (rilievo del revisore).
     Un id che l'operatore non riconosce più, un modello ritirato, un limite
     sull'account: senza questo l'assistente resterebbe MUTO per quella
     persona — con un errore tecnico a schermo — finché non si ricorda di
     tornare nelle impostazioni. Meglio rispondere col modello di sistema e
     dirlo. */
  let ripiegato = false;
  const parla = async (args: Parameters<typeof chat>[0]) => {
    try {
      return await chat({ ...args, model: MODELLO, maxTokens: TETTO });
    } catch (e) {
      const msg = String((e as Error)?.message || "");
      // errore del MODELLO (non della rete o della chiave): si riprova con quello di sistema
      // «non configurata» compresa: da quando i fornitori sono due, si può
      // avere assegnato un modello Claude senza che la chiave sia sul server —
      // e il ripiego serve proprio a non lasciare muta quella persona.
      const colpaDelModello = /400|model|not found|unsupported|deprecat|non configurata/i.test(msg);
      if (!colpaDelModello || MODELLO === MODELLO_DI_SISTEMA) throw e;
      ripiegato = true;
      MODELLO = MODELLO_DI_SISTEMA;
      TETTO = tettoPer(MODELLO, 1500);
      return await chat({ ...args, model: MODELLO, maxTokens: TETTO });
    }
  };

  const tools = [...TOOL_DEFS, ...WRITE_TOOL_DEFS];
  const trace: { tool: string; args: any; ok: boolean; summary?: string }[] = [];
  let promptTokens = 0, completionTokens = 0, toolCalls = 0;
  let cacheTokens = 0, reasoningTokens = 0;   // sconto della cache e peso del pensiero
  let pendingAction: { tool: string; args: any } | null = null;
  let answer = "";

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await parla({ messages: convo, tools });
      promptTokens += res.usage?.prompt_tokens ?? 0;
      completionTokens += res.usage?.completion_tokens ?? 0;
        cacheTokens += res.usage?.prompt_cache_hit_tokens ?? 0;
        reasoningTokens += res.usage?.completion_tokens_details?.reasoning_tokens ?? 0;

      const msg = res.message;
      const calls = msg.tool_calls || [];
      if (!calls.length) {
        answer = msg.content || "";
        /* RISPOSTA TRONCATA (rilievo del revisore): quando il modello esaurisce
           il tetto mentre ragiona, torna un contenuto VUOTO — e l'utente si
           vedeva un messaggio sui «passaggi disponibili», che parla d'altro.
           Il motivo vero sta in finish_reason: si legge e si dice. */
        if (!answer.trim() && res.finish_reason === "length") {
          answer = "La risposta si è interrotta: era troppo lunga per lo spazio disponibile. Prova a chiedermi la stessa cosa in modo più circoscritto, oppure fammelo sapere e alzo il limite.";
        }
        break;
      }

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
        const res2 = await parla({ messages: convo });
        promptTokens += res2.usage?.prompt_tokens ?? 0;
        completionTokens += res2.usage?.completion_tokens ?? 0;
        cacheTokens += res2.usage?.prompt_cache_hit_tokens ?? 0;
        reasoningTokens += res2.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
        answer = res2.message.content || "Confermi l'azione proposta?";
        break;
      }
    }

    if (!answer) answer = "Non sono riuscito a completare la richiesta entro i passaggi disponibili.";

    const cost = costoChiamata(MODELLO, promptTokens, completionTokens, cacheTokens);
    /* il registro dei consumi, con tutto quello che serve al pannello: da
       quale sezione, chiesta da chi, su quale «utenza» (qui la persona
       stessa), e quanti passaggi ha fatto prima di rispondere */
    void registraConsumo({
      sezione: "assistente", funzione: "domanda", automatica: false,
      modello: MODELLO, tokenIn: promptTokens, tokenOut: completionTokens,
      tokenInCache: cacheTokens, tokenRagionamento: reasoningTokens,
      userId: scope.userId, negozio: scope.stores?.[0] ?? null, ruolo: scope.role ?? null,
      utenza: scope.userId ? { tipo: "utente" as const, id: scope.userId, label: scope.fullName || "" } : null,
      durataMs: Date.now() - started, strumenti: toolCalls, passaggi: trace.length,
      esito: "ok", conversazione: conversazioneId || null,
    });

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
    /* ⚠️ UN CODICE, NON IL MESSAGGIO. Prima si salvava String(e.message)
       troncato a 500 caratteri — e il messaggio del fornitore si porta dietro
       300 caratteri del corpo della richiesta, cioè della DOMANDA. Un pezzo
       di domanda finiva in una tabella che il browser poteva leggere. */
    void registraConsumo({
      sezione: "assistente", funzione: "domanda", automatica: false,
      modello: MODELLO, tokenIn: promptTokens, tokenOut: completionTokens,
      userId: scope.userId, negozio: scope.stores?.[0] ?? null, ruolo: scope.role ?? null,
      utenza: scope.userId ? { tipo: "utente" as const, id: scope.userId, label: scope.fullName || "" } : null,
      durataMs: Date.now() - started, strumenti: toolCalls,
      esito: codiceErrore(e) === "senza_credito" ? "senza_credito" : "errore",
      codiceErrore: codiceErrore(e), conversazione: conversazioneId || null,
    });
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
