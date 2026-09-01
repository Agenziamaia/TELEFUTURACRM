"use client";

/* ═══ «FIRMA CARTACEA»: il popup che prova a farti cambiare idea ═════════
   Luca 01/09: «nel momento in cui cliccano su firma cartacea deve uscire
   anche un pop up integrato nel CRM bello che gli dice guarda che è un
   problema perché poi la firma nel tempo in questo modo può essere persa,
   stiamo sprecando carta, stiamo cercando di convertire l'azienda in
   paperless — quindi insomma crea un bel messaggio».

   Non blocca: la carta resta possibile, e deve restarlo — il telefono rotto
   esiste davvero, ed è il caso in cui il cliente viene qui. Ma la strada
   comoda è quella digitale, e l'uscita di servizio si apre con un secondo
   clic, non con il primo. È la differenza fra vietare e convincere. */

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

export default function PopupCarta({ onResta, onProsegui }: { onResta: () => void; onProsegui: () => void }) {
    const [montato, setMontato] = useState(false);
    useEffect(() => { setMontato(true); }, []);
    /* Escape = ci ripenso. Chi chiude col tasto sta tornando indietro, non
       confermando: la conferma è un clic esplicito sul link piccolo. */
    useEffect(() => {
        const k = (e: KeyboardEvent) => { if (e.key === "Escape") onResta(); };
        window.addEventListener("keydown", k);
        return () => window.removeEventListener("keydown", k);
    }, [onResta]);
    if (!montato) return null;

    return createPortal(
        <div className="rvCartaSf" onMouseDown={(e) => { if (e.target === e.currentTarget) onResta(); }}>
            <div className="rvCarta" role="dialog" aria-modal="true" aria-label="Firma cartacea">
                <div className="rvCarta-e" aria-hidden>🌱</div>
                <div className="rvCarta-t">Un attimo: la carta ci costa più di quanto sembra</div>
                <div className="rvCarta-s">
                    Puoi farlo, e a volte serve davvero — se il cliente ha il telefono rotto la carta è l&apos;unica strada.
                    Ma prima di stampare, tre cose che abbiamo imparato a nostre spese.
                </div>

                <div className="rvCarta-r">
                    <span className="rvCarta-e" aria-hidden>🕰️</span>
                    <div>
                        <b>La firma su carta si perde</b>
                        <span>Il foglio si smarrisce, sbiadisce, finisce in uno scatolone. Se fra due anni qualcuno contesta
                            l&apos;acquisto, una firma digitale porta con sé data, ora, indirizzo IP e il codice che il cliente
                            ha digitato: una fotocopia sgualcita porta solo un segno di penna.</span>
                    </div>
                </div>
                <div className="rvCarta-r">
                    <span className="rvCarta-e" aria-hidden>🖨️</span>
                    <div>
                        <b>Sono fogli, toner e minuti veri</b>
                        <span>Stampare, far firmare nei due punti, scansionare, ricaricare: sono cinque minuti per pratica,
                            per ogni pratica, tutti i giorni, in ogni negozio. Il codice sul telefono ne prende trenta secondi.</span>
                    </div>
                </div>
                <div className="rvCarta-r">
                    <span className="rvCarta-e" aria-hidden>📗</span>
                    <div>
                        <b>Stiamo diventando paperless</b>
                        <span>È una scelta dell&apos;azienda, non un capriccio del CRM: meno archivio fisico, meno documenti
                            introvabili, tutto ritrovabile dalla scheda del cliente in due secondi. Ogni firma digitale è un
                            passo in quella direzione.</span>
                    </div>
                </div>

                <button type="button" className="rvCarta-ok" onClick={onResta}>
                    Va bene, proviamo con la firma digitale
                </button>
                <button type="button" className="rvCarta-no" onClick={onProsegui}>
                    No, procedo con la firma cartacea
                </button>
            </div>
        </div>,
        document.body,
    );
}
