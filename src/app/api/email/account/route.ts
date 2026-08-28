import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { impostazioniPer, cifra, testConnessione } from "@/lib/email";
import { seesAllStores } from "@/lib/roles";
import { capKey, CAP_EMAIL_ADMIN, CAP_EM_UTENTI, CAP_EM_NEGOZI } from "@/lib/capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Caselle email del CRM (una per negozio). Amministrazione lato client come il
// resto del CRM; la password viene cifrata qui e non torna MAI al browser.
//  GET                                             -> elenco (senza password)
//  POST { action:"connect", email, password, ... } -> testa e collega
//  POST { action:"test",  ... }                     -> solo test credenziali
//  POST { action:"delete", id, userId }             -> elimina casella + storico (cascade)


export async function GET(request: Request) {
    // 🔒 anche in LETTURA (28/08 sera): il lucchetto stava solo sul POST, e
    // l'elenco delle caselle aziendali (indirizzi, negozio, titolare) usciva
    // a chiunque conoscesse l'indirizzo, senza login. Il varco vale sempre.
    const _g = await accesso(request, "email/account");
    if (!_g.ok) return _g.risposta;

    // CASELLE DI SERVIZIO (28/08): quelle dei codici usa e getta non sono
    // posta di nessuno e restano fuori dall'elenco. Si chiedono a parte
    // (?sistema=1) e le vede solo chi governa le caselle — il database non le
    // consegna nemmeno (tf_mie_caselle), qui si passa dalla chiave
    // amministratore perché il pannello deve pur poterle gestire.
    const soloSistema = new URL(request.url).searchParams.get("sistema") === "1";
    if (soloSistema && !(await eAmministrazione(_g.sess.id))) {
        return NextResponse.json({ error: "Le caselle di servizio si governano dal pannello Email dell'amministrazione." }, { status: 403 });
    }

    const { data } = await supabase.from("email_accounts")
        .select("id, negozio, owner_user_id, email_address, display_name, status, last_error, created_at, uso_sistema")
        .order("created_at", { ascending: false });
    const tutte = (data ?? []) as { uso_sistema?: boolean | null }[];
    const accounts = tutte.filter((a) => !!a.uso_sistema === soloSistema);

    if (!soloSistema) return NextResponse.json({ accounts });

    // LE UTENZE CHE ASPETTANO (28/08): la mappa dei codici è nota prima delle
    // caselle. Mostrare qui chi aspetta cosa evita di dover andare a cercare
    // nella sezione Password quali indirizzi mancano ancora.
    const { data: attese } = await supabase.from("password_credentials")
        .select("access_type, username, otp_email_attesa")
        .not("otp_email_attesa", "is", null);
    const perIndirizzo: Record<string, { accesso: string; username: string }[]> = {};
    for (const r of attese || []) {
        const k = String(r.otp_email_attesa || "").toLowerCase();
        (perIndirizzo[k] ||= []).push({ accesso: r.access_type, username: r.username });
    }
    return NextResponse.json({
        accounts,
        attese: Object.entries(perIndirizzo).map(([email, utenze]) => ({ email, utenze })),
    });
}

// GOVERNANCE (Luca 26/08): le caselle si collegano, ricollegano ed eliminano
// SOLO dal Pannello Email. Il gate server onora le STESSE capacità della
// rotellina (CAP_EMAIL_ADMIN, righe role_permissions ruolo → grado → persona,
// l'ultimo strato vince — replica di capAllowed/useRolePermissions): un ruolo
// a cui Luca concede la gestione dal pannello non deve prendersi 403 dalla
// route (rilievo revisore). Amministrazione e admin/dev passano per default.
async function eAmministrazione(userId: string): Promise<boolean> {
    if (!userId) return false;
    const { data: chi } = await supabase.from("app_users")
        .select("id, role, grade, active").eq("id", userId).maybeSingle();
    if (!chi || chi.active === false || !chi.role) return false;
    if (chi.role === "admin" || chi.role === "dev" || seesAllStores(chi.role)) return true;
    const chiavi = [chi.role, ...(chi.grade ? [`${chi.role}@${chi.grade}`] : []), `user:${chi.id}`];
    const permKeys = [capKey(CAP_EMAIL_ADMIN.section, CAP_EM_UTENTI.id), capKey(CAP_EMAIL_ADMIN.section, CAP_EM_NEGOZI.id)];
    const { data: rows } = await supabase.from("role_permissions")
        .select("role, perm_key, allowed").in("role", chiavi).in("perm_key", permKeys);
    const fuse = new Map<string, boolean>();
    for (const strato of chiavi) (rows || []).filter(r => r.role === strato).forEach(r => fuse.set(r.perm_key, r.allowed));
    return permKeys.some(k => fuse.get(k) === true);
}

