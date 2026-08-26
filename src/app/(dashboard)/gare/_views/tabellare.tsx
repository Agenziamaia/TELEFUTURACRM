"use client";

// TABELLARE PAY dentro Gare → operatore (Luca 11/08: "andava integrata nella
// sezione GARE che esiste già, ognuno dentro il proprio operatore" — prima
// viveva in Amministrazione → Tabellari Gare). Mese e lato arrivano dalla
// pagina Gare (barra mese + tab Azienda/Ragazzi): qui solo l'editor di
// pay_piste / pay_soglie / pay_righe — la fonte del Calcolatore $$$ e del
// motore commissioning. Le soglie si scrivono come le pensa Luca: solo il
// "da S1..Sn", il fino-a si ricava da solo. Un brand con SOLO il lato azienda
// deriva il ragazzi con la "% ai ragazzi" di ogni pista.
import { Fragment, useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { dbError, notify } from "../../amministrazione/_views/toast";

type Pista = { id: string; chiave: string; nome: string; um: string; ordine: number; perc_ragazzi: number | null; soglie_pct?: number | null; soglie_max?: number | null };
type Soglia = { id?: string; pista: string; tier: number; soglia_da: number; soglia_a: number | null; bonus?: number | null };
type Riga = {
    id: string; pista: string | null; nome: string;
    tipo_cliente: string | null; categoria: string | null; prodotto: string | null; offerta: string | null;
    // condizione a OPZIONE (es. le combo «+ Protect», i telefoni fascia|modalità):
    // solo lettura qui — si vede nel tooltip-ancora, si edita da DB/runner
    opzione?: string | null;
    brand_vendita: string | null; moltiplicatore?: boolean; componente?: string | null; punti: number; pay_base: number | null; pay_tiers: number[];
    gettone: boolean; attivo: boolean; note: string | null; ordine: number;
    // S4 (Luca 25/08): ricorrente €/pezzo/mese informativo (dall'8° mese dal
    // contratto) + € fissi ai ragazzi per soglia (vincono su % e mappa)
    ricorrente?: number | null; pay_ragazzi_tiers?: number[] | null;
    // metadati del DERIVATO ragazzi (solo vista, mai a DB): originali azienda
    // e % di pista — alimentano il tooltip «azienda × % = pay» (Luca 25/08).
    // _mappaTiers: quando la pista ha la mappa % per soglia (pay girato),
    // per ogni colonna la % usata, la soglia azienda di provenienza e il
    // valore originale — la bolla racconta quello.
    _origBase?: number | null; _origTiers?: number[]; _perc?: number;
    _mappaTiers?: ({ perc: number; loro: number; orig: number } | null)[] | null;
};

const BRAND_VENDITA = ["windtre", "vodafone", "fastweb", "sky", "tim", "iliad", "very", "ho", "kena", "s4", "dojo", "kipoint"];
const inputCls = "bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1 text-sm text-white w-20 text-right";
const num = (v: string): number => {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
};
// chiave d'ANCORA di una riga pay (le stesse condizioni che guarda il motore):
// serve ad appaiare la voce dei ragazzi con quella azienda quando i due lati
// hanno tabellari propri (Vodafone)
// brand_vendita e provenienza INCLUSI (revisore 26/08: senza, su Vodafone 10
// ancore collidevano — «Mobile Start · Ric.Auto GA» e «· Wallet GA» hanno le
// stesse condizioni e la bolla mostrava il riferimento sbagliato)
const chiaveAncora = (r: Record<string, unknown>) =>
    ["pista", "tipo_cliente", "categoria", "prodotto", "offerta", "opzione", "brand_vendita", "provenienza"]
        .map(k => String(r[k] ?? "").trim().toLowerCase()).join("|");

/* VARIANTI DI UN'OFFERTA (Luca 26/08: «adottiamo lo stile del commissioning
   Wind3 ovunque ci siano variabili rispetto a un'offerta, per tutti i brand»).
   Le righe che condividono l'OFFERTA si raccolgono sotto un titolo e ognuna
   mostra solo ciò che la distingue — la modalità di acquisizione — come
   pillola: si legge a colpo d'occhio come cambia il pay al variare di GA/MNP,
   ricarica pura/automatica, FTTC/FTTH… Ambra per le acquisizioni da altro
   operatore (MNP/GNP/Tied), grigia per le altre. */
type Gruppo<T> = { titolo: string | null; righe: { r: T; variante: string | null }[] };
function raggruppaPerOfferta<T extends { id: string; nome: string; offerta: string | null; categoria: string | null; prodotto: string | null; opzione?: string | null; ordine: number }>(righe: T[]): Gruppo<T>[] {
    const out: Gruppo<T>[] = [];
    const idx = new Map<string, Gruppo<T>>();
    for (const r of righe) {
        const off = String(r.offerta || "").trim();
        // senza offerta (o offerta unica nel suo gruppo) resta una riga sola
        const k = off ? `o|${off.toLowerCase()}` : `r|${r.id}`;
        let g = idx.get(k);
        if (!g) { g = { titolo: off || null, righe: [] }; idx.set(k, g); out.push(g); }
        g.righe.push({ r, variante: null });
    }
    const CAMPI = ["tipo_cliente", "categoria", "prodotto", "opzione", "brand_vendita", "provenienza"] as const;
    for (const g of out) {
        if (g.righe.length < 2) { g.titolo = null; continue; }   // gruppo di uno: riga normale
        // si mostra SOLO ciò che varia dentro il gruppo: se tutte le righe
        // hanno la stessa categoria, dirla su ognuna sarebbe rumore
        const varia = CAMPI.filter(k => new Set(g.righe.map(v => String((v.r as Record<string, unknown>)[k] ?? "").toLowerCase())).size > 1);
        for (const v of g.righe) {
            // solo i valori presenti: un campo vuoto vuol dire «vale comunque»,
            // scriverlo allungherebbe la pillola senza aggiungere nulla
            const daiCampi = varia
                .map(k => String((v.r as Record<string, unknown>)[k] ?? "").trim().replace(/^Mobile\s+/i, ""))
                .filter(Boolean).join(" · ")
                || (varia.length ? "base" : "");   // la riga liscia dell'offerta
            // fallback: il nome meno il nome dell'offerta (le righe che si
            // distinguono solo per etichetta), poi il nome intero
            const senzaOff = v.r.nome.replace(new RegExp(`^\\s*${(g.titolo || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[·:-]?\\s*`, "i"), "").trim();
            v.variante = daiCampi || (senzaOff && senzaOff !== v.r.nome ? senzaOff : "") || v.r.nome;
        }
        // se le etichette risultassero uguali fra loro (righe gemelle), meglio
        // tornare ai nomi interi che mostrare due pillole identiche
        if (new Set(g.righe.map(v => v.variante)).size < g.righe.length) {
            for (const v of g.righe) v.variante = v.r.nome;
        }
    }
    return out;
}
const pillolaVariante = (label: string) => /\b(mnp|gnp|tied)\b/i.test(label) && !/untied/i.test(label)
    ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
    : "border-white/10 bg-white/[0.04] text-slate-300";

// formato importi dei tooltip di derivazione (it-IT, max 2 decimali)
const eurIt = (v: number | null | undefined) => v == null ? "—" : Number(v).toLocaleString("it-IT", { maximumFractionDigits: 2 });

// BOLLA DI DERIVAZIONE (Luca 25/08: «il title nativo è orrendo — fatela come
// su Wind3»): stessa bolla del Commissioning W3 — pannello scuro immediato
// sopra la cella, righe tipizzate (formula bianca, voci grigie, note ambra,
// totale verde). In PORTAL sul body: il backdrop-filter dei glass-panel
// rompe il position:fixed dei discendenti (baco già visto sul W3 il 14/08).
type TipRiga = { testo: string; stile: "formula" | "voce" | "flat" | "tot" };
function useBolla() {
    const [tip, setTip] = useState<{ x: number; y: number; righe: TipRiga[] } | null>(null);
    const mostra = (e: ReactMouseEvent, righe: TipRiga[] | null) => {
        if (!righe || !righe.length) return;
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setTip({ x: r.left + r.width / 2, y: r.top, righe });
    };
    const nascondi = () => setTip(null);
    const bolla = tip && typeof document !== "undefined" ? createPortal(
        <div className="fixed z-50 -translate-x-1/2 -translate-y-full pointer-events-none" style={{ left: tip.x, top: tip.y - 8 }}>
            <div className="rounded-xl border border-white/15 bg-slate-900/95 shadow-2xl px-3 py-2 text-[11px] leading-relaxed whitespace-nowrap">
                {tip.righe.map((x, i) => (
                    <div key={i} className={
                        x.stile === "formula" ? "font-bold text-white text-[12px]" :
                            x.stile === "tot" ? "font-bold text-emerald-300 border-t border-white/10 mt-1 pt-1" :
                                x.stile === "flat" ? "text-amber-300" : "text-slate-400"
                    }>{x.testo}</div>
                ))}
            </div>
        </div>,
        document.body,
    ) : null;
    return { mostra, nascondi, bolla };
}

export function TabellareEditor({ ctx, mese, lato, colore, vaiAzienda, onVuoto, nascondiVuoto, nascondiSoglie, soloRegole }: {
    ctx: string; mese: string; lato: "ragazzi" | "azienda"; colore: string; vaiAzienda?: () => void;
    // W3 azienda (Luca 14/08): la tabella soglie di rete vive nella tabella
    // target del pannello negozi — qui si nasconde per non avere doppioni
    nascondiSoglie?: boolean;
    // W3 azienda (Luca 14/08 sera-3): qui restano SOLO le regole della
    // matematica (componenti mobile/fisso, moltiplicatori+punti assicurazioni,
    // partnership) — i gettoni one-shot (Luce&Gas, Customer Base, business,
    // telefoni) vivono editabili nel Commissioning
    soloRegole?: boolean;
    // a tabellare ASSENTE non mostrare la card vuota (confondeva: sotto ci sono
    // le tabelle dello schema esistente — caso W3 azienda, Luca 11/08): la
    // creazione si apre dal link discreto della pagina Gare
    nascondiVuoto?: boolean;
    // true quando il tabellare di questo lato non esiste (e non è nemmeno un
    // ragazzi derivato dall'azienda): la pagina Gare mostra allora lo schema
    // gare precedente da solo, senza far sparire i dati già impostati (Luca 11/08)
    onVuoto?: (v: boolean) => void;
}) {
    const monthISO = `${mese}-01`;
    const [piste, setPiste] = useState<Pista[]>([]);
    const [soglie, setSoglie] = useState<Soglia[]>([]);          // copia editabile
    const [soglieDirty, setSoglieDirty] = useState<Set<string>>(new Set());   // per pista
    // le QUOTE di derivazione nel banner del derivato sono solo per la
    // direzione (Luca 25/08: i ragazzi non devono vedere le %)
    const { user } = useAuth();
    const vedeQuote = user?.role === "admin" || user?.role === "dev";
    // chiavi delle piste che il lato ragazzi possiede in proprio (statico):
    // su quelle la % di derivazione non agisce — caselle nascoste
    const [pisteRagazziKeys, setPisteRagazziKeys] = useState<Set<string>>(new Set());
    // sezioni-pista RACCOLTE all'ingresso (Luca 25/08, screenshot del
    // Commissioning W3: «si devono chiudere e si possono esplodere,
    // dall'esterno vedo quante voci ne fanno parte») — vale per tutti i
    // brand che usano il tabellare (VF in testa)
    const [aperteTab, setAperteTab] = useState<Set<string>>(new Set());
    const toggleTab = (k: string) => setAperteTab(prev => { const c = new Set(prev); if (c.has(k)) c.delete(k); else c.add(k); return c; });
    // EMOJI di pista (Luca 25/08: «come su Wind3») — dalla semantica del
    // nome, senza toccare i dati; famiglia + 💼 quando è business
    const emojiPista = (nome: string): string => {
        const n = String(nome || "").toLowerCase();
        const fam =
            /mobile|\bsim\b/.test(n) ? "📱" :
            /wireline|fisso|fwa/.test(n) ? "🏠" :
            /smartphone|telefon|device/.test(n) ? "📞" :
            /\bvas\b|soluzioni|digital/.test(n) ? "🧩" :
            /luce/.test(n) ? "💡" :
            /\bgas\b/.test(n) ? "🔥" :
            /energia/.test(n) ? "⚡" :
            /bonus|completezza/.test(n) ? "🎁" :
            /assicur/.test(n) ? "🛡" :
            /protetti/.test(n) ? "🏠🛡" :
            /customer|\bcb\b/.test(n) ? "🔁" :
            /partnership/.test(n) ? "🏅" :
            /sky|\btv\b/.test(n) ? "📺" :
            /\bpos\b|dojo/.test(n) ? "💳" :
            /sped/.test(n) ? "📦" : "📊";
        return /business|\bbiz\b|p\.?\s*iva/.test(n) && fam !== "📊" ? `${fam}💼` : fam;
    };
    const [righe, setRighe] = useState<Riga[]>([]);
    const [orig, setOrig] = useState<Map<string, string>>(new Map());   // id → JSON per il dirty
    const [carico, setCarico] = useState(false);
    const [aziendaEsiste, setAziendaEsiste] = useState(false);
    // lato ragazzi DERIVATO (Luca 11/08): quando il ragazzi non ha un suo
    // tabellare ma l'azienda sì, si mostra COMPILATO (azienda × % ai ragazzi),
    // in sola lettura — l'editing vive sul lato azienda.
    const [derivato, setDerivato] = useState<{ piste: Pista[]; soglie: Soglia[]; righe: Riga[] } | null>(null);
    const [nuovaRigaPer, setNuovaRigaPer] = useState<string | null>(null);   // chiave pista | "__gettoni"
    // % SCOSTAMENTO SOGLIE (Luca 13/08, VF): pista ragazzi con soglie_pct =
    // le soglie si derivano dall'azienda × pct (arrotondate) e qui si vedono
    // in sola lettura; il riferimento azienda serve per l'anteprima
    const [aziendaRef, setAziendaRef] = useState<{ piste: { chiave: string; ordine: number; soglie_pct: number | null }[]; soglie: Soglia[] } | null>(null);
    // righe AZIENDA indicizzate: riferimento della bolla quando il lato
    // ragazzi ha un tabellare PROPRIO (VF) — lì non c'è derivazione, quindi
    // la bolla confronta i due importi e dice la quota che ne esce
    const [azRighe, setAzRighe] = useState<Map<string, { base: number | null; tiers: number[] }> | null>(null);
    const azDi = (r: Riga) => azRighe?.get(`n|${String(r.pista || "")}|${String(r.nome || "").trim().toLowerCase()}`)
        ?? azRighe?.get(chiaveAncora(r as unknown as Record<string, unknown>));
    // bolla stile W3 per i gettoni del derivato (le righe hanno la loro
    // dentro RigaPayRagazzi)
    const bollaGettoni = useBolla();

    const load = useCallback(async () => {
        setCarico(true); setSoglieDirty(new Set()); setNuovaRigaPer(null);
        const [p, s, r, az] = await Promise.all([
            supabase.from("pay_piste").select("id, chiave, nome, um, ordine, perc_ragazzi, soglie_pct, soglie_max").eq("brand", ctx).eq("month", monthISO).eq("lato", lato).order("ordine"),
            supabase.from("pay_soglie").select("id, pista, tier, soglia_da, soglia_a, bonus").eq("brand", ctx).eq("month", monthISO).eq("lato", lato).order("tier"),
            supabase.from("pay_righe").select("id, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione, brand_vendita, moltiplicatore, componente, punti, pay_base, pay_tiers, gettone, attivo, note, ordine, ricorrente, pay_ragazzi_tiers").eq("brand", ctx).eq("month", monthISO).eq("lato", lato).order("ordine").limit(1000),
            supabase.from("pay_piste").select("id", { count: "exact", head: true }).eq("brand", ctx).eq("month", monthISO).eq("lato", "azienda"),
        ]);
        setAziendaEsiste((az.count || 0) > 0);
        // lato AZIENDA: le chiavi delle piste che il RAGAZZI ha in proprio —
        // per quelle la «% pay ai ragazzi» è INERTE (il derivato parziale non
        // le tocca, caso VF) e la casella va nascosta (revisore 25/08 notte)
        if (lato === "azienda") {
            const pr = await supabase.from("pay_piste").select("chiave").eq("brand", ctx).eq("month", monthISO).eq("lato", "ragazzi");
            setPisteRagazziKeys(new Set(((pr.data || []) as { chiave: string }[]).map(x => x.chiave)));
        } else setPisteRagazziKeys(new Set());
        onVuoto?.(!(p.data || []).length && !(lato === "ragazzi" && (az.count || 0) > 0));
        // ragazzi senza tabellare proprio + azienda presente → carica e SCALA
        if (lato === "ragazzi" && !(p.data || []).length && (az.count || 0) > 0) {
            const [ap, as, ar, am] = await Promise.all([
                supabase.from("pay_piste").select("id, chiave, nome, um, ordine, perc_ragazzi, soglie_pct, soglie_max").eq("brand", ctx).eq("month", monthISO).eq("lato", "azienda").order("ordine"),
                supabase.from("pay_soglie").select("id, pista, tier, soglia_da, soglia_a, bonus").eq("brand", ctx).eq("month", monthISO).eq("lato", "azienda").order("tier"),
                supabase.from("pay_righe").select("id, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione, brand_vendita, moltiplicatore, componente, punti, pay_base, pay_tiers, gettone, attivo, note, ordine, ricorrente, pay_ragazzi_tiers").eq("brand", ctx).eq("month", monthISO).eq("lato", "azienda").eq("attivo", true).order("ordine").limit(1000),
                supabase.from("pay_mappa_soglie").select("pista, tier_nostro, tier_loro, perc").eq("brand", ctx).eq("month", monthISO),
            ]);
            // mappa % per soglia (pay girato): dove esiste SOSTITUISCE la % di
            // pista, riga per riga — stessa precedenza del motore (deriva)
            const mappaDi = new Map<string, Map<number, { loro: number; perc: number }>>();
            for (const v of (am.data || []) as { pista: string; tier_nostro: number; tier_loro: number; perc: number }[]) {
                if (!mappaDi.has(v.pista)) mappaDi.set(v.pista, new Map());
                mappaDi.get(v.pista)!.set(Number(v.tier_nostro), { loro: Number(v.tier_loro), perc: Number(v.perc) });
            }
            // PISTE SOLO AZIENDA (Luca 13/08: gara business/assicurazioni W3
            // «di rete, resta solo all'azienda»): perc_ragazzi = 0 le esclude
            // dal derivato — qui come in commissioning.caricaTabellare
            const pisteAz = ((ap.data || []) as Pista[]).filter(x => Number(x.perc_ragazzi ?? 100) !== 0);
            const chiaviAz = new Set(pisteAz.map(x => x.chiave));
            const percDi = new Map(pisteAz.map(x => [x.chiave, x.perc_ragazzi == null ? 100 : Number(x.perc_ragazzi)]));
            const scala = (v: number | null, pista: string | null) =>
                v == null ? null : Math.round(v * ((pista ? percDi.get(pista) ?? 100 : 100) / 100) * 100) / 100;
            // % soglie ai ragazzi (Luca 13/08): nel derivato le soglie mostrate
            // sono azienda × pct dove impostata (arrotondate, fino-a a catena)
            const pctDi = new Map(pisteAz.map(x => [x.chiave, x.soglie_pct == null ? null : Number(x.soglie_pct)]));
            const soglieAzScalate = pisteAz.flatMap(px => {
                const azS = ((as.data || []) as Soglia[]).filter(x => x.pista === px.chiave)
                    .map(x => ({ ...x, soglia_da: Number(x.soglia_da), soglia_a: x.soglia_a == null ? null : Number(x.soglia_a) }))
                    .sort((a, b) => a.tier - b.tier);
                const pct = pctDi.get(px.chiave);
                let out = azS;
                if (pct != null) {
                    const k = pct / 100;
                    out = azS.map((s, i) => ({ ...s, tier: i + 1, soglia_da: Math.round(s.soglia_da * k), soglia_a: s.soglia_a == null ? null : Math.round(s.soglia_a * k) }));
                    for (let i = 0; i < out.length - 1; i++) out[i].soglia_a = out[i + 1].soglia_da - 1;
                }
                // TAGLIO SOGLIE RAGAZZI (Luca 13/08, W3): soglie_max sul lato
                // azienda = i ragazzi vedono solo le prime N (S1=S1), ultima aperta
                const max = px.soglie_max == null ? null : Number(px.soglie_max);
                if (max && out.length > max) {
                    out = out.slice(0, max).map(s => ({ ...s }));
                    out[out.length - 1].soglia_a = null;
                }
                return out;
            });
            setDerivato({
                piste: pisteAz,
                soglie: soglieAzScalate,
                righe: ((ar.data || []) as Riga[]).filter(x => !x.pista || chiaviAz.has(x.pista)).map(x => {
                    // pay_tiers tagliati come le soglie (soglie_max della pista)
                    const mx = x.pista ? pisteAz.find(p => p.chiave === x.pista)?.soglie_max : null;
                    const cut = mx ? Number(mx) : undefined;
                    const azTiers = Array.isArray(x.pay_tiers) ? x.pay_tiers.map(Number) : [];
                    // PRECEDENZA come nel motore (deriva): € fissi a mano →
                    // mappa % per soglia → % unica di pista (25/08: la mappa
                    // ora è applicata anche qui — prima la vista la ignorava
                    // e con una mappa salvata avrebbe raccontato numeri
                    // diversi dal Calcolatore)
                    const manuali = Array.isArray(x.pay_ragazzi_tiers) && x.pay_ragazzi_tiers.length ? x.pay_ragazzi_tiers.map(Number) : null;
                    const mp = !manuali && !x.gettone && x.pista ? mappaDi.get(x.pista) : undefined;
                    let tiers: number[];
                    let mappaMeta: ({ perc: number; loro: number; orig: number } | null)[] | null = null;
                    if (mp && mp.size) {
                        const nMax = Math.max(...mp.keys());
                        tiers = []; mappaMeta = [];
                        for (let tn = 1; tn <= nMax; tn++) {
                            const voce = mp.get(tn);
                            const az = voce ? azTiers[voce.loro - 1] : undefined;
                            if (voce == null || az == null) { tiers.push(null as unknown as number); mappaMeta.push(null); }
                            else { tiers.push(Math.round(az * voce.perc / 100 * 100) / 100); mappaMeta.push({ perc: voce.perc, loro: voce.loro, orig: az }); }
                        }
                    } else {
                        tiers = manuali ?? azTiers.map(v => scala(v, x.pista) as number);
                    }
                    return {
                        ...x, punti: Number(x.punti || 0),
                        pay_base: scala(x.pay_base == null ? null : Number(x.pay_base), x.pista),
                        pay_tiers: tiers.slice(0, cut),
                        // originali azienda + % (o mappa) per il tooltip
                        // «azienda × % = pay» sulle celle (Luca 25/08)
                        _origBase: x.pay_base == null ? null : Number(x.pay_base),
                        _origTiers: azTiers.slice(0, cut),
                        _perc: x.pista ? (percDi.get(x.pista) ?? 100) : 100,
                        _mappaTiers: mappaMeta ? mappaMeta.slice(0, cut) : null,
                    };
                }),
            });
        } else {
            setDerivato(null);
            // riferimento azienda per le SOGLIE DERIVATE (% soglie da azienda,
            // Luca 13/08): serve al pannello ragazzi CON tabellare proprio
            if (lato === "ragazzi" && (az.count || 0) > 0) {
                const [ap2, as2, ar2] = await Promise.all([
                    supabase.from("pay_piste").select("chiave, ordine, soglie_pct").eq("brand", ctx).eq("month", monthISO).eq("lato", "azienda").order("ordine"),
                    supabase.from("pay_soglie").select("pista, tier, soglia_da, soglia_a, bonus").eq("brand", ctx).eq("month", monthISO).eq("lato", "azienda").order("tier"),
                    // righe azienda = riferimento per la BOLLA del lato ragazzi
                    // con tabellare PROPRIO (Luca 26/08: «mettila anche su
                    // Vodafone, non si sa mai cambiassimo idea sulla %»)
                    supabase.from("pay_righe").select("pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione, brand_vendita, provenienza, pay_base, pay_tiers")
                        .eq("brand", ctx).eq("month", monthISO).eq("lato", "azienda").eq("attivo", true).order("ordine").limit(1000),
                ]);
                setAziendaRef({
                    piste: ((ap2.data || []) as { chiave: string; ordine: number; soglie_pct: number | null }[]),
                    soglie: ((as2.data || []) as Soglia[]).map(x => ({ ...x, soglia_da: Number(x.soglia_da), soglia_a: x.soglia_a == null ? null : Number(x.soglia_a) })),
                });
                const mapa = new Map<string, { base: number | null; tiers: number[] }>();
                for (const x of (ar2.data || []) as Record<string, unknown>[]) {
                    const v = {
                        base: x.pay_base == null ? null : Number(x.pay_base),
                        tiers: Array.isArray(x.pay_tiers) ? (x.pay_tiers as unknown[]).map(Number) : [],
                    };
                    // due chiavi: il NOME (su VF disambigua Ric.Auto/Wallet dove
                    // le condizioni sono identiche — per questo si prova prima)
                    // e l'ANCORA. Sempre first-wins, con le righe ordinate.
                    const kn = `n|${String(x.pista || "")}|${String(x.nome || "").trim().toLowerCase()}`;
                    if (!mapa.has(kn)) mapa.set(kn, v);
                    const ka = chiaveAncora(x);
                    if (!mapa.has(ka)) mapa.set(ka, v);
                }
                setAzRighe(mapa);
            } else { setAziendaRef(null); setAzRighe(null); }
        }
        if (dbError("Caricamento tabellare", p.error || s.error || r.error)) { setCarico(false); return; }
        setPiste((p.data || []) as Pista[]);
        setSoglie(((s.data || []) as Soglia[]).map(x => ({ ...x, soglia_da: Number(x.soglia_da), soglia_a: x.soglia_a == null ? null : Number(x.soglia_a) })));
        const rr = ((r.data || []) as Riga[]).map(x => ({
            ...x, punti: Number(x.punti || 0), pay_base: x.pay_base == null ? null : Number(x.pay_base),
            pay_tiers: Array.isArray(x.pay_tiers) ? x.pay_tiers.map(Number) : [],
        }));
        setRighe(rr);
        setOrig(new Map(rr.map(x => [x.id, JSON.stringify(x)])));
        setCarico(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx, monthISO, lato]);
    useEffect(() => { load(); }, [load]);

    // ── SOGLIE: si edita solo il "da"; il fino-a si ricalcola a catena
    const soglieDi = (pista: string) => soglie.filter(s => s.pista === pista).sort((a, b) => a.tier - b.tier);
    const setDa = (pista: string, tier: number, v: string) => {
        setSoglie(prev => prev.map(s => s.pista === pista && s.tier === tier ? { ...s, soglia_da: num(v) } : s));
        setSoglieDirty(prev => new Set(prev).add(pista));
    };
    const addSoglia = (pista: string) => {
        const scala = soglieDi(pista);
        const ultima = scala[scala.length - 1];
        setSoglie(prev => [...prev, { pista, tier: (ultima?.tier || 0) + 1, soglia_da: (ultima?.soglia_da || 0) + 100, soglia_a: null }]);
        setSoglieDirty(prev => new Set(prev).add(pista));
    };
    const dropSoglia = (pista: string) => {
        const scala = soglieDi(pista);
        if (scala.length <= 1) { notify("Serve almeno una soglia"); return; }
        setSoglie(prev => prev.filter(s => !(s.pista === pista && s.tier === scala[scala.length - 1].tier)));
        setSoglieDirty(prev => new Set(prev).add(pista));
    };
    const salvaSoglie = async (pista: string) => {
        const scala = soglieDi(pista);
        for (let i = 0; i < scala.length - 1; i++)
            if (scala[i + 1].soglia_da <= scala[i].soglia_da) { notify(`S${i + 2} deve partire dopo S${i + 1}`); return; }
        const del = await supabase.from("pay_soglie").delete().eq("brand", ctx).eq("month", monthISO).eq("pista", pista).eq("lato", lato);
        if (dbError("Salvataggio soglie", del.error)) return;
        const ins = await supabase.from("pay_soglie").insert(scala.map((s, i) => ({
            brand: ctx, month: monthISO, pista, tier: i + 1, lato,
            soglia_da: s.soglia_da, soglia_a: i < scala.length - 1 ? scala[i + 1].soglia_da - 1 : null,
            bonus: s.bonus ?? null,
        })));
        if (dbError("Salvataggio soglie", ins.error)) return;
        notify("Soglie salvate ✓", "ok"); load();
    };

    // ── % AI RAGAZZI (solo lato azienda): il ragazzi derivato usa questa quota
    const [percDraft, setPercDraft] = useState<Record<string, string>>({});
    const salvaPerc = async (p: Pista) => {
        const v = percDraft[p.id];
        const n = v === "" || v == null ? null : Number(String(v).replace(",", "."));
        const { error } = await supabase.from("pay_piste").update({ perc_ragazzi: n }).eq("id", p.id);
        if (dbError("Salvataggio %", error)) return;
        notify("% ai ragazzi salvata ✓", "ok"); load();
    };
    // % SOGLIE ai ragazzi (Luca 13/08, UNIFICATA sul lato azienda come le
    // altre %): si imposta sulla pista AZIENDA; vuota = ragazzi manuali
    const [pctDraft, setPctDraft] = useState<Record<string, string>>({});
    const salvaSogliePct = async (p: Pista) => {
        const v = pctDraft[p.id];
        const n = v === "" || v == null ? null : Number(String(v).replace(",", "."));
        const { error } = await supabase.from("pay_piste").update({ soglie_pct: n }).eq("id", p.id);
        if (dbError("Salvataggio % soglie", error)) return;
        notify(n == null ? "Soglie ragazzi tornate manuali ✓" : "% soglie ai ragazzi salvata ✓", "ok"); load();
    };
    // pista ragazzi → % e soglie dell'azienda corrispondente (per chiave o
    // POSIZIONE, caso vas↔soluzioni_digitali); pct sul ragazzi = retrocompat
    const soglieDerivateDi = (p: Pista): { scala: Soglia[]; pct: number } | null => {
        if (!aziendaRef) return null;
        const azOrd = [...aziendaRef.piste].sort((a, b) => a.ordine - b.ordine);
        const ragOrd = [...piste].sort((a, b) => a.ordine - b.ordine);
        const pAz = aziendaRef.piste.find(x => x.chiave === p.chiave)
            ?? azOrd[ragOrd.findIndex(x => x.chiave === p.chiave)];
        const pct = pAz?.soglie_pct ?? p.soglie_pct;
        if (pct == null || !pAz) return null;
        const azS = aziendaRef.soglie.filter(s => s.pista === pAz.chiave).sort((a, b) => a.tier - b.tier);
        if (!azS.length) return null;
        const k = Number(pct) / 100;
        const out = azS.map((s, i) => ({ pista: p.chiave, tier: i + 1, soglia_da: Math.round(s.soglia_da * k), soglia_a: s.soglia_a == null ? null : Math.round(s.soglia_a * k) }));
        for (let i = 0; i < out.length - 1; i++) out[i].soglia_a = out[i + 1].soglia_da - 1;
        return { scala: out, pct: Number(pct) };
    };
    // BONUS DI SOGLIA (Luca 13/08, rifinito): sotto la soglia compare il pay
    // unitario di soglia dove esiste (pay_soglie.bonus — assicurazioni W3,
    // Completezza VF). Su Wind3 rete anche l'INDICAZIONE del gettone per
    // contratto alla soglia (Business P.IVA, Luce&Gas — «così a primo impatto
    // so quanto ci pagano ogni contratto»); le soglie normali degli altri
    // brand restano pulite: i loro pay stanno già nelle tabelle sotto.
    const payPerSoglia = (chiave: string, nTiers: number): (string | null)[] => {
        const rr = righe.filter(r => r.pista === chiave && !r.gettone && r.attivo && !r.moltiplicatore);
        if (!rr.length) return Array(nTiers).fill(null);
        return Array.from({ length: nTiers }, (_, i) => {
            const vals = rr.map(r => r.pay_tiers[i]).filter((v): v is number => v != null && Number.isFinite(v));
            if (!vals.length) return null;
            const mn = Math.min(...vals), mx = Math.max(...vals);
            return mn === mx ? `${mn}` : `${mn}–${mx}`;
        });
    };
    const setBonusVal = (pista: string, tier: number, v: string) => {
        setSoglie(prev => prev.map(s => s.pista === pista && s.tier === tier ? { ...s, bonus: v.trim() === "" ? null : num(v) } : s));
        setSoglieDirty(prev => new Set(prev).add(pista));
    };

    // ── RIGHE
    const dirty = (r: Riga) => orig.get(r.id) !== JSON.stringify(r);
    const upRiga = (id: string, patch: Partial<Riga>) =>
        setRighe(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    const salvaRiga = async (r: Riga) => {
        const { error } = await supabase.from("pay_righe").update({
            nome: r.nome, punti: r.punti, pay_base: r.pay_base, pay_tiers: r.pay_tiers,
            gettone: r.gettone, attivo: r.attivo, note: r.note || null,
            ricorrente: r.ricorrente ?? null,
        }).eq("id", r.id);
        if (dbError("Salvataggio riga", error)) return;
        setOrig(prev => new Map(prev).set(r.id, JSON.stringify(r)));
        notify("Riga salvata ✓", "ok");
    };
    const eliminaRiga = async (r: Riga) => {
        if (!confirm(`Eliminare la riga "${r.nome}"? Le vendite che agganciava diventano scoperture.`)) return;
        const { error } = await supabase.from("pay_righe").delete().eq("id", r.id);
        if (dbError("Eliminazione", error)) return;
        setRighe(prev => prev.filter(x => x.id !== r.id));
    };

    // ── COPIA dall'ULTIMO mese che ha un tabellare (Luca 11/08: l'impostazione
    //    di gara non deve mai sparire — a inizio mese si copia dall'ultimo mese
    //    CON DATI, non per forza dal mese solare prima).
    const [fonteCopia, setFonteCopia] = useState<string | null>(null);
    useEffect(() => {
        let vivo = true;
        supabase.from("pay_piste").select("month").eq("brand", ctx).eq("lato", lato).lt("month", monthISO)
            .order("month", { ascending: false }).limit(1)
            .then(({ data }) => { if (vivo) setFonteCopia(data?.[0]?.month ? String(data[0].month).slice(0, 7) : null); });
        return () => { vivo = false; };
    }, [ctx, monthISO, lato]);
    const copiaMese = async () => {
        if (!fonteCopia) { notify("Non c'è ancora nessun tabellare da copiare per questo operatore"); return; }
        const prev = `${fonteCopia}-01`;
        const [p, s, r] = await Promise.all([
            // ⚠️ soglie_max DEVE viaggiare con la copia (revisore 25/08): senza,
            // il mese nuovo derivava ai ragazzi TUTTE le soglie azienda (gas a 5).
            // E soglie_di IDEM (revisore 25/08 sera): senza, la pista appoggiata
            // (S4 business) nasceva nel mese nuovo senza scala né madre → tier 0
            // → vendite business pagate 0 in silenzio
            supabase.from("pay_piste").select("chiave, nome, um, ordine, perc_ragazzi, soglie_pct, soglie_max, soglie_di").eq("brand", ctx).eq("month", prev).eq("lato", lato),
            supabase.from("pay_soglie").select("pista, tier, soglia_da, soglia_a, bonus").eq("brand", ctx).eq("month", prev).eq("lato", lato),
            // opzione/provenienza/ricorrente/€ fissi ragazzi viaggiano con la
            // copia (S4 25/08: le fasce business sono ancorate all'opzione)
            supabase.from("pay_righe").select("pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione, provenienza, brand_vendita, moltiplicatore, componente, punti, pay_base, pay_tiers, gettone, attivo, note, ordine, ricorrente, pay_ragazzi_tiers").eq("brand", ctx).eq("month", prev).eq("lato", lato).limit(1000),
        ]);
        if (!p.data?.length) { notify(`Nessun tabellare (${lato}) su ${fonteCopia}`); return; }
        const e1 = await supabase.from("pay_piste").insert(p.data.map(x => ({ ...x, brand: ctx, month: monthISO, lato }))).select("id");
        const e2 = (s.data?.length ? await supabase.from("pay_soglie").insert(s.data.map(x => ({ ...x, brand: ctx, month: monthISO, lato }))).select("id") : { data: [], error: null });
        const e3 = (r.data?.length ? await supabase.from("pay_righe").insert(r.data.map(x => ({ ...x, brand: ctx, month: monthISO, lato }))).select("id") : { data: [], error: null });
        if (dbError("Copia mese", e1.error || e2.error || e3.error)) return;
        // % PER SOGLIA ai ragazzi (pay_mappa_soglie, senza lato): viaggia con la
        // copia del lato AZIENDA — senza, il mese nuovo pagherebbe i ragazzi al
        // 100% (revisore 25/08). Riscrittura secca del mese destinazione; resta
        // fuori dal log annulla (senza piste è inerte).
        if (lato === "azienda") {
            const m = await supabase.from("pay_mappa_soglie").select("pista, tier_nostro, tier_loro, perc").eq("brand", ctx).eq("month", prev);
            if (m.data?.length) {
                await supabase.from("pay_mappa_soglie").delete().eq("brand", ctx).eq("month", monthISO);
                const em = await supabase.from("pay_mappa_soglie").insert(m.data.map(x => ({ ...x, brand: ctx, month: monthISO })));
                if (dbError("Copia % ragazzi", em.error)) return;
            }
            // SOGLIE MANUALI dei ragazzi DERIVATI (W3: nessuna pista lato
            // ragazzi, ma soglie proprie in pay_soglie dalla card 📐): il lato
            // ragazzi non ha un suo bottone copia, quindi viaggiano con la
            // copia azienda — SOLO se la fonte non ha piste ragazzi (i brand
            // col tabellare ragazzi vero le copiano già dal loro lato)
            const [pr, sr] = await Promise.all([
                supabase.from("pay_piste").select("id").eq("brand", ctx).eq("month", prev).eq("lato", "ragazzi").limit(1),
                supabase.from("pay_soglie").select("pista, tier, soglia_da, soglia_a, bonus").eq("brand", ctx).eq("month", prev).eq("lato", "ragazzi"),
            ]);
            if (!pr.data?.length && sr.data?.length) {
                const es = await supabase.from("pay_soglie").upsert(
                    sr.data.map(x => ({ ...x, brand: ctx, month: monthISO, lato: "ragazzi" })),
                    { onConflict: "brand,month,pista,tier,lato" });
                if (dbError("Copia soglie ragazzi", es.error)) return;
            }
        }
        // log dell'import: l'annulla cancella ESATTAMENTE questi id (esito Luca
        // 12/08: «deve riportarmi allo stato precedente, non cancellare tutto»)
        await supabase.from("pay_import_log").insert({
            brand: ctx, month: monthISO, lato, fonte: fonteCopia,
            piste_ids: (e1.data || []).map(x => x.id),
            soglie_ids: (e2.data || []).map(x => x.id),
            righe_ids: (e3.data || []).map(x => x.id),
        });
        notify(`Copiato da ${fonteCopia} ✓ — ora ritocca soglie e importi`, "ok"); load();
    };

    // ── MAPPA SOGLIE loro↔nostre + % (esito Luca 12/08, modello W3): per ogni
    //    soglia NOSTRA (ragazzi) si sceglie la soglia LORO corrispondente e la
    //    % girata — per pista/categoria, mai per prodotto. Vive in
    //    pay_mappa_soglie; il motore la usa al posto della % di pista.
    type VoceMappa = { tier_loro: number; perc: string };
    const [mappa, setMappa] = useState<Record<string, Record<number, VoceMappa>>>({});
    const [mappaDirty, setMappaDirty] = useState<Set<string>>(new Set());
    useEffect(() => {
        let vivo = true;
        supabase.from("pay_mappa_soglie").select("pista, tier_nostro, tier_loro, perc")
            .eq("brand", ctx).eq("month", monthISO)
            .then(({ data }) => {
                if (!vivo) return;
                const out: Record<string, Record<number, VoceMappa>> = {};
                ((data || []) as { pista: string; tier_nostro: number; tier_loro: number; perc: number }[]).forEach(r => {
                    (out[r.pista] = out[r.pista] || {})[r.tier_nostro] = { tier_loro: r.tier_loro, perc: String(r.perc) };
                });
                setMappa(out); setMappaDirty(new Set());
            });
        return () => { vivo = false; };
    }, [ctx, monthISO]);
    const setVoceMappa = (pista: string, tn: number, patch: Partial<VoceMappa>) => {
        setMappa(prev => {
            const base: VoceMappa = (prev[pista] || {})[tn] || { tier_loro: tn, perc: "100" };
            return { ...prev, [pista]: { ...(prev[pista] || {}), [tn]: { ...base, ...patch } } };
        });
        setMappaDirty(prev => new Set(prev).add(pista));
    };
    // % UNICA (risposta Luca 13/08): una sola casella riempie la % di TUTTE le
    // soglie della pista in un colpo; le caselle per-soglia restano e possono
    // ritoccare i singoli valori dopo
    const setPercTutte = (pista: string, nTiers: number, perc: string) => {
        for (let tn = 1; tn <= nTiers; tn++) setVoceMappa(pista, tn, { perc });
    };
    const salvaMappa = async (pista: string, nTiers: number) => {
        const del = await supabase.from("pay_mappa_soglie").delete().eq("brand", ctx).eq("month", monthISO).eq("pista", pista);
        if (dbError("Mappa soglie", del.error)) return;
        const righeIns = [];
        for (let tn = 1; tn <= nTiers; tn++) {
            const v = (mappa[pista] || {})[tn];
            if (!v) continue;
            const perc = Number(String(v.perc).replace(",", "."));
            if (!Number.isFinite(perc)) { notify(`S${tn}: percentuale non valida`); return; }
            righeIns.push({ brand: ctx, month: monthISO, pista, tier_nostro: tn, tier_loro: v.tier_loro, perc });
        }
        const ins = righeIns.length ? await supabase.from("pay_mappa_soglie").insert(righeIns) : { error: null };
        if (dbError("Mappa soglie", ins.error)) return;
        setMappaDirty(prev => { const s = new Set(prev); s.delete(pista); return s; });
        notify("Mappa soglie salvata ✓ — il derivato ora la usa", "ok"); load();
    };

    // ── ANNULLA l'ultimo import: torna allo stato di prima della copia. Cancella
    //    solo ciò che quella copia aveva inserito — piste/righe/soglie aggiunte
    //    prima o dopo (la "base del setting") restano al loro posto.
    const [ultimoImport, setUltimoImport] = useState<{ id: string; fonte: string | null; piste_ids: string[]; soglie_ids: string[]; righe_ids: string[] } | null>(null);
    useEffect(() => {
        let vivo = true;
        supabase.from("pay_import_log").select("id, fonte, piste_ids, soglie_ids, righe_ids")
            .eq("brand", ctx).eq("month", monthISO).eq("lato", lato).eq("annullato", false)
            .order("creato_il", { ascending: false }).limit(1)
            .then(({ data }) => { if (vivo) setUltimoImport(data?.[0] || null); });
        return () => { vivo = false; };
    }, [ctx, monthISO, lato, righe.length]);
    const annullaImport = async () => {
        if (!ultimoImport) return;
        if (!window.confirm(`Annullo l'import${ultimoImport.fonte ? ` da ${ultimoImport.fonte}` : ""}? Sparisce solo quello che la copia aveva inserito, il resto rimane.`)) return;
        const e3 = ultimoImport.righe_ids.length ? await supabase.from("pay_righe").delete().in("id", ultimoImport.righe_ids) : { error: null };
        const e2 = ultimoImport.soglie_ids.length ? await supabase.from("pay_soglie").delete().in("id", ultimoImport.soglie_ids) : { error: null };
        const e1 = ultimoImport.piste_ids.length ? await supabase.from("pay_piste").delete().in("id", ultimoImport.piste_ids) : { error: null };
        if (dbError("Annulla import", e1.error || e2.error || e3.error)) return;
        const eLog = await supabase.from("pay_import_log").update({ annullato: true }).eq("id", ultimoImport.id);
        if (dbError("Annulla import", eLog.error)) return;
        setUltimoImport(null);
        notify("Import annullato ✓ — tornato com'era prima della copia", "ok"); load();
    };

    // ── CREA DA ZERO / nuova pista ("o andarle a ricostruire da zero" — Luca 11/08)
    const nuovaPista = async () => {
        const nome = prompt("Nome della pista (es. Mobile, Fisso, Energia):");
        if (!nome || !nome.trim()) return;
        const chiave = nome.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "pista";
        if (piste.some(p => p.chiave === chiave)) { notify("Esiste già una pista con questo nome"); return; }
        const e1 = await supabase.from("pay_piste").insert({ brand: ctx, month: monthISO, chiave, nome: nome.trim(), um: "punti", ordine: (piste[piste.length - 1]?.ordine || 0) + 1, lato });
        if (dbError("Nuova pista", e1.error)) return;
        const e2 = await supabase.from("pay_soglie").insert({ brand: ctx, month: monthISO, pista: chiave, tier: 1, soglia_da: 1, soglia_a: null, lato });
        if (dbError("Nuova pista (soglia)", e2.error)) return;
        notify("Pista creata ✓ — sistemale le soglie e aggiungi le righe", "ok"); load();
    };

    const righeDiPista = (chiave: string) => righe.filter(r => r.pista === chiave && !r.gettone);
    // modalità soloRegole (W3): la sezione Gettoni raccoglie TUTTI i gettone
    // a prescindere dalla pista — qui restano SOLO i contrattuali (che sono
    // regole); ogni altro pay unitario (Netflix, Cloud, FRITZ, Customer Base,
    // telefoni…) vive unicamente nel Commissioning (regola Luca 14/08 sera)
    const gettoni = righe.filter(r => (r.gettone || !r.pista) && (!soloRegole || (r.componente || "").startsWith("contrattuale")));

    if (carico) return <div className="text-slate-400 text-sm">Carico il tabellare…</div>;

    if (!piste.length) {
        if (nascondiVuoto && !(lato === "ragazzi" && aziendaEsiste)) return null;
        if (lato === "ragazzi" && aziendaEsiste && derivato) {
            const soglieDer = (pista: string) => derivato.soglie.filter(x => x.pista === pista).sort((a, b) => a.tier - b.tier);
            return (
                <div className="space-y-5">
                    <div className="glass-panel rounded-2xl px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
                        <div className="text-[12px] text-slate-300">
                            {vedeQuote ? (<>
                            🧮 Tabellare ragazzi <b>compilato dal lato azienda</b> — {derivato.piste.map(x => {
                                const rrP = derivato.righe.filter(r => r.pista === x.chiave && !r.gettone);
                                const man = rrP.filter(r => Array.isArray(r.pay_ragazzi_tiers) && (r.pay_ragazzi_tiers?.length || 0) > 0).length;
                                return `${x.nome} ${man > 0 && man === rrP.length ? "✍️ manuale" : `${x.perc_ragazzi ?? 100}%${man ? ` (✍️ ${man} a mano)` : ""}`}`;
                            }).join(" · ")}. Gli importi si correggono riga per riga (💾 = € fissi).
                            </>) : (
                                <>🧮 Il tabellare della gara: ogni attivazione col suo pay per soglia.</>
                            )}
                        </div>
                        {vaiAzienda && vedeQuote && <button onClick={vaiAzienda} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: colore }}>🏢 Lavora sul lato azienda</button>}
                    </div>
                    {/* SOGLIE in testa anche sul derivato — e MANUALI dove serve
                        (esito Luca 12/08: la % dei ragazzi scala solo i pay, le
                        soglie ragazzi si settano a mano pista per pista; senza
                        soglie manuali valgono quelle del lato azienda) */}
                    <div className="glass-panel rounded-2xl p-5" style={{ borderLeft: `4px solid ${colore}` }}>
                        <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-3">Soglie — di serie quelle del lato azienda; «Imposta a mano» le sgancia per i ragazzi (la % scala solo i pay)</div>
                        {/* TABELLA (Luca 13/08: soglie «precise e ben organizzate,
                            come le tabelle del pay») — righe = piste; manuali =
                            input, dall'azienda = valori in sola lettura */}
                        {(() => {
                            const righeS = derivato.piste
                                .map(px => ({ px, mie: soglieDi(px.chiave), scalaAz: soglieDer(px.chiave) }))
                                .filter(x => x.mie.length || x.scalaAz.length);
                            if (!righeS.length) return null;
                            const maxT = Math.max(...righeS.map(x => Math.max(x.mie.length, x.scalaAz.length)));
                            return (<>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                                <th className="text-left font-semibold px-3 py-1.5">Pista</th>
                                                {Array.from({ length: maxT }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-20">S{i + 1}</th>)}
                                                <th className="px-2 py-1.5 w-40"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {righeS.map(({ px, mie, scalaAz }) => {
                                                const manuali = mie.length > 0;
                                                const mostra = manuali ? mie : scalaAz;
                                                return (
                                                    <tr key={px.id} className="border-t border-white/5">
                                                        <td className="px-3 py-1.5 font-semibold text-white whitespace-nowrap">{px.nome} <span className="text-slate-500 font-normal text-xs">({px.um})</span>{!manuali && <span className="text-slate-500 text-[10px] font-normal ml-1.5">= azienda</span>}</td>
                                                        {Array.from({ length: maxT }, (_, i) => {
                                                            const s = mostra[i];
                                                            if (!s) return <td key={i} className="px-1.5 py-1.5 text-center text-slate-700">—</td>;
                                                            const fino = i < mostra.length - 1 ? mostra[i + 1].soglia_da - 1 : null;
                                                            return (
                                                                <td key={i} className="px-1.5 py-1.5 text-center" title={fino != null ? `da ${s.soglia_da} a ${fino}` : `da ${s.soglia_da} in su`}>
                                                                    {manuali ? (
                                                                        <input value={mie[i].soglia_da} onChange={e => setDa(px.chiave, mie[i].tier, e.target.value)}
                                                                            className="bg-white/[0.05] border border-white/10 rounded-lg px-1.5 py-1 text-sm text-white w-16 text-center tabular-nums" />
                                                                    ) : (
                                                                        <span className="text-[13px] text-slate-200 font-semibold tabular-nums">{s.soglia_da}</span>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                                                            {manuali ? (<>
                                                                <button onClick={() => addSoglia(px.chiave)} className="text-slate-400 hover:text-white align-middle" title="Aggiungi soglia"><Plus size={14} /></button>
                                                                <button onClick={() => dropSoglia(px.chiave)} className="text-slate-500 hover:text-red-400 align-middle ml-1" title="Togli l'ultima soglia"><Trash2 size={13} /></button>
                                                                {soglieDirty.has(px.chiave) && (
                                                                    <button onClick={() => salvaSoglie(px.chiave)} className="text-emerald-300 text-xs font-semibold ml-1.5" title="Salva le soglie della pista">💾</button>
                                                                )}
                                                                <button onClick={async () => {
                                                                    if (!window.confirm(`Le soglie manuali di ${px.nome} tornano a quelle del lato azienda?`)) return;
                                                                    const { error } = await supabase.from("pay_soglie").delete().eq("brand", ctx).eq("month", monthISO).eq("pista", px.chiave).eq("lato", "ragazzi");
                                                                    if (dbError("Soglie ragazzi", error)) return;
                                                                    notify("Soglie riallineate a quelle azienda ✓", "ok"); load();
                                                                }} className="text-[11px] text-slate-500 hover:text-slate-300 ml-1.5" title="Cancella le soglie manuali: tornano quelle del lato azienda">↺</button>
                                                            </>) : (
                                                                <button onClick={async () => {
                                                                    const { error } = await supabase.from("pay_soglie").insert(scalaAz.map((s, i) => ({
                                                                        brand: ctx, month: monthISO, pista: px.chiave, tier: i + 1,
                                                                        soglia_da: s.soglia_da, soglia_a: s.soglia_a, lato: "ragazzi",
                                                                    })));
                                                                    if (dbError("Soglie ragazzi", error)) return;
                                                                    notify(`Soglie di ${px.nome} sganciate: ora si modificano qui ✓`, "ok"); load();
                                                                }} className="text-[11px] text-amber-300/90 border border-amber-500/30 rounded-lg px-2 py-1" title="Copia le soglie azienda come base e le rende modificabili per i ragazzi">✎ Imposta a mano</button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {/* MAPPA loro↔nostre + % per soglia (pay girato), per le
                                    piste con soglie manuali — sotto la tabella */}
                                {righeS.filter(x => x.mie.length).map(({ px, mie, scalaAz }) => (
                                    <div key={px.id} className="flex items-center gap-2 flex-wrap mt-2">
                                        {/* niente doppioni con la % azienda (Luca 25/08 sera):
                                            vuoto = si applica quella; compilato = ritocco fine
                                            per soglia che le vince sopra */}
                                        <span className="text-[11px] text-slate-500">↘ pay girato · <b className="text-slate-300">{px.nome}</b> <span className="text-slate-600">(vuoto = × {px.perc_ragazzi ?? 100}% del lato azienda; qui la ritocchi soglia per soglia)</span>:</span>
                                        {(() => {
                                            const percs = mie.map((_, i) => (mappa[px.chiave] || {})[i + 1]?.perc ?? "");
                                            const unica = percs.length && percs.every(p => p === percs[0]) ? percs[0] : "";
                                            return (
                                                <span className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1 inline-flex items-center gap-1"
                                                    title="Scrivi qui e la stessa % va su tutte le soglie della pista; le caselle a fianco restano per ritoccare le singole">
                                                    tutte ×
                                                    <input value={unica} placeholder="%" onChange={e => setPercTutte(px.chiave, mie.length, e.target.value)}
                                                        className="bg-transparent border border-amber-500/30 rounded px-1 py-0.5 text-[11px] text-white w-12 text-center" />%
                                                </span>
                                            );
                                        })()}
                                        {mie.map((_, i) => {
                                            const tn = i + 1;
                                            const v = (mappa[px.chiave] || {})[tn];
                                            return (
                                                <span key={tn} className="text-[11px] text-slate-400 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1 inline-flex items-center gap-1">
                                                    S{tn} ← loro
                                                    <select value={v?.tier_loro ?? tn} onChange={e => setVoceMappa(px.chiave, tn, { tier_loro: Number(e.target.value) })}
                                                        className="bg-transparent border border-white/10 rounded px-1 py-0.5 text-[11px] text-white">
                                                        {/* le soglie LORO della pista (revisore 25/08: il
                                                            cap fisso a 8 offriva colonne che il motore
                                                            non paga sui brand con scale corte) */}
                                                        {Array.from({ length: Math.max(scalaAz.length || 8, mie.length) }, (_, t) => <option key={t + 1} value={t + 1} className="bg-slate-800">S{t + 1}</option>)}
                                                    </select>
                                                    ×
                                                    <input value={v?.perc ?? ""} placeholder="%" onChange={e => setVoceMappa(px.chiave, tn, { perc: e.target.value })}
                                                        className="bg-transparent border border-white/10 rounded px-1 py-0.5 text-[11px] text-white w-12 text-center" />%
                                                </span>
                                            );
                                        })}
                                        {mappaDirty.has(px.chiave) && (
                                            <button onClick={() => salvaMappa(px.chiave, mie.length)} className="text-emerald-300 text-xs font-semibold flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-500/40"><Save size={13} /> Salva mappa</button>
                                        )}
                                    </div>
                                ))}
                            </>);
                        })()}
                    </div>
                    {derivato.piste.map(px => {
                        // SOGLIE EFFETTIVE della sezione (revisore 25/08 notte,
                        // caso Sky): le MANUALI ragazzi vincono sulle derivate
                        // azienda — come nel motore. Senza, l'header mostrava la
                        // scala azienda (8 colonne) e il 💾 dei manuali a 4
                        // valori moriva su «compila tutti gli importi».
                        const mieP = soglieDi(px.chiave);
                        const scala = mieP.length ? mieP : soglieDer(px.chiave);
                        const rr = derivato.righe.filter(r => r.pista === px.chiave && !r.gettone);
                        if (!rr.length) return null;
                        const nT = scala.length || Math.max(0, ...rr.map(r => r.pay_tiers.length));
                        const apertaP = aperteTab.has(`der|${px.chiave}`);
                        return (
                            <div key={px.id} className="glass-panel rounded-2xl overflow-hidden">
                                <button onClick={() => toggleTab(`der|${px.chiave}`)} className="w-full text-left px-4 pt-3 pb-2 flex items-center gap-2">
                                    <span className="text-sm font-bold text-white">{emojiPista(px.nome)} {px.nome}</span>
                                    {/* COMMISSIONING MANUALE (Luca 25/08): con gli € fissi il
                                        «× 100%» mentiva — se gli importi sono inseriti a mano
                                        la % di derivazione non c'entra più. Vale per TUTTI
                                        gli operatori che passano dal derivato. */}
                                    {(() => {
                                        const man = rr.filter(r => Array.isArray(r.pay_ragazzi_tiers) && (r.pay_ragazzi_tiers?.length || 0) > 0).length;
                                        if (man === rr.length) return <span className="text-[11px] text-amber-300 font-semibold" title="Tutti gli importi di questa sezione sono inseriti a mano: la % di derivazione dall'azienda non si applica">✍️ commissioning manuale</span>;
                                        // MAPPA % per soglia attiva (pay girato): la % unica
                                        // non conta più — il badge non deve mentire
                                        const conMappa = rr.some(r => r._mappaTiers);
                                        const pctBadge = conMappa
                                            ? <span className="text-[11px] text-amber-300/80 font-semibold" title="Questa pista usa la mappa «pay girato»: % per soglia (vince sulla % unica di pista)">× % per soglia</span>
                                            : <span className="text-[11px] text-amber-300/80 font-semibold">× {px.perc_ragazzi ?? 100}%</span>;
                                        if (man > 0) return <>{pctBadge}<span className="text-[11px] text-amber-300 font-semibold" title="Alcune righe hanno importi inseriti a mano: per quelle la % non si applica">✍️ {man} a mano</span></>;
                                        return pctBadge;
                                    })()}
                                    <span className="text-xs font-normal text-slate-500">{apertaP ? "▾" : `▸ ${rr.length} voci`}</span>
                                </button>
                                {/* CONTENUTO nascosto ma MONTATO (revisore 25/08: lo
                                    smontaggio bruciava i draft € fissi non salvati);
                                    scala e nota FUORI dal button — selezionarle non
                                    deve richiudere il pannello */}
                                <div className={apertaP ? "" : "hidden"}>
                                    <div className="px-4 pb-1.5 flex items-center gap-3 flex-wrap">
                                        <span className="text-[11px] text-slate-500">{scala.map((x, i) => `S${i + 1}: ${x.soglia_da}${i < scala.length - 1 ? `–${scala[i + 1].soglia_da - 1}` : "+"}`).join(" · ")}</span>
                                        {/* € FISSI (Luca 25/08, altra sessione): gli importi si
                                            correggono a mano — vincono su % e mappa */}
                                        <span className="text-[10px] text-slate-600" title="Gli importi derivano dall'azienda × %. Correggi le caselle e salva col 💾 per fissarli in € (vincono su % e mappa soglie); ↺ torna alla derivazione.">✎ importi correggibili — in ambra quelli fissati a mano</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm border-collapse">
                                            <thead>
                                                <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                                    <th className="text-left font-semibold px-3 py-1.5">Offerta</th>
                                                    <th className="px-1.5 py-1.5 font-semibold text-center w-12 text-indigo-300">{ctx === "s4" ? "Pezzi" : "Punti"}</th>
                                                    {ctx !== "s4" && <th className="px-1.5 py-1.5 font-semibold text-center w-16">Base</th>}
                                                    {Array.from({ length: nT }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-20">S{i + 1}</th>)}
                                                    <th className="px-2 py-1.5 w-16"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {raggruppaPerOfferta(rr).map((g, gi) => (
                                                    <Fragment key={g.titolo ? `g${gi}` : g.righe[0].r.id}>
                                                        {g.titolo && (
                                                            <tr className="border-t border-white/[0.06]">
                                                                <td colSpan={2 + (ctx === "s4" ? 0 : 1) + nT} className="px-3 pt-2 pb-0.5 font-semibold text-white">{g.titolo}</td>
                                                            </tr>
                                                        )}
                                                        {g.righe.map(({ r, variante }) => <RigaPayRagazzi key={r.id} r={r} nT={nT} senzaBase={ctx === "s4"} dopo={load} variante={variante} />)}
                                                    </Fragment>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {(() => {
                        const gettoni = [...derivato.righe.filter(r => r.gettone || !r.pista), ...righe.filter(r => r.gettone || !r.pista)];
                        if (!gettoni.length) return null;
                        const apertaG = aperteTab.has("der|_gettoni");
                        return (
                        <div className="glass-panel rounded-2xl overflow-hidden">
                            <button onClick={() => toggleTab("der|_gettoni")} className="w-full text-left px-4 pt-3 pb-2 flex items-center gap-2">
                                <span className="text-sm font-bold text-white">💰 Gettoni</span>
                                <span className="text-xs font-normal text-slate-500">{apertaG ? "▾" : `▸ ${gettoni.length} voci`}</span>
                                <span className="text-[11px] text-slate-500 font-normal">pagano sempre, senza soglia</span>
                                {/* % delle piste-gettone (gas/telefoni): qui in sola
                                    lettura, si imposta dal lato azienda */}
                                {derivato.piste.filter(px => gettoni.some(g => g.pista === px.chiave)).map(px => (
                                    <span key={px.id} className="text-[11px] text-amber-300/80 font-semibold">{emojiPista(px.nome)} × {px.perc_ragazzi ?? 100}%</span>
                                ))}
                            </button>
                            <div className={apertaG ? "" : "hidden"}>
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                        <th className="text-left font-semibold px-3 py-1.5">Voce</th>
                                        <th className="px-1.5 py-1.5 font-semibold text-center w-20">Gettone €</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {gettoni.map(r => (
                                        <tr key={r.id} className="border-t border-white/5">
                                            <td className="px-3 py-1" title={[r.tipo_cliente, r.categoria, r.prodotto, r.offerta, r.opzione && `opzione: ${r.opzione}`].filter(Boolean).join(" · ") + (r.note ? ` — ${r.note}` : "")}>{r.nome}{r.note && <span className="text-slate-600 text-[11px] ml-1 cursor-help">ⓘ</span>}</td>
                                            {/* wording condizionale (revisore): un gettone CON pista
                                                a % < 100 viene scalato — la bolla non deve giurare
                                                il contrario */}
                                            <td className="px-1 py-1 text-center text-white font-medium cursor-help"
                                                onMouseEnter={e => bollaGettoni.mostra(e, r._origBase != null && r.pista && (r._perc ?? 100) !== 100 ? [
                                                    { testo: `Gettone · ${eurIt(r._perc)}% ai ragazzi`, stile: "formula" },
                                                    { testo: `· all'azienda: ${eurIt(r._origBase)} €`, stile: "voce" },
                                                    { testo: "· paga sempre, senza soglia", stile: "voce" },
                                                    { testo: `= ${eurIt(r.pay_base)} €`, stile: "tot" },
                                                ] : [
                                                    { testo: "Gettone", stile: "formula" },
                                                    { testo: "· paga sempre, senza soglia", stile: "voce" },
                                                    { testo: "· importo pieno, non scalato dalla %", stile: "voce" },
                                                ])}
                                                onMouseLeave={bollaGettoni.nascondi}>{r.pay_base ?? "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                        </div>
                        );
                    })()}
                    {bollaGettoni.bolla}
                </div>
            );
        }
        return lato === "ragazzi" && aziendaEsiste ? (
            <div className="glass-panel rounded-2xl p-6 text-center text-slate-400 text-sm">Carico il tabellare derivato…</div>
        ) : (
            <div className="glass-panel rounded-2xl p-6 text-center space-y-3">
                <div className="text-slate-300">Nessun tabellare ({lato}) su {mese}.</div>
                <div className="flex gap-2 justify-center flex-wrap">
                    {fonteCopia && (
                        <button onClick={copiaMese} className="px-4 py-2 rounded-xl text-sm font-semibold text-white inline-flex items-center gap-2" style={{ background: colore }}>
                            <Copy size={15} /> Copia da {fonteCopia} e ritocca
                        </button>
                    )}
                    <button onClick={nuovaPista} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-200 border border-white/15 inline-flex items-center gap-2">
                        <Plus size={15} /> Crea da zero
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="text-[12px] text-slate-400">
                Le vendite si agganciano per NOME (tipo cliente · categoria · prodotto · offerta — vince la riga più specifica).
                {lato === "azienda" && " Se il lato ragazzi non ha un suo tabellare, si deriva da qui con la \"% ai ragazzi\"."}
            </div>

            {/* SOGLIE per pista (nascoste su W3 azienda: la tabella di
                riferimento è quella dei target nel pannello negozi) */}
            {!nascondiSoglie && (
            <div className="glass-panel rounded-2xl p-5" style={{ borderLeft: `4px solid ${colore}` }}>
                <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] uppercase tracking-wider text-slate-400">Soglie — scrivi solo il &quot;da&quot;: il fino-a si sistema da solo</div>
                    <div className="flex items-center gap-2">
                        {ultimoImport && (
                            <button onClick={annullaImport} title="Torna a com'era prima della copia: sparisce solo quello che l'import aveva inserito"
                                className="text-xs text-amber-300/90 border border-amber-500/30 rounded-lg px-2 py-1">
                                ↩ Annulla l&apos;import{ultimoImport.fonte ? ` da ${ultimoImport.fonte}` : ""}
                            </button>
                        )}
                        <button onClick={nuovaPista} className="text-xs text-slate-300 border border-white/10 rounded-lg px-2 py-1 flex items-center gap-1"><Plus size={13} /> Pista</button>
                    </div>
                </div>
                {/* TABELLA delle soglie (Luca 13/08: «precise e ben organizzate,
                    come le tabelle del pay») — righe = piste, colonne S1..Sn;
                    lato azienda anche la colonna «% soglie ragazzi». Le piste
                    senza soglie restano fuori (W3 mobile/fisso: per PDV nel
                    Target); le righe pay restano sotto. */}
                {(() => {
                    const visibili = piste
                        .map(p => {
                            const scala = soglieDi(p.chiave);
                            const der = lato === "ragazzi" ? soglieDerivateDi(p) : null;
                            return { p, scala, der, mostra: der?.scala ?? scala };
                        })
                        .filter(x => x.mostra.length > 0);
                    if (!visibili.length) return <div className="text-sm text-slate-500">Nessuna pista con soglie proprie.</div>;
                    const maxT = Math.max(...visibili.map(x => x.mostra.length));
                    return (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                        <th className="text-left font-semibold px-3 py-1.5">Pista</th>
                                        {Array.from({ length: maxT }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-20">S{i + 1}</th>)}
                                        {lato === "azienda" && <th className="px-1.5 py-1.5 font-semibold text-center w-32" title="Scostamento delle soglie ragazzi da queste: es. 135 = azienda × 1,35 arrotondato. Vuota = soglie ragazzi manuali.">% soglie ragazzi</th>}
                                        <th className="px-2 py-1.5 w-24"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibili.map(({ p, scala, der, mostra }) => {
                                        // sotto la soglia: bonus dove esiste; su W3 rete anche
                                        // il gettone indicativo per contratto alla soglia
                                        const conBonus = lato === "azienda" && scala.some(s => s.bonus != null);
                                        const pays = ctx === "windtre" && lato === "azienda" && !conBonus ? payPerSoglia(p.chiave, maxT) : [];
                                        return (
                                        <tr key={p.id} className="border-t border-white/5">
                                            <td className="px-3 py-1.5 font-semibold text-white whitespace-nowrap">{emojiPista(p.nome)} {p.nome} <span className="text-slate-500 font-normal text-xs">({p.um})</span>{der && <span className="text-sky-400/80 text-[10px] font-normal ml-1.5">× {der.pct}%</span>}{conBonus && <div className="text-[10px] text-emerald-400/80 font-normal">🎁 bonus a soglia</div>}</td>
                                            {Array.from({ length: maxT }, (_, i) => {
                                                const s = mostra[i];
                                                if (!s) return <td key={i} className="px-1.5 py-1.5 text-center text-slate-700">—</td>;
                                                const fino = i < mostra.length - 1 ? mostra[i + 1].soglia_da - 1 : null;
                                                return (
                                                    <td key={i} className="px-1.5 py-1.5 text-center align-top" title={fino != null ? `da ${s.soglia_da} a ${fino}` : `da ${s.soglia_da} in su`}>
                                                        {der ? (
                                                            <span className="text-[13px] text-sky-200 font-semibold tabular-nums">{s.soglia_da}</span>
                                                        ) : (
                                                            <input value={scala[i].soglia_da} onChange={e => setDa(p.chiave, scala[i].tier, e.target.value)}
                                                                className="bg-white/[0.05] border border-white/10 rounded-lg px-1.5 py-1 text-sm text-white w-16 text-center tabular-nums" />
                                                        )}
                                                        {!der && conBonus && (
                                                            <div className="mt-1 inline-flex items-center gap-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-1.5 py-0.5"
                                                                title={`Bonus al raggiungimento della soglia${scala[i].bonus != null ? `: ${Number(scala[i].bonus).toLocaleString("it-IT")} €` : ""} — si salva col 💾 della riga`}>
                                                                <span className="text-[10px]">🎁</span>
                                                                <input value={scala[i].bonus == null ? "" : String(scala[i].bonus)}
                                                                    onChange={e => setBonusVal(p.chiave, scala[i].tier, e.target.value)}
                                                                    className="bg-transparent border-none outline-none text-[11px] font-semibold text-emerald-200 w-12 text-right tabular-nums" placeholder="—" />
                                                                <span className="text-[10px] font-bold text-emerald-300/90">€</span>
                                                            </div>
                                                        )}
                                                        {!der && !conBonus && pays[i] && (
                                                            <div className="mt-0.5 text-[10px] text-slate-400 tabular-nums"
                                                                title="Gettone per contratto a questa soglia (se le righe differiscono: dal minimo al massimo)">{pays[i]} €/pezzo</div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            {lato === "azienda" && (
                                                <td className="px-1.5 py-1.5 text-center whitespace-nowrap">
                                                    <input value={pctDraft[p.id] ?? (p.soglie_pct == null ? "" : String(p.soglie_pct))}
                                                        onChange={e => setPctDraft(prev => ({ ...prev, [p.id]: e.target.value }))}
                                                        className="bg-white/[0.05] border border-sky-500/30 rounded-lg px-1.5 py-1 text-sm text-sky-100 w-16 text-center" placeholder="man." />
                                                    {pctDraft[p.id] != null && pctDraft[p.id] !== (p.soglie_pct == null ? "" : String(p.soglie_pct)) &&
                                                        <button onClick={() => salvaSogliePct(p)} className="text-emerald-300 text-xs font-semibold ml-1">💾</button>}
                                                </td>
                                            )}
                                            <td className="px-2 py-1.5 text-right whitespace-nowrap">
                                                {!der && <>
                                                    <button onClick={() => addSoglia(p.chiave)} className="text-slate-400 hover:text-white align-middle" title="Aggiungi soglia"><Plus size={14} /></button>
                                                    <button onClick={() => dropSoglia(p.chiave)} className="text-slate-500 hover:text-red-400 align-middle ml-1" title="Togli l'ultima soglia"><Trash2 size={13} /></button>
                                                    {soglieDirty.has(p.chiave) && (
                                                        <button onClick={() => salvaSoglie(p.chiave)} className="text-emerald-300 text-xs font-semibold ml-1.5" title="Salva le soglie della pista"><Save size={14} className="inline" /> 💾</button>
                                                    )}
                                                </>}
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    );
                })()}
            </div>
            )}

            {/* RIGHE per pista — TABELLE compatte (segnalazione Luca 11/08: numeri
                centrati, colonne strette, niente scroll infinito — stile delle
                griglie S1-S4 che manda lui) */}
            {/* % AI RAGAZZI TRASLOCATE (Luca 25/08): non sono una regola di
                gara — si governano nel 💶 Commissioning (card 👥, per SOGLIA
                su mobile/fisso/luce&gas, unica su CB/Protetti) */}
            {soloRegole && lato === "azienda" && (
                <p className="text-[11px] text-slate-500">👥 Le <b>% ai ragazzi</b> si impostano nella scheda <b>💶 Commissioning</b> (per soglia su Mobile, Fisso e Luce &amp; Gas).</p>
            )}
            {piste.map(p => {
                // modalità soloRegole (W3): le piste a gettone e i gettoni
                // sciolti si editano nel Commissioning, non qui
                if (soloRegole && ["lucegas", "cb", "business_piva", "protetti"].includes(p.chiave)) return null;
                const rr = righeDiPista(p.chiave).filter(r => !soloRegole || !(r.gettone && !r.componente));
                // piste SOLO-GETTONI (gas/telefoni FW): niente sezione vuota —
                // le righe vivono nella card Gettoni e la % si governa lì
                if (!rr.length && righe.some(r => r.pista === p.chiave && r.gettone)) return null;
                // colonne S1..Sn: dalle soglie della pista, MA con ripiego sui
                // pay_tiers delle righe — Mobile/Fisso W3 non hanno soglie di
                // rete (le loro sono per negozio) e senza ripiego i
                // moltiplicatori restavano INVISIBILI (baco visto da Luca 14/08:
                // «GA base: leggo punti 1 e niente soglie»)
                const nTiers = soglieDi(p.chiave).length || Math.max(0, ...rr.map(r => r.pay_tiers.length));
                // RICORRENTE (Luca 25/08, S4): colonna €/pezzo/mese prima dei
                // Punti — su S4 sempre, altrove appare se qualche riga ce l'ha
                const mostraRic = ctx === "s4" || rr.some(r => r.ricorrente != null);
                const apertaP = aperteTab.has(p.chiave);
                return (
                    <div key={p.id} className="glass-panel rounded-2xl overflow-hidden">
                        {/* header stile Commissioning W3 (Luca 25/08): chiuso
                            dice quante voci contiene, il click esplode */}
                        <button onClick={() => toggleTab(p.chiave)} className="w-full text-left px-4 pt-3 pb-2 flex items-center gap-2">
                            <span className="text-sm font-bold text-white">{emojiPista(p.nome)} {p.nome}</span>
                            {/* TABELLARE RAGAZZI STORICO: pay a mano, non collegati
                                in % all'azienda — va detto accanto al nome (Luca
                                25/08). Solo se un lato azienda ESISTE: su TIM/Kena
                                la lettera è unica e il badge confonderebbe. */}
                            {/* QUOTA VERA, non «manuale» e basta (Luca 26/08: «in
                                realtà sono al 100%, cambiano solo le soglie»):
                                si confrontano gli importi con la voce azienda
                                corrispondente e si dice la percentuale che ne esce.
                                Solo se differiscono davvero si parla di «a mano». */}
                            {lato === "ragazzi" && aziendaEsiste && (() => {
                                const conf = rr.map(x => ({ mio: x.pay_tiers, loro: azDi(x)?.tiers })).filter(x => x.loro?.length);
                                if (!conf.length) return <span className="text-[10px] font-bold text-slate-400 bg-white/[0.06] border border-white/10 rounded-full px-2 py-0.5">voci proprie dei ragazzi</span>;
                                const pcts = conf.flatMap(x => (x.loro || []).map((v, i) => v ? Math.round(Number(x.mio[i] ?? 0) / Number(v) * 1000) / 10 : null).filter((v): v is number => v != null));
                                const uniche = [...new Set(pcts)];
                                const testo = uniche.length === 1 ? `= ${eurIt(uniche[0])}% dell'azienda` : "✍️ importi a mano (quota non uniforme)";
                                return <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${uniche.length === 1 ? "text-emerald-300/90 bg-emerald-500/10 border-emerald-500/30" : "text-amber-300/90 bg-amber-500/10 border-amber-500/30"}`}
                                    title={uniche.length === 1 ? "Gli importi coincidono con questa quota su tutte le voci confrontabili; le soglie invece hanno la loro scala" : `Quote diverse fra le voci: ${uniche.slice(0, 6).join("% · ")}%`}>{testo}</span>;
                            })()}
                            <span className="text-xs font-normal text-slate-500">{apertaP ? "▾" : `▸ ${rr.length} voci`}</span>
                        </button>
                        {/* nascosto ma MONTATO (revisore 25/08: chiudere il
                            pannello non deve bruciare NuovaRiga o i dirty) */}
                        <div className={apertaP ? "" : "hidden"}>
                        <div className="flex items-center justify-end px-4 pb-2 gap-3 flex-wrap">
                            {/* % PAY ai ragazzi QUI, dove i pay si vedono (Luca 13/08) —
                                ma NON per le piste che il ragazzi ha in proprio
                                (VF): lì la % è inerte e mentiva */}
                            {lato === "azienda" && !pisteRagazziKeys.has(p.chiave) && (
                                <label className="text-[11px] text-amber-300/90" title="Quota dei pay girata ai ragazzi: il loro tabellare deriva da questi importi × la %. Vuota = 100%.">
                                    % pay ai ragazzi
                                    <input value={percDraft[p.id] ?? (p.perc_ragazzi == null ? "" : String(p.perc_ragazzi))}
                                        onChange={e => setPercDraft(prev => ({ ...prev, [p.id]: e.target.value }))}
                                        className={inputCls + " ml-1 w-16"} placeholder="100" />
                                    {percDraft[p.id] != null && percDraft[p.id] !== (p.perc_ragazzi == null ? "" : String(p.perc_ragazzi)) &&
                                        <button onClick={() => salvaPerc(p)} className="text-emerald-300 text-xs font-semibold ml-1">💾</button>}
                                </label>
                            )}
                            <button onClick={() => setNuovaRigaPer(nuovaRigaPer === p.chiave ? null : p.chiave)} className="text-xs text-slate-300 border border-white/10 rounded-lg px-2 py-1 flex items-center gap-1"><Plus size={13} /> Riga</button>
                        </div>
                        {nuovaRigaPer === p.chiave && <div className="px-4"><NuovaRiga ctx={ctx} monthISO={monthISO} pista={p.chiave} nTiers={nTiers} lato={lato} dopo={() => { setNuovaRigaPer(null); load(); }} /></div>}
                        {rr.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                            <th className="text-left font-semibold px-3 py-1.5">Offerta</th>
                                            {mostraRic && <th className="px-1.5 py-1.5 font-semibold text-center w-20" title="€ a maturazione per pezzo — ricorrente mensile (S4: dall'8° mese dal contratto) o una tantum (Fastweb energia: compenso M+6). Informativo: il motore non lo paga, si monitora col cantiere compensi/fatture.">🔁 Ricorr. €/m</th>}
                                            {/* S4 parla di PEZZI, non di punti (Luca 25/08: «si
                                                rapporta sempre 1:1») — ogni riga conta 1 */}
                                            <th className="px-1.5 py-1.5 font-semibold text-center w-12">{ctx === "s4" ? "Pezzi" : "Punti"}</th>
                                            {ctx !== "s4" && <th className="px-1.5 py-1.5 font-semibold text-center w-16">Base</th>}
                                            {Array.from({ length: nTiers }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-16">S{i + 1}</th>)}
                                            <th className="px-2 py-1.5 w-20"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {raggruppaPerOfferta(rr).map((g, gi) => (
                                            <Fragment key={g.titolo ? `g${gi}` : g.righe[0].r.id}>
                                                {g.titolo && (
                                                    <tr className="border-t border-white/[0.06]">
                                                        <td colSpan={2 + (mostraRic ? 1 : 0) + (ctx === "s4" ? 0 : 1) + nTiers} className="px-3 pt-2 pb-0.5 font-semibold text-white">{g.titolo}</td>
                                                    </tr>
                                                )}
                                                {g.righe.map(({ r, variante }) => <RigaRow key={r.id} r={r} nTiers={nTiers} isDirty={dirty(r)} onUp={upRiga} onSalva={salvaRiga} onElimina={eliminaRiga} conRicorrente={mostraRic} senzaBase={ctx === "s4"} az={azRighe ? (azDi(r) ?? null) : undefined} variante={variante} />)}
                                            </Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {!rr.length && <div className="text-slate-500 text-sm px-4 pb-3">Nessuna riga su questa pista.</div>}
                        </div>
                    </div>
                );
            })}

            {/* GETTONI — tabella compatta. Su S4 NON esiste (Luca 25/08: «non
                ha senso che sia lì»): tutto il pay S4 vive nelle piste */}
            {ctx !== "s4" && (
            <div className="glass-panel rounded-2xl overflow-hidden">
                <button onClick={() => toggleTab("__gettoni")} className="w-full text-left px-4 pt-3 pb-2 flex items-center gap-2">
                    <span className="text-sm font-bold text-white">💰 Gettoni</span>
                    <span className="text-xs font-normal text-slate-500">{aperteTab.has("__gettoni") ? "▾" : `▸ ${gettoni.length} voci`}</span>
                    <span className="text-[11px] text-slate-500 font-normal">pagano sempre, senza soglia</span>
                </button>
                <div className={aperteTab.has("__gettoni") ? "" : "hidden"}>
                <div className="flex items-center justify-end px-4 pb-2 gap-3 flex-wrap">
                    {/* % AI RAGAZZI dei gettoni (Luca 25/08 sera: «non posso
                        impostarla»): i gettoni con PISTA (gas/telefoni FW) si
                        scalano con la % della loro pista — si governa qui.
                        Le voci senza pista restano piene (100%). */}
                    {lato === "azienda" && (
                        <div className="flex items-center gap-3 flex-wrap mr-auto">
                            {/* TUTTE le piste coi gettoni, anche quelle che hanno
                                pure righe a soglia (Luca 25/08 notte, caso Sky:
                                la casella c'era solo sul pannello «Punti Sky» in
                                alto e qui i business sembravano senza %) — è la
                                STESSA % della pista, stesso salvataggio */}
                            {piste.filter(px => righe.some(r => r.pista === px.chiave && r.gettone) && !pisteRagazziKeys.has(px.chiave)).map(px => (
                                <label key={px.id} className="text-[11px] text-amber-300/90" title={`Quota dei gettoni «${px.nome}» girata ai ragazzi (vuota = 100%). È la stessa % della pista: governa anche le righe a soglia. Occhio: 0 = niente ai ragazzi, le voci spariscono dal loro tabellare.`}>
                                    {emojiPista(px.nome)} {px.nome} ×
                                    <input value={percDraft[px.id] ?? (px.perc_ragazzi == null ? "" : String(px.perc_ragazzi))}
                                        onChange={e => setPercDraft(prev => ({ ...prev, [px.id]: e.target.value }))}
                                        className={inputCls + " ml-1 w-14"} placeholder="100" />%
                                    {percDraft[px.id] != null && percDraft[px.id] !== (px.perc_ragazzi == null ? "" : String(px.perc_ragazzi)) &&
                                        <button onClick={() => salvaPerc(px)} className="text-emerald-300 text-xs font-semibold ml-1">💾</button>}
                                </label>
                            ))}
                        </div>
                    )}
                    <button onClick={() => setNuovaRigaPer(nuovaRigaPer === "__gettoni" ? null : "__gettoni")} className="text-xs text-slate-300 border border-white/10 rounded-lg px-2 py-1 flex items-center gap-1"><Plus size={13} /> Gettone</button>
                </div>
                {nuovaRigaPer === "__gettoni" && <div className="px-4"><NuovaRiga ctx={ctx} monthISO={monthISO} pista={null} nTiers={0} lato={lato} dopo={() => { setNuovaRigaPer(null); load(); }} /></div>}
                {gettoni.length > 0 && (
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                <th className="text-left font-semibold px-3 py-1.5">Voce</th>
                                {/* maturazioni (25/08): il gas Fastweb ha l'M+6 — colonna
                                    quando almeno un gettone ce l'ha */}
                                {gettoni.some(g => g.ricorrente != null) && <th className="px-1.5 py-1.5 font-semibold text-center w-20" title="€ a maturazione per pezzo (ricorrente mensile o una tantum, es. M+6). Informativo: si monitora col cantiere compensi/fatture.">🔁 Matur. €</th>}
                                <th className="px-1.5 py-1.5 font-semibold text-center w-20">Gettone €</th>
                                <th className="px-2 py-1.5 w-20"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {gettoni.map(r => <RigaRow key={r.id} r={r} nTiers={0} isDirty={dirty(r)} onUp={upRiga} onSalva={salvaRiga} onElimina={eliminaRiga} conRicorrente={gettoni.some(g => g.ricorrente != null)} az={azRighe ? (azDi(r) ?? null) : undefined} />)}
                        </tbody>
                    </table>
                )}
                {!gettoni.length && <div className="text-slate-500 text-sm px-4 pb-3">Nessun gettone.</div>}
                </div>
            </div>
            )}
        </div>
    );
}

// PAY RAGAZZI CORREGGIBILE (Luca 25/08, nato per S4: «non solo in percentuale
// — se voglio definire anche un fisso»): la riga derivata mostra gli importi
// (azienda × %, o quelli già fissati) e li lascia correggere in €. Il 💾
// scrive pay_ragazzi_tiers sulla riga AZIENDA — da lì vince su % di pista e
// mappa soglie, qui in vista e nel motore (commissioning.deriva). ↺ li toglie
// e torna alla derivazione. Top-level (lezione CardVoce: mai annidata).
function RigaPayRagazzi({ r, nT, senzaBase, dopo, variante }: { r: Riga; nT: number; senzaBase: boolean; dopo: () => void; variante?: string | null }) {
    const manuale = Array.isArray(r.pay_ragazzi_tiers) && (r.pay_ragazzi_tiers?.length || 0) > 0;
    const mostrati = Array.from({ length: nT }, (_, i) => r.pay_tiers[i] == null ? "" : String(r.pay_tiers[i]));
    const [draft, setDraft] = useState<string[] | null>(null);
    const vals = draft ?? mostrati;
    const dirty = draft != null && draft.join("|") !== mostrati.join("|");
    const salva = async () => {
        // la casella vuota NON è uno 0 (revisore 25/08: Number("") === 0
        // passava il controllo e salvava 0 € in silenzio)
        if (vals.some(v => String(v).trim() === "")) { notify("C'è una casella vuota: compila tutti gli importi"); return; }
        const nums = vals.map(v => Number(String(v).trim().replace(",", ".")));
        if (nums.some(n => !Number.isFinite(n))) { notify("Compila tutti gli importi con numeri validi"); return; }
        const { error } = await supabase.from("pay_righe").update({ pay_ragazzi_tiers: nums }).eq("id", r.id);
        if (dbError("€ fissi ai ragazzi", error)) return;
        notify("€ fissi ai ragazzi salvati ✓ — vincono su % e mappa", "ok"); setDraft(null); dopo();
    };
    const ripristina = async () => {
        if (!window.confirm(`«${r.nome}»: tolgo gli € fissi e torno alla derivazione a %?`)) return;
        const { error } = await supabase.from("pay_righe").update({ pay_ragazzi_tiers: null }).eq("id", r.id);
        if (dbError("€ fissi ai ragazzi", error)) return;
        notify("Tornata alla derivazione a % ✓", "ok"); setDraft(null); dopo();
    };
    // BOLLA di derivazione stile W3 (Luca 25/08: «il title nativo è orrendo»):
    // sul pay si leggono l'importo azienda, la % e l'operazione che dà il
    // numero in cella; con gli € fissati a mano non c'è un conto da fare e la
    // bolla lo dice e basta. Il «=» cita sempre il valore mostrato.
    const { mostra, nascondi, bolla } = useBolla();
    const perc = r._perc ?? 100;
    const unita = r.moltiplicatore ? "" : " €";
    const codaMolt: TipRiga[] = r.moltiplicatore ? [{ testo: "(i valori sono moltiplicatori del canone)", stile: "flat" }] : [];
    const tipTier = (i: number): TipRiga[] | null => {
        // MAPPA % PER SOGLIA (pay girato): la bolla cita la % della soglia e
        // la soglia azienda di provenienza — la % unica di pista qui non conta
        if (!manuale && r._mappaTiers) {
            const mv = r._mappaTiers[i];
            if (!mv) return [
                { testo: `S${i + 1} · senza voce di mappa`, stile: "formula" },
                { testo: "cella vuota: il motore qui non paga", stile: "flat" },
            ];
            return [
                { testo: `S${i + 1} · ${eurIt(mv.perc)}% ai ragazzi${mv.loro !== i + 1 ? ` (dalla S${mv.loro} azienda)` : ""}`, stile: "formula" },
                { testo: `· all'azienda: ${eurIt(mv.orig)}${unita}${mv.loro !== i + 1 ? ` (S${mv.loro})` : ""}`, stile: "voce" },
                ...(mv.perc !== 100 ? [{ testo: `· ${eurIt(mv.orig)}${unita} × ${eurIt(mv.perc)}%`, stile: "voce" as const }] : []),
                ...codaMolt,
                { testo: `= ${eurIt(r.pay_tiers[i])}${unita}`, stile: "tot" },
            ];
        }
        const orig = r._origTiers?.[i];
        if (orig == null) return null;
        if (manuale) {
            return r.pay_tiers[i] == null
                ? [
                    { testo: `S${i + 1} · non fissato`, stile: "formula" },
                    { testo: `· all'azienda: ${eurIt(orig)}${unita}`, stile: "voce" },
                    { testo: "cella vuota: il motore qui non paga", stile: "flat" },
                ]
                : [
                    { testo: `S${i + 1} · € fissati a mano`, stile: "formula" },
                    { testo: `· all'azienda: ${eurIt(orig)}${unita}`, stile: "voce" },
                    ...codaMolt,
                    { testo: `= ${eurIt(r.pay_tiers[i])}${unita}`, stile: "tot" },
                ];
        }
        return [
            { testo: `S${i + 1} · ${eurIt(perc)}% ai ragazzi`, stile: "formula" },
            { testo: `· all'azienda: ${eurIt(orig)}${unita}`, stile: "voce" },
            ...(perc !== 100 ? [{ testo: `· ${eurIt(orig)}${unita} × ${eurIt(perc)}%`, stile: "voce" as const }] : []),
            ...codaMolt,
            { testo: `= ${eurIt(r.pay_tiers[i])}${unita}`, stile: "tot" },
        ];
    };
    const tipBase = (): TipRiga[] | null => r._origBase == null ? null : [
        { testo: `Base · ${eurIt(perc)}% ai ragazzi · sotto la 1ª soglia`, stile: "formula" },
        { testo: `· all'azienda: ${eurIt(r._origBase)}${unita}`, stile: "voce" },
        ...(perc !== 100 ? [{ testo: `· ${eurIt(r._origBase)}${unita} × ${eurIt(perc)}%`, stile: "voce" as const }] : []),
        ...codaMolt,
        { testo: `= ${eurIt(r.pay_base)}${unita}`, stile: "tot" },
    ];
    return (
        <tr className="border-t border-white/5 hover:bg-white/[0.03]">
            <td className={`py-1 min-w-[170px] ${variante ? "pl-7 pr-2 whitespace-nowrap" : "px-3"}`} title={[r.tipo_cliente, r.categoria, r.prodotto, r.offerta, r.opzione && `opzione: ${r.opzione}`].filter(Boolean).join(" · ") + (r.note ? ` — ${r.note}` : "")}>
                {variante
                    ? <span className={`text-[11px] px-2 py-0.5 rounded-full border ${pillolaVariante(variante)}`}>{variante}</span>
                    : r.nome}
                {manuale && <span className="text-amber-300/90 text-[10px] font-bold ml-1.5" title="€ fissati a mano: vincono su % di pista e mappa soglie">€ fissi</span>}
                {r.note && <span className="text-slate-600 text-[11px] ml-1 cursor-help">ⓘ</span>}
            </td>
            <td className="px-1 py-1 text-center text-indigo-300 font-semibold">{r.punti || "—"}</td>
            {!senzaBase && <td className="px-1 py-1 text-center text-slate-300 cursor-help" onMouseEnter={e => mostra(e, tipBase())} onMouseLeave={nascondi}>{r.pay_base ?? "—"}</td>}
            {Array.from({ length: nT }, (_, i) => (
                <td key={i} className="px-1 py-1 text-center" onMouseEnter={e => mostra(e, tipTier(i))} onMouseLeave={nascondi}>
                    <input value={vals[i] ?? ""} onChange={e => { const c = [...vals]; c[i] = e.target.value; setDraft(c); }}
                        className={`w-16 bg-transparent text-center text-sm border-b outline-none py-0.5 focus:border-indigo-400 ${manuale ? "text-amber-200 border-amber-500/30" : "text-white border-transparent"}`} />
                </td>
            ))}
            <td className="px-2 py-1 text-right whitespace-nowrap">
                {dirty && <button onClick={salva} title="Fissa questi € ai ragazzi (vincono su % e mappa)" className="text-emerald-300 align-middle mr-1.5"><Save size={14} /></button>}
                {manuale && <button onClick={ripristina} title="Togli gli € fissi: torna alla derivazione a %" className="text-[11px] text-slate-500 hover:text-slate-300 align-middle">↺</button>}
            </td>
            {bolla}
        </tr>
    );
}

// Riga di TABELLA — top-level (lezione CardVoce: mai annidata). Aggancio e
// note vivono nel tooltip della cella Offerta: la riga resta alta una riga.
function RigaRow({ r, nTiers, isDirty, onUp, onSalva, onElimina, conRicorrente, senzaBase, az, variante }: {
    r: Riga; nTiers: number; isDirty: boolean;
    onUp: (id: string, patch: Partial<Riga>) => void;
    onSalva: (r: Riga) => void; onElimina: (r: Riga) => void;
    // S4 (Luca 25/08): colonna ricorrente €/mese prima dei Punti; niente Base
    conRicorrente?: boolean; senzaBase?: boolean;
    // riga AZIENDA corrispondente (solo lato ragazzi con tabellare proprio):
    // alimenta la bolla «all'azienda X · qui Y · = Z%» (Luca 26/08)
    // undefined = non siamo nel confronto (lato azienda); null = voce
    // senza corrispondente azienda; oggetto = riferimento trovato
    az?: { base: number | null; tiers: number[] } | null;
    // etichetta della VARIANTE quando la riga sta sotto il titolo di
    // un'offerta (stile W3): al posto del nome si mostra la pillola
    variante?: string | null;
}) {
    const anchor = [r.tipo_cliente, r.categoria, r.prodotto, r.offerta, r.opzione && `opzione: ${r.opzione}`].filter(Boolean).join(" · ") || "qualsiasi vendita";
    const tip = anchor + (r.brand_vendita ? ` · [${r.brand_vendita}]` : "") + (r.moltiplicatore ? " · i valori sono MOLTIPLICATORI del canone mensile" : "") + (r.note ? ` — ${r.note}` : "");
    const cell = "w-full bg-transparent text-center text-sm text-white border-b border-transparent focus:border-indigo-400 outline-none py-0.5";
    const [rinomina, setRinomina] = useState(false);   // pillola → input col ✎
    // BOLLA di confronto (Luca 26/08): sul lato ragazzi con tabellare PROPRIO
    // non c'è una derivazione da raccontare — si mostra quanto prende l'azienda
    // sulla stessa voce e la quota che ne risulta, così il giorno che si
    // decidesse di passare a una % il numero è già sotto gli occhi.
    const { mostra, nascondi, bolla } = useBolla();
    const unita = r.moltiplicatore ? "" : " €";
    const quota = (mio: number | null | undefined, loro: number | null | undefined): TipRiga[] | null => {
        if (az === undefined) return null;                    // lato azienda: nessuna bolla
        const fine = mio == null ? [] : [{ testo: `= ${eurIt(mio)}${unita}`, stile: "tot" as const }];
        // «la voce non esiste lato azienda» e «esiste ma non ha questa soglia»
        // sono due cose diverse (rilievo revisore: prima dicevano lo stesso)
        if (az === null) return [
            { testo: "Voce solo dei ragazzi", stile: "formula" },
            { testo: "· nessuna corrispondente sul lato azienda", stile: "flat" },
            ...fine,
        ];
        if (loro == null) return [
            { testo: "Soglia non prevista lato azienda", stile: "formula" },
            { testo: "· la voce azienda si ferma prima", stile: "flat" },
            ...fine,
        ];
        const pct = Number(loro) === 0 ? null : Math.round((Number(mio || 0) / Number(loro)) * 1000) / 10;
        return [
            { testo: pct == null ? "Confronto con l'azienda" : `${eurIt(pct)}% dell'azienda`, stile: "formula" },
            { testo: `· all'azienda: ${eurIt(loro)}${unita}`, stile: "voce" },
            { testo: "· importo scritto a mano (tabellare proprio, nessuna derivazione)", stile: "flat" },
            { testo: `= ${eurIt(mio)}${unita}`, stile: "tot" },
        ];
    };
    return (
        <tr className={`border-t border-white/5 hover:bg-white/[0.03] ${r.attivo ? "" : "opacity-40"}`}>
            <td className={`py-0.5 min-w-[170px] group ${variante ? "pl-7 pr-2 whitespace-nowrap" : "px-3"}`}>
                <div className="flex items-center gap-1">
                    {variante && !rinomina ? (
                        <>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${pillolaVariante(variante)}`} title={tip}>{variante}</span>
                            <button onClick={() => setRinomina(true)} title="Rinomina la voce"
                                className="text-[10px] text-slate-600 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">✎</button>
                        </>
                    ) : (
                        <input value={r.nome} title={tip} autoFocus={!!variante} onBlur={() => setRinomina(false)}
                            onChange={e => onUp(r.id, { nome: e.target.value })}
                            className="bg-transparent text-sm text-white w-full border-b border-transparent focus:border-indigo-400 outline-none py-0.5" />
                    )}
                    {r.moltiplicatore && <span title="moltiplicatori del canone mensile" className="text-indigo-300 text-[11px] font-bold shrink-0">×</span>}
                    {r.note && <span title={tip} className="text-slate-600 text-[11px] cursor-help shrink-0">ⓘ</span>}
                </div>
            </td>
            {/* anche sui GETTONI (25/08: il gas Fastweb ha il compenso M+6 —
                senza questa cella la colonna 🔁 non esisteva per loro) */}
            {conRicorrente && <td className="px-1 py-0.5"><input value={r.ricorrente ?? ""} title="€ a maturazione per pezzo (ricorrente mensile o una tantum, es. M+6)" onChange={e => onUp(r.id, { ricorrente: e.target.value === "" ? null : num(e.target.value) })} className={cell + " text-sky-200"} /></td>}
            {!r.gettone && <td className="px-1 py-0.5"><input value={r.punti} onChange={e => onUp(r.id, { punti: num(e.target.value) })} className={cell} /></td>}
            {!senzaBase && <td className="px-1 py-0.5" onMouseEnter={e => mostra(e, quota(r.pay_base, az?.base))} onMouseLeave={nascondi}>
                <input value={r.pay_base ?? ""} onChange={e => onUp(r.id, { pay_base: e.target.value === "" ? null : num(e.target.value) })} className={cell} /></td>}
            {!r.gettone && Array.from({ length: nTiers }, (_, i) => (
                <td key={i} className="px-1 py-0.5" onMouseEnter={e => mostra(e, quota(r.pay_tiers[i], az?.tiers[i]))} onMouseLeave={nascondi}>
                    <input value={r.pay_tiers[i] ?? ""} onChange={e => {
                        const t = [...r.pay_tiers]; t[i] = num(e.target.value); onUp(r.id, { pay_tiers: t });
                    }} className={cell} />
                </td>
            ))}
            <td className="px-2 py-0.5 text-right whitespace-nowrap">
                {isDirty && <button onClick={() => onSalva(r)} title="Salva" className="text-emerald-300 mr-1.5 align-middle"><Save size={14} /></button>}
                <button onClick={() => onUp(r.id, { attivo: !r.attivo })} title={r.attivo ? "Attiva — click per spegnere" : "Spenta — click per accendere"}
                    className={`mr-1.5 align-middle text-[13px] ${r.attivo ? "text-emerald-400" : "text-slate-600"}`}>●</button>
                <button onClick={() => onElimina(r)} title="Elimina" className="text-slate-600 hover:text-red-400 align-middle"><Trash2 size={13} /></button>
            </td>
            {bolla}
        </tr>
    );
}

// Form nuova riga: aggancio per NOME al catalogo (campo vuoto = jolly)
function NuovaRiga({ ctx, monthISO, pista, nTiers, lato, dopo }: {
    ctx: string; monthISO: string; pista: string | null; nTiers: number; lato: string; dopo: () => void;
}) {
    const [nome, setNome] = useState("");
    const [tc, setTc] = useState<string | null>(null);
    const [cat, setCat] = useState(""); const [prod, setProd] = useState(""); const [off, setOff] = useState("");
    const [bv, setBv] = useState(BRAND_VENDITA.includes(ctx) ? ctx : "vodafone");
    const [punti, setPunti] = useState("1"); const [base, setBase] = useState("");
    // S4 (Luca 25/08): niente base — al suo posto il ricorrente €/mese
    const isS4 = ctx === "s4";
    const [ric, setRic] = useState("");
    const [tiers, setTiers] = useState<string[]>(Array.from({ length: nTiers }, () => ""));
    const salva = async () => {
        if (!nome.trim()) { notify("Dai un nome alla riga"); return; }
        const { error } = await supabase.from("pay_righe").insert({
            brand: ctx, month: monthISO, pista, lato, nome: nome.trim(),
            tipo_cliente: tc, categoria: cat.trim() || null, prodotto: prod.trim() || null, offerta: off.trim() || null,
            brand_vendita: bv, punti: pista ? Number(punti.replace(",", ".")) || 0 : 0,
            pay_base: base === "" ? null : Number(base.replace(",", ".")) || 0,
            pay_tiers: pista ? tiers.map(t => Number(t.replace(",", ".")) || 0) : [],
            // parse esplicito: «0» resta 0 (il vecchio «|| null» lo mangiava)
            ricorrente: (() => { if (!pista || ric.trim() === "") return null; const n = Number(ric.replace(",", ".")); return Number.isFinite(n) ? n : null; })(),
            gettone: !pista, attivo: true, ordine: 999,
        });
        if (dbError("Nuova riga", error)) return;
        notify("Riga aggiunta ✓", "ok"); dopo();
    };
    return (
        <div className="border border-dashed border-white/15 rounded-xl p-3 mb-3 space-y-2">
            <div className="flex gap-2 flex-wrap items-center">
                <input placeholder="Nome riga (etichetta)" value={nome} onChange={e => setNome(e.target.value)} className={inputCls + " flex-1 min-w-[180px] text-left"} />
                {[null, "Consumer", "Business"].map(t => (
                    <button key={String(t)} onClick={() => setTc(t)} className={`text-xs px-2 py-1 rounded-lg border ${tc === t ? "border-indigo-400 text-white bg-indigo-500/30" : "border-white/10 text-slate-400"}`}>
                        {t || "Tutti"}
                    </button>
                ))}
            </div>
            <div className="flex gap-2 flex-wrap">
                <input placeholder="Categoria (nome esatto, vuoto = tutte)" value={cat} onChange={e => setCat(e.target.value)} className={inputCls + " flex-1 min-w-[150px] text-left"} />
                <input placeholder="Prodotto (vuoto = tutti)" value={prod} onChange={e => setProd(e.target.value)} className={inputCls + " flex-1 min-w-[150px] text-left"} />
                <input placeholder="Offerta (vuoto = tutte)" value={off} onChange={e => setOff(e.target.value)} className={inputCls + " flex-1 min-w-[150px] text-left"} />
            </div>
            <div className="flex gap-2 flex-wrap items-center">
                <span className="text-[11px] text-slate-400">brand della vendita</span>
                {BRAND_VENDITA.slice(0, 6).map(b => (
                    <button key={b} onClick={() => setBv(b)} className={`text-xs px-2 py-1 rounded-lg border ${bv === b ? "border-indigo-400 text-white bg-indigo-500/30" : "border-white/10 text-slate-400"}`}>{b}</button>
                ))}
                {pista && <label className="text-[11px] text-slate-400">{isS4 ? "pezzi" : "punti"} <input value={punti} onChange={e => setPunti(e.target.value)} className={inputCls + " w-14"} /></label>}
                {isS4 && pista && <label className="text-[11px] text-sky-300/90" title="€ al mese per pezzo dall'8° mese dal contratto">ricorrente €/m <input value={ric} onChange={e => setRic(e.target.value)} className={inputCls} /></label>}
                {!(isS4 && pista) && <label className="text-[11px] text-slate-400">{pista ? "base €" : "gettone €"} <input value={base} onChange={e => setBase(e.target.value)} className={inputCls} /></label>}
                {pista && tiers.map((t, i) => (
                    <label key={i} className="text-[11px] text-slate-400">S{i + 1} € <input value={t} onChange={e => setTiers(p => p.map((x, j) => j === i ? e.target.value : x))} className={inputCls} /></label>
                ))}
                <button onClick={salva} className="text-emerald-300 text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-500/40"><Save size={13} /> Aggiungi</button>
            </div>
        </div>
    );
}
