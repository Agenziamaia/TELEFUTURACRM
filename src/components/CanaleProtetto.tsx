"use client";

/* ═══ IL CODICE DAVANTI A UN CANALE PERSONALE ══════════════════════════════
   Nato per WhatsApp il 27/08 — «SOLO Sandra e Claudia devono avere un codice
   che quando aprono WhatsApp gli chiede, altrimenti non è possibile vederlo».
   Dal 31/08 vale anche per la POSTA: «è personale nei confronti di tutti e di
   eventuali ruoli che gestiscono quella persona».

   ⚠️ DUE CODICI, NON UNO. Si accendono e si azzerano separatamente: si può
   volere la posta sotto codice e WhatsApp no, o il contrario. Un codice unico
   avrebbe legato le due decisioni per sempre.

   Chi deve inserirlo lo decide la rotellina dei permessi (Chat → «WhatsApp
   Protetto» / «Posta Protetta»): non è cablato su dei nomi, così domani si
   accende o si spegne a chiunque senza toccare il codice sorgente.

   Il codice se lo scelgono LORO al primo ingresso e nessuno lo può rileggere:
   nel database c'è solo l'impronta bcrypt, e la tabella è chiusa anche alla
   chiave pubblica. Il confronto lo fa il database (`codice_verifica`), stesso
   identico modo in cui il CRM controlla le password. Se lo dimenticano, un
   admin lo AZZERA — su quel canale — e ne scelgono un altro.

   ⚠️ E IL CODICE NON È LA PROTEZIONE VERA. Da solo coprirebbe solo lo
   schermo: il dato resterebbe leggibile a chiunque interroghi il database.
   La protezione vera sta di là, nelle regole del database (`tf_wa_istanze`
   per i numeri, `tf_mie_caselle` per le caselle): con il lucchetto acceso, il
   canale personale sparisce a tutti tranne al titolare e all'admin. Questo
   componente è la porta; il muro è nel database.

   Si richiede A OGNI APERTURA: lo sblocco vive nello stato del componente,
   quindi uscire dalla sezione e rientrare rimette il lucchetto. Niente
   ricordi in memoria del browser — un codice che si ricorda da solo non
   protegge da un pc lasciato aperto.                                      */

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useRolePermissions } from "@/lib/usePermissions";
import { capAllowed, CAP_WA_CODICE, CAP_EMAIL_CODICE, WA_SECTION } from "@/lib/capabilities";
import { WhatsAppInbox } from "@/components/WhatsAppInbox";
import { EmailInbox } from "@/components/EmailInbox";
import { cn } from "@/utils";

export type Canale = "whatsapp" | "email";

/** Le parole cambiano col canale: è la stessa porta, ma chi la legge deve
 *  capire subito davanti a cosa si trova. */
const TESTI: Record<Canale, { nome: string; titolo: string; sotto: string; bottone: string; colore: string }> = {
    whatsapp: {
        nome: "WhatsApp",
        titolo: "WhatsApp è protetto",
        sotto: "Inserisci il tuo codice per vedere le conversazioni. Te lo richiede ogni volta che apri la sezione.",
        bottone: "Apri WhatsApp",
        colore: "emerald",
    },
    email: {
        nome: "la posta",
        titolo: "La tua posta è protetta",
        sotto: "Inserisci il tuo codice per aprire la casella. Te lo richiede ogni volta che entri nella sezione.",
        bottone: "Apri la posta",
        colore: "sky",
    },
};

/* Le classi di Tailwind devono comparire INTERE nel sorgente, altrimenti non
   finiscono nel foglio di stile: niente `bg-${colore}-600` costruito a pezzi. */
const TINTE = {
    emerald: { alone: "bg-emerald-500/10 border-emerald-500/20", icona: "text-emerald-400",
        bordo: "focus:border-emerald-500/50", pieno: "bg-emerald-600 hover:bg-emerald-500" },
    sky: { alone: "bg-sky-500/10 border-sky-500/20", icona: "text-sky-400",
        bordo: "focus:border-sky-500/50", pieno: "bg-sky-600 hover:bg-sky-500" },
} as const;

