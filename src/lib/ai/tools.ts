// Tool dell'assistente AI. Ogni tool esegue query PARAMETRICHE (mai SQL libero dal modello),
// applica l'ambito negozi dell'utente e passa i risultati dal filtro di sicurezza (guard).
import { supabase } from "@/lib/supabaseClient";
import { Scope, applyStoreScope } from "./scope";
import { redact } from "./guard";
import type { ToolDef } from "./deepseek";

const MAX_ROWS = 200;

// I dati reali hanno valori incoerenti (WindTre/WIND3/W3, VODAFONE/Vodafone, FASTWEB/Fastweb):
// normalizziamo gli alias e confrontiamo sempre case-insensitive.
const BRAND_ALIASES: Record<string, string[]> = {
  windtre: ["windtre", "wind3", "w3", "wind tre"],
  vodafone: ["vodafone", "vf", "vodafone store"],
  fastweb: ["fastweb", "fw"],
  sky: ["sky"],
  tim: ["tim"],
  iliad: ["iliad"],
  eni: ["eni"],
  edison: ["edison"],
  energia: ["energia", "luce e gas", "luce", "gas", "s4", "barton"],
};
function brandVariants(input: string): string[] {
  const k = input.trim().toLowerCase();
  for (const [, variants] of Object.entries(BRAND_ALIASES)) {
    if (variants.some((v) => k.includes(v) || v.includes(k))) return variants;
  }
  return [k];
}

const CONTRACT_COLS =
  "id, data, brand, categoria, prodotto, stato, negozio, venditore, codice_attivazione, data_registrazione, data_attivazione, is_demo";

