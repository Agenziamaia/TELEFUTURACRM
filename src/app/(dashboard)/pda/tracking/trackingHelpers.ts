import { sameStore } from "@/lib/visibleStores";
import {
  CATEGORIE,
  STATI_NEGOZIO,
  STATI_NEGOZIO_MNP,
  STATI_NEGOZIO_FISSO,
  STATI_NEGOZIO_FINANZIAMENTO,
  STATI_NEGOZIO_PIVA,
  STATI_NEGOZIO_ENERGIA,
  STATI_NEGOZIO_SKY,
  STATI_ADMIN,
  STATI_ADMIN_FINANZIAMENTO,
  type StoriaEvent,
  type TrackingRow,
} from "./trackingConstants";

// Working days (Mon–Sat) from date to today. Accepts DD/MM/YYYY or ISO YYYY-MM-DD.
function parseRuleDate(dataStr: string): Date | null {
  if (!dataStr || !dataStr.trim()) return null;
  const s = dataStr.trim();
  const slashParts = s.split("/");
  const dashParts = s.split("-");
  let day: number, month: number, year: number;
  if (slashParts.length === 3) {
    day = parseInt(slashParts[0], 10);
    month = parseInt(slashParts[1], 10) - 1;
    year = parseInt(slashParts[2], 10);
  } else if (dashParts.length === 3 && dashParts[0].length === 4) {
    year = parseInt(dashParts[0], 10);
    month = parseInt(dashParts[1], 10) - 1;
    day = parseInt(dashParts[2], 10);
  } else if (s.includes("T")) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d;
  } else {
    return null;
  }
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  const from = new Date(year, month, day);
  if (isNaN(from.getTime())) return null;
  return from;
}

/* ── CALENDARIO CHIUSURE (Luca 11/08) ──
   La domenica non conta già; qui si aggiungono i FESTIVI (giorni_festivi,
   globali) e le CHIUSURE STRAORDINARIE per negozio (chiusure_negozio,
   Amministrazione → Orari & Chiusure): nei giorni in cui il negozio della
   pratica è CHIUSO, warning e malus NON corrono — la pratica arriva al
   massimo a ⚡ Da lavorare (che segue il calendario naturale) e alla
   riapertura il countdown riparte da dov'era. Registro impostato dalla
   pagina; vuoto = comportamento storico (solo lun-sab). */
let FESTIVI: Set<string> | null = null;
let CHIUSURE: { store: string; dal: string; al: string }[] | null = null;
// negozi OPERATIVI la domenica (stores.domenica_aperta, Luca 11/08): per loro
// la domenica conta come giorno aperto — niente assunzione lun-sab per tutti
let DOMENICALI: string[] | null = null;
export function impostaCalendarioChiusure(
  festivi: { giorno: string }[] | null | undefined,
  chiusure: { store: string; dal: string; al: string }[] | null | undefined,
  domenicali?: string[] | null,
) {
  FESTIVI = festivi?.length ? new Set(festivi.map((f) => String(f.giorno).slice(0, 10))) : null;
  CHIUSURE = chiusure?.length ? chiusure : null;
  DOMENICALI = domenicali?.length ? domenicali : null;
}
const _ymd = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
};
// FERIE DEL RESPONSABILE (Luca 13/08, mondo agenzia): le pratiche degli
// agenti sono in carico al back office, che non lavora come un negozio e non
// ha deleghe — nei giorni di ferie del BO warning e malus NON avanzano.
// La mappa è keyed sul VENDITORE della riga (nome agente) → periodi di
// ferie approvate del suo back office.
let FERIE_RESP: Record<string, { dal: string; al: string }[]> | null = null;
export function impostaFerieResponsabili(m: Record<string, { dal: string; al: string }[]> | null | undefined) {
  FERIE_RESP = m && Object.keys(m).length ? m : null;
}
function inFerieResp(d: Date, venditore?: string): boolean {
  if (!venditore || !FERIE_RESP) return false;
  const periodi = FERIE_RESP[venditore];
  if (!periodi?.length) return false;
  const ymd = _ymd(d);
  return periodi.some((p) => ymd >= p.dal && ymd <= p.al);
}
// FERIE PERSONALI DEL VENDITORE (Luca 21/08): come una chiusura di negozio
// ma per la SINGOLA persona — nei giorni di ferie approvate della persona le
// SUE pratiche congelano warning e malus (il resto del negozio continua a
// correre). Mappa full_name → periodi approvati (vacation_requests).
let FERIE_VENDITORI: Record<string, { dal: string; al: string }[]> | null = null;
export function impostaFerieVenditori(m: Record<string, { dal: string; al: string }[]> | null | undefined) {
  FERIE_VENDITORI = m && Object.keys(m).length ? m : null;
}
function inFerieVenditore(d: Date, venditore?: string): boolean {
  if (!venditore || !FERIE_VENDITORI) return false;
  const periodi = FERIE_VENDITORI[venditore];
  if (!periodi?.length) return false;
  const ymd = _ymd(d);
  return periodi.some((p) => ymd >= p.dal && ymd <= p.al);
}
function giornoChiuso(d: Date, negozio?: string): boolean {
  if (d.getDay() === 0) {
    const apertoDomenica = !!negozio && !!DOMENICALI?.some((s) => sameStore(s, negozio));
    if (!apertoDomenica) return true;
  }
  const ymd = _ymd(d);
  if (FESTIVI?.has(ymd)) return true;
  if (negozio && CHIUSURE) {
    return CHIUSURE.some((c) => sameStore(c.store, negozio) && ymd >= String(c.dal).slice(0, 10) && ymd <= String(c.al).slice(0, 10));
  }
  return false;
}
/** Giorni col negozio APERTO (domeniche incluse se il negozio è domenicale,
 *  meno festivi e chiusure straordinarie). */
