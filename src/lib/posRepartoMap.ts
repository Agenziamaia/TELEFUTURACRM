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
// ⚠️ EPSON e CUSTOM mappano il reparto in modo DIVERSO — verificato 01/09 con uno
// scontrino diagnostico (1 riga per reparto):
//
// • EPSON RT (ePOS): il `department` = reparto del RT, come da config_cassa.ini
//   (`1,4 · 2,22 · 3,ART.74 · 4,esente`). Quindi «non soggetta» = reparto 3 →
//   le voci non-soggetta (reparto CRM 1) vanno mandate come dept 3: SWAP 1<->3.
//
// • CUSTOM (OPOS MiraOposDll): il `department` va all'OPOS come vatInfo, e la
//   tabella IVA OPOS NON è ordinata come il config. Diagnostica Baleniere (01/09):
//   dept 1 → **H = NON SOGGETTA**, dept 2/3/4 → A = 22%. Quindi «non soggetta» =
//   dept 1: la numerazione del CRM è GIÀ giusta → NESSUNO swap (identità).
//   (Lo swap 1<->3 mandava le SIM/ricariche a dept 3 = 22% → IVA SBAGLIATA.)
//
// ⚠️ EPSON ancora DA VERIFICARE con la stessa diagnostica su una riga non-soggetta
// (i test finora usavano solo 22% e 4%). Alta fiducia (ePOS = reparto diretto) ma
// da confermare prima di fidarsi al 100%.
const SWAP_1_3: Record<number, number> = { 1: 3, 3: 1 };
const REPARTO_MAP: Record<string, Record<number, number>> = {
  // EPSON RT → swap 1<->3 (non soggetta = reparto 3 del RT)
  "Donna": SWAP_1_3,
  "Magliana Multi": SWAP_1_3,
  "Magliana W3": SWAP_1_3,
  "San Paolo": SWAP_1_3,
  "Collatina Multi": SWAP_1_3,
  "Garbatella": SWAP_1_3,
  // CUSTOM / Vodafone → IDENTITÀ (non elencati): dept 1 = non soggetta sull'OPOS,
  // la numerazione CRM è già corretta. Baleniere/Castani/Promontori/Acilia*/
  // Merulana/Collatina W3/Libia/Mazzini: nessuno swap.
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
