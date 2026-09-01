/* ═══ LA RIGA DELLO SCONTRINO ════════════════════════════════════════════════
 *
 * Il registratore stampa 38 caratteri per riga. Su un telefono la riga deve
 * portare due cose — il modello e l'IMEI — e quasi mai ci stanno tutte e due.
 *
 * LA REGOLA: **l'IMEI vince sul nome.** Se non ci sta tutto, si accorcia il
 * MODELLO; l'IMEI o c'è intero o non c'è. Mai a metà.
 *
 * PERCHÉ COSÌ, e non il contrario. Il modello è scritto sulla scatola, nella
 * vendita e nel magazzino: accorciarlo non fa perdere niente a nessuno.
 * L'IMEI invece è l'unica cosa che lega QUEL pezzo a QUELLO scontrino — è
 * quello che il cliente porta in garanzia e quello che noi cerchiamo quando
 * un anno dopo qualcuno chiede «me l'avete venduto voi?».
 *
 * COM'ERA. La regola esisteva in tre punti e diceva tre cose diverse:
 *   · il browser (`_descrizioneConImei`) BUTTAVA l'IMEI e teneva il nome intero;
 *   · la rotta tagliava a 38 secchi, e usciva «IMEI 3» su un iPhone;
 *   · una sola riga — quella dell'apparato FWA — faceva «intero o niente».
 * Misurato sui telefoni venduti il 01/09: **7 su 8 sono usciti senza IMEI**,
 * e su 400 unità di magazzino solo 24 lo avrebbero avuto. Con questa regola
 * sola, applicata prima, sono 395 su 400.
 *
 * L'ordine conta: chi taglia PRIMA decide. Per questo la regola sta qui, e i
 * tre punti la chiamano invece di riscriverla.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const MAX_RIGA_SCONTRINO = 38;

/** Sotto questa soglia il nome non si riconosce più: meglio rinunciare
 *  all'IMEI che stampare una riga che non dice cosa è stato venduto. */
const MODELLO_MINIMO = 12;

/** «Modello · IMEI 3501…» che sta in 38 caratteri, con l'IMEI sempre intero. */
export function rigaConImei(modello: unknown, seriale: unknown, ripiego = ""): string {
    const m = String(modello || "").trim();
    if (!m) return String(ripiego || "").slice(0, MAX_RIGA_SCONTRINO).trim();
    const im = String(seriale || "").trim();
    if (!im) return m.slice(0, MAX_RIGA_SCONTRINO).trim();

    const coda = ` · IMEI ${im}`;
    if (m.length + coda.length <= MAX_RIGA_SCONTRINO) return m + coda;

    const spazio = MAX_RIGA_SCONTRINO - coda.length;
    if (spazio >= MODELLO_MINIMO) return (m.slice(0, spazio).trim() + coda).slice(0, MAX_RIGA_SCONTRINO);
    return m.slice(0, MAX_RIGA_SCONTRINO).trim();   // l'IMEI non ci sta: si toglie intero
}

/** L'ULTIMO CANCELLO, prima della stampante. Riceve descrizioni già composte —
 *  da qui o da altrove — e le fa rientrare nei 38 caratteri senza mai spezzare
 *  un IMEI. Il seriale può non essere numerico (occhiali, accessori con codice
 *  alfanumerico): per questo non si pretendono cifre. */
export function tagliaRiga(descrizione: unknown): string {
    const t = String(descrizione || "ARTICOLO").trim();
    if (t.length <= MAX_RIGA_SCONTRINO) return t;
    const m = t.match(/^(.*?)\s*·\s*IMEI\s*([A-Za-z0-9]{6,})$/i);
    if (m) return rigaConImei(m[1], m[2], t);
    return t.slice(0, MAX_RIGA_SCONTRINO).trim();
}
