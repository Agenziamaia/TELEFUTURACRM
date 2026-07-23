// Tracking PDA v2 — constants and types (from TrackingPDA_DevSpec / TrackingPDA_v2.0.jsx)

export const CATEGORIE = [
  { id: "mnp", label: "MNP", desc: "Portabilità mobile", color: "#6366f1" },
  { id: "fisso", label: "Fisso", desc: "Linee fisse", color: "#0ea5e9" },
  { id: "finanziamento", label: "Finanziamento", desc: "Wind / VF / Fastweb", color: "#f59e0b" },
  { id: "piva", label: "P.IVA", desc: "Vodafone Business", color: "#8b5cf6" },
  { id: "energia", label: "Energia", desc: "Luce & Gas", color: "#10b981" },
  { id: "sky", label: "Sky", desc: "Sky 3P", color: "#ef4444" },
  // Segnalazione 43: nel filtro mancavano le categorie effettivamente usate dai
  // contratti, quindi non erano selezionabili — "Finanziamenti non filtrabili".
  { id: "mobile", label: "Mobile", desc: "Vendita mobile senza portabilita' ne' finanziamento", color: "#3b82f6" },
  { id: "multi-servizi", label: "Multi-Servizi", desc: "Pacchetti multi-servizio", color: "#f472b6" },
  { id: "soluzioni digitali", label: "Soluzioni Digitali", desc: "Soluzioni digitali", color: "#22d3ee" },
] as const;

const STATI_NEGOZIO_BASE = [
  { id: "nuovo", label: "Nuovo", color: "#94a3b8", bg: "#1e293b" },
  { id: "contattare_cliente", label: "Contattato Cliente", color: "#f59e0b", bg: "#451a03" },
  { id: "contattare_supporto", label: "Contattato Supporto", color: "#f97316", bg: "#431407" },
  { id: "doc_mancante", label: "Doc Mancante", color: "#e879f9", bg: "#3b0764" },
  { id: "in_corso", label: "In Corso", color: "#3b82f6", bg: "#172554" },
  { id: "attivato", label: "Completato", color: "#22c55e", bg: "#052e16" },
  { id: "ko", label: "KO", color: "#ef4444", bg: "#450a0a" },
];

export const STATI_NEGOZIO = [...STATI_NEGOZIO_BASE];

export const STATI_NEGOZIO_MNP = STATI_NEGOZIO_BASE.filter(
  (s) => s.id !== "doc_mancante" && s.id !== "contattare_supporto"
).concat([{ id: "re_inserita", label: "Re-Inserita", color: "#38bdf8", bg: "#0c2a3f" }]);

export const STATI_NEGOZIO_FISSO = [
  { id: "nuovo", label: "Nuovo", color: "#94a3b8", bg: "#1e293b" },
  { id: "contattare_cliente", label: "Contattato Cliente", color: "#f59e0b", bg: "#451a03" },
  { id: "contattare_supporto", label: "Contattato Supporto", color: "#f97316", bg: "#431407" },
  { id: "in_corso", label: "In Corso", color: "#3b82f6", bg: "#172554" },
  { id: "attivato", label: "Completato", color: "#22c55e", bg: "#052e16" },
  { id: "ko", label: "KO Ripensamento", color: "#ef4444", bg: "#450a0a" },
  { id: "ko_ripensamento", label: "KO Ripensamento", color: "#ef4444", bg: "#450a0a" },
  { id: "ko_tecnico", label: "KO Tecnico Definitivo", color: "#dc2626", bg: "#3f0a0a" },
  { id: "ko_reinserito", label: "KO Reinserito", color: "#f97316", bg: "#431407" },
  { id: "ricaduta", label: "Ricaduta", color: "#a78bfa", bg: "#2e1065" },
];

export const STATI_NEGOZIO_FINANZIAMENTO = [
  { id: "nuovo", label: "Nuovo", color: "#94a3b8", bg: "#1e293b" },
  { id: "otp_mancante", label: "OTP Mancante", color: "#f59e0b", bg: "#451a03" },
  { id: "liquidato", label: "Liquidato", color: "#22c55e", bg: "#052e16" },
  { id: "annullato", label: "Annullato", color: "#ef4444", bg: "#450a0a" },
  { id: "cartaceo", label: "Cartaceo", color: "#e879f9", bg: "#3b0764" },
  { id: "in_liquidazione", label: "In Liquidazione", color: "#3b82f6", bg: "#172554" },
  { id: "doc_mancante", label: "Doc Mancante", color: "#fb923c", bg: "#431407" },
  { id: "contattare_supporto", label: "Contattato Supporto", color: "#f97316", bg: "#431407" },
  { id: "modulo_win_back", label: "Modulo Win Back", color: "#818cf8", bg: "#1e1b4b" },
];

export const STATI_NEGOZIO_PIVA = [
  { id: "nuovo", label: "Nuovo", color: "#94a3b8", bg: "#1e293b" },
  { id: "contattare_cliente", label: "Contattato Cliente", color: "#f59e0b", bg: "#451a03" },
  { id: "contattare_supporto", label: "Contattato Supporto", color: "#f97316", bg: "#431407" },
  { id: "in_lavorazione", label: "In Lavorazione", color: "#3b82f6", bg: "#172554" },
  { id: "cliente_irreperibile", label: "Cliente Irreperibile", color: "#e879f9", bg: "#3b0764" },
  { id: "in_attesa_dispositivo", label: "In Attesa Dispositivo", color: "#38bdf8", bg: "#0c2a3f" },
  { id: "attivato", label: "Completato", color: "#22c55e", bg: "#052e16" },
  { id: "ko_tecnico_piva", label: "KO Tecnico", color: "#dc2626", bg: "#3f0a0a" },
  { id: "ko_credito", label: "KO Credito", color: "#f97316", bg: "#431407" },
  { id: "ko_reinserito_piva", label: "KO Reinserito", color: "#a78bfa", bg: "#2e1065" },
];

