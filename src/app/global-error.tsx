"use client";

/* ═══ LA RETE ALLA RADICE ══════════════════════════════════════════════════
   `(dashboard)/error.tsx` prende gli errori delle PAGINE, e dice qualcosa di
   utile. Ma non prende quelli del layout, dei provider e dell'idratazione:
   quelli scavalcano la rete e arrivano a Next, che stampa una riga sola —
   «Application error: a client-side exception has occurred» — e basta.

   Luca, 31/08, sulla pagina Ferie: quella riga. Che non dice il file, non dice
   la funzione, non dice niente: da fuori si può solo tirare a indovinare, e
   indovinare su un CRM aperto in quindici negozi non è un metodo.

   Da qui in avanti anche la radice ha una schermata, e la schermata DICE cosa
   è successo — messaggio, tipo, codice e le prime righe della pila — con un
   pulsante che copia tutto. Un errore che si legge si chiude in dieci minuti;
   uno che non si legge costa una serata.                                    */

import { useEffect, useState } from "react";

/* GLI ERRORI CHE NON SONO ERRORI: un pezzo di JavaScript che non si carica.
   Ogni build rinomina i suoi file, e per i pochi secondi in cui il server si
   riavvia una scheda già aperta ne chiede uno e non lo trova. Non è un difetto
   del CRM: è il CRM che sta cambiando versione sotto i piedi di chi lo usa.
   Mostrarglielo come un guasto — con la pila di chiamate e il pulsante «copia
   il dettaglio» — è sbagliato due volte: non è colpa sua e non c'è niente da
   mandare a nessuno. (Luca 01/09: l'ha visto premendo Giacenze durante un
   deploy; la stessa rete c'era già in `(dashboard)/error.tsx`, ma qui alla
   radice non era mai arrivata.) */
const DA_DEPLOY = /Loading chunk|ChunkLoadError|dynamically imported module|Importing a module script failed|Failed to fetch|Failed to load chunk/i;

export default function ErroreRadice({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const [copiato, setCopiato] = useState(false);
    const [ricarico, setRicarico] = useState(false);

    /* TRE TENTATIVI DISTANZIATI, poi ci si arrende e si mostra il pannello.
       Il primo subito, gli altri dopo qualche secondo: se la richiesta è caduta
       perché il server stava riavviando, riprovare all'istante fallisce di
       nuovo. Il conto sta in `sessionStorage` e si azzera da solo quando la
       pagina sopravvive: senza tetto sarebbe un ciclo infinito su uno schermo
       da negozio. */
    useEffect(() => {
        if (!DA_DEPLOY.test(`${error?.message || ""} ${error?.name || ""}`)) return;
        const ATTESE = [0, 2500, 6000];
        let n = 0;
        try {
            n = Number(sessionStorage.getItem("crm_reload_deploy") || "0");
            if (n >= ATTESE.length) return;
            sessionStorage.setItem("crm_reload_deploy", String(n + 1));
        } catch { return; }
        setRicarico(true);
        if (ATTESE[n]) setTimeout(() => location.reload(), ATTESE[n]);
        else location.reload();
    }, [error]);

    useEffect(() => {
        const t = setTimeout(() => { try { sessionStorage.removeItem("crm_reload_deploy"); } catch { } }, 20000);
        return () => clearTimeout(t);
    }, []);
    const testo = [
        `messaggio: ${error?.message || "(nessuno)"}`,
        `tipo: ${error?.name || "Error"}`,
        error?.digest ? `codice: ${error.digest}` : "",
        `pagina: ${typeof location !== "undefined" ? location.pathname + location.search : "?"}`,
        `versione: ${typeof document !== "undefined" ? (document.querySelector('meta[name="tf-build-check"]') as HTMLMetaElement | null)?.content || "?" : "?"}`,
        "",
        String(error?.stack || "").split("\n").slice(0, 12).join("\n"),
    ].filter(Boolean).join("\n");


    if (ricarico) return (

        <html lang="it"><body style={{ background: "#0b1020", color: "#94a3b8", fontFamily: "system-ui, sans-serif" }}>

            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>

                È uscita una versione nuova: ricarico…

            </div>

        </body></html>

    );


    return (
        <html lang="it">
            <body style={{ margin: 0, background: "#0f111a", color: "#e2e8f0", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}>
                <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                    <div style={{ maxWidth: 620, width: "100%" }}>
                        <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
                        <h1 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 8px" }}>Il CRM non è riuscito ad aprire questa pagina</h1>
                        <p style={{ fontSize: 13, lineHeight: 1.6, color: "#94a3b8", margin: "0 0 16px" }}>
                            Ricarica: quasi sempre basta, soprattutto se è appena uscita una versione nuova.
                            Se torna, <b style={{ color: "#cbd5e1" }}>copia il riquadro qui sotto e mandamelo</b>: dentro c&apos;è
                            il punto esatto in cui si è rotto.
                        </p>
                        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                            <button onClick={() => reset()} style={{ padding: "9px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700, border: "1px solid rgba(99,102,241,.4)", background: "rgba(99,102,241,.12)", color: "#c7d2fe", cursor: "pointer" }}>Riprova</button>
                            <button onClick={() => location.reload()} style={{ padding: "9px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: "#cbd5e1", cursor: "pointer" }}>Ricarica la pagina</button>
                            <button onClick={() => { navigator.clipboard?.writeText(testo).then(() => setCopiato(true), () => setCopiato(false)); }}
                                style={{ padding: "9px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700, border: "1px solid rgba(16,185,129,.4)", background: "rgba(16,185,129,.12)", color: "#a7f3d0", cursor: "pointer" }}>
                                {copiato ? "✓ Copiato" : "Copia il dettaglio"}
                            </button>
                        </div>
                        <pre style={{ fontSize: 11, lineHeight: 1.5, color: "#94a3b8", background: "rgba(0,0,0,.45)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 12, overflowX: "auto", whiteSpace: "pre-wrap", margin: 0 }}>{testo}</pre>
                    </div>
                </div>
            </body>
        </html>
    );
}
