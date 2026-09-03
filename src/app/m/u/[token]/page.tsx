// @ts-nocheck
"use client";

// Pagina PUBBLICA (nessun login) aperta dal telefono col QR del form. Regole
// definite da Francesco (29/07):
//  • DOCUMENTI (kind "foto"): SOLO foto (camera o galleria), una o piu'. NESSUN
//    ritaglio: la foto resta intera. Compressione/conversione a JPEG ottimizzato.
//    -> ogni foto e' un allegato immagine.
//  • CONTRATTI / ALTRO (kind "doc"): due modalita'.
//     - "Allega Foto": foto INTERE (nessun ritaglio), unite in UN PDF.
//     - "Scansiona in PDF": scanner vero — rileva il foglio e RITAGLIA lo sfondo,
//       piu' pagine in un PDF. Il rilevamento e' assistito: si regolano i 4
//       angoli a mano (come le app scanner) e poi si raddrizza/ritaglia.
// I file finiscono nel bucket qr-uploads e nell'array qr_uploads.files; il
// desktop fa polling e li tira negli allegati.
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PDFDocument } from "pdf-lib";

const LABEL = { documento: "Documenti", contratti: "Contratti", altro: "Altro", fattura: "Fattura", documento_usato: "Documento d'identità (usato)", dichiarazione_usato: "Dichiarazione di vendita (usato)", disdetta: "Modulo di disdetta", ddt_magazzino: "Documento di trasporto (carico merce)" };

