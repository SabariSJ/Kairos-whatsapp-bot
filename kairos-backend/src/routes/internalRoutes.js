const express = require('express');
const router = express.Router();
const internalStudentController = require('../controllers/internalStudentController');
const notificationService = require('../services/notificationService');
const { requireInternalServiceAuth } = require('../middleware/internalAuthMiddleware');

// All internal routes require service authentication
router.use(requireInternalServiceAuth);

router.get('/students/by-phone', internalStudentController.getStudentByPhone);

// Handle Meta delivery webhook updates forwarded from WhatsApp Bot
router.post('/notifications/status-update', async (req, res, next) => {
  try {
    const { metaMessageId, status, timestamp, details } = req.body;
    if (!metaMessageId || !status) {
      return res.status(400).json({ error: 'metaMessageId and status are required.' });
    }

    const updated = await notificationService.updateDeliveryStatus(metaMessageId, status, details || {});
    return res.status(200).json({
      success: true,
      notification: updated
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
