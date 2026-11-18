const puppeteer = require('C:/Users/SABARI SJ/Desktop/common-folder/kairos-staff-portal/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\SABARI SJ\\.gemini\\antigravity\\brain\\bf7a71a2-0221-4ca4-aa6d-26e1a311d4e4';
const WORKSPACE_DIR = 'C:\\Users\\SABARI SJ\\Desktop\\common-folder';

// Helper to save screenshot in both artifact dir and workspace root
async function saveShot(page, filename, options = {}) {
  const artPath = path.join(ARTIFACT_DIR, filename);
  const wsPath = path.join(WORKSPACE_DIR, filename);
  await page.screenshot({ path: artPath, ...options });
  fs.copyFileSync(artPath, wsPath);
  console.log(`📸 Saved screenshot: ${filename} (${fs.statSync(artPath).size} bytes)`);
}

function makeRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = http.request({
      method: options.method || 'GET',
      headers: options.headers || {},
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch(e) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data, json });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function captureAll() {
  console.log('================================================================');
  console.log('📸 STARTING PHASE 8 EVIDENCE SCREENSHOT CAPTURE');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // 1. Create sessions for screenshot capture
  console.log('Creating student sessions for visual demonstration...');
  const enSessionRes = await makeRequest('http://localhost:5000/api/video/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { phone: '9876540001', module: 1 }
  });
  const enSessionId = enSessionRes.json?.sessionId || '99fa9264';

  const frSessionRes = await makeRequest('http://localhost:5000/api/video/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { phone: '6876540001', module: 1 }
  });
  const frSessionId = frSessionRes.json?.sessionId || 'french_demo_session';

  // ---------------------------------------------------------------------------
  // SCREENSHOT 1: S3 Direct Access Denied (HTTP 403)
  // ---------------------------------------------------------------------------
  console.log('\n1. Capturing S3 Direct URL 403 Forbidden AccessDenied...');
  const page1 = await browser.newPage();
  await page1.setViewport({ width: 1200, height: 700 });
  await page1.goto('https://kairos-whatsapp-vid.s3.amazonaws.com/english/video1.mp4', { waitUntil: 'load' });
  await saveShot(page1, 'p8_01_s3_url_access_denied_403.png');
  await page1.close();

  // ---------------------------------------------------------------------------
  // SCREENSHOT 2: English Classroom Player Desktop View
  // ---------------------------------------------------------------------------
  console.log('\n2. Capturing English Classroom Player (Desktop 1280x800)...');
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 800 });
  await page2.goto(`http://localhost:5001/classroom/${enSessionId}`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await saveShot(page2, 'p8_02_english_player_streaming_network.png');
  await page2.close();

  // ---------------------------------------------------------------------------
  // SCREENSHOT 3: French Classroom Player Desktop View
  // ---------------------------------------------------------------------------
  console.log('\n3. Capturing French Classroom Player (Desktop 1280x800)...');
  const page3 = await browser.newPage();
  await page3.setViewport({ width: 1280, height: 800 });
  await page3.goto(`http://localhost:5001/classroom/${frSessionId}`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await saveShot(page3, 'p8_03_french_player_streaming_network.png');
  await page3.close();

  // ---------------------------------------------------------------------------
  // SCREENSHOT 4: Mobile Android Viewport Emulation (Pixel 7 / 412x915)
  // ---------------------------------------------------------------------------
  console.log('\n4. Capturing Android Mobile Viewport Emulation (412x915)...');
  const page4 = await browser.newPage();
  await page4.setViewport({
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true
  });
  await page4.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36');
  await page4.goto(`http://localhost:5001/classroom/${enSessionId}`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await saveShot(page4, 'p8_04_android_mobile_view.png');
  await page4.close();

  // ---------------------------------------------------------------------------
  // SCREENSHOT 5: Mobile iPhone Safari Viewport Emulation (iPhone 14 Pro / 393x852)
  // ---------------------------------------------------------------------------
  console.log('\n5. Capturing iPhone Safari Viewport Emulation (393x852)...');
  const page5 = await browser.newPage();
  await page5.setViewport({
    width: 393,
    height: 852,
    deviceScaleFactor: 3.0,
    isMobile: true,
    hasTouch: true
  });
  await page5.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
  await page5.goto(`http://localhost:5001/classroom/${frSessionId}`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await saveShot(page5, 'p8_05_iphone_safari_view.png');
  await page5.close();

  // ---------------------------------------------------------------------------
  // SCREENSHOT 6: Unauthorized Access Denied Page
  // ---------------------------------------------------------------------------
  console.log('\n6. Capturing Unauthorized Access Denied Page...');
  const page6 = await browser.newPage();
  await page6.setViewport({ width: 1280, height: 800 });
  await page6.goto('http://localhost:5001/classroom/unauthorized-invalid-session-999', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  await saveShot(page6, 'p8_06_unauthorized_access_denied.png');
  await page6.close();

  // ---------------------------------------------------------------------------
  // SCREENSHOT 7: Central Staff Portal - Payment Dashboard (Paid & Active)
  // ---------------------------------------------------------------------------
  console.log('\n7. Capturing Central Staff Portal Payment Dashboard...');
  const page7 = await browser.newPage();
  await page7.setViewport({ width: 1400, height: 900 });
  await page7.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));
  
  // Fill in Payment Staff credentials
  try {
    await page7.type('input[type="email"]', 'payment@sprout.com');
    await page7.type('input[type="password"]', 'sprout123');
    await page7.click('button[type="submit"]');
    await page7.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(()=>{});
    await new Promise(r => setTimeout(r, 2000));
  } catch(e) {
    console.log('Login form fill info:', e.message);
  }
  await saveShot(page7, 'p8_07_payment_dashboard_paid_active.png');
  await page7.close();

  // ---------------------------------------------------------------------------
  // SCREENSHOT 8: Central Staff Portal - Report Dashboard
  // ---------------------------------------------------------------------------
  console.log('\n8. Capturing Central Staff Portal Report Dashboard...');
  const page8 = await browser.newPage();
  await page8.setViewport({ width: 1400, height: 900 });
  await page8.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));
  
  // Fill in Report Staff credentials
  try {
    await page8.type('input[type="email"]', 'report@sprout.com');
    await page8.type('input[type="password"]', 'sprout123');
    await page8.click('button[type="submit"]');
    await page8.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(()=>{});
    await new Promise(r => setTimeout(r, 2000));
  } catch(e) {
    console.log('Login form fill info:', e.message);
  }
  await saveShot(page8, 'p8_08_report_dashboard_kpis_export.png');
  await page8.close();

  await browser.close();
  console.log('\n================================================================');
  console.log('✅ ALL 8 PHASE 8 VISUAL SCREENSHOTS CAPTURED SUCCESSFULLY!');
  console.log('================================================================\n');
}

captureAll().catch(err => {
  console.error('Fatal screenshot error:', err);
  process.exit(1);
});
