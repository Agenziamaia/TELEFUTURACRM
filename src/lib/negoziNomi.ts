/**
 * NOMI DEI NEGOZI — le regole di confronto, pure e senza browser.
 *
 * Stavano dentro `visibleStores.ts`, che è `"use client"`: da un route handler
 * quelle esportazioni NON sono chiamabili (Next le trasforma in riferimenti al
 * client). Il server aveva quindi due sole strade — copiarsi le regole, o non
 * applicarle. Copiarle vuol dire che un giorno divergono, e le regole divergenti
 * di questo CRM si sono già pagate care.
 *
 * Qui vivono una volta sola; `visibleStores.ts` le ri-esporta, così tutti gli
 * import esistenti continuano a funzionare esattamente come prima.
 */

/** Confronto tollerante tra nomi negozio: esatto o per prefisso, perche' i dati
 *  storici usano anche la radice corta ("Magliana" vs "Magliana Multi"). */
export function sameStore(a?: string | null, b?: string | null): boolean {
    const x = String(a || "").trim().toLowerCase();
    const y = String(b || "").trim().toLowerCase();
    return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
}

/** Campo negozio MULTI (convenzione WhatsApp, estesa alle email il 26/08):
 *  "Magliana W3, Magliana Multi" = una risorsa condivisa tra più punti
 *  vendita gemelli, virgola-separati. */
export function splitNegozi(csv?: string | null): string[] {
    return String(csv || "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** La risorsa col campo negozio (anche multi) tocca UNO dei negozi dati? */
export function matchNegozi(csv: string | null | undefined, stores: readonly string[]): boolean {
    return splitNegozi(csv).some((n) => stores.some((s) => sameStore(n, s)));
}

/** Sede FISICA di un negozio: i punti vendita "doppi" (Magliana W3/Multi,
 *  Acilia Multi/VS, Collatina W3/Multi) sono lo stesso locale con UN unico
 *  magazzino. La sede e' la prima parola del nome ("Magliana W3" → "magliana"). */
export function sedeFisica(nome?: string | null): string {
    return String(nome || "").trim().toLowerCase().split(" ")[0];
}

/** true se i due negozi condividono la sede fisica (magazzino unificato):
 *  chi lavora in uno dei due gemelli scarica/gestisce anche l'altro. */
export function stessoMagazzino(a?: string | null, b?: string | null): boolean {
    const x = sedeFisica(a), y = sedeFisica(b);
    return !!x && !!y && x === y;
}

/** Valori per un filtro query `.in("negozio", …)`: i nomi visibili piu' le radici
 *  legacy dei nomi composti (visibile "Magliana W3" ⇒ anche i contratti storici
 *  salvati come "Magliana"). Piu' preciso del vecchio ilike sulla radice, che a
 *  chi vedeva un solo Magliana mostrava anche l'altro. */
export function negozioInValues(stores: string[]): string[] {
    const out = new Set<string>();
    stores.forEach((s) => {
        const t = String(s || "").trim();
        if (!t) return;
        out.add(t);
        const root = t.split(" ")[0];
        if (root && root !== t) out.add(root);
    });
    return [...out];
}
