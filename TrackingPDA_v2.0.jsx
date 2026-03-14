// TrackingPDA_v1.jsx — Standalone prototype
// Build: npx babel --presets @babel/preset-react TrackingPDA_v1.jsx -o TrackingPDA_v1.js

const { useState, useMemo } = React;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CATEGORIE = [
  { id: "mnp",         label: "MNP",          desc: "Portabilità mobile",         color: "#6366f1" },
  { id: "fisso",       label: "Fisso",         desc: "Linee fisse tutti gli op.",  color: "#0ea5e9" },
  { id: "finanziamento", label: "Finanziamento", desc: "Wind / VF / Fastweb",       color: "#f59e0b" },
  { id: "piva",        label: "P.IVA",         desc: "Vodafone Business",          color: "#8b5cf6" },
  { id: "energia",     label: "Energia",       desc: "Luce & Gas tutti gli op.",   color: "#10b981" },
  { id: "sky",         label: "Sky",           desc: "Sky 3P / Sky solo V",        color: "#ef4444" },
];

// Stati operativi del negozio
// "nuovo" = stato automatico all'inserimento, non ancora verificato da nessuno
const STATI_NEGOZIO = [
  { id: "nuovo",               label: "Nuovo",               color: "#94a3b8", bg: "#1e293b" },
  { id: "contattare_cliente",  label: "Contattato Cliente",  color: "#f59e0b", bg: "#451a03" },
  { id: "contattare_supporto", label: "Contattato Supporto", color: "#f97316", bg: "#431407" },
  { id: "doc_mancante",        label: "Doc Mancante",        color: "#e879f9", bg: "#3b0764" },
  { id: "in_corso",            label: "In Corso",            color: "#3b82f6", bg: "#172554" },
  { id: "attivato",            label: "Completato",          color: "#22c55e", bg: "#052e16" },
  { id: "ko",                  label: "KO",                  color: "#ef4444", bg: "#450a0a" },
];

// Stati MNP: senza Doc Mancante e Contattato Supporto; con Re-Inserita aggiuntivo
const STATI_NEGOZIO_MNP = STATI_NEGOZIO.filter(function(s) {
  return s.id !== "doc_mancante" && s.id !== "contattare_supporto";
}).concat([
  { id: "re_inserita", label: "Re-Inserita", color: "#38bdf8", bg: "#0c2a3f" },
]);

// Stati Fisso: senza Doc Mancante; KO → KO Ripensamento + 3 stati aggiuntivi
const STATI_NEGOZIO_FISSO = [
  { id: "nuovo",               label: "Nuovo",               color: "#94a3b8", bg: "#1e293b" },
  { id: "contattare_cliente",  label: "Contattato Cliente",  color: "#f59e0b", bg: "#451a03" },
  { id: "contattare_supporto", label: "Contattato Supporto", color: "#f97316", bg: "#431407" },
  { id: "in_corso",            label: "In Corso",            color: "#3b82f6", bg: "#172554" },
  { id: "attivato",            label: "Completato",          color: "#22c55e", bg: "#052e16" },
  { id: "ko",                  label: "KO Ripensamento",     color: "#ef4444", bg: "#450a0a" },
  { id: "ko_tecnico",          label: "KO Tecnico Definitivo", color: "#dc2626", bg: "#3f0a0a" },
  { id: "ko_reinserito",       label: "KO Reinserito",       color: "#f97316", bg: "#431407" },
  { id: "ricaduta",            label: "Ricaduta",            color: "#a78bfa", bg: "#2e1065" },
];

// Stati Finanziamento: set dedicato (senza Contattato Cliente, Completato, KO, In Corso)
const STATI_NEGOZIO_FINANZIAMENTO = [
  { id: "nuovo",          label: "Nuovo",          color: "#94a3b8", bg: "#1e293b" },
  { id: "otp_mancante",   label: "OTP Mancante",   color: "#f59e0b", bg: "#451a03" },
  { id: "liquidato",      label: "Liquidato",      color: "#22c55e", bg: "#052e16" },
  { id: "annullato",      label: "Annullato",      color: "#ef4444", bg: "#450a0a" },
  { id: "cartaceo",       label: "Cartaceo",       color: "#e879f9", bg: "#3b0764" },
  { id: "in_liquidazione",label: "In Liquidazione",color: "#3b82f6", bg: "#172554" },
  { id: "doc_mancante",   label: "Doc Mancante",   color: "#fb923c", bg: "#431407" },
  { id: "contattare_supporto", label: "Contattato Supporto", color: "#f97316", bg: "#431407" },
  { id: "modulo_win_back",    label: "Modulo Win Back",     color: "#818cf8", bg: "#1e1b4b" },
];

// Stati P.IVA: rimuove In Corso e Doc Mancante; aggiunge stati specifici
const STATI_NEGOZIO_PIVA = [
  { id: "nuovo",              label: "Nuovo",               color: "#94a3b8", bg: "#1e293b" },
  { id: "contattare_cliente", label: "Contattato Cliente",  color: "#f59e0b", bg: "#451a03" },
  { id: "contattare_supporto",label: "Contattato Supporto", color: "#f97316", bg: "#431407" },
  { id: "in_lavorazione",     label: "In Lavorazione",      color: "#3b82f6", bg: "#172554" },
  { id: "cliente_irreperibile",label: "Cliente Irreperibile",color: "#e879f9", bg: "#3b0764" },
  { id: "in_attesa_dispositivo",label:"In Attesa Dispositivo",color: "#38bdf8", bg: "#0c2a3f" },
  { id: "attivato",           label: "Completato",          color: "#22c55e", bg: "#052e16" },
  { id: "ko_tecnico_piva",    label: "KO Tecnico",          color: "#dc2626", bg: "#3f0a0a" },
  { id: "ko_credito",         label: "KO Credito",          color: "#f97316", bg: "#431407" },
  { id: "ko_reinserito_piva", label: "KO Reinserito",       color: "#a78bfa", bg: "#2e1065" },
];


// Stati Energia: In Corso → In Lavorazione + 5 nuovi KO/stati
const STATI_NEGOZIO_ENERGIA = [
  { id: "nuovo",              label: "Nuovo",               color: "#94a3b8", bg: "#1e293b" },
  { id: "contattare_cliente", label: "Contattato Cliente",  color: "#f59e0b", bg: "#451a03" },
  { id: "contattare_supporto",label: "Contattato Supporto", color: "#f97316", bg: "#431407" },
  { id: "doc_mancante",       label: "Doc Mancante",        color: "#e879f9", bg: "#3b0764" },
  { id: "in_lavorazione_en",  label: "In Lavorazione",      color: "#3b82f6", bg: "#172554" },
  { id: "attivato",           label: "Completato",          color: "#22c55e", bg: "#052e16" },
  { id: "ko",                 label: "KO",                  color: "#ef4444", bg: "#450a0a" },
  { id: "ko_verifica_email",  label: "KO Verifica Email",   color: "#dc2626", bg: "#3f0a0a" },
  { id: "ko_credito_en",      label: "KO Credito",          color: "#f97316", bg: "#431407" },
  { id: "inserimento_errato", label: "Inserimento Errato",  color: "#fb923c", bg: "#431407" },
  { id: "ko_reinserito_en",   label: "KO Reinserito",       color: "#a78bfa", bg: "#2e1065" },
  { id: "ko_mancanza_firma",  label: "KO Mancanza Firma",   color: "#e879f9", bg: "#4a044e" },
  { id: "ko_sii",            label: "KO dal Sii",           color: "#dc2626", bg: "#3f0a0a" },
];

// Stati Sky: set dedicato senza Completato/Contattato Supporto/Doc Mancante/In Corso
const STATI_NEGOZIO_SKY = [
  { id: "nuovo",              label: "Nuovo",               color: "#94a3b8", bg: "#1e293b" },
  { id: "contattare_cliente", label: "Contattato Cliente",  color: "#f59e0b", bg: "#451a03" },
  { id: "in_attivazione_sky", label: "In Attivazione",      color: "#3b82f6", bg: "#172554" },
  { id: "wm_sospetta",        label: "WM Sospetta",         color: "#f97316", bg: "#431407" },
  { id: "wm_confermata",      label: "TV WM - BB in Corso", color: "#fb923c", bg: "#451a03" },
  { id: "tv_wm_bb_ok",        label: "TV WM - BB Ok",       color: "#4ade80", bg: "#052e16" },
  { id: "completo_sky",       label: "Completo",            color: "#22c55e", bg: "#052e16" },
  { id: "attesa_matricola",   label: "Attesa Matricola",    color: "#38bdf8", bg: "#0c2a3f" },
  { id: "ripensamento_sky",   label: "Ripensamento Cliente",color: "#e879f9", bg: "#3b0764" },
  { id: "attivo_sky",         label: "Attivo",              color: "#4ade80", bg: "#052e16" },
  { id: "ko_frode_mop",       label: "KO Frode MOP",        color: "#dc2626", bg: "#3f0a0a" },
  { id: "ko_reinserito_sky",  label: "KO Reinserito",       color: "#a78bfa", bg: "#2e1065" },
  { id: "aperto_sparks",      label: "Aperto Sparks",       color: "#fbbf24", bg: "#451a03" },
  { id: "recesso_info_errate",label: "Recesso per Info Errate", color: "#f43f5e", bg: "#4c0519" },
];

const STATI_ADMIN = [
  { id: "da_verificare",  label: "Da Verificare",  color: "#64748b", bg: "#1e293b" },
  { id: "in_lavorazione", label: "In Lavorazione", color: "#3b82f6", bg: "#172554" },
  { id: "non_conforme",   label: "Non Conforme",   color: "#f97316", bg: "#431407" },
  { id: "confermato",     label: "Confermato",     color: "#22c55e", bg: "#052e16" },
  { id: "pagato",         label: "Pagato",         color: "#a78bfa", bg: "#2e1065" },
  { id: "stornato",       label: "Stornato",       color: "#ef4444", bg: "#450a0a" },
];
// Esiti admin specifici per Finanziamento (estende il set base con 2 stati aggiuntivi)
const STATI_ADMIN_FINANZIAMENTO = [
  { id: "da_verificare",      label: "Da Verificare",       color: "#64748b", bg: "#1e293b" },
  { id: "in_lavorazione",     label: "In Lavorazione",      color: "#3b82f6", bg: "#172554" },
  { id: "non_conforme",       label: "Non Conforme",        color: "#f97316", bg: "#431407" },
  { id: "confermato",         label: "Confermato",          color: "#22c55e", bg: "#052e16" },
  { id: "pagato",             label: "Pagato",              color: "#a78bfa", bg: "#2e1065" },
  { id: "stornato",           label: "Stornato",            color: "#ef4444", bg: "#450a0a" },
  { id: "stornato_da_ripagare", label: "Stornato, Da Ripagare", color: "#fb923c", bg: "#431407" },
  { id: "ripagato",           label: "Ripagato",            color: "#4ade80", bg: "#052e16" },
];

// Alias unificato per filtri/KPI (usa stati negozio come base visiva)
const STATI = STATI_NEGOZIO;

const BRANDS = ["Vodafone", "WindTre", "Fastweb", "Sky", "Iliad", "Tim", "Enel", "Edison", "A2A", "Eni Gas"];

const NEGOZI = ["Roma Termini", "Roma Prati", "Roma EUR", "Roma Tiburtina", "Roma Tuscolana",
                "Roma Cassia", "Roma Nomentana", "Roma Appia", "Roma Aurelia", "Roma Ostiense",
                "Roma Prenestina", "Roma Flaminia", "Roma Cinecittà"];

const VENDITORI = ["Marco Rossi", "Luca Bianchi", "Sara Conti", "Giulia Esposito",
                   "Alessandro Sandri", "Matteo Ferrari", "Chiara Ricci", "Paolo Greco"];

// ─── SAMPLE DATA ──────────────────────────────────────────────────────────────

