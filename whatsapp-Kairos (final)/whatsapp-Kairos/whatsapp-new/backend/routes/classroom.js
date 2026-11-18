const express = require("express");
const router = express.Router();
const drmController = require("../controllers/drmController");

// Web Classroom Player Page
// GET /classroom/:sessionId
router.get("/:sessionId", (req, res) => drmController.renderClassroom(req, res));

module.exports = router;

