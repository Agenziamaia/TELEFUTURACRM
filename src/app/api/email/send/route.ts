import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { casellaSua, nonEtua } from "@/lib/emailPerimetro";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { inviaEmail, appendSuSent } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Invia una email. Risposta: { conversationId, text, userId }. Nuova email:
// { accountId, to, subject, text, userId }. Registra il messaggio in uscita e
// APPENDE la copia sulla cartella Sent IMAP (EML-01): l'inviata dal CRM compare
// anche in webmail. L'append e' best-effort: se fallisce l'invio resta valido.
export async function POST(request: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(request, "email/send");
        if (!_g.ok) return _g.risposta;
        const _s = _g.sess;

    try {
        const { conversationId, accountId, to, subject, text, allegati } = await request.json() as {
            conversationId?: string; accountId?: string; to?: string; subject?: string; text?: string;
            /* ⚠️ ARRIVANO I PERCORSI, NON I FILE (Luca 02/09: «l'email non ci
               permette di mettere allegati»).
               Il file lo carica il BROWSER dritto sul deposito, come fa già
               WhatsApp, e qui arriva solo dove sta. Mandarlo dentro il JSON
               sarebbe morto sul muro di nginx: `client_max_body_size` è 1 MB,
               il base64 gonfia di un terzo, e l'errore che si vede in negozio
               è «Unexpected token '<'» — la pagina d'errore del proxy letta
               come se fosse una risposta. È già successo coi report. */
            allegati?: { path: string; nome: string; mime?: string; size?: number }[];
        };
        // 🔒 chi invia è chi ha la sessione, non chi lo dichiara
        const userId = _s.id;
        let convId = conversationId, accId = accountId, dest = to, subj = subject, inReplyTo: string | null = null;

        if (convId) {
            const { data: conv } = await supabase.from("email_conversations").select("id, account_id, customer_email, subject").eq("id", convId).maybeSingle();
            if (!conv) return NextResponse.json({ error: "conversazione non trovata" }, { status: 404 });
            accId = conv.account_id; dest = conv.customer_email;
            subj = subject || (conv.subject ? (/^re:/i.test(conv.subject) ? conv.subject : "Re: " + conv.subject) : "(senza oggetto)");
            const { data: lastIn } = await supabase.from("email_messages").select("message_id").eq("conversation_id", convId).eq("direction", "in").order("email_date", { ascending: false }).limit(1);
            inReplyTo = lastIn && lastIn[0] ? lastIn[0].message_id : null;
        }
        dest = String(dest || "").trim().toLowerCase();
        if (!accId || !dest || !text?.trim()) return NextResponse.json({ error: "destinatario, casella e testo obbligatori" }, { status: 400 });
        subj = subj || "(senza oggetto)";
        /* ⚠️ E LA CASELLA DEV'ESSERE SUA (31/08). Il mittente registrato era
           già quello della sessione — quello era fatto bene — ma la CASELLA
           da cui parte la mail arrivava dal browser senza controlli: si
           spediva dalla casella di un collega, e si rispondeva dentro un
           thread protetto da lucchetto. Vale per tutt'e due le strade, la
           conversazione e la casella diretta. */
        if (!(await casellaSua(userId, String(accId)))) return nonEtua();

        const { data: acc } = await supabase.from("email_accounts").select("*").eq("id", accId).maybeSingle();
        if (!acc) return NextResponse.json({ error: "casella non trovata" }, { status: 404 });

        // una NUOVA composizione apre sempre un THREAD nuovo (Luca 05/08: le
        // conversazioni sono per scambio, non per indirizzo — le risposte
        // arrivano qui già con conversationId)
        if (!convId) {
            const { data: cl } = await supabase.from("clients").select("id").ilike("email", dest).limit(1);
            const { data: created } = await supabase.from("email_conversations").insert({ account_id: accId, customer_email: dest, client_id: cl && cl[0] ? cl[0].id : null, subject: subj }).select("id").single();
            convId = created?.id;
            if (!convId) return NextResponse.json({ error: "non sono riuscito ad aprire la conversazione: riprova." }, { status: 500 });
        }

        /* Gli allegati si riprendono dal deposito con la chiave di servizio:
           il browser li ha messi lì e non li rimanda. Se uno non si scarica
           NON si spedisce una mail monca: chi allega un preventivo e riceve
           «inviata» si aspetta che il preventivo ci sia. */
        const files: { filename: string; content: Buffer; contentType?: string }[] = [];
        const lista = Array.isArray(allegati) ? allegati : [];
        /* ⚠️ SI SPEDISCE SOLO QUELLO CHE HAI APPENA CARICATO TU.
           Il percorso arriva dal browser e qui sotto si scarica con la chiave
           di SERVIZIO, che scavalca ogni RLS. Senza questo controllo bastava
           passare il percorso di un allegato di un'altra conversazione — o,
           peggio, uno che comincia per «../»: il parser di URL normalizza i
           due punti PRIMA di spedire la richiesta, quindi si leggeva da
           QUALUNQUE deposito (contratti, documenti d'identità, media
           WhatsApp: tredicimila file) e il risultato usciva per email a un
           indirizzo scelto da chi chiamava.
           Il 31/08 si è chiuso l'accesso diretto ai depositi proprio per
           questo; questa rotta aveva aperto una seconda porta che non
           chiedeva niente. */
        const miaCartella = `bozze/${userId}/`;
        for (const a of lista) {
            const path = String(a?.path || "");
            if (!path.startsWith(miaCartella) || path.includes("..")) {
                return NextResponse.json({ error: "allegato non valido: ricaricalo." }, { status: 400 });
            }
        }
        if (lista.length > 12) {
            return NextResponse.json({ error: `${lista.length} allegati sono troppi: il limite è 12 per messaggio.` }, { status: 400 });
        }
        /* il peso si guarda PRIMA di scaricare: dodici percorsi scelti a mano
           potevano tirare in memoria mezzo giga per una richiesta destinata a
           essere rifiutata */
        const pesoDichiarato = lista.reduce((n, a) => n + (Number(a?.size) || 0), 0);
        if (pesoDichiarato > 18 * 1024 * 1024) {
            return NextResponse.json({ error: `gli allegati pesano ${(pesoDichiarato / 1048576).toFixed(1)} MB: il limite è 18 MB. In posta il file viene ricodificato e cresce di un terzo, quindi oltre quella soglia il server del destinatario lo rifiuta.` }, { status: 400 });
        }
        let peso = 0;
        for (const a of lista) {
            const path = String(a?.path || "");
            const { data: blob, error: eDl } = await supabase.storage.from("email-attachments").download(path);
            if (eDl || !blob) {
                /* ⚠️ QUI SI DICE PERCHÉ. Il 04/09 sei tentativi di fila sono
                   morti su questa riga — otto file parcheggiati nel deposito e
                   uno solo spedito — e il messaggio «riprova a caricarlo» non
                   ha aiutato nessuno: chi lo legge ricarica lo stesso file e
                   sbatte di nuovo. L'errore vero del deposito adesso esce, sia
                   nei log del server sia a schermo. */
                console.error("[email] allegato non rileggibile:", path, "→", eDl?.message || "nessun contenuto");
                return NextResponse.json({
                    error: `Non riesco a rileggere l'allegato «${a?.nome || path}» dall'archivio (${eDl?.message || "vuoto"}). `
                        + `La mail NON è partita. Riprova; se succede ancora, segnalalo: è un problema nostro, non del file.`,
                }, { status: 502 });
            }
            const buf = Buffer.from(await blob.arrayBuffer());
            peso += buf.length;
            files.push({ filename: String(a?.nome || "allegato"), content: buf, contentType: a?.mime || undefined });
        }
        /* Il tetto è del server di posta, non nostro: oltre una certa taglia il
           messaggio lo rifiuta lui, e il rifiuto arriva DOPO — quando la mail
           risulta già «inviata» a schermo. Meglio dirlo prima. */
        /* ⚠️ 18 MB, non 20. In posta gli allegati viaggiano in base64: un
           terzo in più, più gli header. Venti megabyte di file diventano un
           messaggio da ventisette, e il tetto della quasi totalità dei server
           (Gmail, Outlook) è venticinque: il messaggio sarebbe partito da noi
           e rifiutato da loro — cioè esattamente il caso che questo controllo
           esiste per evitare. */
        if (peso > 18 * 1024 * 1024) {
            return NextResponse.json({ error: `gli allegati pesano ${(peso / 1048576).toFixed(1)} MB: il limite è 18 MB. Mandane meno per volta, o usa un link.` }, { status: 400 });
        }

        let mid = "";
        let raw: Buffer | null = null;
        try {
            const r = await inviaEmail(acc as any, { to: dest, subject: subj, text: text.trim(), html: text.trim().replace(/\n/g, "<br>"), inReplyTo, attachments: files.length ? files : undefined });
            mid = r.messageId; raw = r.raw;
        } catch (e) {
            await supabase.from("email_messages").insert({ conversation_id: convId, account_id: accId, direction: "out", subject: subj, body_text: text.trim(), status: "failed", sent_by_user_id: userId || null, from_addr: acc.email_address, to_addrs: dest, email_date: new Date().toISOString() });
            return NextResponse.json({ error: e instanceof Error ? e.message : "invio fallito" }, { status: 502 });
        }
        /* ⚠️ E SI SPOSTANO SOTTO LA CONVERSAZIONE. Il permesso di aprire un
           file lo decide la CARTELLA: `tf_puo_vedere_file` legge la prima
           cartella del percorso come conversazione (o la seconda, dopo
           «out/»). In composizione nuova la conversazione non esiste ancora
           quando si sceglie il file, quindi il browser lo parcheggia sotto
           «bozze/<utente>/» — e da lì non lo aprirebbe più nessuno. Adesso
           che la conversazione c'è, si sposta dove va. */
        const salvati: { name: string; url: string; mime?: string; size?: number }[] = [];
        for (let i = 0; i < lista.length; i++) {
            const a = lista[i];
            const nome = String(a?.nome || "allegato").replace(/[^a-zA-Z0-9._-]+/g, "_");
            const dentro = `out/${convId}/${Date.now()}-${i}-${nome}`;
            const { error: eMv } = await supabase.storage.from("email-attachments").move(a.path, dentro);
            if (eMv) {
                /* ⚠️ NON SI SALVA UN INDIRIZZO CHE SI SA GIÀ MORTO. Il permesso
                   di aprire un file lo decide la prima cartella, che dev'essere
                   una conversazione: da «bozze/…» il custode risponde «questo
                   file non è tuo» a chiunque, direzione compresa, per sempre.
                   Meglio una graffetta in meno che una che non si apre. */
                console.error("[email] allegato non spostato:", a.path, "→", dentro, eMv.message);
                continue;
            }
            salvati.push({ name: String(a?.nome || "allegato"), url: `/api/file/email-attachments/${dentro}`, mime: a?.mime, size: a?.size });
        }
        await supabase.from("email_messages").insert({ conversation_id: convId, account_id: accId, direction: "out", message_id: mid || null, subject: subj, body_text: text.trim(), status: "sent", sent_by_user_id: userId || null, from_addr: acc.email_address, to_addrs: dest, email_date: new Date().toISOString(), attachments: salvati.length ? salvati : null });
        await supabase.from("email_conversations").update({ last_message_at: new Date().toISOString(), last_preview: text.trim().slice(0, 140), subject: subj }).eq("id", convId);
        // copia su "Posta inviata" IMAP: stesso Message-ID della spedita, quindi il
        // sync della Sent la ritrovera' e la scartera' come duplicato (upsert).
        try { if (raw) await appendSuSent(acc as any, raw); } catch { /* best-effort: casella senza Sent o IMAP momentaneamente giu' */ }
        return NextResponse.json({ ok: true, conversationId: convId, message_id: mid });
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 });
    }
}
