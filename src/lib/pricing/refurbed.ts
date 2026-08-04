// Adapter refurbed.it — SOLO parsing HTML lato server (niente API, niente browser
// headless): la pagina prodotto contiene il prezzo base + i "delta" per opzione
// (grado, taglio). Verificato 04/08/2026 su /p/iphone-13/.
//   prezzo(taglio, grado) = base + delta_taglio + delta_grado
// Etichette gradi refurbed (reali): Premium > Ottimo > Molto buono (+ "Nuova").
import { mapGrade, isNuovo, type Grade } from "./grades";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Accept-Language": "it-IT,it;q=0.9",
  "Accept": "text/html,application/xhtml+xml,*/*",
} as const;

export interface RefurbedVariant {
  storage: string; // normalizzato es. "128GB"
  retail: { A: number | null; B: number | null; C: number | null };
}
export interface RefurbedResult {
  source: "refurbed.it";
  sourceUrl: string;
  base: number;
  variants: RefurbedVariant[];
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Slug candidati per risolvere l'URL prodotto refurbed (modello, poi brand-modello). */
export function candidateSlugs(brand: string, model: string): string[] {
  const m = slugify(model), b = slugify(brand);
  const out = new Set<string>();
  if (m) out.add(m);
  if (b && m && !m.startsWith(b)) out.add(`${b}-${m}`);
  if (b && m) out.add(`${b}-${m}`.replace(/^apple-/, "")); // refurbed non mette "apple-" sugli iPhone/iPad
  return [...out];
}

const normStorage = (s: string) => s.replace(/\s+/g, "").toUpperCase(); // "128 GB" -> "128GB"

/** Delta in euro da un data-price tipo "more,+20,01 €" / "less,-11,00 €" / "". */
function parseDelta(optionHtml: string): number {
  const dp = (optionHtml.match(/data-price="([^"]*)"/) || [])[1] || "";
  if (!dp) return 0;
  const num = dp.match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/); // "1.059,43" o "62,00"
  if (!num) return 0;
  const val = parseFloat(num[1].replace(/\./g, "") + "." + num[2]);
  return /less|meno|,-|(?:^|[^0-9])-\s*\d/.test(dp) ? -val : val;
}

async function fetchOk(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: HEADERS, redirect: "follow" });
    if (!r.ok) return null;
    const t = await r.text();
    return t.includes('"priceCurrency":"EUR"') ? t : null;
  } catch { return null; }
}

/** Ritorna i prezzi retail per (taglio × grado A/B/C) di un modello, o null se non trovato. */
export async function fetchRefurbedPrices(brand: string, model: string): Promise<RefurbedResult | null> {
  let html: string | null = null, sourceUrl = "";
  for (const slug of candidateSlugs(brand, model)) {
    const u = `https://www.refurbed.it/p/${slug}/`;
    html = await fetchOk(u);
    if (html) { sourceUrl = u; break; }
  }
  if (!html) return null;

  const base = parseFloat((html.match(/"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*"priceCurrency"\s*:\s*"EUR"/) || [])[1]);
  if (!Number.isFinite(base)) return null;

  const opts = [...html.matchAll(/<option[^>]*value="\/p\/[^"]+"[^>]*>([^<]+)<\/option>/g)]
    .map(m => ({ text: m[1].replace(/&amp;/g, "&").trim(), delta: parseDelta(m[0]) }));

  // delta per grado CRM (prima occorrenza; il base grado = C con delta 0)
  const gradeDelta: Record<Grade, number | null> = { A: null, B: null, C: null };
  for (const o of opts) {
    if (isNuovo(o.text)) continue; // "Nuova" = Km0, non un grado A/B/C
    const g = mapGrade(o.text);
    if (g && gradeDelta[g] == null) gradeDelta[g] = o.delta;
  }
  if (gradeDelta.C == null) gradeDelta.C = 0; // il base price E' il grado piu' basso

  // delta per taglio (prima occorrenza; base = 0)
  const storageDelta: Record<string, number> = {};
  for (const o of opts) {
    if (!/^\d+\s?(GB|TB)$/i.test(o.text)) continue;
    const st = normStorage(o.text);
    if (!(st in storageDelta)) storageDelta[st] = o.delta;
  }
  if (Object.keys(storageDelta).length === 0) storageDelta[""] = 0; // taglio unico/non esposto

  const variants: RefurbedVariant[] = Object.entries(storageDelta).map(([storage, sd]) => ({
    storage,
    retail: {
      A: gradeDelta.A != null ? round2(base + sd + gradeDelta.A) : null,
      B: gradeDelta.B != null ? round2(base + sd + gradeDelta.B) : null,
      C: gradeDelta.C != null ? round2(base + sd + gradeDelta.C) : null,
    },
  }));

  return { source: "refurbed.it", sourceUrl, base, variants };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
