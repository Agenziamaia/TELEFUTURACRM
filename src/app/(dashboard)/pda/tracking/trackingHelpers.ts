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
  MALUS_SOGLIE,
  MALUS_IMPORTO,
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
export function giorniDaUltimoAggiornamento(storia: StoriaEvent[]): number {
  if (!storia || storia.length === 0) return 999;
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
  return c || CATEGORIE[0];
}

const STATI_COMPLETATI: Record<string, string[]> = {
  mnp: ["attivato", "re_inserita"],
  fisso: ["attivato"],
  finanziamento: ["liquidato"],
  piva: ["attivato"],
  energia: ["attivato"],
  sky: ["completo_sky", "attivo_sky"],
};

export function isAttenzioneRow(row: TrackingRow): boolean {
  const completatiCat = STATI_COMPLETATI[row.categoria] || ["attivato"];
  if (completatiCat.includes(row.statoNegozio)) return false;
  if (isMalusRow(row)) return false;

  const gg = giorniLavorativiDa(row.dataInserimento);
  const ggAgg = giorniDaUltimoAggiornamento(row.storia);

  if (row.categoria === "mnp") {
    if (ggAgg >= 5) return true;
    if (gg >= 5 && row.statoNegozio !== "attivato" && row.statoNegozio !== "re_inserita") return true;
  } else if (row.categoria === "fisso") {
    if (ggAgg >= 10) return true;
    if (gg >= 20 && row.statoNegozio !== "attivato") return true;
  } else if (row.categoria === "finanziamento") {
    if (ggAgg >= 4) return true;
  } else if (row.categoria === "piva") {
    if (ggAgg >= 4) return true;
    if (gg >= 10 && row.statoNegozio !== "attivato") return true;
    if (row.statoNegozio === "cliente_irreperibile" && ggAgg >= 2) return true;
  } else if (row.categoria === "energia") {
    if (ggAgg >= 10) return true;
  } else if (row.categoria === "sky") {
    if (row.statoNegozio === "nuovo" && gg >= 4) return true;
    if (ggAgg >= 10) return true;
  } else {
    // Unknown / missing categoria: use MNP-like thresholds so KPIs show a distribution
    const statiCritici = ["contattare_cliente", "contattare_supporto", "doc_mancante", "ricaduta", "ko_reinserito"];
    if (statiCritici.includes(row.statoNegozio)) return true;
    if (ggAgg >= 5) return true;
    if (gg >= 5 && row.statoNegozio !== "attivato" && row.statoNegozio !== "re_inserita") return true;
  }
  return false;
}

export function isDaLavorareRow(row: TrackingRow): boolean {
  if (isAttenzioneRow(row)) return false;
  const completatiCat = STATI_COMPLETATI[row.categoria] || ["attivato"];
  if (completatiCat.includes(row.statoNegozio)) return false;

  const gg = giorniLavorativiDa(row.dataInserimento);
  const ggAgg = giorniDaUltimoAggiornamento(row.storia);

  if (row.categoria === "mnp") {
    if (ggAgg >= 2) return true;
  } else if (row.categoria === "fisso") {
    if (ggAgg >= 5) return true;
  } else if (row.categoria === "finanziamento") {
    if (ggAgg >= 2) return true;
  } else if (row.categoria === "piva") {
    if (ggAgg >= 2) return true;
    if (row.statoNegozio === "cliente_irreperibile") return true;
  } else if (row.categoria === "energia") {
    if (ggAgg >= 5) return true;
  } else if (row.categoria === "sky") {
    if (row.statoNegozio === "nuovo" && gg >= 2) return true;
    if (row.statoNegozio === "wm_sospetta") return true;
    if (row.statoNegozio === "attesa_matricola" && ggAgg >= 5) return true;
    if (row.statoNegozio === "aperto_sparks" && ggAgg >= 3) return true;
  } else {
    // Unknown / missing categoria: MNP-like — ggAgg >= 2 → Da Lavorare
    if (ggAgg >= 2) return true;
  }
  return false;
}

export function isMalusRow(row: TrackingRow): boolean {
  const completatiCat = STATI_COMPLETATI[row.categoria] || ["attivato"];
  if (completatiCat.includes(row.statoNegozio)) return false;

  const ggAgg = giorniDaUltimoAggiornamento(row.storia);

  if (row.categoria === "mnp") return ggAgg >= 6;
  if (row.categoria === "fisso") return ggAgg >= 15;
  if (row.categoria === "finanziamento") return ggAgg >= 6;
  if (row.categoria === "piva") {
    if (ggAgg >= 6) return true;
    if (row.statoNegozio === "cliente_irreperibile" && ggAgg > 4) return true;
    return false;
  }
  if (row.categoria === "energia") return ggAgg >= 15;
  if (row.categoria === "sky") {
    const gg = giorniLavorativiDa(row.dataInserimento);
    const skyWarn = (row.statoNegozio === "nuovo" && gg >= 4) || ggAgg >= 10;
    return skyWarn && ggAgg >= 2;
  }
  // Unknown / missing categoria: MNP-like — ggAgg >= 6 → Malus
  return ggAgg >= 6;
}

export function calcolaMalus(row: TrackingRow): number {
  if (!isMalusRow(row)) return 0;
  const ggAgg = giorniDaUltimoAggiornamento(row.storia);

  if (row.categoria === "piva") {
    let totale = 0;
    if (ggAgg >= 6) totale += Math.max(0, ggAgg - 6 + 1) * 5;
    if (row.statoNegozio === "cliente_irreperibile" && ggAgg > 4) {
      totale += Math.max(0, ggAgg - 4) * 5;
    }
    return totale;
  }

  // Unknown categoria: use MNP-like soglia/importo so Malus amount is shown
  const soglia = MALUS_SOGLIE[row.categoria] ?? 6;
  const importo = MALUS_IMPORTO[row.categoria] ?? 5;
  return Math.max(0, ggAgg - soglia + 1) * importo;
}
