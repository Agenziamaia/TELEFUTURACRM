import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ═══ IL CLIENTE VUOLE FATTURA ═══════════════════════════════════════════════
   Luca 04/09: «quando viene un cliente business che vuole una fattura, ad oggi
   non abbiamo il processo».

   Questa rotta si chiama AL POSTO di `/api/vendita/scontrino`, mai insieme:
   fattura e scontrino sono due documenti per la stessa operazione, e se
   uscissero entrambi l'importo verrebbe contato due volte — una nei
   corrispettivi del registratore e una nel fatturato. I soldi invece si
   incassano lo stesso, e l'incasso passa dalla sua chiamata di sempre.

   Qui si fa tre cose:
     1. si CONGELANO i dati del cliente, perché una fattura si emette con
        quelli del giorno della vendita, non con quelli di quando qualcuno
        troverà il tempo di farla;
     2. l'anagrafica IMPARA i due campi che le mancavano (codice destinatario
        e PEC), così la seconda fattura allo stesso cliente non li richiede;
     3. parte il flash all'amministrazione, che porta dritto alla richiesta.

   POST { contrattoId, negozio, societa, totale, cliente:{…}, righe, pagamenti }
   ═══════════════════════════════════════════════════════════════════════════ */

const s = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

/* I CAMPI SENZA I QUALI LA FATTURA NON SI PUÒ FARE. Il controllo sta QUI e non
   solo nel browser: una richiesta a metà non è un promemoria, è una telefonata
   al cliente il giorno dopo per farsi dare i dati che si avevano davanti. */
function cosaManca(c: Record<string, string>): string[] {
    const out: string[] = [];
    if (!c.ragione_sociale && !(c.nome && c.cognome)) out.push("la ragione sociale (o nome e cognome)");
    if (!c.cf_piva) out.push("la partita IVA o il codice fiscale");
    if (!c.indirizzo) out.push("l'indirizzo");
    if (!c.cap) out.push("il CAP");
    if (!c.citta) out.push("la città");
    /* SDI O PEC, ALMENO UNO: senza, lo SdI non sa a chi consegnarla. Per un
       privato il codice è '0000000' e si consegna alla PEC o al cassetto
       fiscale, ma va scritto lo stesso. */
    if (!c.codice_destinatario && !c.pec) out.push("il codice destinatario o la PEC");
    if (c.codice_destinatario && !/^[A-Za-z0-9]{6,7}$/.test(c.codice_destinatario))
        out.push("un codice destinatario valido (6 o 7 caratteri)");
    if (c.pec && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.pec)) out.push("una PEC scritta bene");
    return out;
}

export async function POST(req: Request) {
    let sess: { id: string; role: string; exp: number };
    {
        const g = await accesso(req, "vendita/fattura");
        if (!g.ok) return g.risposta;
        sess = g.sess;
    }

    let b: any;
    try { b = await req.json(); } catch { return NextResponse.json({ error: "body non valido" }, { status: 400 }); }

    const negozio = s(b?.negozio, 80);
    if (!negozio) return NextResponse.json({ error: "negozio mancante" }, { status: 400 });
    const totale = Number(b?.totale);
    if (!Number.isFinite(totale) || totale < 0 || totale > 1000000)
        return NextResponse.json({ error: "totale non valido" }, { status: 400 });

    const c = {
        client_id: s(b?.cliente?.clientId, 120),
        cliente_tipo: s(b?.cliente?.tipo, 20) || "business",
        ragione_sociale: s(b?.cliente?.ragioneSociale),
        nome: s(b?.cliente?.nome, 80),
        cognome: s(b?.cliente?.cognome, 80),
        cf_piva: s(b?.cliente?.cfPiva, 30).toUpperCase(),
        codice_destinatario: s(b?.cliente?.codiceDestinatario, 10).toUpperCase(),
        pec: s(b?.cliente?.pec, 160).toLowerCase(),
        indirizzo: s(b?.cliente?.indirizzo),
        cap: s(b?.cliente?.cap, 10),
        citta: s(b?.cliente?.citta, 80),
        email: s(b?.cliente?.email, 160).toLowerCase(),
        telefono: s(b?.cliente?.telefono, 40),
    };
    const manca = cosaManca(c);
    if (manca.length)
        return NextResponse.json({ error: "Per fare la fattura manca " + manca.join(", ") + "." }, { status: 400 });

    const { data: io } = await supabase.from("app_users").select("full_name").eq("id", sess.id).maybeSingle();
    const chi = s(io?.full_name, 80) || s(b?.createdBy, 80) || "Cassa";

    const { data: riga, error } = await supabase.from("fatture_richieste").insert({
        contratto_id: s(b?.contrattoId, 120) || null,
        negozio,
        societa: s(b?.societa, 120) || null,
        creato_da: chi,
        totale: Number(totale.toFixed(2)),
        ...c,
        client_id: c.client_id || null,
        righe: Array.isArray(b?.righe) ? b.righe.slice(0, 200) : [],
        pagamenti: Array.isArray(b?.pagamenti) ? b.pagamenti.slice(0, 10) : [],
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    /* L'ANAGRAFICA IMPARA. Solo i campi che prima erano vuoti: correggere a
       mano l'anagrafica dal banco cassa, di corsa e col cliente davanti, è il
       modo migliore per rovinarla. */
    if (c.client_id) {
        try {
            const { data: vecchio } = await supabase.from("clients")
                .select("codice_destinatario, pec").eq("id", c.client_id).maybeSingle();
            const patch: Record<string, string> = {};
            if (c.codice_destinatario && !s(vecchio?.codice_destinatario)) patch.codice_destinatario = c.codice_destinatario;
            if (c.pec && !s(vecchio?.pec)) patch.pec = c.pec;
            if (Object.keys(patch).length) await supabase.from("clients").update(patch).eq("id", c.client_id);
        } catch { /* l'anagrafica che non impara non deve far fallire la vendita */ }
    }

    /* IL FLASH. Stessa coda del bonifico: una riga SOLA per il ruolo
       `amministrativo`, non una per persona — la prima che la fa la chiude per
       tutte, se no la seconda rifà una fattura già emessa. */
    try {
        const euro = totale.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const nome = c.ragione_sociale || `${c.nome} ${c.cognome}`.trim() || c.cf_piva;
        await supabase.from("admin_tasks").insert({
            tipo: "fattura_richiesta",
            titolo: `🧾 Fattura da emettere: ${euro} € — ${nome}`,
            dettaglio: `${chi} ha chiuso a ${negozio} una vendita di ${euro} € SENZA scontrino perché il cliente ha chiesto fattura. I dati per emetterla sono già archiviati: apri la richiesta, emetti la fattura e segnala il numero.`,
            link: `/documenti?fattura=${riga.id}`,
            target_role: "amministrativo",
            created_by: chi,
        });
    } catch { /* l'avviso non deve mai fermare una vendita */ }

    return NextResponse.json({ ok: true, id: riga.id });
}
