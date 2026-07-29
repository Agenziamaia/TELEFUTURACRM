"use client";

/* TEMA CHIARO/SCURO (Luca 29/07) — interruttore ☀️/🌙 in alto a destra.
   Il tema vive su <html class="light"> + localStorage crm_theme; il layout
   root ha uno script inline che lo applica PRIMA del primo paint (niente
   lampo scuro→chiaro). Tutto il ridisegno chiaro sta in globals.css. */

import { useEffect, useState } from "react";

export type Tema = "scuro" | "chiaro";

export function applicaTema(t: Tema) {
    try { document.documentElement.classList.toggle("light", t === "chiaro"); } catch { }
}

export function useTema(): [Tema, () => void] {
    const [tema, setTema] = useState<Tema>("scuro");
    useEffect(() => {
        try {
            const t: Tema = localStorage.getItem("crm_theme") === "chiaro" ? "chiaro" : "scuro";
            setTema(t); applicaTema(t);
        } catch { }
    }, []);
    const cambia = () => {
        const n: Tema = tema === "scuro" ? "chiaro" : "scuro";
        setTema(n); applicaTema(n);
        try { localStorage.setItem("crm_theme", n); } catch { }
    };
    return [tema, cambia];
}
