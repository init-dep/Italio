import { chromium } from 'playwright';

const TARGET_URL = 'https://adnade.net/ptp/?user=zedred&subid=';
const TOTAL_TABS = 30;

const PROXY_SERVER = 'http://gateway.aluvia.io:8080';

let CURRENT_USERNAME = 'W2VnwvuJ';
let CURRENT_PASSWORD = 'TfWwyEJH';

const NT = 0;

const IP_CHECK_URL = 'https://api.ipify.org?format=json';
const SECRET_URL = 'https://bot.vpsmail.name.ng/secret.txt';

let polling = false;
const workers = [];

function randomSession() {
  return Math.random().toString(36).substring(2, 10);
}

/* ---------------- INITIAL CREDS ---------------- */

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
    }
  } catch {
    console.log('Secret URL unreachable. Using defaults.');
  }
}

/* ---------------- VISIT BOT ---------------- */

async function visitBotSiteOnce() {
  try {
    const b = await chromium.launch({ headless: true });
    const p = await b.newPage();
    await p.goto('https://bot.vpsmail.name.ng',{timeout:0}).catch(()=>{});
    await b.close();
  } catch {}
}

/* ---------------- POLLING ---------------- */

async function startCredentialPolling() {
  if (polling) return;
  polling = true;

  console.log('Starting credential polling...');

  if (NT === 1) await visitBotSiteOnce();

  const interval = setInterval(async () => {
    try {
      const res = await fetch(SECRET_URL).catch(()=>null);
      if (!res) return;

      const text = (await res.text()).trim();
      const parts = text.split(/\s+/);
      if (parts.length < 2) return;

      const [newUser,newPass] = parts;

      if (newUser === CURRENT_USERNAME && newPass === CURRENT_PASSWORD) {
        console.log('Credentials unchanged...');
        return;
      }

      console.log('New credentials detected.');

      CURRENT_USERNAME = newUser;
      CURRENT_PASSWORD = newPass;

      clearInterval(interval);
      polling = false;

      console.log('Restarting workers with new creds...');
      await Promise.all(workers.map(w=>w.restart()));

    } catch {}
  },10000);
}

/* ---------------- NEW: PROXY HEALTH CHECKER ---------------- */

function startProxyHealthCheck() {

  setInterval(async () => {

    try {

      const testBrowser = await chromium.launch({
        headless:true,
        proxy:{
          server:PROXY_SERVER,
          username:`${CURRENT_USERNAME}-health`,
          password:CURRENT_PASSWORD
        }
      });

      const page = await testBrowser.newPage();

      const res = await page.goto(IP_CHECK_URL,{timeout:15000}).catch(()=>null);

      await testBrowser.close().catch(()=>{});

      if (!res) throw "dead proxy";

      console.log("Proxy health OK");

    } catch {

      console.log("Proxy health FAILED → starting polling");
      startCredentialPolling();

    }

  },120000); // 2 minutes
}

/* ---------------- WORKER ---------------- */

async function createWorker(tabIndex){

  let browser,context,page;
  let lastIP=null;
  let sessionId;
  let sessionUsername;

  async function launch(){
    try{

      sessionId=randomSession();
      sessionUsername=`${CURRENT_USERNAME}-session-${sessionId}`;

      browser=await chromium.launch({
        headless:false,
        proxy:{
          server:PROXY_SERVER,
          username:sessionUsername,
          password:CURRENT_PASSWORD
        },
        args:['--no-sandbox','--ignore-certificate-errors']
      });

      context=await browser.newContext({ignoreHTTPSErrors:true});
      page=await context.newPage();

      await page.goto(TARGET_URL,{waitUntil:'domcontentloaded',timeout:0}).catch(()=>{});

      const res=await page.request.get(IP_CHECK_URL).catch(()=>null);
      if(!res) throw "dead";

      const data=await res.json().catch(()=>null);
      if(!data) throw "dead";

      lastIP=data.ip;

      console.log(`Tab ${tabIndex} started | ${sessionUsername} | IP ${lastIP}`);

    }catch{
      console.log(`Tab ${tabIndex} proxy failed.`);
      await startCredentialPolling();
      await restart();
    }
  }

  async function restart(){
    try{ if(browser) await browser.close().catch(()=>{}); }catch{}
    lastIP=null;
    await launch();
  }

  function monitor(){
    setInterval(async()=>{
      try{

        if(!page || page.isClosed()){
          console.log(`Tab ${tabIndex} closed.`);
          return restart();
        }

        const res=await page.request.get(IP_CHECK_URL).catch(()=>null);
        if(!res) throw "dead";

        const data=await res.json().catch(()=>null);
        if(!data) throw "dead";

        const currentIP=data.ip;

        if(lastIP && currentIP!==lastIP){
          console.log(`Tab ${tabIndex} IP changed ${lastIP} → ${currentIP}`);
          lastIP=currentIP;
          await page.goto(TARGET_URL,{waitUntil:'domcontentloaded',timeout:0}).catch(()=>{});
        }

      }catch{
        console.log(`Tab ${tabIndex} proxy lost.`);
        await startCredentialPolling();
        await restart();
      }
    },2000);
  }

  workers.push({restart});

  await launch();
  monitor();
}

/* ---------------- START ---------------- */

(async()=>{

  await fetchInitialCreds();

  startProxyHealthCheck(); // ⭐ independent checker

  console.log(`Launching ${TOTAL_TABS} workers...`);

  await Promise.all(
    Array.from({length:TOTAL_TABS},(_,i)=>createWorker(i))
  );

  console.log('All workers active.');

})();
      
