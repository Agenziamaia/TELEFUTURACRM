// FASCE ORARIE aziendali (Luca 31/07) — definizione UNICA per tutto il CRM:
// un appuntamento (negozio, telefonico o richiamo) puo' avere un orario
// preciso OPPURE una fascia. La fascia sostituisce l'orario.
export const FASCE = {
    mattina: { label: "Mattina", ore: "10:00–13:00", start: "10:00", emoji: "🌅" },
    pomeriggio: { label: "Pomeriggio", ore: "16:00–19:30", start: "16:00", emoji: "🌇" },
} as const;

export type Fascia = keyof typeof FASCE;

export function eFascia(f?: string | null): f is Fascia {
    return f === "mattina" || f === "pomeriggio";
}

/** "🌅 Mattina (10:00–13:00)" — per badge e riepiloghi; null se non e' una fascia. */
export function fasciaLabel(f?: string | null): string | null {
    if (!eFascia(f)) return null;
    const d = FASCE[f];
    return `${d.emoji} ${d.label} (${d.ore})`;
}

/** Ora d'inizio della fascia ("10:00"/"16:00"): usata come `time` tecnico per
 *  l'ordinamento in calendario quando non c'e' un orario preciso. */
export function fasciaStart(f?: string | null): string | null {
    return eFascia(f) ? FASCE[f].start : null;
}
