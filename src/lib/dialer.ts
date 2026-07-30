"use client";

import { normalizzaE164, msgNumeroNonValido } from "@/lib/telefono";

/** Telefono incorporato (AircallPhoneDock): quando e' collegato, i 📞 compongono
 *  direttamente li'. Registrato dal dock al primo avvio. */
type DialFn = (numero: string, cb?: (ok: boolean, d?: unknown) => void) => void;
let _telefono: DialFn | null = null;
export function registraTelefono(fn: DialFn) { _telefono = fn; }

/** Compone sul telefono incorporato nel CRM (pre-compila; il verde e' manuale). */
async function componiNelDock(e164: string): Promise<boolean> {
    if (!_telefono) return false;
    return new Promise<boolean>((resolve) => {
        let done = false;
        try { _telefono!(e164, (ok) => { done = true; resolve(ok); }); } catch { resolve(false); }
        setTimeout(() => { if (!done) resolve(false); }, 1500);
    });
}

/** Click-to-call: la API AVVIA la chiamata sul telefono Aircall del caller
 *  (richiesta Luca 30/07); se Aircall non puo' avviarla, il server ripiega sul
 *  dial pre-compilato, e qui in ultima istanza si compone sul ☎ nel CRM. */
export async function chiamaAircall(number: string | null | undefined, appUserId: string | null | undefined): Promise<{ ok: boolean; msg: string }> {
    if (!number) return { ok: false, msg: "Nessun numero da chiamare" };
    // Un numero malformato (es. cellulare a 9 cifre) fallirebbe comunque, con
    // l'errore grezzo di Aircall: meglio dirlo subito e indicare cosa correggere.
    const e164 = normalizzaE164(number);
    if (!e164) return { ok: false, msg: msgNumeroNonValido(number) };
    try {
        const res = await fetch("/api/aircall/dial", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ number, appUserId }),
        });
        const j = await res.json();
        if (res.ok) {
            return j.via === "avviata"
                ? { ok: true, msg: `📞 Chiamata verso ${j.number} avviata sul tuo telefono Aircall` }
                : { ok: true, msg: `📞 Numero ${j.number} inviato al tuo telefono Aircall: premi il tasto verde (oppure apri il ☎ qui nel CRM)` };
        }
        // API ko (utente non mappato, Aircall giu'...): almeno il ☎ nel CRM
        if (await componiNelDock(e164)) return { ok: true, msg: `📞 ${e164} composto sul telefono qui nel CRM: premi il tasto verde` };
        return { ok: false, msg: (j.error || "Chiamata non avviata") + " — in alternativa apri il telefono ☎ in basso a destra" };
    } catch {
        if (await componiNelDock(e164)) return { ok: true, msg: `📞 ${e164} composto sul telefono qui nel CRM: premi il tasto verde` };
        return { ok: false, msg: "Rete non disponibile: riprova" };
    }
}
