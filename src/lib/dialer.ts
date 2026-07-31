"use client";

import { normalizzaE164, msgNumeroNonValido } from "@/lib/telefono";

/** Telefono incorporato (AircallPhoneDock): quando e' collegato, i 📞 compongono
 *  direttamente li'. Registrato dal dock al primo avvio. */
type DialFn = (numero: string, cb?: (ok: boolean, d?: unknown) => void) => void;
let _telefono: DialFn | null = null;
let _telefonoConnesso = false;
let _apriTelefono: (() => void) | null = null;
export function registraTelefono(fn: DialFn) { _telefono = fn; }
export function segnalaTelefonoConnesso(v: boolean) { _telefonoConnesso = v; }
export function registraApriTelefono(fn: () => void) { _apriTelefono = fn; }

/** Compone sul telefono incorporato nel CRM (pre-compila; il verde e' manuale). */
async function componiNelDock(e164: string): Promise<boolean> {
    if (!_telefono || !_telefonoConnesso) return false;
    return new Promise<boolean>((resolve) => {
        let done = false;
        try { _telefono!(e164, (ok) => { done = true; resolve(ok); }); } catch { resolve(false); }
        setTimeout(() => { if (!done) resolve(false); }, 1500);
    });
}

/** Click-to-call. ORDINE (fix 31/07: "dice inviato ma non parte niente"):
 *  1) telefono ☎ nel CRM se CONNESSO — e' il dispositivo che il caller ha davanti;
 *  2) API: avvia la chiamata sull'app Aircall (funziona solo se l'app e' aperta
 *     da qualche parte — desktop, mobile o il ☎ qui);
 *  3) se l'API ripiega sul dial "alla cieca" o fallisce, il ☎ nel CRM si APRE
 *     da solo e il messaggio dice chiaramente che serve l'accesso: prima
 *     rispondevamo "inviato" anche quando Aircall scartava il numero nel vuoto. */
export async function chiamaAircall(number: string | null | undefined, appUserId: string | null | undefined): Promise<{ ok: boolean; msg: string }> {
    if (!number) return { ok: false, msg: "Nessun numero da chiamare" };
    // Un numero malformato (es. cellulare a 9 cifre) fallirebbe comunque, con
    // l'errore grezzo di Aircall: meglio dirlo subito e indicare cosa correggere.
    const e164 = normalizzaE164(number);
    if (!e164) return { ok: false, msg: msgNumeroNonValido(number) };

    if (await componiNelDock(e164)) return { ok: true, msg: `📞 ${e164} composto sul telefono ☎ qui nel CRM: premi il tasto verde` };

    try {
        const res = await fetch("/api/aircall/dial", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ number, appUserId }),
        });
        const j = await res.json();
        if (res.ok) {
            if (j.via === "avviata") return { ok: true, msg: `📞 Chiamata verso ${j.number} avviata sul tuo telefono Aircall` };
            // "composta" = Aircall non e' riuscito ad AVVIARLA (di solito: nessuna
            // app Aircall aperta) e ha solo pre-compilato il numero sull'app. Se
            // l'app non c'e', il numero si perde nel vuoto: apriamo il ☎ nel CRM.
            _apriTelefono?.();
            return {
                ok: true,
                msg: `📞 Numero ${j.number} inviato all'app Aircall. Se non parte niente: accedi al telefono ☎ qui nel CRM (te l'ho aperto in basso a destra) e riclicca il 📞`,
            };
        }
        // API ko (utente non mappato, Aircall giu'...): almeno il ☎ nel CRM
        if (await componiNelDock(e164)) return { ok: true, msg: `📞 ${e164} composto sul telefono qui nel CRM: premi il tasto verde` };
        _apriTelefono?.();
        return { ok: false, msg: (j.error || "Chiamata non avviata") + " — accedi al telefono ☎ in basso a destra e riprova" };
    } catch {
        if (await componiNelDock(e164)) return { ok: true, msg: `📞 ${e164} composto sul telefono qui nel CRM: premi il tasto verde` };
        _apriTelefono?.();
        return { ok: false, msg: "Rete non disponibile: riprova, oppure usa il telefono ☎ in basso a destra" };
    }
}
