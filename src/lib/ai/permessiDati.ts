/**
 * CHI PUÒ VEDERE COSA, QUANDO A CHIEDERE È L'ASSISTENTE (Luca 29/08).
 *
 * «L'AI deve rispondere esattamente come risponderebbe il CRM a quella
 *  persona. Se ho visibilità sul mio punto vendita non posso chiedere di un
 *  altro negozio; uno store manager non può chiedere dei pagamenti di
 *  commissioning all'azienda, ma può chiedere del commissioning dei ragazzi.»
 *
 * Sono DUE cose diverse, e vanno risolte in due modi diversi:
 *
 *   RIGHE  → quali negozi vede. Lo sa già `scope.ts`, ed è la stessa regola
 *            delle schermate. Qui non si tocca.
 *   COLONNE → cosa può leggere di quelle righe, e dipende dal RUOLO. Prima era
 *            una lista unica uguale per tutti: un direttore generale non poteva
 *            leggere il costo di una gara nemmeno se in azienda lo governa lui.
 *
 * ⚠️ SI FILTRANO I RISULTATI, NON LA QUERY. Qualunque cosa il modello abbia
 * scritto — anche un «select *» — le colonne vietate spariscono dopo, prima
 * che le veda. Filtrare la query vorrebbe dire fidarsi di come il modello l'ha
 * scritta, e il modello non è un confine di sicurezza.
 */

/** Le famiglie di dati riservati. Una colonna appartiene a una famiglia; un
 *  ruolo vede o non vede la famiglia intera. Ragionare per famiglie invece che
 *  per singole colonne evita che una colonna nuova nasca scoperta. */
export type FamigliaDati =
    | "credenziali"        // password, chiavi, token: nessuno, mai
    | "retributivo"        // RAL, costo azienda, IBAN delle persone
    | "commissioning_az"   // quanto l'operatore paga a Telefutura
    | "commissioning_rag"  // quanto guadagnano i ragazzi
    | "piste_parallele";   // partnership, business p.iva, smartphone CB

/* ⚠️ SI RICONOSCE DAL NOME DELLA COLONNA, non da un elenco chiuso: le tabelle
   cambiano e una colonna nuova che si chiama «..._ral» o «costo_gara_...» deve
   nascere protetta, non scoperta. Meglio un falso positivo (una colonna
   nascosta per sbaglio, che si nota subito) che un falso negativo. */
const RICONOSCI: { fam: FamigliaDati; re: RegExp }[] = [
    { fam: "credenziali", re: /(^|_)(password|passwd|pass_enc|secret|token|api_key|chiave|totp|otp_secret)($|_)/i },
    { fam: "retributivo", re: /(^|_)(iban|ral|ral_annua|company_cost|costo_azienda|stipendio|retribuzione|compenso_lordo)($|_)/i },
    { fam: "commissioning_az", re: /(^|_)(costo_gara|commissioning_azienda|comm_azienda|margine_azienda|fee_operatore)($|_)/i },
    { fam: "commissioning_rag", re: /(^|_)(commissioning|compenso|premio|percentuale|perc_|bonus)($|_)/i },
    { fam: "piste_parallele", re: /(^|_)(partnership|business_piva|smartphone_cb)($|_)/i },
];

/** A quale famiglia riservata appartiene una colonna. `null` = libera. */
export function famigliaDi(colonna: string): FamigliaDati | null {
    const c = String(colonna || "").toLowerCase();
    for (const r of RICONOSCI) if (r.re.test(c)) return r.fam;
    return null;
}

/* CHI VEDE COSA.
   ⚠️ Le credenziali non compaiono per NESSUNO, nemmeno per l'admin: una
   password non si legge, si usa — ed è la regola della sezione Password.
   Questa tabella è pensata per essere LETTA E CORRETTA da Luca: se una riga
   non rispecchia come lavorate, si cambia qui e cambia ovunque. */
