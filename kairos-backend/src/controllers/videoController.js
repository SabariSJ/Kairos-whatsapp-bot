const videoService = require('../services/videoService');
const path = require('path');
const fs = require('fs');

class VideoController {
  /**
   * Check Student Video Eligibility
   * GET /api/video/eligibility/:phone
   */
  async checkEligibility(req, res, next) {
    try {
      const phone = req.params.phone || req.query.phone || (req.body && req.body.phone);
      const result = await videoService.checkEligibility(phone);
      return res.status(result.statusCode).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get Course Video Playlist
   * GET /api/video/playlist
   */
  async getPlaylist(req, res, next) {
    try {
      const lang = req.query.lang || req.query.language || 'en';
      const playlist = videoService.getPlaylist(lang);
      return res.status(200).json(playlist);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create Secure Video Playback Session
   * POST /api/video/session
   */
  async createSession(req, res, next) {
    try {
      const { phone, module = 1 } = req.body;
      const eligibility = await videoService.checkEligibility(phone);

      if (!eligibility.eligible) {
        return res.status(eligibility.statusCode).json(eligibility);
      }

      const student = eligibility.student;
      const session = videoService.createSession({
        phone: student.phone,
        name: student.name,
        course: student.courseName,
        module,
        progressSeconds: 0,
        language: student.language
      });

      const serverBase = process.env.SERVER_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
      const classroomUrl = `${serverBase}/classroom/${session.sessionId}`;

      return res.status(200).json({
        success: true,
        sessionId: session.sessionId,
        token: session.token,
        classroomUrl,
        expiresAt: session.expiresAt,
        student: {
          name: student.name,
          phone: student.phone,
          course: student.courseName,
          language: student.language,
          module
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Device Fingerprint Handshake
   * POST /api/video/handshake
   */
  async handleHandshake(req, res, next) {
    try {
      const sessionId = (req.body && (req.body.sessionId || req.body.session)) || req.query.sessionId;
      const deviceSig = (req.body && req.body.deviceSig) || req.query.deviceSig;

      if (!sessionId || !deviceSig) {
        return res.status(400).json({ error: 'Missing sessionId or deviceSig' });
      }

      const lockResult = videoService.lockDevice(sessionId, deviceSig);
      if (!lockResult.success) {
        return res.status(lockResult.status || 403).json({
          error: lockResult.message,
          deviceLocked: true
        });
      }

      const session = lockResult.session;
      return res.status(200).json({
        success: true,
        token: session.token,
        student: {
          name: session.name,
          phone: session.phone,
          course: session.course,
          module: session.module,
          language: session.language,
          progressSeconds: session.progressSeconds
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Video Stream Chunk Delivery via AWS S3
   * GET /api/video/stream/:token
   */
  async streamVideo(req, res, next) {
    try {
      const { token } = req.params;
      const deviceSig = req.headers['x-device-signature'] || req.query.sig;

      const payload = videoService.verifyToken(token);
      if (!payload) {
        return res.status(401).json({ error: 'Invalid or expired video streaming token' });
      }

      const session = videoService.getSession(payload.sessionId);
      if (session && session.deviceSig && deviceSig && session.deviceSig !== deviceSig) {
        return res.status(403).json({
          error: 'Unauthorized Device Detected. Video links are strictly locked to the registered student\'s device.'
        });
      }

      const requestedModule = parseInt(req.query.module, 10);
      const moduleNumber = (requestedModule && requestedModule >= 1 && requestedModule <= 6)
        ? requestedModule
        : (payload.module || 1);

      const isFrench = String(payload.language).toLowerCase().startsWith('fr');
      const s3Key = isFrench ? `french/french_video${moduleNumber}.mp4` : `english/video${moduleNumber}.mp4`;
      const range = req.headers.range;

      try {
        await videoService.streamFromS3(s3Key, range, res);
      } catch (s3Err) {
        // Fallback to local media if S3 offline
        const localPath = path.join(__dirname, '..', '..', '..', 'whatsapp-Kairos (final)', 'whatsapp-Kairos', 'whatsapp-new', 'backend', 'public', 'media', isFrench ? `french_video${moduleNumber}.mp4` : `video${moduleNumber}.mp4`);
        if (fs.existsSync(localPath)) {
          const stat = fs.statSync(localPath);
          const fileSize = stat.size;
          if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = end - start + 1;
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize,
              'Content-Type': 'video/mp4'
            });
            fs.createReadStream(localPath, { start, end }).pipe(res);
          } else {
            res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
            fs.createReadStream(localPath).pipe(res);
          }
        } else {
          return res.status(404).json({ error: 'Video stream not found' });
        }
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * Save Video Playback Progress
   * POST /api/video/progress
   */
  async saveProgress(req, res, next) {
    try {
      const { token, deviceSig, currentTime } = req.body;
      const payload = videoService.verifyToken(token);
      if (!payload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const session = videoService.getSession(payload.sessionId);
      if (session && session.deviceSig && deviceSig && session.deviceSig !== deviceSig) {
        return res.status(403).json({ error: 'Unauthorized device' });
      }

      const seconds = Math.max(0, Math.floor(currentTime || req.body.progressSeconds || 0));
      videoService.updateProgress(payload.sessionId, seconds);

      return res.status(200).json({ success: true, progressSeconds: seconds });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Mark Module Complete & Auto Advance
   * POST /api/video/complete
   */
  async completeModule(req, res, next) {
    try {
      const { token, deviceSig } = req.body;
      const payload = videoService.verifyToken(token);
      if (!payload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const completedModule = Number(req.body.moduleId) || payload.module || 1;
      const nextModule = completedModule + 1;
      const isGraduated = completedModule >= 6;

      return res.status(200).json({
        success: true,
        completedModule,
        nextModule: isGraduated ? null : nextModule,
        isGraduated
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Serve Classroom Player Page
   * GET /classroom/:sessionId
   */
  async renderClassroom(req, res, next) {
    try {
      const { sessionId } = req.params;
      const session = videoService.getSession(sessionId);

      const playerPath = path.join(__dirname, '..', '..', '..', 'whatsapp-Kairos (final)', 'whatsapp-Kairos', 'whatsapp-new', 'backend', 'public', 'player.html');
      if (!fs.existsSync(playerPath)) {
        return res.status(500).send('Player template not found');
      }

      let html = fs.readFileSync(playerPath, 'utf8');
      if (session) {
        const isFrench = String(session.language).toLowerCase().startsWith('fr');
        html = html
          .replace(/{{SESSION_ID}}/g, sessionId)
          .replace(/{{STUDENT_NAME}}/g, session.name || 'Student')
          .replace(/{{STUDENT_NAME_UPPER}}/g, (session.name || 'Student').toUpperCase())
          .replace(/{{STUDENT_PHONE}}/g, session.phone || '')
          .replace(/{{MODULE_NUMBER}}/g, String(session.module || 1))
          .replace(/{{COURSE_NAME}}/g, session.course)
          .replace(/{{INITIAL_PROGRESS}}/g, String(session.progressSeconds || 0))
          .replace(/{{LANGUAGE}}/g, isFrench ? 'fr' : 'en');
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      return res.send(html);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new VideoController();
