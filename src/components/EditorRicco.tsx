"use client";

/* EDITOR RICCO di piattaforma (Luca 03/08: "un editor vero e proprio, fatto
   meglio di Word") — WYSIWYG senza librerie: contentEditable + execCommand,
   tema scuro del CRM. Nato per le Comunicazioni ma pensato RIUSABILE: gli
   automatismi futuri (email/WhatsApp ai clienti, chat e comunicazioni ai
   collaboratori) monteranno QUESTO componente.

   Offre: undo/redo · font (default/elegante/tecnico) · 4 taglie · B I U S ·
   colore testo · evidenziatore · elenchi puntati e numerati · allineamento ·
   pulisci formato · EMOJI ILLIMITATE (picker a categorie, rare comprese).

   Il valore viaggia in HTML (onChange) + testo puro (onChangeTesto, per
   validazioni e compatibilità). `sanificaHtml` è il guardiano: whitelist di
   tag/attributi, via script e handler — da usare SEMPRE anche al render. */

import { useEffect, useRef, useState } from "react";

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

// ── EMOJI ILLIMITATE per categorie (Luca: "anche rare e alternative") ───────
const EMOJI_CATEGORIE: { nome: string; icona: string; emoji: string[] }[] = [
    {
        nome: "Faccine", icona: "😀", emoji: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🫢", "🫣", "🤫", "🤔", "🫡", "🤐", "🤨", "😐", "😑", "🫥", "😶‍🌫️", "😏", "😒", "🙄", "😬", "🤥", "🫨", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "😵‍💫", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕", "🫤", "😟", "🙁", "😮", "😯", "😲", "😳", "🥺", "🥹", "😦", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "🤬", "😈", "👿", "💀", "☠️", "💩", "🤡", "👹", "👺", "👻", "👽", "👾", "🤖", "🫠"],
    },
    {
        nome: "Gesti", icona: "👍", emoji: ["👍", "👎", "👊", "✊", "🤛", "🤜", "👏", "🙌", "🫶", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🖕", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️", "🫵", "👋", "🤚", "🖐️", "✋", "🖖", "🫱", "🫲", "🫳", "🫴", "👌", "🤌", "🤏", "🫸", "🫷"],
    },
    {
        nome: "Persone", icona: "🧑", emoji: ["👶", "🧒", "👦", "👧", "🧑", "👱", "👨", "🧔", "👩", "🧓", "👴", "👵", "🙍", "🙎", "🙅", "🙆", "💁", "🙋", "🧏", "🙇", "🤦", "🤷", "👮", "🕵️", "💂", "🥷", "👷", "🫅", "🤴", "👸", "👳", "👲", "🧕", "🤵", "👰", "🤰", "🫃", "🫄", "🤱", "👼", "🎅", "🤶", "🦸", "🦹", "🧙", "🧚", "🧛", "🧜", "🧝", "🧞", "🧟", "🧌", "💆", "💇", "🚶", "🧍", "🧎", "🏃", "💃", "🕺", "🕴️", "👯", "🧖", "🧗", "🤺", "🏇", "⛷️", "🏂", "🏌️", "🏄", "🚣", "🏊", "⛹️", "🏋️", "🚴", "🚵", "🤸", "🤼", "🤽", "🤾", "🤹", "🧘"],
    },
    {
        nome: "Festa & premi", icona: "🎉", emoji: ["🎉", "🎊", "🥳", "🎈", "🎂", "🍰", "🧁", "🍾", "🥂", "🍻", "🎁", "🎀", "🪅", "🪩", "🎆", "🎇", "✨", "🌟", "💫", "⭐", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "👑", "💎", "🔮", "🪄", "🎗️", "🎟️", "🎫", "🎯", "🎳", "🎮", "🕹️", "🎲", "🧩", "🪀", "🪁", "🎭", "🎨", "🎬", "🎤", "🎧", "🎼", "🎵", "🎶", "🪕", "🪗", "🪘", "🪇", "🪈", "🎷", "🎺", "🎸", "🎻", "🥁"],
    },
    {
        nome: "Lavoro & ufficio", icona: "💼", emoji: ["💼", "🗂️", "📁", "📂", "📄", "📃", "📑", "🧾", "📊", "📈", "📉", "📋", "📌", "📍", "📎", "🖇️", "📏", "📐", "✂️", "🖊️", "🖋️", "✒️", "🖌️", "🖍️", "✏️", "📝", "🔍", "🔎", "🔏", "🔐", "🔒", "🔓", "🗝️", "🔑", "🪪", "📇", "🗃️", "🗄️", "🗑️", "📅", "📆", "🗓️", "⏰", "⏱️", "⏲️", "🕐", "⌛", "⏳", "📞", "☎️", "📟", "📠", "📧", "📨", "📩", "📤", "📥", "📦", "🏷️", "🪧", "📣", "📢", "🔔", "🔕", "💡", "🔦", "🕯️", "🪔"],
    },
    {
        nome: "Tech & telefonia", icona: "📱", emoji: ["📱", "📲", "☎️", "📶", "🛜", "📡", "🔋", "🪫", "🔌", "💻", "🖥️", "🖨️", "⌨️", "🖱️", "🖲️", "💽", "💾", "💿", "📀", "🧮", "🎥", "📷", "📸", "📹", "📼", "🔬", "🔭", "⚙️", "🛠️", "🔧", "🔨", "⚒️", "🪛", "🪚", "🔩", "⛏️", "🪓", "🪝", "⛓️", "🧲", "🪜", "🧰", "🛡️", "🚨", "🧯", "🛎️", "🤖", "👾", "🛰️", "🚀", "🛸", "🪐", "☄️", "⚡", "🔥", "💥", "🌐"],
    },
    {
        nome: "Soldi & business", icona: "💰", emoji: ["💰", "🪙", "💴", "💵", "💶", "💷", "💸", "💳", "🧾", "💹", "📈", "📉", "🏦", "🏧", "🤑", "💲", "🛒", "🛍️", "🏪", "🏬", "🏢", "🏭", "🏗️", "🧱", "🪵", "🛖", "🏠", "🏡", "🏘️", "🏚️", "⚖️", "🤝", "📜", "🔖", "🎰", "🎲", "♟️", "🥊"],
    },
    {
        nome: "Natura & tempo", icona: "🌈", emoji: ["☀️", "🌤️", "⛅", "🌥️", "☁️", "🌦️", "🌧️", "⛈️", "🌩️", "🌨️", "❄️", "☃️", "⛄", "🌬️", "💨", "🌪️", "🌫️", "🌈", "☔", "💧", "💦", "🫧", "🌊", "🌍", "🌎", "🌏", "🌕", "🌖", "🌗", "🌘", "🌑", "🌒", "🌓", "🌔", "🌙", "🌚", "🌝", "🌞", "🪐", "💫", "⭐", "🌟", "✨", "☄️", "🌱", "🪴", "🌿", "☘️", "🍀", "🍁", "🍂", "🍃", "🪺", "🪹", "🌸", "💮", "🪷", "🌹", "🥀", "🌺", "🌻", "🌼", "🌷", "🪻", "🌵", "🌴", "🌳", "🌲", "🪾", "🍄", "🐝", "🦋", "🐞", "🐢", "🦎", "🐍", "🦂", "🕷️", "🦀", "🐙", "🦑", "🦈", "🐬", "🐳", "🦭", "🪼", "🐠", "🦩", "🦜", "🦚", "🦉", "🦅", "🕊️", "🦢", "🪿", "🐓", "🦃", "🐺", "🦊", "🐗", "🫎", "🦌", "🐎", "🦄", "🦓", "🦒", "🐘", "🦣", "🦏", "🦛", "🐪", "🦙", "🦘", "🐃", "🐂", "🐄", "🫏", "🐐", "🐏", "🐑", "🐖", "🐕", "🦮", "🐩", "🐈", "🐈‍⬛", "🐅", "🐆", "🦁", "🐯", "🐻", "🐻‍❄️", "🐼", "🦥", "🦦", "🦨", "🦡", "🐾"],
    },
    {
        nome: "Cibo", icona: "🍕", emoji: ["🍕", "🍔", "🍟", "🌭", "🥪", "🌮", "🌯", "🫔", "🥙", "🧆", "🥘", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🍤", "🍙", "🍚", "🍘", "🍥", "🥠", "🍢", "🍡", "🍧", "🍨", "🍦", "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫", "🍿", "🍩", "🍪", "🌰", "🥜", "🫘", "🍯", "🥛", "🫗", "🍼", "☕", "🫖", "🍵", "🧃", "🥤", "🧋", "🍶", "🍺", "🍻", "🥂", "🍷", "🥃", "🍸", "🍹", "🍾", "🧉", "🧊", "🥄", "🍴", "🍽️", "🥣", "🥡", "🥢", "🧂", "🍎", "🍐", "🍊", "🍋", "🍋‍🟩", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🫛", "🥦", "🥬", "🥒", "🌶️", "🫑", "🌽", "🥕", "🫒", "🧄", "🧅", "🥔", "🍠", "🫚", "🥐", "🥯", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳", "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🦴"],
    },
    {
        nome: "Trasporti & luoghi", icona: "🚗", emoji: ["🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🛻", "🚚", "🚛", "🚜", "🦯", "🦽", "🦼", "🛴", "🚲", "🛵", "🏍️", "🛺", "🚨", "🚔", "🚍", "🚘", "🚖", "🚡", "🚠", "🚟", "🚃", "🚋", "🚞", "🚝", "🚄", "🚅", "🚈", "🚂", "🚆", "🚇", "🚊", "🚉", "✈️", "🛫", "🛬", "🛩️", "💺", "🚁", "🛶", "⛵", "🚤", "🛥️", "🛳️", "⛴️", "🚢", "⚓", "🪝", "⛽", "🚧", "🚦", "🚥", "🗺️", "🗿", "🗽", "🗼", "🏰", "🏯", "🏟️", "🎡", "🎢", "🎠", "⛲", "⛱️", "🏖️", "🏝️", "🏜️", "🌋", "⛰️", "🏔️", "🗻", "🏕️", "⛺", "🛤️", "🛣️", "🏗️", "🌁", "🗾", "🌆", "🌇", "🌃", "🌉", "🌌", "🎑", "🏙️"],
    },
    {
        nome: "Simboli", icona: "❤️", emoji: ["❤️", "🩷", "🧡", "💛", "💚", "💙", "🩵", "💜", "🤎", "🖤", "🩶", "🤍", "💔", "❤️‍🔥", "❤️‍🩹", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "☮️", "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "🕎", "☯️", "☦️", "🛐", "⛎", "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓", "🆔", "⚛️", "🉑", "☢️", "☣️", "📴", "📳", "🈶", "🈚", "🈸", "🈺", "🈷️", "✴️", "🆚", "💮", "🉐", "㊙️", "㊗️", "🈴", "🈵", "🈹", "🈲", "🅰️", "🅱️", "🆎", "🆑", "🅾️", "🆘", "❌", "⭕", "🛑", "⛔", "📛", "🚫", "💯", "💢", "♨️", "🚷", "🚯", "🚳", "🚱", "🔞", "📵", "🚭", "❗", "❕", "❓", "❔", "‼️", "⁉️", "🔅", "🔆", "〽️", "⚠️", "🚸", "🔱", "⚜️", "🔰", "♻️", "✅", "🈯", "💹", "❇️", "✳️", "❎", "🌐", "💠", "Ⓜ️", "🌀", "💤", "🏧", "🚾", "♿", "🅿️", "🛗", "🈳", "🈂️", "🛂", "🛃", "🛄", "🛅", "🚹", "🚺", "🚼", "⚧️", "🚻", "🚮", "🎦", "🛜", "📶", "🈁", "🔣", "ℹ️", "🔤", "🔡", "🔠", "🆖", "🆗", "🆙", "🆒", "🆕", "🆓", "0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟", "🔢", "#️⃣", "*️⃣", "⏏️", "▶️", "⏸️", "⏯️", "⏹️", "⏺️", "⏭️", "⏮️", "⏩", "⏪", "⏫", "⏬", "◀️", "🔼", "🔽", "➡️", "⬅️", "⬆️", "⬇️", "↗️", "↘️", "↙️", "↖️", "↕️", "↔️", "↪️", "↩️", "⤴️", "⤵️", "🔀", "🔁", "🔂", "🔄", "🔃", "🎵", "🎶", "➕", "➖", "➗", "✖️", "🟰", "♾️", "💲", "💱", "™️", "©️", "®️", "👁️‍🗨️", "🔚", "🔙", "🔛", "🔝", "🔜", "〰️", "➰", "➿", "✔️", "☑️", "🔘", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤", "🔺", "🔻", "🔸", "🔹", "🔶", "🔷", "🔳", "🔲", "▪️", "▫️", "◾", "◽", "◼️", "◻️", "🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "⬛", "⬜", "🟫", "🔈", "🔇", "🔉", "🔊", "🔔", "🔕", "📣", "📢", "💬", "💭", "🗯️", "♠️", "♣️", "♥️", "♦️", "🃏", "🎴", "🀄", "🕐", "🧿", "🪬", "🪩"],
    },
];

// ── barra strumenti: definizione bottoni ────────────────────────────────────
const COLORI_TESTO = ["#f8fafc", "#fbbf24", "#4ade80", "#60a5fa", "#f472b6", "#a78bfa", "#fb7185", "#f97316", "#94a3b8"];
const COLORI_EVIDENZIA = ["transparent", "#854d0e", "#14532d", "#1e3a8a", "#701a75", "#7f1d1d", "#334155"];
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
                    {FONT_FACCE.map((f) => <option key={f.label} value={f.id} style={{ background: "#12141f" }}>{f.label}</option>)}
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
                <Btn label="😀" title="Emoji — tutte, rare comprese" attivo={pann === "emoji"} on={() => setPann(pann === "emoji" ? "" : "emoji")} />
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
                    <div className="flex items-center gap-1 px-2 pt-2 overflow-x-auto">
                        {EMOJI_CATEGORIE.map((c, i) => (
                            <button key={c.nome} type="button" onMouseDown={(e) => { e.preventDefault(); setCatEmoji(i); }}
                                title={c.nome}
                                className={`px-2 h-7 rounded-lg text-sm shrink-0 ${catEmoji === i ? "bg-violet-500/25 border border-violet-400/50" : "hover:bg-white/10 border border-transparent"}`}>
                                {c.icona}
                            </button>
                        ))}
                        <span className="text-[10px] text-slate-500 ml-auto pr-1 shrink-0">{EMOJI_CATEGORIE[catEmoji].nome}</span>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(30px,1fr))] gap-0.5 p-2 max-h-44 overflow-y-auto">
                        {EMOJI_CATEGORIE[catEmoji].emoji.map((e, i) => (
                            <button key={e + i} type="button" onMouseDown={(ev) => { ev.preventDefault(); inserisci(e); }}
                                className="h-8 rounded-lg hover:bg-white/10 text-lg leading-none">{e}</button>
                        ))}
                    </div>
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