export function giorniApertiDa(dataStrIta: string, negozio?: string, venditore?: string): number {
  const from = parseRuleDate(dataStrIta);
  if (!from) return 0;
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  from.setHours(0, 0, 0, 0);
  let count = 0;
  const cur = new Date(from);
  while (cur < to) {
    cur.setDate(cur.getDate() + 1);
    // ferie del responsabile (BO agenzia) = giorno congelato per la pratica
    if (!giornoChiuso(cur, negozio) && !inFerieResp(cur, venditore) && !inFerieVenditore(cur, venditore)) count++;
  }
  return count;
}

/** Giorni APERTI tra due date — conta i giorni dopo `a` fino a `b`, sullo
 *  stesso calendario di giorniApertiDa (domeniche non domenicali, festivi,
 *  chiusure del negozio e ferie del BO esclusi). Serve alla ricostruzione
 *  degli episodi malus: i segmenti PASSATI misuravano coi lavorativi di
 *  calendario e al primo tocco della pratica il congelamento evaporava
 *  retroattivamente (bug segnalato da Luca 19/08, caso riaperture). */
export function apertiTra(a: Date, b: Date, negozio?: string, venditore?: string): number {
  const cur = new Date(a);
  cur.setHours(0, 0, 0, 0);
  const to = new Date(b);
  to.setHours(0, 0, 0, 0);
  let count = 0;
  while (cur < to) {
    cur.setDate(cur.getDate() + 1);
    if (!giornoChiuso(cur, negozio) && !inFerieResp(cur, venditore) && !inFerieVenditore(cur, venditore)) count++;
  }
  return count;
}

/** Avanza di n giorni APERTI (gemello di addLavorativi sul calendario aperto). */
export function addAperti(d: Date, n: number, negozio?: string, venditore?: string): Date {
  const cur = new Date(d);
  cur.setHours(0, 0, 0, 0);
  let k = 0;
  while (k < n) {
    cur.setDate(cur.getDate() + 1);
    if (!giornoChiuso(cur, negozio) && !inFerieResp(cur, venditore) && !inFerieVenditore(cur, venditore)) k++;
  }
  return cur;
}

export function giorniLavorativiDa(dataStrIta: string): number {
  const from = parseRuleDate(dataStrIta);
  if (!from) return 0;
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  from.setHours(0, 0, 0, 0);
  let count = 0;
  const cur = new Date(from);
  while (cur < to) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getDay();
    if (dow !== 0) count++;
  }
  return count;
}

/** ULTIMO evento con data valida (caso Becattini, 11/08): gli eventi di
 *  MODIFICA CONTRATTO scritti da Ricerca Vendite hanno un formato diverso
 *  ({campo, da, a, at}) SENZA `data` — leggendo l'ultimo evento a prescindere
 *  il contatore trovava una data non parsabile e restava a 0 per sempre (la
 *  pratica non entrava mai in Da lavorare/Warning/Malus). Quegli eventi non
 *  sono lavorazioni del Tracking e NON azzerano il contatore. */
function ultimoEventoDatato(storia: StoriaEvent[] | null | undefined): StoriaEvent | null {
  if (!storia) return null;
  for (let i = storia.length - 1; i >= 0; i--) {
    if (parseRuleDate(String(storia[i]?.data || ""))) return storia[i];
  }
  return null;
}

/** ggAgg = working days since last storia event (DevSpec §5). Empty storia → 999. */
export function giorniDaUltimoAggiornamento(storia: StoriaEvent[], dataInserimento?: string): number {
  // Segnalazione 25: senza storico questa funzione restituiva 999 giorni. Una
  // pratica registrata oggi, che non ha ancora nessun evento, entrava subito in
  // malus con (999 - soglia + 1) * importo: 4.970 EUR per una MNP, 9.850 EUR per
  // un fisso. Sono esattamente i "5000/10000 EUR" segnalati.
  // Senza storico il conteggio parte dalla data di inserimento della pratica;
  // se manca anche quella non si puo' dedurre nulla e il malus resta a zero.
  const ultimo = ultimoEventoDatato(storia);
  if (!ultimo) {
    return dataInserimento ? giorniLavorativiDa(dataInserimento) : 0;
  }
  return giorniLavorativiDa(ultimo.data);
}

