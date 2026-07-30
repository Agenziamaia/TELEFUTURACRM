// STORICO MALUS (30/07, mig. 103). Il malus era solo un calcolo al volo su
// storia + regole: appena la pratica veniva aggiornata il maturato spariva
// (caso Magliana W3, finanziamento liquidato dopo il malus). Qui ogni periodo
// di malus diventa un EPISODIO persistito in malus_storico: quando la pratica
// viene sanata smette di maturare ma quanto generato resta archiviato.
//
// La ricostruzione e' DETERMINISTICA: la storia della pratica si divide in
// segmenti (inserimento -> primo evento -> ... -> oggi); in ogni segmento il
// contatore riparte e il malus scatta alla soglia della regola (senza_malus
// per il primo segmento, succ_malus per i successivi), maturando 1 giorno
// lavorativo alla volta dal giorno 1 incluso. L'evento successivo CHIUDE
// l'episodio congelando giorni e importo alla data dell'evento, non alla data
// in cui qualcuno apre la pagina. Cosi' il backfill ricostruisce anche i
// malus gia' "spariti" prima di questa modifica.
import { supabase } from "@/lib/supabaseClient";
import type { TrackingRow, StoriaEvent } from "./trackingConstants";
import {
  regolaDi,
  STATI_COMPLETATI,
  getStatiNegozioPerCategoria,
  isMalusRow,
  calcolaMalus,
} from "./trackingHelpers";

export type StatoEpisodio = "in_corso" | "attivo" | "compensato";

export type EpisodioMalus = {
  id: string;
  contract_id: string;
  categoria: string;
  brand: string | null;
  negozio: string | null;
  venditore: string | null;
  nominativo: string | null;
  data_inizio: string; // yyyy-mm-dd
  data_fine: string | null; // NULL = sta ancora maturando
  giorni: number;
  malus_euro: number;
  importo: number;
  stato: StatoEpisodio;
  compensato_il: string | null;
  compensato_da: string | null;
  compensato_note: string | null;
};

export type EpisodioDerivato = Pick<
  EpisodioMalus,
  | "contract_id" | "categoria" | "brand" | "negozio" | "venditore" | "nominativo"
  | "data_inizio" | "data_fine" | "giorni" | "malus_euro" | "importo" | "stato"
>;

// ── Date: stessa aritmetica di trackingHelpers (lavorativi = lun-sab) ────────
function parseData(s: string | undefined | null): Date | null {
  if (!s || !String(s).trim()) return null;
  const v = String(s).trim();
  let m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Giorni lavorativi in (a, b]: identico a giorniLavorativiDa ma con fine esplicita. */
function lavorativiTra(a: Date, b: Date): number {
  let count = 0;
  const cur = new Date(a);
  cur.setHours(0, 0, 0, 0);
  const to = new Date(b);
  to.setHours(0, 0, 0, 0);
  while (cur < to) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getDay() !== 0) count++;
  }
  return count;
}

/** Avanza di n giorni lavorativi: lavorativiTra(d, addLavorativi(d, n)) === n. */
function addLavorativi(d: Date, n: number): Date {
  const cur = new Date(d);
  cur.setHours(0, 0, 0, 0);
  let k = 0;
  while (k < n) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getDay() !== 0) k++;
  }
  return cur;
}

function subLavorativi(d: Date, n: number): Date {
  const cur = new Date(d);
  cur.setHours(0, 0, 0, 0);
  let k = 0;
  while (k < n) {
    cur.setDate(cur.getDate() - 1);
    if (cur.getDay() !== 0) k++;
  }
  return cur;
}

/**
 * Ricostruisce dagli eventi TUTTI gli episodi di malus della riga (categoria):
 * quelli passati (chiusi dall'evento che ha sanato la pratica) e quello
 * eventualmente in corso. Gli stati "completato" fermano la maturazione: si
 * seguono gli eventi stato_negozio la cui etichetta appartiene alla categoria
 * (con piu' controlli sulla stessa pratica la storia e' condivisa, ma
 * "Liquidato" non e' uno stato MNP e viene ignorato dalla riga MNP).
 */
