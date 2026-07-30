import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Librerie email SOLO server (IMAP/SMTP): non vanno impacchettate da Turbopack,
  // vanno lasciate come pacchetti node esterni ai route handler.
  serverExternalPackages: ["imapflow", "nodemailer", "mailparser", "otplib"],
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
