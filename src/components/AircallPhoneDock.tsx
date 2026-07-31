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
import { registraTelefono, registraApriTelefono, segnalaTelefonoConnesso } from "@/lib/dialer";

export function AircallPhoneDock() {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [avviato, setAvviato] = useState(false);
    const [connesso, setConnesso] = useState(false);
    const [errore, setErrore] = useState("");
    const phoneRef = useRef<{ send: (e: string, p?: unknown, cb?: (ok: boolean, d?: unknown) => void) => void } | null>(null);

    const visibile = !!user && (areaOf(user.role) === "cc" || ["admin", "dev"].includes(user.role));

    // il dialer puo' APRIRE il pannello da solo (fix 31/07: quando Aircall non
    // riesce ad avviare la chiamata, la via d'uscita e' il ☎ qui nel CRM)
    useEffect(() => {
        if (visibile) registraApriTelefono(() => setOpen(true));
    }, [visibile]);

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
                    onLogin: () => { setConnesso(true); segnalaTelefonoConnesso(true); },
                    onLogout: () => { setConnesso(false); segnalaTelefonoConnesso(false); },
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
            {/* AZIONE PRIMARIA della pagina (gerarchia Luca 26/07): il telefono.
                Sempre verde, ben ancorato in basso a destra; il pallino dice se
                la sessione Aircall e' connessa. */}
            <button
                onClick={() => setOpen(!open)}
                title={open ? "Chiudi il telefono" : connesso ? "Telefono Aircall — connesso" : "Apri il telefono Aircall per chiamare"}
                className={`fixed bottom-6 right-6 z-[900] w-14 h-14 rounded-full flex items-center justify-center border transition-all ring-1 ring-white/10 ${open ? "bg-rose-600/90 hover:bg-rose-500 border-rose-400/40 shadow-lg shadow-rose-900/40" : "bg-gradient-to-br from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 border-white/15 shadow-lg shadow-indigo-950/60 hover:scale-105"} text-white`}
            >
                <span className="text-2xl leading-none">{open ? "✕" : "☎"}</span>
                {!open && (
                    <span className={`absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0a0c10] ${connesso ? "bg-emerald-300 animate-pulse" : "bg-slate-500"}`} title={connesso ? "Connesso" : "Accedi al primo utilizzo"} />
                )}
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
