const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const fs = require("fs");
const axios = require("axios");

// Route handlers & controllers
const webhookRoutes = require("./routes/webhook");
const classroomRoutes = require("./routes/classroom");
const videoRoutes = require("./routes/video");
const drmController = require("./controllers/drmController");
const drmService = require("./services/drmService");
const googleSheetService = require("./services/googleSheetService");
const backendStudentService = require("./services/backendStudentService");

const app = express();
// PORT: 5001 (local staging) / 10000 (Render default)
const PORT = process.env.BOT_PORT || (process.env.PORT === "5000" ? 5001 : (process.env.PORT || 5001));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve public static assets (posters, styles, etc.)
const publicDir = path.join(__dirname, "public");
const mediaDir = path.join(publicDir, "media");
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

// DRM SECURITY RULE: Do NOT serve raw video files publicly from /media
app.use("/media/:filename", (req, res, next) => {
  const file = req.params.filename.toLowerCase();
  if (file.startsWith("video") && file.endsWith(".mp4")) {
    return res.status(403).json({
      error: "Direct access to raw video files is strictly forbidden. Course videos are DRM protected and accessible only via single-use /classroom tokens."
    });
  }
  next();
});

// Serve non-video media (posters, images, audio) publicly
app.use("/media", express.static(mediaDir, {
  setHeaders: (res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Accept-Ranges", "bytes");
  }
}));

// Fallback for poster images
app.get("/media/:filename", (req, res) => {
  const filePath = path.join(mediaDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  const fallback = path.join(mediaDir, "class_img_english.jpeg");
  if (fs.existsSync(fallback)) {
    return res.sendFile(fallback);
  }
  const fallbackPoster = path.join(mediaDir, "programme_poster.jpg");
  if (fs.existsSync(fallbackPoster)) {
    return res.sendFile(fallbackPoster);
  }
  res.status(404).json({ error: "Media not found" });
});

// =========================================================================
// ROUTE REGISTRATIONS
// =========================================================================

// 1. Meta WhatsApp Webhook
app.use("/webhook", webhookRoutes);

// 2. DRM Protected Classroom Web Player
app.use("/classroom", classroomRoutes);

// 3. DRM Handshake Endpoint
app.post("/api/classroom/handshake", (req, res) => drmController.handleHandshake(req, res));

// 4. DRM Tokenized Video Stream & Progress APIs
app.use("/api/video", videoRoutes);

// 5. 24/7 Health Check & Status Endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    service: "Kairos WhatsApp Bot & DRM Video Backend",
    phoneRegistered: process.env.WHATSAPP_PHONE_NUMBER || "+919629531891",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "1393037967216637",
    activeSessions: drmService.getActiveSessionsCount(),
    memory: process.memoryUsage()
  });
});

// Root welcome & summary endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Kairos WhatsApp Chatbot & DRM Course Delivery Engine",
    version: "2.0.0",
    status: "online",
    healthCheck: "/health",
    webhookUrl: "/webhook",
    phone: process.env.WHATSAPP_PHONE_NUMBER || "+919629531891",
    googleSheetSync: Boolean(process.env.GOOGLE_SHEET_SCRIPT_URL),
    activeSessions: drmService.getActiveSessionsCount()
  });
});

