"use client";

// CHAT OMNICANALE — la sezione a tre colonne: lista fusa dei canali (WhatsApp,
// email, chat interna), conversazione, e il radar che dice chi hai davanti.
//
// ✅ APERTA A TUTTI dal 26/08/2026 (Luca: «non possiamo mandarla online
// direttamente?»). Prima era chiusa perché leggeva le conversazioni SENZA
// perimetro: adesso `caricaConversazioni` filtra numeri e caselle con
// `waIstanzeVisibili` e `emailCaselleVisibili` — LE STESSE funzioni che usano
// le due inbox vere, non copie. Su quelle tabelle non c'è RLS, quindi il
// filtro applicativo è l'unica cosa che separa un consulente dalla posta di
// amministrazione@: chi tocca quelle due funzioni tocca tutte le schermate.
//
// Vive su una rotta sua e non al posto di /chat: quella è la schermata che i
// negozi usano tutto il giorno, e si sostituisce quando questa avrà anche
// ricerca, allegati e tempo reale — non prima.

import { ModuloChatOmni } from "../_omni/ModuloChatOmni";

export default function PaginaChatOmni() {
    return <ModuloChatOmni />;
}
