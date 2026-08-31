"use client";

// DIREZIONE INSERIMENTO v3 (Luca 26/08 sera, rifinita su dettato):
// — selettore BRAND in testa: ogni operatore ha le sue realtà (WindTre = i
//   codici della lettera; Vodafone = Vodafone Store e VND; Fastweb = lettera
//   T2; Sky = canale unico);
// — dentro il codice si vede SUBITO la situazione come nell'area Rete
//   dell'Analisi: la SogliaBar (produzione piena, PROIEZIONE in sfumatura a
//   strisce, tacche alle soglie) — stesso componente, stessa fonte;
// — il target si sceglie cliccando la soglia: il numero è SEMPRE INTERO e
//   include lo SFRIDO della pista (l'extra % d'errore, es. mobile +5%),
//   arrotondato per eccesso; RICLICCANDO la soglia attiva si DESELEZIONA
//   (prima ci si restava incastrati — bug segnalato su Collatina S2);
// — il widget Home indirizza le vendite sul codice dove manca di più, col
//   favore al negozio di chi chiede.
// La vecchia mappa statica (tabella direzione_inserimento) resta a DB ma
// non è più montata: questa la sostituisce (export con gli stessi nomi).
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import {
    caricaDirezione, consigliaCodici, targetConSfrido, proiezioneDir, strategiaDi, prioritaDi, èMioCodice, vociPunti, puntiBase,
    finestraBilancia, codiceBilancia, codiceAssociato,
    DIR_BRANDS, W3_PALETTO_BUSINESS, type DirBrandId, type Direzione,
} from "@/lib/direzioneTargets";
import { SogliaBar as SogliaBarRaw } from "@/app/(dashboard)/analisi/_charts";
import { Compass, Loader2, Check, RotateCcw } from "lucide-react";
import { PISTE_PARALLELE } from "@/lib/commissioning";
import { TRK_BRAND_LOGOS, TRK_LOGO_SCALE } from "@/lib/brandAssets";
import { cn } from "@/utils";

const SogliaBar = SogliaBarRaw as unknown as (p: {
    label: string; emoji?: string; punti: number; pezzi?: number;
    soglie: { tier: number; soglia_da: number }[]; colore?: string;
    proiezione?: number | null; nota?: string | null; unit?: string;
    targetDir?: number | null;
    bruciati?: number;
}) => React.ReactElement;

/* Quanto ci sta ancora in questo codice PRIMA che convenga cambiarlo: si
   guarda il traguardo della fase in corso — la S1 nuda, poi il suo sfrido,
   poi il target della direzione (Luca 28/08, le due priorità zero). */
/* L'avviso «qui ci sta solo questa» esce quando l'attivazione CHIUDE il
   traguardo della fase: quel che resta da fare è minore o uguale a quanto
   vale ciò che sto caricando (Luca 28/08). Senza punti dichiarati si
   ripiega su un pezzo, che è l'unità di misura del business mobile. */
function chiudeIlCodice(capienza: number, punti: number): boolean {
    return capienza > 0 && capienza <= (punti > 0 ? punti : 1);
}

/* QUANTO CI STA ANCORA QUI PRIMA CHE CONVENGA CAMBIARE CODICE.
   Non è «quanto manca alla S1»: chiusa la S1 il codice non esce di scena,
   passa alla ⓪·1 e resta prioritario fino allo sfrido (Luca 28/08: «dopo
   aver chiuso la soglia 1 di Mazzini la priorità non continua a essere lo
   sfrido di Mazzini, visto che è l'unico che non ha ancora raggiunto lo
   0.1?» — sì, e l'avviso diceva il contrario).
   L'unico caso in cui ci si ferma alla S1 nuda è quando QUALCUN ALTRO è
   ancora sotto la sua: lì, appena questo chiude, passa avanti l'altro. */
function capienzaDi(
    k: { mancanoS1: number; mancanoS1Sfr: number; mancano: number; sottoS1?: boolean },
    altriSottoS1 = false,
): number {
    if (k.sottoS1 && altriSottoS1 && k.mancanoS1 > 0) return k.mancanoS1;
    if (k.mancanoS1Sfr > 0) return k.mancanoS1Sfr;
    if (k.mancanoS1 > 0) return k.mancanoS1;
    return k.mancano;
}

/* LA CODA DEI CODICI (Luca 28/08): «se ne carichi più di una, una per
   codice». Sta staccata dall'indicazione grande, in tono minore, e dà solo
   i NOMI — mai target né avanzamenti: il widget dei ragazzi resta riservato. */
/* LA CARTA COL NOME DEL NEGOZIO — «Caricala su …».
   ⚠️ QUANDO NON C'È SPAZIO L'ETICHETTA SPARISCE (Luca 29/08). Aprendo i due
   cassetti la carta si stringe, e «📍 CARICALA SU» rubava l'altezza al nome —
   che è l'unica cosa che serve leggere da lontano. L'etichetta è una cortesia:
   il nome no.
   Si misura la carta vera con un ResizeObserver invece di indovinare da una
   dimensione del widget: a stringerla non è la larghezza della Home, sono i
   cassetti che l'utente apre — una cosa che solo la carta stessa sa. */
