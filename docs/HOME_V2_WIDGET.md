# HOME v2 — progetto widget (Luca, 25/08/2026 notte)

> Mandato: la Home non deve più essere la brutta copia dell'Analisi. Deve
> essere **di impatto**, **aiutare a fare di più e meglio**, **tutto sotto
> controllo con uno sguardo e uno swipe**. Max **10 card attive** a persona,
> attivabili/disattivabili da una galleria, per-ruolo. **Gamification
> ovunque.** Intoccabili: WhatsApp del team; Accessi collaboratori (ma può
> diventare più smart). La bussola «Direzione inserimento» si rifà domani
> (fabbisogni per-codice). Obbligatorio: un CALENDARIO rivoluzionario.
> Questo doc: visione A (analisi canonica per ruolo) + visione B (agente
> indipendente, angolazioni diverse) + CATALOGO FINALE fuso.

## Ricognizione (fatti, non opinioni)

- **Widget attuali** (registry `dashboard/_widgets.tsx`): marginalita,
  kpi_contratti/attivi/lavorazione/clienti, chart_brand, chart_stato,
  chart_top, classifica, bussola, obiettivo, azioni, bacheca, accessi,
  whatsapp, widget-brand a punti gara (dinamici), confronto. Quasi tutti
  «numeri» che oggi vivono meglio in Analisi.
- **Ruoli reali a DB**: 19 venditori, 9 store_manager, 6 caller, 3 tecnici,
  2 direttore_generale, 2 amministrativi, direttore_commerciale,
  direttore_cc, direttore_ob, back_office_caller, agente, admin, dev.
- **Calendario**: `appointments` (date/time/type/agente/store/cliente/
  status/esito_note; stati 30gg: scheduled 740, **no_show 87**, attivato 60,
  ko 17, da_richiamare 12, da_rifissare 6…), `calendar_tasks` (56 righe,
  title/date/assigned_to_store/outcome_note), `calendario_esiti`,
  `calendar_meetings/operators/stores`. **No-show 30gg per negozio: Libia
  19 · Magliana W3 18 · Collatina W3 16 · Mazzini 10 · Donna 7.**
- **Il motore commissioning** (`src/lib/commissioning.ts`) sa il VALORE in €
  di ogni vendita (azienda e ragazzi, con % e soglie live): nessun widget
  attuale lo usa per parlare di euro alle persone.
- Il dolore dichiarato da Luca: i negozi **si dimenticano di esitare gli
  appuntamenti** fissati dal telefonico; agosto in crisi di cassa; sprint
  finale in corso con target per negozio.

---

## VISIONE A — «la Home è ciò che faccio adesso»

Principi:
1. **Azione, non consultazione.** Ogni card risponde a «cosa faccio ORA?»
   con una CTA che apre la sezione giusta GIÀ filtrata. I numeri di
   approfondimento stanno in Analisi (la card ci linka).
2. **Anatomia fissa**: numero-eroe + contesto/delta + prossima azione.
   Leggibile in 3 secondi.
3. **Gamification sistemica**: le GARE sono già un gioco (punti, soglie,
   retroattività) — la Home lo rende visibile: streak, rank motion (↑2),
   festeggiamenti alle soglie, «giornata perfetta».
4. **Loss aversion esplicita**: ciò che PERDI se non agisci (esiti mancanti,
   malus, soglie che sfuggono) pesa più di ciò che guadagni.

### Consulente (venditore)
| Widget | Taglia | Contenuto | Fonte |
|---|---|---|---|
| 🎯 **La mia giornata** | 2-4 | Prossimo appuntamento in testa (ora·cliente·tipo, badge ☎️ se fissato dal call center), poi task e pratiche incomplete. Quick-esito inline. Barra «giornata perfetta» (tutto esitato = ⭐). | appointments, calendar_tasks |
| 💶 **In tasca** | 1-2 | Commissioning personale maturato nel mese (motore lato ragazzi, % vere) + «prossimo scatto: alla S2 +X€ retroattivi sui pezzi già fatti». | commissioning.ts |
| 🔥 **Streak** | 1 | Giorni consecutivi con ≥1 vendita; record personale; fiamma che cresce. | contracts |
| 📈 **Il mio ritmo** | 1-2 | Oggi vs il mio giorno-tipo (media per weekday): «+2 sopra il tuo martedì». | contracts |
| 🧲 **Da richiamare** | 2 | Clienti suoi: no_show, da_richiamare, chiusure-linea pendenti. Un tap = telefono. | appointments, caller |
| 🎁 **Occasione del giorno** | 1 | La pista più vicina alla soglia: «ogni Fisso oggi vale 190€ (S3 a 3 pezzi): spingi qui». | commissioning.ts |

