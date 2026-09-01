"use client";

/* Rotta /assistenze — il permesso si concede dalla pagina Permessi, per ruolo o per
   persona: la verifica è la STESSA della voce di menù, non una lista privata
   della pagina (regola fissa dopo il caso del 21/08). */
import { useAuth } from "@/context/AuthContext";
import { useVisibleStores } from "@/lib/visibleStores";
import { useRolePermissions } from "@/lib/usePermissions";
import { effectiveAllowed, EVERYONE } from "@/lib/nav";
import { PraticheSezione } from "@/components/PraticheSezione";

export default function Pagina() {
    const { user } = useAuth();
    const { seesAll, stores: myStores } = useVisibleStores();
    const { perms, loaded } = useRolePermissions(user?.role, user?.grade, user?.id);

    if (!user || !loaded) return <div className="p-8 text-slate-400">Caricamento…</div>;
    if (!effectiveAllowed(user.role, "/assistenze", EVERYONE, perms)) {
        return <div className="p-8 text-amber-400">Non autorizzato: l&apos;accesso si concede dalla pagina Permessi.</div>;
    }

    return (
        <div className="p-4 sm:p-6 space-y-5">
            <div>
                <h1 className="text-xl font-black text-white">🔧 Assistenze</h1>
                <p className="text-xs text-slate-500 mt-1">Riparazioni, backup e interventi sui dispositivi dei clienti: accettazione, lavorazione, riconsegna.</p>
            </div>
            <PraticheSezione sezione="assistenze" negozio={user.negozio || ""} negoziVisibili={myStores}
                operatore={user.name || ""} ruolo={user.role || ""} seesAll={seesAll} />
        </div>
    );
}
