"use client";

// MOTORE "DA LAVORARE / WARNING / MALUS" del call center (Luca 31/07) — stessa
// filosofia del tracking Dragon PDA e del laboratorio usati: ogni stato ha
// soglie in GIORNI LAVORATIVI (lun-sab) e un malus giornaliero; superata la
// soglia malus l'importo matura finche' la pratica non viene ri-esitata.
// Episodi persistenti in caller_malus: in_corso → attivo (alla sanatoria) →
// compensato (quando pagato nelle gare di commissioning). I compensati non
// vengono MAI toccati dalla sincronizzazione.
import { supabase } from "@/lib/supabaseClient";

export type RegolaCaller = {
    stato: string;
    giorni_lavorare: number | null;
    giorni_warning: number | null;
    giorni_malus: number | null;
    malus_giorno: number;
    esente: boolean;
};

export type FaseCaller = "ok" | "da_lavorare" | "warning" | "malus";

export async function caricaRegoleCaller(): Promise<Map<string, RegolaCaller>> {
    const m = new Map<string, RegolaCaller>();
    try {
        const { data, error } = await supabase.from("caller_regole").select("*");
        if (error) return m;   // mig. 119 non ancora applicata: nessuna regola
        (data ?? []).forEach((r: Record<string, unknown>) => m.set(String(r.stato), {
            stato: String(r.stato),
            giorni_lavorare: r.giorni_lavorare == null ? null : Number(r.giorni_lavorare),
            giorni_warning: r.giorni_warning == null ? null : Number(r.giorni_warning),
            giorni_malus: r.giorni_malus == null ? null : Number(r.giorni_malus),
            malus_giorno: Number(r.malus_giorno) || 0,
            esente: !!r.esente,
        }));
    } catch { /* rete assente */ }
    return m;
}

const ymdLoc = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const giornoYmd = ymdLoc;

/** Giorni OPERATIVI trascorsi DOPO il giorno `da` fino ad `a` compreso.
 *  Con `operativi` (i giorni in cui il caller ha BADGIATO) conta SOLO quelli:
 *  i caller non seguono lun-sab, il giorno vale se timbrato — anche un minuto
 *  (Luca 31/07). Senza set: fallback lun-sab. */
export function lavorativiDopo(da: Date, a: Date, operativi?: Set<string> | null): number {
    let n = 0;
    const cur = new Date(da.getFullYear(), da.getMonth(), da.getDate());
    const fine = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    while (cur < fine) {
        cur.setDate(cur.getDate() + 1);
        if (operativi ? operativi.has(ymdLoc(cur)) : cur.getDay() !== 0) n++;
    }
    return n;
}

/** IL PRIMO GIORNO IN CUI LA PRATICA È DAVVERO IN MANO AL CALLER (Luca 31/08).
 *  Un appuntamento fissato di domenica, o durante le ferie di chi deve
 *  lavorarlo, non gli arriva quel giorno: gli arriva la prima volta che timbra.
 *  Da lì parte il conto, e QUEL giorno è il giorno in cui la lavora — non un
 *  giorno di ritardo.
 *  `null` = da allora non ha ancora timbrato: la pratica resta sospesa e non
 *  matura niente. Senza il registro dei badge (`operativi` assente) vale il
 *  giorno di riferimento, cioè il comportamento di prima. */
export function primoGiornoBadge(rif: Date, operativi?: Set<string> | null, oggi = new Date()): Date | null {
    if (!operativi) return rif;
    const d = new Date(rif); d.setHours(12, 0, 0, 0);
    const fine = new Date(oggi); fine.setHours(12, 0, 0, 0);
    let guardia = 0;
    while (d <= fine && guardia++ < 500) {
        if (operativi.has(ymdLoc(d))) return new Date(d);
        d.setDate(d.getDate() + 1);
    }
    return null;
}

/** Il giorno che cade `n` giorni operativi dopo `da`; null se col set badge
 *  quei giorni non sono ancora maturati (il malus non e' iniziato). */
