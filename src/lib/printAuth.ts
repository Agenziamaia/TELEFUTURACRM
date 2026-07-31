// Autorizzazione degli endpoint /api/print/*: token condiviso con l'agente di
// stampa del negozio (env PRINT_AGENT_TOKEN, SOLO server). Restituisce:
//   null  -> token non configurato sul server  (l'endpoint risponde 503)
//   false -> token errato o assente nella richiesta (401)
//   true  -> autorizzato
export function agentAuthorized(req: Request): boolean | null {
  const token = process.env.PRINT_AGENT_TOKEN;
  if (!token) return null;
  const h = req.headers.get("authorization") || "";
  return h === `Bearer ${token}`;
}
