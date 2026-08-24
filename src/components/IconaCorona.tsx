/**
 * CORONE del MASTER (Luca 24/08: «una bella corona stilizzata, non una di
 * quelle semplici»).
 *  - CoronaIcona: line-art in currentColor, in linea con le icone lucide
 *    della sidebar (stesso peso di tratto, gemme sulle punte e sulla banda).
 *  - CoronaOro: la versione ricca per la parte destra (card dell'hub e hero
 *    della sezione Master): oro sfumato, gemme colorate, bagliore morbido.
 */
import React from "react";

export function CoronaIcona({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
            strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
            <path d="M4.6 15.5 L3.5 8.9 Q3.4 8.1 4.1 8.6 L7.9 11.2 Q8.5 11.6 8.8 10.9 L11.3 5.9 Q12 4.6 12.7 5.9 L15.2 10.9 Q15.5 11.6 16.1 11.2 L19.9 8.6 Q20.6 8.1 20.5 8.9 L19.4 15.5 Z" />
            <path d="M5.4 18 h13.2 q.9 0 .9 .9 v.2 q0 .9 -.9 .9 H5.4 q-.9 0 -.9 -.9 v-.2 q0 -.9 .9 -.9 Z" />
            <circle cx="3.8" cy="7.6" r="1" />
            <circle cx="12" cy="4.6" r="1.1" />
            <circle cx="20.2" cy="7.6" r="1" />
            <circle cx="12" cy="19" r="0.9" />
        </svg>
    );
}

export function CoronaOro({ h = 36, className }: { h?: number; className?: string }) {
    return (
        <svg viewBox="0 0 48 42" width={h * 48 / 42} height={h} className={className} aria-hidden
            style={{ display: "inline-block", verticalAlign: "middle", filter: "drop-shadow(0 0 7px rgba(251,191,36,.45))" }}>
            <defs>
                <linearGradient id="tfCorOro" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fde68a" />
                    <stop offset=".55" stopColor="#f5b425" />
                    <stop offset="1" stopColor="#c07b10" />
                </linearGradient>
                <linearGradient id="tfCorBanda" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#f3c04b" />
                    <stop offset="1" stopColor="#9a5f0b" />
                </linearGradient>
                <radialGradient id="tfCorViola" cx=".35" cy=".3" r="1">
                    <stop offset="0" stopColor="#f0abfc" />
                    <stop offset="1" stopColor="#86198f" />
                </radialGradient>
                <radialGradient id="tfCorRubino" cx=".35" cy=".3" r="1">
                    <stop offset="0" stopColor="#fca5a5" />
                    <stop offset="1" stopColor="#b91c1c" />
                </radialGradient>
                <radialGradient id="tfCorZaffiro" cx=".35" cy=".3" r="1">
                    <stop offset="0" stopColor="#93c5fd" />
                    <stop offset="1" stopColor="#1d4ed8" />
                </radialGradient>
            </defs>
            {/* corpo a tre punte, morbido */}
            <path d="M7 30 L4.6 13.2 Q4.4 11.2 6.2 12.4 L13.6 17.6 Q14.7 18.3 15.3 17 L22.5 5.4 Q24 3 25.5 5.4 L32.7 17 Q33.3 18.3 34.4 17.6 L41.8 12.4 Q43.6 11.2 43.4 13.2 L41 30 Z"
                fill="url(#tfCorOro)" stroke="#92400e" strokeWidth="1.1" strokeLinejoin="round" />
            {/* riflesso */}
            <path d="M10 27.5 L8.6 15.6 L13.4 19 Q15.2 20.2 16.3 18.2 L21 10.6 L20 27.5 Z" fill="#fff7d6" opacity=".28" />
            {/* banda decorata */}
            <path d="M7.4 30 h33.2 q1.6 0 1.6 1.6 v3.4 q0 1.6 -1.6 1.6 H7.4 q-1.6 0 -1.6 -1.6 v-3.4 q0 -1.6 1.6 -1.6 Z"
                fill="url(#tfCorBanda)" stroke="#92400e" strokeWidth="1.1" />
            <circle cx="12.5" cy="33.3" r="1.1" fill="#fde68a" opacity=".9" />
            <circle cx="35.5" cy="33.3" r="1.1" fill="#fde68a" opacity=".9" />
            {/* gemma centrale a rombo sulla banda */}
            <path d="M24 30.9 L26.9 33.3 L24 35.7 L21.1 33.3 Z" fill="url(#tfCorViola)" stroke="#581c87" strokeWidth=".8" />
            {/* gemme sulle punte */}
            <circle cx="5.4" cy="11.6" r="2" fill="url(#tfCorRubino)" stroke="#7f1d1d" strokeWidth=".8" />
            <circle cx="24" cy="4.4" r="2.3" fill="url(#tfCorViola)" stroke="#581c87" strokeWidth=".8" />
            <circle cx="42.6" cy="11.6" r="2" fill="url(#tfCorZaffiro)" stroke="#1e3a8a" strokeWidth=".8" />
            {/* scintilla */}
            <path d="M31.5 8.2 l.7 1.7 1.7 .7 -1.7 .7 -.7 1.7 -.7 -1.7 -1.7 -.7 1.7 -.7 Z" fill="#fffbeb" opacity=".9" />
        </svg>
    );
}
