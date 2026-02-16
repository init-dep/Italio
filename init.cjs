const { chromium } = require('playwright');

// Proxy configuration
const proxyConfig = {
  server: 'http://gateway.aluvia.io:8080',
  username: 'rcCzEa6G',
  password: 'J7wTgZQ7'
};

// Target URL
const TARGET_URL = 'https://fayu.vpsmail.name.ng/';

// HTML iframe to detect
const TARGET_IFRAME = '<iframe id="ADBits.online" src="https://adbits.online/bits-ads.php?type=1&&ids=594" scrolling="no" style="width:728px; height:90px; border:0px; padding:0; overflow:hidden" allowtransparency="true"></iframe>';

async function createTabWithProxy(browser, index) {
  try {
    // Create a new context with proxy for each tab
    const context = await browser.newContext({
      proxy: proxyConfig
    });
    
    const page = await context.newPage();
    
    // Navigate to the target URL
    console.log(`Tab ${index}: Opening page...`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
    
    return { page, context, index };
  } catch (error) {
    console.error(`Tab ${index}: Error creating tab - ${error.message}`);
    throw error;
  }
}

async function monitorAndReload(tabInfo) {
  const { page, context, index } = tabInfo;
  
  while (true) {
    try {
      // Wait for the specific iframe to be present
      console.log(`Tab ${index}: Waiting for iframe...`);
      
      await page.waitForFunction(
        (targetIframe) => {
          // Check if the iframe exists in the page
          const iframe = document.querySelector('iframe#ADBits.online');
          if (!iframe) return false;
          
          // Check if the iframe has the correct src and attributes
          return iframe.outerHTML.includes(targetIframe);
        },
        TARGET_IFRAME,
        { timeout: 30000 }
      );
      
      console.log(`Tab ${index}: Iframe detected!`);
      
      // Optional: Add a small delay to ensure request was sent
      await page.waitForTimeout(2000);
      
      // Reload the page
      console.log(`Tab ${index}: Reloading page...`);
      await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
      
    } catch (error) {
      console.error(`Tab ${index}: Error during monitoring - ${error.message}`);
      
      // Try to recover by reloading the page
      try {
        console.log(`Tab ${index}: Attempting to recover by reloading...`);
        await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
      } catch (reloadError) {
        console.error(`Tab ${index}: Failed to recover - ${reloadError.message}`);
        break;
      }
    }
  }
}

async function main() {
  console.log('Starting browser in headless mode with proxy...');
  
  // Launch browser with proxy for the browser itself - HEADLESS MODE ENABLED
  const browser = await chromium.launch({
    proxy: proxyConfig,
    headless: true // Changed to true for headless mode
  });
  
  try {
    // Create 30 tabs
    console.log('Creating 30 tabs...');
    const tabPromises = [];
    
    for (let i = 1; i <= 30; i++) {
      tabPromises.push(createTabWithProxy(browser, i));
      
      // Small delay between creating tabs to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const tabs = await Promise.all(tabPromises);
    console.log('All 30 tabs created successfully!');
    
    // Wait a bit for all pages to fully load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Start monitoring and reloading for each tab
    console.log('Starting monitoring and reloading for all tabs...');
    const monitorPromises = tabs.map(tab => monitorAndReload(tab));
    
    // Wait for all monitoring processes (they run indefinitely)
    await Promise.all(monitorPromises);
    
  } catch (error) {
    console.error('Main process error:', error);
  } finally {
    // This will only execute if all monitors somehow complete
    await browser.close();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT. Closing browser...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM. Closing browser...');
  process.exit(0);
});

// Run the main function
main().catch(console.error);