const TUTTI_STATI_NEGOZIO = [
  ...STATI_NEGOZIO,
  ...STATI_NEGOZIO_MNP,
  ...STATI_NEGOZIO_FISSO,
  ...STATI_NEGOZIO_FINANZIAMENTO,
  ...STATI_NEGOZIO_PIVA,
  ...STATI_NEGOZIO_ENERGIA,
  ...STATI_NEGOZIO_SKY,
];

/* ── ESITI AMMINISTRABILI (tabella tracking_esiti, MOD-28 Luca 10/08) ──
   Con la tabella popolata vincono le righe a DB: etichette, colori, ordine,
   voci spente e flag "completata" (fine processo). Le liste hardcoded restano
   i DEFAULT (tabella vuota/mancante) e il vocabolario STORICO: getStatoN e la
   ricostruzione malus le usano come fallback per chiavi/etichette vecchie. */
export interface EsitoTracking {
  categoria: string; chiave: string; etichetta: string;
  colore: string; bg: string; ordine: number; attiva: boolean; completata: boolean;
  // €/GIORNO lavorativo quando la pratica sta in QUESTO esito admin (10/08):
  // usato per il malus da "Non Conforme", configurabile per categoria
  malus_giorno?: number | null;
  // MALUS UNA TANTUM dell'esito admin (Luca 25/08: «Non Conforme genera un
  // malus definitivo e poi un giornaliero finché non viene gestita»)
  malus_fisso?: number | null;
  // decorrenza dei € dell'esito (lezione incidente sky, stesso giorno): i
  // valori impostati oggi valgono solo in avanti — mai conteggi sul passato
  malus_decorrenza?: string | null;
  // 'negozio' (default) | 'admin' — esiti della verifica amministrativa
  // (segnalazione Luca 10/08: anche l'amministrativo ha esiti per categoria,
  // col flag "definitiva" che chiude il cerchio della pratica)
  lato?: string | null;
  // OPERATORE (Luca 10/08): NULL = lista generale della categoria; valorizzato
  // (es. 'windtre') = lista specifica che, se esiste, VINCE per quel brand.
  // Pensato per il fisso, dove gli esiti cambiano da operatore a operatore.
  brand?: string | null;
}
/** chiave-mappa: "fisso" (generale) oppure "fisso§windtre" (per operatore) */
export const brandEsitiKey = (b: string | null | undefined) =>
  String(b || "").trim().toLowerCase().replace(/\s+/g, "");
const _kb = (categoria: string, brand?: string | null) => {
  const b = brandEsitiKey(brand);
  return b ? categoria + "§" + b : categoria;
};
/** lista per categoria+brand: prima la lista dell'operatore, poi la generale */
const _lista = (map: Map<string, EsitoTracking[]> | null, categoria: string, brand?: string | null) => {
  if (!map) return undefined;
  if (brandEsitiKey(brand)) { const b = map.get(_kb(categoria, brand)); if (b && b.length) return b; }
  return map.get(categoria);
};
let ESITI_DB: Map<string, EsitoTracking[]> | null = null;
let ESITI_ADMIN_DB: Map<string, EsitoTracking[]> | null = null;
export function impostaEsitiTracking(rows: EsitoTracking[] | null | undefined) {
  if (!rows || !rows.length) { ESITI_DB = null; ESITI_ADMIN_DB = null; return; }
  const m = new Map<string, EsitoTracking[]>();
  const ma = new Map<string, EsitoTracking[]>();
  [...rows].sort((a, b) => a.ordine - b.ordine).forEach((r) => {
    const dest = r.lato === "admin" ? ma : m;
    const k = _kb(r.categoria, r.brand);
    const l = dest.get(k) || [];
    l.push(r);
    dest.set(k, l);
  });
  ESITI_DB = m.size ? m : null;
  ESITI_ADMIN_DB = ma.size ? ma : null;
}
const daEsito = (e: EsitoTracking) => ({ id: e.chiave, label: e.etichetta, color: e.colore, bg: e.bg });

/** Risoluzione chiave→badge. Con categoria (e brand) si cerca PRIMA nella
 *  lista giusta: dal pannello la stessa chiave puo' avere etichette diverse
 *  per categoria (es. `attivato` = "Completata" MNP / "Attivo" fisso /
 *  "Fornitura Attiva" energia) e lo scan globale ne pescherebbe una a caso. */