const VEDE: Record<string, FamigliaDati[]> = {
    admin: ["retributivo", "commissioning_az", "commissioning_rag", "piste_parallele"],
    dev: ["retributivo", "commissioning_az", "commissioning_rag", "piste_parallele"],
    direttore_generale: ["retributivo", "commissioning_az", "commissioning_rag", "piste_parallele"],
    direttore_commerciale: ["commissioning_az", "commissioning_rag", "piste_parallele"],
    direttore_cc: ["commissioning_rag", "piste_parallele"],
    direttore_ob: ["commissioning_rag", "piste_parallele"],
    // l'amministrativo maneggia i pagamenti, non le persone
    amministrativo: ["commissioning_az", "commissioning_rag"],
    // «uno store manager non può chiedere dei pagamenti di commissioning
    //  all'azienda, ma può chiedere del commissioning dei ragazzi» (Luca)
    store_manager: ["commissioning_rag"],
    back_office_caller: ["commissioning_rag"],
};

/** Le famiglie che questo ruolo può leggere. Chi non è in tabella (venditore,
 *  caller, tecnico, agente) non ne vede nessuna: vede i dati del lavoro, non
 *  i soldi di nessuno. */
export function famiglieConsentite(ruolo: string): Set<FamigliaDati> {
    return new Set(VEDE[String(ruolo || "").toLowerCase()] || []);
}

/** Le tabelle che l'assistente non apre mai, per nessuno.
 *
 *  ⚠️ QUESTA LISTA NON ERA LA PROTEZIONE, ed è bene saperlo: `ai.interroga`
 *  gira come un ruolo con `bypassrls`, quindi dentro quella funzione le regole
 *  delle tabelle non esistono. Il 31/08 un revisore ha chiesto all'assistente
 *  «gli ultimi messaggi di email_messages» e si è portato via la posta di
 *  amministrazione@, il WhatsApp protetto e le impronte dei codici: avevo
 *  chiuso `email_accounts` e non i MESSAGGI. La porta vera l'ha chiusa il
 *  `revoke` della migrazione 20260831160000; questa lista è il secondo
 *  chiavistello, quello che dà un errore comprensibile invece di un
 *  «permission denied» dal database. */
export const TABELLE_VIETATE = new Set<string>([
    "password_credentials",     // le password del CRM
    "password_access_log",      // chi ha chiesto quale password
    "impostazioni_servizio",    // le chiavi dei servizi esterni
    "otp_pulizia_stato",
    "app_users_2fa",
    "auth_sessions",
    "codice_accesso",           // le impronte dei lucchetti
    /* I CONTI IN SOSPESO sono cassa, non analisi (revisore 31/08). Il filtro
       per negozio dell'assistente scatta solo se nel RISULTATO compare una
       colonna che si chiama «negozio»: una domanda tipo «elencami cliente e
       totale dei conti in sospeso» non ne ha nessuna, e serviva nomi di
       clienti e importi da incassare di tutti e quindici i punti vendita a
       chiunque apra l'assistente — store manager compresi. */
    "vendite_sospese",
    // LA POSTA E LE CHAT sono di qualcuno: si leggono dall'Inbox, dove hanno
    // un mittente e una faccia, non da un assistente che le riassume in blocco
    "email_accounts", "email_messages", "email_conversations", "email_drafts",
    "email_triage", "email_regole_utente", "email_mittenti_bloccati",
    "email_account_users",
    "wa_messages", "wa_conversations", "wa_instances", "wa_triage",
]);

/** Toglie dalle righe le colonne che questo ruolo non può leggere.
 *  Restituisce anche COSA ha tolto: la trasparenza è metà del lavoro — chi
 *  legge la risposta deve sapere che c'era dell'altro. */
export function filtraColonne<T extends Record<string, unknown>>(
    righe: T[], ruolo: string,
): { righe: Record<string, unknown>[]; tolte: string[] } {
    const ok = famiglieConsentite(ruolo);
    const tolte = new Set<string>();
    const out = righe.map((r) => {
        const o: Record<string, unknown> = {};
        for (const k of Object.keys(r)) {
            const fam = famigliaDi(k);
            if (fam && !ok.has(fam)) { tolte.add(k); continue; }
            o[k] = r[k];
        }
        return o;
    });
    return { righe: out, tolte: [...tolte] };
}
