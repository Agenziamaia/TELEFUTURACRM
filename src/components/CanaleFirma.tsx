"use client";

/* ═══ DOVE ARRIVA LA RICHIESTA DI FIRMA ═════════════════════════════════
   Luca 01/09: «possiamo mandarlo solo per email? non sul cellulare? come
   anche messaggio WhatsApp volendo, direttamente dal numero WhatsApp del
   negozio».

   ⚠️ Una precisazione onesta: il messaggio esce dal numero DESIGNATO per le
   notifiche nel pannello WhatsApp, non da quello del singolo punto vendita —
   la scelta del mittente sta lì, non qui. Il testo scritto alla commessa dice
   quello che succede davvero: promettere «dal numero del tuo negozio» e poi
   spedire da un altro numero significa che il cliente riceve un link e la
   richiesta di un codice da un contatto che non riconosce.

   Il LINK viaggia su tre strade, il CODICE su due: DocuSeal manda il suo
   codice di verifica solo per email o per SMS — WhatsApp non è un suo canale.
   Quindi con WhatsApp il link arriva in chat dal numero del negozio e il
   codice sull'email. I recapiti sono SEMPRE quelli dell'anagrafica: qui non
   si scrive nessun indirizzo e nessun numero, altrimenti il documento
   finirebbe a un contatto che nessuno ha mai verificato. */

import { cn } from "@/utils";

export type Canale = "email" | "sms" | "whatsapp";

export default function CanaleFirma({ canale, onCambia, email, cellulare }: {
    canale: Canale; onCambia: (c: Canale) => void; email: string; cellulare: string;
}) {
    const haCell = String(cellulare || "").replace(/\D/g, "").length >= 8;
    const haMail = /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(String(email || "").trim());
    const voci: { k: Canale; t: string; s: string; ok: boolean }[] = [
        { k: "email", t: "📧 Email", s: email || "manca in anagrafica", ok: haMail },
        { k: "sms", t: "💬 SMS", s: haCell ? cellulare : "manca il cellulare", ok: haCell },
        { k: "whatsapp", t: "🟢 WhatsApp", s: haCell ? "dal numero WhatsApp del CRM" : "manca il cellulare", ok: haCell && haMail },
    ];
    return (
        <div>
            <div className="rvLab">Dove gli mandiamo il link</div>
            <div className="rvPillRow rvCanRow">
                {voci.map((v) => (
                    <button key={v.k} type="button" disabled={!v.ok}
                        onClick={() => onCambia(v.k)}
                        className={cn("rvScelta rvCan", canale === v.k && v.ok && "rvScelta-on", !v.ok && "rvCan-no")}>
                        <b>{v.t}</b>
                        <span className="rvTab-min rvCan-s">{v.s}</span>
                    </button>
                ))}
            </div>
            {canale === "whatsapp" && (
                <div className="rvTab-min rvCan-nota">
                    Il link parte in chat dal numero WhatsApp del CRM; il <b>codice di verifica</b> gli arriva sull&apos;email —
                    WhatsApp non è un canale di DocuSeal, e il codice non si può spedire da fuori.
                </div>
            )}
            {canale === "sms" && (
                <div className="rvTab-min rvCan-nota">Link e codice gli arrivano <b>tutti e due sul cellulare</b>.</div>
            )}
        </div>
    );
}