export function aggiungiLavorativi(da: Date, n: number, operativi?: Set<string> | null): Date | null {
    const d = new Date(da.getFullYear(), da.getMonth(), da.getDate());
    let rest = n, guardia = 0;
    const oggi = new Date();
    while (rest > 0) {
        d.setDate(d.getDate() + 1);
        if (++guardia > 730) return null;
        if (operativi && d > oggi) return null;   // il futuro non e' mai badgiato
        if (operativi ? operativi.has(ymdLoc(d)) : d.getDay() !== 0) rest--;
    }
    return d;
}

/** FERIE AZIENDALI del call center (caller_ferie, Luca 12/08): insieme dei
 *  giorni "YYYY-MM-DD" in cui il countdown è congelato per tutti. */
export async function caricaFerieCaller(): Promise<Set<string>> {
    const out = new Set<string>();
    try {
        const { data, error } = await supabase.from("caller_ferie").select("dal, al");
        if (error) return out;
        ((data ?? []) as { dal: string; al: string }[]).forEach((r) => {
            const d = new Date(r.dal + "T12:00");
            const fine = new Date(r.al + "T12:00");
            let guardia = 0;
            while (d <= fine && ++guardia < 400) { out.add(ymdLoc(d)); d.setDate(d.getDate() + 1); }
        });
    } catch { /* rete assente */ }
    return out;
}

/** Giorni in cui ogni collaboratore ha BADGIATO l'inizio turno (shifts):
 *  Map nome → insieme di giorni "YYYY-MM-DD". null = tabella non leggibile.
 *  DIRETTORE del telefonico (role direttore_cc — Luca 12/08: «dobbiamo dare
 *  per assodato che badgia dal lunedì al sabato»): set presunto lun-sab al
 *  posto del badge vero, MENO le ferie aziendali (caller_ferie). */
export async function caricaGiorniBadge(finestraGiorni = 120): Promise<Map<string, Set<string>> | null> {
    try {
        const dal = new Date(); dal.setDate(dal.getDate() - finestraGiorni);
        const [{ data, error }, dir, ferie] = await Promise.all([
            supabase.from("shifts").select("employee_name, started_at").gte("started_at", dal.toISOString()).limit(20000),
            supabase.from("app_users").select("id, full_name").eq("role", "direttore_cc").eq("active", true),
            caricaFerieCaller(),
        ]);
        if (error) return null;
        const m = new Map<string, Set<string>>();
        ((data ?? []) as { employee_name: string | null; started_at: string | null }[]).forEach((r) => {
            if (!r.employee_name || !r.started_at) return;
            const d = new Date(r.started_at);
            if (isNaN(d.getTime())) return;
            const set = m.get(r.employee_name) || new Set<string>();
            set.add(ymdLoc(d));
            m.set(r.employee_name, set);
        });
        // FERIE PERSONALI del direttore (Luca 24/08, caso Sheekel): il set
        // presunto lun-sab dava per assodato che fosse sempre presente — ma i
        // caller normali si congelano da soli NON badgiando, lui no. Le sue
        // ferie approvate nella sezione Ferie (vacation_requests) si tolgono
        // dal set, come per il Tracking PDA.
        const dirRows = ((dir.data ?? []) as { id: string; full_name: string | null }[]).filter((u) => u.full_name);
        const feriePers = new Map<string, Set<string>>();
        if (dirRows.length) {
            const { data: vf } = await supabase.from("vacation_requests")
                .select("user_id, date_from, date_to, status, tipo").in("user_id", dirRows.map((u) => u.id));
            ((vf ?? []) as { user_id: string; date_from: string; date_to: string; status: string | null; tipo: string | null }[])
                .filter((f) => /approv/i.test(String(f.status || "")) && String(f.tipo || "ferie") !== "corsi")
                .forEach((f) => {
                    const set = feriePers.get(f.user_id) || new Set<string>();
                    const d = new Date(String(f.date_from).slice(0, 10) + "T12:00");
                    const fine = new Date(String(f.date_to).slice(0, 10) + "T12:00");
                    let guardia = 0;
                    while (d <= fine && ++guardia < 400) { set.add(ymdLoc(d)); d.setDate(d.getDate() + 1); }
                    feriePers.set(f.user_id, set);
                });
        }
        // badge PRESUNTO del direttore: lun-sab su tutta la finestra, ferie
        // aziendali E personali escluse
        for (const u of dirRows) {
            const sue = feriePers.get(u.id);
            const set = new Set<string>();
            const d = new Date(dal.getFullYear(), dal.getMonth(), dal.getDate());
            const oggi = new Date();
            while (d <= oggi) {
                const g = ymdLoc(d);
                if (d.getDay() !== 0 && !ferie.has(g) && !sue?.has(g)) set.add(g);
                d.setDate(d.getDate() + 1);
            }
            m.set(u.full_name as string, set);
        }
        return m;
    } catch { return null; }
}

