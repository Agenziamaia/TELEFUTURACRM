"use client";

import { useEffect, useState } from "react";

// Toast minimale a livello di modulo: notify() da qualsiasi punto, <ToastHost/> montato una volta.
type Toast = { id: number; msg: string; kind: "error" | "ok" };
const listeners = new Set<(t: Toast) => void>();
let seq = 1;

export function notify(msg: string, kind: "error" | "ok" = "error") {
    const t = { id: seq++, msg, kind };
    listeners.forEach((l) => l(t));
}

// Ritorna true se c'era un errore (e lo mostra). Uso: if (dbError("Salvataggio", error)) return;
export function dbError(ctx: string, error: { message?: string } | null): boolean {
    if (!error) return false;
    notify(`${ctx}: ${error.message || "errore sconosciuto"}`);
    return true;
}

export function ToastHost() {
    const [toasts, setToasts] = useState<Toast[]>([]);
    useEffect(() => {
        const on = (t: Toast) => {
            setToasts((p) => [...p, t]);
            setTimeout(() => setToasts((p) => p.filter((x) => x.id !== t.id)), t.kind === "error" ? 6000 : 2500);
        };
        listeners.add(on);
        return () => {
            listeners.delete(on);
        };
    }, []);
    if (!toasts.length) return null;
    return (
        <div className="fixed bottom-4 right-4 z-[200] space-y-2 max-w-sm">
            {toasts.map((t) => (
                <div
                    key={t.id}
                    className={`px-4 py-2.5 rounded-xl text-sm shadow-lg border backdrop-blur ${
                        t.kind === "error"
                            ? "bg-rose-950/90 border-rose-500/40 text-rose-200"
                            : "bg-emerald-950/90 border-emerald-500/40 text-emerald-200"
                    }`}
                >
                    {t.msg}
                </div>
            ))}
        </div>
    );
}