// ── immagini ──────────────────────────────────────────────────────────
function blobToImg(blob) {
    return new Promise((res, rej) => { const u = URL.createObjectURL(blob); const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
}
function imgToCanvas(img) {
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0); return c;
}
async function canvasToJpeg(canvas, maxDim = 2400, q = 0.82) {
    let w = canvas.width, h = canvas.height; const m = Math.max(w, h);
    if (m > maxDim) { const s = maxDim / m; const c2 = document.createElement("canvas"); c2.width = Math.round(w * s); c2.height = Math.round(h * s); c2.getContext("2d").drawImage(canvas, 0, 0, c2.width, c2.height); canvas = c2; }
    return await new Promise(res => canvas.toBlob(b => res(b), "image/jpeg", q));
}
// foto INTERA compressa+convertita a JPEG (niente ritaglio) — per Documenti e "Allega Foto"
async function comprimiIntera(blob) {
    const img = await blobToImg(blob);
    try { return await canvasToJpeg(imgToCanvas(img), 2400, 0.82); } finally { URL.revokeObjectURL(img.src); }
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

// ── scanner (OpenCV + jscanify), solo per la modalita' "Scansiona in PDF" ──
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
    scannerReady = Promise.race([carica, new Promise((_, rej) => setTimeout(() => rej(new Error("scanner timeout")), 25000))]);
    scannerReady.catch(() => { scannerReady = null; });
    return scannerReady;
}
// angoli rilevati automaticamente (normalizzati 0..1) come punto di partenza;
// se non rileva nulla, un rettangolo di default che l'utente aggiusta.
async function angoliIniziali(canvas) {
    const def = [{ x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 }, { x: 0.92, y: 0.92 }, { x: 0.08, y: 0.92 }];
    try {
        const scanner = new window.jscanify();
        const contour = scanner.findPaperContour(window.cv.imread(canvas));
        const c = scanner.getCornerPoints(contour);
        if (!c || !c.topLeftCorner) return def;
        const W = canvas.width, H = canvas.height;
        const n = (p) => ({ x: Math.min(1, Math.max(0, p.x / W)), y: Math.min(1, Math.max(0, p.y / H)) });
        return [n(c.topLeftCorner), n(c.topRightCorner), n(c.bottomRightCorner), n(c.bottomLeftCorner)];
    } catch { return def; }
}
// ritaglia+raddrizza dai 4 angoli (normalizzati) via jscanify.extractPaper
async function ritagliaConAngoli(canvas, corners) {
    const W = canvas.width, H = canvas.height;
    const pt = corners.map(c => ({ x: c.x * W, y: c.y * H }));
    const cp = { topLeftCorner: pt[0], topRightCorner: pt[1], bottomRightCorner: pt[2], bottomLeftCorner: pt[3] };
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const outW = Math.round(Math.max(d(pt[0], pt[1]), d(pt[3], pt[2])));
    const outH = Math.round(Math.max(d(pt[0], pt[3]), d(pt[1], pt[2])));
    const scanner = new window.jscanify();
    const out = scanner.extractPaper(canvas, Math.max(80, outW), Math.max(80, outH), cp);
    return await canvasToJpeg(out, 2200, 0.85);
}

export default function MobileUploadPage() {
    const params = useParams();
    const token = String(params?.token || "");
    const [sess, setSess] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [done, setDone] = useState(false);
    const [mode, setMode] = useState("photo");      // per kind "doc": photo | scan
    const [busy, setBusy] = useState("");           // "" | "elaboro" | "scanner" | "invio"
    const [shots, setShots] = useState([]);         // foto INTERE {url,blob} (Documenti / Allega Foto)
    const [scanPages, setScanPages] = useState([]); // pagine ritagliate {url,blob} (Scansiona PDF)
    const [pickedPdf, setPickedPdf] = useState(null);
    const [editing, setEditing] = useState(null);   // editor angoli: {url,canvas,corners:[{x,y}×4]}
    const camRef = useRef(null), galRef = useRef(null), scanRef = useRef(null), pdfRef = useRef(null);

    useEffect(() => {
        (async () => {
            if (!token) { setErr("Link non valido."); setLoading(false); return; }
            const data = await fetch(`/api/qr/${encodeURIComponent(token)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => j?.sessione || null).catch(() => null);
            if (!data) { setErr("Sessione non trovata o annullata."); setLoading(false); return; }
            if (new Date(data.expires_at) < new Date()) { setErr("QR scaduto. Rigeneralo dal computer."); setLoading(false); return; }
            if (data.status === "caricato") setDone(true);
            setSess(data); setLoading(false);
        })();
    }, [token]);

    const isFoto = sess?.kind === "foto";      // DOCUMENTI: solo foto
    const label = LABEL[sess?.box_type] || "Allegato";

    // aggiunge una o piu' FOTO INTERE (nessun ritaglio, solo compressione)
    const aggiungiFoto = async (files) => {
        setBusy("elaboro");
        try {
            for (const f of Array.from(files || [])) {
                const b = await comprimiIntera(f);
                setShots(p => [...p, { url: URL.createObjectURL(b), blob: b }]);
            }
        } finally { setBusy(""); }
    };
    // apre l'editor angoli per una pagina da scansionare
    const apriScanner = async (f) => {
        setBusy("scanner");
        try {
            await preparaScanner();
            const img = await blobToImg(f); const canvas = imgToCanvas(img); URL.revokeObjectURL(img.src);
            const corners = await angoliIniziali(canvas);
            setEditing({ url: canvas.toDataURL("image/jpeg", 0.7), canvas, corners });
        } catch {
            alert("Scanner non disponibile (connessione lenta?). Usa 'Allega Foto' oppure scegli un PDF.");
        } finally { setBusy(""); }
    };
    const confermaRitaglio = async () => {
        if (!editing) return;
        setBusy("elaboro");
        try {
            const b = await ritagliaConAngoli(editing.canvas, editing.corners);
            setScanPages(p => [...p, { url: URL.createObjectURL(b), blob: b }]);
            setEditing(null);
        } catch (e) { alert("Ritaglio non riuscito: " + (e?.message || e)); }
        finally { setBusy(""); }
    };

    const invia = async () => {
        if (busy) return;
        setBusy("invio");
        try {
            // costruisci l'elenco dei blob+nomi+mime da caricare
            let items = [];
            if (isFoto) {
                if (!shots.length) { setBusy(""); return; }
                items = shots.map((s, i) => ({ blob: s.blob, name: `${sess.box_type}-${i + 1}.jpg`, mime: "image/jpeg" }));
            } else if (mode === "scan") {
                if (pickedPdf) items = [{ blob: pickedPdf, name: pickedPdf.name.toLowerCase().endsWith(".pdf") ? pickedPdf.name : `${sess.box_type}.pdf`, mime: "application/pdf" }];
                else if (scanPages.length) items = [{ blob: await immaginiInPdf(scanPages.map(p => p.blob)), name: `${sess.box_type}.pdf`, mime: "application/pdf" }];
            } else { // Allega Foto -> PDF di foto intere
                if (!shots.length) { setBusy(""); return; }
                items = [{ blob: await immaginiInPdf(shots.map(s => s.blob)), name: `${sess.box_type}.pdf`, mime: "application/pdf" }];
            }
            if (!items.length) { setBusy(""); return; }
            const files = [];
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                const path = `${token}/${Date.now()}-${i}-${it.name}`;
                // NIENTE upsert (Luca 28/08, invio bloccato dal telefono del
                // cliente): "sovrascrivi se esiste" chiede al database anche il
                // permesso di MODIFICARE file già caricati — che agli ospiti non
                // diamo, o chiunque potrebbe rimpiazzare il documento di un
                // altro. Qui non serve: il nome porta l'orario al millisecondo,
                // due caricamenti non collidono mai.
                const { error } = await supabase.storage.from("qr-uploads").upload(path, it.blob, { contentType: it.mime });
                if (error) throw error;
                const { data: pub } = supabase.storage.from("qr-uploads").getPublicUrl(path);
                files.push({ url: pub?.publicUrl, name: it.name, mime: it.mime });
            }
            const _up = await fetch(`/api/qr/${encodeURIComponent(token)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "caricato", files }) }).then((r) => r.json()).catch(() => ({ error: "rete" }));
                const upErr = _up?.error ? { message: _up.error } : null;
            if (upErr) throw upErr;
            setDone(true);
        } catch (e) { alert("Invio non riuscito: " + (e?.message || e)); }
        finally { setBusy(""); }
    };

    // flex:1 + width:100% -> il layout radice avvolge tutto in un flex-row; senza
    // questo la pagina resta larga quanto il contenuto e a destra si vede lo sfondo.
    const wrap = { flex: 1, width: "100%", minHeight: "100dvh", background: "#0b0d14", color: "#e2e8f0", fontFamily: "system-ui,sans-serif", padding: "22px 16px", boxSizing: "border-box" };
    if (loading) return <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center" }}>Carico…</div>;
    if (err) return <div style={wrap}><div style={{ maxWidth: 420, margin: "40px auto", textAlign: "center" }}><div style={{ fontSize: 42, marginBottom: 12 }}>⚠️</div><div style={{ fontSize: 16, fontWeight: 700 }}>{err}</div></div></div>;
    if (done) return <div style={wrap}><div style={{ maxWidth: 420, margin: "60px auto", textAlign: "center" }}><div style={{ fontSize: 56, marginBottom: 12 }}>✅</div><div style={{ fontSize: 20, fontWeight: 800, color: "#34d399" }}>Inviato!</div><div style={{ fontSize: 14, color: "#94a3b8", marginTop: 8 }}>Torna al computer: l'allegato è nel form.<br />Puoi chiudere questa pagina.</div></div></div>;

    // ── editor angoli (scanner) ──
    if (editing) return <CornerEditor editing={editing} setEditing={setEditing} onConfirm={confermaRitaglio} busy={busy} />;

    const btn = { display: "block", width: "100%", padding: "15px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 800, cursor: "pointer", marginTop: 10 };
    const tab = (on) => ({ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid " + (on ? "#22d3ee" : "rgba(255,255,255,.12)"), background: on ? "rgba(34,211,238,.15)" : "rgba(255,255,255,.03)", color: on ? "#67e8f9" : "#94a3b8", fontSize: 14, fontWeight: 800, cursor: "pointer" });
    const thumbGrid = (items, remove) => (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 8 }}>
            {items.map((p, i) => (
                <div key={i} style={{ position: "relative" }}>
                    <img src={p.url} alt="" style={{ width: "100%", height: 96, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,.1)" }} />
                    <span style={{ position: "absolute", top: 2, left: 4, fontSize: 11, fontWeight: 800, color: "#fff", textShadow: "0 1px 2px #000" }}>{i + 1}</span>
                    <button onClick={() => remove(i)} style={{ position: "absolute", top: 2, right: 2, width: 22, height: 22, borderRadius: 11, border: "none", background: "rgba(220,38,38,.9)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>✕</button>
                </div>
            ))}
        </div>
    );

    const canSend = isFoto ? shots.length > 0 : (mode === "scan" ? (!!pickedPdf || scanPages.length > 0) : shots.length > 0);

    return (
        <div style={wrap}>
            <div style={{ maxWidth: 460, margin: "0 auto" }}>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 12, letterSpacing: 1, color: "#22d3ee", fontWeight: 700, textTransform: "uppercase" }}>Carica dal telefono</div>
                    <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{label}</div>
                </div>

                {/* input nascosti */}
                <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { if (e.target.files?.length) aggiungiFoto(e.target.files); e.currentTarget.value = ""; }} />
                <input ref={galRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => { if (e.target.files?.length) aggiungiFoto(e.target.files); e.currentTarget.value = ""; }} />
                <input ref={scanRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) apriScanner(f); e.currentTarget.value = ""; }} />
                <input ref={pdfRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) { setPickedPdf(f); setScanPages([]); } e.currentTarget.value = ""; }} />

                {isFoto ? (
                    /* DOCUMENTI: solo foto, nessun ritaglio, una o piu' */
                    <>
                        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12, textAlign: "center" }}>Scatta una o più foto (restano intere, senza ritaglio) o scegline dalla galleria.</div>
                        {shots.length > 0 && thumbGrid(shots, i => setShots(p => p.filter((_, j) => j !== i)))}
                        <button onClick={() => camRef.current?.click()} disabled={!!busy} style={{ ...btn, background: "#0e7490", color: "#fff", opacity: busy ? .6 : 1 }}>{busy === "elaboro" ? "Elaboro…" : "📷 Scatta foto"}</button>
                        <button onClick={() => galRef.current?.click()} disabled={!!busy} style={{ ...btn, background: "rgba(255,255,255,.06)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,.12)" }}>🖼️ Dalla galleria</button>
                    </>
                ) : (
                    /* CONTRATTI / ALTRO: Allega Foto | Scansiona PDF */
                    <>
                        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                            <button onClick={() => setMode("photo")} style={tab(mode === "photo")}>📷 Allega Foto</button>
                            <button onClick={() => setMode("scan")} style={tab(mode === "scan")}>📄 Scansiona in PDF</button>
                        </div>
                        {mode === "photo" ? (
                            <>
                                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12, textAlign: "center" }}>Foto INTERE (senza ritaglio) unite in un unico PDF.</div>
                                {shots.length > 0 && thumbGrid(shots, i => setShots(p => p.filter((_, j) => j !== i)))}
                                <button onClick={() => camRef.current?.click()} disabled={!!busy} style={{ ...btn, background: "#0e7490", color: "#fff", opacity: busy ? .6 : 1 }}>{busy === "elaboro" ? "Elaboro…" : "📷 Aggiungi foto"}</button>
                                <button onClick={() => galRef.current?.click()} disabled={!!busy} style={{ ...btn, background: "rgba(255,255,255,.06)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,.12)" }}>🖼️ Dalla galleria</button>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12, textAlign: "center" }}>Scansiona le pagine: rileva il foglio e ritaglia lo sfondo (puoi correggere i 4 angoli). Più pagine → un PDF.</div>
                                {scanPages.length > 0 && !pickedPdf && thumbGrid(scanPages, i => setScanPages(p => p.filter((_, j) => j !== i)))}
                                {pickedPdf && (
                                    <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                        <span style={{ fontSize: 13 }}>📄 {pickedPdf.name}</span>
                                        <button onClick={() => setPickedPdf(null)} style={{ background: "none", border: "none", color: "#dc3545", fontWeight: 800, cursor: "pointer" }}>✕</button>
                                    </div>
                                )}
                                {!pickedPdf && <button onClick={() => scanRef.current?.click()} disabled={!!busy} style={{ ...btn, background: "#0e7490", color: "#fff", opacity: busy ? .6 : 1 }}>{busy === "scanner" ? "Apro lo scanner…" : "📷 Scansiona pagina"}</button>}
                                {scanPages.length === 0 && <button onClick={() => pdfRef.current?.click()} disabled={!!busy} style={{ ...btn, background: "rgba(255,255,255,.06)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,.12)" }}>📄 Scegli un PDF già pronto</button>}
                            </>
                        )}
                    </>
                )}

                <button onClick={invia} disabled={!canSend || !!busy} style={{ ...btn, marginTop: 16, background: canSend && !busy ? "linear-gradient(135deg,#10b981,#059669)" : "rgba(255,255,255,.08)", color: "#fff", opacity: canSend && !busy ? 1 : .5, cursor: canSend && !busy ? "pointer" : "not-allowed" }}>
                    {busy === "invio" ? "Invio in corso…" : "Invia"}
                </button>
            </div>
        </div>
    );
}

