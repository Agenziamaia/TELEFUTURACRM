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

export type Societa = {
    /* ⚠️ IL CODICE VIAGGIA CON IL NOME. Serve per scrivere `azienda_acquisto`
       sull'usato: chi compra è già deciso quando si intesta la dichiarazione, e
       fino al 05/09 quel dato veniva stampato sul documento firmato dal cliente
       e poi buttato via. Tenerli separati vorrebbe dire dedurlo di nuovo. */
    codice: string;
    nome: string; piva: string; sede: string;
};

const cache = new Map<string, Societa | null>();

export async function societaDelNegozio(negozio: string): Promise<Societa | null> {
    const chiave = String(negozio || "").trim();
    if (!chiave) return null;
    const gia = cache.get(chiave);
    if (gia) return gia;   // si ricorda solo ciò che ha trovato: un buco si richiede

    const { data: st } = await supabase.from("stores").select("azienda").eq("name", chiave).maybeSingle();
    const codice = String((st as { azienda?: string } | null)?.azienda || "").trim();
    if (!codice) return null;

    const { data: az } = await supabase.from("aziende")
        .select("ragione_sociale,piva,sede,cap,citta,provincia").eq("codice", codice).maybeSingle();
    const a = az as { ragione_sociale?: string; piva?: string; sede?: string; cap?: string; citta?: string; provincia?: string } | null;
    if (!a || !a.ragione_sociale) return null;

    const s: Societa = {
        codice,
        nome: a.ragione_sociale,
        piva: a.piva || "",
        sede: [a.sede, [a.cap, a.citta].filter(Boolean).join(" "), a.provincia ? `(${a.provincia})` : ""].filter(Boolean).join(", "),
    };
    cache.set(chiave, s);
    return s;
}

/* ═══ COME SI CHIAMANO, IN BREVE ═══════════════════════════════════════════
   Qui sopra c'è il dato COMPLETO, preso da `aziende`: ragione sociale, partita
   IVA e sede, cioè quello che serve su un contratto. Ma su una colonna di
   tabella «TELEFUTURA 2 S.R.L.» ruba settanta pixel per dire una cosa che si
   dice in due parole, e la lettura ne soffre.

   ⚠️ ED ERANO QUATTRO GRAFIE DIVERSE, nessuna che sapesse delle altre.
   Censite il 03/09: «Telefutura S.R.L.» in Documenti, «Telefutura S.r.l.» nel
   file degli usati che va al commercialista, «Telefutura» nel pannello
   PayStore e in Contabilità, «Telefutura 2SRL» in Chiusura. Due esportazioni
   della stessa giornata, destinate allo stesso tavolo, non si incrociavano con
   un cerca-verticale.

   ⚠️ E UNA DELLE QUATTRO VENIVA DA `pos_rt.ragione_sociale`, che NON è una
   ragione sociale: è l'etichetta della cassa — «Telefutura (Custom) -
   Merulana» — e su dieci righe di T1 nove hanno la partita IVA vuota.
   Leggendo il nome da lì, per un giorno intero OGNI documento di tutti e dieci
   i negozi di Telefutura ha mostrato «Telefutura (Custom) - Acilia».

   Il nome corto di una società non è un dato che cambia: sta scritto qui. */

/** Il nome corto, per gli schermi. */
export const NOME_SOCIETA: Record<string, string> = {
    T1: "Telefutura",
    T2: "Telefutura 2",
};

/** Il nome per intero, per i file e i documenti che escono dall'azienda.
 *  ⚠️ Queste grafie sono quelle già usate nei file mandati al commercialista:
 *  cambiarle vorrebbe dire che il file di settembre non si incrocia con quelli
 *  di agosto. Per l'anagrafica completa — partita IVA, sede — c'è `aziende`,
 *  qui sopra: questa è solo la scritta. */
export const RAGIONE_SOCIALE: Record<string, string> = {
    T1: "Telefutura S.r.l.",
    T2: "Telefutura 2 S.r.l.",
};

/** Il nome corto di un codice società. Un codice sconosciuto torna com'è: è
 *  meglio vedere «T3» e chiedersi cos'è, che vedere il nome di un'altra. */
export const nomeSocieta = (codice: string | null | undefined): string =>
    codice ? (NOME_SOCIETA[codice] || codice) : "";
