const express = require("express");
const router = express.Router();
const drmController = require("../controllers/drmController");

// Session Handshake Route (Supports GET and POST)
// GET/POST /api/video/session
router.all("/session", (req, res) => drmController.handleHandshake(req, res));

// Course Video Playlist Route
// GET /api/video/playlist
router.get("/playlist", (req, res) => drmController.getPlaylist(req, res));

// Authenticated Video Streaming Route
// GET /api/video/stream/:token
router.get("/stream/:token", (req, res) => drmController.streamVideo(req, res));

// Progress Tracking Route
// POST /api/video/progress
router.post("/progress", (req, res) => drmController.saveProgress(req, res));

// Module Completion & Auto-Advance Route
// POST /api/video/complete
router.post("/complete", (req, res) => drmController.completeModule(req, res));

module.exports = router;

