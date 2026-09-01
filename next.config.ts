import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* DOVE FINISCE IL BUILD (01/09/2026). In produzione il deploy costruisce in
     `.next-build` e scambia la cartella solo alla fine: costruire dentro
     `.next` voleva dire riscrivere i file sotto il processo che stava
     servendo i negozi, e per tutta la durata del build mezzo CRM rispondeva
     "Internal Server Error" — quarantacinque secondi a ogni consegna,
     misurati la mattina dell'apertura delle casse.
     Chi avvia il sito (`next start`) NON ha questa variabile: legge `.next`
     come sempre. La imposta solo il comando di build. */
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
