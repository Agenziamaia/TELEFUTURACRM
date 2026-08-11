"use client";

// VALORI ANNIDATI dei dettagli vendita resi LEGGIBILI (segnalazioni Francesco/
// Luca 10-11/08: followup e units comparivano come JSON grezzo nel Drawer del
// Tracking e in Ricerca Vendite). Un solo componente per tutti i pannelli:
//  - followup  → righe "Follow-up 1 · 📅 data · esito · note" (spariscono se vuoti)
//  - units     → righe "Modello · IMEI · € prezzo · N rate · Finanziato"
//  - altri array/oggetti → righe chiave: valore SOLO sui campi pieni
// Tollera i formati anomali (stringa JSON, oggetto a chiavi numeriche).
// Se non c'è nulla di compilato la voce NON compare (ritorna null).

type Props = {
  nome: string;
  valore: unknown;
  wrapperClassName?: string;
  labelClassName?: string;
};

const RIGA = "text-xs text-white bg-black/30 rounded-lg px-2.5 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5";
const pieno = (x: unknown) => x !== null && x !== undefined && String(x).trim() !== "";

function normalizza(valore: unknown): unknown {
  let v = valore;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { /* testo semplice */ } }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const vals = Object.values(v as Record<string, unknown>);
    if (vals.length && vals.every((x) => x && typeof x === "object")) v = vals; // jsonb a chiavi numeriche
  }
  return v;
}

function resa(nome: string, valore: unknown): { titolo: string; corpo: React.ReactNode } | null {
  const v = normalizza(valore);

  if (/^follow[\s_-]*up$/i.test(nome) && Array.isArray(v)) {
    const fu = (v as { label?: string; data?: string; esito?: string; note?: string }[])
      .filter((f) => `${f?.data || ""}${f?.esito || ""}${f?.note || ""}`.trim());
    if (!fu.length) return null;
    return {
      titolo: "Follow-up",
      corpo: (
        <div className="space-y-1">
          {fu.map((f, i) => (
            <div key={i} className={RIGA}>
              <span className="font-bold">{f.label || `Follow-up ${i + 1}`}</span>
              {pieno(f.data) && <span>📅 {f.data}</span>}
              {pieno(f.esito) && <span className="font-semibold text-emerald-300">{f.esito}</span>}
              {pieno(f.note) && <span className="text-slate-300">{f.note}</span>}
            </div>
          ))}
        </div>
      ),
    };
  }

  if (/^units?$/i.test(nome) && Array.isArray(v)) {
    const us = (v as { model?: string; imei?: string; prezzo?: number | string; rate?: number | string; finanziato?: string | boolean }[]).filter(Boolean);
    if (!us.length) return null;
    return {
      titolo: "Terminali",
      corpo: (
        <div className="space-y-1">
          {us.map((u, i) => (
            <div key={i} className={RIGA}>
              <span className="font-bold">{u.model || `Terminale ${i + 1}`}</span>
              {pieno(u.imei) && <span className="font-mono text-slate-300">IMEI {u.imei}</span>}
              {pieno(u.prezzo) && <span className="font-semibold text-emerald-300">€ {u.prezzo}</span>}
              {pieno(u.rate) && <span>{u.rate} rate</span>}
              {(u.finanziato === "si" || u.finanziato === "sì" || u.finanziato === true) && <span className="font-semibold text-amber-300">Finanziato</span>}
            </div>
          ))}
        </div>
      ),
    };
  }

  if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object")) {
    const righe = (v as Record<string, unknown>[]).map((o) => Object.entries(o).filter(([, x]) => pieno(x)));
    if (righe.every((r) => !r.length)) return null;
    return {
      titolo: nome,
      corpo: (
        <div className="space-y-1">
          {righe.map((r, i) => (
            <div key={i} className={RIGA}>
              {r.length ? r.map(([k, x]) => (
                <span key={k}><span className="text-slate-500">{k}:</span> {typeof x === "boolean" ? (x ? "Sì" : "No") : String(x)}</span>
              )) : <span className="text-slate-600">—</span>}
            </div>
          ))}
        </div>
      ),
    };
  }

  if (Array.isArray(v)) {
    const semplici = v.filter(pieno);
    if (!semplici.length) return null;
    return { titolo: nome, corpo: <div className={RIGA}>{semplici.map(String).join(" · ")}</div> };
  }

  if (v && typeof v === "object") {
    const en = Object.entries(v as Record<string, unknown>).filter(([, x]) => pieno(x));
    if (!en.length) return null;
    return {
      titolo: nome,
      corpo: (
        <div className={RIGA}>
          {en.map(([k, x]) => (
            <span key={k}><span className="text-slate-500">{k}:</span> {typeof x === "boolean" ? (x ? "Sì" : "No") : String(x)}</span>
          ))}
        </div>
      ),
    };
  }

  if (!pieno(v)) return null;
  return { titolo: nome, corpo: <div className={RIGA}>{String(v)}</div> };
}

export function VoceAnnidata({ nome, valore, wrapperClassName = "", labelClassName = "" }: Props) {
  const r = resa(nome, valore);
  if (!r) return null;
  return (
    <div className={wrapperClassName}>
      <div className={labelClassName}>{r.titolo}</div>
      <div className="mt-1">{r.corpo}</div>
    </div>
  );
}
