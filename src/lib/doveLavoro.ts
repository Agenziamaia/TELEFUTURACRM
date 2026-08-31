/* ═══════════════════════════════════════════════════════════════════════════
   DOVE STO LAVORANDO OGGI

   Luca 31/08: «a ogni login dobbiamo chiedere il punto vendita in cui sta
   lavorando. La selezione preselezionata dev'essere quella dei turni, e ci
   mettiamo un pulsante "altro negozio": lo seleziona, ma uno
   dell'amministrazione deve approvargli l'accesso. Per i negozi doppi metti
   solo la selezione generale, tipo Magliana, Collatina. A quel punto abbiamo
   il dato certo su quale magazzino stanno lavorando.»

   LA REGOLA DEI TURNI NON SI RISCRIVE. Sta già dentro la sezione Turni
   (`collaboratori/page.tsx`, `TurniSection`) e dice:
     chi è a turno oggi in un negozio = chi ce l'ha in scheda (`primary_store`)
     + chi ce l'ha fra i negozi assegnati (`user_stores`), MENO ferie, malattie
     ed esclusioni del giorno, PIÙ le coperture (`turni_negozio`).
   Due copie della stessa regola divergono sempre: qui si ricalcola con le
   stesse fonti, e se un giorno la regola cambia va cambiata in tutti e due i
   posti — per questo il commento lo dice a voce alta invece di fingere che
   basti leggere il codice.

   LA SEDE, NON L'INSEGNA. Magliana W3 e Magliana Multi sono la stessa stanza:
   la pagina Turni le chiama «sede unica» e ne fonde le squadre. Qui vale lo
   stesso — si sceglie «Magliana», non una delle due insegne — perché la
   domanda a cui questo serve a rispondere è «da quale MAGAZZINO stai
   vendendo», e il magazzino è uno.
   ═══════════════════════════════════════════════════════════════════════════ */

import { supabase } from "@/lib/supabaseClient";
import { sedeFisica } from "@/lib/negoziNomi";

export type SedeLavoro = {
    /** la chiave: la prima parola del nome, minuscola — «magliana», «donna» */
    sede: string;
    /** come si scrive a schermo: «Magliana», «Donna» */
    etichetta: string;
    /** le insegne che stanno in quella sede: ["Magliana W3","Magliana Multi"] */
    insegne: string[];
    /** ci sono più insegne? allora è una sede doppia */
    doppia: boolean;
};

export type Presenza = {
    id: string;
    sede: string;
    origine: "turno" | "richiesta";
    stato: "attiva" | "in_attesa" | "rifiutata" | "chiusa";
    sede_turno: string | null;
};

const oggiYmd = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const bello = (nome: string) => nome.charAt(0).toUpperCase() + nome.slice(1);

/** Tutte le sedi del gruppo, con le loro insegne. Gli uffici restano fuori:
 *  non sono punti vendita e da lì non esce merce. */
export async function sediDelGruppo(): Promise<SedeLavoro[]> {
    const { data } = await supabase.from("stores").select("name, is_ufficio").order("name");
    const per = new Map<string, string[]>();
    (data ?? []).forEach((r: { name: string; is_ufficio?: boolean | null }) => {
        if (r.is_ufficio) return;
        const k = sedeFisica(r.name);
        if (!k) return;
        const arr = per.get(k) || [];
        arr.push(r.name);
        per.set(k, arr);
    });
    return [...per.entries()]
        .map(([sede, insegne]) => ({
            sede,
            // l'etichetta è la parte comune del nome: «Magliana W3» → «Magliana»
            etichetta: bello(sede),
            insegne: insegne.sort(),
            doppia: insegne.length > 1,
        }))
        .sort((a, b) => a.etichetta.localeCompare(b.etichetta));
}

/** Dove questa persona risulta di turno OGGI. Può essere più di una sede (chi
 *  copre due negozi) o nessuna (chi è in ferie, o chi un negozio non ce l'ha). */
export async function sediDiTurnoOggi(userId: string, nome: string): Promise<string[]> {
    const data = oggiYmd();
    const [u, links, cop] = await Promise.all([
        supabase.from("app_users").select("primary_store").eq("id", userId).maybeSingle(),
        supabase.from("user_stores").select("store_name").eq("user_id", userId),
        // le coperture del giorno sono per NOME, com'è scritto in `turni_negozio`
        supabase.from("turni_negozio").select("store, tipo").eq("data", data).eq("persona", nome),
    ]);

    const sedi = new Set<string>();
    const aggiungi = (n: string | null | undefined) => { const k = sedeFisica(n || ""); if (k) sedi.add(k); };
    aggiungi(u.data?.primary_store);
    (links.data ?? []).forEach((r: { store_name: string }) => aggiungi(r.store_name));
    (cop.data ?? []).forEach((r: { store: string; tipo: string | null }) => {
        // «escluso» è il contrario di una copertura: quel giorno NON c'è
        if (String(r.tipo || "") === "escluso") sedi.delete(sedeFisica(r.store));
        else aggiungi(r.store);
    });
    return [...sedi];
}

/** La presenza dichiarata oggi: quella ATTIVA (dove sta lavorando davvero) e
 *  l'eventuale richiesta ancora in attesa di approvazione. */
export async function presenzaOggi(userId: string): Promise<{ attiva: Presenza | null; inAttesa: Presenza | null }> {
    const { data } = await supabase.from("presenza_negozio")
        .select("id, sede, origine, stato, sede_turno")
        .eq("user_id", userId).eq("data", oggiYmd())
        .in("stato", ["attiva", "in_attesa"]);
    const righe = (data ?? []) as Presenza[];
    return {
        attiva: righe.find((r) => r.stato === "attiva") ?? null,
        inAttesa: righe.find((r) => r.stato === "in_attesa") ?? null,
    };
}

/** Dichiara dove si sta lavorando. `sedeTurno` valorizzata = si sta chiedendo
 *  di andare ALTROVE, e la riga nasce in attesa di approvazione. */
export async function dichiaraPresenza(
    userId: string, sede: string, sedeTurno?: string | null, motivo?: string,
): Promise<{ ok: boolean; error?: string; inAttesa?: boolean }> {
    const richiesta = !!sedeTurno && sedeTurno !== sede;
    const { error } = await supabase.from("presenza_negozio").insert({
        user_id: userId, data: oggiYmd(), sede,
        origine: richiesta ? "richiesta" : "turno",
        stato: richiesta ? "in_attesa" : "attiva",
        sede_turno: sedeTurno || null,
        motivo: motivo || null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, inAttesa: richiesta };
}
