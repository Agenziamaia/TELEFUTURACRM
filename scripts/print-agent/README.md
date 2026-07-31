# Stampa CRM → stampante fiscale (Epson RT / fpMate)

La stampante è un **Epson RT fiscale** che espone un servizio HTTP sul LAN del
negozio: `POST http://<ip>/cgi-bin/fpmate.cgi` con XML ePOS dentro una busta SOAP
(`Content-Type: text/xml`, `SOAPAction: ""`, nessuna autenticazione).

Il CRM è in **cloud** e **non raggiunge** l'IP privato del negozio (es.
`192.168.1.50`), e una pagina HTTPS non può parlare con una stampante `http://`
(mixed content). Quindi:

```
 CRM (cloud)  --enqueue-->  coda print_jobs  <--poll--  AGENTE (PC del negozio)  --SOAP-->  stampante LAN
                                     ^                                                         |
                                     +---------------------- esito --------------------------- +
```

## Endpoint (VPS)
Tutti richiedono header `Authorization: Bearer <PRINT_AGENT_TOKEN>`.

- `POST /api/print/enqueue` — mette in coda un job.
  Body: `{ kind, negozio?, deviceUrl?, lines?, requestXml? }`
  - `kind: "status"` (default, **sola lettura**), `"rt_status"`, `"test"` (slip NON
    fiscale), `"non_fiscal"` (con `lines: string[]`), `"raw"` (con `requestXml`).
- `GET  /api/print/next?negozio=…` — l'agente ritira il prossimo job.
- `POST /api/print/result` — l'agente riporta l'esito `{ id, ok, response }`.

## Agente nel negozio
`agent.ps1` gira su un PC Windows del negozio (stessa rete della stampante). Non
installa nulla.

```powershell
powershell -ExecutionPolicy Bypass -File agent.ps1 -Token "IL_TOKEN" -Negozio "Donna"
```

Per lasciarlo sempre attivo: Utilità di pianificazione → all'accesso → esegui il
comando qui sopra.

## Prova sicura in 2 passi

**1) Test diretto stampante (sul PC del negozio, sola lettura — non stampa nulla).**
Conferma che il PC raggiunge la stampante e che il protocollo risponde:
```powershell
$soap = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><printerCommand><queryPrinterStatus /></printerCommand></s:Body></s:Envelope>'
(Invoke-WebRequest -Uri "http://192.168.1.50/cgi-bin/fpmate.cgi" -Method Post -Body $soap -ContentType "text/xml; charset=UTF-8" -Headers @{ SOAPAction='""' }).Content
```
Deve tornare un XML con lo stato stampante.

**2) Test dell'intera catena (CRM → coda → agente → stampante).**
Avvia `agent.ps1`, poi metti in coda un job di stato (sola lettura):
```powershell
$h = @{ Authorization = "Bearer IL_TOKEN"; "Content-Type"="application/json" }
Invoke-RestMethod -Uri "https://crm.telefuturasrl.com/api/print/enqueue" -Headers $h -Method Post -Body '{"kind":"status","negozio":"Donna"}'
```
L'agente lo ritira, lo manda alla stampante e ne registra l'esito (visibile in
`print_jobs.result`). Solo quando questa catena funziona passiamo a `kind:"test"`
(scontrino NON fiscale su carta) e poi al documento vero definito con Luca/Francesco.

> ⚠️ Finché non è tutto verificato usare solo `kind:"status"`/`"rt_status"`
> (sola lettura). Niente comandi fiscali sulla stampante già **in servizio**.
