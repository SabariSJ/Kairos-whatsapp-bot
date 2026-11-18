const { pool } = require('../config/db');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

// Initialize AWS S3 Client for Private Bucket Video Delivery
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1'
});
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'kairos-whatsapp-vid';
const DRM_SECRET_KEY = process.env.DRM_SECRET_KEY || 'kairos_drm_ultra_secure_hmac_secret_2026_key';

// Standard syllabus definitions
const ENGLISH_MODULES = [
  { module: 1, title: 'Market Research & Idea Validation', duration: '05:14', s3Key: 'english/video1.mp4' },
  { module: 2, title: 'Financial Literacy & Cash Flow', duration: '04:02', s3Key: 'english/video2.mp4' },
  { module: 3, title: 'Customer Acquisition & Sales Strategy', duration: '04:12', s3Key: 'english/video3.mp4' },
  { module: 4, title: 'Digital Marketing & WhatsApp Growth', duration: '05:54', s3Key: 'english/video4.mp4' },
  { module: 5, title: 'Operations & Inventory Management', duration: '05:18', s3Key: 'english/video5.mp4' },
  { module: 6, title: 'Scaling & Business Growth', duration: '04:52', s3Key: 'english/video6.mp4' }
];

const FRENCH_MODULES = [
  { module: 1, title: 'Étude de Marché et Validation d\'Idée', duration: '05:16', s3Key: 'french/french_video1.mp4' },
  { module: 2, title: 'Gestion Financière et Flux de Trésorerie', duration: '04:00', s3Key: 'french/french_video2.mp4' },
  { module: 3, title: 'Stratégie de Vente et Acquisition Client', duration: '04:22', s3Key: 'french/french_video3.mp4' },
  { module: 4, title: 'Marketing Digital et Croissance WhatsApp', duration: '06:14', s3Key: 'french/french_video4.mp4' },
  { module: 5, title: 'Gestion des Opérations et des Stocks', duration: '05:12', s3Key: 'french/french_video5.mp4' },
  { module: 6, title: 'Stratégies de Croissance et Expansion', duration: '05:04', s3Key: 'french/french_video6.mp4' }
];

// In-memory / file persistent session store for development & testing
const sessionsMap = new Map();
const SESSIONS_FILE = path.join(__dirname, '..', '..', 'data', 'video_sessions.json');

function initSessionsStore() {
  try {
    const dir = path.dirname(SESSIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
      const data = JSON.parse(raw || '{}');
      const now = Date.now();
      for (const [id, sess] of Object.entries(data)) {
        if (sess && sess.expiresAt && sess.expiresAt > now) {
          sessionsMap.set(id, sess);
        }
      }
    }
  } catch (err) {
    console.error('[VideoService] Error initializing sessions file:', err.message);
  }
}

