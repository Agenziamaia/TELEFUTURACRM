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

const BASE = process.env.PAYSTORE_BASE_URL || "https://api-test.paystore.it/api/partner/v1";
const CLIENT_ID = process.env.PAYSTORE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.PAYSTORE_CLIENT_SECRET || "";
const SIGNING_KEY = process.env.PAYSTORE_SIGNING_KEY || "";

/** Il prefisso dice l'ambiente, e la differenza non è cosmetica: su una
 *  credenziale `ps_live_` i numeri magici del collaudo sono numeri di
 *  telefono veri, e il plafond è denaro. */
export const inCollaudo = () => CLIENT_ID.startsWith("ps_test_");
export const configurato = () => !!(CLIENT_ID && CLIENT_SECRET && SIGNING_KEY);

const PATH_BASE = (() => { try { return new URL(BASE).pathname.replace(/\/$/, ""); } catch { return "/api/partner/v1"; } })();

export type EsitoPs<T> =
    | { ok: true; dati: T; replay?: boolean }
    | { ok: false; stato: number; errore: string; descrizione?: string; correlationId?: string; definitivo: boolean };

/* ─── IL TOKEN ──────────────────────────────────────────────────────────────
   Dura 300 secondi e si riusa fino alla scadenza: chiederne uno a ogni
   chiamata satura il limite dell'endpoint (10 al minuto) e basterebbero
   dieci ricariche in un minuto per bloccare il negozio. Si rinnova 30
   secondi prima della scadenza, che è il margine per una richiesta lenta. */
let token: { valore: string; scadeIl: number } | null = null;
let tokenInCorso: Promise<string> | null = null;

async function accessToken(): Promise<string> {
    if (token && Date.now() < token.scadeIl) return token.valore;
    if (tokenInCorso) return tokenInCorso;          // due ricariche insieme = una sola richiesta
    tokenInCorso = (async () => {
        const r = await fetch(BASE + "/oauth/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.access_token) throw new Error(`token non ottenuto (${r.status}): ${j?.error || "risposta illeggibile"}`);
        token = { valore: j.access_token, scadeIl: Date.now() + Math.max(30, Number(j.expires_in || 300) - 30) * 1000 };
        return token.valore;
    })().finally(() => { tokenInCorso = null; });
    return tokenInCorso;
}

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

async function chiama<T>(metodo: string, percorso: string, opts?: { body?: unknown; idempotencyKey?: string }): Promise<EsitoPs<T>> {
    if (!configurato()) return { ok: false, stato: 0, errore: "non_configurato", descrizione: "Mancano le credenziali PayStore", definitivo: true };
    const pathEQuery = PATH_BASE + percorso;
    /* ⚠️ il corpo si serializza UNA volta sola e da qui in poi è quella
       stringa: si firma quella e si spedisce quella */
    const body = opts?.body !== undefined ? JSON.stringify(opts.body) : undefined;
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(16).toString("hex");   // 32 caratteri, mai riusato

    let tk: string;
    try { tk = await accessToken(); }
    catch (e) { return { ok: false, stato: 401, errore: "token", descrizione: String((e as Error).message), definitivo: false }; }

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
        r = await fetch(BASE + percorso, { method: metodo, headers, body, signal: AbortSignal.timeout(45000) });
    } catch (e) {
        /* rete caduta o timeout: l'esito è IGNOTO, non fallito. Chi chiama
           deve riconciliare, non dare per scontato che non sia partita. */
        return { ok: false, stato: 0, errore: "rete", descrizione: String((e as Error)?.message || e), definitivo: false };
    }

    const testo = await r.text();
    let j: unknown = null;
    try { j = testo ? JSON.parse(testo) : null; } catch { /* PDF o risposta non JSON */ }

    if (r.ok) return { ok: true, dati: j as T, replay: r.headers.get("Idempotent-Replay") === "true" };

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

export const saldo = () => chiama<Saldo>("GET", "/account/balance");
export const servizi = () => chiama<Servizio[]>("GET", "/catalog/services");
export const prodotti = (serviceId: number) => chiama<Prodotto[]>("GET", `/catalog/products?serviceId=${serviceId}`);
export const listini = (productId: number) => chiama<Listino[]>("GET", `/catalog/pricelists?productId=${productId}`);
export const operazione = (operationId: number) => chiama<Operazione>("GET", `/operations/${operationId}`);

/** Fa partire una ricarica telefonica.
 *
 *  ⚠️ `idempotencyKey` NON si genera qui: la deve dare chi chiama, e deve
 *  essere la STESSA a ogni ritentativo — anche dopo un riavvio del server.
 *  Per questo si salva insieme alla riga della ricarica, prima di partire:
 *  è l'unica cosa che impedisce di ricaricare due volte lo stesso numero
 *  quando una risposta si perde per strada. */
export function ricaricaTelefonica(p: { priceListId: number; phoneNumber: string; externalReference?: string; idempotencyKey: string }) {
    return chiama<Ricarica>("POST", "/recharges/phone", {
        body: { priceListId: p.priceListId, phoneNumber: p.phoneNumber, ...(p.externalReference ? { externalReference: p.externalReference } : {}) },
        idempotencyKey: p.idempotencyKey,
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
