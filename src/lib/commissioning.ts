/**
 * MOTORE PAY TABELLARE (cantiere GARE 10/08/2026).
 *
 * "Pagamento a tabella": ogni brand+mese ha delle PISTE (KPI: mobile, fisso,
 * business_mobile, ...) con una scala di SOGLIE di rete espressa in punti.
 * Le RIGHE pay sono ancorate al CATALOGO per nome (tipo_cliente / categoria /
 * prodotto / offerta, match gerarchico: il più specifico vince — stesso
 * modello di ce_compensi_brand): ogni attivazione valida porta `punti` alla
 * pista e viene pagata `pay_tiers[tier-1]` una volta in soglia (retroattivo
 * dal 1° pezzo), `pay_base` sotto la prima soglia ("di cui base").
 * Le righe `gettone=true` pagano SEMPRE `pay_base`, senza soglia (es. CB e
 * telefoni a rate W3 — "gettone unico a prescindere").
 *
 * REGOLA DI COPERTURA (Luca 10/08): un'offerta a catalogo SENZA riga pay non
 * genera commissioning — le scoperture vanno mostrate, mai pagate a zero in
 * silenzio. Il Calcolatore $$$ le elenca.
 *
 * Perimetro produzione (v1, da raffinare col cantiere): righe CTR- (pratiche
 * brand), no demo (filtro robusto in query), no nascosta_gestione, stati
 * annullati esclusi. Vendite a CRM solo da fine luglio 2026.
 */

import { supabase } from "@/lib/supabaseClient";
import { caricaTutte } from "@/lib/fetchTutte";

// soglie_di (S4 25/08, «la soglia è unica»): chiave della pista MADRE — la
// pista appoggiata non ha soglie proprie: i suoi pezzi contano NELLA scala
// della madre (canvass unico su commissioning diviso) e la sua soglia È
// quella della madre. La % ai ragazzi resta la sua.
export type PayPista = { chiave: string; nome: string; um: string; ordine: number; perc_ragazzi?: number | null; soglie_pct?: number | null; soglie_max?: number | null; soglie_di?: string | null };
export type PaySoglia = { pista: string; tier: number; soglia_da: number; soglia_a: number | null };
export type PayRiga = {
    id: string; pista: string | null; nome: string;
    tipo_cliente: string | null; categoria: string | null; prodotto: string | null;
    offerta: string | null; opzione: string | null;
    brand_vendita: string | null;               // NULL = qualsiasi brand di vendita
    // token di provenienza separati da virgola ("iliad,coop,poste"): la riga
    // vale SOLO per le vendite con quell'Operatore di Provenienza (prefisso
    // normalizzato). NULL = qualsiasi. Es. TIM MNP +10€, Kena STAR (Luca 12/08).
    provenienza?: string | null;
    moltiplicatore?: boolean;                   // true = i tiers sono MOLTIPLICATORI del canone dell'offerta (modello W3)
    // MODELLO ADDITIVO W3 (13/08): base | base_underground | mnp | tied | piva |
    // conv | la | ftth | fwa | opzioni — le righe componente si SOMMANO come
    // nella lettera (GA base + MNP + Tied + P.IVA). NULL = riga intera classica.
    componente?: string | null;
    punti: number; pay_base: number | null; pay_tiers: number[];
    gettone: boolean; attivo: boolean; note: string | null; ordine: number;
    // ricorrente €/pezzo/mese INFORMATIVO (S4: dall'8° mese dal contratto,
    // ≈ 6° di fornitura) — il motore non lo paga, la UI lo racconta
    ricorrente?: number | null;
    // € FISSI ai ragazzi per soglia (Luca 25/08): se valorizzato, il derivato
    // usa QUESTI importi e ignora % di pista e mappa soglie per questa riga
    pay_ragazzi_tiers?: number[] | null;
};
// derivato: il lato ragazzi non esiste a DB — è il lato AZIENDA scalato con
// pay_piste.perc_ragazzi (Luca 11/08: es. Fastweb mobile 60%, fisso 70%).
export type Tabellare = { brand: string; month: string; lato?: string; piste: PayPista[]; soglie: PaySoglia[]; righe: PayRiga[]; derivato?: boolean };

export type ContrattoPay = {
    id: string; brand: string | null; negozio: string | null; venditore: string | null;
    data: string | null; stato: string | null; tipo_cliente: string | null;
    categoria: string | null; prodotto: string | null; offerta: string | null;
    nascosta_gestione: boolean | null;
    cod_ins: string | null;                     // codice inserimento (dettagli "Cod.Ins.")
    provenienza: string | null;                 // dettagli "Operatore di Provenienza"
    opzioni: string | null;                     // dettagli "Opzioni" (es. "Security Pro" — conteggio W3)
};

/** contracts.brand (etichetta "WindTre"/"Very Mobile") → catalog_brands.id */
export function brandIdDaLabel(label: unknown): string | null {
    const k = String(label || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!k) return null;
    if (k.startsWith("windtre") || k === "w3") return "windtre";
    if (k.startsWith("vodafone")) return "vodafone";
    if (k.startsWith("fastweb")) return "fastweb";
    if (k.startsWith("sky")) return "sky";
    if (k.startsWith("tim")) return "tim";
    if (k.startsWith("iliad")) return "iliad";
    if (k.startsWith("very")) return "very";
    if (k.startsWith("ho")) return "ho";
    if (k.startsWith("kena")) return "kena";
    if (k.startsWith("dojo")) return "dojo";
    if (k.startsWith("s4")) return "s4";
    if (k.startsWith("kipoint")) return "kipoint";
    return null;
}

/** Primo e ultimo giorno del mese "YYYY-MM-01" (date TEXT, confronto lessicale). */
export function estremiMese(monthISO: string): { primo: string; ultimo: string } {
    const [y, m] = monthISO.split("-").map(Number);
    const fine = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, "0");
    return { primo: `${y}-${mm}-01`, ultimo: `${y}-${mm}-${String(fine).padStart(2, "0")}` };
}

async function caricaTabellareLato(brand: string, monthISO: string, lato: string): Promise<Tabellare | null> {
    const [pisteRes, soglieRes, righeRes] = await Promise.all([
        supabase.from("pay_piste").select("chiave, nome, um, ordine, perc_ragazzi, soglie_pct, soglie_max, soglie_di").eq("brand", brand).eq("month", monthISO).eq("lato", lato).order("ordine"),
        supabase.from("pay_soglie").select("pista, tier, soglia_da, soglia_a").eq("brand", brand).eq("month", monthISO).eq("lato", lato).order("tier"),
        supabase.from("pay_righe").select("id, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione, brand_vendita, provenienza, moltiplicatore, componente, punti, pay_base, pay_tiers, gettone, attivo, note, ordine, ricorrente, pay_ragazzi_tiers")
            .eq("brand", brand).eq("month", monthISO).eq("lato", lato).eq("attivo", true).order("ordine").limit(1000),
    ]);
    const piste = (pisteRes.data || []) as PayPista[];
    if (!piste.length) return null;
    const norm = (r: Record<string, unknown>): PayRiga => ({
        ...(r as unknown as PayRiga),
        punti: Number(r.punti || 0),
        pay_base: r.pay_base == null ? null : Number(r.pay_base),
        pay_tiers: Array.isArray(r.pay_tiers) ? (r.pay_tiers as unknown[]).map(Number) : [],
        ricorrente: r.ricorrente == null ? null : Number(r.ricorrente),
        pay_ragazzi_tiers: Array.isArray(r.pay_ragazzi_tiers) ? (r.pay_ragazzi_tiers as unknown[]).map(Number) : null,
    });
    return {
        brand, month: monthISO, lato, piste,
        soglie: ((soglieRes.data || []) as Record<string, unknown>[]).map(s => ({
            pista: String(s.pista), tier: Number(s.tier),
            soglia_da: Number(s.soglia_da), soglia_a: s.soglia_a == null ? null : Number(s.soglia_a),
        })),
        righe: ((righeRes.data || []) as Record<string, unknown>[]).map(norm),
    };
}

