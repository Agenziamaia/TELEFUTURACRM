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
  /* ═══ MAGLIANA MULTI — registratore 99IEB077017 (192.168.1.106) ══════════
     ⚠️ TAMPONE, NON UNA SCELTA DI DESIGN. Questa macchina è l'UNICA del parco
     programmata fuori standard: è il registratore storico dell'insegna Multi
     (876 chiusure Z) e ha una numerazione tutta sua. Le altre quattordici —
     Epson nuovi e vecchi, e i Custom — hanno tutte 1=ESENTE, 2=CELLULARI 22%,
     7=USATO, cioè esattamente quello che il CRM si aspetta (verificato il
     03/09/2026 sulle chiusure di Collatina T2, Garbatella e Baleniere).

     COSA HA COMBINATO (3.038,90 € dall'1 al 3 settembre, già trasmessi):
     le ricariche e le SIM (reparto 1) uscivano al 22% invece che in art. 74,
     gli usati (reparto 7) al 22% invece che in regime del margine, e gli
     accessori (reparto 2) al 4% invece che al 22%.

     LA PROVA, e non è dedotta da un config_cassa.ini: nove scontrini
     diagnostici da un centesimo battuti il 03/09/2026 alle 21:08-21:09 su
     quella macchina (documenti 0877-0001…0009), uno per reparto, letti sulla
     lettera IVA stampata riga per riga:
        1 → 22%   2 → 4%    3 → RM (regime del margine)   4 → NS (non soggetta)
        5 → 5%    6 → 22%   7 → 22%   8 → 22%   9 → 22%
       10 → EE (esente)     11 → NS   12 → NI (non imponibile)

     ⛔ DA TOGLIERE quando il tecnico riprogramma il misuratore (la verifica
     periodica è in scadenza: l'avviso è uscito la sera del 03/09, documento
     0876-0002). Il giorno in cui quella cassa torna in riga con le altre,
     QUESTA MAPPA VA CANCELLATA lo stesso giorno: lasciata accesa, ribalta gli
     scontrini al contrario. È la lezione dei malus Sky — una regola accesa e
     dimenticata fa danni uguali e opposti a quelli che ha riparato.

     NON MAPPATO: il reparto 5 del CRM («Esclusa», natura N1) — su questa
     macchina un N1 non esiste. Lo usa un solo articolo (SIM ATTIVAZIONE
     ILIAD), che è comunque classificato male: va corretto in anagrafica a
     reparto 1, non inventato qui un reparto che il registratore non ha. */
  "Magliana Multi": {
    1: 4,    // Non soggetta (art. 74: ricariche, SIM)  → NS
    2: 1,    // IVA 22% (accessori, assistenza, telefoni) → 22%
    3: 2,    // IVA 4%                                   → 4%
    4: 3,    // Regime del margine                       → RM
    6: 2,    // IVA 4% (2)                               → 4%
    7: 3,    // Usato · regime del margine               → RM
    8: 4,    // C/VOD · non soggetta                     → NS
    9: 12,   // Non imponibile                           → NI
    10: 4,   // Esente VOD · non soggetta                → NS
  },
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
