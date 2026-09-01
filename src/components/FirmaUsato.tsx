"use client";

/* ═══ LA DICHIARAZIONE DI VENDITA DELL'USATO ═════════════════════════════
   Fino a ieri usciva dal vecchio gestionale e si caricava a mano: un PDF che
   nessuno leggeva, con clausole scritte quindici anni fa. Da oggi il
   contratto lo genera il CRM coi dati del ritiro — una pagina sola — e si
   firma in digitale col codice, oppure su carta se il telefono è rotto.

   Il risultato è SEMPRE un file nella stessa casella di prima
   (`allegato_dichiarazione`): il resto della sezione Usati non sa nemmeno che
   è cambiato qualcosa. È il modo di sostituire un pezzo vivo senza fermare
   la macchina. */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/utils";
import PopupCarta from "@/components/PopupCarta";
import CanaleFirma, { type Canale } from "@/components/CanaleFirma";
import { stampaContrattoUsato, type DatiUsato } from "@/lib/moduloUsato";

export type FirmaInfo = {
    via: "otp" | "cartacea";
    canale?: Canale;
    submissionId?: number | null;
    firmata_il?: string | null;
    registro?: string | null;
};

export default function FirmaUsato({ dati, mancano, contratto, onContratto, onRegistro, firma, onFirma, onQr }: {
    dati: DatiUsato | null;
    mancano: string[];
    contratto: File | null;
    onContratto: (f: File | null) => void;
    onRegistro: (f: File | null) => void;
    firma: FirmaInfo | null;
    onFirma: (f: FirmaInfo | null) => void;
    onQr: () => void;
}) {
    const [canale, setCanale] = useState<Canale>("email");
    const [manda, setManda] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [link, setLink] = useState<string | null>(null);
    const [chiediCarta, setChiediCarta] = useState(false);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const protocollo = dati ? dati.protocollo : "";
    const emailFirmatario = dati ? String(dati.venditore?.email || "") : "";
    const via = firma?.via ?? null;
    const fatta = !!firma?.firmata_il;
    /* ⚠️ L'ATTESA VIVE NELLA RICHIESTA, NON NEL COMPONENTE.
       Questo passo si smonta ogni volta che si torna indietro di uno step:
       con l'attesa in uno stato locale, al ritorno ricompariva il pulsante
       «manda la richiesta» su una firma già partita — seconda submission,
       seconda email, e il link che il cliente aveva già in mano non veniva
       più controllato da nessuno. */
    const attesa = !!firma?.submissionId && !fatta;
    const pronto = !!dati && mancano.length === 0;

    const mandaFirma = async () => {
        if (!dati) return;
        setManda(true); setErr(null);
        try {
            const r = await fetch("/api/pratiche/firma", {
                method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ azione: "manda", tipo: "usato", datiUsato: dati, canale }),
            });
            const j = await r.json();
            if (!r.ok || j.error) throw new Error(j.error || "invio non riuscito");
            setLink(j.link || null);
            if (!j.submissionId) throw new Error("DocuSeal non ha restituito il numero della richiesta: riprova, oppure fai firmare su carta.");
            onFirma({ via: "otp", canale, submissionId: j.submissionId, firmata_il: null });
            if (j.mailErrore) setErr("La richiesta è pronta, ma l'email non è partita: " + j.mailErrore + ". Usa il link qui sotto.");
            if (j.whatsapp && j.whatsapp.numero) {
                const w = await fetch("/api/whatsapp/notify", {
                    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ number: j.whatsapp.numero, text: j.whatsapp.testo }),
                }).then((x) => x.json()).catch(() => ({ error: "rete" }));
                if (w?.error) setErr("La richiesta è pronta, ma il messaggio WhatsApp non è partito (" + w.error + "): usa il link qui sotto.");
            }
        } catch (e) { setErr(e instanceof Error ? e.message : "invio non riuscito"); }
        setManda(false);
    };

    /* Il file firmato torna dal NOSTRO deposito, non da DocuSeal: la rotta se
       l'è già portato a casa insieme al registro delle firme. Da lì lo
       rimettiamo dentro la casella di sempre, così il salvataggio dell'usato
       non cambia di una riga. */
    const porta = useCallback(async (path: string, nome: string): Promise<File | null> => {
        try {
            const res = await fetch(`/api/file/pratiche-allegati/${path}`);
            if (!res.ok) return null;
            const b = await res.blob();
            return new File([b], nome, { type: "application/pdf" });
        } catch { return null; }
    }, []);

    useEffect(() => {
        if (!firma?.submissionId || fatta) return;
        let vivo = true;
        let dentro = false;
        const t = setInterval(async () => {
            if (dentro) return;
            dentro = true;
            try {
                const r = await fetch("/api/pratiche/firma", {
                    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        azione: "stato", submissionId: firma.submissionId,
                        protocollo, email: emailFirmatario,
                    }),
                });
                const j = await r.json();
                if (!vivo) return;
                if (j.error) { setErr(j.error); return; }
                if (!j.firmato) return;
                /* ⚠️ «FIRMATO» SOLO SE IL DOCUMENTO È IN MANO NOSTRA.
                   Prima si spegneva il controllo e si scriveva «firmata» anche
                   quando lo scaricamento falliva in silenzio: l'operatore
                   vedeva il riquadro verde, il file non c'era, e l'Avanti
                   restava grigio per sempre senza un motivo scritto da
                   nessuna parte — con la via cartacea ormai irraggiungibile. */
                const proto = protocollo || "contratto";
                if (!j.archiviato?.path) {
                    setErr("Il cliente ha firmato, ma la copia non è arrivata al CRM"
                        + (j.archivioErrore ? " (" + j.archivioErrore + ")" : "") + ". Riprovo fra qualche secondo.");
                    return;
                }
                const f = await porta(j.archiviato.path, `dichiarazione-firmata-${proto}.pdf`);
                if (!f) { setErr("Il cliente ha firmato, ma non riesco a scaricare la copia. Riprovo fra qualche secondo."); return; }
                clearInterval(t);
                setErr(null);
                onContratto(f);
                if (j.registro?.path) {
                    const reg = await porta(j.registro.path, `registro-firme-${proto}.pdf`);
                    if (reg) onRegistro(reg);
                }
                onFirma({ via: "otp", canale, submissionId: firma.submissionId, firmata_il: j.completatoIl || new Date().toISOString() });
            } catch { /* si riprova al giro dopo */ }
            finally { dentro = false; }
        }, 4000);
        return () => { vivo = false; clearInterval(t); };
    }, [firma?.submissionId, fatta, protocollo, emailFirmatario, canale, onContratto, onRegistro, onFirma, porta]);

    const scegliFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = "";
        if (f) onContratto(f);
    };

    return (
        <div className="space-y-3">
            <input ref={fileRef} type="file" accept="application/pdf,image/*" onChange={scegliFile} className="hidden" />

            {/* ── la scelta: il digitale è la strada ───────────────────── */}
            {!via && (
                <div className="rvBox">
                    <div className="rvBoxT">✍️ Dichiarazione di vendita</div>
                    <p className="rvSotto rvSotto-neg">
                        La genera il CRM coi dati del ritiro — una pagina, con le clausole che ci tutelano su
                        provenienza, blocchi e IMEI. Non serve più stamparla dal vecchio gestionale.
                    </p>
                    <button type="button" disabled={!pronto} onClick={() => onFirma({ via: "otp" })}
                        className={cn("rvFirmaG", !pronto && "rvCan-no")}>
                        <span className="rvFirmaG-ic" aria-hidden>📲</span>
                        <span>
                            <span className="rvFirmaG-t">Firma digitale</span>
                            <span className="rvFirmaG-s">
                                Al venditore arriva un link con un codice di verifica: apre, legge il contratto e firma
                                con il dito. Trenta secondi, e la copia firmata finisce da sola nella sua scheda.
                            </span>
                            <span className="rvFirmaG-chip">⚡ 30 secondi</span>
                            <span className="rvFirmaG-chip">🔒 con prova di identità</span>
                            <span className="rvFirmaG-chip">🌱 zero carta</span>
                        </span>
                    </button>
                    <button type="button" className="rvFirmaMini" onClick={() => setChiediCarta(true)}>
                        oppure firma cartacea
                    </button>
                    {!pronto && (
                        <div className="rvSub rvSub-att">
                            Prima di far firmare manca: {mancano.join(", ")}.
                        </div>
                    )}
                </div>
            )}

            {chiediCarta && <PopupCarta
                onResta={() => { setChiediCarta(false); if (pronto || firma?.submissionId) onFirma({ ...(firma || {}), via: "otp" }); }}
                onProsegui={() => { setChiediCarta(false); onFirma({ via: "cartacea" }); }} />}

            {/* ── firma digitale ───────────────────────────────────────── */}
            {via === "otp" && (
                <div className="rvBox">
                    {fatta ? (
                        <div className="rvFattaRiga">
                            <span className="rvFattaIc" aria-hidden>✅</span>
                            <div>
                                <div className="rvFirmaG-t">Contratto firmato</div>
                                <div className="rvTab-min">
                                    identità verificata col codice · copia firmata e registro delle firme archiviati
                                </div>
                            </div>
                        </div>
                    ) : attesa ? (
                        <>
                            <div className="rvBoxT">⏳ In attesa della firma</div>
                            <p className="rvSotto rvSotto-neg">
                                Il venditore ha ricevuto il link. Appena firma, la copia arriva qui da sola — resta pure
                                su questa schermata.
                            </p>
                            <div className="rvSub rvSub-att">
                                ⚠️ Il link deve aprirlo <b>il cliente, sul suo telefono</b>. Se lo apri tu al banco e ti fai
                                dettare il codice, la firma che resta sul contratto è la tua: il registro annota il
                                dispositivo, e in una contestazione è la prima cosa che si guarda.
                            </div>
                            {link && (
                                <a href={link} target="_blank" rel="noreferrer" className="rvPill">🔗 apri il link di firma <span className="rvTab-min">(solo se serve rimandarlo)</span></a>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="rvBoxT">📲 Manda la richiesta di firma</div>
                            <CanaleFirma canale={canale} onCambia={setCanale}
                                email={dati ? String(dati.venditore?.email || "") : ""}
                                cellulare={dati ? String(dati.venditore?.cellulare || "") : ""} />
                            <button type="button" className="rvAzione rvAzione-su" disabled={manda || !pronto} onClick={mandaFirma}>
                                {manda ? "Mando…" : "Manda la richiesta di firma"}
                            </button>
                            <button type="button" className="rvFirmaMini" onClick={() => setChiediCarta(true)}>
                                oppure firma cartacea
                            </button>
                        </>
                    )}
                    {err && <div className="rvSub rvSub-ko">{err}</div>}
                </div>
            )}

            {/* ── firma su carta ───────────────────────────────────────── */}
            {via === "cartacea" && (
                <div className="rvBox">
                    <div className="rvBoxT">🖊️ Firma su carta</div>
                    <button type="button" className="rvFirmaMini rvFirmaMini-su" onClick={() => onFirma({ ...(firma || {}), via: "otp" })}>
                        ← torna alla firma digitale
                    </button>
                    <p className="rvSotto rvSotto-neg">
                        Stampa il contratto, fallo firmare nei <b className="rvSotto-f">due punti</b> in fondo alla pagina
                        (il secondo è per le clausole della sezione 7: senza, quelle clausole non valgono), poi ricaricalo qui.
                    </p>
                    <div className="rvPillRow rvCanRow">
                        <button type="button" className="rvPill" disabled={!dati}
                            onClick={() => { if (dati) stampaContrattoUsato(dati); }}>🖨️ Stampa il contratto</button>
                        <button type="button" className="rvPill" onClick={() => fileRef.current?.click()}>📎 Carica il firmato</button>
                        <button type="button" className="rvPill" onClick={onQr}>📱 Carica dal telefono</button>
                    </div>
                    {contratto && (
                        <div className="rvSub rvSub-ok">
                            📄 {contratto.name}
                            <button type="button" className="rvFirmaMini" onClick={() => onContratto(null)}>rimuovi</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
