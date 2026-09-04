"use client";

// QUANTE FERIE HANNO ANCORA (Luca 31/08).
//
// «Nella sezione ferie voglio un rendiconto del totale delle ferie di tutti i
// collaboratori: nel momento in cui ci fanno una richiesta, vedere subito
// quali sono i loro giorni residui. Un campo di ricerca libero per il nome, e
// poterli mettere in ordine crescente o decrescente per giorni residui.»
//
// COME SI FA IL NUMERO. Il residuo vero lo dice la busta paga, una volta al
// mese: quello è il punto fermo. Da lì in poi lo tiene il CRM, sottraendo le
// ferie APPROVATE dopo quella data. Così c'è un numero solo da mantenere — e
// resta sempre riconciliabile col cedolino, che è quello che conta se qualcuno
// contesta.
//
// Senza punto fermo non si inventa niente: la riga dice «manca il dato dalla
// busta paga» e mostra comunque i giorni presi, che è già qualcosa.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, ArrowUpDown, Loader2, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { arrotondaGiorni, giornateAssenza, nomeMese } from "@/lib/assenze";

/* I GIORNI COME LI SCRIVE IL CONSULENTE: un decimale, con la virgola.
   L'arrotondamento PER ECCESSO Luca l'ha chiesto per le ORE di assenza (là
   arrotondare in giù vorrebbe dire regalare tempo); un residuo ferie va al
   più vicino, altrimenti la busta dice 4,3 e il CRM dice 4,4. */
const gg = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",").replace(",0", "");
import { cn } from "@/utils";

type Riga = {
    userId: string; nome: string; negozio: string; contratto: string;
    /** confronto fra due buste consecutive: quanto ha aggiunto il consulente */
    controllo: { da: string; a: string; saldoPrima: number; saldoDopo: number; goduto: number; maturato: number } | null;
    puntoFermo: { mese: string; giorni: number; fonte: string } | null;
    presiDopo: number;
    /** di quelli, quanti sono già stati FATTI e quanti solo PRENOTATI */
    fatti: number;
    prenotati: number;
    residuo: number | null;
};

