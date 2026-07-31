import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { agentAuthorized } from "@/lib/printAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// L'agente riporta l'esito di un job dopo averlo inviato alla stampante.
//   POST { id, ok:boolean, response?:string }
export async function POST(req: Request) {
  const auth = agentAuthorized(req);
  if (auth === null) return NextResponse.json({ error: "PRINT_AGENT_TOKEN non configurato" }, { status: 503 });
  if (!auth) return NextResponse.json({ error: "non autorizzato" }, { status: 401 });

  const b = await req.json().catch(() => ({} as any));
  if (!b.id) return NextResponse.json({ error: "id mancante" }, { status: 400 });

  const { error } = await supabase.from("print_jobs").update({
    status: b.ok ? "done" : "error",
    result: String(b.response ?? "").slice(0, 4000),
    updated_at: new Date().toISOString(),
  }).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