// 6. Student CRM & External Registration Webhook Endpoints
// Instant Lead Ingestion from Web Form: POST /api/webhook/student-registered
app.post("/api/webhook/student-registered", async (req, res) => {
  try {
    const authKey = req.headers["x-service-key"] || (req.headers["authorization"]?.startsWith("Bearer ") ? req.headers["authorization"].split(" ")[1] : null);
    const expectedKey = process.env.INTERNAL_SERVICE_KEY || "kairos_internal_service_key_2026_bot_auth_secret";
    if (authKey && authKey !== expectedKey) {
      return res.status(401).json({ error: "Unauthorized: Invalid service key" });
    }

    const { name, phone, course, paymentStatus, language, eventId } = req.body;
    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Idempotent duplicate event prevention
    const eventResult = backendStudentService.processRegistrationEvent({
      eventId,
      phone,
      ...req.body
    });

    if (eventResult.duplicate) {
      return res.status(200).json({
        success: true,
        message: "Duplicate registration event ignored",
        duplicate: true
      });
    }

    const cleanPhone = googleSheetService.normalizePhone(phone);
    const student = await googleSheetService.updateProgress(cleanPhone, {
      name: name || "Student",
      course: course || "Business Success Class",
      paymentStatus: (String(paymentStatus || "").toLowerCase() === "yes" || paymentStatus === "Paid") ? "yes" : "no",
      currentModule: 1,
      progressSeconds: 0,
      completedModules: []
    });

    // In staging or mock mode, we don't spam live WhatsApp
    if (process.env.MOCK_WHATSAPP === "true") {
      console.log(`[Event Mock] Onboarding notification staged for: +${cleanPhone}`);
    } else {
      const whatsappService = require("./services/whatsappService");
      const welcomeMsg = `👋 *Welcome to Kairos Academy, ${student.name}!* \n\nWe have received your registration for *${student.course}*.\n\n${student.paymentStatus === 'yes' ? 'Your enrollment is active! Reply with *Hi* to access your classroom.' : 'Please complete your course payment to unlock Module 1. Reply with *Hi* for payment instructions.'}`;
      whatsappService.sendTextMessage(cleanPhone, welcomeMsg).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: "Student successfully enrolled & synced to Google Sheets CRM",
      student
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Instant Payment Confirmation Webhook: POST /api/webhook/payment-confirmed
app.post("/api/webhook/payment-confirmed", async (req, res) => {
  try {
    const { phone, transactionId, amount } = req.body;
    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const cleanPhone = googleSheetService.normalizePhone(phone);
    const updated = await googleSheetService.updateProgress(cleanPhone, {
      paymentStatus: "yes"
    });

    // Automatically send payment confirmation & start class button on WhatsApp
    const whatsappService = require("./services/whatsappService");
    const serverBase = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_BASE_URL || "https://whatsapp-kairos-video.onrender.com";
    
    const isFr = googleSheetService.isFrench(updated?.language);
    
    // Generate classroom session for Module
    const session = drmService.createSession({
      phone: cleanPhone,
      name: updated?.name || "Student",
      course: updated?.course || (isFr ? "Cours de Réussite Commerciale" : "Business Success Class"),
      module: updated?.currentModule || 1,
      progressSeconds: 0,
      language: isFr ? "fr" : "en"
    });
    const classroomUrl = `${serverBase}/classroom/${session.sessionId}`;

    const confirmTitle = isFr ? "Paiement Confirmé ✅" : "Payment Verified ✅";
    const confirmBody = isFr
      ? `🎉 *Paiement Confirmé !* Merci pour votre règlement.\n\nVotre accès à la salle de classe pour le *Module ${session.module}* est désormais actif ! Appuyez ci-dessous pour démarrer votre cours :`
      : `🎉 *Payment Confirmed!* Thank you for your payment.\n\nYour classroom access for *Module ${session.module}* is now active! Tap below to start your class:`;
    const confirmBtn = isFr ? "▶️ Accéder au cours" : "▶️ Enter Class";

    whatsappService.sendCtaUrlButton(
      cleanPhone,
      confirmTitle,
      confirmBody,
      confirmBtn,
      classroomUrl,
      isFr ? "Flux Sécurisé DRM Kairos" : "Kairos DRM Protected"
    ).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Payment confirmed, student unlocked & WhatsApp notified",
      student: updated
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Internal Automatic Payment Confirmation Notification API
// POST /api/internal/send-payment-notification
// Protected by service-to-service key
app.post("/api/internal/send-payment-notification", async (req, res) => {
  try {
    const serviceKey = req.headers["x-service-key"] || (req.headers.authorization && req.headers.authorization.split(" ")[1]);
    const expectedKey = process.env.INTERNAL_SERVICE_KEY || "kairos_internal_service_key_2026_bot_auth_secret";

    if (!serviceKey || serviceKey !== expectedKey) {
      return res.status(401).json({ error: "Unauthorized: Invalid or missing service key" });
    }

    const { phone, templateName, parameters, languageCode, paymentId } = req.body;
    if (!phone || !templateName) {
      return res.status(400).json({ error: "Phone number and templateName are required." });
    }

    const whatsappService = require("./services/whatsappService");
    const result = await whatsappService.sendTemplateMessage(
      phone,
      templateName,
      parameters || [],
      languageCode || "en_US"
    );

    if (result && result.messages && result.messages.length > 0) {
      const messageId = result.messages[0].id;
      console.log(`[Automatic Notification Success] Sent ${templateName} to +${phone} (Payment #${paymentId}) | msgId: ${messageId}`);
      return res.status(200).json({
        success: true,
        messageId,
        recipient: phone,
        templateName
      });
    }

    return res.status(502).json({
      success: false,
      error: "Meta API rejected message or returned no message ID"
    });
  } catch (err) {
    console.error("[Automatic Notification Error]:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Student CRM / Leads Inspection API
app.get("/students", (req, res) => {
  try {
    const list = googleSheetService.readLocalStudents();
    res.json({
      totalStudents: list.length,
      students: list
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to read students database" });
  }
});

// Leads compatibility endpoint
app.get("/leads", (req, res) => {
  try {
    const leadsPath = path.join(__dirname, "data", "leads.json");
    if (fs.existsSync(leadsPath)) {
      const data = JSON.parse(fs.readFileSync(leadsPath, "utf8"));
      return res.json({ totalLeads: data.length, leads: data });
    }
    return res.json({ totalLeads: 0, leads: [] });
  } catch (err) {
    return res.status(500).json({ error: "Failed to read leads store" });
  }
});

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found.",
    availableEndpoints: [
      "/webhook (Meta WhatsApp Webhook)",
      "/classroom/:sessionId (Classroom Web Player)",
      "/api/video/stream/:token (DRM Video Stream)",
      "/health (24/7 Cloud Uptime Healthcheck)",
      "/students (Student CRM List)"
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("[Internal Server Error]:", err.message);
  res.status(500).json({ error: "Internal Server Error" });
});

// =========================================================================
// 24/7 CLOUD HOST RELIABILITY (Render / Railway Keep-Alive Background Ping)
// =========================================================================
const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000; // 10 minutes

function startKeepAlivePing() {
  setInterval(async () => {
    const serverUrl = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_BASE_URL;
    if (serverUrl && serverUrl.startsWith("http") && !serverUrl.includes("localhost")) {
      try {
        const pingUrl = `${serverUrl.replace(/\/+$/, "")}/health`;
        const res = await axios.get(pingUrl, { timeout: 8000 });
        console.log(`[Keep-Alive 24/7] Pinged ${pingUrl} - Status: ${res.status} OK at ${new Date().toISOString()}`);
      } catch (err) {
        console.warn(`[Keep-Alive Ping Warning] Cloud self-ping to ${serverUrl} failed: ${err.message}`);
      }
    }
  }, KEEP_ALIVE_INTERVAL);
}

// Start Server
app.listen(PORT, "0.0.0.0", () => {
  console.log("==================================================");
  console.log("🚀 Kairos 24/7 WhatsApp Chatbot & DRM Backend is LIVE");
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`🔗 Webhook GET/POST endpoint: http://localhost:${PORT}/webhook`);
  console.log(`🔒 DRM Classroom player base: http://localhost:${PORT}/classroom/:sessionId`);
  console.log(`📱 WhatsApp Number: ${process.env.WHATSAPP_PHONE_NUMBER || "+919629531891"}`);
  console.log(`📊 Google Sheet Sync: ${process.env.GOOGLE_SHEET_SCRIPT_URL ? "Configured" : "Local Fallback Active"}`);
  console.log("==================================================");

  startKeepAlivePing();
});
