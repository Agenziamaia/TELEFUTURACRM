/* ═══ QUALE SOCIETÀ COMPRA ════════════════════════════════════════════════
   Telefutura non è una società sola: T1 (TELEFUTURA S.R.L.) e T2
   (TELEFUTURA 2 S.R.L.) hanno partite IVA diverse e negozi diversi. Su un
   contratto di acquisto l'intestazione non è un dettaglio grafico: è la parte
   che dice CHI ha comprato, e con essa chi risponde e chi porta il bene in
   contabilità. Un contratto intestato alla società sbagliata è un contratto
   di un'altra azienda.

   La catena è: negozio → `stores.azienda` (T1/T2) → `aziende`. Se il negozio
   non ha una società attaccata NON si tira a indovinare: si restituisce null
   e chi chiama si ferma. */

import { supabase } from "@/lib/supabaseClient";

export type Societa = { nome: string; piva: string; sede: string };

const cache = new Map<string, Societa | null>();

export async function societaDelNegozio(negozio: string): Promise<Societa | null> {
    const chiave = String(negozio || "").trim();
    if (!chiave) return null;
    if (cache.has(chiave)) return cache.get(chiave) ?? null;

    const { data: st } = await supabase.from("stores").select("azienda").eq("name", chiave).maybeSingle();
    const codice = String((st as { azienda?: string } | null)?.azienda || "").trim();
    if (!codice) { cache.set(chiave, null); return null; }

    const { data: az } = await supabase.from("aziende")
        .select("ragione_sociale,piva,sede,cap,citta,provincia").eq("codice", codice).maybeSingle();
    const a = az as { ragione_sociale?: string; piva?: string; sede?: string; cap?: string; citta?: string; provincia?: string } | null;
    if (!a || !a.ragione_sociale) { cache.set(chiave, null); return null; }

    const s: Societa = {
        nome: a.ragione_sociale,
        piva: a.piva || "",
        sede: [a.sede, [a.cap, a.citta].filter(Boolean).join(" "), a.provincia ? `(${a.provincia})` : ""].filter(Boolean).join(", "),
    };
    cache.set(chiave, s);
    return s;
}
