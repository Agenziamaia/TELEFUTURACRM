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

/** ggAgg = working days since last storia event (DevSpec §5). Empty storia → 999. */
export function giorniDaUltimoAggiornamento(storia: StoriaEvent[], dataInserimento?: string): number {
  // Segnalazione 25: senza storico questa funzione restituiva 999 giorni. Una
  // pratica registrata oggi, che non ha ancora nessun evento, entrava subito in
  // malus con (999 - soglia + 1) * importo: 4.970 EUR per una MNP, 9.850 EUR per
  // un fisso. Sono esattamente i "5000/10000 EUR" segnalati.
  // Senza storico il conteggio parte dalla data di inserimento della pratica;
  // se manca anche quella non si puo' dedurre nulla e il malus resta a zero.
  if (!storia || storia.length === 0) {
    return dataInserimento ? giorniLavorativiDa(dataInserimento) : 0;
  }
  const ultimo = storia[storia.length - 1];
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

export function getStatoN(id: string) {
  const s = TUTTI_STATI_NEGOZIO.find((x) => x.id === id);
  return s || STATI_NEGOZIO[0];
}

export function getStatiNegozioPerCategoria(categoria: string) {
  if (categoria === "mnp") return STATI_NEGOZIO_MNP;
  if (categoria === "fisso") return STATI_NEGOZIO_FISSO;
  if (categoria === "finanziamento") return STATI_NEGOZIO_FINANZIAMENTO;
  if (categoria === "piva") return STATI_NEGOZIO_PIVA;
  if (categoria === "energia") return STATI_NEGOZIO_ENERGIA;
  if (categoria === "sky") return STATI_NEGOZIO_SKY;
  return STATI_NEGOZIO;
}

export function getStatoA(id: string) {
  const s = STATI_ADMIN.find((x) => x.id === id);
  return s || STATI_ADMIN[0];
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
    color: "#94a3b8",
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
export function fermaMalus(statoNegozio: string, categoria: string): boolean {
  const completati = STATI_COMPLETATI[categoria] || ["attivato"];
  if (completati.includes(statoNegozio)) return true;
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
function misure(row: TrackingRow) {
  const gg = giorniLavorativiDa(row.dataInserimento);
  const haStoria = !!(row.storia && row.storia.length > 0);
  const ggUltimo = haStoria ? giorniLavorativiDa(row.storia[row.storia.length - 1].data) : null;
  return {
    gg,
    ggSenza: haStoria ? null : gg,
    ggSucc: ggUltimo,
    ggAgg: haStoria ? (ggUltimo as number) : gg,
  };
}
const _hit = (soglia: number | null | undefined, valore: number | null) =>
  soglia != null && valore != null && valore >= soglia;
/** 0 = in regola · 1 = da lavorare · 2 = warning · 3 = malus */
function livelloRegole(row: TrackingRow): 0 | 1 | 2 | 3 {
  // Pratica con esito definitivo (completata OPPURE annullata/KO/recesso): non
  // c'e' altro esito da dare, la maturazione si ferma e la pratica esce da malus.
  if (fermaMalus(row.statoNegozio, row.categoria)) return 0;
  const m = misure(row);
  const r = regolaDi(row.categoria);
  let speciale: 0 | 1 | 2 | 3 = 0;
  if (row.categoria === "piva") {
    if (row.statoNegozio === "cliente_irreperibile") {
      if (m.ggAgg > 4) speciale = 3;
      else if (m.ggAgg >= 2) speciale = 2;
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
  let lv: 0 | 1 | 2 | 3 = 0;
  if (_hit(r.senza_malus, m.ggSenza) || _hit(r.succ_malus, m.ggSucc) || _hit(r.compl_malus, m.gg)) lv = 3;
  else if (_hit(r.senza_warning, m.ggSenza) || _hit(r.succ_warning, m.ggSucc) || _hit(r.compl_warning, m.gg)) lv = 2;
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
  const r = regolaDi(row.categoria);
  const m = misure(row);
  if (!r) return 0;
  let ecc = 0;
  if (_hit(r.senza_malus, m.ggSenza)) ecc = Math.max(ecc, (m.ggSenza as number) - (r.senza_malus as number) + 1);
  if (_hit(r.succ_malus, m.ggSucc)) ecc = Math.max(ecc, (m.ggSucc as number) - (r.succ_malus as number) + 1);
  if (_hit(r.compl_malus, m.gg)) ecc = Math.max(ecc, m.gg - (r.compl_malus as number) + 1);
  if (row.categoria === "piva" && row.statoNegozio === "cliente_irreperibile" && m.ggAgg > 4)
    ecc = Math.max(ecc, m.ggAgg - 4);
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
