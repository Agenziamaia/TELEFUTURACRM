import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

// L'EXE "Telefutura Cassa" del PC negozio invia qui lo stato locale ogni minuto
// (tipo="status") e le azioni/segnalazioni dello staff (tipo="azione"|"problema").
// Il token viaggia nel body (l'EXE non manda header custom); lo validiamo contro
// PRINT_AGENT_TOKEN come gli altri endpoint /api/print/*.
//   POST /api/agent/report  { token, negozio, tipo, agente, registratoreLibero, cassa, crm, nota, pc, versione }
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
  const tipo = ["status", "azione", "problema"].includes(b.tipo) ? b.tipo : "status";
  const bool = (v: any) => (typeof v === "boolean" ? v : null);

  const stato = {
    agente: bool(b.agente),
    registratore_libero: bool(b.registratoreLibero),
    cassa: bool(b.cassa),
    crm: bool(b.crm),
    pc: String(b.pc || "").slice(0, 120),
    versione: String(b.versione || "").slice(0, 20),
  };

  // 1) aggiorna SEMPRE lo stato "ultimo visto" del negozio (upsert su negozio)
  const { error: eUp } = await supabase
    .from("agent_status")
    .upsert({ negozio, ...stato, updated_at: new Date().toISOString() }, { onConflict: "negozio" });
  if (eUp) return NextResponse.json({ error: eUp.message }, { status: 500 });

  // 2) azioni e segnalazioni: righe appese (le segnalazioni restano "aperte")
  if (tipo === "azione" || tipo === "problema") {
    const nota = String(b.nota || "").slice(0, 2000);
    const { error: eRep } = await supabase.from("agent_reports").insert({
      negozio, tipo, nota,
      agente: stato.agente, registratore_libero: stato.registratore_libero,
      cassa: stato.cassa, crm: stato.crm, pc: stato.pc,
    });
    if (eRep) return NextResponse.json({ error: eRep.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
