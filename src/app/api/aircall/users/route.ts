import { NextResponse } from "next/server";
import { accesso } from "@/lib/permessiServer";
import { headers } from "next/headers";
import { aircallGet } from "@/lib/aircall";

export const dynamic = "force-dynamic";

// MOD-25 (Luca 10/08): lista utenze Aircall per la tendina del form utenti
// (Amministrazione → Utenti). Credenziali SOLO server; si paginano al massimo
// 10 pagine da 50 (l'account ne ha poche decine).
export async function GET() {
    // 🔒 BLINDATURA (28/08): senza sessione firmata non si passa
    const _g = await accesso(new Request("http://x", { headers: { cookie: (await headers()).get("cookie") || "" } }), "aircall/users");
    if (!_g.ok) return _g.risposta;

    try {
        if (!process.env.AIRCALL_API_ID || !process.env.AIRCALL_API_TOKEN) {
            return NextResponse.json({ error: "Credenziali Aircall non configurate sul server" }, { status: 500 });
        }
        const out: { id: number; name: string; email: string | null }[] = [];
        for (let page = 1; page <= 10; page++) {
            const res = await aircallGet(`/users?per_page=50&page=${page}`);
            const users = Array.isArray(res?.users) ? res.users : [];
            users.forEach((u: { id: number; name?: string; email?: string }) =>
                out.push({ id: u.id, name: u.name || `utente ${u.id}`, email: u.email || null }));
            if (users.length < 50 || !res?.meta?.next_page_link) break;
        }
        out.sort((a, b) => a.name.localeCompare(b.name));
        return NextResponse.json({ ok: true, users: out });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Errore";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
