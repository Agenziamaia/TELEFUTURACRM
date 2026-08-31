// I DOPPIONI, PRIMA DI ASSEGNARE (Luca 31/08).
//
// «Abbiamo fatto una prova assegnando una lista con 10 clienti che erano già
// stati lavorati e 3 nuovi, ma niente: non ci ha segnalato quei contatti come
// già lavorati.» Infatti: il controllo era progettato e non scritto.
//
// Le liste degli SMS di WindTre sono estrazioni mensili sulla stessa base: chi
// riceve l'SMS lo riceve ogni mese, quindi ogni lista nuova contiene mezza
// lista vecchia. Misurato sulle tre già caricate: 568 righe su 1.497 erano già
// conosciute, 288 in mano a un ALTRO caller, e 53 pratiche in lavorazione
// attiva sono state chiuse «non ricontattare» dalla riga nuova.
//
// LA CHIAVE. Il codice fiscale quando c'è ed è formalmente valido, altrimenti
// il numero: sui dati veri il CF prende 568 casi e il telefono 534, e insieme
// 569 — l'unico che solo il telefono trova è una riga in cui il campo «CF»
// contiene il nome e cognome della persona. Il numero da solo lega più CF in
// 15 casi su 3.156 (0,5%): fissi di famiglia e di ufficio. Per questo un
// aggancio SOLO sul numero si presenta come «da confermare» e non come certo.

export type StatoDoppione =
    | "attivato"        // ha già comprato
    | "lavorazione"     // appuntamento in piedi, richiamo fissato, tentativi in corso
    | "chiuso"          // esito definitivo recente (non interessato, non ricontattare)
    | "mai_risposto"    // nessuna informazione: si può riprovare
    | "assegnata";      // assegnata a qualcuno e mai lavorata

export type Doppione = {
    riga: number;                 // indice nella lista che si sta caricando
    nome: string;
    chiave: string;               // il codice fiscale, o il numero se il CF non c'è
    stato: StatoDoppione;
    statoPratica: string;
    caller: string;
    giorni: number | null;        // da quanti giorni è ferma
    perNumero: boolean;           // agganciata solo dal numero: da confermare
    dentroIlFile: boolean;        // è un doppione DENTRO la lista stessa
    /** la pratica che esiste già: assegnandola comunque si RIAPRE QUESTA, non
     *  se ne crea una nuova (Luca 31/08: «non ci devono mai essere schede
     *  duplicate in nessun caso») */
    praticaId: string | null;
};

/** Che cosa fare di una riga già conosciuta. `null` = ancora da decidere: il
 *  CRM non sceglie per conto suo (Luca 31/08: «non deve decidere in
 *  automatico, deve chiedermi che cosa voglio fare»). */
export type Decisione = "salta" | "riassegna" | null;

export const CF_VALIDO = /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/;
export const normCf = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const normNum = (v: unknown) => {
    const d = String(v ?? "").replace(/\D/g, "");
    return d.length >= 9 ? d.slice(-9) : "";
};

/** In che situazione era il cliente quando la lista nuova lo ripesca. */
export function statoDi(statoPratica: string, comportamento: string): StatoDoppione {
    const s = String(statoPratica || "");
    if (/attivat/i.test(s)) return "attivato";
    if (/^(assegnata|nuovo)$/i.test(s)) return "assegnata";
    if (/mai risposto|sparito/i.test(s)) return "mai_risposto";
    if (comportamento === "appuntamento" || comportamento === "richiamo" || comportamento === "non_risposto") return "lavorazione";
    return "chiuso";
}

/* NESSUN VALORE DI FABBRICA: il CRM non decide, chiede. `consiglio` è solo un
   suggerimento scritto accanto — quello che farebbe una persona esperta — ma
   finché non si sceglie, non si va avanti. */
