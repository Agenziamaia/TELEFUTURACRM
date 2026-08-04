// Costanti brand CONDIVISE fra Tracking PDA e Ricerca Vendite (RIC-01):
// chiave normalizzata, colori, scala ottica dei loghi e file in public/.
// Nate nel Tracking; estratte qui per non tenere due copie divergenti.

// Chiave brand NORMALIZZATA (minuscole, niente spazi/punti): a DB convivono
// "Very Mobile", "TIM", "WindTre"... — il lookup esatto perdeva pezzi.
export const trkBrandKey = (b: string) => String(b).toLowerCase().replace(/[^a-z0-9]/g, "");

export const TRK_BRAND_COLORS: Record<string, string> = {
  vodafone: "var(--tf-e60000)", fastweb: "var(--tf-eab308)", windtre: "var(--tf-f97316)", wind3: "var(--tf-f97316)",
  iliad: "var(--tf-c00028)", tim: "var(--tf-0050ff)", s4: "var(--tf-22c55e)", energy: "var(--tf-22c55e)",
  sky: "var(--tf-0072c6)", dojo: "var(--tf-14b8a6)", verymobile: "var(--tf-84cc16)", homobile: "var(--tf-9b26b6)",
  kenamobile: "var(--tf-e4002b)", kena: "var(--tf-e4002b)",
};

// I file 900x900 (WindTre, Vodafone) hanno il marchio annegato nel canvas
// trasparente: scala OTTICA per pareggiarli, il box resta identico.
export const TRK_LOGO_SCALE: Record<string, number> = {
  windtre: 1.5, vodafone: 1.75, fastweb: 1.55, sky: 1.15, iliad: 1.2,
  tim: 1.2, dojo: 1.15, homobile: 1.2, kenamobile: 1.2,
};

// stessi loghi di Registra Vendita (public/)
export const TRK_BRAND_LOGOS: Record<string, string> = {
  vodafone: "/vodaphone - Copy.png", fastweb: "/fastweb.png", windtre: "/windtre.png",
  wind3: "/windtre.png", iliad: "/iliad.png", tim: "/tim-logo-v2.png",
  s4: "/energy - Copy.png", energy: "/energy - Copy.png", sky: "/sky.png",
  dojo: "/dojo-round.png", verymobile: "/very-mobile.png", homobile: "/ho-mobile.png",
  kenamobile: "/kena-mobile-v2.png", kena: "/kena-mobile-v2.png",
};
