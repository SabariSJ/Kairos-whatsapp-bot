const readline = require("readline");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const googleSheetService = require("./services/googleSheetService");
const chatbotService = require("./services/chatbotService");
const drmService = require("./services/drmService");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function printBanner() {
  console.clear();
  console.log("==================================================================");
  console.log("🚀 KAIROS WHATSAPP BOT & DRM CLASSROOM INTERACTIVE SIMULATOR");
  console.log("==================================================================");
  console.log("Test every scenario from lead registration to DRM completion:");
  console.log("1. 👤 Scenario A: Test as Unregistered User (Phone not in Google Sheet)");
  console.log("2. 📝 Register New Student (Form Submission -> Google Sheet Sync)");
  console.log("3. 🔒 Scenario B: Test as Registered Unpaid Student (Payment Locked)");
  console.log("4. 💳 Confirm Student Payment (Set Payment Status = 'yes')");
  console.log("5. 🎓 Scenario C: Test as Paid Student (Classroom Resumption & Links)");
  console.log("6. 🛡️ Test Anti-Sharing DRM Device Lock (Device 1 vs Device 2 Block)");
  console.log("7. ⏩ Simulate 100% Video Watch & Auto-Advance to Module 2");
  console.log("8. 💬 Live Interactive Chatbot Session (Type any message/phone)");
  console.log("9. 📋 View All Students in CRM Database");
  console.log("0. ❌ Exit Simulator");
  console.log("==================================================================");
}

function promptMenu() {
  printBanner();
  rl.question("\n👉 Select an option (0-9): ", async (choice) => {
    switch (choice.trim()) {
      case "1":
        await testScenarioA();
        break;
      case "2":
        await testRegisterStudent();
        break;
      case "3":
        await testScenarioB();
        break;
      case "4":
        await testConfirmPayment();
        break;
      case "5":
        await testScenarioC();
        break;
      case "6":
        await testDrmLock();
        break;
      case "7":
        await testAutoAdvance();
        break;
      case "8":
        await testLiveChat();
        return;
      case "9":
        await viewStudents();
        break;
      case "0":
        console.log("\n👋 Exiting simulator. Happy coding!\n");
        rl.close();
        process.exit(0);
        return;
      default:
        console.log("Invalid option.");
    }
    rl.question("\nPress Enter to return to menu...", () => promptMenu());
  });
}

async function testScenarioA() {
  console.log("\n--- [Scenario A: Unregistered User] ---");
  const unregPhone = "9998887776";
  console.log(`📱 Incoming WhatsApp message from unregistered number: +${unregPhone} ("Hi")`);
  const replies = await chatbotService.processMessage(unregPhone, "Hi");
  
  console.log("\n🤖 [Bot Output Sequence]:");
  for (const r of replies) {
    if (r.type === "image") {
      console.log(`🖼️ [IMAGE] ${r.url} (Caption: ${r.caption})`);
    } else if (r.type === "text") {
      console.log(`💬 [TEXT]\n${r.text}`);
    } else if (r.type === "button") {
      console.log(`🔘 [BUTTONS] Header: "${r.header || ''}"`);
      console.log(`   Body: ${r.body}`);
      console.log(`   Options: ${r.buttons.map(b => `[${b.title}]`).join(" ")}`);
    }
  }
}

async function testRegisterStudent() {
  console.log("\n--- [Form Submission: Register Student] ---");
  return new Promise((resolve) => {
    rl.question("Enter student phone (e.g. 9888877777): ", async (phoneInput) => {
      const phone = phoneInput.trim() || "9888877777";
      rl.question("Enter student name (e.g. Marie Claire): ", async (nameInput) => {
        const name = nameInput.trim() || "Marie Claire";
        
        const student = await googleSheetService.updateProgress(phone, {
          name: name,
          course: "Certified Masterclass Course",
          paymentStatus: "no",
          currentModule: 1,
          progressSeconds: 0,
          completedModules: []
        });

        console.log("\n✅ [Google Sheet Synced] New student registered in database:");
        console.log(JSON.stringify(student, null, 2));
        resolve();
      });
    });
  });
}

async function testScenarioB() {
  console.log("\n--- [Scenario B: Registered Unpaid Student] ---");
  const unpaidPhone = "9876543210";
  console.log(`📱 Incoming WhatsApp message from unpaid registered student: +${unpaidPhone} ("Hello")`);
  const replies = await chatbotService.processMessage(unpaidPhone, "Hello");

  console.log("\n🤖 [Bot Output Sequence]:");
  for (const r of replies) {
    if (r.type === "text") {
      console.log(`💬 [TEXT]\n${r.text}`);
    } else if (r.type === "button") {
      console.log(`🔘 [BUTTONS] Header: "${r.header || ''}"`);
      console.log(`   Body: ${r.body}`);
      console.log(`   Options: ${r.buttons.map(b => `[${b.title}]`).join(" ")}`);
    }
  }
}

async function testConfirmPayment() {
  console.log("\n--- [Confirm Student Payment] ---");
  return new Promise((resolve) => {
    rl.question("Enter student phone to mark as paid (default 9876543210): ", async (phoneInput) => {
      const phone = phoneInput.trim() || "9876543210";
      const updated = await googleSheetService.updateProgress(phone, {
        paymentStatus: "yes"
      });
      console.log(`\n✅ Payment confirmed! Student +${phone} is now verified as Paid ('yes').`);
      resolve();
    });
  });
}

