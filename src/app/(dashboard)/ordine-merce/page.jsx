"use client";

import { useAuth } from "@/context/AuthContext";
import OrdineMerceContent, { STORES } from "./OrdineMerceContent";

// ruoli reali: prima "dev"/"direttore_generale" restavano fuori dalla pagina
const ALLOWED_ROLES = ["admin", "dev", "direttore_generale", "amministrativo", "store_manager", "direttore_commerciale", "back_office_caller", "back_office"];

function resolveStoreId(negozio) {
  if (!negozio) return STORES[0]?.id ?? "roma_centro";
  const n = negozio.toLowerCase();
  const exact = STORES.find((s) => s.name.toLowerCase() === n);
  if (exact) return exact.id;
  const partial = STORES.find((s) => n.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(n));
  return partial?.id ?? STORES[0]?.id ?? "roma_centro";
}

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

  const role = user.role;
  const myStore = resolveStoreId(user.negozio);

  return (
    <OrdineMerceContent role={role} myStore={myStore} />
  );
}
