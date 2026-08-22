// Sanificatore HTML (whitelist) — ESTRATTO da EditorRicco per non trascinare tutto
// l'editor nel bundle CONDIVISO: ComunicazioniPopup (globale, montato su ogni pagina)
// usava solo questa funzione ma importandola da EditorRicco tirava dentro l'intero
// editor su OGNI pagina. Ora è un modulo leggero a sé.
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
