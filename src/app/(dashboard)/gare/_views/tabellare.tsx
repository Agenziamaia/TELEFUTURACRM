"use client";

// TABELLARE PAY dentro Gare → operatore (Luca 11/08: "andava integrata nella
// sezione GARE che esiste già, ognuno dentro il proprio operatore" — prima
// viveva in Amministrazione → Tabellari Gare). Mese e lato arrivano dalla
// pagina Gare (barra mese + tab Azienda/Ragazzi): qui solo l'editor di
// pay_piste / pay_soglie / pay_righe — la fonte del Calcolatore $$$ e del
// motore commissioning. Le soglie si scrivono come le pensa Luca: solo il
// "da S1..Sn", il fino-a si ricava da solo. Un brand con SOLO il lato azienda
// deriva il ragazzi con la "% ai ragazzi" di ogni pista.
import { useCallback, useEffect, useState } from "react";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { dbError, notify } from "../../amministrazione/_views/toast";

type Pista = { id: string; chiave: string; nome: string; um: string; ordine: number; perc_ragazzi: number | null; soglie_pct?: number | null };
type Soglia = { id?: string; pista: string; tier: number; soglia_da: number; soglia_a: number | null; bonus?: number | null };
type Riga = {
    id: string; pista: string | null; nome: string;
    tipo_cliente: string | null; categoria: string | null; prodotto: string | null; offerta: string | null;
    brand_vendita: string | null; moltiplicatore?: boolean; punti: number; pay_base: number | null; pay_tiers: number[];
    gettone: boolean; attivo: boolean; note: string | null; ordine: number;
};

const BRAND_VENDITA = ["windtre", "vodafone", "fastweb", "sky", "tim", "iliad", "very", "ho", "kena", "s4", "dojo", "kipoint"];
const inputCls = "bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1 text-sm text-white w-20 text-right";
const num = (v: string): number => {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
};

