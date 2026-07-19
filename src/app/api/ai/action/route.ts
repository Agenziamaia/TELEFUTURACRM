import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getScope } from "@/lib/ai/scope";
import { WRITE_TOOL_NAMES } from "@/lib/ai/tools";
import { areaOf, isAdminOrAbove } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Esegue un'azione GIA' CONFERMATA dall'utente (arriva dalla scheda di conferma in UI).
 * L'endpoint /api/ai/chat non esegue mai scritture: le propone soltanto.
 */
export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON non valido" }, { status: 400 }); }

  const { userId, action } = body || {};
  if (!userId || !action?.tool) {
    return NextResponse.json({ error: "userId e action sono obbligatori" }, { status: 400 });
  }
  if (!WRITE_TOOL_NAMES.has(action.tool)) {
    return NextResponse.json({ error: `Azione non consentita: ${action.tool}` }, { status: 400 });
  }

  const scope = await getScope(userId);
  if (!scope) return NextResponse.json({ error: "Utente non valido" }, { status: 403 });

  const args = action.args || {};

  try {
    if (action.tool === "send_chat_broadcast") {
      if (!args.message?.trim()) return NextResponse.json({ error: "Messaggio vuoto" }, { status: 400 });

      // Destinatari: per negozio oppure per area
      let q = supabase.from("app_users").select("id, full_name, role, primary_store").eq("active", true);
      if (args.negozio) q = q.ilike("primary_store", `%${args.negozio}%`);
      const { data: users, error } = await q;
      if (error) throw new Error(error.message);

      let targets = (users || []).filter((u: any) => u.id !== scope.userId);
      if (args.area) targets = targets.filter((u: any) => areaOf(u.role) === args.area);
      if (targets.length === 0) return NextResponse.json({ error: "Nessun destinatario trovato" }, { status: 400 });

      const { data: sent, error: bErr } = await supabase.rpc("chat_broadcast", {
        p_me: scope.userId,
        p_members: targets.map((t: any) => t.id),
        p_body: args.message.trim(),
      });
      if (bErr) throw new Error(bErr.message);

      return NextResponse.json({
        ok: true,
        result: `Messaggio inviato a ${sent} destinatari.`,
        recipients: targets.map((t: any) => t.full_name),
      });
    }

    if (action.tool === "create_comunicazione") {
      if (!isAdminOrAbove(scope.role) && scope.role !== "dev") {
        return NextResponse.json({ error: "Solo amministrazione/direzione può creare comunicazioni." }, { status: 403 });
      }
      const { error } = await supabase.from("comunicazioni").insert({
        title: args.title, content: args.content, type: args.type || "informativo",
        date_display: new Date().toLocaleDateString("it-IT"),
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, result: "Comunicazione creata." });
    }

    return NextResponse.json({ error: "Azione non gestita" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
