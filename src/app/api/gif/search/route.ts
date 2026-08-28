import { NextResponse } from "next/server";
import { richiedeSessione, rispostaSessioneNonValida } from "@/lib/sessioneServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ricerca GIF per il picker della chat interna. Proxy su Giphy: la chiave resta
// SOLO server (env GIPHY_API_KEY). Senza chiave risponde 200 con items:[] e un
// messaggio, così il picker mostra un avviso invece di rompersi.
//   GET /api/gif/search?q=<testo>   (q vuoto = tendenza)
export async function GET(req: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        const _s = richiedeSessione(req);
        if (!_s) return rispostaSessioneNonValida();
    }

  const key = process.env.GIPHY_API_KEY;
  const sp = new URL(req.url).searchParams;
  // check leggero (no chiamata Giphy): il client mostra il tasto GIF solo se attivo
  if (sp.get("check")) return NextResponse.json({ enabled: !!key });
  if (!key) return NextResponse.json({ items: [], error: "GIF non configurate (manca GIPHY_API_KEY)" });

  const q = (sp.get("q") || "").trim();
  const common = `api_key=${key}&limit=24&rating=pg-13&bundle=messaging_non_clips`;
  const url = q
    ? `https://api.giphy.com/v1/gifs/search?${common}&q=${encodeURIComponent(q)}`
    : `https://api.giphy.com/v1/gifs/trending?${common}`;

  try {
    const r = await fetch(url, { cache: "no-store" });
    const j: any = await r.json();
    const items = (j?.data || [])
      .map((g: any) => ({
        id: g.id,
        preview: g.images?.fixed_width_small?.url || g.images?.preview_gif?.url || g.images?.fixed_height_small?.url,
        gif: g.images?.fixed_height?.url || g.images?.downsized_medium?.url || g.images?.original?.url,
      }))
      .filter((x: any) => x.gif);
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e?.message || "errore Giphy" });
  }
}
