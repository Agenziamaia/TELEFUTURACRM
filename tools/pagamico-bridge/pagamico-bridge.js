#!/usr/bin/env node
/*
 * pagamico-bridge — ponte TCP per la cassa automatica pagAmico (PayPrint).
 *
 * Reverse-engineered da SuiteMobile (MIRA SOLUTIONS): Cashmatic_lib.dll ->
 * classe PagAmico2. Protocollo: socket TCP grezzo su <ip>:9100, comandi ASCII
 * senza terminatore, risposte in JSON.
 *
 *   Comandi (ASCII):
 *     CL              -> pulisci display
 *     IN + 6 cifre    -> incassa CONTANTI (centesimi zero-pad, es. 12,50€ = IN001250)
 *     PO + 6 cifre    -> incassa tramite POS/carta (Ingenico integrato)
 *     AN              -> annulla operazione in corso
 *
 *   Risposta (JSON) campi:
 *     response         codice stato: "IN"=pagato, "P"/"PO"=parziale, "CL"=ack, "ER..."=errore
 *     collectedAmount  importo incassato finora (decimale con punto, es. "12.50")
 *     errorList        se pagato e errorList[2]=='1' || [3]=='1' -> resto in esaurimento (sottoscorta)
 *     posFinancialTransactionEndResponseMessage  scontrino carta a larghezza fissa (>=236 char)
 *
 * Il CRM (che gira sul VPS) NON puo' vedere la LAN del negozio: questo ponte
 * va eseguito su un PC del negozio, sulla stessa rete della cassa (.201).
 * Il CRM lo chiama in HTTP; il ponte parla col la macchina e restituisce l'esito.
 *
 * Avvio:  node pagamico-bridge.js
 * Config: variabili d'ambiente PAGAMICO_IP (def 192.168.1.201), BRIDGE_PORT (def 4801)
 */
'use strict';

const net  = require('net');
const http = require('http');

const CASH_IP   = process.env.PAGAMICO_IP  || '192.168.1.201';
const CASH_PORT = Number(process.env.PAGAMICO_PORT || 9100);
const HTTP_PORT = Number(process.env.BRIDGE_PORT   || 4801);
const CONNECT_TIMEOUT_MS = 8000;   // timeout apertura socket
const OP_TIMEOUT_MS      = 180000; // timeout complessivo incasso (3 min)

// -------------------------------------------------------------------------
// codifica importo -> comando
// -------------------------------------------------------------------------
function comandoImporto(euro, pos) {
  const cents = Math.round(Number(euro) * 100);
  if (!Number.isFinite(cents) || cents < 0 || cents > 999999) {
    throw new Error('importo non valido: ' + euro);
  }
  return (pos ? 'PO' : 'IN') + String(cents).padStart(6, '0');
}

