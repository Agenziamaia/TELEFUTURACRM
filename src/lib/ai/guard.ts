// Barriera di sicurezza per i tool dell'assistente AI.
// IMPORTANTE: le RLS del progetto sono "allow all", quindi il prompt NON e' un confine.
// Tabelle/colonne sensibili vanno bloccate QUI, nel codice, prima di toccare il DB.

export const BLOCKED_TABLES = new Set<string>([
  "password_credentials",
  "password_access_log",
]);

// Nomi di colonna che non devono MAI essere selezionati/ritornati, da nessuna tabella.
export const BLOCKED_COLUMNS = new Set<string>([
  "password",
  "password_hash",
  "password_encrypted",
  "iban",
  "ral_annua",
  "company_cost",
  "costo_gara",
]);

export function assertTableAllowed(table: string): void {
  if (BLOCKED_TABLES.has(table)) {
    throw new Error(`Accesso non consentito alla tabella "${table}".`);
  }
}

/** Filtra una lista di colonne richieste togliendo quelle vietate. */
export function safeColumns(cols: string[]): string[] {
  return cols.filter((c) => !BLOCKED_COLUMNS.has(c.trim().toLowerCase()));
}

/** Rete di sicurezza: rimuove le chiavi vietate dalle righe prima di darle al modello. */
export function redact<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.map((r) => {
    const out: Record<string, any> = {};
    for (const k of Object.keys(r)) {
      if (!BLOCKED_COLUMNS.has(k.toLowerCase())) out[k] = r[k];
    }
    return out as T;
  });
}

/** Messaggio standard quando l'utente chiede dati vietati. */
export const REFUSAL =
  "Non posso accedere a questi dati (credenziali, IBAN o dati retributivi): sono protetti.";
