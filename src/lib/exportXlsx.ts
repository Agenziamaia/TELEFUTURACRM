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

/** PIÙ FOGLI IN UN FILE SOLO (Luca 31/08: «mi deve dare due tab, dettaglio e
 *  riepilogo»). Stessa auto-larghezza dell'export a foglio singolo.
 *
 *  I giorni si scrivono come NUMERO, non come testo: così Excel li somma, li
 *  ordina, e le mezze giornate le mostra col separatore decimale della lingua
 *  del foglio — che qui è la virgola. Un «0,5» scritto come testo sarebbe una
 *  parola: bella da vedere e inutile in una somma. */
export async function scaricaXlsxMulti(
    nomeFile: string,
    fogli: { nome: string; intestazioni: string[]; righe: CellaXlsx[][] }[],
): Promise<void> {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const usati = new Set<string>();
    for (const f of fogli) {
        const ws = XLSX.utils.aoa_to_sheet([f.intestazioni, ...f.righe]);
        ws["!cols"] = f.intestazioni.map((h, i) => {
            let w = Math.max(h.length + 2, 8);
            for (const r of f.righe) w = Math.max(w, String(r[i] ?? "").length + 2);
            return { wch: Math.min(w, 60) };
        });
        // Il nome di un foglio Excel non può superare 31 caratteri, contenere
        // []:*?/\ , essere vuoto o iniziare/finire con un apostrofo. E due nomi
        // che dopo il taglio COINCIDONO fanno morire l'export a metà, muto:
        // meglio un «(2)» in fondo che un file che non esce.
        let nome = (f.nome || "Foglio").replace(/[[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "Foglio";
        for (let i = 2; usati.has(nome.toLowerCase()); i++) nome = `${nome.slice(0, 27)} (${i})`;
        usati.add(nome.toLowerCase());
        XLSX.utils.book_append_sheet(wb, ws, nome);
    }
    XLSX.writeFile(wb, `${nomeFile}.xlsx`);
}
