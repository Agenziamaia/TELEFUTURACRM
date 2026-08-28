// Tracking PDA v2 — constants and types (from TrackingPDA_DevSpec / TrackingPDA_v2.0.jsx)

// Le voci del filtro vengono dalla tassonomia unica (src/lib/tassonomia.ts):
// le 7 categorie di servizio, uguali per ogni brand, piu' i controlli, che sono
// ortogonali (una vendita mobile puo' essere insieme portabilita' e
// finanziamento e compare su due righe).
export const CATEGORIE = [
  { id: "mnp", label: "MNP", desc: "Portabilita' mobile", color: "var(--tf-6366f1)" },
  { id: "finanziamento", label: "Finanziamento", desc: "Terminale finanziato", color: "var(--tf-f59e0b)" },
  { id: "mobile", label: "Mobile", desc: "SIM e offerte mobili", color: "var(--tf-3b82f6)" },
  { id: "fisso", label: "Fisso / Fibra", desc: "Linee fisse, fibra e FWA", color: "var(--tf-0ea5e9)" },
  { id: "energia", label: "Energia", desc: "Luce e gas", color: "var(--tf-10b981)" },
  { id: "tv", label: "TV", desc: "Pay TV e intrattenimento", color: "var(--tf-ef4444)" },
  // Nel Tracking le pratiche TV viaggiano come "sky" (rimappate in `data`):
  // senza questa voce le Sky non erano filtrabili e il badge cadeva sul
  // fallback grigio di getCat (PDA-01).
  { id: "sky", label: "Sky / TV", desc: "Sky TV (regole Sky)", color: "var(--tf-ef4444)" },
  { id: "digitale", label: "Soluzioni Digitali", desc: "Servizi digitali", color: "var(--tf-22d3ee)" },
  { id: "multi_servizi", label: "Multi-Servizi", desc: "Assicurazioni e pacchetti", color: "var(--tf-ec4899)" },
  { id: "pos", label: "POS", desc: "Terminali di pagamento", color: "var(--tf-f59e0b)" },
  { id: "piva", label: "P.IVA", desc: "Vodafone Business", color: "var(--tf-8b5cf6)" },
] as const;

const STATI_NEGOZIO_BASE = [
  { id: "nuovo", label: "Nuovo", color: "var(--tf-94a3b8)", bg: "var(--tf-1e293b)" },
  { id: "contattare_cliente", label: "Contattato Cliente", color: "var(--tf-f59e0b)", bg: "var(--tf-451a03)" },
  { id: "contattare_supporto", label: "Contattato Supporto", color: "var(--tf-f97316)", bg: "var(--tf-431407)" },
  { id: "doc_mancante", label: "Doc Mancante", color: "var(--tf-e879f9)", bg: "var(--tf-3b0764)" },
  { id: "in_corso", label: "In Corso", color: "var(--tf-3b82f6)", bg: "var(--tf-172554)" },
  { id: "attivato", label: "Completato", color: "var(--tf-22c55e)", bg: "var(--tf-052e16)" },
  { id: "ko", label: "KO", color: "var(--tf-ef4444)", bg: "var(--tf-450a0a)" },
];

export const STATI_NEGOZIO = [...STATI_NEGOZIO_BASE];

export const STATI_NEGOZIO_MNP = STATI_NEGOZIO_BASE.filter(
  (s) => s.id !== "doc_mancante" && s.id !== "contattare_supporto"
).concat([{ id: "re_inserita", label: "Re-Inserita", color: "var(--tf-38bdf8)", bg: "var(--tf-0c2a3f)" }]);

