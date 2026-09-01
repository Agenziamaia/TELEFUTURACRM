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
// ✅ VERIFICATO 01/09 con scontrino diagnostico (1 riga per reparto) su ENTRAMBE le
// famiglie: «non soggetta» = **department 1** sia su EPSON (Donna .50: REP1→NS*,
// REP2→22%, REP3→4%, REP4→RM*) sia su CUSTOM (Baleniere: dept1→NS, dept2/3/4→22%).
// ⇒ La numerazione del CRM (reparto 1 = non soggetta) è GIÀ quella giusta per il
// registratore: NESSUNO SWAP, IDENTITÀ per tutti. Il `config_cassa.ini` mentiva
// (diceva 3=ART.74) — ignorarlo. Lo swap 1<->3 mandava le SIM/ricariche a dept 3
// (4% su Epson, 22% su Custom) = IVA SBAGLIATA: RIMOSSO.
//
// Nota per il futuro: il regime del margine (usato) sull'Epson di Donna è dept 4
// (RM*), ma il CRM usa reparto 7 → andrà mappato 7→4 quando si venderà usato a
// fiscale (per registratore: su Custom dept 4 non è RM). Non urgente ora.
const REPARTO_MAP: Record<string, Record<number, number>> = {
  // Vuoto = identità per tutti. Si aggiunge un negozio SOLO se una diagnostica
  // dimostra che QUEL registratore mappa i reparti diversamente.
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