// ── Definizioni esposte al modello ──────────────────────────────────────────
export const TOOL_DEFS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "search_contracts",
      description:
        "Cerca contratti nel CRM con filtri. Usa questo per elencare contratti specifici. " +
        "Il confronto su brand/stato e' case-insensitive e gestisce gli alias (WindTre=WIND3).",
      parameters: {
        type: "object",
        properties: {
          brand: { type: "string", description: "es. Vodafone, WindTre, Fastweb, Sky, ENI" },
          stato: { type: "string", description: "es. Attivo, In lavorazione, Annullato, Sospeso" },
          negozio: { type: "string" },
          venditore: { type: "string" },
          categoria: { type: "string", description: "es. MOBILE, FISSO, ENERGIA" },
          prodotto: { type: "string" },
          cliente: { type: "string", description: "nome o codice fiscale del cliente" },
          from: { type: "string", description: "data inizio ISO (YYYY-MM-DD)" },
          to: { type: "string", description: "data fine ISO (YYYY-MM-DD)" },
          include_demo: { type: "boolean", description: "default true; i dati demo sono la maggioranza" },
          limit: { type: "number", description: "max righe (default 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "contracts_breakdown",
      description:
        "Conteggi aggregati dei contratti raggruppati per un campo. Usa QUESTO (non search_contracts) " +
        "per domande tipo 'quanti contratti per brand/stato/negozio'.",
      parameters: {
        type: "object",
        properties: {
          group_by: {
            type: "string",
            enum: ["brand", "stato", "negozio", "venditore", "categoria", "prodotto"],
          },
          brand: { type: "string" },
          stato: { type: "string" },
          negozio: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          include_demo: { type: "boolean" },
        },
        required: ["group_by"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_clients",
      description: "Cerca clienti per nome, cognome, ragione sociale o codice fiscale/P.IVA.",
      parameters: {
        type: "object",
        properties: { q: { type: "string" }, limit: { type: "number" } },
        required: ["q"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_users",
      description:
        "Elenca i collaboratori (nome, ruolo, negozio). Non restituisce mai dati retributivi o credenziali.",
      parameters: {
        type: "object",
        properties: { role: { type: "string" }, negozio: { type: "string" }, q: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "usati_lookup",
      description: "Cerca un dispositivo usato per IMEI o modello.",
      parameters: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_documents",
      description:
        "Ricerca full-text nei documenti aziendali (procedure, listini, canvass) e ne restituisce estratti.",
      parameters: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_comunicazioni",
      description: "Elenca/cerca le comunicazioni aziendali piu' recenti.",
      parameters: { type: "object", properties: { q: { type: "string" }, limit: { type: "number" } } },
    },
  },
];

// Tool di SCRITTURA: dichiarati al modello ma MAI eseguiti qui.
// La route li trasforma in una "pending_action" da confermare in UI.
export const WRITE_TOOL_DEFS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "send_chat_broadcast",
      description:
        "Invia un messaggio in chat a tutti i collaboratori di un negozio/area, come chat private individuali. " +
        "Richiede conferma esplicita dell'utente prima dell'invio.",
      parameters: {
        type: "object",
        properties: {
          negozio: { type: "string", description: "nome del negozio destinatario" },
          area: { type: "string", description: "in alternativa: pv | cc | ob | sede" },
          message: { type: "string" },
        },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_comunicazione",
      description: "Crea una comunicazione aziendale. Richiede conferma esplicita dell'utente.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" }, content: { type: "string" }, type: { type: "string" } },
        required: ["title", "content"],
      },
    },
  },
];

export const WRITE_TOOL_NAMES = new Set(WRITE_TOOL_DEFS.map((t) => t.function.name));

// ── Esecuzione ──────────────────────────────────────────────────────────────
function ilikeAny(q: any, col: string, variants: string[]) {
  return q.or(variants.map((v) => `${col}.ilike.%${v}%`).join(","));
}

export async function runTool(name: string, args: any, scope: Scope): Promise<any> {
  switch (name) {
    case "search_contracts": {
      let q = supabase.from("contracts").select(CONTRACT_COLS, { count: "exact" });
      q = applyStoreScope(q, scope, "negozio");
      if (args.brand) q = ilikeAny(q, "brand", brandVariants(args.brand));
      if (args.stato) q = q.ilike("stato", `%${args.stato}%`);
      if (args.negozio) q = q.ilike("negozio", `%${args.negozio}%`);
      if (args.venditore) q = q.ilike("venditore", `%${args.venditore}%`);
      if (args.categoria) q = q.ilike("categoria", `%${args.categoria}%`);
      if (args.prodotto) q = q.ilike("prodotto", `%${args.prodotto}%`);
      if (args.from) q = q.gte("data_registrazione", args.from);
      if (args.to) q = q.lte("data_registrazione", args.to);
      if (args.include_demo === false) q = q.not("is_demo", "is", true);
      const { data, error, count } = await q
        .order("data_registrazione", { ascending: false })
        .limit(Math.min(args.limit ?? 50, MAX_ROWS));
      if (error) throw new Error(error.message);
      let rows = redact(data || []);
      if (args.cliente) {
        // filtro cliente lato applicativo (il nome sta su clients)
        const { data: cl } = await supabase
          .from("clients").select("id").or(`nome.ilike.%${args.cliente}%,cognome.ilike.%${args.cliente}%`);
        const ids = new Set((cl || []).map((c: any) => c.id));
        rows = rows.filter((r: any) => ids.has(r.client_id));
      }
      const demo = rows.filter((r: any) => r.is_demo).length;
      return { total: count ?? rows.length, returned: rows.length, demo_rows: demo, rows };
    }

    case "contracts_breakdown": {
      let q = supabase.from("contracts").select(CONTRACT_COLS);
      q = applyStoreScope(q, scope, "negozio");
      if (args.brand) q = ilikeAny(q, "brand", brandVariants(args.brand));
      if (args.stato) q = q.ilike("stato", `%${args.stato}%`);
      if (args.negozio) q = q.ilike("negozio", `%${args.negozio}%`);
      if (args.from) q = q.gte("data_registrazione", args.from);
      if (args.to) q = q.lte("data_registrazione", args.to);
      if (args.include_demo === false) q = q.not("is_demo", "is", true);
      const { data, error } = await q.limit(2000);
      if (error) throw new Error(error.message);
      const key = args.group_by as string;
      const counts: Record<string, number> = {};
      let demo = 0;
      (data || []).forEach((r: any) => {
        const k = (r[key] ?? "(vuoto)").toString();
        counts[k] = (counts[k] || 0) + 1;
        if (r.is_demo) demo++;
      });
      return {
        group_by: key,
        total: (data || []).length,
        demo_rows: demo,
        breakdown: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ [key]: k, count: v })),
      };
    }

    case "search_clients": {
      const like = `%${args.q}%`;
      const { data, error } = await supabase
        .from("clients").select("*")
        .or(`nome.ilike.${like},cognome.ilike.${like},ragione_sociale.ilike.${like},cf_piva.ilike.${like}`)
        .limit(Math.min(args.limit ?? 20, 50));
      if (error) throw new Error(error.message);
      return { rows: redact(data || []) };
    }

    case "list_users": {
      let q = supabase.from("app_users")
        .select("id, full_name, role, grade, primary_store, active")
        .eq("active", true);
      if (args.role) q = q.ilike("role", `%${args.role}%`);
      if (args.negozio) q = q.ilike("primary_store", `%${args.negozio}%`);
      if (args.q) q = q.ilike("full_name", `%${args.q}%`);
      const { data, error } = await q.order("full_name").limit(MAX_ROWS);
      if (error) throw new Error(error.message);
      return { rows: redact(data || []) };
    }

    case "usati_lookup": {
      const like = `%${args.q}%`;
      const { data, error } = await supabase.from("usati").select("*")
        .or(`imei.ilike.${like},modello.ilike.${like}`).limit(25);
      if (error) throw new Error(error.message);
      return { rows: redact(data || []) };
    }

    case "search_documents": {
      const { data, error } = await supabase
        .from("document_chunks")
        .select("page, content, documentation(name, file_path)")
        .textSearch("tsv", args.q, { config: "italian", type: "plain" })
        .limit(8);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        return { rows: [], note: "Nessun documento indicizzato corrisponde. La libreria documenti potrebbe non essere ancora stata caricata/indicizzata." };
      }
      return {
        rows: data.map((r: any) => ({
          documento: r.documentation?.name, page: r.page,
          estratto: (r.content || "").slice(0, 600),
        })),
      };
    }

    case "get_comunicazioni": {
      let q = supabase.from("comunicazioni").select("id, title, type, content, date_display, created_at");
      if (args.q) q = q.or(`title.ilike.%${args.q}%,content.ilike.%${args.q}%`);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(Math.min(args.limit ?? 10, 30));
      if (error) throw new Error(error.message);
      return { rows: redact(data || []) };
    }

    default:
      throw new Error(`Tool sconosciuto: ${name}`);
  }
}
