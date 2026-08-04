// Motore prezzi USATO — mappatura gradi + formula reverse-margin.
// Logica pura (niente rete): usata sia dallo script di sync sia dai test.

export type Grade = "A" | "B" | "C";
export type CategoriaDispositivo = "smartphone" | "tablet" | "watch" | "computer";

/**
 * Mappa le etichette commerciali dei marketplace italiani sul nostro standard A/B/C.
 * (Francesco 04/08). Confronto case-insensitive, accent-insensitive.
 *   A = perfetto/come nuovo · B = usura minima · C = usura visibile.
 */
// NB: le etichette REALI di refurbed.it (verificate 04/08) sono
// Premium > Ottimo > Molto buono (3 gradi ricondizionati) + "Nuova" (= nuovo/Km0).
// La scala di QUALITA' (dal migliore al peggiore) decide A/B/C; i nomi ingannano
// ("Molto buono" e' il grado piu' BASSO su refurbed, quindi C).
const RAW_GRADE_MAP: Record<string, Grade> = {
  // refurbed.it (attuale) + backmarket.it
  premium: "A",
  eccellente: "A",
  "come nuovo": "A",
  ottimo: "B",
  "molto buono": "C",
  buono: "C",
  corretto: "C",
  discreto: "C",
  // trendevice.com
  smart: "B",
  "low cost": "C",
  lowcost: "C",
  // fallback inglesi (schema.org / API)
  excellent: "A",
  verygood: "B",
  "very good": "B",
  good: "C",
  fair: "C",
};

/** "Nuova"/"Nuovo"/"New" = dispositivo nuovo → nel CRM e' "Km 0", non un grado A/B/C. */
export function isNuovo(label: string): boolean {
  return /^(nuov|new)/.test(norm(label));
}

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // via accenti
    .trim();

/** Ritorna il grado CRM per un'etichetta di condizione, o null se sconosciuta. */
export function mapGrade(label: string): Grade | null {
  return RAW_GRADE_MAP[norm(label)] ?? null;
}

export interface PricingSettings {
  marginPct: number; // es. 40 = -40%
  refurbCost: Partial<Record<CategoriaDispositivo, number>>;
}

/**
 * Prezzo massimo di ricompra a partire dal retail ricondizionato:
 *   buyback = retail * (1 - margine%) - costoRefurb
 * Mai negativo; arrotondato a 2 decimali.
 */
export function computeBuyback(
  retail: number,
  settings: PricingSettings,
  categoria: CategoriaDispositivo = "smartphone",
): number {
  if (!Number.isFinite(retail) || retail <= 0) return 0;
  const margin = Math.min(100, Math.max(0, settings.marginPct ?? 40));
  const refurb = settings.refurbCost?.[categoria] ?? 0;
  const raw = retail * (1 - margin / 100) - refurb;
  return Math.max(0, Math.round(raw * 100) / 100);
}