async function testScenarioC() {
  console.log("\n--- [Scenario C: Paid Student Access] ---");
  const paidPhone = "9629531891";
  console.log(`📱 Incoming WhatsApp message from paid student: +${paidPhone} ("Hi")`);
  const replies = await chatbotService.processMessage(paidPhone, "Hi");

  console.log("\n🤖 [Bot Output Sequence]:");
  for (const r of replies) {
    if (r.type === "button") {
      console.log(`🔘 [BUTTONS] Header: "${r.header || ''}"`);
      console.log(`   Body:\n${r.body}`);
      console.log(`   Action Buttons: ${r.buttons.map(b => `[${b.title}]`).join(" ")}`);
    }
  }

  console.log("\n👉 Simulating student tapping [▶️ Start Class]...");
  const startClassReplies = await chatbotService.processMessage(paidPhone, "", "start_class");
  for (const r of startClassReplies) {
    if (r.type === "cta_url") {
      console.log(`🔗 [CTA URL BUTTON]`);
      console.log(`   Header: ${r.header}`);
      console.log(`   Body: ${r.body}`);
      console.log(`   Button Label: ${r.buttonText}`);
      console.log(`   Single-Use DRM URL: ${r.url}`);
    }
  }
}

async function testDrmLock() {
  console.log("\n--- [DRM Anti-Sharing Device Lock Simulation] ---");
  const session = drmService.createSession({
    phone: "9629531891",
    name: "Sabari SJ",
    module: 1,
    progressSeconds: 30
  });

  console.log(`1. Generated Single-Use Session ID: ${session.sessionId}`);
  console.log(`2. HMAC-SHA256 Token: ${session.token.slice(0, 36)}...`);

  // Device 1
  const studentSig = "device_fingerprint_student_macbook_pro_001";
  console.log(`\n📱 Step 1: Student opens link on their device: ${studentSig.slice(0, 24)}...`);
  const lock1 = drmService.lockDevice(session.sessionId, studentSig);
  console.log(`   Status: HTTP ${lock1.status} - SUCCESS (Locked to Student's Device)`);

  // Device 2
  const friendSig = "unauthorized_device_fingerprint_friend_phone_999";
  console.log(`\n🚨 Step 2: Student forwards link to friend. Friend opens: ${friendSig.slice(0, 24)}...`);
  const lock2 = drmService.lockDevice(session.sessionId, friendSig);
  console.log(`   Status: HTTP ${lock2.status} - ${lock2.message}`);
}

async function testAutoAdvance() {
  console.log("\n--- [Simulate 100% Video Watch & Auto-Advance] ---");
  const phone = "9629531891";
  const student = await googleSheetService.getStudent(phone);
  console.log(`Current Student Status: ${student.name} | Current Module: ${student.currentModule}`);

  const currentMod = student.currentModule;
  const nextMod = currentMod + 1;

  console.log(`▶️ Video playback for Module ${currentMod} reaches 100%...`);
  await googleSheetService.updateProgress(phone, {
    currentModule: nextMod,
    progressSeconds: 0,
    completedModules: [...(student.completedModules || []), currentMod]
  });

  const session = drmService.createSession({
    phone,
    name: student.name,
    module: nextMod,
    progressSeconds: 0
  });

  const nextUrl = `https://kairos-whatsapp-bot-cy5w.onrender.com/classroom/${session.sessionId}`;
  console.log(`\n🎉 Module ${currentMod} Completed!`);
  console.log(`🤖 Automated WhatsApp Message Dispatched to +${phone}:`);
  console.log(`   "🎉 Congratulations ${student.name}! You completed Module ${currentMod}!"`);
  console.log(`   "Your next class Module ${nextMod} is now unlocked and ready."`);
  console.log(`   👉 Next Class Link: ${nextUrl}`);
}

async function viewStudents() {
  console.log("\n--- [All Students in Google Sheet CRM] ---");
  const list = googleSheetService.readLocalStudents();
  console.table(list.map(s => ({
    Phone: s.phone,
    Name: s.name,
    Course: s.course,
    Paid: s.paymentStatus,
    Module: s.currentModule,
    Progress: `${Math.floor(s.progressSeconds / 60)}m ${s.progressSeconds % 60}s`
  })));
}

async function testLiveChat() {
  console.log("\n==================================================================");
  console.log("💬 LIVE INTERACTIVE CHATBOT (Type 'exit' to return to menu)");
  console.log("==================================================================");
  
  rl.question("Enter WhatsApp Phone Number to test with (default 9629531891): ", (phoneInput) => {
    const activePhone = phoneInput.trim() || "9629531891";
    console.log(`Connected as +${activePhone}. Type any message (e.g. 'Hi', 'start_class', 'payment'):\n`);

    function chatLoop() {
      rl.question(`+${activePhone} > `, async (msg) => {
        if (msg.trim().toLowerCase() === "exit") {
          promptMenu();
          return;
        }

        const isButton = ["start_class", "start_fresh", "course_details", "do_payment", "check_reg", "contact_support"].includes(msg.trim());
        const replies = await chatbotService.processMessage(
          activePhone,
          isButton ? "" : msg,
          isButton ? msg.trim() : null
        );

        for (const r of replies) {
          if (r.type === "image") console.log(`\n[🖼️ Poster Image] ${r.url}`);
          if (r.type === "text") console.log(`\n${r.text}`);
          if (r.type === "button") {
            console.log(`\n${r.header ? `*${r.header}*\n` : ""}${r.body}`);
            console.log(`Options: ${r.buttons.map(b => `[${b.title}] (id: ${b.id})`).join(" ")}`);
          }
          if (r.type === "cta_url") {
            console.log(`\n*${r.header}*\n${r.body}\n👉 [${r.buttonText}]: ${r.url}`);
          }
        }
        console.log("");
        chatLoop();
      });
    }

    chatLoop();
  });
}

// Start Simulator
promptMenu();

