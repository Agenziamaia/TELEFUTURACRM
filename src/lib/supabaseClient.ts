import { createClient } from "@supabase/supabase-js";
import { tokenTf } from "@/lib/tokenClient";
import { fileUrlDa } from "@/lib/fileUrl";

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

/* ═══ GLI INDIRIZZI DEI FILE PASSANO DAL CUSTODE (31/08) ═════════════════
   Undici depositi su dodici erano pubblici — 13 GB, con dentro 6.807
   contratti di clienti e 8.703 allegati di posta. La rotta
   `/storage/v1/object/public/…` Supabase la serve a chiunque conosca
   l'indirizzo: nessun login, nessuna chiave, da qualunque parte del mondo.

   ⚠️ PERCHÉ QUI E NON NEI 26 PUNTI CHE LO CHIAMANO. Perché sono 26, in venti
   file diversi, e fanno tutti la stessa identica cosa: chiedere l'indirizzo
   di un file. Correggerli a mano vuol dire 26 occasioni di sbagliarne uno — e
   quello sbagliato non dà errore: mostra un allegato rotto a un negozio, un
   giorno a caso. Cambiandolo qui non se ne può dimenticare nessuno, e chi
   domani scriverà il ventisettesimo lo troverà già protetto senza saperlo.

   `getPublicUrl` continua a chiamarsi così e a restituire la stessa forma:
   cambia solo dove punta — `/api/file/<deposito>/<percorso>`, che prima di
   consegnare il file chiede chi sei. */
const _from = supabase.storage.from.bind(supabase.storage);
supabase.storage.from = ((deposito: string) => {
  const s = _from(deposito);
  const _pub = s.getPublicUrl.bind(s);
  s.getPublicUrl = ((percorso: string, opzioni?: unknown) => {
    const vero = _pub(percorso, opzioni as never);
    return { data: { publicUrl: fileUrlDa(deposito, percorso) }, error: (vero as { error?: unknown })?.error ?? null };
  }) as typeof s.getPublicUrl;
  return s;
}) as typeof supabase.storage.from;
