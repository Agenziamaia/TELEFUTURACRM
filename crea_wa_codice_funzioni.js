// LE FUNZIONI DEL CODICE WHATSAPP — stesso pattern delle password del CRM
// (`verify_login`, `change_password`): funzioni SECURITY DEFINER con pgcrypto,
// perché la tabella è chiusa a chiave e dal browser non si legge.
//
// Il codice non viaggia e non si salva in chiaro: entra, viene confrontato con
// crypt() dentro il database, esce solo un sì o un no. Nemmeno Luca può
// rileggerlo — se lo dimenticano, lo azzera e ne scelgono un altro.
//
// Cinque tentativi sbagliati = cinque minuti di stop, contati dal server: chi
// prova a indovinare non ha un numero infinito di colpi.
//
// Idempotente. Lancio: NODE_PATH=<dir pg> node crea_wa_codice_funzioni.js
const fs = require("fs");
const path = require("path");

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const { Client } = require("pg");
const client = new Client({
  host: "aws-1-eu-central-2.pooler.supabase.com", port: 5432, database: "postgres",
  user: `postgres.${ref}`, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

const SQL = [
  // bcrypt si porta il sale dentro l'impronta: la colonna non serve
  `alter table wa_codice_accesso alter column sale drop not null`,

  `create or replace function public.wa_codice_stato(p_user uuid)
   returns json language plpgsql security definer set search_path = public, extensions as $$
   declare r record;
   begin
     select * into r from wa_codice_accesso where user_id = p_user;
     return json_build_object(
       'impostato', r.user_id is not null,
       'bloccato_fino', case when r.bloccato_fino > now() then r.bloccato_fino else null end);
   end $$`,

  // SI IMPOSTA UNA VOLTA SOLA: se c'è già, si cambia solo conoscendo il vecchio
  // (o dopo che l'admin l'ha azzerato). Minimo quattro caratteri.
  `create or replace function public.wa_codice_imposta(p_user uuid, p_codice text, p_vecchio text default null)
   returns json language plpgsql security definer set search_path = public, extensions as $$
   declare r record;
   begin
     if p_codice is null or length(btrim(p_codice)) < 4 then
       return json_build_object('ok', false, 'errore', 'Il codice deve avere almeno 4 caratteri.');
     end if;
     select * into r from wa_codice_accesso where user_id = p_user;
     if r.user_id is not null then
       if p_vecchio is null or r.impronta <> crypt(p_vecchio, r.impronta) then
         return json_build_object('ok', false, 'errore', 'Codice attuale sbagliato.');
       end if;
       update wa_codice_accesso
          set impronta = crypt(btrim(p_codice), gen_salt('bf')),
              aggiornato_il = now(), tentativi = 0, bloccato_fino = null
        where user_id = p_user;
     else
       insert into wa_codice_accesso (user_id, impronta, sale)
       values (p_user, crypt(btrim(p_codice), gen_salt('bf')), null);
     end if;
     return json_build_object('ok', true);
   end $$`,

  `create or replace function public.wa_codice_verifica(p_user uuid, p_codice text)
   returns json language plpgsql security definer set search_path = public, extensions as $$
   declare r record; buono boolean;
   begin
     select * into r from wa_codice_accesso where user_id = p_user;
     if r.user_id is null then
       return json_build_object('ok', false, 'errore', 'Nessun codice impostato.');
     end if;
     if r.bloccato_fino is not null and r.bloccato_fino > now() then
       return json_build_object('ok', false, 'bloccato_fino', r.bloccato_fino,
                                'errore', 'Troppi tentativi: riprova fra qualche minuto.');
     end if;
     buono := r.impronta = crypt(coalesce(btrim(p_codice), ''), r.impronta);
     if buono then
       update wa_codice_accesso set tentativi = 0, bloccato_fino = null, ultimo_ok_il = now()
        where user_id = p_user;
       return json_build_object('ok', true);
     end if;
     update wa_codice_accesso
        set tentativi = r.tentativi + 1,
            bloccato_fino = case when r.tentativi + 1 >= 5 then now() + interval '5 minutes' else null end
      where user_id = p_user;
     return json_build_object('ok', false,
       'rimasti', greatest(0, 5 - (r.tentativi + 1)),
       'bloccato_fino', case when r.tentativi + 1 >= 5 then now() + interval '5 minutes' else null end,
       'errore', 'Codice sbagliato.');
   end $$`,

  // AZZERAMENTO: solo admin o dev, e la prova la fa il database — non il
  // browser che lo dichiara
  `create or replace function public.wa_codice_azzera(p_user uuid, p_admin uuid)
   returns json language plpgsql security definer set search_path = public, extensions as $$
   declare ruolo text;
   begin
     select role into ruolo from app_users where id = p_admin and active;
     if ruolo is null or ruolo not in ('admin', 'dev') then
       return json_build_object('ok', false, 'errore', 'Solo un amministratore può azzerare il codice.');
     end if;
     delete from wa_codice_accesso where user_id = p_user;
     return json_build_object('ok', true);
   end $$`,

  `grant execute on function public.wa_codice_stato(uuid) to anon, authenticated`,
  `grant execute on function public.wa_codice_imposta(uuid, text, text) to anon, authenticated`,
  `grant execute on function public.wa_codice_verifica(uuid, text) to anon, authenticated`,
  `grant execute on function public.wa_codice_azzera(uuid, uuid) to anon, authenticated`,
];

(async () => {
  await client.connect();
  try {
    await client.query("begin");
    for (const s of SQL) await client.query(s);
    await client.query("commit");
    console.log("Funzioni create.");

    // prova end-to-end su un utente finto, poi si cancella
    const finto = "00000000-0000-0000-0000-0000000000aa";
    await client.query(`delete from wa_codice_accesso where user_id = $1`, [finto]);
    const p = async (sql, args) => (await client.query(sql, args)).rows[0];
    console.log("stato iniziale:", (await p(`select wa_codice_stato($1) v`, [finto])).v);
    console.log("troppo corto:  ", (await p(`select wa_codice_imposta($1,$2) v`, [finto, "12"])).v);
    console.log("imposto 4291:  ", (await p(`select wa_codice_imposta($1,$2) v`, [finto, "4291"])).v);
    console.log("stato ora:     ", (await p(`select wa_codice_stato($1) v`, [finto])).v);
    console.log("codice giusto: ", (await p(`select wa_codice_verifica($1,$2) v`, [finto, "4291"])).v);
    console.log("codice errato: ", (await p(`select wa_codice_verifica($1,$2) v`, [finto, "0000"])).v);
    console.log("riscrittura senza il vecchio:", (await p(`select wa_codice_imposta($1,$2) v`, [finto, "9999"])).v);
    await client.query(`delete from wa_codice_accesso where user_id = $1`, [finto]);
    console.log("\nProva finita, utente finto rimosso.");
  } catch (e) {
    await client.query("rollback").catch(() => { });
    console.error("ERRORE (rollback fatto):", e.message);
    process.exitCode = 1;
  }
  await client.end();
})();
