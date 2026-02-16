import { chromium } from 'playwright';

const PROXY_CONFIG = {
  server: 'http://gateway.aluvia.io:8080',
  username: 'rcCzEa6G',
  password: 'J7wTgZQ7'
};

const TARGET_URL = 'https://playgroundt.vpsmail.name.ng/';
const IFRAME_SELECTOR = 'iframe#s.online[src="https://adbits.online/bits-ads.php?type=1&&ids=594"]';
const CHECK_INTERVAL = 1000; // Check every 2 seconds
const TABS_COUNT = 30;

async function createBrowser() {
  return await chromium.launch({
    headless: true,
    proxy: PROXY_CONFIG
  });
}

async function createTabWithPage(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { page, context };
}

async function waitForIframeAndRequest(page) {
  console.log(`Tab ${page.url()} - Waiting for iframe and request...`);
  
  // Wait for the iframe to appear
  try {
    await page.waitForSelector(IFRAME_SELECTOR, { timeout: 30000 });
    console.log(`Tab ${page.url()} - Iframe found!`);
    
    // Wait for any network request to s.online
    const requestPromise = page.waitForRequest(
      request => request.url().includes('s.online'),
      { timeout: 30000 }
    );
    
    await requestPromise;
    console.log(`Tab ${page.url()} - Request to s.online detected!`);
    return true;
  } catch (error) {
    console.log(`Tab ${page.url()} - Timeout waiting for iframe or request:`, error.message);
    return false;
  }
}

async function reloadTab(page) {
  try {
    await page.reload({ waitUntil: 'networkidle' });
    console.log(`Tab ${page.url()} - Reloaded`);
    return true;
  } catch (error) {
    console.log(`Tab ${page.url()} - Error during reload:`, error.message);
    return false;
  }
}

async function manageTabLifecycle(tabInfo, tabIndex) {
  const { page } = tabInfo;
  
  try {
    // Navigate to the target URL
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
    console.log(`Tab ${tabIndex} - Initial load complete`);
    
    while (true) {
      // Wait for iframe and request
      const success = await waitForIframeAndRequest(page);
      
      if (success) {
        console.log(`Tab ${tabIndex} - Conditions met, reloading...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause before reload
        await reloadTab(page);
      } else {
        console.log(`Tab ${tabIndex} - Conditions not met, checking again in ${CHECK_INTERVAL/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
      }
    }
  } catch (error) {
    console.log(`Tab ${tabIndex} - Fatal error:`, error.message);
    // Attempt to recover by reloading
    try {
      await reloadTab(page);
    } catch (reloadError) {
      console.log(`Tab ${tabIndex} - Could not recover:`, reloadError.message);
    }
  }
}

async function main() {
  console.log('Starting browser with proxy...');
  const browser = await createBrowser();
  
  try {
    console.log(`Creating ${TABS_COUNT} tabs...`);
    const tabs = [];
    
    // Create all tabs
    for (let i = 0; i < TABS_COUNT; i++) {
      const tabInfo = await createTabWithPage(browser);
      tabs.push(tabInfo);
      console.log(`Tab ${i} created`);
      
      // Small delay between tab creation to avoid overwhelming
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('All tabs created, starting monitoring...');
    
    // Start monitoring each tab
    const tabPromises = tabs.map((tabInfo, index) => 
      manageTabLifecycle(tabInfo, index)
    );
    
    // Wait for all tabs to complete (they shouldn't complete normally)
    await Promise.all(tabPromises);
    
  } catch (error) {
    console.error('Main process error:', error);
  } finally {
    // This will only execute if all tabs somehow complete
    await browser.close();
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('Received SIGINT, closing browser...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, closing browser...');
  process.exit(0);
});

// Start the application
console.log('Starting Playwright tab reloader...');
main().catch(console.error);
