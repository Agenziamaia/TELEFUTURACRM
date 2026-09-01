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
const REPARTO_MAP: Record<string, Record<number, number>> = {
  // DONNA — config verificato 01/09: 1=4%, 2=22%, 3=ART.74(non sogg), 4=ART.10(esente).
  // Il CRM ha 1=non soggetta e 3=4%: quindi 1 e 3 sono INVERTITI rispetto al registratore.
  "Donna": { 1: 3, 3: 1 },
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
