// Helper server-side per Aircall. Le credenziali stanno SOLO nelle env del
// server (AIRCALL_API_ID / AIRCALL_API_TOKEN, senza NEXT_PUBLIC): non finiscono
// nel bundle del browser. Usare SOLO da route handler / codice server.

const API = "https://api.aircall.io/v1";

function authHeader(): string {
    const id = process.env.AIRCALL_API_ID || "";
    const token = process.env.AIRCALL_API_TOKEN || "";
    return "Basic " + Buffer.from(`${id}:${token}`).toString("base64");
}

export async function aircallGet(path: string): Promise<any> {
    const res = await fetch(API + path, { headers: { Authorization: authHeader() } });
    if (!res.ok) throw new Error(`Aircall GET ${path} -> ${res.status}`);
    return res.json();
}

export async function aircallPost(path: string, body: unknown): Promise<any> {
    const res = await fetch(API + path, {
        method: "POST",
        headers: { Authorization: authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`Aircall POST ${path} -> ${res.status}: ${txt.slice(0, 300)}`);
    return txt ? JSON.parse(txt) : {};
}

/** Solo cifre; per il confronto con i clienti si usano le ultime 9 (numero IT
 *  senza prefisso), cosi' "+39 333 1234567" e "3331234567" coincidono. */
export function soloCifre(s: string | null | undefined): string {
    return String(s || "").replace(/\D/g, "");
}
export function codaNumero(s: string | null | undefined, n = 9): string {
    const d = soloCifre(s);
    return d.length >= n ? d.slice(-n) : d;
}