export const ETICHETTA: Record<StatoDoppione, { titolo: string; spiega: string; consiglio: "salta" | "riassegna" }> = {
    attivato: { titolo: "✅ Ha già comprato", spiega: "ha un contratto attivo: richiamarlo per vendergli la stessa cosa è una brutta figura", consiglio: "salta" },
    lavorazione: { titolo: "⏳ In lavorazione", spiega: "appuntamento in piedi, richiamo fissato o tentativi in corso: qualcuno ci sta già lavorando", consiglio: "salta" },
    chiuso: { titolo: "⛔ Chiuso di recente", spiega: "ha detto di no, o ha chiesto di non essere ricontattato", consiglio: "salta" },
    mai_risposto: { titolo: "📵 Mai risposto", spiega: "nessuno ha mai risposto a quel numero: cambiare voce e orario è un tentativo legittimo", consiglio: "riassegna" },
    assegnata: { titolo: "📋 Già assegnata", spiega: "è già nella lista di qualcuno e non l'ha ancora lavorata", consiglio: "riassegna" },
};

type PraticaEsistente = {
    id?: string;
    cf?: string | null; piva?: string | null; numero?: string | null;
    stato?: string | null; caller?: string | null; assorbita_da?: string | null;
    nome?: string | null; cognome?: string | null; updated_at?: string | null; created_at?: string | null;
};

/** Cerca fra le pratiche esistenti (e dentro il file stesso) quali righe della
 *  lista nuova sono già conosciute. */
export function trovaDoppioni(
    righe: string[][],
    campi: { cf: number; numero: number; nome: number; cognome: number },
    esistenti: PraticaEsistente[],
    comportamenti: Record<string, string>,
): Doppione[] {
    const perCf = new Map<string, PraticaEsistente>();
    const perNum = new Map<string, PraticaEsistente>();
    const eta = (p: PraticaEsistente) => {
        const d = p.updated_at || p.created_at;
        if (!d) return null;
        const g = Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
        return Number.isFinite(g) ? g : null;
    };
    for (const p of esistenti) {
        if (p.assorbita_da) continue;                  // già unita a un'altra: non conta
        const cf = normCf(p.cf || p.piva);
        const nu = normNum(p.numero);
        // vince la più RECENTE: è quella che racconta com'è messo il cliente adesso
        if (cf && (!perCf.has(cf) || (eta(p) ?? 9e9) < (eta(perCf.get(cf)!) ?? 9e9))) perCf.set(cf, p);
        if (nu && (!perNum.has(nu) || (eta(p) ?? 9e9) < (eta(perNum.get(nu)!) ?? 9e9))) perNum.set(nu, p);
    }

    const out: Doppione[] = [];
    const vistiCf = new Map<string, number>();
    const vistiNum = new Map<string, number>();
    righe.forEach((r, i) => {
        const cfGrezzo = normCf(campi.cf >= 0 ? r[campi.cf] : "");
        const cf = CF_VALIDO.test(cfGrezzo) ? cfGrezzo : "";
        const nu = normNum(campi.numero >= 0 ? r[campi.numero] : "");
        const nome = [campi.nome >= 0 ? r[campi.nome] : "", campi.cognome >= 0 ? r[campi.cognome] : ""].filter(Boolean).join(" ").trim()
            || (cf || nu || `riga ${i + 1}`);

        // ① doppione DENTRO il file: due righe della stessa persona
        const primaCf = cf ? vistiCf.get(cf) : undefined;
        const primaNum = nu ? vistiNum.get(nu) : undefined;
        if (primaCf != null || primaNum != null) {
            out.push({ riga: i, nome, chiave: cf || nu, stato: "assegnata", statoPratica: "doppione nel file", caller: "—", giorni: null, perNumero: primaCf == null, dentroIlFile: true, praticaId: null });
            return;
        }
        if (cf) vistiCf.set(cf, i);
        if (nu) vistiNum.set(nu, i);

        // ② doppione con una pratica che c'è già
        const p = (cf && perCf.get(cf)) || (nu && perNum.get(nu)) || null;
        if (!p) return;
        const st = String(p.stato || "");
        out.push({
            riga: i, nome, chiave: cf || nu,
            stato: statoDi(st, comportamenti[st] || ""),
            statoPratica: st || "—",
            caller: p.caller || "—",
            giorni: eta(p),
            perNumero: !(cf && perCf.has(cf)),
            dentroIlFile: false,
            praticaId: p.id ?? null,
        });
    });
    return out;
}
