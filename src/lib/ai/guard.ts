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

/** Rete di sicurezza: rimuove le chiavi vietate dalle righe prima di darle al
 *  modello.
 *
 *  ⚠️ GUARDA ANCHE DENTRO. Prima si fermava alle chiavi di primo livello, e i
 *  dati che contano stanno spesso in un jsonb: `usati.pagamento` è
 *  `{ metodo, iban, swift, … }` e su 281 telefoni 14 portano l'IBAN di chi ce
 *  l'ha venduto. Un `select("*")` glielo passava sotto il naso — la colonna
 *  `iban` era nell'elenco dei divieti e non serviva a niente.
 *  Si scende fino a otto livelli: oltre non ci sono strutture vere, e un
 *  documento fatto apposta non deve poter mandare in ricorsione il server. */
export function redact<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.map((r) => pulisci(r, 0) as T);
}

function pulisci(v: any, profondita: number): any {
  if (profondita > 8 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => pulisci(x, profondita + 1));
  const out: Record<string, any> = {};
  for (const k of Object.keys(v)) {
    if (BLOCKED_COLUMNS.has(k.toLowerCase())) continue;
    out[k] = pulisci(v[k], profondita + 1);
  }
  return out;
}

/** Messaggio standard quando l'utente chiede dati vietati. */
export const REFUSAL =
  "Non posso accedere a questi dati (credenziali, IBAN o dati retributivi): sono protetti.";
