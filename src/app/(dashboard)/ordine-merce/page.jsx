"use client";

import { useAuth } from "@/context/AuthContext";
import OrdineMerceContent from "./OrdineMerceContent";

// ruoli reali: prima "dev"/"direttore_generale" restavano fuori dalla pagina
const ALLOWED_ROLES = ["admin", "dev", "direttore_generale", "amministrativo", "store_manager", "direttore_commerciale", "back_office_caller", "back_office"];

export default function OrdineMercePage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="p-8 text-slate-400">Caricamento...</div>
    );
  }

  if (!ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="p-8 text-amber-400">Non autorizzato. Solo Store Manager, Back Office e Admin possono accedere a Ordine Merce.</div>
    );
  }

  // Segnalazione 51: il negozio non era allineato. Prima si risolveva il negozio
  // dell'utente contro una lista FINTA hardcoded (Roma Centro, Milano Duomo...),
  // quindi ricadeva sempre sul primo negozio finto. Ora si passa direttamente il
  // negozio reale dell'utente (primary_store) e la pagina usa i negozi veri dal DB.
  return (
    <OrdineMerceContent role={user.role} myStore={user.negozio || ""} />
  );
}
