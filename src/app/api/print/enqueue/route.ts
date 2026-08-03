import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { agentAuthorized } from "@/lib/printAuth";
import { buildRequestXml } from "@/lib/fiscalprint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mette in coda un job di stampa. Non stampa nulla direttamente: sarà l'agente
// del negozio a ritirarlo (/api/print/next) e inoltrarlo alla stampante.
//   POST { kind, negozio?, deviceUrl?, lines?, items?, payment?, requestXml? }
//   kind: "status" (default, sola lettura) | "rt_status" | "test" (slip NON
//         fiscale) | "non_fiscal" (con lines[]) | "fiscal_receipt" (con items[]
//         + payment: EMETTE scontrino fiscale VERO) | "raw" (con requestXml)
export async function POST(req: Request) {
  const auth = agentAuthorized(req);
  if (auth === null) return NextResponse.json({ error: "PRINT_AGENT_TOKEN non configurato sul server" }, { status: 503 });
  if (!auth) return NextResponse.json({ error: "non autorizzato" }, { status: 401 });

  const b = await req.json().catch(() => ({} as any));
  const kind = String(b.kind || "status");
  let request_xml: string | null;
  try {
    // buildRequestXml puo' LANCIARE se un reparto IVA e' mancante/non valido
    // (sicurezza fiscale, richiamo di Luca 01/08): meglio un 400 chiaro che uno
    // scontrino con l'IVA sbagliata.
    request_xml = buildRequestXml(kind, { lines: b.lines, requestXml: b.requestXml, items: b.items, payment: b.payment });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "dati non validi" }, { status: 400 });
  }
  if (!request_xml) return NextResponse.json({ error: `kind non valido o dati mancanti: ${kind}` }, { status: 400 });

  const { data, error } = await supabase.from("print_jobs").insert({
    negozio: b.negozio ?? null,
    device_url: b.deviceUrl || "http://192.168.1.50",
    kind,
    request_xml,
    status: "pending",
  }).select("id, kind, status, negozio, created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, job: data });
}
