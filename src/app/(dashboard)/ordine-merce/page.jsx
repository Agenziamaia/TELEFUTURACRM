"use client";

import { useAuth } from "@/context/AuthContext";
import OrdineMerceContent from "./OrdineMerceContent";
import { useVisibleStores } from "@/lib/visibleStores";
import { useRolePermissions } from "@/lib/usePermissions";
import { effectiveAllowed, MANAGERS } from "@/lib/nav";

// NIENTE PIÙ elenco ruoli cablato (Luca 21/08: il collaboratore era abilitato
// dai Permessi ma la pagina lo respingeva con la sua lista privata). Comanda
// la STESSA verifica della voce di menù: default MANAGERS + le righe della
// pagina Permessi, per ruolo o per singola persona.
export default function OrdineMercePage() {
  const { user } = useAuth();
  // Negozi visibili dalla fonte unica (primary + user_stores + user_store_visibility).
  const { seesAll, stores: myStores } = useVisibleStores();
  const { perms, loaded } = useRolePermissions(user?.role, user?.grade, user?.id);

  if (!user || !loaded) {
    return (
      <div className="p-8 text-slate-400">Caricamento...</div>
    );
  }

  if (!effectiveAllowed(user.role, "/ordine-merce", MANAGERS, perms)) {
    return (
      <div className="p-8 text-amber-400">Non autorizzato: l&apos;accesso a Ordine Merce si concede dalla pagina Permessi (per ruolo o per persona).</div>
    );
  }

  // Segnalazione 51: il negozio non era allineato. Prima si risolveva il negozio
  // dell'utente contro una lista FINTA hardcoded (Roma Centro, Milano Duomo...),
  // quindi ricadeva sempre sul primo negozio finto. Ora si passa direttamente il
  // negozio reale dell'utente (primary_store) e la pagina usa i negozi veri dal DB.
  return (
    <OrdineMerceContent role={user.role} myStore={user.negozio || ""} myStores={myStores} seesAll={seesAll} />
  );
}
