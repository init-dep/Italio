import { chromium } from 'playwright';

const TARGET_URL = 'https://adnade.net/ptp/?user=zedred&subid=';
const TOTAL_TABS = 30;

const PROXY_SERVER = 'http://gateway.aluvia.io:8080';
const BASE_USERNAME = 'W2VnwvuJ';
const PROXY_PASSWORD = 'TfWwyEJH';

const IP_CHECK_URL = 'https://api.ipify.org?format=json';

function randomSession() {
  return Math.random().toString(36).substring(2, 10);
}

async function createWorker(tabIndex) {

  let browser, context, page;
  let lastIP = null;
  let sessionId = randomSession();
  let sessionUsername = `${BASE_USERNAME}-session-${sessionId}`;

  async function launch() {
    try {
      browser = await chromium.launch({
        headless: false,
        proxy: {
          server: PROXY_SERVER,
          username: sessionUsername,
          password: PROXY_PASSWORD
        },
        args: ['--no-sandbox', '--ignore-certificate-errors']
      });

      context = await browser.newContext({
        ignoreHTTPSErrors: true
      });

      context.setDefaultTimeout(0);
      context.setDefaultNavigationTimeout(0);

      page = await context.newPage();

      page.setDefaultTimeout(0);
      page.setDefaultNavigationTimeout(0);

      await page.goto(TARGET_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 0
      }).catch(() => {});

      const res = await page.request.get(IP_CHECK_URL).catch(() => null);
      if (res) {
        const data = await res.json().catch(() => null);
        if (data) lastIP = data.ip;
      }

      console.log(`Tab ${tabIndex} started | Session ${sessionId} | IP: ${lastIP}`);

    } catch (err) {
      console.log(`Tab ${tabIndex} launch failed. Retrying...`);
      await restart();
    }
  }

  async function restart() {
    try {
      if (browser) await browser.close().catch(() => {});
    } catch {}

    sessionId = randomSession();
    sessionUsername = `${BASE_USERNAME}-session-${sessionId}`;
    lastIP = null;

    await launch();
  }

  async function monitor() {
    setInterval(async () => {
      try {
        if (!page || page.isClosed()) {
          console.log(`Tab ${tabIndex} page closed. Restarting...`);
          return restart();
        }

        const res = await page.request.get(IP_CHECK_URL).catch(() => null);
        if (!res) return;

        const data = await res.json().catch(() => null);
        if (!data) return;

        const currentIP = data.ip;

        if (lastIP && currentIP !== lastIP) {
          console.log(
            `Tab ${tabIndex} IP changed: ${lastIP} → ${currentIP}`
          );

          lastIP = currentIP;

          await page.goto(TARGET_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 0
          }).catch(() => {});
        }

      } catch (err) {
        console.log(`Tab ${tabIndex} crashed. Restarting...`);
        await restart();
      }
    }, 2000); // 🔥 2 second interval
  }

  await launch();
  monitor();
}

// ---- START ALL SIMULTANEOUSLY ----
(async () => {
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