function toDecimal(x) {
  if (x == null) return null;
  const v = parseFloat(String(x).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

// -------------------------------------------------------------------------
// scontrino POS (carta): offset a larghezza fissa, come PagAmico2.interpreta_risposta
// -------------------------------------------------------------------------
function parseRicevutaPos(m) {
  if (typeof m !== 'string' || m.length < 236) return null;
  const sub = (start, len) => m.substr(start, len);
  const esito = sub(11, 2); // "00" = eseguita
  return {
    esito: esito === '00' ? 'TRANSAZIONE ESEGUITA' : 'TRANSAZIONE NEGATA',
    righe: [
      '***** Incasso POS *****',
      sub(61, 16),
      sub(138, 24),
      sub(162, 24),
      sub(186, 24),
      'Term. Id : ' + sub(1, 8),
      'Acq. code : ' + sub(13, 11),
      'Eserc : ' + sub(256, 15),
      'PAN : ' + sub(77, 19),
      'STAN : ' + sub(34, 6) + ' APP.CODE : ' + sub(250, 6),
      'AUT.CODE : ' + sub(279, 2),
      esito === '00' ? 'TRANSAZIONE ESEGUITA' : 'TRANSAZIONE NEGATA',
    ],
  };
}

// -------------------------------------------------------------------------
// interpreta una risposta JSON — schema REALE confermato live (firmware 8.54):
//   {response, amountRequested, amountToCollect, collectedAmount, amountUnpaid,
//    collectedCoins, collectedBanknotes, changeCoins, changeBanknotes, amountPaid,
//    errorCode, errorType, errorList("E0000"=ok), coinsInStock[], bankNotesInStock[],
//    firmwareVers, serialNumber, changeReturn, Halted, posFinancialTransactionEndResponseMessage}
//   Importi in EURO (numeri JSON). response: "OK"=ack/idle, "p"=incassato, "AN"=annullo ack.
// muta `st` (stato dell'operazione)
// -------------------------------------------------------------------------
function interpreta(jsonStr, st) {
  let o;
  try { o = JSON.parse(jsonStr); } catch { return false; }
  st.last = o;

  const code = String(o.response ?? '').toUpperCase();
  st.responseCode = code;

  // importi (euro, numeri JSON)
  if (typeof o.amountRequested === 'number') st.richiesto = o.amountRequested;
  if (typeof o.collectedAmount === 'number') st.incassato = o.collectedAmount;
  if (typeof o.amountUnpaid === 'number') st.daPagare = o.amountUnpaid;
  if (typeof o.amountPaid === 'number' && o.amountPaid > 0) st.pagato = o.amountPaid;
  if (typeof o.changeCoins === 'number') st.restoMonete = o.changeCoins;
  if (typeof o.changeBanknotes === 'number') st.restoBanconote = o.changeBanknotes;
  if (o.serialNumber) st.serialNumber = o.serialNumber;
  if (o.firmwareVers != null) st.firmware = o.firmwareVers;
  if (Array.isArray(o.coinsInStock)) st.coinsInStock = o.coinsInStock;
  if (Array.isArray(o.bankNotesInStock)) st.bankNotesInStock = o.bankNotesInStock;

  // errore: "E0000" = nessun errore (sentinel confermato); errorCode "OK" (es. dopo AN) NON e' errore.
  // NB: alcuni codici errorList sono solo warning (sotto-soglia resto) e NON interrompono il servizio;
  // finche' non abbiamo il catalogo codici da PayPrint NON abortiamo qui: registriamo il codice e
  // lasciamo che il completamento (incassato>=richiesto) o il timeout decidano l'esito.
  const el = String(o.errorList ?? '').trim();
  if (el && el !== 'E0000') { st.warningList = el; st.errorCode = o.errorCode ?? null; st.errorType = o.errorType ?? null; }

  if (code === 'AN') st.annullo_effettuato = true;

  // pagamento completato: importo richiesto interamente incassato
  if (st.richiesto > 0 && (st.incassato >= st.richiesto || st.daPagare <= 0) && st.incassato > 0) {
    st.pagamento_ok = true;
  }

  // scontrino carta (POS)
  const rp = parseRicevutaPos(o.posFinancialTransactionEndResponseMessage);
  if (rp) st.ricevutaPos = rp;

  return true;
}

// -------------------------------------------------------------------------
// operazione: apre socket, invia comando, legge le risposte JSON finche'
// incassato >= importo (o errore / annullo / timeout).
//  onProgress(st) chiamato ad ogni aggiornamento.
//  ritorna una Promise che risolve con lo stato finale.
// -------------------------------------------------------------------------
function eseguiOperazione(comando, importoTarget, onProgress) {
  return new Promise((resolve) => {
    const st = {
      comando, importoTarget,
      richiesto: 0, incassato: 0, daPagare: 0, pagato: 0,
      restoMonete: 0, restoBanconote: 0,
      pagamento_ok: false, errore: false, sottoscorta: false, annulla: false,
      annullo_effettuato: false, responseCode: '',
      warningList: null, errorCode: null, errorType: null,
      firmware: null, serialNumber: null, ricevutaPos: null,
    };

    const sock = new net.Socket();
    let buf = '';
    let opTimer = null;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (opTimer) clearTimeout(opTimer);
      try { sock.end(); } catch {}
      try { sock.destroy(); } catch {}
      resolve(st);
    };

    // permette al chiamante di annullare
    st._cancel = () => {
      st.annulla = true;
      try { sock.write(Buffer.from('AN', 'ascii')); } catch {}
    };

    sock.setTimeout(CONNECT_TIMEOUT_MS);
    sock.once('timeout', () => {
      if (!st.pagamento_ok) { st.errore = true; st.erroreMsg = 'timeout socket'; }
      finish();
    });
    sock.once('error', (e) => {
      st.errore = true; st.erroreMsg = String(e && e.message || e);
      finish();
    });

    sock.connect(CASH_PORT, CASH_IP, () => {
      sock.setTimeout(0); // dopo connect gestiamo noi il timeout complessivo
      opTimer = setTimeout(() => {
        if (!st.pagamento_ok) { st.errore = true; st.erroreMsg = 'timeout operazione'; }
        finish();
      }, OP_TIMEOUT_MS);
      sock.write(Buffer.from(comando, 'ascii'));
    });

    sock.on('data', (chunk) => {
      buf += chunk.toString('ascii');
      // ogni Receive di SuiteMobile = un JSON; qui estraiamo oggetti JSON bilanciati
      let obj;
      while ((obj = estraiJson(buf)) !== null) {
        buf = obj.rest;
        interpreta(obj.json, st);
        if (typeof onProgress === 'function') onProgress(st);
        if (st.errore) return finish();
        if (comando.startsWith('CL')) return finish(); // CL: una risposta = snapshot stato
        if (st.pagamento_ok) return finish();
      }
    });

    sock.on('close', () => finish());
  });
}

// estrae il primo oggetto JSON completo (parentesi bilanciate) da `s`
function estraiJson(s) {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return { json: s.slice(start, i + 1), rest: s.slice(i + 1) }; }
    }
  }
  return null; // JSON incompleto: aspetta altri byte
}

