const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = 9101;
const SECRET_FILE = '/root/.config/telefutura-webhook-secret';
const LOG = '/var/log/telefutura-webhook.log';
const DEPLOY_SCRIPT = '/root/scripts/telefutura-deploy-on-push.sh';
// Il repo e' stato trasferito da Rahib9045 a Agenziamaia: GitHub invia il nome
// NUOVO, il confronto usava quello vecchio e ogni push finiva scartato
// ("ignore: repo=Agenziamaia/TELEFUTURACRM"). Accettiamo entrambi, cosi' un
// altro trasferimento non rompe di nuovo il deploy.
const REPO_FULL_NAMES = ['Agenziamaia/TELEFUTURACRM', 'Rahib9045/TELEFUTURACRM'];
const BRANCH_REF = 'refs/heads/main';

function log(msg) {
  fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${msg}
`);
}

function getSecret() {
  return fs.readFileSync(SECRET_FILE, 'utf8').trim();
}

function verifySignature(rawBody, signature) {
  const secret = getSecret();
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature || ''));
  } catch {
    return false;
  }
}

function runDeploy() {
  const child = spawn('bash', [DEPLOY_SCRIPT], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/github-webhook/telefutura-crm') {
    res.statusCode = 404;
    return res.end('not found');
  }

  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks);
    const event = req.headers['x-github-event'];
    const signature = req.headers['x-hub-signature-256'];

    if (!verifySignature(rawBody, signature)) {
      log('reject: bad signature');
      res.statusCode = 401;
      return res.end('bad signature');
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (e) {
      log('reject: invalid json');
      res.statusCode = 400;
      return res.end('invalid json');
    }

    const repo = payload?.repository?.full_name;
    const ref = payload?.ref;

    if (event !== 'push') {
      log(`ignore: event=${event}`);
      res.statusCode = 202;
      return res.end('ignored');
    }

    if (!REPO_FULL_NAMES.includes(repo) || ref !== BRANCH_REF) {
      log(`ignore: repo=${repo} ref=${ref}`);
      res.statusCode = 202;
      return res.end('ignored');
    }

    log(`accepted: ${repo} ${ref} ${payload?.after || ''}`);
    runDeploy();
    res.statusCode = 202;
    res.end('deploy queued');
  });
});

server.listen(PORT, '127.0.0.1', () => {
  log(`listener up on 127.0.0.1:${PORT}`);
});
