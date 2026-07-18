"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, Paperclip, Trash2, ExternalLink, Upload } from "lucide-react";
import { notify, dbError } from "./toast";
import { MoneyInput } from "./money";

/* ------------------------------------------------------------------ */
/* Spese fisse del negozio: 6 voci standard SEMPRE presenti            */
/* ------------------------------------------------------------------ */
export const FIXED_VOCI = ["Affitto", "Assicurazione", "Utenze", "Allarme", "TARI", "Tassa insegna"];

interface FixedItem {
    id: string;
    label: string;
    amount_azienda: number | null;
    amount_visibile: number | null;
}

export function FixedStoreCosts({ storeId, month, onTotals }: { storeId: string; month: string; onTotals?: (a: number, v: number) => void }) {
    const [rows, setRows] = useState<FixedItem[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("store_cost_items")
            .select("id,label,amount_azienda,amount_visibile")
            .eq("store_id", storeId)
            .eq("month", month)
            .eq("is_fixed", true);
        if (dbError("Caricamento spese fisse", error)) {
            setLoading(false);
            return;
        }
        let list = (data as FixedItem[]) || [];
        // auto-riparazione: se al negozio mancano voci fisse per questo mese, le creo
        const missing = FIXED_VOCI.filter((l) => !list.some((r) => r.label === l));
        if (missing.length) {
            const { error: e2 } = await supabase
                .from("store_cost_items")
                .insert(missing.map((label) => ({ store_id: storeId, label, amount_azienda: 0, amount_visibile: 0, is_fixed: true, month })));
            if (!e2) {
                const again = await supabase
                    .from("store_cost_items")
                    .select("id,label,amount_azienda,amount_visibile")
                    .eq("store_id", storeId)
                    .eq("month", month)
                    .eq("is_fixed", true);
                list = (again.data as FixedItem[]) || list;
            }
        }
        list.sort((a, b) => FIXED_VOCI.indexOf(a.label) - FIXED_VOCI.indexOf(b.label));
        setRows(list);
        setLoading(false);
    }, [storeId, month]);
    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!onTotals) return;
        onTotals(
            rows.reduce((s, r) => s + (Number(r.amount_azienda) || 0), 0),
            rows.reduce((s, r) => s + (Number(r.amount_visibile) || 0), 0),
        );
    }, [rows, onTotals]);

    const upd = (id: string, field: "amount_azienda" | "amount_visibile", value: number | null) =>
        setRows((p) => p.map((r) => (r.id === id ? { ...r, [field]: value ?? 0 } : r)));
    const save = async (r: FixedItem) => {
        const { error } = await supabase
            .from("store_cost_items")
            .update({ amount_azienda: r.amount_azienda || 0, amount_visibile: r.amount_visibile || 0 })
            .eq("id", r.id);
        dbError("Salvataggio spesa fissa", error);
    };

    if (loading)
        return (
            <div className="flex justify-center py-6 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
            </div>
        );

    return (
        <div className="space-y-1.5">
            {rows.map((r) => (
                <div key={r.id} className="glass-card p-2.5 rounded-lg flex items-center gap-2">
                    <span className="flex-1 text-sm text-slate-200">{r.label}</span>
                    <MoneyInput value={r.amount_azienda} onChange={(v) => upd(r.id, "amount_azienda", v)} onCommit={() => save(r)} wrapClass="w-28" className="py-1 text-sm" title="Azienda" />
                    <MoneyInput value={r.amount_visibile} onChange={(v) => upd(r.id, "amount_visibile", v)} onCommit={() => save(r)} wrapClass="w-28" className="py-1 text-sm" title="Visibile" />
                </div>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Allegati del negozio, sempre con un nome                            */
/* ------------------------------------------------------------------ */
const STORE_BUCKET = "store-attachments";

interface StoreAtt {
    id: string;
    name: string;
    storage_path: string;
    created_at: string;
}

export function StoreAttachments({ storeId }: { storeId: string }) {
    const [rows, setRows] = useState<StoreAtt[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [name, setName] = useState("");
    const [confirmDel, setConfirmDel] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("store_attachments")
            .select("id,name,storage_path,created_at")
            .eq("store_id", storeId)
            .order("created_at", { ascending: false });
        if (!dbError("Caricamento allegati", error)) setRows((data as StoreAtt[]) || []);
        setLoading(false);
    }, [storeId]);
    useEffect(() => {
        load();
    }, [load]);

    const upload = async (file: File) => {
        const attName = name.trim() || file.name.replace(/\.[^.]+$/, "");
        setUploading(true);
        const path = `${storeId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const up = await supabase.storage.from(STORE_BUCKET).upload(path, file);
        if (up.error) {
            notify(`Upload fallito: ${up.error.message}`);
            setUploading(false);
            return;
        }
        const { error } = await supabase.from("store_attachments").insert({ store_id: storeId, name: attName, storage_path: path });
        if (!dbError("Registrazione allegato", error)) {
            notify(`Allegato "${attName}" caricato ✓`, "ok");
            setName("");
        }
        setUploading(false);
        load();
    };

    const open = (a: StoreAtt) => {
        const { data } = supabase.storage.from(STORE_BUCKET).getPublicUrl(a.storage_path);
        if (data?.publicUrl) window.open(data.publicUrl, "_blank");
    };

    const del = async (a: StoreAtt) => {
        if (a.storage_path) await supabase.storage.from(STORE_BUCKET).remove([a.storage_path]);
        const { error } = await supabase.from("store_attachments").delete().eq("id", a.id);
        if (!dbError("Eliminazione allegato", error)) notify("Allegato eliminato", "ok");
        setConfirmDel(null);
        load();
    };

    return (
        <div className="space-y-3">
            {/* Upload */}
            <div className="glass-card p-3 rounded-xl flex flex-wrap items-center gap-2">
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome allegato (es. Contratto affitto)"
                    className="glass-input flex-1 min-w-[180px] py-1.5 text-sm"
                />
                <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) upload(file);
                        e.target.value = "";
                    }}
                />
                <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="primary-btn text-sm px-3 py-1.5 flex items-center gap-1.5"
                >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Carica file
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-8 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                </div>
            ) : (
                <div className="space-y-1.5">
                    {rows.map((a) => (
                        <div key={a.id} className="glass-card p-2.5 rounded-lg flex items-center gap-2">
                            <Paperclip className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <button onClick={() => open(a)} className="flex-1 min-w-0 text-left">
                                <span className="block text-sm text-slate-200 truncate">{a.name}</span>
                                <span className="block text-[10px] text-slate-500">{new Date(a.created_at).toLocaleDateString("it-IT")}</span>
                            </button>
                            <button onClick={() => open(a)} className="text-slate-500 hover:text-slate-200 p-1" title="Apri">
                                <ExternalLink className="w-4 h-4" />
                            </button>
                            {confirmDel === a.id ? (
                                <span className="flex items-center gap-1">
                                    <button onClick={() => del(a)} className="text-[10px] px-2 py-1 rounded bg-rose-500/20 text-rose-300">Elimina</button>
                                    <button onClick={() => setConfirmDel(null)} className="text-[10px] text-slate-500 px-1">Annulla</button>
                                </span>
                            ) : (
                                <button onClick={() => setConfirmDel(a.id)} className="text-slate-500 hover:text-rose-400 p-1" title="Elimina">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                    {!rows.length && <p className="text-xs text-slate-600 px-1">Nessun allegato. Dai un nome e carica un file.</p>}
                </div>
            )}
        </div>
    );
}