// -------------------------------------------------------------------------
// HTTP API
// -------------------------------------------------------------------------
const sessioniAttive = new Map(); // id -> st (per /cancel)
let seq = 1;

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  try {
    // GET /health -> prova solo la connessione TCP
    if (req.method === 'GET' && url.pathname === '/health') {
      const st = await eseguiOperazione('CL', null, null); // CL = innocuo, pulisce display + snapshot
      return sendJson(res, 200, {
        ok: !st.errore, ip: CASH_IP, port: CASH_PORT,
        response: st.responseCode || null,
        firmware: st.firmware ?? null, serialNumber: st.serialNumber ?? null,
        warning: st.warningList || null,
        coinsInStock: st.coinsInStock || null, bankNotesInStock: st.bankNotesInStock || null,
        errore: st.errore || false, erroreMsg: st.erroreMsg || null,
      });
    }

    // POST /clear -> pulisci display
    if (req.method === 'POST' && url.pathname === '/clear') {
      const st = await eseguiOperazione('CL', null, null);
      return sendJson(res, 200, { ok: !st.errore, response: st.responseCode || null });
    }

    // POST /collect { amount, pos } -> incassa; risposta finale in JSON.
    // (streaming SSE opzionale con ?stream=1)
    if (req.method === 'POST' && url.pathname === '/collect') {
      const body = await readBody(req);
      const amount = Number(body.amount);
      const pos = !!body.pos;
      if (!Number.isFinite(amount) || amount <= 0) return sendJson(res, 400, { ok: false, error: 'amount mancante o non valido' });

      const cmd = comandoImporto(amount, pos);
      const id = String(seq++);
      const stream = url.searchParams.get('stream') === '1';

      if (stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
        const send = (ev, d) => res.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`);
        const p = eseguiOperazione(cmd, amount, (st) => { sessioniAttive.set(id, st); send('progress', { id, incassato: st.incassato, target: amount }); });
        send('start', { id, comando: cmd, target: amount });
        const st = await p;
        sessioniAttive.delete(id);
        send('done', esitoFinale(st, amount));
        return res.end();
      }

      const st = await new Promise((resolve) => {
        const pr = eseguiOperazione(cmd, amount, (s) => sessioniAttive.set(id, s));
        pr.then(resolve);
      });
      sessioniAttive.delete(id);
      return sendJson(res, 200, esitoFinale(st, amount, id));
    }

    // POST /cancel { id } -> annulla la sessione (invia AN)
    if (req.method === 'POST' && url.pathname === '/cancel') {
      const body = await readBody(req);
      const st = sessioniAttive.get(String(body.id));
      if (st && typeof st._cancel === 'function') { st._cancel(); return sendJson(res, 200, { ok: true }); }
      return sendJson(res, 404, { ok: false, error: 'sessione non trovata' });
    }

    return sendJson(res, 404, { ok: false, error: 'endpoint sconosciuto' });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: String(e && e.message || e) });
  }
});

function esitoFinale(st, target, id) {
  // resto = quanto la macchina ha erogato (changeCoins+changeBanknotes); fallback incassato-richiesto
  const restoErogato = +(( (st.restoMonete || 0) + (st.restoBanconote || 0) )).toFixed(2);
  const resto = st.pagamento_ok
    ? (restoErogato > 0 ? restoErogato : Math.max(0, +(((st.incassato || 0) - target)).toFixed(2)))
    : 0;
  return {
    id: id ?? null,
    ok: st.pagamento_ok && !st.errore,
    pagato: st.pagamento_ok,
    incassato: st.incassato || 0,
    richiesto: target,
    resto,
    restoMonete: st.restoMonete || 0,
    restoBanconote: st.restoBanconote || 0,
    sottoscorta: st.sottoscorta || false,
    warning: st.warningList || null,       // codice errorList != E0000 (es. sotto-soglia resto)
    errore: st.errore || false,
    erroreMsg: st.errore ? (st.erroreMsg || `${st.errorCode || ''} ${st.errorType || ''}`.trim() || null) : null,
    firmware: st.firmware ?? null,
    serialNumber: st.serialNumber ?? null,
    ricevutaPos: st.ricevutaPos || null,
  };
}

server.listen(HTTP_PORT, () => {
  console.log(`pagamico-bridge in ascolto su http://localhost:${HTTP_PORT}`);
  console.log(`  cassa: ${CASH_IP}:${CASH_PORT}`);
  console.log(`  endpoint: GET /health | POST /clear | POST /collect {amount,pos} | POST /cancel {id}`);
});
