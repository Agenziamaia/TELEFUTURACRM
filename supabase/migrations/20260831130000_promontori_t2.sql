-- ═══════════════════════════════════════════════════════════════════════════
-- PROMONTORI È TELEFUTURA 2 (Luca 31/08)
--
-- Il magazzino l'avevo caricato su T1 perché è quello che diceva `pos_rt`.
-- Il file però intestava la colonna «Multi - Promontori», e l'avevo segnalato
-- come dubbio: Luca ha confermato che il negozio è **T2**.
--
-- I MOVIMENTI NON SI RISCRIVONO. Il primo tentativo è stato una UPDATE su
-- `mag_movimenti`, e il trigger l'ha rifiutata con le parole giuste: «un
-- movimento di magazzino non si modifica né si cancella, è un fatto
-- contabile». Quindi la correzione si REGISTRA: la merce esce da Telefutura
-- (rettifica negativa) ed entra in Telefutura 2 (carico), col perché scritto
-- accanto. Chi guarderà il registro fra sei mesi vedrà cos'è successo, invece
-- di trovare un carico che dice una cosa e una giacenza che ne dice un'altra.
--
-- E ANDAVA SISTEMATO ANCHE IL REGISTRATORE, se no il negozio non stampa più.
-- Da stamattina una riga la cui società non ha un registratore in QUEL negozio
-- viene esclusa dallo scontrino invece di essere stampata altrove. Merce a T2
-- e registratore a T1 avrebbe voluto dire: nessuna riga stampabile, mai.
--
-- Che quel «T1» fosse un valore di riempimento e non un dato verificato lo
-- dice la tabella stessa: gli otto negozi «Telefutura (Custom) - …» hanno
-- tutti azienda T1 e **partita IVA vuota**, mentre i negozi configurati
-- davvero — Donna, Magliana, Garbatella, San Paolo, Collatina Multi — la
-- portano.
--
-- ⚠️ DA CONFERMARE PRIMA DI DOMANI: gli altri sette «(Custom)» sono nella
-- stessa condizione, e fra loro c'è «Collatina Multi», che ha lo stesso
-- «Multi» nel nome per cui Promontori era sbagliato.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. i pezzi con seriale: non hanno movimenti, si spostano
update mag_unita set azienda = 'T2'
 where negozio = 'Promontori' and coalesce(azienda, 'T1') = 'T1';

-- ── 2. le quantità: la merce esce da T1 ed entra in T2, e resta scritto
--    I DUE MOVIMENTI LEGGONO LA STESSA FOTOGRAFIA. Scritti come due comandi
--    in fila non funzionavano: il primo azzera la giacenza col trigger, e il
--    secondo non trovava più niente da spostare (misurato: T1 a zero e T2 con
--    i soli 65 pezzi serializzati). Con la CTE la fotografia è una sola.
with snap as (
  select codice, quantita, in_arrivo
    from mag_giacenze
   where negozio = 'Promontori' and azienda = 'T1' and quantita <> 0
), usciti as (
  insert into mag_movimenti (codice, negozio, azienda, tipo, quantita, nota)
  select codice, 'Promontori', 'T1', 'rettifica', -quantita,
         'correzione società: il magazzino di Promontori è Telefutura 2, non Telefutura (Luca 31/08)'
    from snap
  returning 1
)
insert into mag_movimenti (codice, negozio, azienda, tipo, quantita, nota)
select codice, 'Promontori', 'T2', 'carico', quantita,
       'correzione società: merce già a scaffale, spostata da Telefutura a Telefutura 2 (Luca 31/08)'
  from snap;

-- la merce in arrivo non ha movimenti: si sposta a mano
insert into mag_giacenze (codice, negozio, azienda, quantita, in_arrivo)
select g.codice, g.negozio, 'T2', 0, g.in_arrivo
  from mag_giacenze g
 where g.negozio = 'Promontori' and g.azienda = 'T1' and g.in_arrivo > 0
on conflict (codice, negozio, azienda) do update set in_arrivo = excluded.in_arrivo;
update mag_giacenze set in_arrivo = 0
 where negozio = 'Promontori' and azienda = 'T1' and in_arrivo > 0;

-- ── 3. e il registratore, se no da qui non esce niente
update pos_rt set azienda = 'T2',
                 ragione_sociale = 'Telefutura 2 S.R.L.',
                 piva = '10916221004'
 where negozio = 'Promontori';
