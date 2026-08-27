"use client";

/* CHIUSURA LINEA (Luca 01/08) — ticketing disdette verso gli operatori.
   Sostituisce lo scambio moduli su WhatsApp/Email. Dal brief:
   - vista CONSULENTE: form di invio a sinistra (ricerca cliente STANDARD di
     Registra Vendita + mini-form di creazione se il cliente non esiste,
     upload PDF, disdetta programmata) e dashboard personale a destra
     (lo store manager vede anche il team);
   - vista DIREZIONE (direttore commerciale in su + amministrazione): tabella
     globale con ordinamento a urgenza — programmata scaduta/oggi in cima
     ("SCADE OGGI"), poi in_attesa/da_integrare FIFO su updated_at, le
     gestite in fondo — filtri per brand e negozio;
   - stati: in_attesa → (Rigetta con motivo → da_integrare → reintegro PDF →
     in_attesa) → Segna Gestita. Ogni transizione scrive un evento nello
     storico jsonb, che la Timeline della scheda cliente rilegge;
   - a ogni INVIO o REINTEGRO parte il task ⚡ ai designati dell'incarico
     "chiusura_linea" (Amministrazione → Utenti → Incarichi), come le ferie. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useStores } from "@/lib/org";
import { seesWholeStore } from "@/lib/roles";
import { useVisibleStores, sameStore } from "@/lib/visibleStores";
import { RicercaCliente, type ClienteTrovato } from "@/components/RicercaCliente";
import { SelectOpzioni, SelectMulti } from "@/components/SelectPersona";
import { DatePickerInput } from "@/components/DatePickerInput";
import { useQrUpload, QrUploadModal } from "@/lib/useQrUpload";
import { trovaDuplicati } from "@/lib/clientChecks";
import { numeroNazionale } from "@/lib/telefono";
import { dataNascitaDaCF } from "@/lib/dataNascita";
import { verificaCoerenzaCF } from "@/lib/coerenzaCF";
import { cn } from "@/utils";
import { Loader2, Scissors, Upload, X, FileText, Search } from "lucide-react";
import { useRolePermissions } from "@/lib/usePermissions";
import { designatiIncarico, avvisaIncaricoSuWhatsApp } from "@/lib/incarichi";
import { capAllowed, CAP_DISDETTE, CAP_DISDETTE_INVIA, CAP_DISDETTE_GESTISCE } from "@/lib/capabilities";

const BRANDS = ["WindTre", "Vodafone", "Fastweb", "TIM", "Iliad", "Sky", "Very Mobile", "Ho. Mobile", "Kena Mobile", "Altro"];

type FileRef = { url: string; name: string };
type Evento = { quando: string; tipo: string; testo: string };
type ClienteJoin = { nome: string | null; cognome: string | null; ragione_sociale: string | null; cf_piva: string | null; tipo: string | null };
type Ticket = {
    id: string; client_id: string; consulente: string; negozio: string; brand: string;
    status: "in_attesa" | "da_integrare" | "gestita" | "da_verificare" | "conclusa";
    files: FileRef[]; note_consulente: string; feedback_admin: string;
    is_programmata: boolean; data_programmata: string | null;
    storico: Evento[]; created_at: string; updated_at: string;
    gestita_il?: string | null; verifica_dal?: string | null; verificata_il?: string | null;
    clients?: ClienteJoin | null;
};

// ── CICLO DI VERIFICA (Luca 06/08) ───────────────────────────────────────
// dopo VERIFICA_DOPO_GG dalla gestione la pratica torna al consulente come
// "da_verificare"; ha FRANCHIGIA_GG per concluderla, poi 5€/giorno di malus.
const VERIFICA_DOPO_GG = 35;
const FRANCHIGIA_GG = 3;
const MALUS_GIORNO = 5;
const GG = 24 * 60 * 60 * 1000;
const giorniDa = (iso: string | null | undefined, fino?: string | null) => {
    if (!iso) return 0;
    const a = new Date(iso).getTime();
    const b = fino ? new Date(fino).getTime() : Date.now();
    return Math.floor((b - a) / GG);
};
/** malus maturato: vivo se da_verificare oltre franchigia, congelato alla
 *  verifica se conclusa in ritardo. 0 in ogni altro caso. */
const malusDisdetta = (t: Ticket) => {
    if (t.status === "da_verificare") return Math.max(0, giorniDa(t.verifica_dal) - FRANCHIGIA_GG) * MALUS_GIORNO;
    if (t.status === "conclusa" && t.verifica_dal && t.verificata_il)
        return Math.max(0, giorniDa(t.verifica_dal, t.verificata_il) - FRANCHIGIA_GG) * MALUS_GIORNO;
    return 0;
};

// upload disdetta → anche in contract_attachments (contract_id null, mig.
// 20260806030000): così i documenti compaiono nella scheda del cliente
async function registraAllegatiCliente(clientId: string, files: FileRef[]) {
    try {
        await supabase.from("contract_attachments").insert(files.map(f => ({
            contract_id: null, client_id: clientId, file_url: f.url, file_name: f.name, file_type: "disdetta",
        })));
    } catch { /* la disdetta resta valida; il backfill della migrazione riallinea */ }
}

const oggiYmd = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dmy = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const [y, m, d] = String(iso).slice(0, 10).split("-");
    return d && m && y ? `${d}/${m}/${y}` : String(iso).slice(0, 10);
};
// gg/mm/aaaa -> aaaa-mm-gg (pattern di Ricerca Vendite): una data incompleta
// o non valida ritorna "" e il filtro semplicemente non si applica
const dataIso = (v: string) => {
    const s = (v || "").trim();
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return "";
};
const nomeCliente = (t: Ticket) => {
    const c = t.clients;
    if (!c) return t.client_id;
    return c.ragione_sociale || `${c.nome || ""} ${c.cognome || ""}`.trim() || t.client_id;
};

