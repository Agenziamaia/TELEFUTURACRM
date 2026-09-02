import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { agentiVisti } from "@/lib/printQueueCache";
import { richiedeSessione } from "@/lib/sessioneServer";
import { sameStore } from "@/lib/negoziNomi";

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
  const { data: rts } = await supabase.from("pos_rt").select("negozio, rt_url, azienda, ragione_sociale");
  const { data: sc } = await supabase.from("pos_scontrino_negozi").select("negozio, test_mode");

  // job delle ultime 2 ore (pending + ultimo esito + tipo dispositivo)
  const since = new Date(now - 2 * 3600 * 1000).toISOString();
  const { data: jobs } = await supabase.from("print_jobs")
    .select("negozio, kind, status, created_at, updated_at, device_url")
    .gte("created_at", since).order("created_at", { ascending: false }).limit(2000);

  const seen = agentiVisti();

  // LISTA NEGOZI = nomi OPERATIVI, cioè quelli con cui gli agenti e i job si presentano
  // DAVVERO ("Acilia Multi", "Acilia VS" = DUE PC/registratori distinti). pos_rt può
  // essere consolidato sulla radice corta ("Acilia"): NON lo usiamo come lista (fondeva
  // 2 PC in 1, nascondendone uno — bug visto 03/09), ma solo per arricchire, con match
  // tollerante [[negoziNomi.sameStore]]. Aggiungiamo anche i negozi in pos_rt senza
  // ancora attività/agente, se non già coperti da un nome operativo.
  const opSet = new Set<string>();
  Object.keys(seen).forEach((n) => opSet.add(n));
  (jobs || []).forEach((j) => { if (j.negozio) opSet.add(j.negozio); });
  for (const r of (rts || [])) {
    const nm = String(r.negozio || "");
    if (nm && ![...opSet].some((o) => sameStore(o, nm))) opSet.add(nm);
  }
  const negozi = [...opSet];

  // Custom vs Epson PER registratore: dal device_url dei job fiscali (accurato per PC);
  // ripiego su pos_rt (tollerante) se il negozio non ha job fiscali recenti.
  const DEV_JOB = new Set(["fiscal_receipt", "z_report", "test", "non_fiscal", "raw", "status"]);
  const custom: Record<string, boolean> = {};
  for (const n of negozi) {
    const jj = (jobs || []).filter((j) => j.negozio === n && DEV_JOB.has(j.kind) && j.device_url);
    const http = jj.some((j) => /^https?:\/\//i.test(String(j.device_url || "")));
    const cust = jj.some((j) => !/^https?:\/\//i.test(String(j.device_url || "")));
    if (http) custom[n] = false;
    else if (cust) custom[n] = true;
    else {
      const rrows = (rts || []).filter((r) => sameStore(n, r.negozio));
      if (rrows.length) custom[n] = rrows.every((r) => !/^https?:\/\//i.test(String(r.rt_url || "")));
    }
  }

  // modalità fiscale/abilitato: match tollerante contro pos_scontrino_negozi.
  const fiscale: Record<string, boolean> = {};
  const abilitato = new Set<string>();
  for (const n of negozi) {
    const srows = (sc || []).filter((s) => sameStore(n, s.negozio));
    if (srows.length) { abilitato.add(n); if (srows.some((s) => s.test_mode === false)) fiscale[n] = true; }
  }

  // CHIUSURA: un z_report "done" recente (chiusura di cassa) = il negozio ha chiuso e
  // con ogni probabilita' spento il PC. Combinato con "agente non vivo" lo mostriamo
  // GRIGIO ("chiuso"), non rosso/ambra: cosi' un agente giu' DOPO la Z non sembra un
  // guasto. La finestra è ~20h (NON "da mezzanotte": deve reggere TUTTA la notte, dalla
  // Z serale fino alla riapertura del mattino). Alla riapertura l'agente torna a
  // pollare → "vivo" → il negozio ridiventa verde: è la conferma "agente ripartito".
  const ZFINESTRA_MS = 20 * 3600 * 1000;
  const { data: zChiusure } = await supabase.from("print_jobs")
    .select("negozio")
    .eq("kind", "z_report").eq("status", "done")
    .gte("created_at", new Date(now - ZFINESTRA_MS).toISOString());
  const chiusuraOggi = new Set((zChiusure || []).map((z) => z.negozio));

  const perNeg: Record<string, any> = {};
  for (const n of negozi) perNeg[n] = { pending: 0, oldestPendingSec: null, ultimo: null, ultimoStato: null, errori: 0, busy: false, ultimaAttivitaSec: null };
  for (const j of (jobs || [])) {
    const p = perNeg[j.negozio]; if (!p) continue;
    if (j.status === "pending") {
      p.pending++;
      const age = Math.round((now - new Date(j.created_at).getTime()) / 1000);
      if (p.oldestPendingSec == null || age > p.oldestPendingSec) p.oldestPendingSec = age;
    }
    // BUSY: un job "sent" recente = l'agente sta LAVORANDO (tipico: cassa che
    // aspetta i soldi, fino a ~3 min). Non è "giù", è occupato → niente falso rosso.
    if (j.status === "sent") {
      const sentAge = Math.round((now - new Date(j.updated_at || j.created_at).getTime()) / 1000);
      if (sentAge < 200) p.busy = true;
    }
    // ultima attività vera dell'agente (sent/done/error = ha risposto)
    if (j.status !== "pending") {
      const actAge = Math.round((now - new Date(j.updated_at || j.created_at).getTime()) / 1000);
      if (p.ultimaAttivitaSec == null || actAge < p.ultimaAttivitaSec) p.ultimaAttivitaSec = actAge;
    }
    if (!p.ultimo) { p.ultimo = j.updated_at || j.created_at; p.ultimoStato = j.status + " · " + j.kind; }
    if (j.status === "error") p.errori++;
  }

  const stores = negozi.map((n) => {
    const p = perNeg[n];
    const lastSeenMs = seen[n] ? Math.round((now - seen[n]) / 1000) : null; // secondi fa
    // "vivo" = ha pollato di recente OPPURE ha lavorato un job di recente (durante
    // una cassa lunga l'agente non polla ma sta lavorando).
    const vivo = (lastSeenMs != null && lastSeenMs <= 45) || p.busy || (p.ultimaAttivitaSec != null && p.ultimaAttivitaSec <= 45);
    // DOWN = vendita ferma in coda da un po' E l'agente NON è vivo (né polla né lavora).
    // WARN = agente silente (forse caduto) ma niente in coda. CHIUSO = ha fatto la Z
    // oggi (chiusura del giorno) e non c'è nulla di fermo → grigio, non un guasto.
    // Altrimenti OK (incluso "occupato").
    const chiuso = chiusuraOggi.has(n);
    let stato = "ok";
    if (p.pending > 0 && (p.oldestPendingSec ?? 0) > 25 && !vivo) stato = "down";
    else if (chiuso && !vivo) stato = "chiuso";
    else if (!vivo && !p.busy) stato = "warn";
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
      chiusuraOggi: chiuso,
      stato,
    };
  }).sort((a, b) => {
    // ordine: guasti in alto, negozi chiusi in fondo (grigi, non urgenti)
    const rank = (s: string) => (s === "down" ? 0 : s === "warn" ? 1 : s === "chiuso" ? 3 : 2);
    return rank(a.stato) - rank(b.stato) || a.negozio.localeCompare(b.negozio);
  });

  return NextResponse.json({ ok: true, ts: now, stores }, { headers: CORS });
}
