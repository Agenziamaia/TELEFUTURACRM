// LASCIAPASSARE PERSONALE (Blindatura fase B, Luca 28/08) — SOLO SERVER.
//
// Il problema che risolve: il browser parla col database usando la chiave
// "anon", che è PUBBLICA (chiunque apra il sito la vede). Con quella chiave
// il database non sa CHI sta chiedendo, quindi le uniche regole possibili
// sono "aperto a tutti" — ed è per questo che oggi le protezioni vivono solo
// nell'interfaccia.
//
// Qui il server firma, al login, un lasciapassare personale (JWT HS256 con
// il JWT secret del progetto Supabase): dentro c'è CHI sei. Il browser lo
// presenta al database a ogni richiesta, e le policy possono finalmente
// filtrare per identità — l'anonimo non passa più.
//
// Claim custom (prefisso tf_ per non collidere con quelli di Supabase):
//   tf_uid   id utente CRM        tf_role  ruolo CRM
//   tf_admin true per admin/dev   tf_stores negozi in visibilità
import crypto from "crypto";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

export type ClaimTf = {
    uid: string;
    role: string;
    admin: boolean;
    stores: string[];
};

/** Il segreto del progetto Supabase (Settings → API → JWT Settings). Assente
 *  = niente lasciapassare: il CRM continua come prima, con la sola anon key. */
export const jwtSecretPresente = () => !!(process.env.SUPABASE_JWT_SECRET || "").trim();

export const DURATA_TOKEN_ORE = 12;

/** Firma il lasciapassare. `role: authenticated` è il ruolo che PostgREST
 *  riconosce: le policy potranno distinguerlo dall'anonimo. */
export function firmaTokenTf(c: ClaimTf, secret = process.env.SUPABASE_JWT_SECRET || ""): string | null {
    if (!secret.trim()) return null;
    const ora = Math.floor(Date.now() / 1000);
    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
        role: "authenticated",          // ← il database lo distingue da "anon"
        sub: c.uid,
        aud: "authenticated",
        iat: ora,
        exp: ora + DURATA_TOKEN_ORE * 3600,
        tf_uid: c.uid,
        tf_role: c.role || "",
        tf_admin: !!c.admin,
        tf_stores: Array.isArray(c.stores) ? c.stores.slice(0, 60) : [],
    };
    const corpo = `${b64(header)}.${b64(payload)}`;
    const firma = crypto.createHmac("sha256", secret).update(corpo).digest("base64url");
    return `${corpo}.${firma}`;
}
