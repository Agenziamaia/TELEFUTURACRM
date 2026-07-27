// @ts-nocheck
"use client";

// Pagina PUBBLICA (nessun login) aperta dal telefono scansionando il QR mostrato
// nel form di registrazione. Carica il file nel bucket qr-uploads e aggiorna la
// riga qr_uploads; il desktop fa polling e lo tira dentro il form.
//  kind = "foto"  -> Documento: una foto (PNG/JPEG), compressa lato client.
//  kind = "pdf"   -> Contratti/Altro: piu' pagine scattate -> UN unico PDF,
//                    oppure un PDF gia' pronto scelto dai file.
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PDFDocument } from "pdf-lib";

const LABEL: Record<string, string> = { documento: "Documento", contratti: "Contratti", altro: "Altro", fattura: "Fattura" };

// Ridimensiona + comprime un'immagine a JPEG: alta qualita' ma file leggero.
async function comprimiJpeg(file: Blob, maxDim = 2000, quality = 0.82): Promise<Blob> {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
            const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
        });
        let w = img.naturalWidth, h = img.naturalHeight;
        const m = Math.max(w, h);
        if (m > maxDim) { const s = maxDim / m; w = Math.round(w * s); h = Math.round(h * s); }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d")!.drawImage(img, 0, 0, w, h);
        return await new Promise<Blob>((res) => c.toBlob((b) => res(b as Blob), "image/jpeg", quality));
    } finally { URL.revokeObjectURL(url); }
}