export const STATI_NEGOZIO_FISSO = [
  { id: "nuovo", label: "Nuovo", color: "var(--tf-94a3b8)", bg: "var(--tf-1e293b)" },
  { id: "contattare_cliente", label: "Contattato Cliente", color: "var(--tf-f59e0b)", bg: "var(--tf-451a03)" },
  { id: "contattare_supporto", label: "Contattato Supporto", color: "var(--tf-f97316)", bg: "var(--tf-431407)" },
  { id: "in_corso", label: "In Corso", color: "var(--tf-3b82f6)", bg: "var(--tf-172554)" },
  { id: "attivato", label: "Completato", color: "var(--tf-22c55e)", bg: "var(--tf-052e16)" },
  { id: "ko", label: "KO Ripensamento", color: "var(--tf-ef4444)", bg: "var(--tf-450a0a)" },
  { id: "ko_ripensamento", label: "KO Ripensamento", color: "var(--tf-ef4444)", bg: "var(--tf-450a0a)" },
  { id: "ko_tecnico", label: "KO Tecnico Definitivo", color: "var(--tf-dc2626)", bg: "var(--tf-3f0a0a)" },
  { id: "ko_reinserito", label: "KO Reinserito", color: "var(--tf-f97316)", bg: "var(--tf-431407)" },
  { id: "ricaduta", label: "Ricaduta", color: "var(--tf-a78bfa)", bg: "var(--tf-2e1065)" },
];

export const STATI_NEGOZIO_FINANZIAMENTO = [
  { id: "nuovo", label: "Nuovo", color: "var(--tf-94a3b8)", bg: "var(--tf-1e293b)" },
  { id: "otp_mancante", label: "OTP Mancante", color: "var(--tf-f59e0b)", bg: "var(--tf-451a03)" },
  { id: "liquidato", label: "Liquidato", color: "var(--tf-22c55e)", bg: "var(--tf-052e16)" },
  { id: "annullato", label: "Annullato", color: "var(--tf-ef4444)", bg: "var(--tf-450a0a)" },
  { id: "cartaceo", label: "Cartaceo", color: "var(--tf-e879f9)", bg: "var(--tf-3b0764)" },
  { id: "in_liquidazione", label: "In Liquidazione", color: "var(--tf-3b82f6)", bg: "var(--tf-172554)" },
  { id: "doc_mancante", label: "Doc Mancante", color: "var(--tf-fb923c)", bg: "var(--tf-431407)" },
  { id: "contattare_supporto", label: "Contattato Supporto", color: "var(--tf-f97316)", bg: "var(--tf-431407)" },
  { id: "modulo_win_back", label: "Modulo Win Back", color: "var(--tf-818cf8)", bg: "var(--tf-1e1b4b)" },
];

export const STATI_NEGOZIO_PIVA = [
  { id: "nuovo", label: "Nuovo", color: "var(--tf-94a3b8)", bg: "var(--tf-1e293b)" },
  { id: "contattare_cliente", label: "Contattato Cliente", color: "var(--tf-f59e0b)", bg: "var(--tf-451a03)" },
  { id: "contattare_supporto", label: "Contattato Supporto", color: "var(--tf-f97316)", bg: "var(--tf-431407)" },
  { id: "in_lavorazione", label: "In Lavorazione", color: "var(--tf-3b82f6)", bg: "var(--tf-172554)" },
  { id: "cliente_irreperibile", label: "Cliente Irreperibile", color: "var(--tf-e879f9)", bg: "var(--tf-3b0764)" },
  { id: "in_attesa_dispositivo", label: "In Attesa Dispositivo", color: "var(--tf-38bdf8)", bg: "var(--tf-0c2a3f)" },
  { id: "attivato", label: "Completato", color: "var(--tf-22c55e)", bg: "var(--tf-052e16)" },
  { id: "ko_tecnico_piva", label: "KO Tecnico", color: "var(--tf-dc2626)", bg: "var(--tf-3f0a0a)" },
  { id: "ko_credito", label: "KO Credito", color: "var(--tf-f97316)", bg: "var(--tf-431407)" },
  { id: "ko_reinserito_piva", label: "KO Reinserito", color: "var(--tf-a78bfa)", bg: "var(--tf-2e1065)" },
];

