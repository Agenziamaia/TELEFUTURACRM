// @ts-nocheck
"use client";

// Pagina PUBBLICA (nessun login) aperta dal telefono scansionando il QR mostrato
// nel form di registrazione. Carica il file nel bucket qr-uploads e aggiorna la
// riga qr_uploads; il desktop fa polling e lo tira dentro il form.
//
// Due modalita', entrambe disponibili per ogni casella (richiesta Rahib 29/07):
//   📷 Foto  -> una foto (PNG/JPEG), ritagliata automaticamente al documento.
//   📄 PDF   -> piu' pagine scansionate (ognuna ritagliata) unite in UN PDF,
//               oppure un PDF gia' pronto (es. dallo scanner del telefono).
// Il ritaglio "tipo scanner" (rileva il foglio e raddrizza) usa jscanify+OpenCV,
// caricati on-demand da CDN; se non rileva il foglio, tiene la foto intera.
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PDFDocument } from "pdf-lib";

const LABEL = { documento: "Documento", contratti: "Contratti", altro: "Altro", fattura: "Fattura" };

// ── ritaglio documento (scanner-like) ────────────────────────────────
let scannerReady = null;
function caricaScript(src) {
    return new Promise((res, rej) => {
        if ([...document.scripts].some(s => s.src === src)) return res();
        const s = document.createElement("script"); s.src = src; s.async = true;
        s.onload = () => res(); s.onerror = () => rej(new Error("load " + src));
        document.head.appendChild(s);
    });
}
async function preparaScanner() {
    if (scannerReady) return scannerReady;
    const carica = (async () => {
        if (!window.cv || !window.cv.Mat) {
            await caricaScript("https://docs.opencv.org/4.8.0/opencv.js");
            await new Promise((res) => {
                const ok = () => window.cv && window.cv.Mat;
                if (ok()) return res();
                if (window.cv && typeof window.cv.then === "function") { window.cv.then(() => res()); return; }
                const iv = setInterval(() => { if (ok()) { clearInterval(iv); res(); } }, 120);
                try { window.cv = window.cv || {}; window.cv.onRuntimeInitialized = () => { clearInterval(iv); res(); }; } catch { }
            });
        }
        if (!window.jscanify) await caricaScript("https://cdn.jsdelivr.net/gh/puffinsoft/jscanify@master/src/jscanify.js");
    })();
    // se il CDN e' lento/irraggiungibile non restiamo appesi: si torna alla foto intera
    scannerReady = Promise.race([carica, new Promise((_, rej) => setTimeout(() => rej(new Error("scanner timeout")), 25000))]);
    scannerReady.catch(() => { scannerReady = null; });   // permetti un nuovo tentativo
    return scannerReady;
}
function blobToImg(blob) {
    return new Promise((res, rej) => { const u = URL.createObjectURL(blob); const i = new Image(); i.onload = () => { res(i); }; i.onerror = rej; i.src = u; });
}
function imgToCanvas(img) {
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0); return c;
}
async function canvasToJpeg(canvas, maxDim = 2200, q = 0.85) {
    let w = canvas.width, h = canvas.height; const m = Math.max(w, h);
    if (m > maxDim) { const s = maxDim / m; const c2 = document.createElement("canvas"); c2.width = Math.round(w * s); c2.height = Math.round(h * s); c2.getContext("2d").drawImage(canvas, 0, 0, c2.width, c2.height); canvas = c2; }
    return await new Promise(res => canvas.toBlob(b => res(b), "image/jpeg", q));
}
// ridimensiona+comprime una foto intera (fallback se non rileva il documento)
async function comprimiJpeg(blob, maxDim = 2000, q = 0.82) {
    const img = await blobToImg(blob);
    try { return await canvasToJpeg(imgToCanvas(img), maxDim, q); } finally { URL.revokeObjectURL(img.src); }
}
// ritaglia al foglio e raddrizza; se non lo trova, foto intera compressa
async function ritagliaDocumento(blob) {
    let img;
    try {
        await preparaScanner();
        img = await blobToImg(blob);
        const canvas = imgToCanvas(img);
        const scanner = new window.jscanify();
        let corners = null;
        try { const contour = scanner.findPaperContour(window.cv.imread(canvas)); corners = scanner.getCornerPoints(contour); } catch { }
        const c = corners;
        if (!c || !c.topLeftCorner) throw new Error("no doc");
        const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const w = Math.round(Math.max(d(c.topLeftCorner, c.topRightCorner), d(c.bottomLeftCorner, c.bottomRightCorner)));
        const h = Math.round(Math.max(d(c.topLeftCorner, c.bottomLeftCorner), d(c.topRightCorner, c.bottomRightCorner)));
        if (w < 100 || h < 100) throw new Error("too small");
        const out = scanner.extractPaper(canvas, w, h, corners);   // canvas ritagliato+raddrizzato
        return await canvasToJpeg(out, 2200, 0.85);
    } catch {
        return await comprimiJpeg(blob, 2200, 0.85);
    } finally { if (img) URL.revokeObjectURL(img.src); }
}
async function immaginiInPdf(blobs) {
    const pdf = await PDFDocument.create();
    for (const b of blobs) {
        const bytes = new Uint8Array(await b.arrayBuffer());
        const im = await pdf.embedJpg(bytes);
        const page = pdf.addPage([im.width, im.height]);
        page.drawImage(im, { x: 0, y: 0, width: im.width, height: im.height });
    }
    return new Blob([await pdf.save()], { type: "application/pdf" });
}

