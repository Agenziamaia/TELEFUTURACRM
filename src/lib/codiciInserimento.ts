// Codici di inserimento (codice negozio/dealer) per brand.
//
// Erano scritti a mano dentro Registra Contratto e da nessun'altra parte: in
// Ricerca Contratto la tendina veniva costruita dai contratti gia' salvati,
// quindi mostrava solo i codici gia' usati (per Kena appariva il solo
// "Collatina") e per i brand senza storico non appariva nulla.
// Qui c'e' l'elenco unico: lo usano sia Registra Contratto sia Ricerca Contratto.

export const CODICI_WINDTRE = ["Magliana", "Libia", "San Paolo", "Mazzini", "Donna", "Promontori", "Collatina", "Garbatella"];
export const CODICI_VODAFONE = ["Acilia", "Baleniere", "Castani", "Merulana", "Donna", "Magliana", "Collatina", "Garbatella"];
export const CODICI_FASTWEB = ["Acilia", "Baleniere", "Castani", "Merulana", "Magliana", "Donna", "Garbatella", "Promontori"];
export const CODICI_ILIAD = ["Magliana", "Donna", "Garbatella", "Promontori", "Acilia"];
export const CODICI_SKY = ["Acilia", "Donna", "Magliana", "Garbatella", "Promontori", "Collatina"];
export const CODICI_TIM = ["Collatina"];
export const CODICI_VERY = ["Donna", "Promontori", "Garbatella"];
export const CODICI_HO = ["Collatina", "Donna", "Magliana", "Promontori"];
export const CODICI_KENA = ["Collatina", "Donna", "Magliana", "Promontori"];

/** Chiave normalizzata del brand (regge "WindTre", "Wind3", "Ho. Mobile", ...). */
function chiaveBrand(brand: string | null | undefined): string {
    const b = String(brand || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!b) return "";
    if (b.startsWith("windtre") || b.startsWith("wind3") || b === "w3") return "windtre";
    if (b.startsWith("vodafone") || b.startsWith("vodaf")) return "vodafone";
    if (b.startsWith("fastweb")) return "fastweb";
    if (b.startsWith("iliad")) return "iliad";
    if (b.startsWith("sky")) return "sky";
    if (b.startsWith("tim")) return "tim";
    if (b.startsWith("very")) return "very";
    if (b.startsWith("kena")) return "kena";
    if (b === "ho" || b.startsWith("homobile") || b.startsWith("ho")) return "ho";
    if (b.startsWith("energ") || b.startsWith("s4") || b.startsWith("barton")) return "energia";
    return "";
}

/**
 * Codici disponibili per un brand. Per Energia (e per i brand non censiti) si
 * usa l'elenco completo dei negozi, che va passato da chi chiama.
 */
export function codiciPerBrand(brand: string | null | undefined, tuttiNegozi: string[] = []): string[] {
    switch (chiaveBrand(brand)) {
        case "windtre": return CODICI_WINDTRE;
        case "vodafone": return CODICI_VODAFONE;
        case "fastweb": return CODICI_FASTWEB;
        case "iliad": return CODICI_ILIAD;
        case "sky": return CODICI_SKY;
        case "tim": return CODICI_TIM;
        case "very": return CODICI_VERY;
        case "ho": return CODICI_HO;
        case "kena": return CODICI_KENA;
        default: return tuttiNegozi;   // energia e brand senza elenco dedicato
    }
}
