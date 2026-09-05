-- TOLTO IL «SECURITY DEFINER» CHE AVEVO MESSO IO STAMATTINA (05/09/2026).
--
-- La migrazione delle 09:00 ha riscritto `pay_copy_month` per non perdere più
-- la colonna `lato`, e per abitudine le ha messo `security definer`. La
-- versione originale (20260810230000_pay_tabellare.sql) NON ce l'aveva, e
-- c'era un motivo: la funzione è di proprietà di `postgres` ed è eseguibile da
-- PUBLIC, quindi anche da `anon` — il ruolo della chiave pubblica che sta nel
-- bundle del browser di chiunque apra il CRM.
--
-- Misurato dalla revisione, in transazione annullata, con un JWT senza `tf_uid`:
--   · insert diretto in pay_piste  → bloccato dalla RLS, come deve essere
--   · select pay_copy_month(...)   → «copiato»: 15 piste e 259 righe SCRITTE
-- Cioè: con `security definer` la funzione scavalcava la RLS delle tabelle che
-- pagano le persone, e bastava conoscere l'indirizzo per riempire un mese
-- futuro col listino vecchio — e per bloccare la copia legittima, visto che il
-- controllo «mese destinazione non vuoto» a quel punto scatta.
-- Il confronto era già lì da vedere: `gare_copy_month`, che invoker lo è
-- sempre stata, da `anon` scrive zero righe.
--
-- Qui si torna a `security invoker` (il default) e si toglie anche il
-- permesso di esecuzione ad anon: chi copia un mese lo fa con la propria
-- identità, e la RLS decide. Il `search_path` resta fissato — è la difesa
-- contro una tabella omonima creata altrove — ma con `pg_temp` in coda, che
-- Postgres consulta comunque per primo sulle relazioni.

create or replace function public.pay_copy_month(
    p_brand text,
    p_from  date,
    p_to    date,
    p_lato  text default 'tutto'
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
    n_piste int := 0; n_soglie int := 0; n_righe int := 0;
begin
    if p_lato not in ('tutto', 'azienda', 'ragazzi') then
        return jsonb_build_object('esito', 'rifiutato: lato sconosciuto', 'lato', p_lato);
    end if;

    /* Il mese di destinazione dev'essere vuoto PER QUEL LATO. Si guardano
       tutte e tre le tabelle: `pay_soglie` era rimasta fuori, e un brand che
       ha le soglie ma non le piste (succede: fastweb ragazzi) passava il
       controllo per poi schiantarsi sull'unique a metà copia. */
    if exists (select 1 from pay_piste
               where brand = p_brand and month = p_to and (p_lato = 'tutto' or lato = p_lato))
       or exists (select 1 from pay_soglie
                  where brand = p_brand and month = p_to and (p_lato = 'tutto' or lato = p_lato))
       or exists (select 1 from pay_righe
                  where brand = p_brand and month = p_to and (p_lato = 'tutto' or lato = p_lato)) then
        return jsonb_build_object('esito', 'saltato: mese destinazione non vuoto', 'lato', p_lato);
    end if;

    insert into pay_piste (brand, month, chiave, nome, um, ordine, lato,
                           perc_ragazzi, soglie_pct, soglie_max, soglie_di)
    select brand, p_to, chiave, nome, um, ordine, lato,
           perc_ragazzi, soglie_pct, soglie_max, soglie_di
      from pay_piste
     where brand = p_brand and month = p_from and (p_lato = 'tutto' or lato = p_lato);
    get diagnostics n_piste = row_count;

    insert into pay_soglie (brand, month, pista, tier, soglia_da, soglia_a, lato, bonus)
    select brand, p_to, pista, tier, soglia_da, soglia_a, lato, bonus
      from pay_soglie
     where brand = p_brand and month = p_from and (p_lato = 'tutto' or lato = p_lato);
    get diagnostics n_soglie = row_count;

    insert into pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto,
                           offerta, opzione, punti, pay_base, pay_tiers, gettone, attivo,
                           note, ordine, lato, brand_vendita, moltiplicatore, provenienza,
                           componente, ricorrente, pay_ragazzi_tiers)
    select brand, p_to, pista, nome, tipo_cliente, categoria, prodotto,
           offerta, opzione, punti, pay_base, pay_tiers, gettone, attivo,
           note, ordine, lato, brand_vendita, moltiplicatore, provenienza,
           componente, ricorrente, pay_ragazzi_tiers
      from pay_righe
     where brand = p_brand and month = p_from and (p_lato = 'tutto' or lato = p_lato);
    get diagnostics n_righe = row_count;

    return jsonb_build_object('esito', 'copiato', 'lato', p_lato,
                              'piste', n_piste, 'soglie', n_soglie, 'righe', n_righe);
end
$$;

/* ⚠️ SI TOGLIE A **PUBLIC**, NON AD ANON. Un create-or-replace
   ridà il permesso a PUBLIC, e anon quel permesso lo eredita da lì: revocarlo
   ad anon soltanto non toglie niente (misurato: has_function_privilege(anon)
   restava true). Si toglie alla radice e si ridà per nome a chi deve. */
revoke execute on function public.pay_copy_month(text, date, date, text) from public;
revoke execute on function public.pay_copy_month(text, date, date, text) from anon;
grant execute on function public.pay_copy_month(text, date, date, text) to authenticated, service_role;

comment on function public.pay_copy_month(text, date, date, text) is
  'Copia un mese di gara per gli operatori su pay_* (Vodafone, Fastweb, Sky, S4). '
  'Porta con sé il lato e TUTTE le colonne, perc_ragazzi compresa. p_lato: tutto | azienda | ragazzi. '
  'SECURITY INVOKER di proposito: la RLS deve valere anche qui.';
