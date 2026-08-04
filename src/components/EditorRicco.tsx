"use client";

/* EDITOR RICCO di piattaforma (Luca 03/08: "un editor vero e proprio, fatto
   meglio di Word") — WYSIWYG senza librerie: contentEditable + execCommand,
   tema scuro del CRM. Nato per le Comunicazioni ma pensato RIUSABILE: gli
   automatismi futuri (email/WhatsApp ai clienti, chat e comunicazioni ai
   collaboratori) monteranno QUESTO componente.

   Offre: undo/redo · font (default/elegante/tecnico) · 4 taglie · B I U S ·
   colore testo · evidenziatore · elenchi puntati e numerati · allineamento ·
   pulisci formato · TUTTE le emoji Unicode (~1.900 base, dataset generato da
   scripts/genera-emoji.mjs) con ricerca per nome/keyword in italiano e inglese.

   Il valore viaggia in HTML (onChange) + testo puro (onChangeTesto, per
   validazioni e compatibilità). `sanificaHtml` è il guardiano: whitelist di
   tag/attributi, via script e handler — da usare SEMPRE anche al render. */

import { useEffect, useMemo, useRef, useState } from "react";

// ── SANIFICATORE (whitelist): l'HTML si mostra solo ripulito ────────────────
const TAG_OK = new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "SPAN", "FONT", "DIV", "P", "BR", "UL", "OL", "LI", "A", "H1", "H2", "H3", "BLOCKQUOTE"]);
const ATTR_OK: Record<string, Set<string>> = {
    A: new Set(["href", "target", "rel"]),
    FONT: new Set(["size", "color", "face"]),
    SPAN: new Set(["style"]),
    DIV: new Set(["style"]),
    P: new Set(["style"]),
    LI: new Set(["style"]),
};
const STILI_OK = ["font-size", "font-family", "color", "background-color", "text-align", "font-weight", "font-style", "text-decoration", "text-decoration-line"];

export function sanificaHtml(html: string): string {
    if (typeof window === "undefined" || !html) return "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    const pulisci = (nodo: Element) => {
        [...nodo.children].forEach((el) => {
            if (!TAG_OK.has(el.tagName)) {
                // tag fuori lista: si tiene il contenuto, si butta l'involucro
                const genitore = el.parentElement;
                while (el.firstChild) genitore?.insertBefore(el.firstChild, el);
                el.remove();
                return;
            }
            [...el.attributes].forEach((a) => {
                const ok = ATTR_OK[el.tagName]?.has(a.name.toLowerCase());
                if (!ok || a.name.toLowerCase().startsWith("on")) { el.removeAttribute(a.name); return; }
                if (a.name.toLowerCase() === "style") {
                    const tenuti = a.value.split(";").map(s => s.trim()).filter(s => STILI_OK.some(p => s.toLowerCase().startsWith(p + ":")));
                    if (tenuti.length) el.setAttribute("style", tenuti.join("; "));
                    else el.removeAttribute("style");
                }
                if (a.name.toLowerCase() === "href" && !/^https?:\/\//i.test(a.value)) el.removeAttribute("href");
            });
            if (el.tagName === "A") { el.setAttribute("target", "_blank"); el.setAttribute("rel", "noreferrer"); }
            pulisci(el);
        });
    };
    pulisci(doc.body);
    return doc.body.innerHTML;
}

