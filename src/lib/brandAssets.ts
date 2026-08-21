// Costanti brand CONDIVISE fra Tracking PDA e Ricerca Vendite (RIC-01):
// chiave normalizzata, colori, scala ottica dei loghi e file in public/.
// Nate nel Tracking; estratte qui per non tenere due copie divergenti.

// Chiave brand NORMALIZZATA (minuscole, niente spazi/punti): a DB convivono
// "Very Mobile", "TIM", "WindTre"... — il lookup esatto perdeva pezzi.
export const trkBrandKey = (b: string) => String(b).toLowerCase().replace(/[^a-z0-9]/g, "");

export const TRK_BRAND_COLORS: Record<string, string> = {
  vodafone: "var(--tf-e60000)", fastweb: "var(--tf-eab308)", windtre: "var(--tf-f97316)", wind3: "var(--tf-f97316)",
  iliad: "var(--tf-c00028)", tim: "var(--tf-0050ff)", s4: "var(--tf-22c55e)", energy: "var(--tf-22c55e)",
  // Sky è VIOLA ovunque (Luca 21/08)
  sky: "var(--tf-8b5cf6)", dojo: "var(--tf-14b8a6)", verymobile: "var(--tf-84cc16)", homobile: "var(--tf-9b26b6)",
  kenamobile: "var(--tf-e4002b)", kena: "var(--tf-e4002b)",
};

// I file 900x900 (WindTre, Vodafone) hanno il marchio annegato nel canvas
// trasparente: scala OTTICA per pareggiarli, il box resta identico.
// Ritocco Luca 04/08: tutti un filo piu' grandi TRANNE S4 (tondo, resta 1.0).
export const TRK_LOGO_SCALE: Record<string, number> = {
  windtre: 1.7, vodafone: 1.95, fastweb: 1.75, sky: 1.3, iliad: 1.35,
  tim: 1.35, dojo: 1.3, homobile: 1.35, kenamobile: 1.35, verymobile: 1.15,
};

// BADGE dei conteggi "attaccato al logo" (Luca 04/08): offset orizzontale dal
// CENTRO della tessera alla spalla destra del logo (px) — i marchi hanno
// larghezze visive diverse (wordmark vs tondi), quindi la distanza e' per
// brand. Il badge va a left: calc(50% + offset), in alto.
export const TRK_BADGE_OFFSET: Record<string, number> = {
  windtre: 44, vodafone: 30, fastweb: 46, sky: 38, iliad: 28, tim: 34,
  s4: 40, energy: 40, dojo: 36, verymobile: 46, homobile: 32, kenamobile: 40,
};
export const TRK_BADGE_OFFSET_DEFAULT = 36;

// stessi loghi di Registra Vendita (public/)
export const TRK_BRAND_LOGOS: Record<string, string> = {
  vodafone: "/vodaphone - Copy.png", fastweb: "/fastweb.png", windtre: "/windtre.png",
  wind3: "/windtre.png", iliad: "/iliad.png", tim: "/tim-logo-v2.png",
  s4: "/energy - Copy.png", energy: "/energy - Copy.png", sky: "/sky.png",
  dojo: "/dojo-round.png", verymobile: "/very-mobile.png", homobile: "/ho-mobile.png",
  kenamobile: "/kena-mobile-v2.png", kena: "/kena-mobile-v2.png",
  // la Marginalità è "brand di casa": il suo logo è quello Telefutura, come
  // nel Registra Prodotto (Luca 21/08 — niente scritte, parla il logo)
  marginalita: "/logo-crm.png", marginalit: "/logo-crm.png",
};