// Piu' immagini JPEG -> un unico PDF (una pagina per immagine).
async function immaginiInPdf(blobs: Blob[]): Promise<Blob> {
    const pdf = await PDFDocument.create();
    for (const b of blobs) {
        const bytes = new Uint8Array(await b.arrayBuffer());
        const img = await pdf.embedJpg(bytes);
        const page = pdf.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    return new Blob([await pdf.save()], { type: "application/pdf" });
}

export default function MobileUploadPage() {
    const params = useParams();
    const token = String((params as any)?.token || "");
    const [sess, setSess] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [pages, setPages] = useState<{ url: string; blob: Blob }[]>([]);   // pagine scattate (pdf)
    const [pickedPdf, setPickedPdf] = useState<File | null>(null);           // pdf gia' pronto
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const camRef = useRef<HTMLInputElement | null>(null);
    const pdfRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        (async () => {
            if (!token) { setErr("Link non valido."); setLoading(false); return; }
            const { data } = await supabase.from("qr_uploads").select("*").eq("token", token).maybeSingle();
            if (!data) { setErr("Sessione non trovata o annullata."); setLoading(false); return; }
            if (new Date(data.expires_at) < new Date()) { setErr("QR scaduto. Rigeneralo dal computer."); setLoading(false); return; }
            if (data.status === "caricato") setDone(true);
            setSess(data); setLoading(false);
        })();
    }, [token]);

    const isFoto = sess?.kind === "foto";
    const label = LABEL[sess?.box_type] || "Allegato";

    // aggiunge una pagina (foto) — per il PDF. Comprime subito.
    const aggiungiPagina = async (f: File) => {
        setBusy(true);
        try { const b = await comprimiJpeg(f, 2200, 0.85); setPages((p) => [...p, { url: URL.createObjectURL(b), blob: b }]); }
        finally { setBusy(false); }
    };
    // foto singola (documento)
    const [foto, setFoto] = useState<{ url: string; blob: Blob } | null>(null);
    const scegliFoto = async (f: File) => {
        setBusy(true);
        try { const b = await comprimiJpeg(f, 2000, 0.82); setFoto({ url: URL.createObjectURL(b), blob: b }); }
        finally { setBusy(false); }
    };

    const invia = async () => {
        if (busy) return;
        setBusy(true);
        try {
            let blob: Blob, fileName: string, mime: string;
            if (isFoto) {
                if (!foto) { setBusy(false); return; }
                blob = foto.blob; fileName = `${sess.box_type}.jpg`; mime = "image/jpeg";
            } else if (pickedPdf) {
                blob = pickedPdf; fileName = pickedPdf.name.endsWith(".pdf") ? pickedPdf.name : `${sess.box_type}.pdf`; mime = "application/pdf";
            } else if (pages.length) {
                blob = await immaginiInPdf(pages.map((p) => p.blob)); fileName = `${sess.box_type}.pdf`; mime = "application/pdf";
            } else { setBusy(false); return; }

            const path = `${token}/${Date.now()}-${fileName}`;
            const { error } = await supabase.storage.from("qr-uploads").upload(path, blob, { contentType: mime, upsert: true });
            if (error) throw error;
            const { data: pub } = supabase.storage.from("qr-uploads").getPublicUrl(path);
            const { error: upErr } = await supabase.from("qr_uploads")
                .update({ status: "caricato", file_url: pub?.publicUrl, file_name: fileName, file_mime: mime })
                .eq("token", token);
            if (upErr) throw upErr;
            setDone(true);
        } catch (e: any) {
            alert("Invio non riuscito: " + (e?.message || e));
        } finally { setBusy(false); }
    };

    const wrap: React.CSSProperties = { minHeight: "100dvh", background: "#0b0d14", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", padding: "24px 18px", boxSizing: "border-box" };

    if (loading) return <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center" }}>Carico…</div>;
    if (err) return <div style={wrap}><div style={{ maxWidth: 420, margin: "40px auto", textAlign: "center" }}><div style={{ fontSize: 42, marginBottom: 12 }}>⚠️</div><div style={{ fontSize: 16, fontWeight: 700 }}>{err}</div></div></div>;
    if (done) return <div style={wrap}><div style={{ maxWidth: 420, margin: "60px auto", textAlign: "center" }}><div style={{ fontSize: 56, marginBottom: 12 }}>✅</div><div style={{ fontSize: 20, fontWeight: 800, color: "#34d399" }}>File inviato!</div><div style={{ fontSize: 14, color: "#94a3b8", marginTop: 8 }}>Torna al computer: l'allegato è stato aggiunto al form.<br />Puoi chiudere questa pagina.</div></div></div>;

    const canSend = isFoto ? !!foto : (!!pickedPdf || pages.length > 0);
    const btn: React.CSSProperties = { display: "block", width: "100%", padding: "16px", borderRadius: 12, border: "none", fontSize: 16, fontWeight: 800, cursor: "pointer", marginTop: 12 };

    return (
        <div style={wrap}>
            <div style={{ maxWidth: 460, margin: "0 auto" }}>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                    <div style={{ fontSize: 12, letterSpacing: 1, color: "#22d3ee", fontWeight: 700, textTransform: "uppercase" }}>Carica dal telefono</div>
                    <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{label}</div>
                    <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>
                        {isFoto ? "Scatta o scegli una foto del documento." : "Scatta le pagine (verranno unite in un unico PDF) oppure scegli un PDF già pronto."}
                    </div>
                </div>

                {/* input nascosti */}
                <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { isFoto ? scegliFoto(f) : aggiungiPagina(f); } e.currentTarget.value = ""; }} />
                <input ref={pdfRef} type="file" accept="application/pdf" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPickedPdf(f); setPages([]); } e.currentTarget.value = ""; }} />

                {/* anteprime */}
                {isFoto && foto && (
                    <img src={foto.url} alt="" style={{ width: "100%", borderRadius: 12, marginBottom: 8, border: "1px solid rgba(255,255,255,.1)" }} />
                )}
                {!isFoto && pages.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 8 }}>
                        {pages.map((p, i) => (
                            <div key={i} style={{ position: "relative" }}>
                                <img src={p.url} alt="" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,.1)" }} />
                                <span style={{ position: "absolute", top: 2, left: 4, fontSize: 11, fontWeight: 800, color: "#fff", textShadow: "0 1px 2px #000" }}>{i + 1}</span>
                                <button onClick={() => setPages((pp) => pp.filter((_, j) => j !== i))} style={{ position: "absolute", top: 2, right: 2, width: 22, height: 22, borderRadius: 11, border: "none", background: "rgba(220,38,38,.9)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>✕</button>
                            </div>
                        ))}
                    </div>
                )}
                {!isFoto && pickedPdf && (
                    <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13 }}>📄 {pickedPdf.name}</span>
                        <button onClick={() => setPickedPdf(null)} style={{ background: "none", border: "none", color: "#dc3545", fontWeight: 800, cursor: "pointer" }}>✕</button>
                    </div>
                )}

                {/* azioni di acquisizione */}
                {!pickedPdf && (
                    <button onClick={() => camRef.current?.click()} disabled={busy} style={{ ...btn, background: "#0e7490", color: "#fff", opacity: busy ? .6 : 1 }}>
                        {busy ? "Elaboro…" : isFoto ? (foto ? "📷 Rifai la foto" : "📷 Scatta / scegli foto") : "📷 Aggiungi pagina"}
                    </button>
                )}
                {!isFoto && pages.length === 0 && (
                    <button onClick={() => pdfRef.current?.click()} disabled={busy} style={{ ...btn, background: "rgba(255,255,255,.06)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,.12)" }}>
                        📄 Scegli un PDF già pronto
                    </button>
                )}

                {/* invio */}
                <button onClick={invia} disabled={!canSend || busy} style={{ ...btn, background: canSend && !busy ? "linear-gradient(135deg,#10b981,#059669)" : "rgba(255,255,255,.08)", color: "#fff", opacity: canSend && !busy ? 1 : .5, cursor: canSend && !busy ? "pointer" : "not-allowed" }}>
                    {busy ? "Invio in corso…" : `Invia ${!isFoto && pages.length > 1 ? `(${pages.length} pagine → 1 PDF)` : ""}`}
                </button>
            </div>
        </div>
    );
}
