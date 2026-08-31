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

import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { inviaEmail } from "@/lib/email";

/** Password provvisoria leggibile: niente caratteri che si confondono al
 *  telefono (0/O, 1/I/l), e i trattini per dettarla a blocchi.
 *  Le lettere si estraggono con il generatore CRITTOGRAFICO: `Math.random()`
 *  non è imprevedibile — da poche password viste si può risalire al suo stato
 *  e calcolare le successive. Per un numero di ornamento non conta; per una
 *  credenziale sì (revisore 31/08). */
export function passwordProvvisoria(): string {
    const alf = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const blocco = (n: number) => Array.from({ length: n }, () => alf[crypto.randomInt(alf.length)]).join("");
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
        await traccia(mittente, dest, T.oggetto, "sent", null);
        return { ok: true, da: String((mittente as { email_address?: string }).email_address || "") };
    } catch (e) {
        const errore = e instanceof Error ? e.message : "invio non riuscito";
        await traccia(mittente, dest, T.oggetto, "failed", errore);
        return { ok: false, errore };
    }
}

/** LA DOMANDA È «GLIEL'ABBIAMO MANDATA?» (revisore 31/08): senza una riga da
 *  qualche parte il CRM non sapeva rispondere — ed è esattamente la domanda che
 *  ha fatto Luca sui tre ragazzi appena creati. Adesso l'invio lascia la sua
 *  traccia in `email_messages`, dove la sezione Email la mostra.
 *
 *  Il TESTO NON SI SALVA. Dentro c'è una password viva, e archiviarla
 *  vorrebbe dire lasciarla leggibile a chiunque apra la casella
 *  amministrazione@ nel CRM: della traccia serve il QUANDO e il A CHI, non il
 *  segreto. Per la stessa ragione non si fa la copia su «Posta inviata». */
async function traccia(acc: unknown, dest: string, oggetto: string, stato: "sent" | "failed", errore: string | null) {
    try {
        const a = acc as { id?: string; email_address?: string };
        if (!a?.id) return;
        let convId: string | null = null;
        const { data: esistente } = await supabaseAdmin.from("email_conversations")
            .select("id").eq("account_id", a.id).ilike("customer_email", dest).limit(1);
        if (esistente && esistente[0]) convId = esistente[0].id;
        else {
            const { data: creata } = await supabaseAdmin.from("email_conversations")
                .insert({ account_id: a.id, customer_email: dest, subject: oggetto }).select("id").single();
            convId = creata?.id ?? null;
        }
        const corpo = stato === "sent"
            ? "Credenziali di accesso al CRM inviate. La password non viene archiviata."
            : `Invio non riuscito: ${errore || "errore sconosciuto"}. La password non viene archiviata.`;
        await supabaseAdmin.from("email_messages").insert({
            conversation_id: convId, account_id: a.id, direction: "out", subject: oggetto,
            body_text: corpo, status: stato, from_addr: a.email_address, to_addrs: dest,
            email_date: new Date().toISOString(),
        });
        if (convId) await supabaseAdmin.from("email_conversations")
            .update({ last_message_at: new Date().toISOString(), last_preview: corpo.slice(0, 140), subject: oggetto }).eq("id", convId);
    } catch { /* la traccia non deve mai far fallire l'invio */ }
}
