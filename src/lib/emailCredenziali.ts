// LE CREDENZIALI ARRIVANO PER EMAIL (Luca 31/08).
//
// Storia: all'inizio del CRM non c'era modo di spedire una email — sarebbe
// servito un servizio a pagamento — quindi la password provvisoria si
// comunicava a voce e il tasto «Reset password» la mostrava soltanto a video.
// Adesso le caselle aziendali sono collegate al CRM, con le loro credenziali
// SMTP: si spedisce dalla posta di casa, senza abbonamenti.
//
// Vive in un file suo, e non dentro le rotte, perché i posti che devono
// mandare le stesse credenziali sono tre — creazione di un utente, «Reset
// password» dell'amministrazione, e il reset che l'utente si fa da solo dalla
// schermata di login — e un testo solo evita che divergano.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { inviaEmail } from "@/lib/email";

/** Password provvisoria leggibile: niente caratteri che si confondono al
 *  telefono (0/O, 1/I/l), e i trattini per dettarla a blocchi. */
export function passwordProvvisoria(): string {
    const alf = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const blocco = (n: number) => Array.from({ length: n }, () => alf[Math.floor(Math.random() * alf.length)]).join("");
    return `TF-${blocco(4)}-${blocco(4)}`;
}

/** La casella da cui parte: SOLO amministrazione@. Il ripiego «la prima
 *  attiva» era pericoloso: le caselle attive sono ventitré e quasi tutte di
 *  punto vendita, condivise — le credenziali del CRM sarebbero partite dalla
 *  posta di un negozio, in un ordine per giunta deciso dal database. */
export async function casellaMittente() {
    const { data } = await supabaseAdmin.from("email_accounts").select("*").eq("status", "attiva");
    return (data ?? []).find((a: { email_address?: string }) => String(a.email_address || "").startsWith("amministrazione@")) || null;
}

const SITO = "https://crm.telefuturasrl.com";

/** Manda le credenziali. `benvenuto` cambia solo il tono: a un utente appena
 *  creato si spiega che account è, a chi ha chiesto il reset si dice che la
 *  vecchia password resta valida finché non usa questa.
 *  Non lancia: torna l'esito, perché chi chiama deve poter decidere cosa fare
 *  se la posta non parte (di norma: non toccare la password). */
/** TRE toni, non due. Il reset fatto dall'AMMINISTRAZIONE non è quello che
 *  l'utente si fa da solo: lì la password è già cambiata, quindi non si può
 *  scrivere «la tua password attuale resta valida finché non usi questa» — chi
 *  ignora la mail prova la vecchia e non entra. Era il testo copiato dal
 *  self-service, dove invece è vero. */
export type ToneCredenziali = "benvenuto" | "reset_admin" | "reset_self";

const esc = (v: string) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export async function inviaCredenziali(opts: {
    a: string; nome?: string | null; password: string; tono: ToneCredenziali;
}): Promise<{ ok: true; da: string } | { ok: false; errore: string }> {
    const dest = String(opts.a || "").trim();
    if (!dest) return { ok: false, errore: "l'utente non ha un indirizzo email" };
    const mittente = await casellaMittente();
    if (!mittente) return { ok: false, errore: "la casella amministrazione@ non è collegata al CRM" };

    const nome = (opts.nome || "").trim().split(/\s+/)[0] || "";
    const T = {
        benvenuto: {
            oggetto: "CRM Telefutura — il tuo accesso",
            apertura: `Ciao ${nome},\n\nti abbiamo creato l'accesso al CRM Telefutura. La tua password provvisoria è:`,
            chiusura: `Entra su ${SITO} con questa email e la password qui sopra: al primo accesso ti verrà chiesto di sceglierne una tua.`,
        },
        reset_admin: {
            oggetto: "CRM Telefutura — la tua password è stata reimpostata",
            apertura: `Ciao ${nome},\n\nl'amministrazione ha reimpostato il tuo accesso al CRM. La tua nuova password provvisoria è:`,
            chiusura: `Da adesso vale solo questa: accedi su ${SITO} e al primo accesso ti verrà chiesto di sceglierne una tua.\n\nSe non te l'aspettavi, avvisa l'amministrazione.`,
        },
        reset_self: {
            oggetto: "CRM Telefutura — la tua password provvisoria",
            apertura: `Ciao ${nome},\n\nla tua password provvisoria per il CRM è:`,
            chiusura: `Accedi su ${SITO} — al primo accesso ti verrà chiesto di impostare una password personale.\n\nSe non hai richiesto tu il reset, ignora questa email: la tua password attuale resta valida finché non usi quella provvisoria.`,
        },
    }[opts.tono];

    try {
        await inviaEmail(mittente as never, {
            to: dest,
            subject: T.oggetto,
            text: `${T.apertura}\n\n    ${opts.password}\n\n${T.chiusura}`,
            html: `<p>${esc(T.apertura).replace(/\n/g, "<br>")}</p>`
                + `<p style="font-size:20px;font-weight:bold;font-family:monospace;letter-spacing:2px;background:#f4f4f8;padding:12px 16px;border-radius:8px;display:inline-block">${esc(opts.password)}</p>`
                + `<p>${esc(T.chiusura).replace(/\n\n/g, "</p><p style=\"color:#888;font-size:12px\">").replace(/\n/g, "<br>")}</p>`
                    .replace(/crm\.telefuturasrl\.com/g, `<a href="${SITO}">crm.telefuturasrl.com</a>`),
        });
        return { ok: true, da: String((mittente as { email_address?: string }).email_address || "") };
    } catch (e) {
        return { ok: false, errore: e instanceof Error ? e.message : "invio non riuscito" };
    }
}
