"use client";

/* CARICA DAL TELEFONO VIA QR — meccanismo estratto in hook riusabile (CHL-02,
   Luca 04/08). Terzo consumatore dopo Registra Vendita e Usati: la logica e'
   la copia della versione TypeScript gia' rifinita in usati/page.tsx.
   Flusso: openQr(boxType, kind) crea una sessione effimera in qr_uploads e
   mostra il QR dell'URL pubblico /m/u/<token>; il telefono carica sul bucket
   qr-uploads; il desktop fa polling ogni 2s e a "caricato" scarica i file,
   li consegna alla callback onFiles (File[] pronti per il flusso di submit
   esistente) e pulisce staging + riga sessione. Il polling si spegne allo
   smontaggio del componente che usa l'hook. */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
// qrcode: import dinamico on-demand (perf, non nel bundle iniziale)
import { supabase } from "@/lib/supabaseClient";

type QrFile = { url: string; name?: string; mime?: string };

export function useQrUpload(onFiles: (files: File[]) => void) {
    const [aperto, setAperto] = useState(false);
    const [token, setToken] = useState<string | null>(null);
    const [img, setImg] = useState<string | null>(null);
    const [ricevuti, setRicevuti] = useState<number | null>(null);
    // la callback vive in un ref: il polling non si riavvia a ogni render
    const cb = useRef(onFiles);
    useEffect(() => { cb.current = onFiles; }, [onFiles]);

    const closeQr = useCallback(() => { setAperto(false); setToken(null); setImg(null); setRicevuti(null); }, []);

    const openQr = useCallback(async (boxType: string, kind: "foto" | "doc" = "doc") => {
        try {
            setAperto(true); setImg(null); setRicevuti(null);
            const t = (window.crypto?.randomUUID?.() || (Date.now() + "-" + Math.random().toString(36).slice(2)));
            const { error } = await supabase.from("qr_uploads").insert({ token: t, box_type: boxType, kind, status: "attesa" });
            if (error) { alert("QR non generato: " + error.message); closeQr(); return; }
            const { default: QRCode } = await import("qrcode");
            const dataUrl = await QRCode.toDataURL(`${window.location.origin}/m/u/${t}`, { width: 240, margin: 1 });
            setToken(t); setImg(dataUrl);
        } catch (e) { alert("QR non generato: " + ((e as Error)?.message || e)); closeQr(); }
    }, [closeQr]);

    // polling 2s sulla sessione: si spegne allo smontaggio (cleanup) o a ricezione
    useEffect(() => {
        if (!token) return;
        let vivo = true;
        const t = setInterval(async () => {
            const { data } = await supabase.from("qr_uploads").select("status,files").eq("token", token).maybeSingle();
            if (!vivo || !data) return;
            const files: QrFile[] = Array.isArray(data.files) ? data.files : [];
            if (data.status === "caricato" && files.length) {
                clearInterval(t);
                try {
                    const arrivati: File[] = [];
                    for (const f of files) {
                        const resp = await fetch(f.url);
                        const blob = await resp.blob();
                        arrivati.push(new File([blob], f.name || "allegato", { type: f.mime || blob.type }));
                    }
                    if (!vivo) return;
                    cb.current(arrivati);
                    setRicevuti(arrivati.length);
                } catch (e) { alert("Ricezione file non riuscita: " + ((e as Error)?.message || e)); }
                // pulizia: file di staging dal bucket + riga della sessione
                try {
                    for (const f of files) {
                        const marker = "/qr-uploads/"; const i = String(f.url).indexOf(marker);
                        if (i >= 0) await supabase.storage.from("qr-uploads").remove([decodeURIComponent(String(f.url).slice(i + marker.length))]);
                    }
                } catch { /* staging orfano: scade da solo */ }
                try { await supabase.from("qr_uploads").delete().eq("token", token); } catch { /* idem */ }
                setTimeout(() => { if (vivo) closeQr(); }, 1600);
            }
        }, 2000);
        return () => { vivo = false; clearInterval(t); };
    }, [token, closeQr]);

    return { aperto, img, ricevuti, openQr, closeQr };
}

/** Modale col QR: markup del modale di Registra Vendita riscritto con le
 *  classi glass del tema (light incluso via globals.css). Portal sul body e
 *  z-3000: sopra le modali di pagina (es. dettaglio ticket z-[1100]), sotto
 *  le tendine SelectPersona (z-4000). */
export function QrUploadModal({ qr, hint, esito }: { qr: ReturnType<typeof useQrUpload>; hint?: string; esito?: (n: number) => string }) {
    if (!qr.aperto || typeof document === "undefined") return null;
    return createPortal(
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) qr.closeQr(); }}>
            <div className="glass-panel w-full max-w-sm p-6 text-center space-y-3 shadow-2xl border-white/10">
                <div className="flex items-center justify-between gap-3">
                    <div className="text-base font-extrabold text-white">📱 Carica dal telefono</div>
                    <button onClick={qr.closeQr} className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white text-lg leading-none">✕</button>
                </div>
                {qr.ricevuti != null ? (
                    <div className="py-6">
                        <div className="text-5xl mb-2">✅</div>
                        <div className="text-base font-extrabold text-emerald-400">Ricevuto!</div>
                        <div className="text-xs text-slate-400 mt-1.5">{esito ? esito(qr.ricevuti) : `${qr.ricevuti} file aggiunt${qr.ricevuti === 1 ? "o" : "i"} agli allegati.`}</div>
                    </div>
                ) : (
                    <>
                        <p className="text-xs text-slate-400">{hint || "Inquadra il QR con la fotocamera del telefono e carica il PDF — se scansioni più pagine verranno unite in un unico file."}</p>
                        {qr.img
                            ? <img src={qr.img} alt="QR" className="w-[216px] h-[216px] rounded-xl bg-white p-2 box-border block mx-auto" />
                            : <div className="w-[216px] h-[216px] mx-auto flex items-center justify-center text-slate-500 text-sm">Genero…</div>}
                        <div className="text-[11px] text-amber-400 flex items-center justify-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-pulse" />In attesa della scansione…
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body);
}