export function DisponibilitaFerie() {
    const { user } = useAuth();
    const [righe, setRighe] = useState<Riga[] | null>(null);
    const [callerFuori, setCallerFuori] = useState(0);
    const [q, setQ] = useState("");
    const [ordine, setOrdine] = useState<"residuo-giu" | "residuo-su" | "nome">("residuo-giu");
    const [bozze, setBozze] = useState<Record<string, string>>({});
    const [salvo, setSalvo] = useState<string | null>(null);
    const [meseNuovo, setMeseNuovo] = useState(() => {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    });
    /* IL MESE GIUSTO È QUELLO CHE HA LE BUSTE, non «il mese scorso». Il primo
       settembre «il mese scorso» è agosto, e le buste archiviate erano di
       luglio: il pannello rispondeva «nessuna busta paga per agosto» e
       sembrava rotto. Si guarda cosa c'è davvero e si parte da lì. */
    const [mesiBuste, setMesiBuste] = useState<string[]>([]);
    useEffect(() => {
        let vivo = true;
        (async () => {
            const { data } = await supabase.from("user_attachments")
                .select("mese").eq("category", "busta_paga").not("mese", "is", null);
            if (!vivo) return;
            const mesi = [...new Set(((data ?? []) as { mese: string }[]).map((r) => String(r.mese).slice(0, 10)))].sort();
            setMesiBuste(mesi);
            if (mesi.length) setMeseNuovo(mesi[mesi.length - 1]);
        })();
        return () => { vivo = false; };
    }, []);

    const carica = useCallback(async () => {
        const [ut, res, fer, fes] = await Promise.all([
            supabase.from("app_users").select("id, full_name, primary_store, role, contract_type").eq("active", true).order("full_name"),
            supabase.from("ferie_residue").select("user_id, mese, giorni, fonte").order("mese", { ascending: false }),
            supabase.from("vacation_requests").select("user_id, employee_name, date_from, date_to, half_day, tipo, status").eq("status", "approved"),
            supabase.from("giorni_festivi").select("giorno"),
        ]);
        const festivi = new Set(((fes.data ?? []) as { giorno: string }[]).map((f) => String(f.giorno).slice(0, 10)));
        /* TUTTE le letture, non solo l'ultima: servono a confrontare due buste
           consecutive e vedere se il consulente ha scalato bene. */
        const storico = new Map<string, { mese: string; giorni: number; fonte: string }[]>();
        for (const r of ((res.data ?? []) as { user_id: string; mese: string; giorni: number; fonte: string }[])) {
            const v = storico.get(r.user_id) || [];
            v.push({ mese: String(r.mese).slice(0, 10), giorni: Number(r.giorni), fonte: r.fonte });
            storico.set(r.user_id, v);
        }
        storico.forEach((v) => v.sort((a, b) => b.mese.localeCompare(a.mese)));
        const fermo = new Map<string, { mese: string; giorni: number; fonte: string }>();
        storico.forEach((v, id) => { if (v[0]) fermo.set(id, v[0]); });
        const utenti = ((ut.data ?? []) as { id: string; full_name: string; primary_store: string | null; contract_type: string | null; role: string | null }[]);
        setCallerFuori(utenti.filter((u) => ["caller", "direttore_cc", "dev", "direttore_generale"].includes(String(u.role || "")) || /amministrator/i.test(String(u.contract_type || ""))).length);
        const perNome = new Map(utenti.map((u) => [String(u.full_name || "").trim().toLowerCase(), u.id]));
        const oggi = new Date();
        const fineOggi = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}-${String(oggi.getDate()).padStart(2, "0")}`;
        /* ⚠️ IL RESIDUO ARRIVA A FINE ANNO, NON A OGGI (Luca 04/09): «se ho un
           dipendente che sulla busta paga di agosto ha nove giorni ma gliene
           ho già approvati cinque a dicembre, tu devi dirmi che ne ha solo
           quattro».
           Prima si contavano solo le ferie GIÀ FATTE: chi aveva giorni
           prenotati in avanti risultava con più residuo di quello vero, e su
           quel numero si concedevano altri giorni che non aveva. Un residuo
           serve a decidere se puoi dire di sì a una richiesta: per quello le
           ferie già approvate contano esattamente come quelle fatte.
           Ci si ferma al 31 dicembre perché quello che si prenota a gennaio
           esce dal monte dell'anno prossimo. */
        const fineAnno = `${oggi.getFullYear()}-12-31`;

        /* ═══ CHI NON STA IN QUESTA LISTA (Luca 01/09) ═══
           Le ferie non le maturano tutti, e chi non le matura non deve
           comparire: un numero accanto al nome, anche zero, fa credere che un
           residuo esista.
           • il CALL CENTER — caller e il loro direttore — è pagato a ore:
             «se non lavorano non hanno compenso», e con la partita IVA
             l'accordo dei 18 giorni non c'è;
           • la DIREZIONE GENERALE e chi prende un compenso da amministratore
             (Marta Perrotta, Franca Arduini): non sono dipendenti, il loro
             tempo non si conta così;
           • lo SVILUPPO (Rahib): non è un collaboratore del negozio.
           Si escludono per RUOLO, non per contratto — Alex Coviello è back
           office del call center ma è assunto a tempo determinato, e le ferie
           ce le ha eccome. */
    const FUORI_RUOLI = ["caller", "direttore_cc", "dev", "direttore_generale"];
    /* ⚠️ I COLLABORATORI ESTERNI (Luca 03/09): «Olivieri e Berdini sono
       esclusi perché sono partite IVA che però non stanno nei negozi, quindi
       sono collaboratori esterni che non hanno ferie nemmeno da accordi».
       Si va per ID e non per regola dedotta dai dati, perché una regola
       sbagliava: Cutrupi non ha un negozio in scheda ma sta sui punti vendita
       tutti i giorni, e Olivieri ce l'ha ma è l'Agenzia, che è un ufficio.
       Un elenco di nomi che si legge è meglio di una formula che sbaglia. */
    const FUORI_PERSONE: string[] = [
        "d65cc2b1-b109-4ab2-9f53-ea8c0fc40519",   // Antonio Olivieri
        "e2bd7241-9589-4657-81ce-14cfbf610f2b",   // Claudio Berdini
    ];
    const fuori = (u: { id?: string; role: string | null; contract_type: string | null }) =>
        FUORI_RUOLI.includes(String(u.role || "")) || FUORI_PERSONE.includes(String(u.id || ""))
        || /amministrator/i.test(String(u.contract_type || ""));
    const out: Riga[] = utenti.filter((u) => !fuori(u)).map((u) => {
            const pf = fermo.get(u.id) || null;
            /* LE FERIE PRESE DOPO IL PUNTO FERMO. Il cedolino di luglio conta
               fino al 31 luglio, quindi si parte dal primo agosto: i giorni di
               luglio sono già dentro il suo numero. */
            let presi = 0, fatti = 0, prenotati = 0;
            if (pf) {
                /* DA QUANDO SI CONTA. Un cedolino di luglio conta fino al 31
                   luglio: si parte dal primo agosto. L'accordo dei partita IVA
                   invece vale per l'ANNO, quindi si conta dal primo gennaio
                   compreso — partire da febbraio regalerebbe le ferie di
                   gennaio. */
                const d0 = new Date(pf.mese + "T12:00");
                if (pf.fonte !== "accordo") d0.setMonth(d0.getMonth() + 1);
                const da = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, "0")}-01`;
                for (const r of ((fer.data ?? []) as Record<string, string>[])) {
                    if (r.tipo === "corso") continue;   // un corso non è ferie
                    const uid = r.user_id || perNome.get(String(r.employee_name || "").trim().toLowerCase());
                    if (uid !== u.id) continue;
                    const gg2 = giornateAssenza(String(r.date_from).slice(0, 10), String(r.date_to).slice(0, 10), da, fineAnno, festivi, !!r.half_day);
                    presi += gg2.reduce((t, g) => t + g.quota, 0);
                    // le due metà servono a schermo: «fatte» e «già prenotate»
                    fatti += gg2.filter((g) => g.giorno <= fineOggi).reduce((t, g) => t + g.quota, 0);
                    prenotati += gg2.filter((g) => g.giorno > fineOggi).reduce((t, g) => t + g.quota, 0);
                }
            }
            /* ═══ IL CONTROLLO SUL CONSULENTE (Luca 01/09) ═══
               «Quando carichiamo le buste di agosto devi fare un check rispetto
               a quello che ti risulta oggi, così verifichiamo anche se il
               consulente del lavoro sta scaricando le ferie in modo giusto».
               Non si può dire «il saldo è sbagliato»: ogni mese matura un
               rateo, e quanto matura lo decide il contratto — è proprio il
               motivo per cui la busta è la fonte. Quello che si può misurare è
               il MATURATO IMPLICITO: quanto il consulente ha aggiunto, una
               volta tolte le ferie che noi sappiamo essere state fatte.
                   maturato = saldo nuovo − saldo vecchio + goduto nel mese
               Se è negativo, o molto lontano da quello degli altri, lì c'è
               qualcosa da chiedere. */
            let controllo: Riga["controllo"] = null;
            const st = (storico.get(u.id) || []).filter((x) => x.fonte === "busta_paga");
            if (st.length >= 2) {
                const nuovo = st[0], vecchio = st[1];
                const d1 = new Date(vecchio.mese + "T12:00"); d1.setMonth(d1.getMonth() + 1);
                const daM = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, "0")}-01`;
                const aM = nuovo.mese.slice(0, 8) + String(new Date(Number(nuovo.mese.slice(0, 4)), Number(nuovo.mese.slice(5, 7)), 0).getDate());
                let goduto = 0;
                for (const r of ((fer.data ?? []) as Record<string, string>[])) {
                    if (r.tipo === "corso") continue;
                    const uid = r.user_id || perNome.get(String(r.employee_name || "").trim().toLowerCase());
                    if (uid !== u.id) continue;
                    goduto += giornateAssenza(String(r.date_from).slice(0, 10), String(r.date_to).slice(0, 10), daM, aM, festivi, !!r.half_day)
                        .reduce((t, g) => t + g.quota, 0);
                }
                controllo = {
                    da: vecchio.mese, a: nuovo.mese,
                    saldoPrima: vecchio.giorni, saldoDopo: nuovo.giorni,
                    goduto: Math.round(goduto * 10) / 10,
                    maturato: Math.round((nuovo.giorni - vecchio.giorni + goduto) * 10) / 10,
                };
            }

            return {
                userId: u.id, nome: u.full_name, negozio: u.primary_store || "", contratto: u.contract_type || "", controllo,
                puntoFermo: pf, presiDopo: arrotondaGiorni(presi),
                fatti: arrotondaGiorni(fatti), prenotati: arrotondaGiorni(prenotati),
                // il residuo NON si arrotonda per eccesso: si mostra a un decimale
                residuo: pf ? Math.round((pf.giorni - presi) * 10) / 10 : null,
            };
        });
        setRighe(out);
    }, []);
    useEffect(() => { carica(); }, [carica]);

    const salva = async (userId: string) => {
        const v = String(bozze[userId] ?? "").replace(",", ".").trim();
        if (!v || !Number.isFinite(Number(v))) return;
        setSalvo(userId);
        await supabase.from("ferie_residue").upsert({
            user_id: userId, mese: meseNuovo, giorni: Number(v),
            fonte: "manuale", inserito_da: user?.name || null,
        }, { onConflict: "user_id,mese" });
        setBozze((p) => ({ ...p, [userId]: "" }));
        setSalvo(null);
        carica();
    };

    /* ═══ I PARTITA IVA (Luca 01/09) ═══
       «Hanno 18 giorni all'anno in accordo con noi»: non hanno busta paga,
       quindi il loro punto fermo non si legge da nessuna parte — si scrive.
       Vale per l'anno solare: 18 giorni al primo gennaio, meno quelli fatti.
       Se domani l'accordo cambia, si cambia il numero e si ricarica. */
    const GIORNI_PIVA = 18;
    const annoIso = `${new Date().getFullYear()}-01-01`;
    const [caricoPiva, setCaricoPiva] = useState(false);
    const pivaSenza = useMemo(() => (righe ?? []).filter((r) =>
        /partita\s*iva/i.test(r.contratto) && (!r.puntoFermo || r.puntoFermo.mese.slice(0, 4) !== annoIso.slice(0, 4))), [righe, annoIso]);
    const caricaPiva = async () => {
        if (!pivaSenza.length) return;
        setCaricoPiva(true); setEsitoLettura(null);
        const { error } = await supabase.from("ferie_residue").upsert(pivaSenza.map((r) => ({
            user_id: r.userId, mese: annoIso, giorni: GIORNI_PIVA, fonte: "accordo",
            note: `${GIORNI_PIVA} giorni all'anno per accordo (partita IVA) — ${annoIso.slice(0, 4)}`,
        })), { onConflict: "user_id,mese" });
        setCaricoPiva(false);
        setEsitoLettura(error ? `⛔ ${error.message}`
            : `✅ Caricati ${GIORNI_PIVA} giorni a ${pivaSenza.length} ${pivaSenza.length === 1 ? "collaboratore" : "collaboratori"} con partita IVA. Le ferie già fatte quest'anno sono scalate.`);
        if (!error) await carica();
    };

    const [leggo, setLeggo] = useState(false);
    const [esitoLettura, setEsitoLettura] = useState<string | null>(null);
    type EsitoBusta = { persona: string; file: string; giorni: number | null; motivo?: string; contesto?: string[] };
    const [esiti, setEsiti] = useState<EsitoBusta[] | null>(null);
    /* PRIMA SI GUARDA, POI SI SCRIVE. Il lettore del PDF può sbagliare numero
       senza dare errore: se scrive e basta, un residuo falso entra in silenzio
       e nessuno lo rivede più. Con `dryRun` il giro si fa a vuoto e mostra chi
       ha letto cosa; il secondo tasto scrive quello che hai appena letto. */
    const leggiBuste = async (scrivi: boolean) => {
        setLeggo(true); setEsitoLettura(null);
        try {
            const r = await fetch("/api/ferie/leggi-buste", {
                method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mese: meseNuovo, dryRun: !scrivi }),
            }).then((x) => x.json());
            setEsiti(Array.isArray(r?.esiti) ? r.esiti : null);
            setEsitoLettura(r?.error ? `⛔ ${r.error}`
                : r.buste === 0 ? `Nessuna busta paga archiviata per ${nomeMese(meseNuovo)}.`
                    + (mesiBuste.length ? ` Ce ne sono per: ${mesiBuste.map(nomeMese).join(", ")} — cambia la mensilità qui accanto.` : " Caricale dalla scheda della persona.")
                    : `📄 ${scrivi ? "Scritte" : "Lette in prova"} ${r.letti} buste paga su ${r.buste}`
                        + (r.nonLetti ? ` — ${r.nonLetti} senza un riquadro RATEI leggibile, quelle vanno scritte a mano` : "")
                        + (r.doppie?.length ? ` · ATTENZIONE: ${r.doppie.join(", ")} ${r.doppie.length === 1 ? "ha" : "hanno"} due buste su questo mese, ho tenuto l'ultima letta` : "")
                        + (scrivi ? "." : " — controlla i numeri qui sotto, poi conferma."));
            if (scrivi) await carica();
        } catch (e) {
            setEsitoLettura("⛔ " + (e instanceof Error ? e.message : "lettura non riuscita"));
        }
        setLeggo(false);
    };

    /* le persone con due letture consecutive, e quanto matura di norma il
       gruppo: la mediana regge meglio della media quando uno solo è sballato */
    const controllo = useMemo(() => {
        const righeC = (righe ?? []).filter((r) => r.controllo);
        const val = righeC.map((r) => r.controllo!.maturato).sort((a, b) => a - b);
        const mediana = val.length ? (val.length % 2 ? val[(val.length - 1) / 2] : (val[val.length / 2 - 1] + val[val.length / 2]) / 2) : null;
        righeC.sort((a, b) => {
            const sa = mediana == null ? 0 : Math.abs(a.controllo!.maturato - mediana);
            const sb = mediana == null ? 0 : Math.abs(b.controllo!.maturato - mediana);
            return sb - sa;
        });
        return { righe: righeC, mediana };
    }, [righe]);

    const viste = useMemo(() => {
        const s = q.trim().toLowerCase();
        const f = (righe || []).filter((r) => !s || r.nome.toLowerCase().includes(s) || r.negozio.toLowerCase().includes(s));
        const n = (x: number | null) => (x == null ? Number.NEGATIVE_INFINITY : x);
        if (ordine === "nome") return [...f].sort((a, b) => a.nome.localeCompare(b.nome));
        return [...f].sort((a, b) => (ordine === "residuo-giu" ? n(b.residuo) - n(a.residuo) : n(a.residuo) - n(b.residuo)) || a.nome.localeCompare(b.nome));
    }, [righe, q, ordine]);

    const senzaDato = (righe || []).filter((r) => !r.puntoFermo).length;

    return (
        <div className="space-y-3">
            <div className="glass-card p-3 rounded-xl flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca un collaboratore o un negozio…"
                        className="glass-input w-full text-sm !pl-9" />
                </div>
                <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                    {([["residuo-giu", "Più ferie"], ["residuo-su", "Meno ferie"], ["nome", "A → Z"]] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setOrdine(k)}
                            className={cn("px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap",
                                ordine === k ? "bg-indigo-500/25 text-indigo-200" : "text-slate-500 hover:text-slate-300")}>
                            <ArrowUpDown className="w-3 h-3 inline -mt-0.5 mr-1" />{l}
                        </button>
                    ))}
                </div>
                {/* IL NUMERO STA DENTRO LA BUSTA PAGA (Luca 31/08): «giù in basso
                    sulle buste paga hai sempre il saldo ferie». Infatti — riquadro
                    RATEI, riga FERIE, colonna Saldo, in giorni. Questo bottone le
                    apre tutte e lo scrive, invece di farlo battere a mano. */}
                <button onClick={() => leggiBuste(false)} disabled={leggo}
                    title={`Apre le buste paga di ${nomeMese(meseNuovo)} e mostra il saldo ferie che legge, SENZA scrivere niente`}
                    className="px-3 py-2 rounded-xl text-[11px] font-bold bg-sky-500/15 border border-sky-500/40 text-sky-300 hover:bg-sky-500/25 disabled:opacity-40 whitespace-nowrap flex items-center gap-1.5">
                    {leggo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "👁"} Leggi in prova
                </button>
                {pivaSenza.length > 0 && (
                    <button onClick={caricaPiva} disabled={caricoPiva}
                        title={`Scrive ${GIORNI_PIVA} giorni al ${annoIso.slice(0, 4)} a chi ha partita IVA: ` + pivaSenza.map((r) => r.nome).join(", ")}
                        className="px-3 py-2 rounded-xl text-[11px] font-bold bg-violet-500/15 border border-violet-500/40 text-violet-200 hover:bg-violet-500/25 disabled:opacity-40 whitespace-nowrap flex items-center gap-1.5">
                        {caricoPiva ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "🧾"} {GIORNI_PIVA} giorni ai partita IVA ({pivaSenza.length})
                    </button>
                )}
                {esiti && esiti.some((e) => e.giorni != null) && (
                    <button onClick={() => leggiBuste(true)} disabled={leggo}
                        title="Scrive i numeri che hai appena visto nella tabella dei residui"
                        className="px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40 whitespace-nowrap flex items-center gap-1.5">
                        {leggo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "📄"} Scrivi questi {esiti.filter((e) => e.giorni != null).length} residui
                    </button>
                )}
                {mesiBuste.length > 1 && (
                    <div className="flex gap-1">
                        {mesiBuste.slice(-4).map((m) => (
                            <button key={m} onClick={() => setMeseNuovo(m)}
                                title={`Le buste paga archiviate di ${nomeMese(m)}`}
                                className={cn("px-2.5 py-1.5 rounded-lg text-[10px] font-bold border",
                                    meseNuovo === m ? "border-sky-400/60 bg-sky-500/20 text-sky-100" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                {nomeMese(m)}
                            </button>
                        ))}
                    </div>
                )}
                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    mensilità
                    <input type="month" value={meseNuovo.slice(0, 7)} onChange={(e) => setMeseNuovo(e.target.value ? `${e.target.value}-01` : meseNuovo)}
                        title="Il mese del cedolino da cui viene il residuo che stai scrivendo"
                        className="glass-input !h-9 px-2 text-xs normal-case font-normal tracking-normal" />
                </label>
            </div>

            {esitoLettura && (
                <p className={`text-[11px] rounded-lg px-3 py-2 border ${esitoLettura.startsWith("⛔") ? "text-rose-200 bg-rose-500/10 border-rose-500/25" : "text-emerald-200 bg-emerald-500/10 border-emerald-500/25"}`}>{esitoLettura}</p>
            )}
            {esiti && esiti.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-1 max-h-[220px] overflow-y-auto">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Che cosa ho letto in ogni busta paga</p>
                    {esiti.map((e, i) => (
                        <div key={i} className="flex items-baseline gap-2 text-[11px]">
                            <span className="text-slate-200 truncate flex-1 min-w-0">{e.persona}</span>
                            <span className="text-slate-600 truncate max-w-[180px] hidden md:block" title={e.file}>{e.file}</span>
                            {e.giorni != null
                                ? <span className={`font-black tabular-nums ${e.giorni < 0 ? "text-rose-300" : "text-emerald-300"}`}>{gg(e.giorni)} gg</span>
                                : <span className="text-amber-300/80 truncate max-w-[240px]" title={e.motivo}>non letto — {e.motivo || "riquadro RATEI non trovato"}</span>}
                        </div>
                    ))}
                    {esiti.some((e) => e.contesto?.length) && (
                        <details className="mt-2">
                            <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-300">Com&apos;è fatto il cedolino che non si legge (da mandare a chi sviluppa)</summary>
                            {esiti.filter((e) => e.contesto?.length).slice(0, 3).map((e, i) => (
                                <pre key={i} className="mt-1 text-[10px] text-slate-400 bg-black/40 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap">{e.persona + "\n" + (e.contesto || []).join("\n")}</pre>
                            ))}
                        </details>
                    )}
                </div>
            )}
            {/* ═══ IL CONTROLLO SUL CONSULENTE ═══
                Compare da solo quando ci sono due buste consecutive lette. Non
                dice «è sbagliato»: dice quanto ha aggiunto il consulente una
                volta tolte le ferie che risultano a noi, e mette in cima chi
                si discosta dagli altri. Il giudizio resta a chi legge. */}
            {controllo.righe.length > 0 && (
                <div className="glass-card p-4 space-y-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                        <p className="text-[12px] font-black text-white">🔎 Controllo sulle buste paga</p>
                        <span className="text-[11px] text-slate-500">
                            da {nomeMese(controllo.righe[0].controllo!.da)} a {nomeMese(controllo.righe[0].controllo!.a)} ·
                            {" "}{controllo.righe.length} {controllo.righe.length === 1 ? "persona" : "persone"}
                            {controllo.mediana != null ? ` · di norma matura ${gg(controllo.mediana)} gg al mese` : ""}
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                        <b className="text-slate-400">Maturato</b> = saldo nuovo − saldo vecchio + ferie fatte nel mese, secondo il CRM.
                        Non si può dire quanto <i>dovrebbe</i> maturare — lo decide il contratto — ma un maturato negativo,
                        o molto lontano da quello degli altri, è il segno che qualcosa non torna: o il consulente ha scalato
                        giorni che non risultano, o a noi manca una richiesta di ferie.
                    </p>
                    <div className="max-h-[220px] overflow-y-auto space-y-1">
                        {controllo.righe.map((r) => {
                            const c = r.controllo!;
                            const strano = c.maturato < 0 || (controllo.mediana != null && Math.abs(c.maturato - controllo.mediana) > 1);
                            return (
                                <div key={r.userId} className={cn("flex flex-wrap items-baseline gap-2 text-[11.5px] rounded-lg px-2 py-1",
                                    strano ? "bg-amber-500/10 border border-amber-400/25" : "")}>
                                    <span className="text-slate-200 font-semibold flex-1 min-w-[150px]">{r.nome}</span>
                                    <span className="text-slate-500">{gg(c.saldoPrima)} → <b className="text-slate-300">{gg(c.saldoDopo)}</b></span>
                                    <span className="text-slate-500">ferie nostre <b className="text-slate-300">{gg(c.goduto)}</b></span>
                                    <span className={cn("font-black", c.maturato < 0 ? "text-rose-300" : strano ? "text-amber-300" : "text-emerald-300")}>
                                        maturato {gg(c.maturato)}
                                    </span>
                                    {strano && <span className="text-amber-300/80">← da chiedere</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {callerFuori > 0 && (
                <p className="text-[11px] text-slate-500 leading-relaxed">
                    🎧 {callerFuori} persone non sono in elenco: il <b>call center</b> (pagato a ore: chi non lavora non
                    matura ferie, né da assunto né con la partita IVA), la <b>direzione generale</b> e chi prende un compenso
                    da amministratore, e lo <b>sviluppo</b>. Alex Coviello resta: è back office, ma è assunto.
                </p>
            )}
            {senzaDato > 0 && (
                <p className="text-[11px] text-amber-100 bg-amber-500/10 border border-amber-400/30 rounded-lg px-3 py-2">
                    ⚠️ Per {senzaDato} {senzaDato === 1 ? "collaboratore manca" : "collaboratori manca"} il residuo di partenza. Chi ha la <b>partita IVA</b> non ha busta paga: per loro c&apos;è il tasto dei {GIORNI_PIVA} giorni. Per gli altri premi <b>«Leggi in prova»</b>: il saldo sta nel riquadro RATEI del cedolino di <b>{nomeMese(meseNuovo)}</b>. Chi non ha la busta archiviata si scrive a mano qui a fianco.
                </p>
            )}

            {!righe ? (
                <div className="flex justify-center py-10 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : (
                <div className="glass-card rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 text-left border-b border-white/5">
                                <th className="py-2.5 px-3">Collaboratore</th>
                                <th className="py-2.5 px-2">Negozio</th>
                                <th className="py-2.5 px-2 text-right">Da busta paga</th>
                                <th className="py-2.5 px-2 text-right" title="Ferie approvate dopo il punto di partenza: quelle già fatte più quelle già approvate per i mesi che verranno">Scalate</th>
                                <th className="py-2.5 px-2 text-right" title="Quanti giorni può ancora chiedere da qui a fine anno: dal punto di partenza tolte le ferie fatte E quelle già approvate">Ancora disponibili</th>
                                <th className="py-2.5 px-2 w-[190px]">Aggiorna da cedolino</th>
                            </tr>
                        </thead>
                        <tbody>
                            {viste.map((r) => (
                                <tr key={r.userId} className="border-t border-white/5 hover:bg-white/[0.02]">
                                    <td className="py-2 px-3 font-semibold text-slate-100">{r.nome}</td>
                                    <td className="py-2 px-2 text-slate-400 text-xs">{r.negozio || "—"}</td>
                                    <td className="py-2 px-2 text-right text-slate-300 tabular-nums">
                                        {r.puntoFermo ? (
                                            <span title={r.puntoFermo.fonte === "accordo"
                                                ? `${GIORNI_PIVA} giorni all'anno per accordo (partita IVA), dal ${nomeMese(r.puntoFermo.mese)}`
                                                : `Residuo dichiarato dalla busta paga di ${nomeMese(r.puntoFermo.mese)}${r.puntoFermo.fonte === "manuale" ? " (scritto a mano)" : ""}`}>
                                                {gg(r.puntoFermo.giorni)}
                                                <span className="text-[10px] text-slate-600 ml-1">
                                                    {r.puntoFermo.fonte === "accordo" ? "accordo" : nomeMese(r.puntoFermo.mese).slice(0, 3)}
                                                </span>
                                            </span>
                                        ) : <span className="text-amber-300/80 text-xs">manca</span>}
                                    </td>
                                    <td className="py-2 px-2 text-right text-slate-400 tabular-nums">
                                        {r.puntoFermo ? (r.presiDopo ? (
                                            <span title={r.prenotati
                                                ? `${gg(r.fatti)} già fatte · ${gg(r.prenotati)} approvate ma ancora da fare`
                                                : "tutte già fatte"}>
                                                {gg(r.presiDopo)}
                                                {/* i giorni già APPROVATI ma non ancora fatti si vedono a parte:
                                                    sono scalati dal residuo, e chi guarda deve sapere perché */}
                                                {!!r.prenotati && <span className="text-[10px] text-amber-300/80 ml-1">di cui {gg(r.prenotati)} da fare</span>}
                                            </span>
                                        ) : "—") : "—"}
                                    </td>
                                    <td className={cn("py-2 px-2 text-right font-black tabular-nums",
                                        r.residuo == null ? "text-slate-600" : r.residuo <= 0 ? "text-rose-300" : r.residuo <= 5 ? "text-amber-300" : "text-emerald-300")}>
                                        {r.residuo == null ? "—" : gg(r.residuo)}
                                    </td>
                                    <td className="py-2 px-2">
                                        <div className="flex items-center gap-1">
                                            <input value={bozze[r.userId] ?? ""} onChange={(e) => setBozze((p) => ({ ...p, [r.userId]: e.target.value }))}
                                                onKeyDown={(e) => { if (e.key === "Enter") salva(r.userId); }}
                                                placeholder="giorni" inputMode="decimal"
                                                className="glass-input !h-7 !px-2 text-[11px] w-[80px]" />
                                            <button onClick={() => salva(r.userId)} disabled={!bozze[r.userId] || salvo === r.userId}
                                                title={`Salva il residuo di ${nomeMese(meseNuovo)}`}
                                                className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-30">
                                                {salvo === r.userId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!viste.length && <tr><td colSpan={6} className="py-8 text-center text-slate-600 text-xs">Nessun collaboratore trovato.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="text-[10px] text-slate-600 px-1">
                Il residuo di oggi è quello della busta paga meno le ferie approvate dal mese successivo in poi (i corsi non contano). Ogni nuova busta paga ritara il conto.
            </p>
        </div>
    );
}