/* «SI AGGANCIA DA SOLA APPENA LA COLLEGHI» (Luca 28/08 sera).
   La mappa utenza → casella dei codici arriva dall'operatore ed è nota prima
   che le caselle entrino nel CRM. Chi collega la casella non deve ricordarsi
   di tornare su ogni utenza: le attese scritte in password_credentials si
   chiudono da sole qui. */
async function agganciaUtenzeInAttesa(accountId: string, email: string): Promise<number> {
    const { data } = await supabase.from("password_credentials")
        .update({ otp_account_id: accountId, otp_email_attesa: null })
        .ilike("otp_email_attesa", email)
        .select("id");
    return (data || []).length;
}

export async function POST(request: Request) {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    {
        // 🔒 sessione firmata + permesso della sezione, come nel pannello
        const _g = await accesso(request, "email/account");
        if (!_g.ok) return _g.risposta;
        const _s = _g.sess;
    }

    try {
        const b = await request.json();
        const action = b?.action;

        if (action === "connect" || action === "test") {
            if (!(await eAmministrazione(String(b.userId || "")))) {
                return NextResponse.json({ error: "le caselle si collegano solo dal pannello Email dell'amministrazione" }, { status: 403 });
            }
            const email = String(b.email || "").trim().toLowerCase();
            /* GLI SPAZI DELLA PASSWORD PER LE APP (Luca 28/08 sera).
               Google la mostra a gruppi di quattro — «abcd efgh ijkl mnop» —
               e chi la copia se li porta dietro: il server la rifiuta e il CRM
               risponde «credenziali rifiutate», mandando a cercare un problema
               che non c'è. Sedici lettere con tre spazi in mezzo sono una
               password per le app: gli spazi si tolgono da soli. */
            const grezza = String(b.password || "");
            const password = /^(\s*[a-z]{4}\s+){3}[a-z]{4}\s*$/i.test(grezza)
                ? grezza.replace(/\s+/g, "")
                : grezza;
            if (!email || !password) return NextResponse.json({ error: "email e password obbligatorie" }, { status: 400 });
            const auto = impostazioniPer(email);
            // CASELLA DI SERVIZIO (28/08): quella dove arrivano i codici usa e
            // getta. Non è di nessuno e non è di nessun negozio: non compare in
            // nessuna Inbox, non si scarica, non si somma nei contatori. Da lei
            // non spediremo mai niente, quindi non le si chiede l'invio.
            const usoSistema = b.usoSistema === true;
            const acc = {
                email_address: email,
                display_name: b.displayName || null,
                username: (b.username || email).trim(),
                pass_enc: cifra(password),
                imap_host: b.imapHost || auto.imap_host,
                imap_port: Number(b.imapPort) || auto.imap_port,
                smtp_host: b.smtpHost || auto.smtp_host,
                smtp_port: Number(b.smtpPort) || auto.smtp_port,
                last_uid: 0,
            };
            // verifica login IMAP (+ SMTP se è una casella di posta vera)
            try { await testConnessione(acc as any, { soloLettura: usoSistema }); }
            catch (e: any) { return NextResponse.json({ error: "Connessione non riuscita — " + (e?.message || e) }, { status: 400 }); }

            if (action === "test") return NextResponse.json({ ok: true, settings: auto });

            // casella PERSONALE = SENZA negozio (26/08, parità col gemello
            // WhatsApp): il vecchio backfill del primary_store faceva contare
            // la posta personale nel pallino dei colleghi del negozio
            const negozio: string | null = b.ownerUserId ? null : (b.negozio || null);
            // MEMBRI EXTRA (26/08): casella multi-utente — il primo intestatario
            // sta in owner_user_id, gli altri nella ponte email_account_users
            const extraIds: string[] = Array.isArray(b.extraUserIds)
                ? [...new Set<string>(b.extraUserIds.map((x: unknown) => String(x)).filter((x: string) => x && x !== String(b.ownerUserId || "")))]
                : [];
            const syncMembri = async (accountId: string) => {
                await supabase.from("email_account_users").delete().eq("account_id", accountId);
                if (extraIds.length) {
                    await supabase.from("email_account_users")
                        .insert(extraIds.map((uid) => ({ account_id: accountId, user_id: uid })));
                }
            };

            // Se la casella e' GIA' collegata (stesso indirizzo), la RI-collego invece
            // di fallire con "duplicate key ...email_address_key": aggiorno credenziali
            // e impostazioni. Cosi' "Collega" vale anche come "ri-collega" (es. password
            // cambiata o casella riassegnata). last_uid resta invariato -> niente
            // re-import della posta gia' scaricata.
            const { data: existing } = await supabase.from("email_accounts")
                .select("id").eq("email_address", email).maybeSingle();
            if (existing) {
                const upd: any = {
                    username: acc.username, pass_enc: acc.pass_enc,
                    imap_host: acc.imap_host, imap_port: acc.imap_port,
                    smtp_host: acc.smtp_host, smtp_port: acc.smtp_port,
                    negozio, owner_user_id: b.ownerUserId || null, status: "attiva", last_error: null,
                    uso_sistema: usoSistema,
                };
                if (acc.display_name) upd.display_name = acc.display_name;
                const { data, error } = await supabase.from("email_accounts")
                    .update(upd).eq("id", existing.id)
                    .select("id, email_address, negozio, display_name, status").single();
                if (error) return NextResponse.json({ error: error.message }, { status: 500 });
                // membri sincronizzati SOLO se il chiamante li dichiara (rilievo
                // M6: il «Collega» dall'Inbox non li passa — un ricollega da lì
                // azzerava i membri di una casella condivisa)
                if (Array.isArray(b.extraUserIds)) await syncMembri(existing.id);
                const agganciate = await agganciaUtenzeInAttesa(existing.id, email);
                return NextResponse.json({ ok: true, account: data, reconnected: true, agganciate });
            }

            const { data, error } = await supabase.from("email_accounts").insert({
                ...acc, negozio, owner_user_id: b.ownerUserId || null, status: "attiva",
                uso_sistema: usoSistema,
            }).select("id, email_address, negozio, display_name, status").single();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            if (Array.isArray(b.extraUserIds)) await syncMembri(data.id);
            const agganciate = await agganciaUtenzeInAttesa(data.id, email);
            return NextResponse.json({ ok: true, account: data, agganciate });
        }

        if (action === "retest") {
            // PROVA CONNESSIONE con le credenziali GIÀ salvate (pannello Email):
            // decifra la password e ritenta login IMAP+SMTP, aggiornando lo
            // stato — per capire al volo se una casella «in errore» è guarita.
            if (!(await eAmministrazione(String(b.userId || "")))) {
                return NextResponse.json({ error: "riservato al pannello Email dell'amministrazione" }, { status: 403 });
            }
            const id = String(b.id || "");
            if (!id) return NextResponse.json({ error: "id obbligatorio" }, { status: 400 });
            const { data: acc } = await supabase.from("email_accounts").select("*").eq("id", id).maybeSingle();
            if (!acc) return NextResponse.json({ error: "casella non trovata" }, { status: 404 });
            try {
                await testConnessione(acc as any);
                await supabase.from("email_accounts").update({ status: "attiva", last_error: null }).eq("id", id);
                return NextResponse.json({ ok: true });
            } catch (e: any) {
                const msg = String(e?.message || e).slice(0, 300);
                // ANTI-FLAP come il poll (regola Luca 08/08): lo status si
                // ribalta SOLO su credenziali rifiutate — un transitorio
                // (limite connessioni IMAP mentre l'Inbox polla, timeout)
                // marcherebbe in rosso per tutti una casella sana
                if (/credenziali rifiutate/i.test(msg)) {
                    await supabase.from("email_accounts").update({ status: "errore", last_error: msg }).eq("id", id);
                }
                return NextResponse.json({ error: msg }, { status: 400 });
            }
        }

        if (action === "delete") {
            // ELIMINAZIONE COMPLETA (decisione Luca 04/08): via la casella dal CRM
            // con TUTTO lo storico scaricato (cascade su conversazioni, messaggi,
            // bozze). La casella reale sul server di posta NON viene toccata.
            // GOVERNANCE 26/08: STRETTA alla sola amministrazione — prima potevano
            // anche il proprietario della casella e lo store manager del negozio.
            const id = String(b.id || "");
            const userId = String(b.userId || "");
            if (!id || !userId) return NextResponse.json({ error: "id e userId obbligatori" }, { status: 400 });
            const { data: acc } = await supabase.from("email_accounts")
                .select("id, owner_user_id, negozio").eq("id", id).maybeSingle();
            if (!acc) return NextResponse.json({ error: "casella non trovata" }, { status: 404 });
            if (!(await eAmministrazione(userId))) {
                return NextResponse.json({ error: "le caselle si eliminano solo dal pannello Email dell'amministrazione" }, { status: 403 });
            }

            // pulizia BEST-EFFORT del bucket allegati (path: <convId>/<file>) prima
            // della delete: dopo il cascade i file resterebbero orfani per sempre.
            try {
                const { data: convIds } = await supabase.from("email_conversations").select("id").eq("account_id", id);
                for (const c of convIds || []) {
                    const { data: files } = await supabase.storage.from("email-attachments").list(c.id, { limit: 1000 });
                    if (files && files.length) {
                        await supabase.storage.from("email-attachments").remove(files.map(f => `${c.id}/${f.name}`));
                    }
                }
            } catch { /* allegati orfani tollerati: non bloccano l'eliminazione */ }

            const { error } = await supabase.from("email_accounts").delete().eq("id", id);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: "action non valida" }, { status: 400 });
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 });
    }
}
