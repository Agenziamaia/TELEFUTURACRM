/* ═══ DOVE SI APRE UNA TENDINA ════════════════════════════════════════════
   Luca 02/09, sulla correzione stato degli Usati: «si bugga in visibilità
   perché esplode la tendina verso il basso ma chiaramente non c'è spazio, per
   cui va fatta esplodere verso l'alto». Era lo stesso difetto già sistemato a
   mano in tre schermate diverse: qui si decide una volta per tutte.

   ⚠️ ERA SCRITTA DUE VOLTE, IDENTICA, in `SelectPersona` e in `FiltroMulti`.
   Due copie della stessa regola sono due regole che fra sei mesi divergono, e
   la seconda la corregge solo chi si ricorda che esiste.

   ⚠️ E NON SI MISURA CONTRO LA FINESTRA, ma contro il riquadro che contiene il
   campo. Dentro una finestra modale alta l'85% dello schermo, una tendina che
   si crede libera fino in fondo si disegna FUORI dalla card, sospesa sopra lo
   sfondo scuro. */

/** L'area in cui la tendina può stare: il primo riquadro che la conterrebbe
 *  davvero — una finestra modale, un pannello che scorre — oppure lo schermo. */
function areaDisponibile(campo: Element | null): { top: number; bottom: number } {
    const schermo = { top: 0, bottom: window.innerHeight };
    let el = campo?.parentElement || null;
    for (let giri = 0; el && giri < 12; giri++, el = el.parentElement) {
        const s = getComputedStyle(el);
        const contiene = s.position === "fixed"
            || /auto|scroll|hidden/.test(s.overflowY)
            || s.transform !== "none" || s.filter !== "none";
        if (!contiene) continue;
        const r = el.getBoundingClientRect();
        /* un riquadro grande quanto la pagina non è un contenitore: è la
           pagina, e restringersi ad esso non cambierebbe niente */
        if (r.height >= window.innerHeight - 4 && r.top <= 0) continue;
        if (r.height < 120) continue;                    // troppo piccolo per contare
        return { top: Math.max(schermo.top, r.top), bottom: Math.min(schermo.bottom, r.bottom) };
    }
    return schermo;
}

export type PosTendina = { top?: number; bottom?: number; left: number; width: number; maxH: number };

/** In su o in giù, secondo lo spazio che c'è davvero.
 *  Aprendo verso l'alto ci si aggancia con `bottom` e non con `top`: l'altezza
 *  la decide il contenuto, e con `top` bisognerebbe conoscerla prima di
 *  disegnare. */
export function posizionaTendina(campo: Element | null, r: DOMRect): PosTendina {
    const MIN = 180, MAX = 288;                 // sotto i 180px non ci sta niente
    const area = areaDisponibile(campo);
    const sotto = area.bottom - r.bottom - 8;
    const sopra = r.top - area.top - 8;
    const inSu = sotto < MIN && sopra > sotto;
    return {
        ...(inSu ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
        left: r.left, width: Math.max(r.width, 230),
        maxH: Math.max(120, Math.min(MAX, inSu ? sopra : sotto)),
    };
}