function makeSampleData() {
  return [
    {
      id: 1,
      categoria: "mnp",
      brand: "Vodafone",
      negozio: "Tiburtina",
      venditore: "Luca Bianchi",
      nominativo: "Mario Bianchi",
      telefono: "+39 3401234567",
      numContratto: "CNT-1001",
      numAttivazione: "VO-20007",
      dataInserimento: "14/03/2026",
      statoNegozio: "nuovo",
      statoAdmin: "da_verificare",
      storia: [
        { data: "14/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
    },
    {
      id: 2,
      categoria: "mnp",
      brand: "WindTre",
      negozio: "Termini",
      venditore: "Sara Rossi",
      nominativo: "Anna Verdi",
      telefono: "+39 3471234567",
      numContratto: "CNT-1002",
      numAttivazione: "WI-20014",
      dataInserimento: "13/03/2026",
      statoNegozio: "nuovo",
      statoAdmin: "da_verificare",
      storia: [
        { data: "13/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
    },
    {
      id: 3,
      categoria: "fisso",
      brand: "Fastweb",
      negozio: "Cinecittà",
      venditore: "Marco Verdi",
      nominativo: "Giuseppe Russo",
      telefono: "+39 3331234567",
      numContratto: "CNT-1003",
      numAttivazione: "FA-20021",
      dataInserimento: "13/03/2026",
      statoNegozio: "nuovo",
      statoAdmin: "da_verificare",
      storia: [
        { data: "13/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      gnp: false,
      numFissoProvvisorio: null,
      numFissoDefinitivo: null,
    },
    {
      id: 4,
      categoria: "finanziamento",
      brand: "WindTre",
      negozio: "EUR",
      venditore: "Elena Neri",
      nominativo: "Francesca Marino",
      telefono: "+39 3481234567",
      numContratto: "CNT-1004",
      numAttivazione: "WI-20028",
      dataInserimento: "14/03/2026",
      statoNegozio: "nuovo",
      statoAdmin: "da_verificare",
      storia: [
        { data: "14/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      tipoFinanziamento: "Compass",
      codiceNegozio: "TF-003",
      modelloTelefono: "iPhone 15 Pro 256GB",
      numeroPratica: null,
      hasPda: true,
      hasDocumenti: true,
    },
    {
      id: 5,
      categoria: "sky",
      brand: "Sky",
      negozio: "Prati",
      venditore: "Giorgio Russo",
      nominativo: "Roberto Esposito",
      telefono: "+39 3491234567",
      numContratto: "CNT-1005",
      numAttivazione: "SK-20035",
      dataInserimento: "14/03/2026",
      statoNegozio: "nuovo",
      statoAdmin: "da_verificare",
      storia: [
        { data: "14/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
    },
    {
      id: 6,
      categoria: "energia",
      brand: "S4 Energy",
      negozio: "Tiburtina",
      venditore: "Luca Bianchi",
      nominativo: "Elena Colombo",
      telefono: "+39 3501234567",
      numContratto: "CNT-1006",
      numAttivazione: "S4-20042",
      dataInserimento: "13/03/2026",
      statoNegozio: "nuovo",
      statoAdmin: "da_verificare",
      storia: [
        { data: "13/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      tipoEnergia: "Luce",
      pod: "IT001E000111222A",
      pdr: null,
    },
    {
      id: 7,
      categoria: "piva",
      brand: "Vodafone",
      negozio: "Termini",
      venditore: "Sara Rossi",
      nominativo: "Davide Rizzo",
      telefono: "+39 3511234567",
      numContratto: "CNT-1007",
      numAttivazione: "VO-20049",
      dataInserimento: "14/03/2026",
      statoNegozio: "nuovo",
      statoAdmin: "da_verificare",
      storia: [
        { data: "14/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
    },
    {
      id: 8,
      categoria: "mnp",
      brand: "Iliad",
      negozio: "Cinecittà",
      venditore: "Marco Verdi",
      nominativo: "Simone Greco",
      telefono: "+39 3521234567",
      numContratto: "CNT-1008",
      numAttivazione: "IL-20056",
      dataInserimento: "11/03/2026",
      statoNegozio: "contattare_cliente",
      statoAdmin: "in_lavorazione",
      storia: [
        { data: "11/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "12/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → Contattato Cliente — cliente risponde domani", utente: "Marco Verdi", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
    },
    {
      id: 9,
      categoria: "mnp",
      brand: "Tim",
      negozio: "EUR",
      venditore: "Elena Neri",
      nominativo: "Monica De Luca",
      telefono: "+39 3531234567",
      numContratto: "CNT-1009",
      numAttivazione: "TI-20063",
      dataInserimento: "10/03/2026",
      statoNegozio: "contattare_cliente",
      statoAdmin: "da_verificare",
      storia: [
        { data: "10/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "11/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → Contattato Cliente — SIM non arrivata", utente: "Elena Neri", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
    },
    {
      id: 10,
      categoria: "fisso",
      brand: "Vodafone",
      negozio: "Prati",
      venditore: "Giorgio Russo",
      nominativo: "Carla Ferrara",
      telefono: "+39 3541234567",
      numContratto: "CNT-1010",
      numAttivazione: "VO-20070",
      dataInserimento: "06/03/2026",
      statoNegozio: "in_corso",
      statoAdmin: "da_verificare",
      storia: [
        { data: "06/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "07/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Corso — portabilità avviata", utente: "Giorgio Russo", ruolo: "negozio" },
        { data: "09/03/2026", tipo: "nota", testo: "Nota: operatore ha confermato ricezione pratica", utente: "Giorgio Russo", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      gnp: true,
      numFissoProvvisorio: "0612345678",
      numFissoDefinitivo: null,
    },
    {
      id: 11,
      categoria: "fisso",
      brand: "WindTre",
      negozio: "Tiburtina",
      venditore: "Luca Bianchi",
      nominativo: "Luca Fontana",
      telefono: "+39 3551234567",
      numContratto: "CNT-1011",
      numAttivazione: "WI-20077",
      dataInserimento: "05/03/2026",
      statoNegozio: "contattare_supporto",
      statoAdmin: "da_verificare",
      storia: [
        { data: "05/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "06/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → Contattato Supporto — problema tecnico segnalato", utente: "Luca Bianchi", ruolo: "negozio" },
        { data: "07/03/2026", tipo: "nota", testo: "Nota: ticket aperto su portale WindTre", utente: "Luca Bianchi", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      gnp: false,
      numFissoProvvisorio: null,
      numFissoDefinitivo: null,
    },
    {
      id: 12,
      categoria: "finanziamento",
      brand: "Vodafone",
      negozio: "Termini",
      venditore: "Sara Rossi",
      nominativo: "Anna Sorrentino",
      telefono: "+39 3561234567",
      numContratto: "CNT-1012",
      numAttivazione: "VO-20084",
      dataInserimento: "11/03/2026",
      statoNegozio: "otp_mancante",
      statoAdmin: "da_verificare",
      storia: [
        { data: "11/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "12/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → OTP Mancante — cliente non ha ricevuto OTP", utente: "Sara Rossi", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      tipoFinanziamento: "Findomestic",
      codiceNegozio: "TF-001",
      modelloTelefono: "Samsung Galaxy S24",
      numeroPratica: "VF-PRAT-80050",
      hasPda: true,
      hasDocumenti: false,
    },
    {
      id: 13,
      categoria: "finanziamento",
      brand: "Fastweb",
      negozio: "Cinecittà",
      venditore: "Marco Verdi",
      nominativo: "Paolo Ricci",
      telefono: "+39 3571234567",
      numContratto: "CNT-1013",
      numAttivazione: "FA-20091",
      dataInserimento: "10/03/2026",
      statoNegozio: "in_liquidazione",
      statoAdmin: "in_lavorazione",
      storia: [
        { data: "10/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "11/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Liquidazione — pratica in attesa di firma banca", utente: "Marco Verdi", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      tipoFinanziamento: "Compass",
      codiceNegozio: "TF-003",
      modelloTelefono: "iPhone 14 128GB",
      numeroPratica: null,
      hasPda: true,
      hasDocumenti: true,
    },
    {
      id: 14,
      categoria: "piva",
      brand: "Vodafone",
      negozio: "EUR",
      venditore: "Elena Neri",
      nominativo: "Stefania Mancini",
      telefono: "+39 3581234567",
      numContratto: "CNT-1014",
      numAttivazione: "VO-20098",
      dataInserimento: "11/03/2026",
      statoNegozio: "in_lavorazione",
      statoAdmin: "da_verificare",
      storia: [
        { data: "11/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "12/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Lavorazione — verifica documentazione in corso", utente: "Elena Neri", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
    },
    {
      id: 15,
      categoria: "piva",
      brand: "Vodafone",
      negozio: "Prati",
      venditore: "Giorgio Russo",
      nominativo: "Emanuele Costa",
      telefono: "+39 3591234567",
      numContratto: "CNT-1015",
      numAttivazione: "VO-20105",
      dataInserimento: "09/03/2026",
      statoNegozio: "cliente_irreperibile",
      statoAdmin: "da_verificare",
      storia: [
        { data: "09/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "10/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Lavorazione — prima chiamata effettuata", utente: "Giorgio Russo", ruolo: "negozio" },
        { data: "11/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: In Lavorazione → Cliente Irreperibile — nessuna risposta dopo 3 tentativi", utente: "Giorgio Russo", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      followup: [{ label: "Follow-up 1", data: "10/03/2026", esito: "Nessuna risposta", note: "Chiamato alle 10:30" }, { label: "Follow-up 2", data: "11/03/2026", esito: "Nessuna risposta", note: "Chiamato alle 15:00" }, { label: "Follow-up 3", data: "", esito: "", note: "" }],
    },
    {
      id: 16,
      categoria: "energia",
      brand: "S4 Energy",
      negozio: "Tiburtina",
      venditore: "Luca Bianchi",
      nominativo: "Valeria Galli",
      telefono: "+39 3601234567",
      numContratto: "CNT-1016",
      numAttivazione: "S4-20112",
      dataInserimento: "06/03/2026",
      statoNegozio: "contattare_cliente",
      statoAdmin: "in_lavorazione",
      storia: [
        { data: "06/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "07/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → Contattato Cliente — documentazione richiesta", utente: "Luca Bianchi", ruolo: "negozio" },
        { data: "09/03/2026", tipo: "nota", testo: "Nota: cliente ha inviato bolletta, in attesa verifica POD", utente: "Luca Bianchi", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      tipoEnergia: "Luce",
      pod: "IT001E000222333B",
      pdr: null,
    },
    {
      id: 17,
      categoria: "energia",
      brand: "S4 Energy",
      negozio: "Termini",
      venditore: "Sara Rossi",
      nominativo: "Alberto Marini",
      telefono: "+39 3611234567",
      numContratto: "CNT-1017",
      numAttivazione: "S4-20119",
      dataInserimento: "05/03/2026",
      statoNegozio: "doc_mancante",
      statoAdmin: "da_verificare",
      storia: [
        { data: "05/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "06/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → Doc Mancante — mancano ultime 2 bollette", utente: "Sara Rossi", ruolo: "negozio" },
        { data: "07/03/2026", tipo: "nota", testo: "Nota: sollecitato cliente tramite WhatsApp", utente: "Sara Rossi", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      tipoEnergia: "Gas",
      pod: null,
      pdr: "6543210987654",
    },
    {
      id: 18,
      categoria: "sky",
      brand: "Sky",
      negozio: "Cinecittà",
      venditore: "Marco Verdi",
      nominativo: "Cristina Ferretti",
      telefono: "+39 3621234567",
      numContratto: "CNT-1018",
      numAttivazione: "SK-20126",
      dataInserimento: "12/03/2026",
      statoNegozio: "nuovo",
      statoAdmin: "da_verificare",
      storia: [
        { data: "12/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
    },
    {
      id: 19,
      categoria: "sky",
      brand: "Sky",
      negozio: "EUR",
      venditore: "Elena Neri",
      nominativo: "Nicola Amato",
      telefono: "+39 3631234567",
      numContratto: "CNT-1019",
      numAttivazione: "SK-20133",
      dataInserimento: "07/03/2026",
      statoNegozio: "wm_sospetta",
      statoAdmin: "in_lavorazione",
      storia: [
        { data: "07/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "09/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Attivazione — pratica inviata a Sky", utente: "Elena Neri", ruolo: "negozio" },
        { data: "10/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: In Attivazione → WM Sospetta — Sky segnala indirizzo non verificabile", utente: "Elena Neri", ruolo: "negozio" },
        { data: "11/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: WM Sospetta — in attesa di documentazione integrativa da cliente", utente: "Elena Neri", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
    },
    {
      id: 20,
      categoria: "sky",
      brand: "Sky",
      negozio: "Prati",
      venditore: "Giorgio Russo",
      nominativo: "Federica Pellegrini",
      telefono: "+39 3641234567",
      numContratto: "CNT-1020",
      numAttivazione: "SK-20140",
      dataInserimento: "28/02/2026",
      statoNegozio: "attesa_matricola",
      statoAdmin: "confermato",
      storia: [
        { data: "28/02/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "02/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Attivazione", utente: "Giorgio Russo", ruolo: "negozio" },
        { data: "04/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: In Attivazione → Attesa Matricola — decoder spedito, in attesa conferma", utente: "Giorgio Russo", ruolo: "negozio" },
        { data: "09/03/2026", tipo: "nota", testo: "Nota: tracking pacco: in consegna", utente: "Giorgio Russo", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
    },
    {
      id: 21,
      categoria: "mnp",
      brand: "Vodafone",
      negozio: "Tiburtina",
      venditore: "Luca Bianchi",
      nominativo: "Lorenzo Barbieri",
      telefono: "+39 3651234567",
      numContratto: "CNT-1021",
      numAttivazione: "VO-20147",
      dataInserimento: "05/03/2026",
      statoNegozio: "contattare_supporto",
      statoAdmin: "non_conforme",
      storia: [
        { data: "05/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "06/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → Contattato Cliente — SIM bloccata", utente: "Luca Bianchi", ruolo: "negozio" },
        { data: "07/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Contattato Cliente → Contattato Supporto — aperto ticket su portale", utente: "Luca Bianchi", ruolo: "negozio" },
        { data: "09/03/2026", tipo: "nota_admin", testo: "Esito admin: Non Conforme — documentazione incompleta, richiedere copia CF", utente: "Admin", ruolo: "admin" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      codiceNegozio: "TF-001",
      hasPda: true,
      hasDocumenti: false,
    },
    {
      id: 22,
      categoria: "mnp",
      brand: "Fastweb",
      negozio: "Termini",
      venditore: "Sara Rossi",
      nominativo: "Giulia Santoro",
      telefono: "+39 3661234567",
      numContratto: "CNT-1022",
      numAttivazione: "FA-20154",
      dataInserimento: "04/03/2026",
      statoNegozio: "doc_mancante",
      statoAdmin: "in_lavorazione",
      storia: [
        { data: "04/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "05/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → Contattato Cliente", utente: "Sara Rossi", ruolo: "negozio" },
        { data: "06/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Contattato Cliente → Doc Mancante — manca copia documento", utente: "Sara Rossi", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      codiceNegozio: "TF-003",
      hasPda: true,
      hasDocumenti: false,
    },
    {
      id: 23,
      categoria: "fisso",
      brand: "Tim",
      negozio: "Cinecittà",
      venditore: "Marco Verdi",
      nominativo: "Marco Conti",
      telefono: "+39 3671234567",
      numContratto: "CNT-1023",
      numAttivazione: "TI-20161",
      dataInserimento: "27/02/2026",
      statoNegozio: "contattare_supporto",
      statoAdmin: "in_lavorazione",
      storia: [
        { data: "27/02/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "28/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Corso — pratica avviata", utente: "Marco Verdi", ruolo: "negozio" },
        { data: "02/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: In Corso → Contattato Supporto — problemi tecnici linea", utente: "Marco Verdi", ruolo: "negozio" },
        { data: "03/03/2026", tipo: "nota", testo: "Nota: tecnico passato, problema non risolto, riapertura ticket", utente: "Marco Verdi", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      gnp: true,
      numFissoProvvisorio: "0623456789",
      numFissoDefinitivo: "0698765432",
    },
    {
      id: 24,
      categoria: "fisso",
      brand: "Fastweb",
      negozio: "EUR",
      venditore: "Elena Neri",
      nominativo: "Chiara Romano",
      telefono: "+39 3681234567",
      numContratto: "CNT-1024",
      numAttivazione: "FA-20168",
      dataInserimento: "26/02/2026",
      statoNegozio: "in_corso",
      statoAdmin: "da_verificare",
      storia: [
        { data: "26/02/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "27/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Corso — richiesta attivazione", utente: "Elena Neri", ruolo: "negozio" },
        { data: "02/03/2026", tipo: "nota", testo: "Nota: cliente ha confermato disponibilità tecnico", utente: "Elena Neri", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      gnp: false,
      numFissoProvvisorio: null,
      numFissoDefinitivo: null,
    },
    {
      id: 25,
      categoria: "finanziamento",
      brand: "WindTre",
      negozio: "Prati",
      venditore: "Giorgio Russo",
      nominativo: "Massimo Vitale",
      telefono: "+39 3691234567",
      numContratto: "CNT-1025",
      numAttivazione: "WI-20175",
      dataInserimento: "07/03/2026",
      statoNegozio: "doc_mancante",
      statoAdmin: "non_conforme",
      storia: [
        { data: "07/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "09/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → OTP Mancante — cliente non ha completato OTP", utente: "Giorgio Russo", ruolo: "negozio" },
        { data: "10/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: OTP Mancante → Doc Mancante — richiesto documento aggiuntivo", utente: "Giorgio Russo", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      tipoFinanziamento: "Findomestic",
      codiceNegozio: "TF-015",
      modelloTelefono: "Xiaomi 14 256GB",
      numeroPratica: null,
      hasPda: true,
      hasDocumenti: false,
    },
    {
      id: 26,
      categoria: "finanziamento",
      brand: "Vodafone",
      negozio: "Tiburtina",
      venditore: "Luca Bianchi",
      nominativo: "Benedetta Fabbri",
      telefono: "+39 3701234567",
      numContratto: "CNT-1026",
      numAttivazione: "VO-20182",
      dataInserimento: "06/03/2026",
      statoNegozio: "contattare_supporto",
      statoAdmin: "in_lavorazione",
      storia: [
        { data: "06/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "07/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Liquidazione — pratica in banca", utente: "Luca Bianchi", ruolo: "negozio" },
        { data: "09/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: In Liquidazione → Contattato Supporto — banca ha rifiutato prima verifica", utente: "Luca Bianchi", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      tipoFinanziamento: "Compass",
      codiceNegozio: "TF-001",
      modelloTelefono: "Samsung A55",
      numeroPratica: "VF-PRAT-80099",
      hasPda: true,
      hasDocumenti: true,
    },
    {
      id: 27,
      categoria: "piva",
      brand: "Vodafone",
      negozio: "Termini",
      venditore: "Sara Rossi",
      nominativo: "Andrea Pellegrino",
      telefono: "+39 3711234567",
      numContratto: "CNT-1027",
      numAttivazione: "VO-20189",
      dataInserimento: "07/03/2026",
      statoNegozio: "contattare_supporto",
      statoAdmin: "in_lavorazione",
      storia: [
        { data: "07/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "09/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Lavorazione — pratica avviata per business", utente: "Sara Rossi", ruolo: "negozio" },
        { data: "10/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: In Lavorazione → Contattato Supporto — verifica P.IVA pendente", utente: "Sara Rossi", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
    },
    {
      id: 28,
      categoria: "piva",
      brand: "Vodafone",
      negozio: "Cinecittà",
      venditore: "Marco Verdi",
      nominativo: "Rossana Cattaneo",
      telefono: "+39 3721234567",
      numContratto: "CNT-1028",
      numAttivazione: "VO-20196",
      dataInserimento: "02/03/2026",
      statoNegozio: "in_attesa_dispositivo",
      statoAdmin: "da_verificare",
      storia: [
        { data: "02/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "03/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Lavorazione", utente: "Marco Verdi", ruolo: "negozio" },
        { data: "05/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: In Lavorazione → In Attesa Dispositivo — tablet in ordine", utente: "Marco Verdi", ruolo: "negozio" },
        { data: "07/03/2026", tipo: "nota", testo: "Nota: spedizione confermata, in arrivo", utente: "Marco Verdi", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
    },
    {
      id: 29,
      categoria: "energia",
      brand: "S4 Energy",
      negozio: "EUR",
      venditore: "Elena Neri",
      nominativo: "Daniele Serra",
      telefono: "+39 3731234567",
      numContratto: "CNT-1029",
      numAttivazione: "S4-20203",
      dataInserimento: "27/02/2026",
      statoNegozio: "inserimento_errato",
      statoAdmin: "non_conforme",
      storia: [
        { data: "27/02/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "28/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → Contattato Cliente — cliente segnala dati errati", utente: "Elena Neri", ruolo: "negozio" },
        { data: "02/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Contattato Cliente → Inserimento Errato — POD inserito non corrisponde", utente: "Elena Neri", ruolo: "negozio" },
        { data: "03/03/2026", tipo: "nota_admin", testo: "Esito admin: Non Conforme — verificare POD con cliente e reinserire", utente: "Admin", ruolo: "admin" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      tipoEnergia: "Luce",
      pod: "IT001E000999888Z",
      pdr: null,
    },
    {
      id: 30,
      categoria: "sky",
      brand: "Sky",
      negozio: "Prati",
      venditore: "Giorgio Russo",
      nominativo: "Tiziana Greco",
      telefono: "+39 3741234567",
      numContratto: "CNT-1030",
      numAttivazione: "SK-20210",
      dataInserimento: "10/03/2026",
      statoNegozio: "nuovo",
      statoAdmin: "da_verificare",
      storia: [
        { data: "10/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
    },
    {
      id: 31,
      categoria: "sky",
      brand: "Sky",
      negozio: "Tiburtina",
      venditore: "Luca Bianchi",
      nominativo: "Fabrizio Moretti",
      telefono: "+39 3751234567",
      numContratto: "CNT-1031",
      numAttivazione: "SK-20217",
      dataInserimento: "26/02/2026",
      statoNegozio: "in_attivazione_sky",
      statoAdmin: "in_lavorazione",
      storia: [
        { data: "26/02/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "27/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Attivazione — pratica inviata a Sky", utente: "Luca Bianchi", ruolo: "negozio" },
        { data: "02/03/2026", tipo: "nota", testo: "Nota: Sky ha confermato ricezione, in lavorazione", utente: "Luca Bianchi", ruolo: "negozio" },
        { data: "03/03/2026", tipo: "nota", testo: "Nota: sollecito inviato a Sky per aggiornamento stato", utente: "Luca Bianchi", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
    },
    {
      id: 32,
      categoria: "mnp",
      brand: "Vodafone",
      negozio: "Termini",
      venditore: "Sara Rossi",
      nominativo: "Irene Pellegrini",
      telefono: "+39 3761234567",
      numContratto: "CNT-1032",
      numAttivazione: "VO-20224",
      dataInserimento: "28/02/2026",
      statoNegozio: "contattare_cliente",
      statoAdmin: "non_conforme",
      storia: [
        { data: "28/02/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "02/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → Contattato Cliente — SIM ancora in transito", utente: "Sara Rossi", ruolo: "negozio" },
        { data: "04/03/2026", tipo: "nota", testo: "Nota: secondo tentativo di contatto fallito", utente: "Sara Rossi", ruolo: "negozio" },
        { data: "05/03/2026", tipo: "nota_admin", testo: "Esito admin: Non Conforme — pratica bloccata, richiedere documentazione nuova", utente: "Admin", ruolo: "admin" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      codiceNegozio: "TF-003",
      hasPda: true,
      hasDocumenti: false,
    },
    {
      id: 33,
      categoria: "mnp",
      brand: "Iliad",
      negozio: "Cinecittà",
      venditore: "Marco Verdi",
      nominativo: "Sergio Bianco",
      telefono: "+39 3771234567",
      numContratto: "CNT-1033",
      numAttivazione: "IL-20231",
      dataInserimento: "27/02/2026",
      statoNegozio: "doc_mancante",
      statoAdmin: "non_conforme",
      storia: [
        { data: "27/02/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "28/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → Contattato Cliente", utente: "Marco Verdi", ruolo: "negozio" },
        { data: "03/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Contattato Cliente → Doc Mancante — mancano documenti identità", utente: "Marco Verdi", ruolo: "negozio" },
        { data: "04/03/2026", tipo: "nota_admin", testo: "Esito admin: Non Conforme — sollecitare cliente urgentemente", utente: "Admin", ruolo: "admin" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      codiceNegozio: "TF-007",
      hasPda: true,
      hasDocumenti: false,
    },
    {
      id: 34,
      categoria: "fisso",
      brand: "Vodafone",
      negozio: "EUR",
      venditore: "Elena Neri",
      nominativo: "Patrizia Conti",
      telefono: "+39 3781234567",
      numContratto: "CNT-1034",
      numAttivazione: "VO-20238",
      dataInserimento: "19/02/2026",
      statoNegozio: "ko_ripensamento",
      statoAdmin: "da_verificare",
      storia: [
        { data: "19/02/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "20/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Corso — attivazione programmata", utente: "Elena Neri", ruolo: "negozio" },
        { data: "23/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: In Corso → Contattato Supporto — cliente chiede informazioni", utente: "Elena Neri", ruolo: "negozio" },
        { data: "24/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Contattato Supporto → KO Ripensamento — cliente ha cambiato idea", utente: "Elena Neri", ruolo: "negozio" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      gnp: true,
      numFissoProvvisorio: "0634567890",
      numFissoDefinitivo: null,
    },
    {
      id: 35,
      categoria: "finanziamento",
      brand: "WindTre",
      negozio: "Prati",
      venditore: "Giorgio Russo",
      nominativo: "Renato Galli",
      telefono: "+39 3791234567",
      numContratto: "CNT-1035",
      numAttivazione: "WI-20245",
      dataInserimento: "03/03/2026",
      statoNegozio: "otp_mancante",
      statoAdmin: "non_conforme",
      storia: [
        { data: "03/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "04/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → OTP Mancante — cliente non ha completato la firma digitale", utente: "Giorgio Russo", ruolo: "negozio" },
        { data: "05/03/2026", tipo: "nota", testo: "Nota: inviato SMS promemoria per OTP", utente: "Giorgio Russo", ruolo: "negozio" },
        { data: "06/03/2026", tipo: "nota_admin", testo: "Esito admin: Non Conforme — pratica scaduta, necessario reinserimento", utente: "Admin", ruolo: "admin" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      tipoFinanziamento: "Findomestic",
      codiceNegozio: "TF-015",
      modelloTelefono: "iPhone 15 128GB",
      numeroPratica: null,
      hasPda: true,
      hasDocumenti: false,
    },
    {
      id: 36,
      categoria: "finanziamento",
      brand: "Fastweb",
      negozio: "Tiburtina",
      venditore: "Luca Bianchi",
      nominativo: "Concetta Esposito",
      telefono: "+39 3801234567",
      numContratto: "CNT-1036",
      numAttivazione: "FA-20252",
      dataInserimento: "02/03/2026",
      statoNegozio: "doc_mancante",
      statoAdmin: "non_conforme",
      storia: [
        { data: "02/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "03/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Liquidazione", utente: "Luca Bianchi", ruolo: "negozio" },
        { data: "04/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: In Liquidazione → Doc Mancante — banca richiede ulteriori documenti", utente: "Luca Bianchi", ruolo: "negozio" },
        { data: "05/03/2026", tipo: "nota_admin", testo: "Esito admin: Non Conforme — pratica bloccata in banca da oltre soglia", utente: "Admin", ruolo: "admin" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      tipoFinanziamento: "Compass",
      codiceNegozio: "TF-001",
      modelloTelefono: "Samsung A55 128GB",
      numeroPratica: null,
      hasPda: true,
      hasDocumenti: false,
    },
    {
      id: 37,
      categoria: "energia",
      brand: "S4 Energy",
      negozio: "Termini",
      venditore: "Sara Rossi",
      nominativo: "Giovanna Moretti",
      telefono: "+39 3811234567",
      numContratto: "CNT-1037",
      numAttivazione: "S4-20259",
      dataInserimento: "20/02/2026",
      statoNegozio: "ko_verifica_email",
      statoAdmin: "non_conforme",
      storia: [
        { data: "20/02/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "21/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → Contattato Cliente — attivazione fornitura gas", utente: "Sara Rossi", ruolo: "negozio" },
        { data: "24/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Contattato Cliente → KO Verifica Email — email cliente non verificata", utente: "Sara Rossi", ruolo: "negozio" },
        { data: "25/02/2026", tipo: "nota_admin", testo: "Esito admin: Non Conforme — email non verificabile, cliente da ricontattare", utente: "Admin", ruolo: "admin" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      tipoEnergia: "Gas",
      pod: null,
      pdr: "9876543210123",
    },
    {
      id: 38,
      categoria: "sky",
      brand: "Sky",
      negozio: "Cinecittà",
      venditore: "Marco Verdi",
      nominativo: "Carmelo Russo",
      telefono: "+39 3821234567",
      numContratto: "CNT-1038",
      numAttivazione: "SK-20266",
      dataInserimento: "24/02/2026",
      statoNegozio: "wm_confermata",
      statoAdmin: "non_conforme",
      storia: [
        { data: "24/02/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "25/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Attivazione", utente: "Marco Verdi", ruolo: "negozio" },
        { data: "25/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: In Attivazione → WM Sospetta", utente: "Marco Verdi", ruolo: "negozio" },
        { data: "25/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: WM Sospetta → TV WM - BB in Corso — confermata frode, pratica in verifica", utente: "Marco Verdi", ruolo: "negozio" },
        { data: "26/02/2026", tipo: "nota_admin", testo: "Esito admin: Non Conforme — pratica bloccata per sospetta frode", utente: "Admin", ruolo: "admin" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
    },
    {
      id: 39,
      categoria: "mnp",
      brand: "Tim",
      negozio: "EUR",
      venditore: "Elena Neri",
      nominativo: "Beatrice Longo",
      telefono: "+39 3831234567",
      numContratto: "CNT-1039",
      numAttivazione: "TI-20273",
      dataInserimento: "03/03/2026",
      statoNegozio: "attivato",
      statoAdmin: "confermato",
      storia: [
        { data: "03/03/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "04/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Corso — MNP avviata", utente: "Elena Neri", ruolo: "negozio" },
        { data: "06/03/2026", tipo: "cambio_stato", testo: "Stato aggiornato: In Corso → Completato — MNP eseguita con successo", utente: "Elena Neri", ruolo: "negozio" },
        { data: "07/03/2026", tipo: "nota_admin", testo: "Esito admin: Confermato — pratica verificata e approvata", utente: "Admin", ruolo: "admin" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      codiceNegozio: "TF-012",
      hasPda: true,
      hasDocumenti: true,
    },
    {
      id: 40,
      categoria: "finanziamento",
      brand: "Vodafone",
      negozio: "Prati",
      venditore: "Giorgio Russo",
      nominativo: "Matteo Ferrara",
      telefono: "+39 3841234567",
      numContratto: "CNT-1040",
      numAttivazione: "VO-20280",
      dataInserimento: "25/02/2026",
      statoNegozio: "liquidato",
      statoAdmin: "pagato",
      storia: [
        { data: "25/02/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "26/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → In Liquidazione", utente: "Giorgio Russo", ruolo: "negozio" },
        { data: "28/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: In Liquidazione → Liquidato — finanziamento erogato", utente: "Giorgio Russo", ruolo: "negozio" },
        { data: "02/03/2026", tipo: "nota_admin", testo: "Esito admin: Pagato — provvigione liquidata", utente: "Admin", ruolo: "admin" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      tipoFinanziamento: "Findomestic",
      codiceNegozio: "TF-001",
      modelloTelefono: "iPhone 15 Pro 256GB",
      numeroPratica: "VF-PRAT-80150",
      hasPda: true,
      hasDocumenti: true,
    },
    {
      id: 41,
      categoria: "energia",
      brand: "S4 Energy",
      negozio: "Tiburtina",
      venditore: "Luca Bianchi",
      nominativo: "Luisa Marini",
      telefono: "+39 3851234567",
      numContratto: "CNT-1041",
      numAttivazione: "S4-20287",
      dataInserimento: "19/02/2026",
      statoNegozio: "attivato",
      statoAdmin: "pagato",
      storia: [
        { data: "19/02/2026", tipo: "inserimento", testo: "Contratto registrato — stato iniziale: Nuovo", utente: "Sistema", ruolo: "sistema" },
        { data: "20/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Nuovo → Contattato Cliente", utente: "Luca Bianchi", ruolo: "negozio" },
        { data: "23/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: Contattato Cliente → In Lavorazione", utente: "Luca Bianchi", ruolo: "negozio" },
        { data: "26/02/2026", tipo: "cambio_stato", testo: "Stato aggiornato: In Lavorazione → Completato — fornitura attivata", utente: "Luca Bianchi", ruolo: "negozio" },
        { data: "27/02/2026", tipo: "nota_admin", testo: "Esito admin: Pagato — provvigione confermata", utente: "Admin", ruolo: "admin" }
      ],
      cf: "BNCLCA85A01H501X",
      indirizzo: "Via Roma 1, Roma",
      tipoEnergia: "Luce",
      pod: "IT001E000777666C",
      pdr: null,
    },
  ];
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

// Conta giorni lavorativi (lun–sab) tra data inserimento e oggi
function giorniLavorativiDa(dataStrIta) {
  // dataStrIta = "DD/MM/YYYY"
  var parti = dataStrIta.split("/");
  if (parti.length !== 3) return 0;
  var from = new Date(parseInt(parti[2]), parseInt(parti[1]) - 1, parseInt(parti[0]));
  var to = new Date();
  to.setHours(0, 0, 0, 0);
  from.setHours(0, 0, 0, 0);
  var count = 0;
  var cur = new Date(from);
  while (cur < to) {
    cur.setDate(cur.getDate() + 1);
    var dow = cur.getDay(); // 0=dom, 6=sab
    if (dow !== 0) count++; // lun-sab
  }
  return count;
}

// Conta giorni lavorativi dall'ultimo evento in storia
function giorniDaUltimoAggiornamento(storia) {
  if (!storia || storia.length === 0) return 999;
  var ultimo = storia[storia.length - 1];
  return giorniLavorativiDa(ultimo.data);
}

function getStatoN(id) {
  // Cerca in tutti gli stati possibili (inclusi quelli categoria-specifici)
  var tutti = STATI_NEGOZIO
    .concat(STATI_NEGOZIO_FISSO)
    .concat(STATI_NEGOZIO_MNP)
    .concat(STATI_NEGOZIO_FINANZIAMENTO)
    .concat(STATI_NEGOZIO_PIVA)
    .concat(STATI_NEGOZIO_ENERGIA)
    .concat(STATI_NEGOZIO_SKY);
  return tutti.find(function(s) { return s.id === id; }) || STATI_NEGOZIO[0];
}

// Restituisce l'array di stati corretto in base alla categoria
function getStatiNegozioPerCategoria(categoria) {
  if (categoria === "mnp")           return STATI_NEGOZIO_MNP;
  if (categoria === "fisso")         return STATI_NEGOZIO_FISSO;
  if (categoria === "finanziamento") return STATI_NEGOZIO_FINANZIAMENTO;
  if (categoria === "piva")          return STATI_NEGOZIO_PIVA;
  if (categoria === "energia")       return STATI_NEGOZIO_ENERGIA;
  if (categoria === "sky")           return STATI_NEGOZIO_SKY;
  return STATI_NEGOZIO;
}

function getStatoA(id) {
  return STATI_ADMIN.find(function(s) { return s.id === id; }) || STATI_ADMIN[0];
}

function getStato(id) {
  return getStatoN(id);
}

function getCat(id) {
  return CATEGORIE.find(function(c) { return c.id === id; }) || CATEGORIE[0];
}

// Logica ATTENZIONE centralizzata — usata sia dalla KPI che dal filtro
function isAttenzioneRow(row) {
  // Mai in Warning se la pratica è già completata
  var statiCompletati = {
    mnp:           ["attivato", "re_inserita"],
    fisso:         ["attivato"],
    finanziamento: ["liquidato"],
    piva:          ["attivato"],
    energia:       ["attivato"],
    sky:           ["completo_sky", "attivo_sky"],
  };
  var completatiCat = statiCompletati[row.categoria] || ["attivato"];
  if (completatiCat.indexOf(row.statoNegozio) >= 0) return false;
  // Warning e Malus sono mutualmente esclusivi
  if (isMalusRow(row)) return false;

  var gg = giorniLavorativiDa(row.dataInserimento);
  var ggAgg = giorniDaUltimoAggiornamento(row.storia);
  if (row.categoria === "mnp") {
    if (ggAgg >= 5) return true;
    if (gg >= 5 && row.statoNegozio !== "attivato" && row.statoNegozio !== "re_inserita") return true;
  } else if (row.categoria === "fisso") {
    if (ggAgg >= 10) return true;
    if (gg >= 20 && row.statoNegozio !== "attivato") return true;
  } else if (row.categoria === "finanziamento") {
    if (ggAgg >= 4) return true;
  } else if (row.categoria === "piva") {
    // PIVA: nessun aggiornamento dopo 4gg OPPURE non completata dopo 10gg
    // Cliente Irreperibile: warning solo se non aggiornato da >2gg
    if (ggAgg >= 4) return true;
    if (gg >= 10 && row.statoNegozio !== "attivato") return true;
    if (row.statoNegozio === "cliente_irreperibile" && ggAgg >= 2) return true;
  } else if (row.categoria === "energia") {
    if (ggAgg >= 10) return true;
  } else if (row.categoria === "sky") {
    if (row.statoNegozio === "nuovo" && gg >= 4) return true;
    if (ggAgg >= 10) return true;
  } else {
    var statiCritici = ["contattare_cliente", "contattare_supporto", "doc_mancante", "ricaduta", "ko_reinserito"];
    if (statiCritici.indexOf(row.statoNegozio) >= 0) return true;
  }
  return false;
}

function isDaLavorareRow(row) {
  // Non mostrare se già in Warning o già completata
  if (isAttenzioneRow(row)) return false;
  var statiCompletati = {
    mnp:           ["attivato"],
    fisso:         ["attivato"],
    finanziamento: ["liquidato"],
    piva:          ["attivato"],
    energia:       ["attivato"],
    sky:           ["completo_sky", "attivo_sky"],
  };
  var completatiCat = statiCompletati[row.categoria] || ["attivato"];
  if (completatiCat.indexOf(row.statoNegozio) >= 0) return false;

  var gg = giorniLavorativiDa(row.dataInserimento);
  var ggAgg = giorniDaUltimoAggiornamento(row.storia);
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
  }
  return false;
}

// Malus: pratica che ha superato anche le soglie Warning — genera addebito giornaliero
// MNP: ggAgg>=6 €5/gg | Fisso: ggAgg>=15 €10/gg | Fin: ggAgg>=6 €10/gg
// Energia: ggAgg>=15 €10/gg | Sky: in Warning + ggAgg>=2 €5/gg | P.IVA: TBD
var MALUS_SOGLIE  = { mnp: 6, fisso: 15, finanziamento: 6, piva: null, energia: 15, sky: 2 };
var MALUS_IMPORTO = { mnp: 5, fisso: 10, finanziamento: 10, piva: 5, energia: 10, sky: 5 };

function isMalusRow(row) {
  var statiCompletati = {
    mnp: ["attivato", "re_inserita"], fisso: ["attivato"], finanziamento: ["liquidato"],
    piva: ["attivato"], energia: ["attivato"], sky: ["completo_sky", "attivo_sky"],
  };
  if ((statiCompletati[row.categoria] || ["attivato"]).indexOf(row.statoNegozio) >= 0) return false;
  var ggAgg = giorniDaUltimoAggiornamento(row.storia);
  if (row.categoria === "mnp")           return ggAgg >= 6;
  if (row.categoria === "fisso")         return ggAgg >= 15;
  if (row.categoria === "finanziamento") return ggAgg >= 6;
  if (row.categoria === "piva") {
    // Regola 1: nessun aggiornamento da >= 6 gg
    if (ggAgg >= 6) return true;
    // Regola 2: Cliente Irreperibile non aggiornato da > 4 gg
    if (row.statoNegozio === "cliente_irreperibile" && ggAgg > 4) return true;
    return false;
  }
  if (row.categoria === "energia")       return ggAgg >= 15;
  if (row.categoria === "sky") {
    // Sky in Malus: soddisfa le condizioni Warning (Nuovo>=4gg o ggAgg>=10) E in più ggAgg>=2
    var gg = giorniLavorativiDa(row.dataInserimento);
    var skyWarn = (row.statoNegozio === "nuovo" && gg >= 4) || ggAgg >= 10;
    return skyWarn && ggAgg >= 2;
  }
  return false;
}

function calcolaMalus(row) {
  if (!isMalusRow(row)) return 0;
  var ggAgg = giorniDaUltimoAggiornamento(row.storia);

  // P.IVA: due regole indipendenti, entrambe €5/gg — possono sommarsi
  if (row.categoria === "piva") {
    var totale = 0;
    // Regola 1: nessun aggiornamento da >= 6 gg → €5/gg per i giorni oltre soglia
    if (ggAgg >= 6) {
      totale += Math.max(0, ggAgg - 6 + 1) * 5;
    }
    // Regola 2: Cliente Irreperibile non aggiornato da > 4 gg → €5/gg per i giorni oltre soglia
    if (row.statoNegozio === "cliente_irreperibile" && ggAgg > 4) {
      totale += Math.max(0, ggAgg - 4) * 5;
    }
    return totale;
  }

  var soglia = MALUS_SOGLIE[row.categoria] || 0;
  return Math.max(0, ggAgg - soglia + 1) * (MALUS_IMPORTO[row.categoria] || 0);
}

function StatoBadge(props) {
  var s = props.set === "admin" ? getStatoA(props.id) : getStatoN(props.id);
  return (
    React.createElement("span", {
      style: {
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 600,
        color: s.color,
        background: s.bg,
        border: "1px solid " + s.color + "44",
        whiteSpace: "nowrap",
      }
    }, s.label)
  );
}

function CatBadge(props) {
  var c = getCat(props.id);
  return (
    React.createElement("span", {
      style: {
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 600,
        color: c.color,
        background: c.color + "22",
        border: "1px solid " + c.color + "55",
        whiteSpace: "nowrap",
      }
    }, c.label)
  );
}

// ─── KPI BAR ──────────────────────────────────────────────────────────────────

function KpiBar(props) {
  var data = props.data;
  var totale = data.length;
  var nuovi = data.filter(function(r) { return r.statoNegozio === "nuovo"; }).length;
  var daLavorare = data.filter(function(r) { return isDaLavorareRow(r) && !isMalusRow(r); }).length;
  var problema = data.filter(function(r) { return isAttenzioneRow(r) && !isMalusRow(r); }).length;
  var nonConformi = data.filter(function(r) { return r.statoAdmin === "non_conforme"; }).length;
  var malusCount = data.filter(function(r) { return isMalusRow(r); }).length;
  var malusTotale = data.reduce(function(acc, r) { return acc + calcolaMalus(r); }, 0);

  var onFilter = props.onFilter;
  var activeFilter = props.activeFilter;
  var escludiConfermati = props.escludiConfermati;
  var setEscludiConfermati = props.setEscludiConfermati;
  var escludiCompletati = props.escludiCompletati;
  var setEscludiCompletati = props.setEscludiCompletati;

  // Stati "confermato o superiore" — usati per il toggle esclusione
  var statiConfermatoOSuperiore = ["confermato", "pagato", "stornato"];

  // filter = null significa "mostra tutti"
  var cards = [
    { label: "Totale Monitorati", val: totale,      color: "#94a3b8", filter: null },
    { label: "Nuovi",             val: nuovi,       color: "#64748b", filter: "nuovo" },
    { label: "Da Lavorare",       val: daLavorare,  color: "#eab308", filter: "__da_lavorare__" },
    { label: "Warning",           val: problema,    color: "#f97316", filter: "__attenzione__" },
    { label: "Malus",             val: malusCount,  color: "#dc2626", filter: "__malus__" },
    { label: "Non Conforme",      val: nonConformi, color: "#7c3aed", filter: "__non_conforme__" },
  ];

  return (
    React.createElement("div", null,
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: "10px", marginBottom: "10px" } },
        cards.map(function(c) {
          var isActive = activeFilter === c.filter;
          var extraContent = c.filter === "__malus__" && malusTotale > 0
            ? React.createElement("div", { style: { fontSize: "10px", color: isActive ? "#fca5a5" : "#64748b", marginTop: "3px" } },
                "€ " + malusTotale.toFixed(0) + " maturati"
              )
            : null;
          return (
            React.createElement("div", {
              key: c.label,
              onClick: function() { onFilter(isActive ? null : c.filter); },
              style: {
                background: isActive ? c.color + "22" : "#1e293b",
                border: "1px solid " + (isActive ? c.color : "#334155"),
                borderRadius: "10px",
                padding: "14px 16px",
                textAlign: "center",
                cursor: "pointer",
                transition: "all .15s",
                userSelect: "none",
              },
              onMouseEnter: function(e) {
                if (!isActive) e.currentTarget.style.border = "1px solid " + c.color + "66";
              },
              onMouseLeave: function(e) {
                if (!isActive) e.currentTarget.style.border = "1px solid #334155";
              },
            },
              React.createElement("div", { style: { fontSize: "26px", fontWeight: 700, color: c.color } }, c.val),
              React.createElement("div", { style: { fontSize: "11px", color: isActive ? c.color : "#94a3b8", marginTop: "2px", fontWeight: isActive ? 700 : 400 } }, c.label),
              extraContent
            )
          );
        })
      ),
      React.createElement("div", {
        onClick: function() { setEscludiConfermati(!escludiConfermati); },
        style: {
          display: "flex", alignItems: "center", gap: "10px",
          background: escludiConfermati ? "#0c1a0c" : "#1e293b",
          border: "1px solid " + (escludiConfermati ? "#22c55e" : "#334155"),
          borderRadius: "10px", padding: "10px 18px",
          cursor: "pointer", transition: "all .15s",
          userSelect: "none", marginBottom: "20px",
        },
        onMouseEnter: function(e) {
          if (!escludiConfermati) e.currentTarget.style.border = "1px solid #22c55e66";
        },
        onMouseLeave: function(e) {
          if (!escludiConfermati) e.currentTarget.style.border = "1px solid #334155";
        },
      },
        React.createElement("div", {
          style: {
            width: "18px", height: "18px", borderRadius: "4px", flexShrink: 0,
            border: "2px solid " + (escludiConfermati ? "#22c55e" : "#475569"),
            background: escludiConfermati ? "#22c55e" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all .15s",
          }
        },
          escludiConfermati && React.createElement("span", { style: { color: "#000", fontSize: "11px", fontWeight: 900, lineHeight: 1 } }, "✓")
        ),
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: "12px", fontWeight: 700, color: escludiConfermati ? "#4ade80" : "#94a3b8" } },
            "Escludi pratiche confermate o superiori"
          ),
          React.createElement("div", { style: { fontSize: "11px", color: "#475569", marginTop: "2px" } },
            "Nasconde contratti con esito admin: Confermato, Pagato, Stornato"
          )
        )
      ),

      // Toggle: Escludi Completati (negozio)
      React.createElement("div", {
        onClick: function() { setEscludiCompletati(!escludiCompletati); },
        style: {
          display: "flex", alignItems: "center", gap: "10px",
          background: escludiCompletati ? "#0c1a0c" : "#1e293b",
          border: "1px solid " + (escludiCompletati ? "#22c55e" : "#334155"),
          borderRadius: "10px", padding: "10px 18px",
          cursor: "pointer", transition: "all .15s",
          userSelect: "none", marginBottom: "20px", marginTop: "8px",
        },
        onMouseEnter: function(e) {
          if (!escludiCompletati) e.currentTarget.style.border = "1px solid #22c55e66";
        },
        onMouseLeave: function(e) {
          if (!escludiCompletati) e.currentTarget.style.border = "1px solid #334155";
        },
      },
        React.createElement("div", {
          style: {
            width: "18px", height: "18px", borderRadius: "4px", flexShrink: 0,
            border: "2px solid " + (escludiCompletati ? "#22c55e" : "#475569"),
            background: escludiCompletati ? "#22c55e" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all .15s",
          }
        },
          escludiCompletati && React.createElement("span", { style: { color: "#000", fontSize: "11px", fontWeight: 900, lineHeight: 1 } }, "✓")
        ),
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: "12px", fontWeight: 700, color: escludiCompletati ? "#4ade80" : "#94a3b8" } },
            "Escludi pratiche completate"
          ),
          React.createElement("div", { style: { fontSize: "11px", color: "#475569", marginTop: "2px" } },
            "Nasconde contratti con esito negozio: Completato, Liquidato, Completo, Attivo"
          )
        )
      )
    )
  );
}

// ─── FILTER BAR ─────────────────────────────────────────────────────────────────────────────

function FilterBar(props) {
  var catSel = props.catSel;
  var setCatSel = props.setCatSel;
  var search = props.search;
  var setSearch = props.setSearch;
  var statoSel = props.statoSel;
  var setStatoSel = props.setStatoSel;
  var periodoDA = props.periodoDA;
  var setPeriodoDA = props.setPeriodoDA;
  var periodoA = props.periodoA;
  var setPeriodoA = props.setPeriodoA;
  var brandSel = props.brandSel;
  var setBrandSel = props.setBrandSel;
  var [statoOpen, setStatoOpen] = useState(false);

  // Brand fissi — indipendenti dalla categoria selezionata
  var ALL_BRANDS = ["Vodafone", "Fastweb", "WindTre", "Iliad", "Tim", "S4 Energy"];

  var brandsDisponibili = ALL_BRANDS;

  function toggleBrand(b) {
    if (brandSel.indexOf(b) >= 0) {
      setBrandSel(brandSel.filter(function(x) { return x !== b; }));
    } else {
      setBrandSel(brandSel.concat([b]));
    }
  }

  function toggleCat(id) {
    var next;
    if (catSel.indexOf(id) >= 0) {
      next = catSel.filter(function(c) { return c !== id; });
    } else {
      next = catSel.concat([id]);
    }
    setCatSel(next);
    setStatoSel([]);
  }

  var statiDisponibili = (function() {
    var pools;
    if (catSel.length === 0) {
      pools = STATI_NEGOZIO
        .concat(STATI_NEGOZIO_FISSO)
        .concat(STATI_NEGOZIO_MNP)
        .concat(STATI_NEGOZIO_FINANZIAMENTO)
        .concat(STATI_NEGOZIO_PIVA)
        .concat(STATI_NEGOZIO_ENERGIA)
        .concat(STATI_NEGOZIO_SKY);
    } else {
      pools = [];
      catSel.forEach(function(cid) {
        pools = pools.concat(getStatiNegozioPerCategoria(cid));
      });
    }
    var visti = {};
    return pools.filter(function(s) {
      if (visti[s.id]) return false;
      visti[s.id] = true;
      return true;
    });
  })();

  var inputStyle = {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "8px",
    color: "#f1f5f9",
    fontSize: "13px",
    padding: "9px 12px",
    outline: "none",
    boxSizing: "border-box",
  };


  return (
    React.createElement("div", {
      style: {
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: "12px",
        padding: "16px 20px",
        marginBottom: "16px",
      }
    },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "12px" } },
        React.createElement("span", { style: { fontSize: "12px", color: "#94a3b8", fontWeight: 600, marginRight: "4px" } }, "CATEGORIA"),
        CATEGORIE.map(function(cat) {
          var sel = catSel.indexOf(cat.id) >= 0;
          return (
            React.createElement("button", {
              key: cat.id,
              onClick: function() { toggleCat(cat.id); },
              style: {
                padding: "5px 14px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                border: "1px solid " + (sel ? cat.color : "#334155"),
                background: sel ? cat.color + "33" : "transparent",
                color: sel ? cat.color : "#94a3b8",
                transition: "all .15s",
              }
            }, cat.label)
          );
        }),
        catSel.length > 0 && React.createElement("button", {
          onClick: function() { setCatSel([]); setStatoSel([]); },
          style: {
            padding: "5px 12px",
            borderRadius: "999px",
            fontSize: "11px",
            cursor: "pointer",
            border: "1px solid #475569",
            background: "transparent",
            color: "#64748b",
          }
        }, "✕ Deseleziona tutto")
      ),

      // Brand chips
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "12px" } },
        React.createElement("span", { style: { fontSize: "12px", color: "#94a3b8", fontWeight: 600, marginRight: "4px" } }, "BRAND"),
        brandsDisponibili.map(function(b) {
          var sel = brandSel.indexOf(b) >= 0;
          var brandColors = {
            Vodafone:  "#ef4444",
            Fastweb:   "#3b82f6",
            WindTre:   "#f97316",
            Iliad:     "#a855f7",
            Tim:       "#14b8a6",
            "S4 Energy": "#22c55e",
          };
          var color = brandColors[b] || "#94a3b8";
          return React.createElement("button", {
            key: b,
            onClick: function() { toggleBrand(b); },
            style: {
              padding: "5px 14px", borderRadius: "999px",
              fontSize: "12px", fontWeight: 600, cursor: "pointer",
              border: "1px solid " + (sel ? color : "#334155"),
              background: sel ? color + "33" : "transparent",
              color: sel ? color : "#94a3b8",
              transition: "all .15s",
            }
          }, b);
        }),
        brandSel.length > 0 && React.createElement("button", {
          onClick: function() { setBrandSel([]); },
          style: {
            padding: "5px 12px", borderRadius: "999px", fontSize: "11px",
            cursor: "pointer", border: "1px solid #475569",
            background: "transparent", color: "#64748b",
          }
        }, "\u2715 Tutti i brand")
      ),

      React.createElement("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } },
        React.createElement("div", { style: { position: "relative", flex: 2, minWidth: "200px" } },
          React.createElement("span", {
            style: { position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#475569", fontSize: "14px" }
          }, "🔍"),
          React.createElement("input", {
            type: "text",
            value: search,
            onChange: function(e) { setSearch(e.target.value); },
            placeholder: "Cerca per nominativo, n° contratto, negozio…",
            style: Object.assign({}, inputStyle, { width: "100%", paddingLeft: "36px" })
          })
        ),
        React.createElement("div", {
          style: { position: "relative", flex: 1, minWidth: "200px" }
        },
          // Trigger button — simula una tendina
          React.createElement("button", {
            onClick: function() { setStatoOpen(!statoOpen); },
            style: Object.assign({}, inputStyle, {
              width: "100%", textAlign: "left", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 12px",
            })
          },
            React.createElement("span", { style: { color: statoSel.length > 0 ? "#f1f5f9" : "#64748b", fontSize: "13px" } },
              statoSel.length === 0
                ? "Tutti gli stati"
                : statoSel.length === 1
                  ? (statiDisponibili.find(function(s) { return s.id === statoSel[0]; }) || {label: statoSel[0]}).label
                  : statoSel.length + " stati selezionati"
            ),
            React.createElement("span", { style: { color: "#64748b", fontSize: "10px", marginLeft: "8px" } }, statoOpen ? "▲" : "▼")
          ),
          // Dropdown panel
          statoOpen && React.createElement("div", {
            style: {
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
              background: "#1e293b", border: "1px solid #334155",
              borderRadius: "8px", zIndex: 999,
              boxShadow: "0 8px 24px rgba(0,0,0,.4)",
              maxHeight: "240px", overflowY: "auto",
            }
          },
            // Header con reset
            React.createElement("div", {
              style: {
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderBottom: "1px solid #334155",
              }
            },
              React.createElement("span", { style: { fontSize: "11px", color: "#64748b", fontWeight: 600 } },
                statoSel.length > 0 ? statoSel.length + " selezionati" : "Seleziona stati"
              ),
              statoSel.length > 0 && React.createElement("button", {
                onClick: function(e) { e.stopPropagation(); setStatoSel([]); },
                style: { background: "none", border: "none", color: "#64748b", fontSize: "11px", cursor: "pointer", padding: 0 }
              }, "✕ Tutti")
            ),
            // Voci con checkbox
            statiDisponibili.map(function(s) {
              var sel = statoSel.indexOf(s.id) >= 0;
              return React.createElement("div", {
                key: s.id,
                onClick: function(e) {
                  e.stopPropagation();
                  if (sel) {
                    setStatoSel(statoSel.filter(function(x) { return x !== s.id; }));
                  } else {
                    setStatoSel(statoSel.concat([s.id]));
                  }
                },
                style: {
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "7px 12px", cursor: "pointer",
                  background: sel ? "#1e3a5f" : "transparent",
                  transition: "background .1s",
                }
              },
                React.createElement("div", {
                  style: {
                    width: "14px", height: "14px", borderRadius: "3px", flexShrink: 0,
                    border: "2px solid " + (sel ? s.color : "#475569"),
                    background: sel ? s.color : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }
                },
                  sel && React.createElement("span", { style: { color: "#000", fontSize: "9px", fontWeight: 900, lineHeight: 1 } }, "✓")
                ),
                React.createElement("div", {
                  style: {
                    width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
                    background: s.color,
                  }
                }),
                React.createElement("span", { style: { fontSize: "12px", color: sel ? "#f1f5f9" : "#94a3b8" } }, s.label)
              );
            }),
            // Chiudi
            React.createElement("div", {
              onClick: function() { setStatoOpen(false); },
              style: {
                padding: "8px 12px", borderTop: "1px solid #334155",
                textAlign: "center", fontSize: "11px", color: "#475569",
                cursor: "pointer",
              }
            }, "Chiudi ▲")
          )
        ),
        React.createElement("div", {
          style: { display: "flex", alignItems: "center", gap: "8px", flex: "none" }
        },
          React.createElement("span", { style: { fontSize: "11px", color: "#64748b", fontWeight: 600, whiteSpace: "nowrap" } }, "PERIODO"),
          React.createElement("input", {
            type: "date",
            value: periodoDA,
            onChange: function(e) { setPeriodoDA(e.target.value); },
            style: Object.assign({}, inputStyle, { width: "138px" })
          }),
          React.createElement("span", { style: { color: "#475569", fontSize: "12px" } }, "→"),
          React.createElement("input", {
            type: "date",
            value: periodoA,
            onChange: function(e) { setPeriodoA(e.target.value); },
            style: Object.assign({}, inputStyle, { width: "138px" })
          }),
          (periodoDA || periodoA) && React.createElement("button", {
            onClick: function() { setPeriodoDA(""); setPeriodoA(""); },
            style: {
              padding: "5px 10px", borderRadius: "6px", fontSize: "11px",
              cursor: "pointer", border: "1px solid #475569",
              background: "transparent", color: "#64748b", whiteSpace: "nowrap",
            }
          }, "✕")
        )
      )
    )
  );
}

// ─── TABLE ────────────────────────────────────────────────────────────────────

function Tabella(props) {
  var rows = props.rows;
  var onSelect = props.onSelect;

  if (rows.length === 0) {
    return (
      React.createElement("div", {
        style: {
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: "12px",
          padding: "48px",
          textAlign: "center",
          color: "#475569",
        }
      }, "Nessuna pratica trovata con i filtri selezionati.")
    );
  }

  var thStyle = {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: "11px",
    fontWeight: 700,
    color: "#64748b",
    letterSpacing: "0.05em",
    borderBottom: "1px solid #334155",
    whiteSpace: "nowrap",
  };

  return (
    React.createElement("div", {
      style: {
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: "12px",
        overflow: "hidden",
      }
    },
      React.createElement("div", { style: { overflowX: "auto" } },
        React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
          React.createElement("thead", null,
            React.createElement("tr", { style: { background: "#0f172a" } },
              React.createElement("th", { style: thStyle }, "CATEGORIA"),
              React.createElement("th", { style: thStyle }, "BRAND"),
              React.createElement("th", { style: thStyle }, "NOMINATIVO"),
              React.createElement("th", { style: thStyle }, "NEGOZIO"),
              React.createElement("th", { style: thStyle }, "VENDITORE"),
              React.createElement("th", { style: thStyle }, "DATA"),
              React.createElement("th", { style: thStyle }, "ESITO NEGOZIO"),
              React.createElement("th", { style: thStyle }, "ESITO ADMIN"),
              React.createElement("th", { style: Object.assign({}, thStyle, { textAlign: "center" }) }, "MALUS"),
              React.createElement("th", { style: Object.assign({}, thStyle, { textAlign: "center" }) }, "STATO PRATICA")
            )
          ),
          React.createElement("tbody", null,
            rows.map(function(row, i) {
              var bg = isMalusRow(row) ? "#2d0a0a" : (i % 2 === 0 ? "transparent" : "#172033");
              return (
                React.createElement("tr", {
                  key: row.id,
                  style: {
                    background: bg,
                    cursor: "pointer",
                    transition: "background .1s",
                  },
                  onMouseEnter: function(e) { e.currentTarget.style.background = "#1a3a5c"; },
                  onMouseLeave: function(e) { e.currentTarget.style.background = bg; },
                  onClick: function() { onSelect(row); },
                },
                  React.createElement("td", { style: { padding: "11px 14px", borderBottom: "1px solid #1e293b" } },
                    React.createElement(CatBadge, { id: row.categoria })
                  ),
                  React.createElement("td", { style: { padding: "11px 14px", borderBottom: "1px solid #1e293b", color: "#f1f5f9", fontSize: "13px", fontWeight: 600 } }, row.brand),
                  React.createElement("td", { style: { padding: "11px 14px", borderBottom: "1px solid #1e293b", color: "#e2e8f0", fontSize: "13px" } }, row.nominativo),
                  React.createElement("td", { style: { padding: "11px 14px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "12px" } }, row.negozio),
                  React.createElement("td", { style: { padding: "11px 14px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "12px" } }, row.venditore),
                  React.createElement("td", { style: { padding: "11px 14px", borderBottom: "1px solid #1e293b", color: "#64748b", fontSize: "12px" } }, row.dataInserimento),
                  React.createElement("td", { style: { padding: "11px 14px", borderBottom: "1px solid #1e293b" } },
                    React.createElement(StatoBadge, { id: row.statoNegozio, set: "negozio" })
                  ),
                  React.createElement("td", { style: { padding: "11px 14px", borderBottom: "1px solid #1e293b" } },
                    React.createElement(StatoBadge, { id: row.statoAdmin, set: "admin" })
                  ),
                  React.createElement("td", { style: { padding: "11px 14px", borderBottom: "1px solid #1e293b", textAlign: "center" } },
                    isMalusRow(row)
                      ? React.createElement("div", {
                          style: {
                            display: "inline-flex", flexDirection: "column", alignItems: "center",
                            gap: "2px",
                          }
                        },
                          React.createElement("div", {
                            style: {
                              background: "#450a0a", border: "1px solid #dc2626",
                              borderRadius: "6px", padding: "3px 10px",
                              fontSize: "12px", fontWeight: 700, color: "#fca5a5",
                            }
                          }, "€ " + calcolaMalus(row)),
                          React.createElement("div", {
                            style: { fontSize: "10px", color: "#64748b" }
                          }, "(" + (MALUS_IMPORTO[row.categoria] || 0) + "€/gg)")
                        )
                      : React.createElement("span", { style: { color: "#1e293b", fontSize: "12px" } }, "—")
                  ),
                  React.createElement("td", {
                    style: { padding: "11px 14px", borderBottom: "1px solid #1e293b", textAlign: "center" },
                  },
                    isMalusRow(row)
                      ? React.createElement("div", {
                          style: {
                            display: "inline-block", padding: "3px 10px",
                            borderRadius: "999px", fontSize: "11px", fontWeight: 700,
                            background: "#450a0a", border: "1px solid #dc2626", color: "#fca5a5",
                          }
                        }, "🔴 Malus")
                      : isAttenzioneRow(row)
                        ? React.createElement("div", {
                            style: {
                              display: "inline-block", padding: "3px 10px",
                              borderRadius: "999px", fontSize: "11px", fontWeight: 700,
                              background: "#431407", border: "1px solid #f97316", color: "#fdba74",
                            }
                          }, "⚠️ Warning")
                        : isDaLavorareRow(row)
                          ? React.createElement("div", {
                              style: {
                                display: "inline-block", padding: "3px 10px",
                                borderRadius: "999px", fontSize: "11px", fontWeight: 700,
                                background: "#422006", border: "1px solid #eab308", color: "#fde047",
                              }
                            }, "⚡ Da Lavorare")
                          : React.createElement("span", { style: { color: "#334155", fontSize: "12px" } }, "—")
                  )
                )
              );
            })
          )
        )
      ),
      React.createElement("div", {
        style: { padding: "10px 16px", borderTop: "1px solid #334155", color: "#475569", fontSize: "12px" }
      },
        React.createElement("span", null, rows.length + " pratiche visualizzate"),
        (function() {
          var totMalus = rows.reduce(function(acc, r) { return acc + calcolaMalus(r); }, 0);
          var countMalus = rows.filter(function(r) { return isMalusRow(r); }).length;
          if (countMalus === 0) return null;
          return React.createElement("span", {
            style: {
              marginLeft: "16px", padding: "2px 10px",
              background: "#450a0a", border: "1px solid #dc2626",
              borderRadius: "6px", color: "#fca5a5",
              fontSize: "11px", fontWeight: 700,
            }
          }, countMalus + " in Malus — € " + totMalus + " maturati");
        })()
      )
    )
  );
}

// ─── DRAWER ───────────────────────────────────────────────────────────────────

function Drawer(props) {
  var row = props.row;
  var onClose = props.onClose;
  var onUpdate = props.onUpdate;
  // ruolo simulato — in produzione viene dal contesto auth
  var ruolo = props.ruolo || "negozio"; // "negozio" | "admin"

  var [notaNegozio, setNotaNegozio] = useState("");
  var [notaAdmin, setNotaAdmin] = useState("");
  var [editStatoN, setEditStatoN] = useState(row.statoNegozio);
  var [editStatoA, setEditStatoA] = useState(row.statoAdmin);
  var [activeTab, setActiveTab] = useState("negozio");
  // Follow-up PIVA — 3 slot fissi
  var [followup, setFollowup] = useState(
    row.followup && row.followup.length > 0
      ? row.followup
      : [
          { label: "Follow-up 1", data: "", esito: "", note: "" },
          { label: "Follow-up 2", data: "", esito: "", note: "" },
          { label: "Follow-up 3", data: "", esito: "", note: "" },
        ]
  );
  function updateFollowup(idx, field, val) {
    var arr = followup.map(function(f, i) {
      if (i !== idx) return f;
      var patch = {};
      patch[field] = val;
      return Object.assign({}, f, patch);
    });
    setFollowup(arr);
  }

  if (!row) return null;

  function salva(origine) {
    var nuovaStoria = row.storia.slice();
    var oggi = new Date().toLocaleDateString("it-IT");
    if (origine === "negozio") {
      if (editStatoN !== row.statoNegozio) {
        nuovaStoria.push({
          data: oggi, tipo: "stato_negozio",
          testo: "Esito negozio aggiornato: " + getStatoN(editStatoN).label,
          utente: "Venditore", ruolo: "negozio",
        });
      }
      if (notaNegozio.trim()) {
        nuovaStoria.push({
          data: oggi, tipo: "nota_negozio",
          testo: notaNegozio.trim(),
          utente: "Venditore", ruolo: "negozio",
        });
      }
      onUpdate(Object.assign({}, row, { statoNegozio: editStatoN, storia: nuovaStoria }));
      setNotaNegozio("");
    } else {
      if (editStatoA !== row.statoAdmin) {
        nuovaStoria.push({
          data: oggi, tipo: "stato_admin",
          testo: "Esito admin aggiornato: " + getStatoA(editStatoA).label,
          utente: "Amministrazione", ruolo: "admin",
        });
      }
      if (notaAdmin.trim()) {
        nuovaStoria.push({
          data: oggi, tipo: "nota_admin",
          testo: notaAdmin.trim(),
          utente: "Amministrazione", ruolo: "admin",
        });
      }
      onUpdate(Object.assign({}, row, { statoAdmin: editStatoA, storia: nuovaStoria }));
      setNotaAdmin("");
    }
  }

  var labelStyle = { fontSize: "11px", color: "#64748b", fontWeight: 700, letterSpacing: "0.05em", marginBottom: "4px" };
  var valStyle = { fontSize: "13px", color: "#e2e8f0" };
  var panelStyle = {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "10px",
    padding: "16px",
    marginBottom: "14px",
  };

  // timeline icon colors
  function tipoColor(tipo) {
    if (tipo === "stato_admin" || tipo === "nota_admin") return "#a78bfa";
    if (tipo === "stato_negozio") return "#6366f1";
    if (tipo === "nota_negozio") return "#f59e0b";
    return "#22c55e";
  }

  function tipoLabel(tipo) {
    if (tipo === "stato_admin")  return "Admin";
    if (tipo === "nota_admin")   return "Admin";
    if (tipo === "stato_negozio") return "Negozio";
    if (tipo === "nota_negozio") return "Negozio";
    return "Sistema";
  }

  return (
    React.createElement("div", {
      style: {
        position: "fixed",
        top: 0, right: 0, bottom: 0,
        width: "520px",
        background: "#0f172a",
        borderLeft: "1px solid #334155",
        display: "flex",
        flexDirection: "column",
        zIndex: 1000,
        boxShadow: "-8px 0 32px rgba(0,0,0,.5)",
      }
    },
      // Header
      React.createElement("div", {
        style: {
          padding: "20px 24px 0",
          borderBottom: "1px solid #1e293b",
          flexShrink: 0,
        }
      },
        React.createElement("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" } },
          React.createElement("div", null,
            React.createElement("div", { style: { fontSize: "16px", fontWeight: 700, color: "#f1f5f9", marginBottom: "6px" } }, row.nominativo),
            React.createElement("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } },
              React.createElement(CatBadge, { id: row.categoria }),
              React.createElement("span", { style: { fontSize: "12px", color: "#94a3b8", fontWeight: 600 } }, row.brand),
              React.createElement("span", { style: { fontSize: "11px", color: "#475569" } }, row.numContratto)
            )
          ),
          React.createElement("button", {
            onClick: onClose,
            style: {
              background: "transparent", border: "1px solid #334155",
              borderRadius: "8px", color: "#94a3b8",
              fontSize: "18px", cursor: "pointer",
              padding: "4px 10px", lineHeight: 1, flexShrink: 0,
            }
          }, "\u2715")
        ),
        // Stato pills summary
        React.createElement("div", {
          style: {
            display: "flex", gap: "6px", alignItems: "center",
            padding: "10px 0", marginBottom: "-1px",
          }
        },
          React.createElement("span", { style: { fontSize: "11px", color: "#475569", marginRight: "4px" } }, "Negozio:"),
          React.createElement(StatoBadge, { id: row.statoNegozio, set: "negozio" }),
          React.createElement("span", { style: { fontSize: "11px", color: "#475569", margin: "0 4px" } }, "|  Admin:"),
          React.createElement(StatoBadge, { id: row.statoAdmin, set: "admin" })
        ),
        // Tabs
        React.createElement("div", { style: { display: "flex", gap: "0", marginTop: "14px" } },
          ["negozio", "admin", "storico"].map(function(tab) {
            var labels = { negozio: "Esito Negozio", admin: "Esito Admin", storico: "Storico" };
            var active = activeTab === tab;
            return React.createElement("button", {
              key: tab,
              onClick: function() { setActiveTab(tab); },
              style: {
                padding: "8px 18px",
                background: "transparent",
                border: "none",
                borderBottom: active ? "2px solid #6366f1" : "2px solid transparent",
                color: active ? "#f1f5f9" : "#475569",
                fontSize: "13px",
                fontWeight: active ? 700 : 400,
                cursor: "pointer",
                transition: "all .15s",
              }
            }, labels[tab]);
          })
        )
      ),

      // Body
      React.createElement("div", { style: { flex: 1, overflowY: "auto", padding: "20px 24px" } },

        // TAB: Dati + Esito Negozio
        activeTab === "negozio" && React.createElement("div", null,

          // Dati contratto
          React.createElement("div", { style: Object.assign({}, panelStyle, { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }) },
            React.createElement("div", null,
              React.createElement("div", { style: labelStyle }, "N\u00b0 CONTRATTO"),
              React.createElement("div", { style: Object.assign({}, valStyle, { fontFamily: "monospace" }) }, row.numContratto)
            ),
            React.createElement("div", null,
              React.createElement("div", { style: labelStyle }, "N\u00b0 ATTIVAZIONE"),
              React.createElement("div", { style: Object.assign({}, valStyle, { fontFamily: "monospace" }) }, row.numAttivazione)
            ),
            React.createElement("div", null,
              React.createElement("div", { style: labelStyle }, "NEGOZIO"),
              React.createElement("div", { style: valStyle }, row.negozio)
            ),
            React.createElement("div", null,
              React.createElement("div", { style: labelStyle }, "VENDITORE"),
              React.createElement("div", { style: valStyle }, row.venditore)
            ),
            React.createElement("div", null,
              React.createElement("div", { style: labelStyle }, "TELEFONO"),
              React.createElement("div", { style: valStyle }, row.telefono)
            ),
            React.createElement("div", null,
              React.createElement("div", { style: labelStyle }, "DATA INSERIMENTO"),
              React.createElement("div", { style: valStyle }, row.dataInserimento)
            ),
            React.createElement("div", { style: { gridColumn: "1 / -1" } },
              React.createElement("div", { style: labelStyle }, "C.F. / P.IVA"),
              React.createElement("div", { style: Object.assign({}, valStyle, { fontFamily: "monospace" }) }, row.cf)
            )
          ),

          // Pannello MNP — visibile solo per categoria mnp
          row.categoria === "mnp" && React.createElement("div", {
            style: Object.assign({}, panelStyle, { borderColor: "#312e81", background: "#1a1a3e" })
          },
            // Header sezione
            React.createElement("div", {
              style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }
            },
              React.createElement("div", { style: { width: "8px", height: "8px", borderRadius: "50%", background: "#818cf8", flexShrink: 0 } }),
              React.createElement("div", { style: { fontSize: "12px", fontWeight: 700, color: "#818cf8", letterSpacing: "0.05em" } }, "DATI MNP — DA REGISTRA CONTRATTO")
            ),
            // Grid campi
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" } },
              React.createElement("div", { style: { gridColumn: "1 / -1" } },
                React.createElement("div", { style: labelStyle }, "CODICE NEGOZIO"),
                React.createElement("div", { style: Object.assign({}, valStyle, { fontFamily: "monospace", fontSize: "14px" }) },
                  row.codiceNegozio || "—"
                )
              ),
              React.createElement("div", null,
                React.createElement("div", { style: labelStyle }, "NUMERO PROVVISORIO"),
                React.createElement("div", { style: Object.assign({}, valStyle, { fontFamily: "monospace", fontSize: "14px", color: "#f59e0b" }) },
                  row.numProvvisorio || "—"
                )
              ),
              React.createElement("div", null,
                React.createElement("div", { style: labelStyle }, "N\u00b0 DA PORTARE"),
                React.createElement("div", { style: Object.assign({}, valStyle, { fontFamily: "monospace", fontSize: "14px" }) },
                  row.numAttivazione || "—"
                )
              ),
              React.createElement("div", { style: { gridColumn: "1 / -1" } },
                React.createElement("div", { style: labelStyle }, "ICCID SIM"),
                React.createElement("div", {
                  style: Object.assign({}, valStyle, {
                    fontFamily: "monospace", fontSize: "12px",
                    background: "#0f172a", borderRadius: "6px",
                    padding: "6px 10px", letterSpacing: "0.04em",
                    color: "#a5b4fc",
                  })
                }, row.iccid || "—")
              )
            ),
            // Bottoni download
            React.createElement("div", { style: { display: "flex", gap: "10px" } },
              React.createElement("button", {
                onClick: function() { alert("Download PDA: " + row.numContratto + ".pdf"); },
                style: {
                  flex: 1,
                  background: row.hasPda ? "#1e3a5f" : "#1e293b",
                  border: "1px solid " + (row.hasPda ? "#3b82f6" : "#334155"),
                  borderRadius: "8px", color: row.hasPda ? "#93c5fd" : "#475569",
                  fontSize: "12px", fontWeight: 700,
                  padding: "9px 12px", cursor: row.hasPda ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                }
              },
                React.createElement("span", null, "📄"),
                React.createElement("span", null, row.hasPda ? "Scarica PDA" : "PDA non disponibile")
              ),
              React.createElement("button", {
                onClick: function() {
                  if (row.hasDocumenti) { alert("Download documenti cliente: " + row.nominativo + ".zip"); }
                },
                style: {
                  flex: 1,
                  background: row.hasDocumenti ? "#1a3a2a" : "#1e293b",
                  border: "1px solid " + (row.hasDocumenti ? "#22c55e" : "#334155"),
                  borderRadius: "8px", color: row.hasDocumenti ? "#86efac" : "#475569",
                  fontSize: "12px", fontWeight: 700,
                  padding: "9px 12px", cursor: row.hasDocumenti ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                }
              },
                React.createElement("span", null, "🗂️"),
                React.createElement("span", null, row.hasDocumenti ? "Documenti cliente" : "Nessun documento")
              )
            )
          ),

          // Pannello FISSO — visibile solo per categoria fisso
          row.categoria === "fisso" && React.createElement("div", {
            style: Object.assign({}, panelStyle, { borderColor: "#1d4ed8", background: "#0c1a3a" })
          },
            React.createElement("div", {
              style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }
            },
              React.createElement("div", { style: { width: "8px", height: "8px", borderRadius: "50%", background: "#60a5fa", flexShrink: 0 } }),
              React.createElement("div", { style: { fontSize: "12px", fontWeight: 700, color: "#60a5fa", letterSpacing: "0.05em" } }, "DATI FISSO — DA REGISTRA CONTRATTO")
            ),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" } },
              React.createElement("div", null,
                React.createElement("div", { style: labelStyle }, "N\u00B0 PROVVISORIO"),
                React.createElement("div", {
                  style: Object.assign({}, valStyle, { fontFamily: "monospace", fontSize: "14px", color: "#93c5fd" })
                }, row.numProvvisorio || "\u2014")
              ),
              React.createElement("div", null,
                React.createElement("div", { style: labelStyle }, "N\u00B0 DEFINITIVO (PORTABILIT\u00C0)"),
                row.numDefinitivo
                  ? React.createElement("div", {
                      style: Object.assign({}, valStyle, { fontFamily: "monospace", fontSize: "14px", color: "#34d399" })
                    }, row.numDefinitivo)
                  : React.createElement("div", {
                      style: { fontSize: "12px", color: "#475569", fontStyle: "italic" }
                    }, "Non ancora assegnato")
              )
            )
          ),

          // Pannello FINANZIAMENTO — visibile solo per categoria finanziamento
          row.categoria === "finanziamento" && React.createElement("div", {
            style: Object.assign({}, panelStyle, { borderColor: "#78350f", background: "#1c1508" })
          },
            React.createElement("div", {
              style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }
            },
              React.createElement("div", { style: { width: "8px", height: "8px", borderRadius: "50%", background: "#fbbf24", flexShrink: 0 } }),
              React.createElement("div", { style: { fontSize: "12px", fontWeight: 700, color: "#fbbf24", letterSpacing: "0.05em" } }, "DATI FINANZIAMENTO — DA REGISTRA CONTRATTO")
            ),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" } },
              // Tipo finanziamento
              React.createElement("div", { style: { gridColumn: "1 / -1" } },
                React.createElement("div", { style: labelStyle }, "TIPO FINANZIAMENTO"),
                React.createElement("div", {
                  style: {
                    display: "inline-flex", alignItems: "center", gap: "8px",
                    background: row.tipoFinanziamento === "Findomestic" ? "#1e3a5f" : "#2e1065",
                    border: "1px solid " + (row.tipoFinanziamento === "Findomestic" ? "#3b82f6" : "#a78bfa"),
                    borderRadius: "8px", padding: "6px 14px",
                    color: row.tipoFinanziamento === "Findomestic" ? "#93c5fd" : "#c4b5fd",
                    fontSize: "13px", fontWeight: 700,
                  }
                },
                  React.createElement("span", null, row.tipoFinanziamento === "Findomestic" ? "🏦" : "🧭"),
                  React.createElement("span", null, row.tipoFinanziamento || "—")
                )
              ),
              // Codice negozio
              React.createElement("div", { style: { gridColumn: "1 / -1" } },
                React.createElement("div", { style: labelStyle }, "CODICE NEGOZIO"),
                React.createElement("div", { style: Object.assign({}, valStyle, { fontFamily: "monospace", fontSize: "14px" }) },
                  row.codiceNegozio || "—"
                )
              ),
              // Modello telefono
              React.createElement("div", { style: { gridColumn: "1 / -1" } },
                React.createElement("div", { style: labelStyle }, "MODELLO TELEFONO"),
                React.createElement("div", { style: Object.assign({}, valStyle, { fontSize: "14px" }) },
                  row.modelloTelefono || "—"
                )
              ),
              // Numero pratica — solo Vodafone
              row.numeroPratica && React.createElement("div", { style: { gridColumn: "1 / -1" } },
                React.createElement("div", { style: labelStyle }, "NUMERO PRATICA (VODAFONE)"),
                React.createElement("div", {
                  style: Object.assign({}, valStyle, {
                    fontFamily: "monospace", fontSize: "13px",
                    background: "#0f172a", borderRadius: "6px",
                    padding: "6px 10px", color: "#f97316",
                  })
                }, row.numeroPratica)
              )
            ),
            // Bottoni download
            React.createElement("div", { style: { display: "flex", gap: "10px" } },
              React.createElement("button", {
                onClick: function() { alert("Download PDA: " + row.numContratto + ".pdf"); },
                style: {
                  flex: 1,
                  background: row.hasPda ? "#1e3a5f" : "#1e293b",
                  border: "1px solid " + (row.hasPda ? "#3b82f6" : "#334155"),
                  borderRadius: "8px", color: row.hasPda ? "#93c5fd" : "#475569",
                  fontSize: "12px", fontWeight: 700,
                  padding: "9px 12px", cursor: row.hasPda ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                }
              },
                React.createElement("span", null, "📄"),
                React.createElement("span", null, row.hasPda ? "Scarica PDA" : "PDA non disponibile")
              ),
              React.createElement("button", {
                onClick: function() {
                  if (row.hasDocumenti) { alert("Download documenti cliente: " + row.nominativo + ".zip"); }
                },
                style: {
                  flex: 1,
                  background: row.hasDocumenti ? "#1a3a2a" : "#1e293b",
                  border: "1px solid " + (row.hasDocumenti ? "#22c55e" : "#334155"),
                  borderRadius: "8px", color: row.hasDocumenti ? "#86efac" : "#475569",
                  fontSize: "12px", fontWeight: 700,
                  padding: "9px 12px", cursor: row.hasDocumenti ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                }
              },
                React.createElement("span", null, "🗂️"),
                React.createElement("span", null, row.hasDocumenti ? "Documenti cliente" : "Nessun documento")
              )
            )
          ),

          // Pannello Fisso — GNP (Portabilità numero fisso)
          row.categoria === "fisso" && row.gnp && React.createElement("div", {
            style: Object.assign({}, panelStyle, { background: "#0f172a", borderColor: "#4f46e5" })
          },
            React.createElement("div", {
              style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }
            },
              React.createElement("div", { style: { width: "8px", height: "8px", borderRadius: "50%", background: "#818cf8", flexShrink: 0 } }),
              React.createElement("div", { style: { fontSize: "12px", fontWeight: 700, color: "#818cf8", letterSpacing: "0.05em" } },
                "PORTABILITÀ NUMERO FISSO (GNP)"
              )
            ),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" } },
              // Numero Provvisorio
              React.createElement("div", null,
                React.createElement("div", { style: labelStyle }, "N. FISSO PROVVISORIO"),
                React.createElement("div", {
                  style: Object.assign({}, valStyle, {
                    fontFamily: "monospace", fontSize: "14px",
                    background: "#1e1b4b", borderRadius: "6px",
                    padding: "6px 10px", color: "#a5b4fc",
                    letterSpacing: "0.04em",
                  })
                }, row.numFissoProvvisorio || "—")
              ),
              // Numero Definitivo
              React.createElement("div", null,
                React.createElement("div", { style: labelStyle }, "N. FISSO DEFINITIVO"),
                row.numFissoDefinitivo
                  ? React.createElement("div", {
                      style: Object.assign({}, valStyle, {
                        fontFamily: "monospace", fontSize: "14px",
                        background: "#052e16", borderRadius: "6px",
                        padding: "6px 10px", color: "#86efac",
                        letterSpacing: "0.04em",
                      })
                    }, row.numFissoDefinitivo)
                  : React.createElement("div", {
                      style: {
                        display: "inline-flex", alignItems: "center", gap: "6px",
                        background: "#1c1917", border: "1px solid #44403c",
                        borderRadius: "6px", padding: "6px 10px",
                        fontSize: "12px", color: "#78716c", fontStyle: "italic",
                      }
                    },
                      React.createElement("span", null, "⏳"),
                      React.createElement("span", null, "In attesa di assegnazione")
                    )
              )
            )
          ),

          // Pannello Energia (POD / PDR)
          row.categoria === "energia" && React.createElement("div", {
            style: Object.assign({}, panelStyle, { background: "#0f2d1a", borderColor: "#166534" })
          },
            React.createElement("div", {
              style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }
            },
              React.createElement("div", { style: { width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", flexShrink: 0 } }),
              React.createElement("div", { style: { fontSize: "12px", fontWeight: 700, color: "#22c55e", letterSpacing: "0.05em" } },
                "DATI ENERGIA — DA REGISTRA CONTRATTO"
              )
            ),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" } },
              // Tipo (Luce / Gas)
              React.createElement("div", { style: { gridColumn: "1 / -1" } },
                React.createElement("div", { style: labelStyle }, "TIPO FORNITURA"),
                React.createElement("div", {
                  style: {
                    display: "inline-flex", alignItems: "center", gap: "8px",
                    background: row.tipoEnergia === "Luce" ? "#451a03" : "#0c2a3f",
                    border: "1px solid " + (row.tipoEnergia === "Luce" ? "#f97316" : "#38bdf8"),
                    borderRadius: "8px", padding: "6px 14px",
                    color: row.tipoEnergia === "Luce" ? "#fb923c" : "#7dd3fc",
                    fontSize: "13px", fontWeight: 700,
                  }
                },
                  React.createElement("span", null, row.tipoEnergia === "Luce" ? "💡" : "🔥"),
                  React.createElement("span", null, row.tipoEnergia || "—")
                )
              ),
              // POD (Luce)
              row.tipoEnergia === "Luce" && React.createElement("div", { style: { gridColumn: "1 / -1" } },
                React.createElement("div", { style: labelStyle }, "CODICE POD"),
                React.createElement("div", {
                  style: Object.assign({}, valStyle, {
                    fontFamily: "monospace", fontSize: "13px",
                    background: "#0f172a", borderRadius: "6px",
                    padding: "6px 10px", color: "#fbbf24",
                    letterSpacing: "0.04em",
                  })
                }, row.pod || "—")
              ),
              // PDR (Gas)
              row.tipoEnergia === "Gas" && React.createElement("div", { style: { gridColumn: "1 / -1" } },
                React.createElement("div", { style: labelStyle }, "CODICE PDR"),
                React.createElement("div", {
                  style: Object.assign({}, valStyle, {
                    fontFamily: "monospace", fontSize: "13px",
                    background: "#0f172a", borderRadius: "6px",
                    padding: "6px 10px", color: "#38bdf8",
                    letterSpacing: "0.04em",
                  })
                }, row.pdr || "—")
              )
            )
          ),

          // Esito negozio
          React.createElement("div", { style: panelStyle },
            React.createElement("div", {
              style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }
            },
              React.createElement("div", {
                style: { width: "8px", height: "8px", borderRadius: "50%", background: "#6366f1", flexShrink: 0 }
              }),
              React.createElement("div", { style: { fontSize: "12px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em" } }, "ESITO NEGOZIO")
            ),
            React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "14px" } },
              getStatiNegozioPerCategoria(row.categoria).map(function(s) {
                var sel = editStatoN === s.id;
                return React.createElement("button", {
                  key: s.id,
                  onClick: function() { setEditStatoN(s.id); },
                  style: {
                    padding: "6px 14px", borderRadius: "999px",
                    fontSize: "12px", fontWeight: 600, cursor: "pointer",
                    border: "1px solid " + (sel ? s.color : "#334155"),
                    background: sel ? s.color + "33" : "transparent",
                    color: sel ? s.color : "#64748b",
                    transition: "all .15s",
                  }
                }, s.label);
              })
            ),
            // Follow-up PIVA — appare solo se categoria PIVA e stato cliente_irreperibile
            row.categoria === "piva" && editStatoN === "cliente_irreperibile" && React.createElement("div", {
              style: {
                background: "#1a0a2e", border: "1px solid #6d28d9",
                borderRadius: "10px", padding: "14px", marginBottom: "14px",
              }
            },
              React.createElement("div", {
                style: { fontSize: "11px", fontWeight: 700, color: "#a78bfa", letterSpacing: "0.06em", marginBottom: "12px" }
              }, "TENTATIVI DI CONTATTO — CLIENTE IRREPERIBILE"),
              followup.map(function(fu, idx) {
                return React.createElement("div", {
                  key: idx,
                  style: {
                    background: "#0f172a", borderRadius: "8px",
                    padding: "10px 12px", marginBottom: "8px",
                    border: fu.data ? "1px solid #6d28d955" : "1px solid #1e293b",
                  }
                },
                  React.createElement("div", { style: { fontSize: "11px", fontWeight: 700, color: "#7c3aed", marginBottom: "8px" } }, fu.label),
                  React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" } },
                    React.createElement("div", null,
                      React.createElement("div", { style: { fontSize: "10px", color: "#64748b", marginBottom: "3px" } }, "DATA CHIAMATA"),
                      React.createElement("input", {
                        type: "date",
                        value: fu.data || "",
                        onChange: function(e) { updateFollowup(idx, "data", e.target.value); },
                        style: {
                          width: "100%", background: "#1e293b", border: "1px solid #334155",
                          borderRadius: "6px", color: "#f1f5f9", fontSize: "12px",
                          padding: "5px 8px", outline: "none", boxSizing: "border-box",
                        }
                      })
                    ),
                    React.createElement("div", null,
                      React.createElement("div", { style: { fontSize: "10px", color: "#64748b", marginBottom: "3px" } }, "ESITO"),
                      React.createElement("input", {
                        type: "text",
                        value: fu.esito || "",
                        placeholder: "es. Nessuna risposta",
                        onChange: function(e) { updateFollowup(idx, "esito", e.target.value); },
                        style: {
                          width: "100%", background: "#1e293b", border: "1px solid #334155",
                          borderRadius: "6px", color: "#f1f5f9", fontSize: "12px",
                          padding: "5px 8px", outline: "none", boxSizing: "border-box",
                        }
                      })
                    ),
                    React.createElement("div", { style: { gridColumn: "1 / -1" } },
                      React.createElement("div", { style: { fontSize: "10px", color: "#64748b", marginBottom: "3px" } }, "NOTE"),
                      React.createElement("input", {
                        type: "text",
                        value: fu.note || "",
                        placeholder: "es. Chiamato alle 10:30, segreteria…",
                        onChange: function(e) { updateFollowup(idx, "note", e.target.value); },
                        style: {
                          width: "100%", background: "#1e293b", border: "1px solid #334155",
                          borderRadius: "6px", color: "#f1f5f9", fontSize: "12px",
                          padding: "5px 8px", outline: "none", boxSizing: "border-box",
                        }
                      })
                    )
                  )
                );
              })
            ),
            React.createElement("textarea", {
              value: notaNegozio,
              onChange: function(e) { setNotaNegozio(e.target.value); },
              placeholder: "Nota negozio (es: cliente contattato, in attesa di risposta…)",
              style: {
                width: "100%", minHeight: "68px",
                background: "#0f172a", border: "1px solid #334155",
                borderRadius: "8px", color: "#f1f5f9",
                fontSize: "13px", padding: "10px 12px",
                resize: "vertical", outline: "none", boxSizing: "border-box",
                marginBottom: "10px",
              }
            }),
            React.createElement("button", {
              onClick: function() { salva("negozio"); },
              style: {
                background: "#6366f1", border: "none", borderRadius: "8px",
                color: "#fff", fontSize: "13px", fontWeight: 600,
                padding: "9px 20px", cursor: "pointer", width: "100%",
              }
            }, "Salva esito negozio")
          )
        ),

        // TAB: Esito Admin
        activeTab === "admin" && React.createElement("div", null,
          React.createElement("div", { style: panelStyle },
            React.createElement("div", {
              style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }
            },
              React.createElement("div", {
                style: { width: "8px", height: "8px", borderRadius: "50%", background: "#a78bfa", flexShrink: 0 }
              }),
              React.createElement("div", { style: { fontSize: "12px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em" } }, "VERIFICA AMMINISTRAZIONE")
            ),
            React.createElement("p", {
              style: { fontSize: "12px", color: "#475569", marginBottom: "14px" }
            }, "Conferma o rettifica l'esito inserito dal negozio. Visibile a tutte le parti."),
            React.createElement("div", { style: { marginBottom: "6px" } },
              React.createElement("div", { style: Object.assign({}, labelStyle, { marginBottom: "8px" }) }, "ESITO CORRENTE NEGOZIO"),
              React.createElement(StatoBadge, { id: row.statoNegozio, set: "negozio" })
            ),
            React.createElement("div", { style: { margin: "14px 0 10px" } },
              React.createElement("div", { style: Object.assign({}, labelStyle, { marginBottom: "8px" }) }, "ESITO AMMINISTRAZIONE"),
              React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "14px" } },
                (row.categoria === "finanziamento" ? STATI_ADMIN_FINANZIAMENTO : STATI_ADMIN).map(function(s) {
                  var sel = editStatoA === s.id;
                  return React.createElement("button", {
                    key: s.id,
                    onClick: function() { setEditStatoA(s.id); },
                    style: {
                      padding: "6px 14px", borderRadius: "999px",
                      fontSize: "12px", fontWeight: 600, cursor: "pointer",
                      border: "1px solid " + (sel ? s.color : "#334155"),
                      background: sel ? s.color + "33" : "transparent",
                      color: sel ? s.color : "#64748b",
                      transition: "all .15s",
                    }
                  }, s.label);
                })
              )
            ),
            React.createElement("textarea", {
              value: notaAdmin,
              onChange: function(e) { setNotaAdmin(e.target.value); },
              placeholder: "Nota amministrazione (es: verificato su portale operatore, attivazione confermata…)",
              style: {
                width: "100%", minHeight: "68px",
                background: "#0f172a", border: "1px solid #334155",
                borderRadius: "8px", color: "#f1f5f9",
                fontSize: "13px", padding: "10px 12px",
                resize: "vertical", outline: "none", boxSizing: "border-box",
                marginBottom: "10px",
              }
            }),
            React.createElement("button", {
              onClick: function() { salva("admin"); },
              style: {
                background: "#7c3aed", border: "none", borderRadius: "8px",
                color: "#fff", fontSize: "13px", fontWeight: 600,
                padding: "9px 20px", cursor: "pointer", width: "100%",
              }
            }, "Salva verifica amministrazione")
          )
        ),

        // TAB: Storico unificato
        activeTab === "storico" && React.createElement("div", null,

          // ── Sezione Malus maturato ──────────────────────────────────────
          isMalusRow(row) && React.createElement("div", {
            style: {
              background: "#2d0a0a", border: "1px solid #dc2626",
              borderRadius: "10px", padding: "14px 16px", marginBottom: "16px",
            }
          },
            React.createElement("div", {
              style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }
            },
              React.createElement("div", { style: { width: "8px", height: "8px", borderRadius: "50%", background: "#dc2626", flexShrink: 0 } }),
              React.createElement("div", { style: { fontSize: "12px", fontWeight: 700, color: "#fca5a5", letterSpacing: "0.05em" } },
                "MALUS MATURATO"
              ),
              React.createElement("div", {
                style: {
                  marginLeft: "auto", background: "#450a0a", border: "1px solid #dc2626",
                  borderRadius: "6px", padding: "3px 12px",
                  fontSize: "14px", fontWeight: 900, color: "#fca5a5",
                }
              }, "€ " + calcolaMalus(row))
            ),
            (function() {
              var ggAgg = giorniDaUltimoAggiornamento(row.storia);
              var soglia = MALUS_SOGLIE[row.categoria] || 0;
              var importo = MALUS_IMPORTO[row.categoria] || 0;
              var giorniMalus = Math.max(0, ggAgg - soglia + 1);
              // Calcolo data di ingresso in Malus
              var ultimoEvento = row.storia[row.storia.length - 1];
              var ingressoMalus = "—";
              if (ultimoEvento && ultimoEvento.data) {
                var parti = ultimoEvento.data.split("/");
                if (parti.length === 3) {
                  var d = new Date(parseInt(parti[2]), parseInt(parti[1]) - 1, parseInt(parti[0]));
                  // Avanza di (soglia - 1) giorni lavorativi per trovare il giorno di ingresso in Malus
                  var daysToAdd = soglia;
                  var added = 0;
                  while (added < daysToAdd) {
                    d.setDate(d.getDate() + 1);
                    var dow = d.getDay();
                    if (dow !== 0) added++;
                  }
                  ingressoMalus = d.toLocaleDateString("it-IT");
                }
              }
              return React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" } },
                React.createElement("div", { style: { background: "#1a0505", borderRadius: "8px", padding: "10px 12px" } },
                  React.createElement("div", { style: { fontSize: "10px", color: "#ef4444", fontWeight: 700, marginBottom: "4px", letterSpacing: "0.05em" } }, "ENTRATA IN MALUS"),
                  React.createElement("div", { style: { fontSize: "13px", fontWeight: 700, color: "#fca5a5" } }, ingressoMalus),
                  React.createElement("div", { style: { fontSize: "10px", color: "#64748b", marginTop: "2px" } }, "dopo " + soglia + " gg lav. senza aggiornamento")
                ),
                React.createElement("div", { style: { background: "#1a0505", borderRadius: "8px", padding: "10px 12px" } },
                  React.createElement("div", { style: { fontSize: "10px", color: "#ef4444", fontWeight: 700, marginBottom: "4px", letterSpacing: "0.05em" } }, "GIORNI IN MALUS"),
                  React.createElement("div", { style: { fontSize: "13px", fontWeight: 700, color: "#fca5a5" } }, giorniMalus + " gg"),
                  React.createElement("div", { style: { fontSize: "10px", color: "#64748b", marginTop: "2px" } }, importo + " €/gg lavorativo")
                ),
                React.createElement("div", { style: { background: "#1a0505", borderRadius: "8px", padding: "10px 12px" } },
                  React.createElement("div", { style: { fontSize: "10px", color: "#ef4444", fontWeight: 700, marginBottom: "4px", letterSpacing: "0.05em" } }, "TOTALE MATURATO"),
                  React.createElement("div", { style: { fontSize: "16px", fontWeight: 900, color: "#f87171" } }, "€ " + calcolaMalus(row)),
                  React.createElement("div", { style: { fontSize: "10px", color: "#64748b", marginTop: "2px" } }, giorniMalus + " gg × " + importo + " €")
                )
              );
            })(),
            React.createElement("div", {
              style: { marginTop: "12px", padding: "8px 12px", background: "#1a0505", borderRadius: "6px", fontSize: "11px", color: "#94a3b8", fontStyle: "italic" }
            },
              "Il malus si azzera automaticamente quando la pratica viene aggiornata o portata a completamento."
            )
          ),

          React.createElement("div", { style: { marginBottom: "6px" } },
            React.createElement("p", { style: { fontSize: "12px", color: "#475569", marginBottom: "16px" } },
              "Tutte le azioni di negozio e amministrazione in ordine cronologico inverso."
            ),
            React.createElement("div", { style: { position: "relative" } },
              React.createElement("div", {
                style: { position: "absolute", left: "7px", top: 0, bottom: 0, width: "2px", background: "#1e293b" }
              }),
              row.storia.slice().reverse().map(function(ev, i) {
                var dotColor = tipoColor(ev.tipo);
                var isAdmin = ev.ruolo === "admin";
                return React.createElement("div", {
                  key: i,
                  style: { display: "flex", gap: "14px", marginBottom: "16px", position: "relative" }
                },
                  React.createElement("div", {
                    style: {
                      width: "16px", height: "16px", borderRadius: "50%",
                      background: dotColor, flexShrink: 0, marginTop: "2px", zIndex: 1,
                    }
                  }),
                  React.createElement("div", { style: { flex: 1 } },
                    React.createElement("div", {
                      style: {
                        display: "inline-block",
                        fontSize: "10px", fontWeight: 700,
                        color: isAdmin ? "#a78bfa" : "#6366f1",
                        background: isAdmin ? "#2e1065" : "#1e1b4b",
                        padding: "1px 8px", borderRadius: "999px",
                        marginBottom: "4px",
                        letterSpacing: "0.05em",
                      }
                    }, tipoLabel(ev.tipo).toUpperCase()),
                    React.createElement("div", { style: { fontSize: "13px", color: "#e2e8f0" } }, ev.testo),
                    React.createElement("div", { style: { fontSize: "11px", color: "#475569", marginTop: "2px" } },
                      ev.data + " — " + ev.utente
                    )
                  )
                );
              })
            )
          )
        )
      )
    )
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function TrackingPDA() {
  var [allData] = useState(makeSampleData);
  var [data, setData] = useState(makeSampleData);
  var [catSel, setCatSel] = useState([]);
  var [search, setSearch] = useState("");
  var [statoSel, setStatoSel] = useState([]);
  var [selected, setSelected] = useState(null);
  var [ruolo, setRuolo] = useState("negozio");
  var [kpiFilter, setKpiFilter] = useState(null);
  var [periodoDA, setPeriodoDA] = useState("");
  var [periodoA, setPeriodoA] = useState("");
  var [escludiConfermati, setEscludiConfermati] = useState(false);
  var [escludiCompletati, setEscludiCompletati] = useState(false);
  var [brandSel, setBrandSel] = useState([]);
  var [showRegole, setShowRegole] = useState(false);

  var filtered = useMemo(function() {
    var statiConfermatoOSuperiore = ["confermato", "pagato", "stornato"];
    var statiCompletatiNegozio = ["attivato", "liquidato", "completo_sky", "attivo_sky"];
    return data.filter(function(row) {
      if (escludiConfermati && statiConfermatoOSuperiore.indexOf(row.statoAdmin) >= 0) return false;
      if (escludiCompletati && statiCompletatiNegozio.indexOf(row.statoNegozio) >= 0) return false;
      if (kpiFilter !== null) {
        if (kpiFilter === "__attenzione__") {
          if (!isAttenzioneRow(row) || isMalusRow(row)) return false;
        } else if (kpiFilter === "__da_lavorare__") {
          if (!isDaLavorareRow(row) || isMalusRow(row)) return false;
        } else if (kpiFilter === "__malus__") {
          if (!isMalusRow(row)) return false;
        } else if (kpiFilter === "__non_conforme__") {
          if (row.statoAdmin !== "non_conforme") return false;
        } else {
          if (row.statoNegozio !== kpiFilter) return false;
        }
      }
      if (catSel.length > 0 && catSel.indexOf(row.categoria) < 0) return false;
      if (brandSel.length > 0 && brandSel.indexOf(row.brand) < 0) return false;
      if (statoSel.length > 0 && statoSel.indexOf(row.statoNegozio) < 0) return false;
      if (periodoDA || periodoA) {
        var parti = row.dataInserimento.split("/");
        var rowDate = new Date(parseInt(parti[2]), parseInt(parti[1]) - 1, parseInt(parti[0]));
        if (periodoDA) {
          var da = new Date(periodoDA);
          da.setHours(0,0,0,0);
          if (rowDate < da) return false;
        }
        if (periodoA) {
          var a = new Date(periodoA);
          a.setHours(23,59,59,999);
          if (rowDate > a) return false;
        }
      }
      if (search.trim()) {
        var q = search.toLowerCase();
        var match = (
          row.nominativo.toLowerCase().indexOf(q) >= 0 ||
          row.numContratto.toLowerCase().indexOf(q) >= 0 ||
          row.numAttivazione.toLowerCase().indexOf(q) >= 0 ||
          row.negozio.toLowerCase().indexOf(q) >= 0 ||
          row.brand.toLowerCase().indexOf(q) >= 0 ||
          row.venditore.toLowerCase().indexOf(q) >= 0
        );
        if (!match) return false;
      }
      return true;
    });
  }, [data, catSel, brandSel, search, statoSel, kpiFilter, periodoDA, periodoA, escludiConfermati, escludiCompletati]);

  // Dati per i contatori KPI: tutti i filtri attivi TRANNE kpiFilter
  // così i contatori riflettono i filtri correnti (brand, categoria, periodo, ecc.)
  // ma non cambiano quando si clicca su una card
  var filteredPerKpi = useMemo(function() {
    var statiConfermatoOSuperiore = ["confermato", "pagato", "stornato"];
    var statiCompletatiNegozio = ["attivato", "liquidato", "completo_sky", "attivo_sky"];
    return data.filter(function(row) {
      if (escludiConfermati && statiConfermatoOSuperiore.indexOf(row.statoAdmin) >= 0) return false;
      if (escludiCompletati && statiCompletatiNegozio.indexOf(row.statoNegozio) >= 0) return false;
      if (catSel.length > 0 && catSel.indexOf(row.categoria) < 0) return false;
      if (brandSel.length > 0 && brandSel.indexOf(row.brand) < 0) return false;
      if (statoSel.length > 0 && statoSel.indexOf(row.statoNegozio) < 0) return false;
      if (periodoDA || periodoA) {
        var parti = row.dataInserimento.split("/");
        var rowDate = new Date(parseInt(parti[2]), parseInt(parti[1]) - 1, parseInt(parti[0]));
        if (periodoDA) {
          var da = new Date(periodoDA);
          da.setHours(0,0,0,0);
          if (rowDate < da) return false;
        }
        if (periodoA) {
          var a = new Date(periodoA);
          a.setHours(23,59,59,999);
          if (rowDate > a) return false;
        }
      }
      if (search.trim()) {
        var q = search.toLowerCase();
        var match = (
          row.nominativo.toLowerCase().indexOf(q) >= 0 ||
          row.numContratto.toLowerCase().indexOf(q) >= 0 ||
          row.numAttivazione.toLowerCase().indexOf(q) >= 0 ||
          row.negozio.toLowerCase().indexOf(q) >= 0 ||
          row.brand.toLowerCase().indexOf(q) >= 0 ||
          row.venditore.toLowerCase().indexOf(q) >= 0
        );
        if (!match) return false;
      }
      return true;
    });
  }, [data, catSel, brandSel, search, statoSel, periodoDA, periodoA, escludiConfermati, escludiCompletati]);

  function handleUpdate(updated) {
    setData(data.map(function(r) { return r.id === updated.id ? updated : r; }));
    setSelected(updated);
  }

  return (
    React.createElement("div", {
      style: {
        minHeight: "100vh",
        background: "#0f172a",
        color: "#f1f5f9",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: "28px 32px",
        boxSizing: "border-box",
      }
    },
      // Modale Regole
      showRegole && React.createElement("div", {
        onClick: function() { setShowRegole(false); },
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }
      },
        React.createElement("div", {
          onClick: function(e) { e.stopPropagation(); },
          style: {
            background: "#1e293b", border: "1px solid #334155", borderRadius: "16px",
            width: "820px", maxWidth: "95vw", maxHeight: "88vh", overflowY: "auto",
            boxShadow: "0 24px 64px rgba(0,0,0,.6)",
          }
        },
          // Header modale
          React.createElement("div", {
            style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 28px", borderBottom: "1px solid #334155" }
          },
            React.createElement("div", null,
              React.createElement("div", { style: { fontSize: "18px", fontWeight: 800, color: "#f1f5f9" } }, "📋 Regole di Ingaggio — Tracking PDA"),
              React.createElement("div", { style: { fontSize: "12px", color: "#64748b", marginTop: "2px" } }, "Soglie temporali per evitare Da Lavorare, Warning e Malus")
            ),
            React.createElement("button", {
              onClick: function() { setShowRegole(false); },
              style: { background: "none", border: "none", color: "#64748b", fontSize: "22px", cursor: "pointer", lineHeight: 1 }
            }, "✕")
          ),
          // Nota generale
          React.createElement("div", {
            style: { margin: "16px 28px 0", padding: "10px 14px", background: "#0f172a", borderRadius: "8px", fontSize: "12px", color: "#94a3b8" }
          },
            React.createElement("strong", { style: { color: "#f1f5f9" } }, "Come funziona: "),
            "tutti i giorni sono ",
            React.createElement("strong", { style: { color: "#f1f5f9" } }, "lavorativi (lun–sab)"),
            ". I filtri sono mutualmente esclusivi: 🔴 Malus > ⚠️ Warning > ⚡ Da Lavorare. Le pratiche completate non appaiono in nessun filtro."
          ),
          // Tabella regole
          React.createElement("div", { style: { padding: "20px 28px" } },
            [
              {
                cat: "MNP", color: "#38bdf8",
                dl:    ["≥ 2 gg senza aggiornamento storico"],
                warn:  ["≥ 5 gg senza aggiornamento storico", "Non completata (≠ Completato / Re-Inserita) da ≥ 5 gg"],
                malus: ["≥ 6 gg senza aggiornamento storico → €5/gg"],
              },
              {
                cat: "Fisso", color: "#818cf8",
                dl:    ["≥ 5 gg senza aggiornamento storico"],
                warn:  ["≥ 10 gg senza aggiornamento storico", "Non completata (≠ Completato) da ≥ 20 gg"],
                malus: ["≥ 15 gg senza aggiornamento storico → €10/gg"],
              },
              {
                cat: "Finanziamento", color: "#f59e0b",
                dl:    ["≥ 2 gg senza aggiornamento storico"],
                warn:  ["≥ 4 gg senza aggiornamento storico"],
                malus: ["≥ 6 gg senza aggiornamento storico → €10/gg"],
              },
              {
                cat: "P.IVA", color: "#a78bfa",
                dl:    ["≥ 2 gg senza aggiornamento storico", "Sempre se stato = Cliente Irreperibile"],
                warn:  ["≥ 4 gg senza aggiornamento storico", "Non completata da ≥ 10 gg", "Cliente Irreperibile non aggiornato da > 2 gg"],
                malus: ["Soglia non ancora definita (non attivo)"],
              },
              {
                cat: "Energia", color: "#22c55e",
                dl:    ["≥ 5 gg senza aggiornamento storico"],
                warn:  ["≥ 10 gg senza aggiornamento storico"],
                malus: ["≥ 15 gg senza aggiornamento storico → €10/gg"],
              },
              {
                cat: "Sky", color: "#6366f1",
                dl:    ["Stato Nuovo da ≥ 2 gg dall'inserimento", "Sempre in stato WM Sospetta", "Attesa Matricola senza aggiornamento da ≥ 5 gg", "Aperto Sparks senza aggiornamento da ≥ 3 gg"],
                warn:  ["Stato Nuovo da ≥ 4 gg dall'inserimento", "≥ 10 gg senza aggiornamento (qualsiasi stato)"],
                malus: ["Soddisfa Warning + ≥ 2 gg ulteriori senza aggiornamento → €5/gg"],
              },
            ].map(function(r) {
              return React.createElement("div", {
                key: r.cat,
                style: {
                  marginBottom: "16px", borderRadius: "10px",
                  border: "1px solid #334155", overflow: "hidden",
                }
              },
                // Cat header
                React.createElement("div", {
                  style: {
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "10px 16px", background: "#0f172a",
                    borderBottom: "1px solid #334155",
                  }
                },
                  React.createElement("div", { style: { width: "10px", height: "10px", borderRadius: "50%", background: r.color } }),
                  React.createElement("div", { style: { fontSize: "13px", fontWeight: 800, color: r.color } }, r.cat)
                ),
                // 3 colonne
                React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr" } },
                  [
                    { label: "⚡ Da Lavorare", rules: r.dl,   bg: "#1c1708", col: "#eab308", brd: "#713f12" },
                    { label: "⚠️ Warning",     rules: r.warn, bg: "#1c0e05", col: "#f97316", brd: "#7c2d12" },
                    { label: "🔴 Malus",       rules: r.malus,bg: "#1c0505", col: "#ef4444", brd: "#450a0a" },
                  ].map(function(col, ci) {
                    return React.createElement("div", {
                      key: ci,
                      style: {
                        padding: "12px 14px",
                        background: col.bg,
                        borderRight: ci < 2 ? "1px solid #334155" : "none",
                      }
                    },
                      React.createElement("div", { style: { fontSize: "10px", fontWeight: 700, color: col.col, letterSpacing: "0.06em", marginBottom: "8px" } }, col.label),
                      col.rules.map(function(rule, ri) {
                        return React.createElement("div", {
                          key: ri,
                          style: { display: "flex", gap: "6px", marginBottom: "4px", alignItems: "flex-start" }
                        },
                          React.createElement("span", { style: { color: col.col, fontSize: "10px", flexShrink: 0, marginTop: "1px" } }, "•"),
                          React.createElement("span", { style: { fontSize: "11px", color: "#cbd5e1", lineHeight: "1.4" } }, rule)
                        );
                      })
                    );
                  })
                )
              );
            })
          ),
          // Footer
          React.createElement("div", {
            style: { padding: "14px 28px", borderTop: "1px solid #334155", display: "flex", justifyContent: "flex-end" }
          },
            React.createElement("button", {
              onClick: function() { setShowRegole(false); },
              style: {
                background: "#6366f1", border: "none", borderRadius: "8px",
                color: "#fff", fontSize: "13px", fontWeight: 700, padding: "8px 20px", cursor: "pointer",
              }
            }, "Chiudi")
          )
        )
      ),

      // Overlay backdrop quando drawer aperto
      selected && React.createElement("div", {
        onClick: function() { setSelected(null); },
        style: {
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,.4)",
          zIndex: 999,
        }
      }),

      // Drawer
      selected && React.createElement(Drawer, {
        row: selected,
        onClose: function() { setSelected(null); },
        onUpdate: handleUpdate,
        ruolo: ruolo,
      }),

      // Page header
      React.createElement("div", { style: { marginBottom: "24px" } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
          React.createElement("div", null,
            React.createElement("h1", { style: { fontSize: "22px", fontWeight: 700, margin: 0, color: "#f1f5f9" } }, "Tracking PDA"),
            React.createElement("p", { style: { fontSize: "13px", color: "#64748b", margin: "4px 0 0" } },
              "Monitoraggio pratiche che richiedono verifica post-inserimento"
            )
          ),
          React.createElement("div", { style: { display: "flex", gap: "10px", alignItems: "center" } },
            // Simulatore ruolo (solo per demo)
            React.createElement("div", {
              style: {
                display: "flex",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "8px",
                overflow: "hidden",
                fontSize: "12px",
              }
            },
              ["negozio", "admin"].map(function(r) {
                var active = ruolo === r;
                var labels = { negozio: "👤 Negozio", admin: "🔐 Admin" };
                return React.createElement("button", {
                  key: r,
                  onClick: function() { setRuolo(r); },
                  style: {
                    padding: "7px 14px",
                    background: active ? "#334155" : "transparent",
                    border: "none",
                    color: active ? "#f1f5f9" : "#64748b",
                    fontWeight: active ? 700 : 400,
                    cursor: "pointer",
                    fontSize: "12px",
                  }
                }, labels[r]);
              })
            ),
            React.createElement("button", {
              onClick: function() { setShowRegole(true); },
              style: {
                background: "transparent",
                border: "1px solid #6366f1",
                borderRadius: "8px",
                color: "#a5b4fc",
                fontSize: "13px",
                fontWeight: 700,
                padding: "8px 16px",
                cursor: "pointer",
              }
            }, "📋 Regole"),
            React.createElement("button", {
              style: {
                background: "#6366f1",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 600,
                padding: "8px 16px",
                cursor: "pointer",
              }
            }, "\u21bb Aggiorna")
          )
        )
      ),

      // KPI
      React.createElement(KpiBar, {
        data: filteredPerKpi,
        onFilter: setKpiFilter,
        activeFilter: kpiFilter,
        escludiConfermati: escludiConfermati,
        setEscludiConfermati: setEscludiConfermati,
        escludiCompletati: escludiCompletati,
        setEscludiCompletati: setEscludiCompletati,
      }),

      // Legenda categorie
      React.createElement("div", {
        style: {
          display: "flex",
          gap: "16px",
          marginBottom: "16px",
          flexWrap: "wrap",
        }
      },
        CATEGORIE.map(function(cat) {
          var count = data.filter(function(r) { return r.categoria === cat.id; }).length;
          return (
            React.createElement("div", {
              key: cat.id,
              style: {
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                color: "#94a3b8",
              }
            },
              React.createElement("span", { style: { color: cat.color, fontWeight: 700 } }, count),
              React.createElement("span", null, cat.label)
            )
          );
        })
      ),

      // Filters
      React.createElement(FilterBar, {
        catSel: catSel,
        setCatSel: setCatSel,
        brandSel: brandSel,
        setBrandSel: setBrandSel,
        search: search,
        setSearch: setSearch,
        statoSel: statoSel,
        setStatoSel: setStatoSel,
        periodoDA: periodoDA,
        setPeriodoDA: setPeriodoDA,
        periodoA: periodoA,
        setPeriodoA: setPeriodoA,
      }),

      // Table
      React.createElement(Tabella, {
        rows: filtered,
        onSelect: setSelected,
      })
    )
  );
}

export default TrackingPDA;