export function getStatoN(id: string, categoria?: string, brand?: string | null) {
  if (ESITI_DB) {
    if (categoria) {
      const mia = _lista(ESITI_DB, categoria, brand);
      const hit = mia?.find((e) => e.chiave === id);
      if (hit) return daEsito(hit);
      if (brandEsitiKey(brand)) {
        const gen = ESITI_DB.get(categoria)?.find((e) => e.chiave === id);
        if (gen) return daEsito(gen);
      }
    }
    for (const lista of ESITI_DB.values()) {
      const hit = lista.find((e) => e.chiave === id);
      if (hit) return daEsito(hit);
    }
  }
  if (categoria) {
    const s = getStatiNegozioBase(categoria).find((x) => x.id === id);
    if (s) return s;
  }
  const s = TUTTI_STATI_NEGOZIO.find((x) => x.id === id);
  return s || STATI_NEGOZIO[0];
}

/** VOCABOLARIO etichetta→chiave per la ricostruzione dello storico
 *  (malusStorico): unisce le liste hardcoded storiche e TUTTE le righe DB
 *  della categoria — generale e ogni operatore, spente comprese — perche'
 *  gli eventi persistono l'etichetta in chiaro e devono restare risolvibili
 *  dopo rinomine e personalizzazioni per brand. La lista dell'operatore
 *  della pratica vince sulle omonimie. */
export function vocabolarioEtichette(categoria: string, brand?: string | null): Map<string, string> {
  const out = new Map<string, string>();
  getStatiNegozioBase(categoria).forEach((s) => out.set(s.label.toLowerCase(), s.id));
  if (ESITI_DB) {
    for (const [k, lista] of ESITI_DB) {
      if (k !== categoria && !k.startsWith(categoria + "§")) continue;
      lista.forEach((e) => out.set(e.etichetta.toLowerCase(), e.chiave));
    }
    _lista(ESITI_DB, categoria, brand)?.forEach((e) => out.set(e.etichetta.toLowerCase(), e.chiave));
  }
  return out;
}

/** Lista hardcoded storica: fallback + vocabolario per le etichette vecchie. */
export function getStatiNegozioBase(categoria: string) {
  if (categoria === "mnp") return STATI_NEGOZIO_MNP;
  if (categoria === "fisso") return STATI_NEGOZIO_FISSO;
  if (categoria === "finanziamento") return STATI_NEGOZIO_FINANZIAMENTO;
  if (categoria === "piva") return STATI_NEGOZIO_PIVA;
  if (categoria === "energia") return STATI_NEGOZIO_ENERGIA;
  if (categoria === "sky") return STATI_NEGOZIO_SKY;
  return STATI_NEGOZIO;
}

export function getStatiNegozioPerCategoria(categoria: string, brand?: string | null) {
  const db = _lista(ESITI_DB, categoria, brand);
  if (db) return db.filter((e) => e.attiva).map(daEsito);
  return getStatiNegozioBase(categoria);
}

/** TUTTE le chiavi della categoria (generale + ogni operatore, senza doppioni):
 *  serve ai pool dei filtri, che devono conoscere anche gli esiti per-brand. */
export function getStatiNegozioTutte(categoria: string) {
  if (!ESITI_DB) return getStatiNegozioBase(categoria);
  const out: { id: string; label: string; color: string; bg: string }[] = [];
  const visti = new Set<string>();
  for (const [k, lista] of ESITI_DB) {
    if (k !== categoria && !k.startsWith(categoria + "§")) continue;
    lista.forEach((e) => { if (e.attiva && !visti.has(e.chiave)) { visti.add(e.chiave); out.push(daEsito(e)); } });
  }
  return out.length ? out : getStatiNegozioBase(categoria);
}

/** Esito "fine processo" (flag amministrabile): pilota il filtro Mostra
 *  completate, la coda di verifica amministrazione e lo stop del malus. */
export function esitoCompletato(statoNegozio: string, categoria: string, brand?: string | null): boolean {
  const db = _lista(ESITI_DB, categoria, brand);
  if (db) {
    const hit = db.find((e) => e.chiave === statoNegozio);
    if (hit) return hit.completata;
    // chiave non censita nella lista dell'operatore: prova la generale
    if (brandEsitiKey(brand)) {
      const gen = ESITI_DB?.get(categoria)?.find((e) => e.chiave === statoNegozio);
      if (gen) return gen.completata;
    }
    // chiave storica non piu' censita per la categoria: vale il default storico
  }
  return (STATI_COMPLETATI[categoria] || ["attivato"]).includes(statoNegozio);
}

export function getStatoA(id: string) {
  if (ESITI_ADMIN_DB) {
    for (const lista of ESITI_ADMIN_DB.values()) {
      const hit = lista.find((e) => e.chiave === id);
      if (hit) return daEsito(hit);
    }
  }
  // fallback: il set finanziamento e' il SUPERSET (fix: prima ripagato/
  // stornato_da_ripagare cadevano sul default "Da Verificare")
  const s = STATI_ADMIN_FINANZIAMENTO.find((x) => x.id === id);
  return s || STATI_ADMIN[0];
}

