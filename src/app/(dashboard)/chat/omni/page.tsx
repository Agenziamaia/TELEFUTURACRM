"use client";

// CHAT OMNICANALE (beta) — la nuova sezione a tre colonne: lista fusa dei
// canali, conversazione, radar del contatto.
//
// Vive su una ROTTA SUA e non dentro /chat apposta: la chat esistente è
// quella che il negozio usa tutto il giorno, e questa è ancora in
// costruzione (l'invio non è agganciato). Così si possono guardare fianco a
// fianco senza rischiare niente, e quando sarà pronta prende il posto
// dell'altra invece di essere stata montata sopra mentre si lavorava.

import { ModuloChatOmni } from "../_omni/ModuloChatOmni";

export default function PaginaChatOmni() {
    return <ModuloChatOmni />;
}