export const STATI_NEGOZIO_ENERGIA = [
  { id: "nuovo", label: "Nuovo", color: "var(--tf-94a3b8)", bg: "var(--tf-1e293b)" },
  { id: "contattare_cliente", label: "Contattato Cliente", color: "var(--tf-f59e0b)", bg: "var(--tf-451a03)" },
  { id: "contattare_supporto", label: "Contattato Supporto", color: "var(--tf-f97316)", bg: "var(--tf-431407)" },
  { id: "doc_mancante", label: "Doc Mancante", color: "var(--tf-e879f9)", bg: "var(--tf-3b0764)" },
  { id: "in_lavorazione_en", label: "In Lavorazione", color: "var(--tf-3b82f6)", bg: "var(--tf-172554)" },
  { id: "attivato", label: "Completato", color: "var(--tf-22c55e)", bg: "var(--tf-052e16)" },
  { id: "ko", label: "KO", color: "var(--tf-ef4444)", bg: "var(--tf-450a0a)" },
  { id: "ko_verifica_email", label: "KO Verifica Email", color: "var(--tf-dc2626)", bg: "var(--tf-3f0a0a)" },
  { id: "ko_credito_en", label: "KO Credito", color: "var(--tf-f97316)", bg: "var(--tf-431407)" },
  { id: "inserimento_errato", label: "Inserimento Errato", color: "var(--tf-fb923c)", bg: "var(--tf-431407)" },
  { id: "ko_reinserito_en", label: "KO Reinserito", color: "var(--tf-a78bfa)", bg: "var(--tf-2e1065)" },
  { id: "ko_mancanza_firma", label: "KO Mancanza Firma", color: "var(--tf-e879f9)", bg: "var(--tf-4a044e)" },
  { id: "ko_sii", label: "KO dal Sii", color: "var(--tf-dc2626)", bg: "var(--tf-3f0a0a)" },
];

export const STATI_NEGOZIO_SKY = [
  { id: "nuovo", label: "Nuovo", color: "var(--tf-94a3b8)", bg: "var(--tf-1e293b)" },
  { id: "contattare_cliente", label: "Contattato Cliente", color: "var(--tf-f59e0b)", bg: "var(--tf-451a03)" },
  { id: "in_attivazione_sky", label: "In Attivazione", color: "var(--tf-3b82f6)", bg: "var(--tf-172554)" },
  { id: "wm_sospetta", label: "WM Sospetta", color: "var(--tf-f97316)", bg: "var(--tf-431407)" },
  { id: "wm_confermata", label: "TV WM - BB in Corso", color: "var(--tf-fb923c)", bg: "var(--tf-451a03)" },
  { id: "tv_wm_bb_ok", label: "TV WM - BB Ok", color: "var(--tf-4ade80)", bg: "var(--tf-052e16)" },
  { id: "completo_sky", label: "Completo", color: "var(--tf-22c55e)", bg: "var(--tf-052e16)" },
  { id: "attesa_matricola", label: "Attesa Matricola", color: "var(--tf-38bdf8)", bg: "var(--tf-0c2a3f)" },
  { id: "ripensamento_sky", label: "Ripensamento Cliente", color: "var(--tf-e879f9)", bg: "var(--tf-3b0764)" },
  { id: "attivo_sky", label: "Attivo", color: "var(--tf-4ade80)", bg: "var(--tf-052e16)" },
  { id: "ko_frode_mop", label: "KO Frode MOP", color: "var(--tf-dc2626)", bg: "var(--tf-3f0a0a)" },
  { id: "ko_reinserito_sky", label: "KO Reinserito", color: "var(--tf-a78bfa)", bg: "var(--tf-2e1065)" },
  { id: "aperto_sparks", label: "Aperto Sparks", color: "var(--tf-fbbf24)", bg: "var(--tf-451a03)" },
  { id: "recesso_info_errate", label: "Recesso per Info Errate", color: "var(--tf-f43f5e)", bg: "var(--tf-4c0519)" },
];

export const STATI_ADMIN = [
  { id: "da_verificare", label: "Da Verificare", color: "var(--tf-64748b)", bg: "var(--tf-1e293b)" },
  { id: "in_lavorazione", label: "In Lavorazione", color: "var(--tf-3b82f6)", bg: "var(--tf-172554)" },
  { id: "non_conforme", label: "Non Conforme", color: "var(--tf-f97316)", bg: "var(--tf-431407)" },
  // MARCHIO (Luca 27/08): la pratica è stata Non Conforme, il negozio l'ha
  // rilavorata — rivive il ciclo normale ma resta nel filtro non conformi
  { id: "ex_non_conforme", label: "EX Non Conforme", color: "var(--tf-fbbf24)", bg: "var(--tf-451a03)" },
  { id: "confermato", label: "Confermato", color: "var(--tf-22c55e)", bg: "var(--tf-052e16)" },
  { id: "pagato", label: "Pagato", color: "var(--tf-a78bfa)", bg: "var(--tf-2e1065)" },
  { id: "stornato", label: "Stornato", color: "var(--tf-ef4444)", bg: "var(--tf-450a0a)" },
];