/** Esiti della VERIFICA AMMINISTRATIVA per categoria (DB, fallback hardcoded). */
export function getStatiAdminPerCategoria(categoria: string, brand?: string | null) {
  const db = _lista(ESITI_ADMIN_DB, categoria, brand);
  if (db) return db.filter((e) => e.attiva).map(daEsito);
  return categoria === "finanziamento" ? STATI_ADMIN_FINANZIAMENTO : STATI_ADMIN;
}

/** MALUS €/gg dell'esito ADMIN corrente (es. Non Conforme): dal pannello,
 *  per categoria. NULL/0 = nessun malus amministrativo. */
export function malusAdminGiorno(statoAdmin: string, categoria: string, brand?: string | null): number {
  const v = Number(_esitoAdmin(statoAdmin, categoria, brand)?.malus_giorno);
  return isFinite(v) && v > 0 ? v : 0;
}

/** L'esito admin corrente dalle liste amministrabili (brand-specifica → generale). */
function _esitoAdmin(statoAdmin: string, categoria: string, brand?: string | null): EsitoTracking | undefined {
  const db = _lista(ESITI_ADMIN_DB, categoria, brand);
  return db?.find((e) => e.chiave === statoAdmin)
    || (brandEsitiKey(brand) ? ESITI_ADMIN_DB?.get(categoria)?.find((e) => e.chiave === statoAdmin) : undefined);
}

/** MALUS UNA TANTUM dell'esito ADMIN (Luca 25/08: «Non Conforme genera un
 *  malus definitivo e poi un giornaliero finché non viene gestita»). */
export function malusAdminFisso(statoAdmin: string, categoria: string, brand?: string | null): number {
  const v = Number(_esitoAdmin(statoAdmin, categoria, brand)?.malus_fisso);
  return isFinite(v) && v > 0 ? v : 0;
}

/** Decorrenza dei € dell'esito admin (yyyy-mm-dd) o null. */
export function malusAdminDecorrenza(statoAdmin: string, categoria: string, brand?: string | null): string | null {
  const d = _esitoAdmin(statoAdmin, categoria, brand)?.malus_decorrenza;
  return d ? String(d).slice(0, 10) : null;
}

/** Data dell'ULTIMA assegnazione di esito admin nella storia (o null): è
 *  l'ancora della UNA TANTUM — l'ultimo evento qualsiasi (una nota!) non
 *  deve farla scattare (revisore 25/08). */
function dataUltimoStatoAdmin(storia: TrackingRow["storia"]): string | null {
  let out: string | null = null;
  (storia || []).forEach((ev) => { if (ev.tipo === "stato_admin" && ev.data) out = ev.data; });
  return out;
}

/** Esito admin DEFINITIVO (flag amministrabile): chiude il cerchio della
 *  pratica — esce dalla coda ⚡ Da lavorare della verifica amministrazione. */
export function esitoAdminDefinitivo(statoAdmin: string, categoria: string, brand?: string | null): boolean {
  const db = _lista(ESITI_ADMIN_DB, categoria, brand);
  if (db) {
    const hit = db.find((e) => e.chiave === statoAdmin)
      || (brandEsitiKey(brand) ? ESITI_ADMIN_DB?.get(categoria)?.find((e) => e.chiave === statoAdmin) : undefined);
    if (hit) return hit.completata;
  }
  return ["confermato", "pagato", "stornato", "ripagato"].includes(statoAdmin);
}

export function getCat(id: string) {
  const c = CATEGORIE.find((x) => x.id === id);
  if (c) return c;
  // Segnalazione 14: prima si ricadeva su CATEGORIE[0], cioe' MNP. Le categorie
  // salvate dai contratti (MOBILE, SOLUZIONI DIGITALI, MULTI-SERVIZI...) non
  // sono fra le sei previste, quindi in colonna comparivano TUTTE come "MNP".
  // Meglio mostrare la categoria reale in grigio che una sbagliata.
  const label = (id || "").trim();
  return {
    id: label || "—",
    label: label ? label.toUpperCase() : "—",
    desc: "Categoria non prevista dal tracking",
    color: "var(--tf-94a3b8)",
  };
}

export const STATI_COMPLETATI: Record<string, string[]> = {
  mnp: ["attivato", "re_inserita"],
  fisso: ["attivato"],
  finanziamento: ["liquidato"],
  piva: ["attivato"],
  energia: ["attivato"],
  sky: ["completo_sky", "attivo_sky"],
};

/**
 * Una pratica FERMA la maturazione del malus quando ha un esito DEFINITIVO:
 *   - positivo → completata / attivata (STATI_COMPLETATI, per categoria);
 *   - negativo → annullata / KO / recesso.
 * In tutti questi casi non c'e' nessun altro esito da dare, quindi la pratica
 * NON e' in malus (e nemmeno Warning / Da Lavorare). Per il lato negativo si usa
 * la stessa classificazione di Ricerca Contratto (statoContrattoDa === "Annullato"
 * = tutti gli stati "ko*" piu' "annullato"), cosi' i due mondi concordano; a
 * quella si aggiunge il recesso Sky, anch'esso definitivo.
 * (Segnalazione Lorenzo 03/08/2026: le pratiche esitate "annullato"/KO restavano
 * in 🔴 Malus all'infinito, "come se dovessimo dare un altro esito".)
 */
