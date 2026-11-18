const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots', 'phase4');
const ARTIFACT_DIR = 'C:\\Users\\SABARI SJ\\.gemini\\antigravity\\brain\\bf7a71a2-0221-4ca4-aa6d-26e1a311d4e4';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function capturePhase4Screenshots() {
  console.log('================================================================');
  console.log('📸 STARTING PHASE 4 VISUAL SCREENSHOT RUNNER');
  console.log('================================================================\n');

  let staffProc;
  let enProc;
  let frProc;
  let browser;

  try {
    // 1. Start Staff Portal Preview on Port 5173
    console.log('🚀 Starting Staff Portal Preview on port 5173...');
    staffProc = spawn('npx', ['vite', 'preview', '--port', '5173'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      shell: true,
    });

    // 2. Start English App Preview on Port 5174
    console.log('🚀 Starting English Registration Preview on port 5174...');
    enProc = spawn('npx', ['vite', 'preview', '--port', '5174'], {
      cwd: path.join(__dirname, '..', '..', 'Reg_Sprout_english1', 'Reg_Sprout_english'),
      stdio: 'pipe',
      shell: true,
    });

    // 3. Start French App Preview on Port 5175
    console.log('🚀 Starting French Registration Preview on port 5175...');
    frProc = spawn('npx', ['vite', 'preview', '--port', '5175'], {
      cwd: path.join(__dirname, '..', '..', 'Reg_Sprout_French1', 'Reg_Sprout_French'),
      stdio: 'pipe',
      shell: true,
    });

    await delay(3500);

    // Launch Chrome Headless
    console.log('🌐 Launching Chrome at:', CHROME_PATH);
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1366, height: 850 },
    });

    const page = await browser.newPage();

    // -------------------------------------------------------------
    // Screen 1: English Registration Form
    // -------------------------------------------------------------
    console.log('\n[Screen 1] Loading English Registration Form (http://localhost:5174)...');
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle0' });
    await delay(1000);
    // Fill out form fields
    await page.type('#nameInput', '[PHASE4 TEST] English Student');
    await page.type('#phoneInput', '9876540001');
    await page.type('#emailInput', 'phase4.en.student@sprout.com');
    await page.type('#cityInput', 'Chennai');
    await page.select('#occupationSelect', 'Student');
    await delay(500);

    const s1Path = path.join(SCREENSHOT_DIR, 'p4_01_english_registration_form.png');
    await page.screenshot({ path: s1Path });
    console.log('   📸 Saved:', s1Path);

    // -------------------------------------------------------------
    // Screen 2: French Registration Form
    // -------------------------------------------------------------
    console.log('\n[Screen 2] Loading French Registration Form (http://localhost:5175)...');
    await page.goto('http://localhost:5175', { waitUntil: 'networkidle0' });
    await delay(1000);
    // Fill out French form fields
    await page.type('#nameInput', '[PHASE4 TEST] French Student');
    await page.type('#phoneInput', '6876540001');
    await page.type('#emailInput', 'phase4.fr.student@sprout.com');
    await page.type('#cityInput', 'Paris');
    await page.select('#occupationSelect', 'Étudiant');
    await delay(500);

    const s2Path = path.join(SCREENSHOT_DIR, 'p4_02_french_registration_form.png');
    await page.screenshot({ path: s2Path });
    console.log('   📸 Saved:', s2Path);

    // -------------------------------------------------------------
    // Screen 3: Payment Staff Dashboard (All Filter)
    // -------------------------------------------------------------
    console.log('\n[Screen 3] Logging in to Staff Portal as Payment Staff (payment@sprout.com)...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
    await delay(800);
    await page.type('input[type="email"]', 'payment@sprout.com');
    await page.type('input[type="password"]', 'sprout123');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => delay(2000));
    await delay(1500);

    const s3Path = path.join(SCREENSHOT_DIR, 'p4_03_payment_dashboard_all.png');
    await page.screenshot({ path: s3Path });
    console.log('   📸 Saved:', s3Path);

    // -------------------------------------------------------------
    // Screen 4: Payment Dashboard (English Filter)
    // -------------------------------------------------------------
    console.log('\n[Screen 4] Applying English Filter...');
    const buttons = await page.$$('button');
    for (const b of buttons) {
      const text = await (await b.getProperty('innerText')).jsonValue();
      if (text.includes('English')) {
        await b.click();
        break;
      }
    }
    await delay(1200);

    const s4Path = path.join(SCREENSHOT_DIR, 'p4_04_payment_dashboard_en.png');
    await page.screenshot({ path: s4Path });
    console.log('   📸 Saved:', s4Path);

    // -------------------------------------------------------------
    // Screen 5: Payment Dashboard (French Filter)
    // -------------------------------------------------------------
    console.log('\n[Screen 5] Applying French Filter...');
    const buttonsFr = await page.$$('button');
    for (const b of buttonsFr) {
      const text = await (await b.getProperty('innerText')).jsonValue();
      if (text.includes('Français')) {
        await b.click();
        break;
      }
    }
    await delay(1200);

    const s5Path = path.join(SCREENSHOT_DIR, 'p4_05_payment_dashboard_fr.png');
    await page.screenshot({ path: s5Path });
    console.log('   📸 Saved:', s5Path);

    // -------------------------------------------------------------
    // Screen 6: Report Staff Dashboard (KPIs Updated)
    // -------------------------------------------------------------
    console.log('\n[Screen 6] Clearing session and logging in as Report Staff (report@sprout.com)...');
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
    await delay(800);

    await page.type('input[type="email"]', 'report@sprout.com');
    await page.type('input[type="password"]', 'sprout123');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => delay(2000));
    await delay(1500);

    const s6Path = path.join(SCREENSHOT_DIR, 'p4_06_report_dashboard_kpis.png');
    await page.screenshot({ path: s6Path });
    console.log('   📸 Saved:', s6Path);

    // Copy all to brain artifact directory
    if (fs.existsSync(ARTIFACT_DIR)) {
      const files = fs.readdirSync(SCREENSHOT_DIR);
      for (const f of files) {
        fs.copyFileSync(path.join(SCREENSHOT_DIR, f), path.join(ARTIFACT_DIR, f));
      }
      console.log('\n📁 Copied all Phase 4 screenshots to brain artifact directory!');
    }

    console.log('\n================================================================');
    console.log('🎉 ALL 6 PHASE 4 SCREENSHOTS CAPTURED SUCCESSFULLY!');
    console.log('================================================================');

  } catch (err) {
    console.error('Screenshot capture error:', err);
  } finally {
    if (browser) await browser.close();
    if (staffProc) staffProc.kill();
    if (enProc) enProc.kill();
    if (frProc) frProc.kill();
    process.exit(0);
  }
}

capturePhase4Screenshots();
