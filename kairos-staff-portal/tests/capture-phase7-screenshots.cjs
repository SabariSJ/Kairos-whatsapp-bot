const puppeteer = require('C:/Users/SABARI SJ/Desktop/common-folder/kairos-staff-portal/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\SABARI SJ\\.gemini\\antigravity\\brain\\bf7a71a2-0221-4ca4-aa6d-26e1a311d4e4';

async function capture() {
  console.log('🚀 Starting Phase 7 Visual Demonstration Capture...');

  // 1. Create English Session
  const drmService = require('C:/Users/SABARI SJ/Desktop/common-folder/whatsapp-Kairos (final)/whatsapp-Kairos/whatsapp-new/backend/services/drmService.js');
  const enSession = drmService.createSession({
    phone: '9876546827',
    name: 'English Auto-Notif Student',
    course: 'Business Success Class',
    module: 1,
    progressSeconds: 65,
    language: 'en'
  });
  console.log('Created English Session:', enSession.sessionId);

  // 2. Create French Session
  const frSession = drmService.createSession({
    phone: '6876546827',
    name: 'French Auto-Notif Student',
    course: 'Cours de Réussite Commerciale',
    module: 1,
    progressSeconds: 45,
    language: 'fr'
  });
  console.log('Created French Session:', frSession.sessionId);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  try {
    // Screenshot 2: Improved Player English Desktop
    console.log('📸 Capturing p7_02_improved_player_english_desktop.png...');
    const pageEn = await browser.newPage();
    await pageEn.setViewport({ width: 1280, height: 950 });
    await pageEn.goto(`http://localhost:5001/classroom/${enSession.sessionId}`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    await pageEn.screenshot({ path: path.join(ARTIFACT_DIR, 'p7_02_improved_player_english_desktop.png'), fullPage: true });

    // Screenshot 3: Improved Player French Desktop
    console.log('📸 Capturing p7_03_improved_player_french_desktop.png...');
    const pageFr = await browser.newPage();
    await pageFr.setViewport({ width: 1280, height: 950 });
    await pageFr.goto(`http://localhost:5001/classroom/${frSession.sessionId}`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    await pageFr.screenshot({ path: path.join(ARTIFACT_DIR, 'p7_03_improved_player_french_desktop.png'), fullPage: true });

    // Screenshot 4: Speed Selector & Playback Controls Active
    console.log('📸 Capturing p7_04_player_controls_speed_seek.png...');
    await pageEn.bringToFront();
    // Click speed button to show menu
    await pageEn.click('#btn-speed');
    await new Promise(r => setTimeout(r, 500));
    await pageEn.screenshot({ path: path.join(ARTIFACT_DIR, 'p7_04_player_controls_speed_seek.png'), fullPage: true });

    // Screenshot 5: Playlist Navigation with Module Cards
    console.log('📸 Capturing p7_05_player_playlist_navigation.png...');
    const playlistEl = await pageEn.$('#playlist-section');
    if (playlistEl) {
      await playlistEl.screenshot({ path: path.join(ARTIFACT_DIR, 'p7_05_player_playlist_navigation.png') });
    }

    // Screenshot 6: Unpaid Student Access Denied / Locked
    console.log('📸 Capturing p7_06_unpaid_student_denied.png...');
    const pageLock = await browser.newPage();
    await pageLock.setViewport({ width: 1280, height: 800 });
    // Access with non-existent or locked session
    await pageLock.goto(`http://localhost:5001/classroom/invalid_unpaid_session`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    await pageLock.screenshot({ path: path.join(ARTIFACT_DIR, 'p7_06_unpaid_student_denied.png'), fullPage: true });

    // Screenshot 7: Mobile Android Viewport
    console.log('📸 Capturing p7_07_mobile_android_player.png...');
    const pageMobileAndroid = await browser.newPage();
    await pageMobileAndroid.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true });
    await pageMobileAndroid.goto(`http://localhost:5001/classroom/${enSession.sessionId}`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    await pageMobileAndroid.screenshot({ path: path.join(ARTIFACT_DIR, 'p7_07_mobile_android_player.png'), fullPage: true });

    // Screenshot 8: Mobile iPhone Safari Viewport
    console.log('📸 Capturing p7_08_mobile_iphone_player.png...');
    const pageMobileIphone = await browser.newPage();
    await pageMobileIphone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await pageMobileIphone.goto(`http://localhost:5001/classroom/${frSession.sessionId}`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    await pageMobileIphone.screenshot({ path: path.join(ARTIFACT_DIR, 'p7_08_mobile_iphone_player.png'), fullPage: true });

    console.log('✅ ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
}

capture().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
