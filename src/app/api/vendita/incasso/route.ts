import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { arrotonda5 } from "@/lib/pos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mette in coda un incasso CONTANTI sulla cassa automatica (pagAmico) del negozio.
// L'agente locale (TelefuturaPosAgent) ritira il job kind='cash_collect', comanda
// la cassa e scrive l'esito (incassato/resto) nel campo result del job; il client
// poi poll-a print_jobs finché done/error.
//   POST { negozio, amount, cashIp? }
export async function POST(req: Request) {
  const b: any = await req.json().catch(() => ({}));
  const amount = arrotonda5(Number(b.amount));
  if (!(amount > 0)) return NextResponse.json({ error: "importo non valido" }, { status: 400 });

  const { data, error } = await supabase.from("print_jobs").insert({
    negozio: b.negozio ?? null,
    device_url: b.cashIp || "",          // vuoto = l'agente usa il suo -CashIp locale
    kind: "cash_collect",
    request_xml: JSON.stringify({ amount }),
    status: "pending",
    meta: { amount },
  }).select("id, status").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, jobId: data.id, amount });
}