### Store manager (in aggiunta)
| Widget | Taglia | Contenuto |
|---|---|---|
| 🏪 **Semaforo negozio** | 2-4 | Le piste del PDV vs target sprint/soglie (pay_target_pdv): verde/giallo/rosso + mancanti-per-giorno. |
| ⚠️ **Fughe di valore** | 2 | Esiti mancanti >24h, pratiche ferme >N gg, malus PDA in arrivo, CF forzati. Contatore che «sanguina» €. |
| 👥 **Squadra oggi** | 2 | Chi è in turno (accessi), vendite per testa, chi è a zero alle 16 (nudge gentile). |
| 🥊 **Rivali** | 2 | Il PDV vs il gemello di cluster sulla pista della settimana; sorpasso = notifica festosa. |

### Caller / direttore CC
| Widget | Taglia | Contenuto |
|---|---|---|
| 📞 **La mia coda** | 2 | Lead da lavorare ora, countdown in scadenza, riprogrammazioni di oggi. |
| 🔄 **Che fine hanno fatto** | 2 | Gli appuntamenti che HO fissato: esitati/attivati/no-show — il feedback loop che oggi manca + conversion personale. |
| 🏆 **Podio caller** | 1-2 | Classifica fissati→attivati del mese, rank motion. |

### Direzione / admin
| Widget | Taglia | Contenuto |
|---|---|---|
| 🌍 **War room** | 4 | Countdown sprint (giorni), rete vs target per brand (i numeri del PDF vivi), ritmo richiesto vs attuale. |
| 💰 **Contatore €** | 2 | Commissioning azienda maturato nel mese (payEuroAttivazione su tutto) vs mese scorso — la vista a valore che in Analisi ancora non c'è. |
| 🚨 **Radar** | 2 | Scoperture (vendite senza riga pay), CF forzati, KO, anomalie caller: ciò che un revisore troverebbe. |

