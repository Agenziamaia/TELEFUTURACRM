"use client";

/* ═══ CREARE UN ARTICOLO — UNA SCHERMATA SOLA ════════════════════════════════
 *
 * Luca 03/09: «in creazione articoli qui non stiamo chiedendo il doppio codice…
 * devo poter mettere anche io due codici, il "codice" e la "descrizione" fra i
 * due devono essere quelli obbligatori, mentre il secondo codice è facoltativo…
 * lasciamo barcode al posto del codice EAN, ma mettimelo all'inizio…
 * Comunque questa schermata fa schifo, sistemala, e poi fai sì che sia la
 * stessa anche nella sezione giacenze».
 *
 * Erano due schermate con due regole diverse: quella degli Articoli chiedeva
 * descrizione e prezzo ma non il reparto, teneva il codice a barre in fondo
 * come un ripensamento e non controllava che non fosse già di un altro; quella
 * del carico chiedeva tutto ma non la marca. Adesso è QUESTA, in tutt'e due i
 * posti, e passa dalla stessa porta (`mag_crea_articolo`).
 *
 * L'ORDINE DEI CAMPI RACCONTA COME SI FA. Prima il codice a barre, perché è il
 * gesto: si spara la scatola col lettore e il resto si compila guardando la
 * confezione. È FACOLTATIVO — 3.826 articoli su 17.083 non ce l'hanno — e si
 * vede dall'etichetta, senza dover premere per scoprirlo.
 * Obbligatori sono in tre, e ognuno per una ragione che si può dire in una
 * riga: il CODICE perché è la chiave, la DESCRIZIONE perché è quello che si
 * legge in cassa, il PREZZO e il REPARTO perché senza l'articolo dallo
 * scontrino non esce.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Barcode, Check, Loader2 } from "lucide-react";

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export type ArticoloCreato = {
    codice: string; barcode: string | null; descrizione: string;
    marca: string | null; reparto: number; ha_imei: boolean;
    prezzo: number | null; costo_ultimo: number | null;
};

type Reparto = { reparto: number; descrizione: string; aliquota: string | null; natura: string | null };

const num = (v: string) => { const n = Number(String(v || "").replace(",", ".")); return v.trim() && Number.isFinite(n) ? n : null; };

export default function NuovoArticolo({ descrizioneIniziale = "", chiediImei = false, origine, dopo, annulla }: {
    /** quello che l'operatore stava cercando quando non l'ha trovato */
    descrizioneIniziale?: string;
    /** nel carico serve sapere se ogni pezzo ha il suo numero; negli Articoli no */
    chiediImei?: boolean;
    /** da dove si sta creando: resta scritto in anagrafica accanto a chi l'ha fatto */
    origine: string;
    dopo: (a: ArticoloCreato) => void;
    annulla: () => void;
}) {
    const [barcode, setBarcode] = useState("");
    const [codice, setCodice] = useState("");
    const [descrizione, setDescrizione] = useState(descrizioneIniziale);
    const [prezzo, setPrezzo] = useState("");
    const [costo, setCosto] = useState("");
    const [marca, setMarca] = useState("");
    const [reparto, setReparto] = useState("");
    const [haImei, setHaImei] = useState(false);
    const [busy, setBusy] = useState(false);
    const [errore, setErrore] = useState("");

    const [reparti, setReparti] = useState<Reparto[]>([]);
    useEffect(() => {
        supabase.from("pos_reparti").select("reparto,descrizione,aliquota,natura").eq("attivo", true).order("reparto")
            /* il 7 è l'usato, e l'usato non sta a magazzino: vive in Gestione Usati */
            .then(({ data }) => setReparti(((data ?? []) as Reparto[]).filter(r => r.reparto !== 7)));
    }, []);

    /* COSA MANCA, DETTO PRIMA e non dopo aver premuto: il pulsante spento
       senza spiegazione è la cosa che fa premere tre volte e poi chiamare. */
    const manca: string[] = [];
    if (!codice.trim()) manca.push("il codice");
    if (!descrizione.trim()) manca.push("la descrizione");
    if (num(prezzo) == null) manca.push("il prezzo di vendita");
    if (!reparto) manca.push("il reparto IVA");

    const crea = async () => {
        if (manca.length || busy) return;
        setBusy(true); setErrore("");
        const { data, error } = await supabase.rpc("mag_crea_articolo", {
            p_codice: codice.trim(),
            p_descrizione: descrizione.trim(),
            p_reparto: Number(reparto),
            p_ha_imei: haImei,
            p_costo: num(costo),
            p_prezzo: num(prezzo),
            p_barcode: barcode.trim() || null,
            p_marca: marca.trim() || null,
            p_origine: origine,
        });
        setBusy(false);
        if (error) { setErrore(error.message); return; }
        dopo(data as ArticoloCreato);
    };

    return (
        <div className="rvNuovoArt">
            <div className="rvNuovoArt-t">
                <b>Nuovo articolo</b>
                <span>Quello che non c&apos;è nell&apos;anagrafica del gestionale si aggiunge qui.
                    Il <b>codice</b> è la chiave e non si ripete; il <b>prezzo</b> e il <b>reparto</b> servono
                    perché in cassa l&apos;articolo esca sullo scontrino.</span>
            </div>

            {/* PRIMA IL CODICE A BARRE: è il gesto vero — si spara la scatola e
                poi si compila il resto guardandola. */}
            <div className="rvNuovoArt-g">
                <label className="rvNuovoArt-c rvNuovoArt-c-bar">
                    <span className="rvLab"><Barcode size={12} className="inline-block align-[-1px] mr-1" />Codice a barre <span className="rvLabX">facoltativo</span></span>
                    <input className="rvIn font-mono" value={barcode} autoFocus
                        onChange={e => setBarcode(e.target.value.replace(/\s/g, ""))}
                        placeholder="sparalo col lettore" />
                </label>
                <label className="rvNuovoArt-c">
                    <span className="rvLab">Codice <i className="rvNuovoArt-ob">obbligatorio</i></span>
                    <input className="rvIn font-mono" value={codice} onChange={e => setCodice(e.target.value)} placeholder="es. 0THO60SMOU7004" />
                </label>
                <label className="rvNuovoArt-c rvNuovoArt-c-lg">
                    <span className="rvLab">Descrizione <i className="rvNuovoArt-ob">obbligatoria</i></span>
                    <input className="rvIn" value={descrizione} onChange={e => setDescrizione(e.target.value)} placeholder="come lo legge il cliente sullo scontrino" />
                </label>

                <label className="rvNuovoArt-c rvNuovoArt-c-sm">
                    <span className="rvLab">Prezzo di vendita € <i className="rvNuovoArt-ob">obbligatorio</i></span>
                    <input className="rvIn" inputMode="decimal" value={prezzo} onChange={e => setPrezzo(e.target.value)} placeholder="0,00" />
                </label>
                <label className="rvNuovoArt-c rvNuovoArt-c-sm">
                    <span className="rvLab">Costo d&apos;acquisto €</span>
                    <input className="rvIn" inputMode="decimal" value={costo} onChange={e => setCosto(e.target.value)} placeholder="0,00" />
                </label>
                <label className="rvNuovoArt-c">
                    <span className="rvLab">Reparto IVA <i className="rvNuovoArt-ob">obbligatorio</i></span>
                    <select className="rvIn" value={reparto} onChange={e => setReparto(e.target.value)}>
                        <option value="">— scegli —</option>
                        {reparti.map(r => (
                            <option key={r.reparto} value={r.reparto}>
                                {r.reparto} · {r.descrizione}{r.aliquota != null ? ` (${r.aliquota}%)` : r.natura ? ` (${r.natura})` : ""}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="rvNuovoArt-c rvNuovoArt-c-sm">
                    <span className="rvLab">Marca</span>
                    <input className="rvIn" value={marca} onChange={e => setMarca(e.target.value)} placeholder="es. HONOR" />
                </label>
            </div>

            {chiediImei && (
                <div className="rvNuovoArt-imei">
                    <span className="rvLab">Ogni pezzo ha il suo numero (IMEI, ICCID…)?</span>
                    <div className="rvPillRow">
                        <button type="button" onClick={() => setHaImei(false)} className={cn("rvPill rvPill-sm", !haImei && "rvPill-on")}>No, si conta a quantità</button>
                        <button type="button" onClick={() => setHaImei(true)} className={cn("rvPill rvPill-sm", haImei && "rvPill-on")}>Sì, uno per uno</button>
                    </div>
                </div>
            )}

            {errore && <div className="rvNota rvNota-ko mt-2"><div className="rvNota-s">{errore}</div></div>}

            <div className="rvNuovoArt-p">
                {manca.length > 0 && <span className="rvTab-min">Manca {manca.join(", ")}.</span>}
                <span className="rvSpazio" />
                <button type="button" onClick={annulla} className="rvPill rvPill-sm">Annulla</button>
                <button type="button" onClick={crea} disabled={busy || manca.length > 0} className="rvAzione rvAzione-sm">
                    {busy ? <><Loader2 size={14} className="inline-block align-[-2px] mr-1.5 animate-spin" />creo…</>
                        : <><Check size={14} className="inline-block align-[-2px] mr-1.5" />Crea l&apos;articolo</>}
                </button>
            </div>
        </div>
    );
}