export function fermaMalus(statoNegozio: string, categoria: string, brand?: string | null): boolean {
  // MOD-28: la nozione di "completata" e' il flag amministrabile a DB
  // (fallback: STATI_COMPLETATI storico) — unica fonte anche per i filtri.
  if (esitoCompletato(statoNegozio, categoria, brand)) return true;
  return statoContrattoDa(statoNegozio) === "Annullato" || statoNegozio === "recesso_info_errate";
}

/* ── REGOLE AMMINISTRABILI (tabella tracking_regole, mig. 098 — Luca 29/07) ──
   Tre variabili per categoria, soglie in giorni LAVORATIVI per fascia:
     senza_* : pratica MAI aggiornata   (giorni dall'inserimento)
     succ_*  : ferma DOPO un aggiornamento (giorni dall'ultimo evento)
     compl_* : NON completata           (giorni dall'inserimento)
   NULL = quella variabile non fa scattare quella fascia. Il malus vale
   (giorni oltre soglia + 1) × malus_euro sulla variabile più "in ritardo".
   Nessuna riga a DB = questi DEFAULT, che fotografano le regole storiche.
   Le regole SPECIALI per stato (P.IVA irreperibile, stati Sky, stati
   critici delle categorie fuori tracking) restano qui sotto, fisse. */
export interface RegolaTracking {
  categoria: string;
  senza_lavorare: number | null; senza_warning: number | null; senza_malus: number | null;
  succ_lavorare: number | null;  succ_warning: number | null;  succ_malus: number | null;
  compl_lavorare: number | null; compl_warning: number | null; compl_malus: number | null;
  malus_euro: number;
  // DECORRENZA (incidente sky 25/08: la regola accesa a 8 €/g ha fatto
  // ricostruire 119 episodi RETROATTIVI da luglio): il pannello la timbra
  // sulle righe modificate — i contatori non contano MAI giorni precedenti.
  decorrenza?: string | null;
}
export const REGOLE_TRACKING_DEFAULT: RegolaTracking[] = [
  { categoria: "mnp",           senza_lavorare: 2, senza_warning: 5,  senza_malus: 6,  succ_lavorare: 2,    succ_warning: 5,  succ_malus: 6,  compl_lavorare: null, compl_warning: 5,    compl_malus: null, malus_euro: 5 },
  { categoria: "fisso",         senza_lavorare: 5, senza_warning: 10, senza_malus: 15, succ_lavorare: 5,    succ_warning: 10, succ_malus: 15, compl_lavorare: null, compl_warning: 20,   compl_malus: null, malus_euro: 10 },
  { categoria: "finanziamento", senza_lavorare: 2, senza_warning: 4,  senza_malus: 6,  succ_lavorare: 2,    succ_warning: 4,  succ_malus: 6,  compl_lavorare: null, compl_warning: null, compl_malus: null, malus_euro: 10 },
  { categoria: "piva",          senza_lavorare: 2, senza_warning: 4,  senza_malus: 6,  succ_lavorare: 2,    succ_warning: 4,  succ_malus: 6,  compl_lavorare: null, compl_warning: 10,   compl_malus: null, malus_euro: 5 },
  { categoria: "energia",       senza_lavorare: 5, senza_warning: 10, senza_malus: 15, succ_lavorare: 5,    succ_warning: 10, succ_malus: 15, compl_lavorare: null, compl_warning: null, compl_malus: null, malus_euro: 10 },
  { categoria: "sky",           senza_lavorare: 2, senza_warning: 4,  senza_malus: 4,  succ_lavorare: null, succ_warning: 10, succ_malus: 10, compl_lavorare: null, compl_warning: null, compl_malus: null, malus_euro: 5 },
];
let REGOLE_ATTIVE: Record<string, RegolaTracking> | null = null;
export function impostaRegoleTracking(rows: RegolaTracking[] | null | undefined) {
  REGOLE_ATTIVE = rows && rows.length ? Object.fromEntries(rows.map((r) => [r.categoria, r])) : null;
}
export function regolaDi(categoria: string): RegolaTracking | undefined {
  const base = REGOLE_ATTIVE ?? Object.fromEntries(REGOLE_TRACKING_DEFAULT.map((r) => [r.categoria, r]));
  return base[categoria];
}
/** Decorrenza della regola (yyyy-mm-dd) o null. */
export function decorrenzaDi(categoria: string): string | null {
  const d = regolaDi(categoria)?.decorrenza;
  return d ? String(d).slice(0, 10) : null;
}
/** La più recente tra la data della pratica/evento e la decorrenza della
 *  regola: un cambio di regole vale solo dal giorno del cambio, mai prima. */
