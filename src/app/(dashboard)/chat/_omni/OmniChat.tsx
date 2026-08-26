"use client";

/* ═══ OMNICHAT — la quarta scheda della Chat ══════════════════════════════
   «Quella che unisce le tre schede e utilizza l'AI per fare il recap e
   l'analisi della chat, oltre a dare suggerimenti su risposte e soluzioni,
   più tutti i dati del cliente» (Luca, 26/08).

   La regola che tiene in piedi tutto: NON si riscrive niente di quello che
   già funziona. La colonna centrale è la VERA inbox — WhatsAppInbox o
   EmailInbox — montata `senzaLista`, quindi con tutte le sue funzioni:
   scrittura, allegati, modifica ed elimina messaggio, nuova chat a un numero
   libero, cartelle e caselle della posta. L'Omnichat aggiunge due colonne:
   la lista fusa a sinistra e la spalla del radar a destra.

   Per la chat interna la conversazione vive dentro la pagina Chat (non è un
   componente a sé): finché non è estratta, l'Omnichat porta lì con un clic
   invece di rifarne una copia povera — è la stessa scelta di non riscrivere.
*/

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { WhatsAppInbox } from "@/components/WhatsAppInbox";
import { EmailInbox } from "@/components/EmailInbox";
import { ListaOmni } from "./ListaOmni";
import { RadarOmni } from "./RadarOmni";
import type { ChatOmni } from "./tipi";

export function OmniChat() {
    const router = useRouter();
    const [attiva, setAttiva] = useState<ChatOmni | null>(null);
    // la risposta suggerita dall'AI: si passa all'inbox come testo iniziale
    const [bozza, setBozza] = useState<string | null>(null);

    const scegli = useCallback((c: ChatOmni) => {
        setAttiva(c);
        setBozza(null);
    }, []);

    const idNudo = attiva ? attiva.id.split(":")[1] : null;

    return (
        <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* ── SINISTRA: la lista fusa ── */}
            <aside className="w-full sm:w-80 lg:w-[340px] shrink-0 border-r border-white/5 bg-[#0f111a]/60">
                <ListaOmni attivaId={attiva?.id || null} onScegli={scegli} />
            </aside>

            {/* ── CENTRO: l'inbox vera, senza la sua lista ── */}
            <section className="flex-1 min-w-0 overflow-hidden">
                {!attiva && (
                    <div className="h-full flex items-center justify-center p-8 text-center">
                        <div>
                            <div className="text-3xl mb-2">✨</div>
                            <p className="text-sm text-slate-400 font-semibold mb-1">Omnichat</p>
                            <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
                                WhatsApp, email e chat interna in una lista sola.<br />
                                Apri una conversazione: a destra trovi il recap dell&apos;AI e chi hai davanti.
                            </p>
                        </div>
                    </div>
                )}
                {attiva?.canale === "wa" && (
                    <WhatsAppInbox key={attiva.id} embedded senzaLista apriConvId={idNudo} testoIniziale={bozza} />
                )}
                {attiva?.canale === "email" && (
                    <EmailInbox key={attiva.id} embedded senzaLista apriConvId={idNudo} />
                )}
                {attiva?.canale === "interna" && (
                    <div className="h-full flex items-center justify-center p-8 text-center">
                        <div>
                            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-2xl mx-auto mb-3">💬</div>
                            <p className="text-sm font-semibold text-white mb-1">{attiva.nome}</p>
                            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mb-4">
                                La chat interna vive nella sua scheda, con tutte le sue funzioni —
                                reazioni, risposte, allegati, inoltro multiplo.
                            </p>
                            <button onClick={() => router.push("/chat")}
                                className="text-xs font-bold px-3 py-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20">
                                Aprila in Chat interna →
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {/* ── DESTRA: il radar, che è il motivo per cui l'Omnichat esiste ── */}
            <aside className="hidden xl:block w-[340px] shrink-0 border-l border-white/5 bg-[#0f111a]/60">
                <RadarOmni chat={attiva} onUsaRisposta={(t) => setBozza(t)} />
            </aside>
        </div>
    );
}
