-- LE PERCENTUALI DI PROPORZIONE SI PORTANO AVANTI (Luca 04/09/2026).
--
--   «Lato ragazzi, chiaramente, quando vai a creare il nuovo mese lascia le
--    percentuali di riferimento del mese precedente — quelle di proporzione
--    rispetto all'azienda.»
--
-- Quelle percentuali stanno in due posti, non uno:
--   · `pay_piste.perc_ragazzi` — quanta parte del compenso dell'azienda va ai
--     ragazzi su quella pista. La copia le porta già (migrazione delle 09:00).
--   · `pay_mappa_soglie` — la corrispondenza fra le NOSTRE soglie e quelle
--     dell'operatore, con la percentuale di ciascuna. Dodici righe su WindTre
--     ad agosto, e nessuna funzione di copia le ha mai toccate: creando
--     settembre sarebbero semplicemente sparite, e il pay dei ragazzi si
--     sarebbe dovuto rifare a mano soglia per soglia.
--
-- ⚠️ `pay_mappa_soglie` NON ha la colonna `lato`: è il ponte fra i due lati,
-- quindi appartiene al mese e si copia una volta sola. La si porta con
-- `p_lato = 'tutto'` e con `'ragazzi'` — che è il lato di cui è la mappa — e
-- non con `'azienda'`, se no copiando prima l'azienda e poi i ragazzi la
-- seconda copia troverebbe le righe già lì e le salterebbe in silenzio.

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
    n_piste int := 0; n_soglie int := 0; n_righe int := 0; n_mappa int := 0;
begin
    if p_lato not in ('tutto', 'azienda', 'ragazzi') then
        return jsonb_build_object('esito', 'rifiutato: lato sconosciuto', 'lato', p_lato);
    end if;

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

    -- la mappa delle soglie: appartiene al mese, non a un lato
    if p_lato in ('tutto', 'ragazzi')
       and not exists (select 1 from pay_mappa_soglie where brand = p_brand and month = p_to) then
        insert into pay_mappa_soglie (brand, month, pista, tier_nostro, tier_loro, perc)
        select brand, p_to, pista, tier_nostro, tier_loro, perc
          from pay_mappa_soglie
         where brand = p_brand and month = p_from;
        get diagnostics n_mappa = row_count;
    end if;

    return jsonb_build_object('esito', 'copiato', 'lato', p_lato,
                              'piste', n_piste, 'soglie', n_soglie, 'righe', n_righe,
                              'mappa_soglie', n_mappa);
end
$$;

revoke execute on function public.pay_copy_month(text, date, date, text) from public;
revoke execute on function public.pay_copy_month(text, date, date, text) from anon;
grant execute on function public.pay_copy_month(text, date, date, text) to authenticated, service_role;

comment on function public.pay_copy_month(text, date, date, text) is
  'Copia un mese di gara per gli operatori su pay_* (Vodafone, Fastweb, Sky, S4, e il tabellare di WindTre). '
  'Porta con sé il lato e TUTTE le colonne: perc_ragazzi e la mappa delle soglie comprese. '
  'p_lato: tutto | azienda | ragazzi. SECURITY INVOKER di proposito: la RLS deve valere anche qui.';
