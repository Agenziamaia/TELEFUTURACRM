"use client";

// IBAN ITALIANO — validazione UNICA per tutto il CRM (Luca 01/08, dal caso
// Registra Usato: l'IBAN del bonifico entrava senza alcun controllo).
// Struttura: IT + 2 cifre di controllo + lettera CIN + 22 alfanumerici
// (ABI 5 + CAB 5 + conto 12) = 27 caratteri esatti. Oltre alla struttura si
// verificano le cifre di controllo (mod-97, ISO 7064): una struttura giusta
// con un numero sbagliato e' comunque un bonifico perso.

/** Maiuscole, niente spazi o separatori. */
export function normalizzaIban(v: string): string {
    return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 34);
}

/** Messaggio d'errore per un IBAN italiano, o null se valido.
 *  Stringa vuota => null: se il campo e' obbligatorio decide il chiamante. */
export function erroreIbanIT(v: string): string | null {
    const s = normalizzaIban(v);
    if (!s) return null;
    if (!s.startsWith("IT")) return "L'IBAN italiano inizia con IT";
    if (s.length >= 4 && !/^IT\d{2}/.test(s)) return "Dopo IT servono le 2 cifre di controllo (es. IT60…)";
    if (s.length >= 5 && !/^IT\d{2}[A-Z]/.test(s)) return "Dopo le 2 cifre serve la lettera CIN (es. IT60X…)";
    if (s.length !== 27) return `IBAN italiano: 27 caratteri richiesti (${s.length}/27)`;
    if (!/^IT\d{2}[A-Z][0-9A-Z]{22}$/.test(s)) return "Caratteri non validi nell'IBAN";
    // mod-97: primi 4 caratteri in coda, lettere convertite (A=10 … Z=35),
    // il resto della divisione per 97 deve fare 1
    const espanso = (s.slice(4) + s.slice(0, 4)).split("")
        .map((c) => (c >= "0" && c <= "9" ? c : String(c.charCodeAt(0) - 55))).join("");
    let resto = 0;
    for (let i = 0; i < espanso.length; i += 7) resto = Number(String(resto) + espanso.slice(i, i + 7)) % 97;
    if (resto !== 1) return "Le cifre di controllo non tornano: ricontrolla l'IBAN";
    return null;
}
