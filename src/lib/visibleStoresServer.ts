// QUALI NEGOZI PUÒ VEDERE UNA PERSONA — la versione di SERVER.
//
// ⚠️ La regola è LA STESSA di `useVisibleStores` (src/lib/visibleStores.ts), che
// però vive nel browser e legge la sessione del browser: da un route handler non
// è utilizzabile. Qui la stessa regola sugli stessi dati, con l'identità presa
// dalla sessione firmata — mai dal parametro che arriva dalla richiesta.
//
// Perché serve: una schermata che filtra bene protegge lo SCHERMO, non il DATO.
// Se una rotta si fida del `?negozio=` che le arriva, chiunque sappia scrivere
// un indirizzo legge la giornata del negozio di un collega. Il 28/08 la stessa
// lezione era già costata un'ora di password negate a mezza azienda: il varco
// deve stare dove passa il dato.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sameStore } from "@/lib/negoziNomi";

/** Visibilità globale INCONDIZIONATA: gli stessi tre ruoli del browser. */
const RUOLI_TUTTO = ["admin", "dev", "direttore_generale"];

export type NegoziVisibili = { tutti: boolean; negozi: string[] };

export async function negoziVisibiliDi(userId: string): Promise<NegoziVisibili> {
    const { data: u } = await supabaseAdmin.from("app_users")
        .select("role, primary_store, active").eq("id", userId).maybeSingle();
    if (!u || u.active === false) return { tutti: false, negozi: [] };

    const role = String(u.role || "");
    if (RUOLI_TUTTO.includes(role)) return { tutti: true, negozi: [] };

    const [us, vis] = await Promise.all([
        supabaseAdmin.from("user_stores").select("store_name").eq("user_id", userId),
        supabaseAdmin.from("user_store_visibility").select("store_name").eq("user_id", userId),
    ]);
    const righeVis = (vis.data ?? [])
        .map((r) => String((r as { store_name?: string | null }).store_name || "")).filter(Boolean);

    // L'AMMINISTRATIVO vede tutto DI DEFAULT, ma se l'admin gli ha scritto una
    // lista esplicita vale solo quella (regola di Luca del 25/07).
    if (role === "amministrativo" && righeVis.length === 0) return { tutti: true, negozi: [] };

    const set = new Set<string>();
    if (u.primary_store) set.add(String(u.primary_store));
    (us.data ?? []).forEach((r) => {
        const n = String((r as { store_name?: string | null }).store_name || "");
        if (n) set.add(n);
    });
    righeVis.forEach((n) => set.add(n));
    return { tutti: false, negozi: [...set].sort() };
}

/* ═══ IL «GUARDA COME», ANCHE DAL SERVER (Luca 31/08) ═══════════════════════
   Il «guarda come» vive solo nel browser: il token è firmato sull'account vero.
   Giusto — ma vuol dire che ogni schermata filtrata dal SERVER sembra rotta
   quando la si prova cambiando persona: Luca guardava come Eros e continuava a
   vedere i conti di tutti i negozi, perché per il server era sempre Luca, che è
   admin. Non era un difetto del filtro; era che il filtro non si poteva provare.

   Qui il server accetta il suggerimento del browser, ma con UNA regola che non
   si può aggirare: **si può solo restringere, mai allargare**. Il perimetro
   diventa l'INTERSEZIONE fra quello vero e quello della persona simulata.
   Perciò:
   · un admin che guarda come uno store manager vede quello che vedrebbe lui;
   · uno store manager che si spacciasse per un altro non guadagna niente —
     l'intersezione coi propri negozi resta la sua;
   · chi non ha il permesso «guarda come» viene ignorato del tutto.
   Il costo dell'errore è zero per costruzione: nessuno può vedere di più. */
export async function negoziVisibiliComeVisto(
    sessioneId: string, comeUtenteId?: string | null,
): Promise<NegoziVisibili> {
    const vero = await negoziVisibiliDi(sessioneId);
    const finto = String(comeUtenteId || "").trim();
    if (!finto || finto === sessioneId) return vero;

    // il suggerimento vale solo per chi il «guarda come» ce l'ha davvero
    const { data: io } = await supabaseAdmin.from("app_users")
        .select("can_switch_role").eq("id", sessioneId).maybeSingle();
    if (!io?.can_switch_role) return vero;

    const simulato = await negoziVisibiliDi(finto);
    if (vero.tutti) return simulato;              // si restringe: è il caso normale
    if (simulato.tutti) return vero;              // non si allarga MAI
    return {
        tutti: false,
        negozi: simulato.negozi.filter((n) => vero.negozi.some((x) => sameStore(x, n))),
    };
}

/** Questa persona può guardare i dati di questo negozio? */
export async function puoVedereNegozio(userId: string, negozio: string): Promise<boolean> {
    const v = await negoziVisibiliDi(userId);
    if (v.tutti) return true;
    // `sameStore` perché a DB lo stesso negozio è scritto in modi diversi
    // ("Magliana" / "MAGLIANA W3"): il confronto secco perdeva pezzi.
    return v.negozi.some((n) => sameStore(n, negozio));
}