/** Riferimento dell'invecchiamento: l'ULTIMA attivita' sulla pratica (ultimo
 *  esito o assegnazione); per richiami e appuntamenti la pratica invecchia
 *  solo DOPO la data fissata (finche' il richiamo e' nel futuro non sei in
 *  ritardo). */
export function dataRiferimento(
    c: { data_chiamata?: string; data_richiamo?: string; data_appuntamento?: string; storico?: { data: string }[] },
    stato: string, gruppoRichiamo: readonly string[], gruppoApp: readonly string[],
): Date | null {
    const date: Date[] = [];
    (c.storico || []).forEach((s) => { const d = new Date(s.data); if (!isNaN(d.getTime())) date.push(d); });
    if (c.data_chiamata) { const d = new Date(c.data_chiamata); if (!isNaN(d.getTime())) date.push(d); }
    if (!date.length) return null;
    let rif = new Date(Math.max(...date.map((d) => d.getTime())));
    const dopo = (v?: string) => {
        if (!v) return;
        const d = new Date(v.length === 10 ? v + "T12:00" : v);
        if (!isNaN(d.getTime()) && d > rif) rif = d;
    };
    if (gruppoRichiamo.includes(stato)) dopo(c.data_richiamo);
    if (gruppoApp.includes(stato)) dopo(c.data_appuntamento);
    return rif;
}

export function faseDi(giorni: number, r: RegolaCaller): FaseCaller {
    if (r.esente) return "ok";
    if (r.giorni_malus != null && giorni >= r.giorni_malus) return "malus";
    if (r.giorni_warning != null && giorni >= r.giorni_warning) return "warning";
    if (r.giorni_lavorare != null && giorni >= r.giorni_lavorare) return "da_lavorare";
    return "ok";
}

export type EpisodioCaller = {
    id: number; call_id: string; stato_pratica: string | null; caller: string | null;
    dal: string; al: string | null; giorni: number; importo: number;
    // archiviato (Luca 21/08 sera, come il Tracking PDA): malus di caller
    // LICENZIATI/SOSPESI non recuperati — partita chiusa ma in traccia, si
    // compensa se mai escono crediti a favore della persona
    stato: "in_corso" | "attivo" | "compensato" | "archiviato";
    compensato_il: string | null; compensato_da: string | null;
};

/** Fotografia LIVE di una pratica OGGI in fase malus (call_id → questi dati):
 *  serve all'archivio per mostrare gli episodi in_corso RICALCOLATI al volo
 *  lato client — stessa logica della sync, ma senza scritture (i non-direttori
 *  non scrivono su caller_malus, eppure devono vedere l'archivio coerente col
 *  filtro 💸 Malus della pagina). */
export type MalusLive = { dal: string; giorni: number; importo: number };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Allinea gli episodi alle pratiche: aggiorna gli in_corso, chiude (→ attivo)
 *  quelli delle pratiche sanate, apre i nuovi. Con `fuoriServizio` (nomi dei
 *  caller licenziati/sospesi, Luca 21/08 sera) la loro partita si CHIUDE: gli
 *  episodi non compensati passano ad "archiviato" (gli aperti congelati a
 *  oggi) e non rimaturano piu'; al rientro si torna indietro.
 *  Torna l'archivio aggiornato. */
