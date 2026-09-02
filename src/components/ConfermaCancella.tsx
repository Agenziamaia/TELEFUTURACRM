"use client";

/* ═══ «SICURO DI CANCELLARLA?» — DENTRO IL CRM ═══════════════════════════
   Luca 02/09: «il protocollo non si capisce cos'è, non serve a niente
   mettere questa voce; dammi solamente un pop up — tra l'altro integrato col
   CRM, perché questo non lo è — che mi chiede la conferma».

   Aveva ragione due volte. `window.prompt` è la finestra del browser, col
   nome del dominio in cima: in mezzo a una schermata curata sembra un
   errore, non una scelta. E far RISCRIVERE il protocollo era attrito senza
   protezione: sta scritto due centimetri sopra, si copia e si incolla.

   La protezione vera sta altrove ed è già al suo posto: il server si ferma
   da solo se c'è un acconto incassato o un buono emesso, e lo dice. Qui
   basta un secondo clic consapevole. */

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

export default function ConfermaCancella({ titolo, righe, ferma, busy, onAnnulla, onConferma }: {
    /** cosa si sta cancellando, con parole sue: «ASS-26-0003 — iPhone 12 Pro Max» */
    titolo: string;
    /** che cosa sparisce, una voce per riga */
    righe: string[];
    /** i motivi per cui il server si è fermato: quando ci sono, il bottone cambia */
    ferma?: string[] | null;
    busy?: boolean;
    onAnnulla: () => void;
    onConferma: () => void;
}) {
    const [montato, setMontato] = useState(false);
    useEffect(() => { setMontato(true); }, []);
    useEffect(() => {
        const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onAnnulla(); };
        window.addEventListener("keydown", k);
        return () => window.removeEventListener("keydown", k);
    }, [onAnnulla, busy]);
    if (!montato) return null;

    const bloccante = !!(ferma && ferma.length);
    return createPortal(
        <div className="rvCartaSf" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onAnnulla(); }}>
            <div className="rvCarta rvCarta-ko" role="dialog" aria-modal="true" aria-label="Conferma cancellazione">
                <div className="rvCarta-e" aria-hidden>{bloccante ? "⚠️" : "🗑️"}</div>
                <div className="rvCarta-t">{bloccante ? "Aspetta: c'è del denaro di mezzo" : "Cancellare questa pratica?"}</div>
                <div className="rvCarta-s">{titolo}</div>

                {bloccante ? (
                    <>
                        {ferma!.map((r, i) => (
                            <div key={i} className="rvCarta-r rvCarta-r-ko">
                                <span className="rvCarta-e" aria-hidden>💶</span>
                                <div><span>{r}</span></div>
                            </div>
                        ))}
                        <button type="button" className="rvCarta-ok" disabled={busy} onClick={onAnnulla}>
                            Lascia stare, non la cancello
                        </button>
                        <button type="button" className="rvCarta-no rvCarta-no-ko" disabled={busy} onClick={onConferma}>
                            {busy ? "Cancello…" : "Cancella lo stesso, so cosa comporta"}
                        </button>
                    </>
                ) : (
                    <>
                        {righe.map((r, i) => (
                            <div key={i} className="rvCarta-r">
                                <span className="rvCarta-e" aria-hidden>·</span>
                                <div><span>{r}</span></div>
                            </div>
                        ))}
                        <button type="button" className="rvCarta-ko-b" disabled={busy} onClick={onConferma}>
                            {busy ? "Cancello…" : "Sì, cancellala"}
                        </button>
                        <button type="button" className="rvCarta-no" disabled={busy} onClick={onAnnulla}>
                            Annulla
                        </button>
                    </>
                )}
            </div>
        </div>,
        document.body,
    );
}