function clampDecorrenza(dataStr: string, categoria: string): string {
  const dec = decorrenzaDi(categoria);
  if (!dec) return dataStr;
  const a = parseRuleDate(dataStr);
  const b = parseRuleDate(dec);
  if (!a || !b) return dataStr;
  return a >= b ? dataStr : dec;
}
function misure(row: TrackingRow) {
  // DECORRENZA (incidente sky 25/08): i contatori partono al più presto dal
  // giorno in cui la regola della categoria è entrata in vigore — un cambio
  // di regole non conta mai i giorni precedenti al cambio.
  const dataIns = clampDecorrenza(row.dataInserimento, row.categoria);
  const gg = giorniLavorativiDa(dataIns);
  // caso Becattini (11/08): si considera solo l'ultimo evento DATATO — gli
  // eventi di modifica contratto (senza `data`) non azzerano il contatore
  const ultimo = ultimoEventoDatato(row.storia);
  const dataUlt = ultimo ? clampDecorrenza(ultimo.data, row.categoria) : null;
  const ggUltimo = dataUlt ? giorniLavorativiDa(dataUlt) : null;
  // varianti APERTI (Luca 11/08): warning e malus corrono solo nei giorni in
  // cui il negozio della pratica era aperto (festivi e chiusure esclusi)
  const aGg = giorniApertiDa(dataIns, row.negozio, row.venditore);
  const aUltimo = dataUlt ? giorniApertiDa(dataUlt, row.negozio, row.venditore) : null;
  // RIASSEGNAZIONE (Luca 21/08): la pratica consegnata in MALUS al delegato
  // NON puo' arrivargli in malus — al massimo in WARNING. L'evento
  // "riassegnazione" (scritto solo sulle pratiche in malus alla consegna)
  // riparte i contatori GIA' alla soglia warning: il livello di oggi e'
  // Warning e il malus rimatura solo dopo (succ_malus − succ_warning)
  // giorni aperti. Appena il delegato la lavora, l'evento nuovo supera
  // questo e tutto torna al ritmo normale.
  const off = ultimo?.tipo === "riassegnazione" ? (Number(regolaDi(row.categoria)?.succ_warning) || 0) : 0;
  return {
    gg,
    ggSenza: ultimo ? null : gg,
    ggSucc: ggUltimo == null ? null : ggUltimo + off,
    ggAgg: ultimo ? (ggUltimo as number) + off : gg,
    aGg,
    aSenza: ultimo ? null : aGg,
    aSucc: aUltimo == null ? null : aUltimo + off,
    aAgg: ultimo ? (aUltimo as number) + off : aGg,
  };
}
const _hit = (soglia: number | null | undefined, valore: number | null) =>
  soglia != null && valore != null && valore >= soglia;
/** 0 = in regola · 1 = da lavorare · 2 = warning · 3 = malus */
function livelloRegole(row: TrackingRow): 0 | 1 | 2 | 3 {
  // MALUS AMMINISTRATIVO (10/08, + una tantum 25/08): se l'esito admin
  // corrente ha un €/gg o un € fisso (es. Non Conforme) la pratica e' in
  // MALUS anche se il negozio l'aveva completata
  if (malusAdminGiorno(row.statoAdmin, row.categoria, row.brand) > 0
    || malusAdminFisso(row.statoAdmin, row.categoria, row.brand) > 0) return 3;
  // Pratica con esito definitivo (completata OPPURE annullata/KO/recesso): non
  // c'e' altro esito da dare, la maturazione si ferma e la pratica esce da malus.
  if (fermaMalus(row.statoNegozio, row.categoria, row.brand)) return 0;
  const m = misure(row);
  const r = regolaDi(row.categoria);
  let speciale: 0 | 1 | 2 | 3 = 0;
  if (row.categoria === "piva") {
    if (row.statoNegozio === "cliente_irreperibile") {
      // warning/malus sul calendario APERTO del negozio (Luca 11/08)
      if (m.aAgg > 4) speciale = 3;
      else if (m.aAgg >= 2) speciale = 2;
      else speciale = 1;
    }
  } else if (row.categoria === "sky") {
    if (row.statoNegozio === "wm_sospetta") speciale = 1;
    if (row.statoNegozio === "attesa_matricola" && m.ggAgg >= 5) speciale = 1;
    if (row.statoNegozio === "aperto_sparks" && m.ggAgg >= 3) speciale = 1;
  } else if (!r) {
    const statiCritici = ["contattare_cliente", "contattare_supporto", "doc_mancante", "ricaduta", "ko_reinserito"];
    if (statiCritici.includes(row.statoNegozio)) speciale = 2;
  }
  if (!r) return speciale;
  // CHIUSURE (Luca 11/08): ⚡ Da lavorare segue il calendario NATURALE (la
  // pratica ci deve arrivare comunque); warning e malus corrono SOLO nei
  // giorni col negozio aperto — a negozio chiuso la corsa si congela.
  let lv: 0 | 1 | 2 | 3 = 0;
  if (_hit(r.senza_malus, m.aSenza) || _hit(r.succ_malus, m.aSucc) || _hit(r.compl_malus, m.aGg)) lv = 3;
  else if (_hit(r.senza_warning, m.aSenza) || _hit(r.succ_warning, m.aSucc) || _hit(r.compl_warning, m.aGg)) lv = 2;
  else if (_hit(r.senza_lavorare, m.ggSenza) || _hit(r.succ_lavorare, m.ggSucc) || _hit(r.compl_lavorare, m.gg)) lv = 1;
  return (lv >= speciale ? lv : speciale) as 0 | 1 | 2 | 3;
}

