import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { codaNumero, soloCifre } from "@/lib/aircall";
import { areaOf } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Riceve gli eventi chiamata da Aircall e li registra in call_events, collegandoli
// al cliente (per numero) e al negozio/utente (per numero Aircall).
// Sicurezza: l'URL registrato su Aircall porta ?t=<AIRCALL_WEBHOOK_TOKEN>; senza
// il token giusto la richiesta viene rifiutata.

function toIso(v: unknown): string | null {
    if (v == null) return null;
    const n = Number(v);
    if (!Number.isNaN(n) && n > 1e9) return new Date(n * 1000).toISOString(); // epoch secondi
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function POST(request: Request) {
    try {
        const url = new URL(request.url);
        const expected = process.env.AIRCALL_WEBHOOK_TOKEN || "";
        if (!expected || url.searchParams.get("t") !== expected) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }

        const payload = await request.json();
        const event: string = payload?.event || "";
        const d = payload?.data || {};
        // Ci interessano solo gli eventi chiamata (call.*). Gli altri li ignoriamo ok.
        if (!event.startsWith("call.") || !d?.id) {
            return NextResponse.json({ ok: true, ignored: event });
        }

        const direction = d.direction || null;                 // inbound | outbound
        const clienteNum = d.raw_digits || d.to || d.from || null; // l'altro capo
        const aircallUserId = d.user?.id ?? null;
        const agente = d.user?.name ?? null;
        const numberId = d.number?.id ?? null;
        const started = toIso(d.started_at);
        const answered = toIso(d.answered_at);
        const ended = toIso(d.ended_at);
        const durata = typeof d.duration === "number" ? d.duration : null;
        const registrazione = d.recording || d.asset || null;   // link registrazione se presente
        const answeredBool = !!d.answered_at;
        const missed = direction === "inbound" && !d.answered_at && (event === "call.hungup" || event === "call.ended");

        // negozio dal numero Aircall (se mappato in stores.aircall_number_id)
        let negozio: string | null = null;
        if (numberId) {
            const { data: st } = await supabase.from("stores").select("name").eq("aircall_number_id", numberId).maybeSingle();
            negozio = st?.name ?? null;
        }

        // cliente dal numero (ultime 9 cifre)
        let clientId: string | null = null;
        if (clienteNum) {
            const coda = codaNumero(clienteNum);
            if (coda.length >= 6) {
                const { data: cli } = await supabase
                    .from("clients").select("id, cellulare").ilike("cellulare", `%${coda}%`).limit(1);
                if (cli && cli[0]) clientId = cli[0].id;
            }
        }

        const row: Record<string, unknown> = {
            aircall_call_id: d.id,
            direction, status: d.status || event.replace("call.", ""),
            from_number: d.from ?? null, to_number: d.to ?? null,
            cliente_num: clienteNum,
            aircall_user_id: aircallUserId, agente_nome: agente,
            aircall_number_id: numberId, negozio,
            answered: answeredBool, duration_sec: durata,
            recording_url: registrazione, missed,
            started_at: started, answered_at: answered, ended_at: ended,
            client_id: clientId, raw: payload,
        };

        // upsert per aircall_call_id: gli eventi successivi (answered -> ended)
        // aggiornano la stessa riga invece di duplicarla.
        const { error } = await supabase.from("call_events").upsert(row, { onConflict: "aircall_call_id" });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // ── FASE 2 (conferma Luca 26/07): PONTE verso la sezione Caller ──────
        // A fine chiamata la pratica si compila da sola: trova-o-crea per numero,
        // anagrafica dal cliente agganciato, "non risponde" con progressione
        // NR1→NR3, risposta = flag da_esitare (l'esito lo sceglie il caller).
        // Solo eventi TERMINALI, solo utenti del CALL CENTER, una volta sola
        // per chiamata (call_events.bridged).
        let bridge: string | null = null;
        if ((event === "call.ended" || event === "call.hungup") && clienteNum) {
            const { data: ev } = await supabase.from("call_events").select("bridged").eq("aircall_call_id", d.id).maybeSingle();
            if (!ev?.bridged) {
                bridge = await bridgeVersoCaller({
                    direction, clienteNum, aircallUserId, agenteNome: agente,
                    answered: answeredBool, durata, clientId, startedIso: started,
                });
                await supabase.from("call_events").update({ bridged: true }).eq("aircall_call_id", d.id);
            }
        }

        return NextResponse.json({ ok: true, event, matched_client: clientId, bridge });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// Aircall non manda GET, ma un 200 aiuta a verificare che la rotta e' viva.
export async function GET() {
    return NextResponse.json({ ok: true, service: "aircall-webhook" });
}


// Riversa una chiamata conclusa sulla pratica del flusso Caller.
// Regole (Luca 26/07): outbound trova-o-crea; inbound SOLO aggiorna una pratica
// esistente (mai crearne da numeri entranti); i numeri dei negozi non creano
// pratiche (solo utenti con area call center); nessun nuovo stato in lista —
// la chiamata risposta accende il flag da_esitare e l'esito lo mette il caller.
async function bridgeVersoCaller(p: {
    direction: string | null; clienteNum: string; aircallUserId: number | null;
    agenteNome: string | null; answered: boolean; durata: number | null;
    clientId: string | null; startedIso: string | null;
}): Promise<string> {
    // chi ha gestito la chiamata, dal mapping identita' (fallback sul nome)
    let callerName = ""; let callerRole = ""; let callerId: string | null = null;
    if (p.aircallUserId) {
        const { data: u } = await supabase.from("app_users").select("id,full_name,role").eq("aircall_user_id", p.aircallUserId).maybeSingle();
        if (u) { callerName = u.full_name; callerRole = u.role; callerId = u.id; }
    }
    if (!callerName && p.agenteNome) {
        const { data: u } = await supabase.from("app_users").select("id,full_name,role").ilike("full_name", p.agenteNome).maybeSingle();
        if (u) { callerName = u.full_name; callerRole = u.role; callerId = u.id; }
    }
    if (!callerName) return "skip: agente non mappato";
    // area call center + admin/dev (cosi' anche i test di Luca creano la pratica);
    // i negozi e gli altri ruoli restano SOLO nel registro telefonico.
    if (areaOf(callerRole) !== "cc" && !["admin", "dev"].includes(callerRole)) return "skip: non call center";

    // LAVORAZIONE IN SERIE (mig. 090): se il caller ha il preset ON, le 4 voci
    // (brand/obiettivo/provenienza/tipologia) si applicano da sole — alla
    // creazione, e sulle pratiche esistenti SOLO dove il campo e' vuoto.
    let preset: { brand: string; obiettivo: string; provenienza: string; tipologia: string } | null = null;
    if (callerId) {
        const { data: pr } = await supabase.from("caller_presets").select("attivo,brand,obiettivo,provenienza,tipologia").eq("user_id", callerId).maybeSingle();
        if (pr?.attivo) preset = { brand: pr.brand || "", obiettivo: pr.obiettivo || "", provenienza: pr.provenienza || "", tipologia: pr.tipologia || "" };
    }

    const coda = codaNumero(p.clienteNum);
    if (coda.length < 6) return "skip: numero corto";
    // match diretto sulle ultime 9 cifre; se il numero in pratica ha SPAZI o
    // trattini (inserimento umano / liste), secondo giro con le cifre
    // intervallate da % — "3 331 23 45 67" combacia lo stesso.
    let { data: prat } = await supabase.from("calls")
        .select("id, stato, storico, brand, obiettivo, provenienza, tipologia")
        .or(`numero.ilike.%${coda}%,cellulare.ilike.%${coda}%`)
        .order("created_at", { ascending: false }).limit(1);
    if (!prat || !prat[0]) {
        const patt = coda.split("").join("%");
        ({ data: prat } = await supabase.from("calls")
            .select("id, stato, storico, brand, obiettivo, provenienza, tipologia")
            .or(`numero.ilike.%${patt}%,cellulare.ilike.%${patt}%`)
            .order("created_at", { ascending: false }).limit(1));
    }
    const esistente = prat && prat[0];

    if (!esistente && p.direction !== "outbound") return "skip: inbound senza pratica";

    const quando = (p.startedIso || new Date().toISOString()).slice(0, 16);
    const esitoTxt = p.answered ? `risposta · ${p.durata ?? 0}s` : "nessuna risposta";
    const voce = { data: quando, caller: callerName, campo: "Chiamata Aircall", da: "", a: `${p.direction || "outbound"} · ${esitoTxt}` };

    // progressione automatica dei "non risponde" (temperatura conservata)
    const prossimoNR = (statoAttuale: string): string => {
        const m = /^(Cold|Hot) NR([123])$/.exec(statoAttuale || "");
        if (m) return `${m[1]} NR${Math.min(3, Number(m[2]) + 1)}`;
        return "Cold NR1";
    };

    if (esistente) {
        const upd: Record<string, unknown> = {
            data_chiamata: quando,
            storico: [...(Array.isArray(esistente.storico) ? esistente.storico : []), voce],
        };
        if (!p.answered) upd.stato = prossimoNR(esistente.stato);
        else upd.da_esitare = true;
        if (preset) {
            // riempi SOLO i campi vuoti: mai sovrascrivere cio' che la lista o
            // il caller hanno gia' impostato
            if (!esistente.brand && preset.brand) upd.brand = preset.brand;
            if (!esistente.obiettivo && preset.obiettivo) upd.obiettivo = preset.obiettivo;
            if (!esistente.provenienza && preset.provenienza) upd.provenienza = preset.provenienza;
            if (!esistente.tipologia && preset.tipologia) upd.tipologia = preset.tipologia;
        }
        const { error } = await supabase.from("calls").update(upd).eq("id", esistente.id);
        return error ? "errore update: " + error.message : (p.answered ? "pratica aggiornata (da esitare)" : "pratica aggiornata (NR)");
    }

    // pratica NUOVA (solo outbound): anagrafica autocompilata dal cliente agganciato
    let cli: Record<string, unknown> | null = null;
    if (p.clientId) {
        const { data } = await supabase.from("clients")
            .select("tipo,nome,cognome,ragione_sociale,cf_piva,cellulare").eq("id", p.clientId).maybeSingle();
        cli = data ?? null;
    }
    const tipo = (cli?.tipo as string) === "business" ? "business" : "consumer";
    const { error } = await supabase.from("calls").insert({
        tipo_cliente: tipo,
        nome: (cli?.nome as string) || "", cognome: (cli?.cognome as string) || "",
        ragione_sociale: (cli?.ragione_sociale as string) || "",
        cf: tipo === "consumer" ? ((cli?.cf_piva as string) || "") : "",
        piva: tipo === "business" ? ((cli?.cf_piva as string) || "") : "",
        numero: p.clienteNum, cellulare: (cli?.cellulare as string) || soloCifre(p.clienteNum),
        brand: preset?.brand || "", provenienza: preset?.provenienza || "Aircall", tipologia: preset?.tipologia || "", obiettivo: preset?.obiettivo || "",
        stato: p.answered ? "Nuovo" : "Cold NR1",
        data_chiamata: quando, caller: callerName,
        negozio_appuntamento: "", data_appuntamento: null, indirizzo: "", agente: "",
        segnalatore: "", campagna: "", negozio_provenienza: "", mese_provenienza: "", anno_provenienza: "",
        whatsapp: "", note: "", data_richiamo: null,
        da_esitare: p.answered,
        storico: [voce],
    });
    return error ? "errore insert: " + error.message : "pratica creata" + (cli ? " con anagrafica cliente" : "");
}
