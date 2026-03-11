# Mappa dati LUCA CRM — Verifica cliente

Documento per la **verifica** da parte del cliente: cosa memorizziamo, dove si usa e come si collega.  
Nessun dettaglio tecnico: solo entità, schermate e relazioni.

---

## Come usare questo documento

- **Verifica**: per ogni sezione, controlla che i dati elencati siano quelli che vuoi in CRM.
- **Segnala**: se manca qualcosa o qualcosa non torna, indicalo per correzione prima dello sviluppo backend.

---

## 1. Mappa generale (dove va ogni dato)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  UTENTI E SEDI                                                                   │
│  • Utenti (nome, email, ruolo, negozio assegnato)                                │
│  • Negozi (nome, codice, società)                                                │
│  • Società (es. Telefutura, Telefutura 2SRL)                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
          │
          │  usati in quasi tutte le schermate
          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  CLIENTI                                                                         │
│  • Anagrafica: tipo (privato/azienda), nome, cognome, ragione sociale,           │
│    cellulare, email, CF/P.IVA, indirizzo, città, ecc.                            │
└─────────────────────────────────────────────────────────────────────────────────┘
          │
          ├──────────────────────────────────┬─────────────────────────────────────┐
          ▼                                  ▼                                     ▼
┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
│  CONTRATTI               │   │  PDA (Pratiche)          │   │  CHIUSURA NEGOZIO        │
│  • Intestatario (cliente)│   │  • Cliente / anagrafica  │   │  • Per negozio + società  │
│  • Negozio, venditore    │   │  • Brand, prodotti       │   │  • Documenti: Cassa, POS, │
│  • Brand, prodotto       │   │  • Stato (Assegnata, OK, │   │    DDT W3, DDT VF, Fatture│
│  • Date, stato, codice   │   │    KO, …)                │   │  • Fatture (da emettere) │
│  • Allegati (documenti)  │   │  • Operatore back office │   │                          │
└─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘
          │                                  │
          │                                  │
          ▼                                  ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│  GESTIONE USATI          │   │  CALENDARIO              │
│  • Dispositivi (modello, │   │  • Appuntamenti (data,   │
│    IMEI, stato, prezzi,  │   │    ora, cliente, agente, │
│    negozio, ricambi,     │   │    negozio, esito)       │
│    pagamento, extra)      │   │  • Task (titolo, data,   │
└─────────────────────────┘   │    assegnatario, stato)   │
                              └─────────────────────────┘

