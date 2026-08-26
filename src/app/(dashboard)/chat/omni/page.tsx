"use client";

// CHAT OMNICANALE (beta) — la nuova sezione a tre colonne: lista fusa dei
// canali, conversazione, radar del contatto.
//
// ⛔ CHIUSA A TUTTI TRANNE ADMIN/DEV, E NON PER PRUDENZA GENERICA.
// Il modulo legge `wa_conversations` e `email_conversations` SENZA il
// perimetro che le due inbox vere applicano da sempre: WhatsAppInbox filtra
// le istanze per titolare/negozio (i numeri PERSONALI li vede solo chi li ha)
// e EmailInbox fa lo stesso con le caselle. Su quelle tabelle non c'è RLS.
// Finché quel perimetro non è condiviso — estratto in un helper e usato da
// tutti e due, non copiato — aprire questa rotta significherebbe far leggere
// a un consulente le chat del cellulare personale di un collega e la posta
// di amministrazione@. È la stessa falla chiusa il 25/08: non la riapro.
//
// Vive su una rotta sua e non dentro /chat apposta: la chat esistente è
// quella che il negozio usa tutto il giorno, questa è ancora in costruzione.

import { useAuth } from "@/context/AuthContext";
import { ModuloChatOmni } from "../_omni/ModuloChatOmni";

export default function PaginaChatOmni() {
    const { user } = useAuth();
    const puo = user?.role === "admin" || user?.role === "dev";
    if (!puo) {
        return (
            <div className="p-10 max-w-xl mx-auto text-center">
                <div className="text-4xl mb-3">🚧</div>
                <h1 className="text-lg font-bold text-white mb-2">Chat Omnicanale — in costruzione</h1>
                <p className="text-sm text-slate-400 leading-relaxed">
                    La sezione è aperta solo a chi sviluppa finché non è agganciato il perimetro
                    di visibilità dei numeri e delle caselle. Nel frattempo usa <b>Chat</b>, che
                    è completa: chat interna, WhatsApp ed email.
                </p>
            </div>
        );
    }
    return <ModuloChatOmni />;
}
