const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runVisualAcceptance() {
  console.log('================================================================');
  console.log('📸 STARTING PHASE 3 LIVE VISUAL ACCEPTANCE & SCREENSHOT RUNNER');
  console.log('================================================================\n');

  let backendProc;
  let frontendProc;
  let browser;

  try {
    // 1. Start Backend on Port 5000
    console.log('🚀 Starting Backend Server on port 5000...');
    backendProc = spawn('node', ['src/server.js'], {
      cwd: path.join(__dirname, '..', '..', 'kairos-backend'),
      stdio: 'pipe',
      shell: true,
    });

    backendProc.stdout.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('Server listening on')) {
        console.log('   [Backend Ready]:', msg.trim().split('\n')[0]);
      }
    });

    // Wait for backend startup
    await delay(3000);

    // 2. Start Frontend Preview on Port 5173
    console.log('🚀 Starting Staff Portal Preview on port 5173...');
    frontendProc = spawn('npx', ['vite', 'preview', '--port', '5173'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      shell: true,
    });

    frontendProc.stdout.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('Local:')) {
        console.log('   [Frontend Ready]:', msg.trim().split('\n')[0]);
      }
    });

    // Wait for frontend preview server
    await delay(3000);

    // 3. Launch Puppeteer with Chrome
    console.log('🌐 Launching Headless Chrome Browser...');
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      defaultViewport: { width: 1366, height: 850 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // --------------------------------------------------------------------------
    // Test Scenario 1: Staff Login View
    // --------------------------------------------------------------------------
    console.log('\n[Screen 1] Loading Staff Login Page...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
    await delay(1000);
    const snap1 = path.join(SCREENSHOT_DIR, '01_login_page.png');
    await page.screenshot({ path: snap1 });
    console.log('   📸 Saved:', snap1);

    // --------------------------------------------------------------------------
    // Test Scenario 2: Payment Staff Login & Payment Dashboard (All Languages)
    // --------------------------------------------------------------------------
    console.log('\n[Screen 2] Logging in as Payment Staff (payment@sprout.com)...');
    await page.type('input[type="email"]', 'payment@sprout.com');
    await page.type('input[type="password"]', 'sprout123');
    await page.click('button[type="submit"]');

    // Wait for navigation to /payments
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    await delay(1500);

    const snap2 = path.join(SCREENSHOT_DIR, '02_payment_dashboard_all.png');
    await page.screenshot({ path: snap2 });
    console.log('   📸 Saved:', snap2);

    // --------------------------------------------------------------------------
    // Test Scenario 3: Language Filter - English Only
    // --------------------------------------------------------------------------
    console.log('\n[Screen 3] Applying English Language Filter...');
    // Click English button
    const buttons = await page.$$('button');
    for (const b of buttons) {
      const text = await (await b.getProperty('innerText')).jsonValue();
      if (text.includes('English')) {
        await b.click();
        break;
      }
    }
    await delay(1500);
    const snap3 = path.join(SCREENSHOT_DIR, '03_payment_dashboard_english.png');
    await page.screenshot({ path: snap3 });
    console.log('   📸 Saved:', snap3);

    // --------------------------------------------------------------------------
    // Test Scenario 4: Language Filter - French Only
    // --------------------------------------------------------------------------
    console.log('\n[Screen 4] Applying Français Language Filter...');
    const buttonsFr = await page.$$('button');
    for (const b of buttonsFr) {
      const text = await (await b.getProperty('innerText')).jsonValue();
      if (text.includes('Français')) {
        await b.click();
        break;
      }
    }
    await delay(1500);
    const snap4 = path.join(SCREENSHOT_DIR, '04_payment_dashboard_french.png');
    await page.screenshot({ path: snap4 });
    console.log('   📸 Saved:', snap4);

    // --------------------------------------------------------------------------
    // Test Scenario 5: WhatsApp Confirmation Modal (Part F)
    // --------------------------------------------------------------------------
    console.log('\n[Screen 5] Testing WhatsApp Confirmation Trigger on Paid Student...');
    // Reset back to All
    const buttonsAll = await page.$$('button');
    for (const b of buttonsAll) {
      const text = await (await b.getProperty('innerText')).jsonValue();
      if (text.includes('All')) {
        await b.click();
        break;
      }
    }
    await delay(1500);

    // Click "Send Confirmation" button
    const sendButtons = await page.$$('button');
    let clickedSend = false;
    for (const b of sendButtons) {
      const text = await (await b.getProperty('innerText')).jsonValue();
      if (text.includes('Send Confirmation')) {
        await b.click();
        clickedSend = true;
        break;
      }
    }

    if (clickedSend) {
      await delay(800);
      const snap5 = path.join(SCREENSHOT_DIR, '05_whatsapp_confirmation_modal.png');
      await page.screenshot({ path: snap5 });
      console.log('   📸 Saved:', snap5);

      // Close modal
      const closeBtn = await page.$('.modal .btn-light');
      if (closeBtn) await closeBtn.click();
      await delay(500);
    }

    // --------------------------------------------------------------------------
    // Test Scenario 6: Role Permission Guard - Payment Staff Access to /reports
    // --------------------------------------------------------------------------
    console.log('\n[Screen 6] Testing Payment Staff Access Blocked to /reports...');
    await page.goto('http://localhost:5173/reports', { waitUntil: 'networkidle0' });
    await delay(1000);
    const snap6 = path.join(SCREENSHOT_DIR, '06_unauthorized_payment_staff.png');
    await page.screenshot({ path: snap6 });
    console.log('   📸 Saved:', snap6);

    // --------------------------------------------------------------------------
    // Test Scenario 7: Report Staff Login & Report Dashboard (All Languages)
    // --------------------------------------------------------------------------
    console.log('\n[Screen 7] Logging in as Report Staff (report@sprout.com)...');
    // Clear storage to log out
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
    await delay(800);

    await page.type('input[type="email"]', 'report@sprout.com');
    await page.type('input[type="password"]', 'sprout123');
    await page.click('button[type="submit"]');

    // Wait for navigation to /reports
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    await delay(2000);

    const snap7 = path.join(SCREENSHOT_DIR, '07_report_dashboard_all.png');
    await page.screenshot({ path: snap7 });
    console.log('   📸 Saved:', snap7);

    // --------------------------------------------------------------------------
    // Test Scenario 8: Report Dashboard - English Language Filter
    // --------------------------------------------------------------------------
    console.log('\n[Screen 8] Applying English Filter on Report Dashboard...');
    const repButtonsEn = await page.$$('button');
    for (const b of repButtonsEn) {
      const text = await (await b.getProperty('innerText')).jsonValue();
      if (text.includes('English')) {
        await b.click();
        break;
      }
    }
    await delay(1500);
    const snap8 = path.join(SCREENSHOT_DIR, '08_report_dashboard_english.png');
    await page.screenshot({ path: snap8 });
    console.log('   📸 Saved:', snap8);

    // --------------------------------------------------------------------------
    // Test Scenario 9: Report Dashboard - Français Language Filter
    // --------------------------------------------------------------------------
    console.log('\n[Screen 9] Applying Français Filter on Report Dashboard...');
    const repButtonsFr = await page.$$('button');
    for (const b of repButtonsFr) {
      const text = await (await b.getProperty('innerText')).jsonValue();
      if (text.includes('Français')) {
        await b.click();
        break;
      }
    }
    await delay(1500);
    const snap9 = path.join(SCREENSHOT_DIR, '09_report_dashboard_french.png');
    await page.screenshot({ path: snap9 });
    console.log('   📸 Saved:', snap9);

    // --------------------------------------------------------------------------
    // Test Scenario 10: Role Permission Guard - Report Staff Access to /payments
    // --------------------------------------------------------------------------
    console.log('\n[Screen 10] Testing Report Staff Access Blocked to /payments...');
    await page.goto('http://localhost:5173/payments', { waitUntil: 'networkidle0' });
    await delay(1000);
    const snap10 = path.join(SCREENSHOT_DIR, '10_unauthorized_report_staff.png');
    await page.screenshot({ path: snap10 });
    console.log('   📸 Saved:', snap10);

    console.log('\n================================================================');
    console.log('🎉 ALL 10 ACCEPTANCE SCREENSHOTS CAPTURED SUCCESSFULLY!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('💥 Visual Acceptance Fatal Error:', err);
  } finally {
    if (browser) await browser.close();
    if (frontendProc) frontendProc.kill();
    if (backendProc) backendProc.kill();
  }
}

runVisualAcceptance();
