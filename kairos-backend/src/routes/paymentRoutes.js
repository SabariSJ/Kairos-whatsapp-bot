const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticateStaff } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

// All payment routes require valid staff authentication and 'payment_staff' role
router.use(authenticateStaff);
router.use(requireRole('payment_staff'));

router.get('/', paymentController.getPayments);
router.patch('/:paymentId/status', paymentController.updateStatus);
router.post('/:paymentId/send-whatsapp', paymentController.sendWhatsAppConfirmation);
router.post('/:paymentId/retry-notification', paymentController.retryNotification);

module.exports = router;
