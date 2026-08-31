"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   «DOVE STAI LAVORANDO OGGI?»

   Luca 31/08: «a ogni login dobbiamo chiedere il punto vendita in cui sta
   lavorando… a quel punto abbiamo il dato certo su quale magazzino stanno
   lavorando e non abbiamo più dubbi».

   Perché serviva: il negozio era un campo MODIFICABILE dentro Registra
   Vendita, e da lì dipendono lo scontrino, il magazzino da cui esce la merce e
   i conti in sospeso che uno vede. Un campo che si cambia senza che nessuno lo
   sappia non è un dato certo.

   Si chiede A OGNI ACCESSO (Luca 31/08: «deve chiederlo ogni volta che fanno
   l'accesso»), non a ogni pagina. Chi esce e rientra lo fa quasi sempre perché
   è cambiato qualcosa — un turno, un altro negozio, un altro PC — ed è
   esattamente il momento in cui la domanda serve. Il marcatore è l'istante del
   login: finché la risposta è quella di QUESTO accesso, ricaricare una pagina
   non fa ricomparire la schermata; il login successivo sì.

   CHI NON VENDE NON LA VEDE. Call center, back office, direzione, ufficio: non
   escono da un punto vendita e non hanno un magazzino: chiedere loro «dove
   stai lavorando» sarebbe un ostacolo senza risposta utile.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import {
    sediDelGruppo, sediDiTurnoOggi, presenzaOggi, dichiaraPresenza,
    type SedeLavoro,
} from "@/lib/doveLavoro";

/** I ruoli che stanno dietro a un bancone. Gli altri non vedono la schermata. */
const RUOLI_DI_NEGOZIO = ["venditore", "store_manager", "tecnico", "agente"];

export function DoveLavoro() {
    const { user } = useAuth();
    const [sedi, setSedi] = useState<SedeLavoro[]>([]);
    const [diTurno, setDiTurno] = useState<string[] | null>(null);   // null = non ancora letto
    const [serve, setServe] = useState(false);
    const [altro, setAltro] = useState(false);
    const [scelta, setScelta] = useState<string | null>(null);
    const [motivo, setMotivo] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [errore, setErrore] = useState("");

    const guarda = useCallback(async () => {
        if (!user?.id || !RUOLI_DI_NEGOZIO.includes(String(user.role || ""))) { setServe(false); return; }
        /* SI CHIEDE A OGNI ACCESSO (Luca 31/08), non una volta al giorno: chi
           esce e rientra lo fa quasi sempre perché è cambiato qualcosa. Il
           confronto è fra l'istante dell'accesso e quello dell'ultima risposta:
           uguali = ha già risposto per QUESTO accesso, e a ogni ricarico di
           pagina non si ripresenta. */
        let gia = "";
        try {
            const acc = localStorage.getItem("crm_accesso_il") || "";
            gia = acc && localStorage.getItem("crm_dove_lavoro") === acc ? acc : "";
        } catch { /* localStorage negato: si chiede, che è il lato sicuro */ }
        if (gia) { setServe(false); return; }
        const p = await presenzaOggi(user.id);
        // la presenza già dichiarata resta il valore di partenza, ma la domanda
        // si fa lo stesso: confermare costa un clic, indovinare costa una vendita
        if (p.attiva) setScelta(p.attiva.sede);
        const [tutte, mie] = await Promise.all([
            sediDelGruppo(),
            sediDiTurnoOggi(user.id, user.name || ""),
        ]);
        setSedi(tutte);
        setDiTurno(mie);
        // una sola sede di turno: è già scelta, basta confermare
        setScelta(mie.length === 1 ? mie[0] : null);
        setServe(true);
    }, [user?.id, user?.role, user?.name]);

    useEffect(() => { guarda(); }, [guarda]);

    if (!serve || !user?.id || typeof document === "undefined") return null;

    const mie = diTurno ?? [];
    const sedeDiTurno = mie[0] || null;
    const fuoriTurno = !!scelta && !mie.includes(scelta);

    const conferma = async () => {
        if (!scelta || salvando) return;
        setSalvando(true); setErrore("");
        try {
            /* FUORI TURNO: la richiesta nasce IN ATTESA, ma intanto si lavora dove
               si è di turno (scelta di Luca: «nessuno resta fermo davanti a un
               cliente»). Se un turno non ce l'ha proprio, resta solo la richiesta:
               è raro, e vendere da un negozio che non è suo senza che nessuno lo
               sappia è esattamente ciò che questa schermata esiste per impedire. */
            const { presenzaOggi: leggi } = await import("@/lib/doveLavoro");
            const gia_ = await leggi(user.id);
            /* CONFERMARE LA STESSA SEDE non scrive niente: la presenza è già
               quella, e una seconda riga «attiva» lo stesso giorno non
               esisterebbe nemmeno — l'indice ne ammette una sola. */
            if (gia_.attiva && gia_.attiva.sede === scelta) {
                try { localStorage.setItem("crm_dove_lavoro", localStorage.getItem("crm_accesso_il") || String(Date.now())); } catch { }
                setServe(false); setSalvando(false);
                return;
            }
            if (fuoriTurno && sedeDiTurno) {
                const a = await dichiaraPresenza(user.id, sedeDiTurno);
                if (!a.ok) throw new Error(a.error);
            }
            const r = await dichiaraPresenza(user.id, scelta, fuoriTurno ? (sedeDiTurno || "—") : null, motivo);
            if (!r.ok) throw new Error(r.error);

            if (fuoriTurno) {
                // l'amministrazione lo deve sapere: stessa coda del bonifico
                const eti = sedi.find((s) => s.sede === scelta)?.etichetta || scelta;
                const daDove = sedi.find((s) => s.sede === sedeDiTurno)?.etichetta || sedeDiTurno || "nessun turno";
                await supabase.from("admin_tasks").insert({
                    tipo: "accesso_negozio",
                    titolo: `🏪 ${user.name} chiede di lavorare a ${eti}`,
                    dettaglio: `Oggi risulta di turno a ${daDove}. Ha chiesto di lavorare a ${eti}${motivo.trim() ? ` — «${motivo.trim()}»` : ""}. Fino all'approvazione continua a lavorare su ${daDove}. Si approva da Collaboratori → Turni.`,
                    link: "/collaboratori?sezione=turni",
                    target_role: "amministrativo",
                    created_by: user.name || null,
                });
            }
            try { localStorage.setItem("crm_dove_lavoro", localStorage.getItem("crm_accesso_il") || String(Date.now())); } catch { }
            setServe(false);
            // il resto del CRM legge la presenza al montaggio: si riparte pulito
            window.location.reload();
        } catch (e) {
            setErrore("Non sono riuscito a registrarlo: " + ((e as Error)?.message || "riprova"));
            setSalvando(false);
        }
    };

    const elenco = altro ? sedi : sedi.filter((s) => mie.includes(s.sede));

    return createPortal(
        <div className="rvFattaSfondo" style={{ zIndex: 3000 }}>
            <div className="rvStoria" style={{ maxWidth: 560 }}>
                <div className="rvStoria-t">
                    <div>
                        <div className="rvStoria-tit">Dove stai lavorando oggi?</div>
                        <div className="rvStoria-sot">
                            {mie.length
                                ? "Da qui escono lo scontrino e la merce: deve essere il punto vendita in cui sei davvero."
                                : "Oggi non risulti a turno da nessuna parte: scegli dove sei e l'amministrazione lo approva."}
                        </div>
                    </div>
                </div>

                <div className="rvPillRow" style={{ marginTop: 6 }}>
                    {elenco.map((s) => {
                        const on = scelta === s.sede;
                        const suo = mie.includes(s.sede);
                        return (
                            <button key={s.sede} type="button" onClick={() => setScelta(s.sede)}
                                className={cn("rvPill", on && "rvPill-on")}
                                title={s.doppia ? `Una sede sola: ${s.insegne.join(" e ")}` : undefined}>
                                🏪 {s.etichetta}
                                {suo && <b className="rvPillN">di turno</b>}
                            </button>
                        );
                    })}
                    {!elenco.length && <div className="rvTab-min">Nessun punto vendita disponibile.</div>}
                </div>

                {/* le sedi doppie si scelgono per SEDE, non per insegna: sono la
                    stessa stanza e lo stesso magazzino */}
                {scelta && sedi.find((s) => s.sede === scelta)?.doppia && (
                    <div className="rvHint">
                        {sedi.find((s) => s.sede === scelta)!.insegne.join(" e ")} sono la stessa sede: un magazzino solo.
                        Quale società emette lo scontrino lo decide la merce.
                    </div>
                )}

                {!altro && mie.length > 0 && (
                    <div className="rvBarra rvBarra-c" style={{ marginTop: 10 }}>
                        <button type="button" className="rvPill rvPill-sm" onClick={() => { setAltro(true); setScelta(null); }}>
                            Sto in un altro negozio
                        </button>
                    </div>
                )}

                {fuoriTurno && (
                    <div className="rvNota rvNota-att" style={{ marginTop: 10 }}>
                        <div className="rvNota-t">Serve l&apos;ok dell&apos;amministrazione</div>
                        <div className="rvNota-s">
                            {sedeDiTurno
                                ? <>Intanto continui a lavorare su <b>{sedi.find((s) => s.sede === sedeDiTurno)?.etichetta || sedeDiTurno}</b>, dove sei di turno: appena approvano, si sposta.</>
                                : <>Oggi non risulti a turno da nessuna parte: fino all&apos;approvazione non potrai registrare vendite.</>}
                        </div>
                        <label className="rvCampo rvCampo-lg" style={{ marginTop: 8 }}>
                            <span className="rvLab">Perché sei lì</span>
                            <input className="rvIn" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                                placeholder="cambio con un collega, apertura straordinaria…" />
                        </label>
                    </div>
                )}

                {errore && <div className="rvErr" style={{ marginTop: 8 }}>{errore}</div>}

                <div className="rvBarra rvBarra-c" style={{ marginTop: 14, justifyContent: "flex-end" }}>
                    <button type="button" onClick={conferma} disabled={!scelta || salvando} className="rvAzione">
                        {salvando ? "…" : fuoriTurno ? "Chiedi l'accesso" : "Sono qui"}
                    </button>
                </div>
            </div>
        </div>, document.body);
}