┌─────────────────────────┐   ┌─────────────────────────┐
│  DOCUMENTAZIONE          │   │  COMUNICAZIONI           │
│  • File per brand +      │   │  • Avvisi (titolo, testo,│
│    categoria (Canvass,   │   │    tipo, data)          │
│    Modulistica, Operativa)│   │  • Lettura per utente   │
└─────────────────────────┘   └─────────────────────────┘
```

---

## 2. Dati per area — Cosa memorizziamo e dove si vede

### 2.1 Utenti e accesso

| Cosa memorizziamo | Dove si usa |
|-------------------|-------------|
| Nome, email, ruolo (admin, agente, venditore, store manager, supervisore, back office) | Login, intestazione app, permessi (es. solo admin su Gestione PDA) |
| Negozio assegnato (per agenti/venditori) | Filtri bloccati in Ricerca Contratto, Chiusura, Usati, ecc. |

**Verifica:**  
- [ ] I ruoli elencati sono quelli che usate?  
- [ ] Il “negozio assegnato” è quello giusto per limitare cosa vede ogni utente?

---

### 2.2 Negozi e società

| Cosa memorizziamo | Dove si usa |
|-------------------|-------------|
| Elenco **negozi** (nome, eventuale codice) | Chiusura, Usati, Calendario, Ricerca Contratto, Registra Contratto, PDA Invia |
| **Società** (es. Telefutura, Telefutura 2SRL) | Chiusura Negozio (una chiusura per negozio + società + data) |

**Verifica:**  
- [ ] L’elenco negozi è completo e con i nomi/codici corretti?  
- [ ] Le società da gestire in Chiusura sono tutte e solo queste?

---

### 2.3 Clienti

| Cosa memorizziamo | Note |
|-------------------|------|
| **Privati:** nome, cognome, cellulare, email, codice fiscale, indirizzo, città | Ricerca per CF |
| **Aziende:** ragione sociale, P.IVA, referente, recapito, email, sede legale, indirizzo, città, codice univoco, PEC, IBAN | Ricerca per P.IVA |

**Dove si usa:**  
- Pagina **Clienti** (lista, filtri, dettaglio con ultimi contratti)  
- **Registra Contratto** e **PDA Invia** (ricerca cliente e anagrafica su pratica)

**Verifica:**  
- [ ] I campi anagrafica privati sono tutti quelli che vi servono?  
- [ ] I campi anagrafica aziende sono tutti quelli che vi servono?

---

### 2.4 Contratti

| Cosa memorizziamo | Dove si usa |
|-------------------|-------------|
| Cliente, negozio, venditore, data registrazione/attivazione, stato, codice attivazione, note | Ricerca Contratto, scheda Cliente (ultimi contratti) |
| **Righe prodotto** per contratto: brand, categoria (Mobile, Fisso, …), prodotto, tutti i dettagli compilati nel form (offerta, TNP, CB, GNP, domiciliazione, ecc.) | Registra Contratto (salvataggio completo del passo “Prodotti e contratto”) |
| **Allegati** (documento, contratti, altro) | Registra Contratto – Step Allegati |

**Verifica:**  
- [ ] In Ricerca Contratto vi basta vedere cliente, venditore, brand, prodotto, negozio, date, stato, codice attivazione?  
- [ ] In Registra Contratto dovete poter rivedere/ modificare in seguito tutti i dettagli prodotto (offerta, TNP, CB, ecc.)?  
- [ ] I tipi di allegato (documento, contratti, altro) sono corretti?

---

### 2.5 PDA (Pratiche)

| Cosa memorizziamo | Dove si usa |
|-------------------|-------------|
| Venditore, negozio, cliente (o anagrafica snapshot), tipo cliente (privato/business), brand, stato (Assegnata, Ricevuta, Attivato, Inserito, Sospeso, KO, …), operatore back office, codice contratto/ordine, note | **Gestione PDA** (admin), **PDA Tracking** (agente), **PDA Invia** (invio) |
| **Righe prodotto** per ogni PDA: categoria, nome prodotto, campi dinamici (POD, PDR, seriale SIM, ecc.), opzioni Sky, Luce/Gas, ecc. | Stesso flusso PDA |

**Verifica:**  
- [ ] Gli stati PDA (Assegnata, Ricevuta, Attivato, …) sono quelli che usate?  
- [ ] In Gestione PDA vi serve la “nota pratica” modificabile e visibile in lista?  
- [ ] In Tracking servono tutti i filtri (nominativo, codice contratto/ordine, tipo, venditore, stato, varie date)?

---

### 2.6 Chiusura negozio

| Cosa memorizziamo | Dove si usa |
|-------------------|-------------|
| **Chiusura:** negozio, società, data, ora, operatore | Vista Gestione, Invio Chiusura |
| **Documenti per chiusura:** Cassa, POS, DDT WindTre, DDT Vodafone, Fatture (file caricati) | Vista Gestione (conteggi e allegati), Invio (upload) |
| **Fatture:** da ogni chiusura si ricavano le fatture; stato “emessa” / “da emettere” | Vista Fatture (tab Da emettere / Emesse, filtri negozio/società/date) |
| Eventuale **nota** per società in chiusura | Invio Chiusura |

**Verifica:**  
- [ ] I tipi documento (Cassa, POS, DDT W3, DDT VF, Fatture) sono corretti?  
- [ ] In Vista Fatture vi serve solo “da emettere / emesse” con filtri per negozio, società e date?

---

### 2.7 Gestione usati (dispositivi usati)

| Cosa memorizziamo | Dove si usa |
|-------------------|-------------|
| **Dispositivo:** modello, IMEI, stato (acquistato, in transito, ricevuto, in lavorazione, pronto, in negozio, in vendita, venduto, KO), negozio, negozio di destinazione, prezzi acquisto/vendita, date (registrazione, acquisto, messa in vendita, vendita), grado usura, provenienza Subito, note tecnico | Lista Usati, Dettaglio/Modifica dispositivo |
| **Ricambi** (nome, stato, costo, data consegna prevista) | Dettaglio dispositivo |
| **Pagamento** (contanti, buono, bonifico con IBAN; per bonifico: effettuato sì/no, operatore, data) | Dettaglio dispositivo |
| **Extra margine** (importo, venditore, confermato sì/no, operatore e data conferma) | Dettaglio dispositivo |
| **Storico stati** (chi ha cambiato stato e quando) | Dettaglio dispositivo |
| **Nuovo dispositivo:** anche anagrafica cliente (se nuovo), tipo prodotto, brand/modello, capacità, colore, allegati (documento, dichiarazione vendita) | Form “Aggiungi usato” |

**Verifica:**  
- [ ] Gli stati del dispositivo (acquistato → … → venduto / KO) sono quelli che usate?  
- [ ] Ricambi, pagamento ed extra margine hanno tutti i campi che vi servono?  
- [ ] Il form “Aggiungi usato” deve creare anche un cliente se nuovo?

---

### 2.8 Calendario

| Cosa memorizziamo | Dove si usa |
|-------------------|-------------|
| **Appuntamenti:** data, ora, tipo (in entrata / in uscita / auto), agente, negozio, indirizzo cliente, nome/telefono/CF o P.IVA cliente, note, esito, stato (programmato, attivato, KO, da richiamare, …) | Calendario, creazione/modifica appuntamento |
| **Task:** titolo, data, ora (opzionale), stato (da fare, fatta, sospesa), note, riferimento cliente, creato da, assegnato a | Calendario, creazione/modifica task |

**Verifica:**  
- [ ] I tipi e gli stati appuntamento sono corretti?  
- [ ] I task devono essere assegnabili a un altro utente (assegnato a)?

---

### 2.9 Documentazione

| Cosa memorizziamo | Dove si usa |
|-------------------|-------------|
| **Brand** (es. WindTre, Sky, Vodafone/Fastweb, Energia) | Scelta brand in Documentazione |
| **Categorie:** Canvass attuale, Modulistica utile, Documentazione operativa | Scelta categoria per brand |
| **File:** nome, tipo (es. PDF), dimensione, “compilabile” sì/no, data | Lista e anteprima; upload/modifica in modalità admin |

**Verifica:**  
- [ ] I brand in Documentazione sono quelli giusti?  
- [ ] Le tre categorie (Canvass, Modulistica, Operativa) vi bastano o ne servono altre?

---

### 2.10 Comunicazioni

| Cosa memorizziamo | Dove si usa |
|-------------------|-------------|
| **Avviso:** titolo, testo, tipo (informativo, attenzione, successo), data | Lista Comunicazioni |
| **Lettura** per utente (letta / non letta) | Badge “nuovo”, elenco con evidenza non letti |

**Verifica:**  
- [ ] I tipi di avviso (info, attenzione, successo) sono sufficienti?  
- [ ] Vi serve che ogni utente veda “letto/non letto” per ogni comunicazione?

---

### 2.11 Cataloghi di supporto

| Cosa memorizziamo | Dove si usa |
|-------------------|-------------|
| **Brand** (per contratti/PDA e documentazione) | Registra Contratto, PDA Invia, Documentazione, Ricerca Contratto |
| **Prodotti per brand** (es. Mobile, Fisso, Luce & Gas per WindTre/Fastweb/Sky/…) | PDA Invia, Registra Contratto |
| **Modelli smartphone** (marca + modello) | Usati, Registra Contratto |
| **Ricambi** (elenco nomi componenti) | Usati (scelta ricambio su dispositivo) |

**Verifica:**  
- [ ] I brand e i prodotti per brand riflettono le vostre offerte?  
- [ ] L’elenco marche/modelli smartphone va aggiornato da voi o da noi?  
- [ ] L’elenco ricambi è quello che usate in officina?

---

## 3. Riepilogo schermate → dati

| Schermata | Dati principali che legge/scrive |
|-----------|----------------------------------|
| **Login** | Utenti (email, ruolo, negozio) |
| **Dashboard** | Statistiche PDA (conteggi per stato, brand, segmento) |
| **Gestione PDA** | Elenco PDA con filtri, operatore, stato, note |
| **PDA Invia** | Clienti (ricerca/anagrafica), PDA + righe prodotto, negozi, venditori, brand, prodotti |
| **PDA Tracking** | Stesse PDA filtrate per venditore/agente |
| **Ricerca Contratto** | Contratti, clienti, negozi, venditori, brand (con filtri e permessi per negozio) |
| **Registra Contratto** | Clienti, contratti, righe prodotto (tutti i dettagli), allegati, negozi, venditori |
| **Clienti** | Anagrafica clienti, ultimi contratti per cliente |
| **Chiusura Negozio** | Chiusure (negozio, società, data, ora), documenti allegati, fatture |
| **Vista Fatture** | Fatture da chiusure, stato emessa/da emettere |
| **Usati** | Dispositivi, ricambi, pagamenti, extra margine, storico stati, clienti (in aggiunta usato) |
| **Documentazione** | Brand, categorie, file (lista e upload admin) |
| **Calendario** | Appuntamenti, task, agenti, negozi |
| **Comunicazioni** | Avvisi, lettura per utente |

---

## 4. Checklist finale per il cliente

- [ ] **Utenti e ruoli**: ruoli e negozio assegnato corretti.  
- [ ] **Negozi e società**: elenchi completi e nomi corretti.  
- [ ] **Clienti**: campi anagrafica privati e aziende completi.  
- [ ] **Contratti**: cosa mostrare in Ricerca e cosa salvare in Registra (inclusi dettagli prodotto e allegati).  
- [ ] **PDA**: stati, note, filtri e dati per Gestione e Tracking confermati.  
- [ ] **Chiusura**: tipi documento e flusso Fatture (da emettere/emesse) corretti.  
- [ ] **Usati**: stati dispositivo, ricambi, pagamento, extra margine e form “Aggiungi usato” corretti.  
- [ ] **Calendario**: appuntamenti e task con campi e stati giusti.  
- [ ] **Documentazione**: brand e categorie corretti.  
- [ ] **Comunicazioni**: tipi di avviso e lettura per utente confermati.  
- [ ] **Cataloghi**: brand, prodotti, modelli smartphone, ricambi allineati alla vostra operatività.

---

*Documento generato per verifica dati LUCA CRM. Per modifiche o domande su questa mappa, indicare la sezione e la correzione desiderata.*
