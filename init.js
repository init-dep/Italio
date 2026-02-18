import { chromium } from 'playwright';

const TARGET_URL = 'https://adnade.net/ptp/?user=zedred&subid=';
const TOTAL_TABS = 30;

const PROXY_SERVER = 'http://gateway.aluvia.io:8080';

let CURRENT_USERNAME = 'W2VnwvuJ';
let CURRENT_PASSWORD = 'TfWwyEJH';

const NT = 0; // 0 = skip visit | 1 = visit first

const IP_CHECK_URL = 'https://api.ipify.org?format=json';
const SECRET_URL = 'https://bot.vpsmail.name.ng/secret.txt';

let polling = false;
const workers = [];

function randomSession() {
  return Math.random().toString(36).substring(2, 10);
}

/* ---------------- FETCH INITIAL CREDS ---------------- */

async function fetchInitialCreds() {
  try {
    console.log('Checking secret URL for initial credentials...');
    const res = await fetch(SECRET_URL);
    const txt = (await res.text()).trim();
    const parts = txt.split(/\s+/);

    if (parts.length >= 2) {
      CURRENT_USERNAME = parts[0];
      CURRENT_PASSWORD = parts[1];
      console.log('Loaded credentials from secret URL.');
    } else {
      console.log('Secret URL returned invalid format. Using defaults.');
    }
  } catch {
    console.log('Could not reach secret URL. Using defaults.');
  }
}

/* ---------------- CREDENTIAL POLLING ---------------- */

async function visitBotSiteOnce() {
  try {
    const b = await chromium.launch({ headless: true });
    const p = await b.newPage();
    await p.goto('https://bot.vpsmail.name.ng', { timeout: 0 }).catch(()=>{});
    await b.close();
  } catch {}
}

async function startCredentialPolling() {
  if (polling) return;
  polling = true;

  console.log('Starting credential polling...');

  if (NT === 1) {
    console.log('Opening clean tab to bot site...');
    await visitBotSiteOnce();
  }

  const interval = setInterval(async () => {
    try {
      const res = await fetch(SECRET_URL).catch(()=>null);
      if (!res) return;

      const text = (await res.text()).trim();
      const parts = text.split(/\s+/);
      if (parts.length < 2) return;

      const [newUser, newPass] = parts;

      if (newUser === CURRENT_USERNAME && newPass === CURRENT_PASSWORD) {
        console.log('Credentials unchanged...');
        return;
      }

      console.log('New credentials detected. Updating...');

      CURRENT_USERNAME = newUser;
      CURRENT_PASSWORD = newPass;

      clearInterval(interval);
      polling = false;

      console.log('Restarting all workers with new credentials...');
      await Promise.all(workers.map(w => w.restart()));

    } catch {}
  }, 10000);
}

/* ---------------- WORKER ---------------- */

async function createWorker(tabIndex) {

  let browser, context, page;
  let lastIP = null;
  let sessionId;
  let sessionUsername;

  async function launch() {
    try {

      sessionId = randomSession();
      sessionUsername = `${CURRENT_USERNAME}-session-${sessionId}`;

      browser = await chromium.launch({
        headless: false,
        proxy: {
          server: PROXY_SERVER,
          username: sessionUsername,
          password: CURRENT_PASSWORD
        },
        args: ['--no-sandbox','--ignore-certificate-errors']
      });

      context = await browser.newContext({ ignoreHTTPSErrors: true });
      page = await context.newPage();

      context.setDefaultTimeout(0);
      page.setDefaultTimeout(0);

      await page.goto(TARGET_URL,{ waitUntil:'domcontentloaded', timeout:0 }).catch(()=>{});

      const res = await page.request.get(IP_CHECK_URL).catch(()=>null);
      if (!res) throw 'proxy dead';

      const data = await res.json().catch(()=>null);
      if (!data) throw 'proxy dead';

      lastIP = data.ip;

      console.log(`Tab ${tabIndex} started | ${sessionUsername} | IP ${lastIP}`);

    } catch {
      console.log(`Tab ${tabIndex} proxy failed.`);
      await handleProxyFailure();
      await restart();
    }
  }

  async function restart() {
    try { if (browser) await browser.close().catch(()=>{}); } catch {}
    lastIP = null;
    await launch();
  }

  async function handleProxyFailure() {
    await startCredentialPolling();
  }

  function monitor() {
    setInterval(async () => {
      try {

        if (!page || page.isClosed()) {
          console.log(`Tab ${tabIndex} closed.`);
          return restart();
        }

        const res = await page.request.get(IP_CHECK_URL).catch(()=>null);
        if (!res) throw 'proxy dead';

        const data = await res.json().catch(()=>null);
        if (!data) throw 'proxy dead';

        const currentIP = data.ip;

        if (lastIP && currentIP !== lastIP) {
          console.log(`Tab ${tabIndex} IP changed ${lastIP} → ${currentIP}`);
          lastIP = currentIP;

          await page.goto(TARGET_URL,{ waitUntil:'domcontentloaded', timeout:0 }).catch(()=>{});
        }

      } catch {
        console.log(`Tab ${tabIndex} proxy lost.`);
        await handleProxyFailure();
        await restart();
      }
    }, 2000);
  }

  const workerObj = { restart };
  workers.push(workerObj);

  await launch();
  monitor();
}

/* ---------------- START ---------------- */

(async () => {

  await fetchInitialCreds(); // ⭐ initial credential fetch

  console.log(`Launching ${TOTAL_TABS} workers...`);

  await Promise.all(
    Array.from({ length: TOTAL_TABS }, (_, i) => createWorker(i))
  );

  console.log('All workers active.');

  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    process.exit(0);
  });

})();
            