export function ricostruisciEpisodi(row: TrackingRow): EpisodioDerivato[] {
  const r = regolaDi(row.categoria);
  const euro = Number(r?.malus_euro) || 0;
  if (!r || euro <= 0) return [];
  const completati = STATI_COMPLETATI[row.categoria] || ["attivato"];
  const labelToId = new Map(
    getStatiNegozioPerCategoria(row.categoria).map((s) => [s.label.toLowerCase(), s.id])
  );
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  const base = {
    contract_id: row.id,
    categoria: row.categoria,
    brand: row.brand || null,
    negozio: row.negozio || null,
    venditore: row.venditore || null,
    nominativo: row.nominativo || null,
    malus_euro: euro,
  };

  const eventi = (row.storia || [])
    .map((ev) => ({ ev, d: parseData(ev.data) }))
    .filter((x): x is { ev: StoriaEvent; d: Date } => !!x.d)
    .sort((x, y) => x.d.getTime() - y.d.getTime());

  type Seg = { start: Date; soglia: number | null; completato: boolean };
  const segs: Seg[] = [];
  const t0 = parseData(row.dataInserimento);
  if (t0) segs.push({ start: t0, soglia: r.senza_malus, completato: false });
  let flagCompletato = false;
  for (const { ev, d } of eventi) {
    if (ev.tipo === "stato_negozio") {
      const m = ev.testo.match(/aggiornato:\s*(.+)$/i);
      const id = m ? labelToId.get(m[1].trim().toLowerCase()) : undefined;
      if (id) flagCompletato = completati.includes(id);
    }
    segs.push({ start: d, soglia: r.succ_malus, completato: flagCompletato });
  }

  const out: EpisodioDerivato[] = [];
  // Segmenti passati -> episodi CHIUSI, congelati alla data dell'evento.
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    if (seg.completato || seg.soglia == null) continue;
    const fine = segs[i + 1].start;
    const misura = lavorativiTra(seg.start, fine);
    if (misura < seg.soglia) continue;
    const giorni = misura - seg.soglia + 1;
    out.push({
      ...base,
      data_inizio: toISODate(addLavorativi(seg.start, seg.soglia)),
      data_fine: toISODate(fine),
      giorni,
      importo: giorni * euro,
      stato: "attivo",
    });
  }
  // Segmento corrente -> episodio APERTO, allineato al calcolo live cosi' il
  // badge in tabella e l'archivio dicono la stessa cifra (regole speciali
  // P.IVA incluse).
  if (isMalusRow(row)) {
    const importo = calcolaMalus(row);
    if (importo > 0) {
      const giorni = Math.max(1, Math.round(importo / euro));
      out.push({
        ...base,
        data_inizio: toISODate(subLavorativi(oggi, giorni - 1)),
        data_fine: null,
        giorni,
        importo,
        stato: "in_corso",
      });
    }
  }
  // Eventi a cavallo del sabato/domenica possono produrre lo stesso giorno di
  // inizio per due episodi: la chiave a DB e' (pratica, categoria, inizio),
  // quindi si tiene quello con l'importo maggiore.
  const perInizio = new Map<string, EpisodioDerivato>();
  for (const e of out) {
    const prev = perInizio.get(e.data_inizio);
    if (!prev || e.importo > prev.importo || e.data_fine === null) perInizio.set(e.data_inizio, e);
  }
  return [...perInizio.values()].sort((a, b) => a.data_inizio.localeCompare(b.data_inizio));
}

/**
 * Allinea la tabella malus_storico agli episodi ricostruiti dalle righe.
 * Idempotente e SENZA cancellazioni: gli episodi gia' chiusi a DB non si
 * toccano (congelati, con eventuale compensazione), quelli aperti si
 * aggiornano o si chiudono, i mancanti si inseriscono. Ritorna il numero di
 * scritture: se > 0 il chiamante ricarica l'archivio.
 */