function StatusBadge({ status }: { status: Ticket["status"] }) {
    const cfg = {
        in_attesa: { label: "In Attesa", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30", icon: "⏳" },
        da_integrare: { label: "Da Integrare", cls: "bg-rose-500/10 text-rose-400 border-rose-500/30", icon: "⚠️" },
        gestita: { label: "Gestita", cls: "bg-sky-500/10 text-sky-400 border-sky-500/30", icon: "🕐" },
        da_verificare: { label: "Da Verificare", cls: "bg-violet-500/10 text-violet-300 border-violet-500/30", icon: "🔍" },
        conclusa: { label: "Conclusa", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", icon: "✅" },
    }[status] || { label: status, cls: "bg-white/5 text-slate-400 border-white/10", icon: "•" };
    return <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap", cfg.cls)}>{cfg.icon} {cfg.label}</span>;
}

function TipoInvio({ t }: { t: Ticket }) {
    if (!t.is_programmata) return <span className="text-[11px] font-semibold text-emerald-400">⚡ Immediato</span>;
    const scade = (t.data_programmata || "") <= oggiYmd();
    return scade
        ? <span className="text-[11px] font-extrabold text-rose-400 bg-rose-500/10 px-2 py-1 rounded-md">🔥 SCADE OGGI</span>
        : <span className="text-[11px] font-semibold text-violet-300 bg-violet-500/10 px-2 py-1 rounded-md">⏳ Prog. al {dmy(t.data_programmata)}</span>;
}

// ── FORM DI INVIO (colonna sinistra, comune alle due viste) ──────────────
const ANA_VUOTA = { tipo: "consumer" as "consumer" | "business", nome: "", cognome: "", ragioneSociale: "", nomeRef: "", cognomeRef: "", cf: "", tel: "", fisso: "", email: "" };

function FormInvio({ onInviata, msg }: { onInviata: () => void; msg: (m: string) => void }) {
    const { user } = useAuth();
    const [cliSel, setCliSel] = useState<ClienteTrovato | null>(null);
    const [creaNuovo, setCreaNuovo] = useState(false);
    const [ana, setAna] = useState({ ...ANA_VUOTA });
    const [brand, setBrand] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [isProg, setIsProg] = useState(false);
    const [dataProg, setDataProg] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    // carica dal telefono via QR (CHL-02): i File ricevuti si accodano e
    // seguono l'identico flusso di upload del submit
    const qr = useQrUpload((ricevuti) => setFiles(p => [...p, ...ricevuti]));

    const reset = () => { setCliSel(null); setCreaNuovo(false); setAna({ ...ANA_VUOTA }); setBrand(""); setFiles([]); setIsProg(false); setDataProg(""); setNote(""); };

    // creazione anagrafica al volo: stesse regole di Registra Vendita
    // (match per CF, univocita' cellulare PER TIPO, referente obbligatorio
    // per le business, fisso facoltativo, is_demo false)
    const risolviCliente = async (): Promise<string | null> => {
        if (cliSel) return cliSel.id;
        const business = ana.tipo === "business";
        const cfPiva = ana.cf.trim().toUpperCase();
        const tel = ana.tel.trim();
        const miss = business
            ? [!ana.ragioneSociale.trim() && "Ragione Sociale", !ana.nomeRef.trim() && "Nome Referente", !ana.cognomeRef.trim() && "Cognome Referente", !tel && "Cellulare"].filter(Boolean)
            : [!ana.nome.trim() && "Nome", !ana.cognome.trim() && "Cognome", !tel && "Cellulare"].filter(Boolean);
        if (miss.length) { msg("⚠️ Campi anagrafica mancanti: " + miss.join(", ")); return null; }

        if (cfPiva) {
            const { data } = await supabase.from("clients").select("id").ilike("cf_piva", cfPiva).limit(1);
            if (data?.length) return data[0].id as string;
        }
        const dup = await trovaDuplicati({ cellulare: tel, tipoNuovo: ana.tipo });
        if (dup.cellulare) { msg(`⚠️ Cellulare già di “${dup.cellulare.label}” (stesso tipo): cercalo e selezionalo, oppure usa un altro numero`); return null; }

        // COERENZA CF ↔ NOME (Luca 24/08): bloccante ma forzabile
        {
            const eCF = business ? verificaCoerenzaCF(ana.nomeRef, ana.cognomeRef, cfPiva) : verificaCoerenzaCF(ana.nome, ana.cognome, cfPiva);
            if (!eCF.ok) {
                const okCF = window.confirm(`⚠️ Il codice fiscale non torna coi dati scritti:\n— ${eCF.motivi.join("\n— ")}\n\nOK = salva comunque (te ne assumi l'errore).\nAnnulla = torna a correggere.`);
                if (!okCF) { msg("Anagrafica non creata: codice fiscale incoerente coi dati."); return null; }
            }
        }
        const idBase = cfPiva || tel.replace(/\D/g, "") || "ND";
        const id = `CL-${idBase.replace(/\s/g, "")}-${Date.now()}`;
        const { error } = await supabase.from("clients").insert({
            id, tipo: ana.tipo, cf_piva: cfPiva || null,
            nome: business ? ana.nomeRef.trim() : ana.nome.trim(),
            cognome: business ? ana.cognomeRef.trim() : ana.cognome.trim(),
            ragione_sociale: business ? ana.ragioneSociale.trim() : "",
            nome_ref: business ? ana.nomeRef.trim() : "",
            cognome_ref: business ? ana.cognomeRef.trim() : "",
            cellulare: numeroNazionale(tel) || tel,
            telefono_fisso: business ? ((numeroNazionale(ana.fisso) || ana.fisso.trim()) || null) : null,
            email: ana.email.trim(), indirizzo: "", cap: "", citta: "", iban: "",
            data_nascita: business ? null : dataNascitaDaCF(cfPiva),
            is_demo: false, creato_da: user?.name || "", acquisito_da: user?.negozio || null,
        });
        if (error) { msg("⚠️ Anagrafica non creata: " + error.message); return null; }
        return id;
    };

    const invia = async () => {
        if (busy) return;
        if (!cliSel && !creaNuovo) { msg("⚠️ Cerca il cliente (o crealo) prima di inviare"); return; }
        if (!brand) { msg("⚠️ Seleziona il brand da disdire"); return; }
        if (files.length === 0) { msg("⚠️ Allega almeno un PDF (modulo + documento d'identità)"); return; }
        if (isProg && !dataProg) { msg("⚠️ Seleziona la data della disdetta programmata"); return; }
        setBusy(true);
        try {
            const clientId = await risolviCliente();
            if (!clientId) return;

            const caricati: FileRef[] = [];
            for (const f of files) {
                const ext = f.name.split(".").pop() || "pdf";
                const path = `disdette/${clientId}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
                const { error: upErr } = await supabase.storage.from("contracts").upload(path, f);
                if (upErr) { msg("⚠️ Upload non riuscito: " + upErr.message); return; }
                const { data: pub } = supabase.storage.from("contracts").getPublicUrl(path);
                caricati.push({ url: pub.publicUrl, name: f.name });
            }

            const evento: Evento = { quando: new Date().toISOString(), tipo: "creazione", testo: `Richiesta disdetta ${brand} inserita` };
            const { data: riga, error } = await supabase.from("richieste_disdette").insert({
                client_id: clientId, consulente: user?.name || "", negozio: user?.negozio || "",
                brand, files: caricati, note_consulente: note.trim(),
                is_programmata: isProg, data_programmata: isProg ? dataProg : null,
                storico: [evento],
            }).select("id").single();
            if (error) { msg("⚠️ Invio non riuscito: " + error.message); return; }
            await registraAllegatiCliente(clientId, caricati);

            await taskAiDesignati(`✂️ Chiusura linea ${brand}: ${cliSel ? (cliSel.ragione_sociale || `${cliSel.nome || ""} ${cliSel.cognome || ""}`.trim()) : (ana.ragioneSociale || `${ana.nome} ${ana.cognome}`.trim())}${isProg ? ` (programmata al ${dmy(dataProg)})` : ""}`, note.trim() || "Senza note.", user?.name || "", riga?.id as string | undefined);
            msg(`✅ Richiesta ${riga?.id || ""} inviata alla direzione`);
            reset();
            onInviata();
        } finally { setBusy(false); }
    };

    return (
        <div className="glass-card p-5 lg:sticky lg:top-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2"><Scissors className="w-4 h-4 text-indigo-400" /> Invia Nuova Disdetta</h3>

            {/* 1. ANAGRAFICA — stesso campo di Registra Vendita */}
            <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">1. Anagrafica cliente</p>
                {cliSel ? (
                    <div className="flex items-center justify-between gap-2 p-3 rounded-xl border-2 border-emerald-500/50 bg-emerald-500/10">
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-emerald-300 truncate">{cliSel.ragione_sociale || `${cliSel.nome || ""} ${cliSel.cognome || ""}`.trim()}</div>
                            <div className="text-[11px] text-slate-400 truncate">{[cliSel.cf_piva, cliSel.cellulare].filter(Boolean).join(" · ")}</div>
                        </div>
                        <button onClick={() => setCliSel(null)} className="text-[11px] font-bold text-slate-400 hover:text-white px-2 py-1 rounded-lg border border-white/15 shrink-0">✕ cambia</button>
                    </div>
                ) : (
                    <>
                        <RicercaCliente onScelto={(c) => { setCliSel(c); setCreaNuovo(false); }} />
                        <button onClick={() => setCreaNuovo(v => !v)} className={cn("mt-2 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors", creaNuovo ? "border-indigo-400/70 bg-indigo-500/15 text-indigo-300" : "border-white/10 text-slate-400 hover:text-white")}>
                            {creaNuovo ? "✕ annulla creazione" : "+ Cliente non censito? Crealo al volo"}
                        </button>
                        {creaNuovo && (
                            <div className="mt-2 p-3 rounded-xl border border-white/10 bg-white/[0.02] space-y-2">
                                <div className="flex gap-2">
                                    {([["consumer", "👤 Privato"], ["business", "🏢 Business"]] as const).map(([k, l]) => (
                                        <button key={k} onClick={() => setAna(p => ({ ...p, tipo: k }))} className={cn("flex-1 py-1.5 rounded-lg text-[11px] font-bold border", ana.tipo === k ? "border-indigo-400/70 bg-indigo-500/15 text-indigo-300" : "border-white/10 text-slate-400")}>{l}</button>
                                    ))}
                                </div>
                                {ana.tipo === "business" ? (
                                    <>
                                        <input value={ana.ragioneSociale} onChange={e => setAna(p => ({ ...p, ragioneSociale: e.target.value }))} placeholder="Ragione Sociale *" className="glass-input w-full text-xs" />
                                        <div className="flex gap-2">
                                            <input value={ana.nomeRef} onChange={e => setAna(p => ({ ...p, nomeRef: e.target.value }))} placeholder="Nome Referente *" className="glass-input w-full text-xs" />
                                            <input value={ana.cognomeRef} onChange={e => setAna(p => ({ ...p, cognomeRef: e.target.value }))} placeholder="Cognome Referente *" className="glass-input w-full text-xs" />
                                        </div>
                                        <input value={ana.fisso} onChange={e => setAna(p => ({ ...p, fisso: e.target.value.replace(/\D/g, "").slice(0, 11) }))} placeholder="Telefono fisso (facoltativo)" className="glass-input w-full text-xs font-mono" />
                                    </>
                                ) : (
                                    <div className="flex gap-2">
                                        <input value={ana.nome} onChange={e => setAna(p => ({ ...p, nome: e.target.value }))} placeholder="Nome *" className="glass-input w-full text-xs" />
                                        <input value={ana.cognome} onChange={e => setAna(p => ({ ...p, cognome: e.target.value }))} placeholder="Cognome *" className="glass-input w-full text-xs" />
                                    </div>
                                )}
                                <input value={ana.cf} onChange={e => setAna(p => ({ ...p, cf: e.target.value.toUpperCase() }))} placeholder={ana.tipo === "business" ? "P.IVA" : "Codice Fiscale"} className="glass-input w-full text-xs font-mono" />
                                <div className="flex gap-2">
                                    <input value={ana.tel} onChange={e => setAna(p => ({ ...p, tel: e.target.value.replace(/\D/g, "").slice(0, 10) }))} placeholder="Cellulare *" className="glass-input w-full text-xs font-mono" />
                                    <input value={ana.email} onChange={e => setAna(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="glass-input w-full text-xs" />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* 2. DATI E FILE */}
            <div className={cn("space-y-3 transition-opacity", (cliSel || creaNuovo) ? "opacity-100" : "opacity-40 pointer-events-none")}>
                <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">2. Brand e documenti</p>
                    <SelectOpzioni value={brand} onChange={setBrand} opzioni={BRANDS} placeholder="Seleziona brand da disdire…" />
                </div>
                <div className="flex items-stretch gap-2">
                    <label className="flex-1 block border border-dashed border-white/20 hover:border-indigo-400/60 rounded-xl p-4 text-center cursor-pointer bg-white/[0.01] transition-colors">
                        <input type="file" multiple accept=".pdf,image/*" className="hidden" onChange={e => { const list = Array.from(e.target.files ?? []); if (list.length) setFiles(p => [...p, ...list]); e.target.value = ""; }} />
                        <span className="text-xs font-semibold text-indigo-300 flex items-center justify-center gap-2"><Upload className="w-4 h-4" /> Carica PDF (modulo + documento) — anche più file</span>
                    </label>
                    <button type="button" onClick={() => qr.openQr("disdetta", "doc")} title="Carica dal telefono via QR"
                        className="px-3 rounded-xl border border-indigo-400/40 bg-indigo-500/10 text-indigo-300 text-xs font-bold hover:bg-indigo-500/20 shrink-0 whitespace-nowrap">📱 QR</button>
                </div>
                {files.length > 0 && (
                    <div className="space-y-1">
                        {files.map((f, i) => (
                            <div key={i} className="flex items-center justify-between gap-2 text-xs text-slate-300 bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                                <span className="truncate flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> {f.name}</span>
                                <button onClick={() => setFiles(p => p.filter((_, j) => j !== i))} className="text-slate-500 hover:text-rose-400"><X className="w-3.5 h-3.5" /></button>
                            </div>
                        ))}
                    </div>
                )}

                {/* 3. PROGRAMMATA */}
                <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02]">
                    <label className="flex items-center gap-2.5 text-sm text-slate-200 cursor-pointer font-medium">
                        <input type="checkbox" checked={isProg} onChange={e => setIsProg(e.target.checked)} className="w-4 h-4 cursor-pointer" />
                        Pianifica invio futuro
                    </label>
                    {isProg && (
                        <div className="mt-2.5 pt-2.5 border-t border-white/10">
                            <p className="text-[10px] text-slate-500 mb-1">Data di esecuzione richiesta:</p>
                            <input type="date" value={dataProg} min={oggiYmd()} onChange={e => setDataProg(e.target.value)} className="glass-input w-full text-sm !text-violet-300" />
                        </div>
                    )}
                </div>

                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Note operative libere…" className="glass-input w-full text-sm resize-none" />
                <button onClick={invia} disabled={busy} className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:brightness-110 disabled:opacity-50 transition-all">
                    {busy ? "Invio in corso…" : "INVIA ALLA DIREZIONE"}
                </button>
            </div>
            <QrUploadModal qr={qr} />
        </div>
    );
}

// task ⚡ ai designati dell'incarico (come le ferie); usato da invio e reintegro.
// Il link porta l'id della DS: cosi' apre il ticket giusto e gestisci() puo'
// spegnere le task a gestione avvenuta.
async function taskAiDesignati(titolo: string, dettaglio: string, autore: string, dsId?: string | null) {
    try {
        const { ids: ass, fulmine, whatsapp } = await designatiIncarico("chiusura_linea");
        void avvisaIncaricoSuWhatsApp(whatsapp, `${titolo}\n${dettaglio}\nRichiesta di ${autore}. Apri il CRM → Chiusura Linea.`);
        if (fulmine && ass.length) {
            const link = dsId ? `/chiusura-linea?ds=${dsId}` : "/chiusura-linea";
            await supabase.from("admin_tasks").insert(ass.map((uid) => ({
                tipo: "chiusura_linea", titolo, dettaglio, link,
                target_role: "admin", created_by: autore, target_user_id: uid,
            })));
        }
    } catch { /* la richiesta resta salvata comunque */ }
}

// ── DETTAGLIO TICKET (modale) ────────────────────────────────────────────
function DettaglioTicket({ t, direzione, puoInviare, onClose, onAggiornata, msg }: {
    t: Ticket; direzione: boolean; puoInviare: boolean; onClose: () => void; onAggiornata: () => void; msg: (m: string) => void;
}) {
    const { user } = useAuth();
    const [rigetto, setRigetto] = useState(false);
    const [motivo, setMotivo] = useState("");
    const [nuoviFile, setNuoviFile] = useState<File[]>([]);
    const [busy, setBusy] = useState(false);
    // QR per il reintegro (CHL-02): il modale sta in portal a z-3000, sopra
    // questa modale (z-[1100])
    const qr = useQrUpload((ricevuti) => setNuoviFile(p => [...p, ...ricevuti]));

    const transizione = async (patch: Record<string, unknown>, evento: Evento) => {
        const { error } = await supabase.from("richieste_disdette").update({
            ...patch, storico: [...(t.storico || []), evento], updated_at: new Date().toISOString(),
        }).eq("id", t.id);
        if (error) { msg("⚠️ Operazione non riuscita: " + error.message); return false; }
        onAggiornata(); onClose();
        return true;
    };

    const gestisci = async () => {
        const ok = await transizione({ status: "gestita", gestita_il: new Date().toISOString() },
            { quando: new Date().toISOString(), tipo: "chiusura", testo: "Disdetta completata" });
        // a gestione avvenuta si spengono le task ⚡ di invio/reintegro di questa DS
        if (ok) {
            try {
                await supabase.from("admin_tasks")
                    .update({ done: true, done_by: user?.name || "—", done_at: new Date().toISOString() })
                    .eq("tipo", "chiusura_linea").eq("done", false).eq("link", `/chiusura-linea?ds=${t.id}`);
            } catch { /* al peggio restano chiudibili a mano dal fulmine */ }
        }
    };

    // VERIFICA (consulente che l'ha sottomessa, o direzione): da_verificare → conclusa.
    // Il malus eventualmente maturato si congela alla data di verifica.
    const concludi = async () => {
        const mal = malusDisdetta(t);
        const ok = await transizione({ status: "conclusa", verificata_il: new Date().toISOString() },
            { quando: new Date().toISOString(), tipo: "verifica", testo: `Disdetta verificata e conclusa${mal > 0 ? ` (malus maturato: ${mal} €)` : ""}` });
        if (ok) {
            try {
                await supabase.from("admin_tasks")
                    .update({ done: true, done_by: user?.name || "—", done_at: new Date().toISOString() })
                    .eq("tipo", "chiusura_linea_verifica").eq("done", false).eq("link", `/chiusura-linea?ds=${t.id}`);
            } catch { /* niente di grave */ }
        }
    };

    const rigetta = async () => {
        if (!motivo.trim()) { msg("⚠️ Scrivi la motivazione del rigetto"); return; }
        const ok = await transizione({ status: "da_integrare", feedback_admin: motivo.trim() },
            { quando: new Date().toISOString(), tipo: "rigetto", testo: `Disdetta bloccata dalla Direzione (Motivo: ${motivo.trim()})` });
        // BUG segnalato dal dir. commerciale (07/08): il rigetto NON spegneva la
        // task ⚡ del designato — la direzione la sua parte l'ha fatta, la palla
        // passa al consulente; al reintegro parte una task nuova.
        if (ok) {
            try {
                await supabase.from("admin_tasks")
                    .update({ done: true, done_by: user?.name || "—", done_at: new Date().toISOString() })
                    .eq("tipo", "chiusura_linea").eq("done", false).eq("link", `/chiusura-linea?ds=${t.id}`);
            } catch { /* al peggio si chiude a mano dal fulmine */ }
        }
    };

    const reintegra = async () => {
        if (!nuoviFile.length) { msg("⚠️ Allega il nuovo PDF prima di reinoltrare"); return; }
        if (busy) return;
        setBusy(true);
        try {
            const caricati: FileRef[] = [];
            for (const f of nuoviFile) {
                const ext = f.name.split(".").pop() || "pdf";
                const path = `disdette/${t.client_id}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
                const { error: upErr } = await supabase.storage.from("contracts").upload(path, f);
                if (upErr) { msg("⚠️ Upload non riuscito: " + upErr.message); return; }
                const { data: pub } = supabase.storage.from("contracts").getPublicUrl(path);
                caricati.push({ url: pub.publicUrl, name: f.name });
            }
            const ok = await transizione(
                { status: "in_attesa", feedback_admin: "", files: [...caricati, ...(t.files || [])] },
                { quando: new Date().toISOString(), tipo: "reintegro", testo: "Nuovo documento caricato per disdetta" });
            if (ok) {
                await registraAllegatiCliente(t.client_id, caricati);
                await taskAiDesignati(`✂️ Disdetta ${t.id} reintegrata: ${nomeCliente(t)} (${t.brand})`, "Nuovo documento caricato dopo il rigetto.", user?.name || "", t.id);
            }
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="glass-panel w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border-white/10 p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-white">Dettaglio {t.id}</h2>
                    <div className="flex items-center gap-2"><StatusBadge status={t.status} />
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                    </div>
                </div>

                <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cliente &amp; Brand</p>
                    <p className="text-[15px] font-bold text-slate-100">{nomeCliente(t)} <span className="text-slate-500 font-medium">• {t.brand}</span></p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Inserita il</p><p className="text-slate-200">{dmy(t.created_at)}</p></div>
                    <div><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tipo invio</p><TipoInvio t={t} /></div>
                </div>
                <div><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Consulente / Negozio</p><p className="text-sm text-slate-200">{t.consulente} ({t.negozio || "—"})</p></div>
                <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Note inserimento</p>
                    <p className="text-sm text-slate-300 bg-white/[0.03] rounded-lg px-3 py-2.5 leading-relaxed">{t.note_consulente || "Nessuna nota fornita."}</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Documenti {t.status === "da_integrare" ? "(da integrare)" : "allegati"}</p>
                    <div className="space-y-1">
                        {(t.files || []).map((f, i) => (
                            <a key={i} href={f.url} target="_blank" rel="noreferrer"
                                className="flex items-center gap-2 text-xs font-semibold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2 hover:bg-indigo-500/20">
                                📎 {f.name}
                            </a>
                        ))}
                        {(t.files || []).length === 0 && <p className="text-xs text-slate-500">Nessun file.</p>}
                    </div>
                </div>

                {/* eventi (audit del ticket) */}
                {(t.storico || []).length > 0 && (
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Storico</p>
                        <div className="space-y-1">
                            {[...t.storico].reverse().map((e, i) => (
                                <p key={i} className="text-[11px] text-slate-400"><span className="text-slate-600">{dmy(e.quando)}</span> — {e.testo}</p>
                            ))}
                        </div>
                    </div>
                )}

                {/* VERIFICA (Luca 06/08): dopo 35gg dalla gestione la pratica torna
                    al consulente; oltre i 3gg di franchigia matura 5€/giorno */}
                {t.status === "da_verificare" && (puoInviare || direzione) && (
                    <div className="p-4 rounded-xl border border-violet-500/30 bg-violet-500/5 space-y-3">
                        <p className="text-[10px] font-bold text-violet-300 uppercase tracking-widest">Verifica finale</p>
                        <p className="text-sm text-slate-200 leading-relaxed">
                            Sono passati {VERIFICA_DOPO_GG} giorni dalla gestione: verifica che la linea risulti
                            effettivamente cessata (niente fatture, niente riattivazioni), poi concludi la pratica.
                        </p>
                        {(() => {
                            const gg = giorniDa(t.verifica_dal);
                            const mal = malusDisdetta(t);
                            return mal > 0
                                ? <p className="text-sm font-bold text-rose-400">⚠️ Malus maturato: {mal} € ({gg} giorni in verifica, franchigia {FRANCHIGIA_GG})</p>
                                : <p className="text-xs text-slate-400">In verifica da {gg} {gg === 1 ? "giorno" : "giorni"} — senza conclusione entro {FRANCHIGIA_GG} giorni scatta un malus di {MALUS_GIORNO} €/giorno.</p>;
                        })()}
                        <button onClick={concludi} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-xs uppercase tracking-wide hover:brightness-110">✓ Verificata — Concludi</button>
                    </div>
                )}
                {t.status === "conclusa" && malusDisdetta(t) > 0 && (
                    <p className="text-xs font-bold text-amber-400">Conclusa in ritardo: malus congelato di {malusDisdetta(t)} € a carico di {t.consulente}.</p>
                )}

                {/* CONSULENTE: reintegro dopo il rigetto (serve la capacita' di invio) */}
                {!direzione && puoInviare && t.status === "da_integrare" && (
                    <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 space-y-3">
                        <div>
                            <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1">Nota dalla Direzione:</p>
                            <p className="text-sm text-rose-200 leading-relaxed">“{t.feedback_admin}”</p>
                        </div>
                        <div className="flex items-stretch gap-2">
                            <label className="flex-1 block border border-dashed border-rose-500/50 rounded-xl p-3.5 text-center cursor-pointer bg-white/[0.02]">
                                <input type="file" multiple accept=".pdf,image/*" className="hidden" onChange={e => { const list = Array.from(e.target.files ?? []); if (list.length) setNuoviFile(p => [...p, ...list]); e.target.value = ""; }} />
                                <span className={cn("text-xs font-semibold", nuoviFile.length ? "text-emerald-400" : "text-rose-300")}>
                                    {nuoviFile.length ? `✅ ${nuoviFile.map(f => f.name).join(", ")}` : "📎 Clicca qui per allegare il nuovo PDF"}
                                </span>
                            </label>
                            <button type="button" onClick={() => qr.openQr("disdetta", "doc")} title="Carica dal telefono via QR"
                                className="px-3 rounded-xl border border-rose-400/40 bg-rose-500/10 text-rose-300 text-xs font-bold hover:bg-rose-500/20 shrink-0 whitespace-nowrap">📱 QR</button>
                        </div>
                        <button onClick={reintegra} disabled={busy || !nuoviFile.length}
                            className={cn("w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wide", nuoviFile.length ? "bg-emerald-600 text-white hover:brightness-110" : "bg-white/10 text-slate-500 cursor-not-allowed")}>
                            {busy ? "Invio…" : "Reinoltra alla Direzione"}
                        </button>
                    </div>
                )}

                {/* DIREZIONE: azioni */}
                {direzione && (t.status === "in_attesa" || t.status === "da_integrare") && !rigetto && (
                    <div className="flex gap-3 pt-3 border-t border-white/10">
                        {t.status === "in_attesa" && (
                            <button onClick={() => setRigetto(true)} className="flex-1 py-3 rounded-xl border border-rose-500/50 text-rose-400 font-bold text-xs uppercase tracking-wide hover:bg-rose-500/10">✕ Rigetta</button>
                        )}
                        <button onClick={gestisci} className="flex-[2] py-3 rounded-xl bg-emerald-600 text-white font-bold text-xs uppercase tracking-wide hover:brightness-110">✓ Segna Gestita</button>
                    </div>
                )}
                {direzione && rigetto && (
                    <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 space-y-3">
                        <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Motivazione rigetto (obbligatoria):</p>
                        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} placeholder="Scrivi qui cosa correggere…" className="glass-input w-full text-sm resize-none !border-rose-500/40" />
                        <div className="flex gap-2">
                            <button onClick={() => setRigetto(false)} className="flex-1 py-2.5 rounded-lg border border-white/15 text-slate-300 font-semibold text-xs">Annulla</button>
                            <button onClick={rigetta} className="flex-[2] py-2.5 rounded-lg bg-rose-600 text-white font-bold text-xs">Conferma Rigetto</button>
                        </div>
                    </div>
                )}
            </div>
            <QrUploadModal qr={qr} />
        </div>
    );
}

// ── PAGINA ───────────────────────────────────────────────────────────────
export default function ChiusuraLineaPage() {
    const { user } = useAuth();
    // due livelli decisi da Amministrazione → Utenti → Permessi (rotellina
    // "Chiusura Linea"): accesso semplice (invia) e gestione (vista direzione)
    const { perms, loaded: permsLoaded } = useRolePermissions(user?.role, user?.grade, user?.id);
    const direzione = capAllowed(user?.role, CAP_DISDETTE.section, CAP_DISDETTE_GESTISCE, perms);
    const puoInviare = direzione || capAllowed(user?.role, CAP_DISDETTE.section, CAP_DISDETTE_INVIA, perms);
    const wholeStore = seesWholeStore(user?.role);
    const { stores: visStores, loaded: visLoaded } = useVisibleStores();
    const negozi = useStores();

    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [sel, setSel] = useState<Ticket | null>(null);
    const [q, setQ] = useState("");
    const [fBrands, setFBrands] = useState<string[]>([]);
    const [fNegozi, setFNegozi] = useState<string[]>([]);
    const [fUtenti, setFUtenti] = useState<string[]>([]);
    const [fDal, setFDal] = useState("");
    const [fAl, setFAl] = useState("");
    const [fStati, setFStati] = useState<string[]>([]);   // [] = tutti gli stati
    const [fMalus, setFMalus] = useState(false);           // tessera 💸: solo pratiche con malus maturato
    const [toast, setToast] = useState("");
    const msg = (m: string) => { setToast(m); setTimeout(() => setToast(""), 5000); };

    // DESIGNATI dell'incarico chiusura_linea (fonte unica src/lib/incarichi):
    // servono per il preset stato — null = non ancora caricati
    const [designati, setDesignati] = useState<string[] | null>(null);
    useEffect(() => {
        let vivo = true;
        designatiIncarico("chiusura_linea").then(({ ids }) => { if (vivo) setDesignati(ids); });
        return () => { vivo = false; };
    }, []);
    const sonoDesignato = !!user?.id && (designati ?? []).includes(user.id);

    // FILTRO PREIMPOSTATO una-tantum (Luca 04/08, pattern Ordine Merce):
    // designato incarico → solo In Attesa (cio' che ha DA LAVORARE); direzione
    // non designata e richiedenti → In Attesa + Da Integrare. Le gestite
    // restano a un click sulla tessera dedicata.
    const presetFatto = useRef(false);
    useEffect(() => {
        if (presetFatto.current || !visLoaded || !permsLoaded || designati === null || !user) return;
        setFStati(sonoDesignato ? ["in_attesa"] : ["in_attesa", "da_integrare", "da_verificare"]);
        presetFatto.current = true;
    }, [visLoaded, permsLoaded, designati, sonoDesignato, user]);

    const load = useCallback(async () => {
        const { data, error } = await supabase.from("richieste_disdette")
            .select("*, clients(nome, cognome, ragione_sociale, cf_piva, tipo)")
            .order("created_at", { ascending: false }).limit(1000);
        if (!error) {
            const righe = (data ?? []) as Ticket[];
            setTickets(righe);
            promuoviDaVerificare(righe); // lazy, senza attendere: al prossimo load si vede
        }
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    // PROMOZIONE LAZY (niente cron): le gestite da oltre 35gg passano a
    // da_verificare e tornano in mano al consulente con task ⚡. La guardia
    // .eq(status,'gestita') fa vincere un solo client concorrente.
    const promuoviDaVerificare = async (righe: Ticket[]) => {
        const limite = new Date(Date.now() - VERIFICA_DOPO_GG * GG).toISOString();
        const mature = righe.filter(t => t.status === "gestita" && (t.gestita_il || t.updated_at) <= limite);
        for (const t of mature.slice(0, 20)) {
            const evento: Evento = { quando: new Date().toISOString(), tipo: "da_verificare", testo: `Trascorsi ${VERIFICA_DOPO_GG} giorni dalla gestione: verifica finale richiesta a ${t.consulente}` };
            const { data: agg } = await supabase.from("richieste_disdette")
                .update({ status: "da_verificare", verifica_dal: new Date().toISOString(), storico: [...(t.storico || []), evento], updated_at: new Date().toISOString() })
                .eq("id", t.id).eq("status", "gestita").select("id");
            if (!agg?.length) continue; // promossa da un altro client
            try {
                const { data: u } = await supabase.from("app_users").select("id").eq("name", t.consulente).limit(1);
                if (u?.length) {
                    await supabase.from("admin_tasks").insert({
                        tipo: "chiusura_linea_verifica",
                        titolo: `🔍 Verifica disdetta ${t.id}: ${nomeCliente(t)} (${t.brand})`,
                        dettaglio: `Gestita ${VERIFICA_DOPO_GG} giorni fa: verifica la cessazione e concludi entro ${FRANCHIGIA_GG} giorni (poi ${MALUS_GIORNO} €/giorno di malus).`,
                        link: `/chiusura-linea?ds=${t.id}`, target_role: "admin",
                        created_by: "Sistema", target_user_id: u[0].id,
                    });
                }
            } catch { /* la promozione resta valida anche senza task */ }
        }
        if (mature.length) {
            const { data } = await supabase.from("richieste_disdette")
                .select("*, clients(nome, cognome, ragione_sociale, cf_piva, tipo)")
                .order("created_at", { ascending: false }).limit(1000);
            if (data) setTickets(data as Ticket[]);
        }
    };

    // deep-link dal fulmine: /chiusura-linea?ds=<id> apre il ticket (letto da
    // window.location per non introdurre il boundary Suspense di useSearchParams)
    const dsAperto = useRef(false);
    useEffect(() => {
        if (dsAperto.current || loading) return;
        dsAperto.current = true;
        const ds = new URLSearchParams(window.location.search).get("ds");
        if (!ds) return;
        const t = tickets.find(x => x.id === ds);
        if (t) setSel(t);
    }, [loading, tickets]);

    // visibilita': direzione tutto; store manager il proprio team (negozi
    // visibili); consulente solo le proprie
    const visibili = useMemo(() => {
        if (direzione) return tickets;
        if (wholeStore) {
            const miei = visStores.length ? visStores : (user?.negozio ? [user.negozio] : []);
            return tickets.filter(t => t.consulente === user?.name || miei.some(m => sameStore(t.negozio, m)));
        }
        return tickets.filter(t => t.consulente === user?.name);
    }, [tickets, direzione, wholeStore, visStores, user?.name, user?.negozio]);

    // consulenti presenti nei ticket visibili: opzioni del filtro utente
    // (rispettano da sole la visibilita' per ruolo)
    const consulentiVisibili = useMemo(
        () => [...new Set(visibili.map(t => t.consulente).filter(Boolean))].sort(),
        [visibili]);

    // tutti i filtri TRANNE lo stato: le tessere contatore contano su questa base
    const baseFiltrati = useMemo(() => {
        let out = visibili;
        const cerca = q.trim().toLowerCase();
        if (cerca) out = out.filter(t => `${nomeCliente(t)} ${t.id} ${t.clients?.cf_piva || ""}`.toLowerCase().includes(cerca));
        if (fBrands.length) out = out.filter(t => fBrands.includes(t.brand));
        if (fNegozi.length) out = out.filter(t => fNegozi.some(n => sameStore(t.negozio, n)));
        if (fUtenti.length) out = out.filter(t => fUtenti.includes(t.consulente));
        const dal = dataIso(fDal), al = dataIso(fAl);
        if (dal) out = out.filter(t => String(t.created_at).slice(0, 10) >= dal);
        if (al) out = out.filter(t => String(t.created_at).slice(0, 10) <= al);
        return out;
    }, [visibili, q, fBrands, fNegozi, fUtenti, fDal, fAl]);

    const filtrati = useMemo(() => {
        let out = fStati.length ? baseFiltrati.filter(t => fStati.includes(t.status)) : baseFiltrati;
        if (fMalus) out = out.filter(t => malusDisdetta(t) > 0);
        return out;
    }, [baseFiltrati, fStati, fMalus]);

    const conta = useMemo(() => ({
        tot: baseFiltrati.length,
        in_attesa: baseFiltrati.filter(t => t.status === "in_attesa").length,
        da_integrare: baseFiltrati.filter(t => t.status === "da_integrare").length,
        da_verificare: baseFiltrati.filter(t => t.status === "da_verificare").length,
        gestita: baseFiltrati.filter(t => t.status === "gestita").length,
        conclusa: baseFiltrati.filter(t => t.status === "conclusa").length,
        malusEur: baseFiltrati.reduce((s2, t) => s2 + malusDisdetta(t), 0),
        malusN: baseFiltrati.filter(t => malusDisdetta(t) > 0).length,
    }), [baseFiltrati]);

    // tessere cliccabili stile Ordine Merce: "Tutte" azzera, "Gestite" e
    // "Concluse" sono esclusive (ri-click = preset del ruolo), le altre si
    // flaggano una a una
    const statClick = (key: string) => {
        const DEF = sonoDesignato ? ["in_attesa"] : ["in_attesa", "da_integrare", "da_verificare"];
        const ESCLUSIVE = ["gestita", "conclusa"];
        if (key === "malus") { setFMalus(v => !v); return; }
        if (key === "tutte") { setFStati([]); setFMalus(false); return; }
        if (ESCLUSIVE.includes(key)) { setFStati(p => (p.length === 1 && p[0] === key) ? DEF : [key]); return; }
        setFStati(p => {
            const base = p.some(s => ESCLUSIVE.includes(s)) ? [] : [...p];
            const i = base.indexOf(key);
            if (i >= 0) base.splice(i, 1); else base.push(key);
            return base;
        });
    };

    // ORDINAMENTO DIREZIONE (dal brief): 1) in_attesa/da_integrare sopra le
    // gestite; 2) programmata scaduta/oggi = priorita' assoluta, programmata
    // futura in basso; 3) FIFO su updated_at (le ferme da piu' tempo prima)
    const ordinatiDirezione = useMemo(() => {
        const peso = (t: Ticket) => (t.status === "conclusa" ? 3 : t.status === "gestita" ? 2 : 1);
        const urgenza = (t: Ticket) => {
            if (t.is_programmata) return (t.data_programmata || "") <= oggiYmd() ? 0 : 2;
            return 1;
        };
        return [...filtrati].sort((a, b) =>
            peso(a) - peso(b) || urgenza(a) - urgenza(b) ||
            String(a.updated_at).localeCompare(String(b.updated_at)));
    }, [filtrati]);

    // ordinamento consulente: i rigetti in cima, poi le piu' recenti
    const ordinatiConsulente = useMemo(() => [...filtrati].sort((a, b) => {
        // da verificare per primo (c'e' un malus che corre), poi i rigetti
        const w = (t: Ticket) => (t.status === "da_verificare" ? 0 : t.status === "da_integrare" ? 1 : 2);
        return w(a) - w(b) || String(b.updated_at).localeCompare(String(a.updated_at));
    }), [filtrati]);

    if (!visLoaded) return <div className="flex items-center gap-3 text-slate-400 py-24 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Caricamento…</div>;

    // tessere contatore (comuni alle due viste): contano su baseFiltrati, cosi'
    // le gestite nascoste dal preset non "spariscono" — restano a un click
    const tessere = (
        /* griglia FLUIDA (segnalazione 06/08): auto-fit invece delle colonne
           fisse — con 7 tessere su schermi stretti andava tutto schiacciato */
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(148px,1fr))]">
            {[
                { key: "in_attesa", label: "In Attesa", icon: "⏳", val: conta.in_attesa, attiva: fStati.includes("in_attesa"), on: "border-amber-400/70 bg-amber-500/10", txt: "text-amber-400" },
                { key: "da_integrare", label: "Da Integrare", icon: "⚠️", val: conta.da_integrare, attiva: fStati.includes("da_integrare"), on: "border-rose-400/70 bg-rose-500/10", txt: "text-rose-400" },
                { key: "da_verificare", label: "Da Verificare", icon: "🔍", val: conta.da_verificare, attiva: fStati.includes("da_verificare"), on: "border-violet-400/70 bg-violet-500/10", txt: "text-violet-300" },
                { key: "gestita", label: "Gestite", icon: "🕐", val: conta.gestita, attiva: fStati.includes("gestita"), on: "border-sky-400/70 bg-sky-500/10", txt: "text-sky-400" },
                { key: "conclusa", label: "Concluse", icon: "✅", val: conta.conclusa, attiva: fStati.includes("conclusa"), on: "border-emerald-400/70 bg-emerald-500/10", txt: "text-emerald-400" },
                { key: "malus", label: "Malus", icon: "💸", val: (Math.round(conta.malusEur * 100) / 100) + " €", attiva: fMalus, on: "border-orange-400/70 bg-orange-500/10", txt: "text-orange-400", sub: conta.malusN ? conta.malusN + (conta.malusN === 1 ? " pratica" : " pratiche") : "nessuna pratica" },
                { key: "tutte", label: "Tutte", icon: "📋", val: conta.tot, attiva: fStati.length === 0, on: "border-indigo-400/70 bg-indigo-500/10", txt: "text-indigo-300" },
            ].map(s => (
                <button key={s.key} type="button" onClick={() => statClick(s.key)}
                    title={s.attiva ? "Filtro attivo — clicca per toglierlo" : "Clicca per filtrare"}
                    className={cn("rounded-2xl border-2 p-3.5 text-left backdrop-blur-xl transition-colors",
                        s.attiva ? s.on : "border-white/10 bg-white/[0.03] hover:border-white/25")}>
                    <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-[10px] font-bold uppercase tracking-widest", s.attiva ? s.txt : "text-slate-500")}>{s.attiva ? "✓ " : ""}{s.label}</span>
                        <span className="text-lg opacity-70">{s.icon}</span>
                    </div>
                    <div className={cn("text-2xl font-black mt-0.5", s.txt)}>{s.val}</div>
                    {"sub" in s && s.sub ? <div className="text-[10px] text-slate-500 mt-0.5">{s.sub}</div> : null}
                </button>
            ))}
        </div>
    );

    return (
        <div className="p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-black text-white flex items-center gap-2.5"><Scissors className="w-6 h-6 text-indigo-400" /> Chiusura Linea</h1>
                        <p className="text-sm text-slate-500 mt-0.5">{direzione ? "Gestione globale delle richieste di disdetta" : puoInviare ? "Invio e monitoraggio delle tue richieste di disdetta" : "Consultazione delle richieste di disdetta"}</p>
                    </div>
                    <div className="flex items-start gap-2 flex-wrap">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca cliente…" className="glass-input !pl-8 text-xs w-44" />
                        </div>
                        {direzione && (
                            <>
                                <div className="w-40"><SelectMulti values={fBrands} onChange={setFBrands} opzioni={BRANDS} placeholder="Brand: tutti" className="glass-input w-full text-xs" /></div>
                                <div className="w-44"><SelectMulti values={fNegozi} onChange={setFNegozi} opzioni={negozi} placeholder="Negozio: tutti" className="glass-input w-full text-xs" /></div>
                            </>
                        )}
                        {consulentiVisibili.length > 1 && (
                            <div className="w-44"><SelectMulti values={fUtenti} onChange={setFUtenti} opzioni={consulentiVisibili} placeholder="Utente: tutti" className="glass-input w-full text-xs" /></div>
                        )}
                        <div className="w-36"><DatePickerInput value={fDal} onChange={setFDal} placeholder="Dal gg/mm/aaaa" /></div>
                        <div className="w-36"><DatePickerInput value={fAl} onChange={setFAl} placeholder="Al gg/mm/aaaa" /></div>
                    </div>
                </div>

                {toast && <div className="px-4 py-2.5 rounded-xl border border-indigo-400/40 bg-indigo-500/10 text-sm font-semibold text-indigo-200">{toast}</div>}

                <div className={cn("grid grid-cols-1 gap-6 items-start", puoInviare && "lg:grid-cols-[350px_1fr]")}>
                    {puoInviare ? <FormInvio onInviata={load} msg={msg} /> : (
                        <p className="text-xs text-slate-500 -mb-2">Consultazione: il tuo ruolo non ha la capacità di invio (si concede da Amministrazione → Utenti → Permessi → rotellina Chiusura Linea).</p>
                    )}

                    {loading ? (
                        <div className="flex items-center gap-3 text-slate-400 py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Caricamento richieste…</div>
                    ) : direzione ? (
                        /* VISTA DIREZIONE: tessere contatore + super-tabella globale */
                        <div className="space-y-4 min-w-0">
                        {tessere}
                        <div className="glass-card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[680px] text-left text-xs">
                                    <thead>
                                        <tr className="bg-white/[0.02] text-slate-500 text-[10px] uppercase tracking-widest">
                                            <th className="px-4 py-3">ID / Invio</th>
                                            <th className="px-4 py-3">Cliente</th>
                                            <th className="px-4 py-3">Tipo invio</th>
                                            <th className="px-4 py-3 text-center">Stato</th>
                                            <th className="px-4 py-3 text-right">Azioni</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ordinatiDirezione.map(t => (
                                            <tr key={t.id} className={cn("border-t border-white/5", (t.status === "gestita" || t.status === "conclusa") && "opacity-50")}>
                                                <td className="px-4 py-3"><div className="font-bold text-slate-100">{t.id}</div><div className="text-[10px] text-slate-500">{dmy(t.created_at)} · agg. {dmy(t.updated_at)}</div></td>
                                                <td className="px-4 py-3"><div className="font-semibold text-slate-200">{nomeCliente(t)}</div><div className="text-[10px] text-slate-500">{t.brand} • {t.negozio || "—"} • {t.consulente}</div></td>
                                                <td className="px-4 py-3"><TipoInvio t={t} /></td>
                                                <td className="px-4 py-3 text-center"><StatusBadge status={t.status} />{malusDisdetta(t) > 0 && <div className="text-[10px] font-extrabold text-orange-400 mt-1">💸 malus {malusDisdetta(t)} €</div>}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <button onClick={() => setSel(t)} className="px-3 py-1.5 rounded-lg border border-indigo-400/60 text-indigo-300 text-[11px] font-bold hover:bg-indigo-500/10">Apri Ticket</button>
                                                </td>
                                            </tr>
                                        ))}
                                        {ordinatiDirezione.length === 0 && (
                                            <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500 text-sm">Nessuna richiesta di disdetta con questi filtri.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        </div>
                    ) : (
                        /* VISTA CONSULENTE: tessere + le mie richieste (SM: anche il team) */
                        <div className="space-y-3 min-w-0">
                            {tessere}
                            <h2 className="text-lg font-bold text-white">{wholeStore ? "Richieste del negozio" : "Le mie richieste"}</h2>
                            {ordinatiConsulente.map(t => (
                                <div key={t.id} className={cn("glass-card p-4 flex items-center justify-between gap-3 flex-wrap", t.status === "da_integrare" && "border-l-4 border-l-rose-500", t.status === "da_verificare" && "border-l-4 border-l-violet-500")}>
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="w-14 h-11 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">{t.id}</div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-slate-100 truncate">{nomeCliente(t)} <span className="text-[11px] text-slate-500 font-medium ml-1">{t.brand}</span></p>
                                            {t.is_programmata
                                                ? <p className="text-[11px] font-semibold text-violet-300">⏳ Prog. al {dmy(t.data_programmata)}</p>
                                                : <p className="text-[11px] text-slate-500">Inviata: {dmy(t.created_at)}{wholeStore ? ` · ${t.consulente}` : ""}</p>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        {malusDisdetta(t) > 0 && <span className="text-[10px] font-extrabold text-orange-400">💸 {malusDisdetta(t)} €</span>}
                                        <StatusBadge status={t.status} />
                                        <button onClick={() => setSel(t)} className="px-3 py-1.5 rounded-lg border border-white/20 text-slate-300 text-[11px] font-bold hover:bg-white/5">Dettagli</button>
                                    </div>
                                </div>
                            ))}
                            {ordinatiConsulente.length === 0 && <p className="text-sm text-slate-500 py-10 text-center">{conta.tot > 0 ? "Nessuna richiesta con questi filtri: prova le tessere qui sopra." : "Nessuna richiesta ancora: usa il modulo a sinistra per inviare la prima."}</p>}
                        </div>
                    )}
                </div>
            </div>

            {sel && <DettaglioTicket t={sel} direzione={direzione} puoInviare={puoInviare} onClose={() => setSel(null)} onAggiornata={load} msg={msg} />}
        </div>
    );
}
