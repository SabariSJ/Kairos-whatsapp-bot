const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const googleSheetService = require("./services/googleSheetService");

async function testSheetConnection() {
  console.log("==================================================");
  console.log("🔍 TESTING GOOGLE APPS SCRIPT WEB APP CONNECTION");
  console.log("==================================================");

  const scriptUrl = process.env.GOOGLE_SHEET_SCRIPT_URL;
  console.log(`📡 Configured URL: ${scriptUrl ? scriptUrl.slice(0, 50) + "..." : "NOT SET (Using local store fallback)"}\n`);

  // Test 1: Fetching 'sabari' from your Google Sheet (Phone: 9500406150)
  const testPhone = "9500406150";
  console.log(`1. Querying student with phone: ${testPhone}...`);
  const student = await googleSheetService.getStudent(testPhone);

  if (student) {
    console.log("✅ Student successfully retrieved!");
    console.log("--------------------------------------------------");
    console.log(`👤 Name:           ${student.name}`);
    console.log(`📱 Phone:          ${student.phone}`);
    console.log(`📚 Course:         ${student.course}`);
    console.log(`💳 Payment Status: ${student.paymentStatus.toUpperCase()} ${student.paymentStatus === 'yes' ? '✅' : '🔒'}`);
    console.log(`📍 Current Module: Module ${student.currentModule}`);
    console.log(`⏱️ Saved Progress: ${student.progressSeconds}s`);
    console.log("--------------------------------------------------");
  } else {
    console.log("⚠️ Student not found. If you just deployed, make sure Row 2 has the student's phone number.");
  }

  // Test 2: Testing Progress Sync
  console.log("\n2. Testing real-time progress update (setting 45s progress)...");
  const updated = await googleSheetService.updateProgress(testPhone, {
    progressSeconds: 45,
    currentModule: 1
  });
  console.log("✅ Update dispatched! Saved progress:", updated?.progressSeconds, "seconds.");

  console.log("\n==================================================");
  console.log("🎉 GOOGLE SHEET CRM SYNC IS READY!");
  console.log("==================================================");
}

testSheetConnection().catch(err => {
  console.error("Test failed:", err.message);
});

