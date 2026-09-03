import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { xmlTestSlip } from "@/lib/fiscalprint";
import { sameStore } from "@/lib/negoziNomi";

// STAMPA DI PROVA (NON FISCALE) — richiesta dal pannello "Telefutura Cassa" del PC
// negozio. Mette in coda un documento NON fiscale (beginNonFiscal / printNormal /
// endNonFiscal): verifica end-to-end che stampante + agente funzionino SENZA
// emettere nulla verso l'Agenzia delle Entrate e SENZA incidere sulla chiusura Z.
// Nasce per togliere la tentazione di "provare" con scontrini FISCALI veri — vedi
// il caso "PROVA REPARTO" del 03/09 a Magliana, 9 documenti fiscali reali iniettati
// solo per un test dei reparti. Con un pulsante sicuro nel pannello, nessuno ha più
// motivo di farlo.
//
// Auth col PRINT_AGENT_TOKEN nel body (l'EXE non manda header custom), come
// /api/agent/report e /api/print/*.
//   POST /api/agent/test-print  { token, negozio, deviceUrl? }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const serverToken = process.env.PRINT_AGENT_TOKEN;
  if (!serverToken) return NextResponse.json({ error: "PRINT_AGENT_TOKEN non configurato" }, { status: 503 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "body non valido" }, { status: 400 }); }
  if (!b || b.token !== serverToken) return NextResponse.json({ error: "non autorizzato" }, { status: 401 });

  const negozio = String(b.negozio || "").slice(0, 80).trim();
  if (!negozio) return NextResponse.json({ error: "negozio mancante" }, { status: 400 });

  // DISPOSITIVO: prima quello che il pannello conosce (fiscalUrl dalla sua config),
  // poi pos_rt, infine vuoto -> l'agente usa la sua -FiscalUrl. `device_url` http =
  // Epson (ePOS), non-http/vuoto = Custom (via cust-fp): il documento NON fiscale
  // vale per entrambi (stessi comandi printNormal / testo estratto dal driver).
  let device_url = String(b.deviceUrl || "").trim();
  if (!device_url) {
    const { data } = await supabase.from("pos_rt").select("rt_url, is_default, agente, negozio");
    const rows = (data || []).filter((r: any) => r.agente === negozio || r.negozio === negozio || sameStore(r.negozio, negozio) || sameStore(r.agente, negozio));
    const row = rows.find((r: any) => r.is_default) || rows[0];
    if (row) device_url = String(row.rt_url || "");
  }
  // "custom"/vuoto restano tali: l'agente li instrada al registratore Custom locale.

  const request_xml = xmlTestSlip();
  const { data, error } = await supabase.from("print_jobs").insert({
    negozio,
    device_url,
    kind: "non_fiscal",
    request_xml,
    status: "pending",
    // NIENTE fiscale: meta segna che è una prova, così Documenti/monitor non la
    // contano come vendita né come errore fiscale.
    meta: { test: true, via: "pannello-cassa", nonFiscale: true },
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, jobId: data.id, device: device_url || "(config agente)" });
}
