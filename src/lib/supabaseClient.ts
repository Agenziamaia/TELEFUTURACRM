import { createClient } from "@supabase/supabase-js";
import { tokenTf } from "@/lib/tokenClient";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  );
}

// BLINDATURA fase B (Luca 28/08): a ogni richiesta il client presenta il
// LASCIAPASSARE personale dell'utente (firmato dal server al login), così il
// database sa CHI sta chiedendo e le policy possono filtrare davvero.
// `null` = nessun lasciapassare (blindatura non ancora accesa, oppure siamo
// lato server): si ripiega sulla chiave anonima e tutto funziona come prima.
export const supabase = createClient(url, anonKey, {
  accessToken: async () => await tokenTf(),
});
