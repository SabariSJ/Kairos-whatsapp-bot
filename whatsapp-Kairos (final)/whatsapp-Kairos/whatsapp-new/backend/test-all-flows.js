const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const assert = require("assert");
const googleSheetService = require("./services/googleSheetService");
const drmService = require("./services/drmService");
const chatbotService = require("./services/chatbotService");
const { isDuplicateMessage } = require("./utils/conversationState");
const fs = require("fs");

console.log("==================================================");
console.log("🧪 RUNNING COMPREHENSIVE TEST SUITE FOR KAIROS BOT");
console.log("==================================================");

let testsPassed = 0;
let testsTotal = 0;

function runTest(name, fn) {
  testsTotal++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
  }
}

async function runAsyncTest(name, fn) {
  testsTotal++;
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
  }
}

async function main() {
  // Test 1: Phone Normalization
  runTest("Phone Normalization to last 10 digits", () => {
    assert.strictEqual(googleSheetService.normalizePhone("+91 96295-31891"), "9629531891");
    assert.strictEqual(googleSheetService.normalizePhone("09629531891"), "9629531891");
    assert.strictEqual(googleSheetService.normalizePhone("9629531891"), "9629531891");
    assert.strictEqual(googleSheetService.normalizePhone("12345"), "12345");
  });

  // Test 2: Duplicate message filtering
  runTest("Duplicate Message ID Deduplication Cache", () => {
    const testMsgId = "wamid.TEST_DEDUP_" + Date.now();
    assert.strictEqual(isDuplicateMessage(testMsgId), false, "First time should not be duplicate");
    assert.strictEqual(isDuplicateMessage(testMsgId), true, "Second time MUST be flagged as duplicate");
  });

  // Test 3: Google Sheets CRM Sync & Student Retrieval
  await runAsyncTest("Google Sheets CRM: Retrieve student record", async () => {
    // Senthil is registered in Google Sheet with payment status yes
    const student = await googleSheetService.getStudent("9500070756");
    assert(student !== null, "Student Senthil should be found in Google Sheet");
    assert.strictEqual(student.paymentStatus, "yes", "Payment status should be yes");
    assert.strictEqual(student.phone, "9500070756");
  });

  // Test 3B: Unregistered student (1112223334) is NOT in Google Sheet
  await runAsyncTest("Google Sheets CRM: Unregistered phone (1112223334) returns null", async () => {
    const student = await googleSheetService.getStudent("1112223334");
    assert.strictEqual(student, null, "1112223334 must return null because it is not in the sheet");
  });

  // Test 4: Scenario A - Unregistered User Flow (English & Français matching Screenshots 1-4)
  await runAsyncTest("Scenario A: Unregistered student completes 4-step English Onboarding", async () => {
    const unregPhone = "9998887776"; // Not in DB
    const { resetConversationState } = require("./utils/conversationState");
    resetConversationState(unregPhone);

    // Step 1: Greeting
    const step1 = await chatbotService.processMessage(unregPhone, "Hi");
    assert(Array.isArray(step1), "Step 1 should be an array");
    assert.strictEqual(step1.length, 2, "Step 1 should have text greeting + language buttons");
    assert(step1[0].text.includes("Welcome to Kairos\nBienvenue sur Kairos"), "Step 1 must have bilingual greeting");
    assert(step1[1].body.includes("Pick your language\nChoisissez votre langue"), "Step 1 must prompt language");
    const langBtns = step1[1].buttons.map(b => b.id);
    assert(langBtns.includes("lang_en") && langBtns.includes("lang_fr"), "Must have English & Français buttons");

    // Step 2: Language Selection (English)
    const step2 = await chatbotService.processMessage(unregPhone, "English", "lang_en");
    assert(step2.length >= 2, "Step 2 should have poster and intro invite");
    const posterMsg = step2.find(m => m.type === "image");
    assert(posterMsg && posterMsg.url.includes("programme_poster_english.jpg"), "Must send English poster");
    const introBtn = step2.find(m => m.type === "button");
    assert(introBtn.body.includes("Take the introductory course for free"), "Must offer free intro course");
    assert(introBtn.buttons[0].title === "I accept", "Button must be 'I accept'");

    // Step 3: Accept Free Intro Course
    const step3 = await chatbotService.processMessage(unregPhone, "I accept", "accept_intro");
    const videoMsg = step3.find(m => m.type === "video");
    assert(videoMsg && videoMsg.url.includes("kairos_english.mp4"), "Must send English intro video");
    assert.strictEqual(videoMsg.caption, "Start for free", "Video caption must be 'Start for free'");
    const regPromptBtn = step3.find(m => m.type === "button");
    assert(regPromptBtn.body.includes("Would you like to register for our course?"), "Must prompt for course registration");
    assert(regPromptBtn.buttons[0].title === "I accept", "Button must be 'I accept'");

    // Step 4: Accept Course Registration
    const step4 = await chatbotService.processMessage(unregPhone, "I accept", "accept_register");
    const formMsg = step4.find(m => m.type === "button");
    assert(formMsg.body.includes("https://english-form.web.app"), "Must contain English registration link");
    assert(formMsg.buttons[0].title === "Submitted ✅", "Button must be 'Submitted ✅'");

    // Step 5: Submitted Check (Not yet in sheet)
    const step5 = await chatbotService.processMessage(unregPhone, "Submitted ✅", "reg_submitted");
    assert(step5[0].text.includes("Checking Registration"), "Must state registration is being checked");
  });

  await runAsyncTest("Scenario A: Unregistered student completes 4-step Français Onboarding", async () => {
    const unregPhoneFr = "9998887777"; // Not in DB
    const { resetConversationState } = require("./utils/conversationState");
    resetConversationState(unregPhoneFr);

    // Step 1: Greeting
    const step1 = await chatbotService.processMessage(unregPhoneFr, "Bonjour");
    assert(step1[0].text.includes("Bienvenue sur Kairos"));

    // Step 2: Language Selection (Français)
    const step2 = await chatbotService.processMessage(unregPhoneFr, "Français", "lang_fr");
    const posterMsg = step2.find(m => m.type === "image");
    assert(posterMsg && posterMsg.url.includes("programme_poster.jpg"), "Must send French poster");
    const introBtn = step2.find(m => m.type === "button");
    assert(introBtn.body.includes("cours d'introduction gratuitement") || introBtn.body.includes("gratuitement le cours d'introduction"), "Must offer free intro course in French");
    assert(introBtn.buttons[0].title === "J'accepte", "Button must be 'J'accepte'");

    // Step 3: Accept Free Intro Course in French
    const step3 = await chatbotService.processMessage(unregPhoneFr, "J'accepte", "accept_intro");
    const videoMsg = step3.find(m => m.type === "video");
    assert(videoMsg && videoMsg.url.includes("french.mp4"), "Must send French intro video");
    assert(videoMsg.caption.toLowerCase().includes("gratuitement"), "Video caption must be in French");
    const regPromptBtn = step3.find(m => m.type === "button");
    assert(regPromptBtn.body.includes("Souhaitez-vous vous inscrire à notre cours ?"), "Must prompt for course registration in French");
    assert(regPromptBtn.buttons[0].title === "J'accepte", "Button must be 'J'accepte'");

    // Step 4: Accept Course Registration in French
    const step4 = await chatbotService.processMessage(unregPhoneFr, "J'accepte", "accept_register");
    const formMsg = step4.find(m => m.type === "button");
    assert(formMsg.body.includes("https://reg-feandsme-sprout.web.app/registration"), "Must contain French registration link");
    assert(formMsg.buttons[0].title === "Soumis ✅", "Button must be 'Soumis ✅'");

    // Step 5: Submitted Check in French (Not yet in sheet)
    const step5 = await chatbotService.processMessage(unregPhoneFr, "Soumis ✅", "reg_submitted");
    assert(step5[0].text.includes("Vérification de l'inscription"), "Must state registration is being checked in French");
  });

  // Test 5: Scenario B - Registered but Unpaid Student Flow
  await runAsyncTest("Scenario B: Registered unpaid student access is locked", async () => {
    const originalGetStudent = googleSheetService.getStudent.bind(googleSheetService);
    googleSheetService.getStudent = async (phone) => ({
      name: "Rahul Verma",
      phone: phone,
      course: "Business Success Class",
      paymentStatus: "no",
      currentModule: 1,
      progressSeconds: 0,
      completedModules: []
    });

    try {
      const replies = await chatbotService.processMessage("9876543210", "Hello");
      assert(Array.isArray(replies), "Replies should be an array");
      const lockText = replies.find(r => r.type === "text");
      assert(lockText.text.includes("Please do payment to continue courses"), "Must request payment");

      const btnMsg = replies.find(r => r.type === "button");
      assert(btnMsg !== undefined, "Must include action buttons");
      const buttonIds = btnMsg.buttons.map(b => b.id);
      assert(buttonIds.includes("do_payment"), "Must have 'Do Payment' button");
      assert(buttonIds.includes("contact_support"), "Must have 'Contact Support' button");
      assert(buttonIds.includes("course_details"), "Must have 'Course Details' button");
    } finally {
      googleSheetService.getStudent = originalGetStudent;
    }
  });

  // Test 6: Scenario C - Paid Student Flow with Welcome Image & Class Options
  await runAsyncTest("Scenario C: Paid student receives welcome poster & class options", async () => {
    const originalGetStudent = googleSheetService.getStudent.bind(googleSheetService);
    googleSheetService.getStudent = async (phone) => ({
      name: "Senthil",
      phone: phone,
      course: "Business Success",
      paymentStatus: "yes",
      language: "english",
      languageCode: "en",
      currentModule: 6,
      progressSeconds: 0,
      completedModules: [1, 2, 3, 4, 5]
    });

    try {
      const paidPhone = "9500070756"; // Registered in Google Sheet with payment status yes

      const replies = await chatbotService.processMessage(paidPhone, "Hi");

      assert(Array.isArray(replies), "Replies should be an array");
      const btnMsg = replies.find(r => r.type === "button");
      assert(btnMsg !== undefined, "Must provide interactive action buttons");
      assert(btnMsg.header && btnMsg.header.image && btnMsg.header.image.link.includes("class_img_english.jpeg"), "Must include English class image in header");
      assert(btnMsg.body.includes("Hello Senthil"), "Must greet student by name");
      assert(btnMsg.body.includes("Favourite Teacher"), "Must include friendly teacher greeting");
      assert(btnMsg.body.includes("Business Success"), "Must include course name");

      const buttonIds = btnMsg.buttons.map(b => b.id);
      assert(buttonIds.includes("start_class"), "Must have 'Start Class' button");
      assert(buttonIds.includes("start_fresh"), "Must have 'Start from 00:00' button");
      assert(buttonIds.includes("course_details"), "Must have 'Course Details' button");
    } finally {
      googleSheetService.getStudent = originalGetStudent;
    }
  });

  // Test 7: Paid student taps [▶️ Start Class] -> Generates single-use DRM session link
  await runAsyncTest("Scenario C: [▶️ Start Class] generates single-use classroom link", async () => {
    const originalGetStudent = googleSheetService.getStudent.bind(googleSheetService);
    googleSheetService.getStudent = async (phone) => ({
      name: "Senthil",
      phone: phone,
      course: "Business Success",
      paymentStatus: "yes",
      language: "english",
      languageCode: "en",
      currentModule: 6,
      progressSeconds: 0,
      completedModules: [1, 2, 3, 4, 5]
    });

    try {
      const paidPhone = "9500070756";
      const replies = await chatbotService.processMessage(paidPhone, "", "start_class");

      assert(Array.isArray(replies), "Replies should be an array");
      const ctaMsg = replies.find(r => r.type === "cta_url");
      assert(ctaMsg !== undefined, "Must generate CTA URL button message");
      assert(ctaMsg.url.includes("/classroom/"), "URL must point to /classroom/:sessionId");
      assert(ctaMsg.buttonText.includes("Open Module"), "Button text must match 'Open Module'");
      assert(ctaMsg.body.includes("classroom is ready"), "Body must confirm classroom is ready");
    } finally {
      googleSheetService.getStudent = originalGetStudent;
    }
  });

  // Test 8: DRM HMAC-SHA256 Token Binding & Verification
  runTest("DRM Cryptographic Token Creation & Verification", () => {
    const session = drmService.createSession({
      phone: "9629531891",
      name: "Sabari SJ",
      module: 1,
      progressSeconds: 40
    });

    assert(session.sessionId.length === 8, "Session ID must be 8 alphanumeric chars");
    assert(typeof session.token === "string" && session.token.includes("."), "Token must be HMAC signed");

    const verified = drmService.verifyToken(session.token);
    assert(verified !== null, "Token must verify successfully");
    assert.strictEqual(verified.sessionId, session.sessionId);
    assert.strictEqual(verified.phone, "9629531891");
    assert.strictEqual(verified.module, 1);
  });

  // Test 9: DRM Anti-Sharing Device Lock (Blocks second device with 403 Forbidden)
  runTest("DRM Anti-Sharing Device Lock blocks unauthorized device (403)", () => {
    const session = drmService.createSession({
      phone: "9629531891",
      name: "Sabari SJ",
      module: 2,
      progressSeconds: 0
    });

    const studentDeviceSig = "student_chrome_desktop_sig_abc123";
    const unauthorizedDeviceSig = "friend_iphone_mobile_sig_xyz999";

    // 1st open on Student's Device -> SUCCESS (Locked)
    const lock1 = drmService.lockDevice(session.sessionId, studentDeviceSig);
    assert.strictEqual(lock1.success, true);
    assert.strictEqual(lock1.status, 200);

    // 2nd open on same Student's Device -> SUCCESS
    const lock2 = drmService.lockDevice(session.sessionId, studentDeviceSig);
    assert.strictEqual(lock2.success, true);

    // Opened on Friend's Unauthorized Device -> BLOCKED (403 Forbidden)
    const lock3 = drmService.lockDevice(session.sessionId, unauthorizedDeviceSig);
    assert.strictEqual(lock3.success, false);
    assert.strictEqual(lock3.status, 403);
    assert(lock3.message.includes("Unauthorized Device Detected"), "Must display unauthorized device warning");
  });

  // Test 10: Video File Availability (video1.mp4 to video6.mp4)
  runTest("DRM English Video Modules (video1.mp4 to video6.mp4) existence", () => {
    const mediaDir = path.join(__dirname, "public", "media");
    for (let m = 1; m <= 6; m++) {
      const vidPath = path.join(mediaDir, `video${m}.mp4`);
      assert(fs.existsSync(vidPath), `Module video file video${m}.mp4 must exist`);
    }
  });

  // Test 11: French Video File Availability (french_video1.mp4 to french_video6.mp4)
  runTest("DRM Français Video Modules (french_video1.mp4 to french_video6.mp4) existence", () => {
    const mediaDir = path.join(__dirname, "public", "media");
    for (let m = 1; m <= 6; m++) {
      const vidPath = path.join(mediaDir, `french_video${m}.mp4`);
      assert(fs.existsSync(vidPath), `Français module video file french_video${m}.mp4 must exist`);
    }
  });

  // Test 12: Scenario C - French Paid Student with Language 'F' (Matches Screenshot of Sheet)
  await runAsyncTest("Scenario C: French Paid student with 'F' receives 100% French class flow", async () => {
    const originalGetStudent = googleSheetService.getStudent.bind(googleSheetService);
    googleSheetService.getStudent = async (phone) => ({
      name: "manju",
      phone: phone,
      course: "business sucess",
      paymentStatus: "yes",
      language: "F", // Exactly as in the user's uploaded Google Sheet image
      languageCode: "fr",
      currentModule: 3,
      progressSeconds: 0,
      completedModules: [1, 2]
    });

    try {
      const replies = await chatbotService.processMessage("9994863024", "Hi");
      assert(Array.isArray(replies), "Replies must be an array");
      const btnMsg = replies.find(r => r.type === "button");
      assert(btnMsg !== undefined, "Must return interactive button message");
      assert(btnMsg.header && btnMsg.header.image && btnMsg.header.image.link.includes("class_img_french.jpeg"), "Must include French class image in header");
      assert(btnMsg.body.includes("Bonjour Manju"), "Must greet student in French (Bonjour Manju)");
      assert(btnMsg.body.includes("Votre enseignant préféré"), "Must use French teacher greeting");
      assert(btnMsg.body.includes("Cours de Réussite Commerciale"), "Must format course name in French");

      const buttonTitles = btnMsg.buttons.map(b => b.title);
      assert(buttonTitles.includes("▶️ Commencer"), "Must have French button '▶️ Commencer'");
      assert(buttonTitles.includes("🔄 Depuis 00:00"), "Must have French button '🔄 Depuis 00:00'");
      assert(buttonTitles.includes("📋 Détails"), "Must have French button '📋 Détails'");

      // Test tapping [▶️ Commencer]
      const startReplies = await chatbotService.processMessage("9994863024", "", "start_class");
      const ctaMsg = startReplies.find(r => r.type === "cta_url");
      assert(ctaMsg !== undefined, "Must return CTA URL for classroom");
      assert(ctaMsg.buttonText.includes("Ouvrir Module 3"), "Button must say '▶️ Ouvrir Module 3'");
      assert(ctaMsg.body.includes("Votre salle de classe"), "Body text must be in French");
    } finally {
      googleSheetService.getStudent = originalGetStudent;
    }
  });

  // Test 13: French Paid student with SME FINANCIAL EMPOWERMENT course receives 100% French course name
  await runAsyncTest("Scenario C: French SME student receives translated French course name & clean header", async () => {
    const originalGetStudent = googleSheetService.getStudent.bind(googleSheetService);
    googleSheetService.getStudent = async (phone) => ({
      name: "Sabari",
      phone: phone,
      course: "SME FINANCIAL EMPOWERMENT & FORMALIZATION PROGRAM",
      paymentStatus: "yes",
      language: "F",
      languageCode: "fr",
      currentModule: 1,
      progressSeconds: 29,
      completedModules: []
    });

    try {
      const replies = await chatbotService.processMessage("9500406150", "Hi");
      assert(Array.isArray(replies), "Replies must be an array");
      const btnMsg = replies.find(r => r.type === "button");
      assert(btnMsg !== undefined, "Must return interactive button message");
      assert(btnMsg.body.includes("Programme d'Autonomisation Financière et de Formalisation des PME"), "Course name in welcome body must be French");
      assert(!btnMsg.body.includes("SME FINANCIAL EMPOWERMENT"), "Course name must NOT be English in French flow");

      // Test tapping [▶️ Commencer] / Start Class CTA URL
      const startReplies = await chatbotService.processMessage("9500406150", "", "start_class");
      const ctaMsg = startReplies.find(r => r.type === "cta_url");
      assert(ctaMsg !== undefined, "Must return CTA URL for classroom");
      assert(ctaMsg.header.includes("Autonomisation des PME"), "Header must be in French and under 60 chars");
      assert(ctaMsg.header.length <= 60, "Header must never exceed WhatsApp 60 character limit");
      assert(!ctaMsg.header.includes("SME FINANCIAL"), "Header must NOT contain English course title");
      assert(ctaMsg.body.includes("Programme d'Autonomisation"), "Body must contain French course name");
      assert(!ctaMsg.body.includes("Cours de SME"), "Body must not have 'Cours de SME'");
      assert(ctaMsg.buttonText.includes("Ouvrir Module 1"), "Button must say '▶️ Ouvrir Module 1'");
    } finally {
      googleSheetService.getStudent = originalGetStudent;
    }
  });

  console.log("==================================================");
  console.log(`📊 TEST RESULTS: ${testsPassed}/${testsTotal} TESTS PASSED`);
  console.log("==================================================");
  if (testsPassed === testsTotal) {
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
  } else {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
