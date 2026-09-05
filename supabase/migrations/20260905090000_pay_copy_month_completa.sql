-- LA COPIA DEL MESE PERDEVA PER STRADA METÀ DELLE COLONNE (05/09/2026).
--
-- `pay_copy_month` è la funzione che porta avanti il mese per tutti gli
-- operatori che NON sono WindTre (Vodafone, Fastweb, Sky, S4): quelli vivono
-- in pay_piste / pay_soglie / pay_righe, dove la stessa tabella tiene sia il
-- lato azienda sia il lato ragazzi, distinti dalla colonna `lato`.
--
-- La versione precedente NON copiava `lato`. Siccome il default della colonna
-- è 'ragazzi', copiare settembre da agosto avrebbe fatto due danni insieme:
--   · il lato AZIENDA di Vodafone — 8 piste, le sue soglie e il suo
--     commissioning — sarebbe semplicemente sparito;
--   · le righe dei ragazzi sarebbero RADDOPPIATE, perché quelle dell'azienda
--     arrivavano di là travestite, e su pay_righe non c'è nessun vincolo unico
--     che le fermi.
--
-- Insieme a `lato` mancavano anche tutte le colonne aggiunte dopo che la
-- funzione era stata scritta: `perc_ragazzi`, `soglie_pct`, `soglie_max`,
-- `soglie_di` sulle piste, `bonus` sulle soglie, e su pay_righe
-- `brand_vendita`, `moltiplicatore`, `provenienza`, `componente`, `ricorrente`,
-- `pay_ragazzi_tiers`. Una funzione di copia che si dimentica le colonne nuove
-- è peggio di una che non esiste: sembra aver funzionato.
--
-- ⚠️ `perc_ragazzi` in particolare è una richiesta esplicita di Luca (04/09):
-- «lato ragazzi, quando vai a creare il nuovo mese, lascia le percentuali di
-- riferimento del mese precedente — quelle di proporzione rispetto
-- all'azienda». Sono la proporzione fra il compenso dell'azienda e quello dei
-- ragazzi: perderle vuol dire ricalcolare a mano il pay di tutti.
--
-- La firma guadagna `p_lato`, con lo stesso significato che ha `p_livello` in
-- `gare_copy_month`: 'tutto' (default, come prima), 'azienda' o 'ragazzi'.
-- Il default tiene in piedi i chiamanti vecchi senza modifiche.

/* ⚠️ PRIMA SI TOGLIE LA VECCHIA. Aggiungere un parametro con default NON
   sostituisce la funzione: ne crea una SECONDA, e la chiamata a tre argomenti
   diventa ambigua fra le due — Postgres risponde «function is not unique» e la
   copia del mese smette di funzionare per tutti. */
drop function if exists public.pay_copy_month(text, date, date);

create or replace function public.pay_copy_month(
    p_brand text,
    p_from  date,
    p_to    date,
    p_lato  text default 'tutto'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    n_piste int := 0; n_soglie int := 0; n_righe int := 0;
begin
    if p_lato not in ('tutto', 'azienda', 'ragazzi') then
        return jsonb_build_object('esito', 'rifiutato: lato sconosciuto', 'lato', p_lato);
    end if;

    /* Il mese di destinazione dev'essere vuoto PER QUEL LATO. Il controllo di
       prima guardava la tabella intera: chi aveva già impostato i ragazzi non
       poteva più copiare l'azienda, e viceversa — che è esattamente il giro
       normale, visto che i due lati si preparano in momenti diversi. */
    if exists (select 1 from pay_piste
               where brand = p_brand and month = p_to
                 and (p_lato = 'tutto' or lato = p_lato))
       or exists (select 1 from pay_righe
                  where brand = p_brand and month = p_to
                    and (p_lato = 'tutto' or lato = p_lato)) then
        return jsonb_build_object('esito', 'saltato: mese destinazione non vuoto', 'lato', p_lato);
    end if;

    insert into pay_piste (brand, month, chiave, nome, um, ordine, lato,
                           perc_ragazzi, soglie_pct, soglie_max, soglie_di)
    select brand, p_to, chiave, nome, um, ordine, lato,
           perc_ragazzi, soglie_pct, soglie_max, soglie_di
      from pay_piste
     where brand = p_brand and month = p_from
       and (p_lato = 'tutto' or lato = p_lato);
    get diagnostics n_piste = row_count;

    insert into pay_soglie (brand, month, pista, tier, soglia_da, soglia_a, lato, bonus)
    select brand, p_to, pista, tier, soglia_da, soglia_a, lato, bonus
      from pay_soglie
     where brand = p_brand and month = p_from
       and (p_lato = 'tutto' or lato = p_lato);
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
     where brand = p_brand and month = p_from
       and (p_lato = 'tutto' or lato = p_lato);
    get diagnostics n_righe = row_count;

    return jsonb_build_object('esito', 'copiato', 'lato', p_lato,
                              'piste', n_piste, 'soglie', n_soglie, 'righe', n_righe);
end
$$;

comment on function public.pay_copy_month(text, date, date, text) is
  'Copia un mese di gara per gli operatori su pay_* (Vodafone, Fastweb, Sky, S4). '
  'Porta con sé il lato e TUTTE le colonne, perc_ragazzi compresa. p_lato: tutto | azienda | ragazzi.';
