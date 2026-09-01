import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin, serviceRolePresente } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ IL CUSTODE DEI FILE ═══════════════════════════════════════════════════
   Undici depositi su dodici erano PUBBLICI: 13 GB — 8.703 allegati di posta,
   6.807 contratti dei clienti, le foto di WhatsApp, i report di chiusura, i
   documenti degli usati. La rotta `/storage/v1/object/public/…` Supabase la
   serve senza chiedere niente a nessuno: né login, né chiave. Bastava
   conoscere l'indirizzo — e gli indirizzi stanno scritti dentro il database,
   in chiaro, dentro ogni messaggio.

   Da qui in avanti si passa da questa porta. Non è un dettaglio di comodo:
   è l'unico punto in cui si può chiedere «e tu chi sei?» prima di consegnare
   il file. Il deposito diventa privato, e l'unico modo di arrivare a un file
   è un indirizzo FIRMATO che dura pochi minuti e che nasce qui, dopo i
   controlli.

   ⚠️ PERCHÉ NON BASTAVA CAMBIARE IL FLAG DEL DEPOSITO. Gli indirizzi pubblici
   sono salvati dentro `email_messages.attachments` e `wa_messages.media_url`
   — migliaia di righe. Chiudere il deposito e basta avrebbe rotto ogni
   allegato mai ricevuto. Per questo il custode accetta anche il vecchio
   indirizzo: si riconosce il percorso, si controlla chi chiede, si firma.

   COME SI CHIAMA:  /api/file/<deposito>/<percorso/del/file>
   Restituisce un reindirizzamento all'indirizzo firmato (5 minuti). */

/* I controlli, deposito per deposito. `null` = basta essere dentro il CRM.
   ⚠️ La sessione è OBBLIGATORIA per tutti: qui sotto si decide solo se
   serve QUALCOSA IN PIÙ. */
const REGOLE: Record<string, "sessione" | "casella" | "numero"> = {
    // la posta: il file sta sotto la cartella della conversazione, e quella
    // conversazione deve essere di una casella che questa persona vede —
    // lucchetto compreso, perché la regola è la stessa dell'Inbox
    "email-attachments": "casella",
    // le foto e i vocali di WhatsApp: stessa cosa, con i numeri
    "whatsapp-media": "numero",
    // gli altri: dentro il CRM si vedono, fuori no. È già il salto grosso
    // rispetto a oggi, dove li vede Internet.
    contracts: "sessione",
    chiusura: "sessione",
    "chat-attachments": "sessione",
    usati_attachments: "sessione",
    // i documenti firmati di ordini e assistenze: dalla scheda del cliente si
    // aprono da qui, e senza questa riga il custode rispondeva «deposito
    // sconosciuto» a ogni contratto firmato
    "pratiche-allegati": "sessione",
    documentation: "sessione",
    "user-attachments": "sessione",
    "store-attachments": "sessione",
    "qr-uploads": "sessione",
    avatars: "sessione",
    "liste-files": "sessione",
    "avanzamenti-files": "sessione",
};

/** Il pezzo di percorso che dice a quale CONVERSAZIONE appartiene il file.
 *  ⚠️ Di solito è la prima cartella, ma i media che MANDIAMO noi finiscono
 *  sotto «out/<conversazione>/…» — e con la prima cartella il controllo si
 *  sarebbe messo a cercare una conversazione che si chiama «out», negando
 *  ogni allegato in uscita. */
const cartellaConversazione = (p: string) => {
    const parti = p.split("/").filter(Boolean);
    return (parti[0] === "out" ? parti[1] : parti[0]) || "";
};

export async function GET(request: Request, ctx: { params: Promise<{ percorso: string[] }> }) {
    /* ⚠️ PRIMA DI TUTTO: senza la chiave di servizio qui non si firma niente.
       `supabaseAdmin`, se non ce l'ha, ripiega sulla chiave pubblica — che su
       un deposito privato non può firmare — e il risultato sarebbe un «file
       non trovato» misterioso su OGNI allegato dell'azienda, con mezz'ora
       persa a cercarlo nel posto sbagliato.
       Sta prima dell'autenticazione di proposito: «il server è configurato
       male» è vero indipendentemente da chi chiede, e questa rotta è l'unico
       posto da cui si può sapere se la chiave c'è prima di girarla — cioè
       prima di chiudere tredici gigabyte al buio. */
    if (!serviceRolePresente()) {
        console.error("[file] manca SUPABASE_SERVICE_ROLE_KEY: gli indirizzi non si possono firmare.");
        return NextResponse.json(
            { error: "Configurazione incompleta: manca la chiave di servizio." }, { status: 503 });
    }

    /* «file» non è una sezione del menù: `accesso` si limita a pretendere la
       sessione firmata, che è il salto che conta — oggi questi file li
       scarica Internet. Il resto lo decidono le regole qui sotto. */
    const g = await accesso(request, "file");
    if (!g.ok) return g.risposta;
    const sess = g.sess;

    const { percorso } = await ctx.params;
    const deposito = String(percorso?.[0] || "");
    const dentro = (percorso || []).slice(1).map((s) => decodeURIComponent(s)).join("/");
    if (!deposito || !dentro) return NextResponse.json({ error: "Percorso incompleto." }, { status: 400 });

    const regola = REGOLE[deposito];
    if (!regola) return NextResponse.json({ error: "Deposito sconosciuto." }, { status: 404 });

    /* ⚠️ Il controllo fine lo fa il DATABASE, con le stesse funzioni delle
       schermate: `tf_mie_caselle()` e `tf_wa_istanze()`. Riscriverlo qui
       vorrebbe dire una seconda copia della regola che, fra qualche mese,
       diverge da quella vera — ed è esattamente come si riaprono i buchi. */
    if (regola === "casella" || regola === "numero") {
        const id = cartellaConversazione(dentro);
        const { data, error } = await supabaseAdmin.rpc("tf_puo_vedere_file", {
            p_utente: sess.id, p_deposito: deposito, p_cartella: id,
        });
        if (error) {
            console.error("[file] controllo non riuscito:", error.message);
            return NextResponse.json({ error: "Controllo non riuscito." }, { status: 500 });
        }
        if (data !== true) return NextResponse.json({ error: "Questo file non è tuo." }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin.storage.from(deposito).createSignedUrl(dentro, 300);
    if (error || !data?.signedUrl) {
        return NextResponse.json({ error: "File non trovato." }, { status: 404 });
    }
    /* Un reindirizzamento e non un travaso: i file arrivano a 6 MB l'uno e
       farli passare dal server significherebbe pagarne la banda due volte e
       tenere occupata una funzione per tutto il tempo dello scaricamento. */
    return NextResponse.redirect(data.signedUrl, {
        status: 302,
        headers: { "Cache-Control": "private, max-age=0, no-store" },
    });
}