export async function sincronizzaMalusStorico(
  rows: TrackingRow[],
  esistenti: EpisodioMalus[]
): Promise<number> {
  const byKey = new Map<string, EpisodioMalus[]>();
  for (const e of esistenti) {
    const k = `${e.contract_id}#${e.categoria}`;
    const arr = byKey.get(k);
    if (arr) arr.push(e);
    else byKey.set(k, [e]);
  }

  const inserts: EpisodioDerivato[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const visti = new Set<string>();

  for (const row of rows) {
    const k = `${row.id}#${row.categoria}`;
    if (!row.id || visti.has(k)) continue;
    visti.add(k);
    const derivati = ricostruisciEpisodi(row);
    const db = byKey.get(k) || [];
    if (!derivati.length && !db.length) continue;
    const dbAperto = db.find((e) => e.data_fine === null) || null;
    const derivatoAperto = derivati.find((d) => d.data_fine === null) || null;

    for (const d of derivati) {
      if (d.data_fine === null) continue;
      const match = db.find((e) => e.data_inizio === d.data_inizio);
      if (!match) {
        inserts.push(d);
      } else if (match.data_fine === null) {
        // l'episodio che a DB risultava in corso nel frattempo e' stato sanato:
        // si congela alla data dell'evento, non a oggi.
        updates.push({
          id: match.id,
          patch: {
            data_fine: d.data_fine,
            giorni: d.giorni,
            importo: d.importo,
            stato: match.stato === "compensato" ? "compensato" : "attivo",
          },
        });
      }
    }

    if (derivatoAperto) {
      const match = db.find((e) => e.data_inizio === derivatoAperto.data_inizio);
      const aperto = match && match.data_fine === null ? match : dbAperto;
      if (aperto) {
        // refresh del maturato (data_inizio resta quella registrata alla prima
        // rilevazione: cambiarla romperebbe la chiave univoca).
        if (aperto.giorni !== derivatoAperto.giorni || Number(aperto.importo) !== derivatoAperto.importo) {
          updates.push({ id: aperto.id, patch: { giorni: derivatoAperto.giorni, importo: derivatoAperto.importo } });
        }
      } else if (!match) {
        inserts.push(derivatoAperto);
      }
    } else if (dbAperto) {
      // a DB in corso ma la pratica non e' piu' in malus e nessun episodio
      // chiuso ricostruito combacia (es. regole ammorbidite): si chiude a oggi
      // con l'ultimo maturato noto.
      const giaChiuso = derivati.some((d) => d.data_fine !== null && d.data_inizio === dbAperto.data_inizio);
      if (!giaChiuso) {
        updates.push({
          id: dbAperto.id,
          patch: { data_fine: toISODate(new Date()), stato: dbAperto.stato === "compensato" ? "compensato" : "attivo" },
        });
      }
    }
  }

  let scritture = 0;
  if (inserts.length) {
    const { error } = await supabase
      .from("malus_storico")
      .upsert(inserts, { onConflict: "contract_id,categoria,data_inizio", ignoreDuplicates: true });
    if (error) throw error;
    scritture += inserts.length;
  }
  for (const u of updates) {
    const { error } = await supabase
      .from("malus_storico")
      .update({ ...u.patch, updated_at: new Date().toISOString() })
      .eq("id", u.id);
    if (error) throw error;
    scritture++;
  }
  return scritture;
}

export type TotaliMalus = {
  inCorso: { n: number; eur: number };
  attivi: { n: number; eur: number };
  compensati: { n: number; eur: number };
  totale: number;
};

export function totaliEpisodi(eps: EpisodioMalus[]): TotaliMalus {
  const t: TotaliMalus = {
    inCorso: { n: 0, eur: 0 },
    attivi: { n: 0, eur: 0 },
    compensati: { n: 0, eur: 0 },
    totale: 0,
  };
  for (const e of eps) {
    const eur = Number(e.importo) || 0;
    t.totale += eur;
    if (e.stato === "compensato") { t.compensati.n++; t.compensati.eur += eur; }
    else if (e.data_fine === null) { t.inCorso.n++; t.inCorso.eur += eur; }
    else { t.attivi.n++; t.attivi.eur += eur; }
  }
  return t;
}

export function formatDataIt(iso: string | null): string {
  if (!iso) return "—";
  const d = parseData(iso);
  return d ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}
