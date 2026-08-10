"use client";

/**
 * VISIBILITÀ CLIENTI — FONTE UNICA (Luca 28/07: "risolvilo ora e per sempre").
 *
 * Il buco: Clienti e Registra Vendita decidevano con DUE logiche diverse chi
 * è visibile per intero (la ricerca per nome ignorava gli accessi concessi
 * su richiesta e i clienti acquisiti dal negozio). Da qui in poi la regola
 * vive SOLO in questo hook e chiunque debba rispondere a "questo utente può
 * vedere per intero questo cliente?" passa da qui.
 *
 * Regole (fotografia della pagina Clienti):
 *  - ambito dal pannello Permessi (cap:/clienti): tutti | negozi | propri |
 *    appuntamenti; la visibilità TOTALE utente (seesAll) non si restringe mai;
 *  - negozi: pieno accesso ai clienti GESTITI (≥1 vendita nei negozi visibili)
 *    o ACQUISITI (anagrafica nata lì);
 *  - propri: clienti con pratiche a proprio nome (direttore outbound: reparto);
 *  - appuntamenti (caller): clienti agganciati per CF/cellulare agli
 *    appuntamenti fissati da lui;
 *  - in OGNI ambito: più i clienti con ACCESSO CONCESSO dall'amministrazione
 *    (client_access_requests approvate).
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useRolePermissions } from "@/lib/usePermissions";
import { CAP_CLIENTI, capChoice } from "@/lib/capabilities";
import { useVisibleStores, sameStore } from "@/lib/visibleStores";
import { caricaTutte } from "@/lib/fetchTutte";

export interface ClientiVisibili {
    /** true = c'è un perimetro: i clienti fuori si mostrano oscurati/nascosti */
    maskAttivo: boolean;
    /** false finché i set non sono caricati: NON concludere "non visibile" prima */
    pronta: boolean;
    /** pieno accesso a questo cliente? */
    visibile: (clientId: string) => boolean;
    /** clienti nel perimetro (senza gli accessi concessi); null = ancora in carica o nessun perimetro */
    mieiClienti: Set<string> | null;
    /** accessi CONCESSI dall'amministrazione (richieste approvate) */
    accessOk: Set<string>;
    /** richieste ancora in attesa (per i badge "richiesta inviata") */
    accessPending: Set<string>;
    /** segna localmente una nuova richiesta appena inviata */
    segnaPending: (clientId: string) => void;
    /** ricarica lo stato delle richieste di accesso */
    ricaricaAccessi: () => Promise<void>;
    scope: string;
}

