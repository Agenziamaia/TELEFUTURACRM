// GLB-03: helper condiviso per gli export "Excel" del CRM.
// Prima ogni pagina generava un CSV con Blob + BOM + decimali "12,50" testuali;
// ora si produce un VERO .xlsx con SheetJS. La libreria (già in package.json,
// usata anche dall'import listini) viene caricata con import dinamico SOLO al
// click di export, così non pesa sul bundle iniziale delle pagine.

/** Valore ammesso in una cella: i numeri diventano celle numeriche vere
 *  (somme/filtri funzionano subito in Excel, decimali con virgola su it-IT). */
export type CellaXlsx = string | number | null | undefined;

/**
 * Genera e scarica un file .xlsx con un solo foglio.
 * @param nomeFile    nome del file, con o senza estensione ".xlsx"
 * @param intestazioni prima riga (header) del foglio
 * @param righe       righe dati; una riga vuota `[]` produce una riga vuota nel foglio
 * @param nomeFoglio  nome del foglio (default "Dati")
 */
export async function scaricaXlsx(
    nomeFile: string,
    intestazioni: string[],
    righe: CellaXlsx[][],
    nomeFoglio = "Dati",
): Promise<void> {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([intestazioni, ...righe]);
    // Auto-larghezza colonne: il contenuto più lungo tra header e celle
    // (minimo 8, massimo 60 caratteri per non far esplodere note lunghe).
    ws["!cols"] = intestazioni.map((h, i) => {
        let w = Math.max(h.length + 2, 8);
        for (const r of righe) w = Math.max(w, String(r[i] ?? "").length + 2);
        return { wch: Math.min(w, 60) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, nomeFoglio);
    // writeFile in browser crea e scarica il file da solo:
    // niente più Blob/createObjectURL/revoke a carico del chiamante.
    XLSX.writeFile(wb, nomeFile.endsWith(".xlsx") ? nomeFile : `${nomeFile}.xlsx`);
}
