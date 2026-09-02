/* ═══ IL CLIENT DELL'API PAYSTORE ══════════════════════════════════════════
   Parla con PayStore server-to-server: token OAuth2, firma HMAC su ogni
   richiesta, idempotenza sulle operazioni che muovono soldi.

   ⚠️ SOLO LATO SERVER. Le credenziali stanno in variabili d'ambiente e non
   devono mai arrivare al browser: chi ha la SigningKey può firmare ricariche
   a nome nostro, e il plafond è vero denaro (in produzione).

   ⚠️ LA CHIAVE ARRIVA IN BASE64 E VA DECODIFICATA. L'HMAC si calcola sui 32
   byte, non sui caratteri della stringa: PayStore stessa dice che è l'errore
   più frequente in assoluto, e produce un 401 che sembra un problema di
   credenziali quando invece è di codice. Il vettore di prova del manuale sta
   in `provaFirma()` qui sotto: se quello passa, la canonicalizzazione è
   giusta e non serve chiamare l'API per scoprirlo.

   ⚠️ IL BODY SI FIRMA SUI BYTE CHE SI TRASMETTONO. Qui la stringa JSON viene
   costruita UNA volta, hashata e spedita: non si ri-serializza dopo aver
   firmato, perché basta una virgola di differenza per invalidare tutto. */

import { createHash, createHmac, randomUUID, randomBytes } from "node:crypto";

/* ═══ COLLAUDO E PRODUZIONE SONO DUE MONDI ════════════════════════════════
   ⚠️ L'INDIRIZZO SEGUE LA CREDENZIALE, NON LA VARIABILE D'AMBIENTE. Era uno
   solo, letto da `PAYSTORE_BASE_URL`, e puntava al collaudo. Con le credenziali
   vere caricate dal pannello, ogni ricarica sarebbe partita verso
   `api-test.paystore.it` con una terna `ps_live_`: rifiutata, con un errore che
   parla di autenticazione e non dice la cosa vera — che stiamo bussando alla
   porta sbagliata.
   Il prefisso della credenziale dice l'ambiente, e l'ambiente dice l'indirizzo. */
const BASE_COLLAUDO = process.env.PAYSTORE_BASE_URL || "https://api-test.paystore.it/api/partner/v1";
const BASE_PRODUZIONE = process.env.PAYSTORE_BASE_URL_LIVE || "https://api.paystore.it/api/partner/v1";
const baseDi = (c: { clientId: string }) => c.clientId.startsWith("ps_test_") ? BASE_COLLAUDO : BASE_PRODUZIONE;
/** L'indirizzo di default, per chi non ha ancora una credenziale in mano. */
const BASE = BASE_COLLAUDO;

/* ═══ UNA TERNA PER NEGOZIO, NON UNA PER SERVER ════════════════════════════
   Luca 02/09: «sono arrivate tutte le credenziali API di PayStore: ne hanno
   creata una per ogni punto vendita, divisa per società».

   ⚠️ PERCHÉ NON BASTAVA UNA VARIABILE D'AMBIENTE. Con sedici terne, ogni
   ricarica dev'essere firmata con quella del negozio che l'ha venduta: il
   plafond è separato, e una ricarica firmata con le credenziali di un altro
   punto vendita ADDEBITA IL CREDITO DI QUELL'ALTRO. Il credito è denaro vero,
   e la riconciliazione a fine mese la farebbe qualcun altro.

   ⚠️ E IL TOKEN NON PUÒ ESSERE UNO SOLO. Era tenuto in una variabile di
   modulo: con più credenziali il token del negozio A sarebbe finito su una
   richiesta firmata per il negozio B — che PayStore rifiuta con un 401 che
   sembra un problema di credenziali. La cassaforte dei token è per client id. */
export type Credenziale = { clientId: string; clientSecret: string; signingKey: string };

/** La terna delle variabili d'ambiente: è quella del COLLAUDO, e resta il
 *  ripiego quando una ricarica non ha un negozio a cui agganciarsi. */
export const credenzialeAmbiente = (): Credenziale | null => {
    const c = { clientId: process.env.PAYSTORE_CLIENT_ID || "", clientSecret: process.env.PAYSTORE_CLIENT_SECRET || "", signingKey: process.env.PAYSTORE_SIGNING_KEY || "" };
    return c.clientId && c.clientSecret && c.signingKey ? c : null;
};

