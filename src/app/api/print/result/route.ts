import { NextResponse } from "next/server";
import { richiedeSessione, rispostaSessioneNonValida } from "@/lib/sessioneServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { agentAuthorized } from "@/lib/printAuth";
import { ricaricheDelloScontrino } from "@/lib/paystoreSubito";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// L'agente riporta l'esito di un job dopo averlo inviato alla stampante.
//   POST { id, ok:boolean, response?:string }
export async function POST(req: Request) {
  // L'AGENTE del negozio si autentica col TOKEN (Bearer), NON con la sessione
  // firmata del browser. La blindatura-sessione (28/08) rifiutava il callback
  // dell'agente su /result: i job restavano "sent" per sempre e — peggio — i
  // FALLIMENTI di stampa non venivano registrati come "error". Quindi: se il
  // token agente e' valido si prosegue; la sessione firmata resta richiesta solo
  // per eventuali chiamate NON-agente.
  const auth = agentAuthorized(req);
  if (auth === null) return NextResponse.json({ error: "PRINT_AGENT_TOKEN non configurato" }, { status: 503 });
  if (!auth) {
    const _s = richiedeSessione(req);
    if (!_s) return rispostaSessioneNonValida();
    return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  }

  const b = await req.json().catch(() => ({} as any));
  if (!b.id) return NextResponse.json({ error: "id mancante" }, { status: 400 });

  const { error } = await supabase.from("print_jobs").update({
    status: b.ok ? "done" : "error",
    result: String(b.response ?? "").slice(0, 4000),
    updated_at: new Date().toISOString(),
  }).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /* ⚠️ IL CREDITO PARTE ADESSO, non fra cinque minuti (Luca 04/09: «aspettiamo
     veramente troppo tempo»). Questo è il momento in cui sappiamo che il
     cliente ha pagato: il registratore ha appena detto di aver stampato.
     Si lancia SENZA aspettarlo — la cassa non deve restare ferma perché
     PayStore è lento — e se qualcosa va storto la ricarica torna al motore,
     che continua a passare ogni cinque minuti. */
  if (b.ok) void ricaricheDelloScontrino(String(b.id));

  return NextResponse.json({ ok: true });
}