// ── EMOJI COMPLETE (COM-01) — dataset generato da scripts/genera-emoji.mjs ──
// src/lib/emojiData.json: ~1.900 emoji base (niente varianti di carnagione),
// nomi e keywords CLDR it+en. Caricato PIGRAMENTE alla prima apertura del
// pannello (import dinamico): il bundle principale non cresce. I gruppi
// seguono l'ordine Unicode e devono combaciare con GRUPPO_OUT nello script.
type EmojiDato = { e: string; n: string; k: string[]; g: number };
type EmojiIndicizzata = EmojiDato & { s: string }; // s = testo di ricerca già normalizzato
const GRUPPI_EMOJI: { nome: string; icona: string }[] = [
    { nome: "Faccine ed emozioni", icona: "😀" },
    { nome: "Persone e corpo", icona: "👋" },
    { nome: "Animali e natura", icona: "🐻" },
    { nome: "Cibo e bevande", icona: "🍕" },
    { nome: "Viaggi e luoghi", icona: "🚗" },
    { nome: "Attività", icona: "⚽" },
    { nome: "Oggetti", icona: "💡" },
    { nome: "Simboli", icona: "🔣" },
    { nome: "Bandiere", icona: "🏁" },
];
const PASSO_EMOJI = 300;  // celle per "pagina" nelle categorie grosse (Mostra altre)
const CAP_RICERCA = 300;  // massimo risultati mostrati con una ricerca attiva
// accent-insensitive: "perche" trova "perché", "caffe" trova "caffè"
const normalizza = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// ── barra strumenti: definizione bottoni ────────────────────────────────────
const COLORI_TESTO = ["var(--tf-f8fafc)", "var(--tf-fbbf24)", "var(--tf-4ade80)", "var(--tf-60a5fa)", "var(--tf-f472b6)", "var(--tf-a78bfa)", "var(--tf-fb7185)", "var(--tf-f97316)", "var(--tf-94a3b8)"];
const COLORI_EVIDENZIA = ["transparent", "var(--tf-854d0e)", "var(--tf-14532d)", "var(--tf-1e3a8a)", "var(--tf-701a75)", "var(--tf-7f1d1d)", "var(--tf-334155)"];
const FONT_FACCE = [
    { id: "", label: "Font — predefinito" },
    { id: "Georgia, 'Times New Roman', serif", label: "Elegante (serif)" },
    { id: "'Courier New', monospace", label: "Tecnico (mono)" },
    { id: "'Comic Sans MS', 'Segoe UI', cursive", label: "Informale" },
];
const TAGLIE = [{ v: "2", l: "S" }, { v: "3", l: "M" }, { v: "5", l: "L" }, { v: "6", l: "XL" }];

