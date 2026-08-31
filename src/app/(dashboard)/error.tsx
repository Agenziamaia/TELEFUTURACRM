"use client";

/* ═══ LA RETE SOTTO LE PAGINE ═════════════════════════════════════════════
   Quando una pagina del CRM esplode, finora si vedeva la schermata nuda di
   Next: «Application error: a client-side exception has occurred». Non dice
   niente, e soprattutto non dice la cosa che nel 90% dei casi è vera: la
   scheda è rimasta aperta mentre usciva un deploy nuovo.

   Ogni build rinomina i suoi pezzi e i vecchi spariscono dal server (provato:
   un chunk di un'altra build risponde 404). Una pagina aperta da prima ne
   chiede uno che non c'è più e muore — e capita per prima ad Analisi, che è
   la più pesante. In quel caso qui NON si mostra niente: si ricarica e basta,
   una volta sola.

   La difesa c'era già dentro il layout (28/07) ma non poteva bastare: se il
   pezzo che manca serve PRIMA che il layout viva, quel gestore non è ancora
   attaccato e l'errore lo prende Next. Questa invece è la rete del framework.

   Per gli errori veri resta una schermata che dice qualcosa di utile e due
   pulsanti, invece del muro grigio.                                       */

import { useEffect, useState } from "react";

const DA_DEPLOY = /Loading chunk|ChunkLoadError|dynamically imported module|Importing a module script failed|Failed to fetch/i;

export default function ErroreDashboard({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const [ricarico, setRicarico] = useState(false);

    useEffect(() => {
        const msg = `${error?.message || ""} ${error?.name || ""}`;
        if (!DA_DEPLOY.test(msg)) return;
        /* TRE TENTATIVI, NON UNO (Luca 01/09, che il muro se l'è visto).
           Il primo giro era immediato: se la richiesta cade mentre il server
           si sta riavviando — cioè per tutta la durata di un deploy — anche il
           ricaricamento arriva troppo presto, fallisce, e la seconda volta si
           mostrava il pannello. Un deploy dura qualche secondo: aspettare
           prima di riprovare copre quasi sempre la finestra.
           Il tetto resta: dopo tre volte è rotta davvero, e continuare a
           ricaricare sarebbe un ciclo infinito su uno schermo da negozio. */
        const ATTESE = [0, 2500, 6000];
        let n = 0;
        try {
            n = Number(sessionStorage.getItem("crm_reload_deploy") || "0");
            if (n >= ATTESE.length) return;
            sessionStorage.setItem("crm_reload_deploy", String(n + 1));
        } catch { return; }
        setRicarico(true);
        if (ATTESE[n]) setTimeout(() => window.location.reload(), ATTESE[n]);
        else window.location.reload();
    }, [error]);

    // il segno che il giro è andato a buon fine: se la pagina vive 20 secondi
    // senza esplodere, il permesso di ricaricare si ricarica anche lui
    useEffect(() => {
        // 20 secondi: deve coprire anche il terzo tentativo, che parte al sesto
        const t = setTimeout(() => { try { sessionStorage.removeItem("crm_reload_deploy"); } catch { } }, 20000);
        return () => clearTimeout(t);
    }, []);

    if (ricarico) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center p-8">
                <p className="text-sm text-slate-400">È uscita una versione nuova: ricarico…</p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center">
                <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-2xl mx-auto mb-4">⚠️</div>
                <h1 className="text-lg font-bold text-white mb-2">Questa pagina non è riuscita ad aprirsi</h1>
                <p className="text-sm text-slate-400 leading-relaxed mb-5">
                    Riprova: quasi sempre basta. Se torna anche dopo aver ricaricato,
                    mandami questo codice — con quello si trova il punto esatto.
                </p>
                <div className="flex items-center justify-center gap-2 mb-4">
                    <button onClick={() => reset()}
                        className="px-4 py-2 rounded-xl text-sm font-bold border border-indigo-500/40 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20">
                        Riprova
                    </button>
                    <button onClick={() => window.location.reload()}
                        className="px-4 py-2 rounded-xl text-sm font-bold border border-white/10 text-slate-300 hover:bg-white/5">
                        Ricarica la pagina
                    </button>
                </div>
                <p className="text-[11px] text-slate-600 font-mono break-all">
                    {error?.digest ? `codice ${error.digest} · ` : ""}{String(error?.message || "").slice(0, 200)}
                </p>
            </div>
        </div>
    );
}
