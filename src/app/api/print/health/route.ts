import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { agentiVisti } from "@/lib/printQueueCache";
import { richiedeSessione } from "@/lib/sessioneServer";

const RUOLI_OK = ["amministrativo", "direttore_generale", "admin", "dev"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MONITOR NEGOZI: salute degli agenti/stampa per ogni negozio.
//   GET /api/print/health?token=<PRINT_AGENT_TOKEN>
// Per ogni negozio configurato (pos_rt): agente VIVO? (heartbeat poll), quanti job
// in coda e da quanto (agente fermo?), ultimo esito, modalita' (demo/fiscale).
// CORS aperto: la dashboard (file locale) la interroga dal browser. Token in query
// per evitare accessi casuali (dato non sensibile: stato stampa negozi).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

export async function GET(req: Request) {
  // AUTORIZZAZIONE: o il token (dashboard esterna, cross-origin) o una sessione
  // admin firmata (monitor dentro il CRM, same-origin col cookie).
  const token = new URL(req.url).searchParams.get("token") || "";
  const expected = process.env.PRINT_AGENT_TOKEN || "";
  let authed = !!expected && token === expected;
  if (!authed) {
    const sess = richiedeSessione(req);
    if (sess) {
      const { data: u } = await supabase.from("app_users").select("role, active").eq("id", sess.id).maybeSingle();
      if (u && u.active !== false && RUOLI_OK.includes(String(u.role || ""))) authed = true;
    }
  }
  if (!authed) return NextResponse.json({ error: "non autorizzato" }, { status: 401, headers: CORS });

  const now = Date.now();
  // negozi configurati
  const { data: rts } = await supabase.from("pos_rt").select("negozio, rt_url, azienda, ragione_sociale");
  const negozi = [...new Set((rts || []).map((r) => r.negozio))];
  const custom: Record<string, boolean> = {};
  (rts || []).forEach((r) => { if (!/^https?:\/\//i.test(String(r.rt_url || ""))) custom[r.negozio] = true; });

  // modalita fiscale
  const { data: sc } = await supabase.from("pos_scontrino_negozi").select("negozio, test_mode");
  const fiscale: Record<string, boolean> = {};
  (sc || []).forEach((s) => { fiscale[s.negozio] = s.test_mode === false; });
  const abilitato = new Set((sc || []).map((s) => s.negozio));

  // job delle ultime 2 ore (per pending + ultimo esito)
  const since = new Date(now - 2 * 3600 * 1000).toISOString();
  const { data: jobs } = await supabase.from("print_jobs")
    .select("negozio, kind, status, created_at, updated_at")
    .gte("created_at", since).order("created_at", { ascending: false }).limit(2000);

  const seen = agentiVisti();

  const perNeg: Record<string, any> = {};
  for (const n of negozi) perNeg[n] = { pending: 0, oldestPendingSec: null, ultimo: null, ultimoStato: null, errori: 0 };
  for (const j of (jobs || [])) {
    const p = perNeg[j.negozio]; if (!p) continue;
    if (j.status === "pending") {
      p.pending++;
      const age = Math.round((now - new Date(j.created_at).getTime()) / 1000);
      if (p.oldestPendingSec == null || age > p.oldestPendingSec) p.oldestPendingSec = age;
    }
    if (!p.ultimo) { p.ultimo = j.updated_at || j.created_at; p.ultimoStato = j.status + " · " + j.kind; }
    if (j.status === "error") p.errori++;
  }

  const stores = negozi.map((n) => {
    const p = perNeg[n];
    const lastSeenMs = seen[n] ? Math.round((now - seen[n]) / 1000) : null; // secondi fa
    // stato: DOWN se ha job fermi da >20s; WARN se agente non visto da >30s; OK altrimenti
    let stato = "ok";
    if (p.pending > 0 && (p.oldestPendingSec ?? 0) > 20) stato = "down";
    else if (lastSeenMs == null || lastSeenMs > 40) stato = "warn";
    return {
      negozio: n,
      custom: !!custom[n],
      fiscale: !!fiscale[n],
      abilitato: abilitato.has(n),
      agenteVistoSecFa: lastSeenMs,
      pending: p.pending,
      oldestPendingSec: p.oldestPendingSec,
      errori2h: p.errori,
      ultimo: p.ultimo,
      ultimoStato: p.ultimoStato,
      stato,
    };
  }).sort((a, b) => {
    const rank = (s: string) => (s === "down" ? 0 : s === "warn" ? 1 : 2);
    return rank(a.stato) - rank(b.stato) || a.negozio.localeCompare(b.negozio);
  });

  return NextResponse.json({ ok: true, ts: now, stores }, { headers: CORS });
}
