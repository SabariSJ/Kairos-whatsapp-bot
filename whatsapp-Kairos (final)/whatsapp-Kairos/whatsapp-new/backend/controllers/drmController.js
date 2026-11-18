const path = require("path");
const fs = require("fs");
const { S3Client, GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const drmService = require("../services/drmService");
const googleSheetService = require("../services/googleSheetService");
const whatsappService = require("../services/whatsappService");
const chatbotService = require("../services/chatbotService");

// Initialize AWS S3 Client for Private Bucket Video Delivery
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1"
});
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "kairos-whatsapp-vid";

/**
 * Controller for DRM Video Streaming, AWS S3 Integration, Anti-Sharing Device Lock, and Classroom Web Player
 */
class DrmController {
  /**
   * Serve the Classroom Player Web Page
   * GET /classroom/:sessionId
   */
  renderClassroom(req, res) {
    const { sessionId } = req.params;
    const session = drmService.getSession(sessionId);

    if (!session) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Link Expired - Kairos Academy</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; text-align: center; }
            .card { background: #1e293b; padding: 40px 30px; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); max-width: 480px; width: 100%; border: 1px solid #334155; }
            h1 { color: #f87171; font-size: 24px; margin-bottom: 12px; }
            p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
            .btn { display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Session Expired or Invalid</h1>
            <p>This single-use classroom link has expired or is no longer valid. Please return to WhatsApp and tap <strong>Start Class</strong> to generate a fresh link.</p>
            <a href="https://wa.me/${process.env.WHATSAPP_PHONE_NUMBER ? process.env.WHATSAPP_PHONE_NUMBER.replace(/\D/g, '') : '919629531891'}" class="btn">Open WhatsApp</a>
          </div>
        </body>
        </html>
      `);
    }

    const playerPath = path.join(__dirname, "..", "public", "player.html");
    if (!fs.existsSync(playerPath)) {
      return res.status(500).send("Player file not found on server.");
    }

    let html = fs.readFileSync(playerPath, "utf8");
    const reset = req.query.reset === "1";
    const initialProgress = reset ? 0 : session.progressSeconds;

    const isFrench = googleSheetService.isFrench(session.language);
    const courseName = chatbotService.getCourseName(session.course, isFrench ? "fr" : "en");

    html = html
      .replace(/{{SESSION_ID}}/g, sessionId)
      .replace(/{{STUDENT_NAME}}/g, session.name || "Student")
      .replace(/{{STUDENT_NAME_UPPER}}/g, (session.name || "Student").toUpperCase())
      .replace(/{{STUDENT_PHONE}}/g, session.phone || "")
      .replace(/{{MODULE_NUMBER}}/g, String(session.module || 1))
      .replace(/{{COURSE_NAME}}/g, courseName)
      .replace(/{{INITIAL_PROGRESS}}/g, String(initialProgress))
      .replace(/{{LANGUAGE}}/g, isFrench ? "fr" : "en");

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    return res.send(html);
  }

  /**
   * Device Fingerprint Handshake & Lock
   * POST /api/classroom/handshake
   */
  handleHandshake(req, res) {
    const sessionId = (req.body && (req.body.sessionId || req.body.session)) || req.query.sessionId || req.query.session;
    const deviceSig = (req.body && req.body.deviceSig) || req.query.deviceSig;

    if (!sessionId || !deviceSig) {
      return res.status(400).json({ error: "Missing sessionId or deviceSig" });
    }

    const lockResult = drmService.lockDevice(sessionId, deviceSig);

    if (!lockResult.success) {
      return res.status(lockResult.status || 403).json({
        error: lockResult.message || "Unauthorized Device Detected. Video links are strictly locked to the registered student's device.",
        deviceLocked: true,
        phone: lockResult.phone || ""
      });
    }

    const session = lockResult.session;
    const isFr = googleSheetService.isFrench(session.language);
    return res.status(200).json({
      success: true,
      token: session.token,
      student: {
        name: session.name,
        phone: session.phone,
        course: session.course,
        module: session.module,
        moduleId: session.module,
        language: isFr ? "fr" : "en",
        languageCode: isFr ? "fr" : "en",
        progressSeconds: session.progressSeconds,
        startProgress: session.progressSeconds
      }
    });
  }

  /**
   * Course Video Playlist API
   * GET /api/video/playlist
   */
  getPlaylist(req, res) {
    const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(" ")[1]);
    const sessionParam = req.query.session || req.query.sessionId;
    let isFr = false;

    if (token) {
      const payload = drmService.verifyToken(token);
      if (payload && payload.language) {
        isFr = googleSheetService.isFrench(payload.language);
      }
    } else if (sessionParam) {
      const session = drmService.getSession(sessionParam);
      if (session && session.language) {
        isFr = googleSheetService.isFrench(session.language);
      }
    } else if (req.query.lang) {
      isFr = String(req.query.lang).toLowerCase().startsWith("fr");
    }

    const enPlaylist = [
      { module: 1, title: "Market Research & Idea Validation", duration: "05:14", s3Key: "english/video1.mp4" },
      { module: 2, title: "Financial Literacy & Cash Flow", duration: "04:02", s3Key: "english/video2.mp4" },
      { module: 3, title: "Customer Acquisition & Sales Strategy", duration: "04:12", s3Key: "english/video3.mp4" },
      { module: 4, title: "Digital Marketing & WhatsApp Growth", duration: "05:54", s3Key: "english/video4.mp4" },
      { module: 5, title: "Operations & Inventory Management", duration: "05:18", s3Key: "english/video5.mp4" },
      { module: 6, title: "Scaling & Business Growth", duration: "04:52", s3Key: "english/video6.mp4" }
    ];

    const frPlaylist = [
      { module: 1, title: "Étude de Marché et Validation d'Idée", duration: "05:16", s3Key: "french/french_video1.mp4" },
      { module: 2, title: "Gestion Financière et Flux de Trésorerie", duration: "04:00", s3Key: "french/french_video2.mp4" },
      { module: 3, title: "Stratégie de Vente et Acquisition Client", duration: "04:22", s3Key: "french/french_video3.mp4" },
      { module: 4, title: "Marketing Digital et Croissance WhatsApp", duration: "06:14", s3Key: "french/french_video4.mp4" },
      { module: 5, title: "Gestion des Opérations et des Stocks", duration: "05:12", s3Key: "french/french_video5.mp4" },
      { module: 6, title: "Stratégies de Croissance et Expansion", duration: "05:04", s3Key: "french/french_video6.mp4" }
    ];

    return res.status(200).json({
      success: true,
      language: isFr ? "fr" : "en",
      course: isFr ? "Cours de Réussite Commerciale" : "Business Success Class",
      modules: isFr ? frPlaylist : enPlaylist
    });
  }

  /**
   * Authenticated HTTP 206 Partial Content Video Streaming via AWS S3
   * GET /api/video/stream/:token
   */
  async streamVideo(req, res) {
    const { token } = req.params;
    const deviceSig = req.headers["x-device-signature"] || req.query.sig;

    // 1. Verify HMAC-SHA256 token
    const payload = drmService.verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: "Invalid or expired video streaming token" });
    }

    // 2. Anti-sharing device verification
    const session = drmService.getSession(payload.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session expired or terminated" });
    }

    if (session.deviceSig && deviceSig && session.deviceSig !== deviceSig) {
      console.warn(`[DRM Security Violation] Stream requested by unauthorized device! Target session: ${payload.sessionId}`);
      return res.status(403).json({
        error: "Unauthorized Device Detected. Video links are strictly locked to the registered student's device."
      });
    }

    // 3. Resolve module number and language
    const requestedModule = parseInt(req.query.module, 10);
    const moduleNumber = (requestedModule && requestedModule >= 1 && requestedModule <= 6)
      ? requestedModule
      : (payload.module || (session && session.module) || 1);

    const isFrench = googleSheetService.isFrench(payload.language || (session && session.language));

    // 4. Resolve AWS S3 object key
    const s3Key = isFrench ? `french/french_video${moduleNumber}.mp4` : `english/video${moduleNumber}.mp4`;
    const range = req.headers.range;

    // Attempt AWS S3 Private Delivery with HTTP 206 Range Streaming
    try {
      const s3Params = {
        Bucket: S3_BUCKET_NAME,
        Key: s3Key
      };
      if (range) {
        s3Params.Range = range;
      }

      const s3Data = await s3Client.send(new GetObjectCommand(s3Params));

      const headers = {
        "Content-Type": s3Data.ContentType || "video/mp4",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff"
      };

      if (s3Data.ContentRange) {
        headers["Content-Range"] = s3Data.ContentRange;
      }
      if (s3Data.ContentLength !== undefined) {
        headers["Content-Length"] = s3Data.ContentLength;
      }

      res.writeHead(range ? 206 : 200, headers);
      s3Data.Body.pipe(res);
      return;
    } catch (s3Err) {
      console.warn(`[S3 Streaming Fallback] AWS S3 request for ${s3Key} failed (${s3Err.message}). Falling back to local media.`);
      return this.streamLocalVideo(req, res, moduleNumber, isFrench);
    }
  }

  /**
   * Fallback: Local HTTP 206 Partial Content Video Streaming
   */
  streamLocalVideo(req, res, moduleNumber, isFrench) {
    const mediaDir = path.join(__dirname, "..", "public", "media");
    let videoFilename = isFrench ? `french_video${moduleNumber}.mp4` : `video${moduleNumber}.mp4`;
    let videoPath = path.join(mediaDir, videoFilename);

    if (!fs.existsSync(videoPath)) {
      if (isFrench) {
        const fallback = path.join(mediaDir, "french.mp4");
        videoPath = fs.existsSync(fallback) ? fallback : path.join(mediaDir, `video${moduleNumber}.mp4`);
      } else {
        const fallback = path.join(mediaDir, "video1.mp4");
        const sample = path.join(mediaDir, "sample_lesson.mp4");
        videoPath = fs.existsSync(fallback) ? fallback : sample;
      }
    }

    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: `Video for Module ${moduleNumber} not found on server` });
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).set("Content-Range", `bytes */${fileSize}`);
        return res.end();
      }

      const chunksize = end - start + 1;
      const file = fs.createReadStream(videoPath, { start, end });

      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "video/mp4",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff"
      };

      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "X-Content-Type-Options": "nosniff"
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
  }

  /**
   * Save Video Watch Progress
   * POST /api/video/progress
   */
  async saveProgress(req, res) {
    const { token, deviceSig, currentTime } = req.body;

    const payload = drmService.verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const session = drmService.getSession(payload.sessionId);
    if (!session || (session.deviceSig && session.deviceSig !== deviceSig)) {
      return res.status(403).json({ error: "Unauthorized device" });
    }

    const seconds = Math.max(0, Math.floor(currentTime || req.body.progressSeconds || 0));
    const activeModule = req.body.module || payload.module || (session && session.module) || 1;

    // Update in session memory and Google Sheets CRM
    drmService.updateSessionProgress(payload.sessionId, seconds);
    await googleSheetService.updateProgress(payload.phone, {
      progressSeconds: seconds,
      currentModule: activeModule
    });

    return res.status(200).json({ success: true, progressSeconds: seconds, module: activeModule });
  }

  /**
   * Auto-Advance Next Module on Completion & Send WhatsApp Notification
   * POST /api/video/complete
   */
  async completeModule(req, res) {
    const { token, deviceSig } = req.body;

    const payload = drmService.verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const session = drmService.getSession(payload.sessionId);
    if (!session || (session.deviceSig && session.deviceSig !== deviceSig)) {
      return res.status(403).json({ error: "Unauthorized device" });
    }

    const completedModule = Number(req.body.moduleId) || payload.module || 1;
    const phone = payload.phone;
    const student = await googleSheetService.getStudent(phone);

    // Mark session completed
    drmService.completeSession(payload.sessionId);

    const completedSet = new Set((student && student.completedModules) || []);
    completedSet.add(completedModule);
    const updatedCompleted = Array.from(completedSet).sort((a, b) => a - b);

    const nextModule = completedModule + 1;
    const isGraduated = completedModule >= 6;

    if (student) {
      await googleSheetService.updateProgress(phone, {
        currentModule: isGraduated ? 6 : nextModule,
        progressSeconds: 0,
        completedModules: updatedCompleted
      });
    }

    const isFrench = googleSheetService.isFrench((student && student.language) || session.language || payload.language);
    const serverBase = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_BASE_URL || "http://localhost:5001";
    let nextClassroomUrl = null;

    if (isGraduated) {
      console.log(`[Graduation Event] Student ${payload.name} (+${phone}) completed all 6 modules! Sending congratulations in ${isFrench ? 'French' : 'English'}.`);
      if (isFrench) {
        const frenchCourseName = chatbotService.getCourseName(session.course, "fr");
        whatsappService.sendTextMessage(
          phone,
          `🎓 *FÉLICITATIONS, ${(payload.name || "Étudiant").toUpperCase()} !* 🏆\n\nVous avez officiellement terminé *LES 6 MODULES* du cours *${frenchCourseName}* !\n\nVotre certificat de réussite a été enregistré. Notre coordinateur académique vous contactera très prochainement pour vos attestations officielles.\n\nMerci d'avoir choisi Kairos Academy !`
        ).catch(err => console.error("[WhatsApp Send Error]", err.message));
      } else {
        const engCourseName = chatbotService.getCourseName(session.course, "en");
        whatsappService.sendTextMessage(
          phone,
          `🎓 *CONGRATULATIONS, ${(payload.name || "Student").toUpperCase()}!* 🏆\n\nYou have officially completed *ALL 6 MODULES* of the *${engCourseName}*!\n\nYour certificate of completion has been registered. Our academic coordinator will contact you shortly regarding your graduation credentials.\n\nThank you for choosing Kairos Academy!`
        ).catch(err => console.error("[WhatsApp Send Error]", err.message));
      }
    } else {
      console.log(`[Auto-Advance Event] Student ${payload.name} (+${phone}) completed Module ${completedModule}. Unlocking Module ${nextModule} (Lang: ${isFrench ? 'fr' : 'en'})!`);
      const courseName = chatbotService.getCourseName(session.course, isFrench ? "fr" : "en");
      const nextSession = drmService.createSession({
        phone: phone,
        name: payload.name,
        course: courseName,
        module: nextModule,
        progressSeconds: 0,
        language: isFrench ? "fr" : "en"
      });

      nextClassroomUrl = `${serverBase}/classroom/${nextSession.sessionId}`;

      const advanceTitle = isFrench ? `Module ${nextModule} Débloqué !` : `Module ${nextModule} Unlocked!`;
      const advanceMessage = isFrench
        ? `🎉 *Félicitations ${payload.name} !* Vous avez terminé le Module ${completedModule} !\n\n` +
          `Votre prochain cours *Module ${nextModule}* est maintenant débloqué et prêt.\n\n` +
          `Appuyez sur le bouton ci-dessous pour continuer votre parcours :`
        : `🎉 *Congratulations ${payload.name}!* You completed Module ${completedModule}!\n\n` +
          `Your next class *Module ${nextModule}* is now unlocked and ready.\n\n` +
          `Tap the button below to continue your journey:`;
      const advanceBtn = isFrench ? `▶️ Commencer Module ${nextModule}` : `▶️ Start Module ${nextModule}`;

      whatsappService.sendCtaUrlButton(
        phone,
        advanceTitle,
        advanceMessage,
        advanceBtn,
        nextClassroomUrl,
        isFrench ? "Flux Sécurisé DRM Kairos" : "Kairos DRM Protected Stream"
      ).catch(err => console.error("[WhatsApp Send Error]", err.message));
    }

    return res.status(200).json({
      success: true,
      completedModule,
      nextModule: isGraduated ? null : nextModule,
      isGraduated,
      nextClassroomUrl: isGraduated ? null : nextClassroomUrl
    });
  }
}

module.exports = new DrmController();
