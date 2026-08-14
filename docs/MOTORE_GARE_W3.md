# Motore gare Wind3 — specifica operativa (franchising, agosto 2026)

> Contratto scritto tra la sezione GARE e le future sezioni ANALISI/COMPENSI.
> Aggiornato al 14/08/2026 sera. Fonti: lettera «GARA AGOSTO.pptx» + «Target
> Wind3 Agosto.xlsx» (Desktop/Telco/Operatori/W3/Agosto 2026) + decisioni di
> Luca registrate nelle note delle singole righe pay.

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
5. La % ai ragazzi è `pay_piste.perc_ragazzi` per pista (card in Regole di
   gara); il lato ragazzi vede le prime `soglie_max` soglie (W3: 3, S1=S1).

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
| ftth | fisso | opzione FTTH / FTTH Extra | molt +1 |
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