export function EditorRicco({ htmlIniziale = "", onChange, placeholder = "Scrivi qui…", minHeight = 240, emojiRapide = [] }: {
    htmlIniziale?: string;
    onChange: (html: string, testo: string) => void;
    placeholder?: string;
    minHeight?: number;
    /** riga di emoji "veloci" sempre visibile sopra la tastiera completa */
    emojiRapide?: string[];
}) {
    const box = useRef<HTMLDivElement | null>(null);
    const [vuoto, setVuoto] = useState(!htmlIniziale);
    const [pann, setPann] = useState<"" | "colore" | "evidenzia" | "emoji">("");
    const [catEmoji, setCatEmoji] = useState(0);
    const [attivi, setAttivi] = useState<Record<string, boolean>>({});
    // dataset emoji: caricato via import dinamico alla PRIMA apertura del pannello
    const [datiEmoji, setDatiEmoji] = useState<EmojiIndicizzata[] | null>(null);
    const [caricoEmoji, setCaricoEmoji] = useState(false);
    const [cercaEmoji, setCercaEmoji] = useState("");
    const [limiteEmoji, setLimiteEmoji] = useState(PASSO_EMOJI);

    const apriPannelloEmoji = () => {
        const prossimo = pann === "emoji" ? "" : "emoji";
        setPann(prossimo);
        if (prossimo !== "emoji" || datiEmoji || caricoEmoji) return;
        setCaricoEmoji(true);
        import("@/lib/emojiData.json")
            .then((m) => {
                // indice di ricerca precalcolato: nome + keywords it/en, senza accenti
                const lista = (m.default as EmojiDato[]).map((d) => ({ ...d, s: normalizza(d.n + " " + d.k.join(" ")) }));
                setDatiEmoji(lista);
            })
            .catch(() => { /* rete/chunk ko: restano le emoji rapide */ })
            .finally(() => setCaricoEmoji(false));
    };

    const queryEmoji = normalizza(cercaEmoji.trim());
    const emojiVisibili = useMemo(() => {
        if (!datiEmoji) return { lista: [] as EmojiIndicizzata[], totale: 0 };
        if (queryEmoji) {
            // ricerca GLOBALE su tutte le categorie, col cap per non piantare i PC dei negozi
            const trovate = datiEmoji.filter((d) => d.s.includes(queryEmoji));
            return { lista: trovate.slice(0, CAP_RICERCA), totale: trovate.length };
        }
        const gruppo = datiEmoji.filter((d) => d.g === catEmoji);
        return { lista: gruppo.slice(0, limiteEmoji), totale: gruppo.length };
    }, [datiEmoji, queryEmoji, catEmoji, limiteEmoji]);

    useEffect(() => {
        if (box.current && htmlIniziale && !box.current.innerHTML) box.current.innerHTML = sanificaHtml(htmlIniziale);
        try { document.execCommand("styleWithCSS", false, "true"); } catch { /* vecchi browser */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const emetti = () => {
        const el = box.current; if (!el) return;
        setVuoto(!el.innerText.trim());
        onChange(el.innerHTML, el.innerText);
        try {
            setAttivi({
                bold: document.queryCommandState("bold"),
                italic: document.queryCommandState("italic"),
                underline: document.queryCommandState("underline"),
                strikeThrough: document.queryCommandState("strikeThrough"),
                insertUnorderedList: document.queryCommandState("insertUnorderedList"),
                insertOrderedList: document.queryCommandState("insertOrderedList"),
            });
        } catch { /* stato bottoni: solo estetica */ }
    };

    const cmd = (nome: string, valore?: string) => {
        box.current?.focus();
        try { document.execCommand(nome, false, valore); } catch { /* comando non supportato */ }
        emetti();
    };
    const inserisci = (testo: string) => cmd("insertText", testo);

    const Btn = ({ label, title, on, attivo, largo }: { label: React.ReactNode; title: string; on: () => void; attivo?: boolean; largo?: boolean }) => (
        <button type="button" title={title}
            onMouseDown={(e) => { e.preventDefault(); on(); }}
            className={`h-8 ${largo ? "px-2.5" : "w-8"} rounded-lg text-[13px] font-bold transition-colors flex items-center justify-center shrink-0 ${attivo ? "bg-violet-500/30 text-violet-100 border border-violet-400/50" : "text-slate-300 hover:bg-white/10 border border-transparent"}`}>
            {label}
        </button>
    );
    const Sep = () => <span className="w-px h-5 bg-white/10 mx-0.5 shrink-0" />;

    return (
        <div className="mt-2 rounded-xl border border-white/15 bg-black/30 overflow-hidden focus-within:border-violet-400/50 transition-colors">
            {/* ── TOOLBAR ── */}
            <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-white/10 bg-white/[0.03]">
                <Btn label="↺" title="Annulla (Ctrl+Z)" on={() => cmd("undo")} />
                <Btn label="↻" title="Ripristina (Ctrl+Y)" on={() => cmd("redo")} />
                <Sep />
                <select onMouseDown={(e) => e.stopPropagation()} defaultValue=""
                    onChange={(e) => { if (e.target.value) cmd("fontName", e.target.value); else cmd("removeFormat"); }}
                    title="Carattere"
                    className="h-8 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-300 px-1.5 outline-none max-w-[150px]">
                    {FONT_FACCE.map((f) => <option key={f.label} value={f.id} style={{ background: "var(--tf-12141f)" }}>{f.label}</option>)}
                </select>
                <span className="flex items-center gap-0.5 ml-0.5" title="Grandezza del testo">
                    {TAGLIE.map((t) => <Btn key={t.v} label={t.l} title={`Testo ${t.l}`} on={() => cmd("fontSize", t.v)} />)}
                </span>
                <Sep />
                <Btn label={<b>B</b>} title="Grassetto (Ctrl+B)" attivo={attivi.bold} on={() => cmd("bold")} />
                <Btn label={<i>I</i>} title="Corsivo (Ctrl+I)" attivo={attivi.italic} on={() => cmd("italic")} />
                <Btn label={<u>U</u>} title="Sottolineato (Ctrl+U)" attivo={attivi.underline} on={() => cmd("underline")} />
                <Btn label={<s>S</s>} title="Barrato" attivo={attivi.strikeThrough} on={() => cmd("strikeThrough")} />
                <Sep />
                <Btn label="🎨" title="Colore del testo" attivo={pann === "colore"} on={() => setPann(pann === "colore" ? "" : "colore")} />
                <Btn label="🖍️" title="Evidenziatore" attivo={pann === "evidenzia"} on={() => setPann(pann === "evidenzia" ? "" : "evidenzia")} />
                <Sep />
                <Btn label="•≡" largo title="Elenco puntato" attivo={attivi.insertUnorderedList} on={() => cmd("insertUnorderedList")} />
                <Btn label="1≡" largo title="Elenco numerato" attivo={attivi.insertOrderedList} on={() => cmd("insertOrderedList")} />
                <Btn label="⬅" title="Allinea a sinistra" on={() => cmd("justifyLeft")} />
                <Btn label="⬌" title="Centra" on={() => cmd("justifyCenter")} />
                <Sep />
                <Btn label="😀" title="Emoji — tutte, con ricerca per nome" attivo={pann === "emoji"} on={apriPannelloEmoji} />
                <Btn label="⌫" title="Pulisci la formattazione del testo selezionato" on={() => { cmd("removeFormat"); cmd("unlink"); }} />
            </div>

            {/* ── PANNELLI: colori / evidenziatore / emoji ── */}
            {pann === "colore" && (
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10 bg-black/20 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mr-1">Colore</span>
                    {COLORI_TESTO.map((c) => (
                        <button key={c} type="button" onMouseDown={(e) => { e.preventDefault(); cmd("foreColor", c); }}
                            className="w-6 h-6 rounded-full border border-white/20 hover:scale-110 transition-transform" style={{ background: c }} title={c} />
                    ))}
                </div>
            )}
            {pann === "evidenzia" && (
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10 bg-black/20 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mr-1">Evidenzia</span>
                    {COLORI_EVIDENZIA.map((c) => (
                        <button key={c} type="button" onMouseDown={(e) => { e.preventDefault(); cmd("hiliteColor", c); }}
                            className="w-6 h-6 rounded-lg border border-white/20 hover:scale-110 transition-transform flex items-center justify-center text-[10px] text-slate-400"
                            style={{ background: c === "transparent" ? "transparent" : c }} title={c === "transparent" ? "Nessuna evidenziazione" : c}>
                            {c === "transparent" ? "✕" : ""}
                        </button>
                    ))}
                </div>
            )}
            {pann === "emoji" && (
                <div className="border-b border-white/10 bg-black/20">
                    {emojiRapide.length > 0 && (
                        <div className="flex items-center gap-1 px-2 pt-2 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mr-1">Rapide</span>
                            {emojiRapide.map((e) => (
                                <button key={e} type="button" onMouseDown={(ev) => { ev.preventDefault(); inserisci(e); }}
                                    className="w-7 h-7 rounded-lg hover:bg-white/10 text-base">{e}</button>
                            ))}
                        </div>
                    )}
                    <div className="px-2 pt-2">
                        <input value={cercaEmoji} onChange={(e) => setCercaEmoji(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                            placeholder="Cerca un'emoji… (nome o parola, italiano o inglese)"
                            className="w-full h-8 rounded-lg bg-white/5 border border-white/10 px-2.5 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-violet-400/50" />
                    </div>
                    {caricoEmoji && <div className="px-3 py-3 text-xs text-slate-500">Carico tutte le emoji…</div>}
                    {datiEmoji && !queryEmoji && (
                        <div className="flex items-center gap-1 px-2 pt-2 overflow-x-auto">
                            {GRUPPI_EMOJI.map((c, i) => (
                                <button key={c.nome} type="button" onMouseDown={(e) => { e.preventDefault(); setCatEmoji(i); setLimiteEmoji(PASSO_EMOJI); }}
                                    title={c.nome}
                                    className={`px-2 h-7 rounded-lg text-sm shrink-0 ${catEmoji === i ? "bg-violet-500/25 border border-violet-400/50" : "hover:bg-white/10 border border-transparent"}`}>
                                    {c.icona}
                                </button>
                            ))}
                            <span className="text-[10px] text-slate-500 ml-auto pr-1 shrink-0">{GRUPPI_EMOJI[catEmoji].nome}</span>
                        </div>
                    )}
                    {datiEmoji && emojiVisibili.lista.length > 0 && (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(30px,1fr))] gap-0.5 p-2 max-h-44 overflow-y-auto">
                            {emojiVisibili.lista.map((d) => (
                                <button key={d.e} type="button" title={d.n} onMouseDown={(ev) => { ev.preventDefault(); inserisci(d.e); }}
                                    className="h-8 rounded-lg hover:bg-white/10 text-lg leading-none">{d.e}</button>
                            ))}
                        </div>
                    )}
                    {datiEmoji && queryEmoji && emojiVisibili.totale === 0 && (
                        <div className="px-3 py-3 text-xs text-slate-500">Nessuna emoji trovata: prova con un&apos;altra parola (anche in inglese).</div>
                    )}
                    {datiEmoji && queryEmoji && emojiVisibili.totale > CAP_RICERCA && (
                        <div className="px-3 pb-2 text-[10px] text-slate-500">{emojiVisibili.totale} risultati, mostro i primi {CAP_RICERCA} — affina la ricerca.</div>
                    )}
                    {datiEmoji && !queryEmoji && emojiVisibili.totale > limiteEmoji && (
                        <div className="px-2 pb-2">
                            <button type="button" onMouseDown={(e) => { e.preventDefault(); setLimiteEmoji((l) => l + PASSO_EMOJI); }}
                                className="w-full h-7 rounded-lg text-[11px] font-bold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                                Mostra altre {Math.min(PASSO_EMOJI, emojiVisibili.totale - limiteEmoji)} · {limiteEmoji} di {emojiVisibili.totale}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── FOGLIO ── */}
            <div className="relative">
                {vuoto && <div className="absolute top-3 left-4 text-sm text-slate-600 pointer-events-none select-none">{placeholder}</div>}
                <div ref={box} contentEditable suppressContentEditableWarning
                    onInput={emetti} onKeyUp={emetti} onMouseUp={emetti}
                    className="testo-ricco px-4 py-3 text-sm text-slate-100 outline-none overflow-y-auto"
                    style={{ minHeight, maxHeight: 420 }} />
            </div>
        </div>
    );
}
