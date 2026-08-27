"use client";

/* ═══ IL CODICE DAVANTI A WHATSAPP ════════════════════════════════════════
   «SOLO Sandra e Claudia devono avere un codice che quando aprono WhatsApp
   gli chiede, altrimenti non è possibile vederlo» (Luca, 27/08).

   Chi deve inserirlo lo decide la rotellina dei permessi (WhatsApp → «Chiede
   un codice»): non è cablato su due nomi, così domani si accende o si spegne
   a chiunque senza toccare il codice sorgente.

   Il codice se lo scelgono LORO al primo ingresso e nessuno lo può rileggere:
   nel database c'è solo l'impronta bcrypt, e la tabella è chiusa anche alla
   chiave pubblica. Il confronto lo fa il database (`wa_codice_verifica`),
   stesso identico modo in cui il CRM controlla le password. Se lo
   dimenticano, un admin lo AZZERA e ne scelgono un altro.

   Si richiede A OGNI APERTURA: lo sblocco vive nello stato del componente,
   quindi uscire dalla sezione e rientrare rimette il lucchetto. Niente
   ricordi in memoria del browser — un codice che si ricorda da solo non
   protegge da un pc lasciato aperto.                                      */

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useRolePermissions } from "@/lib/usePermissions";
import { capAllowed, CAP_WA_CODICE, WA_SECTION } from "@/lib/capabilities";
import { WhatsAppInbox } from "@/components/WhatsAppInbox";
import { cn } from "@/utils";

type Props = React.ComponentProps<typeof WhatsAppInbox>;

export function WhatsAppProtetta(props: Props) {
    const { user } = useAuth();
    const { perms, loaded } = useRolePermissions(user?.role, user?.grade, user?.id);
    const serveCodice = capAllowed(user?.role, WA_SECTION, CAP_WA_CODICE, perms);
    const [sbloccato, setSbloccato] = useState(false);

    // finché non so se il codice serve NON si monta l'inbox: montarla e poi
    // coprirla vorrebbe dire che le conversazioni sono già state scaricate
    if (!loaded) {
        return <div className="h-full flex items-center justify-center p-8 text-xs text-slate-500">Un attimo…</div>;
    }
    if (serveCodice && !sbloccato) {
        return <Lucchetto userId={user?.id || null} onApri={() => setSbloccato(true)} />;
    }
    return <WhatsAppInbox {...props} />;
}

function Lucchetto({ userId, onApri }: { userId: string | null; onApri: () => void }) {
    const [stato, setStato] = useState<{ impostato: boolean; bloccatoFino: string | null } | null>(null);
    const [codice, setCodice] = useState("");
    const [conferma, setConferma] = useState("");
    const [errore, setErrore] = useState<string | null>(null);
    const [occupato, setOccupato] = useState(false);
    const [adesso, setAdesso] = useState(() => Date.now());
    const primo = useRef<HTMLInputElement | null>(null);

    const leggiStato = useCallback(async () => {
        if (!userId) return;
        const { data, error } = await supabase.rpc("wa_codice_stato", { p_user: userId });
        if (error) { setErrore(error.message); return; }
        const d = (data || {}) as { impostato?: boolean; bloccato_fino?: string | null };
        setStato({ impostato: !!d.impostato, bloccatoFino: d.bloccato_fino || null });
    }, [userId]);

    useEffect(() => { leggiStato(); }, [leggiStato]);
    useEffect(() => { const t = setInterval(() => setAdesso(Date.now()), 1000); return () => clearInterval(t); }, []);
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
                const { data, error } = await supabase.rpc("wa_codice_imposta", { p_user: userId, p_codice: c });
                if (error) throw new Error(error.message);
                const d = (data || {}) as { ok?: boolean; errore?: string };
                if (!d.ok) { setErrore(d.errore || "Non sono riuscito a salvare il codice."); return; }
                onApri();          // appena scelto, si entra: l'ha appena digitato due volte
                return;
            }
            const { data, error } = await supabase.rpc("wa_codice_verifica", { p_user: userId, p_codice: c });
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
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                    {primoAccesso ? <ShieldCheck className="w-7 h-7 text-emerald-400" /> : <Lock className="w-7 h-7 text-emerald-400" />}
                </div>

                {stato == null && <p className="text-center text-xs text-slate-500">Un attimo…</p>}

                {stato != null && (
                    <>
                        <h2 className="text-center text-base font-bold text-white mb-1.5">
                            {primoAccesso ? "Scegli il tuo codice" : "WhatsApp è protetto"}
                        </h2>
                        <p className="text-center text-xs text-slate-400 leading-relaxed mb-5">
                            {primoAccesso
                                ? "Da ora WhatsApp si apre solo con un codice tuo. Scriverlo due volte serve a non sbagliarlo: nessuno potrà rileggerlo, nemmeno l'amministratore. Se lo dimentichi, chiedi di azzerarlo e ne scegli un altro."
                                : "Inserisci il tuo codice per vedere le conversazioni. Te lo richiede ogni volta che apri la sezione."}
                        </p>

                        <input ref={primo} type="password" inputMode="text" autoComplete="off"
                            value={codice} onChange={(e) => setCodice(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !primoAccesso) invia(); }}
                            disabled={bloccatoPer > 0}
                            placeholder={primoAccesso ? "Il tuo nuovo codice" : "Codice"}
                            className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white text-center tracking-[0.3em] placeholder:tracking-normal placeholder-slate-600 outline-none focus:border-emerald-500/50 disabled:opacity-50" />

                        {primoAccesso && (
                            <input type="password" autoComplete="off" value={conferma}
                                onChange={(e) => setConferma(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") invia(); }}
                                placeholder="Scrivilo di nuovo"
                                className="w-full mt-2 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white text-center tracking-[0.3em] placeholder:tracking-normal placeholder-slate-600 outline-none focus:border-emerald-500/50" />
                        )}

                        {errore && <p className="mt-3 text-[11px] text-rose-300 text-center leading-relaxed">{errore}</p>}
                        {bloccatoPer > 0 && (
                            <p className="mt-3 text-[11px] text-amber-300 text-center">
                                Riprova fra {Math.floor(bloccatoPer / 60)}:{String(bloccatoPer % 60).padStart(2, "0")}
                            </p>
                        )}

                        <button onClick={invia} disabled={occupato || bloccatoPer > 0}
                            className={cn("w-full mt-4 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors",
                                occupato || bloccatoPer > 0
                                    ? "bg-white/5 text-slate-500"
                                    : "bg-emerald-600 text-white hover:bg-emerald-500")}>
                            {occupato ? "…" : primoAccesso ? "Salva ed entra" : "Apri WhatsApp"}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
