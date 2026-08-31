-- ═══════════════════════════════════════════════════════════════════════════
-- I COUPON SI TOCCANO SOLO DAL SERVER — 31/08/2026
--
-- `src/lib/coupons.ts` dichiara «SOLO server» fin dalla prima riga, ma
-- importava il client ANON: per farlo funzionare la tabella era rimasta
-- scrivibile da chiunque avesse fatto login. Cioè: alzarsi il valore residuo
-- di un coupon, o far rivivere uno annullato, era una riga di JavaScript nella
-- console del browser. Sono soldi — oggi 634,75 € emessi.
--
-- La libreria adesso usa il ruolo di servizio, quindi al browser non serve più
-- nessun permesso di scrittura. La LETTURA passa già dalla rotta
-- `/api/vendita/coupon`, che usa anch'essa il ruolo di servizio: quindi si
-- toglie tutto.
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on public.coupons from anon, authenticated;
