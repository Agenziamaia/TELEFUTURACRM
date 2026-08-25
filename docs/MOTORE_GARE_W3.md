# Motore gare Wind3 — specifica operativa (franchising, agosto 2026)

> Contratto scritto tra la sezione GARE e le future sezioni ANALISI/COMPENSI.
> Aggiornato al 14/08/2026 sera. Fonti: lettera «GARA AGOSTO.pptx» + «Target
> Wind3 Agosto.xlsx» (Desktop/Telco/Operatori/W3/Agosto 2026) + decisioni di
> Luca registrate nelle note delle singole righe pay.

> ⚠️ **PRIMA di toccare le gare** (qualsiasi brand, qualsiasi terminal):
> leggere e rispettare `docs/PONTE_GARE_CALCOLATORE_ANALISI.md` — regola di
> Luca 25/08: Gare, Calcolatore e Analisi devono restare allineati DA SOLI
> (stessa fonte dati, stesso motore, scelte di vendita solo a catalogo).

## Il flusso unico (già vivo nel Calcolatore)

Per OGNI vendita valida (`produzioneValidaGare`, sostituzioni escluse):

1. `matchRigheAttivazione(righe, vendita)` → il SET di righe che la pagano:
   - piste mobile / fisso / lucegas → modello ADDITIVO (`matchComponenti`):
     una BASE (scelta per condizioni; sul mobile Underground a flag) + le
     componenti accese dai FLAG (`flagsComponenti`) — vedi tabella sotto;
   - tutte le altre piste → pick-one classico (`matchRigaTabellare`,
     condizioni tipo cliente/categoria/prodotto/offerta/provenienza/opzioni,
     vince la più specifica; le righe `componente` sono invisibili qui).
2. `puntiPerRighe(set)` → punti in soglia della vendita.
   `calcolaAvanzamento` somma per pista, determina la soglia raggiunta e
   applica il GATE W3 (4ª soglia mobile solo con 2ª fisso) + il segnale
   `malus30Mobile` (fisso sotto S1 o meno di 6 P.IVA mobile).
3. Nota la soglia: `payEuroAttivazione(set, soglia, canone)` → € della
   vendita = canone × Σ moltiplicatori + flat (contrattuali, gettoni, tiers
   in € delle righe non-moltiplicatore).
4. In più, se la vendita è un EVENTO BUSINESS valido: premio a evento della
   gara Business (righe pista `business_piva`: 25/35/45 € alla soglia di
   Ragione Sociale, punti business propri per evento) — SI SOMMA al pay.
5. La % ai ragazzi si governa nel COMMISSIONING azienda, card 👥 (Luca
   25/08): per soglia su mobile/fisso/lucegas (`pay_mappa_soglie`,
   tier_nostro=tier_loro — agosto: mobile 70/80/80, fisso 70/80/80, gas
   90/90/90), unica su cb/protetti (`pay_piste.perc_ragazzi` — 85/100);
   perc_ragazzi=0 = pista solo-azienda (business_piva, assicurazioni).
6. Le SOGLIE dei ragazzi vanno da S1 a S3 e si editano nella card 📐 della
   scheda ragazzi → `pay_soglie` lato `ragazzi` (le manuali VINCONO sulle
   derivate; casella vuota = derivate azienda, tagliate da
   `pay_piste.soglie_max=3` su mobile/fisso/lucegas azienda). Il tabellare
   pay ragazzi tronca i tiers a 3 (le S4/S5 della lettera non esistono per
   loro).

## Componenti e flag (da dove si accende ogni cosa)

