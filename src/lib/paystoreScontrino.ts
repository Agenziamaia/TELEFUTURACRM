import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { stessoMagazzino } from "@/lib/negoziNomi";

/* ═══ QUANTO HA PAGATO IL CLIENTE, SU QUEL NUMERO ══════════════════════════
   Lo scontrino è l'unico documento che dice quanto credito è stato incassato:
   la riga è scritta «RICARICA WINDTRE 12 3200411041» — marchio, importo,
   numero. Sommando le righe di quel numero si ha il tetto invalicabile: oltre
   quella cifra, qualunque erogazione è un regalo.

   ⚠️ NASCE PER SOSTITUIRE UNA REGOLA CHE SBAGLIAVA. Prima, due righe identiche
   sulla stessa vendita facevano fermare il motore: «stesso numero e stesso
   importo, saranno un doppio clic». Ma comporre un importo con due tagli uguali
   è il modo NORMALE di vendere quando il taglio esatto non esiste — misurato il
   05/09: WindTre non ha il taglio da 12, e una ricarica da 12 € si vende come
   6+6. Lo scontrino diceva «RICARICA WINDTRE 12», il cliente aveva pagato 12, e
   il CRM si fermava chiedendo a una persona di guardare. Ogni volta.
   La domanda giusta non è «ci sono due righe uguali?» ma «sto per erogare più
   di quanto ha pagato?». */

/** Le righe di ricarica stampate su un documento: importo e numero. */
export function ricaricheSuXml(xml: string): { numero: string; importo: number }[] {
    const out: { numero: string; importo: number }[] = [];
    for (const m of String(xml || "").matchAll(/description="([^"]*?)"/g)) {
        if (!/ricarica/i.test(m[1])) continue;
        /* «RICARICA WINDTRE 12 3200411041» → 12 e 3200411041. L'importo è il
           penultimo numero, il telefono l'ultimo. */
        const t = m[1].match(/\s(\d+(?:[.,]\d+)?)\s+(\d{7,11})\s*$/);
        if (t) out.push({ importo: Number(String(t[1]).replace(",", ".")), numero: t[2] });
    }
    return out;
}

/** Quanto risulta incassato per quel numero, in quel posto, intorno a
 *  quell'istante. `null` = nessun documento trovato: non si sa, e chi chiama
 *  non deve fingere di saperlo. */
export async function incassatoPerNumero(
    negozio: string | null, numero: string, quando: string, azienda?: string | null,
): Promise<number | null> {
    const n = String(numero || "").replace(/\D/g, "");
    if (!n || !negozio) return null;
    const t = new Date(quando).getTime();
    const { data } = await supabase.from("print_jobs")
        .select("negozio, request_xml, meta")
        .in("kind", ["fiscal_receipt", "fiscal"]).eq("status", "done")
        .gte("created_at", new Date(t - 15 * 60000).toISOString())
        .lte("created_at", new Date(t + 5 * 60000).toISOString());
    const suoi = ((data || []) as { negozio: string; request_xml: string; meta: Record<string, unknown> | null }[])
        .filter((j) => stessoMagazzino(j.negozio, negozio))
        .filter((j) => !azienda || !j.meta?.azienda || String(j.meta.azienda) === String(azienda));
    if (!suoi.length) return null;
    let totale = 0, trovato = false;
    for (const j of suoi) {
        for (const r of ricaricheSuXml(j.request_xml)) {
            if (r.numero === n) { totale += r.importo; trovato = true; }
        }
    }
    return trovato ? totale : null;
}
