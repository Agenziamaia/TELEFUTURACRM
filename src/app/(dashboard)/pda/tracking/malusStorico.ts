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
  fermaMalus,
  vocabolarioEtichette,
  isMalusRow,
  calcolaMalus,
  apertiTra,
  addAperti,
  malusAdminGiorno,
  malusAdminFisso,
  malusAdminDecorrenza,
} from "./trackingHelpers";

// I 4 SPAZI del malus (Luca 21/08 sera): in_corso = la pratica lo sta ancora
// generando; attivo = generato e definitivo, in attesa di compensazione;
// compensato = scalato (compensazioni interne oggi, pagamento gare domani);
// archiviato = di LICENZIATI/SOSPESI, non recuperato — la partita e' chiusa ma
// resta in traccia: se mai escono crediti a favore della persona, si sa che
// c'e' un malus da compensare.
export type StatoEpisodio = "in_corso" | "attivo" | "compensato" | "archiviato";

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
  // TOMBSTONE (mig. 150): eliminato dall'admin — resta a DB solo perche' la
  // ricostruzione deterministica non lo faccia rinascere; sparisce ovunque.
  eliminato?: boolean | null;
  eliminato_il?: string | null;
  eliminato_da?: string | null;
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
// MONDO AGENZIA (risposta Luca 13/08): il malus delle pratiche degli AGENTI
// si intesta all'operatore di back office che li ha in carico — la mappa
// nome agente → nome BO arriva dalla pagina (stessa di AGENTI_BO) PRIMA
// della sync. Gli episodi nuovi nascono già intestati al BO; la chiave
// episodio (contract+categoria+data) non cambia, quindi niente doppioni.
let AGENTI_BO_MALUS: Record<string, string> = {};
export function impostaAgentiBOMalus(mappa: Record<string, string>) { AGENTI_BO_MALUS = mappa; }
// PRATICHE RIASSEGNATE (Luca 21/08, licenziamenti/sospensioni): il malus si
// intesta a CHI LE HA IN CARICO — la partita del licenziato si chiude, i
// suoi episodi restano in archivio a suo nome ma i nuovi (e l'eventuale
// aperto) passano al delegato. Mappa contract_id → nome delegato.
let DELEGHE_MALUS: Record<string, string> = {};
export function impostaDelegheMalus(mappa: Record<string, string>) { DELEGHE_MALUS = mappa || {}; }
// FUORI SERVIZIO (Luca 21/08 sera): nomi dei venditori licenziati o sospesi
// AD OGGI — i loro episodi non compensati diventano "archiviato" e quelli
// ancora aperti si CONGELANO a oggi (la partita si chiude qui: da quel
// momento non matura piu' niente a loro nome). Se la persona rientra
// (riassunzione / fine sospensione) la sync riporta gli stati indietro.
let FUORI_SERVIZIO: Set<string> = new Set();
export function impostaFuoriServizio(nomi: Set<string>) { FUORI_SERVIZIO = nomi || new Set(); }
const eFuori = (venditore: string | null | undefined) => !!venditore && FUORI_SERVIZIO.has(venditore);
/** Stato giusto per un episodio CHIUSO: compensato non si tocca mai,
 *  fuori servizio → archiviato, altrimenti attivo. */
const statoChiusura = (venditore: string | null | undefined, statoAttuale?: string | null): StatoEpisodio =>
  statoAttuale === "compensato" ? "compensato" : eFuori(venditore) ? "archiviato" : "attivo";