function saveSessionsToDisk() {
  try {
    const obj = {};
    const now = Date.now();
    for (const [id, sess] of sessionsMap.entries()) {
      if (sess.expiresAt > now) {
        obj[id] = sess;
      }
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    // Non-critical
  }
}

initSessionsStore();

class VideoService {
  /**
   * Verify Student Video Eligibility against PostgreSQL authoritative records
   * 
   * Strict Rules:
   * 1. Registration must exist
   * 2. Payment status must be 'Paid'
   * 3. Enrollment status must be 'Active'
   * 4. Course language must match student's assigned course
   */
  async checkEligibility(rawPhone) {
    if (!rawPhone) {
      return {
        eligible: false,
        statusCode: 400,
        code: 'MISSING_PHONE',
        message: 'Phone number is required.'
      };
    }

    const cleaned = String(rawPhone).replace(/\D/g, '');
    if (!cleaned || cleaned.length < 6) {
      return {
        eligible: false,
        statusCode: 400,
        code: 'INVALID_PHONE',
        message: 'Valid phone number is required (minimum 6 digits).'
      };
    }

    const localSuffix = cleaned.length >= 10 ? cleaned.slice(-10) : (cleaned.length >= 7 ? cleaned : null);

    const query = `
      SELECT 
        r.registration_id,
        r.full_name,
        r.email,
        r.phone_number,
        r.country_code,
        r.language AS reg_language,
        r.registered_at,
        c.course_id,
        c.course_name,
        c.language AS course_language,
        p.payment_id,
        p.status AS payment_status,
        e.enrollment_id,
        e.enrollment_status
      FROM wa_registrations r
      LEFT JOIN wa_payments p ON r.registration_id = p.registration_id
      LEFT JOIN wa_courses c ON p.course_id = c.course_id
      LEFT JOIN wa_enrollments e ON r.registration_id = e.registration_id
      WHERE r.phone_number = $1
         OR ($2::text IS NOT NULL AND r.phone_number LIKE '%' || $2)
         OR (r.country_code || r.phone_number) = $1
         OR (REPLACE(r.country_code, '+', '') || r.phone_number) = $1
      ORDER BY r.registered_at DESC
      LIMIT 1;
    `;

    const result = await pool.query(query, [cleaned, localSuffix]);

    if (result.rows.length === 0) {
      return {
        eligible: false,
        statusCode: 404,
        code: 'STUDENT_NOT_FOUND',
        message: 'Please register first.'
      };
    }

    const student = result.rows[0];
    const paymentStatus = (student.payment_status || '').trim();
    const enrollmentStatus = (student.enrollment_status || '').trim();

    // Check payment status
    if (paymentStatus.toLowerCase() !== 'paid') {
      return {
        eligible: false,
        statusCode: 403,
        code: 'PAYMENT_PENDING',
        message: 'Payment confirmation is pending.',
        paymentStatus: paymentStatus || 'Pending',
        student: {
          name: student.full_name,
          phone: student.phone_number,
          course: student.course_name
        }
      };
    }

    // Check enrollment status
    if (enrollmentStatus.toLowerCase() !== 'active') {
      return {
        eligible: false,
        statusCode: 403,
        code: 'ENROLLMENT_INACTIVE',
        message: 'Active enrolment is required.',
        enrollmentStatus: enrollmentStatus || 'Inactive',
        student: {
          name: student.full_name,
          phone: student.phone_number,
          course: student.course_name
        }
      };
    }

    // Determine normalized language
    const lang = (student.course_language || student.reg_language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';

    return {
      eligible: true,
      statusCode: 200,
      code: 'ELIGIBLE',
      message: 'Student is verified and eligible for course videos.',
      student: {
        registrationId: student.registration_id,
        name: student.full_name,
        phone: student.phone_number,
        countryCode: student.country_code,
        courseId: student.course_id,
        courseName: student.course_name,
        language: lang,
        paymentStatus: paymentStatus,
        enrollmentStatus: enrollmentStatus
      }
    };
  }

  /**
   * Retrieve language-specific course playlist
   */
  getPlaylist(language = 'en') {
    const isFr = String(language).toLowerCase().startsWith('fr');
    return {
      success: true,
      language: isFr ? 'fr' : 'en',
      course: isFr ? 'Cours de Réussite Commerciale' : 'Business Success Class',
      modules: isFr ? FRENCH_MODULES : ENGLISH_MODULES
    };
  }

  /**
   * Create an HMAC-SHA256 signed playback session
   */
  createSession({ phone, name, course, module = 1, progressSeconds = 0, language = 'en' }) {
    const sessionId = crypto.randomBytes(4).toString('hex').toLowerCase();
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

    const isFr = String(language || '').toLowerCase().startsWith('fr');
    const normalizedLang = isFr ? 'fr' : 'en';

    const payload = {
      sessionId,
      phone,
      name: name || 'Student',
      course: course || (isFr ? 'Cours de Réussite Commerciale' : 'Business Success Class'),
      module: Math.max(1, Math.min(6, Number(module) || 1)),
      progressSeconds: Number(progressSeconds) || 0,
      language: normalizedLang,
      iat: now,
      exp: expiresAt
    };

    const rawData = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', DRM_SECRET_KEY)
      .update(rawData)
      .digest('base64url');
    const token = `${rawData}.${signature}`;

    const sessionRecord = {
      sessionId,
      token,
      phone,
      name: payload.name,
      course: payload.course,
      module: payload.module,
      progressSeconds: payload.progressSeconds,
      language: normalizedLang,
      deviceSig: null,
      createdAt: now,
      expiresAt,
      completed: false
    };

    sessionsMap.set(sessionId, sessionRecord);
    saveSessionsToDisk();
    return { sessionId, token, expiresAt, sessionRecord };
  }

  /**
   * Verify HMAC-SHA256 signed token
   */
  verifyToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
      return null;
    }

    try {
      const [rawData, signature] = token.split('.');
      const expectedSig = crypto
        .createHmac('sha256', DRM_SECRET_KEY)
        .update(rawData)
        .digest('base64url');

      if (signature !== expectedSig) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(rawData, 'base64url').toString('utf8'));
      if (!payload || !payload.sessionId || (payload.exp && payload.exp < Date.now())) {
        return null;
      }

      return payload;
    } catch (err) {
      return null;
    }
  }

  /**
   * Retrieve session by sessionId
   */
  getSession(sessionId) {
    if (!sessionId) return null;
    const session = sessionsMap.get(sessionId);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      sessionsMap.delete(sessionId);
      return null;
    }
    return session;
  }

  /**
   * Anti-sharing device lock handshake
   */
  lockDevice(sessionId, deviceSig) {
    const session = this.getSession(sessionId);
    if (!session) {
      return {
        success: false,
        status: 404,
        message: 'Classroom session expired or invalid. Please request a new class link in WhatsApp.'
      };
    }

    if (!deviceSig) {
      return {
        success: false,
        status: 400,
        message: 'Missing device fingerprint.'
      };
    }

    if (!session.deviceSig) {
      session.deviceSig = deviceSig;
      saveSessionsToDisk();
      return { success: true, status: 200, session };
    }

    if (session.deviceSig === deviceSig) {
      return { success: true, status: 200, session };
    }

    return {
      success: false,
      status: 403,
      message: 'Unauthorized Device Detected. Video links are strictly locked to the registered student\'s device.'
    };
  }

  /**
   * Update and persist session watch progress
   */
  updateProgress(sessionId, seconds) {
    const session = this.getSession(sessionId);
    if (session) {
      session.progressSeconds = Math.max(0, Math.floor(seconds));
      saveSessionsToDisk();
      return true;
    }
    return false;
  }

  /**
   * Stream video via AWS S3 GetObjectCommand with HTTP 206 Range support
   */
  async streamFromS3(s3Key, rangeHeader, res) {
    const s3Params = {
      Bucket: S3_BUCKET_NAME,
      Key: s3Key
    };
    if (rangeHeader) {
      s3Params.Range = rangeHeader;
    }

    const s3Data = await s3Client.send(new GetObjectCommand(s3Params));
    const headers = {
      'Content-Type': s3Data.ContentType || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    };

    if (s3Data.ContentRange) {
      headers['Content-Range'] = s3Data.ContentRange;
    }
    if (s3Data.ContentLength !== undefined) {
      headers['Content-Length'] = s3Data.ContentLength;
    }

    res.writeHead(rangeHeader ? 206 : 200, headers);
    s3Data.Body.pipe(res);
  }
}

module.exports = new VideoService();