// ── Editor per regolare i 4 angoli del foglio prima del ritaglio ──
function CornerEditor({ editing, setEditing, onConfirm, busy }) {
    const boxRef = useRef(null);
    const [drag, setDrag] = useState(-1);
    const corners = editing.corners;
    const setCorner = (i, x, y) => setEditing(e => ({ ...e, corners: e.corners.map((c, j) => j === i ? { x, y } : c) }));
    const onMove = (clientX, clientY) => {
        if (drag < 0 || !boxRef.current) return;
        const r = boxRef.current.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
        const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
        setCorner(drag, x, y);
    };
    useEffect(() => {
        if (drag < 0) return;
        const mm = e => { const t = e.touches ? e.touches[0] : e; onMove(t.clientX, t.clientY); if (e.cancelable) e.preventDefault(); };
        const up = () => setDrag(-1);
        window.addEventListener("mousemove", mm); window.addEventListener("mouseup", up);
        window.addEventListener("touchmove", mm, { passive: false }); window.addEventListener("touchend", up);
        return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", up); window.removeEventListener("touchmove", mm); window.removeEventListener("touchend", up); };
    }, [drag]);
    const poly = corners.map(c => `${c.x * 100}% ${c.y * 100}%`).join(", ");
    const pts = corners.map(c => `${c.x * 100},${c.y * 100}`).join(" ");
    return (
        <div style={{ flex: 1, width: "100%", minHeight: "100dvh", background: "#0b0d14", color: "#e2e8f0", padding: "18px 14px", boxSizing: "border-box", fontFamily: "system-ui,sans-serif" }}>
            <div style={{ maxWidth: 460, margin: "0 auto" }}>
                <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Regola i bordi del foglio</div>
                <div style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>Trascina i 4 pallini sugli angoli del documento.</div>
                <div ref={boxRef} style={{ position: "relative", width: "100%", userSelect: "none", touchAction: "none", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,.12)" }}>
                    <img src={editing.url} alt="" draggable={false} style={{ width: "100%", display: "block" }} />
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                        <polygon points={pts} fill="rgba(34,211,238,0.18)" stroke="#22d3ee" strokeWidth="0.6" />
                    </svg>
                    {corners.map((c, i) => (
                        <div key={i}
                            onMouseDown={e => { e.preventDefault(); setDrag(i); }}
                            onTouchStart={e => { setDrag(i); }}
                            style={{ position: "absolute", left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: 30, height: 30, marginLeft: -15, marginTop: -15, borderRadius: "50%", background: "rgba(34,211,238,0.35)", border: "2px solid #22d3ee", boxShadow: "0 0 0 2px rgba(0,0,0,.35)", touchAction: "none" }} />
                    ))}
                </div>
                <button onClick={onConfirm} disabled={!!busy} style={{ display: "block", width: "100%", padding: 15, borderRadius: 12, border: "none", background: busy ? "rgba(255,255,255,.1)" : "linear-gradient(135deg,#10b981,#059669)", color: "#fff", fontSize: 15, fontWeight: 800, marginTop: 14, cursor: busy ? "default" : "pointer" }}>{busy ? "Ritaglio…" : "✓ Conferma pagina"}</button>
                <button onClick={() => setEditing(null)} disabled={!!busy} style={{ display: "block", width: "100%", padding: 13, borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", color: "#94a3b8", fontSize: 14, fontWeight: 700, marginTop: 8, cursor: "pointer" }}>Annulla</button>
            </div>
        </div>
    );
}
