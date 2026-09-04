import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { eUnLavoroAutomatico } from "@/lib/cronParola";
import { accesso } from "@/lib/permessiServer";

/* ═══ I NOMI IN ORDINE ════════════════════════════════════════════════════
   «Solo la prima lettera maiuscola, il resto minuscolo» — per i clienti e
   per gli utenti. Gira ogni notte, e si può far girare a mano dall'hub degli
   automatismi.

   GET  = conta e basta, non tocca niente (è la «prova» dell'hub).
   POST = sistema davvero.

   La regola vera sta nella funzione `tf_nomi_in_ordine`, nel database:
   qui c'è solo chi la chiama e con quale password. Sta lì perché la deve
   poter chiamare anche il lavoro notturno, che non passa da Next. */

/* Entrano DUE: il lavoro notturno con la sua parola d'ordine, e una persona
   con la sessione firmata — perché il pulsante dell'hub lo preme un umano.
   Nessuna delle due, nessuno entra: questa rotta riscrive l'anagrafica di
   cinquemila clienti, non è una lettura. */
async function autorizzato(req: Request): Promise<boolean> {
    if (await eUnLavoroAutomatico(req)) return true;
    const g = await accesso(req, "anagrafica/nomi");
    return g.ok;
}

export async function GET(req: Request) {
    /* il cron passa col suo token; per tutti gli altri vale il permesso della
       sezione. Scritto qui dentro e non solo nel wrapper perché la guardia di
       sicurezza controlla verbo per verbo — e ha ragione: un lucchetto su un
       altro verbo dello stesso file non protegge questo. */
    if (!(await eUnLavoroAutomatico(req))) {
        const _g = await accesso(req, "amministrazione");
        if (!_g.ok) return _g.risposta;
    }
    const { data, error } = await supabaseAdmin.rpc("tf_nomi_in_ordine", { p_prova: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const righe = (data ?? []) as { tabella: string; campo: string; sistemati: number }[];
    const tot = righe.reduce((n, r) => n + Number(r.sistemati || 0), 0);
    return NextResponse.json({
        ok: true, prova: true, totale: tot, righe,
        detto: tot ? `Ci sono ${tot} nomi da sistemare.` : "Tutti i nomi sono già in ordine.",
    });
}

export async function POST(req: Request) {
    /* il cron passa col suo token; per tutti gli altri vale il permesso della
       sezione. Scritto qui dentro e non solo nel wrapper perché la guardia di
       sicurezza controlla verbo per verbo — e ha ragione: un lucchetto su un
       altro verbo dello stesso file non protegge questo. */
    if (!(await eUnLavoroAutomatico(req))) {
        const _g = await accesso(req, "amministrazione");
        if (!_g.ok) return _g.risposta;
    }
    const { data, error } = await supabaseAdmin.rpc("tf_nomi_in_ordine", { p_prova: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const righe = (data ?? []) as { tabella: string; campo: string; sistemati: number }[];
    const tot = righe.reduce((n, r) => n + Number(r.sistemati || 0), 0);
    /* resta scritto che è girato, anche quando non c'era niente da fare:
       un automatismo che non lascia traccia è un automatismo di cui nessuno
       sa se funziona */
    try {
        await supabaseAdmin.from("automatismi_eventi").insert({
            azione: "nomi-in-ordine", bersaglio: "clients+app_users",
            dettaglio: tot ? `${tot} nomi sistemati` : "niente da sistemare",
        });
    } catch { /* il registro è un di più: il lavoro è fatto */ }
    return NextResponse.json({ ok: true, totale: tot, righe });
}