/**
 * Tabellare RAGAZZI di un brand/mese. Se a DB c'è solo il lato AZIENDA (la
 * lettera vera), il ragazzi si DERIVA scalando base e tiers di ogni riga con
 * la percentuale della SUA pista (pay_piste.perc_ragazzi; righe fuori pista
 * = gettoni non scalati). Cambi la lettera o le % dal pannello → il ragazzi
 * si aggiorna da solo.
 */
export async function caricaTabellare(brand: string, monthISO: string): Promise<Tabellare | null> {
    const [ragazzi, azienda, mappa] = await Promise.all([
        caricaTabellareLato(brand, monthISO, "ragazzi"),
        caricaTabellareLato(brand, monthISO, "azienda"),
        caricaMappaSoglie(brand, monthISO),
    ]);
    if (!azienda) return ragazzi;
    // % SCOSTAMENTO SOGLIE (Luca 13/08, unificata sul lato AZIENDA come le
    // altre %): la pista AZIENDA con soglie_pct detta le soglie dei ragazzi —
    // azienda × pct/100 arrotondato. Nuova lettera = si toccano solo le soglie
    // azienda e i ragazzi seguono da soli. La pista ragazzi corrispondente si
    // trova per chiave, o per POSIZIONE se il nome differisce (vas ↔
    // soluzioni_digitali). Vale anche per la % lasciata sul lato ragazzi
    // (retrocompatibilità: vince l'azienda se entrambe presenti).
    const scalaSoglie = (azS: PaySoglia[], pct: number, pistaOut: string): PaySoglia[] => {
        const k = pct / 100;
        const out: PaySoglia[] = [...azS].sort((a, b) => a.tier - b.tier).map((s, i) => ({
            pista: pistaOut, tier: i + 1,
            soglia_da: Math.round(s.soglia_da * k),
            soglia_a: s.soglia_a == null ? null : Math.round(s.soglia_a * k),
        }));
        // il fino-a si riallinea a catena (l'arrotondamento non deve aprire buchi)
        for (let i = 0; i < out.length - 1; i++) out[i].soglia_a = out[i + 1].soglia_da - 1;
        return out;
    };
    const applicaSogliePct = (rag: Tabellare, az: Tabellare): PaySoglia[] => {
        const azOrd = [...az.piste].sort((a, b) => a.ordine - b.ordine);
        const ragOrd = [...rag.piste].sort((a, b) => a.ordine - b.ordine);
        let out = rag.soglie;
        for (const pAz of az.piste) {
            const ragKey = rag.piste.some(x => x.chiave === pAz.chiave)
                ? pAz.chiave
                : ragOrd[azOrd.findIndex(x => x.chiave === pAz.chiave)]?.chiave;
            if (!ragKey) continue;
            const pRag = rag.piste.find(x => x.chiave === ragKey);
            const pct = pAz.soglie_pct ?? pRag?.soglie_pct;   // azienda vince, ragazzi = retrocompat
            if (pct == null) continue;
            const azS = az.soglie.filter(s => s.pista === pAz.chiave);
            if (!azS.length) continue;
            out = [...out.filter(s => s.pista !== ragKey), ...scalaSoglie(azS, Number(pct), ragKey)];
        }
        return out;
    };
    const percDi = new Map(azienda.piste.map(p => [p.chiave, p.perc_ragazzi == null ? 100 : Number(p.perc_ragazzi)]));
    const scala = (v: number | null, pista: string | null) =>
        v == null ? null : Math.round(v * ((pista ? percDi.get(pista) ?? 100 : 100) / 100) * 100) / 100;
    // TAGLIO SOGLIE RAGAZZI (Luca 13/08, W3): pay_piste.soglie_max sul lato
    // azienda = i ragazzi vedono solo le prime N soglie della stessa scala
    // (la loro S1 È la nostra S1), l'ultima diventa aperta; i pay_tiers delle
    // righe derivate si tagliano uguale.
    const maxDi = new Map(azienda.piste.map(p => [p.chiave, p.soglie_max == null ? null : Number(p.soglie_max)]));
    const taglia = (arr: PaySoglia[], pista: string): PaySoglia[] => {
        const max = maxDi.get(pista);
        if (!max || arr.length <= max) return arr;
        const out = [...arr].sort((a, b) => a.tier - b.tier).slice(0, max).map(s => ({ ...s }));
        if (out.length) out[out.length - 1].soglia_a = null;
        return out;
    };
    const tagliaTiers = (tiers: number[], pista: string | null): number[] => {
        const max = pista ? maxDi.get(pista) : null;
        return max ? tiers.slice(0, max) : tiers;
    };
    const deriva = (r: PayRiga): PayRiga => {
        // € FISSI ai ragazzi (Luca 25/08, nato per S4): pay_ragazzi_tiers
        // sulla riga azienda VINCE su mappa e % di pista — la scala ragazzi
        // di QUESTA riga è esattamente quella scritta a mano.
        if (!r.gettone && Array.isArray(r.pay_ragazzi_tiers) && r.pay_ragazzi_tiers.length) {
            return { ...r, pay_base: scala(r.pay_base, r.pista), pay_tiers: tagliaTiers(r.pay_ragazzi_tiers.map(Number), r.pista) };
        }
        // MAPPA SOGLIE (Luca 12/08, modello W3): dove esiste, ogni soglia
        // NOSTRA pesca il valore azienda della soglia LORO mappata e applica
        // la % di quella soglia (settata per pista, mai per prodotto) —
        // la perc_ragazzi di pista non si somma, la mappa la sostituisce.
        const m = r.pista ? mappa.get(r.pista) : undefined;
        if (m && m.size && !r.gettone) {
            const tiers: number[] = [];
            const nMax = Math.max(...Array.from(m.keys()));
            for (let tn = 1; tn <= nMax; tn++) {
                const voce = m.get(tn);
                const az = voce ? r.pay_tiers[voce.tier_loro - 1] : undefined;
                tiers.push(voce == null || az == null ? (null as unknown as number)
                    : Math.round(az * (voce.perc / 100) * 100) / 100);
            }
            return { ...r, pay_base: scala(r.pay_base, r.pista), pay_tiers: tagliaTiers(tiers, r.pista) };
        }
        return {
            ...r,
            pay_base: scala(r.pay_base, r.pista),
            pay_tiers: tagliaTiers(r.pay_tiers.map(v => scala(v, r.pista) as number), r.pista),
        };
    };
    // PISTE SOLO AZIENDA (Luca 13/08, gara business W3 «di rete, resta solo
    // all'azienda»): perc_ragazzi = 0 marca la pista che NON si deriva mai
    // ai ragazzi — sparisce dal loro tabellare invece di comparire a 0€.
    const soloAzienda = (p: PayPista) => Number(p.perc_ragazzi ?? 100) === 0;
    if (!ragazzi) {
        // il ragazzi può avere SOLO gettoni senza piste (es. W3 dopo l'abbandono
        // del vecchio tabellare): ripescali e affiancali al derivato. E può avere
        // SOGLIE PROPRIE senza piste (esito Luca 12/08: la % di derivazione
        // scala solo i pay, le soglie ragazzi si settano a mano) — dove ci sono,
        // vincono su quelle azienda della stessa pista.
        const [orfani, soglieRag] = await Promise.all([
            caricaRigheOrfane(brand, monthISO),
            caricaSoglieLato(brand, monthISO, "ragazzi"),
        ]);
        const manuali = new Set(soglieRag.map(s => s.pista));
        const pisteDer = azienda.piste.filter(p => !soloAzienda(p));
        const chiaviDer = new Set(pisteDer.map(p => p.chiave));
        // % soglie (lato azienda): anche nel derivato pieno le soglie mostrate
        // ai ragazzi sono azienda × pct dove impostata
        const soglieDer = pisteDer.flatMap(p => {
            const azS = azienda.soglie.filter(s => s.pista === p.chiave);
            return taglia(p.soglie_pct == null ? azS : scalaSoglie(azS, Number(p.soglie_pct), p.chiave), p.chiave);
        });
        return {
            ...azienda, derivato: true, lato: "ragazzi",
            piste: pisteDer,
            soglie: [...soglieDer.filter(s => !manuali.has(s.pista)), ...soglieRag],
            righe: [...azienda.righe.filter(r => !r.pista || chiaviDer.has(r.pista)).map(deriva), ...orfani],
        };
    }
    // DERIVAZIONE PARZIALE (allineamento Luca 11/08): le piste azienda che il
    // ragazzi NON ha si derivano (× perc_ragazzi, 100 se non impostata) — così
    // il Calcolatore mostra mappato tutto ciò che l'azienda copre e le
    // "scoperture" diventano la lista vera di ciò che manca su ogni brand.
    const chiaviRag = new Set(ragazzi.piste.map(p => p.chiave));
    const pisteApp = azienda.piste.filter(p => !chiaviRag.has(p.chiave) && !soloAzienda(p));
    const soglieRagEff = applicaSogliePct(ragazzi, azienda);
    if (!pisteApp.length) return { ...ragazzi, soglie: soglieRagEff };
    const chiaviApp = new Set(pisteApp.map(p => p.chiave));
    // le soglie ragazzi (anche manuali, sulle piste derivate) vincono sempre;
    // le piste azienda appese portano le loro soglie × pct dove impostata
    const pisteSoglieRag = new Set(soglieRagEff.map(s => s.pista));
    const soglieApp = pisteApp.flatMap(p => {
        const azS = azienda.soglie.filter(s => s.pista === p.chiave);
        return taglia(p.soglie_pct == null ? azS : scalaSoglie(azS, Number(p.soglie_pct), p.chiave), p.chiave);
    });
    return {
        ...ragazzi, derivato: true,
        piste: [...ragazzi.piste, ...pisteApp],
        soglie: [...soglieRagEff, ...soglieApp.filter(sg => !pisteSoglieRag.has(sg.pista))],
        righe: [...ragazzi.righe, ...azienda.righe.filter(r => r.pista && chiaviApp.has(r.pista)).map(deriva)],
    };
}

