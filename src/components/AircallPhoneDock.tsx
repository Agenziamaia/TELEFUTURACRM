"use client";

/**
 * SOFTPHONE AIRCALL DENTRO IL CRM (SDK "Aircall Everywhere", handout Fase 2).
 * Bottone ☎ fisso in basso a destra: apre il telefono vero e proprio (login
 * Aircall UNA volta, poi resta collegato). I bottoni 📞 sparsi nel CRM
 * compongono direttamente qui; se il pannello non è ancora collegato si usa il
 * fallback API (il numero arriva sull'app Aircall del caller).
 * Visibile all'area call center e ad admin/dev.
 */

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { areaOf } from "@/lib/roles";
import { registraTelefono } from "@/lib/dialer";

export function AircallPhoneDock() {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [avviato, setAvviato] = useState(false);
    const [connesso, setConnesso] = useState(false);
    const [errore, setErrore] = useState("");
    const phoneRef = useRef<{ send: (e: string, p?: unknown, cb?: (ok: boolean, d?: unknown) => void) => void } | null>(null);

    const visibile = !!user && (areaOf(user.role) === "cc" || ["admin", "dev"].includes(user.role));

    // il telefono si carica alla PRIMA apertura e poi resta montato (nascosto):
    // così il login Aircall sopravvive tra un'apertura e l'altra.
    useEffect(() => {
        if (!open || avviato) return;
        setAvviato(true);
        (async () => {
            try {
                // v2 del pacchetto: l'opzione si chiama domToLoadWorkspace (il vecchio
                // domToLoadPhone veniva ignorato -> iframe mai creato, pannello nero).
                const mod = await import("aircall-everywhere");
                const AircallWorkspace = mod.default;
                const phone = new AircallWorkspace({
                    domToLoadWorkspace: "#aircall-phone-container",
                    onLogin: () => setConnesso(true),
                    onLogout: () => setConnesso(false),
                });
                phoneRef.current = phone;
                registraTelefono((numero, cb) => phone.send("dial_number", { phone_number: numero }, cb));
                setErrore("");
            } catch (e) {
                setErrore(e instanceof Error ? e.message : "Telefono non caricato");
            }
        })();
    }, [open, avviato]);

    if (!visibile) return null;
    return (
        <>
            <button
                onClick={() => setOpen(!open)}
                title={open ? "Chiudi il telefono" : "Apri il telefono Aircall"}
                className={`fixed bottom-5 right-5 z-[900] w-13 h-13 p-3.5 rounded-full shadow-2xl border transition-all ${open ? "bg-rose-500/90 border-rose-400 text-white" : connesso ? "bg-emerald-500/90 border-emerald-400 text-white" : "bg-indigo-600 border-indigo-400 text-white hover:scale-105"}`}
            >
                <span className="text-xl leading-none">{open ? "✕" : "☎"}</span>
            </button>
            {/* pannello sempre montato dopo il primo avvio: si nasconde, non si smonta */}
            <div
                className={`fixed bottom-20 right-5 z-[900] rounded-2xl overflow-hidden border border-white/15 shadow-2xl bg-[#0f1420] ${open ? "" : "hidden"}`}
                style={{ width: 376, height: 620 }}
            >
                <div className="h-9 px-3 flex items-center justify-between bg-white/[0.04] border-b border-white/10">
                    <span className="text-xs font-bold text-slate-300">☎ Telefono Aircall {connesso ? "· connesso" : "· accedi con le tue credenziali Aircall"}</span>
                    <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
                </div>
                {errore && (
                    <div className="p-4 text-xs text-rose-300 space-y-2">
                        <p>Telefono non caricato: {errore}</p>
                        <button onClick={() => window.open("https://phone.aircall.io", "aircall", "width=420,height=680")}
                            className="px-3 py-1.5 rounded-lg border border-white/15 text-slate-200 hover:bg-white/10 font-bold">
                            Apri il telefono in una finestra →
                        </button>
                    </div>
                )}
                <div id="aircall-phone-container" style={{ width: "100%", height: "calc(100% - 36px)" }} />
            </div>
        </>
    );
}