### 📅 Il Calendario rivoluzionario (tutti, obbligatorio)
**«Agenda viva»** (2-4): timeline verticale del giorno; appuntamenti con
badge fonte (☎️ dal telefonico), task, riprogrammazioni; swipe orizzontale
tra i giorni. Ogni appuntamento passato **senza esito diventa una carta
rossa** con quick-actions inline (✅ attivato · 🚫 no show · 🔁 da
rifissare) — esitare NON richiede di aprire il calendario. In alto il
«**debito esiti**» del negozio (fiamma che cresce coi giorni). Alle 19 la
card pulsa se il debito non è zero. Gamification: «inbox zero» = timbro
giornaliero; serie di giorni puliti per negozio; classifica «negozi più
puntuali a esitare» (i no-show sono 87/30gg: c'è tanto da recuperare).

### Accessi smart (evoluzione, non stravolgimento)
«Chi c'è ora» con avatar + heatmap presenze settimanale + pattern ritardi;
click → Collaboratori. Immutato nei dati, più vivo nella forma.

### Meccanica di piattaforma (visione A)
- Max 10 attive; galleria per gruppo (Giornata · Soldi · Squadra · Radar).
- **Widget broadcast**: la direzione può PINNARE una card a tutta la rete
  per N giorni (es. War room nello sprint) — il megafono che oggi manca.
- Redazione automatica: le card sanno auto-proporsi («hai 4 esiti mancanti:
  vuoi l'Agenda viva in prima posizione?»).

---

## VISIONE B — agente indipendente (5 angolazioni: momenti, psicologia, dormienti, soldi, cliente)

24 widget + 3 «wow», TUTTI ancorati a tabelle/lib verificate nel repo. Sintesi
(dettaglio completo nel report dell'agente, conservato in /verifiche e qui sotto
nel catalogo):

- **Momenti**: Regista della Giornata (3 facce con l'ora: apertura/cuore/
  chiusura — appuntamenti, ritmo vs gemello, chiusura cassa); Il Treno delle
  19 (countdown all'ora di scatto: i pezzi «a bordo» e i punti che varranno);
  Le Fasce del Caller (round mattina/pomeriggio da `fasce.ts` + `shifts`).
- **Psicologia**: Scudo Malus (i TRE motori di malus già vivi — caller,
  tracking PDA con importi in `MALUS_IMPORTO`, usati — con countdown e «€
  salvati»); La Serie (streak con festivi neutri da `gl.festivi`); Derby
  (sfida 1-vs-1 settimanale col negozio di pari peso, corona `CoronaOro`);
  Sala Trofei (record personali, perimetro onesto da fine luglio);
  Applausometro (feed celebrazioni con 👏 su `chat_reactions`).
- **Dormienti**: Telefono Rosso (chiamate perse `call_events` non richiamate,
  click-to-call `dialer.ts`); Porta Girevole (disdette in corso + «attivato
  diverso negozio»: la retention che oggi non ha casa); Magazzino Vivo
  (capitale immobilizzato usati, giacenze >30gg, malus lab); Casse Aperte
  (`vendite_sospese` + coupon in circolazione + debiti collaboratori); Radar
  Anagrafiche (CF incoerenti, duplicati, % salute); Regia delle Liste
  (direttore CC: penetrazione liste, anomalie, segnalate); Diario di Bordo
  (admin: /verifiche + lettere gara mancanti).
- **Soldi**: Contatore € (il mese in EURO dal motore, lato giusto per ruolo);
  **Questa Soglia Vale X€** (il RETROATTIVO: «mancano 3,2 punti alla S3 =
  +423€ sui 47 pezzi già fatti», gate W3 e malus30 mostrati); Sprint di Fine
  Mese (plancia direzione ordinata per €/punto + frasi da `sprint_frasi`);
  Cestino dei Soldi (scoperture/esclusioni che non pagano); Cooperation
  (funnel del caller fissati→attivati, chiude il feedback loop).
- **Cliente che torna**: **Cabina di Regia Appuntamenti** (il Calendario
  rivoluzionario: esito a 1 tap dalla Home, escalation ambra→rosso pulsante
  che si àncora in cima finché non si esita, vista direttore col tasso di
  esito per negozio, «da_rifissare» genera il richiamo); Miniere (cross-sell
  da `clients`×`contracts`: mobile senza fisso, luce senza gas, rate in
  scadenza — con € attesi dal motore); Richiami d'Oro (caller); Compleanni
  (da `dataNascitaDaCF`, WhatsApp precompilato).
- **WOW**: Telefutura Live (layout «da TV di negozio»: ticker vendite in €
  realtime, derby, countdown 19); Il Gemello Migliore (coaching automatico:
  il tuo mix vs il tuo miglior mese, «+680€ con 1 Conv/giorno in più»); Le 5
  Telefonate d'Oro (outbound autogenerato incrociando miniere+perse+disdette+
  compleanni, ordinato per € attesi, CF con pratiche caller esclusi).

## CONVERGENZE A∩B (dove due analisi indipendenti coincidono = i best bet)

1. **Il calendario a escalation con esito inline** (A «Agenda viva» ≡ B
   «Cabina di Regia») — remind aggressivo ma elegante, 1 tap.
2. **L'euro al posto del pezzo** (A «In tasca»+«Contatore €» ≡ B «Contatore
   €»+«Questa Soglia Vale X€») — col RETROATTIVO come leva regina.
3. **La giornata come rituale** (A «La mia giornata» ≡ B «Regista»).
4. **Streak e rivalità 1-vs-1** (A «Streak»+«Rivali» ≡ B «Serie»+«Derby»).
5. **Loss aversion sui malus/esiti** (A «Fughe di valore» ≡ B «Scudo Malus»).

## CATALOGO FINALE (merge)

**Spina dorsale = visione B** (più granulare e verificata sul DB), con gli
innesti della visione A:
- **Widget broadcast della direzione**: l'admin può PINNARE una card a tutta
  la rete per N giorni (lo Sprint in prima posizione per tutti) — il megafono
  che nessuna delle due viste B aveva.
- **«Squadra oggi»** dello store manager (chi è in turno, vendite per testa,
  nudge gentile a chi è a zero alle 16) — si fonde nel Regista variante
  manager.
- **Anatomia fissa delle card** (regola A): numero-eroe + contesto/delta +
  UNA azione. Leggibile in 3 secondi, mai una tabella nuda.
- «Fughe di valore» (A) si fonde in Scudo Malus + Cestino dei Soldi (B).

**Set default per ruolo (max 10)**: tabella della visione B (righe 1-10 per
consulente / store manager / caller / direttore CC / tecnico / agente /
direzione) adottata come default, con l'aggiunta del broadcast direzionale.
Gruppi galleria: + «⏰ Rituali» · «💶 Soldi» · «🔁 Clienti».

**Ordine di costruzione proposto (impatto/sforzo):**
1. 🥇 **Questa Soglia Vale X€** — il motore fa già tutto, manca la card.
2. 🥇 **Cabina di Regia Appuntamenti** — risolve il dolore dichiarato (esiti).
3. 🥇 **Scudo Malus** — tre motori già vivi, zero superficie oggi.
4. 🥈 Contatore € · Regista della Giornata · Il Treno delle 19.
5. 🥈 Derby + Serie + Applausometro (il pacchetto-cultura).
6. 🥉 Dormienti (Telefono Rosso, Porta Girevole, Miniere, Casse Aperte).
7. 🏁 Wow: Telefutura Live → Le 5 Telefonate d'Oro → Gemello Migliore.

**Regole trasversali** (valgono per ogni card): ponte = tutti i numeri da
`commissioning.ts` sugli stessi dati pay/catalogo; aggregazione dei PV sul
negozio che registra (regola 17/08); perimetro storico dichiarato (dati da
fine luglio 2026); privacy quote (% ai ragazzi mai in card non-admin);
intoccabili WhatsApp e Accessi (per Accessi: evoluzione additiva «chi c'è
ADESSO» da `last_seen_at`×`shifts`).