/** Mappa soglie loro↔nostre + % (pay_mappa_soglie): pista → (tier_nostro → voce). */
export type VoceMappaSoglie = { tier_loro: number; perc: number };
export async function caricaMappaSoglie(brand: string, monthISO: string): Promise<Map<string, Map<number, VoceMappaSoglie>>> {
    const out = new Map<string, Map<number, VoceMappaSoglie>>();
    const { data } = await supabase.from("pay_mappa_soglie").select("pista, tier_nostro, tier_loro, perc")
        .eq("brand", brand).eq("month", monthISO);
    ((data || []) as Record<string, unknown>[]).forEach(r => {
        const pista = String(r.pista);
        if (!out.has(pista)) out.set(pista, new Map());
        out.get(pista)!.set(Number(r.tier_nostro), { tier_loro: Number(r.tier_loro), perc: Number(r.perc) });
    });
    return out;
}

/** Solo le soglie di un lato (per il ragazzi con soglie manuali senza piste). */
async function caricaSoglieLato(brand: string, monthISO: string, lato: string): Promise<PaySoglia[]> {
    const { data } = await supabase.from("pay_soglie").select("pista, tier, soglia_da, soglia_a")
        .eq("brand", brand).eq("month", monthISO).eq("lato", lato).order("tier");
    return ((data || []) as Record<string, unknown>[]).map(s => ({
        pista: String(s.pista), tier: Number(s.tier),
        soglia_da: Number(s.soglia_da), soglia_a: s.soglia_a == null ? null : Number(s.soglia_a),
    }));
}

/** Righe ragazzi senza pista madre (gettoni orfani, normalizzate). */
async function caricaRigheOrfane(brand: string, monthISO: string): Promise<PayRiga[]> {
    const { data } = await supabase.from("pay_righe")
        .select("id, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione, brand_vendita, provenienza, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, note, ordine, ricorrente")
        .eq("brand", brand).eq("month", monthISO).eq("lato", "ragazzi").eq("attivo", true).order("ordine").limit(1000);
    return ((data || []) as Record<string, unknown>[]).map(r => ({
        ...(r as unknown as PayRiga),
        punti: Number(r.punti || 0),
        pay_base: r.pay_base == null ? null : Number(r.pay_base),
        pay_tiers: Array.isArray(r.pay_tiers) ? (r.pay_tiers as unknown[]).map(Number) : [],
        ricorrente: r.ricorrente == null ? null : Number(r.ricorrente),
    }));
}

/** Tabellare AZIENDA così com'è (per il pannello e le analisi lato azienda). */
export const caricaTabellareAzienda = (brand: string, monthISO: string) => caricaTabellareLato(brand, monthISO, "azienda");

const eq = (a: unknown, b: unknown) =>
    String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/**
 * Match gerarchico: la riga vale se OGNI suo campo non-null coincide col
 * contratto; vince quella con più campi valorizzati (più specifica), a
 * parità la prima per ordine. Nessun match = nessun commissioning (scopertura).
 * brandVendita: brand della VENDITA (catalog_brands.id) — nei contesti misti
 * (lettera A VS che paga anche i pezzi Fastweb) le righe con brand_vendita
 * valorizzato valgono SOLO per quel brand (VF e FW condividono nomi offerta).
 */
