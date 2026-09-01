import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { agentAuthorized } from "@/lib/printAuth";
import { queueKnownEmpty, markQueueEmpty, markQueueHasWork, markAgentSeen } from "@/lib/printQueueCache";

/* Ogni quanto ripulire i job appesi, per negozio. Vive nel processo come la
   cache della coda: se il server riparte si riparte da zero, e va benissimo —
   è una pulizia, non un obbligo. */
const PULIZIA_MS = 5 * 60 * 1000;
const ultimaPulizia = new Map<string, number>();
function vecchiDaPulire(negozio: string) {
  const ora = Date.now();
  if (ora - (ultimaPulizia.get(negozio) || 0) < PULIZIA_MS) return false;
  ultimaPulizia.set(negozio, ora);
  return true;
}

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
  markAgentSeen(negozio); // heartbeat per il monitor negozi

  // (① anti-522) Se la coda di questo negozio è stata vista VUOTA pochi secondi
  // fa, rispondi senza toccare il DB: i poll a vuoto degli agenti non martellano
  // più Supabase. Un job nuovo viene comunque ritirato entro il TTL della cache.
  if (queueKnownEmpty(negozio)) return NextResponse.json({ job: null });

  /* I LAVORI RITIRATI E MAI CONFERMATI (31/08/2026).
     Un job passa a "sent" appena l'agente lo ritira, e torna "done"/"error"
     solo quando l'agente riporta l'esito su /result. Se l'agente muore in
     mezzo — o, com'è successo fino a stasera, se /result gli rifiuta il
     callback — quel lavoro resta "sent" PER SEMPRE: 42 ce n'erano, il più
     vecchio dell'11 agosto, e nessuno se n'era accorto perché in quello stato
     non compare né come fatto né come fallito.

     TRE CAUTELE, tutte imparate dal revisore:
     · UNA VOLTA OGNI CINQUE MINUTI per negozio, non a ogni poll. La cache
       anti-522 dura 2,5 s e l'agente chiama ogni 4: non prende mai, quindi il
       blocco girerebbe SEMPRE — quindici negozi che scrivono ogni quattro
       secondi sulla stessa rotta che era stata alleggerita poche ore prima
       perché quel carico manda Supabase in 522.
     · MAI SUI CONTANTI. Un `cash_collect` marcato «fallito» sparisce
       dall'incassato del giorno e invita a rifarlo: soldi nel cassetto, zero
       nel CRM, e un cliente che rischia di pagare due volte.
     · SOLO DOVE L'ESITO NON C'È (`result is null`). Se una risposta è
       arrivata, è lei la verità: non si sovrascrive.
     E non si rimettono in coda: meglio un fallimento visibile, che qualcuno
     può decidere di ripetere, di una ristampa che nessuno ha chiesto. */
  if (negozio && vecchiDaPulire(negozio)) {
    const { error: ePul } = await supabase.from("print_jobs")
      .update({ status: "error", result: '{"ok":false,"msg":"esito mai ricevuto dall\'agente del negozio: scaduto dopo 10 minuti"}', updated_at: new Date().toISOString() })
      .eq("negozio", negozio).eq("status", "sent").neq("kind", "cash_collect").is("result", null)
      .lt("updated_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
    // se la pulizia fallisce lo si SCRIVE: un difetto che si richiude in
    // silenzio è il difetto di partenza, con un anno in più addosso
    if (ePul) console.error("pulizia job appesi:", negozio, ePul.message);
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
