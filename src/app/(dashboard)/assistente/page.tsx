// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { canUseAI } from "@/lib/roles";
import { Sparkles, Send, Loader2, Wrench, Check, X, AlertTriangle, Paperclip, FileText, Plus, FolderPlus, Folder, MessageSquare, Settings2, Trash2, PanelLeft } from "lucide-react";
import { leggiAllegato, contestoAllegati } from "@/lib/ai/allegati";

// ── mini-markdown (grassetto, tabelle, elenchi) — niente dipendenze esterne ──
function inline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i} className="text-white">{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p)) return <code key={i} className="px-1 py-0.5 rounded bg-black/30 text-indigo-200 text-[12px]">{p.slice(1, -1)}</code>;
    return <span key={i}>{p}</span>;
  });
}
function Rich({ text }) {
  const lines = String(text || "").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("|") && line.includes("|", 1)) {
      const block = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { block.push(lines[i]); i++; }
      const rows = block
        .filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r))
        .map((r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      if (rows.length) {
        const [head, ...body] = rows;
        out.push(
          <div key={`t${i}`} className="my-2 overflow-x-auto">
            <table className="text-sm border border-white/10 rounded-lg overflow-hidden">
              <thead className="bg-white/5">
                <tr>{head.map((h, j) => <th key={j} className="px-3 py-1.5 text-left text-slate-300 font-semibold">{inline(h)}</th>)}</tr>
              </thead>
              <tbody>
                {body.map((r, j) => (
                  <tr key={j} className="border-t border-white/5">
                    {r.map((c, k) => <td key={k} className="px-3 py-1.5 text-slate-300">{inline(c)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      out.push(<ul key={`u${i}`} className="list-disc pl-5 my-1.5 space-y-0.5 text-sm text-slate-300">{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>);
      continue;
    }
    if (line.trim()) out.push(<p key={`p${i}`} className="text-sm text-slate-200 my-1 whitespace-pre-wrap">{inline(line)}</p>);
    i++;
  }
  return <>{out}</>;
}


/* ══ IL RESPIRO DELLA PAGINA (Luca 28/08 sera) ═══════════════════════════
   «deve essere un'esperienza da vivere, non una pagina del 2015».
   Niente effetti gratuiti: ogni animazione qui dice una cosa precisa —
   l'assistente sta pensando, il messaggio è appena arrivato, la barra ti
   sta ascoltando. Tutto si spegne da solo per chi ha chiesto meno
   movimento (prefers-reduced-motion). */
const AI_CSS = `
@keyframes aiSu { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes aiPulse { 0%,100% { opacity: .55; transform: scale(1); } 50% { opacity: 1; transform: scale(1.12); } }
@keyframes aiAura { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
@keyframes aiPunto { 0%,80%,100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
.ai-su { animation: aiSu .32s cubic-bezier(.22,1,.36,1) both; }
.ai-alone { animation: aiPulse 2.4s ease-in-out infinite; }
.ai-punto { display:inline-block; width:5px; height:5px; border-radius:99px; background:currentColor; animation: aiPunto 1.2s infinite; }
/* l'aura della barra: si accende quando stai scrivendo */
.ai-barra { position: relative; }
.ai-barra::before {
  content: ""; position: absolute; inset: -1px; border-radius: 18px; padding: 1px;
  background: linear-gradient(110deg, rgba(99,102,241,.7), rgba(168,85,247,.6), rgba(34,211,238,.6), rgba(99,102,241,.7));
  background-size: 200% 100%;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  opacity: 0; transition: opacity .25s ease;
}
.ai-barra.viva::before { opacity: 1; animation: aiAura 4s linear infinite; }
/* le pillole dei suggerimenti: si sollevano, non si limitano a schiarirsi */
.ai-sugg { transition: transform .18s cubic-bezier(.22,1,.36,1), background-color .18s, border-color .18s; }
.ai-sugg:hover { transform: translateY(-2px); }
@media (prefers-reduced-motion: reduce) {
  .ai-su, .ai-alone, .ai-barra.viva::before, .ai-punto { animation: none !important; }
  .ai-sugg:hover { transform: none; }
}
`;

/* ══ DA DOVE SI COMINCIA ═══════════════════════════════════════════════
   Quattro frasi uguali per tutti dicevano solo «questo coso esiste». Uno
   store manager che entra deve trovare le domande CHE SI FA LUI, col nome
   del suo negozio dentro: è la differenza fra uno strumento e il proprio
   strumento. */
/* «giovedì alle 23:10»: la data precisa fa riconoscere il momento in cui
   l'hai scritto, e quindi il pensiero che avevi. «3 giorni fa» no. */
const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
function quandoScritto(iso) {
  const d = new Date(iso || 0);
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const giorniFa = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (giorniFa < 1) return `oggi alle ${ora}`;
  if (giorniFa < 2) return `ieri alle ${ora}`;
  if (giorniFa < 7) return `${GIORNI[d.getDay()]} alle ${ora}`;
  return `il ${d.toLocaleDateString("it-IT", { day: "numeric", month: "long" })} alle ${ora}`;
}

const salutoOra = () => {
  const h = new Date().getHours();
  return h < 5 ? "Ancora sveglio" : h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
};

function spuntiPer(user) {
  const negozio = user?.negozio || user?.primary_store || null;
  const ruolo = String(user?.role || "");
  const mio = negozio ? ` di ${negozio}` : "";
  const perTutti = [
    { i: "📊", t: `Com'è andata oggi${mio}?`, q: `Fammi il punto sulla produzione di oggi${mio}: quante attivazioni, per brand, e come siamo messi rispetto a ieri.` },
    { i: "🏁", t: "A che punto sono le gare", q: "A che punto siamo con le gare del mese? Dimmi dove manca poco per chiudere una soglia." },
  ];
  const perNegozio = [
    { i: "👥", t: "Chi sta producendo di più", q: `Chi sta producendo di più${mio} questo mese, e chi è rimasto indietro?` },
    { i: "📋", t: "Pratiche ferme", q: `Ci sono pratiche in lavorazione o ferme${mio}? Elencamele con data e stato.` },
  ];
  const perDirezione = [
    { i: "🎯", t: "Dove conviene inserire", q: "Su quale codice conviene caricare le prossime attivazioni WindTre, e perché?" },
    { i: "⚠️", t: "Cosa non torna", q: "Guarda i numeri del mese e dimmi le tre cose che non tornano o che terrei d'occhio." },
  ];
  const direzione = ["admin", "dev", "direttore_generale", "direttore_commerciale", "amministrativo"].includes(ruolo);
  return [...perTutti, ...(direzione ? perDirezione : perNegozio)];
}

export default function AssistentePage() {
  const { user } = useAuth();
  const meId = user?.id;
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // ALLEGATI (Luca 28/08): il file si legge qui e se ne passa il TESTO come
  // contesto — il modello legge testo, non figure, e il file non lascia il CRM
  const [allegati, setAllegati] = useState([]);
  const [leggendo, setLeggendo] = useState(false);
  const fileRef = useRef(null);
  const scrollRef = useRef(null);

  /* ══ LO SPAZIO PERSONALE (Luca 28/08) ═══════════════════════════════════
     Chat e progetti di questa persona, tenuti nel CRM e non nel browser: si
     ritrovano da qualsiasi computer, e nessun altro può vederli (le regole
     del database li consegnano solo a chi li ha scritti). */
  const [spazio, setSpazio] = useState({ progetti: [], conversazioni: [], preferenze: null, modelli: null });
  const [convId, setConvId] = useState(null);
  const [progettoAperto, setProgettoAperto] = useState(null);   // filtro della lista
  const [barraAperta, setBarraAperta] = useState(true);
  const [impostazioni, setImpostazioni] = useState(false);
  const [modProgetto, setModProgetto] = useState(null);          // progetto in modifica
  const [menuModello, setMenuModello] = useState(false);         // il menù del cervello, sopra la barra
  const [insegnaA, setInsegnaA] = useState(null);                // su quale risposta sto insegnando
  const [insegnamento, setInsegnamento] = useState("");
  const [privacy, setPrivacy] = useState(false);          // la spiegazione del lucchetto
  /* ══ GLI APPUNTI E IL LORO RITORNO ═══════════════════════════════════
     Il ciclo che rende un assistente insostituibile: lasci una cosa in due
     secondi, la ritrovi quando serve senza averla cercata, e quindi lasci la
     prossima. Senza restituzione un posto dove scrivere si abbandona in due
     settimane. */
  const [ritorni, setRitorni] = useState([]);             // quelli la cui ora è arrivata
  const [modoAppunto, setModoAppunto] = useState(false);  // la barra scrive un appunto, non una domanda
  const [quandoRicorda, setQuandoRicorda] = useState(""); // "", stasera, domani, lunedi, settimana
  const [appuntoFatto, setAppuntoFatto] = useState("");   // la conferma che scivola via

  const chiediAppunti = async () => {
    try {
      const d = await fetch("/api/ai/appunti", { credentials: "include", cache: "no-store" }).then((r) => r.json());
      if (d?.daRestituire) setRitorni(d.daRestituire);
    } catch { /* niente ritorni: la pagina funziona lo stesso */ }
  };
  const salvaAppunto = async () => {
    const testo = input.trim();
    if (!testo) return;
    setInput(""); setModoAppunto(false);
    const d = await fetch("/api/ai/appunti", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ azione: "nuovo", testo, quando: quandoRicorda || null, origine: "assistente" }),
    }).then((r) => r.json()).catch(() => ({ error: "rete" }));
    setQuandoRicorda("");
    if (d?.error) { alert("Non sono riuscito ad annotarlo: " + d.error); setInput(testo); return; }
    // la conferma dice l'ora e basta: nessun commento su che ora sia
    const ora = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    setAppuntoFatto(`annotato, ${ora}`);
    setTimeout(() => setAppuntoFatto(""), 2600);
  };
  const ritornoVisto = async (id) => {
    setRitorni((p) => p.filter((x) => x.id !== id));
    await fetch("/api/ai/appunti", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ azione: "visto", id }),
    }).catch(() => { /* tornerà la prossima volta */ });
  };

  const chiediSpazio = async () => {
    try {
      const d = await fetch("/api/ai/spazio", { credentials: "include", cache: "no-store" }).then((r) => r.json());
      if (!d?.error) setSpazio({ progetti: d.progetti || [], conversazioni: d.conversazioni || [], preferenze: d.preferenze || null, modelli: d.modelli || null });
    } catch { /* offline: si continua con quello che c'è */ }
  };
  const azione = async (body) => {
    const d = await fetch("/api/ai/spazio", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json()).catch(() => ({ error: "rete" }));
    await chiediSpazio();
    return d;
  };
  useEffect(() => { if (meId) { chiediSpazio(); chiediAppunti(); } }, [meId]);

  // apre una conversazione salvata
  const apriChat = async (id) => {
    setConvId(id);
    setMsgs([]);
    try {
      const d = await fetch(`/api/ai/spazio?cosa=conversazione&id=${id}`, { credentials: "include", cache: "no-store" }).then((r) => r.json());
      if (d?.messaggi) {
        setMsgs(d.messaggi.filter((m) => m.ruolo !== "tool").map((m) => ({
          role: m.ruolo === "assistant" ? "assistant" : "user",
          content: m.contenuto || "",
        })));
      }
    } catch { /* conversazione non caricata */ }
  };
  const nuovaChat = async (progettoId) => {
    const d = await azione({ azione: "chat_nuova", progettoId: progettoId ?? progettoAperto ?? null });
    if (d?.conversazione?.id) { setConvId(d.conversazione.id); setMsgs([]); }
  };
  const eliminaChat = async (id) => {
    if (!window.confirm("Eliminare questa conversazione?")) return;
    await azione({ azione: "chat_elimina", id });
    if (convId === id) { setConvId(null); setMsgs([]); }
  };

  // Segnalazione 69: navigando fra le pagine del CRM la conversazione non deve
  // ripartire da zero. Prima i messaggi stavano solo nello state del componente,
  // quindi uscendo dalla pagina si perdevano. Ora restano salvati per l'utente e
  // si azzerano solo al logout (AuthContext rimuove questa chiave).

  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, loading]);

  const aggiungiFile = async (files) => {
    const lista = Array.from(files || []).slice(0, 5);
    if (!lista.length) return;
    setLeggendo(true);
    try {
      const letti = await Promise.all(lista.map(leggiAllegato));
      setAllegati((p) => [...p, ...letti].slice(0, 5));
    } finally { setLeggendo(false); }
  };

  const ask = async (text) => {
    const q = (text ?? input).trim();
    const conTesto = allegati.filter((a) => a.testo);
    if ((!q && !conTesto.length) || loading || !meId) return;
    // la domanda che vede il modello porta con sé il testo dei documenti;
    // quella che si vede a schermo resta pulita, coi file elencati sotto
    const domanda = q || "Leggi i documenti allegati e dimmi cosa contengono.";
    const perAI = domanda + contestoAllegati(allegati);
    const history = [...msgs.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })), { role: "user", content: perAI }];
    setMsgs((p) => [...p, { role: "user", content: domanda, allegati: conTesto.map((a) => ({ nome: a.nome, kb: a.kb })) }]);
    setInput(""); setAllegati([]); setLoading(true);
    // se sto scrivendo senza una conversazione aperta, se ne apre una: così
    // la domanda non va persa e la si ritrova domani
    let idConv = convId;
    if (!idConv) {
      const d = await azione({ azione: "chat_nuova", progettoId: progettoAperto ?? null });
      idConv = d?.conversazione?.id || null;
      if (idConv) setConvId(idConv);
    }
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, conversazioneId: idConv }),
      });
      const d = await res.json();
      if (d.error) setMsgs((p) => [...p, { role: "assistant", content: `⚠️ ${d.error}`, error: true }]);
      else { setMsgs((p) => [...p, { role: "assistant", content: d.answer, trace: d.trace, pending: d.pending_action, usage: d.usage }]); chiediSpazio(); }
    } catch (e) {
      setMsgs((p) => [...p, { role: "assistant", content: `⚠️ Errore di rete: ${e?.message || e}`, error: true }]);
    } finally { setLoading(false); }
  };

  const confirmAction = async (idx, action) => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      setMsgs((p) => p.map((m, i) => (i === idx ? { ...m, pending: null, done: d.error ? `⚠️ ${d.error}` : `✅ ${d.result}` } : m)));
    } finally { setLoading(false); }
  };
  const cancelAction = (idx) =>
    setMsgs((p) => p.map((m, i) => (i === idx ? { ...m, pending: null, done: "Azione annullata." } : m)));

  const convDelProgetto = spazio.conversazioni.filter((c) => (progettoAperto ? c.progetto_id === progettoAperto : true));
  const nomeAssistente = spazio.preferenze?.nome_assistente || "Assistente CRM";
  const spunti = useMemo(() => spuntiPer(user), [user?.role, user?.negozio, user?.primary_store]);
  /* le memorie come RIGHE: una cosa imparata per riga. Un unico testone non
     si legge e non fa capire che si può insegnare a pezzi. */
  /* Oggi · Ieri · Ultimi 7 giorni · Prima — e le fissate sopra a tutto.
     Dati che il server manda già: `ultimo_messaggio_at` e `fissata`. */
  const gruppiConv = useMemo(() => {
    const g = { fissate: [], oggi: [], ieri: [], settimana: [], prima: [] };
    const ora = new Date();
    const inizioOggi = new Date(ora.getFullYear(), ora.getMonth(), ora.getDate()).getTime();
    for (const c of convDelProgetto) {
      if (c.fissata) { g.fissate.push(c); continue; }
      const t = new Date(c.ultimo_messaggio_at || 0).getTime();
      if (t >= inizioOggi) g.oggi.push(c);
      else if (t >= inizioOggi - 864e5) g.ieri.push(c);
      else if (t >= inizioOggi - 7 * 864e5) g.settimana.push(c);
      else g.prima.push(c);
    }
    return [
      { titolo: "📌 Fissate", righe: g.fissate },
      { titolo: "Oggi", righe: g.oggi },
      { titolo: "Ieri", righe: g.ieri },
      { titolo: "Ultimi 7 giorni", righe: g.settimana },
      { titolo: "Prima", righe: g.prima },
    ].filter((x) => x.righe.length);
  }, [convDelProgetto]);
  const modelloAttivo = (spazio.modelli?.disponibili || []).find((m) => m.id === spazio.modelli?.attuale) || null;
  /* si cambia DA QUI, in un click: aprire un pannello per scegliere il
     cervello e poi salvare era una cerimonia per una cosa che si fa a metà
     conversazione */
  const cambiaModello = async (id) => {
    setMenuModello(false);
    setSpazio((p) => ({ ...p, modelli: { ...p.modelli, attuale: id } }));   // subito a schermo
    const r = await azione({
      azione: "preferenze_salva",
      nomeAssistente: spazio.preferenze?.nome_assistente ?? null,
      personalita: spazio.preferenze?.personalita ?? null,
      memorie: spazio.preferenze?.memorie ?? null,
      modello: id,
    });
    if (r?.error) alert("Non sono riuscito a cambiare modello: " + r.error);
  };
  const memorieScritte = String(spazio.preferenze?.memorie || "")
    .split("\n").map((r) => r.trim()).filter(Boolean);
  /* la cosa imparata si aggiunge IN CODA alle memorie: una per riga, così
     restano leggibili e cancellabili una a una */
  const salvaInsegnamento = async () => {
    const t = insegnamento.trim();
    if (!t) return;
    const nuove = [...memorieScritte, t].join("\n");
    setInsegnaA(null); setInsegnamento("");
    const r = await azione({
      azione: "preferenze_salva",
      nomeAssistente: spazio.preferenze?.nome_assistente ?? null,
      personalita: spazio.preferenze?.personalita ?? null,
      memorie: nuove,
    });
    if (r?.error) alert("Non sono riuscito a ricordarlo: " + r.error);
  };

  /* ══ PERMESSI, DOPO GLI STATI (28/08 sera) ══════════════════════════
     Nascondere la voce di menù non basta: l'indirizzo si può digitare. Ma
     questo controllo stava PRIMA delle dichiarazioni di stato, e uscire di lì
     faceva contare a React un numero di stati diverso fra un passaggio e
     l'altro: ricaricando la pagina con F5 andava in errore. Dal menù non si
     vedeva, perché lì l'utente è già caricato. Ora esce da qui, dove tutto è
     già dichiarato. */
  if (!canUseAI(user?.role)) {
    return (
      <div className="w-full">
        <div className="glass-card p-8 text-center">
          <h2 className="text-xl font-bold text-white mb-2">Assistente AI</h2>
          <p className="text-slate-400 text-sm">
            Funzione riservata ai ruoli manageriali. Se ti serve, chiedi al tuo responsabile.
          </p>
        </div>
      </div>
    );
  }

  return (
    /* ══ UNA SOLA SUPERFICIE ═══════════════════════════════════════════
       Il fondo era opaco e copriva le sfumature del CRM: la pagina si leggeva
       come un rettangolo estraneo appoggiato dentro l'app. Ora è velata, il
       fondo dell'applicazione si vede sotto, e la pagina ci appartiene. */
    <div className="-m-4 sm:-m-6 md:-m-8 h-[calc(100dvh-4rem)] flex relative overflow-hidden bg-[#0f111a]/60">
      <style>{AI_CSS}</style>

      {/* ══ LA BARRA: progetti e conversazioni, come in un'app di chat ══ */}
      {barraAperta && (
        /* Nessun bordo, nessun colore proprio: una velatura sulla STESSA
           superficie, e una sfumatura al posto della linea di taglio. Prima
           erano due colonne affiancate di due colori diversi — con il menù del
           CRM aperto se ne vedevano addirittura tre. */
        <aside className="relative w-[264px] shrink-0 bg-white/[0.02] flex flex-col min-h-0">
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 translate-x-full bg-gradient-to-r from-white/[0.03] to-transparent" />
          <div className="p-3 pb-2 space-y-2">
            <button onClick={() => nuovaChat(null)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors">
              <Plus className="w-4 h-4" /> Nuova conversazione
            </button>
            <button onClick={async () => {
                const nome = window.prompt("Nome del progetto (es. «Marketing agenzie»)");
                if (!nome) return;
                const d = await azione({ azione: "progetto_nuovo", nome });
                if (d?.progetto?.id) setModProgetto(d.progetto);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-slate-300 text-xs hover:bg-white/10">
              <FolderPlus className="w-3.5 h-3.5" /> Nuovo progetto
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {spazio.progetti.length > 0 && (
              <div>
                <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">Progetti</p>
                {spazio.progetti.map((pr) => (
                  <div key={pr.id} className="group/pr flex items-center gap-1">
                    <button onClick={() => setProgettoAperto(progettoAperto === pr.id ? null : pr.id)}
                      className={cnx("flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] transition-colors",
                        progettoAperto === pr.id ? "bg-indigo-500/20 text-indigo-200" : "text-slate-300 hover:bg-white/5")}>
                      <span className="shrink-0">{pr.emoji || "📁"}</span>
                      <span className="truncate">{pr.nome}</span>
                    </button>
                    <button onClick={() => setModProgetto(pr)} title="Contesto e impostazioni del progetto"
                      className="opacity-0 group-hover/pr:opacity-100 p-1 rounded text-slate-500 hover:text-white">
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* ══ LE CONVERSAZIONI, IN ORDINE DI TEMPO ═══════════════════
                Il server manda da sempre QUANDO hai parlato l'ultima volta con
                ognuna, e quali hai fissato: la pagina buttava via tutt'e due e
                mostrava un elenco piatto. Una lista che si allunga senza tempo
                diventa illeggibile in due settimane. */}
            {convDelProgetto.length === 0 ? (
              <p className="px-2 py-3 text-[12px] text-slate-600">
                {progettoAperto ? "Questo progetto è ancora vuoto." : "Le conversazioni che apri restano qui."}
              </p>
            ) : gruppiConv.map((g) => (
              <div key={g.titolo}>
                <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">{g.titolo}</p>
                {g.righe.map((c) => (
                  <div key={c.id} className="group/c relative flex items-center gap-1">
                    {/* l'attiva si segna con una linguetta di luce nel margine,
                        non con un riquadro: il riquadro spezza la colonna */}
                    {convId === c.id && (
                      <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gradient-to-b from-indigo-400 to-violet-500" />
                    )}
                    <button onClick={() => apriChat(c.id)}
                      className={cnx("flex-1 min-w-0 flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg text-[13px] text-left transition-colors",
                        convId === c.id ? "bg-white/[0.06] text-white" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200")}>
                      {c.fissata && <span className="shrink-0 text-[10px] leading-none">📌</span>}
                      <span className="truncate">{c.titolo || "Nuova conversazione"}</span>
                    </button>
                    <button onClick={() => eliminaChat(c.id)} title="Elimina"
                      className="opacity-0 group-hover/c:opacity-100 p-1 rounded text-slate-600 hover:text-rose-300 transition-opacity">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* ══ IL PIEDE: CHI SEI, E CHE QUI SEI SOLO ═══════════════════
              Prima c'era un secondo pulsante "Personalità e memorie", uguale a
              quello in testata: due comandi per la stessa cosa fanno solo
              chiedere quale dei due comandi.
              Al suo posto la cosa che mancava davvero. Questo spazio è privato
              per costruzione — le regole del database non consegnano a nessuno
              le conversazioni di un altro, amministratore compreso — ma se non
              lo si dice, nessuno lo sa: e chi non lo sa non ci scrive dentro le
              cose che contano. */}
          <div className="mt-auto p-3 space-y-2">
            <button onClick={() => setPrivacy((v) => !v)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-slate-500 hover:text-slate-300 hover:bg-white/[0.03] transition-colors">
              <span className="text-[13px] leading-none">🔒</span>
              <span className="font-semibold">Solo tu — nemmeno l&apos;amministratore</span>
            </button>
            {privacy && (
              <p className="ai-su px-2 text-[11px] text-slate-500 leading-relaxed">
                Le conversazioni, i progetti e le memorie sono legati al tuo profilo dal database stesso: una
                richiesta fatta con un altro account non le riceve, e non c&apos;è una schermata da cui leggerle.
                Nessuno in azienda vede cosa scrivi qui — solo quante persone usano l&apos;assistente e quanto costa.
              </p>
            )}
          </div>
        </aside>
      )}

    <div className="flex-1 min-w-0 flex flex-col">
      {/* niente seconda testata (il CRM ne ha già una sopra): questi comandi
          galleggiano sulla conversazione, senza linea che li separi. `min-h`
          e non `h`: al massimo ingrandimento dei testi il contenuto usciva. */}
      <div className="flex items-center gap-3 px-5 min-h-[52px] py-2 shrink-0">
        <button onClick={() => setBarraAperta((v) => !v)} title="Mostra/nascondi le conversazioni"
          className="p-1.5 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white">
          <PanelLeft className="w-4 h-4" />
        </button>
        <span className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
          {loading && <span className="absolute inset-0 rounded-xl bg-indigo-500/50 blur-md ai-alone" />}
          <Sparkles className="relative w-4 h-4 text-white" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">{nomeAssistente}</p>
          <p className="text-[11px] text-slate-500 truncate">
            {progettoAperto
              ? <>📁 {spazio.progetti.find((x) => x.id === progettoAperto)?.nome || ""}</>
              : <>Conosce i tuoi dati del CRM{modelloAttivo ? <> · <span className="text-slate-400">{modelloAttivo.id === "deepseek-v4-pro" ? "🧠" : "⚡"} {modelloAttivo.nome}</span></> : null}</>}
          </p>
        </div>
        {/* la scorciatoia alla conoscenza sta in alto, dove si guarda: in
            fondo alla colonna di sinistra non la trovava nessuno */}
        <button onClick={() => setImpostazioni(true)} title="Personalità e memorie: insegnagli come ragioni"
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-violet-400/25 bg-violet-500/10 text-violet-200 text-[11px] font-bold hover:bg-violet-500/20 transition-colors shrink-0">
          🧠 <span className="hidden sm:inline">{memorieScritte.length ? `Sa ${memorieScritte.length} cose di te` : "Insegnagli"}</span>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          /* ══ IL PRIMO IMPATTO ═══════════════════════════════════════════
             Chi entra deve capire tre cose in tre secondi: che sa i fatti
             SUOI, che si può cominciare senza pensare cosa scrivere, e che
             questo assistente si può EDUCARE. Prima c'era una scintilla
             grigia e quattro frasi buone per chiunque. */
          <div className="max-w-3xl mx-auto mt-6 sm:mt-10 ai-su">
            <div className="text-center">
              <div className="relative inline-flex items-center justify-center mb-4">
                <span className="absolute inset-0 rounded-full bg-indigo-500/25 blur-xl ai-alone" />
                <span className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                  <Sparkles className="w-7 h-7 text-white" />
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {salutoOra()}{user?.name ? `, ${String(user.name).split(" ")[0]}` : ""}
              </h2>
              <p className="text-sm text-slate-400 mt-1.5">
                Conosco i dati del CRM: vendite, gare, clienti, pratiche, squadra.
                <span className="text-slate-500"> Chiedi in italiano, come lo diresti a un collega.</span>
              </p>
            </div>

            {/* ══ QUELLO CHE MI AVEVI LASCIATO ═══════════════════════════
                Sta sopra ogni altra cosa perché è l'unico motivo per cui uno
                riapre: non «c'è uno strumento», ma «c'è una cosa mia che mi
                aspetta». Se non c'è niente di vero da dire, non compare —
                un ritorno inventato vale meno di nessun ritorno. */}
            {ritorni.length > 0 && (
              <div className="mt-6 space-y-2">
                {ritorni.map((r) => (
                  <div key={r.id} className="ai-su rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500/[0.09] to-transparent px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <span className="text-lg leading-none mt-0.5">📌</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-amber-100/90 leading-relaxed">{r.testo}</p>
                        <p className="text-[11px] text-amber-200/50 mt-1.5">
                          me l&apos;avevi lasciato tu, {quandoScritto(r.created_at)}
                        </p>
                      </div>
                      <button onClick={() => ritornoVisto(r.id)} title="Ok, l'ho visto"
                        className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[11px] font-bold transition-colors">
                        fatto
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-2 mt-6">
              {spunti.map((sp) => (
                <button key={sp.t} onClick={() => ask(sp.q)}
                  className="ai-sugg group text-left px-3.5 py-3 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.07] hover:border-indigo-400/40">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{sp.i}</span>
                    <span className="text-sm font-semibold text-slate-100 group-hover:text-white">{sp.t}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* COSA SO DI TE — il pezzo che fa capire che è personalizzabile.
                Se non gli hai insegnato niente lo dice, e ti fa cominciare. */}
            <button onClick={() => setImpostazioni(true)}
              className="ai-sugg w-full mt-3 text-left px-4 py-3.5 rounded-2xl border border-violet-400/25 bg-gradient-to-r from-violet-500/[0.08] to-fuchsia-500/[0.05] hover:border-violet-400/50">
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">🧠</span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-violet-200">
                    {memorieScritte.length ? `So ${memorieScritte.length} cose di te` : "Non so ancora niente di te"}
                  </div>
                  <div className="text-[12px] text-slate-400 mt-0.5 leading-relaxed">
                    {memorieScritte.length
                      ? <>Es.: «{memorieScritte[0].slice(0, 70)}{memorieScritte[0].length > 70 ? "…" : ""}» · <span className="text-violet-300">insegnami altro</span></>
                      : <>Insegnami come ragioni: quali negozi segui, come vuoi le risposte, le tue sigle. <span className="text-violet-300">Da qui in poi me lo ricordo.</span></>}
                  </div>
                </div>
              </div>
            </button>
          </div>
        )}

        <div className="max-w-3xl mx-auto space-y-3">
          {msgs.map((m, idx) => (
            <div key={idx} className={`ai-su flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${m.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : `bg-white/5 border rounded-bl-sm ${m.error ? "border-rose-500/30" : "border-white/5"}`}`}>
                {m.role === "user"
                  ? <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                  : <Rich text={m.content} />}
                {m.allegati?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {m.allegati.map((a, j) => (
                      <span key={j} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/20 text-[11px] text-white/80">
                        <FileText className="w-3 h-3" /> {a.nome}
                      </span>
                    ))}
                  </div>
                )}

                {m.trace?.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-[11px] text-slate-500 cursor-pointer flex items-center gap-1">
                      <Wrench className="w-3 h-3" /> {m.trace.length} query eseguite
                    </summary>
                    <div className="mt-1 space-y-0.5">
                      {m.trace.map((t, j) => (
                        <p key={j} className={`text-[11px] ${t.ok ? "text-slate-500" : "text-rose-400"}`}>
                          {t.ok ? "•" : "✕"} {t.tool} {t.summary ? `— ${t.summary}` : ""}
                        </p>
                      ))}
                    </div>
                  </details>
                )}

                {m.pending && (
                  <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="text-xs text-amber-200 font-semibold flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Conferma richiesta
                    </p>
                    <p className="text-[11px] text-amber-100/80 mb-2 break-words">
                      <b>{m.pending.tool}</b> — {JSON.stringify(m.pending.args)}
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => confirmAction(idx, m.pending)} disabled={loading}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50">
                        <Check className="w-3.5 h-3.5" /> Conferma
                      </button>
                      <button onClick={() => cancelAction(idx)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-white/10 hover:bg-white/15 text-slate-200">
                        <X className="w-3.5 h-3.5" /> Annulla
                      </button>
                    </div>
                  </div>
                )}
                {m.done && <p className="mt-2 text-xs text-slate-300">{m.done}</p>}
                {/* ══ INSEGNAGLI DA QUI (Luca 28/08 sera) ══════════════════
                    Il momento in cui uno capisce che l'assistente si educa è
                    quello in cui la risposta NON è come la voleva. Se per
                    correggerlo deve ricordarsi di aprire un pannello, non lo
                    farà mai: il gesto sta dov'è nato il bisogno. */}
                {m.role === "assistant" && !m.error && (
                  <div className="mt-2 -mb-0.5">
                    {insegnaA === idx ? (
                      <div className="ai-su flex items-center gap-1.5">
                        <input autoFocus value={insegnamento} onChange={(e) => setInsegnamento(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") salvaInsegnamento(); if (e.key === "Escape") setInsegnaA(null); }}
                          placeholder="Es.: gli importi dammeli sempre senza decimali"
                          className="flex-1 min-w-0 bg-black/30 border border-violet-400/40 rounded-lg px-2.5 py-1.5 text-[12px] text-slate-100 placeholder:text-slate-600 outline-none" />
                        <button onClick={salvaInsegnamento} disabled={!insegnamento.trim()}
                          className="px-2.5 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white text-[11px] font-bold">Ricorda</button>
                        <button onClick={() => setInsegnaA(null)} className="p-1.5 rounded-lg text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setInsegnaA(idx); setInsegnamento(""); }}
                        className="text-[11px] text-slate-600 hover:text-violet-300 transition-colors">
                        🧠 insegnami come la volevi
                      </button>
                    )}
                  </div>
                )}
                {m.usage && (
                  <p className="mt-1.5 text-[10px] text-slate-600">
                    {m.usage.ms} ms · ${m.usage.costUsd?.toFixed(4)}
                  </p>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="ai-su flex justify-start items-end gap-2">
              <span className="relative w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
                <span className="absolute inset-0 rounded-xl bg-indigo-500/40 blur-md ai-alone" />
                <Sparkles className="relative w-3.5 h-3.5 text-white" />
              </span>
              <div className="bg-white/5 border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 text-indigo-300">
                <span className="ai-punto" style={{ animationDelay: "0ms" }} />
                <span className="ai-punto" style={{ animationDelay: "150ms" }} />
                <span className="ai-punto" style={{ animationDelay: "300ms" }} />
                <span className="text-[12px] text-slate-500 ml-1">sto guardando nel CRM</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nessuna linea sopra la barra: una sfumatura che sale dal fondo. Il
          testo scorre e si dissolve invece di essere tagliato — è la
          differenza fra due riquadri accostati e una sola superficie. */}
      <div className="relative px-4 py-3 shrink-0">
        <span aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-[#0f111a]/80 to-transparent" />
        <div className="max-w-3xl mx-auto">
          {/* ALLEGATI IN ATTESA (Luca 28/08): si vedono prima di mandare, con
              i KB, e si tolgono uno per uno. Quelli che non so leggere lo
              dicono, invece di sparire in silenzio. */}
          {(allegati.length > 0 || leggendo) && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {allegati.map((a, i) => (
                <span key={i} title={a.problema || `${a.testo.length} caratteri letti`}
                  className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border text-[11px] ${a.problema
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                    : "border-white/10 bg-white/5 text-slate-300"}`}>
                  <FileText className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[220px]">{a.nome}</span>
                  <span className="text-slate-500">{a.problema ? `· ${a.problema}` : `· ${a.kb} KB`}</span>
                  <button onClick={() => setAllegati((p) => p.filter((_, j) => j !== i))}
                    className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-white"><X className="w-3 h-3" /></button>
                </span>
              ))}
              {leggendo && <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> leggo il file…</span>}
            </div>
          )}
          {/* ══ LA BARRA ═══════════════════════════════════════════════════
              Un solo blocco che si accende quando scrivi, non tre controlli
              slegati. Il MODELLO sta qui accanto all'invio — dove lo si
              cerca — e non sepolto nelle impostazioni in fondo alla colonna
              (Luca 28/08 sera: «lo switch è vicino al pulsante di invio,
              non agli allegati»). */}
          {/* la promessa: «ricordamelo…». Un clic, oppure niente. */}
          {modoAppunto && (
            <div className="ai-su flex items-center gap-1.5 mb-2 px-1 flex-wrap">
              <span className="text-[11px] text-slate-500">ricordamelo</span>
              {[["", "quando lo cerco"], ["stasera", "stasera"], ["domani", "domani"], ["lunedi", "lunedì"], ["settimana", "fra una settimana"]].map(([v, l]) => (
                <button key={v || "mai"} onClick={() => setQuandoRicorda(v)}
                  className={cnx("px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors",
                    quandoRicorda === v ? "bg-amber-500/25 text-amber-200" : "text-slate-500 hover:text-slate-300 hover:bg-white/5")}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {appuntoFatto && (
            <div className="ai-su mb-2 px-1 text-[12px] text-amber-200/90">📌 {appuntoFatto}</div>
          )}
          <div className={cnx("ai-barra rounded-2xl px-2 py-2 border transition-colors",
            modoAppunto ? "bg-amber-500/[0.06] border-amber-400/30" : "bg-white/[0.04] border-white/10",
            (input.trim() || allegati.length) && "viva")}>
            <input ref={fileRef} type="file" multiple hidden
              accept=".pdf,.csv,.txt,.md,.json,.xml,.log,.tsv,.eml,.xlsx,.xls,.xlsm,.ods,text/*"
              onChange={(e) => { aggiungiFile(e.target.files); e.target.value = ""; }} />
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); modoAppunto ? salvaAppunto() : ask(); } }}
              onPaste={(e) => { const f = Array.from(e.clipboardData?.files || []); if (f.length) { e.preventDefault(); aggiungiFile(f); } }}
              placeholder={modoAppunto ? "Scrivi l'appunto: te lo tengo io…" : `Scrivi a ${nomeAssistente}…`}
              className="w-full bg-transparent border-0 outline-none resize-none max-h-40 px-2.5 pt-1.5 pb-2 text-[15px] text-slate-100 placeholder:text-slate-600" />
            <div className="flex items-center gap-1.5 px-1">
              <button onClick={() => fileRef.current?.click()} disabled={loading || leggendo}
                title="Allega un documento: PDF, Excel, CSV o testo. Il file resta nel CRM: all'assistente arriva solo il testo."
                className="p-2 rounded-xl text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40 transition-colors">
                <Paperclip className="w-4.5 h-4.5" />
              </button>

              {/* ══ ANNOTA, senza aspettare risposta ═══════════════════════
                  Alle 23 di sabato nessuno «apre una chat con l'AI aziendale».
                  Un campo che accetta una riga e sparisce, invece, sì. È la
                  porta dell'uso personale — e l'inizio del giro di ritorno. */}
              <button onClick={() => setModoAppunto((v) => !v)}
                title="Lascia un appunto: te lo tengo io, e se vuoi te lo riporto davanti"
                className={cnx("flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[12px] font-semibold transition-colors",
                  modoAppunto ? "bg-amber-500/20 text-amber-200" : "text-slate-400 hover:bg-white/10 hover:text-white")}>
                <span>📌</span><span className="hidden sm:inline">Annota</span>
              </button>

              {/* QUALE CERVELLO — solo se te lo hanno concesso */}
              {spazio.modelli?.libero && (
                <div className="relative">
                  <button onClick={() => setMenuModello((v) => !v)}
                    title="Quale modello risponde"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[12px] font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
                    <span>{modelloAttivo?.id === "deepseek-v4-pro" ? "🧠" : "⚡"}</span>
                    <span className="hidden sm:inline">{modelloAttivo?.nome || "Veloce"}</span>
                  </button>
                  {menuModello && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setMenuModello(false)} />
                      <div className="absolute bottom-full mb-2 left-0 z-30 w-[290px] rounded-2xl border border-white/10 bg-[#12141f] shadow-2xl ring-1 ring-white/10 overflow-hidden ai-su">
                        {(spazio.modelli?.disponibili || []).map((m) => (
                          <button key={m.id} onClick={() => cambiaModello(m.id)}
                            className={cnx("w-full text-left px-3.5 py-3 border-b border-white/5 last:border-0 transition-colors",
                              modelloAttivo?.id === m.id ? "bg-indigo-500/15" : "hover:bg-white/5")}>
                            <div className="flex items-center gap-2">
                              <span>{m.id === "deepseek-v4-pro" ? "🧠" : "⚡"}</span>
                              <span className="text-sm font-bold text-white">{m.nome}</span>
                              {modelloAttivo?.id === m.id && <Check className="w-3.5 h-3.5 text-indigo-300 ml-auto" />}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1 leading-snug">{m.descrizione}</div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <span className="ml-auto text-[11px] text-slate-600 hidden sm:block pr-1">
                <kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10">Invio</kbd> manda ·{" "}
                <kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10">Shift+Invio</kbd> va a capo
              </span>
              <button onClick={() => (modoAppunto ? salvaAppunto() : ask())}
                disabled={loading || leggendo || (!input.trim() && !(modoAppunto ? false : allegati.some((a) => a.testo)))}
                title={modoAppunto ? "Annota" : "Manda"}
                className={cnx("p-2.5 rounded-xl transition-all",
                  (input.trim() || allegati.some((a) => a.testo)) && !loading
                    ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30 hover:-translate-y-px active:scale-95"
                    : "bg-white/5 text-slate-600")}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* ══ PERSONALITÀ E MEMORIE — le impostazioni di ciascuno ══ */}
    {impostazioni && (
      <PannelloPreferenze
        valori={spazio.preferenze}
        onChiudi={() => setImpostazioni(false)}
        /* SE NON SALVA, NON SI CHIUDE (rilievo del revisore): l'errore veniva
           buttato via e il pannello si chiudeva come se avesse salvato — con
           personalità e memorie appena scritte perse senza una parola. */
        onSalva={async (v) => {
          const r = await azione({ azione: "preferenze_salva", ...v });
          if (r?.error) { alert("Non sono riuscito a salvare: " + r.error + "\n\nLe tue impostazioni sono ancora qui: riprova o copiale altrove prima di chiudere."); return false; }
          setImpostazioni(false);
          return true;
        }}
      />
    )}

    {/* ══ IL CONTESTO DI UN PROGETTO ══ */}
    {modProgetto && (
      <PannelloProgetto
        progetto={modProgetto}
        onChiudi={() => setModProgetto(null)}
        onSalva={async (v) => { await azione({ azione: "progetto_salva", id: modProgetto.id, ...v }); setModProgetto(null); }}
        onElimina={async () => {
          if (!window.confirm("Eliminare il progetto? Le conversazioni restano, senza progetto.")) return;
          await azione({ azione: "progetto_elimina", id: modProgetto.id });
          if (progettoAperto === modProgetto.id) setProgettoAperto(null);
          setModProgetto(null);
        }}
      />
    )}
    </div>
  );
}

/* ── piccola utility locale: le classi condizionali senza dipendenze ── */
function cnx(...v) { return v.filter(Boolean).join(" "); }

/* ══ PERSONALITÀ E MEMORIE (Luca 28/08) ═════════════════════════════════
   «ognuno può settare l'assistente come più gli piace, dandogli delle
   memorie e delle istruzioni». Vale solo per chi le scrive. */
/* IL MODELLO NON STA QUI (Luca 28/08 sera): «deve essere visibile solamente
   dalla barra in cui scrivo e solo da lì posso cambiarlo». Una cosa, un posto:
   averla in due punti costringe a chiedersi ogni volta quale dei due comanda. */
function PannelloPreferenze({ valori, onChiudi, onSalva }) {
  const [nomeAssistente, setNome] = useState(valori?.nome_assistente || "");
  const [personalita, setPersonalita] = useState(valori?.personalita || "");
  const [memorie, setMemorie] = useState(valori?.memorie || "");
  const [salvando, setSalvando] = useState(false);
  const [nuovaMemoria, setNuovaMemoria] = useState("");
  const righeMemoria = String(memorie || "").split("\n").map((r) => r.trim()).filter(Boolean);
  const aggiungiMemoria = () => {
    const t = nuovaMemoria.trim();
    if (!t) return;
    setMemorie([...righeMemoria, t].join("\n"));
    setNuovaMemoria("");
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onChiudi}>
      <div className="glass-card border-white/10 w-full max-w-lg p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-white">✨ Il tuo assistente</h3>
          <button onClick={onChiudi} className="p-1.5 rounded-lg text-slate-400 hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-500 -mt-2">Queste impostazioni valgono <b className="text-slate-300">solo per te</b>: nessun altro le vede e nessun altro ne è influenzato.</p>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Come si chiama</label>
          <input value={nomeAssistente} onChange={(e) => setNome(e.target.value)} placeholder="Assistente CRM"
            className="glass-input w-full text-sm" />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Come vuoi che ti risponda</label>
          <textarea value={personalita} onChange={(e) => setPersonalita(e.target.value)} rows={4}
            placeholder={"Es.: Vai dritto al punto, niente premesse. Dammi sempre i numeri prima del commento. Se una cosa non è chiara chiedimela invece di indovinare."}
            className="glass-input w-full text-sm resize-none" />
        </div>

        {/* ══ QUELLO CHE SA DI TE, UNA COSA PER VOLTA ═══════════════════
            Un testone unico non si legge, non si corregge e non fa capire
            che si può insegnare a pezzi. Qui ogni cosa imparata è una
            scheda: si aggiunge, si toglie, si conta. */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Cosa sa di te <span className="text-slate-600 normal-case font-normal">— {righeMemoria.length ? `${righeMemoria.length} cose` : "ancora niente"}</span>
          </label>
          {righeMemoria.length > 0 && (
            <div className="space-y-1.5">
              {righeMemoria.map((r, i) => (
                <div key={i} className="group flex items-start gap-2 px-3 py-2 rounded-xl bg-violet-500/[0.07] border border-violet-400/20">
                  <span className="text-violet-300 text-xs mt-0.5">🧠</span>
                  <span className="flex-1 text-[13px] text-slate-200 leading-snug">{r}</span>
                  <button onClick={() => setMemorie(righeMemoria.filter((_, j) => j !== i).join("\n"))}
                    title="Dimentica questa"
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-500 hover:text-rose-300 transition-opacity">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <input value={nuovaMemoria} onChange={(e) => setNuovaMemoria(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungiMemoria(); } }}
              placeholder="Es.: quando dico «i miei» intendo Acilia e Baleniere"
              className="glass-input flex-1 text-sm" />
            <button onClick={aggiungiMemoria} disabled={!nuovaMemoria.trim()}
              className="px-3 py-2 rounded-lg bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white text-xs font-bold shrink-0">
              Aggiungi
            </button>
          </div>
          <p className="text-[10px] text-slate-600">
            Vale in ogni conversazione. Puoi aggiungerne anche durante una chat, con «insegnami come la volevi» sotto le risposte.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onChiudi} className="px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-white/5">Annulla</button>
          <button onClick={async () => { setSalvando(true); await onSalva({ nomeAssistente, personalita, memorie }); setSalvando(false); }}
            disabled={salvando}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold">{salvando ? "Salvo…" : "Salva"}</button>
        </div>
      </div>
    </div>
  );
}

/* ══ IL CONTESTO DI UN PROGETTO ═════════════════════════════════════════
   Le istruzioni scritte qui valgono per tutte le conversazioni del progetto:
   è il modo di dire una volta sola «quando lavoriamo qui, sappi che…». */
function PannelloProgetto({ progetto, onChiudi, onSalva, onElimina }) {
  const [nome, setNome] = useState(progetto.nome || "");
  const [emoji, setEmoji] = useState(progetto.emoji || "");
  const [istruzioni, setIstruzioni] = useState(progetto.istruzioni || "");
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onChiudi}>
      <div className="glass-card border-white/10 w-full max-w-lg p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-white">📁 Progetto</h3>
          <button onClick={onChiudi} className="p-1.5 rounded-lg text-slate-400 hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex gap-2">
          <input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 2))} placeholder="📁"
            className="glass-input w-16 text-center text-lg" />
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome del progetto"
            className="glass-input flex-1 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Contesto del progetto</label>
          <textarea value={istruzioni} onChange={(e) => setIstruzioni(e.target.value)} rows={7}
            placeholder={"Es.: Qui lavoriamo al piano marketing per le agenzie di Roma. Il tono è commerciale. Quando parlo di «onde» intendo le fasi di contatto. Non propormi canali che non siano email, volantini o Facebook."}
            className="glass-input w-full text-sm resize-none" />
          <p className="text-[10px] text-slate-600">L'assistente lo terrà presente in tutte le conversazioni di questo progetto.</p>
        </div>
        <div className="flex justify-between gap-2 pt-1">
          <button onClick={onElimina} className="px-3 py-2 rounded-lg text-sm text-rose-300 hover:bg-rose-500/10">Elimina progetto</button>
          <div className="flex gap-2">
            <button onClick={onChiudi} className="px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-white/5">Annulla</button>
            <button onClick={() => onSalva({ nome, emoji, istruzioni })}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold">Salva</button>
          </div>
        </div>
      </div>
    </div>
  );
}