/** normalizza un operatore di provenienza per il confronto ("CoopVoce" → "coopvoce") */
const normProv = (v: unknown) => String(v || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
/** la riga con provenienza vale solo se la vendita arriva da uno dei suoi token
 *  (prefisso normalizzato: "coop" prende "CoopVoce", "poste" prende "PosteMobile") */
function provenienzaOk(tokens: string, vendita: unknown): boolean {
    const pv = normProv(vendita);
    if (!pv) return false;
    return tokens.split(",").map(normProv).filter(Boolean).some(t => pv.startsWith(t));
}

export function matchRigaTabellare(
    righe: PayRiga[],
    c: { tipo_cliente?: string | null; categoria?: string | null; prodotto?: string | null; offerta?: string | null; provenienza?: string | null; opzioni?: string | null },
    brandVendita?: string | null,
): PayRiga | null {
    let best: PayRiga | null = null;
    let bestScore = -1;
    for (const r of righe) {
        if (!r.attivo) continue;
        // le righe COMPONENTE vivono solo nel modello additivo (matchComponenti):
        // da sole non significano nulla — senza questo skip una vendita qualsiasi
        // (es. una polizza) agganciava «GA base» a condizioni vuote (baco 14/08)
        if (r.componente) continue;
        // le righe PARTNERSHIP sono un conteggio PARALLELO degli eventi CB
        // (fase analisi dedicata), non alternative del pick-one — a condizioni
        // vuote facevano da catch-all: un telefono finanziato prendeva i 2
        // punti di «Cambio offerta MIA» (caso del direttore, 20/08)
        if (r.pista === "partnership") continue;
        if (r.brand_vendita && brandVendita && !eq(r.brand_vendita, brandVendita)) continue;
        let score = 0;
        if (r.tipo_cliente != null) { if (!eq(r.tipo_cliente, c.tipo_cliente)) continue; score++; }
        if (r.categoria != null) { if (!eq(r.categoria, c.categoria)) continue; score++; }
        if (r.prodotto != null) { if (!eq(r.prodotto, c.prodotto)) continue; score++; }
        if (r.offerta != null) { if (!eq(r.offerta, c.offerta)) continue; score += 2; }   // l'offerta pesa di più
        // PROVENIENZA (Luca 12/08): la riga vincolata alla provenienza vale solo
        // per quelle vendite, e a parità di ancora vince sulla riga generica
        // (TIM MNP +10€ da Iliad/Coop/Poste, Kena STAR da Iliad/FW/Coop/Poste)
        if (r.provenienza != null && r.provenienza.trim() !== "") {
            if (!provenienzaOk(r.provenienza, c.provenienza)) continue;
            score += 2;
        }
        // OPZIONI (Luca 14/08, caso Protecta kit|pagamento): la riga vincolata
        // alle opzioni vale solo se TUTTE le sue voci (separate da |) sono tra
        // le opzioni scelte nella vendita (dettaglio "Opzioni": lista separata
        // da virgole, eventuali quantità "(n)" ignorate) — nomi ESATTI, così
        // «Finanziato» non piglia «Non finanziato»
        if (r.opzione != null && r.opzione.trim() !== "") {
            const scelte = String(c.opzioni || "").split(",")
                .map(x => x.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase()).filter(Boolean);
            const req = r.opzione.split("|").map(x => x.trim().toLowerCase()).filter(Boolean);
            if (!req.every(t => scelte.includes(t))) continue;
            // più opzioni richieste = riga più specifica (es. Pronto+Bollettino
            // deve vincere su Pronto da solo)
            score += 2 * req.length;
        }
        if (score > bestScore || (score === bestScore && best && r.ordine < best.ordine)) {
            best = r; bestScore = score;
        }
    }
    return best;
}

/* ================= MODELLO A COMPONENTI (W3, cantiere 13/08/2026) =================
   La lettera WindTre paga ogni attivazione come SOMMA di componenti: sul mobile
   GA base (o base Underground) + MNP (+1) + Tied (+2/+2,25) + P.IVA (+1) sul
   canone; sul fisso attivazione base + convergenza + P.IVA + FWA (+ le
   componenti da vendita: linea aggiuntiva, FTTH, opzioni — le aggiunge
   l'analisi perché non si deducono dall'offerta). Gli attributi si leggono
   dalle scelte dei ragazzi in Registra Vendita (Luca 13/08): la CATEGORIA dice
   Wallet/Ric. Automatica (= Untied/Tied), il PRODOTTO dice GA o MNP, il TIPO
   CLIENTE dice P.IVA; la provenienza MNP sta nei campi vendita (conteggio). */

/** pista del modello a componenti dalla categoria di catalogo (solo W3) */
export function pistaComponenti(c: { categoria?: string | null }): "mobile" | "fisso" | "lucegas" | null {
    const cat = String(c.categoria || "");
    if (/^mobile\b/i.test(cat)) return "mobile";
    if (/^fisso/i.test(cat)) return "fisso";
    if (/^energia/i.test(cat)) return "lucegas";
    return null;
}

/** componenti che la vendita accende, dedotte dai nomi di catalogo (e, per il
 *  CONTEGGIO W3, da opzioni e provenienza della vendita: righe punti_*) */
export function flagsComponenti(c: { tipo_cliente?: string | null; categoria?: string | null; prodotto?: string | null; offerta?: string | null; opzioni?: string | null; provenienza?: string | null }): Set<string> {
    const f = new Set<string>();
    const off = String(c.offerta || "");
    const prod = String(c.prodotto || "");
    const cat = String(c.categoria || "");
    if (/underground/i.test(off)) f.add("base_underground");
    if (/\bmnp\b/i.test(prod) || /\bmnp\b/i.test(off)) f.add("mnp");
    if (/ric\.?\s*auto/i.test(cat)) f.add("tied");
    if (/business/i.test(String(c.tipo_cliente || ""))) f.add("piva");
    if (/\bconv\b|convergente/i.test(off)) f.add("conv");
    if (/\bfwa\b|super internet/i.test(prod + " " + off)) f.add("fwa");
    // COMPENSO CONTRATTUALE (flat, lettera W3): mobile Untied 1€ / Tied 5€;
    // fisso 23€ · 19€ convergenti · 17€ Voce Casa — la componente giusta si
    // accende qui, gli importi vivono nelle righe gettone `contrattuale_*`
    if (/^mobile\b/i.test(cat)) f.add(f.has("tied") ? "contrattuale_tied" : "contrattuale_untied");
    if (/^fisso/i.test(cat)) f.add(f.has("conv") ? "contrattuale_conv" : (/voce\s*casa/i.test(off) ? "contrattuale_voce" : "contrattuale"));
    // CONTEGGI ED EXTRA DALLE OPZIONI della vendita (Luca 14/08): le opzioni
    // stanno nel dettaglio "Opzioni" come lista separata da virgole (eventuali
    // quantità "(n)" in coda) — confronto per nome ESATTO, non substring
    const opzList = String(c.opzioni || "").split(",")
        .map(x => x.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase()).filter(Boolean);
    const ha = (...nomi: string[]) => nomi.some(n => opzList.includes(n));
    // mobile: Security (GA 0,75 → 1), provenienza MNP, Staff
    if (ha("security", "security pro")) f.add("punti_security");
    if (c.provenienza != null && /^(iliad|coop|poste|tiscali)/i.test(String(c.provenienza).trim())) f.add("punti_mnp_prov");
    if (/professional staff/i.test(off)) f.add("punti_staff");
    // fisso: gli extra della slide agganciati alle opzioni del catalogo
    if (ha("netflix")) f.add("netflix");                       // 10 € + 0,5 punti
    // «Più Sicuri Casa&Ufficio» in lettera = a catalogo «Più Sicuri Ufficio»
    // (business) E «Home Protect» (consumer) — senza il secondo nome le 27
    // Home Protect di agosto non prendevano lo 0,25 (segnalazione Luca 19/08)
    if (ha("più sicuri ufficio") || ha("home protect")) f.add("pscu");   // 2 € + 0,25 punti
    if (ha("cloud")) f.add("cloud");                           // 8 €, non conta in soglia
    if (/professional box/i.test(off)) f.add("fritz");         // +40 € e +1 punto (FRITZ!Box)
    // 2ª linea Professional (opzione a canone, chiarimento Luca 14/08): per
    // Wind3 è UN ALTRO FISSO con canone 10 € → paga il moltiplicatore base
    // della soglia sul SUO canone (riga a € per soglia 20/30/35/40/50) più il
    // contrattuale dedicato 10 €, e conta 1,5 in soglia — pescata dall'opzione
    if (ha("2°linea", "2° linea")) { f.add("seconda_linea"); f.add("contrattuale_2linea"); }
    // Luce&Gas (scorporo Luca 14/08: il delta 35 della slide = 25 convergenza
    // già dentro le offerte Multiservice + 10 pronto assistenza): modificatori
    // additivi dalle opzioni — Pronto +10, Bollettino −15 (no SDD)
    if (ha("pronto intervento")) f.add("lg_pronto");
    if (ha("bollettino")) f.add("lg_bollettino");
    if (ha("ftth", "ftth extra")) f.add("ftth");               // componente +1 ×canone
    if (ha("chiamate illimitate", "internazionali")) f.add("opzioni");   // componente 0,25-1,5 ×canone
    // L.A della lettera FISSO (Luca 25/08 sera: componente dimenticata):
    // +1 ×canone quando l'acquisizione è una GNP — l'opzione GNP del
    // catalogo (gruppo Attivazione, con la tendina «Operatore GNP») è il
    // segnale; GA è l'opzione neutra dello stesso gruppo
    if (ha("gnp")) f.add("la");
    return f;
}

/** Il set additivo per la vendita: base della pista + extra accese. NULL se il
 *  tabellare non ha componenti per quella pista (si resta al pick-one). */
export function matchComponenti(
    righe: PayRiga[],
    // opzioni/provenienza servono a flagsComponenti — il pannello le passa
    // anche SIMULATE (declinazioni del fisso, Luca 25/08 notte)
    c: { tipo_cliente?: string | null; categoria?: string | null; prodotto?: string | null; offerta?: string | null; opzioni?: string | null; provenienza?: string | null },
): PayRiga[] | null {
    const pista = pistaComponenti(c);
    if (!pista) return null;
    const comp = righe.filter(r => r.attivo && r.componente && r.pista === pista);
    if (!comp.length) return null;
    const flags = flagsComponenti(c);
    const out: PayRiga[] = [];
    // BASE: tra le basi che matchano le condizioni della vendita vince la più
    // specifica (le basi Luce&Gas sono per offerta/tipo cliente); sul mobile
    // la variante Underground entra solo col suo flag e allora vince
    const basi = comp.filter(r => r.componente === "base" || r.componente === "base_underground");
    let base: PayRiga | undefined; let bs = -1;
    for (const r of basi) {
        if (r.componente === "base_underground" && !flags.has("base_underground")) continue;
        let s = r.componente === "base_underground" ? 10 : 0;
        if (r.tipo_cliente != null) { if (!eq(r.tipo_cliente, c.tipo_cliente)) continue; s++; }
        if (r.categoria != null) { if (!eq(r.categoria, c.categoria)) continue; s++; }
        if (r.prodotto != null) { if (!eq(r.prodotto, c.prodotto)) continue; s++; }
        if (r.offerta != null) { if (!eq(r.offerta, c.offerta)) continue; s += 2; }
        if (s > bs) { base = r; bs = s; }
    }
    if (base) out.push(base);
    for (const r of comp) {
        if (r.componente === "base" || r.componente === "base_underground") continue;
        if (flags.has(String(r.componente))) out.push(r);
    }
    return out.length ? out : null;
}

/** Righe pay della vendita: il set additivo dove esiste, altrimenti la singola
 *  riga classica (array vuoto = scopertura). La prima riga del set è la base:
 *  porta pista, gettone e moltiplicatore per chi deve mostrare i metadati. */
export function matchRigheAttivazione(
    righe: PayRiga[],
    c: { tipo_cliente?: string | null; categoria?: string | null; prodotto?: string | null; offerta?: string | null; provenienza?: string | null; opzioni?: string | null },
    brandVendita?: string | null,
): PayRiga[] {
    const comp = matchComponenti(righe, c);
    if (comp) return comp;
    const r = matchRigaTabellare(righe, c, brandVendita);
    return r ? [r] : [];
}

/** € (o moltiplicatore totale) del set alla soglia: somma dei payPerRiga. */
export function payPerRighe(set: PayRiga[], tier: number): number | null {
    let tot = 0, trovato = false;
    for (const r of set) {
        const v = payPerRiga(r, r.gettone ? 0 : tier);
        if (v != null) { tot += v; trovato = true; }
    }
    return trovato ? Math.round(tot * 100) / 100 : null;
}

/** punti in soglia del set (le componenti sommano anche il conteggio:
 *  es. fisso base 1 + P.IVA 0,5 = 1,5 come da lettera) */
export function puntiPerRighe(set: PayRiga[]): number {
    return Math.round(set.reduce((s, r) => s + Number(r.punti || 0), 0) * 100) / 100;
}

/** € COMPLESSIVI dell'attivazione alla soglia: componenti a moltiplicatore
 *  ×canone + gettoni flat del set (compenso contrattuale…). null se una
 *  componente a moltiplicatore c'è ma manca il canone a catalogo. */
export function payEuroAttivazione(set: PayRiga[], tier: number, canone: number | null | undefined): number | null {
    if (!set.length) return null;
    let tot = 0;
    for (const r of set) {
        const v = payPerRiga(r, r.gettone ? 0 : tier);
        if (v == null) continue;
        if (r.moltiplicatore) {
            if (canone == null) return null;
            tot += canone * v;
        } else tot += v;
    }
    return Math.round(tot * 100) / 100;
}

/**
 * REGOLA GENERALE (Luca 10/08): le SOSTITUZIONI SIM — di TUTTI gli operatori —
 * non generano né commissioning né punti in gara. Escluse alla radice: non
 * sono "scoperture", sono fuori dal perimetro. I contracts scrivono il
 * prodotto ("Sostituzione SIM"), il catalogo anche la categoria.
 */
export function sostituzioneSim(c: { categoria?: string | null; prodotto?: string | null }): boolean {
    return /sostituzion/i.test(String(c.prodotto || "")) || /sostituzion/i.test(String(c.categoria || ""));
}

/**
 * Vendite FUORI dalle gare per regola aziendale: sostituzioni SIM (tutti gli
 * operatori) e le SIM Easy Control ("va considerata come una sostituzione" —
 * Luca 11/08). Né commissioning né punti, e nel Calcolatore non sono
 * "scoperture" ma escluse dichiarate.
 */
export function esclusaDalleGare(c: { categoria?: string | null; prodotto?: string | null; offerta?: string | null }): boolean {
    if (sostituzioneSim(c)) return true;
    // "vanno trattate come una sostituzione" (Luca 11/08): Easy Control (VF)
    // e Smart Security (W3) — né commissioning né punti.
    if (/^(easy control|smart security)$/i.test(String(c.offerta || "").trim())) return true;
    return false;
}

/** Perimetro v1 della produzione che conta per le gare. */
export function produzioneValidaGare(c: ContrattoPay): boolean {
    if (!String(c.id || "").startsWith("CTR-")) return false;   // solo pratiche brand
    if (c.nascosta_gestione === true) return false;
    if (/annull/i.test(String(c.stato || ""))) return false;
    if (esclusaDalleGare(c)) return false;
    return true;
}

/** CUTOFF dell'ora di scatto (esito Luca 12/08 sul Calendario gare): prima
 *  dell'ora di scatto le vendite di OGGI non esistono per il perimetro gare —
 *  niente commissioning, niente proiezioni: la produzione resta ferma al
 *  giorno precedente e allo scatto la giornata entra tutta insieme (coerente
 *  con "trascorsi" di giorniLavorativiMese, che conta oggi solo dopo l'ora).
 *  Ritorna il giorno da escludere ("YYYY-MM-DD") o null se si conta tutto. */
export async function cutoffProduzione(monthISO: string): Promise<string | null> {
    const oggi = new Date();
    const ymdOggi = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}-${String(oggi.getDate()).padStart(2, "0")}`;
    if (!ymdOggi.startsWith(monthISO.slice(0, 7))) return null;    // mese diverso da oggi: niente da tagliare
    const { data } = await supabase.from("pay_giorni_lavorativi").select("ora_scatto").eq("month", monthISO).maybeSingle();
    const ora = data?.ora_scatto == null ? 19 : Number(data.ora_scatto);
    return oggi.getHours() < ora ? ymdOggi : null;
}

/** Contratti del brand nel mese (demo escluse in query, tetto 1000 superato).
 *  Le vendite di oggi entrano solo dopo l'ora di scatto (cutoffProduzione). */
export async function caricaContrattiMese(brandLabelPrefix: string, monthISO: string): Promise<ContrattoPay[]> {
    const { primo, ultimo } = estremiMese(monthISO);
    const escludiOggi = await cutoffProduzione(monthISO);
    type Raw = ContrattoPay & { dettagli?: Record<string, unknown> | null };
    const { data } = await caricaTutte<Raw>((from, to) =>
        supabase.from("contracts")
            .select("id, brand, negozio, venditore, data, stato, tipo_cliente, categoria, prodotto, offerta, nascosta_gestione, dettagli")
            .ilike("brand", `${brandLabelPrefix}%`)
            .gte("data", primo).lte("data", ultimo)
            .or("is_demo.is.null,is_demo.eq.false")
            .order("id").range(from, to) as unknown as PromiseLike<{ data: Raw[] | null; error: { message?: string } | null }>);
    return (data || []).map(r => {
        const d = (r.dettagli || {}) as Record<string, unknown>;
        const cod = d["Cod.Ins."] ?? d["Codice Inserimento"] ?? null;
        // categoria_catalogo (flusso catalogo): la categoria VERA del catalogo
        // ("Mobile Ric. Auto"/"Mobile Wallet") — la colonna porta la macro
        // ("Mobile") e non basta alle righe pay ancorate alla categoria.
        const catCat = d["categoria_catalogo"];
        const { dettagli: _d, ...resto } = r;
        const prov = d["Operatore di Provenienza"];
        const opz = d["Opzioni"];
        return {
            ...resto,
            categoria: catCat ? String(catCat) : r.categoria,
            cod_ins: cod == null ? null : String(cod),
            provenienza: prov == null ? null : String(prov),
            opzioni: opz == null ? null : String(opz),
        };
    }).filter(c => produzioneValidaGare(c) && (!escludiOggi || String(c.data || "").slice(0, 10) !== escludiOggi));
}

/**
 * CONTESTI VF/FW (mappa di Luca 10/08, "dropzone (1).pdf" + correzione 10/08
 * notte): T1 = Telefutura (Vodafone Store), T2 = Telefutura 2 (multibrand
 * VND). LATO RAGAZZI — che è quello che il motore paga — TUTTO il Vodafone
 * conta e paga come Vodafone Store (lettera A): la distinzione VND esiste
 * solo LATO AZIENDA (cantiere futuro sui PDF delle lettere). Il Fastweb
 * invece si SPLITTA anche lato ragazzi, col CODICE DI INSERIMENTO (il
 * negozio del codice, non quello di attribuzione):
 *   - FW codici dei 4 VS (Acilia/Baleniere/Castani/Merulana) → "vodafone"
 *     (ricade nella lettera A e nel commissioning VS)
 *   - FW codici Donna/Magliana/Garbatella/Promontori → "fastweb" (T2)
 * Le chiavi contesto SONO le chiavi brand delle tabelle pay. Codice assente →
 * ripiego sul negozio di attribuzione (prima parola); irriconoscibile → null.
 */
const CTX_VF_T1 = ["acilia", "baleniere", "castani", "merulana"];
const CTX_FW_T2 = ["donna", "magliana", "garbatella", "promontori"];

export function contestoVfFw(brandId: string | null, codice: string | null, negozio?: string | null, categoria?: string | null): string | null {
    // LATO RAGAZZI (11/08): ogni brand paga col SUO tabellare — Vodafone
    // sempre lettera A, Fastweb sempre tabellare Fastweb — CON UNA ECCEZIONE
    // (task Luca 11/08): l'ENERGIA Fastweb venduta coi codici dei Vodafone
    // Store (T1) paga il tabellare a soglie della lettera A (pista luce/gas
    // del contesto vodafone); l'energia T2 paga il tabellare fastweb (dal
    // 25/08 la luce è a scaglioni propri, il gas resta gettone).
    // Lo split T1/T2 completo coi codici servirà al lato AZIENDA (cantiere PDF).
    // FW T1 = calderone unico con Vodafone (task Luca 11/08): TUTTO il
    // Fastweb venduto coi codici dei Vodafone Store paga la lettera A.
    if (brandId === "fastweb") {
        const ref = String(codice || "").trim().toLowerCase() || String(negozio || "").trim().toLowerCase();
        if (CTX_VF_T1.some(x => ref.startsWith(x))) return "vodafone";
    }
    return brandId;
}
export const CTX_CODICI_T1 = CTX_VF_T1;
export const CTX_CODICI_FW_T2 = CTX_FW_T2;

/** Etichette leggibili dei contesti pay. */
export const CONTESTI_LABEL: Record<string, string> = {
    vodafone: "Vodafone · lettera A (lato ragazzi vale per tutte le attivazioni VF)",
    fastweb: "Fastweb (lato ragazzi: tutte le attivazioni FW; MNP/OLO da Vodafone escluse)",
};

/**
 * Contratti del MESE che allocano nel contesto pay richiesto. Per i contesti
 * VF/FW carica i brand coinvolti e smista col codice inserimento; per gli
 * altri brand equivale a caricaContrattiMese. nonAllocate = vendite VF/FW
 * del perimetro senza codice/negozio riconducibile a un contesto.
 */
export async function caricaContrattiContesto(
    contesto: string, monthISO: string, prefixAltriBrand?: string,
): Promise<{ contratti: ContrattoPay[]; nonAllocate: number; escluseVodafone: number }> {
    // il contesto vodafone (lettera A) include anche l'ENERGIA Fastweb dei VS
    const fonti: string[] =
        contesto === "vodafone" ? ["Vodafone", "Fastweb"] :
        contesto === "fastweb" ? ["Fastweb"] : [prefixAltriBrand || contesto];
    const tutti = (await Promise.all(fonti.map(p => caricaContrattiMese(p, monthISO)))).flat();
    let escluseVodafone = 0;
    const contratti = tutti.filter(c => {
        // REGOLE LETTERE (agosto): Fastweb T2 — MNP/OLO di provenienza
        // VODAFONE fuori da target e compenso; lettera A Vodafone Store —
        // MNP di provenienza Vodafone/Fastweb/Ho. escluse (mobile).
        const prov = String(c.provenienza || "");
        if (contesto === "fastweb" && /vodafone/i.test(prov)) { escluseVodafone++; return false; }
        if (contesto === "vodafone" && /mnp/i.test(String(c.prodotto || "")) && /vodafone|fastweb|\bho\b|ho\./i.test(prov)) { escluseVodafone++; return false; }
        return contestoVfFw(brandIdDaLabel(c.brand), c.cod_ins, c.negozio, c.categoria) === contesto;
    });
    return { contratti, nonAllocate: 0, escluseVodafone };
}

/**
 * PARTNERSHIP REWARD W3 (cantiere acceso 21/08 notte): conteggio PARALLELO
 * degli eventi Customer Base — pick-one tra le SOLE righe pista "partnership"
 * che abbiano ALMENO una condizione (le righe senza condizioni restano voci
 * di listino in attesa di mappatura: mai più catch-all, lezione del 20/08).
 * Stessa semantica del pick-one classico: uguaglianze esatte, offerta pesa
 * di più, opzioni tutte richieste (separate da |).
 */
export function matchRigaPartnership(
    righe: PayRiga[],
    c: { tipo_cliente?: string | null; categoria?: string | null; prodotto?: string | null; offerta?: string | null; provenienza?: string | null; opzioni?: string | null },
): PayRiga | null {
    let best: PayRiga | null = null;
    let bestScore = -1;
    for (const r of righe) {
        if (!r.attivo || r.pista !== "partnership") continue;
        // la stringa vuota NON è una condizione (una riga svuotata dal pannello
        // tornerebbe quasi-catch-all sui contratti col campo vuoto)
        const piena = (x: unknown) => x != null && String(x).trim() !== "";
        const haCondizioni = piena(r.tipo_cliente) || piena(r.categoria) || piena(r.prodotto)
            || piena(r.offerta) || piena(r.opzione) || piena(r.provenienza);
        if (!haCondizioni) continue;
        let score = 0;
        if (piena(r.tipo_cliente)) { if (!eq(r.tipo_cliente, c.tipo_cliente)) continue; score++; }
        if (piena(r.categoria)) { if (!eq(r.categoria, c.categoria)) continue; score++; }
        if (piena(r.prodotto)) { if (!eq(r.prodotto, c.prodotto)) continue; score++; }
        if (piena(r.offerta)) { if (!eq(r.offerta, c.offerta)) continue; score += 2; }
        if (r.provenienza != null && r.provenienza.trim() !== "") {
            if (!provenienzaOk(r.provenienza, c.provenienza)) continue;
            score += 2;
        }
        if (r.opzione != null && r.opzione.trim() !== "") {
            const scelte = String(c.opzioni || "").split(",")
                .map(x => x.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase()).filter(Boolean);
            const req = r.opzione.split("|").map(x => x.trim().toLowerCase()).filter(Boolean);
            if (!req.every(t => scelte.includes(t))) continue;
            score += 2 * req.length;
        }
        if (score > bestScore || (score === bestScore && best && r.ordine < best.ordine)) {
            best = r; bestScore = score;
        }
    }
    return best;
}

export type AvanzamentoPista = {
    chiave: string; nome: string; punti: number; pezzi: number;
    tier: number;                       // 0 = sotto la prima soglia
    soglia: PaySoglia | null;           // soglia raggiunta
    prossima: PaySoglia | null;         // prossima da prendere
    mancano: number | null;             // punti alla prossima
    gate?: string | null;               // vincolo che tiene bassa la soglia (W3: 4ª mobile ← 2ª fisso)
};

export type Avanzamento = {
    piste: Record<string, AvanzamentoPista>;
    contati: number;                    // contratti agganciati a una riga
    pivaMobile: number;                 // attivazioni mobile Business del mese (malus W3)
    malus30Mobile: boolean;             // W3: premio mobile −30% se no 1ª soglia fisso o <6 P.IVA mobile
    scartati: { categoria: string | null; prodotto: string | null; offerta: string | null; n: number }[];
};

export function calcolaAvanzamento(tab: Tabellare, contratti: ContrattoPay[]): Avanzamento {
    const punti: Record<string, number> = {};
    const pezzi: Record<string, number> = {};
    const scartatiMap = new Map<string, { categoria: string | null; prodotto: string | null; offerta: string | null; n: number }>();
    let contati = 0;
    let pivaMobile = 0;
    let puntiTelMobile = 0;
    let simSky = 0;
    let fisseResShp = 0;
    for (const c of contratti) {
        // set additivo (componenti W3) o singola riga classica: la prima
        // riga porta la pista, i punti si sommano su tutto il set
        const set = matchRigheAttivazione(tab.righe, c, brandIdDaLabel(c.brand));
        if (!set.length) {
            const k = `${c.categoria}|${c.prodotto}|${c.offerta}`;
            const e = scartatiMap.get(k) || { categoria: c.categoria, prodotto: c.prodotto, offerta: c.offerta, n: 0 };
            e.n++; scartatiMap.set(k, e);
            continue;
        }
        contati++;
        const pista = set[0].pista;
        if (pista) {
            const p = puntiPerRighe(set);
            punti[pista] = (punti[pista] || 0) + p;
            pezzi[pista] = (pezzi[pista] || 0) + 1;
            // gli smartphone (categoria Telefono a Rate) si accumulano a parte:
            // servono al cap VF qui sotto
            if (pista === "mobile" && /^telefono a rate/i.test(String(c.categoria || ""))) puntiTelMobile += p;
        }
        if (pista === "mobile" && /business/i.test(String(c.tipo_cliente || ""))) pivaMobile++;
        // pda fisse res o shp (cancelletto Fastweb qui sotto): le small
        // Web Business/Unlimited non aprono la gara mobile. Il \b evita che
        // «web business» peschi per sottostringa le «Fastweb Business…»
        // (shp, che contano) — rilievo del revisore 25/08.
        if ((pista === "fisso" || pista === "business_fisso")
            && !/unlimited|\bweb business/i.test(String(c.offerta || ""))) fisseResShp++;
        // cancelletto Sky (lettera GOLD): contano MNP (qualsiasi ricarica) e
        // GA con Ricarica automatica — la ricarica pura no
        if (tab.brand === "sky" && (/^mobile mnp$/i.test(String(c.prodotto || ""))
            || (/^mobile ga$/i.test(String(c.prodotto || "")) && /ric\.? ?auto/i.test(String(c.categoria || ""))))) simSky++;
    }
    // CAP 35% VF (lettera agosto, §Pista Mobile Consumer): gli smartphone
    // (0,5 rateale · 1 finanziato) valgono fino al 35% del valore delle SIM
    // Voce Mobile — l'eccedenza non conta verso la soglia.
    if (tab.brand === "vodafone" && puntiTelMobile > 0) {
        const sim = (punti["mobile"] || 0) - puntiTelMobile;
        const ammessi = Math.round(sim * 0.35 * 100) / 100;
        if (puntiTelMobile > ammessi) punti["mobile"] = sim + ammessi;
    }
    const piste: Record<string, AvanzamentoPista> = {};
    // PISTA APPOGGIATA (S4 25/08, «la soglia è unica»): i pezzi delle piste
    // con soglie_di si sommano nel conteggio della MADRE prima di leggere le
    // soglie — il canvass 75/150 conta TUTTI i PDP, il commissioning resta
    // diviso per sezione. A video ogni sezione conserva i suoi punti/pezzi.
    for (const p of tab.piste) {
        if (!p.soglie_di || p.soglie_di === p.chiave) continue;
        punti[p.soglie_di] = Math.round(((punti[p.soglie_di] || 0) + (punti[p.chiave] || 0)) * 100) / 100;
    }
    for (const p of tab.piste) {
        const rifer = p.soglie_di || p.chiave;
        const scala = tab.soglie.filter(s => s.pista === rifer).sort((a, b) => a.tier - b.tier);
        const val = Math.round((punti[p.chiave] || 0) * 100) / 100;
        const valScala = Math.round((punti[rifer] || 0) * 100) / 100;
        let presa: PaySoglia | null = null;
        for (const s of scala) if (valScala >= s.soglia_da) presa = s;
        const prossima = scala.find(s => s.soglia_da > valScala) || null;
        piste[p.chiave] = {
            chiave: p.chiave, nome: p.nome, punti: val, pezzi: pezzi[p.chiave] || 0,
            tier: presa ? presa.tier : 0, soglia: presa, prossima,
            mancano: prossima ? Math.round((prossima.soglia_da - valScala) * 100) / 100 : null,
        };
    }
    // VINCOLO W3 (lettera agosto): l'accesso alla 4ª soglia mobile è
    // subordinato al raggiungimento della 2ª soglia della pista fisso —
    // senza, il mobile resta S3 (il gate lo racconta alla UI).
    if (tab.brand === "windtre") {
        const mob = piste["mobile"], fis = piste["fisso"];
        if (mob && fis && mob.tier >= 4 && fis.tier < 2) {
            const scalaM = tab.soglie.filter(s => s.pista === "mobile").sort((a, b) => a.tier - b.tier);
            piste["mobile"] = {
                ...mob, tier: 3,
                soglia: scalaM.find(s => s.tier === 3) || null,
                prossima: scalaM.find(s => s.tier === 4) || null, mancano: null,
                gate: "4ª soglia bloccata: serve la 2ª soglia del fisso",
            };
        }
    }
    // CANCELLETTO SKY (lettera GOLD agosto, lato AZIENDA): l'accesso alle
    // soglie oltre la 1ª è subordinato ad almeno 6 vendite tra Sky Mobile MNP
    // e no MNP con Ricarica automatica — senza, si resta in soglia 1. Vale
    // solo per la gara GOLD (la gara ragazzi ha soglie proprie senza vincolo).
    if (tab.brand === "sky" && tab.lato === "azienda") {
        const sk = piste["sky"];
        if (sk && sk.tier >= 2 && simSky < 6) {
            const scala = tab.soglie.filter(s => s.pista === "sky").sort((a, b) => a.tier - b.tier);
            piste["sky"] = {
                ...sk, tier: 1,
                soglia: scala.find(s => s.tier === 1) || null,
                prossima: scala.find(s => s.tier === 2) || null, mancano: null,
                gate: `soglie oltre la 1ª bloccate: servono 6 SIM (MNP + Ric. automatica), fatte ${simSky}`,
            };
        }
    }
    // CANCELLETTO FASTWEB (piano agosto, §Gara mobile): si accede alla gara
    // mobile (res e business) solo con ALMENO 2 pda fisse (res o shp) nel
    // mese — sotto, ogni sim resta al compenso base («di cui base», tier 0).
    // Vale su entrambi i lati (il ragazzi fastweb è derivato dall'azienda).
    if (tab.brand === "fastweb") {
        const mob = piste["mobile"];
        if (mob && mob.tier >= 1 && fisseResShp < 2) {
            const scalaM = tab.soglie.filter(s => s.pista === "mobile").sort((a, b) => a.tier - b.tier);
            piste["mobile"] = {
                ...mob, tier: 0, soglia: null,
                prossima: scalaM.find(s => s.tier === 1) || null, mancano: null,
                gate: `gara mobile chiusa: servono 2 pda fisse (res o shp), fatte ${fisseResShp}`,
            };
        }
    }
    // MALUS W3 −30% sul premio della gara mobile: scatta se il mese chiude
    // senza la 1ª soglia fisso o con meno di 6 attivazioni P.IVA mobile.
    const malus30Mobile = tab.brand === "windtre" && !!piste["mobile"] && !!piste["fisso"]
        && (piste["fisso"].tier < 1 || pivaMobile < 6);
    return { piste, contati, pivaMobile, malus30Mobile, scartati: [...scartatiMap.values()].sort((a, b) => b.n - a.n) };
}

/**
 * GIORNI LAVORATIVI del mese (Prospect, Luca 11/08): lun-sab meno i
 * giorni_festivi; pay_giorni_lavorativi tiene l'override manuale del totale.
 * trascorsi = giorni lavorativi da inizio mese a OGGI incluso (0 se il mese
 * deve ancora iniziare, = totali se è finito).
 */
export async function giorniLavorativiMese(monthISO: string): Promise<{
    totali: number; trascorsi: number; override: boolean;
    oraScatto: number; proiezioneDal: number; mostraProiezione: boolean;
    congelati: number[]; festivi: string[];
}> {
    const { primo, ultimo } = estremiMese(monthISO);
    const [ov, fest] = await Promise.all([
        supabase.from("pay_giorni_lavorativi").select("giorni, ora_scatto, proiezione_dal, congelati").eq("month", monthISO).maybeSingle(),
        // ⚠️ la colonna è "giorno", NON "data" (bug del Prospect 11/08 trovato
        // da Luca il 13/08: la query falliva in silenzio e i festivi erano
        // ZERO — Ferragosto contato come giorno lavorativo)
        supabase.from("giorni_festivi").select("giorno").gte("giorno", primo).lte("giorno", ultimo),
    ]);
    const festivi = new Set((fest.data || []).map(f => String((f as { giorno: string }).giorno).slice(0, 10)));
    const [y, m] = monthISO.split("-").map(Number);
    const nGiorni = new Date(y, m, 0).getDate();
    const oraScatto = ov.data?.ora_scatto == null ? 19 : Number(ov.data.ora_scatto);
    const proiezioneDal = ov.data?.proiezione_dal == null ? 1 : Number(ov.data.proiezione_dal);
    // GIORNI CONGELATI (Luca 13/08): tutti i negozi chiusi — fuori dal
    // conteggio (totali e trascorsi) esattamente come i festivi
    const congelati = new Set(((ov.data?.congelati as number[] | null) || []).map(Number));
    const oggi = new Date();
    const oggiISO = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}-${String(oggi.getDate()).padStart(2, "0")}`;
    let totali = 0, trascorsi = 0;
    for (let g = 1; g <= nGiorni; g++) {
        const iso = `${y}-${String(m).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
        const dow = new Date(y, m - 1, g).getDay();
        if (dow === 0 || festivi.has(iso) || congelati.has(g)) continue;   // domeniche, festivi e congelati fuori
        totali++;
        // ORA DI SCATTO (Luca 11/08): il giorno corrente conta come trascorso
        // solo dopo quell'ora — prima, le proiezioni non lo considerano.
        if (iso < oggiISO || (iso === oggiISO && oggi.getHours() >= oraScatto)) trascorsi++;
    }
    const overrideGiorni = ov.data?.giorni == null ? null : Number(ov.data.giorni);
    if (overrideGiorni != null) {
        trascorsi = Math.min(trascorsi, overrideGiorni);
        totali = overrideGiorni;
    }
    // la proiezione si mostra solo dal giorno scelto del mese (mesi passati: sempre)
    const meseCorrente = oggiISO.slice(0, 7) === monthISO.slice(0, 7);
    const mostraProiezione = !meseCorrente ? true : oggi.getDate() >= proiezioneDal;
    return {
        totali, trascorsi, override: overrideGiorni != null, oraScatto, proiezioneDal, mostraProiezione,
        congelati: [...congelati].sort((a, b) => a - b), festivi: [...festivi].sort(),
    };
}

/** € per attivazione della riga alla soglia data (0 = sotto soglia → base). */
export function payPerRiga(riga: PayRiga, tier: number): number | null {
    if (riga.gettone) return riga.pay_base;
    if (tier <= 0) return riga.pay_base;
    const t = riga.pay_tiers;
    if (!t.length) return riga.pay_base;
    return t[Math.min(tier, t.length) - 1];
}
