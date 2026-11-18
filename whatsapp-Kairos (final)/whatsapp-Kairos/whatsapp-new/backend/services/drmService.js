const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

class DrmService {
  constructor() {
    this.secret = process.env.DRM_SECRET_KEY || "kairos_drm_ultra_secure_hmac_secret_2026_key";
    this.sessionsFile = path.join(__dirname, "..", "data", "drm_sessions.json");
    this.sessions = new Map();
    this.initSessionsStore();
  }

  /**
   * Load existing sessions from disk
   */
  initSessionsStore() {
    try {
      const dir = path.dirname(this.sessionsFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (fs.existsSync(this.sessionsFile)) {
        const raw = fs.readFileSync(this.sessionsFile, "utf8");
        const data = JSON.parse(raw || "{}");
        const now = Date.now();
        for (const [id, sess] of Object.entries(data)) {
          // Keep unexpired sessions (valid for 24h)
          if (sess && sess.expiresAt && sess.expiresAt > now) {
            this.sessions.set(id, sess);
          }
        }
      }
    } catch (err) {
      console.error("[DrmService] Error loading sessions file:", err.message);
    }
  }

  /**
   * Save sessions to disk
   */
  saveSessionsToDisk() {
    try {
      const obj = {};
      const now = Date.now();
      for (const [id, sess] of this.sessions.entries()) {
        if (sess.expiresAt > now) {
          obj[id] = sess;
        }
      }
      fs.writeFileSync(this.sessionsFile, JSON.stringify(obj, null, 2), "utf8");
    } catch (err) {
      // Non-critical
    }
  }

  /**
   * Generate an 8-character random session ID
   */
  generateShortSessionId() {
    return crypto.randomBytes(4).toString("hex").toLowerCase();
  }

  /**
   * Sign a payload using HMAC-SHA256
   */
  signToken(payload) {
    const rawData = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto
      .createHmac("sha256", this.secret)
      .update(rawData)
      .digest("base64url");
    return `${rawData}.${signature}`;
  }

  /**
   * Verify an HMAC-SHA256 signed token
   */
  verifyToken(token) {
    if (!token || typeof token !== "string" || !token.includes(".")) {
      return null;
    }

    try {
      const [rawData, signature] = token.split(".");
      const expectedSig = crypto
        .createHmac("sha256", this.secret)
        .update(rawData)
        .digest("base64url");

      if (signature !== expectedSig) {
        console.warn("[DrmService] Invalid HMAC signature on token!");
        return null;
      }

      const payload = JSON.parse(Buffer.from(rawData, "base64url").toString("utf8"));
      if (!payload || !payload.sessionId || (payload.exp && payload.exp < Date.now())) {
        console.warn("[DrmService] Expired or malformed token payload!");
        return null;
      }

      return payload;
    } catch (err) {
      console.error("[DrmService] Error verifying token:", err.message);
      return null;
    }
  }

  /**
   * Create a single-use classroom session with token binding
   * 
   * @param {object} params { phone, name, course, module, progressSeconds, language }
   * @returns {{ sessionId: string, token: string, expiresAt: number }}
   */
  createSession({ phone, name, course, module = 1, progressSeconds = 0, language = "en" }) {
    const sessionId = this.generateShortSessionId();
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours expiry

    const isFr = String(language || "").toLowerCase().startsWith("fr") || String(language || "").toLowerCase() === "f";
    const normalizedLang = isFr ? "fr" : "en";

    const payload = {
      sessionId,
      phone,
      name,
      course: course || "Masterclass Course",
      module: Math.max(1, Math.min(6, Number(module) || 1)),
      progressSeconds: Number(progressSeconds) || 0,
      language: normalizedLang,
      iat: now,
      exp: expiresAt
    };

    const token = this.signToken(payload);

    const sessionRecord = {
      sessionId,
      token,
      phone,
      name,
      course: payload.course,
      module: payload.module,
      progressSeconds: payload.progressSeconds,
      language: normalizedLang,
      deviceSig: null, // Device will be locked upon first handshake
      createdAt: now,
      expiresAt: expiresAt,
      completed: false
    };

    this.sessions.set(sessionId, sessionRecord);
    this.saveSessionsToDisk();

    console.log(`[DrmService] Created Session ${sessionId} for student ${name} (+${phone}) | Module ${payload.module} | Start: ${progressSeconds}s`);
    return { sessionId, token, expiresAt };
  }

  /**
   * Get session record by sessionId
   */
  getSession(sessionId) {
    if (!sessionId) return null;
    let session = this.sessions.get(sessionId);
    if (!session) {
      this.initSessionsStore();
      session = this.sessions.get(sessionId);
    }
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(sessionId);
      this.saveSessionsToDisk();
      return null;
    }
    return session;
  }

  /**
   * Perform anti-sharing device lock handshake
   * 
   * @param {string} sessionId 
   * @param {string} deviceSig Fingerprint signature from browser
   * @returns {{ success: boolean, status: number, message?: string, session?: object }}
   */
  lockDevice(sessionId, deviceSig) {
    const session = this.getSession(sessionId);
    if (!session) {
      return {
        success: false,
        status: 404,
        message: "Classroom session expired or invalid. Please request a new class link in WhatsApp."
      };
    }

    if (!deviceSig) {
      return {
        success: false,
        status: 400,
        message: "Missing device fingerprint."
      };
    }

    // First time opening the session on student's device -> LOCK TO THIS DEVICE
    if (!session.deviceSig) {
      session.deviceSig = deviceSig;
      this.saveSessionsToDisk();
      console.log(`[DrmDeviceLock] Session ${sessionId} locked to initial device fingerprint: ${deviceSig.slice(0, 16)}...`);
      return {
        success: true,
        status: 200,
        session: session
      };
    }

    // Opened on the same verified device
    if (session.deviceSig === deviceSig) {
      return {
        success: true,
        status: 200,
        session: session
      };
    }

    // Link shared with another device/browser -> BLOCK!
    console.warn(`[DrmDeviceLock VIOLATION] Session ${sessionId} accessed from unauthorized device! Registered: ${session.deviceSig.slice(0, 12)}... | Incoming: ${deviceSig.slice(0, 12)}...`);
    return {
      success: false,
      status: 403,
      message: "Unauthorized Device Detected. Video links are strictly locked to the registered student's device."
    };
  }

  /**
   * Update student watch duration
   */
  updateSessionProgress(sessionId, progressSeconds) {
    const session = this.getSession(sessionId);
    if (session) {
      session.progressSeconds = Math.max(0, Math.floor(progressSeconds));
      this.saveSessionsToDisk();
    }
  }

  /**
   * Mark session video completed
   */
  completeSession(sessionId) {
    const session = this.getSession(sessionId);
    if (session) {
      session.completed = true;
      this.saveSessionsToDisk();
    }
  }

  /**
   * Active sessions count for health check
   */
  getActiveSessionsCount() {
    return this.sessions.size;
  }
}

module.exports = new DrmService();

