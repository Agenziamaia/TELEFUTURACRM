-- ═══════════════════════════════════════════════════════════════════════════
-- OGNI CASSA DICE QUALE PC LA SERVE — 02/09/2026
--
-- Serve a rendere possibile la fusione dei negozi doppi decisa da Luca.
--
-- IL PROBLEMA. L'agente di stampa installato in negozio chiede i lavori con il
-- NOME ESATTO del suo punto vendita (`/api/print/next?negozio=…`), e il lavoro
-- gli viene consegnato confrontando `print_jobs.negozio`. Finché ogni insegna
-- ha il suo nome, la cosa funziona. Fondendo «Acilia VS» e «Acilia Multi» in
-- un unico «Acilia», i due PC chiederebbero lo stesso nome:
--
--   · dove le casse sono IN RETE (Magliana, Donna, il Multi di Collatina) non
--     succede niente: il lavoro porta l'indirizzo IP del registratore, e
--     qualunque agente lo mandi, arriva a quello giusto.
--   · dove le casse sono LOCALI (`rt_url = 'custom'`, cioè collegate via USB al
--     PC) l'unico discriminante è il nome. Ad **ACILIA SONO LOCALI TUTTE E
--     DUE**: uno scontrino di Telefutura 1 poteva uscire dalla stampante
--     dell'altro banco — e sono due partite IVA.
--
-- LA SOLUZIONE. La cassa dice da sé chi la serve, invece di farlo dedurre dal
-- nome del negozio. Oggi il valore è identico al nome attuale, quindi NON
-- CAMBIA NIENTE; dopo la fusione i due PC di Acilia continueranno a chiamarsi
-- «Acilia VS» e «Acilia Multi» e a ricevere solo i propri lavori, mentre tutto
-- il resto del CRM vedrà un negozio solo.
--
-- Così la fusione non richiede di reinstallare l'agente su nessun PC: il nome
-- con cui si presentano resta quello che hanno già nell'avvio di Windows.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.pos_rt add column if not exists agente text;

comment on column public.pos_rt.agente is
  'Il nome con cui si presenta l''agente di stampa che serve questa cassa (?negozio= di /api/print/next). Di norma coincide col negozio; dopo la fusione dei punti vendita doppi resta l''INSEGNA, perché è l''unico modo di distinguere due registratori locali nello stesso locale.';

-- oggi vale il nome attuale: comportamento identico, zero rischio
update public.pos_rt set agente = negozio where agente is null;