export const STATI_ADMIN_FINANZIAMENTO = [
  ...STATI_ADMIN,
  { id: "stornato_da_ripagare", label: "Stornato, Da Ripagare", color: "var(--tf-fb923c)", bg: "var(--tf-431407)" },
  { id: "ripagato", label: "Ripagato", color: "var(--tf-4ade80)", bg: "var(--tf-052e16)" },
];

import { BRAND_CANONICI } from "@/lib/tassonomia";
// Fonte unica (tassonomia): niente liste parallele da tenere allineate a mano.
// La Marginalità non ha pratiche da tracciare.
export const ALL_BRANDS = BRAND_CANONICI.filter((b) => b !== "Marginalità");

export const MALUS_SOGLIE: Record<string, number | null> = {
  mnp: 6,
  fisso: 15,
  finanziamento: 6,
  piva: 6,
  energia: 15,
  sky: 2,
  tv: 2,          // "sky" nella vecchia nomenclatura
  mobile: 0,      // le vendite mobili semplici non maturano malus
};

export const MALUS_IMPORTO: Record<string, number> = {
  mnp: 5,
  fisso: 10,
  finanziamento: 10,
  piva: 5,
  energia: 10,
  sky: 5,
  tv: 5,
};

export type StoriaEvent = {
  data: string;
  tipo: string;
  testo: string;
  utente: string;
  ruolo: string;
  // ORARIO dell'azione (Luca 27/08) — campo a parte: `data` resta il formato
  // storico su cui lavora la ricostruzione del malus
  ora?: string;
  /** LA RIGA a cui l'evento appartiene, sulle pratiche SCISSE (Luca 28/08):
   *  un 3P Sky è fibra + TV, un mobile può essere MNP + finanziamento — un
   *  contratto solo, due lavorazioni. Assente = evento della pratica intera
   *  (tutto lo storico fino al 28/08, e le pratiche non scisse). */
  cat?: string;
};

export type FollowUpItem = { label: string; data: string; esito: string; note: string };

export type TrackingRow = {
  id: string;
  categoria: string;
  brand: string;
  negozio: string;
  venditore: string;
  nominativo: string;
  telefono: string;
  numContratto: string;
  numAttivazione: string;
  dataInserimento: string;
  // Segnalazione 43: i dettagli venivano letti con chiavi camelCase inesistenti
  // (numFissoProvvisorio, tipoEnergia, modelloTelefono...) mentre a database
  // stanno con le etichette reali ("ICCID", "Offerta", "Cod.Ins."), percio' il
  // pannello risultava vuoto. Ora la riga porta l'oggetto intero.
  dettagliFull?: Record<string, unknown>;
  // Il finanziamento non e' una categoria ma una caratteristica della vendita:
  // sta dentro dettagli (EasyPay, Tipo CB "Finanziamento…"/"Rata…", Finanz.).
  finanziato?: boolean;
  controlli?: string[];
  // Una pratica con MNP + finanziamento compare su due righe: serve una chiave
  // distinta, mentre `id` resta quello del contratto per gli aggiornamenti.
  rowKey?: string;
  statoNegozio: string;
  // Segnalazione 77: stato della pratica (colonna "stato"), distinto dall'esito negozio
  statoPratica: string;
  statoAdmin: string;
  storia: StoriaEvent[];
  cf: string;
  indirizzo: string;
  // Delega verifica (Tracking PDA): a chi e' delegata la pratica.
  delegated_to?: string | null;
  delegated_by?: string | null;
  tracking_nascosto?: boolean;
  delegatoNome?: string | null;
  // optional category-specific
  gnp?: boolean;
  numFissoProvvisorio?: string | null;
  numFissoDefinitivo?: string | null;
  tipoEnergia?: string;
  pod?: string | null;
  pdr?: string | null;
  tipoFinanziamento?: string;
  codiceNegozio?: string;
  modelloTelefono?: string;
  numeroPratica?: string | null;
  hasPda?: boolean;
  hasDocumenti?: boolean;
  followup?: FollowUpItem[];
  codiceNegozioMnp?: string;
  numProvvisorio?: string | null;
  numDefinitivo?: string | null;
  iccid?: string | null;
};
