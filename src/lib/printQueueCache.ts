// Cache in-memory per ALLEGGERIRE il database dai poll della coda di stampa.
// Gli agenti dei negozi chiamano /api/print/next ogni pochi secondi, ma quasi
// sempre non c'è niente da stampare: erano decine di SELECT a vuoto al secondo
// su print_jobs (con ~14 negozi + le tab del CRM) — uno dei carichi che ha
// mandato Supabase in 522 (31/08).
//
// Idea: se un negozio è stato APPENA controllato ed era VUOTO, per una breve
// finestra si risponde "niente" SENZA interrogare il DB. Processo singolo
// (VPS/pm2): la Map vive nel processo. TTL corto → un job nuovo viene comunque
// ritirato entro pochi secondi anche nel caso peggiore.
const emptyUntil = new Map<string, number>();
const TTL_MS = 2500;
const KEY_ALL = "__all__";
const keyOf = (negozio: string | null) => negozio || KEY_ALL;

/** true = di recente la coda di questo negozio era vuota → salta la query. */
export function queueKnownEmpty(negozio: string | null): boolean {
  const k = keyOf(negozio);
  const t = emptyUntil.get(k);
  if (t == null) return false;
  if (t <= Date.now()) { emptyUntil.delete(k); return false; }
  return true;
}

/** Registra che la coda del negozio è vuota per i prossimi TTL_MS. */
export function markQueueEmpty(negozio: string | null): void {
  emptyUntil.set(keyOf(negozio), Date.now() + TTL_MS);
}

/** C'è lavoro (o è appena stato accodato): il prossimo poll DEVE guardare il DB. */
export function markQueueHasWork(negozio: string | null): void {
  emptyUntil.delete(keyOf(negozio));
  emptyUntil.delete(KEY_ALL); // un poll senza filtro potrebbe pescarlo
}
