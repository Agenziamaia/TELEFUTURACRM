"use client";

/**
 * CODICE FISCALE → DATA DI NASCITA (Luca 29/07).
 * La data non si chiede mai nei form: si DERIVA dal CF quando viene
 * archiviato, su clienti e dipendenti. Gestita l'omocodia (cifre sostituite
 * da lettere L,M,N,P,Q,R,S,T,U,V nelle posizioni numeriche).
 * P.IVA (11 cifre) e stringhe non-CF → null, senza errori.
 */

const MESI: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, H: 6, L: 7, M: 8, P: 9, R: 10, S: 11, T: 12 };
const OMOCODIA: Record<string, string> = { L: "0", M: "1", N: "2", P: "3", Q: "4", R: "5", S: "6", T: "7", U: "8", V: "9" };

const cifra = (ch: string): string => (/\d/.test(ch) ? ch : (OMOCODIA[ch] ?? ""));

/** Data di nascita in ISO (AAAA-MM-GG) dal codice fiscale, o null. */
export function dataNascitaDaCF(cf: string | null | undefined): string | null {
    const s = String(cf || "").toUpperCase().replace(/\s/g, "");
    if (s.length !== 16 || !/^[A-Z]{6}/.test(s)) return null;
    const aa = cifra(s[6]) + cifra(s[7]);
    const mese = MESI[s[8]];
    const gg2 = cifra(s[9]) + cifra(s[10]);
    if (aa.length !== 2 || !mese || gg2.length !== 2) return null;
    const yy = parseInt(aa, 10);
    let giorno = parseInt(gg2, 10);
    if (giorno > 40) giorno -= 40;               // femmine: giorno + 40
    if (giorno < 1 || giorno > 31) return null;
    const annoCorrente = new Date().getFullYear() % 100;
    const anno = yy <= annoCorrente ? 2000 + yy : 1900 + yy;
    let d = new Date(anno, mese - 1, giorno);
    if (d.getFullYear() !== anno || d.getMonth() !== mese - 1 || d.getDate() !== giorno) return null;
    // una data di nascita nel FUTURO è certamente il secolo sbagliato → -100
    if (d.getTime() > Date.now()) { const a2 = anno - 100; d = new Date(a2, mese - 1, giorno); return `${a2}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`; }
    return `${anno}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`;
}

/** Età compiuta da una data ISO, o null. */
export function etaDa(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const d = new Date(String(iso));
    if (isNaN(d.getTime())) return null;
    const oggi = new Date();
    let eta = oggi.getFullYear() - d.getFullYear();
    if (oggi.getMonth() < d.getMonth() || (oggi.getMonth() === d.getMonth() && oggi.getDate() < d.getDate())) eta--;
    return eta >= 0 && eta < 130 ? eta : null;
}
