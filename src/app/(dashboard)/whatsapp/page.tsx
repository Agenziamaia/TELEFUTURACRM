"use client";

// La UI WhatsApp vive ora in un componente riusabile: qui e' a pagina intera
// (accesso diretto via URL), dentro la Chat e' incorporata con un interruttore.
import { WhatsAppInbox } from "@/components/WhatsAppInbox";

export default function WhatsAppPage() {
    return <WhatsAppInbox />;
}
