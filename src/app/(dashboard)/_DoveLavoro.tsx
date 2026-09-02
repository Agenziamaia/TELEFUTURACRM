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
import { cn } from "@/utils";
import {
    sediDelGruppo, sediDiTurnoOggi, presenzaOggi,
    type SedeLavoro,
    RUOLI_DI_NEGOZIO, ANCHE_LORO, stoInUfficio,
} from "@/lib/doveLavoro";

/* I ruoli che stanno dietro a un bancone e le eccezioni per persona ora
   vivono in `lib/doveLavoro.ts`: la stessa lista decide chi vede questa
   schermata E chi resta bloccato senza dichiarazione. Due copie sarebbero
   divergute al primo ruolo aggiunto. */

/* Ha già risposto in QUESTO caricamento di pagina. È l'ultima rete: se la
   memoria del browser non è scrivibile, almeno non si chiede due volte di
   fila. Vive quanto la pagina, e va bene così. */
let rispostoQui = false;

/** La data di oggi come la scrive il database: la presenza è per giorno. */
const oggiYmd = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const deveRispondere = (u: { id?: string; role?: string } | null) =>
    RUOLI_DI_NEGOZIO.includes(String(u?.role || "")) || ANCHE_LORO.includes(String(u?.id || ""));

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
        if (!user?.id || !deveRispondere(user)) { setServe(false); return; }
        /* e nemmeno a chi è assegnato SOLO a un ufficio: lì non c'è cassa,
           non si scontrina, e «in che negozio sei oggi?» non ha risposta */
        if (await stoInUfficio(user.id, (user as { negozio?: string }).negozio)) { setServe(false); return; }
        /* SI CHIEDE A OGNI ACCESSO (Luca 31/08), non una volta al giorno: chi
           esce e rientra lo fa quasi sempre perché è cambiato qualcosa. Il
           confronto è fra l'istante dell'accesso e quello dell'ultima risposta:
           uguali = ha già risposto per QUESTO accesso, e a ogni ricarico di
           pagina non si ripresenta. */
        /* IL MARCATORE DEVE ESISTERE PRIMA DI POTERCI CONTARE (Luca 31/08:
           «lo chiede anche in loop, lo continua a richiedere»).
           `crm_accesso_il` lo scrive SOLO il login vero. Chi era già dentro —
           sessione ripristinata dal browser, e stasera erano tutti così — non
           ce l'aveva: la risposta veniva scritta agganciata a un istante
           inventato lì per lì, il ricarico non ritrovava niente, e la domanda
           tornava. Ogni volta. Qui il marcatore, se manca, si crea: da questo
           momento c'è un «accesso» a cui agganciare la risposta.
           Il giorno ci sta attaccato perché la presenza è per data: senza,
           sopravvivrebbe alla mezzanotte e uno lavorerebbe senza dichiararsi. */
        let gia = false;
        try {
            let acc = localStorage.getItem("crm_accesso_il") || "";
            if (!acc) { acc = String(Date.now()); localStorage.setItem("crm_accesso_il", acc); }
            gia = localStorage.getItem("crm_dove_lavoro") === `${acc}|${oggiYmd()}`;
        } catch {
            /* localStorage negato (finestra privata, dati di sito bloccati): non
               c'è dove segnarlo, e senza questa memoria la schermata tornerebbe
               a ogni pagina. Si chiede una volta per caricamento e basta. */
            gia = rispostoQui;
        }
        if (gia) { setServe(false); return; }
        // la presenza già dichiarata resta il valore di PARTENZA, ma la domanda
        // si fa lo stesso: confermare costa un clic, indovinare costa una vendita
        const p = await presenzaOggi(user.id);
        const [tutte, mie] = await Promise.all([
            sediDelGruppo(),
            sediDiTurnoOggi(user.id, user.name || ""),
        ]);
        /* SI APRE SOLO SE SO COSA OFFRIRE (revisore 31/08). Se l'elenco delle
           sedi torna vuoto — la query fallisce, la rete cade, il database non
           risponde — questa schermata diventerebbe un pannello a tutto schermo
           senza un bottone dentro: niente sedi da scegliere, niente conferma
           possibile, niente ESC. Cioè il CRM chiuso a chiave, la mattina in cui
           quindici negozi aprono la cassa. Meglio non chiedere: la presenza è
           un dato che vogliamo, non un lucchetto. */
        if (!tutte.length) { setServe(false); return; }
        setSedi(tutte);
        setDiTurno(mie);
        /* CHI OGGI NON È DI TURNO DA NESSUNA PARTE vede subito TUTTE le sedi
           (revisore 31/08). Prima l'elenco era filtrato sui suoi turni e il
           pulsante «Sto in un altro negozio» compariva solo se un turno ce
           l'aveva: chi non ne aveva restava davanti a «Nessun punto vendita
           disponibile» e a un bottone spento. Ferie rientrate, sostituzioni
           dell'ultimo minuto, gente appena assunta: capita, e capita di lunedì. */
        setAltro(mie.length === 0);
        // la presenza già dichiarata è il punto di partenza; se no, l'unico turno
        const p_ = p.attiva?.sede && tutte.some((x) => x.sede === p.attiva!.sede) ? p.attiva.sede : null;
        setScelta(p_ || (mie.length === 1 ? mie[0] : null));
        setServe(true);
    }, [user?.id, user?.role, user?.name]);

    useEffect(() => { guarda(); }, [guarda]);

    /* LE ALTRE SCHEDE (revisore 31/08). Chi apre il CRM in due schede prima di
       rispondere si ritrova il modale in tutte e due: risponde in una, l'altra
       resta lì con la domanda aperta. Innocuo se poi conferma la stessa sede —
       il server non riscrive — ma se in quella dimenticata sceglie un'altra
       sede, quella diventa la presenza del giorno: e da lì dipendono scontrino,
       cassa e magazzino. Il browser avvisa le altre schede quando la memoria
       cambia: basta ascoltare e rifare il controllo, che le farà chiudere. */
    useEffect(() => {
        const altrove = (e: StorageEvent) => { if (e.key === "crm_dove_lavoro") guarda(); };
        window.addEventListener("storage", altrove);
        return () => window.removeEventListener("storage", altrove);
    }, [guarda]);

    if (!serve || !user?.id || typeof document === "undefined") return null;

    const mie = diTurno ?? [];
    const sedeDiTurno = mie[0] || null;
    const fuoriTurno = !!scelta && !mie.includes(scelta);
    /* ⚠️ CHI APPROVA NON CHIEDE IL PERMESSO A SÉ (Luca 02/09, su Marta
       Perrotta). Il cartello e il bottone cambiano di conseguenza: non
       «serve l'ok dell'amministrazione» — l'amministrazione è lei — ma un
       avviso che sta scegliendo un negozio diverso da quello in cui è in
       turno, e un bottone che chiede conferma invece di chiedere permesso.
       Per ruolo, non per persona: gli stessi che possono approvare. */
    const siAutorizza = ["amministrativo", "direttore_generale", "admin", "dev"].includes(String(user?.role || ""));

    const conferma = async () => {
        if (!scelta || salvando) return;
        setSalvando(true); setErrore("");
        try {
            /* TUTTA LA REGOLA STA SUL SERVER (revisore 31/08). Da qui si dice
               solo dove si è: se sia un turno o una richiesta, se una presenza
               di stamattina vada chiusa, se serva avvisare l'amministrazione,
               lo decide `/api/turni/presenza` — che è anche l'unico a poter
               chiudere la riga precedente, visto che al browser l'`update` su
               `presenza_negozio` è tolto apposta.
               Prima questo pezzo faceva due insert di fila e, per chi cambiava
               negozio a metà giornata, il secondo sbatteva contro l'indice
               unico: l'errore del database finiva a schermo davanti al cliente. */
            const r = await fetch("/api/turni/presenza", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ azione: "dichiara", sede: scelta, motivo }),
            });
            const j = await r.json().catch(() => ({} as { ok?: boolean; error?: string }));
            if (!r.ok || !j.ok) throw new Error(j.error || "riprova");

            /* SEGNO CHE HO RISPOSTO, e solo se ci riesco ricarico. Il
               ricarico serve perché il resto del CRM legge la presenza al
               montaggio; ma se la memoria non è scrivibile, ricaricare
               rimetterebbe in piedi la stessa domanda all'infinito. Meglio
               una pagina non aggiornata di un CRM inutilizzabile. */
            let segnato = false;
            try {
                const acc = localStorage.getItem("crm_accesso_il") || String(Date.now());
                localStorage.setItem("crm_accesso_il", acc);
                localStorage.setItem("crm_dove_lavoro", `${acc}|${oggiYmd()}`);
                segnato = localStorage.getItem("crm_dove_lavoro") === `${acc}|${oggiYmd()}`;
            } catch { segnato = false; }
            rispostoQui = true;
            setServe(false);
            if (segnato) window.location.reload();
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

                {!altro && (
                    <div className="rvBarra rvBarra-c" style={{ marginTop: 10 }}>
                        <button type="button" className="rvPill rvPill-sm" onClick={() => { setAltro(true); setScelta(null); }}>
                            Sto in un altro negozio
                        </button>
                    </div>
                )}

                {fuoriTurno && (
                    <div className="rvNota rvNota-att" style={{ marginTop: 10 }}>
                        <div className="rvNota-t">{siAutorizza ? "Attenzione: non è il tuo turno" : "Serve l'ok dell'amministrazione"}</div>
                        <div className="rvNota-s">
                            {siAutorizza
                                ? <>Oggi risulti {sedeDiTurno ? <>di turno a <b>{sedi.find((s) => s.sede === sedeDiTurno)?.etichetta || sedeDiTurno}</b></> : <>senza turno</>}, e stai scegliendo un punto vendita diverso. Puoi farlo — l&apos;autorizzazione la dai tu — ma da qui in poi scontrini e magazzino saranno di quel negozio.</>
                                : sedeDiTurno
                                    ? <>Intanto continui a lavorare su <b>{sedi.find((s) => s.sede === sedeDiTurno)?.etichetta || sedeDiTurno}</b>, dove sei di turno: appena approvano, si sposta.</>
                                    : <>Oggi non risulti a turno da nessuna parte: fino all&apos;approvazione non potrai registrare vendite.</>}
                        </div>
                        <label className="rvCampo rvCampo-lg" style={{ marginTop: 8 }}>
                            <span className="rvLab">{siAutorizza ? "Perché sei lì (resta scritto)" : "Perché sei lì"}</span>
                            <input className="rvIn" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                                placeholder="cambio con un collega, apertura straordinaria…" />
                        </label>
                    </div>
                )}

                {errore && <div className="rvErr" style={{ marginTop: 8 }}>{errore}</div>}

                <div className="rvBarra rvBarra-c" style={{ marginTop: 14, justifyContent: "flex-end" }}>
                    <button type="button" onClick={conferma} disabled={!scelta || salvando} className="rvAzione">
                        {salvando ? "…" : fuoriTurno ? (siAutorizza ? "Sì, lavoro qui oggi" : "Chiedi l'accesso") : "Sono qui"}
                    </button>
                </div>
            </div>
        </div>, document.body);
}
