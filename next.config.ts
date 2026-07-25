import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Rinomina "Registra/Ricerca Contratto" -> "Vendite": i vecchi URL restano
    // validi per link salvati e abitudini (redirect temporanei, non cacheati).
    return [
      { source: "/registra-contratto", destination: "/registra-vendita", permanent: false },
      { source: "/ricerca-contratto", destination: "/ricerca-vendite", permanent: false },
    ];
  },
};

export default nextConfig;
