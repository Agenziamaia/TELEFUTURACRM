"use client";
// IL LASCIAPASSARE, LATO BROWSER (Blindatura fase B, Luca 28/08).
// Tiene in memoria il token rilasciato da /api/auth/token e lo rinnova da
// solo prima che scada. Se il server non lo rilascia (secret non ancora
// configurato, sessione assente) resta `null`: il client Supabase ripiega
// sulla chiave anonima e il CRM funziona esattamente come prima.
let _token: string | null = null;
let _scadenza = 0;                       // epoch ms
let _inCorso: Promise<string | null> | null = null;
let _spento = false;                     // il server ha detto "non attivo"

const MARGINE = 5 * 60 * 1000;           // si rinnova 5 minuti prima

export async function tokenTf(): Promise<string | null> {
    if (typeof window === "undefined") return null;   // niente SSR
    if (_spento) return null;
    if (_token && Date.now() < _scadenza - MARGINE) return _token;
    if (_inCorso) return _inCorso;
    _inCorso = (async () => {
        try {
            const r = await fetch("/api/auth/token", { credentials: "include", cache: "no-store" });
            const j = await r.json();
            if (!j?.attivo || !j?.token) {
                // "secret" = blindatura non ancora accesa: si smette di
                // chiedere per questa sessione. "sessione" = utente non
                // loggato: si riproverà al prossimo giro.
                if (j?.motivo === "secret") _spento = true;
                _token = null; _scadenza = 0;
                return null;
            }
            _token = String(j.token);
            _scadenza = Date.now() + (Number(j.scadeTra) || 3600) * 1000;
            return _token;
        } catch {
            return null;
        } finally {
            _inCorso = null;
        }
    })();
    return _inCorso;
}

/** Al logout: il lasciapassare non deve sopravvivere all'utente. */
export function azzeraTokenTf() { _token = null; _scadenza = 0; _spento = false; }
