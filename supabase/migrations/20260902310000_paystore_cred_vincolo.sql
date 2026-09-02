-- ═══ IL VINCOLO CHE IMPEDIVA DI SALVARE LE CREDENZIALI ════════════════════
-- Luca 02/09, caricando il foglio: tutte e sedici le righe accoppiate al
-- negozio giusto, e tutte e sedici «NON salvata: there is no unique or
-- exclusion constraint matching the ON CONFLICT specification».
--
-- ⚠️ IL VINCOLO C'ERA, MA ERA PARZIALE. `paystore_cred_uniq` era unico su
-- (negozio, azienda) SOLO `WHERE attivo`. Un indice parziale, per Postgres,
-- vale per un `ON CONFLICT` soltanto se si ripete la stessa condizione —
-- `ON CONFLICT (negozio, azienda) WHERE attivo` — e quella condizione, dal
-- client, non si può esprimere. Risultato: l'upsert non trovava nessun
-- vincolo da usare e rifiutava ogni riga. Nessuna credenziale è mai entrata.
--
-- ⚠️ E LA STORIA NON SERVE. L'idea dietro il `WHERE attivo` era poter tenere
-- le credenziali vecchie accanto a quelle nuove. Ma chi le legge — la funzione
-- che sceglie con quale terna firmare una ricarica — si ferma se ne trova più
-- d'una per lo stesso negozio e società: tenere lo storico voleva dire
-- bloccare le ricariche di quel punto vendita. Una terna per negozio e
-- società; rigenerarla vuol dire sovrascriverla.
--
-- ⚠️ SI RICARICA IL FOGLIO. La tabella è vuota (misurato: 0 righe), quindi non
-- si perde niente — ma il caricamento va rifatto dal pannello.

drop index if exists public.paystore_cred_uniq;

create unique index if not exists paystore_cred_uniq
    on public.paystore_credenziali (negozio, azienda);

comment on index public.paystore_cred_uniq is
  'Una credenziale PayStore per negozio e società. ⚠️ NON parziale: un indice con WHERE non può reggere un ON CONFLICT scritto dal client, ed è il motivo per cui il primo caricamento non salvava niente.';

do $$
declare p text;
begin
    select indexdef into p from pg_indexes
     where tablename = 'paystore_credenziali' and indexname = 'paystore_cred_uniq';
    raise notice 'indice: %', p;
    if p is null or p ilike '%where%' then
        raise exception 'l''indice non c''è o è ancora parziale: %', coalesce(p, 'assente');
    end if;
end $$;
