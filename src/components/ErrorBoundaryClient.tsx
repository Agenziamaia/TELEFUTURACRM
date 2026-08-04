"use client";

/* PARACADUTE DI SEZIONE (Luca 03/08) — un Error Boundary riutilizzabile: se
   una pagina va in crash durante il render, invece della schermata bianca
   "Application error" mostra un riquadro leggibile con il messaggio d'errore
   e un pulsante Ricarica. L'errore finisce anche in console con il tag
   [CRASH:<nome>] cosi' è facile trovarlo. Pensato per avvolgere le pagine
   pesanti (Registra Vendita in primis) senza cambiarne il codice interno. */

import React from "react";

type Props = { nome: string; children: React.ReactNode };
type State = { errore: Error | null };

export class ErrorBoundaryClient extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { errore: null };
    }
    static getDerivedStateFromError(errore: Error): State {
        return { errore };
    }
    componentDidCatch(errore: Error, info: React.ErrorInfo) {
        // tag cercabile in console (e nei log del browser dei negozi)
        // eslint-disable-next-line no-console
        console.error(`[CRASH:${this.props.nome}]`, errore, info?.componentStack);
    }
    render() {
        const { errore } = this.state;
        if (!errore) return this.props.children;
        return (
            <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                <div style={{ maxWidth: 620, width: "100%", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 16, padding: "26px 28px" }}>
                    <div style={{ fontSize: 34, marginBottom: 8 }}>⚠️</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "var(--tf-f8fafc)", marginBottom: 6 }}>
                        Qualcosa è andato storto in “{this.props.nome}”
                    </div>
                    <div style={{ fontSize: 13, color: "var(--tf-94a3b8)", marginBottom: 14, lineHeight: 1.5 }}>
                        La pagina ha avuto un errore ma il resto del CRM funziona. Riprova a ricaricare;
                        se continua, manda questo messaggio all&apos;assistenza:
                    </div>
                    <pre style={{ fontSize: 12, color: "var(--tf-fca5a5)", background: "rgba(0,0,0,0.35)", border: "1px solid var(--tf-w80)", borderRadius: 10, padding: "12px 14px", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflow: "auto", margin: 0 }}>
                        {String(errore?.message || errore)}
                    </pre>
                    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                        <button type="button" onClick={() => { try { location.reload(); } catch { /* no-op */ } }}
                            style={{ padding: "11px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                            ↻ Ricarica la pagina
                        </button>
                        <button type="button" onClick={() => this.setState({ errore: null })}
                            style={{ padding: "11px 20px", borderRadius: 10, border: "1px solid var(--tf-w150)", background: "var(--tf-w40)", color: "var(--tf-cbd5e1)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                            Riprova
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
