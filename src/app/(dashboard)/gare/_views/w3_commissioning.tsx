"use client";

/* COMMISSIONING € FRANCHISING W3 — l'ESPLOSIONE del pay per attivazione:
   ogni tipo di vendita col suo € per soglia, già pronto da pescare —
   l'analisi dovrà solo dire quale soglia ha raggiunto il PDV/la rete.
   COMPLETATO 14/08 (Luca «ora passo al commissioning»): oltre alle piste a
   canone (mobile/fisso additive come la lettera, assicurazioni a
   moltiplicatore) qui vivono anche Business P.IVA (premio unitario a evento
   per soglia di rete — la colonna S4 da 55€ esiste solo col BP Plus+ e non
   si mostra), Luce&Gas (gettoni a scala) e Customer Base (gettoni flat).
   Le componenti non deducibili dall'offerta (linea aggiuntiva, FTTH,
   opzioni) le aggiunge l'analisi: elencate sotto le tabelle. */

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { esclusaDalleGare, matchComponenti, matchRigaTabellare, matchRigheGaraParallela, puntiPerRighe, PayRiga , caricaTabellare } from "@/lib/commissioning";
import { cn } from "@/utils";
import { SIM_TESTO, conSim } from "@/components/IconaSim";

interface OffCanone {
    id: string; nome: string; canone: number; prodotto: string; tipo_cliente: string; categoria: string;
}

// sezioni della scheda: canone = esploso per offerta (canone × componenti);
// evento = € diretti per soglia; flat = gettone secco per evento
// la gara BUSINESS non è più una sezione a parte (Luca 14/08): è un premio a
// evento che SI SOMMA all'attivazione — vive nelle colonne 💼 dentro Mobile,
// Fisso e sulla riga business di Luce&Gas.
// SEPARAZIONE DEI COLORI (Luca 14/08 sera-3): il VERDE è riservato a ciò che
// è CALCOLATO dalle Regole di gara (canone × componenti); i GETTONI one-shot
// della lettera (telefoni, Luce&Gas, Customer Base) vivono QUI in celle
// EDITABILI — di serie li riempirà l'upload della gara mensile.
const SEZIONI = [
    { id: "mobile", label: `${SIM_TESTO} Mobile`, tipo: "canone", sub: "canone × componenti (base + MNP + Tied + P.IVA) + contrattuale — le colonne 💼 sono il premio a evento della gara Business, in aggiunta" },
    { id: "device", label: "📞 Telefoni & device", tipo: "device", sub: "gettoni one-shot della lettera per fascia di prezzo e finanziamento — editabili; l'analisi li aggancia al modello scelto in Registra Vendita" },
    { id: "fisso", label: "🏠 Fisso", tipo: "canone", sub: "canone × componenti (base + Convergenza + FWA + P.IVA) + contrattuale — le colonne 💼 sono il premio a evento della gara Business, in aggiunta" },
    { id: "fisso_extra", label: "🎁 Extra fisso", tipo: "device", sub: "gettoni delle opzioni (Netflix, Cloud, Più Sicuri Ufficio, FRITZ!Box) — editabili; si accendono da soli dalle opzioni della vendita e si sommano al pay del fisso" },
    { id: "lucegas", label: "⚡ Luce & Gas", tipo: "evento", sub: "gettoni a scala per offerta (la convergenza +25 è già dentro le Multiservice) + modificatori: Pronto assistenza +10, Bollettino −15 — sul microbusiness in più le colonne 💼 della gara Business" },
    { id: "assicurazioni", label: "🛡 Assicurazioni", tipo: "canone", sub: "canone della polizza × moltiplicatore (dalle Regole di gara)" },
    { id: "protetti", label: "🏠🛡 W3 Protetti (kit)", tipo: "device", sub: "commissioning dei kit dalla slide — editabile; si distingue col kit scelto in vendita, manca solo il dato finanziato/non (campo in arrivo)" },
    { id: "cb", label: "🔁 Customer Base", tipo: "flat", sub: "gettone per evento, senza soglia — editabile" },
    { id: "smartphone_cb", label: "📱🏆 Extra Smartphone CB 5G", tipo: "evento", sub: "slide 11: 15 € per ogni smartphone 5G su Customer Base con street price ≥ 200 €, al raggiungimento di 45 5G per punto vendita (×4 PDV in gara = 180). Le righe «solo conteggio» fanno avanzare la soglia senza pagare, come dice la lettera" },
] as const;

// etichette corte delle componenti per la scomposizione nel tooltip
const COMP_LABEL: Record<string, string> = {
    base: "base", base_underground: "base Underground", mnp: "MNP", tied: "Tied",
    piva: "P.IVA", conv: "Convergenza", la: "L.A (GNP)", ftth: "FTTH", fwa: "FWA", opzioni: "Opzioni",
    contrattuale: "contrattuale", contrattuale_conv: "contrattuale conv.", contrattuale_voce: "contrattuale Voce Casa",
    contrattuale_untied: "contrattuale Untied", contrattuale_tied: "contrattuale Tied", contrattuale_2linea: "contrattuale 2ª linea",
    netflix: "Netflix", pscu: "Più Sicuri", cloud: "Cloud", fritz: "FRITZ!Box",
    seconda_linea: "2ª linea", seconda_linea_inclusa: "2ª linea inclusa (Professional Box)", lg_pronto: "Pronto assistenza", lg_bollettino: "Bollettino",
};
// componenti che il pannello non può accendere da solo: dipendono dalla
// vendita (le applica l'analisi leggendo campi e opzioni)
const COMP_RUNTIME = new Set(["la", "ftth", "opzioni"]);
// da dove si accende ogni componente da vendita (per la sotto-tabella —
// Luca 25/08 sera: la notina non bastava, «non stiamo considerando…»)
const ACCENDE_DA: Record<string, string> = {
    la: "opzione GNP (gruppo Attivazione GA/GNP)",
    ftth: "gruppo Tecnologia: FTTH — o FTTH Extra",
    opzioni: "opzioni Chiamate Illimitate / Internazionali",
};

