"use client";

// Anteprima immagine a schermo: cliccando una foto (allegati chat, documenti
// cliente) si apriva una scheda nuova del browser, facendo perdere il posto in
// cui si stava lavorando. Ora si apre qui sopra e si chiude con la X o con Esc.
import { useEffect } from "react";
import { X, Download } from "lucide-react";

export function ImageLightbox({
    src, alt, onClose,
}: { src: string; alt?: string; onClose: () => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        // niente scroll della pagina sotto mentre l'immagine e' aperta
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div className="relative" onClick={(e) => e.stopPropagation()}>
                <img
                    src={src}
                    alt={alt || ""}
                    className="max-w-[92vw] max-h-[88vh] object-contain rounded-xl shadow-2xl"
                />
                <div className="absolute -top-3 -right-3 flex gap-2">
                    <a
                        href={src}
                        target="_blank"
                        rel="noreferrer"
                        download
                        onClick={(e) => e.stopPropagation()}
                        title="Scarica"
                        className="w-9 h-9 rounded-full bg-[#161a26] border border-white/15 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <Download className="w-4 h-4" />
                    </a>
                    <button
                        type="button"
                        onClick={onClose}
                        title="Chiudi (Esc)"
                        className="w-9 h-9 rounded-full bg-[#161a26] border border-white/15 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                {alt && (
                    <p className="mt-2 text-center text-xs text-slate-400 truncate max-w-[92vw]">{alt}</p>
                )}
            </div>
        </div>
    );
}
