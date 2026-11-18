const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');

// Check Eligibility
// GET/POST /api/video/eligibility
router.get('/eligibility/:phone', (req, res, next) => videoController.checkEligibility(req, res, next));
router.post('/eligibility', (req, res, next) => videoController.checkEligibility(req, res, next));

// Course Video Playlist
// GET /api/video/playlist
router.get('/playlist', (req, res, next) => videoController.getPlaylist(req, res, next));

// Create Secure Playback Session
// POST /api/video/session
router.post('/session', (req, res, next) => videoController.createSession(req, res, next));

// Handshake & Device Lock
// POST /api/video/handshake
router.post('/handshake', (req, res, next) => videoController.handleHandshake(req, res, next));

// Authenticated Video Streaming
// GET /api/video/stream/:token
router.get('/stream/:token', (req, res, next) => videoController.streamVideo(req, res, next));

// Progress Tracking
// POST /api/video/progress
router.post('/progress', (req, res, next) => videoController.saveProgress(req, res, next));

// Module Complete
// POST /api/video/complete
router.post('/complete', (req, res, next) => videoController.completeModule(req, res, next));

module.exports = router;