export function TabellareEditor({ ctx, mese, lato, colore, vaiAzienda, onVuoto, nascondiVuoto }: {
    ctx: string; mese: string; lato: "ragazzi" | "azienda"; colore: string; vaiAzienda?: () => void;
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

    const load = useCallback(async () => {
        setCarico(true); setSoglieDirty(new Set()); setNuovaRigaPer(null);
        const [p, s, r, az] = await Promise.all([
            supabase.from("pay_piste").select("id, chiave, nome, um, ordine, perc_ragazzi, soglie_pct").eq("brand", ctx).eq("month", monthISO).eq("lato", lato).order("ordine"),
            supabase.from("pay_soglie").select("id, pista, tier, soglia_da, soglia_a, bonus").eq("brand", ctx).eq("month", monthISO).eq("lato", lato).order("tier"),
            supabase.from("pay_righe").select("id, pista, nome, tipo_cliente, categoria, prodotto, offerta, brand_vendita, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, note, ordine").eq("brand", ctx).eq("month", monthISO).eq("lato", lato).order("ordine").limit(1000),
            supabase.from("pay_piste").select("id", { count: "exact", head: true }).eq("brand", ctx).eq("month", monthISO).eq("lato", "azienda"),
        ]);
        setAziendaEsiste((az.count || 0) > 0);
        onVuoto?.(!(p.data || []).length && !(lato === "ragazzi" && (az.count || 0) > 0));
        // ragazzi senza tabellare proprio + azienda presente → carica e SCALA
        if (lato === "ragazzi" && !(p.data || []).length && (az.count || 0) > 0) {
            const [ap, as, ar] = await Promise.all([
                supabase.from("pay_piste").select("id, chiave, nome, um, ordine, perc_ragazzi, soglie_pct").eq("brand", ctx).eq("month", monthISO).eq("lato", "azienda").order("ordine"),
                supabase.from("pay_soglie").select("id, pista, tier, soglia_da, soglia_a, bonus").eq("brand", ctx).eq("month", monthISO).eq("lato", "azienda").order("tier"),
                supabase.from("pay_righe").select("id, pista, nome, tipo_cliente, categoria, prodotto, offerta, brand_vendita, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, note, ordine").eq("brand", ctx).eq("month", monthISO).eq("lato", "azienda").eq("attivo", true).order("ordine").limit(1000),
            ]);
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
                if (pct == null) return azS;
                const k = pct / 100;
                const out = azS.map((s, i) => ({ ...s, tier: i + 1, soglia_da: Math.round(s.soglia_da * k), soglia_a: s.soglia_a == null ? null : Math.round(s.soglia_a * k) }));
                for (let i = 0; i < out.length - 1; i++) out[i].soglia_a = out[i + 1].soglia_da - 1;
                return out;
            });
            setDerivato({
                piste: pisteAz,
                soglie: soglieAzScalate,
                righe: ((ar.data || []) as Riga[]).filter(x => !x.pista || chiaviAz.has(x.pista)).map(x => ({
                    ...x, punti: Number(x.punti || 0),
                    pay_base: scala(x.pay_base == null ? null : Number(x.pay_base), x.pista),
                    pay_tiers: (Array.isArray(x.pay_tiers) ? x.pay_tiers.map(Number) : []).map(v => scala(v, x.pista) as number),
                })),
            });
        } else {
            setDerivato(null);
            // riferimento azienda per le SOGLIE DERIVATE (% soglie da azienda,
            // Luca 13/08): serve al pannello ragazzi CON tabellare proprio
            if (lato === "ragazzi" && (az.count || 0) > 0) {
                const [ap2, as2] = await Promise.all([
                    supabase.from("pay_piste").select("chiave, ordine, soglie_pct").eq("brand", ctx).eq("month", monthISO).eq("lato", "azienda").order("ordine"),
                    supabase.from("pay_soglie").select("pista, tier, soglia_da, soglia_a, bonus").eq("brand", ctx).eq("month", monthISO).eq("lato", "azienda").order("tier"),
                ]);
                setAziendaRef({
                    piste: ((ap2.data || []) as { chiave: string; ordine: number; soglie_pct: number | null }[]),
                    soglie: ((as2.data || []) as Soglia[]).map(x => ({ ...x, soglia_da: Number(x.soglia_da), soglia_a: x.soglia_a == null ? null : Number(x.soglia_a) })),
                });
            } else setAziendaRef(null);
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
    // PAY SOTTO LA SOGLIA (Luca 13/08, W3 rete): per ogni soglia della pista
    // si mostra il pay per pezzo/evento (unico se le righe coincidono, min–max
    // altrimenti; i moltiplicatori restano fuori — lì il pay dipende dal
    // canone). Le assicurazioni mostrano invece il BONUS a volume, che vive
    // sulla soglia stessa (pay_soglie.bonus) ed è editabile.
    const payPerSoglia = (chiave: string, nTiers: number): (string | null)[] => {
        const rr = righe.filter(r => r.pista === chiave && !r.gettone && r.attivo && !r.moltiplicatore);
        if (!rr.length) return Array(nTiers).fill(null);
        return Array.from({ length: nTiers }, (_, i) => {
            const vals = rr.map(r => r.pay_tiers[i]).filter((v): v is number => v != null && Number.isFinite(v));
            if (!vals.length) return null;
            const mn = Math.min(...vals), mx = Math.max(...vals);
            return mn === mx ? `${mn} €` : `${mn}–${mx} €`;
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
            supabase.from("pay_piste").select("chiave, nome, um, ordine, perc_ragazzi, soglie_pct").eq("brand", ctx).eq("month", prev).eq("lato", lato),
            supabase.from("pay_soglie").select("pista, tier, soglia_da, soglia_a, bonus").eq("brand", ctx).eq("month", prev).eq("lato", lato),
            supabase.from("pay_righe").select("pista, nome, tipo_cliente, categoria, prodotto, offerta, brand_vendita, punti, pay_base, pay_tiers, gettone, attivo, note, ordine").eq("brand", ctx).eq("month", prev).eq("lato", lato).limit(1000),
        ]);
        if (!p.data?.length) { notify(`Nessun tabellare (${lato}) su ${fonteCopia}`); return; }
        const e1 = await supabase.from("pay_piste").insert(p.data.map(x => ({ ...x, brand: ctx, month: monthISO, lato }))).select("id");
        const e2 = (s.data?.length ? await supabase.from("pay_soglie").insert(s.data.map(x => ({ ...x, brand: ctx, month: monthISO, lato }))).select("id") : { data: [], error: null });
        const e3 = (r.data?.length ? await supabase.from("pay_righe").insert(r.data.map(x => ({ ...x, brand: ctx, month: monthISO, lato }))).select("id") : { data: [], error: null });
        if (dbError("Copia mese", e1.error || e2.error || e3.error)) return;
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
    const gettoni = righe.filter(r => r.gettone || !r.pista);

    if (carico) return <div className="text-slate-400 text-sm">Carico il tabellare…</div>;

    if (!piste.length) {
        if (nascondiVuoto && !(lato === "ragazzi" && aziendaEsiste)) return null;
        if (lato === "ragazzi" && aziendaEsiste && derivato) {
            const soglieDer = (pista: string) => derivato.soglie.filter(x => x.pista === pista).sort((a, b) => a.tier - b.tier);
            return (
                <div className="space-y-5">
                    <div className="glass-panel rounded-2xl px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
                        <div className="text-[12px] text-slate-300">
                            🧮 Tabellare ragazzi <b>compilato dal lato azienda</b> — {derivato.piste.map(x => `${x.nome} ${x.perc_ragazzi ?? 100}%`).join(" · ")}. Sola lettura: per modificare si lavora sull&apos;azienda.
                        </div>
                        {vaiAzienda && <button onClick={vaiAzienda} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: colore }}>🏢 Lavora sul lato azienda</button>}
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
                                {righeS.filter(x => x.mie.length).map(({ px, mie }) => (
                                    <div key={px.id} className="flex items-center gap-2 flex-wrap mt-2">
                                        <span className="text-[11px] text-slate-500">↘ pay girato · <b className="text-slate-300">{px.nome}</b>:</span>
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
                                                        {[1, 2, 3, 4, 5, 6].map(t => <option key={t} value={t} className="bg-slate-800">S{t}</option>)}
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
                        const scala = soglieDer(px.chiave);
                        const rr = derivato.righe.filter(r => r.pista === px.chiave && !r.gettone);
                        if (!rr.length) return null;
                        return (
                            <div key={px.id} className="glass-panel rounded-2xl overflow-hidden">
                                <div className="px-4 pt-3 pb-1.5 flex items-center gap-3 flex-wrap">
                                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{px.nome} <span className="text-amber-300/80">× {px.perc_ragazzi ?? 100}%</span></span>
                                    <span className="text-[11px] text-slate-500">{scala.map((x, i) => `S${i + 1}: ${x.soglia_da}${i < scala.length - 1 ? `–${scala[i + 1].soglia_da - 1}` : "+"}`).join(" · ")}</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                                <th className="text-left font-semibold px-3 py-1.5">Offerta</th>
                                                <th className="px-1.5 py-1.5 font-semibold text-center w-12 text-indigo-300">Punti</th>
                                                <th className="px-1.5 py-1.5 font-semibold text-center w-16">Base</th>
                                                {scala.map((_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-16">S{i + 1}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rr.map(r => (
                                                <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                                                    <td className="px-3 py-1 min-w-[170px]" title={[r.tipo_cliente, r.categoria, r.prodotto, r.offerta].filter(Boolean).join(" · ") + (r.note ? ` — ${r.note}` : "")}>{r.nome}{r.note && <span className="text-slate-600 text-[11px] ml-1 cursor-help">ⓘ</span>}</td>
                                                    <td className="px-1 py-1 text-center text-indigo-300 font-semibold">{r.punti || "—"}</td>
                                                    <td className="px-1 py-1 text-center text-slate-300">{r.pay_base ?? "—"}</td>
                                                    {scala.map((_, i) => <td key={i} className="px-1 py-1 text-center text-white font-medium">{r.pay_tiers[i] ?? "—"}</td>)}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                    {(derivato.righe.some(r => r.gettone || !r.pista) || righe.length > 0) && (
                        <div className="glass-panel rounded-2xl overflow-hidden">
                            <div className="px-4 pt-3 pb-1.5 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">💰 Gettoni — pagano sempre, senza soglia</div>
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                        <th className="text-left font-semibold px-3 py-1.5">Voce</th>
                                        <th className="px-1.5 py-1.5 font-semibold text-center w-20">Gettone €</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...derivato.righe.filter(r => r.gettone || !r.pista), ...righe.filter(r => r.gettone || !r.pista)].map(r => (
                                        <tr key={r.id} className="border-t border-white/5">
                                            <td className="px-3 py-1" title={[r.tipo_cliente, r.categoria, r.prodotto, r.offerta].filter(Boolean).join(" · ") + (r.note ? ` — ${r.note}` : "")}>{r.nome}{r.note && <span className="text-slate-600 text-[11px] ml-1 cursor-help">ⓘ</span>}</td>
                                            <td className="px-1 py-1 text-center text-white font-medium">{r.pay_base ?? "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
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

            {/* SOGLIE per pista */}
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
                                        // sotto la soglia il suo pay (W3 rete): bonus dove c'è,
                                        // altrimenti pay per pezzo/evento derivato dalle righe
                                        const conBonus = lato === "azienda" && scala.some(s => s.bonus != null);
                                        const pays = lato === "azienda" && !conBonus ? payPerSoglia(p.chiave, maxT) : [];
                                        return (
                                        <tr key={p.id} className="border-t border-white/5">
                                            <td className="px-3 py-1.5 font-semibold text-white whitespace-nowrap">{p.nome} <span className="text-slate-500 font-normal text-xs">({p.um})</span>{der && <span className="text-sky-400/80 text-[10px] font-normal ml-1.5">× {der.pct}%</span>}{conBonus && <div className="text-[10px] text-emerald-400/80 font-normal">🎁 bonus a soglia</div>}</td>
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
                                                            <div className="mt-1">
                                                                <input value={scala[i].bonus == null ? "" : String(scala[i].bonus)}
                                                                    onChange={e => setBonusVal(p.chiave, scala[i].tier, e.target.value)}
                                                                    title="Bonus a volume al raggiungimento della soglia (per PDV) — si salva col 💾 della riga"
                                                                    className="bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5 text-[11px] text-emerald-200 w-16 text-center tabular-nums" placeholder="🎁 —" />
                                                            </div>
                                                        )}
                                                        {!der && !conBonus && pays[i] && (
                                                            <div className="mt-0.5 text-[10px] text-emerald-300/90 tabular-nums" title="Pay per pezzo/evento alla soglia (min–max delle righe della pista)">{pays[i]}</div>
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

            {/* RIGHE per pista — TABELLE compatte (segnalazione Luca 11/08: numeri
                centrati, colonne strette, niente scroll infinito — stile delle
                griglie S1-S4 che manda lui) */}
            {piste.map(p => {
                const rr = righeDiPista(p.chiave);
                const nTiers = soglieDi(p.chiave).length;
                return (
                    <div key={p.id} className="glass-panel rounded-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 pt-3 pb-2 gap-3 flex-wrap">
                            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{p.nome} <span className="text-slate-600">({rr.length})</span></div>
                            <div className="flex items-center gap-3">
                                {/* % PAY ai ragazzi QUI, dove i pay si vedono (Luca 13/08) */}
                                {lato === "azienda" && (
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
                        </div>
                        {nuovaRigaPer === p.chiave && <div className="px-4"><NuovaRiga ctx={ctx} monthISO={monthISO} pista={p.chiave} nTiers={nTiers} lato={lato} dopo={() => { setNuovaRigaPer(null); load(); }} /></div>}
                        {rr.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                            <th className="text-left font-semibold px-3 py-1.5">Offerta</th>
                                            <th className="px-1.5 py-1.5 font-semibold text-center w-12">Punti</th>
                                            <th className="px-1.5 py-1.5 font-semibold text-center w-16">Base</th>
                                            {Array.from({ length: nTiers }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-16">S{i + 1}</th>)}
                                            <th className="px-2 py-1.5 w-20"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rr.map(r => <RigaRow key={r.id} r={r} nTiers={nTiers} isDirty={dirty(r)} onUp={upRiga} onSalva={salvaRiga} onElimina={eliminaRiga} />)}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {!rr.length && <div className="text-slate-500 text-sm px-4 pb-3">Nessuna riga su questa pista.</div>}
                    </div>
                );
            })}

            {/* GETTONI — tabella compatta */}
            <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">💰 Gettoni — pagano sempre, senza soglia <span className="text-slate-600">({gettoni.length})</span></div>
                    <button onClick={() => setNuovaRigaPer(nuovaRigaPer === "__gettoni" ? null : "__gettoni")} className="text-xs text-slate-300 border border-white/10 rounded-lg px-2 py-1 flex items-center gap-1"><Plus size={13} /> Gettone</button>
                </div>
                {nuovaRigaPer === "__gettoni" && <div className="px-4"><NuovaRiga ctx={ctx} monthISO={monthISO} pista={null} nTiers={0} lato={lato} dopo={() => { setNuovaRigaPer(null); load(); }} /></div>}
                {gettoni.length > 0 && (
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                <th className="text-left font-semibold px-3 py-1.5">Voce</th>
                                <th className="px-1.5 py-1.5 font-semibold text-center w-20">Gettone €</th>
                                <th className="px-2 py-1.5 w-20"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {gettoni.map(r => <RigaRow key={r.id} r={r} nTiers={0} isDirty={dirty(r)} onUp={upRiga} onSalva={salvaRiga} onElimina={eliminaRiga} />)}
                        </tbody>
                    </table>
                )}
                {!gettoni.length && <div className="text-slate-500 text-sm px-4 pb-3">Nessun gettone.</div>}
            </div>
        </div>
    );
}

// Riga di TABELLA — top-level (lezione CardVoce: mai annidata). Aggancio e
// note vivono nel tooltip della cella Offerta: la riga resta alta una riga.
function RigaRow({ r, nTiers, isDirty, onUp, onSalva, onElimina }: {
    r: Riga; nTiers: number; isDirty: boolean;
    onUp: (id: string, patch: Partial<Riga>) => void;
    onSalva: (r: Riga) => void; onElimina: (r: Riga) => void;
}) {
    const anchor = [r.tipo_cliente, r.categoria, r.prodotto, r.offerta].filter(Boolean).join(" · ") || "qualsiasi vendita";
    const tip = anchor + (r.brand_vendita ? ` · [${r.brand_vendita}]` : "") + (r.moltiplicatore ? " · i valori sono MOLTIPLICATORI del canone mensile" : "") + (r.note ? ` — ${r.note}` : "");
    const cell = "w-full bg-transparent text-center text-sm text-white border-b border-transparent focus:border-indigo-400 outline-none py-0.5";
    return (
        <tr className={`border-t border-white/5 hover:bg-white/[0.03] ${r.attivo ? "" : "opacity-40"}`}>
            <td className="px-3 py-0.5 min-w-[170px]">
                <div className="flex items-center gap-1">
                    <input value={r.nome} title={tip} onChange={e => onUp(r.id, { nome: e.target.value })}
                        className="bg-transparent text-sm text-white w-full border-b border-transparent focus:border-indigo-400 outline-none py-0.5" />
                    {r.moltiplicatore && <span title="moltiplicatori del canone mensile" className="text-indigo-300 text-[11px] font-bold shrink-0">×</span>}
                    {r.note && <span title={tip} className="text-slate-600 text-[11px] cursor-help shrink-0">ⓘ</span>}
                </div>
            </td>
            {!r.gettone && <td className="px-1 py-0.5"><input value={r.punti} onChange={e => onUp(r.id, { punti: num(e.target.value) })} className={cell} /></td>}
            <td className="px-1 py-0.5"><input value={r.pay_base ?? ""} onChange={e => onUp(r.id, { pay_base: e.target.value === "" ? null : num(e.target.value) })} className={cell} /></td>
            {!r.gettone && Array.from({ length: nTiers }, (_, i) => (
                <td key={i} className="px-1 py-0.5">
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
    const [tiers, setTiers] = useState<string[]>(Array.from({ length: nTiers }, () => ""));
    const salva = async () => {
        if (!nome.trim()) { notify("Dai un nome alla riga"); return; }
        const { error } = await supabase.from("pay_righe").insert({
            brand: ctx, month: monthISO, pista, lato, nome: nome.trim(),
            tipo_cliente: tc, categoria: cat.trim() || null, prodotto: prod.trim() || null, offerta: off.trim() || null,
            brand_vendita: bv, punti: pista ? Number(punti.replace(",", ".")) || 0 : 0,
            pay_base: base === "" ? null : Number(base.replace(",", ".")) || 0,
            pay_tiers: pista ? tiers.map(t => Number(t.replace(",", ".")) || 0) : [],
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
                {pista && <label className="text-[11px] text-slate-400">punti <input value={punti} onChange={e => setPunti(e.target.value)} className={inputCls + " w-14"} /></label>}
                <label className="text-[11px] text-slate-400">{pista ? "base €" : "gettone €"} <input value={base} onChange={e => setBase(e.target.value)} className={inputCls} /></label>
                {pista && tiers.map((t, i) => (
                    <label key={i} className="text-[11px] text-slate-400">S{i + 1} € <input value={t} onChange={e => setTiers(p => p.map((x, j) => j === i ? e.target.value : x))} className={inputCls} /></label>
                ))}
                <button onClick={salva} className="text-emerald-300 text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-500/40"><Save size={13} /> Aggiungi</button>
            </div>
        </div>
    );
}