export function W3CommissioningPanel({ mese, colore, ragazzi = false }: { mese: string; colore: string; ragazzi?: boolean }) {
    const monthISO = `${mese}-01`;
    const [righe, setRighe] = useState<PayRiga[]>([]);
    const [offerte, setOfferte] = useState<OffCanone[]>([]);
    const [tierMax, setTierMax] = useState<Record<string, number>>({});   // pista → n. soglie vere
    // MODALITÀ RAGAZZI: originali azienda e % applicate — servono al tooltip
    // (Luca 25/08 sera: al passaggio del mouse va raccontato quanto incassa
    // l'azienda, la % della soglia e il conteggio, non il calcolo originale)
    const [origRagazzi, setOrigRagazzi] = useState<Map<string, { base: number | null; tiers: number[] }> | null>(null);
    const [percRagazzi, setPercRagazzi] = useState<{ mappa: Record<string, Record<number, { loro: number; perc: number }>>; unica: Record<string, number> } | null>(null);
    // declinazioni fisso DATA-DRIVEN (revisore 25/08: le FWA hanno GNP e
    // Illimitate a catalogo — l'hardcode le lasciava a riga unica mentre il
    // motore pagava il +1): per offerta, quali scelte esistono davvero
    const [opzDiOff, setOpzDiOff] = useState<Map<string, Set<string>>>(new Map());
    const [loading, setLoading] = useState(true);
    const [cerca, setCerca] = useState("");
    // tutte RACCOLTE all'ingresso (Luca 25/08 sera: «dammi tutte le categorie
    // raccolte e poi mi vado a esplodere io quella che mi interessa»)
    const [aperte, setAperte] = useState<Set<string>>(new Set());

    useEffect(() => {
        let vivo = true;
        (async () => {
            const [r, sg] = await Promise.all([
                // niente filtro attivo: i gettoni device sono spenti (in attesa
                // dell'aggancio listino) ma vanno mostrati ed editati qui; i
                // matcher del motore scartano da soli le righe spente
                supabase.from("pay_righe")
                    .select("id, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione, brand_vendita, moltiplicatore, componente, punti, pay_base, pay_tiers, gettone, attivo, note, ordine")
                    .eq("brand", "windtre").eq("month", monthISO).eq("lato", "azienda")
                    .neq("pista", "partnership").limit(500),
                supabase.from("pay_soglie").select("pista, tier")
                    .eq("brand", "windtre").eq("month", monthISO).eq("lato", "azienda"),
            ]);
            let rows = ((r.data ?? []) as PayRiga[])
                .map(x => ({ ...x, punti: Number(x.punti || 0), pay_base: x.pay_base == null ? null : Number(x.pay_base), pay_tiers: (Array.isArray(x.pay_tiers) ? x.pay_tiers.map(Number) : []) }));
            const tm: Record<string, number> = {};
            ((sg.data ?? []) as { pista: string; tier: number }[]).forEach(s => { tm[s.pista] = Math.max(tm[s.pista] || 0, Number(s.tier)); });
            let origMap: Map<string, { base: number | null; tiers: number[] }> | null = null;
            let percInfo: { mappa: Record<string, Record<number, { loro: number; perc: number }>>; unica: Record<string, number> } | null = null;
            if (ragazzi) {
                // MODALITÀ RAGAZZI (Luca 25/08): stessi dati dell'azienda,
                // SCALATI con la stessa formula del motore — tier × % della
                // soglia (pay_mappa_soglie), base × % unica (perc_ragazzi).
                // Le tabelle mostrano ESATTAMENTE ciò che il motore deriva.
                const [mp, pi] = await Promise.all([
                    supabase.from("pay_mappa_soglie").select("pista, tier_nostro, tier_loro, perc").eq("brand", "windtre").eq("month", monthISO),
                    supabase.from("pay_piste").select("chiave, perc_ragazzi").eq("brand", "windtre").eq("month", monthISO).eq("lato", "azienda"),
                ]);
                const mappa: Record<string, Record<number, { loro: number; perc: number }>> = {};
                ((mp.data ?? []) as { pista: string; tier_nostro: number; tier_loro: number; perc: number }[])
                    .forEach(x => { (mappa[x.pista] ??= {})[x.tier_nostro] = { loro: Number(x.tier_loro), perc: Number(x.perc) }; });
                const unica: Record<string, number> = {};
                ((pi.data ?? []) as { chiave: string; perc_ragazzi: number | null }[]).forEach(x => { unica[x.chiave] = x.perc_ragazzi == null ? 100 : Number(x.perc_ragazzi); });
                const fU = (pista: string | null) => (pista ? (unica[pista] ?? 100) / 100 : 1);
                // tiers dei ragazzi come deriva() nel motore: dove c'è la mappa
                // ogni soglia NOSTRA pesca il valore azienda della soglia LORO
                // mappata e applica la % di quella soglia (revisore 25/08: la
                // prima versione ignorava tier_loro — coi dati attuali S=S ma
                // una mappa sfalsata avrebbe fatto divergere vista e pagato);
                // le soglie dei ragazzi sono da S1 a S3 (Luca 25/08): i tiers
                // oltre la terza (mobile 4, fisso/gas 5 della lettera) via
                const derivaTiers = (x: PayRiga): number[] => {
                    const m = x.pista ? mappa[x.pista] : undefined;
                    if (m && Object.keys(m).length && !x.gettone) {
                        const nMax = Math.min(3, Math.max(...Object.keys(m).map(Number)));
                        const out: number[] = [];
                        for (let tn = 1; tn <= nMax; tn++) {
                            const voce = m[tn];
                            const az = voce ? x.pay_tiers[voce.loro - 1] : undefined;
                            out.push(voce == null || az == null ? (null as unknown as number)
                                : Math.round(az * (voce.perc / 100) * 100) / 100);
                        }
                        return out;
                    }
                    return x.pay_tiers.slice(0, 3).map(v2 => (v2 == null ? v2 : Math.round(Number(v2) * fU(x.pista) * 100) / 100));
                };
                // piste di rete fuori; e fuori anche le righe SPENTE (revisore
                // 25/08: le documentali — Bollettino, Migrazione 40€ — ai
                // ragazzi apparivano come compensi pieni mai maturabili)
                const vive = rows.filter(x => x.attivo && (unica[String(x.pista || "")] ?? 100) !== 0);
                // originali e % da parte PRIMA dello scaling: il tooltip delle
                // celle ragazzi racconta «all'azienda X € → % soglia → importo»
                origMap = new Map(vive.map(x => [x.id, { base: x.pay_base, tiers: [...x.pay_tiers] }]));
                percInfo = { mappa, unica };
                rows = vive.map(x => ({
                    ...x,
                    pay_base: x.pay_base == null ? null : Math.round(x.pay_base * fU(x.pista) * 100) / 100,
                    pay_tiers: derivaTiers(x),
                }));
                for (const k of Object.keys(tm)) tm[k] = Math.min(tm[k], 3);   // i ragazzi vedono le prime 3 soglie
            }
            // catalogo: prodotti → offerte con canone (per le sezioni a canone)
            const [cats, prods] = await Promise.all([
                supabase.from("catalog_categorie").select("id, nome"),
                supabase.from("catalog_prodotti").select("id, nome, tipo_cliente, categoria_id").eq("brand_id", "windtre").eq("attivo", true),
            ]);
            const nomeCat = new Map(((cats.data ?? []) as { id: string; nome: string }[]).map(c => [c.id, c.nome]));
            const prodDi = new Map(((prods.data ?? []) as { id: string; nome: string; tipo_cliente: string; categoria_id: string }[]).map(p => [p.id, p]));
            const ids = [...prodDi.keys()];
            const offs: OffCanone[] = [];
            for (let i = 0; i < ids.length; i += 60) {
                const o = await supabase.from("catalog_offerte").select("id, prodotto_id, nome, canone_mensile").in("prodotto_id", ids.slice(i, i + 60)).eq("attivo", true).not("canone_mensile", "is", null);
                ((o.data ?? []) as { id: string; prodotto_id: string; nome: string; canone_mensile: number }[]).forEach(x => {
                    const p = prodDi.get(x.prodotto_id);
                    if (!p || esclusaDalleGare({ offerta: x.nome })) return;
                    offs.push({ id: x.id, nome: x.nome, canone: Number(x.canone_mensile), prodotto: p.nome, tipo_cliente: p.tipo_cliente, categoria: String(nomeCat.get(p.categoria_id) || "") });
                });
            }
            // le sole opzioni che pilotano le declinazioni del fisso
            const opzOff = new Map<string, Set<string>>();
            const offIds = offs.map(x => x.id);
            for (let i = 0; i < offIds.length; i += 60) {
                const oo = await supabase.from("catalog_opzioni").select("offerta_id, nome")
                    .in("offerta_id", offIds.slice(i, i + 60)).in("nome", ["GNP", "FTTH", "Chiamate Illimitate"]).eq("attivo", true);
                ((oo.data ?? []) as { offerta_id: string; nome: string }[]).forEach(x => {
                    if (!opzOff.has(x.offerta_id)) opzOff.set(x.offerta_id, new Set());
                    opzOff.get(x.offerta_id)!.add(x.nome.toLowerCase());
                });
            }
            if (!vivo) return;
            setRighe(rows);
            setTierMax(tm);
            setOfferte(offs);
            setOrigRagazzi(origMap);
            setPercRagazzi(percInfo);
            setOpzDiOff(opzOff);
            setLoading(false);
        })();
        return () => { vivo = false; };
    }, [monthISO]);

    // set di righe dell'offerta a canone: componenti additive (modello lettera)
    // con ripiego sul pick-one classico (assicurazioni, mesi senza componenti)
    const setPer = (o: OffCanone): PayRiga[] => {
        const c = { tipo_cliente: o.tipo_cliente, categoria: o.categoria, prodotto: o.prodotto, offerta: o.nome };
        const comp = matchComponenti(righe, c);
        if (comp) return comp;
        const r = matchRigaTabellare(righe, c);
        return r ? [r] : [];
    };
    // set per l'offerta CON OPZIONI SIMULATE (declinazioni del fisso, Luca
    // 25/08 notte): le opzioni passano dal motore VERO (flagsComponenti via
    // matchComponenti) — ciò che la tabella mostra è ciò che paga l'analisi
    const setPerOpz = (o: OffCanone, opzSim: string): PayRiga[] => {
        const c = { tipo_cliente: o.tipo_cliente, categoria: o.categoria, prodotto: o.prodotto, offerta: o.nome, opzioni: opzSim || null };
        const comp = matchComponenti(righe, c);
        if (comp) return comp;
        const r = matchRigaTabellare(righe, c);
        return r ? [r] : [];
    };

    const filtro = (testo: string) => !cerca.trim() || testo.toLowerCase().includes(cerca.toLowerCase());

    // GARA BUSINESS a colonne (Luca 14/08): per le attivazioni Business il
    // premio a evento (25/35/45 € alla soglia di rete, target nella tabella
    // sopra) si somma al pay — qui compare nelle colonne 💼 S1-S3
    const bizRighe = useMemo(() => righe.filter(r => r.pista === "business_piva"), [righe]);
    const bizN = ragazzi ? 0 : (bizRighe.length ? Math.min(3, tierMax["business_piva"] || 3) : 0);
    // ⚠️ IL MOTORE DELLE GARE PARALLELE, NON IL PICK-ONE (baco chiuso 26/08 su
    // rilievo del revisore): `matchRigaTabellare` SCARTA per costruzione ogni
    // riga di una pista parallela (guardia PISTE_PARALLELE), e `bizRighe` sono
    // tutte di `business_piva` — quindi tornava sempre null e le colonne 💼
    // erano SEMPRE vuote (è la «sonda» che Luca aveva segnalato). Con
    // matchRigheGaraParallela arrivano anche le componenti (FRITZ, 2ª linea),
    // così la tabella dice lo stesso numero di Master e Calcolatore.
    type BizEsito = { scale: number[]; punti: number; voci: string[] } | { err: string };
    const bizInfo = (c: { tipo_cliente: string; categoria?: string | null; prodotto?: string | null; offerta?: string | null; opzioni?: string | null }): BizEsito => {
        if (!bizRighe.length) return { err: "nessuna riga business caricata" };
        if (!/business/i.test(c.tipo_cliente || "")) return { err: "tipo cliente: " + (c.tipo_cliente || "vuoto") };
        const set = matchRigheGaraParallela(righe, {
            tipo_cliente: c.tipo_cliente, categoria: c.categoria, prodotto: c.prodotto, offerta: c.offerta,
            opzioni: c.opzioni || null,
        }, "business_piva");
        if (!set.length) return { err: `nessun match: tc=${c.tipo_cliente} · cat=${c.categoria} · prod=${c.prodotto} · off=${c.offerta} · righe business=${bizRighe.length}` };
        return { scale: set[0].pay_tiers.slice(0, bizN), punti: puntiPerRighe(set), voci: set.map(r => r.nome) };
    };
    const CellaBiz = ({ info, i }: { info: BizEsito | null; i: number }) => {
        if (!info || "err" in info || info.scale[i] == null) {
            return <td className="px-1.5 py-0.5 text-center text-slate-700" title={info && "err" in info ? info.err : undefined}>—</td>;
        }
        return (
            <td className="px-1.5 py-0.5 text-center font-semibold text-sky-300 tabular-nums cursor-help"
                onMouseEnter={e => mostraTip(e, [
                    { testo: `💼 Extra Gara P.IVA · soglia S${i + 1}`, stile: "formula" },
                    { testo: `· premio a evento: ${eur(info.scale[i])} €`, stile: "voce" },
                    ...info.voci.map(v => ({ testo: `· ${v}`, stile: "voce" as const })),
                    { testo: `quest'attivazione vale ${it(info.punti)} punti business`, stile: "flat" },
                    { testo: "si somma al pay dell'attivazione", stile: "flat" },
                ])}
                onMouseLeave={() => setTip(null)}>
                +{eur(info.scale[i])} €
            </td>
        );
    };

    const perPista = useMemo(() => {
        const out: Record<string, { o: OffCanone; set: PayRiga[] }[]> = { mobile: [], fisso: [], assicurazioni: [] };
        offerte.forEach(o => {
            const set = setPer(o);
            if (!set.length) return;
            const pista = set[0].pista;
            if (!pista || !(pista in out)) return;
            if (!set.some(r => r.pay_tiers.length)) return;
            if (!filtro(`${o.nome} ${o.prodotto} ${o.tipo_cliente}`)) return;
            out[pista].push({ o, set });
        });
        for (const k of Object.keys(out))
            out[k].sort((a, b) => a.o.tipo_cliente.localeCompare(b.o.tipo_cliente) || a.o.prodotto.localeCompare(b.o.prodotto) || a.o.nome.localeCompare(b.o.nome));
        return out;
    }, [offerte, righe, cerca]);   // eslint-disable-line react-hooks/exhaustive-deps

    const eur = (v: number) => (Math.round(v * 100) / 100).toLocaleString("it-IT", { minimumFractionDigits: v % 1 ? 2 : 0 });
    const it = (v: number) => Number(v).toLocaleString("it-IT");
    const toggle = (id: string) => setAperte(prev => { const c = new Set(prev); if (c.has(id)) c.delete(id); else c.add(id); return c; });
    // GETTONI EDITABILI (Luca 14/08 sera-3): device, Luce&Gas e Customer Base
    // si correggono QUI — draft per riga (`id` = pay_base, `id|i` = tier),
    // salvataggio unico col bottone 💾 in testa al pannello
    const [payDraft, setPayDraft] = useState<Record<string, string>>({});
    const dirtyPay = Object.keys(payDraft).length > 0;
    const numPay = (v: string, fallback: number | null) => {
        if (v.trim() === "") return null;
        const n = Number(v.replace(",", "."));
        return Number.isFinite(n) ? n : fallback;
    };
    const salvaPay = async () => {
        const perRiga = new Map<string, Record<string, string>>();
        Object.entries(payDraft).forEach(([k, v]) => {
            const [id, i] = k.split("|");
            const e = perRiga.get(id) || {};
            e[i ?? "base"] = v;
            perRiga.set(id, e);
        });
        for (const [id, mods] of perRiga) {
            const r = righe.find(x => x.id === id);
            if (!r) continue;
            const patch: { pay_base?: number | null; pay_tiers?: number[] } = {};
            if (mods["base"] != null) patch.pay_base = numPay(mods["base"], r.pay_base);
            const tierKeys = Object.keys(mods).filter(x => x !== "base");
            if (tierKeys.length) {
                const tiers = [...r.pay_tiers];
                tierKeys.forEach(tk => { const nv = numPay(mods[tk], tiers[Number(tk)]); if (nv != null) tiers[Number(tk)] = nv; });
                patch.pay_tiers = tiers;
            }
            const { error } = await supabase.from("pay_righe").update(patch).eq("id", id);
            if (error) { alert("Errore salvataggio gettoni: " + error.message); return; }
        }
        setPayDraft({});
        // ricarica le righe (stessa query del mount)
        const r2 = await supabase.from("pay_righe")
            .select("id, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione, brand_vendita, moltiplicatore, componente, punti, pay_base, pay_tiers, gettone, attivo, note, ordine")
            .eq("brand", "windtre").eq("month", monthISO).eq("lato", "azienda")
            .neq("pista", "partnership").limit(500);
        setRighe(((r2.data ?? []) as PayRiga[])
            .map(x => ({ ...x, punti: Number(x.punti || 0), pay_base: x.pay_base == null ? null : Number(x.pay_base), pay_tiers: (Array.isArray(x.pay_tiers) ? x.pay_tiers.map(Number) : []) })));
    };
    // input di un gettone editabile (NON verde: il verde è il calcolato)
    const inputPay = "bg-white/[0.05] border border-white/15 rounded-lg px-1.5 py-0.5 text-[13px] font-semibold text-white w-16 text-center tabular-nums";

    // SOTTOCARTELLE richiudibili (Luca 14/08): i gruppi Consumer/Business e
    // tipo·prodotto si chiudono cliccando l'intestazione; la ricerca li riapre
    const [chiusi, setChiusi] = useState<Set<string>>(new Set());
    const toggleGruppo = (k: string) => setChiusi(prev => { const c = new Set(prev); if (c.has(k)) c.delete(k); else c.add(k); return c; });
    const gruppoChiuso = (k: string) => !cerca.trim() && chiusi.has(k);
    // TOOLTIP VERO sulla scomposizione (Luca 14/08: il title nativo era lento
    // e dentro le tabelle a scorrimento spesso non compariva): una bolla
    // fissa e immediata sopra la cella, con formula, componenti e totale
    type TipRiga = { testo: string; stile: "formula" | "voce" | "flat" | "tot" };
    const [tip, setTip] = useState<{ x: number; y: number; righe: TipRiga[] } | null>(null);
    const mostraTip = (e: React.MouseEvent, righe: TipRiga[]) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setTip({ x: r.left + r.width / 2, y: r.top, righe });
    };
    const righeTip = (canone: number, setR: PayRiga[], i: number): TipRiga[] => {
        const moltParti = setR.filter(r => r.moltiplicatore && r.pay_tiers[i] != null);
        // i flat si elencano per NOME (revisore 25/08: sul Professional Box i
        // 63 € erano 23 contrattuale + 40 FRITZ!Box, non «contrattuale»)
        const flatParti = setR.filter(r => !r.moltiplicatore && Number(r.pay_base || 0) !== 0);
        const molt = Math.round(moltParti.reduce((s, r) => s + r.pay_tiers[i], 0) * 100) / 100;
        const flat = flatParti.reduce((s, r) => s + Number(r.pay_base || 0), 0);
        return [
            { testo: `${eur(canone)} € × ${it(molt)}`, stile: "formula" },
            ...moltParti.map(r => ({ testo: `· ${it(r.pay_tiers[i])} ${r.componente ? (COMP_LABEL[r.componente] || r.componente) : r.nome}`, stile: "voce" as const })),
            ...flatParti.map(r => ({ testo: `+ ${eur(Number(r.pay_base))} € ${r.componente ? (COMP_LABEL[r.componente] || r.componente) : r.nome}`, stile: "flat" as const })),
            { testo: `= ${eur(canone * molt + flat)} €`, stile: "tot" },
        ];
    };
    // TOOLTIP RAGAZZI (Luca 25/08 sera): la scomposizione canone×componenti ce
    // l'ha già il lato azienda — qui la bolla racconta quanto incassa
    // l'azienda per l'attivazione, la % girata a quella soglia e il conteggio
    // che produce l'importo letto. Gli originali stanno in origRagazzi.
    const percSoglia = (pista: string | null, i: number): { perc: number; loro: number } => {
        const m = pista ? percRagazzi?.mappa[pista]?.[i + 1] : undefined;
        if (m) return { perc: m.perc, loro: m.loro };
        return { perc: pista ? (percRagazzi?.unica[pista] ?? 100) : 100, loro: i + 1 };
    };
    const percUnicaDi = (pista: string | null): number => (pista ? (percRagazzi?.unica[pista] ?? 100) : 100);
    const origDi = (r: PayRiga) => origRagazzi?.get(r.id);
    const tipRagazziCanone = (setR: PayRiga[], i: number, canone: number, cella: number): TipRiga[] => {
        const pista = setR[0]?.pista || null;
        const { perc, loro } = percSoglia(pista, i);
        const moltParti = setR.filter(r => r.moltiplicatore && r.pay_tiers[i] != null);
        const moltOrig = Math.round(moltParti.reduce((s, r) => s + Number(origDi(r)?.tiers[loro - 1] ?? 0), 0) * 100) / 100;
        const flatOrig = setR.filter(r => !r.moltiplicatore).reduce((s, r) => s + Number(origDi(r)?.base || 0), 0);
        const aCanone = Math.round(canone * moltOrig * 100) / 100;
        const pu = percUnicaDi(pista);
        const righe: TipRiga[] = [
            { testo: `S${i + 1} · ${it(perc)}% ai ragazzi`, stile: "formula" },
            { testo: `· all'azienda: ${eur(aCanone + flatOrig)} €${loro !== i + 1 ? ` (S${loro} della lettera)` : ""}`, stile: "voce" },
        ];
        if (flatOrig) {
            // gli importi mostrati SOMMANO alla cella (revisore 25/08: il
            // conto a mano «aCanone × %» divergeva di centesimi per gli
            // arrotondamenti per-riga — qui la quota canone è cella − flat)
            const flatScal = Math.round(setR.filter(r => !r.moltiplicatore).reduce((s, r) => s + Number(r.pay_base || 0), 0) * 100) / 100;
            righe.push({ testo: `· ${eur(aCanone)} € a canone × ${it(perc)}% → ${eur(Math.round((cella - flatScal) * 100) / 100)} €`, stile: "voce" });
            righe.push({ testo: `+ contrattuale ${eur(flatOrig)} € × ${it(pu)}% → ${eur(flatScal)} €`, stile: "flat" });
        }
        righe.push({ testo: `= ${eur(cella)} €`, stile: "tot" });
        return righe;
    };
    // eventi a € per soglia (Luce&Gas, 2ª linea col suo contrattuale)
    const tipRagazziEvento = (r: PayRiga, i: number, flatR?: PayRiga | null, cella?: number): TipRiga[] => {
        const { perc, loro } = percSoglia(r.pista, i);
        const orig = Number(origDi(r)?.tiers[loro - 1] ?? 0);
        const flatOrig = flatR ? Number(origDi(flatR)?.base || 0) : 0;
        const pu = percUnicaDi(r.pista);
        const righe: TipRiga[] = [
            { testo: `S${i + 1} · ${it(perc)}% ai ragazzi`, stile: "formula" },
            { testo: `· all'azienda: ${eur(orig + flatOrig)} €${loro !== i + 1 ? ` (S${loro} della lettera)` : ""}`, stile: "voce" },
        ];
        if (flatOrig) {
            righe.push({ testo: `· ${eur(orig)} € × ${it(perc)}%`, stile: "voce" });
            righe.push({ testo: `+ contrattuale ${eur(flatOrig)} € × ${it(pu)}%`, stile: "flat" });
        }
        righe.push({ testo: `= ${eur(cella ?? Number(r.pay_tiers[i]))} €`, stile: "tot" });
        return righe;
    };
    const tipRagazziGettone = (r: PayRiga): TipRiga[] => {
        const pu = percUnicaDi(r.pista);
        const orig = origDi(r)?.base;
        return [
            { testo: `Gettone · ${it(pu)}% ai ragazzi`, stile: "formula" },
            { testo: `· all'azienda: ${orig == null ? "—" : eur(Number(orig)) + " €"}`, stile: "voce" },
            { testo: `= ${r.pay_base == null ? "—" : eur(Number(r.pay_base)) + " €"}`, stile: "tot" },
        ];
    };
    // lo span dei gettoni in modalità ragazzi, con la bolla al passaggio
    const spanPayRagazzi = (r: PayRiga) => (
        r.pay_base == null ? <span className="font-semibold text-emerald-200 tabular-nums">—</span> : (
            <span className="font-semibold text-emerald-200 tabular-nums cursor-help"
                onMouseEnter={e => mostraTip(e, tipRagazziGettone(r))}
                onMouseLeave={() => setTip(null)}>{r.pay_base} €</span>
        )
    );
    // COMPONENTI DALLA VENDITA (Luca 25/08 sera): L.A/GNP, FTTH e Opzioni
    // aggiuntive erano solo in una notina e sembravano dimenticate — tabella
    // vera coi moltiplicatori per soglia (lato ragazzi arrivano già scalati)
    const TabRuntime = ({ rr }: { rr: PayRiga[] }) => {
        if (!rr.length) return null;
        const maxT = Math.max(...rr.map(r => r.pay_tiers.length));
        return (
            <div className="mt-2">
                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">➕ Componenti dalla vendita — si sommano al moltiplicatore ×canone dell&apos;attivazione</p>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse max-w-3xl">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                <th className="text-left font-semibold px-3 py-1.5">Componente</th>
                                <th className="text-left font-semibold px-2 py-1.5">Si accende da</th>
                                {Array.from({ length: maxT }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-20">S{i + 1}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {[...rr].sort((a, b) => a.ordine - b.ordine).map(r => (
                                <tr key={r.id} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                                    <td className="px-3 py-1 text-slate-200 whitespace-nowrap">{r.nome.replace(/\s*×\s*canone.*$/i, "")}</td>
                                    <td className="px-2 py-1 text-[11px] text-slate-500 whitespace-nowrap">{ACCENDE_DA[String(r.componente)] || "dalla vendita"}</td>
                                    {Array.from({ length: maxT }, (_, i) => (
                                        <td key={i} className="px-1.5 py-1 text-center font-semibold text-emerald-200 tabular-nums">
                                            {r.pay_tiers[i] == null ? <span className="text-slate-700">—</span> : `×${it(r.pay_tiers[i])}`}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    if (loading) return null;

    return (
        <div className="glass-panel rounded-2xl p-5" style={{ borderLeft: `4px solid ${colore}` }}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                    {ragazzi ? "Pay ai ragazzi in € — il commissioning azienda × la % della soglia (card 👥 del lato azienda)" : "Commissioning in € — il pay di ogni attivazione, per soglia: la soglia raggiunta sceglie la colonna"}
                </div>
                <div className="flex items-center gap-2">
                    {!ragazzi && dirtyPay && (
                        <button onClick={salvaPay} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">💾 Salva gettoni</button>
                    )}
                    <div className="relative w-64">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca offerta o evento…"
                            className="glass-input !h-8 text-xs w-full pl-8" />
                    </div>
                </div>
            </div>
            {/* niente più esclusioni fisse lato ragazzi (Luca 25/08 sera: le
                assicurazioni «non ci sono proprio»): decide il DATO — le piste
                con perc_ragazzi=0 escono già filtrate dal load, le altre
                compaiono coi valori scalati */}
            {SEZIONI.map(sez => {
                const aperta = aperte.has(sez.id) || !!cerca.trim();
                /* ---- TELEFONI & DEVICE: gettoni one-shot della lettera,
                   celle EDITABILI (Luca 14/08 sera-3) — righe spente per il
                   motore finché l'analisi non aggancia il listino ---- */
                if (sez.tipo === "device") {
                    // 'device' = lista piatta di gettoni editabili: telefoni
                    // (pista mobile non-componente), extra fisso (componenti
                    // gettone: Netflix, Cloud…) o kit Protetti
                    const rr = righe.filter(r => {
                        if (!r.gettone || !filtro(`${r.nome} ${r.opzione || ""}`)) return false;
                        if (sez.id === "protetti") return r.pista === "protetti";
                        if (sez.id === "fisso_extra") return r.pista === "fisso" && !(r.componente || "").startsWith("contrattuale");
                        // il gettone device vive sulla sua pista dal 26/08 (prima
                        // stava su `mobile` e finiva ai ragazzi al 100%); le voci
                        // del finanziato sono EXTRA additivi, vanno mostrate lo
                        // stesso o quelle da 20-40 € sparivano dalla pagina
                        if (sez.id === "device") return r.pista === "device";
                        return r.pista === "mobile" && !r.componente;
                    }).sort((a, b) => a.ordine - b.ordine);
                    if (!rr.length) return null;
                    return (
                        <div key={sez.id} className="mb-3 last:mb-0">
                            <button onClick={() => toggle(sez.id)} className="text-sm font-bold text-white flex items-center gap-2 mb-0.5">
                                {conSim(sez.label)} <span className="text-xs font-normal text-slate-500">{aperta ? "▾" : `▸ ${rr.length} voci`}</span>
                            </button>
                            <p className="text-[10px] text-slate-500 mb-1.5">{sez.sub}</p>
                            {aperta && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse max-w-3xl">
                                        <thead>
                                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                                <th className="text-left font-semibold px-3 py-1.5">Voce</th>
                                                <th className="px-2 py-1.5 font-semibold text-center w-24">Gettone</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rr.map(r => (
                                                <tr key={r.id} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                                                    <td className="px-3 py-1 text-slate-200">
                                                        {r.nome.replace(/^Gettone device · /, "")}
                                                        {Number(r.punti) > 0 && <span className="text-[10px] text-sky-300/80 ml-1.5" title="Vale anche punti in soglia">+{it(Number(r.punti))} punti</span>}
                                                        {!r.attivo && <span className="text-[10px] text-slate-500 ml-1.5" title={r.note || ""}>{/^documentale/i.test(r.note || "") ? "documentale — fuori gara" : "in attesa di aggancio"}</span>}
                                                    </td>
                                                    <td className="px-2 py-1 text-center">
                                                        {ragazzi ? spanPayRagazzi(r) : <><input value={payDraft[r.id] ?? (r.pay_base == null ? "" : String(r.pay_base))}
                                                            onChange={e => setPayDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                                                            className={inputPay} /></>} <span className="text-[11px] text-slate-500">€</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                }
                /* ---- MOBILE: una riga per OFFERTA con le diramazioni
                   GA/MNP × Untied/Tied sotto (proposta Luca 14/08 — la lista
                   piatta ripeteva la stessa offerta 2-4 volte senza dire
                   quale variante fosse; le offerte solo MNP, es. Underground,
                   mostrano naturalmente meno diramazioni) ---- */
                if (sez.tipo === "canone" && sez.id === "mobile") {
                    const rr = perPista[sez.id];
                    if (!rr?.length) return null;
                    const maxT = Math.max(...rr.map(x => Math.max(...x.set.map(r => r.pay_tiers.length))));
                    type Variante = { o: OffCanone; set: PayRiga[]; label: string; ord: number };
                    const gruppi: { tipo: string; nome: string; vars: Variante[] }[] = [];
                    const idxG = new Map<string, number>();
                    rr.forEach(({ o, set }) => {
                        const mnp = /mnp/i.test(o.prodotto);
                        const tied = /ric\.?\s*auto/i.test(o.categoria);
                        const k = `${o.tipo_cliente}|${o.nome}`;
                        if (!idxG.has(k)) { idxG.set(k, gruppi.length); gruppi.push({ tipo: o.tipo_cliente, nome: o.nome, vars: [] }); }
                        gruppi[idxG.get(k)!].vars.push({
                            o, set,
                            label: `${mnp ? "MNP" : "GA"} · ${tied ? "Tied" : "Untied"}`,
                            ord: (mnp ? 2 : 0) + (tied ? 1 : 0),
                        });
                    });
                    gruppi.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome));
                    gruppi.forEach(g => g.vars.sort((a, b) => a.ord - b.ord));
                    return (
                        <div key={sez.id} className="mb-3 last:mb-0">
                            <button onClick={() => toggle(sez.id)} className="text-sm font-bold text-white flex items-center gap-2 mb-0.5">
                                {conSim(sez.label)} <span className="text-xs font-normal text-slate-500">{aperta ? "▾" : `▸ ${gruppi.length} offerte`}</span>
                            </button>
                            <p className="text-[10px] text-slate-500 mb-1.5">{sez.sub} — ogni offerta con le sue diramazioni GA/MNP · Untied/Tied</p>
                            {aperta && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                                <th className="text-left font-semibold px-3 py-1.5">Offerta / variante</th>
                                                {Array.from({ length: bizN }, (_, i) => <th key={`b${i}`} className="px-1.5 py-1.5 font-semibold text-center w-16 text-sky-300/80">💼 S{i + 1}</th>)}
                                                <th className="px-1.5 py-1.5 font-semibold text-center w-20">Canone</th>
                                                {Array.from({ length: maxT }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-20">S{i + 1}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {gruppi.map((g, gi) => {
                                                const nuovoTipo = gi === 0 || g.tipo !== gruppi[gi - 1].tipo;
                                                const kTipo = `mobile|${g.tipo}`;
                                                const chiuso = gruppoChiuso(kTipo);
                                                return (
                                                    <Fragment key={`${g.tipo}|${g.nome}`}>
                                                        {nuovoTipo && (
                                                            <tr className="bg-white/[0.04] cursor-pointer hover:bg-white/[0.07]" onClick={() => toggleGruppo(kTipo)}>
                                                                <td colSpan={2 + bizN + maxT} className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-slate-300">
                                                                    {chiuso ? "▸" : "▾"} {g.tipo === "Business" ? "💼" : "👤"} {g.tipo}
                                                                    {chiuso && <span className="normal-case tracking-normal font-normal text-slate-500"> · {gruppi.filter(x => x.tipo === g.tipo).length} offerte</span>}
                                                                </td>
                                                            </tr>
                                                        )}
                                                        {!chiuso && (
                                                        <tr className="border-t border-white/[0.06]">
                                                            <td colSpan={2 + bizN + maxT} className="px-3 pt-2 pb-0.5 font-semibold text-white">{g.nome}</td>
                                                        </tr>
                                                        )}
                                                        {!chiuso && g.vars.map(v => (
                                                            <tr key={v.o.id} className="hover:bg-white/[0.03]">
                                                                <td className="pl-7 pr-2 py-0.5 whitespace-nowrap">
                                                                    <span className={cn("text-[11px] px-2 py-0.5 rounded-full border",
                                                                        /Tied/.test(v.label) && !/Untied/.test(v.label)
                                                                            ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                                                                            : "border-white/10 bg-white/[0.04] text-slate-300")}>
                                                                        {v.label}
                                                                    </span>
                                                                </td>
                                                                {Array.from({ length: bizN }, (_, i) => (
                                                                    // il matcher vuole `offerta`, l'oggetto catalogo ha `nome`:
                                                                    // il mismatch teneva le colonne 💼 vuote (sonda 14/08)
                                                                    <CellaBiz key={`b${i}`} info={bizInfo({ tipo_cliente: v.o.tipo_cliente, categoria: v.o.categoria, prodotto: v.o.prodotto, offerta: v.o.nome })} i={i} />
                                                                ))}
                                                                <td className="px-1.5 py-0.5 text-center text-[12px] text-slate-400 tabular-nums">{eur(v.o.canone)} €</td>
                                                                {Array.from({ length: maxT }, (_, i) => {
                                                                    const moltParti = v.set.filter(r => r.moltiplicatore && r.pay_tiers[i] != null);
                                                                    if (!moltParti.length) return <td key={i} className="px-1.5 py-0.5 text-center text-slate-700">—</td>;
                                                                    const flat = v.set.filter(r => !r.moltiplicatore).reduce((s, r) => s + Number(r.pay_base || 0), 0);
                                                                    const molt = Math.round(moltParti.reduce((s, r) => s + r.pay_tiers[i], 0) * 100) / 100;
                                                                    return (
                                                                        <td key={i} className="px-1.5 py-0.5 text-center font-semibold text-emerald-200 tabular-nums cursor-help"
                                                                            onMouseEnter={e => mostraTip(e, ragazzi ? tipRagazziCanone(v.set, i, v.o.canone, v.o.canone * molt + flat) : righeTip(v.o.canone, v.set, i))}
                                                                            onMouseLeave={() => setTip(null)}>
                                                                            {eur(v.o.canone * molt + flat)} €
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        ))}
                                                    </Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    <TabRuntime rr={righe.filter(r => r.pista === "mobile" && r.componente && COMP_RUNTIME.has(r.componente))} />
                                </div>
                            )}
                        </div>
                    );
                }
                /* ---- FISSO a DECLINAZIONI (Luca 25/08 notte, «come il
                   mobile»): sulle offerte internet ogni combinazione
                   attivazione GA/GNP × tecnologia FTTC/FTTH × con/senza
                   Chiamate Illimitate ha la sua riga col conto per soglia;
                   Voce Casa solo GA/GNP; FWA riga unica (la componente FWA
                   si accende dal prodotto). Ogni variante è calcolata dal
                   motore vero con le opzioni simulate (setPerOpz). ---- */
                if (sez.tipo === "canone" && sez.id === "fisso") {
                    const rr = perPista[sez.id];
                    if (!rr?.length) return null;
                    type VarF = { o: OffCanone; set: PayRiga[]; label: string; opz: string; gnp: boolean; ord: number };
                    const gruppiF: { tipo: string; nome: string; vars: VarF[] }[] = [];
                    const idxF = new Map<string, number>();
                    rr.forEach(({ o }) => {
                        // DATA-DRIVEN (revisore 25/08): le assi delle varianti
                        // sono le scelte che l'offerta HA a catalogo — così le
                        // FWA con GNP/Illimitate hanno le loro declinazioni e
                        // le business senza Illimitate non mostrano
                        // combinazioni invendibili. Voce Casa (solo GNP) fa
                        // GA/GNP da sola, senza casi speciali.
                        const scelte = opzDiOff.get(o.id) || new Set<string>();
                        const assiAtt = scelte.has("gnp") ? ["GA", "GNP"] : [""];
                        const assiTec = scelte.has("ftth") ? ["FTTC", "FTTH"] : [""];
                        const assiIll = scelte.has("chiamate illimitate") ? [false, true] : [false];
                        const varianti: { label: string; opz: string; ord: number }[] = [];
                        let kOrd = 0;
                        for (const att of assiAtt) for (const tec of assiTec) for (const ill of assiIll) {
                            const testa = [att, tec].filter(Boolean).join(" · ");
                            varianti.push({
                                label: [testa, ill ? "Illimitate" : ""].filter(Boolean).join(" + ") || (/fwa/i.test(o.prodotto) ? "FWA" : "base"),
                                opz: [att, tec, ill ? "Chiamate Illimitate" : ""].filter(Boolean).join(", "),
                                ord: kOrd++,
                            });
                        }
                        varianti.forEach(v => {
                            const set = setPerOpz(o, v.opz);
                            if (!set.length || !set.some(r2 => r2.pay_tiers.length)) return;
                            const kG = `${o.tipo_cliente}|${o.nome}`;
                            if (!idxF.has(kG)) { idxF.set(kG, gruppiF.length); gruppiF.push({ tipo: o.tipo_cliente, nome: o.nome, vars: [] }); }
                            gruppiF[idxF.get(kG)!].vars.push({ o, set, label: v.label, opz: v.opz, gnp: /gnp/i.test(v.label), ord: v.ord });
                        });
                    });
                    if (!gruppiF.length) return null;
                    gruppiF.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome));
                    gruppiF.forEach(g => g.vars.sort((a, b) => a.ord - b.ord));
                    const maxT = Math.max(...gruppiF.flatMap(g => g.vars.flatMap(v => v.set.map(r2 => r2.pay_tiers.length))));
                    const conBiz = bizN > 0;
                    const runtime = righe.filter(r => r.pista === "fisso" && r.componente && COMP_RUNTIME.has(r.componente));
                    return (
                        <div key={sez.id} className="mb-3 last:mb-0">
                            <button onClick={() => toggle(sez.id)} className="text-sm font-bold text-white flex items-center gap-2 mb-0.5">
                                {conSim(sez.label)} <span className="text-xs font-normal text-slate-500">{aperta ? "▾" : `▸ ${gruppiF.length} offerte`}</span>
                            </button>
                            <p className="text-[10px] text-slate-500 mb-1.5">{sez.sub} — ogni offerta con le sue declinazioni: GA/GNP · FTTC/FTTH · con/senza Chiamate Illimitate</p>
                            {aperta && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                                <th className="text-left font-semibold px-3 py-1.5">Offerta / declinazione</th>
                                                {conBiz && Array.from({ length: bizN }, (_, i) => <th key={`b${i}`} className="px-1.5 py-1.5 font-semibold text-center w-16 text-sky-300/80">💼 S{i + 1}</th>)}
                                                <th className="px-1.5 py-1.5 font-semibold text-center w-20">Canone</th>
                                                {Array.from({ length: maxT }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-20">S{i + 1}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {gruppiF.map((g, gi) => {
                                                const nuovoTipo = gi === 0 || g.tipo !== gruppiF[gi - 1].tipo;
                                                const kTipo = `fisso|${g.tipo}`;
                                                const chiuso = gruppoChiuso(kTipo);
                                                return (
                                                    <Fragment key={`${g.tipo}|${g.nome}`}>
                                                        {nuovoTipo && (
                                                            <tr className="bg-white/[0.04] cursor-pointer hover:bg-white/[0.07]" onClick={() => toggleGruppo(kTipo)}>
                                                                <td colSpan={2 + (conBiz ? bizN : 0) + maxT} className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-slate-300">
                                                                    {chiuso ? "▸" : "▾"} {g.tipo === "Business" ? "💼" : "👤"} {g.tipo}
                                                                    {chiuso && <span className="normal-case tracking-normal font-normal text-slate-500"> · {gruppiF.filter(x => x.tipo === g.tipo).length} offerte</span>}
                                                                </td>
                                                            </tr>
                                                        )}
                                                        {!chiuso && (
                                                            <tr className="border-t border-white/[0.06]">
                                                                <td colSpan={2 + (conBiz ? bizN : 0) + maxT} className="px-3 pt-2 pb-0.5 font-semibold text-white">{g.nome}</td>
                                                            </tr>
                                                        )}
                                                        {!chiuso && g.vars.map(v => (
                                                            <tr key={`${v.o.id}|${v.label}`} className="hover:bg-white/[0.03]">
                                                                <td className="pl-7 pr-2 py-0.5 whitespace-nowrap">
                                                                    <span className={cn("text-[11px] px-2 py-0.5 rounded-full border",
                                                                        v.gnp ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                                                                            : "border-white/10 bg-white/[0.04] text-slate-300")}>
                                                                        {v.label}
                                                                    </span>
                                                                </td>
                                                                {conBiz && Array.from({ length: bizN }, (_, i) => (
                                                                    <CellaBiz key={`b${i}`} info={bizInfo({ tipo_cliente: v.o.tipo_cliente, categoria: v.o.categoria, prodotto: v.o.prodotto, offerta: v.o.nome, opzioni: v.opz })} i={i} />
                                                                ))}
                                                                <td className="px-1.5 py-0.5 text-center text-[12px] text-slate-400 tabular-nums">{eur(v.o.canone)} €</td>
                                                                {Array.from({ length: maxT }, (_, i) => {
                                                                    const moltParti = v.set.filter(r2 => r2.moltiplicatore && r2.pay_tiers[i] != null);
                                                                    if (!moltParti.length) return <td key={i} className="px-1.5 py-0.5 text-center text-slate-700">—</td>;
                                                                    const flat = v.set.filter(r2 => !r2.moltiplicatore).reduce((s, r2) => s + Number(r2.pay_base || 0), 0);
                                                                    const molt = Math.round(moltParti.reduce((s, r2) => s + r2.pay_tiers[i], 0) * 100) / 100;
                                                                    return (
                                                                        <td key={i} className="px-1.5 py-0.5 text-center font-semibold text-emerald-200 tabular-nums cursor-help"
                                                                            onMouseEnter={e => mostraTip(e, ragazzi ? tipRagazziCanone(v.set, i, v.o.canone, v.o.canone * molt + flat) : righeTip(v.o.canone, v.set, i))}
                                                                            onMouseLeave={() => setTip(null)}>
                                                                            {eur(v.o.canone * molt + flat)} €
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        ))}
                                                    </Fragment>
                                                );
                                            })}
                                            {/* SECONDA LINEA (opzione dei fissi business): riga
                                                dedicata, contrattuale 10 € incluso */}
                                            {(() => {
                                                const sl = righe.find(r => r.componente === "seconda_linea");
                                                if (!sl || !sl.pay_tiers.length) return null;
                                                const flat = Number(righe.find(r => r.componente === "contrattuale_2linea")?.pay_base || 0);
                                                const infoBiz = bizInfo({ tipo_cliente: "Business", categoria: "Fisso", prodotto: null, offerta: null });
                                                return (
                                                    <Fragment>
                                                        <tr className="bg-white/[0.04]">
                                                            <td colSpan={2 + (conBiz ? bizN : 0) + maxT} className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-slate-300">
                                                                ➕ Dalla vendita · opzione 2°Linea (un altro fisso da 10 €)
                                                            </td>
                                                        </tr>
                                                        <tr className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                                                            <td className="px-3 py-1 text-slate-200 whitespace-nowrap">Seconda linea Professional <span className="text-[11px] text-slate-500">— opzione sui fissi business</span></td>
                                                            {conBiz && Array.from({ length: bizN }, (_, i) => (
                                                                <CellaBiz key={`b${i}`} info={infoBiz} i={i} />
                                                            ))}
                                                            <td className="px-1.5 py-1 text-center text-[12px] text-slate-400 tabular-nums">10 €</td>
                                                            {Array.from({ length: maxT }, (_, i) => {
                                                                const v = sl.pay_tiers[i];
                                                                if (v == null) return <td key={i} className="px-1.5 py-1 text-center text-slate-700">—</td>;
                                                                return (
                                                                    <td key={i} className="px-1.5 py-1 text-center font-semibold text-emerald-200 tabular-nums cursor-help"
                                                                        onMouseEnter={e => mostraTip(e, ragazzi ? tipRagazziEvento(sl, i, righe.find(r2 => r2.componente === "contrattuale_2linea") || null, v + flat) : [
                                                                            { testo: `2ª linea · soglia S${i + 1}`, stile: "formula" },
                                                                            { testo: `· canone linea 10 € × moltiplicatore base = ${eur(v)} €`, stile: "voce" },
                                                                            ...(flat ? [{ testo: `+ ${eur(flat)} € contrattuale 2ª linea`, stile: "flat" as const }] : []),
                                                                            { testo: `= ${eur(v + flat)} €`, stile: "tot" },
                                                                        ])}
                                                                        onMouseLeave={() => setTip(null)}>
                                                                        {eur(v + flat)} €
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    </Fragment>
                                                );
                                            })()}
                                        </tbody>
                                    </table>
                                    <TabRuntime rr={runtime} />
                                </div>
                            )}
                        </div>
                    );
                }
                /* ---- sezioni a CANONE: esploso per offerta ---- */
                if (sez.tipo === "canone") {
                    const rr = perPista[sez.id];
                    if (!rr?.length) return null;
                    const maxT = Math.max(...rr.map(x => Math.max(...x.set.map(r => r.pay_tiers.length))));
                    const runtime = righe.filter(r => r.pista === sez.id && r.componente && COMP_RUNTIME.has(r.componente));
                    // sulle assicurazioni ogni polizza porta i suoi punti in
                    // soglia (Luca 14/08): colonna prima del canone. (Il ramo
                    // generico ormai serve solo a loro: mobile e fisso hanno
                    // i rami a diramazioni qui sopra — niente colonne 💼.)
                    const conPunti = sez.id === "assicurazioni";
                    const conBiz = false;
                    return (
                        <div key={sez.id} className="mb-3 last:mb-0">
                            <button onClick={() => toggle(sez.id)} className="text-sm font-bold text-white flex items-center gap-2 mb-0.5">
                                {conSim(sez.label)} <span className="text-xs font-normal text-slate-500">{aperta ? "▾" : `▸ ${rr.length} offerte`}</span>
                            </button>
                            <p className="text-[10px] text-slate-500 mb-1.5">{sez.sub}</p>
                            {aperta && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                                <th className="text-left font-semibold px-3 py-1.5">Offerta</th>
                                                <th className="text-left font-semibold px-2 py-1.5">Prodotto</th>
                                                {conPunti && <th className="px-2 py-1.5 font-semibold text-center w-24">Punti in soglia</th>}
                                                {conBiz && Array.from({ length: bizN }, (_, i) => <th key={`b${i}`} className="px-1.5 py-1.5 font-semibold text-center w-16 text-sky-300/80">💼 S{i + 1}</th>)}
                                                <th className="px-1.5 py-1.5 font-semibold text-center w-20">Canone</th>
                                                {Array.from({ length: maxT }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-20">S{i + 1}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rr.map(({ o, set }, idx) => {
                                                const gruppo = `${o.tipo_cliente}|${o.prodotto}`;
                                                const nuovoGruppo = idx === 0 || gruppo !== `${rr[idx - 1].o.tipo_cliente}|${rr[idx - 1].o.prodotto}`;
                                                const kGruppo = `${sez.id}|${gruppo}`;
                                                const chiuso = gruppoChiuso(kGruppo);
                                                return (
                                                    <Fragment key={o.id}>
                                                        {nuovoGruppo && (
                                                            <tr className="bg-white/[0.04] cursor-pointer hover:bg-white/[0.07]" onClick={() => toggleGruppo(kGruppo)}>
                                                                <td colSpan={(conPunti ? 4 : 3) + (conBiz ? bizN : 0) + maxT} className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-slate-300">
                                                                    {chiuso ? "▸" : "▾"} {o.tipo_cliente === "Business" ? "💼" : "👤"} {o.tipo_cliente} · {o.prodotto}
                                                                    {chiuso && <span className="normal-case tracking-normal font-normal text-slate-500"> · {rr.filter(x => `${x.o.tipo_cliente}|${x.o.prodotto}` === gruppo).length} offerte</span>}
                                                                </td>
                                                            </tr>
                                                        )}
                                                        {!chiuso && (
                                                        <tr className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                                                            <td className="px-3 py-1 text-slate-200 whitespace-nowrap">{o.nome}</td>
                                                            <td className="px-2 py-1 text-[11px] text-slate-500 whitespace-nowrap">{o.prodotto}</td>
                                                            {conPunti && <td className="px-2 py-1 text-center font-bold text-white tabular-nums">{it(set.reduce((s, r) => s + Number(r.punti || 0), 0))}</td>}
                                                            {conBiz && Array.from({ length: bizN }, (_, i) => (
                                                                <CellaBiz key={`b${i}`} info={bizInfo({ tipo_cliente: o.tipo_cliente, categoria: o.categoria, prodotto: o.prodotto, offerta: o.nome })} i={i} />
                                                            ))}
                                                            <td className="px-1.5 py-1 text-center text-[12px] text-slate-400 tabular-nums">{eur(o.canone)} €</td>
                                                            {Array.from({ length: maxT }, (_, i) => {
                                                                const moltParti = set.filter(r => r.moltiplicatore && r.pay_tiers[i] != null);
                                                                if (!moltParti.length) return <td key={i} className="px-1.5 py-1 text-center text-slate-700">—</td>;
                                                                const flat = set.filter(r => !r.moltiplicatore).reduce((s, r) => s + Number(r.pay_base || 0), 0);
                                                                const molt = Math.round(moltParti.reduce((s, r) => s + r.pay_tiers[i], 0) * 100) / 100;
                                                                return (
                                                                    <td key={i} className="px-1.5 py-1 text-center font-semibold text-emerald-200 tabular-nums cursor-help"
                                                                        onMouseEnter={e => mostraTip(e, ragazzi ? tipRagazziCanone(set, i, o.canone, o.canone * molt + flat) : righeTip(o.canone, set, i))}
                                                                        onMouseLeave={() => setTip(null)}>
                                                                        {eur(o.canone * molt + flat)} €
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                        )}
                                                    </Fragment>
                                                );
                                            })}
                                            {/* (la 2ª linea Professional vive nel ramo FISSO a
                                                declinazioni qui sopra — questo ramo generico ora
                                                serve alle assicurazioni) */}
                                        </tbody>
                                    </table>
                                    <TabRuntime rr={runtime} />
                                    {/* gettoni assicurazioni SENZA canone (Pronto Intervento,
                                        Giro X Il Mondo): non passano dall'esploso a canone —
                                        tabellina editabile qui sotto (Luca 14/08) */}
                                    {sez.id === "assicurazioni" && (() => {
                                        const gg = righe.filter(r => r.pista === "assicurazioni" && r.gettone && filtro(r.nome)).sort((a, b) => a.ordine - b.ordine);
                                        if (!gg.length) return null;
                                        return (
                                            <div className="mt-2">
                                                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Gettoni senza canone</p>
                                                <table className="w-full text-sm border-collapse max-w-xl">
                                                    <tbody>
                                                        {gg.map(r => (
                                                            <tr key={r.id} className="border-t border-white/[0.04]">
                                                                <td className="px-3 py-1 text-slate-200">{r.nome}{!r.attivo && <span className="text-[10px] text-slate-500 ml-1.5" title={r.note || ""}>in attesa dell&apos;importo premio</span>}</td>
                                                                <td className="px-2 py-1 text-center w-24">
                                                                    {ragazzi ? spanPayRagazzi(r) : <><input value={payDraft[r.id] ?? (r.pay_base == null ? "" : String(r.pay_base))}
                                                                        onChange={e => setPayDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                                                                        className={inputPay} /></>} <span className="text-[11px] text-slate-500">€</span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    );
                }
                /* ---- sezioni a EVENTO: € diretti per soglia di rete ---- */
                if (sez.tipo === "evento") {
                    const rr = righe.filter(r => r.pista === sez.id && !r.gettone && (r.pay_tiers.length || Number(r.punti || 0) > 0) && filtro(`${r.nome} ${r.offerta || ""}`))
                        .sort((a, b) => a.ordine - b.ordine);
                    if (!rr.length) return null;
                    // colonne = soglie VERE della pista
                    const maxT = Math.max(1, Math.min(tierMax[sez.id] || 99, Math.max(...rr.map(r => r.pay_tiers.length))));
                    // Luce&Gas non ha punti; la gara smartphone CB sì (è la soglia)
                    const conPunti = sez.id === "smartphone_cb";
                    return (
                        <div key={sez.id} className="mb-3 last:mb-0">
                            <button onClick={() => toggle(sez.id)} className="text-sm font-bold text-white flex items-center gap-2 mb-0.5">
                                {conSim(sez.label)} <span className="text-xs font-normal text-slate-500">{aperta ? "▾" : `▸ ${rr.length} voci`}</span>
                            </button>
                            <p className="text-[10px] text-slate-500 mb-1.5">{sez.sub}</p>
                            {aperta && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                                <th className="text-left font-semibold px-3 py-1.5">Attivazione</th>
                                                {conPunti && <th className="px-2 py-1.5 font-semibold text-center w-24">Punti in soglia</th>}
                                                {Array.from({ length: maxT }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-20">S{i + 1}</th>)}
                                                {bizN > 0 && Array.from({ length: bizN }, (_, i) => <th key={`b${i}`} className="px-1.5 py-1.5 font-semibold text-center w-16 text-sky-300/80">💼 S{i + 1}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rr.map(r => (
                                                <tr key={r.id} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                                                    <td className="px-3 py-1 text-slate-200 whitespace-nowrap">{r.nome}</td>
                                                    {conPunti && <td className="px-2 py-1 text-center font-bold text-white tabular-nums">{it(r.punti)}</td>}
                                                    {Array.from({ length: maxT }, (_, i) => (
                                                        <td key={i} className="px-1.5 py-1 text-center">
                                                            {r.pay_tiers[i] == null ? <span className="text-slate-700">—</span> : ragazzi ? (
                                                                <span className="font-semibold text-emerald-200 tabular-nums cursor-help"
                                                                    onMouseEnter={e => mostraTip(e, tipRagazziEvento(r, i))}
                                                                    onMouseLeave={() => setTip(null)}>{String(r.pay_tiers[i])} €</span>
                                                            ) : (
                                                                <input value={payDraft[`${r.id}|${i}`] ?? String(r.pay_tiers[i])}
                                                                    onChange={e => setPayDraft(prev => ({ ...prev, [`${r.id}|${i}`]: e.target.value }))}
                                                                    className={inputPay} />
                                                            )}
                                                        </td>
                                                    ))}
                                                    {bizN > 0 && Array.from({ length: bizN }, (_, i) => (
                                                        <CellaBiz key={`b${i}`} info={bizInfo({ tipo_cliente: r.tipo_cliente || "", categoria: r.categoria, prodotto: r.prodotto, offerta: r.offerta })} i={i} />
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {sez.id === "lucegas" && (
                                        <>
                                            <p className="text-[11px] text-slate-500 mt-1">Gettoni regressivi, includono il contrattuale 10 €: −50% sui clienti ex W3 Luce&amp;Gas Powered by Acea.</p>
                                            {/* modificatori additivi (scorporo Luca 14/08): si accendono
                                                dalle opzioni della vendita e si sommano al gettone base */}
                                            {(() => {
                                                const gg = righe.filter(r => r.pista === "lucegas" && r.gettone && filtro(r.nome)).sort((a, b) => a.ordine - b.ordine);
                                                if (!gg.length) return null;
                                                return (
                                                    <div className="mt-2">
                                                        <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Modificatori (dalle opzioni della vendita)</p>
                                                        <table className="w-full text-sm border-collapse max-w-xl">
                                                            <tbody>
                                                                {gg.map(r => (
                                                                    <tr key={r.id} className="border-t border-white/[0.04]">
                                                                        <td className="px-3 py-1 text-slate-200">{r.nome}</td>
                                                                        <td className="px-2 py-1 text-center w-24">
                                                                            {ragazzi ? spanPayRagazzi(r) : <><input value={payDraft[r.id] ?? (r.pay_base == null ? "" : String(r.pay_base))}
                                                                                onChange={e => setPayDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                                                                                className={inputPay} /></>} <span className="text-[11px] text-slate-500">€</span>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                );
                                            })()}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                }
                /* ---- Customer Base: gettoni flat ---- */
                const rr = righe.filter(r => r.pista === sez.id && r.gettone && filtro(`${r.nome} ${r.offerta || ""}`))
                    .sort((a, b) => (a.tipo_cliente || "").localeCompare(b.tipo_cliente || "") || a.ordine - b.ordine);
                if (!rr.length) return null;
                return (
                    <div key={sez.id} className="mb-3 last:mb-0">
                        <button onClick={() => toggle(sez.id)} className="text-sm font-bold text-white flex items-center gap-2 mb-0.5">
                            {conSim(sez.label)} <span className="text-xs font-normal text-slate-500">{aperta ? "▾" : `▸ ${rr.length} eventi`}</span>
                        </button>
                        <p className="text-[10px] text-slate-500 mb-1.5">{sez.sub}</p>
                        {aperta && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse max-w-xl">
                                    <thead>
                                        <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                            <th className="text-left font-semibold px-3 py-1.5">Evento</th>
                                            <th className="px-2 py-1.5 font-semibold text-center w-24">Gettone</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rr.map((r, idx) => {
                                            const nuovoGruppo = idx === 0 || (r.tipo_cliente || "") !== (rr[idx - 1].tipo_cliente || "");
                                            const kGruppo = `cb|${r.tipo_cliente || ""}`;
                                            const chiuso = gruppoChiuso(kGruppo);
                                            return (
                                                <Fragment key={r.id}>
                                                    {nuovoGruppo && (
                                                        <tr className="bg-white/[0.04] cursor-pointer hover:bg-white/[0.07]" onClick={() => toggleGruppo(kGruppo)}>
                                                            <td colSpan={2} className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-slate-300">
                                                                {chiuso ? "▸" : "▾"} {r.tipo_cliente === "Business" ? "💼 Business" : "👤 Consumer"}
                                                                {chiuso && <span className="normal-case tracking-normal font-normal text-slate-500"> · {rr.filter(x => (x.tipo_cliente || "") === (r.tipo_cliente || "")).length} eventi</span>}
                                                            </td>
                                                        </tr>
                                                    )}
                                                    {!chiuso && (
                                                    <tr className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                                                        <td className="px-3 py-1 text-slate-200">{r.nome}{Number(r.pay_base) === 0 && <span className="text-[10px] text-slate-500 ml-1.5" title={r.note || ""}>esclusa per lettera</span>}</td>
                                                        <td className="px-2 py-1 text-center">
                                                            {ragazzi ? spanPayRagazzi(r) : <><input value={payDraft[r.id] ?? (r.pay_base == null ? "" : String(r.pay_base))}
                                                                onChange={e => setPayDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                                                                className={inputPay} /></>} <span className="text-[11px] text-slate-500">€</span>
                                                        </td>
                                                    </tr>
                                                    )}
                                                </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}
            {ragazzi ? (
                <p className="text-[11px] text-slate-500 mt-2">
                    I pay sono il commissioning azienda × la % della soglia (si governano nella card 👥 del Commissioning azienda). Le soglie S1-S3 sono nella card 📐 in testa alla scheda: la soglia raggiunta sceglie la colonna, retroattiva dal 1° pezzo.
                </p>
            ) : (
            <p className="text-[11px] text-slate-500 mt-2">
                🟢 Verde = calcolato dalle Regole di gara (canone × componenti) · ⬜ celle bianche = gettoni one-shot della lettera, editabili qui (li riempirà l&apos;upload della gara mensile).
                💼 Colonne Business: premio a evento della gara Business alla soglia di rete (target e importi nella tabella sopra) — si somma al pay; retroattivo, 4ª soglia solo col BP Plus+; contano anche le Protezione Pro Negozi (5 punti).
            </p>
            )}
            {/* bolla di scomposizione: in PORTAL sul body — il backdrop-filter
                del glass-panel rompe il position:fixed dei discendenti (le
                coordinate diventavano relative al pannello: bolla lontanissima,
                baco visto da Luca 14/08) */}
            {tip && typeof document !== "undefined" && createPortal(
                <div className="fixed z-50 -translate-x-1/2 -translate-y-full pointer-events-none" style={{ left: tip.x, top: tip.y - 8 }}>
                    <div className="rounded-xl border border-white/15 bg-slate-900/95 shadow-2xl px-3 py-2 text-[11px] leading-relaxed whitespace-nowrap">
                        {tip.righe.map((r, i) => (
                            <div key={i} className={
                                r.stile === "formula" ? "font-bold text-white text-[12px]" :
                                    r.stile === "tot" ? "font-bold text-emerald-300 border-t border-white/10 mt-1 pt-1" :
                                        r.stile === "flat" ? "text-amber-300" : "text-slate-400"
                            }>{r.testo}</div>
                        ))}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}


/* ═══ 👥 % AI RAGAZZI (Luca 25/08): si governa QUI, nel Commissioning —
   non nelle Regole di gara. Piste a soglie (mobile/fisso/luce&gas): una %
   PER SOGLIA (S1/S2/S3 → pay_mappa_soglie, che il motore applica soglia
   per soglia). Piste a gettone (CB, Protetti): % unica (perc_ragazzi).
   Vuoto = 100%. Il tabellare ragazzi si rideriva da solo. ═══════════════ */
const PISTE_SOGLIA: { chiave: string; label: string; attivabile?: boolean }[] = [
    { chiave: "mobile", label: `${SIM_TESTO} Mobile` },
    { chiave: "fisso", label: "🏠 Fisso" },
    { chiave: "lucegas", label: "⚡ Luce & Gas" },
    // ATTIVABILE (Luca 25/08 sera: «non posso impostare una % sulle
    // assicurazioni»): caselle vuote = pista di rete (perc_ragazzi 0, come
    // oggi — niente ai ragazzi); compilate = la pista ENTRA nella gara
    // ragazzi con la % per soglia e la sezione ricompare nella loro scheda
    { chiave: "assicurazioni", label: "🛡 Assicurazioni", attivabile: true },
];
const PISTE_UNICHE = [
    { chiave: "cb", label: "🔁 Customer Base" },
    { chiave: "protetti", label: "🏠🛡 W3 Protetti" },
];
export function W3PercRagazzi({ mese }: { mese: string }) {
    const monthISO = `${mese}-01`;
    const [mappa, setMappa] = useState<Record<string, Record<number, string>>>({});
    const [uniche, setUniche] = useState<Record<string, string>>({});
    const [idPista, setIdPista] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [pronto, setPronto] = useState(false);
    useEffect(() => {
        let vivo = true;
        (async () => {
            const [m, pi] = await Promise.all([
                supabase.from("pay_mappa_soglie").select("pista, tier_nostro, perc").eq("brand", "windtre").eq("month", monthISO),
                supabase.from("pay_piste").select("id, chiave, perc_ragazzi").eq("brand", "windtre").eq("month", monthISO).eq("lato", "azienda"),
            ]);
            if (!vivo) return;
            const mm: Record<string, Record<number, string>> = {};
            ((m.data ?? []) as { pista: string; tier_nostro: number; perc: number }[]).forEach(r => {
                (mm[r.pista] ??= {})[r.tier_nostro] = String(r.perc);
            });
            const un: Record<string, string> = {}; const ids: Record<string, string> = {};
            ((pi.data ?? []) as { id: string; chiave: string; perc_ragazzi: number | null }[]).forEach(r => {
                ids[r.chiave] = r.id;
                if (PISTE_UNICHE.some(x => x.chiave === r.chiave)) un[r.chiave] = r.perc_ragazzi == null ? "" : String(r.perc_ragazzi);
            });
            setMappa(mm); setUniche(un); setIdPista(ids); setPronto(true);
        })();
        return () => { vivo = false; };
    }, [monthISO]);
    const salva = async () => {
        setBusy(true); setMsg(null);
        // TUTTA la validazione PRIMA di qualsiasi scrittura (revisore 25/08,
        // seconda passata): «8o» passava il conteggio delle caselle piene ma
        // cadeva al Number.isFinite dell'insert → mappa monca a DB; e sulle
        // uniche Number("8s")=NaN si serializzava null = 100% in silenzio.
        // Qui: mappa completa-o-vuota E numeri veri 0-100, stesso criterio
        // che poi usa la scrittura.
        const numeroPct = (v: string) => v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100;
        for (const p of PISTE_SOGLIA) {
            const vals = [1, 2, 3].map(t => String(mappa[p.chiave]?.[t] ?? "").trim().replace(",", "."));
            const piene = vals.filter(v => v !== "");
            if (piene.length > 0 && piene.length < 3) {
                setBusy(false); setMsg(`Errore — ${p.label}: compila la % per tutte e tre le soglie (o lasciale tutte vuote${p.attivabile ? "" : " = 100%"}).`); return;
            }
            if (piene.some(v => !numeroPct(v))) {
                setBusy(false); setMsg(`Errore — ${p.label}: le % devono essere numeri tra 0 e 100.`); return;
            }
        }
        for (const p of PISTE_UNICHE) {
            const v = String(uniche[p.chiave] ?? "").trim().replace(",", ".");
            if (v !== "" && !numeroPct(v)) {
                setBusy(false); setMsg(`Errore — ${p.label}: la % deve essere un numero tra 0 e 100.`); return;
            }
        }
        // per soglia: riscrivo la mappa delle piste (tier_loro = tier_nostro)
        for (const p of PISTE_SOGLIA) {
            const righe = [1, 2, 3]
                .map(t => ({ t, v: String(mappa[p.chiave]?.[t] ?? "").trim().replace(",", ".") }))
                .filter(x => x.v !== "")
                .map(x => ({ brand: "windtre", month: monthISO, pista: p.chiave, tier_nostro: x.t, tier_loro: x.t, perc: Number(x.v) }));
            // pista ATTIVABILE in SVUOTAMENTO: prima si esclude (perc 0), POI
            // si pulisce la mappa — l'ordine inverso, con un errore a metà,
            // lasciava perc null + mappa vuota = 100% ai ragazzi (revisore)
            if (p.attivabile && !righe.length) {
                const id = idPista[p.chiave];
                if (id) {
                    const up = await supabase.from("pay_piste").update({ perc_ragazzi: 0 }).eq("id", id);
                    if (up.error) { setBusy(false); setMsg("Errore: " + up.error.message); return; }
                }
            }
            const del = await supabase.from("pay_mappa_soglie").delete().eq("brand", "windtre").eq("month", monthISO).eq("pista", p.chiave);
            if (del.error) { setBusy(false); setMsg("Errore: " + del.error.message); return; }
            if (righe.length) {
                const ins = await supabase.from("pay_mappa_soglie").insert(righe);
                if (ins.error) { setBusy(false); setMsg("Errore: " + ins.error.message); return; }
            }
            // pista ATTIVABILE in ATTIVAZIONE: la mappa è scritta, ora la
            // pista entra ai ragazzi (fail-safe: se l'update salta, resta
            // esclusa e si risalva)
            if (p.attivabile && righe.length) {
                const id = idPista[p.chiave];
                if (id) {
                    const up = await supabase.from("pay_piste").update({ perc_ragazzi: null }).eq("id", id);
                    if (up.error) { setBusy(false); setMsg("Errore: " + up.error.message); return; }
                }
            }
        }
        // uniche: perc_ragazzi sulla pista azienda (validate sopra: mai NaN)
        for (const p of PISTE_UNICHE) {
            const id = idPista[p.chiave];
            if (!id) continue;
            const v = String(uniche[p.chiave] ?? "").trim().replace(",", ".");
            const n = v === "" ? null : Number(v);
            const up = await supabase.from("pay_piste").update({ perc_ragazzi: n }).eq("id", id);
            if (up.error) { setBusy(false); setMsg("Errore: " + up.error.message); return; }
        }
        setBusy(false); setMsg("Percentuali salvate ✓ — il tabellare dei ragazzi si aggiorna da solo.");
    };
    if (!pronto) return null;
    return (
        <div className="glass-panel rounded-2xl p-5 border-l-4 border-indigo-400/60">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">👥 % ai ragazzi — quota del commissioning azienda riconosciuta per soglia</div>
                <button onClick={salva} disabled={busy} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-50">{busy ? "…" : "💾 Salva percentuali"}</button>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">Vuoto = 100%. La gara Business è di rete: resta all&apos;azienda. Assicurazioni: vuote = restano all&apos;azienda, compilate = girano ai ragazzi con la % per soglia.</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {PISTE_SOGLIA.map((p) => (
                    <div key={p.chiave} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-xs font-bold text-slate-200 mb-2">{conSim(p.label)}</p>
                        <div className="flex items-center gap-2">
                            {[1, 2, 3].map((t) => (
                                <label key={t} className="flex-1 text-center">
                                    <span className="block text-[9px] uppercase tracking-wider text-slate-500 mb-1">S{t}</span>
                                    <span className="flex items-center gap-1">
                                        <input inputMode="decimal" value={mappa[p.chiave]?.[t] ?? ""}
                                            onChange={(e) => setMappa((prev) => ({ ...prev, [p.chiave]: { ...(prev[p.chiave] || {}), [t]: e.target.value } }))}
                                            placeholder={p.attivabile ? "—" : "100"} className="glass-input w-full text-sm text-center rounded-lg py-1.5" />
                                        <span className="text-[10px] text-slate-500">%</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                        {p.attivabile && <p className="text-[9px] text-slate-500 mt-1.5">vuote = restano all&apos;azienda · compilate = la sezione compare ai ragazzi</p>}
                    </div>
                ))}
                {PISTE_UNICHE.map((p) => (
                    <div key={p.chiave} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-xs font-bold text-slate-200 mb-2">{conSim(p.label)}</p>
                        <label className="block max-w-[140px]">
                            <span className="block text-[9px] uppercase tracking-wider text-slate-500 mb-1">tutte le soglie</span>
                            <span className="flex items-center gap-1">
                                <input inputMode="decimal" value={uniche[p.chiave] ?? ""}
                                    onChange={(e) => setUniche((prev) => ({ ...prev, [p.chiave]: e.target.value }))}
                                    placeholder="100" className="glass-input w-full text-sm text-center rounded-lg py-1.5" />
                                <span className="text-[10px] text-slate-500">%</span>
                            </span>
                        </label>
                    </div>
                ))}
            </div>
            {msg && <p className={cn("text-xs mt-3", msg.startsWith("Errore") ? "text-rose-300" : "text-emerald-300")}>{msg}</p>}
        </div>
    );
}


/* ═══ 📐 SOGLIE RAGAZZI W3 (Luca 25/08, seconda passata): in testa alla
   scheda ragazzi — mobile, fisso e luce&gas, da S1 a S3, EDITABILI. Si
   scrivono in pay_soglie lato "ragazzi": per il motore le soglie manuali
   dei ragazzi VINCONO su quelle derivate dall'azienda (esito 12/08), quindi
   vista e calcolo restano allineati per costruzione. Casella vuota = per
   quella pista valgono le derivate azienda (prime 3), mostrate come
   placeholder; tutte vuote e niente derivate = gara senza soglie (si paga
   la colonna base). ═══════════════════════════════════════════════════ */
const NOME_PISTA_SOGLIE: Record<string, string> = {
    mobile: `${SIM_TESTO} Mobile`, fisso: "🏠 Fisso", lucegas: "⚡ Luce & Gas",
    // le assicurazioni compaiono ai ragazzi solo con la % impostata nella
    // card 👥; le soglie però si possono già definire qui (derivate azienda
    // 30/45/60 come riferimento quando la pista è attiva)
    assicurazioni: "🛡 Assicurazioni",
};
export function W3RagazziSoglie({ mese }: { mese: string }) {
    const monthISO = `${mese}-01`;
    // effettive = ciò che il motore usa OGGI (manuali che vincono, o derivate
    // azienda tagliate a soglie_max): riempiono i placeholder delle caselle
    const [effettive, setEffettive] = useState<Record<string, number[]> | null>(null);
    const [um, setUm] = useState<Record<string, string>>({});
    const [manuali, setManuali] = useState<Record<string, Record<number, string>>>({});
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ testo: string; errore?: boolean } | null>(null);
    const carica = async (vivo?: () => boolean) => {
        const [tab, man] = await Promise.all([
            caricaTabellare("windtre", monthISO),
            supabase.from("pay_soglie").select("pista, tier, soglia_da").eq("brand", "windtre").eq("month", monthISO).eq("lato", "ragazzi"),
        ]);
        if (vivo && !vivo()) return;
        const eff: Record<string, number[]> = {};
        (tab?.soglie || []).filter(sg => NOME_PISTA_SOGLIE[sg.pista] && sg.tier <= 3)
            .forEach(sg => { (eff[sg.pista] ??= [])[sg.tier - 1] = sg.soglia_da; });
        const mm: Record<string, Record<number, string>> = {};
        ((man.data ?? []) as { pista: string; tier: number; soglia_da: number }[]).forEach(r => {
            if (NOME_PISTA_SOGLIE[r.pista] && Number(r.tier) <= 3) (mm[r.pista] ??= {})[Number(r.tier)] = String(Number(r.soglia_da));
        });
        setEffettive(eff);
        setUm(Object.fromEntries((tab?.piste || []).map(pp => [pp.chiave, pp.um])));
        setManuali(mm);
    };
    useEffect(() => {
        let vivo = true;
        carica(() => vivo);
        return () => { vivo = false; };
    }, [monthISO]);   // eslint-disable-line react-hooks/exhaustive-deps
    const salva = async () => {
        setBusy(true); setMsg(null);
        // PRIMA si valida TUTTO, poi si scrive (revisore 25/08: un errore sul
        // fisso non deve lasciare il mobile già scritto a metà giro)
        const perPista: Record<string, number[]> = {};
        for (const k of Object.keys(NOME_PISTA_SOGLIE)) {
            // compilate in ordine di casella, rinumerate S1..Sn
            const vals = [1, 2, 3].map(t => String(manuali[k]?.[t] ?? "").trim().replace(",", ".")).filter(v => v !== "");
            const nums = vals.map(Number);
            if (nums.some(n => !Number.isFinite(n) || n < 0)) {
                setBusy(false); setMsg({ testo: `${NOME_PISTA_SOGLIE[k]}: c'è un valore che non è un numero.`, errore: true }); return;
            }
            if (nums.some((n, i) => i > 0 && n <= nums[i - 1])) {
                setBusy(false); setMsg({ testo: `${NOME_PISTA_SOGLIE[k]}: le soglie devono crescere (S1 < S2 < S3).`, errore: true }); return;
            }
            perPista[k] = nums;
        }
        for (const k of Object.keys(NOME_PISTA_SOGLIE)) {
            const nums = perPista[k];
            // UPSERT sull'unicità (brand,month,pista,tier,lato) e POI delete dei
            // tier in più: mai un momento con la pista svuotata a DB (revisore
            // 25/08 — col delete+insert un errore di rete lasciava il vuoto)
            if (nums.length) {
                // fino-a in catena come nel motore (l'ultima resta aperta)
                const righe = nums.map((n, i) => ({
                    brand: "windtre", month: monthISO, lato: "ragazzi", pista: k,
                    tier: i + 1, soglia_da: n, soglia_a: i < nums.length - 1 ? nums[i + 1] - 1 : null,
                }));
                const up = await supabase.from("pay_soglie").upsert(righe, { onConflict: "brand,month,pista,tier,lato" });
                if (up.error) { setBusy(false); setMsg({ testo: "Errore: " + up.error.message, errore: true }); return; }
            }
            const del = await supabase.from("pay_soglie").delete()
                .eq("brand", "windtre").eq("month", monthISO).eq("lato", "ragazzi").eq("pista", k).gt("tier", nums.length);
            if (del.error) { setBusy(false); setMsg({ testo: "Errore: " + del.error.message, errore: true }); return; }
        }
        await carica();
        setBusy(false); setMsg({ testo: "Soglie salvate ✓ — la gara dei ragazzi le usa da subito." });
    };
    if (effettive === null) return null;
    return (
        <div className="glass-panel rounded-2xl p-5 border-l-4 border-amber-400/60">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">📐 Soglie della gara ragazzi — da S1 a S3: la soglia raggiunta sceglie la colonna dei pay</div>
                <button onClick={salva} disabled={busy} className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold disabled:opacity-50">{busy ? "…" : "💾 Salva soglie"}</button>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">Soglie proprie dei ragazzi, in punti. Pista con tutte le caselle vuote = valgono le soglie dell&apos;azienda (in grigio, dove esistono); compilata anche una sola casella, la scala della pista diventa solo quella.</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Object.keys(NOME_PISTA_SOGLIE).map(k => {
                    // le derivate azienda fanno da placeholder SOLO finché la
                    // pista è tutta vuota: appena c'è una manuale, la scala è
                    // quella e basta (revisore 25/08: il grigio accanto a una
                    // casella piena prometteva un fallback che non esiste)
                    const haManuali = [1, 2, 3].some(t => String(manuali[k]?.[t] ?? "").trim() !== "");
                    return (
                    <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-xs font-bold text-slate-200 mb-2">{conSim(NOME_PISTA_SOGLIE[k])} <span className="text-[10px] text-slate-500 font-normal">({um[k] || "punti"})</span></p>
                        <div className="flex items-center gap-2">
                            {[1, 2, 3].map(t => (
                                <label key={t} className="flex-1 text-center">
                                    <span className="block text-[9px] uppercase tracking-wider text-slate-500 mb-1">S{t}</span>
                                    <input inputMode="decimal" value={manuali[k]?.[t] ?? ""}
                                        onChange={e => setManuali(prev => ({ ...prev, [k]: { ...(prev[k] || {}), [t]: e.target.value } }))}
                                        placeholder={!haManuali && effettive[k]?.[t - 1] != null ? String(effettive[k][t - 1]) : "—"}
                                        className="glass-input w-full text-sm text-center rounded-lg py-1.5" />
                                </label>
                            ))}
                        </div>
                    </div>
                    );
                })}
            </div>
            {msg && <p className={cn("text-xs mt-3", msg.errore ? "text-rose-300" : "text-emerald-300")}>{msg.testo}</p>}
        </div>
    );
}