export function isAttenzioneRow(row: TrackingRow): boolean {
  return livelloRegole(row) === 2;
}

export function isDaLavorareRow(row: TrackingRow): boolean {
  return livelloRegole(row) === 1;
}

export function isMalusRow(row: TrackingRow): boolean {
  return livelloRegole(row) === 3;
}

export function calcolaMalus(row: TrackingRow): number {
  if (livelloRegole(row) !== 3) return 0;
  const m = misure(row);
  // malus AMMINISTRATIVO (Luca 25/08): € UNA TANTUM dell'esito + €/gg per
  // ogni giorno col negozio APERTO dall'ultimo aggiornamento, finché la
  // pratica non viene gestita. DECORRENZA dell'esito (lezione incidente sky,
  // stesso giorno): i € impostati oggi valgono solo in avanti — un esito dato
  // PRIMA della configurazione non paga la una tantum e il giornaliero conta
  // solo i giorni dalla configurazione in poi.
  const mAdm = malusAdminGiorno(row.statoAdmin, row.categoria, row.brand);
  const mFis = malusAdminFisso(row.statoAdmin, row.categoria, row.brand);
  if (mAdm > 0 || mFis > 0) {
    const dec2 = malusAdminDecorrenza(row.statoAdmin, row.categoria, row.brand);
    const ggDec = dec2 ? giorniApertiDa(dec2, row.negozio, row.venditore) : Number.POSITIVE_INFINITY;
    const giorni = mAdm > 0 ? Math.min(Math.max(1, m.aAgg), Math.max(0, ggDec)) : 0;
    // la UNA TANTUM si ancora all'ASSEGNAZIONE dell'esito (evento stato_admin),
    // non all'ultimo evento qualsiasi: una nota su un esito pre-configurazione
    // non deve farla scattare (revisore 25/08). Storia senza evento stato_admin
    // (pratiche d'epoca) = niente una tantum: mai retroattivi.
    const dEsito = parseRuleDate(dataUltimoStatoAdmin(row.storia) || "");
    const dDec = dec2 ? parseRuleDate(dec2) : null;
    const fisso = mFis > 0 && !!dEsito && (!dDec || dEsito >= dDec) ? mFis : 0;
    return Math.round((fisso + giorni * mAdm) * 100) / 100;
  }
  const r = regolaDi(row.categoria);
  if (!r) return 0;
  // CHIUSURE (Luca 11/08): l'eccedenza matura solo nei giorni aperti
  let ecc = 0;
  if (_hit(r.senza_malus, m.aSenza)) ecc = Math.max(ecc, (m.aSenza as number) - (r.senza_malus as number) + 1);
  if (_hit(r.succ_malus, m.aSucc)) ecc = Math.max(ecc, (m.aSucc as number) - (r.succ_malus as number) + 1);
  if (_hit(r.compl_malus, m.aGg)) ecc = Math.max(ecc, m.aGg - (r.compl_malus as number) + 1);
  if (row.categoria === "piva" && row.statoNegozio === "cliente_irreperibile" && m.aAgg > 4)
    ecc = Math.max(ecc, m.aAgg - 4);
  return ecc * (Number(r.malus_euro) || 0);
}

/**
 * Traduce lo stato di lavorazione del negozio nello `stato` del contratto, quello
 * che Ricerca Contratto mostra in colonna (segnalazioni 37 e 38).
 * Prima i due mondi non si parlavano: la pratica nasceva "Attivo" e restava
 * "Attivo" qualunque cosa succedesse nel Tracking.
 */
export function statoContrattoDa(statoNegozio: string | null | undefined): string {
    const s = (statoNegozio || "nuovo").toLowerCase();
    if (s === "attivato" || s === "re_inserita" || s === "liquidato") return "Attivo";
    if (s === "nuovo") return "Nuovo";
    if (s.startsWith("ko") || s === "annullato") return "Annullato";
    return "In lavorazione";
}

/** Una pratica e' attiva solo in questi stati: qui si popola la data di attivazione. */
export function isStatoAttivo(statoNegozio: string | null | undefined): boolean {
    return statoContrattoDa(statoNegozio) === "Attivo";
}
