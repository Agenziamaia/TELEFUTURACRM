"use client";

/** Telefono incorporato (AircallPhoneDock): quando e' collegato, i 📞 compongono
 *  direttamente li'. Registrato dal dock al primo avvio. */
type DialFn = (numero: string, cb?: (ok: boolean, d?: unknown) => void) => void;
let _telefono: DialFn | null = null;
export function registraTelefono(fn: DialFn) { _telefono = fn; }

/** Click-to-call: prova il telefono NEL CRM; se non è aperto/collegato, manda il
 *  numero all'app Aircall del caller via API (tasto verde lo preme lui). */
export async function chiamaAircall(number: string | null | undefined, appUserId: string | null | undefined): Promise<{ ok: boolean; msg: string }> {
    if (!number) return { ok: false, msg: "Nessun numero da chiamare" };
    const cifre = String(number).replace(/\D/g, "");
    const e164 = cifre.startsWith("39") && cifre.length >= 11 ? `+${cifre}` : `+39${cifre}`;
    // 1) telefono dentro il CRM (pannello ☎ in basso a destra)
    if (_telefono) {
        const esito = await new Promise<boolean>((resolve) => {
            let done = false;
            try { _telefono!(e164, (ok) => { done = true; resolve(ok); }); } catch { resolve(false); }
            setTimeout(() => { if (!done) resolve(false); }, 1500);
        });
        if (esito) return { ok: true, msg: `📞 ${e164} composto sul telefono qui nel CRM` };
    }
    // 2) fallback: dial API -> app Aircall del caller
    try {
        const res = await fetch("/api/aircall/dial", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ number, appUserId }),
        });
        const j = await res.json();
        if (!res.ok) return { ok: false, msg: (j.error || "Chiamata non avviata") + " — in alternativa apri il telefono ☎ in basso a destra" };
        return { ok: true, msg: `📞 Numero ${j.number} inviato al tuo telefono Aircall: premi il tasto verde (oppure apri il ☎ qui nel CRM)` };
    } catch {
        return { ok: false, msg: "Rete non disponibile: riprova" };
    }
}
