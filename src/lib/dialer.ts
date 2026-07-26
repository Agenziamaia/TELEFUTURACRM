"use client";

/** Click-to-call Aircall: manda il numero al telefono del caller (il tasto
 *  verde lo preme lui). Ritorna un messaggio pronto da mostrare. */
export async function chiamaAircall(number: string | null | undefined, appUserId: string | null | undefined): Promise<{ ok: boolean; msg: string }> {
    if (!number) return { ok: false, msg: "Nessun numero da chiamare" };
    try {
        const res = await fetch("/api/aircall/dial", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ number, appUserId }),
        });
        const j = await res.json();
        if (!res.ok) return { ok: false, msg: j.error || "Chiamata non avviata" };
        return { ok: true, msg: `📞 Numero ${j.number} inviato al tuo telefono Aircall: premi il tasto verde` };
    } catch {
        return { ok: false, msg: "Rete non disponibile: riprova" };
    }
}