/** «a questa persona il CRM chiede il codice per questo canale?» — serve anche
 *  all'Omnichat, che monta le inbox per conto suo */
export function useCodiceCanale(canale: Canale) {
    const { user } = useAuth();
    const { perms, loaded } = useRolePermissions(user?.role, user?.grade, user?.id);
    const cap = canale === "email" ? CAP_EMAIL_CODICE : CAP_WA_CODICE;
    return { serve: capAllowed(user?.role, WA_SECTION, cap, perms), loaded, userId: user?.id || null };
}
/** il nome di prima, per non toccare chi già lo chiama */
export function useCodiceWhatsApp() { return useCodiceCanale("whatsapp"); }

export function WhatsAppProtetta(props: React.ComponentProps<typeof WhatsAppInbox>) {
    const { serve, loaded, userId } = useCodiceCanale("whatsapp");
    const [sbloccato, setSbloccato] = useState(false);
    // finché non so se il codice serve NON si monta l'inbox: montarla e poi
    // coprirla vorrebbe dire che le conversazioni sono già state scaricate
    if (!loaded) return <Attesa />;
    if (serve && !sbloccato) return <Lucchetto userId={userId} canale="whatsapp" onApri={() => setSbloccato(true)} />;
    return <WhatsAppInbox {...props} />;
}

export function PostaProtetta(props: React.ComponentProps<typeof EmailInbox>) {
    const { serve, loaded, userId } = useCodiceCanale("email");
    const [sbloccato, setSbloccato] = useState(false);
    if (!loaded) return <Attesa />;
    if (serve && !sbloccato) return <Lucchetto userId={userId} canale="email" onApri={() => setSbloccato(true)} />;
    return <EmailInbox {...props} />;
}

function Attesa() {
    return <div className="h-full flex items-center justify-center p-8 text-xs text-slate-500">Un attimo…</div>;
}

