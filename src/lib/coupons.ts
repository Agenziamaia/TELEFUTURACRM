// Coupon sconto (spec Francesco) — SOLO server (usa crypto + supabase): non importare
// da componenti client. Un coupon nasce dal ritiro di un usato pagato con "Codice
// Sconto" (valore = prezzo di ritiro) e si spende in cassa come SCONTO che abbassa
// l'imponibile. È monouso: alla spesa si consuma tutto e l'eventuale RESIDUO
// (valore - sconto applicato) RIGENERA un nuovo coupon da consegnare al cliente.

import { randomBytes } from "crypto";
/* IL RUOLO DI SERVIZIO, NON LA CHIAVE DEL BROWSER (31/08). L'intestazione di
   questo file dice «SOLO server» da sempre, ma importava il client anon — e per
   farlo funzionare la tabella `coupons` era rimasta scrivibile da chiunque
   avesse fatto login: chi voleva poteva alzarsi il valore residuo di un coupon,
   o farne rivivere uno annullato. Sono soldi. */
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

// Alfabeto senza caratteri ambigui (niente 0/O/1/I) per codici leggibili a voce.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generaCodiceCoupon(): string {
    const b = randomBytes(7);
    let s = "";
    for (let i = 0; i < 7; i++) s += ALPHABET[b[i] % ALPHABET.length];
    return "CPN-" + s.slice(0, 3) + "-" + s.slice(3);
}

export interface NuovoCoupon {
    valore: number;
    negozio?: string | null;
    cliente?: string | null;
    origine?: string;            // 'usato' | 'residuo' | 'manuale'
    usato_id?: number | null;
    parent_code?: string | null;
    created_by?: string | null;
}

// Inserisce un coupon con codice UNICO (ritenta in caso di collisione). Ritorna il codice.
export async function generaCoupon(c: NuovoCoupon): Promise<string> {
    const valore = +Number(c.valore).toFixed(2);
    for (let i = 0; i < 6; i++) {
        const code = generaCodiceCoupon();
        const { data, error } = await supabase.from("coupons").insert({
            code,
            valore,
            valore_residuo: valore,
            stato: "attivo",
            negozio: c.negozio ?? null,
            origine: c.origine ?? "usato",
            usato_id: c.usato_id ?? null,
            parent_code: c.parent_code ?? null,
            cliente: c.cliente ?? null,
            created_by: c.created_by ?? null,
        }).select("code").single();
        if (!error && data) return data.code;
        if (error && !/duplicate|unique|violates unique/i.test(error.message)) throw new Error(error.message);
    }
    throw new Error("impossibile generare un codice coupon unico");
}

export async function validaCoupon(code: string): Promise<{ valido: boolean; code?: string; valore_residuo?: number; stato?: string; motivo?: string }> {
    const { data, error } = await supabase.from("coupons").select("code, valore_residuo, stato").eq("code", String(code).trim().toUpperCase()).maybeSingle();
    if (error) return { valido: false, motivo: error.message };
    if (!data) return { valido: false, motivo: "coupon inesistente" };
    if (data.stato !== "attivo") return { valido: false, code: data.code, stato: data.stato, motivo: `coupon ${data.stato}` };
    if (!(Number(data.valore_residuo) > 0)) return { valido: false, code: data.code, stato: data.stato, motivo: "coupon senza valore" };
    return { valido: true, code: data.code, valore_residuo: Number(data.valore_residuo), stato: data.stato };
}

// Consuma il coupon per uno sconto di `sconto` €. Monouso: si marca 'usato' e, se il
// valore residuo supera lo sconto, si RIGENERA un nuovo coupon col resto.
export async function redimiCoupon(
    code: string, sconto: number, ref: string | null, negozio: string | null, createdBy: string | null,
): Promise<{ ok: boolean; error?: string; applied?: number; nuovoCoupon?: { code: string; valore: number } | null }> {
    const { data: cp, error } = await supabase.from("coupons").select("*").eq("code", String(code).trim().toUpperCase()).maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!cp) return { ok: false, error: "coupon inesistente" };
    if (cp.stato !== "attivo") return { ok: false, error: `coupon ${cp.stato}` };
    const residuo = +Number(cp.valore_residuo).toFixed(2);
    const applied = +Number(sconto).toFixed(2);
    if (!(applied > 0)) return { ok: false, error: "sconto non valido" };
    if (applied > residuo + 0.001) return { ok: false, error: `coupon insufficiente (residuo ${residuo.toFixed(2)}€)` };
    const leftover = +(residuo - applied).toFixed(2);
    // consuma il coupon (monouso)
    const { error: upErr } = await supabase.from("coupons")
        .update({ stato: "usato", valore_residuo: 0, redeemed_at: new Date().toISOString(), redeemed_ref: ref })
        .eq("id", cp.id).eq("stato", "attivo");   // guardia anti doppio uso concorrente
    if (upErr) return { ok: false, error: upErr.message };
    let nuovoCoupon: { code: string; valore: number } | null = null;
    if (leftover > 0) {
        const code2 = await generaCoupon({ valore: leftover, negozio: negozio ?? cp.negozio, cliente: cp.cliente, origine: "residuo", parent_code: cp.code, created_by: createdBy });
        nuovoCoupon = { code: code2, valore: leftover };
    }
    return { ok: true, applied, nuovoCoupon };
}
