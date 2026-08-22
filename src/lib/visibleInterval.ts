// Ottimizzazione carico (perf): come setInterval ma ATTIVO solo quando la scheda è
// VISIBILE. Quando l'utente passa a un'altra tab il polling si ferma (niente query
// DB / re-render inutili in background, moltiplicati per tutte le tab aperte); al
// rientro sulla scheda `fn` viene rieseguito SUBITO (dati freschi) e l'intervallo
// riparte. Sostituzione drop-in: `const stop = visibleInterval(fn, ms)` al posto di
// `const t = setInterval(fn, ms)`, e `stop()` al posto di `clearInterval(t)`.
// Nota: NON esegue fn al montaggio (i componenti già chiamano load()/conta() a parte);
// esegue fn solo agli scatti dell'intervallo e al ritorno-visibile.
export function visibleInterval(fn: () => void, ms: number): () => void {
    let timer: ReturnType<typeof setInterval> | null = null;
    const run = () => { try { fn(); } catch { /* best-effort */ } };
    const start = () => { if (timer == null) timer = setInterval(run, ms); };
    const stop = () => { if (timer != null) { clearInterval(timer); timer = null; } };
    const hasDoc = typeof document !== "undefined";
    const onVis = () => {
        if (!hasDoc) return;
        if (document.visibilityState === "visible") { run(); start(); }
        else stop();
    };
    if (!hasDoc || document.visibilityState === "visible") start();
    if (hasDoc) document.addEventListener("visibilitychange", onVis);
    return () => { stop(); if (hasDoc) document.removeEventListener("visibilitychange", onVis); };
}
