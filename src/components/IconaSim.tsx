// LA SIM CARD (Luca 31/08).
//
// «Mobile», nelle gare e nel catalogo, vuol dire ATTIVAZIONI DI SIM — non
// telefoni. Il 📱 resta all'apparecchio: telefoni rateizzati, venduti, device,
// che avranno sezioni loro. Ma in Unicode la SIM card NON ESISTE: nessun
// carattere la disegna, e le più vicine (💳 carta, 🪪 tessera, 📇 rubrica) nel
// CRM significano già altro — 💳 è il POS in ventisette punti, dentro lo stesso
// menu delle piste. Quindi la SIM si disegna.
//
// È un elemento grafico, non un carattere: vive dove il codice disegna
// qualcosa. Dove invece serve una STRINGA — le chiavi con cui si raggruppano
// le righe, il pallino che l'amministrazione sceglie da una tavolozza e che
// finisce in una colonna di testo — resta 📶, che nel CRM è già il segno della
// SIM (categoria «SIM» della marginalità, regola del catalogo cassa).
export { SIM_TESTO } from "@/lib/sim";
import { SIM_TESTO } from "@/lib/sim";

/** La SIM: corpo chiaro, angolo tagliato, contatti dorati. A 11px i contatti
 *  sono l'unica cosa che sopravvive, ed è per questo che sono colorati: una
 *  versione a contorno, a quella misura, diventa un rettangolino grigio. */
export function IconaSim({ px, className = "", muta = false }: { px?: number; className?: string; muta?: boolean }) {
    /* LA MISURA SEGUE IL TESTO, non un numero fisso (revisore 31/08). Il CRM
       ha tre corpi di carattere (globals.css, data-fs-sm): l'emoji cresce con
       loro, un SVG in pixel no — misurato, al corpo grande l'icona restava un
       terzo più piccola e le etichette si disallineavano. `1.05em` è
       l'ingombro dell'emoji alla stessa riga. `px` resta per i pochi punti che
       vogliono una misura assoluta. */
    const lato = px != null ? px : "1.05em";
    return (
        <svg width={lato} height={lato} viewBox="0 0 16 16" className={className}
            role={muta ? undefined : "img"} aria-label={muta ? undefined : "SIM"} aria-hidden={muta || undefined}
            style={{ display: "inline-block", verticalAlign: "-0.15em", flexShrink: 0 }}>
            <path d="M3.2 1.5h5.4L12.8 5.7v8.8a1 1 0 0 1-1 1H3.2a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1Z" fill="#cbd5e1" />
            <rect x="4.5" y="6.6" width="6.2" height="5.8" rx="1" fill="#eab308" />
            <path d="M7.6 6.6v5.8M4.5 9.5h6.2" stroke="#0b0e1c" strokeWidth=".9" />
        </svg>
    );
}

/** Il ponte fra le due (Luca: «se la disegnamo, perché non puoi usarla anche
 *  nei campi di testo?»).
 *
 *  La risposta onesta è che un disegno non entra in una stringa: una stringa
 *  finisce in un `title=`, in un template literal, in una colonna del database
 *  — e un elemento React, lì, diventa «[object Object]» (è già successo, nei
 *  tooltip dell'Analisi). Quindi il dato resta 📶, che nel CRM è già il segno
 *  della SIM, e chi DISEGNA lo fa passare da qui: sullo schermo appare la SIM
 *  vera, nel dato resta un carattere.
 *
 *  Uso: `{conSim(riga.label)}` al posto di `{riga.label}`. */
export function conSim(v: unknown, px?: number): React.ReactNode {
    const t = String(v ?? "");
    if (!t.includes(SIM_TESTO)) return t;
    const pezzi = t.split(SIM_TESTO);
    return pezzi.flatMap((p, i) => (i === 0 ? [p] : [<IconaSim key={`s${i}`} px={px} />, p]));
}