export default function MobileUploadPage() {
    const params = useParams();
    const token = String(params?.token || "");
    const [sess, setSess] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [done, setDone] = useState(false);
    const [mode, setMode] = useState("foto");         // foto | pdf
    const [busy, setBusy] = useState("");             // "" | "elaboro" | "invio"
    const [foto, setFoto] = useState(null);           // {url,blob}
    const [pages, setPages] = useState([]);           // [{url,blob}] pagine PDF
    const [pickedPdf, setPickedPdf] = useState(null); // File PDF pronto
    const camRef = useRef(null), pdfRef = useRef(null);

    useEffect(() => {
        (async () => {
            if (!token) { setErr("Link non valido."); setLoading(false); return; }
            const { data } = await supabase.from("qr_uploads").select("*").eq("token", token).maybeSingle();
            if (!data) { setErr("Sessione non trovata o annullata."); setLoading(false); return; }
            if (new Date(data.expires_at) < new Date()) { setErr("QR scaduto. Rigeneralo dal computer."); setLoading(false); return; }
            if (data.status === "caricato") setDone(true);
            setSess(data); setMode(data.kind === "pdf" ? "pdf" : "foto"); setLoading(false);
        })();
    }, [token]);

    const label = LABEL[sess?.box_type] || "Allegato";

    const scattaFoto = async (f) => {
        setBusy("elaboro");
        try { const b = await ritagliaDocumento(f); setFoto({ url: URL.createObjectURL(b), blob: b }); }
        finally { setBusy(""); }
    };
    const aggiungiPagina = async (f) => {
        setBusy("elaboro");
        try { const b = await ritagliaDocumento(f); setPages(p => [...p, { url: URL.createObjectURL(b), blob: b }]); }
        finally { setBusy(""); }
    };

    const invia = async () => {
        if (busy) return;
        setBusy("invio");
        try {
            let blob, fileName, mime;
            if (mode === "foto") {
                if (!foto) { setBusy(""); return; }
                blob = foto.blob; fileName = `${sess.box_type}.jpg`; mime = "image/jpeg";
            } else if (pickedPdf) {
                blob = pickedPdf; fileName = pickedPdf.name.toLowerCase().endsWith(".pdf") ? pickedPdf.name : `${sess.box_type}.pdf`; mime = "application/pdf";
            } else if (pages.length) {
                blob = await immaginiInPdf(pages.map(p => p.blob)); fileName = `${sess.box_type}.pdf`; mime = "application/pdf";
            } else { setBusy(""); return; }
            const path = `${token}/${Date.now()}-${fileName}`;
            const { error } = await supabase.storage.from("qr-uploads").upload(path, blob, { contentType: mime, upsert: true });
            if (error) throw error;
            const { data: pub } = supabase.storage.from("qr-uploads").getPublicUrl(path);
            const { error: upErr } = await supabase.from("qr_uploads").update({ status: "caricato", file_url: pub?.publicUrl, file_name: fileName, file_mime: mime }).eq("token", token);
            if (upErr) throw upErr;
            setDone(true);
        } catch (e) { alert("Invio non riuscito: " + (e?.message || e)); }
        finally { setBusy(""); }
    };

    const wrap = { minHeight: "100dvh", background: "#0b0d14", color: "#e2e8f0", fontFamily: "system-ui,sans-serif", padding: "22px 16px", boxSizing: "border-box" };
    if (loading) return <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center" }}>Carico…</div>;
    if (err) return <div style={wrap}><div style={{ maxWidth: 420, margin: "40px auto", textAlign: "center" }}><div style={{ fontSize: 42, marginBottom: 12 }}>⚠️</div><div style={{ fontSize: 16, fontWeight: 700 }}>{err}</div></div></div>;
    if (done) return <div style={wrap}><div style={{ maxWidth: 420, margin: "60px auto", textAlign: "center" }}><div style={{ fontSize: 56, marginBottom: 12 }}>✅</div><div style={{ fontSize: 20, fontWeight: 800, color: "#34d399" }}>File inviato!</div><div style={{ fontSize: 14, color: "#94a3b8", marginTop: 8 }}>Torna al computer: l'allegato è stato aggiunto al form.<br />Puoi chiudere questa pagina.</div></div></div>;

    const canSend = mode === "foto" ? !!foto : (!!pickedPdf || pages.length > 0);
    const btn = { display: "block", width: "100%", padding: "15px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 800, cursor: "pointer", marginTop: 10 };
    const tab = (on) => ({ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid " + (on ? "#22d3ee" : "rgba(255,255,255,.12)"), background: on ? "rgba(34,211,238,.15)" : "rgba(255,255,255,.03)", color: on ? "#67e8f9" : "#94a3b8", fontSize: 14, fontWeight: 800, cursor: "pointer" });

    return (
        <div style={wrap}>
            <div style={{ maxWidth: 460, margin: "0 auto" }}>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 12, letterSpacing: 1, color: "#22d3ee", fontWeight: 700, textTransform: "uppercase" }}>Carica dal telefono</div>
                    <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{label}</div>
                </div>

                {/* scelta modalita': foto o PDF, sempre entrambe */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <button onClick={() => setMode("foto")} style={tab(mode === "foto")}>📷 Foto</button>
                    <button onClick={() => setMode("pdf")} style={tab(mode === "pdf")}>📄 Documento PDF</button>
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12, textAlign: "center" }}>
                    {mode === "foto"
                        ? "Scatta una foto: viene ritagliata automaticamente al documento."
                        : "Scansiona le pagine (ritagliate e unite in un PDF), oppure scegli un PDF già pronto."}
                </div>

                <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { mode === "foto" ? scattaFoto(f) : aggiungiPagina(f); } e.currentTarget.value = ""; }} />
                <input ref={pdfRef} type="file" accept="application/pdf" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPickedPdf(f); setPages([]); } e.currentTarget.value = ""; }} />

                {/* anteprime */}
                {mode === "foto" && foto && <img src={foto.url} alt="" style={{ width: "100%", borderRadius: 12, marginBottom: 8, border: "1px solid rgba(255,255,255,.1)" }} />}
                {mode === "pdf" && pages.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 8 }}>
                        {pages.map((p, i) => (
                            <div key={i} style={{ position: "relative" }}>
                                <img src={p.url} alt="" style={{ width: "100%", height: 96, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,.1)" }} />
                                <span style={{ position: "absolute", top: 2, left: 4, fontSize: 11, fontWeight: 800, color: "#fff", textShadow: "0 1px 2px #000" }}>{i + 1}</span>
                                <button onClick={() => setPages(pp => pp.filter((_, j) => j !== i))} style={{ position: "absolute", top: 2, right: 2, width: 22, height: 22, borderRadius: 11, border: "none", background: "rgba(220,38,38,.9)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>✕</button>
                            </div>
                        ))}
                    </div>
                )}
                {mode === "pdf" && pickedPdf && (
                    <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13 }}>📄 {pickedPdf.name}</span>
                        <button onClick={() => setPickedPdf(null)} style={{ background: "none", border: "none", color: "#dc3545", fontWeight: 800, cursor: "pointer" }}>✕</button>
                    </div>
                )}

                {/* azioni */}
                {mode === "foto" && (
                    <button onClick={() => camRef.current?.click()} disabled={!!busy} style={{ ...btn, background: "#0e7490", color: "#fff", opacity: busy ? .6 : 1 }}>
                        {busy === "elaboro" ? "Ritaglio del documento…" : (foto ? "📷 Rifai la foto" : "📷 Scatta foto")}
                    </button>
                )}
                {mode === "pdf" && !pickedPdf && (
                    <button onClick={() => camRef.current?.click()} disabled={!!busy} style={{ ...btn, background: "#0e7490", color: "#fff", opacity: busy ? .6 : 1 }}>
                        {busy === "elaboro" ? "Ritaglio del documento…" : "📷 Scansiona pagina"}
                    </button>
                )}
                {mode === "pdf" && pages.length === 0 && (
                    <button onClick={() => pdfRef.current?.click()} disabled={!!busy} style={{ ...btn, background: "rgba(255,255,255,.06)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,.12)" }}>
                        📄 Scegli un PDF già pronto
                    </button>
                )}

                <button onClick={invia} disabled={!canSend || !!busy} style={{ ...btn, background: canSend && !busy ? "linear-gradient(135deg,#10b981,#059669)" : "rgba(255,255,255,.08)", color: "#fff", opacity: canSend && !busy ? 1 : .5, cursor: canSend && !busy ? "pointer" : "not-allowed" }}>
                    {busy === "invio" ? "Invio in corso…" : `Invia${mode === "pdf" && pages.length > 1 ? ` (${pages.length} pagine → 1 PDF)` : ""}`}
                </button>
            </div>
        </div>
    );
}
