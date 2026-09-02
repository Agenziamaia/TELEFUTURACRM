-- ═══ IL REGISTRO DEGLI INVII AL COMMERCIALISTA ════════════════════════════
-- Luca 02/09: «al commercialista, i primi di ogni mese, dobbiamo inviargli il
-- resoconto dei telefoni usati venduti e comprati nel mese precedente». E poi,
-- rivedendolo: «spostiamo l'automazione al 3 del mese, e dal 1° dai visibilità
-- in questa sezione della preview, che sarebbe l'invio dei file».
--
-- ⚠️ DUE GIORNI DI FINESTRA, ED È IL PUNTO. Fra il 1° e il 3 il mese è chiuso
-- ma il file non è ancora partito: è lì che l'amministrazione guarda le righe
-- rosse — quelle a cui manca una società — e le sistema. Dopo il 3 la
-- correzione arriva tardi, perché il commercialista ha già in mano il file.
--
-- ⚠️ UNA SOLA VOLTA PER MESE. La riga con esito «inviato» è quello che
-- impedisce a un secondo giro — o a una prova premuta per curiosità — di
-- mandare due volte lo stesso resoconto. È la stessa rete del report ferie.

create table if not exists public.contabilita_usati_inviati (
    mese          date primary key,        -- il primo giorno del mese riferito
    esito         text not null,           -- 'inviato' | 'fallito'
    destinatari   text[],
    quanti_venduti  int,
    quanti_comprati int,
    da_confermare int,                     -- righe incomplete al momento dell'invio
    errore        text,
    inviato_il    timestamptz not null default now(),
    inviato_da    text
);

comment on table public.contabilita_usati_inviati is
  'Un invio per mese del resoconto usati al commercialista. ⚠️ `esito = inviato` impedisce il doppio invio: senza, una prova premuta per curiosità manderebbe di nuovo il file.';
comment on column public.contabilita_usati_inviati.da_confermare is
  'Quante righe erano ancora senza società al momento dell''invio: se non è zero, il file è partito incompleto e va saputo.';

alter table public.contabilita_usati_inviati enable row level security;

-- ⚠️ NESSUNA POLICY DI LETTURA DAL BROWSER: ci sono destinatari e conteggi
-- contabili, e la sezione li legge dal server con la chiave di servizio.
revoke all on public.contabilita_usati_inviati from anon, authenticated;

do $$
declare c int;
begin
    select count(*) into c from information_schema.tables
     where table_name = 'contabilita_usati_inviati';
    raise notice 'registro invii: %', c;
    if c <> 1 then raise exception 'la tabella non e stata creata'; end if;
end $$;