export async function sincronizzaMalusCaller(
    pratiche: { id: string; stato: string; caller: string; fase: FaseCaller; giorniMalus: number; malusGiorno: number; dalMalus: Date | null }[],
    fuoriServizio?: Set<string>,
    /** LE PRATICHE ASSORBITE non devono lasciare malus (Tommaso, 31/08).
     *  Sono doppioni dello stesso cliente arrivati da un'altra lista: la
     *  sezione le nasconde al caller — giustamente, il cliente l'ha gia'
     *  lavorato sulla riga vinta — ma l'episodio nato prima dell'assorbimento
     *  restava, e la sincronizzazione lo chiudeva come «attivo», cioe' DOVUTO.
     *  Un caller pagava per una pratica che non poteva nemmeno vedere. */
    assorbite?: Set<string>,
    /** IL CLIENTE HA ATTIVATO (Tommaso via Luca, 31/08). Se la persona di
     *  quella pratica ha comprato da noi da quando la pratica esiste, non c'è
     *  nessun lavoro mancato da punire — comunque sia andata la trafila degli
     *  appuntamenti. Serviva perché il ponte vendita↔pratica passa solo
     *  dall'appuntamento e si attraversa una volta sola, alla registrazione
     *  della vendita: se l'appuntamento nasce DOPO (Paola Urso: vendita 08:47,
     *  appuntamento 09:49) o porta una data sbagliata (Paride Massaro: anno
     *  2024), la pratica resta aperta e matura penale su un cliente che ha già
     *  comprato. */
    vendute?: Set<string>,
): Promise<EpisodioCaller[]> {
    try {
        // i tombstone (eliminato=true) sono malus ANNULLATI dal match/backfill:
        // fuori dalla sync e dall'archivio (cantiere match 08/08, mig. 192)
        const { data, error } = await supabase.from("caller_malus").select("*").or("eliminato.is.null,eliminato.eq.false").order("dal", { ascending: false });
        if (error) return [];   // mig. 119 non ancora applicata
        const episodi = (data ?? []) as EpisodioCaller[];
        const oggi = ymd(new Date());
        const eFuori = (nome: string | null | undefined) => !!nome && !!fuoriServizio?.has(nome);
        // `vive` resta INTATTA (il main loop svuota inMalus man mano): serve
        // al giro archiviati per capire se la pratica di un rientrato e'
        // ancora in fase malus (revisione 21/08, rilievo 13)
        const vive = new Map(pratiche.filter((p) => p.fase === "malus" && p.dalMalus && !vendute?.has(p.id)).map((p) => [p.id, p]));
        const inMalus = new Map(vive);
        for (const ep of episodi) {
            // il cliente ha comprato: l'episodio si annulla anche se era già
            // stato CHIUSO come dovuto (è il caso dei 45 € di Tommaso: erano
            // «attivi», cioè da pagare, non «in corso»)
            if (ep.stato !== "compensato" && vendute?.has(ep.call_id)) {
                await supabase.from("caller_malus").update({ eliminato: true, eliminato_il: new Date().toISOString(), eliminato_da: "il cliente ha attivato: la pratica non è un lavoro mancato" }).eq("id", ep.id);
                ep.stato = "attivo"; ep.al = ep.al || oggi;
                inMalus.delete(ep.call_id);
                continue;
            }
            if (ep.stato !== "in_corso") continue;
            const p = inMalus.get(ep.call_id);
            if (p && ymd(p.dalMalus!) === ep.dal) {
                const giorni = Math.max(1, p.giorniMalus);
                const importo = Math.round(giorni * p.malusGiorno * 100) / 100;
                if (giorni !== ep.giorni || importo !== Number(ep.importo) || p.stato !== ep.stato_pratica) {
                    await supabase.from("caller_malus").update({ giorni, importo, stato_pratica: p.stato, caller: p.caller || null }).eq("id", ep.id);
                    ep.giorni = giorni; ep.importo = importo; ep.stato_pratica = p.stato;
                }
                inMalus.delete(ep.call_id);
            } else if (assorbite?.has(ep.call_id)) {
                // il doppione non ha mai avuto una vita propria: l'episodio si
                // annulla (tombstone), non si chiude come dovuto
                await supabase.from("caller_malus").update({ eliminato: true, eliminato_il: new Date().toISOString(), eliminato_da: "pratica assorbita da una gemella" }).eq("id", ep.id);
                ep.stato = "attivo"; ep.al = oggi;   // fuori dall'elenco di ritorno
            } else {
                await supabase.from("caller_malus").update({ stato: "attivo", al: oggi }).eq("id", ep.id);
                ep.stato = "attivo"; ep.al = oggi;
            }
        }
        for (const p of inMalus.values()) {
            const giorni = Math.max(1, p.giorniMalus);
            const importo = Math.round(giorni * p.malusGiorno * 100) / 100;
            const base = { call_id: p.id, stato_pratica: p.stato, caller: p.caller || null, dal: ymd(p.dalMalus!), giorni, importo };
            // caller FUORI SERVIZIO: un malus nuovo nasce GIA' congelato
            // (archiviato, fine=oggi — la traccia resta, la maturazione no) e
            // sul conflitto NON si tocca la riga congelata (DO NOTHING).
            // Altrimenti: niente `stato` nel payload — sul conflitto un
            // episodio gia' chiuso NON viene riaperto, sull'inserimento vale
            // il default in_corso.
            const { data: ins } = eFuori(p.caller)
                ? await supabase.from("caller_malus")
                    .upsert({ ...base, stato: "archiviato", al: oggi }, { onConflict: "call_id,dal", ignoreDuplicates: true })
                    .select().maybeSingle()
                : await supabase.from("caller_malus")
                    .upsert(base, { onConflict: "call_id,dal" })
                    .select().maybeSingle();
            if (ins) {
                const senza = episodi.filter((e) => e.id !== (ins as EpisodioCaller).id);
                senza.unshift(ins as EpisodioCaller);
                episodi.length = 0; episodi.push(...senza);
            }
        }
        // ── GIRO ARCHIVIATI (Luca 21/08 sera, identico al Tracking PDA):
        // fuori servizio → aperti congelati a oggi + chiusi marcati
        // "archiviato"; rientrati → si torna ad "attivo" (i compensati non
        // si toccano MAI).
        if (fuoriServizio) {
            for (const ep of episodi) {
                if (ep.stato === "compensato") continue;
                if (eFuori(ep.caller)) {
                    if (ep.stato !== "archiviato") {
                        const patch = ep.al ? { stato: "archiviato" as const } : { stato: "archiviato" as const, al: oggi };
                        await supabase.from("caller_malus").update(patch).eq("id", ep.id);
                        ep.stato = "archiviato"; if (!ep.al) ep.al = oggi;
                    }
                } else if (ep.stato === "archiviato") {
                    // RIENTRO (revisione 21/08, rilievo 13): pratica ancora in
                    // malus con lo stesso `dal` → l'episodio si RIAPRE (in
                    // corso, fine azzerata) e il main loop riprende ad
                    // aggiornarlo; altrimenti resta chiuso come attivo.
                    const p = vive.get(ep.call_id);
                    if (p && ymd(p.dalMalus!) === ep.dal) {
                        await supabase.from("caller_malus").update({ stato: "in_corso", al: null }).eq("id", ep.id);
                        ep.stato = "in_corso"; ep.al = null;
                    } else {
                        await supabase.from("caller_malus").update({ stato: "attivo" }).eq("id", ep.id);
                        ep.stato = "attivo";
                    }
                }
            }
        }
        return episodi;
    } catch { return []; }
}
