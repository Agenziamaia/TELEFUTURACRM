import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { agentAuthorized } from "@/lib/printAuth";

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
  let q = supabase.from("print_jobs").select("*").eq("status", "pending")
    .order("created_at", { ascending: true }).limit(1);
  if (negozio) q = q.eq("negozio", negozio);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const job = data?.[0];
  if (!job) return NextResponse.json({ job: null });

  // marca "sent" SOLO se ancora pending -> evita il doppio ritiro fra due agenti
  const { data: upd } = await supabase.from("print_jobs")
    .update({ status: "sent", attempts: (job.attempts || 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", job.id).eq("status", "pending").select("id");
  if (!upd || upd.length === 0) return NextResponse.json({ job: null });

  return NextResponse.json({ job: { id: job.id, kind: job.kind, device_url: job.device_url, request_xml: job.request_xml } });
}