| Componente | Pista | Si accende da | Effetto |
|---|---|---|---|
| base / base_underground | mobile | sempre / offerta ~Underground | molt 1/1,5/2/2,25 (und. −0,5) · punti 0,75 |
| mnp | mobile | prodotto «Mobile MNP» | molt +1 |
| tied | mobile | categoria «Mobile Ric. Auto» | molt +2/+2/+2,25/+2,25 |
| piva | mobile | tipo cliente Business | molt +1 |
| punti_security | mobile | opzione Security/Security Pro | punti +0,25 (GA→1) |
| punti_mnp_prov | mobile | provenienza Iliad/Coop/Poste/Tiscali | punti +1 |
| punti_staff | mobile | offerta ~Professional Staff | punti +0,5 |
| punti_fin | mobile | ⚠️ ANALISI: telefono finanziato | punti +1,25 |
| contrattuale_untied/tied | mobile | Wallet / Ric. Auto | +1 € / +5 € |
| base | fisso | sempre | molt 2/3/3,5/4/5 · punti 1 |
| conv | fisso | offerta ~Conv | molt +2 |
| piva | fisso | tipo cliente Business | molt +1 · punti +0,5 |
| la | fisso | opzione GNP (gruppo Attivazione obbligatorio GA/GNP) | molt +1 |
| ftth | fisso | opzione FTTH (gruppo Tecnologia obbligatorio FTTH/FTTC) o FTTH Extra | molt +1 |
| fwa | fisso | prodotto/offerta ~FWA/Super Internet | molt +1,5 |
| opzioni | fisso | opzione Chiamate Illimitate/Internazionali | molt 0,25-1,5 |
| netflix | fisso | opzione Netflix | +10 € · punti +0,5 |
| pscu | fisso | opzione Più Sicuri Ufficio | +2 € · punti +0,25 |
| cloud | fisso | opzione Cloud | +8 € (0 punti) |
| fritz | fisso | offerta ~Professional Box | +40 € · punti +1 |
| seconda_linea | fisso | opzione 2°Linea | tiers € 20/30/35/40/50 · punti 1,5 |
| contrattuale/_conv/_voce/_2linea | fisso | offerta/opzione | 23/19/17/10 € |
| base ×4 | lucegas | offerta (Multiservice = conv +25 inclusa) | tiers € 70-155 · punti 1 |
| lg_pronto | lucegas | opzione Pronto Intervento | +10 € |
| lg_bollettino | lucegas | opzione Bollettino | −15 € |

Assicurazioni: pick-one per polizza (canone × molt, punti propri; Protecta
via opzioni Kit+Pagamento obbligatorie → 18 righe kit). Customer Base:
gettoni flat per offerta cluster. Protetti: righe kit attive (opzioni).

## Cosa DEVE aggiungere l'analisi (checklist, nient'altro è in sospeso)

1. **Gettoni telefoni/device** (righe documentali SPENTE, pista mobile):
   importo da fascia street-price del MODELLO venduto (listini_terminali) ×
   tipo finanziamento (VAR/Findomestic/Compass) — matrice già nelle righe.
2. **punti_fin +1,25**: accenderlo quando la vendita mobile ha telefono
   incluso finanziato/Rata Smart.
3. **Giro X Il Mondo**: 12,5% × campo «Premio versato (€)» + 1 punto ogni 50 €.
4. **Malus −30% premio mobile**: `avz.malus30Mobile` è già calcolato — va
   APPLICATO al premio mobile del mese in chiusura.
5. **Partnership Reward**: contare i punti eventi CB (righe pista
   `partnership`), confrontare col target PDV (extra.pr), premio 100%/80%/0,
   modificatori: W3 Protetti (extra.protetti), assicurazioni (soglie rete
   con 🎁), Sos Caring e qualità (manuali, campo ✎ finché niente report).
6. **Bollettino postale** (38-53 € a soglia): evento oggi non registrabile.
7. **Decurtazione −50% L&G** su clienti ex W3 Powered by Acea (non tracciato).
8. **Polizze annuali +0,5 punti**: frazionamento non tracciato.
9. **2 vendite storiche** «Pronto Intervento» come assicurazione: senza pay,
   Luca decide se riclassificarle.

## Dove si edita cosa

- 🎯 Tabella target (pannello negozi): soglie negozio e rete, 🎁 bonus
  assicurazioni (globale), 💶 pay/pezzo business.
