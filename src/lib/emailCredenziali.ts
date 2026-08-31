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

/** La casella da cui parte: amministrazione@ se c'è, altrimenti la prima
 *  attiva. È la posta con cui l'azienda parla già ai dipendenti. */
export async function casellaMittente() {
    const { data } = await supabaseAdmin.from("email_accounts").select("*").eq("status", "attiva");
    const tutte = data ?? [];
    return tutte.find((a: { email_address?: string }) => String(a.email_address || "").startsWith("amministrazione@")) || tutte[0] || null;
}

const SITO = "https://crm.telefuturasrl.com";

/** Manda le credenziali. `benvenuto` cambia solo il tono: a un utente appena
 *  creato si spiega che account è, a chi ha chiesto il reset si dice che la
 *  vecchia password resta valida finché non usa questa.
 *  Non lancia: torna l'esito, perché chi chiama deve poter decidere cosa fare
 *  se la posta non parte (di norma: non toccare la password). */
export async function inviaCredenziali(opts: {
    a: string; nome?: string | null; password: string; benvenuto?: boolean;
}): Promise<{ ok: true; da: string } | { ok: false; errore: string }> {
    const dest = String(opts.a || "").trim();
    if (!dest) return { ok: false, errore: "l'utente non ha un indirizzo email" };
    const mittente = await casellaMittente();
    if (!mittente) return { ok: false, errore: "nessuna casella email attiva nel CRM" };

    const nome = (opts.nome || "").trim().split(/\s+/)[0] || "";
    const apertura = opts.benvenuto
        ? `Ciao ${nome},\n\nti abbiamo creato l'accesso al CRM Telefutura. La tua password provvisoria è:`
        : `Ciao ${nome},\n\nla tua password provvisoria per il CRM è:`;
    const chiusura = opts.benvenuto
        ? `Entra su ${SITO} con questa email e la password qui sopra: al primo accesso ti verrà chiesto di sceglierne una tua.`
        : `Accedi su ${SITO} — al primo accesso ti verrà chiesto di impostare una password personale.\n\nSe non hai richiesto tu il reset, ignora questa email: la tua password attuale resta valida finché non usi quella provvisoria.`;

    try {
        await inviaEmail(mittente as never, {
            to: dest,
            subject: opts.benvenuto ? "CRM Telefutura — il tuo accesso" : "CRM Telefutura — la tua password provvisoria",
            text: `${apertura}\n\n    ${opts.password}\n\n${chiusura}`,
            html: `<p>${apertura.replace(/\n/g, "<br>")}</p>`
                + `<p style="font-size:20px;font-weight:bold;font-family:monospace;letter-spacing:2px;background:#f4f4f8;padding:12px 16px;border-radius:8px;display:inline-block">${opts.password}</p>`
                + `<p>${chiusura.replace(/\n\n/g, "</p><p style=\"color:#888;font-size:12px\">").replace(/\n/g, "<br>")}</p>`,
        });
        return { ok: true, da: String((mittente as { email_address?: string }).email_address || "") };
    } catch (e) {
        return { ok: false, errore: e instanceof Error ? e.message : "invio non riuscito" };
    }
}
