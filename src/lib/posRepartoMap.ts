// ─────────────────────────────────────────────────────────────────────────────
// TRADUZIONE REPARTO CRM → REPARTO REGISTRATORE, per negozio.
//
// Il CRM assegna a ogni articolo un reparto "logico" (pos_reparti: 1=non soggetta,
// 2=22%, 3=4%, …). Ma OGNI registratore ha la SUA numerazione, scritta nel suo
// `config_cassa.ini`, e non è detto coincida col CRM. Su DONNA il registratore è
// programmato così:  1→4% · 2→22% · 3→ART.74 (non soggetta) · 4→ART.10 (esente).
// Quindi le SIM (reparto 1 nel CRM = "non soggetta") uscirebbero al 4%: sbagliato.
//
// Qui traduciamo, per i negozi di cui conosciamo il config, il reparto logico nel
// reparto FISICO che su QUEL registratore produce l'IVA giusta. Un negozio non
// elencato → nessuna traduzione (identità): si comporta come prima. Va aggiunto un
// negozio SOLO dopo aver letto il suo `config_cassa.ini`, mai a indovinare — un
// reparto sbagliato manda l'IVA sbagliata all'Agenzia delle Entrate.
//
// Fonte config: leggere sul PC del negozio
//   Get-Content C:\mirasolutions\SuiteMobile\PDV\config\config_cassa.ini
// ─────────────────────────────────────────────────────────────────────────────

// negozio → { reparto_logico_CRM : reparto_fisico_registratore }
//
// STESSO LAYOUT SU TUTTI GLI EPSON (confermato da Luca/Rahib 01/09: «sono tutti
// uguali»). Layout standard SuiteMobile: 1=4%, 2=22%, 3=ART.74(non sogg), 4=esente.
// Il CRM ha 1=non soggetta e 3=4%: quindi 1 e 3 sono INVERTITI → si scambiano.
// (Verificato dal config_cassa.ini di Donna; gli altri confermati identici.)
// Layout confermato IDENTICO su un Epson (Donna) e un Custom (Castani, 01/09:
// config `1,4 · 2,22 · 3,ART.74 · 4,ART.10`, scontrino fiscale reale a 22% ok) →
// vale per ENTRAMBE le famiglie di registratori. Luca conferma che sono tutti
// uguali, quindi lo swap 1<->3 si applica a tutti i negozi con registratore.
const SWAP_1_3: Record<number, number> = { 1: 3, 3: 1 };
const REPARTO_MAP: Record<string, Record<number, number>> = {
  // Epson
  "Donna": SWAP_1_3,
  "Magliana Multi": SWAP_1_3,
  "Magliana W3": SWAP_1_3,
  "San Paolo": SWAP_1_3,
  "Collatina Multi": SWAP_1_3,
  "Garbatella": SWAP_1_3,
  // Custom / Vodafone (layout confermato su Castani; stesso standard SuiteMobile)
  "Castani": SWAP_1_3,
  "Acilia VS": SWAP_1_3,
  "Acilia Multi": SWAP_1_3,
  "Promontori": SWAP_1_3,
  "Merulana": SWAP_1_3,
  "Baleniere": SWAP_1_3,
  "Collatina W3": SWAP_1_3,
  "Libia": SWAP_1_3,
  "Mazzini": SWAP_1_3,
};

/** Traduce il reparto logico del CRM nel reparto fisico del registratore del negozio.
 *  Negozio non mappato → identità (nessun cambiamento). */
export function repartoFisico(negozio: string | null | undefined, repartoLogico: number): number {
  if (!negozio) return repartoLogico;
  const m = REPARTO_MAP[negozio];
  if (!m) return repartoLogico;
  const f = m[repartoLogico];
  return Number.isInteger(f) ? f : repartoLogico;
}

/** true se per questo negozio esiste una mappa reparti verificata. */
export function haMappaReparto(negozio: string | null | undefined): boolean {
  return !!(negozio && REPARTO_MAP[negozio]);
}