export const STATI_NEGOZIO_ENERGIA = [
  { id: "nuovo", label: "Nuovo", color: "#94a3b8", bg: "#1e293b" },
  { id: "contattare_cliente", label: "Contattato Cliente", color: "#f59e0b", bg: "#451a03" },
  { id: "contattare_supporto", label: "Contattato Supporto", color: "#f97316", bg: "#431407" },
  { id: "doc_mancante", label: "Doc Mancante", color: "#e879f9", bg: "#3b0764" },
  { id: "in_lavorazione_en", label: "In Lavorazione", color: "#3b82f6", bg: "#172554" },
  { id: "attivato", label: "Completato", color: "#22c55e", bg: "#052e16" },
  { id: "ko", label: "KO", color: "#ef4444", bg: "#450a0a" },
  { id: "ko_verifica_email", label: "KO Verifica Email", color: "#dc2626", bg: "#3f0a0a" },
  { id: "ko_credito_en", label: "KO Credito", color: "#f97316", bg: "#431407" },
  { id: "inserimento_errato", label: "Inserimento Errato", color: "#fb923c", bg: "#431407" },
  { id: "ko_reinserito_en", label: "KO Reinserito", color: "#a78bfa", bg: "#2e1065" },
  { id: "ko_mancanza_firma", label: "KO Mancanza Firma", color: "#e879f9", bg: "#4a044e" },
  { id: "ko_sii", label: "KO dal Sii", color: "#dc2626", bg: "#3f0a0a" },
];

export const STATI_NEGOZIO_SKY = [
  { id: "nuovo", label: "Nuovo", color: "#94a3b8", bg: "#1e293b" },
  { id: "contattare_cliente", label: "Contattato Cliente", color: "#f59e0b", bg: "#451a03" },
  { id: "in_attivazione_sky", label: "In Attivazione", color: "#3b82f6", bg: "#172554" },
  { id: "wm_sospetta", label: "WM Sospetta", color: "#f97316", bg: "#431407" },
  { id: "wm_confermata", label: "TV WM - BB in Corso", color: "#fb923c", bg: "#451a03" },
  { id: "tv_wm_bb_ok", label: "TV WM - BB Ok", color: "#4ade80", bg: "#052e16" },
  { id: "completo_sky", label: "Completo", color: "#22c55e", bg: "#052e16" },
  { id: "attesa_matricola", label: "Attesa Matricola", color: "#38bdf8", bg: "#0c2a3f" },
  { id: "ripensamento_sky", label: "Ripensamento Cliente", color: "#e879f9", bg: "#3b0764" },
  { id: "attivo_sky", label: "Attivo", color: "#4ade80", bg: "#052e16" },
  { id: "ko_frode_mop", label: "KO Frode MOP", color: "#dc2626", bg: "#3f0a0a" },
  { id: "ko_reinserito_sky", label: "KO Reinserito", color: "#a78bfa", bg: "#2e1065" },
  { id: "aperto_sparks", label: "Aperto Sparks", color: "#fbbf24", bg: "#451a03" },
  { id: "recesso_info_errate", label: "Recesso per Info Errate", color: "#f43f5e", bg: "#4c0519" },
];

export const STATI_ADMIN = [
  { id: "da_verificare", label: "Da Verificare", color: "#64748b", bg: "#1e293b" },
  { id: "in_lavorazione", label: "In Lavorazione", color: "#3b82f6", bg: "#172554" },
  { id: "non_conforme", label: "Non Conforme", color: "#f97316", bg: "#431407" },
  { id: "confermato", label: "Confermato", color: "#22c55e", bg: "#052e16" },
  { id: "pagato", label: "Pagato", color: "#a78bfa", bg: "#2e1065" },
  { id: "stornato", label: "Stornato", color: "#ef4444", bg: "#450a0a" },
];

export const STATI_ADMIN_FINANZIAMENTO = [
  ...STATI_ADMIN,
  { id: "stornato_da_ripagare", label: "Stornato, Da Ripagare", color: "#fb923c", bg: "#431407" },
  { id: "ripagato", label: "Ripagato", color: "#4ade80", bg: "#052e16" },
];

export const ALL_BRANDS = ["Vodafone", "Fastweb", "WindTre", "Iliad", "Tim", "S4 Energy", "Sky"];

export const MALUS_SOGLIE: Record<string, number | null> = {
  mnp: 6,
  fisso: 15,
  finanziamento: 6,
  piva: 6,
  energia: 15,
  sky: 2,
};

export const MALUS_IMPORTO: Record<string, number> = {
  mnp: 5,
  fisso: 10,
  finanziamento: 10,
  piva: 5,
  energia: 10,
  sky: 5,
};

export type StoriaEvent = {
  data: string;
  tipo: string;
  testo: string;
  utente: string;
  ruolo: string;
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
  // Una pratica con MNP + finanziamento compare su due righe: serve una chiave
  // distinta, mentre `id` resta quello del contratto per gli aggiornamenti.
  rowKey?: string;
  statoNegozio: string;
  statoAdmin: string;
  storia: StoriaEvent[];
  cf: string;
  indirizzo: string;
  // Delega verifica (Tracking PDA): a chi e' delegata la pratica.
  delegated_to?: string | null;
  delegated_by?: string | null;
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
