// Normalizzazione numeri di telefono in E.164 — CONDIVISA client/server
// (30/07). Aircall valida in modo severo (libphonenumber) e su un numero
// malformato risponde 400 BAD_REQUEST "Invalid number to call": il vecchio
// codice appiccicava +39 a qualunque stringa e l'errore arrivava all'utente
// come JSON grezzo. Qui si valida PRIMA, cosi' il messaggio dice qual e' il
// numero rotto da correggere in anagrafica (caso tipico: cellulare a 9 cifre
// per un refuso — un cellulare italiano ne ha 10).
export function normalizzaE164(s: string | null | undefined): string | null {
    const raw = String(s || "").trim();
    let cifre = raw.replace(/\D/g, "");
    const internazionale = raw.startsWith("+") || cifre.startsWith("00");
    if (cifre.startsWith("00")) cifre = cifre.slice(2); // 0039... -> 39...
    // Estero dichiarato esplicitamente (+49..., 0033...): si passa com'e'.
    if (internazionale && !cifre.startsWith("39")) {
        return /^\d{8,15}$/.test(cifre) ? `+${cifre}` : null;
    }
    // Prefisso paese 39: si toglie SOLO se restano abbastanza cifre — un
    // cellulare che inizia per 393/391/392 (10 cifre) non va scambiato per
    // un numero gia' prefissato.
    if (cifre.startsWith("39") && cifre.length >= 11) cifre = cifre.slice(2);
    if (/^3\d{9}$/.test(cifre)) return `+39${cifre}`;   // cellulare: 10 cifre
    if (/^0\d{5,10}$/.test(cifre)) return `+39${cifre}`; // fisso: 0 + 5-10 cifre
    return null;
}

/** ARCHIVIO SENZA PREFISSO (Luca 31/07: si lavora solo con l'Italia, il +39
 *  in anagrafica non serve): solo cifre, via 00/0039/+39. Un cellulare di 10
 *  cifre che inizia per 39x (391, 392, 393...) resta intero — stessa regola
 *  di normalizzaE164. Il prefisso lo aggiungono le integrazioni al momento
 *  dell'invio: normalizzaE164 per Aircall, "39"+ per WhatsApp. Torna "" se
 *  non ci sono cifre: chi salva usi `numeroNazionale(v) || v`. */
export function numeroNazionale(s: string | null | undefined): string {
    let cifre = String(s || "").replace(/\D/g, "");
    if (cifre.startsWith("00")) cifre = cifre.slice(2);
    if (cifre.startsWith("39") && cifre.length >= 11) cifre = cifre.slice(2);
    return cifre;
}

/** Messaggio unico per il numero rifiutato: dice COSA correggere. */
export function msgNumeroNonValido(raw: string | null | undefined): string {
    const n = String(raw || "").trim() || "—";
    return `Il numero salvato sul cliente ("${n}") non è valido: un cellulare italiano ha 10 cifre (i fissi iniziano con 0). Correggi l'anagrafica e riprova.`;
}
