import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { agentAuthorized } from "@/lib/printAuth";
import { queueKnownEmpty, markQueueEmpty, markQueueHasWork } from "@/lib/printQueueCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// L'agente del negozio chiede il prossimo job da stampare. Restituisce il più
// vecchio in stato "pending" (eventualmente filtrato per negozio) e lo marca
// "sent" in modo atomico (per non consegnarlo due volte).
//   GET /api/print/next?negozio=<opzionale>
export async function GET(req: Request) {
  const auth = agentAuthorized(req);
  if (auth === null) return NextResponse.json({ error: "PRINT_AGENT_TOKEN non configurato" }, { status: 503 });
  if (!auth) return NextResponse.json({ error: "non autorizzato" }, { status: 401 });

  const negozio = new URL(req.url).searchParams.get("negozio");

  // (① anti-522) Se la coda di questo negozio è stata vista VUOTA pochi secondi
  // fa, rispondi senza toccare il DB: i poll a vuoto degli agenti non martellano
  // più Supabase. Un job nuovo viene comunque ritirato entro il TTL della cache.
  if (queueKnownEmpty(negozio)) return NextResponse.json({ job: null });

  /* PRIMA DI TUTTO: I LAVORI RITIRATI E MAI CONFERMATI (31/08/2026).
     Un job passa a "sent" appena l'agente lo ritira, e torna "done"/"error"
     solo quando l'agente riporta l'esito su /result. Se l'agente muore in
     mezzo — o, com'è successo fino a stasera, se /result gli rifiuta il
     callback — quel lavoro resta "sent" PER SEMPRE: 42 ce n'erano stasera, il
     più vecchio dell'11 agosto, e nessuno se n'era accorto perché in quello
     stato non compare né come fatto né come fallito.
     Da qui in poi scadono: dopo 10 minuti diventano "error" con scritto che
     l'esito non è mai arrivato. NON si rimettono in coda — un `cash_collect`
     ristampato è un cassetto che si riapre e un cliente che paga due volte:
     meglio un fallimento visibile, che qualcuno può decidere di ripetere, di
     una ristampa automatica che nessuno ha chiesto. */
  if (negozio) {
    await supabase.from("print_jobs")
      .update({ status: "error", result: '{"ok":false,"msg":"esito mai ricevuto dall\'agente del negozio: scaduto dopo 10 minuti"}', updated_at: new Date().toISOString() })
      .eq("negozio", negozio).eq("status", "sent")
      .lt("updated_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
  }

  let q = supabase.from("print_jobs").select("*").eq("status", "pending")
    .order("created_at", { ascending: true }).limit(1);
  if (negozio) q = q.eq("negozio", negozio);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const job = data?.[0];
  if (!job) { markQueueEmpty(negozio); return NextResponse.json({ job: null }); }
  markQueueHasWork(negozio); // c'è lavoro: il prossimo poll ricontrolla il DB

  // marca "sent" SOLO se ancora pending -> evita il doppio ritiro fra due agenti
  const { data: upd } = await supabase.from("print_jobs")
    .update({ status: "sent", attempts: (job.attempts || 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", job.id).eq("status", "pending").select("id");
  if (!upd || upd.length === 0) return NextResponse.json({ job: null });

  return NextResponse.json({ job: { id: job.id, kind: job.kind, device_url: job.device_url, request_xml: job.request_xml } });
}
