"use client";

/**
 * COERENZA CODICE FISCALE ↔ NOME/COGNOME (Luca 24/08: caso «Stefania
 * registrata come Anna» — il CF non aveva alcun controllo sul nome).
 *
 * Il CF italiano è deterministico: 3 lettere dal cognome, 3 dal nome
 * (regola delle consonanti; con 4+ consonanti nel nome si usano 1ª-3ª-4ª),
 * poi anno/mese/giorno+sesso/comune e il CARATTERE DI CONTROLLO finale.
 * Qui si verifica tutto ciò che si può verificare con i dati del form:
 *  - struttura (16 caratteri, pattern con omocodia sulle posizioni numeriche);
 *  - le 6 lettere iniziali contro cognome e nome scritti;
 *  - il carattere di controllo (becca anche gli errori di battitura).
 * P.IVA (11 cifre) e campo vuoto NON sono errori: il controllo si salta.
 *
 * L'esito è pensato per il banner «bloccante-ma-forzabile»: motivi già
 * in italiano, pronti da mostrare, e il salvataggio passa solo con la
 * conferma esplicita dell'operatore.
 */

const VOCALI = "AEIOU";

/** maiuscole, senza accenti/apostrofi/spazi: solo A-Z (D'Amico → DAMICO). */
const pulisci = (s: string | null | undefined): string =>
    String(s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase()
        .replace(/[^A-Z]/g, "");

const spartisci = (s: string): { cons: string[]; voc: string[] } => {
    const cons: string[] = [], voc: string[] = [];
    for (const ch of s) (VOCALI.includes(ch) ? voc : cons).push(ch);
    return { cons, voc };
};

/** 3 lettere del COGNOME: consonanti poi vocali, X di riempimento. */
export function lettereCognome(cognome: string): string {
    const { cons, voc } = spartisci(pulisci(cognome));
    return (cons.join("") + voc.join("") + "XXX").slice(0, 3);
}

/** 3 lettere del NOME: con 4+ consonanti si prendono 1ª, 3ª e 4ª. */
export function lettereNome(nome: string): string {
    const { cons, voc } = spartisci(pulisci(nome));
    if (cons.length >= 4) return cons[0] + cons[2] + cons[3];
    return (cons.join("") + voc.join("") + "XXX").slice(0, 3);
}

// tabelle ufficiali del carattere di controllo
const DISPARI: Record<string, number> = {
    "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
    A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
    N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
const PARI: Record<string, number> = {};
for (let i = 0; i < 10; i++) PARI[String(i)] = i;
for (let i = 0; i < 26; i++) PARI[String.fromCharCode(65 + i)] = i;

/** Carattere di controllo atteso per i primi 15 caratteri. */
export function carattereControllo(cf15: string): string {
    let somma = 0;
    for (let i = 0; i < 15; i++) somma += (i % 2 === 0 ? DISPARI : PARI)[cf15[i]] ?? 0;
    return String.fromCharCode(65 + (somma % 26));
}

// struttura con OMOCODIA: le posizioni numeriche ammettono L,M,N,P,Q,R,S,T,U,V
const NUM = "[0-9LMNPQRSTUV]";
const RX_CF = new RegExp(`^[A-Z]{6}${NUM}{2}[ABCDEHLMPRST]${NUM}{2}[A-Z]${NUM}{3}[A-Z]$`);

export type EsitoCF =
    | { ok: true; saltato?: boolean }
    | { ok: false; motivi: string[]; attese?: { cognome: string; nome: string } };

/**
 * Verifica la coerenza del CF con nome e cognome del form.
 * `nome`/`cognome` vuoti → si controllano solo struttura e carattere finale.
 */
export function verificaCoerenzaCF(nome: string | null | undefined, cognome: string | null | undefined, cf: string | null | undefined): EsitoCF {
    const s = String(cf || "").toUpperCase().replace(/\s/g, "");
    if (!s) return { ok: true, saltato: true };
    if (/^\d{11}$/.test(s)) return { ok: true, saltato: true };      // P.IVA: altro mondo
    const motivi: string[] = [];
    if (s.length !== 16) {
        return { ok: false, motivi: [`il codice ha ${s.length} caratteri invece di 16`] };
    }
    if (!RX_CF.test(s)) {
        return { ok: false, motivi: ["la struttura non è quella di un codice fiscale (lettere e numeri fuori posto)"] };
    }
    const attC = pulisci(cognome) ? lettereCognome(cognome as string) : null;
    const attN = pulisci(nome) ? lettereNome(nome as string) : null;
    if (attC && s.slice(0, 3) !== attC) motivi.push(`le prime 3 lettere non tornano col cognome «${String(cognome).trim()}»: attese ${attC}, nel codice c'è ${s.slice(0, 3)}`);
    if (attN && s.slice(3, 6) !== attN) motivi.push(`le lettere del nome non tornano con «${String(nome).trim()}»: attese ${attN}, nel codice c'è ${s.slice(3, 6)}`);
    const ctrl = carattereControllo(s.slice(0, 15));
    if (s[15] !== ctrl) motivi.push(`il carattere di controllo finale è ${s[15]} ma per questo codice dovrebbe essere ${ctrl}: probabile errore di battitura`);
    if (motivi.length) return { ok: false, motivi, attese: { cognome: attC || "—", nome: attN || "—" } };
    return { ok: true };
}

/**
 * Variante per i nomi in un CAMPO UNICO («Mario Rossi», «Maria Grazia Bianchi»):
 * prova ogni split possibile in (nome, cognome) e anche l'ordine inverso —
 * basta che UNA combinazione torni. Con una parola sola o campo vuoto si
 * verificano solo struttura e carattere di controllo.
 */
export function verificaCoerenzaCFNomeCompleto(nomeCompleto: string | null | undefined, cf: string | null | undefined): EsitoCF {
    const parti = String(nomeCompleto || "").trim().split(/\s+/).filter(Boolean);
    if (parti.length < 2) return verificaCoerenzaCF("", "", cf);
    let primo: EsitoCF | null = null;
    for (let i = 1; i < parti.length; i++) {
        const a = parti.slice(0, i).join(" "), b = parti.slice(i).join(" ");
        for (const [nome, cognome] of [[a, b], [b, a]] as const) {
            const e = verificaCoerenzaCF(nome, cognome, cf);
            if (e.ok) return e;
            if (!primo) primo = e;
        }
    }
    return primo || { ok: true, saltato: true };
}