- ⚖️ Regole di gara: componenti a moltiplicatore, punti, contrattuali,
  partnership, % ai ragazzi per categoria.
- 💶 Commissioning: TUTTI i gettoni one-shot (celle bianche, editabili);
  il verde è calcolato e si cambia dalle Regole.
- Upload mensile (da costruire): PPTX inizio mese → moltiplicatori/punti in
  Regole + gettoni in Commissioning + stima soglie (cluster × sconti riga 2
  dell'excel × pesi POS); Excel del 10 → target definitivi (con anteprima
  delle differenze prima di applicare).

---

## Playbook per il cantiere MULTIBRAND (il metodo usato sul franchising)

Fonte: `Desktop/Telco/Operatori/W3/Agosto 2026/Incentivazione Agosto 2026
Multibrand.pdf`. Replicare questi passi, nell'ordine:

1. **Lettura da zero della lettera**, slide per slide (convertire in PDF con
   LibreOffice se serve), SENZA fidarsi del lavoro precedente; poi match con
   l'esistente. Occhio ai valori barrati (sono il mese vecchio).
2. **Separazione netta** (regola di Luca): moltiplicatori, punteggi e
   contrattuali → Regole di gara; ogni pay unitario one-shot → Commissioning
   in celle editabili. Il verde = calcolato, il bianco = gettone della lettera.
3. **Componenti additive** col motore esistente: `matchComponenti` supporta
   già più basi per pista scelte per condizioni (fatto per Luce&Gas) — per il
   multibrand basta seminare righe `componente` con la pista giusta.
4. **Flag dalle scelte di Registra Vendita**: PRIMA verificare i nomi veri a
   catalogo (categorie, prodotti, offerte, opzioni) — trappole già viste:
   grafie diverse (virgola/punto), dati non tracciati (aggiungere campi o
   opzioni, es. Premio versato, gruppo obbligatorio kit/pagamento).
5. **Collaudo incrociato** categoria per categoria contro Registra Vendita:
   è il metodo che ha trovato tutti i buchi del franchising. La sonda-tooltip
   sulle celle vuote dice sempre il perché.
6. **Operativo**: build con gate sull'exit code; push → deploy automatico sul
   box 204 in ~4-5 min (2-4 min di scosse sulle schede aperte); verifica col
   marker `tf-build-check` nell'HTML del dominio; runner via pooler con dump
   prima di ogni modifica dati; recap UNICO in /verifiche accorpando.

### Stato multibrand già noto (non partire da zero)

- Pannello target: gara On Top a punti cumulati GIÀ seminata — MB-T1 Donna
  Olimpia 180/280/380/480, MB-T2 (Promontori+Garbatella) ×1,85 = 333/518/703/888,
  premi 🎁 250/500/1000/2000 in `pay_target_pdv.extra.premi` (righe MB-*).
- Dalla lettera (letta il 13/08): Top Quality Dealer — mobile soglie
  25/55/90 + extra 130 · fisso 4/8/13/20 + extra 32; punteggi GA 0,5/1/1,5 ·
  MNP 1,75/2,25/2,25 · TIED 0,75/0,75/1; multipos −15% sui POS dopo il primo;
  L&G dealer soglie 1/10/20/30 + 85 con gettoni 75-120 (115-160 micro);
  Boost MNP 35/20 €; il COMMISSIONING € multibrand non è ancora costruito.
- Il segmento Multibrand nella pagina W3 mostra oggi solo il pannello target
  (schede Partnership/Commissioning/Regole sono solo franchising): andranno
  estese o dedicate.

### Aperti del franchising (ereditati, non bloccanti)

Collaudo Telefono a Rate · prezzi Add-On Fissi e business · conferma agente
sui 10 € del Pronto Intervento · 2 vendite storiche Pronto da riclassificare ·
frazionamento annuale polizze (+0,5) · upload mensile · analisi (checklist
sopra).