/** Il prefisso dice l'ambiente, e la differenza non è cosmetica: su una
 *  credenziale `ps_live_` i numeri magici del collaudo sono numeri di
 *  telefono veri, e il plafond è denaro. */
export const inCollaudo = (c?: Credenziale | null) => String((c || credenzialeAmbiente())?.clientId || "").startsWith("ps_test_");
export const configurato = () => !!credenzialeAmbiente();

const pathDi = (base: string) => { try { return new URL(base).pathname.replace(/\/$/, ""); } catch { return "/api/partner/v1"; } };

export type EsitoPs<T> =
    | { ok: true; dati: T; replay?: boolean }
    | { ok: false; stato: number; errore: string; descrizione?: string; correlationId?: string; definitivo: boolean };

/* ─── IL TOKEN ──────────────────────────────────────────────────────────────
   Dura 300 secondi e si riusa fino alla scadenza: chiederne uno a ogni
   chiamata satura il limite dell'endpoint (10 al minuto) e basterebbero
   dieci ricariche in un minuto per bloccare il negozio. Si rinnova 30
   secondi prima della scadenza, che è il margine per una richiesta lenta. */
const token = new Map<string, { valore: string; scadeIl: number }>();
const tokenInCorso = new Map<string, Promise<string>>();

async function accessToken(c: Credenziale): Promise<string> {
    /* ⚠️ LA CHIAVE DELLA CASSAFORTE È IL CLIENT ID. Con un token solo, la
       seconda ricarica di un negozio diverso avrebbe riusato il token del
       primo su una firma fatta con un'altra chiave. */
    const k = c.clientId;
    const v = token.get(k);
    if (v && Date.now() < v.scadeIl) return v.valore;
    const inCorso = tokenInCorso.get(k);
    if (inCorso) return inCorso;                    // due ricariche insieme = una sola richiesta
    const p = (async () => {
        const r = await fetch(baseDi(c) + "/oauth/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.clientSecret }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.access_token) throw new Error(`token non ottenuto (${r.status}): ${j?.error || "risposta illeggibile"}`);
        token.set(k, { valore: j.access_token, scadeIl: Date.now() + Math.max(30, Number(j.expires_in || 300) - 30) * 1000 });
        return String(j.access_token);
    })().finally(() => { tokenInCorso.delete(k); });
    tokenInCorso.set(k, p);
    return p;
}

/** Butta via il token di una credenziale: si usa quando PayStore risponde 401,
 *  che di solito vuol dire token revocato prima della scadenza. */
export const scordaToken = (clientId: string) => { token.delete(clientId); };

/** La canonical string: otto righe separate da LF, senza newline finale. */
export function canonica(p: {
    metodo: string; pathEQuery: string; clientId: string;
    timestamp: number | string; nonce: string; idempotencyKey?: string; body?: string;
}): string {
    return [
        "PS-HMAC-SHA256",
        p.metodo.toUpperCase(),
        p.pathEQuery,
        p.clientId,
        String(p.timestamp),
        p.nonce,
        p.idempotencyKey || "",                     // la riga resta anche vuota
        createHash("sha256").update(p.body ?? "", "utf8").digest("hex"),
    ].join("\n");
}

export function firma(chiaveB64: string, stringaCanonica: string): string {
    // i 32 byte DECODIFICATI, non i caratteri del Base64
    return "v1=" + createHmac("sha256", Buffer.from(chiaveB64, "base64")).update(stringaCanonica, "utf8").digest("base64");
}

/** Il vettore di prova del manuale. Se passa, la firma è giusta. */
export function provaFirma(): { ok: boolean; ottenuta: string; attesa: string } {
    const attesa = "v1=hSi8Pr2jBPEkNq341QoFi62Je4cv1H+h4E/CJnL+6fg=";
    const ottenuta = firma("cGF5c3RvcmUtcGFydG5lci1zaWduaW5nLWtleS0wMDE=", canonica({
        metodo: "POST", pathEQuery: "/api/partner/v1/recharges/phone",
        clientId: "ps_test_EXAMPLE0123456789ab", timestamp: 1756636800,
        nonce: "9f2c1e0a7b4d43f1a0c9e2b7d31f8a64",
        idempotencyKey: "6f1a0b2c-6f0e-4f3a-9a4b-2d5e8c1f7a90",
        body: '{"priceListId":123,"phoneNumber":"3331234567","externalReference":"GEST-0001"}',
    }));
    return { ok: ottenuta === attesa, ottenuta, attesa };
}

/* Quali errori sono DEFINITIVI e quali no. È la distinzione che conta più di
   tutte: su un 422 la ricarica non avverrà mai e ritentare è solo un modo per
   sporcare il registro; su un 503 o un errore di rete l'esito è IGNOTO — la
   ricarica potrebbe essere partita — e va ritentato con la stessa
   Idempotency-Key, o riconciliato con GET /operations/{id}. */
const DEFINITIVI = new Set([400, 401, 403, 404, 422]);

async function chiama<T>(metodo: string, percorso: string, opts?: { body?: unknown; idempotencyKey?: string; cred?: Credenziale | null; giaRiprovato?: boolean }): Promise<EsitoPs<T>> {
    /* ⚠️ SE LA CREDENZIALE DEL NEGOZIO NON C'È, NON SI RIPIEGA IN SILENZIO SU
       UN'ALTRA. Ripiegare vorrebbe dire addebitare il credito di un punto
       vendita diverso: si ferma tutto e lo si dice. Il ripiego sull'ambiente
       resta solo per le letture di catalogo, dove non si muove denaro, e lo
       decide chi chiama passando `cred` esplicito. */
    const c = opts?.cred ?? credenzialeAmbiente();
    if (!c) return { ok: false, stato: 0, errore: "non_configurato", descrizione: "Mancano le credenziali PayStore", definitivo: true };
    const { clientId: CLIENT_ID, signingKey: SIGNING_KEY } = c;
    const base = baseDi(c);
    const pathEQuery = pathDi(base) + percorso;
    /* ⚠️ il corpo si serializza UNA volta sola e da qui in poi è quella
       stringa: si firma quella e si spedisce quella */
    const body = opts?.body !== undefined ? JSON.stringify(opts.body) : undefined;
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(16).toString("hex");   // 32 caratteri, mai riusato

    let tk: string;
    try { tk = await accessToken(c); }
    catch (e) {
        /* ⚠️ SE IL TOKEN NON ARRIVA, LA RICARICA NON È PARTITA. Era classificato
           «esito ignoto», cioè «potrebbe essere partita»: ma a /recharges/phone
           non ci si è nemmeno arrivati. Risultato: sulla riga finiva un avviso
           allarmante e falso, e nel motore la corsa si fermava — un banale
           segreto sbagliato bloccava tutta la coda facendo credere a chissà
           quali ricariche in volo. */
        return { ok: false, stato: 401, errore: "token", descrizione: String((e as Error).message) + " — la ricarica NON è partita", definitivo: true };
    }

    const headers: Record<string, string> = {
        Authorization: "Bearer " + tk,
        "X-PS-Client-Id": CLIENT_ID,
        "X-PS-Timestamp": String(timestamp),
        "X-PS-Nonce": nonce,
        "X-PS-Signature": firma(SIGNING_KEY, canonica({ metodo, pathEQuery, clientId: CLIENT_ID, timestamp, nonce, idempotencyKey: opts?.idempotencyKey, body })),
    };
    if (opts?.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let r: Response;
    try {
        r = await fetch(base + percorso, { method: metodo, headers, body, signal: AbortSignal.timeout(45000) });
    } catch (e) {
        /* rete caduta o timeout: l'esito è IGNOTO, non fallito. Chi chiama
           deve riconciliare, non dare per scontato che non sia partita. */
        return { ok: false, stato: 0, errore: "rete", descrizione: String((e as Error)?.message || e), definitivo: false };
    }

    const testo = await r.text();
    let j: unknown = null;
    try { j = testo ? JSON.parse(testo) : null; } catch { /* PDF o risposta non JSON */ }

    if (r.ok) return { ok: true, dati: j as T, replay: r.headers.get("Idempotent-Replay") === "true" };

    /* ⚠️ UN 401 PUÒ ESSERE SOLO UN TOKEN REVOCATO. Il token dura 300 secondi e
       lo teniamo in memoria: se PayStore lo invalida prima (rotazione, riavvio
       dalla loro parte) tutte le ricariche di quel negozio fallirebbero finché
       non scade da solo. Si butta via e si riprova UNA volta, con la STESSA
       Idempotency-Key — quindi senza rischio di erogare due crediti. */
    if (r.status === 401 && !opts?.giaRiprovato) {
        scordaToken(CLIENT_ID);
        return chiama<T>(metodo, percorso, { ...opts, cred: c, giaRiprovato: true });
    }

    const e = (j || {}) as { error?: string; error_description?: string; correlationId?: string; correlation_id?: string };
    return {
        ok: false, stato: r.status,
        errore: e.error || `http_${r.status}`,
        descrizione: e.error_description,
        correlationId: e.correlationId || e.correlation_id,
        definitivo: DEFINITIVI.has(r.status),
    };
}

/* ─── GLI ENDPOINT ────────────────────────────────────────────────────── */
export type Servizio = { serviceId: number; name: string | null };
export type Prodotto = { productId: number; serviceId: number; name: string | null };
export type Listino = { priceListId: number; productId: number; serviceId: number; name: string | null; faceAmount: number; chargedAmount: number };
export type Saldo = { customerId: number; balance: number; wallet: string | null; currency: string | null; asOfUtc: string };
export type Ricarica = {
    status: string | null; operationId: number; externalReference: string | null;
    faceAmount: number; chargedAmount: number; balanceAfter: number;
    receiptId: string | null; operationDateUtc: string;
    pin?: { pin: string; serial: string; validTo: string } | null;
};
export type Operazione = Ricarica & { serviceId: number; priceListId: number; transactionCode: string | null; transactionText: string | null; phoneNumber: string | null };

/* ⚠️ ANCHE LE LETTURE VOGLIONO LA CREDENZIALE GIUSTA. Il saldo è il plafond
   DI QUEL NEGOZIO, e i listini possono essere diversi da cliente a cliente —
   lo dice il loro manuale. Chiedere il catalogo con la credenziale di un altro
   punto vendita restituisce numeri che sembrano giusti e non lo sono. */
export const saldo = (cred?: Credenziale | null) => chiama<Saldo>("GET", "/account/balance", { cred });
export const servizi = (cred?: Credenziale | null) => chiama<Servizio[]>("GET", "/catalog/services", { cred });
export const prodotti = (serviceId: number, cred?: Credenziale | null) => chiama<Prodotto[]>("GET", `/catalog/products?serviceId=${serviceId}`, { cred });
export const listini = (productId: number, cred?: Credenziale | null) => chiama<Listino[]>("GET", `/catalog/pricelists?productId=${productId}`, { cred });
export const operazione = (operationId: number, cred?: Credenziale | null) => chiama<Operazione>("GET", `/operations/${operationId}`, { cred });

/** Fa partire una ricarica telefonica.
 *
 *  ⚠️ `idempotencyKey` NON si genera qui: la deve dare chi chiama, e deve
 *  essere la STESSA a ogni ritentativo — anche dopo un riavvio del server.
 *  Per questo si salva insieme alla riga della ricarica, prima di partire:
 *  è l'unica cosa che impedisce di ricaricare due volte lo stesso numero
 *  quando una risposta si perde per strada. */
export function ricaricaTelefonica(p: { priceListId: number; phoneNumber: string; externalReference?: string; idempotencyKey: string; cred: Credenziale }) {
    return chiama<Ricarica>("POST", "/recharges/phone", {
        body: { priceListId: p.priceListId, phoneNumber: p.phoneNumber, ...(p.externalReference ? { externalReference: p.externalReference } : {}) },
        idempotencyKey: p.idempotencyKey, cred: p.cred,
    });
}

/** Una chiave di idempotenza nuova, da salvare insieme alla ricarica. */
export const nuovaChiaveIdempotenza = () => randomUUID();

/* ═══ RILEGGERE UNA RICARICA DALLA VENDITA ══════════════════════════════════
   Luca, 01/09 a negozi aperti: «al netto dell'API, io devo vedere TUTTE le
   ricariche che vengono scontrinate».

   La fonte certa di cosa è stato scontrinato è `contracts`: quella riga si
   scrive nella stessa operazione della vendita. Il registro delle ricariche è
   una scrittura in più, e una scrittura in più può fallire — è successo il
   primo giorno, per un tipo di colonna sbagliato, e il registro è rimasto
   vuoto mentre i negozi vendevano.

   Da qui in poi il registro si RIPARA da solo: quello che risulta
   scontrinato e non ha una riga, la riga se la prende. */

/** Gli operatori come li scrive `descrizioneRicarica`, dal più lungo al più
 *  corto: «TIM» è dentro «OPTIMA», e cercare prima il corto sbaglierebbe. */
export const NOMI_OPERATORE: [string, string][] = [
    ["FASTWEB MOBILE", "fastweb"], ["TISCALI MOBILE", "tiscali"], ["OPTIMA MOBILE", "optima"],
    ["WITHU MOBILE", "withu"], ["DAILY TELECOM", "daily"], ["KENA MOBILE", "kena"],
    ["VERY MOBILE", "very"], ["HO. MOBILE", "ho"], ["POSTEMOBILE", "poste"],
    ["LYCAMOBILE", "lyca"], ["DIGI MOBIL", "digi"], ["COOPVOCE", "coopvoce"],
    ["WINDTRE", "windtre"], ["VODAFONE", "vodafone"], ["1MOBILE", "unomobile"],
    ["ILIAD", "iliad"], ["SPUSU", "spusu"], ["TIM", "tim"],
];

/** Legge operatore, importo e numero dalla descrizione di una vendita.
 *  Restituisce null se non è una ricarica — «Ricarica in modo sicuro e
 *  veloce…» è un caricatore da muro, e deve restare fuori. */
export function leggiRicaricaDaProdotto(prodotto: string | null | undefined):
    { operatore: string; operatoreNome: string; importo: number; numero: string } | null {
    const s = String(prodotto || "").trim();
    const fatta = (nome: string, imp: string, num: string, esatto: boolean) => {
        const N = nome.toUpperCase().trim();
        const op = NOMI_OPERATORE.find(([n]) => N === n) || (esatto ? null : NOMI_OPERATORE.find(([n]) => N.startsWith(n)));
        return op ? { operatore: op[1], operatoreNome: op[0], importo: Number(String(imp).replace(",", ".")), numero: num } : null;
    };
    const m = s.match(/^RICARICA\s+(.+?)\s+([\d.,]+)\s+(\d{7,11})$/i);
    if (m) return fatta(m[1], m[2], m[3], false);
    /* ⚠️ SENZA IL PREFISSO. A 38 caratteri la parola «RICARICA» non ci sta
       sempre — «FASTWEB MOBILE 100 12345678901» è una ricarica da cento euro
       — e senza questo ramo quelle righe non si riconoscerebbero. Qui il
       nome deve combaciare ESATTAMENTE con un operatore: un prodotto
       qualunque seguito da due numeri non deve diventare una ricarica. */
    const m2 = s.match(/^(.+?)\s+([\d.,]+)\s+(\d{7,11})$/);
    return m2 ? fatta(m2[1], m2[2], m2[3], true) : null;
}

/** È una voce di catalogo PayStore venduta SENZA passare dal pannello — cioè
 *  senza numero. Va vista lo stesso: il cliente ha pagato e quel credito
 *  qualcuno lo deve caricare, ma nessuno sa su quale numero. */
export function eRicaricaSenzaNumero(prodotto: string | null | undefined): string | null {
    const s = String(prodotto || "").trim();
    const m = s.match(/^Ricarica\s+(.+)$/);
    if (!m || leggiRicaricaDaProdotto(s)) return null;
    const nome = m[1].toUpperCase().trim();
    const op = NOMI_OPERATORE.find(([n]) => nome === n);
    return op ? op[1] : null;
}

/** Il nome leggibile di un operatore, per le righe recuperate dove abbiamo
 *  solo il codice. */
export const nomeOperatoreCorto = (id: string) =>
    (NOMI_OPERATORE.find(([, k]) => k === id) || [])[0] || id;

/* ═══ GLI STATI DI UNA RICARICA, IN UN POSTO SOLO ═══════════════════════════
   ⚠️ Stavano scritti due volte — nella schermata e nella rotta che li
   salva — e il 02/09 ho cambiato i nomi in una sola: la rotta rispondeva
   «stato non valido» a ogni clic, e la schermata non lo diceva nemmeno.
   Da qui in poi la lista è questa, e la usano entrambe. */
export const STATI_RICARICA = ["sospeso", "ok_automatico", "ok_manuale", "fallita", "annullata"] as const;
export type StatoRicarica = typeof STATI_RICARICA[number];
export const eStatoValido = (s: unknown): s is StatoRicarica =>
    typeof s === "string" && (STATI_RICARICA as readonly string[]).includes(s);
