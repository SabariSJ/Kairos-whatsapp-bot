const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const assert = require("assert");
const axios = require("axios");
const http = require("http");

// Import the app from server.js
// We can start the server dynamically or test on an ephemeral port
const express = require("express");
const fs = require("fs");

const webhookRoutes = require("./routes/webhook");
const classroomRoutes = require("./routes/classroom");
const videoRoutes = require("./routes/video");
const drmController = require("./controllers/drmController");
const drmService = require("./services/drmService");
const googleSheetService = require("./services/googleSheetService");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const mediaDir = path.join(__dirname, "public", "media");

// DRM raw video block
app.use("/media/:filename", (req, res, next) => {
  const file = req.params.filename.toLowerCase();
  if (file.startsWith("video") && file.endsWith(".mp4")) {
    return res.status(403).json({ error: "Direct access forbidden" });
  }
  next();
});
app.use("/media", express.static(mediaDir));

app.use("/webhook", webhookRoutes);
app.use("/classroom", classroomRoutes);
app.post("/api/classroom/handshake", (req, res) => drmController.handleHandshake(req, res));
app.use("/api/video", videoRoutes);

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    activeSessions: drmService.getActiveSessionsCount()
  });
});

async function runHttpTests() {
  console.log("==================================================");
  console.log("🌐 STARTING HTTP & INTEGRATION TEST SERVER");
  console.log("==================================================");

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`📡 Ephemeral Test Server running on ${baseUrl}`);

  try {
    // 1. Test /health
    const healthRes = await axios.get(`${baseUrl}/health`);
    assert.strictEqual(healthRes.status, 200);
    assert.strictEqual(healthRes.data.status, "healthy");
    console.log("✅ [PASS] GET /health returned 200 OK & healthy status");

    // 2. Test GET /webhook verification
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "sproutks_webhook_verify_token_2026";
    const challengeRes = await axios.get(`${baseUrl}/webhook`, {
      params: {
        "hub.mode": "subscribe",
        "hub.verify_token": verifyToken,
        "hub.challenge": "CHALLENGE_ACCEPTED_7788"
      }
    });
    assert.strictEqual(challengeRes.status, 200);
    assert.strictEqual(challengeRes.data, "CHALLENGE_ACCEPTED_7788");
    console.log("✅ [PASS] GET /webhook verified challenge token successfully");

    // 3. Test POST /webhook responds immediately with 200 EVENT_RECEIVED
    const webhookRes = await axios.post(`${baseUrl}/webhook`, {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "1125512693348242",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "919629531891", phone_number_id: "1393037967216637" },
                messages: [
                  {
                    from: "919629531891", // Bot's own number -> should be dropped as self-message
                    id: "wamid.SELF_TEST_001",
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    text: { body: "Hi" },
                    type: "text"
                  }
                ]
              },
              field: "messages"
            }
          ]
        }
      ]
    });
    assert.strictEqual(webhookRes.status, 200);
    assert.strictEqual(webhookRes.data, "EVENT_RECEIVED");
    console.log("✅ [PASS] POST /webhook responded with HTTP 200 EVENT_RECEIVED");

    // 4. Test DRM Session Creation & GET /classroom/:sessionId
    const session = drmService.createSession({
      phone: "9629531891",
      name: "Sabari SJ",
      module: 1,
      progressSeconds: 30
    });
    const classroomRes = await axios.get(`${baseUrl}/classroom/${session.sessionId}`);
    assert.strictEqual(classroomRes.status, 200);
    assert(classroomRes.data.includes("Official Student Portal") || classroomRes.data.includes("Kairos"), "Must render player HTML");
    assert(classroomRes.data.includes("Sabari SJ"), "Must inject student name");
    console.log("✅ [PASS] GET /classroom/:sessionId rendered player with injected student info");

    // 5. Test POST /api/classroom/handshake (Device Lock)
    const deviceSig1 = "chrome_device_hash_112233";
    const handshakeRes = await axios.post(`${baseUrl}/api/classroom/handshake`, {
      sessionId: session.sessionId,
      deviceSig: deviceSig1
    });
    assert.strictEqual(handshakeRes.status, 200);
    assert.strictEqual(handshakeRes.data.success, true);
    assert(typeof handshakeRes.data.token === "string");
    console.log("✅ [PASS] POST /api/classroom/handshake locked device successfully");

    // 6. Test Unauthorized Device blocked with 403 Forbidden
    try {
      await axios.post(`${baseUrl}/api/classroom/handshake`, {
        sessionId: session.sessionId,
        deviceSig: "unauthorized_different_device_999"
      });
      assert.fail("Should have thrown 403");
    } catch (err) {
      assert.strictEqual(err.response.status, 403);
      assert(err.response.data.error.includes("Unauthorized Device"), "Must return device lock error");
      console.log("✅ [PASS] Unauthorized device blocked with HTTP 403 Forbidden");
    }

    // 7. Test HTTP 206 Partial Content Range Streaming (/api/video/stream/:token)
    const streamToken = handshakeRes.data.token;
    const streamRes = await axios.get(`${baseUrl}/api/video/stream/${streamToken}?sig=${deviceSig1}`, {
      headers: {
        "Range": "bytes=0-1048575" // Request 1MB chunk
      }
    });
    assert.strictEqual(streamRes.status, 206);
    assert(streamRes.headers["content-range"].startsWith("bytes 0-1048575/"));
    assert.strictEqual(streamRes.headers["accept-ranges"], "bytes");
    assert.strictEqual(streamRes.headers["content-type"], "video/mp4");
    console.log("✅ [PASS] GET /api/video/stream/:token served HTTP 206 Partial Content range request");

    // 8. Test Direct Public Video Access to /media/video1.mp4 is FORBIDDEN (HTTP 403)
    try {
      await axios.get(`${baseUrl}/media/video1.mp4`);
      assert.fail("Direct access should have been blocked");
    } catch (err) {
      assert.strictEqual(err.response.status, 403);
      console.log("✅ [PASS] Direct public access to raw /media/video1.mp4 blocked with HTTP 403 Forbidden");
    }

    // 9. Test POST /api/video/progress
    const progressRes = await axios.post(`${baseUrl}/api/video/progress`, {
      token: streamToken,
      deviceSig: deviceSig1,
      currentTime: 120
    });
    assert.strictEqual(progressRes.status, 200);
    assert.strictEqual(progressRes.data.progressSeconds, 120);
    console.log("✅ [PASS] POST /api/video/progress updated student watch time");

    // 10. Test POST /api/video/complete (Auto-Advance Next Module)
    const completeRes = await axios.post(`${baseUrl}/api/video/complete`, {
      token: streamToken,
      deviceSig: deviceSig1
    });
    assert.strictEqual(completeRes.status, 200);
    assert.strictEqual(completeRes.data.completedModule, 1);
    assert.strictEqual(completeRes.data.nextModule, 2);
    console.log("✅ [PASS] POST /api/video/complete marked Module 1 complete and advanced to Module 2!");

    console.log("==================================================");
    console.log("🎉 ALL HTTP & INTEGRATION TESTS COMPLETED SUCCESSFULLY!");
    console.log("==================================================");
  } finally {
    server.close();
  }
}

runHttpTests().catch(err => {
  console.error("HTTP Integration test failed:", err);
  process.exit(1);
});