export function useClientiVisibili(): ClientiVisibili {
    const { user } = useAuth();
    const role = user?.role || "";
    const { perms: capPerms } = useRolePermissions(role, user?.grade, user?.id);
    const scope = capChoice(role, CAP_CLIENTI, capPerms);
    const { seesAll: seesAllVis, stores: visStores } = useVisibleStores();
    const maskAttivo = scope !== "tutti" && !seesAllVis;
    const soloPropri = maskAttivo && scope === "propri";
    const soloAppuntamenti = maskAttivo && scope === "appuntamenti";
    const isStoreScoped = maskAttivo && scope === "negozi";

    const [mieiClienti, setMieiClienti] = useState<Set<string> | null>(null);
    const [accessOk, setAccessOk] = useState<Set<string>>(new Set());
    const [accessPending, setAccessPending] = useState<Set<string>>(new Set());

    const ricaricaAccessi = useCallback(async () => {
        if (!user?.id) return;
        const { data: reqs, error } = await supabase.from("client_access_requests")
            .select("client_id,status").eq("requested_by", user.id);
        if (!error) {
            setAccessOk(new Set((reqs ?? []).filter((r) => r.status === "approved").map((r) => String(r.client_id))));
            setAccessPending(new Set((reqs ?? []).filter((r) => r.status === "pending").map((r) => String(r.client_id))));
        }
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return;
        let vivo = true;
        (async () => {
            if (soloPropri) {
                let nomi: string[] = [];
                if (role === "direttore_ob") {
                    const { data } = await supabase.from("app_users").select("full_name,match_name")
                        .in("role", ["agente", "direttore_ob"]).eq("active", true);
                    nomi = ((data ?? []) as { full_name: string; match_name: string | null }[])
                        .flatMap((u) => [u.full_name, u.match_name]).filter(Boolean) as string[];
                } else {
                    const { data } = await supabase.from("app_users").select("full_name,match_name").eq("id", user.id).maybeSingle();
                    nomi = [data?.full_name, data?.match_name, user.name].filter(Boolean) as string[];
                }
                // caricaTutte: il tetto server 1000 tagliava le pratiche recenti
                const { data: cs } = await caricaTutte<{ client_id: string | null }>((from, to) =>
                    supabase.from("contracts").select("client_id")
                        .in("venditore", nomi.length ? nomi : ["—"]).order("id").range(from, to));
                if (!vivo) return;
                setMieiClienti(new Set(cs.map((c) => c.client_id).filter(Boolean) as string[]));
                await ricaricaAccessi();
            }
            if (soloAppuntamenti) {
                const { data: me } = await supabase.from("app_users").select("full_name,match_name").eq("id", user.id).maybeSingle();
                const nomi = [me?.full_name, me?.match_name, user.name].filter(Boolean) as string[];
                const { data: apps } = await caricaTutte<{ cf_piva: string | null; customer_phone: string | null }>((from, to) =>
                    supabase.from("appointments").select("cf_piva,customer_phone")
                        .in("created_by", nomi.length ? nomi : ["—"]).order("id").range(from, to));
                const cfSet = new Set<string>(); const telSet = new Set<string>();
                ((apps ?? []) as { cf_piva: string | null; customer_phone: string | null }[]).forEach((a) => {
                    const cf = String(a.cf_piva || "").toUpperCase().trim();
                    if (cf) cfSet.add(cf);
                    const t = String(a.customer_phone || "").replace(/\D/g, "");
                    if (t) telSet.add(t);
                });
                // creato_da (mig. 108): il caller vede anche le anagrafiche che
                // ha CREATO lui chiamando — pure senza appuntamento (caso
                // Barbieri: mai risposto, ma il cliente e' suo). Fallback senza
                // la colonna finche' la migrazione non e' applicata.
                const tentativo = await caricaTutte<{ id: string; cf_piva: string | null; cellulare: string | null; creato_da?: string | null }>((from, to) =>
                    supabase.from("clients").select("id,cf_piva,cellulare,creato_da").order("id").range(from, to));
                const cls = !tentativo.error ? tentativo.data
                    : (await caricaTutte<{ id: string; cf_piva: string | null; cellulare: string | null }>((from, to) =>
                        supabase.from("clients").select("id,cf_piva,cellulare").order("id").range(from, to))).data;
                if (!vivo) return;
                const nomiNorm = new Set(nomi.map((n) => n.trim().toLowerCase()));
                const set = new Set<string>();
                ((cls ?? []) as { id: string; cf_piva: string | null; cellulare: string | null; creato_da?: string | null }[]).forEach((c) => {
                    const cf = String(c.cf_piva || "").toUpperCase().trim();
                    const t = String(c.cellulare || "").replace(/\D/g, "");
                    const creatore = String(c.creato_da || "").trim().toLowerCase();
                    if ((cf && cfSet.has(cf)) || (t && telSet.has(t)) || (creatore && nomiNorm.has(creatore))) set.add(c.id);
                });
                setMieiClienti(set);
                await ricaricaAccessi();
            }
            if (isStoreScoped) {
                const miei = visStores.length ? visStores : (user.negozio ? [user.negozio] : []);
                // gestiti: almeno una vendita in uno dei negozi visibili.
                // caricaTutte: col tetto 1000 le pratiche recenti sparivano e
                // il creatore non vedeva piu' il SUO cliente (caso Schmidinger).
                const { data: cs } = await caricaTutte<{ client_id: string | null; negozio: string | null }>((from, to) =>
                    supabase.from("contracts").select("client_id,negozio").order("id").range(from, to));
                const set = new Set<string>();
                cs.forEach((c) => {
                    if (c.client_id && miei.some((m) => sameStore(c.negozio, m))) set.add(c.client_id);
                });
                // acquisiti: anagrafiche nate in uno dei negozi visibili
                const { data: acq } = await caricaTutte<{ id: string; acquisito_da: string | null }>((from, to) =>
                    supabase.from("clients").select("id,acquisito_da").order("id").range(from, to));
                if (!vivo) return;
                acq.forEach((c) => {
                    if (c.acquisito_da && miei.some((m) => sameStore(c.acquisito_da, m))) set.add(c.id);
                });
                setMieiClienti(set);
                await ricaricaAccessi();
            }
            if (!maskAttivo && vivo) setMieiClienti(null);
        })();
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, soloPropri, soloAppuntamenti, isStoreScoped, maskAttivo, visStores.join("|"), role]);

    const pronta = !maskAttivo || mieiClienti !== null;
    const visibile = useCallback((clientId: string) => {
        if (!maskAttivo) return true;
        if (mieiClienti === null) return false;   // set non ancora caricato: prudenza
        return mieiClienti.has(clientId) || accessOk.has(clientId);
    }, [maskAttivo, mieiClienti, accessOk]);
    const segnaPending = useCallback((clientId: string) => {
        setAccessPending((p) => new Set([...p, clientId]));
    }, []);

    return { maskAttivo, pronta, visibile, mieiClienti, accessOk, accessPending, segnaPending, ricaricaAccessi, scope };
}