function CartaCodice({ colore, nome, mio }: { colore: string; nome: string; mio?: boolean }) {
    const box = useRef<HTMLDivElement>(null);
    const [stretta, setStretta] = useState(false);
    useEffect(() => {
        const el = box.current;
        if (!el) return;
        // 96px = i 40 di padding + il nome (36) + l'etichetta (14) e un filo
        // d'aria. Sotto, o si toglie l'etichetta o il nome esce dal bordo.
        const misura = () => setStretta(el.clientHeight < 96);
        misura();
        const ro = new ResizeObserver(misura);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return (
        <div ref={box} className="rounded-2xl px-4 py-5 border flex-1 flex flex-col justify-center items-center text-center min-h-0"
            style={{
                background: `linear-gradient(160deg, color-mix(in srgb, ${colore} 18%, transparent), color-mix(in srgb, ${colore} 5%, transparent))`,
                borderColor: `color-mix(in srgb, ${colore} 40%, transparent)`,
                boxShadow: `0 0 26px color-mix(in srgb, ${colore} 25%, transparent)`,
            }}>
            {!stretta && <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400">📍 Caricala su</div>}
            <div className="text-3xl font-black text-white leading-tight drop-shadow flex items-center justify-center gap-2 flex-wrap">
                {nome}
                {mio && <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded-md px-2 py-0.5">🏠 il tuo negozio</span>}
            </div>
        </div>
    );
}

function CodaCodici({ prossimi }: { prossimi: string[] }) {
    if (!prossimi.length) return null;
    /* È UN'ECCEZIONE, e va vestita da eccezione (Luca 28/08): con la regola
       della capienza il codice cambia di rado — quando succede deve far
       fermare un attimo, quindi ambra e ⚠️, non un'informazione qualsiasi. */
    return (
        <div className="mt-3 rounded-xl border border-amber-400/40 border-l-[3px] border-l-amber-400 bg-amber-500/[0.12] px-3 py-2 flex items-start gap-2 text-left">
            <span className="text-base leading-none shrink-0 mt-0.5">⚠️</span>
            <div className="text-[11px] leading-snug text-slate-300">
                <span className="font-bold text-amber-200">Qui ci sta solo questa.</span>{" "}
                <span className="text-slate-400">Se ne hai altre:</span>{" "}
                la prossima su <b className="text-white">{prossimi[0]}</b>
                {prossimi[1] ? <>, poi <b className="text-white">{prossimi[1]}</b></> : null}.
            </div>
        </div>
    );
}

const it = (v: number) => Number(v || 0).toLocaleString("it-IT", { maximumFractionDigits: 2 });
const mesePrimo = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };

// piste da NON targetizzare mai (conteggi paralleli / pay unico senza corsa).
// ⚠️ SONO TUTTE LE PARALLELE, non solo la Partnership (rilievo del revisore
// 26/08): l'Extra Gara P.IVA è un bonus AZIENDA e Luca è stato netto — «i
// ragazzi non devono averne PER NIENTE visibilità». Bastava che qualcuno le
// desse un target dal pannello e il chip sarebbe comparso nella Home di tutti,
// perché la Bussola mostra le piste con target senza guardare il ruolo.
const PISTE_FUORI = new Set<string>([...PISTE_PARALLELE]);

// sfrido del PALETTO BUSINESS in PEZZI (Luca 26/08 notte-4): cuscinetto
// sopra il 6 della lettera — vive in direzione_sfridi con questa pista
// speciale (pct = pezzi, non percentuale)
const SFRIDO_PALETTO = "__paletto_business__";

// nome breve dei codici nelle pillole: prima parola, MA se è corta («San»)
// si tiene anche la seconda — «San Paolo» non diventa mai «San» (Luca 27/08)
const nomeBreve = (n: string) => {
    const w = String(n || "").trim().split(/\s+/);
    return w[0] && w[0].length <= 4 && w[1] ? `${w[0]} ${w[1]}` : (w[0] || n);
};

// etichette parlanti per le scale «di regola» (Luca 26/08 notte): la CB ha
// il target Partnership (80% = premio ridotto, 100% = pieno), i Protetti
// hanno la soglia-malus «almeno 1»
const etichettaSoglia = (brand: string, pista: string, i: number) => {
    if (brand === "windtre" && pista === "cb") return i === 0 ? "80%" : "Target";
    if (brand === "windtre" && pista === "protetti") return "Almeno";
    return `S${i + 1}`;
};

// L'EMOJI DEL MOBILE È UNA SIM, NON UN TELEFONO (Luca 31/08): «mobile» qui è
// una pista di gara, cioè ATTIVAZIONI DI SIM. Il telefono 📱 resta al telefono
// come prodotto — rateizzato, venduto, device — che avrà sezioni sue.
// 📶 e non 💳: la carta e' gia' il POS in mezzo CRM — nello stesso menu delle
// piste (Tracking PDA: «POS» → 💳) e nella stessa funzione del tabellare — e
// due voci con la stessa icona nello stesso elenco non si distinguono.
// 📶 invece nel CRM SIGNIFICA GIA' SIM: e' l'icona della categoria «📶 SIM»
// della marginalita', della regola /\bsim\b/ del catalogo cassa e del gruppo
// «📶 SIM» dell'Analisi. Adottarla qui allinea il mobile a quello che il resto
// del CRM chiama SIM da sempre, invece di inventare un terzo segno.
export const EMOJI_MOBILE = "📶";
const EMOJI_PISTA = (nome: string) => {
    const n = nome.toLowerCase();
    if (n.includes("mobile")) return EMOJI_MOBILE;
    if (n.includes("fisso") || n.includes("wireline")) return "🌐";
    if (n.includes("luce") || n.includes("gas") || n.includes("energia")) return "⚡";
    if (n.includes("piva") || n.includes("business") || n.includes("paletto")) return "💼";
    if (n.includes("assicura")) return "🛡️";
    if (n.includes("customer") || n.includes("cb")) return "🔁";
    if (n.includes("tv") || n.includes("sky")) return "📺";
    return "🎯";
};

// ─────────────────────────────────────────────────────────────────────────────
// PANNELLO ADMIN (Gare → Direzione Inserimento)
// ─────────────────────────────────────────────────────────────────────────────
export function DirezioneInserimentoAdmin() {
    const { user } = useAuth();
    const [brand, setBrand] = useState<DirBrandId>("windtre");
    const [monthISO, setMonthISO] = useState(mesePrimo());
    const [dir, setDir] = useState<Direzione | null>(null);
    const [aperto, setAperto] = useState<string | null>(null);
    /* UNA PISTA SOLA (Luca 28/08): «se clicco direttamente sul pallino Fisso o
       Mobile mi deve aprire solo quel codice con solo la pista che sto
       cliccando; se clicco da qualsiasi altra parte sulla barra mi apre tutto
       il codice». Il pallino è già la sintesi di quella pista: cliccarlo
       chiede il dettaglio DI QUELLA, non di tutte e quattro. */
    const [pistaSola, setPistaSola] = useState<string | null>(null);
    /* CONFRONTO VERTICALE (Luca 28/08): «sulla linea del franchising mettimi
       quegli stessi pulsanti, senza colore, e cliccandoli mi apre tutti i
       codici con SOLO quel KPI in visione».
       È l'altra metà del gesto: il pallino sulla riga guarda UN codice a
       fondo, questo guarda UN KPI su tutti — la colonna che serve quando si
       decide dove caricare. `sez` perché i due gruppi (Franchising e
       Multibrand) restano indipendenti. */
    const [kpiTutti, setKpiTutti] = useState<{ sez: string; chiave: string } | null>(null);
    /* SI ESCE CLICCANDO FUORI (Luca 28/08), non con un bottone che ruba una
       riga a ogni scheda. Dentro la zona dei codici si continua a lavorare —
       si modificano i target, si aprono i pannelli — e il filtro resta. */
    useEffect(() => {
        if (!pistaSola && !kpiTutti) return;
        const fuori = (e: MouseEvent) => {
            const t = e.target as HTMLElement | null;
            // dentro il pannello si continua a lavorare (sfridi, legenda,
            // priorità) senza perdere il filtro: revisore 28/08
            if (t && t.closest("[data-zona-kpi],[data-pannello-direzione]")) return;
            setPistaSola(null); setKpiTutti(null);
        };
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setPistaSola(null); setKpiTutti(null); } };
        document.addEventListener("mousedown", fuori);
        document.addEventListener("keydown", esc);
        return () => { document.removeEventListener("mousedown", fuori); document.removeEventListener("keydown", esc); };
    }, [pistaSola, kpiTutti]);
    const apriTutto = (cod: string, giaAperto: boolean) => {
        setPistaSola(null);
        setAperto(giaAperto && !pistaSola ? null : cod);
    };
    const apriSolaPista = (cod: string, chiave: string) => {
        // ri-cliccare la stessa pastiglia richiude: è l'unico gesto che serve
        if (aperto === cod && pistaSola === chiave) { setAperto(null); setPistaSola(null); return; }
        setAperto(cod);
        setPistaSola(chiave);
    };
    const [bozze, setBozze] = useState<Record<string, string>>({});       // "cod|pista" → input target
    const [bozzeSfr, setBozzeSfr] = useState<Record<string, string>>({}); // pista → input sfrido
    const [salvate, setSalvate] = useState<Record<string, boolean>>({});
    const [erroriSalva, setErroriSalva] = useState<Record<string, boolean>>({});
    const [gruppoAperto, setGruppoAperto] = useState(false);
    const [recapAperto, setRecapAperto] = useState(false);
    const [legendaAperta, setLegendaAperta] = useState(false);
    const [giro, setGiro] = useState(0);
    /* ADESSO ↔ IERI SERA (Luca 28/08 sera).
       Qui non si guarda un numero: si decide DOVE mandare la prossima
       attivazione. Con i numeri fermi a ieri sera il consiglio non vede quello
       che è già stato caricato oggi e continua a indicare codici ormai pieni:
       li manda **over target**. Perciò si parte SEMPRE dalla produzione viva —
       «ieri sera» è una vista che si può chiedere, non il modo di ragionare. */
    const [vistaIeri, setVistaIeri] = useState(false);

    useEffect(() => {
        let vivo = true;
        setDir(null); setAperto(null);
        caricaDirezione(brand, monthISO, { includiOggi: !vistaIeri })
            .then((d) => { if (vivo) { setDir(d); setBozze({}); setBozzeSfr({}); } });
        return () => { vivo = false; };
    }, [brand, monthISO, giro, vistaIeri]);

    const flash = (chiave: string, ok: boolean) => {
        if (!ok) { setErroriSalva((s) => ({ ...s, [chiave]: true })); return; }
        setErroriSalva((s) => ({ ...s, [chiave]: false }));
        setSalvate((s) => ({ ...s, [chiave]: true }));
        setTimeout(() => setSalvate((s) => ({ ...s, [chiave]: false })), 1600);
    };
    // tier = soglia di provenienza del target (null = scritto a mano): al
    // cambio di sfrido i target con tier si RICALCOLANO da soli (notte-7)
    const salva = async (cod_gara: string, pista: string, valore: number, tier: number | null = null) => {
        const chiave = `${cod_gara}|${pista}`;
        const { error } = await supabase.from("direzione_targets").upsert(
            { brand, month: monthISO, cod_gara, pista, target: valore, tier: valore > 0 ? tier : null, updated_at: new Date().toISOString(), updated_by: user?.name || null },
            { onConflict: "brand,month,cod_gara,pista" });
        if (error) { flash(chiave, false); return; }
        setDir((p) => p ? {
            ...p,
            codici: p.codici.map((k) => k.cod_gara === cod_gara ? { ...k, targets: { ...k.targets, [pista]: valore }, tiersScelti: { ...k.tiersScelti, [pista]: valore > 0 ? tier : null } } : k),
        } : p);
        flash(chiave, true);
    };
    const salvaSfrido = async (pista: string, pct: number) => {
        const chiave = `sfr|${pista}`;
        const { error } = await supabase.from("direzione_sfridi").upsert(
            { brand, month: monthISO, pista, pct, updated_at: new Date().toISOString(), updated_by: user?.name || null },
            { onConflict: "brand,month,pista" });
        if (error) { flash(chiave, false); return; }
        setDir((p) => p ? { ...p, sfridi: { ...p.sfridi, [pista]: pct } } : p);
        flash(chiave, true);
        // RICALCOLO AUTOMATICO (Luca notte-7): i target nati da una soglia
        // si riallineano al nuovo sfrido — quelli a mano non si toccano
        if (dir && pista !== SFRIDO_PALETTO) {
            for (const k of dir.codici) {
                const t = k.tiersScelti?.[pista];
                const scala = k.soglie[pista] || [];
                if ((k.targets[pista] || 0) > 0 && t != null && Number(scala[t - 1]) > 0) {
                    const nuovo = targetConSfrido(Number(scala[t - 1]), pct);
                    if (nuovo !== k.targets[pista]) await salva(k.cod_gara, pista, nuovo, t);
                }
            }
        }
    };
    // politica di una pista di GRUPPO (proprio/bilancia) e associazioni MB
    const salvaPolitica = async (pista: string, modo: string, dati?: Record<string, unknown> | null) => {
        const chiave = `pol|${pista}`;
        const { error } = await supabase.from("direzione_politiche").upsert(
            { brand, month: monthISO, pista, modo, ...(dati !== undefined ? { dati } : {}), updated_at: new Date().toISOString(), updated_by: user?.name || null },
            { onConflict: "brand,month,pista" });
        if (error) { flash(chiave, false); return; }
        setDir((p) => p ? { ...p, politiche: { ...p.politiche, [pista]: { modo, dati: dati ?? p.politiche[pista]?.dati ?? null } } } : p);
        flash(chiave, true);
    };

    const mesi = useMemo(() => {
        const out: { iso: string; label: string }[] = [];
        const d = new Date(); d.setDate(1);
        for (let i = 0; i < 4; i++) {
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
            out.push({ iso, label: d.toLocaleDateString("it-IT", { month: "long", year: "numeric" }) });
            d.setMonth(d.getMonth() - 1);
        }
        return out;
    }, []);
    const bMeta = DIR_BRANDS.find((b) => b.id === brand)!;

    return (
        <div className="space-y-4" data-pannello-direzione>
            {/* SOLO I BRAND, tessere come nella sezione CALLER (Luca 26/08 sera-5):
                logo grande, attivo acceso, inattivo in grayscale — niente
                riquadri colorati né descrizioni */}
            <div className="flex items-center gap-3">
                {DIR_BRANDS.map((b) => {
                    const logo = TRK_BRAND_LOGOS[b.id];
                    const scala = TRK_LOGO_SCALE[b.id] || 1;
                    const attivo = brand === b.id;
                    return (
                        <button key={b.id} onClick={() => setBrand(b.id)} title={b.label} aria-label={b.label}
                            className={cn("flex-1 min-w-0 h-[84px] flex items-center justify-center rounded-2xl border px-3 transition-all",
                                attivo
                                    ? "border-indigo-400/80 bg-indigo-500/20 ring-1 ring-indigo-400/40 shadow-lg shadow-indigo-500/25 brightness-110"
                                    : "border-white/15 bg-white/[0.05] opacity-70 grayscale-[60%] hover:opacity-90 hover:grayscale-[30%]")}>
                            {logo ? (
                                <img src={logo} alt={b.label} className="block object-contain max-w-full"
                                    style={{ maxHeight: 56, transform: scala !== 1 ? `scale(${scala})` : undefined }} />
                            ) : (
                                <span className="block text-base font-bold text-slate-200 px-1">{b.label}</span>
                            )}
                        </button>
                    );
                })}
                <div className="flex items-center gap-2 shrink-0">
                    {/* il registro sta QUI, in un angolo (Luca 28/08): una riga a
                        tutta larghezza per una cosa che si guarda una volta ogni
                        tanto era spazio buttato */}
                    <RegistroConsigli brand={brand} />
                    {/* la vista: il consiglio nasce sempre da «Adesso» */}
                    <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                        {[
                            { v: false, l: "⚡ Adesso", t: "I numeri di questo momento, comprese le attivazioni caricate oggi. È così che si decide dove inserire: altrimenti si manda over target un codice che nel frattempo ha già chiuso." },
                            { v: true, l: "🌙 Ieri sera", t: "Solo per guardare com'era a fine giornata di ieri. I consigli calcolati qui NON tengono conto di oggi." },
                        ].map((x) => (
                            <button key={String(x.v)} onClick={() => setVistaIeri(x.v)} title={x.t}
                                className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
                                    vistaIeri === x.v
                                        ? (x.v ? "bg-slate-500/60 text-white" : "bg-emerald-500/80 text-white shadow")
                                        : "text-slate-400 hover:text-white")}>
                                {x.l}
                            </button>
                        ))}
                    </div>
                    <select value={monthISO} onChange={(e) => setMonthISO(e.target.value)} className="glass-input text-sm !h-10 min-w-[150px]">
                        {mesi.map((m) => <option key={m.iso} value={m.iso}>{m.label}</option>)}
                    </select>
                    <button onClick={() => setGiro((g) => g + 1)} title="Ricarica l'avanzamento" className="p-2 rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"><RotateCcw className="w-4 h-4" /></button>
                </div>
            </div>

            {/* guardare indietro va bene, DECIDERE guardando indietro no: qui
                il consiglio ignora tutto quello che è già stato caricato oggi */}
            {vistaIeri && (
                <div className="an-in flex items-center gap-2 flex-wrap rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2">
                    <span className="text-[12px] font-bold text-amber-200">🌙 Stai guardando com&apos;era ieri sera</span>
                    <span className="text-[11px] text-amber-100/80">
                        Le attivazioni caricate oggi non sono contate: non usare questi consigli per decidere dove inserire, o mandi over target un codice che nel frattempo ha già chiuso.
                    </span>
                    <button onClick={() => setVistaIeri(false)}
                        className="ml-auto px-2.5 py-1 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-white text-[11px] font-bold whitespace-nowrap">
                        ⚡ Torna ad Adesso
                    </button>
                </div>
            )}

            {/* 🕊️ INSERIMENTO LIBERO (Luca 26/08 notte-5): il brand si può
                «spegnere» — es. Sky, dove la regia non serve: la Bussola dei
                ragazzi mostrerà «inserimento libero» invece dei consigli */}
            {dir && (() => {
                const libero = dir.politiche["__libero__"]?.modo === "libero";
                const nascosto = dir.politiche["__nascosto__"]?.modo === "nascosto";
                const lKey = "pol|__libero__";
                const nKey = "pol|__nascosto__";
                /* DUE INTERRUTTORI, UNO ACCANTO ALL'ALTRO (Luca 28/08): quello
                   spazio era largo e mezzo vuoto. A sinistra la regia (libero /
                   guidato), a destra la presenza nel widget dei ragazzi. */
                return (
                    <div className="grid md:grid-cols-2 gap-3">
                        <div className={cn("glass-card p-3.5 flex items-center gap-3", libero && "border-emerald-500/30")}>
                            <button type="button" onClick={() => salvaPolitica("__libero__", libero ? "guidato" : "libero")}
                                className={cn("relative w-11 h-6 rounded-full transition-colors shrink-0", libero ? "bg-emerald-500" : "bg-white/15")}
                                title={libero ? "Riattiva la regia degli inserimenti" : "Spegni la regia: inserimento libero"}>
                                <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all", libero ? "left-[22px]" : "left-0.5")} />
                            </button>
                            <div className="min-w-0">
                                <div className="text-sm font-bold text-slate-100">🕊️ Inserimento libero</div>
                                <div className="text-[11px] text-slate-500 leading-snug">{libero ? "la Bussola dice: «carica dove preferisci» — niente target né consigli" : "spento: vale la regia (target, politiche e consigli)"}</div>
                            </div>
                            {salvate[lKey] && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                            {erroriSalva[lKey] && <span className="text-[10px] font-bold text-rose-300 shrink-0">✗</span>}
                        </div>
                        <div className={cn("glass-card p-3.5 flex items-center gap-3", nascosto && "border-slate-400/30")}>
                            <button type="button" onClick={() => salvaPolitica("__nascosto__", nascosto ? "visibile" : "nascosto")}
                                className={cn("relative w-11 h-6 rounded-full transition-colors shrink-0", nascosto ? "bg-slate-400" : "bg-white/15")}
                                title={nascosto ? "Rimetti il brand nel widget dei ragazzi" : "Togli il brand dal widget: caricano dove vogliono, senza occupare spazio"}>
                                <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all", nascosto ? "left-[22px]" : "left-0.5")} />
                            </button>
                            <div className="min-w-0">
                                <div className="text-sm font-bold text-slate-100">🙈 Nascondi dal widget</div>
                                <div className="text-[11px] text-slate-500 leading-snug">{nascosto ? `${bMeta.label} non compare ai ragazzi: caricano dove vogliono` : "il brand compare nella Bussola dei ragazzi"}</div>
                            </div>
                            {salvate[nKey] && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                            {erroriSalva[nKey] && <span className="text-[10px] font-bold text-rose-300 shrink-0">✗</span>}
                        </div>
                    </div>
                );
            })()}

            {/* SFRIDO GENERALE per categoria (Luca 26/08 sera-2): si imposta QUI,
                una volta per pista, e vale per TUTTI i codici del brand — le
                pillole soglia di ogni codice escono già maggiorate e intere */}
            {dir && dir.tab && dir.codici.length > 0 && (
                <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2.5">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">⚙️ Sfrido per categoria</span>
                        <span className="text-[10px] text-slate-600">vale su tutti i codici {bMeta.label} · % intera, il target esce già maggiorato per eccesso</span>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                        {/* SOLO dove lo sfrido lavora davvero: le piste per-codice
                            con soglie cliccabili (mobile, fisso, CB). Niente
                            Protetti («almeno 1» non si sfrida) né piste di gruppo
                            (Luca 26/08 notte-3: «su Protetti non serve, e su
                            Telefoni&device a cosa ti riferivi?» — a nulla: era il
                            pannello che elencava tutto il tabellare) */}
                        {dir.pisteTab.filter((p) => dir.kpiCodice.includes(p.chiave) && p.chiave !== "protetti").map((p) => {
                            const sfrido = Math.round(Number(dir.sfridi[p.chiave]) || 0);
                            const sfrKey = `sfr|${p.chiave}`;
                            const bozzaSfr = bozzeSfr[p.chiave] ?? (sfrido ? String(sfrido) : "");
                            return (
                                <div key={p.chiave} className="flex items-center gap-1.5">
                                    <span className="text-xs text-slate-300 font-semibold">{EMOJI_PISTA(p.nome)} {p.nome}</span>
                                    <input value={bozzaSfr} onChange={(e) => setBozzeSfr((b) => ({ ...b, [p.chiave]: e.target.value }))}
                                        onBlur={() => {
                                            if (String(bozzaSfr).trim() === "") { setBozzeSfr((b) => ({ ...b, [p.chiave]: sfrido ? String(sfrido) : "" })); return; }
                                            const v = Math.max(0, Math.round(Number(String(bozzaSfr).replace(",", "."))));
                                            if (Number.isFinite(v) && v !== sfrido) salvaSfrido(p.chiave, v);
                                        }}
                                        placeholder="0" inputMode="numeric"
                                        className="glass-input !h-8 w-14 text-xs text-right" />
                                    <span className="text-[10px] text-slate-500">%</span>
                                    {salvate[sfrKey] && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                    {erroriSalva[sfrKey] && <span className="text-[10px] font-bold text-rose-300">✗</span>}
                                </div>
                            );
                        })}
                        {/* 💼 sfrido del PALETTO in PEZZI (non %): cuscinetto sopra
                            il 6 della lettera — l'obiettivo delle barre diventa 6+n */}
                        {brand === "windtre" && (() => {
                            const sp = Math.round(Number(dir.sfridi[SFRIDO_PALETTO]) || 0);
                            const spKey = `sfr|${SFRIDO_PALETTO}`;
                            const bozzaSp = bozzeSfr[SFRIDO_PALETTO] ?? (sp ? String(sp) : "");
                            return (
                                <div className="flex items-center gap-1.5" title="Cuscinetto in PEZZI sopra il paletto business della lettera (6): l'obiettivo mostrato diventa 6 + sfrido">
                                    <span className="text-xs text-slate-300 font-semibold">💼 Paletto Business</span>
                                    <input value={bozzaSp} onChange={(e) => setBozzeSfr((b) => ({ ...b, [SFRIDO_PALETTO]: e.target.value }))}
                                        onBlur={() => {
                                            if (String(bozzaSp).trim() === "") { setBozzeSfr((b) => ({ ...b, [SFRIDO_PALETTO]: sp ? String(sp) : "" })); return; }
                                            const v = Math.max(0, Math.round(Number(String(bozzaSp).replace(",", "."))));
                                            if (Number.isFinite(v) && v !== sp) salvaSfrido(SFRIDO_PALETTO, v);
                                        }}
                                        placeholder="0" inputMode="numeric"
                                        className="glass-input !h-8 w-14 text-xs text-right" />
                                    <span className="text-[10px] text-slate-500">pz</span>
                                    {salvate[spKey] && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                    {erroriSalva[spKey] && <span className="text-[10px] font-bold text-rose-300">✗</span>}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* 🧭 STRATEGIA DI RIEMPIMENTO per KPI (Luca 27/08-5): vale per il
                KPI intero, non per codice — 'vicino' CHIUDE prima chi è quasi
                a target, 'scoperto' livella dal basso */}
            {dir && dir.tab && dir.codici.length > 0 && (
                <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2.5">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">🧭 Strategia di riempimento</span>
                        <span className="text-[10px] text-slate-600">per KPI: la Bussola indirizza di conseguenza</span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-2.5">
                        {[...dir.pisteTab.filter((p) => dir.kpiCodice.includes(p.chiave) && p.chiave !== "protetti").map((p) => ({ chiave: p.chiave, nome: `${EMOJI_PISTA(p.nome)} ${p.nome}` })),
                          ...(brand === "windtre" ? [{ chiave: "__bizmob__", nome: "💼 Business mobile (paletto)" }] : [])].map((p) => {
                            const strat = dir.politiche[p.chiave]?.modo === "scoperto" ? "scoperto" : "vicino";
                            const sKey = `pol|${p.chiave}`;
                            return (
                                <div key={p.chiave} className="flex items-center gap-1.5">
                                    <span className="text-xs text-slate-300 font-semibold">{p.nome}</span>
                                    <button onClick={() => salvaPolitica(p.chiave, "vicino")}
                                        title="Si chiude prima chi è già quasi a target: la strategia SCAVALCA il negozio del venditore"
                                        className={cn("px-2 py-1 rounded-lg text-[10px] font-bold border transition-all",
                                            strat === "vicino" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-white/[0.04] text-slate-400 border-white/10 hover:bg-white/10")}>
                                        🎯 Chiudi il più vicino
                                    </button>
                                    <button onClick={() => salvaPolitica(p.chiave, "scoperto")}
                                        title="Si livella dal basso — ma chi chiede carica PRIMA sul suo negozio, finché ha capienza sul target"
                                        className={cn("px-2 py-1 rounded-lg text-[10px] font-bold border transition-all",
                                            strat === "scoperto" ? "bg-sky-500/15 text-sky-300 border-sky-500/40" : "bg-white/[0.04] text-slate-400 border-white/10 hover:bg-white/10")}>
                                        ⚖️ Riempi il più scoperto
                                    </button>
                                    {salvate[sKey] && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                    {erroriSalva[sKey] && <span className="text-[10px] font-bold text-rose-300">✗</span>}
                                    {/* ① PRIORITÀ ESPLICITE (Luca 27/08-6): clicca i codici
                                        nell'ordine — vincono su tutto finché non chiudono */}
                                    <span className="text-[9px] font-bold text-slate-600 uppercase ml-1">priorità</span>
                                    <div className="flex gap-1 flex-wrap">
                                        {dir.codici.map((k) => {
                                            const prio = ((dir.politiche[p.chiave]?.dati as { priorita?: string[] } | null)?.priorita) || [];
                                            const idx = prio.indexOf(k.cod_gara);
                                            const on = idx >= 0;
                                            return (
                                                <button key={k.cod_gara}
                                                    onClick={() => {
                                                        const nuova = on ? prio.filter((x) => x !== k.cod_gara) : [...prio, k.cod_gara];
                                                        salvaPolitica(p.chiave, dir.politiche[p.chiave]?.modo || "vicino", { ...((dir.politiche[p.chiave]?.dati as Record<string, unknown>) || {}), priorita: nuova });
                                                    }}
                                                    title={on ? `Togli ${k.negozio} dalle priorità` : `Dai priorità a ${k.negozio}`}
                                                    className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold border transition-all",
                                                        on ? "text-white border-transparent" : "bg-white/[0.03] text-slate-500 border-white/10 hover:bg-white/10")}
                                                    style={on ? { background: bMeta.color } : undefined}>
                                                    {on ? `${["①", "②", "③", "④", "⑤", "⑥", "⑦"][idx] || idx + 1} ` : ""}{nomeBreve(k.negozio)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 📊 IL TOTALE DI QUELLO CHE STO CHIEDENDO (Luca 26/08 notte, v2):
                TUTTE le piste per-codice, con la regola dei SUPERAMENTI — i
                punti oltre il target di un codice NON sono recuperabili (uno
                sbaglio da 30 punti su Magliana non tappa il buco di Collatina):
                il progresso VALIDO è Σ min(fatto, target) per codice */}
            {dir && dir.tab && dir.codici.length > 0 && (() => {
                const righe = dir.kpiCodice.map((pk) => {
                    const meta = dir.pisteTab.find((p) => p.chiave === pk);
                    if (!meta) return null;
                    const cbW3 = dir.brand === "windtre" && pk === "cb";
                    const fattoDi = (k: typeof dir.codici[number]) => cbW3 ? (k.cbPunti || 0) : (k.piste[pk]?.punti || 0);
                    const conTargetK = dir.codici.filter((k) => (k.targets[pk] || 0) > 0);
                    const richiesto = conTargetK.reduce((s, k) => s + (k.targets[pk] || 0), 0);
                    const fatto = Math.round(dir.codici.reduce((s, k) => s + fattoDi(k), 0) * 100) / 100;
                    const utile = Math.round(conTargetK.reduce((s, k) => s + Math.min(fattoDi(k), k.targets[pk] || 0), 0) * 100) / 100;
                    // ECCEDENZA (Luca 27/08): SEMPRE caricato − target SFRIDATO
                    // (k.targets è già col +sfrido), e contano anche i punti su
                    // codici SENZA target — «non ne avevano bisogno» per definizione
                    // …ma SOLO se sulla pista c'è una richiesta: senza target
                    // non esiste spreco (revisore 27/08: falso allarme rosso)
                    const sforati = richiesto > 0 ? dir.codici
                        .map((k) => { const t = k.targets[pk] || 0; return { nome: k.negozio, extra: Math.round((fattoDi(k) - t) * 100) / 100, senza: !(t > 0) }; })
                        .filter((x) => x.extra > 0) : [];
                    const sforo = Math.round(sforati.reduce((s, x) => s + x.extra, 0) * 100) / 100;
                    const proj = proiezioneDir(dir, fatto);
                    // proiezione UTILE: il ritmo di rete meno gli sforamenti già
                    // maturati (che non torneranno buoni) — approssimazione onesta
                    const projUtile = proj != null ? Math.max(utile, Math.round(proj - sforo)) : null;
                    const rif = projUtile ?? utile;
                    const ratio = richiesto > 0 ? rif / richiesto : 1;
                    const verdetto = richiesto <= 0 ? null : ratio >= 1
                        ? { txt: "✅ in linea: la proiezione utile copre la richiesta", cls: "text-emerald-300" }
                        : ratio >= 0.85
                            ? { txt: `🟡 quasi: la proiezione utile arriva a ${it(rif)} su ${it(richiesto)}`, cls: "text-amber-300" }
                            : { txt: `🔴 sopra la proiezione di ${it(Math.max(0, Math.ceil(richiesto - rif)))}: o si spinge o si ridimensiona`, cls: "text-rose-300" };
                    return { pk, meta, cbW3, richiesto, fatto, utile, sforati, sforo, proj: projUtile, verdetto };
                }).filter(Boolean) as { pk: string; meta: { chiave: string; nome: string; um: string }; cbW3: boolean; richiesto: number; fatto: number; utile: number; sforati: { nome: string; extra: number; senza: boolean }[]; sforo: number; proj: number | null; verdetto: { txt: string; cls: string } | null }[];
                if (!righe.length) return null;
                return (
                    <div className="glass-card p-4 space-y-3.5">
                        <button type="button" onClick={() => setRecapAperto((v) => !v)} className="w-full flex items-center gap-2 text-left">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">📊 Totale richiesto vs rete</span>
                            <span className="text-[10px] text-slate-600">Σ target sui codici (sfrido incluso) · l'eccedenza si misura sul target SFRIDATO e non recupera: la proiezione utile la deduce</span>
                            <span className={cn("ml-auto text-slate-500 transition-transform text-xs", recapAperto && "rotate-180")}>▾</span>
                        </button>
                        {recapAperto && righe.map((r) => (
                            <div key={r.pk} className="space-y-1">
                                <SogliaBar emoji={EMOJI_PISTA(r.meta.nome)}
                                    label={r.richiesto > 0 ? `${r.meta.nome} · richiesti ${it(r.richiesto)}` : `${r.meta.nome} · nessun target dato`}
                                    punti={r.richiesto > 0 ? r.utile : r.fatto}
                                    soglie={r.richiesto > 0 ? [{ tier: 1, soglia_da: r.richiesto }] : []}
                                    colore={bMeta.color} proiezione={r.proj}
                                    bruciati={r.richiesto > 0 ? r.sforo : 0}
                                    unit={r.meta.um === "pezzi" && !r.cbW3 ? "pz" : "pt"}
                                    nota={r.richiesto > 0 && r.fatto !== r.utile ? `rete ${it(r.fatto)} · validi verso i target ${it(r.utile)} · 🔥 ${it(r.sforo)} bruciati` : null} />
                                {r.sforati.length > 0 && (
                                    <div className="text-[11px] font-semibold text-rose-300">
                                        🔥 {it(r.sforo)} bruciati oltre il target sfridato — non recuperano: {r.sforati.map((x) => `${x.nome} (+${it(x.extra)}${x.senza ? " · senza target" : ""})`).join(" · ")}
                                    </div>
                                )}
                                {r.verdetto && <div className={cn("text-[11px] font-semibold", r.verdetto.cls)}>{r.verdetto.txt}</div>}
                            </div>
                        ))}
                    </div>
                );
            })()}

            {!dir ? (
                <div className="glass-card p-10 flex items-center justify-center gap-2 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /> Carico realtà, tabellare e produzione…</div>
            ) : !dir.tab ? (
                <div className="glass-card p-8 text-center text-sm text-slate-400">Nessun tabellare {bMeta.label} per questo mese: carica prima le gare dell&apos;operatore.</div>
            ) : !dir.codici.length ? (
                <div className="glass-card p-8 text-center text-sm text-slate-400">Nessun codice {bMeta.label} per questo mese{brand === "windtre" ? <> — carica prima il <b>Target PDV</b> della lettera (Gare → WindTre, vista azienda)</> : null}.</div>
            ) : (
                <div className="space-y-4">
                    {dir.nonAllocati > 0 && (
                        <div className="text-[11px] text-amber-400/80 px-1">⚠ {dir.nonAllocati} vendite valide del mese hanno un Cod.Ins. non riconducibile a una realtà: non compaiono qui sotto.</div>
                    )}
                    {/* W3 diviso nelle sue DUE anime (Luca 26/08): franchising e
                        multibrand non si mischiano — sezioni dichiarate */}
                    {(brand === "windtre"
                        ? [
                            { label: "🏪 Franchising", items: dir.codici.filter((x) => !x.cod_gara.startsWith("MB-")) },
                            { label: "🔀 Multibrand", items: dir.codici.filter((x) => x.cod_gara.startsWith("MB-")) },
                        ].filter((s) => s.items.length)
                        : [{ label: null as string | null, items: dir.codici }]
                    ).map((sez) => (
                    <div key={sez.label || "tutti"} className="space-y-3" data-zona-kpi>
                    {sez.label && (
                        <div className="flex items-center gap-2 px-1">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{sez.label}</span>
                            <span className="text-[10px] text-slate-600">{sez.items.length}</span>
                            <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                            {/* stessi tasti delle righe, ma SENZA pallino: qui non c'è
                                uno stato da mostrare — è un modo di guardare, non un
                                risultato. Cliccandone uno si aprono tutti i codici
                                della sezione con quel solo KPI. */}
                            <div className="hidden lg:flex items-center gap-1.5 shrink-0">
                                {(() => {
                                    // STESSO ORDINE DELLE RIGHE (Luca 28/08): il
                                    // Paletto sta dopo il Mobile e prima del Fisso,
                                    // qui come sulle pastiglie dei codici — in coda
                                    // era un terzo posto che non esiste da nessuna parte.
                                    const voci = dir.pisteTab
                                        .filter((p) => dir.kpiCodice.includes(p.chiave) && !PISTE_FUORI.has(p.chiave))
                                        .map((p) => ({ chiave: p.chiave, nome: p.nome }));
                                    if (dir.brand === "windtre") {
                                        const iM = voci.findIndex((x) => x.chiave === "mobile");
                                        voci.splice(iM < 0 ? voci.length : iM + 1, 0, { chiave: "__paletto__", nome: "Paletto" });
                                    }
                                    return voci;
                                })()
                                    .map((v) => {
                                        const acceso = kpiTutti?.sez === sez.label && kpiTutti?.chiave === v.chiave;
                                        return (
                                            <button key={v.chiave} type="button"
                                                onClick={() => {
                                                    setAperto(null); setPistaSola(null);
                                                    setKpiTutti(acceso ? null : { sez: sez.label as string, chiave: v.chiave });
                                                }}
                                                title={acceso
                                                    ? `Chiudi: torna all'elenco`
                                                    : `Apri TUTTI i codici mostrando solo ${v.nome}`}
                                                className={cn("px-2 py-1 rounded-md border text-[10px] font-semibold transition-colors",
                                                    acceso
                                                        ? "border-indigo-400/60 bg-indigo-500/20 text-indigo-100"
                                                        : "border-white/[0.08] bg-white/[0.03] text-slate-500 hover:text-slate-200 hover:bg-white/[0.07]")}>
                                                {EMOJI_PISTA(v.nome)} {v.nome}
                                            </button>
                                        );
                                    })}
                            </div>
                        </div>
                    )}
                    {/* 🌍 TARGET DI GRUPPO (W3): luce&gas, assicurazioni… — non
                        importa DOVE si caricano: qui la barra di RETE e la
                        POLITICA di caricamento per la Bussola dei ragazzi */}
                    {sez.label === "🏪 Franchising" && dir.pisteGruppo.length > 0 && (
                        <div className="glass-card p-4 space-y-4">
                            {/* header CLICCABILE: la card si chiude (Luca 26/08 notte-4) */}
                            <button type="button" onClick={() => setGruppoAperto((v) => !v)} className="w-full flex items-center gap-2 text-left">
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">🌍 Target di gruppo</span>
                                <span className="text-[10px] text-slate-600">contano a RETE: la politica decide dove la Bussola fa caricare</span>
                                <span className={cn("ml-auto text-slate-500 transition-transform text-xs", gruppoAperto && "rotate-180")}>▾</span>
                            </button>
                            {gruppoAperto && dir.pisteGruppo.map((pg) => {
                                const meta = dir.pisteTab.find((p) => p.chiave === pg);
                                if (!meta) return null;
                                const puntiRete = Math.round(dir.codici.reduce((s, k) => s + (k.piste[pg]?.punti || 0), 0) * 100) / 100;
                                const pezziRete = dir.codici.reduce((s, k) => s + (k.piste[pg]?.pezzi || 0), 0);
                                const scalaRete = (dir.tab?.soglie || []).filter((s) => s.pista === pg).sort((a, b) => a.tier - b.tier).map((s) => ({ tier: s.tier, soglia_da: Number(s.soglia_da) }));
                                const pol = dir.politiche[pg]?.modo || "proprio";
                                const polKey = `pol|${pg}`;
                                const projRete = proiezioneDir(dir, puntiRete);
                                return (
                                    <div key={pg} className="space-y-2">
                                        <SogliaBar emoji={EMOJI_PISTA(meta.nome)} label={`${meta.nome} · rete`}
                                            punti={puntiRete} pezzi={pezziRete} soglie={scalaRete}
                                            colore={bMeta.color} proiezione={projRete}
                                            unit={meta.um === "pezzi" ? "pz" : "pt"} nota={null} />
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">politica</span>
                                            <button onClick={() => salvaPolitica(pg, "proprio")}
                                                className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                                                    pol === "proprio" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/10")}>
                                                🏠 Ognuno sul suo
                                            </button>
                                            <button onClick={() => salvaPolitica(pg, "bilancia")}
                                                className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                                                    pol === "bilancia" ? "bg-sky-500/15 text-sky-300 border-sky-500/40" : "bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/10")}>
                                                ⚖️ Bilancia{pol === "bilancia" ? ` (${finestraBilancia(String((dir.politiche[pg]?.dati as { fino?: string } | null)?.fino || "")).label})` : ""}
                                            </button>
                                            {/* 📅 il calendario del bilancia (Luca notte-8): la scelta
                                                vale FINO a questa data, poi si ricalcola */}
                                            {pol === "bilancia" && (
                                                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                                                    vale fino al
                                                    <input type="date" min={dir.monthISO.slice(0, 8) + "01"}
                                                        value={String((dir.politiche[pg]?.dati as { fino?: string } | null)?.fino || "")}
                                                        onChange={(e) => salvaPolitica(pg, "bilancia", { ...((dir.politiche[pg]?.dati as Record<string, unknown>) || {}), fino: e.target.value })}
                                                        className="glass-input !h-8 text-xs" />
                                                </label>
                                            )}
                                            {salvate[polKey] && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                            {erroriSalva[polKey] && <span className="text-[10px] font-bold text-rose-300">✗</span>}
                                            <span className="text-[10px] text-slate-600">{pol === "proprio" ? "ogni negozio carica sul suo codice (i multibrand sull'associato)" : "la Bussola indirizza sul codice più scarico, stabile nella finestra"}</span>
                                            {/* ⭐ PRIORITÀ anche sul gruppo (Luca 27/08-7): se
                                                impostata, la Bussola manda TUTTI lì — vince
                                                su bilancia e associati finché non la togli */}
                                            <span className="text-[9px] font-bold text-slate-600 uppercase ml-1">priorità</span>
                                            <div className="flex gap-1 flex-wrap">
                                                {dir.codici.filter((x) => !x.multibrand && !x.catchAll).map((x) => {
                                                    const prioG = ((dir.politiche[pg]?.dati as { priorita?: string[] } | null)?.priorita) || [];
                                                    const idxG = prioG.indexOf(x.cod_gara);
                                                    const onG = idxG >= 0;
                                                    return (
                                                        <button key={x.cod_gara}
                                                            onClick={() => {
                                                                const nuova = onG ? prioG.filter((c) => c !== x.cod_gara) : [...prioG, x.cod_gara];
                                                                salvaPolitica(pg, dir.politiche[pg]?.modo || "proprio", { ...((dir.politiche[pg]?.dati as Record<string, unknown>) || {}), priorita: nuova });
                                                            }}
                                                            title={onG ? `Togli ${x.negozio} dalle priorità` : `Manda tutta la rete su ${x.negozio}`}
                                                            className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold border transition-all",
                                                                onG ? "text-white border-transparent" : "bg-white/[0.03] text-slate-500 border-white/10 hover:bg-white/10")}
                                                            style={onG ? { background: bMeta.color } : undefined}>
                                                            {onG ? `${["①", "②", "③", "④", "⑤", "⑥", "⑦"][idxG] || idxG + 1} ` : ""}{nomeBreve(x.negozio)}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {/* i MULTIBRAND non caricano MAI sul loro codice: qui
                                l'ASSOCIAZIONE al franchising per le categorie libere */}
                            {gruppoAperto && dir.codici.some((k) => k.multibrand) && (
                                <div className="pt-3 border-t border-white/5 space-y-2">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase">Codice associato dei multibrand <span className="normal-case font-normal">(per le categorie «ognuno sul suo»)</span></div>
                                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                                        {dir.codici.filter((k) => k.multibrand).map((mb) => {
                                            const franchising = dir.codici.filter((k) => !k.multibrand);
                                            const mappa = (dir.politiche["__associati__"]?.dati || {}) as Record<string, string>;
                                            const attuale = mappa[mb.cod_gara] || "";
                                            return (
                                                <div key={mb.cod_gara} className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-slate-300">{mb.negozio} →</span>
                                                    <div className="flex gap-1">
                                                        {franchising.map((f) => (
                                                            <button key={f.cod_gara}
                                                                onClick={() => salvaPolitica("__associati__", "mappa", { ...mappa, [mb.cod_gara]: attuale === f.cod_gara ? "" : f.cod_gara })}
                                                                title={f.negozio}
                                                                className={cn("px-2 py-1 rounded-lg text-[10px] font-bold border transition-all",
                                                                    attuale === f.cod_gara ? "text-white border-transparent" : "bg-white/[0.04] text-slate-400 border-white/10 hover:bg-white/10")}
                                                                style={attuale === f.cod_gara ? { background: bMeta.color } : undefined}>
                                                                {nomeBreve(f.negozio)}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {sez.items.map((k) => {
                        // aperta se l'ho aperta io, oppure se sto guardando un KPI
                        // solo su tutta la sezione
                        const kpiSez = kpiTutti?.sez === sez.label ? kpiTutti.chiave : null;
                        const on = aperto === k.cod_gara || !!kpiSez;
                        // SOLO i KPI su cui l'operatore pesa PER CODICE (W3:
                        // mobile, fisso, CB a punti, protetti — Luca 26/08):
                        // le categorie di gruppo vivono nella card sotto
                        const pisteMostrate = dir.pisteTab.filter((p) => dir.kpiCodice.includes(p.chiave) && !PISTE_FUORI.has(p.chiave));
                        // SEMAFORO (Luca 27/08): un pallino per pista — verde
                        // preso, giallo lo prende in proiezione, rosso nemmeno lì.
                        // TUTTE le piste (anche senza target, cella vuota): così
                        // le colonne restano INCOLONNATE tra le righe (Luca 27/08-2)
                        const projAttiva = !!(dir.gl && dir.gl.mostraProiezione && dir.gl.trascorsi > 0 && dir.gl.totali);
                        const semafori = pisteMostrate
                            .map((p) => {
                                const t = k.targets[p.chiave] || 0;
                                const cbSem = dir.brand === "windtre" && p.chiave === "cb";
                                const f = cbSem ? (k.cbPunti || 0) : (k.piste[p.chiave]?.punti || 0);
                                // con la proiezione ATTIVA e 0 fatti la proiezione
                                // è 0, non «assente»: il pallino è ROSSO (bug visto
                                // da Luca: il grigio spettava solo a inizio mese)
                                const pj = proiezioneDir(dir, f) ?? (projAttiva ? f : null);
                                // VIOLA (Luca 27/08-8, poi 15% «lo sfrido è già nelle
                                // soglie»): proiezione oltre il target di +15% =
                                // margine da SPOSTARE sui pallini rossi
                                const stato = t <= 0 ? "vuoto" : f >= t ? "verde" : pj == null ? "grigio" : pj >= t * 1.15 ? "viola" : pj >= t ? "giallo" : "rosso";
                                // la SIGLA della soglia impostata (S1..S4; CB 80%/100%):
                                // da fuori si vede subito che soglia sto provando a prendere
                                const tierScelto = k.tiersScelti?.[p.chiave] || null;
                                const sigla = t <= 0 ? "" : tierScelto == null ? "✎" : (cbSem ? (tierScelto === 1 ? "80%" : "100%") : `S${tierScelto}`);
                                return { chiave: p.chiave, nome: p.nome, t, f, stato, sigla };
                            });
                        /* ══ IL PALETTO, ACCANTO AL MOBILE (Luca 28/08) ═══════════
                           Le P.IVA mobile che tengono in piedi il premio della gara
                           mobile: sotto la soglia il premio viene decurtato del 30%.
                           Non è un target della direzione — è una CONDIZIONE, e va
                           letta dove si legge il mobile, non solo nel Master.

                           Regole del pallino, diverse dalle altre perché diverso è il
                           rischio: VERDE solo col cuscinetto pieno (soglia + sfrido),
                           AMBRA quando il paletto è salvo ma il cuscinetto no, ROSSO
                           sotto il paletto — lì ci sono i soldi che se ne vanno.
                           La proiezione non c'entra: o i pezzi ci sono, o non ci sono. */
                        // ⚠️ niente guardia PISTE_FUORI qui (mio errore del primo
                        // giro: quella lista contiene SEMPRE business_piva, quindi la
                        // pastiglia non compariva mai). Non serve: queste righe vivono
                        // solo in `DirezioneInserimentoAdmin`, cioè in Gare →
                        // Direzione e in Amministrazione. Il widget dei ragazzi è un
                        // altro componente (`BussolaWidget`) e dà solo il codice.
                        // il paletto è del FRANCHISING: sui multibrand non esiste,
                        // e la pastiglia apriva una scheda vuota (revisore 28/08)
                        if (dir.brand === "windtre" && !k.multibrand) {
                            const fatti = k.businessPezzi || 0;
                            const sfridoPal = Math.max(0, Math.round(Number(dir.sfridi["__paletto_business__"]) || 0));
                            // ⚠️ dalla LETTERA del mese (dir.palettoBusiness), non dalla
                            // costante: se WindTre cambia il paletto, cambia da solo
                            const paletto = Number(dir.palettoBusiness) || W3_PALETTO_BUSINESS;
                            const obiettivo = paletto + sfridoPal;
                            const stato = fatti >= obiettivo ? "verde" : fatti >= paletto ? "giallo" : "rosso";
                            const iMobile = semafori.findIndex((x) => x.chiave === "mobile");
                            semafori.splice(iMobile < 0 ? 0 : iMobile + 1, 0, {
                                chiave: "__paletto__", nome: "Paletto", t: obiettivo, f: fatti, stato,
                                sigla: `${fatti}/${obiettivo}`,
                            });
                        }
                        const semCompatti = semafori.filter((x) => x.stato !== "vuoto");
                        const stilePallino = (stato: string) => stato === "verde" ? { background: "#34d399", boxShadow: "0 0 7px #34d399" }
                            : stato === "viola" ? { background: "#a78bfa", boxShadow: "0 0 7px #a78bfa" }
                                : stato === "giallo" ? { background: "#fbbf24", boxShadow: "0 0 7px #fbbf2488" }
                                    : stato === "grigio" ? { background: "rgba(148,163,184,.45)" }
                                        : stato === "rosso" ? { background: "#f43f5e", boxShadow: "0 0 7px #f43f5e88" }
                                            : { background: "transparent", border: "1px solid rgba(148,163,184,.3)" };
                        const palettoW3 = Number(dir.palettoBusiness) || W3_PALETTO_BUSINESS;
                        const tipPallino = (x: { chiave?: string; nome: string; f: number; t: number; stato: string; sigla?: string }) =>
                            x.chiave === "__paletto__"
                                ? `Paletto Business — P.IVA mobile: ${x.f} su ${x.t}\n\n${x.stato === "verde"
                                    ? "✅ paletto preso e cuscinetto pieno: il premio della gara mobile è al sicuro"
                                    : x.stato === "giallo"
                                        ? `paletto salvo, ma ne ${x.t - x.f === 1 ? "manca 1" : `mancano ${x.t - x.f}`} al cuscinetto di sicurezza`
                                        : `⚠️ ne ${palettoW3 - x.f === 1 ? "manca 1" : `mancano ${palettoW3 - x.f}`} al paletto: sotto le ${palettoW3} il premio della gara mobile viene decurtato del 30%`}` :
                            x.stato === "vuoto" ? `${x.nome}: nessun target dato` :
                                `${x.nome}${x.sigla ? ` (${x.sigla === "✎" ? "target a mano" : "soglia " + x.sigla})` : ""}: ${it(x.f)} / ${it(x.t)} — ${x.stato === "verde" ? "🎯 target preso" : x.stato === "viola" ? "in proiezione lo SUPERA di oltre il 15%: margine da spostare sui rossi" : x.stato === "giallo" ? "in proiezione lo prende" : x.stato === "grigio" ? "proiezione non ancora attiva" : "nemmeno in proiezione: serve una spinta"}`;
                        return (
                            <div key={k.cod_gara} className="glass-card overflow-hidden transition-shadow"
                                style={{ borderLeft: `3px solid ${on ? bMeta.color : `color-mix(in srgb, ${bMeta.color} 35%, transparent)`}`, boxShadow: on ? `0 0 22px color-mix(in srgb, ${bMeta.color} 22%, transparent)` : undefined }}>
                                {/* ⚠️ era un <button>: dentro adesso ci sono i bottoni
                                    delle singole piste, e i bottoni non si annidano */}
                                <div role="button" tabIndex={0}
                                    onClick={() => apriTutto(k.cod_gara, on)}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); apriTutto(k.cod_gara, on); } }}
                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/[0.03] transition-colors cursor-pointer text-left">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: bMeta.color, boxShadow: `0 0 8px ${bMeta.color}` }} />
                                        <span className="text-sm font-black text-white truncate">{k.negozio}</span>
                                        <span className="text-[10px] font-mono text-slate-500">{k.cod_gara}</span>
                                        {k.cluster && <span className="text-[10px] text-slate-500 truncate hidden sm:inline">· {k.cluster}</span>}
                                    </div>
                                    {/* la FILA incolonnata (Luca 27/08-2): stessa cella,
                                        stessa colonna su ogni riga → colpo d'occhio verticale */}
                                    {semafori.length > 0 && (
                                        <div className="hidden lg:grid grid-flow-col gap-2 shrink-0" style={{ gridAutoColumns: "128px" }}>
                                            {semafori.map((sm) => {
                                                const solaQui = on && pistaSola === sm.chiave;
                                                return (
                                                    <button key={sm.chiave} type="button"
                                                        onClick={(e) => { e.stopPropagation(); apriSolaPista(k.cod_gara, sm.chiave); }}
                                                        title={`${tipPallino(sm)}\n\n▸ clicca: apri SOLO questa pista di questo codice`}
                                                        className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors",
                                                            solaQui
                                                                ? "bg-indigo-500/20 border-indigo-400/50"
                                                                : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] hover:border-white/20")}>
                                                        <span className={cn("text-[10px] font-semibold truncate flex-1 text-left", solaQui ? "text-indigo-100" : "text-slate-400")}>{EMOJI_PISTA(sm.nome)} {sm.nome}</span>
                                                        {sm.sigla && <span className="text-[10px] font-black text-slate-200 tabular-nums shrink-0">{sm.sigla}</span>}
                                                        <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", sm.stato === "rosso" && "animate-pulse")} style={stilePallino(sm.stato)} />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 shrink-0">
                                        {semCompatti.length > 0 && (
                                            /* SUL TELEFONO IL PALLINO DA SOLO NON DICE DI CHI È
                                               (Luca 31/08): sotto `lg` la fila incolonnata sparisce
                                               e restavano cinque pallini colorati senza etichetta —
                                               il colore si vede, ma non a quale pista appartiene.
                                               L'icona della pista costa 12px e riporta il nome. */
                                            <span className="lg:hidden flex items-center gap-1.5 bg-white/[0.04] border border-white/10 rounded-md px-1.5 py-1.5">
                                                {semCompatti.map((sm) => (
                                                    <span key={sm.chiave} title={tipPallino(sm)} className="flex items-center gap-0.5">
                                                        <span className="text-[11px] leading-none">{EMOJI_PISTA(sm.nome)}</span>
                                                        <span className={cn("w-2 h-2 rounded-full", sm.stato === "rosso" && "animate-pulse")} style={stilePallino(sm.stato)} />
                                                    </span>
                                                ))}
                                            </span>
                                        )}
                                        <span className={cn("text-slate-500 transition-transform text-xs", on && "rotate-180")}>▾</span>
                                    </div>
                                </div>
                                {on && (
                                    <div className="border-t border-white/5 divide-y divide-white/[0.04]">
                                        {/* niente riga «stai vedendo una pista sola» (Luca
                                            28/08): si vede da solo, e rubava lo spazio che
                                            serve al confronto. Si esce ri-cliccando il
                                            filtro, che resta acceso in cima. */}
                                        {(() => {
                                            const soloQuesta = pistaSola || kpiSez;
                                            // filtrando il PALETTO restano solo i suoi numeri,
                                            // che stanno nel blocco qui sotto
                                            if (soloQuesta === "__paletto__") return [];
                                            return soloQuesta ? pisteMostrate.filter((p) => p.chiave === soloQuesta) : pisteMostrate;
                                        })().map((p) => {
                                            const scala = k.soglie[p.chiave] || null;
                                            // la CB «va a punti» (gara parallela Partnership):
                                            // il numero che conta è cbPunti, i pezzi nel sub
                                            const cbW3 = dir.brand === "windtre" && p.chiave === "cb";
                                            const avz = cbW3
                                                ? { punti: k.cbPunti || 0, pezzi: k.piste[p.chiave]?.pezzi || 0 }
                                                : (k.piste[p.chiave] || { punti: 0, pezzi: 0 });
                                            const chiave = `${k.cod_gara}|${p.chiave}`;
                                            const target = k.targets[p.chiave] || 0;
                                            const sfrido = Math.round(Number(dir.sfridi[p.chiave]) || 0);
                                            const bozza = bozze[chiave] ?? (target ? String(target) : "");
                                            const proj = proiezioneDir(dir, avz.punti);
                                            const perc = target > 0 ? Math.min(100, Math.round((avz.punti / target) * 100)) : 0;
                                            return (
                                                <div key={p.chiave} className="px-4 py-3.5 space-y-2.5">
                                                    {/* LA BARRA come in Analisi → Rete: produzione piena,
                                                        proiezione a strisce, tacche alle soglie */}
                                                    <SogliaBar
                                                        emoji={EMOJI_PISTA(p.nome)} label={cbW3 ? `${p.nome} · punti` : p.nome}
                                                        punti={avz.punti} pezzi={avz.pezzi}
                                                        soglie={(scala || []).map((s, i) => ({ tier: i + 1, soglia_da: Number(s) }))}
                                                        colore={bMeta.color} proiezione={proj}
                                                        targetDir={target > 0 ? target : null}
                                                        unit={cbW3 ? "pt" : (p.um === "pezzi" ? "pz" : "pt")}
                                                        nota={[cbW3 ? `${avz.pezzi} eventi CB` : null, target > 0 ? `target direzione ${it(target)} · ${avz.punti < target ? `mancano ${it(Math.max(0, Math.ceil(target - avz.punti)))}` : "🎯 fatto"}` : null].filter(Boolean).join(" · ") || null}
                                                    />
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                                        {/* le SOGLIE: click = target (INTERO, sfrido incluso);
                                                            RICLICK sulla attiva = si toglie (bug Collatina S2).
                                                            Le soglie a 0 (S1 Sky) non fanno pillola: un target 0
                                                            sarebbe un finto no-op (revisore) */}
                                                        <div className="flex flex-wrap gap-1.5 flex-1 min-w-[220px]">
                                                            {scala && scala.length ? scala.map((s, i) => {
                                                                if (!(Number(s) > 0)) return null;
                                                                const valore = targetConSfrido(Number(s), sfrido);
                                                                const attiva = target === valore && target > 0;
                                                                return (
                                                                    <button key={i}
                                                                        onClick={() => {
                                                                            const nuovo = attiva ? 0 : valore;
                                                                            setBozze((b) => ({ ...b, [chiave]: nuovo ? String(nuovo) : "" }));
                                                                            salva(k.cod_gara, p.chiave, nuovo, nuovo ? i + 1 : null);
                                                                        }}
                                                                        title={attiva ? "Riclicca per togliere il target" : (sfrido ? `${etichettaSoglia(dir.brand, p.chiave, i)} = ${it(Number(s))} + ${sfrido}% sfrido → ${valore}` : `${etichettaSoglia(dir.brand, p.chiave, i)} = ${it(Number(s))}`)}
                                                                        className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                                                                            attiva ? "text-white border-transparent scale-105" : "bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/10 hover:scale-[1.03]")}
                                                                        style={attiva ? {
                                                                            background: `linear-gradient(160deg, ${bMeta.color}, color-mix(in srgb, ${bMeta.color} 62%, #000))`,
                                                                            boxShadow: `0 0 14px color-mix(in srgb, ${bMeta.color} 55%, transparent)`,
                                                                        } : undefined}>
                                                                        {etichettaSoglia(dir.brand, p.chiave, i)} · {valore}{attiva ? " ✕" : ""}
                                                                    </button>
                                                                );
                                                            }) : <span className="text-[10px] text-slate-600">nessuna scala per questa pista: target a mano qui a destra</span>}
                                                        </div>
                                                        {/* lo sfrido si imposta SOPRA, una volta per categoria:
                                                            qui solo il promemoria che le pillole sono maggiorate */}
                                                        {sfrido > 0 && (
                                                            <span className="shrink-0 text-[10px] font-bold text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-md px-2 py-0.5" title="Le soglie qui sopra sono già maggiorate dello sfrido di categoria">
                                                                +{sfrido}% sfrido
                                                            </span>
                                                        )}
                                                        {/* target a mano (sempre intero; vuoto = resta com'era) */}
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <input value={bozza} onChange={(e) => setBozze((b) => ({ ...b, [chiave]: e.target.value }))}
                                                                onBlur={() => {
                                                                    if (String(bozza).trim() === "") { setBozze((b) => ({ ...b, [chiave]: target ? String(target) : "" })); return; }
                                                                    const v = Math.max(0, Math.round(Number(String(bozza).replace(",", "."))));
                                                                    if (Number.isFinite(v) && v !== target) salva(k.cod_gara, p.chiave, v);
                                                                }}
                                                                placeholder="target" inputMode="numeric"
                                                                className="glass-input !h-8 w-20 text-xs text-right" />
                                                            {salvate[chiave] && <Check className="w-4 h-4 text-emerald-400" />}
                                                            {erroriSalva[chiave] && <span className="text-[10px] font-bold text-rose-300" title="Scrittura fallita: riprova">✗</span>}
                                                        </div>
                                                    </div>
                                                    {/* target che non combacia con nessuna pillola: scritto a
                                                        mano O figlio di uno sfrido cambiato dopo il click —
                                                        dirlo evita il mistero (rilievo revisore) */}
                                                    {target > 0 && !!(scala && scala.some((s) => Number(s) > 0)) && !scala.some((s) => Number(s) > 0 && targetConSfrido(Number(s), sfrido) === target) && (
                                                        <div className="text-[10px] text-amber-400/80">✍️ target impostato a mano (o con uno sfrido diverso da quello attuale): un click su una soglia lo riallinea.</div>
                                                    )}
                                                    {target > 0 && (
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-1.5 flex-1 rounded-full bg-white/[0.06] overflow-hidden">
                                                                <div className={cn("h-full rounded-full transition-all", perc >= 100 ? "bg-emerald-400" : "bg-sky-400/80")} style={{ width: `${perc}%` }} />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-slate-400 tabular-nums shrink-0">
                                                                {it(avz.punti)} / {it(target)}{avz.punti < target ? ` · mancano ${it(Math.max(0, Math.ceil(target - avz.punti)))}` : " · 🎯 fatto"}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {/* ⚔️ PALETTO BUSINESS (lettera W3): 6 pezzi business per
                                            codice o malus 30% sulla gara mobile del PV — in Gare non
                                            è ancora censito come gate, qui almeno si monitora */}
                                        {/* il Paletto si comporta come gli altri KPI (Luca
                                            28/08): quando ne sto filtrando un altro, sparisce */}
                                        {dir.brand === "windtre" && !k.multibrand
                                            && (!(pistaSola || kpiSez) || (pistaSola || kpiSez) === "__paletto__") && (() => {
                                            const fatti = k.businessPezzi || 0;
                                            const spPaletto = Math.round(Number(dir.sfridi[SFRIDO_PALETTO]) || 0);
                                            const obiettivo = dir.palettoBusiness + spPaletto;
                                            const salvo = fatti >= dir.palettoBusiness;      // niente malus
                                            const okP = fatti >= obiettivo;                   // cuscinetto pieno
                                            // la PROIEZIONE come tutte le altre piste (Luca 28/08:
                                            // «non ha nulla in più o in meno rispetto agli altri,
                                            // ha il suo target la sua produzione e la sua proiezione»)
                                            const projP = proiezioneDir(dir, fatti);
                                            return (
                                                <div className="px-4 py-3.5">
                                                    <SogliaBar
                                                        emoji="💼" label="Paletto Business — P.IVA mobile"
                                                        punti={fatti} pezzi={fatti} unit="pz"
                                                        soglie={spPaletto > 0
                                                            ? [{ tier: 1, soglia_da: dir.palettoBusiness }, { tier: 2, soglia_da: obiettivo }]
                                                            : [{ tier: 1, soglia_da: dir.palettoBusiness }]}
                                                        colore="#a78bfa" proiezione={projP} targetDir={obiettivo}
                                                        nota={okP
                                                            ? "✅ paletto preso e cuscinetto pieno: il premio della gara mobile è al sicuro"
                                                            : salvo
                                                                ? `paletto salvo — ${obiettivo - fatti === 1 ? "ne manca 1" : `ne mancano ${obiettivo - fatti}`} al cuscinetto${spPaletto ? ` (${dir.palettoBusiness} + ${spPaletto} di sfrido)` : ""}`
                                                                : `⚠ ne ${dir.palettoBusiness - fatti === 1 ? "manca 1" : `mancano ${dir.palettoBusiness - fatti}`} al paletto: sotto scatta il −30% sul mobile (vale anche col fisso sotto S1)`}
                                                    />
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    </div>
                    ))}
                    {/* 📖 LEGENDA (Luca 27/08-9): le regole non scritte e i colori,
                        così i dubbi si risolvono qui e non in chat */}
                    <div className="glass-card p-4 space-y-3">
                        <button type="button" onClick={() => setLegendaAperta((v) => !v)} className="w-full flex items-center gap-2 text-left">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">📖 Legenda — come decide la Bussola</span>
                            <span className={cn("ml-auto text-slate-500 transition-transform text-xs", legendaAperta && "rotate-180")}>▾</span>
                        </button>
                        {legendaAperta && (
                            <div className="grid gap-4 lg:grid-cols-2 text-[11px] leading-relaxed text-slate-300">
                                <div className="space-y-1.5">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase">L&apos;ordine delle decisioni</div>
                                    <div><b className="text-white">⓪ Prima esigenza — le S1 NUDE</b> (mobile, fisso e CB): finché un codice è sotto la sua <b>S1 senza sfrido</b> (per la CB l&apos;<b>80%</b> del target Partnership) si carica lì. Prima il negozio del venditore se è lui sotto, poi le priorità ①②③, poi la S1 più vicina a chiudersi.</div>
                                    <div><b className="text-white">⓪·1 Poi gli SFRIDI delle S1</b> (per la CB il <b>100%</b>): vengono prima di qualunque target più alto — la S2 di un altro codice non vale lo sfrido di questo.</div>
                                    <div><b className="text-white">① Le priorità ①②③</b> cliccate qui nel pannello: vincono su tutto finché il codice non chiude il suo target.</div>
                                    <div><b className="text-white">② La strategia</b>: 🎯 <i>Chiudi il più vicino</i> scavalca il negozio del venditore; ⚖️ <i>Riempi il più scoperto</i> manda prima sul negozio del venditore finché ha capienza, poi sul più scoperto.</div>
                                    <div><b className="text-white">③ A parità</b>: il negozio di chi sta caricando.</div>
                                    <div><b className="text-white">💼 Business mobile</b>: prima TUTTI i codici al paletto della lettera, poi il pezzo di sfrido, e a paletti salvi si riversa sui punti mobile (con le regole qui sopra).</div>
                                    <div><b className="text-white">🌍 Categorie di gruppo</b> (luce&amp;gas, assicurazioni…): ⭐ priorità se impostata → ⚖️ bilancia (il più scarico, stabile fino alla data) → 🏠 ognuno sul suo (i multibrand sull&apos;associato).</div>
                                    <div><b className="text-white">🔒 Riservatezza</b>: il widget dei ragazzi dà SOLO il codice — mai target, avanzamenti o mancanti.</div>
                                </div>
                                <div className="space-y-1.5">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase">I pallini dei codici</div>
                                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "#34d399", boxShadow: "0 0 7px #34d399" }} /> <b className="text-white">Verde</b> — target preso.</div>
                                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "#a78bfa", boxShadow: "0 0 7px #a78bfa" }} /> <b className="text-white">Viola</b> — in proiezione lo SUPERA di oltre il 15%: c&apos;è margine da spostare sui rossi.</div>
                                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "#fbbf24", boxShadow: "0 0 7px #fbbf2488" }} /> <b className="text-white">Giallo</b> — non ancora preso, ma in proiezione ci arriva.</div>
                                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse" style={{ background: "#f43f5e", boxShadow: "0 0 7px #f43f5e88" }} /> <b className="text-white">Rosso</b> (pulsante) — nemmeno in proiezione: serve una spinta.</div>
                                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "rgba(148,163,184,.45)" }} /> <b className="text-white">Grigio</b> — proiezione non ancora attiva (primi giorni del mese).</div>
                                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ border: "1px solid rgba(148,163,184,.3)" }} /> <b className="text-white">Vuoto</b> — nessun target dato su quella pista.</div>
                                    <div className="pt-1 text-slate-400">La sigla accanto al nome (S1…S4 · 80%/100% per la CB · ✎ = scritto a mano) è la <b className="text-white">soglia che hai impostato</b> come target del mese. Sulle barre: tacca <span className="text-emerald-300 font-bold">smeraldo</span> = il tuo target (sfrido incluso), coda <span className="text-rose-300 font-bold">rossa</span> = punti bruciati oltre il target, strisce = proiezione.</div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="text-[10px] text-slate-600 px-1">Punti dal motore gare (tabellare azienda) · produzione allocata per Cod.Ins. · proiezione a strisce sul ritmo dei giorni lavorativi · l&apos;ora di scatto vale anche qui.</div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET HOME — «cosa vendi?» → «caricala su …» (sola lettura, multi-brand)
// Ritorna solo il CONTENUTO (chi lo usa lo avvolge nella sua card/header).
// ─────────────────────────────────────────────────────────────────────────────
export function BussolaWidget({ negozio }: { negozio?: string | null }) {
    const { user } = useAuth();
    const [dirs, setDirs] = useState<Direzione[] | null>(null);
    const [liberi, setLiberi] = useState<Set<string>>(new Set());
    const [brandSel, setBrandSel] = useState<DirBrandId | "">("");
    const [pista, setPista] = useState<string>("");
    // ② TIPO CLIENTE prima della categoria (Luca 27/08-3): preselezione
    // obbligatoria Consumer/Business — così non si sbagliano
    const [tipoCli, setTipoCli] = useState<"consumer" | "business" | "">("");
    /* COSA C'È DENTRO L'ATTIVAZIONE (Luca 28/08): mobile, fisso e CB vanno a
       punti, e i punti cambiano con quello che si vende. Qui si spuntano le
       voci del tabellare; la somma decide anche DOVE conviene caricarla. */
    const [vociSel, setVociSel] = useState<string[]>([]);
    /* Quali cassetti sono aperti. Uno con dentro una scelta resta aperto
       comunque: chiuderlo nasconderebbe punti che stanno contando. */
    const [cassetti, setCassetti] = useState<string[]>([]);
    // 🔔 notifica cambi (Luca 26/08 notte-5): l'ultimo updated_at della
    // direzione confrontato con l'ultima visita (localStorage per dispositivo)
    const [novita, setNovita] = useState<string | null>(null);
    const firmaLog = useRef<string>("");

    useEffect(() => {
        let vivo = true;
        (async () => {
            const mese = mesePrimo();
            // i brand con ALMENO un target + quelli in INSERIMENTO LIBERO
            const [tgt, pol] = await Promise.all([
                supabase.from("direzione_targets").select("brand, updated_at").eq("month", mese).gt("target", 0),
                supabase.from("direzione_politiche").select("brand, pista, modo, updated_at").eq("month", mese),
            ]);
            const lib = new Set((pol.data || []).filter((r) => r.pista === "__libero__" && r.modo === "libero").map((r) => String(r.brand)));
            // brand NASCOSTI (Luca 28/08): fuori dal widget del tutto — i
            // ragazzi caricano dove vogliono, senza che occupi una tessera
            const nasc = new Set((pol.data || []).filter((r) => r.pista === "__nascosto__" && r.modo === "nascosto").map((r) => String(r.brand)));
            const brands = [...new Set((tgt.data || []).map((r) => String(r.brand)))].filter((b) => DIR_BRANDS.some((x) => x.id === b) && !lib.has(b) && !nasc.has(b)) as DirBrandId[];
            const out = await Promise.all(brands.map((b) => caricaDirezione(b, mese).catch(() => null)));
            if (!vivo) return;
            setLiberi(new Set([...lib].filter((b) => !nasc.has(b))));
            setDirs(out.filter(Boolean) as Direzione[]);
            // ultimo cambio della direzione (targets + politiche del mese)
            const ts = [...(tgt.data || []), ...(pol.data || [])].map((r) => String(r.updated_at || "")).filter(Boolean).sort().pop() || null;
            if (ts) {
                let visto = "";
                try { visto = localStorage.getItem("tf_direzione_visto") || ""; } catch { /* storage negato */ }
                if (ts > visto) setNovita(ts);
            }
        })();
        return () => { vivo = false; };
    }, []);
    const segnaVisto = () => {
        try { if (novita) localStorage.setItem("tf_direzione_visto", novita); } catch { /* storage negato */ }
        setNovita(null);
    };

    // doppia porta (come nel Calcolatore): le piste parallele non compaiono
    // MAI qui, qualunque cosa dica il pannello
    const conTarget = useMemo(() => (dirs || []).filter((d) =>
        d.codici.some((k) => Object.entries(k.targets).some(([p, v]) => v > 0 && !PISTE_FUORI.has(p)))), [dirs]);
    const brandsLiberi = useMemo(() => DIR_BRANDS.filter((b) => liberi.has(b.id)), [liberi]);
    const tuttiBrand = useMemo(() => [
        ...conTarget.map((d) => ({ id: d.brand as DirBrandId, libero: false })),
        ...brandsLiberi.map((b) => ({ id: b.id as DirBrandId, libero: true })),
    ], [conTarget, brandsLiberi]);
    useEffect(() => { if (tuttiBrand.length && !tuttiBrand.some((d) => d.id === brandSel)) setBrandSel(tuttiBrand[0].id); }, [tuttiBrand]); // eslint-disable-line
    const brandLibero = liberi.has(brandSel);
    const dir = conTarget.find((d) => d.brand === brandSel) || null;
    const pisteAttive = useMemo(() => {
        if (!dir) return [];
        const con = new Set<string>();
        dir.codici.forEach((k) => Object.entries(k.targets).forEach(([p, v]) => { if (v > 0) con.add(p); }));
        // le categorie di GRUPPO (luce&gas, assicurazioni…) compaiono sempre:
        // la risposta è la POLITICA, non serve un target
        return dir.pisteTab.filter((p) => (con.has(p.chiave) || dir.pisteGruppo.includes(p.chiave)) && !PISTE_FUORI.has(p.chiave));
    }, [dir]);
    // 💼 BUSINESS MOBILE W3 (Luca 27/08): variabile dedicata — la Bussola
    // SPARTISCE le attivazioni per portare TUTTI i codici oltre il paletto
    const BIZMOB = "__bizmob__";
    // BUSINESS FISSO (Luca 27/08-10): voce dedicata sotto «Business» così
    // nessuno chiama chiedendo dov'è — ma è SPECULARE al fisso consumer:
    // stessa pista, stessi consigli
    const BIZFISSO = "__bizfisso__";
    const èBusinessPista = (p: { chiave: string; nome: string }) => p.chiave === BIZMOB || /business|piva/i.test(p.chiave + " " + p.nome);
    const pisteBussola = useMemo(() => {
        const base = dir?.brand === "windtre"
            ? [...pisteAttive, { chiave: BIZMOB, nome: "Business mobile", um: "pezzi" },
                ...(pisteAttive.some((p) => p.chiave === "fisso") ? [{ chiave: BIZFISSO, nome: "Business fisso", um: "pt" }] : [])]
            : pisteAttive;
        if (tipoCli === "business") return base.filter(èBusinessPista);
        if (tipoCli === "consumer") return base.filter((p) => !èBusinessPista(p));
        return [];   // niente categoria finché non si sceglie il cliente
    }, [dir, pisteAttive, tipoCli]); // eslint-disable-line
    useEffect(() => { setTipoCli(""); setPista(""); }, [brandSel]);
    useEffect(() => { if (pisteBussola.length && !pisteBussola.some((p) => p.chiave === pista)) setPista(pisteBussola[0]?.chiave || ""); }, [pisteBussola]); // eslint-disable-line
    // risposta SECCA per le piste di gruppo (Luca: «per alcune categorie non
    // devono essere costretti a consultare la direzione ogni volta»)
    const [tipGruppo, setTipGruppo] = useState<{ testo: string; sub: string } | null>(null);
    const pistaDiGruppo = !!dir && dir.pisteGruppo.includes(pista);
    useEffect(() => {
        let vivo = true;
        setTipGruppo(null);
        if (!dir || !pistaDiGruppo) return;
        const normS = (s: unknown) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        const nu = normS(negozio);
        const modo = dir.politiche[pista]?.modo || "proprio";
        (async () => {
            // ⭐ PRIORITÀ esplicita della direzione (Luca 27/08): se impostata,
            // vince su bilancia, associato e «ognuno sul suo»
            const prioG = prioritaDi(dir, pista);
            const kPrio = prioG.map((cod) => dir.codici.find((x) => x.cod_gara === cod)).find(Boolean);
            if (kPrio) {
                if (vivo) setTipGruppo({ testo: `📍 Caricala su ${kPrio.negozio}`, sub: "⭐ priorità della direzione" });
                return;
            }
            if (modo === "bilancia") {
                const r = await codiceBilancia(dir, pista);
                if (vivo && r) setTipGruppo({ testo: `📍 Caricala su ${r.codice.negozio}`, sub: `⚖️ ${finestraBilancia(r.fino).label}` });
                return;
            }
            // «ognuno sul suo»: il multibrand carica sul codice ASSOCIATO
            const mioMb = nu ? dir.codici.find((k) => k.multibrand && k.token.some((t) => nu.startsWith(t) || t.startsWith(nu))) : null;
            if (mioMb) {
                const ass = codiceAssociato(dir, mioMb.cod_gara);
                // senza tante storie (Luca 27/08-4): solo il nome del codice
                if (vivo) setTipGruppo(ass
                    ? { testo: `📍 Caricala su ${ass.negozio}`, sub: "" }
                    : { testo: "🏠 Chiedi alla direzione il tuo codice", sub: "" });
                return;
            }
            if (vivo) setTipGruppo({ testo: "🏠 Caricala sul codice del tuo negozio", sub: "" });
        })();
        return () => { vivo = false; };
    }, [dir, pista, pistaDiGruppo, negozio]);

    const biz = useMemo(() => {
        if (pista !== BIZMOB || !dir) return null;

        const spPaletto = Math.round(Number(dir.sfridi["__paletto_business__"]) || 0);
        const obiettivo = dir.palettoBusiness + spPaletto;
        const franchising = dir.codici.filter((k) => !k.multibrand && !k.catchAll)
            .map((k) => ({ nome: k.negozio, fatti: k.businessPezzi || 0, mio: èMioCodice(k, negozio) }))
            .sort((a, b) => a.fatti - b.fatti);
        // DUE FASI (Luca 27/08-5): prima TUTTI al paletto (6),
        // POI il pezzo di sfrido su chi manca; dentro la fase
        // vale la strategia (default: si CHIUDE il più vicino)
        const strat = strategiaDi(dir, BIZMOB);
        const sottoPaletto = franchising.filter((f) => f.fatti < dir.palettoBusiness);
        const sottoObiettivo = franchising.filter((f) => f.fatti < obiettivo);
        const fase = sottoPaletto.length ? sottoPaletto : sottoObiettivo;
        const prioB = prioritaDi(dir, BIZMOB);
        const rankB = (nome: string) => {
            const k = dir.codici.find((x) => x.negozio === nome);
            const i = k ? prioB.indexOf(k.cod_gara) : -1;
            return i >= 0 ? i : Infinity;
        };
        // col «riempi il più scoperto» il negozio del richiedente vince
        // finché è in fase (= ha capienza); col «vicino» la strategia scavalca
        const ordinati = [...fase].sort((a, b) =>
            (rankB(a.nome) - rankB(b.nome))
            || (strat === "scoperto" && a.mio !== b.mio ? (a.mio ? -1 : 1) : 0)
            || (strat === "vicino" ? (b.fatti - a.fatti) : (a.fatti - b.fatti))
            || (Number(b.mio) - Number(a.mio)));
        const scelto = ordinati[0] || null;
        const faseLabel = sottoPaletto.length ? dir.palettoBusiness : obiettivo;
        // CASCATA (Luca 27/08-2): paletti tutti salvi → si passa
        // all'esigenza dei PUNTI MOBILE (i target della direzione)
        const mobConsigli = !scelto ? consigliaCodici(dir, "mobile", negozio, strategiaDi(dir, "mobile")) : [];
        const mobScelto = mobConsigli.find((k) => k.mancano > 0) || mobConsigli[0] || null;
        /* QUANTO CI STA ANCORA (Luca 28/08). «Se su Mazzini mancano ancora
           tre mobili alla S1 non franchigiata è inutile che me ne fai caricare
           uno di qua e uno di là: tanto Mazzini deve comunque arrivarci, è la
           priorità zero.» Quindi la coda si mostra SOLO quando il codice
           consigliato si chiude col primo pezzo: dal secondo in poi si
           cambierebbe davvero. Se ne assorbe ancora due o più, si carica
           tutto lì e non si dice niente. */
        const traguardo = sottoPaletto.length ? dir.palettoBusiness : obiettivo;
        const capienza = scelto ? Math.max(0, traguardo - scelto.fatti) : 0;
        return { scelto, ordinati, mobScelto, faseLabel, obiettivo, capienza };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pista, dir, negozio]);

    const voci = useMemo(() => (dir && pista && pista !== BIZMOB
        ? vociPunti(dir, pista === BIZFISSO ? "fisso" : pista, pista === BIZFISSO ? "business" : tipoCli)
        : []), [dir, pista, tipoCli]);
    // la BASE è data per scontata e non si sceglie (Luca 28/08): al conto si
    // aggiungono solo le opzioni spuntate
    // il tipo cliente cambia la partenza: il fisso business parte da 1,5
    const base = useMemo(() => (dir && pista && pista !== BIZMOB ? puntiBase(dir, pista === BIZFISSO ? "fisso" : pista, pista === BIZFISSO ? "business" : tipoCli) : 0), [dir, pista, tipoCli]);
    const puntiAttivazione = useMemo(() => {
        const extra = voci.filter((v) => vociSel.includes(v.id)).reduce((t, v) => t + v.punti, 0);
        return Math.round((base + extra) * 100) / 100;
    }, [base, voci, vociSel]);
    /* NIENTE CODICE SENZA SELEZIONE (Luca 28/08): «fino a quando non viene
       selezionato nulla non gli devi dare il codice, gli devi dire che devono
       effettuare le selezioni, altrimenti non c'è il punteggio». Vale dove le
       voci non hanno una base implicita — la Customer Base: lì un'attivazione
       senza voci vale zero, e un consiglio senza punti è una scommessa. */
    const serveScelta = voci.length > 0 && base <= 0 && puntiAttivazione <= 0;
    const pistaCons = pista === BIZFISSO ? "fisso" : pista;
    const lista = dir && !pistaDiGruppo && pista !== BIZMOB ? consigliaCodici(dir, pistaCons, negozio, strategiaDi(dir, pistaCons), puntiAttivazione).slice(0, 5) : [];
    const consigliato = lista.find((k) => k.mancano > 0) || lista[0];
    const bMeta = DIR_BRANDS.find((b) => b.id === brandSel);
    const altre = consigliato ? lista.filter((k) => k.cod_gara !== consigliato.cod_gara) : [];
    // c'è qualcun ALTRO ancora sotto la sua S1 nuda? allora il codice
    // consigliato tiene il posto solo fino alla sua S1, non fino allo sfrido
    const altriSottoS1 = altre.some((k) => k.sottoS1);

    // il consiglio che l'utente sta VEDENDO, qualunque sia il ramo
    const mostrato = pista === BIZMOB
        ? (biz?.scelto?.nome || biz?.mobScelto?.negozio || (biz ? "il codice del tuo negozio" : null))
        : pistaDiGruppo
            ? (tipGruppo?.testo ? tipGruppo.testo.replace(/^📍 Caricala su /, "").replace(/^🏠 /, "") : null)
            : (consigliato?.negozio || null);
    // la coda REGISTRATA è la stessa che l'utente vede: compare solo quando il
    // codice consigliato si chiude col primo pezzo (regola della capienza)
    const codaMostrata = pista === BIZMOB
        ? (biz?.scelto && biz.capienza <= 1 ? biz.ordinati.slice(1, 3).map((x) => x.nome) : [])
        : pistaDiGruppo ? []
            : (consigliato && chiudeIlCodice(capienzaDi(consigliato, altriSottoS1), puntiAttivazione))
                ? altre.filter((k) => k.mancano > 0).slice(0, 2).map((k) => k.negozio) : [];

    /* IL REGISTRO DEI CONSIGLI (Luca 28/08). Nel caso del paletto di Libia
       non si è potuto sapere se chi ha caricato avesse davvero guardato la
       Bussola: non esisteva nessuna traccia. Ora ogni consiglio MOSTRATO
       lascia una riga — chi, quando, che pista, che codice, e la coda. Una
       riga per consiglio diverso, non per render. */
    useEffect(() => {
        if (!brandSel || !pista || !mostrato) return;
        const firma = [user?.id || "", brandSel, pista, mostrato, codaMostrata.join(">")].join("|");
        if (firmaLog.current === firma) return;
        firmaLog.current = firma;
        const t = setTimeout(() => {
            supabase.from("direzione_consigli_log").insert({
                user_id: user?.id || null,
                utente: user?.name || null,
                negozio: negozio || null,
                brand: brandSel,
                pista,
                consigliato: mostrato,
                coda: codaMostrata.join(" → ") || null,
            }).then(() => null, () => null);   // il registro non deve mai disturbare chi lavora
        }, 1200);                              // solo se il consiglio resta a schermo
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [brandSel, pista, mostrato, codaMostrata.join(">"), user?.id]);

    if (!dirs) return <div className="p-5 flex items-center justify-center h-full min-h-[160px] text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /></div>;
    if (!tuttiBrand.length) {
        return (
            <div className="p-5 text-center flex flex-col items-center justify-center gap-2 h-full min-h-[160px]">
                <Compass className="w-8 h-8 text-slate-600" />
                <p className="text-xs text-slate-400">La direzione non ha ancora dato i target per codice di questo mese.</p>
                <Link href="/gare?brand=direzione" className="text-[11px] font-bold text-sky-300 hover:text-sky-200">Impostali in Gare → Direzione Inserimento</Link>
            </div>
        );
    }
    /* IL REGISTRO DEI CONSIGLI (Luca 28/08): «vorrei che tu facessi un
       passaggio indietro… se quell'utente è andato sul widget e cosa gli ha
       segnalato». Finora non si poteva sapere: nessuna traccia. Ora ogni
       consiglio mostrato lascia una riga — chi, quando, che pista, che
       codice, e la coda che gli è stata proposta. Una riga per consiglio
       DIVERSO, non per render. */
    /* il consiglio del BUSINESS MOBILE, calcolato fuori dal JSX: serve alla
       carta e al registro dei consigli (Luca 28/08) */
    return (
        <div className="h-full flex flex-col p-3.5 gap-3">
            {/* 🔔 la direzione ha CAMBIATO gli inserimenti */}
            {novita && (
                <div className="rounded-xl bg-amber-500/[0.12] border border-amber-500/40 px-3 py-2 flex items-center gap-2 animate-pulse">
                    <span className="flex-1 text-[11px] font-bold text-amber-200">🔔 La direzione ha aggiornato gli inserimenti: controlla dove caricare!</span>
                    <button onClick={segnaVisto} title="Ho visto le novità"
                        className="shrink-0 px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-[11px] font-bold text-amber-100 hover:bg-amber-500/30">✓ visto</button>
                </div>
            )}
            {/* ① OPERATORE + ② TIPO CLIENTE SULLA STESSA RIGA (Luca 28/08):
                «più di 3-4 brand non ne avremo mai, mettimi quelle due
                caselline piccole alla destra dopo tutti i brand» — così sotto
                resta tutto lo spazio in verticale per la categoria e per le
                differenziazioni che verranno (MNP/GA, tied/untied). */}
            <div className="space-y-1.5">
                <div className="flex gap-2 items-stretch">
                    {tuttiBrand.map((d) => {
                        const m = DIR_BRANDS.find((b) => b.id === d.id)!;
                        const logo = TRK_BRAND_LOGOS[m.id];
                        const scala = TRK_LOGO_SCALE[m.id] || 1;
                        const attivo = brandSel === d.id;
                        return (
                            <button key={d.id} onClick={() => { setBrandSel(d.id); setPista(""); setVociSel([]); setCassetti([]); }} title={m.label} aria-label={m.label}
                                // più spazio al brand (Luca 28/08): la tessera è il
                                // gesto principale, il logo deve leggersi da lontano
                                className={cn("flex-1 min-w-0 h-16 flex items-center justify-center rounded-xl border px-2 transition-all",
                                    attivo
                                        ? "border-indigo-400/80 bg-indigo-500/20 ring-1 ring-indigo-400/40 shadow-lg shadow-indigo-500/25 brightness-110"
                                        : "border-white/15 bg-white/[0.05] opacity-70 grayscale-[60%] hover:opacity-90 hover:grayscale-[30%]")}>
                                {logo ? (
                                    <img src={logo} alt={m.label} className="block object-contain max-w-full"
                                        style={{ maxHeight: 50, transform: scala !== 1 ? `scale(${Math.min(scala, 1.3)})` : undefined }} />
                                ) : <span className="text-xs font-bold text-slate-200">{m.label}</span>}
                            </button>
                        );
                    })}
                    {/* piccole e discrete: sono il secondo passo, non devono
                        pesare quanto il brand. E niente scale: ingrandendo
                        sbordavano una sull'altra (Luca 28/08). */}
                    {!brandLibero && (
                        <div className="flex gap-1.5 shrink-0 self-stretch">
                            {([["consumer", "👤", "Consumer"], ["business", "💼", "Business"]] as const).map(([v, icona, titolo]) => (
                                <button key={v} onClick={() => { setTipoCli(v); setPista(""); setVociSel([]); setCassetti([]); }} title={titolo} aria-label={titolo}
                                    className={cn("w-11 rounded-xl text-base border flex items-center justify-center transition-colors",
                                        tipoCli === v
                                            ? "border-white/40 bg-white/[0.16] text-white"
                                            : "bg-white/[0.04] border-white/10 opacity-70 hover:opacity-100 hover:bg-white/10")}>
                                    {icona}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {/* brand LIBERO: risposta immediata, niente step 2 */}
            {brandLibero ? (
                <div className="rounded-2xl px-4 py-6 text-center border border-emerald-500/30 flex-1 flex flex-col justify-center items-center min-h-0"
                    style={{ background: "linear-gradient(160deg, rgba(16,185,129,0.14), rgba(16,185,129,0.04))", boxShadow: "0 0 24px rgba(16,185,129,0.18)" }}>
                    <div className="text-2xl font-black text-emerald-300 drop-shadow">🕊️ Inserimento libero</div>
                    <div className="text-[11px] text-slate-400 mt-1">Per {bMeta?.label || "questo brand"} carica sul codice che preferisci: nessuna indicazione dalla direzione.</div>
                </div>
            ) : (<>
                {/* ③ COSA STAI VENDENDO — le variabili dell'operatore */}
                {tipoCli !== "" && <div className="space-y-1.5">
                    <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Cosa stai vendendo?</div>
                    <div className="flex flex-wrap gap-1.5">
                        {pisteBussola.map((p) => (
                            <button key={p.chiave} onClick={() => { setPista(p.chiave); setVociSel([]); setCassetti([]); }}
                                className={cn("px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                                    pista === p.chiave ? "text-white border-transparent scale-105" : "bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/10")}
                                style={pista === p.chiave ? { background: bMeta?.color || "#38bdf8", boxShadow: `0 0 12px color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 50%, transparent)` } : undefined}>
                                {EMOJI_PISTA(p.nome)} {p.nome}
                            </button>
                        ))}
                    </div>
                </div>}
                {/* ④ QUANTO VALE (Luca 28/08): mobile, fisso e CB vanno a punti,
                    e i punti cambiano con quello che c'è dentro l'attivazione.
                    Le voci sono quelle del tabellare delle Gare, coi punti veri.
                    Serve anche a decidere DOVE: un'attivazione non si spacchetta,
                    quindi conviene dove i punti entrano senza sprecarsi. */}
                {voci.length > 0 && pista !== BIZMOB && (
                    <div className="space-y-1.5">
                        <div className="flex items-baseline gap-2">
                            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
                                Cosa c&apos;è dentro?
                                {base > 0 && <span className="ml-1.5 normal-case tracking-normal font-normal text-slate-600">l&apos;attivazione base ({base}) è già contata</span>}
                            </span>
                            {puntiAttivazione > 0 && (
                                <span className="ml-auto text-[11px] font-black tabular-nums" style={{ color: bMeta?.color || "#38bdf8" }}>
                                    vale {puntiAttivazione.toLocaleString("it-IT", { maximumFractionDigits: 2 })} {puntiAttivazione === 1 ? "punto" : "punti"}
                                </span>
                            )}
                        </div>
                        {(() => {
                            const pastiglia = (v: { id: string; nome: string; punti: number }) => {
                                const acceso = vociSel.includes(v.id);
                                return (
                                    <button key={v.id} type="button"
                                        onClick={() => setVociSel((p2) => p2.includes(v.id) ? p2.filter((x) => x !== v.id) : [...p2, v.id])}
                                        title={`${v.nome} · ${v.punti} punti`}
                                        className={cn("px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors flex items-center gap-1.5 max-w-full",
                                            acceso ? "border-white/35 bg-white/[0.14] text-white" : "bg-white/[0.03] border-white/10 text-slate-400 hover:bg-white/[0.08]")}>
                                        <span className="truncate">{v.nome}</span>
                                        <span className={cn("tabular-nums shrink-0", acceso ? "text-white/80" : "text-slate-600")}>+{v.punti}</span>
                                    </button>
                                );
                            };
                            /* SULLA CUSTOMER BASE LE VOCI STANNO IN DUE CASSETTI
                               (Luca 28/08, rifiniti il 29/08): «una con telefono,
                               una con cambio piano — clicchi quella e mi dà le
                               opzioni sotto». Tutte in fila erano una sbrodolata
                               che nessuno leggeva.
                               ⚠️ I DUE CASSETTI SI SOMMANO: «posso fare anche un
                               cambio piano con un telefono incluso». Non sono
                               un'alternativa — si aprono e si spuntano tutti e
                               due, e ognuno mostra quanto sta portando. */
                            const gruppi = [...new Set(voci.map((v) => v.gruppo).filter(Boolean))] as string[];
                            if (!gruppi.length) return <div className="flex flex-wrap gap-1.5">{voci.map(pastiglia)}</div>;
                            return (
                                <div className="space-y-1.5">
                                    {gruppi.map((g) => {
                                        const dentro = voci.filter((v) => v.gruppo === g);
                                        const presi = dentro.filter((v) => vociSel.includes(v.id));
                                        const suoiPunti = Math.round(presi.reduce((t, v) => t + v.punti, 0) * 100) / 100;
                                        /* Il cassetto si chiude sempre, anche con una scelta
                                           dentro: forzarlo aperto sembra rotto. Quello che sta
                                           portando resta scritto nell'intestazione, quindi
                                           chiuderlo non nasconde punti a nessuno. */
                                        const aperto = cassetti.includes(g);
                                        return (
                                            <div key={g} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                                                <button type="button"
                                                    onClick={() => setCassetti((p2) => p2.includes(g) ? p2.filter((x) => x !== g) : [...p2, g])}
                                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/[0.04] transition-colors">
                                                    <span className="text-[11px] font-bold text-slate-300">{g}</span>
                                                    {presi.length > 0 && (
                                                        <span className="text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-md bg-white/10 text-white">
                                                            {presi.length} · +{suoiPunti.toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                                                        </span>
                                                    )}
                                                    <span className="ml-auto text-[10px] text-slate-600">
                                                        {aperto ? "" : `${dentro.length} opzioni`}
                                                    </span>
                                                    <span className={cn("text-slate-500 text-[10px] transition-transform", aperto && "rotate-180")}>▾</span>
                                                </button>
                                                {aperto && (
                                                    <div className="flex flex-wrap gap-1.5 px-2.5 pb-2 pt-0.5">{dentro.map(pastiglia)}</div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {gruppi.length > 1 && (
                                        <p className="text-[10px] text-slate-600 px-0.5">
                                            Si sommano: un cambio piano con dentro un telefono si spunta da tutti e due.
                                        </p>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}
                {/* ⑤ LA RISPOSTA — la carta col codice, grande */}
                {pista === BIZMOB && dir && biz && (() => {
                    const { scelto, ordinati, mobScelto } = biz;
                    return (<>
                        {/* UNA PER CODICE (Luca 28/08). Il 27/08 due P.IVA sono
                            entrate nello stesso ordine — stesso secondo — e sono
                            finite entrambe su Libia: il consiglio ne guarda una
                            sola, e la seconda ha sfondato nello sfrido mentre un
                            altro codice era a zero. La coda sta STACCATA dalla
                            card, e dà solo i NOMI: niente target né avanzamenti. */}
                        {scelto ? (
                            <CartaCodice colore={bMeta?.color || "#38bdf8"} nome={scelto.nome} />
                        ) : mobScelto ? (
                            <CartaCodice colore={bMeta?.color || "#38bdf8"} nome={mobScelto.negozio} mio={mobScelto.mio} />
                        ) : (
                            <div className="rounded-2xl px-4 py-5 border border-emerald-500/30 text-center flex-1 flex flex-col justify-center items-center min-h-0"
                                style={{ background: "linear-gradient(160deg, rgba(16,185,129,0.14), rgba(16,185,129,0.04))" }}>
                                <div className="text-lg font-black text-emerald-300">🏠 Caricala sul codice del tuo negozio</div>
                            </div>
                        )}
                        {scelto && chiudeIlCodice(biz.capienza, 1) && ordinati.length > 1 && <CodaCodici prossimi={ordinati.slice(1, 3).map((x) => x.nome)} />}
                    </>);
                })()}
                {!serveScelta && pista !== BIZMOB && pistaDiGruppo && tipGruppo && (
                    <div className="rounded-2xl px-4 py-5 border text-center flex-1 flex flex-col justify-center items-center min-h-0"
                        style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 16%, transparent), color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 5%, transparent))`, borderColor: `color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 35%, transparent)`, boxShadow: `0 0 22px color-mix(in srgb, ${bMeta?.color || "#38bdf8"} 22%, transparent)` }}>
                        <div className="text-xl font-black text-white leading-snug">{tipGruppo.testo}</div>
                        {tipGruppo.sub ? <div className="text-[10px] text-slate-400 mt-1">{tipGruppo.sub}</div> : null}
                    </div>
                )}
                {/* niente coda sulle piste di GRUPPO (Luca 28/08): con «ognuno
                    sul suo» il codice è il proprio e non cambia mai; con la
                    bilancia la scelta resta bloccata fino alla data decisa
                    dalla direzione — in entrambi i casi la seconda va dove è
                    andata la prima, e una coda direbbe il falso. */}
                {serveScelta && (
                    <div className="rounded-2xl px-4 py-5 border border-white/10 bg-white/[0.03] flex-1 flex flex-col justify-center items-center text-center min-h-0">
                        <div className="text-2xl leading-none mb-1.5">☝️</div>
                        <div className="text-sm font-bold text-slate-200">Scegli cosa stai caricando</div>
                        <div className="text-[11px] text-slate-500 mt-1">Senza le voci qui sopra non c&apos;è un punteggio, e senza punteggio non posso dirti dove metterla.</div>
                    </div>
                )}
                {!serveScelta && pista !== BIZMOB && !pistaDiGruppo && consigliato && (
                    <CartaCodice colore={bMeta?.color || "#38bdf8"} nome={consigliato.negozio} mio={consigliato.mio} />
                )}
                {/* Su TUTTE le piste a target per codice — mobile, fisso, CB.
                    Prima l'avevo ristretta al fisso perché sulla Customer Base
                    compariva sempre; ma il difetto era un altro, ed è la
                    capienza ad averlo risolto: dove un codice assorbe ancora
                    decine di pezzi l'avviso non esce da solo, e dove invece si
                    chiude col prossimo serve eccome (oggi il mobile di Mazzini
                    è a mezzo punto dalla S1). */}
                {!serveScelta && pista !== BIZMOB && !pistaDiGruppo && consigliato
                    && chiudeIlCodice(capienzaDi(consigliato, altriSottoS1), puntiAttivazione) && (
                    <CodaCodici prossimi={altre.filter((k) => k.mancano > 0).slice(0, 2).map((k) => k.negozio)} />
                )}

            </>)}
            <div className="text-[10px] text-slate-600">Indicazione della direzione · aggiornata all&apos;apertura.</div>
        </div>
    );
}

/* ═══ 👀 CHI HA GUARDATO LA BUSSOLA ════════════════════════════════════
   Il registro dei consigli mostrati ai ragazzi. Serve a rispondere alla
   domanda che il 28/08 è rimasta senza risposta: «quell'utente è andato
   sul widget? e cosa gli ha segnalato?». */
function RegistroConsigli({ brand }: { brand: DirBrandId }) {
    const [aperto, setAperto] = useState(false);
    const [righe, setRighe] = useState<{ id: string; visto_il: string; utente: string | null; negozio: string | null; pista: string | null; consigliato: string | null; coda: string | null }[] | null>(null);
    useEffect(() => {
        if (!aperto) return;
        let vivo = true;
        supabase.from("direzione_consigli_log")
            .select("id, visto_il, utente, negozio, pista, consigliato, coda")
            .eq("brand", brand).order("visto_il", { ascending: false }).limit(120)
            .then(({ data }) => { if (vivo) setRighe((data || []) as never[]); });
        return () => { vivo = false; };
    }, [aperto, brand]);
    const quando = (iso: string) => {
        const d = new Date(iso);
        return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };
    return (<>
        <button type="button" onClick={() => setAperto(true)}
            title="Chi ha aperto la Bussola e cosa gli è stato consigliato"
            className="p-2 rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 shrink-0 text-sm leading-none">👀</button>
        {aperto && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setAperto(false)}>
                <div className="glass-card p-5 w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/10">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-300">👀 Chi ha guardato la Bussola</span>
                        <span className="text-[10px] text-slate-500">ultimi consigli mostrati · {DIR_BRANDS.find((b) => b.id === brand)?.label}</span>
                        <button onClick={() => setAperto(false)} className="ml-auto text-slate-500 hover:text-slate-200 text-lg leading-none">×</button>
                    </div>
                    {righe === null ? <div className="text-[11px] text-slate-500 py-4 text-center">carico…</div>
                        : !righe.length ? <div className="text-[11px] text-slate-500 py-4 text-center">Ancora nessuna apertura registrata per questo brand.</div>
                            : (
                                <div className="overflow-y-auto custom-scrollbar -mx-1 px-1">
                                    <table className="w-full text-[11px]">
                                        <thead className="text-[10px] uppercase tracking-wider text-slate-500 sticky top-0 bg-[#0d1117]">
                                            <tr className="border-b border-white/10">
                                                <th className="text-left font-bold py-1.5">quando</th>
                                                <th className="text-left font-bold">chi</th>
                                                <th className="text-left font-bold">pista</th>
                                                <th className="text-left font-bold">gli ha detto</th>
                                                <th className="text-left font-bold">poi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {righe.map((r) => (
                                                <tr key={r.id} className="border-b border-white/[0.04]">
                                                    <td className="py-1.5 text-slate-500 tabular-nums whitespace-nowrap">{quando(r.visto_il)}</td>
                                                    <td className="text-slate-200 font-semibold truncate max-w-[190px]" title={`${r.utente || "—"}${r.negozio ? " · " + r.negozio : ""}`}>{r.utente || "—"}</td>
                                                    <td className="text-slate-400">{r.pista || "—"}</td>
                                                    <td className="text-white font-bold">{r.consigliato || "—"}</td>
                                                    <td className="text-slate-500 truncate max-w-[180px]">{r.coda || ""}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                </div>
            </div>
        )}
    </>);
}
