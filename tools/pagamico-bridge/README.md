# pagamico-bridge — integrazione cassa automatica pagAmico (PayPrint)

Ponte software che permette al CRM di comandare la **cassa automatica pagAmico**
(incasso contanti + resto, con eventuale POS carta). Protocollo ricostruito da
SuiteMobile (MIRA SOLUTIONS): `Cashmatic_lib.dll` → classe `PagAmico2`.

## Perché serve un ponte
Il CRM gira sul server (VPS, internet). La cassa pagAmico sta sulla **LAN del negozio**
(`192.168.1.201`) e non è raggiungibile da internet. Quindi questo ponte va eseguito su
un **PC del negozio, sulla stessa rete della cassa**. Il CRM lo chiama in HTTP; il ponte
parla con la macchina via TCP e restituisce l'esito. (Stesso schema del ponte per la
stampante fiscale Epson.)

## Protocollo pagAmico (`.201:9100`)
- **Trasporto:** socket TCP grezzo su porta **9100**. Comandi = **stringhe ASCII senza
  terminatore**. Risposte = **JSON**.
- **Importo:** centesimi a 6 cifre con zero davanti. Es. `12,50 €` → `001250`.
- **Comandi:**
  | Comando | Byte ASCII | Significato |
  |---|---|---|
  | Pulisci display | `CL` | reset schermo (innocuo, usato per il test) |
  | Incassa contanti | `IN` + 6 cifre | es. `IN001250` = chiedi 12,50 € in contanti |
  | Incassa con carta | `PO` + 6 cifre | usa il POS Ingenico integrato |
  | Annulla | `AN` | interrompe l'operazione in corso |
- **Risposta JSON:** `response` (`"IN"`=pagato, `"P"`/`"PO"`=parziale, `"CL"`=ack,
  `"ER..."`=errore), `collectedAmount` (incassato finora), `errorList`
  (se pagato e la 3ª/4ª cifra è `1` → **resto in esaurimento**),
  `posFinancialTransactionEndResponseMessage` (scontrino carta a larghezza fissa).
- **Flusso incasso:** apri socket → invia `IN######` → leggi i messaggi JSON finché
  `collectedAmount >= importo` → la macchina dà il resto → chiudi socket.
- La macchina scrive anche un log in `C:\mirasolutions\SuiteMobile\PDV\log\logpagamico.txt`.

## 1) Test veloce SENZA installare nulla (conferma il protocollo)
Da un PC del negozio (PowerShell). Invia `CL` (pulisci display): **non muove soldi**,
serve solo a confermare che parliamo con la macchina e a vedere una risposta JSON reale.

```powershell
$c = New-Object System.Net.Sockets.TcpClient
$c.ReceiveTimeout = 10000
$c.Connect("192.168.1.201", 9100)
$s = $c.GetStream()
$b = [Text.Encoding]::ASCII.GetBytes("CL")
$s.Write($b,0,$b.Length); $s.Flush()
$buf = New-Object byte[] 2048
try   { $n = $s.Read($buf,0,$buf.Length); "RISPOSTA: " + [Text.Encoding]::ASCII.GetString($buf,0,$n) }
catch { "nessuna risposta entro 10s (ma la connessione TCP e' riuscita)" }
$c.Close()
```

## 2) Avvio del ponte
Serve Node.js (già presente per il CRM). Sul PC del negozio:

```
node pagamico-bridge.js
```
Variabili opzionali: `PAGAMICO_IP` (def `192.168.1.201`), `BRIDGE_PORT` (def `4801`).

Endpoint:
- `GET  /health` → prova la connessione (manda `CL`).
- `POST /clear` → pulisci display.
- `POST /collect` body `{ "amount": 12.50, "pos": false }` → incassa. Risposta finale:
  `{ ok, pagato, incassato, richiesto, resto, sottoscorta, errore, ricevutaPos }`.
  Con `?stream=1` invia aggiornamenti live (SSE `progress`) mentre il cliente inserisce.
- `POST /cancel` body `{ "id": "3" }` → annulla la sessione in corso (manda `AN`).

Esempio (incasso di prova di 1 centesimo — poi si annulla con `/cancel`):
```
curl -X POST http://localhost:4801/collect -H "Content-Type: application/json" -d "{\"amount\":0.01,\"pos\":false}"
```

## 3) Integrazione nel CRM (da fare)
Nel flusso di chiusura vendita (`registra-vendita`), quando si sceglie **contanti**:
CRM → `POST /collect {amount}` al ponte → mostra il popup con l'incassato live →
a pagamento OK stampa lo scontrino fiscale (Epson) e conclude la vendita.
