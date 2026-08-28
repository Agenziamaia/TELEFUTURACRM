// @ts-nocheck
"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { canUseAI } from "@/lib/roles";
import { Sparkles, Send, Loader2, Wrench, Check, X, AlertTriangle, Paperclip, FileText } from "lucide-react";
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

const SUGGESTIONS = [
  "Quanti contratti per brand?",
  "Contratti in lavorazione del mio negozio",
  "Chi lavora nel negozio Garbatella?",
  "Ultime comunicazioni aziendali",
];

export default function AssistentePage() {
  const { user } = useAuth();
  // Nascondere la voce di menu non basta: la pagina e' raggiungibile per URL.
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

  // Segnalazione 69: navigando fra le pagine del CRM la conversazione non deve
  // ripartire da zero. Prima i messaggi stavano solo nello state del componente,
  // quindi uscendo dalla pagina si perdevano. Ora restano salvati per l'utente e
  // si azzerano solo al logout (AuthContext rimuove questa chiave).
  const CHAT_KEY = meId ? `crm_ai_chat_${meId}` : null;
  const chatReady = useRef(false);
  useEffect(() => {
    if (!CHAT_KEY) return;
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      if (raw) { const d = JSON.parse(raw); if (Array.isArray(d)) setMsgs(d); }
    } catch { /* ignore */ }
    chatReady.current = true;
  }, [CHAT_KEY]);
  useEffect(() => {
    if (!CHAT_KEY || !chatReady.current) return;
    try {
      if (msgs.length === 0) localStorage.removeItem(CHAT_KEY);
      else localStorage.setItem(CHAT_KEY, JSON.stringify(msgs));
    } catch { /* ignore */ }
  }, [msgs, CHAT_KEY]);

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
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: meId, messages: history }),
      });
      const d = await res.json();
      if (d.error) setMsgs((p) => [...p, { role: "assistant", content: `⚠️ ${d.error}`, error: true }]);
      else setMsgs((p) => [...p, { role: "assistant", content: d.answer, trace: d.trace, pending: d.pending_action, usage: d.usage }]);
    } catch (e) {
      setMsgs((p) => [...p, { role: "assistant", content: `⚠️ Errore di rete: ${e?.message || e}`, error: true }]);
    } finally { setLoading(false); }
  };

  const confirmAction = async (idx, action) => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: meId, action }),
      });
      const d = await res.json();
      setMsgs((p) => p.map((m, i) => (i === idx ? { ...m, pending: null, done: d.error ? `⚠️ ${d.error}` : `✅ ${d.result}` } : m)));
    } finally { setLoading(false); }
  };
  const cancelAction = (idx) =>
    setMsgs((p) => p.map((m, i) => (i === idx ? { ...m, pending: null, done: "Azione annullata." } : m)));

  return (
    <div className="-m-4 sm:-m-6 md:-m-8 h-[calc(100dvh-4rem)] flex flex-col bg-[#0b0d14]">
      <div className="flex items-center gap-3 px-5 h-14 border-b border-white/5 shrink-0">
        <span className="w-9 h-9 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-indigo-300" />
        </span>
        <div>
          <p className="text-sm font-semibold text-white">Assistente CRM</p>
          <p className="text-xs text-slate-500">Interroga i dati del CRM in linguaggio naturale</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <div className="max-w-2xl mx-auto text-center mt-10">
            <Sparkles className="w-10 h-10 text-indigo-400/50 mx-auto mb-3" />
            <p className="text-slate-400 mb-5">Chiedimi qualcosa sui dati del CRM.</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto space-y-3">
          {msgs.map((m, idx) => (
            <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
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
                {m.usage && (
                  <p className="mt-1.5 text-[10px] text-slate-600">
                    {m.usage.ms} ms · ${m.usage.costUsd?.toFixed(4)}
                  </p>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white/5 border border-white/5 rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                <span className="text-sm text-slate-400">Sto consultando il CRM…</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/5 px-4 py-3 shrink-0">
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
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" multiple hidden
              accept=".pdf,.csv,.txt,.md,.json,.xml,.log,.tsv,.eml,.xlsx,.xls,.xlsm,.ods,text/*"
              onChange={(e) => { aggiungiFile(e.target.files); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()} disabled={loading || leggendo}
              title="Allega un documento: PDF, Excel, CSV o testo. Il file resta nel CRM: all'assistente arriva solo il testo."
              className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-40">
              <Paperclip className="w-5 h-5" />
            </button>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
              onPaste={(e) => { const f = Array.from(e.clipboardData?.files || []); if (f.length) { e.preventDefault(); aggiungiFile(f); } }}
              placeholder="Chiedi qualcosa sui dati del CRM…" className="glass-input flex-1 resize-none max-h-32 py-2.5" />
            <button onClick={() => ask()} disabled={loading || leggendo || (!input.trim() && !allegati.some((a) => a.testo))}
              className="p-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40">
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
