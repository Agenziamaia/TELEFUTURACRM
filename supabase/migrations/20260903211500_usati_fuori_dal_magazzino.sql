-- ═══ UN USATO NON STA IN MAGAZZINO ═══════════════════════════════════════════
-- Luca 03/09, davanti a un telefono usato fermo in un trasferimento «da
-- accettare»: «gli usati vivono dentro Gestione Usati, non devono essere frutto
-- di un trasferimento che deve essere accettato».
--
-- COS'ERA SUCCESSO, misurato. Il 02/09 alle 19:45:53 è nato il documento n.12
-- (Donna → Magliana, unità di magazzino RITUSATO.04.52, valore 1,00 €, stato
-- «in transito») e 42 secondi dopo il n.13, stesso telefono e stesso tragitto,
-- ma nella forma giusta: riga descrittiva, nessuna unità, valore vero 769 €,
-- stato «usato» — cioè già chiuso, come deve essere.
-- Due documenti per un telefono solo, perché quel telefono viveva in DUE mondi:
-- in Gestione Usati (dove è nato il 03/08) e in magazzino, dove l'aveva messo
-- l'importazione del vecchio gestionale.
--
-- IL PERIMETRO, contato prima di toccare:
--   · 148 unità «disponibile» su articoli marcati usato → 4.075 € di merce che
--     risultava a stock in dieci negozi e non c'è;
--   · 1 unità «in transito» → è il telefono del documento n.12;
--   · 10 righe di giacenza a quantità, un pezzo ciascuna;
--   · 2 unità «venduto» (101 €): NON si toccano. Sono vendite avvenute, e
--     riscriverle sarebbe peggio del difetto. Vanno guardate a mano, perché lo
--     stesso telefono potrebbe essere stato contato due volte.
--
-- ⚠️ NIENTE SI CANCELLA. Le unità restano con la loro storia, marcate
-- «annullato»: la vista `mag_disponibilita` conta solo «disponibile» e
-- «in_arrivo», quindi escono dallo stock senza sparire dagli archivi. Un buco
-- in un registro è peggio di una riga marcata.
--
-- ⚠️ E VENDERE NON SI ROMPE. Verificato nel codice: il carrello di Registra
-- Vendita vende l'usato col prodotto «Vendita Usato» (`needsImei`) e pesca le
-- unità dalla tabella `usati` con stato «in vendita» — non dal magazzino. Un
-- usato continua a esistere, a comparire e a essere scontrinato: semplicemente
-- vive in un posto solo.

begin;

-- ── 1. le unità escono dallo stock, con scritto perché ─────────────────────
update public.mag_unita u
   set stato = 'annullato',
       storia = coalesce(u.storia, '[]'::jsonb) || jsonb_build_object(
           'quando', now(),
           'evento', '🧹 Tolto dal magazzino',
           'operatore', 'correzione 03/09',
           'note', 'Un telefono usato non sta in magazzino: vive in Gestione Usati, ed è da lì che si vende. Questa unità era entrata con l''importazione del vecchio gestionale.'
       )
  from public.mag_articoli a
 where a.codice = u.codice
   and a.usato is true
   and u.stato in ('disponibile', 'in_arrivo', 'in_transito');

-- ── 2. le giacenze a quantità si azzerano, la riga resta ───────────────────
update public.mag_giacenze g
   set quantita = 0, in_arrivo = 0
  from public.mag_articoli a
 where a.codice = g.codice
   and a.usato is true
   and (g.quantita <> 0 or g.in_arrivo <> 0);

-- ── 3. il documento fantasma ───────────────────────────────────────────────
-- Il n.12 non si accetta: accettarlo confermerebbe un movimento di magazzino
-- che non doveva esistere. Si annulla, col numero che resta e il motivo scritto.
update public.mag_ddt
   set stato = 'annullato',
       note = coalesce(note || ' · ', '') ||
              'Annullato il 03/09: doppione del n.13. Lo stesso telefono usato è uscito due volte, ' ||
              'perché era anche in magazzino per l''importazione del vecchio gestionale. Il documento ' ||
              'valido è il n.13, nella forma degli usati.'
 where numero = 12 and anno = 2026 and stato = 'in_transito'
   and exists (select 1 from public.mag_ddt_righe r
                join public.mag_articoli a on a.codice = r.codice
               where r.ddt_id = mag_ddt.id and a.usato is true);

update public.mag_ddt_righe r
   set stato = 'annullata',
       chiusa_il = now(),
       motivo = 'documento annullato: doppione del n.13'
  from public.mag_ddt d
 where d.id = r.ddt_id and d.numero = 12 and d.anno = 2026 and d.stato = 'annullato';

commit;
