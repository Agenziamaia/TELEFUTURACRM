-- ═══════════════════════════════════════════════════════════════════════════
-- LE CORREZIONI DELLA REVISIONE OSTILE SULLA FATTURA — 04/09/2026
-- ═══════════════════════════════════════════════════════════════════════════

/* ── 1. UN VENDITORE POTEVA SCRIVERSI UNA FATTURA «GIÀ FATTA» ────────────────
   La policy chiedeva solo di essere loggati. Provato dal revisore: dal browser
   un venditore inseriva una riga con `stato='fatta'`, un numero inventato,
   `fatta_da` col nome di un'amministrativa, 999.999 € di totale e il negozio
   di qualcun altro. E al contrario poteva fabbricare richieste VERE per
   vendite mai avvenute: l'amministrazione avrebbe emesso fatture reali, con
   IVA a debito su ricavi mai incassati.

   Adesso una richiesta può NASCERE solo come «da fare», senza esito già
   scritto, e solo per un negozio in cui si lavora. */
drop policy if exists fatture_crea on public.fatture_richieste;
create policy fatture_crea on public.fatture_richieste
    for insert to public with check (
        tf_uid() is not null
        and stato = 'da_fare'
        and numero_fattura is null and fatta_il is null and fatta_da is null
        and (tf_e_governo()
             or exists (select 1 from user_stores s
                         where s.user_id = tf_uid()
                           and lower(split_part(s.store_name, ' ', 1))
                             = lower(split_part(fatture_richieste.negozio, ' ', 1)))));

/* ── 2. LA RETE CONTRO LA FATTURA DOPPIA ─────────────────────────────────────
   Il «riprova» dopo un errore rimandava tutti i gruppi, anche quelli già
   registrati: due richieste identiche, due fatture per la stessa merce. Il
   ciclo adesso si ricorda cosa è passato, ma quella è memoria del browser —
   una scheda ricaricata la perde. Questo indice è la rete sotto.
   Una vendita può avere DUE richieste solo se sono di due società diverse. */
create unique index if not exists fatture_una_per_vendita
    on public.fatture_richieste (contratto_id, coalesce(societa, ''))
 where contratto_id is not null and stato <> 'annullata';

/* ── 3. LA NAZIONE, che per un cliente estero decide tutto ───────────────────
   Senza, un cliente non italiano non è fatturabile correttamente: il codice
   destinatario diventa XXXXXXX e il CAP italiano non esiste. */
alter table public.fatture_richieste
    add column if not exists nazione text not null default 'IT';
alter table public.clients
    add column if not exists nazione text;