export function ricostruisciEpisodi(row: TrackingRow): EpisodioDerivato[] {
  const r = regolaDi(row.categoria);
  const euro = Number(r?.malus_euro) || 0;
  if (!r || euro <= 0) return [];
  // DECORRENZA (incidente sky 25/08: la regola accesa a 8 €/g ha ricostruito
  // 119 episodi retroattivi da luglio, compresi periodi azzerati
  // dall'amministrazione): nessun episodio può iniziare prima del giorno in
  // cui la regola è entrata in vigore — il passato non si riscrive.
  const dec = r.decorrenza ? parseData(String(r.decorrenza).slice(0, 10)) : null;
  // MOD-28: le etichette sono persistite in chiaro negli eventi, e dal pannello
  // ora si possono RINOMINARE — il vocabolario unisce hardcoded storico e DB,
  // COMPRESE le liste per operatore (fix 10/08: un esito solo-brand come
  // "Ko Cliente Irreperibile" non si risolveva → flagCompletato mai alzato →
  // episodi fantasma in archivio per pratiche gia' chiuse)
  const labelToId = vocabolarioEtichette(row.categoria, row.brand);
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  // intestazioni: i segmenti PRIMA della riassegnazione restano al venditore
  // originale (o al suo BO), quelli DOPO — e l'episodio in corso — passano
  // al delegato (Luca 21/08: la partita del licenziato si chiude)
  const nomeOriginale = (row.venditore && AGENTI_BO_MALUS[row.venditore]) || row.venditore || null;
  const nomeDelegato = DELEGHE_MALUS[row.id] || null;
  const base = {
    contract_id: row.id,
    categoria: row.categoria,
    brand: row.brand || null,
    negozio: row.negozio || null,
    venditore: nomeOriginale,
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
  let delegaD: Date | null = null;
  for (const { ev, d } of eventi) {
    if (ev.tipo === "stato_negozio") {
      const m = ev.testo.match(/aggiornato:\s*(.+)$/i);
      const id = m ? labelToId.get(m[1].trim().toLowerCase()) : undefined;
      // Esito definitivo (completata o annullata/KO/recesso) -> ferma la
      // maturazione: i segmenti successivi non generano piu' malus.
      if (id) flagCompletato = fermaMalus(id, row.categoria, row.brand);
    }
    // RIASSEGNAZIONE: il segmento post-consegna riparte dal livello WARNING
    // (come il live): il malus rimatura dopo succ_malus − succ_warning aperti
    const sogliaSeg = ev.tipo === "riassegnazione" && r.succ_malus != null
      ? Math.max(1, r.succ_malus - (Number(r.succ_warning) || 0))
      : r.succ_malus;
    if (ev.tipo === "riassegnazione") delegaD = d;
    segs.push({ start: d, soglia: sogliaSeg, completato: flagCompletato });
  }

  const out: EpisodioDerivato[] = [];
  // Segmenti passati -> episodi CHIUSI, congelati alla data dell'evento.
  // Misura sul calendario APERTO del negozio (chiusure/ferie BO escluse),
  // come il calcolo live: coi lavorativi di calendario, al primo tocco della
  // pratica il congelamento evaporava retroattivamente e nascevano malus per
  // i giorni di negozio chiuso (bug riaperture, Luca 19/08).
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    if (seg.completato || seg.soglia == null) continue;
    const fine = segs[i + 1].start;
    // decorrenza: il segmento interamente nel passato non esiste; quello a
    // cavallo parte dal giorno di vigore (il contatore riparte da lì)
    if (dec && fine <= dec) continue;
    const startEff = dec && dec > seg.start ? dec : seg.start;
    const misura = apertiTra(startEff, fine, row.negozio, row.venditore);
    if (misura < seg.soglia) continue;
    const giorni = misura - seg.soglia + 1;
    out.push({
      ...base,
      venditore: nomeDelegato && delegaD && seg.start >= delegaD ? nomeDelegato : nomeOriginale,
      data_inizio: toISODate(addAperti(startEff, seg.soglia, row.negozio, row.venditore)),
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
      // MALUS AMMINISTRATIVO (25/08): l'episodio si ANCORA alla data
      // dell'ultimo evento (l'esito che lo genera) — derivare l'inizio da
      // «oggi meno importo/€» qui driftava la chiave giorno dopo giorno
      // (fisso + €/gg dell'esito ≠ € della categoria) e avrebbe partorito
      // un doppione a ogni sync.
      const admin = malusAdminGiorno(row.statoAdmin || "", row.categoria, row.brand) > 0
        || malusAdminFisso(row.statoAdmin || "", row.categoria, row.brand) > 0;
      if (admin) {
        const ancora = eventi.length ? eventi[eventi.length - 1].d : (t0 || oggi);
        // giorni allineati al conteggio PAGATO: aperti dall'ancora, clampati
        // alla decorrenza dei € dell'esito (revisore 25/08 — coi lavorativi
        // di calendario giorni × € non tornava con l'importo)
        const decE = parseData(malusAdminDecorrenza(row.statoAdmin || "", row.categoria, row.brand) || "");
        const da = decE && decE > ancora ? decE : ancora;
        out.push({
          ...base,
          venditore: nomeDelegato || nomeOriginale,
          data_inizio: toISODate(ancora),
          data_fine: null,
          giorni: Math.max(1, apertiTra(da, oggi, row.negozio, row.venditore)),
          importo,
          stato: "in_corso",
        });
      } else {
        const giorni = Math.max(1, Math.round(importo / euro));
        out.push({
          ...base,
          venditore: nomeDelegato || nomeOriginale,
          data_inizio: toISODate(subLavorativi(oggi, giorni - 1)),
          data_fine: null,
          giorni,
          importo,
          stato: "in_corso",
        });
      }
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
  // patch per id FUSE in un'unica scrittura: il giro archiviati qui sotto
  // deve poter correggere lo stato di una riga gia' toccata in questo stesso
  // passaggio senza produrre due update in sequenza
  const updates = new Map<string, Record<string, unknown>>();
  const addUpd = (id: string, patch: Record<string, unknown>) =>
    updates.set(id, { ...(updates.get(id) || {}), ...patch });
  const visti = new Set<string>();
  // pratica#categoria → data_inizio del derivato APERTO di questo giro: serve
  // al giro archiviati per RIAPRIRE l'episodio giusto quando un sospeso
  // rientra con la pratica ancora in malus (revisione 21/08, rilievo 6)
  const apertiDerivati = new Map<string, string>();

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
        // GUARDIA DI COPERTURA (revisione 21/08, rilievi 7-8): un chiuso
        // ricostruito il cui inizio cade DENTRO un periodo gia' registrato
        // (tipicamente il congelato di un licenziato, ma vale per qualsiasi
        // episodio chiuso) non deve rinascergli accanto — stesso malus
        // contato due volte.
        const coperto = db.some((e) => !e.eliminato
          && e.data_fine !== null && e.data_inizio <= d.data_inizio && d.data_inizio <= e.data_fine);
        // …e anche contro gli ALTRI derivati di QUESTO giro (revisore 27/08,
        // caso EX: l'episodio admin chiuso in questo stesso passaggio non e'
        // ancora «chiuso a DB» — senza questa guardia il segmento-negozio
        // sovrapposto rinascerebbe accanto, stesso malus contato due volte)
        const copertoDaGiro = derivati.some((e) => e !== d && e.data_fine !== null
          && e.data_inizio < d.data_inizio && d.data_inizio <= e.data_fine);
        if (!coperto && !copertoDaGiro) inserts.push(eFuori(d.venditore) ? { ...d, stato: "archiviato" } : d);
      } else if (match.data_fine === null) {
        // l'episodio che a DB risultava in corso nel frattempo e' stato sanato:
        // si congela alla data dell'evento, non a oggi.
        addUpd(match.id, {
          data_fine: d.data_fine,
          giorni: d.giorni,
          importo: d.importo,
          stato: statoChiusura(d.venditore ?? match.venditore, match.stato),
        });
      }
    }

    if (derivatoAperto) {
      apertiDerivati.set(k, derivatoAperto.data_inizio);
      const match = db.find((e) => e.data_inizio === derivatoAperto.data_inizio);
      const aperto = match && match.data_fine === null ? match : dbAperto;
      if (aperto) {
        // refresh del maturato (data_inizio resta quella registrata alla prima
        // rilevazione: cambiarla romperebbe la chiave univoca). Se pero'
        // l'intestatario e' FUORI SERVIZIO la partita e' congelata: niente
        // refresh, ci pensa il giro archiviati a chiuderla.
        const cambioIntestazione = !!derivatoAperto.venditore && aperto.venditore !== derivatoAperto.venditore;
        if (!eFuori(derivatoAperto.venditore) && (aperto.giorni !== derivatoAperto.giorni || Number(aperto.importo) !== derivatoAperto.importo || cambioIntestazione)) {
          addUpd(aperto.id, { giorni: derivatoAperto.giorni, importo: derivatoAperto.importo, ...(cambioIntestazione ? { venditore: derivatoAperto.venditore } : {}) });
        }
      } else if (!match) {
        if (eFuori(derivatoAperto.venditore)) {
          // malus nato quando la persona era GIA' fuori servizio: si registra
          // direttamente congelato — la traccia del credito resta, la
          // maturazione a nome suo no. UNA fotografia sola PER PERSONA
          // (revisione 21/08, rilievo 8): il derivato che nei giorni
          // successivi DERIVA la data d'inizio (chiusure negozio) non deve
          // partorire un doppione, ma un DELEGATO poi licenziato a sua volta
          // ha diritto alla sua fotografia.
          const giaCongelato = db.some((e) => !e.eliminato && e.stato === "archiviato" && e.venditore === derivatoAperto.venditore);
          if (!giaCongelato) inserts.push({ ...derivatoAperto, data_fine: toISODate(new Date()), stato: "archiviato" });
        } else {
          // GUARDIA RIENTRO (revisione 21/08, rilievo 6b): se l'inizio del
          // derivato e' scivolato (chiusure/ferie) dentro un periodo gia'
          // registrato — tipicamente il congelato di una sospensione —
          // l'insert duplicherebbe quel maturato con l'importo totale.
          const copertoAperto = db.some((e) => !e.eliminato && e.data_fine !== null
            && e.data_inizio <= derivatoAperto.data_inizio && derivatoAperto.data_inizio <= e.data_fine)
            || derivati.some((e) => e !== derivatoAperto && e.data_fine !== null
              && e.data_inizio < derivatoAperto.data_inizio && derivatoAperto.data_inizio <= e.data_fine);
          if (!copertoAperto) inserts.push(derivatoAperto);
        }
      }
    } else if (dbAperto) {
      // a DB in corso ma la pratica non e' piu' in malus e nessun episodio
      // chiuso ricostruito combacia (es. regole ammorbidite): si chiude a oggi
      // con l'ultimo maturato noto.
      const giaChiuso = derivati.some((d) => d.data_fine !== null && d.data_inizio === dbAperto.data_inizio);
      if (!giaChiuso) {
        addUpd(dbAperto.id, { data_fine: toISODate(new Date()), stato: statoChiusura(dbAperto.venditore, dbAperto.stato) });
      }
    }
  }

  // SPAZZINO (03/08, caso Sanna): un episodio APERTO la cui pratica non e'
  // piu' tra le righe (esclusa dal tracking, nascosta col cestino o contratto
  // eliminato) non verrebbe MAI piu' chiuso dal giro qui sopra — resterebbe
  // "in corso" per sempre in archivio. Lo si congela a oggi.
  for (const e of esistenti) {
    if (e.data_fine !== null) continue;
    const k = `${e.contract_id}#${e.categoria}`;
    if (visti.has(k)) continue;
    addUpd(e.id, { data_fine: toISODate(new Date()), stato: statoChiusura(e.venditore, e.stato) });
  }

  // ── GIRO ARCHIVIATI (Luca 21/08 sera): allinea lo stato di TUTTI gli
  // episodi alla situazione delle persone. Fuori servizio → aperti congelati
  // a oggi + chiusi marcati "archiviato"; rientrati → si torna ad
  // attivo/in_corso. I compensati non si toccano MAI, i tombstone nemmeno.
  for (const e of esistenti) {
    if (e.eliminato || e.stato === "compensato") continue;
    const pend = updates.get(e.id);
    // la verita' del giro corrente: una patch in coda puo' aver gia' chiuso
    // la riga o averle cambiato intestatario (consegna al delegato)
    const vend = (pend && "venditore" in pend ? pend.venditore : e.venditore) as string | null;
    const fine = (pend && "data_fine" in pend ? pend.data_fine : e.data_fine) as string | null;
    const stato = (pend && "stato" in pend ? pend.stato : e.stato) as StatoEpisodio;
    if (eFuori(vend)) {
      if (fine === null) addUpd(e.id, { data_fine: toISODate(new Date()), stato: "archiviato" });
      else if (stato !== "archiviato") addUpd(e.id, { stato: "archiviato" });
    } else if (stato === "archiviato") {
      // RIENTRO (revisione 21/08, rilievo 6): se la pratica e' ANCORA in
      // malus e il derivato aperto combacia con questo episodio, si RIAPRE —
      // il maturato riprende da dove il congelamento l'aveva fermato, senza
      // perdere il periodo ne' duplicarlo. Altrimenti il congelato resta
      // chiuso come "attivo — da scalare".
      const inizioVivo = apertiDerivati.get(`${e.contract_id}#${e.categoria}`);
      if (inizioVivo && inizioVivo === e.data_inizio) addUpd(e.id, { stato: "in_corso", data_fine: null });
      else addUpd(e.id, { stato: fine ? "attivo" : "in_corso" });
    }
  }

  // Scritture RESILIENTI: un errore su una riga non deve piu' bloccare tutte
  // le altre (prima il primo throw abortiva l'intera sync in silenzio).
  let scritture = 0;
  const errori: string[] = [];
  if (inserts.length) {
    const { error } = await supabase
      .from("malus_storico")
      .upsert(inserts, { onConflict: "contract_id,categoria,data_inizio", ignoreDuplicates: true });
    if (error) {
      errori.push("insert: " + error.message);
      console.error("[SYNC-MALUS] insert fallito:", error.message);
    } else scritture += inserts.length;
  }
  for (const [id, patch] of updates) {
    const { error } = await supabase
      .from("malus_storico")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      errori.push(id + ": " + error.message);
      console.error("[SYNC-MALUS] update fallito:", id, error.message);
    } else scritture++;
  }
  if (errori.length) throw new Error(`${errori.length} scritture fallite — ${errori[0]}`);
  return scritture;
}

export type TotaliMalus = {
  inCorso: { n: number; eur: number };
  attivi: { n: number; eur: number };
  archiviati: { n: number; eur: number };
  compensati: { n: number; eur: number };
  totale: number;
};

export function totaliEpisodi(eps: EpisodioMalus[]): TotaliMalus {
  const t: TotaliMalus = {
    inCorso: { n: 0, eur: 0 },
    attivi: { n: 0, eur: 0 },
    archiviati: { n: 0, eur: 0 },
    compensati: { n: 0, eur: 0 },
    totale: 0,
  };
  for (const e of eps) {
    const eur = Number(e.importo) || 0;
    t.totale += eur;
    if (e.stato === "compensato") { t.compensati.n++; t.compensati.eur += eur; }
    else if (e.stato === "archiviato") { t.archiviati.n++; t.archiviati.eur += eur; }
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