export function Lucchetto({ userId, onApri, canale = "whatsapp" }:
    { userId: string | null; onApri: () => void; canale?: Canale }) {
    const [stato, setStato] = useState<{ impostato: boolean; bloccatoFino: string | null } | null>(null);
    const [codice, setCodice] = useState("");
    const [conferma, setConferma] = useState("");
    const [errore, setErrore] = useState<string | null>(null);
    const [occupato, setOccupato] = useState(false);
    const [adesso, setAdesso] = useState(() => Date.now());
    const primo = useRef<HTMLInputElement | null>(null);
    const t = TESTI[canale];
    const tinta = TINTE[t.colore as keyof typeof TINTE];

    const leggiStato = useCallback(async () => {
        if (!userId) return;
        const { data, error } = await supabase.rpc("codice_stato", { p_user: userId, p_canale: canale });
        if (error) { setErrore(error.message); return; }
        const d = (data || {}) as { impostato?: boolean; bloccato_fino?: string | null };
        setStato({ impostato: !!d.impostato, bloccatoFino: d.bloccato_fino || null });
    }, [userId, canale]);

    useEffect(() => { leggiStato(); }, [leggiStato]);
    useEffect(() => { const i = setInterval(() => setAdesso(Date.now()), 1000); return () => clearInterval(i); }, []);
    useEffect(() => { primo.current?.focus(); }, [stato?.impostato]);

    const bloccatoPer = stato?.bloccatoFino ? Math.max(0, Math.ceil((new Date(stato.bloccatoFino).getTime() - adesso) / 1000)) : 0;

    const invia = async () => {
        if (!userId || occupato || bloccatoPer > 0) return;
        setErrore(null);
        const c = codice.trim();
        if (c.length < 4) { setErrore("Il codice deve avere almeno 4 caratteri."); return; }
        setOccupato(true);
        try {
            if (!stato?.impostato) {
                if (c !== conferma.trim()) { setErrore("I due codici non coincidono."); return; }
                const { data, error } = await supabase.rpc("codice_imposta", { p_user: userId, p_codice: c, p_canale: canale });
                if (error) throw new Error(error.message);
                const d = (data || {}) as { ok?: boolean; errore?: string };
                if (!d.ok) { setErrore(d.errore || "Non sono riuscito a salvare il codice."); return; }
                onApri();          // appena scelto, si entra: l'ha appena digitato due volte
                return;
            }
            const { data, error } = await supabase.rpc("codice_verifica", { p_user: userId, p_codice: c, p_canale: canale });
            if (error) throw new Error(error.message);
            const d = (data || {}) as { ok?: boolean; errore?: string; rimasti?: number; bloccato_fino?: string | null };
            if (d.ok) { onApri(); return; }
            setStato((s) => (s ? { ...s, bloccatoFino: d.bloccato_fino || null } : s));
            setErrore(d.bloccato_fino
                ? "Troppi tentativi: la sezione si riapre fra qualche minuto."
                : `${d.errore || "Codice sbagliato."}${typeof d.rimasti === "number" ? ` Ti restano ${d.rimasti} tentativi.` : ""}`);
            setCodice("");
        } catch (e) {
            setErrore(String((e as Error)?.message || e));
        } finally {
            setOccupato(false);
        }
    };

    const primoAccesso = stato != null && !stato.impostato;

    return (
        <div className="h-full min-h-[60vh] flex items-center justify-center p-6">
            <div className="w-full max-w-sm">
                <div className={cn("w-14 h-14 rounded-2xl border flex items-center justify-center mx-auto mb-4", tinta.alone)}>
                    {primoAccesso ? <ShieldCheck className={cn("w-7 h-7", tinta.icona)} /> : <Lock className={cn("w-7 h-7", tinta.icona)} />}
                </div>

                {stato == null && <p className="text-center text-xs text-slate-500">Un attimo…</p>}

                {stato != null && (
                    <>
                        <h2 className="text-center text-base font-bold text-white mb-1.5">
                            {primoAccesso ? "Scegli il tuo codice" : t.titolo}
                        </h2>
                        <p className="text-center text-xs text-slate-400 leading-relaxed mb-5">
                            {primoAccesso
                                ? `Da ora ${t.nome} si apre solo con un codice tuo. Scriverlo due volte serve a non sbagliarlo: nessuno potrà rileggerlo, nemmeno l'amministratore. Se lo dimentichi, chiedi di azzerarlo e ne scegli un altro.`
                                : t.sotto}
                        </p>

                        <input ref={primo} type="password" inputMode="text" autoComplete="off"
                            value={codice} onChange={(e) => setCodice(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !primoAccesso) invia(); }}
                            disabled={bloccatoPer > 0}
                            placeholder={primoAccesso ? "Il tuo nuovo codice" : "Codice"}
                            className={cn("w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white text-center tracking-[0.3em] placeholder:tracking-normal placeholder-slate-600 outline-none disabled:opacity-50", tinta.bordo)} />

                        {primoAccesso && (
                            <input type="password" autoComplete="off" value={conferma}
                                onChange={(e) => setConferma(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") invia(); }}
                                placeholder="Scrivilo di nuovo"
                                className={cn("w-full mt-2 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white text-center tracking-[0.3em] placeholder:tracking-normal placeholder-slate-600 outline-none", tinta.bordo)} />
                        )}

                        {errore && <p className="mt-3 text-[11px] text-rose-300 text-center leading-relaxed">{errore}</p>}
                        {bloccatoPer > 0 && (
                            <p className="mt-3 text-[11px] text-amber-300 text-center">
                                Riprova fra {Math.floor(bloccatoPer / 60)}:{String(bloccatoPer % 60).padStart(2, "0")}
                            </p>
                        )}

                        <button onClick={invia} disabled={occupato || bloccatoPer > 0}
                            className={cn("w-full mt-4 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors",
                                occupato || bloccatoPer > 0 ? "bg-white/5 text-slate-500" : tinta.pieno)}>
                            {occupato ? "…" : primoAccesso ? "Salva ed entra" : t.bottone}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
