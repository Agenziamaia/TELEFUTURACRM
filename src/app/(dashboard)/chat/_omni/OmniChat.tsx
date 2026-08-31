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

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { WhatsAppInbox } from "@/components/WhatsAppInbox";
import { Lucchetto, useCodiceCanale } from "@/components/CanaleProtetto";
import { EmailInbox } from "@/components/EmailInbox";
import { NewChatModal } from "../_components/NewChatModal";
import { ListaOmni } from "./ListaOmni";
import { RadarOmni } from "./RadarOmni";
import { ThreadAltrui } from "./ThreadAltrui";
import type { ChatOmni } from "./tipi";

export function OmniChat({ thread, apriInterna, meId, ricaricaInterna }: {
    thread?: ReactNode;                                   // il thread della chat interna, dalla pagina Chat
    apriInterna?: (id: string | null) => void;            // quale conversazione interna deve aprire
    meId?: string | null;                                 // per avviare una chat interna da qui
    ricaricaInterna?: () => void;                         // ricarica l'inbox della pagina (nuova chat creata qui)
}) {
    const [attiva, setAttiva] = useState<ChatOmni | null>(null);
    /* IL CODICE VALE ANCHE QUI (rilievo del revisore 27/08): l'Omnichat
       montava l'inbox WhatsApp diretta, quindi chi deve digitare il codice
       leggeva le stesse conversazioni passando da qui. Lo sblocco sta a
       livello di Omnichat e non della singola conversazione: cambiando chat
       il codice non si richiede ogni volta, ma uscendo dalla scheda sì. */
    const codiceWa = useCodiceCanale("whatsapp");
    const [waAperto, setWaAperto] = useState(false);
    /* E LO STESSO PER LA POSTA (31/08). Due lucchetti distinti: si apre quello
       che serve, l'altro resta chiuso. */
    const codiceMail = useCodiceCanale("email");
    const [mailAperta, setMailAperta] = useState(false);
    /* ⚠️ ANCHE LA LISTA (rilievo mio, stesso giorno): il lucchetto copriva la
       colonna centrale, ma a sinistra restavano mittente e anteprima — si
       leggeva di cosa si parla senza digitare niente. Un canale ancora chiuso
       sparisce dalla lista e dal contatore dei non letti. */
    const chiusi = useMemo(() => new Set<string>([
        ...(codiceWa.loaded && codiceWa.serve && !waAperto ? ["wa"] : []),
        ...(codiceMail.loaded && codiceMail.serve && !mailAperta ? ["email"] : []),
    ]), [codiceWa.loaded, codiceWa.serve, waAperto, codiceMail.loaded, codiceMail.serve, mailAperta]);
    // la risposta suggerita dall'AI: si passa all'inbox come testo iniziale
    const [bozza, setBozza] = useState<string | null>(null);
    // «➕ NUOVA CONVERSAZIONE» (Luca 27/08): scegli il canale e parti da qui —
    // interna col modale della pagina Chat, WA col numero libero, email col
    // compose della casella. Niente di nuovo sotto: si riusano i tre attrezzi.
    const [nuovaScelta, setNuovaScelta] = useState(false);
    const [nuovaCanale, setNuovaCanale] = useState<null | "wa" | "email" | "interna">(null);
    // il TICK rimonta l'inbox a ogni scelta: senza, «➕ → WhatsApp → chiudi
    // il modale → ➕ → WhatsApp» non riapriva niente (revisore 27/08)
    const [nuovaTick, setNuovaTick] = useState(0);

    // Scegliendo una chat interna si dice alla pagina QUALE aprire: è lei che
    // tiene messaggi, sottoscrizioni e bozze, e va avvisata come se avessi
    // cliccato nella sua lista. Si fa QUI, sul clic, e non in un effetto
    // legato all'id: chiudendo il thread (il «torna indietro» del telefono)
    // l'id non cambia, e con l'effetto la stessa riga non si riapriva più.
    const scegli = useCallback((c: ChatOmni) => {
        setAttiva(c);
        setBozza(null);
        setNuovaCanale(null);
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
                <ListaOmni attivaId={attiva?.id || null} onScegli={scegli} onNuova={() => setNuovaScelta(true)} chiusi={chiusi} />
            </aside>

            {/* ── CENTRO: l'inbox vera, senza la sua lista ── */}
            <section className="flex-1 min-w-0 overflow-hidden">
                {!attiva && nuovaCanale === "wa" && (
                    /* ⚠️ anche da qui (rilievo 31/08): «➕ Nuova conversazione →
                       WhatsApp» montava l'inbox senza chiedere niente, ed era
                       proprio lo scenario del pc lasciato aperto. */
                    codiceWa.loaded && codiceWa.serve && !waAperto
                        ? <Lucchetto userId={codiceWa.userId} canale="whatsapp" onApri={() => setWaAperto(true)} />
                        : <WhatsAppInbox key={`nuova-wa-${nuovaTick}`} embedded senzaLista apriNuovaChat />
                )}
                {!attiva && nuovaCanale === "email" && (
                    codiceMail.loaded && codiceMail.serve && !mailAperta
                        ? <Lucchetto userId={codiceMail.userId} canale="email" onApri={() => setMailAperta(true)} />
                        : <EmailInbox key={`nuova-email-${nuovaTick}`} embedded senzaLista apriComponi />
                )}
                {!attiva && !nuovaCanale && (
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
                    codiceWa.loaded && codiceWa.serve && !waAperto
                        ? <Lucchetto userId={codiceWa.userId} canale="whatsapp" onApri={() => setWaAperto(true)} />
                        : <WhatsAppInbox key={attiva.id} embedded senzaLista apriConvId={idNudo} testoIniziale={bozza} />
                )}
                {attiva?.canale === "email" && (
                    codiceMail.loaded && codiceMail.serve && !mailAperta
                        ? <Lucchetto userId={codiceMail.userId} canale="email" onApri={() => setMailAperta(true)} />
                        : <EmailInbox key={attiva.id} embedded senzaLista apriConvId={idNudo} />
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

            {/* ── ➕ NUOVA CONVERSAZIONE: prima il canale, poi l'attrezzo giusto ── */}
            {nuovaScelta && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setNuovaScelta(false)}>
                    <div className="glass-card border-white/10 p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
                        <div className="text-sm font-black text-white">➕ Nuova conversazione</div>
                        <div className="text-[11px] text-slate-500 -mt-1.5">Dove vuoi avviarla?</div>
                        <div className="grid gap-2">
                            <button type="button" disabled={!meId}
                                onClick={() => { setNuovaScelta(false); setNuovaCanale("interna"); }}
                                className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-3 text-left hover:bg-indigo-500/15 hover:border-indigo-500/40 transition-colors disabled:opacity-40">
                                <span className="text-xl">💬</span>
                                <span className="min-w-0">
                                    <span className="block text-xs font-bold text-white">Chat interna</span>
                                    <span className="block text-[10px] text-slate-500">un collega, un gruppo o un annuncio</span>
                                </span>
                            </button>
                            <button type="button"
                                onClick={() => { setNuovaScelta(false); setAttiva(null); setNuovaCanale("wa"); setNuovaTick((t) => t + 1); }}
                                className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-3 text-left hover:bg-emerald-500/15 hover:border-emerald-500/40 transition-colors">
                                <span className="text-xl">🟢</span>
                                <span className="min-w-0">
                                    <span className="block text-xs font-bold text-white">WhatsApp</span>
                                    <span className="block text-[10px] text-slate-500">a un numero, anche mai sentito prima</span>
                                </span>
                            </button>
                            <button type="button"
                                onClick={() => { setNuovaScelta(false); setAttiva(null); setNuovaCanale("email"); setNuovaTick((t) => t + 1); }}
                                className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-3 text-left hover:bg-sky-500/15 hover:border-sky-500/40 transition-colors">
                                <span className="text-xl">✉️</span>
                                <span className="min-w-0">
                                    <span className="block text-xs font-bold text-white">Email</span>
                                    <span className="block text-[10px] text-slate-500">scrivi dalla casella del team</span>
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {nuovaCanale === "interna" && meId && (
                <NewChatModal meId={meId} onClose={() => setNuovaCanale(null)}
                    onBroadcastDone={() => { setNuovaCanale(null); ricaricaInterna?.(); }}
                    onCreated={(id) => {
                        setNuovaCanale(null);
                        // la pagina prepara il thread vero e ricarica la sua inbox
                        // (senza, col realtime giù il centro restava vuoto)
                        ricaricaInterna?.();
                        apriInterna?.(id);
                        setAttiva({
                            id: `in:${id}`, canale: "interna", nome: "", sottotitolo: null,
                            anteprima: "", ora: "", daLeggere: false, iniziali: "",
                            clientId: null, riferimento: null, utenteId: null, aggiornata: null,
                        });
                    }} />
            )}
        </div>
    );
}
