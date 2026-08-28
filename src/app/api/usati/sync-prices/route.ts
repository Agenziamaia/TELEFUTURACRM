import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { fetchRefurbedPrices } from "@/lib/pricing/refurbed";
import { computeBuyback, type CategoriaDispositivo } from "@/lib/pricing/grades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// SYNC PREZZI USATO (Francesco 04/08) — popola market_buyback_prices leggendo
// refurbed.it (parsing HTML lato server: base + delta, nessuna API/browser).
// RESUMABILE: salta i modelli gia' sincronizzati da <15 giorni, cosi' cliccando
// piu' volte si avanza nel catalogo. Idempotente (upsert su chiave univoca).

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// brand realmente presenti su refurbed.it: evita di martellare con 404 gli
// (migliaia di) androidi di nicchia del catalogo Google. Se il chiamante passa
// un brand esplicito, ci si fida di lui e si sincronizza comunque.
const REFURBED_BRANDS = new Set([
  "apple", "samsung", "xiaomi", "google", "huawei", "oppo", "oneplus", "sony",
  "motorola", "nothing", "honor", "realme", "asus", "lg", "microsoft",
  "dell", "hp", "lenovo", "acer", "nokia", "tcl", "fairphone", "garmin",
]);

export async function POST(req: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(req, "usati/sync-prices");
        if (!_g.ok) return _g.risposta;
        const _s = _g.sess;
    }

  const t0 = Date.now();
  let logId: number | null = null;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const categoria = typeof body.categoria === "string" ? body.categoria : undefined;
    const brand = typeof body.brand === "string" ? body.brand : undefined;
    const limit = Math.min(120, Math.max(1, Number(body.limit) || 40));
    const byUser = String(body.byUser || "");

    // ── impostazioni margine/refurb ──
    const { data: st } = await supabase.from("pricing_settings").select("*").eq("id", 1).maybeSingle();
    const settings = {
      marginPct: Number(st?.margin_pct ?? 40),
      refurbCost: {
        smartphone: Number(st?.refurb_cost_smartphone ?? 0),
        tablet: Number(st?.refurb_cost_tablet ?? 0),
        watch: Number(st?.refurb_cost_watch ?? 0),
        computer: Number(st?.refurb_cost_computer ?? 0),
      },
    };

    // ── log inizio ──
    const { data: logRow } = await supabase.from("price_sync_log")
      .insert({ source: "refurbed.it", by_user: byUser, note: "in corso" }).select("id").maybeSingle();
    logId = (logRow?.id as number) ?? null;

    // ── modelli candidati dal catalogo ──
    let q = supabase.from("dispositivi_catalogo").select("categoria,brand,modello").eq("attivo", true);
    if (categoria) q = q.eq("categoria", categoria);
    if (brand) q = q.ilike("brand", brand);
    const { data: cat, error: catErr } = await q.limit(4000);
    if (catErr) throw new Error("catalogo: " + catErr.message);
    let models = (cat || []) as { categoria: string; brand: string; modello: string }[];
    // se nessun brand esplicito, resta ai brand che refurbed tratta davvero
    if (!brand) models = models.filter((m) => REFURBED_BRANDS.has(String(m.brand || "").toLowerCase()));

    // ── salta i modelli gia' freschi (<15gg) ──
    const cutoff = new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString();
    const { data: fresh } = await supabase.from("market_buyback_prices")
      .select("brand,device_model").gte("last_updated", cutoff);
    const freshSet = new Set((fresh || []).map((r) => (r.brand + "|" + r.device_model).toLowerCase()));
    const notFresh = models.filter((m) => !freshSet.has((m.brand + "|" + m.modello).toLowerCase()));
    const todo = notFresh.slice(0, limit);

    // ── ciclo di sync ──
    let devicesOk = 0, notFound = 0, rowsUpserted = 0;
    for (const m of todo) {
      const res = await fetchRefurbedPrices(m.brand, m.modello);
      if (!res) { notFound++; await sleep(120); continue; }
      const cat4 = m.categoria as CategoriaDispositivo;
      const rows = res.variants.map((v) => ({
        categoria: m.categoria,
        brand: m.brand,
        device_model: m.modello,
        storage: v.storage,
        retail_a: v.retail.A, retail_b: v.retail.B, retail_c: v.retail.C,
        grade_a_price: v.retail.A != null ? computeBuyback(v.retail.A, settings, cat4) : null,
        grade_b_price: v.retail.B != null ? computeBuyback(v.retail.B, settings, cat4) : null,
        grade_c_price: v.retail.C != null ? computeBuyback(v.retail.C, settings, cat4) : null,
        market_source: res.source,
        source_url: res.sourceUrl,
        margin_pct: settings.marginPct,
        last_updated: new Date().toISOString(),
      }));
      const { error: upErr } = await supabase.from("market_buyback_prices")
        .upsert(rows, { onConflict: "categoria,brand,device_model,storage" });
      if (!upErr) { devicesOk++; rowsUpserted += rows.length; }
      await sleep(280); // gentile con refurbed
    }

    const durationMs = Date.now() - t0;
    const remaining = Math.max(0, notFresh.length - todo.length);
    if (logId) await supabase.from("price_sync_log").update({
      finished_at: new Date().toISOString(), devices_ok: devicesOk, devices_failed: notFound,
      note: `ok ${devicesOk}, non trovati ${notFound}, righe ${rowsUpserted}, restano ${remaining}`,
    }).eq("id", logId);

    return NextResponse.json({
      ok: true, processed: todo.length, devices_ok: devicesOk, not_found: notFound,
      rows_upserted: rowsUpserted, remaining, duration_ms: durationMs, margin_pct: settings.marginPct,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore sync";
    if (logId) await supabase.from("price_sync_log").update({ finished_at: new Date().toISOString(), note: "errore: " + msg }).eq("id", logId);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// GET: stato ultimo sync (per il pannello admin)
export async function GET() {
  const { data: last } = await supabase.from("price_sync_log").select("*").order("id", { ascending: false }).limit(1).maybeSingle();
  const { count } = await supabase.from("market_buyback_prices").select("id", { count: "exact", head: true });
  return NextResponse.json({ ok: true, last, rows_in_cache: count ?? 0 });
}
