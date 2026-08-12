"use client";

import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { ChatToaster } from "@/components/ChatToaster";
import { VerificaSpettro } from "@/components/VerificaSpettro";
import { AircallPhoneDock } from "@/components/AircallPhoneDock";
import { PageBackProvider } from "@/context/PageBackContext";
import { PresenceProvider } from "@/context/PresenceContext";
import { useState, useEffect } from "react";
import { cn } from "@/utils";

// This layout will wrap all authenticated routes (dashboard, pda, documenti, ecc)
export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    // menù a scomparsa (pin nella sidebar): preferenza ricordata sul dispositivo.
    // DEFAULT INVERTITO (Luca 04/08): chiave assente = auto-nascosto; "0" = chi
    // in passato l'ha bloccato aperto col pin conserva la sua scelta. Niente
    // initializer lazy da localStorage: creerebbe mismatch di idratazione.
    const [autoHide, setAutoHide] = useState(true);
    useEffect(() => { try { setAutoHide(localStorage.getItem("crm_menu_autohide") !== "0"); } catch { } }, []);
    const cambiaAutoHide = (v: boolean) => { setAutoHide(v); try { localStorage.setItem("crm_menu_autohide", v ? "1" : "0"); } catch { } };
    // AUTO-RIPRISTINO dopo i deploy: se un pezzo dell'app non esiste piu' sul
    // server (chunk vecchio in un tab rimasto aperto), si ricarica UNA volta da
    // soli invece di mostrare il "codice di errore" (caso Utenti, Luca 28/07).
    useEffect(() => {
        const h = (e: ErrorEvent | PromiseRejectionEvent) => {
            const msg = String((e as ErrorEvent)?.message || ((e as PromiseRejectionEvent)?.reason as Error)?.message || "");
            if (/Loading chunk|ChunkLoadError|dynamically imported module|Importing a module script failed/i.test(msg)) {
                if (!sessionStorage.getItem("crm_chunk_reload")) {
                    sessionStorage.setItem("crm_chunk_reload", "1");
                    window.location.reload();
                }
            }
        };
        window.addEventListener("error", h);
        window.addEventListener("unhandledrejection", h);
        const ok = setTimeout(() => sessionStorage.removeItem("crm_chunk_reload"), 15000);
        return () => { window.removeEventListener("error", h); window.removeEventListener("unhandledrejection", h); clearTimeout(ok); };
    }, []);

    return (
        <PageBackProvider>
            <PresenceProvider>
                <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} autoHide={autoHide} setAutoHide={cambiaAutoHide} />
                <div className={cn("flex-1 flex flex-col min-h-screen overflow-x-hidden transition-[margin] duration-300", autoHide ? "lg:ml-0" : "lg:ml-64")}>
                    {/* col menù a scomparsa l'hamburger resta visibile anche su
                        desktop e APRE/CHIUDE la sidebar col click (Luca 04/08) */}
                    <Header onMenuClick={() => setIsSidebarOpen(v => !v)} autoHide={autoHide} />
                    <main className="flex-1 w-full min-w-0 p-4 sm:p-6 md:p-8">
                        {children}
                        <VerificaSpettro />
                    </main>
                </div>
                <ChatToaster />
                {/* TELEFONO AIRCALL GLOBALE (segnalazione 10/08 via Verifiche): stava
                    solo nella pagina caller — navigando altrove il componente si
                    smontava, l'iframe moriva e LA CHIAMATA CADEVA. Qui nel layout
                    sopravvive a ogni cambio di sezione (si gate-a da solo: area cc
                    e admin/dev). */}
                <AircallPhoneDock />
            </PresenceProvider>
        </PageBackProvider>
    );
}
