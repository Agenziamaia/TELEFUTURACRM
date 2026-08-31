"use client";

// La UI WhatsApp vive ora in un componente riusabile: qui e' a pagina intera
// (accesso diretto via URL), dentro la Chat e' incorporata con un interruttore.
// il lucchetto (chi ha la capability accesa deve digitare il suo codice)
// sta nel wrapper: cosi' vale ovunque si apra WhatsApp, non solo qui
import { WhatsAppProtetta } from "@/components/CanaleProtetto";

export default function WhatsAppPage() {
    return <WhatsAppProtetta />;
}
