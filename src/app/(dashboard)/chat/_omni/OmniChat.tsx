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

   Anche la chat interna si legge e si scrive QUI (Luca 27/08: «l'omnichat
   deve esistere per fare tutto lì dentro, perché mi sta riportando in
   giro?»): la pagina Chat passa il suo thread — quello vero, con reazioni,
   allegati, modifica e inoltro — e l'Omnichat lo monta al centro. Stesso
   componente, stesso stato: nessuna copia da tenere allineata.
*/

import { useCallback, useState, type ReactNode } from "react";
import { WhatsAppInbox } from "@/components/WhatsAppInbox";
import { EmailInbox } from "@/components/EmailInbox";
import { ListaOmni } from "./ListaOmni";
import { RadarOmni } from "./RadarOmni";
import { ThreadAltrui } from "./ThreadAltrui";
import type { ChatOmni } from "./tipi";

export function OmniChat({ thread, apriInterna }: {
    thread?: ReactNode;                                   // il thread della chat interna, dalla pagina Chat
    apriInterna?: (id: string | null) => void;            // quale conversazione interna deve aprire
}) {
    const [attiva, setAttiva] = useState<ChatOmni | null>(null);
    // la risposta suggerita dall'AI: si passa all'inbox come testo iniziale
    const [bozza, setBozza] = useState<string | null>(null);

    // Scegliendo una chat interna si dice alla pagina QUALE aprire: è lei che
    // tiene messaggi, sottoscrizioni e bozze, e va avvisata come se avessi
    // cliccato nella sua lista. Si fa QUI, sul clic, e non in un effetto
    // legato all'id: chiudendo il thread (il «torna indietro» del telefono)
    // l'id non cambia, e con l'effetto la stessa riga non si riapriva più.
    const scegli = useCallback((c: ChatOmni) => {
        setAttiva(c);
        setBozza(null);
        if (!apriInterna) return;
        // le chat ALTRUI non si passano alla pagina: lei sa mostrare solo le
        // conversazioni a cui partecipo io, e resterebbe sul vuoto
        if (c.canale === "interna" && !c.altrui) apriInterna(c.id.split(":")[1]);
        // passando a un altro canale NON si azzera: quella conversazione resta
        // aperta nella scheda «Chat interna», dov'era, e qui non si vede
    }, [apriInterna]);

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
                {attiva?.canale === "interna" && attiva.altrui && (
                    // chat di un collega: si legge, non si risponde
                    <ThreadAltrui chat={attiva} diChi={attiva.proprietarioNome || attiva.perChi || null} />
                )}
                {attiva?.canale === "interna" && !attiva.altrui && (
                    // il thread VERO della chat interna, montato qui dentro
                    <div className="h-full flex overflow-hidden">
                        {thread || (
                            <div className="h-full w-full flex items-center justify-center p-8 text-center text-xs text-slate-500">
                                Questa conversazione si apre nella scheda «Chat interna».
                            </div>
                        )}
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
