const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateStaff } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

// All report routes require valid staff authentication and 'report_staff' role
router.use(authenticateStaff);
router.use(requireRole('report_staff'));

router.get('/summary', reportController.getSummary);
router.get('/records', reportController.getRecords);

module.exports = router;
